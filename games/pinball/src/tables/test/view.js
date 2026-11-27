/* TESTNA MIZA — izris: privzeta grafika motorja (engine/render/art.js), le besedila */
import { CFG } from './config.js';

export const art = {};
export const dmd = {
  title: { big: 'TST', small: 'MIZA', ver: 'MOTOR', sub: 'VSI ELEMENTI' },
  bootLines: ['$ ./pinball --miza=test', '> nalagam elemente...', '> pritisni START'],
  bonusTitle: 'BONUS',
  facts: [['RAMPE', 'VUK · LOCK'], ['MAGNET', 'UJETA ŽOGICA']],
  footer: ['TESTNA MIZA', 'MOTOR'],
};
export const ui = {
  title: CFG.naslov, version: CFG.verzija, subtitle: 'preizkus elementov motorja',
  hint: 'ENTER za začetek · ?debug=1 za sloj s senzorji',
  modesTitle: 'ELEMENTI', modes: [],
  idle: s => s.multiball ? 'Multiball!' : s.lockLit ? 'LOCK prižgan — zadeni VUK.' : s.magnet ? 'Magnet je prižgan.' : 'Drop banka prižge LOCK, standupi magnet.',
  attract: () => 'Testna miza za nove elemente.',
  state: s => [
    ['Lock', s.lockLit || s.locks > 0, s.lockLit ? 'PRIŽGAN' : s.locks + ' / 2'],
    ['Multiball', s.multiball, s.multiball ? 'AKTIVEN' : '—', 'gold'],
    ['Magnet', s.magnet, s.magnet ? 'PRIŽGAN' : '—'],
    ['Ball save', s.ballSave > 0, s.ballSave > 0 ? Math.ceil(s.ballSave) + ' s' : '—'],
  ],
};
