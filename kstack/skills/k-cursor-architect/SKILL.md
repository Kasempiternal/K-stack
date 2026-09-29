---
name: k-cursor-architect
description: Delegate focused implementation or investigation from Claude Code to the Cursor Agent CLI (cursor-agent) running Grok 4.7. Use when the user invokes /k-cursor-architect, asks Claude to hand work to Cursor or Grok, or enables session-only delegation. Session mode makes Cursor the exclusive delegation backend and blocks native Claude teammates. Never enables a global or persistent mode.
---

# K-cursor-architect

For people with more than one AI subscription who want to spend the other account's quota (Cursor) instead of Claude's. A Claude-only setup does not need this skill.

Drive the `cursor-agent` CLI through Bash. Claude owns scope, architecture, review, and user communication; Cursor performs the focused repository task.

Cursor is a CLI, not an MCP server. There is no `mcp__cursor__*` tool. Every delegation is a `Bash` call to `cursor-agent -p`.

## Session mode

- Every new session starts off. `/k-cursor-architect on` enables this routing for the current Claude session only; Claude then decides which non-trivial tasks benefit from delegation.
- `/k-cursor-architect off` disables session routing immediately. A one-shot `/k-cursor-architect <task>` delegates only that request and does not alter session mode.
- Session state lives only in the conversation transcript. Never create a global, project, path, or flag-file activation. There are no enforcing hooks; the invariant below is a contract you keep by discipline, and the reply to each delegated task states the mode is on.

## Delegation invariant

- While session mode is on, Cursor is the exclusive delegation backend. Never call `Agent` or substitute any other native Claude subagent. The one exception is k-review, which stays on `kstack:k-*` review tiers so the reviewer is independent of the writer. Claude may still use its direct tools for quick inspection, architecture, review, verification, and integration.
- Treat deep diagnosis, extra effort, parallelism, or an agent-oriented skill as task-shaping guidance, not permission to bypass this invariant. If work has independent branches, keep one Cursor call by default.
- If a referenced skill is missing or cannot run without native teammates, report that briefly and continue with Claude's direct tools plus Cursor. Do not fall back to `Agent`.
- A user who wants native Claude teammates must run `/k-cursor-architect off` first. Do not infer an exception. For a one-shot `/k-cursor-architect <task>`, the same invariant applies until that request is complete.

## In K-stack

While session mode is on, k-mode roles dispatch to Cursor instead of tier agents. Cursor has no separate effort parameter; effort is encoded in the model ID:

| Role | Cursor model ID |
|---|---|
| `mechanical` | `grok-4.7-low` |
| `docs` | `grok-4.7-medium` |
| `build` | `grok-4.7-high` |
| `build-hard` | `grok-4.7-xhigh` |
| `explore` | `grok-4.7-high` |
| `research` | `grok-4.7-medium` |
| `design` | `grok-4.7-xhigh` |
| `review` | `grok-4.7-high` |
| `sweep` | `grok-4.7-xhigh` |

Claude stays the lead and still reviews every diff. The `review` role runs on Claude tiers by default so the reviewer is independent of the writer; say so when you keep a review on Claude.

## Delegate

1. Keep trivial work in Claude. Delegate only when repository inspection, implementation, testing, or a focused review benefits from Cursor.
2. Make one Cursor call by default. Add another only for a genuinely independent task or a targeted follow-up.
3. Write the prompt to a scratchpad file and pass it with `"$(cat <file>)"`. Do not inline a long multi-line prompt directly in the shell argument; quoting and shell expansion will corrupt it.
4. The prompt must contain:
   - the concrete objective;
   - essential constraints and acceptance checks;
   - whether changes are authorized;
   - the banned-command clause (see Permissions);
   - `Final response: <=12 lines with changes, verification, and risks.`
5. Let Cursor inspect the repository. Do not paste large files, restate generic coding rules, request progress narration, or duplicate context already present in the workspace.
6. Review Cursor's result and the relevant diff/tests before reporting completion. Resolve small review issues directly; use one focused follow-up for substantive corrections.

## Model: Grok with effort in the ID

This skill selects the current Grok family only. Never substitute another named model (`gpt-*`, `claude-*`, `composer-*`, `gemini-*`) even when it looks better suited. The single exception is the quota fallback below, which is `auto`, not a chosen model. Run `cursor-agent --list-models` to confirm the current IDs; they change between CLI versions.

| Effort | Model ID | Use it when |
|---|---|---|
| `low` | `grok-4.7-low` | The path is obvious and primarily mechanical: an exact transformation, a tiny edit, boilerplate from a precise spec. |
| `medium` | `grok-4.7-medium` | The task is bounded but needs ordinary planning and verification: a small targeted implementation, structured extraction, a focused question about named files. |
| `high` | `grok-4.7-high` | Behavior, edge cases, multiple steps, or tradeoffs require careful reasoning: behavioral implementation, debugging, test failures, focused review. The default workhorse. |
| `xhigh` | `grok-4.7-xhigh` | A difficult coherent problem has interacting invariants or substantial uncertainty: architecture, security, concurrency, performance, ambiguous cross-cutting work. |

