# war-room: workflow args and panel.json

## Workflow args (passed as `args` to `war-room.workflow.js`)

```json
{
  "topic": "One sentence: the question or task the panel must decide",
  "brief": "Short summary (≤250 words): goal, the decisions to make, the 5 most important facts. The full brief lives in briefFile.",
  "briefFile": "/abs/project/root/war-room/YYYY-MM-DD-slug/brief.md",
  "root": "/abs/project/root",
  "date": "YYYY-MM-DD",
  "now": "YYYY-MM-DD HH:MM UTC",
  "executors": "who actually does the work, e.g. 'the user (decisions, spending) and their Claude agents (code, checks)'",
  "slug": "short-kebab-slug",
  "outDir": "/abs/project/root/war-room/YYYY-MM-DD-slug",
  "readOnly": true,
  "verdictModel": null,
  "verdictFallbacks": ["sonnet"],
  "format": { "openings": true, "openingWords": 350, "turns": 20, "steerEvery": 7, "maxWords": 90, "votes": true },
  "moderator": { "name": "Ada", "role": "…", "stance": "…", "model": "opus", "effort": "high" },
  "panel": [
    { "key": "mira", "name": "Mira Okafor", "role": "Principal GPU architect", "stance": "explicit bias that conflicts with someone else",
      "read": "files/sections to read for the opening (absolute or root-relative)",
      "model": "opus", "effort": "high", "chatEffort": "medium" },
    { "key": "sam", "name": "Sam Achterberg", "role": "Strategist", "stance": "…", "read": "…",
      "model": "sonnet", "effort": "medium" }
  ]
}
```

- `key`: unique, lowercase. First names must be unique: they are the @handles.
- Claude seats:
  - `model` ∈ `haiku` | `sonnet` | `opus` (omit to inherit the session model);
  - `effort` ∈ `low` … `max` for the opening, `chatEffort` for chat turns (default `medium`); votes use `medium`.
- `briefFile`: every prompt tells panelists to read it first. `brief` is the inline summary.
- `now`: the current UTC time, so panelists reason about deadlines and time zones correctly.
- `executors`: panelists are told they cannot act themselves; every action they propose, and every action in the verdict, names one of these executors.
- The verdict runs on `verdictModel`, else the moderator's model. If it fails or is refused, the workflow retries on each of `verdictFallbacks` in turn (default `["sonnet"]`, or `["opus"]` when the moderator is on Sonnet).
- `verdictModel`: set it only to force a model when resuming a failed verdict. Only the verdict call re-runs.
- Changing anything else in args between resumes invalidates the cache from the first changed call onward.

### External seat (opt-in only)

Add these fields to a panel entry instead of `model`/`effort`:

```json
{ "key": "wei", "name": "Wei Zhang", "role": "…", "stance": "…", "read": "…",
  "relay": "cd /abs/root && cmd -p \"$(cat {PROMPT_FILE})\" -m deepseek/deepseek-v4.1-flash --yolo --trust --skip-onboarding --max-turns {MAX_TURNS} 2>&1 | tail -c 8000",
  "badge": "DeepSeek V4.1 Flash" }
```

- `relay`: a shell command with the `{PROMPT_FILE}` and `{MAX_TURNS}` placeholders.
- A cheap Claude relay agent (`relayModel`, default `sonnet`, effort low) runs each turn:
  1. it creates a private directory with `mktemp -d`;
  2. it writes the prompt there with the Write tool (no shell heredoc);
  3. it runs the command, retrying once with double the turns if the CLI runs out;
  4. it returns the reply verbatim.
- If the CLI fails, the relay agent plays the seat itself and marks the message "[relay: … played by Claude]".

## panel.json (viewer config, written to outDir before launch)

```json
{
  "topic": "full topic",
  "title": "short sidebar title (≤40 chars)",
  "channel": "#war-room",
  "outDir": "/abs/outDir",
  "root": "/abs/project/root",
  "openings": true,
  "moderator": { "name": "Ada", "role": "Moderator · …", "model": "Claude Opus · high" },
  "personas": [
    { "name": "Mira Okafor", "role": "GPU architect · ex-NVIDIA", "model": "Claude Opus · high" },
    { "name": "Sam Achterberg", "role": "Strategist", "model": "Claude Sonnet · medium" }
  ]
}
```

- An external seat adds `"external": true` and uses its badge as `model`.
- `root` is optional; the viewer shows file paths relative to it.
- Names must equal the workflow panel names (the viewer matches agent labels by name prefix).
- `color` and `initials` are optional. A teal-first palette with no purple is assigned automatically.
- When the run ends, the viewer renders `outDir/verdict.md` below the chat.
