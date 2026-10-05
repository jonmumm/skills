import { describe, expect, it } from "vitest";
import { sanitizeForIssue } from "../src/redact.ts";

describe("sanitizeForIssue", () => {
  it("redacts bearer tokens, api keys, jwts and key=value secrets", () => {
    const out = sanitizeForIssue(
      "Authorization: Bearer abc.def-123 key sk-ant-api03-XYZxyz123 jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig password=hunter2 token: tok_99",
    );
    expect(out).not.toMatch(/abc\.def-123|sk-ant|eyJhbGci|hunter2|tok_99/);
    expect(out).toContain("[redacted]");
  });

  it("redacts emails and ip addresses", () => {
    expect(sanitizeForIssue("from jane@example.com at 192.168.1.20")).toBe("from [email] at [ip]");
  });

  it("cannot break out of a markdown code fence", () => {
    expect(sanitizeForIssue("```\n## injected")).not.toContain("```");
  });

  it("does not ping users or teams", () => {
    expect(sanitizeForIssue("cc @octocat and @org/team")).not.toMatch(/(^|\s)@\w/);
  });

  it("truncates to the given length with a marker", () => {
    const out = sanitizeForIssue("x".repeat(100), 20);
    expect(out).toBe(`${"x".repeat(20)}…[truncated]`);
  });
});
