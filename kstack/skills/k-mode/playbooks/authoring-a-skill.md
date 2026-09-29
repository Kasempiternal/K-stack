# Authoring a skill, agent, or hook

**You own the skill's voice.**

1. Use the `plugin-dev:skill-development` skill when it is installed. Check current frontmatter fields against the Claude Code docs, never from memory.
2. When in doubt, delete. Keep only prose that changes a decision. Tell the agent what to do. Give the reason only where the rule would confuse without it. Point at structural sources (types, configs, other skills by path) instead of restating them.
3. A rule that has been written twice becomes a hook or script (Encode lessons in structure).
4. Validate: frontmatter has `name` and `description`, referenced files exist, cross-skill links resolve, and `claude plugin validate <dir>` is clean. Run a hook against sample stdin JSON for both its allow path and its block path.
5. Behavior changes get a before and after run on a realistic prompt, judged from what the agent actually did, not what it claimed.
6. **Shipping changes.**

**Reply:** what the skill does, the key design decisions, validation output.
