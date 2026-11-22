/* =====================================================================
   HRČKOVA KROGLA — game.js: meni, načini (turnir, na čas, zrcalni turnir,
   dnevni izziv), stanja igre (odštevanje, igra, pavza, povzetek, konec) in hub.
   ===================================================================== */
import { hub, ui, util } from '../../shared/hub.js';
import * as S from '../../shared/storage.js';
import { loadLevels, mirrorLevel, validateLevel } from './level.js';
import * as CD from './editor/drafts.js';
import { levelHash } from './editor/model.js';
import { decodeLevel, sanitizeLevel } from './editor/share.js';
import { createWorld, step, STEP, respawn, hammerPhase, magnetState } from './physics.js';
import * as R from './rules.js';
import { Recorder, encode, decode } from './ghost.js';
import { runAutopilot, pilot } from './autopilot.js';
import { Renderer, DEFAULT_SKIN, QUALITY, QUALITY_ORDER, detectQuality } from './render.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { secretsFor, touches, lockKey } from './secrets.js';
import * as THREE from 'three';

const GAME = 'krogla';
const $ = s => document.querySelector(s);
const esc = ui.esc;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isTouch = matchMedia('(pointer: coarse)').matches;
/** Razvojni način: ?bot=1 — proge vozi autopilot (za preverjanje v pravi zanki igre). */
const QS = new URLSearchParams(location.search);
const BOT = QS.get('bot') === '1';
/** Razvojna parametra: ?lvl=N — takoj odpri progo N (Na čas, brez odklepa); ?q=ultra|high|medium|low — vsili kakovost. */
const DEV_LVL = parseInt(QS.get('lvl') || '', 10) || 0;
const DEV_Q = QS.get('q');

/* ------------------------------------------------------------ nastavitve */

const settings = Object.assign({
  control: 'auto', touch: 'stick', sfx: true, music: true, camRotate: true, quality: 'auto', fps: false, post: true, dof: true, shakeCam: true,
}, S.load('krogla:settings', {}));
const saveSettings = () => S.save('krogla:settings', settings);
const skin = Object.assign({}, DEFAULT_SKIN, S.load('krogla:skin', {}));

/* ------------------------------------------------------------ stanje */

let LEVELS = [], ORDER = [];
let myAch = new Set();
let renderer = null, input = null;
const audio = new Audio();
audio.setSfx(settings.sfx); audio.setMusic(settings.music);

let mode = null;   // { kind, diff, levels, idx, run, mirror, phys, timeMul, official, dailyMod, ghosts }
let play = null;   // { L, base, world, rec, acc, state, prevBall, falls, token }
let token = 0;
let lastReportTrial = 0;

let best = {};          // { 'id|m': ms } (za trenutnega igralca)
const uk = k => 'krogla:u:' + hub.userId + ':' + k;   // lokalni ključi na igralca
let reached = new Set();
const mkey = (id, mirror) => id + '|' + (mirror ? 1 : 0);

/* ===================================================================== */
/*  Zagon                                                                */
/* ===================================================================== */

async function boot() {
  await hub.init({ gameId: GAME });
  ui.header({ title: 'Hrčkova krogla' });
  try {
    LEVELS = await loadLevels(new URL('./levels/', import.meta.url));
    ORDER = LEVELS.map(L => L.id);
  } catch (e) {
    console.error(e);
    $('#menu').innerHTML = '<div class="mg-card mg-empty">Prog ni bilo mogoče naložiti.</div>';
    return;
  }
  best = S.load(uk('best'), {});
  reached = new Set(S.load(uk('reached'), []));
  await refreshAch();
  showMenu();
  if (DEV_LVL && ORDER[DEV_LVL - 1]) startTrial(ORDER[DEV_LVL - 1]);
  // lastna proga: ?custom=<podatki> (povezava »Deli«) ali ?play=<osnutek> (iz urejevalnika)
  if (QS.get('community')) { showMenu('community', QS.get('community')); clearCustomParam(); }
  else if (QS.get('custom')) showShared(QS.get('custom'));
  else if (QS.get('play')) {
    const d = CD.getDraft(QS.get('play'));
    if (d) startCustom(d.L, { key: d.key }); else ui.toast('Te proge ni med tvojimi osnutki.', { icon: '⚠️' });
  }
  // prvi dotik odklene zvok
  addEventListener('pointerdown', () => audio.unlock(), { passive: true });
  addEventListener('keydown', () => audio.unlock(), { passive: true });
}

async function refreshAch() {
  try { myAch = new Set((await hub.getAchievements()).map(a => a.key)); } catch { myAch = new Set(); }
}

const achDef = k => R.ACH.find(a => a.key === k);
async function unlock(k) {
  if (myAch.has(k)) return;
  const a = achDef(k);
  const fresh = await hub.unlock(k, { title: a.title, icon: a.icon });
  myAch.add(k);
  return fresh;
}

function mirrorUnlocked() { return myAch.has('turnir') || S.load(uk('mirror'), false); }
function unlockedIds() {
  const r = new Set(reached);
  // dosežki veljajo na vseh napravah
  if (myAch.has('sklop-1')) LEVELS.forEach((L, i) => { if (L.set === 1 || LEVELS[i - 1]?.set === 1) r.add(L.id); });
  if (myAch.has('sklop-2')) LEVELS.forEach((L, i) => { if (L.set <= 2 || LEVELS[i - 1]?.set === 2) r.add(L.id); });
  return new Set(R.unlockedLevels(ORDER, r, { tourney: myAch.has('turnir') }));
}

/* ===================================================================== */
/*  Meni                                                                 */
/* ===================================================================== */

let menuView = 'main';
let boards = [];

function showMenu(view = 'main', arg) {
  stopPlay();
  menuView = view;
  document.body.classList.remove('kr-playing');
  $('#play').classList.add('mg-hidden');
  $('#menu').classList.remove('mg-hidden');
  audio.stopMusic();
  boards = [];
  const m = $('#menu');
  if (view === 'main') m.innerHTML = mainHtml();
  else if (view === 'trial') m.innerHTML = trialHtml(arg);
  else if (view === 'boards') m.innerHTML = boardsHtml();
  else if (view === 'settings') m.innerHTML = settingsHtml();
  else if (view === 'custom') m.innerHTML = customHtml();
  else if (view === 'community') m.innerHTML = communityHtml();
  else if (view === 'shared') m.innerHTML = '<div id="sharedBox"><div class="mg-empty"><span class="mg-spin"></span> Odpiram progo …</div></div>';
  bindMenu(view, arg);
  window.scrollTo({ top: 0 });
  if (!menuShow) startMenuShow();
}

