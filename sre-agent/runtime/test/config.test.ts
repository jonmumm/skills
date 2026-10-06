import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.ts";

describe("parseConfig", () => {
  it("applies safe defaults: observe-only", () => {
    const cfg = parseConfig("sources:\n  - type: cloudflare\n    service: my-worker\n");
    expect(cfg).toMatchObject({ autonomy: 0, lookbackMinutes: 20, maxNewIssuesPerRun: 3, maxFixesPerRun: 1 });
    expect(cfg.sources[0]).toEqual({ type: "cloudflare", service: "my-worker", accountIdEnv: "CLOUDFLARE_ACCOUNT_ID", tokenEnv: "CLOUDFLARE_API_TOKEN" });
  });

  it("rejects missing sources, unknown source types, bad regexes and autonomy above 2", () => {
    expect(() => parseConfig("autonomy: 1\n")).toThrow(/sources/);
    expect(() => parseConfig("sources:\n  - type: datadog\n")).toThrow();
    expect(() => parseConfig("ignore: ['(']\nsources:\n  - type: command\n    run: x\n")).toThrow(/regular expression/);
    expect(() => parseConfig("autonomy: 3\nsources:\n  - type: command\n    run: x\n")).toThrow();
  });
});

describe("parseConfig defaults and error messages", () => {
  it("defaults to error level, all four failing outcomes, and no ignore patterns", () => {
    const cfg = parseConfig("sources:\n  - type: command\n    run: x\n");
    expect(cfg.levels).toEqual(["error"]);
    expect(cfg.outcomes).toEqual(["exception", "exceededCpu", "exceededMemory", "scriptNotFound"]);
    expect(cfg.ignore).toEqual([]);
    expect(cfg.minCount).toBe(1);
  });

  it("names the dotted path of a nested problem", () => {
    expect(() => parseConfig("sources:\n  - type: command\n    run: ''\n")).toThrow(/^Invalid sre-agent config:\n {2}sources\.0\.run: /);
  });

  it("names (root) when the whole document is the wrong shape", () => {
    expect(() => parseConfig("- just\n- a list\n")).toThrow(/\n {2}\(root\): /);
  });

  it("lists each problem on its own line", () => {
    let message = "";
    try {
      parseConfig("autonomy: 3\nlookbackMinutes: 0\nsources:\n  - type: command\n    run: x\n");
    } catch (err) {
      message = err instanceof Error ? err.message : "";
    }
    expect(message.split("\n")).toEqual(["Invalid sre-agent config:", expect.stringMatching(/^ {2}autonomy: /), expect.stringMatching(/^ {2}lookbackMinutes: /)]);
  });
});

describe("parseConfig errorFields", () => {
  it("defaults to no extra paths and accepts dotted paths", () => {
    expect(parseConfig("sources:\n  - type: command\n    run: x\n").errorFields).toEqual({ message: [], type: [] });
    expect(parseConfig("errorFields:\n  message: [failure.reason]\nsources:\n  - type: command\n    run: x\n").errorFields).toEqual({ message: ["failure.reason"], type: [] });
  });
});
