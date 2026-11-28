/* =====================================================================
   SMUČARSKI SKOKI — career-ui.js: kariera (solo proti 29 botom).
   Celinski pokal (Mini, mala, srednja) → Svetovni pokal → Poleti (letalnice).
   Vsaka kariera-sezona ima 6–8 tekem z dvema serijama; med najboljših 10
   v sezoni = višja liga. Rivali so stalni (izmišljena imena ali boti iz
   »Moji skakalci«), s spretnostjo, značajem in formo, ki niha.
   Brez nadgradenj fizike: napreduješ le z znanjem; kariera odklepa naslove
   (dosežki) in opremo (dosežki → trgovina).
   Logika: shared/sport/career.js; lige: cup-config.js. Tekma: match.js (runCompetition).
   Shranjevanje: shared/storage.js (skoki:career:<profil>) po vsaki tekmi + izvoz/uvoz kode;
   online prek cloud.js (slot »kariera« v game_saves) — sledi igralcu na vse naprave.
   Razvojno: ?kariera=1 (takoj zaslon kariere), ?bot=0.9 (namesto tebe skače bot).
   ===================================================================== */
import { hub, ui } from '../../shared/hub.js';
import * as S from '../../shared/storage.js';
import * as CA from '../../shared/sport/career.js';
import { LEAGUES, SPEC_TAGS, careerVenues } from './cup-config.js';
import { BOT_NAMES, flagOf } from './jumpers.js';
import { BOT_STYLES } from './bot.js';
import { fmtDist } from './scoring.js';
import { gearOf } from './gear.js';

