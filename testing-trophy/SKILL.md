---
name: testing-trophy
description: "Kent C. Dodds' Testing Trophy: write more integration tests, fewer unit tests, confidence over coverage. Covers React (Storybook + play functions), Cloudflare Workers (vitest-pool-workers + D1), and Swift (XCTest UI + snapshot). Use when deciding test strategy, writing new tests, or reviewing test quality."
---

# Testing Trophy

You follow Kent C. Dodds' Testing Trophy philosophy. The trophy shape means:

```
        🏆
      E2E Tests        ← Few, slow, high confidence
    Integration Tests   ← MOST tests live here
   Unit Tests           ← Some, for complex logic only
 Static Analysis        ← TypeScript, ESLint, tsc
```

**The key insight:** Write tests that give you **confidence your app works** for users. Integration tests hit the sweet spot — they test real behavior through real boundaries without the brittleness of E2E or the false confidence of isolated unit mocks.

## Core Principles

1. **Test behavior, not implementation.** Assert on what the user sees or what the API returns — not internal state.
2. **Don't mock what you own.** Mock external services (Stripe, Expo Push), not your own modules.
3. **One test > ten mocks.** A single integration test through the real stack catches more bugs than ten unit tests with mocked dependencies.
4. **The more your tests resemble how your software is used, the more confidence they give you.**
5. **Coverage is a side effect, not a goal.** High coverage with bad tests is worse than moderate coverage with good tests.

## When to Use Each Level

| Level | When | Example |
|-------|------|---------|
| **Static** | Always — it's free | `tsc --noEmit`, ESLint, Zod schemas |
| **Unit** | Complex pure logic, algorithms, state machines | Scoring functions, parsers, reducers |
| **Integration** | **Default for everything else** | API routes with real D1, React components with real state |
| **E2E** | Critical user journeys, smoke tests | "User can create a game and invite players" |

## React: Storybook + Play Functions as Integration Tests

Storybook play functions ARE integration tests. They render real components, interact with real DOM, and assert on real behavior — in a real browser.

### Pattern: Component Integration via Play Functions

```typescript
// CastButton.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { within, userEvent, expect } from '@storybook/test';
import { CastButton } from './CastButton';
import { CastProvider } from '@open-game-system/cast-kit-react';

const meta: Meta<typeof CastButton> = {
  component: CastButton,
  decorators: [
    (Story) => (
      <CastProvider>
        <Story />
      </CastProvider>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof CastButton>;

// Story IS the test — play function exercises real behavior
export const ShowsCastAvailable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Real component renders with real provider
    const button = await canvas.findByRole('button', { name: /cast/i });
    await expect(button).toBeVisible();

    // Interact like a user
    await userEvent.click(button);

    // Assert on what the user sees
    await expect(canvas.getByText(/available/i)).toBeVisible();
  },
};

export const ConnectedState: Story = {
  parameters: {
    // Mock the bridge state, not the component internals
    castState: {
      isAvailable: true,
      session: { status: 'connected', deviceName: 'Living Room TV' },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/connected/i)).toBeVisible();
    await expect(canvas.getByText(/Living Room TV/i)).toBeVisible();
  },
};
```

### Why This Beats Unit Tests

```typescript
// ❌ BAD: Unit test with mocks — tests implementation, not behavior
test('CastButton calls dispatch with SHOW_CAST_PICKER', () => {
  const mockDispatch = vi.fn();
  vi.mock('~/hooks/useCastDispatch', () => ({ useCastDispatch: () => mockDispatch }));
  render(<CastButton />);
  fireEvent.click(screen.getByRole('button'));
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'SHOW_CAST_PICKER' });
});

// ✅ GOOD: Integration test via Storybook play — tests real behavior
export const TapShowsPicker: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    // Assert on what appears, not what was called
    await expect(canvas.getByText(/select a device/i)).toBeVisible();
  },
};
```

### Running Storybook Tests in CI

```bash
# Build Storybook, then run all play functions as tests
npx storybook build
npx test-storybook --ci
```

Reference: Use with `/react-composable-components` and `/dont-use-use-effect` skills.

## Cloudflare Workers: vitest-pool-workers + Real D1

