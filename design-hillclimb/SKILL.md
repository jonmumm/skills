---
name: design-hillclimb
description: >
  Hill-climb a product's UX and visual craft to a first-party ship bar after arena/concept pick:
  clickable multi-device prototype, fixed evidence every round (device-size screen sheets, flow
  recordings, automatic checks for targets / contrast / overflow / type-floor / taps-per-flow,
  coverage matrix), TWO fresh critics (product + visual) blind to the target score, golden pairs
  from user vetoes, fix passes until every row ≥ 8. Concept rubrics alone are not enough — type,
  spacing, density, and device-size honesty are first-class rows. Use for "keep improving until a
  studio would ship it", "hill-climb the UX/craft", "the arena winner still looks wrong",
  multi-device design, or redesigning IA.
dependsOn:
  - jonmumm/skills@aaa-hillclimb
  - jonmumm/skills@autodesign
  - jonmumm/skills@product-design-critic
  - jonmumm/skills@verify-on-device
---

# Design hill-climb

The generic loop (frozen rubric, proven evaluators, fresh blind panel, keep/revert, pivot once)
is `hillclimb`; this skill specializes it.

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

**Arena is not the finish.** `/arena` (or round 00 concepts) picks a *direction*. This skill
climbs *craft and CX* until the face would ship. A concept winner that still has broken padding,
tiny type, or density failures has not finished — start Step 1 on the pick immediately.

## When to start

- There is a product to design with several surfaces, flows or states, and the bar is a studio
  bar ("Apple would ship it", "first-party", "not generic").
- Build a **prototype, not mockups**: a clickable app with fake data (Vite + React + TS is the
  fastest loop). Static frames can't show flows, motion or states; critics grade what they see.
- A single screen tweak is not this loop; use `/critique` + one impeccable skill.
- After an arena / concept pick when the interaction model is right but the pixels are not.

## Step 0 — Scorecard, then go wide (round 00)

1. Write `critic/SCORECARD.md` from `references/scorecard-template.md`: named shipped products as
   the 10, an **anchor for 6, 8 and 10 on every row**, and "8 = a first-party product/design lead
   would sign off shipping it". Rows cover product (IA, flow efficiency, state, trust, edge
   states) *and* craft (type, spacing, density, visual, motion, a11y). Add rows for the product's
   specific surfaces. Craft rows must use **observable tests** (px, pt, line counts) — see
   `references/craft-and-cx.md`. Concept-only rubrics (e.g. "distinctiveness", "glanceable") are
   not enough; they let broken padding and illegible type win.
2. Write the **coverage matrix** (`critic/COVERAGE.md`): every flow × its full state set
   (empty, loading, partial, success, error, interrupted, undone) × every device. A blank cell is
   a gap the critic will score; keep the matrix honest.
