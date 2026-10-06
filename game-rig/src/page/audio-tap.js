// Init script: records everything any AudioContext sends to its speakers, from the first sound on.
// Each context gets a MediaStreamDestination; a node connected to ctx.destination is also connected
// to it. The first context that makes sound is recorded (games have one master bus).
// Not captured: plain <audio>/<video> elements that never go through Web Audio.
(() => {
  if (window.__gameRigAudio) return;
  const state = { recorder: null, chunks: [], startedAt: null, ctx: null, custom: null };
  const taps = new WeakMap();
  const tapFor = (ctx) => {
    let tap = taps.get(ctx);
    if (!tap) {
      tap = ctx.createMediaStreamDestination();
      taps.set(ctx, tap);
    }
    return tap;
  };
  const start = (stream, ctx) => {
    if (state.recorder) return;
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    rec.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
    rec.start(250);
    state.recorder = rec;
    state.ctx = ctx;
    state.startedAt = performance.timeOrigin + performance.now();
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const out = connect.call(this, dest, ...rest);
    if (typeof AudioDestinationNode !== "undefined" && dest instanceof AudioDestinationNode && !state.custom) {
      const tap = tapFor(dest.context);
      connect.call(this, tap, ...rest);
      start(tap.stream, dest.context);
    }
    return out;
  };
  window.__gameRigAudio = {
    /** Use the game's own master-bus stream instead (config.audioTap). */
    useStream(stream) {
      state.custom = stream;
      start(stream, null);
    },
    started: () => state.startedAt,
    async stop() {
      if (!state.recorder) return null;
      await new Promise((resolve) => {
        state.recorder.onstop = resolve;
        state.recorder.stop();
      });
      const blob = new Blob(state.chunks, { type: "audio/webm" });
      const data = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.readAsDataURL(blob);
      });
      return { startedAt: state.startedAt, base64: data };
    },
  };
})();
