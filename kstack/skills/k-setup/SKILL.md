---
name: k-setup
description: Configure K-stack's role-to-tier routing (which Haiku, Sonnet or Opus effort each role uses). Writes a managed kstack-routing block into ~/.claude/CLAUDE.md so routing loads in every session. Use for /k-setup, "configure kstack", "kstack preset", or changing K-stack's model routing. For a quick level switch, /k-effort is faster.
disable-model-invocation: true
---

# K-setup

Write the `kstack-routing` block in `~/.claude/CLAUDE.md`. `k-mode` and every `k-*` skill read it. To switch between presets without the checks below, `/kstack:k-effort` does it in one command.

## 1. Check the tier agents

List the agent types available in this session. Confirm all eleven `kstack:k-*` tiers from `../k-mode/references/routing.md` are present. If any are missing, stop. Tell the user to run `/plugin update kstack` (or `/plugin install kstack@k-stack`) and start a new session. There is no Sonnet Max tier; it is forbidden. If a stale `kstack:k-sonnet-max` still appears, tell the user to run `/plugin update kstack` and never dispatch it.

Then check what the aliases resolve to. Dispatch `kstack:k-haiku-medium`, `kstack:k-sonnet-low` and `kstack:k-opus-medium` in one message, each with the prompt `Reply with only your exact model ID.` Report all three. If Sonnet is not 5.5, say that the routing still works but its benchmark basis was Sonnet 5.5, and that `claude update` plus account access moves it there automatically. If Haiku is not 5.5 (Bedrock, Google Cloud and Foundry still serve Haiku 4.5, which has no effort control), say so and plan to write the block with `--haiku off`, so every Haiku role runs as `sonnet-low`.

## 2. Load current state

Read `~/.claude/CLAUDE.md`. If a block between `<!-- kstack-routing: begin -->` and `<!-- kstack-routing: end -->` exists, its `# preset` line and role lines are the current choices. Otherwise start from Balanced.

Legacy config from the pstack port: `~/.claude/pstack-models.md` and `~/.claude/agents/opus-{low,medium,high,xhigh,max}.md`. If any exist, note them for step 6. Do not touch them yet.

## 3. Pick a preset

Ask with AskUserQuestion. Name the current preset when one is recorded.

- `Balanced (recommended)`: Haiku for lookups and mechanical edits, Sonnet High for everyday code, Sonnet XHigh for hard code, Opus Medium for exploration, Opus High for design and review, Opus XHigh for sweeps.
- `Lean`: every role one effort step lower, and docs move to Haiku.
- `Quality`: every role one step higher, capped at XHigh. Mechanical edits move back to Sonnet.
- `Custom`: start from Balanced and change individual roles.

Build the table from the matching column in `routing.md`. For Custom, show every role with its tier. Offer the ten non-Max tiers and `inherit` (the role runs on the lead's model, and `model` is omitted on the Agent call). Max tiers are never offered, since Burn reaches them per task.

## 4. Confirm

Show the final role → tier table and ask to accept it or change specific roles.

## 5. Write the block

Write it with the k-effort script, which replaces the existing block or appends one and leaves the rest of `CLAUDE.md` byte-for-byte unchanged:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/k-effort/scripts/k-effort.js" --data "${CLAUDE_PLUGIN_DATA}" --session-id "${CLAUDE_SESSION_ID}" set <lean|balanced|quality> [role=tier ...] [--haiku off]
```

For Custom, pass Balanced as the base and one `role=tier` per changed role; the script records `# preset: custom`. Add `--haiku off` when step 1 found Haiku 4.5. If the output starts with `k-effort error:`, fix the choice with the user and run it again.

Re-read the file and confirm the block appears exactly once.

## 6. Retire legacy config

If step 2 found legacy files, list them. Ask once whether to move them to `~/.claude/backups/pstack-legacy-<date>/`. Only move on yes. Never delete them.

## 7. Report

Say the block was written and which preset is active. It is also active in this session from now on, and other sessions pick it up when they restart. Mention `/kstack:k-effort` for switching levels later. Recommend Opus 5.5 at High as the lead model (`/model opus`, effort high) if the session is on something else.
