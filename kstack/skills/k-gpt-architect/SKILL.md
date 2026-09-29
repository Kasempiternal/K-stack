---
name: k-gpt-architect
description: Delegate focused implementation or investigation from Claude Code to the Codex MCP. Use when the user invokes /k-gpt-architect, asks Claude to hand work to Codex, or enables session-only delegation. Session mode makes Codex the exclusive delegation backend and blocks native Claude teammates. Never enables a global or persistent mode.
---

# K-gpt-architect

For people with more than one AI subscription who want to spend the other account's quota (ChatGPT via Codex) instead of Claude's. A Claude-only setup does not need this skill.

Use the connected `codex` MCP directly. Claude owns scope, architecture, review, and user communication; Codex performs the focused repository task.

## Session mode

- Every new session starts off. `/k-gpt-architect on` enables this routing for the current Claude session only; Claude then decides which non-trivial tasks benefit from delegation.
- `/k-gpt-architect off` disables session routing immediately. A one-shot `/k-gpt-architect <task>` delegates only that request and does not alter session mode.
- Session state lives only in the conversation transcript. Never create a global, project, path, or flag-file activation. There are no enforcing hooks; the invariant below is a contract you keep by discipline, and the reply to each delegated task states the mode is on.

## Delegation invariant

- While session mode is on, Codex is the exclusive delegation backend. Never call `Agent` or substitute any other native Claude subagent. The one exception is k-review, which stays on `kstack:k-*` review tiers so the reviewer is independent of the writer. Claude may still use its direct tools for quick inspection, architecture, review, verification, and integration.
- Treat deep diagnosis, extra effort, parallelism, or an agent-oriented skill as task-shaping guidance, not permission to bypass this invariant. If work has independent branches, keep one Codex call by default; use another or `ultra` only under the rules below.
- If a referenced skill is missing or cannot run without native teammates, report that briefly and continue with Claude's direct tools plus Codex. Do not fall back to `Agent`.
- A user who wants native Claude teammates must run `/k-gpt-architect off` first. Do not infer an exception. For a one-shot `/k-gpt-architect <task>`, the same invariant applies until that request is complete.

## In K-stack

While session mode is on, k-mode roles dispatch to Codex instead of tier agents:

| Role | Codex model/effort |
|---|---|
| `mechanical` | gpt-6-luna, low |
| `docs` | gpt-6-luna, medium |
| `build` | gpt-6-sol, high |
| `build-hard` | gpt-6-sol, xhigh |
| `explore` | gpt-6-sol, high |
| `research` | gpt-6-sol, medium |
| `design` | gpt-6-astra, high |
| `review` | gpt-6-astra, high |
| `sweep` | gpt-6-astra, xhigh |

Claude stays the lead and still reviews every diff. The `review` role runs on Claude tiers by default so the reviewer is independent of the writer; say so when you keep a review on Claude.

## Delegate

1. Keep trivial work in Claude. Delegate only when repository inspection, implementation, testing, or a focused review benefits from Codex.
2. Make one Codex call by default. Add another only for a genuinely independent task or a targeted follow-up.
3. Pass the absolute working directory and a compact prompt containing:
   - the concrete objective;
   - essential constraints and acceptance checks;
   - whether changes are authorized;
   - `Final response: <=12 lines with changes, verification, and risks.`
4. Let Codex inspect the repository. Do not paste large files, restate generic coding rules, request progress narration, or duplicate context already present in the workspace.
5. Review Codex's result and the relevant diff/tests before reporting completion. Resolve small review issues directly; use one focused follow-up for substantive corrections.

## Select model and effort

Always pass both `model` and `config: {"model_reasoning_effort":"<effort>"}` to the Codex MCP. Do not rely on model defaults: they differ by model and may change. Honor an explicit user choice unless it is unavailable, and never silently substitute a different model or effort.

| Model | Use it for |
|---|---|
| `gpt-6-astra` | Frontier intelligence for the most demanding work: architecture, security, concurrency, ambiguous cross-cutting changes. |
| `gpt-6-sol` | The workhorse for coding and everyday work. This is the default. |
| `gpt-6-luna` | Fast and affordable for easier tasks: mechanical edits, extraction, summaries. |

The `gpt-5.6` family is the older generation. Use it only when the user names it.

Effort selects reasoning depth within the model. Supported: `low` through `max` plus `ultra` for astra and sol; `low` through `max` for luna.

| Effort | Use it when |
|---|---|
| `low` | The path is obvious and primarily mechanical. |
| `medium` | The task is bounded but needs ordinary planning and verification. |
| `high` | Behavior, edge cases, multiple steps, or tradeoffs require careful reasoning. |
| `xhigh` | A difficult coherent problem has interacting invariants or substantial uncertainty. |
| `max` | The hardest single problem needs depth more than speed or token economy. |
| `ultra` | The user explicitly wants parallel delegation and the work has genuinely independent subproblems. Ultra is delegation, not a generic quality upgrade. |

Escalate one effort step only when risk and complexity justify it up front or a concrete gap remains, such as a missed invariant, unresolved ambiguity, or failed verification. Refine the prompt before retrying. Change model when the task class was wrong; do not use extreme effort to compensate for the wrong model.

Immediately before the MCP call, show one compact status line: `Codex → <model>/<effort>: <task>`. This is the user's visibility into what is running. If the MCP rejects the requested combination, report that and choose a supported alternative deliberately.

## Permissions

Use `sandbox: read-only` for investigations and reviews, or `sandbox: workspace-write` when repository edits are authorized. Use `approval-policy: on-request`; never use `never` to bypass safety. Do not add a background watcher, status poller, flag file, scheduler, or menu application. Never auto-approve a command merely because Codex requested it.

Codex must never execute `rm`, `git commit`, `git commit-tree`, `git push`, or a wrapper intended to bypass those restrictions. If one is needed, Codex must stop short of it and return the exact proposed command and reason to Claude.

Only Claude may execute those commands, and the kstack PreToolUse hooks ask the user for each matching Bash call. The skill never treats prior task authority as approval for removal, commit, or push.

For every other in-scope command, use the normal automatic tool path. Do not create an approval conversation, poll a worker, or ask the user merely because Codex ran a build, test, formatter, or read-only Git command. When Codex returns a required sensitive action, Claude reviews it and, if appropriate, invokes it once through Bash; the PreToolUse hook is the sole user approval point.

If Codex requests a consequential action outside the user's clear authority, ask the user. Never commit, push, publish, message externally, or remove unrelated files unless the user authorized it.

## Failure

If the `codex` MCP is unavailable, report that directly and suggest checking `/mcp`. Do not enable another delegation framework or silently install infrastructure.
