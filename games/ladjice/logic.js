/* =====================================================================
   POTAPLJANJE LADJIC — čista logika pravil (brez DOM-a, testirana).

   Celotno stanje igre je en JSON objekt (tudi PRNG: `st.rs`), zato ga
   lahko host shrani v room_state in ga po prenosu hosta kdorkoli nadaljuje.
   Polje = indeks i = y * size + x.

   Oznake na mreži (st.players[k].marks[i], javne):
     'm' zgrešeno · 'h' zadeto · 's' potopljeno · 'v' vaba · 'c' zaboj · 'x' mina
   Obveščevalni podatki (p.intel[targetId][i] = 1 ladja / 0 prazno) so zasebni.
   ===================================================================== */

import { CAPTAINS, ITEMS, CONTRACTS, contractById, MODIFIER_IDS, DAILY_CAPTAINS } from './content.js';

export const MANA_MAX = 10;
export const MANA = { miss: 2, kasetnaMiss: 3, hit: 1, sink: 2, torpedoSink: 1, bounty: 3, revenge: 1, repairRound: 1 };
export const INV_MAX = 2;
export const GHOST_EVERY = 3;
export const PLACE_SEC = 45;
export const TURN_SEC = 20;
export const DISCONNECT_ELIM_MS = 120000;
export const STORM_EVERY = 5;

/* ----------------------------------------------------------- PRNG */

/** cyrb53-podoben 32-bitni hash niza. */
export function hashSeed(str) {
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

/** mulberry32 z notranjim stanjem v objektu (o.rs) — [0, 1). */
export function rnd(o) {
  let t = (o.rs = (o.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Neodvisen generator iz niza. */
export function makeRand(seed) {
  const o = { rs: hashSeed(String(seed)) };
  const r = () => rnd(o);
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  return r;
}

const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];
function shuffleR(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ----------------------------------------------------------- mreža */

export const xy = (i, size) => [i % size, Math.floor(i / size)];
export const idx = (x, y, size) => y * size + x;
export const inB = (x, y, size) => x >= 0 && y >= 0 && x < size && y < size;

export function neighbors4(i, size) {
  const [x, y] = xy(i, size);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy])
    .filter(([a, b]) => inB(a, b, size)).map(([a, b]) => idx(a, b, size));
}
export function neighbors8(i, size) {
  const [x, y] = xy(i, size);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dy) && inB(x + dx, y + dy, size)) out.push(idx(x + dx, y + dy, size));
  }
  return out;
}

/** Velikost mreže in flota glede na način in število igralcev. */
export function configFor(mode, n = 2) {
  if (mode === 'br') return n <= 4 ? { size: 8, fleet: [4, 3, 2, 2] } : { size: 7, fleet: [3, 2, 2] };
  return { size: 10, fleet: [5, 4, 3, 3, 2] };
}

/** Celice ladje iz začetka, dolžine in usmeritve (ali null, če ne gre na mrežo). */
export function shipCells(x, y, len, vertical, size) {
  const out = [];
  for (let k = 0; k < len; k++) {
    const a = x + (vertical ? 0 : k), b = y + (vertical ? k : 0);
    if (!inB(a, b, size)) return null;
    out.push(idx(a, b, size));
  }
  return out;
}

/**
 * Veljavnost postavitve.
 * @param {number} size
 * @param {number[]} fleet dolžine
 * @param {number[][]} ships celice vsake ladje
 * @param {boolean} noTouch ladje se ne smejo dotikati (niti diagonalno)
 */
export function validateFleet(size, fleet, ships, noTouch = true) {
  if (!Array.isArray(ships) || ships.length !== fleet.length) return false;
  const want = fleet.slice().sort().join();
  if (ships.map(s => s?.length).sort().join() !== want) return false;
  const owner = new Map();
  for (let k = 0; k < ships.length; k++) {
    const cells = ships[k];
    if (!cells.every(c => Number.isInteger(c) && c >= 0 && c < size * size)) return false;
    const sorted = cells.slice().sort((a, b) => a - b);
    const horiz = sorted.every((c, j) => j === 0 || (c === sorted[j - 1] + 1 && Math.floor(c / size) === Math.floor(sorted[0] / size)));
    const vert = sorted.every((c, j) => j === 0 || c === sorted[j - 1] + size);
    if (!horiz && !vert) return false;
    for (const c of cells) {
      if (owner.has(c)) return false;
      owner.set(c, k);
    }
  }
  if (noTouch) {
    for (const [c, k] of owner) {
      for (const n of neighbors8(c, size)) if (owner.has(n) && owner.get(n) !== k) return false;
    }
  }
  return true;
}

