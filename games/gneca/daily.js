/* =====================================================================
   GNEČA — daily.js: dnevni nivo iz seeda (čista logika).
   Sestavi nivo iz gradnikov (vrste vrat, ovire, stolpiči, valovi).
   Isti seed → isti nivo za vse. Rešljivost preverjajo testi
   (autopilot s fiksnimi nadgradnjami zmaga na ≥ 95 % seedov).
   ===================================================================== */
import { rng } from '../../shared/util.js';
import { B } from './balance.js';

/** Moč valov dnevnega nivoja (uglašeno s testom rešljivosti). */
export const DAILY = { towerHp: 420, waveN: 17, waveEvery: 3, grow: 1.6, giantFrom: 22, giantEvery: 16, giantHp: 30, stars: [2600, 3050] };

const r1 = v => Math.round(v * 10) / 10;
const f1 = v => Math.floor(v * 10) / 10;

/** Gradniki ene vrste vrat. Vsak dobi (rand, hw, z) in vrne seznam vrat. */
const ROWS = [
  // dobra | slaba
  (r, hw, z) => pair(r, hw, z, { op: 'x', v: 2 }, r() < 0.5 ? { op: '-', v: r.int(10, 30) } : { op: '/', v: 2 }),
  (r, hw, z) => pair(r, hw, z, { op: 'x', v: 2 }, { op: '+', v: 5 * r.int(5, 10) }),
  (r, hw, z) => pair(r, hw, z, { op: 'x', v: 3 }, { op: '-', v: 5 * r.int(6, 10) }),
  (r, hw, z) => pair(r, hw, z, { op: '+', v: 5 * r.int(6, 12) }, { op: '/', v: r.int(2, 3) }),
  // ena premična vrata ×2 na sredini
  (r, hw, z) => {
    const w = r1(Math.min(3, hw * 0.7));
    return [{ x: 0, z, w, op: 'x', v: 2, move: { amp: f1(hw - w / 2 - 0.2), speed: r1(r.range(0.8, 1.4)), phase: r1(r.range(0, 6)) } }];
  },
  // trojna vrsta: × | − | +
  (r, hw, z) => {
    const w = f1((2 * hw) / 3 - 0.1), order = r.shuffle([{ op: 'x', v: 2 }, { op: '-', v: 5 * r.int(4, 8) }, { op: '+', v: 5 * r.int(5, 9) }]);
    return order.map((g, k) => ({ x: r1(-hw + w / 2 + 0.05 + k * (w + 0.1)), z, w, ...g }));
  },
  // utrujena ×3 proti stalni ×2
  (r, hw, z) => {
    const gs = pair(r, hw, z, { op: 'x', v: 3 }, { op: 'x', v: 2 });
    gs[0].change = { after: 5 * r.int(6, 12), to: 1 };
    return gs;
  },
];

function pair(r, hw, z, a, b) {
  const w = f1(hw - 0.3), left = r() < 0.5;
  return [{ x: r1(left ? -hw / 2 : hw / 2), z, w, ...a }, { x: r1(left ? hw / 2 : -hw / 2), z, w, ...b }];
}

/**
 * Dnevni nivo.
 * @param {string} seed npr. hub.dailySeed() ('2026-11-28')
 */
export function dailyLevel(seed) {
  const r = rng(String(seed) + ':gneca:daily');
  const theme = r() < 0.5 ? 'puscava' : 'kanjon';
  const width = theme === 'puscava' ? r.pick([9, 10]) : r.pick([7.5, 8]);
  const length = r.int(56, 64);
  const hw = width / 2;
  const rows = r.int(3, 4);
  const zA = 10, zB = Math.round(length * 0.6);
  const gates = [], obstacles = [], turrets = [];
  const used = new Set();
  for (let k = 0; k < rows; k++) {
    const z = Math.round(zA + ((zB - zA) * k) / (rows - 1));
    let bi = r.int(0, ROWS.length - 1);
    if (k === 0) bi = r.int(0, 1);          // prva vrsta je vedno prijazna (× proti − / +)
    if (used.has(bi) && r() < 0.6) bi = (bi + 1) % ROWS.length;
    used.add(bi);
    gates.push(...ROWS[bi](r, hw, z));
  }
  // ovire med vrstami
  const nObs = r.int(0, 2);
  for (let k = 0; k < nObs; k++) {
    const gap = (zB - zA) / (rows - 1);
    const z = Math.round(zA + gap * (k + 0.5));
    const type = r() < 0.5 ? 'saw' : 'roller';
    if (type === 'saw') obstacles.push({ type, x: 0, z, r: 0.9, amp: f1(hw - 1.1), speed: r1(r.range(1, 1.6)), phase: r1(r.range(0, 6)) });
    else obstacles.push({ type, x: 0, z, w: 2.4, amp: f1(hw - 1.3), speed: r1(r.range(0.8, 1.3)), phase: r1(r.range(0, 6)) });
  }
  if (r() < 0.35) obstacles.push({ type: 'fence', x: r1(r.range(-1, 1)), z: 6, w: 2.4, d: 0.4 });
  // stolpiči ob stezi
  const nT = theme === 'kanjon' ? r.int(1, 2) : r.int(0, 1);
  for (let k = 0; k < nT; k++) turrets.push({ x: r1((k % 2 ? 1 : -1) * (hw - 0.45)), z: Math.round(r.range(18, length - 12)) });
  const D = DAILY;
  const waves = [
    { t: 3, n: D.waveN, every: D.waveEvery, until: 85, grow: D.grow },
    { t: D.giantFrom, n: 0, every: D.giantEvery, until: 80, grow: 0, giant: 1, hp: D.giantHp },
  ];
  return {
    id: 'dnevni', name: 'Dnevni nivo', set: 'dnevni', theme, length, width, time: B.lane.time,
    towerHp: D.towerHp, hint: '', gates, obstacles, turrets, waves, stars: D.stars.slice(),
  };
}
