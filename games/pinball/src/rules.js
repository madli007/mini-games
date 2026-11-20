/* =====================================================================
   PRAVILA IGRE — stanje, točkovanje, misije, multiball, wizard
   Brez DOM-a: teče enako v igri in v testih (tests.html).
   ===================================================================== */
import { CFG, MODES, PAL, BR, STEP, H } from './config.js';

const N = CFG.imena;
import { PLUNGER_Y, SCOOP, insideTable } from './table.js';
import { createPhysics } from './physics.js';

export const fmt = n => Math.round(n).toLocaleString('sl-SI');

const PLUNGE_X = 562.5;

export class Game {
  constructor(T, bus) {
    this.T = T;
    this.bus = bus || { emit() {} };
    this.phys = createPhysics(T, this);
    this.time = 0;
    this.nextId = 1;
    this.state = 'attract';          // attract | play | bonus | over
    this.balls = [];
    this.timers = [];
    this.spinner = { angle: 0, w: 0, half: 0 };
    this.heat = 0;                    // segrevanje peči (izris taline)
    this.lamps = {};
    this.plungerPull = 0;
    this.plungerHeld = false;
    this.paused = false;
    this.resetGame();
    this.computeLamps();
  }

  /* ------------------------------------------------------------------ */
  emit(name, data) { this.bus.emit(name, data); }
  say(text, sub = '', color = PAL.melt, o = {}) {
    this.emit('msg', Object.assign({ text, sub, color, dur: 2 }, o));
  }
  after(delay, fn) { this.timers.push({ t: delay, fn }); }
  spawnLater(delay, fn) {
    this.pending++;
    this.after(delay, () => { this.pending--; fn(); });
  }
  get live() { return this.balls.length + this.pending; }
  get multi() { return !!(this.mb || this.wiz); }
  get playing() { return this.state === 'play'; }

  resetGame() {
    Object.assign(this, {
      score: 0, ballNum: 0, pending: 0, extraBalls: 0, extraLit: false, extraGiven: false, mysteryEB: false,
      lockLit: false, locks: 0, mb: null, jackpotValue: 500000, mbCount: 0, bugSets: 0,
      kickback: true, spins: 0, orbits: 0, ramps: 0, rampsToMode: CFG.rampZaMisijo,
      lastRampT: -99, rampCombo: 0, combo: 0, lastMajorT: -99, lastMajor: '',
      maxCombo: 0, maxJackpot: 0, review: 0, reviewNeed: CFG.reviewZaMystery,
      modeIdx: 0, modeLit: true, mode: null, modesDone: [false, false, false, false],
      modesCompleted: 0, wizardLit: false, wiz: null, wizards: 0, startT: this.time,
      playSec: 0,
    });
    this.resetBallVars();
  }

  resetBallVars() {
    Object.assign(this, {
      mult: 1, bonus: 0, alu: [false, false, false], tiltMeter: 0, tiltWarn: 0, tilted: false,
      ballSaveUntil: 0, skillLane: 0, skillArmed: false, skillUntil: 0,
    });
    for (const s of this.T.sensors) s.inside.clear();
  }

  /* ---------------- žogice ---------------- */
  newBall(x, y) {
    const b = { id: this.nextId++, x, y, vx: 0, vy: 0, layer: 0, captured: false, scoopCool: 0,
      trail: [], ax: x, ay: y, anchorT: this.time };
    this.balls.push(b);
    return b;
  }
  inPlunger(b) { return b.x > 546 && b.y > 880 && !b.captured; }

  serveBall() {
    this.newBall(PLUNGE_X, PLUNGER_Y - BR - 1);
    this.skillLane = Math.floor(Math.random() * 3);
    this.skillArmed = true;
    this.skillUntil = 0;
    this.emit('serve', {});
  }
  autoLaunch() {
    const b = this.newBall(PLUNGE_X, PLUNGER_Y - BR - 1);
    b.vy = -2300 - Math.random() * 300;
    this.emit('launch', { power: 0.75, auto: true });
  }
  ejectFromScoop(b) {
    if (!b) b = this.newBall(SCOOP.x, SCOOP.y);
    b.captured = false;
    b.x = SCOOP.x; b.y = SCOOP.y; b.layer = 0;
    const toBumpers = this.mode && this.mode.def.id === 'talina';
    b.vx = toBumpers ? -600 - Math.random() * 80 : -380 - Math.random() * 120;
    b.vy = toBumpers ? -900 - Math.random() * 80 : -300 - Math.random() * 100;
    b.scoopCool = 0.6;
    this.emit('scoopEject', { x: SCOOP.x, y: SCOOP.y });
  }

