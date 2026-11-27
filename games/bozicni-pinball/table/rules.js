/* =====================================================================
   BOŽIČNA MIZA »Trije dobri možje« — PRAVILA (vtičnik jedra ../../pinball/src/engine/game.js)
   Prompt 23: skill shot (Z·V·O·N) in super skill shot (zgornji flipper »Kepa«), ball save, kickback,
   bonus X, Darilni multiball (Parklji → Dimnik → vreča, 3 locki) z jackpoti na rampah in orbitih in
   super jackpotom v Jelki, add-a-ball, combo, extra ball v nabiralniku »Pisma«, adventni venec, jelka.
   Kljuke za prompt 24 (načini, mystery, wizard): this.mode, startMode(), mysteryLit, onVenecComplete().
   Brez DOM-a: teče enako v igri, testih, botu in merilcu strelov.
   ===================================================================== */
import { Rules, fmt } from '../../pinball/src/engine/game.js';
import { CFG, PAL, SHOTS } from './config.js';

const OPEN = { maxUp: 3400, maxAny: 3400 }, CLOSED = { maxUp: 0, maxAny: 0 };
const JP_SHOTS = ['orbitL', 'rampL', 'rampR', 'orbitR'];
const MAJOR = new Set(['orbitL', 'rampL', 'center', 'rampR', 'orbitR', 'kepa']);

export class BozicRules extends Rules {
  init(g) {
    this.heat = 0.12; this.trainT = 0;
    this.spinner = g.T.spinners[0].state;
    this.kepa = g.T.flippers.find(f => f.id === 'kepa');
  }
  say(...a) { this.g.say(...a); }
  emit(n, d) { this.g.emit(n, d); }
  addScore(...a) { this.g.addScore(...a); }

  resetGame() {
    Object.assign(this, {
      // lock in Darilni multiball
      lockLit: false, locksLit: 0, mb: null, mbCount: 0, jackpotValue: CFG.jackpotZacetek, jackpots: 0, superJackpots: 0,
      addABallUsed: false,
      // skill shot
      skillValue: CFG.skillShot, skills: 0, superSkills: 0,
      // nabiralnik »Pisma«: pismo prižgano na začetku, extra ball po rampah
      letterLit: true, letters: 0, rampsToLetter: 4, extraLit: false, extraGiven: false, ramps: 0,
      // jelka in venec
      treeLights: 0, treeDone: 0, venec: [false, false, false, false], venecDone: 0, mysteryLit: false,
      kickback: true, spins: 0, comboBest: 0, mode: null,
    });
  }
  resetBall() {
    Object.assign(this, { zvon: [false, false, false, false], skillLane: 0, skillArmed: false, skillUntil: 0,
      superArmed: false, superUntil: 0, superLanded: 0, postT: 0 });
    if (this.g.T.byId) this.g.setPost('post', false);
  }
  isMulti() { return !!this.mb; }
  musicLevel() { return this.mb ? 3 : this.mode ? 2 : 1; }
  abort() { this.mb = null; this.mode = null; }

  /* ---------------- luknje v orbitih: odprte / zaprte ---------------- */
  holes() {
    const g = this.g, T = g.T, play = g.state === 'play' && !g.tilted;
    const dim = T.saucers.find(s => s.id === 'dimnik'), pis = T.saucers.find(s => s.id === 'pisma');
    dim.capture = play && this.lockLit && !this.mb ? OPEN : CLOSED;
    pis.capture = play && !this.mb && (this.letterLit || this.extraLit) ? OPEN : CLOSED;
  }

  /* ---------------- žogice ---------------- */
  onBallStart() {
    this.skillLane = Math.floor(Math.random() * 4);
    this.skillArmed = true;
    this.skillUntil = 0;
  }
  /** izstrelitev: levi flipper držan → super skill shot (up-post gor, fiksna moč do zgornjega flipperja) */
  onLaunch(p) {
    const g = this.g;
    if (!this.skillArmed || g.balls.length !== 1) return p;
    const L = g.T.flippers.find(f => f.side === 'L' && f.py > 800);
    if (!L || !L.pressed) return p;
    this.superArmed = true;
    this.superUntil = g.time + 6;
    this.superLanded = 0;
    g.setPost('post', true);
    this.postT = 3;
    this.say('SUPER SKILL SHOT', 'zadeni KEPO z zgornjim flipperjem', PAL.white, { dur: 1.6, small: true });
    return 0.68;
  }
  onBallEnd() { if (this.mb) this.mb = null; }
  onLastBall() { if (this.mb) this.endMultiball(); }
  onTilt() { this.lockLit = false; this.holes(); }
  onDrain() {}

