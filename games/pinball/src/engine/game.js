/* =====================================================================
   JEDRO IGRE — vse, kar je enako na vsaki mizi
   žogice, izstrelitev in plunger, flipperji, tilt z opozorili, ball save,
   drain, ball search, bonus ob koncu žogice in bonus X, multiball
   infrastruktura (več žogic, add-a-ball, vidni lock), točkovanje in popupi,
   sporočila na DMD, combo okno in štetje strelov, extra ball, match, konec igre.
   Brez DOM-a: teče enako v igri, v testih in v botu.

   Pravila mize (tables/<id>/rules.js) so vtičnik — razred, ki razširi Rules
   (spodaj) in dobi kljuke: init, onSwitch, onShot, onDrain, onBallStart,
   onBallEnd, onLastBall, onFlipper, onTilt, tick, substep, ballTick, lamps,
   dmdIdle, summary, gameStats, isMulti.
   ===================================================================== */
import { BR, STEP, H, PHYS, DEFAULT_PAL, fmt } from './config.js';
import { createPhysics } from './physics.js';

export { fmt };

// privzeta sporočila jedra (miza jih povozi v CFG.sporocila)
const MSG = {
  start: ['NOVA IGRA', 'srečno!', 'code', 1.6],
  ball1: ['ŽOGA 1', null, 'cyan', 3],
  ballN: ['ŽOGA {n}', '', 'cyan', 1.8],
  shootAgain: ['ŠE ENA ŽOGA', 'shoot again', 'magenta', 2],
  ballSave: ['BALL SAVE', 'še enkrat!', 'cyan', 1.8],
  ballSearch: ['BALL SEARCH', 'sproščam žogico', 'cyan', 1.4],
  tilt: ['TILT', 'flipperji izklopljeni', 'red', 3],
  tiltWarn: ['POZOR', 'opozorilo {n}/2', 'red', 1.2],
};

/* =====================================================================
   Osnovna pravila — miza jih razširi. Privzeto: vsako stikalo da točke
   in odda dogodek z imenom stikala; stikala, ki pripadajo strelu (T.shots),
   sprožijo game.shot() → onShot().
   ===================================================================== */
export class Rules {
  constructor(game) { this.g = game; }
  init() {}
  resetGame() {}
  resetBall() {}
  /** stikalo (senzor, tarča, bumper, sling, spinner, saucer …) */
  onSwitch(name, d = {}) {
    const g = this.g, x = d.x ?? (d.s && d.s.x) ?? (d.c && d.c.x), y = d.y ?? (d.s && d.s.y) ?? (d.c && d.c.y);
    const pts = { bumper: 1000, sling: 110, drop: 5000, spinner: 150, lane: 1000, inlane: 1000, outlane: 5000 }[name] ?? 2500;
    g.addScore(pts, x, y, Math.round(pts / 5));
    if (d.saucer) g.after(1, () => g.ejectSaucer(d.saucer, d.b));
    g.emit(name === 'spinner' ? 'spin' : name, Object.assign({ x, y }, d.c ? { i: d.c.i } : {}, d.s && d.s.data ? { side: d.s.data.side } : {}));
    const sh = g.T.shotBySwitch[name];
    if (sh) g.shot(sh.id, sh.x, sh.y);
    if (name === 'drop' || name === 'dropBank') return;
  }
  onShot() {}
  onRamp() {}
  onDrain() {}
  onBallStart() {}
  onBallEnd() {}
  onLastBall() {}
  onFlipper() {}
  onTilt() {}
  tick() {}
  substep() {}
  ballTick() {}
  lamps() {}
  dmdIdle() { return null; }
  isMulti() { return this.g.balls.length + this.g.pending > 1; }
  abort() {}
  summary() { return {}; }
  gameStats() { return {}; }
}

