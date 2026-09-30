# Critic loop: scorecard, critic prompt, stop rules

The single most repeated technique in the best Opus 5.5 builds:
- Meng To had Opus score every part of the scene (ship, water, landscape, buildings and their
  sub-parts) and keep improving each until it scored at least 8/10, bounded by his budget.
- Truxat gave the model "a harsh AI critic that scores every area and sends it back until 8/10".
- Matt Shumer's Claude of Duty prompt: sub-agents compared side by side against the real game
  by a harsh critic, looping until they are "utterly wowed".
- Pradeep Kapoor: give Opus a target image and it will "climb the hill" — analyse, create,
  critique, improve, repeat.

What makes it work (and what makes it fail):
- **Concrete references.** "Make it better" fails; "match this photo / this game frame" works.
- **Separation.** The builder remembers every compromise and rationalizes it. A fresh critic
  sees only the artifact.
- **Fixed evidence.** Same seed, same views, same times of day every round, so scores are
  comparable and regressions are visible.
- **Anchored scores.** Without written anchors, critics drift into opinion ("looks nice, 7").
- **A stopping rule.** Otherwise the loop either quits early or burns the budget polishing
  something that was already fine.

## 1. SCORECARD.md (write it once, at the start)

Rows come from the brief. Typical rows for an outdoor game — delete what doesn't apply and add
the brief's centrepiece as its own row (e.g. "Water", "The mechanism", "The ship"):

| Row | What 4/10 looks like | What 6/10 looks like | What 8/10 looks like | What 10/10 looks like |
|---|---|---|---|---|
| Composition & framing | subject cut off, empty frames | readable but generic | every view has a clear focal point, foreground/mid/background depth | frames you'd use as key art |
| Lighting & shadows | flat, one light, crushed or milky | key light + shadows, some depth | clear key/fill/rim, contact shadows, AO in crevices, shadows readable (15–20% of lit) | light tells the time and mood at a glance |
| Atmosphere & color grade | white haze or no depth | fog exists, colors OK | blue aerial perspective, layered distance, intentional grade (warm highs, cool shadows) | matches reference palette side by side |
| Centrepiece system (e.g. water) | flat plane with a texture | reflections + waves | depth color absorption, foam that forms and decays, shoreline interaction, no tiling | you'd watch it for minutes |
| Terrain & rocks | smooth noise blob | varied heights, some texture | erosion/ridges, strata, rocks half-buried, wet bands at waterline | reads as a real place |
| Vegetation | uniform cones/billboards | varied species and scale | clumped groves, wind in a shared field, backlit leaves glow, no lawn look | dense, alive, sways in gusts |
| Materials & texture detail | flat colors | albedo variation | PBR detail at 0.5 m: normal/roughness, edge wear, grime, no stripes/tiling | holds up in close-ups |
| Architecture & props | primitives | recognizable shapes | real construction detail (joinery, roof tiles, rope lashings), grounded, nothing floats/intersects | environmental storytelling |
| Characters & animals | missing or T-posed | moving | weight, secondary motion, feet planted, no clipping | expressive |
| Animation & life | static world | a few loops | birds, fish, particles, cloth/signs swaying, reactions to the player | the world feels alive when idle |
| Time of day & weather | one lighting state | cycle exists | every hour looks intentional; storm/rain changes materials (wetness) | each state is a showcase |
| Audio | silence or noise | ambient loop | layered ambience + SFX tied to actions, spatialized, mute key | mood carries without visuals |
| UI & feel | cluttered or none | functional | minimal, legible, responsive, good first 10 seconds (loader teaches controls) | invisible until needed |
| Performance | < 30 fps / hitches | playable | p95 ≤ 16.7 ms at default tier on target machine, no shader-compile stalls | scales down gracefully |
| Stability | errors, black frames | occasional glitches | zero console errors, no flicker/z-fighting in motion diffs | — |
| Load & weight | > 10 s to first frame, blank while loading | loads, but slowly or with a blank wait | something on screen within ~2 s, full scene soon after, file size justified by what's in it | instant, tiny |
| Correctness (explainers/lessons) | shows something false | roughly right, unlabeled simplifications | physics/facts check out against sources; simplifications labeled | an expert would use it to teach |

