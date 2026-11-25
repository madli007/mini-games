/* =====================================================================
   USTAVI URO — štoparica, ki izgine. Prosta igra, dnevni izziv z
   modifikatorji, Dvoboj in Zadnji stoji (2–10 igralcev), TV pogled.
   Čas: samo performance.now() / event.timeStamp od izrisa »Start!«.
   ===================================================================== */
import { hub, ui } from '../../shared/hub.js';
import * as S from '../../shared/storage.js';
import * as U from './logic.js';
import * as A from './audio.js';

const GAME = U.GAME;
const $ = s => document.querySelector(s);
const esc = ui.esc;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const AUTO = DEBUG && params.get('auto') === '1';
const SCALE = DEBUG ? 0.3 : 1;          // ?debug=1: krajši cilji za hiter test
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

const ACH = [
  { key: 'prvi-stop', title: 'Prvi stop', icon: '⏱️', desc: 'Odigraj rundo do konca' },
  { key: 'popolno', title: 'Popolno!', icon: '✨', desc: 'Krog z odstopanjem ≤ 10 ms' },
  { key: 'slepec', title: 'Na slepo', icon: '🙈', desc: 'Krog brez vidne ure, odstopanje ≤ 50 ms' },
  { key: 'pod-500', title: 'Natančen', icon: '🎯', desc: 'Runda Srednje ali težje pod 500 ms skupaj' },
  { key: 'pod-200', title: 'Švicarska ura', icon: '⌚', desc: 'Runda Srednje ali težje pod 200 ms skupaj' },
  { key: 'trije-popolni', title: 'Hat-trick', icon: '🎩', desc: '3 popolni krogi v eni rundi' },
  { key: 'dolga-pot', title: 'Dolga pot', icon: '🛤️', desc: 'Cilj 30 s ali več, odstopanje ≤ 200 ms' },
  { key: 'zadnji-stoji', title: 'Zadnji stoji', icon: '🏆', desc: 'Zmagaj Zadnji stoji z vsaj 4 igralci' },
  { key: 'dvoboj', title: 'Ura ne laže', icon: '👑', desc: 'Zmagaj dvoboj z vsaj 4 igralci' },
  { key: 'vztrajen', title: 'Točen kot ura', icon: '📅', desc: 'Dnevni izziv 7 dni zapored' },
];
const achDef = k => ACH.find(a => a.key === k);
const unlock = k => hub.unlock(k, { title: achDef(k).title, icon: achDef(k).icon });
async function unlockMany(keys) { for (const k of keys) await unlock(k); }

const key = k => `${GAME}:${k}:${hub.userId || 'anon'}`;
const freeBest = diff => S.load(key('best:' + diff), null);
const dailyDays = () => S.load(key('days'), []) || [];
const innerHist = () => S.load(key('inner'), []) || [];

/** ?debug=1 skrajša cilje in čase (vse ostalo enako). */
function scaleSpec(spec) {
  if (SCALE === 1) return spec;
  const sc = v => (v == null ? v : Math.round(v * SCALE));
  return { ...spec, stops: spec.stops.map(sc), hideAfter: sc(spec.hideAfter), tickMs: sc(spec.tickMs) };
}
function scaledDeadline(spec) { return U.lastStop(spec) + U.OVERRUN_MS * SCALE; }

/* ===================================================================== */
/*  Zasloni                                                              */
/* ===================================================================== */

let lobbyView = null;
let lbView = null;
let tv = params.get('tv') === '1';
let diff = S.load(`${GAME}:diff`, 'easy');

function show(id) {
  for (const s of document.querySelectorAll('.uu-screen')) s.classList.toggle('mg-hidden', s.id !== id);
  if (id !== 'lobby' && lobbyView) { lobbyView.destroy(); lobbyView = null; }
  document.body.classList.toggle('uu-playing', id === 'play');
  window.scrollTo({ top: 0 });
  if (id === 'play') fitPlay();
}

/** Igralni zaslon zapolni višino okna (brez scrolla, STOP vedno viden). */
function fitPlay() {
  const el = document.getElementById('play');
  if (el.classList.contains('mg-hidden')) return;
  const top = el.getBoundingClientRect().top + window.scrollY;
  el.style.height = Math.max(420, window.innerHeight - top - 12) + 'px';
}
window.addEventListener('resize', fitPlay);

async function dailyPlayed(seed) {
  if (dailyDays().includes(seed)) return true;
  return (await hub.getMyBest({ seed })) != null;
}

function renderDiff() {
  $('#diffSeg').innerHTML = U.DIFFS.map(d => `<button type="button" role="radio" class="uu-seg__b" aria-checked="${d.id === diff}" data-d="${d.id}">${esc(d.name)}</button>`).join('');
  $('#diffDesc').textContent = U.diffById(diff).desc;
  const b = freeBest(diff);
  $('#freeBest').textContent = b != null ? `Rekord ${U.fmtMs(b)}` : 'Brez rekorda';
}

async function showMenu() {
  show('menu');
  refreshMenu();
}

async function refreshMenu() {
  renderDiff();
  const seed = hub.dailySeed();
  const plan = U.dailyPlan(hub.rng, seed);
  const m = U.modById(plan.mod);
  $('#dailyMod').innerHTML = `<span class="uu-mod__icon">${m.icon}</span><div><span class="mg-small mg-muted">Modifikator dneva</span><b>${esc(m.name)}</b><span class="mg-small">${esc(m.desc)}</span></div>`;
  $('#optTick').checked = A.isTickOn();
  const ic = U.innerClock(innerHist());
  $('#innerClock').innerHTML = ic != null ? `Tvoja notranja ura: sekunda traja <b>${ic.toFixed(2).replace('.', ',')} s</b>` : 'Notranja ura: odigraj kroge na slepo.';
  const [today, ever, played] = await Promise.all([hub.getMyBest({ seed }), hub.getMyBest(), dailyPlayed(seed)]);
  $('#dailyState').textContent = played ? 'Odigrano · vaja' : 'Prvi poskus šteje';
  $('#btnDaily').textContent = played ? 'Vadi dnevni izziv' : 'Igraj dnevni izziv';
  $('#dailyBest').innerHTML = `<div><span class="mg-muted mg-small">Danes</span><b>${today != null ? U.fmtMs(today) : '—'}</b></div>
    <div><span class="mg-muted mg-small">Najboljši dnevni</span><b>${ever != null ? U.fmtMs(ever) : '—'}</b></div>
    <div><span class="mg-muted mg-small">Niz dni</span><b>${U.dayStreak(dailyDays(), seed)}</b></div>`;
  if (!lbView) {
    lbView = ui.leaderboard($('#board'), {
      title: 'Lestvica · dnevni izziv', format: s => U.fmtMs(s),
      tabs: [{ label: 'Danes', seed }, { label: 'Teden', period: 'week' }, { label: 'Vseh časov' }],
    });
  } else lbView.refresh();
  const mine = new Set((await hub.getAchievements()).map(a => a.key));
  $('#achList').innerHTML = ACH.map(a => `<div class="uu-ach__item ${mine.has(a.key) ? '' : 'locked'}">
    <span>${a.icon}</span><div><b>${esc(a.title)}</b><span class="mg-small mg-muted">${esc(a.desc)}</span></div></div>`).join('');
}

