/* =====================================================================
   HRČKOVA KROGLA — render/textures.js: proceduralne PBR teksture na canvasu.
   Vsaka vrsta podlage dobi barvo (map), normal map in roughness/metalness
   (G = hrapavost, B = kovinskost). Generirane enkrat, predpomnjene (ne brišejo
   se ob menjavi proge, zato poraba pomnilnika po vseh progah ne raste).
   ===================================================================== */
import * as THREE from 'three';

const SIZE = 256;
const cache = new Map();

/* ------------------------------------------------------------ šum (ponovljiv, ploščičast) */

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Vrednostni šum s periodo p (brez šivov pri ponavljanju). */
function vnoise(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = k => ((k % p) + p) % p;
  const a = hash(m(xi), m(yi), s), b = hash(m(xi + 1), m(yi), s), c = hash(m(xi), m(yi + 1), s), d = hash(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** FBM na enotskem kvadratu [0,1)², ploščičast. */
export function fbm(u, v, base = 4, oct = 4, s = 1) {
  let sum = 0, amp = 0.5, f = base, n = 0;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise(u * f, v * f, f, s + o * 17); n += amp; amp *= 0.5; f *= 2; }
  return sum / n;
}
/** Voronoi (razdalja do najbližje in druge najbližje točke), ploščičast. */
function voronoi(u, v, cells, s = 3) {
  const x = u * cells, y = v * cells;
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const mx = ((cx % cells) + cells) % cells, my = ((cy % cells) + cells) % cells;
    const px = cx + hash(mx, my, s), py = cy + hash(mx, my, s + 9);
    const d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; id = hash(mx, my, s + 5); } else if (d < d2) d2 = d;
  }
  return { d1, d2, id };
}
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------ gradnja tekstur */

function makeTex(data, w, h, srgb, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  img.data.set(data);
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.userData.cached = true;
  return t;
}

/**
 * Splošni generator: fn(u, v) → { c: [r,g,b] (0–1, sRGB), h (višina 0–1), r (hrapavost), m (kovinskost), e? (emisija 0–1) }.
 * Vrne { map, normalMap, ormMap, emissiveMap? }.
 */
function build(fn, { size = SIZE, normal = 2, emissive = false } = {}) {
  const n = size * size;
  const col = new Uint8ClampedArray(n * 4), orm = new Uint8ClampedArray(n * 4), H = new Float32Array(n);
  const em = emissive ? new Uint8ClampedArray(n * 4) : null;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const s = fn((x + 0.5) / size, (y + 0.5) / size);
    col[i * 4] = s.c[0] * 255; col[i * 4 + 1] = s.c[1] * 255; col[i * 4 + 2] = s.c[2] * 255; col[i * 4 + 3] = 255;
    orm[i * 4] = 255; orm[i * 4 + 1] = clamp01(s.r) * 255; orm[i * 4 + 2] = clamp01(s.m || 0) * 255; orm[i * 4 + 3] = 255;
    H[i] = s.h;
    if (em) { const e = s.e || 0; em[i * 4] = e * (s.ec?.[0] ?? 1) * 255; em[i * 4 + 1] = e * (s.ec?.[1] ?? 1) * 255; em[i * 4 + 2] = e * (s.ec?.[2] ?? 1) * 255; em[i * 4 + 3] = 255; }
  }
  // normal map iz višin (Sobel, ploščičasto)
  const nrm = new Uint8ClampedArray(n * 4);
  const at = (x, y) => H[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * normal, ny = dy * normal, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4;
    nrm[i] = (nx * 0.5 + 0.5) * 255; nrm[i + 1] = (ny * 0.5 + 0.5) * 255; nrm[i + 2] = (nz * 0.5 + 0.5) * 255; nrm[i + 3] = 255;
  }
  return {
    map: makeTex(col, size, size, true),
    normalMap: makeTex(nrm, size, size, false),
    ormMap: makeTex(orm, size, size, false),
    emissiveMap: em ? makeTex(em, size, size, true) : null,
  };
}

