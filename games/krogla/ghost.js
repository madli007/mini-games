/* =====================================================================
   HRČKOVA KROGLA — ghost.js: zapis, stiskanje in predvajanje voženj.
   ~20 vzorcev na sekundo: položaj (1/100 enote) in smer hrčka (256 korakov).
   Stiskanje: delta-delta kodiranje → zigzag varint → base64 (< 20 KB za 2 min).
   ===================================================================== */

export const RATE = 20;              // vzorcev na sekundo
export const VERSION = 1;
const Q = 100;                       // kvantizacija položaja
const YAW_Q = 256 / (2 * Math.PI);

/** Zapisovalnik: kliči sample(t, ball) vsak fizikalni korak; zapiše vsak 1/RATE s. */
export class Recorder {
  constructor() { this.frames = []; this.next = 0; }
  sample(t, b) {
    if (t + 1e-9 < this.next) return;
    this.next += 1 / RATE;
    this.frames.push([b.x, b.y, b.z, b.yaw || 0]);
  }
}

function zig(n) { return n >= 0 ? n * 2 : -n * 2 - 1; }
function unzig(n) { return n & 1 ? -(n + 1) / 2 : n / 2; }

function pushVar(out, n) {
  n = zig(n);
  while (n >= 128) { out.push((n % 128) | 128); n = Math.floor(n / 128); }
  out.push(n);
}

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

/** Kvantiziraj sličice (tako kot jih vrne decode). */
export function quantize(frames) {
  return frames.map(f => [Math.round(f[0] * Q), Math.round(f[1] * Q), Math.round(f[2] * Q), ((Math.round(f[3] * YAW_Q) % 256) + 256) % 256]);
}

/**
 * Stisni sličice [[x,y,z,yaw], …] v niz.
 * @returns {string}
 */
export function encode(frames) {
  const q = quantize(frames);
  const out = [];
  pushVar(out, VERSION);
  pushVar(out, q.length);
  const prev = [0, 0, 0, 0], vel = [0, 0, 0, 0];
  for (const f of q) {
    for (let k = 0; k < 4; k++) {
      let d = f[k] - prev[k];
      if (k === 3) d = ((d + 128) % 256 + 256) % 256 - 128;   // kot: najkrajša pot
      pushVar(out, d - vel[k]);
      vel[k] = d;
      prev[k] = f[k];
    }
  }
  return toB64(out);
}

/**
 * Razširi niz v sličice [[x,y,z,yaw], …].
 * @param {string} str
 */
export function decode(str) {
  const b = fromB64(str);
  let p = 0;
  const read = () => {
    let n = 0, mul = 1, byte;
    do { byte = b[p++]; n += (byte & 127) * mul; mul *= 128; } while (byte & 128 && p <= b.length);
    return unzig(n);
  };
  const ver = read();
  if (ver !== VERSION) throw new Error('neznana verzija ghosta');
  const n = read();
  const frames = [];
  const prev = [0, 0, 0, 0], vel = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const f = [];
    for (let k = 0; k < 4; k++) {
      vel[k] += read();
      prev[k] += vel[k];
      if (k === 3) prev[k] = ((prev[k] % 256) + 256) % 256;
      f.push(k === 3 ? prev[k] / YAW_Q : prev[k] / Q);
    }
    frames.push(f);
  }
  return frames;
}

/**
 * Položaj ghosta ob času t (linearna interpolacija).
 * @returns {{x:number, y:number, z:number, yaw:number, done:boolean}}
 */
export function sampleAt(frames, t) {
  if (!frames.length) return null;
  const f = t * RATE;
  const i = Math.floor(f);
  if (i >= frames.length - 1) { const l = frames[frames.length - 1]; return { x: l[0], y: l[1], z: l[2], yaw: l[3], done: true }; }
  if (i < 0) { const l = frames[0]; return { x: l[0], y: l[1], z: l[2], yaw: l[3], done: false }; }
  const a = frames[i], b = frames[i + 1], u = f - i;
  let dy = b[3] - a[3];
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, z: a[2] + (b[2] - a[2]) * u, yaw: a[3] + dy * u, done: false };
}

/** Trajanje ghosta v sekundah. */
export const duration = frames => Math.max(0, frames.length - 1) / RATE;