/** Naključna veljavna flota (r: () => [0,1)). */
export function randomFleet(size, fleet, noTouch, r) {
  const lens = fleet.slice().sort((a, b) => b - a);
  for (let attempt = 0; attempt < 200; attempt++) {
    const taken = new Set(), blocked = new Set(), ships = [];
    let okAll = true;
    for (const len of lens) {
      let placed = null;
      for (let t = 0; t < 300 && !placed; t++) {
        const vertical = r() < 0.5;
        const x = Math.floor(r() * size), y = Math.floor(r() * size);
        const cells = shipCells(x, y, len, vertical, size);
        if (!cells || cells.some(c => taken.has(c) || blocked.has(c))) continue;
        placed = cells;
      }
      if (!placed) { okAll = false; break; }
      ships.push(placed);
      for (const c of placed) {
        taken.add(c);
        if (noTouch) for (const n of neighbors8(c, size)) blocked.add(n);
      }
    }
    if (okAll) return ships;
  }
  return noTouch ? randomFleet(size, fleet, false, r) : null;
}

/* ----------------------------------------------------------- stanje */

function newStats() {
  return {
    turns: 0, shots: 0, hits: 0, misses: 0, streak: 0, bestStreak: 0, missStreak: 0, maxMissStreak: 0,
    manaSpent: 0, manaGained: 0, maxMana: 0, abilities: 0, items: 0, sinks: 0, smallSinks: 0, torpSinks: 0,
    kills: 0, crates: 0, firstBlood: 0, empHit: 0, intelHits: 0, lastStandRounds: 0, decoyHits: 0, ghostSinks: 0,
    meteors: 0, lostShips: 0,
  };
}

/**
 * Nova igra (faza 'place').
 * @param {{mode:'ai'|'daily'|'duel'|'br', players:{id:string, captain?:string, ai?:string|null, dummy?:boolean, noFleet?:boolean}[],
 *          settings?:{noTouch?:boolean, crates?:boolean, turnSec?:number}, seed?:string, modifier?:string|null}} o
 */
export function newGame({ mode, players, settings = {}, seed = String(Date.now()), modifier = null }) {
  const cfg = configFor(mode, players.filter(p => !p.dummy || mode !== 'daily').length);
  const st = {
    v: 1, mode, size: cfg.size, fleet: cfg.fleet,
    settings: { noTouch: settings.noTouch !== false, crates: settings.crates !== false, turnSec: settings.turnSec ?? TURN_SEC },
    modifier, rs: hashSeed(seed + ':ladjice'), phase: 'place',
    players: [], turn: 0, round: 1, turnNo: 0, step: 0, ev: [], evSeq: 0,
    winner: null, firstHit: false,
  };
  for (const p of players) {
    st.players.push({
      id: p.id, captain: p.captain || 'sonar', ai: p.ai || null, dummy: !!p.dummy, noFleet: !!p.noFleet,
      ships: p.noFleet ? [] : null, marks: {}, intel: {}, hints: [],
      mana: modifier === 'plima' ? 5 : 0, inv: [], alive: true, skip: 0, shield: false,
      mines: [], crates: [], decoys: [], extraShots: 0, lastEmp: null, lastHitBy: null,
      vabaUsed: false, sonarDirUsed: false, ghostReady: 0, elimRound: null, elimStep: null, empWatch: false,
      lastShipSaid: false, cellsBefore: 0, offer: [], contract: null, contractDone: false, stats: newStats(),
    });
  }
  if (mode !== 'daily') for (const p of st.players) p.offer = contractOffer(st, p);
  return st;
}

/** 3 naključne pogodbe, smiselne za igralca. */
function contractOffer(st, p) {
  const others = st.players.filter(o => o !== p);
  const ok = c => {
    if (c.id === 'torp-sink') return p.captain === 'torpedo';
    if (c.id === 'emp-hit') return others.some(o => o.captain === 'emp');
    if (c.id === 'crates2' || c.id === 'items2') return st.settings.crates;
    if (c.id === 'intel-hit') return p.captain === 'sonar' || st.settings.crates;
    return true;
  };
  return shuffleR(() => rnd(st), CONTRACTS.filter(ok)).slice(0, 3).map(c => c.id);
}

export const playerById = (st, id) => st.players.find(p => p.id === id);
export const current = st => st.players[st.turn];
export const hasFleet = p => !!p && !p.noFleet && Array.isArray(p.ships) && p.ships.length > 0;
export const aliveShips = p => (p.ships || []).filter(s => !s.sunk);
export const aliveCells = p => (p.ships || []).reduce((a, s) => a + (s.sunk ? 0 : s.hits.filter(h => !h).length), 0);
/** Živi nasprotniki, na katere lahko p strelja. */
export const targetsOf = (st, p) => st.players.filter(o => o !== p && o.alive && hasFleet(o));