/* ------------------------------------------------------------ vrste podlag */

/** Ploščice s fugami; grid = ploščic na enoto. */
function tileFn({ grid = 1, grout = 0.05, base = [0.92, 0.92, 0.92], groutC = [0.55, 0.55, 0.55], rough = 0.35, rVar = 0.15, metal = 0, varC = 0.06, bevel = 0.04, noise = 0.06, speck = 0, seed = 1 }) {
  return (u, v) => {
    const gu = u * grid, gv = v * grid;
    const fu = gu - Math.floor(gu), fv = gv - Math.floor(gv);
    const id = hash(Math.floor(gu) % grid, Math.floor(gv) % grid, seed);
    const e = Math.min(fu, fv, 1 - fu, 1 - fv);
    const inG = e < grout * grid / 2;
    const n = fbm(u, v, 8, 4, seed);
    const k = 1 - varC / 2 + varC * id + (n - 0.5) * noise * 2;
    const sp = speck && hash((u * 997) | 0, (v * 991) | 0, seed) > 1 - speck ? 0.8 : 1;
    const bev = smooth(grout * grid / 2, grout * grid / 2 + bevel, e);
    if (inG) return { c: groutC.map(x => x * (0.9 + n * 0.2)), h: 0, r: 0.9, m: 0 };
    return { c: base.map(x => x * k * sp), h: 0.25 + 0.75 * bev + (n - 0.5) * 0.08, r: rough + (n - 0.5) * rVar + (1 - bev) * 0.2, m: metal };
  };
}

