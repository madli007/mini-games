/* =====================================================================
   HERODLE — zagon, zavihki načinov, statistika, nastavitve, pomoč,
   »Prijatelji danes«, arhiv, popolni dan. Načini so ločeni moduli
   (modes/*.js) z enakim vmesnikom; nov način = nov modul + vrstica v MODES.
   ===================================================================== */
import { hub, ui, util } from '../../shared/hub.js';
import { HEROES } from './heroes.js';
import {
  ATTRS, POOLS, POOL_IDS, HINT_MODES, HINT_MODE_IDS, computeStats, pluralPoskus, poolLabel, compare, isHintMode, modeLabel,
  isPerfectDay, shareAllText, archiveDates, fmtDate, XP_PERFECT, XP_ARCHIVE, puzzleNumber,
} from './logic.js';
import * as daily from './daily.js';
import * as store from './store.js';
import * as sound from './sound.js';
import * as klasika from './modes/klasika.js';
import * as emoji from './modes/emoji.js';
import * as kostum from './modes/kostum.js';
import * as dosje from './modes/dosje.js';
import { token } from './search.js';
import { enrichCards } from './bonus.js';
import { shareOut, reduced } from './share.js';
import { attemptsOf } from './modes/hintmode.js';

const GAME = 'herodle';
const $ = s => document.querySelector(s);
const esc = ui.esc;

/** Registrirani načini (vrstni red = zavihki in »Naslednji način →«). */
const MODES = [klasika, emoji, kostum, dosje];

export const ACH = [
  { key: 'prvi-junak', title: 'Prvi junak', icon: '🦸', desc: 'Reši prvo uganko Herodla' },
  { key: 'jasnovidec', title: 'Jasnovidec', icon: '🔮', desc: 'Reši Klasiko v prvem poskusu' },
  { key: 'trojka', title: 'Hat-trick', icon: '🎩', desc: 'Reši Klasiko v največ 3 poskusih' },
  { key: 'vse-zvezdice', title: 'Fanboy', icon: '⭐', desc: 'Dobi vse 3 ⭐ v bonusu' },
  { key: 'teden', title: 'Teden junaštva', icon: '📅', desc: 'Reši Klasiko 7 dni zapored' },
  { key: 'mesec', title: 'Mesečni ritual', icon: '🗓️', desc: 'Reši Klasiko 30 dni zapored' },
  { key: 'lobanja', title: 'Brez milosti', icon: '💀', desc: 'Reši Klasiko v težkem načinu v največ 5 poskusih' },
  { key: 'oba-svetova', title: 'Multiverzum', icon: '🌌', desc: 'Isti dan reši Samo MCU in Samo DC' },
  // 2. faza
  { key: 'popolni-dan', title: 'Popolni dan', icon: '🏆', desc: 'Isti dan reši Klasiko, Emoji, Kostum in Dosje' },
  { key: 'emoji-mojster', title: 'Emoji mojster', icon: '😶‍🌫️', desc: 'Reši Emoji, ko je viden samo 1 emoji' },
  { key: 'modni-kritik', title: 'Modni kritik', icon: '🎨', desc: 'Reši Kostum brez namigov (v največ 3 poskusih)' },
  { key: 'detektiv', title: 'Detektiv', icon: '🕵️', desc: 'Reši Dosje s prvim namigom' },
  { key: 'arhivar', title: 'Arhivar', icon: '📚', desc: 'Reši 10 arhivskih ugank' },
];
const unlock = k => { const a = ACH.find(x => x.key === k); return a ? hub.unlock(k, { title: a.title, icon: a.icon }) : null; };

const byId = new Map(HEROES.map(h => [h.id, h]));
let date = null;
let current = null;     // trenutni način
let archive = null;     // { date, mode } ko je odprta arhivska uganka
let friends = null;     // ui.leaderboard

/* ------------------------------------------------------------------ */

function applySettings() {
  const s = store.getSettings();
  document.body.classList.toggle('hd-contrast', !!s.contrast);
  $('#btnSound').textContent = sound.isMuted() ? '🔇' : '🔊';
  $('#btnSound').setAttribute('aria-label', sound.isMuted() ? 'Vklopi zvok' : 'Utišaj');
}