export class Game {
  /**
   * @param T miza (tables/<id>/table.js → buildTable())
   * @param bus dogodkovni vodilo
   * @param table modul mize: { CFG, PAL, Rules }
   */
  constructor(T, bus, table = {}) {
    this.T = T;
    this.bus = bus || { emit() {} };
    this.table = table;
    this.cfg = Object.assign({ steviloZogic: 3, ballSaveSek: 10, comboOkno: 4 }, table.CFG || {});
    this.PAL = Object.assign({}, DEFAULT_PAL, table.PAL || {});
    this.msgs = Object.assign({}, MSG, this.cfg.sporocila || {});
    this.phys = createPhysics(T, this);
    this.time = 0;
    this.nextId = 1;
    this.state = 'attract';          // attract | play | bonus | over
    this.balls = [];
    this.timers = [];
    this.lamps = {};
    this.plungerPull = 0;
    this.plungerHeld = false;
    this.paused = false;
    this.launchHint = '';
    const R = table.Rules || Rules;
    this.rules = new R(this);
    this.rules.init(this);
    this.resetGame();
    this.computeLamps();
  }

  /* ------------------------------------------------------------------ */
  emit(name, data) { this.bus.emit(name, data); }
  say(text, sub = '', color = this.PAL.melt, o = {}) {
    this.emit('msg', Object.assign({ text, sub, color, dur: 2 }, o));
  }
  /** sporočilo jedra po ključu (CFG.sporocila povozi privzeto) */
  sayKey(key, vars = {}, o = {}) {
    const m = this.msgs[key];
    if (!m) return;
    const sub = (s) => s == null ? s : String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    const [text, subText, col, dur, extra] = m;
    this.say(sub(text), sub(subText ?? vars.sub ?? ''), this.PAL[col] || col, Object.assign({ dur }, extra || {}, o));
  }
  after(delay, fn) { this.timers.push({ t: delay, fn }); }
  spawnLater(delay, fn) {
    this.pending++;
    this.after(delay, () => { this.pending--; fn(); });
  }
  get live() { return this.balls.length + this.pending; }
  get multi() { return this.rules.isMulti(); }
  get playing() { return this.state === 'play'; }
  /** segrevanje (vir toplote mize, 0–1) za izris */
  get heat() { return this.rules.heat || 0; }

  resetGame() {
    Object.assign(this, {
      score: 0, ballNum: 0, pending: 0, extraBalls: 0,
      combo: 0, lastMajorT: -99, lastMajor: '', maxCombo: 0, maxJackpot: 0,
      startT: this.time, playSec: 0, shotCounts: {}, match: null,
    });
    this.rules.resetGame();
    this.resetBallVars();
  }

  resetBallVars() {
    Object.assign(this, {
      mult: 1, bonus: 0, tiltMeter: 0, tiltWarn: 0, tilted: false, ballSaveUntil: 0,
    });
    this.rules.resetBall();
    for (const s of this.T.sensors) s.inside.clear();
  }

  /* ---------------- žogice ---------------- */
  newBall(x, y) {
    const b = { id: this.nextId++, x, y, vx: 0, vy: 0, layer: 0, captured: false, saucerCool: 0,
      trail: [], ax: x, ay: y, anchorT: this.time };
    this.balls.push(b);
    return b;
  }
  inPlunger(b) { const L = this.T.launch; return b.x > L.laneX && b.y > L.laneY && !b.captured; }

  serveBall() {
    const L = this.T.launch;
    this.newBall(L.x, L.y - BR - 1);
    this.rules.onBallStart();
    this.emit('serve', {});
  }
  autoLaunch() {
    const L = this.T.launch;
    const b = this.newBall(L.x, L.y - BR - 1);
    b.vy = -L.auto[0] - Math.random() * L.auto[1];
    this.emit('launch', { power: 0.75, auto: true });
    return b;
  }
  /** add-a-ball: nova žogica iz izstrelitve + podaljšan ball save */
  addABall(delay = 0.8, save = 6) {
    this.spawnLater(delay, () => this.autoLaunch());
    if (save) this.ballSaveUntil = Math.max(this.ballSaveUntil, this.time + save);
  }

