/* =====================================================================
   IZRISOVALNIK — povezuje statično grafiko, dinamični sloj, WebGL
   post-processing, efekte (iskre, bliski), kamero in svetlobne šove.
   Splošen: vse dobi iz T (miza) in view (grafika mize: art kljuke, točke).
   ===================================================================== */
import { W, H, TAU, QUALITY, QUALITY_ORDER, fmt } from '../config.js';
import { createGL } from './gl.js';
import { Lights } from './lights.js';
import * as BaseArt from './art.js';
import * as S from './scene.js';

const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

export class Renderer {
  /** view: grafika mize (tables/<id>/view.js) — art kljuke povozijo privzeti izris */
  constructor(canvas, T, game, bus, view = {}) {
    this.canvas = canvas;
    this.T = T; this.game = game; this.bus = bus; this.view = view;
    this.PAL = game.PAL;
    this.A = Object.assign({}, BaseArt, view.art || {});
    this.P = Object.assign({ center: [300, 560], start: [300, 600] }, T.points || {});
    this.lights = new Lights(T, this.PAL);
    this.parts = []; this.pops = []; this.flashes = [];
    this.cam = { x: 0, y: 0, vx: 0, vy: 0, zoom: 1, zoomT: 1, zc: [0.5, 0.5], fade: 0, sat: 1, satT: 1, flash: 0 };
    this.slow = { t: 0, k: 1 };
    this.time = 0;
    this.qualityKey = 'high';
    this.q = QUALITY.high;
    this.cssW = 300; this.cssH = 500;
    this.env = BaseArt.makeEnvMap(view.envBlobs);
    this.gl = createGL(canvas);
    this.ctx2d = this.gl ? null : canvas.getContext('2d');
    this.dyn = BaseArt.makeCanvas(2, 2); this.dg = this.dyn.getContext('2d');
    this.emi = BaseArt.makeCanvas(2, 2); this.eg = this.emi.getContext('2d');
    this.perf = { acc: 0, n: 0, auto: true, upgrades: 0, cool: 3 };
    this.emberT = 0;
    // plasti ramp (luči, flipperji in žogice nad sprite-om ramp)
    this.layers = [...new Set([...T.ramps.map(r => r.layer), ...T.lamps.map(l => l.layer || 0), ...T.flippers.map(f => f.layer || 0)])]
      .filter(l => l > 0).sort((a, b) => a - b);
    if (!this.layers.length) this.layers = [1];
    this.debug = null;            // ?debug=1 sloj (engine/debug.js)
    this.listen();
  }

  get usingGL() { return !!this.gl; }

  /* ---------------- kakovost in velikost ---------------- */
  setQuality(key, auto) {
    if (!QUALITY[key]) key = 'high';
    this.qualityKey = key; this.q = QUALITY[key];
    if (auto !== undefined) this.perf.auto = auto;
    this.rebuild();
  }

  resize(cssW, cssH) {
    this.cssW = cssW; this.cssH = cssH;
    this.rebuild();
  }

