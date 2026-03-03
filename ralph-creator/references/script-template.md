# Script Template

Copy this template and replace all `{{PLACEHOLDERS}}`.

```bash
#!/usr/bin/env bash
set -euo pipefail

# ─── CONFIG ──────────────────────────────────────────────────────────────────

ITERATIONS="${1:-{{DEFAULT_ITERATIONS}}}"
LOGDIR=".ralph/logs"
mkdir -p "$LOGDIR"

# ─── PROMPT ──────────────────────────────────────────────────────────────────
# CRITICAL: @refs and instructions MUST be in ONE string passed to claude -p.
# Passing @refs as separate CLI args causes the model to summarize file
# contents instead of acting on them. Keep the prompt short (15-30 lines).
# Detailed task descriptions go in backlog.md, not here.
# ─────────────────────────────────────────────────────────────────────────────

PROMPT='@.ralph/backlog.md @.ralph/progress.md @.ralph/lessons.md {{ADDITIONAL_CONTEXT_REFS}} \
YOUR JOB: {{ONE_SENTENCE_DIRECTIVE}} \
STEPS — follow exactly: \
1. Read .ralph/backlog.md. Find the FIRST unchecked `- [ ]` task. \
2. If no unchecked tasks remain, output <promise>COMPLETE</promise> and stop. \
3. Read the task description — it tells you exactly what to produce. \
{{EXECUTE_STEPS}} \
4. Verify: {{VERIFY_INSTRUCTION}} \
5. Edit .ralph/backlog.md — change that task from `- [ ]` to `- [x]`. \
6. Append one line to .ralph/progress.md: `- Done: <task title> — <what was produced>` \
7. If you learned something, append to .ralph/lessons.md. \
RULES: \
- ONLY work on ONE task. Do not continue to the next. \
- Write output files FIRST, then update tracking. \
{{ADDITIONAL_RULES}} \
- Do NOT summarize context files. Do NOT ask what to work on. Just execute the steps above.'

# ─── SCRIPT (no edits needed below) ──────────────────────────────────────────

cd {{PROJECT_ROOT}}

for i in $(seq 1 "$ITERATIONS"); do
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  {{NAME}} — iteration $i / $ITERATIONS"
  echo "  $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  LOGFILE="$LOGDIR/iteration-$(printf '%02d' "$i").log"

  # Stream to terminal AND log file in real-time via tee.
  # DO NOT capture to variable — it buffers everything and shows no output
  # until the entire iteration finishes (can be 10-20 minutes of silence).
  claude -p --dangerously-skip-permissions --verbose \
    "$PROMPT" \
    2>&1 | tee "$LOGFILE" || true

  if grep -q '<promise>COMPLETE</promise>' "$LOGFILE"; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ALL TASKS COMPLETE after $i iteration(s)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
  fi

  sleep 5
done

echo ""
echo "Reached max iterations ($ITERATIONS). Check .ralph/backlog.md for remaining tasks."
```

## Placeholder Reference

| Placeholder | What to fill in | Example |
|---|---|---|
| `{{ONE_SENTENCE_DIRECTIVE}}` | Imperative statement of what each iteration produces | `Write ONE Gherkin feature file per the backlog, then stop.` |
| `{{DEFAULT_ITERATIONS}}` | Default iteration count (task count + 2) | `15` |
| `{{ADDITIONAL_CONTEXT_REFS}}` | Extra `@path/to/file` refs inline in prompt (or empty) | `@docs/spec.md @.ralph/style-guide.md` |
| `{{EXECUTE_STEPS}}` | Numbered sub-steps for the domain-specific work (continue numbering from step 3) | See examples below |
| `{{VERIFY_INSTRUCTION}}` | One-line verification action | `Read the file back to confirm it was written correctly.` |
| `{{ADDITIONAL_RULES}}` | Extra domain-specific rules (one `- ` bullet per rule) | `- Every scenario must reference real values from the specs.` |
| `{{PROJECT_ROOT}}` | Path to cd into before running | `/Users/me/my-project` |
| `{{NAME}}` | Short name for the loop (used in output headers) | `ralph-gherkin` |

## Execute Steps Examples

### For writing files (specs, tests, docs):
```
3a. Read the task description — it tells you the filename and what to cover.
3b. Write the file to <output_dir>/<filename> as specified.
3c. Follow the style guide in <style-guide-file>.
```

### For code changes:
```
3a. Read the task description — it specifies what to implement and where.
3b. Read the target files to understand existing code.
3c. Make the changes. Follow existing patterns in the codebase.
3d. Run tests: <test_command>
```

### For using MCP tools or CLIs:
```
3a. Read the task description for what to build.
3b. Use the <tool_name> MCP tool to <action>. Call <specific_function> with <specific_params>.
3c. Write results to <output_path>.
```
