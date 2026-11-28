/* =====================================================================
   ZAPOREDJE — spominska igra: polja zasvetijo, ti ponoviš.
   Klasika (solo), dnevni izziv z modifikatorji, spominski dvoboj
   (realtime, host vodi kroge) in štafeta (potezno, room state).
   ===================================================================== */
import { hub, ui } from '../../shared/hub.js';
import * as S from '../../shared/storage.js';
import * as Z from './logic.js';
import { createBoard } from './board.js';
import * as A from './audio.js';
import { startCloud } from './cloud.js';

const GAME = 'zaporedje';
const $ = s => document.querySelector(s);
const esc = ui.esc;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtLen = n => `${n} ${n === 1 ? 'korak' : n === 2 ? 'koraka' : n === 3 || n === 4 ? 'koraki' : 'korakov'}`;
const LEAD = 900;   // premor pred predvajanjem kroga

const ACH = [
  { key: 'prvi-koraki', title: 'Prvi koraki', icon: '👣', desc: 'Doseži zaporedje 5' },
  { key: 'slon', title: 'Spomin kot slon', icon: '🐘', desc: 'Doseži zaporedje 15' },
  { key: 'mojster', title: 'Mojster zaporedij', icon: '🎼', desc: 'Doseži zaporedje 25' },
  { key: 'genij', title: 'Človeški trdi disk', icon: '💾', desc: 'Doseži zaporedje 40' },
  { key: 'zrcalo', title: 'Skozi ogledalo', icon: '🪞', desc: 'V dnevnem z modifikatorjem Zrcalo doseži 10' },
  { key: 'posluh', title: 'Absolutni posluh', icon: '👂', desc: 'Z modifikatorjem Samo posluh doseži 10' },
  { key: 'dvoboj', title: 'Zadnji spomin', icon: '👑', desc: 'Zmagaj spominski dvoboj z vsaj 4 igralci' },
  { key: 'skladatelj', title: 'Skladatelj', icon: '✍️', desc: 'V štafeti dodaj korak, na katerem izpadeta vsaj 2' },
  { key: 'strela', title: 'Strela', icon: '⚡', desc: 'Krog z 10+ koraki s povprečjem pod 300 ms' },
  { key: 'vztrajen', title: 'Vztrajen', icon: '📅', desc: 'Dnevni izziv 7 dni zapored' },
];
const achDef = k => ACH.find(a => a.key === k);
const unlock = k => hub.unlock(k, { title: achDef(k).title, icon: achDef(k).icon });
async function unlockMany(keys) { for (const k of keys) await unlock(k); }

/* ===================================================================== */
/*  Zasloni in drobni gradniki                                           */
/* ===================================================================== */

let lobbyView = null;
let lbView = null;
let tv = new URLSearchParams(location.search).get('tv') === '1';

function show(id) {
  for (const s of document.querySelectorAll('.zp-screen')) s.classList.toggle('mg-hidden', s.id !== id);
  if (id !== 'lobby' && lobbyView) { lobbyView.destroy(); lobbyView = null; }
  if (id !== 'play') setGold(false);
  window.scrollTo({ top: 0 });
}
const playVisible = () => !$('#play').classList.contains('mg-hidden');

function setCount(n, lbl = null) {
  const el = $('#count');
  if (el.textContent !== String(n)) {
    el.textContent = n;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
  $('#countLbl').textContent = lbl ?? (n === 1 ? 'korak' : n === 2 ? 'koraka' : n === 3 || n === 4 ? 'koraki' : 'korakov');
}
function setStatus(text, cls = '') {
  const el = $('#status');
  el.textContent = text;
  el.className = 'zp-status ' + cls;
}
function setRec(html) { $('#recLbl').innerHTML = html; }
function setBars(stepsFrac, timeFrac = 0) {
  $('#barSteps').style.width = `${Math.max(0, Math.min(1, stepsFrac)) * 100}%`;
  const t = $('#barTime');
  t.style.width = `${Math.max(0, Math.min(1, timeFrac)) * 100}%`;
  t.classList.toggle('low', timeFrac > 0 && timeFrac < 0.3);
}
function setGold(on) { document.body.classList.toggle('zp-gold', !!on); }

let sayTimer = null;
function say(text, kind = '') {
  if (!text) return;
  const el = $('#say');
  el.textContent = text;
  el.className = 'zp-say ' + kind;
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { el.className = 'zp-say'; }, 2000);
}
function vibrate(p) {
  try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(p); } catch { /* ignore */ }
}

function tileHtml(id, big = false) {
  const t = Z.TILES[id];
  return t ? `<span class="${big ? 'zp-miss' : ''}" style="color:${t.color};text-shadow:0 0 10px ${t.color}">${t.sym}</span>` : '—';
}

/* ===================================================================== */
/*  Plošča, vnos, krog                                                   */
/* ===================================================================== */

const board = createBoard($('#stage'), { onPress: id => inputCtx?.press(id) });
let inputCtx = null;     // trenutni vnos: { press(id), finish(res) }
let roundToken = null;   // trenutno predvajanje

function cancelRound() {
  if (roundToken) roundToken.cancelled = true;
  roundToken = null;
  inputCtx?.finish(null);
  board.lock(true);
  setBars(0, 0);
}

/**
 * Vnos uporabnika za pričakovano zaporedje.
 * @returns {Promise<null|{ok:boolean, progress:number, ms:number, times:number[], reason:string|null, got:number|null, want:number|null}>}
 */
function collectInput(expected, limit, token, { onTap, text = 'Ponovi!' } = {}) {
  return new Promise(resolve => {
    let st = Z.startInput(expected);
    const t0 = performance.now();
    let last = t0;
    board.lock(false);
    setStatus(text, 'go');
    setBars(1, limit ? 1 : 0);
    const result = () => ({
      ok: st.done, progress: st.pos, ms: Math.round(performance.now() - t0), times: st.times,
      reason: st.reason, got: st.got, want: Z.missedTile(st),
    });
    const ctx = {
      press(id) {
        const now = performance.now();
        st = Z.press(st, id, now - last);
        last = now;
        onTap?.(id);
        setBars((expected.length - st.pos) / expected.length, limit ? 1 : 0);
        if (st.failed || st.done) ctx.finish(result());
      },
      finish(res) {
        if (inputCtx !== ctx) return;
        inputCtx = null;
        clearInterval(iv);
        board.lock(true);
        resolve(token.cancelled ? null : res);
      },
    };
    inputCtx = ctx;
    const iv = setInterval(() => {
      if (token.cancelled) { ctx.finish(null); return; }
      if (!limit) return;
      const el = performance.now() - last;
      $('#barTime').style.width = `${Math.max(0, 1 - el / limit) * 100}%`;
      $('#barTime').classList.toggle('low', el / limit > 0.7);
      if (Z.isTimedOut(el, limit)) { st = Z.timeout(st); ctx.finish(result()); }
    }, 50);
  });
}

/**
 * En krog: predvajaj prvih len korakov, nato zberi vnos.
 * @returns {Promise<null|object>} null = prekinjeno
 */