`@cloudflare/vitest-pool-workers` runs tests **inside the real Workers runtime** with real bindings. No mocks needed for D1, KV, R2.

### Pattern: Full-Stack Integration Test

```typescript
// test/integration/notifications.test.ts
import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

describe("Notification Flow — Full Integration", () => {
  beforeEach(async () => {
    // Real D1 — clean between tests
    await env.DB.prepare("DELETE FROM devices").run();
  });

  it("registers device, sends notification end-to-end", async () => {
    // Step 1: Register device (real D1 insert)
    const registerRes = await SELF.fetch("https://api.test/api/v1/devices/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ogsDeviceId: "device-1",
        platform: "ios",
        pushToken: "ExponentPushToken[xxx]",
      }),
    });
    expect(registerRes.status).toBe(200);
    const { deviceToken } = await registerRes.json();

    // Verify in real D1
    const device = await env.DB.prepare(
      "SELECT * FROM devices WHERE ogs_device_id = ?"
    ).bind("device-1").first();
    expect(device.push_token).toBe("ExponentPushToken[xxx]");

    // Step 2: Send notification (real auth + real D1 lookup)
    const sendRes = await SELF.fetch("https://api.test/api/v1/notifications/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-api-key",
      },
      body: JSON.stringify({
        deviceToken,
        notification: { title: "Game Starting!", body: "Join now" },
      }),
    });

    // Push provider may fail in test env — that's fine
    // What matters: auth passed, D1 lookup worked, request reached the provider
    expect([200, 502]).toContain(sendRes.status);
  });
});
```

### Setup: vitest.integration.config.mts

```typescript
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: {
          OGS_JWT_SECRET: "test-secret",
        },
      },
    }),
  ],
  test: {
    globals: true,
    include: ["test/integration/**/*.test.ts"],
    setupFiles: ["./test/integration/setup.ts"],
  },
});
```

### Setup: Apply D1 Schema

```typescript
// test/integration/setup.ts
import { env } from "cloudflare:test";

const schema = `
CREATE TABLE IF NOT EXISTS devices (...);
CREATE TABLE IF NOT EXISTS api_keys (...);
`;

for (const stmt of schema.split(";").filter(s => s.trim())) {
  await env.DB.prepare(stmt).run();
}

// Seed test data
await env.DB.prepare(
  "INSERT OR IGNORE INTO api_keys (key, game_id, game_name) VALUES (?, ?, ?)"
).bind("test-api-key", "test-game", "Test Game").run();
```

### Why This Beats Mocked Unit Tests

```typescript
// ❌ BAD: Mocked D1 — doesn't test real SQL, real bindings
const mockDB = { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first: vi.fn() })) })) };
const res = await app.request("/api/v1/devices/register", {}, { DB: mockDB });
expect(mockDB.prepare).toHaveBeenCalled(); // Tests mock wiring, not behavior

// ✅ GOOD: Real Workers runtime, real D1
const res = await SELF.fetch("https://api.test/api/v1/devices/register", { ... });
const row = await env.DB.prepare("SELECT * FROM devices WHERE ...").first();
expect(row.push_token).toBe("ExponentPushToken[xxx]"); // Tests real behavior
```

Reference: Use with `/workers-integration-testing`, `/seam-tester`, and `/workers-best-practices` skills.

## Swift: XCTest UI Tests as Integration Tests

Swift's equivalent of Storybook play functions is **XCTest UI Testing** combined with **SwiftUI Previews + Snapshot Tests**.

### Pattern: XCTest UI Integration Tests

```swift
// GameSetupUITests.swift
import XCTest

final class GameSetupUITests: XCTestCase {
    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--ui-testing"]
        app.launch()
    }

    func testCastButtonAppearsWhenDeviceAvailable() throws {
        // Navigate to game setup
        app.buttons["Create Game"].tap()

        // Cast button should appear (real UI, real state)
        let castButton = app.buttons["Cast to TV"]
        XCTAssertTrue(castButton.waitForExistence(timeout: 5))
        XCTAssertTrue(castButton.isEnabled)
    }

    func testCastButtonShowsDevicePicker() throws {
        app.buttons["Create Game"].tap()
        app.buttons["Cast to TV"].tap()

        // Device picker sheet should appear
        let picker = app.sheets["Select a device"]
        XCTAssertTrue(picker.waitForExistence(timeout: 3))
        XCTAssertTrue(picker.staticTexts["Living Room TV"].exists)
    }
}
```

