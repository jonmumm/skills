# Resume Protocol

How to resume a halted or interrupted mission from its persisted state.

## When Resume Triggers

A mission can be interrupted by:

1. **Planned halt:** Orchestrator signals `<promise>HALT:reason</promise>` when
   a milestone can't converge
2. **User interrupt:** Ctrl+C kills the dispatcher
3. **Crash:** Agent process dies unexpectedly
4. **Session end:** Claude Code session expires

## State Discovery

On resume, the dispatcher checks `.missions/runs/` for the most recent run:

```bash
# Find latest run
LATEST_RUN=$(ls -1d .missions/runs/*/ 2>/dev/null | sort -r | head -1)

# Check for existing planning artifacts
[[ -f "$LATEST_RUN/features.json" ]]            # Planning done?
[[ -f "$LATEST_RUN/validation-contract.md" ]]    # Contract exists?

# Check milestone progress
for mdir in "$LATEST_RUN/milestones"/*/; do
  if grep -q "PASSED" "$LATEST_RUN/progress.md"; then
    echo "$(basename $mdir): COMPLETE"
  elif grep -q "HALTED\|EXHAUSTED" "$LATEST_RUN/progress.md"; then
    echo "$(basename $mdir): HALTED"
  else
    echo "$(basename $mdir): IN PROGRESS or NOT STARTED"
  fi
done
```

## Resume Scenarios

### Scenario 1: Planning complete, execution interrupted

**State:** `features.json` and `validation-contract.md` exist, but not all
milestones are marked complete in `progress.md`.

**Action:** Skip planning, resume from the first incomplete milestone.

```bash
missions.sh --project /path/to/repo --plan .missions/runs/LATEST/mission-brief.md
```

The script detects existing artifacts and skips Phase 1.

### Scenario 2: Milestone halted (max rounds exceeded)

**State:** `progress.md` shows a milestone EXHAUSTED after N rounds.

**Action:** The orchestrator runs in `resume` phase:
1. Reads validation results from the failed milestone
2. Summarizes what's not converging and why
3. Suggests options:
   - Increase max rounds
   - Simplify the failing assertions
   - Split the milestone differently
   - Accept non-blocking failures and move on

### Scenario 3: Worker blocked

**State:** `progress.md` shows a WORKER BLOCKED entry.

**Action:** The orchestrator reads the block reason and:
1. If it's an infrastructure issue → suggests what the human needs to fix
2. If it's a spec ambiguity → presents the question for the human
3. After the human resolves it → mission continues from that feature

### Scenario 4: Crash mid-feature

**State:** Worker worktree may have uncommitted changes.

**Action:**
1. Check if `.missions/worker/` exists with uncommitted changes
2. If yes: the worker was mid-implementation
   - Option A: Commit the WIP and continue from the next feature
   - Option B: Discard and re-run the feature from scratch
3. Clean up the worktree and resume

## Auto-Detection at Session Start

When a new Claude Code session starts in a project with `.missions/`:

```
Check:
1. Does .missions/runs/*/report.md exist?
   → Present the report summary
2. Does .missions/runs/*/progress.md exist without a report?
   → Mission was interrupted. Offer to resume.
3. Is .missions/HEARTBEAT recent (< 1 hour)?
   → Mission may still be running in another process
```

### Recovery Dialog

```
A previous mission was interrupted. Here's the state:

Mission: "Build a Slack clone with real-time messaging"
Run: 2026-04-11T14-00
Milestones: 3/6 complete
  M1 Foundation: PASSED
  M2 Channels: PASSED
  M3 Conversations: PASSED
  M4 Interactions: HALTED (round 3/4 — 2 blocking contract failures)
  M5 Rich features: NOT STARTED
  M6 Polish: NOT STARTED

Last activity: 2026-04-11T22:15 — Contract validator found reaction
  persistence fails on WebSocket reconnect

Options:
1. Resume from M4 (re-run validation round 4)
2. View the blocking failures in detail
3. Start a fresh mission
```

## State Files Reference

| File | Purpose | Resume action |
|---|---|---|
| `mission-brief.md` | Original goal | Read for context |
| `validation-contract.md` | Behavioral assertions | Source of truth for validators |
| `features.json` | Feature decomposition | Skip completed features |
| `guidelines.md` | Worker boundaries | Pass to new workers |
| `knowledge-base.md` | Accumulated context | Pass to all agents |
| `progress.md` | Activity log | Determine resume point |
| `milestones/<id>/features.md` | Features per milestone | Identify incomplete work |
| `milestones/<id>/validation-results.md` | Validator output | Assess what passed/failed |
| `milestones/<id>/issues.md` | Scrutiny findings | Context for fix features |
| `milestones/<id>/fix-features.md` | Fix feature specs | Resume fix feature work |

## Preserving Context Across Sessions

When compacting or starting a new session, preserve:
- File paths being edited
- Which milestone is current
- Test results (pass/fail counts)
- Validation round number
- Architecture decisions from `knowledge-base.md`
- The halt reason (if applicable)
