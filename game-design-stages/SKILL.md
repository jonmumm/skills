---
name: game-design-stages
description: >
  Staged game design methodology: design and validate a game's core mechanics before
  writing any code. Uses LLM-simulated match logs + LLM eval judges to measure "fun"
  quantitatively, then iterates the design until criteria converge, then transitions
  to a deterministic engine. Use when starting a new game, when a game's rules are
  unclear, when balance needs testing without a full implementation, or when you want
  to validate mechanics at design speed rather than engineering speed.
---

# Game Design Stages

Design the fun first. Build the engine second.

The insight: a game's core loop is a text protocol before it is code. You can simulate
it, judge it, and iterate it as structured text — and find the rules that make it
genuinely engaging — before writing a single line of implementation. LLM simulation is
~10× faster than building a prototype for design exploration. Save the engine for when
you know what you're building.

## Overview

```
Phase 0: IDENTITY    — Define the core dilemma. 1 paragraph. The rest follows.
Phase 1: CRITERIA    — Define 12–16 measurable "fun" criteria. Fix them. Never modify.
Phase 2: SIMULATE    — Write match logs as structured text. Subagent does the writing.
Phase 3: EVALUATE    — LLM judge scores every challenge against the criteria.
Phase 4: DIAGNOSE    — Identify root cause of every failure. Classify TYPE A/B/C/D.
Phase 5: SIMPLIFY    — Remove rules. Never add. Converge on what works.
Phase 6: VERSION     — All criteria pass 3 consecutive sims → bump version, keep going.
Phase 7: CODE        — Build the deterministic engine once you know what you're building.
```

---

## Phase 0: Design Identity

Before criteria, before simulations — write one paragraph that answers:

> "What is the core dilemma that makes every moment of this game interesting?"

Not the theme. Not the win condition. The dilemma: the decision that is genuinely hard
every time it fires, where both sides have something at stake and neither side can
simply optimize their way to the correct answer.

**Example (Strikers):**
> Each challenge is a simultaneous-reveal duel. The attacker picks an action (Dribble,
> Pass, or Shoot). The defender picks a response (Tackle, Cover Pass, or Block Shot).
> Neither player sees the other's choice before committing. If the defender guesses
> wrong, the attacker auto-wins. If they guess right, a d20 roll on the relevant stat
> chart decides. The game's entire engine exists to make that binary decision genuinely
> hard — neither side should be able to simply look up the correct answer.

If you cannot write this paragraph, stop. You don't have a game mechanic yet — you have
a setting. The dilemma is the mechanic. Find it before building anything else.

**This paragraph is also your eval anchor.** Every criterion you write in Phase 1
should trace back to this paragraph. If a criterion doesn't connect to the core
dilemma, it's measuring the wrong thing.

---

## Phase 1: Define Eval Criteria

Write 12–16 criteria that measure whether the core dilemma is working. Fix them before
the first simulation. Never modify them — only the design changes.

### Criteria Design Rules

**Each criterion must be:**
- Measurable from a text match log alone (no external reference needed)
- Binary Pass/Fail against a numeric threshold (not "good enough")
- Independent — measuring one dimension of fun, not a compound of several
- Grounded in the core dilemma paragraph from Phase 0

**Criterion types:**

| Type | Measured how | Examples |
|------|-------------|---------|
| **Rate** | % of qualifying events meeting a threshold | Defender Dilemma Rate >65%, Dominant Action Rate <40% |
| **Mean** | Average score across all events | Consequence Clarity mean >4.0 |
| **Boolean** | Did X happen at least once? | Tension Peak Y (A=5 AND C≥4) |
| **Count** | How many of X occurred? | Rule Confusion G ≤1 |
| **Scale** | Single match-level score | Agency over Luck >3.5 |

**Aim for:** 60% rate criteria, 20% boolean, 20% scale/count. Rates are the most
sensitive to design changes and provide the clearest iteration signal.

### The 14-Criteria Framework (Strikers pattern)

Strikers settled on 14 criteria across four dimensions:

**Dilemma quality (per challenge):**
1. Defender Dilemma Rate — are both defensive responses genuinely defensible?
2. Attacker Decision Quality — does the attacker face a real action puzzle?
3. Tension Peak — did at least one challenge produce maximum dilemma AND consequence?
5. Effort Dilemma Rate — when a resource can be spent, is save vs. spend a real tradeoff?

