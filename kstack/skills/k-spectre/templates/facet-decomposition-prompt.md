# K-spectre facet decomposition

Draft a facet list for a large research question.

- Topic: {topic}
- Target facet count: {facet_count}
- Context: {web only | codebase only | web + codebase}

## Task

Decompose the topic into {facet_count} research facets. Each facet becomes one researcher's assignment, so facets must be:

1. Disjoint. Each covers a unique angle with minimal overlap.
2. Complete. Together they cover the topic.
3. Answerable through web research or code reading.
4. Balanced. Roughly equal depth; avoid one tiny facet next to one huge one.

Pick the decomposition axis that fits the topic:

- Stakeholder: who is affected or involved.
- Dimension: technical capability, cost, ecosystem, risks, adoption.
- Temporal: history, current state, trajectory.
- Layer: for codebase questions, architecture layers or subsystems.

## Output

Return the list only, one facet per line:

```
{facet-slug}: {facet question in one sentence}
```

No rationale, no grouping, no extra prose. The lead rewrites or prunes before dispatching.