**Name the genre equivalents before scoring** (from Majid Manzarpour's scorecard). In a board
game "Architecture & props" might be the pieces and the table; in pool, "Characters" is the
cue-ball contact feedback. Don't invent enemies, loot or extra props to raise a score, and
don't add noise or particles to raise the image metrics: a deliberately clean composition can
measure low and still score 8.

**Calibration images.** Text anchors drift; images don't. Keep 2–3 screenshots in `refs/anchors/`
showing what a 4, a 6 and an 8 look like for this project (the round-1 contact sheet is a
natural "4"; the reference images are the "10"). The critic looks at them before scoring.
"If a surface reads closer to the 4 than the 8, it's a 4–5, however much code went into it."

**Automatic failures.** Any one of these caps the related rows at 5, whatever else is true:
- The hero view is dominated by placeholders or empty space the design doesn't justify.
- A hero object is a primitive plus glow.
- Fog, darkness, bloom or particles are standing in for missing geometry.
- UI overlaps the play area, clips text, or breaks safe areas on a target screen.
- The game can't be played through real input (a playtest fails), or no active-play shot exists.
- No renderer stats (draw calls, triangles) after a graphics pass.

**Fun checks** (for games, not scenes). Flag it if the first 30 seconds contain no real
decision, if the player can ignore the main mechanic and still progress, or if losing teaches
nothing.

Below the table, keep a running log:

```
| Round | Light | Atmos | Water | Terrain | Veg | Mat | Arch | Chars | Anim | ToD | Audio | UI | Perf | Stab | Min | Changed this round |
|  01   |  4    |  3    |  5    |  5      |  4  |  3  |  —   |  —    |  3   |  4  | 3     | 5  | ?    | 8    | 3   | scaffold            |
```

## 2. Evidence for each round

```
npm run build && node scripts/check.mjs --url dist/index.html
node scripts/shoot.mjs --url dist/index.html --out shots/round-NN --ref refs/ [--views ...] [--times 7,12,17.5,22]
```

`shots/round-NN/contact-sheet.png` is the critic's main input. It contains the reference images
first, then every view × time, then a motion diff per view, each labeled with metrics:
- `contrast` (luminance std-dev; < 25 usually reads flat/milky, > 75 harsh)
- `color` (Hasler–Süsstrunk colorfulness; < 20 dull, 30–60 vivid, > 80 garish)
- `crushed %` / `blown %` (pixels near black/white; > 10% crushed at night = unreadable)
- motion diff `% px changed` (red on static geometry = flicker, z-fighting or shadow acne)

Metrics are hints, not scores. Night scenes are legitimately darker; a stylized game may want
low colorfulness. The critic decides, citing them.

## 3. The critic subagent prompt

Spawn a new subagent every round (fresh context — never the builder). Fill the brackets:

```
You are a harsh art director and technical artist reviewing round [NN] of a real-time 3D
browser game. You have NOT seen the code and must not ask about it. Judge only what's visible.

Read: BRIEF.md (the target), SCORECARD.md (rows, 4/6/8/10 anchors, previous rounds),
shots/round-[NN]/contact-sheet.png (reference images come first), the per-view PNGs if you
need detail, and shots/round-[NN]/metrics.json.

Compare against the reference images and against shipped AAA games of this genre — not
against the previous round. A 7 means "good for a demo, not shippable".

Return exactly:
1. A score 1–10 for every scorecard row, each with one line of visual evidence
   (which view/time, what you see). Use "—" only if the row is truly not applicable.
2. Defects list: anything floating, intersecting, clipping, tiling, flickering (check motion
   diffs), popping, crushed/blown, unreadable, or contradicting the brief. Cite the frame.
3. The ONE highest-leverage change for the lowest-scoring row: what is wrong physically or
   artistically, and what a fix looks like in concrete terms (names of techniques are fine).
4. Anything that regressed since the last round.
No praise, no summaries of what works. Report concrete defects; don't endorse or adjust a score
the builder proposed.
```

## 4. Loop rules

- Work the **lowest** row first; ties go to whatever the player sees most (the hero view).
- One owner per change set. After a fix, re-shoot and re-score before starting another row.
- Keep a `STATUS.md`: current round, scores, what's in flight, what's next. It survives context
  compaction and lets a fresh session resume.
- **Stop** when: every applicable row ≥ 8; or the agreed round/time/usage cap is reached; or two
  consecutive rounds didn't raise the minimum score (plateau — ask the user, show the sheet).
- Human checkpoint after the first full round and at each plateau. The best results came from
  "letting it work as long as possible between high-value human interventions", not from
  zero oversight.
- If you can't spawn subagents, critique in a separate step from images + metrics only, and
  write the scores down before opening any code.

## 5. Lessons from six OGS games (Sep 2026)

From Night Flight, Rocket Crew, Story Nook, Bake Shop, Peekaboo Garden and Catancast:

- **Check the evidence rig before trusting a score.** In Night Flight the critic was misled by the
  rig itself:
  - the recorder sent extra taps;
  - `shoot` reset saved wins, so progress looked like it went backwards;
  - every recorded game was a loss, so the win audio never got heard;
  - a still meant to show a flight was captured on a turn with no flight.

  Before each round, scan the evidence for rig artifacts, and make the recorder play a
  representative game (including a win).
- **Make the invisible measurable.** Critics can't hear audio or feel motion from stills. Give them
  numbers at each story mark:
  - loudness (EBU R128) and a spectrogram;
  - an audio report of bass share, harshness and onsets;
  - a brightness (luma) curve across the session;
  - input latency and frame times.

  Rows capped at "not demonstrable" rose as soon as this evidence existed.
- **Fresh critics disagree.** In Night Flight, "beauty" scored 6 and 8 on near-identical frames.
  Use 2 critics and take the median for the lowest rows, or show the critic a few calibration
  frames with fixed scores.
- **Grade against named references, never against the last round.** Story Nook's AAA rubric (Paper
  Mario Origami King, Tearaway, Yoshi's Crafted World, Sabuda pop-ups; "8 = a Nintendo art director
  would sign off") re-scored a 6 as a 4. That was the honest ceiling of vector clip-art.
- **Plateaus on art or audio rows need assets, not code.** Code-only passes stalled both Catancast
  (Sea 5) and Story Nook. Produced assets unstuck them: ElevenLabs lullabies and foley took
  Audio 4→7, and a 140-image fal kit took Illustration 5→7. When a row is asset-bound, escalate.
- **Split the work by model and area.** A Sonnet first pass for breadth, then Opus subagents that
  each own one area (the scene, art or audio), each taking the critic's top 3 for that area. The
  main session keeps game logic and phones.
- **Split the rubric: functional vs AAA.** Get the functional scorecard (kid usability, feedback,
  talking) to 8 first, then run an AAA scorecard for presentation.
- **The spec beats the critic.** Decline critic advice that contradicts the family's spec, and log
  why.
- **Never edit a test to fit a change.** Several passes "updated test strings" or changed a
  pose-test spec to make their own change pass. A test changes only when the spec changes, and
  the change goes in the morning report.
- **Overnight runs:**
  - STATUS.md must always be resumable.
  - Keep a "changes made on my own judgment (flag any you disagree with)" list in the spec.
  - Write a morning report.
  - Check API balances before starting: a fal balance running out stalled two games.
  - "Go hard overnight" can override the plateau stop, but note the plateau for the morning.
