import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise2D } from '../core/rng.js';

// Procedural island: fBm + ridged noise shaped by a radial falloff, slope/height-based
// vertex colors, and instanced trees + rocks placed by seeded rejection sampling.
// heightAt(x, z) is the single source of truth other systems use for grounding things.
export class TerrainSystem {
  static id = 'terrain';

  init(ctx) {
    const { scene, quality } = ctx;
    this.rng = ctx.rng.fork('terrain');
    this.noise = makeNoise2D(Math.floor(this.rng.next() * 1e9));
    this.size = 900;

    const seg = quality.terrainSegments;
    const geo = new THREE.PlaneGeometry(this.size, this.size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();

    const sand = new THREE.Color(0.62, 0.55, 0.4), wetSand = new THREE.Color(0.45, 0.39, 0.29);
    const grass = new THREE.Color(0.2, 0.34, 0.12), dryGrass = new THREE.Color(0.42, 0.42, 0.2);
    const rock = new THREE.Color(0.36, 0.34, 0.32), seabed = new THREE.Color(0.28, 0.33, 0.3);
    const c = new THREE.Color();
    const nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const slope = 1 - nrm.getY(i);
      const jitter = this.noise.fbm(x * 0.05, z * 0.05, 3);
      if (y < -1) c.copy(seabed);
      else if (y < 0.6) c.copy(wetSand).lerp(sand, THREE.MathUtils.smoothstep(y, -1, 0.6));
      else if (y < 3.5) c.copy(sand).lerp(dryGrass, THREE.MathUtils.smoothstep(y, 2, 3.5));
      else c.copy(dryGrass).lerp(grass, THREE.MathUtils.smoothstep(jitter, 0.35, 0.6));
      c.lerp(rock, THREE.MathUtils.smoothstep(slope, 0.22, 0.42));
      c.multiplyScalar(0.85 + 0.3 * jitter); // break up uniformity; nothing should look flat-filled
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    this.buildTrees(ctx);
    this.buildRocks(ctx);
  }

  heightAt(x, z) {
    const r = Math.hypot(x, z) / (this.size * 0.42);
    const falloff = 1 - THREE.MathUtils.smoothstep(r, 0.35, 1.0);
    const base = this.noise.fbm(x * 0.004 + 10, z * 0.004 - 7, 5);
    const ridge = this.noise.ridged(x * 0.006, z * 0.006, 5);
    const h = (base * 0.6 + ridge * 0.55) * 95 * falloff * falloff;
    return h - 14 + 10 * falloff; // sea level is y = 0
  }

  slopeAt(x, z) {
    const e = 1.5;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  buildTrees(ctx) {
    // One conifer = trunk + 3 stacked cones, merged; vertex colors so one material/draw call serves all.
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.18, 0.3, 2.4, 6).translate(0, 1.2, 0);
    paint(trunk, 0x4a3524); parts.push(trunk);
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.ConeGeometry(2.1 - k * 0.55, 3.2 - k * 0.5, 8).translate(0, 2.6 + k * 1.6, 0);
      paint(cone, [0x24401f, 0x2b4a24, 0x335628][k]); parts.push(cone);
    }
    const geo = mergeGeometries(parts);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const count = ctx.quality.treeCount;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true; mesh.receiveShadow = true;

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const tint = new THREE.Color();
    let placed = 0;
    for (let tries = 0; tries < count * 20 && placed < count; tries++) {
      const x = this.rng.range(-this.size / 2, this.size / 2), z = this.rng.range(-this.size / 2, this.size / 2);
      const y = this.heightAt(x, z);
      if (y < 4 || y > 60 || this.slopeAt(x, z) > 0.55) continue;
      // Clumping: density follows a low-frequency noise field so forests form groves and clearings.
      if (this.noise.fbm(x * 0.012, z * 0.012, 3) < 0.45 + this.rng.next() * 0.15) continue;
      const sc = this.rng.range(0.7, 1.6);
      q.setFromAxisAngle(up, this.rng.range(0, Math.PI * 2));
      m.compose(p.set(x, y - 0.2, z), q, s.set(sc, sc * this.rng.range(0.85, 1.25), sc));
      mesh.setMatrixAt(placed, m);
      mesh.setColorAt(placed, tint.setHSL(0.27 + this.rng.range(-0.03, 0.03), 0.35, this.rng.range(0.75, 1.1)));
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    ctx.scene.add(mesh);
    this.trees = mesh;
  }

  buildRocks(ctx) {
    const base = new THREE.IcosahedronGeometry(1, 2);
    const p = base.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { // lumpy, faceted boulders instead of clean spheres
      v.fromBufferAttribute(p, i);
      const n = this.noise.fbm(v.x * 1.7 + 3, v.z * 1.7 + v.y * 1.3, 4);
      v.multiplyScalar(0.7 + n * 0.6); v.y *= 0.7;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    base.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x77726b, roughness: 0.95, flatShading: true });
    const count = 400;
    const mesh = new THREE.InstancedMesh(base, mat, count);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), e = new THREE.Euler();
    let placed = 0;
    for (let tries = 0; tries < count * 30 && placed < count; tries++) {
      const x = this.rng.range(-this.size / 2, this.size / 2), z = this.rng.range(-this.size / 2, this.size / 2);
      const y = this.heightAt(x, z);
      if (y < -3 || y > 70) continue;
      if (this.slopeAt(x, z) < 0.25 && this.rng.next() > 0.08) continue; // mostly on slopes and shorelines
      const sc = this.rng.range(0.6, 3.5);
      q.setFromEuler(e.set(this.rng.range(0, 6.3), this.rng.range(0, 6.3), this.rng.range(0, 6.3)));
      m.compose(pos.set(x, y - sc * 0.25, z), q, s.set(sc * this.rng.range(0.8, 1.4), sc, sc * this.rng.range(0.8, 1.4)));
      mesh.setMatrixAt(placed++, m);
    }
    mesh.count = placed;
    ctx.scene.add(mesh);
  }
}

function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
