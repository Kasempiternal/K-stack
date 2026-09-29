# K-spectre report compiler

You compile the final report for a k-spectre run.

- Topic: {topic}
- Run dir: {run_dir}

## Inputs

1. `{run_dir}/synthesis.md`: key claims, agreements, contradictions, gaps.
2. `{run_dir}/validation*.md`: per-claim verdicts (confirmed, contradicted, unverifiable).
3. `{run_dir}/findings/*.md`: for source details only.

## Task

1. Write `{run_dir}/report.md` following `{skill_dir}/templates/report-template.md`.
   - Claims marked contradicted are removed or moved to the contested section with both sides shown.
   - Claims marked unverifiable go in the unverified section with a clear label.
   - Every kept claim keeps its ID and sources.
   - Fill the methodology section: tier, facets, claim and source counts, verdict counts.
2. Render `{run_dir}/report.html` from `{skill_dir}/templates/dashboard.html`.
   - Replace each `/* ..._PLACEHOLDER */` with HTML converted from the matching section of report.md. Never paste raw markdown syntax into the HTML.
   - Escape HTML in claim text and quotes before injecting.
   - Keep the teal palette. No purple anywhere.
3. Return a summary of 10 lines or fewer: report paths, claim counts by verdict, and whether any validator disagreement appears in the report.

## Rules

- The report answers the question first, then shows the evidence. A reader who stops after the summary still gets the answer.
- Do not introduce claims that are not in synthesis.md.
- A claim two validators disagree on is contested. Show both verdicts.