  /* ---------------- stikala ---------------- */
  onSwitch(name, d) {
    const g = this.g;
    switch (name) {
      case 'sling': this.addScore(110, d.x, d.y, 50); this.emit('sling', { x: d.x, y: d.y, side: d.side }); break;
      case 'bumper': this.onBumper(d.c); break;
      case 'lane': this.onLane(d.idx); break;
      case 'drop': this.onDrop(d.s); break;
      case 'dropBank': this.onDropsComplete(); break;
      case 'venec': this.onVenec(d.idx, d.x, d.y); break;
      case 'okrasek': this.onCenter(); break;
      case 'orbitL': if (d.b.vy < 0) this.onMajor('orbitL', 60, 440); break;
      case 'orbitR': if (d.b.vy < 0) this.onMajor('orbitR', 520, 440); break;
      case 'rampLMade': this.onRamp('rampL'); break;
      case 'rampRMade': this.onRamp('rampR'); break;
      case 'zanka': if (d.b.vy < 0 || this.superArmed) this.onKepa(d.b); break;
      case 'dimnik': this.onDimnik(d.b, d.saucer); break;
      case 'pisma': this.onPisma(d.b, d.saucer); break;
      case 'spinner': this.onSpin(); break;
      case 'inlane': this.addScore(1000, d.x, d.y - 20, 500); this.emit('inlane', { x: d.x, y: d.y }); break;
      case 'outlane': this.addScore(5000, d.x, d.y - 20, 500); this.emit('outlane', { x: d.x, y: d.y, side: d.idx }); break;
      case 'jelka': this.addScore(500, d.x, d.y, 100); this.emit('toyHit', { x: d.x, y: d.y }); break;
      default: void g;
    }
  }

  onBumper(c) {
    this.skillArmed = false;
    this.addScore(1000, c.x, c.y - 30, 200);
    this.emit('bumper', { x: c.x, y: c.y, i: c.i });
  }

  onLane(idx) {
    const g = this.g, x = 230 + 50 * idx;
    if (this.skillArmed && idx === this.skillLane && !this.superArmed && (this.skillUntil === 0 || g.time < this.skillUntil + 5)) {
      const v = this.skillValue;
      this.addScore(v, x, 150, 5000);
      this.skills++;
      this.skillValue += CFG.skillShotKorak;
      this.say('SKILL SHOT!', 'Z·V·O·N · +' + fmt(v), PAL.white, { anim: 'zoom' });
      this.emit('skill', { x, y: 115 });
    }
    this.skillArmed = false;
    if (!this.zvon[idx]) { this.zvon[idx] = true; this.addScore(2000, x, 150, 1000); }
    else this.addScore(500, x, 150, 200);
    this.emit('lane', { i: idx, x, y: 113 });
    if (this.zvon.every(Boolean)) {
      this.zvon = [false, false, false, false];
      if (g.mult < 6) { g.mult++; this.say('BONUS ×' + g.mult, 'Z·V·O·N zazvonil', PAL.gold); }
      else { this.addScore(50000, 305, 160); this.say('ZVONOVI', '+50.000', PAL.gold); }
      this.emit('lanesComplete', { mult: g.mult });
    }
  }

