/* =====================================================================
   SMUČARSKI SKOKI — match.js: tekma s prijatelji (soba, host, replay v živo,
   reakcije, TV pogled), lokalna tekma na eni napravi in »Moji skakalci«.

   Spletna tekma (host je avtoriteta):
     • stanje tekme (sport/competition.js + žirija + kdo je na vrsti) je v room.setState;
     • aktivni skakalec pošilja tok vnosov z room.send('in', paket) (sport/live-replay.js),
       gledalci simulirajo isti skok z zamikom ~300 ms; ob pridružitvi pošljejo 'need';
     • po pristanku skakalec doda potezo room.pushMove({ t:'jump', base, jk, changes, res });
       host ponovi simulacijo (verify) in zapiše UradNI rezultat; neujemanje = opozorilo v konzoli;
     • boti: host izračuna skok (deterministično), vsi ga pogledajo kot replay (?fast=1: brez);
     • prenos hosta: nov host prebere zadnje stanje in poteze, počaka na skok v teku ali ga ponovi;
     • osvežitev: joinRoom(hub.roomFromUrl()) → stanje + poteze (pretekli skoki so na voljo kot replay).
   Sporočila: 'in' (paket vnosov), 'need' ({ jk }) → jumper odgovori s celotnim tokom, 'react' ({ k }),
   'hello' ({ tv, un }) — TV naprava in odklenjene skakalnice.
   ===================================================================== */
import { hub, ui } from '../../shared/hub.js';
import * as S from '../../shared/storage.js';
import * as C from './sport/competition.js';
import { createSender, createReceiver, verify } from './sport/live-replay.js';
import {
  contestSettings, FORMATS, WIND_MODES, seriesWind, createJury, juryAfterJump, juryNewRound, simulateFromInputs, resultOf,
  sameResult, distForLead, PRIZES, contestXp, humanPlace, JUMPER_SEC, isOpen, unlockKey,
} from './contest.js';
import { simulate } from './physics.js';
import { createBot } from './bot.js';
import { InputRecorder } from './ghost.js';
import { createWind } from './wind.js';
import { DEFAULT_SKIN } from './render/jumper.js';
import * as JP from './jumpers.js';
import { fmtDist } from './scoring.js';

