/* =====================================================================
   MINI GAMES — hub.js: glavni vhod za igre.

     import { hub, ui } from '../../shared/hub.js';
     await hub.init({ gameId: 'moja-igra' });

   Dokumentacija s primeri: shared/README.md
   ===================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JS } from './config.js';
import { LocalBackend, codedError } from './adapters/local.js';
import { Room } from './room.js';
import * as U from './util.js';
import * as E from './economy.js';
import * as Q from './quests.js';
import * as K from './cosmetics.js';
import { ui } from './ui.js';

const listeners = new Set();
const questListeners = new Set();

function param(name) {
  try { return new URLSearchParams(location.search).get(name); } catch { return null; }
}

/** Ločena identiteta za testiranje (?igralec=2) — obdrži se pri navigaciji po hubu. */
function identityParam() {
  const v = param('igralec');
  return v && /^[a-z0-9]{1,8}$/i.test(v) ? v : null;
}

export const hub = {
  /** @type {string|null} id trenutne igre (iz games.json) */
  gameId: null,
  /** @type {'asc'|'desc'} ali je pri tej igri manjši rezultat boljši */
  scoreOrder: 'desc',
  /** @type {'local'|'supabase'|null} kateri adapter teče */
  mode: null,
  /** @type {string|null} zakaj teče offline način (če teče) */
  offlineReason: null,
  /** @type {import('./adapters/types.js').Backend|null} */
  backend: null,
  /** @type {import('./adapters/types.js').Profile|null} */
  profile: null,
  /** @type {Room|null} trenutna soba */
  room: null,

  _initPromise: null,

  /**
   * Prijava in nalaganje profila. Če vzdevka še ni, pokaže modal za izbiro.
   * Večkratni klici vrnejo isto obljubo.
   * @param {{gameId?:string, scoreOrder?:'asc'|'desc', requireProfile?:boolean}} [opt]
   *   requireProfile: false → ne pokaži modala (npr. igra, ki hub uporablja le za XP)
   * @returns {Promise<typeof hub>}
   */
  init(opt = {}) {
    if (opt.gameId) hub.gameId = opt.gameId;
    if (opt.scoreOrder) hub.scoreOrder = opt.scoreOrder;
    if (!hub._initPromise) hub._initPromise = hub._init(opt);
    return hub._initPromise;
  },

  async _init({ requireProfile = true } = {}) {
    ui._ensureCss();
    const forceOffline = param('offline') === '1';
    const identity = identityParam();
    if (SUPABASE_URL && SUPABASE_ANON_KEY && !forceOffline) {
      try {
        const { SupabaseBackend } = await import('./adapters/supabase.js');
        const b = new SupabaseBackend({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY, lib: SUPABASE_JS, identity });
        await withTimeout(b.init(), 8000);
        hub.backend = b;
        hub.mode = 'supabase';
      } catch (e) {
        console.warn('[hub] Supabase ni dosegljiv, preklop v offline način:', e?.message || e);
        hub.offlineReason = 'Strežnik ni dosegljiv (' + (e?.message || 'napaka') + ').';
      }
    } else {
      hub.offlineReason = forceOffline ? 'Vklopljen z ?offline=1.' : 'Supabase ni nastavljen (shared/config.js).';
    }
    if (!hub.backend) {
      hub.backend = new LocalBackend(identity ? { userId: 'local-' + identity } : {});
      await hub.backend.init();
      hub.mode = 'local';
    }
    hub.profile = await hub.backend.getProfile();
    if (!hub.profile && requireProfile) await ui.profileModal({ required: true });
    hub._emitProfile();
    return hub;
  },

  /** Ali teče offline način (localStorage + BroadcastChannel)? */
  get offline() { return hub.mode === 'local'; },

  /** id prijavljenega uporabnika */
  get userId() { return hub.backend?.userId || null; },

  /* ------------------------------ profil ------------------------------ */

  /**
   * Posodobi vzdevek in/ali avatar.
   * @param {{nickname?:string, avatar?:{emoji:string, color:string}}} patch
   * @throws napaka z err.code 'nickname_taken' ali 'invalid'
   */
  async updateProfile({ nickname, avatar } = {}) {
    const nick = (nickname ?? hub.profile?.nickname ?? '').trim();
    const err = U.validateNickname(nick);
    if (err) throw codedError('invalid', err);
    hub.profile = await hub.backend.saveProfile({ nickname: nick, avatar: avatar || hub.profile?.avatar || U.randomAvatar() });
    hub._emitProfile();
    return hub.profile;
  },

  /**
   * Poslušaj spremembe profila (vzdevek, avatar, XP). Pokliče se takoj, če je profil naložen.
   * @param {(p:import('./adapters/types.js').Profile|null) => void} cb
   * @returns {() => void} odjava
   */
  onProfile(cb) {
    listeners.add(cb);
    if (hub.profile) cb(hub.profile);
    return () => listeners.delete(cb);
  },

  _emitProfile() {
    for (const cb of listeners) { try { cb(hub.profile); } catch (e) { console.error(e); } }
  },

  /** Ponovno naloži profil iz baze (npr. po spremembi v drugem zavihku). */
  async refreshProfile() {
    hub.profile = await hub.backend.getProfile();
    hub._emitProfile();
    return hub.profile;
  },

  /* ----------------------------- lestvice ----------------------------- */

  /**
   * Oddaj rezultat za trenutno igro.
   * @param {number} score celo število (pri asc igrah npr. milisekunde)
   * @param {{seed?:string|null, meta?:Object, game?:string}} [opt] seed: npr. hub.dailySeed() za dnevni izziv
   */
  async submitScore(score, { seed = null, meta = {}, game = hub.gameId } = {}) {
    if (!hub.profile) return null;
    try {
      return await hub.backend.submitScore({ game, score, seed, meta });
    } catch (e) {
      console.warn('submitScore:', e.message);
      ui.toast('Rezultata ni bilo mogoče shraniti.', { icon: '⚠️' });
      return null;
    }
  },

  /**
   * Lestvica (najboljši rezultat vsakega igralca).
   * @param {{seed?:string|null, limit?:number, period?:'all'|'today'|'week', order?:'asc'|'desc', game?:string}} [opt]
   * @returns {Promise<{user_id:string, nickname:string, avatar:Object, score:number, created_at:string}[]>}
   */
  async getLeaderboard({ seed = null, limit = 10, period = 'all', order = hub.scoreOrder, game = hub.gameId } = {}) {
    return hub.backend.getLeaderboard({ game, seed, since: U.periodSince(period), limit, asc: order === 'asc' });
  },

  /**
   * Moj najboljši rezultat (ali null).
   * @param {{seed?:string|null, order?:'asc'|'desc', game?:string}} [opt]
   */
  async getMyBest({ seed = null, order = hub.scoreOrder, game = hub.gameId } = {}) {
    return hub.backend.getMyBest({ game, seed, asc: order === 'asc' });
  },

  /* ------------------------------- XP --------------------------------- */

  /**
   * Podeli XP (največ 500 na klic in 5000 na dan). Prikaže »+N XP« in nivo navzgor.
   * @param {number} amount
   * @param {string} [reason]
   * @returns {Promise<{xp:number, granted:number}>}
   */
  async awardXp(amount, reason = '') {
    if (!hub.profile) return { xp: 0, granted: 0 };
    try {
      const before = U.level(hub.profile.xp).level;
      const res = await hub.backend.awardXp(amount, reason || hub.gameId || '');
      hub.profile = { ...hub.profile, xp: res.xp, ...(res.coins != null ? { coins: res.coins } : {}) };
      hub._emitProfile();
      if (res.granted > 0) {
        const after = U.level(res.xp).level;
        if (after > before) ui.toast(`Nivo ${after}!${res.level_coins ? ` +${res.level_coins} 🪙` : ''}`, { icon: '⭐' });
      }
      return res;
    } catch (e) {
      console.warn('awardXp:', e.message);
      return { xp: hub.profile.xp, granted: 0 };
    }
  },

  /**
   * Krivulja nivojev.
   * @param {number} [xp] privzeto XP trenutnega profila
   * @returns {{level:number, current:number, next:number, progress:number}}
   */
  level(xp = hub.profile?.xp || 0) { return U.level(xp); },

  /* ----------------------------- dosežki ------------------------------ */

  /**
   * Odkleni dosežek (enkrat na igralca). Ob prvem odklepu pokaže toast.
   * @param {string} key npr. 'pod-200' (male črke, številke, - in _)
   * @param {{title?:string, icon?:string, game?:string}} [opt]
   * @returns {Promise<boolean>} true, če je bil odklenjen zdaj
   */
  async unlock(key, { title = key, icon = '🏆', game = hub.gameId } = {}) {
    if (!hub.profile) return false;
    try {
      const fresh = await hub.backend.unlock({ game, key, title, icon });
      if (fresh) {
        ui.toast(`Dosežek odklenjen: ${title} · +${E.COINS.ACHIEVEMENT} 🪙`, { icon, duration: 3500 });
        await hub.refreshProfile();
        await hub._questEvents([{ name: 'ach' }]);
      }
      return fresh;
    } catch (e) {
      console.warn('unlock:', e.message);
      return false;
    }
  },

  /**
   * Moji dosežki.
   * @param {{game?:string|null}} [opt] game: null = vse igre
   */
  async getAchievements({ game = hub.gameId } = {}) {
    return hub.backend.getAchievements({ game });
  },

  /* ------------------------------ ghosti ------------------------------ */

  /**
   * Shrani posnetek vožnje (ghost). Shrani se le, če je čas boljši od mojega prejšnjega.
   * Supabase: tabela <igra>_ghosts in RPC <igra>_save_ghost (glej supabase/games/krogla.sql).
   * @param {{level:string, mirror?:boolean, timeMs:number, data:string, game?:string}} g data: base64 niz (≤ 60.000 znakov)
   * @returns {Promise<{saved:boolean}|null>} null ob napaki
   */
  async saveGhost({ level, mirror = false, timeMs, data, game = hub.gameId }) {
    if (!hub.profile) return null;
    try {
      return await hub.backend.saveGhost({ game, level, mirror, timeMs, data });
    } catch (e) {
      console.warn('saveGhost:', e.message);
      return null;
    }
  },

  /**
   * Najboljši ghosti proge (brez podatkov): [{ user_id, nickname, avatar, equipped, time_ms, created_at }].
   * @param {{level:string, mirror?:boolean, limit?:number, game?:string}} q
   */
  async getGhosts({ level, mirror = false, limit = 10, game = hub.gameId }) {
    try { return await hub.backend.getGhosts({ game, level, mirror, limit }); }
    catch (e) { console.warn('getGhosts:', e.message); return []; }
  },

  /**
   * Podatki ghosta enega igralca (privzeto moj): { user_id, time_ms, data } ali null.
   * @param {{level:string, mirror?:boolean, userId?:string, game?:string}} q
   */
  async getGhost({ level, mirror = false, userId = hub.userId, game = hub.gameId }) {
    try { return await hub.backend.getGhost({ game, level, mirror, userId }); }
    catch (e) { console.warn('getGhost:', e.message); return null; }
  },

  /* ------------------------------ kovanci ----------------------------- */

  /** Trenutno stanje kovancev. */
  get coins() { return hub.profile?.coins || 0; },

  _setCoins(coins) {
    if (coins == null || !hub.profile) return;
    hub.profile = { ...hub.profile, coins };
    hub._emitProfile();
  },

  /**
   * Sporoči odigrano igro: kovanci (igra, zmaga v multiplayerju, niz dni) in napredek nalog.
   * Pokliči PO VSAKI odigrani igri (solo in multiplayer), enkrat na igralca.
   * @param {{won?:boolean, players?:number, score?:number|null, daily?:boolean, game?:string}} [r]
   *   won: zmaga (šteje le pri players ≥ 2) · players: število igralcev · score: rezultat (za naloge)
   *   daily: odigran dnevni izziv
   * @returns {Promise<{coins:number, granted:number, streak:number, streak_bonus:number}|null>}
   */
  async reportGame({ won = false, players = 1, score = null, daily = false, game = hub.gameId } = {}) {
    if (!hub.profile || !game) return null;
    let res = null;
    try {
      res = await hub.backend.reportGame({ game, won: !!won, players: Math.max(1, players | 0) });
      hub._setCoins(res.coins);
      if (res.streak_bonus > 0) ui.toast(`Niz ${U.plural(res.streak, 'dan', 'dneva', 'dnevi', 'dni')}: +${res.streak_bonus} 🪙`, { icon: '🔥', duration: 3000 });
      const g = (res.game || 0) + (res.win || 0);
      if (g > 0) ui.toast(`+${g} 🪙`, { icon: '🪙', duration: 1800 });
    } catch (e) {
      console.warn('reportGame:', e.message);
    }
    await hub._questEvents(Q.gameEvents({ game, won, players, score, daily }));
    return res;
  },

  /**
   * Sporoči poseben dogodek za naloge (npr. hub.reportEvent('reakcija:avg', 231)).
   * @param {string} name 'igra:ime' (male črke, številke, : - _)
   * @param {number} [value]
   */
  async reportEvent(name, value = 1) {
    if (!hub.profile || !/^[a-z0-9:_-]{2,40}$/.test(name || '')) return;
    await hub._questEvents([{ name, value }]);
  },

  /**
   * Bonus kovanci iz igre (največ 100 na klic, skozi dnevno mejo 250).
   * @returns {Promise<{coins:number, granted:number}>}
   */
  async awardCoins(amount, reason = '', ref = null) {
    if (!hub.profile) return { coins: 0, granted: 0 };
    try {
      const res = await hub.backend.awardCoins(amount, reason || hub.gameId || '', ref);
      hub._setCoins(res.coins);
      return res;
    } catch (e) {
      console.warn('awardCoins:', e.message);
      return { coins: hub.coins, granted: 0 };
    }
  },

  /* ------------------------------ naloge ------------------------------ */

  _games: null,
  _gamesCached() {
    if (!hub._games) hub._games = hub.games().catch(() => []);
    return hub._games;
  },

  /** Današnje definicije nalog (3 dnevne + 2 tedenski). */
  async _questDefs(day = U.dailySeed()) {
    return Q.questsFor(day, await hub._gamesCached());
  },

  /**
   * Naloge s stanjem.
   * @returns {Promise<{id:string, slot:string, text:string, target:number, progress:number, done:boolean, claimed:boolean, reward:number, period:string}[]>}
   */
  async getQuests() {
    const defs = await hub._questDefs();
    if (!hub.profile) return defs.map(q => ({ ...q, progress: 0, data: {}, done: false, claimed: false }));
    const periods = [...new Set(defs.map(q => q.period))];
    let rows = [];
    try { rows = await hub.backend.getQuestProgress(periods); } catch (e) { console.warn('getQuests:', e.message); }
    const by = new Map(rows.map(r => [r.period + '|' + r.quest_id, r]));
    const claimedSlots = new Set(rows.filter(r => r.claimed_at).map(r => r.period + '|' + r.quest_id.split('.')[0]));
    return defs.map(q => {
      const r = by.get(q.period + '|' + q.id);
      const progress = Math.min(q.target, r?.progress || 0);
      const claimed = !!r?.claimed_at || claimedSlots.has(q.period + '|' + q.slot);
      return { ...q, progress: claimed ? q.target : progress, data: r?.data || {}, done: claimed || progress >= q.target, claimed };
    });
  },

  _questQueue: Promise.resolve(),

  /** Posodobi napredek nalog po dogodkih (zaporedno, da se klici ne prehitevajo). */
  _questEvents(events) {
    const run = async () => {
      if (!hub.profile) return;
      let quests;
      try { quests = await hub.getQuests(); } catch { return; }
      for (const q of quests) {
        if (q.claimed || q.done) continue;
        let st = { progress: q.progress, data: q.data };
        let changed = false;
        for (const ev of events) {
          const next = Q.applyEvent(q, st, ev);
          if (next) { st = next; changed = true; }
        }
        if (!changed) continue;
        try {
          await hub.backend.saveQuestProgress({ period: q.period, quest_id: q.id, progress: st.progress, data: st.data });
        } catch (e) { console.warn('quest:', e.message); continue; }
        if (st.progress >= q.target) ui.toast(`Naloga opravljena: ${q.text} · +${q.reward} 🪙 (prevzemi v hubu)`, { icon: '✅', duration: 4200 });
      }
      for (const cb of questListeners) { try { cb(); } catch (e) { console.error(e); } }
    };
    hub._questQueue = hub._questQueue.then(run, run);
    return hub._questQueue;
  },

  /** Poslušaj spremembe nalog. Vrne odjavo. */
  onQuests(cb) { questListeners.add(cb); return () => questListeners.delete(cb); },

  /**
   * Prevzemi nagrado opravljene naloge.
   * @param {string} id id naloge (npr. 'h.win-1')
   * @returns {Promise<{coins:number, granted:number, reward:number, bonus:number}>}
   * @throws err.code 'claimed' | 'expired' | 'not_done' | 'invalid'
   */
  async claimQuest(id) {
    const q = (await hub.getQuests()).find(x => x.id === id);
    if (!q) throw codedError('invalid', 'Neznana naloga.');
    if (q.claimed) throw codedError('claimed', 'Nagrada je že prevzeta.');
    if (!q.done) throw codedError('not_done', 'Naloga še ni opravljena.');
    const res = await hub.backend.claimQuest(q.period, q.id);
    hub._setCoins(res.coins);
    for (const cb of questListeners) { try { cb(); } catch (e) { console.error(e); } }
    return res;
  },

  /* --------------------------- trgovina ------------------------------- */

  /**
   * Katalog s stanjem za trenutnega igralca.
   * @returns {Promise<{items:Object[], offer:string[], coins:number, equipped:Object, owned:Set<string>, state:Object}>}
   *   items[i]: predmet + { owned, locked, reason, priceToday, offer, equipped, free }
   */
  async getShop() {
    const offer = K.dailyOffer(U.dailySeed());
    const [inv, st] = hub.profile
      ? await Promise.all([hub.backend.getInventory(), hub.backend.unlockState()])
      : [[], { level: 1, achievements: [], streak: 0 }];
    const owned = new Set(inv.map(i => i.item_id));
    const eq = hub.profile?.equipped || {};
    const items = K.CATALOG.filter(i => i.active !== false).map(it => {
      const u = K.checkUnlock(it.unlock, st);
      const free = K.isFree(it);
      return {
        ...it, owned: owned.has(it.id) || free, free, locked: !u.ok, reason: u.reason,
        offer: offer.includes(it.id), priceToday: K.priceToday(it, offer), equipped: eq[it.kind] === it.id,
      };
    });
    return { items, offer, coins: hub.coins, equipped: eq, owned, state: st };
  },

  /**
   * Kupi predmet (ali odkleni, če je brezplačen s pogojem).
   * @throws err.code 'not_enough_coins' | 'locked' | 'owned' | 'unavailable'
   */
  async buy(itemId) {
    await hub._needProfile();
    const it = K.item(itemId);
    const res = it && it.price === 0 ? await hub.backend.unlockItem(itemId) : await hub.backend.buyItem(itemId);
    if (res.coins != null) hub._setCoins(res.coins);
    return res;
  },

  /**
   * Opremi predmet v slot (null sname).
   * @param {'emoji'|'bg'|'frame'|'name'|'title'|'badge'|'win'|'banner'} slot
   * @param {string|null} itemId
   */
  async equip(slot, itemId = null) {
    await hub._needProfile();
    const equipped = await hub.backend.equip(slot, itemId);
    hub.profile = { ...hub.profile, equipped: equipped || {} };
    hub._emitProfile();
    if (hub.room && !hub.room.left) hub.room._updateProfile(hub.profile);
    return equipped;
  },

  /** Moj inventar: [{ item_id, acquired_at, source }]. */
  async getInventory() {
    if (!hub.profile) return [];
    return hub.backend.getInventory();
  },

  /* ------------------------- seed in naključnost ----------------------- */

  /** Dnevni seed `YYYY-MM-DD` po Europe/Ljubljana (isti za vse cel dan). */
  dailySeed(date) { return U.dailySeed(date); },

  /**
   * Determinističen PRNG (mulberry32). rand() ∈ [0,1), rand.int(a,b), rand.range(a,b), rand.pick(arr), rand.shuffle(arr).
   * @param {string|number} seed
   */
  rng(seed) { return U.rng(seed); },

  /* ------------------------------- sobe ------------------------------- */

  /**
   * Ustvari sobo za trenutno igro in vstopi vanjo. URL dobi ?room=KODA (osvežitev → vrnitev v sobo).
   * @param {{maxPlayers?:number, settings?:Object, isPublic?:boolean}} [opt]
   * @returns {Promise<Room>}
   */
  async createRoom({ maxPlayers = 10, settings = {}, isPublic = true } = {}) {
    await hub._needProfile();
    if (hub.room && !hub.room.left) await hub.room.leave();
    const row = await hub.backend.createRoom({ game: hub.gameId, maxPlayers, settings, isPublic });
    return hub._enter(row);
  },

  /**
   * Pridruži se sobi s kodo. Napake (err.code): room_not_found, room_full, room_started, wrong_game.
   * Pri wrong_game ima napaka err.game (id prave igre).
   * @param {string} code
   * @returns {Promise<Room>}
   */
  async joinRoom(code) {
    await hub._needProfile();
    const c = U.normalizeRoomCode(code);
    if (!c) throw codedError('room_not_found', 'Neveljavna koda sobe.');
    if (hub.room && !hub.room.left && hub.room.code === c) return hub.room;
    const info = await hub.backend.findRoom(c);
    if (!info) throw codedError('room_not_found', 'Soba s to kodo ne obstaja.');
    if (hub.gameId && info.game !== hub.gameId) {
      const e = codedError('wrong_game', 'Ta soba je za drugo igro.');
      e.game = info.game;
      throw e;
    }
    if (hub.room && !hub.room.left) await hub.room.leave();
    const row = await hub.backend.joinRoom(c);
    return hub._enter(row);
  },

  /** Koda sobe iz URL-ja (?room=KODA) ali null. */
  roomFromUrl() { return U.normalizeRoomCode(param('room')); },

  /** Poišči sobo po kodi (brez pridružitve): {code, game, status, max_players, players, host_nickname} ali null. */
  findRoom(code) { return hub.backend.findRoom(code); },

  /** Javni lobbyji (status 'lobby', host je aktiven v zadnjih minutah). */
  listLobbies() { return hub.backend.listLobbies(); },

  /** Spremembe sob v realnem času. Vrne odjavo. */
  onLobbiesChange(cb) { return hub.backend.onLobbiesChange(cb); },

  async _enter(row) {
    const room = new Room(hub.backend, row, hub.profile);
    await room._connect();
    hub.room = room;
    try {
      const u = new URL(location.href);
      u.searchParams.set('room', row.code);
      history.replaceState(null, '', u);
    } catch { /* ignore */ }
    return room;
  },

  async _needProfile() {
    if (!hub.backend) await hub.init();
    if (!hub.profile) await ui.profileModal({ required: true });
  },

  /* ------------------------------ ostalo ------------------------------ */

  /** Top igralci po XP. */
  topXp(limit = 10) { return hub.backend.topXp(limit); },

  /** Pot do korena huba (za povezave iz iger). */
  root: new URL('../', import.meta.url).href,

  /** Povezava na hub z ohranjenim ?igralec= / ?offline= parametrom. */
  link(path = '') {
    const u = new URL(path, hub.root);
    for (const k of ['igralec', 'offline']) { const v = param(k); if (v) u.searchParams.set(k, v); }
    return u.href;
  },

  /** Naloži register iger (games.json). */
  async games() {
    const res = await fetch(new URL('games.json', hub.root), { cache: 'no-cache' });
    return res.json();
  },
};

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('časovna omejitev')), ms))]);
}

export { ui, Room, U as util, E as economy, Q as quests, K as cosmetics };
export default hub;
