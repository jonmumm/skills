---
name: actorkit-tanstack-start
description: >
  Integrate actor-kit with TanStack Start/Router for server-rendered, real-time
  stateful apps on Cloudflare Workers. Covers route loaders, server functions,
  SSR hydration, WebSocket handoff, middleware, and E2E testing with Playwright.
  Use when building a TanStack Start app with actor-kit, setting up actor-kit
  server functions, or configuring the SSR-to-WebSocket hydration flow.
---

# Actor-Kit + TanStack Start

Wire actor-kit state machines into TanStack Start apps with server-side rendering, JWT auth, and real-time WebSocket sync — all running on Cloudflare Workers.

## Architecture Overview

```
Browser                          Cloudflare Worker
┌──────────────────┐             ┌─────────────────────────┐
│ TanStack Router   │             │ Nitro Server             │
│                  │             │                         │
│ Route Loader ────┼──HTTP GET──▶│ Middleware ──▶ Actor Router│
│ (createServerFn) │◀── JSON ───│   │          │           │
│                  │             │   ▼          ▼           │
│ React Component  │             │ Health    Durable Object │
│   ├ Provider     │             │ Check     (XState Machine)│
│   ├ useSelector  │◀─WebSocket─│           │              │
│   └ useSend ─────┼──WebSocket─▶           │              │
│                  │             │   JSON Patch (diffs)      │
└──────────────────┘             └─────────────────────────┘
```

## When to Use

- Starting a new TanStack Start app with real-time actor-kit state
- Adding actor-kit to an existing TanStack Start project
- Setting up SSR → WebSocket hydration for actor-kit
- Configuring Cloudflare Workers deployment with Durable Objects
- Writing E2E tests for actor-kit + TanStack Start

## The Setup

### 1. Define the Actor

Standard actor-kit setup — schemas, types, machine, server:

```typescript
// src/todo.schemas.ts
import { z } from "zod"

export const TodoClientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ADD_TODO"), text: z.string() }),
  z.object({ type: z.literal("TOGGLE_TODO"), id: z.string() }),
  z.object({ type: z.literal("DELETE_TODO"), id: z.string() }),
])

export const TodoServiceEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SYNC_TODOS"), todos: z.array(z.any()) }),
])

export const TodoInputPropsSchema = z.object({
  ownerId: z.string(),
})
```

```typescript
// src/todo.types.ts
import type { ActorKitStateMachine, CallerSnapshotFrom, WithActorKitEvent, WithActorKitInput } from "actor-kit"

export type TodoServerContext = {
  public: {
    ownerId: string
    todos: Array<{ id: string; text: string; completed: boolean }>
    lastSync: number | null
  }
  private: Record<string, never>
}

export type TodoMachine = ActorKitStateMachine<TodoEvent, TodoInput, TodoServerContext>
```

```typescript
// src/todo.machine.ts
import { assign, setup } from "xstate"
import { produce } from "immer"

export const todoMachine = setup({
  types: { /* ... */ },
  guards: {
    isOwner: ({ context, event }) => event.caller.id === context.public.ownerId,
  },
}).createMachine({
  id: "todo",
  initial: "ready",
  context: ({ input }) => ({
    public: { ownerId: input.caller.id, todos: [], lastSync: null },
    private: {},
  }),
  states: {
    ready: {
      on: {
        ADD_TODO: {
          guard: "isOwner",
          actions: assign(({ context, event }) =>
            produce(context, (draft) => {
              draft.public.todos.push({
                id: crypto.randomUUID(),
                text: event.text,
                completed: false,
              })
            })
          ),
        },
        // TOGGLE_TODO, DELETE_TODO...
      },
    },
  },
})
```

```typescript
// src/todo.server.ts
import { createMachineServer, createActorKitRouter } from "actor-kit/worker"
import { todoMachine } from "./todo.machine"
import { TodoClientEventSchema, TodoServiceEventSchema, TodoInputPropsSchema } from "./todo.schemas"

export const Todo = createMachineServer({
  machine: todoMachine,
  schemas: {
    clientEvent: TodoClientEventSchema,
    serviceEvent: TodoServiceEventSchema,
    inputProps: TodoInputPropsSchema,
  },
  options: { persisted: true },
})

export const todoActorRouter = createActorKitRouter(["todo"])
```

