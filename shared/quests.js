/* =====================================================================
   MINI GAMES — dnevne in tedenske naloge (čista logika, brez DOM-a).

   Generator: iz dneva (hub.dailySeed()) izbere 3 dnevne naloge (lahka e,
   srednja m, težka h), iz tedna (ISO, ponedeljek po Europe/Ljubljana)
   2 tedenski (w1, w2). Isti za vse igralce, ker je odvisen le od datuma
   in od iger s statusom 'live' v games.json.

   Id naloge: '<slot>.<predloga>' (npr. 'h.win-1'); strežnik iz slota
   izračuna nagrado (COINS.QUEST) in dovoli en prevzem na slot in obdobje.

   Predloga: { id, tier: 'e'|'m'|'h'|'w', text, event, target, cmp?, goal? }
     event  — 'play' · 'play:<igra>' · 'mp' · 'win' · 'party' · 'daily' · 'daily:<igra>'
              · 'distinct' (različne igre) · 'ach' (nov dosežek) · 'score:<igra>'
              · poljuben dogodek iz hub.reportEvent(name, value), npr. 'reakcija:avg'
     cmp, goal — dogodek šteje le, če value 'lte'/'gte' goal (npr. povprečje ≤ 260)
     target — koliko takih dogodkov je treba
   Igre lahko v games.json dodajo svoje predloge: "quests": [ … ].
   ===================================================================== */

import { rng } from './util.js';
import { COINS } from './economy.js';

export const DAILY_SLOTS = ['e', 'm', 'h'];
export const WEEKLY_SLOTS = ['w1', 'w2'];
export const QUEST_ID_RE = /^(e|m|h|w1|w2)\.[a-z0-9:_-]{1,48}$/;
export const PERIOD_RE = /^(d:\d{4}-\d{2}-\d{2}|w:\d{4}-W\d{2})$/;

/**
 * Splošne predloge. {g} in {game} se zamenjata z id-jem in imenom igre
 * (za vsako igro 'live', ki izpolnjuje pogoj `needs`).
 *   needs: 'mp' (igra za več igralcev) · 'daily' (oznaka daily) · 'party' (≥ 4 igralci)
 *   global needs (brez {g}): 'mp' · 'party' · 'daily' · 'distinct2' (vsaj 2 igri)
 */
export const TEMPLATES = [
  // lahke
  { id: 'play-3', tier: 'e', text: 'Odigraj 3 igre', event: 'play', target: 3 },
  { id: 'play-{g}', tier: 'e', text: 'Odigraj igro {game}', event: 'play:{g}', target: 1 },
  { id: 'mp-1', tier: 'e', text: 'Odigraj igro v multiplayerju', event: 'mp', target: 1, needs: 'mp' },
  { id: 'daily-any', tier: 'e', text: 'Opravi katerikoli dnevni izziv', event: 'daily', target: 1, needs: 'daily' },
  // srednje
  { id: 'play-5', tier: 'm', text: 'Odigraj 5 iger', event: 'play', target: 5 },
  { id: 'distinct-2', tier: 'm', text: 'Odigraj 2 različni igri', event: 'distinct', target: 2, needs: 'distinct2' },
  { id: 'daily-{g}', tier: 'm', text: 'Opravi dnevni izziv v igri {game}', event: 'daily:{g}', target: 1, needs: 'daily' },
  { id: 'mp-3', tier: 'm', text: 'Odigraj 3 igre v multiplayerju', event: 'mp', target: 3, needs: 'mp' },
  // težke
  { id: 'win-1', tier: 'h', text: 'Zmagaj v multiplayerju', event: 'win', target: 1, needs: 'mp' },
  { id: 'party-1', tier: 'h', text: 'Odigraj igro z vsaj 4 igralci', event: 'party', target: 1, needs: 'party' },
  { id: 'play-10', tier: 'h', text: 'Odigraj 10 iger', event: 'play', target: 10 },
  { id: 'play3-{g}', tier: 'h', text: 'Odigraj igro {game} 3-krat', event: 'play:{g}', target: 3 },
  // tedenske
  { id: 'w-play-25', tier: 'w', text: 'Odigraj 25 iger', event: 'play', target: 25 },
  { id: 'w-win-5', tier: 'w', text: 'Zmagaj 5-krat v multiplayerju', event: 'win', target: 5, needs: 'mp' },
  { id: 'w-daily-5', tier: 'w', text: 'Opravi 5 dnevnih izzivov', event: 'daily', target: 5, needs: 'daily' },
  { id: 'w-party-3', tier: 'w', text: 'Odigraj 3 igre z vsaj 4 igralci', event: 'party', target: 3, needs: 'party' },
  { id: 'w-ach-1', tier: 'w', text: 'Odkleni nov dosežek', event: 'ach', target: 1 },
  { id: 'w-mp-10', tier: 'w', text: 'Odigraj 10 iger v multiplayerju', event: 'mp', target: 10, needs: 'mp' },
  { id: 'w-distinct', tier: 'w', text: 'Odigraj {n} različne igre', event: 'distinct', target: 0, needs: 'distinct2' },
];

/** Obdobje dneva: 'd:YYYY-MM-DD'. */
export function dayPeriod(day) { return 'd:' + day; }

/**
 * ISO teden (ponedeljek–nedelja) za ljubljanski datum 'YYYY-MM-DD' → '2026-W47'.
 * Enako kot v SQL: to_char(day, 'IYYY-"W"IW').
 */
