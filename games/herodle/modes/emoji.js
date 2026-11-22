/* =====================================================================
   HERODLE — način Emoji 😶‍🌫️: lik opisan s 5 emojiji. Na začetku je viden
   en, vsak napačen poskus razkrije naslednjega (»pop«). Ko so vidni vsi,
   se ugiba naprej brez omejitve. Rezultat = poskusi.
   ===================================================================== */
import { EMOJI_COUNT } from '../logic.js';
import { createHintMode, triesCounter } from './hintmode.js';

const cells = (h, { fresh, full, finished }) => Array.from({ length: EMOJI_COUNT }, (_, i) => {
  const e = h.emoji?.[i];
  if (e) return `<span class="hd-emo__c on${i === fresh ? ' pop' : ''}" role="listitem">${e}</span>`;
  if (finished && full) return `<span class="hd-emo__c late" role="listitem" title="Ni bil razkrit">${full.emoji[i]}</span>`;
  return `<span class="hd-emo__c off" role="listitem" aria-label="še skrito">?</span>`;
}).join('');

const mode = createHintMode({
  id: 'emoji',
  intro: 'Kateri lik se skriva za emojiji? Vsak napačen poskus razkrije naslednjega.',
  board: (h, o) => `<div class="hd-emo" role="list" aria-label="Emojiji (${h.emoji?.length || 0} od ${EMOJI_COUNT})">${cells(h, o)}</div>
    ${o.finished ? '' : `<p class="hd-hm__step">${(h.emoji?.length || 0) < EMOJI_COUNT ? `Viden ${h.emoji.length}/${EMOJI_COUNT} · naslednji po napačnem poskusu` : 'Vsi emojiji so na mizi — ugibaj naprej!'}</p>`}`,
  counter: triesCounter,
  achievements: n => (n === 1 ? ['emoji-mojster'] : []),
});

export const { id, label, icon, isSolved, isDone, mount, unmount, currentPool } = mode;
