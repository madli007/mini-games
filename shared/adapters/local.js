/* =====================================================================
   LOKALNI ADAPTER (offline način)
   Profil, XP, lestvice, dosežki, sobe in stanje v localStorage;
   realtime prek BroadcastChannel → multiplayer med zavihki istega brskalnika.

   Identiteta: vsak zavihek ima svoj userId v sessionStorage (preživi osvežitev).
   Prvi zavihek dobi »glavni« profil brskalnika; vsak naslednji hkrati odprt
   zavihek dobi svoj gostujoči profil (da lahko testiraš multiplayer sam).
   ===================================================================== */

import * as S from '../storage.js';
import {
  uuid, dailySeed, grantableXp, bestPerUser, makeRoomCode, normalizeRoomCode, level as levelOf,
} from '../util.js';
import { COINS, grantableCoins, isCapped, levelReward, nextStreak, gameRewards, offerPrice } from '../economy.js';
import { item as catalogItem, checkUnlock, isFree, dailyOffer, SLOTS, parseGameSlot } from '../cosmetics.js';
import { PERIOD_RE, QUEST_ID_RE, dayPeriod, weekPeriod } from '../quests.js';

const LEASE_MS = 6000;           // glavni profil je zaseden, dokler ga zavihek osvežuje
const PRESENCE_BEAT = 1000;      // presence utrip
const PRESENCE_TIMEOUT = 3500;   // brez utripa → igralec ni več prisoten
const ROOM_TTL = 24 * 3600e3;    // stare sobe se pobrišejo
const HOST_STALE_MS = 30000;     // soba brez utripa hosta → prevzem hosta dovoljen vsem
const GHOST_MAX = 60000;         // največja dolžina podatkov ghosta (znaki base64)
const LEVEL_MAX = 60000;         // največja velikost objavljene proge (znaki JSON)
const LEVELS_PER_USER = 20;      // največ objavljenih prog na igralca

const now = () => new Date().toISOString();

/** Napaka z oznako (enake oznake kot v supabase adapterju). */
export function codedError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

/** Profil z vsemi polji (stari lokalni profili nimajo kovancev in opreme). */
function withDefaults(p) {
  return { coins: 0, equipped: {}, streak: 0, best_streak: 0, streak_day: null, ...p };
}

/** Ustvari BroadcastChannel ali null (če ga okolje nima). */
function bc(name) {
  try { return typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null; } catch { return null; }
}

export class LocalBackend {
  /**
   * @param {{userId?:string}} [opt] userId: vsili identiteto (testi, ?igralec=N)
   */
  constructor(opt = {}) {
    this.kind = 'local';
    this.opt = opt;
    this.userId = null;
    this.tabId = uuid();
    this._lobbyCh = null;
    this._timers = [];
  }

  /* ------------------------------ identiteta ------------------------------ */

  async init() {
    if (this.opt.userId) { this.userId = this.opt.userId; return this.userId; }
    let id = S.load('sessionUser', null, 'session');
    if (!id) {
      const main = S.load('mainUser', null) || uuid();
      S.save('mainUser', main);
      const lease = S.load('mainLease', null);
      const free = !lease || Date.now() - lease.ts > LEASE_MS;
      id = free ? main : uuid();
      S.save('sessionUser', id, 'session');
    }
    this.userId = id;
    // glavni profil: osvežuj zakup, da ga drugi zavihki ne prevzamejo
    if (id === S.load('mainUser', null) && typeof setInterval === 'function' && typeof window !== 'undefined') {
      const beat = () => S.save('mainLease', { tab: this.tabId, ts: Date.now() });
      beat();
      this._timers.push(setInterval(beat, 2000));
      window.addEventListener('pagehide', () => S.remove('mainLease'));
    }
    return id;
  }

  /** Ali je ta zavihek gost (ne glavni profil brskalnika)? */
  get isGuest() {
    return !this.opt.userId && this.userId !== S.load('mainUser', null);
  }

  dispose() {
    this._timers.forEach(clearInterval);
    this._lobbyCh?.close();
  }

  /* ------------------------------- profil -------------------------------- */

  _profiles() { return S.load('db:profiles', {}); }

  async getProfile(id = this.userId) {
    const p = this._profiles()[id];
    return p ? withDefaults(p) : null;
  }

  async saveProfile({ nickname, avatar }) {
    const nick = String(nickname).trim();
    const all = this._profiles();
    const taken = Object.values(all).some(p => p.id !== this.userId && p.nickname.toLowerCase() === nick.toLowerCase());
    if (taken) throw codedError('nickname_taken', 'Ta vzdevek je že zaseden.');
    const cur = all[this.userId];
    const p = cur
      ? { ...cur, nickname: nick, avatar: avatar || cur.avatar, updated_at: now() }
      : { id: this.userId, nickname: nick, avatar, xp: 0, created_at: now(), updated_at: now() };
    all[this.userId] = p;
    S.save('db:profiles', all);
    return withDefaults(p);
  }

