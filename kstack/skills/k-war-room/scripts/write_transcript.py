#!/usr/bin/env python3
"""Write a war room's transcript.md from the workflow journal, with no model involved.

Usage: write_transcript.py <transcriptDir> <outDir>/panel.json

The verdict step used to ask the moderator to copy the whole channel into transcript.md.
Reproducing tens of thousands of words of other models' analysis verbatim trips Anthropic's
"reasoning extraction" safeguard, so that call was blocked on every model. This script
assembles the same file from the journal instead: each agent's return value, in posting
order, labelled by the agent's description in its meta.json.
"""
import json
import os
import sys


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    tdir, panel_path = sys.argv[1], sys.argv[2]
    panel = json.load(open(panel_path))
    out_dir = panel.get("outDir") or os.path.dirname(os.path.abspath(panel_path))

    # A resumed run replays slots under the same label; keep the newest text in the first slot's place.
    order, texts = [], {}
    for line in open(os.path.join(tdir, "journal.jsonl")):
        row = json.loads(line)
        if row.get("type") != "result":
            continue
        meta_path = os.path.join(tdir, f"agent-{row.get('agentId')}.meta.json")
        label = json.load(open(meta_path)).get("description", "?") if os.path.exists(meta_path) else "?"
        if label.endswith(": verdict"):
            continue
        res = row.get("result")
        text = res if isinstance(res, str) else json.dumps(res, indent=1, ensure_ascii=False)
        if not text or not text.strip():
            continue
        if label not in texts:
            order.append(label)
        texts[label] = text.strip()

    mod = panel.get("moderator") or {}
    lines = [
        f"# War room: {panel.get('title') or panel.get('topic', '')}",
        "",
        f"**Topic:** {panel.get('topic', '')}",
        "",
        "**Panel:**",
        *[f"- {p.get('name')}: {p.get('role')} ({p.get('model')})" for p in panel.get("personas", [])],
        f"- Moderator {mod.get('name')}: {mod.get('role')} ({mod.get('model')})",
        "",
        f"{len(order)} messages, verbatim and in posting order, assembled by scripts/write_transcript.py from the workflow journal.",
    ]
    for label in order:
        lines += ["", "---", "", f"### {label}", "", texts[label]]
    path = os.path.join(out_dir, "transcript.md")
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"WROTE {path} ({len(order)} messages)")


if __name__ == "__main__":
    main()
