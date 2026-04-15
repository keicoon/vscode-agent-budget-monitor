import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

import {
  buildClaudeStateFromMessages,
  ClaudeMessage,
  ClaudePlan,
  ClaudePlanConfig,
  toClaudeMessage,
} from "../core/claude-state";
import { getMockDataset, getMockDatasetName } from "../debug/mock-datasets";
import { AdapterContext, ProviderAdapter, ProviderState } from "../types";
import { listRecentFiles, pathExists } from "../utils/fs";
import { expandHome } from "../utils/paths";

const PLAN_LIMITS: Record<Exclude<ClaudePlan, "custom">, ClaudePlanConfig> = {
  pro: {
    tokenLimit: 19_000,
    costLimit: 18,
    messageLimit: 250,
  },
  max5: {
    tokenLimit: 88_000,
    costLimit: 35,
    messageLimit: 1_000,
  },
  max20: {
    tokenLimit: 220_000,
    costLimit: 140,
    messageLimit: 2_000,
  },
};

export class ClaudeAdapter implements ProviderAdapter {
  readonly id = "claude" as const;
  readonly label = "Claude";

  constructor(private readonly configuration: vscode.WorkspaceConfiguration) {}

  async load(context: AdapterContext): Promise<ProviderState> {
    if (this.configuration.get<boolean>("debug.useMockData", false)) {
      const dataset = getMockDataset(getMockDatasetName(this.configuration));
      const messages = dataset.claude.records
        .map((record, index) => toClaudeMessage(record.entry, record.projectName, `mock:${index}`))
        .filter((message): message is ClaudeMessage => Boolean(message));

      const mockState = buildClaudeStateFromMessages(
        messages,
        context,
        getClaudePlanConfig(this.configuration),
        [`Debug dataset: ${dataset.name}`, `Projects: ${Array.from(new Set(dataset.claude.records.map((record) => record.projectName))).join(", ") || "none"}`],
      );

      if (mockState) {
        return mockState;
      }

      return {
        providerId: this.id,
        providerLabel: this.label,
        sourceType: "local",
        confidence: "low",
        status: "unknown",
        detailLines: [
          `Debug dataset ${dataset.name} does not contain an active Claude usage session.`,
          "Use a dataset with recent Claude usage records or adjust the fixture timestamps.",
        ],
      };
    }

    const roots = this.configuration
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

    if (existingRoots.length === 0) {
      return {
        providerId: this.id,
        providerLabel: this.label,
        sourceType: "local",
        confidence: "low",
        status: "unknown",
        detailLines: [
          "No supported Claude local data directory was found.",
          "Run Claude Code once or add custom roots in agentBudgetMonitor.providers.claude.transcriptRoots.",
        ],
      };
    }

    const projectRoots = existingRoots.filter((root) => path.basename(root) === "projects");
    const transcriptRoots = existingRoots.filter((root) => path.basename(root) === "transcripts");
    const messages: ClaudeMessage[] = [];

    for (const root of projectRoots) {
      const recentFiles = await listRecentFiles(root, ".jsonl", 80);
      for (const match of recentFiles) {
        const parsedMessages = await parseClaudeProjectFile(match.filePath);
        messages.push(...parsedMessages);
      }
    }

    if (messages.length > 0) {
      const state = buildClaudeStateFromMessages(
        messages,
        context,
        getClaudePlanConfig(this.configuration),
        [`Project roots: ${projectRoots.join(", ")}`],
      );

      if (state) {
        return state;
      }
    }

    const details = [
      projectRoots.length > 0
        ? "No active Claude session with usage fields was found."
        : "No project-format Claude usage roots were found.",
      `Detected Claude roots: ${existingRoots.join(", ")}`,
    ];

    if (transcriptRoots.length > 0) {
      details.push(`Transcript roots: ${transcriptRoots.join(", ")}`);
      details.push("Current transcript files on this machine do not expose direct usage totals.");
      details.push("If this persists, keep Claude registered for overview only or point the extension at project-format logs.");
    }

    return {
      providerId: this.id,
      providerLabel: this.label,
      sourceType: "local",
      confidence: "low",
      status: "unknown",
      detailLines: details,
    };
  }
}

function getClaudePlanConfig(configuration: vscode.WorkspaceConfiguration): {
  planName: ClaudePlan;
  plan: ClaudePlanConfig;
} {
  const planName = configuration.get<ClaudePlan>("providers.claude.plan", "max5");
  if (planName === "custom") {
    return {
      planName,
      plan: {
        tokenLimit: configuration.get<number>("providers.claude.customTokenLimit", 44_000),
        costLimit: 50,
        messageLimit: 250,
      },
    };
  }

  return {
    planName,
    plan: PLAN_LIMITS[planName],
  };
}

async function parseClaudeProjectFile(filePath: string): Promise<ClaudeMessage[]> {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split("\n");
  const projectName = path.basename(path.dirname(filePath));
  const messages: ClaudeMessage[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const message = toClaudeMessage(parsed, projectName, `${filePath}:${messages.length}`);
    if (message) {
      messages.push(message);
    }
  }

  return messages;
}