const KINDS = {
  // vrt: pokošena trata na kamnitih ploščah
  turf: () => build((u, v) => {
    const n = fbm(u, v, 16, 4, 3), blade = hash((u * 512) | 0, (v * 512) | 0, 4);
    const e = Math.min(u, v, 1 - u, 1 - v), seam = smooth(0.002, 0.014, e);
    const stripe = Math.sin((u + v * 0.0) * Math.PI * 2) * 0.04;
    const g = 0.78 + n * 0.3 + blade * 0.12 + stripe;
    return { c: [0.55 * g * seam + 0.5 * (1 - seam), 0.95 * g * seam + 0.56 * (1 - seam), 0.5 * g * seam + 0.42 * (1 - seam)], h: 0.3 + seam * (0.4 + blade * 0.3 * n), r: 0.85 + blade * 0.1, m: 0 };
  }, { normal: 3 }),
  soil: () => build((u, v) => {
    const n = fbm(u, v, 6, 5, 7), vo = voronoi(u, v, 6, 8);
    const stone = smooth(0.18, 0.08, vo.d1) * (vo.id > 0.55 ? 1 : 0);
    const root = smooth(0.02, 0, Math.abs(fbm(u * 0.5, v, 4, 3, 9) - 0.5)) * 0.6;
    const c = [0.36 + n * 0.12, 0.25 + n * 0.08, 0.16 + n * 0.05];
    const sc = [0.55 + vo.id * 0.15, 0.52 + vo.id * 0.12, 0.48 + vo.id * 0.1];
    return { c: c.map((x, k) => mix(mix(x, sc[k], stone), 0.24, root)), h: n * 0.6 + stone * 0.5 + root * 0.3, r: 0.95 - stone * 0.25, m: 0 };
  }, { normal: 3 }),
  hedge: () => build((u, v) => {
    const vo = voronoi(u, v, 14, 11), n = fbm(u, v, 8, 4, 12);
    const leaf = smooth(0.55, 0.1, vo.d1);
    const g = 0.35 + leaf * 0.45 + vo.id * 0.2;
    return { c: [0.16 * g, 0.42 * g + n * 0.1, 0.14 * g], h: leaf * (0.6 + vo.id * 0.4), r: 0.7 - leaf * 0.25, m: 0 };
  }, { normal: 4 }),
  ceramic: () => build(tileFn({ grid: 2, grout: 0.035, base: [0.97, 0.95, 0.92], groutC: [0.62, 0.58, 0.52], rough: 0.14, rVar: 0.08, varC: 0.05, noise: 0.03, seed: 21 }), { normal: 2.5 }),
  wood: () => build((u, v) => {
    const planks = 4, pv = v * planks, pid = Math.floor(pv), fv = pv - pid;
    const off = hash(pid % planks, 0, 31);
    const uu = (u + off) % 1;
    const ring = fbm(uu * 0.25, v, 3, 3, 32 + pid) * 12 + fv * 3;
    const grain = Math.sin(ring * Math.PI * 2) * 0.5 + 0.5;
    const n = fbm(uu, v, 32, 3, 33);
    const gap = smooth(0, 0.04, Math.min(fv, 1 - fv)) * smooth(0, 0.01, Math.abs(((u + off * 3) % 1) - 0.5) + 0.02);
    const k = (0.7 + grain * 0.2 + n * 0.15) * (0.85 + hash(pid, 1, 34) * 0.3);
    return { c: [0.62 * k * gap, 0.38 * k * gap, 0.2 * k * gap], h: gap * (0.8 + grain * 0.1), r: 0.32 + grain * 0.12 + (1 - gap) * 0.5, m: 0 };
  }, { normal: 2 }),
  enamel: () => build(tileFn({ grid: 1, grout: 0.025, base: [0.95, 0.95, 0.95], groutC: [0.35, 0.35, 0.38], rough: 0.22, rVar: 0.1, varC: 0.02, noise: 0.03, bevel: 0.06, seed: 41 }), { normal: 3 }),
  marble: () => build((u, v) => {
    const t = tileFn({ grid: 1, grout: 0.018, base: [0.96, 0.95, 0.97], groutC: [0.7, 0.7, 0.74], rough: 0.3, rVar: 0.08, varC: 0.04, noise: 0.02, seed: 51 })(u, v);
    const w = fbm(u, v, 3, 5, 52);
    const vein = smooth(0.03, 0, Math.abs(Math.sin((u * 2 + v + w * 3) * Math.PI) * 0.5)) * 0.35;
    t.c = t.c.map(x => x * (1 - vein * 0.6));
    return t;
  }, { normal: 2 }),
  stone: () => build((u, v) => {
    const rows = 3, rv = v * rows, rid = Math.floor(rv), fv = rv - rid;
    const uu = u * 2 + (rid % 2) * 0.5, fu = uu - Math.floor(uu);
    const e = Math.min(fu * 0.5, (1 - fu) * 0.5, fv / rows, (1 - fv) / rows);
    const n = fbm(u, v, 8, 5, 61);
    const bev = smooth(0.004, 0.03, e);
    const k = 0.75 + n * 0.3 + hash(Math.floor(uu) % 2, rid % rows, 62) * 0.15;
    return { c: [0.62 * k * (0.5 + bev * 0.5), 0.6 * k * (0.5 + bev * 0.5), 0.58 * k * (0.5 + bev * 0.5)], h: bev * 0.8 + n * 0.3, r: 0.88, m: 0 };
  }, { normal: 3 }),
  // brušena kovina s ploščami, zakovicami in malo rje
  metal: (o = {}) => build((u, v) => {
    const rust = o.rust ?? 0.15;
    const brush = fbm(u * 0.05, v, 64, 2, 71) * 0.5 + hash(0, (v * 1024) | 0, 72) * 0.5;
    const n = fbm(u, v, 6, 5, 73);
    const e = Math.min(u, v, 1 - u, 1 - v);
    const seam = smooth(0.006, 0.02, e);
    let rv = 0;
    for (const [rx, ry] of [[0.07, 0.07], [0.93, 0.07], [0.07, 0.93], [0.93, 0.93], [0.5, 0.07], [0.5, 0.93], [0.07, 0.5], [0.93, 0.5]]) rv = Math.max(rv, smooth(0.028, 0.012, Math.hypot(u - rx, v - ry)));
    const r = smooth(0.74 - rust * 0.35, 0.84 - rust * 0.35, n + (1 - seam) * 0.12) * (rust > 0 ? 1 : 0);
    const base = 0.62 + brush * 0.12 + rv * 0.15;
    const rc = [0.45 + n * 0.15, 0.22 + n * 0.08, 0.1];
    const c = [base, base * 1.0, base * 1.02].map((x, k) => mix(x * (0.4 + seam * 0.6), rc[k], r));
    return { c, h: seam * 0.5 + rv * 0.6 + brush * 0.05 - r * 0.1, r: mix(0.38 + brush * 0.15, 0.9, r), m: mix(0.6, 0.1, r) };
  }, { normal: 3 }),
  rust: () => KINDS.metal({ rust: 0.6 }),
  brass: () => build((u, v) => {
    const n = fbm(u, v, 6, 4, 81), b = hash(0, (v * 1024) | 0, 82);
    const e = Math.min(u, v, 1 - u, 1 - v), seam = smooth(0.006, 0.025, e);
    const k = (0.85 + n * 0.12 + b * 0.05) * (0.5 + seam * 0.5);
    return { c: [0.95 * k, 0.76 * k, 0.42 * k], h: seam * 0.6, r: 0.28 + n * 0.12, m: 1 };
  }, { normal: 2 }),
  girder: () => build((u, v) => {
    const n = fbm(u, v, 8, 4, 91);
    const holes = smooth(0.13, 0.1, Math.hypot(((u * 2) % 1) - 0.5, ((v * 2) % 1) - 0.5));
    const diag = smooth(0.06, 0.03, Math.abs(((u + v) % 0.5) - 0.25)) * 0.6;
    const k = 0.42 + n * 0.12 + diag * 0.15;
    const rust = smooth(0.55, 0.7, n) * 0.6;
    return { c: [mix(k, 0.42, rust), mix(k * 0.98, 0.2, rust), mix(k * 0.95, 0.08, rust)].map(x => x * (1 - holes * 0.8)), h: 0.5 + diag * 0.3 - holes * 0.5, r: mix(0.45, 0.9, rust), m: mix(0.9, 0.1, rust) };
  }, { normal: 3 }),
  hazard: () => build((u, v) => {
    const m = KINDS._metalSample(u, v);
    const s = ((u + v) * 3) % 1;
    const y = s < 0.5;
    const n = fbm(u, v, 10, 4, 101);
    const wear = smooth(0.68, 0.78, n);
    const c = y ? [0.98, 0.78, 0.1] : [0.08, 0.07, 0.06];
    return { c: c.map((x, k) => mix(x, m.c[k], wear)), h: m.h * 0.6 + (1 - wear) * 0.08, r: mix(0.45, m.r, wear), m: mix(0.2, 1, wear) };
  }, { normal: 2 }),
  rubber: () => build((u, v) => {
    const t = tileFn({ grid: 1, grout: 0.03, base: [0.95, 0.95, 0.95], groutC: [0.4, 0.4, 0.42], rough: 0.78, rVar: 0.05, varC: 0.03, noise: 0.03, bevel: 0.08, seed: 111 })(u, v);
    const d = Math.hypot(((u * 6) % 1) - 0.5, ((v * 6) % 1) - 0.5);
    const dimple = smooth(0.22, 0.12, d);
    t.h -= dimple * 0.15; t.c = t.c.map(x => x * (1 - dimple * 0.12));
    return t;
  }, { normal: 3 }),
  padded: () => build((u, v) => {
    const fu = (u * 2) % 1, fv = (v * 2) % 1;
    const d = Math.hypot(fu - 0.5, fv - 0.5);
    const puff = Math.cos(Math.min(1, d * 1.6) * Math.PI / 2);
    const n = fbm(u, v, 16, 3, 121);
    const btn = smooth(0.05, 0.03, Math.min(Math.hypot(fu, fv), Math.hypot(1 - fu, fv), Math.hypot(fu, 1 - fv), Math.hypot(1 - fu, 1 - fv)));
    const k = 0.72 + puff * 0.28 + n * 0.05;
    return { c: [k * (1 - btn * 0.5), k * (1 - btn * 0.5), k * (1 - btn * 0.5)], h: puff * 0.9 - btn * 0.3, r: 0.6 - puff * 0.1, m: 0 };
  }, { normal: 5 }),
  // zmrznjen led (tla ledene dvorane): razpoke in globina
  ice: () => build((u, v) => {
    const vo = voronoi(u, v, 5, 131), n = fbm(u, v, 6, 5, 132);
    const crack = smooth(0.035, 0, vo.d2 - vo.d1);
    const frost = smooth(0.4, 0.8, n);
    const k = 0.86 + vo.id * 0.08 + frost * 0.1;
    return { c: [0.8 * k + crack * 0.2, 0.92 * k + crack * 0.08, 1.0 * k], h: 0.5 - crack * 0.4 + frost * 0.15, r: 0.05 + frost * 0.35 + crack * 0.3, m: 0 };
  }, { normal: 2 }),
  iceRock: () => build((u, v) => {
    const vo = voronoi(u, v, 4, 141), n = fbm(u, v, 8, 5, 142);
    const facet = vo.id;
    const k = 0.6 + facet * 0.3 + n * 0.1;
    return { c: [0.55 * k, 0.75 * k, 0.95 * k], h: vo.d1 * 1.5 + n * 0.2, r: 0.2 + n * 0.3, m: 0 };
  }, { normal: 4 }),
  // temne sijoče ploščice z emisivno mrežo (neon)
  neon: () => build((u, v) => {
    const e = Math.min(u, v, 1 - u, 1 - v);
    const line = smooth(0.022, 0.006, e);
    const n = fbm(u, v, 8, 3, 151);
    const k = 0.16 + n * 0.05;
    return { c: [k, k, k * 1.3], h: 0.5 + smooth(0.02, 0.06, e) * 0.3, r: 0.12 + n * 0.1, m: 0.6, e: line, ec: [1, 1, 1] };
  }, { normal: 2, emissive: true }),
  darkmetal: () => build((u, v) => {
    const n = fbm(u, v, 6, 4, 161), b = hash(0, (v * 1024) | 0, 162);
    const strip = smooth(0.02, 0.005, Math.abs(v - 0.15)) + smooth(0.02, 0.005, Math.abs(v - 0.85));
    const k = 0.12 + n * 0.05 + b * 0.02;
    return { c: [k, k, k * 1.2], h: 0.5 - strip * 0.3, r: 0.35 + n * 0.1, m: 0.9, e: strip, ec: [1, 1, 1] };
  }, { normal: 2, emissive: true }),
  basalt: () => build((u, v) => {
    const vo = voronoi(u, v, 5, 171), n = fbm(u, v, 8, 5, 172);
    const crack = smooth(0.05, 0, vo.d2 - vo.d1);
    const k = 0.12 + vo.id * 0.06 + n * 0.06;
    return { c: [k + crack * 0.8, k + crack * 0.25, k + crack * 0.05], h: 0.6 - crack * 0.5 + n * 0.2, r: 0.85, m: 0, e: crack, ec: [1, 0.35, 0.08] };
  }, { normal: 3, emissive: true }),
  cloudstone: () => build((u, v) => {
    const n = fbm(u, v, 4, 5, 181), vo = voronoi(u, v, 6, 182);
    const k = 0.82 + n * 0.15 - smooth(0.06, 0, vo.d2 - vo.d1) * 0.15;
    return { c: [k, k * 0.98, k * 1.02], h: n * 0.6 + vo.d1 * 0.3, r: 0.75, m: 0 };
  }, { normal: 3 }),
  // lepilo: sijoča, viskozna, z mehurčki
  glue: () => build((u, v) => {
    const n = fbm(u, v, 4, 4, 191), vo = voronoi(u, v, 7, 192);
    const bub = smooth(0.2, 0.12, vo.d1) * (vo.id > 0.6 ? 1 : 0);
    const k = 0.85 + n * 0.2;
    return { c: [0.72 * k, 1.0 * k, 0.24 * k], h: n * 0.7 + bub * 0.5, r: 0.12 + n * 0.08, m: 0 };
  }, { normal: 4 }),
  // gumirani tekoči trak s puščicami (u prečno, v vzdolž)
  conveyor: () => build((u, v) => {
    const rib = Math.sin(v * Math.PI * 16) * 0.5 + 0.5;
    const n = fbm(u, v, 16, 3, 201);
    let arrow = 0;
    for (const y0 of [0.25, 0.75]) {
      const dy = v - y0 + Math.abs(u - 0.5) * 0.55;
      arrow = Math.max(arrow, smooth(0.09, 0.06, Math.abs(dy)) * smooth(0.42, 0.38, Math.abs(u - 0.5)));
    }
    const edge = smooth(0.06, 0.03, Math.min(u, 1 - u));
    const k = 0.16 + rib * 0.04 + n * 0.04;
    const c = arrow ? [mix(k, 1, arrow), mix(k, 0.78, arrow), mix(k, 0.12, arrow)] : [k, k, k];
    return { c: c.map(x => mix(x, 0.55, edge)), h: rib * 0.35 + arrow * 0.3 + edge * 0.5, r: mix(0.82, 0.45, arrow), m: edge * 0.9, e: arrow * 0.6, ec: [1, 0.78, 0.12] };
  }, { normal: 3, emissive: true }),
};
KINDS._metalSample = (u, v) => {
  const brush = fbm(u * 0.05, v, 64, 2, 71) * 0.5 + hash(0, (v * 1024) | 0, 72) * 0.5;
  const k = 0.62 + brush * 0.12;
  return { c: [k, k, k], h: brush * 0.05, r: 0.35 + brush * 0.15 };
};