const $ = s => document.querySelector(s);
const esc = ui.esc;
const URLP = new URLSearchParams(location.search);
const FAST = URLP.get('fast') === '1';
const DEV_BOTS = URLP.has('bots') ? Math.max(0, Math.min(20, parseInt(URLP.get('bots'), 10) || 0)) : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString('sl-SI', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rnd = () => Math.random().toString(36).slice(2, 8);
const REACTS = [['zvon', '🔔'], ['ploskanje', '👏'], ['groza', '😱'], ['ogenj', '🔥']];
const REACT_MS = 2000;

let E = null;                // motor skoka (game.js)
let room = null, isTV = URLP.get('tv') === '1';
let lobbyView = null;
let ST = null, VER = 0;      // zadnje znano stanje tekme in verzija
let host = null;             // stanje hosta (časovniki), ko sem host
let watch = null;            // { key, jk, rcv } — kaj trenutno gledam / skačem
let myJump = null;           // { key, jk, sender }
let shownLast = null, shownDone = false;
const peers = new Map();     // id → { tv, un }
const movesByKey = new Map();   // base → poteza (zapis skoka) — za replay preteklih skokov
let local = null;            // lokalna tekma v teku

/* ===================================================================== */
/*  Shranjevanje: moji skakalci, statistika, reakcije                    */
/* ===================================================================== */

const jKey = () => 'skoki:jumpers:' + (hub.userId || 'anon');
const sKey = () => 'skoki:jstats:' + (hub.userId || 'anon');
function myJumpers() {
  const raw = S.load(jKey(), null);
  if (!raw) {
    // začetni seznam: ti (človek) in trije boti — ime je vzdevek profila, ne pravi skakalci
    const me = JP.newJumper({ name: hub.profile?.nickname?.slice(0, 24) || 'Jaz', type: 'human', flag: 'si', suit: '#e63946' }, 0.11);
    return [me, ...JP.builtinBots(3, 'meseno', 'zacetek').map((b, i) => ({ ...b, id: 'b' + i }))];
  }
  return JP.validateList(raw).list;
}
const saveJumpers = list => S.save(jKey(), list.slice(0, JP.JUMPERS_MAX));
const myStats = () => S.load(sKey(), {});
const saveStats = st => S.save(sKey(), st);

/* ===================================================================== */
/*  HUD tekme (nad igralno površino)                                     */
/* ===================================================================== */

function buildHud() {
  if ($('#mhud')) return;
  const el = document.createElement('div');
  el.id = 'mhud';
  el.className = 'sk-mhud mg-hidden';
  el.innerHTML = `
    <aside class="sk-mside" id="mside" aria-label="Sprotna lestvica"></aside>
    <div class="sk-third mg-hidden" id="mthird" aria-live="polite"></div>
    <div class="sk-ondeck" id="mdeck"></div>
    <div class="sk-mcard mg-hidden" id="mcard" role="status"></div>
    <div class="sk-mmsg mg-hidden" id="mmsg"></div>
    <div class="sk-reacts mg-hidden" id="mreacts">${REACTS.map(([k, e]) => `<button class="sk-react" data-r="${k}" aria-label="Reakcija ${e}">${e}</button>`).join('')}</div>
    <div class="sk-rfly" id="mrfly" aria-hidden="true"></div>
    <div class="sk-inter mg-hidden" id="minter"></div>`;
  $('#play').appendChild(el);
  el.addEventListener('pointerdown', e => { if (e.target.closest('button, .sk-mside, .sk-mcard, .sk-inter')) e.stopPropagation(); });
  el.querySelectorAll('[data-r]').forEach(b => b.onclick = e => { e.stopPropagation(); sendReact(b.dataset.r); });
}
const showHud = on => { $('#mhud').classList.toggle('mg-hidden', !on); document.body.classList.toggle('sk-match', on); };

function skinOf(p) {
  if (!p) return DEFAULT_SKIN;
  return { ...DEFAULT_SKIN, id: 'j-' + (p.suit || '') + (p.helmet || ''), suit: p.suit || DEFAULT_SKIN.suit, helmet: p.helmet || DEFAULT_SKIN.helmet, skiTip: p.helmet || DEFAULT_SKIN.skiTip };
}
/** HTML udeleženca: človek z ui.who (kozmetika), bot/lokalni skakalec z zastavo. */
function whoHtml(p, players = room?.players || []) {
  if (!p) return '';
  if (p.kind === 'human' && !p.meta?.local) {
    const pl = players.find(x => x.id === p.id) || ST?.people?.[p.id];
    if (pl) return ui.who({ ...pl, id: p.id });
  }
  const f = p.meta?.flag ? JP.flagOf(p.meta.flag) + ' ' : '';
  return `<span class="sk-whoflag">${f}<b>${esc(p.name)}</b>${p.kind === 'bot' ? ' <span class="mg-badge">bot</span>' : ''}</span>`;
}

/** Sprotna lestvica (desno / pod sliko), puščice ↑↓ ob spremembi mest. */
function renderSide(st, changes = {}, activeId = null) {
  const el = $('#mside');
  if (!el || !st) return;
  const rows = C.standings(st.comp || st);
  const comp = st.comp || st;
  const R = C.currentRound(comp);
  const rn = C.roundNumber(comp);
  el.innerHTML = `<div class="sk-mside__head"><b>${R.kind === 'trial' ? 'Poskusna serija' : rn + '. serija'}</b><span>${C.totalRounds(comp) > 1 ? `od ${comp.cfg.rounds}` : ''}${comp.finished ? ' · konec' : ''}</span></div>
    <ol class="sk-mside__list">${rows.map(r => {
      const p = C.participant(comp, r.id);
      const ch = changes[r.id] || 0;
      const st2 = r.status === 'ok' ? fmt1(r.total) : r.status === 'pending' ? '—' : r.status.toUpperCase() + (r.status === 'dns' && p.meta?.left ? ' (odšel)' : '');
      return `<li class="${r.id === hub.userId ? 'me' : ''} ${r.id === activeId ? 'act' : ''}" data-rid="${esc(r.id)}"><span class="rk">${r.rank ? r.rank + '.' : ''}</span><span class="nm">${whoHtml(p)}</span><span class="ar ${ch > 0 ? 'up' : ch < 0 ? 'dn' : ''}">${ch > 0 ? '↑' + ch : ch < 0 ? '↓' + -ch : ''}</span><span class="pt">${st2}</span></li>`;
    }).join('')}</ol>`;
  el.querySelectorAll('[data-rid]').forEach(li => li.onclick = () => replayOf(li.dataset.rid));
}

function renderDeck(comp, extra = '') {
  const el = $('#mdeck');
  if (!el) return;
  if (!comp || comp.finished) { el.innerHTML = extra; return; }
  const cur = C.participant(comp, C.currentId(comp));
  const nx = C.upcoming(comp, 2).map(id => C.participant(comp, id));
  el.innerHTML = `<span class="lbl">Na vrsti</span> ${cur ? whoHtml(cur) : '—'} ${nx.length ? `<span class="lbl">Naslednji</span> ${nx.map(p => whoHtml(p)).join(' · ')}` : ''} ${extra}`;
}

/** Lower-third: ime, zastava, mesto po 1. seriji in »za vodstvo potrebuje …«. */
function renderThird(comp, id, { def, gate, refGate, wind }) {
  const el = $('#mthird');
  const p = C.participant(comp, id);
  if (!p) { el.classList.add('mg-hidden'); return; }
  const rows = C.standings(comp);
  const me = rows.find(r => r.id === id);
  const leader = rows.find(r => r.rank === 1 && r.status === 'ok');
  const rn = C.roundNumber(comp);
  let need = null;
  if (leader && leader.id !== id && rn > 0) {
    const w = createWind(wind, E.P);
    need = distForLead(def, { leaderTotal: leader.total, myTotal: me?.status === 'ok' ? me.total : 0, gate, refGate, windAvg: w.mean });
  }
  el.innerHTML = `<div class="sk-third__name">${whoHtml(p)} <span class="bib">#${p.bib}</span></div>
    <div class="sk-third__sub">${rn >= 2 && me?.rank ? me.rank + '. po 1. seriji · ' : ''}zalet ${gate}${need ? ` · za vodstvo potrebuje <b>${fmt1(need)} m</b>` : leader && leader.id === id ? ' · <b>vodi</b>' : ''}</div>`;
  el.classList.remove('mg-hidden');
  return need;
}

/** Kartica rezultata (za vse). */
function showCard(comp, id, res, { juryMsg = null, verified = true } = {}) {
  const p = C.participant(comp, id);
  const el = $('#mcard');
  if (!p || !res) return;
  const rows = C.standings(comp);
  const r = rows.find(x => x.id === id);
  el.innerHTML = `<div class="sk-mcard__head">${whoHtml(p)}</div>
    <div class="sk-mcard__big"><b>${fmtDist(res.dist)}</b><span>${{ tele: 'Telemark', two: 'Na obe nogi', none: 'Trd pristanek', touch: 'Dotik z roko', fall: 'Padec' }[res.type] || ''}</span></div>
    <table><tbody>
      <tr><td>Daljava</td><td>${fmt1(res.distPts)}</td></tr>
      <tr><td>Slog <span class="sk-judges">${res.judges.map((j, i) => `<i class="${res.dropped?.includes(i) ? 'x' : ''}">${fmt1(j)}</i>`).join('')}</span></td><td>${fmt1(res.style)}</td></tr>
      <tr><td>Veter ${fmt1(res.windAvg)} m/s</td><td>${res.windPts > 0 ? '+' : ''}${fmt1(res.windPts)}</td></tr>
      <tr><td>Zalet ${res.gate ?? ''}</td><td>${res.gatePts > 0 ? '+' : ''}${fmt1(res.gatePts)}</td></tr>
      <tr class="sk-total"><td>Skupaj</td><td>${fmt1(res.total)}</td></tr>
    </tbody></table>
    <div class="sk-mcard__rank">${r?.rank ? `Trenutno <b>${r.rank}.</b> · ${fmt1(r.total)} t` : ''}${verified ? '' : ' · ⚠️ preverjeno pri hostu'}</div>
    ${juryMsg ? `<div class="sk-mcard__jury">🚩 ${esc(juryMsg)}</div>` : ''}`;
  el.classList.remove('mg-hidden');
}
const hideCard = () => $('#mcard')?.classList.add('mg-hidden');
let msgT = 0;
function msg(text, ms = 3500) {
  const el = $('#mmsg');
  el.textContent = text; el.classList.toggle('mg-hidden', !text);
  clearTimeout(msgT); if (text && ms) msgT = setTimeout(() => el.classList.add('mg-hidden'), ms);
}

/* ---------------------------------------------------------------- reakcije */
let lastReact = 0;
const reactFrom = new Map();
function sendReact(k) {
  if (!room || Date.now() - lastReact < REACT_MS) return;
  lastReact = Date.now();
  room.send('react', { k });
  const n = (S.load('skoki:reacts', 0) | 0) + 1;
  S.save('skoki:reacts', n);
  if (n >= 100) E.unlock('zvoncek');
}
function onReact(p, from) {
  const e = REACTS.find(r => r[0] === p?.k);
  if (!e) return;
  const t = reactFrom.get(from) || 0;
  if (Date.now() - t < REACT_MS - 200) return;   // omejitev tudi pri prejemniku
  reactFrom.set(from, Date.now());
  const fly = document.createElement('span');
  fly.className = 'sk-fly';
  fly.textContent = e[1];
  fly.style.left = (10 + Math.random() * 70) + '%';
  $('#mrfly').appendChild(fly);
  setTimeout(() => fly.remove(), 2600);
  if (e[0] === 'zvon') E.audio.bells(4); else E.audio.cheer(0.5);
}

/* ===================================================================== */
/*  Skupno: skok bota (izračun), parametri skoka                         */
/* ===================================================================== */

function botJump(def, hill, { gate, refGate, wind, mods, judgeSeed, bot }) {
  const b = createBot(bot);
  const rec = new InputRecorder();
  const J = simulate({ hill, P: E.P, gate, wind, mods, input: (s, t) => { const i = b.input(s); rec.push(t, i); return i; } });
  return { changes: rec.changes, res: resultOf(J.s, def, E.P, { gate, refGate, judgeSeed }) };
}
/** Prednapolnjen sprejemnik (replay iz celotnega zapisa). */
function filled(jk, changes, ticks) {
  const r = createReceiver({ jumpId: jk, delayMs: 0 });
  r.accept({ j: jk, f: 0, t: ticks + 2, c: changes, e: 1 });
  return r;
}
const hillDef = id => E.hillOf(id)?.def;
const resData = res => ({ dist: res.dist, style: res.style, windAvg: res.windAvg, fall: res.fall, type: res.type, total: res.total, gate: res.gate });

/* ===================================================================== */
/*  Spletna tekma: meni, soba, lobby                                     */
/* ===================================================================== */

function openOnline() {
  if (!$('#menu')) return;
  $('#menu').innerHTML = `<div class="mg-stack">
    <div class="sk-hero"><div class="sk-hero__icon" aria-hidden="true">🏆</div>
      <div><h1 class="mg-title">Tekma s prijatelji</h1><p class="mg-muted">2–10 ljudi, vsak skače s svojega zaslona. Med skokom vsi gledajo replay v živo in pošiljajo reakcije. Host je lahko na TV-ju.</p></div></div>
    <div class="mg-grid mg-grid--2">
      <div class="mg-card mg-stack"><h2 class="mg-title">Nova soba</h2>
        <p class="sk-note">Ustvari sobo in deli kodo ali QR. Polje lahko dopolniš z boti (0–20).</p>
        <button class="mg-btn mg-btn--primary mg-btn--big mg-btn--block" id="oCreate">Ustvari sobo</button>
        <label class="mg-check"><input type="checkbox" id="oTv" ${isTV ? 'checked' : ''}> 📺 Ta naprava je samo zaslon (TV)</label></div>
      <div class="mg-card mg-stack"><h2 class="mg-title">Pridruži se</h2>
        <form id="oJoin" class="mg-row"><input class="mg-input mg-input--code" id="oCode" maxlength="4" placeholder="KODA" autocomplete="off" aria-label="Koda sobe"><button class="mg-btn mg-btn--cyan" type="submit">Pridruži se</button></form>
        <p class="sk-note">Ali skeniraj QR kodo na hostovem zaslonu.</p></div>
    </div>
    <button class="mg-btn mg-btn--ghost" id="oBack">← Meni</button></div>`;
  $('#oBack').onclick = () => E.showMenu();
  $('#oTv').onchange = e => setTV(e.target.checked);
  $('#oCreate').onclick = createRoom;
  $('#oJoin').onsubmit = e => { e.preventDefault(); joinRoom($('#oCode').value); };
}

function setTV(on) {
  isTV = on;
  try { const u = new URL(location.href); if (on) u.searchParams.set('tv', '1'); else u.searchParams.delete('tv'); history.replaceState(null, '', u); } catch { /* */ }
  room?.send('hello', helloPayload());
}
const helloPayload = (req = 0) => ({ tv: isTV ? 1 : 0, un: E.hills().filter(h => h.def.unlock && E.hillOpen(h.def.id)).map(h => h.def.id), req, name: hub.profile?.nickname });

async function createRoom() {
  try {
    const r = await hub.createRoom({ maxPlayers: 10, settings: {}, isPublic: true });
    enterRoom(r);
  } catch (e) { ui.toast(e.message, { icon: '⚠️' }); }
}
async function joinRoom(code) {
  try {
    const r = await hub.joinRoom(code);
    enterRoom(r);
  } catch (e) {
    if (e.code === 'wrong_game') {
      const g = (await hub.games()).find(x => x.id === e.game);
      if (g) { const l = hub.link(g.path); location.href = l + (l.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(code); return; }
    }
    const m = { room_full: 'Soba je polna.', room_started: 'Tekma v tej sobi se je že začela.', room_not_found: 'Soba s to kodo ne obstaja.' }[e.code] || e.message;
    await ui.modal({ title: 'Ne gre', html: `<p>${esc(m)}</p>` });
    try { const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u); } catch { /* */ }
    E.showMenu();
  }
}
function joinFromUrl() { joinRoom(hub.roomFromUrl()); }

function enterRoom(r) {
  room = r;
  ST = null; VER = 0; shownLast = null; shownDone = false; movesByKey.clear();
  r.on('in', (p, from) => onPacket(p, from));
  r.on('need', (p, from) => { if (myJump && p?.jk === myJump.jk && from !== hub.userId) room.send('in', myJump.sender.full()); });
  r.on('react', onReact);
  r.on('hello', (p, from) => {
    if (!p || typeof p !== 'object') return;
    peers.set(from, { tv: !!p.tv, un: Array.isArray(p.un) ? p.un.filter(id => typeof id === 'string').slice(0, 20) : [] });
    if (p.req && from !== hub.userId) room.send('hello', helloPayload());
    if (lobbyView) renderLobbySide();
  });
  r.onState(({ state, version }) => {
    if (version < VER) return;
    VER = version;
    if (!state || state.v !== 1 || !state.comp) { ST = null; if (!lobbyView && !local) showLobby(); return; }
    ST = state; onState();
  });
  r.onMove(({ seq, move, user_id }) => onMove(seq, move, user_id));
  r.onStart(settings => { if (r.isHost) hostStart(settings); });
  r.on('hostChanged', ({ hostId }) => {
    const p = r.players.find(x => x.id === hostId);
    ui.toast('Novi host: ' + (p?.nickname || '?'), { icon: '👑' });
    if (hostId === hub.userId) becomeHost();
  });
  r.on('kicked', () => { room = null; ui.toast('Host te je odstranil iz sobe.', { icon: '🚪' }); leaveMatch(); });
  r.onPlayers(() => { if (lobbyView) renderLobbySide(); if (host) host.dirty = true; });
  r.send('hello', helloPayload(1));
  // ponovna povezava / pridružitev med tekmo: stanje + poteze
  (async () => {
    try {
      const { state, version } = await r.getState();
      const moves = await r.getMoves(0);
      for (const m of moves || []) indexMove(m.move, m.user_id);
      if (state && state.v === 1 && state.comp && version >= VER) { ST = state; VER = version; }
      if (ST && ST.phase !== 'done') { onState(); if (r.isHost) becomeHost(); return; }
    } catch (e) { console.warn(e); }
    showLobby();
  })();
}

function showLobby() {
  if (!room) return;
  stopWatch();
  showHud(false);
  document.body.classList.remove('sk-playing', 'sk-tv');
  $('#play').classList.add('mg-hidden');
  $('#menu').classList.remove('mg-hidden');
  $('#menu').innerHTML = `<div class="sk-lobby"><div id="lobbyMain"></div><div id="lobbySide" class="mg-stack"></div></div>`;
  lobbyView?.destroy();
  lobbyView = ui.lobby($('#lobbyMain'), room, {
    minPlayers: 1, title: 'Smučarski skoki — tekma',
    onLeave: () => { room = null; lobbyView = null; E.showMenu(); },
    settingsForm: el => { renderSettings(el); return readSettings; },
  });
  renderLobbySide();
}

let settingsEl = null, lastSettings = null;
/** Skakalnice, ki jih lahko izbere host: odprte pri hostu ALI pri vsaj enem prisotnem igralcu (dokumentirano v README). */
function roomHills() {
  const ids = new Set(room ? room.players.map(p => p.id) : []);
  const un = new Set();
  for (const [id, p] of peers) if (ids.has(id)) for (const h of p.un || []) un.add(h);
  return E.hills().filter(h => !h.def.unlock || E.hillOpen(h.def.id) || un.has(h.def.id)).map(h => h.def);
}
/** Možnosti skakalnic po skupinah (Trening / Prave skakalnice). */
function hillOptions(hills, cur, opt) {
  const groups = E.groups ? E.groups() : [{ id: 'trening', name: 'Trening' }];
  return groups.map(g => { const l = hills.filter(d => (d.group || 'trening') === g.id); return l.length ? `<optgroup label="${esc(g.name)}">${l.map(d => opt(d.id, cur, `${d.name} (K${d.k})`)).join('')}</optgroup>` : ''; }).join('');
}

function renderSettings(el) {
  settingsEl = el;
  const s = contestSettings(lastSettings || room?.settings || {}, E.hills().map(h => h.def.id));
  const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
  const hills = roomHills();
  const mine = myJumpers().filter(j => j.type === 'bot');
  el.innerHTML = `<div class="sk-form" id="cf">
    <label>Skakalnica<select class="mg-select" name="hill">${opt('random', s.hill, '🎲 Naključna')}${hillOptions(hills, s.hill, opt)}</select></label>
    <label>Format<select class="mg-select" name="format">${Object.entries(FORMATS).map(([k, f]) => opt(k, s.format, f.name)).join('')}</select></label>
    <label>V 2. serijo<select class="mg-select" name="cut">${opt(0, s.cut, 'vsi')}${[3, 5, 10, 15, 20, 30].map(v => opt(v, s.cut, 'najboljših ' + v)).join('')}</select></label>
    <label>Veter<select class="mg-select" name="wind">${Object.entries(WIND_MODES).map(([k, n]) => opt(k, s.wind, n)).join('')}</select></label>
    <label>Zaletno mesto<select class="mg-select" name="jury">${opt('auto', s.jury, 'Samodejno (žirija)')}${opt('manual', s.jury, 'Ročno (host)')}</select></label>
    <label>Ročni zalet<input class="mg-input" type="number" name="gate" min="1" max="60" value="${s.gate ?? ''}" placeholder="privzeto"></label>
    <label class="mg-check"><input type="checkbox" name="relaxed" ${s.relaxed ? 'checked' : ''}> Sproščeno (zamuda = preskoči, ne diskvalifikacija)</label>
    <h3>Boti</h3>
    <label>Število botov<select class="mg-select" name="bots">${[0, 1, 2, 3, 5, 8, 10, 15, 20].map(v => opt(v, s.bots, v)).join('')}</select></label>
    <label>Spretnost<select class="mg-select" name="botLevel">${Object.entries(JP.BOT_LEVELS).map(([k, l]) => opt(k, s.botLevel, l.name)).join('')}</select></label>
    <label>Imena botov<select class="mg-select" name="botSource">${opt('builtin', s.botSource, 'Izmišljeni boti igre')}${mine.length ? opt('mine', s.botSource, `Moji boti (${mine.length})`) : ''}</select></label>
    <label>Ekipe<select class="mg-select" name="teams">${opt(0, s.teams, 'brez')}${[2, 3, 4].map(v => opt(v, s.teams, v + ' ekipe (naključno)')).join('')}</select></label>
  </div>`;
  el.querySelector('[name=bots]').onchange = e => { if (+e.target.value >= 10 && el.querySelector('[name=cut]').value === '0') el.querySelector('[name=cut]').value = '30'; };
}
function readSettings() {
  const el = settingsEl?.querySelector('#cf');
  if (!el) return lastSettings || {};
  const v = n => el.querySelector(`[name=${n}]`);
  const s = contestSettings({
    hill: v('hill').value, format: v('format').value, cut: +v('cut').value, wind: v('wind').value, jury: v('jury').value,
    gate: v('gate').value ? +v('gate').value : null, relaxed: v('relaxed').checked, bots: +v('bots').value, botLevel: v('botLevel').value,
    botSource: v('botSource').value, teams: +v('teams').value,
  }, E.hills().map(h => h.def.id));
  if (s.jury === 'auto') s.gate = null;
  lastSettings = s;
  return s;
}
function renderLobbySide() {
  const el = $('#lobbySide');
  if (!el || !room) return;
  const tvN = [...peers.entries()].filter(([id, p]) => p.tv && room.players.some(x => x.id === id)).length;
  el.innerHTML = `<section class="mg-card mg-stack">
      <h2 class="mg-title" style="margin:0">Ta naprava</h2>
      <p class="mg-small mg-muted">${isTV ? '<b>📺 TV pogled</b>: velika slika skakalnice, lestvica ob strani, brez kontrol. Ta naprava ne skače.' : 'Skačeš s tega zaslona. Na TV-ju ali prenosniku izberi »TV pogled«.'}</p>
      <button class="mg-btn mg-btn--ghost" id="lTv" type="button">${isTV ? '📱 Skačem tudi jaz' : '📺 TV pogled'}</button>
      ${tvN ? `<p class="mg-small mg-muted">Zasloni (TV) v sobi: ${tvN}</p>` : ''}
    </section>
    <section class="mg-card mg-stack mg-small">
      <b>Kako poteka</b>
      <span class="mg-muted">Skakalci skačejo po vrsti (2. serija v obratnem vrstnem redu). Po zeleni luči imaš 10 s za štart. Med skoki drugih pošiljaj reakcije 🔔 👏 😱 🔥.</span>
    </section>`;
  $('#lTv').onclick = () => { setTV(!isTV); renderLobbySide(); };
}

/* ===================================================================== */
/*  Host                                                                 */
/* ===================================================================== */

function newHostState() { return { since: new Map(), timer: 0, busy: false, dirty: false, showUntil: 0, retryAt: 0, inherited: false }; }

async function hostStart(settings) {
  const cfg = contestSettings(settings, E.hills().map(h => h.def.id));
  const seed = room.code + ':' + Date.now().toString(36);
  if (cfg.hill === 'random') { const hs = roomHills(); cfg.hill = hs[C.hashStr(seed) % hs.length].id; }
  if (!hillDef(cfg.hill)) cfg.hill = 'bistra';
  const def = hillDef(cfg.hill);
  // ljudje (brez TV naprav) in boti
  const people = {};
  const parts = [];
  for (const p of room.players) {
    if (peers.get(p.id)?.tv || (p.id === hub.userId && isTV)) continue;
    people[p.id] = { nickname: p.nickname, avatar: p.avatar, equipped: p.equipped };
    parts.push({ id: p.id, name: p.nickname, kind: 'human' });
  }
  const bots = {};
  const src = cfg.botSource === 'mine' ? myJumpers().filter(j => j.type === 'bot') : JP.builtinBots(cfg.bots, cfg.botLevel, seed);
  for (let i = 0; i < Math.min(cfg.bots, src.length); i++) {
    const b = src[i], id = 'bot:' + i;
    bots[id] = { skill: b.skill, style: b.style, suit: b.suit, helmet: b.helmet, flag: b.flag };
    parts.push({ id, name: b.name, kind: 'bot', meta: { flag: b.flag, suit: b.suit, helmet: b.helmet } });
  }
  if (cfg.teams) {
    const order = C.shuffled(parts.map(p => p.id), seed + ':ekipe');
    order.forEach((id, i) => { parts.find(p => p.id === id).team = 'Ekipa ' + 'ABCD'[i % cfg.teams]; });
  }
  if (!parts.length) { ui.toast('Ni skakalcev (vsi so TV?).', { icon: '⚠️' }); return; }
  const F = FORMATS[cfg.format];
  const comp = C.createCompetition({ seed, participants: parts, rounds: F.rounds, trial: F.trial, cut: cfg.cut });
  const jury = createJury(def, { auto: cfg.jury === 'auto', gate: cfg.gate });
  const state = { v: 1, cfg, hill: cfg.hill, seed, comp, jury, people, bots, active: null, last: null, phase: 'jump', processed: [], msg: null };
  // soba ostane odprta za pridružitev med tekmo (gledalci)
  room.setStatus('lobby').catch(() => {});
  host = newHostState();
  await hostSave(state, true);
  hostAssign();
  hostLoop();
}

function becomeHost() {
  if (!room?.isHost || !ST || ST.phase === 'done') return;
  host = host || newHostState();
  host.inherited = true;
  // skok v teku: počakaj na potezo skakalca (do 15 s), nato dovoli ponovitev skoka
  if (ST.active && !ST.active.bot) { host.since.set(ST.active.key, Date.now()); host.retryAt = Date.now() + 15000; host.retryKey = ST.active.key; }
  hostLoop();
  // poteze, ki jih prejšnji host morda ni obdelal
  room.getMoves(0).then(ms => { for (const m of ms || []) hostMove(m.move, m.user_id); }).catch(() => {});
  if (!ST.active) hostAssign();
}

function hostLoop() {
  clearInterval(host?.timer);
  host.timer = setInterval(hostTick, 400);
}

/** Zapiši stanje (z optimističnim zaklepanjem). Pri konfliktu prebere novo stanje. */
async function hostSave(state, first = false) {
  try {
    const v = await room.setState(state, { expectedVersion: first ? null : VER });
    ST = state; VER = v;
    onState();
    return true;
  } catch (e) {
    if (e.code === 'version_conflict') {
      const { state: s2, version } = await room.getState();
      ST = s2; VER = version; onState();
    } else console.warn('setState:', e.message);
    return false;
  }
}

function hostTick() {
  if (!room?.isHost || !ST || !host) return;
  if (host.busy) return;
  const now = Date.now();
  if (ST.phase === 'show' && now >= host.showUntil) { hostAssign(); return; }
  if (ST.phase !== 'jump' || !ST.active) return;
  const A = ST.active;
  if (A.bot) {
    if (host.botKey !== A.key) { host.botKey = A.key; host.botDone = now + 4000; }   // prevzet host
    else if (now >= (host.botDone || 0)) hostApply(A.id, A.key, A.res, A.changes, true);
    return;
  }
  if (!host.since.has(A.key)) host.since.set(A.key, now);
  const present = room.players.some(p => p.id === A.id);
  const el = now - host.since.get(A.key);
  // prevzet skok v teku: po 15 s brez poteze dovoli ponovitev (nov ključ)
  if (host.retryAt && now >= host.retryAt) {
    host.retryAt = 0;
    if (host.retryKey !== A.key) return;   // skok v teku je medtem prispel
    const st = structuredClone(ST);
    st.active = { ...A, key: A.key.split('#')[0] + '#' + ((A.attempt || 0) + 1), attempt: (A.attempt || 0) + 1 };
    st.msg = 'Skok se ponovi (nov host).';
    hostSave(st);
    return;
  }
  if (el > JUMPER_SEC * 1000 || (!present && el > 20000)) {
    const st = structuredClone(ST);
    if (ST.cfg.relaxed) {
      const before = C.currentId(st.comp);
      st.comp = C.moveToEnd(st.comp, A.id);
      if (C.currentId(st.comp) === before) st.comp = C.record(st.comp, A.id, { status: 'dnf' });
    } else st.comp = C.record(st.comp, A.id, { status: 'dnf' });
    st.msg = `${C.participant(st.comp, A.id)?.name || '?'}: ${present ? 'ni dokončal skoka v 90 s' : 'odšel med skokom'} (${ST.cfg.relaxed ? 'gre na konec serije' : 'DNF'}).`;
    st.active = null; st.phase = 'show'; st.last = null;
    host.showUntil = now + 2500;
    hostSave(st);
  }
}

/** Kdo je naslednji: odsotni ljudje so preskočeni (DNS, »odšel«), boti skočijo takoj (vsi gledajo replay). */
async function hostAssign() {
  if (!room?.isHost || !ST || host.busy) return;
  host.busy = true;
  try {
    const st = structuredClone(ST);
    st.msg = null;
    for (let g = 0; g < 200; g++) {
      if (st.comp.finished) return await hostFinish(st);
      const id = C.currentId(st.comp);
      const p = C.participant(st.comp, id);
      if (p.kind === 'human' && !room.players.some(x => x.id === id)) {
        st.comp = C.markAbsent(st.comp, id, 'dns');
        st.comp.participants.find(x => x.id === id).meta = { ...(p.meta || {}), left: true };
        st.msg = `${p.name} je odšel — preskočen.`;
        continue;
      }
      break;
    }
    const id = C.currentId(st.comp);
    const p = C.participant(st.comp, id);
    const def = hillDef(st.hill), H = E.hillOf(st.hill);
    const rIdx = st.comp.round;
    const prevRound = st.jury.round ?? rIdx;
    if (prevRound !== rIdx) st.jury = juryNewRound(st.jury);
    st.jury.round = rIdx;
    const gate = st.jury.gate, refGate = st.jury.start;
    const wind = seriesWind(st.cfg.wind, st.seed + ':s' + rIdx, p.bib);
    const judgeSeed = C.hashStr(st.seed + ':' + rIdx + ':' + id);
    const key = 'k' + rIdx + '-' + p.bib + '-' + rnd();
    st.active = { id, key, gate, refGate, wind, judgeSeed, attempt: 0 };
    st.phase = 'jump'; st.last = st.last && { ...st.last, old: true };
    if (p.kind === 'bot') {
      const b = st.bots[id];
      const { changes, res } = botJump(def, H.hill, { gate, refGate, wind, judgeSeed, bot: { skill: b.skill, style: b.style, seed: judgeSeed } });
      Object.assign(st.active, { bot: 1, changes, res });
      host.botKey = key;
      host.botDone = Date.now() + (FAST ? 600 : Math.min(9000, res.ticks / 120 / 1.6 * 1000 + 2400));
      room.pushMove({ t: 'bot', base: key, id, changes, res }).catch(() => {});
    } else host.since.set(key, Date.now());
    await hostSave(st);
  } finally { host.busy = false; }
}

function hostMove(move, userId) {
  if (!room?.isHost || !ST?.active || !move) return;
  const A = ST.active;
  if (move.base !== A.key || userId !== A.id || ST.processed.includes(A.key)) return;
  if (move.t === 'nostart') {
    const st = structuredClone(ST);
    const name = C.participant(st.comp, A.id)?.name || '?';
    if (ST.cfg.relaxed) { const before = C.currentId(st.comp); st.comp = C.moveToEnd(st.comp, A.id); if (C.currentId(st.comp) === before) st.comp = C.record(st.comp, A.id, { status: 'dns' }); st.msg = `${name} ni štartal pravočasno — gre na konec serije.`; }
    else { st.comp = C.record(st.comp, A.id, { status: 'dsq' }); st.msg = `${name}: diskvalifikacija (ni štartal pravočasno).`; }
    st.processed = [...st.processed, A.key].slice(-200);
    st.active = null; st.phase = 'show'; st.last = null;
    host.showUntil = Date.now() + 2500;
    hostSave(st);
    return;
  }
  if (move.t !== 'jump' || !Array.isArray(move.changes)) return;
  const def = hillDef(ST.hill), H = E.hillOf(ST.hill);
  // host ponovi simulacijo iz vnosov: uradni rezultat je hostov
  const v = verify(ch => simulateFromInputs({ hill: H.hill, P: E.P, gate: A.gate, refGate: A.refGate, wind: A.wind, changes: ch, judgeSeed: A.judgeSeed }), move.changes, move.res, sameResult);
  if (!v.ok) console.warn('Skoki: rezultat skakalca se ne ujema s hostovo simulacijo — velja hostov.', { skakalec: move.res, host: v.result });
  hostApply(A.id, A.key, v.result, null, false, v.ok);
}

function hostApply(id, key, res, changes, isBot, ok = true) {
  if (!ST || ST.processed.includes(key) || host.applying === key) return;
  if (C.currentId(ST.comp) !== id) return;
  host.applying = key;
  const st = structuredClone(ST);
  const def = hillDef(st.hill);
  const before = C.standings(st.comp);
  const roundBefore = st.comp.round;
  st.comp = C.record(st.comp, id, { score: res.total, data: resData(res) });
  const j = juryAfterJump(st.jury, def, { dist: res.dist, name: C.participant(st.comp, id)?.name });
  st.jury = j.jury;
  if (st.comp.round !== roundBefore) { st.jury = juryNewRound(st.jury); st.jury.round = st.comp.round; }
  st.last = { id, key, res, juryMsg: j.msg, changes: C.rankChanges(before, C.standings(st.comp)), verified: ok, round: roundBefore };
  st.processed = [...st.processed, key].slice(-200);
  st.active = null; st.phase = 'show';
  host.showUntil = Date.now() + (FAST && isBot ? 700 : 4200);
  hostSave(st);
}

async function hostFinish(st) {
  st.phase = 'done'; st.active = null;
  st.prizes = C.prizes(st.comp, PRIZES);
  await hostSave(st);
  clearInterval(host.timer);
}

/* ===================================================================== */
/*  Vsi odjemalci: odziv na stanje, poteze in pakete                     */
/* ===================================================================== */

function indexMove(move, userId) {
  if (move && (move.t === 'jump' || move.t === 'bot') && Array.isArray(move.changes)) movesByKey.set(move.id || userId, { ...move, user_id: userId });
}
function onMove(seq, move, userId) {
  indexMove(move, userId);
  hostMove(move, userId);
}

function onPacket(p, from) {
  if (!ST?.active || !p || typeof p.j !== 'string' || from === hub.userId) return;
  const A = ST.active;
  if (A.id !== from || !p.j.startsWith(A.key + '.')) return;
  if (!watch || watch.key !== A.key || watch.jk !== p.j) {
    // nov skok (ali ponovni štart po osvežitvi): začni gledati znova
    startWatch(A, p.j);
    if (p.f > 0) room.send('need', { jk: p.j });   // pridružil sem se sredi skoka
  }
  watch.rcv.accept(p);
}

function stopWatch() { if (E?.playing) E.abort(); watch = null; myJump = null; }

function onState() {
  if (!ST || !room) return;
  if (ST.seed !== onState.seed) { onState.seed = ST.seed; shownLast = null; shownDone = false; }
  lobbyView?.destroy(); lobbyView = null;
  const comp = ST.comp;
  const def = hillDef(ST.hill);
  showHud(true);
  document.body.classList.toggle('sk-tv', isTV);
  E.setWide(isTV);
  const A = ST.active;
  renderSide(ST, ST.last && !ST.last.old ? ST.last.changes : {}, A?.id);
  renderDeck(comp);
  $('#mreacts').classList.toggle('mg-hidden', isTV || ST.phase === 'done' || A?.id === hub.userId);
  if (ST.msg) msg(ST.msg);
  // rezultat zadnjega skoka
  if (ST.phase === 'show' && ST.last && ST.last.key !== shownLast) {
    shownLast = ST.last.key;
    showCard(comp, ST.last.id, ST.last.res, { juryMsg: ST.last.juryMsg, verified: ST.last.verified });
    if (ST.last.juryMsg) msg(ST.last.juryMsg, 5000);
    if (ST.last.id === hub.userId && ST.last.juryMsg) E.unlock('zirija');
  }
  if (ST.phase === 'jump') hideCard();
  if (ST.phase === 'done') { $('#mthird').classList.add('mg-hidden'); if (!shownDone) { shownDone = true; finishOnline(); } return; }
  if (ST.phase !== 'jump' || !A) return;
  if (watch?.key === A.key) return;   // že gledam / skačem
  const p = C.participant(comp, A.id);
  renderThird(comp, A.id, { def, gate: A.gate, refGate: A.refGate, wind: A.wind });
  if (A.id === hub.userId && !isTV) myTurn(A, p);
  else if (A.bot) {
    if (FAST) { watch = { key: A.key, jk: A.key }; return; }
    watch = { key: A.key, jk: A.key + '.bot', rcv: filled(A.key + '.bot', A.changes, A.res.ticks) };
    runWatch(A, p, 1.6);
  } else startWatch(A, A.key + '.?');
}

function startWatch(A, jk) {
  const p = C.participant(ST.comp, A.id);
  watch = { key: A.key, jk, rcv: createReceiver({ jumpId: jk }) };
  runWatch(A, p, 1);
}
async function runWatch(A, p, speed) {
  const w = watch;
  const r = await E.jump({
    hillId: ST.hill, gate: A.gate, refGate: A.refGate, wind: A.wind, judgeSeed: A.judgeSeed, source: 'stream', stream: w.rcv, speed,
    skin: skinOf(p.kind === 'bot' ? ST.bots[p.id] : null), label: `${roundLabel(ST.comp)} · gledaš`, whoHtml: whoHtml(p), recordLine: leadLine(A), recordLabel: 'Za vodstvo', noSlowmo: true, holdMs: 600,
  });
  if (watch !== w || r.status !== 'ok') return;
  // zamik replaya (meritev za PROGRESS.md): koliko je gledalec zaostajal za tokom
  if (w.rcv.lag != null) console.info(`Skoki: replay v živo, zamik ob koncu ${Math.round(w.rcv.lag * 1000)} ms, daljava ${r.res.dist} m`);
}
const roundLabel = comp => { const n = C.roundNumber(comp); return n ? n + '. serija' : 'Poskusna serija'; };
function leadLine(A) {
  const rows = C.standings(ST.comp);
  const leader = rows.find(r => r.rank === 1 && r.status === 'ok');
  if (!leader || leader.id === A.id) return null;
  const me = rows.find(r => r.id === A.id);
  const w = createWind(A.wind, E.P);
  return distForLead(hillDef(ST.hill), { leaderTotal: leader.total, myTotal: me?.status === 'ok' ? me.total : 0, gate: A.gate, refGate: A.refGate, windAvg: w.mean });
}

async function myTurn(A, p) {
  const jk = A.key + '.' + rnd();
  const sender = createSender({ jumpId: jk, send: pkt => room?.send('in', pkt) });
  myJump = { key: A.key, jk, sender };
  watch = { key: A.key, jk, mine: true };
  E.audio.beep(true);
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive) try { navigator.vibrate(200); } catch { /* */ }
  const r = await E.jump({
    hillId: ST.hill, gate: A.gate, refGate: A.refGate, wind: A.wind, judgeSeed: A.judgeSeed, source: 'me', mine: true,
    onInput: (t, v) => sender.push(t, v), startLimit: true, relaxed: ST.cfg.relaxed,
    label: `${roundLabel(ST.comp)} · ti si na vrsti!`, whoHtml: whoHtml(p), recordLine: leadLine(A), recordLabel: 'Za vodstvo', holdMs: 800,
  });
  if (myJump?.jk !== jk) return;
  if (r.status === 'ok') {
    sender.end();
    try { await room.pushMove({ t: 'jump', base: A.key, jk, id: hub.userId, changes: r.changes, res: r.res }); }
    catch (e) { console.warn(e); ui.toast('Skoka ni bilo mogoče poslati: ' + e.message, { icon: '⚠️' }); }
  } else if (r.status === 'dsq' || r.status === 'skip') {
    await room.pushMove({ t: 'nostart', base: A.key, id: hub.userId }).catch(() => {});
  }
}

