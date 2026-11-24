/* =====================================================================
   SMUČARSKI SKOKI — render/scene.js: izris (Three.js 0.160), kakovost,
   kamera v slogu TV prenosa, ghosti, post-processing.
   Uvozi pomožne module Hrčkove krogle (nebo, IBL, post) brez sprememb.
   ===================================================================== */
import * as THREE from 'three';
import { makeSky, envFor, sunDirection } from '../../krogla/render/sky.js';
import { Post } from '../../krogla/render/post.js';
import { buildWorld, WAVE } from './world.js';
import { makeJumper, DEFAULT_SKIN, GHOST_SKIN } from './jumper.js';
import { dot } from './tex.js';

export const QUALITY = {
  high: { name: 'Visoka', ratio: 1.75, shadows: true, shadowMap: 2048, post: true, bloom: true, aa: 'smaa', detail: 2, decor: 1, particles: 1 },
  med: { name: 'Srednja', ratio: 1.25, shadows: true, shadowMap: 1024, post: true, bloom: true, aa: 'fxaa', detail: 1, decor: 0.65, particles: 0.6 },
  low: { name: 'Nizka', ratio: 1, shadows: false, shadowMap: 0, post: true, bloom: false, aa: 'fxaa', detail: 0, decor: 0.35, particles: 0.3 },
};
export const QUALITY_ORDER = ['high', 'med', 'low'];

export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** Privzeta kakovost glede na napravo. */
export function detectQuality() {
  let touch = false, cores = 4, gpu = '';
  try { touch = matchMedia('(pointer: coarse)').matches; cores = navigator.hardwareConcurrency || 4; } catch { /* */ }
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    if (!g) return 'low';
    const e = g.getExtension('WEBGL_debug_renderer_info');
    gpu = e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '';
    g.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* */ }
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) return 'low';
  if (touch) return cores >= 8 && /Apple GPU|Adreno \(TM\) (7[3-9]\d|[89]\d\d)|Mali-G7[1-9]|Xclipse/i.test(gpu) ? 'med' : 'low';
  if (/Intel|UHD|Iris|Mali|PowerVR|Adreno/i.test(gpu)) return 'med';
  return 'high';
}

const damp = (k, dt) => 1 - Math.exp(-k * dt);

