// F3 toggles a frame-time overlay. Frame-time percentiles (not average FPS) are what you
// budget against: a steady 16.6 ms p95 feels better than a 90 FPS average with 200 ms hitches.
export class HudSystem {
  static id = 'hud';

  init() {
    this.el = document.getElementById('hud');
    this.accum = 0;
    addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); this.el.style.display = this.el.style.display === 'block' ? 'none' : 'block'; } });
  }

  update(dt) {
    this.accum += dt;
    if (this.accum < 0.5 || this.el.style.display !== 'block') return;
    this.accum = 0;
    const s = window.__game.stats();
    this.el.textContent = `${s.fps.toFixed(0)} fps  p95 ${s.p95ms.toFixed(1)} ms  p99 ${s.p99ms.toFixed(1)} ms\n` +
      `${s.drawCalls} draws  ${(s.triangles / 1e6).toFixed(2)}M tris  ${s.programs} programs  quality=${window.__game.quality}`;
  }
}