async function playRound({ seq, len, mod = 'none', limit = Z.DEFAULT_LIMIT, light = true, sound = true, input = true, lead = LEAD, watchText = 'Poslušaj …' }) {
  cancelRound();
  const token = roundToken = { cancelled: false };
  setCount(len);
  setStatus(watchText, 'watch');
  setBars(1, 0);
  await sleep(lead);
  if (token.cancelled) return null;
  const ok = await board.play(seq.slice(0, len), Z.tempoMs(len, mod), { light: light && mod !== 'ear', sound, token });
  if (!ok || token.cancelled) return null;
  if (!input) return { watched: true };
  return collectInput(Z.expectedFor(seq, len, mod), limit, token, { text: mod === 'mirror' ? 'Ponovi od zadaj naprej!' : 'Ponovi!' });
}

function feedbackOk() {
  board.pulse();
  setTimeout(() => A.chime(), 120);
  vibrate(25);
}

function feedbackFail(res) {
  A.buzz();
  board.wrong(res.got);
  if (res.want != null) setTimeout(() => board.hint(res.want), 250);
  board.shake();
  vibrate([90, 50, 140]);
  say(Z.lineForFail(res.reason, res.got, res.want), 'bad');
  setStatus(res.reason === 'timeout' ? 'Čas je potekel' : 'Napaka!', '');
}

/* ===================================================================== */
/*  MENI                                                                 */
/* ===================================================================== */

const key = k => `zaporedje:${k}:${hub.userId || 'anon'}`;
const classicBest = () => S.load(key('best'), 0) || 0;
const dailyDays = () => S.load(key('days'), []) || [];

async function dailyPlayed(seed) {
  if (dailyDays().includes(seed)) return true;
  return (await hub.getMyBest({ seed })) != null;
}

async function showMenu() {
  show('menu');
  refreshMenu();
}

async function refreshMenu() {
  const seed = hub.dailySeed();
  const plan = Z.dailyPlan(hub.rng, seed);
  const m = Z.modById(plan.mod);
  $('#dailyMod').innerHTML = `<span class="zp-mod__icon">${m.icon}</span><div><span class="mg-small mg-muted">Modifikator dneva</span><b>${esc(m.name)}</b><span class="mg-small">${esc(m.desc)}</span></div>`;
  const best = classicBest();
  $('#classicBest').textContent = best ? `Rekord ${best}` : 'Brez rekorda';
  const [today, ever, played] = await Promise.all([hub.getMyBest({ seed }), hub.getMyBest(), dailyPlayed(seed)]);
  $('#dailyState').textContent = played ? 'Odigrano · vaja' : 'Prvi poskus šteje';
  $('#btnDaily').textContent = played ? 'Vadi dnevno zaporedje' : 'Igraj dnevni izziv';
  $('#dailyBest').innerHTML = `<div><span class="mg-muted mg-small">Danes</span><b>${today != null ? today : '—'}</b></div>
    <div><span class="mg-muted mg-small">Najboljši dnevni</span><b>${ever != null ? ever : '—'}</b></div>
    <div><span class="mg-muted mg-small">Niz dni</span><b>${Z.dayStreak(dailyDays(), seed)}</b></div>`;
  if (!lbView) {
    lbView = ui.leaderboard($('#board'), {
      title: 'Lestvica · dnevni izziv', format: s => fmtLen(s),
      tabs: [{ label: 'Danes', seed }, { label: 'Teden', period: 'week' }, { label: 'Vseh časov' }],
    });
  } else lbView.refresh();
  const mine = new Set((await hub.getAchievements()).map(a => a.key));
  $('#achList').innerHTML = ACH.map(a => `<div class="zp-ach__item ${mine.has(a.key) ? '' : 'locked'}">
    <span>${a.icon}</span><div><b>${esc(a.title)}</b><span class="mg-small mg-muted">${esc(a.desc)}</span></div></div>`).join('');
}

/* ===================================================================== */
/*  SOLO — klasika in dnevni izziv                                       */
/* ===================================================================== */

let solo = null;   // { token }

function setupPlay({ mode, mod = 'none', n = 4 }) {
  show('play');
  $('#players').classList.add('mg-hidden');
  $('#side').classList.add('mg-hidden');
  $('.zp-layout').classList.remove('has-side');
  $('#endbar').classList.add('mg-hidden');
  $('#modeLbl').textContent = mode;
  const m = Z.modById(mod);
  $('#modLbl').textContent = mod === 'none' ? '' : `${m.icon} ${m.name}`;
  $('#modLbl').classList.toggle('mg-hidden', mod === 'none');
  A.setSilenced(mod === 'silent');
  board.setLayout(Z.identityLayout(n));
  setCount(0);
  setBars(0, 0);
  setGold(false);
}

async function playSolo(kind) {
  if (solo) return;
  A.unlockAudio();
  const me = solo = { cancelled: false };
  const daily = kind === 'daily';
  const seed = hub.dailySeed();
  let seq = [], mod = 'none', n = 4, limit, first = false, record = 0, chamRand = null;
  const second = !daily && $('#secondChance').checked;
  if (daily) {
    const plan = Z.dailyPlan(hub.rng, seed);
    ({ seq, mod, n } = plan);
    // ?mod=<id> — preizkus modifikatorja (vedno vaja, nikoli na lestvico)
    const forced = new URLSearchParams(location.search).get('mod');
    const testMod = forced && Z.MODS.some(m => m.id === forced) && forced !== mod;
    if (testMod) {
      mod = forced;
      n = mod === 'six' ? 6 : 4;
      seq = Z.seqFromSeed(hub.rng, seed + ':test:' + mod, Z.DAILY_LEN, n);
    }
    limit = Z.DEFAULT_LIMIT;
    first = !testMod && !(await dailyPlayed(seed));
    record = (await hub.getMyBest()) || 0;
    chamRand = hub.rng(seed + ':zaporedje:kameleon');
  } else {
    limit = +$('#soloLimit').value;
    S.save(key('limit'), limit);
    S.save(key('second'), second);
    record = second ? 0 : classicBest();
  }
  setupPlay({ mode: daily ? (first ? 'Dnevni izziv' : 'Dnevni · vaja') : 'Klasika', mod, n });
  setRec(record ? `Rekord: <b>${record}</b>` : (second ? 'Druga priložnost vklopljena — brez rekorda' : 'Postavi prvi rekord!'));
  let layout = Z.identityLayout(n);
  setStatus(daily ? Z.modById(mod).desc : 'Poslušaj, nato ponovi.', 'watch');
  await ui.countdown(3, { go: 'START' });
  if (me.cancelled) return;

  const rounds = [];
  let usedSecond = false;
  let fanfared = false;
  for (let len = 1; ; len++) {
    if (me.cancelled) return;
    if (!daily) while (seq.length < len) seq.push(Z.nextStep(seq, n, Math.random));
    if (len > seq.length) break;   // dnevno zaporedje do konca (120!)
    setGold(record > 0 && len >= record);
    const res = await playRound({ seq, len, mod, limit });
    if (!res || me.cancelled) return;
    rounds.push({ len, times: res.times, ok: res.ok, progress: res.progress, reason: res.reason, got: res.got, want: res.want });
    if (res.ok) {
      feedbackOk();
      if (record > 0 && len === record) say(Z.lineTie(), 'gold');
      else if (record > 0 && len === record + 1 && !fanfared) { fanfared = true; setTimeout(() => A.fanfare(), 200); say(Z.lineRecord(), 'gold'); setRec(`Nov rekord: <b>${len}</b>`); }
      else if (record > 0 && len > record) { setRec(`Nov rekord: <b>${len}</b>`); say(Z.lineForRound(len)); }
      else say(Z.lineForRound(len));
      setStatus('Pravilno!', 'go');
      if (mod === 'chameleon') {
        await sleep(450);
        layout = Z.chameleonLayout(layout, chamRand);
        board.setLayout(layout, { animate: true });
        setStatus('🦎 Ploščice so se premešale', 'watch');
        await sleep(650);
      } else await sleep(550);
    } else {
      feedbackFail(res);
      if (second && !usedSecond) {
        usedSecond = true;
        await sleep(1500);
        if (me.cancelled) return;
        say('Druga priložnost! Krog se ponovi.', 'gold');
        len--;
        await sleep(900);
        continue;
      }
      break;
    }
  }
  await sleep(1300);
  if (me.cancelled) return;
  solo = null;
  await finishSolo({ daily, first, seed, mod, rounds, second, record });
}

