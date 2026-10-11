import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crashSignature, parseCrashLog } from "../src/sources/crash-log.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/testflight/${name}`, import.meta.url), "utf8");

describe("parseCrashLog", () => {
  it("reads the exception and the crashed thread's frames from a text crash report", () => {
    const log = parseCrashLog(fixture("crash-symbolicated.txt"));
    expect(log.exception).toBe("EXC_BREAKPOINT (SIGTRAP)");
    expect(log.process).toBe("Escuchame");
    expect(log.frames.slice(0, 3)).toEqual([
      { image: "libswiftCore.dylib", symbol: "_assertionFailure(_:_:file:line:flags:)" },
      { image: "Escuchame", symbol: "ClipPlayer.play(clip:)", file: "ClipPlayer.swift", line: 88 },
      { image: "Escuchame", symbol: "ListeningSession.advance()", file: "ListeningSession.swift", line: 142 },
    ]);
    expect(log.frames).toHaveLength(6);
    expect(log.symbolicated).toBe(true);
  });

  it("marks a report whose app frames are bare addresses as unsymbolicated", () => {
    const log = parseCrashLog(fixture("crash-unsymbolicated.txt"));
    expect(log.symbolicated).toBe(false);
    expect(log.frames[1]).toEqual({ image: "Escuchame", symbol: "Escuchame + 113348" });
  });

  it("reads the faulting thread of a JSON .ips report", () => {
    const log = parseCrashLog(fixture("crash.ips"));
    expect(log.exception).toBe("EXC_BAD_ACCESS (SIGSEGV)");
    expect(log.process).toBe("Escuchame");
    expect(log.frames).toEqual([
      { image: "libobjc.A.dylib", symbol: "objc_msgSend" },
      { image: "Escuchame", symbol: "SyncQueue.flush()", file: "SyncQueue.swift", line: 57 },
      { image: "Escuchame", symbol: "AppModel.sceneDidEnterBackground()", file: "AppModel.swift", line: 12 },
    ]);
    expect(log.symbolicated).toBe(true);
  });

  it("returns an empty report for text it does not understand", () => {
    expect(parseCrashLog("garbage")).toEqual({ exception: null, process: null, frames: [], symbolicated: false });
    expect(parseCrashLog('{"app_name":"X"}\n{not json')).toEqual({ exception: null, process: null, frames: [], symbolicated: false });
  });
});

describe("crashSignature", () => {
  it("names the crash by its exception and first app frame, and keys it by the top app frames", () => {
    const sig = crashSignature(parseCrashLog(fixture("crash-symbolicated.txt")));
    expect(sig.headline).toBe("EXC_BREAKPOINT (SIGTRAP) in ClipPlayer.play(clip:)");
    expect(sig.key).toBe("EXC_BREAKPOINT|ClipPlayer.play(clip:)|ListeningSession.advance()|closure #1 in ListeningView.body.getter");
    expect(sig.stack).toContain("ClipPlayer.play(clip:) (ClipPlayer.swift:88)");
  });

  it("ignores line numbers, so the same crash after an unrelated edit keeps its key", () => {
    const moved = fixture("crash-symbolicated.txt").replace("ClipPlayer.swift:88", "ClipPlayer.swift:91");
    expect(crashSignature(parseCrashLog(moved)).key).toBe(crashSignature(parseCrashLog(fixture("crash-symbolicated.txt"))).key);
  });

  it("falls back to the top frames when no frame belongs to the app", () => {
    const sig = crashSignature({ exception: "EXC_CRASH (SIGABRT)", process: "Escuchame", symbolicated: true, frames: [
      { image: "libsystem_kernel.dylib", symbol: "__pthread_kill" },
      { image: "libsystem_c.dylib", symbol: "abort" },
    ] });
    expect(sig.headline).toBe("EXC_CRASH (SIGABRT) in __pthread_kill");
    expect(sig.key).toBe("EXC_CRASH|__pthread_kill|abort");
  });

  it("says when the app frames are unsymbolicated", () => {
    expect(crashSignature(parseCrashLog(fixture("crash-unsymbolicated.txt"))).headline).toBe("EXC_BREAKPOINT (SIGTRAP) in Escuchame + 113348 (unsymbolicated)");
  });

  it("has a headline even with no parsed report", () => {
    expect(crashSignature(parseCrashLog("garbage"))).toEqual({ headline: "crash (no readable crash log)", key: "unknown", stack: "" });
  });
});

