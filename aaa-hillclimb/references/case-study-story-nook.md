# Case study: Story Nook (Sept 29, 2026)

A bedtime pop-up storybook cast party game: TV (three.js pop-up book), grown-up phones (the
words), kid iPad (pictures), little-kid device (sparkle / yawn / night-night). Before this loop
it had passed an overnight critic loop on an *indie* scorecard (round 08: mostly 7s). The user:
"less than impressed… it looks clumsy… all our games have the same feel… closer to Nintendo /
AAA". Repo: `~/src/story-nook`, scorecard `critic/aaa/SCORECARD.md`.

## Rounds

| Round | Min | What the pass did | Largest remaining gap (critic) |
|---|---|---|---|
| 00 | 4 | baseline: the overnight build re-graded at AAA | "the art itself is the ceiling" |
| (pass) | — | fal art kit: 140 assets (style prefix, char sheets → 9 poses via nano-banana edit, birefnet cutouts, WebP); ElevenLabs lullaby beds + paper foley | — |
| A01 | 4 | art integrated into the scene | flat floating billboards, dead blurred page floor, centred framing |
| A02 | 5 | thirds framing, contact shadows + foot tabs, card thickness + box folds, no grey veil, anticipation/overshoot, paper bedroom; kid sound "drums", phone vignettes, produced kid sounds | blank page floor, lamp off-screen, crushed night, Next clipped |
| A03 | 6 | painted per-place floors, diegetic paper lamp, staggered pops + breathing idles, level shelf flight; chained 3-variation lullaby, sub-free stomp, on-model poses | pick white-out, floating beds, lamp on at Sleep, letterforms on TV |
| A04 | 6 | paper-pop reveal, grounded beds, lamps out at sleep, pictograph glyphs, tighter camera; one-screen phone layout, shared covers | payoff half crushed (closing luma 13), turns cut to dark room |
| A05 | 6 | moonlit payoff, book-level turns, soft pose flips, blanket prop, 4 cover layouts; loudness-matched beds, picture unlock cards | "stickers standing in a dark box" — plateau → stop rule |

Every row rose 1–3 points (e.g. Env 4→6, Anim 4→6, Audio 4→7, UI 5→7). The user watched the A05
video and said "this latest video looks really great".

## What moved the needle most (in order)

1. **Replacing the asset pipeline** when the critic said art was the ceiling (procedural Canvas
   drawings → a generated, calibrated illustration kit). Nothing else comes close.
2. **Composition** (thirds, eye-level camera, cut dead space): cheap, lifts three rows at once.
3. **Grounding** (contact shadows, stand tabs, nothing hovering) and a **visible light source**.
4. **Real audio evidence**: grading audio from a stale round had pinned it at 4; with this
   round's capture it was 7.

## What plateaued, and why

Env/Mat/Light/Anim/Cam/Replay held at 6 for three rounds. Each fix landed, and each fresh critic
still read "watercolour stickers standing in a dark box". Structural causes:
- generated cut-outs carry white sticker borders; flat upright layers read as stage flats;
- the game's own rule ("bedtime = dark, brightness falls page by page") fights "readable payoff".
The next gain needs a different approach (e.g. fully painted spreads per page with animated
characters, or true folded 3D paper geometry), not more polish passes.

## Costs and time

- ~7 hours wall clock for 6 rounds; each scene pass ~45–90 min of a single Opus agent
  (~450–515k tokens each); each critic ~2–4 min (~100–150k tokens).
- fal: ~160 images total (kit + regenerations); the account ran dry once mid-pass.
- ElevenLabs: 3 lullaby beds + 2 story variations, 5 foley, 15 kid sounds.
