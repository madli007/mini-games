/* =====================================================================
   HRČKOVA KROGLA — render/post.js: post-processing.
   RenderPass → GTAO (ultra) → UnrealBloom (prag nad 1,0 v HDR) →
   barvna korekcija + vinjeta + rahla kromatska aberacija + tilt-shift
   (samo ozadje) → OutputPass (ACES + sRGB) → SMAA ali FXAA.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 },
    uVignette: { value: 0.3 },
    uCA: { value: 0.0015 },
    uDof: { value: 0 },
    uFocus: { value: 0.5 },
    uPulse: { value: 0 },
    uPulseColor: { value: new THREE.Color(1, 0.2, 0.3) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform vec3 uTint; uniform float uSat, uVignette, uCA, uDof, uFocus, uPulse; uniform vec3 uPulseColor;
    varying vec2 vUv;
    vec3 tap(vec2 uv) {
      vec2 c = uv - 0.5;
      float k = dot(c, c) * uCA;
      return vec3(texture2D(tDiffuse, uv - c * k).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + c * k).b);
    }
    void main() {
      vec3 col = tap(vUv);
      // tilt-shift: zamegli samo daljno ozadje (zgornji rob) in rahlo spodnji rob; krogla in pot pred njo ostaneta ostri
      if (uDof > 0.0) {
        float m = smoothstep(uFocus + 0.28, 1.02, vUv.y) + smoothstep(0.1, 0.0, vUv.y) * 0.5;
        float r = m * uDof;
        if (r > 0.05) {
          vec3 acc = col; float wsum = 1.0;
          for (int i = 0; i < 12; i++) {
            float a = float(i) * 2.39996;
            float rr = sqrt(float(i) + 0.5) / sqrt(12.0) * r;
            vec2 o = vec2(cos(a), sin(a)) * rr / uRes;
            acc += texture2D(tDiffuse, vUv + o).rgb; wsum += 1.0;
          }
          col = acc / wsum;
        }
      }
      col *= uTint;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(l), col, uSat), 0.0);
      vec2 c = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      float v = smoothstep(0.45, 1.15, length(c));
      col *= 1.0 - uVignette * v;
      col = mix(col, uPulseColor * (0.3 + l), uPulse * v);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(gl, scene, camera) {
    this.gl = gl; this.scene = scene; this.camera = camera;
    this.composer = null;
    this.opt = null;
  }

  /** opt: { ao, bloom, aa: 'smaa'|'fxaa'|null, dof, ca } */
  configure(opt, look, w, h, ratio) {
    this.dispose();
    this.opt = opt;
    const c = this.composer = new EffectComposer(this.gl);
    c.setPixelRatio(ratio);
    c.setSize(w, h);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (opt.ao) {
      const ao = new GTAOPass(this.scene, this.camera, w * ratio, h * ratio, {}, { radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 }, {});
      ao.blendIntensity = 0.85;
      this.ao = ao; c.addPass(ao);
    }
    if (opt.bloom) {
      const [s, r, t] = look.bloom;
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), s, r, t);
      c.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    this.setLook(look);
    c.addPass(this.grade);
    c.addPass(new OutputPass());
    if (opt.aa === 'smaa') { this.aa = new SMAAPass(w * ratio, h * ratio); c.addPass(this.aa); }
    else if (opt.aa === 'fxaa') {
      // FXAA brez »bias -100« (ANGLE/D3D sicer izpiše opozorilo; vzorčimo itak mip 0)
      this.aa = new ShaderPass({ ...FXAAShader, fragmentShader: FXAAShader.fragmentShader.replace(/,\s*-100\.0\s*\)/g, ')') });
      this.aa.material.uniforms.resolution.value.set(1 / (w * ratio), 1 / (h * ratio));
      c.addPass(this.aa);
    }
    this._size(w, h, ratio);
  }

  setLook(look) {
    if (!this.grade) return;
    const u = this.grade.material.uniforms, g = look.grade || {};
    u.uTint.value.set(...(g.tint || [1, 1, 1]));
    u.uSat.value = g.sat ?? 1;
    u.uVignette.value = g.vignette ?? 0.3;
    u.uCA.value = this.opt?.ca ? 0.0035 : 0;
    u.uDof.value = this.opt?.dof ? 3.2 : 0;
    if (this.bloom) { const [s, r, t] = look.bloom; this.bloom.strength = s; this.bloom.radius = r; this.bloom.threshold = t; }
  }

  _size(w, h, ratio) {
    this.grade.material.uniforms.uRes.value.set(w * ratio, h * ratio);
    if (this.aa?.material?.uniforms?.resolution) this.aa.material.uniforms.resolution.value.set(1 / (w * ratio), 1 / (h * ratio));
  }

  setSize(w, h, ratio) {
    if (!this.composer) return;
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this._size(w, h, ratio);
  }

  render(dt, focusY, pulse = 0) {
    const u = this.grade.material.uniforms;
    u.uFocus.value = focusY;
    u.uPulse.value = pulse;
    this.composer.render(dt);
  }

  dispose() {
    if (!this.composer) return;
    for (const p of this.composer.passes) p.dispose?.();
    this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose();
    this.composer = null; this.ao = null; this.bloom = null; this.grade = null; this.aa = null;
  }
}
