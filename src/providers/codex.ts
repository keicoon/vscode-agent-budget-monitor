import * as fs from "fs/promises";
import * as vscode from "vscode";

import { buildCodexStateFromTokenEvent, CodexTokenEvent } from "../core/codex-state";
import { getMockDataset, getMockDatasetName } from "../debug/mock-datasets";
import { AdapterContext, ProviderAdapter, ProviderState } from "../types";
import { listRecentFiles, pathExists } from "../utils/fs";
import { expandHome } from "../utils/paths";

export class CodexAdapter implements ProviderAdapter {
  readonly id = "codex" as const;
  readonly label = "Codex";

  constructor(private readonly configuration: vscode.WorkspaceConfiguration) {}

  async load(context: AdapterContext): Promise<ProviderState> {
    if (this.configuration.get<boolean>("debug.useMockData", false)) {
      const dataset = getMockDataset(getMockDatasetName(this.configuration));
      const mockState = buildCodexStateFromTokenEvent(dataset.codex.event, context, [
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
        detailLines: [
          `Debug dataset ${dataset.name} does not contain a valid Codex token_count event.`,
          "Use a different mock dataset or feed a token_count event into the fixture.",
        ],
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
        detailLines: [
          `Session root not found: ${root}`,
          "Update agentBudgetMonitor.providers.codex.sessionRoot or run Codex once to create session logs.",
        ],
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
      detailLines: [
        "No recent token_count events were found in Codex session files.",
        "Open Codex, send one prompt, then run Refresh again.",
      ],
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

      const state = buildCodexStateFromTokenEvent(parsed, context, [`Source file: ${filePath}`]);
      if (state) {
        return state;
      }
    }

    return undefined;
  }
}
