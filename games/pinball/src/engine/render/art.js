/* =====================================================================
   STATIČNA GRAFIKA — splošni gradniki in privzeti izris mize iz T
   Miza lahko vse povozi v tables/<id>/art.js (drawFloor, drawMask,
   drawRaised, drawEmissive, drawRamp, drawRampEmissive, drawToys).
   floor  : potisk (RGBA; alfa = pokritost z barvo, pod njo brušen aluminij)
   mask   : G = talina (animirana v shaderju), R = sijaj kovine
   raised : dvignjeni elementi (stene, drogovi, plastike)
   emis   : statični neon (moduliran z GI)
   ramp   : sprite ramp (riše se med plastmi žogic)
   ===================================================================== */
import { W, H, TAU } from '../config.js';

export const FONT_T = '"Orbitron", "Rajdhani", "Arial Black", sans-serif';
export const FONT_U = '"Rajdhani", "Segoe UI", Arial, sans-serif';
export const FONT_M = '"Share Tech Mono", Consolas, monospace';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

export function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** obris mize (T.outline): navpični stranici in lok zgoraj */
export function tablePath(g, keep, T) {
  const o = (T && T.outline) || { x1: 20, x2: 580, cx: 300, cy: 300, r: 280 };
  if (!keep) g.beginPath();
  g.moveTo(o.x1, H + 40); g.lineTo(o.x1, o.cy);
  g.arc(o.cx, o.cy, o.r, Math.PI, TAU);
  g.lineTo(o.x2, H + 40); g.closePath();
}

export function text(g, s, x, y, o = {}) {
  g.save();
  g.translate(x, y); if (o.rot) g.rotate(o.rot);
  g.font = `${o.weight || 700} ${o.size || 10}px ${o.font || FONT_U}`;
  g.fillStyle = o.color || 'rgba(220,230,240,.5)';
  g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
  if (o.spacing && 'letterSpacing' in g) g.letterSpacing = o.spacing + 'px';
  g.fillText(s, 0, 0);
  g.restore();
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export function hazard(g, x, y, w, h) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = 'rgba(20,16,4,0.9)'; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,190,40,0.35)';
  for (let i = -h; i < w + h; i += 14) {
    g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i + 7, y); g.lineTo(x + i + 7 - h, y + h); g.lineTo(x + i - h, y + h); g.closePath(); g.fill();
  }
  g.restore();
}

export function plastic(g, pts, color, label) {
  g.save();
  g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath();
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const gr = g.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  gr.addColorStop(0, hexA(color, 0.42)); gr.addColorStop(1, hexA(color, 0.16));
  g.fillStyle = gr; g.fill();
  g.strokeStyle = hexA(color, 0.8); g.lineWidth = 1.2; g.stroke();
  g.clip();
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(Math.min(...xs), Math.min(...ys) + 3); g.lineTo(Math.max(...xs), Math.min(...ys) + 1); g.stroke();
  g.restore();
  if (label) text(g, label, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, { size: 9, color: 'rgba(240,250,255,.85)', font: FONT_T, spacing: 3 });
}

