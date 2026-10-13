# Claude Code setup for K-stack

How a Claude Code install is configured to run K-stack well. All of it is optional pieces around the plugin itself.

## Lead model

Run the main session on Opus 5.5 at High effort (`/model opus`, effort `high`). The lead plans, briefs, and reviews; the tier agents do the volume work.

## Routing block

`/kstack:k-setup` writes a managed block into `~/.claude/CLAUDE.md` between `<!-- kstack-routing: begin -->` and `<!-- kstack-routing: end -->`. k-mode reads it at session start; without it, the Balanced preset applies. Switch levels with `/kstack:k-effort <lean|balanced|quality>` (saved) or `/kstack:k-effort <level> session` (this session only). Edit individual roles by re-running `/kstack:k-setup`, not by hand-editing inside the markers.

Haiku tiers need Claude Code v2.1.293 or later, and `haiku` resolves to Haiku 5.5 only on the Anthropic API. On Bedrock, Google Cloud or Foundry, k-setup writes `# haiku: off` and those roles run on Sonnet Low.

## Token efficiency

`/kstack:k-tokens audit` reads your local transcripts (`~/.claude/projects`) and reports usage per model, main session against agents, idle cache rewrites, context size, compactions and polling. Nothing leaves the machine. Costs use an editable price table and are only relative weights, since plan usage meters are not proportional to list price.

`/kstack:k-tokens apply` asks four questions and merges only those keys into `~/.claude/settings.json`, after a backup:

- `subagentPromptCacheTtl: "1h"`, so agents that wait on long builds keep their cache. The default is 5 minutes, and an idle agent rewrites its whole context after that.
- `autoCompactWindow: 250000`, so a long job compacts about once.
- `env.CLAUDE_CODE_SUBAGENT_MODEL: "sonnet"`, so an agent started without a model does not inherit Opus.
- `modelSettings.<model-id>.effortLevel: "high"` for Sonnet and Opus.

It can also write a managed `kstack-tokens` block into `~/.claude/CLAUDE.md` with agent working rules: fewer, bigger tool calls, quiet blocking waits instead of polls, a current `HANDOVER.md`, one agent per job. `/kstack:k-tokens status` shows the current values next to the recommended ones. `/kstack:k-setup` offers the apply screen as an optional last step.

## Hooks

The plugin ships `hooks/hooks.json`; no user-level hook config is needed. The macOS-only hooks (notifications, kill-before-open) no-op silently on other platforms.

## MCP servers for k-e2e-qa

Register AgentController at user scope so every session can drive macOS and iOS targets:

```bash
claude mcp add --scope user agentcontroller -- bash ~/.agentcontroller/agentcontroller-mcp-bridge.sh
claude mcp add --scope user agentcontroller-ios -- bash ~/.agentcontroller/agentcontroller-ios-mcp-bridge.sh
```

The macOS half also needs AgentController.app installed and running (menu bar), with Accessibility and Screen Recording permissions granted to the app itself. The iOS half is a node process and needs no app.

For Android, install Maestro (registered as an `mcp__maestro__*` server or used as the `maestro` CLI), or rely on raw `adb`, which needs no MCP at all.

k-e2e-qa inherits these: when a k-mode verify step lands on a UI, app, or device target, the skill picks the transport from its routing table (macOS → `agentcontroller`, iOS → `agentcontroller-ios`, Android → Maestro/adb, web → Chrome or Playwright MCP).

## Web verification

For web targets, use Claude in Chrome (the `/chrome` flow from the browser extension) when it is installed. Otherwise configure a Playwright MCP server and k-e2e-qa uses that. If neither exists, the skill reports the gap instead of faking verification with curl.
