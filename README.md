# VS Code Agent Budget Monitor

VS Code extension concept for showing "how much budget is left" across AI coding agents in one place.

Independent project. Not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, or GitHub. Provider names are used only to identify integrations and compatible local data sources.

## Product Direction

The product does not try to force Codex, Claude Code, and GitHub Copilot into one official billing model.
Instead, it presents each provider with the same user-facing pattern:

- `used %`
- `left %`
- `reset time`
- `window type`
- `source`
- `confidence`

This makes different quota systems readable without pretending they are identical.

## Current Scope

This folder currently contains product-definition documents for the MVP:

- `docs/mvp-spec.md`
- `docs/provider-adapters.md`

It also includes a working extension scaffold:

- status bar summary
- empty-by-default provider registry
- add/remove/manage agent commands
- refresh command
- overview webview
- Codex local adapter prototype
- Claude project-format parser with transcript fallback
- Copilot internal API adapter

## MVP Principles

- Show remaining budget first
- Be explicit about data source quality
- Handle unknown and stale data as first-class states
- Prefer local-only parsing when possible
- Use official APIs when they exist, internal APIs only behind clear labeling

## Initial UI Surfaces

- Status bar summary
- Hover tooltip
- Side panel with per-provider cards

## Registration Flow

The extension does not assume that every user subscribes to every agent.
It starts with no registered providers.

- `Agent Budget Monitor: Add Agent` lets the user pick a supported provider.
- Each provider runs its own registration step:
  - Codex validates local session paths.
  - Claude asks for the user's plan and checks local data roots.
  - Copilot requests GitHub authentication in VS Code.
- Registered providers can later be removed with `Agent Budget Monitor: Remove Agent`.
- Provider-level `enabled` settings still apply after registration.

## Debug Mock Mode

Use the built-in mock datasets to preview the UI without local logs or authentication:

```json
{
  "agentBudgetMonitor.debug.useMockData": true,
  "agentBudgetMonitor.debug.dataset": "mixed"
}
```

Available datasets:

- `balanced`: healthy remaining budget across all providers
- `mixed`: realistic warning and high-usage mix
- `edge`: exhausted and unknown states for edge-case UI review

Mock mode bypasses the empty registry and renders provider cards directly from built-in raw fixtures shaped like the expected Codex, Claude, and Copilot source payloads.

## Icon Font Workflow

Status bar provider icons are generated from `assets/icon-font-src/*.svg`.

```bash
npm run icons:build
```

This rebuilds `assets/icon-font/agent-budget-statusbar-icons.woff` and syncs `package.json` `contributes.icons` entries from the generated codepoints.

To add a new agent icon later:

- add a monochrome SVG to `assets/icon-font-src`
- run `npm run icons:build`
- wire the new icon id into extension UI code such as `statusBarIconId(...)`

## Development

Core local checks:

```bash
npm run compile
npm test
```

Package a local VSIX:

```bash
npm run package:vsix
```

`vscode:prepublish` runs tests and compile before packaging.

## Out of Scope for v1

- Team analytics
- Historical trend charts
- Billing reconciliation
- Cross-device synchronization
- Browser-cookie scraping

## Next Milestones

1. Improve Claude support for more local data layouts.
2. Validate the add/remove flow in an Extension Host session.
3. Add richer side-panel visuals such as bars and severity badges.
4. Add clearer stale-state handling and provider troubleshooting.
