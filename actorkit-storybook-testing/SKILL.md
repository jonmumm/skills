---
name: actorkit-storybook-testing
description: >
  Test actor-kit state machines in Storybook using mock clients and play functions.
  Covers static snapshots, interactive state transitions, event interception, and
  multi-actor nesting. Especially suited for game UIs with complex state progressions.
  Use when building Storybook stories for actor-kit components, testing game states,
  or setting up play function interactions with mock actor clients.
dependsOn:
  - jonmumm/skills@react-composable-components
  - jonmumm/skills@storybook-play-testing
---

# Actor-Kit Storybook Testing

Test actor-kit components in Storybook without WebSockets or Cloudflare Workers. Mock clients replace the real network layer with synchronous, controllable state — letting you render any actor state, simulate transitions, and assert UI behavior in play functions.

## When to Use

- Building stories for components that consume `useSelector`, `useSend`, or `useMatches` from an actor-kit context
- Testing game UIs across multiple phases (lobby → active → finished)
- Verifying UI for edge cases (empty states, error states, max players)
- Simulating async operations (question parsing, timers, uploads)
- Testing multi-actor UIs (e.g., a player actor + session actor)

## Key Concepts

### Mock Client

`createActorKitMockClient<TMachine>` creates a client with the same interface as the real WebSocket client but no network I/O:

```typescript
import { createActorKitMockClient } from "actor-kit/test"

const client = createActorKitMockClient<GameMachine>({
  initialSnapshot: {
    public: { /* ... */ },
    private: {},
    value: { lobby: "ready" },
  },
})
```

**Methods:**
| Method | Purpose |
|--------|---------|
| `getState()` | Current snapshot |
| `send(event)` | Triggers `onSend` callback, notifies subscribers |
| `produce(recipe)` | Immer mutation — directly change state, triggers re-render |
| `subscribe(listener)` | Listen for state changes |
| `waitFor(predicate, timeout?)` | Poll until condition met |
| `connect()` / `disconnect()` | No-op (safe to call) |

### Snapshot Shape

Snapshots must satisfy `CallerSnapshotFrom<TMachine>`:

```typescript
import type { CallerSnapshotFrom } from "actor-kit"

const snapshot: CallerSnapshotFrom<GameMachine> = {
  public: { /* matches your machine's public context */ },
  private: {},
  value: { lobby: "waitingForQuestions" },  // XState state value
}
```

The `value` field controls which state the machine appears to be in. Use the XState state value format — nested states use objects: `{ active: "questionActive" }`.

### Provider Patterns

**From context (static):**
```typescript
<GameContext.ProviderFromClient client={mockClient}>
  <MyComponent />
</GameContext.ProviderFromClient>
```

**From decorator (via parameters):**
```typescript
import { withActorKit } from "actor-kit/storybook"

decorators: [
  withActorKit<GameMachine>({
    actorType: "game",
    context: GameContext,
  }),
]
```

## The Workflow

### 1. Create Default Snapshots

Define reusable base snapshots in a shared utils file:

```typescript
// stories/utils.tsx
import type { CallerSnapshotFrom } from "actor-kit"
import type { GameMachine } from "../app/game.machine"
import type { SessionMachine } from "../app/session.machine"

export const defaultGameSnapshot = {
  public: {
    id: "game-123",
    hostId: "host-123",
    hostName: "Test Host",
    players: [],
    currentQuestion: null,
    winner: null,
    settings: { maxPlayers: 8, answerTimeWindow: 25 },
    questionNumber: 0,
    questions: {},
    questionResults: [],
  },
  private: {},
  value: { lobby: "waitingForQuestions" } as const,
} satisfies CallerSnapshotFrom<GameMachine>

export const defaultSessionSnapshot = {
  public: { userId: "test-user-id", gameIdsByJoinCode: {} },
  private: {},
  value: { Initialization: "Ready" as const },
} satisfies CallerSnapshotFrom<SessionMachine>
```

Use `satisfies` (not `as`) to get type checking without losing literal types.

### 2. Static Stories (Render a State)

Best for: visual QA of specific states, snapshot testing.

