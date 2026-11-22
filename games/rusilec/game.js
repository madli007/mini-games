/* =====================================================================
   RUŠILEC — game.js: meni, lobby, stanja igre (odštevanje, runda, med
   rundami, konec), host-authoritative mreža, HUD, zvok, nagrade.

   Host simulira vse (match.js, 120 Hz) in pošilja:
     'snap' 15×/s (posnetek + novi dogodki z zaporedno številko),
     'full' 1×/s (polno stanje za prenos hosta in ponovno povezavo).
   Klienti pošiljajo 'in' (vhod), 'hello' (skin, TV, odklenjene arene), 'resync'.
   Tuje krogle se interpolirajo, svoja se napoveduje lokalno (net.js).
   ===================================================================== */
import { hub, ui } from '../../shared/hub.js';
import * as S from '../../shared/storage.js';
import { STEP, makeBody, advanceWorld, stepBody } from '../krogla/physics.js';
import { DEFAULT_SKIN, QUALITY, QUALITY_ORDER, detectQuality } from '../krogla/render.js';
import { Input } from '../krogla/input.js';
import { lockKey } from '../krogla/secrets.js';
import { loadArenas, arenaWorld } from './arena.js';
import * as MT from './match.js';
import { botInput, botName, BOT_LEVELS } from './bots.js';
import { NET, encodeSnap, decodeSnap, encodeInput, decodeInput, HostClock, Interp, correct, EventLog, EventSink } from './net.js';
import { dash, tickDash } from './collide.js';
import { feedText } from './texts.js';
import { ArenaRenderer } from './view.js';
import { ArenaAudio } from './sound.js';

const GAME = 'rusilec';
const $ = s => document.querySelector(s);
const esc = s => ui.esc(String(s ?? ''));
const QS = new URLSearchParams(location.search);
const DEV = QS.has('dev');
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** Dosežki igre. */
const ACH = [
  { key: 'prvi-izriv', title: 'Prvi izriv', icon: '💥', desc: 'Izrini nasprotnika' },
  { key: 'zmaga', title: 'Rušilec', icon: '🏆', desc: 'Zmagaj igro z vsaj 3 ljudmi' },
  { key: 'hat-trick', title: 'Hat-trick', icon: '🎩', desc: '3 izrivi v 10 s' },
  { key: 'nedotakljiv', title: 'Nedotakljiv', icon: '🛡️', desc: 'Zmagaj rundo brez padca' },
  { key: 'biljard', title: 'Biljard', icon: '🎱', desc: 'Izriv z odbojem prek druge krogle' },
  { key: 'mascevanje', title: 'Maščevanje', icon: '😤', desc: 'Izrini tistega, ki je izrinil tebe' },
  { key: 'vse-arene', title: 'Popotnik', icon: '🗺️', desc: 'Igraj na vsaki areni' },
  { key: 'kljucavnica', title: 'Ključar', icon: '🗝️', desc: 'Odkleni skrivno areno (Hrčkova krogla)' },
  { key: 'osem', title: 'Polna arena', icon: '🎉', desc: 'Odigraj igro z 8 ljudmi' },
  { key: 'zadnji-trenutek', title: 'Zadnji trenutek', icon: '⏱️', desc: 'Izriv v zadnjih 3 s runde' },
];

/* ===================================================================== */
/*  Stanje                                                               */
/* ===================================================================== */

let ARENAS = [];
let ME = null;
let room = null;
let isTV = false;
let lobbyView = null;
let lastSettings = null;
let renderer = null, input = null, engineFailed = false;
const audio = new ArenaAudio();
const settings = Object.assign({ sfx: true, music: true, quality: 'auto', fps: false }, S.load('rusilec:settings', {}));
const saveSettings = () => S.save('rusilec:settings', settings);
const mySkin = sanitizeSkin(Object.assign({}, DEFAULT_SKIN, S.load('krogla:skin', {})));
let myUnlocked = [];
let myAch = new Set();
/** id → { sk, tv, un } (iz sporočil 'hello'). */
const peers = new Map();
/** Lokalni »room« za vadbo (brez sobe): sporočila gredo le sebi. */
const handlers = new Map();
let dashCount = 0;
let sess = null;       // trenutna igra (glej newSession)
let overShown = null;

/* ------------------------------------------------------------ mreža (soba ali lokalno) */

const net = {
  send(type, payload) {
    if (room && !room.left) { room.send(type, payload); return; }
    // vadba: le sebi (kot room.send, ki pošlje tudi sebi)
    queueMicrotask(() => (handlers.get(type) || []).forEach(f => f(payload, ME)));
  },
};
function onMsg(type, fn) {
  if (!handlers.has(type)) handlers.set(type, []);
  handlers.get(type).push(fn);
}
const isHost = () => !room || room.isHost;

/* ------------------------------------------------------------ skin */

function sanitizeSkin(s) {
  const col = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null;
  const o = { ...DEFAULT_SKIN };
  if (!s || typeof s !== 'object') return o;
  for (const k of ['glass', 'rim', 'fur', 'tint']) if (col(s[k])) o[k] = s[k];
  if (typeof s.opacity === 'number') o.opacity = Math.max(0.1, Math.min(0.6, s.opacity));
  if (typeof s.roughness === 'number') o.roughness = Math.max(0, Math.min(0.3, s.roughness));
  if (['none', 'stripes', 'dots', 'stars', 'hex'].includes(s.pattern)) o.pattern = s.pattern;
  if (s.rider === 'hamster' || (typeof s.rider === 'string' && [...s.rider].length <= 2)) o.rider = s.rider;
  o.trail = null;
  return o;
}
/** Skin igralca: oprema (ko bo trgovina prodajala krogle: equipped.ball), sicer skin iz Hrčkove krogle, sicer privzeta. */
function skinFor(r) {
  if (r.bot) return DEFAULT_SKIN;
  if (r.id === ME) return mySkin;
  const p = peers.get(r.id);
  return p?.sk ? sanitizeSkin(p.sk) : DEFAULT_SKIN;
}

/* ===================================================================== */
/*  Zagon                                                                */
/* ===================================================================== */

async function main() {
  isTV = QS.get('tv') === '1';
  await hub.init({ gameId: GAME });
  ME = hub.userId;
  ui.header({ title: 'Rušilec' });
  try { ARENAS = await loadArenas(new URL('arenas/', import.meta.url)); }
  catch (e) { console.warn(e); $('#menu').innerHTML = '<div class="mg-empty">Aren ni bilo mogoče naložiti.</div>'; return; }
  await refreshUnlocks();
  wireNet();
  addEventListener('pointerdown', () => audio.unlock(), { passive: true });
  addEventListener('keydown', () => audio.unlock(), { passive: true });
  audio.setSfx(settings.sfx); audio.setMusic(settings.music);
  const code = hub.roomFromUrl();
  if (code) joinRoom(code); else showMenu();
  requestAnimationFrame(frame);
}

/** Odklenjene skrivne arene (dosežki Hrčkove krogle krogla:kljucavnica-<arena>). */
async function refreshUnlocks() {
  try {
    const kr = await hub.getAchievements({ game: 'krogla' });
    const keys = new Set(kr.map(a => a.key));
    myUnlocked = ARENAS.filter(A => A.secret && keys.has(lockKey(A.id))).map(A => A.id);
    myAch = new Set((await hub.getAchievements()).map(a => a.key));
    if (myUnlocked.length) unlock('kljucavnica');
  } catch (e) { console.warn(e); }
}

async function unlock(key) {
  if (myAch.has(key)) return;
  const a = ACH.find(x => x.key === key);
  if (!a) return;
  myAch.add(key);
  await hub.unlock(key, { title: a.title, icon: a.icon });
}

/* ===================================================================== */
/*  Meni                                                                 */
/* ===================================================================== */

function show(id) {
  for (const s of ['menu', 'lobby', 'play']) $('#' + s).classList.toggle('mg-hidden', s !== id);
  document.body.classList.toggle('ru-playing', id === 'play');
  document.body.classList.toggle('ru-tv', id === 'play' && (isTV || !inRoster()));
}