  /* ---------------- saucer / scoop / VUK ---------------- */
  saucer(id) { return typeof id === 'object' ? id : this.T.saucers.find(s => s.id === id); }
  /** ujame žogico v luknjo; vrne true, če je ujeta */
  captureSaucer(id, b, force) {
    const sa = this.saucer(id);
    if (b.saucerCool > 0 || b.captured) return false;
    // hitra žogica od zgoraj preskoči luknjo; ujame se strel od spredaj ali počasna žogica
    const sp = Math.hypot(b.vx, b.vy), C = sa.capture;
    if (!force && !((b.vy < 0 && sp < C.maxUp) || sp < C.maxAny)) return false;
    b.captured = true; b.vx = 0; b.vy = 0; b.x = sa.x; b.y = sa.y;
    b.saucer = sa.id; sa.flash = 1;
    this.emit('scoopEnter', { x: sa.x, y: sa.y, id: sa.id, kind: sa.kind });
    if (this.tilted) { this.after(1, () => this.ejectSaucer(sa, b)); return true; }
    this.rules.onSwitch(sa.name, { b, saucer: sa, x: sa.x, y: sa.y });
    return true;
  }
  /** izvrže žogico (b = null → nova žogica iz luknje, npr. multiball); v = { vx, rvx, vy, rvy } povozi smer */
  ejectSaucer(id, b, v) {
    const sa = this.saucer(id), E = sa.eject;
    if (!b) b = this.newBall(E.x, E.y);
    b.captured = false;
    b.x = E.x; b.y = E.y; b.layer = E.layer || 0;
    if (b.layer) b.ramp = E.ramp;
    const e = v || E;
    b.vx = e.vx + Math.random() * e.rvx;
    b.vy = e.vy + Math.random() * e.rvy;
    b.saucerCool = 0.6;
    b.saucer = null;
    this.emit('scoopEject', { x: E.x, y: E.y, id: sa.id, kind: sa.kind });
    return b;
  }

  /* ---------------- vidni lock ---------------- */
  lockBall(id, b) {
    const k = this.T.byId[id];
    const i = this.balls.indexOf(b);
    if (i >= 0) this.balls.splice(i, 1);
    for (const s of this.T.sensors) s.inside.delete(b.id);
    k.balls = Math.min(k.slots.length, k.balls + 1);
    this.emit('ballLocked', { id, n: k.balls, x: k.slots[k.balls - 1][0], y: k.slots[k.balls - 1][1] });
    return k.balls;
  }
  /** sprosti n žogic iz locka (n = 'all' → vse); vrne sproščene žogice */
  releaseLock(id, n = 'all', gap = 0.35) {
    const k = this.T.byId[id], out = [];
    const cnt = n === 'all' ? k.balls : Math.min(n, k.balls);
    for (let i = 0; i < cnt; i++) {
      this.spawnLater(i * gap, () => {
        const R = k.release, b = this.newBall(R.x, R.y);
        b.vx = R.vx; b.vy = R.vy;
        out.push(b);
        this.emit('lockRelease', { id, x: R.x, y: R.y });
      });
    }
    k.balls -= cnt;
    return cnt;
  }

  /* ---------------- drop banke, stebrički, preusmerniki, magneti, igrače ---------------- */
  hitDrop(s) {
    if (!s.active) return;
    s.active = false;
    const bank = s.bank;
    this.rules.onSwitch('drop', { s, bank, idx: s.data.idx, x: s.ax, y: (s.ay + s.by) / 2 });
    if (bank && bank.targets.every(d => !d.active)) {
      this.rules.onSwitch('dropBank', { bank, x: bank.targets[0].ax, y: bank.targets[0].ay });
      if (bank.resetDelay != null) this.resetBank(bank.id, bank.resetDelay);
    }
  }
  resetBank(id, delay = 0) {
    const bank = this.T.banks.find(b => b.id === id);
    const go = () => { for (const d of bank.targets) d.active = true; this.emit('dropsReset', { bank: id }); };
    if (delay > 0) this.after(delay, go); else go();
  }
  setPost(id, up) {
    const s = this.T.byId[id];
    if (!s || s.active === !!up) return;
    s.active = !!up;
    this.emit('post', { id, up: !!up, x: s.ax, y: s.ay });
  }
  setDiverter(id, on) {
    const s = this.T.byId[id];
    if (!s || s.on === !!on) return;
    s.on = !!on;
    this.emit('diverter', { id, on: s.on, x: s.px, y: s.py });
  }
  /** magnet: 'grab' (privlači in zadrži), 'pull' (samo privlak), 'throw' (vrže v smer {vx,vy}), 'off' */
  magnet(id, mode, o = {}) {
    const m = this.T.byId[id];
    if (!m) return;
    if (mode === 'off') { m.on = false; m.hold = false; this.freeMagnet(m); }
    else if (mode === 'pull') { m.on = true; m.hold = false; }
    else if (mode === 'grab') { m.on = true; m.hold = true; m.t = o.time ?? 0; }
    else if (mode === 'throw') {
      const b = this.balls.find(x => x.id === m.held);
      m.on = false; m.hold = false; this.freeMagnet(m);
      if (b) { b.vx = o.vx ?? 0; b.vy = o.vy ?? -1400; }
    }
    this.emit('magnet', { id, mode, x: m.x, y: m.y });
  }
  freeMagnet(m) { for (const b of this.balls) if (b.id === m.held) b.magnet = false; m.held = 0; }
  moveToy(id, pose) {
    const t = this.T.byId[id];
    if (!t) return;
    Object.assign(t.target, pose);
  }