/** Replay preteklega skoka (klik na vrstico lestvice). */
function replayOf(id) {
  if (!ST && !local) return;
  if (E.playing) { ui.toast('Replay je na voljo med odmorom.', { icon: '⏸' }); return; }
  const m = local ? local.moves.get(id) : movesByKey.get(id);
  if (!m) { ui.toast('Ta skakalec še nima skoka za replay.', { icon: '🎬' }); return; }
  const comp = local ? local.comp : ST.comp;
  const p = C.participant(comp, id);
  const rcv = filled('replay', m.changes, m.res.ticks);
  E.jump({ hillId: local ? local.hill : ST.hill, gate: m.res.gate, refGate: m.refGate ?? m.res.gate, wind: m.wind || ST?.active?.wind || { mode: 'off', seed: 0 }, judgeSeed: 1, source: 'stream', stream: rcv, speed: 1.3, label: 'Replay', whoHtml: whoHtml(p), noSlowmo: true, holdMs: 400 });
}

async function finishOnline() {
  const comp = ST.comp;
  const rows = C.standings(comp);
  await podium(comp, rows);
  // poročilo hubu: vsak človek zase (enkrat)
  const me = rows.find(r => r.id === hub.userId);
  const humans = rows.filter(r => r.kind === 'human').length;
  let xp = 0;
  if (me) {
    const hp = humanPlace(rows, hub.userId);
    xp = contestXp({ place: me.rank, humans });
    hub.reportGame({ won: hp === 1, players: humans, score: Math.round(me.total), daily: false });
    hub.awardXp(xp, 'skoki: tekma');
    hub.reportEvent('skoki:tekma', 1);
    if (me.rank && me.rank <= 3) hub.reportEvent('skoki:oder', 1);
    if (me.rank === 1) {
      hub.reportEvent('skoki:zmaga', 1);
      E.unlock('zmaga');
      if (humans >= 10) E.unlock('deset');
      const r1 = C.standings(comp, { uptoRound: comp.rounds.findIndex(R => R.kind === 'score') }).find(r => r.id === hub.userId);
      if (comp.cfg.rounds >= 2 && r1?.rank >= 4) E.unlock('obrat');
    }
  }
  const choice = await results(comp, rows, { xp, again: room?.isHost ? 'Nova tekma' : 'Nazaj v sobo', prizes: ST.prizes });
  if (choice === 'again' && room?.isHost) { ST = null; VER = 0; await room.setState({ v: 0 }, {}).catch(() => {}); room.setStatus('lobby').catch(() => {}); room.send('newmatch', {}); }
  showLobby();
}

