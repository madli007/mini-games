/* =====================================================================
   DIRKA FRNIKOL — day.js: frnikole, forma in Dirkalni dan iz seeda (čista logika).
   dayPlan(seed) → 5 dirk (proga, postava 8 frnikol s formo, seed dirke) + boti.
   Isti seed (npr. hub.dailySeed()) → isti dan za vse igralce.
   ===================================================================== */
import { rng as makeRng } from '../../shared/util.js';
import { BET } from './bets.js';
import { BOT_NAMES, PERSONA_IDS } from './bots.js';

/**
 * Nabor frnikol. Vse imena so ženskega spola (»frnikola je padla«), acc = tožilnik (»porinil … «).
 * base: osnovne lastnosti (−1 … 1): speed (ravnina), grip (zavoji), mass (masa, trki).
 * pattern: vzorec na steklu (swirl | stripes | dots | stars | ring).
 */
export const MARBLES = [
  { id: 'bliskavica', name: 'Bliskavica', acc: 'Bliskavico', color: '#ffd23f', color2: '#ff7a1a', pattern: 'swirl', base: { speed: 0.7, grip: -0.5, mass: -0.2 } },
  { id: 'rdeca-zvezda', name: 'Rdeča zvezda', acc: 'Rdečo zvezdo', color: '#ff3b5c', color2: '#ffd0d8', pattern: 'stars', base: { speed: 0.2, grip: 0.3, mass: 0.1 } },
  { id: 'modra-luna', name: 'Modra luna', acc: 'Modro luno', color: '#3a7bff', color2: '#cfe0ff', pattern: 'ring', base: { speed: -0.2, grip: 0.6, mass: 0.2 } },
  { id: 'zlata-ribica', name: 'Zlata ribica', acc: 'Zlato ribico', color: '#c8901a', color2: '#fff2b0', pattern: 'dots', base: { speed: 0.3, grip: 0.2, mass: -0.6 } },
  { id: 'smaragdna', name: 'Smaragdna kaplja', acc: 'Smaragdno kapljo', color: '#18c97a', color2: '#b8ffdc', pattern: 'swirl', base: { speed: 0, grip: 0.5, mass: -0.1 } },
  { id: 'kremenka', name: 'Kremenka', acc: 'Kremenko', color: '#b8b0a0', color2: '#ffffff', pattern: 'stripes', base: { speed: -0.4, grip: 0.1, mass: 0.8 } },
  { id: 'mesecina', name: 'Mesečina', acc: 'Mesečino', color: '#c9d4ff', color2: '#6a74b8', pattern: 'ring', base: { speed: 0.1, grip: 0, mass: 0 } },
  { id: 'lavica', name: 'Lavica', acc: 'Lavico', color: '#ff5a1f', color2: '#3a0a00', pattern: 'swirl', base: { speed: 0.5, grip: -0.2, mass: 0.4 } },
  { id: 'pikica', name: 'Pikica', acc: 'Pikico', color: '#f4f2f8', color2: '#ff3b5c', pattern: 'dots', base: { speed: -0.1, grip: 0.4, mass: -0.5 } },
  { id: 'tigrica', name: 'Tigrica', acc: 'Tigrico', color: '#ff9a1a', color2: '#1a1208', pattern: 'stripes', base: { speed: 0.4, grip: 0.1, mass: 0.3 } },
  { id: 'ledena', name: 'Ledena kraljica', acc: 'Ledeno kraljico', color: '#8fe8ff', color2: '#ffffff', pattern: 'stars', base: { speed: 0.2, grip: -0.6, mass: 0.2 } },
  { id: 'kometka', name: 'Kometka', acc: 'Kometko', color: '#a06bff', color2: '#ffe08a', pattern: 'stars', base: { speed: 0.6, grip: -0.1, mass: -0.4 } },
  { id: 'rozica', name: 'Rožica', acc: 'Rožico', color: '#ff4fd8', color2: '#3ddc84', pattern: 'dots', base: { speed: -0.3, grip: 0.7, mass: 0 } },
  { id: 'oranzada', name: 'Oranžada', acc: 'Oranžado', color: '#ffc896', color2: '#ff7a1a', pattern: 'ring', base: { speed: 0.1, grip: -0.3, mass: 0.6 } },
  { id: 'mavrica', name: 'Mavrica', acc: 'Mavrico', color: '#00a89a', color2: '#ff4fd8', pattern: 'swirl', base: { speed: 0, grip: 0, mass: -0.3 } },
  { id: 'crna-macka', name: 'Črna mačka', acc: 'Črno mačko', color: '#2a2a3a', color2: '#ffd23f', pattern: 'stripes', base: { speed: 0.3, grip: 0.3, mass: 0.7 } },
];

export const marbleById = id => MARBLES.find(m => m.id === id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100;

/** Puščice forme: ▲ dobro, ▽ slabo, – povprečno (vrstni red: ravnina, zavoji, masa). */
export function formArrows(form) {
  return ['speed', 'grip', 'mass'].map(k => (form[k] > 0.2 ? '▲' : form[k] < -0.2 ? '▽' : '–')).join('');
}

/** Opis frnikole iz forme: »hitra v ravnini, slaba v zavojih«. */
export function formText(form) {
  const t = [];
  if (form.speed > 0.3) t.push('hitra v ravnini'); else if (form.speed < -0.3) t.push('počasna v ravnini');
  if (form.grip > 0.3) t.push('trdna v zavojih'); else if (form.grip < -0.3) t.push('slaba v zavojih');
  if (form.mass > 0.3) t.push('težka, prenese trke'); else if (form.mass < -0.3) t.push('lahka, odleti ob trku');
  return t.length ? t.join(', ') : 'vsestranska, brez posebnosti';
}

/**
 * Dirkalni dan iz seeda.
 * @param {string} seed npr. '2026-11-23' (dnevni) ali naključen (prosta igra)
 * @param {{bots?:number, tracks:string[], rng?:Function}} o tracks = id-ji prog po vrsti iz tracks/index.json
 * @returns {{seed:string, races:{no:number, track:string, seed:string, marbles:Object[]}[], bots:Object[]}}
 */
export function dayPlan(seed, { bots = 5, tracks, rng = makeRng } = {}) {
  const r = rng(seed + ':frnikole');
  // proge: vsaka vsaj enkrat, nato naključno (brez iste dvakrat zapored)
  const order = [];
  let pool = [];
  while (order.length < BET.RACES) {
    if (!pool.length) pool = r.shuffle(tracks);
    let k = pool.findIndex(t => t !== order[order.length - 1]);
    if (k < 0) k = 0;
    order.push(pool.splice(k, 1)[0]);
  }
  const races = order.map((track, i) => {
    const picks = r.shuffle(MARBLES).slice(0, 8);
    const marbles = picks.map(m => ({
      id: m.id,
      form: Object.fromEntries(['speed', 'grip', 'mass'].map(k => [k, r2(clamp(m.base[k] + r.range(-0.45, 0.45), -1, 1))])),
    }));
    return { no: i + 1, track, seed: `${seed}:r${i + 1}`, marbles };
  });
  const n = clamp(bots | 0, 3, 7);
  const names = r.shuffle(BOT_NAMES).slice(0, n);
  const personas = r.shuffle(PERSONA_IDS);
  const B = names.map((nm, i) => ({
    id: 'bot' + (i + 1), name: nm.name, g: nm.g, emoji: nm.emoji,
    persona: personas[i % personas.length],
    fav: r.pick(MARBLES).id,   // Zvestoba: najljubša barva
  }));
  return { seed: String(seed), races, bots: B };
}
