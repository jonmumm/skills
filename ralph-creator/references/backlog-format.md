# Backlog Format

The backlog is a markdown checklist that the agent works through one item at a time.

## Structure

```markdown
# {{Title}} Backlog

{{Brief description of the overall goal.}}

Context: {{list key spec docs or references}}

## Phase 1: {{Phase Name}}

{{Optional phase-level notes, constraints, or setup instructions.}}

- [ ] **Task title** — Detailed description of what to do. Include specific inputs, expected outputs, file paths, tool usage, and acceptance criteria. Enough detail that a fresh Claude instance can execute without asking questions.

- [ ] **Next task** — Same level of detail.

## Phase 2: {{Phase Name}}

- [ ] **Another task** — Description.
```

## Rules

1. **One checkbox per task** — Each `- [ ]` is one iteration of work
2. **Bold the title** — `**Title**` followed by ` — ` and description
3. **Self-contained descriptions** — A fresh context window reads only this file + progress + lessons. Include everything needed.
4. **Order by dependency** — Tasks that unblock others come first
5. **Phase grouping** — Group related tasks into phases. Phases run in order.
6. **Size for one context window** — If a task feels like it needs multiple iterations, split it into subtasks

## Task Sizing Guide

| Too small | Right size | Too large |
|-----------|-----------|-----------|
| "Rename a variable" | "Build the login form with email/password fields, validation, and submit button" | "Build the entire auth system" |
| "Add one CSS property" | "Style the dashboard card component with header, body, and footer sections" | "Style the whole app" |
| "Fix a typo" | "Write unit tests for the payment service covering happy path, insufficient funds, and network errors" | "Write all tests" |

## Example

```markdown
# API Migration Backlog

Migrate REST endpoints from Express to Hono. Keep existing test coverage green.

Context: `docs/api-spec.yaml`, `src/routes/`

## Phase 1: Setup

- [ ] **Initialize Hono app** — Create src/server.ts with Hono app instance. Add middleware: cors, logger, error handler. Verify it starts with `npm run dev`. Keep Express running in parallel on a different port.

- [ ] **Add shared middleware** — Port auth middleware from src/middleware/auth.ts to Hono format. Port rate limiter. Both should pass existing integration tests.

## Phase 2: Endpoints

- [ ] **Migrate /users endpoints** — Port GET /users, GET /users/:id, POST /users, PUT /users/:id, DELETE /users/:id. Match request/response shapes from api-spec.yaml. Run existing tests against new endpoints.

- [ ] **Migrate /orders endpoints** — Port all /orders routes. Include pagination support. Run existing tests.

## Phase 3: Cutover

- [ ] **Remove Express** — Delete Express app, update package.json scripts, remove express dependency. All tests must pass against Hono.
```
