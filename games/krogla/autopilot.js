/* =====================================================================
   HRČKOVA KROGLA — autopilot.js: preprost »voznik« po točkah poti (route).
   Uporaba: test rešljivosti prog in privzeti »razvijalčev ghost«.
   Točka poti: { x, z, speed?, r?, stop?, wait?, until?: [perioda, od, do] }
     wait  — počakaj toliko sekund na točki
     until — počakaj, da je (čas proge mod perioda) v [od, do] (sinhronizacija s premičnimi deli)
   ===================================================================== */
import { createWorld, step, STEP } from './physics.js';
import { Recorder } from './ghost.js';

/** Ustvari krmilnik za svet. Vrne funkcijo, ki vrne vhod [ix, iz] za naslednji korak. */
export function pilot(w, route) {
  let k = 0, waitUntil = null, cpK = new Map();
  const api = function drive() {
    for (const e of w.events) {
      if (e.type === 'checkpoint') cpK.set(e.k, k);
      if (e.type === 'respawn') { k = w.checkpoint >= 0 ? (cpK.get(w.checkpoint) ?? 0) : 0; waitUntil = null; }
    }
    api.k = k;
    return next();
  };
  return api;
  function next() {
    const b = w.ball;
    if (w.dead || w.finished) return [0, 0];
    if (!b.grounded && b.vy > -1) return [0, 0];   // v zraku ne zaviraj
    if (k >= route.length) k = route.length - 1;
    const p = route[k];
    const mv = p.mover != null ? w.movers[p.mover] : null;
    const tx = mv ? mv.pos[0] + p.x : p.x, tz = mv ? mv.pos[2] + p.z : p.z;
    const dx = tx - b.x, dz = tz - b.z;
    const d = Math.hypot(dx, dz);
    const holds = p.wait != null || p.until != null || p.stop;
    let reached = d < (p.r ?? 0.5);
    if (reached && holds) {
      if (p.wait != null) {
        if (waitUntil == null) waitUntil = w.t + p.wait;
        reached = w.t >= waitUntil;
      }
      if (reached && p.until) {
        const [per, a, bb] = p.until;
        const u = ((w.t % per) + per) % per;
        reached = a <= bb ? (u >= a && u <= bb) : (u >= a || u <= bb);
      }
    }
    if (reached && k < route.length - 1) { k++; waitUntil = null; return next(); }
    const sp = (p.speed ?? 5) * (w.mods.ice && p.speed < 8 ? 0.65 : 1);   // na spolzkih tleh počasneje
    let vx, vz;
    if (holds && d < 1.2) { vx = dx * 3; vz = dz * 3; }
    else if (d > 1e-6) { const s = holds ? Math.min(sp, d * 2.2 + 0.5) : sp; vx = dx / d * s; vz = dz / d * s; }
    else { vx = vz = 0; }
    let ix = (vx - b.vx) * 0.55, iz = (vz - b.vz) * 0.55;
    const m = Math.hypot(ix, iz);
    if (m > 1) { ix /= m; iz /= m; }
    return [ix, iz];
  }
}

/**
 * Prevozi progo z autopilotom.
 * @param {Object} L proga (z route)
 * @param {{mods?:Object, maxT?:number}} [opt]
 * @returns {{finished:boolean, time:number, falls:number, stars:number, frames:number[][], inputs:number[][]}}
 */
export function runAutopilot(L, { mods = {}, maxT = 240, trace = false } = {}) {
  const w = createWorld(L, mods);
  const route = L.route || [{ x: L.goal[0], z: L.goal[1] }];
  const drive = pilot(w, route);
  const rec = new Recorder();
  const inputs = [], falls = [], hist = [];
  rec.sample(0, w.ball);
  while (!w.finished && w.t < maxT) {
    const [ix, iz] = drive();
    w.events.length = 0;
    inputs.push([ix, iz]);
    const wasDead = w.dead;
    const px = w.ball.x, pz = w.ball.z;
    step(w, ix, iz);
    if (trace) { hist.push([w.t.toFixed(2), w.ball.x.toFixed(2), w.ball.y.toFixed(2), w.ball.z.toFixed(2), w.ball.vz.toFixed(1), w.ball.grounded?'g':'a', drive.k]); if (hist.length > 160) hist.shift(); }
    if (trace && w.dead && !wasDead) { falls.push({ t: w.t, x: px, z: pz, k: drive.k, hist: falls.length ? null : hist.filter((_, i) => i % 8 === 0).map(h => h.join(' ')) }); }
    rec.sample(w.t, w.ball);
  }
  return { finished: w.finished, time: w.finished ? w.finishT : null, falls: w.falls, stars: w.stars, frames: rec.frames, inputs, world: w, trace: falls };
}

/** Predvajaj posnet vhod (po korakih) in vrni svet. */
export function replayInputs(L, inputs, mods = {}) {
  const w = createWorld(L, mods);
  for (const [ix, iz] of inputs) { w.events.length = 0; step(w, ix, iz); if (w.finished) break; }
  return w;
}

export { STEP };
