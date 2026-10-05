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
