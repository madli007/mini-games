/* =====================================================================
   SMUČARSKI SKOKI — ghost.js: zapis, stiskanje in predvajanje skoka.
   Ghost = skakalnica + zaletno mesto + konfiguracija vetra (seed) + vnosi po
   tickih + paramsVersion. Simulacija je deterministična, zato ghost ob
   predvajanju leti natanko tako kot takrat.
   Vnosi: zapišemo le spremembe (tick, gumb, nagib v pol stopinjah) →
   varint + zigzag → base64. Tipično 0,5–2 KB, meja 4 KB.
   ===================================================================== */
import { createJump } from './physics.js';

export const GHOST_VERSION = 2;   // 2: gumb 0|1|2 (oba gumba)
export const GHOST_MAX = 4096;
const MODES = ['off', 'const', 'random'];

/** Zapisovalnik vnosov: kliči push(tick, inp) za vsak tick. */
export class InputRecorder {
  constructor() { this.changes = []; this.last = null; this.ticks = 0; }
  push(tick, inp) {
    const b = inp.btn >= 2 ? 2 : inp.btn ? 1 : 0, p = Math.round(inp.pitch * 2);
    if (!this.last || this.last[1] !== b || this.last[2] !== p) { this.last = [tick, b, p]; this.changes.push(this.last); }
    this.ticks = tick + 1;
  }
}

/** Funkcija vnosov iz zapisanih sprememb (za simulate / createJump). */
export function inputFrom(changes) {
  let i = 0, cur = { btn: 0, pitch: 0 };
  return (_s, tick) => {
    while (i < changes.length && changes[i][0] <= tick) { cur = { btn: changes[i][1], pitch: changes[i][2] / 2 }; i++; }
    return cur;
  };
}

/* ------------------------------------------------------------ bajti */
const zig = n => n >= 0 ? n * 2 : -n * 2 - 1;
const unzig = n => n % 2 ? -(n + 1) / 2 : n / 2;
function pushU(out, n) { n = Math.max(0, Math.floor(n)); while (n >= 128) { out.push((n % 128) | 128); n = Math.floor(n / 128); } out.push(n); }
const pushZ = (out, n) => pushU(out, zig(Math.round(n)));

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 4096) s += String.fromCharCode.apply(null, bytes.slice(i, i + 4096));
  return btoa(s);
}
function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Stisni ghost v niz base64.
 * @param {{pv:number, hill:string, gate:number, wind:{mode:string, seed:number, speed?:number}, changes:number[][], ticks:number, dist:number, total:number}} g
 */
export function encodeGhost(g) {
  const out = [];
  pushU(out, GHOST_VERSION);
  pushU(out, g.pv);
  pushU(out, g.hill.length);
  for (const ch of g.hill) out.push(ch.charCodeAt(0) & 127);
  pushU(out, g.gate);
  pushU(out, Math.max(0, MODES.indexOf(g.wind.mode)));
  pushU(out, (g.wind.seed >>> 0) % 65536); pushU(out, Math.floor((g.wind.seed >>> 0) / 65536));
  pushZ(out, (g.wind.speed || 0) * 10);
  pushU(out, g.ticks);
  pushZ(out, g.dist * 2);
  pushZ(out, g.total * 10);
  pushU(out, g.changes.length);
  let pt = 0, pp = 0;
  for (const [t, b, p] of g.changes) {
    pushU(out, t - pt);
    const dp = p - pp;
    out.push(b | (dp !== 0 ? 4 : 0));
    if (dp !== 0) pushZ(out, dp);
    pt = t; pp = p;
  }
  return toB64(out);
}

/** Razširi niz v ghost (vrže napako, če je pokvarjen). */
export function decodeGhost(str) {
  const b = fromB64(str);
  let p = 0;
  const U = () => {
    let n = 0, mul = 1, byte;
    do { if (p >= b.length) throw new Error('ghost: prekratek'); byte = b[p++]; n += (byte & 127) * mul; mul *= 128; } while (byte & 128);
    return n;
  };
  const Z = () => unzig(U());
  if (U() !== GHOST_VERSION) throw new Error('ghost: neznana verzija');
  const pv = U();
  const n = U();
  let hill = '';
  for (let i = 0; i < n; i++) hill += String.fromCharCode(b[p++]);
  const gate = U();
  const mode = MODES[U()] || 'off';
  const seed = (U() + U() * 65536) >>> 0;
  const speed = Z() / 10;
  const ticks = U();
  const dist = Z() / 2;
  const total = Z() / 10;
  const nc = U();
  const changes = [];
  let pt = 0, pp = 0;
  for (let i = 0; i < nc; i++) {
    pt += U();
    const f = b[p++];
    if (f & 4) pp += Z();
    changes.push([pt, f & 3, pp]);
  }
  return { pv, hill, gate, wind: { mode, seed, speed }, ticks, dist, total, changes };
}

/**
 * Ustvari simulacijo, ki predvaja ghost (koračiš jo z J.step(inp(J.s, J.s.tick))).
 * @returns {{J:Object, input:Function}}
 */
export function ghostJump(g, hill, P, record = 0, mods = null) {
  const J = createJump({ hill, P, gate: g.gate, wind: g.wind, record, mods });
  return { J, input: inputFrom(g.changes) };
}
