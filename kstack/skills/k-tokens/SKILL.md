---
name: k-tokens
description: Cut Claude Code token use. Audit reads your local transcripts and shows where tokens go (idle cache rewrites, context size, polling, Opus agents). Apply is a one-screen settings choice that merges a few documented keys into ~/.claude/settings.json and adds agent working rules to ~/.claude/CLAUDE.md. Use for /k-tokens, "audit my token use", "why is my usage so high", "cheaper agents", "subagent cache TTL", or "auto-compact window".
argument-hint: "[status|audit [--days N] [--project text] [--json]|apply]"
disable-model-invocation: true
allowed-tools: Bash(node *k-tokens*)
---

# K-tokens

!`node "${CLAUDE_SKILL_DIR}/scripts/k-tokens.js" status`

The table above came from the k-tokens script, which ran before you read this skill. It shows the current values next to the recommended ones. Do not edit `~/.claude/settings.json` or `~/.claude/CLAUDE.md` yourself. Only the apply script writes them.

Pick the mode from the argument. With no argument, show the table and ask which mode: `Audit`, `Apply`.

- `status`: show the table and stop. If it starts with `k-tokens error:`, say that line and stop.
- `audit`: go to Audit.
- `apply`: go to Apply.

## Audit

Run the audit script with the user's flags. It reads `~/.claude/projects/**/*.jsonl` on this machine and sends nothing anywhere. On a large history it can take half a minute.

```
node "${CLAUDE_SKILL_DIR}/scripts/k-tokens-audit.js" [--days N] [--project <substring>] [--json]
```

Show the report as printed, then restate the "What to change" section in your own words, most valuable first. Offer to run Apply for the settings it names. Do not read the transcripts yourself.

Notes for reading the report:

- Costs are approximate API list prices from a table at the top of the script. Plan usage meters are not proportional to list price. Treat the numbers as relative weights between models and token kinds.
- An idle cache rewrite is a request that arrives after the cache expired (5 minutes, or 1 hour once the transcript uses the 1 hour cache) and writes most of its context to cache again. It is the cost of waiting.
- Waits and polls are a heuristic: any request with a tool call containing sleep, wait or poll, or a Monitor or TaskOutput call.
- The transcript format is internal to Claude Code and changes between versions. The script skips fields it does not find.

## Apply

Ask one AskUserQuestion call with four questions. Put the recommended option first and label it `(Recommended)`. Skip a question whose setting already matches the recommended value in the table, and say so.

1. **Subagent cache TTL** (header `Cache TTL`):
   - `1h (Recommended)`: agents that wait on long builds or tests keep their cache. Otherwise an idle subagent rewrites its whole context every 5 minutes.
   - `Default (5m)`: removes the key.
2. **Auto-compact window** (header `Compaction`):
   - `250k (Recommended)`: about one compaction per long job, and cheaper per request than a 400k window.
   - `200k`, `300k`.
   - `Default`: removes the key, and Claude Code picks a window for the model.
3. **Default subagent model** (header `Subagents`):
   - `Sonnet (Recommended)`: an agent started without a model never silently inherits Opus.
   - `Inherit`: removes the variable.
4. **Effort per model** (header `Effort`):
   - `Sonnet high, Opus high (Recommended)`: Haiku is not touched.
   - `Leave as is`.

Then ask once, in plain text, whether to add the agent working rules block to `~/.claude/CLAUDE.md` (default yes). It is the block between `<!-- kstack-tokens: begin -->` and `<!-- kstack-tokens: end -->`: batch tool calls, trim output, crop images, wait quietly instead of polling, keep a `HANDOVER.md`, one agent per job, cheap models for log summaries, subagents over teams.

Build the command from the answers. Leave out the flag for any setting the user wants unchanged:

```
node "${CLAUDE_SKILL_DIR}/scripts/k-tokens.js" apply [--ttl 1h|default] [--compact 250000|200000|300000|default] [--subagent-model sonnet|inherit] [--effort high] [--rules on|off] [--dry-run]
```

Run it once with `--dry-run` and show the change list. If the user accepts, run it again without the flag. The script:

- merges only the keys named below and leaves every other byte of `settings.json` as it was;
- backs the file up to `~/.claude/backups/` before writing, and parses it again after the write;
- replaces the CLAUDE.md block in place on a re-run, or appends it.

Finish in three lines or fewer: what changed, where the backup is, and that open sessions need a restart to read the new settings.

## Keys this skill writes

Checked against the Claude Code settings and environment-variable documentation on 2026-10-13.

| Choice | Key | Value |
|---|---|---|
| Subagent cache TTL | `subagentPromptCacheTtl` | `"5m"` or `"1h"`. Needs Claude Code 2.1.242 or later. Applies to subagents, workflows and background helper requests. |
| Auto-compact window | `autoCompactWindow` | Tokens, a number from 100000 to 1000000. |
| Default subagent model | `env.CLAUDE_CODE_SUBAGENT_MODEL` | An alias such as `sonnet`, or a full model name. Used when an agent names no model and its definition has none. `inherit` is the same as unset. |
| Effort | `modelSettings.<model-id>.effortLevel` | `low`, `medium`, `high` or `xhigh`. Needs Claude Code 2.1.251 or later. Keyed by full model id; the script writes `claude-sonnet-5-5` and `claude-opus-5-5`, and `--models` changes the list. |

## Not written, on purpose

- **A settings key for the default subagent model.** The docs list none, only the environment variable above, so the script uses the `env` block.
- **Turning auto-compact off.** The docs describe no value for it in `autoCompactWindow`, so `off` is not offered. `Default` removes the key.
- **A top-level `effortLevel`.** It is documented, but does not apply to Opus 5.5, so the per-model form is used.
- **The cache TTL for the main session.** `ENABLE_PROMPT_CACHING_1H=1` is documented and covers both buckets, but writes cost more per token. The audit mentions it. The script does not set it.

## Things that override the settings

The status table prints a note when one of these is set, since each wins over the setting it matches:

- `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL` and `FORCE_PROMPT_CACHING_5M` over `subagentPromptCacheTtl`.
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW` over `autoCompactWindow`.
- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` over every per-agent model choice.
- `CLAUDE_CODE_EFFORT_LEVEL` over `modelSettings`.

Claude Code ignores the 1 hour cache while a subscription is drawing on usage credits, and an agent definition can set its own `experimental.cacheTtl` or `model`. Those win over the global setting for that agent.
