/* =====================================================================
   HRČKOVA KROGLA — render.js: izris s Three.js (pripeta verzija prek CDN).
   Vse iz geometrije in barv (teksture so proceduralne na canvasu).
   ===================================================================== */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { P, TILE, tileTop, tileIndex, pathAt, hammerPhase, magnetState, doorOpenness, fallTileState, groundBelow } from './physics.js';
import { sampleAt } from './ghost.js';

/** Privzeti videz krogle (trgovina bo kasneje prodajala druge). Fizika je za vse enaka. */
export const DEFAULT_SKIN = { id: 'osnovna', glass: '#bfeaff', opacity: 0.28, rim: '#ffffff', rider: 'hamster', fur: '#e8a25a', trail: null };

export const QUALITY = {
  high: { name: 'Visoka', ratio: 2, shadows: true, particles: 1 },
  medium: { name: 'Srednja', ratio: 1.25, shadows: false, particles: 0.7 },
  low: { name: 'Nizka', ratio: 0.75, shadows: false, particles: 0.4 },
};
export const QUALITY_ORDER = ['high', 'medium', 'low'];

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const col = c => new THREE.Color(c);

/* ---------------------------------------------------- proceduralne teksture */

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

const gridTex = () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
  g.fillStyle = 'rgba(255,255,255,0.0)';
  g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(10, 10, w - 20, h - 20);
}, true);

const arrowTex = () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#3a3a48'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffd23f'; g.lineWidth = 7; g.lineCap = 'round';
  for (const y of [14, 46]) { g.beginPath(); g.moveTo(14, y + 12); g.lineTo(32, y - 4); g.lineTo(50, y + 12); g.stroke(); }
}, true);

const blobTex = () => canvasTex(64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

const skyTex = (a, b) => canvasTex(4, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, a); gr.addColorStop(0.75, b); gr.addColorStop(1, b);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

function textSprite(text, { size = 48, color = '#fff', bg = 'rgba(0,0,0,.55)' } = {}) {
  const tex = canvasTex(256, 64, (g, w, h) => {
    g.font = `bold ${size * 0.6}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = Math.min(w - 4, g.measureText(text).width + 24);
    g.fillStyle = bg; g.beginPath(); g.roundRect((w - tw) / 2, 8, tw, h - 16, 12); g.fill();
    g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 1);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(2, 0.5, 1);
  return sp;
}

function emojiSprite(emoji, px = 96) {
  const tex = canvasTex(px, px, (g, w, h) => {
    g.font = `${px * 0.78}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, w / 2, h / 2 + px * 0.05);
  });
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
}

/* ---------------------------------------------------- hrček in krogla */

function makeHamster(skin) {
  const g = new THREE.Group();
  if (skin.rider && skin.rider !== 'hamster') {
    const sp = emojiSprite(skin.rider);
    sp.scale.set(0.46, 0.46, 1);
    g.add(sp);
    g.userData.legs = [];
    return g;
  }
  const fur = new THREE.MeshLambertMaterial({ color: skin.fur || '#e8a25a' });
  const white = new THREE.MeshLambertMaterial({ color: '#fff4e6' });
  const dark = new THREE.MeshBasicMaterial({ color: '#1a1020' });
  const pink = new THREE.MeshLambertMaterial({ color: '#ff9fb5' });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), fur);
  body.scale.set(1, 0.85, 1.2); body.position.y = -0.04; g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), white);
  belly.scale.set(0.9, 0.75, 1.05); belly.position.set(0, -0.07, 0.05); g.add(belly);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), fur);
  head.position.set(0, 0.06, 0.15); g.add(head);
  const cheekL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), white); cheekL.position.set(0.06, 0.03, 0.21); g.add(cheekL);
  const cheekR = cheekL.clone(); cheekR.position.x = -0.06; g.add(cheekR);
  for (const s of [1, -1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), pink); ear.position.set(0.06 * s, 0.15, 0.12); ear.scale.set(1, 1, 0.5); g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), dark); eye.position.set(0.042 * s, 0.09, 0.235); g.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), pink); nose.position.set(0, 0.055, 0.255); g.add(nose);
  const legs = [];
  for (const [x, z] of [[0.08, 0.1], [-0.08, 0.1], [0.08, -0.08], [-0.08, -0.08]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), pink); l.position.set(x, -0.17, z); l.userData.base = l.position.clone(); g.add(l); legs.push(l);
  }
  g.userData.legs = legs;
  return g;
}

function makeBall(skin, R, ghost = false, ghostColor = '#ffffff') {
  const root = new THREE.Group();
  const roll = new THREE.Group();
  root.add(roll);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 28, 20), new THREE.MeshPhongMaterial({
    color: ghost ? ghostColor : skin.glass, transparent: true, opacity: ghost ? 0.22 : skin.opacity, shininess: 120, specular: '#ffffff', depthWrite: false,
    emissive: ghost ? ghostColor : '#000000', emissiveIntensity: ghost ? 0.25 : 0,
  }));
  glass.renderOrder = 3;
  roll.add(glass);
  // obroča, da se vidi kotaljenje
  const ringMat = new THREE.MeshBasicMaterial({ color: ghost ? ghostColor : skin.rim, transparent: true, opacity: ghost ? 0.3 : 0.55 });
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(R * 0.995, 0.012, 6, 40), ringMat);
  const r2 = r1.clone(); r2.rotation.y = Math.PI / 2;
  const r3 = r1.clone(); r3.rotation.x = Math.PI / 2;
  roll.add(r1, r2, r3);
  // odsev
  const hl = new THREE.Mesh(new THREE.SphereGeometry(R * 0.18, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: ghost ? 0.2 : 0.7 }));
  hl.position.set(-R * 0.45, R * 0.55, R * 0.45);
  root.add(hl);
  let rider = null;
  if (!ghost) { rider = makeHamster(skin); root.add(rider); }
  root.userData = { roll, rider, q: new THREE.Quaternion(), step: 0 };
  return root;
}

