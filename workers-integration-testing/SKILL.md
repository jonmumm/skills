---
name: workers-integration-testing
description: >
  Write integration tests for Cloudflare Workers using vitest-pool-workers and cloudflare:test.
  Tests the full HTTP cycle — request through handler, middleware, bindings (D1, KV, R2, DO, Hyperdrive),
  and back. Use when adding test coverage to a Worker, when a new route/endpoint is created, or when
  /nightshift, /swarm, or /ralph-tdd encounter a Cloudflare Workers service.
---

# Workers Integration Testing

You write integration tests that exercise Cloudflare Workers through the real Workers runtime — not mocks. Every route, middleware chain, binding interaction, and error path is tested via `SELF.fetch()` against the actual handler with real (local) bindings. This is the highest-value testing layer for Workers because it catches what unit tests cannot: binding misconfigurations, middleware ordering bugs, serialization mismatches, and D1/KV/R2 query errors.

## When to use this skill

- A new API route or endpoint is added to a Worker
- Middleware (auth, CORS, validation) is changed
- Database schema or queries change (D1, Hyperdrive/Postgres)
- KV, R2, or Durable Object interactions are added or modified
- As the primary test strategy in `/nightshift`, `/swarm`, and `/ralph-tdd` loops when the target is a Cloudflare Worker

## Core principles

1. **Test the HTTP seam.** Use `SELF.fetch()` to call your Worker exactly as a client would. Assert on HTTP status, response body shape, and headers — not internal function return values.
2. **Verify side effects in bindings.** After a mutation endpoint (POST, PUT, DELETE), query the binding directly (`env.DB.prepare(...)`, `env.KV.get(...)`) to confirm the write landed correctly.
3. **No mocking bindings.** The `@cloudflare/vitest-pool-workers` pool gives you real local bindings via Miniflare. Use them. Mock only truly external third-party services (payment gateways, external APIs).
4. **Isolated storage per test.** Use `isolatedStorage: true` so each test starts clean. Seed only what the test needs in `beforeEach`.
5. **Test auth paths.** Every protected endpoint needs at least: valid auth → 200, missing auth → 401, invalid auth → 401/403.
6. **Test validation paths.** Every endpoint that accepts a body needs: valid body → success, missing required fields → 400, invalid values → 400.

## Setup

### 1. Install dependencies

```bash
pnpm add -D @cloudflare/vitest-pool-workers vitest
```

### 2. Vitest config

Create `vitest.integration.config.mts` (or add to existing `vitest.config.ts`):

```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    globals: true,
    include: ["test/integration/**/*.test.ts"],
    setupFiles: ["./test/integration/setup.ts"],
    poolOptions: {
      workers: {
        wrangler: {
          configPath: "./wrangler.toml", // or wrangler.jsonc
        },
        miniflare: {
          bindings: {
            // Override secrets for tests
            JWT_SECRET: "test-jwt-secret",
          },
          // For Hyperdrive (Postgres):
          // hyperdrives: { HYPERDRIVE: `${connectionString}/postgres` },
        },
        isolatedStorage: true,
        singleWorker: true,
      },
    },
  },
});
```

### 3. Setup file (D1 example)

```typescript
// test/integration/setup.ts
import { env } from "cloudflare:test";

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const statements = schema.split(";").map(s => s.trim()).filter(s => s.length > 0);
for (const stmt of statements) {
  await env.DB.prepare(stmt).run();
}

// Seed baseline data
await env.DB.prepare(
  "INSERT OR IGNORE INTO api_keys (key, name) VALUES (?, ?)"
).bind("test-api-key", "Test Key").run();
```

### 4. Package script

```json
{
  "scripts": {
    "test:integration": "vitest run --config vitest.integration.config.mts"
  }
}
```

## Test patterns

### Full HTTP cycle with binding verification

