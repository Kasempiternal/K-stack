---
name: k-agent-time
description: Use when asked to improve, optimize, redesign or solve an open-ended technical problem, or before dismissing an option as too big, slow or costly. Prices effort for agents, not human-hours.
---

# Agent time

Your sense of what is "too big" was learned from human writing, where every effort estimate is in human hours. Those estimates bundle costs that barely apply to you: typing the code, learning the domain, coordinating people. Carried over unexamined, they remove the strongest options before you ever consider them: the rewrite, the specialized engine, the custom tool, the brute-force search.

Do not drop cost reasoning. Re-price it. Code is nearly free for you. Knowing that the code works is not.

## Price list

Cheap for agents, and never by itself a reason to reject an option:
- Writing code at any volume, including code you will throw away
- Reading an entire codebase, every relevant paper, every issue thread
- Writing tests, harnesses, fuzzers, profilers and simulators
- Porting, translating and re-implementing
- Generating many variants and comparing them
- Running independent attempts in parallel

Still expensive, so price these honestly:
- **Verification.** Is there an oracle: a reference implementation, a test suite, a spec, a benchmark that cannot be gamed? If not, building one is the first task.
- **Feedback latency.** Wall-clock per iteration (build, benchmark, training run, deploy) x iterations needed / parallel hardware available. More agents do not make a GPU run faster.
- **Discovery.** Edge cases that only real traffic, hardware or users reveal. Most of an old system's age is stored discovery; reuse it as an oracle instead of relearning it.
- **Human attention.** Decisions, review, taste, approvals. Now the scarcest resource. Prefer designs a machine can check over designs a human must read line by line.
- **Compute cost.** Tokens and hardware, in money. Usually small next to salaries, never zero.
- **Blast radius.** How reversible the change is, and what breaks if it is wrong.
- **Coherence.** Whether the work splits into parallel streams behind stable interfaces.

## Procedure

Scale this to the request. For a small, well-scoped fix, a one-line check that no bigger option clearly dominates is enough.

1. **Generate before judging.** Options you never write down cannot win. List options at every tier before evaluating any:
   - Tune: configuration, flags, parameters
   - Swap: replace a component with a better existing one
   - Build: write the missing piece (a kernel, a scheduler, a tool)
   - Specialize: code for exactly this workload, shape, hardware and data, with no generality
   - Search: generate many candidates and let measurement choose
   - Rebuild: re-implement the system, with the old one as the oracle
   - Reframe: change the problem (a different model, different data, or removing the need)

   Include at least one Specialize, Search or Rebuild option, even if you reject it.
2. **Translate human estimates.** When you think "this would take months", split it: how much is producing code (cheap), and how much is discovery, waiting on the world, coordination and review? Re-estimate only the expensive parts.
3. **Name the binding constraint** of each option: the one cost that sets its real duration. "A lot of code" is never the binding constraint.
4. **Attack the constraint, not the option.** No verifier: the plan starts by building one. GPU wall-clock: parallelize or ask for hardware. Review load: design for machine-checked correctness.
5. **Choose by expected value**: likely gain x chance of success - real cost. Take the cheap wins first; a flag worth 2x still beats a rewrite worth 2.2x. The aim is to make the ambitious option visible and correctly priced, not to always choose it.

## Estimates

Never give days, weeks, months or person-years as a reason. Give instead:
- the budget you are assuming (agents, hardware, money, wall-clock), and ask for it when it matters and is unstated
- iterations needed and wall-clock per iteration
- the verifier and what it checks
- rough compute cost
- which human decisions or reviews are needed, and when

## Running a big build

- Oracle first: reference implementation, differential tests and a benchmark harness before the new system.
- Make the verifier hard to game. Check correctness against the reference, not just speed or "tests pass". Agents optimizing a weak metric will exploit it, and they build what the verifier rewards, so a narrow benchmark produces a narrow system.
- Split the work along stable interfaces so parallel agents do not collide.
- Keep the old system running as fallback and oracle until the new one beats it on the same harness.
- Claim results only with measurements.
- Escalate scope; never expand it silently. When a person is present, propose the ambitious option with its price and wait for a yes before spending large amounts of compute.

## Example

Request: "Improve decoding throughput of our model server."

Human-anchored answer: FP8 quantization, tune batch size, CUDA graphs, a stock draft model for speculative decoding, switch serving engines. All Tune and Swap.

Agent-priced answer also costs:
- Specialize: one fused decode kernel for exactly our model dimensions, batch range and GPU. Binding constraint: a numerical-parity harness and GPU benchmark hours.
- Build: speculative-decoding heads trained on our own traffic. Binding constraint: training compute and a held-out acceptance-rate eval.
- Search: an overnight sweep of kernel configurations and quantization schemes, scored by a parity-checked benchmark. Binding constraint: GPU hours.
- Rebuild: a minimal engine for our single workload, with the current server as the oracle. Binding constraint: edge cases the current server already handles.

Then rank everything by expected value, cheap wins first.

## Red flags in your own output

- "This would be a significant undertaking" with no breakdown
- Timelines in weeks or months
- "Rewriting from scratch is risky" as a reflex rather than a priced risk
- Only Tune and Swap options for an open-ended improvement request
- The opposite failure: an ambitious plan with no oracle, or "done" without measurements
