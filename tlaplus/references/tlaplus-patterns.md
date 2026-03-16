# TLA+ Syntax Reference & Common Patterns

## TLA+ vs TLC

- **TLA+** is the specification LANGUAGE — you write `.tla` files describing your system's behavior
- **TLC** is the model CHECKER — a tool that reads your TLA+ spec and exhaustively explores every reachable state to verify your invariants hold
- Think of it like: TLA+ is TypeScript, TLC is the TypeScript compiler. One defines, the other verifies.

There's also **TLAPS** (TLA+ Proof System) for mathematical proofs, but TLC is what you'll use 99% of the time.

## Basic syntax

```tla
---- MODULE Name ----
EXTENDS Integers, Sequences, FiniteSets

\* This is a comment
(* This is also a comment *)

\* Constants (declared here, values set in .cfg file)
CONSTANTS Items, MaxSize

\* Variables (the mutable state of your system)
VARIABLES x, y, z

\* Tuple of all variables (used in stuttering steps)
vars == <<x, y, z>>

\* Operators (like functions)
IsEmpty(seq) == Len(seq) = 0
Max(a, b) == IF a > b THEN a ELSE b

====  \* end of module
```

## State and transitions

```tla
\* Initial state predicate
Init ==
    /\ x = 0           \* conjunction (AND)
    /\ y = {}           \* empty set
    /\ z = <<>>         \* empty sequence (tuple)

\* Action: describes how state changes
\* Primed variables (x') are the NEXT state
\* UNCHANGED means those variables don't change in this action
Increment ==
    /\ x < 10           \* precondition (guard)
    /\ x' = x + 1       \* next state of x
    /\ UNCHANGED <<y, z>>

\* Next-state relation: disjunction of all possible actions
Next ==
    \/ Increment
    \/ Decrement
    \/ Reset

\* Full specification
Spec == Init /\ [][Next]_vars
\* [][Next]_vars means: every step is either a Next step or a stuttering step
```

## Data structures

```tla
\* Sets
S == {1, 2, 3}
S == 1..10                    \* range
S == {"a", "b", "c"}
x \in S                       \* membership
S \union T                     \* union
S \intersect T                 \* intersection
S \ T                          \* set difference
SUBSET S                       \* power set
Cardinality(S)                 \* size (needs FiniteSets)

\* Sequences (ordered, like arrays)
seq == <<1, 2, 3>>
Len(seq)                       \* length
Head(seq)                      \* first element
Tail(seq)                      \* all but first
Append(seq, item)              \* add to end
seq[1]                         \* first element (1-indexed!)
SubSeq(seq, 2, 4)             \* subsequence

\* Records (like structs/objects)
record == [method |-> "POST", path |-> "/sync", retries |-> 0]
record.method                  \* field access
[record EXCEPT !.retries = @ + 1]  \* update (@ = current value)

\* Functions (maps from domain to range)
f == [item \in Items |-> 0]    \* all items map to 0
f[item]                        \* lookup
[f EXCEPT ![item] = @ + 1]    \* update
```

## Quantifiers and logic

```tla
\* Universal: for ALL elements
\A item \in S : item > 0      \* all items positive

\* Existential: there EXISTS an element
\E item \in S : item > 10     \* at least one item > 10

\* CHOOSE: pick an arbitrary element satisfying predicate
CHOOSE item \in S : item > 5

\* Logic
/\    \* AND (conjunction)
\/    \* OR (disjunction)
~     \* NOT
=>    \* IMPLIES
<=>   \* IF AND ONLY IF
```

## Processes (PlusCal — simpler syntax)

PlusCal is an algorithm language that compiles to TLA+. Often easier for modeling concurrent systems:

```tla
---- MODULE QueueSystem ----
EXTENDS Integers, Sequences, TLC

(*--algorithm QueueSystem
variables
    queue = <<>>,
    processed = {},
    isReplaying = FALSE;

process Producer \in {"p1", "p2"}
begin
    Produce:
        queue := Append(queue, self);
end process;

process Consumer = "consumer"
begin
    ConsumeLoop:
        while TRUE do
            Acquire:
                await queue /= <<>>;
                await ~isReplaying;
                isReplaying := TRUE;
            Process:
                processed := processed \union {Head(queue)};
                queue := Tail(queue);
            Release:
                isReplaying := FALSE;
        end while;
end process;

end algorithm; *)

\* Invariants
NoDoubleProcess == \A item \in processed : TRUE  \* placeholder
QueueMonotonic == Len(queue) >= 0

====
```

