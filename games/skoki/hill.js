/* =====================================================================
   SMUČARSKI SKOKI — hill.js: gradnja profila skakalnice iz parametrov
   (JSON v hills/<id>.json) in validator. Brez DOM-a.

   Koordinate: x vodoravno (navzdol po skakalnici +), y navpično (gor +),
   rob mize je v (0, 0). Koti v JSON-u so v stopinjah navzdol od vodoravnice.

   Zalet (od roba nazaj): miza (dolžina t, naklon alpha) → prehod (radij r1,
   alpha → gamma) → ravni del (naklon gamma) z zaletnimi mesti.
   Doskočišče (od točke pod robom, višina s pod mizo): grbina (naklon od b0 do beta,
   do loka pArc) → ravni del (beta) do lArc → prehod (radij r2) v iztečišče
   (naklon outrunAngle, dolžina outrunLength) → protiklanec.
   Neobvezno betaL (prave skakalnice): med pArc (P) in lArc (L) se naklon enakomerno
   zmanjša od beta (βP) do betaL (βL) — krožni lok rL iz certifikata; brez betaL je del raven.
   Daljava = dolžina loka po profilu doskočišča od točke pod robom.
   ===================================================================== */
import { DEG, sin, cos, tan, clamp } from './dmath.js';

const DS = 0.25;   // korak vzorčenja profila (m)

/** Vrednost metra po pravilih (po K-točki). */
export function meterValueFor(k) {
  const T = [[20, 4.8], [25, 4.4], [30, 4.0], [35, 3.6], [40, 3.2], [50, 2.8], [60, 2.4], [70, 2.2], [80, 2.0], [100, 1.8], [170, 1.2]];
  let v = 4.8;
  for (const [lim, mv] of T) if (k >= lim) v = mv;
  return v;
}

/** Točke na K-točki: 60, na letalnicah (K ≥ 170) 120. */
export const baseFor = k => k >= 170 ? 120 : 60;

/** Faktorja vetra (točke na m/s): čelni po K-točki in vrednosti metra, hrbtni ×1,21. */
export function windFactorsFor(k) {
  const head = Math.round((k - 36) * meterValueFor(k) / 14.75 * 100) / 100;
  return { head, tail: Math.round(head * 1.21 * 100) / 100 };
}

/* ------------------------------------------------------------ gradnja */

/**
 * Zgradi skakalnico (profil, zaletna mesta, iskanje točk).
 * @param {Object} def JSON skakalnice
 */