export function isoWeek(day) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = (t.getUTCDay() + 6) % 7;            // pon = 0
  t.setUTCDate(t.getUTCDate() - dow + 3);         // četrtek tega tedna
  const wy = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(wy, 0, 4));
  const week = 1 + Math.round(((t - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${wy}-W${String(week).padStart(2, '0')}`;
}

/** Obdobje tedna: 'w:YYYY-Www'. */
export function weekPeriod(day) { return 'w:' + isoWeek(day); }

/** Nagrada za slot. */
export function questReward(slot) { return COINS.QUEST[slot] || 0; }

/** Iz games.json izlušči, kar generator potrebuje. */
function gameInfo(games) {
  const live = (games || []).filter(g => g.status === 'live').sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    live,
    mp: live.filter(g => g.players.max > 1),
    party: live.filter(g => g.players.max >= 4),
    daily: live.filter(g => (g.tags || []).includes('daily')),
  };
}

/**
 * Vse razširjene predloge za dane igre (urejene po id-ju), vključno s predlogami iz games.json.
 * @param {any[]} games games.json
 */
export function expandTemplates(games) {
  const info = gameInfo(games);
  const out = [];
  const globalOk = need => !need
    || (need === 'mp' && info.mp.length > 0)
    || (need === 'party' && info.party.length > 0)
    || (need === 'daily' && info.daily.length > 0)
    || (need === 'distinct2' && info.live.length >= 2);
  for (const t of TEMPLATES) {
    if (t.id.includes('{g}')) {
      const list = t.needs === 'mp' ? info.mp : t.needs === 'party' ? info.party : t.needs === 'daily' ? info.daily : info.live;
      for (const g of list) {
        out.push({ ...t, id: t.id.replace('{g}', g.id), event: t.event.replace('{g}', g.id), text: t.text.replace('{game}', g.name), game: g.id });
      }
    } else if (globalOk(t.needs)) {
      const q = { ...t };
      if (t.id === 'w-distinct') q.target = Math.min(4, info.live.length);
      q.text = q.text.replace('{n}', q.target);
      out.push(q);
    }
  }
  for (const g of info.live) {
    for (const q of g.quests || []) out.push({ ...q, id: `${g.id}-${q.id}`, game: g.id });
  }
  return out.map(({ needs, ...q }) => q).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Naloge za dan: 3 dnevne + 2 tedenski.
 * @param {string} day 'YYYY-MM-DD'
 * @param {any[]} games games.json
 * @returns {{id:string, slot:string, period:string, text:string, event:string, target:number, cmp?:string, goal?:number, reward:number}[]}
 */
export function questsFor(day, games) {
  const all = expandTemplates(games);
  const out = [];
  const dRand = rng(day + ':quests');
  const dp = dayPeriod(day);
  for (const slot of DAILY_SLOTS) {
    const pool = all.filter(t => t.tier === slot);
    if (!pool.length) continue;
    const t = dRand.pick(pool);
    out.push(toQuest(t, slot, dp));
  }
  const wp = weekPeriod(day);
  const wPool = all.filter(t => t.tier === 'w');
  const picked = rng(wp + ':quests').shuffle(wPool).slice(0, 2)
    .sort((a, b) => a.target - b.target || (a.id < b.id ? -1 : 1));
  picked.forEach((t, i) => out.push(toQuest(t, WEEKLY_SLOTS[i], wp)));
  return out;
}

function toQuest(t, slot, period) {
  const q = { id: `${slot}.${t.id}`, slot, period, text: t.text, event: t.event, target: Math.max(1, t.target | 0), reward: questReward(slot) };
  if (t.cmp) { q.cmp = t.cmp; q.goal = t.goal; }
  if (t.game) q.game = t.game;
  return q;
}

/**
 * Dogodki iz enega hub.reportGame.
 * @param {{game:string, won?:boolean, players?:number, score?:number|null, daily?:boolean}} r
 * @returns {{name:string, value?:number, game?:string}[]}
 */
export function gameEvents({ game, won = false, players = 1, score = null, daily = false }) {
  const ev = [{ name: 'play', game }, { name: 'play:' + game, game }];
  if (players >= 2) ev.push({ name: 'mp' });
  if (won && players >= 2) ev.push({ name: 'win' });
  if (players >= 4) ev.push({ name: 'party' });
  if (daily) ev.push({ name: 'daily' }, { name: 'daily:' + game });
  if (score != null && Number.isFinite(+score)) ev.push({ name: 'score:' + game, value: +score });
  return ev;
}

/**
 * Napredek naloge po dogodku.
 * @param {{event:string, target:number, cmp?:string, goal?:number}} q
 * @param {{progress:number, data?:Object}} st
 * @param {{name:string, value?:number, game?:string}} ev
 * @returns {{progress:number, data:Object}|null} null = brez spremembe
 */
export function applyEvent(q, st, ev) {
  const progress = st?.progress || 0;
  const data = st?.data || {};
  if (progress >= q.target) return null;
  if (q.event === 'distinct') {
    if (ev.name !== 'play' || !ev.game) return null;
    const g = Array.isArray(data.g) ? data.g : [];
    if (g.includes(ev.game)) return null;
    const ng = [...g, ev.game].slice(0, 20);
    return { progress: Math.min(q.target, ng.length), data: { ...data, g: ng } };
  }
  if (ev.name !== q.event) return null;
  if (q.cmp) {
    const v = +ev.value;
    if (!Number.isFinite(v)) return null;
    if (q.cmp === 'lte' ? !(v <= q.goal) : !(v >= q.goal)) return null;
  }
  return { progress: Math.min(q.target, progress + 1), data };
}

/** Do konca dneva (ljubljanska polnoč) v ms. */
export function msUntil(next, now = Date.now()) { return Math.max(0, next - now); }
