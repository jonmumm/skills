# Symptom Map

Detailed investigation paths for common production/staging issues. Each entry provides the symptom, the tools to use, specific commands, what to look for, and how to fix it.

---

## 500 error on deployed worker

**Boundary:** Cloudflare Workers (edge)

**Step 1: Tail the worker**
```bash
wrangler tail <worker-name> --format json
```
Then reproduce the request. Look at the response status and any `console.error` or `console.log` output in the tail.

**Step 2: Check bindings**
```bash
# Review wrangler.toml for KV, R2, D1, Durable Object bindings
cat wrangler.toml
```
A 500 often means a binding is referenced in code but not configured in `wrangler.toml`, or the binding name in code does not match the config.

**Step 3: Check secrets**
```bash
wrangler secret list
wrangler secret list --env staging  # if using environments
```
Compare against what the code expects. Missing secrets cause runtime errors that surface as 500s.

**Step 4: Check Sentry (if configured)**
Use `mcp__sentry__*` tools to search for the error. Look at the stack trace and breadcrumbs. The breadcrumbs often reveal which binding or env var is undefined.

**Step 5: Check deployed version**
```bash
wrangler deployments list
```
Verify the latest deployment matches the commit you expect. If the user deployed but the old version is still active, the fix is to redeploy.

---

## App crashes on launch

**Boundary:** Mobile app (iOS/Android)

**Step 1: Check Sentry**
Use `mcp__sentry__*` tools to pull the latest crash report. Look for:
- Unhandled exceptions in the main thread
- Missing native modules (common after adding a new dependency without rebuilding)
- OOM crashes (check memory breadcrumbs)

**Step 2: Check recent deploys / builds**
```bash
# What changed since last working version?
git log --oneline -10
```
If the crash started after a specific commit, focus investigation there.

**Step 3: Check environment variables**
For Expo/React Native:
```bash
# Check .env or app.config.js for missing vars
cat .env
cat app.config.js
```
A missing env var used during initialization causes an immediate crash.

**Step 4: Simulator logs**
```bash
# iOS simulator — filter by app bundle ID
xcrun simctl spawn booted log stream --level debug --predicate 'subsystem == "<bundle-id>"'
```
For Android:
```bash
adb logcat -s ReactNativeJS:V ReactNative:V
```

**Step 5: Rebuild from clean state**
```bash
# Expo
npx expo prebuild --clean
npx expo run:ios

# React Native (non-Expo)
cd ios && rm -rf Pods && pod install && cd ..
npx react-native run-ios
```

---

## Works locally, broken in prod

**Boundary:** Deployment gap (config, env, version mismatch)

**Step 1: Compare environment variables**
```bash
# Local
cat .dev.vars

# Production secrets
wrangler secret list

# GitHub Actions (check workflow file for referenced secrets)
cat .github/workflows/*.yml
```
The #1 cause is a secret or env var present locally but missing in production.

**Step 2: Verify deployed version**
```bash
wrangler deployments list
# or check the deploy pipeline
gh run list --limit 5
```

**Step 3: Check for dev-only code paths**
Search for `process.env.NODE_ENV`, `import.meta.env.DEV`, or conditional logic that behaves differently in production vs. development.

**Step 4: Check wrangler tail**
```bash
wrangler tail <worker-name> --format json
```
Reproduce the action and compare the production behavior against local.

**Step 5: Check feature flags**
If PostHog is configured, use `mcp__posthog__*` tools to check flag state for the production environment. A flag enabled locally but disabled in prod causes "works for me" bugs.

---

## Audio/media not playing

**Boundary:** Client (browser or mobile app)

**Step 1: Check browser console**
Use `mcp__claude-in-chrome__read_console_messages` to look for:
- `NotAllowedError` — autoplay blocked, needs user gesture
- `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` — CORS issue
- 404 errors on media asset URLs

**Step 2: Check CORS headers**
Use `mcp__claude-in-chrome__read_network_requests` to inspect the response headers on media requests. Look for:
- Missing `Access-Control-Allow-Origin`
- Missing `Content-Type` header or wrong MIME type
- Preflight (`OPTIONS`) request being rejected

**Step 3: Check asset URLs**
Verify the URLs resolve correctly. Common issues:
- R2 bucket URL not configured for public access
- Asset path uses relative URL that breaks after deploy
- CDN cache serving stale/deleted asset

