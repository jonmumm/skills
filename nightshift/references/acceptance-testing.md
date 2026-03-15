# Acceptance Testing Guide

Acceptance tests are the MOST IMPORTANT artifact nightshift produces. They are
written BEFORE implementation, from the user's perspective, based on the spec.

## Philosophy

- Acceptance tests verify what the USER experiences, not what the CODE does
- They are the source of truth for "is this feature done?"
- If the acceptance test passes, the feature works. If it doesn't, it doesn't.
- Unit tests and type checking are important but secondary safety nets

## Platform Detection

Detect which test framework to use based on project structure:

```
Web app:
  - playwright.config.ts exists → Playwright
  - package.json has "playwright" in devDeps → Playwright
  - Fallback: check for cypress.config.ts → Cypress

iOS (Swift):
  - *.xcodeproj or *.xcworkspace exists → XCUITest
  - Look for existing UI test targets in the Xcode project

React Native (Expo):
  - .detoxrc.js or detox.config.js exists → Detox
  - package.json has "detox" in deps/devDeps → Detox
  - Check for existing e2e/ directory structure
```

## Writing Acceptance Tests

### Step 1: Read the spec

Extract every user-visible behavior from the spec. List them:

```
Spec: "User Login"
Behaviors:
1. User sees email and password fields
2. User can type in both fields
3. Submit button is disabled until both fields have content
4. Valid credentials → redirect to dashboard
5. Invalid credentials → error message "Incorrect email or password"
6. Network error → error message "Connection failed, please try again"
7. Password field masks input
8. User can toggle password visibility
```

### Step 2: Write one test per behavior

Each test should be:
- **Self-contained**: no shared state between tests
- **Readable**: a non-developer could understand what's being tested
- **Deterministic**: no timing-dependent assertions without explicit waits
- **Named descriptively**: the test name IS the acceptance criterion

### Step 3: Run tests → confirm RED

All tests should fail because the feature doesn't exist yet. If any test
passes, either the feature already exists (skip it) or the test is wrong.

### Step 4: Implement → confirm GREEN

After implementation, all acceptance tests should pass. If they don't,
the implementation is incomplete — keep going.

## Playwright Patterns

```typescript
import { test, expect } from '@playwright/test';

// Group by spec
test.describe('User Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows email and password fields', async ({ page }) => {
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('disables submit until both fields filled', async ({ page }) => {
    const submit = page.getByRole('button', { name: 'Sign in' });
    await expect(submit).toBeDisabled();

    await page.getByLabel('Email').fill('user@example.com');
    await expect(submit).toBeDisabled();

    await page.getByLabel('Password').fill('password123');
    await expect(submit).toBeEnabled();
  });

  test('redirects to dashboard on valid login', async ({ page }) => {
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('correctpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'Incorrect email or password'
    );
  });
});
```

### Key Playwright principles:
- Use semantic selectors: `getByRole`, `getByLabel`, `getByText` over `locator('.class')`
- Use `toHaveURL` for navigation assertions
- Use `waitFor` with explicit conditions, not `page.waitForTimeout`
- Test real user flows, not component internals

## XCUITest Patterns

```swift
import XCTest

final class UserLoginUITests: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = false
        app.launch()
        // Navigate to login if needed
    }

    func testShowsEmailAndPasswordFields() {
        XCTAssertTrue(app.textFields["email-field"].exists)
        XCTAssertTrue(app.secureTextFields["password-field"].exists)
    }

    func testDisablesSubmitUntilBothFieldsFilled() {
        let signIn = app.buttons["sign-in-button"]
        XCTAssertFalse(signIn.isEnabled)

        app.textFields["email-field"].tap()
        app.textFields["email-field"].typeText("user@example.com")
        XCTAssertFalse(signIn.isEnabled)

        app.secureTextFields["password-field"].tap()
        app.secureTextFields["password-field"].typeText("password123")
        XCTAssertTrue(signIn.isEnabled)
    }

    func testRedirectsToDashboardOnValidLogin() {
        app.textFields["email-field"].tap()
        app.textFields["email-field"].typeText("user@example.com")
        app.secureTextFields["password-field"].tap()
        app.secureTextFields["password-field"].typeText("correctpassword")
        app.buttons["sign-in-button"].tap()

        let dashboard = app.navigationBars["Dashboard"]
        XCTAssertTrue(dashboard.waitForExistence(timeout: 5))
    }
}
```

### Key XCUITest principles:
- Use `accessibilityIdentifier` (set via `.accessibilityIdentifier("id")` in SwiftUI)
- Use `waitForExistence(timeout:)` for async state changes
- Keep tests independent — each test starts from a known state
- Use `XCTContext.runActivity(named:)` for multi-step flows

## Detox Patterns

```typescript
describe('User Login', () => {
  beforeEach(async () => {
    await device.reloadReactNative();
    // Navigate to login if needed
  });

  it('shows email and password fields', async () => {
    await expect(element(by.id('email-field'))).toBeVisible();
    await expect(element(by.id('password-field'))).toBeVisible();
  });

  it('disables submit until both fields filled', async () => {
    // Detox doesn't have isEnabled — check via traits or visual state
    await element(by.id('email-field')).typeText('user@example.com');
    await element(by.id('password-field')).typeText('password123');
    await element(by.id('sign-in-button')).tap();
    // If submit was disabled, we'd still be on login screen
    await expect(element(by.id('dashboard-screen'))).toBeVisible();
  });

  it('shows error on invalid credentials', async () => {
    await element(by.id('email-field')).typeText('user@example.com');
    await element(by.id('password-field')).typeText('wrongpassword');
    await element(by.id('sign-in-button')).tap();

    await waitFor(element(by.id('error-message')))
      .toBeVisible()
      .withTimeout(5000);
    await expect(element(by.id('error-message'))).toHaveText(
      'Incorrect email or password'
    );
  });
});
```

### Key Detox principles:
- Use `testID` props on all interactive React Native elements
- Use `waitFor(...).toBeVisible().withTimeout()` for async state
- Prefer `toExist()` over `toBeVisible()` for full-screen containers
- Use `by.label()` for Pressable with `accessibilityLabel`
- Never use `device.disableSynchronization()` unless absolutely necessary
- If the app uses animations, consider disabling sync in detox config

## Post-Implementation Quality Gates

After acceptance tests are green, also run:

1. **Unit tests** — `pnpm test` (ensures no regressions)
2. **Type check** — `pnpm typecheck` (ensures type safety)
3. **Lint** — `pnpm lint` (ensures code style)
4. **Full E2E suite** — not just the new tests, ALL E2E tests (regression)

Only after ALL of these pass does the agent commit.

## Hardening (if time allows)

After the main acceptance + unit test loop, if the agent has time remaining:

1. **Mutation testing** — Run Stryker on files touched by this task.
   Kill survivors by adding targeted tests. Target: ≥ 95% mutation score.
2. **CRAP scoring** — Check CRAP scores on modified functions.
   Refactor any function scoring > 30.

These are valuable but NEVER at the expense of acceptance test coverage.
Ship the feature with green acceptance tests first, harden second.