/** stena / vodilo / drog / guma glede na s.look */
export function drawWall(g, s) {
  g.save();
  g.lineCap = 'round';
  const line = () => { g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); };
  const w = Math.max(3.5, s.r * 2);
  if (s.look === 'rubber') {
    line(); g.strokeStyle = '#0c0d10'; g.lineWidth = w + 3; g.stroke();
    line(); g.strokeStyle = '#2a2d33'; g.lineWidth = w; g.stroke();
    g.translate(-0.6, -0.8); line(); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.stroke();
  } else if (s.look === 'rubberPost') {
    g.beginPath(); g.arc(s.ax, s.ay, s.r + 1, 0, TAU); g.fillStyle = '#0c0d10'; g.fill();
    g.beginPath(); g.arc(s.ax, s.ay, s.r - 1, 0, TAU); g.fillStyle = '#2b2e35'; g.fill();
    const gr = g.createRadialGradient(s.ax - 1.5, s.ay - 2, 0.5, s.ax, s.ay, s.r * 0.6);
    gr.addColorStop(0, '#f2f6ff'); gr.addColorStop(1, '#4a5566');
    g.beginPath(); g.arc(s.ax, s.ay, s.r * 0.55, 0, TAU); g.fillStyle = gr; g.fill();
  } else if (s.look === 'post') {
    line(); g.strokeStyle = '#141a24'; g.lineWidth = w + 3; g.stroke();
    line(); g.strokeStyle = '#8796a8'; g.lineWidth = w; g.stroke();
    g.translate(-0.8, -0.8); line(); g.strokeStyle = 'rgba(240,248,255,.8)'; g.lineWidth = 1.2; g.stroke();
    g.translate(0.8, 0.8);
    for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by]]) {
      const gr = g.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 6);
      gr.addColorStop(0, '#e6faff'); gr.addColorStop(0.5, '#3aa9d8'); gr.addColorStop(1, '#0b3b55');
      g.beginPath(); g.arc(x, y, 5.5, 0, TAU); g.fillStyle = gr; g.fill();
    }
  } else if (s.look === 'gate') {
    line(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 4; g.stroke();
    line(); g.strokeStyle = '#c9d3df'; g.lineWidth = 1.6; g.stroke();
    g.beginPath(); g.arc(s.ax, s.ay, 3, 0, TAU); g.fillStyle = '#ffab3d'; g.fill();
  } else if (s.look === 'rampLip') {
    line(); g.strokeStyle = '#1a222e'; g.lineWidth = w + 3; g.stroke();
    line(); g.strokeStyle = '#a9b6c6'; g.lineWidth = w; g.stroke();
  } else {
    // kovinsko vodilo
    line(); g.strokeStyle = '#121822'; g.lineWidth = w + 3.5; g.stroke();
    line(); g.strokeStyle = '#5f6d80'; g.lineWidth = w + 1; g.stroke();
    line(); g.strokeStyle = '#a7b4c4'; g.lineWidth = Math.max(1.5, w - 2); g.stroke();
    g.translate(-0.7, -0.9); line(); g.strokeStyle = 'rgba(245,250,255,.75)'; g.lineWidth = 0.9; g.stroke();
  }
  g.restore();
}

/* ------------------------------------------------------------------ */
/* oblike insertov                                                       */
/* ------------------------------------------------------------------ */
export function lampShape(g, l, k = 1) {
  const r = l.r * k;
  g.beginPath();
  switch (l.shape) {
    case 'arrow':
      g.moveTo(r * 1.15, 0); g.lineTo(-r * 0.7, -r * 0.8); g.lineTo(-r * 0.35, 0); g.lineTo(-r * 0.7, r * 0.8); g.closePath();
      break;
    case 'chevron':
      g.moveTo(0, -r * 0.7); g.lineTo(r, r * 0.3); g.lineTo(r * 0.6, r * 0.7); g.lineTo(0, 0); g.lineTo(-r * 0.6, r * 0.7); g.lineTo(-r, r * 0.3); g.closePath();
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
        i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      break;
    default:
      g.arc(0, 0, r, 0, TAU);
  }
}

/** ležišča insertov (vdolbine) — na potisku */
export function lampSockets(g, T) {
  for (const l of T.lamps) {
    if (l.onRamp || l.group === 'gi') continue;
    g.save();
    g.translate(l.x, l.y); g.rotate(l.angle || 0);
    lampShape(g, l, 1.18);
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fill();
    g.lineWidth = 1; g.strokeStyle = 'rgba(160,190,220,0.22)'; g.stroke();
    g.restore();
  }
}

