---
name: usage-burn
description: >
  Spend the rest of the week's Claude plan allowance on work that compounds: read the plan meter,
  set a pace to land near 100% at the reset, pick work by "what is scarce now that building is
  cheap", preflight the repos, launch one side session per independent piece, then steer on every
  wake (sample usage, add or pause sessions to stay on pace, route results between sessions).
  Use when Jon says he has unused usage/credits/allowance before a reset, "burn my credits",
  "use all my usage", "I'm not using my plan", "keep agents busy until Monday", or "/usage-burn".
dependsOn:
  - jonmumm/skills@aaa-hillclimb
  - jonmumm/skills@swarm
  - jonmumm/skills@nightshift
---

# Usage burn

The plan allowance resets weekly and does not roll over. Unused percent is lost. The goal is
to land at about 95% when it resets, spent on work that is still worth something next week.

## 1. Read the meter

Call `mcp__ccd_session_mgmt__get_usage`. It gives percent used and the reset time for the
5-hour window, the weekly all-models limit, and per-model weekly limits. It does not give
token or dollar counts, so projections are in percent.

- `remaining = 100 - weekly.percentUsed`
- `hours = weekly.resetsIn`
- `target pace = remaining / hours` (percent of the weekly limit per hour)

The 5-hour window caps how fast you can burn. If it would hit 100% before its own reset,
running more sessions just stalls them.

Append every sample to `~/.claude/usage-burn/log.tsv`:
`iso_time  five_hour_pct  weekly_pct  sessions_working  note`.

## 2. Pick the work

Building is cheap, so another new project is the lowest-value way to spend the allowance.
Rank candidates in this order:

1. **Distribution and real players:** onboarding funnels, invite loops, public pages, try-without-install paths.
2. **Polish the one or two best things** until they're good enough to show strangers (`/aaa-hillclimb`, `/design-hillclimb`).
3. **Harden shared infrastructure** that every future build leans on (`/swarm` hardening: CRAP, mutation, seam tests).
4. **Research that feeds next week's bets.** It finishes fast, so route its output to the builders.

Find candidates in recent git activity under `~/src`, `progress.md`, `docs/exec-plans/active/`
and open issues. Show Jon the ranked list in one message and start without waiting, unless a
pick needs his money, his login or a public post.

## 3. Preflight (each item has bitten before)

- **Repo trust:** `start_session` refuses a repo the app hasn't trusted yet. Ask Jon to
  trust every target repo in one batch before launching anything.
- **Git identity:** run `git config user.email` in each repo. A placeholder like `ai@example.com`
  means every commit gets the wrong author. Flag it; don't change global config without asking.
- **Remote:** if a repo has no `origin`, its commits are the only backup. Say so in the brief.
- **Right target:** before hardening a library "every game uses", check what the consumers
  actually pin. Tonight the games pinned npm `actor-kit@0.52.6` plus a patch, while the session
  hardened `actor-kit-2`, so none of its fixes reached them.
- **Keep awake:** local sessions stop when the Mac sleeps. Call `mcp__ccd_host__request_keep_awake`
  with `until: "session_idle"`. Tell Jon to leave the lid open and the app running.
- **Paid services:** briefs repeat the rules: Codex images first, `--dry` before paid
  calls, never raise caps, stop on "usage limit" or "exhausted balance".

## 4. Launch

Start one session per independent piece (`start_session`, `initiation: "user_asked"`,
`use_worktree: true`, `wake_when_done: true`). Each brief contains:

- the goal, what done looks like, and a time horizon (about 20 hours, or until the reset)
- **scope fences:** the files it owns, plus every sibling session's name and what that session owns
- "Commit at every milestone; keep `progress.md`; decide routine questions yourself"
- a fixed status line at the end of each turn (done / in progress / blocked plus the exact command Jon must run)
- the money and taste rules from `~/.claude/CLAUDE.md`

**One owner per repo.** When Jon adds work in a repo that already has a session, send that
session the new phases in order with `SendMessage`. Don't start a second writer there.

**Sizing:** on 2026-10-18, 7 Opus sessions burned about 2.4% of the weekly limit and about 7% of
the 5-hour window per hour, which is roughly 0.35% weekly per session-hour. Divide the target
pace by that to get a starting session count, then recalibrate from your own samples. Readings
are whole percents, so space them at least 30 minutes apart.

## 5. Steer on every wake

Each time a session ends a turn:

0. **Detect dead sessions:** if several sessions went idle at the same moment, read their last event
   (`list_events`, limit 4). `exited with code 143` means they were SIGTERMed (on 2026-10-18 the app
   restarted at 23:04). Resume each one with a message: run git status, commit any work worth keeping,
   and restart any background jobs that died. Skip adding sessions that hour.
1. Sample usage and log it. Compute the burn rate from the last two samples and project weekly % at reset.
2. **Check the work, not the report:** run `git log` on its branch. Report only commits that exist.
3. Route the outputs: research becomes briefs for builders (`SendMessage` to the owning
   session, or a new session if nobody owns it).
4. Adjust:
   - projected below 90%: add a session (next backlog item) or widen an idle one's scope
   - projected above 100% before reset: pause the lowest-ranked session
   - 5-hour window above 85%: add nothing until it resets
5. A finished session gets its next piece or gets archived. Never leave a session idle while the projection is below target.
6. **Peer requests that change existing tests or shared defaults go to Jon.** Tell the session
   to hold, ask Jon as one question with the session's recommendation, then pass his answer on in his own words.

**While Jon sleeps**, wakes from sessions can stall. Schedule them yourself with `CronCreate`:
an hourly recurring check-in (off the hour, for example `17 * * * *`) that runs this step, plus a
one-shot about 2 hours before the reset that runs step 6. A cron-fired turn **cannot start new
sessions** (the app refuses them). To add capacity overnight, give a finished, idle session a new
task with `SendMessage` and have it make its own worktree in the target repo. Before bed, start one
spare session for this if none is likely to finish. Both are session-only and die if the
app quits. Anything that needs Jon (posts, repos, production deploys, paid spend) goes in
`~/.claude/usage-burn/morning.md` instead of being done.

## 6. Land it

About 2 hours before the reset, message every session: finish the current step, commit,
and write the status. Then give Jon one report: for each session, committed / deployed /
verified on a device, its branch, and whatever is waiting on him (posts, repo creation, TestFlight, domains).
