import { ProviderStatus } from "../types";

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function classifyStatus(
  usedPercent: number,
  warningPercent: number,
  criticalPercent: number,
): ProviderStatus {
  if (usedPercent >= criticalPercent) {
    return "critical";
  }

  if (usedPercent >= warningPercent) {
    return "warning";
  }

  return "ok";
}
