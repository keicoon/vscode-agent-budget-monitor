import * as vscode from "vscode";

export type MockDatasetName = "balanced" | "mixed" | "edge";

export interface MockCodexTokenEvent {
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

export interface MockClaudeProjectRecord {
  timestamp?: string;
  request_id?: string;
  requestId?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface MockCopilotApiResponse {
  copilot_plan?: string;
  quota_reset_date?: string;
  quota_reset_date_utc?: string;
  quota_snapshots?: {
    premium_interactions?: {
      entitlement: number;
      percent_remaining?: number;
      quota_remaining: number;
      unlimited?: boolean;
      timestamp_utc?: string;
    };
  };
}

export interface MockDataset {
  name: MockDatasetName;
  codex: {
    sourceFile: string;
    event: MockCodexTokenEvent;
  };
  claude: {
    records: Array<{
      projectName: string;
      entry: MockClaudeProjectRecord;
    }>;
  };
  copilot: {
    response: MockCopilotApiResponse;
  };
}

export function getMockDatasetName(configuration: vscode.WorkspaceConfiguration): MockDatasetName {
  const value = configuration.get<string>("debug.dataset", "mixed");
  return isMockDatasetName(value) ? value : "mixed";
}

export function getMockDataset(name: MockDatasetName): MockDataset {
  switch (name) {
    case "balanced":
      return buildBalancedDataset();
    case "edge":
      return buildEdgeDataset();
    case "mixed":
    default:
      return buildMixedDataset();
  }
}

function isMockDatasetName(value: string): value is MockDatasetName {
  return value === "balanced" || value === "mixed" || value === "edge";
}

function buildBalancedDataset(): MockDataset {
  return {
    name: "balanced",
    codex: {
      sourceFile: "mock://codex/balanced/session-01.jsonl",
      event: {
        timestamp: isoMinutesFromNow(-4),
        type: "event_msg",
        payload: {
          type: "token_count",
          rate_limits: {
            plan_type: "plus",
            primary: {
              used_percent: 28,
              window_minutes: 300,
              resets_at: unixSecondsFromNow(96),
            },
            secondary: {
              used_percent: 12,
              window_minutes: 10080,
              resets_at: unixSecondsFromNow(3600),
            },
          },
        },
      },
    },
    claude: {
      records: [
        {
          projectName: "demo-app",
          entry: buildClaudeRecord("balanced-1", -130, 4800, 1700),
        },
        {
          projectName: "demo-app",
          entry: buildClaudeRecord("balanced-2", -85, 5200, 1900),
        },
        {
          projectName: "demo-app",
          entry: buildClaudeRecord("balanced-3", -35, 4100, 1500),
        },
        {
          projectName: "demo-app",
          entry: buildClaudeRecord("balanced-4", -8, 3700, 1300),
        },
      ],
    },
    copilot: {
      response: {
        copilot_plan: "individual",
        quota_reset_date_utc: nextMonthStartIso(),
        quota_snapshots: {
          premium_interactions: {
            entitlement: 300,
            percent_remaining: 73,
            quota_remaining: 219,
            timestamp_utc: isoMinutesFromNow(-2),
          },
        },
      },
    },
  };
}

function buildMixedDataset(): MockDataset {
  return {
    name: "mixed",
    codex: {
      sourceFile: "mock://codex/mixed/session-07.jsonl",
      event: {
        timestamp: isoMinutesFromNow(-3),
        type: "event_msg",
        payload: {
          type: "token_count",
          rate_limits: {
            plan_type: "plus",
            primary: {
              used_percent: 63,
              window_minutes: 300,
              resets_at: unixSecondsFromNow(74),
            },
            secondary: {
              used_percent: 31,
              window_minutes: 10080,
              resets_at: unixSecondsFromNow(2800),
            },
          },
        },
      },
    },
    claude: {
      records: [
        {
          projectName: "agent-monitor",
          entry: buildClaudeRecord("mixed-1", -160, 15000, 5100, 7000),
        },
        {
          projectName: "agent-monitor",
          entry: buildClaudeRecord("mixed-2", -115, 11000, 4200),
        },
        {
          projectName: "agent-monitor",
          entry: buildClaudeRecord("mixed-3", -72, 9800, 3500),
        },
        {
          projectName: "agent-monitor",
          entry: buildClaudeRecord("mixed-4", -28, 8400, 2900),
        },
        {
          projectName: "agent-monitor",
          entry: buildClaudeRecord("mixed-5", -6, 6200, 2100),
        },
      ],
    },
    copilot: {
      response: {
        copilot_plan: "individual",
        quota_reset_date_utc: nextMonthStartIso(),
        quota_snapshots: {
          premium_interactions: {
            entitlement: 300,
            percent_remaining: 18,
            quota_remaining: 54,
            timestamp_utc: isoMinutesFromNow(-1),
          },
        },
      },
    },
  };
}

function buildEdgeDataset(): MockDataset {
  return {
    name: "edge",
    codex: {
      sourceFile: "mock://codex/edge/session-99.jsonl",
      event: {
        timestamp: isoMinutesFromNow(-1),
        type: "event_msg",
        payload: {
          type: "token_count",
          rate_limits: {
            plan_type: "plus",
            primary: {
              used_percent: 96,
              window_minutes: 300,
              resets_at: unixSecondsFromNow(18),
            },
            secondary: {
              used_percent: 84,
              window_minutes: 10080,
              resets_at: unixSecondsFromNow(720),
            },
          },
        },
      },
    },
    claude: {
      records: [],
    },
    copilot: {
      response: {
        copilot_plan: "individual",
        quota_reset_date_utc: nextMonthStartIso(),
        quota_snapshots: {},
      },
    },
  };
}

function buildClaudeRecord(
  id: string,
  minutesAgo: number,
  inputTokens: number,
  outputTokens: number,
  cacheCreationInputTokens = 0,
): MockClaudeProjectRecord {
  return {
    timestamp: isoMinutesFromNow(minutesAgo),
    request_id: `req-${id}`,
    message: {
      id: `msg-${id}`,
      model: "claude-sonnet-4",
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: cacheCreationInputTokens,
        cache_read_input_tokens: Math.round(cacheCreationInputTokens * 0.3),
      },
    },
  };
}

function isoMinutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function unixSecondsFromNow(minutes: number): number {
  return Math.floor((Date.now() + minutes * 60 * 1000) / 1000);
}

function nextMonthStartIso(): string {
  const value = new Date();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + 1);
  value.setUTCHours(0, 0, 0, 0);
  return value.toISOString();
}