function nextMidnight() { return util.dayStart(new Date(Date.now() + 864e5)); }
function fmtLeft(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)} h ${String(Math.floor(s / 60) % 60).padStart(2, '0')} min`;
}

function dailyInfo() {
  const seed = hub.dailySeed();
  const pick = R.dailyPick(hub.rng, seed, ORDER);
  const mod = R.DAILY_MODS.find(d => d.id === pick.mod);
  const official = !S.load(uk('daily:') + seed, false);
  return { seed, pick, mod, official };
}

function mainHtml() {
  const mu = mirrorUnlocked();
  const d = dailyInfo();
  const names = d.pick.levels.map(id => LEVELS.find(L => L.id === id)?.name).join(' · ');
  return `
  <div class="mg-stack">
    <div class="mg-card mg-card--glow kr-hero">
      <div class="kr-hero__icon" aria-hidden="true">🐹</div>
      <div class="mg-stack" style="gap:6px">
        <h1 class="mg-title" style="margin:0">Hrčkova krogla</h1>
        <p class="mg-muted" style="margin:0">Kotali hrčka v stekleni krogli po zračnih progah do cilja. <b>Življenj ni</b> — igra se na uro,
          preostali čas se prenese v naslednjo progo.</p>
        <div class="kr-row"><button class="mg-btn mg-btn--ghost mg-btn--small" data-act="help">Kako igrati</button>
          <button class="mg-btn mg-btn--ghost mg-btn--small" data-act="settings">⚙️ Nastavitve</button>
          <button class="mg-btn mg-btn--ghost mg-btn--small" data-act="boards">🏆 Lestvice</button>
          <a class="mg-btn mg-btn--pink mg-btn--small" href="${hub.link('games/rusilec/')}">💥 Rušilec (party)</a></div>
      </div>
    </div>
    <div class="kr-cards">
      <div class="mg-card">
        <h2 class="mg-title">Turnir</h2>
        <p class="mg-muted" style="margin:0">Vseh ${LEVELS.length} prog zapored s prenosom časa. Točke: 1000 na progo + 20 na preostalo sekundo + 100 na zvezdico.</p>
        <div class="kr-diffs">${R.DIFF_IDS.map(id => `<button class="mg-btn ${id === 'normalna' ? 'mg-btn--primary' : id === 'noro' ? 'mg-btn--pink' : 'mg-btn--cyan'}" data-act="tourney" data-diff="${id}">${R.DIFFS[id].name}</button>`).join('')}</div>
        <p class="mg-small mg-muted" style="margin:0">Lahka: ×1,4 časa, pol točk, nič se ne odklene. Noro: ×0,75 časa, ×1,5 točk.</p>
      </div>
      <div class="mg-card">
        <h2 class="mg-title">Na čas</h2>
        <p class="mg-muted" style="margin:0">Posamezne proge brez ure. Bron, srebro, zlato in ghost najboljše vožnje — tvoje ali s lestvice.</p>
        <div class="kr-best" id="trialSummary"></div>
        <button class="mg-btn mg-btn--green mg-btn--block" data-act="trial">Izberi progo</button>
      </div>
      <div class="mg-card">
        <h2 class="mg-title">Zrcalni turnir</h2>
        ${mu ? `<p class="mg-muted" style="margin:0">Vse proge zrcaljene po osi X. Ločena lestvica.</p>
          <div class="kr-diffs">${R.DIFF_IDS.map(id => `<button class="mg-btn mg-btn--ghost" data-act="mirror" data-diff="${id}">${R.DIFFS[id].name}</button>`).join('')}</div>`
        : `<p class="kr-lock">🔒 Odklene se, ko končaš turnir na Normalni ali Noro.</p>`}
      </div>
      <div class="mg-card">
        <h2 class="mg-title">Dnevni izziv</h2>
        <div class="kr-mod"><span>${d.mod.icon}</span><div><b>${esc(d.mod.name)}</b><div class="mg-small mg-muted">${esc(d.mod.desc)}</div></div></div>
        <p class="mg-small" style="margin:0">Proge: <b>${esc(names)}</b></p>
        <p class="mg-small mg-muted" style="margin:0">${d.official ? '🎯 Prvi poskus danes <b>šteje za lestvico</b>. Ostali so trening.' : '✅ Uradni poskus si že odigral — zdaj je trening (ne šteje).'}
          Nov izziv čez <b id="midnight">${fmtLeft(nextMidnight() - Date.now())}</b>.</p>
        <button class="mg-btn ${d.official ? 'mg-btn--pink' : 'mg-btn--ghost'} mg-btn--block" data-act="daily">${d.official ? 'Začni uradni poskus' : 'Trening'}</button>
      </div>
      <div class="mg-card">
        <h2 class="mg-title">Moje proge</h2>
        <p class="mg-muted" style="margin:0">Nariši svojo progo v urejevalniku, jo preizkusi in deli s prijatelji s povezavo. Lokalni rekordi in ghosti, brez uradnih lestvic.</p>
        <p class="mg-small" style="margin:0">Pripravljenih prog: <b>${CD.readyDrafts().length}</b></p>
        <div class="kr-row"><button class="mg-btn mg-btn--cyan" data-act="custom">Moje proge</button>
          <a class="mg-btn mg-btn--ghost" href="${editorUrl()}">✏️ Urejevalnik</a></div>
      </div>
      <div class="mg-card">
        <h2 class="mg-title">Proge skupnosti</h2>
        <p class="mg-muted" style="margin:0">Proge, ki so jih narisali in objavili drugi igralci. Vsaka ima svojo lestvico časov.
          Svojo objaviš v urejevalniku z gumbom »🌍 Objavi«.</p>
        <button class="mg-btn mg-btn--pink mg-btn--block" data-act="community">🌍 Proge skupnosti</button>
      </div>
    </div>
    <div class="mg-grid mg-grid--2">
      <div class="mg-card" id="boardMain"></div>
      <div class="mg-card"><h2 class="mg-title">Dosežki</h2><div class="kr-ach">${R.ACH.map(a => `<div class="kr-ach__item ${myAch.has(a.key) ? '' : 'locked'}">
        <span>${a.icon}</span><div><b>${esc(a.title)}</b><span class="mg-small mg-muted">${esc(a.desc)}</span></div></div>`).join('')}</div></div>
    </div>
  </div>`;
}

function trialHtml(sel) {
  const un = unlockedIds();
  const mir = !!S.load(uk('trialMirror'), false) && mirrorUnlocked();
  const sets = ['Vrt in kuhinja', 'Steklo, tovarna, stolp, led', 'Nevarnosti'];
  let html = `<button class="mg-btn mg-btn--ghost mg-btn--small kr-back" data-act="menu">← Meni</button>
  <div class="mg-card mg-stack">
    <div class="mg-row mg-row--between"><h2 class="mg-title" style="margin:0">Na čas</h2>
      ${mirrorUnlocked() ? `<label class="mg-check"><input type="checkbox" id="mirrorChk" ${mir ? 'checked' : ''}> Zrcaljeno</label>` : ''}</div>
    <p class="mg-muted mg-small" style="margin:0">Proga se odklene, ko jo dosežeš v turnirju na Normalni ali Noro.</p>
    <div class="kr-levels">`;
  let lastSet = 0;
  LEVELS.forEach((L, i) => {
    if (L.set !== lastSet) { html += `<div class="kr-set">Sklop ${L.set} · ${sets[L.set - 1]}</div>`; lastSet = L.set; }
    const lock = !un.has(L.id);
    const b = best[mkey(L.id, mir)];
    const md = b != null ? R.medalFor(L, b / 1000) : null;
    html += `<button class="kr-lvl ${lock ? 'locked' : ''}" data-lvl="${L.id}" ${lock ? 'aria-disabled="true"' : ''} aria-pressed="${sel === L.id}">
      <span class="kr-lvl__n">${String(i + 1).padStart(2, '0')}</span><span class="kr-lvl__name">${lock ? '🔒 ' : ''}${esc(L.name)}</span>
      <span class="kr-lvl__t">${b != null ? R.fmtTime(b) : '—'}</span>${md ? `<span class="kr-lvl__medal">${R.MEDAL[md].icon}</span>` : ''}</button>`;
  });
  html += `</div></div><div id="detail"></div>`;
  return html;
}

function boardsHtml() {
  return `<button class="mg-btn mg-btn--ghost mg-btn--small kr-back" data-act="menu">← Meni</button>
  <div class="mg-card mg-stack">
    <h2 class="mg-title" style="margin:0">Lestvice</h2>
    <div class="kr-row">
      <select class="mg-select" id="bMode" aria-label="Način">
        <option value="tourney">Turnir</option><option value="mirror">Zrcalni turnir</option><option value="daily">Dnevni izziv</option><option value="level">Proga (Na čas)</option><option value="level-m">Zrcaljena proga</option>
      </select>
      <select class="mg-select" id="bDiff" aria-label="Težavnost">${R.DIFF_IDS.map(d => `<option value="${d}" ${d === 'normalna' ? 'selected' : ''}>${R.DIFFS[d].name}</option>`).join('')}</select>
      <select class="mg-select mg-hidden" id="bLvl" aria-label="Proga">${LEVELS.map((L, i) => `<option value="${L.id}">${i + 1}. ${esc(L.name)}</option>`).join('')}</select>
    </div>
    <div id="bBoard"></div>
  </div>`;
}

function settingsHtml() {
  const opt = (v, cur, label) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  return `<button class="mg-btn mg-btn--ghost mg-btn--small kr-back" data-act="menu">← Meni</button>
  <div class="mg-card mg-stack" style="max-width:560px">
    <h2 class="mg-title" style="margin:0">Nastavitve</h2>
    <label class="mg-field"><span class="mg-label">Kontrole na računalniku</span>
      <select class="mg-select" id="sControl">${opt('auto', settings.control, 'Tipke in miška')}${opt('keys', settings.control, 'Samo tipke')}</select></label>
    <label class="mg-field"><span class="mg-label">Kontrole na telefonu</span>
      <select class="mg-select" id="sTouch">${opt('stick', settings.touch, 'Virtualna palica')}${opt('tilt', settings.touch, 'Nagib telefona')}</select></label>
    <div class="kr-row"><button class="mg-btn mg-btn--cyan mg-btn--small" id="sTiltOn">Vklopi nagib</button>
      <button class="mg-btn mg-btn--ghost mg-btn--small" id="sCalib">Kalibriraj (trenutni položaj = ravno)</button></div>
    <p class="mg-small mg-muted" id="sTiltInfo" style="margin:0"></p>
    <label class="mg-check"><input type="checkbox" id="sSfx" ${settings.sfx ? 'checked' : ''}> Zvočni učinki</label>
    <label class="mg-check"><input type="checkbox" id="sMusic" ${settings.music ? 'checked' : ''}> Glasba</label>
    <label class="mg-check"><input type="checkbox" id="sCam" ${settings.camRotate ? 'checked' : ''}> Kamera se rahlo zasuka v smeri gibanja</label>
    <label class="mg-field"><span class="mg-label">Kakovost</span>
      <select class="mg-select" id="sQ">${opt('auto', settings.quality, 'Samodejno (' + QUALITY[autoQuality()].name.toLowerCase() + ')')}${QUALITY_ORDER.map(q => opt(q, settings.quality, QUALITY[q].name)).join('')}</select></label>
    <label class="mg-check"><input type="checkbox" id="sPost" ${settings.post ? 'checked' : ''}> Post-processing (bloom, barvna korekcija, glajenje robov)</label>
    <label class="mg-check"><input type="checkbox" id="sDof" ${settings.dof ? 'checked' : ''}> Globinska ostrina ozadja (ultra/visoka)</label>
    <label class="mg-check"><input type="checkbox" id="sShake" ${settings.shakeCam ? 'checked' : ''}> Tresenje kamere ob udarcih</label>
    <label class="mg-check"><input type="checkbox" id="sFps" ${settings.fps ? 'checked' : ''}> Pokaži FPS</label>
  </div>`;
}

function bindMenu(view, arg) {
  const m = $('#menu');
  m.onclick = async e => {
    const b = e.target.closest('[data-act]');
    if (b) {
      audio.play('click');
      const act = b.dataset.act;
      if (act === 'menu') showMenu('main');
      else if (act === 'help') help();
      else if (act === 'settings') showMenu('settings');
      else if (act === 'boards') showMenu('boards');
      else if (act === 'trial') showMenu('trial');
      else if (act === 'tourney') startTourney(b.dataset.diff, false);
      else if (act === 'mirror') startTourney(b.dataset.diff, true);
      else if (act === 'daily') startDaily();
      else if (act === 'start-trial') startTrial(b.dataset.id);
      else if (act === 'custom') showMenu('custom');
      else if (act === 'community') showMenu('community');
      else if (act === 'comm-tab') { commTab = b.dataset.tab; showMenu('community'); }
      else if (act === 'comm-play') { if (commLevel) startCustom(commLevel.L, { community: commLevel.row }); }
      else if (act === 'comm-save') {
        if (!commLevel) return;
        CD.saveDraft({ key: CD.newKey(), L: commLevel.L, ready: true, verified: null, shared: true });
        b.disabled = true; b.textContent = '✔ Shranjeno med moje proge';
      }
      else if (act === 'comm-del') {
        if (commLevel && await ui.confirm('Umaknem to progo iz »Proge skupnosti«? Njena lestvica ne bo več dosegljiva.', { danger: true, yes: 'Umakni' })) {
          try { await hub.deleteLevel(commLevel.row.id); ui.toast('Objava umaknjena.', { icon: '🗑️' }); showMenu('community'); }
          catch (e) { ui.toast(e.message, { icon: '⚠️' }); }
        }
      }
      else if (act === 'start-custom') { const d = CD.getDraft(b.dataset.key); if (d) startCustom(d.L, { key: d.key }); }
      else if (act === 'unready-custom') {
        const d = CD.getDraft(b.dataset.key);
        if (d && await ui.confirm('Odstranim progo iz »Moje proge«? Osnutek ostane v urejevalniku.', { yes: 'Odstrani' })) { CD.saveDraft({ ...d, ready: false }); showMenu('custom'); }
      }
      return;
    }
    const lv = e.target.closest('[data-lvl]');
    const cm = e.target.closest('[data-comm]');
    if (cm && view === 'community') {
      m.querySelectorAll('.kr-lvl').forEach(x => x.setAttribute('aria-pressed', x === cm));
      communityDetail(cm.dataset.comm);
      return;
    }
    const cu = e.target.closest('[data-custom]');
    if (cu && view === 'custom') {
      m.querySelectorAll('.kr-lvl').forEach(x => x.setAttribute('aria-pressed', x === cu));
      customDetail(cu.dataset.custom);
      return;
    }
    if (lv && view === 'trial') {
      if (lv.classList.contains('locked')) { ui.toast('Progo najprej dosezi v turnirju (Normalna ali Noro).', { icon: '🔒' }); return; }
      m.querySelectorAll('.kr-lvl').forEach(x => x.setAttribute('aria-pressed', x === lv));
      trialDetail(lv.dataset.lvl);
    }
  };
  if (view === 'main') {
    boards.push(ui.leaderboard($('#boardMain'), {
      title: 'Turnir (Normalna)', format: R.fmtPts, order: 'desc',
      tabs: [{ label: 'Danes', seed: R.boardSeed.tourney('normalna'), period: 'today' }, { label: 'Teden', seed: R.boardSeed.tourney('normalna'), period: 'week' }, { label: 'Vseh časov', seed: R.boardSeed.tourney('normalna') }],
    }));
    const n = LEVELS.filter(L => best[mkey(L.id, false)] != null).length;
    const golds = LEVELS.filter(L => best[mkey(L.id, false)] != null && R.medalFor(L, best[mkey(L.id, false)] / 1000) === 'gold').length;
    $('#trialSummary').innerHTML = `<div><span class="mg-muted mg-small">Odklenjene</span><b>${unlockedIds().size}/${LEVELS.length}</b></div>
      <div><span class="mg-muted mg-small">Prevožene</span><b>${n}</b></div><div><span class="mg-muted mg-small">Zlato</span><b>${golds} 🥇</b></div>`;
    clearInterval(bindMenu._mid);
    bindMenu._mid = setInterval(() => { const el = $('#midnight'); if (el) el.textContent = fmtLeft(nextMidnight() - Date.now()); else clearInterval(bindMenu._mid); }, 30000);
    syncBest();
  }
  if (view === 'custom') fillCustomList(arg);
  if (view === 'community') fillCommunity(arg);
  if (view === 'trial') {
    $('#mirrorChk')?.addEventListener('change', e => { S.save(uk('trialMirror'), e.target.checked); showMenu('trial', arg); });
    if (arg) trialDetail(arg);
  }
  if (view === 'boards') {
    const draw = () => {
      const md = $('#bMode').value, df = $('#bDiff').value, lv = $('#bLvl').value;
      $('#bDiff').classList.toggle('mg-hidden', !['tourney', 'mirror'].includes(md));
      $('#bLvl').classList.toggle('mg-hidden', !md.startsWith('level'));
      let o;
      if (md === 'tourney' || md === 'mirror') {
        const seed = md === 'tourney' ? R.boardSeed.tourney(df) : R.boardSeed.mirror(df);
        o = { title: '', format: R.fmtPts, order: 'desc', tabs: [{ label: 'Danes', seed, period: 'today' }, { label: 'Teden', seed, period: 'week' }, { label: 'Vseh časov', seed }] };
      } else if (md === 'daily') {
        o = { title: '', format: R.fmtPts, order: 'desc', tabs: [{ label: 'Danes', seed: hub.dailySeed() }] };
      } else {
        const seed = R.boardSeed.level(lv, md === 'level-m');
        o = { title: '', format: R.fmtTime, order: 'asc', tabs: [{ label: 'Danes', seed, period: 'today' }, { label: 'Teden', seed, period: 'week' }, { label: 'Vseh časov', seed }] };
      }
      ui.leaderboard($('#bBoard'), o);
    };
    ['#bMode', '#bDiff', '#bLvl'].forEach(s => $(s).addEventListener('change', draw));
    draw();
  }
  if (view === 'settings') {
    const info = () => { $('#sTiltInfo').textContent = input?.tilt.on ? (input.tilt.ok ? 'Nagib je vklopljen.' : 'Čakam na senzor nagiba …') : 'Nagib zahteva dovoljenje (tapni »Vklopi nagib«).'; };
    $('#sControl').onchange = e => { settings.control = e.target.value; saveSettings(); };
    $('#sTouch').onchange = e => { settings.touch = e.target.value; saveSettings(); };
    $('#sTiltOn').onclick = async () => { ensureEngine(); const ok = await input.enableTilt(); ui.toast(ok ? 'Nagib vklopljen.' : 'Nagib ni na voljo.', { icon: ok ? '📱' : '⚠️' }); if (ok) { settings.touch = 'tilt'; saveSettings(); $('#sTouch').value = 'tilt'; } info(); };
    $('#sCalib').onclick = () => { ensureEngine(); input.calibrate(); ui.toast('Kalibrirano.', { icon: '🎯' }); };
    $('#sSfx').onchange = e => { settings.sfx = e.target.checked; audio.setSfx(settings.sfx); saveSettings(); };
    $('#sMusic').onchange = e => { settings.music = e.target.checked; audio.setMusic(settings.music); saveSettings(); };
    $('#sCam').onchange = e => { settings.camRotate = e.target.checked; saveSettings(); };
    $('#sQ').onchange = e => { settings.quality = e.target.value; saveSettings(); if (renderer) renderer.setQuality(initialQuality()); };
    $('#sFps').onchange = e => { settings.fps = e.target.checked; saveSettings(); };
    $('#sPost').onchange = e => { settings.post = e.target.checked; saveSettings(); renderer?.setOptions({ post: settings.post }); };
    $('#sDof').onchange = e => { settings.dof = e.target.checked; saveSettings(); renderer?.setOptions({ dof: settings.dof }); };
    $('#sShake').onchange = e => { settings.shakeCam = e.target.checked; saveSettings(); renderer?.setOptions({ shake: settings.shakeCam }); };
    info();
  }
}

/** Najboljši časi s strežnika (druge naprave) → lokalni predpomnilnik. */
let synced = false;
async function syncBest() {
  if (synced) return;
  synced = true;
  try {
    await Promise.all(LEVELS.flatMap(L => [false, true].map(async m => {
      const v = await hub.getMyBest({ seed: R.boardSeed.level(L.id, m), order: 'asc' });
      if (v != null && (best[mkey(L.id, m)] == null || v < best[mkey(L.id, m)])) best[mkey(L.id, m)] = v;
    })));
    S.save(uk('best'), best);
  } catch { /* brez povezave */ }
}

/* ------------------------------------------------------------ na čas: izbira proge in ghosta */

let ghostPick = null;   // { user_id, nickname, time_ms }

function trialDetail(id) {
  const L = LEVELS.find(x => x.id === id);
  const mir = !!S.load(uk('trialMirror'), false) && mirrorUnlocked();
  const b = best[mkey(id, mir)];
  ghostPick = null;
  const el = $('#detail');
  el.innerHTML = `<div class="kr-detail" style="margin-top:16px">
    <div class="mg-card mg-stack">
      <h2 class="mg-title" style="margin:0">${esc(L.name)}${mir ? ' 🪞' : ''}</h2>
      <p class="mg-muted" style="margin:0">${esc(L.desc || '')}</p>
      <div class="kr-medals"><span>🥇 ${L.medals.gold} s</span><span>🥈 ${L.medals.silver} s</span><span>🥉 ${L.medals.bronze} s</span></div>
      <div>Moj najboljši: <b>${b != null ? R.fmtTime(b) : '—'}</b> ${b != null && R.medalFor(L, b / 1000) ? R.MEDAL[R.medalFor(L, b / 1000)].icon : ''}</div>
      <div class="kr-ghostopt">
        <b>Ghosti</b>
        <label class="mg-check"><input type="checkbox" id="gMine" checked> Moj najboljši</label>
        <label class="mg-check"><input type="checkbox" id="gDev"> Razvijalčev (autopilot, ${L.dev?.time ?? '—'} s)</label>
        <div class="kr-sel" id="gSel">Klikni vrstico na lestvici za ghost drugega igralca.</div>
      </div>
      <button class="mg-btn mg-btn--green mg-btn--big mg-btn--block" data-act="start-trial" data-id="${id}">Vozi!</button>
      <p class="kr-kbd" style="margin:0">R = začni znova · Esc/P = pavza</p>
    </div>
    <div class="mg-card" id="trialBoard"></div>
  </div>`;
  const seed = R.boardSeed.level(id, mir);
  ui.leaderboard($('#trialBoard'), {
    title: 'Lestvica proge', format: R.fmtTime, order: 'asc',
    tabs: [{ label: 'Vseh časov', seed }, { label: 'Teden', seed, period: 'week' }, { label: 'Danes', seed, period: 'today' }],
    onRow: async (row, tr) => {
      const g = await hub.getGhost({ level: id, mirror: mir, userId: row.user_id });
      if (!g) { ui.toast(`${row.nickname} nima shranjenega ghosta za to progo.`, { icon: '👻' }); return; }
      ghostPick = { ...row, data: g.data, time_ms: g.time_ms };
      document.querySelectorAll('#trialBoard tr').forEach(x => x.classList.toggle('mg-sel', x === tr));
      $('#gSel').textContent = `👻 Izbran ghost: ${row.nickname} (${R.fmtTime(g.time_ms)})`;
    },
    rowHint: () => ' <span title="Izberi ghosta" aria-hidden="true">👻</span>',
  });
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ------------------------------------------------------------ moje proge (urejevalnik, deljenje) */

/** Povezava do urejevalnika (ohrani ?offline in ?igralec). */
function editorUrl(extra = '') {
  const q = ['offline', 'igralec'].filter(k => QS.has(k)).map(k => k + '=' + encodeURIComponent(QS.get(k)));
  if (extra) q.push(extra);
  return 'editor.html' + (q.length ? '?' + q.join('&') : '');
}

function customHtml() {
  return `<button class="mg-btn mg-btn--ghost mg-btn--small kr-back" data-act="menu">← Meni</button>
  <div class="mg-card mg-stack">
    <div class="mg-row mg-row--between"><h2 class="mg-title" style="margin:0">Moje proge</h2><a class="mg-btn mg-btn--ghost mg-btn--small" href="${editorUrl()}">✏️ Urejevalnik</a></div>
    <p class="mg-muted mg-small" style="margin:0">Proge iz urejevalnika, označene »✅ Pripravljeno«, in proge, ki so ti jih poslali. Igra se kot Na čas, <b>brez uradne lestvice</b>;
      rekord in ghost se shranita v tem brskalniku.</p>
    <div class="kr-levels" id="customList"></div>
  </div><div id="detail"></div>`;
}

function fillCustomList(sel) {
  const el = $('#customList');
  const list = CD.readyDrafts();
  const bm = CD.customBest();
  if (!list.length) {
    el.innerHTML = `<p class="mg-empty" style="grid-column:1/-1">Še nimaš pripravljenih prog. Odpri ✏️ urejevalnik, nariši progo, preveri rešljivost in jo označi »✅ Pripravljeno«.</p>`;
    return;
  }
  for (const d of list) {
    const L = d.L, b = bm[levelHash(L)];
    const md = b != null && L.medals ? R.medalFor(L, b / 1000) : null;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'kr-lvl'; btn.dataset.custom = d.key;
    btn.setAttribute('aria-pressed', d.key === sel);
    btn.innerHTML = `<span class="kr-lvl__n">${L.size[0]}×${L.size[1]}</span><span class="kr-lvl__name"></span>
      <span class="kr-lvl__t">${b != null ? R.fmtTime(b) : '—'}</span>${md ? `<span class="kr-lvl__medal">${R.MEDAL[md].icon}</span>` : ''}`;
    btn.querySelector('.kr-lvl__name').textContent = L.name;
    el.appendChild(btn);
  }
  if (sel) customDetail(sel);
}

function customDetail(key) {
  const d = CD.getDraft(key);
  if (!d) return;
  const L = d.L, b = CD.customBest()[levelHash(L)];
  const el = $('#detail');
  el.innerHTML = `<div class="mg-card mg-stack" style="margin-top:16px;max-width:560px">
      <h2 class="mg-title" style="margin:0"></h2>
      <p class="mg-muted" style="margin:0" id="cDesc"></p>
      ${L.medals ? `<div class="kr-medals"><span>🥇 ${L.medals.gold} s</span><span>🥈 ${L.medals.silver} s</span><span>🥉 ${L.medals.bronze} s</span></div>` : ''}
      <div>Moj rekord: <b>${b != null ? R.fmtTime(b) : '—'}</b>${CD.customGhost(levelHash(L)) ? ' · 👻 ghost shranjen' : ''}</div>
      <button class="mg-btn mg-btn--green mg-btn--big mg-btn--block" data-act="start-custom" data-key="${esc(key)}">Vozi!</button>
      <div class="kr-row"><a class="mg-btn mg-btn--ghost mg-btn--small" href="${editorUrl('draft=' + encodeURIComponent(key))}">✏️ Uredi</a>
        <button class="mg-btn mg-btn--ghost mg-btn--small" data-act="unready-custom" data-key="${esc(key)}">Odstrani iz »Moje proge«</button></div>
      <p class="kr-kbd" style="margin:0">R = začni znova · Esc/P = pavza</p>
    </div>`;
  el.querySelector('h2').textContent = L.name;
  el.querySelector('#cDesc').textContent = L.desc || '';
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Proga iz povezave ?custom= (deljenje brez strežnika): preveri, nato »Igraj« ali »Shrani med moje proge«. */
async function showShared(data) {
  showMenu('shared');
  const box = $('#sharedBox');
  let L;
  try { L = await decodeLevel(data); }
  catch (e) {
    box.innerHTML = `<div class="mg-card mg-stack" style="max-width:560px"><h2 class="mg-title" style="margin:0">😕 Povezava do proge ne deluje</h2>
      <p class="mg-muted" style="margin:0" id="shErr"></p>
      <p class="mg-small mg-muted" style="margin:0">Morda je bila povezava odrezana pri kopiranju. Prosi pošiljatelja, naj ti progo pošlje znova ali kot datoteko JSON (urejevalnik → 📁 Proge → Odpri datoteko).</p>
      <div class="kr-row"><button class="mg-btn mg-btn--primary" data-act="menu">Na meni</button><a class="mg-btn mg-btn--ghost" href="${editorUrl()}">✏️ Urejevalnik</a></div></div>`;
    box.querySelector('#shErr').textContent = e.message;
    clearCustomParam();
    return;
  }
  const hash = levelHash(L);
  const have = CD.listDrafts().find(d => levelHash(d.L) === hash);
  box.innerHTML = `<div class="mg-card mg-card--glow mg-stack" style="max-width:560px">
      <p class="mg-small mg-muted" style="margin:0">🔗 Prejel si progo</p>
      <h2 class="mg-title" style="margin:0"></h2>
      <p class="mg-muted" style="margin:0" id="shDesc"></p>
      <p class="mg-small" style="margin:0">${L.size[0]}×${L.size[1]} ploščic${L.medals ? ` · 🥇 ${L.medals.gold} s · 🥈 ${L.medals.silver} s · 🥉 ${L.medals.bronze} s` : ''}</p>
      <div class="kr-row"><button class="mg-btn mg-btn--green mg-btn--big" id="shPlay">Igraj</button>
        <button class="mg-btn mg-btn--cyan" id="shSave" ${have ? 'disabled' : ''}>${have ? '✔ Že med mojimi progami' : '💾 Shrani med moje proge'}</button>
        <button class="mg-btn mg-btn--ghost" data-act="menu">Na meni</button></div>
      <p class="mg-small mg-muted" style="margin:0">Lastne proge nimajo uradne lestvice; rekord in ghost se shranita v tem brskalniku.</p></div>`;
  box.querySelector('h2').textContent = L.name;
  box.querySelector('#shDesc').textContent = L.desc || '';
  box.querySelector('#shPlay').onclick = () => startCustom(L, { key: have?.key || null });
  box.querySelector('#shSave').onclick = e => {
    const key = CD.newKey();
    CD.saveDraft({ key, L, ready: true, verified: null, shared: true });
    e.target.disabled = true; e.target.textContent = '✔ Shranjeno med moje proge';
    box.querySelector('#shPlay').onclick = () => startCustom(L, { key });
    ui.toast('Proga je med »Moje proge«.', { icon: '💾' });
  };
  clearCustomParam();
}

/** Odstrani ?custom= iz naslova (osvežitev ne odpre proge znova, naslov ostane kratek). */
function clearCustomParam() {
  try { const u = new URL(location.href); u.searchParams.delete('custom'); u.searchParams.delete('play'); u.searchParams.delete('community'); history.replaceState(null, '', u.pathname + u.search); } catch { /* */ }
}

/** Igraj lastno progo (Na čas brez uradne lestvice, lokalni rekord in ghost). */
function startCustom(L, { key = null, community = null } = {}) {
  const errs = validateLevel(L);
  if (errs.length) { ui.toast('Proga ni veljavna: ' + errs[0].replace(/^proga[^:]*: /, ''), { icon: '⚠️', duration: 4000 }); return; }
  clearCustomParam();
  const hash = levelHash(L);
  const ghosts = [];
  const g = CD.customGhost(hash);
  if (g) try { ghosts.push({ frames: decode(g), color: '#4de1ff', label: 'Jaz' }); } catch { /* pokvarjen */ }
  mode = { kind: 'trial', custom: { hash, key, community }, mirror: false, levels: [L], idx: 0, phys: {}, ghosts };
  if (community) hub.levelPlayed(community.id);
  enterPlay();
  startLevel();
}

/* ------------------------------------------------------------ proge skupnosti (Supabase / offline adapter) */

const COMM_SEED = id => 'custom:' + id;   // lestvica proge v game_scores
let commTab = 'new';                       // 'new' | 'popular' | 'mine'
let commLevel = null;                      // { row, L } izbrana proga

function communityHtml() {
  const tab = (id, label) => `<button class="mg-tab" role="tab" aria-selected="${commTab === id}" data-act="comm-tab" data-tab="${id}">${label}</button>`;
  return `<button class="mg-btn mg-btn--ghost mg-btn--small kr-back" data-act="menu">← Meni</button>
  <div class="mg-card mg-stack">
    <div class="mg-row mg-row--between"><h2 class="mg-title" style="margin:0">🌍 Proge skupnosti</h2><a class="mg-btn mg-btn--ghost mg-btn--small" href="${editorUrl()}">✏️ Urejevalnik</a></div>
    <p class="mg-muted mg-small" style="margin:0">Proge drugih igralcev. Vsaka ima svojo lestvico (na časten način); ne vplivajo na turnir, odklepe, dnevni izziv in dosežke.
      ${hub.offline ? '<b style="color:var(--mg-yellow)">Offline način: vidne so le proge, objavljene v tem brskalniku.</b>' : ''}</p>
    <div class="mg-tabs" role="tablist">${tab('new', 'Najnovejše')}${tab('popular', 'Najbolj igrane')}${tab('mine', 'Moje objave')}</div>
    <div class="kr-levels" id="commList"><div class="mg-empty" style="grid-column:1/-1"><span class="mg-spin"></span></div></div>
  </div><div id="detail"></div>`;
}

async function fillCommunity(sel) {
  const el = $('#commList');
  let list;
  try { list = await hub.listLevels({ sort: commTab === 'popular' ? 'popular' : 'new', limit: 60, userId: commTab === 'mine' ? hub.userId : null }); }
  catch (e) { console.warn(e); if (el.isConnected) el.innerHTML = '<p class="mg-empty" style="grid-column:1/-1">Prog ni bilo mogoče naložiti. Poskusi znova kasneje.</p>'; return; }
  if (!el.isConnected) return;
  el.innerHTML = '';
  if (!list.length) {
    el.innerHTML = `<p class="mg-empty" style="grid-column:1/-1">${commTab === 'mine' ? 'Nisi še objavil nobene proge. V urejevalniku jo preveri in klikni »🌍 Objavi«.' : 'Ni še objavljenih prog — bodi prvi!'}</p>`;
  }
  const bm = CD.customBest();
  for (const r of list) {
    const b = bm[r.hash];
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'kr-lvl'; btn.dataset.comm = r.id;
    btn.setAttribute('aria-pressed', r.id === sel);
    btn.innerHTML = `<span class="kr-lvl__n">${r.width}×${r.depth} · ▶ ${r.plays}</span><span class="kr-lvl__name"></span>
      <span class="kr-lvl__t">${ui.who(r)}</span><span class="kr-lvl__t">${b != null ? 'moj ' + R.fmtTime(b) : 'autopilot ' + R.fmtTime(r.dev_ms)}</span>`;
    btn.querySelector('.kr-lvl__name').textContent = r.name;
    el.appendChild(btn);
  }
  if (sel) communityDetail(sel);
}

async function communityDetail(id) {
  const el = $('#detail');
  el.innerHTML = '<div class="mg-card mg-empty" style="margin-top:16px"><span class="mg-spin"></span></div>';
  commLevel = null;
  let row = null, L = null, err = null;
  try {
    row = await hub.getLevel(id);
    if (!row) err = 'Te proge ni (več) med progami skupnosti.';
    else L = sanitizeLevel(row.data);
  } catch (e) { err = e.message || 'Proge ni bilo mogoče naložiti.'; }
  if (!el.isConnected) return;
  if (err) {
    el.innerHTML = '<div class="mg-card mg-stack" style="margin-top:16px;max-width:560px"><h2 class="mg-title" style="margin:0">😕 Proge ni mogoče odpreti</h2><p class="mg-muted" style="margin:0"></p></div>';
    el.querySelector('p').textContent = err;
    return;
  }
  commLevel = { row, L };
  const mine = row.user_id === hub.userId;
  const hash = levelHash(L);
  const b = CD.customBest()[hash];
  const have = CD.listDrafts().some(d => levelHash(d.L) === hash);
  el.innerHTML = `<div class="kr-detail" style="margin-top:16px">
    <div class="mg-card mg-stack">
      <h2 class="mg-title" style="margin:0"></h2>
      <p class="mg-muted" style="margin:0" id="cmDesc"></p>
      <div class="kr-row mg-small">Avtor: ${ui.who(row)}</div>
      <div class="mg-small mg-muted">${row.width}×${row.depth} ploščic · igralo ${row.plays} · autopilot ${R.fmtTime(row.dev_ms)}</div>
      ${L.medals ? `<div class="kr-medals"><span>🥇 ${L.medals.gold} s</span><span>🥈 ${L.medals.silver} s</span><span>🥉 ${L.medals.bronze} s</span></div>` : ''}
      <div>Moj rekord: <b>${b != null ? R.fmtTime(b) : '—'}</b>${CD.customGhost(hash) ? ' · 👻 ghost' : ''}</div>
      <button class="mg-btn mg-btn--green mg-btn--big mg-btn--block" data-act="comm-play">Vozi!</button>
      <div class="kr-row"><button class="mg-btn mg-btn--ghost mg-btn--small" data-act="comm-save" ${have ? 'disabled' : ''}>${have ? '✔ Že med mojimi progami' : '💾 Shrani med moje proge'}</button>
        ${mine ? '<button class="mg-btn mg-btn--danger mg-btn--small" data-act="comm-del">Umakni objavo</button>' : ''}</div>
      <p class="kr-kbd" style="margin:0">R = začni znova · Esc/P = pavza</p>
    </div>
    <div class="mg-card" id="commBoard"></div>
  </div>`;
  el.querySelector('h2').textContent = row.name;
  el.querySelector('#cmDesc').textContent = L.desc || '';
  const seed = COMM_SEED(id);
  ui.leaderboard($('#commBoard'), {
    title: 'Lestvica proge', format: R.fmtTime, order: 'asc',
    tabs: [{ label: 'Vseh časov', seed }, { label: 'Teden', seed, period: 'week' }, { label: 'Danes', seed, period: 'today' }],
  });
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function help() {
  ui.modal({
    title: 'Kako igrati', wide: true,
    html: `<div class="mg-stack" style="text-align:left">
      <p><b>Cilj:</b> pripelji kroglo do <b style="color:var(--mg-yellow)">zlatega obroča</b>. Krogla ima vztrajnost — pospešuje, drsi, se odbija in pada. Skakati ne moreš.</p>
      <p><b>Ura:</b> na začetku vsake proge dobiš nekaj sekund. Kar ostane, se prenese naprej. Ko ura pride na 0, je konec.
        ⏱️ ure prinesejo +3 s, ⭐ zvezdice (5 na progo) prinesejo točke.</p>
      <p><b>Padec čez rob</b> te vrne na zadnjo 🚩 kontrolno točko (zastavica se obarva, ko se je dotakneš). Ura medtem teče.</p>
      <p><b>Kontrole:</b> puščice ali WASD; miška: krogla se kotali proti kazalcu (dlje je kazalec, hitreje gre).
        Telefon: palica levo spodaj ali nagib (Nastavitve). <span class="mg-kbd">R</span> = na kontrolno točko (−2 s) oz. v načinu Na čas začni znova.
        <span class="mg-kbd">Esc</span>/<span class="mg-kbd">P</span> = pavza.</p>
      <p><b>Nevarnosti:</b> padajoče ploščice se zatresejo, preden padejo; kladiva se dvignejo in zasvetijo rdeče; magneti utripajo pred vklopom;
        nasilneži te lovijo v svojem območju; žage in ose sledijo vzorcu — opazuj in počakaj na pravi trenutek.</p>
      <p><b>Načini:</b> Turnir (vse proge), Na čas (medalje, ghosti), Zrcalni turnir (po končanem turnirju), Dnevni izziv (3 proge in dodatek dneva, prvi poskus šteje).</p>
    </div>`,
  });
}

/* ===================================================================== */
/*  Motor (canvas, vhod, zanka)                                          */
/* ===================================================================== */

let autoQ = null;
function autoQuality() { return autoQ || (autoQ = detectQuality()); }

function initialQuality() {
  if (DEV_Q && QUALITY[DEV_Q]) return DEV_Q;
  if (settings.quality !== 'auto' && QUALITY[settings.quality]) return settings.quality;
  return autoQuality();
}

let engineFailed = false;
function ensureEngine() {
  if (renderer || engineFailed) return !!renderer;
  const opts = { post: settings.post, dof: settings.dof, shake: settings.shakeCam, onLost: () => ui.toast('Grafika je bila ponastavljena — kakovost: Nizka.', { icon: '⚙️', duration: 2600 }) };
  try { renderer = new Renderer($('#cv'), { quality: initialQuality(), ...opts }); }
  catch (e) {
    // brez WebGL: poskusi še nizko kakovost, sicer jasno sporočilo namesto črnega zaslona
    try { renderer = new Renderer($('#cv'), { quality: 'low', ...opts }); }
    catch (e2) { console.warn('WebGL ni na voljo', e2); engineFailed = true; ui.toast('Ta naprava ne podpira 3D grafike (WebGL).', { icon: '⚠️', duration: 5000 }); return false; }
  }
  if (BOT || DEV_LVL || QS.has('dev')) window.__kr = { renderer, get play() { return play || menuShow && { world: menuShow.world, L: menuShow.L }; } };   // samo za razvojne meritve
  input = new Input($('#play'), { stickEl: $('#stick'), knobEl: $('#knob') });
  addEventListener('resize', () => renderer.resize());
  $('#btnPause').onclick = () => togglePause();
  $('#btnMute').onclick = () => {
    const on = !(settings.sfx || settings.music);
    settings.sfx = settings.music = on; saveSettings();
    audio.setSfx(on); audio.setMusic(on); if (on) audio.startMusic(play?.L.set || 1);
    $('#btnMute').textContent = on ? '🔊' : '🔇';
  };
  $('#btnR').onclick = () => pressR();
  addEventListener('keydown', e => {
    if (!play || $('#play').classList.contains('mg-hidden')) return;
    if (document.querySelector('.mg-modal-back')) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); togglePause(); }
    else if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); pressR(); }
    else if ((e.code === 'Enter' || e.code === 'Space') && play.next) { e.preventDefault(); const f = play.next; play.next = null; f(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && play?.state === 'run') pause(); });
  // med odštevanjem tipka ali dotik preskoči uvodni prelet kamere
  const skip = () => { if (play?.state === 'count') renderer.skipIntro(); };
  addEventListener('keydown', skip); $('#play').addEventListener('pointerdown', skip);
  requestAnimationFrame(frame);
  prewarmIdle();
  return true;
}

/** V času mirovanja pripravi teksture in okolje vseh lokacij (hitrejše nalaganje prog). */
function prewarmIdle() {
  const list = [...LEVELS];
  const idle = window.requestIdleCallback || (f => setTimeout(() => f({ timeRemaining: () => 8 }), 200));
  const next = () => idle(() => { const L = list.shift(); if (!L || !renderer) return; if (!renderer.isWarm(L)) renderer.prewarm(L); next(); }, { timeout: 3000 });
  setTimeout(next, 1500);
}

/* ------------------------------------------------------------ 3D prelet za menijem */

let menuShow = null;   // { L, world, pilot, acc, prevBall, rendered, deadT }

function menuLevel() {
  const pool = LEVELS.filter(L => (L.route || []).length);
  const day = Math.floor(Date.now() / 864e5);
  return pool[(day + (menuShow?.n || 0)) % pool.length];
}

function startMenuShow() {
  if (!LEVELS.length || BOT || DEV_LVL) return;
  if (!ensureEngine()) return;
  const host = $('#menuBg');
  if ($('#cv').parentElement !== host) host.appendChild($('#cv'));
  document.body.classList.add('kr-has-bg');
  const n = (menuShow?.n || 0) + 1;
  const L = menuLevel();
  const world = createWorld(L);
  renderer.load(L, world, skin, { menu: true });
  renderer.resize();
  menuShow = { L, world, pilot: pilot(world, L.route || []), acc: 0, prevBall: { x: world.ball.x, y: world.ball.y, z: world.ball.z }, rendered: 0, deadT: 0, n };
}

function stopMenuShow() {
  menuShow = null;
  document.body.classList.remove('kr-has-bg');
}

function menuFrame(dt) {
  const m = menuShow, w = m.world;
  // nizka kakovost ali zmanjšano gibanje: statično ozadje (ena sličica)
  const still = renderer.qualityKey === 'low' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still && m.rendered > 2) return;
  if (!still) {
    m.acc += dt;
    let n = 0;
    while (m.acc >= STEP && n < 20) { m.prevBall = { x: w.ball.x, y: w.ball.y, z: w.ball.z }; w.events.length = 0; const [ix, iz] = m.pilot(); step(w, ix, iz); m.acc -= STEP; n++; }
    if (n >= 20) m.acc = 0;
    m.deadT = w.dead ? m.deadT + dt : 0;
    if (w.finished || m.deadT > 3 || w.t > 150) { startMenuShow(); return; }
  }
  const a = Math.min(1, m.acc / STEP), b = w.ball, pb = m.prevBall;
  renderer.render(w, { x: pb.x + (b.x - pb.x) * a, y: pb.y + (b.y - pb.y) * a, z: pb.z + (b.z - pb.z) * a }, still ? 0.016 : dt, { menu: true, rotate: false });
  m.rendered++;
}

let last = performance.now();
let fpsAcc = 0, fpsN = 0, lowFor = 0;
let lastHammer = new Map();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (menuShow && !play && !document.hidden) { menuFrame(dt); return; }
  if (!play || $('#play').classList.contains('mg-hidden')) return;
  const w = play.world;
  if (play.state === 'run') {
    play.acc += dt;
    let n = 0;
    while (play.acc >= STEP && n < 30 && play.state === 'run') { simStep(); play.acc -= STEP; n++; }
    if (n >= 30) play.acc = 0;
  }
  const a = play.state === 'run' ? Math.min(1, play.acc / STEP) : 1;
  const b = w.ball, pb = play.prevBall;
  const bp = { x: pb.x + (b.x - pb.x) * a, y: pb.y + (b.y - pb.y) * a, z: pb.z + (b.z - pb.z) * a };
  renderer.render(w, bp, play.state === 'pause' ? 0 : dt, { rotate: settings.camRotate });
  const sp = renderer.project(bp.x, bp.y, bp.z);
  input.setBall(sp.x, sp.y);
  audio.roll(play.state === 'run' ? Math.hypot(b.vx, b.vz) : 0, b.grounded, b.surf);
  hud();
  // FPS in samodejna kakovost
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1) {
    const fps = fpsN / fpsAcc;
    $('#fps').classList.toggle('mg-hidden', !settings.fps);
    if (settings.fps) $('#fps').textContent = `${Math.round(fps)} fps · ${QUALITY[renderer.qualityKey].name}`;
    if (settings.quality === 'auto' && !DEV_Q && play.state === 'run' && !document.hidden) {
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

function simStep() {
  const w = play.world;
  const b = w.ball;
  play.prevBall = { x: b.x, y: b.y, z: b.z };
  input.mode = settings.control;
  input.touchMode = settings.touch;
  const [ix, iz] = play.pilot ? play.pilot() : input.world(renderer.cam.yaw);
  w.events.length = 0;
  step(w, ix, iz);
  play.rec.sample(w.t, b);
  for (const e of w.events) onEvent(e);
  checkSecrets(w, b);
  // opozorila (telegraf) za kladiva in magnete v bližini
  (w.L.hammers || []).forEach((h, k) => {
    const ph = hammerPhase(w, h).ph;
    if (ph !== lastHammer.get(k)) {
      lastHammer.set(k, ph);
      const near = Math.hypot(b.x - h.x - h.w / 2, b.z - h.z - h.d / 2) < 6;
      if (near && ph === 'warn') audio.play('warn');
      if (near && ph === 'strike') { audio.play('hammer'); renderer.shake(0.18); }
    }
  });
  w.magnets.forEach((mg, k) => {
    const on = magnetState(w, mg).on;
    const key = 'm' + k;
    if (on !== lastHammer.get(key)) { lastHammer.set(key, on); if (on && Math.hypot(b.x - mg.x, b.z - mg.z) < (mg.range || 3.5) + 2) audio.play('warn'); }
  });
  if (mode.kind !== 'trial' && play.state === 'run' && !w.finished) {
    const before = mode.run.clock;
    if (R.tick(mode.run, STEP)) { gameOver(); return; }
    if (before <= 10 && Math.floor(before) !== Math.floor(mode.run.clock)) audio.play('tick');
  }
}

function onEvent(e) {
  const w = play.world, b = w.ball;
  switch (e.type) {
    case 'star': audio.play('star'); renderer.burst(b.x, b.y, b.z, '#ffd23f', 18); msg('★'); break;
    case 'clock':
      audio.play('clock'); renderer.burst(b.x, b.y, b.z, '#39ff88', 12);
      if (mode.kind !== 'trial') { mode.run.clock += R.CLOCK_BONUS; msg(`+${R.CLOCK_BONUS} s`); }
      break;
    case 'checkpoint': audio.play('checkpoint'); renderer.burst(b.x, b.y + 0.5, b.z, play.L.theme?.accent || '#39ff88', 22); msg('Kontrolna točka'); break;
    case 'fall': audio.play('fall'); play.falls++; msg('Padec!'); break;
    case 'respawn': audio.play('respawn'); break;
    case 'goal': levelDone(); break;
    case 'spring': {
      audio.play('spring');
      const sp = (play.L.springs || []).reduce((best, s) => { const d = (s.x - b.x) ** 2 + (s.z - b.z) ** 2; return !best || d < best.d ? { s, d } : best; }, null);
      if (sp) renderer.springFired(sp.s);
      break;
    }
    case 'hammer': renderer.shake(0.3); break;
    case 'saw': audio.play('saw'); renderer.shake(0.2); renderer.burst(b.x, b.y, b.z, '#ff3b5c', 10); break;
    case 'wasp': audio.play('wasp'); break;
    case 'bully': audio.play('bully'); renderer.shake(Math.min(0.3, e.v * 0.04)); break;
    case 'bumper': audio.play('bumper'); break;
    case 'bump': audio.play('bump', e.v); renderer.impact(b, e.v, 'bump'); break;
    case 'land': audio.play('land'); renderer.impact(b, 2.5, 'land'); break;
    case 'shake': audio.play('shake'); break;
    case 'switch': audio.play('switch'); msg('Vrata odprta!'); break;
  }
}

/* ------------------------------------------------------------ skrite ključavnice (Rušilec) */

const locksKey = 'krogla:locks';
/** Komaj vidne ključavnice na stranskih poteh (le še neodklenjene). Zunaj fizike: ne vplivajo na čas ali ghost. */
function addSecrets(L, world) {
  const have = S.load(locksKey, []);
  return secretsFor(L).filter(sc => !have.includes(sc.arena)).map(sc => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffd36a', metalness: 0.9, roughness: 0.25, emissive: '#ffb020', emissiveIntensity: 0.35, transparent: true, opacity: 0.32, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 20), mat);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.035), mat);
    shaft.position.y = -0.17;
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.035), mat);
    bit.position.set(0.04, -0.25, 0);
    g.add(ring, shaft, bit);
    const gy = groundBelowSafe(world, sc.x, sc.z);
    g.position.set(sc.x, gy + 0.45, sc.z);
    renderer.level.add(g);
    return { sc, g, gy, taken: false };
  });
}
function groundBelowSafe(world, x, z) {
  const i = Math.floor(z) * world.g.W + Math.floor(x);
  const h = world.g.h[i];
  return Number.isFinite(h) ? h : 0;
}
function checkSecrets(w, b) {
  for (const k of play.secrets || []) {
    if (k.taken) continue;
    if (k.g.parent !== renderer.level) renderer.level.add(k.g);   // sprememba kakovosti ponovno zgradi sceno
    k.g.rotation.y = w.t * 1.6;
    k.g.position.y = k.gy + 0.45 + Math.sin(w.t * 2.4) * 0.05;
    if (!touches(k.sc, b, k.gy)) continue;
    k.taken = true;
    k.g.visible = false;
    renderer.burst(k.sc.x, k.gy + 0.5, k.sc.z, '#ffd23f', 26, 3);
    audio.play('checkpoint');
    const have = S.load(locksKey, []);
    if (!have.includes(k.sc.arena)) S.save(locksKey, [...have, k.sc.arena]);
    ui.toast(`Odklenil si areno ${k.sc.name} v Rušilcu!`, { icon: '🗝️', duration: 4000 });
    hub.unlock(lockKey(k.sc.arena), { title: 'Ključavnica: ' + k.sc.name, icon: '🗝️' });
  }
}

let msgT = 0;
function msg(text, ms = 1100) {
  const el = $('#msg');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(msgT);
  msgT = setTimeout(() => el.classList.remove('on'), ms);
}

function hud() {
  const w = play.world;
  const clock = $('#hudClock'), sub = $('#hudSub');
  if (mode.kind === 'trial') {
    clock.textContent = R.fmtTime((play.state === 'run' || play.state === 'pause' || play.state === 'done') ? w.t * 1000 : 0);
    clock.classList.remove('low');
    const bb = mode.custom ? CD.customBest()[mode.custom.hash] : best[mkey(play.base.id, mode.mirror)];
    sub.textContent = bb != null ? `rekord ${R.fmtTime(bb)}` : '';
  } else {
    clock.textContent = R.fmtClock(mode.run.clock);
    clock.classList.toggle('low', mode.run.clock < 10);
    sub.textContent = mode.kind === 'daily' ? (mode.official ? 'uradni poskus' : 'trening') : '';
  }
  $('#hudStars').textContent = `★ ${w.stars}/5`;
  $('#hudPts').textContent = mode.kind === 'trial' ? '' : R.fmtPts(mode.run.points) + ' t';
}

/* ===================================================================== */
/*  Načini                                                               */
/* ===================================================================== */

function enterPlay() {
  ensureEngine();
  stopMenuShow();
  if ($('#cv').parentElement !== $('#play')) $('#play').prepend($('#cv'));
  document.body.classList.add('kr-playing');
  $('#menu').classList.add('mg-hidden');
  $('#play').classList.remove('mg-hidden');
  $('#overlay').classList.add('mg-hidden');
  renderer.resize();
  const touchStick = isTouch && settings.touch === 'stick';
  $('#stick').classList.toggle('mg-hidden', !touchStick);
  $('#btnR').classList.toggle('mg-hidden', !isTouch);
  $('#btnMute').textContent = settings.sfx || settings.music ? '🔊' : '🔇';
  input.enabled = true;
  if (settings.touch === 'tilt' && isTouch && !input.tilt.on) input.enableTilt();
  last = performance.now();
}

function startTourney(diff, mirror) {
  mode = {
    kind: mirror ? 'mirror' : 'tourney', diff, mirror, levels: LEVELS, idx: 0, run: R.newRun(diff), phys: {}, timeMul: 1, xpLevels: 0,
  };
  enterPlay();
  startLevel();
}

async function startDaily() {
  const d = dailyInfo();
  // rezultat na strežniku (druga naprava) → ta poskus je trening
  if (d.official) {
    try {
      if (await hub.getMyBest({ seed: d.seed, order: 'desc' }) != null) {
        d.official = false;
        ui.toast('Uradni poskus si danes že odigral — to je trening.', { icon: '🎯', duration: 3500 });
      }
    } catch { /* brez povezave */ }
  }
  S.save(uk('daily:') + d.seed, true);   // šteje prvi začeti poskus
  mode = {
    kind: 'daily', diff: 'normalna', mirror: !!d.mod.mirror, levels: d.pick.levels.map(id => LEVELS.find(L => L.id === id)),
    idx: 0, run: R.newRun('normalna'), phys: d.mod.phys || {}, timeMul: d.mod.time || 1, mod: d.mod, official: d.official, seed: d.seed,
  };
  enterPlay();
  startLevel();
}

async function startTrial(id) {
  const L = LEVELS.find(x => x.id === id);
  const mir = !!S.load(uk('trialMirror'), false) && mirrorUnlocked();
  const ghosts = [];
  if ($('#gMine')?.checked) {
    let data = S.load(uk(`ghost:${id}:${mir ? 1 : 0}`), null);
    if (!data) { const g = await hub.getGhost({ level: id, mirror: mir }); data = g?.data || null; }
    if (data) try { ghosts.push({ frames: decode(data), color: '#4de1ff', label: 'Jaz' }); } catch { /* pokvarjen */ }
  }
  if (ghostPick?.data) try { ghosts.push({ frames: decode(ghostPick.data), color: '#ff4fd8', label: ghostPick.nickname }); } catch { /* */ }
  if ($('#gDev')?.checked) {
    const res = runAutopilot(mir ? mirrorLevel(L) : L);
    if (res.finished) ghosts.push({ frames: res.frames, color: '#ffd23f', label: 'Razvijalec' });
  }
  mode = { kind: 'trial', mirror: mir, levels: [L], idx: 0, phys: {}, ghosts };
  enterPlay();
  startLevel();
}

async function startLevel() {
  const my = ++token;
  const base = mode.levels[mode.idx];
  let L = mode.mirror ? mirrorLevel(base) : base;
  if (mode.kind === 'daily' && mode.mod.clocks) L = R.withExtraClocks(L);
  if (mode.kind === 'trial') L = { ...L, pickups: (L.pickups || []).filter(p => p.t !== 'clock') };
  const world = createWorld(L, mode.phys);
  // nalagalnik, če teksture lokacije še niso pripravljene (prvo nalaganje lahko traja > 300 ms)
  if (!renderer.isWarm(L)) {
    $('#loader').classList.remove('mg-hidden');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (my !== token) return;
  }
  renderer.load(L, world, skin);
  $('#loader').classList.add('mg-hidden');
  renderer.setGhosts(mode.kind === 'trial' ? mode.ghosts : []);
  lastHammer = new Map();
  play = { L, base, world, rec: new Recorder(), acc: 0, state: 'count', prevBall: { x: world.ball.x, y: world.ball.y, z: world.ball.z }, falls: 0, token: my, pilot: BOT ? pilot(world, L.route || []) : null };
  play.rec.sample(0, world.ball);
  play.secrets = mode.custom ? [] : addSecrets(L, world);
  $('#overlay').classList.add('mg-hidden');
  // oznaka proge
  const n = mode.idx + 1, total = mode.levels.length;
  $('#hudLevel').textContent = mode.custom ? '✏️ ' + base.name : mode.kind === 'trial' ? `${ORDER.indexOf(base.id) + 1}. ${base.name}` : `${n}/${total} · ${base.name}`;
  const modeTxt = { tourney: `Turnir · ${R.DIFFS[mode.diff]?.name}`, mirror: `Zrcalo · ${R.DIFFS[mode.diff]?.name}`, daily: `Dnevni · ${mode.mod?.name}`, trial: mode.custom?.community ? 'Proga skupnosti' : mode.custom ? 'Moja proga · brez lestvice' : mode.mirror ? 'Na čas · zrcaljeno' : 'Na čas' }[mode.kind];
  $('#hudMode').textContent = modeTxt; $('#hudMode').classList.remove('mg-hidden');
  let add = 0;
  if (mode.kind !== 'trial') {
    add = R.startLevel(mode.run, base, mode.timeMul);
    if (mode.kind === 'tourney' && R.countsForUnlock(mode.diff)) { reached.add(base.id); S.save(uk('reached'), [...reached]); }
  }
  const ban = $('#banner');
  // ime in opis vedno kot besedilo (lastne proge so lahko od drugod)
  ban.innerHTML = `<h2></h2><p><span></span>${add ? ` · <b>+${String(add).replace('.', ',')} s</b>` : ''}</p>`;
  ban.querySelector('h2').textContent = base.name + (mode.mirror ? ' 🪞' : '');
  ban.querySelector('p span').textContent = base.desc || '';
  ban.classList.remove('mg-hidden');
  audio.startMusic(base.set);
  hud();
  await sleep(1300);
  if (my !== token) return;
  ban.classList.add('mg-hidden');
  for (const k of ['3', '2', '1']) { msg(k, 450); audio.play('count'); await sleep(480); if (my !== token) return; }
  msg('START!', 700); audio.play('go');
  if (my !== token || play.state !== 'count') return;
  play.state = 'run';
  last = performance.now();
}

function pressR() {
  if (!play || play.state !== 'run') return;
  if (mode.kind === 'trial') { startLevel(); return; }
  const w = play.world;
  if (w.dead) return;
  respawn(w);
  w.events.length = 0;
  play.prevBall = { x: w.ball.x, y: w.ball.y, z: w.ball.z };
  mode.run.clock = Math.max(0, mode.run.clock - R.RESET_COST);
  msg(`−${R.RESET_COST} s`);
  audio.play('respawn');
}

/* ------------------------------------------------------------ pavza */

function togglePause() { if (play?.state === 'pause') resume(); else pause(); }

function pause() {
  if (!play || play.state !== 'run') return;
  play.state = 'pause';
  input.keys.clear();
  overlay(`<div class="mg-card mg-card--glow kr-panel">
    <h2 class="mg-title">Pavza</h2>
    <p class="mg-muted" style="margin:0"><span id="pauseName"></span>${mode.kind !== 'trial' ? ` · ura ${R.fmtClock(mode.run.clock)}` : ''}</p>
    <button class="mg-btn mg-btn--primary mg-btn--big" data-o="resume">Nadaljuj</button>
    ${mode.kind === 'trial' ? '<button class="mg-btn mg-btn--cyan" data-o="restart">Začni znova (R)</button>'
      : '<button class="mg-btn mg-btn--cyan" data-o="cp">Na kontrolno točko (−2 s)</button>'}
    <button class="mg-btn mg-btn--ghost" data-o="quit">${mode.kind === 'trial' ? 'Izberi drugo progo' : 'Zapusti (rezultat se ne šteje)'}</button>
  </div>`, async v => {
    if (v === 'resume') resume();
    else if (v === 'restart') { resume(); startLevel(); }
    else if (v === 'cp') { resume(); pressR(); }
    else if (v === 'quit') {
      if (mode.custom?.community) showMenu('community', mode.custom.community.id);
      else if (mode.custom) showMenu('custom');
      else if (mode.kind === 'trial') showMenu('trial', play.base.id);
      else if (await ui.confirm('Zapustiš igro? Točke se ne bodo shranile.', { danger: true })) showMenu('main');
    }
  });
  $('#pauseName').textContent = play.base.name;
}

function resume() {
  if (!play || play.state !== 'pause') return;
  $('#overlay').classList.add('mg-hidden');
  play.state = 'run';
  last = performance.now();
}

function overlay(html, onPick) {
  const o = $('#overlay');
  o.innerHTML = html;
  o.classList.remove('mg-hidden');
  o.onclick = e => { const b = e.target.closest('[data-o]'); if (b) { audio.play('click'); onPick(b.dataset.o); } };
  o.querySelector('[data-o]')?.focus();
}

function stopPlay() {
  token++;
  play = null;
  if (input) input.enabled = false;
  $('#overlay')?.classList.add('mg-hidden');
}

/* ===================================================================== */
/*  Konec proge, turnirja, dnevnega izziva, vožnje na čas                */
/* ===================================================================== */

async function levelDone() {
  if (play.state !== 'run') return;
  play.state = 'done';
  const w = play.world, base = play.base;
  audio.play('goal');
  renderer.celebrate(w.ball.x, w.ball.y, w.ball.z);
  const time = w.finishT;
  const stars = w.stars, falls = w.falls;
  // lastna proga: brez dosežkov, dogodkov, uradne lestvice in ghostov na strežniku
  if (mode.custom) return customDone(time, stars, falls);
  hub.reportEvent('krogla:proga', 1);
  if (base.id === ORDER[0]) unlock('prva-proga');
  if (stars >= 5) unlock('vse-zvezdice');
  if (ORDER.indexOf(base.id) >= 5 && falls === 0) unlock('brez-padca');
  if (mode.kind === 'trial') return trialDone(time, stars, falls);

  const run = mode.run;
  const remaining = run.clock;
  const pts = R.finishLevel(run, base, { time, stars, falls });
  let xp = 0;
  if (mode.kind === 'tourney' || mode.kind === 'mirror') {
    xp = R.tourneyLevelXp(mode.xpLevels || 0);
    mode.xpLevels = (mode.xpLevels || 0) + 1;
    if (xp) hub.awardXp(xp, 'krogla: proga');
    const sk = R.setCompleted(mode.levels, mode.idx);
    if (sk) {
      hub.reportEvent('krogla:sklop', sk);
      if (sk === 1) unlock('sklop-1');
      if (sk === 2) unlock('sklop-2');
    }
  }
  const lastLevel = mode.idx >= mode.levels.length - 1;
  const goNext = () => {
    if (!play || play.base !== base) return;
    if (lastLevel) endRun(true);
    else { mode.idx++; startLevel(); }
  };
  play.next = goNext;
  await sleep(700);
  if (!play || play.base !== base) return;
  overlay(`<div class="mg-card mg-card--glow kr-panel">
    <h2 class="mg-title">Cilj!</h2>
    <div class="kr-stats">
      <div><span>Čas proge</span><b>${R.fmtTime(time * 1000)}</b></div>
      <div><span>Preostala ura</span><b>${R.fmtClock(remaining)}</b></div>
      <div><span>Zvezdice</span><b>${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</b></div>
      <div><span>Točke</span><b>+${R.fmtPts(pts)}</b></div>
    </div>
    <p class="kr-note" style="margin:0">Skupaj ${R.fmtPts(run.points)} točk${xp ? ` · +${xp} XP` : ''}${falls ? ` · padci: ${falls}` : ' · brez padca'}</p>
    <button class="mg-btn mg-btn--primary mg-btn--big" data-o="next">${lastLevel ? 'Konec turnirja' : 'Naslednja proga'} <span class="kr-kbd">(Enter)</span></button>
  </div>`, v => { if (v === 'next') { play.next = null; goNext(); } });
  if (BOT) setTimeout(() => { if (play?.next === goNext) { play.next = null; goNext(); } }, 1500);
}

function gameOver() {
  if (play.state !== 'run') return;
  play.state = 'over';
  audio.play('over');
  msg('Čas je potekel!', 2000);
  setTimeout(() => endRun(false), 1400);
}

async function endRun(completed) {
  const run = mode.run;
  const kind = mode.kind;
  play.state = 'over';
  play.next = null;
  audio.stopMusic();
  const score = run.points;
  const seed = kind === 'tourney' ? R.boardSeed.tourney(mode.diff) : kind === 'mirror' ? R.boardSeed.mirror(mode.diff) : mode.seed;
  const counts = kind !== 'daily' || mode.official;
  if (counts && score > 0) await hub.submitScore(score, { seed, meta: { levels: run.done.length, diff: mode.diff, completed, mod: mode.mod?.id || null } });
  let xp = (mode.xpLevels || 0) * 20;
  if (completed && (kind === 'tourney' || kind === 'mirror')) { const r = await hub.awardXp(R.XP.TOURNEY, 'krogla: turnir'); xp += r.granted || 0; }
  hub.reportGame({ won: false, players: 1, score, daily: kind === 'daily' });
  if (completed && (kind === 'tourney' || kind === 'mirror')) {
    hub.reportEvent('krogla:turnir', 1);
    if (kind === 'tourney' && R.countsForUnlock(mode.diff)) { await unlock('turnir'); S.save(uk('mirror'), true); }
    if (kind === 'mirror') await unlock('zrcalo');
    if (mode.diff === 'noro') await unlock('noro');
    if (run.clock > 60) await unlock('rezerva');
  }
  let top = [];
  try { top = counts ? await hub.getLeaderboard({ seed, limit: 50, order: 'desc' }) : []; } catch { /* */ }
  const meIdx = top.findIndex(r => r.user_id === hub.userId);
  const list = top.slice(0, 5).map(r => ({ id: r.user_id, nickname: r.nickname, avatar: r.avatar, equipped: r.equipped, scoreText: R.fmtPts(r.score) + ' t' }));
  if (!list.some(p => p.id === hub.userId) && hub.profile) list.push({ id: hub.userId, nickname: hub.profile.nickname, avatar: hub.profile.avatar, equipped: hub.profile.equipped, scoreText: R.fmtPts(score) + ' t' });
  const me = list.find(p => p.id === hub.userId); if (me) me.xp = xp;
  const title = completed ? (kind === 'daily' ? 'Dnevni izziv opravljen!' : kind === 'mirror' ? 'Zrcalni turnir končan!' : 'Turnir končan!') : 'Čas je potekel';
  const extra = `<div class="kr-stats" style="margin-top:12px">
      <div><span>Točke</span><b>${R.fmtPts(score)}</b></div>
      <div><span>Proge</span><b>${run.done.length}/${mode.levels.length}</b></div>
      <div><span>Zvezdice</span><b>${run.stars}</b></div>
      <div><span>${counts ? 'Mesto' : 'Lestvica'}</span><b>${counts ? (meIdx >= 0 ? meIdx + 1 + '.' : '—') : 'trening'}</b></div>
    </div>
    ${completed ? `<p class="mg-center mg-small mg-muted">Preostala ura: ${R.fmtClock(run.clock)}</p>` : ''}
    ${kind === 'daily' && !mode.official ? '<p class="mg-center mg-small mg-muted">To je bil trening — za lestvico šteje le prvi poskus dneva.</p>' : ''}`;
  const v = await ui.results(list, { title, again: kind === 'daily' ? 'Trening' : 'Še enkrat', extraHtml: extra });
  await refreshAch();
  if (v === 'again') { if (kind === 'daily') startDaily(); else startTourney(mode.diff, kind === 'mirror'); }
  else if (v !== 'hub') showMenu('main');
}

async function trialDone(time, stars, falls) {
  const base = play.base, mir = mode.mirror;
  const ms = Math.round(time * 1000);
  const key = mkey(base.id, mir);
  const prev = best[key];
  const record = prev == null || ms < prev;
  const medal = R.medalFor(base, time);
  const prevMedal = prev != null ? R.medalFor(base, prev / 1000) : null;
  if (record) {
    best[key] = ms; S.save(uk('best'), best);
    const data = encode(play.rec.frames);
    S.save(uk(`ghost:${base.id}:${mir ? 1 : 0}`), data);
    hub.saveGhost({ level: base.id, mirror: mir, timeMs: ms, data });
  }
  hub.submitScore(ms, { seed: R.boardSeed.level(base.id, mir), meta: { falls, stars } });
  let xp = 0;
  if (medal === 'gold') {
    hub.reportEvent('krogla:gold', 1);
    if (prevMedal !== 'gold') { const r = await hub.awardXp(R.XP.GOLD, 'krogla: zlato'); xp = r.granted || 0; }
    if (LEVELS.every(L => best[mkey(L.id, false)] != null && R.medalFor(L, best[mkey(L.id, false)] / 1000) === 'gold')) unlock('zlato-vse');
  }
  if (Date.now() - lastReportTrial > 60000) { lastReportTrial = Date.now(); hub.reportGame({ won: false, players: 1, score: ms }); }
  const idx = ORDER.indexOf(base.id);
  const nextId = ORDER[idx + 1];
  const canNext = nextId && unlockedIds().has(nextId);
  play.next = () => startLevel();
  await sleep(600);
  if (!play || play.base !== base) return;
  overlay(`<div class="mg-card mg-card--glow kr-panel">
    <div class="kr-medal">${medal ? R.MEDAL[medal].icon : '🏁'}</div>
    <h2 class="mg-title">${record ? 'Nov rekord!' : 'Cilj!'}</h2>
    <div class="kr-stats">
      <div><span>Čas</span><b>${R.fmtTime(ms)}</b></div>
      <div><span>Rekord</span><b>${R.fmtTime(best[key])}</b></div>
      <div><span>Medalja</span><b>${medal ? R.MEDAL[medal].name : '—'}</b></div>
      <div><span>Zvezdice</span><b>${stars}/5</b></div>
    </div>
    <p class="kr-note" style="margin:0">🥇 ${base.medals.gold} s · 🥈 ${base.medals.silver} s · 🥉 ${base.medals.bronze} s${xp ? ` · +${xp} XP` : ''}${record ? ' · ghost shranjen' : ''}</p>
    <button class="mg-btn mg-btn--primary mg-btn--big" data-o="again">Še enkrat <span class="kr-kbd">(R / Enter)</span></button>
    ${canNext ? '<button class="mg-btn mg-btn--cyan" data-o="next">Naslednja proga</button>' : ''}
    <button class="mg-btn mg-btn--ghost" data-o="menu">Izberi progo</button>
  </div>`, v => {
    play.next = null;
    if (v === 'again') startLevel();
    else if (v === 'next') { mode.levels = [LEVELS[idx + 1]]; mode.ghosts = []; startLevel(); }
    else showMenu('trial', base.id);
  });
  // R v povzetku = še enkrat
  play.state = 'done';
}

/** Cilj na lastni progi: samo lokalni rekord in ghost; hub.reportGame z isto omejitvijo kot Na čas. */
async function customDone(time, stars, falls) {
  const base = play.base, c = mode.custom;
  const ms = Math.round(time * 1000);
  const prev = CD.customBest()[c.hash];
  const record = prev == null || ms < prev;
  if (record) { CD.saveCustomBest(c.hash, ms); CD.saveCustomGhost(c.hash, encode(play.rec.frames)); }
  const medal = base.medals ? R.medalFor(base, time) : null;
  if (Date.now() - lastReportTrial > 60000) { lastReportTrial = Date.now(); hub.reportGame({ won: false, players: 1, score: ms }); }
  // proga skupnosti: rezultat na njeno lestvico (seed custom:<id>; nemogoče hitri časi se ne pošljejo)
  const cm = c.community;
  const sent = !!cm && ms >= cm.dev_ms * 0.3;
  if (sent) hub.submitScore(ms, { seed: COMM_SEED(cm.id), meta: { falls, stars } });
  play.next = () => startLevel();
  play.state = 'done';
  await sleep(600);
  if (!play || play.base !== base) return;
  overlay(`<div class="mg-card mg-card--glow kr-panel">
    <div class="kr-medal">${medal ? R.MEDAL[medal].icon : '🏁'}</div>
    <h2 class="mg-title">${record ? 'Nov rekord!' : 'Cilj!'}</h2>
    <p class="mg-muted" style="margin:0" id="cdName"></p>
    <div class="kr-stats">
      <div><span>Čas</span><b>${R.fmtTime(ms)}</b></div>
      <div><span>Rekord</span><b>${R.fmtTime(record ? ms : prev)}</b></div>
      <div><span>Medalja</span><b>${medal ? R.MEDAL[medal].name : '—'}</b></div>
      <div><span>Zvezdice</span><b>${stars}/5</b></div>
    </div>
    <p class="kr-note" style="margin:0">${cm ? (sent ? 'Proga skupnosti — čas je na lestvici proge' : 'Proga skupnosti') : 'Moja proga — brez uradne lestvice'}${record ? ' · ghost shranjen lokalno' : ''}${falls ? ` · padci: ${falls}` : ''}</p>
    <button class="mg-btn mg-btn--primary mg-btn--big" data-o="again">Še enkrat <span class="kr-kbd">(R / Enter)</span></button>
    ${c.key ? '<button class="mg-btn mg-btn--cyan" data-o="edit">✏️ Uredi progo</button>' : ''}
    <button class="mg-btn mg-btn--ghost" data-o="menu">${cm ? 'Proge skupnosti' : 'Moje proge'}</button>
  </div>`, v => {
    play.next = null;
    if (v === 'again') startLevel();
    else if (v === 'edit') location.href = editorUrl('draft=' + encodeURIComponent(c.key));
    else if (cm) showMenu('community', cm.id);
    else showMenu('custom', c.key);
  });
  $('#cdName').textContent = base.name;
}

// R tudi na zaslonu povzetka Na čas
addEventListener('keydown', e => {
  if (e.code === 'KeyR' && play && play.state === 'done' && mode?.kind === 'trial' && !document.querySelector('.mg-modal-back')) { play.next = null; startLevel(); }
});

boot();