  onDrop(s) {
    this.addScore(5000, s.ax + 10, s.ay - 14, 2000);
    this.emit('drop', { x: s.ax, y: (s.ay + s.by) / 2, i: s.data.idx });
  }
  onDropsComplete() {
    const g = this.g;
    this.addScore(25000, 139, 500, 5000);
    this.emit('dropsComplete', { x: 139, y: 516 });
    if (this.mb) {
      if (!this.addABallUsed) {
        this.addABallUsed = true;
        this.say('ADD-A-BALL', 'Miklavž prinese še eno darilo', PAL.miklavz, { anim: 'zoom' });
        this.emit('addABall', {});
        g.addABall(0.8, 6);
      } else {
        this.jackpotValue += 100000;
        this.say('PARKLJI UJETI', 'jackpot +100.000', PAL.miklavz, { dur: 1.4 });
      }
    } else if (!this.lockLit) {
      this.lockLit = true;
      // prvi multiball: dimnik ostane odprt za vse 3 locke; pozneje vsak lock znova odpre parklji
      this.locksLit = this.mbCount === 0 ? CFG.locki - g.T.byId.vreca.balls : 1;
      this.say('DIMNIK ODPRT', 'LOCK → ' + SHOTS.orbitL, PAL.green, { anim: 'zoom' });
      this.emit('lockLit', {});
    } else {
      this.say(SHOTS.drops.toUpperCase(), '+25.000', PAL.miklavz, { dur: 1.2, small: true });
    }
    g.resetBank('parklji', 1.2);
    this.holes();
  }

  onVenec(idx, x, y) {
    this.addScore(this.venec[idx] ? 1500 : 5000, x, y + 20, 1000);
    this.emit('standup', { x, y, i: idx });
    if (this.venec[idx]) return;
    this.venec[idx] = true;
    if (this.venec.every(Boolean)) this.onVenecComplete();
  }
  /** adventni venec: vse 4 sveče → adventni koledar (mystery, prompt 24) in pismo v nabiralniku */
  onVenecComplete() {
    this.venec = [false, false, false, false];
    this.venecDone++;
    this.addScore(50000, 282, 600, 10000);
    this.mysteryLit = true;
    this.lightLetter(true);
    this.say('ADVENTNI VENEC', 'vse 4 sveče gorijo · ✉ v nabiralniku', PAL.violet, { anim: 'zoom' });
    this.emit('venecComplete', {});
  }

  /** veliki strel (orbit, rampa, center, kepa): combo + jackpot med multiballom */
  onMajor(id, x, y) {
    const g = this.g;
    g.shot(id, x, y);
    if (g.combo >= 2) {
      this.comboBest = Math.max(this.comboBest, g.combo);
      this.say('COMBO ×' + g.combo, '+' + fmt(25000 * Math.min(5, g.combo - 1)), PAL.white, { dur: 1.2, small: g.combo < 4 });
    }
    if (this.mb && this.mb.jp[id]) { this.jackpot(id, x, y); return true; }
    if (id === 'orbitL' || id === 'orbitR') {
      this.addScore(15000, x, y, 3000);
      if (g.combo < 2) this.say(id === 'orbitL' ? SHOTS.orbitL.toUpperCase() : 'DESNI ORBIT', '+15.000', PAL.ice, { dur: 1, small: true });
      this.emit('orbit', { combo: g.combo, x, y });
    }
    return false;
  }

  onRamp(id) {
    const g = this.g;
    const p = id === 'rampL' ? [250, 430] : [318, 430];
    this.ramps++;
    if (id === 'rampR') this.trainT = g.time;          // vlakec odpelje (izris)
    this.emit('rampMade', { combo: 1, n: this.ramps, x: p[0], y: p[1], ramp: id });
    if (this.onMajor(id, p[0], p[1])) return;
    this.addScore(20000, p[0], p[1], 4000);
    if (!this.extraGiven && !this.extraLit && this.ramps >= CFG.rampZaExtraBall) {
      this.extraLit = true;
      this.say('EXTRA BALL PRIŽGAN', 'pobereš ga v nabiralniku', PAL.orange, { anim: 'zoom' });
      this.emit('extraBallLit', {});
    } else if (!this.letterLit) {
      this.rampsToLetter--;
      if (this.rampsToLetter <= 0) this.lightLetter();
      else if (g.combo < 2) this.say(id === 'rampL' ? SHOTS.rampL.toUpperCase() : SHOTS.rampR.toUpperCase(), 'še ' + this.rampsToLetter + '× do pisma', id === 'rampL' ? PAL.ice : PAL.bozicek, { dur: 1.1, small: true });
    } else if (g.combo < 2) {
      this.say(id === 'rampL' ? SHOTS.rampL.toUpperCase() : SHOTS.rampR.toUpperCase(), '+20.000', id === 'rampL' ? PAL.ice : PAL.bozicek, { dur: 1, small: true });
    }
    this.holes();
  }

