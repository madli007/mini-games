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
  uuid, dailySeed, grantableXp, bestPerUser, makeRoomCode, normalizeRoomCode,
} from '../util.js';

const LEASE_MS = 6000;           // glavni profil je zaseden, dokler ga zavihek osvežuje
const PRESENCE_BEAT = 1000;      // presence utrip
const PRESENCE_TIMEOUT = 3500;   // brez utripa → igralec ni več prisoten
const ROOM_TTL = 24 * 3600e3;    // stare sobe se pobrišejo
const HOST_STALE_MS = 30000;     // soba brez utripa hosta → prevzem hosta dovoljen vsem

const now = () => new Date().toISOString();

/** Napaka z oznako (enake oznake kot v supabase adapterju). */
export function codedError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
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
    return this._profiles()[id] || null;
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
    return p;
  }

  async getProfiles(ids) {
    const all = this._profiles();
    return ids.map(id => all[id]).filter(Boolean);
  }

  async topXp(limit = 10) {
    return Object.values(this._profiles()).sort((a, b) => b.xp - a.xp).slice(0, limit);
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
    if (granted > 0) {
      mine.used += granted;
      log[this.userId] = mine;
      S.save('db:xplog', log);
      p.xp += granted;
      S.save('db:profiles', all);
    }
    return { xp: p.xp, granted, reason };
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
    return true;
  }

  async getAchievements({ game = null, userId = this.userId } = {}) {
    return S.load('db:ach', []).filter(a => a.user_id === userId && (!game || a.game === game));
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
        code: r.code, game: r.game, host_id: r.host_id, host_nickname: host.nickname, host_avatar: host.avatar,
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
