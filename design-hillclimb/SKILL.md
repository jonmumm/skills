---
name: design-hillclimb
description: >
  Hill-climb a product's UX and visual design to a first-party ship bar: build the design as a
  clickable multi-device prototype with a scenario switcher, shoot fixed evidence every round
  (screen sheet of every screen × state, bot-played flow recordings across devices side by side,
  automatic checks for tap targets / contrast / overflow / words-on-kid-screens / taps-per-flow,
  a state-coverage matrix), grade it with TWO fresh critics (product + visual) who never read
  code, fix the top gaps with one owner per coupled surface, and repeat until every scorecard row
  ≥ 8 or the minimum stops rising. Starts wide (3–5 parallel concept directions, ranked, user
  picks) then goes deep. Use for "keep improving the app design until a real studio would ship
  it", "hill-climb the UX", "grade this design like Apple/Nintendo", multi-device or multi-flow
  product design, or redesigning an app's information architecture.
dependsOn:
  - jonmumm/skills@aaa-hillclimb
  - jonmumm/skills@autodesign
  - jonmumm/skills@product-design-critic
  - jonmumm/skills@verify-on-device
---

# Design hill-climb

`aaa-hillclimb` raises a game by grading fixed evidence with a fresh critic each round. This is
the same loop for **product and UI design**: flows, states, information architecture and visual
craft across every device a product runs on. It borrows `autodesign`'s go-wide-then-deep shape
and `product-design-critic`'s product layer (job, owning surface, hierarchy, trust, full state
set). Visual polish never excuses a weak product call.

```text
Step 0  scorecard + baseline (round 00 = go wide: 3–5 concepts, ranked, user picks)
Step 1  evidence rig: one command → screen sheet · flow recordings · checks · coverage matrix
Step 2  two fresh critics in parallel (product, visual) → merged gap list
Step 3  fix passes, one owner per coupled surface; main loop takes independent rows
Step 4  stop rule: every row ≥ 8, or min flat two rounds, or budget → hand off with directions
```

## When to start

- There is a product to design with several surfaces, flows or states, and the bar is a studio
  bar ("Apple would ship it", "first-party", "not generic").
- Build a **prototype, not mockups**: a clickable app with fake data (Vite + React + TS is the
  fastest loop). Static frames can't show flows, motion or states; critics grade what they see.
- A single screen tweak is not this loop; use `/critique` + one impeccable skill.

## Step 0 — Scorecard, then go wide (round 00)

1. Write `critic/SCORECARD.md` from `references/scorecard-template.md`: named shipped products as
   the 10, an **anchor for 6, 8 and 10 on every row**, and "8 = a first-party product/design lead
   would sign off shipping it". Rows cover product (IA, flow efficiency, state, trust, edge
   states) *and* craft (visual, motion, a11y). Add rows for the product's specific surfaces.
2. Write the **coverage matrix** (`critic/COVERAGE.md`): every flow × its full state set
   (empty, loading, partial, success, error, interrupted, undone) × every device. A blank cell is
   a gap the critic will score; keep the matrix honest.
3. **Go wide.** Name 3–5 genuinely different concept directions (the name is the brief; make the
   biggest open product question, e.g. brand or IA model, one axis). Launch one subagent per
   concept *in a single message* (independent context, no cross-contamination); each builds the
   same 2–3 hardest moments into the shared prototype harness under its own folder
   (`src/concepts/<id>/`). Prompt template: `references/concept-prompt.md`.
4. Shoot every concept with the rig, grade each with the two fresh critics, plus a Codex
   cross-check (`codex exec`, screenshots only) when available. Rank by consensus.
5. **Stop and show the user the ranked shortlist with screen sheets.** The pick is theirs.
   Never take a direction deep without it.

## Step 1 — The evidence rig (one command per round)

The critic only sees evidence, so evidence is the product. Build `scripts/round.sh NN` once
(`references/evidence-rig.md`). Same seed, same fake world, same flows every round:

| Evidence | What it is | Why |
|---|---|---|
| **Screen sheet** per device | every screen × state at device size, labelled with the scenario id | the critic's contact sheet |
| **Flow recordings** | a Playwright bot plays each key flow on every device at once, stitched side by side (phone · tablet · TV), with `marks.json` | flows, timing, motion, cross-device cause→effect |
| **Automatic checks** (`checks.json`) | tap targets ≥ 44 pt, WCAG AA text contrast, overflow/clipping, words on no-words surfaces, taps per flow, scenario acknowledgement | objective rows; catches regressions critics miss |
| **Coverage matrix** | the matrix with each cell linked to a shot or marked missing | state completeness at a glance |

Rules that make the evidence trustworthy:
- **A scenario switcher that acknowledges** (`?scenario=<id>&device=<d>` sets
  `data-scenario-ack` on `<html>`; the shooter waits for it and fails loudly on a mismatch), so
  a shot labelled "swap: TV cut-over" can never silently be the home screen.
- **Freeze time and randomness** in shot mode (`?shot=1`: fixed clock, no entrance animations
  mid-capture, seeded data). Flow recordings run with motion on.
