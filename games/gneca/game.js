/* =====================================================================
   GNEČA — game.js: vstop. Hub (profil, XP, dosežki, lestvica, naloge),
   napredek (zobniki, nadgradnje, zvezdice: shared/storage.js + hub.writeSave
   → Supabase tabela game_saves, sledi igralcu na vse naprave), meni,
   zanka igre s fiksnim korakom 60 Hz, konec z ui.results.
   URL: ?debug=1 (drsniki, FPS, mreža), ?demo=1 (igra autopilot), ?offline=1.
   ===================================================================== */
import { hub, ui } from '../../shared/hub.js';
import * as S from '../../shared/storage.js';
import { B } from './balance.js';
import { loadIndex } from './level.js';
import { createState, step, addUnit } from './sim.js';
import { resultOf, gearsFor } from './score.js';
import { createAutopilot } from './autopilot.js';
import { dailyLevel } from './daily.js';
import { paramsFor, newProgress, sanitizeProgress, newerProgress, buyUpgrade, recordLevel, isUnlocked } from './upgrades.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { renderMenu, levelName, Hud, debugPanel, resultHtml, ACH } from './ui-game.js';

const GAME = 'gneca';
const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const DEBUG = qs.has('debug'), DEMO = qs.has('demo');

await hub.init({ gameId: GAME, scoreOrder: 'desc' });
ui.header({ title: 'Gneča' });

let sets = [];
try { sets = await loadIndex('levels/'); }
catch (e) { $('#menu').innerHTML = `<div class="mg-card mg-error">Nivojev ni bilo mogoče naložiti: ${ui.esc(e.message)}</div>`; throw e; }
const allLevels = sets.flatMap(s => s.levels);

/* ===================================================================== */
/*  Napredek (lokalno + hub.writeSave)                                   */
/* ===================================================================== */

const progKey = () => 'gneca:prog:' + (hub.userId || 'anon');
let prog = newProgress();

async function loadProgress() {
  const local = S.load(progKey(), null);
  const lp = local ? sanitizeProgress(local) : null;
  const remote = await hub.loadSave();
  const rp = remote?.data ? sanitizeProgress({ ...remote.data, rev: Math.max(remote.rev | 0, remote.data.rev | 0) }) : null;
  prog = newerProgress(lp, rp) || newProgress();
  S.save(progKey(), prog);
  // lokalni napredek je novejši (npr. igral brez povezave) → pošlji na strežnik
  if (lp && (!rp || prog.rev > rp.rev)) hub.writeSave(prog, { rev: prog.rev });
}

let saveTimer = 0;
function saveProgress(now = false) {
  S.save(progKey(), prog);
  clearTimeout(saveTimer);
  const push = () => hub.writeSave(prog, { rev: prog.rev });
  if (now) return push();
  saveTimer = setTimeout(push, 600);
}

await loadProgress();

/* ===================================================================== */
/*  Meni                                                                 */
/* ===================================================================== */

const audio = new Audio();
let quality = S.load('gneca:quality', 'auto');
let renderer = null;   // ustvari se ob prvi igri (Three.js se naloži šele takrat)
let R = null;          // modul render.js

async function showMenu() {
  stopLoop();
  $('#play').classList.add('mg-hidden');
  $('#menu').classList.remove('mg-hidden');
  document.body.style.overflow = '';
  document.body.classList.remove('gn-playing');
  const seed = hub.dailySeed();
  const ach = new Set((await hub.getAchievements()).map(a => a.key));
  const QUAL = { high: { name: 'Visoka' }, medium: { name: 'Srednja' }, low: { name: 'Nizka' } };
  renderMenu($('#menu'), { sets, prog, daily: { seed, played: prog.daily[seed] || null }, ach, quality, qualities: QUAL }, {
    play: id => { audio.unlock(); startLevel(allLevels.find(L => L.id === id)); },
    daily: () => { audio.unlock(); startLevel(dailyLevel(seed), { daily: true }); },
    buy: id => {
      try { prog = buyUpgrade(prog, id); saveProgress(); audio.click(); ui.toast('Nadgrajeno!', { icon: '⚙️' }); }
      catch (e) { ui.toast(e.code === 'gears' ? 'Premalo zobnikov.' : 'Že na najvišji stopnji.', { icon: '⚙️' }); }
      showMenu();
    },
    setAuto: v => { prog = { ...prog, autoGiant: v, rev: prog.rev + 1 }; saveProgress(); },
    setQuality: v => { quality = v; S.save('gneca:quality', v); if (renderer) applyQuality(); },
  });
  ui.leaderboard($('#board'), {
    title: 'Dnevna lestvica', format: s => s.toLocaleString('sl-SI') + ' točk',
    tabs: [{ label: 'Danes', seed }, { label: 'Teden', period: 'week' }, { label: 'Vseh časov' }],
  });
  window.scrollTo({ top: 0 });
}

