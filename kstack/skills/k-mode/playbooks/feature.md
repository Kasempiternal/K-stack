# Feature

**You own the design. Plan, brief, review, verify.**

1. **k-explore** over the affected subsystem (`explore`). Skip only when you read it this session.
2. **k-design** for the data shape, interface, and failure cases (`design`). The output is an approved plan: files, shape, tests, verification commands.
3. Throughput checkpoint, four todo items. Mark any that does not apply as `n/a: <reason>`.
   - Blocking first steps that must land before fan-out.
   - Independent workstreams (disjoint files or layers) that can run in parallel.
   - Shared mutable state. Split it first. Serialize only for a real invariant.
   - Smallest safe decomposition. If one worker is best, say why.
4. Build. Brief the plan to `build`, or `build-hard` when it spans many files, complex state, or large screens. Parallel workers get worktrees or disjoint files.
5. Verify on the matching surface (k-e2e-qa for UI and apps). Inconclusive is not a pass.
6. **k-review** the diff (`review`). Send all findings in one brief to `build`. Re-review only the corrected lines.
7. **Shipping changes.**

**Reply:** what the user can now do, the design choice and the rejected alternative, the checkpoint, verification output, open decisions.
