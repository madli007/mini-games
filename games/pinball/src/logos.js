/* =====================================================================
   LOGOTIPI — PNG s prosojnim ozadjem v assets/logos/
   Če slike ni (ali CFG.logotipi = false), igra namesto logotipa nariše tekst.
   ===================================================================== */
import { CFG } from './config.js';

const SRC = { impol: 'assets/logos/impol.png' };
// del slike s pripisom (»Aluminium Industry«), ki ga na DMD (32 pik) izpustimo: x > tx in y > ty (deleži slike)
const TAGLINE = { impol: { tx: 0.41, ty: 0.745 } };
const IMG = {};            // ime -> naložena slika
const CACHE = new Map();   // ime|barva -> obarvan canvas

export function loadLogos(onLoad) {
  if (!CFG.logotipi || typeof Image === 'undefined') return;
  for (const [k, src] of Object.entries(SRC)) {
    const img = new Image();
    img.onload = () => { IMG[k] = img; CACHE.clear(); if (onLoad) onLoad(k); };
    img.onerror = () => {};          // brez logotipa: ostane tekst
    img.src = src;
  }
}

export const hasLogo = k => !!IMG[k];
export const logoUrl = k => SRC[k];
export const logoAspect = k => IMG[k] ? IMG[k].width / IMG[k].height : 1;

/** logotip, enobarvno obarvan (alfa slike je maska); null, če ga ni */
export function tinted(k, color, maxW = 1024) {
  const img = IMG[k];
  if (!img) return null;
  const key = k + '|' + (color || '') + '|' + maxW;
  if (CACHE.has(key)) return CACHE.get(key);
  const s = Math.min(1, maxW / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  if (color) {
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  }
  CACHE.set(key, c);
  return c;
}

/** nariše logotip s središčem v (cx, cy) in širino w; vrne false, če logotipa ni */
export function drawLogo(g, k, cx, cy, w, color, o = {}) {
  const c = tinted(k, color);
  if (!c) return false;
  const h = w * c.height / c.width;
  g.save();
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  g.translate(cx, cy); if (o.rot) g.rotate(o.rot);
  g.drawImage(c, -w / 2, -h / 2, w, h);
  g.restore();
  return true;
}

/** bitna maska logotipa za DMD (w × h pik, vrednosti 0..1); null, če ga ni */
export function logoBitmap(k, w, h) {
  const img = IMG[k];
  if (!img) return null;
  const key = 'bmp|' + k + '|' + w + 'x' + h;
  if (CACHE.has(key)) return CACHE.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  let d;
  try { d = g.getImageData(0, 0, w, h).data; } catch (e) { return null; }
  const out = new Float32Array(w * h);
  const tl = TAGLINE[k], ox = (w - dw) / 2, oy = (h - dh) / 2;
  for (let i = 0; i < w * h; i++) {
    const u = ((i % w) - ox) / dw, v = (Math.floor(i / w) - oy) / dh;
    out[i] = tl && u > tl.tx && v > tl.ty ? 0 : d[i * 4 + 3] / 255;
  }
  CACHE.set(key, out);
  return out;
}
