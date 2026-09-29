# Autonomous run

**You own the exit condition. Define done, then drive to it.**

1. State the exit predicate so it can be checked: tests green, repro fixed, N PRs merge-ready, pixel diff zero.
2. Pick a wake mechanism. Event-driven work (CI, a merge) uses a background watcher or `/loop` on the event, with a long heartbeat as fallback. Otherwise use a fixed interval sized to when the result is worth re-checking.
3. Each iteration makes the smallest change the evidence justifies, routed by role, and verifies it against the predicate. Commit if it advanced. Revert if it did not.
4. Mid-run discoveries (a broken skill, a flaky check, a related bug) are yours to fix, in their own commit or PR. Surface only irreversible actions, genuine preference calls, or a real dead end.
5. Log each iteration in `.kstack/log.tsv`.
6. A plateau is not a stop. Pivot. Never relax the predicate to declare victory.

**Reply:** the predicate, iterations run, what landed, what was discarded, final predicate state.
