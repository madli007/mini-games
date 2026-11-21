/* =====================================================================
   HRČKOVA KROGLA — render/fx.js: delci in sledi.
   Bazeni (brez ustvarjanja objektov med igro): iskre (aditivno, HDR za
   bloom), prah/kapljice/kristalčki (mehke lise), konfeti (instancirano),
   trak-sled krogle (gladka trak-geometrija) in ambientni delci (shader).
   ===================================================================== */
import * as THREE from 'three';
import { softDot } from './textures.js';

/* ------------------------------------------------------------ bazen točkovnih delcev */

class Pool {
  constructor(parent, n, { size, additive, texture }) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.g = new Float32Array(n); this.drag = new Float32Array(n); this.base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -1e4;
    const geo = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pa); geo.setAttribute('color', this.ca);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, map: texture || null, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    this.pts = new THREE.Points(geo, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 5;
    parent.add(this.pts);
    this.i = 0; this.alive = 0;
  }
  emit(x, y, z, vx, vy, vz, c, life, g = 9, drag = 0.5) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.base[i * 3] = c.r; this.base[i * 3 + 1] = c.g; this.base[i * 3 + 2] = c.b;
    this.life[i] = life; this.max[i] = life; this.g[i] = g; this.drag[i] = drag;
    this.alive = this.n;
  }
  update(dt) {
    if (!this.alive) return;
    let any = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any++;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) { this.pos[k + 1] = -1e4; this.col[i * 4 + 3] = 0; continue; }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 2] *= d; this.vel[k + 1] = this.vel[k + 1] * d - this.g[i] * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = this.life[i] / this.max[i];
      this.col[i * 4] = this.base[k]; this.col[i * 4 + 1] = this.base[k + 1]; this.col[i * 4 + 2] = this.base[k + 2];
      this.col[i * 4 + 3] = Math.min(1, f * 1.6);
    }
    this.pa.needsUpdate = true; this.ca.needsUpdate = true;
    if (!any) this.alive = 0;
  }
  dispose() { this.pts.geometry.dispose(); this.mat.dispose(); this.pts.parent?.remove(this.pts); }
}

/* ------------------------------------------------------------ konfeti */

class Confetti {
  constructor(parent, n) {
    this.n = n;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.11), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.4, metalness: 0.3 }), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.p = []; this.i = 0;
    const cols = ['#ffd23f', '#ff4fd8', '#4de1ff', '#39ff88', '#ff7a1a', '#ffffff'];
    for (let k = 0; k < n; k++) this.mesh.setColorAt(k, new THREE.Color(cols[k % cols.length]));
    parent.add(this.mesh);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(1, 1, 1); this.v = new THREE.Vector3();
  }
  burst(x, y, z, k) {
    for (let j = 0; j < k; j++) {
      const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 3.5;
      this.p[this.i] = { x, y, z, vx: Math.cos(a) * s, vy: 3 + Math.random() * 5, vz: Math.sin(a) * s, rx: Math.random() * 6, ry: Math.random() * 6, sp: 4 + Math.random() * 8, life: 2.2 + Math.random() };
      this.i = (this.i + 1) % this.n;
    }
  }
  update(dt) {
    let c = 0;
    for (let k = 0; k < this.n; k++) {
      const p = this.p[k];
      if (!p || p.life <= 0) continue;
      p.life -= dt;
      p.vy -= 6 * dt; p.vx *= 1 - 1.4 * dt; p.vz *= 1 - 1.4 * dt; p.vy = Math.max(p.vy, -1.6);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += p.sp * dt; p.ry += p.sp * 0.7 * dt;
      this.q.setFromEuler(this.e.set(p.rx, p.ry, 0));
      this.mesh.setMatrixAt(c, this.m4.compose(this.v.set(p.x + Math.sin(p.rx) * 0.05, p.y, p.z), this.q, this.s.setScalar(Math.min(1, p.life))));
      if (c !== k) { const tmp = this.p[c]; this.p[c] = p; this.p[k] = tmp; }
      c++;
    }
    this.mesh.count = c;
    if (c) this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose(); this.mesh.parent?.remove(this.mesh); }
}

