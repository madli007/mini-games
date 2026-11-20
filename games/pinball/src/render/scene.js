/* =====================================================================
   DINAMIČNI SLOJ — vse, kar se premika ali sveti (vsak frame)
   g = barvni sloj, e = emisijski sloj (bloom), oba v logičnih koordinatah
   ===================================================================== */
import { TAU, BR, PAL, MODES, CFG } from '../config.js';
import { PLUNGER_Y, SCOOP, SPINNER, RAMP } from '../table.js';
import { lampShape } from './art.js';

const FONT_T = '"Orbitron", "Rajdhani", "Arial Black", sans-serif';
const FONT_M = '"Share Tech Mono", Consolas, monospace';

const rgbStr = (c, a = 1, k = 1) => `rgba(${Math.round(Math.min(255, c[0] * 255 * k))},${Math.round(Math.min(255, c[1] * 255 * k))},${Math.round(Math.min(255, c[2] * 255 * k))},${a})`;

/* ------------------------------------------------------------------ */
export function drawLamps(g, e, T, lights, onRamp) {
  for (const l of T.lamps) {
    if (!!l.onRamp !== onRamp) continue;
    const o = lights.out[l.id];
    const i = o.i, c = o.rgb;
    if (l.group === 'gi') {
      g.beginPath(); g.arc(l.x, l.y, l.r, 0, TAU);
      g.fillStyle = rgbStr(c, 1, 0.25 + 0.75 * Math.min(1, i)); g.fill();
      if (e && i > 0.05) { e.beginPath(); e.arc(l.x, l.y, l.r * 2.2, 0, TAU); e.fillStyle = rgbStr(c, 0.55 * Math.min(1, i)); e.fill(); }
      continue;
    }
    g.save();
    g.translate(l.x, l.y);
    if (l.angle) g.rotate(l.angle);
    lampShape(g, l, 1);
    // plastika: temno obarvana, ko ne sveti
    const k = 0.16 + 0.84 * Math.min(1, i);
    g.fillStyle = rgbStr(c, 1, k);
    g.fill();
    if (i > 0.05) {
      g.save(); g.scale(0.55, 0.55); lampShape(g, l, 1);
      g.fillStyle = `rgba(255,255,255,${0.55 * Math.min(1, i)})`; g.fill(); g.restore();
    }
    // odsev na plastiki
    g.lineWidth = 1;
    g.strokeStyle = `rgba(255,255,255,${0.18 + 0.25 * Math.min(1, i)})`;
    g.stroke();
    if (l.label) {
      if (l.angle) g.rotate(-l.angle);
      g.font = `800 ${Math.round(l.r * 1.05)}px ${FONT_T}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = i > 0.4 ? 'rgba(10,12,18,.9)' : rgbStr(c, 0.9, 0.9);
      g.fillText(l.label, 0, 0.5);
    }
    g.restore();
    if (e && i > 0.04) {
      e.save(); e.translate(l.x, l.y); if (l.angle) e.rotate(l.angle);
      e.scale(1.25, 1.25); lampShape(e, l, 1);
      e.fillStyle = rgbStr(c, Math.min(1, i) * 0.85); e.fill();
      e.restore();
    }
  }
}

/* ------------------------------------------------------------------ */
export function drawBumpers(g, e, T, time) {
  for (const c of T.bumpers) {
    const f = c.flash, p = c.pop, r = c.r;
    // podnožje
    g.beginPath(); g.arc(c.x, c.y, r + 5, 0, TAU); g.fillStyle = '#0b0f15'; g.fill();
    // kovinski obroč (valj)
    const gr = g.createLinearGradient(c.x - r, c.y - r, c.x + r, c.y + r);
    gr.addColorStop(0, '#eef3fa'); gr.addColorStop(0.45, '#8a97a8'); gr.addColorStop(1, '#2b3341');
    g.beginPath(); g.arc(c.x, c.y, r + 2, 0, TAU); g.fillStyle = gr; g.fill();
    // osvetlitev od spodaj (obroč)
    const glow = 0.45 + 0.55 * f + 0.1 * Math.sin(time * 3 + c.i * 2);
    g.beginPath(); g.arc(c.x, c.y, r - 1.5, 0, TAU);
    g.fillStyle = `rgba(255,${Math.round(110 + 90 * f)},${Math.round(30 + 120 * f)},${0.55 + 0.45 * glow})`; g.fill();
    // kapica (poskoči ob udarcu)
    const cy = c.y - p * 3.5, cr = (r - 5) * (1 + p * 0.1);
    g.beginPath(); g.arc(c.x + 1.5, c.y + 2, cr, 0, TAU); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
    const cg = g.createRadialGradient(c.x - cr * 0.35, cy - cr * 0.4, 1, c.x, cy, cr);
    if (f > 0.2) { cg.addColorStop(0, '#fffaf0'); cg.addColorStop(0.5, '#ffc070'); cg.addColorStop(1, '#ff7a1a'); }
    else { cg.addColorStop(0, '#ffd8a8'); cg.addColorStop(0.5, '#ff8a2a'); cg.addColorStop(1, '#8a2a00'); }
    g.beginPath(); g.arc(c.x, cy, cr, 0, TAU); g.fillStyle = cg; g.fill();
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,240,220,.65)'; g.stroke();
    // napis
    g.fillStyle = 'rgba(40,10,0,.85)';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(cr * 0.85)}px ${FONT_T}`; g.fillText('Al', c.x, cy + 1.5);
    g.font = `700 ${Math.round(cr * 0.38)}px ${FONT_M}`; g.fillText('13', c.x - cr * 0.55, cy - cr * 0.55);
    // bleščica
    g.beginPath(); g.ellipse(c.x - cr * 0.38, cy - cr * 0.5, cr * 0.38, cr * 0.18, -0.5, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
    if (e) {
      e.beginPath(); e.arc(c.x, c.y, r + 1, 0, TAU);
      e.fillStyle = `rgba(255,${Math.round(100 + 80 * f)},30,${0.12 + 0.6 * f})`; e.fill();
      if (f > 0.05) { e.beginPath(); e.arc(c.x, cy, cr, 0, TAU); e.fillStyle = `rgba(255,200,140,${f * 0.7})`; e.fill(); }
    }
  }
}

/* ------------------------------------------------------------------ */
export function drawSlings(g, e, T) {
  for (const s of T.slings) {
    const [ax, ay] = s.A, [bx, by] = s.B, [cx, cy] = s.C, f = s.flash, k = s.bend;
    // plastika
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.closePath();
    const gr = g.createLinearGradient(ax, ay, cx, cy);
    gr.addColorStop(0, `rgba(255,140,40,${0.35 + f * 0.4})`); gr.addColorStop(1, `rgba(255,90,20,${0.18 + f * 0.4})`);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(255,200,140,.4)'; g.lineWidth = 1; g.stroke();
    // guma: izboči se proti žogici ob udarcu
    const mx = (ax + cx) / 2, my = (ay + cy) / 2;
    let nx = cy - ay, ny = -(cx - ax); const l = Math.hypot(nx, ny); nx /= l; ny /= l;
    if ((bx - mx) * nx + (by - my) * ny > 0) { nx = -nx; ny = -ny; }
    const qx = mx + nx * k * 9, qy = my + ny * k * 9;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(qx, qy, cx, cy);
    g.strokeStyle = '#0b0c0f'; g.lineWidth = 8; g.stroke();
    g.strokeStyle = '#2c2f36'; g.lineWidth = 5.5; g.stroke();
    g.beginPath(); g.moveTo(ax - 0.8, ay - 0.8); g.quadraticCurveTo(qx - 0.8, qy - 0.8, cx - 0.8, cy - 0.8);
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.2; g.stroke();
    // drogovi
    for (const [px, py] of [s.A, s.B, s.C]) {
      g.beginPath(); g.arc(px, py, 5, 0, TAU); g.fillStyle = '#9aa8b8'; g.fill();
      g.beginPath(); g.arc(px - 1, py - 1, 2, 0, TAU); g.fillStyle = '#f5f8ff'; g.fill();
    }
    // tekst
    g.save();
    g.translate((ax + bx + cx) / 3 + (s.side === 'L' ? -4 : 4), (ay + by + cy) / 3);
    g.rotate(s.side === 'L' ? 1.1 : -1.1);
    g.font = `800 8px ${FONT_T}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,235,210,.75)';
    g.fillText(CFG.imena.sling, 0, 0);
    g.restore();
    if (e) {
      e.lineCap = 'round';
      e.beginPath(); e.moveTo(ax, ay); e.quadraticCurveTo(qx, qy, cx, cy);
      e.strokeStyle = `rgba(255,170,80,${0.18 + f * 0.9})`; e.lineWidth = 3 + f * 5; e.stroke();
    }
  }
}

/* ------------------------------------------------------------------ */
export function drawTargets(g, e, T, game, time) {
  for (const s of T.drops) {
    const ch = 'BUG'[s.data.idx], y0 = s.ay - 3, h = s.by - s.ay + 6, k = s.sink;
    // reža
    g.fillStyle = '#020305'; g.fillRect(s.ax - 6, y0, 12, h);
    if (k < 0.98) {
      g.save();
      g.globalAlpha = 1 - k * 0.85;
      const x = s.ax - 5 + k * 3, w = 10 - k * 6;
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, '#b6ffd2'); gr.addColorStop(0.35, '#39ff88'); gr.addColorStop(1, '#0d6b38');
      g.fillStyle = gr; g.fillRect(x, y0 + k * 4, w, h - k * 8);
      g.fillStyle = 'rgba(0,30,12,.9)';
      g.font = `900 10px ${FONT_T}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, s.ax + k * 2, y0 + h / 2);
      g.restore();
      if (e) {
        const pulse = game.lockLit ? 0.25 : 0.35 + 0.25 * Math.sin(time * 4 + s.data.idx);
        e.fillStyle = `rgba(57,255,136,${pulse * (1 - k)})`; e.fillRect(s.ax - 8, y0 - 2, 16, h + 4);
      }
    }
  }
  // code review (standup)
  const r = T.review, w = r.wobble, ox = Math.sin(w * 30) * w * 2.5;
  g.fillStyle = '#05070a'; g.fillRect(r.ax - 2, r.ay - 4, r.bx - r.ax + 4, 9);
  const gr = g.createLinearGradient(0, r.ay - 6, 0, r.ay + 6);
  gr.addColorStop(0, '#ffc2f2'); gr.addColorStop(0.4, '#ff4fd8'); gr.addColorStop(1, '#6a0d58');
  g.fillStyle = gr; g.fillRect(r.ax + ox, r.ay - 5, r.bx - r.ax, 10);
  g.fillStyle = 'rgba(40,0,30,.85)'; g.font = `800 6.5px ${FONT_T}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('REVIEW', (r.ax + r.bx) / 2 + ox, r.ay + 0.5);
  if (e) { e.fillStyle = `rgba(255,79,216,${0.3 + w * 0.7})`; e.fillRect(r.ax - 3 + ox, r.ay - 7, r.bx - r.ax + 6, 14); }
}

/* ------------------------------------------------------------------ */
export function drawSpinner(g, e, sp) {
  const x = SPINNER.x, y = SPINNER.y;
  // nosilec
  g.strokeStyle = '#c3cdd9'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(22, y); g.lineTo(66, y); g.stroke();
  for (const px of [23, 65]) { g.beginPath(); g.arc(px, y, 3, 0, TAU); g.fillStyle = '#7f8c9d'; g.fill(); }
  // plošča se vrti okoli vodoravne osi
  const a = sp.angle, s = Math.sin(a), c = Math.cos(a);
  const h = Math.abs(s) * 13 + 1.2;
  const front = s > 0;
  const blur = Math.min(1, sp.w / 30);
  if (blur > 0.3) {
    g.fillStyle = `rgba(200,215,230,${0.18 * blur})`;
    g.fillRect(x - 19, y - 13, 38, 26);
  }
  const gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  if (front) { gr.addColorStop(0, '#f8fbff'); gr.addColorStop(0.5, '#9fb0c4'); gr.addColorStop(1, '#5a6a7e'); }
  else { gr.addColorStop(0, '#5d6878'); gr.addColorStop(1, '#2a323e'); }
  g.fillStyle = gr;
  g.fillRect(x - 19, y - h / 2 + (c > 0 ? 0 : 0), 38, h);
  if (front && h > 6) {
    g.fillStyle = 'rgba(10,30,50,.7)'; g.font = `800 ${Math.min(9, h * 0.7)}px ${FONT_T}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(x, y); g.scale(1, Math.max(0.2, h / 13)); g.fillText('VALJ', 0, 0.5); g.restore();
  }
  if (e && sp.w > 2) { e.fillStyle = `rgba(111,211,255,${Math.min(0.7, sp.w / 40)})`; e.fillRect(x - 21, y - h / 2 - 2, 42, h + 4); }
}