  lightLetter(quiet) {
    if (this.letterLit) return;
    this.letterLit = true;
    this.rampsToLetter = 4 + Math.min(4, this.letters);
    if (!quiet) this.say('PISMO PRIŽGANO', '✉ → desni orbit', PAL.silver, { dur: 1.6 });
    this.emit('letterLit', {});
    this.holes();
  }

  /** center »Jelka«: ujeta žogica Okrasek doseže konec kanala */
  onCenter() {
    const g = this.g;
    g.shot('center', 282, 470);
    this.emit('center', { x: 282, y: 400 });
    if (this.mb && this.mb.superLit) { this.superJackpot(); return; }
    if (this.mb && this.mb.jp.center) { this.jackpot('center', 282, 420); return; }
    // jelka: vsak zadetek prižge eno luč (9), vse → zvezda in nagrada
    this.treeLights++;
    const v = 30000 + 10000 * this.treeLights;
    this.addScore(v, 282, 420, 5000);
    if (this.treeLights >= 9) {
      this.treeLights = 0;
      this.treeDone++;
      const b = 250000 * this.treeDone;
      this.addScore(b, 282, 230);
      this.say('JELKA OKRAŠENA', 'zvezda zasije · +' + fmt(b), PAL.gold, { anim: 'jackpot', dur: 2.4 });
      this.emit('treeComplete', { x: 282, y: 212 });
    } else if (g.combo < 2) {
      this.say(SHOTS.center.toUpperCase(), 'okrasek ' + this.treeLights + '/9 · +' + fmt(v), PAL.gold, { dur: 1.2, small: true });
    }
    g.moveToy('jelka', { angle: (this.treeLights % 2 ? 1 : -1) * 0.05 });
  }

  onKepa(b) {
    const g = this.g;
    if (this.superArmed && g.time < this.superUntil && this.superLanded && g.time - this.superLanded <= CFG.superSkillOkno) {
      this.superArmed = false;
      this.superSkills++;
      this.addScore(CFG.superSkillShot, 450, 120, 10000);
      this.say('SUPER SKILL SHOT!', 'KEPA · +' + fmt(CFG.superSkillShot), PAL.gold, { anim: 'jackpot', dur: 2.6 });
      this.emit('superSkill', { x: 450, y: 98 });
      g.setPost('post', false);
      return;
    }
    if (this.onMajor('kepa', 450, 110)) return;
    this.addScore(25000, 450, 120, 3000);
    this.emit('kepa', { x: 450, y: 98 });
    if (g.combo < 2) this.say('KEPA!', '+25.000', PAL.snow, { dur: 1, small: true });
    void b;
  }

  onSpin() {
    const g = this.g;
    this.addScore(150, undefined, undefined, 50);
    this.spins++;
    this.emit('spin', {});
    if (this.spins % 40 === 0 && !this.kickback && g.state === 'play') {
      this.kickback = true;
      this.say('SANKAČ PRIPRAVLJEN', 'kickback v levem outlanu', PAL.green, { dur: 1.4, small: true });
      this.emit('kickbackLit', {});
    }
  }

  /* ---------------- Dimnik (VUK v Sankališču): lock v vrečo ---------------- */
  onDimnik(b, sa) {
    const g = this.g;
    g.shot('vuk', sa.x, sa.y);
    if (!this.lockLit || this.mb) { this.addScore(10000, sa.x, sa.y); g.after(0.6, () => g.ejectSaucer(sa, b)); return; }
    const n = g.lockBall('vreca', b);
    this.locksLit--;
    if (this.locksLit <= 0) this.lockLit = false;
    this.addScore(50000, sa.x + 30, sa.y, 10000);
    this.emit('lock', { n });
    if (n >= CFG.locki) { this.startMultiball(); return; }
    this.say('LOCK ' + n, n === CFG.locki - 1 ? 'še eno darilo do MULTIBALLA' : 'darilo v vreči', PAL.green, { anim: 'zoom' });
    g.spawnLater(1.4, () => g.serveBall());
    this.holes();
  }

