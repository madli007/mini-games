/* =====================================================================
   RUŠILEC — net.js: omrežni protokol (čista logika, brez DOM-a).
   • posnetek stanja: kvantizirano (Int16) + base64 → ~200 B za 8 krogel
   • interpolacija tujih krogel (zamik ~100 ms) in ocena časa hosta
   • popravek napovedi lastne krogle (mehko, ob veliki razliki skok)
   • zanesljivi dogodki z zaporedno številko (vrzel → resync)
   • kvantiziran vhod (−127..127)
   Protokol je opisan v games/rusilec/README.md.
   ===================================================================== */

export const NET = {
  SNAP_HZ: 15,        // posnetki na sekundo (Supabase: ≤ 20 sporočil/s na klienta)
  FULL_MS: 1000,      // polno stanje (prenos hosta)
  IN_MS: 50,          // vhod: največ 20×/s ob spremembi …
  IN_IDLE_MS: 400,    // … in vsaj vsakih 400 ms (ko se ne spremeni)
  DELAY: 0.1,         // zamik interpolacije (s)
  SNAP_DIST: 1.6,     // napoved: nad tem skok
  SOFT: 0.22,         // napoved: delež napake, ki se popravi ob posnetku
  ABSENT_MS: 20000,   // odsoten več kot 20 s → umik iz arene
};

/* ------------------------------------------------------------ base64 (brskalnik in Node) */

function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
function fromB64(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

/* ------------------------------------------------------------ posnetek */

const ST = ['alive', 'dead', 'out'];
const PER = 9;   // int16 na kroglo
const clamp16 = v => Math.max(-32768, Math.min(32767, Math.round(v)));

/**
 * Zakodiraj posnetek.
 * @param {{seq:number, t:number, balls:{x,y,z,vx,vy,vz,yaw,st,inv?,dash?,ice?,weight?,bumper?,magnet?,dashCd?}[], pk?:any[], gu?:any[], ev?:any[]}} s
 * @returns {{s:number, t:number, d:string, pk?:any[], gu?:any[], ev?:any[]}}
 */
export function encodeSnap(s) {
  const n = s.balls.length;
  const a = new Int16Array(n * PER);
  s.balls.forEach((b, i) => {
    const o = i * PER;
    a[o] = clamp16(b.x * 100); a[o + 1] = clamp16(b.y * 100); a[o + 2] = clamp16(b.z * 100);
    a[o + 3] = clamp16(b.vx * 100); a[o + 4] = clamp16(b.vy * 100); a[o + 5] = clamp16(b.vz * 100);
    a[o + 6] = clamp16(Math.atan2(Math.sin(b.yaw || 0), Math.cos(b.yaw || 0)) * 10000);
    a[o + 7] = Math.max(0, ST.indexOf(b.st)) | (b.inv ? 4 : 0) | (b.dash ? 8 : 0) | (b.ice ? 16 : 0) | (b.weight ? 32 : 0) | (b.bumper ? 64 : 0) | (b.magnet ? 128 : 0) | (b.crown ? 256 : 0);
    a[o + 8] = clamp16((b.dashCd || 0) * 1000);
  });
  const out = { s: s.seq, t: Math.round(s.t * 1000), d: toB64(new Uint8Array(a.buffer)) };
  if (s.pk && s.pk.length) out.pk = s.pk;
  if (s.gu && s.gu.length) out.gu = s.gu;
  if (s.ev && s.ev.length) out.ev = s.ev;
  return out;
}

/** Odkodiraj posnetek (obratno od encodeSnap). */
export function decodeSnap(o) {
  const u8 = fromB64(o.d);
  const a = new Int16Array(u8.buffer, 0, u8.length >> 1);
  const balls = [];
  for (let i = 0; i + PER <= a.length; i += PER) {
    const f = a[i + 7];
    balls.push({
      x: a[i] / 100, y: a[i + 1] / 100, z: a[i + 2] / 100, vx: a[i + 3] / 100, vy: a[i + 4] / 100, vz: a[i + 5] / 100,
      yaw: a[i + 6] / 10000, st: ST[f & 3] || 'alive', inv: !!(f & 4), dash: !!(f & 8), ice: !!(f & 16), weight: !!(f & 32),
      bumper: !!(f & 64), magnet: !!(f & 128), crown: !!(f & 256), dashCd: a[i + 8] / 1000,
    });
  }
  return { seq: o.s, t: o.t / 1000, balls, pk: o.pk || [], gu: o.gu || [], ev: o.ev || [] };
}

/** Velikost sporočila v bajtih (JSON). */
export const msgSize = o => new TextEncoder().encode(JSON.stringify(o)).length;

/* ------------------------------------------------------------ vhod */

/** Vhod → { s, x, z, d } (x, z ∈ −127..127). */
export const encodeInput = (seq, x, z, d) => ({ s: seq, x: Math.round(Math.max(-1, Math.min(1, x)) * 127), z: Math.round(Math.max(-1, Math.min(1, z)) * 127), d: d | 0 });
export const decodeInput = o => ({ x: (o?.x | 0) / 127, z: (o?.z | 0) / 127, d: o?.d | 0, s: o?.s | 0 });

/* ------------------------------------------------------------ ura hosta */

/** Ocena časa runde na hostu iz posnetkov (gladko, odporno na tresenje). */
export class HostClock {
  constructor() { this.off = null; }
  /** @param {number} hostT čas runde v posnetku (s) @param {number} now lokalni čas (s) */
  sample(hostT, now) {
    const o = hostT - now;
    if (this.off == null || Math.abs(o - this.off) > 0.5) this.off = o;   // velik skok: prevzemi
    else if (o > this.off) this.off += (o - this.off) * 0.3;             // posnetek je prišel hitreje: hitro
    else this.off += (o - this.off) * 0.05;                              // zakasnjen: počasi
  }
  now(now) { return this.off == null ? null : now + this.off; }
}

/* ------------------------------------------------------------ interpolacija */

const lerp = (a, b, f) => a + (b - a) * f;
function lerpAngle(a, b, f) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * f; }

