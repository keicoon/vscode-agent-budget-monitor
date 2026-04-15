import * as vscode from "vscode";

import {
  buildCopilotStateFromResponse,
  CopilotApiResponse,
} from "../core/copilot-state";
import { getMockDataset, getMockDatasetName } from "../debug/mock-datasets";
import { AdapterContext, ProviderAdapter, ProviderState } from "../types";

export class CopilotAdapter implements ProviderAdapter {
  readonly id = "copilot" as const;
  readonly label = "Copilot";

  constructor(private readonly configuration: vscode.WorkspaceConfiguration) {}

  async load(context: AdapterContext): Promise<ProviderState> {
    try {
      if (this.configuration.get<boolean>("debug.useMockData", false)) {
        const dataset = getMockDataset(getMockDatasetName(this.configuration));
        return buildCopilotStateFromResponse(dataset.copilot.response, context, [
          `Debug dataset: ${dataset.name}`,
          "Source: mock copilot_internal/user",
        ]);
      }

      const session = await vscode.authentication.getSession("github", ["user:email"], {
        createIfNone: false,
      });

      if (!session) {
        return {
          providerId: this.id,
          providerLabel: this.label,
          sourceType: "internal",
          confidence: "low",
          status: "unknown",
          detailLines: [
            "GitHub authentication session was not available in VS Code.",
            "Run 'GitHub: Sign In' in VS Code, then refresh the provider.",
          ],
        };
      }

      const response = await fetch("https://api.github.com/copilot_internal/user", {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "User-Agent": "Agent-Budget-Monitor",
        },
      });

      if (!response.ok) {
        return {
          providerId: this.id,
          providerLabel: this.label,
          sourceType: "internal",
          confidence: "low",
          status: "error",
          detailLines: [
            `Copilot internal API request failed with ${response.status}.`,
            "Re-authenticate GitHub and refresh. Some accounts may not expose this internal endpoint.",
          ],
        };
      }

      const data = (await response.json()) as CopilotApiResponse;
      return buildCopilotStateFromResponse(data, context, ["Source: GitHub internal Copilot API"]);
    } catch (error) {
      return {
        providerId: this.id,
        providerLabel: this.label,
        sourceType: "internal",
        confidence: "low",
        status: "error",
        detailLines: [
          error instanceof Error ? error.message : String(error),
          "Retry after GitHub sign-in. If the error persists, the internal Copilot endpoint may be unavailable.",
        ],
      };
    }
  }
}
