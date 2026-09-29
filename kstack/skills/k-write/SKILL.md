---
name: k-write
description: K-stack prose rules for docs, READMEs, RFCs, PR descriptions, commit bodies, code comments, and agent replies. Cuts AI tells and routes writing to the right effort tier. Use when writing or editing any prose, or from k-mode.
---

# K-write

## Route

| Writing | Role |
|---|---|
| Changelog, release notes, a commit body for a small change | `mechanical` |
| README, developer docs, docstrings, API docs, summaries of existing code | `docs` |
| RFC, technical design doc, architecture writeup | `design` |
| PR description, your own reply | the lead writes it |

The worker drafts. The lead reads the result against the rules below before it ships.

## Shape by document

- **README.** What it is, in one sentence. Install. The smallest working example. Then reference material. No marketing section.
- **RFC or design doc.** Problem, constraints, proposal (data shape first), alternatives rejected and why, risks, rollout. Tables for comparisons.
- **PR description.** Follows `k-mode/playbooks/shipping-changes.md`.
- **Commit body.** Why the change exists. Never restate the subject line.
- **Docstring.** The contract: inputs, outputs, errors, one non-obvious constraint. Not the implementation.
- **Code comment.** Only a non-obvious *why*. Delete comments that narrate what the code does, phase markers in scripts, and changelog comments ("added X").

## Rules

Write clean as you draft. A cleanup pass afterwards misses most of these.

**Plain speech**
- Say what it does, not how it feels. Name the mechanism or the number.
- One idea per sentence. Split a sentence the reader has to parse twice.
- Active voice. Name the actor.
- The plain word: use, help, many, if. Not utilize, facilitate, numerous, in the event that.
- Replace adverbs with the number or a stronger verb.
- "Is" and "has", not "serves as", "stands as", "boasts", "features".

**Cut on sight**
- Puffery and AI vocabulary: pivotal, crucial, delve, robust, seamless, leverage, landscape, tapestry, testament, underscore, showcase, foster, enhance, intricate.
- Abstract metaphor nouns: substrate, surface (as in "API surface"), primitive, harness (as metaphor), vector, paradigm, bedrock.
- Superficial -ing tails: "..., ensuring reliability", "..., highlighting the need".
- "Not just X, but Y." Forced groups of three. Synonym cycling. Pick one term and repeat it.
- Vague attribution ("experts say"). Name the source or delete it.
- Filler and hedging: "in order to", "it is important to note", "could potentially".
- Generic conclusions, chatbot phrases, sycophancy, closing offers.

**Punctuation and format**
- No em dashes. Use periods or commas.
- Colons only before a list or an example.
- Sentence-case headings. No decorative emoji. Straight quotes.
- Bold only what the reader must not miss. No `**Label:** label restated` bullets.
- Markdown in chat and docs. Never raw markdown inside an HTML surface.

**Evidence**
- Every claim carries its evidence or a label: measured, inferred, or guess.
- Link only artifacts that exist and that you read.
- Numbers carry units and a source.

## Self-check

Before shipping, ask what makes this text read as machine-written, and fix that. Then check that it has a point of view. Sterile prose is a tell too.
