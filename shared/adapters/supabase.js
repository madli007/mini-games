/* =====================================================================
   SUPABASE ADAPTER
   Isti vmesnik kot LocalBackend (glej adapters/types.js).
   Prijava: anonimna (signInAnonymously). Realtime: broadcast + presence
   na kanalu `room:<KODA>`, postgres_changes na tabeli rooms za lobbyje.
   ===================================================================== */

import { codedError } from './local.js';
import { normalizeRoomCode, level as levelOf } from '../util.js';

const KNOWN = ['room_not_found', 'room_started', 'room_full', 'version_conflict', 'not_next_host',
  'no_profile', 'not_authenticated', 'too_many_rooms', 'move_conflict',
  'not_enough_coins', 'not_owned', 'not_free', 'locked', 'owned', 'unavailable', 'claimed', 'expired',
  'impossible_time', 'ghost_too_big', 'unknown_level', 'invalid_level', 'level_too_big', 'too_many_levels',
  'cup_closed', 'cup_already', 'cup_no_r1', 'cup_cut', 'cup_too_big', 'cup_impossible', 'cup_unknown'];
const MESSAGES = {
  room_not_found: 'Soba s to kodo ne obstaja.',
  room_started: 'Igra v tej sobi se je že začela.',
  room_full: 'Soba je polna.',
  version_conflict: 'Stanje je medtem spremenil nekdo drug.',
  nickname_taken: 'Ta vzdevek je že zaseden.',
  no_profile: 'Najprej izberi vzdevek.',
  too_many_rooms: 'Ustvaril si preveč sob. Počakaj malo.',
  not_enough_coins: 'Premalo kovancev.',
  locked: 'Predmet je zaklenjen.',
  owned: 'Ta predmet že imaš.',
  unavailable: 'Predmet ni na voljo.',
  not_free: 'Predmet je treba kupiti.',
  not_owned: 'Tega predmeta nimaš.',
  claimed: 'Nagrada je že prevzeta.',
  expired: 'Naloga je potekla.',
  invalid_level: 'Proga ni veljavna (ime 2–40 znakov, mreža, čas autopilota).',
  level_too_big: 'Proga je prevelika za objavo (največ ~60 KB).',
  too_many_levels: 'Objaviš lahko največ 20 prog — najprej umakni katero od starih.',
  cup_closed: 'Serija ni odprta.',
  cup_already: 'To serijo si že skočil.',
  cup_no_r1: 'Najprej skoči 1. serijo.',
  cup_cut: 'Nisi se uvrstil v 2. serijo.',
  cup_too_big: 'Zapis skoka je neveljaven ali prevelik.',
  cup_impossible: 'Nemogoč rezultat.',
  cup_unknown: 'Neznana postaja.',
};