```typescript
import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

describe("POST /api/v1/items", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM items").run();
  });

  it("creates item and persists to D1", async () => {
    const res = await SELF.fetch("https://api.test/api/v1/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-api-key",
      },
      body: JSON.stringify({ name: "Widget", quantity: 5 }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.name).toBe("Widget");

    // Verify in D1
    const row = await env.DB.prepare(
      "SELECT * FROM items WHERE id = ?"
    ).bind(body.id).first();

    expect(row).toBeTruthy();
    expect(row!.name).toBe("Widget");
    expect(row!.quantity).toBe(5);
  });
});
```

### Auth boundary tests

```typescript
it("rejects missing auth", async () => {
  const res = await SELF.fetch("https://api.test/api/v1/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Widget" }),
  });
  expect(res.status).toBe(401);
});

it("rejects invalid key against real binding", async () => {
  const res = await SELF.fetch("https://api.test/api/v1/items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer not-a-real-key",
    },
    body: JSON.stringify({ name: "Widget" }),
  });
  expect(res.status).toBe(401);
  const body = (await res.json()) as { error: { code: string } };
  expect(body.error.code).toBe("invalid_api_key");
});
```

### Validation boundary tests

```typescript
it("rejects missing required fields", async () => {
  const res = await SELF.fetch("https://api.test/api/v1/items", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Widget" }), // missing quantity
  });
  expect(res.status).toBe(400);
});

it("rejects invalid field values", async () => {
  const res = await SELF.fetch("https://api.test/api/v1/items", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "", quantity: -1 }),
  });
  expect(res.status).toBe(400);
});
```

### CRUD lifecycle

```typescript
it("full create → read → update → delete lifecycle", async () => {
  // Create
  const createRes = await SELF.fetch("https://api.test/api/v1/items", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Widget", quantity: 5 }),
  });
  const { id } = (await createRes.json()) as { id: string };

  // Read
  const getRes = await SELF.fetch(`https://api.test/api/v1/items/${id}`, { headers });
  expect(getRes.status).toBe(200);

  // Update
  const putRes = await SELF.fetch(`https://api.test/api/v1/items/${id}`, {
    method: "PUT", headers,
    body: JSON.stringify({ quantity: 10 }),
  });
  expect(putRes.status).toBe(200);

  // Verify update in D1
  const row = await env.DB.prepare("SELECT quantity FROM items WHERE id = ?")
    .bind(id).first<{ quantity: number }>();
  expect(row?.quantity).toBe(10);

  // Delete
  const delRes = await SELF.fetch(`https://api.test/api/v1/items/${id}`, {
    method: "DELETE", headers,
  });
  expect(delRes.status).toBe(200);

  // Verify gone
  const gone = await env.DB.prepare("SELECT * FROM items WHERE id = ?")
    .bind(id).first();
  expect(gone).toBeNull();
});
```

### KV binding tests

```typescript
it("caches response in KV", async () => {
  const res = await SELF.fetch("https://api.test/api/v1/config", { headers });
  expect(res.status).toBe(200);

  const cached = await env.CONFIG_KV.get("config:latest");
  expect(cached).toBeTruthy();
});
```

### Durable Object tests

```typescript
import { env, SELF } from "cloudflare:test";

it("creates and retrieves DO state via HTTP", async () => {
  const res = await SELF.fetch("https://api.test/api/v1/rooms", {
    method: "POST", headers,
    body: JSON.stringify({ roomId: "room-1" }),
  });
  expect(res.status).toBe(201);

  // Interact with the room through the Worker's HTTP API
  const joinRes = await SELF.fetch("https://api.test/api/v1/rooms/room-1/join", {
    method: "POST", headers,
    body: JSON.stringify({ userId: "user-1" }),
  });
  expect(joinRes.status).toBe(200);
});
```

### 404 and error path tests

```typescript
it("returns 404 for non-existent resource", async () => {
  const res = await SELF.fetch("https://api.test/api/v1/items/no-such-id", { headers });
  expect(res.status).toBe(404);
});