  rebuild() {
    const q = this.q, A = this.A, T = this.T, PAL = this.PAL;
    const dpr = Math.min(q.dprCap, window.devicePixelRatio || 1);
    const rw = Math.max(120, Math.round(this.cssW * dpr * q.scale));
    const rh = Math.round(rw * H / W);
    this.rw = rw; this.rh = rh;
    this.k = rw / W;
    this.canvas.style.width = this.cssW + 'px';
    this.canvas.style.height = Math.round(this.cssW * H / W) + 'px';
    const mk = (w, h) => BaseArt.makeCanvas(w, h);
    // statični sloji
    const floor = mk(rw, rh), mask = mk(Math.round(rw / 2), Math.round(rh / 2)), raised = mk(rw, rh), emis = mk(rw, rh);
    const set = (c) => { const g = c.getContext('2d'); g.setTransform(c.width / W, 0, 0, c.height / H, 0, 0); return g; };
    A.drawFloor(set(floor), T, PAL);
    A.drawMask(set(mask), T, PAL);
    A.drawRaised(set(raised), T, PAL);
    A.drawEmissive(set(emis), T, PAL);
    this.rampSprite = mk(rw, rh); A.drawRamp(set(this.rampSprite), T, PAL);
    const er = Math.max(0.25, q.emi || 0.25);
    this.emiScale = er;
    this.rampEmi = mk(Math.round(rw * er), Math.round(rh * er)); A.drawRampEmissive(set(this.rampEmi), T, PAL);
    this.dyn.width = rw; this.dyn.height = rh;
    this.emi.width = Math.round(rw * er); this.emi.height = Math.round(rh * er);
    this.static = { floor, mask, raised, emis };
    if (this.gl) {
      this.gl.resize(rw, rh, q.bloom);
      this.gl.uploadStatic(this.static);
    } else {
      this.canvas.width = rw; this.canvas.height = rh;
      // 2D rezerva: zapečena kovina + potisk
      const baked = mk(rw, rh), g = set(baked);
      const gr = g.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, '#59606a'); gr.addColorStop(0.5, '#3c424b'); gr.addColorStop(1, '#2a2f36');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      let s = 3;
      const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 1600; i++) {
        g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)';
        g.lineWidth = 0.6; const y = r() * H, x = r() * W;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + r() * 160, y); g.stroke();
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(floor, 0, 0);
      g.drawImage(raised, 0, 0);
      this.baked = baked;
    }
  }

  /* ---------------- efekti iz dogodkov ---------------- */
  listen() {
    const b = this.bus, P = this.PAL, Q = this.P;
    const on = (n, f) => b.on(n, f);
    // točka efekta: iz podatkov dogodka ali iz T.points
    const pt = (d, k) => (d && d.x !== undefined) ? [d.x, d.y] : (Q[k] || Q.center);
    const fix = k => Q[k] || Q.center;
    on('bumper', d => { this.sparks(d.x, d.y, 10, 360); this.flash(d.x, d.y, 70, 1.1, P.melt); this.shake(2.2); });
    on('sling', d => { this.sparks(d.x, d.y, 6, 280); this.flash(d.x, d.y, 50, 0.8, P.meltHot); this.shake(1.4); });
    on('drop', d => { this.burst(d.x, d.y, P.code, 12, 260); this.flash(d.x, d.y, 50, 0.9, P.code); this.shake(1.5); });
    on('dropsComplete', d => { const [x, y] = pt(d, 'drops'); this.burst(x, y, P.code, 40, 420); this.flash(x, y, 140, 1.3, P.code); });
    on('review', () => { const [x, y] = fix('review'); this.burst(x, y, P.magenta, 14, 260); this.flash(x, y, 60, 1, P.magenta); });
    on('standup', d => { this.burst(d.x, d.y, P.magenta, 10, 220); this.flash(d.x, d.y, 50, 0.9, P.magenta); });
    on('lane', d => { this.burst(d.x, d.y, P.cyan, 10, 200); this.flash(d.x, d.y, 50, 0.8, P.cyan); });
    on('orbit', () => { const [x, y] = fix('orbit'); this.flash(x, y, 90, 1, P.cyan); });
    on('rampMade', d => {
      const [x, y] = pt(d, 'ramp');
      this.flash(x, y, 110, 1.1, P.cyan); this.lights.event('rampMade');
      if (d.combo >= 2) this.popup(x, y - 30, 'RAMPA ×' + d.combo, P.cyan, 14);
    });
    on('scoopEnter', d => { this.sparks(d.x, d.y, 28, 420, true); this.flash(d.x, d.y, 100, 1.4, P.melt); this.shake(3.5); });
    on('scoopEject', d => { this.sparks(d.x, d.y, 16, 360, true); this.shake(2.5); });
    on('jackpot', d => {
      this.burst(d.x, d.y, P.gold, d.wizard ? 30 : 55, 520); this.sparks(d.x, d.y, 24, 520, true);
      this.flash(d.x, d.y, 220, 1.8, P.gold); this.shake(d.wizard ? 5 : 8);
      if (!d.wizard) { this.slowmo(0.7, 0.3); this.zoomTo(1.07, d.x, d.y); }
      this.lights.event('jackpot', d);
    });
    on('superJackpot', d => {
      this.burst(d.x, d.y, P.gold, 90, 650); this.flash(d.x, d.y, 300, 2.2, P.gold); this.shake(12);
      this.slowmo(1.1, 0.25); this.zoomTo(1.12, d.x, d.y); this.lights.event('superJackpot', d);
    });
    on('multiball', () => { const [x, y] = fix('scoop'); this.shake(10); this.lights.event('multiball'); this.flash(x, y, 260, 1.6, P.gold); });
    on('modeStart', d => { const [x, y] = fix('scoop'), c = d.color || P.melt; this.lights.event('modeStart', { color: c }); this.flash(x, y, 180, 1.3, c); });
    on('modeComplete', d => {
      const [x, y] = fix('modes'), c = d.color || P.gold;
      this.lights.event('modeComplete', { color: c }); this.burst(x, y, c, 60, 520);
      this.slowmo(0.6, 0.35); this.zoomTo(1.05, x, y); this.shake(6);
    });
    on('modeFail', () => this.lights.event('drain'));
    on('wizardStart', () => { const [x, y] = fix('center'); this.lights.event('wizardStart'); this.shake(14); this.burst(x, y, P.gold, 120, 700); this.zoomTo(1.08, x, y); });
    on('wizardEnd', () => { const [x, y] = fix('center'); this.lights.event('modeComplete', { color: P.gold }); this.burst(x, y, P.gold, 80, 600); });
    on('lock', () => { const [x, y] = fix('scoop'); this.lights.event('lock'); this.flash(x, y, 140, 1.3, P.code); });
    on('ballLocked', d => { this.lights.event('lock'); this.flash(d.x, d.y, 100, 1.2, P.code); });
    on('magnet', d => { if (d.mode !== 'off') this.flash(d.x, d.y, 70, 0.9, P.cyan); });
    on('post', d => { if (d.up) this.sparks(d.x, d.y, 6, 200); });
    on('captiveHit', d => { this.sparks(d.x, d.y, 8, 300); this.shake(1.5); });
    on('rampFail', d => this.sparks(d.x, d.y, 4, 160));
    on('mystery', () => this.lights.event('mystery'));
    on('combo', d => { this.popup(d.x, d.y - 30, 'COMBO ×' + d.n, P.cyan, 15); this.lights.event('combo', d); });
    on('tilt', () => { this.shake(16); this.lights.event('tilt'); });
    on('tiltWarn', () => this.shake(10));
    on('nudge', d => { this.cam.vx += d.dx * 260; this.cam.vy -= 140; });
    on('launch', d => this.shake(1 + d.power * 2));
    on('drain', () => this.lights.event('drain'));
    on('kickback', d => { this.burst(d.x, d.y, P.code, 24, 420); this.flash(d.x, d.y, 90, 1.3, P.code); this.shake(6); });
    on('wall', d => { if (d.v > 1500) this.sparks(d.x, d.y, 3, 200); });
    on('skill', d => { this.burst(d.x, d.y, P.white, 30, 420); this.lights.event('skill'); this.flash(d.x, d.y, 120, 1.4, P.white); });
    on('extraBall', () => { const [x, y] = fix('scoop'); this.lights.event('extraBall'); this.flash(x, y, 160, 1.3, P.magenta); });
    on('score', d => {
      if (this.pops.length > 14) return;
      const col = d.pts >= 1000000 ? P.gold : d.pts >= 100000 ? P.cyan : '#ffd6a0';
      this.popup(d.x, d.y, '+' + fmt(d.pts), col, d.pts >= 100000 ? 15 : 11);
    });
    on('gameStart', () => { this.cam.zoom = 1.16; this.zoomTo(1, Q.start[0], Q.start[1]); this.cam.satT = 1; this.cam.fade = Math.min(this.cam.fade, 0.4); });
    on('gameOver', () => { this.cam.satT = 0.35; });
    on('endOfBall', () => { this.cam.satT = 0.6; });
    on('serve', () => { this.cam.satT = 1; });
  }

  sparks(x, y, n, sp, molten) {
    n = Math.round(n * this.q.particles);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.35 + Math.random() * 0.9);
      this.parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (molten ? 150 : 0),
        life: 0.3 + Math.random() * (molten ? 0.7 : 0.35), t: 0, size: molten ? 1.8 : 1.3, g: molten ? 900 : 300 });
    }
  }
  burst(x, y, color, n, sp) {
    n = Math.round(n * this.q.particles);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.25 + Math.random());
      this.parts.push({ kind: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.5, t: 0, size: 2 + Math.random() * 2, color, g: 0 });
    }
  }
  popup(x, y, text, color, size = 12) { this.pops.push({ x, y, text, color, size, t: 0, dur: 1.1 }); }
  flash(x, y, r, i, col) {
    this.flashes.push({ x, y, r, i, i0: i, c: hexRGB(col), t: 0 });
    if (this.flashes.length > 7) this.flashes.shift();
  }
  shake(a) {
    const ang = Math.random() * TAU;
    this.cam.vx += Math.cos(ang) * a * 90; this.cam.vy += Math.sin(ang) * a * 90;
  }
  slowmo(dur, k) { this.slow.t = Math.max(this.slow.t, dur); this.slow.k = Math.min(this.slow.k, k); }
  zoomTo(z, x, y) { this.cam.zoomT = z; this.cam.zc = [x / W, 1 - y / H]; if (z > 1) this.zoomHold = 0.7; }

  /** časovni faktor simulacije (slow-motion) */
  timeScale() { return this.slow.t > 0 ? this.slow.k : 1; }

  /* ---------------- posodobitev efektov ---------------- */
  update(dt) {
    this.time += dt;
    const g = this.game;
    if (this.slow.t > 0) { this.slow.t -= dt; if (this.slow.t <= 0) this.slow.k = 1; }
    // kamera: vzmet za tresenje
    const c = this.cam;
    c.vx += -c.x * 420 * dt; c.vy += -c.y * 420 * dt;
    c.vx *= Math.exp(-9 * dt); c.vy *= Math.exp(-9 * dt);
    c.x += c.vx * dt; c.y += c.vy * dt;
    if (this.zoomHold > 0) { this.zoomHold -= dt; if (this.zoomHold <= 0) c.zoomT = 1; }
    c.zoom += (c.zoomT - c.zoom) * Math.min(1, dt * (c.zoomT > c.zoom ? 7 : 2.2));
    c.sat += (c.satT - c.sat) * Math.min(1, dt * 2);
    c.fade += (1 - c.fade) * Math.min(1, dt * 1.5);
    // delci
    for (const p of this.parts) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt;
      const d = p.kind === 'ember' ? 0.98 : 0.93;
      p.vx *= Math.pow(d, dt * 60); if (p.kind !== 'spark') p.vy *= Math.pow(d, dt * 60);
    }
    this.parts = this.parts.filter(p => p.t < p.life);
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter(p => p.t < p.dur);
    for (const f of this.flashes) { f.t += dt; f.i = f.i0 * Math.exp(-f.t * 5); }
    this.flashes = this.flashes.filter(f => f.i > 0.02);
    // žerjavica nad virom toplote (npr. peč)
    const HS = this.T.heat;
    if (HS) {
      this.emberT -= dt * (0.6 + g.heat * 7) * this.q.particles;
      while (this.emberT < 0) {
        this.emberT += 1;
        this.parts.push({ kind: 'ember', x: HS.x + (Math.random() - 0.5) * 30, y: HS.y - 8, vx: (Math.random() - 0.5) * 30,
          vy: -60 - Math.random() * 90, life: 0.8 + Math.random() * 1.2, t: 0, size: 0.9 + Math.random() * 1.2, g: -20 });
      }
    }
    // svetlobni šovi
    g.lamps.__tilted = g.tilted;
    this.lights.update(dt, g.lamps, g.state);
  }

  /* ---------------- izris frame-a ---------------- */
  draw() {
    const { dg, eg, k, game, T, q } = this;
    const time = this.time;
    const useE = q.emi > 0 || !this.gl;
    // dinamični sloj
    dg.setTransform(1, 0, 0, 1, 0, 0);
    dg.clearRect(0, 0, this.dyn.width, this.dyn.height);
    dg.setTransform(k, 0, 0, k, 0, 0);
    const ek = this.emi.width / W;
    eg.setTransform(1, 0, 0, 1, 0, 0);
    eg.clearRect(0, 0, this.emi.width, this.emi.height);
    eg.setTransform(ek, 0, 0, ek, 0, 0);
    const e = useE ? eg : null;

    S.drawLamps(dg, e, T, this.lights, 0);
    S.drawTargets(dg, e, T, time);
    S.drawSpinners(dg, e, T);
    S.drawSlings(dg, e, T);
    S.drawBumpers(dg, e, T, time);
    S.drawElements(dg, e, T, game, this.env, time, this.view);
    if (this.A.drawToys) this.A.drawToys(dg, e, game, this.env, time);
    S.drawPlunger(dg, e, game);
    S.drawFlippers(dg, e, T, game, 0);
    S.drawBalls(dg, e, game.balls, this.env, 0, q, time);
    // rampe nad žogicami na igralni površini, nato plasti ramp (luči, flipperji, žogice)
    dg.setTransform(1, 0, 0, 1, 0, 0);
    dg.drawImage(this.rampSprite, 0, 0);
    dg.setTransform(k, 0, 0, k, 0, 0);
    if (e) { eg.setTransform(1, 0, 0, 1, 0, 0); eg.drawImage(this.rampEmi, 0, 0, this.emi.width, this.emi.height); eg.setTransform(ek, 0, 0, ek, 0, 0); }
    for (const L of this.layers) {
      S.drawLamps(dg, e, T, this.lights, L);
      S.drawFlippers(dg, e, T, game, L);
      S.drawBalls(dg, e, game.balls, this.env, L, q, time);
    }
    S.drawParticles(dg, e, this.parts);
    S.drawPopups(dg, e, this.pops);
    if (this.debug) this.debug.draw(dg);

    const c = this.cam;
    const shake = [c.x / W * 0.9, -c.y / H * 0.9];
    if (this.gl) {
      this.gl.uploadDynamic(this.dyn, this.emi);
      const ballsX = game.balls.length ? game.balls.reduce((a, b) => a + b.x, 0) / game.balls.length : 300;
      const fl = this.flashes.slice(), HS = T.heat;
      if (HS) fl.push({ x: HS.x, y: HS.y, r: 60, i: 0.35 + game.heat * 0.8 + 0.08 * Math.sin(time * 6), c: [1, 0.45, 0.1] });
      this.gl.frame({
        time, gi: this.lights.gi, heat: game.heat, emiK: 1,
        parFloor: [-c.x / W * 0.35, -c.y / H * 0.35], parTop: [0, 0],
        specX: 300 + 150 * Math.sin(time * 0.17) + (ballsX - 300) * 0.3 + c.x * 3,
        balls: game.balls.filter(b => !b.captured), flashes: fl,
        bloomThr: 0.8, bloomK: q.bloom ? 0.7 : 0,
        zoom: c.zoom, zc: c.zc, shake, fade: c.fade, sat: c.sat,
        ca: q.ca ? 0.002 + Math.min(0.008, Math.hypot(c.vx, c.vy) / 60000) : 0,
        heatAmt: q.heat && HS ? 0.6 + game.heat * 1.4 : 0, heatPos: HS ? [HS.x, HS.y - 30] : [300, 300],
        persp: 0.05, flash: Math.min(0.25, this.flashes.reduce((a, f) => a + (f.r > 200 ? f.i * 0.06 : 0), 0)),
      });
    } else {
      const x = this.ctx2d;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.fillStyle = '#05070b'; x.fillRect(0, 0, this.rw, this.rh);
      x.save();
      x.translate(c.x * k * 0.9, c.y * k * 0.9);
      x.globalAlpha = c.fade;
      x.drawImage(this.baked, 0, 0);
      x.drawImage(this.dyn, 0, 0);
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = 0.6 * this.lights.gi * c.fade;
      x.drawImage(this.static.emis, 0, 0);
      x.globalAlpha = 0.8 * c.fade;
      x.drawImage(this.emi, 0, 0, this.rw, this.rh);
      x.restore();
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    }
  }

  /* ---------------- samodejna kakovost ---------------- */
  measure(frameDt) {
    const p = this.perf;
    if (!p.auto) return;
    p.cool -= frameDt;
    if (p.cool > 0) return;
    p.acc += frameDt; p.n++;
    if (p.n < 90) return;
    const avg = p.acc / p.n * 1000;
    p.acc = 0; p.n = 0;
    const i = QUALITY_ORDER.indexOf(this.qualityKey);
    // preverjanje po znižanju: če ni pomagalo, je zaslon/brskalnik omejen (npr. 30 Hz) — vrni nazaj
    if (p.test) {
      const t = p.test; p.test = null;
      if (avg > t.avg * 0.87) {
        p.auto = false;
        this.setQuality(t.key); p.cool = 2;
        this.bus.emit('quality', { key: this.qualityKey, auto: true, avg, reverted: true });
        return;
      }
    }
    if (avg > 21 && i > 0) {
      p.test = { key: this.qualityKey, avg };
      this.setQuality(QUALITY_ORDER[i - 1]); p.cool = 2;
      this.bus.emit('quality', { key: this.qualityKey, auto: true, avg });
    } else if (avg < 12.5 && i < QUALITY_ORDER.length - 1 && p.upgrades < 1 && (window.devicePixelRatio || 1) > 1.4) {
      p.upgrades++;
      this.setQuality(QUALITY_ORDER[i + 1]); p.cool = 3;
      this.bus.emit('quality', { key: this.qualityKey, auto: true, avg });
    }
  }
}