/** GI svetlobni krogi (topla luč žarnic na potisku) */
export function giGlow(g, T) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const l of T.lamps) {
    if (l.group !== 'gi') continue;
    const gr = g.createRadialGradient(l.x, l.y, 2, l.x, l.y, 75);
    gr.addColorStop(0, 'rgba(255,215,160,0.16)'); gr.addColorStop(1, 'rgba(255,215,160,0)');
    g.fillStyle = gr; g.fillRect(l.x - 75, l.y - 75, 150, 150);
  }
  g.restore();
}

/** senca dvignjenih elementov na potisku */
export function shadows(g, T) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 8; g.shadowOffsetX = 5; g.shadowOffsetY = 7;
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineCap = 'round';
  for (const s of T.segs) {
    if (!s.draw || s.layer !== 0 || s.look === 'outer' || s.kind === 'post' && s.look === 'upPost') continue;
    g.lineWidth = s.r * 2 + 3;
    g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); g.stroke();
  }
  for (const c of T.bumpers) { g.beginPath(); g.arc(c.x, c.y, c.r + 4, 0, TAU); g.fillStyle = 'rgba(0,0,0,.6)'; g.fill(); }
  // rampe po poti (višje → večji zamik)
  g.shadowOffsetX = 14; g.shadowOffsetY = 18; g.shadowBlur = 14;
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  for (const R of T.ramps) {
    if (!R.path) continue;
    g.lineWidth = R.width + 8; g.lineJoin = 'round';
    g.beginPath(); R.path.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
  }
  g.restore();
}

/* ------------------------------------------------------------------ */
/* privzeti izris (miza brez lastne grafike)                            */
/* ------------------------------------------------------------------ */
export function drawFloor(g, T, PAL) {
  g.save();
  tablePath(g, false, T); g.clip();
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, 'rgba(26,30,52,0.86)'); base.addColorStop(1, 'rgba(10,12,24,0.93)');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  giGlow(g, T);
  // saucerji / VUK: luknje
  for (const s of T.saucers) {
    g.beginPath(); g.arc(s.x, s.y, s.r + 6, 0, TAU); g.fillStyle = 'rgba(0,0,0,.95)'; g.fill();
    g.strokeStyle = hexA(PAL.melt, 0.6); g.lineWidth = 2; g.stroke();
  }
  // magneti: krog pod površino
  for (const m of T.magnets) {
    g.beginPath(); g.arc(m.x, m.y, m.r * 0.5, 0, TAU); g.strokeStyle = hexA(PAL.cyan, 0.35); g.lineWidth = 2; g.setLineDash([4, 4]); g.stroke(); g.setLineDash([]);
  }
  // imena strelov
  for (const s of T.shots) if (s.floorLabel) text(g, s.floorLabel, s.x, s.y + 22, { size: 8, color: 'rgba(200,220,240,.5)', font: FONT_T });
  lampSockets(g, T);
  shadows(g, T);
  g.restore();
}

export function drawMask(g) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }

export function drawRaised(g, T) {
  cabinet(g, T);
  for (const s of T.segs) {
    if (!s.draw || s.layer !== 0 || s.look === 'outer' || s.look === 'upPost' || s.look === 'diverter') continue;
    drawWall(g, s);
  }
}

/** ohišje izven mize + zunanja stranica */
export function cabinet(g, T) {
  g.save();
  g.beginPath(); g.rect(-50, -50, W + 100, H + 100);
  tablePath(g, true, T);
  const cab = g.createLinearGradient(0, 0, W, 0);
  cab.addColorStop(0, '#07090d'); cab.addColorStop(0.5, '#0b0f16'); cab.addColorStop(1, '#07090d');
  g.fillStyle = cab; g.fill('evenodd');
  g.restore();
  g.save();
  g.lineJoin = 'round';
  tablePath(g, false, T);
  g.strokeStyle = '#1a222e'; g.lineWidth = 10; g.stroke();
  g.strokeStyle = '#6d7a8c'; g.lineWidth = 3; g.stroke();
  g.strokeStyle = 'rgba(230,240,255,.55)'; g.lineWidth = 1; g.stroke();
  g.restore();
}

