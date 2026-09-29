# Refactoring

**You own the contract. Structure changes, behavior does not.** A discovered bug or missing feature is split out and routed separately.

1. **k-explore** the subsystem (`explore`), then pin behavior before moving anything: a characterization test, snapshot, or equivalence script. Typecheck and lint are not a pin.
2. Name the missing structure and the target shape (module layout, types, call graph as if built today). A target that crosses a function boundary goes through **k-design** (`design`).
3. Subtract first. Delete dead code, one-caller wrappers, and orphan references in their own commit.
4. Move in small behavior-preserving steps, each keeping the pin green. For an API reshape, migrate every caller and delete the old API in the same wave. Brief the moves to `build-hard` (or `mechanical` for pure renames). Spot-check renames in strings, docs, and configs.
5. Prove equivalence on the real artifact: the pin, plus an old-vs-new output diff for larger reshapes.
6. Keep only what lowers reader load. Revert the rest.
7. **k-review**, then **Shipping changes**: subtraction commit, then reshape, then follow-on cleanup.

**Reply:** the structure that changed, the pin, the equivalence proof, the reader-load delta, what shipped and what was reverted.
