import * as vscode from "vscode";

import { ClaudeAdapter } from "../providers/claude";
import { CodexAdapter } from "../providers/codex";
import { CopilotAdapter } from "../providers/copilot";
import { AdapterContext, ProviderAdapter, ProviderId, ProviderState } from "../types";

export class ProviderService {
  constructor() {}

  async loadAll(registeredProviderIds: ProviderId[]): Promise<ProviderState[]> {
    const configuration = vscode.workspace.getConfiguration("agentBudgetMonitor");
    const debugUseMockData = configuration.get<boolean>("debug.useMockData", false);
    const targetProviderIds = debugUseMockData
      ? (["codex", "claude", "copilot"] satisfies ProviderId[])
      : registeredProviderIds;

    if (targetProviderIds.length === 0) {
      return [];
    }

    const context: AdapterContext = {
      thresholds: {
        warningPercent: configuration.get<number>("warningThresholdPercent", 70),
        criticalPercent: configuration.get<number>("criticalThresholdPercent", 90),
      },
    };

    const adapters: ProviderAdapter[] = [
      new CodexAdapter(configuration),
      new ClaudeAdapter(configuration),
      new CopilotAdapter(configuration),
    ];

    const adapterMap = new Map(adapters.map((adapter) => [adapter.id, adapter] as const));
    const enabledAdapters = targetProviderIds
      .map((id) => adapterMap.get(id))
      .filter((adapter): adapter is ProviderAdapter => Boolean(adapter))
      .filter((adapter) => configuration.get<boolean>(`providers.${adapter.id}.enabled`, true));

    return Promise.all(
      enabledAdapters.map(async (adapter) => {
        try {
          return await adapter.load(context);
        } catch (error) {
          return {
            providerId: adapter.id,
            providerLabel: adapter.label,
            sourceType: "estimated",
            confidence: "low",
            status: "error",
            detailLines: [error instanceof Error ? error.message : String(error)],
          } satisfies ProviderState;
        }
      }),
    );
  }
}
