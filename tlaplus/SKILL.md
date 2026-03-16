---
name: tlaplus
description: >
  Formal verification of system designs using TLA+ and the TLC model checker.
  Models concurrent state machines, finds race conditions, deadlocks, and invariant
  violations before any code is written. Also verifies pure algorithm invariants by
  exhaustively checking all input combinations. Use when the user says "tlaplus", "tla+",
  "formal verification", "model check", "verify my design", "check for race conditions",
  "state space", "verify concurrency", "find bugs", "verify algorithm", or when working
  on systems with shared mutable state, offline sync, queues, distributed coordination,
  multi-agent orchestration, or complex pure functions with subtle invariants.
---

# TLA+ Formal Verification

Verify system designs and algorithm correctness by exhaustively checking every reachable state.

## When to use

### Concurrent systems (the classic use case)
- Concurrent actors sharing mutable state (offline queues, sync engines, caches)
- Distributed systems (client-server sync, multi-device, event sourcing)
- Multi-agent orchestration (swarm agents, parallel worktree operations)
- Any system where "it works in my test" is insufficient because interleavings matter

### Algorithm invariant checking (the underrated use case)
- Pure functions with complex input spaces (recursive traversals, tree walkers, parsers)
- Functions with multiple code paths that must produce consistent results
- Algorithms where "for all possible inputs, property X must hold"
- Migration/transformation logic where data must never be lost or corrupted
- Any code where you suspect a subtle edge case but can't enumerate all inputs by hand

## When NOT to use

- Pure CRUD with no concurrency or complex logic
- Simple request-response APIs with no shared state
- UI layout or styling questions

## Two workflow tracks

TLA+ serves two distinct purposes. Choose the right track:

```
Track A: CONCURRENT SYSTEMS              Track B: ALGORITHM INVARIANTS
─────────────────────────────             ─────────────────────────────
Phase 1: Identify Actors & State          Phase 1: Identify Inputs & Properties
Phase 2: Write TLA+ Spec                 Phase 2: Write TLA+ Spec
Phase 3: Run TLC                         Phase 3: Run TLC
Phase 4: Interpret & Fix                 Phase 4: Interpret & Fix
Phase 5: Bridge to Code                  Phase 5: Bridge to Code
```

---

## Track A: Concurrent Systems

### Phase A1: Identify Actors & State

Before writing any TLA+, interview the user (or read the code) to extract:

1. **Actors**: Who/what runs concurrently? (processes, threads, devices, agents, timers)
2. **Shared state**: What mutable state do actors read/write? (databases, queues, flags, caches)
3. **Actions**: What operations can each actor perform? (enqueue, dequeue, read, write, crash, reconnect)
4. **Invariants**: What must ALWAYS be true? (no double-processing, queue order preserved, no data loss)
5. **Liveness**: What must EVENTUALLY happen? (queue drains, sync completes, all agents finish)

Document these in a table:

```markdown
| Actor | Reads | Writes | Actions |
|-------|-------|--------|---------|
| iOS app | queue, cache | queue, cache, API | enqueue, replay, sync |
| API server | DB | DB, R2 | process, generate, respond |
| Network | - | connectivity flag | drop, restore |
```

### Phase A2: Write TLA+ Spec

Load [references/tlaplus-patterns.md](references/tlaplus-patterns.md) for syntax reference and common patterns.

### Spec structure

