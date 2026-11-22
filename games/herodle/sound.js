/* =====================================================================
   HERODLE — kratki sintetizirani efekti (WebAudio, brez datotek).
   tick (flip celice) · whoosh (napačen poskus) · fanfare (zmaga) · ding (bonus ⭐) · buzz (napaka)
   ===================================================================== */
import * as S from '../../shared/storage.js';

const KEY = 'herodle:mute';
let ctx = null, master = null;
let muted = !!S.load(KEY, false);

function ac() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

/** Odkleni zvok ob prvi interakciji (iOS/Chrome). */
export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
export const isMuted = () => muted;
export function setMuted(v) { muted = !!v; S.save(KEY, muted); }
const off = () => muted || !ac() || ctx.state !== 'running';

function tone(freq, t, dur, { type = 'sine', vol = 0.3, slide = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(t, dur, { vol = 0.25, from = 3000, to = 300 } = {}) {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + dur);
}

/** »tik« pri obratu celice (color: 'g' | 'y' | 'r' — rahlo drugačna višina). */
export function tick(color = 'r') {
  if (off()) return;
  const t = ctx.currentTime;
  tone(color === 'g' ? 1320 : color === 'y' ? 990 : 740, t, 0.05, { type: 'square', vol: 0.07 });
}
export function whoosh() {
  if (off()) return;
  noise(ctx.currentTime, 0.35, { vol: 0.18, from: 2400, to: 250 });
}
export function fanfare() {
  if (off()) return;
  const t = ctx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, 0.22, { type: 'triangle', vol: 0.28 }));
  tone(1047, t + 0.48, 0.6, { type: 'triangle', vol: 0.3 });
  tone(1319, t + 0.48, 0.6, { type: 'sine', vol: 0.16 });
  noise(t, 0.25, { vol: 0.12, from: 6000, to: 1500 });
}
export function ding() {
  if (off()) return;
  const t = ctx.currentTime;
  tone(1568, t, 0.5, { vol: 0.22 });
  tone(2093, t + 0.06, 0.45, { vol: 0.14 });
}
export function buzz() {
  if (off()) return;
  tone(140, ctx.currentTime, 0.22, { type: 'sawtooth', vol: 0.12, slide: -40 });
}
