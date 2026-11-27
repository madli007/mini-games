/* =====================================================================
   ALU MIZA — grafika in besedila za brskalnik (art, DMD, UI, logotipi)
   ===================================================================== */
import * as art from './art.js';
import { loadLogos, logoBitmap, logoUrl } from './logos.js';
import { CFG, PAL, MODES } from './config.js';

export { art };

/** nalaganje slik (logotipi); onLoad → ponovni izris statičnih slojev */
export const loadAssets = onLoad => loadLogos(onLoad);

const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

export const dmd = {
  title: { big: 'ALU', small: 'PINBALL', ver: CFG.verzija, sub: 'IMPOL × ALCAD' },
  bootLines: ['$ ./alu-pinball --start', '> nalagam talino...', '> pritisni START'],
  bonusTitle: CFG.imena.kadri + ': IZPLAČILO',
  logo: (w, h) => logoBitmap('impol', w, h),
  logoText: CFG.firmaA,
  // zanimivosti za attract način
  facts: [
    ['IMPOL', 'OD 1825'],
    ['ALUMINIJ', 'OD 1950'],
    ['INDUSTRIJA METALNIH', 'POLIZDELKOV'],
    ['ALCAD OD 1995', 'ALCLOUD'],
    ['IZVOZ NA', '50 TRGOV'],
    ['BISTRICA SEVOJNO', 'ŠIBENIK NEW YORK'],
  ],
  attractExtra: (d, t, per, game) => d.drawMsg({ anim: 'roll', t, dur: per, text: CFG.imena.orbit, col: hex(PAL.cyan), sub: '' }, game),
  footer: ['NEURADNA IGRA', 'ZA HEC'],
};

export const ui = {
  title: CFG.naslov,
  version: CFG.verzija,
  subtitle: CFG.podnaslov,
  companies: CFG.imena.podjetja,
  hint: 'ENTER za začetek · misije, multiball in finale te čakajo v livarni ' + CFG.imena.scoop,
  legal: CFG.opomba,
  links: [{ label: '🎄 Božična miza', href: '../bozicni-pinball/' }],
  archive: true,               // zavihek »Arhiv (pred portalom)«: stara tabela scores (samo branje)
  logo: CFG.logotipi ? logoUrl('impol') : null,
  logoAlt: 'Impol',
  modesTitle: 'MISIJE',
  modes: MODES.map(m => ({ name: m.ime, full: m.polno || m.ime, color: m.barva, desc: m.opis, unit: m.id === 'valjarna' ? ' m' : '', id: m.id })),
  wizard: { name: 'NAROČILO IZPOLNJENO', short: 'FINALE', live: 'FINALE!', liveDesc: 'Vse je vredno jackpot.' },
  /** besedilo pod seznamom misij, ko misija ne teče */
  idle: (s, esc) => s.modeLit ? `Misija <b style="color:${MODES[s.next].barva}">${MODES[s.next].ime}</b> čaka v livarni ${esc(CFG.imena.scoop)}.`
    : s.wizardLit ? `<span class="gold-t">Finale prižgan — zadeni ${esc(CFG.imena.scoop)}!</span>`
      : `Še ${s.rampsToMode}× rampa do naslednje misije.`,
  attract: esc => `Začni igro in zadeni ${esc(CFG.imena.scoop)}.`,
  /** vrstice panela STANJE: [oznaka, prižgano, besedilo, razred] */
  state: (s, fmt) => [
    ['Lock', s.locks > 0 || s.lockLit, s.lockLit ? 'PRIŽGAN' : s.locks + ' / 2'],
    ['Multiball', s.multiball, s.multiball ? 'AKTIVEN' : '—', 'gold'],
    ['Jackpot', true, fmt(s.jackpot), 'gold'],
    ['Kickback', s.kickback, s.kickback ? 'DA' : 'NE'],
    ['Ball save', s.ballSave > 0, s.ballSave > 0 ? Math.ceil(s.ballSave) + ' s' : '—'],
    ['Extra ball', s.extraBalls > 0 || s.extraLit, s.extraLit ? 'PRIŽGAN' : s.extraBalls],
  ],
};