  /* ---------------- nabiralnik »Pisma« (luknja v desnem orbitu) ---------------- */
  onPisma(b, sa) {
    const g = this.g;
    g.shot('scoop', sa.x, sa.y);
    let delay = 0.8;
    if (this.extraLit) {
      this.extraLit = false; this.extraGiven = true; g.extraBalls++;
      this.say('EXTRA BALL!', 'darilo za pridne', PAL.orange, { anim: 'zoom', dur: 2.2 });
      this.emit('extraBall', {});
      delay = 1.8;
    } else if (this.letterLit) {
      // prompt 24: tu se začnejo načini (pisma dobrim možem)
      this.letterLit = false;
      this.letters++;
      const v = 100000 * this.letters;
      this.addScore(v, sa.x - 40, sa.y, 10000);
      this.say('PISMA KMALU', 'pismo ' + this.letters + ' · +' + fmt(v), PAL.silver, { dur: 2 });
      this.emit('letter', { n: this.letters });
      if (this.mysteryLit) { this.mysteryLit = false; this.addScore(75000, sa.x - 40, sa.y - 20); }
    } else this.addScore(10000, sa.x, sa.y);
    this.holes();
    g.ballSaveUntil = Math.max(g.ballSaveUntil, g.time + delay + 2);
    g.after(delay, () => g.ejectSaucer(sa, b));
  }

  /* ---------------- Darilni multiball ---------------- */
  startMultiball() {
    const g = this.g;
    this.mbCount++;
    this.lockLit = false; this.locksLit = 0; this.addABallUsed = false;
    this.jackpotValue = CFG.jackpotZacetek + 250000 * (this.mbCount - 1);
    this.mb = { jp: { orbitL: true, rampL: true, rampR: true, orbitR: true }, superLit: false, jackpots: 0 };
    g.ballSaveUntil = g.time + CFG.multiballSaveSek;
    this.say('DARILNI MULTIBALL', 'rampi in orbita = JACKPOT', PAL.red, { anim: 'multiball', dur: 3 });
    this.emit('multiball', {});
    this.holes();
    g.after(0.6, () => g.releaseLock('vreca', 'all', 0.7));
  }

  jackpot(id, x, y) {
    const g = this.g, v = this.jackpotValue;
    this.addScore(v, x, y, 10000);
    g.maxJackpot = Math.max(g.maxJackpot, v);
    this.mb.jp[id] = false;
    this.mb.jackpots++;
    this.jackpots++;
    this.jackpotValue += 100000;
    this.say('JACKPOT', fmt(v), PAL.red, { anim: 'jackpot', dur: 2.2 });
    this.emit('jackpot', { value: v, x, y });
    if (JP_SHOTS.every(s => !this.mb.jp[s])) {
      this.mb.superLit = true;
      g.after(2.2, () => { if (this.mb && this.mb.superLit) this.say('SUPER JACKPOT', 'prižgan → ' + SHOTS.center.toUpperCase(), PAL.gold); });
      this.emit('superLit', {});
    }
  }

  superJackpot() {
    const g = this.g;
    const v = Math.round(this.jackpotValue * 3 / 10000) * 10000;
    this.addScore(v, 282, 400, 25000);
    g.maxJackpot = Math.max(g.maxJackpot, v);
    this.superJackpots++;
    this.mb.superLit = false;
    for (const s of JP_SHOTS) this.mb.jp[s] = true;
    this.jackpotValue += 250000;
    this.say('SUPER JACKPOT', 'zvezda na jelki · ' + fmt(v), PAL.gold, { anim: 'jackpot', dur: 3 });
    this.emit('superJackpot', { value: v, x: 282, y: 300 });
  }

  endMultiball() {
    this.mb = null;
    this.say('KONEC MULTIBALLA', 'jackpot: ' + fmt(this.jackpotValue), PAL.red);
    this.emit('multiballEnd', {});
    this.holes();
  }

  /** merilec strelov: luknje zaprte, da mapa pokaže orbita (Pisma/Dimnik sta odprta luknja v istem strelu) */
  shotMapSetup() { this.letterLit = false; this.extraLit = false; this.lockLit = false; this.holes(); }

  /* ---------------- prompt 24: načini ---------------- */
  startMode() { /* prompt 24 */ }

  /* ---------------- vnos ---------------- */
  onFlipper(side) {
    const g = this.g;
    const waiting = g.balls.length === 1 && g.inPlunger(g.balls[0]) && this.skillArmed;
    if (waiting) this.skillLane = (this.skillLane + (side === 'L' ? 3 : 1)) % 4;
    else this.zvon = g.rotateLanes(this.zvon, side === 'L' ? -1 : 1);
  }