async function finishSolo({ daily, first, seed, mod, rounds, second, record }) {
  const sum = Z.summary(rounds);
  const len = sum.len;
  const last = rounds[rounds.length - 1];
  const steps = rounds.reduce((s, r) => s + (r.ok ? r.len : r.progress || 0), 0);
  const noRecord = !daily && second;
  setGold(false);

  if (daily && first) {
    await hub.submitScore(len, { seed, meta: { mod, steps } });
    S.update(key('days'), d => [...new Set([...(d || []), seed])].slice(-60), []);
  }
  let newRecord = false;
  if (!daily && !noRecord && len > classicBest()) { S.save(key('best'), len); newRecord = record > 0 || len > 0; }
  if (daily && len > record && record > 0) newRecord = true;

  const { granted } = await hub.awardXp(Z.xpFor({ len, daily: daily && first }), daily ? 'zaporedje: dnevni izziv' : 'zaporedje: klasika');
  hub.reportGame({ players: 1, score: len, daily: daily && first })
    .then(() => hub.reportEvent('zaporedje:len', len))
    .then(() => hub.reportEvent('zaporedje:steps', 1, { times: steps }));
  if (!noRecord) await unlockMany(Z.lengthAchievements(len));
  if (daily && mod === 'mirror' && len >= 10) await unlock('zrcalo');
  if (daily && mod === 'ear' && len >= 10) await unlock('posluh');
  if (rounds.some(Z.isLightning)) await unlock('strela');
  if (daily && first && Z.dayStreak(dailyDays(), seed) >= 7) await unlock('vztrajen');

  let rank = 0;
  if (daily) {
    const top = await hub.getLeaderboard({ seed, limit: 100 });
    rank = top.findIndex(r => r.user_id === hub.userId) + 1;
  }
  const miss = last && !last.ok ? (last.reason === 'timeout' ? '⏱️ čas' : `${tileHtml(last.want, true)} <span class="mg-small mg-muted">(tapnil ${tileHtml(last.got)})</span>`) : '—';
  const v = await ui.modal({
    title: newRecord ? 'Nov rekord!' : len >= 10 ? 'Odlično!' : 'Konec',
    wide: true,
    dismissible: false,
    onOpen: () => { if (newRecord) ui.winFx('stars'); },
    html: `<div class="zp-sum">
        <div><span class="mg-small mg-muted">Dolžina zaporedja</span><b>${fmtLen(len)}</b></div>
        <div><span class="mg-small mg-muted">Povprečje na korak</span><b>${sum.avgMs != null ? sum.avgMs + ' ms' : '—'}</b></div>
        <div><span class="mg-small mg-muted">Najhitrejši krog</span><b>${sum.fastest ? `${sum.fastest.round}. (${sum.fastest.avgMs} ms)` : '—'}</b></div>
        <div><span class="mg-small mg-muted">Zmotil si se pri</span><b>${miss}</b></div>
        ${daily ? `<div><span class="mg-small mg-muted">Mesto danes</span><b>${first && rank ? rank + '.' : first ? '—' : 'vaja'}</b></div>
          <div><span class="mg-small mg-muted">Modifikator</span><b>${Z.modById(mod).icon}</b></div>` : ''}
      </div>
      <p class="mg-center mg-xp-gain">+${granted} XP</p>
      ${noRecord ? '<p class="mg-center mg-small mg-muted">Igra z drugo priložnostjo ne šteje za rekord in dosežke za dolžino.</p>' : ''}
      ${daily && !first ? '<p class="mg-center mg-small mg-muted">Za lestvico je štel prvi današnji poskus — to je bila vaja.</p>' : ''}`,
    actions: [{ label: 'Meni', value: 'menu' }, { label: 'Še enkrat', value: 'again', kind: 'primary' }],
  });
  if (v === 'again') playSolo(daily ? 'daily' : 'classic'); else showMenu();
}

/* ===================================================================== */
/*  MULTIPLAYER — skupno                                                 */
/* ===================================================================== */

let room = null;
let mp = null;            // trenutna igra v sobi
let hostRunning = false;
let pending = null;       // host: zbiranje rezultatov kroga v dvoboju
const spectators = new Set();   // TV naprave (ne igrajo)

const DEFAULT_SETTINGS = { mode: 'duel', limit: Z.DEFAULT_LIMIT, n: 4, tvOnly: false, replay: true };
const newSeed = () => Math.random().toString(36).slice(2, 10);

function nameOf(id) {
  return mp?.names?.[id] || room?.players.find(p => p.id === id) || { nickname: '???', avatar: { emoji: '❔', color: '#888' }, equipped: {} };
}
const who = id => ({ ...nameOf(id), id });

async function createRoom() {
  try {
    const r = await hub.createRoom({ maxPlayers: 10, settings: { ...DEFAULT_SETTINGS } });
    enterRoom(r);
  } catch (e) {
    ui.toast(e.message, { icon: '⚠️' });
  }
}

async function joinRoom(code) {
  try {
    const r = await hub.joinRoom(code);
    enterRoom(r);
  } catch (e) {
    if (e.code === 'wrong_game') {
      const games = await hub.games();
      const g = games.find(x => x.id === e.game);
      if (g) { location.href = hub.link(g.path) + (hub.link(g.path).includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(code); return; }
    }
    const msg = { room_full: 'Soba je polna.', room_started: 'Igra v tej sobi se je že začela.', room_not_found: 'Soba s to kodo ne obstaja.' }[e.code] || e.message;
    await ui.modal({ title: 'Ne gre', html: `<p>${esc(msg)}</p>` });
    try { const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u); } catch { /* ignore */ }
    showMenu();
  }
}

function setTv(on) {
  tv = !!on;
  document.body.classList.toggle('zp-tv', tv);
  try { const u = new URL(location.href); if (tv) u.searchParams.set('tv', '1'); else u.searchParams.delete('tv'); history.replaceState(null, '', u); } catch { /* ignore */ }
  if (room && !room.left) room.send('spec', { on: tv });
}

function enterRoom(r) {
  room = r;
  wireRoom(r);
  if (tv) r.send('spec', { on: true });
  if (r.status === 'playing') rejoinGame();
  else showLobby();
}

