/* =====================================================================
   GNEČA — render.js: izris s Three.js 0.160.0 (CDN, importmap kot pri
   Krogli). Nebo in okolje za odseve uvozi iz Krogle
   (games/krogla/render/sky.js). Tekači so InstancedMesh (render/figures.js),
   steza in predmeti v render/lane.js, delci v render/fx.js.
   Kamera 2,5D zadaj in nad topom, rahlo sledi topu; tresenje ob velikanu
   in padcu stolpa. Samodejna kakovost: ob padcu FPS manj senc, delcev in
   nižja ločljivost.
   ===================================================================== */
import * as THREE from 'three';
import { makeSky, envFor, sunDirection } from '../krogla/render/sky.js';
import { B } from './balance.js';
import { Crowd } from './render/figures.js';
import { buildLane, Tag } from './render/lane.js';
import { Particles, Tracers } from './render/fx.js';
import { lookFor, SIDE } from './render/looks.js';

export const QUALITY = {
  high: { name: 'Visoka', ratio: 2, shadows: true, shadowMap: 2048, particles: 1, decor: 1 },
  medium: { name: 'Srednja', ratio: 1.5, shadows: true, shadowMap: 1024, particles: 0.7, decor: 0.7 },
  low: { name: 'Nizka', ratio: 1, shadows: false, shadowMap: 0, particles: 0.4, decor: 0.4 },
};
export const QUALITY_ORDER = ['high', 'medium', 'low'];

/** Začetna kakovost glede na napravo. */
export function detectQuality() {
  try {
    const touch = matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency || 4;
    if (touch) return cores >= 8 ? 'medium' : 'low';
    return cores >= 6 ? 'high' : 'medium';
  } catch { return 'medium'; }
}

