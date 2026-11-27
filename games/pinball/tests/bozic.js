/* =====================================================================
   TESTI BOŽIČNE MIZE (games/bozicni-pinball/table) — pravila in občutek
   lock → Darilni multiball → jackpoti → super jackpot, add-a-ball, skill shot, super skill shot,
   bonus X, extra ball, combo, luknji v orbitih, podaje ramp in orbitov (flow), bot statistika.
   ===================================================================== */
import { makeGame, botGame, botReport, seeded, FRAME } from '../src/engine/bot.js';
import { sampleShot } from '../src/engine/shots.js';
import BOZIC from '../../bozicni-pinball/table/index.js';

function fresh(start = true) {
  const { g, bus, T } = makeGame(BOZIC);
  const ev = {};
  bus.on('*', (d, n) => { ev[n] = (ev[n] || 0) + 1; });
  if (start) g.startGame(); else g.state = 'play';
  const run = sec => { for (let t = 0; t < sec; t += FRAME) g.update(FRAME); };
  return { g, T, ev, run, R: g.rules };
}
const withSeed = (seed, fn) => { const s = Math.random; Math.random = seeded(seed); try { return fn(); } finally { Math.random = s; } };
/** žogico postavi v luknjo (VUK) in sproži zajem */
function sink(g, id) {
  const sa = g.T.saucers.find(s => s.id === id);
  const b = g.balls.find(x => !x.captured) || g.newBall(sa.x, sa.y);
  b.x = sa.x; b.y = sa.y; b.vx = 0; b.vy = -300; b.saucerCool = 0; b.layer = 0;
  return g.captureSaucer(id, b);
}

