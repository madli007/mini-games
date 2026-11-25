/* =====================================================================
   SMUČARSKI SKOKI — cup.js: svetovni pokal (asinhrona sezona v Supabase
   ali offline v localStorage). Zaslon pokala (koledar postaj, skupna
   razvrstitev z rumeno majico, turneja, dvorana slavnih, povzetek postaje),
   uradni skoki 1. in 2. serije, trening postaje z ghosti, replay vsakega
   pokalnega skoka in nagrade (XP, dosežki, naloge, hub.reportGame).

   Koledar: games/skoki/cup-config.js → shared/sport/season.js (isti povsod).
   Podatki: hub.cupSubmit / hub.cupStandings / hub.cupJump (shared/hub.js).
   Razvojno: ?date=2026-12-03 ali ?date=2026-12-03T18:30 (simuliran datum, samo offline), ?pokal=1 (takoj zaslon pokala).
   ===================================================================== */
import { hub, ui } from '../../shared/hub.js';
import * as S from '../../shared/storage.js';
import * as SE from '../../shared/sport/season.js';
import { createReceiver } from '../../shared/sport/live-replay.js';
import { hashStr } from '../../shared/sport/competition.js';
import { cupCalendar, TOUR_NAME, FLYING, venueName } from './cup-config.js';
import { CONDITIONS, windGate } from './contest.js';
import { encodeGhost, decodeGhost } from './ghost.js';
import { fmtDist } from './scoring.js';
import { skinFromEquipped, flagEmoji, YELLOW } from './gear.js';
import { flagOf } from './jumpers.js';

const $ = s => document.querySelector(s);
const esc = ui.esc;
const URLP = new URLSearchParams(location.search);
const COUNTRY_FLAG = { SLO: 'si', AUT: 'at', GER: 'de', POL: 'pl', FIN: 'fi', SUI: 'ch', NOR: 'no', ITA: 'it', CZE: 'cz', JPN: 'jp' };

let E = null;                 // motor skoka (game.js)
const cache = new Map();      // season → { rows, at }
let view = { season: null, ev: null };
let timer = 0;

/* ------------------------------------------------------------ čas (simulacija ?date= samo offline) */

/** Trenutni čas za koledar: ?date=YYYY-MM-DD[THH:MM] (ob 12:00 po Ljubljani, če ure ni) samo v offline načinu. */
export function now() {
  const d = URLP.get('date');
  if (!hub.offline || !d) return Date.now();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(d);
  if (!m) return Date.now();
  const base = SE.ljMidnight(+m[1], +m[2] - 1, +m[3]);
  const h = m[4] != null ? +m[4] + +m[5] / 60 : 12;
  // simulirani čas teče naprej od odprtja strani (da se odštevanja premikajo)
  return base + h * 3600e3 + (performance.now() - T0);
}
const T0 = typeof performance !== 'undefined' ? performance.now() : 0;
const curSeason = () => SE.seasonOf(now());

/* ------------------------------------------------------------ pomožne */

