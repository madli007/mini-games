/* =====================================================================
   BOT — deterministične simulirane igre za katerokoli mizo
   botGame({ table, seed, skill, trace }) z zamenjavo Math.random odigra igro;
   botReport(rezultati) vrne statistiko (trajanje, drain po sredini/outlane,
   strele na minuto, multiballi, načini). Teče v Node in v brskalniku.
   ===================================================================== */
import { Bus } from './bus.js';
import { Game } from './game.js';

export const FRAME = 1 / 60;

/** deterministični naključni generator (LCG) */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** nova igra za mizo (modul tables/<id>/index.js) */
export function makeGame(table) {
  const bus = new Bus();
  const T = table.buildTable();
  const g = new Game(T, bus, table);
  return { g, bus, T };
}

/**
 * @param table modul mize
 * @param seed seme
 * @param skill verjetnost, da bot pritisne flipper, ko je žogica v dosegu
 * @param trace (ime, točke, frame) za vsak dogodek (zlati test)
 * @param maxSec varovalo
 */
export function botGame({ table, seed = 1, skill = 0.75, trace = null, maxSec = 1800, inspect = null, onFrame = null } = {}) {
  const rnd = seeded(seed);
  const save = Math.random;
  Math.random = rnd;               // determinizem
  const { g, bus, T } = makeGame(table);
  const ev = {};
  let frame = 0;
  // kje odteče žogica (za poročilo): sredina med flipperji ali outlane
  const drains = { center: 0, outlane: 0, other: 0 };
  const low = Math.max(...T.flippers.map(f => f.py));
  const fl = T.flippers.filter(f => f.layer === 0 && f.py >= low - 30);     // spodnja flipperja (brez zgornjih)
  const fx1 = Math.min(...fl.map(f => f.px)), fx2 = Math.max(...fl.map(f => f.px));
  bus.on('*', (d, n) => {
    ev[n] = (ev[n] || 0) + 1;
    if (trace) trace(n, g.score, frame);
    if (n === 'drain') { if (d.x > fx1 && d.x < fx2) drains.center++; else if (d.x < fx1 - 60 || d.x > fx2 + 60) drains.outlane++; else drains.other++; }
  });
  try {
    g.startGame();
    let t = 0;
    const hold = {};
    let plungeT = 0.5 + rnd();
    let nudgeCd = 0;
    while (g.state !== 'over' && t < maxSec) {
      // plunger
      if (g.ballWaiting()) {
        plungeT -= FRAME;
        if (plungeT <= 0 && !g.plungerHeld) { g.plungerDown(); hold.p = 0.5 + rnd() * 0.5; }
        if (g.plungerHeld && g.plungerPull >= (hold.p || 1)) { g.plungerUp(); plungeT = 0.6 + rnd(); }
      }
      // flipperji: pritisni, ko je žogica v dosegu in pada
      for (const f of T.flippers) {
        const s = f.button;
        if (hold[s] > 0) { hold[s] -= FRAME; if (hold[s] <= 0) g.setFlipper(s, false); continue; }
        for (const b of g.balls) {
          if (b.captured || b.layer !== f.layer) continue;
          const tipX = f.px + Math.cos(f.rest) * f.len;
          const inX = f.side === 'L' ? (b.x > f.px - 20 && b.x < tipX + 18) : (b.x < f.px + 20 && b.x > tipX - 18);
          if (inX && b.y > f.py - 45 && b.y < f.py + 20 && b.vy > -50) {
            if (rnd() < skill) {
              // zamik zadetka naključen → različni streli
              g.setFlipper(s, true);
              hold[s] = 0.15 + rnd() * 0.2;
            }
            break;
          }
        }
      }
      // občasno tresenje, ko gre žogica v outlane
      nudgeCd -= FRAME;
      if (nudgeCd <= 0 && g.balls.some(b => b.y > 760 && (b.x < 60 || b.x > 505) && b.vy > 0) && rnd() < 0.3) {
        g.nudge(); nudgeCd = 1.5;
      }
      g.update(FRAME);
      t += FRAME;
      frame++;
      if (onFrame) onFrame(g, frame);
    }
    if (inspect) inspect(g);
    const st = g.rules.gameStats();
    const shots = Object.values(g.shotCounts).reduce((a, x) => a + x, 0);
    return {
      table: table.id, seed, sec: Math.round(t), frames: frame, events: ev, score: g.score, over: g.state === 'over',
      modes: st.modes || 0, wizards: st.wizards || 0, multiballs: ev.multiball || 0, jackpots: ev.jackpot || 0,
      ramps: ev.rampMade || 0, orbits: ev.orbit || 0, scoops: ev.scoopEnter || 0, drains: ev.drain || 0,
      modeStarts: ev.modeStart || 0, extraBalls: ev.extraBall || 0, searches: ev.ballSearch || 0,
      escapes: ev.escape || 0, tilts: ev.tilt || 0, mystery: ev.mystery || 0, kickbacks: ev.kickback || 0, maxCombo: g.maxCombo,
      drainCenter: drains.center, drainOutlane: drains.outlane, shots, shotCounts: Object.assign({}, g.shotCounts),
      balls: g.cfg.steviloZogic + (ev.extraBall || 0),
    };
  } finally {
    Math.random = save;
  }
}

/** statistika več iger */
export function botReport(games) {
  const n = games.length || 1;
  const sum = k => games.reduce((a, x) => a + (x[k] || 0), 0);
  const drains = sum('drainCenter') + sum('drainOutlane') || 1;
  const balls = sum('balls') || 1;
  return {
    games: games.length,
    avgScore: Math.round(sum('score') / n),
    avgSec: +(sum('sec') / n).toFixed(1),
    avgBallSec: +(sum('sec') / balls).toFixed(1),
    centerDrainPct: +(100 * sum('drainCenter') / drains).toFixed(1),
    outlaneDrainPct: +(100 * sum('drainOutlane') / drains).toFixed(1),
    shotsPerMin: +(sum('shots') / Math.max(1, sum('sec') / 60)).toFixed(1),
    multiballs: +(sum('multiballs') / n).toFixed(2),
    modes: +(sum('modes') / n).toFixed(2),
    modeStarts: +(sum('modeStarts') / n).toFixed(2),
    jackpots: +(sum('jackpots') / n).toFixed(2),
    ramps: +(sum('ramps') / n).toFixed(1),
    searches: +(sum('searches') / n).toFixed(2),
    escapes: sum('escapes'),
  };
}