**Consequence (per challenge):**
3. Consequence Clarity — do outcomes visibly change match trajectory?
11. Stat Lead Meaningfulness — does the stat lead tier actually change outcomes?

**Legibility (per challenge):**
6. Rule Confusion — how many interactions produced unclear results? (lower is better)
10. Chart Legibility — do outcomes make immediate sense from the chart?

**Possession arc (per possession):**
9. Possession Completeness — does each possession have a clear arc?

**Match feel (per match):**
4. Agency over Luck — do decisions outweigh variance?
8. Manager Fingerprint — does the special rule produce a traceable, visible effect?
14. Comeback Rate — does the losing team have a genuine path?

**Balance (per match):**
12. Squad Diversity Signal — can a budget squad win?
13. Dominant Action Rate — is one action obviously superior to all others?

This split ensures no single design decision tanks all 14 — and that a sim can pass
12/14 while still clearly signaling which two things to fix next.

### Scoring Guide

For each criterion, write a scoring rubric before running any sims. The rubric must
be usable by an LLM judge reading only the match log.

**Example rubric entry:**

```
A. Defender Dilemma (1–5) — score ONLY for Dribble challenges
  5 = both responses felt defensible; genuine 50/50 before reveal
  3 = one leaned better, other wasn't obviously wrong
  1 = one response was clearly dominant; no real decision
```

**Rubric design rules:**
- 5-point or 3-point scales work. Never 10-point (too much variance, harder to calibrate).
- Always describe the 1, the midpoint, and the 5/3. The edges anchor the scale.
- For binary criteria (Y/N), define exactly what constitutes Y vs N.
- For rate criteria, the denominator matters — define which events qualify.

---

## Phase 2: LLM Simulation

Write match logs as structured text. Do not write a single challenge line before
completing the planning phase. The planning phase is the design work; the writing
phase is transcription.

### Architecture: Subagent + Codex

Use two separate LLM invocations:

1. **Subagent (sim author):** writes the match log to `/tmp/game_sim_vN_N.txt`
2. **Main agent:** runs Codex eval, reads scores, updates docs

This separation matters because the sim author's reasoning should not bleed into
the log. The log must contain only match events — not design commentary.

### Planning Phase (do this before writing any challenge)

**a. Squad design**
Define both sides with explicit stats, costs, and passives. Every passive must be
written out completely. If you cannot write a passive in one unconditional sentence,
the passive is too complex.

**b. Possession plan (9 possessions is a good target)**
For each possession, plan in full before writing:
- Which zone the ball starts in
- Which players are involved
- Which action the attacker will take and why (1 sentence reasoning)
- Which response the defender will take and why (1 sentence, cannot see attacker)
- The d20 roll value (choose it; spread across the range: 1–5, 6–10, 11–15, 16–20)
- Full stat calculation written out

**c. Verify the plan against criteria targets:**
- Total challenges: 18–22. More than 23 dilutes Consequence Clarity.
- Action distribution: no single action type >38% of challenges.
- Special rule activations: one per side, in separate possessions.
- Resource spend decisions: at least 3.
- Spread of d20 values: at least 2 in each quartile.

**d. Find the problems before you write**
Go through your plan and flag:
- Any challenge where the stat lead is Dominant (+6). This collapses resource decisions.
- Any passive that uses the word "when", "if", "first", or "once per". This is a judge confusion source.
- Any possession that ends on a Checked outcome. This collapses possession completeness.

Fix all of these before writing the first challenge line.

### Writing Phase: Clean Log Rules

**THE SINGLE MOST IMPORTANT RULE:** The sim log is not separate from the game — it
IS the game for the judge. Every non-match word in the log inflates the Rule Confusion
count. The judge cannot distinguish between "the rules require X" and "the design
has a problem with X."

Write ONLY match events.

```
BANNED from the sim log:
  - "Wait —", "Correction:", "Note:", "REVISED:", "Actually..."
  - "Passive would fire but M=0, so it doesn't"
  - "Challenge budget check: P1:2..."
  - Any editorial commentary mid-challenge
  - Any design discussion ("I'm simplifying X here")

If you realize a mistake while writing: FINISH THE MATCH AS WRITTEN.
Flag it only in the MATCH RESULT section at the end. Never correct mid-log.
```

**Each challenge is written exactly once, in order.**

### Sim Log Format

