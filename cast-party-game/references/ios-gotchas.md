# iOS / iPadOS gotchas (kid devices are often old iPads)

Test on the oldest device in the house. The kid's iPad Air 4 is stuck on iPadOS 15, and most
of these only showed up there.

| Symptom | Cause | Fix |
|---|---|---|
| Shake never detected; no permission prompt ever appeared | `DeviceMotionEvent.requestPermission()` called from `pointerdown`. iOS only grants it from a completed tap and rejects silently otherwise | Call it from `click`/`touchend`, and prime it on the page's first tap. See `rocket-crew/src/client/motion-gate.ts` |
| Shake permanently in "tap fast" mode | A rejected request (no qualifying tap) was treated as "no sensor" | A throw means retryable; only a `"denied"` answer means unavailable |
| No sound on the iPhone, sound on the iPad | The silent switch mutes Web Audio (iPads have no switch) | `navigator.audioSession.type = "playback"` before `new AudioContext()` (iOS 16.4+) |
| Round button is an oval | iPadOS 15 lets content stretch an `aspect-ratio: 1` box | Explicit `width` **and** `height`, plus `flex: none` |
| Icon missing inside a button | `%` height inside a flex button doesn't resolve on iPadOS 15 | Size the icon from a CSS variable (`calc(var(--size) * .55)`); prefer `display: grid; place-items: center` |
| Only some 3D icons render | Mobile Safari caps live WebGL contexts | One shared WebGL renderer that blits into 2D canvases |
| Blank icons in the cloud stream | No GPU → no WebGL | PNG fallbacks (`pnpm icons`) and the SwiftShader flag; the GPU stream server fixes it properly |
| No vibration | `navigator.vibrate` doesn't exist on iOS | Always pair haptics with a sound and a visual |
| Motion and wake lock missing on LAN dev | Both need a secure context | Serve dev over HTTPS with mkcert (git-ignore `*.pem`) |

## Inside the OGS app (WKWebView)

- The app injects the bridge; `isOGSCastAvailable()` is true there, so host rather than show the TV.
- The app's edge swipe-back slides the whole WebView. A drag taken over by another gesture must
  settle back (`onPanResponderTerminate`), or the game stays shifted and clipped on the right.

## Old iPads run Safari 15 (Oct 2026, Rocket Crew)

Hand-me-down iPads (e.g. iPad Air 2, stuck on iOS 15.8) run Safari 15. Things that silently break there:
- **Container query units (`cqh`, `cqw`) and `container-type`** need Safari 16. A `transform` using `cqh`
  is dropped entirely, so a lever knob lost its centring. Use `%` of the parent (`top: 50%` +
  `translate(-50%, -50%)`).
- **`color-mix()`** needs Safari 16.2. Declarations containing `var()` + `color-mix()` become invalid
  at computed time (no fallback kicks in). Add `@supports not (color: color-mix(in srgb, red, blue))`
  overrides using layered gradients (`linear-gradient(#000a, #000a), var(--c)`) and plain shadows.
- **Shaking a heavy iPad** rarely passes a phone-sized threshold (12 m/s²); use ~7 for tablets.
- **Fullscreen**: `requestFullscreen` works on iPad Safari, never on iPhone Safari (video only).
  Don't show a full-screen button on iPhones at all (Rocket Crew `kidLock.ts`).

## Shake games and full screen on iPad (Oct 2026, Rocket Crew)

Playwright has no iOS status bar, safe area, shake-to-undo or full-screen warning, so none of
these show up in `ui-matrix` runs. Each one was found by the user on the real iPad.

| Symptom | Cause | Fix |
|---|---|---|
| "Undo Typing" popup when the kid shakes | iOS shake-to-undo remembers anything typed on the page (the name form) | After Join, reload the page once (seat and name survive); the only way to clear the undo history. Grown-ups can also turn off Settings › Accessibility › Touch › Shake to Undo. In the OGS app there is no name form, which avoids it. |
| "It looks like you are trying to type while in full screen" | Keyboard input or a focused field while full screen | Leave full screen before showing any text box; blur everything before `requestFullscreen` |
| Name badge or HUD under the battery / Wi-Fi icons | Full screen on iPad still draws the status bar over the top ~24 px | Pad fixed top UI with `env(safe-area-inset-top)` plus 24 px in full screen |
| Name sits under the full-screen close (X) button | Safari draws its own X in the top-left corner in full screen | Keep the top-left 56×56 px clear |
| "I don't see the full-screen button" on one role | Each role's header was laid out separately | Test the button's presence on every role × size in `ui-matrix`, not just one screen |
