/* =====================================================================
   LESTVICA — skupna lestvica huba, po uporabniku (portal)
   Rezultati gredo prek hub.submitScore v game_scores (vezano na user_id;
   ime in avatar iz profila). seed = 'miza:<id>:f<PHYSICS_VERSION>', zato so
   rezultati vedno primerljivi; ob novi verziji fizike se lestvica začne
   na novo, stare ostanejo (zavihek »Prejšnje verzije«).
   Arhiv: stara tabela public.scores (inicialke iz časa pred portalom) se
   samo še BERE (zavihek »Arhiv (pred portalom)«), vanjo ne pišemo.
   Offline (?offline=1): isti API prek lokalnega adapterja huba.
   ===================================================================== */
import { PHYSICS_VERSION } from './config.js';

const SHARED = '../../../../shared/';
let hub = null, ui = null, cfg = null, ready = null;
let tableId = 'alu';
let top = [];
const listeners = [];

export const seedFor = (id, v = PHYSICS_VERSION) => `miza:${id}:f${v}`;
export const seed = () => seedFor(tableId);
export function onChange(fn) { listeners.push(fn); }
const changed = () => listeners.forEach(fn => { try { fn(); } catch (e) { /* ignoriraj */ } });

/** naloži hub (enkrat); igra deluje tudi, če hub ni dosegljiv */
export function init(id) {
  tableId = id || 'alu';
  if (!ready) {
    ready = Promise.all([import(SHARED + 'hub.js'), import(SHARED + 'config.js')]).then(async ([m, c]) => {
      hub = m.hub; ui = m.ui; cfg = c;
      await hub.init({ gameId: 'pinball', requireProfile: false });
    }).catch(e => { console.warn('pinball: hub ni na voljo', e); hub = null; });
  }
  return ready;
}
export const whenReady = () => ready || Promise.resolve();
export const hasHub = () => !!hub;
export const hubApi = () => ({ hub, ui });
export const hasProfile = () => !!(hub && hub.profile && hub.profile.nickname);

/** top 10 trenutne mize in verzije fizike */
export async function refresh() {
  await whenReady();
  if (!hub) return top;
  try {
    const rows = await hub.getLeaderboard({ seed: seed(), limit: 10 });
    top = rows.map(r => ({ name: r.nickname || '???', score: Number(r.score), p: r, me: r.user_id === hub.userId }));
    changed();
  } catch (e) { /* brez povezave: ostane zadnja znana lestvica */ }
  return top;
}
export const scores = () => top.slice();

/** se rezultat uvrsti na top 10? */
export function qualifies(score) {
  if (score <= 0) return false;
  return top.length < 10 || score > top[top.length - 1].score;
}

/** odpre okno za profil (vzdevek, avatar); vrne true, ko profil obstaja */
export async function ensureProfile() {
  await whenReady();
  if (!hub) return false;
  if (hasProfile()) return true;
  try { await ui.profileModal(); } catch (e) { /* zaprto */ }
  return hasProfile();
}

/**
 * shrani rezultat na lestvico huba (pod prijavljenim uporabnikom).
 * d: podatki dogodka gameOver; vrne { ok, rank, reason }
 */
export async function submit(d) {
  await whenReady();
  if (!hub) return { ok: false, reason: 'hub' };
  if (!hasProfile()) return { ok: false, reason: 'profile' };
  const score = Math.round(d.score || 0);
  if (score <= 0) return { ok: false, reason: 'zero' };
  const meta = {
    miza: tableId, fizika: PHYSICS_VERSION,
    sec: Math.round(d.playSec || 0), balls: d.balls || 0, multiballs: d.multiballs || 0,
    modes: d.modes || 0, wizards: d.wizards || 0, maxJackpot: Math.round(d.maxJackpot || 0), maxCombo: d.maxCombo || 0,
    konec: d.tilted ? 'tilt' : 'drain', match: d.match ? !!d.match.hit : false,
  };
  const ok = await hub.submitScore(score, { seed: seed(), meta });
  await refresh();
  const rank = top.findIndex(r => r.me && r.score === score);
  return { ok: ok !== null && ok !== false, rank };
}

/** XP, kovanci, niz dni in naloge huba (hub.reportGame) — enkrat po vsaki igri */
export async function report(d) {
  await whenReady();
  if (!hub || !hub.profile) return;
  try {
    await hub.awardXp(Math.min(200, 20 + Math.floor((d.score || 0) / 1e6) * 5), 'pinball');
    await hub.reportGame({ players: 1, score: Math.round(d.score || 0) });
  } catch (e) { /* hub ni dosegljiv */ }
}

/** prejšnje verzije fizike te mize: [{ label, seed }] (najnovejša prva) */
export function previousSeeds() {
  const out = [];
  for (let v = PHYSICS_VERSION - 1; v >= 1; v--) out.push({ label: 'f' + v, seed: seedFor(tableId, v) });
  return out;
}

/** arhiv: stara lestvica z inicialkami (public.scores) — samo branje, samo Alu miza */
export async function archive() {
  await whenReady();
  if (!hub || hub.offline || !cfg || !cfg.SUPABASE_URL) return null;
  try {
    const res = await fetch(cfg.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/scores?select=name,score,created_at&order=score.desc,created_at.asc&limit=10',
      { headers: { apikey: cfg.SUPABASE_ANON_KEY } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    return rows.map(r => ({ name: String(r.name), score: Number(r.score), date: String(r.created_at || '').slice(0, 10) }));
  } catch (e) { return null; }
}

/** HTML igralca (avatar + vzdevek z opremo) prek skupnega UI */
export function who(row) {
  if (ui && row.p) return ui.who(row.p, 'sm', { title: false });
  return String(row.name).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
