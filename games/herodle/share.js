/* =====================================================================
   HERODLE — skupni drobni pripomočki za konec uganke (vsi načini):
   deljenje besedila, »POW!«, odštevalnik do polnoči.
   ===================================================================== */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/**
 * Deli besedilo: navigator.share na telefonu, sicer odložišče, sicer okno z besedilom.
 * @param {any} ui shared ui
 * @param {string} text
 */
export async function shareOut(ui, text, title = 'Deli rezultat') {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  try {
    await navigator.clipboard.writeText(text);
    ui.toast('Rezultat je v odložišču.', { icon: '📋' });
  } catch {
    ui.modal({ title, html: `<textarea class="mg-input hd-sharebox" rows="8" readonly>${esc(text)}</textarea>` });
  }
}

/** Stripovski »POW!« čez zaslon. */
export function powFx(word = 'POW!') {
  if (reduced()) return;
  const el = document.createElement('div');
  el.className = 'hd-pow';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<span>${esc(word)}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

/** Naslednja ljubljanska polnoč (ms). */
export function nextMidnight(util) {
  const start = util.dayStart(new Date()).getTime();
  return util.dayStart(new Date(start + 30 * 3600e3)).getTime();
}

/**
 * Odštevalnik do polnoči v elementu (osvežuje vsako sekundo, dokler je v DOM-u).
 * @param {HTMLElement} el
 * @param {any} util
 * @param {number[]} timers seznam za čiščenje ob unmount
 */
export function countdown(el, util, timers) {
  const tick = () => {
    if (!el.isConnected) return;
    const s = Math.max(0, Math.round((nextMidnight(util) - Date.now()) / 1000));
    el.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':');
    timers.push(setTimeout(tick, 1000));
  };
  tick();
}
