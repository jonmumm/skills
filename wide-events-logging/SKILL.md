---
name: wide-events-logging
description: >
  Implement observability using the Wide Events (Canonical Log Lines) pattern. 
  Instead of scattering logs throughout a request, accumulate high-cardinality context 
  and emit a single, highly-dimensional structured event per service boundary.
---

# Wide Events Logging (Canonical Log Lines)

Logging should not be a "debugging diary" where you sprinkle `console.log("doing X")` across your codebase. This creates log chaos: thousands of fragmented strings that are impossible to correlate or query effectively during an incident.

Instead, when instrumenting applications, implement **Wide Events** (also known as Canonical Log Lines). 

## Core Philosophy

1. **One Request, One Log Line**: Emit exactly one comprehensive structured event per request, per service.
2. **Accumulate Context**: Initialize an event object at the start of a request (usually in middleware), pass it down (or attach to context), enrich it with business data as the request executes, and log it in a `finally` block or at the network boundary.
3. **High Cardinality**: Strongly prefer adding attributes with millions of possible values (e.g., `user_id`, `request_id`, `cart_id`) because these are the most valuable fields for pinpointing specific failures.
4. **High Dimensionality**: Don't just log HTTP status and duration. Log feature flags, user subscription tiers, database query counts, attempt numbers, and precise decline codes. 

## 1. Building the Wide Event

### Anti-Pattern: The Debugging Diary
```typescript
// BAD: Fragmented, low-context string logging
app.post('/checkout', async (req, res) => {
  logger.info(`Request received for user ${req.user.id}`);
  const cart = await getCart(req.user.id);
  logger.debug(`Loaded cart with ${cart.items.length} items`);
  
  try {
    await processPayment(cart);
    logger.info("Payment successful");
    res.json({ success: true });
  } catch (e) {
    logger.error("Payment failed", e);
    res.status(500).send("Error");
  }
});
```

### Pattern: The Type-Safe Wide Event
```typescript
interface WideEvent {
  // Core Routing & Identity
  request_id: string;
  timestamp: string;
  method: string;
  path: string;
  service?: string;
  deployment_id?: string;
  
  // Top-Level Outcomes
  status_code?: number;
  outcome?: 'success' | 'error';
  duration_ms?: number;
  
  // Business Context Domains 
  error?: {
    type: string;
    message: string;
    code?: string;
    retriable: boolean;
    stripe_decline_code?: string;
  };
  user?: {
    id: string;
    subscription: string;
    lifetime_value_cents: number;
  };
  feature_flags?: Record<string, boolean>;
  cart?: {
    item_count: number;
    total_cents: number;
  };
  payment?: {
    provider: string;
    latency_ms: number;
    attempt: number;
  };
}

// GOOD: Accumulate context using explicit type contracts instead of "any"
export async function wideEventMiddleware(ctx, next) {
  const startTime = Date.now();
  
  // 1. Initialize the wide event observing the type interface
  const event: Partial<WideEvent> = {
    request_id: ctx.get('requestId'),
    timestamp: new Date().toISOString(),
    method: ctx.req.method,
    path: ctx.req.path,
    service: process.env.SERVICE_NAME,
    deployment_id: process.env.DEPLOYMENT_ID,
  };

  ctx.set('wideEvent', event);

  try {
    await next();
    event.status_code = ctx.res.status;
    event.outcome = 'success';
  } catch (error) {
    event.status_code = error.status || 500;
    event.outcome = 'error';
    event.error = {
      type: error.name,
      message: error.message,
      code: error.code,
      retriable: error.retriable ?? false,
    };
    throw error;
  } finally {
    event.duration_ms = Date.now() - startTime;
    // 2. Emit the single canonical log line
    logger.info(event);
  }
}
```

## 2. Enriching with Business Context

As the request travels through your application, continually attach business context to the active event. By the time the event is emitted, it should answer exactly *who* did *what*, under *what conditions*, and *why* it failed.

```typescript
app.post('/checkout', async (ctx) => {
  const event = ctx.get('wideEvent') as Partial<WideEvent>;
  const user = ctx.get('user');

  // Add domain-specific context
  event.user = {
    id: user.id,
    subscription: user.plan,
    lifetime_value_cents: user.ltv,
  };
  event.feature_flags = user.flags; // e.g., { new_checkout: true }

  const cart = await getCart(user.id);
  event.cart = {
    item_count: cart.items.length,
    total_cents: cart.total,
  };

  const payment = await processPayment(cart, user);
  
  event.payment = {
    provider: payment.provider,
    latency_ms: payment.latencyMs,
    attempt: payment.attemptNumber,
  };

  if (payment.error) {
    event.error = {
      type: 'PaymentError',
      stripe_decline_code: payment.error.declineCode, // High-value debugging field
    };
  }

  return ctx.json({ orderId: payment.orderId });
});
```