/* ------------------------------------------------------------------ */
export function drawPlunger(g, e, game) {
  const top = PLUNGER_Y + game.plungerPull * 28;
  g.fillStyle = '#05070a'; g.fillRect(548, top - 2, 29, 1000 - top + 2);
  // vzmet
  g.strokeStyle = '#8b97a6'; g.lineWidth = 1.6;
  g.beginPath();
  const n = 9, len = 1000 - top - 8;
  for (let i = 0; i <= n; i++) {
    const yy = top + 8 + len * i / n, xx = i % 2 ? 553 : 572;
    i ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
  }
  g.stroke();
  // glava
  const gr = g.createLinearGradient(549, 0, 576, 0);
  gr.addColorStop(0, '#5a6576'); gr.addColorStop(0.4, '#f0f5fb'); gr.addColorStop(1, '#4b5566');
  g.fillStyle = gr; g.fillRect(549, top, 27, 7);
  g.fillStyle = '#ff7a1a'; g.fillRect(549, top + 7, 27, 2);
  // moč
  if (game.plungerPull > 0) {
    const p = game.plungerPull;
    const col = `hsl(${40 - p * 40},100%,${50 + p * 10}%)`;
    g.fillStyle = col; g.fillRect(583, 990 - p * 130, 4, p * 130);
    if (e) { e.fillStyle = col; e.fillRect(581, 990 - p * 130, 8, p * 130); }
  }
}

