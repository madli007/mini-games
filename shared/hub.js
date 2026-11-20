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
import { ui } from './ui.js';

const listeners = new Set();

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
      hub.profile = { ...hub.profile, xp: res.xp };
      hub._emitProfile();
      if (res.granted > 0) {
        const after = U.level(res.xp).level;
        if (after > before) ui.toast(`Nivo ${after}!`, { icon: '⭐' });
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
      if (fresh) ui.toast(`Dosežek odklenjen: ${title}`, { icon, duration: 3500 });
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

export { ui, Room, U as util };
export default hub;
