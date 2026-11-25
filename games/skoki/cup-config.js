/* =====================================================================
   SMUČARSKI SKOKI — cup-config.js: svetovni pokal in kariera (brez DOM-a).
   Skakalni del koledarja (katere skakalnice, pogoji, veter, zalet) in lige
   kariere. Splošna logika je v shared/sport/season.js in career.js.
   Uporabljata ga igra (cup.js, career-ui.js) in orodje tools/skoki-cup-sql.mjs
   (okna postaj za tabelo skoki_cup_events) — zato mora ostati deterministično.
   ===================================================================== */
import * as SE from '../../shared/sport/season.js';

export const CUP_NAME = 'Pokal';
export const CUP_SEED = 'skoki-pokal-1';
export const TOUR_NAME = 'Turneja 4 skakalnic';

/** Pokal se skače samo na pravih skakalnicah (skupina »prave«). */
export const CUP_VENUES = ['planica-velika', 'oberstdorf', 'garmisch', 'innsbruck', 'bischofshofen', 'zakopane', 'willingen', 'lahti', 'engelberg', 'planica-srednja'];
/** Finale je vedno na letalnici (praviloma Planica). */
export const CUP_FINALS = ['planica-letalnica', 'kulm', 'vikersund', 'oberstdorf-letalnica'];
/** Ena letalnica sredi sezone (»Kralj letalnic«). */
export const CUP_EXTRA = ['kulm', 'vikersund', 'oberstdorf-letalnica'];
/** Turneja: štiri zaporedne postaje pred finalom v decembrski sezoni. */
export const TOUR = { venues: ['oberstdorf', 'garmisch', 'innsbruck', 'bischofshofen'], months: [11] };
/** Pogoji postaj (id-ji iz contest.CONDITIONS; 'none' = brez); brez Lune in »samo telemark«. */
export const CUP_CONDITIONS = [{ id: 'none', weight: 6 }, { id: 'sneg', weight: 1.2 }, { id: 'noc', weight: 1.5 }, { id: 'sunki', weight: 1 }];
export const FLYING = new Set(CUP_FINALS);

/** Koledar sezone pokala (isti v igri, testih in SQL orodju). */
export function cupCalendar(season) {
  const cal = SE.calendar(season, { venues: CUP_VENUES, finals: CUP_FINALS, extra: CUP_EXTRA, tour: TOUR, conditions: CUP_CONDITIONS, seed: CUP_SEED, windMax: 1.5 });
  cal.name = SE.seasonName(season, CUP_NAME);
  return cal;
}

/** Kraj postaje za ime (»Postaja 4: Zakopane«): kraj iz real.venue skakalnice. */
export function venueName(def) {
  const v = def?.real?.venue || def?.name || '';
  return v === 'Tauplitz / Bad Mitterndorf' ? 'Kulm' : v;
}

/* ------------------------------------------------------------ kariera */

/** Velikost skakalnice → oznaka prizorišča za ligo. */
export const sizeTag = def => def.size || 'velika';
/** Lige kariere: Celinski pokal (mini, mala, srednja) → Svetovni pokal (srednja, velika) → Poleti (velika, letalnica). */
export const LEAGUES = [
  { id: 'celinski', name: 'Celinski pokal', tags: ['mini', 'mala', 'srednja'], skill: [0.18, 0.62], events: [6, 7] },
  { id: 'svetovni', name: 'Svetovni pokal', tags: ['srednja', 'velika'], skill: [0.42, 0.86], events: [7, 8] },
  { id: 'poleti', name: 'Poleti', tags: ['velika', 'letalnica'], skill: [0.6, 0.97], events: [6, 8] },
];
/** Rivali so »mojstri« na teh oznakah. */
export const SPEC_TAGS = ['letalnica', 'srednja', 'velika'];

/** Prizorišča kariere: vse skakalnice razen Lune ({ id, tag }). */
export const careerVenues = defs => defs.filter(d => !d.physics?.noAir).map(d => ({ id: d.id, tag: sizeTag(d) }));