describe("parseCrashLog (edge cases)", () => {
  const text = (body: string) => `Process:             Escuchame  [4821]\nException Type:  EXC_CRASH (SIGABRT)   \n${body}`;

  it("reads every frame of the crashed thread exactly, including system frames without symbols", () => {
    expect(parseCrashLog(fixture("crash-symbolicated.txt")).frames.slice(3)).toEqual([
      { image: "Escuchame", symbol: "closure #1 in ListeningView.body.getter", file: "ListeningView.swift", line: 31 },
      { image: "SwiftUI", symbol: "SwiftUI + 1221044" },
      { image: "UIKitCore", symbol: "-[UIApplication sendAction:to:from:forEvent:]" },
    ]);
  });

  it("reads a report with Windows line endings", () => {
    const log = parseCrashLog(fixture("crash-symbolicated.txt").replace(/\n/g, "\r\n"));
    expect(log.exception).toBe("EXC_BREAKPOINT (SIGTRAP)");
    expect(log.frames).toHaveLength(6);
  });

  it("trims the process name and exception, and finds a crashed thread numbered 10 or more", () => {
    const log = parseCrashLog(text("Triggered by Thread:  12\n\nThread 1 Crashed:\n0   Wrong 0x1 wrong + 1\n\nThread 12 Crashed:\n0   Escuchame   0x0000000100a1b2c4 Foo.bar() + 4\n"));
    expect(log).toEqual({ exception: "EXC_CRASH (SIGABRT)", process: "Escuchame", frames: [{ image: "Escuchame", symbol: "Foo.bar()" }], symbolicated: true });
  });

  it("uses the first crashed thread when the report does not say which one", () => {
    const log = parseCrashLog(text("Thread 3 Crashed:\n0   Escuchame   0x01 Foo.baz() + 4\n"));
    expect(log.frames).toEqual([{ image: "Escuchame", symbol: "Foo.baz()" }]);
  });

  it("keeps the exception when there are no frames, and the frames when there is no exception", () => {
    expect(parseCrashLog("Exception Type:  EXC_CRASH (SIGKILL)\n")).toEqual({ exception: "EXC_CRASH (SIGKILL)", process: null, frames: [], symbolicated: false });
    expect(parseCrashLog("Thread 0 Crashed:\n0   Escuchame   0x01 Foo.baz() + 4\n").frames).toEqual([{ image: "Escuchame", symbol: "Foo.baz()" }]);
  });

  it("keeps a frame whose symbol has no offset as written", () => {
    expect(parseCrashLog("Thread 0 Crashed:\n0   Escuchame   0x01 <redacted>\n").frames).toEqual([{ image: "Escuchame", symbol: "<redacted>" }]);
  });

  it("counts a report as symbolicated when any app frame has a symbol", () => {
    const log = parseCrashLog("Process: Escuchame [1]\nThread 0 Crashed:\n0   Escuchame   0x01 0x100 + 4\n1   Escuchame   0x02 Foo.baz() + 4\n");
    expect(log.symbolicated).toBe(true);
  });
});

