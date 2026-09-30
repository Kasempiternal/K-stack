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
| Opus 5.5 Medium | `kstack:k-opus-medium` |
| Opus 5.5 High | `kstack:k-opus-high` |
| Opus 5.5 XHigh | `kstack:k-opus-xhigh` |
| Opus 5.5 Max | `kstack:k-opus-max` |

The agents use the `sonnet` and `opus` aliases, so they follow the newest model your account and Claude Code version can reach. Sonnet 5.5 needs Claude Code v2.1.284 or later and account access. Without both, `sonnet` resolves to an older Sonnet. The routing still applies, but the numbers below were measured on 5.5. `/kstack:k-setup` reports which model each alias resolves to.

There is no Sonnet Max tier. Sonnet 5.5 at Max effort is forbidden: never dispatch it, and never pass `effort: max` with a Sonnet model. The strongest Sonnet tier is XHigh.

If a `kstack:k-*` type is missing from the session's agent list, call a general-purpose agent with `model: "sonnet"` or `model: "opus"` and say in the reply that effort was not applied.

## Roles

The active mapping lives in the `kstack-routing` block of `~/.claude/CLAUDE.md`, written by `/kstack:k-setup`. That block wins. With no block, use the Balanced column.

| Role | Covers | Lean | **Balanced** | Quality |
|---|---|---|---|---|
| `mechanical` | renames, formatting, boilerplate, small CSS, changelogs, release notes | sonnet-low | **sonnet-low** | sonnet-medium |
| `docs` | README, developer docs, docstrings, API docs, summaries of existing code | sonnet-low | **sonnet-medium** | sonnet-high |
| `build` | normal features, normal UI, UI polish, simple bugs, writing tests, applying review findings | sonnet-medium | **sonnet-high** | sonnet-xhigh |
| `build-hard` | large multi-file features, complex UI and state, executing a refactor or migration, hard bugs, failing-test investigation | sonnet-high | **sonnet-xhigh** | sonnet-xhigh |
| `explore` | understanding unfamiliar code, repo-wide search, regression archaeology | opus-medium | **opus-medium** | opus-high |
| `research` | web and document research seats (k-spectre) | sonnet-medium | **sonnet-high** | sonnet-xhigh |
| `design` | architecture, system and API design, implementation plans, repo restructuring, RFCs | opus-medium | **opus-high** | opus-xhigh |
| `review` | diff review, simplification, security review, claim validation | opus-medium | **opus-high** | opus-xhigh |
| `sweep` | final pre-release sweep, cross-system or concurrency root cause that resisted `build-hard` | opus-high | **opus-xhigh** | opus-xhigh |

Max never appears in a preset. It is reached only through Burn.

## Burn

Burn is a deliberate "spend tokens, solve this" switch. It turns on only when the user says "burn", "burn mode", or names a Max tier. It applies to the task at hand, not the session.

- `build`, `build-hard`, `design`, `review`, `sweep` → `k-opus-max`. On the hardest code Opus leads even Sonnet at Max (FrontierCode 54.4 vs 46.2), and Sonnet Max is forbidden anyway.
- Other roles keep their mapping.
- A request for "Sonnet Max" is Burn on `k-opus-max`. Say so in the reply.

State `burn: on` in the reply for any step that ran on a Max tier.

## Escalation

Escalate one step within the role's column before switching roles. `build` that fails twice on the same gate moves to `build-hard`. `build-hard` that fails twice on one root cause moves to `sweep`, and the premise gets questioned before the next attempt (see `principles.md`, Attack the Premise). Never escalate to Max without Burn.

## Security fallback

Anthropic safeguards most cybersecurity work on Opus 5.5 and serves those requests with Opus 4.8 instead. The agent type still says `opus`, so the fallback is silent. Any worker on a security lens (k-review Security and data, a security-flavored `sweep`) ends its report with `model: <exact model ID>`. If the ID is not Opus 5.5, the lead labels those findings `ran on <ID>` and weighs them as a weaker reviewer's. Whether Sonnet 5.5 carries the same safeguard is not documented, so security stays on the `review` tier until measured.

## The lead

The main session is the lead. It plans, briefs, reviews, and talks to the user. Recommended lead: Opus 5.5 at High (`/model opus`, effort high). The lead edits directly only when the change and its check fit in one or two turns. Everything else is briefed to a role.

## Why this shape

From Artificial Analysis (2026-09-29) and Anthropic's Sonnet 5.5 and Opus 5.5 launch pages. The numbers are quoted as reported, not re-measured here.

- Sonnet 5.5 High → XHigh is the useful coding step: Coding Agent Index 55 → 63.
- Sonnet leads agentic terminal work (Terminal-Bench 4.0: 70.6 vs Opus 66.4) and is close on CursorBench 4.0 (55.5 vs 57.8) at half the price ($2/$10 vs $4/$20 per MTok). Code volume stays on Sonnet.
- Opus leads the hardest code (FrontierCode 1.1: 54.4 vs Sonnet-at-Max 46.2) and bug detection (72%), so `sweep`, `review`, and Burn go to Opus.
- Opus 5.5 High reaches Intelligence 54 at lower cost than Sonnet XHigh's 52, so judgment roles go to Opus.
- `explore` is judgment over reading, not code volume. With Opus only 2x Sonnet per token, equal cache-read pricing ($0.20), and Opus 5.5 using 40-50% fewer tokens than Opus 5 on agentic work, Opus Medium is expected to cost about what Sonnet XHigh did. That expectation is not measured per task yet. Re-check it against real session cost.
- Knowledge work is a tie (GDPval-AA 1844 vs 1846), so `research` and `docs` stay on Sonnet.
- No benchmark covers visual taste. The UI mapping follows coding-agent results, not aesthetics.