function applyQuality() {
  if (quality === 'auto') { renderer.auto = true; renderer.setQuality(R.detectQuality()); }
  else { renderer.auto = false; renderer.setQuality(quality); }
}

/* ===================================================================== */
/*  Igra                                                                 */
/* ===================================================================== */

const hud = new Hud();
let run = null;         // trenutni nivo
let raf = 0, lastT = 0;
const speed = { v: 1 };
let dbg = null;

const input = new Input($('#cv'), {
  getCannonX: () => run?.st.cannon.x ?? 0,
  laneWidth: () => run?.st.L.width ?? 10,
  onAny: () => { audio.unlock(); if (run && !run.started && !run.paused) begin(); },
  onPause: () => { if (run && !run.ended) pause(); },
});

const giantBtn = $('#btnGiant');
giantBtn.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); audio.unlock(); input.requestGiant(); if (run && !run.started) begin(); });
$('#btnPause').addEventListener('pointerdown', e => e.stopPropagation());
$('#btnPause').addEventListener('click', () => { if (run && !run.ended) pause(); });
$('#btnMute').addEventListener('pointerdown', e => e.stopPropagation());
$('#btnMute').addEventListener('click', () => { audio.setMuted(!audio.muted); syncMute(); });
const syncMute = () => { $('#btnMute').textContent = audio.muted ? '🔇' : '🔊'; };
syncMute();
document.addEventListener('visibilitychange', () => { if (document.hidden && run && run.started && !run.ended && !run.paused) pause(); });
window.addEventListener('resize', () => renderer?.resize());

async function ensureRenderer() {
  if (renderer) return;
  R = await import('./render.js');
  const q = quality === 'auto' ? R.detectQuality() : quality;
  renderer = new R.Renderer($('#cv'), { quality: q, auto: quality === 'auto' });
}

/**
 * @param {any} level surov nivo (kampanja) ali dnevni nivo
 * @param {{daily?:boolean}} [o]
 */
async function startLevel(level, { daily = false } = {}) {
  if (!level) return;
  $('#menu').classList.add('mg-hidden');
  $('#play').classList.remove('mg-hidden');
  document.body.style.overflow = 'hidden';
  document.body.classList.add('gn-playing');
  await ensureRenderer();
  const seed = daily ? hub.dailySeed() : level.id;
  const up = daily ? B.dailyUpgrades : prog.up;
  const st = createState(level, { seed: 'gneca:' + seed, params: { ...paramsFor(up), autoGiant: prog.autoGiant } });
  run = { st, level, daily, seed, started: false, paused: false, ended: false, acc: 0, ap: DEMO ? createAutopilot() : null };
  renderer.resize();
  renderer.load(st);
  input.reset(0);
  hud.last = {};
  hud.setLevel(daily ? '📅 Dnevni' : levelName(sets, level.id).split(' ')[0]);
  hud.update(st);
  $('#startHint').classList.toggle('mg-hidden', DEMO);
  $('#startKeys').textContent = matchMedia('(pointer: coarse)').matches ? 'na spodnji polovici zaslona · gumb 🗿 = velikan' : 'ali ←/→ in preslednica · G = velikan · P = pavza';
  banner(level.hint || (daily ? 'Dnevni nivo — fiksne nadgradnje, prvi poskus šteje.' : ''), 4500);
  if (DEBUG && !dbg) {
    dbg = debugPanel($('#debug'), {
      get: () => run?.st, speed, quality: () => renderer.qualityKey,
      onGrid: on => renderer.showGrid(on, run?.st),
      onQuality: q => { renderer.auto = false; renderer.setQuality(q); },
      onStress: () => stress(),
    });
    $('#fps').classList.remove('mg-hidden');
  }
  dbg?.sync();
  if (DEMO) begin();
  startLoop();
}

function begin() {
  if (!run || run.started) return;
  run.started = true;
  $('#startHint').classList.add('mg-hidden');
}

let bannerTimer = 0;
function banner(text, ms = 2500, big = false) {
  const b = $('#banner');
  clearTimeout(bannerTimer);
  if (!text) { b.classList.add('mg-hidden'); return; }
  b.textContent = text;
  b.classList.toggle('big', big);
  b.classList.remove('mg-hidden');
  if (ms) bannerTimer = setTimeout(() => b.classList.add('mg-hidden'), ms);
}