/** Razglasitev v slogu prenosa: oder za prve tri, zastave, fanfara, konfeti. */
async function podium(comp, rows) {
  const top = rows.filter(r => r.rank && r.rank <= 3).slice(0, 3);
  const el = $('#minter');
  el.innerHTML = `<div class="sk-podium"><h2 class="mg-title">Razglasitev</h2><div class="sk-podium__cols">${[top[1], top[0], top[2]].map((r, i) => r ? `<div class="sk-podium__col p${[2, 1, 3][i]}"><div class="who">${whoHtml(C.participant(comp, r.id))}</div><div class="pts">${fmt1(r.total)} t</div><div class="blk">${r.rank}</div></div>` : '<div></div>').join('')}</div></div>`;
  el.classList.remove('mg-hidden');
  E.audio.fanfare(); E.audio.cheer(1); E.audio.bells(10);
  try { ui.winFx('confetti'); } catch { /* */ }
  await sleep(4200);
  el.classList.add('mg-hidden');
}

function results(comp, rows, { xp = 0, again = 'Še enkrat', prizes = [] } = {}) {
  const players = rows.map(r => {
    const p = C.participant(comp, r.id);
    const pl = r.kind === 'human' && !p.meta?.local ? (room?.players.find(x => x.id === r.id) || ST?.people?.[r.id]) : null;
    const base = pl ? { ...pl } : { nickname: (p.meta?.flag ? JP.flagOf(p.meta.flag) + ' ' : '') + p.name, avatar: { emoji: r.kind === 'bot' ? '🤖' : '🎿', color: p.meta?.suit || '#4fc3f7' } };
    return { ...base, id: r.id, scoreText: r.status === 'ok' ? `${fmt1(r.total)} t (${r.scores.filter(x => x != null).map(fmt1).join(' + ')})` : r.status.toUpperCase(), xp: r.id === hub.userId ? xp : 0 };
  });
  const teams = C.teamStandings(comp);
  const extra = `${prizes.length ? `<h3 class="mg-title">Posebne nagrade</h3><ul class="sk-prizes">${prizes.map(z => `<li>${z.icon} <b>${esc(z.title)}</b>: ${whoHtml(C.participant(comp, z.id))} <span class="mg-muted">${esc(z.text)}</span></li>`).join('')}</ul>` : ''}
    ${teams.length ? `<h3 class="mg-title">Ekipe</h3><ol class="sk-prizes">${teams.map(t => `<li><b>${esc(t.team)}</b> · ${fmt1(t.total)} t</li>`).join('')}</ol>` : ''}`;
  return ui.results(players, { title: 'Rezultati tekme', again, hub: !local, extraHtml: extra });
}

