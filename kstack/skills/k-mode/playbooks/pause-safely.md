# Pause safely

**You own a clean stop.** Triggers: an explicit pause, going offline, a restart, imminent compaction.

1. Stop at a safe boundary. Finish or back out of the current atomic step. Start nothing new. Stop running workers.
2. Take no irreversible action to pause. No push, no PR.
3. Make the work durable with one `wip:` commit on the current branch. If the tree is broken, say so in the body.
4. Write the resume note to `/tmp/<slug>-resume.md`: intent, progress and what is verified, current state, next steps, key files, gotchas. Point at `.kstack/log.tsv` if it exists instead of duplicating it.

**Reply:** where you are, what is on disk versus only in your head, commits made, tree state, the first action on resume.