/** Vrstica objavljene proge (profil avtorja splošči kot pri ghostih). */
function levelRow(r) {
  return {
    id: r.id, user_id: r.user_id, name: r.name, hash: r.hash, dev_ms: r.dev_ms, width: r.width, depth: r.depth, plays: r.plays, created_at: r.created_at,
    nickname: r.profiles?.nickname || '???', avatar: r.profiles?.avatar || { emoji: '❔', color: '#888' }, equipped: r.profiles?.equipped || {},
  };
}

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
    return check(await this.client.from('profiles').select('id,nickname,avatar,xp,equipped').order('xp', { ascending: false }).limit(limit));
  }

  /* --------------------------------- XP ---------------------------------- */

  async awardXp(amount, reason) {
    return check(await this.client.rpc('award_xp', { amount: Math.floor(amount), reason: reason || null }));
  }

  /* ------------------------------ kovanci -------------------------------- */

  async awardCoins(amount, reason = '', ref = null) {
    return check(await this.client.rpc('award_coins', { amount: Math.floor(amount), reason: reason || null, ref }));
  }

  async reportGame({ game, won = false, players = 1 }) {
    return check(await this.client.rpc('report_game', { p_game: game, p_won: !!won, p_players: Math.max(1, players | 0) }));
  }

  /* ------------------------- trgovina in oprema -------------------------- */

  async getInventory(userId = this.userId) {
    return check(await this.client.from('inventory').select('user_id,item_id,acquired_at,source').eq('user_id', userId));
  }

  /** Stanje za preverjanje pogojev (nivo, dosežki, niz) — prikaz v trgovini; strežnik preveri sam. */
  async unlockState(uid = this.userId) {
    const p = await this.getProfile(uid);
    const ach = check(await this.client.from('achievements').select('game,key').eq('user_id', uid));
    return { level: levelOf(p?.xp || 0).level, achievements: ach.map(a => a.game + ':' + a.key), streak: Math.max(p?.streak || 0, p?.best_streak || 0) };
  }

  async buyItem(itemId) {
    return check(await this.client.rpc('buy_item', { p_item: itemId }));
  }

  async unlockItem(itemId) {
    return check(await this.client.rpc('unlock_item', { p_item: itemId }));
  }

  async equip(slot, itemId = null) {
    return check(await this.client.rpc('equip', { p_slot: slot, p_item: itemId }));
  }

  /* ------------------------------- naloge -------------------------------- */

  async getQuestProgress(periods) {
    return check(await this.client.from('quest_progress').select('period,quest_id,progress,data,claimed_at')
      .eq('user_id', this.userId).in('period', periods));
  }

  async saveQuestProgress({ period, quest_id, progress, data = {} }) {
    return check(await this.client.rpc('set_quest_progress', { p_period: period, p_quest_id: quest_id, p_progress: progress, p_data: data }));
  }

  async claimQuest(period, questId) {
    return check(await this.client.rpc('claim_quest', { p_period: period, p_quest_id: questId }));
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

  async getTopScores({ game, seed = null, limit = 10, asc = false }) {
    let q = this.client.from('game_scores').select('user_id,score,meta,created_at,profiles(nickname,avatar,equipped)').eq('game', game);
    if (seed != null) q = q.eq('seed', seed);
    const rows = check(await q.order('score', { ascending: asc }).order('created_at', { ascending: true }).limit(Math.max(1, Math.min(limit, 100))));
    return rows.map(({ profiles: p, ...r }) => ({ ...r, nickname: p?.nickname || '???', avatar: p?.avatar || { emoji: '❔', color: '#888' }, equipped: p?.equipped || {} }));
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

  /* ------------------------------- ghosti -------------------------------- */
  // Tabela <igra>_ghosts in RPC <igra>_save_ghost (npr. supabase/games/krogla.sql).

  // order 'desc' (več je bolje) uveljavi RPC igre sam (npr. skoki_save_ghost); tu vpliva le na branje.
  async saveGhost({ game, level, mirror = false, timeMs, data }) {
    const fn = game.replace(/-/g, '_') + '_save_ghost';
    return check(await this.client.rpc(fn, { p_level: level, p_mirror: !!mirror, p_time_ms: Math.round(timeMs), p_data: data }));
  }

  async getGhosts({ game, level, mirror = false, limit = 10, order = 'asc' }) {
    const t = game.replace(/-/g, '_') + '_ghosts';
    const rows = check(await this.client.from(t).select('user_id,time_ms,created_at,profiles(nickname,avatar,equipped)')
      .eq('level', level).eq('mirror', !!mirror).order('time_ms', { ascending: order !== 'desc' }).limit(limit));
    return rows.map(r => ({
      user_id: r.user_id, time_ms: r.time_ms, created_at: r.created_at,
      nickname: r.profiles?.nickname || '???', avatar: r.profiles?.avatar || { emoji: '❔', color: '#888' }, equipped: r.profiles?.equipped || {},
    }));
  }

  async getGhost({ game, level, mirror = false, userId = this.userId }) {
    const t = game.replace(/-/g, '_') + '_ghosts';
    return check(await this.client.from(t).select('user_id,time_ms,data').eq('user_id', userId).eq('level', level).eq('mirror', !!mirror).maybeSingle());
  }

  /* ------------------------------- pokal --------------------------------- */
  // Tabela <igra>_cup_jumps (pisanje le prek RPC <igra>_cup_submit), pogled <igra>_cup_board (brez vnosov, s profilom).

  async cupSubmit({ game, season, event, round, points, dist = 0, inputs, paramsVersion = 1 }) {
    const fn = game.replace(/-/g, '_') + '_cup_submit';
    return check(await this.client.rpc(fn, { p_season: season, p_event: event, p_round: round, p_points: points, p_dist: dist, p_inputs: inputs, p_params_version: paramsVersion }));
  }

  async cupStandings({ game, season }) {
    const t = game.replace(/-/g, '_') + '_cup_board';
    return check(await this.client.from(t).select('user_id,season,event,round,points,dist,params_version,created_at,nickname,avatar,equipped')
      .eq('season', season).order('event').order('round').limit(5000)).map(r => ({ ...r, points: +r.points, dist: +r.dist }));
  }

  async cupJump({ game, season, event, round, userId }) {
    const t = game.replace(/-/g, '_') + '_cup_jumps';
    const r = check(await this.client.from(t).select('user_id,event,round,points,dist,params_version,inputs')
      .eq('season', season).eq('event', event).eq('round', round).eq('user_id', userId).maybeSingle());
    return r ? { ...r, points: +r.points, dist: +r.dist } : null;
  }

  /* ------------------------ objavljene proge igralcev ------------------------ */
  // Tabela <igra>_custom_levels, RPC <igra>_publish_level, <igra>_level_played (npr. supabase/games/krogla.sql).

  async publishLevel({ game, name, hash, data, devMs, replace = null }) {
    const fn = game.replace(/-/g, '_') + '_publish_level';
    return check(await this.client.rpc(fn, { p_name: name, p_hash: hash, p_data: data, p_dev_ms: devMs, p_replace: replace }));
  }

  async listLevels({ game, sort = 'new', limit = 50, userId = null }) {
    const t = game.replace(/-/g, '_') + '_custom_levels';
    let q = this.client.from(t).select('id,user_id,name,hash,dev_ms,width,depth,plays,created_at,profiles(nickname,avatar,equipped)');
    if (userId) q = q.eq('user_id', userId);
    q = sort === 'popular' ? q.order('plays', { ascending: false }).order('created_at', { ascending: false }) : q.order('created_at', { ascending: false });
    return check(await q.limit(Math.min(200, limit))).map(levelRow);
  }

  async getLevel({ game, id }) {
    const t = game.replace(/-/g, '_') + '_custom_levels';
    const r = check(await this.client.from(t).select('id,user_id,name,hash,data,dev_ms,width,depth,plays,created_at,profiles(nickname,avatar,equipped)').eq('id', id).maybeSingle());
    return r ? { ...levelRow(r), data: r.data } : null;
  }

  async deleteLevel({ game, id }) {
    const t = game.replace(/-/g, '_') + '_custom_levels';
    const rows = check(await this.client.from(t).delete().eq('id', id).eq('user_id', this.userId).select('id'));
    return rows.length > 0;
  }

  async levelPlayed({ game, id }) {
    const fn = game.replace(/-/g, '_') + '_level_played';
    return check(await this.client.rpc(fn, { p_id: id }));
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