/* ===================================================================== */
/*  Ura: prikaz, obroč, izginjanje                                       */
/* ===================================================================== */

const dial = $('#dial');
const clockEl = $('#clock');
const ringEl = $('#ring');

(function drawTicks() {
  let h = '';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    const r1 = long ? 76 : 80, r2 = 84;
    h += `<line x1="${100 + Math.sin(a) * r1}" y1="${100 - Math.cos(a) * r1}" x2="${100 + Math.sin(a) * r2}" y2="${100 - Math.cos(a) * r2}" class="${long ? 'l' : ''}"/>`;
  }
  $('#ticks').innerHTML = h;
})();

function setRing(frac) {
  ringEl.style.strokeDashoffset = String(1000 - Math.max(0, Math.min(1, frac)) * 1000);
}
function setClock(text) { clockEl.textContent = text; }
function setDialState(st) {
  dial.classList.remove('is-hidden', 'is-run', 'is-reveal', 'is-wait', 'is-over');
  if (st) dial.classList.add('is-' + st);
}
function setBlind(text) { $('#blind').textContent = text; }
function setMarks(html) { $('#marks').innerHTML = html; }

function clearReveal() {
  $('#devLbl').textContent = '';
  $('#gradeLbl').textContent = '';
  $('#gradeLbl').className = 'uu-grade';
  $('#sayLbl').textContent = '';
  $('#reveal').classList.remove('on');
  $('#strip').classList.remove('on');
  $('#stripTrack').innerHTML = '';
  document.body.classList.remove('uu-flash', 'uu-shake');
  document.querySelectorAll('#marks i.on').forEach(i => i.classList.remove('on'));
}

function roundInfo(spec, r, total) {
  $('#roundLbl').textContent = total ? `Krog ${r}/${total}` : `Krog ${r}`;
  $('#targetLbl').textContent = spec.countdown
    ? `Odštevanje od ${U.fmtTarget(U.lastStop(spec))} → 0,00`
    : spec.stops.length > 1 ? `Cilja ${spec.stops.map(U.fmtTarget).join(' in ')}` : `Cilj ${U.fmtTarget(spec.stops[0])}`;
  const h = spec.hideAfter;
  $('#hideLbl').textContent = h == null ? 'ura je vidna ves čas' : h === 0 ? 'na slepo — ure ni' : `ura izgine po ${U.fmtClock(h).replace(',00', '')} s`;
}

function dots(n, results, cur) {
  $('#dots').innerHTML = Array.from({ length: n }, (_, i) => {
    const r = results[i];
    return `<i class="${r ? 'g-' + U.grade(r.dev).key : i === cur ? 'cur' : ''}"></i>`;
  }).join('');
}

/* ===================================================================== */
/*  Krog: merjenje                                                       */
/* ===================================================================== */

let active = null;   // { hit, cancel, phase }
let stopBtnMode = 'stop';   // 'stop' | 'next' | 'off'
let nextResolve = null;
let nextGuardUntil = 0;

function setStopBtn(mode, label) {
  stopBtnMode = mode;
  const b = $('#btnStop');
  b.textContent = label || (mode === 'next' ? 'NAPREJ ▸' : 'STOP');
  b.classList.toggle('is-next', mode === 'next');
  b.classList.toggle('is-off', mode === 'off');
  b.disabled = mode === 'off';
}

/**
 * Odigraj en krog.
 * @param {any} spec (že skaliran)
 * @param {{input?:boolean, solo?:boolean}} opt
 * @returns {Promise<{taps:number[], aborted?:string}>}
 */
function runRound(spec, { input = true, solo = true } = {}) {
  cancelRound();
  return new Promise(resolve => {
    const st = { phase: 'ready', t0: 0, taps: [], raf: 0, timers: [], hidden: false, nextTick: 0, tickN: 1 };
    active = st;
    const last = U.lastStop(spec);
    const dl = scaledDeadline(spec);
    const metronome = !!spec.tickMs;
    const tickStep = metronome ? spec.tickMs : 1000 * SCALE;
    clearReveal();
    setMarks(spec.stops.length > 1 ? spec.stops.map((_, i) => `<i data-i="${i}">${i + 1}</i>`).join('') : '');
    setStopBtn(input ? 'stop' : 'off', input ? 'STOP' : (tv ? '📺' : 'Gledaš …'));
    const startVisible = spec.hideAfter !== 0;
    setDialState(startVisible ? 'run' : 'hidden');
    setClock(startVisible ? U.fmtClock(U.displayMs(spec, 0)) : '');
    setBlind('Start!');
    setRing(spec.countdown ? 1 : 0);

    const finish = aborted => {
      if (st.phase === 'done') return;
      st.phase = 'done';
      cancelAnimationFrame(st.raf);
      st.timers.forEach(clearTimeout);
      if (active === st) active = null;
      resolve({ taps: st.taps.slice(), aborted });
    };
    st.cancel = reason => finish(reason || 'cancel');

    const hide = () => {
      if (st.hidden) return;
      st.hidden = true;
      setDialState('hidden');
      setBlind('?');
      // po izginotju ne pustimo številk v DOM-u
      st.timers.push(setTimeout(() => { if (st.phase === 'run') setClock(''); }, 320));
    };

    const frame = () => {
      if (st.phase !== 'run') return;
      const t = performance.now() - st.t0;
      if (!st.hidden && spec.hideAfter != null && t >= spec.hideAfter) hide();
      if (!st.hidden) {
        const shown = U.displayMs(spec, t);
        setClock(U.fmtClock(shown));
        setRing(spec.countdown ? shown / last : shown / last);
      }
      if (t >= st.nextTick) {
        if ((!st.hidden && A.isTickOn()) || metronome) A.tick(st.tickN % 2 === 1);
        st.tickN++;
        st.nextTick += tickStep;
      }
      if (t >= dl) { finish(); return; }
      st.raf = requestAnimationFrame(frame);
    };

    st.hit = ev => {
      if (st.phase !== 'run' || !input) return;
      const now = performance.now();
      let ts = ev && ev.timeStamp > 0 && Math.abs(now - ev.timeStamp) < 1000 ? ev.timeStamp : now;
      const t = ts - st.t0;
      if (t < U.GUARD_MS) return;                                   // zaščita pred nenamernim dotikom
      if (st.taps.length && t - st.taps[st.taps.length - 1] < U.GUARD_MS) return;
      st.taps.push(t);
      A.stopClick();
      vibrate(25);
      const m = $(`#marks i[data-i="${st.taps.length - 1}"]`);
      if (m) m.classList.add('on');
      if (st.taps.length >= spec.stops.length) {
        setStopBtn('off', '✓');
        finish();
      }
    };

    // »Start!« je narisan → naslednji rAF je trenutek izrisa. Če rAF ne pride
    // (zavihek v ozadju), krog vseeno začne po 150 ms, da igralec ne izgubi kroga.
    const start = () => {
      if (st.phase !== 'ready') return;
      st.t0 = performance.now();
      st.phase = 'run';
      st.nextTick = tickStep;
      A.startBeep();
      if (!startVisible) st.timers.push(setTimeout(() => { if (st.phase === 'run') setBlind('?'); }, 700));
      st.raf = requestAnimationFrame(frame);
      // rezervni rok (rAF v ozadju ne teče)
      st.timers.push(setTimeout(() => finish(), dl + 50));
      if (AUTO && input) {
        spec.stops.forEach(s => st.timers.push(setTimeout(() => st.hit(null), Math.max(U.GUARD_MS + 10, s + (Math.random() * 120 - 60)))));
      }
    };
    requestAnimationFrame(start);
    st.timers.push(setTimeout(start, 150));
    st.solo = solo;
  });
}

