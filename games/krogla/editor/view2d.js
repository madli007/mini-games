/* =====================================================================
   HRČKOVA KROGLA — editor/view2d.js: 2D tloris proge (canvas).
   Sever zgoraj (enako kot map). Pan: srednji gumb, presledek + vleka ali dva prsta.
   Zoom: kolešček ali razteg z dvema prstoma. Orodja dobijo dogodke v svetovnih koordinatah.
   ===================================================================== */
import { TILE_CHARS, DIRS, heightOf } from '../level.js';
import * as M from './model.js';

const DPR = () => Math.min(2, window.devicePixelRatio || 1);

/** Barva višine (gradient modra → zelena → rumena → rdeča → vijolična). */
export function heightColor(h) {
  const stops = [[0, [40, 70, 160]], [2, [40, 170, 120]], [4, [220, 200, 60]], [7, [230, 90, 60]], [12, [200, 70, 200]], [17.5, [255, 255, 255]]];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (h >= stops[i][0] && h <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  const f = b[0] === a[0] ? 0 : (h - a[0]) / (b[0] - a[0]);
  const c = a[1].map((v, k) => Math.round(v + (b[1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export class View2D {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onDown, onMove, onUp, onHover, onContext, onLongPress}} h obdelovalci (svetovne koordinate {x, z, c, r})
   */
  constructor(canvas, h) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = h;
    this.scale = 28;          // px na ploščico (CSS px)
    this.ox = 20; this.oy = 20;
    this.space = false;
    this.pointers = new Map();
    this.drag = null;          // { kind: 'pan' | 'tool', … }
    this.hover = null;
    this.dirty = true;
    this._bind();
  }

  /* ------------------------------------------------------------ koordinate */

  toWorld(px, py) { return { x: (px - this.ox) / this.scale, z: (py - this.oy) / this.scale }; }
  toScreen(x, z) { return [this.ox + x * this.scale, this.oy + z * this.scale]; }
  _evPos(e) { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  _world(e) {
    const [px, py] = this._evPos(e);
    const w = this.toWorld(px, py);
    return { ...w, c: Math.floor(w.x), r: Math.floor(w.z), px, py, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, button: e.button };
  }

  /** Prilagodi pogled, da je cela proga vidna. */
  fit(L) {
    const r = this.cv.getBoundingClientRect();
    const [W, D] = L.size;
    this.scale = Math.max(4, Math.min(48, Math.min((r.width - 40) / W, (r.height - 40) / D)));
    this.ox = (r.width - W * this.scale) / 2;
    this.oy = (r.height - D * this.scale) / 2;
    this.dirty = true;
  }
  /** Postavi točko (x, z) na sredino pogleda. */
  centerOn(x, z) {
    const r = this.cv.getBoundingClientRect();
    this.ox = r.width / 2 - x * this.scale; this.oy = r.height / 2 - z * this.scale;
    this.dirty = true;
  }
  zoomAt(px, py, k) {
    const s2 = Math.max(4, Math.min(80, this.scale * k));
    const w = this.toWorld(px, py);
    this.scale = s2;
    this.ox = px - w.x * s2; this.oy = py - w.z * s2;
    this.dirty = true;
  }

  /* ------------------------------------------------------------ vhod */

  _bind() {
    const cv = this.cv;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const [px, py] = this._evPos(e);
      this.zoomAt(px, py, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)));
    }, { passive: false });
    addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { this.space = true; if (e.target === document.body || e.target === cv) e.preventDefault(); } });
    addEventListener('keyup', e => { if (e.code === 'Space') this.space = false; });
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, this._evPos(e));
      if (this.pointers.size === 2) {
        // dva prsta: prekliči orodje, začni pan/zoom
        if (this.drag?.kind === 'tool') this.h.onCancel?.();
        clearTimeout(this._lp);
        const [a, b] = [...this.pointers.values()];
        this.drag = { kind: 'pinch', d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
        return;
      }
      if (this.pointers.size > 2) return;
      const p = this._evPos(e);
      if (e.button === 1 || (e.button === 0 && this.space)) { e.preventDefault(); this.drag = { kind: 'pan', x: p[0], y: p[1] }; cv.style.cursor = 'grabbing'; return; }
      const w = this._world(e);
      if (e.button === 2) { this.h.onContext?.(w, e); return; }
      if (e.button !== 0) return;
      this.drag = { kind: 'tool', touch: e.pointerType === 'touch', start: p, moved: false };
      if (e.pointerType === 'touch') {
        // dotik: orodje začne šele ob premiku ali ob dvigu (da dva prsta ne rišeta); dolg pritisk = meni
        this.drag.pending = w;
        this._lp = setTimeout(() => { if (this.drag?.pending) { const pw = this.drag.pending; this.drag = null; this.h.onContext?.(pw, e); } }, 600);
      } else this.h.onDown?.(w);
    });
    cv.addEventListener('pointermove', e => {
      const p = this._evPos(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      const d = this.drag;
      if (d?.kind === 'pinch' && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        this.ox += mx - d.mx; this.oy += my - d.my;
        if (d.d > 10) this.zoomAt(mx, my, dist / d.d);
        Object.assign(d, { d: dist, mx, my });
        this.dirty = true;
        return;
      }
      if (d?.kind === 'pan') { this.ox += p[0] - d.x; this.oy += p[1] - d.y; d.x = p[0]; d.y = p[1]; this.dirty = true; return; }
      const w = this._world(e);
      this.hover = w;
      this.h.onHover?.(w);
      if (d?.kind === 'tool') {
        if (d.pending) {
          if (Math.hypot(p[0] - d.start[0], p[1] - d.start[1]) < 8) return;
          clearTimeout(this._lp);
          this.h.onDown?.(d.pending); d.pending = null;
        }
        d.moved = true;
        this.h.onMove?.(w);
      }
      this.dirty = true;
    });
    const up = e => {
      this.pointers.delete(e.pointerId);
      clearTimeout(this._lp);
      const d = this.drag;
      if (!d) return;
      if (d.kind === 'pinch') { if (this.pointers.size === 0) this.drag = null; return; }
      if (d.kind === 'pan') { this.drag = null; this.cv.style.cursor = ''; return; }
      if (d.kind === 'tool') {
        this.drag = null;
        if (e.type === 'pointercancel') { this.h.onCancel?.(); return; }
        if (d.pending) { this.h.onDown?.(d.pending); this.h.onUp?.(d.pending); return; }
        this.h.onUp?.(this._world(e));
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !this.drag) { this.hover = null; this.h.onHover?.(null); this.dirty = true; } });
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const k = DPR();
    this.cv.width = Math.max(1, Math.round(r.width * k)); this.cv.height = Math.max(1, Math.round(r.height * k));
    this.dirty = true;
  }

  /* ------------------------------------------------------------ risanje */

  /**
   * @param {Object} S stanje urejevalnika ({ L, layer, sel, routeSel, pathSel, trace, errorsAt, preview, startHere, hTool })
   */
  draw(S) {
    const ctx = this.ctx, k = DPR();
    const { L } = S;
    const r = this.cv.getBoundingClientRect();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#070816';
    ctx.fillRect(0, 0, r.width, r.height);
    const s = this.scale;
    const [W, D] = L.size;
    // vidno območje
    const v0 = this.toWorld(0, 0), v1 = this.toWorld(r.width, r.height);
    const c0 = Math.max(0, Math.floor(v0.x)), c1 = Math.min(W - 1, Math.ceil(v1.x));
    const r0 = Math.max(0, Math.floor(v0.z)), r1 = Math.min(D - 1, Math.ceil(v1.z));
    // ozadje proge
    ctx.fillStyle = '#0e1030';
    ctx.fillRect(this.ox, this.oy, W * s, D * s);
    const heights = S.layer === 2;
    for (let rr = r0; rr <= r1; rr++) {
      const row = L.map[rr] || '';
      for (let cc = c0; cc <= c1; cc++) {
        const ch = row[cc] ?? ' ';
        if (ch === ' ') continue;
        const h = L.hmap ? (heightOf(L.hmap[rr][cc]) || 0) : 0;
        const [x, y] = this.toScreen(cc, rr);
        const info = M.tileInfo(ch);
        ctx.fillStyle = heights ? heightColor(h) : shade(info.color || '#888888', 0.7 + Math.min(0.6, h * 0.08));
        ctx.fillRect(x, y, s + 0.5, s + 0.5);
        if (s >= 10) this._tileGlyph(ctx, ch, x, y, s, heights);
        if (heights && s >= 18) {
          ctx.fillStyle = h > 5 ? '#000' : '#fff';
          ctx.font = `${Math.round(s * 0.36)}px system-ui, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(h).replace('.', ','), x + s / 2, y + s / 2 + (TILE_CHARS[ch] === 'ramp' ? s * 0.22 : 0));
        }
      }
    }
    // mreža
    if (s >= 7) {
      ctx.lineWidth = 1;
      for (let cc = c0; cc <= c1 + 1; cc++) {
        ctx.strokeStyle = cc % 5 === 0 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.07)';
        const [x] = this.toScreen(cc, 0);
        ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, this.oy + r0 * s); ctx.lineTo(Math.round(x) + 0.5, this.oy + (r1 + 1) * s); ctx.stroke();
      }
      for (let rr = r0; rr <= r1 + 1; rr++) {
        ctx.strokeStyle = rr % 5 === 0 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.07)';
        const [, y] = this.toScreen(0, rr);
        ctx.beginPath(); ctx.moveTo(this.ox + c0 * s, Math.round(y) + 0.5); ctx.lineTo(this.ox + (c1 + 1) * s, Math.round(y) + 0.5); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#4de1ff'; ctx.lineWidth = 2;
    ctx.strokeRect(this.ox, this.oy, W * s, D * s);
    // opozorila višin (stopnice brez klančine)
    if (heights) {
      ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = Math.max(2, s * 0.12);
      for (const w of S.warnings || []) {
        ctx.beginPath();
        if (w.c2 !== w.c) { const [x, y] = this.toScreen(w.c2, w.r); ctx.moveTo(x, y + 2); ctx.lineTo(x, y + s - 2); }
        else { const [x, y] = this.toScreen(w.c, w.r2); ctx.moveTo(x + 2, y); ctx.lineTo(x + s - 2, y); }
        ctx.stroke();
      }
    }
    // objekti
    ctx.globalAlpha = S.layer === 3 ? 1 : S.layer === 4 ? 0.55 : 0.75;
    for (const ref of M.allRefs(L)) this._obj(ctx, L, ref, S);
    ctx.globalAlpha = 1;
    // pot autopilota
    if (S.layer === 4 || S.showRoute) this._route(ctx, L, S);
    // sled autopilota / testne vožnje
    if (S.trace) this._trace(ctx, S.trace);
    // napake validatorja
    for (const p of S.errorsAt || []) {
      const [x, y] = this.toScreen(p[0], p[1]);
      ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, Math.max(8, s * 0.55), 0, Math.PI * 2); ctx.stroke();
    }
    if (S.startHere) {
      const [x, y] = this.toScreen(S.startHere[0], S.startHere[1]);
      ctx.fillStyle = '#39ff88'; ctx.beginPath(); ctx.moveTo(x - 6, y - 8); ctx.lineTo(x + 9, y); ctx.lineTo(x - 6, y + 8); ctx.fill();
    }
    // predogled orodja (čopič, pravokotnik, klančina)
    const pv = S.preview;
    if (pv?.cells) {
      ctx.fillStyle = 'rgba(77,225,255,.25)'; ctx.strokeStyle = 'rgba(77,225,255,.9)'; ctx.lineWidth = 1.5;
      for (const [cc, rr] of pv.cells) { const [x, y] = this.toScreen(cc, rr); ctx.fillRect(x, y, s, s); ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1); }
    }
    if (pv?.line) {
      const [a, b] = pv.line;
      const [x0, y0] = this.toScreen(a[0] + 0.5, a[1] + 0.5), [x1, y1] = this.toScreen(b[0] + 0.5, b[1] + 0.5);
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
    }
    this.dirty = false;
  }

  _tileGlyph(ctx, ch, x, y, s, heights) {
    const t = TILE_CHARS[ch];
    const cx = x + s / 2, cy = y + s / 2;
    ctx.save();
    if (t === 'ramp' || t === 'conveyor') {
      const [dx, dz] = DIRS[ch];
      ctx.translate(cx, cy); ctx.rotate(Math.atan2(dz, dx));
      ctx.fillStyle = heights ? 'rgba(0,0,0,.55)' : (t === 'ramp' ? 'rgba(255,255,255,.75)' : 'rgba(30,20,0,.7)');
      const a = s * 0.3;
      if (t === 'ramp') { ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(-a * 0.6, -a * 0.8); ctx.lineTo(-a * 0.6, a * 0.8); ctx.fill(); }
      else { for (const o of [-a * 0.7, a * 0.2]) { ctx.beginPath(); ctx.moveTo(o + a * 0.5, 0); ctx.lineTo(o - a * 0.1, -a * 0.6); ctx.lineTo(o - a * 0.1, a * 0.6); ctx.fill(); } }
    } else if (t === 'wall' && !heights) {
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y + s / 2); ctx.lineTo(x + s, y + s / 2); ctx.moveTo(x + s / 2, y); ctx.lineTo(x + s / 2, y + s / 2); ctx.moveTo(x + s / 4, y + s / 2); ctx.lineTo(x + s / 4, y + s); ctx.stroke();
    } else if (t === 'fall') {
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + s * 0.25, y + s * 0.25); ctx.lineTo(x + s * 0.75, y + s * 0.75); ctx.moveTo(x + s * 0.75, y + s * 0.25); ctx.lineTo(x + s * 0.25, y + s * 0.75); ctx.stroke();
    } else if (t === 'wave') {
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); for (let i = 0; i <= 8; i++) { const px = x + s * 0.15 + i * s * 0.0875, py = cy + Math.sin(i / 8 * Math.PI * 2) * s * 0.12; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke();
    } else if (t === 'ice' && !heights) {
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x + s * 0.2, y + s * 0.2, s * 0.15, s * 0.15); ctx.fillRect(x + s * 0.55, y + s * 0.6, s * 0.12, s * 0.12);
    } else if (t === 'glue' && !heights) {
      ctx.fillStyle = 'rgba(0,60,0,.4)'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.18, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  _icon(ctx, icon, x, y, size) {
    ctx.font = `${Math.round(size)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';   // barvni emoji prevzamejo prosojnost fillStyle
    ctx.fillText(icon, x, y + size * 0.05);
  }

  _arrow(ctx, x, y, dir, len, color) {
    const [dx, dz] = dir || [0, 1];
    const m = Math.hypot(dx, dz) || 1;
    const ex = x + dx / m * len, ey = y + dz / m * len;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    const a = Math.atan2(dz, dx), hl = Math.max(6, len * 0.3);
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(a - 0.5) * hl, ey - Math.sin(a - 0.5) * hl); ctx.lineTo(ex - Math.cos(a + 0.5) * hl, ey - Math.sin(a + 0.5) * hl); ctx.fill();
  }

  _obj(ctx, L, ref, S) {
    const k = M.kindOf(L, ref), K = M.KINDS[k], o = M.getObj(L, ref);
    if (!K || !o) return;
    const s = this.scale;
    const sel = S.sel && S.sel.arr === ref.arr && S.sel.i === ref.i;
    const col = K.color || '#fff';
    const pos = M.objPos(L, ref);
    let [x, y] = this.toScreen(pos[0], pos[1]);
    ctx.save();
    ctx.lineWidth = sel ? 3 : 1.5;
    ctx.strokeStyle = sel ? '#ffffff' : col;
    // oblike / območja delovanja
    if (K.shape === 'rect') {
      const [rx, ry] = this.toScreen(o.x, o.z);
      ctx.fillStyle = col + '55'; ctx.fillRect(rx, ry, o.w * s, o.d * s); ctx.strokeRect(rx, ry, o.w * s, o.d * s);
      [x, y] = this.toScreen(o.x + o.w / 2, o.z + o.d / 2);
    } else if (K.shape === 'mover') {
      const pts = o.path.map(p => this.toScreen(p[0], p[2]));
      ctx.setLineDash([5, 4]); ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (o.loop) ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 1; i < pts.length; i++) { ctx.strokeStyle = col + '88'; ctx.lineWidth = 1; ctx.strokeRect(pts[i][0] - o.size[0] * s / 2, pts[i][1] - o.size[1] * s / 2, o.size[0] * s, o.size[1] * s); }
      ctx.fillStyle = col + '66'; ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeStyle = sel ? '#fff' : col;
      ctx.fillRect(x - o.size[0] * s / 2, y - o.size[1] * s / 2, o.size[0] * s, o.size[1] * s);
      ctx.strokeRect(x - o.size[0] * s / 2, y - o.size[1] * s / 2, o.size[0] * s, o.size[1] * s);
      if (sel) this._pathHandles(ctx, pts, S);
    } else if (K.shape === 'circle') {
      ctx.fillStyle = col + '40'; ctx.beginPath(); ctx.arc(x, y, (o.r || 0.4) * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (K.shape === 'zone' || K.shape === 'range') {
      ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y, (o.zone || o.range || 3) * s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    } else if (K.shape === 'cone') {
      const [dx, dz] = o.dir || [0, 1], a = Math.atan2(dz, dx), half = (o.angle || 35) * Math.PI / 180;
      ctx.fillStyle = col + '30'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, (o.range || 5) * s, a - half, a + half); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (K.shape === 'fan') {
      const [dx, dz] = o.dir || [0, 1], m = Math.hypot(dx, dz) || 1, ux = dx / m, uz = dz / m, wx = -uz * (o.width || 1) / 2, wz = ux * (o.width || 1) / 2;
      const P = (a, b) => this.toScreen(pos[0] + a, pos[1] + b);
      const q = [P(wx, wz), P(wx + ux * o.len, wz + uz * o.len), P(-wx + ux * o.len, -wz + uz * o.len), P(-wx, -wz)];
      ctx.fillStyle = col + '30'; ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (K.path === 2) {
      const pts = o.path.map(p => this.toScreen(p[0], p[1]));
      ctx.setLineDash([5, 4]); ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (o.loop !== false) ctx.closePath();   // žage in ose: privzeto zanka (kot v physics.js) ctx.stroke(); ctx.setLineDash([]);
      if (sel) this._pathHandles(ctx, pts, S);
    }
    if (K.dir && o.dir && K.shape !== 'cone' && K.shape !== 'fan') this._arrow(ctx, x, y, o.dir, Math.max(12, s * 0.8), sel ? '#fff' : col);
    if (K.dir && (K.shape === 'cone' || K.shape === 'fan')) this._arrow(ctx, x, y, o.dir, Math.max(10, s * 0.6), sel ? '#fff' : col);
    // ikona
    const isz = Math.max(10, Math.min(30, s * 0.72));
    if (sel) { ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(x, y, isz * 0.7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.globalAlpha *= 1;
    this._icon(ctx, K.icon, x, y, isz);
    if (k === 'checkpoint' && s >= 14) {
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(s * 0.32)}px system-ui`; ctx.fillText(String(ref.i + 1), x + isz * 0.55, y - isz * 0.5);
    }
    if ((k === 'switch' || k === 'door') && s >= 14) {
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(s * 0.32)}px system-ui`; ctx.fillText(String(o.id), x + isz * 0.55, y - isz * 0.5);
    }
    ctx.restore();
  }

  _pathHandles(ctx, pts, S) {
    pts.forEach((p, i) => {
      ctx.fillStyle = i === S.pathSel ? '#ffd23f' : '#ffffff';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p[0], p[1], S.pathEdit ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (S.pathEdit) { ctx.fillStyle = '#000'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), p[0], p[1]); }
    });
  }

  _route(ctx, L, S) {
    const rt = L.route || [];
    const pts = rt.map(w => this.toScreen(...M.routePos(L, w)));
    const full = S.layer === 4;
    ctx.save();
    ctx.globalAlpha = full ? 1 : 0.5;
    ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (L.start) { const [x, y] = this.toScreen(L.start[0], L.start[1]); ctx.moveTo(x, y); }
    pts.forEach((p, i) => (i || L.start) ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.stroke();
    const rr = full ? 9 : 5;
    pts.forEach((p, i) => {
      const w = rt[i];
      const sel = full && S.routeSel === i;
      ctx.fillStyle = sel ? '#ffd23f' : w.mover != null ? '#ffb35c' : (w.stop || w.wait != null || w.until) ? '#4de1ff' : '#ff4fd8';
      ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2); ctx.fill();
      if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
      if (full) { ctx.fillStyle = '#000'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), p[0], p[1] + 0.5); }
    });
    ctx.restore();
  }

  _trace(ctx, tr) {
    ctx.save();
    ctx.strokeStyle = tr.ok ? '#39ff88' : '#ffd23f'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.9;
    ctx.beginPath();
    let pen = false;
    for (const f of tr.frames) {
      if (f[1] < -50) { pen = false; continue; }
      const [x, y] = this.toScreen(f[0], f[2]);
      if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
    }
    ctx.stroke();
    for (const f of tr.falls || []) {
      const [x, y] = this.toScreen(f.x, f.z);
      ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x - 8, y - 8); ctx.lineTo(x + 8, y + 8); ctx.moveTo(x + 8, y - 8); ctx.lineTo(x - 8, y + 8); ctx.stroke();
    }
    ctx.restore();
  }
}

/** Sličica tlorisa (za seznam osnutkov): majhen canvas → dataURL ni potreben, rišemo neposredno. */
export function drawThumb(canvas, L) {
  const ctx = canvas.getContext('2d');
  const [W, D] = L.size;
  const s = Math.min(canvas.width / W, canvas.height / D);
  const ox = (canvas.width - W * s) / 2, oy = (canvas.height - D * s) / 2;
  ctx.fillStyle = '#0e1030'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < D; r++) for (let c = 0; c < W; c++) {
    const ch = L.map[r]?.[c] ?? ' ';
    if (ch === ' ') continue;
    const h = L.hmap ? heightOf(L.hmap[r][c]) || 0 : 0;
    ctx.fillStyle = shade(M.tileInfo(ch).color || '#888888', 0.7 + Math.min(0.6, h * 0.08));
    ctx.fillRect(ox + c * s, oy + r * s, Math.ceil(s), Math.ceil(s));
  }
  const dot = (p, col) => { if (!p) return; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ox + p[0] * s, oy + p[1] * s, Math.max(2, s * 0.8), 0, Math.PI * 2); ctx.fill(); };
  dot(L.start, '#39ff88'); dot(L.goal, '#ffd23f');
}