const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString('sl-SI', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt1(Math.abs(v));
const defOf = id => E.hillOf(id)?.def;
const condOf = id => CONDITIONS.find(c => c.id === id) || null;
const dayFmt = ms => { const p = SE.ljParts(ms); return `${p.d}. ${p.m + 1}.`; };
function span(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, sec = s % 60;
  if (d > 0) return `${d} ${d === 1 ? 'dan' : d === 2 ? 'dneva' : 'dni'} ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return `${m} min ${String(sec).padStart(2, '0')} s`;
}
const usedKey = (season, idx, round) => `skoki:cup:used:${hub.userId || 'anon'}:${season}:${idx}:${round}`;
const awardKey = k => `skoki:cup:aw:${hub.userId || 'anon'}:${k}`;
const evName = (ev, def = defOf(ev.venue)) => `Postaja ${ev.idx}: ${venueName(def)}`;
const evFlag = def => (def?.real ? flagOf(COUNTRY_FLAG[def.real.country]) + ' ' : '');

/** Pogoji skoka postaje: skakalnica, zalet (žirija po vetru), veter serije, pogoj (tema, mods). */
export function eventSetup(ev, round = 1) {
  const H = E.hillOf(ev.venue);
  const def = H.def;
  const cond = condOf(ev.cond);
  const refGate = def.gates.default;
  const gate = Math.max(1, Math.min(def.gates.count, windGate(def, refGate, ev.wind.mean) + (cond?.mods.gateDelta || 0)));
  const wind = { mode: 'const', seed: (ev.wind.seed + round * 7919) >>> 0, speed: ev.wind.mean };
  const mods = cond ? { inrunMu: cond.mods.inrunMu || 0, gust: cond.mods.gust || 0 } : null;
  return { H, def, cond, gate, refGate, wind, mods, theme: E.condTheme(H, cond), teleOnly: !!cond?.mods.teleOnly };
}

/** Zapisi sezone (predpomnilnik 20 s; force = znova). */
async function load(season, force = false) {
  const c = cache.get(season);
  if (c && !force && Date.now() - c.at < 20000) return c.rows;
  const rows = await hub.cupStandings({ season });
  cache.set(season, { rows, at: Date.now() });
  return rows;
}
const people = rows => { const m = new Map(); for (const r of rows) if (!m.has(r.user_id)) m.set(r.user_id, { id: r.user_id, nickname: r.nickname, avatar: r.avatar, equipped: r.equipped }); return m; };
const mine = (rows, idx, round) => rows.find(r => r.user_id === hub.userId && r.event === idx && r.round === round) || null;

/** Moj status na postaji: kaj lahko naredim zdaj. */
function myStatus(rows, ev, t = now()) {
  const st = SE.eventState(ev, t);
  const j1 = mine(rows, ev.idx, 1), j2 = mine(rows, ev.idx, 2);
  const used1 = !j1 && S.load(usedKey(ev.season, ev.idx, 1), false);
  const used2 = !j2 && S.load(usedKey(ev.season, ev.idx, 2), false);
  const r1all = rows.filter(r => r.event === ev.idx && r.round === 1).map(r => +r.points);
  const inCut = !!j1 && SE.makesCut(+j1.points, r1all);
  let can = null;
  if (st === 'open' || st === 'r2') { if (!j1 && !used1) can = 1; else if (st === 'r2' && j1 && inCut && !j2 && !used2) can = 2; }
  return { st, j1, j2, used1, used2, inCut, can };
}

/** Vodilni (rumena majica) trenutne sezone → engine.cupLeaders. */
async function refreshLeaders() {
  try {
    const season = curSeason();
    if (season < SE.FIRST_SEASON) return;
    const rows = await load(season);
    const L = SE.leaders(rows, cupCalendar(season));
    E.cupLeaders.clear(); L.forEach(id => E.cupLeaders.add(id));
    E.refreshWho?.();
  } catch (e) { console.warn('pokal:', e); }
}

/* ------------------------------------------------------------ obvestilo v meniju */

/** Obvestilo za meni (odprta postaja, na kateri še nisem skočil) ali null. */
async function notice() {
  const season = curSeason();
  if (season < SE.FIRST_SEASON) return { html: `🌍 <b>Svetovni pokal</b> se začne 1. decembra — vsak mesec nova sezona z ~10 postajami. <button class="mg-btn mg-btn--small mg-btn--cyan" data-cup>Poglej →</button>` };
  const cal = cupCalendar(season);
  const ev = SE.currentEvent(cal, now());
  if (!ev) return null;
  const rows = await load(season);
  const ms = myStatus(rows, ev);
  const def = defOf(ev.venue);
  if (!def) return null;
  if (ms.can === 1) return { html: `🌍 <b>${esc(evName(ev, def))}</b> je odprta — še nisi skočil 1. serije (do ${dayFmt(ev.closes - 1)}). <button class="mg-btn mg-btn--small mg-btn--cyan" data-cup>Skoči →</button>` };
  if (ms.can === 2) return { html: `🌍 <b>${esc(evName(ev, def))}</b>: 2. serija je odprta — uvrstil si se! <button class="mg-btn mg-btn--small mg-btn--pink" data-cup>Skoči →</button>` };
  return null;
}

/* ------------------------------------------------------------ zaslon pokala */

async function open(season = view.season || curSeason(), evIdx = null) {
  clearInterval(timer);
  E.leavePlay?.();
  view.season = season;
  const el = $('#menu');
  el.innerHTML = '<div class="mg-empty"><span class="mg-spin"></span></div>';
  window.scrollTo(0, 0);
  if (season < SE.FIRST_SEASON) return renderBefore();
  const cal = cupCalendar(season);
  let rows = [];
  try { rows = await load(season, true); } catch (e) { console.warn(e); }
  if (view.season !== season) return;
  const t = now();
  const cur = SE.currentEvent(cal, t);
  view.ev = evIdx || (season === curSeason() && cur ? cur.idx : cal.events.filter(e => rows.some(r => r.event === e.idx)).at(-1)?.idx || 1);
  render(cal, rows);
  awards(cal, rows).catch(e => console.warn(e));
  timer = setInterval(() => { if (!document.contains($('#cupTick'))) { clearInterval(timer); return; } tick(cal); }, 1000);
}

/** Pred prvo sezono: odštevanje do 1. decembra. */
function renderBefore() {
  const p = SE.parseSeason(SE.FIRST_SEASON);
  const start = SE.ljMidnight(p.y, p.m, 1);
  $('#menu').innerHTML = `<div class="mg-stack sk-cup">
    <div class="sk-hero"><div class="sk-hero__icon" aria-hidden="true">🌍</div>
      <div><h1 class="mg-title">Svetovni pokal</h1><p class="mg-muted">Vsak mesec nova sezona: ~10 postaj na pravih skakalnicah, vsaka odprta 2–3 dni. Skočiš, ko imaš čas.</p></div></div>
    <div class="mg-card sk-cup__empty"><span class="sk-cup__big">❄️</span><h2 class="mg-title">Sezona se začne 1. decembra</h2>
      <p class="mg-muted">Do začetka še <b id="cupTick" data-to="${start}">${span(start - now())}</b>.</p>
      <p class="sk-note">Do takrat: trening na pravih skakalnicah, kariera in tekme s prijatelji.</p></div>
    <button class="mg-btn mg-btn--ghost" id="cupBack">← Meni</button></div>`;
  $('#cupBack').onclick = () => E.showMenu();
  timer = setInterval(() => { const x = $('#cupTick'); if (!x) { clearInterval(timer); return; } const ms = +x.dataset.to - now(); x.textContent = span(ms); if (ms <= 0) { clearInterval(timer); open(); } }, 1000);
}

function render(cal, rows) {
  const t = now();
  const season = cal.season, live = season === curSeason();
  const ppl = people(rows);
  const st = SE.seasonStandings(rows, cal);
  const moves = SE.seasonMoves(rows, cal);
  const leaders = new Set(st.filter(x => x.rank === 1 && x.cup > 0).map(x => x.user_id));
  const done = SE.seasonDone(cal, t);
  const who = id => { const p = ppl.get(id); return p ? ui.who(p) + (flagEmoji(p.equipped) ? ' ' + flagEmoji(p.equipped) : '') + (leaders.has(id) && !done ? ' ' + YELLOW : '') : '???'; };
  const ev = cal.events.find(e => e.idx === view.ev) || cal.events[0];
  const tour = cal.events.some(e => e.tour) ? SE.tourStandings(rows, cal) : [];
  const card = e => {
    const def = defOf(e.venue);
    const s = SE.eventState(e, t);
    const my = SE.eventStandings(rows, e.idx).find(x => x.user_id === hub.userId);
    const chip = { soon: ['prihaja', ''], open: ['odprto', 'open'], r2: ['2. serija', 'r2'], done: ['končano', 'done'] }[s];
    return `<button class="sk-cupcard ${chip[1]} ${e.idx === ev.idx ? 'sel' : ''} ${e.final ? 'final' : ''} ${e.tour ? 'tour' : ''}" data-ev="${e.idx}" aria-pressed="${e.idx === ev.idx}">
      <span class="no">${e.idx}</span>
      <span class="nm">${evFlag(def)}<b>${esc(venueName(def))}</b>${e.final ? ' <i>finale</i>' : e.tour ? ' <i>turneja</i>' : ''}</span>
      <span class="kh">K${def?.k} · HS${def?.hs}${FLYING.has(e.venue) ? ' · letalnica' : ''}</span>
      <span class="dt">${dayFmt(e.opens)}–${dayFmt(e.closes - 1)}</span>
      <span class="chip">${chip[0]}</span>
      <span class="me">${my ? my.rank + '. mesto · ' + my.cupPoints + ' t' : ''}</span></button>`;
  };
  const champ = done ? st.find(x => x.rank === 1) : null;
  const titles = done ? SE.seasonTitles(rows, cal, { flying: e => FLYING.has(e.venue) }) : [];
  const tw = tour.find(x => x.rank === 1);
  $('#menu').innerHTML = `<div class="mg-stack sk-cup">
    <div class="sk-cup__head">
      <div class="sk-hero"><div class="sk-hero__icon" aria-hidden="true">🌍</div>
        <div><span class="sk-cup__lbl">Svetovni pokal</span><h1 class="mg-title">${esc(cal.name)}</h1>
          <p class="mg-muted mg-small">${cal.events.length} postaj · 1. serija ves čas postaje, 2. serija zadnji dan (najboljših 30) · točke 100-80-60 … · <span id="cupTick">${live ? (done ? 'sezona je končana' : '') : (done ? 'pretekla sezona' : '')}</span></p></div></div>
      <div class="sk-cup__nav">
        <button class="mg-btn mg-btn--small mg-btn--ghost" data-season="${SE.shiftSeason(season, -1)}" ${SE.shiftSeason(season, -1) < SE.FIRST_SEASON ? 'disabled' : ''}>◀</button>
        <button class="mg-btn mg-btn--small mg-btn--ghost" data-season="${curSeason()}" ${live ? 'disabled' : ''}>Ta mesec</button>
        <button class="mg-btn mg-btn--small mg-btn--ghost" data-season="${SE.shiftSeason(season, 1)}" ${SE.shiftSeason(season, 1) > curSeason() ? 'disabled' : ''}>▶</button>
        <button class="mg-btn mg-btn--small mg-btn--ghost" id="cupBack">← Meni</button></div>
    </div>
    ${champ ? `<div class="sk-cup__champ"><span class="sk-cup__big">👑</span><div><span class="mg-muted mg-small">Zmagovalec sezone</span><div class="w">${who(champ.user_id)}</div>
      <span class="mg-small">${champ.cup} točk · ${champ.wins} ${champ.wins === 1 ? 'zmaga' : champ.wins === 2 ? 'zmagi' : 'zmag'}${titles.map(x => ` · ${x.key === 'kralj' ? '🛫 Kralj letalnic' : '🎯 Najbolj stanoviten'}: ${ppl.get(x.user_id)?.nickname ? esc(ppl.get(x.user_id).nickname) : '???'}`).join('')}${tw ? ` · 🎄 ${esc(TOUR_NAME)}: ${esc(ppl.get(tw.user_id)?.nickname || '???')}` : ''}</span></div></div>` : ''}
    <div class="sk-cup__grid">
      <div class="mg-stack">
        <section class="mg-card sk-cup__event" id="cupEvent"></section>
        <section class="mg-card"><h2 class="mg-title">Koledar</h2><div class="sk-cupcards">${cal.events.map(card).join('')}</div></section>
      </div>
      <div class="mg-stack">
        <section class="mg-card"><h2 class="mg-title">Skupna razvrstitev</h2>
          ${st.length ? `<table class="mg-table sk-cuptable"><thead><tr><th>#</th><th>Skakalec</th><th class="mg-num">Zmage</th><th class="mg-num">Točke</th></tr></thead><tbody>
            ${st.map(x => { const mv = moves[x.user_id] || 0; return `<tr class="${x.user_id === hub.userId ? 'mg-me' : ''} ${x.rank === 1 ? 'lead' : ''}"><td class="mg-rank">${x.rank}. <span class="mv ${mv > 0 ? 'up' : mv < 0 ? 'dn' : ''}">${mv > 0 ? '↑' + mv : mv < 0 ? '↓' + -mv : ''}</span></td><td>${who(x.user_id)}</td><td class="mg-num">${x.wins}</td><td class="mg-num"><b>${x.cup}</b></td></tr>`; }).join('')}</tbody></table>`
            : '<div class="mg-empty">Še nihče ni skočil. Bodi prvi na prvi postaji!</div>'}
          <p class="sk-note">🟡 Rumena majica = vodilni v sezoni (oznaka tudi v tekmah in treningu). Ob izenačenju odloči več zmag, nato več drugih mest.</p></section>
        ${cal.events.some(e => e.tour) ? `<section class="mg-card"><h2 class="mg-title">🎄 ${esc(TOUR_NAME)}</h2>
          ${tour.length ? `<table class="mg-table"><thead><tr><th>#</th><th>Skakalec</th><th class="mg-num">Postaje</th><th class="mg-num">Točke skokov</th></tr></thead><tbody>
            ${tour.map(x => `<tr class="${x.user_id === hub.userId ? 'mg-me' : ''}"><td class="mg-rank">${x.rank ? x.rank + '.' : '—'}</td><td>${who(x.user_id)}</td><td class="mg-num">${4 - x.missed}/4</td><td class="mg-num">${fmt1(x.total)}</td></tr>`).join('')}</tbody></table>`
            : '<div class="mg-empty">Turneja: Oberstdorf → Garmisch → Innsbruck → Bischofshofen.</div>'}
          <p class="sk-note">Seštevek točk skokov vseh štirih postaj; kdor zamudi postajo, izpade iz skupne razvrstitve. KO pari v 1. seriji so v pokalu izklopljeni (manj kot 50 skakalcev) — na voljo so v Lokalni tekmi (format Turneja).</p></section>` : ''}
        <section class="mg-card"><h2 class="mg-title">🏛️ Dvorana slavnih</h2><div id="cupHall"><span class="mg-spin"></span></div></section>
      </div>
    </div></div>`;
  $('#cupBack').onclick = () => { clearInterval(timer); E.showMenu(); };
  $('#menu').querySelectorAll('[data-season]').forEach(b => b.onclick = () => { view.ev = null; open(b.dataset.season); });
  $('#menu').querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { view.ev = +b.dataset.ev; render(cal, rows); $('#cupEvent')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  renderEvent(cal, rows, ev, { who, ppl });
  hall().catch(e => console.warn(e));
}

/** Podrobnosti izbrane postaje: pogoji, gumbi, rezultati, povzetek v slogu prenosa. */
function renderEvent(cal, rows, ev, { who, ppl }) {
  const el = $('#cupEvent'); if (!el) return;
  const t = now();
  const { def, cond, gate, refGate, wind } = eventSetup(ev, 1);
  const ms = myStatus(rows, ev, t);
  const res = SE.eventStandings(rows, ev.idx);
  const r1 = rows.filter(r => r.event === ev.idx && r.round === 1);
  const stLabel = { soon: 'prihaja', open: '1. serija odprta', r2: '2. serija odprta (zadnji dan)', done: 'končano' }[ms.st];
  const cnt = ms.st === 'soon' ? `Postaja se odpre čez <b data-to="${ev.opens}">${span(ev.opens - t)}</b>.`
    : ms.st === 'open' ? `2. serija se odpre čez <b data-to="${ev.r2}">${span(ev.r2 - t)}</b> · postaja se zapre čez <b data-to="${ev.closes}">${span(ev.closes - t)}</b>.`
      : ms.st === 'r2' ? `Postaja se zapre čez <b data-to="${ev.closes}">${span(ev.closes - t)}</b>.` : `Končano ${dayFmt(ev.closes - 1)}`;
  let action = '';
  if (ms.can === 1) action = `<button class="mg-btn mg-btn--pink mg-btn--big" data-jump="1">🏆 Skoči 1. serijo</button>`;
  else if (ms.can === 2) action = `<button class="mg-btn mg-btn--pink mg-btn--big" data-jump="2">🏆 Skoči 2. serijo</button>`;
  const myLine = ms.j1 ? `Tvoja 1. serija: <b>${fmt1(+ms.j1.points)} t</b> (${fmtDist(+ms.j1.dist)})${ms.j2 ? ` · 2. serija: <b>${fmt1(+ms.j2.points)} t</b> (${fmtDist(+ms.j2.dist)})` : ms.inCut ? (ms.st === 'open' ? ' · uvrščen v 2. serijo (odpre se zadnji dan)' : ms.st === 'r2' ? '' : ' · 2. serije nisi skočil') : ' · ni uvrstitve v 2. serijo'}`
    : ms.used1 ? 'Poskus 1. serije je bil porabljen (skok prekinjen).' : ms.st === 'done' ? 'Na tej postaji nisi skočil (DNS).' : '';
  const podium = ms.st === 'done' && res.length ? res.filter(x => x.rank <= 3).slice(0, 3) : [];
  const longest = r1.concat(rows.filter(r => r.event === ev.idx && r.round === 2)).sort((a, b) => b.dist - a.dist)[0];
  const winner = res.find(x => x.rank === 1);
  el.innerHTML = `
    <div class="sk-cupev__head">
      <div><span class="sk-cup__lbl">${ev.final ? '🏁 Finale' : ev.tour ? '🎄 ' + esc(TOUR_NAME) : 'Postaja'} · ${dayFmt(ev.opens)}–${dayFmt(ev.closes - 1)}</span>
        <h2 class="mg-title">${evFlag(def)}${esc(evName(ev, def))}</h2>
        <span class="mg-small">${esc(def.name)} · K${def.k} / HS${def.hs}</span></div>
      <span class="sk-cupev__state ${ms.st}">${stLabel}</span></div>
    <div class="sk-daily sk-cupev__cond">
      <div><span class="mg-muted mg-small">Pogoj</span><b>${cond ? cond.icon + ' ' + esc(cond.name) : '☀️ Brez posebnosti'}</b></div>
      <div><span class="mg-muted mg-small">Veter</span><b>${sign(wind.speed)} m/s</b><span class="mg-small">${wind.speed > 0 ? 'čelni' : wind.speed < 0 ? 'hrbtni' : 'brez'}${cond?.mods.gust ? ', močni sunki' : ''}</span></div>
      <div><span class="mg-muted mg-small">Zaletno mesto</span><b>${gate}</b><span class="mg-small">ref. ${refGate}</span></div>
      <div><span class="mg-muted mg-small">Skakalcev</span><b>${r1.length}</b><span class="mg-small">v 2. serijo najboljših 30</span></div>
    </div>
    <p class="sk-note">${cnt}${myLine ? '<br>' + myLine : ''}</p>
    <div class="sk-cupev__btns">${action}
      ${ms.st !== 'done' && ms.st !== 'soon' ? `<button class="mg-btn mg-btn--primary" data-train>▶ Trening (ne šteje)</button>` : ''}
      ${ms.st === 'done' && winner ? `<button class="mg-btn mg-btn--cyan" data-winrep>🎬 Replay zmagovalnega skoka</button>` : ''}</div>
    ${podium.length ? `<div class="sk-cupev__tv"><div class="sk-podium__cols">${[podium[1], podium[0], podium[2]].map((x, i) => x ? `<div class="sk-podium__col p${[2, 1, 3][i]}"><div class="who">${who(x.user_id)}</div><div class="pts">${fmt1(x.total)} t</div><div class="blk">${x.rank}</div></div>` : '<div></div>').join('')}</div>
      ${longest ? `<p class="sk-note">📏 Najdaljši skok: <b>${fmtDist(+longest.dist)}</b> · ${who(longest.user_id)}</p>` : ''}</div>` : ''}
    <h3 class="mg-title">Rezultati${ms.st !== 'done' ? ' (vmesni)' : ''}</h3>
    ${res.length ? `<div class="sk-cupres"><table class="mg-table"><thead><tr><th>#</th><th>Skakalec</th><th class="mg-num">1. serija</th><th class="mg-num">2. serija</th><th class="mg-num">Skupaj</th><th class="mg-num">Pokal</th></tr></thead><tbody>
      ${res.map(x => `<tr class="${x.user_id === hub.userId ? 'mg-me' : ''} ${x.inCut ? '' : 'cut'}"><td class="mg-rank">${x.rank}.</td><td>${who(x.user_id)}</td>
        <td class="mg-num"><button class="sk-rbtn" data-rep="${esc(x.user_id)}|1" title="Replay">${fmt1(x.r1)} <small>▶</small></button>${ms.st !== 'done' ? ` <button class="sk-rbtn" data-gh="${esc(x.user_id)}" title="Ghost za trening">👻</button>` : ''}</td>
        <td class="mg-num">${x.r2 != null ? `<button class="sk-rbtn" data-rep="${esc(x.user_id)}|2" title="Replay">${fmt1(x.r2)} <small>▶</small></button>` : '<span class="mg-muted">—</span>'}</td>
        <td class="mg-num"><b>${fmt1(x.total)}</b></td><td class="mg-num">${x.cupPoints}</td></tr>`).join('')}</tbody></table></div>
      <p class="sk-note">Klik na točke serije = replay skoka. 👻 = ghost za trening te postaje. Sivo: ni v 2. seriji.</p>`
      : `<div class="mg-empty">${ms.st === 'soon' ? 'Postaja se še ni odprla.' : 'Na tej postaji še nihče ni skočil.'}</div>`}`;
  el.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => official(cal, ev, +b.dataset.jump));
  el.querySelector('[data-train]')?.addEventListener('click', () => train(cal, ev));
  el.querySelector('[data-winrep]')?.addEventListener('click', () => replay(cal, ev, winner.user_id, winner.r2 != null ? 2 : 1, ppl));
  el.querySelectorAll('[data-rep]').forEach(b => b.onclick = () => { const [u, r] = b.dataset.rep.split('|'); replay(cal, ev, u, +r, ppl); });
  el.querySelectorAll('[data-gh]').forEach(b => b.onclick = () => toggleGhost(ev, b.dataset.gh, ppl, b));
  const gs = ghosts.get(ev.season + ':' + ev.idx) || [];
  el.querySelectorAll('[data-gh]').forEach(b => b.classList.toggle('on', gs.some(g => g.userId === b.dataset.gh)));
}

/** Odštevanja na zaslonu (vsako sekundo); ob prehodu stanja znova izriše. */
function tick(cal) {
  const t = now();
  document.querySelectorAll('#menu [data-to]').forEach(x => { x.textContent = span(+x.dataset.to - t); });
  const key = cal.events.map(e => SE.eventState(e, t)).join(',');
  if (tick.key && tick.key !== key) { tick.key = key; open(cal.season, view.ev); return; }
  tick.key = key;
}

/** Dvorana slavnih: zmagovalci preteklih sezon (do 12). */
async function hall() {
  const el = $('#cupHall'); if (!el) return;
  const list = [];
  for (let s = SE.shiftSeason(curSeason(), -1), k = 0; s >= SE.FIRST_SEASON && k < 12; s = SE.shiftSeason(s, -1), k++) {
    const rows = await load(s).catch(() => []);
    const cal = cupCalendar(s);
    const w = SE.seasonStandings(rows, cal).filter(x => x.rank === 1);
    if (w.length) list.push({ s, name: cal.name, w, ppl: people(rows) });
  }
  if (!$('#cupHall')) return;
  el.innerHTML = list.length ? `<ul class="sk-hall">${list.map(x => `<li><span class="mg-muted mg-small">${esc(x.name)}</span> ${x.w.map(w => '👑 ' + (x.ppl.get(w.user_id) ? ui.who(x.ppl.get(w.user_id)) : '???') + ` <small>${w.cup} t</small>`).join(' ')}</li>`).join('')}</ul>`
    : '<div class="mg-empty">Prvi zmagovalec sezone bo vpisan po koncu prve sezone.</div>';
}

/* ------------------------------------------------------------ skoki */

/** Uradni skok serije (en poskus, porabi se ob štartu). */
async function official(cal, ev, round) {
  const rows = await load(ev.season, true);
  const ms = myStatus(rows, ev);
  if (ms.can !== round) { ui.toast('Ta serija zdaj ni na voljo.', { icon: '⏳' }); return open(ev.season, ev.idx); }
  const ok = await ui.confirm(`${evName(ev)} · ${round}. serija: imaš en skok. Poskus se porabi ob štartu (zelena luč in klik). Pred tem lahko neomejeno treniraš.`, { title: 'Pokalni skok', yes: 'Na zaletno mesto' });
  if (!ok) return;
  const X = eventSetup(ev, round);
  const judgeSeed = hashStr(`${hub.userId}:${ev.season}:${ev.idx}:${round}`);
  let started = false;
  const r = await E.jump({
    hillId: ev.venue, gate: X.gate, refGate: X.refGate, wind: X.wind, mods: X.mods, theme: X.theme, teleOnly: X.teleOnly, judgeSeed,
    source: 'me', mine: true, skin: E.mySkin(), label: `${evName(ev, X.def)} · ${round}. serija`, whoHtml: E.myWho(), holdMs: 1500,
    onStart: () => { if (!started) { started = true; S.save(usedKey(ev.season, ev.idx, round), true); } },
  });
  if (r.status !== 'ok') { if (started) ui.toast('Skok je bil prekinjen — poskus je porabljen.', { icon: '⚠️' }); return open(ev.season, ev.idx); }
  const res = r.res;
  const inputs = encodeGhost({ pv: E.P.paramsVersion, hill: ev.venue, gate: X.gate, wind: X.wind, changes: r.changes, ticks: res.ticks, dist: res.dist, total: res.total });
  try {
    await hub.cupSubmit({ season: ev.season, event: ev.idx, round, points: res.total, dist: res.dist, inputs, paramsVersion: E.P.paramsVersion, window: { opens: ev.opens, r2: ev.r2, closes: ev.closes }, now: now(), maxPoints: 999 });
  } catch (e) {
    console.warn(e);
    ui.toast('Skoka ni bilo mogoče shraniti: ' + (e.message || e.code), { icon: '⚠️', duration: 5000 });
    return open(ev.season, ev.idx);
  }
  // hub: XP (20 za pokalni skok, največ 2 na postajo), dosežki, naloge (skoki:pokal enkrat na postajo)
  hub.awardXp(20, 'skoki: pokalni skok');
  E.unlock('pokal-prvi');
  const fresh = await load(ev.season, true);
  if (round === 1) hub.reportEvent('skoki:pokal', 1);
  const after = myStatus(fresh, ev);
  if (round === 2 || !after.inCut) hub.reportGame({ won: false, players: 1, score: Math.round(res.total), daily: false });
  const my = SE.eventStandings(fresh, ev.idx).find(x => x.user_id === hub.userId);
  ui.toast(`${round}. serija: ${fmtDist(res.dist)} · ${fmt1(res.total)} t${my ? ` · trenutno ${my.rank}. mesto` : ''}`, { icon: '🏆', duration: 4500 });
  await refreshLeaders();
  open(ev.season, ev.idx);
}

/** Trening na skakalnici postaje (isti veter in pogoj 1. serije, ne šteje). */
const ghosts = new Map();   // 'sezona:idx' → [{ g, name, skin, userId }]
async function toggleGhost(ev, userId, ppl, btn) {
  const key = ev.season + ':' + ev.idx;
  const list = ghosts.get(key) || [];
  const i = list.findIndex(g => g.userId === userId);
  if (i >= 0) { list.splice(i, 1); ghosts.set(key, list); btn.classList.remove('on'); ui.toast('Ghost odstranjen.', { icon: '👻' }); return; }
  const j = await hub.cupJump({ season: ev.season, event: ev.idx, round: 1, userId });
  if (!j?.inputs) { ui.toast('Posnetka ni.', { icon: '👻' }); return; }
  try {
    const g = decodeGhost(j.inputs);
    if (g.pv !== E.P.paramsVersion) { ui.toast('Posnetek je iz starejše verzije fizike.', { icon: '⚠️' }); return; }
    const p = ppl.get(userId);
    list.push({ g, name: p?.nickname || '???', skin: skinFromEquipped(p?.equipped), userId });
    ghosts.set(key, list.slice(-3));
    btn.classList.add('on');
    ui.toast(`Ghost za trening: ${p?.nickname || '???'} (${fmtDist(g.dist)})`, { icon: '👻' });
  } catch (e) { console.warn(e); ui.toast('Posnetka ni bilo mogoče prebrati.'); }
}
function train(cal, ev) {
  const X = eventSetup(ev, 1);
  E.train(ev.venue, {
    gate: X.gate, refGate: X.refGate, wind: X.wind, mods: X.mods, theme: X.theme,
    label: `Trening · ${evName(ev, X.def)}`, ghosts: ghosts.get(ev.season + ':' + ev.idx) || [], back: () => open(ev.season, ev.idx),
  });
}

/** Replay pokalnega skoka (kogarkoli) z opremo tega igralca. */
async function replay(cal, ev, userId, round, ppl) {
  const j = await hub.cupJump({ season: ev.season, event: ev.idx, round, userId });
  if (!j?.inputs) { ui.toast('Posnetka ni.', { icon: '🎬' }); return; }
  let g;
  try { g = decodeGhost(j.inputs); } catch { ui.toast('Posnetka ni bilo mogoče prebrati.'); return; }
  if (g.pv !== E.P.paramsVersion) { ui.toast('Posnetek je iz starejše verzije fizike.', { icon: '⚠️' }); return; }
  const X = eventSetup(ev, round);
  const p = ppl.get(userId);
  const rcv = createReceiver({ jumpId: 'cup', delayMs: 0 });
  rcv.accept({ j: 'cup', f: 0, t: g.ticks + 2, c: g.changes, e: 1 });
  clearInterval(timer);
  await E.jump({
    hillId: ev.venue, gate: g.gate, refGate: X.refGate, wind: g.wind, mods: X.mods, theme: X.theme, teleOnly: X.teleOnly, judgeSeed: hashStr(`${userId}:${ev.season}:${ev.idx}:${round}`),
    source: 'stream', stream: rcv, skin: skinFromEquipped(p?.equipped), label: `Replay · ${round}. serija`, whoHtml: p ? ui.who(p) : '???', holdMs: 2200,
  });
  open(ev.season, ev.idx);
}

/* ------------------------------------------------------------ nagrade po koncu postaje in sezone */

async function awards(cal, rows) {
  if (!hub.profile) return;
  const t = now();
  const give = (k, fn) => { if (S.load(awardKey(k), false)) return; S.save(awardKey(k), true); fn(); };
  for (const ev of cal.events) {
    if (SE.eventState(ev, t) !== 'done') continue;
    const me = SE.eventStandings(rows, ev.idx).find(x => x.user_id === hub.userId);
    if (me?.rank === 1) give(`${ev.season}:${ev.idx}:zmaga`, () => { hub.awardXp(100, 'skoki: zmaga na postaji'); E.unlock('pokal-zmaga'); });
  }
  const st = SE.seasonStandings(rows, cal);
  const meS = st.find(x => x.user_id === hub.userId);
  if (meS?.rank === 1 && meS.cup > 0) E.unlock('rumena');
  if (SE.seasonDone(cal, t)) {
    if (meS?.rank === 1) give(`${cal.season}:sezona`, () => { hub.awardXp(300, 'skoki: zmaga sezone'); E.unlock('sezona'); });
    if (cal.events.every(e => rows.some(r => r.user_id === hub.userId && r.event === e.idx && r.round === 1))) E.unlock('vsi-skoki');
    const tw = SE.tourStandings(rows, cal).find(x => x.user_id === hub.userId);
    if (tw?.rank === 1) E.unlock('turneja');
  }
}

/* ------------------------------------------------------------ vstop */

export function initCup(engine) {
  E = engine;
  refreshLeaders();
  return { open: (s, e) => open(s, e), notice, refreshLeaders };
}
