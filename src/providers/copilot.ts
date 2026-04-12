import * as vscode from "vscode";

import { getMockDataset, getMockDatasetName, MockCopilotApiResponse } from "../debug/mock-datasets";
import { AdapterContext, ProviderAdapter, ProviderState } from "../types";
import { clampPercent, classifyStatus } from "../utils/provider-state";
import { formatIsoDate, formatRelativeDuration } from "../utils/time";

interface CopilotQuotaSnapshot {
  entitlement: number;
  percent_remaining?: number;
  quota_remaining: number;
  unlimited?: boolean;
  timestamp_utc?: string;
}

interface CopilotApiResponse {
  copilot_plan?: string;
  quota_reset_date?: string;
  quota_reset_date_utc?: string;
  quota_snapshots?: {
    premium_interactions?: CopilotQuotaSnapshot;
  };
}

export class CopilotAdapter implements ProviderAdapter {
  readonly id = "copilot" as const;
  readonly label = "Copilot";

  constructor(private readonly configuration: vscode.WorkspaceConfiguration) {}

  async load(context: AdapterContext): Promise<ProviderState> {
    try {
      if (this.configuration.get<boolean>("debug.useMockData", false)) {
        const dataset = getMockDataset(getMockDatasetName(this.configuration));
        return buildStateFromCopilotResponse(dataset.copilot.response, context, [
          `Debug dataset: ${dataset.name}`,
          "Source: mock copilot_internal/user",
        ]);
      }

      const session = await vscode.authentication.getSession("github", ["user:email"], {
        createIfNone: false,
      });

      if (!session) {
        return {
          providerId: this.id,
          providerLabel: this.label,
          sourceType: "internal",
          confidence: "low",
          status: "unknown",
          detailLines: [
            "GitHub authentication session was not available in VS Code.",
            "Copilot usage requires an existing GitHub session.",
          ],
        };
      }

      const response = await fetch("https://api.github.com/copilot_internal/user", {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "User-Agent": "Agent-Budget-Monitor",
        },
      });

      if (!response.ok) {
        return {
          providerId: this.id,
          providerLabel: this.label,
          sourceType: "internal",
          confidence: "low",
          status: "error",
          detailLines: [`Copilot internal API request failed with ${response.status}.`],
        };
      }

      const data = (await response.json()) as CopilotApiResponse;
      return buildStateFromCopilotResponse(data, context, ["Source: GitHub internal Copilot API"]);
    } catch (error) {
      return {
        providerId: this.id,
        providerLabel: this.label,
        sourceType: "internal",
        confidence: "low",
        status: "error",
        detailLines: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
}

function buildStateFromCopilotResponse(
  data: CopilotApiResponse | MockCopilotApiResponse,
  context: AdapterContext,
  extraDetailLines: string[],
): ProviderState {
  const premium = data.quota_snapshots?.premium_interactions;
  if (!premium || premium.entitlement === 0 || premium.unlimited) {
    return {
      providerId: "copilot",
      providerLabel: "Copilot",
      sourceType: "internal",
      confidence: "low",
      status: "unknown",
      detailLines: [
        "Premium interactions quota was unavailable or unlimited for this account.",
        ...extraDetailLines,
      ],
    };
  }

  const usedPercent =
    premium.percent_remaining !== undefined && !Number.isNaN(premium.percent_remaining)
      ? clampPercent(100 - premium.percent_remaining)
      : clampPercent(((premium.entitlement - premium.quota_remaining) / premium.entitlement) * 100);
  const leftPercent = clampPercent(100 - usedPercent);
  const resetAt = formatIsoDate(data.quota_reset_date_utc ?? data.quota_reset_date);
  const resetDate = resetAt ? new Date(resetAt) : undefined;
  const status = classifyStatus(
    usedPercent,
    context.thresholds.warningPercent,
    context.thresholds.criticalPercent,
  );

  return {
    providerId: "copilot",
    providerLabel: "Copilot",
    usedPercent,
    leftPercent,
    windowType: "monthly premium",
    resetAt,
    timeToReset: resetDate ? formatRelativeDuration(resetDate) : undefined,
    sourceType: "internal",
    confidence: "medium",
    freshness: formatIsoDate(premium.timestamp_utc),
    status,
    detailLines: [
      data.copilot_plan ? `Plan: ${data.copilot_plan}` : "Plan: unknown",
      `Premium requests: ${premium.entitlement - premium.quota_remaining} / ${premium.entitlement}`,
      ...extraDetailLines,
    ],
  };
}