/** PBR komplet za vrsto podlage (predpomnjen). */
export function surface(kind) {
  if (!KINDS[kind] || kind.startsWith('_')) kind = 'ceramic';
  if (!cache.has('s:' + kind)) cache.set('s:' + kind, KINDS[kind]());
  return cache.get('s:' + kind);
}
export const hasSurface = kind => cache.has('s:' + kind);

/* ------------------------------------------------------------ manjše teksture (predpomnjene) */

function canvas(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.cached = true;
  return t;
}
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

/** Mehka okrogla lisa (senca, delci, kavstika). */
export const softDot = () => once('dot', () => canvas(64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, { srgb: false }));

/** Kontaktna senca (temnejša sredina, mehak rob). */
export const contactShadow = () => once('contact', () => canvas(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.25, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, { srgb: false }));

/** Praske in prstni odtisi za hrapavost stekla (G kanal). */
export const glassScratches = () => once('scratch', () => {
  const S = 256, n = S * S, d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { d[i * 4] = 255; d[i * 4 + 1] = 8; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255; }
  const put = (x, y, v) => { x = ((x % S) + S) % S; y = ((y % S) + S) % S; const i = (y * S + x) * 4; d[i + 1] = Math.max(d[i + 1], v); };
  for (let k = 0; k < 70; k++) {
    let x = hash(k, 1, 301) * S, y = hash(k, 2, 301) * S;
    const a = hash(k, 3, 301) * Math.PI * 2, len = 10 + hash(k, 4, 301) * 50, v = 30 + hash(k, 5, 301) * 50;
    for (let s = 0; s < len; s++) put((x += Math.cos(a)) | 0, (y += Math.sin(a)) | 0, v);
  }
  // prstni odtisi: koncentrične elipse
  for (let f = 0; f < 3; f++) {
    const cx = hash(f, 7, 302) * S, cy = hash(f, 8, 302) * S;
    for (let r = 2; r < 18; r += 2.2) for (let a = 0; a < Math.PI * 2; a += 0.04) put((cx + Math.cos(a) * r) | 0, (cy + Math.sin(a) * r * 1.3) | 0, 26);
  }
  return makeTex(d, S, S, false);
});

