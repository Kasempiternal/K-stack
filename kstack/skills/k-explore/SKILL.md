---
name: k-explore
description: Explain how a subsystem works, trace a runtime flow, answer where code should live, or dig up why something was built this way (git history). Read-only. Use for "how does X work", "walk me through", "why is this like this", "where should this live", onboarding onto unfamiliar code, or from k-mode before changing a subsystem.
---

# K-explore

Read-only. It produces a mental model a senior engineer can act on, not annotated source.

## 1. Scope

State your reading of the question in one line and proceed. The user redirects if you are off. Pick the size:

- **Narrow** (one module or function): one `explore` worker explores and explains in one pass. Go to step 3.
- **Broad** (a subsystem, a cross-cutting flow, a full architecture): go to step 2.
- **Why** (the motivation behind a design or a regression): add a history seat to either path.

## 2. Fan out

Split the question into two to four disjoint slices. Example: data model and state, request path, configuration and side effects. Dispatch all slices in one message, one `explore` worker per slice. Each brief says:

- The slice, and the question it serves.
- Start broad (Glob, Grep for key types), then trace from an entry point through callers, callees, and data flow. Read the code. Do not infer from filenames.
- Stop when you can describe input to output with no hand-waving.
- Return: components with paths, the traced flow, files read, and anything surprising. Under 40 lines. Do not write files.

**History seat** (for why questions). Run `git log -S`/`-G` on key symbols, `git log --follow` on the core files, and `git blame` on the surprising lines. Include linked PRs and issues via `gh` when a remote exists. Return the decisions found, each with its commit or PR, and mark each as stated or inferred.

## 3. Explain

One `design` worker writes the explanation from the findings. It reconciles overlaps and resolves contradictions by reading the code. For a narrow question, the single `explore` worker writes it directly.

Output sections, dropping any that do not apply:

- **Overview.** What it is, what it does, why it exists. Two paragraphs at most.
- **Key concepts.** The types and services needed to follow the rest.
- **How it works.** The flow in prose, from trigger to effect, naming files and functions.
- **Where things live.** The few paths needed to start working here.
- **Gotchas.** Sharp edges, surprising history, what a newcomer gets wrong.
- **Why** (history seat only). The decisions and their sources.

## 4. Critique (only when asked for issues or improvements)

After the explanation, dispatch two `review` workers in one message with the explanation and file paths. One uses the lens of structure and reader load, the other failure modes and invariants. Judge the findings as the lead: **act on**, **consider**, **noted**, **dismissed**, each with a one-line reason. Present the explanation first and the critique below it.

## 5. Present

Lightly edit for the conversation's context. Do not substantially rewrite the explainer. Apply **k-write** rules.
