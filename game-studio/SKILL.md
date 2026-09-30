---
name: game-studio
description: >
  Run many game teams at once, wide and deep, toward one studio goal: parallel teams each own a
  different game or a different version of one, share findings on a studio board, and a
  coordinator consolidates insights, re-steers, prunes and spins up new teams, with Jon and the
  kids as final judges. Use for "go wide and deep", "make a ton of games", "run a studio",
  "parallel game teams", "agent teams for games", or planning several OGS games at once.
---

# Game Studio (wide and deep)

The pattern comes from OpenAI's agent-teams talk at Dev Day 2026 (10,000 agents on
Navier–Stokes), adapted for building OGS games:

1. **One unified goal.** Every team works toward the same studio goal and is scored on the same
   studio scorecard.
2. **Go wide by varying the problem.** Start several teams, each with a *different version* of the
   problem, prompted to take a different approach. Each team is a lead with subagents under it.
3. **Go deep inside each team.** A team owns its idea, and its depth passes change the game for real.
4. **Teams talk to each other.** "Team 1, you should know team 2 just found X." Every team can see
   what every other team is working on, **so nobody duplicates effort**.
5. **A coordinator consolidates.** It gathers the most useful insights from every team and sends
   follow-up prompts built from the teams' own intermediate results.
6. **Reorganize as you learn.** New findings raise new questions, so create new teams, steer teams
   toward the more promising line, and divert everyone when something breaks through. **The way
   the work is divided can change. The goal stays the same.**
7. **Pilot on an easier problem first.** They did an easier related problem before the real one.
   For us, one small slice proves the pipeline before a fleet runs.

For games, "deep" is the per-game loop that already works: `cast-party-game` for the format and
skeleton, `procedural-3d-web-game` for the critic loop and scene quality, `ai-art-assets` for art,
`game-design-stages` for paper sims. This skill adds the wide part: the studio board, the teams,
the coordinator and the kids.

## The studio

A small repo, `~/src/ogs-studio`, holds only the board (no game code):

```
ogs-studio/
  STUDIO.md          goal, studio scorecard, principles, budgets, human gates
  REGISTRY.yaml      every team: game, repo, version/angle, status, owner model, port, scores, budget
  FINDINGS.md        append-only findings, tagged, dated, by team
  CONSOLIDATED.md    the coordinator's latest synthesis: adopt, avoid, open questions
  PLAYTESTS.md       what the kids actually did (the ground truth)
  IDEAS.md           the idea funnel (see references/idea-funnel.md)
  teams/<team>/CHARTER.md   the team's version of the problem, its angle, its limits
  teams/<team>/INBOX.md     follow-up prompts from the coordinator (the team reads this every round)
```

File formats and templates are in [references/board.md](references/board.md).

## Roles

- **Jon (and the kids): strategic decisions and final judgment.** Jon approves the goal, the
  budgets, new teams and prunes. The kids' playtests decide what's fun. "Asked to play it again
  tomorrow" beats any critic score.
- **Coordinator:** a Claude Code session in `ogs-studio`. It **never builds games.** It reads the
  board, consolidates, writes inboxes, proposes reorganizations and keeps the registry true.
  Its loop is in [references/coordinator.md](references/coordinator.md).
- **Team lead:** one Claude Code session per game repo (the repos keep teams isolated). It runs the
  deep loop and delegates to subagents it owns:
  - a **scene owner** (Opus) for `src/client/scene/**`, art and contact sheets;
  - a **logic and phones** owner (or the lead itself);
  - an **audio/art producer** when rows are asset-bound;
  - a **fresh critic** every round that never sees the code.
- **Kit team (optional, recommended):** owns shared tooling (recorder, evidence pack, audio report,
  stream-check, trailer, art pipeline). It turns duplicated per-game scripts into one kit, so game
  teams stop rebuilding them.

## Going wide: two levels

**1. Across games (the catalog).** Run the idea funnel: 20+ ideas are scored against the studio
rubric, the top 4–6 get paper-prototyped in parallel (the pilot problems), and 2–4 get built. Keep
the catalog diverse: two teams must never build the same game. The registry makes overlap visible.

**2. Within one game (versions).** For the first playable slice, run 2–3 teams or worktrees on
*different versions of the same brief*, each prompted toward a different approach. Examples:
- a 2.5D painted diorama vs procedural 3D vs paper-craft;
- turn-based co-op vs simultaneous vs asymmetric information;
- the kid steers vs the kid decides vs the kid performs.

The same critic scorecard applies to all of them. Kids play the top two. Merge the winner, and keep
the losers' findings on the board, not their code.

## Going deep: the per-team loop

Each team runs rounds (see `procedural-3d-web-game/references/critic-loop.md`):

