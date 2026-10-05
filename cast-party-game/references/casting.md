# OGS casting: deploy, debug, measure

## How a game reaches the TV (Oct 2026)

The phone casts **once** per evening; games never cast. The game-side contract is
`~/src/open-game-system/docs/specification.md`; this page is the pipeline behind it.

1. The OGS app (TV tab, or Play → Cast) launches the Cast receiver (app 807AD5E9) and sends
   `LOAD_VIEW` on `urn:x-cast:org.opengame.view` with the **launcher URL**
   (`<tvBase>/?api=…&token=<launcher token>`, `launcherUrl` in `apps/mobile/services/config.ts`), never a
   game URL, plus `streamServerUrl`.
2. The receiver asks that stream server to render the launcher; a cloud GPU Chrome tab-captures it →
   Cloudflare Realtime SFU → WebRTC → the Chromecast.
3. Starting a game is `game.start` on the couch session (phone or TV remote). The game's phone page
   declares its TV page (`useCastViewUrl`), the app forwards it as `game.view`, and the launcher frames
   it. Swaps and Home park the frame (`ogs:suspend`); no recast.

**Stream path today: the PR-5 preview Worker.** Until streaming moves onto the production API
(roadmap "One API for streaming too"), build the app with
`EXPO_PUBLIC_OGS_STREAM=https://opengame-api-pr-5.jonathanrmumm.workers.dev/api/v1/stream`. That Worker
has `STREAM_SERVER_URL` → Cloud Run `stream-gpu` and the TURN secrets. Unset, the app names
`<EXPO_PUBLIC_OGS_API>/api/v1/stream` (`streamServerUrl` in `apps/mobile/services/cast-view.ts`); the
production API had no TURN on 2026-10-04, and the GPU publisher reaches the SFU only through TURN.
Check with `pnpm stream:ready <api-url>` (in `services/api`; it starts no GPU unless `--probe-renderer`) before casting through a new API.

## Pieces and where they live

| Piece | Location | Deploy |
|---|---|---|
| Game (TV + phones) | its own repo, Cloudflare Worker | `pnpm build:client && pnpm run deploy` (never `pnpm deploy`) |
| Catalogue entry + art kit | `open-game-system/services/api/src/catalogue.ts`, art in `apps/tv/public/art/<appId>/` | API and launcher deploys (see `/ogs-game`) |
| TV launcher | `open-game-system/apps/tv` (Pages project `ogs-tv`) | `pnpm --filter @open-game-system/tv run deploy` |
| OGS app (sender) | `open-game-system/apps/mobile` (Expo) | Release build to a device: `xcodebuild -workspace ios/opengameapp.xcworkspace -scheme opengameapp -configuration Release -destination id=<udid> -derivedDataPath build-device -allowProvisioningUpdates DEVELOPMENT_TEAM=<apple-team-id> CODE_SIGN_STYLE=Automatic build`, then `xcrun devicectl device install app --device <id> build-device/Build/Products/Release-iphoneos/opengameapp.app` |
| Cast receiver | `open-game-system/apps/web/public/receiver.html` → opengame.org/receiver.html | `pnpm build && npx wrangler pages deploy dist --project-name=opengame-org --branch=main` (diff against the live deployment first: `docs/lessons.md`) |
| Stream API | `services/api` (worker `opengame-api-pr-5`) | preview wrangler config; the `STREAM_SERVER_URL` secret points to Cloud Run |
| Stream server (GPU Chrome) | `services/api/container` | `gcloud builds submit --project=opengame-stream --region=us-central1 --tag us-central1-docker.pkg.dev/opengame-stream/stream/stream-server:<tag> .`, then `gcloud run deploy stream-gpu --project=opengame-stream --region=us-east4 --image=…` |

Cloud Run service: `stream-gpu`, us-east4, 1× NVIDIA L4, 8 vCPU / 32 GiB,
`--no-cpu-throttling`, max-instances 1, env `STREAM_GPU=egl`. It costs about $1/hr while up and
scales to zero when idle; a cold start takes about 20–40s to first video. Always pass
`--project opengame-stream` and never change the default gcloud project.

## Cost (it's a GPU; keep it scaling to zero)

- Min instances 0, **max 1**, and the CPU is always allocated (required for GPUs on Cloud Run).
  The whole instance lifetime is billed, about $1.40/hr at 8 vCPU / 32 GiB / L4. That's $0 when
  nobody casts; it stops ~15 min after the last request.
- **Heartbeat**: while streaming, the receiver `POST`s `/api/v1/stream/heartbeat` every 60s,
  and the API pings the stream server. The video flows to the SFU, not through the server, so
  without the heartbeat a long game looks idle and Cloud Run may stop it mid-game. When casting
  stops, the pings stop, and it scales down.