```tla
---- MODULE SystemName ----
EXTENDS Integers, Sequences, FiniteSets, TLC

\* Constants
CONSTANTS Workers, MaxRetries

\* Variables
VARIABLES queue, isProcessing, results

vars == <<queue, isProcessing, results>>

\* Initial state
Init ==
    /\ queue = <<>>
    /\ isProcessing = FALSE
    /\ results = {}

\* Actions (one per actor operation)
Enqueue(item) ==
    /\ queue' = Append(queue, item)
    /\ UNCHANGED <<isProcessing, results>>

Process ==
    /\ ~isProcessing
    /\ queue /= <<>>
    /\ isProcessing' = TRUE
    /\ queue' = Tail(queue)
    /\ results' = results \union {Head(queue)}

\* Next-state relation
Next ==
    \/ \E item \in Items : Enqueue(item)
    \/ Process
    \/ \* ... other actions

\* Safety invariants (must ALWAYS hold)
NoDoubleProcess == \A item \in results : \* item processed at most once
QueueOrderPreserved == \* FIFO ordering maintained

\* Liveness (must EVENTUALLY hold)
Liveness == <>(queue = <<>>)  \* queue eventually drains

\* Spec
Spec == Init /\ [][Next]_vars /\ Liveness
====
```

### Key principles

- **One action per atomic step**: If two things can't happen simultaneously in the real system, they're separate actions
- **Model crashes**: Add a `Crash` action that resets actor state mid-operation
- **Model network**: Add `NetworkDrop` / `NetworkRestore` actions
- **Minimize state space**: Use small constants (2-3 workers, 3-5 queue items). TLC checks ALL interleavings, so the state space explodes combinatorially
- **Name variables after the real system**: Use the same names as the code for traceability

### Phase A3: Run TLC

### Installation check

```bash
# Check if TLA+ tools are available
which tlc 2>/dev/null || java -cp /path/to/tla2tools.jar tlc2.TLC --help 2>/dev/null
```

If not installed, guide the user:
```bash
# Option 1: Homebrew (macOS)
brew install tlaplus

# Option 2: Direct download
curl -LO https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar

# Option 3: VS Code extension (recommended for interactive use)
# Install "TLA+" extension by Markus Kuppe
```

### Running the model checker

Create a `.cfg` file alongside the `.tla` file:

```cfg
SPECIFICATION Spec
INVARIANT NoDoubleProcess QueueOrderPreserved
PROPERTY Liveness
CONSTANTS
    Workers = {w1, w2}
    MaxRetries = 3
```

Run:
```bash
# With brew-installed tlc
tlc SystemName.tla

# With jar
java -jar tla2tools.jar SystemName.tla

# With more memory for large state spaces
java -Xmx8g -jar tla2tools.jar -workers auto SystemName.tla
```

### Reading output

- **"No errors found"** + state count = design verified for those constants
- **"Invariant X is violated"** = TLC found a reachable state that breaks your invariant. It prints the exact trace (sequence of states) that leads to the violation. This is the gold.
- **"Deadlock reached"** = system can reach a state where no action is enabled
- **"Property X is violated"** = liveness property fails (system can get stuck forever)

### Phase A4: Interpret & Fix

When TLC finds a counterexample:

1. **Read the trace**: TLC prints a numbered sequence of states. Each state shows all variable values
2. **Identify the interleaving**: Which actor did what, in what order, to reach the bad state?
3. **Fix the DESIGN, not the spec**: The spec is correct — it accurately models a broken design. Fix the design (add a lock, change the protocol, reorder operations)
4. **Update the spec** to reflect the fixed design
5. **Rerun TLC** to verify the fix doesn't introduce new violations

### Common fixes

| TLC finding | Typical fix |
|-------------|------------|
| Race condition (two actors modify same state) | Add mutual exclusion (lock, compare-and-swap, serial queue) |
| Lost update (read-then-write not atomic) | Make it atomic or use optimistic locking |
| Deadlock (circular wait) | Impose lock ordering or use try-lock |
| Starvation (liveness violation) | Add fairness constraint or priority mechanism |
| Queue double-processing | Idempotency keys or exactly-once delivery |

### Phase A5: Bridge to Code

The verified TLA+ spec is a blueprint. Translate it to implementation:

1. **Each TLA+ variable** maps to a piece of real state (database column, in-memory field, queue)
2. **Each TLA+ action** maps to a function/method
3. **Each invariant** maps to an assertion or test
4. **The atomicity boundaries in TLA+** tell you where you need locks, transactions, or serial queues in real code

