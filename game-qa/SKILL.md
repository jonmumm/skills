---
name: game-qa
description: >
  Automated QA for WebGL/Three.js/R3F multiplayer games built with actor-kit.
  Playwright visual regression, game state assertions, test harness setup,
  structured logging, and bug-finding loops. Use when asked to "QA the game",
  "test the game visually", "find bugs", "set up game testing", "visual regression",
  "playwright for webgl", "game test harness", or "game logging".
dependsOn:
  - jonmumm/skills@actorkit-storybook-testing
  - jonmumm/skills@testing-trophy
  - jonmumm/skills@storybook-play-testing
---

# Game QA

You are an expert at testing WebGL games built with React Three Fiber and actor-kit. You know that Claude Code's TDD loop catches logic bugs well but misses visual regressions, interaction bugs, multiplayer sync issues, and performance problems. You close that gap.

## When to Use

- Setting up automated testing infrastructure for an R3F game
- Finding bugs through automated gameplay exploration
- Adding visual regression tests for game scenes
- Building a test harness that exposes game internals to Playwright
- Setting up structured logging for debugging game issues
- Verifying multiplayer state sync between clients

## Core Principles

1. **Test the pyramid, not just the base.** actor-kit `transition()` tests cover logic. This skill covers everything above: scene graph assertions, visual snapshots, interaction flows, and multiplayer sync.
2. **Expose, don't guess.** Games are opaque canvases. Build explicit test APIs (`window.__GAME__`) rather than trying to reverse-engineer state from pixels.
3. **Determinism is king.** Seed randoms, fix timestamps, disable animations for screenshot stability. Flaky game tests are worse than no tests.
4. **SwiftShader is your friend.** Playwright + SwiftShader gives you WebGL in headless CI. No GPU hardware needed.

## The Testing Pyramid for R3F Games

```
         E2E (Playwright + SwiftShader)
        ← Few: critical user journeys, visual snapshots
      Integration (@react-three/test-renderer + Storybook)
     ← Moderate: scene graph structure, component behavior
   Unit (Vitest + actor-kit transition())
  ← Many: game logic, state machines, scoring, rules
Static Analysis (TypeScript + ESLint)
← Always: type safety, Zod schemas at boundaries
```

## Phase 1: Test Harness Setup

Before any E2E tests work, the game must expose its internals. This is non-negotiable infrastructure.

### 1.1 — Game State Bridge

Create a module that exposes game state to the test runner. Only active in dev/test builds.

```typescript
// src/test-harness.ts
interface GameTestAPI {
  // State inspection
  getState: () => unknown
  getEntities: () => Array<{ id: string; type: string; position: [number, number, number] }>
  getPhase: () => string

  // State manipulation
  dispatch: (event: Record<string, unknown>) => void
  skipToPhase: (phase: string) => void
  setPlayerHealth: (playerId: string, health: number) => void
  spawnEntity: (type: string, position: [number, number, number]) => void

  // Rendering signals
  isReady: () => boolean
  frameCount: () => number
  waitForFrames: (n: number) => Promise<void>

  // Determinism controls
  setSeed: (seed: number) => void
  setTimestamp: (ms: number) => void
  disableAnimations: () => void
}

// Attach in dev/test only
if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  ;(window as any).__GAME__ = {} satisfies Partial<GameTestAPI>
  // Populate with actual implementations as game initializes
}
```

### 1.2 — Ready Signal

Playwright needs to know when the game has rendered its first frame. Add a data attribute:

```typescript
// In your Canvas wrapper or App component
useEffect(() => {
  const canvas = document.querySelector('canvas')
  if (canvas) {
    canvas.setAttribute('data-game-ready', 'true')
  }
}, [])
```

In Playwright tests:

```typescript
await page.waitForSelector('canvas[data-game-ready="true"]', { timeout: 10000 })
```

### 1.3 — Debug Panel (Leva)

