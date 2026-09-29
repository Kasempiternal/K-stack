# Bug fix

**You own the root cause. Every shipped line traces to runtime evidence.**

1. Reproduce it yourself on the matching surface (k-e2e-qa for apps and devices, the real CLI or server otherwise). Ask the user only after driving the surface as far as it goes, with the specific reason it cannot reach the bug. If it will not fire, synthesize the trigger or instrument until it does.
2. Binary-search the cause. List candidate hypotheses, seeded by **k-explore** (`explore`, include regression history). Each pass takes the split that removes the most remaining space, gets runtime evidence, and eliminates. Unknown state gets logging, not guessing. Simple bugs run on `build`. An unknown root cause runs on `build-hard`. A cross-service, concurrency, or intermittent-under-load bug goes to `sweep`, read-only first.
3. Confirm the surviving mechanism with evidence before planning the fix. Two failed fixes on one premise trigger Attack the Premise.
4. Plan the smallest fix the evidence justifies. If it crosses a function boundary, **k-design** first. Brief to `build`.
5. Verify on the same surface. The original repro now passes. Unit tests alone show branch behavior, not bug absence.
6. Commit the failing repro or test before the fix when a cheap test path exists.
7. **k-review**, then **Shipping changes.**

**Reply:** what was broken, the root cause with its evidence, the fix, and repro output failing then passing, verbatim.
