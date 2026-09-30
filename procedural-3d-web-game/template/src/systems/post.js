import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Post chain: scene -> bloom (tier-gated) -> tone map/sRGB (OutputPass) -> color grade + vignette.
// The grade is where "clean low-poly under a milky haze" becomes a punchy, art-directed frame:
// S-curve contrast, saturation, warm highlights / cool shadows, vignette.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.12 }, saturation: { value: 1.15 },
    lift: { value: new THREE.Vector3(0.0, 0.01, 0.025) },   // cool shadows
    gain: { value: new THREE.Vector3(1.03, 1.0, 0.96) },     // warm highlights
    vignette: { value: 0.28 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float contrast, saturation, vignette; uniform vec3 lift, gain; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c = c * gain + lift * (1.0 - c);
      vec2 d = vUv - 0.5; c *= 1.0 - vignette * dot(d, d) * 2.2;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class PostSystem {
  static id = 'post';
  static deps = ['sky', 'water', 'terrain', 'camera'];

  init(ctx) {
    const { renderer, scene, camera, quality } = ctx;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    if (quality.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.6, 0.92);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    ctx.render = () => this.composer.render();
  }

  update(dt, ctx) {
    const s = ctx.get('sky').state;
    if (this.bloom) this.bloom.strength = 0.2 + 0.35 * (s.golden ?? 0) + 0.25 * (1 - s.daylight);
  }

  resize(w, h) { this.composer.setSize(w, h); }
}
