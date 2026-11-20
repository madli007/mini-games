/* =====================================================================
   ROOM — lobby in realtime za multiplayer igre.
   Ustvari ga hub.createRoom() / hub.joinRoom(); igre ne kličejo `new Room`.

   Dogodki (room.on(type, cb)):
     • vaša sporočila iz room.send(type, payload) → cb(payload, from)
     • 'start'        (settings)         — host je začel igro (tudi room.onStart)
     • 'status'       (status)           — 'lobby' | 'playing' | 'finished'
     • 'hostChanged'  ({hostId, previous}) — host je odšel, nov host je izbran
     • 'playerJoined' (player) / 'playerLeft' (player)
     • 'state'        ({state, version, from}) — nekdo je zapisal room.setState
     • 'move'         ({seq, move, user_id})   — nekdo je dodal potezo
     • 'kicked'       ()                 — host te je odstranil iz sobe
     • '*'            (type, payload, from) — vsa vaša sporočila
   Imena, ki se začnejo z '__', so rezervirana za notranjo rabo.
   ===================================================================== */

import { pickHost } from './util.js';

const HOST_GRACE_MS = 5000;     // host lahko toliko časa manjka (osvežitev strani)
const PLAYER_DROP_MS = 30000;   // po tem času host odstrani odsotnega igralca iz sobe
const TOUCH_MS = 15000;         // host »dotakne« sobo (updated_at) — znak, da soba živi
const SYNC_WAIT_MS = 1500;      // koliko časa novinec čaka na odgovor obstoječih igralcev

/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} nickname
 * @property {{emoji:string, color:string}} avatar
 * @property {Object} equipped opremljena kozmetika ({ frame, name, title, … } → id predmeta)
 * @property {boolean} isHost
 * @property {boolean} ready
 * @property {string} joinedAt
 */

export class Room {
  /**
   * @param {import('./adapters/types.js').Backend} backend
   * @param {import('./adapters/types.js').RoomRow} row
   * @param {import('./adapters/types.js').Profile} profile
   */
  constructor(backend, row, profile) {
    this.backend = backend;
    /** @type {string} */ this.code = row.code;
    /** @type {string} */ this.game = row.game;
    /** @type {number} */ this.maxPlayers = row.max_players;
    /** @type {Object} */ this.settings = row.settings || {};
    /** @type {'lobby'|'playing'|'finished'} */ this.status = row.status;
    /** @type {boolean} */ this.isPublic = row.is_public;
    /** @type {string} id trenutnega hosta */ this.hostId = row.host_id;
    /** @type {Player[]} prisotni igralci, urejeni po času pridružitve */ this.players = [];
    this.profile = profile;
    this.ready = false;
    this.left = false;
    this._dbHost = row.host_id;
    this._handlers = new Map();
    this._seen = new Map();          // id → player (zadnji znani)
    this._absentSince = new Map();   // id → ms
    this._hostMissingSince = null;
    this._lastTouch = 0;
    this._lastClaim = 0;
    this._syncing = true;
  }

  /** @returns {Player} jaz */
  get me() {
    return this.players.find(p => p.id === this.backend.userId) || { ...this._meta(), isHost: this.isHost };
  }

  /** @returns {boolean} ali sem host */
  get isHost() { return this.hostId === this.backend.userId; }

  /** Povezava na realtime kanal (kliče hub). */
  async _connect() {
    const uid = this.backend.userId;
    const members = await this.backend.getRoomPlayers(this.code);
    this.joinedAt = members.find(m => m.user_id === uid)?.joined_at || new Date().toISOString();
    this.t = this.backend.channel(this.code);
    this.t.onMessage((type, payload, from) => this._onMsg(type, payload, from));
    this.t.onPresence(list => this._onPresence(list));
    await this.t.track(this._meta());
    this._onPresence(this.t.presence());
    this._timer = setInterval(() => this._tick(), 1000);
    // vprašaj obstoječe igralce za trenutno stanje (host, status, nastavitve)
    this.t.send('__hello', {});
    await new Promise(r => setTimeout(r, Math.min(SYNC_WAIT_MS, this.players.length > 1 ? SYNC_WAIT_MS : 300)));
    this._syncing = false;
    return this;
  }

  _meta() {
    return {
      id: this.backend.userId,
      nickname: this.profile?.nickname || '???',
      avatar: this.profile?.avatar || { emoji: '🙂', color: '#ffd23f' },
      equipped: this.profile?.equipped || {},
      joinedAt: this.joinedAt,
      ready: this.ready,
    };
  }

  /** Nov profil (npr. po opremljanju kozmetike) → posodobi presence (kliče hub). */
  async _updateProfile(profile) {
    this.profile = profile;
    if (this.left || !this.t) return;
    await this.t.track(this._meta());
    this._onPresence(this.t.presence());
  }

  /* ----------------------------- dogodki ------------------------------- */

