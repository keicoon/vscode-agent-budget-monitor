import { AdapterContext, ProviderState } from "../types";
import { clampPercent, classifyStatus } from "../utils/provider-state";
import { formatIsoDate, formatRelativeDuration } from "../utils/time";

export type ClaudePlan = "pro" | "max5" | "max20" | "custom";

export interface ClaudeUsage {
  input_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens: number;
}

export interface ClaudeMessage {
  id: string;
  requestId: string;
  timestamp: string;
  model?: string;
  projectName?: string;
  usage: ClaudeUsage;
}

export interface ClaudePlanConfig {
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

const SESSION_DURATION_MS = 5 * 60 * 60 * 1000;

export function toClaudeMessage(parsed: any, projectName: string, fallbackId: string): ClaudeMessage | undefined {
  const usage = extractClaudeUsage(parsed);
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

export function extractClaudeUsage(parsed: any): ClaudeUsage | undefined {
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

export function buildClaudeStateFromMessages(
  messages: ClaudeMessage[],
  context: AdapterContext,
  planConfig: { planName: ClaudePlan; plan: ClaudePlanConfig },
  extraDetailLines: string[],
  now = new Date(),
): ProviderState | null {
  const metrics = calculateClaudeSessionMetrics(messages, planConfig, now);
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
    timeToReset: formatRelativeDuration(metrics.sessionEndTime, now),
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

function calculateClaudeSessionMetrics(
  messages: ClaudeMessage[],
  planConfig: { planName: ClaudePlan; plan: ClaudePlanConfig },
  now: Date,
): ClaudeSessionMetrics | null {
  if (messages.length === 0) {
    return null;
  }

  const deduped = dedupeClaudeMessages(messages).sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
  const sessions = groupClaudeMessagesIntoFiveHourSets(deduped);
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

function dedupeClaudeMessages(messages: ClaudeMessage[]): ClaudeMessage[] {
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

function groupClaudeMessagesIntoFiveHourSets(messages: ClaudeMessage[]): Array<{
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