const $ = s => document.querySelector(s);
const esc = ui.esc;
const URLP = new URLSearchParams(location.search);
const DEV_BOT = URLP.has('bot') ? Math.max(0, Math.min(1, parseFloat(URLP.get('bot')) || 0.9)) : null;
const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString('sl-SI', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const COLORS = ['#e63946', '#1d3557', '#f1c40f', '#2a9d8f', '#ff7a1a', '#7b2cbf', '#3a86ff', '#ff4fd8', '#222831', '#39ff88'];
const CHAR_NAME = { stabilen: 'stabilen', nestanoviten: 'nestanoviten', borec: 'borec', mojster: 'mojster' };
const TAG_NAME = { mini: 'mini', mala: 'male', srednja: 'srednje', velika: 'velike', letalnica: 'letalnice' };

let E = null;
const key = () => 'skoki:career:' + (hub.userId || 'anon');
const prefKey = 'skoki:career:replay';

function load() { return CA.restoreCareer(S.load(key(), null)); }
// rev: števec različic za konflikt dveh naprav (games/skoki/cloud.js, mergeCareer)
function save(st) { st.rev = ((S.load(key(), null)?.rev) | 0) + 1; S.save(key(), st); }

/** Vgrajeni rivali: izmišljena imena z zastavami in barvami dresov (deterministično). */
function builtinPool() {
  return BOT_NAMES.map(([name, flag], i) => ({ name, flag, suit: COLORS[(i * 3) % COLORS.length], helmet: COLORS[(i * 7 + 2) % COLORS.length] }));
}

/* ------------------------------------------------------------ novinarski napisi */

function headline(out, st, prevLeague) {
  const L = st.leagues[prevLeague ?? st.league];
  const me = hub.profile?.nickname || 'Skakalec';
  const nick = ['orel iz Brezove', 'letalec iz domače vasi', 'mojster telemarka', 'tihi lovec na točke'][st.stats.events % 4];
  const list = [];
  if (out.won && st.stats.wins === 1) list.push(`»Prva zmaga! ${me} je presenetil vse favorite.«`);
  else if (out.won) list.push(`»${me} spet na vrhu — mediji te že kličejo ›${nick}‹.«`);
  else if (out.podium) list.push(`»${out.place}. mesto: ${me} se vztrajno vzpenja proti vrhu.«`);
  else if (out.place && out.place <= 10) list.push(`»Solidnih ${out.place}. mesto — trener je zadovoljen.«`);
  else if (out.place) list.push(`»${out.place}. mesto. Na treningu bo treba zavihati rokave.«`);
  if (out.seasonEnd) {
    if (out.champion) list.push(`»Zmagovalec sezone v ligi ${L.name}! Šampanjec v izteku.«`);
    if (out.promoted) list.push(`»Napredovanje! ${me} od prihodnje sezone v ligi ${st.leagues[st.league].name}.«`);
    else if (!out.champion) list.push(`»Sezona končana na ${out.seasonPlace}. mestu.${out.seasonPlace > CA.PROMOTE_TOP ? ' Za napredovanje bo treba med najboljših 10.' : ''}«`);
  }
  return list;
}

/* ------------------------------------------------------------ zasloni */

function open() {
  E.leavePlay?.();
  window.scrollTo(0, 0);
  const st = load();
  if (!st) return renderStart();
  render(st);
}

function renderStart() {
  const mine = (E.match?.myJumpers?.() || []).filter(j => j.type === 'bot');
  $('#menu').innerHTML = `<div class="mg-stack sk-career">
    <div class="sk-hero"><div class="sk-hero__icon" aria-hidden="true">🎯</div>
      <div><h1 class="mg-title">Kariera</h1><p class="mg-muted">Začneš kot neznan skakalec na Mini in mali skakalnici v Celinskem pokalu. Med najboljših 10 v sezoni → višja liga: Celinski pokal → Svetovni pokal → Poleti (letalnice). Brez nakupa statistik — napreduješ samo z znanjem.</p></div></div>
    <div class="mg-grid mg-grid--2">
      <div class="mg-card mg-stack"><h2 class="mg-title">Rivali</h2>
        <label class="mg-check"><input type="radio" name="riv" value="builtin" checked> 29 vgrajenih rivalov (izmišljena imena, stalni vsako sezono)</label>
        <label class="mg-check"><input type="radio" name="riv" value="mine" ${mine.length ? '' : 'disabled'}> Boti iz »Moji skakalci« (${mine.length}), manjkajoče dopolnijo vgrajeni</label>
        <div class="sk-pick mg-hidden" id="cMine">${mine.map(j => `<label class="mg-check"><input type="checkbox" value="${esc(j.id)}" checked> ${flagOf(j.flag)} ${esc(j.name)} <span class="mg-badge">${Math.round(j.skill * 100)} %</span></label>`).join('')}</div>
        <p class="sk-note">Vsak rival ima svojo moč, značaj in formo, ki niha (nekateri so mojstri na letalnicah, drugi stabilni na srednjih). Moč tvojih botov se upošteva relativno znotraj lige.</p></div>
      <div class="mg-card mg-stack"><h2 class="mg-title">Kako poteka</h2>
        <ul class="sk-list"><li>6–8 tekem na sezono, dve seriji, 30 skakalcev.</li><li>Točke 100-80-60 … kot v svetovnem pokalu.</li>
          <li>Shrani se po vsaki tekmi (ne sredi tekme).</li><li>Nagrade: naslovi in oprema (dosežki), XP, kovanci.</li></ul>
        <button class="mg-btn mg-btn--ghost" id="cImport">📥 Uvozi kodo kariere</button></div>
    </div>
    <button class="mg-btn mg-btn--green mg-btn--big" id="cGo">🎯 Začni kariero</button>
    <button class="mg-btn mg-btn--ghost" id="cBack">← Meni</button></div>`;
  $('#cBack').onclick = () => E.showMenu();
  $('#menu').querySelectorAll('[name=riv]').forEach(r => r.onchange = () => $('#cMine').classList.toggle('mg-hidden', $('#menu').querySelector('[name=riv]:checked').value !== 'mine'));
  $('#cImport').onclick = importDialog;
  $('#cGo').onclick = () => {
    const src = $('#menu').querySelector('[name=riv]:checked').value;
    const seed = (hub.userId || 'anon').slice(0, 8) + ':' + Date.now().toString(36);
    let pool = builtinPool();
    if (src === 'mine') {
      const ids = [...$('#cMine').querySelectorAll('input:checked')].map(x => x.value);
      const pick = mine.filter(j => ids.includes(j.id)).slice(0, CA.FIELD - 1).map(j => ({ name: j.name, flag: j.flag, suit: j.suit, helmet: j.helmet, skill: j.skill, style: j.style }));
      const fill = CA.makeRivals(seed, builtinPool(), CA.FIELD - 1 - pick.length, { specTags: SPEC_TAGS, styles: Object.keys(BOT_STYLES) });
      const own = pick.map((p, i) => ({ id: 'm' + i, name: p.name, flag: p.flag, suit: p.suit, helmet: p.helmet, rel: Math.round(p.skill * 1000) / 1000, char: 'borec', spec: null, style: p.style || 'normal' }));
      return start(seed, [...own, ...fill.map((r, i) => ({ ...r, id: 'r' + i }))]);
    }
    start(seed, CA.makeRivals(seed, pool, CA.FIELD - 1, { specTags: SPEC_TAGS, styles: Object.keys(BOT_STYLES) }));
  };
}

function start(seed, rivals) {
  let st = CA.createCareer({ seed, leagues: LEAGUES, rivals });
  st = CA.startSeason(st, careerVenues(E.hills().map(h => h.def)));
  save(st);
  render(st);
}

function render(st, news = st.news || []) {
  const L = CA.league(st);
  const ev = CA.currentEvent(st);
  const table = CA.seasonTable(st);
  const mineRow = table.find(x => x.id === 'me');
  const rv = id => st.rivals.find(r => r.id === id);
  const def = id => E.hillOf(id)?.def;
  const field = CA.field(st, ev);
  const fOf = id => field.find(f => f.id === id);
  const replayPref = S.load(prefKey, 'skip');
  const nameOf = id => id === 'me' ? E.myWho() : `${flagOf(rv(id)?.flag)} ${esc(rv(id)?.name || id)}`;
  const top = table.slice(0, 12);
  if (mineRow && !top.includes(mineRow)) top.push(mineRow);
  $('#menu').innerHTML = `<div class="mg-stack sk-career">
    <div class="sk-cup__head">
      <div class="sk-hero"><div class="sk-hero__icon" aria-hidden="true">🎯</div>
        <div><span class="sk-cup__lbl">Kariera · sezona ${st.seasonNo}</span><h1 class="mg-title">${esc(L.name)}</h1>
          <p class="mg-muted mg-small">Liga ${st.league + 1}/${st.leagues.length} · ${st.schedule.length} tekem · prizorišča: ${L.tags.map(t => TAG_NAME[t] || t).join(', ')} · med najboljših ${CA.PROMOTE_TOP} → ${st.league < st.leagues.length - 1 ? esc(st.leagues[st.league + 1].name) : 'naslov prvaka'}</p></div></div>
      <div class="sk-cup__nav"><button class="mg-btn mg-btn--small mg-btn--ghost" id="cExport">📤 Koda</button><button class="mg-btn mg-btn--small mg-btn--ghost" id="cImport">📥 Uvoz</button>
        <button class="mg-btn mg-btn--small mg-btn--ghost" id="cNew">Nova kariera</button><button class="mg-btn mg-btn--small mg-btn--ghost" id="cBack">← Meni</button></div>
    </div>
    ${news.length ? `<div class="sk-news">${news.map(n => `<p>📰 ${esc(n)}</p>`).join('')}</div>` : ''}
    <div class="sk-cup__grid">
      <div class="mg-stack">
        <section class="mg-card mg-stack">
          ${ev ? `<span class="sk-cup__lbl">Naslednja tekma · ${ev.idx}/${st.schedule.length}</span>
            <h2 class="mg-title">${esc(def(ev.venue)?.name || ev.venue)} · K${def(ev.venue)?.k} / HS${def(ev.venue)?.hs}</h2>
            <p class="mg-small mg-muted">Veter okoli ${ev.wind > 0 ? '+' : ''}${fmt1(ev.wind)} m/s · dve seriji · 30 skakalcev</p>
            <label class="mg-small">Skoki rivalov <select class="mg-select" id="cRep">
              <option value="skip" ${replayPref === 'skip' ? 'selected' : ''}>Le rezultat (hitro)</option>
              <option value="fast" ${replayPref === 'fast' ? 'selected' : ''}>Pospešeno (2×)</option>
              <option value="live" ${replayPref === 'live' ? 'selected' : ''}>V živo</option></select></label>
            <button class="mg-btn mg-btn--green mg-btn--big" id="cPlay">▶ Na tekmo</button>
            <button class="mg-btn mg-btn--primary" id="cTrain">Trening na ${esc(def(ev.venue)?.name || '')}</button>` : '<div class="mg-empty">Sezona je končana.</div>'}
        </section>
        <section class="mg-card"><h2 class="mg-title">Koledar sezone</h2><ol class="sk-cal">${st.schedule.map((e, i) => {
          const r = st.results.find(x => x.idx === e.idx);
          return `<li class="${i === st.eventIdx ? 'next' : r ? 'done' : ''}"><b>${e.idx}.</b> ${esc(def(e.venue)?.name || e.venue)} <span class="mg-muted mg-small">K${def(e.venue)?.k}</span>
            <span class="pl">${r ? (r.place ? r.place + '. mesto' : '—') + (r.winner && r.winner !== 'me' ? ` · zmagal ${esc(rv(r.winner)?.name || '')}` : r.place === 1 ? ' 🥇' : '') : i === st.eventIdx ? 'naslednja' : ''}</span></li>`;
        }).join('')}</ol></section>
        <section class="mg-card"><h2 class="mg-title">Statistika kariere</h2>
          <div class="sk-stats"><div><span class="mg-muted mg-small">Tekme</span><b>${st.stats.events}</b></div><div><span class="mg-muted mg-small">Zmage</span><b>${st.stats.wins}</b></div>
            <div><span class="mg-muted mg-small">Odri</span><b>${st.stats.podiums}</b></div><div><span class="mg-muted mg-small">Najdaljši</span><b>${st.stats.longest ? fmtDist(st.stats.longest) : '—'}</b></div>
            <div><span class="mg-muted mg-small">Sezone</span><b>${st.stats.seasons}</b></div><div><span class="mg-muted mg-small">Naslovi</span><b>${st.stats.titles}</b></div></div>
          ${st.history.length ? `<ul class="sk-list mg-small">${st.history.slice(-6).reverse().map(h => `<li>Sezona ${h.seasonNo}: ${esc(st.leagues.find(l => l.id === h.league)?.name || h.league)} — ${h.place}. mesto (${h.points} t)${h.champion ? ' 👑' : ''}</li>`).join('')}</ul>` : ''}</section>
      </div>
      <div class="mg-stack">
        <section class="mg-card"><h2 class="mg-title">Razvrstitev sezone</h2>
          <table class="mg-table sk-cuptable"><thead><tr><th>#</th><th>Skakalec</th><th class="mg-num">Forma</th><th class="mg-num">Točke</th></tr></thead><tbody>
          ${top.map(x => { const f = x.id === 'me' ? null : fOf(x.id); const R = rv(x.id); return `<tr class="${x.id === 'me' ? 'mg-me' : ''} ${x.rank <= CA.PROMOTE_TOP ? 'promo' : ''}"><td class="mg-rank">${x.rank}.</td><td>${nameOf(x.id)}${R ? ` <span class="mg-small mg-muted">${CHAR_NAME[R.char] || ''}${R.spec ? ' · ' + (TAG_NAME[R.spec] || R.spec) : ''}</span>` : ''}</td>
            <td class="mg-num">${f ? (f.form > 0.25 ? '<span class="up">▲</span>' : f.form < -0.25 ? '<span class="dn">▼</span>' : '▬') : ''}</td><td class="mg-num"><b>${x.points}</b></td></tr>`; }).join('')}</tbody></table>
          <p class="sk-note">Zelena črta: mesta za napredovanje (najboljših ${CA.PROMOTE_TOP}). Forma rivalov niha od tekme do tekme.</p></section>
      </div>
    </div></div>`;
  $('#cBack').onclick = () => E.showMenu();
  $('#cExport').onclick = () => exportDialog(st);
  $('#cImport').onclick = importDialog;
  $('#cNew').onclick = async () => { if (await ui.confirm('Res začnem novo kariero? Trenutna se izbriše (najprej si jo lahko izvoziš).', { danger: true })) { S.remove(key()); renderStart(); } };
  $('#cRep')?.addEventListener('change', e => S.save(prefKey, e.target.value));
  $('#cPlay')?.addEventListener('click', () => play(st));
  $('#cTrain')?.addEventListener('click', () => E.train(ev.venue, { gate: def(ev.venue).gates.default, refGate: def(ev.venue).gates.default, wind: { mode: 'steady', seed: ev.seed, speed: ev.wind }, label: 'Trening kariere', back: () => open() }));
}

/* ------------------------------------------------------------ tekma */

async function play(st) {
  const ev = CA.currentEvent(st);
  if (!ev || !E.match?.runCompetition) return;
  const L = CA.league(st);
  const myFlag = gearOf(hub.profile?.equipped).flag?.value.code || 'si';
  const me = { id: 'me', name: hub.profile?.nickname?.slice(0, 24) || 'Jaz', flag: myFlag, type: DEV_BOT != null ? 'bot' : 'human', skill: DEV_BOT ?? 0.7, style: 'normal', equipped: hub.profile?.equipped || {} };
  const field = CA.field(st, ev).map(f => ({ id: f.id, name: f.name, flag: f.flag || 'bela', type: 'bot', skill: f.skill, style: f.style, suit: f.suit, helmet: f.helmet }));
  const cfg = { hill: ev.venue, format: 'two', cut: 0, wind: 'var', jury: 'auto', gate: null, relaxed: true, replay: S.load(prefKey, 'skip') };
  await E.match.runCompetition(cfg, [me, ...field], {
    seed: `kariera:${st.seed}:${st.seasonNo}:${ev.idx}`, wind: { mean: ev.wind, seed: ev.seed },
    label: `${L.name} · tekma ${ev.idx}/${st.schedule.length}`,
    onAbort: () => open(),
    onEnd: async (rows, Lc) => {
      const longest = Math.max(0, ...Lc.jumps.filter(j => j.id === 'me' && !j.fall).map(j => j.dist));
      const prevLeague = st.league;
      const out = CA.recordEvent(st, rows.map(r => ({ id: r.id, rank: r.rank, total: r.total, status: r.status })), { longest });
      const next = out.state;
      next.news = headline(out, next, prevLeague);
      save(next);   // shrani po vsaki tekmi (ne sredi tekme)
      // hub: XP, kovanci, naloge, dosežki
      let xp = 25;
      hub.reportGame({ won: out.won, players: 1, score: Math.round(rows.find(r => r.id === 'me')?.total || 0), daily: false });
      if (out.won) hub.reportEvent('skoki:kariera-zmaga', 1);
      if (out.promoted) {
        xp += 75;
        hub.reportEvent('skoki:kariera-liga', 1);
        if (next.league >= 1) E.unlock('kariera-liga-2');
        if (next.league >= 2) E.unlock('kariera-poleti');
      }
      if (out.seasonEnd && out.champion && prevLeague === st.leagues.length - 1) E.unlock('kariera-prvak');
      hub.awardXp(xp, 'skoki: kariera');
      await E.match.podium(Lc.comp, rows);
      await E.match.results(Lc.comp, rows, { xp, again: 'Kariera', exit: 'V meni' }).then(ch => {
        E.match.hideHud();
        if (ch === 'exit') E.showMenu(); else open();
      });
      return rows;
    },
  });
}

/* ------------------------------------------------------------ izvoz / uvoz */

async function exportDialog(st) {
  const code = CA.exportCareer(st);
  await ui.modal({ title: 'Koda kariere', html: `<p class="mg-muted">Shrani kodo (npr. v beležko) ali jo prilepi na drugi napravi v »Uvoz«.</p><textarea class="mg-input" rows="5" readonly style="width:100%;font-size:12px">${esc(code)}</textarea>`,
    actions: [{ label: 'Zapri', value: true }], onOpen: box => { const t = box.querySelector('textarea'); t.focus(); t.select(); } });
}
async function importDialog() {
  let code = '';
  const ok = await ui.modal({ title: 'Uvoz kariere', html: '<p class="mg-muted">Prilepi kodo (začne se s KARIERA1:). Trenutna kariera se zamenja.</p><textarea class="mg-input" rows="5" style="width:100%;font-size:12px"></textarea>',
    actions: [{ label: 'Prekliči', value: false }, { label: 'Uvozi', value: true, kind: 'primary' }],
    onOpen: box => { const t = box.querySelector('textarea'); t.focus(); t.addEventListener('input', () => { code = t.value; }); } });
  if (!ok) return;
  const st = CA.importCareer(code);
  if (!st) { ui.toast('Koda ni veljavna.', { icon: '⚠️' }); return; }
  save(st);
  ui.toast('Kariera uvožena.', { icon: '📥' });
  render(st);
}

export function initCareer(engine) {
  E = engine;
  return { open };
}