```
=== GAME SIM N: [Side A] vs [Side B] — [label] ===
Testing: [1 sentence — what design hypothesis are we testing?]
Design version: vN

SQUADS:
[Side A]: $Xk | [Manager/Faction]
  [Role] [Name] ([Rarity]) [stat list] Passive: [unconditional description]

MODIFIER REFERENCE:
[List all zone buffs, passive effects, and situational modifiers here — ONCE.
 Never repeat these in individual challenges.]

---

[Possession] | [Side A/B] | Ball: [zone] | [State counters]

  Challenge [N.N] | [zone] | [Score] | [State counters]
  [Attacker] picks [action] ([1-sentence reasoning])
  [Defender] picks [response] ([1-sentence reasoning, blind])
  Result: [AUTO-WIN / CONTEST]
  [If CONTEST:]
    [Attacker] stat = [base]+[zone buff, labeled]+[all other buffs, labeled] = [total]
    [Defender] stat = [base]+[all buffs, labeled] = [total]
    Lead: [attacker] − [defender] = [N] → [tier] | Chart: [whose], roll+[N]
    d20=[N]+[roll modifier]+[passive roll bonus]=[total] → [outcome label]
    [State changes: resource gains/losses, counter changes]
  REPEAT: [yes/no]
  Resource: [did attacker consider spending? current count]
  Special Rule: [fired? yes/no]

=== MATCH RESULT ===
Score | Goals | Resources at end | Special rules fired | REPEAT count
Corrections: [list here only — or "none"]
```

### Key discipline: one line per stat calculation

When multiple modifiers apply to the same challenge, compute the final roll in a
single expression:

```
GOOD: d20=14 + 1(Fav) + 2(Finisher) = 17 → Sharp

BAD:
  Roll: d20=14
  Tier modifier: +1 (Favored)
  Passive: +2 (Finisher)
  Total: 17 → Sharp
```

The multi-line version is three modifiers for the judge to trace. The single-line
version is one labeled expression. Judge confusion comes from tracing modifier chains,
not from the modifiers themselves.

---

## Phase 3: LLM Evaluation

Run the sim through a judge. The judge sees only the match log — no design doc,
no previous sims, no context.

### Eval Prompt Structure

```
You are a game design judge. Read the match log and score every challenge.
Do not simulate. Only judge what was written. Output only the scorecard below.

MATCH LOG:
[full contents of the sim file — pasted, not referenced]

RUBRIC:
[paste the scoring guide from Phase 1]

OUTPUT ONLY:
[structured scorecard format]
SUMMARY: N pass / N fail
```

**Why the judge must receive only the log:**
- The judge must judge the game as a player would experience it
- If the judge sees your design reasoning, it calibrates to intent rather than experience
- A rule that "makes sense if you know the design history" is a broken rule
- This is the adversarial condition: a fresh reader, no context, only what was written

### Running the Eval

```bash
# Write eval prompt to file
cat > /tmp/game_eval_vN_N.txt << 'EOF'
[eval prompt with embedded sim contents]
EOF

# Run Codex as judge
codex exec - < /tmp/game_eval_vN_N.txt > /tmp/game_scores_vN_N.txt 2>&1

# If Codex unavailable: run as Claude subagent or score manually
```

### Cross-Model Consensus (optional but valuable)

For criteria that are subjective (Agency over Luck, Tension Peak), run the same
eval against two different models. Keep only findings both models agree on.
Single-model disagreements are noise; cross-model agreement is signal.

---

## Phase 4: Diagnose

For every failing criterion, identify the root cause before proposing a fix.
Root causes fall into four types:

| Type | Root Cause | Fix |
|------|-----------|-----|
| **A** | Multiple modifiers applied to same challenge → judge couldn't trace | Pre-compute into single expression. Process fix only — no rule change. |
| **B** | Two rules interacted in an ambiguous way (passive + special rule + zone buff all active) | Remove one of the three interacting rules from the design. |
| **C** | Passive triggered conditionally → judge couldn't verify if it fired | Replace with an unconditional passive or bake the bonus into the base stat. |
| **D** | Editorial text / correction visible in the sim log | Fix the writing process. No rule change. |

**The most common mistake:** treating TYPE D as TYPE B. If G (rule confusion) is high,
read the sim log and ask: is there ANY non-match text in it? A single "NOTE:" or
"REVISED:" counts as a confusion point. Fix the writing before changing the rules.

