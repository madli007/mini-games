/* =====================================================================
   TESTNA MIZA — minimalna pravila, ki uporabijo vse nove elemente
   - drop banka (4) prižge LOCK v VUK-u; 2 zaklenjeni žogici → multiball (sprostitev vseh)
   - standupi (3) prižgejo magnet: naslednja žogica nad magnetom se ujame, nato jo vrže proti zgornjemu flipperju
   - ujeta žogica dvigne stebriček (8 s), zavrti igračo in preklopi preusmernik
   - rampi: točke + combo; kanali: lane change (flipperja), vsi trije → bonus X
   ===================================================================== */
import { Rules } from '../../engine/game.js';
import { PAL } from './config.js';

const E = (g, id) => g.T.byId[id];

export class TestRules extends Rules {
  resetGame() { Object.assign(this, { lockLit: false, magnetLit: false, magnetUsed: 0, mb: false, mbCount: 0, stand: [false, false, false], caps: 0, toyA: 0 }); }
  resetBall() {
    this.lanes = [false, false, false]; this.postT = 0;
    if (this.g.T.byId) this.g.setPost('post', false);      // nova žogica: stebriček dol
  }
  isMulti() { return this.mb; }
  onLastBall() { if (this.mb) { this.mb = false; this.g.say('KONEC MULTIBALLA', '', PAL.gold); this.g.emit('multiballEnd', {}); } }
  onBallEnd() { this.mb = false; }
  abort() { this.mb = false; }

  onSwitch(name, d) {
    const g = this.g;
    switch (name) {
      case 'lane': {
        g.addScore(1000, d.x, d.y + 30, 200);
        this.lanes[d.idx] = true;
        g.emit('lane', { i: d.idx, x: d.x, y: d.y });
        if (this.lanes.every(Boolean)) {
          this.lanes = [false, false, false];
          if (g.mult < 5) g.mult++;
          g.say('BONUS ×' + g.mult, 'kanali zaprti', PAL.cyan);
          g.emit('lanesComplete', {});
        }
        return;
      }
      case 'stand': {
        g.addScore(3000, d.x, d.y + 20, 500);
        g.emit('standup', { x: d.x, y: d.y });
        this.stand[d.idx] = true;
        d.s.lit = true;
        g.shot('stand', d.x, d.y);
        if (this.stand.every(Boolean) && !this.magnetLit) {
          this.magnetLit = true;
          g.say('MAGNET PRIŽGAN', 'žogica nad magnetom se ujame', PAL.cyan);
        }
        return;
      }
      case 'drop':
        g.addScore(5000, d.x, d.y, 1000);
        g.emit('drop', { x: d.x, y: d.y, i: d.idx });
        g.shot('drops', d.x, d.y);
        return;
      case 'dropBank':
        g.addScore(25000, d.x, d.y, 5000);
        g.emit('dropsComplete', { x: 358, y: 432 });
        if (!this.lockLit && !this.mb) { this.lockLit = true; g.say('LOCK PRIŽGAN', 'zadeni VUK', PAL.code); }
        g.resetBank('drop', 1.0);
        return;
      case 'vuk': this.onVuk(d.b, d.saucer); return;
      case 'captive': {
        this.caps++;
        g.addScore(20000, 300, 280, 2000);
        g.shot('captive', 300, 300);
        g.emit('captive', { x: 300, y: 300 });
        g.setPost('post', true); this.postT = 8;
        this.toyA += Math.PI / 2; g.moveToy('toy', { angle: this.toyA });
        g.setDiverter('div', !E(g, 'div').on);
        g.say('UJETA ŽOGICA', 'stebriček · igrača · preusmernik', PAL.gold, { dur: 1.4, small: true });
        return;
      }
      case 'toy': g.addScore(500, d.x, d.y, 100); g.emit('wall', { x: d.x, y: d.y, v: 900 }); return;
      case 'wireMade': case 'rampMade':
        g.addScore(20000, d.x, d.y, 3000);
        g.emit('rampMade', { x: d.x, y: d.y, combo: 1 });
        g.shot(name === 'wireMade' ? 'wire' : 'ramp', d.x, d.y);
        return;
      default: super.onSwitch(name, d);
    }
  }

