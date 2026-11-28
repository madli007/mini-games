/* =====================================================================
   GNEČA — render/figures.js: lik tekača (telo kot kapsula, oči) kot
   InstancedMesh za vse tekače ene strani. Velikani so isti lik, le
   povečani in temnejši. Moji tečejo stran od kamere (-z), sovražni
   proti kameri (vidiš jim oči).
   ===================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { B } from '../balance.js';

/** Geometrija telesa: kapsula (dno na y = 0) z rahlo zaobljenim »nosom« naprej. */
function bodyGeometry() {
  const g = new THREE.CapsuleGeometry(0.2, 0.26, 4, 10);
  g.translate(0, 0.33, 0);
  return g;
}

/** Oči: belo + zenica, z barvami oglišč (ena geometrija, en klic risanja). */
function eyesGeometry() {
  const parts = [];
  const paint = (g, c) => {
    const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { a[k * 3] = col.r; a[k * 3 + 1] = col.g; a[k * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  for (const s of [-1, 1]) {
    const w = new THREE.SphereGeometry(0.065, 8, 6); w.translate(s * 0.08, 0.5, -0.165); parts.push(paint(w, '#ffffff'));
    const p = new THREE.SphereGeometry(0.035, 6, 4); p.translate(s * 0.08, 0.5, -0.215); parts.push(paint(p, '#141420'));
  }
  return mergeGeometries(parts.map(g => g.toNonIndexed()));
}

export class Crowd {
  /**
   * @param {THREE.Scene} scene
   * @param {{color:string, giant:string, facing:number, capacity:number, shadows:boolean}} o
   */
  constructor(scene, { color, giant, facing, capacity, shadows }) {
    this.capacity = capacity;
    this.facing = facing;   // 0 = stran od kamere, Math.PI = proti kameri
    this.base = new THREE.Color(color);
    this.giantColor = new THREE.Color(giant);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.0 });
    this.eyeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.body = new THREE.InstancedMesh(bodyGeometry(), this.bodyMat, capacity);
    this.eyes = new THREE.InstancedMesh(eyesGeometry(), this.eyeMat, capacity);
    for (const m of [this.body, this.eyes]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.body.castShadow = shadows;
    this.body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.body.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  setShadows(on) { this.body.castShadow = on; }

  /**
   * Prepiši instance iz strani simulacije.
   * @param {any} S stran (x, z, r, hp, kind, ph, n)
   * @param {number} t čas za nihanje
   * @param {number} speed hitrost teka (za frekvenco korakov)
   */
  update(S, t, speed) {
    const n = Math.min(S.n, this.capacity);
    const m = this._m, q = this._q, e = this._e, p = this._p, s = this._s, c = this._c;
    const body = this.body.instanceMatrix.array, eyes = this.eyes.instanceMatrix.array, col = this.body.instanceColor.array;
    const base = this.base, gc = this.giantColor;
    for (let i = 0; i < n; i++) {
      const giant = S.kind[i] === 1;
      const sc = S.r[i] / B.runner.radius * (giant ? 0.9 : 1);
      const ph = S.ph[i] * 6.283 + t * (giant ? 6 : 13) * (speed / 6);
      const bob = Math.abs(Math.sin(ph)) * 0.07 * sc;
      e.set(Math.sin(ph * 2) * 0.12, this.facing + Math.sin(ph) * 0.12, Math.sin(ph) * 0.1);
      q.setFromEuler(e);
      p.set(S.x[i], bob, -S.z[i]);
      s.set(sc, sc * (1 + Math.sin(ph * 2) * 0.04), sc);
      m.compose(p, q, s);
      m.toArray(body, i * 16);
      m.toArray(eyes, i * 16);
      if (giant) c.copy(gc);
      else if (S.hp[i] > 1) c.copy(base).lerp(gc, Math.min(0.6, Math.log2(S.hp[i]) * 0.12));
      else c.copy(base);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    this.body.count = n; this.eyes.count = n;
    this.body.instanceMatrix.needsUpdate = true; this.eyes.instanceMatrix.needsUpdate = true;
    this.body.instanceColor.needsUpdate = true;
  }

  dispose() {
    for (const m of [this.body, this.eyes]) { m.removeFromParent(); m.geometry.dispose(); m.dispose?.(); }
    this.bodyMat.dispose(); this.eyeMat.dispose();
  }
}
