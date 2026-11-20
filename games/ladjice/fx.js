/* =====================================================================
   POTAPLJANJE LADJIC — učinki: zvok (WebAudio), neon ocean (canvas),
   projektil po loku, pljusk, eksplozija, potop, tresenje, vibracija,
   SVG silhuete ladij. Brez slikovnih in zvočnih datotek.
   ===================================================================== */

import * as S from '../../shared/storage.js';

export const reduced = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------ zvok */

let ac = null, master = null;
let muted = !!S.load('ladjice:mute', false);

export const isMuted = () => muted;
export function setMuted(v) {
  muted = !!v;
  S.save('ladjice:mute', muted);
  if (master) master.gain.value = muted ? 0 : 0.5;
}

/** Ustvari AudioContext ob prvi interakciji. */
export function unlockAudio() {
  try {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  } catch { /* brez zvoka */ }
}

function noiseBuffer(sec = 1) {
  const len = Math.floor(ac.sampleRate * sec);
  const b = ac.createBuffer(1, len, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
let NOISE = null;

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.2, vol = 0.3, delay = 0, a = 0.005 }) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, a, vol, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.3, vol = 0.3, type = 'lowpass', f0 = 1000, f1 = null, q = 1, delay = 0, a = 0.005 }) {
  if (!NOISE) NOISE = noiseBuffer(2);
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = NOISE;
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, a, vol, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random());
  s.stop(t + dur + 0.05);
}

const SOUNDS = {
  shot() { noise({ dur: 0.18, vol: 0.35, type: 'bandpass', f0: 2400, f1: 500, q: 0.8 }); tone({ type: 'triangle', f0: 180, f1: 60, dur: 0.15, vol: 0.25 }); },
  whistle() { tone({ type: 'sine', f0: 1600, f1: 700, dur: 0.38, vol: 0.06 }); },
  splash() { noise({ dur: 0.55, vol: 0.4, type: 'lowpass', f0: 3000, f1: 300, q: 0.6, a: 0.01 }); tone({ type: 'sine', f0: 500, f1: 120, dur: 0.25, vol: 0.08, delay: 0.03 }); },
  hit() { noise({ dur: 0.7, vol: 0.6, type: 'lowpass', f0: 1800, f1: 120, q: 0.9 }); tone({ type: 'sawtooth', f0: 110, f1: 35, dur: 0.5, vol: 0.35 }); },
  sink() {
    noise({ dur: 1.6, vol: 0.55, type: 'lowpass', f0: 900, f1: 60, q: 1.2, a: 0.02 });
    tone({ type: 'sawtooth', f0: 90, f1: 28, dur: 1.4, vol: 0.3 });
    for (let k = 0; k < 7; k++) tone({ type: 'sine', f0: 300 + Math.random() * 500, f1: 900 + Math.random() * 400, dur: 0.07, vol: 0.06, delay: 0.5 + k * 0.13 });
  },
  ping() { tone({ type: 'sine', f0: 1320, dur: 0.9, vol: 0.18, a: 0.002 }); tone({ type: 'sine', f0: 1320, dur: 0.6, vol: 0.05, delay: 0.32 }); },
  emp() {
    const t = ac.currentTime;
    const o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = 70;
    l.frequency.value = 22; lg.gain.value = 40;
    l.connect(lg).connect(o.frequency);
    env(g, t, 0.02, 0.22, 0.9);
    o.connect(g).connect(master);
    o.start(t); l.start(t); o.stop(t + 1); l.stop(t + 1);
    noise({ dur: 0.9, vol: 0.12, type: 'highpass', f0: 4000, q: 0.5 });
  },
  shield() { tone({ type: 'square', f0: 1800, f1: 2600, dur: 0.12, vol: 0.08 }); tone({ type: 'sine', f0: 900, dur: 0.3, vol: 0.12, delay: 0.05 }); },
  crate() { [660, 880, 1100, 1320].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.12, vol: 0.12, delay: i * 0.07 })); },
  decoy() { tone({ type: 'square', f0: 500, f1: 180, dur: 0.35, vol: 0.1 }); noise({ dur: 0.2, vol: 0.2, type: 'highpass', f0: 2500 }); },
  click() { tone({ type: 'square', f0: 700, dur: 0.04, vol: 0.05 }); },
  turn() { tone({ type: 'sine', f0: 880, dur: 0.12, vol: 0.12 }); tone({ type: 'sine', f0: 1320, dur: 0.18, vol: 0.12, delay: 0.1 }); },
  tick() { tone({ type: 'square', f0: 1000, dur: 0.03, vol: 0.04 }); },
  torpedo() { noise({ dur: 0.8, vol: 0.25, type: 'bandpass', f0: 400, f1: 1600, q: 3 }); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.25, vol: 0.14, delay: i * 0.1 })); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.3, vol: 0.12, delay: i * 0.15 })); },
  meteor() { tone({ type: 'sine', f0: 2200, f1: 200, dur: 0.7, vol: 0.12 }); },
  pop() { tone({ type: 'sine', f0: 400, f1: 900, dur: 0.08, vol: 0.12 }); },
};