### Pattern: SwiftUI Preview + Snapshot Testing

```swift
// Using swift-snapshot-testing (pointfreeco)
import SnapshotTesting
import SwiftUI

final class CastButtonSnapshotTests: XCTestCase {
    func testCastButtonStates() {
        // Available state
        assertSnapshot(
            of: CastButton(state: .available(deviceCount: 2)),
            as: .image(layout: .fixed(width: 200, height: 44))
        )

        // Connected state
        assertSnapshot(
            of: CastButton(state: .connected(deviceName: "Living Room TV")),
            as: .image(layout: .fixed(width: 200, height: 44))
        )

        // Connecting state
        assertSnapshot(
            of: CastButton(state: .connecting),
            as: .image(layout: .fixed(width: 200, height: 44))
        )
    }
}
```

### Testing Trophy for Swift

| Level | Tool | What |
|-------|------|------|
| Static | SwiftLint, Swift compiler | Type safety, conventions |
| Unit | XCTest | Pure logic: scoring, parsing, state machines |
| Integration | **XCTest UI Tests** | Real app, real navigation, real state |
| E2E | XCTest UI + real backend | Full user journeys with real API |

### React Native (Expo) Equivalent: Detox

For React Native apps, **Detox** is the integration test layer:

```typescript
// e2e/cast-flow.test.ts
import { by, device, element, expect, waitFor } from 'detox';

describe('Cast Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it('shows cast button when Chromecast is available', async () => {
    await element(by.text('Trivia Jam')).tap();
    await waitFor(element(by.id('castButton')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('opens device picker on cast button tap', async () => {
    await element(by.id('castButton')).tap();
    await expect(element(by.text('Select a device'))).toBeVisible();
  });
});
```

## Anti-Patterns to Avoid

### 1. Testing Implementation Details
```typescript
// ❌ Tests mock wiring, not behavior
expect(mockDispatch).toHaveBeenCalledWith({ type: 'START_CASTING' });

// ✅ Tests what the user sees
await expect(canvas.getByText('Connected to Living Room TV')).toBeVisible();
```

### 2. Excessive Mocking
```typescript
// ❌ Everything is mocked — test proves nothing
vi.mock('./database');
vi.mock('./auth');
vi.mock('./notifications');
const result = await handler(mockReq);
expect(mockDB.insert).toHaveBeenCalled();

// ✅ Real stack, real assertions
const res = await SELF.fetch("https://api.test/...", { ... });
const row = await env.DB.prepare("SELECT ...").first();
expect(row).toBeTruthy();
```

### 3. Testing Library Internals
```typescript
// ❌ Testing that React rendered correctly
expect(wrapper.find('CastButton').props().isAvailable).toBe(true);

// ✅ Testing that the button is visible to the user
await expect(screen.getByRole('button', { name: /cast/i })).toBeVisible();
```

### 4. Snapshot Abuse
```typescript
// ❌ Giant snapshot that breaks on every CSS change
expect(component).toMatchSnapshot();

// ✅ Targeted snapshot of specific states
assertSnapshot(of: CastButton(state: .connected("TV")), as: .image(...));
```

## Related Skills

- `/seam-tester` — Integration tests at system boundaries
- `/workers-integration-testing` — Cloudflare Workers with vitest-pool-workers
- `/mutation-testing` — Verify test quality after writing integration tests
- `/tdd` — Red-green-refactor with integration-first approach
- `/e2e-testing-patterns` — Playwright/Cypress for the top of the trophy
- `/react-composable-components` — Components that are easy to integration-test
- `/dont-use-use-effect` — Cleaner React = easier to test
- `/expo-testing` — Detox for React Native integration tests
- `/design-principle-enforcer` — SOLID code is testable code

## Recommended Test Distribution

For a typical web app with API + frontend:

```
Static:      TypeScript strict + ESLint          (free, always on)
Unit:        ~15% of tests                       (complex business logic only)
Integration: ~70% of tests                       (API routes, components, flows)
E2E:         ~15% of tests                       (critical user journeys)
```

This gives maximum confidence with minimum maintenance burden.
