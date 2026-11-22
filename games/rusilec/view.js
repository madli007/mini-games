/* =====================================================================
   RUŠILEC — view.js: izris arene z več kroglami.
   Podrazred Renderer iz ../krogla/render.js: isti materiali, nebo, lokacije,
   hrček in krogla. Dodano: več krogel (barvni obroč, ime, puščica za svojo),
   fiksna tričetrtinska kamera, ki pokaže celo areno, pobiralke, duhovi, krone.
   ===================================================================== */
import * as THREE from 'three';
import { Renderer, DEFAULT_SKIN } from '../krogla/render.js';
import { makeBall, animateRider } from '../krogla/render/ball.js';
import { surface, contactShadow, softDot } from '../krogla/render/textures.js';
import { FADE } from '../krogla/render/materials.js';
import { groundY, fallTileState } from '../krogla/physics.js';
import { arenaBounds } from './arena.js';
import { PICKUPS } from './match.js';

/** Sprite z besedilom/emojijem (canvas). */
function labelSprite(text, { color = '#ffffff', bg = 'rgba(8,10,24,.62)', font = 'bold 30px system-ui, sans-serif', w = 256, h = 64, scale = [1.6, 0.4] } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (bg) {
    const tw = Math.min(w - 4, g.measureText(text).width + 26);
    g.fillStyle = bg; g.beginPath(); g.roundRect((w - tw) / 2, 6, tw, h - 12, (h - 12) / 2); g.fill();
  }
  g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  sp.scale.set(scale[0], scale[1], 1);
  sp.renderOrder = 20;
  return sp;
}
const emojiSprite = (e, s = 0.55) => labelSprite(e, { bg: null, font: '52px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif', w: 64, h: 64, scale: [s, s] });

export class ArenaRenderer extends Renderer {
  constructor(canvas, opts) {
    super(canvas, { ...opts, dof: false });
    this.slots = [];
    this.vis = [];
    this.pk = new Map();
    this.ghostCur = new Map();
    this.view = { yaw: 0, t: 0 };
  }

  /**
   * Igralci za izris: [{ color, name, skin, me, team }] (indeks = indeks v rundi).
   * @param {Object[]} slots
   */
  setSlots(slots) {
    this.slots = slots;
    if (this.L) this._buildBalls();
  }

  load(L, world, skin = DEFAULT_SKIN, opts = {}) {
    super.load(L, world, skin, { ...opts, menu: false });
    this.cam.intro = null;
    this.ball.visible = false; this.blob.visible = false;
    if (this.caustic) this.caustic.visible = false;
    if (this.trail) { this.trail.mesh.visible = false; }
    if (this.objects.goal) this.objects.goal.g.visible = false;
    this.bounds = arenaBounds(L);
    // padajoče ploščice (rob arene) naj izgledajo kot tla; ob krušenju zažarijo rdeče
    const s = surface(this.look.floor);
    const floorC = new THREE.Color(L.theme?.floor || '#c8c0b0');
    for (const fm of this.terrain.fallMeshes) {
      const m = fm.material;
      m.map = s.map; m.normalMap = s.normalMap; m.color.copy(floorC).lerp(new THREE.Color('#ffffff'), 0.15);
      m.clearcoat = 0.2; m.roughness = 0.7; m.opacity = 1; m.transparent = false; m.emissive.set('#000000'); m.emissiveIntensity = 0;
      m.needsUpdate = true;
    }
    // senčna kamera pokrije celo areno
    if (this.q.shadows) {
      const sc = this.sun.shadow.camera, r = this.bounds.r + 3;
      sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.updateProjectionMatrix();
    }
    this.pk.clear(); this.ghostCur.clear();
    this.view.yaw = L.camYaw || 0;
    this._buildBalls();
  }

  _disposeVis() {
    for (const v of this.vis) {
      for (const o of [v.root, v.ring, v.blob, v.label, v.arrow, v.crown, v.icon, v.halo]) {
        if (!o) continue;
        o.parent?.remove(o);
        o.traverse?.(x => { x.geometry?.dispose(); if (x.material) { x.material.map?.dispose(); x.material.dispose(); } });
      }
    }
    this.vis = [];
  }

