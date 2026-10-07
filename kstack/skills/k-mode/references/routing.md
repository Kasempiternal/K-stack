# K-stack routing

Every delegated step names a **role**. The role resolves to a **tier agent**. Never pick a model by name in a playbook.

## Tier agents

The Agent tool's `model` parameter cannot carry effort, so each model/effort pair is its own agent type. Call `Agent` with `subagent_type: "kstack:k-<tier>"` and omit `model`.

| Tier | `subagent_type` |
|---|---|
| Haiku 5.5 Medium | `kstack:k-haiku-medium` |
| Haiku 5.5 High | `kstack:k-haiku-high` |
| Haiku 5.5 XHigh | `kstack:k-haiku-xhigh` |
| Sonnet 5.5 Low | `kstack:k-sonnet-low` |
| Sonnet 5.5 Medium | `kstack:k-sonnet-medium` |
| Sonnet 5.5 High | `kstack:k-sonnet-high` |
| Sonnet 5.5 XHigh | `kstack:k-sonnet-xhigh` |
| Opus 5.5 Medium | `kstack:k-opus-medium` |
| Opus 5.5 High | `kstack:k-opus-high` |
| Opus 5.5 XHigh | `kstack:k-opus-xhigh` |
| Opus 5.5 Max | `kstack:k-opus-max` |

The agents use the `haiku`, `sonnet` and `opus` aliases, so they follow the newest model your account and Claude Code version can reach. Sonnet 5.5 needs Claude Code v2.1.284 or later; Haiku 5.5 needs v2.1.293 or later. Without them an alias resolves to an older model. The routing still applies, but the numbers below were measured on 5.5. `/kstack:k-setup` reports which model each alias resolves to.

`haiku` resolves to Haiku 5.5 only on the Anthropic API. On Bedrock, Google Cloud, Foundry and Claude Platform on AWS it is still Haiku 4.5, which has no effort control and scores 17 on the Intelligence Index. When k-setup finds that, it writes `# haiku: off` into the routing block and every Haiku tier runs as `sonnet-low` instead.

There is no Sonnet Max tier. Sonnet 5.5 at Max effort is forbidden: never dispatch it, and never pass `effort: max` with a Sonnet model. The strongest Sonnet tier is XHigh.

There is no Haiku Max or Haiku Low tier. Max adds 2 Intelligence Index points over XHigh for 1.8x the tokens, and AA measured a 415s time to first token at Max (26s at High), which defeats the point of Haiku. Low saves under a cent per task over Medium and loses 5 points. Work that outgrows Haiku XHigh belongs on Sonnet.

If a `kstack:k-*` type is missing from the session's agent list, call a general-purpose agent with `model: "haiku"`, `"sonnet"` or `"opus"` and say in the reply that effort was not applied.

## Roles

| Role | Covers | Lean | **Balanced** | Quality |
|---|---|---|---|---|
| `scan` | read-only lookups that return facts, not judgments: find files and symbols, grep sweeps, read and summarize logs, CI output or large files, classify or triage a list | haiku-medium | **haiku-high** | haiku-xhigh |
| `mechanical` | renames, formatting, boilerplate, small CSS, changelogs, release notes | haiku-high | **haiku-xhigh** | sonnet-medium |
| `docs` | README, developer docs, docstrings, API docs, summaries of existing code | haiku-xhigh | **sonnet-medium** | sonnet-high |
| `build` | normal features, normal UI, UI polish, simple bugs, writing tests, applying review findings | sonnet-medium | **sonnet-high** | sonnet-xhigh |
| `build-hard` | large multi-file features, complex UI and state, executing a refactor or migration, hard bugs, failing-test investigation | sonnet-high | **sonnet-xhigh** | sonnet-xhigh |
| `explore` | understanding unfamiliar code, repo-wide search, regression archaeology | opus-medium | **opus-medium** | opus-high |
| `research` | web and document research seats (k-spectre) | sonnet-medium | **sonnet-high** | sonnet-xhigh |
| `design` | architecture, system and API design, implementation plans, repo restructuring, RFCs | opus-medium | **opus-high** | opus-xhigh |
| `review` | diff review, simplification, security review, claim validation | opus-medium | **opus-high** | opus-xhigh |
| `sweep` | final pre-release sweep, cross-system or concurrency root cause that resisted `build-hard` | opus-high | **opus-xhigh** | opus-xhigh |

