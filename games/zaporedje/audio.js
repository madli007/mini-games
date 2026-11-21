/* =====================================================================
   ZAPOREDJE — zvok (WebAudio, brez datotek).
   Ton ploščice: sinus + tih trikotnik oktavo višje, mehak filter,
   kratek »zvon« z odmevom. Napaka: »bzzz«. Rekord: fanfara.
   ===================================================================== */
import * as S from '../../shared/storage.js';

let ctx = null;
let master = null;
let echo = null;
let muted = !!S.load('zaporedje:mute', false);
let silenced = false;   // modifikator Tišina (začasno, ne shrani se)

function ac() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    // rahel odmev (delay z odbojem)
    echo = ctx.createDelay(0.5);
    echo.delayTime.value = 0.16;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    echo.connect(fb).connect(echo);
    echo.connect(wet).connect(master);
  } catch (e) {
    console.warn('WebAudio:', e.message);
    ctx = null;
  }
  return ctx;
}

/** Odkleni zvok ob prvi uporabnikovi interakciji (iOS/Chrome). */
export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export const isMuted = () => muted;
export function setMuted(v) { muted = !!v; S.save('zaporedje:mute', muted); }
export function setSilenced(v) { silenced = !!v; }
const quiet = () => muted || silenced || !ac();

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

/**
 * Ton ploščice.
 * @param {number} freq Hz
 * @param {number} [dur] s
 */
export function tone(freq, dur = 0.35) {
  if (quiet()) return;
  const t = ctx.currentTime + 0.005;
  const out = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(freq * 6, t);
  lp.frequency.exponentialRampToValueAtTime(freq * 2, t + dur);
  out.connect(lp);
  lp.connect(master);
  lp.connect(echo);
  const d = Math.max(0.18, dur);
  env(out, t, 0.012, 0.5, d);
  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.value = freq;
  const o2 = ctx.createOscillator();
  o2.type = 'triangle';
  o2.frequency.value = freq * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.18;
  const o3 = ctx.createOscillator();   // »zvonček« ob udarcu
  o3.type = 'sine';
  o3.frequency.value = freq * 3;
  const g3 = ctx.createGain();
  env(g3, t, 0.004, 0.12, 0.09);
  o1.connect(out);
  o2.connect(g2).connect(out);
  o3.connect(g3).connect(out);
  for (const o of [o1, o2, o3]) { o.start(t); o.stop(t + d + 0.05); }
}

/** Kratek »bzzz« ob napaki. */
export function buzz() {
  if (quiet()) return;
  const t = ctx.currentTime + 0.005;
  const out = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  out.connect(lp).connect(master);
  env(out, t, 0.01, 0.35, 0.38);
  for (const f of [98, 103.5]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 0.8, t + 0.4);
    o.connect(out);
    o.start(t);
    o.stop(t + 0.45);
  }
}

/** Fanfara ob novem rekordu (durov arpeggio). */
export function fanfare() {
  if (quiet()) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => setTimeout(() => tone(f, i === notes.length - 1 ? 0.6 : 0.16), i * 110));
}

/** Mehak »tik« ob pravilno končanem krogu. */
export function chime() {
  if (quiet()) return;
  tone(1046.5, 0.12);
  setTimeout(() => tone(1318.5, 0.18), 70);
}
