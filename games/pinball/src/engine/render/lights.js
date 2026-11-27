/* =====================================================================
   SVETLOBNI ŠOVI — koreografije insertov in GI čez celo mizo
   ===================================================================== */
import { DEFAULT_PAL } from '../config.js';
let PAL = DEFAULT_PAL;

const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const RAINBOW = ['#ff3b4a', '#ff7a1a', '#ffd23f', '#39ff88', '#6fd3ff', '#8a7bff', '#ff4fd8'];

export class Lights {
  constructor(T, pal) {
    this.T = T;
    if (pal) PAL = pal;
    const P = T.points || {};
    this.C = P.center || [300, 560];             // središče radialnih šovov
    this.S = P.scoop || this.C;                  // glavni lov (scoop)
    this.M = P.modes || this.C;                  // plošča misij
    this.R = P.lineUp || P.ramp || [187, 0];      // rampa (črta navzgor)
    this.shows = [];
    this.gi = 1;           // splošna osvetlitev (0..1.3)
    this.giFx = [];        // GI animacije
    this.attract = false;
    this.attractT = 0;
    this.out = {};         // id → { i, c }
    for (const l of T.lamps) this.out[l.id] = { i: 0, c: l.color, rgb: hex(l.color) };
  }

  /** zaženi šov: tip, trajanje, barva, opcije */
  play(type, dur = 1.2, color = PAL.gold, o = {}) {
    this.shows.push(Object.assign({ type, dur, t: 0, color, x: this.C[0], y: this.C[1] }, o));
    if (this.shows.length > 6) this.shows.shift();
  }

  giFlash(seq) {
    // seq: [[čas, vrednost], ...]
    this.giFx.push({ seq, t: 0 });
  }

  /** veliki dogodki → koreografija */
  event(name, d = {}) {
    switch (name) {
      case 'jackpot':
        this.play('radial', 1.4, PAL.gold, { x: d.x, y: d.y });
        this.play('strobe', 0.6, PAL.gold);
        this.giFlash([[0, 0.2], [0.08, 1.4], [0.2, 0.3], [0.3, 1.3], [0.7, 1]]);
        break;
      case 'superJackpot':
        this.play('radial', 2, PAL.gold, { x: d.x, y: d.y });
        this.play('rainbow', 2.2);
        this.giFlash([[0, 0], [0.15, 1.5], [0.3, 0.2], [0.45, 1.5], [0.6, 0.2], [0.8, 1.4], [1.6, 1]]);
        break;
      case 'multiball':
        this.play('sweepUp', 1.0, PAL.gold);
        this.play('sweepDown', 1.0, PAL.melt, { delay: 0.9 });
        this.play('chase', 2.4, PAL.gold, { delay: 1.6 });
        this.giFlash([[0, 0.15], [1.2, 0.15], [1.3, 1.5], [1.6, 1]]);
        break;
      case 'modeStart':
        this.play('sweepUp', 1.1, d.color || PAL.melt);
        this.play('radial', 1.2, d.color || PAL.melt, { x: this.S[0], y: this.S[1], delay: 0.6 });
        this.giFlash([[0, 0.3], [1.0, 0.3], [1.2, 1]]);
        break;
      case 'modeComplete':
        this.play('rainbow', 1.6);
        this.play('radial', 1.5, d.color || PAL.gold, { x: this.M[0], y: this.M[1] });
        this.giFlash([[0, 1.4], [0.2, 0.4], [0.4, 1.3], [1, 1]]);
        break;
      case 'wizardStart':
        this.play('rainbow', 4.5);
        this.play('chase', 4.5, PAL.gold, { delay: 0.3 });
        this.giFlash([[0, 0], [1.2, 0], [1.4, 1.6], [1.6, 0.2], [1.8, 1.6], [2.4, 1.1]]);
        break;
      case 'skill':
      case 'extraBall':
        this.play('sweepUp', 0.9, name === 'skill' ? PAL.white : PAL.magenta);
        break;
      case 'lock':
        this.play('radial', 1.1, PAL.code, { x: this.S[0], y: this.S[1] });
        break;
      case 'drain':
        this.play('sweepDown', 0.7, PAL.red);
        break;
      case 'tilt':
        this.giFlash([[0, 0.15], [3, 0.15]]);
        break;
      case 'rampMade':
        this.play('lineUp', 0.6, PAL.cyan, { x: this.R[0] });
        break;
      case 'combo':
        this.play('radial', 0.6, PAL.cyan, { x: d.x, y: d.y });
        break;
      case 'mystery':
        this.play('sparkle', 1.4, PAL.magenta);
        break;
    }
  }