### 2. Create React Context

```typescript
// src/todo.context.tsx
import { createActorKitContext } from "actor-kit/react"
import type { TodoMachine } from "./todo.types"

export const TodoActorKitContext = createActorKitContext<TodoMachine>("todo")

// Aliased provider for cleaner JSX
export const TodoActorKitProvider = TodoActorKitContext.Provider
```

### 3. Server Environment

Handle both Cloudflare runtime (Durable Objects) and dev mode:

```typescript
// src/server-env.ts
type ActorKitRuntimeEnv = { TODO: DurableObjectNamespace }
type DevEnv = { ACTOR_KIT_HOST: string; ACTOR_KIT_SECRET: string }

export function getServerEnv(): ActorKitRuntimeEnv | DevEnv {
  // Check for Cloudflare runtime bindings
  if (globalThis.__env__?.TODO) {
    return globalThis.__env__ as ActorKitRuntimeEnv
  }
  // Fall back to dev config
  return {
    ACTOR_KIT_HOST: process.env.ACTOR_KIT_HOST!,
    ACTOR_KIT_SECRET: process.env.ACTOR_KIT_SECRET!,
  }
}
```

### 4. Server Middleware

Intercept requests, route actor-kit API calls to the router:

```typescript
// server/middleware/actor-kit.ts
import { defineEventHandler, getRequestURL, toWebRequest, sendWebResponse } from "vinxi/http"
import { todoActorRouter } from "../../src/todo.server"
import { getServerEnv } from "../../src/server-env"

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)

  // Health check for E2E/preview
  if (url.pathname === "/health") {
    return new Response("OK", { status: 200 })
  }

  // Route /api/* to actor-kit
  if (url.pathname.startsWith("/api/")) {
    const env = getServerEnv()
    const request = toWebRequest(event)
    const response = await todoActorRouter(request, env, {})
    return sendWebResponse(event, response)
  }
})
```

### 5. Route Loader (SSR)

Fetch the initial snapshot server-side so the page renders with data:

```typescript
// src/routes/lists.$listId.tsx
import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { createAccessToken } from "actor-kit/server"
import { createActorFetch } from "actor-kit/server"
import { z } from "zod"

const ListRouteInputSchema = z.object({ listId: z.string().min(1) })

const loadTodoRoute = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => ListRouteInputSchema.parse(input))
  .handler(async ({ data }) => {
    const env = getServerEnv()
    const caller = { id: "demo-user", type: "client" as const }

    // Sign JWT for this caller + actor
    const accessToken = await createAccessToken({
      signingKey: env.ACTOR_KIT_SECRET,
      actorId: data.listId,
      actorType: "todo",
      callerId: caller.id,
      callerType: caller.type,
    })

    // Fetch snapshot (HTTP GET to Durable Object)
    const fetchTodo = createActorFetch<TodoMachine>({
      actorType: "todo",
      host: env.ACTOR_KIT_HOST,
    })
    const payload = await fetchTodo({
      actorId: data.listId,
      accessToken,
    })

    return {
      accessToken,
      host: env.ACTOR_KIT_HOST,
      listId: data.listId,
      payload,          // { snapshot, checksum }
      userId: caller.id,
    }
  })

export const Route = createFileRoute("/lists/$listId")({
  loader: ({ params }) => loadTodoRoute({ data: { listId: params.listId } }),
  component: ListPage,
})
```

### 6. Route Component (Hydration)

Wire the server-fetched snapshot into the React provider, then connect WebSocket:

```typescript
// src/routes/lists.$listId.tsx (continued)
function ListPage() {
  const { accessToken, host, listId, payload, userId } = Route.useLoaderData()

  return (
    <TodoActorKitProvider
      host={host}
      actorId={listId}
      accessToken={accessToken}
      checksum={payload.checksum}
      initialSnapshot={payload.snapshot}
    >
      <TodoList userId={userId} />
    </TodoActorKitProvider>
  )
}
```

