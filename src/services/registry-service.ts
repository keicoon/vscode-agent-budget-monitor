import * as vscode from "vscode";

import { ProviderId } from "../types";

const REGISTRY_KEY = "agentBudgetMonitor.registeredProviders";

export interface SupportedProviderDescriptor {
  id: ProviderId;
  label: string;
  description: string;
}

export const SUPPORTED_PROVIDERS: SupportedProviderDescriptor[] = [
  {
    id: "codex",
    label: "Codex",
    description: "OpenAI Codex local sessions and rate windows",
  },
  {
    id: "claude",
    label: "Claude Code",
    description: "Claude local session or transcript data",
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    description: "GitHub auth plus Copilot premium requests",
  },
];

export class RegistryService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getRegisteredProviderIds(): ProviderId[] {
    const raw = this.context.globalState.get<ProviderId[]>(REGISTRY_KEY, []);
    return raw.filter((value, index, array) => array.indexOf(value) === index);
  }

  async register(providerId: ProviderId): Promise<void> {
    const next = [...this.getRegisteredProviderIds()];
    if (!next.includes(providerId)) {
      next.push(providerId);
      await this.context.globalState.update(REGISTRY_KEY, next);
    }
  }

  async unregister(providerId: ProviderId): Promise<void> {
    const next = this.getRegisteredProviderIds().filter((id) => id !== providerId);
    await this.context.globalState.update(REGISTRY_KEY, next);
  }

  isRegistered(providerId: ProviderId): boolean {
    return this.getRegisteredProviderIds().includes(providerId);
  }

  getRegisteredDescriptors(): SupportedProviderDescriptor[] {
    const ids = this.getRegisteredProviderIds();
    return ids
      .map((id) => SUPPORTED_PROVIDERS.find((provider) => provider.id === id))
      .filter((provider): provider is SupportedProviderDescriptor => Boolean(provider));
  }

  getAvailableDescriptors(): SupportedProviderDescriptor[] {
    const registered = new Set(this.getRegisteredProviderIds());
    return SUPPORTED_PROVIDERS.filter((provider) => !registered.has(provider.id));
  }
}