function leaveMatch() {
  stopWatch();
  clearInterval(host?.timer); host = null;
  showHud(false);
  E.showMenu();
}

/* ===================================================================== */
/*  Lokalna tekma (ena naprava, deluje offline)                          */
/* ===================================================================== */

function openLocal(preset = null) {
  const list = myJumpers();
  const opts = local?.lastCfg || preset || { ...contestSettings({}, []), sel: list.map(j => j.id), replay: 'fast' };
  const hills = E.hills().filter(h => E.hillOpen(h.def.id)).map(h => h.def);
  const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
  $('#menu').innerHTML = `<div class="mg-stack">
    <div class="sk-hero"><div class="sk-hero__icon" aria-hidden="true">🖥️</div>
      <div><h1 class="mg-title">Lokalna tekma</h1><p class="mg-muted">Tvoji skakalci na tej napravi. Ljudje skačejo po vrsti, boti sami. Ne gre na lestvice in ne daje ghostov.</p></div></div>
    <div class="mg-grid mg-grid--2">
      <div class="mg-card mg-stack"><div class="mg-row mg-row--between"><h2 class="mg-title" style="margin:0">Skakalci</h2>
        <label class="mg-check"><input type="checkbox" id="lAll"> vsi</label></div>
        <div class="sk-pick" id="lPick">${list.map(j => `<label class="mg-check"><input type="checkbox" value="${esc(j.id)}" ${opts.sel?.includes(j.id) ? 'checked' : ''}> ${JP.flagOf(j.flag)} ${esc(j.name)} <span class="mg-badge ${j.type === 'bot' ? '' : 'mg-badge--cyan'}">${j.type === 'bot' ? 'bot ' + Math.round(j.skill * 100) + ' %' : 'človek'}</span></label>`).join('') || '<p class="mg-muted">Seznam je prazen.</p>'}</div>
        <button class="mg-btn mg-btn--ghost" id="lEdit">🎽 Uredi Moje skakalce</button></div>
      <div class="mg-card"><div class="sk-form" id="lf">
        <label>Skakalnica<select class="mg-select" name="hill">${opt('random', opts.hill, '🎲 Naključna')}${hillOptions(hills, opts.hill, opt)}</select></label>
        <label>Format<select class="mg-select" name="format">${Object.entries(FORMATS).map(([k, f]) => opt(k, opts.format, f.name)).join('')}</select></label>
        <label>V 2. serijo<select class="mg-select" name="cut">${opt(0, opts.cut, 'vsi')}${[3, 5, 10, 15, 20, 30].map(v => opt(v, opts.cut, 'najboljših ' + v)).join('')}</select></label>
        <label>Veter<select class="mg-select" name="wind">${Object.entries(WIND_MODES).map(([k, n]) => opt(k, opts.wind, n)).join('')}</select></label>
        <label>Zaletno mesto<select class="mg-select" name="jury">${opt('auto', opts.jury, 'Samodejno (žirija)')}${opt('manual', opts.jury, 'Ročno')}</select></label>
        <label>Ročni zalet<input class="mg-input" type="number" name="gate" min="1" max="40" value="${opts.gate ?? ''}" placeholder="privzeto"></label>
        <label>Skoki botov<select class="mg-select" name="replay">${opt('live', opts.replay, 'Gledam v živo')}${opt('fast', opts.replay, 'Pospešeno (2×)')}${opt('skip', opts.replay, 'Preskoči (le rezultat)')}</select></label>
        <label class="mg-check"><input type="checkbox" name="relaxed" ${opts.relaxed ? 'checked' : ''}> Sproščeno (zamuda = preskoči)</label>
      </div></div>
    </div>
    <button class="mg-btn mg-btn--primary mg-btn--big" id="lGo">Začni tekmo</button>
    <button class="mg-btn mg-btn--ghost" id="lBack">← Meni</button></div>`;
  const boxes = () => [...$('#lPick').querySelectorAll('input[type=checkbox]')];
  $('#lAll').onchange = e => boxes().forEach(b => { b.checked = e.target.checked; });
  $('#lEdit').onclick = () => openJumpers();
  $('#lBack').onclick = () => E.showMenu();
  $('#lGo').onclick = () => {
    const f = $('#lf'), v = n => f.querySelector(`[name=${n}]`);
    const cfg = { ...contestSettings({ hill: v('hill').value, format: v('format').value, cut: +v('cut').value, wind: v('wind').value, jury: v('jury').value, gate: v('gate').value ? +v('gate').value : null, relaxed: v('relaxed').checked }, hills.map(d => d.id)), replay: v('replay').value };
    cfg.sel = boxes().filter(b => b.checked).map(b => b.value);
    const sel = list.filter(j => cfg.sel.includes(j.id));
    if (!sel.length) { ui.toast('Izberi vsaj enega skakalca.', { icon: '🎿' }); return; }
    if (cfg.hill === 'random') cfg.hill = hills[Math.floor(Math.random() * hills.length)].id;
    runLocal(cfg, sel);
  };
}