/** Šum za lupine krzna (R = dolžina dlake). */
export const furNoise = () => once('fur', () => {
  const S = 128, d = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, h = hash(x, y, 401);
    d[i] = Math.pow(h, 0.7) * 255; d[i + 1] = fbm(x / S, y / S, 8, 3, 402) * 255; d[i + 2] = 0; d[i + 3] = 255;
  }
  return makeTex(d, S, S, false);
});

/** Razpoke za padajoče ploščice (alfa). */
export const cracks = () => once('cracks', () => {
  const S = 256, d = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const vo = voronoi(x / S, y / S, 4, 501);
    const c = smooth(0.04, 0, vo.d2 - vo.d1) * smooth(0.5, 0.2, Math.hypot(x / S - 0.5, y / S - 0.5) * (0.6 + vo.id));
    const i = (y * S + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = c * 255;
  }
  return makeTex(d, S, S, false, false);
});

/** Ogljikova vlakna (nasilnež). */
export const carbon = () => once('carbon', () => build((u, v) => {
  const w = 16, fu = (u * w) % 1, fv = (v * w) % 1, cu = Math.floor(u * w), cv = Math.floor(v * w);
  const dir = (cu + cv) % 2;
  const s = dir ? Math.sin(fu * Math.PI) : Math.sin(fv * Math.PI);
  const k = 0.06 + s * 0.08;
  return { c: [k, k, k * 1.1], h: s * 0.5, r: 0.35 - s * 0.1, m: 0.2 };
}, { normal: 2 }));

