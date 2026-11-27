/* =====================================================================
   DMD — barvni »dot matrix« zaslon 128 × 32 z animacijami
   Lastna bitna pisava 5×7 (s Č Š Ž), izris pik z masko in sijem.
   ===================================================================== */
import { DEFAULT_PAL, fmt } from '../config.js';

let PAL = DEFAULT_PAL;

export const DW = 128, DH = 32;

/* ---------------- pisava 5×7 ---------------- */
const G = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111', 3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
  '.': '00000 00000 00000 00000 00000 01100 01100', ',': '00000 00000 00000 00000 01100 00100 01000',
  ':': '00000 01100 01100 00000 01100 01100 00000', '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00010 00100 00000 00100', '-': '00000 00000 00000 11111 00000 00000 00000',
  '+': '00000 00100 00100 11111 00100 00100 00000', '/': '00000 00001 00010 00100 01000 10000 00000',
  '×': '00000 10001 01010 00100 01010 10001 00000', '%': '11000 11001 00010 00100 01000 10011 00011',
  "'": '00100 00100 01000 00000 00000 00000 00000', '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000', '>': '01000 00100 00010 00001 00010 00100 01000',
  '<': '00010 00100 01000 10000 01000 00100 00010', '$': '00100 01111 10100 01110 00101 11110 00100',
  '#': '01010 01010 11111 01010 11111 01010 01010', '=': '00000 00000 11111 00000 11111 00000 00000',
  '_': '00000 00000 00000 00000 00000 00000 11111', '"': '01010 01010 00000 00000 00000 00000 00000',
  '✓': '00000 00001 00010 10100 01000 00000 00000', '✗': '00000 10001 01010 00100 01010 10001 00000',
  '·': '00000 00000 00000 00100 00000 00000 00000', '*': '00000 00100 10101 01110 10101 00100 00000',
  '°': '01100 10010 10010 01100 00000 00000 00000', '→': '00000 00100 00010 11111 00010 00100 00000',
  '[': '01110 01000 01000 01000 01000 01000 01110', ']': '01110 00010 00010 00010 00010 00010 01110',
  '{': '00110 00100 00100 01000 00100 00100 00110', '}': '01100 00100 00100 00010 00100 00100 01100',
  ';': '00000 01100 01100 00000 01100 00100 01000', '@': '01110 10001 10111 10101 10111 10000 01110',
  '|': '00100 00100 00100 00100 00100 00100 00100', '♥': '01010 11111 11111 11111 01110 00100 00000', '&': '01100 10010 10100 01000 10101 10010 01101',
  ' ': '00000 00000 00000 00000 00000 00000 00000',
};
const FONT = {};
for (const [ch, s] of Object.entries(G)) FONT[ch] = s.split(' ').map(r => parseInt(r, 2));
const CARON = { 'Č': 'C', 'Š': 'S', 'Ž': 'Z' };
const ACC = { 'Ć': 'C', 'Đ': 'D', 'É': 'E', 'Ä': 'A', 'Ö': 'O', 'Ü': 'U' };

export function textWidth(s, scale = 1) {
  return Math.max(0, String(s).length * 6 * scale - scale);
}