async function runLocal(cfg, sel) {
  const seed = 'lokalna:' + Date.now().toString(36);
  const def = hillDef(cfg.hill), H = E.hillOf(cfg.hill);
  const F = FORMATS[cfg.format];
  const parts = sel.map(j => ({ id: j.id, name: j.name, kind: j.type === 'bot' ? 'bot' : 'human', meta: { flag: j.flag, suit: j.suit, helmet: j.helmet, local: true } }));
  local = { cfg, lastCfg: { ...cfg, hill: cfg.hill }, hill: cfg.hill, comp: C.createCompetition({ seed, participants: parts, rounds: F.rounds, trial: F.trial, cut: cfg.cut }), jury: createJury(def, { auto: cfg.jury === 'auto', gate: cfg.gate }), moves: new Map(), jumps: [], byId: new Map(sel.map(j => [j.id, j])) };
  const L = local;
  showHud(true);
  document.body.classList.remove('sk-tv');
  $('#mreacts').classList.add('mg-hidden');
  let lastRound = 0;
  while (!L.comp.finished && local === L) {
    const id = C.currentId(L.comp);
    const p = C.participant(L.comp, id);
    const j = L.byId.get(id);
    if (L.comp.round !== lastRound) { L.jury = juryNewRound(L.jury); lastRound = L.comp.round; msg(roundLabel(L.comp) + ' — obratni vrstni red, najboljši skoči zadnji.', 4000); }
    const gate = L.jury.gate, refGate = L.jury.start;
    const wind = seriesWind(cfg.wind, seed + ':s' + L.comp.round, p.bib);
    const judgeSeed = C.hashStr(seed + ':' + L.comp.round + ':' + id);
    renderSide({ comp: L.comp }, L.changes || {}, id);
    renderDeck(L.comp);
    hideCard();
    const lead = (() => {
      const rows = C.standings(L.comp), leader = rows.find(r => r.rank === 1 && r.status === 'ok'), me = rows.find(r => r.id === id);
      return leader && leader.id !== id ? distForLead(def, { leaderTotal: leader.total, myTotal: me?.status === 'ok' ? me.total : 0, gate, refGate, windAvg: createWind(wind, E.P).mean }) : null;
    })();
    let r;
    if (p.kind === 'bot') {
      const b = botJump(def, H.hill, { gate, refGate, wind, judgeSeed, bot: { skill: j.skill, style: j.style, seed: judgeSeed } });
      if (cfg.replay === 'skip') r = { status: 'ok', res: b.res, changes: b.changes };
      else {
        renderThird(L.comp, id, { def, gate, refGate, wind });
        r = await E.jump({ hillId: cfg.hill, gate, refGate, wind, judgeSeed, source: 'stream', stream: filled('b', b.changes, b.res.ticks), speed: cfg.replay === 'fast' ? 2 : 1, skin: skinOf(j), label: `${roundLabel(L.comp)} · bot`, whoHtml: whoHtml(p), recordLine: lead, recordLabel: 'Za vodstvo', noSlowmo: true, holdMs: 500 });
        if (r.status === 'abort') return;
        r = { status: 'ok', res: b.res, changes: b.changes };   // uradno: izračun (enak replayu)
      }
    } else {
      // vmesni zaslon: »Na vrsti: <ime>, pritisni za štart«
      // skakalnica v ozadju (skakalec čaka na zaletnem mestu), dokler igralec ne pritisne za štart
      E.jump({ hillId: cfg.hill, gate, refGate, wind, judgeSeed, source: 'stream', stream: createReceiver({ jumpId: 'cakam' }), skin: skinOf(j), label: roundLabel(L.comp), whoHtml: whoHtml(p) });
      await sleep(60);
      renderThird(L.comp, id, { def, gate, refGate, wind });
      const go = await interstitial(p, j);
      if (local !== L) return;
      if (!go) { leaveLocal(); return; }
      r = await E.jump({ hillId: cfg.hill, gate, refGate, wind, judgeSeed, source: 'me', mine: true, startLimit: true, relaxed: cfg.relaxed, skin: skinOf(j), label: `${roundLabel(L.comp)} · ${j.name}`, whoHtml: whoHtml(p), recordLine: lead, recordLabel: 'Za vodstvo', holdMs: 800 });
      if (r.status === 'abort') return;
    }
    if (local !== L) return;
    const before = C.standings(L.comp);
    if (r.status === 'dsq') { L.comp = C.record(L.comp, id, { status: 'dsq' }); msg(`${p.name}: diskvalifikacija (ni štartal v 10 s).`); continue; }
    if (r.status === 'skip') { const c0 = C.currentId(L.comp); L.comp = C.moveToEnd(L.comp, id); if (C.currentId(L.comp) === c0) L.comp = C.record(L.comp, id, { status: 'dns' }); msg(`${p.name} gre na konec serije.`); continue; }
    L.comp = C.record(L.comp, id, { score: r.res.total, data: resData(r.res) });
    L.moves.set(id, { changes: r.changes, res: r.res, wind, refGate });
    L.jumps.push({ id, dist: r.res.dist, fall: r.res.fall });
    const jr = juryAfterJump(L.jury, def, { dist: r.res.dist, name: p.name });
    L.jury = jr.jury;
    L.changes = C.rankChanges(before, C.standings(L.comp));
    renderSide({ comp: L.comp }, L.changes, null);
    showCard(L.comp, id, r.res, { juryMsg: jr.msg });
    await sleep(p.kind === 'bot' && cfg.replay === 'skip' ? 1200 : 3000);
  }
  if (local !== L) return;
  // konec: statistika po skakalcu, razglasitev, rezultati, hub
  const rows = C.standings(L.comp);
  saveStats(JP.addCompetitionStats(myStats(), { hill: cfg.hill, jumps: L.jumps, standings: rows }));
  const humans = rows.filter(r => r.kind === 'human');
  const bestHuman = Math.max(0, ...humans.filter(r => r.status === 'ok').map(r => r.total));
  hub.reportGame({ won: rows[0]?.kind === 'human' && rows[0].rank === 1, players: Math.max(1, humans.length), score: Math.round(bestHuman), daily: false });
  await podium(L.comp, rows);
  const prizes = C.prizes(L.comp, PRIZES);
  const ch = await results(L.comp, rows, { again: 'Nova lokalna tekma', prizes });
  showHud(false);
  local = null;
  if (ch === 'again') openLocal(L.lastCfg); else E.showMenu();
}