  /* ---------------- začetek in konec ---------------- */
  startGame() {
    this.balls = [];
    this.timers = [];
    for (const d of this.T.drops) { d.active = true; d.sink = 0; }
    this.resetGame();
    this.state = 'play';
    this.paused = false;
    this.ballNum = 1;
    this.startT = this.time;
    this.serveBall();
    this.emit('gameStart', {});
    this.say(N.kadri + ': ZAPOSLEN!', 'dobrodošel v skupini Impol', PAL.code, { dur: 1.6 });
    this.after(1.6, () => {
      if (this.state === 'play' && this.ballNum === 1 && this.balls.length === 1 && this.inPlunger(this.balls[0]))
        this.say('ŽOGA 1', this.launchHint || 'drži PRESLEDEK, nato spusti', PAL.cyan, { dur: 3 });
    });
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
        this.say(N.ballSave, 'ball save — še enkrat!', PAL.cyan, { dur: 1.8 });
        this.emit('ballSave', {});
        this.spawnLater(1, () => this.serveBall());
        this.ballSaveUntil = 0;
      }
      return;
    }
    const live = this.live;
    if (live === 0) this.endOfBall();
    else if (live === 1) {
      if (this.wiz) this.endWizard(true);
      if (this.mb) this.endMultiball();
    }
  }

  endOfBall() {
    if (this.mode) this.failMode(true);
    if (this.wiz) this.endWizard(false);
    if (this.mb) this.mb = null;
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
        this.say('ŠE ENA ŽOGA', 'shoot again', PAL.magenta, { dur: 2 });
        this.serveBall();
        return;
      }
      this.ballNum++;
      if (this.ballNum > CFG.steviloZogic) { this.gameOver(); return; }
      this.state = 'play';
      this.say('ŽOGA ' + this.ballNum, '', PAL.cyan, { dur: 1.8 });
      this.serveBall();
    });
  }

  gameOver() {
    this.state = 'over';
    this.playSec = this.time - this.startT;
    this.emit('gameOver', {
      score: this.score, maxCombo: this.maxCombo, maxJackpot: this.maxJackpot,
      playSec: this.playSec, wizards: this.wizards, modes: this.modesCompleted, multiballs: this.mbCount,
    });
  }

  /* ---------------- točke ---------------- */
  addScore(pts, x, y, bonusPts = 0) {
    if (this.tilted || this.state !== 'play') return;
    this.score += pts;
    this.bonus += bonusPts;
    if (x !== undefined && pts >= 1000) this.emit('score', { pts, x, y });
  }

  major(name, x, y) {
    if (name === 'scoop') return;            // talilnica zadrži žogico — ne podaljšuje comba
    if (this.time - this.lastMajorT < CFG.comboOkno) this.combo++;
    else this.combo = 1;
    this.lastMajorT = this.time;
    this.lastMajor = name;
    if (this.combo >= 2) {
      const pts = 25000 * Math.min(5, this.combo - 1);
      this.addScore(pts, x, y - 24);
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.emit('combo', { n: this.combo, x, y });
    }
  }

  /* ---------------- dogodki fizike ---------------- */
  seg(s, b, imp, cx, cy, nx, ny) {
    switch (s.kind) {
      case 'sling':
        if (imp > 90 && s.cool <= 0) {
          b.vx += nx * 900; b.vy += ny * 900;
          s.cool = 0.12;
          this.onSling(s, cx, cy);
        }
        break;
      case 'drop':
        if (imp > 40 && s.active) this.onDrop(s);
        break;
      case 'review':
        if (imp > 60 && ny > 0.4 && s.cool <= 0) { s.cool = 0.35; this.onReview(s, cx, cy); }
        break;
      default:
        if (imp > 450) this.emit('wall', { x: cx, y: cy, v: imp, kind: s.kind });
    }
  }

  bumper(c, b) {
    c.flash = 1; c.pop = 1;
    this.skillArmed = false;
    this.addScore(this.wiz ? 50000 : 1000, c.x, c.y - 30, 200);
    this.heat = Math.min(1, this.heat + (this.mode && this.mode.def.id === 'talina' ? 0.08 : 0.025));
    this.emit('bumper', { x: c.x, y: c.y, i: c.i });
    this.modeEvent('bumper', c);
  }

  flip(f, b, imp) {
    if (imp > 700) this.emit('flipHit', { x: b.x, y: b.y, v: imp });
  }

  layer(b, from, to, why) {
    if (why === 'enter') this.emit('rampEnter', { x: b.x, y: b.y });
    else if (why === 'fail') this.emit('rampFail', { x: b.x, y: b.y });
    else if (why === 'exit') this.emit('rampExit', { x: b.x, y: b.y });
  }

  sensor(s, b) {
    switch (s.kind) {
      case 'lane': this.onLane(s.idx); break;
      case 'orbit': if (b.vy < 0) this.onOrbit(); break;
      case 'spinner': this.spinner.w = Math.min(60, Math.abs(b.vy) / 25 + 6); break;
      case 'scoop': this.onScoop(b); if (!b.captured) s.inside.delete(b.id); break;
      case 'rampMade': this.onRamp(); break;
      case 'inlane': this.addScore(1000, s.x, s.y - 20, 500); this.emit('inlane', { x: s.x, y: s.y }); break;
      case 'outlane': this.addScore(5000, s.x, s.y - 20, 500); this.emit('outlane', { x: s.x, y: s.y, side: s.idx }); break;
    }
  }

  /* ---------------- elementi ---------------- */
  onSling(s, x, y) {
    const sl = this.T.slings.find(q => q.kick === s);
    if (sl) { sl.flash = 1; sl.bend = 1; }
    this.addScore(110, x, y, 100);
    this.emit('sling', { x, y, side: s.data.side });
  }

  onDrop(s) {
    s.active = false;
    this.addScore(5000, s.ax - 22, s.ay + 18, 2000);
    this.emit('drop', { x: s.ax, y: (s.ay + s.by) / 2, i: s.data.idx });
    this.modeEvent('shot', 'bug');
    if (this.wiz) this.wizJackpot(s.ax - 30, s.ay);
    const drops = this.T.drops;
    if (drops.every(d => !d.active)) {
      this.addScore(25000, 480, 620, 5000);
      this.emit('dropsComplete', {});
      if (this.wiz) { /* že točkovano */ }
      else if (this.mb) {
        if (!this.mb.addUsed) {
          this.mb.addUsed = true;
          this.say('NOVA ' + N.extraBall, 'add-a-ball', PAL.code, { anim: 'terminal', lines: ['$ alcloud deploy --replicas +1', '> Rondal: nova rondela'] });
          this.emit('addABall', {});
          this.spawnLater(0.8, () => this.autoLaunch());
          this.ballSaveUntil = Math.max(this.ballSaveUntil, this.time + 6);
        } else {
          this.jackpotValue += 100000;
          this.say('BUG ODPRAVLJEN', 'jackpot +100.000', PAL.code, { anim: 'terminal', lines: ['$ git commit -m "fix"'] });
        }
      } else if (!this.lockLit) {
        this.bugSets++;
        const need = this.mbCount >= 1 ? 2 : 1;      // po prvem multiballu sta potrebna 2 kompleta
        if (this.bugSets >= need) {
          this.bugSets = 0;
          this.lockLit = true;
          this.say('BUG ODPRAVLJEN!', 'LOCK v livarni', PAL.code, { anim: 'terminal', lines: ['$ npm test', '✓ 3/3 bugi odpravljeni', '> LOCK PRIŽGAN'] });
          this.emit('lockLit', {});
        } else {
          this.say('BUGI: 1 / 2', 'še en komplet za LOCK', PAL.code, { anim: 'terminal', lines: ['$ npm test', '✗ 1 test še pada'] });
        }
      } else {
        this.say('KONTROLA OK', '+25.000', PAL.code, { dur: 1.4 });
      }
      this.after(1.2, () => { for (const d of drops) d.active = true; this.emit('dropsReset', {}); });
    }
  }

  onReview(s, x, y) {
    s.wobble = 1;
    this.addScore(5000, x + 18, y + 30, 1000);
    this.emit('review', { x: x, y: y, n: this.review + 1 });
    this.major('review', 282, 430);
    this.modeEvent('shot', 'review');
    if (this.wiz) { this.wizJackpot(282, 420); return; }
    this.review++;
    if (this.review >= this.reviewNeed) {
      this.review = 0;
      this.reviewNeed = Math.min(5, this.reviewNeed + 1);
      this.mystery();
    }
  }

  mystery() {
    const g = this;
    const opts = [
      { w: 30, ok: true, name: 'TOČKE', run() { const p = 100000 * (1 + Math.floor(Math.random() * 3)); g.addScore(p, 282, 400); return '+' + fmt(p); } },
      { w: 15, ok: !g.lockLit && !g.mb && !g.wiz, name: 'LOCK PRIŽGAN', run() { g.lockLit = true; return N.scoop + ' čaka'; } },
      { w: 3, ok: !g.mysteryEB, name: N.extraBall + '!', run() { g.mysteryEB = true; g.extraBalls++; g.emit('extraBall', {}); return 'extra ball'; } },
      { w: 15, ok: true, name: N.ballSave, run() { g.ballSaveUntil = Math.max(g.ballSaveUntil, g.time + 15); return 'ball save 15 s'; } },
      { w: 12, ok: g.mult < 6, name: 'BONUS +1×', run() { g.mult++; return 'bonus ×' + g.mult; } },
      { w: 12, ok: !g.modeLit && !g.mode && !g.wizardLit && !g.wiz, name: 'MISIJA PRIŽGANA', run() { g.lightMode(true); return MODES[g.nextModeIndex()].ime; } },
      { w: 10, ok: !g.kickback, name: N.sling, run() { g.kickback = true; return 'kickback: levi outlane varen'; } },
    ].filter(o => o.ok);
    let r = Math.random() * opts.reduce((a, o) => a + o.w, 0);
    let pick = opts[0];
    for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
    const sub = pick.run();
    this.emit('mystery', { name: pick.name });
    this.say(pick.name, sub, PAL.magenta, { anim: 'terminal', lines: ['$ ' + N.mystery.toLowerCase() + ' review --mystery', '> ' + N.mystery + ': approved ✓'], dur: 3 });
  }

  onLane(idx) {
    const x = 240 + 50 * idx;
    if (this.skillArmed && idx === this.skillLane && (this.skillUntil === 0 || this.time < this.skillUntil + 6)) {
      this.addScore(CFG.skillShot, x, 150, 5000);
      this.say('SKILL SHOT!', 'OD 1825 · +' + fmt(CFG.skillShot), PAL.white, { anim: 'zoom' });
      this.emit('skill', { x, y: 115 });
    }
    this.skillArmed = false;
    if (this.wiz) this.wizJackpot(x, 140);
    if (!this.alu[idx]) { this.alu[idx] = true; this.addScore(2000, x, 150, 1000); }
    else this.addScore(500, x, 150, 200);
    this.emit('lane', { i: idx, x, y: 113 });
    if (this.alu.every(Boolean)) {
      this.alu = [false, false, false];
      if (this.mult < 6) {
        this.mult++;
        this.say('BONUS ×' + this.mult, 'A·L·U kanali zaprti', PAL.cyan);
      } else {
        this.addScore(50000, 290, 160);
        this.say('ALU MAX', '+50.000', PAL.cyan);
      }
      this.emit('lanesComplete', { mult: this.mult });
    }
  }

  onOrbit() {
    this.orbits++;
    this.major('orbit', 60, 330);
    this.modeEvent('shot', 'orbit');
    this.modeEvent('orbit');
    this.emit('orbit', { combo: this.combo });
    if (this.wiz) { this.wizJackpot(80, 320); return; }
    if (this.mb && this.mb.jpOrbit) { this.jackpot('Orbit', 80, 320); return; }
    this.addScore(15000, 90, 300, 3000);
    if (this.orbits >= CFG.orbitZaExtraBall && !this.extraGiven && !this.extraLit) {
      this.extraLit = true;
      this.say(N.extraBall + ' PRIŽGANA', 'extra ball → ' + N.scoop, PAL.magenta);
      this.emit('extraBallLit', {});
    } else if (this.combo < 2 && !this.mode) {
      this.say(N.orbit, '+15.000', PAL.cyan, { dur: 1.1, small: true });
    }
  }

  onRamp() {
    this.ramps++;
    this.rampCombo = (this.time - this.lastRampT < 5) ? this.rampCombo + 1 : 1;
    this.lastRampT = this.time;
    const rp = 20000 + 25000 * (this.rampCombo - 1);
    this.addScore(rp, 150, 300, 4000);
    this.major('ramp', 135, 320);
    this.emit('rampMade', { combo: this.rampCombo, n: this.ramps });
    this.modeEvent('shot', 'ramp');
    this.modeEvent('ramp');
    if (this.wiz) { this.wizJackpot(135, 320); return; }
    if (this.mb && this.mb.jpRamp) { this.jackpot('Ramp', 135, 320); return; }
    if (!this.modeLit && !this.mode && !this.wizardLit) {
      this.rampsToMode--;
      if (this.rampsToMode <= 0) this.lightMode();
      else this.say(N.ramp, 'še ' + this.rampsToMode + '× do misije', PAL.cyan, { dur: 1.2, small: true });
    } else if (this.rampCombo >= 2 && !this.mode) {
      this.say('RAMPA ×' + this.rampCombo, '+' + fmt(rp), PAL.cyan, { dur: 1.2 });
    }
  }

  onScoop(b, force) {
    if (b.scoopCool > 0 || b.captured) return;
    // hitra žogica od zgoraj preskoči luknjo; ujame se strel od spredaj ali počasna žogica
    const sp = Math.hypot(b.vx, b.vy);
    if (!force && !((b.vy < 0 && sp < 2800) || sp < 650)) return;
    b.captured = true; b.vx = 0; b.vy = 0; b.x = SCOOP.x; b.y = SCOOP.y;
    this.emit('scoopEnter', { x: SCOOP.x, y: SCOOP.y });
    this.major('scoop', SCOOP.x, SCOOP.y);
    if (this.tilted) { this.after(1, () => this.ejectFromScoop(b)); return; }

    this.modeEvent('shot', 'scoop');

    if (this.extraLit) {
      this.extraLit = false; this.extraGiven = true; this.extraBalls++;
      this.say(N.extraBall + '!', 'Rondal ti je izsekal novo žogico', PAL.magenta, { anim: 'zoom' });
      this.emit('extraBall', {});
    }

    if (this.wiz) {
      this.wizJackpot(SCOOP.x, SCOOP.y - 40, 2);
      this.after(1, () => this.ejectFromScoop(b));
      return;
    }
    if (this.wizardLit && !this.mb && !this.mode) { this.startWizard(b); return; }

    if (this.mb) {
      if (this.mb.superLit) {
        const v = Math.round(this.jackpotValue * 2.5 / 1000) * 1000;
        this.addScore(v, SCOOP.x, SCOOP.y - 40, 20000);
        this.maxJackpot = Math.max(this.maxJackpot, v);
        this.mb.superLit = false; this.mb.jpOrbit = true; this.mb.jpRamp = true;
        this.jackpotValue += 100000;
        this.say('SUPER JACKPOT', N.superJackpot + ' · ' + fmt(v), PAL.gold, { anim: 'jackpot', dur: 3 });
        this.emit('superJackpot', { value: v, x: SCOOP.x, y: SCOOP.y });
        this.after(2.2, () => this.ejectFromScoop(b));
      } else {
        const v = 50000;
        this.addScore(v, SCOOP.x, SCOOP.y - 40, 5000);
        this.say(N.scoop, fmt(v), PAL.gold, { dur: 1.4 });
        this.after(0.9, () => this.ejectFromScoop(b));
      }
      return;
    }

    if (this.modeLit && !this.mode) { this.startMode(b); return; }

    if (this.lockLit) {
      this.lockLit = false;
      this.locks++;
      this.emit('lock', { n: this.locks });
      if (this.locks < 2) {
        this.balls.splice(this.balls.indexOf(b), 1);   // žoga ostane v talilnici (vidno)
        this.say('LOCK: ' + N.lock[0], 'še ' + N.lock[1] + ' za MULTIBALL', PAL.code, { anim: 'zoom' });
        this.spawnLater(1.6, () => this.serveBall());
      } else {
        this.locks = 0;
        this.startMultiball(b);
      }
      return;
    }

    this.addScore(25000, SCOOP.x, SCOOP.y - 40, 3000);
    this.say(N.scoop, '+25.000', PAL.melt, { dur: 1.1, small: true });
    this.after(1.0, () => this.ejectFromScoop(b));
  }

  /* ---------------- multiball ---------------- */
  startMultiball(scoopBall) {
    this.mbCount++;
    this.jackpotValue = 500000 + 250000 * (this.mbCount - 1);
    this.mb = { jpOrbit: true, jpRamp: true, superLit: false, addUsed: false, jackpots: 0 };
    this.ballSaveUntil = this.time + CFG.multiballSaveSek;
    this.say('MULTIBALL!', 'skupina Impol: FT in PCP = JACKPOT', PAL.gold, { anim: 'multiball', dur: 3.2 });
    this.emit('multiball', {});
    this.after(1.6, () => this.ejectFromScoop(scoopBall));
    this.spawnLater(2.3, () => this.autoLaunch());
    this.spawnLater(3.2, () => this.ejectFromScoop(null));
  }

  jackpot(shot, x, y) {
    const v = this.jackpotValue;
    this.addScore(v, x, y, 10000);
    this.maxJackpot = Math.max(this.maxJackpot, v);
    this.mb['jp' + shot] = false;
    this.mb.jackpots++;
    this.jackpotValue += 100000;
    this.say((shot === 'Orbit' ? 'FT' : 'PCP') + ' JACKPOT', fmt(v), PAL.gold, { anim: 'jackpot', dur: 2.4 });
    this.emit('jackpot', { value: v, x, y });
    if (!this.mb.jpOrbit && !this.mb.jpRamp) {
      this.mb.superLit = true;
      this.after(2.4, () => { if (this.mb && this.mb.superLit) this.say('SUPER JACKPOT', N.superJackpot + ' → ' + N.scoop, PAL.gold); });
    }
  }

  endMultiball() {
    this.mb = null;
    this.say('KONEC MULTIBALLA', 'jackpot: ' + fmt(this.jackpotValue), PAL.gold);
    this.emit('multiballEnd', {});
  }

  /* ---------------- misije ---------------- */
  nextModeIndex() {
    for (let k = 0; k < 4; k++) {
      const i = (this.modeIdx + k) % 4;
      if (!this.modesDone[i]) return i;
    }
    return 0;
  }

  lightMode(quiet) {
    if (this.modeLit || this.mode || this.wiz || this.wizardLit) return;
    this.modeLit = true;
    this.rampsToMode = CFG.rampZaMisijo + Math.min(2, this.modesCompleted);
    if (!quiet) this.say('MISIJA PRIŽGANA', MODES[this.nextModeIndex()].ime + ' → ' + N.scoop, PAL.melt);
    this.emit('modeLit', {});
  }

  startMode(b) {
    const i = this.nextModeIndex();
    const def = MODES[i];
    this.modeLit = false;
    this.mode = { i, def, t: def.cas, prog: 0, value: def.zacetek || 0, running: false,
      shots: new Set(['orbit', 'ramp', 'scoop', 'bug', 'review']) };
    this.emit('modeStart', { i, def });
    const anim = def.id === 'valjarna' ? 'roll' : def.id === 'talina' ? 'melt' : 'terminal';
    const lines = def.id === 'hotfix'
      ? ['$ ssh mainframe', '! z/VSE: 500 Error', '$ git checkout -b hotfix']
      : def.id === 'sprint' ? ['$ alcad sprint start', '> FT PCP LLT', '> STAMPAL ALCAD · GO!'] : [];
    this.say(def.polno || def.ime, def.opis, def.barva, { anim, lines, dur: 4.5, mode: i });
    this.after(2.6, () => {
      if (this.mode && this.mode.def === def) this.mode.running = true;
      this.ballSaveUntil = Math.max(this.ballSaveUntil, this.time + 6);
      this.ejectFromScoop(b);
    });
  }

  modeTick(dt) {
    const m = this.mode;
    if (!m || !m.running) return;
    m.t -= dt;
    if (m.def.id === 'hotfix') {
      m.value = Math.max(0, Math.round(m.def.zacetek * (m.t / m.def.cas) / 10000) * 10000);
    }
    if (m.t <= 0) this.failMode(false);
  }

  modeEvent(kind, data) {
    const m = this.mode;
    if (!m || !m.running) return;
    const id = m.def.id;
    if (id === 'talina' && kind === 'bumper') {
      m.prog++;
      this.addScore(10000, data.x, data.y - 40);
      this.emit('modeProgress', { i: m.i, prog: m.prog, goal: m.def.cilj });
      if (m.prog >= m.def.cilj) this.completeMode(m.def.nagrada);
    } else if (id === 'valjarna' && (kind === 'spin' || kind === 'orbit')) {
      const add = kind === 'spin' ? 1 : 12;
      m.prog += add;
      this.addScore(add * 1500);
      this.emit('modeProgress', { i: m.i, prog: m.prog, goal: m.def.cilj });
      if (m.prog >= m.def.cilj) this.completeMode(m.def.nagrada);
    } else if (id === 'hotfix' && kind === 'ramp') {
      this.completeMode(Math.max(250000, m.value));
    } else if (id === 'sprint' && kind === 'shot' && m.shots.has(data)) {
      m.shots.delete(data);
      m.prog++;
      this.addScore(100000);
      this.emit('modeProgress', { i: m.i, prog: m.prog, goal: m.def.cilj, shot: data });
      this.say('NALOGA OPRAVLJENA', (m.def.cilj - m.shots.size) + ' / ' + m.def.cilj, PAL.code, { dur: 1.2, small: true });
      if (m.shots.size === 0) this.completeMode(m.def.nagrada);
    }
  }

  completeMode(award) {
    const m = this.mode;
    this.mode = null;
    this.addScore(award, 282, 560, 25000);
    this.modesDone[m.i] = true;
    this.modesCompleted++;
    this.modeIdx = (m.i + 1) % 4;
    this.rampsToMode = CFG.rampZaMisijo + Math.min(2, this.modesCompleted);
    this.say(m.def.ime + ' OPRAVLJENA', fmt(award), m.def.barva, { anim: 'jackpot', dur: 3 });
    this.emit('modeComplete', { i: m.i, def: m.def, award });
    if (this.modesDone.every(Boolean)) {
      this.wizardLit = true;
      this.after(3, () => this.say('NAROČILO PRIPRAVLJENO', N.scoop + ' → FINALE', PAL.gold, { anim: 'zoom', dur: 3 }));
      this.emit('wizardLit', {});
    }
  }

  failMode(silent) {
    const m = this.mode;
    this.mode = null;
    this.modeIdx = (m.i + 1) % 4;
    this.emit('modeFail', { i: m.i, def: m.def });
    if (!silent) this.say('ČAS JE POTEKEL', m.def.ime + ' ni uspela', PAL.red, { dur: 2 });
  }

  /* ---------------- wizard: Naročilo izpolnjeno ---------------- */
  startWizard(b) {
    this.wizardLit = false;
    this.wiz = { value: 1000000, hits: 0, total: 0 };
    this.wizards++;
    this.ballSaveUntil = this.time + CFG.wizardSaveSek;
    this.say('NAROČILO IZPOLNJENO', 'izvoz na 50 trgov — vse je JACKPOT', PAL.gold, { anim: 'wizard', dur: 4 });
    this.emit('wizardStart', {});
    this.after(3.2, () => this.ejectFromScoop(b));
    this.spawnLater(3.8, () => this.autoLaunch());
    this.spawnLater(4.6, () => this.ejectFromScoop(null));
    this.spawnLater(5.4, () => this.autoLaunch());
  }

  wizJackpot(x, y, k = 1) {
    const w = this.wiz;
    if (!w) return;
    const v = w.value * k;
    this.addScore(v, x, y, 10000);
    w.total += v; w.hits++;
    this.maxJackpot = Math.max(this.maxJackpot, v);
    w.value += 100000;
    this.emit('jackpot', { value: v, x, y, wizard: true });
    if (w.hits % 3 === 1) this.say('JACKPOT', fmt(v), PAL.gold, { anim: 'jackpot', dur: 1.6 });
  }

  endWizard(award) {
    const w = this.wiz;
    this.wiz = null;
    if (award) {
      const bonus = 2000000 + w.total / 2;
      this.addScore(bonus, 282, 540);
      this.say('IZVOZNIK LETA', fmt(bonus), PAL.gold, { anim: 'jackpot', dur: 3.5 });
    }
    this.modesDone = [false, false, false, false];
    this.modeIdx = 0;
    this.modeLit = true;
    this.emit('wizardEnd', { total: w.total });
  }

  /* ---------------- vnos ---------------- */
  setFlipper(side, down) {
    const f = this.T.flippers[side === 'L' ? 0 : 1];
    if (f.pressed === down) return;
    f.pressed = down;
    if (this.state !== 'play' || this.tilted) return;
    this.emit('flipper', { side, down });
    if (!down) return;
    const waiting = this.balls.length === 1 && this.inPlunger(this.balls[0]) && this.skillArmed;
    if (waiting) this.skillLane = (this.skillLane + (side === 'L' ? 2 : 1)) % 3;
    else {
      const a = this.alu;
      this.alu = side === 'L' ? [a[1], a[2], a[0]] : [a[2], a[0], a[1]];
    }
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
    let any = false;
    for (const b of this.balls) {
      if (!this.inPlunger(b)) continue;
      b.y = PLUNGER_Y - BR - 1;
      b.vy = -(900 + 1950 * p);
      b.vx = 0;
      any = true;
    }
    if (!any) return;
    if (!this.ballSaveUntil || this.ballSaveUntil < this.time) this.ballSaveUntil = this.time + CFG.ballSaveSek;
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
        this.lockLit = false;
        this.say('TILT', 'flipperji izklopljeni', PAL.red, { anim: 'tilt', dur: 3 });
        this.emit('tilt', {});
      } else {
        this.say('POZOR', 'opozorilo ' + this.tiltWarn + '/2', PAL.red, { dur: 1.2 });
        this.emit('tiltWarn', { n: this.tiltWarn });
      }
    }
  }

  /* ---------------- glavna posodobitev ---------------- */
  update(dt) {
    this.time += dt;
    const T = this.T;

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
    T.plunger.ay = T.plunger.by = PLUNGER_Y + this.plungerPull * 28;
    T.plunger.miny = T.plunger.ay; T.plunger.maxy = T.plunger.ay;

    const en = this.state === 'play' && !this.tilted;
    for (const f of T.flippers) f.enabled = en;

    // fizika
    const n = Math.max(1, Math.round(dt / STEP));
    const sdt = dt / n;
    for (let i = 0; i < n; i++) this.phys.step(sdt, this.balls);

    // ohladitve in animacije elementov
    for (const s of T.segs) { if (s.cool > 0) s.cool -= dt; }
    for (const c of T.bumpers) {
      if (c.cool > 0) c.cool -= dt;
      c.flash = Math.max(0, c.flash - dt * 4);
      c.pop = Math.max(0, c.pop - dt * 7);
    }
    for (const sl of T.slings) { sl.flash = Math.max(0, sl.flash - dt * 4); sl.bend = Math.max(0, sl.bend - dt * 9); }
    for (const d of T.drops) d.sink += ((d.active ? 0 : 1) - d.sink) * Math.min(1, dt * 18);
    T.review.wobble = Math.max(0, T.review.wobble - dt * 3);

    // žogice
    const anyHeld = T.flippers.some(f => f.pressed);
    for (const b of this.balls.slice()) {
      if (b.scoopCool > 0) b.scoopCool -= dt;
      if (b.captured) { b.anchorT = this.time; continue; }
      b.trail.push(b.x, b.y);
      if (b.trail.length > 24) b.trail.splice(0, 2);
      if (b.y > H + 30) { this.drain(b); continue; }
      if (!insideTable(b.x, b.y) && b.y < H) {
        // varovalo — ne bi se smelo zgoditi
        this.emit('escape', { x: b.x, y: b.y });
        b.x = PLUNGE_X; b.y = PLUNGER_Y - BR - 1; b.vx = 0; b.vy = 0; b.layer = 0;
      }
      // kickback v levem outlanu
      if (b.x < 55 && b.y > 880 && b.vy > 0 && this.kickback && !this.tilted && this.state === 'play') {
        b.x = 37; b.y = 900; b.vx = 0; b.vy = -2100;
        this.kickback = false;
        this.say(N.sling + '!', 'kickback · spinner ga spet prižge', PAL.code, { dur: 1.4, small: true });
        this.emit('kickback', { x: 37, y: 920 });
      }
      // iskanje zataknjene žogice
      if (this.inPlunger(b) || anyHeld || this.state !== 'play') { b.ax = b.x; b.ay = b.y; b.anchorT = this.time; }
      else if ((b.x - b.ax) ** 2 + (b.y - b.ay) ** 2 > 36) { b.ax = b.x; b.ay = b.y; b.anchorT = this.time; }
      else if (this.time - b.anchorT > 4) {
        b.vy = -900; b.vx = (Math.random() - 0.5) * 600;
        b.anchorT = this.time;
        this.emit('ballSearch', { x: b.x, y: b.y });
        if (this.time - (this.lastSearchMsg || -99) > 8) { this.lastSearchMsg = this.time; this.say(N.servis, 'na poti — sproščam žogico', PAL.cyan, { dur: 1.4, small: true }); }
      }
    }

    // skill shot okno
    if (this.skillArmed && this.skillUntil === 0 && this.balls.some(b => !this.inPlunger(b) && b.y < 880)) this.skillUntil = this.time;
    if (this.skillArmed && this.skillUntil > 0 && this.time > this.skillUntil + 6) this.skillArmed = false;

    // spinner
    const sp = this.spinner;
    if (sp.w > 0.2) {
      sp.angle += sp.w * dt;
      sp.w *= Math.exp(-1.4 * dt);
      const half = Math.floor(sp.angle / Math.PI);
      if (half !== sp.half) {
        sp.half = half;
        this.addScore(150, undefined, undefined, 50);
        this.spins++;
        this.emit('spin', {});
        this.modeEvent('spin');
        if (this.spins % CFG.spinZaKickback === 0 && !this.kickback && this.state === 'play') {
          this.kickback = true;
          this.say(N.sling + ' KICKBACK', N.orbit + ' je napolnil', PAL.code, { dur: 1.4, small: true });
          this.emit('kickbackLit', {});
        }
      }
    } else sp.w = 0;

    this.modeTick(dt);
    const hot = this.mode && this.mode.def.id === 'talina' ? 0.35 : this.wiz ? 0.6 : 0;
    this.heat += (hot - this.heat) * Math.min(1, dt * 0.25);
    this.heat = Math.max(0, Math.min(1, this.heat - dt * 0.03));
    this.tiltMeter = Math.max(0, this.tiltMeter - dt * 0.6);
    if (this.state === 'play') this.playSec = this.time - this.startT;
    this.computeLamps();
  }

  /* ---------------- stanje luči ---------------- */
  computeLamps() {
    const L = this.lamps, t = this.time;
    const set = (id, v, c) => { const o = L[id] || (L[id] = { v: 0, c: null }); o.v = v; o.c = c || null; };
    const m = this.mode, mb = this.mb, wiz = this.wiz;
    const sprint = m && m.running && m.def.id === 'sprint' ? m.shots : null;
    const play = this.state === 'play' || this.state === 'bonus';

    for (let i = 0; i < 3; i++) {
      const skill = this.skillArmed && this.skillLane === i;
      set('lane' + i, this.alu[i] ? 1 : skill ? 3 : 0, skill ? PAL.white : null);
    }
    for (let k = 2; k <= 6; k++) set('mult' + k, this.mult >= k ? 1 : 0);

    const comboWin = play && t - this.lastMajorT < CFG.comboOkno;
    // orbit
    if (wiz) set('arrOrbit', 3, PAL.gold);
    else if (mb && mb.jpOrbit) set('arrOrbit', 3, PAL.gold);
    else if (sprint && sprint.has('orbit')) set('arrOrbit', 3, PAL.code);
    else if (m && m.def.id === 'valjarna') set('arrOrbit', 3, PAL.cyan);
    else if (comboWin) set('arrOrbit', 2, PAL.cyan);
    else set('arrOrbit', 0);
    // rampa
    if (wiz) set('arrRamp', 3, PAL.gold);
    else if (mb && mb.jpRamp) set('arrRamp', 3, PAL.gold);
    else if (m && m.def.id === 'hotfix') set('arrRamp', 3, PAL.red);
    else if (sprint && sprint.has('ramp')) set('arrRamp', 3, PAL.code);
    else if (!this.modeLit && !m && !this.wizardLit && play) set('arrRamp', 2, PAL.melt);
    else if (comboWin) set('arrRamp', 2, PAL.cyan);
    else set('arrRamp', 0);
    // talilnica
    if (wiz || this.wizardLit) set('arrScoop', 3, PAL.gold);
    else if (mb && mb.superLit) set('arrScoop', 3, PAL.gold);
    else if (sprint && sprint.has('scoop')) set('arrScoop', 3, PAL.code);
    else if (this.extraLit) set('arrScoop', 3, PAL.magenta);
    else if (this.modeLit && !m && !mb) set('arrScoop', 2, PAL.melt);
    else if (this.lockLit && !mb) set('arrScoop', 2, PAL.code);
    else set('arrScoop', 0);
    // BUG
    if (wiz) set('arrBug', 3, PAL.gold);
    else if (sprint && sprint.has('bug')) set('arrBug', 3, PAL.code);
    else if (mb && !mb.addUsed) set('arrBug', 2, PAL.cyan);
    else if (!this.lockLit && !mb && play) set('arrBug', 2, PAL.code);
    else set('arrBug', 0);
    // code review
    if (wiz) set('arrReview', 3, PAL.gold);
    else if (sprint && sprint.has('review')) set('arrReview', 3, PAL.code);
    else if (this.review === this.reviewNeed - 1 && play) set('arrReview', 2, PAL.magenta);
    else set('arrReview', 0);
    for (let i = 0; i < 3; i++) set('rev' + i, this.review > i ? 1 : 0);

    set('wizard', wiz ? 3 : this.wizardLit ? 2 : 0, PAL.gold);
    const next = this.nextModeIndex();
    for (let i = 0; i < 4; i++) {
      const c = MODES[i].barva;
      if (wiz) set('mode' + i, 3, c);
      else if (m && m.i === i) set('mode' + i, 3, c);
      else if (this.modesDone[i]) set('mode' + i, 1, c);
      else if (this.modeLit && next === i && play) set('mode' + i, 2, c);
      else set('mode' + i, 0, c);
    }
    set('lock1', this.locks >= 1 ? 1 : (this.lockLit && this.locks === 0 ? 3 : 0));
    set('lock2', this.locks >= 2 ? 1 : (this.lockLit && this.locks === 1 ? 3 : 0));
    set('extra', this.extraLit ? 3 : this.extraBalls > 0 ? 1 : 0);
    set('kick', this.kickback && play ? 1 : 0);
    const saving = t < this.ballSaveUntil && this.state === 'play';
    set('save', saving ? (this.ballSaveUntil - t < 3 ? 3 : 2) : 0);
    set('spin', this.spinner.w > 2 ? 1 : (m && m.def.id === 'valjarna' ? 3 : 0));
    const rc = play && t - this.lastRampT < 5 ? this.rampCombo : 0;
    for (let i = 0; i < 3; i++) {
      if (wiz || (mb && mb.jpRamp)) set('rampC' + i, 3, PAL.gold);
      else if (m && m.def.id === 'hotfix') set('rampC' + i, 3, PAL.red);
      else set('rampC' + i, rc > i ? 1 : 0, PAL.cyan);
    }
    const gi = this.tilted ? 0 : 1;
    for (const l of this.T.lamps) if (l.group === 'gi') set(l.id, gi);
  }

  /** podatki za stranske plošče in DMD */
  summary() {
    const m = this.mode;
    return {
      state: this.state, score: this.score, ball: Math.min(this.ballNum, CFG.steviloZogic), balls: CFG.steviloZogic,
      mult: this.mult, locks: this.locks, lockLit: this.lockLit, multiball: !!this.mb, wizard: !!this.wiz,
      wizardLit: this.wizardLit, modeLit: this.modeLit, modesDone: this.modesDone.slice(),
      mode: m ? { i: m.i, id: m.def.id, name: m.def.ime, t: Math.max(0, m.t), total: m.def.cas, prog: m.prog,
        goal: m.def.cilj || 0, value: m.value, running: m.running, color: m.def.barva } : null,
      next: this.nextModeIndex(), rampsToMode: this.rampsToMode, kickback: this.kickback,
      ballSave: Math.max(0, this.ballSaveUntil - this.time), extraBalls: this.extraBalls, extraLit: this.extraLit,
      combo: this.time - this.lastMajorT < CFG.comboOkno ? this.combo : 0, jackpot: this.jackpotValue,
      tiltWarn: this.tiltWarn, tilted: this.tilted, bonus: this.bonus,
    };
  }
}