/** Nastavi floto igralca (faza 'place'). */
export function setFleet(st, pid, ships) {
  const p = playerById(st, pid);
  if (!p || st.phase !== 'place' || p.noFleet) return false;
  if (!validateFleet(st.size, st.fleet, ships, st.settings.noTouch)) return false;
  p.ships = ships.map((cells, k) => ({ id: k, cells: cells.slice(), hits: cells.map(() => 0), size: cells.length, sunk: false }));
  return true;
}

/** Izbira skrivne pogodbe. */
export function chooseContract(st, pid, id) {
  const p = playerById(st, pid);
  if (!p || !p.offer.includes(id) || p.contractDone) return false;
  p.contract = id;
  return true;
}

/** Konec postavitve: manjkajoče flote naključno, zaboji, pogodbe, prvi na potezi. */
export function startPlay(st) {
  if (st.phase !== 'place') return st;
  const R = () => rnd(st);
  for (const p of st.players) {
    if (!p.noFleet && !p.ships) setFleet(st, p.id, randomFleet(st.size, st.fleet, st.settings.noTouch, R));
    if (!p.contract && p.offer.length) p.contract = p.offer[0];
    p.cellsBefore = aliveCells(p);
  }
  if (st.settings.crates) {
    for (const p of st.players) {
      if (!hasFleet(p)) continue;
      const n = st.modifier === 'zakladi' ? 3 : 1 + (R() < 0.5 ? 1 : 0);
      const used = new Set(p.ships.flatMap(s => s.cells));
      const free = [];
      for (let i = 0; i < st.size * st.size; i++) if (!used.has(i)) free.push(i);
      p.crates = shuffleR(R, free).slice(0, n);
    }
  }
  const starters = st.players.map((p, i) => i).filter(i => !st.players[i].dummy && st.players[i].alive);
  st.turn = st.mode === 'duel' || st.mode === 'br' || st.mode === 'ai' ? pickR(R, starters) : starters[0];
  st.phase = 'play';
  st.turnNo = 1;
  st.evSeq++;
  st.ev = [{ k: 'start', turn: current(st).id }];
  return st;
}

/* ----------------------------------------------------------- mana */

function gain(st, p, n, ev, why) {
  if (!n || !p.alive) return;
  const before = p.mana;
  p.mana = Math.min(MANA_MAX, p.mana + n);
  const got = p.mana - before;
  p.stats.manaGained += got;
  p.stats.maxMana = Math.max(p.stats.maxMana, p.mana);
  if (got) ev.push({ k: 'mana', pid: p.id, n: got, why });
}

/** Cena sposobnosti za igralca (megla: sonar -1). */
export function abilityCost(st, p) {
  const c = CAPTAINS[p.captain];
  if (!c) return 99;
  return Math.max(1, c.cost - (st.modifier === 'megla' && p.captain === 'sonar' ? 1 : 0));
}

/** Kako mano vidijo nasprotniki (EMP pasivka: ±1, določeno iz kroga). */
export function shownMana(st, p, viewerId) {
  if (p.captain !== 'emp' || viewerId === p.id) return p.mana;
  const d = (hashSeed(`${p.id}:${st.turnNo}`) & 1) ? 1 : -1;
  return Math.max(0, Math.min(MANA_MAX, p.mana + d));
}

/** Vodja po potopitvah (glava na pladnju) ali null. */
export function bountyLeader(st) {
  if (st.mode !== 'br') return null;
  let best = null, tie = false;
  for (const p of st.players) {
    if (!p.alive || !p.stats.sinks) continue;
    if (!best || p.stats.sinks > best.stats.sinks) { best = p; tie = false; } else if (p.stats.sinks === best.stats.sinks) tie = true;
  }
  return tie ? null : best;
}

/* ----------------------------------------------------------- strel */

const shipAt = (T, c) => (T.ships || []).find(s => !s.sunk && s.cells.includes(c));
const decoyAt = (T, c) => T.decoys.find(d => d.cells.includes(c));

/**
 * Razreši strel na polje (brez mane za navaden strel — to doda klicatelj).
 * @returns {'miss'|'hit'|'sink'|'decoy'|'shield'|'crate'|'mine'|null}
 */
