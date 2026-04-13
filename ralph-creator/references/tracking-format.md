# Tracking File Format

Two files track agent state across context windows.

## progress.md

Working memory. Delete after the ralph run is complete.

### Entry format

Append after each completed task:

```markdown
- **Task Title** — What was done. Key artifacts produced. Issues encountered. Files changed.
```

Keep entries concise. One line per task is ideal. Two lines if something notable happened.

### Example

```markdown
- **Initialize Hono app** — Created src/server.ts with cors + logger + error handler. Starts on port 3001. Express still running on 3000.
- **Add shared middleware** — Ported auth + rate limiter. Auth tests pass. Rate limiter needed adjustment: Hono uses c.header() not res.set().
```

## lessons.md

Persists across runs. Captures mistakes and patterns the agent should follow.

### Entry format

```markdown
## [CATEGORY] Short description

**Pattern:** What went wrong or what was learned
**Rule:** Concrete rule to follow going forward
```

### Categories

| Category | When |
|----------|------|
| `PROCESS` | Wrong task order, skipped verification, scope creep |
| `TOOLING` | Tool quirks, CLI gotchas, MCP issues |
| `DESIGN` | Wrong approach, bad abstraction |
| `TESTING` | Missing verification, false positives |

### Example

```markdown
## [TOOLING] Frame0 create_frame always makes portrait tablets

**Pattern:** create_frame with frameType "tablet" produces 768x1024 (portrait). Need update_shape to resize to 1024x768 for landscape.
**Rule:** Always call update_shape immediately after create_frame to set correct dimensions.
```
