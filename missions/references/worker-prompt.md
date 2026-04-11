# Worker Agent Prompt

Workers are the implementation engine of a mission. Each worker gets a fresh
context containing ONLY what's relevant to its specific feature. Workers never
see other features' code, validator feedback, or orchestrator reasoning.

## Context Injection

The dispatcher injects these into the worker prompt at launch:

| Variable | Source |
|---|---|
| `feature_spec` | Extracted from milestone features file |
| `milestone_id` | Current milestone |
| `feature_id` | This feature's ID (F001, FIX-M1-001, etc.) |
| `guidelines` | `guidelines.md` — coding standards, patterns |
| `knowledge` | `knowledge-base.md` — accumulated cross-feature context |
| `lessons` | `lessons.md` — cross-mission learnings |
| `PM` | Detected package manager |
| `TEST_CMD`, `LINT_CMD`, etc. | Detected feedback commands |
| `PLATFORM` | Detected platform (web, ios-swift, react-native) |
| `RUN_DIR` | Path to current run directory |
| `MISSIONS_DIR` | Path to .missions/ directory |

## Worker Lifecycle

```
1. Read feature spec + guidelines + knowledge base
2. Write tests FIRST (red):
   ├── Integration tests (~70%) — real boundaries, real behavior
   ├── Unit tests (~15%) — complex pure logic only
   └── E2E tests (~15%) — critical journeys + screenshots
3. Run tests → confirm RED
4. Implement minimal code to pass tests
5. Refactor if needed (green → refactor)
6. Run full verification suite (lint + typecheck + tests)
7. Commit with descriptive message
8. Exit with signal
```

## Signals

| Signal | Meaning |
|---|---|
| `<promise>COMPLETE</promise>` | Feature implemented, tests pass |
| `<promise>BLOCKED:reason</promise>` | Cannot proceed, needs infrastructure/config |
| `<promise>DECIDE:question</promise>` | Ambiguous spec, needs human clarification |

## Anti-Patterns (enforced)

- **Don't mock your own modules.** Mock external services (Stripe, push providers) only.
- **Don't modify existing tests.** If new code breaks existing tests, the new code is wrong.
- **Don't implement beyond scope.** Only the feature spec, nothing extra.
- **Don't add backwards-compatibility shims.** No migration layers unless spec requires it.
- **Don't create abstractions for one-time operations.** Three similar lines > premature helper.
- **Parse at the boundary.** Zod/Codable for external data. No `any`, no `as` casting.

## Fix Feature Workers

Fix features follow the same lifecycle as regular features. The key difference:

- Fix features are created by the orchestrator from validator findings
- They describe WHAT to fix without revealing HOW the validator found it
- This prevents the worker from being biased by validator reasoning
- Fix features always include assertion IDs so the worker knows the behavioral target

## Screenshot Capture

Workers writing E2E tests MUST capture screenshots at key checkpoints:

```typescript
// Web (Playwright)
await page.screenshot({ path: '.missions/runs/<ts>/captures/<feature-id>/checkpoint.png' });

// iOS (XCUITest)
let attachment = XCTAttachment(screenshot: app.screenshot())
attachment.name = "checkpoint"
add(attachment)

// React Native (Detox)
await device.takeScreenshot('checkpoint');
```

These screenshots are consumed by contract validators to verify visual behavior.

## Heartbeat

Workers MUST update the heartbeat file every ~5 tool calls:

```bash
echo "HH:MM:SS | WORKER: F001 | STEP: writing integration tests | TESTS: 12/15" > .missions/HEARTBEAT
```

This is the primary visibility mechanism for humans monitoring a mission.