  /* ---------------- začetek in konec ---------------- */
  startGame() {
    this.balls = [];
    this.timers = [];
    for (const d of this.T.drops) { d.active = true; d.sink = 0; }
    this.resetElements();
    this.resetGame();
    this.state = 'play';
    this.paused = false;
    this.ballNum = 1;
    this.startT = this.time;
    this.serveBall();
    this.emit('gameStart', {});
    this.sayKey('start');
    this.after(1.6, () => {
      if (this.state === 'play' && this.ballNum === 1 && this.balls.length === 1 && this.inPlunger(this.balls[0]))
        this.sayKey('ball1', { sub: this.launchHint || 'drži PRESLEDEK, nato spusti' });
    });
  }
  resetElements() {
    const T = this.T;
    for (const k of T.locks) k.balls = 0;
    for (const m of T.magnets) { m.on = false; m.hold = false; m.held = 0; }
    for (const s of T.posts) s.active = s.lift > 0;
    for (const s of T.diverters) s.on = false;
    for (const c of T.captives) { c.t = 0; c.v = 0; c.x = c.ax; c.y = c.ay; }
  }

  drain(b) {
    const i = this.balls.indexOf(b);
    if (i >= 0) this.balls.splice(i, 1);
    for (const s of this.T.sensors) s.inside.delete(b.id);
    if (this.state !== 'play') return;
    this.emit('drain', { x: b.x });

    if (this.time < this.ballSaveUntil && !this.tilted) {
      if (this.multi) this.spawnLater(0.8, () => this.autoLaunch());
      else {
        this.sayKey('ballSave');
        this.emit('ballSave', {});
        this.spawnLater(1, () => this.serveBall());
        this.ballSaveUntil = 0;
      }
      return;
    }
    this.rules.onDrain(b);
    const live = this.live;
    if (live === 0) this.endOfBall();
    else if (live === 1) this.rules.onLastBall();
  }

  endOfBall() {
    this.rules.onBallEnd();
    this.state = 'bonus';
    const base = this.bonus, mult = this.mult, tilted = this.tilted;
    const bonus = tilted ? 0 : base * mult;
    this.score += bonus;
    this.emit('endOfBall', { base, mult, bonus, tilted, ball: this.ballNum });
    this.after(3.4, () => {
      this.resetBallVars();
      if (this.extraBalls > 0) {
        this.extraBalls--;
        this.state = 'play';
        this.sayKey('shootAgain');
        this.serveBall();
        return;
      }
      this.ballNum++;
      if (this.ballNum > this.cfg.steviloZogic) { this.gameOver(); return; }
      this.state = 'play';
      this.sayKey('ballN', { n: this.ballNum });
      this.serveBall();
    });
  }

  gameOver() {
    this.state = 'over';
    this.playSec = this.time - this.startT;
    // match: število 00–90 iz rezultata in trajanja (deterministično, brez Math.random)
    const h = Math.imul(Math.round(this.score) ^ Math.round(this.playSec * 1000), 2654435761) >>> 0;
    const num = (h % 10) * 10, last = Math.floor(this.score / 10) % 10 * 10;
    this.match = { num, last, hit: num === last };
    this.emit('gameOver', Object.assign({
      score: this.score, maxCombo: this.maxCombo, maxJackpot: this.maxJackpot,
      playSec: this.playSec, match: this.match, shots: Object.assign({}, this.shotCounts),
    }, this.rules.gameStats()));
  }

  /* ---------------- točke ---------------- */
  addScore(pts, x, y, bonusPts = 0) {
    if (this.tilted || this.state !== 'play') return;
    this.score += pts;
    this.bonus += bonusPts;
    if (x !== undefined && pts >= 1000) this.emit('score', { pts, x, y });
  }

