/* =====================================================================
   ALU MIZA — PRAVILA (vtičnik jedra engine/game.js)
   Misije, multiball z locki, jackpoti, wizard, mystery, skill shot,
   A·L·U kanali, B·U·G tarče, kickback, spinner.
   Brez DOM-a: teče enako v igri in v testih.
   ===================================================================== */
import { Rules, fmt } from '../../engine/game.js';
import { CFG, MODES, PAL } from './config.js';
import { SCOOP } from './table.js';

const N = CFG.imena;
// izmet iz livarne med misijo LIVARNA: proti bumperjem
const EJECT_BUMPERS = { vx: -600, rvx: -80, vy: -900, rvy: -80 };

export class AluRules extends Rules {
  init(g) {
    this.heat = 0;                    // segrevanje peči (izris taline)
    this.spinner = g.T.spinners[0].state;
  }
  say(...a) { this.g.say(...a); }
  emit(n, d) { this.g.emit(n, d); }
  addScore(...a) { this.g.addScore(...a); }

  resetGame() {
    Object.assign(this, {
      extraLit: false, extraGiven: false, mysteryEB: false,
      lockLit: false, locks: 0, mb: null, jackpotValue: 500000, mbCount: 0, bugSets: 0,
      kickback: true, spins: 0, orbits: 0, ramps: 0, rampsToMode: CFG.rampZaMisijo,
      lastRampT: -99, rampCombo: 0, review: 0, reviewNeed: CFG.reviewZaMystery,
      modeIdx: 0, modeLit: true, mode: null, modesDone: [false, false, false, false],
      modesCompleted: 0, wizardLit: false, wiz: null, wizards: 0,
    });
  }
  resetBall() {
    Object.assign(this, { alu: [false, false, false], skillLane: 0, skillArmed: false, skillUntil: 0 });
  }
  isMulti() { return !!(this.mb || this.wiz); }
  /** jakost glasbe: 1 igra, 2 misija, 3 multiball, 4 finale */
  musicLevel() { return this.wiz ? 4 : this.mb ? 3 : this.mode ? 2 : 1; }
  /** prekinjena igra (meni → končaj igro) */
  abort() { this.mode = null; this.mb = null; this.wiz = null; }

  /* ---------------- žogice ---------------- */
  onBallStart() {
    this.skillLane = Math.floor(Math.random() * 3);
    this.skillArmed = true;
    this.skillUntil = 0;
  }
  eject(b) {
    const toBumpers = this.mode && this.mode.def.id === 'talina';
    return this.g.ejectSaucer('scoop', b, toBumpers ? EJECT_BUMPERS : undefined);
  }
  onBallEnd() {
    if (this.mode) this.failMode(true);
    if (this.wiz) this.endWizard(false);
    if (this.mb) this.mb = null;
  }
  onLastBall() {
    if (this.wiz) this.endWizard(true);
    if (this.mb) this.endMultiball();
  }
  onTilt() { this.lockLit = false; }

  /* ---------------- stikala ---------------- */
  onSwitch(name, d) {
    const g = this.g;
    switch (name) {
      case 'sling':
        this.addScore(110, d.x, d.y, 100);
        this.emit('sling', { x: d.x, y: d.y, side: d.side });
        break;
      case 'drop': this.onDrop(d.s); break;
      case 'dropBank': this.onDropsComplete(); break;
      case 'review': this.onReview(d.s, d.x, d.y); break;
      case 'bumper': this.onBumper(d.c); break;
      case 'lane': this.onLane(d.idx); break;
      case 'orbit': if (d.b.vy < 0) this.onOrbit(); break;
      case 'rampMade': this.onRampMade(); break;
      case 'inlane': this.addScore(1000, d.x, d.y - 20, 500); this.emit('inlane', { x: d.x, y: d.y }); break;
      case 'outlane': this.addScore(5000, d.x, d.y - 20, 500); this.emit('outlane', { x: d.x, y: d.y, side: d.idx }); break;
      case 'spinner': this.onSpin(); break;
      case 'scoop': this.onScoop(d.b); break;
      default: void g;
    }
  }

  onBumper(c) {
    this.skillArmed = false;
    this.addScore(this.wiz ? 50000 : 1000, c.x, c.y - 30, 200);
    this.heat = Math.min(1, this.heat + (this.mode && this.mode.def.id === 'talina' ? 0.08 : 0.025));
    this.emit('bumper', { x: c.x, y: c.y, i: c.i });
    this.modeEvent('bumper', c);
  }