Use [Leva](https://github.com/pmndrs/leva) for a debug panel that's R3F-native. It provides `useControls` hooks that integrate with the React render cycle.

```typescript
import { useControls, button } from 'leva'

function DebugPanel() {
  if (import.meta.env.PROD) return null

  useControls('Game', {
    phase: { value: 'lobby', options: ['lobby', 'active', 'combat', 'finished'] },
    skipToCombat: button(() => window.__GAME__?.skipToPhase('combat')),
    spawnEnemy: button(() => window.__GAME__?.spawnEntity('enemy', [0, 0, 0])),
    showHitboxes: false,
    showEntityIds: false,
  })

  return null
}
```

## Phase 2: Playwright Configuration for WebGL

### 2.1 — Playwright Config

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,  // 1% tolerance for SwiftShader variance
      threshold: 0.2,           // per-pixel color threshold
    },
  },
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: {
      args: [
        '--use-gl=swiftshader',        // CPU-based WebGL, works everywhere
        '--enable-unsafe-swiftshader',  // Playwright adds this, but be explicit
        '--no-sandbox',
      ],
    },
    viewport: { width: 1280, height: 720 },
    actionTimeout: 5000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
})
```

### 2.2 — Fixture: Game Page

```typescript
// e2e/fixtures.ts
import { test as base, expect } from '@playwright/test'

interface GameTestAPI {
  getState: () => Promise<unknown>
  getPhase: () => Promise<string>
  dispatch: (event: Record<string, unknown>) => Promise<void>
  skipToPhase: (phase: string) => Promise<void>
  waitForReady: () => Promise<void>
  waitForFrames: (n: number) => Promise<void>
  screenshotCanvas: (name: string) => Promise<void>
}

export const test = base.extend<{ game: GameTestAPI }>({
  game: async ({ page }, use) => {
    const game: GameTestAPI = {
      waitForReady: async () => {
        await page.waitForSelector('canvas[data-game-ready="true"]', { timeout: 15000 })
        // Wait a few extra frames for scene to stabilize
        await page.evaluate(() => window.__GAME__?.waitForFrames(5))
      },

      getState: () => page.evaluate(() => window.__GAME__?.getState()),
      getPhase: () => page.evaluate(() => window.__GAME__?.getPhase()),

      dispatch: (event) => page.evaluate((e) => window.__GAME__?.dispatch(e), event),
      skipToPhase: (phase) => page.evaluate((p) => window.__GAME__?.skipToPhase(p), phase),

      waitForFrames: (n) => page.evaluate((frames) => window.__GAME__?.waitForFrames(frames), n),

      screenshotCanvas: async (name) => {
        const canvas = page.locator('canvas')
        await expect(canvas).toHaveScreenshot(`${name}.png`)
      },
    }

    await use(game)
  },
})

export { expect }
```

### 2.3 — Example E2E Test

```typescript
// e2e/game-flow.spec.ts
import { test, expect } from './fixtures'

test.describe('Game Flow', () => {
  test('lobby renders correctly', async ({ page, game }) => {
    await page.goto('/')
    await game.waitForReady()
    await game.screenshotCanvas('lobby-initial')
  })

  test('transition from lobby to active phase', async ({ page, game }) => {
    await page.goto('/')
    await game.waitForReady()

    await game.skipToPhase('active')
    await game.waitForFrames(10)

    const phase = await game.getPhase()
    expect(phase).toBe('active')
    await game.screenshotCanvas('active-phase')
  })

  test('player can interact with game objects', async ({ page, game }) => {
    await page.goto('/')
    await game.waitForReady()
    await game.skipToPhase('active')
    await game.waitForFrames(5)

    // Click at known coordinates (projected from 3D position)
    const position = await page.evaluate(() => {
      return window.__GAME__?.projectToScreen('target-entity-id')
    })
    if (position) {
      await page.mouse.click(position.x, position.y)
    }

    const state = await game.getState()
    expect(state).toHaveProperty('selectedEntity')
  })
})
```

## Phase 3: Structured Logging

### 3.1 — loglevel Setup

loglevel: 1.4KB, zero deps, named loggers, no overhead when filtered.

```typescript
// src/lib/logger.ts
import log from 'loglevel'

// Named loggers for each subsystem
export const logger = {
  game: log.getLogger('game'),
  physics: log.getLogger('physics'),
  network: log.getLogger('network'),
  render: log.getLogger('render'),
  input: log.getLogger('input'),
  audio: log.getLogger('audio'),
}