**Step 4: Check mobile-specific issues**
- iOS Safari requires user interaction before playing audio
- React Native: check that `expo-av` or audio library is linked and permissions granted
- Android: check for missing `INTERNET` permission in manifest

---

## Can't connect / stuck on loading

**Boundary:** Network (client to server)

**Step 1: Check network requests**
Use `mcp__claude-in-chrome__read_network_requests` to identify:
- Pending/stalled requests (server not responding)
- Failed WebSocket upgrades (101 not received)
- DNS resolution failures
- SSL/TLS errors

**Step 2: Check backend health**
```bash
# Quick health check
curl -v <deployed-url>/health

# Tail worker logs for incoming requests
wrangler tail <worker-name> --format json
```
If no requests appear in the tail, the problem is DNS or routing, not the worker code.

**Step 3: Check WebSocket-specific issues**
```bash
# Test WebSocket connection
websocat ws://<url>/ws
```
Common issues:
- Durable Object not configured in wrangler.toml
- WebSocket upgrade handler missing or returning wrong status
- Worker hitting CPU time limit during WebSocket handshake

**Step 4: Check DNS and SSL**
```bash
# Verify DNS resolves
dig <domain>

# Check SSL certificate
openssl s_client -connect <domain>:443 -servername <domain> < /dev/null 2>&1 | head -20
```

---

## Tests pass but feature broken

**Boundary:** Test environment vs. runtime environment

**Step 1: Verify tests actually ran**
```bash
# Check test output for actual test execution (not just "0 tests")
pnpm test 2>&1 | tail -20
```
A common trap: the test file exists but the test runner skipped it (wrong pattern, `.skip`, missing build step).

**Step 2: Check test target**
For Detox/E2E tests, verify the test ran against the right build:
```bash
# Detox: was the app rebuilt after code changes?
detox build --configuration ios.sim.debug
```

**Step 3: Check test isolation**
Tests passing individually but feature broken can mean:
- Tests mock something that is real in production
- Tests use a different env/config than production
- Test database has different schema than production

**Step 4: Check for shallow tests**
If tests pass but the feature is broken, the tests may not cover the actual failure path. Run mutation testing to verify:
```bash
npx stryker run --mutate "src/path/to/module.ts"
```
Surviving mutants in the failing area reveal gaps in test coverage.

---

## CI failing

**Boundary:** GitHub Actions / CI pipeline

**Step 1: View the failing run**
```bash
# List recent runs
gh run list --limit 5

# View the failing run's logs (shows only failed steps)
gh run view <run-id> --log-failed
```

**Step 2: Identify the failing step**
Common failure categories:
- **Build failure** — check for TypeScript errors, missing dependencies
- **Test failure** — read the test output, identify which test and assertion
- **Deploy failure** — check credentials/secrets in GitHub Actions settings
- **Lint failure** — run the linter locally to reproduce

**Step 3: Check secrets and env vars**
```bash
# View workflow file to see which secrets are referenced
cat .github/workflows/<workflow>.yml
```
Then verify those secrets exist in the GitHub repo settings. Secrets added locally via `.dev.vars` or `.env` are not automatically available in CI.

**Step 4: Reproduce locally**
```bash
# Run the exact same command that failed in CI
# Copy the command from the workflow step
```
If it passes locally, the issue is environmental (missing secret, different Node version, missing system dependency).

---

## Detox tests not running

**Boundary:** Detox test runner / iOS simulator

**Step 1: Check simulator state**
```bash
# Is a simulator booted?
xcrun simctl list devices booted
```
If no simulator is booted, Detox cannot run tests.

**Step 2: Check Detox build exists**
```bash
# List available Detox configurations
cat .detoxrc.js

# Build if needed
detox build --configuration ios.sim.debug
```
If the build is stale or missing, tests silently fail or hang.

**Step 3: Check for stale Metro bundler**
```bash
# Kill any running Metro instances
lsof -ti:8081 | xargs kill -9 2>/dev/null

# Restart with clean cache
npx expo start --clear
```

**Step 4: Check Detox test output verbosity**
```bash
# Run with trace logging to see what Detox is doing
detox test --configuration ios.sim.debug --loglevel trace
```
Look for: device boot failures, app install failures, synchronization timeouts.

**Step 5: Check for idle resource issues**
Detox waits for the app to be idle. Infinite animations, polling timers, or unresolved promises cause Detox to hang indefinitely. Look for:
- `setInterval` without cleanup
- Animated loops without `useNativeDriver`
- Unresolved fetch/promise chains
