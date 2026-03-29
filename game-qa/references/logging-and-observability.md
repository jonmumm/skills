# Game Logging & Observability

## Library Comparison

| Library | Size | Structured | Named Loggers | Best For |
|---------|------|-----------|---------------|----------|
| **loglevel** | 1.4KB | No (plugin needed) | Yes | Games — zero overhead when filtered, tiny |
| **pino** (browser) | ~5KB | Yes (JSON) | Yes (child loggers) | When you need structured JSON + remote transport |
| **debug** | 3KB | No | Yes (namespaces) | Familiar node.js pattern, namespace filtering |
| **consola** | ~7KB | Yes | Yes | Fancy formatting, reporters |
| **loglevel-plugin-prefix** | +0.5KB | Partial | Via loglevel | Adds timestamps/prefixes to loglevel |

### Recommendation: loglevel

For R3F games, loglevel wins because:
1. **Zero overhead** — disabled loggers are no-ops, critical in a 60fps loop
2. **Named loggers** — `getLogger('physics')` vs `getLogger('network')` lets you focus debugging
3. **Persistent levels** — `localStorage` persistence means you set levels once in devtools
4. **Tiny** — 1.4KB doesn't affect bundle size
5. **No build config** — works with any bundler, no special setup

### When to use pino instead

If you need:
- Structured JSON logs (for ingestion into Loki/Datadog/etc.)
- Remote log transmission
- Server-side log compatibility (same API in Workers + browser)
- Child loggers with inherited context

```typescript
import pino from 'pino'

const logger = pino({
  browser: {
    transmit: {
      send: (level, logEvent) => {
        // Send to your log aggregation service
        fetch('/api/logs', {
          method: 'POST',
          body: JSON.stringify(logEvent),
        })
      },
    },
  },
})

const networkLogger = logger.child({ subsystem: 'network' })
networkLogger.info({ latency: 45, peerId: 'abc' }, 'sync complete')
// → {"level":30,"subsystem":"network","latency":45,"peerId":"abc","msg":"sync complete"}
```

## Log Levels for Games

```
TRACE  — Frame-by-frame state (entity positions, velocities)
         Only enable for specific subsystems during debugging
DEBUG  — State transitions, event dispatch, component mount/unmount
INFO   — Phase changes, player join/leave, game start/end
WARN   — Recoverable issues (dropped frame, reconnection attempt, fallback used)
ERROR  — Unrecoverable issues (state corruption, crash, unhandled exception)
```

### Per-Subsystem Defaults

| Subsystem | Default Level | TRACE Shows | DEBUG Shows |
|-----------|---------------|-------------|-------------|
| `game` | INFO | All state transitions | Event dispatch |
| `physics` | WARN | Collision checks per frame | Collision results |
| `network` | INFO | Every WebSocket message | Connection state changes |
| `render` | WARN | Draw call counts | Material/shader compilation |
| `input` | WARN | Every input event | Gesture recognition |
| `audio` | WARN | Gain/pan per frame | Play/stop events |
| `ai` | INFO | Decision tree traversal | Final decisions |

## Performance Logging

### FPS + Frame Time

```typescript
import { usePerf } from 'r3f-perf'

// In a component (r3f-perf has a headless mode)
function PerfMonitor() {
  const { fps, gl, log } = usePerf()

  useFrame(() => {
    if (fps < 30) {
      logger.render.warn({ fps, drawCalls: gl.drawCalls }, 'FPS drop')
    }
  })

  return null
}
```

### Manual performance marks

```typescript
// Around expensive operations
performance.mark('physics-start')
runPhysicsStep()
performance.mark('physics-end')
performance.measure('physics', 'physics-start', 'physics-end')

const measure = performance.getEntriesByName('physics').at(-1)
if (measure && measure.duration > 16) { // > 1 frame at 60fps
  logger.physics.warn({ duration: measure.duration }, 'Physics step exceeded frame budget')
}
```

## Capturing Logs in Tests

### Playwright Console Capture

```typescript
// Collect all browser logs during a test
const logs: Array<{ type: string; text: string }> = []

page.on('console', (msg) => {
  logs.push({ type: msg.type(), text: msg.text() })
})

// After the test
const errors = logs.filter(l => l.type === 'error')
expect(errors).toHaveLength(0)
```

### Structured Event Log Export

```typescript
// Dump the game's structured event log after a test
const events = await page.evaluate(() => {
  return window.__GAME_LOG__?.getEvents()
})

// Assert no error events
const errors = events.filter(e => e.type === 'error')
expect(errors).toHaveLength(0)

// Assert expected sequence occurred
const phases = events
  .filter(e => e.subsystem === 'game' && e.type === 'phase-change')
  .map(e => e.data.phase)
expect(phases).toEqual(['lobby', 'active', 'combat', 'finished'])
```

### URL-Based Log Level Override

In your logging setup, support `?log=network:debug,physics:trace` query params. This lets Playwright tests enable verbose logging for specific subsystems:

```typescript
await page.goto('/?log=network:trace,game:debug')
```

## Network Logging for Multiplayer

### WebSocket Message Logging

```typescript
// Wrap the WebSocket to log all messages
const originalSend = WebSocket.prototype.send
WebSocket.prototype.send = function(data) {
  logger.network.debug({ direction: 'out', size: data.length }, 'ws send')
  return originalSend.call(this, data)
}

// For incoming messages, hook in your actor-kit client setup
client.subscribe((state) => {
  logger.network.debug({ patches: state._patches?.length }, 'state sync received')
})
```

### Latency Tracking

```typescript
// Measure round-trip time
const pingStart = performance.now()
await client.send({ type: 'PING' })
// In the response handler:
const rtt = performance.now() - pingStart
logger.network.info({ rtt }, 'latency')

if (rtt > 200) {
  logger.network.warn({ rtt }, 'High latency detected')
}
```