### Generate tests from counterexamples

Every counterexample trace TLC found (before you fixed it) becomes a regression test:

```swift
// TLC found: two concurrent replay() calls can double-process items
func testConcurrentReplayDoesNotDoubleProcess() async {
    let queue = OfflineQueue()
    queue.enqueue(method: "POST", path: "/sync", body: nil)

    async let replay1 = queue.replay()
    async let replay2 = queue.replay()
    _ = await (replay1, replay2)

    // Invariant from TLA+ spec: item processed at most once
    XCTAssertEqual(processedCount, 1)
}
```

### Traceability

Add a comment linking implementation to the TLA+ spec:

```swift
// TLA+ spec: OfflineQueue.tla, action: Replay
// Invariant: NoDoubleReplay — verified for 2 concurrent actors, 5 queue items
func replay() async {
    // Atomic check-and-set (fix from TLC counterexample #1)
    guard atomicCompareAndSwap(&isReplaying, expected: false, desired: true) else { return }
    defer { isReplaying = false }
    // ...
}
```

---

## Track B: Algorithm Invariant Checking

Use this track when you want to verify a pure function or algorithm against properties
across all possible inputs. No concurrency needed — TLC becomes an exhaustive fuzzer.

### Phase B1: Identify Inputs & Properties

Read the code and extract:

1. **Input space**: What are the possible inputs? (machine IDs, state trees, context objects)
2. **Code paths**: What branches does the algorithm take? (if/else, switch, recursive cases)
3. **Properties**: What must ALWAYS be true? ("valid states are never replaced", "existing data is never lost", "both code paths produce consistent results")
4. **Suspicious areas**: Where are the subtle edge cases? (different string handling in two branches, missing normalization, off-by-one in recursion)

### Phase B2: Write TLA+ Spec

The spec shape for algorithm verification is different from concurrent systems:

```tla
---- MODULE AlgorithmCheck ----
EXTENDS TLC, FiniteSets, Naturals

CONSTANTS
    Inputs,        \* Set of possible input values (keep small!)
    Configs        \* Set of possible configurations

VARIABLES
    input,         \* Current input being checked
    config,        \* Current configuration
    result,        \* Output of the algorithm
    done

vars == <<input, config, result, done>>

\* Init: choose from ALL possible input/config combinations
\* TLC will check EVERY combination exhaustively
Init ==
    /\ input \in Inputs
    /\ config \in Configs
    /\ result = "pending"
    /\ done = FALSE

\* One action: compute the result (models the algorithm)
Compute ==
    /\ ~done
    /\ result' = ... \* model what the algorithm does
    /\ done' = TRUE
    /\ UNCHANGED <<input, config>>

\* Stuttering step so TLC doesn't report deadlock
Finished ==
    /\ done
    /\ UNCHANGED vars

Next == Compute \/ Finished

Spec == Init /\ [][Next]_vars

\* INVARIANTS: properties that must hold for ALL input combinations
PropertyHolds ==
    done => result /= "BAD"

ConsistencyCheck ==
    done => ... \* both code paths agree
====
```

**Key insight**: `Init` uses `\in` (non-deterministic choice) to let TLC explore
ALL combinations. One `Compute` action models the algorithm. Invariants check the output.

### Phase B3-B5: Same as Track A

Run TLC, interpret counterexamples, bridge to code. The counterexample trace
will show you which specific input combination violates your property.

### Example: xstate-migrate dot-replacement bug

This real bug was found using Track B:

```tla
\* Model: does the object branch construct the same path as the valid states set?
\* Init chooses hasDottedId from {TRUE, FALSE}, plus region and state names
\* Compute checks if ObjectBranchPath == ValidStatePath
\* Invariant: NoBug == done => ~bugFound
\*
\* TLC found: hasDottedId=TRUE, objectResult=3 segments, validResult=4 segments
\* The object branch kept dots in the machine ID; the valid set replaced them.
```

---

## TLA+ Gotchas

