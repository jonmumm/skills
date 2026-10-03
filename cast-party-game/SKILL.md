---
name: cast-party-game
description: >
  Build a new family "cast party game" in a day: a shared TV screen cast from the grown-up's
  phone through the OpenGame (OGS) app, plus a grown-up phone and a kid's iPhone/iPad as
  controllers. Covers the one-page spec, the room architecture (Cloudflare Worker + one Durable
  Object per room with actor-kit), OGS casting and the GPU stream server, iOS/iPadOS device
  gotchas, juice, testing and the gameplay-video recorder. Use when starting a new game in this
  format ("new game for me and my son", "make a game like Rocket Crew", "cast party game",
  "TV + phones game"), or when adding a game to the OGS directory.
dependsOn:
  - jonmumm/skills@grill-me
  - jonmumm/skills@tdd
  - jonmumm/skills@seam-tester
---

# Cast Party Game

One shared TV, one grown-up phone, one (or more) kid devices, a game a day. The reference
implementation is **Rocket Crew** (`~/src/rocket-crew`,
github.com/open-game-system/rocket-crew). Copy its skeleton; don't re-derive it.

## The format

| Screen | Who | What it shows | Rule |
|---|---|---|---|
| TV | everyone | The shared world: big, animated, 3D, music | Nobody touches it. It's cast from the host phone and rendered in the cloud |
| Host phone | grown-up | Words: what to say, coaching, Hint/Pause/Next | Reads aloud. It also hosts the room and starts the cast |
| Kid device | child (iPhone/iPad) | **No words**: colors, pictures, sounds, buzzes | Every press gets instant feedback on this device |

The magic is **talking**: the game makes the grown-up and the kid talk to each other.
Asymmetric information (the phone knows what, the kid has the buttons) creates the need.

## Day plan (small steps, run it after each one)

1. **Spec (≤1 page)** in `docs/<game>-spec.md`, in the same shape as `rocket-crew/docs/rocket-crew-spec.md`:
   the roles table, a numbered flow, a screen list per device, and an events table
   (`EVENT | who sends it | payload`). Run `/grill-me` on it. **Ask before adding anything
   not in the spec.**
2. **Room machine + tests first**: an XState v5 machine with `SimulatedClock` in tests and
   per-role views. Get a whole round passing in unit tests before any UI.
3. **Wire + screens**: `/tv/:room`, `/join/:code` and `/host`, plus a seam test that plays a
   full round over real WebSockets.
4. **Playable end-to-end** on `wrangler dev` with a laptop TV plus two phones on the LAN.
5. **Juice pass**: sound, haptics, particles, transitions (see below).
6. **Record the gameplay video** (a 3-panel TV | phone | kid view with TV audio) and look at it.
   For something to share with the family, cut a **trailer**: see `references/trailer.md`.
7. **Deploy** (`wrangler deploy`), add the game to the OGS game directory, and cast from the
   app to verify.

## Architecture (copy from rocket-crew)

- **Worker** (`src/worker.ts`):
  - `/` redirects to a new room.
  - `/tv/:room` and `/join/:code` serve boot HTML with injected boot JSON (parsed with Zod on the client).
  - `/host` creates a room plus a TV token and redirects the host to join.
  - `/api/*` goes to `createActorKitRouter`.
- **Room** = one Durable Object per room via actor-kit `createMachineServer`
  (`room.machine.ts`, `room.schemas.ts`, `room.types.ts`, `room.server.ts`, `room.context.tsx`).
  - Context is split into `public` (everyone), `private[callerId]` (per role) and a
    server-only `server` key.
  - **Re-project every role's view after every mutation**: the `update()` + `withViews`
    pattern in `game/views.ts`. Views are pure functions of server state, so they're easy to test.
  - Roles: the first joiner becomes host/captain and the second the kid; the TV holds a token.
    A refresh rejoins its role from the URL token.
- **Game logic** lives in pure modules under `src/game/*` (problems, generator, scoring, ranks,
  album…), with unit tests beside them.
- **Client**: esbuild bundles (`tv.tsx`, `join.tsx`). A `PhoneScreen` routes by role to the
  host or kid screen.
- **actor-kit 0.52.6 needs the close-code patch** (`patches/actor-kit@0.52.6.patch`) until it's
  fixed upstream; otherwise a phone dropping without a close frame crashes `wrangler dev` and
  leaks subscriptions.

## OGS casting (how the TV gets onto the real TV)

- The game declares its TV page: `useCastViewUrl(`${tvUrl}&stream=1`)` in the host panel
  (cast-kit-react ≥0.2.0), plus a `<CastButton>`.
