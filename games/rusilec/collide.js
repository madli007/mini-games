/* =====================================================================
   RUŠILEC — collide.js: trki krogla–krogla, masa in sunek.
   Čista logika (brez DOM-a). Telesa so iz ../krogla/physics.js (makeBody):
   { x, y, z, vx, vy, vz, r, ... } + naša polja (mass, dashT, dashCd).
   ===================================================================== */

/** Konstante trkov in sunka. */
export const C = {
  REST: 0.92,         // odbojnost krogla–krogla (skoraj elastično)
  PUNCH: 1.15,        // dodatni »bonk«: impulz × (1 + PUNCH·hitrost/MAXV) — hitrejša krogla odbije močneje
  DASH_SPEED: 11.5,   // hitrost v smeri sunka
  DASH_T: 0.38,       // trajanje sunka (s) — v tem času je krogla težja
  DASH_MASS: 2.6,     // masa med sunkom
  DASH_CD: 3,         // ohlajanje sunka (s)
  WEIGHT_MASS: 2.2,   // pobiralka Utež
  BUMPER_KICK: 9,     // pobiralka Odbijač: hitrost, s katero odleti, kdor se te dotakne
  MAXV: 13,
};

/** Trenutna masa telesa (osnovna 1, sunek, utež). */
export function massOf(b) {
  let m = b.baseMass || 1;
  if (b.dashT > 0) m *= C.DASH_MASS;
  if (b.weightT > 0) m *= C.WEIGHT_MASS;
  return m;
}

/**
 * Trk dveh krogel (3D kroglici). Popravi položaja (glede na maso) in hitrosti (impulz).
 * Vrne { j, nx, nz, v } ob trku (j = velikost impulza, v = relativna hitrost ob trku) ali null.
 */
export function collidePair(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const rr = a.r + b.r;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= rr * rr) return null;
  let d = Math.sqrt(d2), nx, ny, nz;
  if (d < 1e-6) { nx = 1; ny = 0; nz = 0; d = 0; } else { nx = dx / d; ny = dy / d; nz = dz / d; }
  const ma = massOf(a), mb = massOf(b);
  const ia = 1 / ma, ib = 1 / mb;
  const pen = rr - d;
  // razmakni (težja se premakne manj)
  a.x -= nx * pen * ia / (ia + ib); a.y -= ny * pen * ia / (ia + ib) * 0.2; a.z -= nz * pen * ia / (ia + ib);
  b.x += nx * pen * ib / (ia + ib); b.y += ny * pen * ib / (ia + ib) * 0.2; b.z += nz * pen * ib / (ia + ib);
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
  if (rv >= 0) return { j: 0, nx, nz, v: 0 };
  const approach = -rv;
  const punch = 1 + C.PUNCH * Math.min(1, approach / C.MAXV);
  const j = (1 + C.REST) * approach / (ia + ib) * punch;
  a.vx -= j * ia * nx; a.vy -= j * ia * ny * 0.3; a.vz -= j * ia * nz;
  b.vx += j * ib * nx; b.vy += j * ib * ny * 0.3; b.vz += j * ib * nz;
  return { j, nx, nz, v: approach };
}

/**
 * Odbijač (pobiralka): kdor se dotakne nosilca, odleti stran od njega.
 * @param {Object} holder nosilec odbijača
 * @param {Object} other drugo telo
 * @param {number} nx normala od holder proti other
 * @param {number} nz
 */
export function bumperKick(holder, other, nx, nz) {
  const vn = other.vx * nx + other.vz * nz;
  const add = Math.max(0, C.BUMPER_KICK - vn);
  other.vx += nx * add; other.vz += nz * add;
  other.vy = Math.max(other.vy, 2.5);
}

/**
 * Trki med vsemi telesi (vsak par enkrat). Telesa z `ghost` (neranljiva, mrtva) ne trkajo.
 * @param {Object[]} bodies
 * @param {(a:Object, b:Object, hit:{j:number, nx:number, nz:number, v:number}) => void} [onHit]
 */
export function collideAll(bodies, onHit) {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (a.ghost) continue;
    for (let k = i + 1; k < bodies.length; k++) {
      const b = bodies[k];
      if (b.ghost) continue;
      const hit = collidePair(a, b);
      if (hit && onHit) onHit(a, b, hit);
    }
  }
}

/**
 * Sunek: kratek pospešek v smeri (dx, dz). Vrne true, če je bil izveden (ni na ohlajanju).
 * @param {Object} b telo
 * @param {number} dx smer (ni nujno enotska; brez smeri = smer gibanja)
 * @param {number} dz
 */
export function dash(b, dx, dz) {
  if (b.dashCd > 0) return false;
  let m = Math.hypot(dx, dz);
  if (m < 0.15) { dx = b.vx; dz = b.vz; m = Math.hypot(dx, dz); }
  if (m < 0.05) { dx = Math.sin(b.yaw || 0); dz = Math.cos(b.yaw || 0); m = 1; }
  dx /= m; dz /= m;
  const along = b.vx * dx + b.vz * dz;
  const add = Math.max(0, C.DASH_SPEED - Math.max(0, along));
  // bočno hitrost delno ohrani, v smeri sunka doseže DASH_SPEED
  b.vx = b.vx * 0.5 + dx * (Math.max(0, along) * 0.5 + add);
  b.vz = b.vz * 0.5 + dz * (Math.max(0, along) * 0.5 + add);
  b.dashT = C.DASH_T;
  b.dashCd = C.DASH_CD;
  return true;
}

/** Odštej časovnike sunka (vsak korak). */
export function tickDash(b, dt) {
  if (b.dashT > 0) b.dashT = Math.max(0, b.dashT - dt);
  if (b.dashCd > 0) b.dashCd = Math.max(0, b.dashCd - dt);
}
