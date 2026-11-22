/* =====================================================================
   HERODLE — lik dneva: en vir za vse načine.

     import * as daily from './daily.js';
     daily.init(hub, HEROES);                 // izbere adapter glede na hub.mode
     const { date, number } = await daily.getToday('klasika');
     const res = await daily.check('klasika', date, 'batman');   // { result, solved, heroId? }
     const id  = await daily.giveUp('klasika', date);             // razkrije lik dneva (predaja)
     const id2 = await daily.reveal('klasika', '2026-11-20');     // samo pretekli dnevi

   Načini z namigi (emoji, kostum, dosje — 2. faza):
     const r = await daily.check('dosje', date, 'batman');  // { solved, wrong, hints, lost, heroId? }
     const h = await daily.hints('dosje', date);            // { wrong, solved, lost, hints, heroId? }
   Namige, ki jih igralec sme videti, določa število napačnih poskusov (logic.hintStage).
   Online jih da strežnik (herodle_hints ni berljiva) in sam šteje napačne (herodle_progress);
   hints.js se online pred rešitvijo NE naloži. Offline: hints.js (dinamično) + napredek v shared/storage.js.

   Dva adapterja z ENAKIM vmesnikom:
   - online (Supabase RPC): lik dneva je v bazi (skrivna sol, herodle_daily ni berljiva);
     odgovor pred rešitvijo vsebuje SAMO barve.
   - offline (?offline=1 ali brez Supabasea): lik iz hub.rng (namenoma drug razpored),
     upošteva razvojni parameter ?date=YYYY-MM-DD.
   ===================================================================== */

import {
  compare, inPool, offlineHeroId, puzzleNumber, isValidDate, OFFLINE_ORIGIN, ALL_MODE_IDS, isHintMode, stepGuess, visibleHints, dossierLost,
} from './logic.js';
import * as S from '../../shared/storage.js';

let adapter = null;

function param(name) {
  try { return new URLSearchParams(location.search).get(name); } catch { return null; }
}
const err = (code, message = code) => Object.assign(new Error(message), { code });

/* ---------------------------------------------------------------- offline */
function offlineAdapter(hub, heroes) {
  const byId = new Map(heroes.map(h => [h.id, h]));
  const p = param('date');
  const forced = isValidDate(p) && p >= OFFLINE_ORIGIN ? p : null;
  const today = () => forced || hub.dailySeed();
  const target = (mode, date) => byId.get(offlineHeroId(mode, date, heroes));
  const guard = (mode, date) => {
    if (!ALL_MODE_IDS.includes(mode)) throw err('invalid_mode');
    if (!isValidDate(date) || date < OFFLINE_ORIGIN) throw err('invalid_date');
    if (date > today()) throw err('future_date', 'Ta dan še ni prišel.');
  };
  // napredek načinov z namigi (kot herodle_progress na strežniku)
  const pk = (mode, date) => `herodle:offprog:${String(hub.userId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '')}:${mode}:${date}`;
  const prog = (mode, date) => ({ wrong: 0, solved: false, ...(S.load(pk(mode, date), {}) || {}) });
  const hintsFor = async (mode, date, wrong) => {
    const t = target(mode, date);
    const { HINTS } = await import('./hints.js');
    return visibleHints(mode, HINTS[t.id], wrong, t);
  };
  const hintState = async (mode, date) => {
    const p = prog(mode, date);
    const t = target(mode, date);
    const lost = mode === 'dosje' && dossierLost(p.wrong) && !p.solved;
    const out = { wrong: p.wrong, solved: !!p.solved, lost, hints: await hintsFor(mode, date, p.wrong) };
    if (p.solved || lost) out.heroId = t.id;
    return out;
  };
  return {
    kind: 'offline',
    simulated: !!forced,
    today,
    async hints(mode, date) {
      guard(mode, date);
      if (!isHintMode(mode)) throw err('invalid_mode');
      return hintState(mode, date);
    },
    async check(mode, date, heroId) {
      guard(mode, date);
      const g = byId.get(heroId);
      if (!g) throw err('unknown_hero');
      if (isHintMode(mode)) {
        const t = target(mode, date);
        const r = stepGuess(mode, prog(mode, date), g.id, t.id);
        S.save(pk(mode, date), { wrong: r.wrong, solved: r.solved });
        const out = { solved: r.solved, wrong: r.wrong, lost: r.lost, hints: await hintsFor(mode, date, r.wrong) };
        if (r.solved || r.lost) out.heroId = t.id;
        return out;
      }
      if (!inPool(mode, g)) throw err('not_in_pool', 'Ta lik ni v tem bazenu.');
      const t = target(mode, date);
      const solved = t.id === g.id;
      return solved ? { solved, result: compare(g, t), heroId: t.id } : { solved, result: compare(g, t) };
    },
    async giveUp(mode, date) { guard(mode, date); return target(mode, date).id; },
    async reveal(mode, date) {
      guard(mode, date);
      if (date >= today()) throw err('not_past', 'Današnji lik se razkrije le s predajo.');
      return target(mode, date).id;
    },
  };
}