The Provider internally:
1. Creates `createActorKitClient()` with the initial snapshot
2. On mount, calls `client.connect()` → opens WebSocket
3. Server validates JWT, sends JSON Patch diffs for state changes

### 7. Component Usage

```typescript
// src/components/TodoList.tsx
import { TodoActorKitContext } from "../todo.context"

export function TodoList({ userId }: { userId: string }) {
  const todos = TodoActorKitContext.useSelector((s) => s.public.todos)
  const isOwner = TodoActorKitContext.useSelector(
    (s) => s.public.ownerId === userId
  )
  const send = TodoActorKitContext.useSend()

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>
          {todo.text}
          {isOwner && (
            <button onClick={() => send({ type: "DELETE_TODO", id: todo.id })}>
              Delete
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
```

## Hydration Flow

```
1. User navigates to /lists/{id}
2. TanStack Router calls route loader (server-side)
3. Loader: createAccessToken() → createActorFetch() → { snapshot, checksum }
4. Component renders with <Provider initialSnapshot={snapshot}>
5. useEffect → client.connect() opens WebSocket
6. WebSocket: /api/todo/{id}?accessToken=...&checksum=...
7. Server compares checksum — if match, no initial payload needed
8. Ongoing: server sends JSON Patch diffs, client applies with Immer
9. Components re-render via useSyncExternalStore subscriptions
```

## Cloudflare Deployment

### Nitro Config

```typescript
// nitro.config.ts
export default defineNitroConfig({
  preset: "cloudflare_module",
  scanDirs: ["./server"],
  cloudflare: { deployConfig: true, nodeCompat: true },
})
```

### Export Durable Objects

```typescript
// exports.cloudflare.ts
export { Todo } from "./src/todo.server"
```

### Wrangler Config

```toml
# wrangler.toml
name = "my-app"
main = ".output/server/index.mjs"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[durable_objects]
bindings = [{ name = "TODO", class_name = "Todo" }]

[[migrations]]
tag = "v1"
new_classes = ["Todo"]
```

## E2E Testing with Playwright

### Config

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm build && wrangler dev --port 3002",
    url: "http://localhost:3002/health",
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: "http://localhost:3002" },
})
```

The `/health` endpoint (from middleware) lets Playwright wait for the server.

### Test Pattern

```typescript
// e2e/todo.spec.ts
import { test, expect } from "@playwright/test"

test("can create and manage todos", async ({ page }) => {
  await page.goto("/")

  // Navigate to a new list
  await page.getByRole("link", { name: /new list/i }).click()

  // Add a todo
  await page.getByPlaceholder(/add a new todo/i).fill("Buy milk")
  await page.getByRole("button", { name: /add/i }).click()

  // Verify it appears
  await expect(page.getByText("Buy milk")).toBeVisible()
})
```

### Testing Real-Time Sync (Multi-Tab)

```typescript
test("real-time sync between tabs", async ({ browser }) => {
  const context1 = await browser.newContext()
  const context2 = await browser.newContext()
  const page1 = await context1.newPage()
  const page2 = await context2.newPage()

  // Both open the same list
  const listUrl = "/lists/shared-123"
  await page1.goto(listUrl)
  await page2.goto(listUrl)

  // Page 1 adds a todo
  await page1.getByPlaceholder(/add/i).fill("Shared item")
  await page1.getByRole("button", { name: /add/i }).click()

  // Page 2 sees it appear via WebSocket
  await expect(page2.getByText("Shared item")).toBeVisible({ timeout: 5000 })

  await context1.close()
  await context2.close()
})
```

## Checklist

When setting up actor-kit in a TanStack Start app:

- [ ] Actor defined: schemas + types + machine + server
- [ ] React context created with `createActorKitContext`
- [ ] Server env handles both Cloudflare runtime and dev mode
- [ ] Middleware routes `/api/*` to actor-kit router
- [ ] Health check endpoint at `/health`
- [ ] Route loader fetches snapshot via `createServerFn`
- [ ] Route component wraps children in `Provider` with snapshot + token
- [ ] `exports.cloudflare.ts` re-exports Durable Object classes
- [ ] Wrangler config has DO bindings and migrations
- [ ] E2E tests verify full flow (navigate → interact → verify)
