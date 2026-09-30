import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// Time of day drives everything: sun/moon direction, sky scattering, light colors,
// fog, exposure and the environment map. Other systems read ctx.get('sky').state.
export class SkySystem {
  static id = 'sky';

  init(ctx) {
    const { scene, renderer, params } = ctx;
    this.hours = Number(params.get('time') ?? 16.5);   // 0..24
    this.dayLengthSec = Number(params.get('day') ?? 0); // 0 = time stands still unless changed
    this.state = { sunDir: new THREE.Vector3(), daylight: 1, hours: this.hours };

    this.sky = new Sky();
    this.sky.scale.setScalar(3500);
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sm = ctx.quality.shadowMap;
    this.sun.shadow.mapSize.set(sm, sm);
    const c = this.sun.shadow.camera;
    c.left = -140; c.right = 140; c.top = 140; c.bottom = -140; c.near = 1; c.far = 900;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x4a3b28, 0.6);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0x9fb8cc, 0.0016);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.lastEnvHours = -99;

    ctx.bus.on('debug:timeOfDay', (h) => { this.hours = ((h % 24) + 24) % 24; });
    addEventListener('keydown', (e) => { if (e.code === 'KeyN') this.hours = (this.hours + 3) % 24; });

    this.tmp = new THREE.Vector3();
    this.warm = new THREE.Color(1.0, 0.62, 0.34);
    this.white = new THREE.Color(1.0, 0.97, 0.92);
    this.moon = new THREE.Color(0.55, 0.65, 0.95);
    this.apply(ctx);
  }

  update(dt, ctx) {
    if (this.dayLengthSec > 0) this.hours = (this.hours + (dt * 24) / this.dayLengthSec) % 24;
    this.apply(ctx);
  }

  apply(ctx) {
    const h = this.hours;
    // Sun travels a simple arc: rises ~6h, sets ~18h, max elevation ~62 degrees.
    const dayPhase = (h - 6) / 12;                       // 0 at sunrise, 1 at sunset
    const elevation = Math.sin(dayPhase * Math.PI) * THREE.MathUtils.degToRad(62);
    const azimuth = THREE.MathUtils.degToRad(100 + dayPhase * 160);
    const sunDir = this.state.sunDir.setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
    const daylight = THREE.MathUtils.smoothstep(sunDir.y, -0.08, 0.12);
    const golden = 1 - THREE.MathUtils.smoothstep(sunDir.y, 0.0, 0.35);
    this.state.daylight = daylight; this.state.hours = h; this.state.golden = golden * daylight;

    this.sky.material.uniforms.sunPosition.value.copy(sunDir);
    this.envSky.material.uniforms.sunPosition.value.copy(sunDir);

    // Key light: sun by day, moon (opposite side, dim and blue) by night. Shadows follow whichever is lit.
    const keyDir = daylight > 0.02 ? sunDir : this.tmp.copy(sunDir).negate();
    const focus = ctx.get('camera')?.focus ?? new THREE.Vector3();
    this.sun.position.copy(focus).addScaledVector(keyDir, 400);
    this.sun.target.position.copy(focus);
    this.sun.color.copy(this.white).lerp(this.warm, golden);
    if (daylight < 0.02) this.sun.color.copy(this.moon);
    this.sun.intensity = daylight > 0.02 ? 3.2 * daylight : 0.9;

    this.hemi.intensity = 0.35 + 0.35 * daylight;
    this.hemi.color.setRGB(0.35 + 0.4 * daylight, 0.45 + 0.4 * daylight, 0.85);

    // Night must stay readable (moonlit blue), never crushed to black. Day fog is light and
    // blue (aerial perspective), never a white/milky veil.
    const fog = ctx.scene.fog;
    fog.density = 0.0007 + 0.0004 * (1 - daylight);
    fog.color.setRGB(0.05 + 0.5 * daylight + 0.25 * golden * daylight, 0.08 + 0.62 * daylight, 0.16 + 0.72 * daylight - 0.2 * golden * daylight);

    ctx.renderer.toneMappingExposure = 0.9 - 0.38 * daylight;

    // Rebuild the environment map only when the sun has moved meaningfully (it's expensive).
    if (Math.abs(h - this.lastEnvHours) > 0.25) {
      this.lastEnvHours = h;
      this.envRT?.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
      ctx.scene.environment = this.envRT.texture;
      ctx.scene.environmentIntensity = 0.35 + 0.65 * daylight;
    }
  }

  dispose() { this.envRT?.dispose(); this.pmrem.dispose(); }
}