`scan` versus `explore`: `scan` answers "where is X, what does this log say, which of these match". `explore` answers "how does this work and why". A scan result that needs interpretation goes to the lead or to `explore`, not to a second scan.

Max never appears in a preset. It is reached only through Burn.

## Haiku fan-out

Haiku tiers are the workhorse. Tokens on them are cheap enough that splitting the work is the default, not the exception. The scarce resources are the lead's context, file ownership, and real independence, so fan-out is shaped by those.

**Split when** the work divides into slices that need nothing from each other: directories, file sets, log segments, list chunks, or separate lookup questions. Dispatch every slice in one message, so wall time is one worker's, not N.

**Do not split** when a step needs another step's output, when the whole job is a couple of tool calls for one worker, or when writing the briefs would cost the lead more than doing the lookup.

**Shape the fan-out:**

- One slice per worker, disjoint by construction. Name each worker's slice and the other slices' edges in its brief, so nobody wanders into a neighbor's ground.
- At most 8 workers per wave. With more slices than that, give each worker several slices instead of launching more workers. The cap protects the lead's context, not the token bill.
- Each brief has a stop condition and a return cap: facts with `file:line`, at most 20 lines, no narration. The lead reads every report, so a report the lead must skim is waste.
- Workers that write (`mechanical`, Lean `docs`) own disjoint files or run with `isolation: "worktree"`. Two workers never touch one file.
- A slice that fails gets one retry on its Haiku tier, then escalates alone to `sonnet-medium`. The rest of the wave keeps its results.

**Cross-check only what gates a decision.** When a scan fact will decide what the lead does next (the only caller of X, the line that throws), dispatch two scans with different strategies, for example a grep-first scan and a reference-tracing scan. Agreement is evidence. Disagreement goes to `explore`, not to a third scan. Facts that do not gate anything get one scan.

**The lead merges.** It deduplicates, resolves contradictions by reading the cited lines, and passes on its own summary, never the raw reports.

## Active routing

First match wins:

1. Burn, for the task at hand or for the session (`/kstack:k-effort burn`).
2. The latest `/kstack:k-effort` result in this session. Its table replaces the block loaded at session start. After a compaction, a SessionStart hook re-injects it.
3. The `kstack-routing` block in `~/.claude/CLAUDE.md`, written by `/kstack:k-setup` or `/kstack:k-effort`. A role missing from the block (for example `scan` in a block written before 1.2.0) takes the tier from the column its `# preset` line names, or Balanced for `custom`.
4. The Balanced column.

## Burn

Burn is a deliberate "spend tokens, solve this" switch. It turns on only when the user says "burn", "burn mode", names a Max tier, or runs `/kstack:k-effort burn`. A spoken burn applies to the task at hand. `/kstack:k-effort burn` applies to the session until `/kstack:k-effort burn off` or another preset is chosen, and is never saved, the same way `/effort max` is session-only.

- `build`, `build-hard`, `design`, `review`, `sweep` → `k-opus-max`. On the hardest code Opus leads even Sonnet at Max (FrontierCode 54.4 vs 46.2), and Sonnet Max is forbidden anyway.
- Other roles keep their mapping.
- A request for "Sonnet Max" is Burn on `k-opus-max`. Say so in the reply.

State `burn: on` in the reply for any step that ran on a Max tier.

## Escalation

