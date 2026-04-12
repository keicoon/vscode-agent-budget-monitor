# MVP Spec

## One-line Description

A VS Code extension that shows remaining AI agent budget for Codex, Claude Code, and GitHub Copilot in one consistent view.

## Problem

Developers often use multiple AI agents in the same editor, but usage visibility is fragmented across separate apps, dashboards, and provider-specific pages.
The goal is not full billing accuracy.
The goal is quick, editor-native awareness of how close the user is to each provider's current limit window.

## Target User

- Individual developer using two or more AI coding agents
- Wants quick budget awareness without leaving VS Code
- Accepts best-effort monitoring if the source is clearly labeled

## Core User Questions

- "Which agent is safest to use right now?"
- "How much of today's or this session's budget have I already consumed?"
- "When does this limit reset?"
- "Which numbers are official versus inferred?"

## Product Promise

The extension gives a readable and honest estimate of remaining budget across providers.
It does not claim to be a canonical billing source.

## MVP Success Criteria

- User starts with an empty registry and adds only the providers they use.
- User can see all registered and enabled providers in one place inside VS Code.
- Each provider shows a usable `used %` or `left %`.
- Each provider shows its active window and reset timing when available.
- Each provider labels the source as `official`, `internal`, `local`, or `estimated`.
- Unknown and stale data are displayed clearly instead of failing silently.

## Common Display Model

Each provider card should render the following fields:

| Field | Meaning |
| --- | --- |
| `providerId` | `codex`, `claude`, `copilot` |
| `providerLabel` | User-facing provider name |
| `usedPercent` | Percent consumed in the active window |
| `leftPercent` | Percent remaining in the active window |
| `windowType` | Example: `5h session`, `weekly`, `monthly premium` |
| `resetAt` | Absolute reset timestamp if known |
| `timeToReset` | Relative countdown if known |
| `sourceType` | `official`, `internal`, `local`, `estimated` |
| `confidence` | `high`, `medium`, `low` |
| `freshness` | Last successful refresh timestamp |
| `status` | `ok`, `warning`, `critical`, `unknown`, `stale`, `error` |
| `detailLines` | Short explanation lines for tooltip/panel |

## Common UI Rules

### Status Bar

Compact summary, remaining-first:

```text
ABM  Cdx 39% left  Cl 26% left  Cop 58% left
```

Fallback examples:

```text
ABM  add agent
ABM  Cdx unknown  Cl 26% left  Cop stale
ABM  No provider data
```

### Tooltip

Per-provider summary should include:

- used percent
- left percent
- active window
- reset time
- source type
- confidence
- last updated

### Side Panel

One card per provider:

- Provider name and icon
- Primary progress bar
- Secondary metadata rows
- Warning badge if near exhaustion
- Source badge

## Status Rules

- `ok`: under warning threshold
- `warning`: above warning threshold, default 70%
- `critical`: above critical threshold, default 90%
- `unknown`: required data missing
- `stale`: last refresh older than configured stale threshold
- `error`: adapter failed

## Budget Semantics

The extension will not normalize provider budgets into one fake universal quota.
Instead it will normalize the presentation:

- primary metric: `percent used`
- secondary metric: `percent left`
- supporting context: `window`, `reset`, `source`, `confidence`

## v1 Included

- Local provider cards for Codex and Claude Code
- Copilot card using internal API when available
- Manual provider registration and removal
- Provider-specific onboarding and auth checks
- Manual refresh
- Auto refresh interval setting
- Per-provider enable or disable setting
- Read-only UI

## v1 Excluded

- Spend forecasting
- Historical charts
- Org-level analytics
- Shared team dashboards
- Remote sync
- Cookie-based browser session scraping
- Writing or mutating provider data

## Open Product Decisions

1. Status bar should show all providers by default or only the worst-off provider.
2. Registered but disabled providers should stay visible in the management UI with a disabled marker.
3. Side panel should default-sort by least remaining budget first.
