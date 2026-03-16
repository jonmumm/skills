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

## Checklist for each endpoint

- [ ] Happy path (correct input → expected output + binding state)
- [ ] Auth: missing, invalid, expired
- [ ] Validation: missing fields, wrong types, boundary values
- [ ] Not found (404)
- [ ] Idempotency where applicable (DELETE twice, PUT same data)
- [ ] Side effects verified in binding (D1 row, KV key, R2 object)
