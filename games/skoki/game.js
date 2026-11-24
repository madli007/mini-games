/* =====================================================================
   SMUČARSKI SKOKI — game.js: meni, stanja igre (zaletno mesto, skok,
   počasni posnetek, rezultat, replay, pavza), trening z ghosti, rekord
   skakalnice (3 skoki, najboljši na lestvico), hub (lestvice, ghosti, XP,
   dosežki, naloge), namigi, komentator, zvok.
   Razvojni parametri: ?hill=<id> ?debug=1 ?bot=0.7 ?q=low|med|high ?offline=1
   ===================================================================== */
import { hub, ui } from '../../shared/hub.js';
import * as S from '../../shared/storage.js';
import { buildHill, validateHill } from './hill.js';
import { createJump, STEP, TPS, makeClock } from './physics.js';
import { judgeScores } from './judges.js';
import { scoreJump, encodeBoard, decodeBoard, fmtBoard, fmtDist, fmtPts } from './scoring.js';
import { InputRecorder, encodeGhost, decodeGhost, ghostJump, GHOST_MAX } from './ghost.js';
import { createBot, BOT_ALPHA } from './bot.js';
import { createWind } from './wind.js';
import { snapshot, gateSnapshot, lerpSnap, replayCuts, cutAt } from './replay.js';
import { commentator, landingGroup } from './texts.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Renderer, detectQuality, QUALITY, QUALITY_ORDER, reducedMotion } from './render/scene.js';
import { DEFAULT_SKIN } from './render/jumper.js';