// Default levels
const defaults: Record<string, log.LogLevelDesc> = {
  game: 'info',
  physics: 'warn',
  network: 'info',
  render: 'warn',
  input: 'warn',
  audio: 'warn',
}

export function initLogging(overrides?: Partial<Record<keyof typeof logger, log.LogLevelDesc>>) {
  for (const [name, level] of Object.entries({ ...defaults, ...overrides })) {
    logger[name as keyof typeof logger]?.setLevel(level)
  }
}

// Enable verbose logging for specific subsystems via URL params
// e.g., ?log=network:debug,physics:trace
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search)
  const logParam = params.get('log')
  if (logParam) {
    for (const pair of logParam.split(',')) {
      const [name, level] = pair.split(':')
      logger[name as keyof typeof logger]?.setLevel(level as log.LogLevelDesc)
    }
  }
}
```

### 3.2 — Structured Game Events (for debugging replays)

```typescript
// src/lib/game-event-log.ts
interface GameEvent {
  timestamp: number
  frame: number
  subsystem: string
  type: string
  data: Record<string, unknown>
}

class GameEventLog {
  private events: GameEvent[] = []
  private frame = 0

  log(subsystem: string, type: string, data: Record<string, unknown> = {}) {
    this.events.push({
      timestamp: performance.now(),
      frame: this.frame,
      subsystem,
      type,
      data,
    })
  }

  tick() { this.frame++ }

  // Export for test assertions or debugging
  getEvents(filter?: { subsystem?: string; type?: string }) {
    if (!filter) return this.events
    return this.events.filter(e =>
      (!filter.subsystem || e.subsystem === filter.subsystem) &&
      (!filter.type || e.type === filter.type)
    )
  }

  clear() { this.events = []; this.frame = 0 }
}

export const gameLog = new GameEventLog()

// Expose to test harness
if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  ;(window as any).__GAME_LOG__ = gameLog
}
```

### 3.3 — Capturing Logs in Playwright

```typescript
// In your test fixture setup
test.beforeEach(async ({ page }) => {
  // Capture console output
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`[BROWSER] ${msg.text()}`)
    }
  })

  // Capture uncaught exceptions
  page.on('pageerror', (error) => {
    console.error(`[BROWSER EXCEPTION] ${error.message}`)
  })
})

// In a test, dump the structured game log
test('no errors during gameplay', async ({ page, game }) => {
  await page.goto('/')
  await game.waitForReady()
  await game.skipToPhase('active')
  await game.waitForFrames(60) // ~1 second of gameplay

  const events = await page.evaluate(() => window.__GAME_LOG__?.getEvents({ type: 'error' }))
  expect(events).toHaveLength(0)
})
```

## Phase 4: Bug-Finding Loop

When invoked to "find bugs" or "QA the game", follow this loop:

### 4.1 — Automated Exploration

```
1. Read the game's state machine / actor-kit machine definition
2. Enumerate all states and transitions
3. For each state:
   a. Use test harness to skip to that state
   b. Screenshot
   c. Assert no console errors
   d. Assert no visual anomalies (compare to baseline)
   e. Try all valid transitions from that state
   f. Try invalid transitions — verify they're rejected gracefully
4. For multiplayer:
   a. Open two browser contexts
   b. Join both to same game
   c. Verify state sync after each action
   d. Test disconnect/reconnect
   e. Test race conditions (simultaneous actions)
```

### 4.2 — Visual Regression Baseline

First run creates baseline screenshots. Subsequent runs compare. Use Playwright's built-in snapshot testing:

```bash
# Create baselines
pnpm exec playwright test --update-snapshots