it("returns 405 for unsupported method", async () => {
  const res = await SELF.fetch("https://api.test/api/v1/items", {
    method: "PATCH", headers,
  });
  expect([404, 405]).toContain(res.status);
});
```

## WebSocket / Durable Object tests

Workers that use Durable Objects with WebSocket hibernation need integration tests at both the HTTP upgrade seam and the message-handling seam.

### WebSocket upgrade via Miniflare

When using `@cloudflare/vitest-pool-workers` or Miniflare directly, test the full upgrade handshake:

```typescript
import { env, SELF } from "cloudflare:test";

it("upgrades to WebSocket and receives initial state", async () => {
  const res = await SELF.fetch("https://api.test/api/room/room-1", {
    headers: {
      Upgrade: "websocket",
      Connection: "Upgrade",
      Authorization: "Bearer test-token",
    },
  });

  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();

  // Collect messages
  const messages: string[] = [];
  ws.addEventListener("message", (event: { data: unknown }) => {
    if (typeof event.data === "string") messages.push(event.data);
  });

  // Send an event to the DO
  ws.send(JSON.stringify({ type: "JOIN", userId: "user-1" }));

  // Give the DO time to process
  await new Promise((r) => setTimeout(r, 50));

  // Verify server sent state update
  expect(messages.length).toBeGreaterThan(0);
  const update = JSON.parse(messages[0]);
  expect(update).toHaveProperty("type");

  ws.close();
});
```

### Testing multiple concurrent clients

```typescript
it("broadcasts state changes to all connected clients", async () => {
  // Connect two clients
  const [ws1, ws2] = await Promise.all([
    connectWebSocket("room-1", "user-1"),
    connectWebSocket("room-1", "user-2"),
  ]);

  const ws2Messages: string[] = [];
  ws2.addEventListener("message", (e: { data: unknown }) => {
    if (typeof e.data === "string") ws2Messages.push(e.data);
  });

  // Client 1 sends action
  ws1.send(JSON.stringify({ type: "INCREMENT" }));
  await new Promise((r) => setTimeout(r, 50));

  // Client 2 should receive the state update
  expect(ws2Messages.length).toBeGreaterThan(0);

  ws1.close();
  ws2.close();
});

async function connectWebSocket(roomId: string, userId: string) {
  const res = await SELF.fetch(`https://api.test/api/room/${roomId}`, {
    headers: {
      Upgrade: "websocket",
      Connection: "Upgrade",
      Authorization: `Bearer token-${userId}`,
    },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  return ws;
}
```

### FakeWebSocket for unit-testing DO handlers

When you need faster tests that skip the network layer and test DO logic directly:

```typescript
class FakeWebSocket {
  sent: string[] = [];
  closeCalls: Array<{ code: number; reason: string }> = [];
  private attachment: unknown;

  send(payload: string) { this.sent.push(payload); }
  close(code: number, reason: string) { this.closeCalls.push({ code, reason }); }
  serializeAttachment(value: unknown) { this.attachment = value; }
  deserializeAttachment() { return this.attachment; }
}
```

Use these to test `webSocketMessage`, `webSocketClose`, and `webSocketError` handlers on the DO class without Miniflare overhead. Combine with a fake `DurableObjectStorage` (in-memory Map) for state persistence tests.

### WebSocket checklist

- [ ] Upgrade returns 101 with valid auth
- [ ] Upgrade returns 401 without auth
- [ ] Client receives initial state after connect
- [ ] Client sends event → server processes → state updates
- [ ] Multiple clients receive broadcasts
- [ ] Client disconnect triggers cleanup (webSocketClose)
- [ ] Reconnection with checksum resumes without full state replay
- [ ] Binary message support (if applicable)

## Mocking outbound fetch

When your Worker calls external APIs, use `fetchMock` from `cloudflare:test` (an `undici` `MockAgent`) to intercept outbound requests without hitting real services.

```typescript
import { fetchMock } from "cloudflare:test";
import { beforeAll, afterEach, it, expect } from "vitest";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect(); // throw if an outbound request isn't mocked
});

