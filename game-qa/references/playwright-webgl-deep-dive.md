# Playwright + WebGL Deep Dive

## How It Actually Works

Playwright unconditionally adds `--enable-unsafe-swiftshader` to Chromium launch args. SwiftShader is Google's CPU-based implementation of Vulkan and OpenGL ES — it gives you full WebGL without any GPU hardware.

The "new headless" mode (Chrome 112+, `headless: 'new'` or just `headless: true` in modern Playwright) shares the same rendering pipeline as headed Chrome. The old `--headless` mode was a separate minimal browser — the new one is the full browser without a window. This is why WebGL now works headlessly.

### Chromium Args Reference

| Arg | Effect | When to Use |
|-----|--------|-------------|
| `--use-gl=swiftshader` | Force SwiftShader for WebGL | CI without GPU (default in Playwright) |
| `--use-gl=angle` | Use ANGLE (GPU abstraction layer) | When you have a real GPU |
| `--use-gl=desktop` | Direct OpenGL | Linux with GPU drivers |
| `--use-gl=egl` | EGL (GPU on Linux) | Docker with NVIDIA runtime |
| `--enable-gpu` | Allow GPU acceleration | Real GPU available |
| `--disable-gpu` | Disable GPU | Force software rendering |
| `--no-sandbox` | Disable Chrome sandbox | CI environments |
| `--enable-unsafe-swiftshader` | Allow SwiftShader | Added by Playwright automatically |

### Performance

SwiftShader is slow — 5-10x slower than real GPU rendering. For tests that need many frames of animation, this matters. Strategies:

1. **Disable animations in test mode** — skip tweens, set all transitions to instant
2. **Reduce resolution** — use `viewport: { width: 800, height: 600 }` instead of 1920x1080
3. **Minimize draw calls** — use simpler test scenes when possible
4. **Parallel test workers** — Playwright's `workers` config (default: half your CPU cores)

### Screenshot Stability

SwiftShader produces slightly different output than real GPUs:
- Anti-aliasing algorithms differ
- Floating-point precision varies
- Shader compilation may produce different rounding

**Recommended tolerance settings:**

```typescript
// playwright.config.ts
expect: {
  toHaveScreenshot: {
    maxDiffPixelRatio: 0.01,   // Allow 1% of pixels to differ
    threshold: 0.2,             // Per-pixel color distance (0-1)
    animations: 'disabled',     // Wait for CSS animations to finish
  },
}
```

For game canvas screenshots specifically, you may need higher tolerance:

```typescript
// In a specific test
await expect(canvas).toHaveScreenshot('scene.png', {
  maxDiffPixelRatio: 0.03,  // 3% for complex 3D scenes
})
```

### Three.js's Own Approach

Three.js runs E2E tests in CI with this setup:
- Puppeteer (not Playwright, but same Chromium)
- `--use-angle=swiftshader` flag
- pixelmatch library for image comparison
- 0.1 per-pixel threshold, 0.3% max different pixels
- Tests parallelized across 5 CI jobs
- Standard `ubuntu-latest` GitHub Actions runners
- No Xvfb, no GPU, no Docker

Source: [three.js CI workflow](https://github.com/mrdoob/three.js/blob/dev/.github/workflows/ci.yml)

## Canvas Interaction Patterns

### Clicking on 3D Objects

The browser only knows 2D canvas coordinates. To click on a 3D object:

**Approach A: Project 3D to 2D (recommended)**

Expose a function in the test harness that projects a game entity's world position to screen coordinates:

```typescript
// In test harness
window.__GAME__.projectToScreen = (entityId: string) => {
  const entity = scene.getObjectByName(entityId)
  if (!entity) return null

  const vector = new THREE.Vector3()
  entity.getWorldPosition(vector)
  vector.project(camera)

  return {
    x: (vector.x * 0.5 + 0.5) * canvas.clientWidth,
    y: (-vector.y * 0.5 + 0.5) * canvas.clientHeight,
  }
}
```

Then in Playwright:

```typescript
const pos = await page.evaluate(() => window.__GAME__.projectToScreen('enemy-1'))
await page.mouse.click(pos.x, pos.y)
```

**Approach B: Programmatic raycasting**

Skip the mouse entirely — fire the event directly through the game's event system:

```typescript
window.__GAME__.clickEntity = (entityId: string) => {
  const entity = scene.getObjectByName(entityId)
  // Fire the onClick handler directly
  entity?.userData?.onClick?.()
}
```

**Approach C: Keyboard-first testing**

Many game interactions can be keyboard-driven. Keyboard events go through `document`, not the canvas, making them trivial to test:

```typescript
await page.keyboard.press('Space')  // jump
await page.keyboard.press('e')      // interact
await page.keyboard.press('1')      // select slot 1
```

### Mouse Movement and Drag

```typescript
// Simulate mouse drag (e.g., camera orbit)
const canvas = page.locator('canvas')
const box = await canvas.boundingBox()

await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
await page.mouse.down()
await page.mouse.move(box!.x + box!.width / 2 + 100, box!.y + box!.height / 2, { steps: 10 })
await page.mouse.up()
```

## Waiting for Game State

Games are async — you can't just assert immediately after an action. Patterns:

```typescript
// Wait for specific game state
await page.waitForFunction(
  (expectedPhase) => window.__GAME__?.getPhase() === expectedPhase,
  'combat',
  { timeout: 5000 }
)

// Wait for frame count (after animation)
await page.evaluate(async () => {
  await window.__GAME__?.waitForFrames(30) // ~0.5s at 60fps
})

// Wait for entity to exist
await page.waitForFunction(
  (id) => window.__GAME__?.getEntities()?.some(e => e.id === id),
  'spawned-enemy',
  { timeout: 5000 }
)
```

## Firefox and WebKit

- **Firefox**: Requires Xvfb for WebGL in headless mode. More fragile than Chromium.
- **WebKit**: Limited WebGL support in Playwright's WebKit. Not recommended for WebGL testing.
- **Recommendation**: Test WebGL in Chromium only. Cross-browser visual testing is a separate concern.
