# Worktree Coordination

How all four agents use Git worktrees to work in parallel without conflicts.

## Layout

```
project-root/
├── .swarm/
│   ├── feature/   ← worktree on branch: swarm/feature
│   ├── crap/      ← worktree on branch: swarm/crap
│   ├── mutate/    ← worktree on branch: swarm/mutate
│   └── accept/    ← worktree on branch: swarm/accept
```

All four agents (including Feature) work in worktrees. **Main is the untouched
integration branch** — no agent works directly on main. Agents merge to main
after completing work, then rebase before starting the next cycle.

## Lifecycle

### 1. Create Worktrees (dispatcher startup)

```bash
SWARM_DIR="$PROJECT_ROOT/.swarm"

git worktree add "$SWARM_DIR/feature" -b swarm/feature
git worktree add "$SWARM_DIR/crap" -b swarm/crap
git worktree add "$SWARM_DIR/mutate" -b swarm/mutate
git worktree add "$SWARM_DIR/accept" -b swarm/accept  # if acceptance agent enabled

# Install deps in each worktree using detected PM
for wt in feature crap mutate accept; do
  [ -d "$SWARM_DIR/$wt" ] && pm_install "$SWARM_DIR/$wt"
done
```

### 2. Agent Work Cycle

Each iteration follows this pattern:

```
Rebase from main
    │
    ├── Conflict? → Resolve using judgment + git log + progress.md
    │              Run tests. If fail → abort rebase, retry next cycle.
    │
    ▼
Do the work (implement task / refactor / write tests)
    │
    ▼
Run tests, typecheck, lint
    │
    ▼
Commit with descriptive message
    │
    ▼
Merge to main
    ├── git checkout main
    ├── git merge swarm/<agent> --no-edit
    │   ├── Conflict? → Resolve, run tests, complete merge
    │   └── Success → continue
    ├── git checkout swarm/<agent>
    └── git rebase main
    │
    ▼
Append to progress.md
    │
    ▼
Next iteration (or stop)
```

### 3. Conflict Resolution

Agents resolve conflicts themselves using context:

1. Read the conflict markers to see both sides of the change
2. Run `git log -5 --oneline` to understand recent commits
3. Read `progress.md` to see what other agents were doing
4. Apply judgment: if CRAP agent refactored a function and Feature agent
   added to it, keep both changes (the refactored structure with the new logic)
5. Run the full test suite to verify the resolution is correct
6. If tests fail after resolution, abort and retry next cycle

Most conflicts are trivial because agents do fundamentally different work:
- Feature Agent modifies source code (new features)
- CRAP Agent modifies source code (refactoring existing code)
- Mutation Agent only adds/modifies test files
- Acceptance Agent fixes E2E tests or specific regression code

The realistic collision: Feature Agent and CRAP Agent both touch the same source file.
Git usually auto-merges this (different lines). In the rare case of a true conflict,
the conflict markers clearly show "new feature code" vs "refactored code" and the
agent can merge them.

### 4. Cleanup (dispatcher shutdown)

```bash
cd "$PROJECT_ROOT"

# Remove worktrees
for wt in feature crap mutate accept; do
  git worktree remove "$SWARM_DIR/$wt" --force 2>/dev/null || true
done

# Delete branches
for branch in swarm/feature swarm/crap swarm/mutate swarm/accept; do
  git branch -D "$branch" 2>/dev/null || true
done
```

## Preserving Across Runs

These files persist in `.swarm/` across runs (NOT inside worktrees):
- `.swarm/lessons.md` — cross-run learnings
- `.stryker-incremental.json` — Stryker baseline (in worktree, recreated from branch)

The `runs/` directory preserves all run history:
- `.swarm/runs/2026-03-04T22-00/progress.md`
- `.swarm/runs/2026-03-04T22-00/report.md`
- `.swarm/runs/2026-03-04T22-00/backlog.md`
- `.swarm/runs/2026-03-04T22-00/logs/*.log`

## .gitignore

```
# Swarm agent worktrees and run data
.swarm/
```

## Why Worktrees?

| Approach | Problem |
|----------|---------|
| Same working directory + file locks | Agents corrupt each other's uncommitted changes |
| Separate git clones | Wastes disk, .git not shared, merges expensive |
| Branches without worktrees | Only one branch checked out at a time |
| **Git worktrees** | Each agent has own filesystem, shares .git, merges are fast |
