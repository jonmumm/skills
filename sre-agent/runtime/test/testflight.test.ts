import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crashSignature, parseCrashLog } from "../src/sources/crash-log.ts";
import { fetchTestflightEvents, signAscJwt } from "../src/sources/testflight.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/testflight/${name}`, import.meta.url), "utf8");
const json = (name: string) => JSON.parse(fixture(name));

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const auth = { keyId: "KEY123", issuerId: "issuer-uuid", privateKey: pem };
const NOW = Date.parse("2026-10-11T17:00:00.000Z");

const crashSignatureStack = crashSignature(parseCrashLog(fixture("crash-symbolicated.txt"))).stack;
const b64json = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("signAscJwt", () => {
  it("signs an ES256 token App Store Connect accepts: kid header, issuer, audience, 20-minute expiry", () => {
    const token = signAscJwt(auth, NOW);
    const [h, p, sig] = token.split(".");
    expect(b64json(h!)).toEqual({ alg: "ES256", kid: "KEY123", typ: "JWT" });
    expect(b64json(p!)).toEqual({ iss: "issuer-uuid", iat: NOW / 1000, exp: NOW / 1000 + 1200, aud: "appstoreconnect-v1" });
    const ok = verify("sha256", Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig!, "base64url"));
    expect(ok).toBe(true);
  });

  it("accepts a key whose newlines were stored as \\n", () => {
    const token = signAscJwt({ ...auth, privateKey: pem.replace(/\n/g, "\\n") }, NOW);
    const [h, p, sig] = token.split(".");
    expect(verify("sha256", Buffer.from(`${h}.${p}`), { key: createPublicKey(pem), dsaEncoding: "ieee-p1363" }, Buffer.from(sig!, "base64url"))).toBe(true);
  });
});

type Route = (url: URL) => Response | undefined;

function fakeAsc(routes: Record<string, unknown>, extra?: Route) {
  const calls: Array<{ url: URL; auth: string | null }> = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    const custom = extra?.(url);
    if (custom) return custom;
    const body = routes[url.pathname];
    return body === undefined ? new Response(JSON.stringify({ errors: [{ status: "404", detail: `no route ${url.pathname}` }] }), { status: 404 }) : new Response(JSON.stringify(body));
  };
  return { fetch, calls };
}

const standardRoutes = () => ({
  "/v1/apps": { data: [{ type: "apps", id: "app-1", attributes: { bundleId: "com.escuchame" } }] },
  "/v1/apps/app-1/betaFeedbackScreenshotSubmissions": json("screenshots.json"),
  "/v1/apps/app-1/betaFeedbackCrashSubmissions": json("crashes.json"),
  "/v1/betaFeedbackCrashSubmissions/AK7UjG-qL5QxXf3gIOGjbpQ/crashLog": {
    data: { type: "betaCrashLogs", id: "log-1", attributes: { logText: fixture("crash-symbolicated.txt") } },
  },
});

const query = (fetch: ReturnType<typeof fakeAsc>["fetch"], from = Date.parse("2026-10-11T00:00:00.000Z")) =>
  fetchTestflightEvents({ auth, bundleId: "com.escuchame", service: "escuchame-ios", from, now: NOW, maxCrashLogs: 25, fetch });

