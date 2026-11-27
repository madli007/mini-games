/* =====================================================================
   BOŽIČNA MIZA — grafika in besedila za brskalnik (art, DMD, UI, pomoč)
   ===================================================================== */
import * as art from './art.js';
import { CFG, PAL, SHOTS } from './config.js';

export { art };
export const envBlobs = art.envBlobs;

const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

/* ---------- DMD ilustracija 128 × 32: trije dobri možje nad zasneženo vasjo ---------- */
let ILL = null;
function illustration() {
  if (ILL) return ILL;
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 32);
  // luna in zvezde
  g.fillStyle = '#fff4c8'; g.beginPath(); g.arc(118, 6, 3.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#000'; g.beginPath(); g.arc(119.5, 5, 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9fc4ff'; for (const [x, y] of [[5, 3], [22, 6], [40, 2], [58, 5], [77, 3], [96, 7], [108, 2]]) g.fillRect(x, y, 1, 1);
  // sneg in vasica
  g.fillStyle = '#5c7cc0'; g.fillRect(0, 27, 128, 5);
  for (const [x, w, h] of [[2, 10, 6], [14, 8, 8], [100, 9, 7], [112, 12, 6]]) {
    g.fillStyle = '#28407a'; g.fillRect(x, 27 - h, w, h);
    g.fillStyle = '#eef6ff'; g.fillRect(x - 1, 27 - h - 1, w + 2, 1);
    g.fillStyle = '#ffb347'; g.fillRect(x + 2, 27 - h + 2, 2, 2); if (w > 9) g.fillRect(x + w - 4, 27 - h + 2, 2, 2);
  }
  // Miklavž: bela halja, rdeč plašč, mitra, palica
  const man = (x, coat, trim, hat) => {
    g.fillStyle = coat; g.fillRect(x - 4, 13, 9, 14);
    g.fillStyle = trim; g.fillRect(x - 4, 25, 9, 2); g.fillRect(x, 13, 1, 12);
    g.fillStyle = '#f2c9a0'; g.fillRect(x - 2, 8, 5, 4);
    g.fillStyle = '#ffffff'; g.fillRect(x - 3, 11, 7, 4);          // brada
    hat(x);
  };
  man(40, '#c8102e', '#ffd166', x => { g.fillStyle = '#c8102e'; g.fillRect(x - 2, 3, 5, 5); g.fillStyle = '#ffd166'; g.fillRect(x, 3, 1, 5); g.fillRect(x - 2, 7, 5, 1); });
  g.fillStyle = '#ffd166'; g.fillRect(46, 6, 1, 21); g.fillRect(46, 5, 2, 2);
  // Božiček: rdeč s krznom, vreča
  man(64, '#e0202e', '#ffffff', x => { g.fillStyle = '#e0202e'; g.fillRect(x - 3, 5, 7, 3); g.fillRect(x + 3, 6, 2, 2); g.fillStyle = '#fff'; g.fillRect(x - 3, 8, 7, 1); g.fillRect(x + 5, 7, 2, 2); });
  g.fillStyle = '#8a5a2a'; g.beginPath(); g.ellipse(74, 21, 5, 6, 0, 0, Math.PI * 2); g.fill();
  // Dedek Mraz: modra-srebrna bunda, kučma, smrečica
  man(88, '#2a5cd8', '#d9e4f2', x => { g.fillStyle = '#2a5cd8'; g.fillRect(x - 3, 4, 7, 4); g.fillStyle = '#d9e4f2'; g.fillRect(x - 3, 7, 7, 1); });
  g.fillStyle = '#1c8a4a'; g.beginPath(); g.moveTo(98, 10); g.lineTo(94, 22); g.lineTo(102, 22); g.closePath(); g.fill();
  g.fillStyle = '#ffd166'; g.fillRect(97, 9, 2, 2);
  const d = g.getImageData(0, 0, 128, 32).data, out = [];
  for (let i = 0; i < 128 * 32; i++) out.push([d[i * 4] / 255, d[i * 4 + 1] / 255, d[i * 4 + 2] / 255]);
  ILL = out;
  return ILL;
}