  onVuk(b, sa) {
    const g = this.g;
    g.shot('vuk', sa.x, sa.y);
    if (this.lockLit && !this.mb) {
      this.lockLit = false;
      const n = g.lockBall('lock', b);
      g.emit('lock', { n });
      if (n >= 2) {
        // multiball: sprosti vse zaklenjene + žogica iz izstrelitve
        this.mb = true; this.mbCount++;
        g.say('MULTIBALL', 'sprostitev locka', PAL.gold, { anim: 'multiball', dur: 2.5 });
        g.emit('multiball', {});
        g.ballSaveUntil = g.time + 10;
        g.releaseLock('lock', 'all', 0.5);
        g.spawnLater(1.2, () => g.autoLaunch());
      } else {
        g.say('LOCK ' + n, 'nova žogica', PAL.code, { dur: 1.4 });
        g.spawnLater(1.2, () => g.serveBall());
      }
      return;
    }
    g.addScore(15000, sa.x, sa.y - 30, 2000);
    g.after(0.8, () => g.ejectSaucer(sa, b));
  }

  tick(dt) {
    const g = this.g;
    if (this.postT > 0) { this.postT -= dt; if (this.postT <= 0) g.setPost('post', false); }
    // magnet: prižgan → ujame žogico nad sabo, po 1,5 s jo vrže proti zgornjemu flipperju
    const m = E(g, 'magnet');
    if (this.magnetLit && !m.on) {
      const near = g.balls.find(b => !b.captured && b.layer === 0 && Math.hypot(b.x - m.x, b.y - m.y) < m.r * 0.8);
      if (near) { g.magnet('magnet', 'grab'); this.magnetUsed++; }
    }
    if (m.on && m.held && m.t > 1.5) {
      g.magnet('magnet', 'throw', { vx: 900, vy: -1500 });
      this.magnetLit = false; this.stand = [false, false, false];
      for (const s of g.T.standups) s.lit = false;
      g.say('MAGNET', 'met proti zgornjemu flipperju', PAL.cyan, { dur: 1.2, small: true });
    } else if (m.on && !m.held && m.t > 2.5) g.magnet('magnet', 'off');
  }

  onFlipper(side) { this.lanes = this.g.rotateLanes(this.lanes, side === 'L' ? -1 : 1); }

  lamps(set, t) {
    const g = this.g;
    for (let i = 0; i < 3; i++) set('lane' + i, this.lanes[i] ? 1 : 0);
    for (let i = 0; i < 3; i++) set('st' + i, this.stand[i] ? 1 : 0);
    set('lock', this.lockLit ? 3 : E(g, 'lock').balls ? 1 : 0);
    set('mag', this.magnetLit ? 3 : E(g, 'magnet').on ? 1 : 0);
    set('cap', this.postT > 0 ? 2 : 0);
    const comboWin = t - g.lastMajorT < g.cfg.comboOkno && g.state === 'play';
    set('arrWire', comboWin ? 2 : 0, PAL.cyan); set('arrRamp', this.mb ? 3 : comboWin ? 2 : 0, PAL.gold);
    for (let i = 0; i < 2; i++) { set('wireC' + i, comboWin ? 2 : 0); set('rampC' + i, this.mb ? 3 : 0); }
    set('save', t < g.ballSaveUntil && g.state === 'play' ? 2 : 0);
  }

  dmdIdle() {
    if (this.mb) return { text: 'MULTIBALL', gold: true };
    if (this.lockLit) return { text: 'LOCK!' };
    if (this.magnetLit) return { text: 'MAGNET' };
    return null;
  }
  summary() { return { lockLit: this.lockLit, multiball: this.mb, locks: E(this.g, 'lock').balls, magnet: this.magnetLit }; }
  gameStats() { return { multiballs: this.mbCount, modes: 0, wizards: 0 }; }
}
