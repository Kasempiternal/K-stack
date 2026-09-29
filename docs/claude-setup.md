# Claude Code setup for K-stack

How a Claude Code install is configured to run K-stack well. All of it is optional pieces around the plugin itself.

## Lead model

Run the main session on Opus 5.5 at High effort (`/model opus`, effort `high`). The lead plans, briefs, and reviews; the tier agents do the volume work.

## Routing block

`/kstack:k-setup` writes a managed block into `~/.claude/CLAUDE.md` between `<!-- kstack-routing: begin -->` and `<!-- kstack-routing: end -->`. k-mode reads it at session start; without it, the Balanced preset applies. Edit the routing by re-running `/kstack:k-setup`, not by hand-editing inside the markers.

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