const GAME = 'skoki';
const $ = s => document.querySelector(s);
const esc = ui.esc;
const URLP = new URLSearchParams(location.search);
const DEBUG = URLP.get('debug') === '1';
const BOT_SKILL = URLP.has('bot') ? Math.max(0, Math.min(1, parseFloat(URLP.get('bot')) || 0.7)) : null;
const Q_PARAM = ['low', 'med', 'high'].includes(URLP.get('q')) ? URLP.get('q') : null;
const IS_TOUCH = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString('sl-SI', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt1(Math.abs(v));

/* ------------------------------------------------------------ dosežki */
const ACH = [
  { key: 'prvi-skok', title: 'Prvi skok', icon: '🎿', desc: 'Skoči svoj prvi skok' },
  { key: 'k-tocka', title: 'K-točka', icon: '🎯', desc: 'Prvič skoči do K-točke' },
  { key: 'hs', title: 'Do HS', icon: '🚀', desc: 'Skoči do HS brez padca' },
  { key: 'popoln-odriv', title: 'Popoln odriv', icon: '✨', desc: 'Odriv v oknu ±25 ms' },
  { key: 'telemark-19', title: 'Telemark za 19', icon: '🧑‍⚖️', desc: 'Vsaj štirje sodniki ti dajo 19 ali več' },
  { key: 'snezni-angel', title: 'Snežni angel', icon: '👼', desc: 'Prvi padec' },
  { key: 'vse-tri', title: 'Vse tri', icon: '🏔️', desc: 'Čez K na vseh treh skakalnicah' },
  { key: 'zavora', title: 'Zavora', icon: '🪂', desc: 'Pristani pred polovico K-točke' },
  { key: 'veter-v-hrbet', title: 'Veter v hrbet', icon: '🌬️', desc: 'Čez K s hrbtnim vetrom vsaj 2 m/s' },
  { key: 'stotica', title: 'Stotica', icon: '💯', desc: 'Skoči 100 skokov' },
];
const achDef = k => ACH.find(a => a.key === k);
// že odklenjeni (brez ponovnih vpisov → 409 v konzoli na Supabase)
const unlocked = new Set();
const unlock = k => { if (unlocked.has(k)) return; unlocked.add(k); return hub.unlock(k, { title: achDef(k).title, icon: achDef(k).icon }); };

/* ------------------------------------------------------------ nastavitve in statistika */
const DEF_SETTINGS = { quality: 'auto', sound: true, music: true, post: true, fps: false, tilt: false, wind: 'random', windSpeed: 1, ghostMine: true };
const settings = { ...DEF_SETTINGS, ...S.load('skoki:settings', {}) };
const saveSettings = () => S.save('skoki:settings', settings);
const stats = S.load('skoki:stats', { jumps: 0, falls: 0, overK: {}, hints: 0 });
const saveStats = () => S.save('skoki:stats', stats);
// lokalni najboljši skok (ghost) na skakalnico — vezan na profil, da si ga dva profila v istem brskalniku ne delita
const bestKey = id => 'skoki:best:' + (hub.userId || 'anon') + ':' + id;
// šteje le »Rekord skakalnice« (trening ne postavlja rekordov); rekord iz starejše fizike (paramsVersion) ne velja
const localBest = id => { const b = S.load(bestKey(id), null); return b && b.pv === P?.paramsVersion ? b : null; };

/* ------------------------------------------------------------ globalno */
let P = null;             // parametri fizike
let HILLS = [];           // [{ def, hill }]
let renderer = null, input = null;
const audio = new Audio();
audio.setMuted(!settings.sound);
const say = commentator();
let board = null;

const G = {
  state: 'menu', hillId: null, mode: 'train', gate: 12,
  J: null, rec: null, hist: [], ghosts: [], wind: null, windObj: null,
  session: { jumps: [], train: {}, xpHs: {} }, record: null,
  lastJump: null, lastReport: 0, friendGhost: null, slow: null, replay: null,
  gateT: 0, paused: false, hintsOn: false, hintText: '', bot: null,
};
const clock = makeClock();
const hillOf = id => HILLS.find(h => h.def.id === id);

/* ===================================================================== */
/*  Nalaganje                                                            */
/* ===================================================================== */

async function loadData() {
  const base = new URL('./', import.meta.url);
  P = await (await fetch(new URL('physics-params.json', base), { cache: 'no-cache' })).json();
  if (DEBUG) { const saved = S.load('skoki:params', null); if (saved && saved.paramsVersion === P.paramsVersion) P = saved; }
  const idx = await (await fetch(new URL('hills/index.json', base), { cache: 'no-cache' })).json();
  const defs = await Promise.all(idx.hills.map(async f => (await fetch(new URL('hills/' + f, base), { cache: 'no-cache' })).json()));
  HILLS = [];
  for (const def of defs) {
    const errs = validateHill(def);
    if (errs.length) { console.warn('Skakalnica ' + def.id + ':', errs); continue; }
    HILLS.push({ def, hill: buildHill(def) });
  }
}

/* ===================================================================== */
/*  Meni                                                                 */
/* ===================================================================== */

function showMenu() {
  G.state = 'menu';
  document.body.classList.remove('sk-playing');
  $('#play').classList.add('mg-hidden');
  $('#menu').classList.remove('mg-hidden');
  if (settings.music) audio.menuMusic(true);
  audio.silence(); audio.setLoops(false);
  renderMenu();
}

const THEME_COLORS = { brezova: ['#3f7a5c', '#10261d'], bistra: ['#2f78d0', '#0d2140'], orlova: ['#a0524a', '#1c1838'] };

function renderMenu() {
  if (!G.hillId) G.hillId = HILLS[Math.min(2, HILLS.length - 1)]?.def.id || HILLS[0].def.id;
  const H = hillOf(G.hillId).def;
  const gateOpts = Array.from({ length: H.gates.count }, (_, i) => i + 1).map(g => `<option value="${g}" ${g === (G.trainGate?.[H.id] ?? H.gates.default) ? 'selected' : ''}>${g}${g === H.gates.default ? ' (privzeto)' : ''}</option>`).join('');
  const mb = localBest(H.id);
  const tot = G.session.jumps.filter(j => j.hill === H.id);
  $('#menu').innerHTML = `
    <div class="mg-stack">
      <div class="sk-hero">
        <div class="sk-hero__icon" aria-hidden="true">🎿</div>
        <div><h1 class="mg-title">Smučarski skoki</h1>
          <p class="mg-muted">Zalet, odriv v pravem trenutku, let, ki ga loviš z miško, in telemark. Prava pravila točkovanja, veter in ghosti prijateljev.</p></div>
      </div>
      <div class="sk-hills" role="list">${HILLS.map(({ def }) => {
        const b = localBest(def.id);
        const [c1, c2] = THEME_COLORS[def.id] || ['#24356e', '#0f1530'];
        return `<button class="sk-hillcard" role="listitem" data-hill="${def.id}" aria-pressed="${def.id === H.id}" style="--c1:${c1};--c2:${c2}">
          <span class="kh">K${def.k} · HS${def.hs}</span><b>${esc(def.name)}</b><span class="desc">${esc(def.desc || '')}</span>
          <span class="pb">${b ? '🏅 ' + fmtDist(b.dist) + ' · ' + fmt1(b.total) + ' t' : ''}</span></button>`;
      }).join('')}</div>
      <div class="sk-modes">
        <div class="mg-card">
          <h2 class="mg-title">Trening</h2>
          <p class="sk-note">Neomejeno skokov, ena tipka za nov skok, takojšen replay. Ne šteje za rekorde in lestvico.</p>
          <div class="sk-row"><label>Zaletno mesto <select class="mg-select" id="selGate">${gateOpts}</select></label></div>
          <div class="sk-row"><label>Veter <select class="mg-select" id="selWind">
            <option value="off" ${settings.wind === 'off' ? 'selected' : ''}>Izklopljen</option>
            <option value="const" ${settings.wind === 'const' ? 'selected' : ''}>Stalen</option>
            <option value="random" ${settings.wind === 'random' ? 'selected' : ''}>Naključen</option></select></label>
            <label class="${settings.wind === 'const' ? '' : 'mg-hidden'}" id="windVal"><input type="range" id="selWindSpeed" min="-3" max="3" step="0.5" value="${settings.windSpeed}"> <b id="windValTxt">${sign(settings.windSpeed)} m/s</b></label></div>
          <div class="sk-row"><label class="mg-check"><input type="checkbox" id="chkGhost" ${settings.ghostMine ? 'checked' : ''}> 👻 Moj najboljši skok ${mb ? '(' + fmtDist(mb.dist) + ')' : '(še ga ni)'}</label></div>
          <div class="sk-ghostsel" id="friendSel">${G.friendGhost && G.friendGhost.hill === H.id ? '👻 Ghost: ' + esc(G.friendGhost.name) + ' (' + fmtDist(G.friendGhost.g.dist) + ') <button class="mg-btn mg-btn--small mg-btn--ghost" id="clrFriend">Odstrani</button>' : 'Klikni vrstico na lestvici za ghosta prijatelja.'}</div>
          <button class="mg-btn mg-btn--primary mg-btn--big mg-btn--block" id="btnTrain">Trening na ${esc(H.name)}</button>
        </div>
        <div class="mg-card">
          <h2 class="mg-title">Rekord skakalnice</h2>
          <p class="sk-note">Trije skoki s privzetega zaletnega mesta (${H.gates.default}) in z naključnim vetrom. Šteje najboljši skok, ki gre na lestvico ${esc(H.name)}.</p>
          <div class="sk-stats"><div><span class="mg-muted mg-small">Seja na ${esc(H.name)}</span><b>${tot.length} ${tot.length === 1 ? 'skok' : 'skokov'}</b></div>
            <div><span class="mg-muted mg-small">Najdaljši</span><b>${tot.length ? fmtDist(Math.max(...tot.map(j => j.dist))) : '—'}</b></div>
            <div><span class="mg-muted mg-small">Povprečje</span><b>${tot.length ? fmtDist(tot.reduce((a, j) => a + j.dist, 0) / tot.length) : '—'}</b></div>
            <div><span class="mg-muted mg-small">Padci</span><b>${tot.filter(j => j.fall).length}</b></div></div>
          <button class="mg-btn mg-btn--pink mg-btn--big mg-btn--block" id="btnRecord">Rekord skakalnice (3 skoki)</button>
        </div>
      </div>
      <div class="mg-card" id="board"></div>
      <div class="mg-card"><h2 class="mg-title">Dosežki</h2><div class="sk-ach" id="achList"></div></div>
      <div class="mg-grid mg-grid--2">
        <div class="mg-card"><h2 class="mg-title">Kako igrati</h2>${helpHtml()}</div>
        <div class="mg-card"><h2 class="mg-title">Nastavitve</h2>
          <div class="sk-row"><label>Kakovost <select class="mg-select" id="selQ">
            <option value="auto" ${settings.quality === 'auto' ? 'selected' : ''}>Samodejno (${QUALITY[autoQuality()].name.toLowerCase()})</option>
            ${QUALITY_ORDER.map(q => `<option value="${q}" ${settings.quality === q ? 'selected' : ''}>${QUALITY[q].name}</option>`).join('')}</select></label></div>
          <label class="mg-check"><input type="checkbox" id="sSound" ${settings.sound ? 'checked' : ''}> Zvok</label>
          <label class="mg-check"><input type="checkbox" id="sMusic" ${settings.music ? 'checked' : ''}> Glasba v meniju</label>
          <label class="mg-check"><input type="checkbox" id="sPost" ${settings.post ? 'checked' : ''}> Učinki (bloom, barve, glajenje)</label>
          <label class="mg-check"><input type="checkbox" id="sFps" ${settings.fps ? 'checked' : ''}> Pokaži FPS</label>
          ${IS_TOUCH ? `<label class="mg-check"><input type="checkbox" id="sTilt" ${settings.tilt ? 'checked' : ''}> Nagib telefona za nagib skakalca</label>` : ''}
          <p class="sk-note">Statistika: ${stats.jumps} skokov, ${stats.falls} padcev.</p>
        </div>
      </div>
    </div>`;
  // dogodki
  $('#menu').querySelectorAll('[data-hill]').forEach(b => b.onclick = () => { audio.unlock(); G.hillId = b.dataset.hill; renderMenu(); });
  $('#selGate').onchange = e => { G.trainGate = { ...(G.trainGate || {}), [H.id]: +e.target.value }; };
  $('#selWind').onchange = e => { settings.wind = e.target.value; saveSettings(); $('#windVal').classList.toggle('mg-hidden', settings.wind !== 'const'); };
  $('#selWindSpeed').oninput = e => { settings.windSpeed = +e.target.value; $('#windValTxt').textContent = sign(settings.windSpeed) + ' m/s'; saveSettings(); };
  $('#chkGhost').onchange = e => { settings.ghostMine = e.target.checked; saveSettings(); };
  $('#clrFriend')?.addEventListener('click', () => { G.friendGhost = null; renderMenu(); });
  $('#btnTrain').onclick = () => { audio.unlock(); startSession(H.id, 'train'); };
  $('#btnRecord').onclick = () => { audio.unlock(); startSession(H.id, 'record'); };
  $('#selQ').onchange = e => { settings.quality = e.target.value; saveSettings(); };
  $('#sSound').onchange = e => { settings.sound = e.target.checked; saveSettings(); audio.setMuted(!settings.sound); };
  $('#sMusic').onchange = e => { settings.music = e.target.checked; saveSettings(); audio.unlock(); audio.menuMusic(settings.music); };
  $('#sPost').onchange = e => { settings.post = e.target.checked; saveSettings(); };
  $('#sFps').onchange = e => { settings.fps = e.target.checked; saveSettings(); };
  $('#sTilt')?.addEventListener('change', async e => {
    settings.tilt = e.target.checked; saveSettings();
    if (settings.tilt) { const okT = await getInput().enableTilt(); if (!okT) { ui.toast('Nagib telefona ni na voljo.'); settings.tilt = false; saveSettings(); e.target.checked = false; } } else getInput().disableTilt();
  });
  // lestvica skakalnice
  const seed = 'hill:' + H.id;
  board = ui.leaderboard($('#board'), {
    title: 'Rekord skakalnice · ' + H.name, format: fmtBoard,
    tabs: [{ label: 'Danes', seed, period: 'today' }, { label: 'Teden', seed, period: 'week' }, { label: 'Vseh časov', seed }],
    onRow: row => pickFriendGhost(row, H), rowHint: () => ' 👻',
  });
  refreshAch();
}

function helpHtml() {
  return `<dl class="sk-help">
    <dt>1. Zalet</dt><dd>${IS_TOUCH ? 'Tapni' : 'Klikni'} za štart — skakalec se sam spusti v nizko držo.</dd>
    <dt>2. Odriv</dt><dd><b>${IS_TOUCH ? 'Dva prsta hkrati' : 'Levi + desni gumb hkrati'}</b> točno na koncu mize. ✨ = popoln odriv (±25 ms).</dd>
    <dt>3. Let</dt><dd>Skakalec se sam nagne v letalni položaj; ${IS_TOUCH ? 'z vlečenjem prsta gor/dol' : 'z miško gor/dol'} ga popravljaš. Bela črtica na merilniku desno naj bo v zelenem oknu — okno se med letom premika. Preveč naprej = padec na nos, preveč nazaj = zavora.</dd>
    <dt>4. Pristanek</dt><dd><b>${IS_TOUCH ? 'Dva prsta' : 'Oba gumba'}</b> tik pred tlemi = telemark (več točk), ${IS_TOUCH ? 'en tap' : 'en gumb'} = pristanek na obe nogi (varneje). Prepozno = padec.</dd>
    <dt>Tipke</dt><dd>Skok se upravlja samo z miško. <span class="mg-kbd">R</span> nov skok · <span class="mg-kbd">Enter</span> replay · <span class="mg-kbd">Esc</span>/<span class="mg-kbd">P</span> pavza</dd>
    <dt>Točke</dt><dd>60 točk na K-točki ± vrednost metra, slog 5 sodnikov (najvišja in najnižja se ne štejeta), kompenzacija vetra in zaletnega mesta.</dd></dl>`;
}

async function refreshAch() {
  const el = $('#achList'); if (!el) return;
  const mine = new Set((await hub.getAchievements()).map(a => a.key));
  el.innerHTML = ACH.map(a => `<div class="sk-ach__item ${mine.has(a.key) ? '' : 'locked'}"><span>${a.icon}</span><div><b>${esc(a.title)}</b><span class="mg-small mg-muted">${esc(a.desc)}</span></div></div>`).join('');
}

async function pickFriendGhost(row, H) {
  const g = await hub.getGhost({ level: H.id, userId: row.user_id });
  if (!g?.data) { ui.toast('Ta igralec še nima posnetka skoka.', { icon: '👻' }); return; }
  try {
    const gh = decodeGhost(g.data);
    if (gh.pv !== P.paramsVersion) { ui.toast('Posnetek je iz starejše verzije fizike.', { icon: '⚠️' }); return; }
    if (gh.hill !== H.id) throw new Error('napačna skakalnica');
    G.friendGhost = { hill: H.id, g: gh, name: row.nickname || '???', userId: row.user_id };
    ui.toast(`Ghost: ${row.nickname} (${fmtDist(gh.dist)})`, { icon: '👻' });
    renderMenu();
  } catch (e) { console.warn(e); ui.toast('Posnetka ni bilo mogoče prebrati.'); }
}

/* ===================================================================== */
/*  Izris, kakovost                                                      */
/* ===================================================================== */

let autoQ = null;
function autoQuality() { return autoQ || (autoQ = detectQuality()); }
function wantedQuality() { return Q_PARAM || (settings.quality === 'auto' ? autoQuality() : settings.quality); }

function getInput() {
  if (!input) {
    input = new Input($('#cv'));
    input.onAction = onAction;
  }
  return input;
}

function ensureRenderer() {
  if (renderer) {
    if (renderer.qualityKey !== wantedQuality()) renderer.setQuality(wantedQuality());
    renderer.setPost(settings.post);
    return renderer;
  }
  renderer = new Renderer($('#cv'), { quality: wantedQuality(), reduced: reducedMotion(), post: settings.post });
  window.addEventListener('resize', () => renderer.resize());
  return renderer;
}

/* ===================================================================== */
/*  Seja in skok                                                         */
/* ===================================================================== */

async function startSession(hillId, mode) {
  const H = hillOf(hillId);
  G.hillId = hillId; G.mode = mode;
  G.record = mode === 'record' ? { tries: [], best: null } : null;
  audio.menuMusic(false);
  audio.setLoops(true);
  $('#menu').classList.add('mg-hidden');
  $('#loader').classList.remove('mg-hidden');
  $('#play').classList.remove('mg-hidden');
  document.body.classList.add('sk-playing');
  await sleep(30);
  ensureRenderer();
  getInput();
  if (settings.tilt && IS_TOUCH) input.enableTilt();
  if (renderer.hill !== H.hill) renderer.load(H.hill, DEFAULT_SKIN);
  renderer.resize();
  $('#loader').classList.add('mg-hidden');
  $('#hudHill').textContent = `${H.def.name} · K${H.def.k}`;
  $('#hudMode').textContent = mode === 'record' ? 'Rekord skakalnice' : 'Trening';
  $('#barWho').innerHTML = hub.profile ? ui.who(hub.profile) : '';
  G.hintsOn = (stats.hints || 0) < 3;
  if (!loopOn) { loopOn = true; last = performance.now(); requestAnimationFrame(loop); }
  newJump();
}

function windForJump() {
  const seed = (Math.random() * 4294967295) >>> 0;
  if (G.mode === 'record') return { mode: 'random', seed };
  if (settings.wind === 'const') return { mode: 'const', seed, speed: settings.windSpeed };
  return { mode: settings.wind === 'off' ? 'off' : 'random', seed };
}

function prepGhosts(H) {
  const list = [];
  if (G.mode === 'train') {
    const mb = localBest(H.def.id);
    if (settings.ghostMine && mb?.data) {
      try { const g = decodeGhost(mb.data); if (g.pv === P.paramsVersion) list.push({ g, name: 'Moj rekord' }); } catch { /* */ }
    }
    if (G.friendGhost && G.friendGhost.hill === H.def.id) list.push({ g: G.friendGhost.g, name: G.friendGhost.name });
  }
  return list.map(o => { const r = ghostJump(o.g, H.hill, P); return { ...o, J: r.J, input: r.input, snap: gateSnapshot(H.hill, o.g.gate) }; });
}

function newJump() {
  const H = hillOf(G.hillId);
  hideResult();
  G.gate = G.mode === 'record' ? H.def.gates.default : (G.trainGate?.[H.def.id] ?? H.def.gates.default);
  G.wind = windForJump();
  G.windObj = createWind(G.wind, P);
  G.J = createJump({ hill: H.hill, P, gate: G.gate, wind: G.wind, record: DEBUG ? 2 : 0 });
  G.rec = new InputRecorder();
  G.hist = [];
  G.ghosts = prepGhosts(H);
  G.slow = null; G.replay = null; G.landShown = false; G.flags = {};
  G.bot = BOT_SKILL != null ? createBot({ skill: BOT_SKILL, seed: (Math.random() * 1e9) >>> 0 }) : null;
  renderer.setGate(G.gate);
  renderer.setGhosts(G.ghosts.length);
  const rec = Math.max(localBest(H.def.id)?.dist || 0, ...G.ghosts.map(g => g.g.dist));
  renderer.setRecord(rec || null);
  $('#barRec').textContent = rec ? fmtDist(rec) : '—';
  $('#barRecLbl').textContent = G.ghosts.length ? 'Rekord / ghost' : 'Rekord';
  $('#hudGhost').classList.toggle('mg-hidden', !G.ghosts.length);
  $('#hudGhost').textContent = '👻 ' + G.ghosts.map(g => g.name).join(', ');
  $('#barGate').textContent = G.gate;
  $('#barSpeed').textContent = '—';
  $('#big').classList.add('mg-hidden');
  $('#comment').classList.add('mg-hidden');
  $('#lean').classList.add('mg-hidden');
  $('#replayBar').classList.add('mg-hidden');
  if (G.record) $('#hudMode').textContent = `Rekord skakalnice · skok ${G.record.tries.length + 1}/3`;
  input.reset(); input.mode = 'gate'; input.resetPitch(0);
  G.state = 'gate'; G.gateT = 0; G.view = gateSnapshot(H.hill, G.gate); G.view.snap = true;
  renderer.setCheer(0.1);
  showLight(true);
  clock.reset();
  dbgHook?.onNewJump?.();
}

/* ---------------- semafor */
const RED_TIME = 1.2, GATE_TIME = 10;
function showLight(on) { $('#light').classList.toggle('mg-hidden', !on); }
function updateGate(dt) {
  const was = G.gateT;
  G.gateT += dt;
  const green = G.gateT >= RED_TIME;
  $('#light').querySelector('.sk-lamp--r').classList.toggle('on', !green);
  $('#light').querySelector('.sk-lamp--g').classList.toggle('on', green);
  const left = Math.max(0, Math.ceil(GATE_TIME - (G.gateT - RED_TIME)));
  $('#lightCount').textContent = green ? (left > 0 ? left : '!') : '';
  $('#light').classList.toggle('late', green && left <= 3);
  if (was < RED_TIME && green) audio.beep(true);
  else if (green && Math.ceil(GATE_TIME - (was - RED_TIME)) !== left && left <= 3 && left > 0) audio.beep(false);
  if (green && G.bot && G.gateT > RED_TIME + 0.6) startJump();
  if (G.hintsOn) hint(green ? (IS_TOUCH ? 'Tapni za štart' : 'Klikni za štart') : 'Pripravi se …');
}

function startJump() {
  if (G.state !== 'gate' || G.gateT < RED_TIME) return;
  showLight(false);
  G.state = 'jump';
  input.mode = 'inrun';
  clock.reset();
  audio.whoosh();
}

/* ---------------- tick simulacije */
function tick() {
  const J = G.J, s = J.s;
  const inp = G.bot ? G.bot.input(s) : input.sample();
  G.rec.push(s.tick, inp);
  J.step(inp);
  for (const e of J.ev) onEvent(e);
  J.ev.length = 0;
  G.hist.push(snapshot(s, P));
  for (const gh of G.ghosts) {
    if (!gh.J.done) { gh.J.step(gh.input(gh.J.s, gh.J.s.tick)); gh.J.ev.length = 0; }
    gh.snap = snapshot(gh.J.s, P);
  }
  if (!G.bot) input.mode = s.phase === 'inrun' ? 'inrun' : s.phase === 'air' ? 'air' : 'other';
}

function onEvent(e) {
  const H = hillOf(G.hillId).def;
  const s = G.J.s;
  switch (e.type) {
    case 'takeoff': {
      if (!G.bot) input.resetPitch(0);
      audio.takeoff(e.perfect);
      audio.silence();
      $('#barSpeed').textContent = fmt1(s.tableSpeed) + ' km/h';
      if (e.perfect) { flash('✨ Popoln odriv!'); G.flags.perfect = true; }
      else if (e.err > 0.06) comment(say('late'));
      else if (e.err < -0.06) comment(say('early'));
      break;
    }
    case 'edge': $('#barSpeed').textContent = fmt1(s.tableSpeed) + ' km/h'; break;
    case 'crash': if (e.how === 'nose') comment(say('nose')); else comment(say('sitting')); break;
    case 'land': {
      const L = e;
      G.landAt = performance.now();
      audio.land(Math.min(1, L.hEq / 1.4));
      if (L.kind === 'fall') { audio.crash(); renderer.shake(0.5); }
      else renderer.shake(0.12 + Math.min(0.3, L.hEq * 0.15));
      const lvl = Math.min(1, Math.max(0, (L.dist - H.k * 0.7) / (H.hs - H.k * 0.7)));
      renderer.setCheer(L.kind === 'fall' ? 0.2 : 0.2 + lvl * 0.8);
      if (L.kind !== 'fall' && L.dist >= H.k) { audio.bells(L.dist >= H.hs ? 14 : 8); audio.fanfare(); }
      audio.cheer(L.kind === 'fall' ? 0.3 : 0.4 + lvl);
      const pb = G.mode === 'record' && (localBest(H.id)?.dist || 0) < L.dist && L.kind !== 'fall' && (localBest(H.id) != null);
      comment(say(landingGroup({ type: L.kind, fallen: s.fallen, dist: L.dist, k: H.k, hs: H.hs, wind: L.windAvg, pb })));
      if (!reducedMotion() && L.dist >= H.k && L.kind !== 'fall' && G.hist.length > TPS) {
        const to = G.hist.length - 1;
        G.slow = { from: Math.max(0, to - Math.round(1.4 * TPS)), to: to + Math.round(0.25 * TPS), pos: Math.max(0, to - Math.round(1.4 * TPS)) };
        G.state = 'slowmo';
      } else showBig();
      break;
    }
    case 'done': finishJump(); break;
  }
}

/* ---------------- HUD */
let hintTimer = 0;
function hint(text, go = false) {
  if (text === G.hintText) return;
  G.hintText = text;
  const el = $('#hint');
  el.classList.toggle('mg-hidden', !text);
  el.classList.toggle('go', go);
  el.textContent = text || '';
}
function flash(text) { const el = $('#flash'); el.classList.remove('mg-hidden'); el.textContent = text; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
let commentTimer = 0;
function comment(text) {
  if (!text) return;
  const el = $('#comment');
  el.textContent = text; el.classList.remove('mg-hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(commentTimer); commentTimer = setTimeout(() => el.classList.add('mg-hidden'), 4200);
}
function showBig() {
  if (G.landShown) return;
  G.landShown = true;
  const L = G.J.s.landing;
  const el = $('#big');
  el.classList.remove('mg-hidden'); el.classList.toggle('fall', L.type === 'fall');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  $('#bigDist').textContent = fmtDist(L.dist);
  const T = { tele: 'Telemark', two: 'Na obe nogi', none: 'Trd pristanek', touch: 'Dotik z roko', fall: 'Padec' };
  $('#bigSub').textContent = T[L.type] || '';
}

function updateHud(v) {
  const H = hillOf(G.hillId);
  const s = G.J.s;
  // veter (pri K-točki)
  const t = G.state === 'gate' ? G.gateT : s.tick * STEP;
  const w = G.windObj.at(t, H.hill.kPoint.x).h;
  const cell = $('#barWindCell');
  cell.classList.toggle('head', w > 0.15); cell.classList.toggle('tail', w < -0.15);
  $('#barWind').textContent = sign(w);
  $('#barArrow').style.transform = `rotate(${w >= 0 ? 180 : 0}deg)`;
  if (s.phase === 'inrun' && G.state === 'jump') $('#barSpeed').textContent = fmt1(s.v * 3.6) + ' km/h';
  // merilnik nagiba
  const inAir = s.phase === 'air' && s.takeoff && !s.prep && !s.fallen;
  $('#lean').classList.toggle('mg-hidden', !inAir);
  if (inAir) {
    const pos = a => Math.max(0, Math.min(100, (80 - a) / 90 * 100));
    $('#leanCur').style.top = pos(v.alpha) + '%';
    $('#leanTgt').style.top = pos(s.target - s.gamma * 180 / Math.PI) + '%';
    const w0 = pos(BOT_ALPHA + 6), w1 = pos(BOT_ALPHA - 6);
    $('#leanWin').style.top = w0 + '%'; $('#leanWin').style.height = (w1 - w0) + '%';
  }
  // namigi za prvi skok
  if (G.hintsOn && G.state === 'jump' && !G.bot) {
    let h = '', go = false;
    if (s.phase === 'inrun') {
      const tte = s.v > 0.1 ? s.d / s.v : 9;
      if (tte < 0.3) { h = IS_TOUCH ? 'Zdaj dva prsta!' : 'Zdaj oba gumba!'; go = true; }
      else h = IS_TOUCH ? 'Na koncu mize: dva prsta hkrati' : 'Na koncu mize: levi + desni gumb hkrati';
    } else if (s.phase === 'air' && s.takeoff && !s.prep && !s.fallen) {
      const ttc = s.vn > 0.1 ? s.hag / s.vn : 9;
      const a = s.alpha * 180 / Math.PI;
      if (ttc < 0.5) { h = IS_TOUCH ? 'Dva prsta za telemark!' : 'Oba gumba za telemark!'; go = true; }
      else if ((s.tick - s.takeoff.tick) * STEP > 0.3) {
        if (a > BOT_ALPHA + 7) h = 'Nagni se naprej ' + (IS_TOUCH ? '(povleci dol)' : '(miška dol)');
        else if (a < BOT_ALPHA - 7) h = 'Malo nazaj ' + (IS_TOUCH ? '(povleci gor)' : '(miška gor)');
        else h = 'Tako! Drži nagib';
      }
    }
    hint(h, go);
  } else if (G.state !== 'gate') hint('');
  // zvok
  audio.update({
    ski: s.phase === 'inrun' ? Math.min(1, s.v / 25) : s.phase === 'out' ? Math.min(1, s.outV / 25) * 0.7 : 0,
    speed: Math.min(1, (s.phase === 'inrun' ? s.v : s.outV || 0) / 27),
    wind: s.phase === 'air' && s.takeoff ? Math.min(1, s.speed / 30) * (0.6 + Math.min(0.4, Math.abs(s.alpha) * 0.6)) : 0,
    // publika: po pristanku vzklik izzveni (prej je šumela naprej)
    crowd: G.state === 'gate' ? 0.1 : s.landing ? (s.landing.type === 'fall' ? 0.25 : Math.min(1, 0.3 + s.landing.dist / hillOf(G.hillId).def.hs * 0.7)) * Math.exp(-(performance.now() - (G.landAt || 0)) / 2500) : s.phase === 'air' ? Math.min(0.8, 0.2 + Math.max(0, s.x) / hillOf(G.hillId).def.k * 0.5) : 0.1,
  });
}

/* ===================================================================== */
/*  Konec skoka: točke, shranjevanje, hub                                */
/* ===================================================================== */

async function finishJump() {
  const Hd = hillOf(G.hillId).def;
  const s = G.J.s, L = s.landing;
  const judges = judgeScores(s, P, (G.wind.seed ^ s.tick) >>> 0);
  const res = scoreJump(Hd, { dist: L.dist, judges, wind: L.windAvg, gate: G.gate });
  res.type = L.type; res.fall = L.type === 'fall'; res.speed = s.tableSpeed; res.takeoff = s.takeoff;
  const jump = { hill: Hd.id, dist: L.dist, total: res.total, fall: res.fall, mode: G.mode };
  G.session.jumps.push(jump);
  const ghostData = encodeGhost({ pv: P.paramsVersion, hill: Hd.id, gate: G.gate, wind: G.wind, changes: G.rec.changes, ticks: G.rec.ticks, dist: L.dist, total: res.total });
  G.lastJump = { res, ghost: ghostData, changes: G.rec.changes, wind: G.wind, gate: G.gate, hill: Hd.id, hist: G.hist, trace: G.J.trace, s: structuredClone(s) };
  G.state = 'result';
  if (!G.landShown) showBig();

  // lokalni najboljši skok (ghost) — po točkah, le v »Rekordu skakalnice« (trening ne šteje)
  const prev = localBest(Hd.id);
  const isPb = G.mode === 'record' && !res.fall && (!prev || res.total > prev.total);
  if (isPb && ghostData.length < GHOST_MAX) S.save(bestKey(Hd.id), { total: res.total, dist: L.dist, data: ghostData, pv: P.paramsVersion, at: Date.now() });

  // statistika in namigi
  stats.jumps = (stats.jumps || 0) + 1;
  if (res.fall) stats.falls = (stats.falls || 0) + 1;
  else if (G.hintsOn) { stats.hints = (stats.hints || 0) + 1; if (stats.hints >= 3) G.hintsOn = false; }
  if (!res.fall && L.dist >= Hd.k) stats.overK = { ...(stats.overK || {}), [Hd.id]: true };
  saveStats();

  // dogodki za naloge
  if (!res.fall) hub.reportEvent('skoki:skok', 1);
  if (L.dist >= Hd.k) hub.reportEvent('skoki:k', 1);
  if (!res.fall && L.dist >= Hd.hs) hub.reportEvent('skoki:hs', 1);
  hub.reportEvent('skoki:tocke', Math.round(res.total));
  if (L.type === 'tele') hub.reportEvent('skoki:telemark', 1);

  // dosežki
  const ach = [];
  ach.push('prvi-skok');
  if (L.dist >= Hd.k) ach.push('k-tocka');
  if (!res.fall && L.dist >= Hd.hs) ach.push('hs');
  if (s.takeoff?.perfect) ach.push('popoln-odriv');
  if (judges.filter(j => j >= 19).length >= 4) ach.push('telemark-19');
  if (res.fall) ach.push('snezni-angel');
  if (HILLS.every(h => stats.overK?.[h.def.id])) ach.push('vse-tri');
  if (!res.fall && L.dist < Hd.k / 2) ach.push('zavora');
  if (!res.fall && L.dist >= Hd.k && L.windAvg <= -2) ach.push('veter-v-hrbet');
  if (stats.jumps >= 100) ach.push('stotica');
  for (const k of ach) unlock(k);

  // XP za skok čez HS (enkrat na skakalnico na sejo)
  if (!res.fall && L.dist >= Hd.hs && !G.session.xpHs[Hd.id]) { G.session.xpHs[Hd.id] = true; hub.awardXp(10, 'skoki: čez HS'); }

  if (G.mode === 'record') {
    G.record.tries.push({ ...res, ghost: ghostData });
    if (!G.record.best || res.total > G.record.best.total) G.record.best = { ...res, ghost: ghostData };
    if (G.record.tries.length >= 3) await finishRecord();
  } else if (Date.now() - G.lastReport > 60000) {
    G.lastReport = Date.now();
    hub.reportGame({ won: false, players: 1, score: Math.round(res.total), daily: false });
  }
  await sleep(G.bot ? 600 : 1100);
  if (G.state === 'result' && G.lastJump.res === res) showResult(res, isPb);
  dbgHook?.onJump?.(G.lastJump);
  if (G.bot && G.state === 'result') { await sleep(2500); if (G.state === 'result' && G.lastJump.res === res) newJump(); }
}

async function finishRecord() {
  const Hd = hillOf(G.hillId).def;
  const best = G.record.best;
  const seed = 'hill:' + Hd.id;
  const prevBest = await hub.getMyBest({ seed });
  const enc = encodeBoard(best.total, best.dist);
  await hub.submitScore(enc, { seed, meta: { dist: best.dist, wind: best.wind, gate: best.gate, style: best.style, total: best.total } });
  if (best.total > 0 && !best.fall) await hub.saveGhost({ level: Hd.id, timeMs: enc, data: best.ghost, order: 'desc' });
  hub.reportGame({ won: false, players: 1, score: Math.round(best.total), daily: false });
  G.lastReport = Date.now();
  let xp = 15;
  const newPb = prevBest == null || enc > prevBest;
  if (newPb) xp += 25;
  hub.awardXp(xp, newPb ? 'skoki: nov rekord skakalnice' : 'skoki: rekord skakalnice');
  G.record.done = { xp, newPb, prev: prevBest != null ? decodeBoard(prevBest) : null };
  board?.refresh?.();
}

function rankText(res) {
  const mine = G.session.jumps.filter(j => j.hill === G.hillId).map(j => j.total).sort((a, b) => b - a);
  const r = mine.indexOf(res.total) + 1;
  return `${r}. od ${mine.length} ${mine.length === 1 ? 'skoka' : 'skokov'} v seji`;
}

function showResult(res, isPb) {
  const Hd = hillOf(G.hillId).def;
  const el = $('#card');
  $('#big').classList.add('mg-hidden');
  const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  const rec = G.record;
  const tries = rec ? `<div class="sk-tries">${rec.tries.map((t, i) => `<span class="${t === rec.tries.find(x => x.total === rec.best.total) ? 'best' : ''}">${i + 1}. ${fmtDist(t.dist)} · ${fmt1(t.total)} t</span>`).join('')}</div>` : '';
  const done = rec?.done;
  el.innerHTML = `
    <div class="sk-card__head"><b>${esc(Hd.name)} · K${Hd.k}</b><span>${G.mode === 'record' ? `Skok ${rec.tries.length}/3` : 'Trening'}</span></div>
    <div class="sk-card__body"><table><tbody>
      <tr><td>Daljava <b>${fmtDist(res.dist)}</b>${isPb ? ' 🏅' : ''}</td><td>${fmtPts(res.distPts)}</td></tr>
      <tr><td colspan="2"><div class="sk-row" style="justify-content:space-between"><span>Sodniki</span><span class="sk-judges">${res.judges.map((j, i) => `<i class="${res.dropped.includes(i) ? 'x' : ''}">${fmt1(j)}</i>`).join('')}</span></div></td></tr>
      <tr><td>Slog</td><td>${fmtPts(res.style)}</td></tr>
      <tr><td>Veter ${sign(res.wind)} m/s</td><td class="${cls(res.windPts)}">${sign(res.windPts)}</td></tr>
      <tr><td>Zaletno mesto ${res.gate} (ref. ${Hd.gates.default})</td><td class="${cls(res.gatePts)}">${sign(res.gatePts)}</td></tr>
      <tr class="sk-total"><td>Skupaj</td><td>${fmtPts(res.total)}</td></tr>
    </tbody></table></div>
    <div class="sk-card__rank">${res.speed ? 'Hitrost na mizi ' + fmt1(res.speed) + ' km/h · ' : ''}${res.takeoff?.perfect ? '✨ popoln odriv · ' : ''}${rankText(res)}</div>
    ${tries}
    ${done ? `<div class="sk-card__rank">🏁 Najboljši: <b>${fmtDist(rec.best.dist)} · ${fmt1(rec.best.total)} t</b> → lestvica. ${done.newPb ? '<b style="color:var(--mg-green)">Nov osebni rekord!</b>' : ''} +${done.xp} XP</div>` : ''}
    <div class="sk-card__btns">
      ${rec && done ? `<button class="mg-btn mg-btn--pink" data-a="again">Nov poskus (R)</button>` : `<button class="mg-btn mg-btn--primary" data-a="next">${rec ? 'Naslednji skok' : 'Nov skok'} (R)</button>`}
      <button class="mg-btn" data-a="replay">Replay (Enter)</button>
      <button class="mg-btn mg-btn--ghost" data-a="menu">Meni</button>
    </div>`;
  el.classList.remove('mg-hidden');
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = e => { e.stopPropagation(); action(b.dataset.a); });
}
function hideResult() { $('#card').classList.add('mg-hidden'); }

function action(a) {
  audio.unlock();
  if (a === 'next') newJump();
  else if (a === 'again') { G.record = { tries: [], best: null }; newJump(); }
  else if (a === 'replay') startReplay();
  else if (a === 'menu') { hideResult(); showMenu(); }
}

/* ===================================================================== */
/*  Replay in počasni posnetek                                           */
/* ===================================================================== */

function startReplay(hist = G.lastJump?.hist) {
  if (!hist?.length) return;
  hideResult();
  G.replay = { hist, cuts: replayCuts(hist), pos: 0, prevState: 'result' };
  G.state = 'replay';
  $('#replayBar').classList.remove('mg-hidden');
  const r = $('#replayPos'); r.max = String(hist.length - 1); r.value = '0';
  $('#big').classList.add('mg-hidden');
  $('#lean').classList.add('mg-hidden');
  hint('');
}
function stopReplay() {
  if (G.state !== 'replay') return;
  G.state = 'result';
  $('#replayBar').classList.add('mg-hidden');
  if (G.lastJump) showResult(G.lastJump.res, false);
}

/* ===================================================================== */
/*  Vnos (akcije) in pavza                                               */
/* ===================================================================== */

function onAction(a) {
  audio.unlock();
  if (G.state === 'menu') return;
  if (a === 'pause') { if (G.state === 'replay') stopReplay(); else togglePause(); return; }
  if (G.paused) { if (a === 'press') return; }
  if (a === 'press') {
    if (G.state === 'gate') startJump();
    return;
  }
  if (a === 'r') {
    if (G.state === 'result' || G.state === 'replay') { if (G.record?.done) action('again'); else newJump(); }
    else if (G.mode === 'train' && G.state !== 'menu') newJump();
  }
  if (a === 'enter') {
    if (G.state === 'result') startReplay();
    else if (G.state === 'replay') stopReplay();
  }
}

function togglePause(force) {
  const on = force ?? !G.paused;
  if (on === G.paused) return;
  if (on && !['gate', 'jump', 'slowmo'].includes(G.state)) return;
  G.paused = on;
  input?.reset();   // kliki med pavzo se ne štejejo
  const ov = $('#overlay');
  audio.setLoops(!on);
  if (on) {
    audio.silence();
    ov.innerHTML = `<div class="mg-card"><h2 class="mg-title">Pavza</h2>
      <button class="mg-btn mg-btn--primary mg-btn--big" data-p="go">Nadaljuj</button>
      ${G.mode === 'train' ? '<button class="mg-btn" data-p="new">Nov skok</button>' : ''}
      <button class="mg-btn mg-btn--ghost" data-p="menu">Meni</button></div>`;
    ov.classList.remove('mg-hidden');
    ov.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      togglePause(false);
      if (b.dataset.p === 'new') newJump();
      if (b.dataset.p === 'menu') showMenu();
    });
  } else { ov.classList.add('mg-hidden'); clock.reset(); last = performance.now(); }
}