  /* ---------------- kickback »Sankač« v levem outlanu (Alu) ---------------- */
  ballTick(b) {
    const g = this.g;
    if (b.x < 55 && b.y > 880 && b.vy > 0 && this.kickback && !g.tilted && g.state === 'play') {
      b.x = 33; b.y = 900; b.vx = 0; b.vy = -2100; b.kickT = g.time;
      this.kickback = false;
      this.say('SANKAČ!', 'kickback · spinner ga spet napolni', PAL.green, { dur: 1.4, small: true });
      this.emit('kickback', { x: 37, y: 920 });
    }
    // super skill: žogica pristane na zgornjem flipperju
    if (this.superArmed && !this.superLanded && this.kepa) {
      const f = this.kepa, tx = f.px + Math.cos(f.angle) * f.len, ty = f.py + Math.sin(f.angle) * f.len;
      const t = Math.max(0, Math.min(1, ((b.x - f.px) * (tx - f.px) + (b.y - f.py) * (ty - f.py)) / (f.len * f.len)));
      if (Math.hypot(b.x - (f.px + (tx - f.px) * t), b.y - (f.py + (ty - f.py) * t)) < 26 && b.y < f.py + 10) {
        this.superLanded = g.time;
        g.setPost('post', false);
      }
    }
  }
  // ko žogica ob steni preleti vrh outlane vodila, jo usmeri poševno v igralno polje (kot Alu)
  substep() {
    const g = this.g;
    for (const b of g.balls) {
      if (b.kickT === undefined) continue;
      if (b.y < 672 && b.vy < 0) { b.vx = 1150; b.vy = -1750; b.kickT = undefined; }
      else if (g.time - b.kickT > 0.6) b.kickT = undefined;
    }
  }

  tick(dt) {
    const g = this.g;
    // dimnik: toplejši, ko je odprt (iskre, sij)
    this.heat += ((this.lockLit && !this.mb ? 0.55 : 0.12) - (this.heat || 0)) * Math.min(1, dt * 1.5);
    if (this.skillArmed && this.skillUntil === 0 && g.balls.some(b => !g.inPlunger(b) && b.y < 880)) this.skillUntil = g.time;
    if (this.skillArmed && this.skillUntil > 0 && g.time > this.skillUntil + 5) this.skillArmed = false;
    if (this.superArmed && (g.time > this.superUntil || (this.superLanded && g.time - this.superLanded > CFG.superSkillOkno))) {
      this.superArmed = false;
      g.setPost('post', false);
    }
    if (this.postT > 0) { this.postT -= dt; if (this.postT <= 0) g.setPost('post', false); }
    this.holes();
  }