export function buildHill(def) {
  const I = def.inrun, Ld = def.landing;
  const alpha = I.alpha * DEG, gamma = I.gamma * DEG, beta = Ld.beta * DEG, b0 = Ld.b0 * DEG, oa = Ld.outrunAngle * DEG;
  const betaL = (Ld.betaL ?? Ld.beta) * DEG;   // naklon v L (lok P → L); brez betaL = beta (raven del)

  /* ---------- zalet: vzorci po razdalji d od roba nazaj (0 = rob) */
  const gates = def.gates;
  const transLen = I.r1 * (gamma - alpha);
  const straightLen = I.e2 + (gates.count - 1) * gates.spacing + 4;   // 4 m nad najvišjim zaletnim mestom (greda)
  const inrunLen = I.t + transLen + straightLen;
  const inrun = [];   // [d, x, y, theta, kappa]
  let x = 0, y = 0;
  for (let i = 0; ; i++) {
    const d = Math.min(i * DS, inrunLen);
    let th, ka;
    if (d <= I.t) { th = alpha; ka = 0; }
    else if (d <= I.t + transLen) { th = alpha + (d - I.t) / I.r1; ka = 1 / I.r1; }
    else { th = gamma; ka = 0; }
    if (i > 0) {
      const prev = inrun[i - 1];
      const step = d - prev[0];
      const tm = (prev[3] + th) / 2;
      x -= cos(tm) * step; y += sin(tm) * step;
    }
    inrun.push([d, x, y, th, ka]);
    if (d >= inrunLen) break;
  }
  const gateD = g => I.t + transLen + I.e2 + (clamp(g, 1, gates.count) - 1) * gates.spacing;

  /* ---------- doskočišče: vzorci po loku s */
  const r2Len = Ld.r2 * (betaL - oa);
  const endS = Ld.lArc + r2Len + Ld.outrunLength;
  const land = [];   // [s, x, y, theta]
  const angleAt = s => {
    if (s <= Ld.pArc) { const u = s / Ld.pArc; return b0 + (beta - b0) * (1 - (1 - u) * (1 - u) * (1 - u * 0.35)); }
    if (s <= Ld.lArc) return betaL === beta ? beta : beta + (betaL - beta) * (s - Ld.pArc) / (Ld.lArc - Ld.pArc);
    if (s <= Ld.lArc + r2Len) return betaL - (s - Ld.lArc) / Ld.r2;
    return oa;
  };
  x = 0; y = -Ld.s;
  for (let i = 0; ; i++) {
    const s = Math.min(i * DS, endS);
    const th = angleAt(s);
    if (i > 0) {
      const prev = land[i - 1];
      const step = s - prev[0];
      const tm = (prev[3] + th) / 2;
      x += cos(tm) * step; y -= sin(tm) * step;
    }
    land.push([s, x, y, th]);
    if (s >= endS) break;
  }
  // protiklanec na koncu iztečišča (za izris in ustavljanje)
  for (let k = 1; k <= 60; k++) {
    const s = endS + k * 0.5;
    const th = -clamp(k * 0.5 / 25, 0, 1) * 12 * DEG;
    const p = land[land.length - 1];
    land.push([s, p[1] + cos(th) * 0.5, p[2] - sin(th) * 0.5, th]);
  }

  const xs = land.map(p => p[1]);
  const findLand = xq => {
    let lo = 0, hi = land.length - 1;
    if (xq <= xs[0]) return 0;
    if (xq >= xs[hi]) return hi - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= xq) lo = m; else hi = m; }
    return lo;
  };

  const hill = {
    def, id: def.id, name: def.name, k: def.k, hs: def.hs,
    inrun, land, inrunLen, transLen, tableLen: I.t, alpha, gamma, height: Ld.s, endS,
    gateD,
    /** Točka na zaletu na razdalji d od roba: { x, y, theta, kappa }. */
    inrunAt(d) {
      d = clamp(d, 0, inrunLen);
      const i = Math.min(inrun.length - 2, Math.floor(d / DS));
      const a = inrun[i], b = inrun[i + 1], u = (d - a[0]) / (b[0] - a[0] || 1);
      return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u, theta: a[3] + (b[3] - a[3]) * u, kappa: a[4] };
    },
    /** Tla pod x: { y, theta (navzdol +), s (lok doskočišča ali -1 na mizi) }. */
    groundAt(xq) {
      if (xq < 0) {
        // miza in zalet: poišči po x (zalet ima x padajoč z d)
        if (xq >= -cos(alpha) * I.t) return { y: -xq * tan(alpha), theta: alpha, s: -1 };
        let lo = 0, hi = inrun.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (inrun[m][1] >= xq) lo = m; else hi = m; }
        const a = inrun[lo], b = inrun[hi], u = (xq - a[1]) / (b[1] - a[1] || 1);
        return { y: a[2] + (b[2] - a[2]) * u, theta: a[3], s: -1 };
      }
      const i = findLand(xq);
      const a = land[i], b = land[i + 1], u = (xq - a[1]) / (b[1] - a[1] || 1);
      return { y: a[2] + (b[2] - a[2]) * u, theta: a[3] + (b[3] - a[3]) * u, s: a[0] + (b[0] - a[0]) * u };
    },
    /** Točka doskočišča na loku s: { x, y, theta }. */
    landAt(s) {
      s = clamp(s, 0, land[land.length - 1][0]);
      let lo = 0, hi = land.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (land[m][0] <= s) lo = m; else hi = m; }
      const a = land[lo], b = land[hi], u = (s - a[0]) / (b[0] - a[0] || 1);
      return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u, theta: a[3] + (b[3] - a[3]) * u };
    },
  };
  hill.kPoint = hill.landAt(def.k);
  hill.hsPoint = hill.landAt(def.hs);
  hill.top = hill.inrunAt(inrunLen);
  return hill;
}

/* ------------------------------------------------------------ validator */

const NUM = (o, k) => typeof o?.[k] === 'number' && isFinite(o[k]);
/** unlock: { hill } | { hills: [...] } (katera koli) | { size, group? } (katera koli skakalnica velikosti, po želji le iz skupine), over: k|hs */
const validUnlock = u => !!u && typeof u === 'object' && ['k', 'hs'].includes(u.over) && (
  typeof u.hill === 'string' ||
  (Array.isArray(u.hills) && u.hills.length > 0 && u.hills.every(h => typeof h === 'string')) ||
  (typeof u.size === 'string' && (u.group == null || typeof u.group === 'string')));