afterEach(() => fetchMock.assertNoPendingInterceptors());

it("proxies to external API and transforms response", async () => {
  fetchMock
    .get("https://api.stripe.com")
    .intercept({ path: "/v1/charges/ch_123" })
    .reply(200, JSON.stringify({ id: "ch_123", amount: 2000, currency: "usd" }));

  const res = await SELF.fetch("https://api.test/api/v1/charges/ch_123", { headers });
  expect(res.status).toBe(200);

  const body = (await res.json()) as { chargeId: string; amount: number };
  expect(body.chargeId).toBe("ch_123");
  expect(body.amount).toBe(2000);
});

it("handles external API errors gracefully", async () => {
  fetchMock
    .get("https://api.stripe.com")
    .intercept({ path: "/v1/charges/ch_bad" })
    .reply(500, "Internal Server Error");

  const res = await SELF.fetch("https://api.test/api/v1/charges/ch_bad", { headers });
  expect(res.status).toBe(502); // or whatever your error mapping returns
});
```

Key rules:
- Always call `fetchMock.activate()` in `beforeAll` and `fetchMock.assertNoPendingInterceptors()` in `afterEach`
- `fetchMock.disableNetConnect()` ensures no unmocked requests leak through
- This only mocks fetch in the test runner Worker — auxiliary Workers need Miniflare's `fetchMock`/`outboundService` options

## Testing handler functions directly

For lightweight tests that skip the HTTP layer, use `createExecutionContext` and `waitOnExecutionContext`:

```typescript
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "./index";

it("calls fetch handler directly", async () => {
  const request = new Request("https://example.com/api/health");
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx); // waits for all ctx.waitUntil() promises
  expect(response.status).toBe(200);
});
```

## Testing scheduled handlers (Cron Triggers)

```typescript
import { env, createScheduledController, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "./index";

it("runs scheduled cleanup job", async () => {
  const ctrl = createScheduledController({
    scheduledTime: new Date(1000),
    cron: "0 0 * * *", // daily midnight
  });
  const ctx = createExecutionContext();
  await worker.scheduled(ctrl, env, ctx);
  await waitOnExecutionContext(ctx);

  // Verify side effect — e.g. expired rows cleaned up
  const remaining = await env.DB.prepare(
    "SELECT count(*) as cnt FROM sessions WHERE expired = 1"
  ).first<{ cnt: number }>();
  expect(remaining?.cnt).toBe(0);
});
```

## Testing Queue consumers

```typescript
import { env, createMessageBatch, createExecutionContext, getQueueResult } from "cloudflare:test";
import worker from "./index";

it("processes queue messages and acks", async () => {
  const batch = createMessageBatch("my-queue", [
    { id: "msg-1", timestamp: new Date(1000), body: { userId: "user-1", action: "signup" } },
    { id: "msg-2", timestamp: new Date(2000), body: { userId: "user-2", action: "signup" } },
  ]);
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  const result = await getQueueResult(batch, ctx);

  expect(result.ackAll).toBe(false);
  expect(result.explicitAcks).toStrictEqual(["msg-1", "msg-2"]);
  expect(result.retryMessages).toStrictEqual([]);
});

it("retries failed messages", async () => {
  const batch = createMessageBatch("my-queue", [
    { id: "msg-bad", timestamp: new Date(1000), body: { invalid: true } },
  ]);
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  const result = await getQueueResult(batch, ctx);

  expect(result.retryMessages).toStrictEqual(["msg-bad"]);
});
```

## Testing Durable Objects directly

Use `runInDurableObject` to reach inside a DO instance for seeding, spying, or asserting on persisted state:

```typescript
import { env, runInDurableObject, runDurableObjectAlarm, listDurableObjectIds } from "cloudflare:test";
import { Counter } from "./index";

it("increments and persists count", async () => {
  const id = env.COUNTER.newUniqueId();
  const stub = env.COUNTER.get(id);

  let response = await stub.fetch("https://example.com");
  expect(await response.text()).toBe("1");

  // Reach inside the DO to verify storage
  response = await runInDurableObject(stub, async (instance: Counter, state) => {
    expect(instance).toBeInstanceOf(Counter);
    expect(await state.storage.get<number>("count")).toBe(1);
    return instance.fetch(new Request("https://example.com"));
  });
  expect(await response.text()).toBe("2");
});

it("runs scheduled alarm", async () => {
  const id = env.COUNTER.newUniqueId();
  const stub = env.COUNTER.get(id);
  await stub.fetch("https://example.com/schedule-cleanup");

  const alarmRan = await runDurableObjectAlarm(stub);
  expect(alarmRan).toBe(true);
});

it("lists created DO instances (respects isolatedStorage)", async () => {
  const id = env.COUNTER.newUniqueId();
  const stub = env.COUNTER.get(id);
  await stub.fetch("https://example.com");

  const ids = await listDurableObjectIds(env.COUNTER);
  expect(ids.length).toBe(1);
  expect(ids[0].equals(id)).toBe(true);
});
```

## D1 migrations in tests

Use `applyD1Migrations` with `readD1Migrations` for projects using D1's migration system:

```typescript
// vitest.config.ts
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

export default defineWorkersConfig({
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    poolOptions: {
      workers: {
        miniflare: {
          d1Databases: { DB: "test-db" },
        },
      },
    },
  },
});
```

```typescript
// test/apply-migrations.ts
import { env, applyD1Migrations } from "cloudflare:test";
import migrations from "../migrations"; // readD1Migrations output injected via config

