/* =====================================================================
   HRČKOVA KROGLA — render.js: izris s Three.js 0.160.0 (CDN, importmap).
   PBR materiali, IBL iz proceduralnega neba, mehke sence, ki sledijo
   krogli, post-processing, kamera, kakovosti in samodejna izbira.
   Moduli: render/looks.js (lokacije), textures.js, sky.js, materials.js,
   terrain.js, objects.js, ball.js, fx.js, decor.js, post.js.
   ===================================================================== */
import * as THREE from 'three';
import { P, groundBelow, fallTileState } from './physics.js';
import { sampleAt } from './ghost.js';
import { lookFor } from './render/looks.js';
import { makeSky, envFor, hasEnv, clearEnvCache, sunDirection } from './render/sky.js';
import { surface, hasSurface, contactShadow, softDot } from './render/textures.js';
import { FADE, WAVE, disposeMaterial } from './render/materials.js';
import { buildTerrain } from './render/terrain.js';
import { buildObjects } from './render/objects.js';
import { makeBall, animateRider } from './render/ball.js';
import { FX, Trail } from './render/fx.js';
import { buildDecor } from './render/decor.js';
import { Post } from './render/post.js';

/**
 * Privzeti videz krogle (trgovina bo kasneje prodajala druge). Fizika je za vse enaka.
 * glass (barva stekla), opacity (koliko je steklo vidno), rim (šiv, loputa, vzorec), rider ('hamster' ali emoji),
 * fur (barva krzna), trail (barva sledi ali null) · nova: tint (barva globine stekla), roughness (0–0,3), pattern ('none'|'stripes'|'dots'|'stars'|'hex').
 */
export const DEFAULT_SKIN = { id: 'osnovna', glass: '#bfeaff', opacity: 0.28, rim: '#ffffff', rider: 'hamster', fur: '#e8a25a', trail: null, tint: null, roughness: 0.03, pattern: 'none' };

export const QUALITY = {
  ultra: { name: 'Ultra', ratio: 2, shadows: true, shadowMap: 4096, shadowR: 18, post: true, ao: true, bloom: true, aa: 'smaa', dof: true, ca: true, glass: 'real', furShells: 16, particles: 1, detail: 3, decor: 1, caustic: true },
  high: { name: 'Visoka', ratio: 1.5, shadows: true, shadowMap: 2048, shadowR: 15, post: true, ao: false, bloom: true, aa: 'smaa', dof: true, ca: true, glass: 'real', furShells: 12, particles: 1, detail: 2, decor: 0.9, caustic: true },
  medium: { name: 'Srednja', ratio: 1.25, shadows: true, shadowMap: 1024, shadowR: 12, post: true, ao: false, bloom: true, aa: 'fxaa', dof: false, ca: false, glass: 'fake', furShells: 6, particles: 0.6, detail: 1, decor: 0.6, caustic: false },
  low: { name: 'Nizka', ratio: 1, shadows: false, shadowMap: 0, post: false, ao: false, bloom: false, aa: 'fxaa', dof: false, ca: false, glass: 'fake', furShells: 3, particles: 0.35, detail: 0, decor: 0.35, caustic: false },
};
export const QUALITY_ORDER = ['ultra', 'high', 'medium', 'low'];

const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** Privzeta kakovost glede na napravo (jedra, zaslon na dotik, grafična kartica). */
export function detectQuality() {
  let touch = false, cores = 4, gpu = '';
  try { touch = matchMedia('(pointer: coarse)').matches; cores = navigator.hardwareConcurrency || 4; } catch { /* */ }
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    if (!g) return 'low';
    if (/Firefox/.test(navigator.userAgent)) gpu = g.getParameter(g.RENDERER) || '';
    else { const e = g.getExtension('WEBGL_debug_renderer_info'); gpu = e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; }
    g.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* */ }
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu)) return 'low';
  if (touch) return cores >= 8 && /Apple GPU|Adreno \(TM\) (7[3-9]\d|[89]\d\d)|Mali-G7[1-9]|Mali-G[1-9]\d\d|Xclipse/i.test(gpu) ? 'medium' : 'low';
  if (/RTX|RX ?[5-9]\d{3}|RX ?[67]\d{2}\b|Radeon Pro|Apple M\d (Pro|Max|Ultra)|GTX 1(0[6-9]|6)|Arc A7/i.test(gpu) && cores >= 8) return 'ultra';
  if (/Intel|UHD|Iris|Mali|PowerVR|Adreno/i.test(gpu)) return 'medium';
  return 'high';
}

