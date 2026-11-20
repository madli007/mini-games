/* =====================================================================
   SUPABASE ADAPTER
   Isti vmesnik kot LocalBackend (glej adapters/types.js).
   Prijava: anonimna (signInAnonymously). Realtime: broadcast + presence
   na kanalu `room:<KODA>`, postgres_changes na tabeli rooms za lobbyje.
   ===================================================================== */

import { codedError } from './local.js';
import { normalizeRoomCode } from '../util.js';

const KNOWN = ['room_not_found', 'room_started', 'room_full', 'version_conflict', 'not_next_host',
  'no_profile', 'not_authenticated', 'too_many_rooms', 'move_conflict'];
const MESSAGES = {
  room_not_found: 'Soba s to kodo ne obstaja.',
  room_started: 'Igra v tej sobi se je že začela.',
  room_full: 'Soba je polna.',
  version_conflict: 'Stanje je medtem spremenil nekdo drug.',
  nickname_taken: 'Ta vzdevek je že zaseden.',
  no_profile: 'Najprej izberi vzdevek.',
  too_many_rooms: 'Ustvaril si preveč sob. Počakaj malo.',
};

/** Pretvori napako Supabase v codedError z znano oznako. */
function wrap(err) {
  if (!err) return err;
  const msg = String(err.message || err);
  const code = KNOWN.find(k => msg.includes(k))
    || (err.code === '23505' ? 'nickname_taken' : null)
    || (err.code === '42501' ? 'forbidden' : 'error');
  const e = codedError(code, MESSAGES[code] || msg);
  e.cause = err;
  return e;
}

function check({ data, error }) {
  if (error) throw wrap(error);
  return data;
}

export class SupabaseBackend {
  /**
   * @param {{url:string, key:string, lib:string, identity?:string|null}} opt
   *   identity: ločena prijava za testiranje več igralcev v istem brskalniku (?igralec=N)
   */
  constructor(opt) {
    this.kind = 'supabase';
    this.opt = opt;
    this.client = null;
    this.userId = null;
    this.user = null;
  }