export class Renderer {
  constructor(canvas, { quality = 'med', reduced = reducedMotion(), post = true } = {}) {
    this.canvas = canvas;
    this.reduced = reduced;
    this.usePost = post;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.2, 2600);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#8090a0', 0.8);
    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.post = new Post(this.gl, this.scene, this.camera);
    this.world = null; this.me = null; this.ghosts = [];
    this.cam = { pos: new THREE.Vector3(0, 10, 40), look: new THREE.Vector3(), init: false, shake: 0, mode: 'live', fov: 42 };
    this.time = 0;
    this.setQuality(quality, true);
    this.resize();
  }

  setQuality(q, initial = false) {
    if (!QUALITY[q]) q = 'med';
    this.qualityKey = q;
    this.q = { ...QUALITY[q] };
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.ratio));
    this.gl.shadowMap.enabled = this.q.shadows;
    this.sun.castShadow = this.q.shadows;
    if (this.q.shadows) {
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(this.q.shadowMap, this.q.shadowMap);
      const sc = this.sun.shadow.camera, r = 26;
      sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = 200; sc.updateProjectionMatrix();
    }
    if (!initial && this.hill) this.load(this.hill, this.skin);
    else this._configurePost();
    this.resize();
  }

  _configurePost() {
    if (!this.look) return;
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    if (this.q.post && this.usePost) this.post.configure({ ao: false, bloom: this.q.bloom, aa: this.q.aa, dof: false, ca: false }, this.look, w, h, this.gl.getPixelRatio());
    else this.post.dispose();
  }

  setPost(on) { this.usePost = on; this._configurePost(); }

  /** Zgradi svet skakalnice. */
  load(hill, skin = DEFAULT_SKIN) {
    this.dispose(false);
    this.hill = hill; this.skin = skin;
    const T = hill.def.theme;
    this.look = { id: 'skoki-' + T.id, sky: { ...T.sky }, bloom: T.bloom || [0.3, 0.5, 1], grade: T.grade || {} };
    this.scene.fog = new THREE.FogExp2(T.fog.color, T.fog.density);
    this.sky = makeSky(this.look);
    this.scene.add(this.sky);
    this.scene.environment = envFor(this.gl, this.look);
    this.scene.background = null;
    const sd = sunDirection(this.look);
    this.sunDir = sd;
    this.sun.color.set(T.sky.sunColor); this.sun.intensity = T.sunIntensity ?? 3;
    this.hemi.color.set(T.hemi[0]); this.hemi.groundColor.set(T.hemi[1]); this.hemi.intensity = T.hemi[2];
    this.world = buildWorld(hill, this.q);
    this.scene.add(this.world.group);
    this.me = makeJumper(skin);
    this.scene.add(this.me.root);
    // mehka »senca« pod skakalcem (vedno, tudi brez senčnih map) — za občutek višine
    this.blob = new THREE.Group();
    const bp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: dot(), color: '#0a1020', transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    bp.rotation.x = -Math.PI / 2; bp.renderOrder = 3; this.blob.add(bp); this.blobMesh = bp;
    this.scene.add(this.blob);
    this.ghosts = [];
    this.cam.init = false;
    this._configurePost();
    // prevedi senčilnike vnaprej (brez zatikanja ob prvem skoku)
    try { this.gl.compile(this.scene, this.camera); } catch { /* */ }
  }

  /** Število ghostov (prosojni skakalci). */
  setGhosts(n) {
    while (this.ghosts.length > n) { const g = this.ghosts.pop(); this.scene.remove(g.root); g.dispose(); }
    while (this.ghosts.length < n) { const g = makeJumper(GHOST_SKIN, { ghost: true }); this.scene.add(g.root); this.ghosts.push(g); }
  }

  setRecord(s) { this.world?.recordLine(s); }
  setGate(g) { this.world?.setGate(g); }
  setCheer(v) { WAVE.uCheer.value = v; }
  shake(v) { if (!this.reduced) this.cam.shake = Math.max(this.cam.shake, v); }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, this.gl.getPixelRatio());
    this.portrait = h > w * 1.1;
  }

  /* ------------------------------------------------------------ kamera */
  _camTarget(v, mode) {
    const H = this.hill;
    const P = new THREE.Vector3(), Lk = new THREE.Vector3();
    const zoom = this.portrait ? 1.65 : 1, ah = this.portrait ? 0.35 : 1;   // pokončno: dlje in bolj na sredini
    let fov = 42;
    if (mode === 'front') {
      // spredaj ob mizi: gleda nazaj po zaletu, nato za skakalcem
      P.set(13, 1.6, 6.5); Lk.set(v.x, v.y + 0.6, 0); fov = v.x < 0 ? 28 : 38;
    } else if (mode === 'below') {
      const k = H.landAt(H.k * 0.85);
      P.set(k.x + 6, k.y + 1.0, 14); Lk.set(v.x, v.y + 0.5, 0); fov = 36;
    } else if (mode === 'gate' || v.phase === 'gate') {
      P.set(v.x + 4.5 * ah, v.y + 0.9, 9 * zoom); Lk.set(v.x + 2.2 * ah, v.y - 0.6, 0); fov = 40;
    } else if (v.phase === 'inrun') {
      const d = 15 * zoom;
      P.set(v.x + 7 * ah, v.y + 0.6, d); Lk.set(v.x + 5 * ah, v.y - 2.8, 0); fov = 44;
    } else if (v.phase === 'air') {
      const h = Math.max(0, v.hag);
      const near = h < 2.5 ? (2.5 - h) / 2.5 : 0;
      const d = (11 + Math.min(h, 6) * 1.3 - near * 2) * zoom;
      P.set(v.x + 2 * ah, v.y + 0.6 + h * 0.1, d); Lk.set(v.x + 2.6 * ah, v.y - 0.7 - h * 0.2, 0); fov = 40 - near * 4;
    } else {
      const d = 14 * zoom;
      P.set(v.x - 1, v.y + 2.6, d); Lk.set(v.x + 3 * ah, v.y, 0); fov = 40;
    }
    return { P, Lk, fov };
  }

  _updateCamera(v, mode, dt) {
    const { P, Lk, fov } = this._camTarget(v, mode);
    const c = this.cam;
    const fixed = mode === 'front' || mode === 'below';
    if (!c.init || v.snap) { c.pos.copy(P); c.look.copy(Lk); c.fov = fov; c.init = true; }
    else {
      const k = fixed ? 30 : v.phase === 'air' ? 7 : 5;
      c.pos.lerp(P, damp(k, dt)); c.look.lerp(Lk, damp(k * 1.6, dt)); c.fov += (fov - c.fov) * damp(3, dt);
    }
    this.camera.position.copy(c.pos);
    if (c.shake > 0.001) {
      const s = c.shake;
      this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.y += (Math.random() - 0.5) * s;
      c.shake *= Math.exp(-6 * dt);
    }
    this.camera.lookAt(c.look);
    if (Math.abs(this.camera.fov - c.fov) > 0.01) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
  }

  /**
   * Izriši sličico.
   * @param {number} dt realni čas (s)
   * @param {{me:Object, ghosts:Object[], cam?:string}} view
   */
  frame(dt, view) {
    if (!this.world) return;
    this.time += dt;
    WAVE.uTime.value = this.time;
    if (this.sky) { this.sky.position.copy(this.camera.position); this.sky.material.uniforms.uTime.value = this.time; }
    const v = view.me;
    this.me.pose(v, dt);
    view.ghosts?.forEach((g, i) => {
      const gj = this.ghosts[i];
      if (!gj) return;
      gj.root.visible = !!g;
      if (g) gj.pose({ ...g, z: -0.9 }, dt);
    });
    this._updateCamera(v, view.cam || 'live', dt);
    if (this.blob) {
      const g = this.hill.groundAt(v.x + 0.3);
      const h = Math.max(0, v.y - g.y);
      this.blob.position.set(v.x + 0.3, g.y + 0.03, 0);
      this.blob.rotation.set(0, 0, -g.theta);
      const k = 1 + h * 0.08;
      this.blobMesh.scale.set(2.8 * k, 1.1 * k, 1);
      this.blobMesh.material.opacity = 0.55 * Math.max(0, 1 - h / 18);
      this.blob.visible = v.phase !== 'gate' && v.phase !== 'inrun';
    }
    // senca sledi skakalcu
    const tgt = new THREE.Vector3(v.x + 6, v.y - 2, 0);
    this.sun.target.position.copy(tgt);
    this.sun.position.copy(tgt).addScaledVector(this.sunDir, 80);
    if (this.world.snowPts) this.world.snowPts.position.set(this.camera.position.x, this.camera.position.y - 20, this.camera.position.z - 30);
    this.gl.info.reset();
    if (this.post.composer) this.post.render(dt, 0.5, 0);
    else this.gl.render(this.scene, this.camera);
  }

  /** Položaj točke sveta na zaslonu (px) — za HUD oznake. */
  project(x, y, z = 0) {
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-p.y * 0.5 + 0.5) * this.canvas.clientHeight, behind: p.z > 1 };
  }

  dispose(all = true) {
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.group.traverse(o => { o.geometry?.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
      this.world = null;
    }
    if (this.sky) { this.scene.remove(this.sky); this.sky.geometry.dispose(); this.sky.material.dispose(); this.sky = null; }
    if (this.me) { this.scene.remove(this.me.root); this.me.dispose(); this.me = null; }
    if (this.blob) { this.scene.remove(this.blob); this.blobMesh.geometry.dispose(); this.blobMesh.material.dispose(); this.blob = null; }
    this.setGhosts(0);
    if (all) { this.post.dispose(); this.gl.dispose(); }
  }

  stats() { const i = this.gl.info; return { calls: i.render.calls, tris: i.render.triangles, q: this.qualityKey }; }
}
