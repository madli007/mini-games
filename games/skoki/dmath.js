/* =====================================================================
   SMUČARSKI SKOKI — dmath.js: deterministična matematika za simulacijo.
   Math.sin/cos/atan2 niso zagotovljeno enaki do zadnjega bita na vseh
   pogonih, zato jih simulacija ne uporablja. Tu so polinomski približki
   iz samih osnovnih operacij (+ − × ÷, Math.sqrt, Math.floor/round), ki so
   po IEEE 754 natančne in povsod enake. Napaka < 1e-9 (sin/cos), < 1e-10 (atan).
   ===================================================================== */

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
export const DEG = PI / 180;

/** sin na [-π/2, π/2] (Taylor do x^15, napaka < 1e-12 na intervalu). */
function sinCore(x) {
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000))))))));
}

/** Zmanjšaj kot na [-π, π]. */
export function wrap(a) {
  if (a >= -PI && a <= PI) return a;
  const k = Math.round(a / TAU);
  a -= k * TAU;
  if (a > PI) a -= TAU; else if (a < -PI) a += TAU;
  return a;
}

export function sin(a) {
  a = wrap(a);
  if (a > HALF_PI) a = PI - a;
  else if (a < -HALF_PI) a = -PI - a;
  return sinCore(a);
}

export function cos(a) { return sin(a + HALF_PI); }

export function tan(a) { return sin(a) / cos(a); }

/** atan za |x| ≤ ~0.27 (vrsta do x^21). */
function atanSmall(x) {
  const x2 = x * x;
  let s = 0, p = x;
  for (let k = 0; k < 11; k++) { s += (k & 1 ? -p : p) / (2 * k + 1); p *= x2; }
  return s;
}

export function atan(x) {
  if (x !== x) return x;
  let sign = 1;
  if (x < 0) { x = -x; sign = -1; }
  let inv = false;
  if (x > 1) { x = 1 / x; inv = true; }
  // dvakratna polovična redukcija: atan(x) = 2·atan(x / (1 + √(1 + x²)))
  const x1 = x / (1 + Math.sqrt(1 + x * x));
  const x2 = x1 / (1 + Math.sqrt(1 + x1 * x1));
  let r = 4 * atanSmall(x2);
  if (inv) r = HALF_PI - r;
  return sign * r;
}

export function atan2(y, x) {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

export const sqrt = Math.sqrt;
export const hypot = (x, y) => Math.sqrt(x * x + y * y);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/**
 * Linearna interpolacija v tabeli točk [[x, y], …] (x naraščajoč); zunaj tabele drži robno vrednost.
 * @param {number[][]} pts
 * @param {number} x
 */
export function table(pts, x) {
  const n = pts.length;
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[n - 1][0]) return pts[n - 1][1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= x) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi];
  return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
}

/* ------------------------------------------------------------ deterministični šum in PRNG */

/** 32-bitni hash celih števil (deterministično, brez plavajoče vejice). */
export function hash32(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Vrednost v [-1, 1] iz celih koordinat. */
export const hashUnit = (a, b = 0, c = 0) => hash32(a, b, c) / 2147483647.5 - 1;

/** Gladek 1D šum v [-1, 1] (vrednostni šum, kubična interpolacija). */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hashUnit(i, seed) * (1 - u) + hashUnit(i + 1, seed) * u;
}

/** mulberry32 — enak kot shared/util.js rng (celoštevilske operacije → deterministično). */
export function prng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Gaussova porazdelitev (Box–Muller brez log/cos: Irwin–Hall z 6 vzorci). */
  r.gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += r(); return (s - 3) * 1.4142135623730951; };
  return r;
}

/** Hash niza → 32-bitni seed. */
export function seedOf(str) {
  let h = 2166136261 >>> 0;
  str = String(str);
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h;
}
