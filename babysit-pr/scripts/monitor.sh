#!/usr/bin/env bash
set -euo pipefail

# babysit-pr monitor: Poll PR checks and report status
# The agent handles fixing — this script just watches and reports.

POLL_INTERVAL=120  # seconds
PR=""
AUTO_MERGE=false
QR=false
PROJECT="."

usage() {
  cat <<EOF
Usage: $(basename "$0") --pr <number|url> [OPTIONS]

Monitor a PR's CI checks and report status.

Options:
  --pr <number|url>   PR number or GitHub URL (required)
  --auto-merge        Merge (squash) when all checks pass
  --qr                Trigger EAS preview build and post QR code to PR
  --project <path>    Project directory for EAS builds (default: .)
  --interval <secs>   Poll interval in seconds (default: 120)
  -h, --help          Show this help
EOF
  exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) PR="$2"; shift 2 ;;
    --auto-merge) AUTO_MERGE=true; shift ;;
    --qr) QR=true; shift ;;
    --project) PROJECT="$2"; shift 2 ;;
    --interval) POLL_INTERVAL="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$PR" ]]; then
  echo "Error: --pr is required"
  usage
fi

# Extract PR number from URL if needed
if [[ "$PR" =~ /pull/([0-9]+) ]]; then
  PR="${BASH_REMATCH[1]}"
fi

echo "=== babysit-pr monitor ==="
echo "PR: #${PR}"
echo "Auto-merge: ${AUTO_MERGE}"
echo "QR code: ${QR}"
echo "Poll interval: ${POLL_INTERVAL}s"
echo "=========================="

# Post QR code if requested
EAS_BUILD_ID=""
if [[ "$QR" == true ]]; then
  echo ""
  echo "[QR] Triggering EAS preview build..."
  if command -v eas &>/dev/null; then
    # Capture the build ID so we track THIS build, not any random latest build
    eas_output=$(cd "$PROJECT" && eas build --profile preview --platform ios --non-interactive --json 2>/dev/null) || true
    if [[ -n "$eas_output" ]]; then
      EAS_BUILD_ID=$(echo "$eas_output" | jq -r '.[0].id // empty' 2>/dev/null) || true
    fi
    if [[ -n "$EAS_BUILD_ID" ]]; then
      echo "[QR] EAS build triggered (ID: ${EAS_BUILD_ID})."
    else
      echo "[QR] EAS build triggered but could not capture build ID. Will use latest build."
    fi
  else
    echo "[QR] Warning: eas CLI not found. Install with: pnpm add -g eas-cli"
  fi
fi

# Monitoring loop
attempt=0
last_status=""

while true; do
  echo ""
  echo "[$(date '+%H:%M:%S')] Checking PR #${PR}..."

  # Get check status
  checks_output=$(gh pr checks "$PR" 2>&1) || true

  # Determine overall status
  if echo "$checks_output" | grep -q "fail\|failure"; then
    status="failure"
  elif echo "$checks_output" | grep -q "pending\|queued\|in_progress"; then
    status="pending"
  elif echo "$checks_output" | grep -q "pass\|success"; then
    status="success"
  else
    status="unknown"
  fi

  echo "$checks_output"
  echo ""
  echo "[Status] ${status}"

  case "$status" in
    success)
      echo "[Result] All checks passed!"

      # Post QR code result if EAS build was triggered
      if [[ "$QR" == true ]] && command -v eas &>/dev/null; then
        echo "[QR] Checking for completed EAS build..."
        # Use tracked build ID if available, otherwise fall back to latest
        if [[ -n "$EAS_BUILD_ID" ]]; then
          build_info=$(cd "$PROJECT" && eas build:view "$EAS_BUILD_ID" --json 2>/dev/null) || true
          build_url=$(echo "$build_info" | jq -r '.artifacts.buildUrl // empty' 2>/dev/null) || true
          build_status=$(echo "$build_info" | jq -r '.status // empty' 2>/dev/null) || true
        else
          build_info=$(cd "$PROJECT" && eas build:list --limit 1 --json 2>/dev/null) || true
          build_url=$(echo "$build_info" | jq -r '.[0].artifacts.buildUrl // empty' 2>/dev/null) || true
          build_status=$(echo "$build_info" | jq -r '.[0].status // empty' 2>/dev/null) || true
        fi

        if [[ -n "$build_url" ]]; then
          qr_url="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${build_url}"
          gh pr comment "$PR" --body "$(cat <<EOF
## Mobile Preview Build

![QR Code](${qr_url})

**Install link:** ${build_url}

> Scan with your device camera to install.
EOF
)"
          echo "[QR] Posted QR code to PR #${PR}"
        elif [[ "$build_status" == "in-progress" || "$build_status" == "in-queue" ]]; then
          echo "[QR] EAS build still in progress. Will keep polling..."
          # Don't exit yet — continue the monitoring loop to post QR when ready
          last_status="$status"
          sleep "$POLL_INTERVAL"
          continue
        else
          echo "[QR] No artifact URL available (build status: ${build_status:-unknown})."
        fi
      fi

      # Auto-merge if requested
      if [[ "$AUTO_MERGE" == true ]]; then
        echo "[Merge] Attempting squash merge..."
        if gh pr merge "$PR" --squash; then
          echo "[Merge] PR #${PR} merged successfully!"
        else
          echo "[Merge] Auto-merge failed. PR may need approval or have branch protection rules."
          echo "[Merge] Enabling auto-merge for when requirements are met..."
          gh pr merge "$PR" --auto --squash || echo "[Merge] Could not enable auto-merge."
        fi
      fi
      exit 0
      ;;

    failure)
      if [[ "$last_status" == "failure" ]]; then
        attempt=$((attempt + 1))
      else
        attempt=1
      fi

      echo "[Failure] Attempt ${attempt}/3 — CI has failing checks."

      # Show failed run details
      failed_runs=$(gh run list --branch "$(gh pr view "$PR" --json headRefName -q '.headRefName')" --status failure --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null) || true
      if [[ -n "$failed_runs" ]]; then
        echo ""
        echo "[Failed Run] Run ID: ${failed_runs}"
        echo "[Failed Run] View logs with: gh run view ${failed_runs} --log-failed"
        echo ""
        gh run view "$failed_runs" --log-failed 2>&1 | tail -50
      fi

      if [[ $attempt -ge 3 ]]; then
        echo ""
        echo "[Giving up] 3 consecutive failure cycles. Stopping monitor."
        echo "[Action required] Manual intervention needed for PR #${PR}."
        exit 1
      fi
      ;;

    pending)
      echo "[Waiting] Checks still running..."
      attempt=0
      ;;

    *)
      echo "[Unknown] Could not determine check status."
      ;;
  esac

  last_status="$status"
  echo "[Next check] Sleeping ${POLL_INTERVAL}s..."
  sleep "$POLL_INTERVAL"
done
