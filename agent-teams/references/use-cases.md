# Agent Teams — Worked Use Cases

Deeper examples beyond the recipe library in SKILL.md. Each one shows a full spawn prompt and what makes the team shape right for the problem.

## 1. Overnight research team (Sonnet, 4 teammates)

**Goal**: come back in the morning to a written-up research report with sourced citations on a topic you don't know well yet.

```text
Create an agent team to research "structured concurrency in Swift 6 vs.
actor-kit's actor model" overnight. Spawn 4 teammates using Sonnet:

- swift-researcher: read Apple's structured concurrency docs and Swift Evolution
  proposals SE-0304, SE-0314, SE-0317. Summarize the model.
- actorkit-researcher: read the actor-kit repo at ~/src/actor-kit and its docs.
  Summarize how it differs from Swift's native actors.
- comparison-writer: wait for the first two to finish, then write
  docs/research/swift-vs-actorkit.md comparing them with a decision matrix.
- adversary: review the comparison-writer's output, challenge weak claims,
  and ensure every assertion has a citation.

Use the shared task list. Adversary should reject and re-queue the
comparison if any claim is unsupported. Goal: a single coherent doc by morning.
```

Why a team and not a single Claude: the adversary loop is the value. A single Claude tends to anchor on its first draft. The adversary as a separate teammate with its own context window challenges without the sunk-cost bias.

## 2. Multi-repo coordinated refactor (3 teammates)

**Goal**: rename a concept across an API repo, an iOS app, and a shared TypeScript types package — keeping all three green.

```text
Create an agent team for a coordinated rename: "Session" → "Conversation"
across three repos. Spawn 3 teammates:

- types-owner: cwd ~/src/escuchame-monorepo/packages/shared-types. Rename in
  TS, run pnpm typecheck. Publish the contract change to the task list as
  task "shared-types updated; consumers can pull".
- api-owner: depends on types-owner. cwd ~/src/escuchame-monorepo/apps/api.
  Pull the new types, rename DB columns + migrations, update routes, run
  pnpm test. Cannot start until types-owner's task is complete.
- ios-owner: depends on types-owner. cwd ~/src/escuchame-monorepo/apps/ios.
  Pull the new types via Codable updates, rename UI strings, run xcodebuild.
  Cannot start until types-owner's task is complete.

Use task dependencies. types-owner finishes first; api-owner and ios-owner
unblock and run in parallel. Lead: synthesize a single PR description
covering all three when done.
```

Why a team: file conflicts are zero (different repos), but the *contract* is shared. Task dependencies enforce the ordering, then parallelism kicks in.

## 3. Evals-driven design exploration (5 teammates)

**Goal**: design four candidate UIs for a feature, then evaluate them against the same eval set.

```text
Create an agent team to design + evaluate "the new explainer card" feature.
Spawn 5 teammates:

- designer-minimal, designer-playful, designer-information-dense,
  designer-progressive: each independently produces a Frame0 sketch + a
  React component in apps/web/src/explainer-cards/<variant>.tsx. They do
  not see each other's work.
- judge: waits for all 4 designers. Runs each variant through the eval
  set in evals/explainer-card.json (clarity, time-to-comprehend, accessibility
  score). Posts a ranked comparison to docs/design/explainer-card-eval.md.

The 4 designers must NOT message each other — independence is the point.
The judge can read all 4 outputs but does not influence design choices.
```

Why a team and not subagents: the designers + judge pattern needs the judge to be a peer that can read all 4 outputs after they complete, not a subagent that summarizes.

## 4. Bug triage with hooks (3 teammates + TaskCompleted gate)

**Goal**: work through Linear bug backlog with a quality gate that prevents marking tickets done without verification.

`settings.json`:
```json
{
  "hooks": {
    "TaskCompleted": [{
      "command": "cd $CLAUDE_PROJECT_DIR && pnpm test && pnpm crap || (echo 'gates failed' && exit 2)"
    }]
  }
}
```

```text
Create an agent team to work through the top 5 P1 bugs in Linear assigned to
me. Spawn 3 teammates:

- triager: pulls bug details via the linear MCP, writes one task per bug
  with acceptance criteria.
- fixer-1, fixer-2: claim bugs from the task list, write a failing test
  first (TDD), implement the fix, mark the task complete.

The TaskCompleted hook will block any task marked done without passing
pnpm test and pnpm crap (CRAP ≤ 6). If a fixer hits a blocked completion,
they fix and retry, or escalate to the lead with a summary of why the
gate is wrong.
```

Why hooks: the gate is the whole point. Without `TaskCompleted` blocking, fixers will declare victory on a fragile fix and move on.

## 5. Live incident response (2 teammates + you)

**Goal**: production is on fire, you need parallel investigation while you handle the human side (status page, incident channel).

```text
Production /api/exercises is throwing 500s. Create an emergency agent team:

- log-investigator: tail wrangler logs, grep for stack traces, identify the
  most common error signature. Report findings to the task list every 60s.
- replay-investigator: pull the last 10 failing requests from the Worker's
  Logpush, replay them locally against the production code, identify which
  inputs trigger the 500. Report to the task list.

Both should message me directly with hypotheses as they form. Don't wait
for me to ask. I'll handle the status page; you handle root cause.
```

Why a team: in an incident, your bandwidth is the bottleneck. Two teammates investigating in parallel, each messaging you proactively, beats a single sequential investigator.

## Anti-patterns

- **Same file, two teammates.** Always overwrites. Partition by file/dir.
- **Teammates that need to wait for human input.** Idle teammates burn tokens. Either give them autonomous criteria or use plan-approval mode.
- **Routine implementation work.** A 4-teammate team to add a CRUD endpoint costs 4× more than a single Claude doing the same thing — with worse coherence.
- **More than ~6 teammates.** Coordination overhead dominates. Past 6, split into multiple sequential teams.
- **Long-running independent work.** That's what `/nightshift` is for. Agent Teams shines on *coordinated* parallel work.
