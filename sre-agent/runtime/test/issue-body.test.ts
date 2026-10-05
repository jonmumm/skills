import { describe, expect, it } from "vitest";
import { nextMarker, parseMarker, renderIssue } from "../src/issue-body.ts";
import type { Group, Marker } from "../src/schemas.ts";

const group: Group = {
  fingerprint: "abc123abc123",
  service: "api",
  normalized: "timeout for user <n> cc @octocat",
  sample: "timeout for user 42 token=s3cret ```",
  count: 3,
  firstSeen: Date.UTC(2026, 9, 5, 12, 0),
  lastSeen: Date.UTC(2026, 9, 5, 12, 10),
  versionIds: ["v9"],
};

describe("markers", () => {
  it("round-trips through the rendered body", () => {
    const marker: Marker = { fp: "abc123abc123", service: "api", total: 3, firstSeen: 1, lastSeen: 2 };
    expect(parseMarker(renderIssue(group, marker).body)).toEqual(marker);
  });

  it("returns null for bodies without a valid marker", () => {
    expect(parseMarker(null)).toBeNull();
    expect(parseMarker("hello")).toBeNull();
    expect(parseMarker('<!-- sre-agent:v1 {"fp":1} -->')).toBeNull();
    expect(parseMarker("<!-- sre-agent:v1 {not json} -->")).toBeNull();
  });

  it("starts a new marker from the group", () => {
    expect(nextMarker(null, group)).toEqual({ fp: group.fingerprint, service: "api", total: 3, firstSeen: group.firstSeen, lastSeen: group.lastSeen });
  });

  it("accumulates totals and keeps first-seen on later runs", () => {
    const prev: Marker = { fp: group.fingerprint, service: "api", total: 10, firstSeen: 5, lastSeen: 6 };
    expect(nextMarker(prev, group)).toEqual({ ...prev, total: 13, lastSeen: group.lastSeen });
  });
});

describe("renderIssue", () => {
  const { title, body } = renderIssue(group, nextMarker(null, group));

  it("titles with service and normalized message, without pinging anyone", () => {
    expect(title.startsWith("[sre] api: timeout for user <n>")).toBe(true);
    expect(title).not.toMatch(/(^|\s)@\w/);
  });

  it("caps the title length", () => {
    expect(renderIssue({ ...group, normalized: "y".repeat(400) }, nextMarker(null, group)).title.length).toBeLessThanOrEqual(120);
  });

  it("shows counts, times, versions and a sanitized sample", () => {
    expect(body).toContain("| Occurrences | 3 |");
    expect(body).toContain("2026-10-05T12:00:00.000Z");
    expect(body).toContain("v9");
    expect(body).not.toContain("s3cret");
    expect(body.match(/```/g)).toHaveLength(2); // only our own fence
  });

  it("tells the reader the sample is untrusted and how to mute", () => {
    expect(body).toMatch(/untrusted/i);
    expect(body).toMatch(/not planned/);
  });
});