```typescript
import type { Meta, StoryObj } from "@storybook/react"
import { withActorKit } from "actor-kit/storybook"
import { defaultGameSnapshot, defaultSessionSnapshot } from "./utils"

const meta: Meta<typeof HostView> = {
  component: HostView,
  decorators: [
    withActorKit<SessionMachine>({
      actorType: "session",
      context: SessionContext,
    }),
    withActorKit<GameMachine>({
      actorType: "game",
      context: GameContext,
    }),
  ],
}
export default meta

type Story = StoryObj<typeof HostView>

export const LobbyWithPlayers: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: { userId: "host-123", gameIdsByJoinCode: {} },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            players: [
              { id: "p1", name: "Alice", score: 0 },
              { id: "p2", name: "Bob", score: 0 },
            ],
          },
          value: { lobby: "ready" },
        },
      },
    },
  },
}
```

### 3. Interactive Stories (Play Functions)

Best for: testing user interactions, verifying event dispatch, simulating state transitions.

```typescript
import { createActorKitMockClient } from "actor-kit/test"
import { expect, userEvent, within } from "@storybook/test"

export const StartGame: Story = {
  play: async ({ canvas, mount, step }) => {
    const gameClient = createActorKitMockClient<GameMachine>({
      initialSnapshot: {
        ...defaultGameSnapshot,
        public: {
          ...defaultGameSnapshot.public,
          hostId: "host-123",
          players: [{ id: "p1", name: "Alice", score: 0 }],
          questions: { q1: { id: "q1", text: "What year?", /* ... */ } },
        },
        value: { lobby: "ready" },
      },
    })

    // Intercept events to simulate transitions
    let lastEvent: any = null
    gameClient.send = (event) => {
      lastEvent = event
      if (event.type === "START_GAME") {
        gameClient.produce((draft) => {
          draft.value = { active: "questionPrep" }
        })
      }
      return Promise.resolve()
    }

    await mount(
      <GameContext.ProviderFromClient client={gameClient}>
        <HostView />
      </GameContext.ProviderFromClient>
    )

    await step("Click start game", async () => {
      const button = await canvas.findByRole("button", { name: /start/i })
      await userEvent.click(button)
      expect(lastEvent?.type).toBe("START_GAME")
    })

    await step("Verify transition to active state", async () => {
      await canvas.findByText(/question prep/i)
    })
  },
}
```

### 4. Simulating Async Operations

For operations like API calls, timers, or document parsing — override `send` with async behavior:

```typescript
export const ParseQuestions: Story = {
  play: async ({ canvas, mount, step }) => {
    const gameClient = createActorKitMockClient<GameMachine>({
      initialSnapshot: {
        ...defaultGameSnapshot,
        value: { lobby: "waitingForQuestions" },
      },
    })

    let mounted = true

    gameClient.send = async (event) => {
      if (event.type === "PARSE_QUESTIONS") {
        // Simulate parsing delay
        await new Promise((r) => setTimeout(r, 500))
        if (!mounted) return Promise.resolve()

        gameClient.produce((draft) => {
          draft.value = { lobby: "ready" }
          draft.public.questions = {
            q1: { id: "q1", text: "Capital of France?", /* ... */ },
          }
        })
      }
      return Promise.resolve()
    }

    await mount(
      <GameContext.ProviderFromClient client={gameClient}>
        <HostView />
      </GameContext.ProviderFromClient>
    )

    await step("Submit questions and see loading", async () => {
      const input = await canvas.findByPlaceholderText(/questions/i)
      await userEvent.type(input, "Some question text")
      const button = await canvas.findByRole("button", { name: /submit/i })
      await userEvent.click(button)

      // Loading state visible
      await canvas.findByTestId("parsing-spinner")
    })

    await step("Questions appear after parsing", async () => {
      await new Promise((r) => setTimeout(r, 600))
      const questions = await canvas.findAllByTestId(/^parsed-question-/)
      expect(questions).toHaveLength(1)
    })

    mounted = false  // Cleanup
  },
}
```

### 5. Multi-Actor Stories

When components consume multiple actor contexts (e.g., game + session):

```typescript
export const GameWithSession: Story = {
  play: async ({ mount }) => {
    const sessionClient = createActorKitMockClient<SessionMachine>({
      initialSnapshot: {
        ...defaultSessionSnapshot,
        public: { userId: "host-123", gameIdsByJoinCode: {} },
      },
    })

    const gameClient = createActorKitMockClient<GameMachine>({
      initialSnapshot: {
        ...defaultGameSnapshot,
        public: { ...defaultGameSnapshot.public, hostId: "host-123" },
      },
    })

    await mount(
      <SessionContext.ProviderFromClient client={sessionClient}>
        <GameContext.ProviderFromClient client={gameClient}>
          <HostView />
        </GameContext.ProviderFromClient>
      </SessionContext.ProviderFromClient>
    )
  },
}
```

