# Case study: the OGS app (Oct 2026)

The OGS app is a family hub that launches web games, puts them on the TV, keeps each household's
state, and brings people back to games. Surfaces: grown-up phone (390×844), kid iPad (1180×820
landscape, no words), TV (1920×1080, nobody touches it). Prototype: `~/src/open-game-system/design/`,
scorecard `design/critic/SCORECARD.md`, decisions `design/critic/decisions.tsv`.

## Rounds

| Round | Min | Mean | What the pass did | Largest remaining gap |
|---|---|---|---|---|
| 00 | 4 | — | five concepts (console, kitchen, channel, spine, people), ranked by two critics | every concept capped by its model: one living room, or time-first IA that can't hold async |
| 01 | 3.75 | 6.54 | owner's pick (console + layers): model lanes, game nights, inbox, landscape kids, TV rules, dev page | flow 9 failures, first run and Continue/New undesigned (a structural gap: the session model) |
| 02 | 6.25 | 7.25 | failures on the session model, first run, Continue/New, statuses, stickers + identity tokens, TV timeline | no single visual system for OGS's own layer; Household undesigned |
| variants | — | — | 15 `v-*` variants of key moments, reviewed as videos and sheets only (owner's ask) | quantity before depth surfaced the real question: casting is the first thing you do |
| 03 | 5.5–5.75 | 6.69–6.91 | owner pivot to **cast-first**: four TV launcher concepts (switch, rows, ps, room) | three were console clones; the room was ownable but had to scale → own language (room warmth + status rows) |
| build | — | — | spec v3 (`docs/product-specs/ogs-app-v3.html`) implemented overnight: protocol, API + couch session, TV launcher, app tabs | verified on simulator + fake Chromecast; real-device pass pending deploy |

## What moved the needle most

- **Going wide before deep, then letting the owner use the app as it is today.** Round 02 scored
  7.25 on a model the owner then replaced in one message ("cast to TV is the first thing you do").
  The variant sheets were what made that visible. Put a "use the real product for 10 minutes"
  step before any deep round.
- **A structural gap named as structural.** Round 01's floor (3.75) came from the session model,
  not polish; pass 2 fixed the model first and the floor jumped to 6.25.
- **Checks that fail loudly on taste rules.** kidWords, tvSmallText, textOverlaps and contrast
  turned "kids can't read" and "nothing covers the focal area" into numbers every pass had to hold.
- **The spec as visuals (/show-me HTML)** let the owner make 10+ decisions in one sitting (tabs,
  order, default tab, null states, no-TV state, instance lifecycle) without reading prose.

## What plateaued, and why

- **Visual and Motion stayed near 6** across rounds 01–03: each concept borrowed a look; there was no
  OGS-own visual system until the identity tokens (Fraunces, dusk palette, stickers, dotted path).
- **Console-clone launchers** (round 03) scored fine on flow but low on trust/identity: critics
  punish familiarity without ownership.
- **Game art**: captures carry HUD rows and faced props (smiling planets/stars, against the owner's
  no-faces rule). Fixed by a manifest `art.safe` crop, but it has to be checked by eye per game,
  per surface (it regressed once on the phone because only the launcher applied it).

## From prototype to build: what verification caught

The build was verified on every surface with deterministic e2e (tester.army `e2e` for web + iOS,
Detox, a fake Chromecast that counts loads and records the TV). Bugs only the cross-surface runs
found:

- a render loop when the TV waited for a game's view (pure reducer returned a fresh object);
- the phone opening a game twice (own push + the session's host follow): two rooms, swipe back
  revealed the duplicate;
- the first-visit hint ("Swipe to go home") swallowing the swipe it teaches;
- a made-up resume point ("Paused just now") shown twice on the TV.

Lesson for the skill: **a prototype scorecard doesn't end the job**. Keep the evidence rig
(sheets, synced phone+TV video) for the build, and run real games, not fixtures, at least once:
Rocket Crew only declares its TV view after the host joins, which no fixture modelled.

## Costs and time

- Art spend: $0 (no paid generation; existing game captures, cropped).
- Critic rounds: 4 (00–03) with two fresh critics each; 15 variants.
- Build: one overnight session (protocol + API + launcher + app in parallel agents, then
  integration and verification in the main loop).
