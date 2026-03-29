# Scene Graph Testing with @react-three/test-renderer

## Setup

```bash
pnpm add -D @react-three/test-renderer
```

For Vitest, you also need the WebGL canvas mock:

```bash
pnpm add -D vitest-webgl-canvas-mock
```

```typescript
// vitest.config.ts (or vite.config.ts test block)
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['vitest-webgl-canvas-mock'],
  },
})
```

## API Reference

### Creating a renderer

```typescript
import ReactThreeTestRenderer from '@react-three/test-renderer'

const renderer = await ReactThreeTestRenderer.create(<MyScene />)
```

### Scene graph inspection

```typescript
// Get all children recursively
renderer.scene.children          // direct children
renderer.scene.allChildren       // recursive

// Find by name
const mesh = renderer.scene.findByType('Mesh')
const named = renderer.scene.findAll(node => node.instance.name === 'player')

// Access Three.js instance
const position = mesh.instance.position  // THREE.Vector3
const material = mesh.instance.material  // THREE.Material

// Serialize for snapshots
const graph = renderer.toGraph()
expect(graph).toMatchSnapshot()
```

### Firing events

```typescript
// Only 'click' is reliable (pointer events are broken)
await renderer.fireEvent(mesh, 'click')

// Workaround for pointer events:
// Call the handler directly through the instance
mesh.instance.userData.onPointerOver?.()
```

### Advancing frames (testing useFrame)

```typescript
await ReactThreeTestRenderer.act(async () => {
  // Advance 10 frames with 16ms delta (60fps)
  await renderer.advanceFrames(10, 0.016)
})
```

### Updating props

```typescript
await renderer.update(<MyScene visible={false} />)
```

## Known Issues

### 1. Pointer events don't work (pmndrs/react-three-fiber#1354)

`fireEvent` with `pointermove`, `pointerover`, `pointerout`, `pointerdown`, `pointerup` does not trigger R3F's event system. Only `click` works.

**Workaround:** Access the event handler directly:
```typescript
const mesh = renderer.scene.findByType('Mesh')
// If component uses onPointerOver:
mesh.instance.userData?.onPointerOver?.({ stopPropagation: () => {} })
```

### 2. Constructor equality in Vitest ESM (vitest-dev/vitest#4207)

Three.js class instances (Vector3, Euler, etc.) may fail strict equality when Vitest runs in ESM mode because different module instances create different class prototypes.

**Workaround:** Compare arrays instead:
```typescript
// DON'T:
expect(mesh.instance.position).toEqual(new THREE.Vector3(1, 2, 3))

// DO:
expect(mesh.instance.position.toArray()).toEqual([1, 2, 3])
```

### 3. No actual rendering

The test renderer creates a scene graph but does not render pixels. You cannot:
- Take screenshots
- Test shaders or materials visually
- Test post-processing effects
- Verify that objects are visible in the camera frustum

For visual testing, use Playwright with SwiftShader (Phase 2 in main skill).

## Patterns for Actor-Kit Games

### Testing game board rendering

```typescript
describe('GameBoard', () => {
  it('renders tiles matching game state', async () => {
    const gameState = {
      board: [
        { id: 'tile-0', type: 'grass', position: [0, 0, 0] },
        { id: 'tile-1', type: 'water', position: [1, 0, 0] },
        { id: 'tile-2', type: 'mountain', position: [2, 0, 0] },
      ],
    }

    const renderer = await ReactThreeTestRenderer.create(
      <GameBoard state={gameState} />
    )

    const tiles = renderer.scene.findAll(n => n.instance.name?.startsWith('tile-'))
    expect(tiles).toHaveLength(3)

    // Verify positions match state
    tiles.forEach((tile, i) => {
      expect(tile.instance.position.toArray()).toEqual(gameState.board[i].position)
    })
  })
})
```

### Testing with mock actor-kit client

Combine with `createActorKitMockClient` from the actorkit-storybook-testing pattern:

```typescript
import { createActorKitMockClient } from 'actor-kit/test'

describe('GameScene with actor-kit', () => {
  it('renders based on actor state', async () => {
    const client = createActorKitMockClient<GameMachine>({
      initialSnapshot: {
        public: { phase: 'active', board: [...] },
        private: { hand: ['card-1', 'card-2'] },
        value: { active: 'playerTurn' },
      },
    })

    const renderer = await ReactThreeTestRenderer.create(
      <GameContext.ProviderFromClient client={client}>
        <GameScene />
      </GameContext.ProviderFromClient>
    )

    // Assert scene reflects the active state
    const board = renderer.scene.findByType('Group')
    expect(board.children.length).toBeGreaterThan(0)

    // Simulate state transition
    client.produce((draft) => {
      draft.public.phase = 'combat'
    })

    // Re-render and verify
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, 0.016)
    })

    // Scene should update to reflect combat phase
    const combatUI = renderer.scene.findAll(n => n.instance.name === 'combat-overlay')
    expect(combatUI).toHaveLength(1)
  })
})
```

## ECS Testing Alternative

If using an ECS (Miniplex, bitECS), systems are pure functions that transform data:

```typescript
// Systems are testable without any renderer
describe('CombatSystem', () => {
  it('applies damage to entities with Health component', () => {
    const world = createWorld()
    const attacker = world.add({ Attack: { damage: 10 }, Position: { x: 0, y: 0 } })
    const target = world.add({ Health: { current: 100, max: 100 }, Position: { x: 1, y: 0 } })

    combatSystem(world, { attacker: attacker.id, target: target.id })

    expect(target.Health.current).toBe(90)
  })
})
```

This is the fastest, most reliable layer of testing. Rendering is a separate concern.
