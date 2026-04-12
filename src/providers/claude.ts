import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

import { getMockDataset, getMockDatasetName } from "../debug/mock-datasets";
import { AdapterContext, ProviderAdapter, ProviderState } from "../types";
import { listRecentFiles, pathExists } from "../utils/fs";
import { expandHome } from "../utils/paths";
import { clampPercent, classifyStatus } from "../utils/provider-state";
import { formatIsoDate, formatRelativeDuration } from "../utils/time";

type ClaudePlan = "pro" | "max5" | "max20" | "custom";

interface ClaudeUsage {
  input_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens: number;
}

interface ClaudeMessage {
  id: string;
  requestId: string;
  timestamp: string;
  model?: string;
  projectName?: string;
  usage: ClaudeUsage;
}

interface ClaudePlanConfig {
  tokenLimit: number;
  costLimit: number;
  messageLimit: number;
}

interface ClaudeSessionMetrics {
  totalTokens: number;
  messageCount: number;
  sessionEndTime: Date;
  lastMessageTime: Date;
  planName: ClaudePlan;
  plan: ClaudePlanConfig;
}

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

const SESSION_DURATION_MS = 5 * 60 * 60 * 1000;

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

      const mockState = buildStateFromClaudeMessages(
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
        detailLines: [`Debug dataset ${dataset.name} does not contain an active Claude usage session.`],
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
        detailLines: ["No supported Claude local data directory was found."],
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
      const state = buildStateFromClaudeMessages(
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
      `Detected Claude roots: ${existingRoots.join(", ")}`,
      projectRoots.length > 0
        ? "Project-format roots were found, but no active session with usage data was detected."
        : "No project-format Claude usage roots were found.",
    ];

    if (transcriptRoots.length > 0) {
      details.push(`Transcript roots: ${transcriptRoots.join(", ")}`);
      details.push("Current transcript files do not expose direct usage fields on this machine.");
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

function toClaudeMessage(parsed: any, projectName: string, fallbackId: string): ClaudeMessage | undefined {
  const usage = extractUsage(parsed);
  if (!usage) {
    return undefined;
  }

  return {
    id: parsed.message?.id ?? parsed.uuid ?? parsed.id ?? fallbackId,
    requestId: parsed.request_id ?? parsed.requestId ?? "unknown",
    timestamp: parsed.timestamp ?? new Date().toISOString(),
    projectName,
    model:
      parsed.message?.model ??
      parsed.model ??
      parsed.Model ??
      parsed.message?.usage?.model ??
      parsed.request?.model,
    usage,
  };
}

function extractUsage(parsed: any): ClaudeUsage | undefined {
  const candidate = parsed.message?.usage ?? parsed.usage;
  if (!candidate) {
    return undefined;
  }

  const inputTokens = Number(candidate.input_tokens ?? candidate.inputTokens ?? 0);
  const outputTokens = Number(candidate.output_tokens ?? candidate.outputTokens ?? 0);
  if (inputTokens <= 0 && outputTokens <= 0) {
    return undefined;
  }

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: Number(
      candidate.cache_creation_input_tokens ?? candidate.cacheCreationInputTokens ?? 0,
    ),
    cache_read_input_tokens: Number(
      candidate.cache_read_input_tokens ?? candidate.cacheReadInputTokens ?? 0,
    ),
  };
}

function calculateClaudeSessionMetrics(
  messages: ClaudeMessage[],
  planConfig: { planName: ClaudePlan; plan: ClaudePlanConfig },
): ClaudeSessionMetrics | null {
  if (messages.length === 0) {
    return null;
  }

  const now = new Date();
  const deduped = dedupeMessages(messages).sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
  const sessions = groupIntoFiveHourSets(deduped);
  const activeSessions = sessions.filter((session) => now >= session.startTime && now <= session.endTime);
  const activeSession = activeSessions.at(-1);

  if (!activeSession) {
    return null;
  }

  let totalTokens = 0;
  let messageCount = 0;
  for (const message of activeSession.messages) {
    totalTokens += message.usage.input_tokens + message.usage.output_tokens;
    messageCount += 1;
  }

  return {
    totalTokens,
    messageCount,
    sessionEndTime: activeSession.endTime,
    lastMessageTime: activeSession.lastMessageTime,
    planName: planConfig.planName,
    plan: planConfig.plan,
  };
}

function buildStateFromClaudeMessages(
  messages: ClaudeMessage[],
  context: AdapterContext,
  planConfig: { planName: ClaudePlan; plan: ClaudePlanConfig },
  extraDetailLines: string[],
): ProviderState | null {
  const metrics = calculateClaudeSessionMetrics(messages, planConfig);
  if (!metrics) {
    return null;
  }

  const usedPercent = clampPercent((metrics.totalTokens / metrics.plan.tokenLimit) * 100);
  const leftPercent = clampPercent(100 - usedPercent);
  const status = classifyStatus(
    usedPercent,
    context.thresholds.warningPercent,
    context.thresholds.criticalPercent,
  );

  return {
    providerId: "claude",
    providerLabel: "Claude",
    usedPercent,
    leftPercent,
    windowType: "5h session",
    resetAt: metrics.sessionEndTime.toISOString(),
    timeToReset: formatRelativeDuration(metrics.sessionEndTime),
    sourceType: "local",
    confidence: "medium",
    freshness: formatIsoDate(metrics.lastMessageTime.toISOString()),
    status,
    detailLines: [
      `Plan: ${metrics.planName}`,
      `Tokens: ${metrics.totalTokens.toLocaleString()} / ${metrics.plan.tokenLimit.toLocaleString()}`,
      `Messages in active session: ${metrics.messageCount}`,
      ...extraDetailLines,
    ],
  };
}

function dedupeMessages(messages: ClaudeMessage[]): ClaudeMessage[] {
  const seen = new Set<string>();
  const output: ClaudeMessage[] = [];

  for (const message of messages) {
    const key = `${message.id}:${message.requestId}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(message);
  }

  return output;
}

function roundToNearestHour(date: Date): Date {
  const rounded = new Date(date);
  rounded.setMinutes(0, 0, 0);
  return rounded;
}

function groupIntoFiveHourSets(messages: ClaudeMessage[]): Array<{
  startTime: Date;
  endTime: Date;
  lastMessageTime: Date;
  messages: ClaudeMessage[];
}> {
  const sessions: Array<{
    startTime: Date;
    endTime: Date;
    lastMessageTime: Date;
    messages: ClaudeMessage[];
  }> = [];

  let currentSession:
    | {
        startTime: Date;
        endTime: Date;
        lastMessageTime: Date;
        messages: ClaudeMessage[];
      }
    | undefined;

  for (const message of messages) {
    const messageTime = new Date(message.timestamp);

    if (!currentSession) {
      const roundedStart = roundToNearestHour(messageTime);
      currentSession = {
        startTime: roundedStart,
        endTime: new Date(roundedStart.getTime() + SESSION_DURATION_MS),
        lastMessageTime: messageTime,
        messages: [message],
      };
      continue;
    }

    const gapMs = messageTime.getTime() - currentSession.lastMessageTime.getTime();
    if (messageTime >= currentSession.endTime || gapMs >= SESSION_DURATION_MS) {
      sessions.push(currentSession);

      const roundedStart = roundToNearestHour(messageTime);
      currentSession = {
        startTime: roundedStart,
        endTime: new Date(roundedStart.getTime() + SESSION_DURATION_MS),
        lastMessageTime: messageTime,
        messages: [message],
      };
      continue;
    }

    currentSession.messages.push(message);
    currentSession.lastMessageTime = messageTime;
  }

  if (currentSession) {
    sessions.push(currentSession);
  }

  return sessions;
}