function cancelRound(reason) {
  if (active) active.cancel(reason);
  active = null;
}

function vibrate(ms) {
  try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(ms); } catch { /* ignore */ }
}

/* ===================================================================== */
/*  Razkritje                                                            */
/* ===================================================================== */

/** Številčnica se zavrti do dejanskega časa. */
function spinClock(target) {
  return new Promise(res => {
    setDialState('reveal');
    if (reduced()) { setClock(U.fmtClock(target)); setRing(1); res(); return; }
    const dur = 750, t0 = performance.now();
    const from = target > 0 ? Math.max(0, target - 3000) : target + 3000;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setClock(U.fmtClock(from + (target - from) * e));
      setRing(e);
      if (k < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}

/** Položaj na traku −1 s … +1 s (v %). */
const stripPos = v => (v == null ? 100 : 50 + Math.max(-1000, Math.min(1000, v)) / 20);

function stripMarker(v, inner, cls = '') {
  const out = v == null || Math.abs(v) > 1000;
  return `<div class="uu-pin ${cls} ${out ? 'is-out' : ''} ${v != null && v < 0 ? 'is-early' : 'is-late'}" style="left:${stripPos(v)}%">
    <span class="uu-pin__dot">${inner}</span><span class="uu-pin__v">${v == null ? '⏰' : U.fmtSigned(v).replace(' ms', '')}</span></div>`;
}

/**
 * Pokaži razkritje kroga (solo ali lastni rezultat v MP).
 * @param {any} spec skaliran krog
 * @param {ReturnType<typeof U.scoreRound>} res
 * @param {{others?:string}} [opt] dodatni markerji (MP)
 */
async function reveal(spec, res, { pins = null, sound = true } = {}) {
  const lastTap = res.taps[res.taps.length - 1];
  const realLast = lastTap != null ? lastTap : scaledDeadline(spec);
  const shown = spec.countdown ? U.lastStop(spec) - realLast : realLast;
  setStopBtn('off', '…');
  await spinClock(shown);
  const g = U.grade(res.dev);
  $('#devLbl').innerHTML = res.overrun && res.taps.length === 0
    ? 'Prekoračitev · <b>+5000 ms</b>'
    : res.signed.length > 1
      ? res.signed.map(U.fmtSigned).join(' · ') + ` <b>= ${U.fmtMs(res.dev)}</b>`
      : `<b>${U.fmtSigned(res.signed[0])}</b>`;
  $('#gradeLbl').textContent = g.label;
  $('#gradeLbl').className = 'uu-grade g-' + g.key;
  $('#sayLbl').textContent = U.commentFor(res);
  $('#reveal').classList.add('on');
  $('#strip').classList.add('on');
  $('#stripTrack').innerHTML = pins ?? res.signed.map((v, i) => stripMarker(v, res.signed.length > 1 ? String(i + 1) : '●', 'me')).join('');
  if (sound) A.gradeSound(g.key);
  if (g.key === 'perfect') {
    vibrate([30, 40, 30]);
    if (!reduced()) { document.body.classList.add('uu-flash'); ui.winFx('confetti', { duration: 2200 }); }
  } else if (g.key === 'miss' && !reduced()) {
    document.body.classList.add('uu-shake');
    setTimeout(() => document.body.classList.remove('uu-shake'), 500);
  }
}

/** Čakaj »Naprej« (gumb ali preslednica); samodejno po ms. */
function waitNext(ms = 7000, label) {
  return new Promise(resolve => {
    setStopBtn('next', label);
    nextGuardUntil = performance.now() + 500;
    const t = setTimeout(() => done(), AUTO ? 900 : ms);
    const done = () => { clearTimeout(t); nextResolve = null; setStopBtn('off', '…'); resolve(); };
    nextResolve = done;
  });
}

/* ===================================================================== */
/*  Vnos: dotik kjerkoli na polju, preslednica, Esc                      */
/* ===================================================================== */

function onPress(ev) {
  if (stopBtnMode === 'next') {
    if (performance.now() < nextGuardUntil) return;
    if (ev?.type === 'keydown' || ev?.target?.closest?.('#btnStop')) nextResolve?.();
    return;
  }
  active?.hit(ev);
}

$('#field').addEventListener('pointerdown', e => {
  if (e.target.closest('.uu-react, a, select, input')) return;
  if (e.button != null && e.button > 0) return;
  A.unlockAudio();
  if (active || stopBtnMode === 'next') e.preventDefault();
  onPress(e);
});
document.addEventListener('keydown', e => {
  if ($('#play').classList.contains('mg-hidden')) return;
  if (document.querySelector('.mg-modal-back')) return;
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (!e.repeat) onPress(e);
  } else if (e.code === 'Escape' && solo && !room) {
    e.preventDefault();
    pauseSolo();
  }
});

/* ===================================================================== */
/*  SOLO — prosta igra in dnevni izziv                                   */
/* ===================================================================== */

let solo = null;   // { cancelled, interrupted, paused }

function setupPlay({ mode, mod = null, n = U.ROUNDS }) {
  show('play');
  $('#players').classList.add('mg-hidden');
  $('#side').classList.add('mg-hidden');
  $('#react').classList.add('mg-hidden');
  $('.uu-layout').classList.remove('has-side');
  $('#btnPause').classList.toggle('mg-hidden', !!room);
  $('#modeLbl').textContent = mode;
  const m = mod ? U.modById(mod) : null;
  $('#modLbl').textContent = m && mod !== 'classic' ? `${m.icon} ${m.name}` : '';
  $('#modLbl').classList.toggle('mg-hidden', !m || mod === 'classic');
  $('#hint').classList.toggle('mg-hidden', !!tv);
  dots(n, [], 0);
  clearReveal();
  setDialState('wait');
  setClock('0,00');
  setBlind('');
  setRing(0);
  setStopBtn('off', 'STOP');
}

async function playSolo(kind) {
  if (solo) return;
  A.unlockAudio();
  const me = solo = { cancelled: false, interrupted: false };
  const daily = kind === 'daily';
  const seed = hub.dailySeed();
  const forced = params.get('mod');
  const testMod = daily && forced && U.MODS.some(m => m.id === forced) && forced !== U.dailyPlan(hub.rng, seed).mod;
  const plan = daily ? U.dailyPlan(hub.rng, seed, testMod ? forced : undefined) : U.freePlan(hub.rng(Math.random().toString(36).slice(2)), diff);
  const first = daily && !testMod && !(await dailyPlayed(seed));
  setupPlay({ mode: daily ? (first ? 'Dnevni izziv' : 'Dnevni · vaja') : `Prosta · ${U.diffById(diff).name}`, mod: daily ? plan.mod : null });
  if (DEBUG) $('#modeLbl').textContent += ' · debug';

  const played = [];   // { spec, res }
  for (let i = 0; i < plan.rounds.length; i++) {
    const spec = scaleSpec(plan.rounds[i]);
    roundInfo(spec, i + 1, plan.rounds.length);
    dots(plan.rounds.length, played.map(p => p.res), i);
    clearReveal();
    setDialState('wait');
    setClock(spec.countdown ? U.fmtClock(U.lastStop(spec)) : '0,00');
    setBlind('');
    setRing(spec.countdown ? 1 : 0);
    setStopBtn('off', 'STOP');
    await ui.countdown(3, { go: 'Start!', step: AUTO ? 250 : 700 });
    if (me.cancelled) return;
    const out = await runRound(spec, { input: true, solo: true });
    if (me.cancelled) return;
    if (out.aborted === 'hidden') {
      ui.toast('Okno je izgubilo fokus — krog se ponovi.', { icon: '↩️' });
      i--;
      continue;
    }
    if (out.aborted === 'pause') {
      const v = await ui.modal({
        title: 'Pavza', dismissible: false,
        html: '<p>Krog je prekinjen in se bo ponovil.</p><p class="mg-small mg-muted">Prekinjena runda ne gre na lestvico in ne šteje za rekord.</p>',
        actions: [{ label: 'Končaj', value: 'quit' }, { label: 'Nadaljuj', value: 'go', kind: 'primary' }],
      });
      if (v === 'quit' || me.cancelled) { solo = null; showMenu(); return; }
      i--;
      continue;
    }
    if (out.aborted) return;
    const res = U.scoreRound(spec, out.taps);
    played.push({ spec, res });
    // notranja ura: krogi, kjer je bila ura ob stopu skrita (brez lažne ure in metronoma)
    if (!spec.speed && !spec.tickMs && spec.hideAfter != null) {
      const add = res.taps.map((t, k) => ({ t: spec.stops[k], s: Math.round(t) })).filter((h, k) => res.taps[k] > spec.hideAfter && res.signed[k] != null);
      if (add.length && !DEBUG) S.update(key('inner'), h => [...(h || []), ...add].slice(-60), []);
    }
    dots(plan.rounds.length, played.map(p => p.res), i + 1);
    await reveal(spec, res);
    if (me.cancelled) return;
    await waitNext(7000, i === plan.rounds.length - 1 ? 'REZULTAT ▸' : 'NAPREJ ▸');
    if (me.cancelled) return;
  }
  solo = null;
  await finishSolo({ daily, first, seed, plan, played, interrupted: me.interrupted, testMod });
}

function pauseSolo() {
  if (!solo || room) return;
  if (!active || active.phase !== 'run') { ui.toast('Pavza deluje, ko ura teče.', { icon: '⏸' }); return; }
  solo.interrupted = true;
  active.cancel('pause');
}

// zavihek v ozadju → solo krog se razveljavi in ponovi
document.addEventListener('visibilitychange', () => {
  if (document.hidden && solo && active?.solo && active.phase === 'run') active.cancel('hidden');
});

/** Graf odstopanj po krogih: stolpci levo (prezgodaj) / desno (prepozno) od ničle. */
function chartHtml(rounds) {
  const vals = rounds.map(r => (r.res.overrun && !r.res.taps.length ? null : U.roundBias(r.res)));
  const max = Math.max(100, ...vals.filter(v => v != null).map(v => Math.abs(v)));
  return `<div class="uu-chart" role="img" aria-label="Odstopanja po krogih">${rounds.map((r, i) => {
    const v = vals[i];
    const w = v == null ? 50 : Math.max(1.5, Math.abs(v) / max * 50);
    const side = v == null || v > 0 ? 'late' : 'early';
    return `<div class="uu-chart__row"><span class="uu-chart__n">${i + 1}.</span><div class="uu-chart__bar">
      <i class="${side} g-${U.grade(r.res.dev).key}" style="width:${w}%"></i></div>
      <span class="uu-chart__v">${v == null ? '⏰ 5000' : U.fmtSigned(Math.round(v)).replace(' ms', '')}</span></div>`;
  }).join('')}<div class="uu-chart__axis"><span>prezgodaj</span><span>0</span><span>prepozno</span></div></div>`;
}

function summaryHtml(sum, rounds) {
  const ic = U.innerClock(innerHist());
  return `<div class="uu-sum">
      <div><span class="mg-small mg-muted">Skupno odstopanje</span><b>${U.fmtMs(sum.total)}</b></div>
      <div><span class="mg-small mg-muted">Povprečje na krog</span><b>${U.fmtMs(sum.avg)}</b></div>
      <div><span class="mg-small mg-muted">Najboljši krog</span><b>${sum.best ? `${sum.best.round}. · ${U.fmtMs(sum.best.dev)}` : '—'}</b></div>
      <div><span class="mg-small mg-muted">Smer</span><b class="uu-sum__dir">${U.biasText(sum.bias)}</b></div>
    </div>
    ${chartHtml(rounds)}
    <div class="uu-grades">${rounds.map((r, i) => `<span class="g-${U.grade(r.res.dev).key}">${i + 1}. ${U.grade(r.res.dev).label}</span>`).join('')}</div>
    ${sum.perfects ? `<p class="mg-center mg-small">✨ ${sum.perfects}× popolno → −${sum.perfects * U.PERFECT_BONUS} ms bonusa</p>` : ''}
    ${ic != null ? `<p class="mg-center uu-inner">🧠 Tvoja notranja ura: sekunda traja <b>${ic.toFixed(2).replace('.', ',')} s</b></p>` : ''}`;
}

async function finishSolo({ daily, first, seed, plan, played, interrupted, testMod }) {
  const rounds = played.map(p => p.res);
  const sum = U.summary(rounds);
  const total = sum.total;
  const counts = !interrupted;                       // prekinjena runda ne gre na lestvico ali rekord
  const canSubmit = counts && (!DEBUG || hub.offline);
  let record = false;

  if (daily && first && canSubmit) {
    await hub.submitScore(total, { seed, meta: { mod: plan.mod, devs: rounds.map(r => r.dev) } });
    S.update(key('days'), d => [...new Set([...(d || []), seed])].slice(-60), []);
  }
  if (!daily && counts && !DEBUG) {
    const prev = freeBest(diff);
    if (prev == null || total < prev) { S.save(key('best:' + diff), total); record = prev != null; }
  }
  const scored = daily && first && canSubmit;
  const { granted } = await hub.awardXp(U.xpFor({ hard: !daily && diff === 'hard', daily: scored, perfects: sum.perfects }), daily ? 'ustavi uro: dnevni izziv' : 'ustavi uro: prosta igra');
  const bestRound = Math.min(...rounds.map(r => r.dev));
  hub.reportGame({ players: 1, score: total, daily: scored })
    .then(() => hub.reportEvent('ustavi-uro:rounds', 1, { times: rounds.length }))
    .then(() => hub.reportEvent('ustavi-uro:round', bestRound))
    .then(() => counts && hub.reportEvent('ustavi-uro:total', total));
  if (counts) {
    await unlockMany(U.roundAchievements({ rounds: played, diff: daily ? 'daily' : diff, total, complete: true }));
    if (scored && U.dayStreak(dailyDays(), seed) >= 7) await unlock('vztrajen');
  } else await unlockMany(U.roundAchievements({ rounds: played, diff: 'easy', total: Infinity, complete: false }).filter(k => k !== 'prvi-stop'));
  if (record) setTimeout(() => A.fanfare(), 250);

  let rank = 0;
  if (daily && first) {
    const top = await hub.getLeaderboard({ seed, limit: 100 });
    rank = top.findIndex(r => r.user_id === hub.userId) + 1;
  }
  setStopBtn('off', 'Konec');
  const notes = [];
  if (interrupted) notes.push('Runda je bila prekinjena (pavza) — ne šteje za lestvico in rekord.');
  if (daily && !first) notes.push(testMod ? 'Preizkus modifikatorja — vedno vaja.' : 'Za lestvico je štel prvi današnji poskus — to je bila vaja.');
  if (DEBUG) notes.push('Debug način (krajši cilji).');
  const v = await ui.modal({
    title: record ? 'Nov rekord!' : sum.total < 200 ? 'Kot švicarska ura!' : 'Konec runde',
    wide: true,
    dismissible: false,
    onOpen: () => { if (record) ui.winFx('stars'); },
    html: `${summaryHtml(sum, played)}
      ${daily && first ? `<p class="mg-center">Mesto danes: <b>${rank ? rank + '.' : '—'}</b></p>` : ''}
      <p class="mg-center mg-xp-gain">+${granted} XP</p>
      ${notes.map(n => `<p class="mg-center mg-small mg-muted">${esc(n)}</p>`).join('')}`,
    actions: [{ label: 'Meni', value: 'menu' }, { label: 'Še enkrat', value: 'again', kind: 'primary' }],
  });
  if (v === 'again') playSolo(daily ? 'daily' : 'free'); else showMenu();
}

/* ===================================================================== */
/*  MULTIPLAYER                                                          */
/* ===================================================================== */

let room = null;
let mp = null;
let hostRunning = false;
let pending = null;             // host: { r, key, taps: {id: number[]}, rejoined:Set }
const spectators = new Set();
const DEFAULT_SETTINGS = { mode: 'duel', diff: 'easy' };
const REVEAL_MS = 5200;
const newSeed = () => Math.random().toString(36).slice(2, 10);

function nameOf(id) {
  return mp?.d?.names?.[id] || room?.players.find(p => p.id === id) || { nickname: '???', avatar: { emoji: '❔', color: '#888' }, equipped: {} };
}
const who = id => ({ ...nameOf(id), id });
const modeName = m => (m === 'last' ? 'Zadnji stoji' : 'Dvoboj');

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
  document.body.classList.toggle('uu-tv', tv);
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

function rejoinGame() {
  initMp(room.settings || DEFAULT_SETTINGS);
  enterPlayScreen();
  setBlind('');
  $('#targetLbl').textContent = 'Povezujem se v igro …';
  room.send('needSync', {});
  setTimeout(() => { if (mp && !mp.d && room && !room.left) showLobby(); }, 6000);
}

function closeModals() {
  document.querySelectorAll('.mg-modal-back').forEach(el => el.remove());
}

function showLobby() {
  closeModals();
  cancelRound();
  mp = null;
  show('lobby');
  lobbyView = ui.lobby($('#lobby'), room, {
    minPlayers: 2,
    title: 'Ustavi uro · soba',
    onStart: () => {},   // start posluša wireRoom
    onLeave: () => { room = null; mp = null; showMenu(); },
    settingsForm(el) {
      const cur = { ...DEFAULT_SETTINGS, ...room.settings };
      const opt = (v, l, sel) => `<option value="${v}" ${String(v) === String(sel) ? 'selected' : ''}>${l}</option>`;
      el.innerHTML = `<div class="mg-grid mg-grid--2">
        <div class="mg-field"><label class="mg-label" for="setMode">Način</label>
          <select class="mg-select" id="setMode">${opt('duel', 'Dvoboj (5 krogov)', cur.mode)}${opt('last', 'Zadnji stoji (izpadanje)', cur.mode)}</select></div>
        <div class="mg-field"><label class="mg-label" for="setDiff">Težavnost</label>
          <select class="mg-select" id="setDiff">${U.DIFFS.map(d => opt(d.id, `${d.name} — ${d.desc}`, cur.diff)).join('')}</select></div></div>`;
      return () => ({ mode: el.querySelector('#setMode').value, diff: el.querySelector('#setDiff').value, seed: newSeed() });
    },
  });
  const extra = document.createElement('section');
  extra.className = 'mg-card mg-stack';
  const renderExtra = () => {
    const specs = room ? room.players.filter(p => spectators.has(p.id)) : [];
    extra.innerHTML = `<div class="mg-row mg-row--between"><h2 class="mg-title" style="margin:0">📺 TV pogled</h2>
        <button type="button" class="mg-btn ${tv ? 'mg-btn--cyan' : 'mg-btn--ghost'} mg-btn--small" id="btnTv">${tv ? 'Ta naprava je TV ✓' : 'Ta naprava je TV'}</button></div>
      <p class="mg-muted mg-small" style="margin:0">TV pokaže veliko uro (izgine hkrati za vse), po krogu skupni trak z vsemi časi, na koncu stopničke.
        TV <b>ne igra</b> — igralci ustavljajo na telefonih.</p>
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
    if (r.isHost && p?.on && mp?.d && !mp.d.over) r.send('sync', { to: from, d: publicD() });
  });
  r.on('round', p => onRound(p));
  r.on('stop', (p, from) => onStopMsg(p, from));
  r.on('roundEnd', p => onRoundEnd(p));
  r.on('final', p => onFinal(p));
  r.on('react', (p, from) => onReact(p, from));
  r.on('needSync', (_p, from) => {
    if (!r.isHost || !mp?.d || from === hub.userId) return;
    if (pending) pending.rejoined.add(from);
    r.send('sync', { to: from, d: publicD() });
  });
  r.on('sync', p => {
    if (p.to !== hub.userId || !p.d) return;
    if (!mp || mp.gid !== p.d.gid) { initMp(p.d.settings || room.settings, p.d.gid); enterPlayScreen(); }
    acceptD(p.d);
    renderPlayers();
    renderSide();
    const me = mp.d.st[hub.userId];
    $('#targetLbl').textContent = p.d.over ? 'Igra je končana.' : me && me.out == null ? 'Spet si tu! Vključiš se v naslednji krog.' : 'Gledaš igro.';
    renderReact();
  });
  r.on('hostChanged', ({ hostId }) => {
    renderPlayers();
    renderSide();
    if (tv) r.send('spec', { on: true });
    if (hostId === hub.userId && r.status === 'playing' && mp?.d && !mp.d.over) {
      ui.toast('Host je odšel — igro vodiš ti.', { icon: '👑' });
      hostGame((mp.d.round || 0) + 1);
    }
  });
  r.on('status', s => {
    if (s === 'lobby' && $('#lobby').classList.contains('mg-hidden')) showLobby();
  });
  r.onPlayers(() => { if (mp) { renderPlayers(); renderSide(); } });
  r.on('kicked', () => { room = null; mp = null; cancelRound(); ui.toast('Host te je odstranil iz sobe.', { icon: '🚪' }); showMenu(); });
}

function initMp(settings, gid) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  mp = { settings: s, gid: gid || s.seed, d: null, curKey: null, doneSet: new Set(), my: [], finalShown: false, lastSeen: 0 };
  return mp;
}

function enterPlayScreen() {
  show('play');
  setupPlay({ mode: modeName(mp.settings.mode) + (tv ? ' · 📺 TV' : ''), n: mp.settings.mode === 'duel' ? U.ROUNDS : 0 });
  $('#modLbl').classList.remove('mg-hidden');
  $('#modLbl').textContent = `Soba ${room.code} · ${U.diffById(mp.settings.diff).name}`;
  $('#players').classList.remove('mg-hidden');
  $('#side').classList.remove('mg-hidden');
  $('.uu-layout').classList.add('has-side');
  $('#btnPause').classList.add('mg-hidden');
  if (mp.settings.mode !== 'duel') $('#dots').innerHTML = '';
  renderPlayers();
  renderSide();
}

function acceptD(d) {
  if (room?.isHost && hostRunning) return;
  mp.d = d;
}
const publicD = () => (mp?.d ? JSON.parse(JSON.stringify(mp.d)) : null);
const aliveIds = d => Object.keys(d.st).filter(id => d.st[id].out == null);

async function startMp(settings) {
  if (!room) return;
  closeModals();
  cancelRound();
  solo = null;
  A.unlockAudio();
  initMp(settings, settings.seed || newSeed());
  enterPlayScreen();
  const participants = room.players.filter(p => !spectators.has(p.id)).map(p => p.id);
  if (room.isHost && participants.length < 2) {
    ui.toast('Za igro potrebuješ vsaj 2 igralca (TV ne šteje).', { icon: '⚠️' });
    await room.setStatus('lobby');
    showLobby();
    return;
  }
  $('#targetLbl').textContent = mp.settings.mode === 'last' ? 'Vsak krog izpade najslabši!' : 'Vsi imate isto rundo. Zmaga najmanjše skupno odstopanje.';
  if (room.isHost) {
    const st = {}, names = {};
    for (const id of participants) st[id] = U.newPlayer();
    for (const p of room.players) names[p.id] = { nickname: p.nickname, avatar: p.avatar, equipped: p.equipped || {} };
    mp.d = { gid: mp.gid, settings: mp.settings, round: 0, st, names, over: false, last: null };
    room.send('roundEnd', { gid: mp.gid, r: 0, d: publicD() });
    await sleep(1200);
    hostGame(1);
  }
}

function specFor(r) {
  return scaleSpec(U.mpRound(hub.rng, String(mp.gid), mp.settings.diff, mp.settings.mode, r));
}

/* ------------------------------ host ------------------------------ */

async function hostGame(from) {
  if (hostRunning) return;
  hostRunning = true;
  const myMp = mp;
  const D = mp.d;
  const still = () => room && !room.left && room.isHost && mp === myMp && !D.over;
  try {
    for (let r = from; r <= 60; r++) {
      if (!still()) return;
      if (D.settings.mode === 'duel' && r > U.ROUNDS) break;
      if (D.settings.mode === 'last' && aliveIds(D).length <= 1) break;
      const spec = specFor(r);
      const key = `${D.gid}:${r}:${hub.userId}:${Date.now() % 1e7}`;
      pending = { r, key, taps: {}, rejoined: new Set() };
      room.send('round', { gid: D.gid, r, key });
      const until = Date.now() + 2600 + scaledDeadline(spec) + 1800;
      while (Date.now() < until) {
        await sleep(120);
        if (!still()) return;
        const present = new Set(room.players.map(p => p.id));
        if (aliveIds(D).every(id => pending.taps[id] || !present.has(id) || pending.rejoined.has(id))) break;
      }
      // ovrednoti (manjkajoči = prekoračitev)
      const results = {}, devs = {};
      for (const id of aliveIds(D)) {
        const res = U.scoreRound(spec, pending.taps[id] || []);
        results[id] = { dev: res.dev, signed: res.signed, perfect: res.perfect, overrun: res.overrun, taps: res.taps };
        devs[id] = res.dev;
        D.st[id] = U.addRound(D.st[id], res);
      }
      const out = D.settings.mode === 'last' ? U.eliminate(devs) : [];
      for (const id of out) D.st[id].out = r;
      for (const p of room.players) D.names[p.id] = { nickname: p.nickname, avatar: p.avatar, equipped: p.equipped || {} };
      D.round = r;
      D.last = { r, results, crowns: U.crowns(devs), out };
      pending = null;
      if (D.settings.mode === 'last' && aliveIds(D).length <= 1) D.over = true;
      if (D.settings.mode === 'duel' && r >= U.ROUNDS) D.over = true;
      room.send('roundEnd', { gid: D.gid, r, d: JSON.parse(JSON.stringify(D)) });
      await sleep(REVEAL_MS);
      if (D.over) break;
    }
    if (!room || room.left || !room.isHost || mp !== myMp) return;
    D.over = true;
    const order = U.ranking(D.st, D.settings.mode);
    room.send('final', { gid: D.gid, d: JSON.parse(JSON.stringify(D)), order, awards: U.awards(D.st, order, D.settings.mode) });
    room.setStatus('finished');
  } finally {
    hostRunning = false;
  }
}

function onStopMsg(p, from) {
  if (!mp) return;
  if (p.key === mp.curKey) { mp.doneSet.add(from); renderPlayers(); }
  if (room?.isHost && pending && p.key === pending.key && !pending.taps[from] && mp.d?.st[from]?.out == null) {
    pending.taps[from] = (Array.isArray(p.taps) ? p.taps : []).slice(0, 4).map(Number).filter(Number.isFinite);
    if (!pending.taps[from].length) pending.taps[from] = [Infinity];   // oddal brez stopa = prekoračitev
  }
}

/* ------------------------------ vsi ------------------------------ */

async function onRound({ gid, r, key: rk }) {
  if (!mp || mp.gid !== gid) return;
  if (!mp.d) { room.send('needSync', {}); return; }
  if (mp.d.over || mp.curKey === rk) return;
  cancelRound();
  closeModals();
  mp.curKey = rk;
  mp.doneSet = new Set();
  if ($('#play').classList.contains('mg-hidden')) enterPlayScreen();
  const spec = specFor(r);
  const me = mp.d.st[hub.userId];
  const playing = !!me && me.out == null && !tv;
  roundInfo(spec, r, mp.settings.mode === 'duel' ? U.ROUNDS : 0);
  if (mp.settings.mode === 'duel') dots(U.ROUNDS, mp.my.map(x => x.res), r - 1);
  clearReveal();
  setDialState('wait');
  setClock(spec.countdown ? U.fmtClock(U.lastStop(spec)) : '0,00');
  setBlind('');
  setRing(0);
  setStopBtn('off', playing ? 'STOP' : 'Gledaš …');
  renderPlayers();
  renderReact();
  await ui.countdown(3, { go: 'Start!', step: AUTO ? 250 : 700 });
  if (mp?.curKey !== rk) return;
  const out = await runRound(spec, { input: playing, solo: false });
  if (mp?.curKey !== rk || out.aborted) return;
  if (!playing) { setStopBtn('off', tv ? '📺' : 'Gledaš …'); return; }
  room?.send('stop', { key: rk, r, taps: out.taps.map(t => Math.round(t)) });
  mp.pendingMine = { r, spec, taps: out.taps };
  setStopBtn('off', out.taps.length ? '✓ Ustavljeno' : '⏰');
  setDialState('hidden');
  setBlind(out.taps.length ? '✓' : '⏰');
  $('#targetLbl').textContent = 'Čakam ostale …';
}

function onRoundEnd({ gid, r, d }) {
  if (!mp || mp.gid !== gid) return;
  acceptD(d);
  renderPlayers();
  renderSide();
  renderReact();
  if (!r || !d.last || d.last.r !== r || mp.lastSeen >= r) return;
  mp.lastSeen = r;
  if (active && active.phase === 'run') cancelRound('end');
  const spec = specFor(r);
  const L = d.last;
  const mine = L.results[hub.userId];
  if (mine) mp.my.push({ spec, res: { ...mine, devs: [], taps: mine.taps || [] } });
  if (mp.settings.mode === 'duel') dots(U.ROUNDS, mp.my.map(x => x.res), r);
  // skupni trak: vsi časi z avatarji
  const ids = Object.keys(L.results).sort((a, b) => L.results[a].dev - L.results[b].dev);
  const pins = ids.map(id => {
    const res = L.results[id];
    const v = res.signed.length > 1 ? (res.signed.some(x => x == null) ? null : Math.round(res.signed.reduce((a, b) => a + b, 0) / res.signed.length)) : res.signed[0];
    return stripMarker(v, ui.avatar(nameOf(id), 'sm') + (L.crowns.includes(id) ? '<em class="uu-crown">👑</em>' : ''), (id === hub.userId ? 'me ' : '') + (L.out.includes(id) ? 'is-elim' : ''));
  }).join('');
  const lineOut = L.out.length ? `${L.out.map(id => nameOf(id).nickname).join(', ')} izpade!` : (mp.settings.mode === 'last' ? 'Izenačenje na dnu — nihče ne izpade.' : '');
  if (mine) {
    reveal(spec, { ...mine }, { pins }).then(() => {
      if (L.out.includes(hub.userId)) $('#sayLbl').textContent = 'Izpadel si. Zdaj lahko navijaš z emojiji.';
      else if (L.crowns.includes(hub.userId)) $('#sayLbl').textContent = '👑 Najbližji v tem krogu!';
      if (lineOut && !L.out.includes(hub.userId)) $('#sayLbl').textContent += ' ' + lineOut;
    });
  } else {
    // gledalec / TV
    setDialState('reveal');
    const best = ids[0];
    setClock(best ? U.fmtSigned(L.results[best].signed[0]).replace(' ms', '') : '—');
    $('#devLbl').innerHTML = best ? `👑 ${ui.who(who(best))}` : '';
    $('#gradeLbl').textContent = best ? U.grade(L.results[best].dev).label : '';
    $('#gradeLbl').className = 'uu-grade g-' + (best ? U.grade(L.results[best].dev).key : 'miss');
    $('#sayLbl').textContent = lineOut;
    $('#reveal').classList.add('on');
    $('#strip').classList.add('on');
    $('#stripTrack').innerHTML = pins;
    setStopBtn('off', tv ? '📺' : 'Gledaš …');
  }
  $('#targetLbl').textContent = d.over ? 'Konec igre!' : `Krog ${r} končan`;
}

async function onFinal({ gid, d, order, awards }) {
  if (!mp || mp.gid !== gid || mp.finalShown) return;
  mp.finalShown = true;
  mp.d = d;
  cancelRound('final');
  renderPlayers();
  renderSide();
  renderReact();
  const winner = order[0];
  const me = d.st[hub.userId];
  const players = Object.keys(d.st).length;
  const mode = d.settings.mode;
  let xp = 0;
  if (me) {
    const win = winner === hub.userId;
    ({ granted: xp } = await hub.awardXp(U.xpFor({ hard: d.settings.diff === 'hard', perfects: me.perfects || 0, mpWin: win }), 'ustavi uro: ' + modeName(mode).toLowerCase()));
    const nRounds = me.devs.length;
    hub.reportGame({ won: win, players, score: me.total })
      .then(() => nRounds && hub.reportEvent('ustavi-uro:rounds', 1, { times: nRounds }))
      .then(() => me.best != null && hub.reportEvent('ustavi-uro:round', me.best))
      .then(() => mode === 'duel' && nRounds === U.ROUNDS && hub.reportEvent('ustavi-uro:total', me.total))
      .then(() => win && hub.reportEvent('ustavi-uro:mp-win'));
    const complete = mode === 'duel' && nRounds === U.ROUNDS;
    await unlockMany(U.roundAchievements({ rounds: mp.my, diff: d.settings.diff, total: me.total, complete }));
    if (win && players >= 4) await unlock(mode === 'last' ? 'zadnji-stoji' : 'dvoboj');
    if (win) setTimeout(() => A.fanfare(), 300);
  }
  $('#targetLbl').textContent = winner === hub.userId ? 'ZMAGA! Tvoja ura ne laže.' : `Zmagal je ${nameOf(winner).nickname}`;
  const list = order.map(id => ({
    ...who(id),
    scoreText: mode === 'last'
      ? (d.st[id].out == null ? `zadnji stoji · ${U.fmtMs(d.st[id].total)}` : `izpadel ${d.st[id].out}. krog`)
      : U.fmtMs(d.st[id].total),
    xp: id === hub.userId ? xp : 0,
  }));
  renderEndbar();
  const extra = awardsHtml(awards) + (mp.my.length ? `<h3 class="mg-title uu-h3">Tvoja runda</h3>${summaryHtml(U.summary(mp.my.map(x => x.res)), mp.my)}` : '');
  const v = await ui.results(list, { title: `Rezultati · ${modeName(mode)}`, again: room?.isHost ? 'Revanša' : 'Zapri', extraHtml: extra });
  if (!room || room.left || mp?.gid !== gid) return;
  if (v === 'again' && room.isHost) rematch();
}

function awardsHtml(awards) {
  if (!awards?.length) return '';
  return `<div class="uu-awards">${awards.map(a => `<div class="uu-award"><span>${a.icon}</span>
    <div><b>${esc(a.title)}</b><span class="mg-small mg-muted">${esc(a.desc)}</span></div><span class="mg-spacer"></span>${ui.who(who(a.id))}</div>`).join('')}</div>`;
}

function rematch() {
  if (!room?.isHost) return;
  room.start({ ...(mp?.settings || DEFAULT_SETTINGS), seed: newSeed() });
}

function renderEndbar() {
  setStopBtn('off', 'Konec');
  const el = $('#react');
  el.classList.remove('mg-hidden');
  el.innerHTML = room?.isHost
    ? '<button class="mg-btn mg-btn--primary" id="btnRematch">Revanša</button><button class="mg-btn mg-btn--ghost" id="btnToLobby">V lobby</button>'
    : '<span class="mg-muted mg-small">Čakam, da host začne revanšo …</span>';
  el.querySelector('#btnRematch')?.addEventListener('click', rematch);
  el.querySelector('#btnToLobby')?.addEventListener('click', async () => { await room.setStatus('lobby'); showLobby(); });
}

/* ------------------------------ izris ------------------------------ */

function renderPlayers() {
  if (!mp?.d) { $('#players').innerHTML = ''; return; }
  const d = mp.d;
  const present = new Set(room?.players.map(p => p.id) || []);
  const ids = U.ranking(d.st, d.settings.mode);
  const L = d.last;
  $('#players').innerHTML = ids.map(id => {
    const p = d.st[id];
    const out = p.out != null;
    const done = mp.doneSet.has(id);
    const cls = out ? 'out' : done ? 'done' : !present.has(id) ? 'away' : '';
    const mark = out ? '✕' : done ? '✓' : '⏱';
    const crown = L && L.crowns.includes(id) ? '👑' : '';
    return `<div class="uu-pl ${cls} ${id === hub.userId ? 'me' : ''}" data-id="${esc(id)}" title="${esc(nameOf(id).nickname)}">
      ${ui.avatar(nameOf(id), 'sm')}<span class="uu-pl__name">${ui.name(nameOf(id))}</span>
      <span class="uu-pl__st">${crown}${mark}</span>${p.devs.length ? `<span class="uu-pl__tot">${p.total}</span>` : ''}</div>`;
  }).join('');
}

function renderSide() {
  if (!mp?.d) { $('#side').innerHTML = ''; return; }
  const d = mp.d;
  const present = new Set(room?.players.map(p => p.id) || []);
  const L = d.last;
  const rows = U.ranking(d.st, d.settings.mode).map((id, i) => {
    const p = d.st[id];
    const last = L?.results?.[id];
    return `<tr class="${p.out != null ? 'out' : ''} ${id === hub.userId ? 'mg-me' : ''}"><td class="mg-rank">${i + 1}.</td>
      <td>${ui.who(who(id))}${room?.hostId === id ? ' <span class="mg-badge mg-badge--yellow">host</span>' : ''}${present.has(id) ? '' : ' <span class="mg-badge">odsoten</span>'}${p.out != null ? ` <span class="mg-badge mg-badge--red">izpadel ${p.out}.</span>` : ''}</td>
      <td class="mg-num">${last ? (L.crowns.includes(id) ? '👑 ' : '') + last.dev : ''}</td><td class="mg-num"><b>${p.devs.length ? p.total : '—'}</b></td></tr>`;
  }).join('');
  $('#side').innerHTML = `<div class="mg-row mg-row--between"><h2 class="mg-title" style="margin:0">${modeName(d.settings.mode)}</h2>
      <span class="mg-badge">Soba ${esc(room?.code || '')}</span></div>
    <table class="mg-table"><thead><tr><th></th><th>Igralec</th><th class="mg-num">Krog</th><th class="mg-num">Skupaj ms</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ------------------------- emoji odzivi (Zadnji stoji) ------------------------- */

const REACTS = ['🔥', '😂', '😱', '👏', '🙏', '💤'];
let reactTarget = null;
let lastReact = 0;

function renderReact() {
  const el = $('#react');
  if (!mp?.d || mp.d.over || mp.finalShown) { if (!mp?.finalShown) el.classList.add('mg-hidden'); return; }
  const me = mp.d.st[hub.userId];
  const canReact = mp.d.settings.mode === 'last' && (tv || !me || me.out != null);
  el.classList.toggle('mg-hidden', !canReact);
  if (!canReact) return;
  const alive = aliveIds(mp.d);
  if (!alive.includes(reactTarget)) reactTarget = alive[0] || null;
  el.innerHTML = `<span class="mg-small mg-muted">Navijaj za:</span>
    ${alive.map(id => `<button type="button" class="uu-react__t ${id === reactTarget ? 'on' : ''}" data-t="${esc(id)}">${ui.avatar(nameOf(id), 'sm')}</button>`).join('')}
    <span class="uu-react__sep"></span>
    ${REACTS.map(e => `<button type="button" class="uu-react__e" data-e="${e}">${e}</button>`).join('')}`;
  el.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { reactTarget = b.dataset.t; renderReact(); }));
  el.querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', () => {
    if (Date.now() - lastReact < 400 || !reactTarget) return;
    lastReact = Date.now();
    room?.send('react', { to: reactTarget, e: b.dataset.e });
  }));
}