  /* ---------------- vstavki ---------------- */
  lamps(set, t) {
    const g = this.g, mb = this.mb, P = PAL;
    const play = g.state === 'play' || g.state === 'bonus';
    const comboWin = play && t - g.lastMajorT < g.cfg.comboOkno;
    const nextCombo = s => comboWin && MAJOR.has(s);

    for (let i = 0; i < 4; i++) {
      const skill = this.skillArmed && this.skillLane === i && !this.superArmed;
      set('lane' + i, this.zvon[i] ? 1 : skill ? 3 : 0, skill ? P.white : null);
    }
    for (let k = 2; k <= 6; k++) set('mult' + k, g.mult >= k ? 1 : 0);

    // puščice: rdeča = jackpot · zelena = lock · bela = combo · srebrna/oranžna = pismo/extra ball
    const arr = (id, shot, base) => {
      if (mb && mb.jp[shot]) set(id, 3, P.red);
      else if (nextCombo(shot)) set(id, 2, P.white);
      else set(id, base ? 1 : 0, base || null);
    };
    if (!mb && this.lockLit && play) set('arrOrbitL', 2, P.green); else arr('arrOrbitL', 'orbitL');
    if (!mb && this.extraLit && play) set('arrOrbitR', 2, P.orange);
    else if (!mb && this.letterLit && play) set('arrOrbitR', 2, P.silver);
    else arr('arrOrbitR', 'orbitR');
    arr('arrRampL', 'rampL'); arr('arrRampR', 'rampR');
    if (mb && mb.superLit) set('arrCenter', 3, P.gold);
    else if (nextCombo('center')) set('arrCenter', 2, P.white);
    else set('arrCenter', this.treeLights >= 8 && play ? 2 : 0, P.gold);
    set('arrDrops', play && !this.lockLit && !mb ? 2 : mb && !this.addABallUsed ? 2 : 0, P.miklavz);

    for (const s of JP_SHOTS) {
      const k = s[0].toUpperCase() + s.slice(1);
      set('jp' + k, mb && mb.jp[s] ? 3 : 0);
      set('cb' + k, nextCombo(s) ? 2 : 0);
    }
    set('superJ', mb && mb.superLit ? 3 : 0);
    set('lockL', this.lockLit && !mb ? 3 : 0);
    set('pismo', this.letterLit && !mb ? 2 : 0);
    set('extra', this.extraLit ? 3 : g.extraBalls > 0 ? 1 : 0);
    set('mystery', this.mysteryLit ? 2 : 0);
    for (let i = 0; i < 4; i++) set('svec' + i, this.venec[i] ? 1 : 0);
    const locked = g.T.byId.vreca.balls;
    for (let i = 0; i < 3; i++) set('vreca' + i, locked > i ? 1 : this.lockLit && locked === i ? 3 : 0);
    for (let i = 0; i < 9; i++) set('tree' + i, mb ? 2 : this.treeLights > i ? 1 : 0);
    set('star', mb && mb.superLit ? 3 : this.treeDone > 0 ? 1 : 0);
    set('kick', this.kickback && play ? 1 : 0);
    const saving = t < g.ballSaveUntil && g.state === 'play';
    set('save', saving ? (g.ballSaveUntil - t < 3 ? 3 : 2) : 0);
    set('spin', this.spinner.w > 2 ? 1 : 0);
    set('kepaL', this.superArmed ? 3 : nextCombo('kepa') ? 2 : 0);
    for (let i = 0; i < 3; i++) {
      set('rampLC' + i, mb && mb.jp.rampL ? 3 : comboWin ? 2 : 0, mb && mb.jp.rampL ? P.red : P.ice);
      set('rampRC' + i, mb && mb.jp.rampR ? 3 : comboWin ? 2 : 0, mb && mb.jp.rampR ? P.red : P.bozicek);
    }
    // parklji utripajo, dokler dimnik ni odprt
    for (const d of g.T.drops) d.pulse = !this.lockLit && !mb;
    for (const s of g.T.standups) s.lit = this.venec[s.data.idx];
  }

  /* ---------------- DMD in paneli ---------------- */
  dmdIdle(s) {
    if (s.multiball) return { text: s.superLit ? 'SUPER JACKPOT!' : 'MULTIBALL', gold: true };
    if (s.combo >= 2) return { text: 'COMBO ×' + s.combo };
    if (s.lockLit) return { text: 'LOCK ' + (s.locks + 1) };
    if (s.mult > 1) return { text: 'BONUS ×' + s.mult };
    return null;
  }
  summary() {
    const g = this.g;
    return {
      locks: g.T.byId.vreca.balls, lockLit: this.lockLit, multiball: !!this.mb, superLit: !!(this.mb && this.mb.superLit),
      jackpot: this.jackpotValue, jpLeft: this.mb ? JP_SHOTS.filter(s => this.mb.jp[s]).length : 0,
      letterLit: this.letterLit, rampsToLetter: this.rampsToLetter, extraLit: this.extraLit, ramps: this.ramps,
      kickback: this.kickback, treeLights: this.treeLights, venec: this.venec.filter(Boolean).length,
      skillArmed: this.skillArmed && g.ballWaiting(), superArmed: this.superArmed, mysteryLit: this.mysteryLit,
      mode: null, modesDone: [],
      panelKey: [this.letterLit, this.extraLit, this.treeLights, this.venec.join(''), this.mb && this.mb.superLit, this.mb && JP_SHOTS.filter(x => this.mb.jp[x]).length, this.rampsToLetter, this.superArmed].join('|'),
    };
  }
  gameStats() {
    return { multiballs: this.mbCount, jackpots: this.jackpots, superJackpots: this.superJackpots, skills: this.skills,
      superSkills: this.superSkills, maxCombo: this.g.maxCombo, modes: 0, wizards: 0, letters: this.letters };
  }
}