## 3. Intelligent Tail Sampling

If logging wide events becomes too expensive at scale, **do not use random sampling** (e.g., arbitrarily dropping 95% of logs). Random sampling drops the specific errors you need to investigate.

Instead, implement **Tail Sampling**: Make the decision to keep or drop the event *after* the request completes.

```typescript
function shouldSample(event: WideEvent): boolean {
  // 1. ALWAYS trace errors
  if (event.status_code >= 500 || event.outcome === 'error') return true;
  
  // 2. ALWAYS trace performance outliers (e.g., p99 latency)
  if (event.duration_ms > 2000) return true;
  
  // 3. ALWAYS trace VIPs or special segments
  if (event.user?.subscription === 'enterprise') return true;
  
  // 4. Trace specific feature boundaries
  if (event.feature_flags?.new_checkout_flow) return true;
  
  // 5. Randomly sample the remaining "happy" traffic
  return Math.random() < 0.05; // Keep 5% of normal fast traffic
}
```

## Summary Checklist
- [ ] Are you emitting one "Canonical Log Line" (Wide Event) per application boundary?
- [ ] Is context (user ID, session ID, tenant ID) attached to the log rather than scattered across multiple `console.log` statements?
- [ ] Are business metrics (cart totals, iteration counts, attempt numbers) serialized in the event payload?
- [ ] Are you capturing feature flag states to correlate bugs with active experiments?

## Cloudflare Workers: the sre-agent contract

Every Cloudflare project follows this, so `/sre-agent` can read its logs. The agent queries Workers Logs
for `error`-level events and groups them into issues by **`error.type` + `error.message`**.

1. **Wrangler config.** `observability = { enabled = true, head_sampling_rate = 1 }` and a
   `version_metadata` binding named `CF_VERSION_METADATA` (gives `version`).
2. **One event per unit of work.** An HTTP request, a room action handled by a Durable Object, a DO
   alarm, a queue or cron job, or one client event received from a browser.
3. **Shape.** Pass the object itself to `console.log` (or `console.error`), not a string:
   Workers Logs extracts and indexes its fields.
   ```ts
   type WideEvent = {
     event: string;            // stable, dot-namespaced: "http.request", "room.action", "room.alarm", "client.error"
     service: string;          // the Worker's name
     version: string;          // env.CF_VERSION_METADATA.id
     source: "server" | "client";
     outcome: "ok" | "error";
     duration_ms?: number;
     request_id?: string; room_id?: string; session_id?: string;  // ids go in fields
     error?: { type: string; message: string; stack?: string; code?: string };
     // plus business context: game, phase, round, action, players, device, build …
   };
   ```
4. **Errors.** Emit with `console.error` and fill `error`. `error.message` is the grouping key, so
   keep it stable: `"Room not found"`, never `"Room r-91 not found"`. Put the id in `room_id`.
   `error.type` is the class or a domain name (`"TypeError"`, `"InvalidMove"`).
5. **Privacy.** Kids play these games. Never log display names, profile names, emails, tokens, OGS
   auth tokens or free text a player typed. Ids only.
6. **Client events.** Browsers post batches to the game's own Worker (`POST /events`). The Worker
   parses them with Zod and re-emits each as a wide event with `source: "client"`,
   `event: "client.<type>"`. Client errors carry `error.{type,message,stack}`. A previous session that
   never closed is `console.error` with `error.type: "PreviousSessionCrashed"`; WebGL context loss
   is `error.type: "WebGLContextLost"`. Use `@open-game-system/telemetry-kit` once it is published
   (it is extracted from juneaus-number-quest's `src/telemetry.ts`); do not hand-roll a new one.
7. **Counts (optional).** An Analytics Engine binding `EVENTS`, written from the same emit function:
   `indexes: [service]`, `blobs: [event, outcome, version, error?.type ?? "", device ?? ""]`,
   `doubles: [duration_ms ?? 0, 1]`. It is sampled, so use it for rates and spike or silence
   checks, never for debugging detail.
8. **Test it at the seam.** A failing handler emits exactly one `console.error` wide event with
   `error.type` and `error.message`, and no names or tokens.
