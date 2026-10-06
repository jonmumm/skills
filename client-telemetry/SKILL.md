---
name: client-telemetry
description: >
  Homegrown client telemetry for browser, React Native/Expo and Swift apps on Cloudflare: errors,
  session lifecycle and product events buffered on the device, posted to the project's own Worker,
  and re-emitted as wide events in Workers Logs, where /sre-agent files issues. Includes a tested
  TypeScript reference (client buffer + POST /events route) that each project copies in. Use when
  asked about "client errors", "crash reporting", "client logs", "frontend telemetry", "capture
  browser errors", "React Native errors", "report crashes from the iPad", or "why didn't we hear
  about that error".
dependsOn:
  - jonmumm/skills@wide-events-logging
  - jonmumm/skills@sre-agent
---

# Client Telemetry

Client errors and events go into the same pipeline as server logs: the device buffers them, the
project's own Worker receives them at `POST /events`, and each one becomes a wide event in Workers
Logs. `/sre-agent` reads Workers Logs every 15 minutes and files an issue per error fingerprint.

## Why homegrown

- **One pipeline.** Server and client errors land in Workers Logs and reach the same sre-agent. No
  second dashboard, no second alert channel.
- **Kids' data stays home.** These are family games. Events stay in our own Cloudflare account and
  never reach a third-party SDK.
- **Small.** About 170 lines of client code and 90 lines of Worker code, both tested.

There is no shared npm package. The code lives in this skill as a reference, and each project owns
its copy and changes it freely. Sentry is an option later only for **native crash symbolication**
(see React Native and Swift below), never as the main error pipeline.

## One envelope, three kinds of event

Every event has the same shape on the device:

```ts
{ at: number; type: string; version: string; session: string;
  data: Record<string, string | number | boolean | null>;
  error?: { type: string; message: string; stack?: string } }
```

| Kind | `type` | Server level | Notes |
|------|--------|--------------|-------|
| Error | `error` | `console.error` | Carries `error.{type,message,stack}`. `error.type` is the class (`TypeError`) or a domain name (`WebGLContextLost`, `PreviousSessionCrashed`). |
| Session | `session_start`, `session_end` | `console.log` | A heartbeat updates an "alive" key on the device; it is not sent. |
| Product | `round_started`, `level_completed`, ... | `console.log` | Also counted in Analytics Engine (`EVENTS` binding) for rates. |

The Worker turns each event into one line in the recommended wide-event shape from
/wide-events-logging:

```ts
{ event: "client.<type>", service, version, source: "client", outcome: "ok" | "error",
  session_id, client_at, error?: { type, message, stack }, ...data }
```

It logs the object (`console.error(line)`), not a JSON string, so Workers Logs indexes the fields.
Keep `error.message` stable (`"Texture failed to load"`, not `"Texture rock-17 failed to load"`):
it is half the sre-agent fingerprint. Put ids in `data`.

## Reference implementation (web)

In `reference/web/`, adapted from juneaus-number-quest (`src/telemetry.ts`, `sync/src/events.ts`):

| File | What it does |
|------|--------------|
| `telemetry.ts` | Client buffer in `localStorage` (any `getItem/setItem/removeItem` store), capped at 400 events, offline-safe `flush`, on-device dedupe (3 per fingerprint per session) and rate limit (20 errors/min), crash-on-next-load via an alive key + heartbeat. Never throws. |
| `telemetry.test.ts` | Buffer cap, flush keeps unsent events, error normalization, dedupe, rate limit, previous-session crash, broken storage. |
| `events-route.ts` | `handleEvents(req, { service, counts? })`: body size limit, Zod-validated batch (max 500), one wide event per client event, `console.error` for errors, drops name/email/token/typed-text keys, reserved fields cannot be overwritten. |
| `events-route.test.ts` | The route at its seam: info vs error level, privacy key drop, reserved fields, bad input rejected with nothing logged. |

**To copy into a project:** put `telemetry.ts` (+ test) in the client source (e.g. `src/telemetry.ts`)
and `events-route.ts` (+ test) in the Worker (e.g. `worker/src/events.ts`), fix the import of
`ClientEventSchema` to point at the client file, and `pnpm add zod` / `pnpm add -D vitest` if
missing. Run the tests before wiring anything. Then route it:

```ts
if (url.pathname === "/events" && req.method === "POST")
  return handleEvents(req, { service: "my-game", counts: env.EVENTS });
```

Protect the route the way the project protects its other client routes (origin check, room token
or a shared key), and keep the body limit.

## Wiring points (web)

```ts
const telemetry = createTelemetry({ kv: localStorage, version: __BUILD__, prefix: "my-game" });
telemetry.sessionStart();                       // reports PreviousSessionCrashed if needed
setInterval(() => telemetry.heartbeat(), 20_000);
```

- **Global errors.** `addEventListener("error", (e) => telemetry.error(e.error ?? e.message))` and
  `addEventListener("unhandledrejection", (e) => telemetry.error(e.reason))`.