function resolveShot(st, shooter, T, cell, src, ev) {
  if (T.marks[cell] != null) return null;
  const ghost = src === 'meteor';
  const d = decoyAt(T, cell);
  if (d) {
    for (const c of d.cells) T.marks[c] = 'v';
    T.decoys = T.decoys.filter(x => x !== d);
    T.stats.decoyHits++;
    ev.push({ k: 'shot', by: shooter.id, target: T.id, cell, res: 'decoy', src, cells: d.cells });
    return 'decoy';
  }
  const ship = shipAt(T, cell);
  if (ship) {
    if (T.shield) {
      T.shield = false;
      ev.push({ k: 'shot', by: shooter.id, target: T.id, cell, res: 'shield', src });
      return 'shield';
    }
    const k = ship.cells.indexOf(cell);
    ship.hits[k] = 1;
    T.marks[cell] = 'h';
    if (!ghost) T.lastHitBy = shooter.id;
    if (!st.firstHit && !ghost) {
      st.firstHit = true;
      shooter.stats.firstBlood = 1;
      ev.push({ k: 'firstBlood', pid: shooter.id });
    }
    if (!ghost && shooter.intel[T.id]?.[cell] === 1) shooter.stats.intelHits++;
    if (shooter.captain === 'sonar' && !shooter.sonarDirUsed && !ghost) {
      shooter.sonarDirUsed = true;
      const dir = ship.cells.length > 1 && ship.cells[1] - ship.cells[0] === 1 ? 'h' : 'v';
      shooter.hints.push({ target: T.id, cell, dir });
      ev.push({ k: 'dir', pid: shooter.id, target: T.id, cell, dir });
    }
    if (ship.hits.every(Boolean)) {
      if (T.captain === 'vaba' && !T.vabaUsed) {
        T.vabaUsed = true;
        const back = ship.cells.find((c, j) => j !== k);
        ship.hits[ship.cells.indexOf(back)] = 0;
        delete T.marks[back];
        ev.push({ k: 'shot', by: shooter.id, target: T.id, cell, res: 'hit', src });
        ev.push({ k: 'saved', pid: T.id, cell: back });
        return 'hit';
      }
      ship.sunk = true;
      for (const c of ship.cells) T.marks[c] = 's';
      T.stats.lostShips++;
      ev.push({ k: 'shot', by: shooter.id, target: T.id, cell, res: 'sink', src, cells: ship.cells.slice(), size: ship.size });
      if (ghost) shooter.stats.ghostSinks++;
      else {
        shooter.stats.sinks++;
        if (ship.size === 2) shooter.stats.smallSinks++;
      }
      const left = aliveShips(T).length;
      if (left === 0) eliminate(st, T, shooter, ev);
      else if (left === 1 && !T.lastShipSaid) { T.lastShipSaid = true; ev.push({ k: 'lastShip', pid: T.id }); }
      return 'sink';
    }
    ev.push({ k: 'shot', by: shooter.id, target: T.id, cell, res: 'hit', src });
    return 'hit';
  }
  if (T.mines.includes(cell)) {
    T.mines = T.mines.filter(c => c !== cell);
    T.marks[cell] = 'x';
    if (!ghost && shooter.alive) shooter.skip++;
    ev.push({ k: 'shot', by: shooter.id, target: T.id, cell, res: 'mine', src });
    return 'mine';
  }
  if (T.crates.includes(cell)) {
    T.crates = T.crates.filter(c => c !== cell);
    T.marks[cell] = 'c';
    let item = null;
    if (!ghost && shooter.alive && shooter.inv.length < INV_MAX) {
      const pool = st.mode === 'daily' ? ['radar', 'dvojni'] : Object.keys(ITEMS);
      item = pickR(() => rnd(st), pool);
      shooter.inv.push(item);
    }
    if (!ghost) shooter.stats.crates++;
    ev.push({ k: 'shot', by: shooter.id, target: T.id, cell, res: 'crate', src, item });
    return 'crate';
  }
  T.marks[cell] = 'm';
  ev.push({ k: 'shot', by: shooter.id, target: T.id, cell, res: 'miss', src });
  return 'miss';
}

function eliminate(st, T, by, ev, forfeit = false) {
  if (!T.alive) return;
  T.alive = false;
  T.elimRound = st.round;
  T.elimStep = st.step;
  T.ghostReady = st.round + 1;
  T.skip = 0;
  if (by && by !== T && by.alive) by.stats.kills++;
  ev.push({ k: 'elim', pid: T.id, by: by?.id || null, forfeit });
}

/** Mana in nagrade po zadetku/potopitvi (vsi viri razen meteorja). */
function afterResult(st, p, T, res, ev, leader) {
  if (res === 'sink') {
    gain(st, p, MANA.sink + (p.captain === 'torpedo' ? MANA.torpedoSink : 0), ev, 'sink');
    if (leader && leader === T && leader !== p) {
      gain(st, p, MANA.bounty, ev, 'bounty');
      ev.push({ k: 'bounty', pid: p.id, target: T.id });
    }
  }
}

/* ----------------------------------------------------------- poteze */