- Inside the OGS app (`isOGSCastAvailable()`), the start page redirects to `/host`: the phone
  is the host, not the TV. A phone/tablet browser (coarse pointer) gets a start chooser; a
  laptop gets the TV with a "Start the TV — sound & full screen" gate.
- The pipeline:
  1. The app launches the Cast receiver (app 807AD5E9) and sends `LOAD_VIEW {viewUrl}` on
     `urn:x-cast:org.opengame.view`.
  2. The receiver calls the API `start-stream`.
  3. **Cloud Run L4 GPU Chrome** renders the TV page.
  4. Tab capture → Cloudflare Realtime SFU → WebRTC → the Chromecast.
- **Design the TV for the stream**:
  - 1920×1080 at 30 fps.
  - Nobody can click it: when `?stream` is set, start audio and music on mount (autoplay is
    allowed there).
  - Keep progress on the host phone, not in the streamed TV's localStorage.
  - Use a lite render mode **only** when the WebGL renderer is software (`scene/gpu.ts`); the
    L4 renders full quality at 60 fps.
  - **Compile every shader in the lobby.** three.js compiles a material's shader the first
    time it's drawn, so hidden things (UFO, shield, effects, a new planet) compiled mid-game.
    That froze the cloud TV page for up to 3.7s, and the Chromecast then dropped seconds of
    video. Prewarm at startup:
    - make everything visible and compile;
    - compile **against the EffectComposer's render target**, because it uses different
      shader variants than the screen (compiling to screen still left 5 compiles mid-game);
    - changing the number of lights also recompiles every material, so keep the light count fixed.

    Verify that `renderer.info.programs` doesn't grow during play (expose it under `?debug=1`).
- Details, commands and debugging are in [references/casting.md](references/casting.md).

## Device rules (learned the hard way; see [references/ios-gotchas.md](references/ios-gotchas.md))

- **Motion/shake**: request `DeviceMotionEvent.requestPermission()` on a **completed tap**
  (click/touchend), never on pointerdown. Prime it on the page's first tap. A throw means the
  request is retryable; only "denied" falls back to tap-to-shake. Tell the player which mode
  they're in.
- **Sound**: iPhones mute Web Audio when on silent. Set `navigator.audioSession.type = "playback"`
  before creating the AudioContext, and unlock it from a user gesture.
- **Circles and sizes**: iPadOS 15 Safari stretches `aspect-ratio` boxes that contain content
  and drops `%` heights inside flex. Give round buttons an explicit `width` and `height` (a
  `--size` variable) and size icons from it, never `%`.
- **WebGL**: phones cap WebGL contexts, so share one renderer that blits into 2D canvases. Ship
  PNG fallbacks for no-WebGL (`pnpm icons`).
- **Haptics**: `navigator.vibrate` doesn't exist on iOS, so sound plus visuals must carry the feedback alone.
- **LAN dev over HTTPS** (motion and wake lock need it): mkcert, with keys git-ignored.

## Game design lessons from Rocket Crew

- **Every press needs visible feedback on the presser's device *and* where it lands.**
  Rocket Crew's Hint originally only flashed the kid's control for 1.8s, and the grown-up had
  no idea it did anything. Fixed version:
  - The grown-up sees what's lit ("Lighting up the blue moon…") and a glowing "Again" button.
  - The kid's control keeps pulsing until it's pressed, and the rest of the panel dims.
- **Wrong presses teach**: wobble on the TV, "Oops — that was the red star. Say it again!"
  on the grown-up's phone.
- **Stakes without language**: stars visibly at stake on the TV, stars flying into a jar.
  Show, don't label.
- **Start easy, get harder**: crew ranks unlock controls one to two missions at a time; locked
  controls show a lock (explain this in the spec or it reads as a bug).
- **Reasons to play again**: an album of collectibles (deterministic from an id: nothing to
  store), destinations, rare "shiny" finds, cosmetic unlocks (rocket paint), random events,
  and a safety net (ease off after failures).
- **Timers need a rescue**: when power runs out, a MAYDAY moment where everyone shakes
  together, instead of losing.