export function bozicTest({ games = 12 } = {}) {
  const res = [];
  const ok = (name, cond, info = '') => res.push({ name, ok: !!cond, info });
  withSeed(11, () => {
    // ---- lock in Darilni multiball ----
    {
      const { g, T, ev, run, R } = fresh();
      run(0.3);
      ok('luknji v orbitih sta na začetku: dimnik zaprt, pismo odprto', T.saucers.find(s => s.id === 'dimnik').capture.maxUp === 0 && T.saucers.find(s => s.id === 'pisma').capture.maxUp > 0);
      ok('zaprt dimnik ne ujame žogice (pretok skozi Sankališče)', !sink(g, 'dimnik'));
      { const b = g.balls[0]; b.x = T.launch.x; b.y = T.launch.y - 11; b.vx = 0; b.vy = 0; }
      const bank = T.banks.find(k => k.id === 'parklji');
      for (const d of bank.targets) g.hitDrop(d, g.balls[0]);
      run(0.1);
      ok('Parklji (3 drop) odprejo dimnik (lock prižgan)', R.lockLit && ev.dropsComplete === 1 && T.saucers.find(s => s.id === 'dimnik').capture.maxUp > 0);
      run(1.3);
      ok('Parklji se ponastavijo', bank.targets.every(d => d.active));
      const vreca = T.byId.vreca;
      sink(g, 'dimnik'); run(2);
      ok('lock 1: žogica obstane v vreči, nova pride v plunger', vreca.balls === 1 && g.balls.length === 1 && g.inPlunger(g.balls[0]), 'vreča ' + vreca.balls);
      sink(g, 'dimnik'); run(2);
      ok('lock 2 (prvi multiball: dimnik ostane odprt)', vreca.balls === 2 && R.lockLit);
      sink(g, 'dimnik'); run(0.2);
      ok('3 locki → Darilni multiball', R.mb && ev.multiball === 1, 'mb ' + !!R.mb);
      run(2.2);
      ok('multiball: 3 žogice iz vreče, vreča prazna', g.live >= 3 && vreca.balls === 0 && ev.lockRelease === 3, 'v igri ' + g.live);
      ok('multiball: ball save', g.ballSaveUntil > g.time + 5);
      ok('med multiballom sta luknji zaprti', T.saucers.every(s => s.capture.maxUp === 0));
      // jackpoti na rampah in orbitih
      const b0 = g.balls[0];
      const jp0 = R.jackpotValue;
      R.onSwitch('rampLMade', { b: b0 }); R.onSwitch('rampRMade', { b: b0 });
      R.onSwitch('orbitL', { b: Object.assign({}, b0, { vy: -500 }) }); R.onSwitch('orbitR', { b: Object.assign({}, b0, { vy: -500 }) });
      ok('jackpot na obeh rampah in obeh orbitih (4×), vrednost raste', ev.jackpot === 4 && R.jackpotValue === jp0 + 400000, 'jackpot ' + (ev.jackpot || 0));
      ok('vsi štirje → super jackpot prižgan v Jelki', R.mb.superLit);
      const s0 = g.score;
      R.onSwitch('okrasek', { captive: T.captives[0] });
      ok('super jackpot v Jelki (ujeta žogica) → jackpoti znova prižgani', ev.superJackpot === 1 && g.score - s0 >= jp0 * 3 && R.mb.jp.rampL && !R.mb.superLit);
      // add-a-ball
      for (const d of bank.targets) g.hitDrop(d, b0);
      ok('add-a-ball (Parklji med multiballom, enkrat)', ev.addABall === 1 && g.pending >= 1);
      run(1.4);
      for (const d of bank.targets) g.hitDrop(d, b0);
      ok('drugi Parklji med multiballom ne dodajo žogice', ev.addABall === 1);
      // konec multiballa
      g.ballSaveUntil = 0;
      run(1.6);                                  // čakajoče žogice (add-a-ball, ball save) pridejo v igro
      while (g.live > 1 && g.balls.length) g.drain(g.balls[g.balls.length - 1]);
      ok('ostane ena žogica → konec multiballa', !R.mb && ev.multiballEnd === 1);
      ok('drugi lock po prvem multiballu: en lock na komplet Parkljev', (() => { for (const d of bank.targets) d.active = true; for (const d of bank.targets) g.hitDrop(d, g.balls[0]); return R.lockLit && R.locksLit === 1; })());
    }

    // ---- skill shot in super skill shot ----
    {
      const { g, ev, run, R } = fresh();
      run(0.2);
      const lane = R.skillLane;
      g.setFlipper('R', true); g.setFlipper('R', false);
      ok('pred izstrelitvijo flipper premakne skill shot kanal', R.skillLane === (lane + 1) % 4);
      const v0 = R.skillValue;
      R.onSwitch('lane', { idx: R.skillLane });
      ok('skill shot: utripajoči Z·V·O·N kanal, vrednost raste', ev.skill === 1 && R.skillValue === v0 + 50000);
    }
    {
      const { g, T, ev, run, R } = fresh();
      run(0.3);
      g.setFlipper('L', true);
      g.plungerDown(); run(0.3); g.plungerUp();
      g.setFlipper('L', false);
      ok('super skill shot: levi flipper med izstrelitvijo dvigne up-post', R.superArmed && T.byId.post.active);
      let landed = 0;
      for (let t = 0; t < 4 && !landed; t += FRAME) { g.update(FRAME); if (R.superLanded) landed = g.time; }
      ok('super skill shot: žogica pristane na zgornjem flipperju (Kepa)', landed > 0 && !T.byId.post.active, 'pristanek ' + (landed ? 'da' : 'ne'));
      R.onSwitch('zanka', { b: g.balls[0] });
      ok('super skill shot: Kepa v 3 s → nagrada', ev.superSkill === 1 && R.superSkills === 1);
    }

    // ---- bonus X, extra ball, combo, pismo ----
    {
      const { g, ev, run, R } = fresh();
      run(0.2); R.skillArmed = false;
      for (let i = 0; i < 4; i++) R.onSwitch('lane', { idx: i });
      ok('Z·V·O·N (vsi 4) → bonus ×2', g.mult === 2 && ev.lanesComplete === 1);
      g.setFlipper('L', true); g.setFlipper('L', false);
      ok('lane change s flipperjem', R.zvon.every(x => !x));
      const b = g.balls[0];
      for (let i = 0; i < 10; i++) { g.time += 5; R.onSwitch(i % 2 ? 'rampLMade' : 'rampRMade', { b }); }
      ok('10 ramp → extra ball prižgan v nabiralniku', R.extraLit && g.T.saucers.find(s => s.id === 'pisma').capture.maxUp > 0);
      sink(g, 'pisma'); run(2.5);
      ok('nabiralnik: extra ball pobran, žogica izvržena proti levemu flipperju', g.extraBalls === 1 && ev.extraBall === 1 && g.balls[0] && !g.balls[0].captured && g.balls[0].x < 200, 'x ' + Math.round(g.balls[0] ? g.balls[0].x : -1));
      g.time += 10;
      R.onSwitch('rampLMade', { b }); g.time += 1; R.onSwitch('rampRMade', { b }); g.time += 1; R.onSwitch('orbitL', { b: { vy: -400 } });
      ok('combo: rampa → rampa → orbit (×3)', g.combo === 3 && ev.combo === 2 && g.maxCombo === 3);
      R.letterLit = true;
      sink(g, 'pisma'); run(0.1);
      ok('pismo v nabiralniku: nagrada + »Pisma kmalu« (kljuka za prompt 24)', R.letters === 1 && !R.letterLit);
      for (let i = 0; i < 4; i++) R.onSwitch('venec', { idx: i, x: 0, y: 0 });
      ok('adventni venec (4 sveče) → mystery prižgan + pismo', R.mysteryLit && R.letterLit && ev.venecComplete === 1);
      const tl = R.treeLights;
      R.onSwitch('okrasek', {});
      ok('Jelka: zadetek prižge lučko na jelki', R.treeLights === tl + 1);
    }

    // ---- občutek: podaje ramp, orbitov in luknje (merilec strelov) ----
    {
      const T0 = BOZIC.buildTable();
      const fi = id => T0.flippers.findIndex(f => f.id === id || f.side === id && f.py > 800);
      const L = T0.flippers.findIndex(f => f.side === 'L' && f.py > 800), R = T0.flippers.findIndex(f => f.side === 'R' && f.py > 800);
      void fi;
      const count = (flip, kind, from, to, shot) => {
        let n = 0, fed = {};
        for (let ms = from; ms <= to; ms += 4) {
          const r = sampleShot(BOZIC, flip, kind, ms);
          if (r.shot === shot) { n++; fed[r.feed] = (fed[r.feed] || 0) + 1; }
        }
        return { n, fed };
      };
      const sm = count(L, 'cradle', 270, 360, 'rampL');
      ok('Smučka iz levega cradla (okno ≥ 35 ms), podaja na desni flipper', sm.n * 4 >= 32 && (sm.fed['desni flipper'] || 0) >= sm.n * 0.85, JSON.stringify(sm));
      const vl = count(R, 'cradle', 270, 360, 'rampR');
      ok('Vlakec iz desnega cradla (okno ≥ 30 ms), podaja na levi flipper', vl.n * 4 >= 28 && (vl.fed['levi flipper'] || 0) >= vl.n * 0.85, JSON.stringify(vl));
      const ol = count(R, 'inlane', 828, 880, 'orbitL');
      ok('Sankališče z desnega flipperja (okno ≥ 45 ms), podaja na desni flipper', ol.n * 4 >= 44 && (ol.fed['desni flipper'] || 0) >= ol.n * 0.8, JSON.stringify(ol));
      const orr = count(L, 'inlane', 828, 880, 'orbitR');
      ok('desni orbit z levega flipperja (okno ≥ 45 ms)', orr.n * 4 >= 44, JSON.stringify(orr));
    }
    {
      // VUK in nabiralnik izmetata predvidljivo: na levi inlane
      for (const id of ['dimnik', 'pisma']) {
        const { g, T, run, R } = fresh();
        run(0.2);
        R.lockLit = id === 'dimnik'; R.locksLit = 1; R.letterLit = id === 'pisma'; R.holes();
        const sa = T.saucers.find(s => s.id === id);
        g.after(0, () => {});
        const b = g.balls[0]; b.x = sa.x; b.y = sa.y; b.vy = -300; b.saucerCool = 0;
        if (id === 'dimnik') { R.lockLit = false; R.holes(); sa.capture = { maxUp: 3400, maxAny: 3400 }; }
        g.captureSaucer(id, b, true);
        let inl = false;
        for (let t = 0; t < 3; t += FRAME) { g.update(FRAME); if (b.x < 120 && b.y > 700 && b.y < 860) inl = true; }
        ok(`${id}: izmet podzemno na levi inlane (proti levemu flipperju)`, inl, `(${Math.round(b.x)}, ${Math.round(b.y)})`);
      }
    }
  });

  // ---- bot: igre se končajo, brez pobegov, statistika v mejah ----
  const gs = [];
  for (let i = 0; i < games; i++) gs.push(botGame({ table: BOZIC, seed: 1000 + i * 17 }));
  const r = botReport(gs);
  ok('bot: vse igre se končajo, brez pobegov', gs.every(x => x.over) && r.escapes === 0, JSON.stringify({ sec: r.avgSec, žoga: r.avgBallSec, točke: r.avgScore }));
  ok('bot: igra 2,5–8 min, žogica 40–140 s', r.avgSec >= 150 && r.avgSec <= 480 && r.avgBallSec >= 40 && r.avgBallSec <= 140, `${r.avgSec} s · ${r.avgBallSec} s`);
  ok('bot: ball search ≤ 2 na igro', r.searches <= 2, 'iskanj ' + r.searches);
  ok('bot: outlane 35–65 % drainov', r.outlaneAllPct >= 35 && r.outlaneAllPct <= 65, `outlane ${r.outlaneAllPct} % · sredina ${r.centerAllPct} %`);
  ok('bot: multiball in jackpoti se zgodijo', r.multiballs > 0.3 && r.jackpots > 0.5, `mb ${r.multiballs} · jp ${r.jackpots}`);
  return res;
}