/**
 * Izvedi dejanje igralca. Spremeni st. Vrne { ok, err?, ev }.
 * Dejanja:
 *   { t:'shot', target, cell }
 *   { t:'ability', target?, cell?, line?: { dir:'r'|'c', i }, vertical? }
 *   { t:'item', item, target?, cell? }      (ne porabi poteze)
 *   { t:'meteor' }                          (duh v battle royale, vsake 3 kroge)
 *   { t:'contract', id }                    (faza postavitve)
 */
export function act(st, pid, a) {
  const ev = [];
  const fail = err => ({ ok: false, err, ev: [] });
  const p = playerById(st, pid);
  if (!p || !a) return fail('invalid');
  if (a.t === 'contract') return chooseContract(st, pid, a.id) ? { ok: true, ev } : fail('invalid');
  if (st.phase !== 'play') return fail('phase');
  st.step++;
  for (const o of st.players) o.cellsBefore = aliveCells(o);
  const leader = bountyLeader(st);

  if (a.t === 'meteor') {
    if (st.mode !== 'br' || p.alive || p.noFleet || st.round < p.ghostReady) return fail('not_ready');
    const targets = st.players.filter(o => o.alive && hasFleet(o));
    if (!targets.length) return fail('invalid');
    const T = pickR(() => rnd(st), targets);
    const free = unmarked(st, T);
    if (!free.length) return fail('invalid');
    const cell = pickR(() => rnd(st), free);
    p.ghostReady = st.round + GHOST_EVERY;
    p.stats.meteors++;
    ev.push({ k: 'meteor', pid: p.id, target: T.id, cell });
    resolveShot(st, p, T, cell, 'meteor', ev);
    return finish(st, ev, !current(st).alive);
  }

  if (current(st) !== p || !p.alive) return fail('not_your_turn');

  if (a.t === 'shot') {
    const T = playerById(st, a.target);
    if (!T || T === p || !T.alive || !hasFleet(T)) return fail('bad_target');
    let cell = a.cell | 0;
    if (cell < 0 || cell >= st.size * st.size || T.marks[cell] != null) return fail('bad_cell');
    p.stats.turns++;
    p.stats.shots++;
    if (st.modifier === 'nevihta' && p.stats.shots % STORM_EVERY === 0) {
      const opts = neighbors4(cell, st.size).filter(c => T.marks[c] == null);
      if (opts.length) {
        const to = pickR(() => rnd(st), opts);
        ev.push({ k: 'storm', pid: p.id, from: cell, to });
        cell = to;
      }
    }
    const watch = p.empWatch;
    p.empWatch = false;
    const res = resolveShot(st, p, T, cell, 'shot', ev);
    const isHit = res === 'hit' || res === 'sink';
    if (isHit) {
      p.stats.hits++;
      p.stats.streak++;
      p.stats.bestStreak = Math.max(p.stats.bestStreak, p.stats.streak);
      p.stats.missStreak = 0;
      if (watch) p.stats.empHit++;
      gain(st, p, MANA.hit, ev, 'hit');
      if (p.stats.streak >= 2) ev.push({ k: 'streak', pid: p.id, n: p.stats.streak });
    } else if (res !== 'shield') {
      p.stats.misses++;
      p.stats.streak = 0;
      p.stats.missStreak++;
      p.stats.maxMissStreak = Math.max(p.stats.maxMissStreak, p.stats.missStreak);
      if (res !== 'decoy') {
        const base = p.captain === 'kasetna' ? MANA.kasetnaMiss : MANA.miss;
        gain(st, p, st.modifier === 'zlato' ? base * 2 : base, ev, 'miss');
      } else gain(st, p, MANA.hit, ev, 'hit');
      if (p.stats.missStreak >= 3) ev.push({ k: 'missStreak', pid: p.id, n: p.stats.missStreak });
    } else {
      p.stats.streak = 0;
    }
    afterResult(st, p, T, res, ev, leader);
    revenge(st, p, T, ev);
    if (p.extraShots > 0 && p.alive && targetsOf(st, p).length) {
      p.extraShots--;
      return finish(st, ev, false);
    }
    return finish(st, ev, true);
  }

  if (a.t === 'ability') {
    const cost = abilityCost(st, p);
    if (p.mana < cost) return fail('no_mana');
    const r = useAbility(st, p, a, ev, leader);
    if (r) return fail(r);
    p.mana -= cost;
    p.stats.manaSpent += cost;
    p.stats.abilities++;
    p.stats.turns++;
    p.extraShots = 0;
    ev.unshift({ k: 'ability', pid: p.id, captain: p.captain, target: a.target || null, cost });
    return finish(st, ev, true);
  }

  if (a.t === 'item') {
    const k = p.inv.indexOf(a.item);
    if (k < 0) return fail('no_item');
    const r = useItem(st, p, a, ev);
    if (r) return fail(r);
    p.inv.splice(k, 1);
    p.stats.items++;
    ev.unshift({ k: 'item', pid: p.id, item: a.item, target: a.target || null });
    return finish(st, ev, false);
  }
  return fail('invalid');
}