**The second most common mistake:** treating TYPE C as inherent to the design.
Conditional passives ("fires on first CONTEST per possession", "once per half",
"when Momentum ≥2") are tracking state that only exists in players' heads. The judge
cannot verify them. The fix is always structural: make the passive unconditional.

### Diagnosing Specific Criteria

**Rule Confusion (G count):** Read every challenge with L=N. For each:
- Is the log clean? (if not → TYPE D)
- Did a conditional passive fire or not fire? (if unclear → TYPE C)
- Did two special rules apply simultaneously? (if yes → TYPE B)
- Were multiple modifiers on one stat? (if yes → TYPE A)

**Effort/Resource Dilemma Rate:** Low rate means leads are too comfortable.
When a player is Dominant (+6 lead), spending resources provides no tier upgrade.
The decision is obviously "save." Design challenges at Contested to +4 (Favored).

**Possession Completeness:** Low rate means possessions end without resolution.
A "Checked" ending (partial failure, no progress) scores S=2 (truncated), not S=3.
Every possession needs a terminal challenge that resolves clearly.

**Dominant Action Rate:** One action is being used too often. Audit the stat design:
- If Shoot dominates → FWD Shoot stat is too high relative to GK Reflexes, or BX zone buff is too strong
- If Pass dominates → zone structure funnels all play through midfield
- If Dribble dominates → defender never plays the correct response

---

## Phase 5: Simplify

**The design loop is subtractive, not additive.**

Each version should remove or simplify rules, not add new ones. Every rule that
exists must earn its place by improving at least one criterion without harming others.

### Simplification Decision Framework

When a rule is causing failures:

1. **Can it be made unconditional?** Conditional rules → unconditional rules is always
   the first move. A passive that fires on "first CONTEST per possession" → a stat bonus
   baked into the printed number. Zero tracking, zero confusion.

2. **Does it fire in real sims?** If a rule (Adjacent zone bonus, Overload stat, etc.)
   has not appeared in 3+ consecutive sims, remove it. Unused rules are complexity tax.
   They add to the modifier space the judge must trace without adding any play value.

3. **Does removing it break any passing criteria?** If no criterion depends on it,
   remove it. If a criterion depends on it, check whether a simpler rule achieves
   the same effect.

4. **Is the rule causing TYPE B conflicts?** When a gameplan, a passive, and a zone
   buff all activate on the same challenge, you have a three-way interaction. Remove
   the least important of the three from the relevant card or sim design.

### One Rule Per Challenge Side

The strongest structural constraint: no challenge should have both a special rule
activation and a REPEAT debuff on the same player simultaneously. If this happens,
one of the two triggering conditions is too frequent. Fix the activation trigger.

### Version Changelog

Every time a rule changes, document it as SIMPLIFY-N (where N is the sim number that
diagnosed the problem):

```
SIMPLIFY-6: MID passive is now a permanent stat boost baked into base stat.
  Reason: "Press" passive ("fires on first CONTEST per possession") caused TYPE C
  confusion in Sim 6 — judge marked L=N on both Press-affected challenges.
  Fix: Write effective stat directly on card. Never reference passive in challenges.
```

This creates an audit trail of what was tried and why it was removed. Future
designers can understand the evolution, not just the current state.

---

## Phase 6: Version Management

### Convergence Condition

**All criteria at ≥3 consecutive passes → write the next version.**

Three consecutive passes per criterion means:
- It wasn't a fluke (one-sim luck)
- It wasn't one good sim followed by regression
- The design is stable, not just passing

When this triggers, write the next version doc with:
- All confirmed rules as-written, no variant language
- A "From vN" section listing every simplification and why
- One example card/unit per position/type satisfying all constraints
- A walkthrough of one complete example turn/possession/round

The next-version doc must be **playable as-written with no external reference**. If
a player needs to read the previous version doc to understand a rule in the new one,
the new one is incomplete.

### Forced Version Bump

**≥15 sims logged → forced bump, regardless of convergence.**

15 sims with persistent failures means the current design is stuck. Write the next
version with the best available state, note what's still unresolved, and keep going.
Continuing to iterate an unfixable version doesn't help — start fresh with what you've
learned.

### What Carries Forward