function onReact(p, from) {
  if (!mp?.d || !REACTS.includes(p?.e)) return;
  const st = mp.d.st[from];
  if (st && st.out == null && !spectators.has(from)) return;   // odzive pošiljajo le izpadli in TV
  const chip = $(`#players .uu-pl[data-id="${CSS.escape(String(p.to))}"]`);
  if (!chip) return;
  const f = document.createElement('span');
  f.className = 'uu-float';
  f.textContent = p.e;
  f.style.left = (20 + Math.random() * 60) + '%';
  chip.appendChild(f);
  setTimeout(() => f.remove(), reduced() ? 900 : 1600);
}

/* ===================================================================== */
/*  Zagon                                                                */
/* ===================================================================== */

function renderMute() {
  $('#btnMute').textContent = A.isMuted() ? '🔇' : '🔊';
  $('#btnMute').setAttribute('aria-label', A.isMuted() ? 'Vklopi zvok' : 'Utišaj zvok');
}

async function main() {
  await hub.init({ gameId: GAME, scoreOrder: 'asc' });
  ui.header({ title: 'Ustavi uro' });
  if (tv) document.body.classList.add('uu-tv');
  renderMute();
  $('#diffSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    diff = b.dataset.d;
    S.save(`${GAME}:diff`, diff);
    renderDiff();
  });
  $('#btnFree').addEventListener('click', () => playSolo('free'));
  $('#btnDaily').addEventListener('click', () => playSolo('daily'));
  $('#optTick').addEventListener('change', e => A.setTickOn(e.target.checked));
  $('#btnCreate').addEventListener('click', createRoom);
  $('#joinCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
  $('#joinForm').addEventListener('submit', e => { e.preventDefault(); joinRoom($('#joinCode').value); });
  $('#btnMute').addEventListener('click', () => { A.unlockAudio(); A.setMuted(!A.isMuted()); renderMute(); });
  $('#btnPause').addEventListener('click', () => pauseSolo());
  $('#btnQuit').addEventListener('click', async () => {
    if (!(await ui.confirm(room ? 'Zapustiš sobo?' : 'Prekineš rundo? Rezultat ne bo shranjen.', { yes: 'Prekini', danger: true }))) return;
    if (solo) solo.cancelled = true;
    solo = null;
    nextResolve?.();
    cancelRound('quit');
    if (room) { await room.leave(); room = null; mp = null; }
    showMenu();
  });
  const code = hub.roomFromUrl();
  if (code) joinRoom(code); else showMenu();
}

main();
