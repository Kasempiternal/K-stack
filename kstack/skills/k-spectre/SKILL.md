---
name: k-spectre
description: Parallel research with synthesis and independent claim validation. Use for multi-source research questions, answers that need current external evidence, comparing tools or approaches, and questions that span the codebase and the web. Not for single-fact lookups. Invoked as /k-spectre <research question> or from k-mode.
argument-hint: <research question>
---

# K-spectre

Decompose the question into facets, run parallel researchers, synthesize, then independently validate every key claim before reporting.

## 1. Scope

Classify the question into one tier:

| Tier | Criteria | Researchers |
|---|---|---|
| XS | Single focused question, narrow scope | 2 |
| S | One topic, one or two angles | 3 |
| M | Multi-facet topic, several angles | 4 |
| L | Competing approaches, many stakeholders, cross-domain | 6 |
| XL | Research project spanning domains, past and current and future | 8 |

Signals: words like "landscape", "comprehensive", "compare all" push toward L/XL. More distinct angles, more domains, or a past-to-future span push up. A single narrow question is XS or S.

Detect the context: web-only, codebase-only, or both. Mentions of this project, file paths, or symbol names mean the codebase is in play.

## 2. Facets

Write the facets yourself: disjoint, each phrased as a question, together covering the topic. For XL you may dispatch one `design` worker with `templates/facet-decomposition-prompt.md` to draft the list. You still own the final facets.

For L and XL, show the facet list and confirm with AskUserQuestion before dispatching. For XS through M, show the facets and proceed.

## 3. Research

Create the run dir in the cwd: `.kstack/spectre/<slug>-<YYYYMMDD-HHMM>/` with a `findings/` directory inside. `<slug>` is a short kebab-case form of the question.

Dispatch all researchers in ONE message as background agents, one per facet:

- Web and document facets → role `research`, prompt built from `templates/researcher-prompt.md`
- Codebase facets → role `explore`, prompt built from `templates/codebase-researcher-prompt.md`

Each brief names the topic, the facet, the run dir, and the other facets so edges stay disjoint. The output contract: write `findings/<facet-slug>.md` following `templates/findings-template.md`. Every claim gets an ID, a source URL or `file:line`, an access date, a short verbatim quote, and a confidence. The researcher returns only a summary of 10 lines or fewer.

## 4. Synthesis

One `design` worker reads all of `findings/*.md` and writes `synthesis.md` in the run dir, following `templates/synthesis-prompt.md`: the key claims with their IDs preserved, agreements across facets, contradictions, and gaps.

## 5. Validation

`review` workers re-verify every key claim: one worker for XS through M, two workers splitting the claim list for L and XL.

Each validator sees only the claim text and its cited source, never the researcher's reasoning. It re-fetches the primary source and searches independently. Verdict per claim: `confirmed`, `contradicted`, or `unverifiable`, each with the validator's own source. Validators write `validation.md` in the run dir (two validators write `validation-a.md` and `validation-b.md`); disagreements stand, no forced consensus. Use `templates/validator-prompt.md`.

## 6. Report

One `docs` worker compiles `report.md` in the run dir from `templates/report-template.md`, then renders `report.html` from `templates/dashboard.html`. Use `templates/report-compiler-prompt.md` for the brief.

- Contradicted claims are removed or presented as contested.
- Unverifiable claims are labeled, never dropped silently.
- The HTML is a rendering of the report. Convert the markdown to HTML; never paste raw markdown syntax into the HTML.
- Teal accent palette. No purple.

## 7. Reply

Answer the question in 15 lines or fewer: the answer with each claim labeled confirmed or unverified, the top sources, and the run dir path.