/* ===================================================================== */

export class Renderer {
  constructor(canvas, { quality = 'high' } = {}) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.cam = { yaw: 0, baseYaw: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, follow: true, shake: 0 };
    this.tex = { grid: gridTex(), arrow: arrowTex(), blob: blobTex() };
    this.reduced = reduced();
    this.level = new THREE.Group();
    this.scene.add(this.level);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#404060', 1.6);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.6);
    this.sun.position.set(-6, 14, 8);
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 50;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.particles = [];
    this.ghosts = [];
    this.setQuality(quality);
    this.resize();
  }

  setQuality(q) {
    this.qualityKey = q;
    this.q = QUALITY[q];
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.ratio));
    this.gl.shadowMap.enabled = this.q.shadows;
    this.sun.castShadow = this.q.shadows;
    this.resize();
    if (this.blob) this.blob.visible = !this.q.shadows;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width | 0), h = Math.max(1, r.height | 0);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    // na ozkem zaslonu (telefon) kamera malo dlje
    this.camera.fov = w / h < 0.8 ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  /* -------------------------------------------------------- gradnja proge */

  load(L, world, skin = DEFAULT_SKIN) {
    this.clearLevel();
    this.L = L; this.w = world; this.skin = skin;
    const th = L.theme || {};
    this.scene.background = skyTex(th.sky?.[0] || '#101030', th.sky?.[1] || '#ff7ac8');
    this.scene.fog = new THREE.Fog(th.fog || '#302050', 22, 70);
    this.hemi.color = col(th.sky?.[1] || '#ffffff').lerp(col('#ffffff'), 0.6);
    this.hemi.groundColor = col(th.fog || '#404060');
    this.cam.baseYaw = L.camYaw || 0;
    this.cam.yaw = this.cam.baseYaw;
    this.cam.init = false;
    this.dyn = [];
    this._terrain(L, world, th);
    this._objects(L, world, th);
    this._decor(L, th);
    // krogla
    this.ball = makeBall(skin, world.R);
    this.ball.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.level.add(this.ball);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.tex.blob, transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.visible = !this.q.shadows;
    this.level.add(this.blob);
    this.trail = null;
    if (skin.trail) this._makeTrail(skin.trail);
    this.setGhosts([]);
  }

  clearLevel() {
    this.level.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map && !Object.values(this.tex).includes(m.map)) m.map.dispose(); m.dispose(); });
    });
    this.level.clear();
    this.particles = [];
    this.ghosts = [];
  }

  _terrain(L, w, th) {
    const g = w.g;
    const floorC = w.mods.ice ? col(th.floor || '#3ddc84').lerp(col('#cfefff'), 0.7) : col(th.floor || '#3ddc84'), sideC = col(th.side || '#1f6f4a');
    const typeColor = {
      [TILE.floor]: floorC, [TILE.wave]: floorC.clone().offsetHSL(0, 0, 0.06), [TILE.ramp]: floorC.clone().offsetHSL(0, 0, -0.05),
      [TILE.ice]: col('#bfeaff'), [TILE.glue]: col('#c6ff4d'), [TILE.wall]: col(th.wall || '#ff4fd8'), [TILE.fall]: col('#ffffff'),
    };
    const top = { pos: [], col: [], uv: [] }, side = { pos: [], col: [] };
    const conv = { pos: [], uv: [], idx: 0 };
    const edges = [];
    const fallTiles = [];
    const tri = (buf, a, b, c, color, uvs) => {
      buf.pos.push(...a, ...b, ...c);
      if (buf.col) for (let k = 0; k < 3; k++) buf.col.push(color.r, color.g, color.b);
      if (uvs) buf.uv.push(...uvs);
    };
    const shade = (c, k) => c.clone().multiplyScalar(k);
    for (let r = 0; r < g.D; r++) for (let c = 0; c < g.W; c++) {
      const i = r * g.W + c;
      const t = g.type[i];
      if (t === TILE.void) continue;
      if (t === TILE.fall) { fallTiles.push(i); continue; }
      const H = (x, z) => tileTop(w, i, Math.min(c + 0.9999, Math.max(c + 0.0001, x)), Math.min(r + 0.9999, Math.max(r + 0.0001, z)));
      const n = (t === TILE.wave || (L.bowls || []).some(b => (b.x - c - 0.5) ** 2 + (b.z - r - 0.5) ** 2 < (b.r + 1) ** 2)) ? 6 : 1;
      const base = typeColor[t] || floorC;
      const checker = (c + r) % 2 ? 1 : 0.94;
      if (t === TILE.conveyor) {
        // trak: posebna mreža z animirano teksturo
        const dx = g.dx[i], dz = g.dz[i];
        const h = H(c + 0.5, r + 0.5) + 0.002;
        const P4 = [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]];
        const uv = ([x, z]) => {
          // v smer gibanja (u ob smeri, v prečno)
          const along = dx ? (x - c) * -dx : (z - r) * -dz;
          const across = dx ? (z - r) : (x - c);
          return [across, along];
        };
        const v = P4.map(([x, z]) => [x, h, z]);
        const uvs = P4.map(uv);
        conv.pos.push(...v[0], ...v[2], ...v[1], ...v[0], ...v[3], ...v[2]);
        conv.uv.push(...uvs[0], ...uvs[2], ...uvs[1], ...uvs[0], ...uvs[3], ...uvs[2]);
      } else {
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
          const x0 = c + a / n, x1 = c + (a + 1) / n, z0 = r + b / n, z1 = r + (b + 1) / n;
          const p00 = [x0, H(x0, z0), z0], p10 = [x1, H(x1, z0), z0], p11 = [x1, H(x1, z1), z1], p01 = [x0, H(x0, z1), z1];
          const cc = shade(base, checker * (0.92 + 0.08 * Math.min(1, Math.max(0, (p00[1] - g.minH) / 6))));
          tri(top, p00, p11, p10, cc, [x0, z0, x1, z1, x1, z0]);
          tri(top, p00, p01, p11, cc, [x0, z0, x0, z1, x1, z1]);
        }
      }
      // stranice
      const corners = [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]];
      const myTops = corners.map(([x, z]) => H(x, z));
      const bottom = Math.min(...myTops) - (t === TILE.wall ? P.WALL_H + 0.6 : 0.6);
      const nbs = [[0, -1, 0, 1], [1, 0, 1, 2], [0, 1, 2, 3], [-1, 0, 3, 0]];
      for (const [ox, oz, ia, ib] of nbs) {
        const j = (r + oz >= 0 && r + oz < g.D && c + ox >= 0 && c + ox < g.W) ? (r + oz) * g.W + c + ox : -1;
        const nt = j >= 0 ? g.type[j] : TILE.void;
        const nTop = (k) => {
          if (nt === TILE.void || nt === TILE.fall) return -Infinity;
          const [x, z] = corners[k];
          const nc = c + ox, nr = r + oz;
          return tileTop(w, j, Math.min(nc + 0.9999, Math.max(nc + 0.0001, x)), Math.min(nr + 0.9999, Math.max(nr + 0.0001, z)));
        };
        const ta = myTops[ia], tb = myTops[ib];
        const ba = Math.max(nTop(ia), bottom), bb = Math.max(nTop(ib), bottom);
        if (ta - ba < 0.01 && tb - bb < 0.01) continue;
        const [xa, za] = corners[ia], [xb, zb] = corners[ib];
        const sc = shade(sideC, ox ? 0.85 : oz > 0 ? 1 : 0.7);
        tri(side, [xa, ta, za], [xb, bb, zb], [xb, tb, zb], sc);
        tri(side, [xa, ta, za], [xa, ba, za], [xb, bb, zb], sc);
        if (nt === TILE.void || nt === TILE.fall) edges.push(xa, ta + 0.01, za, xb, tb + 0.01, zb);
      }
    }
    const mk = (buf, mat, uv = false) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
      if (buf.col) geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
      if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      this.level.add(m);
      return m;
    };
    if (top.pos.length) mk(top, new THREE.MeshLambertMaterial({ vertexColors: true, map: this.tex.grid }), true);
    if (side.pos.length) mk(side, new THREE.MeshLambertMaterial({ vertexColors: true }));
    if (conv.pos.length) {
      const tex = this.tex.arrow.clone(); tex.needsUpdate = true;
      this.convTex = tex;
      mk(conv, new THREE.MeshLambertMaterial({ map: tex, emissive: '#221a00' }), true);
    } else this.convTex = null;
    if (edges.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
      this.level.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: th.edge || '#ffffff', transparent: true, opacity: 0.85 })));
    }
    // padajoče ploščice: posamezne kocke
    this.fallMeshes = fallTiles.map(i => {
      const c = i % g.W, r = (i / g.W) | 0, h = g.h[i];
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.4, 0.96), new THREE.MeshLambertMaterial({ color: '#e6fbff', transparent: true, opacity: 0.8, emissive: '#2a6f9a', emissiveIntensity: 0.3 }));
      m.position.set(c + 0.5, h - 0.2, r + 0.5);
      m.userData = { i, base: m.position.clone() };
      m.receiveShadow = true;
      this.level.add(m);
      return m;
    });
  }

  _objects(L, w, th) {
    const accent = th.accent || '#ffd23f';
    const add = (m, shadow = true) => { if (shadow) m.traverse(o => { if (o.isMesh) o.castShadow = true; }); this.level.add(m); return m; };
    const gy = (x, z) => { const v = groundBelow(w, x, z); return Number.isFinite(v) ? v : 0; };
    // start
    const st = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 32), new THREE.MeshBasicMaterial({ color: '#4de1ff', transparent: true, opacity: 0.8 }));
    st.rotation.x = -Math.PI / 2; st.position.set(L.start[0], gy(...L.start) + 0.02, L.start[1]); add(st, false);
    // cilj
    const goal = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 10, 40), new THREE.MeshBasicMaterial({ color: accent }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; goal.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 3; goal.add(beam);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35 }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.02; goal.add(pad);
    goal.position.set(L.goal[0], gy(...L.goal), L.goal[1]);
    add(goal, false);
    this.dyn.push(t => { ring.scale.setScalar(1 + 0.06 * Math.sin(t * 4)); beam.material.opacity = 0.12 + 0.06 * Math.sin(t * 3); });
    // kontrolne točke (zastavice)
    this.flags = (L.checkpoints || []).map((p, k) => {
      const f = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), new THREE.MeshLambertMaterial({ color: '#dddddd' }));
      pole.position.y = 0.55; f.add(pole);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.3), new THREE.MeshLambertMaterial({ color: '#888899', side: THREE.DoubleSide }));
      cloth.position.set(0.24, 0.92, 0); f.add(cloth);
      const base = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 28), new THREE.MeshBasicMaterial({ color: '#888899', transparent: true, opacity: 0.6 }));
      base.rotation.x = -Math.PI / 2; base.position.y = 0.02; f.add(base);
      f.position.set(p[0] + 0.55, gy(p[0], p[1]), p[1]);
      f.userData = { cloth, base, k };
      return add(f);
    });
    // pobiralke
    this.pickups = (L.pickups || []).map((p, k) => {
      let m;
      if (p.t === 'star') {
        const sh = new THREE.Shape();
        for (let j = 0; j < 10; j++) {
          const a = j / 10 * Math.PI * 2 - Math.PI / 2, rr = j % 2 ? 0.1 : 0.24;
          if (j) sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false }), new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#806000' }));
        m.geometry.center();
      } else {
        m = new THREE.Group();
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 20), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#226644' }));
        face.rotation.x = Math.PI / 2; m.add(face);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 24), new THREE.MeshLambertMaterial({ color: '#39ff88', emissive: '#0a5a2a' })); m.add(rim);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, 0.02), new THREE.MeshBasicMaterial({ color: '#111' })); hand.position.set(0, 0.05, 0.04); m.add(hand);
        const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.02), new THREE.MeshBasicMaterial({ color: '#111' })); hand2.position.set(0.04, 0, 0.04); m.add(hand2);
      }
      const y = p.y != null ? p.y + 0.05 : gy(p.x, p.z) + 0.45;
      m.position.set(p.x, y, p.z);
      m.userData = { k, y };
      return add(m);
    });
    // premične ploščice
    this.moverMeshes = (L.movers || []).map(mv => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(mv.size[0], mv.thick || 0.4, mv.size[1]), new THREE.MeshLambertMaterial({ color: mv.ice ? '#bfeaff' : accent, map: this.tex.grid }));
      m.receiveShadow = true;
      return add(m);
    });
    // vrtljive plošče
    this.spinMeshes = (L.spinners || []).map(s => {
      const geo = new THREE.CylinderGeometry(s.r, s.r, 0.3, 32, 1);
      const cols = [];
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const a = Math.atan2(pos.getZ(k), pos.getX(k));
        const stripe = Math.floor((a + Math.PI) / (Math.PI / 4)) % 2;
        const cc = col(stripe ? th.wall || '#ff4fd8' : th.edge || '#ffffff');
        cols.push(cc.r, cc.g, cc.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      m.position.set(s.x, s.y - 0.15, s.z);
      m.receiveShadow = true;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.4, 12), new THREE.MeshLambertMaterial({ color: '#222' }));
      hub.position.y = -0.3; m.add(hub);
      return add(m);
    });
    // vzmeti
    this.springMeshes = (L.springs || []).map(s => {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 20), new THREE.MeshLambertMaterial({ color: '#ff3b5c', emissive: '#400010' }));
      g.add(plate);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 3), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      arrow.rotation.x = Math.PI / 2; arrow.rotation.z = -Math.atan2(s.dir[0], -s.dir[1]);
      arrow.position.y = 0.06;
      arrow.rotation.set(-Math.PI / 2, 0, Math.atan2(-s.dir[0], -s.dir[1]));
      g.add(arrow);
      g.position.set(s.x, gy(s.x, s.z) + 0.04, s.z);
      g.userData = { plate, t: -9 };
      return add(g);
    });
    // ventilatorji
    this.fanMeshes = (L.fans || []).map(f => {
      const g = new THREE.Group();
      const y = f.y ?? gy(f.x + f.dir[0], f.z + f.dir[1]);
      const box = new THREE.Mesh(new THREE.BoxGeometry(f.width || 1, 0.9, 0.3), new THREE.MeshLambertMaterial({ color: '#555a66' }));
      g.add(box);
      const blades = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.04), new THREE.MeshLambertMaterial({ color: '#4de1ff', emissive: '#0a3a4a' }));
        b.position.y = 0.18; const piv = new THREE.Group(); piv.rotation.z = k * Math.PI / 2; piv.add(b); blades.add(piv);
      }
      blades.position.z = 0.17; g.add(blades);
      g.position.set(f.x, y + 0.45, f.z);
      g.rotation.y = Math.atan2(f.dir[0], f.dir[1]);
      // prah v toku
      const N = 14, pos = new Float32Array(N * 3);
      const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
        new THREE.PointsMaterial({ color: '#ffffff', size: 0.07, transparent: true, opacity: 0.6, depthWrite: false }));
      this.level.add(pts);
      g.userData = { blades, pts, f, y, seeds: Array.from({ length: N }, (_, k) => [(k * 0.618) % 1, ((k * 0.381) % 1) - 0.5, ((k * 0.73) % 1) * 0.6]) };
      return add(g);
    });
    // odbijači
    this.bumperMeshes = (L.bumpers || []).map(b => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(b.r || 0.4, b.r || 0.4, 0.7, 20), new THREE.MeshLambertMaterial({ color: '#4de1ff', emissive: '#0a3a4a' }));
      m.position.set(b.x, (b.y ?? gy(b.x, b.z)) + 0.35, b.z);
      return add(m);
    });
    // kladiva
    this.hammerMeshes = (L.hammers || []).map(hm => {
      const g = new THREE.Group();
      const y = gy(hm.x + hm.w / 2, hm.z + hm.d / 2);
      const head = new THREE.Mesh(new THREE.BoxGeometry(hm.w * 0.95, 0.5, hm.d * 0.95), new THREE.MeshLambertMaterial({ color: '#8a8f9a', emissive: '#000000' }));
      g.add(head);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 8), new THREE.MeshLambertMaterial({ color: '#5a4a3a' }));
      shaft.position.y = 1.75; g.add(shaft);
      const warn = new THREE.Mesh(new THREE.PlaneGeometry(hm.w, hm.d), new THREE.MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0, depthWrite: false }));
      warn.rotation.x = -Math.PI / 2; warn.position.set(hm.x + hm.w / 2, y + 0.03, hm.z + hm.d / 2);
      this.level.add(warn);
      g.position.set(hm.x + hm.w / 2, y, hm.z + hm.d / 2);
      g.userData = { head, warn, y, hm };
      return add(g);
    });
    // stikala in vrata
    this.switchMeshes = (L.switches || []).map(s => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.1, 20), new THREE.MeshLambertMaterial({ color: '#ff3b5c', emissive: '#400010' }));
      m.position.set(s.x, gy(s.x, s.z) + 0.05, s.z);
      m.userData = { id: s.id };
      return add(m);
    });
    this.doorMeshes = (L.doors || []).map(d => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h || 1.2, d.d), new THREE.MeshLambertMaterial({ color: '#ff3b5c', transparent: true, opacity: 0.85, emissive: '#400010' }));
      m.position.set(d.x + d.w / 2, d.y + (d.h || 1.2) / 2, d.z + d.d / 2);
      m.userData = { d, y: m.position.y };
      return add(m);
    });
    for (const b of L.blocks || []) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.y1 - b.y0, b.d), new THREE.MeshLambertMaterial({ color: th.wall || '#ff4fd8' }));
      m.position.set(b.x + b.w / 2, (b.y0 + b.y1) / 2, b.z + b.d / 2);
      add(m);
    }
    // sovražniki
    this.sawMeshes = w.saws.map(s => {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, 0.05, 14), new THREE.MeshLambertMaterial({ color: '#d0d4dc', emissive: '#300000', flatShading: true }));
      disc.rotation.x = Math.PI / 2; g.add(disc);
      for (let k = 0; k < 10; k++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), new THREE.MeshLambertMaterial({ color: '#ff3b5c' }));
        const a = k / 10 * Math.PI * 2;
        tooth.position.set(Math.cos(a) * s.r, Math.sin(a) * s.r, 0); tooth.rotation.z = a - Math.PI / 2; disc.add(tooth);
      }
      // tirnica
      const pts = s.path.map(p => new THREE.Vector3(p[0], gy(p[0], p[1]) + 0.03, p[1]));
      if (s.loop !== false) pts.push(pts[0].clone());
      this.level.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ff3b5c' })));
      g.userData = { disc, s };
      return add(g);
    });
    this.waspMeshes = w.wasps.map(s => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), new THREE.MeshLambertMaterial({ color: '#ffd23f' }));
      body.scale.set(1, 0.85, 1.4); g.add(body);
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 16), new THREE.MeshLambertMaterial({ color: '#1a1020' }));
      stripe.position.z = -0.06; g.add(stripe);
      const wings = [1, -1].map(sx => {
        const wg = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
        wg.position.set(sx * 0.16, 0.12, 0); g.add(wg); return wg;
      });
      g.userData = { wings, s, last: new THREE.Vector3() };
      return add(g);
    });
    this.bullyMeshes = w.bullies.map(b => {
      const g = new THREE.Group();
      const sph = new THREE.Mesh(new THREE.SphereGeometry(b.r, 24, 18), new THREE.MeshLambertMaterial({ color: '#7a1030', emissive: '#200008' }));
      g.add(sph);
      const band = new THREE.Mesh(new THREE.TorusGeometry(b.r * 1.0, 0.03, 6, 32), new THREE.MeshBasicMaterial({ color: '#ff3b5c' }));
      band.rotation.x = Math.PI / 2; g.add(band);
      const face = new THREE.Group();
      for (const s of [1, -1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        eye.position.set(0.17 * s, 0.12, b.r * 0.88); face.add(eye);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: '#000' }));
        pupil.position.set(0.17 * s, 0.11, b.r * 0.96); face.add(pupil);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: '#000' }));
        brow.position.set(0.17 * s, 0.24, b.r * 0.9); brow.rotation.z = -0.4 * s; face.add(brow);
      }
      g.add(face);
      g.userData = { face, b };
      return add(g);
    });
    this.vacMeshes = w.vacuums.map(v => {
      const g = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 0.9, 16, 1, true), new THREE.MeshLambertMaterial({ color: '#a78bfa', side: THREE.DoubleSide, emissive: '#200a40' }));
      cone.rotation.x = Math.PI / 2; g.add(cone);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshLambertMaterial({ color: '#4a3a6a' }));
      body.position.z = -0.7; g.add(body);
      const dir = v.dir || [0, 1];
      g.position.set(v.x, gy(v.x + dir[0] * 1.5, v.z + dir[1] * 1.5) + 0.4, v.z);
      g.rotation.y = Math.atan2(dir[0], dir[1]);
      // delci, ki jih vleče
      const N = 18, pos = new Float32Array(N * 3);
      const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
        new THREE.PointsMaterial({ color: '#d8c8ff', size: 0.08, transparent: true, opacity: 0.7, depthWrite: false }));
      this.level.add(pts);
      g.userData = { v, pts, y: g.position.y };
      return add(g);
    });
    this.magMeshes = w.magnets.map(mg => {
      const g = new THREE.Group();
      const u = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 8, 20, Math.PI), new THREE.MeshLambertMaterial({ color: mg.mode === 'push' ? '#4de1ff' : '#ff3b5c', emissive: '#000' }));
      u.rotation.z = Math.PI; g.add(u);
      for (const s of [1, -1]) {
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.22), new THREE.MeshLambertMaterial({ color: '#e0e0e0' }));
        tip.position.set(0.32 * s, 0.05, 0); g.add(tip);
      }
      const field = new THREE.Mesh(new THREE.RingGeometry(0.2, mg.range || 3.5, 40), new THREE.MeshBasicMaterial({ color: mg.mode === 'push' ? '#4de1ff' : '#ff3b5c', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      const fy = gy(mg.x, mg.z);
      field.rotation.x = -Math.PI / 2; field.position.set(mg.x, (Number.isFinite(fy) ? fy : 0) + 0.04, mg.z);
      this.level.add(field);
      const y = gy(mg.x, mg.z);
      g.position.set(mg.x, (Number.isFinite(y) ? y : 0) + 0.9, mg.z);
      g.userData = { u, field, mg };
      return add(g);
    });
  }

  /** Okras: lebdeči oblaki/kocke pod progo za globino (determinističen). */
  _decor(L, th) {
    const [W, D] = L.size;
    let s = 1234 + W * 31 + D;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const mat = new THREE.MeshLambertMaterial({ color: th.side || '#555', transparent: true, opacity: 0.55 });
    const n = this.qualityKey === 'low' ? 10 : 24;
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      const sz = 0.6 + rnd() * 2.2;
      m.scale.set(sz, sz, sz);
      m.position.set(-8 + rnd() * (W + 16), -6 - rnd() * 14, -8 + rnd() * (D + 16));
      m.rotation.set(rnd() * 3, rnd() * 3, 0);
      this.level.add(m);
      this.dyn.push(t => { m.rotation.y += 0.002; m.position.y += Math.sin(t * 0.5 + k) * 0.002; });
    }
  }

  _makeTrail(color) {
    const N = 40, pos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.trail = { pts: new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.12, transparent: true, opacity: 0.8, depthWrite: false })), N, i: 0, init: false };
    this.level.add(this.trail.pts);
  }

  /** Ghosti: [{ frames, color, label }] */
  setGhosts(list) {
    for (const g of this.ghosts) { this.level.remove(g.mesh); if (g.label) this.level.remove(g.label); }
    this.ghosts = list.map(gh => {
      const mesh = makeBall(this.skin || DEFAULT_SKIN, this.w?.R || P.R, true, gh.color || '#ffffff');
      this.level.add(mesh);
      let label = null;
      if (gh.label) { label = textSprite(gh.label, { color: gh.color || '#fff' }); this.level.add(label); }
      return { ...gh, mesh, label, prev: null };
    });
  }

  /* --------------------------------------------------------- učinki */

  burst(x, y, z, color = '#ffd23f', n = 16, speed = 3) {
    const k = Math.max(4, Math.round(n * this.q.particles * (this.reduced ? 0.4 : 1)));
    const pos = new Float32Array(k * 3), vel = [];
    for (let i = 0; i < k; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const a = (i / k) * Math.PI * 2, e = 0.3 + ((i * 7) % 5) / 6;
      vel.push([Math.cos(a) * speed * e, speed * (0.6 + ((i * 3) % 4) / 5), Math.sin(a) * speed * e]);
    }
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ color, size: 0.12, transparent: true, opacity: 1, depthWrite: false }));
    this.level.add(pts);
    this.particles.push({ pts, vel, life: 0.9, t: 0 });
  }

  shake(a = 0.25) { if (!this.reduced) this.cam.shake = Math.max(this.cam.shake, a); }

  /* --------------------------------------------------------- izris */

  /**
   * @param {Object} w svet
   * @param {{x,y,z}} bp interpoliran položaj krogle
   * @param {number} dt realni čas od zadnjega izrisa
   * @param {{rotate?:boolean, ghostT?:number, frozen?:boolean}} opt
   */
  render(w, bp, dt, opt = {}) {
    if (!this.L) { this.gl.render(this.scene, this.camera); return; }
    const t = w.t;
    // dinamični objekti
    for (const f of this.dyn) f(t);
    if (this.convTex) this.convTex.offset.y = (t * P.CONVEYOR) % 1;
    w.movers.forEach((m, k) => this.moverMeshes[k].position.set(m.pos[0], m.pos[1] - (m.thick || 0.4) / 2, m.pos[2]));
    w.spinners.forEach((s, k) => { this.spinMeshes[k].rotation.y = -s.speed * t; });
    for (const fm of this.fallMeshes) {
      const st = fallTileState(w, fm.userData.i);
      const b = fm.userData.base;
      const sh = st.shake * 0.06;
      fm.position.set(b.x + Math.sin(t * 60) * sh, b.y - st.drop, b.z + Math.cos(t * 53) * sh);
      fm.material.opacity = st.drop > 0 ? Math.max(0, 0.8 - st.drop * 0.1) : 0.8;
      fm.material.emissive.set(st.shake > 0 ? '#ff3b5c' : '#2a6f9a');
      fm.visible = st.drop < 8;
    }
    this.flags.forEach(f => {
      const on = f.userData.k <= w.checkpoint;
      const c = on ? (this.L.theme?.accent || '#39ff88') : '#888899';
      f.userData.cloth.material.color.set(c); f.userData.base.material.color.set(c);
      f.userData.cloth.rotation.y = Math.sin(t * 3 + f.userData.k) * 0.3;
    });
    this.pickups.forEach(p => {
      p.visible = !w.collected.has(p.userData.k);
      p.rotation.y = t * 2.2 + p.userData.k;
      p.position.y = p.userData.y + Math.sin(t * 3 + p.userData.k) * 0.06;
    });
    for (const s of this.springMeshes) { const a = t - s.userData.t; s.userData.plate.position.y = a < 0.25 ? Math.sin(a / 0.25 * Math.PI) * 0.25 : 0; }
    for (const f of this.fanMeshes) {
      f.userData.blades.rotation.z = t * 14;
      const { pts, f: fan, y, seeds } = f.userData;
      const pos = pts.geometry.attributes.position;
      const px = -fan.dir[1], pz = fan.dir[0];
      seeds.forEach((sd, k) => {
        const u = (sd[0] + t * 0.9) % 1;
        const along = u * fan.len, side = sd[1] * (fan.width || 1);
        pos.setXYZ(k, fan.x + fan.dir[0] * along + px * side, y + 0.2 + sd[2], fan.z + fan.dir[1] * along + pz * side);
      });
      pos.needsUpdate = true;
    }
    for (const h of this.hammerMeshes) {
      const st = hammerPhase(w, h.userData.hm);
      let y = 1.6;
      if (st.ph === 'warn') y = 1.6 + st.f * 0.9 + (this.reduced ? 0 : Math.sin(t * 40) * 0.03);
      else if (st.ph === 'strike') y = 2.5 - 2.25 * Math.min(1, st.f * 2);
      else if (st.ph === 'up') y = 0.25 + st.f * 1.35;
      h.userData.head.position.y = y;
      h.children[1].position.y = y + 1.75;
      h.userData.warn.material.opacity = st.ph === 'warn' ? 0.15 + 0.3 * (Math.sin(t * 20) * 0.5 + 0.5) : st.ph === 'strike' ? 0.5 : 0;
      h.userData.head.material.emissive.set(st.ph === 'warn' ? '#661020' : '#000000');
    }
    for (const s of this.switchMeshes) {
      const on = w.switches.has(s.userData.id);
      s.material.color.set(on ? '#39ff88' : '#ff3b5c'); s.material.emissive.set(on ? '#0a4020' : '#400010');
      s.scale.y = on ? 0.4 : 1;
    }
    for (const d of this.doorMeshes) {
      const o = doorOpenness(w, d.userData.d.id);
      d.position.y = d.userData.y - o * ((d.userData.d.h || 1.2) + 0.05);
      d.visible = o < 0.98;
    }
    this.sawMeshes.forEach((m, k) => {
      const s = w.saws[k];
      const y = groundBelow(w, s.pos[0], s.pos[1]);
      m.position.set(s.pos[0], (Number.isFinite(y) ? y : 0) + (s.r * 0.9), s.pos[1]);
      m.userData.disc.rotation.y = t * 18;
      const nx = s.info.seg[0].b[0] - s.info.seg[0].a[0], nz = s.info.seg[0].b[1] - s.info.seg[0].a[1];
      m.rotation.y = Math.atan2(nx, nz) + Math.PI / 2;
    });
    this.waspMeshes.forEach((m, k) => {
      const s = w.wasps[k];
      const y = groundBelow(w, s.pos[0], s.pos[1]);
      const ny = (Number.isFinite(y) ? y : w.ball.y - w.R) + 0.45 + Math.sin(t * 6 + k) * 0.06;
      const last = m.userData.last;
      const dx = s.pos[0] - last.x, dz = s.pos[1] - last.z;
      if (dx * dx + dz * dz > 1e-6) m.rotation.y = Math.atan2(dx, dz);
      last.set(s.pos[0], ny, s.pos[1]);
      m.position.copy(last);
      m.userData.wings.forEach((wg, j) => { wg.rotation.z = Math.sin(t * 50) * 0.6 * (j ? -1 : 1); });
    });
    this.bullyMeshes.forEach((m, k) => {
      const b = w.bullies[k];
      m.visible = b.deadT <= 0 || b.y > w.killY;
      m.position.set(b.x, b.y, b.z);
      m.userData.face.rotation.y = Math.atan2(w.ball.x - b.x, w.ball.z - b.z);
    });
    this.vacMeshes.forEach(m => {
      const { v, pts, y } = m.userData;
      const dir = v.dir || [0, 1];
      const pos = pts.geometry.attributes.position;
      const n = pos.count;
      for (let k = 0; k < n; k++) {
        const u = 1 - ((k / n + t * 0.6) % 1);
        const a = k * 2.4;
        const spread = u * (v.range || 4) * Math.tan((v.angle || 35) * Math.PI / 180) * 0.6;
        const px = -dir[1], pz = dir[0];
        pos.setXYZ(k, v.x + dir[0] * u * (v.range || 4) + px * Math.cos(a) * spread, y + Math.sin(a) * 0.3, v.z + dir[1] * u * (v.range || 4) + pz * Math.cos(a) * spread);
      }
      pos.needsUpdate = true;
    });
    this.magMeshes.forEach(m => {
      const st = magnetState(w, m.userData.mg);
      const blink = st.warn && Math.sin(t * 30) > 0;
      m.userData.u.material.emissive.set(st.on ? (m.userData.mg.mode === 'push' ? '#1a5a6a' : '#6a1020') : blink ? '#555555' : '#000000');
      m.userData.field.material.opacity = st.on ? 0.1 + 0.06 * Math.sin(t * 12) : blink ? 0.06 : 0;
      m.rotation.y = t * (st.on ? 3 : 0.5);
    });
    for (const p of this.particles) {
      p.t += dt;
      const pos = p.pts.geometry.attributes.position;
      for (let i = 0; i < p.vel.length; i++) {
        p.vel[i][1] -= 9 * dt;
        pos.setXYZ(i, pos.getX(i) + p.vel[i][0] * dt, pos.getY(i) + p.vel[i][1] * dt, pos.getZ(i) + p.vel[i][2] * dt);
      }
      pos.needsUpdate = true;
      p.pts.material.opacity = Math.max(0, 1 - p.t / p.life);
    }
    this.particles = this.particles.filter(p => { if (p.t >= p.life) { this.level.remove(p.pts); p.pts.geometry.dispose(); p.pts.material.dispose(); return false; } return true; });

    // krogla
    this._ball(this.ball, bp, w.ball, dt, w.dead, true);
    // senca
    const gyb = groundBelow(w, bp.x, bp.z, bp.y - w.R + 0.05);
    if (Number.isFinite(gyb) && !w.dead) {
      const hgt = bp.y - w.R - gyb;
      this.blob.position.set(bp.x, gyb + 0.02, bp.z);
      const s = w.R * 2.4 * (1 + hgt * 0.3);
      this.blob.scale.set(s, s, 1);
      this.blob.material.opacity = Math.max(0, 0.9 - hgt * 0.25);
      this.blob.visible = !this.q.shadows;
    } else this.blob.visible = false;
    if (this.trail) {
      const tr = this.trail, pos = tr.pts.geometry.attributes.position;
      if (!tr.init) { for (let k = 0; k < tr.N; k++) pos.setXYZ(k, bp.x, bp.y, bp.z); tr.init = true; }
      tr.i = (tr.i + 1) % tr.N; pos.setXYZ(tr.i, bp.x, bp.y - w.R * 0.6, bp.z); pos.needsUpdate = true;
    }
    // ghosti
    for (const g of this.ghosts) {
      const s = sampleAt(g.frames, opt.ghostT ?? t);
      if (!s) continue;
      const prev = g.prev || s;
      this._ball(g.mesh, s, { vx: (s.x - prev.x) / Math.max(dt, 1e-3), vz: (s.z - prev.z) / Math.max(dt, 1e-3), yaw: s.yaw }, dt, false, false);
      g.prev = s;
      g.mesh.visible = !s.done || (opt.ghostT ?? t) < g.frames.length / 20 + 2;
      if (g.label) { g.label.position.set(s.x, s.y + 0.75, s.z); g.label.visible = g.mesh.visible; }
    }
    // kamera
    this._camera(w, bp, dt, opt);
    if (this.q.shadows) {
      this.sun.position.set(bp.x - 6, bp.y + 14, bp.z + 8);
      this.sun.target.position.set(bp.x, bp.y, bp.z);
    }
    this.gl.render(this.scene, this.camera);
  }

  _ball(root, p, b, dt, dead, rider) {
    root.position.set(p.x, p.y, p.z);
    const { roll } = root.userData;
    const vx = b.vx || 0, vz = b.vz || 0;
    const sp = Math.hypot(vx, vz);
    if (sp > 0.01 && dt > 0) {
      const axis = new THREE.Vector3(vz, 0, -vx).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(axis, sp * Math.min(dt, 0.05) / (this.w?.R || P.R));
      roll.quaternion.premultiply(q);
    }
    root.visible = !(dead && p.y < (this.w?.killY ?? -5) + 1);
    const r = root.userData.rider;
    if (r && rider) {
      r.rotation.y = b.yaw || 0;
      root.userData.step += sp * dt * 9;
      const st = root.userData.step;
      r.position.y = -0.08 + Math.abs(Math.sin(st)) * Math.min(0.04, sp * 0.008);
      r.rotation.x = Math.min(0.35, sp * 0.04);
      (r.userData.legs || []).forEach((l, k) => { l.position.z = l.userData.base.z + Math.sin(st + k * Math.PI / 2 + (k > 1 ? Math.PI : 0)) * Math.min(0.05, sp * 0.02); });
    }
  }

  _camera(w, bp, dt, opt) {
    const c = this.cam;
    const b = w.ball;
    // rahla rotacija v smeri gibanja (omejeno ±35°)
    if (opt.rotate && !w.dead && b.grounded) {
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 2.5) {
        const heading = Math.atan2(-b.vx, -b.vz);   // yaw, pri katerem kamera gleda v smeri gibanja
        let d = heading - c.baseYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        const target = c.baseYaw + Math.max(-0.6, Math.min(0.6, d));
        let e = target - c.yaw; e = Math.atan2(Math.sin(e), Math.cos(e));
        c.yaw += e * Math.min(1, dt * 0.8);
      }
    } else if (!opt.rotate) {
      let e = c.baseYaw - c.yaw; e = Math.atan2(Math.sin(e), Math.cos(e)); c.yaw += e * Math.min(1, dt * 2);
    }
    const narrow = this.camera.aspect < 0.8;
    const dist = narrow ? 8.5 : 8, hgt = narrow ? 8 : 6.8;
    const fy = w.dead ? c.look.y : bp.y;
    const look = new THREE.Vector3(bp.x - Math.sin(c.yaw) * 1.2, fy, bp.z - Math.cos(c.yaw) * 1.2);
    const pos = new THREE.Vector3(look.x + Math.sin(c.yaw) * dist, fy + hgt, look.z + Math.cos(c.yaw) * dist);
    if (!c.init) { c.pos.copy(pos); c.look.copy(look); c.init = true; }
    const k = 1 - Math.exp(-dt * 5);
    c.pos.lerp(pos, k);
    c.look.lerp(look, k);
    this.camera.position.copy(c.pos);
    if (c.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * c.shake;
      this.camera.position.y += (Math.random() - 0.5) * c.shake;
      c.shake = Math.max(0, c.shake - dt * 1.5);
    }
    this.camera.lookAt(c.look);
  }

  /** Projekcija svetovne točke na zaslon (px, glede na canvas). */
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height };
  }

  springFired(sp) { const k = (this.L.springs || []).indexOf(sp); if (k >= 0) this.springMeshes[k].userData.t = this.w.t; }
}