  async getProfiles(ids) {
    const all = this._profiles();
    return ids.map(id => all[id]).filter(Boolean).map(withDefaults);
  }

  async topXp(limit = 10) {
    return Object.values(this._profiles()).map(withDefaults).sort((a, b) => b.xp - a.xp).slice(0, limit);
  }

  /* --------------------------------- XP ---------------------------------- */

  async awardXp(amount, reason) {
    const all = this._profiles();
    const p = all[this.userId];
    if (!p) return { xp: 0, granted: 0 };
    const day = dailySeed();
    const log = S.load('db:xplog', {});
    const mine = log[this.userId]?.day === day ? log[this.userId] : { day, used: 0 };
    const granted = grantableXp(amount, mine.used);
    let levelCoins = 0;
    if (granted > 0) {
      mine.used += granted;
      log[this.userId] = mine;
      S.save('db:xplog', log);
      const before = levelOf(p.xp).level;
      p.xp += granted;
      S.save('db:profiles', all);
      for (let l = before + 1; l <= levelOf(p.xp).level; l++) levelCoins += this._grant(levelReward(l), 'level', String(l));
    }
    return { xp: p.xp, granted, reason, coins: (await this.getProfile()).coins, level_coins: levelCoins };
  }

  /* ------------------------------ kovanci -------------------------------- */
  // Enaka pravila kot private.grant_coins / report_game / buy_item … v schema.sql.

  _ledger(uid = this.userId) { return S.load('db:ledger', {})[uid] || []; }

  /** Danes zasluženo z viri pod dnevno mejo (pozitivni vnosi brez nalog). */
  _earnedToday(uid = this.userId) {
    const d = dailySeed();
    return this._ledger(uid).filter(l => l.day === d && l.amount > 0 && isCapped(l.reason)).reduce((a, l) => a + l.amount, 0);
  }

  _log(amount, reason, ref = null) {
    S.update('db:ledger', all => {
      const list = all[this.userId] || [];
      list.push({ day: dailySeed(), amount, reason, ref, created_at: now() });
      all[this.userId] = list.slice(-800);
      return all;
    }, {});
  }

  /** Podeli kovance (skozi dnevno mejo, če vir šteje vanjo). Vrne podeljeno. */
  _grant(amount, reason, ref = null, perCall = Infinity) {
    const all = this._profiles();
    const p = all[this.userId];
    if (!p) return 0;
    const g = isCapped(reason) ? grantableCoins(amount, this._earnedToday(), perCall) : Math.max(0, Math.floor(amount || 0));
    if (g > 0) {
      this._log(g, reason, ref);
      p.coins = (p.coins || 0) + g;
      S.save('db:profiles', all);
    }
    return g;
  }

  async awardCoins(amount, reason = '', ref = null) {
    if (!(await this.getProfile())) throw codedError('no_profile');
    const granted = this._grant(amount, 'bonus:' + String(reason || '').slice(0, 30), ref, COINS.PER_CALL);
    return { coins: (await this.getProfile()).coins, granted };
  }

  async reportGame({ game, won = false, players = 1 }) {
    const all = this._profiles();
    const p = all[this.userId];
    if (!p) throw codedError('no_profile', 'Najprej izberi vzdevek.');
    if (!/^[a-z0-9-]{1,32}$/.test(game || '')) throw codedError('invalid');
    const d = dailySeed();
    const st = nextStreak(p.streak_day || null, d, p.streak || 0);
    if (st.first) {
      p.streak = st.streak;
      p.best_streak = Math.max(p.best_streak || 0, st.streak);
      p.streak_day = d;
      S.save('db:profiles', all);
    }
    const today = this._ledger().filter(l => l.day === d);
    const rw = gameRewards({
      won, players, firstToday: st.first, streak: st.streak,
      gamesToday: today.filter(l => l.reason === 'game').length, winsToday: today.filter(l => l.reason === 'win').length,
    });
    const gSt = rw.streak ? this._grant(rw.streak, 'streak', String(st.streak)) : 0;
    const gGame = rw.game ? this._grant(rw.game, 'game', game) : 0;
    const gWin = rw.win ? this._grant(rw.win, 'win', game) : 0;
    return {
      coins: (await this.getProfile()).coins, granted: gSt + gGame + gWin, game: gGame, win: gWin,
      streak: st.streak, streak_bonus: gSt, first: st.first,
      capped: rw.game > 0 && gGame === 0,
    };
  }

  /* ------------------------- trgovina in oprema -------------------------- */

  _inv(uid = this.userId) { return S.load('db:inventory', {})[uid] || {}; }

  async getInventory(userId = this.userId) {
    return Object.entries(this._inv(userId)).map(([item_id, v]) => ({ user_id: userId, item_id, ...v }));
  }

  /** Stanje za preverjanje pogojev (nivo, dosežki, niz). */
  async unlockState(uid = this.userId) {
    const p = await this.getProfile(uid);
    const ach = (await this.getAchievements({ userId: uid })).map(a => a.game + ':' + a.key);
    return { level: levelOf(p?.xp || 0).level, achievements: ach, streak: Math.max(p?.streak || 0, p?.best_streak || 0) };
  }

