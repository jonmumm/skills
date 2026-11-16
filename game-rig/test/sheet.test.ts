import { describe, expect, it } from "vitest";
import { drawtextSafe } from "../src/sheet.ts";

describe("drawtextSafe", () => {
  it("keeps possessives readable with a typographic apostrophe", () => {
    expect(drawtextSafe("Dad's iPhone (Admiral)")).toBe("Dad’s iPhone (Admiral)");
  });
  it("strips characters that break the ffmpeg filter graph", () => {
    expect(drawtextSafe("a:b%c,d;e[f]g\\h")).toBe("a b c d e f g h");
  });
});