/** Ose: rumeno-črne proge. */
export const waspStripes = () => once('wasp', () => canvas(64, 64, (g, w, h) => {
  for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#141008' : '#ffc61a'; g.fillRect(0, (i / 6) * h, w, h / 6 + 1); }
}, { repeat: true }));

/** Proge zračnega toka (alfa, vzdolž v). */
export const streaks = () => once('streak', () => canvas(64, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let k = 0; k < 14; k++) {
    const x = hash(k, 1, 601) * w, y = hash(k, 2, 601) * h, len = 30 + hash(k, 3, 601) * 80;
    const gr = g.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x, y, 1.5 + hash(k, 4, 601) * 2, len);
    if (y + len > h) g.fillRect(x, y - h, 2, len);
  }
}, { srgb: false, repeat: true }));

/** Radialna zameglitev diska žage. */
export const sawBlur = () => once('sawblur', () => canvas(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, 'rgba(220,225,235,0)'); gr.addColorStop(0.55, 'rgba(220,225,235,.35)'); gr.addColorStop(0.82, 'rgba(240,245,255,.75)'); gr.addColorStop(0.9, 'rgba(255,80,90,.55)'); gr.addColorStop(1, 'rgba(255,80,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}));

/** Valovi magnetnega polja (alfa obroči). */
export const rings = () => once('rings', () => canvas(256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let r = 10; r < 128; r += 14) {
    g.strokeStyle = `rgba(255,255,255,${0.75 * (1 - r / 128)})`; g.lineWidth = 3;
    g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke();
  }
}, { srgb: false }));