function renderTabs() {
  $('#modeTabs').innerHTML = MODES.map(m => `<button class="hd-tab" role="tab" data-m="${m.id}" aria-selected="${m === current && !archive}">
    <span aria-hidden="true">${m.icon}</span> <span class="hd-tab__t">${esc(m.label)}</span>${m.isSolved(store, date) ? ' <i class="ok" aria-label="rešeno">✓</i>' : ''}</button>`).join('');
  $('#modeTabs').querySelectorAll('.hd-tab').forEach(b => b.addEventListener('click', () => goMode(b.dataset.m)));
}

/** Preklopi na dnevni način (zapre arhiv). */
function goMode(id) {
  const m = MODES.find(x => x.id === id);
  if (!m || (m === current && !archive)) return;
  if (archive) closeArchiveView(false);
  mountMode(m);
}

const modeDone = (m, d = date) => (m.isDone ? m.isDone(store, d) : POOL_IDS.some(p => klasika.isDone(store, p, d)));

/** Prvi nerešen današnji način za »Naslednji način →« (po vrstnem redu, za trenutnim). */
function nextMode(fromId) {
  const i = MODES.findIndex(m => m.id === fromId);
  const order = [...MODES.slice(i + 1), ...MODES.slice(0, Math.max(0, i))];
  const m = order.find(x => !modeDone(x));
  return m ? { id: m.id, label: m.label, icon: m.icon } : null;
}

function ctxFor() {
  return {
    hub, ui, util, daily, heroes: HEROES, byId, sound, store, date, unlock,
    onChange: () => { renderTabs(); refreshSide(); },
    openStats, showLegend, goMode, nextMode, shareAll, afterSolve,
  };
}

function mountMode(m) {
  current?.unmount();
  current = m;
  m.mount($('#modeRoot'), ctxFor());
  renderTabs();
  refreshSide();
}

/* ------------------------------------------------------------------ */
/*  Popolni dan in »Deli vse današnje«                                 */
/* ------------------------------------------------------------------ */

function todayStates() {
  const out = {};
  for (const m of [...POOL_IDS, ...HINT_MODE_IDS]) out[m] = store.loadGame(m, date);
  return out;
}

/** Po vsaki rešeni dnevni uganki: ali je dosežen popolni dan? */
async function afterSolve() {
  if (!isPerfectDay(todayStates()) || !store.markPerfect(date)) return;
  perfectFx();
  try {
    await hub.awardXp(XP_PERFECT, 'herodle: popolni dan');
    await hub.reportEvent('herodle:perfect-day', 1);
    await unlock('popolni-dan');
  } catch (e) { console.warn('[herodle] popolni dan', e); }
}

