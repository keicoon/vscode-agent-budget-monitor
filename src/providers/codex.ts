import * as fs from "fs/promises";
import * as vscode from "vscode";

import { getMockDataset, getMockDatasetName, MockCodexTokenEvent } from "../debug/mock-datasets";
import { AdapterContext, ProviderAdapter, ProviderState } from "../types";
import { listRecentFiles, pathExists } from "../utils/fs";
import { expandHome } from "../utils/paths";
import { clampPercent, classifyStatus } from "../utils/provider-state";
import { formatIsoDate, formatRelativeDuration } from "../utils/time";

interface CodexTokenEvent {
  timestamp?: string;
  type?: string;
  payload?: {
    type?: string;
    rate_limits?: {
      primary?: {
        used_percent?: number;
        window_minutes?: number;
        resets_at?: number;
      };
      secondary?: {
        used_percent?: number;
        window_minutes?: number;
        resets_at?: number;
      };
      plan_type?: string;
    };
  };
}

export class CodexAdapter implements ProviderAdapter {
  readonly id = "codex" as const;
  readonly label = "Codex";

  constructor(private readonly configuration: vscode.WorkspaceConfiguration) {}

  async load(context: AdapterContext): Promise<ProviderState> {
    if (this.configuration.get<boolean>("debug.useMockData", false)) {
      const dataset = getMockDataset(getMockDatasetName(this.configuration));
      const mockState = buildStateFromTokenEvent(dataset.codex.event, context, [
        `Debug dataset: ${dataset.name}`,
        `Source fixture: ${dataset.codex.sourceFile}`,
      ]);

      if (mockState) {
        return mockState;
      }

      return {
        providerId: this.id,
        providerLabel: this.label,
        sourceType: "local",
        confidence: "low",
        status: "unknown",
        detailLines: [`Debug dataset ${dataset.name} does not contain a valid Codex token_count event.`],
      };
    }

    const root = expandHome(this.configuration.get<string>("providers.codex.sessionRoot", "~/.codex/sessions"));
    const exists = await pathExists(root);

    if (!exists) {
      return {
        providerId: this.id,
        providerLabel: this.label,
        sourceType: "local",
        confidence: "medium",
        status: "unknown",
        detailLines: [`Session root not found: ${root}`],
      };
    }

    const recentFiles = await listRecentFiles(root, ".jsonl", 40);
    for (const match of recentFiles) {
      const state = await this.tryParseFile(match.filePath, context);
      if (state) {
        return state;
      }
    }

    return {
      providerId: this.id,
      providerLabel: this.label,
      sourceType: "local",
      confidence: "medium",
      status: "unknown",
      detailLines: ["No recent token_count events were found in Codex session files."],
    };
  }

  private async tryParseFile(filePath: string, context: AdapterContext): Promise<ProviderState | undefined> {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split("\n").reverse();

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      let parsed: CodexTokenEvent;
      try {
        parsed = JSON.parse(line) as CodexTokenEvent;
      } catch {
        continue;
      }

      const state = buildStateFromTokenEvent(parsed, context, [`Source file: ${filePath}`]);
      if (state) {
        return state;
      }
    }

    return undefined;
  }
}

function buildStateFromTokenEvent(
  event: CodexTokenEvent | MockCodexTokenEvent,
  context: AdapterContext,
  extraDetailLines: string[],
): ProviderState | undefined {
  const payload = event.payload;
  if (event.type !== "event_msg" || payload?.type !== "token_count") {
    return undefined;
  }

  const primary = payload.rate_limits?.primary;
  if (!primary || typeof primary.used_percent !== "number") {
    return undefined;
  }

  const usedPercent = clampPercent(primary.used_percent);
  const leftPercent = clampPercent(100 - usedPercent);
  const resetAt = primary.resets_at ? new Date(primary.resets_at * 1000).toISOString() : undefined;
  const resetDate = primary.resets_at ? new Date(primary.resets_at * 1000) : undefined;
  const secondary = payload.rate_limits?.secondary;
  const status = classifyStatus(usedPercent, context.thresholds.warningPercent, context.thresholds.criticalPercent);

  return {
    providerId: "codex",
    providerLabel: "Codex",
    usedPercent,
    leftPercent,
    windowType: formatWindowLabel(primary.window_minutes),
    resetAt,
    timeToReset: resetDate ? formatRelativeDuration(resetDate) : undefined,
    sourceType: "local",
    confidence: "medium",
    freshness: formatIsoDate(event.timestamp),
    status,
    detailLines: [
      `Primary window: ${usedPercent.toFixed(1)}% used`,
      secondary?.used_percent !== undefined
        ? `Secondary window: ${clampPercent(secondary.used_percent).toFixed(1)}% used (${formatWindowLabel(secondary.window_minutes)})`
        : "No secondary window found",
      ...extraDetailLines,
    ],
  };
}

function formatWindowLabel(windowMinutes?: number): string | undefined {
  if (!windowMinutes || windowMinutes <= 0) {
    return undefined;
  }

  if (windowMinutes % 10080 === 0) {
    return `${windowMinutes / 10080}w`;
  }

  if (windowMinutes % 1440 === 0) {
    return `${windowMinutes / 1440}d`;
  }

  if (windowMinutes % 60 === 0) {
    return `${windowMinutes / 60}h`;
  }

  return `${windowMinutes}m`;
}