/** Medpomnilnik posnetkov za interpolacijo tujih krogel. */
export class Interp {
  constructor(max = 30) { this.buf = []; this.max = max; }
  push(snap) {
    const b = this.buf;
    if (b.length && snap.t <= b[b.length - 1].t) {
      if (snap.t < b[0].t - 1) this.buf = [snap];   // nova runda / nov host
      return;
    }
    b.push(snap);
    if (b.length > this.max) b.shift();
  }
  clear() { this.buf = []; }
  get last() { return this.buf[this.buf.length - 1] || null; }
  /**
   * Stanje krogle i ob času t (interpolacija; za zadnjim posnetkom ekstrapolacija največ 0,15 s).
   * @returns {Object|null}
   */
  sample(i, t) {
    const b = this.buf;
    if (!b.length) return null;
    let k = b.length - 1;
    while (k > 0 && b[k - 1].t > t) k--;
    if (t >= b[b.length - 1].t) {
      const s = b[b.length - 1].balls[i];
      if (!s) return null;
      const dt = Math.min(0.15, t - b[b.length - 1].t);
      return { ...s, x: s.x + s.vx * dt, y: s.y + (s.st === 'alive' ? 0 : s.vy * dt), z: s.z + s.vz * dt };
    }
    if (k === 0) return b[0].balls[i] ? { ...b[0].balls[i] } : null;
    const A = b[k - 1], B = b[k];
    const a = A.balls[i], c = B.balls[i];
    if (!a || !c) return c ? { ...c } : a ? { ...a } : null;
    const f = Math.max(0, Math.min(1, (t - A.t) / Math.max(1e-6, B.t - A.t)));
    // skok (ponovni prihod): brez drsenja čez areno
    if (a.st !== c.st || Math.hypot(c.x - a.x, c.z - a.z) > 3) return { ...(f < 0.5 ? a : c) };
    return {
      ...c, x: lerp(a.x, c.x, f), y: lerp(a.y, c.y, f), z: lerp(a.z, c.z, f),
      vx: lerp(a.vx, c.vx, f), vy: lerp(a.vy, c.vy, f), vz: lerp(a.vz, c.vz, f), yaw: lerpAngle(a.yaw, c.yaw, f),
    };
  }
}

/* ------------------------------------------------------------ popravek napovedi */

/**
 * Mehko popravi lokalno napovedano kroglo proti stanju hosta.
 * @param {Object} local telo (x, y, z, vx, vy, vz) — spremeni se
 * @param {Object} auth stanje iz posnetka
 * @param {number} lag koliko je posnetek star (s) — avtoritativno stanje se ekstrapolira
 * @returns {{hard:boolean, err:number}}
 */
export function correct(local, auth, lag = 0) {
  const ax = auth.x + auth.vx * lag, az = auth.z + auth.vz * lag, ay = auth.y + (auth.st === 'alive' ? 0 : auth.vy * lag);
  const ex = ax - local.x, ey = ay - local.y, ez = az - local.z;
  const err = Math.hypot(ex, ez);
  const dv = Math.hypot(auth.vx - local.vx, auth.vz - local.vz);
  if (err > NET.SNAP_DIST || auth.st !== 'alive' || Math.abs(ey) > 1.2) {
    Object.assign(local, { x: ax, y: ay, z: az, vx: auth.vx, vy: auth.vy, vz: auth.vz });
    return { hard: true, err };
  }
  // trk (velika sprememba hitrosti): prevzemi hitrost hosta takoj, položaj hitreje
  const k = dv > 3 ? Math.max(NET.SOFT, 0.5) : NET.SOFT;
  local.x += ex * k; local.z += ez * k; local.y += ey * k;
  const kv = dv > 3 ? 1 : 0.3;
  local.vx += (auth.vx - local.vx) * kv; local.vz += (auth.vz - local.vz) * kv;
  return { hard: false, err };
}

/* ------------------------------------------------------------ zanesljivi dogodki */

/** Host: dnevnik dogodkov z zaporedno številko (zadnjih 200). */
export class EventLog {
  constructor(seq = 0) { this.seq = seq; this.list = []; this.sent = seq; }
  push(e) { const o = { ...e, q: ++this.seq }; this.list.push(o); if (this.list.length > 200) this.list.shift(); return o; }
  /** Dogodki po zaporedni številki q (za resync). */
  since(q) { return this.list.filter(e => e.q > q); }
  /** Novi, še neposlani dogodki. */
  take() { const out = this.list.filter(e => e.q > this.sent); this.sent = this.seq; return out; }
}

/** Klient: sprejme dogodke po vrsti, zazna vrzel. */
export class EventSink {
  constructor() { this.q = null; this.gap = false; this.pending = new Map(); }
  /** Ponastavi na znano številko (npr. iz polnega stanja). */
  reset(q) { this.q = q; this.gap = false; this.pending.clear(); }
  /**
   * @param {{q:number}[]} list
   * @returns {Object[]} novi dogodki po vrsti
   */
  accept(list) {
    const out = [];
    for (const e of list || []) if (this.q == null || e.q > this.q) this.pending.set(e.q, e);
    if (this.q == null && this.pending.size) this.q = Math.min(...this.pending.keys()) - 1;
    while (this.pending.has(this.q + 1)) { const e = this.pending.get(this.q + 1); this.pending.delete(this.q + 1); this.q++; out.push(e); }
    this.gap = this.pending.size > 0;
    return out;
  }
}
