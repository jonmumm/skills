---
name: procedural-3d-web-game
description: Build stunning, playable 3D browser games, explorable worlds and interactive 3D explainers with Three.js, with models, textures and sound generated in code, using an art-directed brief, scripted playtests and a screenshot-and-critic loop that iterates every part of the scene to 8/10+. Use for requests to build a new 3D game or scene for the browser, to recreate a game or place in 3D, to make an interactive 3D lesson or visualization, or to improve the look, feel or performance of an existing Three.js project.
---

# Procedural 3D Web Game

This skill packages how the best Opus 5.x three.js games of Sept 2026 were actually made
(Antikythera, Tidewater, Meng To's river valley, Claude of Duty, the Far Cry lagoon, The Forest
island, Sakura Crossing, Ryan Sael's lens lab — see `references/case-studies.md`). None of them
were one magic prompt. Every one followed the same shape:

1. **A strong target, set in one of two ways.** Either a long, art-directed brief (named
   landmarks, hero objects built part by part, one "centrepiece" system specified in depth, a
   time/weather cycle, controls, hard constraints, a performance target, explicit self-test
   instructions), or a **short ask plus a reference image, run in a folder of the builder's
   previous projects** so Opus picks up an established house style. Reference images in both.
2. **Everything in code.** Three.js (WebGL2, or WebGPU + TSL), procedural geometry, procedural
   PBR textures, instancing for thousands of objects, Web Audio synthesis. Output is one
   self-contained HTML file.
3. **A verification loop that runs for hours**: build → capture the same camera views and times
   of day every round → a *separate* harsh critic scores every part of the scene against the
   references → fix the lowest score → repeat until everything is ≥ 8/10 or the budget runs out.
4. **Staged depth passes** in fresh sessions ("Stage 7: flagship water"), each with acceptance
   criteria, rather than one giant session that drifts.
5. **Specific human steering** between rounds, in domain language ("caustics are just noise —
   rewrite from scratch", "foam should form after the crest crashes, not roll up the inside").

Your job is to run that process. The quality comes from the loop, not from the first pass.

**Scale the process to the ask.** The user's words set the bar. "Make a small arcade game"
means a good version of that, not the full premium pipeline; "polished", "AAA", "showcase" or
"this looks too basic" means the whole loop. A narrow fix to a finished game stays narrow:
affected checks only, no full re-audit.

## Contents of this skill

- `template/` — a working starter (Vite + three r186, single-file build) with the engine
  contract, seeded RNG, quality tiers, named camera views, time of day, debug hooks, a
  procedural island, reflective water, sky, color grade, synth ambience and an F3 frame-time HUD.
- `scripts/check.mjs` — headless load test: console/page errors, blank-canvas check, frame stats.
- `scripts/shoot.mjs` — the critic's evidence: every view × time of day, motion-diff pairs to
  expose flicker/z-fighting, image metrics, and one labeled **contact sheet** PNG.
- `scripts/elevenlabs.mjs` — generates sound effects, music and voice lines with ElevenLabs
  into project files at build time, and records each one in `assets/audio/CREDITS.json`.
- `scripts/playtest.mjs` — runs an acceptance walkthrough (keys, clicks, state assertions,
  screenshots) headlessly and fails loudly when a mechanic breaks.
- `references/brief-template.md` — how to turn a one-line idea into a winning brief.
- `references/critic-loop.md` — scorecard format, anchors, critic subagent prompt, stop rules.
- `references/rendering-cookbook.md` — technique checklists per subsystem (water, sky, light,
  vegetation, materials, characters, audio, performance) and the vocabulary for steering.
- `references/case-studies.md` — what each notable builder did, with links.

Read the reference file for a phase when you reach that phase, not all up front.

## Phase 0 — Brief (before any code)

Pick the mode with the user:

- **Long brief** (default for games with mechanics, or when there's no prior work to draw on):
  expand the idea with `references/brief-template.md`.
- **Reference + style corpus** (Ryan Sael's approach; best for explorable scenes, explainers
  and interactive lessons, and for anyone with a body of past 3D work): keep the prompt short
  ("build this as an interactive web page from this image; match the vibe as closely as
  possible; make it really good"), attach the reference image, and work inside a folder that
  holds their earlier finished projects, or add a `style/` folder with them. Before building,
  read those projects and write `STYLE.md`: palette, lighting and post setup, typography and
  UI patterns, camera behaviour, interaction idioms, performance tricks, file layout. Treat it
  as part of the brief. Ryan says his quality came mostly from this context, and warns that
  the same short prompt in an empty folder won't match it.
- **Play-and-iterate with players** (Danny Limanseta built a game in a day this way with his
  kids): the players say what they want, you build it in short cycles, and everyone plays
  each version. Keep a running `IDEAS.md` of their requests, ship something playable every
  cycle, and save the polish loop for the end. This is the mode for family projects and
  game jams, where fun and ownership matter more than frame-perfect visuals.

Either way, if the user gave a short idea, expand it into a brief and show it to them for a
quick yes/edit. Ask for (or offer to generate/find) **reference
images** — every top result used them; an image gives Opus a concrete target to climb toward.
If the user has an image-generation tool connected, generating 2–4 concept frames first is
worth it. Save the brief as `BRIEF.md` in the project and never lose it: it is the contract
every later round is judged against.

Decide the asset strategy with the user (see cookbook §Assets): fully procedural (default,
most impressive, zero dependencies) vs. procedural + CC0 textures/sounds vs. AI-generated
models (Tripo/Higgsfield/Blender) for hero characters. Characters and realistic footsteps/music
are where pure code is weakest; say so.

**Art: fal.ai and Meshy.** For generated illustrations, character sheets, textures or 3D models, use the `ai-art-assets` skill (`FAL_KEY` and `MESHY_API_KEY` in env, same key rules as below).

**Audio: Jon has ElevenLabs API access.** The key is in the `ELEVENLABS_API_KEY` environment
variable. Use `scripts/elevenlabs.mjs` (run `check` first) for anything synthesis does badly:
music loops and stingers, realistic sound effects, and voice lines. Voice matters most in kids'
games with no words on screen: a narrator can say whose turn it is, read clues, and cheer.
**Paid assets share one wallet per service across every game.** Before any fal, Meshy or
ElevenLabs run, follow `ai-art-assets` → "Cost discipline": caps in `.asset-budget.json`
(enforced by the scripts), `--dry` counts first, generate parts and compose in code, preview before
paying for finals. ElevenLabs specifics: music is the costly kind (keep loops 30–60 s and
crossfade them); draft trailer and VO scripts with macOS `say` and generate the final voice once
the words are locked; cache TTS by text + voice so re-cuts never re-bill; calls are serialized
machine-wide by the script, so don't background several at once.

Rules: generate at build time and ship the files, never call the API from the browser or put
the key in a bundle, commit, log or chat; don't overwrite existing files (each generation
costs credits); keep synthesized sound for ultra-frequent tiny events (UI ticks, footsteps
variants) where file count would balloon. If the variable isn't set in the current shell,
say so and fall back to synthesis, rather than asking for the key.

## Phase 1 — Scaffold

Copy `template/` to the project, copy `scripts/` into it, `npm install`, `npm run build`,
`node scripts/check.mjs`. Keep the engine contract (`template/src/core/engine.js` header):
one system per file/directory, `init/update/dispose` lifecycle, cross-system access only via
`ctx.get(id)` and `ctx.bus`, all randomness from `ctx.rng.fork(...)`, no per-frame allocation,
every new effect gated by a `ctx.quality` tier. Keep `window.__game` debug hooks working —
the harness depends on them — and add a **named camera view for every hero moment** in the
brief (views are computed from the world, not hard-coded coordinates).

WebGL2 is the default because it renders everywhere, including headless test browsers.
Choose WebGPU + TSL (`three/webgpu`) only when the brief needs compute (FFT ocean, GPU
particles) and the user's machine supports it; then follow the TSL rules in the cookbook.

If the project must run as a Claude artifact or be a single file, the Vite singlefile build
already inlines everything — do not add CDN imports or fetched assets.

## Phase 2 — Vertical slice

Get the playable loop working end to end before polish: controls, camera, the core mechanic,
win/loss or goal, audio start on first gesture, pause. Then run check + shoot once. A premium
look on a non-playable scene is the most common failure; the brief's interactions come first.

Write each acceptance criterion as a playthrough ("swim out past the shallows, dive to the
reef, climb into the boat, cast off, dock, climb out") and turn it into a steps file for
`scripts/playtest.mjs`: key presses, clicks, `__game` calls, assertions on game state, and
screenshots. Expose the state those assertions need on `window.__game.state()` (for example
`{ player: { inWater, inBoat, air }, boat: { speed, moored } }`). Hold keys by frames
(`holdFrames`), not milliseconds, so a playtest behaves the same on a fast GPU and in a slow
headless run. Rerun every playtest after each stage so a visual pass can't silently break
a mechanic. `template/playtests/smoke.json` is a working example.

Scenario and state hooks (`loadScenario`, `setView`) should acknowledge what they did, for
example by returning `{ state: name }`, and throw on unknown names. Then a screenshot labeled
"boss fight" can't silently be the title screen. For games with pressure, also run a
"reckless" playtest that seeks failure and checks that retry works, and compare a fast bot
with one that waits ~300 ms between steps. If both survive equally long, the difficulty is
decorative; if even the fast one dies to the first threat, the opening is unfair.

## Phase 3 — Staged depth passes

Split the brief's systems into stages, ordered by visual impact per cost (light, grade and
atmosphere first — cheapest, biggest win; then the centrepiece system; then terrain/vegetation;
materials; props; performance). For each stage write a short spec with **measurable acceptance
criteria** ("0–0.5 m water is nearly colorless; 1–3 m vivid turquoise; ≥6 m deep blue").
Run each stage as its own focused pass, ideally a fresh session or subagent that owns that
system's directory. Rules that held up in practice:

- **Sequential single owners beat parallel fan-out for coupled systems.** Claude of Duty found
  six parallel agents per directory made things *worse*; one owner per pass improved it.
  Parallelize only genuinely independent work (audio vs. UI vs. a far-away prop set).
- Don't break earlier stages: after each stage, re-shoot a fixed "regression pair" of views.
- Rewrite, don't patch, when a system is fundamentally wrong (Dan Greenheck: "caustics need to
  be rewritten from the ground up").
- Keep CPU queries in sync with GPU visuals (e.g. `water.heightAt()` evaluates the same waves
  as the shader) so floating objects, footsteps and cameras agree with what's drawn.
- Every agent you start needs a termination condition and a budget. Report status; don't let
  subagents run for hours unobserved.

## Phase 4 — The critic loop (the part that makes it good)

Follow `references/critic-loop.md`. In short:

1. `npm run build && node scripts/check.mjs` — must pass (no errors, not blank).
2. `node scripts/shoot.mjs --out shots/round-NN --ref refs/` — contact sheet + metrics.
3. Spawn a **fresh critic subagent** that has not seen the code or your reasoning. Give it only
   `BRIEF.md`, the scorecard (`SCORECARD.md`), the contact sheet, the motion diffs and
   `metrics.json`. It scores every row 1–10 with evidence, and names the single largest,
   most actionable gap. Be harsh: compare against the references and shipped AAA games, not
   against the previous round.
4. Fix the lowest-scoring row first (one owner, one focused change set), rebuild, re-shoot.
5. Append the round to `SCORECARD.md` (scores per row per round). Stop when every row ≥ 8, or
   the round/budget cap hits, or two consecutive rounds fail to raise the minimum — then ask
   the user for direction with the contact sheet in hand.

If subagents aren't available, do the critique yourself but only from the images and metrics,
in a separate step, and write the scores down before you look at code.

Static stills hide flicker, shimmer and z-fighting (a builder noted models struggle to spot
z-fighting from stills) — that is what the motion-diff frames are for: red on terrain or
buildings is a bug; red on water, foliage and particles is expected.

## Phase 5 — Performance and ship

Budget in frame-time percentiles, not average FPS (p95 ≤ 16.7 ms on the target machine at the
default tier). Techniques in cookbook §Performance: instancing, LOD + impostors with dithered
fades, pre-warm shaders (`renderer.compileAsync`) behind a themed loader, constant light counts,
half-res expensive passes, quality tiers. **Headless SwiftShader FPS is meaningless** — measure
with `--gpu` on the user's own machine, or ask them to press F3.

Load time counts as much as frame rate for anything shared as a link. Ryan Sael noticed a
copycat page of his "took a while to load because it was stuffed with too much". Report
`bootMs` from `check.mjs` and the `dist/index.html` size each round, generate heavy content
lazily after first paint, and show something on screen within a second or two. Test once on a
phone: people hit "needs WebGL" and white-blob failures on some Android Chrome builds, so keep
a graceful fallback message.

If the game will outlive the prototype (other players, a public link, a store), add the
production basics early, since they get expensive once content piles up (from Garrett
Petersen's indie-game-vibe-coding-skills, which cover this in depth):
- **A visible build ID** in a credits or debug view, stamped into every bug report and
  screenshot, and checked against the live deploy after each push.
- **Semantic actions, not devices.** Controls map keyboard, mouse, touch and gamepad into
  actions like move, confirm and inspect, and one dispatcher enforces the same rules for all of
  them. Instructions show the player's current binding, never a hard-coded "press W".
- **Canonical IDs and versioned saves** as soon as anything persists (progress, albums,
  unlocks): stable IDs instead of names or array indexes, a schema version in every save, and
  migrations that validate before replacing the old save.
- **Fail loudly in development, recover quietly in production.** Tests and dev builds throw;
  the public build reports the error once, keeps the last good save and carries on.
- **Release channels.** A moving playtest link, plus frozen versioned links for anyone who needs
  the build to stay the same (judges, press, a demo at a meetup).
- **A credits file** that records every non-procedural asset (a CC0 sound, a Meshy model, a
  font) with its source and license when it enters the project, not at the end.

Ship: `npm run build` → `dist/index.html`. Offer to publish it as an artifact or to GitHub
Pages. Final report: what's in it, the last contact sheet, the scorecard table, known weak
rows, and the one next pass you'd do.

## Working with Opus 5.5 on long builds

Lessons Majid Manzarpour measured while tuning his three.js skills for Opus 5.5:

- **Report at each phase boundary.** Current models under-narrate on long runs. Give the
  user a short update when a phase or stage finishes, not only when something goes wrong.
- **Don't stop early.** Until the requested bar is met, don't end a turn by announcing the
  next step, offering to continue, or listing decisions that don't block the work. Keep
  going; stop only at the stop rules in Phase 4, a budget limit, or a real blocker.
- **Name the patterns to avoid.** Vague lines like "avoid generic UI" don't work; named
  ones do. For game UI, unless the art direction asks for them: no cream panels, italic
  accent words, 01/02/03 section labels, monospace text labels, or pill buttons.
- **Keep tool output small.** Script output stays in context for every later turn. The
  scripts here print one summary line and write full reports to disk (`--json` prints the
  full report). Take screenshots at CSS scale, not device pixels (a phone at 390×844, not
  1170×2532), which is about a fifth of the image tokens with nearly identical metrics.
- **Emulate phones on GPU-backed Chromium,** not WebKit, which most installs don't have.

## Steering vocabulary

Simon (@iced_coffee_dev), a graphics programmer, put it this way: AI will handle more and more
of the implementation, but making something "cool" is different from making what you
envisioned, and the language to describe what you want is game-dev vocabulary. The cookbook
is that vocabulary; use it in briefs and critiques, and when the user describes an effect in
plain words, name the technique back to them so you're both steering toward the same thing.

When you (or the user) give feedback, be as specific as the best builders were. Name the
physical phenomenon and the fix, not "make it better": "aerial perspective is blue, never
white", "shadows at 15–20% of lit brightness, never crushed", "backlit leaves glow", "foam spawns
where the wave Jacobian compresses and decays over seconds", "LODs fade with a Bayer dither,
never pop". The cookbook lists these per subsystem. Also ask the model the question Dan
Greenheck used to break plateaus: *"What special polish would push this from okay to WOW —
what effects do AAA games and films use here?"* — then pick the ones that fit the budget.

Bug reports work best with a symptom, a hypothesis and where to look: "inspecting the lamp
turns the screen black — probably an emissive value blown up by bloom; check how inspected
objects are cloned". When you're the one debugging, write the hypothesis down before
changing code, and confirm it with a playtest or screenshot afterwards.

## Honest limits to tell the user

- Budget: these runs cost real usage. Data points: Ryan Sael's one-shot explainers $26–39
  API-equivalent in 1.5–2 h each (on a subscription, `/usage` after a run shows the
  API-equivalent cost); Danny Limanseta's day-long game with his kids ~30% of a weekly limit;
  the Far Cry lagoon 8 h and 58% of the $20 plan's weekly quota; Meng To's valley ~$10–15; Andrei Provkin's world 3.6 h ≈ $60 API; Dan Greenheck's Tidewater ≈ $1,874 API-equivalent (59% of his weekly usage on the $200 plan)
  over ~8 h; one survival island ran ~50 subagents for 12 h before usage ran out.
  Agree a budget (rounds, hours or % of plan) before the loop.
- Characters/animals, realistic music and foley are the weakest procedural areas; hybrid
  assets (image-gen → image-to-3D, CC0 sound) help most there.
- "Fun" is not measurable by the critic. Playtesting decisions stay with the user.
- For interactive explainers and lessons (lens optics, datacenters, anatomy), a beautiful
  scene can still teach something wrong, and people trust what looks good. Add a
  "Correctness" row to the scorecard, have the critic check the physics or facts against
  sources, list any simplifications on the page, and recommend that a domain expert review it
  before it's shared widely.
