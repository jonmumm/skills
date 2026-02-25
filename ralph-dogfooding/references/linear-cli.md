# Linear (dogfood reference)

Use the **linear-cli skill** for all Linear commands — list, create, update, comment. Do not duplicate its CLI docs here.

**Install (if needed):** `npx skills add https://github.com/schpet/linear-cli --skill linear-cli`. Ensure `linear` is on PATH (`linear --version`).

## Dogfood-specific

### Deduping rule

Before creating a new bug:

1. Search open issues for same route + same symptom (use the linear-cli skill).
2. If matched, update the existing issue with fresh evidence (comment or description).
3. Only create a new issue when symptom/impact is genuinely distinct.

### Artifacts

- Put artifact paths in the issue description or in a comment (e.g. `screenshots/issue-001-step-1.png`) so reviewers can open them.
- For multi-line markdown (repro steps, expected vs actual), use `--description-file` and `--body-file` as the linear-cli skill recommends.
- Use the linear-cli skill’s attachment commands if your CLI version supports binary uploads.
