/**
 * `game-rig stream-check <receiver.html> [out.png] --confirm-paid`: hosts a fresh room on the
 * deployed game, streams its TV through the OGS cloud pipeline (stream server → SFU) and plays it
 * in the OGS receiver page exactly as a Chromecast would; prints the startup timeline, received fps
 * (4 × 5 s windows) and inbound audio energy, and saves a screenshot.
 *
 * COSTS MONEY: the stream server is a GPU container (~$1.4/h, stops ~15 min after the last
 * request). Refuses to run without --confirm-paid, and gives up after --max-seconds (default 180).
 */
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { z } from "zod";

export function tvUrlFromJoin(game: string, join: URL): string {
  const code = join.pathname.split("/")[2];
  const token = join.searchParams.get("tv");
  if (!code || !token) throw new Error(`host redirect ${join.href} has no room code or tv token`);
  return `${game}/tv/${code}?t=${encodeURIComponent(token)}&stream=1`;
}

export function receiverUrl(receiverPath: string, streamServer: string, tvUrl: string): string {
  const u = pathToFileURL(receiverPath);
  u.searchParams.set("streamServerUrl", streamServer);
  u.searchParams.set("viewUrl", tvUrl);
  return u.href;
}

const Status = z.object({ status: z.string().nullable(), w: z.number(), t: z.number() });

export async function streamCheck(opts: { game: string; streamServer: string; receiver: string; outPng: string; maxSeconds: number; log: (s: string) => void }): Promise<void> {
  const res = await fetch(`${opts.game}/host`, { redirect: "manual" });
  const join = new URL(res.headers.get("location") ?? "", opts.game);
  const tvUrl = tvUrlFromJoin(opts.game, join);
  const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
  const kill = setTimeout(() => {
    opts.log(`hard timeout ${opts.maxSeconds}s: closing the receiver (the stream server idles out by itself)`);
    void browser.close();
  }, opts.maxSeconds * 1000);
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const t0 = Date.now();
    await page.goto(receiverUrl(opts.receiver, opts.streamServer, tvUrl));
    let last = "";
    let firstFrame = false;
    for (let i = 0; i < 150; i++) {
      await page.waitForTimeout(1000);
      const st = Status.parse(
        await page.evaluate(`({ status: document.getElementById('status-text')?.textContent ?? null, w: document.getElementById('stream-video')?.videoWidth ?? 0, t: document.getElementById('stream-video')?.currentTime ?? 0 })`),
      );
      const secs = Math.round((Date.now() - t0) / 1000);
      if (st.w > 0 && !firstFrame) {
        firstFrame = true;
        opts.log(`${secs}s first video frame (${st.w}px wide)`);
      }
      if (st.status !== last && !firstFrame) opts.log(`${secs}s ${st.status ?? ""}`);
      last = st.status ?? "";
      if (st.w > 0 && st.t > 6) break;
    }
    for (let w = 0; w < 4; w++) {
      const fps = z.string().parse(
        await page.evaluate(`(async () => {
          const v = document.getElementById('stream-video');
          const a = v.getVideoPlaybackQuality().totalVideoFrames;
          await new Promise((r) => setTimeout(r, 5000));
          return (v.getVideoPlaybackQuality().totalVideoFrames - a) / 5 + " fps @ " + v.videoWidth + "x" + v.videoHeight;
        })()`),
      );
      opts.log(`received: ${fps}`);
    }
    const audio: unknown = await page.evaluate(`(async () => {
      let energy = 0, bytes = 0;
      (await window.receiverPc.getStats()).forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'audio') { energy = r.totalAudioEnergy; bytes = r.bytesReceived; } });
      return { muted: document.getElementById('stream-video').muted, audioBytes: bytes, audioEnergy: energy };
    })()`);
    opts.log(`audio: ${JSON.stringify(audio)}`);
    await page.screenshot({ path: opts.outPng });
    opts.log(`screenshot: ${opts.outPng} | host phone: ${join.href}`);
  } finally {
    clearTimeout(kill);
    await browser.close().catch(() => undefined);
  }
}