  /**
   * Poslušaj dogodek ali sporočilo. Vrne funkcijo za odjavo.
   * @param {string} type
   * @param {Function} cb
   */
  on(type, cb) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(cb);
    return () => this._handlers.get(type)?.delete(cb);
  }

  _emit(type, ...args) {
    for (const cb of this._handlers.get(type) || []) {
      try { cb(...args); } catch (e) { console.error(e); }
    }
  }

  /**
   * Pošlji sporočilo vsem igralcem v sobi (tudi sebi).
   * @param {string} type poljubno ime (ne sme se začeti z '__')
   * @param {any} [payload] JSON vrednost
   */
  send(type, payload = null) {
    if (this.left) return;
    if (type.startsWith('__')) throw new Error('Imena z __ so rezervirana.');
    this.t.send(type, payload);
  }

  /**
   * Spremembe seznama igralcev. cb se pokliče takoj in ob vsaki spremembi.
   * @param {(players:Player[]) => void} cb
   */
  onPlayers(cb) {
    const off = this.on('__players', cb);
    cb(this.players);
    return off;
  }

  /** @param {(settings:Object) => void} cb klic, ko host začne igro */
  onStart(cb) { return this.on('start', cb); }

  /** @param {(move:{seq:number, move:any, user_id:string}) => void} cb */
  onMove(cb) { return this.on('move', cb); }

  /** @param {(s:{state:any, version:number, from:string}) => void} cb */
  onState(cb) { return this.on('state', cb); }

  _onMsg(type, payload, from) {
    if (this.left) return;
    const me = this.backend.userId;
    switch (type) {
      case '__hello':
        if (from !== me && !this._syncing) {
          this.t.send('__welcome', { to: from, hostId: this.hostId, status: this.status, settings: this.settings });
        }
        return;
      case '__welcome':
        if (payload?.to === me && this._syncing) {
          this._syncing = false;
          if (payload.hostId && payload.hostId !== this.hostId) {
            const previous = this.hostId;
            this.hostId = payload.hostId;
            this._refreshPlayers();
            this._emit('hostChanged', { hostId: this.hostId, previous });
          }
          if (payload.status && payload.status !== this.status) { this.status = payload.status; this._emit('status', this.status); }
          if (payload.settings) this.settings = payload.settings;
        }
        return;
      case '__start':
        this.status = 'playing';
        this.settings = payload?.settings || this.settings;
        this._emit('status', this.status);
        this._emit('start', this.settings);
        return;
      case '__status':
        this.status = payload.status;
        this._emit('status', this.status);
        return;
      case '__host':
        if (payload.hostId !== this.hostId) {
          const previous = this.hostId;
          this.hostId = payload.hostId;
          this._hostMissingSince = null;
          this._refreshPlayers();
          this._emit('hostChanged', { hostId: this.hostId, previous });
        }
        return;
      case '__state':
        this._emit('state', { ...payload, from });
        return;
      case '__move':
        this._emit('move', payload);
        return;
      case '__kick':
        if (payload?.id === me) { this._emit('kicked'); this.leave(); }
        return;
      default:
        if (type.startsWith('__')) return;
        this._emit(type, payload, from);
        this._emit('*', type, payload, from);
    }
  }

  _onPresence(list) {
    if (this.left) return;
    const now = Date.now();
    const prevIds = new Set(this.players.map(p => p.id));
    const byId = new Map();
    for (const m of list) if (m?.id && !byId.has(m.id)) byId.set(m.id, m);
    // jaz sem vedno prisoten
    byId.set(this.backend.userId, this._meta());
    const present = [...byId.values()];
    const ids = new Set(present.map(p => p.id));

    for (const p of present) { this._seen.set(p.id, p); this._absentSince.delete(p.id); }
    for (const id of prevIds) if (!ids.has(id)) this._absentSince.set(id, now);

    if (ids.has(this.hostId)) this._hostMissingSince = null;
    else if (!this._hostMissingSince) this._hostMissingSince = now;

    this._present = present;
    this._refreshPlayers();
    for (const p of this.players) if (!prevIds.has(p.id) && p.id !== this.backend.userId && prevIds.size) this._emit('playerJoined', p);
    for (const id of prevIds) if (!ids.has(id)) this._emit('playerLeft', this._seen.get(id));
  }

  _refreshPlayers() {
    const present = this._present || [this._meta()];
    this.players = present
      .map(m => ({ id: m.id, nickname: m.nickname, avatar: m.avatar, equipped: m.equipped || {}, ready: !!m.ready, joinedAt: m.joinedAt, isHost: m.id === this.hostId }))
      .sort((a, b) => (new Date(a.joinedAt) - new Date(b.joinedAt)) || (a.id < b.id ? -1 : 1));
    this._emit('__players', this.players);
  }

  async _tick() {
    if (this.left) return;
    const now = Date.now();
    // prenos hosta
    if (this._hostMissingSince && now - this._hostMissingSince > HOST_GRACE_MS) {
      const next = pickHost(this._present || [], null);
      if (next && next !== this.hostId) {
        const previous = this.hostId;
        this.hostId = next;
        this._hostMissingSince = null;
        this._refreshPlayers();
        this._emit('hostChanged', { hostId: next, previous });
      }
    }
    if (!this.isHost) return;
    // zapiši prevzem hosta v bazo (ponavljaj, dokler ne uspe)
    if (this._dbHost !== this.backend.userId && now - this._lastClaim > 5000) {
      this._lastClaim = now;
      try {
        const row = await this.backend.claimHost(this.code);
        this._dbHost = row?.host_id || this._dbHost;
      } catch { /* poskusi kasneje (npr. ko soba »zastara«) */ }
    }
    if (this._dbHost !== this.backend.userId) return;
    if (now - this._lastTouch > TOUCH_MS) {
      this._lastTouch = now;
      this.backend.updateRoom(this.code, {}).catch(() => {});
    }
    // med igro odsotnih ne odstranjujemo (lahko se vrnejo; o izločitvi odloča igra) — le v lobbyju
    for (const [id, since] of this._absentSince) {
      if (this.status === 'lobby' && now - since > PLAYER_DROP_MS) {
        this._absentSince.delete(id);
        this.backend.removePlayer(this.code, id).catch(() => {});
      }
    }
  }

  /* ----------------------------- lobby --------------------------------- */

  /** @param {boolean} ready */
  async setReady(ready) {
    this.ready = !!ready;
    await this.t.track(this._meta());
    this._onPresence(this.t.presence());
  }

  /**
   * Začni igro (samo host). Vsi dobijo dogodek 'start' / onStart(settings).
   * @param {Object} [settings]
   */
  async start(settings = this.settings) {
    if (!this.isHost) throw new Error('Igro lahko začne samo host.');
    this.settings = settings || {};
    this.status = 'playing';
    try { await this.backend.updateRoom(this.code, { status: 'playing', settings: this.settings }); } catch (e) { console.warn('start:', e.message); }
    this.t.send('__start', { settings: this.settings });
  }

  /**
   * Nastavi status sobe (samo host): 'lobby' (nova runda), 'playing', 'finished'.
   * @param {'lobby'|'playing'|'finished'} status
   */
  async setStatus(status) {
    if (!this.isHost) throw new Error('Status lahko spremeni samo host.');
    this.status = status;
    try { await this.backend.updateRoom(this.code, { status }); } catch (e) { console.warn('setStatus:', e.message); }
    this.t.send('__status', { status });
  }

  /** Odstrani igralca (samo host). */
  async kick(userId) {
    if (!this.isHost) throw new Error('Samo host lahko odstrani igralca.');
    this.t.send('__kick', { id: userId });
    await this.backend.removePlayer(this.code, userId).catch(() => {});
  }

  /** Zapusti sobo. Če si host, ga prevzame naslednji igralec. */
  async leave() {
    if (this.left) return;
    const alone = this.players.filter(p => p.id !== this.backend.userId).length === 0;
    if (this.isHost && alone && this.status !== 'finished') {
      await this.backend.updateRoom(this.code, { status: 'finished' }).catch(() => {});
    }
    if (this.isHost && !alone) {
      const next = pickHost(this.players.filter(p => p.id !== this.backend.userId), null);
      if (next) this.t.send('__host', { hostId: next });
    }
    this.left = true;
    clearInterval(this._timer);
    await this.backend.removePlayer(this.code, this.backend.userId).catch(() => {});
    await this.t.close();
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('room') === this.code) { u.searchParams.delete('room'); history.replaceState(null, '', u); }
    } catch { /* ignore */ }
  }

  /* ---------------------- potezne / asinhrone igre ---------------------- */

  /** @returns {Promise<{state:any, version:number}>} */
  getState() { return this.backend.getState(this.code); }

  /**
   * Zapiši stanje sobe. Z expectedVersion je zapis optimistično zaklenjen:
   * če je kdo medtem zapisal novo verzijo, vrže napako z `err.code === 'version_conflict'`.
   * Ostali igralci dobijo dogodek 'state'.
   * @param {any} state
   * @param {{expectedVersion?:number|null}} [opt]
   * @returns {Promise<number>} nova verzija
   */
  async setState(state, { expectedVersion = null } = {}) {
    const version = await this.backend.setState(this.code, state, expectedVersion);
    this.t.send('__state', { state, version });
    return version;
  }

  /**
   * Dodaj potezo (zaporedna številka seq se dodeli samodejno). Vsi dobijo 'move'.
   * @param {any} move
   * @returns {Promise<number>} seq
   */
  async pushMove(move) {
    const seq = await this.backend.pushMove(this.code, move);
    this.t.send('__move', { seq, move, user_id: this.backend.userId });
    return seq;
  }

  /** Vse poteze po seq (za replay in ponovno povezavo). */
  getMoves(sinceSeq = 0) { return this.backend.getMoves(this.code, sinceSeq); }
}
