# Perf issue

**You own the measurement. Every fix ties to a number, never to reading source.**

1. Capture a baseline on the real workload: a repeatable command, median of N runs.
2. Ground hypotheses with **k-explore** (`explore`) and the trace. A strategy earns an attempt only when the trace shows its signal: elimination (does the work need to exist), divide and conquer, caching (name the invalidation), indirection (index, queue), batching, redundancy, lazy evaluation, scheduling off the interactive path.
3. One hypothesis per attempt, briefed to `build-hard`. Measure after each attempt. Keep a change only when it moves past the noise and the tests stay green.
4. Compare the artifacts (diff the traces or numbers). Inconclusive is not a pass.
5. **k-review**, then **Shipping changes** with `before → after` and its unit in the PR.

For a sustained loop against a target, use Hillclimb.

**Reply:** baseline, final number, delta, artifact path.
