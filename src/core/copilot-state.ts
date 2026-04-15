import { MockCopilotApiResponse } from "../debug/mock-datasets";
import { AdapterContext, ProviderState } from "../types";
import { clampPercent, classifyStatus } from "../utils/provider-state";
import { formatIsoDate, formatRelativeDuration } from "../utils/time";

export interface CopilotQuotaSnapshot {
  entitlement: number;
  percent_remaining?: number;
  quota_remaining: number;
  unlimited?: boolean;
  timestamp_utc?: string;
}

export interface CopilotApiResponse {
  copilot_plan?: string;
  quota_reset_date?: string;
  quota_reset_date_utc?: string;
  quota_snapshots?: {
    premium_interactions?: CopilotQuotaSnapshot;
  };
}

export function buildCopilotStateFromResponse(
  data: CopilotApiResponse | MockCopilotApiResponse,
  context: AdapterContext,
  extraDetailLines: string[],
  now = new Date(),
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
        "Premium interactions quota is unavailable for this account.",
        "This usually means the account is unlimited or the internal API did not expose quota fields.",
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
    timeToReset: resetDate ? formatRelativeDuration(resetDate, now) : undefined,
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