  /** strel: štetje in combo okno (zaporedni veliki streli v CFG.comboOkno s) */
  shot(name, x, y) {
    this.shotCounts[name] = (this.shotCounts[name] || 0) + 1;
    const def = this.T.shotBySwitch && this.T.shots.find(s => s.id === name);
    if (def && def.combo === false) { this.rules.onShot(name, { x, y, combo: 0 }); return; }
    if (this.time - this.lastMajorT < this.cfg.comboOkno) this.combo++;
    else this.combo = 1;
    this.lastMajorT = this.time;
    this.lastMajor = name;
    if (this.combo >= 2) {
      const pts = 25000 * Math.min(5, this.combo - 1);
      this.addScore(pts, x, y - 24);
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.emit('combo', { n: this.combo, x, y });
    }
    this.rules.onShot(name, { x, y, combo: this.combo });
  }

  /* ---------------- dogodki fizike ---------------- */
  seg(s, b, imp, cx, cy, nx, ny) {
    switch (s.kind) {
      case 'sling':
        if (imp > 90 && s.cool <= 0) {
          b.vx += nx * PHYS.sling; b.vy += ny * PHYS.sling;
          s.cool = 0.12;
          const sl = this.T.slings.find(q => q.kick === s);
          if (sl) { sl.flash = 1; sl.bend = 1; }
          this.rules.onSwitch('sling', { s, x: cx, y: cy, side: s.data.side });
        }
        break;
      case 'drop':
        if (imp > 40 && s.active) this.hitDrop(s);
        break;
      case 'standup': {
        const f = s.face;
        if (imp > 60 && (!f || nx * f[0] + ny * f[1] > s.minFace) && s.cool <= 0) {
          s.cool = 0.35;
          s.wobble = 1;
          this.rules.onSwitch(s.name, { s, x: cx, y: cy, idx: s.data.idx, bank: s.data.bank });
        }
        break;
      }
      case 'toy':
        if (imp > 80 && s.cool <= 0) { s.cool = 0.25; this.rules.onSwitch(s.id, { s, x: cx, y: cy, toy: s.toy }); }
        break;
      default:
        if (imp > 450) this.emit('wall', { x: cx, y: cy, v: imp, kind: s.kind });
    }
  }

  bumper(c, b) {
    c.flash = 1; c.pop = 1;
    this.rules.onSwitch('bumper', { c, b, x: c.x, y: c.y });
  }

  flip(f, b, imp) {
    if (imp > 700) this.emit('flipHit', { x: b.x, y: b.y, v: imp });
  }

  captive(c, b, imp) {
    c.flash = 1;
    if (!b) this.rules.onSwitch(c.name, { captive: c, x: c.bx, y: c.by });
    else if (imp > 200) this.emit('captiveHit', { x: c.x, y: c.y, v: imp });
  }

  layer(b, from, to, why, R) {
    const d = { x: b.x, y: b.y, ramp: R.id };
    if (why === 'enter') this.emit('rampEnter', d);
    else if (why === 'fail') this.emit('rampFail', d);
    else if (why === 'exit') this.emit('rampExit', d);
    this.rules.onRamp(R, why, b);
  }

  sensor(s, b) {
    switch (s.kind) {
      case 'spinner': {
        const sp = s.ref, v = sp.angle ? -Math.sin(sp.angle) * b.vx + Math.cos(sp.angle) * b.vy : b.vy;
        sp.state.w = Math.min(60, Math.abs(v) / 25 + 6);
        break;
      }
      case 'saucer':
        this.captureSaucer(s.ref, b);
        if (!b.captured) s.inside.delete(b.id);
        break;
      default:
        this.rules.onSwitch(s.name, { s, b, idx: s.idx, x: s.x, y: s.y });
    }
  }

  /* ---------------- vnos ---------------- */
  setFlipper(side, down) {
    const fl = this.T.flippers.filter(f => f.button === side);
    if (!fl.length || fl[0].pressed === down) return;
    for (const f of fl) f.pressed = down;
    if (this.state !== 'play' || this.tilted) return;
    this.emit('flipper', { side, down });
    if (!down) return;
    this.rules.onFlipper(side);
  }
  /** lane change: zavrti stanje kanalov v skupini (dir = +1 desno, -1 levo) */
  rotateLanes(arr, dir) {
    const n = arr.length, out = new Array(n);
    for (let i = 0; i < n; i++) out[(i + dir + n) % n] = arr[i];
    return out;
  }