function revenge(st, p, T, ev) {
  if (st.mode === 'br' && p.lastHitBy && p.lastHitBy === T.id && p.alive) {
    gain(st, p, MANA.revenge, ev, 'revenge');
    ev.push({ k: 'revenge', pid: p.id, target: T.id });
  }
}

/** Neodkrita polja nasprotnika. */
export function unmarked(st, T) {
  const out = [];
  for (let i = 0; i < st.size * st.size; i++) if (T.marks[i] == null) out.push(i);
  return out;
}

/** Prosta polja na lastni mreži (za vabo/mino). */
function freeOwn(st, p, c) {
  return c >= 0 && c < st.size * st.size && p.marks[c] == null && !shipAt(p, c)
    && !(p.ships || []).some(s => s.cells.includes(c)) && !decoyAt(p, c) && !p.mines.includes(c) && !p.crates.includes(c);
}

function useAbility(st, p, a, ev, leader) {
  const cap = p.captain;
  const T = a.target != null ? playerById(st, a.target) : null;
  const needT = () => !T || T === p || !T.alive || !hasFleet(T);
  if (cap === 'sonar') {
    if (needT()) return 'bad_target';
    const c = a.cell | 0;
    if (c < 0 || c >= st.size * st.size) return 'bad_cell';
    const [cx, cy] = xy(c, st.size);
    const found = {};
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!inB(cx + dx, cy + dy, st.size)) continue;
      const i = idx(cx + dx, cy + dy, st.size);
      if (T.marks[i] != null) continue;
      found[i] = shipAt(T, i) || decoyAt(T, i) ? 1 : 0;
    }
    p.intel[T.id] = { ...(p.intel[T.id] || {}), ...found };
    ev.push({ k: 'sonar', pid: p.id, target: T.id, cell: c, found, n: Object.values(found).filter(Boolean).length });
    revenge(st, p, T, ev);
    return null;
  }
  if (cap === 'torpedo') {
    if (needT()) return 'bad_target';
    const line = a.line || {};
    const i0 = line.i | 0;
    if (!['r', 'c'].includes(line.dir) || i0 < 0 || i0 >= st.size) return 'bad_line';
    const path = [];
    let res = null, end = null;
    for (let k = 0; k < st.size; k++) {
      const c = line.dir === 'r' ? idx(k, i0, st.size) : idx(i0, k, st.size);
      path.push(c);
      if (T.marks[c] != null) continue;
      if (shipAt(T, c) || decoyAt(T, c)) {
        end = c;
        const sub = [];
        res = resolveShot(st, p, T, c, 'torpedo', sub);
        ev.push({ k: 'torpedo', pid: p.id, target: T.id, path: path.slice(), end, line });
        ev.push(...sub);
        if (res === 'sink') p.stats.torpSinks++;
        break;
      }
      if (T.mines.includes(c) || T.crates.includes(c)) continue;
      T.marks[c] = 'm';
    }
    if (end == null) ev.push({ k: 'torpedo', pid: p.id, target: T.id, path, end: null, line });
    afterResult(st, p, T, res, ev, leader);
    revenge(st, p, T, ev);
    return null;
  }
  if (cap === 'vaba') {
    const c = a.cell | 0;
    const [x, y] = xy(c, st.size);
    const tryDir = v => {
      const cells = shipCells(x, y, 2, v, st.size);
      return cells && cells.every(z => freeOwn(st, p, z)) ? cells : null;
    };
    const cells = tryDir(!!a.vertical) || tryDir(!a.vertical);
    if (!cells) return 'bad_cell';
    p.decoys.push({ cells });
    ev.push({ k: 'decoySet', pid: p.id, cells });
    return null;
  }
  if (cap === 'popravilo') {
    const c = a.cell | 0;
    const ship = shipAt(p, c);
    if (!ship) return 'bad_cell';
    const k = ship.cells.indexOf(c);
    if (!ship.hits[k]) return 'bad_cell';
    ship.hits[k] = 0;
    delete p.marks[c];
    ev.push({ k: 'repair', pid: p.id, cell: c });
    return null;
  }
  if (cap === 'emp') {
    if (needT()) return 'bad_target';
    if (p.lastEmp === T.id) return 'emp_repeat';
    T.skip++;
    p.lastEmp = T.id;
    ev.push({ k: 'emp', pid: p.id, target: T.id });
    revenge(st, p, T, ev);
    return null;
  }
  if (cap === 'kasetna') {
    if (needT()) return 'bad_target';
    const cells = shuffleR(() => rnd(st), unmarked(st, T)).slice(0, 4);
    ev.push({ k: 'cluster', pid: p.id, target: T.id, cells });
    for (const c of cells) {
      if (!T.alive) break;
      const res = resolveShot(st, p, T, c, 'kasetna', ev);
      afterResult(st, p, T, res, ev, leader);
    }
    revenge(st, p, T, ev);
    return null;
  }
  return 'invalid';
}