function interstitial(p, j) {
  return new Promise(res => {
    const el = $('#minter');
    el.innerHTML = `<div class="sk-inter__box"><span class="mg-muted">Na vrsti</span><h2 class="mg-title">${JP.flagOf(j.flag)} ${esc(j.name)}</h2>
      <p class="mg-muted">${roundLabel(local.comp)} · štartna številka ${p.bib}</p>
      <button class="mg-btn mg-btn--primary mg-btn--big" data-i="go">Pritisni za štart</button>
      <button class="mg-btn mg-btn--ghost mg-btn--small" data-i="stop">Prekini tekmo</button></div>`;
    el.classList.remove('mg-hidden');
    el.querySelectorAll('[data-i]').forEach(b => b.onclick = async e => {
      e.stopPropagation();
      if (b.dataset.i === 'stop' && !(await ui.confirm('Prekinem lokalno tekmo?', { danger: true }))) return;
      el.classList.add('mg-hidden');
      res(b.dataset.i === 'go');
    });
  });
}
function leaveLocal() { local = null; showHud(false); if (E.playing) E.abort(); E.showMenu(); }

/* ===================================================================== */
/*  Moji skakalci (urejevalnik, deljenje, statistika)                    */
/* ===================================================================== */

function openJumpers() {
  let list = myJumpers();
  const stats = myStats();
  const save = () => { saveJumpers(list); render(); };
  const render = () => {
    const table = JP.statsTable(list, stats);
    const hillName = id => hillDef(id)?.name || id;
    $('#menu').innerHTML = `<div class="mg-stack">
      <div class="sk-hero"><div class="sk-hero__icon" aria-hidden="true">🎽</div>
        <div><h1 class="mg-title">Moji skakalci</h1><p class="mg-muted">Sestavi svoj seznam (do ${JP.JUMPERS_MAX}): ljudje skačejo na tej napravi, boti sami. Seznam je shranjen samo na tej napravi — deliš ga z izvozom.</p></div></div>
      <div class="mg-card">
        <div class="mg-row mg-row--between"><h2 class="mg-title" style="margin:0">Seznam (${list.length}/${JP.JUMPERS_MAX})</h2>
          <div class="mg-row"><button class="mg-btn mg-btn--green mg-btn--small" id="jAdd" ${list.length >= JP.JUMPERS_MAX ? 'disabled' : ''}>+ Dodaj</button>
          <button class="mg-btn mg-btn--small" id="jExp">Izvozi</button><button class="mg-btn mg-btn--small" id="jImp">Uvozi</button></div></div>
        <table class="mg-table sk-jtable"><thead><tr><th></th><th>Skakalec</th><th>Tip</th><th class="mg-num">Skoki</th><th class="mg-num">Zmage</th><th class="mg-num">Oder</th><th>Najdaljši</th><th></th></tr></thead>
        <tbody>${list.map((j, i) => { const s = stats[j.id] || { jumps: 0, wins: 0, podiums: 0, best: {} }; const best = Object.entries(s.best || {}).sort((a, b) => b[1] - a[1])[0];
          return `<tr><td><span class="sk-dot" style="--a:${j.suit};--b:${j.helmet}"></span></td><td>${JP.flagOf(j.flag)} <b>${esc(j.name)}</b></td>
          <td>${j.type === 'bot' ? `bot · ${Math.round(j.skill * 100)} % · ${esc(JP.BOT_STYLES_NAMES[j.style] || '')}` : 'človek'}</td>
          <td class="mg-num">${s.jumps}</td><td class="mg-num">${s.wins}</td><td class="mg-num">${s.podiums}</td><td>${best ? fmtDist(best[1]) + ' · ' + esc(hillName(best[0])) : '—'}</td>
          <td class="sk-jbtns"><button class="mg-btn mg-btn--ghost mg-btn--small" data-e="${i}" aria-label="Uredi">✏️</button><button class="mg-btn mg-btn--ghost mg-btn--small" data-d="${i}" aria-label="Podvoji">⧉</button><button class="mg-btn mg-btn--ghost mg-btn--small" data-u="${i}" aria-label="Gor" ${i ? '' : 'disabled'}>↑</button><button class="mg-btn mg-btn--ghost mg-btn--small" data-x="${i}" aria-label="Izbriši">✕</button></td></tr>`; }).join('')}</tbody></table>
      </div>
      <div class="mg-card"><h2 class="mg-title">Sezona tvoje lige</h2>
        <table class="mg-table"><thead><tr><th>#</th><th>Skakalec</th><th class="mg-num">Tekme</th><th class="mg-num">Zmage</th><th class="mg-num">Stopničke</th><th class="mg-num">Skoki</th><th class="mg-num">Padci</th><th class="mg-num">Najdaljši</th></tr></thead>
        <tbody>${table.map((r, i) => `<tr><td class="mg-rank">${i + 1}.</td><td>${JP.flagOf(r.flag)} ${esc(r.name)}</td><td class="mg-num">${r.comps}</td><td class="mg-num">${r.wins}</td><td class="mg-num">${r.podiums}</td><td class="mg-num">${r.jumps}</td><td class="mg-num">${r.falls}</td><td class="mg-num">${r.bestAll ? fmtDist(r.bestAll) : '—'}</td></tr>`).join('')}</tbody></table></div>
      <div class="mg-row"><button class="mg-btn mg-btn--primary" id="jLocal">🖥️ Lokalna tekma</button><button class="mg-btn mg-btn--ghost" id="jBack">← Meni</button></div></div>`;
    $('#jBack').onclick = () => E.showMenu();
    $('#jLocal').onclick = () => openLocal();
    $('#jAdd').onclick = async () => { const j = await editJumper(JP.newJumper({ name: 'Skakalec ' + (list.length + 1) })); if (j) { list.push(j); save(); } };
    $('#jExp').onclick = () => exportDialog(list);
    $('#jImp').onclick = async () => { const imp = await importDialog(); if (imp) { list = imp; save(); } };
    $('#menu').querySelectorAll('[data-e]').forEach(b => b.onclick = async () => { const j = await editJumper(list[+b.dataset.e]); if (j) { list[+b.dataset.e] = j; save(); } });
    $('#menu').querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (list.length >= JP.JUMPERS_MAX) return; const s = list[+b.dataset.d]; list.splice(+b.dataset.d + 1, 0, JP.newJumper({ ...s, id: undefined, name: (s.name + ' 2').slice(0, 24) })); save(); });
    $('#menu').querySelectorAll('[data-u]').forEach(b => b.onclick = () => { const i = +b.dataset.u; [list[i - 1], list[i]] = [list[i], list[i - 1]]; save(); });
    $('#menu').querySelectorAll('[data-x]').forEach(b => b.onclick = async () => { if (await ui.confirm(`Izbrišem skakalca »${list[+b.dataset.x].name}«?`, { danger: true })) { list.splice(+b.dataset.x, 1); save(); } });
  };
  render();
}