  _addInv(itemId, source) {
    S.update('db:inventory', all => {
      all[this.userId] = { ...(all[this.userId] || {}), [itemId]: { acquired_at: now(), source } };
      return all;
    }, {});
  }

  async buyItem(itemId) {
    const all = this._profiles();
    const p = all[this.userId];
    if (!p) throw codedError('no_profile');
    const it = catalogItem(itemId);
    if (!it || it.active === false) throw codedError('unavailable', 'Predmet ni na voljo.');
    if (this._inv()[it.id]) throw codedError('owned', 'Ta predmet že imaš.');
    if (!checkUnlock(it.unlock, await this.unlockState()).ok) throw codedError('locked', 'Predmet je zaklenjen.');
    const price = dailyOffer(dailySeed()).includes(it.id) ? offerPrice(it.price) : it.price;
    if ((p.coins || 0) < price) throw codedError('not_enough_coins', 'Premalo kovancev.');
    p.coins = (p.coins || 0) - price;
    S.save('db:profiles', all);
    this._addInv(it.id, price > 0 ? 'buy' : 'unlock');
    if (price > 0) this._log(-price, 'buy', it.id);
    return { coins: p.coins, price, item: it.id };
  }

  async unlockItem(itemId) {
    if (!(await this.getProfile())) throw codedError('no_profile');
    const it = catalogItem(itemId);
    if (!it || it.active === false) throw codedError('unavailable', 'Predmet ni na voljo.');
    if (it.price > 0) throw codedError('not_free', 'Predmet je treba kupiti.');
    if (this._inv()[it.id]) throw codedError('owned', 'Ta predmet že imaš.');
    if (!checkUnlock(it.unlock, await this.unlockState()).ok) throw codedError('locked', 'Predmet je zaklenjen.');
    this._addInv(it.id, 'unlock');
    return { item: it.id };
  }

  async equip(slot, itemId = null) {
    const gs = parseGameSlot(slot);
    if (!SLOTS.includes(slot) && !gs) throw codedError('invalid', 'Neznan slot.');
    const all = this._profiles();
    const p = all[this.userId];
    if (!p) throw codedError('no_profile');
    const eq = { ...(p.equipped || {}) };
    if (gs) {
      // predmet za igro: equipped.games.<igra>.<slot> (enako kot private.equip v schema.sql)
      const games = { ...(eq.games || {}) };
      const g = { ...(games[gs.game] || {}) };
      if (itemId == null) delete g[gs.slot];
      else {
        const it = catalogItem(itemId);
        if (!it || it.kind !== 'game' || it.game !== gs.game || it.slot !== gs.slot) throw codedError('invalid', 'Napačen predmet.');
        if (!this._inv()[it.id] && !(isFree(it) && it.active !== false)) throw codedError('not_owned', 'Tega predmeta nimaš.');
        g[gs.slot] = it.id;
      }
      if (Object.keys(g).length) games[gs.game] = g; else delete games[gs.game];
      if (Object.keys(games).length) eq.games = games; else delete eq.games;
      p.equipped = eq;
      S.save('db:profiles', all);
      return eq;
    }
    if (itemId == null) delete eq[slot];
    else {
      const it = catalogItem(itemId);
      if (!it || it.kind !== slot) throw codedError('invalid', 'Napačen predmet.');
      if (!this._inv()[it.id] && !(isFree(it) && it.active !== false)) throw codedError('not_owned', 'Tega predmeta nimaš.');
      eq[slot] = it.id;
    }
    p.equipped = eq;
    S.save('db:profiles', all);
    return eq;
  }

  /* ------------------------------- naloge -------------------------------- */

  _quests(uid = this.userId) { return S.load('db:quests', {})[uid] || {}; }

  async getQuestProgress(periods) {
    const mine = this._quests();
    return Object.entries(mine)
      .map(([k, v]) => { const [period, quest_id] = k.split('|'); return { period, quest_id, progress: v.progress, data: v.data || {}, claimed_at: v.claimed_at || null }; })
      .filter(r => periods.includes(r.period));
  }

  async saveQuestProgress({ period, quest_id, progress, data = {} }) {
    if (!PERIOD_RE.test(period) || !QUEST_ID_RE.test(quest_id)) throw codedError('invalid');
    let out = 0;
    S.update('db:quests', all => {
      const mine = all[this.userId] || {};
      const cut = Date.now() - 21 * 864e5;
      for (const [kk, v] of Object.entries(mine)) if (v.updated && v.updated < cut) delete mine[kk];
      const k = period + '|' + quest_id;
      const cur = mine[k] || { progress: 0, data: {}, claimed_at: null };
      out = Math.max(cur.progress || 0, Math.max(0, Math.min(1000, progress | 0)));
      mine[k] = { ...cur, progress: out, data, updated: Date.now() };
      all[this.userId] = mine;
      return all;
    }, {});
    return out;
  }