/**
 * Preveri skakalnico. Vrne seznam napak (prazen = veljavna).
 * @param {Object} def
 * @returns {string[]}
 */
export function validateHill(def) {
  const e = [];
  if (!def || typeof def !== 'object') return ['Skakalnica ni objekt.'];
  if (typeof def.id !== 'string' || !/^[a-z0-9-]{2,30}$/.test(def.id)) e.push('id: male črke, številke in »-« (2–30 znakov).');
  if (typeof def.name !== 'string' || def.name.length < 2) e.push('name: manjka ime.');
  for (const k of ['k', 'hs', 'meterValue', 'base', 'gateFactor']) if (!NUM(def, k)) e.push(`${k}: manjka število.`);
  if (!NUM(def.windFactors, 'head') || !NUM(def.windFactors, 'tail')) e.push('windFactors: potrebna sta head in tail.');
  if (!NUM(def.gates, 'count') || !NUM(def.gates, 'default') || !NUM(def.gates, 'spacing')) e.push('gates: potrebni count, default, spacing.');
  for (const k of ['gamma', 'alpha', 'r1', 't', 'e2']) if (!NUM(def.inrun, k)) e.push(`inrun.${k}: manjka število.`);
  for (const k of ['s', 'b0', 'beta', 'pArc', 'lArc', 'r2', 'outrunAngle', 'outrunLength']) if (!NUM(def.landing, k)) e.push(`landing.${k}: manjka število.`);
  if (!def.theme || typeof def.theme !== 'object') e.push('theme: manjka tema.');
  if (e.length) return e;

  if (!(def.k > 10 && def.k < def.hs)) e.push(`K (${def.k}) mora biti manjši od HS (${def.hs}).`);
  if (def.hs > def.k * 1.25) e.push('HS je predaleč od K (največ +25 %).');
  if (def.meterValue !== meterValueFor(def.k)) e.push(`meterValue za K${def.k} mora biti ${meterValueFor(def.k)}.`);
  if (def.base !== baseFor(def.k)) e.push(`base za K${def.k} mora biti ${baseFor(def.k)}.`);
  if (def.windFactors.tail <= def.windFactors.head) e.push('windFactors: hrbtni faktor mora biti večji od čelnega.');
  if (!(def.gateFactor > 0)) e.push('gateFactor mora biti pozitiven.');
  const G = def.gates;
  if (!(G.count >= 2 && G.count <= 60 && Number.isInteger(G.count))) e.push('gates.count: 2–60.');
  if (!(G.default >= 1 && G.default <= G.count && Number.isInteger(G.default))) e.push('gates.default mora biti med 1 in count.');
  if (!(G.spacing > 0.2 && G.spacing < 2)) e.push('gates.spacing: 0,2–2 m.');
  const I = def.inrun, L = def.landing;
  if (!(I.gamma > 25 && I.gamma < 40)) e.push('inrun.gamma: 25°–40°.');
  if (!(I.alpha > 7 && I.alpha < 13)) e.push('inrun.alpha (naklon mize): 7°–13°.');
  if (!(I.alpha < I.gamma)) e.push('Miza mora biti položnejša od zaleta.');
  if (!(I.r1 > 30)) e.push('inrun.r1: radij prehoda vsaj 30 m.');
  if (!(I.t >= 3 && I.t <= 9)) e.push('inrun.t (dolžina mize): 3–9 m.');
  if (!(L.s > 0.5 && L.s < 6)) e.push('landing.s: miza mora biti 0,5–6 m nad doskočiščem.');
  if (!(L.b0 >= 0 && L.b0 < L.beta)) e.push('landing.b0 mora biti manjši od beta.');
  if (!(L.beta > 25 && L.beta < 40)) e.push('landing.beta: 25°–40°.');
  if (L.betaL != null && !(NUM(L, 'betaL') && L.betaL > 20 && L.betaL <= L.beta)) e.push('landing.betaL: 20° … beta.');
  if (!(L.pArc > 10 && L.pArc < def.k)) e.push('landing.pArc (konec grbine) mora biti pred K.');
  if (!(L.lArc >= def.hs - 5 && L.lArc <= def.hs + 15)) e.push('landing.lArc (konec strmine) mora biti blizu HS (HS−5 … HS+15).');
  if (!(L.outrunAngle >= -2 && L.outrunAngle < 10)) e.push('landing.outrunAngle: −2°–10°.');
  if (!(L.outrunLength >= 40)) e.push('landing.outrunLength: vsaj 40 m.');
  // neobvezno: skupina v meniju, odklepanje, parametri fizike skakalnice
  if (def.group != null && !(typeof def.group === 'string' && /^[a-z0-9-]{2,20}$/.test(def.group))) e.push('group: male črke, številke, »-« (privzeto »trening«).');
  if (def.unlock != null && !validUnlock(def.unlock)) e.push('unlock: { hill | hills: […] | size (+ group), over: "k"|"hs" }.');
  // prave skakalnice: obvezen kraj in vir (certifikat); rekord skakalnice brez imena skakalca
  if (def.group === 'prave') {
    const R = def.real;
    if (!R || typeof R !== 'object') e.push('real: obvezno pri group "prave".');
    else {
      if (typeof R.venue !== 'string' || R.venue.length < 2) e.push('real.venue: ime kraja.');
      if (typeof R.country !== 'string' || !/^[A-Z]{3}$/.test(R.country)) e.push('real.country: koda države (3 velike črke).');
      if (!(Number.isInteger(R.certYear) && R.certYear >= 1990 && R.certYear <= 2100)) e.push('real.certYear: leto certifikata.');
      if (typeof R.source !== 'string' || !/^https?:\/\//.test(R.source)) e.push('real.source: povezava do certifikata.');
      if (R.record != null) {
        if (!(NUM(R.record, 'dist') && R.record.dist > def.k * 0.8 && R.record.dist < def.hs + 40 && Number.isInteger(R.record.year))) e.push('real.record: { dist, year }.');
        if (Object.keys(R.record).some(k => !['dist', 'year'].includes(k))) e.push('real.record: le dist in year (brez imena skakalca).');
      }
    }
  } else if (def.real != null) e.push('real: le pri group "prave".');
  if (def.physics != null) {
    const F = def.physics, known = ['gravity', 'airDensity', 'liftScale', 'pushScale', 'noAir', 'thermals', 'takeoffWindow'];
    if (typeof F !== 'object') e.push('physics mora biti objekt.');
    else {
      for (const k of Object.keys(F)) if (!known.includes(k)) e.push(`physics.${k}: neznan parameter.`);
      if (F.gravity != null && !(F.gravity >= 0.5 && F.gravity <= 20)) e.push('physics.gravity: 0,5–20 m/s².');
      if (F.airDensity != null && !(F.airDensity >= 0 && F.airDensity <= 2)) e.push('physics.airDensity: 0–2 (faktor).');
      if (F.liftScale != null && !(F.liftScale >= 0.5 && F.liftScale <= 1.5)) e.push('physics.liftScale: 0,5–1,5.');
      if (F.pushScale != null && !(F.pushScale >= 0.5 && F.pushScale <= 4)) e.push('physics.pushScale: 0,5–4.');
      if (F.thermals != null && !(F.thermals >= 0 && F.thermals <= 3)) e.push('physics.thermals: 0–3.');
      if (F.noAir != null && typeof F.noAir !== 'boolean') e.push('physics.noAir: true/false.');
      if (F.takeoffWindow != null && !(F.takeoffWindow >= 0.5 && F.takeoffWindow <= 3)) e.push('physics.takeoffWindow: 0,5–3 (faktor oken odriva).');
    }
  }
  if (e.length) return e;

  const h = buildHill(def);
  for (let i = 1; i < h.land.length; i++) {
    const a = h.land[i - 1], b = h.land[i];
    if (![b[1], b[2], b[3]].every(isFinite)) { e.push('Profil doskočišča ima neveljavne točke.'); break; }
    if (b[1] <= a[1]) { e.push(`Profil doskočišča ni monoton pri s = ${b[0].toFixed(1)} m.`); break; }
    if (Math.hypot(b[1] - a[1], b[2] - a[2]) > 0.6) { e.push(`Luknja v profilu pri s = ${b[0].toFixed(1)} m.`); break; }
  }
  for (let i = 1; i < h.inrun.length; i++) {
    const a = h.inrun[i - 1], b = h.inrun[i];
    if (!(b[1] < a[1] && b[2] > a[2])) { e.push(`Zalet ni monoton pri d = ${b[0].toFixed(1)} m.`); break; }
  }
  if (h.endS < def.hs + 30) e.push('Iztečišče je prekratko.');
  // rob mize je nad doskočiščem povsod
  for (const p of h.land) if (p[1] < 5 && p[2] >= 0) { e.push('Miza ni nad doskočiščem.'); break; }
  return e;
}
