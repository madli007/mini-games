/* =====================================================================
   HERODLE — način Dosje 🗂️: tajni dosje s 6 namigi od splošnega do
   konkretnega. Viden je prvi, vsak napačen poskus »odtisne« naslednjega.
   Po 6 napačnih igra razkrije lik (ni rešeno). Rezultat = poskusi (1–6).
   ===================================================================== */
import { DOSSIER_COUNT } from '../logic.js';
import { createHintMode, attemptsOf } from './hintmode.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BARS = ['████████ ██████ ███', '██████ █████████ ████', '███ ████████ █████', '█████████ ███ ██████', '████ ██████ ████████', '███████ ████ ███████'];

const mode = createHintMode({
  id: 'dosje',
  intro: 'Tajni dosje neznanega lika. Imaš 6 namigov — vsak napačen poskus odpre naslednjega.',
  board: (h, { fresh, full, finished }) => {
    const d = h.dossier || [];
    const items = Array.from({ length: DOSSIER_COUNT }, (_, i) => {
      if (d[i]) return `<li class="on${i === fresh ? ' stamp' : ''}"><span class="no">${i + 1}</span><span class="tx">${esc(d[i])}</span></li>`;
      if (finished && full) return `<li class="late"><span class="no">${i + 1}</span><span class="tx">${esc(full.dossier[i])}</span></li>`;
      return `<li class="off" aria-label="Namig ${i + 1}: zaklenjeno"><span class="no">${i + 1}</span><span class="redact" aria-hidden="true">${BARS[i]}</span></li>`;
    }).join('');
    return `<div class="hd-file">
      <div class="hd-file__tab">STROGO ZAUPNO</div>
      <div class="hd-file__head"><b>Tajni dosje</b><span>Subjekt: <i>${finished && full ? 'razkrit' : 'neznan'}</i></span></div>
      <ol class="hd-file__list">${items}</ol>
    </div>`;
  },
  counter: g => (g.solved || g.lost || g.gaveUp ? `${attemptsOf(g) || g.wrong}/${DOSSIER_COUNT}` : `Namig ${Math.min(DOSSIER_COUNT, (g.wrong | 0) + 1)}/${DOSSIER_COUNT}`),
  achievements: n => (n === 1 ? ['detektiv'] : []),
});

export const { id, label, icon, isSolved, isDone, mount, unmount, currentPool } = mode;
