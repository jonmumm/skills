---
name: hillclimb
description: >
  Generic improvement loop for anything judged by quality rather than one number: a prompt, copy,
  a component, a level, a skill, an API, a scene. Freeze a rubric and an evidence command, prove
  the evaluators can tell bad from good, then loop: one change → fresh evidence → independent
  evaluators (fresh each round, mixed model families, blind to the author) compare before vs after
  → keep or revert → log. Pivot once at a plateau, then stop. Use for "hillclimb this", "keep
  improving X until it's an 8", "iterate on this with critics", or any loop where an agent's own
  opinion of its work isn't enough. For a single deterministic metric use `autoresearch`; for
  whole games and multi-device products use `aaa-hillclimb` / `design-hillclimb`, which specialize
  this loop.
dependsOn:
  - jonmumm/skills@arena
  - jonmumm/skills@show-me-your-work
---

# Hillclimb

The maker never grades its own work. Everything else is bookkeeping that keeps the grades honest.

## 0. Set up (once, before any change)

Write `hillclimb/<slug>/PLAN.md` with:

- **Target**: the artifact and the one sentence it should live up to.
- **Rubric**: 3–7 rows. Each row gets anchors for 6, 8 and 10, citing real references ("10 = the
  Nintendo Switch eShop page", "8 = a senior reviewer would merge it unchanged"). Frozen for the run.
- **Evidence command**: one command that produces what evaluators see (screenshots, a rendered
  page, sample outputs on a fixed input set, a recording + `av-verdict`). Same seed and inputs every
  round. Evaluators see evidence, never code or the author's reasoning.
- **Held-out evidence**: a second input set (another seed, scenario or sample set) shot at
  baseline and at hand-off only, never shown to the panel in between. Gains that don't show up
  there were tuned to the climbing evidence, not real.
- **Gate**: what must stay green regardless (tests, typecheck, verify skill, budget).
- **Stop rule**: a target (every row ≥ 8), a floor (≥ 3 rounds), a cap (rounds or hours), and the
  spend cap if anything paid runs.

## 1. Prove the evaluators

- **Planted flaw.** Make a deliberately worse variant (break one row on purpose) and run the panel
  on baseline vs worse. If they can't reliably pick the baseline, fix the rubric or the evidence
  before climbing. A judge that can't see a planted flaw won't see a real one.
- **Noise floor.** Have 3 fresh evaluators score the *same* baseline evidence. Write each row's
  spread (max − min) into the plan. A row moving less than its spread hasn't moved (Night Flight's
  "beauty" scored 6 and 8 on near-identical frames). Panel size for a row ≈ (2 × spread ÷ the step
  you want to detect)²: spread 1, 1-point steps → ~4 evaluators on that row, not 1.
- **Split unreliable rows.** A row whose spread stays ≥ 2 is too vague to climb. Break it into
  2–4 yes/no checks the evaluator answers before scoring, with a cap ("can't explain three
  outcomes from the screens → max 5"), or drop it.
- **Golden pairs.** Keep `golden.md`: before/after pairs where the user already chose a side
  (a vetoed change, a version they called better). The panel must pick the user's side on most
  of them before round 1; where it doesn't, the rubric or the taste notes are missing something.
  Add a pair every time the user reacts to a result.

## 2. The panel

- **2–3 evaluators, spawned fresh every round** (an evaluator that remembers its last scores
  anchors on them). Mix families: `fable`, `opus`, and Codex (`codex exec`) or `sonnet`.
- Size the panel from the noise floor (Step 1); add evaluators on the lowest rows first, since
  they set the minimum.
- Each gets the rubric and the evidence only, and returns per row: score, the evidence it's based
  on (shot name, output id, timestamp), and the single largest gap with a concrete fix.
- **Keep/revert uses a blind pairwise comparison**: show before and after as A/B in random order,
  ask which is better per row and overall. Pairwise judgments are far steadier than absolute
  scores; absolute scores are for tracking the trend.

## 3. Loop

1. Merge the panel's gaps. Pick the top one by expected gain per effort. Write the hypothesis:
   "X is weak because Y; changing Z should lift row R".
2. Make **one** change (subagent or yourself). Several independent hypotheses → run them as
   parallel candidates in worktrees with `arena`.
3. Re-run the evidence command and the gate.
4. Fresh panel: pairwise before/after + absolute scores.
5. **Keep** only if the majority prefers "after" on the target row, no row drops by ≥ 2, and the
   gate is green. Otherwise revert in full. "Might help" is not kept.
6. Log one row (`show-me-your-work`): round, hypothesis, change, panel verdict, scores, kept or
   reverted, commit. Read the log before choosing the next hypothesis so reverted ideas aren't
   retried blind.

Unattended: run it under `/loop` with the plan file as the standing order and the log as the
resume point.

## 4. Plateau → pivot once → stop

Minimum score flat for two rounds: check the log. If the kept changes were all one kind
(polish, wording, colour), run one pivot round as an `arena` with candidates from different
categories (structure, the model/concept, the asset pipeline, a rule that fights another rule).
Still flat after the pivot, or the stop rule is met: stop.

## 5. Hand off

Re-shoot the held-out evidence and score it fresh. Baseline → final scores per row (climbing and
held-out, with each row's spread), the before/after evidence side by side, kept vs reverted counts,
the stuck rows and *why* (usually structural), and 2–3 next directions with a recommendation. If
the user reacts to the result, their reaction outranks the panel in the next run.

## Gotchas

- **Evaluators that see the diff grade the effort, not the result.** Evidence only.
- **Rubric edits mid-run** make rounds incomparable. Changing it means re-scoring the baseline.
- **One lucky round** isn't progress: judge by the minimum and the trend, and respect the floor.
  A 1-point gain from a single evaluator is usually inside the noise floor.
- **The author keeping its own steps.** "Re-shoot and keep it if it looks better" by the agent
  that made the change is self-grading. Even a per-step check goes to a fresh blind A/B on the
  shots it names (cheap: a few shots, one evaluator).
- **Overfitting the evidence.** Same seed every round is what makes rounds comparable, and also
  what lets fixes tune to those exact frames. That's what the held-out set catches.
- **Self-grading creep**: the agent that made the change summarizing "this is clearly better" in
  the evidence. Strip author commentary from what the panel sees.
