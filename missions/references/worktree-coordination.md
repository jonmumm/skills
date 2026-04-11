# Worktree Coordination

How missions uses Git worktrees to isolate worker agents from main.

## Layout

```
project-root/           <- main branch (integration target)
├── .missions/
│   └── worker/         <- worktree on branch: mission/worker
```

Unlike swarm (which uses 4 parallel worktrees), missions uses a single worker
worktree that is created, used, merged, and reset for each feature. Workers
are sequential within a milestone, so only one worktree is needed at a time.

## Lifecycle

### 1. Create Worker Worktree

Before each feature, the dispatcher creates a fresh worktree:

```bash
# Clean up any existing worker worktree
git worktree remove .missions/worker --force 2>/dev/null || true
git branch -D mission/worker 2>/dev/null || true

# Create fresh worktree from current main
git worktree add .missions/worker -b mission/worker

# Install dependencies
pnpm install --frozen-lockfile  # (or detected PM)
```

### 2. Worker Implements Feature

The worker operates entirely within `.missions/worker/`:
- Reads project code
- Writes tests (red)
- Implements (green)
- Refactors
- Commits to `mission/worker` branch

### 3. Merge to Main

After the worker completes, the dispatcher merges:

```bash
cd project-root  # main branch
git merge mission/worker --no-edit

# Verify tests pass on main
pnpm test

# If tests fail: revert the merge
git reset --hard HEAD~1

# If tests pass: clean up and recreate for next feature
git worktree remove .missions/worker --force
git branch -D mission/worker
```

### 4. Reset for Next Feature

After merge, the worktree is destroyed and recreated from the updated main.
This ensures each worker starts with a clean state that includes all prior
features' changes.

```
Feature 1 → worker worktree → merge to main → destroy worktree
Feature 2 → new worktree (from updated main) → merge → destroy
Feature 3 → new worktree (from updated main) → merge → destroy
...
Validation runs on main (which now has all features)
```

### 5. Cleanup on Exit

```bash
git worktree remove .missions/worker --force 2>/dev/null || true
git branch -D mission/worker 2>/dev/null || true
```

## Why Sequential (not Parallel)?

Missions workers are sequential within a milestone because:

1. **Feature dependencies:** Feature B often depends on Feature A's schema/API.
   Parallel workers would need complex coordination to handle this.

2. **Merge simplicity:** Sequential merge is always a fast-forward or trivial
   merge. Parallel workers create real merge conflicts.

3. **Context isolation is the goal, not parallelism.** The point of worktrees
   in missions is cognitive isolation (fresh agent context per feature), not
   speed. Each worker gets clean context without accumulated implementation bias.

4. **Validation IS parallel.** The parallelism in missions comes from running
   scrutiny + contract + codex validators simultaneously, not from workers.

## Comparison with Swarm

| | Missions | Swarm |
|---|---|---|
| **Worktrees** | 1 (sequential, recreated per feature) | 4 (parallel, persistent) |
| **Branches** | `mission/worker` (ephemeral) | `swarm/feature`, `swarm/crap`, etc. (persistent) |
| **Merge strategy** | Merge after each feature, destroy worktree | Merge after each iteration, rebase |
| **Conflict risk** | None (sequential) | Real (parallel workers touch same files) |
| **Purpose** | Cognitive isolation | File-system isolation + parallelism |

## Validators Don't Use Worktrees

Validators run on `main` (the project root) because they need to exercise the
integrated system, not an isolated branch. They're read-only agents — they
don't commit code.

## .gitignore

```
# Missions agent data
.missions/
```

The dispatcher adds this automatically at startup.

## Preserving Across Missions

These files persist in `.missions/` across missions:
- `lessons.md` — cross-mission learnings
- `config.json` — project-specific settings

Each run's artifacts live in `.missions/runs/<timestamp>/` and are preserved
for post-mission review.