function textSprite(text, color = '#fff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 29px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = Math.min(252, g.measureText(text).width + 24);
  g.fillStyle = 'rgba(8,10,24,.6)'; g.beginPath(); g.roundRect((256 - tw) / 2, 8, tw, 48, 12); g.fill();
  g.fillStyle = color; g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  sp.scale.set(2, 0.5, 1);
  return sp;
}

/* ===================================================================== */

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{quality?:string, post?:boolean, dof?:boolean, shake?:boolean, onLost?:Function}} opts
   */
  constructor(canvas, { quality = 'high', post = true, dof = true, shake = true, onLost = null } = {}) {
    this.canvas = canvas;
    this.opts = { post, dof, shake };
    this.onLost = onLost;
    // brez MSAA platna, kadar AA naredi post-processing (SMAA/FXAA); nizka kakovost uporabi strojni MSAA
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: quality === 'low', powerPreference: 'high-performance', stencil: false });
    this.msaa = quality === 'low';
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.info.autoReset = false;   // več prehodov na sličico (post) — ponastavimo ročno
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 250);
    this.cam = { yaw: 0, baseYaw: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), vp: new THREE.Vector3(), vl: new THREE.Vector3(), init: false, shake: 0, punch: 0, fov: 50, intro: null };
    this.reduced = reducedMotion();
    this.level = new THREE.Group();
    this.scene.add(this.level);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#404060', 0.7);
    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.post = new Post(this.gl, this.scene, this.camera);
    this.ghosts = [];
    this.ghostList = [];
    this.vt = 0; this.slow = 0;
    this.lost = false;
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3();
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; }, false);
    canvas.addEventListener('webglcontextrestored', () => this._restore(), false);
    this.setQuality(quality, true);
    this.resize();
  }

  /* -------------------------------------------------------- kakovost */

  setQuality(q, initial = false) {
    if (!QUALITY[q]) q = 'high';
    // brez MSAA platna nizka kakovost potrebuje FXAA prek post-processinga
    this.qualityKey = q;
    this.q = { ...QUALITY[q] };
    if (q === 'low' && !this.msaa) { this.q.post = true; this.q.bloom = false; this.q.aa = 'fxaa'; }
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.ratio));
    this.gl.shadowMap.enabled = this.q.shadows;
    this.sun.castShadow = this.q.shadows;
    if (this.q.shadows) {
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(this.q.shadowMap, this.q.shadowMap);
      const sc = this.sun.shadow.camera, r = this.q.shadowR;
      sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = 80; sc.updateProjectionMatrix();
    }
    if (!initial && this.L) this.load(this.L, this.w, this.skin, { keepCamera: true, ghosts: this.ghostList });
    else this._configurePost();
    this.resize();
  }

  setOptions(o) {
    Object.assign(this.opts, o);
    this._configurePost();
  }

  _postOn() { return this.q.post && (this.opts.post || (this.qualityKey === 'low' && !this.msaa)); }

  _configurePost() {
    if (!this.look) return;
    if (!this._postOn()) { this.post.dispose(); return; }
    const full = this.opts.post;
    const r = this.canvas.getBoundingClientRect();
    this.post.configure({
      ao: full && this.q.ao, bloom: full && this.q.bloom, aa: this.q.aa,
      dof: full && this.opts.dof && this.q.dof && !this.menu, ca: full && this.q.ca && !this.reduced,
    }, this.look, Math.max(1, r.width | 0), Math.max(1, r.height | 0), this.gl.getPixelRatio());
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width | 0), h = Math.max(1, r.height | 0);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.cam.baseFov = w / h < 0.8 ? 62 : 50;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, this.gl.getPixelRatio());
    this.decor?.setScale(h * this.gl.getPixelRatio() / 2);
  }

  /** Ali so teksture in okolje za to progo že pripravljeni (nalaganje bo hitro). */
  isWarm(L) {
    const lk = lookFor(L);
    return hasEnv(lk.id) && [lk.floor, lk.side, lk.wall].every(hasSurface);
  }
  /** Predpripravi teksture in okolje lokacije (npr. v času mirovanja). */
  prewarm(L) {
    const lk = lookFor(L);
    [lk.floor, lk.side, lk.wall, 'metal', 'ice', 'glue', 'conveyor'].forEach(k => surface(k));
    envFor(this.gl, lk);
  }

  _restore() {
    // kontekst obnovljen: okolje in render targete na novo, kakovost nizka (ne črn zaslon)
    clearEnvCache();
    this.lost = false;
    this.setQuality('low');
    this.onLost?.('low');
  }

  /* -------------------------------------------------------- gradnja proge */

  load(L, world, skin = DEFAULT_SKIN, { keepCamera = false, ghosts = [], menu = false } = {}) {
    this.clearLevel();
    this.L = L; this.w = world; this.skin = skin; this.menu = menu;
    const lk = this.look = lookFor(L);
    const th = L.theme || {};
    // svetloba in okolje
    this.gl.toneMappingExposure = lk.exposure;
    this.scene.environment = envFor(this.gl, lk);
    this.scene.background = null;
    this.gl.setClearColor(lk.fog[0]);
    this.scene.fog = new THREE.FogExp2(lk.fog[0], lk.fog[1]);
    this.sky = makeSky(lk);
    this.scene.add(this.sky);
    this.sunDir = sunDirection(lk);
    this.sun.color.set(lk.light.sun[0]); this.sun.intensity = lk.light.sun[1];
    this.hemi.color.set(lk.light.hemi[0]); this.hemi.groundColor.set(lk.light.hemi[1]); this.hemi.intensity = lk.light.hemi[2];
    if (!keepCamera) {
      this.cam.baseYaw = L.camYaw || 0; this.cam.yaw = this.cam.baseYaw; this.cam.init = false;
      this.cam.intro = menu ? null : { t: 0, dur: this.reduced ? 1.0 : 2.4 };
    }
    this.fx = new FX(this.level, this.q, this.reduced);
    const ctx = { L, w: world, th, look: lk, q: this.q, parent: this.level, fx: this.fx, reduced: this.reduced };
    this.terrain = buildTerrain(ctx);
    this.objects = buildObjects(ctx);
    this.decor = buildDecor(ctx);
    // krogla
    this.ball = makeBall(skin, world.R, this.q);
    this.level.add(this.ball);
    const sh = this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: contactShadow(), transparent: true, depthWrite: false, opacity: 0.8 }));
    sh.renderOrder = 1; this.level.add(sh);
    this.caustic = null;
    if (this.q.caustic) {
      this.caustic = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(skin.glass || '#bfeaff').lerp(new THREE.Color('#ffffff'), 0.5).multiplyScalar(0.7), alphaMap: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.caustic.renderOrder = 2; this.level.add(this.caustic);
    }
    this.trail = skin.trail ? new Trail(this.level, skin.trail, world.R) : null;
    // jakost odsevov okolja po lokaciji
    const envK = lk.light.env ?? 1;
    this.level.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.envMapIntensity !== undefined && !m.userData.envSet) { m.envMapIntensity *= envK; m.userData.envSet = true; } }); });
    this.setGhosts(ghosts);
    this._configurePost();
    this.resize();
    this.vt = 0; this.slow = 0; this.celebrated = false;
  }

  clearLevel() {
    const seen = new Set();
    this.level.traverse(o => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!seen.has(m)) { seen.add(m); disposeMaterial(m); } });
      if (o.isInstancedMesh) o.dispose();
    });
    for (const t of this.terrain?.convTex || []) t.dispose();
    for (const t of this.objects?.ownTex || []) t.dispose();
    this.level.clear();
    if (this.sky) { this.scene.remove(this.sky); this.sky.geometry.dispose(); this.sky.material.dispose(); this.sky = null; }
    this.ghosts = [];
    this.terrain = this.objects = this.decor = this.fx = this.trail = null;
  }

  /** Ghosti: [{ frames, color, label }] — prosojne, enobarvne, svetlikajoče krogle. */
  setGhosts(list) {
    for (const g of this.ghosts) {
      this.level.remove(g.mesh);
      g.mesh.traverse(o => { o.geometry?.dispose(); if (o.material) disposeMaterial(o.material); });
      if (g.label) { this.level.remove(g.label); g.label.material.map.dispose(); g.label.material.dispose(); }
    }
    this.ghostList = list;
    this.ghosts = list.map(gh => {
      const mesh = makeBall(this.skin || DEFAULT_SKIN, this.w?.R || P.R, this.q, { ghost: true, ghostColor: gh.color || '#ffffff' });
      this.level.add(mesh);
      let label = null;
      if (gh.label) { label = textSprite(gh.label, gh.color || '#fff'); this.level.add(label); }
      return { ...gh, mesh, label, prev: null };
    });
  }

  /* -------------------------------------------------------- učinki (klice jih game.js) */

  burst(x, y, z, color = '#ffd23f', n = 16, speed = 3) { this.fx?.spark(x, y, z, color, n, speed, 0.9); }
  shake(a = 0.25) { if (!this.reduced && this.opts.shake) this.cam.shake = Math.max(this.cam.shake, a); }
  /** Trk/pristanek: delci glede na podlago in kratek »punch« kamere. */
  impact(b, v = 3, kind = 'bump') {
    if (!this.fx) return;
    const x = b.x, y = b.y - b.r + 0.04, z = b.z;
    const n = Math.min(14, 3 + v * 1.2);
    const floor = this.look?.floor;
    if (b.surf === 'glue') this.fx.puff(x, y, z, '#c8ff4a', n, 1.4, 0.6, 6);
    else if (b.surf === 'ice' || b.surf === 'slick' || floor === 'ice') this.fx.spark(x, y + 0.05, z, '#cfefff', n, 2, 0.5, 1.6);
    else if (['metal', 'hazard', 'rust', 'neon'].includes(floor) || kind === 'bump') this.fx.spark(x, b.y, z, '#ffc070', n, 2.6, 0.4, 2.6);
    else this.fx.puff(x, y, z, new THREE.Color(this.L.theme?.floor || '#c8b8a8').lerp(new THREE.Color('#ffffff'), 0.4).getStyle(), n, 1.3, 0.7, 0.6);
    if (!this.reduced && this.opts.shake) this.cam.punch = Math.min(1, Math.max(this.cam.punch, v * 0.06));
  }
  /** Cilj: konfeti, iskre in kratek vizualni »slow-mo« (čas proge se meri kot prej). */
  celebrate(x, y, z) {
    if (!this.fx || this.celebrated) return;
    this.celebrated = true;
    this.fx.confetti(x, y + 0.3, z, 110);
    this.fx.spark(x, y + 0.3, z, this.L.theme?.accent || '#ffd23f', 40, 4, 1, 3);
    if (!this.reduced) this.slow = 0.7;
  }
  skipIntro() { if (this.cam.intro) this.cam.intro.t = this.cam.intro.dur; }
  springFired(sp) { const k = (this.L.springs || []).indexOf(sp); if (k >= 0) this.objects.springs[k].userData.t = this.w.t; }

  /* -------------------------------------------------------- izris */

  /**
   * @param {Object} w svet
   * @param {{x,y,z}} bp interpoliran položaj krogle
   * @param {number} dt realni čas od zadnjega izrisa
   * @param {{rotate?:boolean, ghostT?:number, menu?:boolean}} opt
   */
  render(w, bp, dt, opt = {}) {
    if (this.lost) return;
    this.gl.info.reset();
    if (!this.L) { this.gl.render(this.scene, this.camera); return; }
    const t = w.t;
    // vizualni čas (slow-mo ob cilju vpliva samo na delce in okras)
    const ts = this.slow > 0 ? 0.3 : 1;
    this.slow = Math.max(0, this.slow - dt);
    const vdt = dt * ts;
    this.vt += vdt;
    WAVE.uTime.value = this.vt;
    const ctx = { near: (x, z, d) => (x - bp.x) ** 2 + (z - bp.z) ** 2 < d * d };
    this.objects.update(w, t, dt, ctx);
    for (const tx of this.terrain.convTex) tx.offset.y = (t * P.CONVEYOR) % 1;
    for (const fm of this.terrain.fallMeshes) {
      const st = fallTileState(w, fm.userData.i);
      const b = fm.userData.base;
      const sh = st.shake * 0.06 * (this.reduced ? 0.5 : 1);
      fm.position.set(b.x + Math.sin(t * 60) * sh, b.y - st.drop, b.z + Math.cos(t * 53) * sh);
      fm.material.opacity = st.drop > 0 ? Math.max(0, 0.9 - st.drop * 0.1) : 0.9;
      fm.material.emissive.set(st.shake > 0 || st.drop > 0 ? '#ff3b5c' : '#3a90c8');
      fm.material.emissiveIntensity = st.shake > 0 ? 0.35 + st.shake * 0.8 : 0.35;
      fm.userData.crack.material.opacity = st.shake > 0 ? 0.3 + st.shake * 0.7 : st.drop > 0 ? 1 : 0;
      fm.visible = st.drop < 8;
    }
    // krogla
    const b = w.ball;
    this._ball(this.ball, bp, b, dt, w.dead);
    const r = this.ball.userData.rider;
    if (r) animateRider(r, { sp: Math.hypot(b.vx, b.vz), yaw: b.yaw || 0, dt, t: this.vt, falling: !b.grounded && b.vy < -4, dead: w.dead, finished: w.finished, reduced: this.reduced });
    // kontaktna senca (vedno vidna — pomaga oceniti višino) in kavstika
    const gyb = groundBelow(w, bp.x, bp.z, bp.y - w.R + 0.05);
    if (Number.isFinite(gyb) && !(w.dead && bp.y < gyb)) {
      const hgt = Math.max(0, bp.y - w.R - gyb);
      this.blob.position.set(bp.x, gyb + 0.012, bp.z);
      const s = w.R * 2.3 * (1 + hgt * 0.35);
      this.blob.scale.set(s, 1, s);
      this.blob.material.opacity = Math.max(0.12, (this.q.shadows ? 0.62 : 0.85) - hgt * 0.22);
      this.blob.visible = true;
      if (this.caustic) {
        const d = this.sunDir, k = (bp.y - gyb) / Math.max(0.3, d.y);
        this.caustic.position.set(bp.x - d.x * k * 0.55, gyb + 0.014, bp.z - d.z * k * 0.55);
        const cs = w.R * (0.9 + hgt * 0.2);
        this.caustic.scale.set(cs, 1, cs);
        this.caustic.material.opacity = Math.max(0, 0.4 - hgt * 0.15);
        this.caustic.visible = true;
      }
    } else { this.blob.visible = false; if (this.caustic) this.caustic.visible = false; }
    // ghosti
    for (const g of this.ghosts) {
      const s = sampleAt(g.frames, opt.ghostT ?? t);
      if (!s) continue;
      const prev = g.prev || s;
      this._ball(g.mesh, s, { vx: (s.x - prev.x) / Math.max(dt, 1e-3), vz: (s.z - prev.z) / Math.max(dt, 1e-3) }, dt, false);
      g.prev = s;
      g.mesh.visible = !s.done || (opt.ghostT ?? t) < g.frames.length / 20 + 2;
      if (g.label) { g.label.position.set(s.x, s.y + 0.75, s.z); g.label.visible = g.mesh.visible; }
    }
    // kamera
    this._camera(w, bp, dt, opt);
    if (this.trail) this.trail.update(bp, this.camera.position);
    this.fx.update(vdt);
    this.decor.update(this.vt, this.camera);
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.uTime.value = this.vt;
    if (this.q.shadows) this._shadowFollow(bp);
    // dither prosojnost ovir med kamero in kroglo
    this._v.set(bp.x, bp.y, bp.z).applyMatrix4(this.camera.matrixWorldInverse);
    const ballDist = -this._v.z;
    const pr = this.gl.getPixelRatio();
    const rr = this.canvas.getBoundingClientRect();
    this._v2.set(bp.x, bp.y, bp.z).project(this.camera);
    FADE.uBallScr.value.set((this._v2.x + 1) / 2 * rr.width * pr, (this._v2.y + 1) / 2 * rr.height * pr);
    FADE.uBallDist.value = ballDist;
    const projR = w.R / Math.max(0.5, ballDist) / Math.tan(this.camera.fov * Math.PI / 360) * rr.height * pr / 2;
    FADE.uFadeR.value = projR * 2.6;
    if (this.post.composer) this.post.render(dt, (this._v2.y + 1) / 2, 0);
    else this.gl.render(this.scene, this.camera);
  }

  _shadowFollow(bp) {
    // senčna kamera sledi krogli in se pripne na teksel mrežo (brez migotanja)
    const d = this.sunDir;
    const f = this._v.copy(d).negate();
    const right = this._r || (this._r = new THREE.Vector3()), up = this._u || (this._u = new THREE.Vector3());
    right.crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    up.crossVectors(right, f).normalize();
    const cx = bp.x, cy = bp.y - 1, cz = bp.z + (this.camera.aspect < 0.8 ? -2 : -3);
    const texel = (2 * this.q.shadowR) / this.q.shadowMap;
    const tx = Math.round((cx * right.x + cy * right.y + cz * right.z) / texel) * texel;
    const ty = Math.round((cx * up.x + cy * up.y + cz * up.z) / texel) * texel;
    const tz = cx * f.x + cy * f.y + cz * f.z;
    const tgt = this.sun.target.position.set(right.x * tx + up.x * ty + f.x * tz, right.y * tx + up.y * ty + f.y * tz, right.z * tx + up.z * ty + f.z * tz);
    this.sun.position.copy(tgt).addScaledVector(d, 40);
    this.sun.target.updateMatrixWorld();
  }

  _ball(root, p, b, dt, dead) {
    root.position.set(p.x, p.y, p.z);
    const { roll } = root.userData;
    const vx = b.vx || 0, vz = b.vz || 0;
    const sp = Math.hypot(vx, vz);
    if (sp > 0.01 && dt > 0) {
      const axis = this._v.set(vz, 0, -vx).normalize();
      const q = this._q || (this._q = new THREE.Quaternion());
      q.setFromAxisAngle(axis, sp * Math.min(dt, 0.05) / (this.w?.R || P.R));
      roll.quaternion.premultiply(q);
    }
    root.visible = !(dead && p.y < (this.w?.killY ?? -5) + 1);
  }

  _camera(w, bp, dt, opt) {
    const c = this.cam;
    const b = w.ball;
    const sp = Math.hypot(b.vx, b.vz);
    if (opt.menu) {
      // meni: počasen filmski prelet za kroglo
      c.yaw = c.baseYaw + Math.sin(this.vt * 0.08) * 0.7;
    } else if (opt.rotate && !w.dead && b.grounded) {
      if (sp > 2.5) {
        const heading = Math.atan2(-b.vx, -b.vz);
        let d = heading - c.baseYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        const target = c.baseYaw + Math.max(-0.6, Math.min(0.6, d));
        let e = target - c.yaw; e = Math.atan2(Math.sin(e), Math.cos(e));
        c.yaw += e * Math.min(1, dt * 0.8);
      }
    } else if (!opt.rotate) {
      let e = c.baseYaw - c.yaw; e = Math.atan2(Math.sin(e), Math.cos(e)); c.yaw += e * Math.min(1, dt * 2);
    }
    const narrow = this.camera.aspect < 0.8;
    const zk = c.zoom || 1;   // c.zoom: samo za razvojni pregled od blizu
    const dist = (narrow ? 8.5 : 8) * (opt.menu ? 1.25 : 1) * zk, hgt = (narrow ? 8 : 6.8) * (opt.menu ? 1.05 : 1) * zk;
    const fy = w.dead ? c.look.y : bp.y;
    const look = this._lk || (this._lk = new THREE.Vector3());
    const pos = this._ps || (this._ps = new THREE.Vector3());
    look.set(bp.x - Math.sin(c.yaw) * 1.2, fy, bp.z - Math.cos(c.yaw) * 1.2);
    pos.set(look.x + Math.sin(c.yaw) * dist, fy + hgt, look.z + Math.cos(c.yaw) * dist);
    if (!c.init) { c.pos.copy(pos); c.look.copy(look); c.vp.set(0, 0, 0); c.vl.set(0, 0, 0); c.init = true; c.fov = c.baseFov; }
    // nežno vzmetno sledenje (kritično dušeno)
    const om = opt.menu ? 2.2 : 5.2, h = Math.min(dt, 0.05);
    for (const [x, v, tg] of [[c.pos, c.vp, pos], [c.look, c.vl, look]]) {
      v.x += ((tg.x - x.x) * om * om - 2 * om * v.x) * h; v.y += ((tg.y - x.y) * om * om - 2 * om * v.y) * h; v.z += ((tg.z - x.z) * om * om - 2 * om * v.z) * h;
      x.addScaledVector(v, h);
    }
    // rahlo večji FOV pri visoki hitrosti, kratek »punch« ob trku
    const fovT = c.baseFov + (opt.menu ? 0 : Math.min(7, Math.max(0, sp - 5) * 0.9)) - c.punch * 3;
    c.fov += (fovT - c.fov) * Math.min(1, dt * 4);
    c.punch = Math.max(0, c.punch - dt * 3);
    let cp = c.pos, cl = c.look;
    // uvodni prelet proge med odštevanjem (preskočljiv)
    if (c.intro && c.intro.t < c.intro.dur) {
      c.intro.t += dt;
      const u = Math.min(1, c.intro.t / c.intro.dur);
      const e = u * u * (3 - 2 * u);
      const [gx, gz] = this.L.goal, gyy = groundBelow(w, gx, gz);
      const g0 = this._g0 || (this._g0 = { p: new THREE.Vector3(), l: new THREE.Vector3() });
      const goalY = Number.isFinite(gyy) ? gyy : bp.y;
      g0.l.set(gx, goalY, gz);
      g0.p.set(gx + Math.sin(c.yaw + 0.6) * 7, goalY + 9, gz + Math.cos(c.yaw + 0.6) * 7);
      const midL = this._v.set((gx + bp.x) / 2, Math.max(goalY, bp.y) + 1, (gz + bp.z) / 2);
      if (this.reduced) {
        cp = this._ip || (this._ip = new THREE.Vector3()); cl = this._il || (this._il = new THREE.Vector3());
        cp.copy(midL).add(this._v2.set(0, 16, 10)).lerp(c.pos, e); cl.copy(midL).lerp(c.look, e);
      } else {
        cp = this._ip || (this._ip = new THREE.Vector3()); cl = this._il || (this._il = new THREE.Vector3());
        const midP = this._v2.copy(midL).add(new THREE.Vector3(Math.sin(c.yaw) * 6, 13, Math.cos(c.yaw) * 6));
        if (e < 0.5) { const k = e * 2; cp.copy(g0.p).lerp(midP, k); cl.copy(g0.l).lerp(midL, k); }
        else { const k = (e - 0.5) * 2; cp.copy(midP).lerp(c.pos, k); cl.copy(midL).lerp(c.look, k); }
      }
    }
    if (this.debugCam) { cp = this.debugCam.pos; cl = this.debugCam.look; }   // samo razvojni pregled
    this.camera.position.copy(cp);
    if (c.punch > 0) this.camera.position.lerp(cl, c.punch * 0.04);
    if (c.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * c.shake;
      this.camera.position.y += (Math.random() - 0.5) * c.shake;
      c.shake = Math.max(0, c.shake - dt * 1.5);
    }
    // kamera se ne sme zatakniti pod tlemi
    const gcam = groundBelow(w, this.camera.position.x, this.camera.position.z);
    if (Number.isFinite(gcam) && this.camera.position.y < gcam + 1.2) this.camera.position.y = gcam + 1.2;
    if (Math.abs(this.camera.fov - c.fov) > 0.01) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
    this.camera.lookAt(cl);
    this.camera.updateMatrixWorld();
  }

  /** Projekcija svetovne točke na zaslon (px, glede na canvas). */
  project(x, y, z) {
    const v = this._pv || (this._pv = new THREE.Vector3());
    v.set(x, y, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height };
  }

  /** Meritve za razvoj (draw calli, trikotniki, pomnilnik). */
  stats() {
    const i = this.gl.info;
    return { calls: i.render.calls, tris: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures, q: this.qualityKey };
  }
}