/** Predvajaj zvok (tiho, če ni AudioContexta ali je utišano). */
export function sfx(name) {
  if (muted || !ac || ac.state !== 'running') return;
  try { SOUNDS[name]?.(); } catch { /* ignore */ }
}

let tapped = false;
try {
  addEventListener('pointerdown', e => { if (e.isTrusted) tapped = true; }, { capture: true });
} catch { /* ignore */ }

/** Vibracija na telefonu (le po pravem dotiku, sicer jo brskalnik blokira z napako v konzoli). */
export function vibrate(p) {
  try {
    if (tapped && matchMedia('(pointer: coarse)').matches) navigator.vibrate?.(p);
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------ ocean */

/** Neon ocean v ozadju: lahki sinusni valovi na canvasu (~30 fps, ustavi se v ozadju). */
export function startOcean(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, raf = 0, last = 0;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => {
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  };
  const layers = Array.from({ length: 7 }, (_, i) => ({ y: 0.35 + i * 0.1, amp: 6 + i * 2.5, len: 160 + i * 40, sp: 0.00025 + i * 0.00006, a: 0.05 + i * 0.018 }));
  function draw(t) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#04071a'); g.addColorStop(0.55, '#06143a'); g.addColorStop(1, '#041a33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (const L of layers) {
      ctx.beginPath();
      const y0 = L.y * h;
      for (let x = 0; x <= w + 8; x += 8) {
        const y = y0 + Math.sin(x / L.len * Math.PI * 2 + t * L.sp * 6) * L.amp + Math.sin(x / (L.len * 0.37) + t * L.sp * 9) * L.amp * 0.35;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(77,225,255,${L.a})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
  const loop = t => {
    raf = requestAnimationFrame(loop);
    if (t - last < 33) return;
    last = t;
    draw(t);
  };
  window.addEventListener('resize', resize);
  resize();
  if (!reduced()) raf = requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && !reduced()) raf = requestAnimationFrame(loop);
  });
}

/* ------------------------------------------------------------ ladje (SVG) */

/**
 * Vektorska silhueta ladje dolžine len (vodoravno ali navpično).
 * @returns {string} <svg>
 */
export function shipSvg(len, vertical = false, { cls = '' } = {}) {
  const U = 20, L = len * U;
  const P = (u, v) => (vertical ? `${v},${u}` : `${u},${v}`);
  const hull = [P(3, 3), P(L - 10, 2.5), P(L - 1, 10), P(L - 10, 17.5), P(3, 17), P(1, 10)].join(' ');
  const deck = [P(6, 6.5), P(L - 12, 6.5), P(L - 7, 10), P(L - 12, 13.5), P(6, 13.5)].join(' ');
  const cab = len >= 3 ? (() => {
    const u0 = L * 0.32, u1 = L * 0.32 + Math.min(18, L * 0.22);
    return `<polygon class="lj-ship__cab" points="${[P(u0, 5.5), P(u1, 5.5), P(u1, 14.5), P(u0, 14.5)].join(' ')}"/>`;
  })() : '';
  const guns = [];
  for (let k = 0; k < len - 1; k++) {
    const u = U * (k + 1) - (k === 0 ? 4 : 0);
    if (len >= 3 && u > L * 0.3 && u < L * 0.56) continue;
    const [cx, cy] = vertical ? [10, u] : [u, 10];
    guns.push(`<circle class="lj-ship__gun" cx="${cx}" cy="${cy}" r="2.8"/>`);
  }
  const vb = vertical ? `0 0 20 ${L}` : `0 0 ${L} 20`;
  return `<svg class="lj-ship ${cls}" viewBox="${vb}" preserveAspectRatio="none" aria-hidden="true">
    <polygon class="lj-ship__hull" points="${hull}"/>
    <polygon class="lj-ship__deck" points="${deck}"/>${cab}${guns.join('')}</svg>`;
}