function useItem(st, p, a, ev) {
  if (a.item === 'radar') {
    const T = playerById(st, a.target);
    if (!T || T === p || !T.alive || !hasFleet(T)) return 'bad_target';
    const known = p.intel[T.id] || {};
    const cand = aliveShips(T).flatMap(s => s.cells.filter((c, j) => !s.hits[j])).filter(c => known[c] !== 1);
    if (!cand.length) return 'nothing';
    const c = pickR(() => rnd(st), cand);
    p.intel[T.id] = { ...known, [c]: 1 };
    ev.push({ k: 'radar', pid: p.id, target: T.id, cell: c });
    return null;
  }
  if (a.item === 'mina') {
    const c = a.cell | 0;
    if (!freeOwn(st, p, c)) return 'bad_cell';
    p.mines.push(c);
    ev.push({ k: 'mineSet', pid: p.id });
    return null;
  }
  if (a.item === 'dvojni') { p.extraShots++; ev.push({ k: 'double', pid: p.id }); return null; }
  if (a.item === 'scit') {
    if (p.shield) return 'already';
    p.shield = true;
    ev.push({ k: 'shieldSet', pid: p.id });
    return null;
  }
  return 'invalid';
}

/** Konec dejanja: pogodbe, konec igre, naslednja poteza. */
function finish(st, ev, endTurn) {
  checkEnd(st, ev);
  if (st.phase === 'play' && endTurn) advance(st, ev);
  checkContracts(st, ev, false);
  st.evSeq++;
  st.ev = ev;
  return { ok: true, ev };
}

function advance(st, ev) {
  const n = st.players.length;
  let i = st.turn;
  for (let guard = 0; guard < n * 6; guard++) {
    i = (i + 1) % n;
    if (i === 0) newRound(st, ev);
    const c = st.players[i];
    if (!c.alive || c.dummy) continue;
    if (c.skip > 0) {
      c.skip--;
      c.empWatch = true;
      ev.push({ k: 'skipped', pid: c.id });
      continue;
    }
    break;
  }
  st.turn = i;
  st.turnNo++;
  ev.push({ k: 'turn', pid: st.players[i].id });
}

function newRound(st, ev) {
  st.round++;
  for (const p of st.players) {
    if (!p.alive) continue;
    if (p.captain === 'popravilo' && st.round % 4 === 0) gain(st, p, MANA.repairRound, ev, 'repair');
    if (hasFleet(p) && aliveShips(p).length === 1) p.stats.lastStandRounds++;
  }
}

function checkContracts(st, ev, end) {
  for (const p of st.players) {
    if (!p.contract || p.contractDone) continue;
    const c = contractById(p.contract);
    if (c && c.check(p, st, { end, won: st.winner === p.id })) {
      p.contractDone = true;
      ev.push({ k: 'contract', pid: p.id, id: c.id });
    }
  }
}

/** Zmagovalec ob neodločenem: več preživelih polj pred zadnjim dejanjem, nato kasneje izločen. */
export function decideWinner(cands) {
  return cands.slice().sort((a, b) => (b.cellsBefore - a.cellsBefore) || ((b.elimStep ?? 0) - (a.elimStep ?? 0)))[0] || null;
}

function checkEnd(st, ev) {
  if (st.phase !== 'play') return;
  const alive = st.players.filter(p => p.alive);
  if (alive.length > 1) {
    // dnevni izziv: konec, ko AI nima več ladij (igralec brez flote ostane živ)
    return;
  }
  let w = alive[0] || null;
  if (!w) {
    const last = Math.max(...st.players.map(p => p.elimStep ?? -1));
    w = decideWinner(st.players.filter(p => p.elimStep === last));
    if (w) ev.push({ k: 'tie', pid: w.id });
  }
  st.phase = 'over';
  st.winner = w?.id || null;
  ev.push({ k: 'win', pid: st.winner });
  checkContracts(st, ev, true);
}