/* ------------------------------------------------------------ trak-sled */

export class Trail {
  constructor(parent, color, R) {
    this.N = 44; this.R = R;
    this.hist = [];
    const N = this.N;
    this.pos = new Float32Array(N * 2 * 3); this.col = new Float32Array(N * 2 * 4);
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    this.pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pa); geo.setAttribute('color', this.ca);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.c = new THREE.Color(color).multiplyScalar(1.6);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    parent.add(this.mesh);
    this.tmp = new THREE.Vector3(); this.side = new THREE.Vector3(); this.tan = new THREE.Vector3(); this.view = new THREE.Vector3();
  }
  reset() { this.hist.length = 0; }
  update(p, camPos) {
    const h = this.hist;
    const last = h[0];
    if (!last || (last.x - p.x) ** 2 + (last.y - p.y) ** 2 + (last.z - p.z) ** 2 > 0.0016) {
      h.unshift({ x: p.x, y: p.y - this.R * 0.55, z: p.z });
      if (h.length > this.N) h.pop();
    } else { last.x = p.x; last.z = p.z; }
    for (let i = 0; i < this.N; i++) {
      const a = h[Math.min(i, h.length - 1)] || { x: p.x, y: p.y, z: p.z };
      const b = h[Math.min(i + 1, h.length - 1)] || a;
      this.tan.set(a.x - b.x, a.y - b.y, a.z - b.z);
      if (this.tan.lengthSq() < 1e-8) this.tan.set(0, 0, 1);
      this.view.set(camPos.x - a.x, camPos.y - a.y, camPos.z - a.z);
      this.side.crossVectors(this.tan, this.view).normalize();
      const f = 1 - i / (this.N - 1);
      const wdt = this.R * 0.42 * (0.25 + 0.75 * f);
      const k = i * 6;
      this.pos[k] = a.x + this.side.x * wdt; this.pos[k + 1] = a.y + this.side.y * wdt; this.pos[k + 2] = a.z + this.side.z * wdt;
      this.pos[k + 3] = a.x - this.side.x * wdt; this.pos[k + 4] = a.y - this.side.y * wdt; this.pos[k + 5] = a.z - this.side.z * wdt;
      const al = i < h.length ? f * f * 0.9 : 0;
      for (let s = 0; s < 2; s++) { const c = i * 8 + s * 4; this.col[c] = this.c.r * al; this.col[c + 1] = this.c.g * al; this.col[c + 2] = this.c.b * al; this.col[c + 3] = al; }
    }
    this.pa.needsUpdate = true; this.ca.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.parent?.remove(this.mesh); }
}

/* ------------------------------------------------------------ ambientni delci (shader, brez dela na CPU) */

const AMB_VERT = /* glsl */`
attribute float aSeed;
uniform float uTime, uSize, uScale, uMode, uH;
varying float vA; varying float vSeed;
void main() {
  vec3 p = position;
  float t = uTime * (0.6 + aSeed * 0.8);
  if (uMode < 0.5) {            // lebdenje (kresnice, prah)
    p += vec3(sin(t * 0.7 + aSeed * 40.0), sin(t * 0.9 + aSeed * 17.0) * 0.6, cos(t * 0.6 + aSeed * 23.0)) * 0.6;
    vA = 0.55 + 0.45 * sin(t * 2.3 + aSeed * 60.0);
  } else if (uMode < 1.5) {     // padanje (sneg)
    p.y = position.y - mod(t * 0.7 + aSeed * uH, uH);
    p.x += sin(t + aSeed * 30.0) * 0.4;
    vA = 0.85;
  } else {                      // dviganje (iskre ognja, para)
    float f = mod(t * 0.35 + aSeed, 1.0);
    p.y = position.y + f * uH;
    p.x += sin(t * 1.3 + aSeed * 30.0) * 0.5 * f;
    vA = sin(f * 3.14159);
  }
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * uScale / max(0.5, -mv.z) * (0.6 + aSeed * 0.8);
  gl_Position = projectionMatrix * mv;
}`;
const AMB_FRAG = /* glsl */`
uniform sampler2D uTex; uniform vec3 uColor; uniform float uAlpha;
varying float vA; varying float vSeed;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(uColor, t.a * vA * uAlpha);
  #include <colorspace_fragment>
}`;

