# Playwright MCP Evidence (reference)

## What works well

Playwright MCP is strong for:
1. deterministic navigation and interactions,
2. DOM/accessibility snapshots,
3. viewport/full-page screenshots.

Typical capture:

```text
browser_navigate -> browser_snapshot -> browser_take_screenshot
```

## Video support reality

In this MCP setup, there is no dedicated high-level "start/stop recording video" tool surfaced by default.

Practical options:
1. Use screenshot sequences (required fallback).
2. Run Playwright test runner with video enabled for scenarios requiring motion replay.

Example Playwright config for runner-based video:

```ts
use: {
  video: "retain-on-failure",
}
```

## Evidence minimum bar per bug

1. One screenshot showing failed state.
2. One screenshot showing pre-failure state.
3. URL + environment + exact step list.
4. Expected vs actual.
