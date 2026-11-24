/* =====================================================================
   SMUČARSKI SKOKI — judges.js: ocene petih sodnikov iz merljivega v simulaciji.
   Odbitki: mirnost leta (nihanje nagiba), »mahanje« ob nestabilnosti, odriv,
   vrsta in kakovost pristanka, trd pristanek, padec ali dotik.
   Vsak sodnik ima majhen deterministični šum in svojo občutljivost (iz seeda skoka).
   ===================================================================== */
import { hash32 } from './dmath.js';

const half = v => Math.round(v * 2) / 2;

/**
 * Skupni odbitki (brez šuma) in razčlenitev za prikaz.
 * @param {Object} s končno stanje simulacije (J.s)
 * @param {Object} P parametri fizike
 */
export function deductions(s, P) {
  const J = P.judges, L = P.landing;
  const land = s.landing || { type: 'fall', hEq: 0, teleQ: 0 };
  const flight = Math.min(3, Math.max(0, s.wobble - J.wobbleFree) / J.wobblePerPoint) + Math.min(2, s.flail / J.flailPerPoint);
  const takeoff = s.takeoff && !s.takeoff.good ? J.takeoffDeduct * (1 - s.takeoff.q) * 1.5 : 0;
  let landing = 0, hard = 0;
  const lim = land.type === 'tele' ? L.hTele : land.type === 'two' ? L.hTwo : L.hNone;
  switch (land.type) {
    case 'tele': landing = J.teleDeduct + (1 - land.teleQ) * 2; break;
    case 'two': landing = J.twoDeduct; break;
    case 'none': landing = J.twoDeduct + 2.5; break;
    case 'touch': landing = J.touchDeduct; break;
    default: landing = J.fallDeduct;
  }
  if (land.type !== 'fall' && land.type !== 'touch') hard = Math.max(0, land.hEq / lim - 0.75) * 4 * J.hardLanding;
  return { flight, takeoff, landing, hard, total: flight + takeoff + landing + hard };
}

/**
 * Pet ocen (0–20, korak 0,5).
 * @param {Object} s končno stanje
 * @param {Object} P parametri
 * @param {number} seed seed skoka (npr. seed vetra)
 */
export function judgeScores(s, P, seed = 0) {
  const d = deductions(s, P);
  const key = (seed >>> 0) ^ Math.round((s.dist || 0) * 2) * 7919 ^ (s.tick | 0);
  const out = [];
  for (let j = 0; j < 5; j++) {
    const h1 = hash32(key, j, 1) / 4294967296, h2 = hash32(key, j, 2) / 4294967296;
    const sens = 0.85 + 0.3 * h1;                       // občutljivost sodnika za let in pristanek
    const noise = (h2 - 0.5) * 2 * P.judges.noise;      // ±noise
    const v = 20 - (d.flight + d.hard) * sens - d.takeoff - d.landing * (0.92 + 0.16 * h2) + noise;
    out.push(Math.min(20, Math.max(0, half(v))));
  }
  return out;
}
