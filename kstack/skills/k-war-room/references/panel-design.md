# Designing a war-room panel

## Size

| task | panelists | chat turns |
|---|---|---|
| one clear decision, 2-3 options | 3 | 12 |
| a plan or design spanning 2-3 domains | 4-5 | 16-20 |
| multi-domain, high stakes (launch, competition, architecture) | 6 | 24-28 |
| maximum (more makes the chat thin and expensive) | 8 | 32 |

Default chat turns ≈ 4 × panelists, clamped to 12..36. The moderator steers every 7 turns.

## Composition

1. **One seat per domain the decision really touches.** Ask "whose expertise would change the answer?", not "who is related?".
2. **One red-teamer** whose job is to find what is wrong: risks, rule violations, failure modes.
3. **One pragmatist or strategist** who owns deadlines, budget, scoring or business impact.
4. A **user/customer advocate** when the outcome ships to people.
5. Never two seats with the same lens. Merge them, or give one a sharply different stance.

## Stances create the debate

Give every seat an explicit bias that conflicts with at least one other seat. For example:
- "measure before building" vs "ship the big design now";
- "the money is in X" vs "X is a distraction".

Without opposing stances the panel agrees in round one and adds nothing.

## Reading lists

Give each seat 2-5 specific files or sections, so openings are grounded and costs stay bounded. Shared context goes in the brief; expertise-specific depth goes in `read`.

## Names

- Distinct first names, which double as @handles.
- Diverse, realistic full names and believable backgrounds ("ex-NVIDIA CUTLASS", "SGLang maintainer").
- The moderator is "Ada" by default.

## Model mix

**Claude models only by default.** Every seat, the moderator and the verdict run on Claude (`haiku`, `sonnet`, `opus`). External models are an opt-in (`--models mix` or `--external`, below).

**Respect the user's subagent ceiling first.** If `~/.claude/CLAUDE.md` has a K-stack routing block, seat models follow its roles:
- deep technical seats and the red-teamer take the `design` or `review` tier;
- the strategist takes the `docs` or `research` tier;
- the moderator and the verdict take the `review` tier.

Go above the preset (Opus, max effort) only when:
- the user says "burn" or "max";
- the invocation passes `--burn`;
- the user's instructions or a project memory lift the ceiling.

Within the ceiling:

| seat | default |
|---|---|
| deep technical seats (architecture, numerics, security) | strongest allowed, effort `high` |
| strategist / pragmatist / product | `sonnet`, effort `medium` |
| red-teamer | strongest allowed, effort `high` |
| moderator and verdict | strongest allowed, effort `high` |
| chat turns (all Claude seats) | `chatEffort: medium` keeps the chat fast |
| cheap, broad seats (when budget matters) | `haiku`, effort `high` |

Mixing tiers is the diversity lever when all seats are Claude: different models and efforts reason differently. Give conflicting stances to seats on different tiers, so no single tier carries a side alone.

### External seats (opt-in)

Use these only when the user asks (`--models mix`, `--external`, or "include a DeepSeek seat"). An external model is a viewpoint in itself (a different training lineage), so put one on 1-2 seats where a different "school" is plausible. Keep them to at most ~⅓ of the panel: they are slower and less reliable.

Command Code (`cmd`) relay, if the user has it installed and approved:

```
cd <root> && cmd -p "$(cat {PROMPT_FILE})" -m <model> --yolo --trust --skip-onboarding --max-turns {MAX_TURNS} 2>&1 | tail -c 8000
```

Before using one:
1. **Check access.** Run `cmd status`.
2. **Pick the newest model.** Run `cmd --list-models` and take the newest flagship in each family: the highest version number, unless the user named a model. Model names change monthly, so never reuse a pick from memory. As of late October 2026: `deepseek/deepseek-v4.1-flash` (it replaced v4-pro and leads on coding/agentic), `moonshotai/kimi-k3.1-pro`, `zai-org/glm-5.3`, `qwen/qwen3.8-max`.
3. **Preflight it.** SKILL.md step 6: a PONG test per relay, before launch.

`{PROMPT_FILE}` and `{MAX_TURNS}` are filled in by the workflow. Openings get 40 agent turns, chat and votes 16, with one retry at double if the CLI runs out. Other CLIs (`codex exec`, `cursor-agent`, `grok`) work as relays too: verify their non-interactive flags with `--help` and keep them read-only.

## Cost and time (rough)

- **Openings:** N agents in parallel, each reading its list (~50-150k tokens each; the largest cost).
- **Chat:** turns run sequentially at ~20-60 s each (external seats, if any, ~60-120 s), and each turn re-reads the channel (small).
- **Total agent calls** ≈ N (openings) + turns + turns/7 + 1 (ballot) + N (votes) + 2. With 6 seats and 28 turns that is ~46 calls, ~30-45 minutes and ~2M subagent tokens.
