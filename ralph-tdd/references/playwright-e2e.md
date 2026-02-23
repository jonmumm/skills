# Playwright E2E (reference)

Use when the project has Playwright E2E tests: writing tests, fixing flaky tests, or running E2E in the feedback loop.

## Running tests

```bash
npx playwright test
npx playwright test --headed
npx playwright test --project=chromium
npx playwright show-report
```

## Selector priority (prefer role-based)

```typescript
// 1. Role-based (BEST)
await page.getByRole('button', { name: 'Submit' });
await page.getByRole('textbox', { name: 'Email' });
await page.getByLabel('Email address');
await page.getByPlaceholder('Enter email');

// 2. Test ID (stable)
await page.getByTestId('submit-button');

// 3. Text (when unique)
await page.getByText('Welcome back');

// 4. CSS/locator (last resort)
await page.locator('.submit-btn');
```

Avoid: `waitForTimeout()`, brittle CSS classes, `first()`/`nth()` without reason. Use auto-waiting and `expect(locator).toBeVisible()`.

## Config (playwright.config.ts)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

## API mocking

```typescript
await page.route('**/api/users', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 1, name: 'Alice' }]) })
);
await page.goto('/users');
```

## Debugging flaky tests

- Use `getByRole`/`getByLabel` (auto-wait); avoid raw `click()` on CSS selectors.
- Wait for network when needed: `await page.waitForResponse('**/api/user');` then assert.
- Isolate tests: no shared state; use `beforeEach` or fixtures.
- Debug: `npx playwright test --headed`, `PWDEBUG=1 npx playwright test`, `page.pause()`.

## Page Object (optional)

```typescript
// pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}
  email = this.page.getByLabel('Email');
  password = this.page.getByLabel('Password');
  submit = this.page.getByRole('button', { name: 'Log in' });
  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
```

## Quick reference

| Do | Don't |
|----|--------|
| getByRole, getByLabel, getByTestId | waitForTimeout, brittle CSS |
| expect(locator).toBeVisible() before assert | Assume element is ready |
| Independent tests, clear state | Shared state between tests |
| trace/screenshot on failure in config | Ignore flakiness |
