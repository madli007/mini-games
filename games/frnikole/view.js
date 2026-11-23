/* =====================================================================
   DIRKA FRNIKOL — view.js: izris dirke s Three.js prek renderja Krogle.
   Podrazred Renderer iz ../krogla/render.js: isto nebo, lokacije, teksture,
   teren, ovire, kakovost (QUALITY / detectQuality) in post-processing.
   Dodano: steklene barvne frnikole (brez hrčka) z vzorcem, imena nad njimi,
   obroč izbrane / moje frnikole, kamera (vodilna skupina, moja frnikola, pregled),
   učinki sunkov, trkov, padcev in cilja.
   ===================================================================== */
import * as THREE from 'three';
import { Renderer, DEFAULT_SKIN } from '../krogla/render.js';
import { contactShadow } from '../krogla/render/textures.js';
import { FADE } from '../krogla/render/materials.js';
import { groundY } from '../krogla/physics.js';
import { routeAt } from './race.js';

/** Sprite z besedilom (canvas). */
function label(text, color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 28px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = Math.min(250, g.measureText(text).width + 26);
  g.fillStyle = 'rgba(8,10,24,.62)'; g.beginPath(); g.roundRect((256 - tw) / 2, 8, tw, 48, 24); g.fill();
  g.fillStyle = color; g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  sp.scale.set(1.5, 0.375, 1);
  sp.renderOrder = 20;
  return sp;
}

