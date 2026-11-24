/* =====================================================================
   SMUČARSKI SKOKI — scoring.js: točkovanje po pravilih (brez DOM-a).
   Daljava: base na K-točki ± (daljava − K) × vrednost metra (≥ 0).
   Slog: 5 sodnikov, najvišja in najnižja ocena se ne štejeta (največ 60).
   Kompenzacija vetra: čelni (+) odšteje head × m/s, hrbtni (−) prišteje tail × m/s.
   Kompenzacija zaletnega mesta: nižje od referenčnega = plus (gateFactor na mesto).
   Vse vrednosti računamo v desetinkah (cela števila), da ni napak zaokroževanja.
   ===================================================================== */

const T = v => Math.round(v * 10);          // → desetinke
const F = t => t / 10;                      // ← desetinke

/** Točke za daljavo. */
export function distancePoints(def, dist) {
  return F(Math.max(0, T(def.base) + Math.round((dist - def.k) * def.meterValue * 10)));
}

/** Kompenzacija vetra (povprečje v m/s, + = čelni). */
export function windPoints(def, wind) {
  const w = Math.round(wind * 100) / 100;
  if (w > 0) return F(-Math.round(w * def.windFactors.head * 10));
  if (w < 0) return F(Math.round(-w * def.windFactors.tail * 10));
  return 0;
}

/** Kompenzacija zaletnega mesta (referenčno = privzeto mesto skakalnice). */
export function gatePoints(def, gate, refGate = def.gates.default) {
  return F(Math.round((refGate - gate) * def.gateFactor * 10));
}

/**
 * Ocene sodnikov → štete ocene in vsota.
 * @param {number[]} scores pet ocen
 * @returns {{dropped:number[], used:number[], sum:number}} dropped: indeksa najvišje in najnižje
 */
export function styleFromJudges(scores) {
  const idx = scores.map((s, i) => [s, i]);
  let hi = 0, lo = 0;
  for (let i = 1; i < idx.length; i++) {
    if (idx[i][0] > idx[hi][0]) hi = i;
    if (idx[i][0] < idx[lo][0]) lo = i;
  }
  if (hi === lo) lo = hi === 0 ? 1 : 0;   // vse enake: odstrani dve različni
  const used = scores.filter((_, i) => i !== hi && i !== lo);
  return { dropped: [hi, lo], used, sum: F(used.reduce((a, s) => a + T(s), 0)) };
}

/**
 * Celoten izračun skoka.
 * @param {Object} def JSON skakalnice
 * @param {{dist:number, judges:number[], wind:number, gate:number, refGate?:number}} j
 */
export function scoreJump(def, { dist, judges, wind, gate, refGate }) {
  const d = distancePoints(def, dist);
  const st = styleFromJudges(judges);
  const w = windPoints(def, wind);
  const g = gatePoints(def, gate, refGate ?? def.gates.default);
  const total = F(Math.max(0, T(d) + T(st.sum) + T(w) + T(g)));
  return { dist, distPts: d, judges, dropped: st.dropped, style: st.sum, wind: Math.round(wind * 100) / 100, windPts: w, gate, gatePts: g, total };
}

/** Najvišje mogoče točke na skakalnici (za zavrnitev nemogočih rezultatov): daljava HS + 25 m, 60 slog, 30 kompenzacije. */
export function maxPoints(def) {
  return Math.ceil(distancePoints(def, def.hs + 25) + 60 + 30);
}

/* ------------------------------------------------------------ zapis za lestvico */
// Lestvica huba hrani celo število: točke (desetinke) × 1000 + daljava × 2.
// Razvrščanje je po točkah, enake točke loči daljava; format() prikaže oboje.

export const encodeBoard = (total, dist) => Math.round(total * 10) * 1000 + Math.min(999, Math.round(dist * 2));
export const decodeBoard = n => ({ total: Math.floor(n / 1000) / 10, dist: (n % 1000) / 2 });

const fmt1 = v => v.toLocaleString('sl-SI', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtDist = d => fmt1(d) + ' m';
export const fmtPts = p => fmt1(p);
export const fmtBoard = n => { const b = decodeBoard(n); return `${fmtDist(b.dist)} · ${fmt1(b.total)} t`; };
