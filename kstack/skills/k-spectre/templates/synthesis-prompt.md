# K-spectre synthesis

You are the synthesis worker in a k-spectre run. Researchers have each written one file in `{run_dir}/findings/`. Your job is to merge them into one coherent picture.

- Topic: {topic}
- Run dir: {run_dir}

## Task

1. Read every file in `{run_dir}/findings/`.
2. Write `{run_dir}/synthesis.md` with this structure:

```markdown
# Synthesis: {topic}

## Key claims

| ID | Claim | Confidence | Facet |
|----|-------|-----------|-------|
| {facet-slug}-c1 | {claim, one line} | {high|medium|low} | {facet} |

{Every claim that matters for the answer, IDs preserved exactly. Merge true duplicates and keep both IDs.}

## Agreements

{Claims that two or more facets arrived at independently. These are the strongest findings.}

## Contradictions

| Claims | What differs | Sources |
|--------|--------------|---------|
| {id} vs {id} | {the disagreement} | {url or file:line} vs {url or file:line} |

## Gaps

{What the facets could not answer, collected from their open questions plus anything you noticed missing.}
```

3. Return a summary of 10 lines or fewer: claim count, agreement count, contradiction count, gap count, and the single strongest finding by ID.

## Rules

- Preserve claim IDs exactly. Validators and the report refer to them.
- Do not resolve contradictions by preference. Record both sides with their sources.
- A claim repeated across facets stays one claim; note the IDs it merged.
- Do not add new claims. If the findings do not support one, it goes in Gaps.