  async claimQuest(period, questId) {
    if (!(await this.getProfile())) throw codedError('no_profile');
    if (!PERIOD_RE.test(period || '') || !QUEST_ID_RE.test(questId || '')) throw codedError('invalid');
    const slot = questId.split('.')[0];
    const d = dailySeed();
    if (period === dayPeriod(d)) { if (!['e', 'm', 'h'].includes(slot)) throw codedError('invalid'); }
    else if (period === weekPeriod(d)) { if (!['w1', 'w2'].includes(slot)) throw codedError('invalid'); }
    else throw codedError('expired', 'Naloga je potekla.');
    const claimedSlots = Object.entries(this._quests())
      .filter(([k, v]) => k.startsWith(period + '|') && v.claimed_at)
      .map(([k]) => k.split('|')[1].split('.')[0]);
    if (claimedSlots.includes(slot)) throw codedError('claimed', 'Nagrada je že prevzeta.');
    S.update('db:quests', all => {
      const m = all[this.userId] || {};
      const k = period + '|' + questId;
      m[k] = { progress: 0, data: {}, ...(m[k] || {}), claimed_at: now(), updated: Date.now() };
      all[this.userId] = m;
      return all;
    }, {});
    const reward = COINS.QUEST[slot];
    const g = this._grant(reward, 'quest', period + '/' + slot);
    let bonus = 0;
    if (['e', 'm', 'h'].includes(slot) && claimedSlots.length + 1 === 3) bonus = this._grant(COINS.ALL_DAILY_BONUS, 'quest_bonus', period);
    return { coins: (await this.getProfile()).coins, granted: g + bonus, reward, bonus };
  }

  /* ------------------------------ lestvice ------------------------------- */

  async submitScore({ game, score, seed = null, meta = {} }) {
    const row = { id: uuid(), game, user_id: this.userId, score: Math.round(score), seed, meta, created_at: now() };
    S.update('db:scores', rows => { rows.push(row); return rows.slice(-5000); }, []);
    return row;
  }

  async getLeaderboard({ game, seed = null, since = null, limit = 10, asc = false }) {
    const rows = S.load('db:scores', []).filter(r => r.game === game);
    const best = bestPerUser(rows, { seed, since, asc, limit });
    const all = this._profiles();
    return best.map(r => ({
      user_id: r.user_id, score: r.score, created_at: r.created_at,
      nickname: all[r.user_id]?.nickname || '???', avatar: all[r.user_id]?.avatar || { emoji: '❔', color: '#888' },
      equipped: all[r.user_id]?.equipped || {},
    }));
  }

  async getTopScores({ game, seed = null, limit = 10, asc = false }) {
    const all = this._profiles();
    return S.load('db:scores', [])
      .filter(r => r.game === game && (seed == null || r.seed === seed))
      .sort((a, b) => (asc ? a.score - b.score : b.score - a.score) || (a.created_at < b.created_at ? -1 : 1))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map(r => ({
        user_id: r.user_id, score: r.score, meta: r.meta || {}, created_at: r.created_at,
        nickname: all[r.user_id]?.nickname || '???', avatar: all[r.user_id]?.avatar || { emoji: '❔', color: '#888' },
        equipped: all[r.user_id]?.equipped || {},
      }));
  }

  async getMyBest({ game, seed = null, asc = false }) {
    const mine = S.load('db:scores', []).filter(r => r.game === game && r.user_id === this.userId && (seed == null || r.seed === seed));
    if (!mine.length) return null;
    return mine.reduce((b, r) => (asc ? r.score < b : r.score > b) ? r.score : b, mine[0].score);
  }

  /* ------------------------------ dosežki -------------------------------- */

  async unlock({ game, key, title = null, icon = null }) {
    const list = S.load('db:ach', []);
    if (list.some(a => a.user_id === this.userId && a.game === game && a.key === key)) return false;
    list.push({ user_id: this.userId, game, key, title, icon, unlocked_at: now() });
    S.save('db:ach', list);
    this._grant(COINS.ACHIEVEMENT, 'ach', game + ':' + key);
    return true;
  }

  async getAchievements({ game = null, userId = this.userId } = {}) {
    return S.load('db:ach', []).filter(a => a.user_id === userId && (!game || a.game === game));
  }

  /* ------------------------------- ghosti -------------------------------- */
  // Ena vožnja na (igra, proga, zrcalo, igralec); shrani se le boljši čas (kot RPC <igra>_save_ghost).

  // order 'desc': več je bolje (npr. točke skoka v polju time_ms, Smučarski skoki).
  async saveGhost({ game, level, mirror = false, timeMs, data, order = 'asc' }) {
    if (!(timeMs > 0) || typeof data !== 'string' || data.length > GHOST_MAX || !/^[A-Za-z0-9+/=]*$/.test(data)) {
      throw codedError('invalid', 'Neveljaven ghost.');
    }
    const key = `${game}|${level}|${mirror ? 1 : 0}|${this.userId}`;
    const all = S.load('db:ghosts', {});
    const cur = all[key];
    if (cur && (order === 'desc' ? cur.time_ms >= timeMs : cur.time_ms <= timeMs)) return { saved: false };
    all[key] = { game, level, mirror: !!mirror, user_id: this.userId, time_ms: Math.round(timeMs), data, created_at: now() };
    S.save('db:ghosts', all);
    return { saved: true };
  }