- **Hand-drawn, no emoji**: procedural 3D models through an ink shader read as "made for you".
- **Don't script corrections in advance.** "Press the purple one, not the yellow one" felt
  pointless to the parent reading it aloud: naming the decoy only helps *after* a real mistake,
  which the oops line covers. Make a problem harder by naming two traits ("Flip the purple
  octopus switch!") and only generating it when a look-alike is on the panel.
- **A new kind of problem must look new on every screen, the first time.** The "tell me which
  color is blinking" problem was missed in playtest: an on/off flicker on the kid's panel read
  as "press me", and the TV showed nothing special. The fix works without words:
  - the target glows steadily in its own color and wears a "say it" speech bubble of that color;
  - the rest of the panel dims, and the control's character speaks once;
  - the TV shows a "say the color!" banner whose bubble is a neutral "?". The TV must never
    show the answer color, or the kid reads it off the TV instead of their own panel.
- **Playtest with the real family early.** Every item above came from one evening of living-room
  play, not from tests or recordings.

## Juice checklist

- Generative music (pentatonic, so SFX always harmonize) with moods per phase.
- A synthesized SFX per control, like a little instrument: success fanfare, fail wobble, and a
  distinct hint twinkle.
- Particles, a warp tunnel, bloom and a camera shake on the TV; ripples and haptics on the phones.
- A countdown, then the big moment (liftoff), then landing held **together** (both hold a button).

### Voice, music and sound effects with ElevenLabs

Jon has ElevenLabs API access; the key is in the `ELEVENLABS_API_KEY` environment variable.
- Generate audio at build time with `../procedural-3d-web-game/scripts/elevenlabs.mjs`
  (`check`, `sfx`, `music`, `tts`, `voices`) and commit the resulting files. Never call
  ElevenLabs from the TV page or the phones, and never put the key in a bundle, commit, log or
  chat. If a game truly needs runtime speech (say, reading player names), call it from the
  Worker with the key stored as a Worker secret (`wrangler secret put ELEVENLABS_API_KEY`), and
  cache the results.
- Best uses in this format: a narrator voice on the TV for kids who can't read (whose turn it
  is, clues, cheers), short stingers (win, unlock, rescue), and music loops per phase. Keep the
  synthesized pentatonic instrument for per-press sounds, so they always harmonize and stay
  instant.
- Each generation costs credits: don't regenerate existing files without a reason, and record
  every generated file in the game's credits (the script writes `assets/audio/CREDITS.json`).
  The script also enforces the project's `elevenlabs_credits` cap and logs each call's real cost.
- Music is the costly kind: 30–60 s mood loops crossfaded in code, not 120 s tracks, and not a
  second "variation" before the first one has been heard in the game. Draft trailer VO with
  `say`; generate the ElevenLabs take once the script is locked.
- Runtime speech from the Worker scales with plays: cache every line in R2 by voice + text, and
  pre-generate the fixed lines at build time.
- If the variable isn't set in the session's shell, say so and fall back to synthesis rather
  than asking for the key.

## Testing and verification

- Unit tests on the machine with `SimulatedClock`; pure game modules tested beside them.
- A seam test that flies a whole mission over the wire with three clients, including a
  refresh mid-mission.
- **Recorder** (`e2e/record-mission.ts`, `pnpm record`): Playwright TV + iPhone + iPad
  contexts, with the TV's Web Audio captured, stitched by ffmpeg into one video.
  - Fake phones must emit **resting** `devicemotion` readings continuously, like real devices.
  - Look at the frames (ffmpeg tile sheets) before claiming a UI change works.
- `scripts/stream-check.ts`: streams the deployed TV through the real pipeline into the
  receiver page and prints received fps over time **and inbound audio energy** (≈0 = silent).
- CRAP < 8 and mutation testing per the global engineering rules.
- **Random mission order makes tests flaky.** A test that acts on "the first problem" of a
  shuffled mission fails whenever that problem ignores its input (ask-the-kid, shake). Move to
  the kind you need first (`advanceTo(room, "single")`).
- **Never overwrite an existing test file when adding tests.** Check with `ls`/`git status`
  first. If a new API replaces an old one, port every behavior the old tests covered.
- **Another Claude session may share the repo.** A `pnpm run deploy` ships the whole working
  tree, including someone else's uncommitted edits. Check `git status` before deploying, and
  coordinate before deploying shared work.

## Casting lessons (from real living-room testing)

- **The app's cast state must mirror the real Google Cast session, never its own guesses.**
  The first version set "casting/stopped" locally. Symptoms:
  - Stop looked stopped but the TV kept going.
  - The native Cast menu still offered "Stop casting".
  - We had to unplug the Chromecast and kill the app to recover.

  The fix is one app-lifetime module (`apps/mobile/services/cast-sync.ts`, tested with a fake
  SessionManager). It:
  - picks up an existing session when the app reopens;
  - follows starting/started/startFailed/suspended/resumed/ended;
  - runs Stop as `endCurrentSession(true)`, which also stops the receiver app on the TV;
  - starts a session on the device that was actually chosen;
  - never re-stops a session that ended on its own.
