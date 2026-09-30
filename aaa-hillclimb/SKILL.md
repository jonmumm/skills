---
name: aaa-hillclimb
description: >
  Progressive self-improvement for an existing game: grade it like a first-party (Nintendo / AAA)
  studio on an anchored scorecard, then loop — shoot fixed evidence (contact sheet, recorded
  multi-screen session with real audio, phone strips, perf, audio report) → a FRESH critic
  subagent scores every row and ranks fixes → one owner per coupled system fixes the top gaps →
  repeat until every row ≥ 8 or the minimum stops rising. Use when a working game "looks clumsy",
  "feels like all our other games", needs to go "closer to Nintendo / AAA", or for any
  "keep improving until it's 8/10" request on a game that already plays end to end.
dependsOn:
  - jonmumm/skills@procedural-3d-web-game
  - jonmumm/skills@ai-art-assets
---

# AAA hill-climb

A playable game gets good by **climbing a hill in fixed steps**, graded by someone who didn't
build it. This is the loop that took Story Nook (a cast party bedtime game) from a
"competent indie demo" to a build the family called "really great" in one day: baseline
min 4/10 → A02 5 → A03 6 → plateau at 6 over A04–A05, every row up 1–3 points
(see `references/case-study-story-nook.md`).

It extends the critic loop in `procedural-3d-web-game` (read its `references/critic-loop.md`)
from "build a new scene" to "raise a shipped game": phones, story, audio and payoff included.

## When to start

- The game plays end to end (a vertical slice at least). Polishing a broken loop is waste.
- The user's bar is a studio bar ("Nintendo", "AAA", "less clumsy", "not the same look as our
  other games"). A small fix stays a small fix; don't start this loop for it.

## Step 0 — Re-baseline on a harsher scorecard (round 00)

Old scorecards drift toward "good for us". Write a new one, `critic/aaa/SCORECARD.md`, from
`references/scorecard-aaa.md`: named references as the 10 (e.g. Paper Mario, Tearaway, Yoshi's
Crafted World for papercraft), an **anchor for 6, 8 and 10 on every row**, and the sentence
"8 = a first-party art director would sign off shipping it". Then grade the *current* build with
a fresh critic. Expect previous 7s and 8s to land at 4–6. That drop is the point.

**Read the baseline's largest gap literally.** If the critic says "the art itself is the
ceiling", no amount of lighting or shaders will fix it: change the asset pipeline first
(`ai-art-assets`: style bible + prompt prefix, 4-image calibration, character sheet → poses with
an image-edit model, background removal, WebP + manifest; ElevenLabs for music beds and foley).
In Story Nook that one pass was worth more than any later pass.

## Step 1 — A fixed evidence rig (one command per round)

The critic only sees evidence, so evidence is the product. Build `scripts/round.sh NN` once
(template: `references/evidence-rig.md`). Every round, same seed, same story, same views:

1. **Contact sheet** of named camera views + every hero moment (a scenario hook that jumps to a
   beat, e.g. `?hook` + `loadScenario`), with automatic checks written into the log
   (brightness curve, framing, shader program count, frame-time p95).
2. **A recorded session**: every screen side by side (TV | grown-up phone | kid tablet) with the
   TV's **real audio**, playing the whole game through, plus event marks (`marks.json`).
3. **Phone strip / phones sheet**: every phone state at CSS scale.
4. **Perf JSON** (p50/p95/p99 frame times, programs at start vs end, input latency).
5. **Audio report + spectrogram** per section (loudness, low/treble share, harsh transients).

Commit each round's evidence under `critic/rounds/NN/`. Open the session video for the user
at each round: they will want to watch it, and their reaction outranks the scorecard.

## Step 2 — A fresh critic every round

Spawn a new subagent (strongest model) each round with `references/critic-prompt.md`: it reads
the scorecard, the spec and the evidence, **never the code**, grades against the references
(never against the previous round), and returns: a table (score + concrete evidence per row,
citing shot names and timestamps), the single largest gap, the top 6 fixes ranked by score per
effort in game-dev vocabulary, and one log row. Append the row to the scorecard log and commit.

Don't reuse a critic (it anchors on its own last scores) and don't argue with one. If a critic
misreads evidence, fix the evidence (see Gotchas), not the critic.

## Step 3 — Fix passes, split by coupling

- **One owner per coupled system.** The TV scene (camera, light, materials, animation, set) is
  one system: one agent owns `src/client/scene/**` + its art pipeline for the whole pass, with
  the critic's fixes as numbered steps, each with acceptance criteria that name shots
  ("no spread shot has >15% empty page floor; hero on a thirds line in 03, 05, 11, 18").
  Parallel agents on one coupled system make it worse.
- **The main loop does the independent rows** meanwhile: phone UI, kid UX, audio mix, story
  text, recorder fixes. Tell the scene agent exactly which files are off-limits.
- **Every agent prompt carries:** file ownership, "commit after each step", "look at the shots
  with the Read tool after each step", engineering rules (no `any`/`as`, tests green,
  never edit an existing test or threshold without saying why), a budget (steps or ~4 h), and
  a short final report: changes per step, best shots, perf, **thresholds moved (old → new)**,
  what wasn't achieved.
- Relay user-facing trade-offs (moved brightness targets, behaviour changes) to the user in
  plain words. Tests that pin behaviour stay; fold new content into existing structure instead.

## Step 4 — Stop rule

Stop when every row ≥ 8, or the minimum fails to rise for **two consecutive rounds**, or the
budget ends. At a plateau, stop and hand the user: the score table (baseline vs now), the
latest video, the rows stuck and *why* (usually structural: the art approach, a design rule
like "bedtime = dark" fighting "readable"), and 2–3 concrete directions with a recommendation.
Plateaus are information: they tell you the next gain needs a different approach, not more
polish.

## Gotchas (all hit in practice)

- **Silent recordings.** A hung CoreAudio stalls every AudioContext clock (`currentTime` frozen,
  MediaRecorder emits nothing). Launch the recorder's Chrome with `--disable-audio-output`
  (a timer-driven fake speaker; capture comes from a MediaStreamDestination) and fall back to a
  silent video with a loud warning instead of crashing.
- **Stale evidence gets graded.** A critic graded Audio from an older round and scored the
  pre-upgrade synth. Always give the critic this round's audio.
- **Misleading metric names.** "clicksOrThumps = 0" was read as "no foley". Name metrics by
  intent ("harshClicks (want ≈0)") and tell the critic what each measures.
- **Recorder stalls.** Break the play loop on the end screen, click only elements that exist
  (`count()` first, short timeouts), and dump the stuck page's text when something times out.
- **Shared build output.** Two agents rebuilding the same bundle mid-run contaminate each
  other's shots. Build right before each shoot; accept the other agent's changes appearing.
- **Credits run out mid-pass** (fal 403 "Exhausted balance"). Generation scripts must fail
  before overwriting; tell running agents to fall back to existing art; ask the user to top up.
- **Secrets only in the interactive shell** (`zsh -ic '…'`); never printed or logged.
- **Long rounds.** A full round can exceed a 10-minute tool timeout: run it in the background.
- **Critic variance.** Fresh critics re-discover issues and sometimes miss fixed ones. Judge
  progress by the minimum and the trend over rounds, not a single row's wobble.

## References

- `references/scorecard-aaa.md` — the AAA scorecard template (rows, anchors, log format).
- `references/critic-prompt.md` — the fresh-critic prompt, ready to fill in.
- `references/evidence-rig.md` — round.sh, recorder, phone strip, audio report patterns.
- `references/case-study-story-nook.md` — rounds, what moved each row, costs, plateau analysis.
