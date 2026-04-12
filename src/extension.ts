import * as vscode from "vscode";

import { ProviderService } from "./services/provider-service";
import {
  RegistryService,
  SUPPORTED_PROVIDERS,
} from "./services/registry-service";
import { ProviderId, ProviderState } from "./types";
import { OverviewIconUris, renderOverviewHtml } from "./ui/overview";
import { pathExists } from "./utils/fs";
import { expandHome } from "./utils/paths";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const providerService = new ProviderService();
  const registryService = new RegistryService(context);
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const overviewPanel = createOverviewPanel(context);

  context.subscriptions.push(statusBarItem, overviewPanel);

  const refresh = async (): Promise<void> => {
    const configuration = vscode.workspace.getConfiguration("agentBudgetMonitor");
    const debugUseMockData = configuration.get<boolean>("debug.useMockData", false);
    const debugDatasetName = configuration.get<string>("debug.dataset", "mixed");
    const registeredProviderIds = registryService.getRegisteredProviderIds();
    const states = await providerService.loadAll(registeredProviderIds);
    renderStatusBar(statusBarItem, states, registeredProviderIds.length, debugUseMockData, debugDatasetName);
    overviewPanel.update(states, debugUseMockData ? debugDatasetName : undefined);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("agentBudgetMonitor.refresh", refresh),
    vscode.commands.registerCommand("agentBudgetMonitor.showOverview", () => overviewPanel.show()),
    vscode.commands.registerCommand("agentBudgetMonitor.addAgent", async () => {
      const changed = await addAgentFlow(registryService);
      if (changed) {
        await refresh();
      }
    }),
    vscode.commands.registerCommand("agentBudgetMonitor.removeAgent", async () => {
      const changed = await removeAgentFlow(registryService);
      if (changed) {
        await refresh();
      }
    }),
    vscode.commands.registerCommand("agentBudgetMonitor.manageAgents", async () => {
      await manageAgentsFlow(registryService, refresh, overviewPanel);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("agentBudgetMonitor")) {
        void refresh();
      }
    }),
  );

  statusBarItem.command = "agentBudgetMonitor.manageAgents";
  statusBarItem.show();
  void refresh();

  const configuration = vscode.workspace.getConfiguration("agentBudgetMonitor");
  const refreshIntervalMs = Math.max(5, configuration.get<number>("refreshIntervalSeconds", 30)) * 1000;
  const timer = setInterval(() => void refresh(), refreshIntervalMs);
  context.subscriptions.push(new vscode.Disposable(() => clearInterval(timer)));
}

export function deactivate(): void {}

async function manageAgentsFlow(
  registryService: RegistryService,
  refresh: () => Promise<void>,
  overviewPanel: OverviewPanelController,
): Promise<void> {
  const registered = registryService.getRegisteredDescriptors();
  const debugUseMockData = vscode.workspace
    .getConfiguration("agentBudgetMonitor")
    .get<boolean>("debug.useMockData", false);
  const items: Array<vscode.QuickPickItem & { action: "add" | "remove" | "overview" | "refresh" }> = [
    {
      label: "Add Agent",
      description: "Register a supported provider",
      action: "add",
    },
    {
      label: "Refresh",
      description: "Reload data from registered providers",
      action: "refresh",
    },
  ];

  if (registered.length > 0 || debugUseMockData) {
    items.push(
      {
        label: "Show Overview",
        description: "Open the overview panel",
        action: "overview",
      },
      {
        label: "Remove Agent",
        description: "Unregister a provider",
        action: "remove",
      },
    );
  }

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Manage Agent Budget Monitor",
  });

  if (!selected) {
    return;
  }

  if (selected.action === "add") {
    const changed = await addAgentFlow(registryService);
    if (changed) {
      await refresh();
    }
    return;
  }

  if (selected.action === "remove") {
    const changed = await removeAgentFlow(registryService);
    if (changed) {
      await refresh();
    }
    return;
  }

  if (selected.action === "overview") {
    overviewPanel.show();
    return;
  }

  await refresh();
}