/* ---------------- DMD ---------------- */
export class DMD {
  /**
   * opts (iz tables/<id>/view.js → dmd): title { big, small, ver, sub }, bootLines, bonusTitle, facts,
   * logo(w, h) → bitna slika ali null, logoText, attractExtra(dmd, t, per, game), footer [vrstica1, vrstica2]
   */
  constructor(canvas, glow, opts = {}, pal) {
    this.canvas = canvas; this.glow = glow;
    this.o = opts;
    if (pal) PAL = pal;
    this.ctx = canvas.getContext('2d');
    this.gctx = glow ? glow.getContext('2d') : null;
    this.low = document.createElement('canvas'); this.low.width = DW; this.low.height = DH;
    this.lctx = this.low.getContext('2d');
    this.img = this.lctx.createImageData(DW, DH);
    this.buf = new Float32Array(DW * DH * 3);
    this.queue = []; this.cur = null;
    this.t = 0;
    this.attractT = 0;
    this.scores = []; this.stats = null;
    this.dispScore = 0;
    this.bonus = null;
    this.sparks = [];
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(DW * 2, Math.round(r.width * dpr)), h = Math.round(w * DH / DW);
    this.canvas.width = w; this.canvas.height = h;
    if (this.glow) { this.glow.width = DW * 2; this.glow.height = DH * 2; }
    // maska pik
    const m = document.createElement('canvas'); m.width = w; m.height = h;
    const g = m.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    const px = w / DW, rr = px * 0.42;
    for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
      g.beginPath(); g.arc((x + 0.5) * px, (y + 0.5) * (h / DH), rr, 0, Math.PI * 2); g.fill();
    }
    this.mask = m;
  }

  /* ---------------- primitivi ---------------- */
  clear() { this.buf.fill(0); }
  px(x, y, c, a = 1) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= DW || y >= DH) return;
    const i = (y * DW + x) * 3, b = this.buf;
    b[i] = Math.max(b[i], c[0] * a); b[i + 1] = Math.max(b[i + 1], c[1] * a); b[i + 2] = Math.max(b[i + 2], c[2] * a);
  }
  rect(x, y, w, h, c, a = 1) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a); }
  frame(x, y, w, h, c, a = 1) { for (let i = 0; i < w; i++) { this.px(x + i, y, c, a); this.px(x + i, y + h - 1, c, a); } for (let j = 0; j < h; j++) { this.px(x, y + j, c, a); this.px(x + w - 1, y + j, c, a); } }
  circle(cx, cy, r, c, a = 1, fill = false) {
    for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y);
      if (fill ? d <= r : Math.abs(d - r) < 0.6) this.px(cx + x, cy + y, c, a);
    }
  }
  glyph(ch, x, y, s, c, a) {
    let rows = FONT[ch], car = false;
    if (!rows && CARON[ch]) { rows = FONT[CARON[ch]]; car = true; }
    if (!rows && ACC[ch]) rows = FONT[ACC[ch]];
    if (!rows) rows = FONT['?'];
    for (let r = 0; r < 7; r++) {
      const bits = rows[r];
      for (let k = 0; k < 5; k++) if (bits & (16 >> k)) this.rect(x + k * s, y + r * s, s, s, c, a);
    }
    if (car) { this.rect(x + 1 * s, y - 2 * s, s, s, c, a); this.rect(x + 3 * s, y - 2 * s, s, s, c, a); this.rect(x + 2 * s, y - 1 * s, s, s, c, a); }
  }
  text(str, x, y, o = {}) {
    const s = o.scale || 1, c = o.color || [1, 0.55, 0.15], a = o.alpha ?? 1;
    str = String(str).toUpperCase();
    const w = textWidth(str, s);
    let x0 = o.align === 'center' ? Math.round(x - w / 2) : o.align === 'right' ? x - w : x;
    for (const ch of str) { this.glyph(ch, x0, y, s, c, a); x0 += 6 * s; }
    return w;
  }
  /** besedilo s samodejno velikostjo (2× če paše) */
  title(str, y, c, a = 1) {
    const s = textWidth(String(str).toUpperCase(), 2) <= DW - 2 ? 2 : 1;
    this.fit(str, s === 2 ? y : y + 3, { scale: s, color: c, alpha: a });
    return s;
  }
  /** sredinsko besedilo; če je predolgo, drsi (marquee) */
  fit(str, y, o = {}, t) {
    const tt = t ?? (this.cur ? this.cur.t : this.t);
    const s = o.scale || 1, w = textWidth(String(str).toUpperCase(), s);
    if (w <= DW - 2) return this.text(str, DW / 2, y, Object.assign({}, o, { align: 'center' }));
    const span = w - (DW - 4), speed = 34;
    const cyc = span / speed + 1.8;
    const ph = Math.max(0, tt - 0.5) % cyc;
    const off = Math.min(span, Math.max(0, ph - 0.9) * speed);
    return this.text(str, 2 - Math.round(off), y, Object.assign({}, o, { align: 'left' }));
  }

  /* ---------------- sporočila ---------------- */
  show(m) {
    if (m.small && this.cur && !this.cur.small && this.cur.t < this.cur.dur * 0.7) return;
    const msg = Object.assign({ t: 0, dur: 2 }, m);
    msg.col = hex(m.color || PAL.melt);
    if (!m.small) { this.queue = this.queue.filter(q => !q.small); }
    if (this.cur && !this.cur.small && !m.small && this.cur.t < 0.5) this.queue.push(msg);
    else { this.cur = msg; }
    if (this.queue.length > 3) this.queue.shift();
  }
  showBonus(d) { this.bonus = Object.assign({ t: 0 }, d); this.cur = null; this.queue = []; }

  /* ---------------- izris ---------------- */
  render(dt, game, ui) {
    this.t += dt;
    const s = game.summary();
    this.dispScore += (s.score - this.dispScore) * Math.min(1, dt * 8);
    if (Math.abs(s.score - this.dispScore) < 10) this.dispScore = s.score;
    this.clear();
    if (this.cur) {
      this.cur.t += dt;
      if (this.cur.t > this.cur.dur) this.cur = this.queue.shift() || null;
    }
    if (ui && ui.dmdOverride) ui.dmdOverride(this, dt);
    else if (this.bonus && game.state === 'bonus') this.drawBonus(dt);
    else if (game.state === 'attract' || game.state === 'over' && !this.cur) this.drawAttract(dt, game);
    else if (this.cur) this.drawMsg(this.cur, game);
    else this.drawScore(game, s);
    this.present();
  }

  drawScore(game, s) {
    const C = hex(PAL.melt), cyan = hex(PAL.cyan), dim = [0.45, 0.3, 0.15];
    if (s.mode) {
      const m = s.mode, mc = hex(m.color);
      this.text(m.name, 2, 1, { color: mc });
      const t = Math.ceil(m.t);
      this.text(t + 'S', DW - 2, 1, { color: t <= 5 && Math.floor(this.t * 4) % 2 ? [1, 0.2, 0.2] : mc, align: 'right' });
      this.text(fmt(this.dispScore), DW / 2, 10, { scale: 2, color: C, align: 'center' });
      const info = m.info ?? (m.goal ? m.prog + ' / ' + m.goal : '');
      this.fit(info, 25, { color: mc, align: 'center' });
      const w = Math.round((DW - 4) * m.t / m.total);
      this.rect(2, 9, w, 1, mc, 0.8);
      return;
    }
    const sc = fmt(this.dispScore);
    const big = textWidth(sc, 2) <= DW - 4;
    this.text(sc, DW / 2, big ? 7 : 10, { scale: big ? 2 : 1, color: C, align: 'center' });
    this.text('ŽOGA ' + s.ball + '/' + s.balls, 2, 25, { color: dim });
    const idle = game.rules && game.rules.dmdIdle(s);
    let right = idle ? idle.text : '';
    if (!idle) {
      if (s.multiball) right = 'MULTIBALL';
      else if (s.combo >= 2) right = 'COMBO ×' + s.combo;
      else if (s.mult > 1) right = 'BONUS ×' + s.mult;
    }
    if (right) this.text(right, DW - 2, 25, { color: (idle ? idle.gold : s.multiball) ? hex(PAL.gold) : cyan, align: 'right' });
    if (s.ballSave > 0 && Math.floor(this.t * 3) % 2) this.text('SAVE', DW / 2, 25, { color: cyan, align: 'center' });
    if (s.tiltWarn && !s.tilted) this.text('POZOR', DW / 2, 0, { color: [1, 0.2, 0.2], align: 'center' });
    // waiting for plunger
    if (s.skillArmed) {
      if (Math.floor(this.t * 2) % 2) this.text('SKILL SHOT', DW / 2, 0, { color: [1, 1, 1], align: 'center' });
    }
  }

  drawMsg(m, game) {
    const k = m.t / m.dur, c = m.col, t = m.t;
    switch (m.anim) {
      case 'zoom': {
        const s = t < 0.25 ? 3 : 2;
        const a = Math.min(1, t * 8);
        if (textWidth(m.text, s) <= DW) this.text(m.text, DW / 2, s === 3 ? 3 : 4, { scale: s, color: c, align: 'center', alpha: a });
        else this.title(m.text, 4, c, a);
        if (m.sub) this.fit(m.sub, 24, { color: [0.9, 0.9, 0.9], align: 'center', alpha: Math.min(1, t * 3) });
        if (t < 0.15) this.rect(0, 0, DW, DH, c, 0.35);
        break;
      }
      case 'jackpot': {
        // zlati žarki + iskre
        for (let i = 0; i < 16; i++) {
          const a = i / 16 * Math.PI * 2 + t * 1.5;
          for (let r = 6; r < 70; r += 2) {
            const x = DW / 2 + Math.cos(a) * r * 1.8, y = DH / 2 + Math.sin(a) * r * 0.5;
            this.px(x, y, c, 0.18);
          }
        }
        const flash = Math.floor(t * 10) % 2 ? 1 : 0.65;
        const s = this.title(m.text, 2, c, flash);
        const val = m.sub;
        this.fit(val, s === 2 ? 22 : 20, { color: [1, 1, 1], align: 'center' });
        this.spark(c, 2);
        break;
      }
      case 'multiball': {
        for (let i = 0; i < 3; i++) {
          const ph = (t * 1.6 + i * 0.33) % 1;
          const y = 4 + Math.abs(Math.sin(ph * Math.PI)) * -0 + (1 - Math.abs(Math.cos(ph * Math.PI))) * 18;
          this.circle(18 + i * 46, Math.round(26 - y * 0.9), 3, [0.85, 0.9, 1], 1, true);
        }
        this.title(m.text, 2, c, Math.floor(t * 8) % 2 ? 1 : 0.6);
        if (t > 1.2) this.fit(m.sub, 24, { color: [1, 1, 1], align: 'center' });
        break;
      }
      case 'terminal': {
        const g = hex(PAL.code);
        const lines = (m.lines && m.lines.length) ? m.lines : ['$ ' + m.text.toLowerCase()];
        const cps = 28;
        let chars = Math.floor(t * cps);
        const total = lines.join('').length;
        if (chars < total + 6) {
          let y = 1;
          for (const ln of lines.slice(-3)) {
            const shown = ln.slice(0, Math.max(0, chars));
            this.text(shown, 1, y, { color: g });
            chars -= ln.length;
            if (chars < 0) { if (Math.floor(t * 6) % 2) this.rect(1 + textWidth(shown) + 2, y, 5, 7, g); break; }
            y += 10;
          }
        } else {
          this.title(m.text, 2, c);
          if (m.sub) this.fit(m.sub, 24, { color: g, align: 'center' });
        }
        break;
      }
      case 'roll': {
        // valjanje pločevine: dva valja, trak se tanjša
        const rx = 46, r1 = 9;
        for (const cy of [7, 25]) {
          this.circle(rx, cy, r1 - 3, [0.6, 0.75, 0.9]);
          for (let s = 0; s < 4; s++) {
            const a = t * 6 * (cy < 16 ? 1 : -1) + s * Math.PI / 2;
            this.px(rx + Math.cos(a) * 4, cy + Math.sin(a) * 4, [0.9, 0.95, 1]);
          }
        }
        // trak
        for (let x = 0; x < DW; x++) {
          const th = x < rx ? 6 : 2;
          const off = (x + t * 40) % 8 < 1 ? 0.5 : 1;
          this.rect(x, 16 - th / 2, 1, th, [0.75 * off, 0.85 * off, 1 * off], x < rx ? 0.6 : 1);
        }
        if (t > 1.0) {
          this.rect(64, 0, 64, DH, [0, 0, 0], 0);
          this.text(m.text, 96, 2, { color: c, align: 'center' });
          if (m.sub && m.goal) this.text(m.goal + ' M', 96, 24, { color: [1, 1, 1], align: 'center' });
        }
        break;
      }
      case 'melt': {
        // ogenj peči
        for (let x = 0; x < DW; x++) {
          const h = 6 + Math.sin(x * 0.4 + t * 9) * 3 + Math.sin(x * 0.13 - t * 5) * 4 + (k * 10);
          for (let y = 0; y < h; y++) {
            const v = 1 - y / h;
            this.px(x, DH - 1 - y, [1, 0.25 + 0.6 * v * v, 0.05 * v], 0.35 + 0.65 * v);
          }
        }
        this.title(m.text, 2, [1, 0.95, 0.8]);
        if (t > 0.8 && m.sub) this.text('BUMPERJI!', DW / 2, 21, { color: [1, 1, 1], align: 'center' });
        break;
      }
      case 'wizard': {
        const RB = [PAL.red, PAL.melt, PAL.gold, PAL.code, PAL.cyan, PAL.magenta].map(hex);
        for (let x = 0; x < DW; x++) {
          const ci = Math.floor((x / 10 + t * 8)) % RB.length;
          this.px(x, 0, RB[ci]); this.px(x, DH - 1, RB[(ci + 3) % RB.length]);
        }
        this.spark(hex(PAL.gold), 3);
        const words = String(m.text).split(' '), half = Math.ceil(words.length / 2);
        const s = this.title(words.length > 1 ? (t < 2 ? words.slice(0, half).join(' ') : words.slice(half).join(' ')) : m.text, 4, RB[Math.floor(t * 6) % RB.length]);
        this.fit(m.sub, 23, { color: [1, 1, 1], align: 'center' });
        break;
      }
      case 'match': {
        // match: vrtenje številk, nato rezultat
        const spin = t < 1.6, n = spin ? Math.floor(t * 20) % 10 * 10 : m.num;
        this.text('MATCH', 2, 2, { color: c });
        this.text(String(n).padStart(2, '0'), DW - 30, 8, { scale: 2, color: [1, 1, 1], align: 'center' });
        this.text(String(m.last).padStart(2, '0'), 30, 14, { color: [0.7, 0.7, 0.7], align: 'center' });
        if (!spin) this.text(m.hit ? 'MATCH!' : '', DW / 2, 24, { color: hex(PAL.gold), align: 'center', alpha: Math.floor(t * 4) % 2 ? 1 : 0.4 });
        break;
      }
      case 'tilt': {
        const on = Math.floor(t * 5) % 2;
        this.text('TILT', DW / 2, 4, { scale: 3, color: [1, 0.15, 0.15], align: 'center', alpha: on ? 1 : 0.3 });
        break;
      }
      default: {
        const a = Math.min(1, t * 10, (m.dur - t) * 5);
        const s = this.title(m.text, m.sub ? 3 : 9, c, a);
        if (m.sub) this.fit(m.sub, s === 2 ? 22 : 20, { color: [0.95, 0.95, 0.95], align: 'center', alpha: a });
      }
    }
  }

  spark(c, n) {
    for (let i = 0; i < n; i++) this.sparks.push({ x: Math.random() * DW, y: Math.random() * DH, t: 0 });
    for (const s of this.sparks) { s.t += 0.05; this.px(s.x, s.y, [1, 1, 1], 1 - s.t); this.px(s.x + 1, s.y, c, (1 - s.t) * 0.6); this.px(s.x - 1, s.y, c, (1 - s.t) * 0.6); this.px(s.x, s.y + 1, c, (1 - s.t) * 0.6); this.px(s.x, s.y - 1, c, (1 - s.t) * 0.6); }
    this.sparks = this.sparks.filter(s => s.t < 1);
  }

  drawBonus(dt) {
    const b = this.bonus;
    b.t += dt;
    const C = hex(PAL.melt);
    if (b.tilted) {
      this.text('TILT', DW / 2, 2, { scale: 2, color: [1, 0.2, 0.2], align: 'center' });
      this.text('BREZ BONUSA', DW / 2, 22, { color: [1, 1, 1], align: 'center' });
      return;
    }
    const k = Math.min(1, b.t / 1.8);
    this.text(this.o.bonusTitle || 'BONUS', DW / 2, 0, { color: hex(PAL.cyan), align: 'center' });
    this.text(fmt(b.base * k) + ' × ' + b.mult, DW / 2, 10, { color: [1, 1, 1], align: 'center' });
    if (b.t > 1.9) this.text(fmt(b.bonus), DW / 2, 19, { scale: textWidth(fmt(b.bonus), 2) < DW ? 2 : 1, color: C, align: 'center' });
  }

  drawAttract(dt, game) {
    this.attractT += dt;
    const pages = 9, per = 3.2;
    const p = Math.floor(this.attractT / per) % pages, t = this.attractT % per;
    const C = hex(PAL.melt), cy = hex(PAL.cyan), gr = hex(PAL.code), gold = hex(PAL.gold);
    switch (p) {
      case 0: {
        // logotip z lesketom
        const sweep = (t * 70) % 200 - 30;
        const TT = Object.assign({ big: 'PIN', small: 'BALL', ver: '', sub: '' }, this.o.title || {});
        this.text(TT.big, 22, 3, { scale: 3, color: C });
        this.text(TT.small, 82, 5, { color: cy, align: 'center' });
        this.text(TT.ver, 82, 16, { scale: 1, color: [1, 1, 1], align: 'center' });
        for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
          if (Math.abs(x - sweep + y * 0.6) < 3) { const i = (y * DW + x) * 3; if (this.buf[i] + this.buf[i + 1] > 0.3) this.px(x, y, [1, 1, 1], 1); }
        }
        this.text(TT.sub, 82, 25, { color: gr, align: 'center' });
        break;
      }
      case 1: {
        const s = this.scores;
        this.text('REKORDI', DW / 2, 0, { color: gold, align: 'center' });
        if (!s.length) { this.text('BODI PRVI!', DW / 2, 14, { color: [1, 1, 1], align: 'center' }); break; }
        const pages = Math.ceil(Math.min(10, s.length) / 2);
        const off = (Math.floor(t / 1.1) % pages) * 2;
        for (let i = 0; i < 2; i++) {
          const n = off + i + 1, e = s[off + i];
          if (!e) continue;
          this.text(n + '. ' + String(e.name).slice(0, 10), 2, 11 + i * 10, { color: n === 1 ? gold : cy });
          this.text(fmt(e.score), DW - 2, 11 + i * 10, { color: C, align: 'right' });
        }
        break;
      }
      case 2: {
        const lines = this.o.bootLines || ['$ ./pinball --start', '> nalagam mizo...', '> pritisni START'];
        let chars = Math.floor(t * 24), y = 1;
        for (const ln of lines) {
          const sh = ln.slice(0, Math.max(0, chars));
          this.text(sh, 1, y, { color: gr });
          chars -= ln.length; if (chars < 0) break; y += 10;
        }
        break;
      }
      case 3: {
        this.text('PRITISNI', DW / 2, 2, { scale: 1, color: [1, 1, 1], align: 'center' });
        this.text('START', DW / 2, 12, { scale: 2, color: Math.floor(t * 3) % 2 ? C : gold, align: 'center' });
        break;
      }
      case 4: {
        const st = this.stats;
        this.text('STATISTIKA', DW / 2, 0, { color: cy, align: 'center' });
        if (st) {
          this.text('IGER ' + st.games, 2, 11, { color: C });
          this.text('COMBO ' + st.maxCombo, DW - 2, 11, { color: C, align: 'right' });
          this.text('JACKPOT ' + fmt(st.maxJackpot), DW / 2, 22, { color: gold, align: 'center' });
        }
        break;
      }
      case 5: {
        if (this.o.attractExtra) this.o.attractExtra(this, t, per, game);
        else this.text('NAJBOLJŠI ' + fmt(this.scores[0] ? this.scores[0].score : 0), DW / 2, 12, { color: gold, align: 'center' });
        break;
      }
      case 6: {
        // logotip Impol (če je naložen) z lesketom
        const bw = 96, bh = 30, bmp = this.o.logo ? this.o.logo(bw, bh) : null;
        if (!bmp) { this.text(this.o.logoText || 'PINBALL', DW / 2, 9, { scale: 2, color: cy, align: 'center' }); break; }
        const x0 = (DW - bw) >> 1, y0 = 1, sweep = (t * 60) % 170 - 30, blue = [0.3, 0.62, 1];
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
          const v = bmp[y * bw + x];
          if (v < 0.35) continue;
          const shine = Math.abs(x - sweep + y * 0.6) < 3;
          this.px(x0 + x, y0 + y, shine ? [1, 1, 1] : blue, Math.min(1, v * 1.2));
        }
        break;
      }
      case 7: {
        const FACTS = this.o.facts && this.o.facts.length ? this.o.facts : [['PINBALL', 'MOTOR']];
        const f = FACTS[Math.floor(this.attractT / (per * pages)) % FACTS.length];
        this.fit(f[0], 4, { color: cy, align: 'center' });
        this.fit(f[1], 17, { color: C, align: 'center' });
        break;
      }
      default: {
        const ft = this.o.footer || ['NEURADNA IGRA', 'ZA HEC'];
        this.text(ft[0], DW / 2, 4, { color: [0.9, 0.9, 0.9], align: 'center' });
        this.text(ft[1], DW / 2, 15, { scale: 1, color: C, align: 'center' });
        this.text('♥', DW / 2, 24, { color: [1, 0.3, 0.4], align: 'center' });
      }
    }
  }

  present() {
    const d = this.img.data, b = this.buf;
    for (let i = 0, j = 0; i < DW * DH; i++, j += 3) {
      // kvantizacija na 8 nivojev + temne neprižgane pike
      const q = v => Math.round(Math.min(1, v) * 7) / 7;
      d[i * 4] = 14 + q(b[j]) * 241;
      d[i * 4 + 1] = 9 + q(b[j + 1]) * 246;
      d[i * 4 + 2] = 6 + q(b[j + 2]) * 249;
      d[i * 4 + 3] = 255;
    }
    this.lctx.putImageData(this.img, 0, 0);
    const g = this.ctx, w = this.canvas.width, h = this.canvas.height;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.low, 0, 0, w, h);
    g.drawImage(this.mask, 0, 0);
    if (this.gctx) {
      this.gctx.imageSmoothingEnabled = true;
      this.gctx.clearRect(0, 0, this.glow.width, this.glow.height);
      this.gctx.drawImage(this.low, 0, 0, this.glow.width, this.glow.height);
    }
  }
}

function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