await applyD1Migrations(env.DB, migrations);
```

## Testing Workflows

Use workflow introspectors to control timing, mock steps, and assert outcomes:

```typescript
import { env, introspectWorkflowInstance, SELF } from "cloudflare:test";

it("completes approval workflow with mocked event", async () => {
  await using instance = await introspectWorkflowInstance(env.MY_WORKFLOW, "wf-123");

  await instance.modify(async (m) => {
    await m.disableSleeps(); // all sleeps resolve instantly
    await m.mockEvent({
      type: "user-approval",
      payload: { approved: true, approverId: "user-1" },
    });
  });

  await env.MY_WORKFLOW.create({ id: "wf-123" });

  await expect(instance.waitForStatus("complete")).resolves.not.toThrow();
  const output = await instance.getOutput();
  expect(output).toEqual({ success: true });
  // dispose is automatic via `await using`
});

it("handles step failure with retry", async () => {
  await using instance = await introspectWorkflowInstance(env.MY_WORKFLOW, "wf-456");

  await instance.modify(async (m) => {
    await m.disableSleeps();
    // Fail payment step once, then succeed on retry
    await m.mockStepError(
      { name: "process-payment" },
      new Error("Gateway timeout"),
      1, // fail only first attempt
    );
    await m.mockEvent({ type: "user-approval", payload: { approved: true } });
  });

  await env.MY_WORKFLOW.create({ id: "wf-456" });
  await expect(instance.waitForStatus("complete")).resolves.not.toThrow();
});
```

For workflows where instance IDs are unknown (created inside the Worker):

```typescript
import { env, introspectWorkflow, SELF } from "cloudflare:test";