async function addAgentFlow(registryService: RegistryService): Promise<boolean> {
  const available = registryService.getAvailableDescriptors();
  if (available.length === 0) {
    void vscode.window.showInformationMessage("All supported agents are already registered.");
    return false;
  }

  const selected = await vscode.window.showQuickPick(
    available.map((provider) => ({
      label: provider.label,
      description: provider.description,
      providerId: provider.id,
    })),
    {
      placeHolder: "Select an agent to register",
    },
  );

  if (!selected) {
    return false;
  }

  const success = await runRegistration(selected.providerId);
  if (!success) {
    return false;
  }

  await registryService.register(selected.providerId);
  void vscode.window.showInformationMessage(`${providerLabel(selected.providerId)} registered.`);
  return true;
}

async function removeAgentFlow(registryService: RegistryService): Promise<boolean> {
  const registered = registryService.getRegisteredDescriptors();
  if (registered.length === 0) {
    void vscode.window.showInformationMessage("No registered agents to remove.");
    return false;
  }

  const selected = await vscode.window.showQuickPick(
    registered.map((provider) => ({
      label: provider.label,
      description: provider.description,
      providerId: provider.id,
    })),
    {
      placeHolder: "Select an agent to remove",
    },
  );

  if (!selected) {
    return false;
  }

  await registryService.unregister(selected.providerId);
  void vscode.window.showInformationMessage(`${providerLabel(selected.providerId)} removed.`);
  return true;
}

async function runRegistration(providerId: ProviderId): Promise<boolean> {
  switch (providerId) {
    case "codex":
      return registerCodex();
    case "claude":
      return registerClaude();
    case "copilot":
      return registerCopilot();
  }
}

async function registerCodex(): Promise<boolean> {
  const configuration = vscode.workspace.getConfiguration("agentBudgetMonitor");
  const sessionRoot = expandHome(
    configuration.get<string>("providers.codex.sessionRoot", "~/.codex/sessions"),
  );
  const exists = await pathExists(sessionRoot);
  if (exists) {
    return true;
  }

  const choice = await vscode.window.showWarningMessage(
    `Codex session root was not found at ${sessionRoot}. Register anyway?`,
    "Register Anyway",
    "Cancel",
  );
  return choice === "Register Anyway";
}

async function registerClaude(): Promise<boolean> {
  const configuration = vscode.workspace.getConfiguration("agentBudgetMonitor");
  const plan = await vscode.window.showQuickPick(
    [
      {
        label: "Max5",
        description: "Recommended default for most users",
        value: "max5",
      },
      {
        label: "Pro",
        description: "Lower session token limit",
        value: "pro",
      },
      {
        label: "Max20",
        description: "Higher session token limit",
        value: "max20",
      },
      {
        label: "Custom",
        description: "Set your own token limit",
        value: "custom",
      },
    ],
    {
      placeHolder: "Select a Claude plan for local usage calculations",
    },
  );

  if (!plan) {
    return false;
  }

  await configuration.update("providers.claude.plan", plan.value, vscode.ConfigurationTarget.Global);
  if (plan.value === "custom") {
    const customValue = await vscode.window.showInputBox({
      prompt: "Enter Claude custom token limit",
      placeHolder: "44000",
      validateInput: (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return "Enter a positive number.";
        }
        return undefined;
      },
    });

    if (!customValue) {
      return false;
    }

    await configuration.update(
      "providers.claude.customTokenLimit",
      Number(customValue),
      vscode.ConfigurationTarget.Global,
    );
  }

  const roots = configuration
    .get<string[]>("providers.claude.transcriptRoots", [
      "~/.claude/transcripts",
      "~/.claude/projects",
      "~/.config/claude/projects",
    ])
    .map(expandHome);

  const existingRoots: string[] = [];
  for (const root of roots) {
    if (await pathExists(root)) {
      existingRoots.push(root);
    }
  }

  if (existingRoots.length > 0) {
    const onlyTranscriptRoots = existingRoots.every((root) => root.endsWith("/transcripts"));
    if (onlyTranscriptRoots) {
      const choice = await vscode.window.showWarningMessage(
        "Claude transcript data was found, but this layout may not expose usage totals. Register anyway?",
        "Register Anyway",
        "Cancel",
      );
      return choice === "Register Anyway";
    }

    return true;
  }

  const choice = await vscode.window.showWarningMessage(
    "No Claude local data directory was found. Register anyway?",
    "Register Anyway",
    "Cancel",
  );
  return choice === "Register Anyway";
}