async function rejoinGame() {
  const s = room.settings || {};
  if (s.mode === 'relay') {
    const { state, version } = await room.getState();
    if (state?.kind === 'relay' && !state.over) {
      initMp(state.settings || s, state.gid);
      enterPlayScreen();
      onRelayState(state, version);
      return;
    }
    showLobby();
    return;
  }
  initMp(s, s.seed);
  enterPlayScreen();
  setStatus('Povezujem se v igro …', 'watch');
  room.send('needSync', {});
  setTimeout(() => { if (mp && !mp.d && room && !room.left) showLobby(); }, 6000);
}

function showLobby() {
  closeModals();
  cancelRound();
  mp = null;
  show('lobby');
  lobbyView = ui.lobby($('#lobby'), room, {
    minPlayers: 2,
    title: 'Zaporedje · soba',
    onStart: () => {},   // start posluša wireRoom
    onLeave: () => { room = null; mp = null; showMenu(); },
    settingsForm(el) {
      const cur = { ...DEFAULT_SETTINGS, ...room.settings };
      const opt = (v, l, sel) => `<option value="${v}" ${String(v) === String(sel) ? 'selected' : ''}>${l}</option>`;
      el.innerHTML = `<div class="mg-grid mg-grid--2">
        <div class="mg-field"><label class="mg-label" for="setMode">Način</label>
          <select class="mg-select" id="setMode">${opt('duel', 'Spominski dvoboj', cur.mode)}${opt('relay', 'Štafeta (po vrsti)', cur.mode)}</select></div>
        <div class="mg-field"><label class="mg-label" for="setLimit">Čas na korak</label>
          <select class="mg-select" id="setLimit">${Z.STEP_LIMITS.map(v => opt(v, v ? v / 1000 + ' s' : 'brez', cur.limit)).join('')}</select></div>
        <div class="mg-field"><label class="mg-label" for="setN">Ploščice</label>
          <select class="mg-select" id="setN">${opt(4, '4 (2×2)', cur.n)}${opt(6, '6 (3×2)', cur.n)}</select></div>
        <div class="mg-stack" style="gap:4px">
          <label class="mg-check zp-check"><input type="checkbox" id="setTvOnly" ${cur.tvOnly ? 'checked' : ''}> <span>Predvajanje samo na TV-ju</span></label>
          <label class="mg-check zp-check"><input type="checkbox" id="setReplay" ${cur.replay ? 'checked' : ''}> <span>Štafeta: predvajaj pred potezo</span></label>
        </div></div>`;
      return () => ({
        mode: el.querySelector('#setMode').value,
        limit: +el.querySelector('#setLimit').value,
        n: +el.querySelector('#setN').value,
        tvOnly: el.querySelector('#setTvOnly').checked,
        replay: el.querySelector('#setReplay').checked,
        seed: newSeed(),
      });
    },
  });
  const extra = document.createElement('section');
  extra.className = 'mg-card mg-stack';
  const renderExtra = () => {
    const specs = room ? room.players.filter(p => spectators.has(p.id)) : [];
    extra.innerHTML = `<div class="mg-row mg-row--between"><h2 class="mg-title" style="margin:0">📺 TV pogled</h2>
        <button type="button" class="mg-btn ${tv ? 'mg-btn--cyan' : 'mg-btn--ghost'} mg-btn--small" id="btnTv">${tv ? 'Ta naprava je TV ✓' : 'Ta naprava je TV'}</button></div>
      <p class="mg-muted mg-small" style="margin:0">TV prikazuje velike ploščice, zaporedje in preživele, a <b>ne igra</b>. Igralci vnašajo na telefonih.
        Z »Predvajanje samo na TV-ju« telefoni med predvajanjem ostanejo temni — glej TV!</p>
      ${specs.length ? `<div class="mg-small">${specs.map(p => ui.who(p)).join(' ')}</div>` : ''}`;
    extra.querySelector('#btnTv').addEventListener('click', () => { setTv(!tv); renderExtra(); });
  };
  renderExtra();
  $('#lobby .mg-lobby')?.appendChild(extra);
  const off = room.onPlayers(() => renderExtra());
  const prev = lobbyView.destroy;
  lobbyView.destroy = () => { off(); prev(); };
}

function wireRoom(r) {
  r.onStart(settings => startMp(settings));
  r.on('spec', (p, from) => {
    if (p?.on) spectators.add(from); else spectators.delete(from);
    if (r.isHost && p?.on && mp?.d && !mp.d.over) {
      // TV, ki se pridruži med igro, dobi stanje
      r.send('sync', { to: from, d: publicD() });
    }
  });
  r.on('res', (p, from) => onRes(p, from));
  r.on('round', p => onRound(p));
  r.on('dstate', p => { if (mp && p.gid === mp.gid) { acceptD(p.d); renderPlayers(); renderSide(); } });
  r.on('roundEnd', p => onRoundEnd(p));
  r.on('final', p => finalDuel(p));
  r.on('needSync', (_p, from) => {
    if (!r.isHost || !mp?.d || from === hub.userId) return;
    if (mp.d.away) delete mp.d.away[from];
    if (mp.d.awayRound) delete mp.d.awayRound[from];
    if (pending) pending.rejoined.add(from);
    r.send('sync', { to: from, d: publicD(), cur: pending?.r || null });
  });
  r.on('sync', p => {
    if (p.to !== hub.userId || !mp || mp.gid !== p.d.gid) return;
    acceptD(p.d);
    renderPlayers();
    renderSide();
    const me = mp.d.st[hub.userId];
    if (p.d.over) setStatus('Igra je končana.', 'watch');
    else if (me && me.outRound == null) setStatus(p.cur ? 'Spet si tu! Vključiš se v naslednji krog.' : 'Spet si tu!', 'watch');
    else setStatus('Gledaš igro.', 'watch');
  });
  r.on('tap', (p, from) => onRelayTap(p, from));
  r.onState(({ state, version }) => onRelayState(state, version));
  r.on('hostChanged', ({ hostId }) => {
    renderPlayers();
    renderSide();
    if (tv) r.send('spec', { on: true });
    if (hostId !== hub.userId || r.status !== 'playing' || !mp) return;
    if (mp.kind === 'duel' && mp.d && !mp.d.over) {
      ui.toast('Host je odšel — igro vodiš ti.', { icon: '👑' });
      hostDuel((mp.d.round || 0) + 1);
    } else if (mp.kind === 'relay' && mp.r && !mp.r.over) {
      ui.toast('Host je odšel — igro vodiš ti.', { icon: '👑' });
    }
  });
  r.on('status', s => {
    if (s === 'lobby' && $('#lobby').classList.contains('mg-hidden')) showLobby();
  });
  r.onPlayers(() => { if (mp) { renderPlayers(); renderSide(); } });
  r.on('kicked', () => { room = null; mp = null; cancelRound(); ui.toast('Host te je odstranil iz sobe.', { icon: '🚪' }); showMenu(); });
  if (!relayWatch) relayWatch = setInterval(relayWatchdog, 1000);
}

function closeModals() {
  document.querySelectorAll('.mg-modal-back').forEach(el => el.remove());
}

function initMp(settings, gid) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  mp = {
    kind: s.mode === 'relay' ? 'relay' : 'duel', settings: s, gid,
    seq: Z.seqFromSeed(hub.rng, String(gid), Z.MP_LEN, s.n), names: {},
    d: null, r: null, rv: -1, curKey: null, doneSet: new Set(), myRounds: [], finalShown: false, turnSeen: -1,
  };
  for (const p of room.players) mp.names[p.id] = { nickname: p.nickname, avatar: p.avatar, equipped: p.equipped || {} };
  return mp;
}