/* ------------------------------------------------------------ animacije */

let layer = null;
function fxLayer() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'lj-fxlayer';
    document.body.appendChild(layer);
  }
  return layer;
}

/** Počakaj na konec animacije, a največ dur + 250 ms (zavihek v ozadju ne riše). */
function settle(anim, dur) {
  return Promise.race([anim.finished.catch(() => {}), sleep(dur + 250)]);
}

const center = el => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
};

/**
 * Projektil po loku od točke do elementa.
 * @param {{x:number,y:number}} from
 * @param {HTMLElement} toEl
 */
export async function projectile(from, toEl, { color = '#ffd23f', dur = 420, kind = 'shell' } = {}) {
  if (!toEl) return;
  if (reduced()) return;
  const to = center(toEl);
  const el = document.createElement('i');
  el.className = 'lj-proj lj-proj--' + kind;
  el.style.setProperty('--pc', color);
  fxLayer().appendChild(el);
  const dx = to.x - from.x, dy = to.y - from.y;
  const lift = Math.min(160, 50 + Math.hypot(dx, dy) * 0.35);
  const frames = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const x = from.x + dx * t, y = from.y + dy * t - Math.sin(Math.PI * t) * lift;
    frames.push({ transform: `translate(${x}px, ${y}px) scale(${1 + Math.sin(Math.PI * t) * 0.6})`, offset: t });
  }
  await settle(el.animate(frames, { duration: dur, easing: 'linear', fill: 'forwards' }), dur);
  el.remove();
}

/** Ravna pot (torpedo) prek seznama celic. */
export async function torpedoRun(cells, { dur = 600 } = {}) {
  if (!cells.length || reduced()) return;
  const a = center(cells[0]), b = center(cells[cells.length - 1]);
  const el = document.createElement('i');
  el.className = 'lj-proj lj-proj--torpedo';
  fxLayer().appendChild(el);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const d = Math.max(250, dur * cells.length / 8);
  await settle(el.animate([
      { transform: `translate(${a.x}px, ${a.y}px) rotate(${ang}rad)` },
      { transform: `translate(${b.x}px, ${b.y}px) rotate(${ang}rad)` },
    ], { duration: d, easing: 'ease-in', fill: 'forwards' }), d);
  el.remove();
}

/** Učinek v celici (pljusk, eksplozija, iskre, dim …). */
export function burst(cellEl, kind) {
  if (!cellEl) return;
  const c = center(cellEl);
  const el = document.createElement('div');
  el.className = 'lj-burst lj-burst--' + kind;
  el.style.left = c.x + 'px';
  el.style.top = c.y + 'px';
  el.style.setProperty('--s', Math.max(18, c.w) + 'px');
  if (!reduced() && (kind === 'hit' || kind === 'sink')) {
    let html = '<b></b>';
    const n = kind === 'sink' ? 16 : 10;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = (kind === 'sink' ? 40 : 26) + Math.random() * 24;
      html += `<i style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px"></i>`;
    }
    el.innerHTML = html;
  } else if (kind === 'miss') {
    el.innerHTML = '<span></span><span></span><span></span>';
  } else if (kind === 'label') {
    el.innerHTML = '';
  }
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), reduced() ? 400 : 1300);
}

/** Lebeč napis nad celico/elementom. */
export function floatText(el, text, cls = '') {
  if (!el) return;
  const c = center(el);
  const t = document.createElement('div');
  t.className = 'lj-float ' + cls;
  t.textContent = text;
  t.style.left = c.x + 'px';
  t.style.top = c.y + 'px';
  fxLayer().appendChild(t);
  setTimeout(() => t.remove(), 1500);
}

/** Tresenje elementa. */
export function shake(el, strong = false) {
  if (!el || reduced()) return;
  el.classList.remove('lj-shake', 'lj-shake--big');
  void el.offsetWidth;
  el.classList.add(strong ? 'lj-shake--big' : 'lj-shake');
  setTimeout(() => el.classList.remove('lj-shake', 'lj-shake--big'), 600);
}

export { sleep };
