---
name: k-war-room
description: >-
  Convene a moderated war room. A panel of expert personas played by Claude models (mixed tiers;
  external models only on request) studies a task, opens with grounded positions, debates live in a
  Slack-style @mention chat the user watches in the browser, votes, and writes a transcript plus a
  verdict (decisions with tallies, an action plan with real owners, dissent, open questions, risks).
  Use when the user types /kstack:k-war-room or /k-war-room, or asks for a "war room", "round table", "panel of experts",
  "expert debate", "have experts discuss/argue this", or wants several perspectives before preparing
  something complex or high-stakes (a strategy, architecture, launch, competition, hiring or
  roadmap decision). Not for single-fact questions or routine tasks.
argument-hint: <task or question> [--people N] [--roles "A; B"] [--models claude|mix] [--burn] [--confirm]
---

# K-war-room

Invocation: `/kstack:k-war-room <task or question> [options]`. Natural language works too ("6 people, two Opus seats").

| option | default | meaning |
|---|---|---|
| `--people N` | auto (3-8) | panel size, moderator excluded |
| `--roles "A; B; C"` | auto | fixed roles or names; Claude fills any remaining seats |
| `--models claude\|mix` | `claude` | `claude` = every seat is a Claude model. `mix` = opt-in: 1-2 seats played by external models through a CLI relay |
| `--external "m1,m2"` | none | implies `mix`: the external models to use (`cmd --list-models`) |
| `--turns N` | ≈ 4×N, 12..36 | live-chat messages, moderator steers excluded |
| `--no-openings` | openings on | skip the opening statements (cheaper, shallower) |
| `--burn` | off | lift the subagent model ceiling (Opus allowed, efforts up to max) |
| `--read-write` | read-only | let panelists change files (rarely wanted) |
| `--out DIR` | `<cwd>/war-room/<date>-<slug>/` | where brief.md, transcript.md and verdict.md go |
| `--confirm` | off | show the panel and wait for approval before launching |
| `--no-ui` | UI on | do not start the live chat viewer |

This skill calls the Workflow tool: invoking it is the user's opt-in to multi-agent orchestration.

## Procedure

**1. Scope.** Restate the task in one sentence. If it is too vague to decide anything, ask at most 2 short questions; otherwise go.

**2. Brief.** Read enough of the workspace to write it, then write the full brief to `outDir/brief.md`:
- goal, constraints, deadline and the success metric;
- key facts with numbers, each with its source file;
- the current time in UTC (`date -u`) and any time zones that matter;
- a **glossary** of every artifact or code name the panel will meet (`v1.1`, `E0`, "Track B"…), one line each, saying what it includes. Panels otherwise invent distinctions, such as treating "E0 + fix" as different from E0 when E0 already contains the fix;
- who actually executes work (the user, named agents or teams). Panelists are advisors and cannot run anything;
- a **file map**: absolute paths, one line each. Point at files; never paste them.

Pass the workflow a short `brief` (≤250 words: goal, the decisions to make, the 5 most important facts) plus `briefFile` (the path to brief.md), which every panelist reads first.

**3. Design the panel.** Follow `references/panel-design.md`:
- size and composition: one seat per real domain, a red-teamer, a strategist, and conflicting stances;
- a reading list per seat;
- **Claude models only** by default. Pick model and effort per role within the user's ceiling (a K-stack routing block in `~/.claude/CLAUDE.md`, `--burn`, or a project memory that lifts it). The moderator and the verdict get the strongest allowed model;
- external seats only with `--models mix` or `--external` (see panel-design.md, "External seats (opt-in)");
- apply every user override (`--people`, `--roles`, …).

**4. Show the panel** as a table (name · role · stance in a few words · model/effort), plus the format, turn count and a rough cost/time from panel-design.md. Proceed immediately unless `--confirm` was given.

**5. Prepare `outDir`** (absolute). It already holds brief.md (step 2). Write `panel.json`, the viewer config, per `references/args-schema.md`. Names must match the workflow panel exactly.