Compile PlusCal to TLA+:
```bash
java -cp tla2tools.jar pcal.trans QueueSystem.tla
```

## Common patterns

### Mutex / Lock

```tla
VARIABLES lock, holder

Acquire(proc) ==
    /\ lock = "free"
    /\ lock' = "held"
    /\ holder' = proc

Release(proc) ==
    /\ holder = proc
    /\ lock' = "free"
    /\ holder' = "none"

MutualExclusion == Cardinality({p \in Procs : holder = p}) <= 1
```

### Queue with FIFO ordering

```tla
VARIABLES queue, processed

Enqueue(item) ==
    /\ queue' = Append(queue, item)
    /\ UNCHANGED processed

Dequeue ==
    /\ queue /= <<>>
    /\ processed' = Append(processed, Head(queue))
    /\ queue' = Tail(queue)

FIFOPreserved ==
    \A i, j \in 1..Len(processed) :
        i < j => \* processed[i] was enqueued before processed[j]
```

### Retry with max attempts

```tla
VARIABLES retryCount, status

Attempt ==
    /\ status = "pending"
    /\ retryCount < MaxRetries
    /\ retryCount' = retryCount + 1
    /\ status' = IF success THEN "done" ELSE "pending"

GiveUp ==
    /\ status = "pending"
    /\ retryCount >= MaxRetries
    /\ status' = "failed"

NeverStuck == status /= "pending" \/ retryCount < MaxRetries
```

### Crash and recovery

```tla
VARIABLES state, persistedState

Crash(proc) ==
    /\ state' = [state EXCEPT ![proc] = "crashed"]
    /\ UNCHANGED persistedState  \* durable state survives

Recover(proc) ==
    /\ state[proc] = "crashed"
    /\ state' = [state EXCEPT ![proc] = "recovering"]
    \* Restore from persisted state
```

### Offline sync (client-server)

```tla
VARIABLES clientData, serverData, syncQueue, network

ClientWrite(key, value) ==
    /\ clientData' = [clientData EXCEPT ![key] = value]
    /\ syncQueue' = Append(syncQueue, [key |-> key, value |-> value])
    /\ UNCHANGED <<serverData, network>>

SyncToServer ==
    /\ network = "up"
    /\ syncQueue /= <<>>
    /\ LET item == Head(syncQueue) IN
        /\ serverData' = [serverData EXCEPT ![item.key] = item.value]
        /\ syncQueue' = Tail(syncQueue)
    /\ UNCHANGED <<clientData, network>>

ServerWrite(key, value) ==
    /\ serverData' = [serverData EXCEPT ![key] = value]
    /\ UNCHANGED <<clientData, syncQueue, network>>

NetworkDrop ==
    /\ network' = "down"
    /\ UNCHANGED <<clientData, serverData, syncQueue>>

NetworkRestore ==
    /\ network' = "up"
    /\ UNCHANGED <<clientData, serverData, syncQueue>>

\* Invariant: after sync completes with no pending items and network up,
\* client and server agree
EventualConsistency ==
    (syncQueue = <<>> /\ network = "up") => clientData = serverData
```

## TLC configuration file (.cfg)

```cfg
\* What to check
SPECIFICATION Spec
INVARIANT NoDoubleProcess QueueMonotonic
PROPERTY EventualLiveness

\* Constant values (keep small for tractability)
CONSTANTS
    Workers = {w1, w2, w3}
    MaxRetries = 3
    Items = {item1, item2, item3}

\* Symmetry sets (optimization: w1 and w2 are interchangeable)
SYMMETRY WorkerSymmetry

\* State constraint (bound the state space)
CONSTRAINT StateConstraint
```

## Tips for effective model checking

1. **Start tiny**: 2 actors, 2-3 items. Verify, then scale up
2. **Add actions incrementally**: Start with the happy path, then add crashes, network drops, timeouts
3. **State space explosion**: If TLC runs for >10 minutes, reduce constants or add state constraints
4. **Symmetry sets**: If actors are interchangeable, declare symmetry to reduce state space
5. **Deadlock checking**: TLC checks for deadlock by default. Add `PROPERTY Termination` if the system should halt, or disable with `-deadlock` flag if non-termination is expected
6. **Counterexample traces**: The most valuable output. Each trace is a test case waiting to be written
