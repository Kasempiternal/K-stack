# K-stack

A Claude-only engineering stack for Claude Code: a rigorous working mode, per-role Sonnet/Opus effort routing, focused skills, and daily-driver hooks.

K-stack is my personal Claude Code stack, and the next version of what used to be Claude Agent System (CAS). I merged the parts of CAS I still use every day (Spectre research, the safety hooks, the Codex and Cursor delegation skills) with my global setup (e2e QA through AgentController, notifications, commit guards). I removed the routers and swarm wrappers that current models no longer need. I also brought in the working mode and playbooks from [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan (MIT), and rebuilt them around Claude-only Sonnet and Opus routing.

## Install

```
/plugin marketplace add Kasempiternal/K-stack
/plugin install kstack@k-stack
/kstack:k-setup
/kstack:k-mode
```

`k-setup` writes a managed `kstack-routing` block into `~/.claude/CLAUDE.md` and asks for a preset. `k-mode` starts the mode.

## How it works

- **The lead is Opus 5.5 at High.** It plans, briefs, reviews diffs, and talks to you. It edits directly only for one-or-two-turn changes.
- **Work routes by role, never by model name.** A playbook step names a role (`build`, `explore`, `review`, ...), and the role resolves to a tier agent: one `kstack:k-*` agent per model/effort pair, since the Agent tool cannot carry effort.
- **Burn** is a deliberate spend-more switch. Say "burn" or name a Max tier and the current task escalates to Sonnet Max or Opus Max. It never turns on by itself.
- **The loop is design → build → review → fix.** Nontrivial changes go through k-design first, every worker diff goes through k-review before landing, and verification happens on the real surface (k-e2e-qa for UI and devices).
- **Nothing is done without evidence.** Workers paste the command and its outcome; unverifiable claims get labeled, not laundered.

## Skills

| Skill | What it does |
|---|---|
| `/kstack:k-mode` | The mode: playbooks, role routing, evidence discipline |
| `/kstack:k-setup` | Writes the role→tier routing block into `~/.claude/CLAUDE.md` |
| `/kstack:k-explore` | Read-only subsystem explanations and git-history archaeology |
| `/kstack:k-design` | Design before code: data shape, interface, file plan, failure cases |
| `/kstack:k-review` | Diff review on separate Opus lenses, judged by the lead |
| `/kstack:k-write` | Prose rules for docs, commits, PRs, and replies |
| `/kstack:k-spectre` | Parallel web/codebase research with independent claim validation |
| `/kstack:k-e2e-qa` | UI and device verification: macOS, iOS, Android, web |
| `/kstack:k-gpt-architect` | Optional: delegate to the Codex MCP to spend ChatGPT quota |
| `/kstack:k-cursor-architect` | Optional: delegate to `cursor-agent` (Grok) to spend Cursor quota |

## Balanced routing (default)

| Role | Covers | Tier |
|---|---|---|
| `mechanical` | renames, formatting, boilerplate, small CSS, changelogs | sonnet-low |
| `docs` | README, developer docs, docstrings, API docs | sonnet-medium |
| `build` | normal features and UI, simple bugs, tests | sonnet-high |
| `build-hard` | large features, complex state, refactors, hard bugs | sonnet-xhigh |
| `explore` | unfamiliar code, repo-wide search, regression archaeology | sonnet-xhigh |
| `research` | web and document research seats (k-spectre) | sonnet-high |
| `design` | architecture, API design, plans, RFCs | opus-high |
| `review` | diff review, simplification, security, claim validation | opus-high |
| `sweep` | final pre-release sweep, stubborn cross-system root cause | opus-xhigh |

Max never appears in a preset; Burn reaches it per task. The full table with Lean and Quality presets lives in `kstack/skills/k-mode/references/routing.md`.

The routing shape follows Artificial Analysis measurements quoted 2026-09-29: Sonnet 5.5 High→XHigh is the useful coding step (Coding Agent Index 55→63), XHigh→Max gains little at ~4x cost, and Opus 5.5 High beats Sonnet XHigh on intelligence per dollar, so judgment roles go to Opus and code volume goes to Sonnet.

## Hooks

| Hook | Event | What it does |
|---|---|---|
| `protect-secrets.js` | PreToolUse `Read\|Edit\|Write\|Bash` | Asks before touching `.env`, private keys, credential files, or commands that expose/exfiltrate secrets |
| `sensitive-command-approval.cjs` | PreToolUse `Bash` | Requires approval for `rm`, `git commit`, and `git push`, including through `sudo`, `env`, `xargs`, `bash -c`, `eval`, and `find -exec` |
| `no-claude-attribution.js` | PreToolUse `Bash` | Denies `git commit` commands containing `Co-Authored-By` lines |
| `kill-before-open.js` | PreToolUse `Bash` | macOS only. When a command opens a `.app`, kills the running instance first so you never test a stale build |
| `notify-session-start.sh` | SessionStart | Records the terminal tab and project so the notifiers below can route |
| `notify-attention.sh` | Notification | macOS only. Posts a notification on permission and idle prompts |
| `notify-stop.sh` | Stop | macOS only. Posts a notification when a task finishes |

## Requirements

- Claude Code with plugin support, plus `node` and `bash` for the hooks (`python3` for the notification scripts).
- macOS for the notification and kill-before-open hooks; they no-op silently elsewhere.
- Optional, only if you use the matching skill: the `codex` MCP for k-gpt-architect, `cursor-agent` for k-cursor-architect, [AgentController](https://github.com/Kasempiternal/agentcontroller) and Maestro for k-e2e-qa.

## Migrating from CAS

The old `cas` plugin is preserved at tag `cas-v7.37.0-final`. Renamed: `spectre` → `k-spectre`, `review` → `k-review`, `gpt-architect` → `k-gpt-architect`. Removed: `cccontrol`, `cyberconan`, `faster`, `gonk-test`, `hydra`, `l30`, `legion`, `orchestrate`, `pcc`, `pcc-opus`, `phoenix`, `setup-hooks`, `setup-swarm`, `shared`, `siege`, `systemcc`, `zk`, the cccontrol-mcp bridge, and the spectra-mcp-server. They were older-model scaffolding now covered natively by Claude Code subagents, effort control, and worktree isolation.

## License

MIT. See `LICENSE` and `NOTICE`.