**6. Preflight external seats** (only if there are any). For each relay, run its command once with a one-line prompt ("Reply with exactly: PONG") and `--max-turns 2`, timeout 120 s.
- If it fails, try the newest other model of that family. If that fails too, drop the seat to Claude.
- Tell the user what changed.

**7. Launch** the workflow:

```
Workflow({ scriptPath: "${CLAUDE_SKILL_DIR}/war-room.workflow.js", args: {…} })
```

`args` follows `references/args-schema.md`, with `date` set to today and `now` to the current UTC time. Note the transcript dir from the tool result.

**8. Start the live UI** (skip if `--no-ui`):
- Run `python3 "${CLAUDE_SKILL_DIR}/scripts/war_room_live.py" <transcriptDir> <outDir>/panel.json 8787` with Bash `run_in_background`.
- Read the first line it prints (`WAR_ROOM_LIVE http://127.0.0.1:<port>`) to get the URL. The port falls back to a free one if 8787 is taken.
- Open it in the user's browser **without taking focus**: AgentController `open_url` if connected, else `open -g <url>`.
- Tell the user the URL.

What the viewer shows:
- each new message streaming into chat bubbles, plus live per-bot activity ("📖 reading …");
- typing indicators, @mention highlights and "replying to" tags;
- a roster with status and message counts (relay fallbacks are counted per external seat), where clicking a bot filters the chat;
- a stage tracker, dark mode, and the rendered verdict at the end.

**9. While it runs**, do not narrate every message. Answer the user's questions about progress from the viewer data: `curl -s http://127.0.0.1:<port>/data`.

**10. When it completes:**
- Read `outDir/verdict.md` and report the decisions with tallies, the first actions with their owners, and notable dissent.
- If external seats were used, report how many of their messages were relay fallbacks (the verdict's "Panel integrity" line).
- Offer to apply the verdict (e.g. update a plan file). Never apply it unasked.
- The workflow retries a failed or refused verdict on another model by itself. If it still fails, resume with an explicit model:

```
Workflow({ scriptPath, resumeFromRunId, args: <same args> + {"verdictModel": "<another model>"} })
```

  Only the verdict re-runs; everything else is cached.
- Leave the viewer running so the user can scroll back. Stop it (TaskStop) when the user is done or a new war room starts on the same port.

## Rules

- **Read-only by default.** The workflow's prompts forbid edits, submissions and posting. The moderator writes transcript.md and verdict.md; relay agents write only their own prompt file. Keep it that way unless the user passes `--read-write`.
- **Real owners only.** Panelists are advisors. Every action in the verdict names a real executor (the user, an agent role, a team), never a persona.
- **Never fabricate a seat.** A failed external relay posts as "[relay: … played by Claude]", and the badge flips to "Claude (relay fallback)". Report how many messages were relays.
- **Votes are advice, not authority.** Present the verdict, then let the user decide what to adopt. Outward-facing or irreversible actions proposed by the panel still need the user's go-ahead.
- **Mid-run changes:**
  - **Swapping a seat's model or editing the panel or format:** TaskStop the workflow, edit args, and resume with `resumeFromRunId` and the same `scriptPath`. Cached calls are reused up to the first changed call. That seat's calls and everything after them re-run, so swap early: before the chat starts, it costs only that seat's opening.
  - **Viewer:** after a resume, the viewer keeps the latest attempt of each slot and drops later chat turns of a superseded attempt.
  - **UI-only changes:** edit the viewer and restart it. Open tabs reload themselves when `UI_VERSION` changes.

## Files

- `war-room.workflow.js`: the generic workflow (openings → live @mention chat with a fairness cap → ballot and votes → verdict files, with a verdict retry on another model).
- `scripts/war_room_live.py`: the live chat viewer (stdlib only; marked.js and DOMPurify from pinned CDN URLs with SRI, CSP, loopback-only).
- `references/args-schema.md`: workflow args and panel.json formats.
- `references/panel-design.md`: sizing, composition, stances, the model mix, optional external seats, cost.