There is no `max` tier; `xhigh` is the ceiling. Do not invent one.

Escalate one step only when risk and complexity justify it up front, or a concrete gap remains such as a missed invariant, unresolved ambiguity, or failed verification. Refine the prompt before retrying; extra effort does not fix a badly scoped task.

### Fast lane

Every tier has a `-fast` twin (`grok-4.7-low-fast`, `-medium-fast`, `-high-fast`, `-xhigh-fast`) that trades priority capacity for latency and consumes premium quota faster.

Use `-fast` only when all are true: the task is low-risk; the relevant surface is already known; expected behavior is unambiguous; and near-instant latency materially helps (granular UI iteration, a precise small edit, a targeted question). Never use `-fast` for broad diagnosis, large refactors, or work touching security, auth, concurrency, persistence, schema or migrations, dependencies, or release behavior. Default to the non-fast variant.

## Build the command

Always pass `--model` explicitly and always use `--output-format json`. JSON returns a clean `result` field plus `session_id` and `usage`; text mode makes failures easy to misread as output.

Investigation or review (read-only, Cursor cannot edit):

```bash
cursor-agent -p --mode plan \
  --model grok-4.7-high \
  --output-format json \
  --workspace /absolute/path/to/repo \
  --trust --approve-mcps \
  "$(cat /path/to/prompt.txt)"
```

Authorized implementation (Cursor may write and run commands):

```bash
cursor-agent -p \
  --model grok-4.7-high \
  --output-format json \
  --workspace /absolute/path/to/repo \
  --force --sandbox disabled --trust --approve-mcps \
  "$(cat /path/to/prompt.txt)"
```

- Use `--workspace <absolute path>` rather than `cd`. The Bash tool resets cwd between calls.
- `--force` is the same thing as `--yolo`; prefer `--force` in scripts.
- Never pass `--force` or `--sandbox disabled` to a read-only investigation. `--mode plan` is what makes it read-only.
- Set the Bash `timeout` to at least 600000 for `high`/`xhigh` work. A Cursor call that exceeds the default timeout is reported as a tool failure even though the agent may still be running.
- Parse the result with `| tail -1` then read `.result`; the CLI prints a single JSON object last.

### Follow-ups

The JSON response carries `session_id`. For a targeted correction on the same task, resume that chat instead of restating context:

```bash
cursor-agent -p --resume <session_id> --model grok-4.7-high \
  --output-format json --workspace /absolute/path "$(cat /path/to/followup.txt)"
```

### Status line

Immediately before every Bash call, show one compact line:

`Cursor → grok-4.7/<effort>: <task>`

This is the user's only visibility into what is running and at what cost.

## Quota handling

Grok is a premium model and the account can run out of usage. The failure looks like this and exits fast, with no work done:

```
ActionRequiredError: Increase limits for faster responses
You're out of usage. Switch to Auto, or ask your admin to increase your limit to continue.
```

On that error: retry the identical call **once** with `--model auto`, then report the result with an explicit two-line warning above it:

```
! Grok out of usage, fell back to `auto`.
! Result NOT produced by Grok.
```

Never bury this. The user chose loud fallback specifically so a result from an unknown model is never mistaken for a Grok result. Do not retry-loop, do not silently downgrade the effort tier to dodge the limit, and do not pick a different named model. If `auto` also fails, stop and report.

## Permissions

Cursor must never execute file removal or history-writing Git commands, or a wrapper intended to bypass those restrictions. Include this clause verbatim in every prompt that authorizes writes:

> Do not delete files, and do not run any Git command that writes history or publishes (committing, amending, tagging, pushing). Do not wrap such a command in another command. If one is required, stop and return the exact proposed command and the reason instead of running it.

`--force` disables Cursor's own approval prompts, so this prompt-level clause plus Claude's review is the only guardrail on those commands. That is why it is not optional.

Only Claude may execute those commands. When Cursor returns a required sensitive action, Claude reviews it and, if appropriate, invokes it once through Bash, where the kstack PreToolUse hooks ask the user. Never treat prior task authority as approval for deletion, committing, or publishing.

For every other in-scope command, use the normal path. Do not create an approval conversation, poll a worker, or ask the user merely because Cursor ran a build, test, formatter, or read-only Git command. Never commit, publish, message externally, or delete unrelated files unless the user authorized it.

Do not add a background watcher, status poller, flag file, scheduler, or menu application.

### Worktree isolation

For a change that could conflict with the user's working tree, add `-w` (or `--worktree <name>`) to run in an isolated git worktree at `~/.cursor/worktrees/<repo>/<name>`. Tell the user where the work landed; a worktree result is not in their checkout.

## Failure

- `cursor-agent: command not found`: report it. Do not install anything.
- Not authenticated: `cursor-agent status` shows the logged-in account; tell the user to run `cursor-agent login`. Never handle or echo `CURSOR_API_KEY`.
- Unknown model ID: re-check against `cursor-agent --list-models` before choosing an alternative. Model IDs change between CLI versions.

If Cursor is unavailable, report that directly. Do not enable another delegation framework or silently install infrastructure.