  async getGhosts({ game, level, mirror = false, limit = 10, order = 'asc' }) {
    const profs = this._profiles();
    const dir = order === 'desc' ? -1 : 1;
    return Object.values(S.load('db:ghosts', {}))
      .filter(g => g.game === game && g.level === level && !!g.mirror === !!mirror)
      .sort((a, b) => (a.time_ms - b.time_ms) * dir).slice(0, limit)
      .map(g => ({
        user_id: g.user_id, time_ms: g.time_ms, created_at: g.created_at,
        nickname: profs[g.user_id]?.nickname || '???', avatar: profs[g.user_id]?.avatar || { emoji: '❔', color: '#888' },
        equipped: profs[g.user_id]?.equipped || {},
      }));
  }

  async getGhost({ game, level, mirror = false, userId = this.userId }) {
    const g = S.load('db:ghosts', {})[`${game}|${level}|${mirror ? 1 : 0}|${userId}`];
    return g ? { user_id: g.user_id, time_ms: g.time_ms, data: g.data } : null;
  }

  /* --------------------------- shranjen napredek --------------------------- */

  async loadSave({ game, slot = 'main' }) {
    const r = S.load('db:saves', {})[`${game}|${slot}|${this.userId}`];
    return r ? { data: r.data, rev: r.rev, updated_at: r.updated_at } : null;
  }

  async writeSave({ game, slot = 'main', data, rev = 0 }) {
    if (JSON.stringify(data).length > 60000) throw codedError('invalid', 'Zapis je prevelik.');
    const all = S.load('db:saves', {});
    all[`${game}|${slot}|${this.userId}`] = { data, rev: Math.max(0, Math.round(rev)), updated_at: now() };
    S.save('db:saves', all);
    return true;
  }

  /* ------------------------------- pokal --------------------------------- */
  // Enaka pravila kot RPC <igra>_cup_submit (supabase/games/skoki.sql): okno postaje (podano iz koledarja igre),
  // en zapis na serijo, 2. serija le z 1. serijo in uvrstitvijo med `cut`, velikost vnosov, smiselne točke.

  async cupSubmit({ game, season, event, round, points, dist = 0, inputs, paramsVersion = 1, window = null, now = Date.now(), cut = 30, maxPoints = 1000 }) {
    if (!(await this.getProfile())) throw codedError('no_profile', 'Najprej izberi vzdevek.');
    if (!/^\d{4}-\d{2}$/.test(season || '') || !(event >= 1 && event <= 40) || ![1, 2].includes(round)) throw codedError('cup_unknown', 'Neznana postaja.');
    if (!window || !(now >= window.opens && now < window.closes) || (round === 2 && now < window.r2)) throw codedError('cup_closed', 'Serija ni odprta.');
    if (typeof inputs !== 'string' || inputs.length > 6000 || !/^[A-Za-z0-9+/=]+$/.test(inputs)) throw codedError('cup_too_big', 'Zapis skoka je neveljaven ali prevelik.');
    if (!(points >= 0 && points <= maxPoints) || !(dist >= 0 && dist < 500)) throw codedError('cup_impossible', 'Nemogoč rezultat.');
    const all = S.load('db:cup', []);
    const mine = all.filter(r => r.game === game && r.season === season && r.event === event && r.user_id === this.userId);
    if (mine.some(r => r.round === round)) throw codedError('cup_already', 'To serijo si že skočil.');
    if (round === 2) {
      const my1 = mine.find(r => r.round === 1);
      if (!my1) throw codedError('cup_no_r1', 'Najprej skoči 1. serijo.');
      const better = all.filter(r => r.game === game && r.season === season && r.event === event && r.round === 1 && r.points > my1.points).length;
      if (better >= cut) throw codedError('cup_cut', 'Nisi se uvrstil v 2. serijo.');
    }
    const row = { game, season, event, round, user_id: this.userId, points: Math.round(points * 10) / 10, dist: Math.round(dist * 10) / 10, inputs, params_version: paramsVersion | 0, created_at: new Date(now).toISOString() };
    all.push(row);
    S.save('db:cup', all.slice(-4000));
    return { saved: true };
  }

  async cupStandings({ game, season }) {
    const profs = this._profiles();
    return S.load('db:cup', []).filter(r => r.game === game && r.season === season).map(({ inputs, game: _g, ...r }) => ({
      ...r, nickname: profs[r.user_id]?.nickname || '???', avatar: profs[r.user_id]?.avatar || { emoji: '❔', color: '#888' }, equipped: profs[r.user_id]?.equipped || {},
    }));
  }

  async cupJump({ game, season, event, round, userId }) {
    const r = S.load('db:cup', []).find(x => x.game === game && x.season === season && x.event === event && x.round === round && x.user_id === userId);
    return r ? { user_id: r.user_id, event: r.event, round: r.round, points: r.points, dist: r.dist, params_version: r.params_version, inputs: r.inputs } : null;
  }

