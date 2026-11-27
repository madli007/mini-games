/* =====================================================================
   TESTI NOVIH ELEMENTOV MOTORJA (na testni mizi tables/test)
   rampi (žičnata + zavrnitev), zgornji flipper, VUK, saucer, vidni lock,
   drop banka z resetom, standupi, ujeta žogica, magnet, stebriček,
   preusmernik, spinner na rampi, lane change, igrača, bot na testni mizi.
   ===================================================================== */
import { makeGame, botGame, botReport, seeded, FRAME } from '../src/engine/bot.js';
import TEST from '../src/tables/test/index.js';

function fresh() {
  const { g, bus, T } = makeGame(TEST);
  g.state = 'play';
  const ev = {};
  bus.on('*', (d, n) => { ev[n] = (ev[n] || 0) + 1; });
  const run = sec => { for (let t = 0; t < sec; t += FRAME) g.update(FRAME); };
  return { g, T, ev, run };
}
const withSeed = (seed, fn) => { const s = Math.random; Math.random = seeded(seed); try { return fn(); } finally { Math.random = s; } };

export function elementsTest() {
  const res = [];
  const ok = (name, cond, info = '') => res.push({ name, ok: !!cond, info });
  withSeed(3, () => {
    // rampi: močan strel prevozi, šibak se na strmejši rampi vrne (zavrnitev)
    for (const [x, id, v, made] of [[155, 'wire', 2200, true], [420, 'ramp', 2400, true], [420, 'ramp', 1400, false]]) {
      const { g, ev, run } = fresh();
      const b = g.newBall(x, 640); b.vy = -v;
      run(3);
      ok(`rampa ${id} pri ${v} px/s: ${made ? 'prevozi do inlana' : 'zavrnitev'}`, made ? ev.rampExit >= 1 && ev.rampMade >= 1 && ev.inlane >= 1 : ev.rampFail >= 1 && !ev.rampMade,
        JSON.stringify({ made: ev.rampMade || 0, exit: ev.rampExit || 0, fail: ev.rampFail || 0 }));
    }
    // spinner na žičnati rampi
    { const { g, ev, run } = fresh(); const b = g.newBall(155, 640); b.vy = -2400; run(2); ok('spinner na rampi (plast 1) se zavrti', (ev.spin || 0) > 0, 'spin ' + (ev.spin || 0)); }

    // zgornji flipper (gumb R): žogica na njem, pritisk jo izstreli
    {
      const { g, T, run } = fresh();
      const f = T.flippers.find(q => q.id === 'upper');
      // žogica leži na zgornji ploskvi mirnega flipperja (60 % dolžine)
      const a = f.rest, k = 0.6, rr = f.r1 + (f.r2 - f.r1) * k + 10.5;
      const b = g.newBall(f.px + Math.cos(a) * f.len * k - Math.sin(a) * rr, f.py + Math.sin(a) * f.len * k + Math.cos(a) * rr);
      run(0.03);
      const v0 = Math.hypot(b.vx, b.vy);
      g.setFlipper('R', true); run(0.08);
      const v1 = Math.hypot(b.vx, b.vy);
      ok('zgornji flipper (gumb R) udari žogico', f.pressed && T.flippers.filter(q => q.button === 'R').length === 2 && v1 > v0 + 400, Math.round(v0) + ' → ' + Math.round(v1) + ' px/s');
    }

    // VUK: ujame in po podzemni poti izvrže drugje
    {
      const { g, T, ev, run } = fresh();
      const vk = T.saucers.find(s => s.id === 'vuk');
      const b = g.newBall(vk.x, vk.y - 1); b.vy = 400;
      run(0.2);
      const caught = b.captured;
      run(1.0);
      ok('VUK ujame žogico in jo izvrže z drugega mesta', caught && !b.captured && ev.scoopEject >= 1 && Math.hypot(b.x - vk.x, b.y - vk.y) > 100, `(${Math.round(b.x)}, ${Math.round(b.y)})`);
    }
    // saucer z nastavljeno smerjo izmeta
    {
      const { g, T, run } = fresh();
      const sa = T.saucers.find(s => s.id === 'saucer');
      const b = g.newBall(sa.x, sa.y - 1); b.vy = 200;
      run(0.2);
      const caught = b.captured;
      run(1.0);
      ok('saucer ujame in izvrže v smer (desno navzdol)', caught && !b.captured && b.x > sa.x + 10, `vx ${Math.round(b.vx)}`);
    }

    // drop banka (4) → dropBank + lock prižgan + reset; vidni lock in sprostitev (multiball)
    {
      const { g, T, ev, run } = fresh();
      g.startGame(); run(0.2);
      const bank = T.banks.find(k => k.id === 'drop');
      for (const d of bank.targets) g.hitDrop(d);
      ok('drop banka poljubne dolžine (4) → dokončana', ev.dropsComplete === 1 && g.rules.lockLit && bank.targets.every(d => !d.active));
      run(1.3);
      ok('drop banka se ponastavi', bank.targets.every(d => d.active) && ev.dropsReset === 1);
      const lock = T.byId.lock, vk = T.saucers.find(s => s.id === 'vuk');
      const lockOne = () => { const b = g.balls.find(x => !x.captured) || g.newBall(vk.x, vk.y); b.x = vk.x; b.y = vk.y; b.vx = 0; b.vy = 0; b.saucerCool = 0; g.captureSaucer('vuk', b, true); };
      lockOne(); run(2);
      ok('vidni lock: žogica obstane v vrsti, nova pride v igro', lock.balls === 1 && ev.ballLocked === 1 && g.balls.length === 1, 'v locku ' + lock.balls);
      for (const d of bank.targets) g.hitDrop(d);
      run(1.3);
      lockOne(); run(0.2);
      const live0 = g.live;
      run(1.4);
      ok('sprostitev vseh žogic iz locka → multiball', g.rules.mb && lock.balls === 0 && ev.lockRelease === 2 && live0 >= 3 && g.live >= 3, 'žogic ' + g.balls.length + ' (live ' + live0 + ')');
    }

    // standupi (banka 3) → magnet prižgan; magnet ujame, drži in vrže
    {
      const { g, T, ev, run } = fresh();
      g.startGame(); run(0.2);
      for (const s of T.standups) g.seg(s, g.balls[0], 200, (s.ax + s.bx) / 2, s.ay, 0, 1);
      ok('standupi (3) štejejo zadetke od spredaj', ev.standup === 3 && g.rules.magnetLit, 'standup ' + (ev.standup || 0));
      const ball = g.balls[0], m = T.byId.magnet;
      ball.x = m.x + 25; ball.y = m.y - 10; ball.vx = 300; ball.vy = 200; ball.layer = 0;
      run(0.8);
      const held = Math.hypot(ball.x - m.x, ball.y - m.y) < 2 && Math.hypot(ball.vx, ball.vy) < 1;
      let thrown = 0;
      for (let t = 0; t < 1.5 && !thrown; t += FRAME) { g.update(FRAME); if (!m.on && ev.magnet >= 2) thrown = ball.vy; }
      ok('magnet zgrabi in zadrži žogico, nato jo vrže', held && ev.magnet >= 2 && thrown < -500, `met vy ${Math.round(thrown)}`);
    }

    // ujeta žogica: zadeta se premakne do konca kanala → stikalo, stebriček gor, igrača, preusmernik
    {
      const { g, T, ev, run } = fresh();
      g.startGame(); run(0.2);
      const c = T.captives[0];
      const b = g.balls[0]; b.x = c.ax; b.y = c.ay + 60; b.vx = 0; b.vy = -2600; b.layer = 0;
      const div = T.byId.div, a0 = div.angle;
      run(0.6);
      ok('ujeta žogica: zadetek jo potisne do konca kanala (stikalo)', ev.captive === 1 && ev.captiveHit >= 1, 'stikalo ' + (ev.captive || 0));
      ok('dvižni stebriček se dvigne (trk)', T.byId.post.active && ev.post === 1);
      run(0.5);
      ok('preusmernik se preklopi (geometrija se zavrti)', div.on && Math.abs(div.angle - div.a1) < 1e-3 && div.angle !== a0);
      const toy = T.byId.toy;
      ok('igrača se zavrti na novo lego', Math.abs(toy.angle - Math.PI / 2) < 1e-3, 'kot ' + toy.angle.toFixed(2));
      // žogico umakni v izstrelitveni kanal, da ne zadeva ujete žogice znova
      b.x = T.launch.x; b.y = T.launch.y - 11; b.vx = 0; b.vy = 0;
      run(8);
      ok('stebriček se spusti po 8 s', !T.byId.post.active);
      // ujeta žogica se vrne na začetek
      ok('ujeta žogica se vrne v mirovanje', c.t < 1 && Math.abs(c.v) < 50, 't ' + c.t.toFixed(1));
    }

    // igrača: trkalnik se premika z igračo
    {
      const { g, T, run } = fresh();
      const toy = T.byId.toy;
      g.moveToy('toy', { angle: Math.PI / 2 });
      run(1);
      const s = toy.segs[0];
      ok('igrača premakne svoj trkalnik', Math.abs(s.ax - s.bx) < 1 && Math.abs(s.ay - s.by) > 40);
    }

    // rollover kanali z lane change
    {
      const { g, run } = fresh();
      g.startGame(); run(0.2);
      g.rules.lanes = [true, false, false];
      g.setFlipper('R', true); g.setFlipper('R', false);
      ok('lane change: desni flipper premakne luči kanalov', g.rules.lanes[1] === true && g.rules.lanes[0] === false);
    }
  });

  // bot na testni mizi: vse igre se končajo, brez pobegov
  const gs = [];
  for (let i = 0; i < 6; i++) gs.push(botGame({ table: TEST, seed: 100 + i, maxSec: 1200 }));
  const r = botReport(gs);
  ok('bot na testni mizi: vse igre se končajo, brez pobegov', gs.every(x => x.over) && r.escapes === 0, JSON.stringify({ sec: r.avgSec, mb: r.multiballs, drainSredina: r.centerDrainPct }));
  return res;
}