Escalate one step within the role's column before switching roles. `build` that fails twice on the same gate moves to `build-hard`. `build-hard` that fails twice on one root cause moves to `sweep`, and the premise gets questioned before the next attempt (see `principles.md`, Attack the Premise). A Haiku tier that fails a gate once moves to `sonnet-medium` for that task; there is no higher Haiku rung. Never escalate to Max without Burn.

## Security fallback

Anthropic safeguards most cybersecurity work on Opus 5.5 and serves those requests with Opus 4.8 instead. The agent type still says `opus`, so the fallback is silent. Any worker on a security lens (k-review Security and data, a security-flavored `sweep`) ends its report with `model: <exact model ID>`. If the ID is not Opus 5.5, the lead labels those findings `ran on <ID>` and weighs them as a weaker reviewer's. Whether Sonnet 5.5 carries the same safeguard is not documented, so security stays on the `review` tier until measured. Security work never goes to a Haiku tier.

## The lead

The main session is the lead. It plans, briefs, reviews, and talks to the user. Recommended lead: Opus 5.5 at High (`/model opus`, effort high). The lead edits directly only when the change and its check fit in one or two turns. Lookups the lead would otherwise do by reading many files go to `scan`, so the lead's context stays for judgment. Everything else is briefed to a role.

## Why this shape

From Artificial Analysis (2026-09-29 for Sonnet and Opus, 2026-10-08 for Haiku) and Anthropic's Haiku 5.5, Sonnet 5.5 and Opus 5.5 launch pages. The numbers are quoted as reported, not re-measured here.

- Sonnet 5.5 High → XHigh is the useful coding step: Coding Agent Index 55 → 63.
- Sonnet leads agentic terminal work (Terminal-Bench 4.0: 70.6 vs Opus 66.4) and is close on CursorBench 4.0 (55.5 vs 57.8) at half the price ($2/$10 vs $4/$20 per MTok). Code volume stays on Sonnet.
- Opus leads the hardest code (FrontierCode 1.1: 54.4 vs Sonnet-at-Max 46.2) and bug detection (72%), so `sweep`, `review`, and Burn go to Opus.
- Opus 5.5 High reaches Intelligence 54 at lower cost than Sonnet XHigh's 52, so judgment roles go to Opus.
- `explore` is judgment over reading, not code volume. With Opus only 2x Sonnet per token, and Opus 5.5 using 40-50% fewer tokens than Opus 5 on agentic work, Opus Medium is expected to cost about what Sonnet XHigh did. That expectation is not measured per task yet. Re-check it against real session cost.
- Knowledge work is a tie between Sonnet and Opus (GDPval-AA 1844 vs 1846), so `research` and `docs` stay on Sonnet in Balanced.
- Haiku 5.5 costs $0.10/$0.50 per MTok up to 100k-token prompts, 20x below Sonnet, with cache reads at $0.01. Its Intelligence Index runs Medium 34, High 38, XHigh 41, Max 43 at roughly 33k, 55k, 89k and 162k output tokens per task. Even at XHigh, a Haiku task costs a fraction of a Sonnet Low one. Prompts above 100k tokens cost 5x more, which still leaves Haiku 4x below Sonnet.
- Haiku is far behind on agentic coding (Terminal-Bench 4.0: 39.2 vs Sonnet 70.6, AA measured 33), closer on single-shot hard code (FrontierCode 46.4 vs Sonnet XHigh 52.1), and 220 Elo behind on knowledge work (GDPval-AA 1620 vs 1840). Anthropic positions it for lookups, summaries, classification and subagent work under a Sonnet or Opus lead. So Haiku takes `scan` and `mechanical`, `docs` only in Lean, and never `build` or anything that ships claims.
- AA measured a 40% hallucination rate for Haiku 5.5 on AA-Omniscience. `research` seats stay on Sonnet even in Lean, because a researcher's misses are invisible to the claim validators that catch its errors.
- No benchmark covers visual taste. The UI mapping follows coding-agent results, not aesthetics.