  onDrop(s) {
    this.addScore(5000, s.ax - 22, s.ay + 18, 2000);
    this.emit('drop', { x: s.ax, y: (s.ay + s.by) / 2, i: s.data.idx });
    this.modeEvent('shot', 'bug');
    if (this.wiz) this.wizJackpot(s.ax - 30, s.ay);
  }

  onDropsComplete() {
    const g = this.g;
    this.addScore(25000, 480, 620, 5000);
    this.emit('dropsComplete', { x: 520, y: 620 });
    if (this.wiz) { /* že točkovano */ }
    else if (this.mb) {
      if (!this.mb.addUsed) {
        this.mb.addUsed = true;
        this.say('NOVA ' + N.extraBall, 'add-a-ball', PAL.code, { anim: 'terminal', lines: ['$ alcloud deploy --replicas +1', '> Rondal: nova rondela'] });
        this.emit('addABall', {});
        g.addABall(0.8, 6);
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
    g.resetBank('bug', 1.2);
  }

  onReview(s, x, y) {
    this.addScore(5000, x + 18, y + 30, 1000);
    this.emit('review', { x: x, y: y, n: this.review + 1 });
    this.g.shot('review', 282, 430);
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
    const g = this.g, r = this;
    const opts = [
      { w: 30, ok: true, name: 'TOČKE', run() { const p = 100000 * (1 + Math.floor(Math.random() * 3)); g.addScore(p, 282, 400); return '+' + fmt(p); } },
      { w: 15, ok: !r.lockLit && !r.mb && !r.wiz, name: 'LOCK PRIŽGAN', run() { r.lockLit = true; return N.scoop + ' čaka'; } },
      { w: 3, ok: !r.mysteryEB, name: N.extraBall + '!', run() { r.mysteryEB = true; g.extraBalls++; g.emit('extraBall', {}); return 'extra ball'; } },
      { w: 15, ok: true, name: N.ballSave, run() { g.ballSaveUntil = Math.max(g.ballSaveUntil, g.time + 15); return 'ball save 15 s'; } },
      { w: 12, ok: g.mult < 6, name: 'BONUS +1×', run() { g.mult++; return 'bonus ×' + g.mult; } },
      { w: 12, ok: !r.modeLit && !r.mode && !r.wizardLit && !r.wiz, name: 'MISIJA PRIŽGANA', run() { r.lightMode(true); return MODES[r.nextModeIndex()].ime; } },
      { w: 10, ok: !r.kickback, name: N.sling, run() { r.kickback = true; return 'kickback: levi outlane varen'; } },
    ].filter(o => o.ok);
    let x = Math.random() * opts.reduce((a, o) => a + o.w, 0);
    let pick = opts[0];
    for (const o of opts) { x -= o.w; if (x <= 0) { pick = o; break; } }
    const sub = pick.run();
    this.emit('mystery', { name: pick.name });
    this.say(pick.name, sub, PAL.magenta, { anim: 'terminal', lines: ['$ ' + N.mystery.toLowerCase() + ' review --mystery', '> ' + N.mystery + ': approved ✓'], dur: 3 });
  }

  onLane(idx) {
    const g = this.g;
    const x = 240 + 50 * idx;
    if (this.skillArmed && idx === this.skillLane && (this.skillUntil === 0 || g.time < this.skillUntil + 6)) {
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
      if (g.mult < 6) {
        g.mult++;
        this.say('BONUS ×' + g.mult, 'A·L·U kanali zaprti', PAL.cyan);
      } else {
        this.addScore(50000, 290, 160);
        this.say('ALU MAX', '+50.000', PAL.cyan);
      }
      this.emit('lanesComplete', { mult: g.mult });
    }
  }

  onOrbit() {
    const g = this.g;
    this.orbits++;
    g.shot('orbit', 60, 330);
    this.modeEvent('shot', 'orbit');
    this.modeEvent('orbit');
    this.emit('orbit', { combo: g.combo });
    if (this.wiz) { this.wizJackpot(80, 320); return; }
    if (this.mb && this.mb.jpOrbit) { this.jackpot('Orbit', 80, 320); return; }
    this.addScore(15000, 90, 300, 3000);
    if (this.orbits >= CFG.orbitZaExtraBall && !this.extraGiven && !this.extraLit) {
      this.extraLit = true;
      this.say(N.extraBall + ' PRIŽGANA', 'extra ball → ' + N.scoop, PAL.magenta);
      this.emit('extraBallLit', {});
    } else if (g.combo < 2 && !this.mode) {
      this.say(N.orbit, '+15.000', PAL.cyan, { dur: 1.1, small: true });
    }
  }

  onRampMade() {
    const g = this.g;
    this.ramps++;
    this.rampCombo = (g.time - this.lastRampT < 5) ? this.rampCombo + 1 : 1;
    this.lastRampT = g.time;
    const rp = 20000 + 25000 * (this.rampCombo - 1);
    this.addScore(rp, 150, 300, 4000);
    g.shot('ramp', 135, 320);
    this.emit('rampMade', { combo: this.rampCombo, n: this.ramps, x: 140, y: 290 });
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

  onSpin() {
    const g = this.g;
    this.addScore(150, undefined, undefined, 50);
    this.spins++;
    this.emit('spin', {});
    this.modeEvent('spin');
    if (this.spins % CFG.spinZaKickback === 0 && !this.kickback && g.state === 'play') {
      this.kickback = true;
      this.say(N.sling + ' KICKBACK', N.orbit + ' je napolnil', PAL.code, { dur: 1.4, small: true });
      this.emit('kickbackLit', {});
    }
  }

  /** žogica je že ujeta v livarni (engine captureSaucer) */
  onScoop(b) {
    const g = this.g;
    g.shot('scoop', SCOOP.x, SCOOP.y);
    this.modeEvent('shot', 'scoop');

    if (this.extraLit) {
      this.extraLit = false; this.extraGiven = true; g.extraBalls++;
      this.say(N.extraBall + '!', 'Rondal ti je izsekal novo žogico', PAL.magenta, { anim: 'zoom' });
      this.emit('extraBall', {});
    }

    if (this.wiz) {
      this.wizJackpot(SCOOP.x, SCOOP.y - 40, 2);
      g.after(1, () => this.eject(b));
      return;
    }
    if (this.wizardLit && !this.mb && !this.mode) { this.startWizard(b); return; }

    if (this.mb) {
      if (this.mb.superLit) {
        const v = Math.round(this.jackpotValue * 2.5 / 1000) * 1000;
        this.addScore(v, SCOOP.x, SCOOP.y - 40, 20000);
        g.maxJackpot = Math.max(g.maxJackpot, v);
        this.mb.superLit = false; this.mb.jpOrbit = true; this.mb.jpRamp = true;
        this.jackpotValue += 100000;
        this.say('SUPER JACKPOT', N.superJackpot + ' · ' + fmt(v), PAL.gold, { anim: 'jackpot', dur: 3 });
        this.emit('superJackpot', { value: v, x: SCOOP.x, y: SCOOP.y });
        g.after(2.2, () => this.eject(b));
      } else {
        const v = 50000;
        this.addScore(v, SCOOP.x, SCOOP.y - 40, 5000);
        this.say(N.scoop, fmt(v), PAL.gold, { dur: 1.4 });
        g.after(0.9, () => this.eject(b));
      }
      return;
    }

    if (this.modeLit && !this.mode) { this.startMode(b); return; }

    if (this.lockLit) {
      this.lockLit = false;
      this.locks++;
      this.emit('lock', { n: this.locks });
      if (this.locks < 2) {
        g.balls.splice(g.balls.indexOf(b), 1);   // žoga ostane v talilnici (vidno)
        this.say('LOCK: ' + N.lock[0], 'še ' + N.lock[1] + ' za MULTIBALL', PAL.code, { anim: 'zoom' });
        g.spawnLater(1.6, () => g.serveBall());
      } else {
        this.locks = 0;
        this.startMultiball(b);
      }
      return;
    }

    this.addScore(25000, SCOOP.x, SCOOP.y - 40, 3000);
    this.say(N.scoop, '+25.000', PAL.melt, { dur: 1.1, small: true });
    g.after(1.0, () => this.eject(b));
  }

  /* ---------------- multiball ---------------- */
  startMultiball(scoopBall) {
    const g = this.g;
    this.mbCount++;
    this.jackpotValue = 500000 + 250000 * (this.mbCount - 1);
    this.mb = { jpOrbit: true, jpRamp: true, superLit: false, addUsed: false, jackpots: 0 };
    g.ballSaveUntil = g.time + CFG.multiballSaveSek;
    this.say('MULTIBALL!', 'skupina Impol: FT in PCP = JACKPOT', PAL.gold, { anim: 'multiball', dur: 3.2 });
    this.emit('multiball', {});
    g.after(1.6, () => this.eject(scoopBall));
    g.spawnLater(2.3, () => g.autoLaunch());
    g.spawnLater(3.2, () => this.eject(null));
  }

  jackpot(shot, x, y) {
    const g = this.g;
    const v = this.jackpotValue;
    this.addScore(v, x, y, 10000);
    g.maxJackpot = Math.max(g.maxJackpot, v);
    this.mb['jp' + shot] = false;
    this.mb.jackpots++;
    this.jackpotValue += 100000;
    this.say((shot === 'Orbit' ? 'FT' : 'PCP') + ' JACKPOT', fmt(v), PAL.gold, { anim: 'jackpot', dur: 2.4 });
    this.emit('jackpot', { value: v, x, y });
    if (!this.mb.jpOrbit && !this.mb.jpRamp) {
      this.mb.superLit = true;
      g.after(2.4, () => { if (this.mb && this.mb.superLit) this.say('SUPER JACKPOT', N.superJackpot + ' → ' + N.scoop, PAL.gold); });
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
    const g = this.g;
    const i = this.nextModeIndex();
    const def = MODES[i];
    this.modeLit = false;
    this.mode = { i, def, t: def.cas, prog: 0, value: def.zacetek || 0, running: false,
      shots: new Set(['orbit', 'ramp', 'scoop', 'bug', 'review']) };
    this.emit('modeStart', { i, def, color: def.barva });
    const anim = def.id === 'valjarna' ? 'roll' : def.id === 'talina' ? 'melt' : 'terminal';
    const lines = def.id === 'hotfix'
      ? ['$ ssh mainframe', '! z/VSE: 500 Error', '$ git checkout -b hotfix']
      : def.id === 'sprint' ? ['$ alcad sprint start', '> FT PCP LLT', '> STAMPAL ALCAD · GO!'] : [];
    this.say(def.polno || def.ime, def.opis, def.barva, { anim, lines, dur: 4.5, mode: i, goal: def.cilj });
    g.after(2.6, () => {
      if (this.mode && this.mode.def === def) this.mode.running = true;
      g.ballSaveUntil = Math.max(g.ballSaveUntil, g.time + 6);
      this.eject(b);
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
    this.emit('modeComplete', { i: m.i, def: m.def, award, color: m.def.barva });
    if (this.modesDone.every(Boolean)) {
      this.wizardLit = true;
      this.g.after(3, () => this.say('NAROČILO PRIPRAVLJENO', N.scoop + ' → FINALE', PAL.gold, { anim: 'zoom', dur: 3 }));
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
    const g = this.g;
    this.wizardLit = false;
    this.wiz = { value: 1000000, hits: 0, total: 0 };
    this.wizards++;
    g.ballSaveUntil = g.time + CFG.wizardSaveSek;
    this.say('NAROČILO IZPOLNJENO', 'izvoz na 50 trgov — vse je JACKPOT', PAL.gold, { anim: 'wizard', dur: 4 });
    this.emit('wizardStart', {});
    g.after(3.2, () => this.eject(b));
    g.spawnLater(3.8, () => g.autoLaunch());
    g.spawnLater(4.6, () => this.eject(null));
    g.spawnLater(5.4, () => g.autoLaunch());
  }

  wizJackpot(x, y, k = 1) {
    const w = this.wiz;
    if (!w) return;
    const v = w.value * k;
    this.addScore(v, x, y, 10000);
    w.total += v; w.hits++;
    this.g.maxJackpot = Math.max(this.g.maxJackpot, v);
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
  onFlipper(side) {
    const g = this.g;
    const waiting = g.balls.length === 1 && g.inPlunger(g.balls[0]) && this.skillArmed;
    if (waiting) this.skillLane = (this.skillLane + (side === 'L' ? 2 : 1)) % 3;
    else this.alu = g.rotateLanes(this.alu, side === 'L' ? -1 : 1);
  }

  /* ---------------- kickback v levem outlanu ---------------- */
  ballTick(b) {
    const g = this.g;
    if (b.x < 55 && b.y > 880 && b.vy > 0 && this.kickback && !g.tilted && g.state === 'play') {
      b.x = 33; b.y = 900; b.vx = 0; b.vy = -2100; b.kickT = g.time;
      this.kickback = false;
      this.say(N.sling + '!', 'kickback · spinner ga spet prižge', PAL.code, { dur: 1.4, small: true });
      this.emit('kickback', { x: 37, y: 920 });
    }
  }
  // ko žogica ob steni preleti vrh outlane vodila, jo usmeri poševno v igralno polje,
  // sicer se zaleti v spodnji rob odbojnika ob levi steni in pade nazaj v outlane
  substep() {
    const g = this.g;
    for (const b of g.balls) {
      if (b.kickT === undefined) continue;
      if (b.y < 672 && b.vy < 0) { b.vx = 1150; b.vy = -1750; b.kickT = undefined; }
      else if (g.time - b.kickT > 0.6) b.kickT = undefined;
    }
  }

  /* ---------------- posodobitev ---------------- */
  tick(dt) {
    const g = this.g;
    // skill shot okno
    if (this.skillArmed && this.skillUntil === 0 && g.balls.some(b => !g.inPlunger(b) && b.y < 880)) this.skillUntil = g.time;
    if (this.skillArmed && this.skillUntil > 0 && g.time > this.skillUntil + 6) this.skillArmed = false;
    this.modeTick(dt);
    const hot = this.mode && this.mode.def.id === 'talina' ? 0.35 : this.wiz ? 0.6 : 0;
    this.heat += (hot - this.heat) * Math.min(1, dt * 0.25);
    this.heat = Math.max(0, Math.min(1, this.heat - dt * 0.03));
  }

  /* ---------------- stanje luči ---------------- */
  lamps(set, t) {
    const g = this.g;
    const m = this.mode, mb = this.mb, wiz = this.wiz;
    const sprint = m && m.running && m.def.id === 'sprint' ? m.shots : null;
    const play = g.state === 'play' || g.state === 'bonus';

    for (let i = 0; i < 3; i++) {
      const skill = this.skillArmed && this.skillLane === i;
      set('lane' + i, this.alu[i] ? 1 : skill ? 3 : 0, skill ? PAL.white : null);
    }
    for (let k = 2; k <= 6; k++) set('mult' + k, g.mult >= k ? 1 : 0);

    const comboWin = play && t - g.lastMajorT < CFG.comboOkno;
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
    set('extra', this.extraLit ? 3 : g.extraBalls > 0 ? 1 : 0);
    set('kick', this.kickback && play ? 1 : 0);
    const saving = t < g.ballSaveUntil && g.state === 'play';
    set('save', saving ? (g.ballSaveUntil - t < 3 ? 3 : 2) : 0);
    set('spin', this.spinner.w > 2 ? 1 : (m && m.def.id === 'valjarna' ? 3 : 0));
    const rc = play && t - this.lastRampT < 5 ? this.rampCombo : 0;
    for (let i = 0; i < 3; i++) {
      if (wiz || (mb && mb.jpRamp)) set('rampC' + i, 3, PAL.gold);
      else if (m && m.def.id === 'hotfix') set('rampC' + i, 3, PAL.red);
      else set('rampC' + i, rc > i ? 1 : 0, PAL.cyan);
    }
    // B·U·G tarče utripajo, dokler lock ni prižgan
    for (const d of g.T.drops) d.pulse = !this.lockLit;
  }

  /* ---------------- DMD in paneli ---------------- */
  /** vrstica na DMD med igro (desno spodaj), ko ni misije */
  dmdIdle(s) {
    if (s.wizard) return { text: 'FINALE!', gold: true };
    if (s.multiball) return { text: 'MULTIBALL', gold: true };
    if (s.combo >= 2) return { text: 'COMBO ×' + s.combo };
    if (s.mult > 1) return { text: 'BONUS ×' + s.mult };
    if (s.lockLit) return { text: 'LOCK!' };
    return null;
  }
  /** info vrstica med misijo na DMD */
  modeInfo(m) {
    if (m.id === 'talina') return 'BUMPERJI ' + m.prog + '/' + m.goal;
    if (m.id === 'valjarna') return Math.min(m.goal, m.prog) + ' / ' + m.goal + ' M';
    if (m.id === 'hotfix') return 'RAMPA = ' + fmt(m.value);
    if (m.id === 'sprint') return 'NALOGE ' + m.prog + '/' + m.goal;
    return '';
  }

  summary() {
    const g = this.g, m = this.mode;
    return {
      locks: this.locks, lockLit: this.lockLit, multiball: !!this.mb, wizard: !!this.wiz,
      wizardLit: this.wizardLit, modeLit: this.modeLit, modesDone: this.modesDone.slice(),
      mode: m ? { i: m.i, id: m.def.id, name: m.def.ime, t: Math.max(0, m.t), total: m.def.cas, prog: m.prog,
        goal: m.def.cilj || 0, value: m.value, running: m.running, color: m.def.barva, info: this.modeInfo({ id: m.def.id, prog: m.prog, goal: m.def.cilj || 0, value: m.value }) } : null,
      next: this.nextModeIndex(), rampsToMode: this.rampsToMode, kickback: this.kickback,
      extraLit: this.extraLit, jackpot: this.jackpotValue, skillArmed: this.skillArmed && g.ballWaiting(),
    };
  }

  gameStats() {
    return { wizards: this.wizards, modes: this.modesCompleted, multiballs: this.mbCount };
  }
}