function showMenu() {
  stopSession();
  show('menu');
  const open = ARENAS.filter(A => !A.secret), secret = ARENAS.filter(A => A.secret);
  $('#menu').innerHTML = `
    <section class="mg-card mg-card--glow mg-stack">
      <div class="ru-hero"><div class="ru-hero__icon" aria-hidden="true">💥</div>
        <div><h1 class="mg-title" style="margin:0">Rušilec</h1>
        <p class="mg-muted">Hrčki v kroglah v areni nad prepadom. Izrini prijatelje čez rob, preden poteče čas. 2–8 igralcev — vsak na svojem telefonu, host na TV-ju.</p></div></div>
      <div class="mg-row" style="flex-wrap:wrap;gap:8px">
        <button class="mg-btn mg-btn--primary mg-btn--big" id="btnCreate" type="button">Ustvari sobo</button>
        <form class="ru-join" id="joinForm"><input class="mg-input mg-input--code" id="joinCode" maxlength="4" placeholder="KODA" aria-label="Koda sobe" autocomplete="off">
          <button class="mg-btn mg-btn--cyan" type="submit">Pridruži se</button></form>
        <span class="mg-spacer"></span>
        <button class="mg-btn mg-btn--ghost" id="btnPractice" type="button">🤖 Vadba z boti</button>
      </div>
      <p class="mg-small mg-muted">Za party: odpri sobo na TV-ju ali prenosniku in v lobbyju izberi <b>📺 Samo zaslon (TV)</b>, ostali se pridružijo s telefoni prek QR kode.
        Vadba z boti ne šteje za zmage. <a href="${esc(hub.link('games/krogla/'))}">🐹 Hrčkova krogla (singleplayer)</a></p>
    </section>
    <section class="mg-card mg-stack">
      <h2 class="mg-title" style="margin:0">Arene</h2>
      <div class="ru-arenas">${[...open, ...secret].map(A => {
        const lock = A.secret && !myUnlocked.includes(A.id);
        return `<div class="ru-arena ${lock ? 'locked' : ''}"><b>${A.secret ? (lock ? '🔒 ' : '🗝️ ') : ''}${esc(A.name)}</b><small>${esc(lock ? A.hint : A.desc)}</small></div>`;
      }).join('')}</div>
      <p class="mg-small mg-muted">Skrivne arene se odklenejo s skritimi ključavnicami na progah Hrčkove krogle (zavij s poti!). V sobi so na voljo, če jih je odklenil vsaj en igralec.</p>
    </section>
    <section class="mg-card mg-stack">
      <h2 class="mg-title" style="margin:0">Kako se igra</h2>
      <dl class="ru-keys">
        <dt>Premik</dt><dd>puščice / WASD · miška (krogla gre proti kazalcu) · palica na telefonu</dd>
        <dt>Sunek</dt><dd>preslednica · klik ali desni klik · gumb SUNEK (vsake ~3 s; med sunkom si težji)</dd>
        <dt>Točke</dt><dd>izriv = +1 tistemu, ki se te je zadnji dotaknil v 4 s · sam čez rob = −1 (nastavljivo)</dd>
        <dt>Finale</dt><dd>zadnjih 30 s se rob arene kruši · izenačenje → nagla smrt</dd>
        <dt>Pobiralke</dt><dd>🏋️ Utež · 🛡️ Odbijač · ❄️ Zmrzal · 🧲 Magnet</dd>
      </dl>
    </section>
    <section class="mg-card mg-stack">
      <h2 class="mg-title" style="margin:0">Dosežki</h2>
      <div class="ru-ach">${ACH.map(a => `<div class="${myAch.has(a.key) ? '' : 'locked'}" title="${esc(a.desc)}">${a.icon} <b>${esc(a.title)}</b><br><span class="mg-muted">${esc(a.desc)}</span></div>`).join('')}</div>
    </section>`;
  $('#btnCreate').onclick = createRoom;
  $('#joinCode').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); };
  $('#joinForm').onsubmit = e => { e.preventDefault(); joinRoom($('#joinCode').value); };
  $('#btnPractice').onclick = practiceModal;
}

/* ------------------------------------------------------------ vadba */

