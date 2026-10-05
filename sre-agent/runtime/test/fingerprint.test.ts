import { describe, expect, it } from "vitest";
import { fingerprint, normalizeMessage } from "../src/fingerprint.ts";

describe("normalizeMessage", () => {
  it("replaces volatile tokens with placeholders", () => {
    expect(
      normalizeMessage(
        'User 4821 failed at https://api.x.dev/v1?id=9 from 10.0.0.12 for a@b.co (req 3f2a9c1d77e0, id "abc")',
      ),
    ).toBe("User <n> failed at <url> from <ip> for <email> (req <hex>, id <str>)");
  });

  it("replaces uuids before numbers so they collapse to one token", () => {
    expect(normalizeMessage("room 0b5e8f2a-1c3d-4e5f-9a8b-7c6d5e4f3a2b gone")).toBe("room <uuid> gone");
  });

  it("keeps only the first line of a stack trace", () => {
    expect(normalizeMessage("TypeError: x is undefined\n    at foo (a.js:1:2)")).toBe("TypeError: x is undefined");
  });

  it("collapses whitespace and caps length at 300", () => {
    expect(normalizeMessage("a   b\t c")).toBe("a b c");
    expect(normalizeMessage("x".repeat(500))).toHaveLength(300);
  });

  it("leaves words containing hex letters alone", () => {
    expect(normalizeMessage("deadbeef cafe facade")).toBe("deadbeef cafe facade");
  });
});

describe("fingerprint", () => {
  it("is stable across volatile values", () => {
    expect(fingerprint("api", "timeout after 3000ms for user 1")).toBe(fingerprint("api", "timeout after 5000ms for user 2"));
  });

  it("differs by service and by message shape", () => {
    expect(fingerprint("api", "boom")).not.toBe(fingerprint("web", "boom"));
    expect(fingerprint("api", "boom")).not.toBe(fingerprint("api", "bang"));
  });

  it("is 12 lowercase hex chars", () => {
    expect(fingerprint("api", "boom")).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("normalizeMessage (each volatile shape)", () => {
  it("replaces plain http urls too", () => {
    expect(normalizeMessage("GET http://internal.svc/health failed")).toBe("GET <url> failed");
  });

  it("replaces whole emails with multi-character parts", () => {
    expect(normalizeMessage("no account for jane.doe+x@mail.example.com")).toBe("no account for <email>");
  });

  it("replaces hex ids that start with a letter", () => {
    expect(normalizeMessage("trace abcdef12 lost")).toBe("trace <hex> lost");
  });

  it("replaces single-quoted strings", () => {
    expect(normalizeMessage("missing key 'user_name' in body")).toBe("missing key <str> in body");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeMessage("   boom   ")).toBe("boom");
    expect(fingerprint("api", "  boom")).toBe(fingerprint("api", "boom"));
  });
});
