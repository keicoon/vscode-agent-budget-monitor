export type ProviderId = "codex" | "claude" | "copilot";
export type SourceType = "official" | "internal" | "local" | "estimated";
export type Confidence = "high" | "medium" | "low";
export type ProviderStatus = "ok" | "warning" | "critical" | "unknown" | "stale" | "error";

export interface ProviderState {
  providerId: ProviderId;
  providerLabel: string;
  usedPercent?: number;
  leftPercent?: number;
  windowType?: string;
  resetAt?: string;
  timeToReset?: string;
  sourceType: SourceType;
  confidence: Confidence;
  freshness?: string;
  status: ProviderStatus;
  detailLines: string[];
}

export interface Thresholds {
  warningPercent: number;
  criticalPercent: number;
}

export interface AdapterContext {
  thresholds: Thresholds;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly label: string;
  load(context: AdapterContext): Promise<ProviderState>;
}