/* ===================================================================== */
/*  Zanka                                                                */
/* ===================================================================== */

let loopOn = false, last = 0, fpsAcc = 0, fpsN = 0, lowFor = 0;

function currentView() {
  const H = hillOf(G.hillId);
  if (G.state === 'gate') return { me: gateSnapshot(H.hill, G.gate), ghosts: G.ghosts.map(g => g.snap) };
  if (G.state === 'slowmo') {
    const i = Math.floor(G.slow.pos), u = G.slow.pos - i;
    const h = G.hist;
    return { me: lerpSnap(h[Math.min(i, h.length - 1)], h[Math.min(i + 1, h.length - 1)], u), ghosts: [], cam: 'live' };
  }
  if (G.state === 'replay') {
    const R = G.replay, i = Math.floor(R.pos), u = R.pos - i, h = R.hist;
    const cut = cutAt(R.cuts, i);
    const v = lerpSnap(h[Math.min(i, h.length - 1)], h[Math.min(i + 1, h.length - 1)], u);
    if (R.lastCam !== cut.cam) { v.snap = cut.cam === 'front' || cut.cam === 'below' || R.lastCam === 'front' || R.lastCam === 'below'; R.lastCam = cut.cam; }
    return { me: v, ghosts: [], cam: cut.cam };
  }
  const h = G.hist;
  if (!h.length) return { me: gateSnapshot(H.hill, G.gate), ghosts: G.ghosts.map(g => g.snap) };
  const me = lerpSnap(h[h.length - 2], h[h.length - 1], G.alpha || 0);
  return { me, ghosts: G.ghosts.map(g => g.snap) };
}

