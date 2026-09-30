import * as THREE from 'three';

// Camera rig with named "views" — fixed, reproducible shots the screenshot harness
// and the critic use every iteration. Add a view for every hero moment in your game.
// Controls: drag to orbit, wheel to zoom, WASD to move the focus, V to cycle views.
export class CameraSystem {
  static id = 'camera';
  static deps = ['terrain'];

  init(ctx) {
    this.cam = ctx.camera;
    this.terrain = ctx.get('terrain');
    this.focus = new THREE.Vector3(0, 8, 0);
    // Views are derived from the generated terrain, not hard-coded coordinates, so they stay
    // valid when the seed or terrain changes. (Hard-coded views were the first bug the
    // screenshot loop caught: two of four cameras were buried in a hillside.)
    this.views = this.buildViews();
    this.viewOrder = Object.keys(this.views);
    this.target = { yaw: 0, pitch: 0, dist: 0 };
    this.cur = { yaw: 0, pitch: 0, dist: 0 };
    this.setView(ctx.params.get('view') ?? 'hero', true);

    const el = ctx.renderer.domElement;
    let drag = null;
    el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); ctx.bus.emit('input:first'); });
    el.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.target.yaw -= (e.clientX - drag.x) * 0.005;
      this.target.pitch = THREE.MathUtils.clamp(this.target.pitch + (e.clientY - drag.y) * 0.004, -0.05, 1.35);
      drag = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('wheel', (e) => { this.target.dist = THREE.MathUtils.clamp(this.target.dist * Math.exp(e.deltaY * 0.001), 6, 900); }, { passive: true });
    this.keys = new Set();
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyV') this.setView(this.viewOrder[(this.viewOrder.indexOf(this.viewName) + 1) % this.viewOrder.length]);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    ctx.bus.on('debug:view', (name) => this.setView(name, true));

    this.fwd = new THREE.Vector3(); this.right = new THREE.Vector3(); this.off = new THREE.Vector3();
  }

  viewNames() { return this.viewOrder; }

  buildViews() {
    const t = this.terrain;
    // March outward from the island center along an angle until we hit the waterline.
    const shoreAt = (a) => {
      let r = 0;
      while (r < 450 && t.heightAt(Math.cos(a) * r, Math.sin(a) * r) > 0.3) r += 2;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, a };
    };
    // Yaw that places the camera on the seaward side of a point (outward along angle a).
    const outward = (a) => Math.atan2(Math.cos(a), Math.sin(a));
    const s1 = shoreAt(0.6), s2 = shoreAt(2.4);
    // Forest: highest tree-friendly point on a ring, viewed from downhill.
    let best = { x: 0, z: 0, h: -1, a: 0 };
    for (let a = 0; a < Math.PI * 2; a += 0.2) for (let r = 60; r < 260; r += 20) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = t.heightAt(x, z);
      if (h > 10 && h < 40 && t.slopeAt(x, z) < 0.4 && h > best.h) best = { x, z, h, a };
    }
    return {
      hero:     { focus: [s1.x * 0.8, t.heightAt(s1.x * 0.8, s1.z * 0.8) + 6, s1.z * 0.8], yaw: outward(s1.a) + 0.35, pitch: 0.16, dist: 110 },
      shore:    { focus: [s2.x, 1.5, s2.z], yaw: outward(s2.a) + 1.1, pitch: 0.06, dist: 26 },
      forest:   { focus: [best.x, best.h + 4, best.z], yaw: outward(best.a), pitch: 0.2, dist: 40 },
      overview: { focus: [0, 10, 0], yaw: 0.8, pitch: 0.55, dist: 560 },
    };
  }

  setView(name, snap = false) {
    const v = this.views[name] ?? this.views.hero;
    this.viewName = this.views[name] ? name : 'hero';
    this.focus.fromArray(v.focus);
    Object.assign(this.target, { yaw: v.yaw, pitch: v.pitch, dist: v.dist });
    if (snap) Object.assign(this.cur, this.target);
  }

  update(dt) {
    const speed = (this.keys.has('ShiftLeft') ? 60 : 20) * dt;
    this.fwd.set(-Math.sin(this.cur.yaw), 0, -Math.cos(this.cur.yaw));
    this.right.set(-this.fwd.z, 0, this.fwd.x);
    if (this.keys.has('KeyW')) this.focus.addScaledVector(this.fwd, speed);
    if (this.keys.has('KeyS')) this.focus.addScaledVector(this.fwd, -speed);
    if (this.keys.has('KeyD')) this.focus.addScaledVector(this.right, speed);
    if (this.keys.has('KeyA')) this.focus.addScaledVector(this.right, -speed);

    // Critically damped follow: smooth, never floaty; frame-rate independent.
    const k = 1 - Math.exp(-dt * 6);
    this.cur.yaw += (this.target.yaw - this.cur.yaw) * k;
    this.cur.pitch += (this.target.pitch - this.cur.pitch) * k;
    this.cur.dist += (this.target.dist - this.cur.dist) * k;

    this.off.setFromSphericalCoords(this.cur.dist, Math.PI / 2 - this.cur.pitch, this.cur.yaw);
    this.cam.position.copy(this.focus).add(this.off);
    // Never let the camera dip under terrain or water.
    const ground = Math.max(this.terrain.heightAt(this.cam.position.x, this.cam.position.z), 0);
    if (this.cam.position.y < ground + 1.5) this.cam.position.y = ground + 1.5;
    this.cam.lookAt(this.focus);
  }
}
