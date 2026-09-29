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

## Known open issues (check before relying on them)

- **A ~3s video freeze about once every 3 minutes** when a packet truly can't be recovered.
  The Chromecast waits too long for a replacement keyframe; the suspect is the Cloudflare SFU
  holding back PLI requests. Choppiness was otherwise fixed by the shader prewarm plus
  720p/4 Mbps plus a 200 ms playout buffer (measured: server freezes of up to 3.7s dropped to
  ≤0.2s, and Chromecast freezes went from 3 to 1 per 3 minutes).
- The Cast receiver is unpublished: only registered devices (the Chromecast HD) can run it,
  not the LG TV's built-in Cast.