async function registerCopilot(): Promise<boolean> {
  try {
    const session = await vscode.authentication.getSession("github", ["user:email"], {
      createIfNone: true,
    });

    if (!session) {
      void vscode.window.showErrorMessage("GitHub authentication was not completed.");
      return false;
    }

    return true;
  } catch (error) {
    void vscode.window.showErrorMessage(
      `GitHub authentication failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

function renderStatusBar(
  statusBarItem: vscode.StatusBarItem,
  states: ProviderState[],
  registeredCount: number,
  debugUseMockData: boolean,
  debugDatasetName: string,
): void {
  if (!debugUseMockData && registeredCount === 0) {
    statusBarItem.text = "$(plug) add agent";
    statusBarItem.tooltip =
      "Agent Budget Monitor: no agents registered.\nClick to add or manage agents.";
    return;
  }

  if (states.length === 0) {
    statusBarItem.text = debugUseMockData ? "$(beaker) empty" : "$(pulse) no data";
    statusBarItem.tooltip = debugUseMockData
      ? `Agent Budget Monitor: debug dataset ${debugDatasetName} produced no visible provider state.`
      : "Agent Budget Monitor: registered agents have no data yet.";
    return;
  }

  const prioritizedStates = prioritizeStatusBarStates(states);
  const visibleStates = prioritizedStates.length > 3 ? prioritizedStates.slice(0, 2) : prioritizedStates;
  const hiddenCount = prioritizedStates.length - visibleStates.length;

  statusBarItem.text = [
    visibleStates.map(renderStatusBarMetric).join(" "),
    hiddenCount > 0 ? `+${hiddenCount}` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  statusBarItem.tooltip = buildStatusBarTooltip(states, debugUseMockData, debugDatasetName);
  statusBarItem.accessibilityInformation = {
    label: [
      prioritizedStates.map(renderAccessibleStatusMetric).join(", "),
      hiddenCount > 0 ? `${hiddenCount} more provider${hiddenCount === 1 ? "" : "s"} hidden in status bar` : undefined,
    ]
      .filter((value): value is string => Boolean(value))
      .join(". "),
  };
}

function renderStatusBarMetric(state: ProviderState): string {
  const icon = `$(${statusBarIconId(state.providerId)})`;
  const value = getPrimaryStatusPercent(state);
  return value !== undefined ? `${icon}${value.toFixed(0)}%` : `${icon}--`;
}

function renderAccessibleStatusMetric(state: ProviderState): string {
  const value = getPrimaryStatusPercent(state);
  return value !== undefined
    ? `${providerLabel(state.providerId)} ${value.toFixed(0)} percent`
    : `${providerLabel(state.providerId)} no percentage data`;
}

function getPrimaryStatusPercent(state: ProviderState): number | undefined {
  if (typeof state.leftPercent === "number") {
    return clampStatusPercent(state.leftPercent);
  }

  if (typeof state.usedPercent === "number") {
    return clampStatusPercent(state.usedPercent);
  }

  return undefined;
}

function clampStatusPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function prioritizeStatusBarStates(states: ProviderState[]): ProviderState[] {
  return states
    .map((state, index) => ({ state, index }))
    .sort((left, right) => {
      const priorityDiff = getStatusBarPriority(left.state) - getStatusBarPriority(right.state);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const remainingDiff = getStatusBarRemainingPercent(left.state) - getStatusBarRemainingPercent(right.state);
      if (remainingDiff !== 0) {
        return remainingDiff;
      }

      return left.index - right.index;
    })
    .map(({ state }) => state);
}

function getStatusBarPriority(state: ProviderState): number {
  switch (state.status) {
    case "critical":
      return 0;
    case "warning":
      return 1;
    default:
      return 2;
  }
}

function getStatusBarRemainingPercent(state: ProviderState): number {
  if (typeof state.leftPercent === "number") {
    return clampStatusPercent(state.leftPercent);
  }

  if (typeof state.usedPercent === "number") {
    return clampStatusPercent(100 - state.usedPercent);
  }

  return Number.POSITIVE_INFINITY;
}

function statusBarIconId(providerId: ProviderState["providerId"]): string {
  switch (providerId) {
    case "codex":
      return "agent-budget-codex";
    case "claude":
      return "agent-budget-claude";
    case "copilot":
      return "agent-budget-copilot";
  }
}

function buildStatusBarTooltip(
  states: ProviderState[],
  debugUseMockData: boolean,
  debugDatasetName: string,
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString(undefined, true);
  const sections = states.map(renderStatusTooltipSection);

  markdown.appendMarkdown("**Agent Budget Monitor**");
  if (debugUseMockData) {
    markdown.appendMarkdown(`  \nDebug dataset: \`${debugDatasetName}\``);
  }

  if (sections.length > 0) {
    markdown.appendMarkdown(`\n\n${sections.join("\n\n---\n\n")}`);
  }

  return markdown;
}

