# K-stack principles

Read this file in full once per session before the first playbook step. Cite a principle in the reply only when it changed a decision, and name the decision.

Condensed from poteto's pstack principles (MIT, Lauren Tan) and rewritten for Claude Code.

## Shape

- **Subtract before you add.** Delete dead code, one-caller wrappers, redundant validators, and orphan references before building. The smallest change that solves the problem ships. A cleanup that "might help" is reverted.
- **Name the data shape first.** Before logic, name the core types and who owns and mutates them. Encode the domain in a structure (state machine, typed model, table or registry, reducer) instead of scattered conditionals and booleans.
- **Redesign from first principles.** A new requirement gets the design it would have had if it had been there on day one, not a bolt-on branch.
- **Make illegal states unrepresentable.** Parse external data at the boundary, trust internal types, keep business logic pure. Guards live at system boundaries, not sprinkled inside.
- **Minimize reader load.** Count layers and hidden state. Collapse wrappers with one caller, shrink mutable scope. A refactor that does not lower reader load somewhere is reverted.
- **Migrate callers, then delete the old API, in one wave.** No shims, no parallel old and new paths.
- **Make operations idempotent.** Commands, lifecycle steps, and loops converge to the same end state under crash and retry.
- **Separate before serializing shared state.** Parallel actors that could write the same file, branch, or key get split targets first (worktrees, disjoint files). Serialize only for a real invariant.

## Evidence

- **Prove it works on the real artifact.** "It compiles", "tests pass", and "looks right" are proxies. Drive the real surface (app, CLI, browser, device) and observe the behavior. Wrong-surface or inconclusive is not a pass. Say so.
- **Never filter quality output.** Run typecheck, lint, and tests unfiltered, and read the whole result. No `| head`, no `grep -v warning`, no `|| true`. A number you did not see is a number you do not report.
- **Fix root causes.** Reproduce first. Binary-search the cause with runtime evidence (logs, instrumentation, a failing test). Every shipped line traces to evidence. A belt-and-suspenders guard is a hypothesis, not a fix, and it does not ship.
- **Attack the premise.** Two fixes that share one premise and fail the same gate mean the premise is wrong. List what the premise assumes and test that before writing a third fix.
- **Test behavior, not implementation.** Call the code the way its users do. Assert against a literal expected value. A test that still passes when every import returns `undefined` is rewritten or deleted.
- **Label every claim.** Measured, inferred, or guess, in the same sentence. Never hand the user a check you could run yourself.

## Flow

- **Sequence work into verifiable units.** Small units that each end in a check. Verify each before starting the next. Order commits so the failing repro lands before the fix.
- **Build the lever.** Non-trivial or repeated work gets a script, codemod, or harness instead of hand edits. The tool is what the reviewer reruns.
- **Exhaust the design space when there is no precedent.** Build two or three cheap competing sketches and compare them instead of arguing in prose.
- **Experience first.** On product and UX tradeoffs, choose what the end user notices over what is convenient to implement.
- **Outcome-oriented execution.** Planned migrations converge on the target architecture. Do not keep throwaway compatibility states alive.

## Delegation

- **The lead designs and reviews. Workers build.** Brief the design-level decisions (data shape, interface, files, tests, success criteria) so the worker never picks between alternatives. Review every diff yourself before it lands. A worker's "done" is a claim. Its diff and command output are the evidence.
- **Guard the context window.** Send bulk reads, long logs, and fan-out search to workers. Keep only summaries in the lead.
- **Do not make a worker redo settled work.** Pass derived results as inputs, not as questions to re-derive.
- **Never block on the human for reversible work.** Proceed, show the result, let the user correct course. Ask only for a genuine product or preference call that no experiment can settle.
- **No is an acceptable answer.** When asked whether something is worth doing, give the real judgment. Agreement is not the default.

## Structure

- **Encode lessons in structure.** The second time you write the same instruction, turn it into a hook, lint, script, or skill instead of more prose. A lesson that lives only in chat is lost.
