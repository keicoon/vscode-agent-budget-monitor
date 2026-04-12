# Provider Adapter Plan

## Adapter Strategy

Each provider gets a separate adapter that produces the same view model.
Adapters may use different collection methods.
The UI layer only consumes normalized provider state.
Providers are not loaded until the user explicitly registers them.

## Source Labels

| Label | Meaning |
| --- | --- |
| `official` | Supported public API or documented provider surface |
| `internal` | Undocumented provider API; useful but unstable |
| `local` | Provider-owned local session/log files on the user's machine |
| `estimated` | Derived or heuristic value, not directly supplied by provider |

## Confidence Labels

| Label | Meaning |
| --- | --- |
| `high` | Stable source, direct percent or direct quota data |
| `medium` | Stable enough for daily use, but depends on local parsing or inferred reset logic |
| `low` | Useful hint only; likely to drift or break |

## Provider Matrix

| Provider | Primary source | Fallback | Main window | Source type | Confidence | MVP decision |
| --- | --- | --- | --- | --- | --- | --- |
| Codex | Local session files under `~/.codex/sessions/` with `token_count` events | Optional local SQLite/log parsing later | `5h`, `weekly` when present | `local` | `medium` | Include |
| Claude Code | Local JSONL under `~/.claude/projects/` or `~/.config/claude/projects/` when usage-bearing message records exist | Detect-only fallback for `~/.claude/transcripts/` | `5h` rolling session | `local` | `medium` | Include |
| GitHub Copilot | `api.github.com/copilot_internal/user` via GitHub auth | None in v1 | Monthly premium requests | `internal` | `medium` | Include |

## Codex Adapter

### Data Source

- `~/.codex/sessions/`
- Parse the latest session artifacts
- Extract `token_count`-style events and rate-limit metadata when available

### Registration Prerequisite

- User adds Codex from the extension command flow.
- Extension checks whether the configured session root exists.
- If not, the user can still register it as a best-effort adapter.

### What We Expect to Produce

- `usedPercent`
- `leftPercent`
- `windowType`: `5h` and optionally `weekly`
- `resetAt` or `timeToReset`
- freshness timestamp from latest parsed event

### Risks

- Local file layout may change across Codex versions
- Session metadata might be missing in older sessions
- Some users may have no recent session data

### MVP Rule

If no reliable limit metadata exists, return `unknown` instead of inventing a quota.

## Claude Code Adapter

### Data Source

- `~/.claude/projects/`
- `~/.config/claude/projects/`
- detect transcript-only installations under `~/.claude/transcripts/`
- Parse local JSONL conversation files when message usage data exists

### Registration Prerequisite

- User adds Claude Code from the extension command flow.
- Extension asks which Claude plan should be used for token-limit calculations.
- If only transcript roots exist, the extension warns that usage totals may remain unavailable.

### What We Expect to Produce

- `usedPercent`
- `leftPercent`
- `windowType`: `5h session`
- `resetAt` or `timeToReset`
- optional token, message, and cost breakdown for detail view

### Risks

- Plan limits differ by user plan and may require configuration
- Message, token, and cost windows are not always interchangeable
- Some values are derived from local events rather than returned by an official quota endpoint
- Current local transcript format needs further verification for direct token usage fields

### MVP Rule

Use tokens as the primary progress metric.
Messages and cost can appear in detail rows, not as the main budget bar.
If only transcript-style data exists and no usage fields are present, return `unknown` with a clear explanation instead of estimating.

## Copilot Adapter

### Data Source

- GitHub authentication inside VS Code
- Internal endpoint: `api.github.com/copilot_internal/user`

### Registration Prerequisite

- User adds GitHub Copilot from the extension command flow.
- Extension requests a GitHub auth session inside VS Code before registering the adapter.

### What We Expect to Produce

- premium request usage percent or remaining percent
- current plan allowance metadata when available
- reset timing if returned or inferable

### Risks

- Internal API may change without notice
- Some plans may return unlimited or unsupported values
- Auth failures are likely and should be treated as a normal state

### MVP Rule

If the internal API fails or returns unsupported data, show `unknown` with `sourceType=internal`.
Do not scrape browser sessions in v1.

## Unified Normalization Rules

- Primary bar uses the best direct percent available.
- If only raw `used` and `limit` exist, compute percent locally.
- `leftPercent = 100 - usedPercent` if `usedPercent` is known.
- If multiple windows exist, choose the most decision-useful one as primary:
  - Codex: `5h` first, `weekly` second
  - Claude: `5h session`
  - Copilot: monthly premium requests

## Suggested Implementation Order

1. Claude adapter
2. Codex adapter
3. Copilot adapter

Claude should come first because the local JSONL path and session logic are the clearest to verify quickly.
