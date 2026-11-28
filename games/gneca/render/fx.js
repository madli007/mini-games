/* =====================================================================
   GNEČA — render/fx.js: delci (»puf« ob spopadu, iskrice ob množenju,
   razbitine stolpa) kot en InstancedMesh in kratki sledi strelov
   stolpičev (LineSegments). Kakovost določa največje število delcev.
   ===================================================================== */
import * as THREE from 'three';

export class Particles {
  constructor(scene, max = 500) {
    this.max = max; this.scale = 1;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.p = new Float32Array(max * 8);   // x y z vx vy vz life size
    this.col = new Float32Array(max * 3);
    this.n = 0;
    this._m = new THREE.Matrix4(); this._c = new THREE.Color();
  }

  /** Dodaj `count` delcev v točki (x, y, z). */
  burst(x, y, z, count, color, { speed = 3, up = 2.5, size = 1, life = 0.5 } = {}) {
    count = Math.max(1, Math.round(count * this.scale));
    const c = this._c.set(color);
    for (let k = 0; k < count; k++) {
      if (this.n >= this.max) return;
      const i = this.n++, o = i * 8;
      const a = Math.random() * 6.283, s = speed * (0.4 + Math.random() * 0.6);
      this.p[o] = x; this.p[o + 1] = y; this.p[o + 2] = z;
      this.p[o + 3] = Math.cos(a) * s; this.p[o + 4] = up * (0.5 + Math.random()); this.p[o + 5] = Math.sin(a) * s;
      this.p[o + 6] = life * (0.7 + Math.random() * 0.6); this.p[o + 7] = size * (0.6 + Math.random() * 0.8);
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    }
  }

  update(dt) {
    const p = this.p, m = this._m, arr = this.mesh.instanceMatrix.array, ca = this.mesh.instanceColor.array;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * 8;
      p[o + 6] -= dt;
      if (p[o + 6] <= 0) continue;
      p[o + 4] -= 9 * dt;
      p[o] += p[o + 3] * dt; p[o + 1] = Math.max(0.05, p[o + 1] + p[o + 4] * dt); p[o + 2] += p[o + 5] * dt;
      if (w !== i) { for (let k = 0; k < 8; k++) p[w * 8 + k] = p[o + k]; this.col[w * 3] = this.col[i * 3]; this.col[w * 3 + 1] = this.col[i * 3 + 1]; this.col[w * 3 + 2] = this.col[i * 3 + 2]; }
      const ow = w * 8, s = p[ow + 7] * Math.min(1, p[ow + 6] * 3);
      m.makeScale(s, s, s); m.setPosition(p[ow], p[ow + 1], p[ow + 2]);
      m.toArray(arr, w * 16);
      ca[w * 3] = this.col[w * 3]; ca[w * 3 + 1] = this.col[w * 3 + 1]; ca[w * 3 + 2] = this.col[w * 3 + 2];
      w++;
    }
    this.n = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.n = 0; this.mesh.count = 0; }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

/** Kratki žarki stolpičev. */
export class Tracers {
  constructor(scene, max = 24) {
    this.max = max;
    this.pos = new Float32Array(max * 6);
    this.life = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.9 }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.k = 0;
  }
  add(x1, z1, x2, z2) {
    const i = this.k++ % this.max, o = i * 6;
    this.pos.set([x1, 1.1, -z1, x2, 0.4, -z2], o);
    this.life[i] = 0.12;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] > 0) { this.life[i] -= dt; if (this.life[i] <= 0) this.pos.fill(0, i * 6, i * 6 + 6); }
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
  dispose() { this.lines.removeFromParent(); this.lines.geometry.dispose(); this.lines.material.dispose(); }
}
