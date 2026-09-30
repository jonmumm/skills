import * as THREE from 'three';
import { mulberry32 } from './rng.js';

/**
 * Engine contract (adapted from the Claude-of-Duty ARCHITECTURE.md pattern):
 * - Each system is a class with `static id`, optional `static deps = [...]`, and lifecycle
 *   methods init(ctx) / fixedUpdate(h, ctx) / update(dt, ctx) / lateUpdate(dt, ctx) / resize(w, h, ctx) / dispose().
 * - Systems never import each other. They look each other up at runtime with ctx.get('id')
 *   and talk through ctx.bus events. This lets one agent own one system without merge fights.
 * - All randomness comes from ctx.rng.fork('<system>'). No Math.random().
 * - No allocations per frame: preallocate vectors/matrices in init().
 */

const PARAMS = new URLSearchParams(location.search);

export const QUALITY = {
  low:    { pixelRatio: 1.0, shadowMap: 1024, bloom: false, water: 256,  treeCount: 1500, terrainSegments: 160 },
  medium: { pixelRatio: 1.5, shadowMap: 2048, bloom: true,  water: 512,  treeCount: 4000, terrainSegments: 256 },
  high:   { pixelRatio: 2.0, shadowMap: 4096, bloom: true,  water: 1024, treeCount: 9000, terrainSegments: 384 },
};

export class Bus {
  #m = new Map();
  on(type, fn) { (this.#m.get(type) ?? this.#m.set(type, new Set()).get(type)).add(fn); return () => this.#m.get(type).delete(fn); }
  emit(type, payload) { this.#m.get(type)?.forEach((fn) => fn(payload)); }
}

export class Engine {
  constructor(systemClasses) {
    const seed = Number(PARAMS.get('seed') ?? 1337);
    const qualityName = PARAMS.get('quality') ?? (matchMedia('(pointer: coarse)').matches ? 'low' : 'medium');
    const quality = { name: qualityName, ...(QUALITY[qualityName] ?? QUALITY.medium) };

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: PARAMS.has('capture') });
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false; // count draw calls across all passes of a frame, reset in tick()
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 4000);

    this.ctx = {
      THREE, renderer, scene, camera, quality, params: PARAMS, seed,
      rng: mulberry32(seed),
      bus: new Bus(),
      time: { elapsed: 0, frame: 0, frozen: PARAMS.has('freeze') ? Number(PARAMS.get('freeze')) : null },
      get: (id) => this.byId.get(id),
      render: null, // a system (post) may replace this with its own render function
    };
    this.ctx.render = () => renderer.render(scene, camera);

    this.systems = topoSort(systemClasses).map((C) => new C());
    this.byId = new Map(this.systems.map((s) => [s.constructor.id, s]));
    this.fixedStep = 1 / 120;
    this.acc = 0;
    this.frameTimes = new Float32Array(240);
  }

  async start() {
    for (const s of this.systems) await s.init?.(this.ctx);
    addEventListener('resize', () => this.resize());
    this.resize();
    this.installDebugHooks();
    // Compile every material once before frame one so the first seconds don't hitch.
    await this.ctx.renderer.compileAsync(this.ctx.scene, this.ctx.camera);
    this.last = performance.now();
    this.ctx.renderer.setAnimationLoop((t) => this.tick(t));
  }

  // "Ready" means frames are actually on screen, not just that init finished: the first frames
  // can still compile passes (post, reflections), and tests that start earlier see a dead loop.
  markReady() {
    const loader = document.getElementById('loader');
    if (loader) { loader.style.opacity = 0; setTimeout(() => loader.remove(), 700); }
    window.__game.ready = true;
    this.ctx.bus.emit('game:ready');
  }

  tick(now) {
    const { ctx } = this;
    const realDt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.frameTimes[ctx.time.frame % this.frameTimes.length] = realDt * 1000;
    const dt = ctx.time.frozen !== null ? 0 : realDt;
    if (ctx.time.frozen !== null) ctx.time.elapsed = ctx.time.frozen;
    else ctx.time.elapsed += dt;

    this.acc += dt;
    while (this.acc >= this.fixedStep) {
      for (const s of this.systems) s.fixedUpdate?.(this.fixedStep, ctx);
      this.acc -= this.fixedStep;
    }
    for (const s of this.systems) s.update?.(dt, ctx);
    for (const s of this.systems) s.lateUpdate?.(dt, ctx);
    ctx.renderer.info.reset();
    ctx.render();
    ctx.time.frame++;
    if (ctx.time.frame === 3) this.markReady();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.ctx.renderer.setSize(w, h);
    this.ctx.camera.aspect = w / h;
    this.ctx.camera.updateProjectionMatrix();
    for (const s of this.systems) s.resize?.(w, h, this.ctx);
  }

  // Test hooks used by scripts/shoot.mjs and scripts/check.mjs. Keep them in shipped builds:
  // they cost nothing and let any agent drive the game deterministically.
  installDebugHooks() {
    const ctx = this.ctx;
    const engine = this;
    window.__game = {
      ready: false,
      seed: ctx.seed,
      quality: ctx.quality.name,
      systems: this.systems.map((s) => s.constructor.id),
      views: () => ctx.get('camera')?.viewNames?.() ?? [],
      // Hooks acknowledge what they did and throw on unknown names, so a screenshot labeled
      // "shore" can never silently be some other view.
      setView: (name) => {
        const known = ctx.get('camera')?.viewNames?.() ?? [];
        if (!known.includes(name)) throw new Error(`unknown view "${name}" (known: ${known.join(', ')})`);
        ctx.bus.emit('debug:view', name);
        return { view: name };
      },
      setTimeOfDay: (hours) => ctx.bus.emit('debug:timeOfDay', hours),
      freeze: (seconds) => { ctx.time.frozen = seconds; },
      unfreeze: () => { ctx.time.frozen = null; },
      // Wait n real frames (lets TAA/shadows/env maps settle before a screenshot).
      frames: (n = 3) => new Promise((res) => { const target = ctx.time.frame + n; const poll = () => (ctx.time.frame >= target ? res() : requestAnimationFrame(poll)); poll(); }),
      stats: () => {
        const ft = Array.from(engine.frameTimes).filter((x) => x > 0).sort((a, b) => a - b);
        const pct = (p) => ft[Math.min(ft.length - 1, Math.floor(ft.length * p))] ?? 0;
        const info = ctx.renderer.info;
        return { frame: ctx.time.frame, fps: ft.length ? 1000 / (ft.reduce((a, b) => a + b, 0) / ft.length) : 0,
          p50ms: pct(0.5), p95ms: pct(0.95), p99ms: pct(0.99),
          drawCalls: info.render.calls, triangles: info.render.triangles,
          geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0 };
      },
      ctx,
    };
  }
}

function topoSort(classes) {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const out = [], seen = new Set();
  const visit = (c) => { if (seen.has(c.id)) return; seen.add(c.id); (c.deps ?? []).forEach((d) => { if (!byId.has(d)) throw new Error(`${c.id} depends on missing system ${d}`); visit(byId.get(d)); }); out.push(c); };
  classes.forEach(visit);
  return out;
}
