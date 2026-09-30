# The coordinator loop

The coordinator is a Claude Code session in `~/src/ogs-studio`. It never edits game repos. It reads
the board and each team's STATUS.md and scorecards, then writes to the board.

## When it runs

- After every team finishes 2 rounds, or every ~3 hours during an overnight wave.
- Before the morning report.
- Whenever a team escalates a plateau or a breakthrough.

## One consolidation pass

1. **Refresh the truth.** For each team: read `STATUS.md`, the scorecard log, the latest critic
   report, new FINDINGS lines and PLAYTESTS entries. Fix REGISTRY.yaml (status, scores, trend,
   spend, needs).
2. **Consolidate.** Rewrite CONSOLIDATED.md:
   - **Adopt everywhere:** findings that worked for one team and apply to others.
   - **Avoid:** dead ends, with the evidence.
   - **Open questions** worth a new team or pilot.
   - **Kit candidates:** the same tool built twice, or the same fix made twice.
3. **Cross-pollinate.** Write a follow-up in each team's INBOX that draws on *other teams'
   intermediate results*. Be specific: the finding, where it lives, why it applies to this team's
   lowest row, and what to try.
4. **Reorganize.** Propose, don't enact without Jon, for anything in the gates list. Options:
   - **Continue:** the min is rising.
   - **Steer:** narrow a team toward the more promising line it found.
   - **Escalate assets:** a plateau on an art- or audio-bound row. Produce assets, don't do more
     code passes.
   - **Merge:** two versions converged. Keep the better one and move the other team's findings in.
   - **Prune:** 2 consolidation passes without min gain *and* weak playtest pull. Archive with a
     findings summary.
   - **Spawn:** a new question deserves its own team (a new version, a new game, or a kit task).
   - **Divert:** one team's breakthrough unlocks others. Pause them, adopt it, resume.
5. **Promote.** A finding adopted by 2+ teams becomes a skill edit or kit change. Draft the edit;
   Jon approves commits to `~/src/skills`.
6. **Report.** Morning report (one page):
   - table: team · game · status · min score (trend) · spend · last playtest;
   - top 3 findings of the night;
   - decisions needed from Jon (proposed prunes/merges/new teams, budget);
   - what's ready to play tonight, and how to cast it.

## Prompt to start a coordinator session

```
You are the OGS Studio coordinator. Read ~/src/ogs-studio/STUDIO.md, REGISTRY.yaml,
CONSOLIDATED.md, FINDINGS.md and PLAYTESTS.md, then each team's repo STATUS.md and scorecard.
Run one consolidation pass per ~/src/skills/game-studio/references/coordinator.md. Never edit game
repos. Write the board files, then give me the one-page report and the decisions you need from me.
```

## Prompt to start or resume a team

```
You are team <name> in the OGS Studio. Read ~/src/ogs-studio/teams/<name>/CHARTER.md and INBOX.md,
the new lines in ~/src/ogs-studio/FINDINGS.md, and this repo's STATUS.md. Then run the next round
of the deep loop (game-studio SKILL.md "Going deep"). Claim shared work in REGISTRY.yaml before
starting it. Take ~/src/ogs-studio/recording.lock before recording. End the round by posting
findings, updating your registry entry and STATUS.md.
```