describe("parseCrashLog (.ips edge cases)", () => {
  const ips = (body: object) => `{"app_name":"Escuchame"}\n${JSON.stringify(body)}`;

  it("reads a report with leading whitespace", () => {
    expect(parseCrashLog(`\n  ${fixture("crash.ips")}`).exception).toBe("EXC_BAD_ACCESS (SIGSEGV)");
  });

  it("uses faultingThread when no thread is marked triggered, and names unknown images and missing symbols", () => {
    const log = parseCrashLog(ips({
      procName: "Escuchame",
      exception: { type: "EXC_CRASH" },
      faultingThread: 1,
      threads: [{ frames: [{ imageIndex: 0, symbol: "wrong" }] }, { frames: [{ imageIndex: 0, imageOffset: 77 }, { imageIndex: 0 }, { imageIndex: 5, symbol: "s", sourceFile: "S.swift" }] }],
      usedImages: [{ name: "Escuchame" }],
    }));
    expect(log).toEqual({
      exception: "EXC_CRASH",
      process: "Escuchame",
      frames: [{ image: "Escuchame", symbol: "Escuchame + 77" }, { image: "Escuchame", symbol: "Escuchame + 0" }, { image: "???", symbol: "s", file: "S.swift" }],
      symbolicated: false,
    });
  });

  it("has no frames when no thread is triggered or faulting, and survives missing lists", () => {
    expect(parseCrashLog(ips({ exception: { type: "EXC_CRASH", signal: "SIGKILL" } }))).toEqual({ exception: "EXC_CRASH (SIGKILL)", process: null, frames: [], symbolicated: false });
  });

  it("returns an empty report for a body of the wrong shape", () => {
    expect(parseCrashLog(ips({ threads: "nope" }))).toEqual({ exception: null, process: null, frames: [], symbolicated: false });
  });
});

describe("crashSignature (exact)", () => {
  it("renders the whole stack, one numbered line per frame", () => {
    expect(crashSignature(parseCrashLog(fixture("crash-symbolicated.txt"))).stack).toBe(
      [
        "0 libswiftCore.dylib _assertionFailure(_:_:file:line:flags:)",
        "1 Escuchame ClipPlayer.play(clip:) (ClipPlayer.swift:88)",
        "2 Escuchame ListeningSession.advance() (ListeningSession.swift:142)",
        "3 Escuchame closure #1 in ListeningView.body.getter (ListeningView.swift:31)",
        "4 SwiftUI SwiftUI + 1221044",
        "5 UIKitCore -[UIApplication sendAction:to:from:forEvent:]",
      ].join("\n"),
    );
  });

  it("keys by at most three app frames", () => {
    const frames = ["a", "b", "c", "d"].map((symbol) => ({ image: "App", symbol }));
    expect(crashSignature({ exception: "EXC_CRASH (SIGABRT)", process: "App", frames, symbolicated: true }).key).toBe("EXC_CRASH|a|b|c");
  });

  it("names a crash with frames but no exception, and one with an exception but no frames", () => {
    expect(crashSignature({ exception: null, process: "App", frames: [{ image: "App", symbol: "a" }], symbolicated: true })).toEqual({ headline: "crash in a", key: "crash|a", stack: "0 App a" });
    expect(crashSignature({ exception: "EXC_CRASH (SIGKILL)", process: null, frames: [], symbolicated: false })).toEqual({ headline: "EXC_CRASH (SIGKILL)", key: "EXC_CRASH", stack: "" });
  });

  it("prefers the thread marked triggered over faultingThread", () => {
    const log = parseCrashLog(`{"app_name":"A"}\n${JSON.stringify({ faultingThread: 1, threads: [{ triggered: true, frames: [{ imageIndex: 0, symbol: "right" }] }, { frames: [{ imageIndex: 0, symbol: "wrong" }] }], usedImages: [{ name: "A" }] })}`);
    expect(log.frames).toEqual([{ image: "A", symbol: "right" }]);
  });

  it("reads system frames that carry no source file, as App Store Connect sends them", () => {
    const log = parseCrashLog("Process: opengameapp [1]\nThread 0 Crashed:\n0   Security   0x01 SSLWrite + 128 (:-1)\n1   opengameapp   0x02 -[GCKNSSLSocket performCrypto] + 40 (GCKNSSLSocket.m:310)\n");
    expect(log.frames).toEqual([
      { image: "Security", symbol: "SSLWrite" },
      { image: "opengameapp", symbol: "-[GCKNSSLSocket performCrypto]", file: "GCKNSSLSocket.m", line: 310 },
    ]);
  });
});

