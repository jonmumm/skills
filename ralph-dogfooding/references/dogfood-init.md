# Dogfood Init (reference)

Use **Playwright MCP** for all browser automation (navigate, snapshot, screenshot, click, fill). Use the **linear-cli skill** for issues, comments, and artifact paths. No agent-browser or agent-use.

## Initialization checklist

1. Confirm target URL and artifact directory (from script).
2. Copy report template into artifact dir; fill header.
3. Run route sweep with Playwright MCP; read [issue-taxonomy.md](issue-taxonomy.md) for what to look for.
4. Document each issue with screenshot sequence and append to report.
5. Create/update Linear issues with evidence; append to .ralph/dogfood-progress.md.

## Ralph loop

Iterative loop, per-iteration progress entry, `NO_NEW_FINDINGS` sentinel, dedupe against open Linear issues.
