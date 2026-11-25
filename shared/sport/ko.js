/* =====================================================================
   SPORT — ko.js: KO sistem v 1. seriji (pari) in skupna razvrstitev
   turneje (brez DOM-a, brez pojmov posameznega športa).

   Format (po vzoru novoletne turneje, pod svojim imenom »Turneja 4 skakalnic«):
     • 50 tekmovalcev v 25 parih po razvrstitvi: 1. proti 50., 2. proti 49. …
     • zmagovalec para gre naprej (izenačenje v paru: oba), poleg njih še 5 najboljših poraženih
       (»srečni poraženci«) — skupaj 30.
     • Pri drugem številu tekmovalcev isto pravilo: pari 1–N, 2–(N−1) …, liho število = srednji gre naprej
       brez para; srečnih poražencev je round(N / 10) (pri 50 → 5). Izbrano in dokumentirano v sport/README.md.
   ===================================================================== */

/** Število srečnih poražencev za N tekmovalcev (50 → 5). */
export const luckyCount = n => Math.max(0, Math.round(n / 10));

/**
 * Pari po razvrstitvi (najboljši prvi).
 * @param {string[]} ranked id-ji, urejeni od najboljšega
 * @returns {{pairs:{hi:string, lo:string}[], bye:string|null}} hi = boljše uvrščen (1.), lo = slabše (50.)
 */
export function koPairs(ranked) {
  const n = ranked.length, pairs = [];
  for (let i = 0; i < Math.floor(n / 2); i++) pairs.push({ hi: ranked[i], lo: ranked[n - 1 - i] });
  return { pairs, bye: n % 2 ? ranked[Math.floor(n / 2)] : null };
}

/**
 * Štartni vrstni red KO serije: par za parom od zadnjega para (najbližji v razvrstitvi) do 1. para,
 * v paru najprej slabše uvrščeni; tekmovalec brez para skoči prvi.
 */
export function koOrder({ pairs, bye }) {
  const out = bye ? [bye] : [];
  for (let i = pairs.length - 1; i >= 0; i--) out.push(pairs[i].lo, pairs[i].hi);
  return out;
}

/**
 * Kdo gre naprej po KO seriji.
 * @param {{pairs:{hi,lo}[], bye:string|null}} ko
 * @param {Record<string, number|null>} score točke serije (null/undefined = ni dokončal → izgubi par)
 * @param {{lucky?:number}} [o] število srečnih poražencev (privzeto luckyCount(N))
 * @returns {{advance:string[], winners:string[], lucky:string[], losers:string[]}}
 */
export function koAdvance(ko, score, { lucky } = {}) {
  const n = ko.pairs.length * 2 + (ko.bye ? 1 : 0);
  const L = lucky ?? luckyCount(n);
  const val = id => (Number.isFinite(score[id]) ? score[id] : -Infinity);
  const winners = [], losers = [];
  if (ko.bye && Number.isFinite(score[ko.bye])) winners.push(ko.bye);
  for (const { hi, lo } of ko.pairs) {
    const a = val(hi), b = val(lo);
    if (a === -Infinity && b === -Infinity) continue;
    if (a === b) { winners.push(hi, lo); continue; }             // izenačenje v paru: oba naprej
    if (a > b) { winners.push(hi); if (b > -Infinity) losers.push(lo); } else { winners.push(lo); if (a > -Infinity) losers.push(hi); }
  }
  const sorted = losers.slice().sort((x, y) => val(y) - val(x));
  let luckyIds = sorted.slice(0, L);
  // izenačeni na meji srečnih poražencev gredo vsi
  if (L > 0 && sorted.length > L) { const lim = val(sorted[L - 1]); luckyIds = sorted.filter(id => val(id) >= lim); }
  if (L === 0) luckyIds = [];
  const adv = new Set([...winners, ...luckyIds]);
  return { advance: [...adv], winners, lucky: luckyIds, losers: losers.filter(id => !adv.has(id)) };
}

/**
 * Skupna razvrstitev več tekmovanj (turneja): vsota točk; kdor manjka na kateri, izpade.
 * @param {Array<Array<{id:string, total:number, status?:string}>>} comps razvrstitve posameznih tekmovanj (competition.standings)
 * @returns {{id, total, n, missed, rank:number|null, parts:number[]}[]}
 */
export function tourTotal(comps) {
  const m = new Map();
  comps.forEach((rows, k) => {
    for (const r of rows) {
      const t = m.get(r.id) || { id: r.id, total: 0, n: 0, parts: Array(comps.length).fill(null) };
      if (r.status === undefined || r.status === 'ok') { t.total = Math.round((t.total + r.total) * 10) / 10; t.n++; t.parts[k] = r.total; }
      m.set(r.id, t);
    }
  });
  const list = [...m.values()].map(t => ({ ...t, missed: comps.length - t.n }));
  list.sort((a, b) => a.missed - b.missed || b.total - a.total || a.id.localeCompare(b.id));
  let rank = 0;
  list.forEach((t, i) => { if (t.missed) { t.rank = null; return; } if (i === 0 || list[i - 1].total !== t.total || list[i - 1].missed) rank = i + 1; t.rank = rank; });
  return list;
}