- **Name the cast after `session.getCastDevice()`**, not the first discovered device (it said
  "LG TV" while casting to the Chromecast).
- **"Sound but no video" was an overlay, not the video.** A fast (warm GPU) stream connected
  before the receiver's setup finished, and a late status update re-showed the "Connecting…"
  overlay on top of a playing 1080p stream. Rules:
  - Once connected, status updates never show the overlay.
  - The video's `playing` event always hides it.
  - `stream-check` fails if the overlay covers the video.
- **Ask the device instead of guessing**: the receiver answers `GET_STATE` (started, view URL,
  overlay visible, video size, playing, decoded frames/fps). A pychromecast probe script reads
  it from the Chromecast during a real cast.

## Conventions from the first six games (Sep 2026)

These games converged on the same setup: Rocket Crew, Night Flight, Story Nook, Bake Shop,
Peekaboo Garden and Juneau's Adventures. Use it from day one. When building several games at
once, run them as a studio (`/game-studio`).

**Kickoff brief (what Jon wants every time)**
- Phases with ⏸ gates: "stop and wait for me".
- A one-line update at each phase end.
- `/grill-me` capped at about 5 questions.
- Record decisions in the spec under "Decisions and assumptions".
- **Budgets** per service in `.asset-budget.json` (`fal_usd`, `meshy_credits`,
  `elevenlabs_credits`), set by Jon at kickoff and enforced by the generator scripts; the tally
  is `assets/SPEND.jsonl` (`spend.mjs budget`). Ask before going over. See `ai-art-assets` →
  "Cost discipline".
- Keys only from env. Kids' photos only in `private/` (gitignored).
- Ask before adding anything not in the spec. Commit at every working milestone (Jon wants
  nothing lost); ask before pushing to a shared remote or deploying to the OGS directory.

**Standard files**
- `docs/<game>-spec.md`, `docs/tv-scene-brief.md` (scene contract plus performance rules),
  `docs/art-style.md` (style guide).
- `SCORECARD.md`, `STATUS.md` (always resumable), `CREDITS.md` / `assets/**/CREDITS.json`.
- Critic evidence in `critic/rounds/NN/`.
- `.claude/skills/` links to `~/src/skills`: cast-party-game, procedural-3d-web-game,
  ai-art-assets, tdd, grill-me, seam-tester.
- `CLAUDE.md` with a skills table. Update it when a rule changes; stale "off-limits" lines
  mislead later sessions.
- One fixed dev port per game, taken from the studio registry, so games can run side by side.

**Plumbing every game needs** (copy it; the skeleton still lacks these)
- `/host`: the OGS app's start phone skips the role picker and goes straight to naming.
- Named kid seats (`NAME_SEAT`) shown on the TV and phones and remembered on the host phone.
  Coaching lines use the kid's name.
- An activity beacon (`window.__ogsActivityAt`), so an abandoned cast shuts the cloud GPU down.
- `?stream=1` lite render for the software-GL stream server, with PNG fallbacks for 3D icons.
- `NeutralToneMapping` (ACES washed out the key colors).
- A shader prewarm in the lobby, and disposing replaced meshes (a GPU leak across games).
- Guard `pow()`/`normalize()` against NaN: bloom smears one NaN into black frames. `shoot` fails
  on any black frame.
- Night Flight's `docs/skeleton-notes.md` lists what else the template should gain:
  - seats as `{id, kind, name}[]`
  - public and private views derived by one function
  - a `rig()` test helper
  - a recorder core plus a per-game `playTurn()`
  - one `config.ts`
  - progress kept on the host phone

**The look that worked**
A 2.5D painted diorama: fal-generated character sheets and poses as cutouts, painted layers and
pop-ups, placed in a lit Three.js scene with depth of field, a grade and paper or felt materials.
It beat both vector clip-art and generated 3D. See `ai-art-assets` → "Art kit pipeline".

**Evidence each round** (the best versions to copy until a shared kit exists)
- Recorder: `story-nook/e2e/record-session.ts`. It drives every device, records a 3-panel video
  with TV audio and marks, and uses `--disable-audio-output` so a hung CoreAudio doesn't make a
  silent take.
- Evidence and audio: `story-nook/scripts/evidence.py` and `scripts/audio-report.py` (loudness,
  spectrogram, luma at each mark, bass and harshness share), `night-flight-owls/scripts/evidence.sh`,
  `bake-shop/scripts/critic-pack.py`.