1. **Read** its INBOX and every FINDINGS entry since its last round. Adopt what applies.
2. **Plan** the round against the lowest scorecard rows. Claim shared work in the registry before
   starting it.
3. **Build** with owners: a Sonnet first pass for breadth, then Opus area owners for depth. One
   write-owner per area.
4. **Evidence:** recording, contact sheets, phone sheets, audio report, perf. The evidence rig
   itself gets checked first, because rig bugs mislead critics.
5. **Critic:** a fresh subagent scores against named references (e.g. Nintendo first-party
   quality), never against the previous round.
6. **Post** 1–3 findings to FINDINGS.md (things another team can use), update the registry
   scores, and write STATUS.md so the team can be resumed.

A team stops and escalates to the coordinator when the minimum doesn't rise for 2 rounds. The
usual cause is an asset-bound row (art or audio) that code can't move. The coordinator decides:
produce assets, change the version, merge into another team, or prune.

## Communication rules (what makes it a studio, not N separate projects)

- **Findings are for other teams.** Post things with reach: "`pow()` of a negative base → NaN →
  black frames under bloom; guard it", "iPad sound buttons looked like choices; round drums with a
  speaker badge fixed it". Skip team-local trivia.
- **Tag every finding:** `[kit] [art] [audio] [ios] [cast] [design] [kid] [critic] [perf]`, and
  mark it `adopt` (everyone should do this) or `fyi`.
- **Claim before building shared things** in REGISTRY.yaml `claims:`. Nobody builds a second
  recorder.
- **Durable first, messages second.** The board files are the source of truth. They survive
  restarts and can be read by any session. Live nudges between sessions (SendMessage between local
  sessions, agent-team mailboxes) are optional extras.
- **Promote what's proven.** When a finding is adopted by 2+ teams, the coordinator proposes moving
  it into a skill (`cast-party-game`, `procedural-3d-web-game`, `ai-art-assets`) or the kit. Skills
  carry the cross-pollination forward in time.

## Running it in Claude Code

- **Concurrency:** 2–4 game teams on one Mac. The limits are real:
  - **Tokens:** each team is a full session.
  - **GPU and CoreAudio contention during recording:** take a `recording.lock` in `ogs-studio`
    before recording.
  - **Ports:** each game gets a fixed port in the registry.
  - **Jon's attention:** gates batch to phase boundaries.
- **Starting teams:**
  - by hand: one terminal or cmux workspace per repo, running `claude` with a kickoff prompt
    generated from the CHARTER;
  - headless overnight: a `claude -p` loop per team, nightshift-style, with `STATUS.md` as the
    resume point.
- **Versions inside one game:** git worktrees (`git worktree add ../<game>-vB -b version-b`, or the
  Agent tool with `isolation: worktree`). The critic compares them; the winner merges.
- **Agent Teams** (see the `agent-teams` skill) fits *within* one team for competing variants that
  must argue (≤6 teammates, one team per session, no nesting). The studio level uses separate
  sessions plus the board.
- **Budgets:** per team, in `REGISTRY.yaml` (fal, ElevenLabs, Runway, Meshy spend plus model
  choice), mirrored into each repo's `.asset-budget.json`, where the generator scripts enforce
  them. The coordinator reads real spend from `node ~/src/skills/ai-art-assets/scripts/spend.mjs
  report` and puts it in the morning report. The team caps together must fit the wallet: on Sep 29 four
  uncapped teams drained fal and Meshy in one night.
  - Check fal and other balances before an overnight run. Teams have stalled on "awaiting fal
    credit".

## Human gates (batched, so Jon isn't interrupted all night)

- **Before a wave:** Jon approves STUDIO.md changes, new teams, versions and budgets.
- **Morning report:** the coordinator writes one page:
  - scores by team and trend;
  - the best 3 findings;
  - proposed prunes, merges and new teams;
  - what each team needs from Jon.
- **Kid playtest:** after each playable milestone, using [references/playtest.md](references/playtest.md).
  Playtest results override critic scores.

## Anti-patterns (seen in the first OGS games)

- **Every game rebuilding the same tooling.** Six games each built their own recorder, contact
  sheet, evidence pack, stream-check, trailer, CRAP and mutation config. That's kit-team work.
- **Chasing a critic plateau with code** when the row is art-bound. Escalate instead.
- **Agents editing tests to fit their changes.** Tests change only when the spec changes, and the
  change is flagged in the morning report.
- **Divergent conventions:** different ports, doc names and evidence folders. The kit template
  fixes these.
- **Stale docs:** "procedural-3d isn't installed" when it is; CLAUDE.md rules overridden by later
  decisions. The coordinator checks this.
- **Critics disagreeing round to round on near-identical frames.** Use 2 critics and take the
  median, or anchor them with reference frames.
