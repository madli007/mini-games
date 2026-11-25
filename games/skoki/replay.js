/* =====================================================================
   SMUČARSKI SKOKI — replay.js: posnetki stanja za izris, zgodovina skoka,
   počasni posnetek in replay z rezi kamere (spredaj ob mizi, od spodaj, od strani).
   Brez DOM-a in brez Three.js (izris naredi render/).
   ===================================================================== */
import { STEP } from './physics.js';
import { DEG } from './dmath.js';

/** Napadni kot najboljšega jadranja (°), enak kot pri botu (bot.js → BOT_ALPHA). */
export const GLIDE_ALPHA = 29;

/** Posnetek stanja simulacije za izris (en tick). */
export function snapshot(s, P) {
  const phase = s.phase === 'out' || s.phase === 'done' ? 'out' : s.phase;
  return {
    tick: s.tick, t: s.tick * STEP, phase,
    x: s.x, y: s.y, pitch: s.pitch,
    crouch: s.crouch,
    air: s.phase === 'air' ? (s.takeoff ? (s.tick - s.takeoff.tick) * STEP : -1) : -1,
    alpha: s.alpha / DEG,
    prep: !!s.prep,
    landType: s.landing ? s.landing.type : null,
    landT: s.landing ? (s.tick - s.landing.tick) * STEP : 0,
    fallen: s.fallen,
    flail: s.phase === 'air' && Math.abs(s.torque) > P.body.maxTorque * 0.8,
    speed: s.speed, hag: s.hag, target: s.target, btn: s.btn,
    cheer: !!(s.landing && s.landing.type !== 'fall' && s.landing.type !== 'touch'),
    // »jadranje«: kako blizu optimalnega napadnega kota je let (0–1) — za občutek vzgona (zvok, tokovnice, plapolanje dresa)
    glide: s.phase === 'air' && s.takeoff && !s.prep && !s.fallen ? Math.max(0, 1 - Math.abs(s.alpha / DEG - GLIDE_ALPHA) / 9) : 0,
    windH: s.phase === 'air' ? s.wind?.h || 0 : 0,
  };
}

/** Posnetek na zaletnem mestu (pred štartom). */
export function gateSnapshot(hill, gate) {
  const p = hill.inrunAt(hill.gateD(gate));
  return { tick: 0, t: 0, phase: 'gate', x: p.x, y: p.y, pitch: -p.theta, crouch: 0, air: -1, alpha: 0, prep: false, landType: null, landT: 0, fallen: null, flail: false, speed: 0, hag: 0, cheer: false };
}

/** Linearna interpolacija dveh posnetkov (za gladek izris med tickoma). */
export function lerpSnap(a, b, u) {
  if (!a) return b;
  if (!b || u <= 0) return a;
  return { ...b, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, pitch: a.pitch + (b.pitch - a.pitch) * u };
}

/**
 * Rezi kamere za replay iz zgodovine.
 * @param {Object[]} hist posnetki po tickih
 * @returns {{from:number, to:number, cam:string, speed:number}[]}
 */
export function replayCuts(hist) {
  const n = hist.length;
  const takeoff = hist.findIndex(h => h.air >= 0);
  const land = hist.findIndex(h => h.phase === 'out');
  const T = Math.round(1 / STEP);
  const cuts = [];
  if (takeoff > 0) {
    cuts.push({ from: Math.max(0, takeoff - 2 * T), to: takeoff + Math.round(0.35 * T), cam: 'front', speed: 0.5 });
    if (land > 0) {
      cuts.push({ from: takeoff + Math.round(0.35 * T), to: Math.max(takeoff + T, land - Math.round(1.2 * T)), cam: 'live', speed: 1 });
      cuts.push({ from: Math.max(takeoff + T, land - Math.round(1.2 * T)), to: Math.min(n - 1, land + Math.round(1.2 * T)), cam: 'below', speed: 0.6 });
      cuts.push({ from: Math.min(n - 1, land + Math.round(1.2 * T)), to: n - 1, cam: 'live', speed: 1 });
    } else cuts.push({ from: takeoff + Math.round(0.35 * T), to: n - 1, cam: 'live', speed: 1 });
  } else cuts.push({ from: 0, to: n - 1, cam: 'live', speed: 1 });
  return cuts.filter(c => c.to > c.from);
}

/** Kamera in hitrost za položaj v replayu. */
export function cutAt(cuts, i) {
  for (const c of cuts) if (i >= c.from && i <= c.to) return c;
  return cuts[cuts.length - 1] || { cam: 'live', speed: 1 };
}