  /* ------------------------ objavljene proge igralcev ------------------------ */
  // Enaka pravila kot RPC <igra>_publish_level: ime 2–40, hash 8 hex, ≤ 60.000 znakov, največ 20 na igralca.

  async publishLevel({ game, name, hash, data, devMs, replace = null }) {
    if (!(await this.getProfile())) throw codedError('no_profile', 'Najprej izberi vzdevek.');
    const nm = String(name || '').trim();
    const w = data?.size?.[0], d = data?.size?.[1];
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.map) || nm.length < 2 || nm.length > 40
      || !/^[0-9a-f]{8}$/.test(hash || '') || !(devMs > 0 && devMs < 600000)
      || !Number.isInteger(w) || !Number.isInteger(d) || w < 1 || w > 120 || d < 1 || d > 160) {
      throw codedError('invalid_level', 'Proga ni veljavna (ime 2–40 znakov, mreža, čas autopilota).');
    }
    if (JSON.stringify(data).length > LEVEL_MAX) throw codedError('level_too_big', 'Proga je prevelika za objavo (največ ~60 KB).');
    const all = S.load('db:levels', {});
    const row = { name: nm, data, dev_ms: Math.round(devMs), width: w, depth: d, updated_at: now() };
    const same = Object.values(all).find(l => l.game === game && l.user_id === this.userId && l.hash === hash);
    if (same) { Object.assign(same, row); S.save('db:levels', all); return { id: same.id, updated: true }; }
    if (replace && all[replace]?.user_id === this.userId) delete all[replace];
    if (Object.values(all).filter(l => l.game === game && l.user_id === this.userId).length >= LEVELS_PER_USER) {
      throw codedError('too_many_levels', 'Objaviš lahko največ 20 prog — najprej umakni katero od starih.');
    }
    const id = uuid();
    all[id] = { id, game, user_id: this.userId, hash, plays: 0, created_at: now(), ...row };
    S.save('db:levels', all);
    return { id, updated: false };
  }

  _levelOut(l, withData = false) {
    const p = this._profiles()[l.user_id];
    const o = { id: l.id, user_id: l.user_id, name: l.name, hash: l.hash, dev_ms: l.dev_ms, width: l.width, depth: l.depth, plays: l.plays, created_at: l.created_at,
      nickname: p?.nickname || '???', avatar: p?.avatar || { emoji: '❔', color: '#888' }, equipped: p?.equipped || {} };
    if (withData) o.data = JSON.parse(JSON.stringify(l.data));
    return o;
  }

  async listLevels({ game, sort = 'new', limit = 50, userId = null }) {
    const by = sort === 'popular' ? (a, b) => b.plays - a.plays || b.created_at.localeCompare(a.created_at) : (a, b) => b.created_at.localeCompare(a.created_at);
    return Object.values(S.load('db:levels', {})).filter(l => l.game === game && (!userId || l.user_id === userId))
      .sort(by).slice(0, Math.min(200, limit)).map(l => this._levelOut(l));
  }

  async getLevel({ game, id }) {
    const l = S.load('db:levels', {})[id];
    return l && l.game === game ? this._levelOut(l, true) : null;
  }

  async deleteLevel({ game, id }) {
    const all = S.load('db:levels', {});
    if (!all[id] || all[id].game !== game || all[id].user_id !== this.userId) return false;
    delete all[id];
    S.save('db:levels', all);
    return true;
  }

  async levelPlayed({ game, id }) {
    if (!(await this.getProfile())) throw codedError('no_profile');
    const all = S.load('db:levels', {});
    const l = all[id];
    if (!l || l.game !== game) return false;
    const plays = S.load('db:levelPlays', {});
    const k = id + '|' + this.userId;
    if (plays[k]) return false;
    plays[k] = now(); S.save('db:levelPlays', plays);
    l.plays++; S.save('db:levels', all);
    return true;
  }

  /* -------------------------------- sobe --------------------------------- */

  _rooms() {
    const rooms = S.load('db:rooms', {});
    const cut = Date.now() - ROOM_TTL;
    let dirty = false;
    for (const [c, r] of Object.entries(rooms)) {
      if (new Date(r.updated_at).getTime() < cut) { delete rooms[c]; dirty = true; }
    }
    if (dirty) {
      S.save('db:rooms', rooms);
      const pl = S.load('db:roomPlayers', {});
      for (const c of Object.keys(pl)) if (!rooms[c]) delete pl[c];
      S.save('db:roomPlayers', pl);
    }
    return rooms;
  }

  _saveRooms(rooms) {
    S.save('db:rooms', rooms);
    this._lobbyPing();
  }

  _players(code) { return S.load('db:roomPlayers', {})[code] || []; }

  _savePlayers(code, list) {
    S.update('db:roomPlayers', all => { all[code] = list; return all; }, {});
  }

  _lobbyPing() {
    const ch = bc('mg-lobby');
    if (ch) { ch.postMessage({ k: 'rooms' }); ch.close(); }
    this._lobbyCbs?.forEach(cb => { try { cb(); } catch { /* ignore */ } });
  }

  async createRoom({ game, maxPlayers = 10, settings = {}, isPublic = true }) {
    if (!(await this.getProfile())) throw codedError('no_profile', 'Najprej izberi vzdevek.');
    const rooms = this._rooms();
    let code;
    do { code = makeRoomCode(); } while (rooms[code]);
    const row = {
      code, game, host_id: this.userId, status: 'lobby',
      max_players: Math.max(1, Math.min(16, maxPlayers | 0 || 10)),
      settings, is_public: !!isPublic, created_at: now(), updated_at: now(),
    };
    rooms[code] = row;
    this._savePlayers(code, [{ user_id: this.userId, joined_at: now() }]);
    this._saveRooms(rooms);
    return row;
  }

  async joinRoom(input) {
    const code = normalizeRoomCode(input);
    const rooms = this._rooms();
    const r = code && rooms[code];
    if (!r) throw codedError('room_not_found', 'Soba s to kodo ne obstaja.');
    if (!(await this.getProfile())) throw codedError('no_profile', 'Najprej izberi vzdevek.');
    const players = this._players(code);
    if (players.some(p => p.user_id === this.userId)) return r;
    if (r.status !== 'lobby') throw codedError('room_started', 'Igra v tej sobi se je že začela.');
    if (players.length >= r.max_players) throw codedError('room_full', 'Soba je polna.');
    players.push({ user_id: this.userId, joined_at: now() });
    this._savePlayers(code, players);
    r.updated_at = now();
    this._saveRooms(rooms);
    return r;
  }

  async findRoom(input) {
    const code = normalizeRoomCode(input);
    const r = code && this._rooms()[code];
    if (!r) return null;
    const host = (await this.getProfile(r.host_id));
    return { code: r.code, game: r.game, status: r.status, max_players: r.max_players, players: this._players(code).length, host_nickname: host?.nickname || null };
  }

  async getRoom(code) { return this._rooms()[code] || null; }

  async getRoomPlayers(code) { return this._players(code); }

  async updateRoom(code, patch) {
    const rooms = this._rooms();
    const r = rooms[code];
    if (!r || r.host_id !== this.userId) throw codedError('not_host', 'Samo host lahko ureja sobo.');
    const allowed = ['status', 'settings', 'is_public', 'max_players'];
    for (const k of allowed) if (k in patch) r[k] = patch[k];
    r.updated_at = now();
    this._saveRooms(rooms);
    return r;
  }

  /** Enaka pravila kot private.claim_host v schema.sql. */
  async claimHost(code) {
    const rooms = this._rooms();
    const r = rooms[code];
    if (!r) throw codedError('room_not_found');
    if (r.host_id === this.userId) return r;
    const players = this._players(code);
    if (!players.some(p => p.user_id === this.userId)) throw codedError('not_next_host');
    const next = players.filter(p => p.user_id !== r.host_id)
      .sort((a, b) => (a.joined_at < b.joined_at ? -1 : a.joined_at > b.joined_at ? 1 : a.user_id < b.user_id ? -1 : 1))[0];
    const hostGone = !players.some(p => p.user_id === r.host_id);
    const stale = Date.now() - new Date(r.updated_at).getTime() > HOST_STALE_MS;
    if (next?.user_id !== this.userId && !hostGone && !stale) throw codedError('not_next_host');
    r.host_id = this.userId;
    r.updated_at = now();
    this._saveRooms(rooms);
    return r;
  }

  async removePlayer(code, userId) {
    const r = this._rooms()[code];
    if (!r) return;
    if (userId !== this.userId && r.host_id !== this.userId) throw codedError('not_host');
    this._savePlayers(code, this._players(code).filter(p => p.user_id !== userId));
    this._lobbyPing();
  }

  async listLobbies({ freshMinutes = 3 } = {}) {
    const rooms = this._rooms();
    const cut = Date.now() - freshMinutes * 60e3;
    const out = [];
    for (const r of Object.values(rooms)) {
      if (r.status !== 'lobby' || !r.is_public || new Date(r.updated_at).getTime() < cut) continue;
      const host = await this.getProfile(r.host_id);
      if (!host) continue;
      out.push({
        code: r.code, game: r.game, host_id: r.host_id, host_nickname: host.nickname, host_avatar: host.avatar, host_equipped: host.equipped || {},
        players: this._players(r.code).length, max_players: r.max_players, created_at: r.created_at, updated_at: r.updated_at,
      });
    }
    return out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  /** Klic ob vsaki spremembi sob (tudi iz drugih zavihkov). Vrne funkcijo za odjavo. */
  onLobbiesChange(cb) {
    this._lobbyCbs = this._lobbyCbs || new Set();
    this._lobbyCbs.add(cb);
    if (!this._lobbyCh) {
      this._lobbyCh = bc('mg-lobby');
      if (this._lobbyCh) this._lobbyCh.onmessage = () => this._lobbyCbs.forEach(f => { try { f(); } catch { /* ignore */ } });
    }
    return () => this._lobbyCbs.delete(cb);
  }

  /* ------------------------- stanje in poteze ---------------------------- */

  _isMember(code) { return this._players(code).some(p => p.user_id === this.userId); }

  async getState(code) {
    if (!this._isMember(code)) throw codedError('not_member');
    return S.load('db:state', {})[code] || { state: null, version: 0 };
  }

  async setState(code, state, expectedVersion = null) {
    if (!this._isMember(code)) throw codedError('not_member', 'Nisi v tej sobi.');
    const all = S.load('db:state', {});
    const cur = all[code] || { state: null, version: 0 };
    if (expectedVersion != null && cur.version !== expectedVersion) throw codedError('version_conflict', 'Stanje je medtem spremenil nekdo drug.');
    all[code] = { state, version: cur.version + 1, updated_at: now() };
    S.save('db:state', all);
    return all[code].version;
  }

  async pushMove(code, move) {
    if (!this._isMember(code)) throw codedError('not_member', 'Nisi v tej sobi.');
    const all = S.load('db:moves', {});
    const list = all[code] || [];
    const seq = (list.at(-1)?.seq || 0) + 1;
    list.push({ seq, user_id: this.userId, move, created_at: now() });
    all[code] = list;
    S.save('db:moves', all);
    return seq;
  }

  async getMoves(code, sinceSeq = 0) {
    if (!this._isMember(code)) throw codedError('not_member');
    return (S.load('db:moves', {})[code] || []).filter(m => m.seq > sinceSeq);
  }

  /* ------------------------------ realtime ------------------------------- */

  /**
   * Realtime kanal sobe prek BroadcastChannel (broadcast + presence).
   * @param {string} code
   * @returns {import('./types.js').Transport}
   */
  channel(code) {
    return new LocalTransport(code, this.userId);
  }
}