describe("fetchTestflightEvents", () => {
  it("looks the app up by bundle id and sends a bearer JWT on every call", async () => {
    const asc = fakeAsc(standardRoutes());
    await query(asc.fetch);
    expect(asc.calls[0]!.url.pathname).toBe("/v1/apps");
    expect(asc.calls[0]!.url.searchParams.get("filter[bundleId]")).toBe("com.escuchame");
    expect(asc.calls.every((c) => c.auth?.startsWith("Bearer ey"))).toBe(true);
    const list = asc.calls.find((c) => c.url.pathname.endsWith("/betaFeedbackScreenshotSubmissions"))!.url;
    expect(list.searchParams.get("sort")).toBe("-createdDate");
    expect(list.searchParams.get("include")).toBe("build");
    expect(list.searchParams.get("fields[builds]")).toBe("version");
  });

  it("turns each screenshot report since `from` into its own event, with the comment, device, build and screenshot links", async () => {
    const { events } = await query(fakeAsc(standardRoutes()).fetch);
    const shots = events.filter((e) => e.id.startsWith("testflight-screenshot:"));
    expect(shots).toHaveLength(1); // the October 1 report is before `from`
    const shot = shots[0]!;
    expect(shot).toMatchObject({
      id: "testflight-screenshot:AD8JvKbr0BK0Cj9OnM6WO6I",
      timestamp: Date.parse("2026-10-11T15:20:00.000Z"),
      level: "error",
      service: "escuchame-ios",
      versionId: "202610110652",
      fingerprint: "tf-shot-AD8JvKbr0BK0Cj9OnM6WO6I",
    });
    expect(shot.message.split("\n")[0]).toBe("TestFlight feedback: The play button does nothing after the second clip.");
    expect(shot.message).toContain("Happens every time.");
    expect(shot.message).toContain("Device: iPhone16,2 · iOS 26.0 · build 202610110652 · en-US · WIFI · battery 81% · app open 182s");
    expect(shot.message).toContain("https://tf-feedback.itunes.apple.com/eimg/abc/shot1.jpg (expires 2026-10-12T15:20:00.000Z)");
    expect(shot.fields).toMatchObject({ source: "testflight", kind: "screenshot", submission: "AD8JvKbr0BK0Cj9OnM6WO6I", screenshots: ["https://tf-feedback.itunes.apple.com/eimg/abc/shot1.jpg"] });
  });

  it("never carries the tester's email", async () => {
    const { events } = await query(fakeAsc(standardRoutes()).fetch);
    expect(JSON.stringify(events)).not.toContain("tester@example.com");
  });

  it("turns a crash into an event keyed by its exception and top app frames, with the stack and comment", async () => {
    const { events } = await query(fakeAsc(standardRoutes()).fetch);
    const crash = events.find((e) => e.id === "testflight-crash:AK7UjG-qL5QxXf3gIOGjbpQ")!;
    expect(crash.message.split("\n")[0]).toBe("TestFlight crash: EXC_BREAKPOINT (SIGTRAP) in ClipPlayer.play(clip:)");
    expect(crash.message).toContain("Tester comment: It crashed when I tapped next");
    expect(crash.message).toContain("1 Escuchame ClipPlayer.play(clip:) (ClipPlayer.swift:88)");
    expect(crash.versionId).toBe("202610110652");
    expect(crash.fingerprint).toMatch(/^tf-crash-[0-9a-f]{12}$/);
    expect(crash.fields).toMatchObject({ source: "testflight", kind: "crash", symbolicated: true });
    expect(String(crash.fields?.stack)).toContain("(ListeningSession.swift:142)");
  });

  it("gives the same crash in two reports the same fingerprint", async () => {
    const routes = standardRoutes();
    const second = structuredClone(routes["/v1/apps/app-1/betaFeedbackCrashSubmissions"].data[0]);
    second.id = "SECOND";
    routes["/v1/apps/app-1/betaFeedbackCrashSubmissions"].data.push(second);
    const asc = fakeAsc({ ...routes, "/v1/betaFeedbackCrashSubmissions/SECOND/crashLog": routes["/v1/betaFeedbackCrashSubmissions/AK7UjG-qL5QxXf3gIOGjbpQ/crashLog"] });
    const { events } = await query(asc.fetch);
    const fps = events.filter((e) => e.id.startsWith("testflight-crash:")).map((e) => e.fingerprint);
    expect(fps).toHaveLength(2);
    expect(fps[0]).toBe(fps[1]);
  });

  it("files a crash whose log can't be read on its own, and says so", async () => {
    const routes: Record<string, unknown> = standardRoutes();
    delete routes["/v1/betaFeedbackCrashSubmissions/AK7UjG-qL5QxXf3gIOGjbpQ/crashLog"];
    const { events, notes } = await query(fakeAsc(routes).fetch);
    const crash = events.find((e) => e.id.startsWith("testflight-crash:"))!;
    expect(crash.message.split("\n")[0]).toBe("TestFlight crash: crash (no readable crash log)");
    expect(crash.fingerprint).toBe("tf-crash-AK7UjG-qL5QxXf3gIOGjbpQ");
    expect(notes.join(" ")).toContain("crash log for AK7UjG-qL5QxXf3gIOGjbpQ");
  });

  it("follows next links until reports are older than `from`", async () => {
    const page1 = json("screenshots.json");
    page1.data = [page1.data[0]];
    page1.links.next = "https://api.appstoreconnect.apple.com/v1/apps/app-1/betaFeedbackScreenshotSubmissions?cursor=2";
    const page2 = { data: [{ ...json("screenshots.json").data[0], id: "PAGE2", attributes: { ...json("screenshots.json").data[0].attributes, createdDate: "2026-10-11T01:00:00.000Z" } }], included: page1.included, links: { self: "x", next: "https://api.appstoreconnect.apple.com/v1/apps/app-1/betaFeedbackScreenshotSubmissions?cursor=3" } };
    const page3 = { data: [{ ...json("screenshots.json").data[1] }], included: page1.included, links: { self: "x", next: "https://api.appstoreconnect.apple.com/v1/apps/app-1/betaFeedbackScreenshotSubmissions?cursor=4" } };
    const asc = fakeAsc({ ...standardRoutes(), "/v1/apps/app-1/betaFeedbackScreenshotSubmissions": page1 }, (url) => {
      const cursor = url.searchParams.get("cursor");
      if (cursor === "2") return new Response(JSON.stringify(page2));
      if (cursor === "3") return new Response(JSON.stringify(page3));
      if (cursor === "4") throw new Error("must stop before page 4");
      return undefined;
    });
    const { events } = await query(asc.fetch);
    expect(events.filter((e) => e.id.startsWith("testflight-screenshot:")).map((e) => e.id)).toEqual(["testflight-screenshot:AD8JvKbr0BK0Cj9OnM6WO6I", "testflight-screenshot:PAGE2"]);
  });

  it("reads at most maxCrashLogs crash logs per run, newest first", async () => {
    const routes = standardRoutes();
    const base = routes["/v1/apps/app-1/betaFeedbackCrashSubmissions"].data[0];
    routes["/v1/apps/app-1/betaFeedbackCrashSubmissions"].data = ["C1", "C2", "C3"].map((id) => ({ ...base, id }));
    const asc = fakeAsc(routes, (url) => (url.pathname.endsWith("/crashLog") ? new Response(JSON.stringify({ data: { type: "betaCrashLogs", id: "l", attributes: { logText: fixture("crash.ips") } } })) : undefined));
    const { events, notes } = await fetchTestflightEvents({ auth, bundleId: "com.escuchame", service: "escuchame-ios", from: 0, now: NOW, maxCrashLogs: 2, fetch: asc.fetch });
    expect(asc.calls.filter((c) => c.url.pathname.endsWith("/crashLog"))).toHaveLength(2);
    expect(events.filter((e) => e.id.startsWith("testflight-crash:"))).toHaveLength(2);
    expect(notes.join(" ")).toContain("1 more crash");
  });

  it("fails with Apple's error detail when a call is refused", async () => {
    const asc = fakeAsc({}, (url) =>
      url.pathname === "/v1/apps" ? new Response(JSON.stringify({ errors: [{ status: "403", code: "FORBIDDEN_ERROR", detail: "This request is forbidden for security reasons" }] }), { status: 403 }) : undefined,
    );
    await expect(query(asc.fetch)).rejects.toThrow("App Store Connect 403 on /v1/apps: This request is forbidden for security reasons");
  });

  it("fails clearly when no app has the bundle id", async () => {
    const asc = fakeAsc({ "/v1/apps": { data: [{ type: "apps", id: "other", attributes: { bundleId: "com.escuchame.widget" } }] } });
    await expect(query(asc.fetch)).rejects.toThrow("no App Store Connect app with bundle id com.escuchame");
  });
});