function loop(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (G.state !== 'menu' && renderer) {
    if (!G.paused) {
      if (G.state === 'gate') updateGate(dt);
      else if (G.state === 'jump' || (G.state === 'result' && !G.J.done)) G.alpha = clock.advance(dt, tick);
      else if (G.state === 'result') G.alpha = 1;
      else if (G.state === 'slowmo') {
        G.slow.pos += dt * TPS * 0.3;
        // simulacija stoji, dokler počasni posnetek ne dohiti zgodovine
        if (G.slow.pos >= G.hist.length - 1) { for (let k = 0; k < 2 && !G.J.done; k++) tick(); }
        if (G.slow.pos >= G.slow.to) { G.state = G.J.done ? 'result' : 'jump'; clock.reset(); showBig(); }
      } else if (G.state === 'replay') {
        const R = G.replay;
        if (!R.drag) R.pos = Math.min(R.hist.length - 1, R.pos + dt * TPS * cutAt(R.cuts, Math.floor(R.pos)).speed);
        $('#replayPos').value = String(Math.floor(R.pos));
        if (R.pos >= R.hist.length - 1) { R.end = (R.end || 0) + dt; if (R.end > 1.2) stopReplay(); }
      }
    }
    if (G.J) {
      const view = currentView();
      G.view = view.me;
      renderer.frame(G.paused ? 0 : dt, view);
      view.me.snap = false;
      if (G.state !== 'replay') updateHud(view.me);
    }
    // FPS in samodejna kakovost
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 1) {
      const fps = fpsN / fpsAcc;
      $('#fps').classList.toggle('mg-hidden', !settings.fps);
      if (settings.fps) { const st = renderer.stats(); $('#fps').textContent = `${Math.round(fps)} fps · ${QUALITY[st.q].name} · ${st.calls} klicev`; }
      if (!Q_PARAM && settings.quality === 'auto' && ['jump', 'gate'].includes(G.state) && !G.paused && !document.hidden) {
        lowFor = fps < 45 ? lowFor + 1 : 0;
        const i = QUALITY_ORDER.indexOf(renderer.qualityKey);
        if (lowFor >= 3 && i < QUALITY_ORDER.length - 1) {
          lowFor = 0; autoQ = QUALITY_ORDER[i + 1];
          renderer.setQuality(autoQ);
          renderer.setGate(G.gate); renderer.setGhosts(G.ghosts.length);
          ui.toast('Kakovost znižana: ' + QUALITY[autoQ].name, { icon: '⚙️' });
        }
      }
      fpsAcc = 0; fpsN = 0;
    }
  }
  if (loopOn) requestAnimationFrame(loop);
}

