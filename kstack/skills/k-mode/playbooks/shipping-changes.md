# Shipping changes

Invoked at the end of every code playbook.

**Identity.** Before the first commit, run `git config user.email` and check it matches the owner of the remote. On a mismatch, set a repo-local identity. Never change the global one.

**Worktrees.** Parallel workers on one repo each get their own worktree (`isolation: "worktree"`) or disjoint files. A dirty branch with unrelated work: stash or patch it out, then work from a fresh worktree.

**Commits.**
- Commit liberally while working. Before a PR, rebase into small ordered commits that each land on their own and tell the story.
- Messages follow Conventional Commits: `type(scope): imperative subject`, lowercase, no trailing period, 72 characters or fewer. Use `!` plus a `BREAKING CHANGE:` footer for breaking changes. The body explains why.
- Split changes that span several types into separate commits.
- No AI attribution or `Co-Authored-By` lines. The `no-claude-attribution` hook enforces this.
- Stage named files only. Never `git add -A` across unrelated work.

**Before the PR.** Run **k-review** on the full diff if it has not run yet. Run **k-write** over the title, description, and commit bodies.

**PR description.** It is a briefing, not a lab notebook. Sections in order, dropping empty ones:
- `## Why`. Intent and approach in one or two short paragraphs.
- `## Scope`. Bullets naming real symbols and paths. Both sides of any rename.
- `## Tradeoffs`. Only the alternatives a reviewer would ask about.
- `## Blast radius`. One to three sentences on who is affected and why it is safe or risky.
- `## Verification`. Each real run and its outcome. One primary number in `before → after` form for perf changes.

Attach screenshots or recordings when they prove a claim.

**Size.** Prefer several narrow PRs to one large PR. A stack is a chain of base branches: the root targets trunk, and each child targets its parent (`gh pr create --base <parent>`). Open PRs ready for review, not as drafts.

**Push.** Push and open the PR only when the user asked for it, or under an autonomy grant that covers it. Force-pushing a shared branch always needs a fresh confirmation.
