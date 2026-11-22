/* =====================================================================
   HERODLE — način Kostum 🎨: barvna paleta kostuma kot abstraktni trakovi
   (naše barve, ne slika). Po 3 napačnih se pokaže prevladujoča barva, po 5
   še simbol (če ga lik nima: univerzum). Neomejeno poskusov, »Predam se«.
   ===================================================================== */
import { KOSTUM_DOMINANT_AT, KOSTUM_SYMBOL_AT } from '../logic.js';
import { createHintMode, triesCounter } from './hintmode.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function clue(icon, label, value, at, wrong, fresh) {
  if (value) return `<li class="on${fresh ? ' pop' : ''}"><span aria-hidden="true">${icon}</span> ${label}: <b>${value}</b></li>`;
  const left = at - wrong;
  return `<li class="off"><span aria-hidden="true">🔒</span> ${label}: <i>čez ${left} ${left === 1 ? 'napačen poskus' : left === 2 ? 'napačna poskusa' : left <= 4 ? 'napačne poskuse' : 'napačnih poskusov'}</i></li>`;
}

const mode = createHintMode({
  id: 'kostum',
  intro: 'To so barve kostuma. Čigav je? Po 3 napačnih dobiš namig o barvi, po 5 še simbol.',
  board: (h, { fresh, wrong }) => {
    const p = h.palette || [];
    const sym = h.symbol ? (h.symbol.kind === 'symbol' ? esc(h.symbol.text) : `brez simbola · ${esc(h.symbol.text)}`) : null;
    const ring = p.map((c, i) => {
      const w = 100 / (p.length + 2), a = i === 0 ? 3 * w : w, s = i === 0 ? 0 : 3 * w + (i - 1) * w;
      return `${c} ${s}% ${s + a}%`;
    }).join(', ');
    return `<div class="hd-suit">
        <div class="hd-suit__stripes" role="img" aria-label="Barve kostuma: ${p.length}">${p.map((c, i) => `<i style="--c:${c};--f:${i === 0 ? 3 : 1}"></i>`).join('')}</div>
        <div class="hd-suit__ring" style="background:conic-gradient(${ring})" aria-hidden="true"></div>
      </div>
      <ul class="hd-clues">
        ${clue('💡', 'Prevladujoča barva', h.dominant ? esc(h.dominant) : null, KOSTUM_DOMINANT_AT, wrong, fresh === 0)}
        ${clue('🔰', 'Simbol', sym, KOSTUM_SYMBOL_AT, wrong, fresh === 1)}
      </ul>`;
  },
  counter: triesCounter,
  achievements: n => (n <= 3 ? ['modni-kritik'] : []),
});

export const { id, label, icon, isSolved, isDone, mount, unmount, currentPool } = mode;
