/* =====================================================================
   SMUČARSKI SKOKI — render/tex.js: proceduralne teksture (canvas, brez slik).
   Sneg (barva + normal map z »bleščicami«), led v smučini, napisi (številke
   daljave, reklamni panoji), zastave.
   ===================================================================== */
import * as THREE from 'three';

const cache = new Map();
const once = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };

function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 4) { let t = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { t += a * vnoise(x * f, y * f, s + i); a *= 0.5; f *= 2; } return t; }

/** Snežna podlaga: { map, normalMap, roughnessMap } (ponovljiva). sparkle: bleščice v normal map. */
export function snow(size = 256, sparkle = true) {
  return once('snow' + size + sparkle, () => {
    const N = size;
    const hgt = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      // periodično: fbm na torusu
      const nx = Math.cos(u * Math.PI * 2) * 3 + 10, ny = Math.sin(u * Math.PI * 2) * 3 + 10, nz = Math.cos(v * Math.PI * 2) * 3, nw = Math.sin(v * Math.PI * 2) * 3;
      hgt[y * N + x] = fbm(nx + nz, ny + nw, 3, 5) * 0.8 + fbm(nx * 3 + nw, ny * 3 + nz, 9, 3) * 0.2;
    }
    const col = canvas(N, N, (g) => {
      const img = g.createImageData(N, N);
      for (let i = 0; i < N * N; i++) {
        const k = 232 + (hgt[i] - 0.5) * 30;
        img.data[i * 4] = k - 6; img.data[i * 4 + 1] = k - 2; img.data[i * 4 + 2] = Math.min(255, k + 8); img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
    const nrm = canvas(N, N, (g) => {
      const img = g.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const dx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x + N - 1) % N];
        const dy = hgt[((y + 1) % N) * N + x] - hgt[((y + N - 1) % N) * N + x];
        let nx = -dx * 3, ny = -dy * 3;
        if (sparkle && hash(x, y, 77) > 0.985) { nx += (hash(x, y, 5) - 0.5) * 1.6; ny += (hash(x, y, 6) - 0.5) * 1.6; }
        const l = Math.hypot(nx, ny, 1);
        img.data[i * 4] = (nx / l * 0.5 + 0.5) * 255; img.data[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
    const rough = canvas(N, N, (g) => {
      const img = g.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const r = sparkle && hash(x, y, 77) > 0.985 ? 40 : 200 + hgt[i] * 40;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = r; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
    const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    return { map: mk(col, true), normalMap: mk(nrm, false), roughnessMap: mk(rough, false) };
  });
}

/** Smučina: led z dvema žlebovoma (vzdolž v). */
export function inrunTrack() {
  return once('track', () => {
    const c = canvas(64, 256, (g, w, h) => {
      g.fillStyle = '#dfe9f2'; g.fillRect(0, 0, w, h);
      for (const cx of [w * 0.3, w * 0.7]) {
        const gr = g.createLinearGradient(cx - 7, 0, cx + 7, 0);
        gr.addColorStop(0, '#c9d8e6'); gr.addColorStop(0.5, '#8fb3d4'); gr.addColorStop(1, '#c9d8e6');
        g.fillStyle = gr; g.fillRect(cx - 7, 0, 14, h);
      }
      g.fillStyle = 'rgba(255,255,255,.35)';
      for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 1, 6 + Math.random() * 20);
    });
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Napis na prozorni podlagi (številke daljave). */
export function label(text, { color = '#0d2a6b', bg = null, w = 128, h = 64, font = 'bold 44px system-ui, sans-serif' } = {}) {
  return once(`lbl:${text}:${color}:${bg}:${w}`, () => {
    const c = canvas(w, h, (g) => {
      if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
      g.fillText(text, w / 2, h / 2 + 2);
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  });
}

/** Reklamni pano z izmišljenim napisom. */
export function board(text, bg, fg) {
  return once(`brd:${text}:${bg}`, () => {
    const c = canvas(512, 64, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, bg); gr.addColorStop(1, shade(bg, -0.25));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.font = 'bold 36px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
      g.fillText(text, w / 2, h / 2 + 2);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, w, 6);
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  });
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k); else c.lerp(new THREE.Color('#fff'), k);
  return '#' + c.getHexString();
}

/** Zastava (trije vodoravni pasovi). */
export function flag(colors) {
  return once('flag:' + colors.join(','), () => {
    const c = canvas(64, 42, (g, w, h) => { colors.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * h / colors.length, w, h / colors.length + 1); }); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Mehka pika (delci snega). */
export function dot() {
  return once('dot', () => {
    const c = canvas(32, 32, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    return new THREE.CanvasTexture(c);
  });
}

export { fbm, hash };
