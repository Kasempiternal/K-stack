---
name: k-effort
description: Switch K-stack's routing level the way /effort switches session effort. Levels are lean < balanced < quality, plus burn on top. A typed level applies now and is saved as the default; add "session" to keep it to this session. Use for /k-effort, "kstack effort", "cheaper kstack routing", or "more effort on kstack".
argument-hint: "[lean|balanced|quality|up|down|burn|burn off] [session]"
disable-model-invocation: true
allowed-tools: Bash(node *k-effort.js*)
---

# K-effort

!`node "${CLAUDE_SKILL_DIR}/scripts/k-effort.js" --data "${CLAUDE_PLUGIN_DATA}" --session-id "${CLAUDE_SESSION_ID}" $ARGUMENTS`

The output above came from the k-effort script, which ran before you read this skill. It has already done the work. Do not edit `~/.claude/CLAUDE.md` yourself.

## Read the output

- **`k-effort error: ...`**: say the error in one line and stop.
- **A status after an explicit `status`**: show the table and stop.
- **A status after no argument**: show the table. Then ask one AskUserQuestion call with two questions:
  1. Level: `Lean`, `Balanced`, `Quality`, `Burn (session only)`. Mark the current one.
  2. Scope (skip for Burn): `Save as default (Recommended)`, `This session only`.

  Run the choice with Bash:
  `node "${CLAUDE_SKILL_DIR}/scripts/k-effort.js" --data "${CLAUDE_PLUGIN_DATA}" --session-id "${CLAUDE_SESSION_ID}" <level> [session]`
  where `<level>` is `lean`, `balanced`, `quality` or `burn`. Then handle that output as below.
- **A new routing table**: it is active now.

## When a new table is active

From this turn on, dispatch every role to the tier in that table. It replaces the `kstack-routing` block that loaded with this session, until the next `/kstack:k-effort` or the end of the session. After a compaction, a SessionStart hook injects the same table again.

Reply in three lines or fewer: the level, whether it was saved or is session-only, and the table if the user did not see it already. When it was saved, add that other open sessions keep their old routing until they restart.

On `burn: on`, also say that `build`, `build-hard`, `design`, `review` and `sweep` now run on Opus Max for the rest of the session, and that `/kstack:k-effort burn off` ends it.

This skill never changes the lead's own model or effort. That is `/model` and `/effort`.