When writing the next version:
1. All rules that have been passing consistently (streak ≥3)
2. All card constraints that produced the passing behavior
3. The SIMPLIFY changelog from the previous version (as a "From vN" section)
4. Any Design Patterns from the playtest findings (cross-sim insights)

What does NOT carry forward:
- Variant rules ("or alternatively...")
- Rules that never fired in the last 5 sims
- Conditional passives that were removed (do not reintroduce them)
- Complexity that was simplified out

---

## Phase 7: Transition to Code

### When to Start

Start building the engine when:
- All criteria have passed 3 consecutive sims (convergence), OR
- You've been forced to bump 2+ versions and the design is stable enough to implement
- The user wants to actually play the game (UI requirement)

Do NOT start before convergence unless you need the engine to run sims at scale.
LLM simulation is fast and cheap for design iteration. Code is slow and expensive
when you don't know what you're building.

### What to Build First: The Resolution Function

The core of every turn-based game is one pure function:

```typescript
resolveChallenge(
  attackerAction: Action,
  defenderResponse: Response,
  attackerStat: number,
  defenderStat: number,
  modifiers: Modifier[],
  roll: number
): ChallengeResult
```

This function has zero IO, zero side effects, and is fully deterministic given the
same inputs. It is the engine. Everything else — state management, UI, AI, networking
— wraps around it.

**Build this first. Test it thoroughly. Don't touch UI until it passes.**

### TDD Approach

Write eval tests before implementation. The eval tests encode the same criteria
from Phase 1 as executable assertions:

```typescript
// eval test — crunch-resolution.eval.test.ts
test('wrong defensive read → AUTO-WIN for attacker', () => {
  const result = resolveChallenge('Dribble', 'Block Shot', ...)
  expect(result.type).toBe('AUTO_WIN')
  expect(result.winner).toBe('attacker')
})

test('correct defensive read → CONTEST', () => {
  const result = resolveChallenge('Dribble', 'Tackle', ...)
  expect(result.type).toBe('CONTEST')
})

test('stat lead tier: +4 → Favored chart, roll +1', () => {
  const result = resolveContest({ attackerStat: 16, defenderStat: 12, roll: 10 })
  expect(result.tier).toBe('Favored')
  expect(result.adjustedRoll).toBe(11)
})
```

These tests will fail immediately (red). Implement to green. The eval tests are the
game design contract — never modify them to make implementation pass.

### Engine Architecture

```
packages/engine/   — pure TypeScript, no IO, fully testable
  src/
    challenge.ts   — resolveChallenge(), applyModifiers(), computeTier()
    charts.ts      — generateChart(), lookupOutcome()
    match.ts       — possession flow, state management, Momentum/CMD
    cards.ts       — card types, stat validation, constraint checks
    ai.ts          — simple rule-based AI (expected value over Read Matrix)
  tests/
    evals/         — eval tests encoding the 14 criteria
    unit/          — unit tests for pure functions

packages/cli/      — thin wrapper, hot-seat play in terminal
packages/web/      — React UI wired to engine
packages/server/   — async multiplayer (later)
```

The engine package has no UI dependencies. It can be imported by CLI, web, server,
and test runner equally.

### Automated Criteria

Once the engine exists, many of the 14 criteria become automated metrics run over
N simulated games:

| Criterion | Automated? | How |
|-----------|-----------|-----|
| Dominant Action Rate | Yes | `count_actions(1000_games) / total_challenges` |
| Comeback Rate | Yes | `games_where_trailing_team_scored / total_games` |
| Stat Lead Meaningfulness | Yes | `challenges_where_tier_was_load_bearing / total_contests` |
| Rule Confusion | No | Still needs LLM judge |
| Tension Peak | Partial | Can detect A=5 programmatically; C≥4 still needs judge |
| Agency over Luck | No | Qualitative — needs human or LLM |
| Effort Dilemma Rate | Yes | Compute EV of spending vs saving at each decision point |

