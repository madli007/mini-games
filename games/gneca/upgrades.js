/* =====================================================================
   GNEČA — upgrades.js: nadgradnje delavnice (cene in učinek na
   parametre simulacije) in napredek igralca (zvezdice, zobniki).
   Čista logika; shranjevanje je v game.js (shared/storage.js + hub.writeSave).
   ===================================================================== */
import { B } from './balance.js';

/** max = najvišja stopnja · cost(l) = cena za prehod l → l+1. */
export const UPGRADES = [
  { id: 'rate', name: 'Hitrost streljanja', icon: '🔫', desc: '+1 tekač na sekundo', max: 5, base: 20, step: 15 },
  { id: 'bonus', name: 'Začetni bonus', icon: '⚡', desc: 'prvih 12 strelov na stopnjo je ×2', max: 3, base: 25, step: 20 },
  { id: 'charge', name: 'Polnilec velikana', icon: '🔋', desc: 'velikan 5 tekačev prej', max: 4, base: 20, step: 15 },
  { id: 'giantHp', name: 'HP velikana', icon: '🛡️', desc: '+8 HP velikanu', max: 4, base: 20, step: 15 },
  { id: 'width', name: 'Širok top', icon: '↔️', desc: '2 tekača naenkrat', max: 1, base: 120, step: 0 },
];

export const MAX_UPGRADES = Object.fromEntries(UPGRADES.map(u => [u.id, u.max]));
export const NO_UPGRADES = Object.fromEntries(UPGRADES.map(u => [u.id, 0]));

export const upgradeCost = (u, level) => (level >= u.max ? null : u.base + u.step * level);

/** Parametri simulacije iz stopenj nadgradenj. */
export function paramsFor(lv = {}) {
  const g = k => Math.max(0, Math.min(MAX_UPGRADES[k], lv[k] | 0));
  return {
    fireRate: B.cannon.fireRate + g('rate'),
    bonusShots: g('bonus') * 12,
    giantCharge: B.giant.charge - g('charge') * 5,
    giantHp: B.giant.hp + g('giantHp') * 8,
    perShot: 1 + g('width'),
  };
}

/** Prazen napredek. */
export function newProgress() {
  return { v: 1, rev: 0, gears: 0, up: { ...NO_UPGRADES }, levels: {}, daily: {}, autoGiant: false };
}

/** Popravi / dopolni napredek iz shrambe (tuj vnos). */
export function sanitizeProgress(p) {
  const out = newProgress();
  if (!p || typeof p !== 'object') return out;
  out.rev = Math.max(0, p.rev | 0);
  out.gears = Math.max(0, Math.min(1e6, p.gears | 0));
  for (const u of UPGRADES) out.up[u.id] = Math.max(0, Math.min(u.max, (p.up && p.up[u.id]) | 0));
  if (p.levels && typeof p.levels === 'object') {
    for (const [k, v] of Object.entries(p.levels)) {
      if (!/^[a-z0-9-]{1,32}$/.test(k) || !v) continue;
      out.levels[k] = { stars: Math.max(0, Math.min(3, v.stars | 0)), best: Math.max(0, v.best | 0), wins: Math.max(0, v.wins | 0), noMinus: !!v.noMinus };
    }
  }
  if (p.daily && typeof p.daily === 'object') {
    for (const [k, v] of Object.entries(p.daily)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v) continue;
      out.daily[k] = { first: Math.max(0, v.first | 0), stars: Math.max(0, Math.min(3, v.stars | 0)), best: Math.max(0, v.best | 0) };
    }
    // obdrži le zadnjih 40 dni
    const keys = Object.keys(out.daily).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete out.daily[k];
  }
  out.autoGiant = !!p.autoGiant;
  return out;
}

/** Kupi stopnjo nadgradnje. Vrne nov napredek ali vrže napako ('max' | 'gears'). */
export function buyUpgrade(prog, id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u) throw new Error('unknown');
  const lv = prog.up[id] | 0;
  const cost = upgradeCost(u, lv);
  if (cost == null) throw Object.assign(new Error('max'), { code: 'max' });
  if (prog.gears < cost) throw Object.assign(new Error('gears'), { code: 'gears' });
  return { ...prog, gears: prog.gears - cost, up: { ...prog.up, [id]: lv + 1 }, rev: prog.rev + 1 };
}

/** Zapiši rezultat nivoja kampanje. */
export function recordLevel(prog, levelId, { won, stars, score, noMinus }, gears) {
  const cur = prog.levels[levelId] || { stars: 0, best: 0, wins: 0, noMinus: false };
  const next = {
    stars: Math.max(cur.stars, stars), best: Math.max(cur.best, score),
    wins: cur.wins + (won ? 1 : 0), noMinus: cur.noMinus || (won && noMinus),
  };
  return { ...prog, gears: prog.gears + gears, levels: { ...prog.levels, [levelId]: next }, rev: prog.rev + 1 };
}

/** Ali je nivo odklenjen: prvi v sklopu je odklenjen, če je prejšnji sklop končan; ostali po zmagi prejšnjega. */
export function isUnlocked(prog, sets, setIdx, lvIdx) {
  if (setIdx === 0 && lvIdx === 0) return true;
  const prev = lvIdx > 0 ? sets[setIdx].levels[lvIdx - 1] : sets[setIdx - 1].levels[sets[setIdx - 1].levels.length - 1];
  return (prog.levels[prev.id]?.stars || 0) > 0;
}

/** Novejši od dveh napredkov (večji rev; ob enakem več zvezdic/zobnikov). */
export function newerProgress(a, b) {
  if (!a) return b; if (!b) return a;
  if (a.rev !== b.rev) return a.rev > b.rev ? a : b;
  const score = p => Object.values(p.levels).reduce((s, l) => s + l.stars, 0) * 1000 + p.gears;
  return score(a) >= score(b) ? a : b;
}