/** Mehak kosmič oblaka (sprite). */
export const cloudPuff = () => once('cloud', () => {
  const S = 128, d = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x / S - 0.5, dy = y / S - 0.5;
    const r = Math.hypot(dx, dy * 1.3);
    const n = fbm(x / S, y / S, 4, 4, 701);
    const a = clamp01((0.5 - r) * 3.2 + (n - 0.5) * 1.2);
    const i = (y * S + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255 * (0.85 + 0.15 * (1 - dy)); d[i + 3] = a * a * 255;
  }
  return makeTex(d, S, S, true, false);
});

/** Opozorilna oznaka (kladivo): pravokotnik z mehkim robom in poševnimi črtami (alfa). */
export const warnDecal = () => once('warn', () => canvas(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.shadowColor = 'rgba(255,255,255,1)'; g.shadowBlur = 10;
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 10); g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 7; g.beginPath(); g.roundRect(12, 12, w - 24, h - 24, 9); g.stroke();
  g.save(); g.beginPath(); g.roundRect(16, 16, w - 32, h - 32, 6); g.clip();
  g.fillStyle = 'rgba(255,255,255,.5)';
  for (let k = -128; k < 256; k += 26) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 12, 0); g.lineTo(k + 12 + 128, 128); g.lineTo(k + 128, 128); g.fill(); }
  g.restore();
}, { srgb: false }));