/* ---------------------------------------------------------------- online */
function onlineAdapter(hub) {
  const client = hub.backend.client;
  const call = async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      const m = /(not_authenticated|invalid_mode|invalid_date|future_date|unknown_hero|not_in_pool|not_past|no_puzzle|finished|no_profile)/.exec(error.message || '');
      throw err(m ? m[1] : 'rpc', m ? MSG[m[1]] || m[1] : error.message);
    }
    return data;
  };
  return {
    kind: 'online',
    simulated: false,
    today: () => hub.dailySeed(),   // ?date se namenoma ignorira
    async hints(mode, date) {
      const d = await call('herodle_hint', { p_mode: mode, p_date: date });
      return { wrong: d.wrong, solved: !!d.solved, lost: !!d.lost, hints: d.hints, ...(d.hero_id ? { heroId: d.hero_id } : {}) };
    },
    async check(mode, date, heroId) {
      const d = await call('herodle_check', { p_mode: mode, p_date: date, p_hero_id: heroId });
      if (isHintMode(mode)) return { solved: !!d.solved, wrong: d.wrong, lost: !!d.lost, hints: d.hints, ...(d.hero_id ? { heroId: d.hero_id } : {}) };
      return d.solved ? { solved: true, result: d.result, heroId: d.hero_id } : { solved: false, result: d.result };
    },
    async giveUp(mode, date) { return (await call('herodle_reveal', { p_mode: mode, p_date: date, p_give_up: true })).hero_id; },
    async reveal(mode, date) { return (await call('herodle_reveal', { p_mode: mode, p_date: date, p_give_up: false })).hero_id; },
  };
}

const MSG = {
  future_date: 'Ta dan še ni prišel.',
  not_in_pool: 'Ta lik ni v tem bazenu.',
  not_past: 'Današnji lik se razkrije le s predajo.',
  unknown_hero: 'Neznan lik.',
  not_authenticated: 'Nisi prijavljen.',
  finished: 'Ta uganka je že končana.',
  no_profile: 'Najprej si nastavi vzdevek.',
};

/**
 * Izberi adapter (enkrat, po hub.init).
 * @param {any} hub
 * @param {any[]} heroes
 */
export function init(hub, heroes) {
  adapter = hub.mode === 'supabase' && hub.backend?.client ? onlineAdapter(hub) : offlineAdapter(hub, heroes);
  return adapter;
}

const need = () => { if (!adapter) throw new Error('daily.init() ni bil poklican'); return adapter; };

/** Ali teče simulacija datuma (?date, samo offline). */
export const isSimulated = () => need().simulated;
/** Današnji datum igre ('YYYY-MM-DD'). */
export const today = () => need().today();

/** Uganka dneva za način (brez lika!). */
export async function getToday(mode) {
  const date = need().today();
  return { mode, date, number: puzzleNumber(date) };
}
/** Rezultat primerjave poskusa z likom dneva. */
export const check = (mode, date, heroId) => need().check(mode, date, heroId);
/** Predaja: razkrije današnji lik (online zapiše predajo). */
export const giveUp = (mode, date) => need().giveUp(mode, date);
/** Lik preteklega dne (arhiv). */
export const reveal = (mode, date) => need().reveal(mode, date);
/** Vidni namigi današnje uganke načina z namigi (osvežitev strani). */
export const hints = (mode, date) => need().hints(mode, date);
