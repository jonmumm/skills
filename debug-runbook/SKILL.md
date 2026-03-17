---
name: debug-runbook
description: >
  Structured debugging for production and staging issues. Maps symptoms to tools,
  queries, and data sources (Sentry, PostHog, wrangler logs, console, simulator logs).
  Use when something is "not working", "broken", "failing in prod", "500 error",
  "check logs", "check sentry", "why is this happening", or when debugging a deployed
  service or mobile app.
---

# Debug Runbook

## Symptom-first workflow

Every debugging session follows the same loop:

1. **Symptom** — What does the user see? Exact error, behavior, or absence of expected behavior.
2. **Boundary** — Where does the problem live? Client, edge worker, database, third-party service, CI pipeline.
3. **Tool** — Pick the right data source for that boundary (see table below).
4. **Query** — Pull logs, errors, events, or state from that source.
5. **Interpret** — Read the data. Identify root cause vs. symptom.
6. **Fix** — Address the root cause only. No workarounds, no band-aids.

Do NOT skip step 1. The user's description of the symptom determines which tool to reach for. Do NOT start by reading source code — start by reading production data.

## Data source reference

| Tool | When to use | Access |
|---|---|---|
| Sentry MCP | Crash reports, unhandled exceptions, error grouping, stack traces, breadcrumbs | `mcp__sentry__*` tools |
| PostHog MCP | User behavior, feature flag state, session replay, funnel analysis | `mcp__posthog__*` tools |
| `wrangler tail` | Live request/response logs from Cloudflare Workers | `wrangler tail <worker-name> --format json` |
| `wrangler deployments list` | Verify which version is actually deployed | `wrangler deployments list` |
| iOS simulator logs | Console output from iOS simulator apps | `xcrun simctl spawn booted log stream --level debug --predicate 'subsystem == "<bundle-id>"'` |
| Chrome DevTools / console MCP | Browser console errors, network failures, DOM state | `mcp__claude-in-chrome__read_console_messages`, `mcp__claude-in-chrome__read_network_requests` |
| `gh run view` | CI/CD pipeline failures, test output, deploy step logs | `gh run view <run-id> --log-failed` |
| Network tab | CORS errors, failed fetches, WebSocket disconnects | `mcp__claude-in-chrome__read_network_requests` |

## Common symptoms (quick reference)

| Symptom | First step | Details |
|---|---|---|
| 500 error on deployed worker | `wrangler tail` the worker | [symptom-map.md](references/symptom-map.md#500-error-on-deployed-worker) |
| App crashes on launch | Check Sentry for crash report | [symptom-map.md](references/symptom-map.md#app-crashes-on-launch) |
| Feature works locally, broken in prod | Compare env vars and deployed version | [symptom-map.md](references/symptom-map.md#works-locally-broken-in-prod) |
| Audio/media not playing | Check console for CORS or asset errors | [symptom-map.md](references/symptom-map.md#audiomedia-not-playing) |
| Can't connect / stuck on loading | Network tab, WebSocket status, backend logs | [symptom-map.md](references/symptom-map.md#cant-connect--stuck-on-loading) |
| Tests pass but feature broken | Verify tests actually ran against right target | [symptom-map.md](references/symptom-map.md#tests-pass-but-feature-broken) |
| CI failing | `gh run view` the failing run | [symptom-map.md](references/symptom-map.md#ci-failing) |
| Detox tests not running | Verify simulator booted and build exists | [symptom-map.md](references/symptom-map.md#detox-tests-not-running) |

Load [references/symptom-map.md](references/symptom-map.md) for detailed investigation steps, specific commands, and interpretation guidance.

## Configuration

On first use, check for project-specific config at:

```
${CLAUDE_PLUGIN_DATA}/debug-runbook/config.json
```

Expected schema:

```json
{
  "sentry": {
    "project_slug": "my-project",
    "org_slug": "my-org"
  },
  "posthog": {
    "project_id": "12345"
  },
  "workers": [
    {
      "name": "api-worker",
      "url": "https://api.example.com",
      "environment": "production"
    }
  ],
  "deployed_urls": {
    "production": "https://app.example.com",
    "staging": "https://staging.app.example.com"
  },
  "ios": {
    "bundle_id": "com.example.app"
  }
}
```

If config does not exist, ask the user:
1. What services are involved? (Workers, iOS app, web app)
2. Do they have Sentry/PostHog configured? What are the project identifiers?
3. What are the worker names and deployed URLs?

Create the config file from their answers so subsequent runs skip setup.

## Gotchas

These are real, recurring pain points. Read before debugging.

- **Do not strip console.log in production builds.** The user relies on logs for debugging. If a build tool removes them, that is a problem to fix, not a feature.
- **Always verify deployed version matches expected commit before debugging code.** Run `wrangler deployments list` or check the deploy pipeline. If the wrong version is live, no amount of code reading helps.
- **Check BOTH .dev.vars AND GitHub Actions secrets.** They are independent stores. A secret present in one may be missing from the other.
- **Wrangler secrets do not copy between environments.** Setting a secret for production does not set it for staging. Check both: `wrangler secret list` and `wrangler secret list --env staging`.
- **Simulator vs. device behavior diverges.** If the app works in simulator but not on a physical device, check: network/API URL configuration, HTTPS certificate pinning, camera/media permissions, and push notification setup.
- **Simulator logs and device logs are accessed differently.** Simulator: `xcrun simctl spawn booted log stream`. Device: Xcode Console or `idevicesyslog`.
- **Sentry and PostHog MCPs must be configured per-project.** Check the MCP configuration (`/mcp`) to verify the tools are available before trying to call them. If they are not listed, they are not connected.
- **Feature flags in PostHog are evaluated per-environment.** A flag enabled in dev may be disabled in production. Always check flag state for the environment you are debugging.

## References

| Document | Purpose |
|---|---|
| [references/symptom-map.md](references/symptom-map.md) | Detailed symptom-to-resolution paths with specific commands and interpretation |