/** Tekstura notranjosti frnikole (equirect 256×128): osnovna barva + vzorec v drugi barvi. */
function marbleTexture(color, color2, pattern, seed = 1) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  const base = new THREE.Color(color);
  grd.addColorStop(0, '#' + base.clone().lerp(new THREE.Color('#ffffff'), 0.25).getHexString());
  grd.addColorStop(0.5, color);
  grd.addColorStop(1, '#' + base.clone().multiplyScalar(0.6).getHexString());
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = color2; g.strokeStyle = color2;
  if (pattern === 'swirl') {
    g.globalAlpha = 0.75; g.lineWidth = 9;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      for (let x = 0; x <= 256; x += 4) { const y = 64 + Math.sin(x / 256 * Math.PI * 2 * (k + 1) + k * 2) * (26 + k * 8); if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
  } else if (pattern === 'stripes') {
    g.globalAlpha = 0.85;
    for (let x = -128; x < 256; x += 36) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 14, 0); g.lineTo(x + 14 + 64, 128); g.lineTo(x + 64, 128); g.fill(); }
  } else if (pattern === 'dots') {
    g.globalAlpha = 0.9;
    for (let k = 0; k < 26; k++) { g.beginPath(); g.arc(rnd() * 256, 14 + rnd() * 100, 4 + rnd() * 6, 0, Math.PI * 2); g.fill(); }
  } else if (pattern === 'stars') {
    g.globalAlpha = 0.95;
    for (let k = 0; k < 14; k++) {
      const cx = rnd() * 256, cy = 18 + rnd() * 92, R = 6 + rnd() * 5;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? R * 0.45 : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
  } else if (pattern === 'ring') {
    g.globalAlpha = 0.85; g.fillRect(0, 52, 256, 24);
    g.globalAlpha = 0.5; g.fillRect(0, 40, 256, 5); g.fillRect(0, 83, 256, 5);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export class RaceRenderer extends Renderer {
  constructor(canvas, opts) {
    super(canvas, { ...opts, dof: false });
    this.vis = [];
    this.defs = [];
    this.view = { mode: 'lead', yaw: 0, init: false, tgt: new THREE.Vector3(), cur: new THREE.Vector3() };
  }

  /** Proga in svet dirke. */
  load(L, world) {
    super.load(L, world, DEFAULT_SKIN, { menu: false });
    this.cam.intro = null;
    this.ball.visible = false; this.blob.visible = false;
    if (this.caustic) this.caustic.visible = false;
    if (this.trail) this.trail.mesh.visible = false;
    // meje proge (pregled)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    L.map.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] !== ' ') { x0 = Math.min(x0, c); x1 = Math.max(x1, c + 1); z0 = Math.min(z0, r); z1 = Math.max(z1, r + 1); } });
    this.bounds = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
    this.view.init = false;
    this._build();
  }

  /** Frnikole za izris: [{ name, color, color2, pattern }] (indeks = indeks v dirki). */
  setMarbles(defs) {
    this.defs = defs;
    if (this.L) this._build();
  }

  _dispose() {
    for (const v of this.vis) {
      for (const o of [v.root, v.blob, v.label, v.ring, v.arrow]) {
        if (!o) continue;
        o.parent?.remove(o);
        o.traverse?.(x => { x.geometry?.dispose(); if (x.material) { x.material.map?.dispose(); x.material.dispose(); } });
      }
    }
    this.vis = [];
  }

  _build() {
    this._dispose();
    const R = this.w?.R || 0.32;
    const real = this.q.glass === 'real';
    const sh = contactShadow();
    this.vis = this.defs.map((d, i) => {
      const root = new THREE.Group();
      const roll = new THREE.Group(); root.add(roll);
      const core = new THREE.Mesh(new THREE.SphereGeometry(R * 0.96, 40, 28), new THREE.MeshPhysicalMaterial({
        map: marbleTexture(d.color, d.color2 || '#ffffff', d.pattern, i + 3), roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05,
        sheen: 0.3, sheenColor: new THREE.Color(d.color2 || '#ffffff'),
      }));
      roll.add(core);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), new THREE.MeshPhysicalMaterial({
        color: '#ffffff', roughness: 0.02, metalness: 0, transparent: true, opacity: real ? 0.18 : 0.14, clearcoat: 1, envMapIntensity: 1.6, depthWrite: false,
      }));
      shell.renderOrder = 3; root.add(shell);
      this.level.add(root);
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: sh, transparent: true, depthWrite: false, opacity: 0.6 }));
      blob.renderOrder = 1; this.level.add(blob);
      const lb = label(d.name, d.color === '#2a2a3a' ? '#ffd23f' : d.color);
      this.level.add(lb);
      const ring = new THREE.Mesh(new THREE.RingGeometry(R * 1.25, R * 1.6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
      ring.renderOrder = 2; ring.visible = false; this.level.add(ring);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd23f').multiplyScalar(1.6) }));
      arrow.renderOrder = 21; arrow.visible = false; this.level.add(arrow);
      return { root, roll, blob, label: lb, ring, arrow, d };
    });
  }

  /* ------------------------------------------------------------ učinki */

  /** Sunek: val iskric (pomoč: rumena, oviranje: rdeča). */
  nudgeFx(b, k) {
    if (!this.fx) return;
    const c = k === 'help' ? '#ffd23f' : '#ff3b5c';
    this.fx.spark(b.x, b.y, b.z, c, 22, 3.8, 0.4, 2.6);
    this.fx.spark(b.x, b.y, b.z, '#ffffff', 10, 2.2, 0.3, 2);
  }
  bonkFx(x, y, z, v) { if (this.fx) this.fx.spark(x, y, z, '#e8f6ff', Math.min(22, 4 + v * 2), 1.6 + v * 0.2, 0.3, 2.4); }
  fallFx(b, color) { if (this.fx) { this.fx.puff(b.x, b.y, b.z, '#ffffff', 10, 1.4, 0.7, 0.3); this.fx.spark(b.x, b.y, b.z, color, 18, 3, 0.6, 2.2); } }
  finishFx(b, color) { if (this.fx) { this.fx.confetti(b.x, b.y + 0.3, b.z, 70); this.fx.spark(b.x, b.y + 0.3, b.z, color, 26, 3.5, 0.8, 3); } }

  /* ------------------------------------------------------------ izris */

  /**
   * @param {Object} R dirka (race.js)
   * @param {number} dt realni čas od zadnjega izrisa
   * @param {{mode:'lead'|'mine'|'overview', follow:number, selected:number, mine:number, alpha?:number}} opt
   */
  renderRace(R, dt, opt) {
    if (this.lost || !this.L) return;
    const w = R.w;
    this.gl.info.reset();
    const t = w.t;
    this.vt += dt;
    this.objects.update(w, t, dt, { near: () => false });
    for (const tx of this.terrain.convTex) tx.offset.y = (t * 2.4) % 1;
    const rad = w.R;
    const q = this._q || (this._q = new THREE.Quaternion());
    const ax = this._ax || (this._ax = new THREE.Vector3());
    R.M.forEach((m, i) => {
      const v = this.vis[i];
      if (!v) return;
      const b = m.b;
      const show = !(m.st === 'fall' && m.fallT > 0.6);
      v.root.visible = v.label.visible = show;
      v.root.position.set(b.x, b.y, b.z);
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0.01) { ax.set(b.vz, 0, -b.vx).normalize(); q.setFromAxisAngle(ax, sp * Math.min(dt, 0.05) / rad); v.roll.quaternion.premultiply(q); }
      const gy = groundY(w, b.x, b.z, b.y - rad + 0.05);
      const onG = show && Number.isFinite(gy) && m.st !== 'fall';
      v.blob.visible = onG;
      if (onG) {
        const hgt = Math.max(0, b.y - rad - gy);
        v.blob.position.set(b.x, gy + 0.012, b.z);
        const s = rad * 2.3 * (1 + hgt * 0.35);
        v.blob.scale.set(s, 1, s);
        v.blob.material.opacity = Math.max(0.12, 0.62 - hgt * 0.2);
      }
      const sel = i === opt.selected, mine = i === opt.mine;
      v.ring.visible = onG && (sel || mine);
      if (v.ring.visible) {
        v.ring.position.set(b.x, gy + 0.03, b.z);
        v.ring.material.color.set(sel ? '#ffffff' : '#ffd23f');
        v.ring.scale.setScalar(sel ? 1 + Math.sin(this.vt * 6) * 0.08 : 1);
      }
      v.arrow.visible = show && mine;
      if (v.arrow.visible) { v.arrow.position.set(b.x, b.y + rad + 0.95 + (this.reduced ? 0 : Math.sin(this.vt * 5) * 0.06), b.z); v.arrow.rotation.y = this.vt * 2; }
      const far = opt.mode === 'overview';
      // pomembna imena (izbrana, moja, prve tri) večja, ostala manjša — manj prekrivanja v gneči
      const imp = sel || mine || R.order.indexOf(i) < 3;
      const k = (far ? 1.7 : 1) * (imp ? 1.35 : 0.95);
      v.label.position.set(b.x, b.y + rad + (far ? 0.9 : imp ? 0.5 : 0.38), b.z);
      v.label.scale.set(k * 1.1, k * 0.275, 1);
      v.label.material.opacity = imp || far ? 1 : 0.7;
      v.label.renderOrder = imp ? 22 : 20;
    });
    const focus = this._camera(R, dt, opt);
    this.fx.update(dt);
    this.decor.update(this.vt, this.camera);
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.uTime.value = this.vt;
    if (this.q.shadows) this._shadowFollow(focus);
    FADE.uFadeR.value = 0;
    if (this.post.composer) this.post.render(dt, 0.5, 0);
    else this.gl.render(this.scene, this.camera);
  }

  /** Točka, ki ji sledi kamera, in smer proge v njej. */
  _target(R, opt) {
    const M = R.M;
    let m = opt.mode === 'mine' && M[opt.follow] ? M[opt.follow] : M[R.order[0]];
    // padla frnikola: sledi naslednji v vrstnem redu
    if (m && m.st === 'fall') m = M[R.order.find(i => M[i].st === 'run')] || m;
    if (!m) return null;
    let x = m.b.x, y = m.b.y, z = m.b.z;
    if (opt.mode === 'lead') {
      // vodilna skupina: rahlo povprečje prvih treh (če so blizu)
      let n = 1;
      for (const i of R.order.slice(1, 3)) {
        const o = M[i];
        if (o.st !== 'run' || Math.hypot(o.b.x - m.b.x, o.b.z - m.b.z) > 3.5) continue;
        x += o.b.x * 0.5; y += o.b.y * 0.5; z += o.b.z * 0.5; n += 0.5;
      }
      x /= n; y /= n; z /= n;
    }
    const p = routeAt(m.route, m.s + 1.5);
    return { x, y, z, tx: p.tx, tz: p.tz };
  }

  _camera(R, dt, opt) {
    const c = this.cam, V = this.view;
    const narrow = this.camera.aspect < 0.8;
    const pos = this._ps || (this._ps = new THREE.Vector3());
    const look = this._lk || (this._lk = new THREE.Vector3());
    let fov = c.baseFov;
    if (opt.mode === 'overview') {
      const B = this.bounds;
      const yaw = this.L.camYaw || 0;
      const asp = this.camera.aspect;
      fov = narrow ? 60 : 48;
      const vh = fov * Math.PI / 360, hh = Math.atan(Math.tan(vh) * asp);
      const pitch = 1.05;
      const half = Math.min(vh, hh);
      const Rr = Math.max(B.w, B.d) / 2 + 1;
      const dist = Rr / Math.sin(half) * 0.92;
      const gy = (this.w.g.minH + this.w.g.maxH) / 2;
      look.set(B.cx, gy, B.cz);
      pos.set(B.cx + Math.sin(yaw) * Math.cos(pitch) * dist, gy + Math.sin(pitch) * dist, B.cz + Math.cos(yaw) * Math.cos(pitch) * dist);
    } else {
      const T = this._target(R, opt);
      if (!T) return { x: 0, y: 0, z: 0 };
      const want = Math.atan2(-T.tx, -T.tz);
      if (!V.init) { V.yaw = want; }
      let d = want - V.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      V.yaw += d * Math.min(1, Math.min(dt, 0.3) * 1.6);
      const dist = narrow ? 9 : 7.5, hgt = narrow ? 8.5 : 6;
      // portret: gledamo malo za frnikole, da so nad kontrolami spodaj
      const ahead = narrow ? -1.6 : 1.4;
      look.set(T.x - Math.sin(V.yaw) * ahead, T.y, T.z - Math.cos(V.yaw) * ahead);
      pos.set(look.x + Math.sin(V.yaw) * dist, T.y + hgt, look.z + Math.cos(V.yaw) * dist);
    }
    if (!V.init) { c.pos.copy(pos); c.look.copy(look); c.vp.set(0, 0, 0); c.vl.set(0, 0, 0); V.init = true; c.fov = fov; }
    // vzmetno sledenje v podkorakih (tudi pri nizkem FPS kamera ne zaostaja)
    const om = opt.mode === 'overview' ? 2.5 : 4;
    for (let rem = Math.min(dt, 0.3); rem > 1e-6; rem -= 0.04) {
      const h = Math.min(rem, 0.04);
      for (const [x, v, tg] of [[c.pos, c.vp, pos], [c.look, c.vl, look]]) {
        v.x += ((tg.x - x.x) * om * om - 2 * om * v.x) * h; v.y += ((tg.y - x.y) * om * om - 2 * om * v.y) * h; v.z += ((tg.z - x.z) * om * om - 2 * om * v.z) * h;
        x.addScaledVector(v, h);
      }
    }
    c.fov += (fov - c.fov) * Math.min(1, dt * 3);
    this.camera.position.copy(c.pos);
    const gcam = groundY(this.w, this.camera.position.x, this.camera.position.z);
    if (Number.isFinite(gcam) && this.camera.position.y < gcam + 1.5) this.camera.position.y = gcam + 1.5;
    if (Math.abs(this.camera.fov - c.fov) > 0.01) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
    this.camera.lookAt(c.look);
    this.camera.updateMatrixWorld();
    return { x: c.look.x, y: c.look.y, z: c.look.z };
  }

  /** Najbližja frnikola zaslonski točki (px glede na platno) ali -1. */
  pick(R, x, y, maxPx = 44) {
    let best = -1, bd = maxPx * maxPx;
    R.M.forEach((m, i) => {
      if (m.st === 'fall') return;
      const p = this.project(m.b.x, m.b.y, m.b.z);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
}
