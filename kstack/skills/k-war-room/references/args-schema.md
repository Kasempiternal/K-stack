# war-room: workflow args and panel.json

## Workflow args (passed as `args` to `war-room.workflow.js`)

```json
{
  "topic": "One sentence: the question or task the panel must decide",
  "brief": "Shared context (≤500 words): goal, constraints, deadline, success metric, key facts, and a file map with absolute paths. Point at files; don't paste them.",
  "root": "/abs/project/root",
  "date": "YYYY-MM-DD",
  "slug": "short-kebab-slug",
  "outDir": "/abs/project/root/war-room/YYYY-MM-DD-slug",
  "readOnly": true,
  "relayModel": "sonnet",
  "verdictModel": null,
  "format": { "openings": true, "openingWords": 350, "turns": 20, "steerEvery": 7, "maxWords": 90, "votes": true },
  "moderator": { "name": "Ada", "role": "…", "stance": "…", "model": "sonnet", "effort": "high" },
  "panel": [
    { "key": "mira", "name": "Mira Okafor", "role": "Principal GPU architect", "stance": "explicit bias that conflicts with someone else",
      "read": "files/sections to read for the opening (absolute or root-relative)",
      "model": "sonnet", "effort": "high", "chatEffort": "medium" },
    { "key": "wei", "name": "Wei Zhang", "role": "…", "stance": "…", "read": "…",
      "relay": "cd /abs/root && cmd -p \"$(cat {PROMPT_FILE})\" -m deepseek/deepseek-v4-pro --yolo --trust --skip-onboarding --max-turns {MAX_TURNS} 2>&1 | tail -c 8000",
      "badge": "DeepSeek V4 Pro" }
  ]
}
```

- `key`: unique, lowercase. First names must be unique: they are the @handles.
- Claude seats: `model` ∈ `haiku` | `sonnet` | `opus` (omit to inherit the session model); `effort` ∈ `low` … `max` for the opening, `chatEffort` for chat turns (default `medium`), votes use `medium`.
- External seats: set `relay` (shell command with the `{PROMPT_FILE}` and `{MAX_TURNS}` placeholders) and `badge`. A cheap Claude relay agent (`relayModel`, effort low) writes the prompt file, runs the command, returns the reply verbatim, and plays the seat itself, marked "[relay: … played by Claude]", if the CLI fails.
- `verdictModel`: set it only when retrying a failed verdict (resume with the same args plus this field: only the verdict call re-runs).
- Changing anything else in args between resumes invalidates the cache from the first changed call onward.

## panel.json (viewer config, written to outDir before launch)

```json
{
  "topic": "full topic",
  "title": "short sidebar title (≤40 chars)",
  "channel": "#war-room",
  "outDir": "/abs/outDir",
  "root": "/abs/project/root",
  "openings": true,
  "moderator": { "name": "Ada", "role": "Moderator · …", "model": "Claude Sonnet" },
  "personas": [
    { "name": "Mira Okafor", "role": "GPU architect · ex-NVIDIA", "model": "Claude Sonnet · high" },
    { "name": "Wei Zhang", "role": "DeepSeek-style infra", "model": "DeepSeek V4 Pro", "external": true }
  ]
}
```

`root` is optional: the viewer shows file paths relative to it. Names must equal the workflow panel names (the viewer matches agent labels by name prefix). `color` and `initials` are optional (a teal-first palette, no purple, is assigned automatically).
