import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDetections, judge, analyze } from "./av-verdict.mjs";

const CLI = fileURLToPath(new URL("./av-verdict.mjs", import.meta.url));

test("parseDetections reads closed and open-ended segments", () => {
  const log = [
    "[blackdetect @ 0x1] black_start:0 black_end:2.96 black_duration:2.96",
    "[freezedetect @ 0x2] lavfi.freezedetect.freeze_start: 1.5",
    "[freezedetect @ 0x2] lavfi.freezedetect.freeze_duration: 2",
    "[freezedetect @ 0x2] lavfi.freezedetect.freeze_end: 3.5",
    "[freezedetect @ 0x2] lavfi.freezedetect.freeze_start: 8",
    "[silencedetect @ 0x3] silence_start: 0",
    "[silencedetect @ 0x3] silence_end: 3 | silence_duration: 3",
  ].join("\n");
  assert.deepEqual(parseDetections(log, 10), {
    black: [{ start: 0, end: 2.96 }],
    frozen: [
      { start: 1.5, end: 3.5 },
      { start: 8, end: 10 },
    ],
    silent: [{ start: 0, end: 3 }],
  });
});

const clean = { duration: 10, hasAudio: true, black: [], white: [], frozen: [], silent: [] };

test("judge passes a clean clip", () => {
  assert.deepEqual(judge(clean, { expectMotion: true, expectAudio: true }), { pass: true, failures: [], warnings: [] });
});

test("judge fails a black screen of 1s or more, ignores short fades", () => {
  assert.equal(judge({ ...clean, black: [{ start: 2, end: 2.4 }] }, {}).pass, true);
  const v = judge({ ...clean, black: [{ start: 2, end: 3 }] }, {});
  assert.equal(v.pass, false);
  assert.deepEqual(v.failures.map((f) => f.code), ["black_screen"]);
});

test("judge fails a white screen of 1s or more", () => {
  const v = judge({ ...clean, white: [{ start: 5, end: 9 }] }, {});
  assert.deepEqual(v.failures.map((f) => f.code), ["white_screen"]);
});

test("frozen video while audio plays is a failure only when motion is expected", () => {
  const sample = { ...clean, frozen: [{ start: 0, end: 6 }], silent: [] };
  assert.deepEqual(judge(sample, { expectMotion: true }).failures.map((f) => f.code), ["frozen_with_audio"]);
  const relaxed = judge(sample, {});
  assert.equal(relaxed.pass, true);
  assert.deepEqual(relaxed.warnings.map((w) => w.code), ["frozen_with_audio"]);
});

test("frozen video during silence is not frozen_with_audio", () => {
  const v = judge({ ...clean, frozen: [{ start: 0, end: 6 }], silent: [{ start: 0, end: 6 }] }, { expectMotion: true });
  assert.deepEqual(v.failures.map((f) => f.code), ["frozen"]);
});

test("missing or mostly silent audio fails only when audio is expected", () => {
  assert.deepEqual(judge({ ...clean, hasAudio: false }, { expectAudio: true }).failures.map((f) => f.code), ["no_audio"]);
  const quiet = { ...clean, silent: [{ start: 0, end: 8 }] };
  assert.deepEqual(judge(quiet, { expectAudio: true }).failures.map((f) => f.code), ["silent"]);
  assert.equal(judge(quiet, {}).pass, true);
});

const dir = mkdtempSync(join(tmpdir(), "av-verdict-"));
function fixture(name, video, audio) {
  const out = join(dir, `${name}.mp4`);
  const args = ["-v", "error", "-y", "-f", "lavfi", "-i", `${video}${video.includes("=") ? ":" : "="}s=320x240:d=4`];
  if (audio) args.push("-f", "lavfi", "-i", `${audio}`);
  args.push("-t", "4", "-pix_fmt", "yuv420p", out);
  execFileSync("ffmpeg", args);
  return out;
}

test("analyze: moving picture with a tone passes everything", () => {
  const v = analyze(fixture("ok", "testsrc2", "sine=f=440:d=4"), { expectMotion: true, expectAudio: true });
  assert.equal(v.pass, true, JSON.stringify(v));
});

test("analyze: black picture fails", () => {
  const v = analyze(fixture("black", "color=c=black", "sine=f=440:d=4"), {});
  assert.ok(v.failures.some((f) => f.code === "black_screen"), JSON.stringify(v));
});

test("analyze: white picture fails", () => {
  const v = analyze(fixture("white", "color=c=white", "sine=f=440:d=4"), {});
  assert.ok(v.failures.some((f) => f.code === "white_screen"), JSON.stringify(v));
});

test("analyze: a still picture with sound is frozen_with_audio", () => {
  const v = analyze(fixture("still", "color=c=0x3366aa", "sine=f=440:d=4"), { expectMotion: true });
  assert.deepEqual(v.failures.map((f) => f.code), ["frozen_with_audio"], JSON.stringify(v));
});

test("analyze: silent track and missing track fail when audio is expected", () => {
  const silent = analyze(fixture("silent", "testsrc2", "anullsrc=d=4"), { expectAudio: true });
  assert.deepEqual(silent.failures.map((f) => f.code), ["silent"]);
  const none = analyze(fixture("noaudio", "testsrc2"), { expectAudio: true });
  assert.deepEqual(none.failures.map((f) => f.code), ["no_audio"]);
});

test("CLI exits 1 with a JSON verdict on failure and 0 on pass", () => {
  const ok = execFileSync("node", [CLI, fixture("cli-ok", "testsrc2", "sine=f=440:d=4"), "--expect-motion", "--expect-audio"]);
  assert.equal(JSON.parse(ok.toString()).pass, true);
  assert.throws(
    () => execFileSync("node", [CLI, fixture("cli-black", "color=c=black")], { stdio: "pipe" }),
    (err) => err.status === 1 && JSON.parse(err.stdout.toString()).pass === false,
  );
});