function enterPlayScreen() {
  const s = mp.settings;
  show('play');
  setupPlay({ mode: mp.kind === 'relay' ? 'Štafeta' : 'Dvoboj', mod: 'none', n: s.n });
  $('#modLbl').classList.remove('mg-hidden');
  $('#modLbl').textContent = `Soba ${room.code}${tv ? ' · 📺 TV' : ''}`;
  $('#players').classList.remove('mg-hidden');
  $('#side').classList.remove('mg-hidden');
  $('.zp-layout').classList.add('has-side');
  setRec(tv ? 'TV pogled — ta naprava ne igra' : '');
  renderPlayers();
  renderSide();
}

/** Ali ta naprava prižiga ploščice in igra tone med predvajanjem? */
const showsPlayback = () => tv || !mp?.settings.tvOnly;

async function startMp(settings) {
  if (!room) return;
  closeModals();
  cancelRound();
  solo = null;
  initMp(settings, settings.seed || newSeed());
  const participants = room.players.filter(p => !spectators.has(p.id)).map(p => p.id);
  enterPlayScreen();
  if (room.isHost && participants.length < 2) {
    ui.toast('Za igro potrebuješ vsaj 2 igralca (TV ne šteje).', { icon: '⚠️' });
    await room.setStatus('lobby');
    showLobby();
    return;
  }
  if (mp.kind === 'duel') {
    if (room.isHost) {
      const st = {};
      for (const id of participants) st[id] = { outRound: null, progress: 0, ms: 0, totalMs: 0, steps: 0, best: 0 };
      mp.d = { gid: mp.gid, round: 0, st, away: {}, names: mp.names, limit: mp.settings.limit, over: false, winner: null };
      room.send('dstate', { gid: mp.gid, d: publicD() });
    }
    setStatus('Vsi dobite isto zaporedje. Zadnji preživeli zmaga!', 'watch');
    await ui.countdown(3, { go: 'START' });
    if (room?.isHost && mp?.kind === 'duel') hostDuel(1);
  } else {
    setStatus('Štafeta: ponovi zaporedje in dodaj svoj korak.', 'watch');
    if (room.isHost) {
      const order = hub.rng(mp.gid + ':order').shuffle(participants.slice());
      const state = {
        kind: 'relay', gid: mp.gid, settings: mp.settings, seq: [], authors: [], order, turn: 0, out: {}, falls: {}, best: {},
        n: mp.settings.n, turnNo: 0, over: false, winner: null, limit: mp.settings.limit, replay: mp.settings.replay,
        names: mp.names, stats: {},
      };
      await ui.countdown(3, { go: 'START' });
      try {
        const cur = await room.getState();
        await room.setState(state, { expectedVersion: cur.version });
      } catch (e) {
        console.warn('relay start:', e.message);
        const cur = await room.getState().catch(() => null);
        if (cur?.state?.gid === mp.gid) onRelayState(cur.state, cur.version);
      }
    }
  }
}

/* ---------------------------- izris igralcev ---------------------------- */

function renderPlayers() {
  if (!mp) return;
  const present = new Set(room?.players.map(p => p.id) || []);
  let ids = [], cls = () => '', mark = () => '';
  if (mp.kind === 'duel' && mp.d) {
    ids = Z.rankDuel(mp.d.st);
    ids.sort((a, b) => (mp.d.st[a].outRound == null ? 0 : 1) - (mp.d.st[b].outRound == null ? 0 : 1));
    cls = id => mp.d.st[id].outRound != null ? 'out' : mp.doneSet.has(id) ? 'done' : !present.has(id) ? 'away' : '';
    mark = id => mp.d.st[id].outRound != null ? '✕' : mp.doneSet.has(id) ? '✓' : '';
  } else if (mp.kind === 'relay' && mp.r) {
    ids = mp.r.order;
    const turnId = mp.r.over ? null : mp.r.order[mp.r.turn];
    cls = id => mp.r.out[id] ? 'out' : id === turnId ? 'turn' : !present.has(id) ? 'away' : '';
    mark = id => mp.r.out[id] ? '✕' : id === turnId ? '▶' : '';
  }
  $('#players').innerHTML = ids.map(id => `<div class="zp-pl ${cls(id)}" title="${esc(nameOf(id).nickname)}">
    ${ui.avatar(nameOf(id), 'sm')}<span class="zp-pl__name">${ui.name(nameOf(id))}</span>${mark(id) ? `<span class="zp-pl__st">${mark(id)}</span>` : ''}</div>`).join('');
}

function renderSide() {
  if (!mp) return;
  const present = new Set(room?.players.map(p => p.id) || []);
  const host = id => (room?.hostId === id ? ' <span class="mg-badge mg-badge--yellow">host</span>' : '');
  const gone = id => (present.has(id) ? '' : ' <span class="mg-badge">odsoten</span>');
  let rows = '';
  if (mp.kind === 'duel' && mp.d) {
    rows = Z.rankDuel(mp.d.st).map((id, i) => {
      const p = mp.d.st[id];
      const tag = p.outRound != null ? `<span class="zp-tag zp-tag--out">izpadel ${p.outRound}.</span>` : mp.doneSet.has(id) ? '<span class="zp-tag zp-tag--ok">✓ krog</span>' : '<span class="zp-tag">v igri</span>';
      return `<tr class="${p.outRound != null ? 'out' : ''} ${id === hub.userId ? 'mg-me' : ''}"><td class="mg-rank">${i + 1}.</td>
        <td>${ui.who(who(id))}${host(id)}${gone(id)}</td><td class="mg-num">${p.best || 0}</td><td>${tag}</td></tr>`;
    }).join('');
  } else if (mp.kind === 'relay' && mp.r) {
    const s = mp.r;
    const turnId = s.over ? null : s.order[s.turn];
    rows = s.order.map((id, i) => `<tr class="${s.out[id] ? 'out' : ''} ${id === hub.userId ? 'mg-me' : ''}"><td class="mg-rank">${i + 1}.</td>
        <td>${ui.who(who(id))}${host(id)}${gone(id)}</td><td class="mg-num">${s.best?.[id] || 0}</td>
        <td>${s.out[id] ? '<span class="zp-tag zp-tag--out">izpadel</span>' : id === turnId ? '<span class="zp-tag zp-tag--turn">na potezi</span>' : '<span class="zp-tag">čaka</span>'}</td></tr>`).join('');
  }
  $('#side').innerHTML = `<div class="mg-row mg-row--between"><h2 class="mg-title" style="margin:0">${mp.kind === 'relay' ? 'Štafeta' : 'Preživeli'}</h2>
      <span class="mg-badge">Soba ${esc(room?.code || '')}</span></div>
    <table class="mg-table"><thead><tr><th></th><th>Igralec</th><th class="mg-num" title="Najdaljše zaporedje">🎹</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    ${tv ? '' : `<p class="mg-small mg-muted" style="margin:8px 0 0">Tipke: ${mp.settings.n === 6 ? '1–6' : 'Q W A S ali 1–4'}</p>`}`;
}

/* ===================================================================== */
/*  SPOMINSKI DVOBOJ                                                     */
/* ===================================================================== */

/** Stanje od hosta (host, ki vodi igro, ima svojo verodostojno kopijo). */
function acceptD(d) {
  if (room?.isHost && hostRunning) return;
  mp.d = d;
}