  _buildBalls() {
    this._disposeVis();
    const R = this.w?.R || 0.32;
    const lowQ = this.qualityKey === 'low' || this.qualityKey === 'medium';
    const shadowTex = contactShadow();
    this.vis = this.slots.map(sl => {
      const q = sl.me || !lowQ ? this.q : { ...this.q, furShells: Math.min(3, this.q.furShells), glass: 'fake' };
      const root = makeBall(sl.skin || DEFAULT_SKIN, R, q);
      this.level.add(root);
      const col = new THREE.Color(sl.color);
      const ring = new THREE.Mesh(new THREE.RingGeometry(R * 1.12, R * 1.5, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), transparent: true, opacity: 0.9, depthWrite: false }));
      ring.renderOrder = 2; this.level.add(ring);
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: shadowTex, transparent: true, depthWrite: false, opacity: 0.6 }));
      blob.renderOrder = 1; this.level.add(blob);
      const label = labelSprite(sl.name || '?', { color: sl.color, scale: [1.5, 0.375] });
      this.level.add(label);
      let arrow = null;
      if (sl.me) {
        arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.8) }));
        arrow.renderOrder = 21; this.level.add(arrow);
      }
      const crown = emojiSprite('👑', 0.5); crown.visible = false; this.level.add(crown);
      const icon = emojiSprite('⭐', 0.42); icon.visible = false; this.level.add(icon);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.25, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false }));
      halo.visible = false; this.level.add(halo);
      return { root, ring, blob, label, arrow, crown, icon, halo, iconK: null, sl };
    });
  }

  /** Učinek sunka: val iskric. */
  dashFx(x, y, z, color) {
    if (!this.fx) return;
    for (let k = 0; k < 2; k++) this.fx.spark(x, y, z, color, 18, 3.6 + k, 0.35, 2.4);
  }
  /** Trk krogel: iskre in »bonk« (moč glede na hitrost). */
  hitFx(x, y, z, v) {
    if (!this.fx) return;
    this.fx.spark(x, y, z, '#ffe08a', Math.min(30, 6 + v * 2.2), 2 + v * 0.25, 0.45, 2.8);
    if (!this.reduced && this.opts.shake && v > 6) this.cam.shake = Math.max(this.cam.shake, Math.min(0.22, v * 0.02));
  }
  /** Izriv: oblak in iskre na mestu padca. */
  fallFx(x, z, color) {
    if (!this.fx) return;
    const y = (Number.isFinite(groundY(this.w, x, z)) ? groundY(this.w, x, z) : this.w.g.minH) - 0.6;
    this.fx.spark(x, y, z, color, 34, 4.5, 0.9, 3);
    this.fx.puff(x, y, z, '#ffffff', 12, 1.6, 0.8, 0.4);
  }
  /** Val vetra (duh). */
  gustFx(x, z, dx, dz) {
    if (!this.fx) return;
    const y = (groundY(this.w, x, z) || 0) + 0.3;
    for (let k = 0; k < 10; k++) this.fx.puff(x - dx * k * 0.12, y, z - dz * k * 0.12, '#dff4ff', 2, 1.8, 0.7, -0.5);
  }

  /** Pobiralke: [{ n, k, x, z, t0 }] (t = čas runde). */
  _pickups(list, t, dt) {
    const seen = new Set();
    for (const pk of list || []) {
      seen.add(pk.n);
      let o = this.pk.get(pk.n);
      if (!o) {
        const g = new THREE.Group();
        const ic = emojiSprite(PICKUPS[pk.k]?.icon || '❓', 0.62);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd23f').multiplyScalar(1.8), transparent: true, depthWrite: false }));
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3, 20, 1, true).translate(0, 1.5, 0), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
        g.add(ic, ring, beam);
        const gy = groundY(this.w, pk.x, pk.z);
        g.position.set(pk.x, (Number.isFinite(gy) ? gy : 0) + 0.02, pk.z);
        this.level.add(g);
        o = { g, ic, ring, beam, t0: pk.t0 };
        this.pk.set(pk.n, o);
        this.fx?.spark(pk.x, g.position.y + 0.4, pk.z, '#ffd23f', 14, 2, 0.5, 2.4);
      }
      const age = t - o.t0;
      const armed = age >= 1;
      o.ic.position.y = 0.55 + Math.sin(t * 3) * 0.06;
      o.ic.material.opacity = armed ? 1 : 0.35 + 0.3 * Math.sin(age * 20);
      const s = armed ? 1 + 0.08 * Math.sin(t * 5) : 2.2 - age * 1.2;
      o.ring.scale.setScalar(s);
      o.beam.material.opacity = armed ? 0.12 : 0.3;
    }
    for (const [n, o] of this.pk) {
      if (seen.has(n)) continue;
      this.fx?.spark(o.g.position.x, o.g.position.y + 0.5, o.g.position.z, '#ffffff', 20, 2.6, 0.6, 2.6);
      this.level.remove(o.g);
      o.g.traverse(x => { x.geometry?.dispose(); if (x.material) { x.material.map?.dispose(); x.material.dispose(); } });
      this.pk.delete(n);
    }
  }

  /** Kazalci duhov (Zadnji na plošči): [{ i, x, z }]. */
  _ghosts(list) {
    const seen = new Set();
    for (const g of list || []) {
      seen.add(g.i);
      let o = this.ghostCur.get(g.i);
      if (!o) {
        o = emojiSprite('👻', 0.7);
        this.level.add(o); this.ghostCur.set(g.i, o);
      }
      const gy = groundY(this.w, g.x, g.z);
      o.position.set(g.x, (Number.isFinite(gy) ? gy : 0) + 0.9 + Math.sin(this.vt * 3 + g.i) * 0.08, g.z);
      o.material.opacity = g.ready ? 0.95 : 0.4;
    }
    for (const [i, o] of this.ghostCur) if (!seen.has(i)) { this.level.remove(o); o.material.map.dispose(); o.material.dispose(); this.ghostCur.delete(i); }
  }

  /**
   * Izriši sličico.
   * @param {Object} w svet (čas, ploščice, ovire)
   * @param {Object[]} balls stanje krogel po indeksih (x, y, z, vx, vz, yaw, st, inv, crown, weight, bumper, magnet, ice, grounded)
   * @param {number} dt
   * @param {{pickups?:Object[], ghosts?:Object[], shift?:number}} [opt]
   */
  renderArena(w, balls, dt, opt = {}) {
    if (this.lost || !this.L) return;
    this.gl.info.reset();
    const t = w.t;
    const ts = this.slow > 0 ? 0.35 : 1;
    this.slow = Math.max(0, this.slow - dt);
    const vdt = dt * ts;
    this.vt += vdt;
    this.objects.update(w, t, dt, { near: () => false });
    for (const tx of this.terrain.convTex) tx.offset.y = (t * 2.4) % 1;
    for (const fm of this.terrain.fallMeshes) {
      const st = fallTileState(w, fm.userData.i);
      const b = fm.userData.base;
      const sh = st.shake * 0.07 * (this.reduced ? 0.4 : 1);
      fm.position.set(b.x + Math.sin(t * 60) * sh, b.y - st.drop, b.z + Math.cos(t * 53) * sh);
      const hot = st.shake > 0 || st.drop > 0;
      fm.material.emissive.set(hot ? '#ff3b2f' : '#000000');
      fm.material.emissiveIntensity = st.shake > 0 ? 0.3 + st.shake * 1.1 : st.drop > 0 ? 0.6 : 0;
      fm.userData.crack.material.opacity = st.shake > 0 ? 0.3 + st.shake * 0.7 : st.drop > 0 ? 1 : 0;
      fm.visible = st.drop < 9;
    }
    const R = w.R;
    balls.forEach((s, i) => {
      const v = this.vis[i];
      if (!v) return;
      const show = s && s.st !== 'out' && !(s.st === 'dead' && s.y < w.killY + 1);
      for (const o of [v.root, v.ring, v.blob, v.label, v.arrow]) if (o) o.visible = !!show;
      v.crown.visible = v.icon.visible = v.halo.visible = false;
      if (!show) return;
      // neranljiva: prosojno utripanje (zmanjšano gibanje: le sij)
      let vis = true;
      if (s.inv && !this.reduced) vis = Math.floor(this.vt * 12) % 2 === 0;
      this._ball(v.root, s, s, dt, s.st === 'dead');
      v.root.visible = vis;
      v.halo.visible = !!s.inv;
      v.halo.position.set(s.x, s.y, s.z);
      const r = v.root.userData.rider;
      if (r) animateRider(r, { sp: Math.hypot(s.vx, s.vz), yaw: s.yaw || 0, dt, t: this.vt, falling: s.st === 'dead' || s.vy < -4, dead: s.st === 'dead', finished: false, reduced: this.reduced });
      const gy = groundY(w, s.x, s.z, s.y - R + 0.05);
      const onG = Number.isFinite(gy) && s.st !== 'dead';
      const hgt = onG ? Math.max(0, s.y - R - gy) : 0;
      v.ring.visible = v.blob.visible = onG;
      if (onG) {
        v.ring.position.set(s.x, gy + 0.03, s.z);
        v.ring.material.opacity = Math.max(0.2, 0.9 - hgt * 0.4);
        const k = 1 + (s.weight ? 0.25 : 0) + (s.dash ? 0.2 : 0);
        v.ring.scale.setScalar(k);
        v.blob.position.set(s.x, gy + 0.012, s.z);
        const bs = R * 2.3 * (1 + hgt * 0.35);
        v.blob.scale.set(bs, 1, bs);
        v.blob.material.opacity = Math.max(0.12, 0.6 - hgt * 0.2);
      }
      v.label.position.set(s.x, s.y + R + 0.42, s.z);
      if (v.arrow) { v.arrow.position.set(s.x, s.y + R + 0.85 + (this.reduced ? 0 : Math.sin(this.vt * 5) * 0.06), s.z); v.arrow.rotation.y = this.vt * 2; }
      if (s.crown) { v.crown.visible = true; v.crown.position.set(s.x, s.y + R + (v.arrow ? 1.25 : 0.85), s.z); }
      const k = s.weight ? 'weight' : s.bumper ? 'bumper' : s.magnet ? 'magnet' : s.ice ? 'freeze' : null;
      if (k) {
        if (v.iconK !== k) {
          v.iconK = k;
          this.level.remove(v.icon); v.icon.material.map.dispose(); v.icon.material.dispose();
          v.icon = emojiSprite(PICKUPS[k].icon, 0.42); this.level.add(v.icon);
        }
        v.icon.visible = true;
        v.icon.position.set(s.x + 0.42, s.y + R + 0.2, s.z);
      }
      // sled pri visoki hitrosti
      const sp = Math.hypot(s.vx, s.vz);
      if (sp > 8.5 && this.fx && Math.random() < 0.6) this.fx.puff(s.x, s.y - R * 0.5, s.z, v.sl.color, 1, 0.3, 0.35, -0.3);
    });
    this._pickups(opt.pickups, t, dt);
    this._ghosts(opt.ghosts);
    this._arenaCamera(dt, opt);
    this.fx.update(vdt);
    this.decor.update(this.vt, this.camera);
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.uTime.value = this.vt;
    if (this.q.shadows) this._shadowFollow({ x: this.bounds.cx, y: this.w.g.maxH + 1, z: this.bounds.cz + 2 });
    FADE.uFadeR.value = 0;
    if (this.post.composer) this.post.render(dt, 0.5, 0);
    else this.gl.render(this.scene, this.camera);
  }

  /** Fiksna (rahlo plavajoča) tričetrtinska kamera, ki pokaže celo areno na vsakem razmerju zaslona. */
  _arenaCamera(dt, opt) {
    const B = this.bounds, c = this.cam;
    const yaw = (this.L.camYaw || 0) + (this.reduced ? 0 : Math.sin(this.vt * 0.07) * 0.05);
    this.view.yaw = yaw;
    const asp = this.camera.aspect;
    const fov = asp < 0.8 ? 56 : 46;
    const pitch = asp < 0.8 ? 1.12 : 0.92;   // rad pod vodoravnico (portret: bolj od zgoraj)
    const vh = fov * Math.PI / 360, hh = Math.atan(Math.tan(vh) * asp);
    // polmer arene (z robom); prostor za HUD
    const Rr = Math.max(B.w, B.d) / 2 + 0.6;
    const half = Math.min(vh, hh);
    const dist = Rr / Math.sin(half) * (asp < 0.8 ? 0.98 : 0.9);
    const gy = (this.w.g.minH + this.w.g.maxH) / 2;
    const shift = opt.shift || 0;   // portret: arena višje (kontrole spodaj)
    const lx = B.cx + Math.sin(yaw) * shift * Rr, lz = B.cz + Math.cos(yaw) * shift * Rr;
    const px = lx + Math.sin(yaw) * Math.cos(pitch) * dist, pz = lz + Math.cos(yaw) * Math.cos(pitch) * dist;
    const py = gy + Math.sin(pitch) * dist;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.position.set(px, py, pz);
    if (c.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * c.shake;
      this.camera.position.y += (Math.random() - 0.5) * c.shake;
      c.shake = Math.max(0, c.shake - dt * 1.5);
    }
    this.camera.lookAt(lx, gy, lz);
    this.camera.updateMatrixWorld();
  }
}