- Contact and phone sheets: `bake-shop/e2e/contact-sheet.ts` and `e2e/phones-sheet.ts`.
- Stream: `scripts/stream-check.ts` (fps, audio energy, overlay, startup timeline).
- Trailer: `rocket-crew/scripts/trailer/` (cut points from marks, the game engine renders the
  score, a voiceover, cards) and `night-flight-owls/scripts/trailer.py` (clean audio layers).
- Check the rig before trusting a critic. See `procedural-3d-web-game/references/critic-loop.md`
  §5.

## Lessons from Peekaboo Garden (Sep 2026)

- **A restarted Durable Object loses its XState timers.** A deploy, an eviction, or in `wrangler dev`
  every file save restores the room from storage, but pending `after`/`raise({delay})` timers are gone,
  so the room freezes mid-phase. actor-kit sends a system `RESUME` event after restoring: handle it in
  every timed state (move on, or re-arm the heartbeat). Test it with a helper that persists the
  snapshot, creates a fresh actor from it, and sends `RESUME`. Don't name a client event `RESUME`
  either (a pause button did): the restore handler caught it. Guard on `event.caller.type === "system"`.
- **The found moment must keep continuity.** Same camera angle, ease toward the spot under the lens,
  the critter pops out of its own cover, and the lens turns into the spotlight. A cut to a new angle
  read as "the one revealed isn't the one the glass was over".
- **No identical duplicates in a search round.** Two copies of the same critter confuse a 5-year-old.
  The only allowed twin is the one a position word ("in the flowers") tells apart.
- **One panel per player** in the recorder (TV | grown-up | kid iPad | little-kid iPad). An inset
  hides the little kid's part. `pnpm record --stitch` rebuilds the video from the raw footage.
- **Two wrangler dev servers (HTTP for seam tests, HTTPS for devices) need separate
  `--persist-to` dirs**, or they lock each other's Durable Object SQLite.
- **Stryker's vitest runner never activates mutants under vitest 5** (every mutant "survives"). Use
  the command runner: it sets `__STRYKER_ACTIVE_MUTANT__`, which instrumented code reads. Check with
  one mutant activated by hand. TypeScript 7 has no JS API, so point `tsconfigFile` at a missing file.
- **Clue words must be true to what the kid sees**: color first in rounds 1-2, and treat features a
  child could confuse (a fox's pointy ears vs "long ears") as matches when choosing decoys.

## The toddler seat (from Rocket Crew, Oct 2026)

A younger sibling will walk over and tap the big kid's iPad mid-mission, and the big kid melts
down. Give every family game an optional **toddler seat** from day one:
- The third phone to join gets it. Launch never waits for it; the game works the same without it.
- Her own device: 4 giant wordless toys (2×2 grid, ~42vmin circles), each a delightful TV moment
  tied to the theme (Rocket Crew: honk-and-hop, shooting stars, engine puff, rainbow sparkle).
- **Nothing she does touches the mission.** Server: a single `TOY` event guarded `fromLookout`,
  stored as `{toy, seq}` in public state; every mission event (press, hint, launch, land, replay,
  pause, shake) stays guarded to the two real seats. Test it: a burst of toys leaves every mission
  field equal (`missionState(before) === missionState(after)`).
- TV gate: at most one toy per ~0.5 s, and toys that would fight a staged moment (arrival, mayday)
  degrade to a sparkle. Effects stay small and off the focal area and the kid's dock.
- Lobby: a compact dashed "3 · Little one · optional" seat that lights up when she's aboard.
- An end-to-end script (`scripts/lookout-check.mts`) joins three devices, taps every toy, spams 20
  taps and asserts the Captain's line didn't change.

## Known open issues (check before relying on them)

- **A ~3s video freeze about once every 3 minutes** when a packet truly can't be recovered.
  The Chromecast waits too long for a replacement keyframe; the suspect is the Cloudflare SFU
  holding back PLI requests. Choppiness was otherwise fixed by the shader prewarm plus
  720p/4 Mbps plus a 200 ms playout buffer (measured: server freezes of up to 3.7s dropped to
  ≤0.2s, and Chromecast freezes went from 3 to 1 per 3 minutes).
- **Receiver publish state and TV Cast support change: check, don't recall.** As of 2026-09-29 the
  OGS receiver (app 807AD5E9) is **Published**, so any Cast device can launch it, and the LG OLED
  **has Google Cast built in**. An earlier note here said the opposite and an agent repeated it to
  the user twice. If a TV is missing from the picker, it is usually its `_googlecast._tcp` mDNS
  record: `dns-sd -B _googlecast._tcp`, `curl http://<tv>:8008/setup/eureka_info`; power-cycle
  the TV. Quote the probe's output before saying what a device can or can't do.
