import assert from "node:assert/strict";
import test from "node:test";

import { buildClaudeStateFromMessages, ClaudeMessage, ClaudePlanConfig } from "../src/core/claude-state";
import { buildCodexStateFromTokenEvent } from "../src/core/codex-state";
import { buildCopilotStateFromResponse } from "../src/core/copilot-state";
import { AdapterContext } from "../src/types";

const context: AdapterContext = {
  thresholds: {
    warningPercent: 70,
    criticalPercent: 90,
  },
};

test("buildCodexStateFromTokenEvent parses token_count events", () => {
  const now = new Date("2026-04-15T00:00:00.000Z");
  const state = buildCodexStateFromTokenEvent(
    {
      timestamp: "2026-04-14T23:58:00.000Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        rate_limits: {
          primary: {
            used_percent: 63,
            window_minutes: 300,
            resets_at: Math.floor(new Date("2026-04-15T01:30:00.000Z").getTime() / 1000),
          },
          secondary: {
            used_percent: 21,
            window_minutes: 10080,
            resets_at: Math.floor(new Date("2026-04-20T00:00:00.000Z").getTime() / 1000),
          },
        },
      },
    },
    context,
    ["Source file: mock.jsonl"],
    now,
  );

  assert.ok(state);
  assert.equal(state.providerId, "codex");
  assert.equal(state.usedPercent, 63);
  assert.equal(state.leftPercent, 37);
  assert.equal(state.windowType, "5h");
  assert.equal(state.timeToReset, "01:30:00");
  assert.equal(state.status, "ok");
});

test("buildCodexStateFromTokenEvent ignores non-token events", () => {
  const state = buildCodexStateFromTokenEvent(
    {
      type: "event_msg",
      payload: { type: "session_meta" },
    },
    context,
    [],
  );

  assert.equal(state, undefined);
});

test("buildClaudeStateFromMessages uses the active five-hour session and dedupes messages", () => {
  const now = new Date("2026-04-15T02:00:00.000Z");
  const plan: ClaudePlanConfig = {
    tokenLimit: 10_000,
    costLimit: 0,
    messageLimit: 0,
  };
  const messages: ClaudeMessage[] = [
    {
      id: "m-old",
      requestId: "r-old",
      timestamp: "2026-04-14T18:30:00.000Z",
      usage: { input_tokens: 400, output_tokens: 200 },
    },
    {
      id: "m-1",
      requestId: "r-1",
      timestamp: "2026-04-15T00:15:00.000Z",
      usage: { input_tokens: 1000, output_tokens: 500 },
    },
    {
      id: "m-1",
      requestId: "r-1",
      timestamp: "2026-04-15T00:15:00.000Z",
      usage: { input_tokens: 1000, output_tokens: 500 },
    },
    {
      id: "m-2",
      requestId: "r-2",
      timestamp: "2026-04-15T01:20:00.000Z",
      usage: { input_tokens: 1200, output_tokens: 300 },
    },
  ];

  const state = buildClaudeStateFromMessages(
    messages,
    context,
    { planName: "custom", plan },
    ["Project roots: /tmp/claude-projects"],
    now,
  );

  assert.ok(state);
  assert.equal(state.providerId, "claude");
  assert.equal(state.usedPercent, 30);
  assert.equal(state.leftPercent, 70);
  assert.equal(state.resetAt, "2026-04-15T05:00:00.000Z");
  assert.equal(state.timeToReset, "03:00:00");
  assert.equal(state.status, "ok");
  assert.match(state.detailLines[1], /3,000 \/ 10,000/);
  assert.equal(state.detailLines[2], "Messages in active session: 2");
});

test("buildCopilotStateFromResponse calculates usage from quota snapshots", () => {
  const now = new Date("2026-04-15T00:00:00.000Z");
  const state = buildCopilotStateFromResponse(
    {
      copilot_plan: "individual",
      quota_reset_date_utc: "2026-05-01T00:00:00.000Z",
      quota_snapshots: {
        premium_interactions: {
          entitlement: 300,
          percent_remaining: 40,
          quota_remaining: 120,
          timestamp_utc: "2026-04-14T23:55:00.000Z",
        },
      },
    },
    {
      thresholds: {
        warningPercent: 50,
        criticalPercent: 80,
      },
    },
    ["Source: internal API"],
    now,
  );

  assert.equal(state.usedPercent, 60);
  assert.equal(state.leftPercent, 40);
  assert.equal(state.status, "warning");
  assert.equal(state.timeToReset, "384:00:00");
});

test("buildCopilotStateFromResponse returns unknown when quota is unavailable", () => {
  const state = buildCopilotStateFromResponse(
    {
      quota_snapshots: {
        premium_interactions: {
          entitlement: 0,
          quota_remaining: 0,
          unlimited: true,
        },
      },
    },
    context,
    [],
  );

  assert.equal(state.status, "unknown");
  assert.equal(state.usedPercent, undefined);
  assert.match(state.detailLines[0], /quota is unavailable/i);
});