async function editJumper(j) {
  const flags = Object.keys(JP.FLAGS);
  const html = `<form class="sk-form" id="je" onsubmit="return false">
    <label>Ime<input class="mg-input" name="name" maxlength="24" value="${esc(j.name)}" required></label>
    <label>Zastava<select class="mg-select" name="flag">${flags.map(f => `<option value="${f}" ${f === j.flag ? 'selected' : ''}>${JP.FLAGS[f]} ${f}</option>`).join('')}</select></label>
    <label>Dres<input type="color" name="suit" value="${j.suit}"></label>
    <label>Čelada<input type="color" name="helmet" value="${j.helmet}"></label>
    <label>Tip<select class="mg-select" name="type"><option value="human" ${j.type === 'human' ? 'selected' : ''}>Človek (skače nekdo za to napravo)</option><option value="bot" ${j.type === 'bot' ? 'selected' : ''}>Bot</option></select></label>
    <label>Spretnost bota <input type="range" name="skill" min="0" max="1" step="0.05" value="${j.skill}"></label>
    <label>Značaj bota<select class="mg-select" name="style">${Object.entries(JP.BOT_STYLES_NAMES).map(([k, n]) => `<option value="${k}" ${k === j.style ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    <p class="mg-small mg-muted">Barvi dresa in čelade sta le videz v tekmi (ločeno od kozmetike iz trgovine).</p></form>`;
  const ok = await ui.modal({ title: 'Skakalec', html, actions: [{ label: 'Prekliči', value: false }, { label: 'Shrani', value: true, kind: 'primary' }], onOpen: () => { } });
  if (!ok) return null;
  const f = document.querySelector('#je');
  if (!f) return null;
  const v = n => f.querySelector(`[name=${n}]`).value;
  return JP.normalizeJumper({ id: j.id, name: v('name'), flag: v('flag'), suit: v('suit'), helmet: v('helmet'), type: v('type'), skill: +v('skill'), style: v('style') }) || j;
}

function exportDialog(list) {
  const code = JP.exportCode(list);
  ui.modal({ title: 'Izvoz seznama', html: `<p class="mg-small mg-muted">Kopiraj kodo in jo pošlji prijatelju (ali prenesi datoteko JSON).</p>
    <textarea class="mg-input sk-code" readonly rows="5" onfocus="this.select()">${esc(code)}</textarea>
    <div class="mg-row"><button class="mg-btn mg-btn--small" id="xCopy">Kopiraj kodo</button><button class="mg-btn mg-btn--small" id="xFile">Prenesi JSON</button></div>`,
  onOpen: () => {
    document.querySelector('#xCopy').onclick = async () => { try { await navigator.clipboard.writeText(code); ui.toast('Koda kopirana.', { icon: '📋' }); } catch { /* */ } };
    document.querySelector('#xFile').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JP.exportJson(list)], { type: 'application/json' }));
      a.download = 'moji-skakalci.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  } });
}

async function importDialog() {
  let fileText = null;
  const ok = await ui.modal({ title: 'Uvoz seznama', html: `<p class="mg-small mg-muted">Prilepi kodo (SKOKI1:…) ali izberi datoteko JSON. Uvoz <b>zamenja</b> tvoj seznam.</p>
    <textarea class="mg-input sk-code" id="iCode" rows="4" placeholder="SKOKI1:…"></textarea>
    <input type="file" id="iFile" accept=".json,application/json">`,
  actions: [{ label: 'Prekliči', value: false }, { label: 'Uvozi', value: true, kind: 'primary' }],
  onOpen: () => {
    document.querySelector('#iFile').onchange = async e => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (f.size > JP.IMPORT_MAX_CHARS) { ui.toast('Datoteka je prevelika.', { icon: '⚠️' }); e.target.value = ''; return; }
      fileText = await f.text();
    };
  } });
  if (!ok) return null;
  const text = fileText || document.querySelector('#iCode')?.value || '';
  const r = JP.importList(text);
  if (r.errors.length || !r.list.length) { await ui.modal({ title: 'Uvoz ni uspel', html: `<p>${esc(r.errors.join(' ') || 'Seznam je prazen.')}</p>` }); return null; }
  if (r.warnings.length) ui.toast(r.warnings.join(' '), { icon: 'ℹ️', duration: 4500 });
  ui.toast(`Uvoženih ${r.list.length} skakalcev.`, { icon: '🎽' });
  return r.list;
}

/* ===================================================================== */

function onMenu() {
  // povratek v meni (npr. gumb Meni): soba ostane, a HUD se skrije
  if (local) { local = null; }
  showHud(false);
  document.body.classList.remove('sk-tv');
}

export function initMatch(engine) {
  E = engine;
  buildHud();
  // razvojno: ?bots=9 → hitra lokalna tekma (ti + N izmišljenih botov), ?fast=1 → boti brez replaya
  if (DEV_BOTS != null && !hub.roomFromUrl()) {
    setTimeout(() => {
      const me = JP.newJumper({ name: hub.profile?.nickname?.slice(0, 24) || 'Jaz', type: 'human' }, 0.5);
      const bots = JP.builtinBots(DEV_BOTS, 'meseno', 'dev');
      const cfg = { ...contestSettings({ hill: URLP.get('hill') || 'bistra', format: 'two' }, E.hills().map(h => h.def.id)), replay: FAST ? 'skip' : 'fast' };
      runLocal(cfg, [me, ...bots]);
    }, 50);
  }
  return { openOnline, openLocal, openJumpers, joinFromUrl, onMenu };
}