# Run visual regression
pnpm exec playwright test
```

### 4.3 — Multiplayer Sync Test Pattern

```typescript
test('multiplayer state sync', async ({ browser, game }) => {
  const context1 = await browser.newContext()
  const context2 = await browser.newContext()
  const page1 = await context1.newPage()
  const page2 = await context2.newPage()

  await page1.goto('/game/test-room')
  await page2.goto('/game/test-room')

  // Wait for both to connect
  await page1.waitForSelector('canvas[data-game-ready="true"]')
  await page2.waitForSelector('canvas[data-game-ready="true"]')

  // Player 1 takes action
  await page1.evaluate(() => window.__GAME__?.dispatch({ type: 'PLAY_CARD', card: 'warrior' }))

  // Wait for sync
  await page2.waitForFunction(() => {
    const state = window.__GAME__?.getState()
    return state?.lastAction?.type === 'PLAY_CARD'
  }, { timeout: 5000 })

  // Verify both clients agree on state
  const state1 = await page1.evaluate(() => window.__GAME__?.getState())
  const state2 = await page2.evaluate(() => window.__GAME__?.getState())

  // Public state should match (private state will differ per player)
  expect(state1.board).toEqual(state2.board)
})
```

## Phase 5: @react-three/test-renderer (Scene Graph Tests)

For testing scene structure without a browser:

```typescript
// src/components/__tests__/GameBoard.test.tsx
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { describe, it, expect } from 'vitest'
import { GameBoard } from '../GameBoard'

describe('GameBoard', () => {
  it('renders the correct number of tiles', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <GameBoard tiles={9} />
    )

    const graph = renderer.toGraph()
    const tiles = graph.filter(node => node.name?.startsWith('tile-'))
    expect(tiles).toHaveLength(9)
  })

  it('highlights selected tile on click', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <GameBoard tiles={9} />
    )

    const tile = renderer.scene.children.find(c => c.instance.name === 'tile-0')
    await renderer.fireEvent(tile!, 'click')

    // Check material color changed
    const material = tile!.instance.material
    expect(material.color.getHex()).toBe(0xffff00) // highlight color
  })

  it('advances animation frames', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <AnimatedComponent />
    )

    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(10, 0.016) // 10 frames at 60fps delta
    })

    // Assert position changed
    const mesh = renderer.scene.children[0]
    expect(mesh.instance.position.x).toBeGreaterThan(0)
  })
})
```

**Limitations to know:**
- `fireEvent` only works for `click`, not `pointermove`/`pointerover` (pmndrs/react-three-fiber#1354)
- Experimental — API may change
- No actual rendering — tests structure, not visuals

## Phase 6: CI Configuration

### GitHub Actions

```yaml
# .github/workflows/game-tests.yml
name: Game Tests
on: [push, pull_request]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: pnpm install
      - run: pnpm test              # Vitest unit + scene graph tests

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: pnpm install
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

No GPU needed. SwiftShader handles WebGL. Standard `ubuntu-latest` runners work.

## Workflow Summary

When invoked, follow this decision tree:

```
User says "set up game testing" or "game test harness"
  → Phase 1 (harness) + Phase 2 (playwright config) + Phase 3 (logging)

User says "QA the game" or "find bugs"
  → Phase 4 (bug-finding loop) using existing harness

User says "visual regression" or "screenshot tests"
  → Phase 2 (playwright) + Phase 4.2 (baselines)

User says "test multiplayer sync"
  → Phase 4.3 (multiplayer pattern)

User says "add scene graph tests"
  → Phase 5 (@react-three/test-renderer)

User says "set up CI for game tests"
  → Phase 6 (GitHub Actions)
```

## Tools & Dependencies

| Tool | Purpose | Install |
|------|---------|---------|
| `@playwright/test` | E2E, visual regression | `pnpm add -D @playwright/test` |
| `@react-three/test-renderer` | Scene graph tests | `pnpm add -D @react-three/test-renderer` |
| `loglevel` | Structured logging | `pnpm add loglevel` |
| `leva` | Debug panel | `pnpm add leva` |
| `vitest` | Unit tests | (likely already installed) |
| `vitest-webgl-canvas-mock` | WebGL mock for Vitest | `pnpm add -D vitest-webgl-canvas-mock` |

## Key Gotchas

- **SwiftShader renders differ from GPU.** Set `maxDiffPixelRatio: 0.01` minimum. Anti-aliasing, shader precision, and driver quirks cause false positives.
- **Wait for frame stability.** Always wait N frames after state changes before screenshots. Canvas content is async.
- **`@react-three/test-renderer` is experimental.** Pointer events beyond `click` don't work. Plan around this.
- **Constructor equality in Vitest.** Three.js Vector3/Euler instances may fail strict equality in ESM mode. Compare `.toArray()` instead.
- **Test harness must be tree-shaken in prod.** Gate all `window.__GAME__` assignments behind `import.meta.env.DEV`.