  ballWaiting() { return this.state === 'play' && this.balls.some(b => this.inPlunger(b)); }

  plungerDown() {
    if (!this.ballWaiting() || this.paused) return;
    this.plungerHeld = true;
  }
  plungerUp() {
    if (!this.plungerHeld) return;
    this.plungerHeld = false;
    const p = this.plungerPull;
    this.plungerPull = 0;
    this.launch(p);
  }
  launch(p) {
    if (p < 0.05) return;
    const L = this.T.launch;
    let any = false;
    for (const b of this.balls) {
      if (!this.inPlunger(b)) continue;
      b.y = L.y - BR - 1;
      b.vy = -(L.min + L.k * p);
      b.vx = 0;
      any = true;
    }
    if (!any) return;
    if (!this.ballSaveUntil || this.ballSaveUntil < this.time) this.ballSaveUntil = this.time + (PHYS.ballSave ?? this.cfg.ballSaveSek);
    this.emit('launch', { power: p });
  }

  nudge(dir = 0) {
    if (this.state !== 'play' || this.tilted) return;
    const dx = dir || (Math.random() < 0.5 ? -1 : 1);
    for (const b of this.balls) {
      if (b.captured || this.inPlunger(b)) continue;
      b.vx += dx * (90 + Math.random() * 80);
      b.vy -= 180;
    }
    this.emit('nudge', { dx });
    this.tiltMeter += 1;
    if (this.tiltMeter > 2.6) {
      this.tiltMeter = 1;
      this.tiltWarn++;
      if (this.tiltWarn >= 3) {
        this.tilted = true;
        this.rules.onTilt();
        this.sayKey('tilt', {}, { anim: 'tilt' });
        this.emit('tilt', {});
      } else {
        this.sayKey('tiltWarn', { n: this.tiltWarn });
        this.emit('tiltWarn', { n: this.tiltWarn });
      }
    }
  }