/* ------------------------------------------------------------------ */
export function drawFlippers(g, e, T, game) {
  for (const f of T.flippers) {
    const L = f.len;
    const shape = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(0, -f.r1);
      ctx.lineTo(L, -f.r2);
      ctx.arc(L, 0, f.r2, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(0, f.r1);
      ctx.arc(0, 0, f.r1, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath();
    };
    // senca
    g.save(); g.translate(f.px + 4, f.py + 6); g.rotate(f.angle); shape(g); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill(); g.restore();
    g.save();
    g.translate(f.px, f.py); g.rotate(f.angle);
    shape(g);
    // gumijast obroč
    g.fillStyle = '#0c0d10'; g.fill();
    g.save(); g.scale(0.86, 0.8); g.translate(1.5, 0); shape(g); g.restore();
    const flipSide = f.side === 'R' ? -1 : 1;
    const gr = g.createLinearGradient(0, -f.r1 * flipSide, 0, f.r1 * flipSide);
    gr.addColorStop(0, '#f6f9fd'); gr.addColorStop(0.35, '#b7c3d1'); gr.addColorStop(0.7, '#6b7889'); gr.addColorStop(1, '#3a4452');
    g.fillStyle = gr; g.fill();
    // bleščica
    g.beginPath(); g.moveTo(6, -f.r1 * 0.45 * flipSide); g.lineTo(L - 4, -f.r2 * 0.4 * flipSide);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.2; g.stroke();
    // logo
    g.save(); g.translate(L * 0.52, 0); if (f.side === 'R') g.rotate(Math.PI);
    g.fillStyle = game.tilted ? 'rgba(255,60,60,.9)' : 'rgba(255,122,26,.95)';
    g.font = `900 8px ${FONT_T}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ALU', 0, 0.5); g.restore();
    // os
    const pg = g.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, 6);
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, '#4a5566');
    g.beginPath(); g.arc(0, 0, 5.5, 0, TAU); g.fillStyle = pg; g.fill();
    g.restore();
    if (e && f.pressed && f.enabled) {
      e.save(); e.translate(f.px, f.py); e.rotate(f.angle); shape(e);
      e.strokeStyle = 'rgba(255,140,50,.45)'; e.lineWidth = 3; e.stroke(); e.restore();
    }
  }
}

/* ------------------------------------------------------------------ */
export function drawBalls(g, e, balls, env, layer, q, time) {
  for (const b of balls) {
    if (b.layer !== layer || b.captured) continue;
    const R = BR * (layer === 1 ? 1.1 : 1);
    // senca
    const so = layer === 1 ? [12, 16, 1.4] : [4.5, 6.5, 1];
    const sg = g.createRadialGradient(b.x + so[0], b.y + so[1], 1, b.x + so[0], b.y + so[1], R * 1.35 * so[2]);
    sg.addColorStop(0, 'rgba(0,0,0,.55)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(b.x + so[0], b.y + so[1], R * 1.35 * so[2], 0, TAU); g.fill();
    // motion blur
    const sp = Math.hypot(b.vx, b.vy);
    if (q.motion && sp > 1000) {
      const n = 4, k = Math.min(1, (sp - 1000) / 2600);
      for (let i = n; i >= 1; i--) {
        const t = i * 0.006;
        g.beginPath(); g.arc(b.x - b.vx * t, b.y - b.vy * t, R * (1 - i * 0.06), 0, TAU);
        g.fillStyle = `rgba(190,205,225,${0.12 * k * (1 - i / (n + 1))})`; g.fill();
      }
      if (e) {
        const t = b.trail;
        e.lineCap = 'round';
        e.beginPath();
        for (let i = 0; i < t.length; i += 2) i ? e.lineTo(t[i], t[i + 1]) : e.moveTo(t[i], t[i + 1]);
        e.lineTo(b.x, b.y);
        // sled na emisijskem sloju (žari) — šibka in ozka, da ne zaslepi
        e.strokeStyle = `rgba(150,200,255,${0.1 * k})`; e.lineWidth = R * 0.6; e.stroke();
      }
    }
    chromeBall(g, b.x, b.y, R, env, b);
    if (e) {
      e.beginPath(); e.arc(b.x - R * 0.35, b.y - R * 0.42, R * 0.32, 0, TAU);
      e.fillStyle = 'rgba(255,255,255,.3)'; e.fill();
    }
  }
}

export function chromeBall(g, x, y, R, env, b) {
  g.save();
  g.beginPath(); g.arc(x, y, R, 0, TAU); g.clip();
  // odsev okolja — premika se z žogico
  if (env) {
    const sw = 70, sh = 64;
    const sx = (((x * 0.35 + (b ? b.vx * 0.003 : 0)) % (256 - sw)) + (256 - sw)) % (256 - sw);
    const sy = Math.max(0, Math.min(128 - sh, 8 + (y / 1000) * 50));
    g.drawImage(env, sx, sy, sw, sh, x - R, y - R, R * 2, R * 2);
  } else {
    g.fillStyle = '#9aa8b8'; g.fillRect(x - R, y - R, R * 2, R * 2);
  }
  // senčenje krogle in fresnel rob
  const sh = g.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, R);
  sh.addColorStop(0, 'rgba(255,255,255,0.15)');
  sh.addColorStop(0.6, 'rgba(0,0,0,0.05)');
  sh.addColorStop(0.9, 'rgba(0,0,0,0.45)');
  sh.addColorStop(1, 'rgba(220,235,255,0.55)');
  g.fillStyle = sh; g.fillRect(x - R, y - R, R * 2, R * 2);
  g.restore();
  // bleščici
  g.beginPath(); g.arc(x - R * 0.36, y - R * 0.42, R * 0.26, 0, TAU); g.fillStyle = 'rgba(255,255,255,.95)'; g.fill();
  g.beginPath(); g.arc(x + R * 0.42, y + R * 0.38, R * 0.12, 0, TAU); g.fillStyle = 'rgba(255,190,120,.6)'; g.fill();
}

/* ------------------------------------------------------------------ */
export function drawFurnace(g, e, game, env, time) {
  const { x, y } = SCOOP;
  // zaklenjene žogice v peči (vidno)
  const lockPos = [[480, 459], [500, 459]];
  for (let i = 0; i < game.locks; i++) {
    const [lx, ly] = lockPos[i];
    chromeBall(g, lx, ly, BR * 0.8, env, null);
    g.beginPath(); g.arc(lx, ly, BR * 0.8, 0, TAU); g.fillStyle = 'rgba(255,110,20,.35)'; g.fill();
    if (e) { e.beginPath(); e.arc(lx, ly, BR * 1.1, 0, TAU); e.fillStyle = `rgba(57,255,136,${0.4 + 0.2 * Math.sin(time * 5 + i)})`; e.fill(); }
  }
  for (const b of game.balls) {
    if (!b.captured) continue;
    chromeBall(g, x, y, BR * 0.86, env, null);
    g.beginPath(); g.arc(x, y, BR * 0.86, 0, TAU); g.fillStyle = 'rgba(255,120,30,.3)'; g.fill();
  }
  if (e) {
    const heat = game.heat;
    e.beginPath(); e.arc(x, y, 30, 0, TAU);
    e.fillStyle = `rgba(255,110,20,${0.12 + heat * 0.35 + 0.05 * Math.sin(time * 7)})`; e.fill();
  }
}

/* ------------------------------------------------------------------ */
export function drawParticles(g, e, parts) {
  g.lineCap = 'round';
  for (const p of parts) {
    const a = 1 - p.t / p.life;
    if (a <= 0) continue;
    if (p.kind === 'spark') {
      const l = 0.018;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * l, p.y - p.vy * l);
      g.strokeStyle = p.t < p.life * 0.3 ? `rgba(255,250,235,${a})` : `rgba(255,${Math.round(120 + 100 * a)},40,${a})`;
      g.lineWidth = p.size; g.stroke();
      if (e) { e.beginPath(); e.moveTo(p.x, p.y); e.lineTo(p.x - p.vx * l, p.y - p.vy * l); e.strokeStyle = `rgba(255,170,70,${a})`; e.lineWidth = p.size * 2.5; e.stroke(); }
    } else if (p.kind === 'ember') {
      g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fillStyle = `rgba(255,${Math.round(140 + 80 * a)},60,${a})`; g.fill();
      if (e) { e.beginPath(); e.arc(p.x, p.y, p.size * 2.2, 0, TAU); e.fillStyle = `rgba(255,140,50,${a * 0.8})`; e.fill(); }
    } else {
      g.fillStyle = p.color; g.globalAlpha = a;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      g.globalAlpha = 1;
      if (e) { e.fillStyle = p.color; e.globalAlpha = a; e.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); e.globalAlpha = 1; }
    }
  }
}

export function drawPopups(g, e, pops) {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const p of pops) {
    const k = p.t / p.dur;
    const a = Math.min(1, (1 - k) * 2.2);
    const s = 1 + Math.max(0, 0.18 - p.t) * 3;
    const y = p.y - p.t * 38;
    g.save(); g.translate(p.x, y); g.scale(s, s);
    g.font = `900 ${p.size}px ${FONT_T}`;
    g.lineWidth = 3; g.strokeStyle = `rgba(0,0,0,${0.7 * a})`; g.strokeText(p.text, 0, 0);
    g.fillStyle = p.color; g.globalAlpha = a; g.fillText(p.text, 0, 0); g.globalAlpha = 1;
    g.restore();
    if (e) {
      e.save(); e.translate(p.x, y); e.scale(s, s);
      e.font = `900 ${p.size}px ${FONT_T}`; e.textAlign = 'center'; e.textBaseline = 'middle';
      e.globalAlpha = a * 0.8; e.fillStyle = p.color; e.fillText(p.text, 0, 0); e.globalAlpha = 1;
      e.restore();
    }
  }
}