async function practiceModal() {
  audio.unlock();
  const saved = S.load('rusilec:practice', { bots: 3, botLevel: 2, arena: 'random', roundSec: 120, mode: 'ffa' });
  const v = await ui.modal({
    title: '🤖 Vadba z boti',
    html: `<div class="ru-form" id="pf">
      <label>Boti<select class="mg-select" name="bots">${[1, 2, 3, 4, 5, 6, 7].map(n => `<option ${n === saved.bots ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Težavnost<select class="mg-select" name="botLevel">${Object.entries(BOT_LEVELS).map(([k, n]) => `<option value="${k}" ${+k === saved.botLevel ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Način<select class="mg-select" name="mode">${Object.entries(MT.MODES).map(([k, n]) => `<option value="${k}" ${k === saved.mode ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Runda<select class="mg-select" name="roundSec">${[60, 120, 180].map(s => `<option value="${s}" ${s === saved.roundSec ? 'selected' : ''}>${s / 60} min</option>`).join('')}</select></label>
      <label style="grid-column:1/-1">Arena<select class="mg-select" name="arena">${arenaOptions(saved.arena, myUnlocked)}</select></label>
      </div><p class="mg-small mg-muted">Vadba: 10 XP, brez zmag in brez kovancev za zmago.</p>`,
    actions: [{ label: 'Prekliči', value: false }, { label: 'Začni', value: true, kind: 'primary' }],
  });
  if (!v) return;
  // modal je že zaprt: vrednosti so prebrane ob vsaki spremembi obrazca
  const cfg = { ...saved, ...(lastPracticeForm || {}) };
  lastPracticeForm = null;
  S.save('rusilec:practice', cfg);
  startPractice(cfg);
}
let lastPracticeForm = null;
document.addEventListener('change', e => {
  const form = e.target.closest?.('#pf');
  if (!form) return;
  const get = n => form.querySelector(`[name=${n}]`).value;
  lastPracticeForm = { bots: +get('bots'), botLevel: +get('botLevel'), mode: get('mode'), roundSec: +get('roundSec'), arena: get('arena') };
});

function startPractice(p) {
  room = null;
  const cfg = { ...MT.DEFAULT_CFG, mode: p.mode, roundSec: p.roundSec, rounds: 1, arena: p.arena, bots: p.bots, botLevel: p.botLevel };
  lastSettings = cfg;
  hostStartGame(cfg, [{ id: ME, nickname: hub.profile?.nickname || 'Jaz', avatar: hub.profile?.avatar, equipped: hub.profile?.equipped || {} }], { practice: true });
}

function arenaOptions(sel, unlocked) {
  return `<option value="random" ${sel === 'random' ? 'selected' : ''}>🎲 Naključno (vsako rundo druga)</option>` +
    ARENAS.map(A => {
      const ok = !A.secret || unlocked.includes(A.id);
      return `<option value="${esc(A.id)}" ${ok ? '' : 'disabled'} ${sel === A.id && ok ? 'selected' : ''}>${A.secret ? (ok ? '🗝️ ' : '🔒 ') : ''}${esc(A.name)}${ok ? '' : ' — ' + esc(A.hint)}</option>`;
    }).join('');
}

/* ===================================================================== */
/*  Soba in lobby                                                        */
/* ===================================================================== */

async function createRoom() {
  audio.unlock();
  try {
    const r = await hub.createRoom({ maxPlayers: 10, settings: { ...MT.DEFAULT_CFG }, isPublic: true });
    enterRoom(r);
  } catch (e) { ui.toast(e.message, { icon: '⚠️' }); }
}

async function joinRoom(code) {
  audio.unlock();
  try {
    const r = await hub.joinRoom(code);
    enterRoom(r);
  } catch (e) {
    if (e.code === 'wrong_game') {
      const games = await hub.games();
      const g = games.find(x => x.id === e.game);
      if (g) { const l = hub.link(g.path); location.href = l + (l.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(code); return; }
    }
    const msg = { room_full: 'Soba je polna.', room_started: 'Igra v tej sobi se je že začela.', room_not_found: 'Soba s to kodo ne obstaja.' }[e.code] || e.message;
    await ui.modal({ title: 'Ne gre', html: `<p>${esc(msg)}</p>` });
    try { const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u); } catch { /* */ }
    showMenu();
  }
}

function hello(req = 0) {
  net.send('hello', { sk: mySkin, tv: isTV ? 1 : 0, un: myUnlocked, req });
}

function enterRoom(r) {
  room = r;
  attachRoom(r);
  wireRoom(r);
  hello(1);
  showLobby();
}

/** Odklenjene arene v sobi (vsaj en prisoten igralec). */
function roomUnlocked() {
  const ids = new Set(room ? room.players.map(p => p.id) : [ME]);
  const out = new Set(myUnlocked);
  for (const [id, p] of peers) if (ids.has(id)) for (const a of p.un || []) out.add(a);
  return [...out];
}

let settingsEl = null;
function showLobby() {
  if (sess && sess.phase !== 'over') return;
  show('lobby');
  lobbyView?.destroy();
  settingsEl = null;
  lobbyView = ui.lobby($('#lobbyMain'), room, {
    minPlayers: 1, title: 'Rušilec — lobby',
    onLeave: () => { room = null; showMenu(); },
    settingsForm: el => { settingsEl = el; renderSettings(el); return readSettings; },
  });
  renderLobbySide();
}

function renderSettings(el) {
  const s = { ...MT.DEFAULT_CFG, ...(lastSettings || room?.settings || {}) };
  const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
  el.innerHTML = `<div class="ru-form" id="rf">
    <h3>Igra</h3>
    <label>Način<select class="mg-select" name="mode">${Object.entries(MT.MODES).map(([k, n]) => opt(k, s.mode, n)).join('')}</select></label>
    <label>Dolžina runde<select class="mg-select" name="roundSec">${[...(DEV ? [30] : []), 120, 180, 300].map(v => opt(v, s.roundSec, v / 60 + ' min')).join('')}</select></label>
    <label>Rund v igri<select class="mg-select" name="rounds">${[1, 3, 5].map(v => opt(v, s.rounds, v)).join('')}</select></label>
    <label>Arena<select class="mg-select" name="arena">${arenaOptions(s.arena, roomUnlocked())}</select></label>
    <h3>Pravila</h3>
    <label class="mg-check"><input type="checkbox" name="dash" ${s.dash ? 'checked' : ''}> Sunek (izklop = klasično)</label>
    <label>Samomor<select class="mg-select" name="suicide">${opt(-1, s.suicide, '−1 točka')}${opt(0, s.suicide, '0 točk')}</select></label>
    <label class="mg-check"><input type="checkbox" name="gold" ${s.gold ? 'checked' : ''}> 👑 Zlati hrček (vodilni = 2 točki)</label>
    <label class="mg-check"><input type="checkbox" name="pickups" ${s.pickups ? 'checked' : ''}> 🎁 Pobiralke</label>
    <label class="mg-check"><input type="checkbox" name="ghosts" ${s.ghosts ? 'checked' : ''}> 👻 Duhovi (Zadnji na plošči)</label>
    <h3>Boti</h3>
    <label>Število botov<select class="mg-select" name="bots">${[0, 1, 2, 3, 4, 5, 6, 7].map(v => opt(v, s.bots, v)).join('')}</select></label>
    <label>Težavnost<select class="mg-select" name="botLevel">${Object.entries(BOT_LEVELS).map(([k, n]) => opt(k, s.botLevel, n)).join('')}</select></label>
  </div>`;
}

function readSettings() {
  const el = settingsEl?.querySelector('#rf');
  if (!el) return lastSettings || room?.settings || { ...MT.DEFAULT_CFG };
  const v = n => el.querySelector(`[name=${n}]`);
  const s = {
    mode: v('mode').value, roundSec: +v('roundSec').value, rounds: +v('rounds').value, arena: v('arena').value,
    dash: v('dash').checked, suicide: +v('suicide').value, gold: v('gold').checked, pickups: v('pickups').checked, ghosts: v('ghosts').checked,
    bots: +v('bots').value, botLevel: +v('botLevel').value,
  };
  lastSettings = s;
  return s;
}

function renderLobbySide() {
  const el = $('#lobbySide');
  if (!el || !room) return;
  const un = roomUnlocked();
  const tv = [...peers.entries()].filter(([id, p]) => p.tv && room.players.some(x => x.id === id)).length + (isTV && !peers.has(ME) ? 1 : 0);
  el.innerHTML = `<section class="mg-card mg-stack">
      <h2 class="mg-title" style="margin:0">Ta naprava</h2>
      <p class="mg-small mg-muted">${isTV ? '<b>📺 Samo zaslon (TV)</b>: ta naprava je opazovalec brez lastne krogle — pokaže celo areno, lestvico in killfeed.' : 'Igraš s svojo kroglo. Na TV-ju ali prenosniku izberi »Samo zaslon«.'}</p>
      <button class="mg-btn mg-btn--ghost ru-tvbtn ${isTV ? 'on' : ''}" id="btnTv" type="button">${isTV ? '📱 Igram tudi jaz' : '📺 Samo zaslon (TV)'}</button>
      ${tv ? `<p class="mg-small mg-muted">Zasloni (TV) v sobi: ${tv}</p>` : ''}
    </section>
    <section class="mg-card mg-stack">
      <h2 class="mg-title" style="margin:0">Skrivne arene</h2>
      ${ARENAS.filter(A => A.secret).map(A => `<div class="mg-small">${un.includes(A.id) ? '🗝️ <b>' + esc(A.name) + '</b> — odklenjena' : '🔒 <b>' + esc(A.name) + '</b> — ' + esc(A.hint)}</div>`).join('')}
    </section>
    <section class="mg-card mg-stack mg-small">
      <b>Kontrole</b><span class="mg-muted">WASD/puščice + preslednica · miška + klik · telefon: palica + SUNEK</span>
    </section>`;
  $('#btnTv').onclick = () => {
    isTV = !isTV;
    try { const u = new URL(location.href); if (isTV) u.searchParams.set('tv', '1'); else u.searchParams.delete('tv'); history.replaceState(null, '', u); } catch { /* */ }
    hello(0);
    renderLobbySide();
  };
}

function wireRoom(r) {
  r.onPlayers(() => {
    if (!$('#lobby').classList.contains('mg-hidden')) { renderLobbySide(); if (settingsEl && r.isHost) refreshArenaSelect(); }
  });
  r.onStart(settings => {
    lastSettings = settings;
    document.querySelectorAll('.mg-modal-back').forEach(x => x.remove());
    if (r.isHost) {
      // soba ostane »odprta«, da se lahko kdo pridruži med igro (počaka na naslednjo rundo)
      r.setStatus('lobby').catch(() => {});
      hostStartGame(settings, r.players);
    } else {
      lobbyView?.destroy(); lobbyView = null;
      show('play');
      msg('Pripravljam areno …', 99);
    }
  });
  r.on('hostChanged', ({ hostId }) => {
    const p = r.players.find(x => x.id === hostId);
    if (sess) ui.toast('Novi host: ' + (p?.nickname || '?'), { icon: '👑' });
    if (hostId === ME) becomeHost();
  });
  r.on('kicked', () => { room = null; ui.toast('Host te je odstranil iz sobe.', { icon: '🚪' }); showMenu(); });
}

function refreshArenaSelect() {
  const sel = settingsEl?.querySelector('[name=arena]');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = arenaOptions(cur, roomUnlocked());
}

/* ------------------------------------------------------------ sporočila */

function wireNet() {
  onMsg('hello', (p, from) => {
    if (!p || typeof p !== 'object') return;
    peers.set(from, { sk: p.sk, tv: !!p.tv, un: Array.isArray(p.un) ? p.un.filter(id => ARENAS.some(A => A.id === id && A.secret)) : [] });
    if (p.req && from !== ME) hello(0);
    if (!$('#lobby').classList.contains('mg-hidden')) { renderLobbySide(); refreshArenaSelect(); }
    if (sess?.host && from !== ME) hostSendFull();
    if (sess && sess.roster.some(r => r.id === from)) sess.slotsDirty = true;
  });
  onMsg('in', (p, from) => { if (sess?.host && from !== ME) sess.inputs.set(from, decodeInput(p)); });
  onMsg('snap', (p, from) => { if (sess && !sess.host && from !== ME) onSnap(p); });
  onMsg('full', (p, from) => { if (from !== ME && !(sess?.host)) onFull(p); });
  onMsg('resync', (p, from) => {
    if (!sess?.host || from === ME) return;
    net.send('evs', { to: from, gid: sess.gid, ev: sess.log ? sess.log.since(p?.from | 0) : [] });
    hostSendFull();
  });
  onMsg('evs', p => {
    if (!sess || sess.host || p?.to !== ME || p.gid !== sess.gid) return;
    for (const e of sess.sink.accept(p.ev)) onEvent(e);
  });
  onMsg('pickArena', (p, from) => { if (sess && !sess.host && from === room?.hostId) { sess.nextArena = p?.id || null; renderBetween(); } });
}

/** Sporočila sobe → isti obdelovalci kot pri vadbi. */
function attachRoom(r) {
  for (const [type, list] of handlers) r.on(type, (payload, from) => list.forEach(f => f(payload, from)));
}

/* ===================================================================== */
/*  Seja (ena igra z več rundami)                                        */
/* ===================================================================== */

function newSession(o) {
  return {
    gid: o.gid, host: !!o.host, practice: !!o.practice, cfg: o.cfg, roster: o.roster || [], G: o.G || null,
    phase: 'count', round: 0, arena: null, M: null, log: null, inputs: new Map(), acc: 0, snapAcc: 0, fullAcc: 0, seq: 0,
    left: 0, absent: new Map(), interp: new Interp(90), clock: new HostClock(), sink: new EventSink(),
    world: null, sched: null, sudden: null, my: null, lastSnap: null, lastFull: null, totals: null, roundsHist: [], arenas: [],
    pickups: [], gusts: [], cursors: [], feedN: 0, msgT: 0, finale: false, slotsDirty: true, viewLag: 0, slowT: 0,
    inSeq: 0, inLast: null, inT: 0, nextArena: null, countShown: -1, roundShown: -1,
  };
}

function stopSession() {
  sess = null;
  $('#overlay').classList.add('mg-hidden');
  audio.stopMusic();
}

const inRoster = () => !!sess && !isTV && sess.roster.some(r => r.id === ME);
const myIndex = () => sess ? sess.roster.findIndex(r => r.id === ME) : -1;
const colorOf = r => sess?.cfg.mode === 'teams' && r.team >= 0 ? MT.TEAM_COLORS[r.team] : MT.PALETTE[r.slot % MT.PALETTE.length];
const nameOf = id => sess?.roster.find(r => r.id === id)?.name || '?';
const nameHtml = id => { const r = sess?.roster.find(x => x.id === id); return r ? `<b style="color:${colorOf(r)}">${esc(r.name)}</b>` : '?'; };

/* ------------------------------------------------------------ host: začetek igre */

function hostStartGame(cfgIn, players, { practice = false } = {}) {
  const cfg = sanitizeCfg(cfgIn);
  const tvIds = new Set([...peers.entries()].filter(([, p]) => p.tv).map(([id]) => id));
  if (isTV) tvIds.add(ME);
  const humans = (players || []).filter(p => !tvIds.has(p.id)).slice(0, 8);
  const roster = humans.map((p, k) => ({ id: p.id, name: p.nickname || 'Igralec', human: 1, bot: 0, slot: k, avatar: p.avatar, equipped: p.equipped || {} }));
  const nb = Math.max(0, Math.min(cfg.bots, 8 - roster.length));
  for (let k = 0; k < nb; k++) roster.push({ id: 'bot-' + k, name: botName(k), human: 0, bot: cfg.botLevel, slot: roster.length, avatar: { emoji: '🤖', color: '#8a8c99' }, equipped: {} });
  if (roster.length < 2) {
    ui.toast('Za igro sta potrebna vsaj 2 igralca — dodaj bote v nastavitvah.', { icon: '⚠️', duration: 4000 });
    if (practice) showMenu(); else { show('lobby'); showLobby(); }
    return;
  }
  if (cfg.mode === 'teams') {
    // ljudje in boti izmenično v ekipe
    roster.forEach((r, k) => { r.team = k % 2; });
  } else roster.forEach(r => { r.team = -1; });
  lobbyView?.destroy(); lobbyView = null;
  sess = newSession({ gid: (room?.code || 'vadba') + '-' + Date.now().toString(36), host: true, practice, cfg, roster, G: MT.newGame(cfg, roster) });
  sess.log = new EventLog(0);
  overShown = null;
  show('play');
  hostBeginRound(pickArena(null));
}

function sanitizeCfg(c = {}) {
  const d = MT.DEFAULT_CFG;
  const pick = (v, list, def) => list.includes(v) ? v : def;
  return {
    mode: pick(c.mode, Object.keys(MT.MODES), d.mode),
    roundSec: pick(+c.roundSec, [30, 60, 120, 180, 300], d.roundSec),
    rounds: pick(+c.rounds, [1, 3, 5], d.rounds),
    arena: typeof c.arena === 'string' ? c.arena : 'random',
    dash: c.dash !== false, suicide: +c.suicide === 0 ? 0 : -1,
    gold: !!c.gold, pickups: c.pickups !== false, ghosts: c.ghosts !== false,
    bots: Math.max(0, Math.min(7, c.bots | 0)), botLevel: pick(+c.botLevel, [1, 2, 3], 2),
  };
}

/** Arena za naslednjo rundo: izbira hosta, nastavitev ali naključna (ne ista kot prejšnja). */
function pickArena(chosen) {
  const un = room ? roomUnlocked() : myUnlocked;
  const avail = ARENAS.filter(A => !A.secret || un.includes(A.id));
  if (chosen && avail.some(A => A.id === chosen)) return chosen;
  const c = sess.cfg.arena;
  if (c !== 'random' && avail.some(A => A.id === c)) return c;
  const last = sess.arenas[sess.arenas.length - 1];
  const pool = avail.filter(A => A.id !== last);
  return (pool[Math.floor(Math.random() * pool.length)] || avail[0]).id;
}

function hostBeginRound(arenaId) {
  const A = ARENAS.find(x => x.id === arenaId) || ARENAS[0];
  // pridruženi med igro: v naslednji rundi zraven (do 8)
  if (room) {
    const tvIds = new Set([...peers.entries()].filter(([, p]) => p.tv).map(([id]) => id));
    if (isTV) tvIds.add(ME);
    for (const p of room.players) {
      if (sess.roster.length >= 8) break;
      if (tvIds.has(p.id) || sess.roster.some(r => r.id === p.id)) continue;
      const r = { id: p.id, name: p.nickname || 'Igralec', human: 1, bot: 0, slot: nextSlot(), avatar: p.avatar, equipped: p.equipped || {}, team: -1 };
      if (sess.cfg.mode === 'teams') { const n0 = sess.roster.filter(x => x.team === 0).length, n1 = sess.roster.filter(x => x.team === 1).length; r.team = n0 <= n1 ? 0 : 1; }
      sess.roster.push(r);
      sess.G.totals[r.id] = { id: r.id, name: r.name, bot: 0, team: r.team, slot: r.slot, score: 0, kills: 0, deaths: 0, suicides: 0, revenges: 0, billiards: 0, lastSec: 0, hat: 0, wins: 0, roundsNoFall: 0, played: 0 };
    }
  }
  sess.round = sess.G.round + 1;
  sess.arena = A;
  sess.arenas = [...sess.G.arenas];
  sess.M = MT.createMatch({ arena: A, players: sess.roster, cfg: sess.cfg, seed: sess.gid + ':' + sess.round });
  if (room) for (const r of sess.roster) if (r.human && !room.players.some(p => p.id === r.id)) MT.setAbsent(sess.M, r.id, true);
  sess.inputs = new Map();
  sess.phase = 'count';
  sess.left = 3.6;
  sess.acc = 0; sess.snapAcc = 0; sess.fullAcc = 0;
  sess.finale = false; sess.nextArena = null;
  setupView(A);
  hostSendFull();
  enterPhase();
}

function nextSlot() {
  const used = new Set(sess.roster.map(r => r.slot));
  for (let k = 0; k < 8; k++) if (!used.has(k)) return k;
  return sess.roster.length;
}

/* ------------------------------------------------------------ host: zanka */

function hostTick(dt) {
  const s = sess;
  if (s.phase === 'count') {
    s.left -= dt;
    if (s.interp.buf.length === 0) s.interp.push(hostSnapObj(s.M));
    s.snapAcc += dt;
    if (s.snapAcc >= 1 / NET.SNAP_HZ && room) { s.snapAcc = 0; net.send('snap', encodeSnap({ ...hostSnapObj(s.M), seq: ++s.seq, ev: s.log.take() })); }
    if (s.left <= 0) { s.phase = 'round'; hostSendFull(); enterPhase(); }
    s.fullAcc += dt; if (s.fullAcc >= 1) { s.fullAcc = 0; hostSendFull(); }
    return;
  }
  if (s.phase === 'between') {
    const before = Math.ceil(s.left);
    s.left -= dt;
    if (Math.ceil(s.left) !== before) renderBetween();
    s.fullAcc += dt; if (s.fullAcc >= 1) { s.fullAcc = 0; hostSendFull(); }
    if (s.left <= 0) hostNext();
    return;
  }
  if (s.phase !== 'round') return;
  const M = s.M;
  s.acc += dt;
  let n = 0;
  while (s.acc >= STEP && n < 40 && M.phase !== 'end') {
    // vhodi: jaz, drugi ljudje (zadnji prejeti), boti
    if (inRoster()) s.inputs.set(ME, localInput());
    for (const p of M.players) if (p.bot) s.inputs.set(p.id, botInput(M, p));
    MT.stepMatch(M, s.inputs);
    for (const e of M.ev) onEvent(s.log.push(e));
    M.ev.length = 0;
    if (M.w.steps % 2 === 0) s.interp.push(hostSnapObj(M));
    s.acc -= STEP; n++;
  }
  if (n >= 40) s.acc = 0;
  s.snapAcc += dt;
  if (s.snapAcc >= 1 / NET.SNAP_HZ) {
    s.snapAcc = 0;
    if (room) net.send('snap', encodeSnap({ ...hostSnapObj(M), seq: ++s.seq, ev: s.log.take() }));
    else s.log.take();
  }
  s.fullAcc += dt;
  if (s.fullAcc >= NET.FULL_MS / 1000) { s.fullAcc = 0; hostAbsent(); hostSendFull(); }
  if (M.phase === 'end') hostEndRound();
}

function hostSnapObj(M) {
  const lead = sess.cfg.gold ? MT.leaderId(M) : null;
  return {
    seq: sess.seq, t: M.t,
    balls: M.players.map(p => ({
      x: p.b.x, y: p.b.y, z: p.b.z, vx: p.b.vx, vy: p.b.vy, vz: p.b.vz, yaw: p.b.yaw || 0, st: p.st,
      inv: p.invT > 0, dash: p.b.dashT > 0, ice: p.iceT > 0, weight: p.weightT > 0, bumper: p.bumperT > 0, magnet: p.magnetT > 0,
      crown: lead === p.id, dashCd: p.b.dashCd || 0, grounded: p.b.grounded,
    })),
    pk: M.pickups.filter(k => !k.taken).map(k => ({ n: k.n, k: k.k, x: k.x, z: k.z, t0: +k.t0.toFixed(2) })),
    gu: M.cfg.mode === 'lms' ? M.players.map((p, i) => p.st === 'out' && p.cursor && !p.bot ? { i, x: +p.cursor[0].toFixed(2), z: +p.cursor[1].toFixed(2), ready: p.ghostCd <= 0 ? 1 : 0 } : null).filter(Boolean) : [],
  };
}

function hostAbsent() {
  if (!room || !sess?.M) return;
  const now = Date.now();
  const here = new Set(room.players.map(p => p.id));
  for (const r of sess.roster) {
    if (!r.human || r.id === ME) continue;
    if (here.has(r.id)) {
      sess.absent.delete(r.id);
      const p = MT.byId(sess.M, r.id);
      if (p?.absent) MT.setAbsent(sess.M, r.id, false);
    } else {
      if (!sess.absent.has(r.id)) sess.absent.set(r.id, now);
      if (now - sess.absent.get(r.id) > NET.ABSENT_MS) MT.setAbsent(sess.M, r.id, true);
    }
  }
}

function fullState() {
  const s = sess;
  return {
    v: 1, gid: s.gid, phase: s.phase, round: s.round, cfg: s.cfg, roster: s.roster, host: ME,
    totals: s.G.totals, rounds: s.G.rounds, arenas: s.G.arenas, gRound: s.G.round,
    arena: s.arena?.id, left: Math.round(s.left * 1000), evq: s.log?.seq || 0, next: s.nextArena,
    M: (s.phase === 'count' || s.phase === 'round') && s.M ? MT.serializeMatch(s.M) : null,
    res: s.phase !== 'count' && s.phase !== 'round' && s.M ? { result: s.M.result, players: s.M.players.map(p => ({ id: p.id, score: p.score, kills: p.kills, deaths: p.deaths })) } : null,
  };
}
function hostSendFull() {
  if (!sess?.host) return;
  sess.lastFull = fullState();
  if (room) net.send('full', sess.lastFull);
}

function hostEndRound() {
  const s = sess;
  // zadnji posnetek in dogodki
  if (room) net.send('snap', encodeSnap({ ...hostSnapObj(s.M), seq: ++s.seq, ev: s.log.take() }));
  MT.addRound(s.G, s.M);
  s.arenas = [...s.G.arenas];
  s.phase = s.G.round >= s.cfg.rounds ? 'over' : 'between';
  s.left = 14;
  s.fullAcc = 0;
  hostSendFull();
  enterPhase();
}

function hostNext(arenaId = null) {
  if (!sess?.host || sess.phase !== 'between') return;
  hostBeginRound(pickArena(arenaId || sess.nextArena));
}

/* ------------------------------------------------------------ prenos hosta */

function becomeHost() {
  const s = sess;
  if (!s || s.host || !s.lastFull) return;
  const f = s.lastFull;
  s.host = true;
  s.log = new EventLog(s.sink.q ?? f.evq ?? 0);
  s.log.sent = s.log.seq;
  s.G = { cfg: f.cfg, round: f.gRound, arenas: [...f.arenas], rounds: [...f.rounds], totals: JSON.parse(JSON.stringify(f.totals)) };
  s.inputs = new Map();
  s.acc = s.snapAcc = s.fullAcc = 0;
  if ((f.phase === 'round' || f.phase === 'count') && f.M) {
    const S2 = JSON.parse(JSON.stringify(f.M));
    // novejši položaji iz zadnjega posnetka
    const last = s.interp.last;
    if (last && last.t > S2.t) {
      S2.t = last.t;
      last.balls.forEach((b, i) => {
        const p = S2.players[i];
        if (!p) return;
        p.b = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, g: b.st === 'alive' ? 1 : 0, yaw: b.yaw, dashT: 0, dashCd: b.dashCd || 0 };
        if (b.st !== p.st && b.st !== 'out') { p.st = b.st; p.stT = 0; }
      });
    }
    s.M = MT.restoreMatch(s.arena, S2);
    s.world = s.M.w;
    if (renderer) renderer.w = s.M.w;
    s.my = null;
    s.left = Math.max(0, f.left / 1000);
  } else s.left = Math.max(3, f.left / 1000);
  ui.toast('Host je odšel — igro zdaj vodiš ti.', { icon: '👑' });
  hostSendFull();
  if (s.phase === 'between') renderBetween();
}

/* ------------------------------------------------------------ klient: sporočila */

function onFull(f) {
  if (!f || f.v !== 1) return;
  if (!sess || sess.gid !== f.gid) {
    if (sess && sess.phase !== 'over' && sess.lastFull && f.gid < sess.gid) return;
    sess = newSession({ gid: f.gid, host: false, cfg: f.cfg, roster: f.roster });
    sess.sink.reset(f.evq);
    overShown = null;
    lobbyView?.destroy(); lobbyView = null;
    document.querySelectorAll('.mg-modal-back').forEach(x => x.remove());
    show('play');
  }
  const s = sess;
  s.lastFull = f;
  s.cfg = f.cfg;
  if (JSON.stringify(s.roster.map(r => r.id)) !== JSON.stringify(f.roster.map(r => r.id))) s.slotsDirty = true;
  s.roster = f.roster;
  s.totals = f.totals; s.roundsHist = f.rounds; s.arenas = f.arenas;
  s.nextArena = f.next ?? s.nextArena;
  if (s.sink.q == null) s.sink.reset(f.evq);
  const A = ARENAS.find(x => x.id === f.arena);
  if (A && (s.arena?.id !== A.id || s.round !== f.round)) {
    s.arena = A; s.round = f.round;
    setupView(A);
    s.interp.clear();
    s.my = null;
  }
  if (f.M) {
    if (JSON.stringify(f.M.sudden) !== JSON.stringify(s.sudden)) { s.sudden = f.M.sudden; s.sched = null; }
    if (!s.interp.last) s.clock.sample(f.M.t, performance.now() / 1000);
  }
  s.left = f.left / 1000;
  s.extra = {}; s.fullQ = f.evq;
  if (f.phase !== s.phase || f.round !== s.roundShown) { s.phase = f.phase; enterPhase(); s.roundShown = f.round; }
  else if (s.phase === 'between') renderBetween();
  if (s.slotsDirty) buildSlots();
}

let resyncAt = 0;
function onSnap(o) {
  const s = sess;
  if (!s.arena) return;
  let d;
  try { d = decodeSnap(o); } catch { return; }
  if (d.balls.length !== s.roster.length) return;
  const now = performance.now() / 1000;
  s.clock.sample(d.t, now);
  s.interp.push(d);
  s.lastSnap = d;
  s.pickups = d.pk; s.cursors = d.gu;
  for (const e of s.sink.accept(d.ev)) onEvent(e);
  if (s.sink.gap && now - resyncAt > 1) { resyncAt = now; net.send('resync', { from: s.sink.q }); }
  // popravek napovedi lastne krogle
  const mi = myIndex();
  if (mi >= 0 && s.my && !isTV) {
    const auth = d.balls[mi];
    if (auth.st !== 'alive') s.my = null;
    else {
      const lag = Math.max(0, Math.min(0.25, (s.clock.now(now) ?? d.t) - d.t));
      correct(s.my.b, auth, lag);
      s.my.b.dashCd = Math.min(s.my.b.dashCd, auth.dashCd + 0.05);
      s.my.ice = auth.ice;
    }
  }
}

/* ------------------------------------------------------------ dogodki (host in klienti enako) */

function onEvent(e) {
  if (!sess) return;
  const s = sess;
  if (!s.host && (e.type === 'kill' || e.type === 'suicide') && e.q > (s.fullQ ?? 0)) {
    s.extra = s.extra || {};
    const who = e.type === 'kill' ? e.k : e.v;
    s.extra[who] = (s.extra[who] || 0) + (e.pts || 0);
  }
  const idx = id => s.roster.findIndex(r => r.id === id);
  const col = id => { const r = s.roster.find(x => x.id === id); return r ? colorOf(r) : '#fff'; };
  switch (e.type) {
    case 'hit': {
      audio.play('bonk', e.v);
      renderer?.hitFx(e.x, e.y, e.z, e.v);
      if ((e.a === ME || e.b === ME) && e.v > 3 && !isTV) vibrate(Math.min(60, 15 + e.v * 3));
      break;
    }
    case 'dash': audio.play('dash'); { const r = renderer; const b = ballState(idx(e.p)); if (r && b) r.dashFx(b.x, b.y, b.z, col(e.p)); } break;
    case 'kill': case 'suicide': {
      const f = feedText(e, nameHtml);
      feed(f.text, f.tags);
      audio.play(e.type === 'kill' ? 'izriv' : 'padec');
      renderer?.fallFx(e.x, e.z, col(e.v));
      if (e.v === ME) { vibrate(90); msg(e.type === 'kill' ? `Izrinil te je ${nameHtml(e.k)}!` : 'Zakotalil si se sam …', 1.6); }
      else if (e.k === ME) { msg(e.team ? `Ups — soigralec ${nameHtml(e.v)} (−1)` : `Izrinil si ${nameHtml(e.v)}! <small>+${e.pts}${f.tags.length ? ' · ' + esc(f.tags.join(' ')) : ''}</small>`, 1.6); flyPoint(e); }
      if (isTV || !inRoster()) { s.slowT = 0.55; renderer && (renderer.slow = 0.55); renderer?.shake(0.18); }
      break;
    }
    case 'respawn': if (e.p === ME) msg('Nazaj v areni! <small>(1,5 s neranljiv)</small>', 1.2); break;
    case 'pick-spawn': audio.play('click'); break;
    case 'pick': {
      audio.play('pick');
      const P = MT.PICKUPS[e.k];
      if (e.p === ME) msg(`${P.icon} ${P.name}! <small>${P.desc}</small>`, 1.6);
      else feed(`${nameHtml(e.p)} je pobral ${P.icon} ${esc(P.name)}`);
      break;
    }
    case 'finale-start': banner('FINALE — rob se kruši!', 3); audio.play('finale'); audio.setTempo(150); s.finale = true; break;
    case 'finale': audio.play('crumble'); break;
    case 'sudden': banner('NAGLA SMRT — prvi izriv odloči!', 4); audio.play('finale'); s.sudden = { t0: e.t0 ?? (s.M?.sudden?.t0 ?? s.lastSnap?.t ?? 0), ids: e.ids }; s.sched = null; if (e.ids.includes(ME)) msg('Nagla smrt!', 1.5); break;
    case 'gust': audio.play('gust'); renderer?.gustFx(e.x, e.z, e.dx, e.dz); break;
    case 'spring': audio.play('spring'); if (renderer && e.k >= 0) renderer.springFired(renderer.L.springs[e.k]); break;
    case 'hammer': audio.play('hammer'); break;
    case 'saw': audio.play('saw'); break;
    case 'absent': feed(`${nameHtml(e.p)} je odsoten — umaknjen iz arene`); break;
    case 'end': break;
  }
}

function vibrate(ms) { try { if (navigator.userActivation?.hasBeenActive && !reduced()) navigator.vibrate?.(ms); } catch { /* */ } }

/* ------------------------------------------------------------ faze (prikaz) */

function enterPhase() {
  const s = sess;
  $('#overlay').classList.add('mg-hidden');
  if (s.phase === 'count') {
    banner('', 0);
    if (s.countShown !== s.round) {
      s.countShown = s.round;
      const A = s.arena;
      msg(`Runda ${s.round}/${s.cfg.rounds}: ${esc(A?.name || '')}<small>${esc(A?.desc || '')}</small>`, 2);
      setTimeout(() => { if (sess === s && s.phase === 'count') ui.countdown(3, { go: 'RUŠI!', step: 700 }); }, Math.max(0, s.left * 1000 - 2800));
      audio.setTempo(118);
      audio.unlock(); audio.startMusic(1);
    }
  } else if (s.phase === 'round') {
    s.finale = false;
  } else if (s.phase === 'between') {
    audio.setTempo(118);
    renderBetween();
  } else if (s.phase === 'over') {
    gameOver();
  }
}

function standingsNow() {
  const s = sess;
  const tot = s.host ? s.G.totals : s.totals || {};
  return Object.values(tot).sort((a, b) => (b.score - a.score) || (b.wins - a.wins) || (b.kills - a.kills) || (a.slot - b.slot));
}

function renderBetween() {
  const s = sess;
  if (!s || s.phase !== 'between') return;
  const ov = $('#overlay');
  ov.classList.remove('mg-hidden');
  const hist = (s.host ? s.G.rounds : s.roundsHist) || [];
  const last = hist[hist.length - 1];
  const rows = standingsNow();
  const roster = id => s.roster.find(r => r.id === id) || { name: '?' };
  const winTxt = last?.winner ? nameHtml(last.winner) + ' je zmagal rundo!' : last?.team != null ? `Rundo so zmagali <b style="color:${MT.TEAM_COLORS[last.team]}">${MT.TEAM_NAMES[last.team]}</b>!` : 'Runda je neodločena.';
  const un = room ? roomUnlocked() : myUnlocked;
  const avail = ARENAS.filter(A => !A.secret || un.includes(A.id));
  ov.innerHTML = `<div class="mg-card ru-panel">
    <h2 class="mg-title">Runda ${hist.length}/${s.cfg.rounds}</h2>
    <p class="mg-center">${winTxt}</p>
    ${s.cfg.mode === 'teams' ? teamLine(rows) : ''}
    <table class="mg-table"><tbody>${rows.map((t, i) => `<tr class="${t.id === ME ? 'mg-me' : ''}"><td class="mg-rank">${i + 1}.</td>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colorOf(roster(t.id))};margin-right:6px"></span>${whoHtml(t.id)}</td>
      <td class="mg-num">${t.score} t</td><td class="mg-num mg-small">💥 ${t.kills} · ⬇ ${t.deaths}</td><td class="mg-num mg-small">${last ? (last.scores[t.id] ?? 0) >= 0 ? '+' + (last.scores[t.id] ?? 0) : last.scores[t.id] : ''}</td></tr>`).join('')}</tbody></table>
    ${s.host ? `<div class="mg-small mg-muted">Naslednja arena (izbere host; sicer ${s.cfg.arena === 'random' ? 'naključno' : 'iz nastavitev'}):</div>
      <div class="ru-picks">${avail.map(A => `<button class="mg-btn mg-btn--ghost mg-btn--small" type="button" data-arena="${esc(A.id)}" aria-pressed="${s.nextArena === A.id}">${A.secret ? '🗝️ ' : ''}${esc(A.name)}</button>`).join('')}</div>
      <button class="mg-btn mg-btn--primary mg-btn--big" type="button" id="btnNext">Naslednja runda (${Math.ceil(s.left)} s)</button>`
    : `<p class="mg-center mg-muted">${s.nextArena ? 'Naslednja arena: <b>' + esc(ARENAS.find(A => A.id === s.nextArena)?.name || '') + '</b>' : 'Host izbira areno …'} Naslednja runda čez ${Math.ceil(s.left)} s.</p>`}
  </div>`;
  ov.querySelectorAll('[data-arena]').forEach(b => b.onclick = () => { s.nextArena = b.dataset.arena; net.send('pickArena', { id: s.nextArena }); renderBetween(); });
  const nb = ov.querySelector('#btnNext');
  if (nb) nb.onclick = () => hostNext();
}

function teamLine(rows) {
  const s = [0, 0];
  for (const t of rows) if (t.team >= 0) s[t.team] += t.score;
  return `<div class="mg-row mg-row--between" style="font-weight:700"><span class="ru-team0">🔴 ${MT.TEAM_NAMES[0]}: ${s[0]}</span><span class="ru-team1">${MT.TEAM_NAMES[1]}: ${s[1]} 🔵</span></div>`;
}

function whoHtml(id) {
  const r = sess.roster.find(x => x.id === id);
  if (!r) return '?';
  return ui.who({ nickname: r.name, avatar: r.avatar || { emoji: '🐹', color: colorOf(r) }, equipped: r.equipped || {} });
}

/* ------------------------------------------------------------ konec igre */

async function gameOver() {
  const s = sess;
  if (!s || overShown === s.gid) return;
  overShown = s.gid;
  audio.stopMusic();
  $('#overlay').classList.add('mg-hidden');
  const G = s.host ? s.G : { cfg: s.cfg, totals: s.totals, rounds: s.roundsHist, arenas: s.arenas };
  const st = MT.gameStandings(G);
  const aw = MT.awards(G);
  const meT = G.totals[ME];
  const player = !!meT && !isTV;
  const humans = s.roster.filter(r => r.human).length;
  const won = player && (s.cfg.mode === 'teams' ? st.team != null && meT.team === st.team : st.list[0]?.id === ME && st.list[0].score > 0);
  let xp = 0;
  if (player) xp = await rewards(s, G, meT, won, humans, aw);
  if (won) audio.play('win');
  const list = st.list.map(t => {
    const r = s.roster.find(x => x.id === t.id) || {};
    return { id: t.id, nickname: t.name, avatar: r.avatar || { emoji: '🐹', color: MT.PALETTE[t.slot % 8] }, equipped: r.equipped || {}, scoreText: `${t.score} t · 💥${t.kills}`, xp: t.id === ME ? xp : 0 };
  });
  const extra = `${s.cfg.mode === 'teams' && st.teamScores ? `<p class="mg-center" style="font-weight:700"><span class="ru-team0">🔴 ${MT.TEAM_NAMES[0]} ${st.teamScores[0]}</span> : <span class="ru-team1">${st.teamScores[1]} ${MT.TEAM_NAMES[1]} 🔵</span>${st.team != null ? ` — zmagali so <b>${MT.TEAM_NAMES[st.team]}</b>` : ' — neodločeno'}</p>` : ''}
    ${aw.length ? `<div class="ru-awards">${aw.map(a => `<div><b>${a.icon} ${esc(a.title)}</b>${nameHtml(a.id)} · ${esc(a.text)}</div>`).join('')}</div>` : ''}
    <p class="mg-center mg-small mg-muted">Arene: ${G.arenas.map(id => esc(ARENAS.find(A => A.id === id)?.name || id)).join(' → ')}</p>
    ${room ? '<p class="mg-center"><button class="mg-btn mg-btn--ghost mg-btn--small" type="button" data-act="lobby">⚙️ Nazaj v lobby</button></p>' : ''}`;
  const host = isHost();
  const title = s.cfg.mode === 'teams' ? (st.team != null ? `Zmagali so ${MT.TEAM_NAMES[st.team]}!` : 'Neodločeno') : (won ? 'Zmaga! 💥' : 'Konec igre');
  const v = await ui.results(list, { title, extraHtml: extra, again: s.practice ? 'Še enkrat' : host ? 'Revanša' : 'Počakaj na revanšo' });
  if (v !== 'again') return;
  if (s.practice) { startPractice({ ...lastSettings }); return; }
  if (room && !room.left) {
    if (room.isHost) await room.start(lastSettings || room.settings);
    else { ui.toast('Ko host začne revanšo, se igra začne sama.', { icon: '⏳' }); }
  }
}
document.addEventListener('click', e => {
  if (!e.target.closest?.('[data-act=lobby]')) return;
  document.querySelectorAll('.mg-modal-back').forEach(x => x.remove());
  if (sess) sess.phase = 'over';
  showLobby();
});

/** Nagrade igralca (enkrat na igro): reportGame, XP, dogodki za naloge, dosežki. */
async function rewards(s, G, T, won, humans, aw) {
  const xp = MT.xpFor({ humans, kills: T.kills, won });
  const mpWin = won && humans >= 2;
  try {
    await hub.reportGame({ won: mpWin, players: humans, score: T.score });
    await hub.awardXp(xp, 'rusilec');
    if (T.kills) await hub.reportEvent('rusilec:izriv', 1, { times: Math.min(100, T.kills) });
    if (mpWin) await hub.reportEvent('rusilec:zmaga', 1);
    if (G.arenas.length) await hub.reportEvent('rusilec:arena', 1, { times: G.arenas.length });
    const mine = aw.filter(a => a.id === ME);
    if (mine.length) await hub.reportEvent('rusilec:nagrada', 1, { times: mine.length });
  } catch (e) { console.warn(e); }
  if (T.kills >= 1) unlock('prvi-izriv');
  if (won && humans >= 3) unlock('zmaga');
  if (T.hat >= 1) unlock('hat-trick');
  if (T.roundsNoFall >= 1) unlock('nedotakljiv');
  if (T.billiards >= 1) unlock('biljard');
  if (T.revenges >= 1) unlock('mascevanje');
  if (T.lastSec >= 1) unlock('zadnji-trenutek');
  if (humans >= 8) unlock('osem');
  const played = new Set(S.load('rusilec:played', []));
  G.arenas.forEach(a => played.add(a));
  S.save('rusilec:played', [...played]);
  if (ARENAS.every(A => played.has(A.id))) unlock('vse-arene');
  return xp;
}

/* ===================================================================== */
/*  Pogled (renderer, krogle, HUD)                                       */
/* ===================================================================== */

function autoQuality() { return detectQuality(); }
function ensureEngine() {
  if (renderer || engineFailed) return !!renderer;
  const q = QS.get('q') && QUALITY[QS.get('q')] ? QS.get('q') : settings.quality !== 'auto' && QUALITY[settings.quality] ? settings.quality : autoQuality();
  try { renderer = new ArenaRenderer($('#cv'), { quality: q, onLost: () => ui.toast('Grafika je bila ponastavljena — kakovost: Nizka.', { icon: '⚙️' }) }); }
  catch (e) {
    try { renderer = new ArenaRenderer($('#cv'), { quality: 'low' }); }
    catch (e2) { console.warn(e2); engineFailed = true; ui.toast('Ta naprava ne podpira 3D grafike (WebGL).', { icon: '⚠️', duration: 5000 }); return false; }
  }
  if (DEV) window.__ru = { get renderer() { return renderer; }, get sess() { return sess; } };
  input = new Input($('#play'), { stickEl: $('#stick'), knobEl: $('#knob') });
  addEventListener('resize', () => renderer.resize());
  const touch = input.isTouch;
  $('#stick').classList.toggle('mg-hidden', !touch);
  const dashBtn = $('#btnDash');
  dashBtn.classList.toggle('mg-hidden', !touch);
  dashBtn.addEventListener('pointerdown', e => { e.preventDefault(); doDash(); });
  addEventListener('keydown', e => {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT') return;
    if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat && !$('#play').classList.contains('mg-hidden') && !document.querySelector('.mg-modal-back')) { e.preventDefault(); doDash(); }
  });
  const cv = $('#cv');
  cv.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && (e.button === 0 || e.button === 2)) doDash(); });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  $('#btnMute').onclick = () => {
    const on = !(settings.sfx || settings.music);
    settings.sfx = settings.music = on; saveSettings();
    audio.setSfx(on); audio.setMusic(on); if (on) audio.startMusic(1);
    $('#btnMute').textContent = on ? '🔊' : '🔇';
  };
  $('#btnMute').textContent = settings.sfx || settings.music ? '🔊' : '🔇';
  $('#btnBoard').onclick = () => document.body.classList.toggle('ru-board-open');
  $('#btnExit').onclick = async () => {
    if (!(await ui.confirm('Zapustim igro?'))) return;
    if (room) { await room.leave(); room = null; }
    showMenu();
  };
  return true;
}

function doDash() {
  if (!sess || !inRoster()) return;
  dashCount++;
  // lokalna napoved sunka (host ga izvede v simulaciji)
  if (!sess.host && sess.my && sess.cfg.dash) {
    const [ix, iz] = input.world(renderer.view.yaw);
    dash(sess.my.b, ix, iz);
  }
}

function localInput() {
  if (!input || !renderer || !inRoster()) return { x: 0, z: 0, d: dashCount };
  input.enabled = !document.querySelector('.mg-modal-back');
  const [x, z] = input.world(renderer.view.yaw);
  return { x, z, d: dashCount };
}

function setupView(A) {
  if (!ensureEngine()) return;
  const s = sess;
  s.world = s.host ? s.M.w : arenaWorld(A);
  s.sched = null;
  renderer.load(s.world.L, s.world, mySkin);
  s.slotsDirty = true;
  buildSlots();
  $('#feed').innerHTML = '';
}

function buildSlots() {
  if (!renderer || !sess) return;
  sess.slotsDirty = false;
  document.body.classList.toggle('ru-tv', isTV || !inRoster());
  renderer.setSlots(sess.roster.map(r => ({ color: colorOf(r), name: r.name, skin: skinFor(r), me: r.id === ME && !isTV, team: r.team })));
}

/** Stanje krogle i za izris (host: iz simulacije; klient: interpolacija/napoved). */
function ballState(i) {
  const s = sess;
  if (!s || i < 0) return null;
  if (s.host && s.M) { const p = s.M.players[i]; return p ? { ...p.b, st: p.st } : null; }
  const t = s.clock.now(performance.now() / 1000);
  return t == null ? null : s.interp.sample(i, t - NET.DELAY);
}

/* ------------------------------------------------------------ zanka */

let last = performance.now();
let fpsAcc = 0, fpsN = 0, lowFor = 0, hudAcc = 0;

function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  if (!sess || $('#play').classList.contains('mg-hidden') || !renderer) return;
  const s = sess;
  if (s.host) hostTick(dt);
  else clientTick(dt, nowMs / 1000);
  if (!sess || !s.arena || !s.world) return;
  // čas izrisa (TV: kratek slow-mo ob izrivu)
  if (s.slowT > 0 && !reduced()) { s.slowT -= dt; s.viewLag = Math.min(0.4, s.viewLag + dt * 0.65); }
  else s.viewLag = Math.max(0, s.viewLag - dt * 0.5);
  if (s.slotsDirty) buildSlots();
  const balls = renderBalls(nowMs / 1000);
  const portrait = renderer.camera.aspect < 0.8;
  renderer.renderArena(s.world, balls, dt, { pickups: s.host ? s.M?.pickups.filter(k => !k.taken) : s.pickups, ghosts: s.cfg.mode !== 'lms' ? null : s.host ? hostSnapObj(s.M).gu : s.cursors, shift: portrait && inRoster() ? 0.42 : 0 });
  // miška: položaj lastne krogle na zaslonu
  const mi = myIndex();
  if (mi >= 0 && balls[mi]) { const p = renderer.project(balls[mi].x, balls[mi].y, balls[mi].z); input.setBall(p.x, p.y); }
  hudAcc += dt;
  if (hudAcc > 0.1) { hudAcc = 0; hud(balls); }
  // FPS in samodejna kakovost
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1) {
    const fps = fpsN / fpsAcc;
    $('#fps').classList.toggle('mg-hidden', !settings.fps && !DEV);
    $('#fps').textContent = `${Math.round(fps)} fps · ${QUALITY[renderer.qualityKey].name}`;
    if (settings.quality === 'auto' && !QS.get('q') && s.phase === 'round' && !document.hidden) {
      lowFor = fps < 45 ? lowFor + 1 : 0;
      const i = QUALITY_ORDER.indexOf(renderer.qualityKey);
      if (lowFor >= 3 && i < QUALITY_ORDER.length - 1) {
        renderer.setQuality(QUALITY_ORDER[i + 1]); lowFor = 0;
        ui.toast('Kakovost: ' + QUALITY[renderer.qualityKey].name + ' (samodejno)', { icon: '⚙️', duration: 1800 });
      }
    }
    fpsAcc = 0; fpsN = 0;
  }
}

function renderBalls(now) {
  const s = sess;
  const mi = myIndex();
  if (s.host && s.M) {
    const t = s.M.t - (s.viewLag > 0 ? s.viewLag : 0);
    return s.roster.map((r, i) => {
      if (s.viewLag > 0) return s.interp.sample(i, t);
      const p = s.M.players[i];
      return p ? { x: p.b.x, y: p.b.y, z: p.b.z, vx: p.b.vx, vy: p.b.vy, vz: p.b.vz, yaw: p.b.yaw, st: p.st, inv: p.invT > 0, crown: s.cfg.gold && MT.leaderId(s.M) === p.id,
        weight: p.weightT > 0, bumper: p.bumperT > 0, magnet: p.magnetT > 0, ice: p.iceT > 0, dash: p.b.dashT > 0 } : null;
    });
  }
  const ht = s.clock.now(now);
  if (ht == null) return [];
  const t = ht - NET.DELAY - s.viewLag;
  return s.roster.map((r, i) => {
    const b = s.interp.sample(i, t);
    if (i === mi && s.my && b && b.st === 'alive') return { ...b, x: s.my.b.x, y: s.my.b.y, z: s.my.b.z, vx: s.my.b.vx, vy: s.my.b.vy, vz: s.my.b.vz, yaw: s.my.b.yaw };
    return b;
  });
}

function clientTick(dt, now) {
  const s = sess;
  if (!s.world) return;
  const ht = s.clock.now(now);
  if (s.phase === 'between' || s.phase === 'count') {
    const before = Math.ceil(s.left);
    s.left = Math.max(0, s.left - dt);
    if (s.phase === 'between' && Math.ceil(s.left) !== before) renderBetween();
  }
  if (ht == null) return;
  // svet (ovire, krušenje) sledi uri hosta
  const w = s.world;
  if (ht - w.t > 1.5 || ht < w.t - 1) { w.t = Math.max(0, ht - STEP); advanceWorld(w); w.t = ht; }
  if (!s.sched) s.sched = MT.crumbleSchedule(s.arena, s.cfg, w, s.sudden?.t0 ?? null);
  // napoved lastne krogle
  const mi = myIndex();
  const auth = mi >= 0 ? s.lastSnap?.balls[mi] : null;
  if (mi >= 0 && !isTV && s.phase === 'round' && auth && auth.st === 'alive' && !s.my) {
    const b = makeBody(w, auth.x, auth.z);
    Object.assign(b, { y: auth.y, vx: auth.vx, vy: auth.vy, vz: auth.vz, yaw: auth.yaw, dashCd: auth.dashCd, dashT: 0, id: mi });
    s.my = { b };
  }
  let n = 0;
  const inp = localInput();
  while (w.t + STEP <= ht && n < 40) {
    advanceWorld(w);
    MT.applyCrumble(w, s.sched, w.t);
    if (s.my) {
      const b = s.my.b;
      b.forceSurf = s.my.ice ? 'ice' : null;
      stepBody(w, b, inp.x, inp.z, []);
      tickDash(b, STEP);
      if (b.y < w.g.minH - MT.RULES.FALL_Y) s.my = null;
    }
    n++;
  }
  // vhod hostu: ob spremembi (največ 20×/s) in vsaj vsakih 400 ms
  if (inRoster() && room) {
    const q = encodeInput(s.inSeq, inp.x, inp.z, inp.d);
    const ms = now * 1000;
    const changed = !s.inLast || q.x !== s.inLast.x || q.z !== s.inLast.z || q.d !== s.inLast.d;
    if ((changed && ms - s.inT >= NET.IN_MS) || ms - s.inT >= NET.IN_IDLE_MS) {
      q.s = ++s.inSeq;
      net.send('in', q);
      s.inLast = q; s.inT = ms;
    }
  }
}

/* ------------------------------------------------------------ HUD */

function hud(balls) {
  const s = sess;
  const mi = myIndex();
  const M = s.host ? s.M : null;
  const t = s.host ? M?.t ?? 0 : (s.clock.now(performance.now() / 1000) ?? 0) - NET.DELAY;
  const left = s.phase === 'round' ? Math.max(0, s.cfg.roundSec - t) : s.phase === 'count' ? s.cfg.roundSec : 0;
  const clock = $('#hClock');
  const sudden = s.host ? M?.sudden : s.sudden;
  clock.textContent = sudden ? 'NAGLA SMRT' : s.cfg.mode === 'lms' && s.phase === 'round' ? '⏳ ' + fmt(left) : fmt(left);
  clock.classList.toggle('fin', !!sudden || (s.phase === 'round' && left <= 30 && s.cfg.mode !== 'lms'));
  $('#hRound').textContent = `Runda ${Math.max(1, s.round)}/${s.cfg.rounds}`;
  // točke: igra (skupaj) + runda
  const scores = s.host ? Object.fromEntries(M.players.map(p => [p.id, p.score])) : roundScores();
  const tot = s.host ? s.G.totals : s.totals || {};
  const rows = s.roster.map((r, i) => ({ r, i, sc: (tot[r.id]?.score || 0) + (s.phase === 'round' || s.phase === 'count' ? scores[r.id] || 0 : 0) }))
    .sort((a, b) => b.sc - a.sc || a.r.slot - b.r.slot);
  if (mi >= 0 && !isTV) {
    const me = rows.find(x => x.i === mi);
    $('#hMe').textContent = `${me.sc} t`;
    $('#hPlace').textContent = `${rows.indexOf(me) + 1}. mesto`;
  } else { $('#hMe').textContent = isTV ? '📺 TV' : '👀 opazuješ'; $('#hPlace').textContent = ''; }
  const teams = s.cfg.mode === 'teams';
  let ts = '';
  if (teams) { const a = [0, 0]; for (const x of rows) if (x.r.team >= 0) a[x.r.team] += x.sc; ts = `<div class="teams"><span class="ru-team0">🔴 ${a[0]}</span><span class="ru-team1">${a[1]} 🔵</span></div>`; }
  $('#board').innerHTML = ts + rows.map(x => {
    const b = balls[x.i];
    const gone = !b || b.st !== 'alive';
    return `<div class="row ${x.r.id === ME ? 'me' : ''} ${gone ? 'gone' : ''}"><span class="dot" style="background:${colorOf(x.r)}"></span><span class="nm">${b?.crown ? '👑 ' : ''}${esc(x.r.name)}${b?.st === 'out' ? ' 👻' : ''}</span><span class="sc">${x.sc}</span></div>`;
  }).join('');
  // sunek: krožna ura
  const myB = mi >= 0 ? (s.host ? M?.players[mi]?.b : s.my?.b || balls[mi]) : null;
  const cd = myB?.dashCd || 0;
  const btn = $('#btnDash');
  btn.style.setProperty('--cd', String(1 - Math.min(1, cd / 3)));
  btn.classList.toggle('cool', cd > 0.05 || !s.cfg.dash);
  btn.disabled = !s.cfg.dash && !(s.cfg.mode === 'lms' && balls[mi]?.st === 'out');
  // čakanje na ponovni prihod / duh
  if (mi >= 0 && !isTV && s.phase === 'round') {
    const b = balls[mi];
    if (b?.st === 'dead' && !s.msgHold) msg(s.cfg.mode === 'lms' || sudden ? 'Izpadel si …' : 'Padel si … nazaj čez trenutek', 0.3);
    if (b?.st === 'out' && s.cfg.mode === 'lms' && s.cfg.ghosts) msg('👻 Duh: premikaj se in pritisni SUNEK za val vetra (vsakih 8 s)', 0.3);
  }
  if (!inRoster() && !isTV && s.phase === 'round') msg('Opazuješ — pridružiš se v naslednji rundi', 0.3);
}

function roundScores() {
  const f = sess.lastFull;
  if (!f?.M) return {};
  // točke runde iz polnega stanja (1×/s), dopolnjene z dogodki od takrat (killfeed)
  return Object.fromEntries(f.M.players.map(p => [p.id, p.score + (sess.extra?.[p.id] || 0)]));
}

const fmt = sec => { const s = Math.ceil(sec); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

let msgTimer = null;
function msg(html, sec = 1.5) {
  const el = $('#msg');
  el.innerHTML = html;
  el.classList.add('on');
  clearTimeout(msgTimer);
  if (sec < 90) msgTimer = setTimeout(() => el.classList.remove('on'), sec * 1000);
}
let bannerTimer = null;
function banner(text, sec) {
  const el = $('#banner');
  el.innerHTML = text ? `<b>${esc(text)}</b>` : '';
  el.classList.toggle('on', !!text);
  clearTimeout(bannerTimer);
  if (text) bannerTimer = setTimeout(() => el.classList.remove('on'), sec * 1000);
}
function feed(html, tags = []) {
  const el = $('#feed');
  const d = document.createElement('div');
  d.innerHTML = html + tags.map(t => `<i>${esc(t)}</i>`).join('');
  el.prepend(d);
  while (el.children.length > 5) el.lastElementChild.remove();
  setTimeout(() => d.classList.add('out'), 5500);
  setTimeout(() => d.remove(), 6100);
}
/** Ikona točke odleti k zmagovalcu (k lastni točkovni vrstici). */
function flyPoint(e) {
  if (!renderer || reduced()) return;
  const p = renderer.project(e.x, 0, e.z);
  const tgt = $('#hMe').getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'ru-fly';
  el.textContent = '+' + (e.pts || 1);
  el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  $('#play').appendChild(el);
  requestAnimationFrame(() => { el.style.transform = `translate(${tgt.left + tgt.width / 2 - p.x}px, ${tgt.top - p.y}px) scale(.6)`; el.style.opacity = '0.2'; });
  setTimeout(() => el.remove(), 1000);
}

// host v skritem zavihku: requestAnimationFrame miruje, simulacija teče naprej s časovnikom (brskalnik ga lahko upočasni)
let hiddenLast = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.25, (now - hiddenLast) / 1000);
  hiddenLast = now;
  if (document.hidden && sess?.host) { hostTick(dt); last = now; }
}, 50);

main();
