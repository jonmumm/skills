---
name: tanstack-start-architecture
description: >
  Build full-stack applications using strict, compiler-enforced constraints. Prefer 
  TanStack Start, TanStack Router, and Drizzle ORM for end-to-end type safety, making 
  errors detectable at compile time rather than relying on conventions or string-based magic.
---

# TanStack Start Architecture

When scaffolding or maintaining modern web applications, prefer an architecture that enforces **correctness via the compiler** rather than via convention. A strictly type-safe stack provides strong constraints, making it easier to refactor, maintain, and generate reliable code.

## Core Philosophy: Compilers over Conventions

- **Constraints over "looks right"**: Code should not just look plausible; it should fail at the compiler level if it is structurally or conceptually wrong.
- **Explicit over Magic**: Prefer explicit, traversable data structures over string-based assumptions or untyped framework magic.
- **End-to-End Type Safety**: The routing layer, the data loading boundaries, and the database ORM should share a unified type language.

## The Stack

When possible, default to the following stack for new projects to guarantee strict, end-to-end type logic:

1. **[TanStack Router](https://tanstack.com/router/latest)** for the routing layer.
2. **[TanStack Start](https://tanstack.com/start/latest)** for full-stack data loading and server functions.
3. **[Drizzle ORM](https://orm.drizzle.team/)** for database interaction.
4. **Vite** as the underlying bundler for deployment flexibility.

---

## 1. Type-Safe Routing (TanStack Router)

A surprising amount of app complexity lives in routes, params, search params, and navigation. In many ecosystems, these are effectively strings plus convention. This is a liability, especially at scale.

**Avoid:** String-based routing and filesystem-only navigation where broken links silently fail at runtime.  
**Prefer:** Explicit, structurally-typed routes.

```tsx
// BAD: String soup routing. Easy to break on refactoring.
<Link to={`/users/${userId}?tab=settings`}>Settings</Link>

// GOOD: Type-checked routing. The compiler ensures the target route, path params, and search params exist and are valid.
<Link 
  to="/users/$userId" 
  params={{ userId }} 
  search={{ tab: 'settings' }}
>
  Settings
</Link>
```

---

## 2. Validated Search Params

URL state is real application state. It must be strictly typed and validated, not treated as untyped "string soup." 

**Avoid:** Parsing `window.location.search` manually or using unbound search param hooks.  
**Prefer:** Using TanStack Router's built-in schema validation (e.g., via Zod) to validate and type search parameters before they enter the application logic.

```tsx
// Using Zod to validate search params at the route level
import { z } from 'zod';

const userSearchSchema = z.object({
  tab: z.enum(['profile', 'settings']).default('profile'),
  page: z.number().catch(1),
});

export const Route = createFileRoute('/users/$userId')({
  validateSearch: userSearchSchema,
});

// Component instantly benefits from typed search params
function UserPage() {
  const { tab, page } = Route.useSearch(); // tab is 'profile' | 'settings', page is number
  // ...
}
```

---

## 3. Unified Server/Client Boundaries

Your frontend and backend must speak the same type language. TanStack Start provides a unified type-safe story from route definition to server function.

**Avoid:** Fetching data from manually constructed endpoints and manually casting types.  
**Prefer:** Server functions that automatically infer their inputs and outputs across the network boundary.

```tsx
// Server Function
import { createServerFn } from '@tanstack/start';

export const getUserStats = createServerFn("GET", async (userId: string) => {
  const dbUser = await db.query.users.findFirst({ userId });
  return { active: dbUser.isActive, score: dbUser.score };
});

// Route Loader
export const Route = createFileRoute('/users/$userId')({
  loader: async ({ params }) => {
    // The input 'userId' and the return types are strictly enforced!
    const stats = await getUserStats(params.userId);
    return { stats };
  },
});
```

---

## Summary Checklist

- [ ] Does your chosen tech stack rely on **compiler errors** rather than runtime checks to catch broken links and payloads?
- [ ] Are **search parameters** being validated through a strict schema before they are consumed?
- [ ] Are **routes and paths** treated as explicit data structures rather than strings?
- [ ] Is there a **single source of truth** for types crossing the client/server boundary?