- A $20/month budget alert on the billing account, filtered to `opengame-stream`.
- The Artifact Registry `stream` repo has a cleanup policy that keeps the 3 newest images.
- Idle stop: the renderer reads `window.__ogsActivityAt` on the page it streams, which for an OGS
  cast is the launcher (games are cross-origin frames). The launcher keeps it fresh while a phone is
  on the couch (`apps/tv/src/session/activity.ts`).

## Hard-won settings

- `STREAM_GPU=egl`, not vulkan: both render at 60 fps, but Vulkan tab capture only delivers ~14 fps.
- Puppeteer adds `--mute-audio` by default, which makes the captured tab silent. The server
  sets `ignoreDefaultArgs: ["--mute-audio"]`.
- The sender marks the video track `contentHint = "motion"`, with `degradationPreference:
  maintain-framerate`. Without the hint, Chrome treats tab capture as slides and drops to ~12 fps.
- **720p at 4 Mbps, not 1080p at 8 Mbps.** On home Wi-Fi, one lost packet at 1080p froze the
  picture while a huge keyframe was resent, and encoding took ~21 ms of every 33 ms frame.
  At 720p it's ~8 ms per frame. It's slightly softer on a 77" TV; 900p is the next thing to try
  if that matters.
- **Receiver playout buffer: `receiver.playoutDelayHint = 0.2`.** The Chromecast runs Chrome 92,
  which has `playoutDelayHint` but not `jitterBufferTarget`. It lets lost packets be resent in
  time (hiccups went from 3 to 1 per 3 minutes). An earlier A/B wrongly said the buffer made
  things worse, because the shader stalls were still present. Remove confounds before A/B tests.
- The receiver's `<video>` starts muted (autoplay), then unmutes after `play()`.
- Handshake: the receiver sends `REQUEST_VIEW` when ready, on sender connect and every 1.5s;
  the app answers with `LOAD_VIEW`. A cold-started receiver misses a one-shot send.

## Debugging

- `GET <stream-server>/gpu-info[?url=<page>]`: the WebGL renderer (should say NVIDIA L4), the
  page's rAF fps, and whether Web Audio runs.
- `GET <stream-server>/debug-state`: the active page URL, targets, the extension event log,
  and `streamingDebug.videoStats` (capture fps, send fps, `limitedBy`, encoder, bitrate).
- The receiver mirrors console and status to senders as `LOG` / `STATUS` messages on the view
  namespace, and answers `GET_STATE` with its real state: started, viewUrl, overlayVisible,
  video size, playing, and decoded frames/fps. Use this before theorizing about "no video".
- App cast state comes only from `cast-sync.ts` (mirrors Google Cast's SessionManager). If the
  app and the TV disagree, that module is where the bug is.
- The game's TV with `?debug=1` shows a WebSocket trace panel.
- Drive the Chromecast from the CLI with pychromecast in a venv (never the conda base):
  launch app 807AD5E9 and answer `REQUEST_VIEW` with `LOAD_VIEW`.
- `wrangler tail opengame-api-pr-5` for API trace logs.

## App cast state lessons (from real living-room testing)

- **The app's cast state mirrors the real Google Cast session, never its own guesses**
  (`apps/mobile/services/cast-sync.ts`, tested with a fake SessionManager): it picks up an existing
  session on reopen, follows the session events, stops with `endCurrentSession(true)` (which also
  stops the receiver app), and never re-stops a session that ended on its own. If the app and the TV
  disagree, the bug is there.
- **Name the cast after `session.getCastDevice()`**, not the first discovered device.
- **"Sound but no video" was an overlay**: a late status update re-showed "Connecting…" over a
  playing stream. Once connected, status never shows the overlay; the video's `playing` event hides
  it; `stream-check` fails if the overlay covers the video.

## Finding choppiness (the method that worked)

1. Measure **both ends at once** during a real mission, every 10 seconds, for about 3 minutes:
   - Server: `/debug-state`, with page render stalls tagged by game phase, keyframes, PLI,
     NACK, encode ms, RTT and kbps.
   - Chromecast: the receiver's `GET_STATE` via a pychromecast probe (decoded and dropped
     frames, fps, loss, PLI).
2. Isolate: a lobby-only run showed no stalls, which proved the freezes came from gameplay and
   not the server.
3. Then find what's new on screen when a stall happens: shader program counts showed lazy compiles.
4. Fix one cause, then re-run the A/B for the next.

Local dev gotcha: `SQLITE_BUSY` / "database is locked" at `wrangler dev` start means a stale
`workerd` from an earlier run of **this** project still holds the DO database. Kill only that
one; other projects' workerd processes are fine.

## Measuring (do this after any pipeline change)

`pnpm exec tsx scripts/stream-check.ts <path/to/receiver.html> <out.png>`: it hosts a room,
streams its TV through the real API and stream server into the local receiver page, then
prints 4 windows of `received: N fps @ WxH` and `audio: {muted, audioBytes, audioEnergy}`.
Target: 30 fps at 1920×1080 after ramp-up (it starts at 640×360 while bandwidth estimation
climbs), with audioEnergy > 0.