Common pitfalls that waste time if you don't know about them:

### Strings are atomic
TLA+ strings are **opaque values**. You CANNOT index into them, iterate characters,
or do substring operations. `"hello"[1]` is not valid TLA+.

**Workaround**: Model text manipulation as operations on **sequences of segments**.
For example, model the path `"my.app/auth/idle"` as `<<"my.app", "auth", "idle">>` or
`<<"my", "app", "auth", "idle">>` depending on whether dots have been replaced.

### Config files can't express complex values
The `.cfg` file only supports simple sets like `{a, b, c}` and integers.
You CANNOT write sets of tuples, sequences, or records in a `.cfg` file.

**Workaround**: Define complex constants inside the `.tla` file itself, or use
ASSUME statements, or restructure so constants are simple model values.

### Deadlock on termination
TLC reports "Deadlock reached" when no action is enabled. For specs that terminate
(compute a result and stop), you MUST add a stuttering step:

```tla
Finished ==
    /\ done
    /\ UNCHANGED vars

Next == Compute \/ Finished
Spec == Init /\ [][Next]_vars    \* no fairness needed for terminating specs
```

Without `Finished`, TLC interprets termination as deadlock.

### Naturals not included by default
If you use `+`, `-`, `<`, `>`, or number ranges like `1..N`, you must
`EXTENDS Naturals` (or `Integers`). Otherwise TLC gives a cryptic
"Could not find declaration or definition of symbol '+'" error.

### State space explosion
TLC explores ALL interleavings combinatorially. Keep constants tiny:
- 2-3 actors, not 10
- 3-5 items, not 100
- 2-3 nesting levels, not 10

If TLC runs for >10 minutes, reduce constants or add `CONSTRAINT` to bound state space.

## Integration with other skills

| Skill | Integration point |
|-------|-------------------|
| `/grill-me` | Phase 1 feeds into grill-me's interrogation. Ask "what are the concurrent actors?" |
| `/vsdd` | TLA+ spec becomes part of VSDD Phase 1 (Spec Crystallization). TLC counterexamples feed Phase 2 (TDD) |
| `/tdd` | TLC counterexamples become the test cases you write first (red) |
| `/mutation-testing` | Surviving mutants in concurrency code → check if TLA+ spec covers that path |
| `/swarm` | Model the swarm itself: what if Feature agent and CRAP agent touch the same file? |
| `/seam-tester` | TLA+ identifies which seams have concurrency risk → seam-tester writes integration tests there |

## File organization

Store TLA+ specs in `docs/tlaplus/` alongside other project documentation:

```
project/
├── docs/
│   ├── tlaplus/
│   │   ├── OfflineQueue.tla      # TLA+ spec
│   │   ├── OfflineQueue.cfg      # TLC configuration
│   │   ├── CloudSync.tla
│   │   └── CloudSync.cfg
│   ├── architecture.md
│   └── adrs/
├── src/
│   └── OfflineQueue.ts           # Implementation (links back to spec)
```

Reference the TLA+ specs from `CLAUDE.md`'s knowledge base table:

```markdown
| TLA+ formal verification | [docs/tlaplus/](docs/tlaplus/) | Running or writing TLA+ specs |
```

## Quick start

When invoked, follow this sequence:

1. Ask: "What system or component do you want to verify?" (or infer from context)
2. **Determine the track**: Is this about concurrency/distributed state (Track A) or algorithm correctness/properties (Track B)?
3. For **Track A**: Identify actors, shared state, actions, invariants (Phase A1)
   For **Track B**: Identify input space, code paths, properties, suspicious areas (Phase B1)
4. Write the TLA+ spec (Phase 2)
5. Check if TLA+ tooling is installed; if not, guide installation
6. Run TLC and interpret results (Phase 3-4)
7. If violations found: explain the counterexample, propose a design fix, update spec, rerun
8. Once verified: bridge to implementation and tests (Phase 5) — write a failing test from the counterexample FIRST, then fix the code