/** Debug: 600 + 600 tekačev naenkrat (za merjenje FPS); hitrosti na 0, da ostanejo živi. */
function stress() {
  const st = run?.st; if (!st) return;
  const W = st.L.width, cols = Math.floor(W / 0.62);
  for (let k = st.me.n; k < 600; k++) addUnit(st, 'me', ((k % cols) - (cols - 1) / 2) * 0.62, 2 + Math.floor(k / cols) * 0.62);
  for (let k = st.en.n; k < 600; k++) addUnit(st, 'en', ((k % cols) - (cols - 1) / 2) * 0.62, st.L.length - 2 - Math.floor(k / cols) * 0.62);
  st.p.runSpeed = 0; st.p.enemySpeed = 0;
  begin();
  dbg?.sync();
}

/** Debug: sinhrono izmeri čas izrisa (ms na sličico, z gl.finish) — neodvisno od dušenja rAF v ozadju. */
function bench(frames = 120) {
  if (!run || !renderer) return null;
  const gl = renderer.gl.getContext();
  renderer.frame(run.st, 0); gl.finish();
  const t0 = performance.now();
  for (let k = 0; k < frames; k++) renderer.frame(run.st, 1 / 60);
  gl.finish();
  const ms = (performance.now() - t0) / frames;
  const t1 = performance.now();
  for (let k = 0; k < frames; k++) { step(run.st, {}); run.st.events.length = 0; }
  const simMs = (performance.now() - t1) / frames;
  return { renderMs: +ms.toFixed(2), simMs: +simMs.toFixed(3), fpsCap: Math.round(1000 / (ms + simMs)), me: run.st.me.n, en: run.st.en.n, q: renderer.qualityKey, w: innerWidth, h: innerHeight, dpr: devicePixelRatio };
}
/** Debug: odigraj n korakov takoj (z autopilotom ali stalnim strelom). */
function advance(n = 600, auto = true) {
  if (!run) return null;
  begin();
  const ap = auto ? (run.ap || (run.ap = createAutopilot())) : null;
  for (let k = 0; k < n && !run.st.over; k++) { step(run.st, ap ? ap(run.st) : { tx: 0, fire: true }); if (run.st.events.length > 300) run.st.events.length = 0; }
  return { step: run.st.step, over: run.st.over, crowd: run.st.crowd, tower: run.st.tower.hp };
}
if (DEBUG) window.gnecaDebug = { bench, advance, stress: () => stress(), get run() { return run; }, get renderer() { return renderer; } };

function startLoop() { stopLoop(); lastT = performance.now(); raf = requestAnimationFrame(tick); }
function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

function tick(t) {
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.1, Math.max(0, (t - lastT) / 1000));
  lastT = t;
  if (!run) return;
  const st = run.st;
  if (run.started && !run.paused && !st.over) {
    run.acc += dt * speed.v;
    let n = 0;
    while (run.acc >= B.dt && n < 12) {
      run.acc -= B.dt; n++;
      step(st, run.ap ? run.ap(st) : input.sample(B.dt));
      if (st.over) { run.acc = 0; break; }
    }
    if (n >= 12) run.acc = 0;
  }
  if (st.events.length) {
    renderer.events(st, st.events);
    audio.events(st.events);
    for (const e of st.events) {
      if (e.t === 'egiant') banner('Sovražni velikan!', 1800);
      else if (e.t === 'gatechange') banner('Vrata so se spremenila!', 1500);
    }
    st.events.length = 0;
  }
  renderer.frame(st, run.paused ? 0 : dt);
  hud.update(st);
  if (DEBUG) {
    const i = renderer.info();
    $('#fps').textContent = `${i.fps} FPS · ${i.q} · klici ${i.calls}\nmoji ${st.me.n} (${Math.round(st.crowd)}) · sovr. ${st.en.n} · korak ${st.step}`;
  }
  if (st.over && !run.ended) {
    run.ended = true;
    banner(st.over.won ? 'Stolp je padel!' : st.over.reason === 'cas' ? 'Čas je potekel' : 'Horda je prebila!', 0, true);
    setTimeout(() => finish(run), st.over.won ? 2200 : 1500);
  }
}

async function pause() {
  run.paused = true;
  const v = await ui.modal({
    title: 'Pavza', html: '<p class="mg-muted" style="margin:0">Igra stoji.</p>',
    actions: [{ label: 'Zemljevid', value: 'menu' }, { label: 'Ponovi', value: 'again' }, { label: 'Nadaljuj', value: 'go', kind: 'primary' }],
  });
  if (!run) return;
  if (v === 'menu') { run = null; showMenu(); return; }
  if (v === 'again') { const r = run; startLevel(r.level, { daily: r.daily }); return; }
  run.paused = false;
  lastT = performance.now();
}