/* ===================================================================== */
/*  Razvojni most za stran z drsniki                                     */
/* ===================================================================== */
let dbgHook = null;
const dbgApi = {
  get P() { return P; }, set P(v) { P = v; },
  hills: () => HILLS, hillOf, current: () => G, renderer: () => renderer,
  /** Ponovi zadnji skok z istimi vnosi in trenutnimi parametri; vrne novo stanje. */
  rerun() {
    const LJ = G.lastJump; if (!LJ) return null;
    const H = hillOf(LJ.hill);
    const J = createJump({ hill: H.hill, P, gate: LJ.gate, wind: LJ.wind, record: 2 });
    let i = 0, cur = { btn: 0, pitch: 0 };
    const hist = [];
    while (!J.done) {
      while (i < LJ.changes.length && LJ.changes[i][0] <= J.s.tick) { cur = { btn: LJ.changes[i][1], pitch: LJ.changes[i][2] / 2 }; i++; }
      J.step(cur); J.ev.length = 0; hist.push(snapshot(J.s, P));
    }
    startReplay(hist);
    G.lastJump = { ...LJ, hist, trace: J.trace, s: structuredClone(J.s) };
    return J;
  },
  setHook(h) { dbgHook = h; },
  bestKey,
  /** Testiranje: semafor takoj zelen. */
  skipRed() { if (G.state === 'gate') G.gateT = Math.max(G.gateT, RED_TIME + 0.01); },
  /** Testiranje: odigraj preostanek skoka takoj (ista pot kot zanka: tick → dogodki → konec). */
  fastForward(max = 6000) {
    let n = 0;
    while (n++ < max && (G.state === 'jump' || G.state === 'slowmo')) {
      if (G.state === 'slowmo') { G.state = 'jump'; showBig(); }
      tick();
    }
    return G.J.s.phase;
  },
};

