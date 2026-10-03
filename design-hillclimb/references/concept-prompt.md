# Concept subagent prompt (round 00, go wide)

Launch all concept agents in **one message** so they run in parallel with independent context.
Name each concept so the name is the brief ("Console Shelf", "Family Kitchen Table"), and make
the biggest open product question (brand, IA model) one axis between them.

```text
You are designing concept [ID] "[NAME]" for [product]. Your brief, in one line: [the name,
expanded into the direction: metaphor, IA stance, brand stance, the feel].

The shared harness lives in [design/]: read [design/README.md] first (fake world in
src/world/, art in public/art/, device frames, the scenario switcher). Work ONLY in
src/concepts/[id]/ (and add your scenarios to its scenarios.ts). Do NOT read or copy other
concept folders. Do not edit shared files; if the harness lacks something, write a note in your
final report.

Build these moments at enough fidelity to judge (real content from the fake world, real art,
every listed state), on every device that takes part:
[1. Home on phone (+ TV idle) …]
[2. The hardest flow, step by step, on all devices …]
[3. …]

Bar: a first-party studio, not a wireframe. [Device rules: no words on kid surfaces, 3 m TV
readability, 44 pt targets, no emoji, no faces on objects, …]. Make real decisions: one primary
action per moment, the model a newcomer can say in one sentence.

After building, run `pnpm shoot --concept [id]` and look at every shot with the Read tool; fix
what you'd be embarrassed by. Commit your folder (specific paths) with message
"concept [id]: …". Final report (≤ 250 words): the one-sentence model, the brand stance, the
3 decisions you're proudest of, what you'd do next, harness gaps.
```
