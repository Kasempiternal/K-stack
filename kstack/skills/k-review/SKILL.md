---
name: k-review
description: Review a diff with Opus reviewers on separate lenses (correctness, simplification, security and data, tests), judge the findings as a pragmatic lead, and route fixes to Sonnet in one batch. Use for code review, "review this", "tear this apart", "find blind spots", a final pre-release sweep, or from k-mode before landing any worker diff.
---

# K-review

The deliverable is a verdict, then one fix batch. A Claude-only panel gets its independence from separate lenses and separate contexts rather than separate model families. Agreement across lenses is the high-signal result.

## 1. Scope

- The diff: what the user named, or `git diff <base>...HEAD` on a branch, or the working tree for uncommitted worker output.
- Read enough surrounding code to know the callers of every changed symbol.

## 2. Intent

Write one paragraph on what the change is meant to do, from the request, commits, and PR body. Reviewers judge whether the diff achieves that intent, not whether the intent is right. If the intent is unclear, ask.

## 3. Pick the depth

| Change | Panel |
|---|---|
| Small, local, low risk | The lead reads it. No workers. Say so in the reply. |
| Normal | One `review` worker covering all lenses. |
| Cross-cutting, security, data, concurrency, or migrations | One `review` worker per lens, dispatched in one message. |
| Final pre-release sweep | One `sweep` worker per lens, plus a `review` worker that re-runs every verification command. |

## 4. Lenses

Each reviewer gets the intent, the diff, the file pointers, and its lens. It must cite `file:line` and state a concrete failure scenario for every finding. Output per finding: severity (blocker, major, minor), lens, location, scenario, suggested fix. Read-only. No file writes.

- **Correctness and regressions.** Logic errors, broken callers, changed contracts, error paths, partial failure, races, off-by-one, state that can become invalid.
- **Simplification.** Dead code, one-caller wrappers, duplicated shape assumptions, indirection that adds no value, a missing structure (state machine, registry) that would delete branches. Anything that raises reader load.
- **Security and data.** Input validation at boundaries, injection, authz, secrets in code or logs, destructive operations, migrations, data loss on retry. This reviewer ends its report with `model: <exact model ID>`, because Opus 5.5 silently falls back to Opus 4.8 on most cybersecurity work (see `k-mode/references/routing.md`, Security fallback).
- **Tests and verification.** Do the tests assert behavior with literal expected values? Would they pass with the implementation stubbed out? Is the claimed verification on the right surface? Missing edge cases.

## 5. Judge

You are the lead, not an aggregator. You know the goal and constraints that the reviewers only glimpsed.

1. Merge duplicates and note which lenses raised each finding. Findings raised by more than one lens independently rank first.
2. Verify every blocker and major against the code yourself before accepting it.
3. Bucket every finding:
   - **Act on.** Real correctness, security, or maintainability problems given the actual goal.
   - **Consider.** Legitimate, but the cost may not be worth it now. The user decides.
   - **Noted.** Valid, not actionable at this stage.
   - **Dismissed.** Wrong, missing context, or style preference, with a one-line reason.

## 6. Fix

Send all **act on** items in one brief to a `build` worker, or `build-hard` when a fix crosses files or touches concurrency. The brief lists each finding with its location and the exact fix intent, plus the verification commands. Review the fix diff yourself. Re-run a lens only on the lines it changed. Never auto-apply **consider** items.

## Output

- **Intent.** The paragraph from step 2.
- **Panel.** Each lens with its tier and finding count. For the security lens, the model ID it reported, flagged when it is not Opus 5.5.
- **Act on / Consider / Noted / Dismissed.** Each finding with its lenses and a one-line rationale.
- **Fixed.** What the fix batch changed, with verification output.