it("captures all workflow instances triggered by fetch", async () => {
  await using introspector = await introspectWorkflow(env.MY_WORKFLOW);

  await introspector.modifyAll(async (m) => {
    await m.disableSleeps();
    await m.mockEvent({ type: "approval", payload: { approved: true } });
  });

  // Trigger workflow creation via HTTP
  await SELF.fetch("https://api.test/api/v1/start-batch");

  const instances = await introspector.get();
  for (const instance of instances) {
    await expect(instance.waitForStatus("complete")).resolves.not.toThrow();
  }
});
```

Workflow modifier methods:
- `disableSleeps(steps?)` — resolve `step.sleep()` / `step.sleepUntil()` instantly
- `mockStepResult(step, result)` — return value without running the step
- `mockStepError(step, error, times?)` — force step to throw (N times or forever)
- `forceStepTimeout(step, times?)` — simulate step timeout
- `mockEvent(event)` — satisfy a `step.waitForEvent()`
- `forceEventTimeout(step)` — simulate event timeout

Always dispose introspectors (`await using` or explicit `.dispose()`) to prevent state leaking between tests with `isolatedStorage`.

## Hyperdrive (Postgres) variant

When the Worker uses Hyperdrive instead of D1:

```typescript
// vitest.config.ts
export default defineWorkersConfig(async () => {
  return {
    test: {
      globalSetup: ["./src/__tests__/global-setup.ts"], // starts pgmock
      setupFiles: ["./src/__tests__/apply-migrations.ts"],
      poolOptions: {
        workers: ({ inject }) => {
          const connectionString = inject("pgmockConnectionString");
          return {
            wrangler: { configPath: "./wrangler.jsonc", environment: "development" },
            miniflare: {
              hyperdrives: { HYPERDRIVE: `${connectionString}/postgres` },
            },
            isolatedStorage: true,
            singleWorker: true,
          };
        },
      },
    },
  };
});
```

Binding verification uses Drizzle or raw SQL through the Hyperdrive binding instead of `env.DB.prepare()`.

## Integration with autonomous loops

### For /nightshift and /ralph-tdd

When the current task involves a Cloudflare Worker:
1. Check for existing `vitest.integration.config.*` — if missing, create one using the setup above
2. For each route touched by the current task, write integration tests **before** implementation (TDD)
3. Run `pnpm test:integration` as the primary feedback command
4. Integration tests count toward acceptance criteria — a route without integration tests is not done

### For /swarm

- **Feature agent**: Writes integration tests as part of TDD (red → green → refactor)
- **CRAP agent**: Flags untested routes/endpoints as high-CRAP targets
- **Mutation agent**: Runs Stryker against integration tests — surviving mutants in route handlers indicate weak assertions
- **Acceptance agent**: Integration tests ARE the acceptance layer for API Workers (no Playwright needed for pure API services)

## Test organization

```
test/
  integration/
    setup.ts                    # Schema + seed data
    auth.test.ts                # Auth middleware tests
    items.test.ts               # /api/v1/items CRUD
    items-validation.test.ts    # Input validation edge cases
    health.test.ts              # Health/status endpoints
```

Or colocated:

```
src/
  routes/
    items/
      index.ts
      __tests__/
        items.test.ts
```

## Gotchas

- **Check `.dev.vars` AND GitHub Actions secrets independently.** A test that passes locally with `.dev.vars` can fail in CI if GH Actions doesn't have the same secrets configured.
- **`isolatedStorage: true` means each test starts clean.** If you seed data in `beforeEach`, it only exists for that test. Don't rely on data from a previous test.
- **Miniflare bindings are real but local.** They behave like production bindings but data doesn't persist between test runs. Don't confuse Miniflare state with production state.
- **`wrangler.toml` vs `wrangler.jsonc`** — the vitest config must point to whichever config file your project actually uses. A mismatch means no bindings in tests.
- **Hyperdrive tests need a running Postgres.** Unlike D1 (which is SQLite-backed locally), Hyperdrive tests need pgmock or a real Postgres instance. The `globalSetup` file must start it before tests run.
- **`fetchMock` only mocks fetch in the test Worker.** If your Worker delegates to auxiliary Workers, those Workers' fetch calls are NOT mocked. Use Miniflare's `outboundService` for auxiliary Worker mocking.

## Checklist for each endpoint

- [ ] Happy path (correct input → expected output + binding state)
- [ ] Auth: missing, invalid, expired
- [ ] Validation: missing fields, wrong types, boundary values
- [ ] Not found (404)
- [ ] Idempotency where applicable (DELETE twice, PUT same data)
- [ ] Side effects verified in binding (D1 row, KV key, R2 object)
