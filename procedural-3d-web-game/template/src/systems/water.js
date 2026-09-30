import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

// Reflective ocean using three's planar-reflection Water, fed by a normal map that is
// generated in code (tileable sum of periodic waves) so there are zero external assets.
// Upgrade path for a flagship water pass: FFT/Gerstner displacement, depth-based
// Beer-Lambert color, foam from the wave Jacobian, caustics — see references/rendering-cookbook.md.
export class WaterSystem {
  static id = 'water';
  static deps = ['sky'];

  init(ctx) {
    const size = 256;
    const normals = makeTileableWaterNormals(size, ctx.rng.fork('water'));
    const res = ctx.quality.water;
    this.water = new Water(new THREE.PlaneGeometry(6000, 6000), {
      textureWidth: res, textureHeight: res,
      waterNormals: normals,
      sunDirection: new THREE.Vector3(0, 1, 0),
      sunColor: 0xffffff,
      waterColor: 0x0a3140,
      distortionScale: 2.2,
      fog: true,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.material.uniforms.size.value = 2.2;
    ctx.scene.add(this.water);
  }

  update(dt, ctx) {
    const u = this.water.material.uniforms;
    u.time.value = ctx.time.elapsed * 0.6;
    const sky = ctx.get('sky').state;
    u.sunDirection.value.copy(sky.sunDir);
    const d = sky.daylight;
    u.sunColor.value.setRGB(0.25 + 0.75 * d, 0.25 + 0.65 * d, 0.3 + 0.55 * d);
    u.waterColor.value.setRGB(0.02 + 0.02 * d, 0.07 + 0.12 * d, 0.1 + 0.14 * d);
  }

  // CPU query kept in sync with anything that floats. Flat for this starter; if you add
  // displacement, evaluate the SAME wave sum here that the shader uses.
  heightAt() { return 0; }
}

function makeTileableWaterNormals(size, rng) {
  const h = new Float32Array(size * size);
  const waves = Array.from({ length: 24 }, () => ({
    kx: rng.int(-9, 9), kz: rng.int(-9, 9), // integer wavenumbers => perfectly tileable
    amp: rng.range(0.2, 1), phase: rng.range(0, Math.PI * 2),
  })).filter((w) => w.kx || w.kz);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    for (const w of waves) v += (w.amp / Math.hypot(w.kx, w.kz)) * Math.sin(((w.kx * x + w.kz * y) / size) * Math.PI * 2 + w.phase);
    h[y * size + x] = v;
  }
  const data = new Uint8Array(size * size * 4);
  const s = 2.5;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const d = h[((y - 1 + size) % size) * size + x], u = h[((y + 1) % size) * size + x];
    const n = new THREE.Vector3((l - r) * s, (d - u) * s, 1).normalize();
    const i = (y * size + x) * 4;
    data[i] = (n.x * 0.5 + 0.5) * 255; data[i + 1] = (n.y * 0.5 + 0.5) * 255; data[i + 2] = (n.z * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