const MAX_TAGS = 16;

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{quality?:string, auto?:boolean, shake?:boolean}} [o]
   */
  constructor(canvas, { quality = 'medium', auto = true, shake = true } = {}) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#806040', 0.9);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.6);
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.particles = new Particles(this.scene, 600);
    this.tracers = new Tracers(this.scene);
    this.auto = auto; this.shakeOn = shake;
    this.cam = { x: 0, shake: 0 };
    this.fps = { frames: 0, t: 0, value: 60, low: 0 };
    this.time = 0;
    this.gridLines = null;
    this.qualityKey = QUALITY[quality] ? quality : 'medium';
    this.q = QUALITY[this.qualityKey];
    this.onQuality = null;
    this.resize();
  }

  /* -------------------------------------------------------- kakovost */

  setQuality(k) {
    if (!QUALITY[k]) return;
    this.qualityKey = k; this.q = QUALITY[k];
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.ratio));
    this.gl.shadowMap.enabled = this.q.shadows;
    this.sun.castShadow = this.q.shadows;
    if (this.q.shadows) {
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(this.q.shadowMap, this.q.shadowMap);
    }
    this.particles.scale = this.q.particles;
    this.me?.setShadows(this.q.shadows); this.en?.setShadows(this.q.shadows);
    // materiali s sencami se morajo prevesti na novo
    this.scene.traverse(o => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); } });
    this.resize();
    this.onQuality?.(k);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width | 0), h = Math.max(1, r.height | 0);
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.ratio));
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.9;
    this.camera.fov = this.portrait ? 62 : 48;
    this.camera.updateProjectionMatrix();
  }

  /* -------------------------------------------------------- nivo */

  load(st) {
    this.clear();
    const L = st.L, look = this.look = lookFor(L.theme);
    this.gl.toneMappingExposure = look.exposure;
    this.scene.environment = envFor(this.gl, look);
    this.gl.setClearColor(look.fog[0]);
    this.scene.fog = new THREE.FogExp2(look.fog[0], look.fog[1]);
    this.sky = makeSky(look);
    this.scene.add(this.sky);
    const sd = sunDirection(look);
    this.sun.color.set(look.light.sun[0]); this.sun.intensity = look.light.sun[1];
    this.hemi.color.set(look.light.hemi[0]); this.hemi.groundColor.set(look.light.hemi[1]); this.hemi.intensity = look.light.hemi[2];
    // senčna kamera pokrije celo stezo
    const Ln = L.length;
    this.sun.position.set(sd.x * 40, sd.y * 40 + 10, -Ln / 2 + sd.z * 40);
    this.sun.target.position.set(0, 0, -Ln / 2);
    const sc = this.sun.shadow.camera, half = Math.max(L.width, 10) * 0.9 + 4;
    sc.left = -half; sc.right = half; sc.top = Ln / 2 + 8; sc.bottom = -Ln / 2 - 8; sc.near = 1; sc.far = 120;
    sc.updateProjectionMatrix();
    this.lane = buildLane(L, look, { shadows: this.q.shadows, decor: this.q.decor });
    this.scene.add(this.lane.root);
    this.me = new Crowd(this.scene, { color: SIDE.me.color, giant: SIDE.me.giant, facing: 0, capacity: B.alloc, shadows: this.q.shadows });
    this.en = new Crowd(this.scene, { color: SIDE.en.color, giant: SIDE.en.giant, facing: Math.PI, capacity: B.alloc, shadows: this.q.shadows });
    this.tags = [];
    for (let k = 0; k < MAX_TAGS; k++) { const t = new Tag(this.scene, { scale: 0.5 }); t.sp.visible = false; this.tags.push(t); }
    this.cam.x = st.cannon.x; this.cam.shake = 0;
    this.setQuality(this.qualityKey);
    if (this.gridLines) this.showGrid(true, st);
  }

  clear() {
    this.lane?.dispose(); this.lane = null;
    this.me?.dispose(); this.en?.dispose(); this.me = this.en = null;
    this.tags?.forEach(t => t.dispose()); this.tags = [];
    if (this.sky) { this.sky.removeFromParent(); this.sky.geometry.dispose(); this.sky.material.dispose(); this.sky = null; }
    this.particles.clear();
    if (this.gridLines) { this.gridLines.removeFromParent(); this.gridLines.geometry.dispose(); }
  }

  /** Prikaz mreže trkov (debug). */
  showGrid(on, st) {
    if (this.gridLines) { this.gridLines.removeFromParent(); this.gridLines.geometry.dispose(); this.gridLines = null; }
    if (!on || !st) return;
    const g = st.gridMe, pts = [];
    for (let c = 0; c <= g.cols; c++) { const x = g.x0 + c * g.cell; pts.push(x, 0.03, -g.z0, x, 0.03, -(g.z0 + g.rows * g.cell)); }
    for (let r = 0; r <= g.rows; r++) { const z = g.z0 + r * g.cell; pts.push(g.x0, 0.03, -z, g.x0 + g.cols * g.cell, 0.03, -z); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.gridLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#00ffcc', transparent: true, opacity: 0.35 }));
    this.scene.add(this.gridLines);
  }

  /* -------------------------------------------------------- dogodki simulacije */

  events(st, evs) {
    const P = this.particles, L = this.lane;
    for (const e of evs) {
      switch (e.t) {
        case 'clash': P.burst(e.x, 0.45, -e.z, e.big ? 5 : 2, Math.random() < 0.5 ? SIDE.me.color : SIDE.en.color, { speed: 2.6, up: 2.2, size: e.big ? 1.3 : 0.8, life: 0.4 }); break;
        case 'pop': P.burst(e.x, 0.6, -e.z, 2, '#9ff3ff', { speed: 1.6, up: 3, size: 0.6, life: 0.35 }); if (L?.gates[e.i]) L.gates[e.i].pulse = 1; break;
        case 'minus': P.burst(e.x, 0.6, -e.z, 2, '#ff5b6b', { speed: 1.5, up: 2.5, size: 0.7, life: 0.35 }); break;
        case 'cut': P.burst(e.x, 0.4, -e.z, 3, '#ff3d4d', { speed: 3.5, up: 2, size: 0.7, life: 0.45 }); break;
        case 'tower': P.burst(e.x, 1 + Math.random() * 3, -st.tower.z + 1.4, e.giant ? 10 : 2, '#ffd23f', { speed: 3, up: 3, size: 1, life: 0.5 }); if (L) L.towerHit = Math.min(1, L.towerHit + (e.giant ? 1 : 0.15)); if (e.giant) this.shake(0.5); break;
        case 'zap': this.tracers.add(e.x, e.z, e.tx, e.tz); break;
        case 'turretdown': P.burst(e.x, 1, -e.z, 16, '#b8432e', { speed: 4, up: 5, size: 1.6, life: 0.9 }); this.shake(0.35); break;
        case 'giant': this.shake(0.4); if (L) L.kick = 1; P.burst(e.x, 1, 0, 8, '#9fd0ff', { speed: 3, up: 3, size: 1.2, life: 0.5 }); break;
        case 'shot': if (L) L.kick = Math.max(L.kick || 0, 0.4); break;
        case 'win': this.shake(1.2); for (let k = 0; k < 6; k++) P.burst((Math.random() - 0.5) * 4, 2 + k, -st.tower.z, 12, k % 2 ? '#b8432e' : '#ffd23f', { speed: 6, up: 7, size: 2, life: 1.4 }); break;
        case 'breach': P.burst(e.x, 0.6, -0.5, 6, '#ff3d4d', { speed: 3, up: 3, size: 1, life: 0.5 }); this.shake(0.3); break;
        default: break;
      }
    }
  }

  shake(a) { if (this.shakeOn) this.cam.shake = Math.min(1.5, this.cam.shake + a); }

  /* -------------------------------------------------------- sličica */

  frame(st, dt) {
    this.time += dt;
    const t = this.time;
    if (!this.lane) return;
    this.lane.update(st, t, dt);
    this.me.update(st.me, t, st.p.runSpeed);
    this.en.update(st.en, t, st.p.enemySpeed);
    this.particles.update(dt);
    this.tracers.update(dt);
    if (this.sky) { this.sky.position.copy(this.camera.position); this.sky.material.uniforms.uTime.value = t; }
    // HP nad velikani
    let k = 0;
    for (const S of [st.me, st.en]) {
      for (let i = 0; i < S.n && k < MAX_TAGS; i++) {
        if (S.kind[i] !== 1) continue;
        const tag = this.tags[k++];
        tag.sp.visible = true;
        tag.sp.position.set(S.x[i], S.r[i] * 2.6 + 0.6, -S.z[i]);
        tag.set('' + Math.ceil(S.hp[i]), S === st.me ? '#bfe4ff' : '#ffc2b0');
      }
    }
    for (; k < MAX_TAGS; k++) this.tags[k].sp.visible = false;
    this._camera(st, dt);
    this.gl.render(this.scene, this.camera);
    this._fps(dt);
  }

  _camera(st, dt) {
    const L = st.L;
    this.cam.x += (st.cannon.x - this.cam.x) * Math.min(1, dt * 3);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 2.2);
    const s = this.cam.shake * this.cam.shake;
    const portrait = this.portrait;
    // portret: višje in bolj strmo, da se vidi cela steza
    const H = portrait ? 14 + L.width * 0.35 : 10 + L.width * 0.25;
    const D = portrait ? 11 : 11.5;
    const lookZ = portrait ? -L.length * 0.4 : -L.length * 0.36;
    this.camera.position.set(this.cam.x * 0.45 + (Math.random() - 0.5) * s * 0.6, H + (Math.random() - 0.5) * s * 0.4, D);
    this.camera.lookAt(this.cam.x * 0.25, 0, lookZ);
  }

  _fps(dt) {
    const f = this.fps;
    f.frames++; f.t += dt;
    if (f.t < 1) return;
    f.value = f.frames / f.t;
    f.frames = 0; f.t = 0;
    if (!this.auto) return;
    // dve zaporedni sekundi pod 45 FPS → nižja kakovost
    if (f.value < 45) f.low++; else f.low = 0;
    if (f.low >= 2) {
      f.low = 0;
      const i = QUALITY_ORDER.indexOf(this.qualityKey);
      if (i < QUALITY_ORDER.length - 1) this.setQuality(QUALITY_ORDER[i + 1]);
    }
  }

  info() {
    const i = this.gl.info;
    return { calls: i.render.calls, tris: i.render.triangles, q: this.qualityKey, fps: Math.round(this.fps.value) };
  }

  dispose() { this.clear(); this.particles.dispose(); this.tracers.dispose(); this.gl.dispose(); }
}