function publicD() {
  return mp?.d ? JSON.parse(JSON.stringify(mp.d)) : null;
}
const hostStill = () => room && !room.left && room.isHost && mp?.kind === 'duel' && mp.d && !mp.d.over;
const aliveIds = d => Object.keys(d.st).filter(id => d.st[id].outRound == null);

async function hostDuel(from) {
  if (hostRunning) return;
  hostRunning = true;
  try {
    const myMp = mp;
    const D = mp.d;
    D.away = D.away || {};
    D.awayRound = D.awayRound || {};
    const stillHost = () => mp === myMp && hostStill();
    for (let r = from; r <= Z.MP_LEN; r++) {
      mp.d = D;
      if (!stillHost()) return;
      // počakaj, da je vsaj en živ igralec prisoten (največ 15 s)
      const t0 = Date.now();
      while (Date.now() - t0 < Z.RETURN_GRACE_MS) {
        const present = new Set(room.players.map(p => p.id));
        if (aliveIds(D).some(id => present.has(id))) break;
        await sleep(500);
        if (!stillHost()) return;
      }
      const roundKey = `${D.gid}:${r}:${hub.userId}:${Date.now() % 1e7}`;
      pending = { r, key: roundKey, results: {}, rejoined: new Set() };
      room.send('round', { gid: D.gid, r, key: roundKey });
      const limit = D.limit || 0;
      const inputBudget = limit ? r * limit + 3000 : r * 6000 + 15000;
      const deadline = Date.now() + LEAD + Z.playbackMs(r) + inputBudget + 2500;
      while (Date.now() < deadline) {
        await sleep(150);
        if (!stillHost()) return;
        const present = new Set(room.players.map(p => p.id));
        if (aliveIds(D).every(id => pending.results[id] || !present.has(id) || pending.rejoined.has(id))) break;
      }
      const now = Date.now();
      const present = new Set(room.players.map(p => p.id));
      const excused = [];
      for (const id of aliveIds(D)) {
        if (pending.results[id]) { delete D.away[id]; delete D.awayRound[id]; continue; }
        if (!present.has(id)) {
          if (D.away[id] == null) { D.away[id] = now; D.awayRound[id] = r; }
          if (now - D.away[id] <= Z.RETURN_GRACE_MS) excused.push(id);
        } else if (pending.rejoined.has(id)) excused.push(id);
      }
      const results = pending.results;
      const res = Z.applyDuelRound(D.st, r, results, excused, D.awayRound);
      D.st = res.st;
      D.round = r;
      for (const p of room.players) if (D.st[p.id]) D.names[p.id] = { nickname: p.nickname, avatar: p.avatar, equipped: p.equipped || {} };
      if (res.over) { D.over = true; D.winner = res.winner; }
      pending = null;
      room.send('roundEnd', { gid: D.gid, r, out: res.out, excused, d: publicD() });
      await sleep(2300);
      if (res.over) break;
    }
    if (!room || room.left || !room.isHost || mp !== myMp) return;
    mp.d = D;
    if (!mp.d.over) { mp.d.over = true; mp.d.winner = Z.rankDuel(mp.d.st)[0]; }
    const ranking = Z.rankDuel(mp.d.st);
    room.send('final', { gid: mp.d.gid, d: publicD(), ranking, awards: Z.awards(mp.d.st, ranking) });
    room.setStatus('finished');
  } finally {
    hostRunning = false;
  }
}

function onRes(p, from) {
  if (!mp || mp.kind !== 'duel') return;
  if (p.key === mp.curKey) { mp.doneSet.add(from); renderPlayers(); renderSide(); }
  if (room?.isHost && pending && p.key === pending.key && !pending.results[from]) {
    pending.results[from] = { ok: !!p.ok, progress: Math.max(0, p.progress | 0), ms: Math.max(0, p.ms | 0) };
  }
}

async function onRound({ gid, r, key: rk }) {
  if (!mp || mp.kind !== 'duel' || mp.gid !== gid) return;
  if (!mp.d) { room.send('needSync', {}); return; }
  if (mp.d.over || mp.curKey === rk) return;
  mp.curKey = rk;
  mp.doneSet = new Set();
  renderPlayers();
  renderSide();
  if (playVisible() === false) enterPlayScreen();
  const me = mp.d.st[hub.userId];
  const playing = !!me && me.outRound == null && !tv;
  const lights = showsPlayback();
  const res = await playRound({
    seq: mp.seq, len: r, limit: mp.d.limit, light: lights, sound: lights, input: playing,
    watchText: lights ? `Krog ${r} — poslušaj …` : '📺 Glej TV …',
  });
  if (!res || mp?.curKey !== rk) return;
  if (!playing) { setStatus(tv ? 'Igralci ponavljajo …' : 'Gledaš — igralci ponavljajo.', 'watch'); return; }
  mp.myRounds.push({ len: r, times: res.times, ok: res.ok, progress: res.progress, reason: res.reason, got: res.got, want: res.want });
  room?.send('res', { key: rk, round: r, ok: res.ok, progress: res.progress, ms: res.ms });
  if (res.ok) { feedbackOk(); say(Z.lineForRound(r)); setStatus('Pravilno! Čakam ostale …', 'go'); }
  else feedbackFail(res);
}

function onRoundEnd(p) {
  if (!mp || mp.kind !== 'duel' || p.gid !== mp.gid) return;
  acceptD(p.d);
  renderPlayers();
  renderSide();
  const names = p.out.filter(id => id !== hub.userId).map(id => nameOf(id).nickname);
  if (p.out.includes(hub.userId)) setStatus(p.d.over ? 'Konec igre' : 'Izpadel si — gledaš naprej.', 'watch');
  else if (names.length) setStatus(`Izpad: ${names.join(', ')}`, 'watch');
  else if (!inputCtx) setStatus(`Krog ${p.r} — vsi so preživeli!`, 'watch');
  if (names.length && !p.out.includes(hub.userId)) say(names.length === 1 ? `${names[0]} je izpadel!` : `Izpadli: ${names.length}`);
}

async function finalDuel({ gid, d, ranking, awards }) {
  if (!mp || mp.gid !== gid || mp.finalShown) return;
  mp.finalShown = true;
  mp.d = d;
  cancelRound();
  renderPlayers();
  renderSide();
  const winner = ranking[0];
  const me = d.st[hub.userId];
  const players = Object.keys(d.st).length;
  let xp = 0;
  if (me) {
    const win = winner === hub.userId;
    const len = me.best || 0;
    const steps = mp.myRounds.reduce((s, r) => s + (r.ok ? r.len : r.progress || 0), 0);
    ({ granted: xp } = await hub.awardXp(Z.xpFor({ len, mpWin: win }), 'zaporedje: dvoboj'));
    hub.reportGame({ won: win, players, score: len })
      .then(() => hub.reportEvent('zaporedje:len', len))
      .then(() => hub.reportEvent('zaporedje:steps', 1, { times: steps }))
      .then(() => win && hub.reportEvent('zaporedje:mp-win'));
    await unlockMany(Z.lengthAchievements(len));
    if (win && players >= 4) await unlock('dvoboj');
    if (mp.myRounds.some(Z.isLightning)) await unlock('strela');
    if (win) { setTimeout(() => A.fanfare(), 300); }
  }
  setStatus(winner === hub.userId ? 'ZMAGA! Zadnji spomin v sobi.' : `Zmagal je ${nameOf(winner).nickname}`, 'go');
  const list = ranking.map(id => ({
    ...who(id), scoreText: `${fmtLen(d.st[id].best || 0)}${d.st[id].outRound == null ? ' · preživel' : ''}`, xp: id === hub.userId ? xp : 0,
  }));
  showMpResults(list, awards, 'Rezultati dvoboja', mySummaryHtml(mp.myRounds));
}

