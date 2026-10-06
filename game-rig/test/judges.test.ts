import { describe, expect, test } from "vitest";
import { area, inset, intersection, outsideBy } from "../src/geometry.ts";
import { judgeOverlays } from "../src/checks/overlay-focal.ts";
import { judgeSafeArea } from "../src/checks/safe-area.ts";
import { judgeText } from "../src/checks/text.ts";
import { judgeTap } from "../src/checks/tap-feedback.ts";

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("geometry", () => {
  test("intersection of overlapping, touching and disjoint rects", () => {
    expect(intersection(r(0, 0, 10, 10), r(5, 5, 10, 10))).toEqual(r(5, 5, 5, 5));
    expect(intersection(r(0, 0, 10, 10), r(10, 0, 5, 5))).toBeNull();
    expect(intersection(r(0, 0, 10, 10), r(20, 20, 5, 5))).toBeNull();
  });
  test("area and inset", () => {
    expect(area(r(0, 0, 4, 5))).toBe(20);
    expect(inset(r(0, 0, 1280, 720), 0.05)).toEqual(r(64, 36, 1152, 648));
  });
  test("outsideBy reports how far a rect pokes out of a frame, per side", () => {
    expect(outsideBy(r(70, 40, 10, 10), r(64, 36, 1152, 648))).toBeNull();
    expect(outsideBy(r(10, 40, 10, 10), r(64, 36, 1152, 648))).toEqual({ left: 54, top: 0, right: 0, bottom: 0 });
    expect(outsideBy(r(1210, 680, 20, 20), r(64, 36, 1152, 648))).toEqual({ left: 0, top: 0, right: 14, bottom: 16 });
  });
});

describe("overlay vs focal", () => {
  const focal = r(320, 180, 640, 360);
  test("an overlay inside the focal rect fails", () => {
    const v = judgeOverlays([{ selector: "div.banner", text: "Hello", rect: r(400, 300, 300, 80) }], focal);
    expect(v.pass).toBe(false);
    expect(v.failures[0]).toMatchObject({ code: "overlay_covers_focal", selector: "div.banner" });
  });
  test("overlays in the corners pass, and a hair of overlap is tolerated", () => {
    const v = judgeOverlays(
      [
        { selector: "div.score", text: "3", rect: r(10, 10, 120, 40) },
        { selector: "div.edge", text: "", rect: r(300, 100, 21, 81) },
      ],
      focal,
    );
    expect(v).toEqual({ pass: true, failures: [] });
  });
  test("no focal rect means the check cannot run: a failure, never a silent pass", () => {
    const v = judgeOverlays([], null);
    expect(v.pass).toBe(false);
    expect(v.failures[0]?.code).toBe("no_focal_rect");
  });
});

describe("safe area", () => {
  const viewport = { width: 1280, height: 720 };
  test("content inside the 5% inset passes", () => {
    expect(judgeSafeArea([{ selector: "h1", text: "Title", rect: r(100, 50, 400, 60) }], viewport).pass).toBe(true);
  });
  test("content in the outer 5% fails with the side it pokes out of", () => {
    const v = judgeSafeArea([{ selector: "span.code", text: "ABCD", rect: r(1200, 10, 70, 30) }], viewport);
    expect(v.pass).toBe(false);
    expect(v.failures[0]).toMatchObject({ code: "outside_tv_safe_area", selector: "span.code" });
    expect(v.failures[0]?.by).toEqual({ left: 0, top: 26, right: 54, bottom: 0 });
  });
  test("1px rounding at the edge is tolerated", () => {
    expect(judgeSafeArea([{ selector: "p", text: "x", rect: r(63.5, 36, 10, 10) }], viewport).pass).toBe(true);
  });
});

describe("text", () => {
  test("clipped text and repeated labels fail; allowed repeats pass", () => {
    const v = judgeText(
      {
        clipped: [{ selector: "button.long", text: "Start the very long", kind: "ellipsis" }],
        labels: [
          { text: "Ready", selector: "button.a" },
          { text: "ready", selector: "button.b" },
          { text: "Score", selector: "div.s1" },
          { text: "Score", selector: "div.s2" },
          { text: "Go", selector: "p" },
        ],
      },
      { allowRepeated: ["score"] },
    );
    expect(v.failures.map((f) => f.code)).toEqual(["clipped_text", "repeated_label"]);
    expect(v.failures[1]).toMatchObject({ label: "ready", count: 2 });
  });
  test("clean text passes", () => {
    expect(judgeText({ clipped: [], labels: [{ text: "Play", selector: "b" }] }, {}).pass).toBe(true);
  });
});

describe("tap feedback", () => {
  const base = { label: "Go", selector: "button", holdOnly: false, elapsedMs: 120, dom: false, visual: false, audio: false, hint: false };
  test("a tap with no DOM, visual or audio change fails", () => {
    expect(judgeTap([base]).failures[0]).toMatchObject({ code: "no_tap_feedback", label: "Go" });
  });
  test("any one signal is enough", () => {
    expect(judgeTap([{ ...base, dom: true }, { ...base, visual: true }, { ...base, audio: true }]).pass).toBe(true);
  });
  test("a hold-only control must show a hint on a plain tap, a press animation is not enough", () => {
    const v = judgeTap([{ ...base, holdOnly: true, visual: true }]);
    expect(v.failures[0]?.code).toBe("hold_without_hint");
    expect(judgeTap([{ ...base, holdOnly: true, hint: true }]).pass).toBe(true);
  });
  test("feedback measured later than the 300 ms budget is a failure", () => {
    expect(judgeTap([{ ...base, dom: true, elapsedMs: 900 }]).failures[0]?.code).toBe("tap_feedback_late");
  });
});
