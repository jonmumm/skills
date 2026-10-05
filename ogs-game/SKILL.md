---
name: ogs-game
description: >
  Make a web game OGS-compatible, new or existing (Rocket Crew, Night Flight, Trivia Jam…): the
  catalogue entry and art kit, the TV page framed by the OGS TV launcher (ogs:start, ogs:suspend /
  ogs:resume, sitting labels), the phone page in the OGS app's WebView (OGS name and avatar, no
  name form), server-side token verification, the profile-kit tarball, the parked-audio gate and the
  seam tests. Use when adding a game to OGS, "put this game in the OGS app", "make it work on the OGS
  TV", "use the OGS profile", or when a game still has its own cast button.
dependsOn:
  - jonmumm/skills@tdd
  - jonmumm/skills@seam-tester
  - jonmumm/skills@ai-art-assets
---

# Make a game OGS-compatible

**The contract is `~/src/open-game-system/docs/specification.md` ("The OGS game contract"). Read it
first; this skill is the checklist, not a copy.** If the two disagree, the schemas in
`packages/ogs-protocol/src/` win, then the spec, then this file: fix whichever is stale.

The model: the phone casts **once**; the TV launcher (`apps/tv`) frames every game's TV page in one
stream; people join the couch with the **TV code**. A game never casts.

Reference games: `~/src/rocket-crew` (token verified on its server, name form skipped) and
`~/src/night-flight-owls` (parked-audio gate). Copy from them.

## Checklist

Work test-first (`/tdd`); commit at each green step.

1. **Vendor profile-kit** (not on npm; it bundles ogs-protocol and app-bridge-web):
   ```bash
   cd ~/src/open-game-system
   pnpm --filter @open-game-system/profile-kit build
   cd packages/profile-kit && pnpm pack --pack-destination ~/src/<game>/vendor
   ```
   In the game's `package.json`:
   `"@open-game-system/profile-kit": "file:vendor/open-game-system-profile-kit-0.1.0.tgz"`, then
   `pnpm install`. Re-vendoring a fixed build keeps the file name: use `pnpm install --force` (new
   integrity). Room games also vendor `cast-kit-core` and `cast-kit-react` the same way (step 4).
2. **TV page (spec §2):**
   - `onOgsPause(setPaused)` at module load of the TV entry. Parked means silent: suspend the
     `AudioContext`, pause media, and on resume restart only what was playing. Copy
     `night-flight-owls/src/client/audio-pause.ts` (`createAudioPause`): it also keeps a sound
     unlocked while parked silent until Continue.
   - Want the couch's names on the TV? `useOgsSession()` (`profile-kit/react`) gives
     `{ players, token, instanceId, mode }`, `null` when not on an OGS TV.
   - Report the sitting label: `reportOgsSitting({ instanceId, appId, status, title: "Mission 6" })`
     whenever it changes. Same call on the phone (goes over the app bridge).
   - On an OGS TV: no cast button, no room code, no join QR; nothing over the focal area.
   - The page must allow being framed by the launcher and autoplay without a tap.
3. **Phone page (spec §3):** `useOgsProfile()`: `undefined` → wait, `null` → the game's own name form,
   a profile → join under its `name`/`avatar` and send its `token` to the server. Nothing else changes in
   a plain browser.
4. **Room games' TV URL:** the host phone page calls ``useCastViewUrl(`${tvUrl}&stream=1`)`` inside a
   `CastProvider` when `isOGSCastAvailable()` (see `rocket-crew/src/client/components/HostPanel.tsx`).
   No `<CastButton>`: the OGS app forwards the URL as `game.view` and ignores the game's cast actions.
   A game with one static TV page sets `tvUrl` in its manifest instead.
5. **Server (spec §4):** `verifyOgsToken(token, { appId, jwksUrl })` from
   `@open-game-system/profile-kit/server` before trusting a name or seat; `null` → the guest path. Make
   `jwksUrl` a Worker var (`OGS_JWKS_URL` in `rocket-crew/wrangler.toml`, read in `src/room.server.ts`) so
   seam tests can serve a local key set; point it at the deployed API's `/.well-known/jwks.json`, since
   profile-kit's built-in default (`api.opengame.org`) was unverified on 2026-10-04.
6. **Seam tests** (`/seam-tester`): frame the TV page from a tiny parent page and post the launcher
   messages. Start from `night-flight-owls/e2e/ogs-pause.seam.test.ts` (asserts every `AudioContext` is
   `suspended` after `ogs:suspend` and `running` after `ogs:resume`); add `ogs:start` and the
   `ogs:instance` you post back. Phone side: `rocket-crew/e2e/ogs-bridge.seam.test.ts` (fake WebView
   bridge, local JWKS).
7. **Art kit** via `/ai-art-assets` (Codex `codex.mjs` first, `--dry` first, the project's
   `.asset-budget.json` caps): `icon` 1:1, `cover` 2:3 with the title, transparent `logo`, `heroClean`
   16:9 with no text or HUD. Files go in `~/src/open-game-system/apps/tv/public/art/<appId>/`. The game's
   own art direction; no faces on objects. Add the game to `KIT-SHEET.jpg` and look at it.
8. **Catalogue entry, test first** in `~/src/open-game-system`:
   - Red: add the appId to `services/api/test/catalogue.test.ts` (the ordered list, plus any case the
     new game differs on, e.g. a static `tvUrl`). Say in the commit that the expected list grew.
   - Green: add its manifest to `SEED` in `services/api/src/catalogue.ts` (the art-kit test checks
     every file exists).
   - `pnpm --filter @open-game-system/api test`, then the repo's `pnpm typecheck && pnpm lint && pnpm test`.
   - Never add games to `apps/mobile/services/game-directory.ts` (old static list).
9. **Deploy** (ask the owner first): `pnpm run deploy` in the game repo, never `pnpm deploy` (that is
   pnpm's own workspace command). `git status` first: deploy ships the working tree. The OGS API and
   launcher deploy separately (`docs/lessons.md` in open-game-system).

## Existing game with its own cast (e.g. Trivia Jam)

Remove the `<CastButton>`, its cast picker and any "cast to TV" copy; keep only step 4's
`useCastViewUrl`. Hide room code and join UI when framed on an OGS TV, keep them in a plain browser.
Then go through the checklist.

## Done when

- Seam tests above pass; the game still plays end to end in a plain browser.
- In the OGS app: no name form, the TV shows the couch's names, Home silences the TV, Continue brings
  it back with sound, Playing shows the sitting label.
- Say which it is: committed / deployed / verified on a real device.