3. Seed **`critic/golden.md`** with any user veto or preference already stated ("this looks like
   shit", "prefer E over synthesis"). The panel must pick the user's side on those pairs before
   round 01; if it doesn't, the rubric is missing taste the user already gave you.
4. **Go wide** (an `arena` with one candidate per direction). Name 3–5 genuinely different concept directions (the name is the brief; make the
   biggest open product question, e.g. brand or IA model, one axis). Launch one subagent per
   concept *in a single message* (independent context, no cross-contamination); each builds the
   same 2–3 hardest moments into the shared prototype harness under its own folder
   (`src/concepts/<id>/`). Prompt template: `references/concept-prompt.md`.
5. Shoot every concept with the rig **at true device CSS size** (not a desktop marketing page with
   a Watch illustration). Grade each with the two fresh critics, plus a Codex cross-check
   (`codex exec`, screenshots only) when available. Rank by consensus **and** by
   `checks.json` (a concept that fails overflow / type-floor / targets cannot rank above one that
   passes, regardless of concept score).
6. **Comparative panel (optional but strong):** include 1–2 peer product screenshots (or prior
   baseline) in the same judge packet so isolation inflation doesn't invent a 9/10. Score the
   candidate *relative* to peers as well as to the anchors.
7. **Stop and show the user the ranked shortlist with screen sheets.** The pick is theirs.
   Never take a direction deep without it.

## Step 1 — The evidence rig (one command per round)

The critic only sees evidence, so evidence is the product. Build `scripts/round.sh NN` once
(`references/evidence-rig.md`). Same seed, same fake world, same flows every round:

| Evidence | What it is | Why |
|---|---|---|
| **Screen sheet** per device | every screen × state at device size, labelled with the scenario id | the critic's contact sheet |
| **Flow recordings** | a Playwright bot plays each key flow on every device at once, stitched side by side (phone · tablet · TV), with `marks.json` | flows, timing, motion, cross-device cause→effect |
| **Automatic checks** (`checks.json`) | tap targets ≥ 44 pt (or platform minimum), WCAG AA text contrast, overflow/clipping, type-floor failures, label wrap > N lines, words on no-words surfaces, taps per flow, scenario acknowledgement | objective rows; catches regressions critics miss |
| **Coverage matrix** | the matrix with each cell linked to a shot or marked missing | state completeness at a glance |

Rules that make the evidence trustworthy:
- **A scenario switcher that acknowledges** (`?scenario=<id>&device=<d>` sets
  `data-scenario-ack` on `<html>`; the shooter waits for it and fails loudly on a mismatch), so
  a shot labelled "swap: TV cut-over" can never silently be the home screen.
- **Freeze time and randomness** in shot mode (`?shot=1`: fixed clock, no entrance animations
  mid-capture, seeded data). Flow recordings run with motion on.
- Device frames at true CSS size (phone 390×844, tablet 820×1180, TV 1920×1080, Watch ~184×224
  for 41mm-class or the product's declared size), shot at 2×. **Never** grade craft from a
  cropped marketing hero of a Watch floating on a desktop page.
- Run **`checks.json` before critics**. A failing overflow / type-floor / target check is a hard
  gate for that row; don't ask a critic to "feel" a bug the rig already measured.
- Commit each round's evidence under `critic/rounds/NN/`. Open the flow recordings for the user.
- **Prove the rig, then freeze it** (as in `aaa-hillclimb` Step 1): before round 01, feed every
  check a deliberate fault (a tiny tap target, low-contrast text, 9 px body type, clipped label,
  words on a kid screen, a wrong scenario) and confirm it fails. Gate flow recordings with
  `verify-on-device`'s `av-verdict.mjs`.

## Step 2 — A varied critic panel, every round

Spawn a **panel**, not a pair. Default: **≥ 4 fresh critics in parallel**, mixed families and
roles — at least two product-minded and two visual-minded, on **different providers/models**
(e.g. Codex + Claude + Grok + Cursor/Gemini). Use `references/critic-product.md` and
`references/critic-visual.md` (or slight role variants: outdoor glance, a11y/trust, craft density).
Neither reads code. Each scores every row with evidence (shot names, timestamps), names the
single largest gap, ranks its top 6 fixes by score per effort, and writes a log row under
`critic/rounds/NN/<critic-id>.md`.

Then **merge** into `critic/rounds/NN/merged.md`:
- Findings named by ≥ 2 critics come first.
- Product beats polish when they disagree on priority.
- Per row: take the **median**, and if the spread is ≥ 2 take the **lower quartile / min of the
  bottom half** — never the friendly average.
- One critic alone is not a grade; quarantine outliers and note them.

**Do not tell critics the target score** (no "need ≥ 9.5"). Knowing the stop bar inflates grades.
Tell them the anchors and the evidence only; the parent applies the stop rule.

**At round 00, measure the noise floor**: run the panel (or each role twice) on the same
evidence, write each row's spread into the scorecard, split rows with spread ≥ 2 into yes/no
checks, and check the critics against `critic/golden.md` (variants the user already chose
between). Details in `hillclimb` Step 1. Keep a held-out scenario set shot only at round 00 and
at hand-off.

Don't reuse a critic, and don't argue with one. A critic that misreads evidence means the
evidence is unclear: fix the evidence (labels, a missing state, a shot that's frozen mid-fade).

**Read the largest gap literally.** In product design the usual ceiling is the **information
architecture**, not pixels: if a critic says "the model is confusing" or "I can't tell what
tonight means", fix the model (rename, merge or remove a layer, change which surface owns the
moment) before any polish pass. Polishing a confused model lifts the visual rows and leaves the
minimum where it was. If the gap is craft (padding, type floor, density), fix craft before
chasing brand flourishes.

## Step 3 — Propose ideas to judges, then implement the chosen one

Do **not** jump from critique straight into pixels. After the merged gap list:

1. **Draft 2–4 concrete ideas** that address the largest gap(s). Each idea is a short brief: name,
   what changes on which shots, what stays the same, and which scorecard rows it aims to move.
   Ideas must be mutually distinguishable (not three shades of the same tweak). Put them in
   `critic/rounds/NN/proposals.md`.
2. **Judge the ideas before code.** Spawn a fresh panel (same product + visual critic prompts, or
   one mixed-family judge) with the proposals **and** the current evidence only — no preferred
   winner in the prompt. They pick one idea (or a named hybrid of two) with reasons tied to
   anchors. Log the pick in `critic/decisions.tsv` as `propose|NN|<idea id>|chosen`.
3. **Only then** run the fix pass on the **chosen** idea. If the user already named a direction
   ("keep Timer cathedral", "outdoor yellow"), that constrains the proposal set; judges still
   pick among remaining craft/CX options inside it.
4. If judges split evenly, take the lower-risk idea that names the fewer surfaces; note the
   runner-up for the next round.

Then the fix pass:

- **One owner per coupled surface** (e.g. the phone shell, the TV surfaces, the kid surfaces, a
  docs page). Shared tokens/components belong to one owner per pass; others consume them.
  Parallel agents on one coupled surface make it worse.
- The **main loop** takes independent rows: copy, the fake world, the rig, the checks.
- Every agent prompt carries (`references/fix-pass-prompt.md`): owned files and off-limits
  files, the **chosen idea id + brief**, the critic's acceptance criteria that **name shots**,
  "commit after each step", "re-shoot and look at the shots with the Read tool after each step",
  a budget, and a final report (changes per step, best shots, thresholds moved old → new, what
  wasn't achieved). Do not implement a rejected proposal in the same pass.
- **Keep or revert each step** by a fresh critic's blind A/B on the shots it names (never the
  fix owner's own judgement), logged in `critic/decisions.tsv` (`aaa-hillclimb` Step 3).
- Use the impeccable skills as targeted tools when a row calls for them: `/clarify` (copy,
  labels), `/distill` (overloaded screens), `/arrange` (layout rhythm), `/typeset` (type),
  `/animate` (transitions that explain), `/harden` (edge states), `/onboard` (first run),
  `/colorize`, `/bolder` / `/quieter`, `/polish` (last).
- **The user's playtest beats the critic.** Any reaction to a recording goes into the very next
  pass, ahead of the critic's list.

## Step 4 — Stop rule

Default stop: every row ≥ 8 (after a floor of 3 rounds), or the minimum stays flat through one
**pivot round** (`aaa-hillclimb` Step 4: when two flat rounds' kept steps were all one kind of
change, the next round's fixes come from a different category, usually the IA model), or the
budget ends (default 8 rounds / ~10 h).

If the user sets a harder bar (e.g. **every row 10/10**), that overrides the default — keep
proposing → judging → implementing until every row hits it or the user stops you. Still never
tell critics the numeric target; the parent enforces it.

At a plateau, hand the user: the score table (baseline → now), the latest flow recordings, the
stuck rows and *why* (usually structural: the model, a platform limit, a rule that fights another
rule), and 2–3 directions with a recommendation. Write `BRIEFING.md` (two-minute read) and fill
in the case study.

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
  trend, not a single row's wobble, and never call a move smaller than the row's round-00 spread
  progress.
- **Concept bleed.** Concept agents that can see each other's folders converge. Give each its own
  folder and tell it not to read the others.
- **Shared dev server rebuilds.** Two agents editing while a round shoots contaminate shots.
  Shoot from a fresh `vite build` + `vite preview`, not the dev server.
- **Long rounds.** Run `round.sh` in the background; a full round of flows can exceed a tool
  timeout.
- **A noisy check gets "fixed" in the design.** An overlap check that flagged inline code inside
  wrapped prose made a fix owner rewrite the docs to satisfy it. When an owner reports a check
  misfiring, fix the check (and re-prove the rig) before the round, not the content.
- **A high score on the wrong model.** OGS round 02 hit 7.25 on a model the owner replaced after
  ten minutes with the real app ("casting is the first thing you do"). Before any deep round, have
  the owner use today's product and review a wide sheet of variants of the key moments.
- **The prototype isn't the proof.** Carry the rig into the build: synced phone + TV video, a fake
  device that counts side effects (casts, loads), and at least one run against a real game, not a
  fixture. OGS's build found a double-open, a swallowed gesture and a duplicated label only there.
- **Concept win, craft loss.** An arena / round-00 pick scored on interaction metaphor can still
  ship broken type, padding, and density. If the user rejects the pixels, treat that as a golden
  veto and climb craft — do not defend the concept score.
- **Isolation inflation.** Scoring one design alone often yields a soft 8–9. Put baseline and peer
  screenshots in the same packet; relative rank is stabler than absolute score.
- **Target-score leakage.** Telling a critic "stop at 9.5" biases grades upward. Keep stop rules
  in the parent only.

## References

- `references/scorecard-template.md` — rows, anchors, log format.
- `references/craft-and-cx.md` — measurable craft/CX rows and Watch/phone floors.
- `references/critic-product.md` — the product critic prompt (flows, jobs, states, trust).
- `references/critic-visual.md` — the visual critic prompt (first-party craft).
- `references/evidence-rig.md` — scenario switcher, screen sheet, flow bot, checks, round.sh.
- `references/concept-prompt.md` — the go-wide concept subagent prompt.
- `references/propose-ideas.md` — draft ideas, judge pick, then implement.
- `references/fix-pass-prompt.md` — the fix-pass owner prompt (chosen idea only).
- `references/case-study-ogs.md` — the first run (OGS app: launcher, casting, kid iPads, TV).
