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

/**
 * Državna zastava za drog na vrhu skakalnice (koda kot v real.country), 'MOON' (Luna) ali 'MG' (izmišljene skakalnice).
 * Narisana poenostavljeno (barve in razdelitev; grb Slovenije shematsko).
 */
export function countryFlag(code) {
  return once('cflag:' + code, () => {
    const W = 192, H = 128;
    const c = canvas(W, H, (g) => {
      const stripesH = cols => cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * H / cols.length, W, H / cols.length + 1); });
      const stripesV = cols => cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * W / cols.length, 0, W / cols.length + 1, H); });
      const nordic = (bg, outer, inner) => {
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        const x = W * 0.36, t = H * 0.22;
        if (outer) { g.fillStyle = outer; g.fillRect(x - t / 2 - 8, 0, t + 16, H); g.fillRect(0, H / 2 - t / 2 - 8, W, t + 16); }
        g.fillStyle = inner; g.fillRect(x - t / 2, 0, t, H); g.fillRect(0, H / 2 - t / 2, W, t);
      };
      switch (code) {
        case 'SLO': {
          stripesH(['#ffffff', '#0b4ea2', '#ed1c24']);
          // grb: modri ščit z belo goro, valovi in tremi zlatimi zvezdami, rdeč rob
          const x = 34, y = 18, w = 40, h = 52;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h * 0.62); g.quadraticCurveTo(x + w / 2, y + h * 1.08, x, y + h * 0.62); g.closePath();
          g.fillStyle = '#ed1c24'; g.fill();
          g.save(); g.translate(x + w / 2, y + h / 2); g.scale(0.84, 0.86); g.translate(-(x + w / 2), -(y + h / 2));
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h * 0.62); g.quadraticCurveTo(x + w / 2, y + h * 1.08, x, y + h * 0.62); g.closePath();
          g.fillStyle = '#0b4ea2'; g.fill(); g.restore();
          g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x + 6, y + 40); g.lineTo(x + 14, y + 28); g.lineTo(x + 20, y + 20); g.lineTo(x + 26, y + 28); g.lineTo(x + 34, y + 40); g.closePath(); g.fill();
          g.strokeStyle = '#fff'; g.lineWidth = 2; for (const yy of [y + 44, y + 49]) { g.beginPath(); for (let i = 0; i <= 24; i++) { const xx = x + 8 + i; g.lineTo(xx, yy + Math.sin(i / 2) * 1.2); } g.stroke(); }
          g.fillStyle = '#ffdd00'; for (const [sx, sy] of [[x + 14, y + 9], [x + 26, y + 9], [x + 20, y + 15]]) { g.beginPath(); g.arc(sx, sy, 2.6, 0, Math.PI * 2); g.fill(); }
          break;
        }
        case 'AUT': stripesH(['#ed2939', '#ffffff', '#ed2939']); break;
        case 'GER': stripesH(['#000000', '#dd0000', '#ffce00']); break;
        case 'POL': stripesH(['#ffffff', '#dc143c']); break;
        case 'ITA': stripesV(['#009246', '#ffffff', '#ce2b37']); break;
        case 'FIN': nordic('#ffffff', null, '#002f6c'); break;
        case 'NOR': nordic('#ba0c2f', '#ffffff', '#00205b'); break;
        case 'SUI': g.fillStyle = '#da291c'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.fillRect(W / 2 - 12, H / 2 - 40, 24, 80); g.fillRect(W / 2 - 40, H / 2 - 12, 80, 24); break;
        case 'CZE': stripesH(['#ffffff', '#d7141a']); g.fillStyle = '#11457e'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.5, H / 2); g.lineTo(0, H); g.fill(); break;
        case 'JPN': g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#bc002d'; g.beginPath(); g.arc(W / 2, H / 2, H * 0.3, 0, Math.PI * 2); g.fill(); break;
        case 'MOON': {
          g.fillStyle = '#0b1236'; g.fillRect(0, 0, W, H);
          g.fillStyle = '#fff'; for (let i = 0; i < 26; i++) { const sx = hash(i, 1, 7) * W, sy = hash(i, 2, 7) * H; g.globalAlpha = 0.4 + hash(i, 3, 7) * 0.6; g.fillRect(sx, sy, 2, 2); }
          g.globalAlpha = 1;
          const mx = W * 0.56, my = H * 0.5, r = H * 0.32;
          const gr = g.createRadialGradient(mx - r * 0.3, my - r * 0.3, r * 0.2, mx, my, r);
          gr.addColorStop(0, '#fbf6e3'); gr.addColorStop(1, '#c9c2a8');
          g.fillStyle = gr; g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(120,112,90,.45)'; for (const [cx, cy, cr] of [[-0.3, -0.2, 0.18], [0.25, 0.1, 0.22], [-0.05, 0.35, 0.12], [0.3, -0.35, 0.1]]) { g.beginPath(); g.arc(mx + cx * r, my + cy * r, cr * r, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = '#ffd23f'; g.font = 'bold 16px system-ui, sans-serif'; g.fillText('MIRNO MORJE', 10, H - 12);
          break;
        }
        default: {   // MG: izmišljene skakalnice — zastava zbirke MINI GAMES
          g.fillStyle = '#15183a'; g.fillRect(0, 0, W, H);
          g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(0, H); g.lineTo(W * 0.55, 0); g.lineTo(W * 0.75, 0); g.lineTo(W * 0.2, H); g.fill();
          g.fillStyle = '#ff4fd8'; g.beginPath(); g.moveTo(W * 0.25, H); g.lineTo(W * 0.8, 0); g.lineTo(W * 0.88, 0); g.lineTo(W * 0.33, H); g.fill();
          g.fillStyle = '#fff'; g.font = 'bold 30px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('MINI', W * 0.5, H * 0.42); g.fillText('GAMES', W * 0.5, H * 0.72);
        }
      }
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
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
