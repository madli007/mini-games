/* =====================================================================
   HRČKOVA KROGLA — editor/preview3d.js: 3D predogled proge (obstoječi Renderer,
   orbit kamera prek renderer.debugCam) in testna vožnja s pravo fiziko in vhodom.
   ===================================================================== */
import * as THREE from 'three';
import { Renderer, DEFAULT_SKIN } from '../render.js';
import { createWorld, step, STEP } from '../physics.js';
import { Input } from '../input.js';
import { Recorder } from '../ghost.js';
import { heightOf } from '../level.js';

const clone = o => JSON.parse(JSON.stringify(o));

function groundY(L, x, z) {
  const c = Math.floor(x), r = Math.floor(z);
  const ch = L.hmap?.[r]?.[c];
  return ch ? heightOf(ch) || 0 : 0;
}

export class Preview {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{quality?:string, skin?:Object, onDriveEnd?:Function, hud?:Object}} o
   */
  constructor(canvas, { quality = 'medium', skin = DEFAULT_SKIN, onLost = null } = {}) {
    this.canvas = canvas;
    this.skin = skin;
    this.renderer = new Renderer(canvas, { quality, post: quality !== 'low', dof: false, shake: true, onLost });
    this.orbit = { yaw: 0.5, pitch: 0.85, dist: 22, target: new THREE.Vector3(), init: false };
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.renderer.debugCam = this.cam;
    this.L = null; this.world = null;
    this.visible = true;
    this.drive = null;
    this._t = 0;
    this._pending = null;
    this._bindOrbit();
    this._last = performance.now();
    const loop = now => { requestAnimationFrame(loop); this._frame(now); };
    requestAnimationFrame(loop);
  }

  /** Naloži progo z zamikom (debounce), da je urejanje tekoče. */
  setLevel(L, { delay = 300, focus = false } = {}) {
    clearTimeout(this._pending);
    const go = () => {
      if (this.drive) { this._queued = L; return; }
      this._load(L, focus);
    };
    if (delay <= 0) go(); else this._pending = setTimeout(go, delay);
  }

  _load(L, focus) {
    try {
      this.L = clone(L);
      this.world = createWorld(this.L);
      this.renderer.load(this.L, this.world, this.skin, { menu: true, keepCamera: true });
      this.renderer.resize();
      if (focus || !this.orbit.init) this.frameAll();
      this.error = null;
    } catch (e) {
      // nedokončana proga (npr. med urejanjem) ne sme podreti urejevalnika
      console.warn('[urejevalnik] 3D predogled', e);
      this.error = e;
    }
  }

  /** Kamera na celo progo. */
  frameAll() {
    if (!this.L) return;
    const [W, D] = this.L.size;
    this.orbit.target.set(W / 2, 0, D / 2);
    this.orbit.dist = Math.max(10, Math.max(W, D) * 1.05);
    this.orbit.yaw = this.L.camYaw || 0; this.orbit.pitch = 0.95;
    this.orbit.init = true;
  }

  /** Orbit okoli točke (x, z). */
  focus(x, z, dist = null) {
    if (!this.L) return;
    this.orbit.target.set(x, groundY(this.L, x, z), z);
    if (dist) this.orbit.dist = dist;
    this.orbit.init = true;
  }

  _bindOrbit() {
    const cv = this.canvas, o = this.orbit;
    const pts = new Map();
    let mode = null, lx = 0, ly = 0, pd = 0;
    cv.addEventListener('contextmenu', e => { if (!this.drive) e.preventDefault(); });
    cv.addEventListener('pointerdown', e => {
      if (this.drive) return;
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pd = Math.hypot(a[0] - b[0], a[1] - b[1]); mode = 'pinch'; return; }
      mode = e.button === 2 || e.shiftKey || e.button === 1 ? 'pan' : 'rot';
      lx = e.clientX; ly = e.clientY;
    });
    cv.addEventListener('pointermove', e => {
      if (this.drive || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (mode === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pd > 10) o.dist = Math.max(3, Math.min(160, o.dist * pd / d));
        pd = d; return;
      }
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (mode === 'rot') { o.yaw -= dx * 0.008; o.pitch = Math.max(0.12, Math.min(1.5, o.pitch + dy * 0.006)); }
      else if (mode === 'pan') {
        const k = o.dist * 0.0018;
        const cx = Math.cos(o.yaw), sx = Math.sin(o.yaw);
        o.target.x -= (dx * cx + dy * sx) * k; o.target.z -= (-dx * sx + dy * cx) * k;
      }
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2 && mode === 'pinch') mode = null; if (!pts.size) mode = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { if (this.drive) return; e.preventDefault(); o.dist = Math.max(3, Math.min(160, o.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  }

  _orbitCam() {
    const o = this.orbit;
    const cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
    this.cam.look.copy(o.target);
    this.cam.pos.set(o.target.x + Math.sin(o.yaw) * cp * o.dist, o.target.y + sp * o.dist, o.target.z + Math.cos(o.yaw) * cp * o.dist);
  }

  resize() { this.renderer.resize(); }

  _frame(now) {
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    if (document.hidden) return;
    if (this.drive) { this._driveFrame(dt); return; }
    if (!this.visible || !this.world || this.error) return;
    // predogled: objekti se premikajo (fizika teče brez vhoda)
    const w = this.world;
    this._acc = (this._acc || 0) + dt;
    let n = 0;
    while (this._acc >= STEP && n < 20) { w.events.length = 0; step(w, 0, 0); this._acc -= STEP; n++; }
    if (n >= 20) this._acc = 0;
    if (w.t > 600) this.world = createWorld(this.L);
    this._orbitCam();
    try {
      this.renderer.render(this.world, { x: w.ball.x, y: w.ball.y, z: w.ball.z }, dt, { menu: true, rotate: false });
    } catch (e) { console.warn('[urejevalnik] izris', e); this.error = e; }
  }

  /* ------------------------------------------------------------ testna vožnja */

  /**
   * Začni testno vožnjo.
   * @param {Object} L proga
   * @param {{from?:number[]|null, host:HTMLElement, stickEl, knobEl, onUpdate:Function, onEnd:Function}} o
   */
  startDrive(L, { from = null, host, stickEl, knobEl, onUpdate, onEnd }) {
    if (!this.input) this.input = new Input(host, { stickEl, knobEl });
    const PL = clone(L);
    PL.pickups = (PL.pickups || []).filter(p => p.t !== 'clock');
    if (from) PL.start = [from[0], from[1]];
    const world = createWorld(PL);
    this._prevParent = this.canvas.parentElement;
    this._prevNext = this.canvas.nextSibling;
    host.prepend(this.canvas);
    this.renderer.debugCam = null;
    this.renderer.load(PL, world, this.skin);
    this.renderer.skipIntro();
    this.renderer.resize();
    this.input.enabled = true;
    this.input.keys.clear();
    this.drive = { L: PL, world, from, acc: 0, prev: { x: world.ball.x, y: world.ball.y, z: world.ball.z }, onUpdate, onEnd, done: false, rec: new Recorder(), state: 'run' };
    this.drive.rec.sample(0, world.ball);
  }

  restartDrive() {
    const d = this.drive;
    if (!d) return;
    const world = createWorld(d.L);
    this.renderer.load(d.L, world, this.skin);
    this.renderer.skipIntro();
    Object.assign(d, { world, acc: 0, prev: { x: world.ball.x, y: world.ball.y, z: world.ball.z }, done: false, rec: new Recorder(), state: 'run' });
    d.rec.sample(0, world.ball);
  }

  stopDrive() {
    const d = this.drive;
    if (!d) return;
    this.drive = null;
    this.input.enabled = false;
    this.input.keys.clear();
    if (this._prevParent) this._prevParent.insertBefore(this.canvas, this._prevNext);
    this.renderer.debugCam = this.cam;
    const L = this._queued || this.L;
    this._queued = null;
    if (L) this._load(L, false);
    this.renderer.resize();
  }

  _driveFrame(dt) {
    const d = this.drive, w = d.world, r = this.renderer;
    if (d.state === 'run') {
      d.acc += dt;
      let n = 0;
      while (d.acc >= STEP && n < 30 && !w.finished) {
        d.prev = { x: w.ball.x, y: w.ball.y, z: w.ball.z };
        const [ix, iz] = this.input.world(r.cam.yaw);
        w.events.length = 0;
        step(w, ix, iz);
        d.rec.sample(w.t, w.ball);
        for (const e of w.events) {
          if (e.type === 'star') r.burst(w.ball.x, w.ball.y, w.ball.z, '#ffd23f', 18);
          if (e.type === 'goal') { r.celebrate(w.ball.x, w.ball.y, w.ball.z); d.state = 'done'; }
        }
        d.acc -= STEP; n++;
      }
      if (n >= 30) d.acc = 0;
      if (d.state === 'done' && !d.done) { d.done = true; d.onEnd?.({ time: w.finishT, falls: w.falls, stars: w.stars, fromStart: !d.from, frames: d.rec.frames }); }
    }
    const a = d.state === 'run' ? Math.min(1, d.acc / STEP) : 1, b = w.ball, pb = d.prev;
    const bp = { x: pb.x + (b.x - pb.x) * a, y: pb.y + (b.y - pb.y) * a, z: pb.z + (b.z - pb.z) * a };
    r.render(w, bp, d.state === 'pause' ? 0 : dt, { rotate: true });
    const sp = r.project(bp.x, bp.y, bp.z);
    this.input.setBall(sp.x, sp.y);
    d.onUpdate?.({ t: w.t, falls: w.falls, stars: w.stars, finished: w.finished });
  }
}