function mySummaryHtml(rounds) {
  if (!rounds.length) return '';
  const sum = Z.summary(rounds);
  const last = rounds[rounds.length - 1];
  const miss = last && !last.ok ? (last.reason === 'timeout' ? '⏱️ čas' : tileHtml(last.want, true)) : '—';
  return `<div class="zp-sum">
    <div><span class="mg-small mg-muted">Tvoje zaporedje</span><b>${fmtLen(sum.len)}</b></div>
    <div><span class="mg-small mg-muted">Povprečje na korak</span><b>${sum.avgMs != null ? sum.avgMs + ' ms' : '—'}</b></div>
    <div><span class="mg-small mg-muted">Najhitrejši krog</span><b>${sum.fastest ? `${sum.fastest.round}. (${sum.fastest.avgMs} ms)` : '—'}</b></div>
    <div><span class="mg-small mg-muted">Zmotil si se pri</span><b>${miss}</b></div></div>`;
}

function awardsHtml(awards) {
  if (!awards?.length) return '';
  return `<div class="zp-awards">${awards.map(a => `<div class="zp-award"><span>${a.icon}</span>
    <div><b>${esc(a.title)}</b><span class="mg-small mg-muted">${esc(a.desc)}</span></div><span class="mg-spacer"></span>${ui.who(who(a.id))}</div>`).join('')}</div>`;
}

async function showMpResults(list, awards, title, extra) {
  renderEndbar();
  const gid = mp?.gid;
  const v = await ui.results(list, {
    title, again: room?.isHost ? 'Revanša' : 'Zapri',
    extraHtml: awardsHtml(awards) + extra,
  });
  if (!room || room.left || mp?.gid !== gid) return;
  if (v === 'again' && room.isHost) rematch();
}

function rematch() {
  if (!room?.isHost) return;
  room.start({ ...(mp?.settings || DEFAULT_SETTINGS), seed: newSeed() });
}

function renderEndbar() {
  const el = $('#endbar');
  el.classList.remove('mg-hidden');
  el.innerHTML = room?.isHost
    ? `<button class="mg-btn mg-btn--primary" id="btnRematch">Revanša</button><button class="mg-btn mg-btn--ghost" id="btnToLobby">V lobby (nastavitve)</button>`
    : '<span class="mg-muted mg-small">Čakam, da host začne revanšo …</span>';
  el.querySelector('#btnRematch')?.addEventListener('click', rematch);
  el.querySelector('#btnToLobby')?.addEventListener('click', async () => { await room.setStatus('lobby'); showLobby(); });
}

/* ===================================================================== */
/*  ŠTAFETA                                                              */
/* ===================================================================== */

let relayWatch = null;
const relayAway = {};

function onRelayState(s, version) {
  if (!s || s.kind !== 'relay' || !room) return;
  if (!mp || mp.gid !== s.gid) {
    if (room.status !== 'playing') return;
    initMp(s.settings || room.settings, s.gid);
    enterPlayScreen();
  }
  if (version <= mp.rv) return;
  mp.r = s;
  mp.rv = version;
  if (s.names) Object.assign(mp.names, s.names);
  renderPlayers();
  renderSide();
  if (s.over) { finalRelay(s); return; }
  if (mp.turnSeen === s.turnNo) return;
  mp.turnSeen = s.turnNo;
  mp.turnSeenAt = Date.now();
  relayTurn(s, version);
}

function onRelayTap(p, from) {
  if (!mp || mp.kind !== 'relay' || !mp.r || from === hub.userId) return;
  if (p.gid !== mp.gid || p.turnNo !== mp.r.turnNo) return;
  const lights = showsPlayback();
  board.flash(p.tile, 220, { light: true, sound: lights });
  if (p.add) say(`${nameOf(from).nickname} doda ${Z.TILES[p.tile].sym}`);
}

async function relayTurn(s, version) {
  const id = s.order[s.turn];
  const mine = id === hub.userId && !tv;
  const nick = nameOf(id).nickname;
  cancelRound();
  const token = roundToken = { cancelled: false };
  setCount(s.seq.length);
  setBars(0, 0);
  setStatus(mine ? 'Tvoja poteza!' : `Na potezi: ${nick}`, mine ? 'go' : 'watch');
  if (mine) { vibrate([40, 40, 40]); say('Tvoja poteza!'); }
  await sleep(1000);
  if (token.cancelled) return;
  const lights = showsPlayback();
  if (s.replay && s.seq.length) {
    setStatus(mine ? 'Poslušaj …' : `Zaporedje za ${nick} …`, 'watch');
    const ok = await board.play(s.seq, Z.tempoMs(s.seq.length), { light: lights, sound: lights, token });
    if (!ok || token.cancelled) return;
  }
  if (!mine) { setStatus(`${nick} ponavlja …`, 'watch'); return; }
  const tap = (tile, add = false) => room?.send('tap', { gid: s.gid, turnNo: s.turnNo, tile, add });
  let res = { ok: true, progress: 0, ms: 0, times: [] };
  if (s.seq.length) {
    res = await collectInput(s.seq, s.limit, token, { onTap: t => tap(t), text: `Ponovi ${fmtLen(s.seq.length)}!` });
    if (!res) return;
    if (!res.ok) {
      feedbackFail(res);
      await submitRelay(s, version, { ok: false, failAt: res.progress, reason: res.reason }, res);
      return;
    }
    feedbackOk();
    await sleep(350);
    if (token.cancelled) return;
  }
  say('Dodaj svoj korak!', 'gold');
  const add = await collectAdd(s, token, t => tap(t, true));
  if (!add) return;
  if (add.timeout) {
    feedbackFail({ reason: 'timeout', got: null, want: null });
    await submitRelay(s, version, { ok: false, failAt: s.seq.length, reason: 'timeout' }, res);
    return;
  }
  setCount(s.seq.length + 1);
  setStatus('Korak dodan! Naslednji na vrsti …', 'watch');
  await submitRelay(s, version, { ok: true, added: add.tile }, res);
}

/** Dodajanje koraka (pravilo: največ 3 enaki zapored). */
function collectAdd(s, token, onTap) {
  return new Promise(resolve => {
    let last = performance.now();
    board.lock(false);
    setStatus('Dodaj svoj korak!', 'go');
    setBars(0, s.limit ? 1 : 0);
    const ctx = {
      press(id) {
        if (!Z.canAppend(s.seq, id)) {
          ui.toast('Največ 3 enaki koraki zapored — izberi drugo ploščico.', { icon: '✋' });
          board.wrong(id);
          last = performance.now();
          return;
        }
        onTap(id);
        ctx.finish({ tile: id });
      },
      finish(res) {
        if (inputCtx !== ctx) return;
        inputCtx = null;
        clearInterval(iv);
        board.lock(true);
        resolve(token.cancelled ? null : res);
      },
    };
    inputCtx = ctx;
    const limit = s.limit;
    const iv = setInterval(() => {
      if (token.cancelled) { ctx.finish(null); return; }
      if (!limit) return;
      const el = performance.now() - last;
      $('#barTime').style.width = `${Math.max(0, 1 - el / limit) * 100}%`;
      if (Z.isTimedOut(el, limit)) ctx.finish({ timeout: true });
    }, 50);
  });
}

