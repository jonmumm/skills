---
name: babysit-pr
description: >
  Monitor a PR through CI, diagnose and fix test failures, resolve merge conflicts,
  post QR codes for mobile preview builds, and auto-merge when ready. Use when asked
  to "babysit", "monitor this PR", "watch CI", "fix CI", "post QR code", "make sure
  CI passes", or "merge when green".
---

# babysit-pr

Monitor a pull request from open to merged. Diagnose CI failures, fix what's fixable, post mobile preview QR codes, and merge when green.

## Workflow

1. Identify PR (from current branch, URL, or PR number)
2. Check CI status and diagnose failures
3. Fix what's fixable (test failures, lint, type errors)
4. Post mobile preview QR code (if Expo/RN project)
5. Monitor until all checks pass
6. Auto-merge or notify user

## CI Diagnosis

### Reading GitHub Actions Logs

```bash
# List recent runs for the PR branch
gh run list --branch <branch> --limit 5

# View failed logs for a specific run
gh run view <run-id> --log-failed

# View full log for a specific job
gh run view <run-id> --job <job-id> --log
```

### Common Failure Patterns

| Failure | Diagnosis | Fix |
|---------|-----------|-----|
| Type errors | `tsc` output in logs | Fix locally, push |
| Lint errors | ESLint/Prettier output in logs | Fix locally, push |
| Test failures (real) | Assertion mismatch, consistent across runs | Fix the code or test bug |
| Test failures (flaky) | Passes locally, intermittent in CI | Investigate the root cause — race condition, timing dependency, shared state, or missing test isolation. Fix the flakiness, don't just retry. |
| Build failures | Missing deps, lockfile mismatch | `pnpm install`, commit lockfile, push |
| Secret/env missing | References to undefined env vars | Flag to user — cannot fix automatically |
| Timeout | Job exceeded time limit | Check for infinite loops, increase timeout if legitimate |

### Diagnosis Steps

1. Run `gh run list --branch <branch> --limit 5` to see recent CI runs
2. Identify the failed run and run `gh run view <run-id> --log-failed`
3. Read the error output — focus on the first error, not cascading failures
4. Check if the failure is reproducible locally:
   - Run the same command from the CI step (e.g., `pnpm test`, `pnpm lint`, `pnpm typecheck`)
   - If it passes locally but fails in CI, suspect environment differences or flakiness
5. Fix the root cause, commit, and push
6. If the failure appears flaky (passes locally, intermittent in CI), investigate the root cause: race conditions, timing dependencies, shared state leaks, or missing test isolation. Fix the underlying issue rather than retrying.

## QR Code for Mobile Preview

For Expo/React Native projects, post a QR code to the PR so reviewers can test on a real device.

### Triggering a Preview Build

```bash
# Trigger EAS build for preview
eas build --profile preview --platform ios --non-interactive

# For Android
eas build --profile preview --platform android --non-interactive

# Check build status
eas build:list --limit 1 --json
```

### Posting the QR Code

```bash
# Get the build URL from EAS
BUILD_URL=$(eas build:list --limit 1 --json | jq -r '.[0].artifacts.buildUrl')

# Generate QR code URL (using a public QR API)
QR_URL="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${BUILD_URL}"

# Post to PR
gh pr comment <pr-number> --body "$(cat <<EOF
## Mobile Preview Build

![QR Code](${QR_URL})

**Install link:** ${BUILD_URL}

> Scan with your device camera to install. QR codes expire when a new build is triggered.
EOF
)"
```

### Device Registration and Distribution

- **Ad-hoc iOS builds** require device registration: `eas device:create`
- **Internal distribution** via EAS handles provisioning automatically with `--profile preview`
- **Diawi** as fallback distribution: upload the .ipa/.apk to Diawi, post the resulting link
  ```bash
  # Upload to Diawi (requires DIAWI_TOKEN)
  curl https://upload.diawi.com/ -F token="$DIAWI_TOKEN" -F file=@build.ipa
  ```
- **Expo Updates** for OTA previews (no new build required):
  ```bash
  eas update --branch preview --message "PR #<number> preview"
  ```

### Timing

Trigger the EAS build early — don't wait for CI to finish. Builds take 10-20 minutes for iOS and the preview can be ready while CI is still running.

## Merge Conflict Resolution

When the PR has merge conflicts:

```bash
# Fetch latest and rebase
git fetch origin main
git rebase origin/main

# If conflicts arise, resolve them:
# 1. Read both sides of the conflict
# 2. Use project context to determine correct resolution
# 3. Stage resolved files
git add <resolved-files>
git rebase --continue

# Push the rebased branch
git push --force-with-lease
```

Rules for conflict resolution:
- Read both sides of every conflict — never blindly accept one side
- If the conflict involves logic changes on both sides, flag to user rather than guessing
- Lockfile conflicts: delete the lockfile, run `pnpm install`, commit the fresh lockfile
- After resolving, run the full test suite locally before pushing

## Auto-merge

When all checks pass and the PR is approved:

```bash
# Enable auto-merge (squash strategy)
gh pr merge <pr-number> --auto --squash

# Or merge immediately if everything is green
gh pr merge <pr-number> --squash
```

If auto-merge is not enabled on the repo, notify the user to merge manually or enable it in repo settings.

## Monitoring Loop

Use `scripts/monitor.sh` to poll CI status:

```bash
# Basic monitoring
./scripts/monitor.sh --pr 123

# Monitor and auto-merge when green
./scripts/monitor.sh --pr 123 --auto-merge

# Monitor and post QR code for Expo project
./scripts/monitor.sh --pr 123 --qr --project ./my-expo-app
```

The script polls `gh pr checks` every 2 minutes and reports status. When a failure is detected, it outputs the details so the agent can diagnose and fix. After 3 failed fix attempts on the same issue, it stops and notifies the user.

### Agent Integration

The monitoring script is a status reporter — the agent handles the fixing. Typical loop:

1. Script reports: "Check `test` failed on run 12345"
2. Agent runs `gh run view 12345 --log-failed`
3. Agent diagnoses and fixes
4. Agent pushes the fix
5. Script continues monitoring the new run

## Gotchas

- **Vet changes locally before pushing.** Don't push blind fixes to a PR. Run the failing command locally, confirm your fix works, then push.
- **Trigger EAS builds early.** iOS builds take 10-20 minutes. Start them before CI finishes so the preview is ready sooner.
- **QR codes expire.** EAS build links rotate. Post fresh QR codes if the build is more than a few hours old.
- **Some CI failures need secrets.** If a failure references missing env vars or secrets, flag it to the user. These require GitHub Actions settings changes.
- **Flaky tests need fixing, not retrying.** If a test passes locally but fails in CI, investigate: race conditions, timing dependencies, shared state, missing teardown, or environment differences. Fix the root cause. Retrying hides bugs.
- **Don't force-merge.** If branch protection requires checks, they must pass. Never use `--admin` to bypass.
- **Force-push carefully.** After a rebase, use `--force-with-lease` to avoid overwriting someone else's commits.
