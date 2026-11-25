/* =====================================================================
   USTAVI URO — zvok (WebAudio sinteza, brez datotek).
   Tiktak (lesen klik), klik ob STOP, pisk ob startu, zvoki ocen.
   Utišanje in tiktak se zapomnita prek shared/storage.js.
   ===================================================================== */
import * as S from '../../shared/storage.js';

let ctx = null;
let master = null;
let muted = !!S.load('ustavi-uro:mute', false);
let tickOn = S.load('ustavi-uro:tick', true) !== false;

function ac() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  } catch (e) {
    console.warn('WebAudio:', e.message);
    ctx = null;
  }
  return ctx;
}

/** Odkleni zvok ob uporabnikovi interakciji (iOS/Chrome). */
export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export const isMuted = () => muted;
export function setMuted(v) { muted = !!v; S.save('ustavi-uro:mute', muted); }
export const isTickOn = () => tickOn;
export function setTickOn(v) { tickOn = !!v; S.save('ustavi-uro:tick', tickOn); }
const quiet = () => muted || !ac() || ctx.state !== 'running';

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function osc(type, freq, t, dur, peak, { to = null, attack = 0.004 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, attack, peak, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + attack + dur + 0.02);
}

/** Kratek šum (za lesen klik). */
function noise(t, dur, freq, peak) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 6;
  const g = ctx.createGain();
  g.gain.value = peak;
  src.connect(bp).connect(g).connect(master);
  src.start(t);
}

/** Tiktak: izmenično »tik« (višji) in »tak«. */
export function tick(odd = false) {
  if (quiet()) return;
  const t = ctx.currentTime + 0.002;
  noise(t, 0.03, odd ? 2600 : 3400, 0.9);
  osc('sine', odd ? 1400 : 1800, t, 0.03, 0.08);
}

/** Klik ob STOP: odločen mehanski »klak«. */
export function stopClick() {
  if (quiet()) return;
  const t = ctx.currentTime + 0.001;
  noise(t, 0.05, 1800, 1.2);
  osc('square', 220, t, 0.06, 0.12, { to: 110 });
}

/** Pisk ob startu. */
export function startBeep() {
  if (quiet()) return;
  osc('sine', 1320, ctx.currentTime + 0.002, 0.14, 0.25);
}

/** Zvok ocene kroga. */
export function gradeSound(key) {
  if (quiet()) return;
  const t = ctx.currentTime + 0.02;
  const notes = {
    perfect: [784, 988, 1175, 1568, 2093],
    great: [784, 1175],
    good: [659],
    close: [440, 392],
    miss: [330, 247, 185],
  }[key] || [523];
  const step = key === 'perfect' ? 0.075 : 0.11;
  notes.forEach((f, i) => {
    const last = i === notes.length - 1;
    if (key === 'miss') osc('sawtooth', f, t + i * step, 0.16, 0.08, { to: f * 0.85 });
    else {
      osc('triangle', f, t + i * step, last ? 0.5 : 0.14, 0.22);
      osc('sine', f * 2, t + i * step, last ? 0.35 : 0.1, 0.06);
    }
  });
}

/** Fanfara ob zmagi / rekordu. */
export function fanfare() {
  if (quiet()) return;
  const t = ctx.currentTime + 0.02;
  [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, t + i * 0.12, i === 3 ? 0.6 : 0.16, 0.22));
}