  update(dt, base, gameState) {
    this.attract = gameState === 'attract' || gameState === 'over';
    for (const s of this.shows) s.t += dt;
    this.shows = this.shows.filter(s => s.t < (s.delay || 0) + s.dur);
    // GI
    let gi = 1;
    for (const f of this.giFx) {
      f.t += dt;
      const q = f.seq;
      let v = q[q.length - 1][1];
      for (let i = 0; i < q.length - 1; i++) {
        if (f.t >= q[i][0] && f.t < q[i + 1][0]) {
          const k = (f.t - q[i][0]) / (q[i + 1][0] - q[i][0]);
          v = q[i][1] + (q[i + 1][1] - q[i][1]) * k; break;
        }
      }
      gi = f.t < q[q.length - 1][0] ? v : gi;
    }
    this.giFx = this.giFx.filter(f => f.t < f.seq[f.seq.length - 1][0]);
    const giTarget = base.__tilted ? 0.25 : 1;
    this.gi = this.giFx.length ? gi : this.gi + (giTarget - this.gi) * Math.min(1, dt * 4);

    if (this.attract) { this.attractT += dt; }
    const t = performance.now() / 1000;
    for (const l of this.T.lamps) {
      const o = this.out[l.id];
      const b = base[l.id];
      let i = 0, c = (b && b.c) || l.color;
      if (b && !this.attract) {
        if (b.v === 1) i = 1;
        else if (b.v === 2) i = 0.55 + 0.45 * Math.sin(t * 6.5);
        else if (b.v === 3) i = Math.sin(t * 18) > 0 ? 1 : 0.12;
        if (b.v > 1) i = Math.max(0, i);
      }
      if (l.group === 'gi') { i = (b ? (b.v ? 1 : 0) : 1) * Math.min(1.3, this.gi); c = l.color; }
      if (this.attract && l.group !== 'gi') {
        const a = this.attractShow(l, this.attractT);
        i = a.i; c = a.c;
      }
      for (const s of this.shows) {
        const st = s.t - (s.delay || 0);
        if (st < 0) continue;
        const r = this.showValue(s, st, l, t);
        if (r && r.i > i) { i = r.i; c = r.c || c; }
      }
      o.i = Math.max(0, Math.min(1.2, i));
      if (o.c !== c) { o.c = c; o.rgb = hex(c); }
    }
  }

  showValue(s, st, l, t) {
    const p = st / s.dur;
    const fade = 1 - Math.max(0, (p - 0.75) / 0.25);
    switch (s.type) {
      case 'sweepUp': case 'sweepDown': {
        const pos = s.type === 'sweepUp' ? 1050 - p * 1150 : -50 + p * 1150;
        const d = Math.abs(l.y - pos);
        return { i: Math.max(0, 1 - d / 120), c: s.color };
      }
      case 'lineUp': {
        if (Math.abs(l.x - s.x) > 30) return null;
        const pos = 620 - p * 340;
        return { i: Math.max(0, 1 - Math.abs(l.y - pos) / 50), c: s.color };
      }
      case 'radial': {
        const d = Math.hypot(l.x - s.x, l.y - s.y), ring = p * 900;
        return { i: Math.max(0, 1 - Math.abs(d - ring) / 110) * fade, c: s.color };
      }
      case 'strobe':
        return { i: Math.sin(st * 40) > 0 ? fade : 0, c: s.color };
      case 'chase': {
        const a = Math.atan2(l.y - this.C[1], l.x - this.C[0]);
        const v = Math.sin(a * 3 - st * 9);
        return { i: v > 0.6 ? fade : 0, c: s.color };
      }
      case 'rainbow': {
        const k = Math.floor(((l.y + l.x * 0.3) / 140 + st * 6)) % RAINBOW.length;
        return { i: 0.95 * fade, c: RAINBOW[(k + RAINBOW.length) % RAINBOW.length] };
      }
      case 'sparkle': {
        const h = Math.sin(l.x * 12.9898 + l.y * 78.233 + Math.floor(st * 14) * 3.1) * 43758.5;
        return { i: (h - Math.floor(h)) > 0.7 ? fade : 0, c: s.color };
      }
    }
    return null;
  }

  /** attract način — valovi svetlobe kot pri pravem avtomatu */
  attractShow(l, T) {
    const cycle = 24, phase = T % cycle, seg = Math.floor(phase / 6);
    const st = phase % 6;
    if (seg === 0) {           // val navzgor v barvah palete
      const pos = 1100 - ((st * 420) % 1300);
      const d = Math.abs(l.y - pos);
      const cols = [PAL.melt, PAL.cyan, PAL.code, PAL.gold];
      return { i: Math.max(0.05, 1 - d / 160), c: cols[Math.floor(st / 1.5) % 4] };
    }
    if (seg === 1) {           // vrtenje okoli sredine
      const a = Math.atan2(l.y - this.C[1], l.x - this.C[0]);
      const v = Math.sin(a * 2 + st * 4);
      return { i: Math.max(0.05, v), c: v > 0.5 ? PAL.gold : PAL.melt };
    }
    if (seg === 2) {           // mavrica
      const k = Math.floor((l.y / 120 + st * 3)) % RAINBOW.length;
      return { i: 0.85, c: RAINBOW[(k + RAINBOW.length) % RAINBOW.length] };
    }
    // utripajoče skupine
    const on = Math.floor(st * 3 + (l.x + l.y) / 200) % 2 === 0;
    return { i: on ? 0.95 : 0.1, c: l.color };
  }
}
