---
name: k-design
description: Design before implementing. Opus produces the data shape, interface, file plan, failure cases, tests, and verification commands for a change, and runs a competing-designs bakeoff when the design is contested or has no precedent. Use for architecture, system or API design, implementation plans, repo restructuring, RFC-grade decisions, or from k-mode before code that crosses a function boundary.
---

# K-design

The output is a plan a `build` worker can execute without choosing between alternatives.

## 1. Ground

If the subsystem was not explored this session, run **k-explore** first. Collect the constraints: user requirements, existing conventions, the callers that must keep working, performance or platform limits.

## 2. Design

Dispatch one `design` worker with the constraints and file pointers. It returns:

1. **Data shape.** Core types and their owners. The organizing structure (state machine, typed model, registry, reducer) chosen over scattered conditionals, with the reason.
2. **Interface.** Signatures, inputs and outputs, errors, which existing helper or seam it plugs into.
3. **File plan.** Each file touched or created, and what changes in it. What gets deleted first.
4. **Failure cases.** Edge cases, concurrency, partial failure, retries, and how the design handles each.
5. **Tests.** Behavior-level cases with literal expected values, and where to stub.
6. **Verification.** The exact commands and the surface (k-e2e-qa, CLI run, a script) that prove it works.
7. **Decomposition.** Blocking first steps, parallel workstreams with disjoint files, and the build role for each (`build` or `build-hard`).
8. **Open questions.** Only genuine product or preference calls.

## 3. Bakeoff (contested or novel designs only)

Use when two or more valid shapes exist and the choice matters (error handling model, abstraction layer, state ownership), or when the interaction has no precedent.

- Dispatch two or three `design` workers in one message, same constraints, each told to optimize for a different priority: simplest possible, most extensible, best experience for the end user. Each returns the step 2 shape.
- Dispatch one `sweep` worker as judge. It sees the designs under neutral labels (A, B, C) and scores them on correctness, reader load, blast radius, and fit with the existing code. It picks a base and names any part worth grafting from the others.
- The lead makes the final call and records why the others lost.

An empirical fork (which is faster, which layout reads better) is not a bakeoff. Route it to the Prototype playbook and observe the answer.

## 4. Check the plan

The lead reads the plan against the principles: subtract first, name the data shape, idempotent operations, split shared state, verification on the real surface. Fix gaps directly or send one consolidated revision brief.

## 5. Present

Show the plan compactly: shape, interface, file plan, decomposition, verification, and a tradeoffs table if there was a bakeoff. Proceed to build unless an open question needs the user.