export const dmd = {
  title: { big: 'DEC', small: 'PINBALL', ver: 'TRIJE DOBRI', sub: 'MOŽJE' },
  bootLines: ['> Miklavž: 6. 12.', '> Božiček: 25. 12.', '> Dedek Mraz: 31. 12.'],
  bonusTitle: 'DARILA ZA PRIDNE',
  facts: [
    ['MIKLAVŽ', 'S PARKLJI'], ['BOŽIČEK', 'S SANMI'], ['DEDEK MRAZ', 'Z JELKO'],
    ['PARKLJI ODPRO', 'DIMNIK'], ['3 DARILA V VREČI', 'MULTIBALL'], ['ZVEZDA NA JELKI', 'SUPER JACKPOT'],
  ],
  // ilustracija: trije dobri možje nad zasneženo vasjo + sneženje
  attractExtra: (d, t) => {
    const img = illustration();
    for (let y = 0; y < 32; y++) for (let x = 0; x < 128; x++) {
      const c = img[y * 128 + x];
      if (c[0] + c[1] + c[2] > 0.05) d.px(x, y, c, 1);
    }
    for (let i = 0; i < 18; i++) {
      const x = (i * 37 + Math.floor(t * 8 * (1 + (i % 3)))) % 128, y = (i * 11 + Math.floor(t * 9 * (1 + (i % 2)))) % 32;
      d.px(x, y, [1, 1, 1], 0.7);
    }
  },
  footer: ['VESEL DECEMBER', 'IN SREČNO!'],
};

export const ui = {
  title: CFG.naslov,
  version: CFG.verzija,
  subtitle: CFG.podnaslov,
  hint: 'ENTER za začetek · Parklji odprejo Dimnik · 3 darila v vreči = Darilni multiball',
  links: [{ label: 'Alu miza', href: '../pinball/' }],
  toggles: [{ id: 'snow', label: 'Sneženje nad mizo', def: true }],
  modesTitle: 'DARILA',
  modes: [],
  help: {
    note: 'Utripajoča puščica = zdaj je na voljo · sveti = prižgano. Levi flipper med izstrelitvijo = super skill shot (Kepa).',
    legend: [[PAL.red, 'multiball / jackpot'], [PAL.gold, 'super jackpot'], [PAL.green, 'lock'], [PAL.orange, 'extra ball'],
      [PAL.violet, 'mystery'], [PAL.white, 'combo'], [PAL.silver, 'pismo']],
  },
  idle: (s, esc) => s.multiball
    ? (s.superLit ? `<span class="gold-t">SUPER JACKPOT → ${esc(SHOTS.center)}!</span>` : `Jackpot še na ${s.jpLeft} strelih (rdeče puščice).`)
    : s.lockLit ? `<b style="color:${PAL.green}">Dimnik je odprt</b> — zadeni ${esc(SHOTS.orbitL)} za lock (${s.locks}/3).`
      : s.extraLit ? `<b style="color:${PAL.orange}">Extra ball</b> čaka v nabiralniku (desni orbit).`
        : s.letterLit ? `Pismo ✉ čaka v nabiralniku (desni orbit).`
          : `Podri vse tri ${esc(SHOTS.drops)} za lock · še ${s.rampsToLetter}× rampa do pisma.`,
  attract: esc => `Začni igro in odpri ${esc(SHOTS.vuk)} s Parklji.`,
  state: (s, fmt) => [
    ['Lock (vreča)', s.locks > 0 || s.lockLit, s.lockLit ? 'DIMNIK ODPRT' : s.locks + ' / 3', 'on'],
    ['Multiball', s.multiball, s.multiball ? (s.superLit ? 'SUPER!' : 'AKTIVEN') : '—', 'gold'],
    ['Jackpot', true, fmt(s.jackpot), 'gold'],
    ['Jelka', s.treeLights > 0, s.treeLights + ' / 9'],
    ['Venec', s.venec > 0, s.venec + ' / 4'],
    ['Kickback', s.kickback, s.kickback ? 'DA' : 'NE'],
    ['Ball save', s.ballSave > 0, s.ballSave > 0 ? Math.ceil(s.ballSave) + ' s' : '—'],
    ['Extra ball', s.extraBalls > 0 || s.extraLit, s.extraLit ? 'PRIŽGAN' : s.extraBalls],
  ],
};
void hex;
