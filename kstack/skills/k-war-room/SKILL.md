---
name: k-war-room
description: >-
  Convene a moderated war room. A panel of expert personas (mixed Claude tiers plus external models
  such as DeepSeek, Kimi, GLM or Qwen through Command Code) studies a task, opens with grounded
  positions, debates live in a Slack-style @mention chat the user watches in the browser, votes, and
  writes a transcript plus a verdict (decisions with tallies, an action plan, dissent, open questions,
  risks). Use when the user types /kstack:k-war-room or /k-war-room, or asks for a "war room", "round table", "panel of
  experts", "expert debate", "have experts discuss/argue this", or wants several perspectives before
  preparing something complex or high-stakes (a strategy, architecture, launch, competition, hiring or
  roadmap decision). Not for single-fact questions or routine tasks.
argument-hint: <task or question> [--people N] [--roles "A; B"] [--models auto|claude|mix] [--burn] [--confirm]
---

# K-war-room

Invocation: `/kstack:k-war-room <task or question> [options]`. Natural language works too ("6 people, include a DeepSeek seat").

| option | default | meaning |
|---|---|---|
| `--people N` | auto (3-8) | panel size, moderator excluded |
| `--roles "A; B; C"` | auto | fixed roles or names; Claude fills any remaining seats |
| `--models auto\|claude\|mix` | `auto` (= `mix` when `cmd` works) | `claude` = Claude seats only; `mix` = 1-2 external seats |
| `--external "m1,m2"` | auto pick | external models for the external seats (`cmd --list-models`) |
| `--turns N` | ≈ 4×N, 12..36 | live-chat messages, moderator steers excluded |
| `--no-openings` | openings on | skip the opening statements (cheaper, shallower) |
| `--burn` | off | lift the subagent model ceiling (Opus allowed, efforts up to max) |
| `--read-write` | read-only | let panelists change files (rarely wanted) |
| `--out DIR` | `<cwd>/war-room/<date>-<slug>/` | where transcript.md / verdict.md go |
| `--confirm` | off | show the panel and wait for approval before launching |
| `--no-ui` | UI on | do not start the live chat viewer |

This skill calls the Workflow tool: invoking it is the user's opt-in to multi-agent orchestration.

## Procedure

**1. Scope.** Restate the task in one sentence. If it is too vague to decide anything, ask at most 2 short questions; otherwise go.

**2. Brief (≤500 words).** Read enough of the workspace to write it. Cover goal, constraints, deadline, the success metric, key facts with numbers, and a **file map** (absolute paths plus one line each). Point at files; never paste them. Reuse existing docs (HANDOVER.md, PLAN.md, research/) when present.

**3. Design the panel.** Follow `references/panel-design.md`: size, one seat per real domain, a red-teamer, a strategist, and stances that conflict. Each seat gets a reading list and a model and effort that fit the role, within the user's model ceiling.
- External seats: check `cmd status` first, keep to at most ~⅓ of the panel, each a distinct model family.
- Apply every user override (`--people`, `--roles`, `--external`, …).

**4. Show the panel** as a table (name · role · stance in a few words · model/effort), plus the format, turn count and a rough cost/time from panel-design.md. Proceed immediately unless `--confirm` was given.

**5. Prepare `outDir`** (absolute). Write:
- `brief.md`: topic and brief;
- `panel.json`: the viewer config, per `references/args-schema.md`; names must match the workflow panel exactly.

**6. Launch** the workflow:

```
Workflow({ scriptPath: "${CLAUDE_SKILL_DIR}/war-room.workflow.js", args: {…} })
```

`args` follows `references/args-schema.md`, with `date` set to today. Note the transcript dir from the tool result.

**7. Start the live UI** (skip if `--no-ui`):
- Run `python3 "${CLAUDE_SKILL_DIR}/scripts/war_room_live.py" <transcriptDir> <outDir>/panel.json 8787` with Bash `run_in_background`.
- Read the first line it prints (`WAR_ROOM_LIVE http://127.0.0.1:<port>`) to get the URL. The port falls back to a free one if 8787 is taken.
- Open it in the user's browser **without taking focus**: AgentController `open_url` if connected, else `open -g <url>`.
- Tell the user the URL.

What the viewer shows:
- each new message streams in chat bubbles, plus live per-bot activity ("📖 reading …", "🛰️ asking DeepSeek…");
- typing indicators, @mention highlights and "replying to" tags;
- a roster with status and message counts (click a bot to filter);
- a stage tracker;
- dark mode.

**8. While it runs**, do not narrate every message. Answer the user's questions about progress from the viewer data: `curl -s http://127.0.0.1:<port>/data`.

**9. When it completes:**
- Read `outDir/verdict.md` and report the decisions with tallies, the first actions, and notable dissent.
- Offer to apply the verdict (e.g. update a plan file). Never apply it unasked.
- If the verdict step failed (an error, or a safety false positive), resume:

```
Workflow({ scriptPath, resumeFromRunId, args: <same args> + {"verdictModel": "<another model>"} })
```

  Only the verdict re-runs; everything else is cached.
- Leave the viewer running so the user can scroll back. Stop it (TaskStop) when the user is done or a new war room starts on the same port.

## Rules

- **Read-only by default.** The workflow's prompts forbid edits, submissions and posting; only the moderator writes transcript.md and verdict.md. Keep it that way unless the user passes `--read-write`.
- **Never fabricate a seat.** A failed external relay posts as "[relay: … played by Claude]", and the badge flips to "Claude (relay fallback)". Report how many messages were relays.
- **Votes are advice, not authority.** Present the verdict, then let the user decide what to adopt. Outward-facing or irreversible actions proposed by the panel still need the user's go-ahead.
- **Mid-run changes:**
  - Panel or format: stop the workflow, edit args, and resume with `resumeFromRunId`. The unchanged prefix is cached; the first changed call and everything after it re-run.
  - UI-only changes: edit the viewer and restart it. Open tabs reload themselves when `UI_VERSION` changes.

## Files

- `war-room.workflow.js`: the generic workflow (openings → live @mention chat with a fairness cap → ballot and votes → verdict files).
- `scripts/war_room_live.py`: the live chat viewer (stdlib only; marked.js from a pinned CDN URL with SRI).
- `references/args-schema.md`: workflow args and panel.json formats.
- `references/panel-design.md`: sizing, composition, stances, the model mix, external-model relays, cost.