  async init() {
    const mod = await import(/* @vite-ignore */ this.opt.lib);
    const storageKey = 'mg-auth' + (this.opt.identity ? '-' + this.opt.identity : '');
    this.client = mod.createClient(this.opt.url, this.opt.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey },
      realtime: { params: { eventsPerSecond: 20 } },
    });
    let { data: { session } } = await this.client.auth.getSession();
    if (!session) {
      const res = await this.client.auth.signInAnonymously();
      if (res.error) throw wrap(res.error);
      session = res.data.session;
    }
    this.user = session.user;
    this.userId = session.user.id;
    this.client.auth.onAuthStateChange((_ev, s) => {
      if (s?.user) { this.user = s.user; }
    });
    return this.userId;
  }

  get isGuest() { return false; }

  /** Email, povezan s profilom (null = samo anonimen). */
  get email() { return this.user?.email || this.user?.new_email || null; }

  /**
   * »Shrani profil«: poveži anonimni račun z emailom (magic link potrditev).
   * @param {string} email
   */
  async linkEmail(email) {
    const redirect = location.href.split('#')[0];
    const { error } = await this.client.auth.updateUser({ email }, { emailRedirectTo: redirect });
    if (error) throw wrap(error);
  }

  /** Prijava v obstoječ (shranjen) profil na drugi napravi — pošlje magic link. */
  async signInWithEmail(email) {
    const redirect = location.href.split('#')[0];
    const { error } = await this.client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirect } });
    if (error) throw wrap(error);
  }

  dispose() { this.client?.removeAllChannels(); }

  /* ------------------------------- profil -------------------------------- */

  async getProfile(id = this.userId) {
    return check(await this.client.from('profiles').select('*').eq('id', id).maybeSingle());
  }

  async saveProfile({ nickname, avatar }) {
    const nick = String(nickname).trim();
    const cur = await this.getProfile();
    if (cur) {
      const patch = { nickname: nick };
      if (avatar) patch.avatar = avatar;
      return check(await this.client.from('profiles').update(patch).eq('id', this.userId).select().single());
    }
    return check(await this.client.from('profiles').insert({ id: this.userId, nickname: nick, avatar }).select().single());
  }

  async getProfiles(ids) {
    if (!ids.length) return [];
    return check(await this.client.from('profiles').select('*').in('id', ids));
  }

  async topXp(limit = 10) {
    return check(await this.client.from('profiles').select('id,nickname,avatar,xp').order('xp', { ascending: false }).limit(limit));
  }

  /* --------------------------------- XP ---------------------------------- */

  async awardXp(amount, reason) {
    return check(await this.client.rpc('award_xp', { amount: Math.floor(amount), reason: reason || null }));
  }

  /* ------------------------------ lestvice ------------------------------- */

  async submitScore({ game, score, seed = null, meta = {} }) {
    return check(await this.client.from('game_scores').insert({ game, score: Math.round(score), seed, meta }).select().single());
  }

  async getLeaderboard({ game, seed = null, since = null, limit = 10, asc = false }) {
    return check(await this.client.rpc('get_leaderboard', {
      p_game: game, p_seed: seed, p_since: since ? since.toISOString() : null, p_limit: limit, p_asc: asc,
    }));
  }

  async getMyBest({ game, seed = null, asc = false }) {
    let q = this.client.from('game_scores').select('score').eq('game', game).eq('user_id', this.userId);
    if (seed != null) q = q.eq('seed', seed);
    const rows = check(await q.order('score', { ascending: asc }).limit(1));
    return rows[0]?.score ?? null;
  }

  /* ------------------------------ dosežki -------------------------------- */

  async unlock({ game, key, title = null, icon = null }) {
    const { error } = await this.client.from('achievements').insert({ game, key, title, icon });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw wrap(error);
  }

  async getAchievements({ game = null, userId = this.userId } = {}) {
    let q = this.client.from('achievements').select('*').eq('user_id', userId);
    if (game) q = q.eq('game', game);
    return check(await q.order('unlocked_at', { ascending: false }));
  }

  /* -------------------------------- sobe --------------------------------- */

  async createRoom({ game, maxPlayers = 10, settings = {}, isPublic = true }) {
    return check(await this.client.rpc('create_room', {
      p_game: game, p_max_players: maxPlayers, p_settings: settings, p_is_public: isPublic,
    }));
  }

  async joinRoom(input) {
    const code = normalizeRoomCode(input);
    if (!code) throw codedError('room_not_found', MESSAGES.room_not_found);
    return check(await this.client.rpc('join_room', { p_code: code }));
  }

  async findRoom(input) {
    const code = normalizeRoomCode(input);
    if (!code) return null;
    const rows = check(await this.client.rpc('find_room', { p_code: code }));
    return rows?.[0] || null;
  }

  async getRoom(code) {
    return check(await this.client.from('rooms').select('*').eq('code', code).maybeSingle());
  }

  async getRoomPlayers(code) {
    return check(await this.client.from('room_players').select('user_id,joined_at').eq('room_code', code).order('joined_at'));
  }

  async updateRoom(code, patch) {
    const allowed = {};
    for (const k of ['status', 'settings', 'is_public', 'max_players']) if (k in patch) allowed[k] = patch[k];
    if (!Object.keys(allowed).length) {
      // »dotik« sobe (osveži updated_at)
      const r = await this.getRoom(code);
      if (!r) return null;
      allowed.status = r.status;
    }
    const rows = check(await this.client.from('rooms').update(allowed).eq('code', code).select());
    if (!rows.length) throw codedError('not_host', 'Samo host lahko ureja sobo.');
    return rows[0];
  }

  async claimHost(code) {
    return check(await this.client.rpc('claim_host', { p_code: code }));
  }

  async removePlayer(code, userId) {
    check(await this.client.from('room_players').delete().eq('room_code', code).eq('user_id', userId));
  }

  async listLobbies({ freshMinutes = 3 } = {}) {
    return check(await this.client.rpc('list_lobbies', { p_fresh_minutes: freshMinutes }));
  }

  onLobbiesChange(cb) {
    const ch = this.client.channel('lobbies-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => cb())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players' }, () => cb())
      .subscribe();
    return () => this.client.removeChannel(ch);
  }

  /* ------------------------- stanje in poteze ---------------------------- */

  async getState(code) {
    const row = check(await this.client.from('room_state').select('state,version').eq('room_code', code).maybeSingle());
    return row || { state: null, version: 0 };
  }

  async setState(code, state, expectedVersion = null) {
    return check(await this.client.rpc('set_room_state', { p_code: code, p_state: state, p_expected_version: expectedVersion }));
  }

  async pushMove(code, move) {
    return check(await this.client.rpc('push_move', { p_code: code, p_move: move }));
  }

  async getMoves(code, sinceSeq = 0) {
    return check(await this.client.from('moves').select('seq,user_id,move,created_at')
      .eq('room_code', code).gt('seq', sinceSeq).order('seq'));
  }

  /* ------------------------------ realtime ------------------------------- */

  channel(code) {
    return new SupabaseTransport(this.client, code, this.userId);
  }
}

class SupabaseTransport {
  constructor(client, code, userId) {
    this.client = client;
    this.userId = userId;
    this.meta = null;
    this.msgCbs = new Set();
    this.presCbs = new Set();
    this.ready = false;
    this.ch = client.channel('room:' + code, {
      config: { broadcast: { self: true }, presence: { key: userId } },
    });
    this.ch.on('broadcast', { event: 'm' }, ({ payload }) => {
      this.msgCbs.forEach(cb => cb(payload.type, payload.payload, payload.from));
    });
    this.ch.on('presence', { event: 'sync' }, () => {
      const list = this.presence();
      this.presCbs.forEach(cb => cb(list));
    });
    this.subscribed = new Promise(resolve => {
      this.ch.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          this.ready = true;
          if (this.meta) this.ch.track(this.meta);
          resolve();
        }
      });
    });
  }

  async track(meta) {
    this.meta = meta;
    if (this.ready) await this.ch.track(meta);
    else await this.subscribed;
  }

  presence() {
    const st = this.ch.presenceState();
    // en vnos na ključ (isti uporabnik v dveh zavihkih → prvi)
    return Object.values(st).map(arr => arr[0]).filter(Boolean);
  }

  onPresence(cb) { this.presCbs.add(cb); return () => this.presCbs.delete(cb); }

  send(type, payload) {
    const msg = { type: 'broadcast', event: 'm', payload: { type, payload, from: this.userId } };
    if (this.ready) this.ch.send(msg);
    else this.subscribed.then(() => this.ch.send(msg));
  }

  onMessage(cb) { this.msgCbs.add(cb); return () => this.msgCbs.delete(cb); }

  async close() {
    try { await this.ch.untrack(); } catch { /* ignore */ }
    try { await this.client.removeChannel(this.ch); } catch { /* ignore */ }
    this.msgCbs.clear();
    this.presCbs.clear();
  }
}