- **React error boundary.** In `componentDidCatch(err)`, call `telemetry.error(err, { boundary: "Board" })`
  and render a calm fallback. Boundaries do not see event handlers or async code; the globals above do.
- **WebGL.** `canvas.addEventListener("webglcontextlost", () => telemetry.error(new Error("WebGL context lost"), { renderer }, "WebGLContextLost"))`.
- **Previous session crash.** `sessionStart` reads the alive key. If the last page never called
  `sessionEnd`, it records `error.type: "PreviousSessionCrashed"` with `last_alive` and `ran_for_ms`.
  Call `sessionEnd` on `visibilitychange` to hidden (iPadOS kills background tabs; that is not a
  crash) and `heartbeat` when visible again.
- **Flush.** Flush after each round, on `online`, and on `pagehide`. On `pagehide` the page may be
  gone before `fetch` resolves: use `navigator.sendBeacon(url, body)` or `fetch(url, { keepalive: true })`
  (both cap the body near 64 KB, so send the newest events only).
- **Rate limit and dedupe on the device.** Already in `createTelemetry`. A render loop that throws
  every frame must not fill the buffer or the log.
- **Privacy.** Never log display names, profile names, emails, tokens, or anything a player typed.
  Ids, counts, flags and enum values only. The Worker drops suspicious keys as a backstop, not as the plan.
- **Test mode.** Make `track` and `error` no-ops under the project's `?test` flag so automated runs
  do not file issues.

## React Native / Expo

No reference code yet; reuse the TypeScript core.

- **Storage.** `createTelemetry` needs synchronous `getItem/setItem/removeItem`. MMKV
  (`react-native-mmkv`) fits directly. With AsyncStorage, keep an in-memory mirror loaded at startup
  and write through.
- **JS errors.** `ErrorUtils.setGlobalHandler((err, isFatal) => { telemetry.error(err, { fatal: isFatal }); flushNow(); previous(err, isFatal); })`,
  keeping the previous handler. Unhandled promise rejections need the `promise/setimmediate/rejection-tracking`
  hook or the Hermes equivalent. Add an error boundary as on the web.
- **Session lifecycle.** `AppState` `active` → `sessionStart` / `heartbeat`; `background` →
  `sessionEnd` + flush.
- **Native crashes are not catchable from JS.** A crash in native code kills the process before JS
  runs. Options, decided per app:
  - **Apple MetricKit** through a small Expo module. iOS delivers `MXCrashDiagnostic` for the
    previous crash on a later launch; the module forwards it as an error event. It needs dSYM
    symbolication (upload dSYMs from EAS builds and symbolicate offline) to be readable.
  - **Sentry, crash-only.** Native crash reporting with symbolication handled, session replay off,
    performance off, no PII. Use when native crashes matter more than staying single-pipeline.
  - **Nothing native.** For a JS-heavy app, `PreviousSessionCrashed` already says a crash happened.

## Swift

No reference code yet.

- **Queue on disk.** Codable events appended to a file in Application Support, capped like the web
  buffer. Parse with Codable when reading back.
- **Upload.** `URLSession` POST of the same `{ events: [...] }` batch to the same `/events` route,
  on launch, on foreground and after each round. A background `URLSession` survives suspension.
- **Crashes.** Subscribe to `MXMetricManager` and turn each `MXCrashDiagnostic` (delivered on a later
  launch) into an error event with `error.type` from the exception type or signal. Symbolicate with
  the build's dSYM.
- **Packaging.** If you share the client as a Swift package, the `Package.swift` must sit at a repo
  root: SPM cannot depend on a package in a subdirectory.

## Testing

Each project gets one seam test that runs the real path: a thrown error on the client is posted to
the Worker (vitest-pool-workers `SELF.fetch`, or the route function with a captured logger) and is
emitted **exactly once** as `console.error` with `error.type` and `error.message`, `source: "client"`,
and no names or typed text in the line. Copy the reference tests too; they cover the buffer and the
route in isolation.

## Checklist

- [ ] `telemetry.ts` and `events-route.ts` copied in, tests green.
- [ ] `POST /events` routed, protected, body-limited; `observability.enabled` on in wrangler config.
- [ ] Global error, unhandled rejection, error boundary and `webglcontextlost` wired.
- [ ] `sessionStart` / `heartbeat` / `sessionEnd` wired to visibility (or `AppState`).
- [ ] Flush after rounds, on `online`, and on `pagehide` with `sendBeacon` or `keepalive`.
- [ ] No names, profile names, tokens or typed text in any event.
- [ ] Seam test: a thrown error reaches the Worker and is logged once as `console.error`.
- [ ] Event names listed in `docs/agents/observability.md`.
- [ ] `/sre-agent` installed; if the project's lines differ from the recommended shape, an
      `errorFields` mapping in `.github/sre-agent.yml`.
