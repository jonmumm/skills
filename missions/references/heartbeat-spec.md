# Heartbeat Specification

The heartbeat is the primary visibility mechanism for humans monitoring a
mission. It's a single file that updates frequently with the current agent's
status.

## File Location

```
.missions/HEARTBEAT
```

Single file, overwritten (not appended) on each update. Designed to be watched:

```bash
watch cat .missions/HEARTBEAT
```

## Format

Single line, pipe-delimited:

```
HH:MM:SS | ROLE: context | STEP: description | EXTRA: value
```

### Examples

```
14:15:03 | ORCHESTRATOR | STEP: writing validation contract | assertions: 12
14:22:17 | WORKER: F001 | STEP: writing integration tests | TESTS: 0/0
14:28:45 | WORKER: F001 | STEP: implementing auth handler | TESTS: 3/8
14:35:12 | WORKER: F001 | STEP: running verification suite | TESTS: 8/8
14:36:01 | WORKER: F001 | STEP: committing | TESTS: 8/8
14:40:33 | WORKER: F002 | STEP: reading feature spec | TESTS: 8/8
15:10:22 | SCRUTINY: M1 | STEP: reviewing test quality | issues: 2
15:12:45 | CONTRACT: M1 | STEP: verifying VAL-AUTH-002 | assertions: 3/8
15:20:11 | ORCHESTRATOR | STEP: creating fix features | fixes: 2
15:25:00 | WORKER: FIX-M1-001 | STEP: implementing fix | TESTS: 10/10
15:35:44 | COMPLETE | mission complete | milestones: 6/6
```

## Update Frequency

- Workers: every ~5 tool calls
- Validators: every ~3 assertions verified
- Orchestrator: at each phase transition

## Who Writes It

Every agent writes to the heartbeat using a simple echo:

```bash
echo "$(date '+%H:%M:%S') | WORKER: F001 | STEP: writing integration tests | TESTS: 3/8" > .missions/HEARTBEAT
```

The agent prompt includes explicit instructions to write the heartbeat.
The dispatcher also updates it between agent launches.

## Monitoring Commands

```bash
# Live watch (updates every 2 seconds)
watch cat .missions/HEARTBEAT

# Combined with progress
watch -n 5 'echo "=== HEARTBEAT ===" && cat .missions/HEARTBEAT && echo "" && echo "=== RECENT PROGRESS ===" && tail -10 .missions/runs/*/progress.md'

# Just check if alive
cat .missions/HEARTBEAT
```

## Stale Detection

If the heartbeat hasn't updated in > 10 minutes, the agent may be:
- Stuck in a long-running command
- Crashed
- In a retry loop

The human should check the agent's log file for the current role.
