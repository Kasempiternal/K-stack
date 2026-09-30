---
name: k-setup
description: Configure K-stack's role-to-tier routing (which Sonnet or Opus effort each role uses). Writes a managed kstack-routing block into ~/.claude/CLAUDE.md so routing loads in every session. Use for /k-setup, "configure kstack", "kstack preset", or changing K-stack's model routing.
disable-model-invocation: true
---

# K-setup

Write the `kstack-routing` block in `~/.claude/CLAUDE.md`. `k-mode` and every `k-*` skill read it.

## 1. Check the tier agents

List the agent types available in this session. Confirm all eight `kstack:k-*` tiers from `../k-mode/references/routing.md` are present. If any are missing, stop. Tell the user to run `/plugin install kstack@k-stack` and start a new session. There is no Sonnet Max tier; it is forbidden. If a stale `kstack:k-sonnet-max` still appears, tell the user to run `/plugin update kstack` and never dispatch it.

Then check what the aliases resolve to. Dispatch `kstack:k-sonnet-low` and `kstack:k-opus-medium` in one message, each with the prompt `Reply with only your exact model ID.` Report both. If Sonnet is not 5.5, say that the routing still works but its benchmark basis was Sonnet 5.5, and that `claude update` plus account access moves it there automatically.

## 2. Load current state

Read `~/.claude/CLAUDE.md`. If a block between `<!-- kstack-routing: begin -->` and `<!-- kstack-routing: end -->` exists, its `# preset` line and role lines are the current choices. Otherwise start from Balanced.

Legacy config from the pstack port: `~/.claude/pstack-models.md` and `~/.claude/agents/opus-{low,medium,high,xhigh,max}.md`. If any exist, note them for step 6. Do not touch them yet.

## 3. Pick a preset

Ask with AskUserQuestion. Name the current preset when one is recorded.

- `Balanced (recommended)`: Sonnet High for everyday code, Sonnet XHigh for hard code, Opus Medium for exploration, Opus High for design and review, Opus XHigh for sweeps.
- `Lean`: every role one effort step lower.
- `Quality`: every role one step higher, capped at XHigh.
- `Custom`: start from Balanced and change individual roles.

Build the table from the matching column in `routing.md`. For Custom, show every role with its tier. Offer the eight tiers and `inherit` (the role runs on the lead's model, and `model` is omitted on the Agent call). Max tiers are never offered, since Burn reaches them per task.

## 4. Confirm

Show the final role → tier table and ask to accept it or change specific roles.

## 5. Write the block

Replace the existing block, or append it if there is none. Leave the rest of `CLAUDE.md` byte-for-byte unchanged. Shape:

```
<!-- kstack-routing: begin -->
## K-stack routing (written by /kstack:k-setup; re-run to change)
# preset: balanced
Delegate by role. Call Agent with subagent_type "kstack:k-<tier>" and omit model. Max tiers only on explicit "burn".
mechanical: sonnet-low
docs: sonnet-medium
build: sonnet-high
build-hard: sonnet-xhigh
explore: opus-medium
research: sonnet-high
design: opus-high
review: opus-high
sweep: opus-xhigh
<!-- kstack-routing: end -->
```

Re-read the file and confirm the block appears exactly once.

## 6. Retire legacy config

If step 2 found legacy files, list them. Ask once whether to move them to `~/.claude/backups/pstack-legacy-<date>/`. Only move on yes. Never delete them.

## 7. Report

Say the block was written, which preset is active, and that it applies to new sessions. Recommend Opus 5.5 at High as the lead model (`/model opus`, effort high) if the session is on something else.