  /* ---------------- glavna posodobitev ---------------- */
  update(dt) {
    this.time += dt;
    const T = this.T, L = T.launch;

    if (this.timers.length) {
      const due = [];
      for (const t of this.timers) { t.t -= dt; if (t.t <= 0) due.push(t); }
      if (due.length) {
        this.timers = this.timers.filter(t => t.t > 0);
        for (const t of due) t.fn();
      }
    }

    // plunger
    if (this.plungerHeld) this.plungerPull = Math.min(1, this.plungerPull + dt * 1.25);
    T.plunger.ay = T.plunger.by = L.y + this.plungerPull * L.travel;
    T.plunger.miny = T.plunger.ay; T.plunger.maxy = T.plunger.ay;

    const en = this.state === 'play' && !this.tilted;
    for (const f of T.flippers) f.enabled = en;
    for (const s of T.diverters) this.stepDiverter(s, dt);
    for (const s of T.posts) s.lift += ((s.active ? 1 : 0) - s.lift) * Math.min(1, dt * 14);

    // fizika
    const n = Math.max(1, Math.round(dt / STEP));
    const sdt = dt / n;
    for (let i = 0; i < n; i++) {
      this.phys.step(sdt, this.balls);
      this.rules.substep(sdt);
    }

    // ohladitve in animacije elementov
    for (const s of T.segs) { if (s.cool > 0) s.cool -= dt; }
    for (const c of T.bumpers) {
      if (c.cool > 0) c.cool -= dt;
      c.flash = Math.max(0, c.flash - dt * 4);
      c.pop = Math.max(0, c.pop - dt * 7);
    }
    for (const sl of T.slings) { sl.flash = Math.max(0, sl.flash - dt * 4); sl.bend = Math.max(0, sl.bend - dt * 9); }
    for (const d of T.drops) d.sink += ((d.active ? 0 : 1) - d.sink) * Math.min(1, dt * 18);
    for (const s of T.standups) s.wobble = Math.max(0, s.wobble - dt * 3);
    for (const s of T.saucers) s.flash = Math.max(0, s.flash - dt * 2);
    for (const c of T.captives) c.flash = Math.max(0, c.flash - dt * 3);
    for (const m of T.magnets) if (m.on) m.t += dt;

    // žogice
    const anyHeld = T.flippers.some(f => f.pressed);
    for (const b of this.balls.slice()) {
      if (b.saucerCool > 0) b.saucerCool -= dt;
      if (b.captured) { b.anchorT = this.time; continue; }
      b.trail.push(b.x, b.y);
      if (b.trail.length > 24) b.trail.splice(0, 2);
      if (b.y > H + 30) { this.drain(b); continue; }
      if (!T.inside(b.x, b.y) && b.y < H) {
        // varovalo — ne bi se smelo zgoditi
        this.emit('escape', { x: b.x, y: b.y });
        b.x = L.x; b.y = L.y - BR - 1; b.vx = 0; b.vy = 0; b.layer = 0;
      }
      this.rules.ballTick(b);
      // magnet drži žogico: ni zataknjena
      if (T.magnets.length) b.magnet = T.magnets.some(m => m.held === b.id && m.on);
      // iskanje zataknjene žogice
      if (this.inPlunger(b) || anyHeld || this.state !== 'play' || b.magnet) { b.ax = b.x; b.ay = b.y; b.anchorT = this.time; }
      else if ((b.x - b.ax) ** 2 + (b.y - b.ay) ** 2 > 36) { b.ax = b.x; b.ay = b.y; b.anchorT = this.time; }
      else if (this.time - b.anchorT > 4) {
        b.vy = -900; b.vx = (Math.random() - 0.5) * 600;
        b.anchorT = this.time;
        this.emit('ballSearch', { x: b.x, y: b.y });
        if (this.time - (this.lastSearchMsg || -99) > 8) { this.lastSearchMsg = this.time; this.sayKey('ballSearch', {}, { small: true }); }
      }
    }

    // spinnerji
    for (const spn of T.spinners) {
      const sp = spn.state;
      if (sp.w > 0.2) {
        sp.angle += sp.w * dt;
        sp.w *= Math.exp(-1.4 * dt);
        const half = Math.floor(sp.angle / Math.PI);
        if (half !== sp.half) {
          sp.half = half;
          this.rules.onSwitch(spn.name, { spinner: spn, x: spn.x, y: spn.y });
        }
      } else sp.w = 0;
    }

    this.rules.tick(dt);
    this.tiltMeter = Math.max(0, this.tiltMeter - dt * 0.6);
    if (this.state === 'play') this.playSec = this.time - this.startT;
    this.computeLamps();
  }

  stepDiverter(s, dt) {
    const target = s.on ? s.a1 : s.a0;
    const d = target - s.angle;
    if (Math.abs(d) < 1e-4) return;
    s.angle += Math.max(-dt * 12, Math.min(dt * 12, d));
    s.bx = s.px + Math.cos(s.angle) * s.len; s.by = s.py + Math.sin(s.angle) * s.len;
    s.minx = Math.min(s.ax, s.bx) - s.r; s.maxx = Math.max(s.ax, s.bx) + s.r;
    s.miny = Math.min(s.ay, s.by) - s.r; s.maxy = Math.max(s.ay, s.by) + s.r;
  }

  /* ---------------- stanje luči ---------------- */
  computeLamps() {
    const L = this.lamps;
    const set = (id, v, c) => { const o = L[id] || (L[id] = { v: 0, c: null }); o.v = v; o.c = c || null; };
    this.rules.lamps(set, this.time);
    const gi = this.tilted ? 0 : 1;
    for (const l of this.T.lamps) if (l.group === 'gi') set(l.id, gi);
  }

  /** podatki za stranske plošče in DMD */
  summary() {
    return Object.assign({
      state: this.state, score: this.score, ball: Math.min(this.ballNum, this.cfg.steviloZogic), balls: this.cfg.steviloZogic,
      mult: this.mult, ballSave: Math.max(0, this.ballSaveUntil - this.time), extraBalls: this.extraBalls,
      combo: this.time - this.lastMajorT < this.cfg.comboOkno ? this.combo : 0,
      tiltWarn: this.tiltWarn, tilted: this.tilted, bonus: this.bonus, multiball: this.multi && this.state === 'play',
    }, this.rules.summary());
  }
}
