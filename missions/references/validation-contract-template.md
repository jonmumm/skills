# Validation Contract Template

Use this template when the orchestrator writes the validation contract.
Each assertion follows a consistent format that contract validators can
mechanically verify.

## Template

```markdown
# Validation Contract — <Mission Name>

## Domain: AUTH

### VAL-AUTH-001: <Title — what should happen>

<One-paragraph description of the expected behavior, written from the user's
perspective. "A user with valid credentials submits the login form and is
redirected to the dashboard.">

**Preconditions:**
- <State the system must be in before the assertion can be tested>
- <e.g., "A user account exists with email test@example.com">

**Tool:** <playwright | api-test | simulator | manual>

**Steps:**
1. <Concrete action — "Navigate to /login">
2. <Concrete action — "Enter email: test@example.com">
3. <Concrete action — "Enter password: correct-password">
4. <Concrete action — "Click the Sign In button">

**Expected outcome:**
- <Observable result — "User is redirected to /dashboard">
- <Observable result — "Dashboard shows the user's name">

**Evidence:**
- <What proves it passed — "screenshot(login-form), screenshot(dashboard)">
- <Network evidence — "POST /api/auth/login -> 200">

**Severity:** blocking
```

## Naming Convention

- **ID format:** `VAL-<DOMAIN>-<NNN>`
- **Domains:** Use short, uppercase labels that match the feature area
  - AUTH, USER, MSG, SEARCH, UPLOAD, NOTIFY, ADMIN, BILLING, etc.
- **Numbering:** Sequential within each domain, starting at 001
- **Cross-cutting:** Use `CROSS` domain for assertions that span features
  - e.g., `VAL-CROSS-001: Auth gates pricing page`

## Coverage Rules

1. **Every feature must have at least one happy-path assertion**
2. **Critical paths need error-case assertions too**
3. **Cross-cutting concerns get their own assertions** — don't assume
   feature-level assertions cover integration behavior
4. **Performance assertions** where latency matters:
   ```markdown
   ### VAL-PERF-001: Dashboard loads under 2 seconds
   **Steps:** Navigate to /dashboard with 100 items
   **Expected outcome:** Page interactive within 2000ms
   **Evidence:** performance.timing measurement
   **Severity:** non-blocking
   ```

## Severity Guide

| Severity | Meaning | Effect on validation |
|---|---|---|
| **blocking** | Core behavior broken, feature unusable | Milestone FAILS |
| **non-blocking** | Quality issue, not a showstopper | Logged, doesn't block |

Use `blocking` for:
- Core user flows that don't work
- Security issues
- Data loss or corruption

Use `non-blocking` for:
- Visual polish issues
- Performance below target but functional
- Edge cases that are unlikely but should be fixed

## Example: Complete Contract for Auth Feature

```markdown
# Validation Contract — User Management

## Domain: AUTH

### VAL-AUTH-001: Successful login
A user with valid credentials submits the login form and is redirected to
the dashboard with their profile visible.

**Preconditions:**
- User account exists: test@example.com / TestPass123!
**Tool:** playwright
**Steps:**
1. Navigate to /login
2. Fill email field with "test@example.com"
3. Fill password field with "TestPass123!"
4. Click "Sign in"
**Expected outcome:**
- URL changes to /dashboard
- Page shows "Welcome, Test User"
**Evidence:** screenshot(login-form), screenshot(dashboard), network(POST /api/auth/login -> 200)
**Severity:** blocking

### VAL-AUTH-002: Invalid credentials rejected
A user with wrong credentials sees an error message and stays on the login page.

**Preconditions:**
- User account exists: test@example.com / TestPass123!
**Tool:** playwright
**Steps:**
1. Navigate to /login
2. Fill email with "test@example.com"
3. Fill password with "wrong-password"
4. Click "Sign in"
**Expected outcome:**
- URL stays on /login
- Error message: "Invalid email or password"
- No sensitive info in error (no "password incorrect" vs "user not found")
**Evidence:** screenshot(error-state), network(POST /api/auth/login -> 401)
**Severity:** blocking

### VAL-AUTH-003: Registration creates account
A new user fills the registration form and gets a working account.

**Preconditions:**
- No account exists for newuser@example.com
**Tool:** playwright
**Steps:**
1. Navigate to /register
2. Fill name: "New User"
3. Fill email: "newuser@example.com"
4. Fill password: "NewPass123!"
5. Click "Create account"
6. Verify redirect to /dashboard
7. Log out
8. Log in with newuser@example.com / NewPass123!
**Expected outcome:**
- Account created, redirected to dashboard
- Can log out and log back in successfully
**Evidence:** screenshot(register-form), screenshot(dashboard), screenshot(re-login)
**Severity:** blocking

## Domain: CROSS

### VAL-CROSS-001: Unauthenticated access redirects to login
A user who is not logged in cannot access protected pages.

**Preconditions:**
- No active session (clear cookies)
**Tool:** playwright
**Steps:**
1. Navigate directly to /dashboard
2. Observe redirect
**Expected outcome:**
- URL changes to /login
- No flash of dashboard content
**Evidence:** screenshot(redirect-to-login), network(GET /dashboard -> 302)
**Severity:** blocking
```
