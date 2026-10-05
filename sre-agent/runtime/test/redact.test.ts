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

describe("sanitizeForIssue (exact output)", () => {
  it("redacts the whole bearer token, however it is spaced", () => {
    expect(sanitizeForIssue("auth Bearer   abc.def-123 next")).toBe("auth Bearer [redacted] next");
  });

  it("redacts the whole jwt including its signature", () => {
    expect(sanitizeForIssue("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl end")).toBe("jwt [redacted] end");
  });

  it("redacts whole provider keys, including slack tokens", () => {
    expect(sanitizeForIssue("k sk-ant-api03-XYZxyz123 s xoxb-123456789-abc end")).toBe("k [redacted] s [redacted] end");
  });

  it("redacts key=value secrets but keeps the key name and separator", () => {
    expect(sanitizeForIssue("password = hunter2, api_key=abc123; apikey:zz99 api-key=q1w2e3 ok")).toBe(
      "password = [redacted], api_key=[redacted]; apikey:[redacted] api-key=[redacted] ok",
    );
  });

  it("swaps a code fence for look-alike quotes and leaves inline code alone", () => {
    expect(sanitizeForIssue("a `b` ```c")).toBe("a `b` ʼʼʼc");
  });

  it("defuses a mention at the very start with a zero-width space", () => {
    expect(sanitizeForIssue("@octocat hi @team")).toBe("@​octocat hi @​team");
  });

  it("does not truncate text exactly at the limit", () => {
    expect(sanitizeForIssue("x".repeat(20), 20)).toBe("x".repeat(20));
  });
});
