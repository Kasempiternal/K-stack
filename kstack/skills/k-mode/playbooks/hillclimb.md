# Hillclimb

**You own the metric and the experiment's integrity. Workers make the attempts.** One change, one measurement, keep or revert. Never stack untested changes.

1. Ground the workload with **k-explore** and pick a case that reproduces the complaint. Fix one metric, its direction, and a stop predicate that pairs a target with a minimum number of attempts.
2. Build the harness, prove it separates easy from hard cases, then freeze it. Record the baseline and a green regression-gate run.
3. Open `.kstack/log.tsv` with columns: id, hypothesis, change, before, after, delta, tests, verdict. Read it before each attempt.
4. Loop. Each hypothesis names a mechanism. Brief it to `build-hard`. Independent hypotheses run in parallel worktrees. Measure, run the gate, keep only real wins, and revert otherwise. One commit per kept win, staging named files only. Log every row.
5. At a plateau, pivot: change the category, combine near-misses, re-read the source. Stop when the predicate holds or only marginal ideas remain. Never relax the predicate.
6. **Shipping changes** with wins in the order they landed.

**Reply:** metric and target, baseline to final with the percent change, attempts kept versus reverted, one line per win, the log path, the next idea.