/* ===================================================================== */
/*  Konec nivoja: napredek, XP, dosežki, hub                             */
/* ===================================================================== */

const unlock = key => { const a = ACH.find(x => x.key === key); return hub.unlock(key, { title: a.title, icon: a.icon }); };

async function finish(r) {
  if (r !== run) return;
  banner('');
  const st = r.st, res = resultOf(st);
  const won = res.won, stats = st.stats;
  let gears = 0, first = false, best = 0, record = false;
  if (r.daily) {
    const cur = prog.daily[r.seed];
    first = !cur;
    if (first) gears = gearsFor({ won, stars: res.stars, daily: true });
    const next = cur ? { ...cur, best: Math.max(cur.best, res.score) } : { first: res.score, stars: res.stars, best: res.score };
    record = !!cur && res.score > cur.best;
    best = next.best;
    prog = { ...prog, gears: prog.gears + gears, daily: { ...prog.daily, [r.seed]: next }, rev: prog.rev + 1 };
    if (first) hub.submitScore(res.score, { seed: r.seed, meta: { stars: res.stars, won } });
  } else {
    const prev = prog.levels[r.level.id];
    gears = gearsFor({ won, stars: res.stars, prevStars: prev?.stars || 0 });
    record = !!prev && res.score > prev.best;
    best = Math.max(prev?.best || 0, res.score);
    prog = recordLevel(prog, r.level.id, { won, stars: res.stars, score: res.score, noMinus: stats.lostMinus === 0 }, gears);
  }
  saveProgress(true);

  // XP: 15 za odigran nivo, +25 zmaga, +20 tri zvezdice, +40 dnevni nivo (prvi poskus)
  const xp = 15 + (won ? 25 : 0) + (res.stars === 3 ? 20 : 0) + (r.daily && first ? 40 : 0);
  hub.awardXp(xp, r.daily ? 'dnevni nivo' : 'nivo ' + r.level.id);

  // dosežki
  if (won && r.level.id === allLevels[0].id) unlock('prvi-stolp');
  if (stats.maxCrowd >= 1000) unlock('tisoc');
  if (won && stats.lostMinus === 0) unlock('brez-izgub');
  if (won && stats.towerRunner === 0 && stats.towerGiant > 0) unlock('velikan');
  if (sets[0].levels.every(L => (prog.levels[L.id]?.stars || 0) >= 3)) unlock('puscava');
  if (won && r.level.boss) unlock('sef');
  if (r.daily && res.stars >= 3) unlock('dnevni-3');

  // kovanci, naloge
  hub.reportGame({ won, players: 1, score: res.score, daily: r.daily });
  if (won) hub.reportEvent('gneca:win', 1);
  hub.reportEvent('gneca:stars', res.stars);
  hub.reportEvent('gneca:crowd', Math.round(stats.maxCrowd));
  if (stats.giants) hub.reportEvent('gneca:giant', stats.giants);
  if (r.daily) hub.reportEvent('gneca:daily-stars', res.stars);

  // naslednji nivo kampanje
  let next = null;
  if (!r.daily && won) {
    const i = allLevels.findIndex(L => L.id === r.level.id);
    const nl = allLevels[i + 1];
    if (nl) {
      const si = sets.findIndex(s => s.levels.includes(nl)), li = sets[si].levels.indexOf(nl);
      if (isUnlocked(prog, sets, si, li)) next = nl;
    }
  }
  const me = { ...(hub.profile || { nickname: 'Jaz', avatar: { emoji: '🏃', color: '#3fa9ff' } }), id: hub.userId, scoreText: res.score.toLocaleString('sl-SI') + ' točk', xp };
  const choice = await ui.results([me], {
    title: won ? (r.daily ? 'Dnevni nivo: zmaga!' : 'Zmaga!') : 'Poraz',
    again: next ? 'Naslednji ▶' : 'Ponovi', exit: 'Zemljevid',
    extraHtml: resultHtml(res, { gears, daily: r.daily, first, best, record, reason: st.over.reason }),
  });
  if (r !== run) return;
  if (choice === 'again') startLevel(next || r.level, { daily: r.daily });
  else if (choice !== 'hub') { run = null; showMenu(); }
}

/* ===================================================================== */

if (DEMO) startLevel(qs.get('nivo') ? allLevels.find(L => L.id === qs.get('nivo')) || allLevels[0] : allLevels[0]);
else if (qs.get('nivo') && DEBUG) startLevel(qs.get('nivo') === 'dnevni' ? dailyLevel(hub.dailySeed()) : allLevels.find(L => L.id === qs.get('nivo')), { daily: qs.get('nivo') === 'dnevni' });
else showMenu();
