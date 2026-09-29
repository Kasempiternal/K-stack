# Prototype

**You own the decision, not the code. The prototype is thrown away.** Speed beats polish here. Rigor goes into picking the right thing to compare.

1. Name the decision it settles: layout, interaction, density, behavior, timing, or approach. No decision means no prototype. Route to Feature.
2. Build throwaway sketches in a scratch dir outside production source, on `build`. Visual decisions use the lightest stack that renders the idea. Behavioral decisions use the smallest script that exercises the question.
3. Compare two or three variants behind one switcher or one command, each labeled.
4. Observe on the matching surface. Screenshot each variant (k-e2e-qa or a browser), or log the timing or output.
5. Recommend one. Hand the chosen direction to Feature.

**Reply:** variants, evidence (screenshots or observed output), tradeoffs, recommendation, scratch path. State plainly that it is throwaway.
