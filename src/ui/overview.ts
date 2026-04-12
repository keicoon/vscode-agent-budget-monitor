import { ProviderState, ProviderStatus } from "../types";

interface StatusTone {
  label: string;
  accent: string;
  accentSoft: string;
  border: string;
}

interface Percentages {
  used?: number;
  left?: number;
}

export interface OverviewIconUris {
  codex: string;
  claude: string;
  copilot: string;
}

export function renderOverviewHtml(
  states: ProviderState[],
  iconUris: OverviewIconUris,
  debugDatasetName?: string,
): string {
  const attentionCount = states.filter((state) => state.status !== "ok").length;
  const cards = states.map((state) => renderCard(state, iconUris)).join("");
  const emptyState = `
    <section class="empty">
      <h2>No agent registered</h2>
      <p>Use the status bar item or the <code>Agent Budget Monitor: Add Agent</code> command to register a provider.</p>
    </section>
  `;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Budget Monitor</title>
    <style>
      :root {
        color-scheme: dark;
        --bg-0: #130d16;
        --bg-1: #1f1020;
        --bg-2: #2c001e;
        --panel: rgba(34, 17, 29, 0.96);
        --panel-soft: rgba(255, 255, 255, 0.03);
        --line: rgba(233, 84, 32, 0.22);
        --line-soft: rgba(255, 255, 255, 0.08);
        --text: #f7f1ea;
        --muted: #c6b7b0;
        --used: #e95420;
        --used-soft: rgba(233, 84, 32, 0.16);
        --left: #33d17a;
        --left-soft: rgba(51, 209, 122, 0.16);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Ubuntu Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace;
        color: var(--text);
        background:
          radial-gradient(circle at top right, rgba(233, 84, 32, 0.12), transparent 28%),
          linear-gradient(180deg, var(--bg-0), var(--bg-1) 58%, #140d17 100%);
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.2;
        background:
          linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
        background-size: 22px 22px;
      }

      main {
        width: min(1100px, calc(100% - 28px));
        margin: 0 auto;
        padding: 20px 0 28px;
      }

      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        flex-wrap: wrap;
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid var(--line-soft);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 28%),
          var(--bg-2);
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
      }

      .title-wrap h1 {
        margin: 0;
        font-size: 24px;
        letter-spacing: -0.02em;
        text-transform: lowercase;
      }

      .subtitle {
        margin-top: 6px;
        color: #f6a57d;
        font-size: 12px;
        letter-spacing: 0.04em;
      }

      .summary {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .pill {
        padding: 7px 10px;
        border-radius: 999px;
        border: 1px solid var(--line-soft);
        background: rgba(0, 0, 0, 0.2);
        font-size: 12px;
        color: var(--muted);
      }

      .debug-banner {
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(233, 84, 32, 0.26);
        background: rgba(44, 0, 30, 0.88);
        color: #f6c1a6;
        font-size: 13px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
        gap: 14px;
        margin-top: 14px;
      }

      .card {
        display: grid;
        gap: 14px;
        padding: 18px;
        border-radius: 16px;
        border: 1px solid var(--card-border);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 32%),
          var(--panel);
        box-shadow:
          inset 3px 0 0 rgba(255, 255, 255, 0.04),
          0 16px 34px rgba(0, 0, 0, 0.24);
      }

      .card-head {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 12px;
      }

      .provider-heading {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .provider-icon-badge {
        flex: 0 0 auto;
        width: 44px;
        height: 44px;
        border-radius: 10px;
        border: 1px solid var(--line-soft);
        background: rgba(0, 0, 0, 0.24);
        display: grid;
        place-items: center;
      }

      .provider-icon {
        width: 24px;
        height: 24px;
        background: rgba(238, 244, 251, 0.96);
        -webkit-mask-position: center;
        -webkit-mask-repeat: no-repeat;
        -webkit-mask-size: contain;
        mask-position: center;
        mask-repeat: no-repeat;
        mask-size: contain;
      }

      .provider-name {
        margin: 0;
        font-size: 20px;
        letter-spacing: -0.01em;
      }

      .provider-subtitle {
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.08em;
      }

      .status {
        padding: 6px 8px;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.18);
        border: 1px solid var(--card-border);
        font-size: 12px;
        color: var(--text);
        white-space: nowrap;
      }

      .main-row {
        display: grid;
        grid-template-columns: 112px minmax(0, 1fr);
        gap: 14px;
        align-items: center;
      }

      .ring {
        position: relative;
        width: 112px;
        height: 112px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at center, rgba(13, 8, 16, 0.98) 0 56%, transparent 57% 100%),
          conic-gradient(
            var(--used) 0 var(--used-angle),
            var(--left) var(--used-angle) calc(var(--used-angle) + var(--left-angle)),
            rgba(255, 255, 255, 0.1) calc(var(--used-angle) + var(--left-angle)) 100%
          );
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      }

      .ring.unknown {
        background:
          radial-gradient(circle at center, rgba(13, 8, 16, 0.98) 0 56%, transparent 57% 100%),
          conic-gradient(rgba(142, 164, 194, 0.25) 0 100%);
      }

      .ring-center {
        display: grid;
        justify-items: center;
        gap: 2px;
      }

      .ring-value {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.02em;
        line-height: 1;
      }

      .ring-label {
        color: var(--muted);
        font-size: 10px;
        letter-spacing: 0.12em;
      }

      .primary {
        font-size: 30px;
        font-weight: 800;
        letter-spacing: -0.02em;
        line-height: 0.95;
      }

      .secondary {
        margin-top: 6px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.45;
      }

      .metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .metric {
        padding: 10px 12px;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.18);
        border: 1px solid var(--line-soft);
      }

      .metric-label {
        display: block;
        margin-bottom: 4px;
        color: var(--muted);
        font-size: 10px;
        letter-spacing: 0.12em;
      }

      .metric-value {
        font-size: 16px;
        font-weight: 700;
      }

      .legend {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .legend-item {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--muted);
      }

      .swatch {
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }

      .swatch.used {
        background: var(--used);
        box-shadow: 0 0 0 5px var(--used-soft);
      }

      .swatch.left {
        background: var(--left);
        box-shadow: 0 0 0 5px var(--left-soft);
      }

      .footer {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .chip {
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--line-soft);
        background: rgba(0, 0, 0, 0.16);
        color: var(--muted);
        font-size: 12px;
      }

      .detail {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.45;
      }

      .empty {
        padding: 22px;
        border-radius: 14px;
        border: 1px dashed rgba(233, 84, 32, 0.24);
        background: rgba(44, 0, 30, 0.74);
      }

      .empty h2 {
        margin: 0 0 8px;
      }

      .empty p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }

      code {
        font-family: "SFMono-Regular", Consolas, monospace;
      }

      @media (max-width: 620px) {
        .main-row {
          grid-template-columns: 1fr;
          justify-items: start;
        }

        .metrics {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="topbar">
        <div class="title-wrap">
          <h1>agent-budget-monitor</h1>
          <div class="subtitle">abm@workspace:~$ provider-budget --snapshot</div>
        </div>
        <div class="summary">
          <span class="pill">${states.length} provider${states.length === 1 ? "" : "s"}</span>
          <span class="pill">${attentionCount} attention</span>
        </div>
      </section>
      ${debugDatasetName ? `<div class="debug-banner">Debug dataset: <strong>${escapeHtml(debugDatasetName)}</strong></div>` : ""}
      <section class="grid">${cards || emptyState}</section>
    </main>
  </body>
</html>`;
}

function renderCard(state: ProviderState, iconUris: OverviewIconUris): string {
  const tone = getStatusTone(state.status);
  const percentages = getPercentages(state);
  const used = percentages.used;
  const left = percentages.left;
  const primary = left !== undefined
    ? `${formatPercent(left)}%`
    : used !== undefined
      ? `${formatPercent(used)}%`
      : tone.label;
  const primaryLabel = left !== undefined ? "left" : used !== undefined ? "used" : "status";
  const firstDetail = state.detailLines[0];
  const iconUri = iconUris[state.providerId];

  return `
    <section class="card" style="--card-accent-soft: ${tone.accentSoft}; --card-border: ${tone.border};">
      <div class="card-head">
        <div class="provider-heading">
          <div class="provider-icon-badge" aria-hidden="true">
            <span
              class="provider-icon"
              style="-webkit-mask-image: url('${escapeHtml(iconUri)}'); mask-image: url('${escapeHtml(iconUri)}');"
            ></span>
          </div>
          <div>
            <h2 class="provider-name">${escapeHtml(state.providerLabel)}</h2>
            <div class="provider-subtitle">${escapeHtml(state.sourceType)}</div>
          </div>
        </div>
        <div class="status">[${escapeHtml(tone.label)}]</div>
      </div>

      <div class="main-row">
        ${renderDonut(percentages, primary, primaryLabel)}
        <div>
          <div class="primary">${escapeHtml(primary)} ${escapeHtml(primaryLabel)}</div>
          <div class="secondary">${escapeHtml(state.timeToReset ? `resets in ${state.timeToReset}` : state.windowType ? `window ${state.windowType}` : "no reset data")}</div>
        </div>
      </div>

      <div class="metrics">
        ${renderMetric("Used", used !== undefined ? `${formatPercent(used)}%` : "--")}
        ${renderMetric("Left", left !== undefined ? `${formatPercent(left)}%` : "--")}
        ${renderMetric("Reset", state.timeToReset ?? "--")}
      </div>

      <div class="legend">
        <span class="legend-item"><span class="swatch used"></span>Used</span>
        <span class="legend-item"><span class="swatch left"></span>Left</span>
      </div>

      <div class="footer">
        <span class="chip">${escapeHtml(state.confidence)}</span>
        ${state.windowType ? `<span class="chip">${escapeHtml(state.windowType)}</span>` : ""}
        ${state.freshness ? `<span class="chip">${escapeHtml(state.freshness)}</span>` : ""}
      </div>

      ${firstDetail ? `<div class="detail">${escapeHtml(firstDetail)}</div>` : ""}
    </section>
  `;
}

function renderDonut(percentages: Percentages, value: string, label: string): string {
  const used = percentages.used;
  const left = percentages.left;

  if (used === undefined && left === undefined) {
    return `
      <div class="ring unknown">
        <div class="ring-center">
          <div class="ring-value">--</div>
          <div class="ring-label">${escapeHtml(label)}</div>
        </div>
      </div>
    `;
  }

  const normalizedUsed = used ?? Math.max(0, 100 - (left ?? 0));
  const normalizedLeft = left ?? Math.max(0, 100 - normalizedUsed);

  return `
    <div class="ring" style="--used-angle: ${formatPercent(normalizedUsed)}%; --left-angle: ${formatPercent(normalizedLeft)}%;">
      <div class="ring-center">
        <div class="ring-value">${escapeHtml(value)}</div>
        <div class="ring-label">${escapeHtml(label)}</div>
      </div>
    </div>
  `;
}

function renderMetric(label: string, value: string): string {
  return `
    <section class="metric">
      <span class="metric-label">${escapeHtml(label)}</span>
      <span class="metric-value">${escapeHtml(value)}</span>
    </section>
  `;
}

function getPercentages(state: ProviderState): Percentages {
  const used = normalizePercent(state.usedPercent);
  const left = normalizePercent(state.leftPercent);

  if (used !== undefined && left !== undefined) {
    return { used, left };
  }

  if (used !== undefined) {
    return { used, left: normalizePercent(100 - used) };
  }

  if (left !== undefined) {
    return { used: normalizePercent(100 - left), left };
  }

  return {};
}

function normalizePercent(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(100, value));
}

function formatPercent(value: number): string {
  return value.toFixed(0);
}

function getStatusTone(status: ProviderStatus): StatusTone {
  switch (status) {
    case "ok":
      return {
        label: "OK",
        accent: "#35d6b1",
        accentSoft: "rgba(53, 214, 177, 0.18)",
        border: "rgba(53, 214, 177, 0.22)",
      };
    case "warning":
      return {
        label: "Warning",
        accent: "#ffb86b",
        accentSoft: "rgba(255, 184, 107, 0.18)",
        border: "rgba(255, 184, 107, 0.22)",
      };
    case "critical":
      return {
        label: "Critical",
        accent: "#ff7a59",
        accentSoft: "rgba(255, 122, 89, 0.18)",
        border: "rgba(255, 122, 89, 0.22)",
      };
    case "stale":
      return {
        label: "Stale",
        accent: "#7db5ff",
        accentSoft: "rgba(125, 181, 255, 0.18)",
        border: "rgba(125, 181, 255, 0.22)",
      };
    case "error":
      return {
        label: "Error",
        accent: "#ff6483",
        accentSoft: "rgba(255, 100, 131, 0.18)",
        border: "rgba(255, 100, 131, 0.22)",
      };
    case "unknown":
      return {
        label: "Unknown",
        accent: "#9fb4d6",
        accentSoft: "rgba(159, 180, 214, 0.14)",
        border: "rgba(159, 180, 214, 0.2)",
      };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