/* ===================================================================== */
/*  Zagon                                                                */
/* ===================================================================== */

document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });
$('#btnPause').onclick = e => { e.stopPropagation(); togglePause(); };
$('#btnMute').onclick = e => { e.stopPropagation(); settings.sound = !settings.sound; saveSettings(); audio.unlock(); audio.setMuted(!settings.sound); $('#btnMute').textContent = settings.sound ? '🔊' : '🔇'; };
$('#btnMute').textContent = settings.sound ? '🔊' : '🔇';
$('#replayExit').onclick = e => { e.stopPropagation(); stopReplay(); };
$('#replayPos').addEventListener('input', e => { if (G.replay) { G.replay.pos = +e.target.value; G.replay.drag = true; G.replay.end = 0; } });
$('#replayPos').addEventListener('change', () => { if (G.replay) G.replay.drag = false; });
for (const id of ['#card', '#replayBar', '#overlay']) $(id).addEventListener('pointerdown', e => e.stopPropagation());

await hub.init({ gameId: GAME });
try { for (const a of await hub.getAchievements()) unlocked.add(a.key); } catch { /* */ }
ui.header({ title: 'Smučarski skoki' });
try {
  await loadData();
} catch (e) {
  console.error(e);
  $('#menu').innerHTML = '<div class="mg-empty">Skakalnic ni bilo mogoče naložiti.</div>';
  throw e;
}
// enkratna selitev: stari rekordi brez profila (skoki:best:<id>) pripadejo prvemu profilu, ki igro odpre
for (const { def } of HILLS) {
  const old = S.load('skoki:best:' + def.id, null);
  if (!old) continue;
  const cur = localBest(def.id);
  if (!cur || old.total > cur.total) S.save(bestKey(def.id), old);
  S.remove('skoki:best:' + def.id);
}
if (DEBUG) {
  window.__skoki = dbgApi;
  document.body.classList.add('sk-dbg');
  const m = await import('./debug.js');
  m.initDebug(dbgApi, $('#debug'));
}
const startHill = URLP.get('hill');
if (startHill && hillOf(startHill)) { G.hillId = startHill; startSession(startHill, 'train'); }
else showMenu();
