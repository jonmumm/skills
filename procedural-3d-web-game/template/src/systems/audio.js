// Procedural ambience with the Web Audio API: no sound files.
// Surf = filtered noise with slow amplitude swells; wind = band-passed noise with gusts.
// Starts on the first user gesture (browsers block autoplay). M toggles mute.
// Reality check from builders: synthesized ambience/SFX hold up; synthesized music and
// realistic footsteps are Opus's weakest area — use CC0 samples or a TTS/SFX API when it matters.
export class AudioSystem {
  static id = 'audio';

  init(ctx) {
    this.started = false;
    const start = () => { if (!this.started) this.start(ctx); };
    addEventListener('pointerdown', start, { once: true });
    addEventListener('keydown', (e) => { start(); if (e.code === 'KeyM' && this.master) this.master.gain.value = this.master.gain.value > 0 ? 0 : 0.8; });
  }

  start(ctx) {
    this.started = true;
    const ac = (this.ac = new AudioContext());
    this.master = ac.createGain(); this.master.gain.value = 0.8; this.master.connect(ac.destination);
    const noise = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
    const d = noise.getChannelData(0);
    const rng = ctx.rng.fork('audio');
    let b = 0;
    for (let i = 0; i < d.length; i++) { b = 0.985 * b + 0.015 * (rng.next() * 2 - 1); d[i] = b * 6; } // brown-ish noise

    const layer = (type, freq, q, gain) => {
      const src = ac.createBufferSource(); src.buffer = noise; src.loop = true;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); g.gain.value = gain;
      src.connect(f).connect(g).connect(this.master); src.start();
      return { f, g };
    };
    this.surf = layer('lowpass', 700, 0.5, 0.0);
    this.wind = layer('bandpass', 420, 0.8, 0.0);
  }

  update(dt, ctx) {
    if (!this.started) return;
    const t = ctx.time.elapsed, now = this.ac.currentTime;
    const cam = ctx.camera.position;
    const nearShore = 1 / (1 + Math.max(0, cam.y - 2) * 0.05);
    const swell = 0.5 + 0.5 * Math.sin(t * 0.55) * Math.sin(t * 0.21 + 1.3);
    this.surf.g.gain.setTargetAtTime(0.25 * nearShore * (0.4 + 0.6 * swell), now, 0.3);
    const gust = 0.5 + 0.5 * Math.sin(t * 0.13) * Math.sin(t * 0.37 + 2.0);
    this.wind.g.gain.setTargetAtTime(0.05 + 0.12 * gust * (1 - nearShore * 0.5), now, 0.5);
    this.wind.f.frequency.setTargetAtTime(300 + 400 * gust, now, 0.5);
  }
}
