import { MockCodexTokenEvent } from "../debug/mock-datasets";
import { AdapterContext, ProviderState } from "../types";
import { clampPercent, classifyStatus } from "../utils/provider-state";
import { formatIsoDate, formatRelativeDuration } from "../utils/time";

export interface CodexTokenEvent {
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

export function buildCodexStateFromTokenEvent(
  event: CodexTokenEvent | MockCodexTokenEvent,
  context: AdapterContext,
  extraDetailLines: string[],
  now = new Date(),
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
    windowType: formatCodexWindowLabel(primary.window_minutes),
    resetAt,
    timeToReset: resetDate ? formatRelativeDuration(resetDate, now) : undefined,
    sourceType: "local",
    confidence: "medium",
    freshness: formatIsoDate(event.timestamp),
    status,
    detailLines: [
      `Primary window: ${usedPercent.toFixed(1)}% used`,
      secondary?.used_percent !== undefined
        ? `Secondary window: ${clampPercent(secondary.used_percent).toFixed(1)}% used (${formatCodexWindowLabel(secondary.window_minutes)})`
        : "No secondary window found",
      ...extraDetailLines,
    ],
  };
}

export function formatCodexWindowLabel(windowMinutes?: number): string | undefined {
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
