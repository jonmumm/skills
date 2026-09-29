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