function perfectFx() {
  sound.fanfare();
  ui.winFx?.('stars');
  ui.toast('🏆 Popolni dan! Vsi štirje načini rešeni. +20 XP', { duration: 5000 });
  if (reduced()) return;
  const el = document.createElement('div');
  el.className = 'hd-perfect';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="hd-perfect__in"><span class="hd-perfect__cup">🏆</span><b>POPOLNI DAN!</b>
    <span class="hd-perfect__row">${MODES.map(m => `<i>${m.icon}</i>`).join('')}</span></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function shareAll() {
  const st = todayStates();
  const done = g => g.solved || g.gaveUp || g.lost;
  const classic = POOL_IDS.filter(p => done(st[p])).map(p => {
    const g = st[p];
    return { mode: p, results: g.guesses.map(x => x.r), solved: g.solved, gaveUp: g.gaveUp, hard: !!g.hard, stars: g.bonus?.done ? g.bonus.stars : null };
  });
  const hint = HINT_MODE_IDS.filter(m => done(st[m])).map(m => ({ mode: m, attempts: attemptsOf(st[m]), solved: !!st[m].solved, gaveUp: !!st[m].gaveUp, lost: !!st[m].lost }));
  const text = shareAllText({ date, classic, hint, perfect: store.perfectDays().includes(date) });
  if (!text) { ui.toast('Danes še nisi končal nobene uganke.', { icon: '🦸' }); return; }
  shareOut(ui, text, 'Deli vse današnje');
}

/* ------------------------------------------------------------------ */
/*  Arhiv                                                              */
/* ------------------------------------------------------------------ */

const ARCH_COLS = [
  ...POOLS.map(p => ({ id: p.id, icon: '🧩', short: p.short })),
  ...HINT_MODES.map(m => ({ id: m.id, icon: m.icon, short: m.label })),
];

/** Stanje uganke za koledar: dnevno ima prednost (tisto ni mogoče ponoviti v arhivu). */
function archState(mode, d) {
  const g = store.loadGame(mode, d);
  if (g.solved) return { cls: 'ok', sym: '✓', txt: 'rešeno' };
  if (g.gaveUp) return { cls: 'give', sym: '🏳️', txt: 'predano' };
  if (g.lost) return { cls: 'lost', sym: '✗', txt: 'ni rešeno' };
  const a = store.loadArchive(mode, d);
  if (a.solved) return { cls: 'ok arch', sym: '✓', txt: 'rešeno v arhivu' };
  if (a.gaveUp) return { cls: 'give arch', sym: '🏳️', txt: 'predano v arhivu' };
  if (a.lost) return { cls: 'lost arch', sym: '✗', txt: 'ni rešeno v arhivu' };
  if (a.guesses.length) return { cls: 'play', sym: '…', txt: 'začeto' };
  return { cls: 'none', sym: '', txt: 'neodigrano' };
}

const daysLabel = n => (n === 1 ? 'Zadnji dan' : n === 2 ? 'Zadnja 2 dneva' : n <= 4 ? `Zadnji ${n} dnevi` : `Zadnjih ${n} dni`);

async function openArchive() {
  const dates = archiveDates(date);
  await ui.modal({
    title: '📅 Arhiv',
    wide: true,
    html: dates.length ? `<p class="mg-small mg-muted">${daysLabel(dates.length)}. Arhiv ne šteje za lestvico, niz in statistiko — šteje pa za XP (${XP_ARCHIVE} na uganko) in naloge.</p>
      <div class="hd-arch" role="grid" aria-label="Arhiv ugank">
        <div class="hd-arch__row hd-arch__row--head" role="row"><span role="columnheader">Dan</span>${ARCH_COLS.map(c => `<span role="columnheader" title="${esc(modeLabel(c.id))}"><i aria-hidden="true">${c.icon}</i><small>${esc(c.short)}</small></span>`).join('')}</div>
        ${dates.map(d => `<div class="hd-arch__row" role="row"><span class="hd-arch__d" role="rowheader" title="${esc(fmtDate(d))}"><b>#${puzzleNumber(d)}</b><span>${esc(fmtDate(d).replace(/ \d{4}$/, ''))}</span></span>${ARCH_COLS.map(c => {
          const s = archState(c.id, d);
          return `<button type="button" role="gridcell" class="hd-arch__c ${s.cls}" data-d="${d}" data-m="${c.id}" aria-label="${esc(modeLabel(c.id))}, ${esc(fmtDate(d))}: ${s.txt}" title="${esc(modeLabel(c.id))}: ${s.txt}">${s.sym}</button>`;
        }).join('')}</div>`).join('')}
      </div>
      <ul class="hd-arch__leg mg-small mg-muted"><li><span class="hd-arch__c ok">✓</span> rešeno</li><li><span class="hd-arch__c ok arch">✓</span> rešeno v arhivu</li><li><span class="hd-arch__c give">🏳️</span> predano</li><li><span class="hd-arch__c lost">✗</span> ni rešeno</li><li><span class="hd-arch__c none"></span> neodigrano</li></ul>`
      : '<p>Arhiv je še prazen — prva uganka je bila objavljena danes. Jutri bo tu včerajšnji dan.</p>',
    actions: [{ label: 'Zapri', value: null }],
    onOpen: (el, close) => {
      el.querySelectorAll('.hd-arch__c[data-d]').forEach(b => b.addEventListener('click', () => { close(null); openArchivePuzzle(b.dataset.m, b.dataset.d); }));
    },
  });
}