/** Transport: broadcast + presence med zavihki. */
class LocalTransport {
  constructor(code, userId) {
    this.code = code;
    this.userId = userId;
    this.ch = bc('mg-room-' + code);
    this.peers = new Map();           // id → { meta, seen }
    this.meta = null;
    this.msgCbs = new Set();
    this.presCbs = new Set();
    this.closed = false;
    if (this.ch) this.ch.onmessage = e => this._recv(e.data);
    this.beat = setInterval(() => this._tick(), PRESENCE_BEAT);
    this._onHide = () => this._post({ k: 'l', id: this.userId });
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this._onHide);
  }

  _post(m) { if (!this.closed) try { this.ch?.postMessage(m); } catch { /* ignore */ } }

  _recv(m) {
    if (this.closed || !m) return;
    if (m.k === 'p') {
      const had = this.peers.has(m.id);
      const prev = this.peers.get(m.id);
      this.peers.set(m.id, { meta: m.meta, seen: Date.now() });
      if (!had || JSON.stringify(prev.meta) !== JSON.stringify(m.meta)) this._emitPresence();
    } else if (m.k === 'q') {
      if (this.meta) this._post({ k: 'p', id: this.userId, meta: this.meta });
    } else if (m.k === 'l') {
      if (this.peers.delete(m.id)) this._emitPresence();
    } else if (m.k === 'm') {
      this.msgCbs.forEach(cb => cb(m.type, m.payload, m.from));
    }
  }

  _tick() {
    if (this.meta) this._post({ k: 'p', id: this.userId, meta: this.meta });
    const cut = Date.now() - PRESENCE_TIMEOUT;
    let changed = false;
    for (const [id, p] of this.peers) if (id !== this.userId && p.seen < cut) { this.peers.delete(id); changed = true; }
    if (changed) this._emitPresence();
  }

  _emitPresence() {
    const list = [...this.peers.values()].map(p => p.meta);
    this.presCbs.forEach(cb => cb(list));
  }

  /** Objavi/posodobi svoje presence podatke. */
  async track(meta) {
    this.meta = meta;
    this.peers.set(this.userId, { meta, seen: Date.now() });
    this._post({ k: 'p', id: this.userId, meta });
    this._post({ k: 'q' });
    this._emitPresence();
  }

  presence() { return [...this.peers.values()].map(p => p.meta); }

  onPresence(cb) { this.presCbs.add(cb); return () => this.presCbs.delete(cb); }

  /** Pošlji vsem v sobi (tudi sebi). */
  send(type, payload) {
    const m = { k: 'm', type, payload, from: this.userId };
    this._post(m);
    setTimeout(() => { if (!this.closed) this.msgCbs.forEach(cb => cb(type, payload, this.userId)); }, 0);
  }

  onMessage(cb) { this.msgCbs.add(cb); return () => this.msgCbs.delete(cb); }

  async close() {
    this._post({ k: 'l', id: this.userId });
    this.closed = true;
    clearInterval(this.beat);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this._onHide);
    try { this.ch?.close(); } catch { /* ignore */ }
    this.msgCbs.clear();
    this.presCbs.clear();
  }
}