/** Igralec zapusti igro (ali ga host izloči po 2 min odsotnosti). */
export function forfeit(st, pid) {
  const p = playerById(st, pid);
  if (!p || !p.alive || st.phase !== 'play') return { ok: false, ev: [] };
  const ev = [];
  st.step++;
  for (const o of st.players) o.cellsBefore = aliveCells(o);
  const wasTurn = current(st) === p;
  eliminate(st, p, null, ev, true);
  return finish(st, ev, wasTurn);
}

/** Naključen strel za igralca na potezi (iztek časovnika). */
export function randomShot(st, pid) {
  const p = playerById(st, pid);
  const ts = targetsOf(st, p);
  if (!ts.length) return null;
  const T = pickR(() => rnd(st), ts);
  const free = unmarked(st, T);
  return { t: 'shot', target: T.id, cell: pickR(() => rnd(st), free) };
}

/** Ali lahko duh izstreli meteor. */
export const canMeteor = (st, p) => st.mode === 'br' && st.phase === 'play' && !!p && !p.alive && !p.noFleet && st.round >= p.ghostReady;

/* ----------------------------------------------------------- dnevni izziv */

/** Kapitan in modifikator dneva. */
export function dailyInfo(seed) {
  const r = makeRand(seed + ':ladjice:daily');
  return { captain: r.pick(DAILY_CAPTAINS), modifier: r.pick(MODIFIER_IDS) };
}

/** Igra dnevnega izziva (deterministična za seed). */
export function dailyGame(seed, meId) {
  const { captain, modifier } = dailyInfo(seed);
  const st = newGame({
    mode: 'daily', seed: seed + ':daily', modifier,
    players: [{ id: meId, captain, noFleet: true }, { id: 'ai', captain: 'sonar', dummy: true }],
  });
  return startPlay(st);
}

/* ----------------------------------------------------------- povzetek */

/** Nagrade ob koncu igre. */
export function awards(st) {
  const ps = st.players.filter(p => !p.dummy && !p.noFleet);
  const out = [];
  const best = (fn, min = 1) => {
    let b = null, bv = -Infinity;
    for (const p of ps) { const v = fn(p); if (v >= min && v > bv) { b = p; bv = v; } }
    return b ? { pid: b.id, value: bv } : null;
  };
  const acc = p => (p.stats.shots >= 3 ? Math.round((p.stats.hits / Math.max(1, p.stats.shots)) * 100) : -1);
  const list = [
    ['ostrostrelec', 'Ostrostrelec', '🎯', best(acc, 0), v => `${v} % natančnost`],
    ['smolar', 'Smolar', '🧂', best(p => p.stats.maxMissStreak, 2), v => `${v}× mimo zapored`],
    ['zilavec', 'Žilavec', '🫀', best(p => p.stats.lastStandRounds, 1), v => `${v} krogov z eno ladjo`],
    ['carovnik', 'Čarovnik', '🔮', best(p => p.stats.abilities, 1), v => `${v} sposobnosti`],
    ['lovec', 'Lovec na glave', '☠️', best(p => p.stats.kills * 10 + p.stats.sinks, 1), (v, pid) => `${playerById(st, pid).stats.sinks} potopitev`],
  ];
  for (const [id, title, icon, r, fmt] of list) if (r) out.push({ id, title, icon, pid: r.pid, text: fmt(r.value, r.pid) });
  return out;
}

/** Natančnost igralca v %. */
export const accuracy = p => (p.stats.shots ? Math.round((p.stats.hits / p.stats.shots) * 100) : 0);

/** Lestvica ob koncu: zmagovalec, nato po vrstnem redu izločitve (kasneje = bolje), nato preživela polja. */
export function standings(st) {
  return st.players.filter(p => !p.dummy && !p.noFleet)
    .slice()
    .sort((a, b) => (b.id === st.winner) - (a.id === st.winner)
      || (b.alive - a.alive)
      || ((b.elimStep ?? 1e9) - (a.elimStep ?? 1e9))
      || (aliveCells(b) - aliveCells(a)));
}

/**
 * XP ob koncu igre.
 * @param {{mode:string, won:boolean, contracts:number, level?:string}} o
 */
export function xpFor({ mode, won, contracts = 0, level = null }) {
  if (mode === 'daily') return 25 + 15;
  if (mode === 'ai') return 15 + (won ? (level === 'admiral' ? 40 : 20) : 0) + 10 * contracts;
  return 25 + (won ? 50 : 0) + 10 * contracts;
}

/** Ozek pogled za klienta: le razkrite informacije o tujih mrežah (UI nikoli ne vidi tujih ladij). */
export function knownGrid(st, viewerId, T) {
  const viewer = playerById(st, viewerId);
  const intel = viewer?.intel?.[T.id] || {};
  const sunk = (T.ships || []).filter(s => s.sunk).map(s => s.cells);
  return { marks: T.marks, intel, sunk };
}
