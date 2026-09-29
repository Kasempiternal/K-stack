# Findings: {facet_name}

Facet: `{facet-slug}`
Topic: {topic}
Confidence: {high|medium|low}
Sources consulted: {count}
Date: {YYYY-MM-DD}

## Claims

Every claim carries an ID. The synthesis and validation steps refer to claims by ID, so keep them stable.

### {facet-slug}-c1: {claim title}

- **Claim**: {one or two sentences, specific, with the numbers}
- **Source**: {url} or {file:line}
- **Accessed**: {YYYY-MM-DD}
- **Quote**: "{short verbatim quote from the source, under 40 words}"
- **Confidence**: {high|medium|low}

### {facet-slug}-c2: {claim title}

- **Claim**: {...}
- **Source**: {...}
- **Accessed**: {...}
- **Quote**: "{...}"
- **Confidence**: {...}

{Three to eight claims per facet. If a claim has no usable source, write "NOT FOUND" as the source and mark confidence low.}

## Sources

| # | Title | URL or path | Type | Date | Reliability |
|---|-------|-------------|------|------|-------------|
| 1 | {title} | {url or file:line} | {docs/paper/article/code} | {YYYY-MM-DD or YYYY-MM} | {high|medium|low} |
| 2 | {...} | {...} | {...} | {...} | {...} |

Reliability: high is a primary source, official docs, or peer-reviewed work. Medium is a reputable secondary source. Low is a blog, forum, vendor marketing, or undated content.

## Open questions

{What this facet could not answer. Feeds the gap list in synthesis.}

- {question 1: what you could not find and why it matters}
- {question 2: what needs deeper investigation}