/** Opozorilne črte za stranice premičnih ploščic, vrat in vzmeti. */
export const hazardStripes = () => once('hstripe', () => canvas(128, 32, (g, w, h) => {
  g.fillStyle = '#ffc61a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#16120c';
  for (let k = -32; k < w + 32; k += 24) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 12, 0); g.lineTo(k + 12 - h, h); g.lineTo(k - h, h); g.fill(); }
}, { repeat: true }));

/** Številčnica ure (pobiralka). */
export const clockFace = () => once('clock', () => canvas(128, 128, (g, w, h) => {
  g.fillStyle = '#f4fff8'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1a3a2a'; g.lineWidth = 5;
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); g.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); g.stroke(); }
  g.lineCap = 'round'; g.lineWidth = 7; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 26); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(92, 64); g.stroke();
  g.fillStyle = '#ff3b5c'; g.beginPath(); g.arc(64, 64, 6, 0, Math.PI * 2); g.fill();
}));

/** Vzorec na steklu krogle (skin.pattern): alfa maska. */
export const ballPattern = kind => once('pat:' + kind, () => canvas(256, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#fff';
  if (kind === 'stripes') for (let k = 0; k < 8; k++) g.fillRect(k * 32, 0, 9, h);
  else if (kind === 'dots') for (let y = 8; y < h; y += 22) for (let x = (y / 22 % 2) * 11 + 6; x < w; x += 22) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
  else if (kind === 'stars') {
    for (let k = 0; k < 26; k++) {
      const x = hash(k, 1, 801) * w, y = 10 + hash(k, 2, 801) * (h - 20), r = 4 + hash(k, 3, 801) * 5;
      g.beginPath();
      for (let j = 0; j < 10; j++) { const a = j / 10 * Math.PI * 2 - Math.PI / 2, rr = j % 2 ? r * 0.45 : r; j ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.fill();
    }
  } else if (kind === 'hex') {
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    for (let y = 0; y < h + 20; y += 17) for (let x = ((y / 17) % 2) * 15; x < w + 20; x += 30) { g.beginPath(); for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2; j ? g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10) : g.moveTo(x + 10, y); } g.closePath(); g.stroke(); }
  }
}, { srgb: false, repeat: true }));

/** Prapor zastavice (karirasti vzorec, tintiran z barvo materiala). */
export const flagCloth = () => once('flag', () => build((u, v) => {
  const weave = (Math.sin(u * Math.PI * 128) * Math.sin(v * Math.PI * 128)) * 0.5 + 0.5;
  const chk = ((Math.floor(u * 4) + Math.floor(v * 3)) % 2) ? 1 : 0.82;
  return { c: [chk * (0.92 + weave * 0.08), chk * (0.92 + weave * 0.08), chk * (0.92 + weave * 0.08)], h: weave * 0.4, r: 0.85, m: 0 };
}, { size: 128, normal: 1.5 }));

export function disposeCache() {
  for (const v of cache.values()) {
    if (v.isTexture) v.dispose();
    else if (v && typeof v === 'object') for (const t of Object.values(v)) t?.isTexture && t.dispose();
  }
  cache.clear();
}
