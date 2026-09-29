# K-stack routing

Every delegated step names a **role**. The role resolves to a **tier agent**. Never pick a model by name in a playbook.

## Tier agents

The Agent tool's `model` parameter cannot carry effort, so each model/effort pair is its own agent type. Call `Agent` with `subagent_type: "kstack:k-<tier>"` and omit `model`.

| Tier | `subagent_type` |
|---|---|
| Sonnet 5.5 Low | `kstack:k-sonnet-low` |
| Sonnet 5.5 Medium | `kstack:k-sonnet-medium` |
| Sonnet 5.5 High | `kstack:k-sonnet-high` |
| Sonnet 5.5 XHigh | `kstack:k-sonnet-xhigh` |
| Sonnet 5.5 Max | `kstack:k-sonnet-max` |
| Opus 5.5 Medium | `kstack:k-opus-medium` |
| Opus 5.5 High | `kstack:k-opus-high` |
| Opus 5.5 XHigh | `kstack:k-opus-xhigh` |
| Opus 5.5 Max | `kstack:k-opus-max` |

The agents use the `sonnet` and `opus` aliases, so they follow the newest model your account and Claude Code version can reach. Sonnet 5.5 needs Claude Code v2.1.284 or later and account access. Without both, `sonnet` resolves to an older Sonnet. The routing still applies, but the numbers below were measured on 5.5. `/kstack:k-setup` reports which model each alias resolves to.

If a `kstack:k-*` type is missing from the session's agent list, call a general-purpose agent with `model: "sonnet"` or `model: "opus"` and say in the reply that effort was not applied.

## Roles

The active mapping lives in the `kstack-routing` block of `~/.claude/CLAUDE.md`, written by `/kstack:k-setup`. That block wins. With no block, use the Balanced column.

| Role | Covers | Lean | **Balanced** | Quality |
|---|---|---|---|---|
| `mechanical` | renames, formatting, boilerplate, small CSS, changelogs, release notes | sonnet-low | **sonnet-low** | sonnet-medium |
| `docs` | README, developer docs, docstrings, API docs, summaries of existing code | sonnet-low | **sonnet-medium** | sonnet-high |
| `build` | normal features, normal UI, UI polish, simple bugs, writing tests, applying review findings | sonnet-medium | **sonnet-high** | sonnet-xhigh |
| `build-hard` | large multi-file features, complex UI and state, executing a refactor or migration, hard bugs, failing-test investigation | sonnet-high | **sonnet-xhigh** | sonnet-xhigh |
| `explore` | understanding unfamiliar code, repo-wide search, regression archaeology | sonnet-high | **sonnet-xhigh** | sonnet-xhigh |
| `research` | web and document research seats (k-spectre) | sonnet-medium | **sonnet-high** | sonnet-xhigh |
| `design` | architecture, system and API design, implementation plans, repo restructuring, RFCs | opus-medium | **opus-high** | opus-xhigh |
| `review` | diff review, simplification, security review, claim validation | opus-medium | **opus-high** | opus-xhigh |
| `sweep` | final pre-release sweep, cross-system or concurrency root cause that resisted `build-hard` | opus-high | **opus-xhigh** | opus-xhigh |

Max never appears in a preset. It is reached only through Burn.

## Burn

Burn is a deliberate "spend tokens, solve this" switch. It turns on only when the user says "burn", "burn mode", or names a Max tier. It applies to the task at hand, not the session.

- `build`, `build-hard` → `k-sonnet-max`. Sonnet Max is the strongest pure Claude coding agent measured, and the most token-hungry.
- `design`, `review`, `sweep` → `k-opus-max`, for deep analysis where code is not the main output.
- Other roles keep their mapping.

State `burn: on` in the reply for any step that ran on a Max tier.

## Escalation

Escalate one step within the role's column before switching roles. `build` that fails twice on the same gate moves to `build-hard`. `build-hard` that fails twice on one root cause moves to `sweep`, and the premise gets questioned before the next attempt (see `principles.md`, Attack the Premise). Never escalate to Max without Burn.

## The lead

The main session is the lead. It plans, briefs, reviews, and talks to the user. Recommended lead: Opus 5.5 at High (`/model opus`, effort high). The lead edits directly only when the change and its check fit in one or two turns. Everything else is briefed to a role.

## Why this shape

From Artificial Analysis, 2026-09-29. The numbers are quoted as reported, not re-measured here.

- Sonnet 5.5 High → XHigh is the useful coding step: Coding Agent Index 55 → 63.
- XHigh → Max gains 63 → 68 at roughly 4x the cost and tokens per task, so Max stays manual.
- Opus 5.5 High reaches Intelligence 54 at lower cost than Sonnet XHigh's 52, so judgment roles go to Opus and code volume goes to Sonnet.
- No benchmark covers visual taste. The UI mapping follows coding-agent results, not aesthetics.