/** Zapiši potezo in novo stanje (optimistično zaklepanje). */
async function submitRelay(s, version, mv, res, by = hub.userId) {
  const move = { ...mv, by };
  try { await room.pushMove({ gid: s.gid, turnNo: s.turnNo, ...move }); } catch (e) { console.warn('pushMove:', e.message); }
  for (let i = 0; i < 4; i++) {
    const next = Z.applyRelayMove(s, move);
    if (next === s) return;
    const prev = s.stats?.[by] || { ms: 0, steps: 0 };
    next.stats = { ...(s.stats || {}), [by]: { ms: prev.ms + (res?.ms || 0), steps: prev.steps + (res?.progress || 0) } };
    next.names = { ...(s.names || {}), ...mp.names };
    try {
      await room.setState(next, { expectedVersion: version });
      return;
    } catch (e) {
      if (e.code !== 'version_conflict') { console.warn('setState:', e.message); ui.toast('Poteze ni bilo mogoče shraniti.', { icon: '⚠️' }); return; }
      const cur = await room.getState();
      if (!cur.state || cur.state.gid !== s.gid || cur.state.turnNo !== s.turnNo) return;
      s = cur.state;
      version = cur.version;
    }
  }
}

/** Host: igralec na potezi je odšel ali obtičal → izpade. */
function relayWatchdog() {
  if (!room || room.left || !room.isHost || !mp || mp.kind !== 'relay' || !mp.r || mp.r.over) return;
  const s = mp.r;
  const id = s.order[s.turn];
  const now = Date.now();
  const present = room.players.some(p => p.id === id);
  if (present) delete relayAway[id];
  else if (relayAway[id] == null) relayAway[id] = now;
  const gone = !present && now - relayAway[id] > Z.RETURN_GRACE_MS;
  const per = s.limit || 20000;
  const budget = 4000 + (s.replay ? Z.playbackMs(s.seq.length) : 0) + (s.seq.length + 1) * per + 15000;
  const stuck = now - (mp.turnSeenAt || now) > budget;
  if (!gone && !stuck) return;
  if (mp.forcing === s.turnNo) return;
  mp.forcing = s.turnNo;
  ui.toast(`${nameOf(id).nickname} ${gone ? 'je odšel' : 'ni končal poteze'} — izpade.`, { icon: '⏱️' });
  submitRelay(s, mp.rv, { ok: false, failAt: s.seq.length, reason: gone ? 'left' : 'timeout' }, null, id);
}

async function finalRelay(s) {
  if (mp.finalShown) return;
  mp.finalShown = true;
  cancelRound();
  const ranking = Z.rankRelay(s);
  const st = {};
  for (const id of s.order) {
    st[id] = { best: s.best?.[id] || 0, totalMs: s.stats?.[id]?.ms || 0, steps: s.stats?.[id]?.steps || 0, outRound: s.out[id] ? s.out[id].turnNo : null };
  }
  const aw = Z.awards(st, ranking);
  const comp = Z.composer(s);
  if (comp) aw.push({ key: 'skladatelj', icon: '✍️', title: 'Skladatelj', desc: `dodal ${comp.step + 1}. korak (${Z.TILES[s.seq[comp.step]]?.sym || ''}), na katerem je padlo ${comp.falls}`, id: comp.id });
  const winner = ranking[0];
  let xp = 0;
  if (s.order.includes(hub.userId)) {
    const win = winner === hub.userId;
    const len = s.best?.[hub.userId] || 0;
    const steps = s.stats?.[hub.userId]?.steps || 0;
    ({ granted: xp } = await hub.awardXp(Z.xpFor({ len, mpWin: win }), 'zaporedje: štafeta'));
    hub.reportGame({ won: win, players: s.order.length, score: len })
      .then(() => hub.reportEvent('zaporedje:len', len))
      .then(() => hub.reportEvent('zaporedje:steps', 1, { times: steps }));
    await unlockMany(Z.lengthAchievements(len));
    const mineFalls = Object.entries(s.falls || {}).some(([k, c]) => s.authors[+k] === hub.userId && c >= 2);
    if (mineFalls) await unlock('skladatelj');
    if (win) setTimeout(() => A.fanfare(), 300);
  }
  setStatus(winner === hub.userId ? 'ZMAGA v štafeti!' : `Zmagal je ${nameOf(winner).nickname}`, 'go');
  setCount(s.seq.length);
  const list = ranking.map(id => ({ ...who(id), scoreText: `${fmtLen(s.best?.[id] || 0)}${s.out[id] ? '' : ' · zadnji'}`, xp: id === hub.userId ? xp : 0 }));
  showMpResults(list, aw, 'Rezultati štafete', `<p class="mg-center mg-muted mg-small">Skupno zaporedje: ${fmtLen(s.seq.length)}</p>`);
}

/* ===================================================================== */
/*  Zagon                                                                */
/* ===================================================================== */

function onKey(e) {
  if (!playVisible() || document.querySelector('.mg-modal-back') || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('input, select, textarea')) return;
  const pos = Z.keyToPos(e.code, board.layout.length);
  if (pos < 0) return;
  e.preventDefault();
  A.unlockAudio();
  board.pressPos(pos);
}

function renderMute() {
  $('#btnMute').textContent = A.isMuted() ? '🔇' : '🔊';
  $('#btnMute').setAttribute('aria-label', A.isMuted() ? 'Vklopi zvok' : 'Utišaj zvok');
}

async function main() {
  await hub.init({ gameId: GAME, scoreOrder: 'desc' });
  await startCloud(hub);   // napredek online (rekord, dnevni izzivi)
  ui.header({ title: 'Zaporedje' });
  document.body.classList.toggle('zp-tv', tv);
  $('#soloLimit').value = String(S.load(key('limit'), Z.DEFAULT_LIMIT));
  $('#secondChance').checked = !!S.load(key('second'), false);
  $('#btnClassic').addEventListener('click', () => playSolo('classic'));
  $('#btnDaily').addEventListener('click', () => playSolo('daily'));
  $('#btnCreate').addEventListener('click', createRoom);
  $('#joinCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
  $('#joinForm').addEventListener('submit', e => { e.preventDefault(); joinRoom($('#joinCode').value); });
  $('#btnMute').addEventListener('click', () => { A.setMuted(!A.isMuted()); renderMute(); });
  renderMute();
  $('#btnQuit').addEventListener('click', async () => {
    if (!(await ui.confirm(room ? 'Zapustiš sobo?' : 'Prekineš igro? Rezultat ne bo shranjen.', { yes: room ? 'Zapusti' : 'Prekini', danger: true }))) return;
    if (solo) solo.cancelled = true;
    solo = null;
    cancelRound();
    if (room) { await room.leave(); room = null; mp = null; }
    showMenu();
  });
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', () => A.unlockAudio(), { passive: true });
  const code = hub.roomFromUrl();
  if (code) joinRoom(code); else showMenu();
}

main();