describe("fetchTestflightEvents (exact output and edge cases)", () => {
  it("renders a screenshot report exactly", async () => {
    const { events } = await query(fakeAsc(standardRoutes()).fetch);
    expect(events[0]!.message).toBe(
      [
        "TestFlight feedback: The play button does nothing after the second clip.",
        "",
        "The play button does nothing after the second clip.\nHappens every time.",
        "",
        "Device: iPhone16,2 · iOS 26.0 · build 202610110652 · en-US · WIFI · battery 81% · app open 182s",
        "Screenshot: https://tf-feedback.itunes.apple.com/eimg/abc/shot1.jpg (expires 2026-10-12T15:20:00.000Z)",
      ].join("\n"),
    );
    expect(events[0]!.fields).toEqual({
      source: "testflight",
      kind: "screenshot",
      submission: "AD8JvKbr0BK0Cj9OnM6WO6I",
      comment: "The play button does nothing after the second clip.\nHappens every time.",
      deviceModel: "iPhone16,2",
      osVersion: "26.0",
      build: "202610110652",
      locale: "en-US",
      connectionType: "WIFI",
      batteryPercentage: 81,
      appUptimeInMilliseconds: 182000,
      screenshots: ["https://tf-feedback.itunes.apple.com/eimg/abc/shot1.jpg"],
    });
  });

  it("renders a crash report exactly", async () => {
    const { events, notes } = await query(fakeAsc(standardRoutes()).fetch);
    const crash = events[1]!;
    expect(crash.message).toBe(
      [
        "TestFlight crash: EXC_BREAKPOINT (SIGTRAP) in ClipPlayer.play(clip:)",
        "",
        "Tester comment: It crashed when I tapped next",
        "",
        "Device: iPhone16,2 · iOS 26.0 · build 202610110652 · en-US · CELLULAR · battery 40% · app open 64s",
        "",
        crashSignatureStack,
      ].join("\n"),
    );
    expect(notes).toEqual([]);
  });

  it("renders a bare report: no comment, no build, no screenshots, zero battery", async () => {
    const routes = standardRoutes();
    routes["/v1/apps/app-1/betaFeedbackScreenshotSubmissions"] = {
      data: [{ type: "betaFeedbackScreenshotSubmissions", id: "BARE", attributes: { createdDate: "2026-10-11T10:00:00.000Z", comment: "  ", batteryPercentage: 0, appUptimeInMilliseconds: 0, deviceModel: null } }],
      links: { self: "x" },
    };
    routes["/v1/apps/app-1/betaFeedbackCrashSubmissions"] = {
      data: [{ type: "betaFeedbackCrashSubmissions", id: "BARECRASH", attributes: { createdDate: "2026-10-11T10:00:00.000Z" }, relationships: { build: { data: null } } }],
      links: { self: "x" },
    };
    const asc = fakeAsc(routes, (url) => (url.pathname.endsWith("/crashLog") ? new Response(JSON.stringify({ data: { type: "betaCrashLogs", id: "l", attributes: { logText: null } } })) : undefined));
    const { events, notes } = await query(asc.fetch);
    expect(events[0]).toEqual({
      id: "testflight-screenshot:BARE",
      timestamp: Date.parse("2026-10-11T10:00:00.000Z"),
      level: "error",
      service: "escuchame-ios",
      fingerprint: "tf-shot-BARE",
      message: "TestFlight feedback: (no comment)\n\nDevice: battery 0% · app open 0s",
      fields: { source: "testflight", kind: "screenshot", submission: "BARE", comment: "  ", batteryPercentage: 0, appUptimeInMilliseconds: 0, screenshots: [] },
    });
    expect(events[1]).toEqual({
      id: "testflight-crash:BARECRASH",
      timestamp: Date.parse("2026-10-11T10:00:00.000Z"),
      level: "error",
      service: "escuchame-ios",
      fingerprint: "tf-crash-BARECRASH",
      message: "TestFlight crash: crash (no readable crash log)",
      fields: { source: "testflight", kind: "crash", submission: "BARECRASH", symbolicated: false, stack: "" },
    });
    expect(notes).toEqual([]);
  });

  it("includes a report created exactly at `from`", async () => {
    const { events } = await query(fakeAsc(standardRoutes()).fetch, Date.parse("2026-10-11T15:20:00.000Z"));
    expect(events.map((e) => e.id)).toContain("testflight-screenshot:AD8JvKbr0BK0Cj9OnM6WO6I");
  });

  it("keys crashes by service too", async () => {
    const one = await query(fakeAsc(standardRoutes()).fetch);
    const other = await fetchTestflightEvents({ auth, bundleId: "com.escuchame", service: "other-ios", from: 0, now: NOW, maxCrashLogs: 25, fetch: fakeAsc(standardRoutes()).fetch });
    expect(one.events[1]!.fingerprint).not.toBe(other.events[1]!.fingerprint);
  });

  it("reads exactly maxCrashLogs crash logs without a note when there are no more", async () => {
    const { notes } = await fetchTestflightEvents({ auth, bundleId: "com.escuchame", service: "s", from: 0, now: NOW, maxCrashLogs: 1, fetch: fakeAsc(standardRoutes()).fetch });
    expect(notes).toEqual([]);
  });

  it("asks only for the bundle id field when looking the app up, and only calls App Store Connect", async () => {
    const asc = fakeAsc(standardRoutes());
    await query(asc.fetch);
    expect(asc.calls[0]!.url.searchParams.get("fields[apps]")).toBe("bundleId");
    expect(asc.calls.every((c) => c.url.origin === "https://api.appstoreconnect.apple.com")).toBe(true);
  });

  it("follows an absolute next link as given", async () => {
    const page1 = json("screenshots.json");
    page1.data = [page1.data[0]];
    page1.links.next = "https://api.appstoreconnect.apple.com/v1/apps/app-1/betaFeedbackScreenshotSubmissions?cursor=2";
    const asc = fakeAsc({ ...standardRoutes(), "/v1/apps/app-1/betaFeedbackScreenshotSubmissions": page1 }, (url) =>
      url.searchParams.get("cursor") === "2" ? new Response(JSON.stringify({ data: [], links: {} })) : undefined,
    );
    await query(asc.fetch);
    expect(asc.calls.map((c) => c.url.href)).toContain("https://api.appstoreconnect.apple.com/v1/apps/app-1/betaFeedbackScreenshotSubmissions?cursor=2");
  });

  it("joins several Apple error details, and falls back to the title or the status text", async () => {
    const fail = (body: string, status = 401, statusText = "Unauthorized") =>
      query(fakeAsc({}, () => new Response(body, { status, statusText })).fetch);
    await expect(fail(JSON.stringify({ errors: [{ detail: "one" }, { title: "two" }] }))).rejects.toThrow("App Store Connect 401 on /v1/apps: one; two");
    await expect(fail(JSON.stringify({}))).rejects.toThrow("App Store Connect 401 on /v1/apps: Unauthorized");
    await expect(fail("<html>gateway</html>", 502, "Bad Gateway")).rejects.toThrow("App Store Connect 502 on /v1/apps: Bad Gateway");
  });

  it("writes a one-line comment once, and lists a screenshot without device details or expiry", async () => {
    const routes = standardRoutes();
    routes["/v1/apps/app-1/betaFeedbackScreenshotSubmissions"] = {
      data: [{ type: "betaFeedbackScreenshotSubmissions", id: "ONE", attributes: { createdDate: "2026-10-11T10:00:00.000Z", comment: " Text too small ", screenshots: [{ url: "https://x.example/s.jpg" }] } }],
      links: {},
    };
    const { events } = await query(fakeAsc(routes).fetch);
    expect(events[0]!.message).toBe("TestFlight feedback: Text too small\n\nScreenshot: https://x.example/s.jpg");
  });

  it("drops a whitespace-only crash comment", async () => {
    const routes = standardRoutes();
    routes["/v1/apps/app-1/betaFeedbackCrashSubmissions"].data[0].attributes.comment = "   ";
    const { events } = await query(fakeAsc(routes).fetch);
    expect(events[1]!.message).not.toContain("Tester comment");
  });

  it("gives different crashes different fingerprints", async () => {
    const routes = standardRoutes();
    const base = routes["/v1/apps/app-1/betaFeedbackCrashSubmissions"].data[0];
    routes["/v1/apps/app-1/betaFeedbackCrashSubmissions"].data = [base, { ...base, id: "IPS" }];
    const asc = fakeAsc({ ...routes, "/v1/betaFeedbackCrashSubmissions/IPS/crashLog": { data: { type: "betaCrashLogs", id: "l", attributes: { logText: fixture("crash.ips") } } } });
    const fps = (await query(asc.fetch)).events.filter((e) => e.id.startsWith("testflight-crash:")).map((e) => e.fingerprint);
    expect(new Set(fps).size).toBe(2);
  });
});