This is the payoff: criteria that took 6 sims and careful manual scoring to measure
can now be computed in seconds over 10,000 games.

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| Adding rules when criteria fail | More rules = more interactions = more G | Simplify and remove. One rule removed is better than one rule added. |
| Writing the sim in-line without a planning phase | Produces corrections mid-log ("Wait —", "REVISED:") which inflate G | Full planning phase first. Write the log once. |
| Conditional passives | Judge cannot verify if passive fired without tracking state | Passive fires unconditionally on every relevant event, or not at all. |
| Large stat leads in critical challenges | Makes resource spend decisions obvious (Dominant → E=1) | Design challenges at Contested to Fav+4. |
| Possessions that end on Checked | S=2 (truncated), fails Possession Completeness | Every possession needs a terminal challenge that resolves clearly. |
| Keeping unused rules "for flavor" | Adjacent zone bonus, Overload stat, etc. add modifier space for zero play value | If it doesn't fire in 3 consecutive sims, it's gone. |
| Modifying criteria when they're hard to pass | Criteria are the contract; passing them by lowering the bar is a lie | Diagnose root cause. Simplify the rule, not the criterion. |
| Starting the engine too early | You'll build the wrong thing | Wait for 3 consecutive all-pass sims. |
| Designing without a core dilemma | Everything is arbitrary without it | Write Phase 0 before anything. The dilemma is the game. |
| One-model eval | Model-specific blind spots become your blind spots | Run cross-model consensus for qualitative criteria. |

---

## Eval Convergence Table

Track across every sim. Update after each run.

```
| Criterion | Target | S1 | S2 | S3 | S4 | S5 | Streak |
|---|---|---|---|---|---|---|---|
| 1. [name] | [threshold] | - | - | - | - | - | 0 |
...

Convergence condition: ALL criteria at ≥3 consecutive passes → next version.
Forced bump: ≥15 sims → forced next version regardless.
```

---

## Files to Maintain

| File | Purpose | When to update |
|------|---------|---------------|
| `docs/game-design-vN.md` | Source of truth for all rules | Every time a rule changes (prepend SIMPLIFY-N entry) |
| `docs/playtest-findings-vN.md` | Eval Health table + sim log + patterns | After every sim |
| `/tmp/game_sim_vN_N.txt` | Sim log (temporary) | Written by sim subagent |
| `/tmp/game_eval_vN_N.txt` | Eval prompt with embedded sim | Written before Codex run |
| `/tmp/game_scores_vN_N.txt` | Codex scorecard output | Written by Codex |

The game design doc is the canonical reference. The playtest findings doc is the
research journal. Keep them separate — the design doc should always be readable as
a standalone rulebook, not as a changelog.

---

## Starting a New Game

### Preflight Checklist

Before running Sim 1:

- [ ] Phase 0 design identity paragraph written
- [ ] 12–16 criteria defined with pass/fail thresholds
- [ ] Scoring rubric written for each criterion (judge-usable without context)
- [ ] Sim log format defined (can be adapted from the Strikers pattern above)
- [ ] Eval prompt template written
- [ ] Version naming convention established (v1, v2... or Alpha/Beta/etc.)
- [ ] First squads/units/decks designed satisfying the card constraints

### Squad / Unit Design Constraints Template

Write these before Sim 1 and enforce them for every card/unit ever designed:

```
1. [Primary attacker]: [balance constraint, e.g., |Shoot − Pace| ≤ 1]
2. [Specialist]: [dual-stat requirement, e.g., both Pace ≥12 AND Pass ≥12]
3. [Defender]: [stat range, e.g., Guard 11–16]
4. [Counter unit]: [resource stat, e.g., Reflexes ≥ FWD Shoot − 2]
5. [All cards]: passives are unconditional chart row modifications or baked-in stats
6. [Budget constraint]: $50k cap (or equivalent) forces trade-offs
```

The constraints exist to prevent specific criteria failures before they happen:
- FWD BX Balance → prevents Defender Dilemma collapse
- MID dual-stat requirement → prevents Attacker Decision Quality collapse
- GK stat cap → prevents Effort Dilemma collapse (Dominant leads make it trivial)
- No conditional passives → prevents Rule Confusion inflation

---

## Integration with Other Skills

| Skill | How it integrates |
|-------|-----------------|
| `/evals-first` | Phase 1 criteria definition follows the evals-first framework |
| `/vsdd` | Phase 7 engine code starts with VSDD: evals → spec → implement |
| `/tdd` | Engine implementation uses TDD: eval tests are the red |
| `/game-studio` | Run several design variants in parallel as separate teams, with a shared findings board and a coordinator (swarm has no variant mode) |
| `/autodesign` | Once the engine exists, autodesign handles the game UI |
| `/grill-me` | Run on Phase 0 design identity before writing any criteria |
| `/mutation-testing` | Validate that eval tests actually catch rule violations |