export function drawEmissive(g, T, PAL) {
  g.save();
  const o = T.outline;
  g.beginPath(); g.arc(o.cx, o.cy, o.r - 12, Math.PI + 0.06, TAU - 0.06);
  g.strokeStyle = hexA(PAL.cyan, 0.45); g.lineWidth = 2; g.stroke();
  g.restore();
}

/** rampe po poti (T.ramps s path): plastika ali žica; stene z layer > 0 */
export function drawRamp(g, T, PAL) {
  g.save();
  for (const R of T.ramps) {
    if (!R.path) continue;
    const P = R.path, col = R.color || PAL.cyan;
    const path = () => { g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (R.look === 'wire') {
      // dve žici + prečke
      for (const side of [-1, 1]) {
        g.beginPath();
        P.forEach((p, i) => {
          const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
          let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
          const x = p[0] - ty * R.width / 2 * side, y = p[1] + tx * R.width / 2 * side;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        });
        g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3.5; g.stroke();
        g.strokeStyle = 'rgba(215,228,242,.95)'; g.lineWidth = 1.6; g.stroke();
      }
      g.strokeStyle = 'rgba(150,165,185,.8)'; g.lineWidth = 1.2;
      let acc = 0;
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let s = (24 - acc % 24); s < l; s += 24) {
          const k = s / l, x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k, nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
          g.beginPath(); g.moveTo(x - nx * R.width / 2, y - ny * R.width / 2); g.lineTo(x + nx * R.width / 2, y + ny * R.width / 2); g.stroke();
        }
        acc += l;
      }
    } else {
      path(); g.strokeStyle = hexA(col, 0.16); g.lineWidth = R.width + 6; g.stroke();
      path(); g.strokeStyle = 'rgba(0,0,0,.0)'; g.stroke();
      for (const side of [-1, 1]) {
        g.beginPath();
        P.forEach((p, i) => {
          const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
          let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
          const x = p[0] - ty * (R.width / 2 + 2) * side, y = p[1] + tx * (R.width / 2 + 2) * side;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        });
        g.strokeStyle = '#0e131b'; g.lineWidth = 6; g.stroke();
        g.strokeStyle = '#8c9aac'; g.lineWidth = 3.2; g.stroke();
        g.strokeStyle = 'rgba(250,252,255,.85)'; g.lineWidth = 1; g.stroke();
      }
    }
    if (R.label) {
      const [x, y] = P[R.apex];
      text(g, R.label, x, y - R.width / 2 - 10, { size: 8, color: 'rgba(230,248,255,.8)', font: FONT_T, spacing: 1 });
    }
  }
  g.restore();
}

export function drawRampEmissive(g, T, PAL) {
  g.save();
  for (const R of T.ramps) {
    if (!R.path || R.look === 'wire') continue;
    g.beginPath(); R.path.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.strokeStyle = hexA(R.color || PAL.cyan, 0.3); g.lineWidth = 2; g.stroke();
  }
  g.restore();
}

/* ------------------------------------------------------------------ */
/* panorama za kromirano žogico                                          */
/* ------------------------------------------------------------------ */
export function makeEnvMap(blobs) {
  const c = makeCanvas(256, 128), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, '#dfe9f5'); sky.addColorStop(0.35, '#7b8899'); sky.addColorStop(0.55, '#2b3340');
  sky.addColorStop(0.75, '#14181f'); sky.addColorStop(1, '#3a2a20');
  g.fillStyle = sky; g.fillRect(0, 0, 256, 128);
  // okna / luči strehe
  for (let i = 0; i < 8; i++) {
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(i * 32 + 6, 10, 18, 8);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(i * 32 + 4, 22, 22, 4);
  }
  const blob = (x, y, r, col) => {
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const b of blobs || [[60, 92, 30, 'rgba(255,120,30,0.9)'], [190, 88, 26, 'rgba(111,211,255,0.7)'], [130, 100, 18, 'rgba(57,255,136,0.5)']]) blob(...b);
  return c;
}