### 6. Reusable Mock Factories

For component-level stories, create typed factory functions:

```typescript
// stories/factories.ts
import type { CallerSnapshotFrom, ClientEventFrom } from "actor-kit"
import { createActorKitMockClient } from "actor-kit/test"
import type { GameMachine } from "../app/game.machine"

export function createMockGameClient(
  snapshot: CallerSnapshotFrom<GameMachine>,
  onSend?: (event: ClientEventFrom<GameMachine>) => void
) {
  return createActorKitMockClient<GameMachine>({
    initialSnapshot: snapshot,
    onSend,
  })
}

export function createMockSessionClient(
  snapshot: CallerSnapshotFrom<SessionMachine>,
  onSend?: (event: ClientEventFrom<SessionMachine>) => void
) {
  return createActorKitMockClient<SessionMachine>({
    initialSnapshot: snapshot,
    onSend,
  })
}
```

## Game-Specific Patterns

### Testing Game Phases

Create stories for each major game state. Name them by phase:

```typescript
// Lobby states
export const LobbyEmpty: Story = { /* no players */ }
export const LobbyWithPlayers: Story = { /* 3 players joined */ }
export const LobbyMaxPlayers: Story = { /* maxPlayers reached */ }
export const LobbyQuestionsReady: Story = { /* questions parsed */ }

// Active game states
export const QuestionPrep: Story = { /* between questions */ }
export const QuestionActive: Story = {
  parameters: {
    actorKit: {
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          value: { active: "questionActive" },
          public: {
            ...defaultGameSnapshot.public,
            currentQuestion: {
              questionId: "q1",
              startTime: Date.now() - 5000,  // 5s into the question
              answers: [],
            },
          },
        },
      },
    },
  },
}
export const QuestionWithAnswers: Story = { /* answers submitted */ }

// End states
export const GameFinished: Story = { /* winner declared */ }
export const GameFinishedTie: Story = { /* tie scenario */ }
```

### Testing Timed Events

For countdown timers or time-dependent UI, set `startTime` relative to `Date.now()`:

```typescript
// Question just started (full timer)
currentQuestion: { startTime: Date.now(), answers: [] }

// Question halfway done
currentQuestion: { startTime: Date.now() - 12500, answers: [] }

// Question about to expire
currentQuestion: { startTime: Date.now() - 24000, answers: [] }
```

### Testing Score Progressions

Walk through a multi-question game by producing state changes in sequence:

```typescript
play: async ({ mount, step }) => {
  const client = createMockGameClient({ /* initial active state */ })

  await mount(<GameProvider client={client}><Scoreboard /></GameProvider>)

  await step("After question 1", () => {
    client.produce((draft) => {
      draft.public.players[0].score = 4
      draft.public.players[1].score = 3
      draft.public.questionNumber = 2
    })
  })

  await step("After question 2 — lead changes", () => {
    client.produce((draft) => {
      draft.public.players[0].score = 4
      draft.public.players[1].score = 7  // Overtakes
      draft.public.questionNumber = 3
    })
  })
}
```

## Storybook Config

Required addons:

```typescript
// .storybook/main.ts
addons: [
  "@storybook/addon-interactions",  // Play function panel
  "@storybook/addon-coverage",      // Optional: coverage reports
]
```

If using TanStack Router in components, add a router decorator:

```typescript
// .storybook/withTanStackRouter.tsx
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router"

export function withTanStackRouter(Story) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: /* minimal route tree */,
  })
  return <RouterProvider router={router}><Story /></RouterProvider>
}
```

## Checklist

Before shipping a new actor-kit component story:

- [ ] Default snapshots defined in shared utils file
- [ ] Static story for each major state value
- [ ] Interactive story with play function for key user flows
- [ ] `send()` interception verifies correct event types dispatched
- [ ] `produce()` used to simulate server-side state transitions
- [ ] Multi-actor contexts nested correctly (session wraps game, etc.)
- [ ] Async operations simulated with delay + `mounted` guard
- [ ] Edge cases covered (empty, max, error states)
- [ ] `satisfies CallerSnapshotFrom<T>` on all snapshot literals