export function ambient(parent, { count, box, mode, color, size, additive, alpha = 1, intensity = 1 }) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = k => { const x = Math.sin((i + 1) * (12.9898 + k * 78.233)) * 43758.5453; return x - Math.floor(x); };
    pos[i * 3] = box.min.x + r(1) * (box.max.x - box.min.x);
    pos[i * 3 + 1] = box.min.y + r(2) * (box.max.y - box.min.y);
    pos[i * 3 + 2] = box.min.z + r(3) * (box.max.z - box.min.z);
    seed[i] = r(4);
  }
  if (mode === 1) for (let i = 0; i < count; i++) pos[i * 3 + 1] = box.max.y;
  if (mode === 2) for (let i = 0; i < count; i++) pos[i * 3 + 1] = box.min.y;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    vertexShader: AMB_VERT, fragmentShader: AMB_FRAG, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 }, uSize: { value: size }, uScale: { value: 400 }, uMode: { value: mode }, uH: { value: box.max.y - box.min.y },
      uTex: { value: softDot() }, uColor: { value: new THREE.Color(color).multiplyScalar(intensity) }, uAlpha: { value: alpha },
    },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  parent.add(pts);
  return pts;
}

/* ------------------------------------------------------------ upravljalec učinkov */

export class FX {
  constructor(parent, q, reduced) {
    this.q = q; this.reduced = reduced;
    const k = Math.max(0.3, q.particles);
    this.sparks = new Pool(parent, Math.round(420 * k), { size: 0.07, additive: true, texture: softDot() });
    this.dust = new Pool(parent, Math.round(260 * k), { size: 0.22, additive: false, texture: softDot() });
    this.conf = q.particles >= 0.5 ? new Confetti(parent, 160) : null;
    this.c = new THREE.Color();
  }
  amount(n) { return Math.max(1, Math.round(n * this.q.particles * (this.reduced ? 0.4 : 1))); }
  /** Iskre (aditivno, svetle → bloom). */
  spark(x, y, z, color, n = 12, speed = 3, life = 0.6, hdr = 2.2) {
    const c = this.c.set(color).multiplyScalar(hdr);
    const k = this.amount(n);
    for (let i = 0; i < k; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.3 + Math.random() * 0.7;
      this.sparks.emit(x, y, z, Math.cos(a) * speed * e, speed * (0.4 + Math.random() * 0.8), Math.sin(a) * speed * e, c, life * (0.6 + Math.random() * 0.6), 9, 0.8);
    }
  }
  /** Prah, kapljice, kristalčki (mehke lise). */
  puff(x, y, z, color, n = 10, speed = 1.5, life = 0.8, g = 1.5) {
    const c = this.c.set(color);
    const k = this.amount(n);
    for (let i = 0; i < k; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.4 + Math.random() * 0.6;
      this.dust.emit(x, y, z, Math.cos(a) * speed * e, speed * 0.5 * Math.random() + 0.2, Math.sin(a) * speed * e, c, life * (0.6 + Math.random() * 0.7), g, 2.2);
    }
  }
  confetti(x, y, z, n = 90) { if (this.conf) this.conf.burst(x, y, z, this.amount(n)); }
  update(dt) { this.sparks.update(dt); this.dust.update(dt); this.conf?.update(dt); }
  dispose() { this.sparks.dispose(); this.dust.dispose(); this.conf?.dispose(); }
}