- Device frames at true CSS size (phone 390×844, tablet 820×1180, TV 1920×1080), shot at 2×.
- Commit each round's evidence under `critic/rounds/NN/`. Open the flow recordings for the user.
- **Prove the rig, then freeze it** (as in `aaa-hillclimb` Step 1): before round 01, feed every
  check a deliberate fault (a tiny tap target, low-contrast text, words on a kid screen, a wrong
  scenario) and confirm it fails. Gate flow recordings with `verify-on-device`'s `av-verdict.mjs`.

## Step 2 — Two fresh critics, every round

Spawn **two new subagents in parallel** (strongest model) with `references/critic-product.md`
and `references/critic-visual.md`. Neither reads code. Each scores every row with evidence (shot
names, timestamps), names the single largest gap, ranks its top 6 fixes by score per effort, and
writes a log row. Then **merge**: findings both critics name come first; product beats polish
when they disagree on priority; take the lower score when they disagree by ≥ 2 and note it.

Don't reuse a critic, and don't argue with one. A critic that misreads evidence means the
evidence is unclear: fix the evidence (labels, a missing state, a shot that's frozen mid-fade).

**Read the largest gap literally.** In product design the usual ceiling is the **information
architecture**, not pixels: if a critic says "the model is confusing" or "I can't tell what
tonight means", fix the model (rename, merge or remove a layer, change which surface owns the
moment) before any polish pass. Polishing a confused model lifts the visual rows and leaves the
minimum where it was.

## Step 3 — Fix passes, split by coupling

- **One owner per coupled surface** (e.g. the phone shell, the TV surfaces, the kid surfaces, a
  docs page). Shared tokens/components belong to one owner per pass; others consume them.
  Parallel agents on one coupled surface make it worse.
- The **main loop** takes independent rows: copy, the fake world, the rig, the checks.
- Every agent prompt carries (`references/fix-pass-prompt.md`): owned files and off-limits
  files, the critic's fixes as numbered steps with acceptance criteria that **name shots**,
  "commit after each step", "re-shoot and look at the shots with the Read tool after each step",
  a budget, and a final report (changes per step, best shots, thresholds moved old → new, what
  wasn't achieved).
- **Keep or revert each step** against the shots it names, logged in `critic/decisions.tsv`
  (`aaa-hillclimb` Step 3).
- Use the impeccable skills as targeted tools when a row calls for them: `/clarify` (copy,
  labels), `/distill` (overloaded screens), `/arrange` (layout rhythm), `/typeset` (type),
  `/animate` (transitions that explain), `/harden` (edge states), `/onboard` (first run),
  `/colorize`, `/bolder` / `/quieter`, `/polish` (last).
- **The user's playtest beats the critic.** Any reaction to a recording goes into the very next
  pass, ahead of the critic's list.

## Step 4 — Stop rule

Stop when every row ≥ 8 (after a floor of 3 rounds), or the minimum stays flat through one
**pivot round** (`aaa-hillclimb` Step 4: when two flat rounds' kept steps were all one kind of
change, the next round's fixes come from a different category, usually the IA model), or the
budget ends (default 8 rounds / ~10 h). At a plateau, hand the user: the score table (baseline →
now), the latest flow recordings, the stuck rows and *why* (usually structural: the model, a
platform limit, a rule that fights another rule), and 2–3 directions with a recommendation.
Write `BRIEFING.md` (two-minute read) and fill in the case study.

## Gotchas

- **Unacknowledged scenarios.** Without the ack, a broken route silently renders the default
  screen and the critic grades the wrong thing. The shooter must fail, not shrug.
- **Shots taken mid-transition.** Freeze motion in shot mode; let flow recordings carry motion.
- **Fake data that reads fake.** Lorem, initials-in-squares and placeholder art drag every
  visual score and hide real layout problems (long names, real art contrast). Use real content
  and real captures from the product's own assets.
- **Words on no-words surfaces** (kid UIs, TV-at-3-m) creep in via aria-labels rendered as
  text, button labels and toasts. Count visible text nodes per surface in the checks.
- **Contrast over imagery.** Text on key art passes on one image and fails on another; check
  contrast against the sampled pixels behind the text, not the CSS background.
- **Taps-per-flow drift.** Count taps in the flow bot (each `click` is a tap) and log them; a
  "simplification" that adds a confirm step shows up as a number.
- **Critic variance.** Fresh critics rediscover and sometimes miss. Judge by the minimum and the
  trend, not a single row's wobble.
- **Concept bleed.** Concept agents that can see each other's folders converge. Give each its own
  folder and tell it not to read the others.
- **Shared dev server rebuilds.** Two agents editing while a round shoots contaminate shots.
  Shoot from a fresh `vite build` + `vite preview`, not the dev server.
- **Long rounds.** Run `round.sh` in the background; a full round of flows can exceed a tool
  timeout.

## References

- `references/scorecard-template.md` — rows, anchors, log format.
- `references/critic-product.md` — the product critic prompt (flows, jobs, states, trust).
- `references/critic-visual.md` — the visual critic prompt (first-party craft).
- `references/evidence-rig.md` — scenario switcher, screen sheet, flow bot, checks, round.sh.
- `references/concept-prompt.md` — the go-wide concept subagent prompt.
- `references/fix-pass-prompt.md` — the fix-pass owner prompt.
- `references/case-study-ogs.md` — the first run (OGS app: launcher, casting, kid iPads, TV).