async function openArchivePuzzle(mode, d) {
  let heroId;
  try { heroId = await daily.reveal(mode, d); } catch (e) { ui.toast(e.message || 'Arhivske uganke ni bilo mogoče odpreti.', { icon: '⚠️' }); return; }
  const hero = byId.get(heroId);
  if (!hero) { ui.toast('Neznan lik.', { icon: '⚠️' }); return; }
  const view = store.archiveView();
  const base = { ...ctxFor(), store: view, date: d };
  const onFinish = r => archiveFinished(r, d);
  let c, mod;
  if (isHintMode(mode)) {
    const { HINTS } = await import('./hints.js');
    mod = MODES.find(m => m.id === mode);
    c = { ...base, archive: { date: d, mode, heroId, entry: HINTS[heroId], hero, onFinish } };
  } else {
    mod = klasika;
    // lokalni »daily« za pretekli dan (zaščita ni potrebna; lik je razkrit z herodle_reveal)
    const local = {
      async check(m, _d, id) {
        const g = byId.get(id);
        const res = compare(g, hero);
        return g.id === hero.id ? { solved: true, result: res, heroId: hero.id } : { solved: false, result: res };
      },
      async giveUp() { return hero.id; },
    };
    c = { ...base, daily: local, archive: { date: d, mode, onFinish } };
  }
  current?.unmount();
  current = mod;
  archive = { date: d, mode };
  $('#archBanner').innerHTML = `<div class="hd-archbar"><span>📅 <b>Arhiv · ${esc(fmtDate(d))}</b> · ${esc(modeLabel(mode))}${view.isDailyDone(mode, d) ? ' · samo pogled (rešeno kot dnevna uganka)' : ''}</span>
    <button type="button" class="mg-btn mg-btn--small mg-btn--ghost" id="archBack">← Današnje uganke</button></div>`;
  $('#archBack').addEventListener('click', () => closeArchiveView(true));
  mod.mount($('#modeRoot'), c);
  renderTabs();
  refreshSide();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeArchiveView(remount) {
  archive = null;
  $('#archBanner').innerHTML = '';
  if (remount) mountMode(current || klasika);
}

/** Konec arhivske uganke: XP 5 (rešeno), naloge (daily: false), Arhivar. NE lestvica, niz, statistika. */
async function archiveFinished({ mode, solved, attempts }, d) {
  try {
    await hub.reportGame({ won: !!solved, players: 1, score: solved ? attempts : null, daily: false });
    if (!solved) return;
    const n = store.markArchiveSolved(mode, d);
    await hub.awardXp(XP_ARCHIVE, 'herodle: arhiv');
    await hub.reportEvent('herodle:archive', 1);
    if (n >= 10) await unlock('arhivar');
  } catch (e) { console.warn('[herodle] arhiv', e); }
}

/* ------------------------------------------------------------------ */
/*  Stranski panel: prijatelji danes + legenda                         */
/* ------------------------------------------------------------------ */

const fmtTries = s => `${s} ${pluralPoskus(s)}`;
const boardTabs = () => [
  { label: 'Danes', seed: `${date}:klasika` },
  { label: 'MCU', seed: `${date}:klasika-mcu` },
  { label: 'DC', seed: `${date}:klasika-dc` },
  ...HINT_MODES.map(m => ({ label: `${m.icon} ${m.label}`, seed: `${date}:${m.id}` })),
  { label: 'Ta teden', period: 'week' },
];
const anyLabel = p => (isHintMode(p) ? modeLabel(p) : poolLabel(p));

function refreshSide() {
  const pool = (!archive && current?.currentPool?.()) || 'klasika';
  if (!friends) {
    friends = ui.leaderboard($('#friends'), { title: '', order: 'asc', format: fmtTries, limit: 10, tabs: boardTabs() });
  } else friends.refresh();
  miniHist($('#friendsHist'), pool);
  $('#sideLegendPanel').hidden = isHintMode(pool);
}

/** Koliko poskusov so danes rabili ostali (brez razkritja lika). */
async function miniHist(el, pool) {
  try {
    const rows = await hub.getLeaderboard({ seed: `${date}:${pool}`, limit: 100, order: 'asc' });
    if (!rows.length) { el.innerHTML = `<p class="mg-small mg-muted">Danes v načinu ${esc(anyLabel(pool))} še nihče ni rešil. Bodi prvi!</p>`; return; }
    const b = Array(7).fill(0);   // 1,2,3,4,5,6–9,10+
    for (const r of rows) b[r.score <= 5 ? r.score - 1 : r.score <= 9 ? 5 : 6]++;
    const max = Math.max(...b);
    const lab = ['1', '2', '3', '4', '5', '6–9', '10+'];
    const mine = rows.find(r => r.user_id === hub.userId)?.score;
    const mineB = mine == null ? -1 : mine <= 5 ? mine - 1 : mine <= 9 ? 5 : 6;
    el.innerHTML = `<div class="hd-mini" aria-label="Porazdelitev poskusov danes">${b.map((n, i) => `<div class="hd-mini__col${i === mineB ? ' me' : ''}">
      <span class="hd-mini__n">${n || ''}</span><i style="height:${max ? Math.max(4, Math.round(56 * n / max)) : 4}px"></i><span>${lab[i]}</span></div>`).join('')}</div>
      <p class="mg-small mg-muted mg-center">${rows.length} ${rows.length === 1 ? 'igralec je' : 'igralcev je'} danes rešil${rows.length === 1 ? '' : 'o'} · ${esc(anyLabel(pool))}</p>`;
  } catch { el.innerHTML = ''; }
}

function legendHtml() {
  return `<ul class="hd-legend">
    <li><span class="hd-cell c-g mini"><i class="sym">✓</i></span> pravilno</li>
    <li><span class="hd-cell c-y mini"><i class="sym">≈</i></span> delno / blizu (±10 let)</li>
    <li><span class="hd-cell c-r mini"><i class="sym">✗</i></span> narobe</li>
    <li><b class="hd-arr up">↑</b><b class="hd-arr down">↓</b> skriti lik je kasnejši / zgodnejši</li>
  </ul>`;
}

const LEGEND = {
  universe: 'Marvel ali DC. Zeleno = isti univerzum.',
  team: 'Zeleno = ista glavna ekipa (»Brez« = brez ekipe). Rumeno = ujema se katera koli ekipa lika (+N pomeni, da jih ima več).',
  species: 'Človek, bog, polbog, vesoljec, atlantid, eternal, android, mutant, simbiot, inhuman, demon …',
  origin: 'Od kod moči: tehnologija, božanski, nesreča, magija, rojen, zelišče, trening, serum, kozmično, brez. Zeleno = vsi izvori enaki, rumeno = vsaj eden.',
  gender: 'M, Ž ali drugo.',
  year: 'Leto prvega stripa. Zeleno = točno, rumeno = največ 10 let razlike. Puščica ↑ = skriti lik je kasnejši, ↓ = zgodnejši.',
  side: 'Junak, zlobec ali antijunak.',
};

function showLegend(focus) {
  ui.modal({
    title: 'Legenda',
    html: `${legendHtml()}<dl class="hd-legdl">${ATTRS.map(a => `<div class="${a.key === focus ? 'focus' : ''}"><dt>${a.icon} ${esc(a.label)}</dt><dd>${esc(LEGEND[a.key])}</dd></div>`).join('')}</dl>`,
  });
}

/* ------------------------------------------------------------------ */
/*  Statistika                                                         */
/* ------------------------------------------------------------------ */

const STAT_TABS = [...POOLS.map(p => ({ id: p.id, label: p.label })), ...HINT_MODES.map(m => ({ id: m.id, label: `${m.icon} ${m.label}` }))];

async function openStats(pool = current?.currentPool?.() || 'klasika') {
  let active = pool;
  const draw = el => {
    const s = computeStats(store.statsDays(active), date);
    const max = Math.max(1, ...s.hist);
    el.querySelector('.hd-stats__tabs').innerHTML = STAT_TABS.map(p => `<button class="mg-tab" data-p="${p.id}" aria-selected="${p.id === active}">${esc(p.label)}</button>`).join('');
    const rows = active === 'dosje' ? 6 : 10;
    el.querySelector('.hd-stats__body').innerHTML = `
      <div class="hd-nums">
        <div><b>${s.played}</b><span>odigrano</span></div>
        <div><b>${s.pct}%</b><span>rešenih</span></div>
        <div><b>${s.current}</b><span>niz 🔥</span></div>
        <div><b>${s.best}</b><span>najdaljši niz</span></div>
        <div><b>${s.avg ?? '—'}</b><span>povprečje</span></div>
      </div>
      <h3 class="hd-sub">Poskusi do rešitve</h3>
      <div class="hd-hist">${s.hist.slice(0, rows).map((n, i) => `<div class="hd-hist__row${s.todayBucket === i + 1 ? ' today' : ''}">
        <span>${i === 9 ? '10+' : i + 1}</span><i style="width:${Math.max(6, Math.round(100 * n / max))}%"><b>${n}</b></i></div>`).join('')}</div>
      <p class="mg-small mg-muted">Popolnih dni: <b>${store.perfectDays().length}</b> · rešenih v arhivu: <b>${store.archiveSolved().length}</b></p>`;
    el.querySelectorAll('.hd-stats__tabs .mg-tab').forEach(b => b.addEventListener('click', () => { active = b.dataset.p; draw(el); }));
  };
  const mine = new Set((await hub.getAchievements().catch(() => [])).map(a => a.key));
  await ui.modal({
    title: 'Statistika',
    wide: true,
    html: `<div class="hd-stats"><div class="mg-tabs hd-stats__tabs" role="tablist"></div><div class="hd-stats__body"></div>
      <h3 class="hd-sub">Prijatelji danes</h3><div class="hd-stats__board"></div>
      <h3 class="hd-sub">Dosežki</h3><div class="hd-ach">${ACH.map(a => `<div class="hd-ach__item ${mine.has(a.key) ? '' : 'locked'}"><span>${a.icon}</span><div><b>${esc(a.title)}</b><small>${esc(a.desc)}</small></div></div>`).join('')}</div></div>`,
    onOpen: el => {
      draw(el);
      ui.leaderboard(el.querySelector('.hd-stats__board'), { title: '', order: 'asc', format: fmtTries, tabs: boardTabs() });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Nastavitve in pomoč                                                */
/* ------------------------------------------------------------------ */

async function openSettings() {
  const s = store.getSettings();
  const r = { hard: !!s.hard, contrast: !!s.contrast, sound: !sound.isMuted() };
  const started = POOLS.some(p => store.loadGame(p.id, date).guesses.length && !store.loadGame(p.id, date).solved && !store.loadGame(p.id, date).gaveUp);
  const v = await ui.modal({
    title: 'Nastavitve',
    html: `<div class="mg-stack">
      <label class="mg-check"><input type="checkbox" id="setHard" ${s.hard ? 'checked' : ''} ${started ? 'disabled' : ''}>
        <span>💀 <b>Težki način</b> (Klasika) — vsak poskus mora upoštevati vse zelene namige.${started ? '<br><small class="mg-muted">Spremeniš ga lahko le pred prvim poskusom dneva (v bazenu, ki ga igraš).</small>' : ''}</span></label>
      <label class="mg-check"><input type="checkbox" id="setContrast" ${s.contrast ? 'checked' : ''}>
        <span>🎨 <b>Visok kontrast</b> — oranžno (pravilno) in modro (delno).</span></label>
      <label class="mg-check"><input type="checkbox" id="setSound" ${sound.isMuted() ? '' : 'checked'}>
        <span>🔊 <b>Zvok</b></span></label>
      <p class="mg-small mg-muted">${hub.offline ? 'Offline način: lik dneva se izračuna v brskalniku.' : 'Lik dneva in namige preverja strežnik — v kodi strani jih ni.'}</p>
    </div>`,
    actions: [{ label: 'Zapri', value: false }, { label: 'Shrani', value: true, kind: 'primary' }],
    onOpen: el => {
      for (const [id, k] of [['#setHard', 'hard'], ['#setContrast', 'contrast'], ['#setSound', 'sound']]) {
        el.querySelector(id).addEventListener('change', e => { r[k] = e.target.checked; });
      }
    },
  });
  if (!v) return;
  store.setSettings({ hard: r.hard, contrast: r.contrast });
  sound.setMuted(!r.sound);
  applySettings();
  if (current && !archive) mountMode(current);
}

function helpHtml() {
  const ex = HEROES.find(h => h.id === 'iron-man'), tg = HEROES.find(h => h.id === 'hawkeye');
  const r = compare(ex, tg);
  const val = { universe: ex.universe, team: 'Avengers', species: ex.species, origin: 'Tehnol.', gender: 'M', year: String(ex.firstComic), side: ex.alignment };
  return `<div class="hd-help">
    <p>Vsak dan je skrit <b>en junak ali zlobec</b> (Marvel ali DC) — za vse igralce isti. Vpiši lik in barve ti povedo, kako blizu si.
    Poskusov je neomejeno, šteje pa vsak.</p>
    <div class="hd-help__ex" aria-label="Primer vrstice">
      <div class="hd-row__who">${token(ex)}<b>${esc(ex.name)}</b></div>
      <div class="hd-row__cells">${ATTRS.map((a, k) => `<div class="hd-cell c-${r[a.key]}" style="--i:${k}"><span class="hd-cell__in"><span class="v-full v-any">${esc(val[a.key])}</span>
        <span class="hd-cell__foot"><i class="sym">${{ g: '✓', y: '≈', r: '✗' }[r[a.key]]}</i>${a.key === 'year' && r.dir ? `<span class="hd-arr ${r.dir}">${r.dir === 'up' ? '↑' : '↓'}</span>` : ''}</span></span></div>`).join('')}</div>
    </div>
    <p class="mg-small mg-muted">Skriti lik je tu nekdo iz Avengers, človek, moški, junak … in njegov prvi strip je izšel kasneje (↑), a v 10 letih (rumeno).</p>
    ${legendHtml()}
    <p>Po zmagi te čaka <b>bonus krog</b> (3 vprašanja za ⭐), potem pa <b>dosje</b> lika. Bazena <b>Samo MCU</b> in <b>Samo DC</b> imata svoj lik, niz in lestvico.</p>
    <h3 class="hd-sub">Še trije načini — vsak s svojim likom dneva</h3>
    <ul class="hd-help__modes">
      <li><b>😶‍🌫️ Emoji</b> — lik v 5 emojijih. Viden je prvi, vsak napačen poskus razkrije naslednjega.</li>
      <li><b>🎨 Kostum</b> — barve kostuma. Po 3 napačnih izveš prevladujočo barvo, po 5 še simbol.</li>
      <li><b>🗂️ Dosje</b> — 6 tajnih namigov od splošnega do konkretnega. Po 6 napačnih se dosje zapre.</li>
    </ul>
    <p>Reši vse štiri isti dan za <b>🏆 popolni dan</b>. V <b>📅 arhivu</b> lahko odigraš zamujene dni zadnjega meseca (za XP in naloge, ne za niz).</p>
    <p class="mg-small mg-muted">Neuradna fan igra, ni povezana z Marvel ali DC.</p></div>`;
}
const openHelp = () => ui.modal({ title: 'Kako se igra', wide: true, html: helpHtml(), actions: [{ label: 'Gremo!', value: true, kind: 'primary' }] });

/* ------------------------------------------------------------------ */

function watchMidnight() {
  if (daily.isSimulated()) return;
  setInterval(async () => {
    if (hub.dailySeed() === date) return;
    ui.toast('Nov dan, nov junak!', { icon: '🦸', duration: 4000 });
    await ui.modal({ title: 'Nov dan, nov junak', html: '<p>Polnoč je mimo — pripravljen je nov skriti lik.</p>', actions: [{ label: 'Osveži', value: true, kind: 'primary' }], dismissible: false });
    location.reload();
  }, 20000);
}

/** Kartice »Dosje razkrit« dobijo paleto in dejstva (hints.js se naloži šele takrat). */
function watchCards() {
  const run = () => { if (document.querySelector('[data-more]:not([data-done])')) enrichCards(document); };
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  run();
}

async function main() {
  await hub.init({ gameId: GAME, scoreOrder: 'asc' });
  ui.header({ title: 'Herodle' });
  daily.init(hub, HEROES);
  store.setScope(`${hub.mode === 'supabase' ? 'sb' : 'off'}-${hub.userId || 'anon'}`);
  date = daily.today();
  if (daily.isSimulated()) $('#simBanner').innerHTML = `<div class="hd-sim">🧪 Simuliran datum: <b>${esc(date)}</b> (offline, ?date=)</div>`;
  applySettings();
  $('#btnArchive').addEventListener('click', openArchive);
  $('#btnStats').addEventListener('click', () => openStats());
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnHelp').addEventListener('click', openHelp);
  $('#btnSound').addEventListener('click', () => { sound.setMuted(!sound.isMuted()); applySettings(); sound.unlockAudio(); sound.tick('g'); });
  $('#sideLegend').innerHTML = legendHtml();
  const unlockA = () => sound.unlockAudio();
  window.addEventListener('pointerdown', unlockA, { once: true });
  window.addEventListener('keydown', unlockA, { once: true });
  watchCards();
  const want = new URLSearchParams(location.search).get('nacin');
  mountMode(MODES.find(m => m.id === want) || MODES[0]);
  watchMidnight();
  if (!store.getSettings().seenHelp) {
    store.setSettings({ seenHelp: true });
    await openHelp();
  }
}

main().catch(e => {
  console.error(e);
  ui.toast('Herodle se ni naložil: ' + (e.message || e), { icon: '⚠️', duration: 6000 });
});
