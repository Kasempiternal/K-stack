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

**Respect the user's subagent ceiling first.** If `~/.claude/CLAUDE.md` has a K-stack routing block (written by `/kstack:k-setup`), seat models follow its roles:
- deep technical seats and the red-teamer take the `design` or `review` tier;
- the strategist takes the `docs` or `research` tier;
- the moderator and the verdict take the `review` tier.

Max effort, and any tier above the preset, only when one of these holds:
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

### External models

External models are a viewpoint in themselves (a different training lineage), so use them on 1-2 seats where a different "school" is plausible. Keep them to at most ~⅓ of the panel: they are slower and less reliable.

Command Code (`cmd`) relay. Use it only if the user has installed and approved it. It runs another model's agent with `--yolo`, so keep the prompt read-only:

```
cd <root> && cmd -p "$(cat {PROMPT_FILE})" -m <model> --yolo --trust --skip-onboarding --max-turns {MAX_TURNS} 2>&1 | tail -c 8000
```

Check `cmd status` and `cmd --list-models` first; model names change often. Example picks (October 2026), each a distinct family:

| model | good for |
|---|---|
| `deepseek/deepseek-v4-pro` | systems, efficiency, infra |
| `moonshotai/kimi-k3` | long-context synthesis |
| `zai-org/glm-5.3` | coding pragmatism |
| `qwen/qwen3.8-max` | agentic and execution planning |
| `minimaxai/minimax-m3` | product/multimodal |
| `xiaomi/mimo-v2.6-pro` | |
| `nvidia/nemotron-3-ultra-550b-a55b` | |

Other CLIs (`codex exec`, `cursor-agent`, `grok`) work as relays too. Verify their non-interactive flags with `--help`, and keep them read-only.

## Cost and time (rough)

- **Openings:** N agents in parallel, each reading its list (~50-150k tokens each; the largest cost).
- **Chat:** turns run sequentially at ~20-60 s each (external seats ~60-120 s), and each turn re-reads the channel (small).
- **Total agent calls** ≈ N (openings) + turns + turns/7 + 1 (ballot) + N (votes) + 2. With 6 seats and 28 turns that is ~46 calls, ~30-45 minutes and ~2M subagent tokens.