function renderStatusTooltipSection(state: ProviderState): string {
  const percentages = getTooltipPercentages(state);
  const used = percentages.used;
  const left = percentages.left;
  const ring = getTooltipRingGlyph(used, left);
  const headline = left !== undefined
    ? `${formatTooltipPercent(left)}% left`
    : used !== undefined
      ? `${formatTooltipPercent(used)}% used`
      : state.status;
  const metrics = [
    used !== undefined ? `used \`${formatTooltipPercent(used)}%\`` : undefined,
    left !== undefined ? `left \`${formatTooltipPercent(left)}%\`` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  const meta = [
    state.timeToReset ? `reset \`${escapeMarkdown(state.timeToReset)}\`` : undefined,
    `source \`${escapeMarkdown(state.sourceType)}\``,
    `confidence \`${escapeMarkdown(state.confidence)}\``,
    state.windowType ? `window \`${escapeMarkdown(state.windowType)}\`` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return [
    `**$(${statusBarIconId(state.providerId)}) ${escapeMarkdown(state.providerLabel)}**`,
    `${ring} \`${escapeMarkdown(headline)}\` · \`${escapeMarkdown(state.status)}\``,
    metrics || `${ring} \`no percentage data\``,
    meta,
  ].filter((value) => value.length > 0).join("  \n");
}

function getTooltipPercentages(state: ProviderState): { used?: number; left?: number } {
  const used = normalizeTooltipPercent(state.usedPercent);
  const left = normalizeTooltipPercent(state.leftPercent);

  if (used !== undefined && left !== undefined) {
    return { used, left };
  }

  if (used !== undefined) {
    return { used, left: normalizeTooltipPercent(100 - used) };
  }

  if (left !== undefined) {
    return { used: normalizeTooltipPercent(100 - left), left };
  }

  return {};
}

function normalizeTooltipPercent(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(100, value));
}

function formatTooltipPercent(value: number): string {
  return value.toFixed(0);
}

function getTooltipRingGlyph(usedPercent?: number, leftPercent?: number): string {
  const ratio = usedPercent ?? (leftPercent !== undefined ? 100 - leftPercent : undefined);
  if (ratio === undefined) {
    return "○";
  }

  if (ratio < 12.5) {
    return "○";
  }

  if (ratio < 37.5) {
    return "◔";
  }

  if (ratio < 62.5) {
    return "◑";
  }

  if (ratio < 87.5) {
    return "◕";
  }

  return "●";
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("`", "\\`");
}

function providerLabel(providerId: ProviderId): string {
  return SUPPORTED_PROVIDERS.find((provider) => provider.id === providerId)?.label ?? providerId;
}

function createOverviewPanel(context: vscode.ExtensionContext): OverviewPanelController {
  return new OverviewPanelController(context);
}

class OverviewPanelController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private latestStates: ProviderState[] = [];
  private latestDebugDatasetName: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "agentBudgetMonitor.overview",
      "Agent Budget Monitor",
      vscode.ViewColumn.Beside,
      {
        enableScripts: false,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "assets")],
      },
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      null,
      this.context.subscriptions,
    );

    this.panel.webview.html = renderOverviewHtml(
      this.latestStates,
      getOverviewIconUris(this.panel.webview, this.context.extensionUri),
      this.latestDebugDatasetName,
    );
  }

  update(states: ProviderState[], debugDatasetName?: string): void {
    this.latestStates = states;
    this.latestDebugDatasetName = debugDatasetName;
    if (this.panel) {
      this.panel.webview.html = renderOverviewHtml(
        states,
        getOverviewIconUris(this.panel.webview, this.context.extensionUri),
        debugDatasetName,
      );
    }
  }

  dispose(): void {
    this.panel?.dispose();
  }
}

function getOverviewIconUris(webview: vscode.Webview, extensionUri: vscode.Uri): OverviewIconUris {
  return {
    codex: webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "assets", "icons", "codex-openai-blossom.svg"),
    ).toString(),
    claude: webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "assets", "icons", "anthropic.svg"),
    ).toString(),
    copilot: webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "assets", "icons", "github-copilot.svg"),
    ).toString(),
  };
}
