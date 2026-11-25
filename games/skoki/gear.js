/* =====================================================================
   SMUČARSKI SKOKI — gear.js: oprema skakalca iz trgovine (»Za igre«) →
   videz (skin) za izris. Samo videz: fizika je za vse enaka.
   Predmeti so v shared/cosmetics.js (GAME_ITEMS, game: 'skoki'),
   opremljeni v equipped.games.skoki.<slot> (profil, presence, lestvice).
   ===================================================================== */
import { cosmetics as K } from '../../shared/hub.js';
import { DEFAULT_SKIN } from './render/jumper.js';

export const GAME = 'skoki';
export const SLOTS = K.GAME_SLOTS[GAME];

/** Opremljeni predmeti igralca: { suit, helmet, skis, flag } (predmet ali null). */
export function gearOf(equipped) {
  return Object.fromEntries(SLOTS.map(s => [s, K.gameItemOf(equipped, GAME, s)]));
}

/** Ali ima igralec kaj opreme za skoke? */
export const hasGear = equipped => SLOTS.some(s => K.gameItemOf(equipped, GAME, s));

/**
 * Videz skakalca iz opreme (equipped profila/igralca); brez opreme = base (privzeti ali barve lokalnega skakalca).
 * @param {Object|null} equipped
 * @param {Object} [base] DEFAULT_SKIN ali skin lokalnega skakalca
 */
export function skinFromEquipped(equipped, base = DEFAULT_SKIN) {
  const g = gearOf(equipped);
  if (!g.suit && !g.helmet && !g.skis && !g.flag) return base;
  const s = { ...base };
  if (g.suit) { s.suit = g.suit.value.suit; s.suit2 = g.suit.value.suit2; }
  if (g.helmet) { s.helmet = g.helmet.value.helmet; if (g.helmet.value.goggles) s.goggles = g.helmet.value.goggles; }
  if (g.skis) { s.skis = g.skis.value.skis; s.skiTip = g.skis.value.skiTip; }
  if (g.flag) { s.flag = g.flag.value.colors.slice(); s.crowdFlag = g.flag.value.colors.slice(); }
  s.id = 'g-' + SLOTS.map(k => g[k]?.id || '-').join('.');
  return s;
}

/** Zastavica ob imenu (emoji) ali ''. */
export function flagEmoji(equipped) {
  return K.gameItemOf(equipped, GAME, 'flag')?.value.emoji || '';
}

/** Oznaka rumene majice (vodilni v sezoni pokala). */
export const YELLOW = '<span class="sk-yellow" title="Rumena majica — vodilni v svetovnem pokalu">🟡</span>';
