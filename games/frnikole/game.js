/* =====================================================================
   DIRKA FRNIKOL — game.js: meni, stavnica, dirka v živo, obračun, konec dneva.
   Dirkalni dan = 5 dirk (day.js). Pred dirko: kvote iz tihih simulacij (odds.js),
   stave igralca in botov (bets.js, bots.js). Med dirko: 3 sunki (race.js).
   Simulacija teče s fiksnim korakom (STEP); izris (view.js) le prikazuje stanje.
   Razvoj: ?track=N (takoj proga N), ?fast=1 (dirka brez izrisa), ?q=low|…, ?dev=1.
   ===================================================================== */
import { hub, ui } from '../../shared/hub.js';
import * as S from '../../shared/storage.js';
import { STEP } from '../krogla/physics.js';
import { QUALITY, QUALITY_ORDER, detectQuality } from '../krogla/render.js';
import { loadTracks, trackLength } from './track.js';
import { createRace, stepRace, runRace, nudgeState, RACE } from './race.js';
import { newStats, addSim, oddsFrom, ODDS } from './odds.js';
import { BET, BET_TYPES, betError, BET_ERRORS, settle, maybeLoan, finalScore, betLabel, fmtOdds } from './bets.js';
import { botBets, botBrain, biggestStake, PERSONAS, duelOdds } from './bots.js';
import { dayPlan, marbleById, formArrows, formText } from './day.js';
import { line, nudgeFeed } from './texts.js';
import { RaceRenderer } from './view.js';
import { RaceAudio } from './sound.js';
import { startCloud } from './cloud.js';

const GAME = 'frnikole';
const $ = s => document.querySelector(s);
const esc = s => ui.esc(String(s ?? ''));
const QS = new URLSearchParams(location.search);
const DEV = QS.has('dev');
const FAST = QS.get('fast') === '1';
const fmt = n => Math.round(n).toLocaleString('sl-SI');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ACH = [
  { key: 'outsider', title: 'Outsider', icon: '🐎', desc: 'Zadeni stavo s kvoto vsaj 8' },
  { key: 'trojna', title: 'Trojna', icon: '🎯', desc: '3 zadete stave v eni dirki' },
  { key: 'saboter', title: 'Saboter', icon: '😈', desc: 'Tvoj bočni sunek vrže favorita s proge, tvoja frnikola zmaga' },
  { key: 'milijonar', title: 'Milijonar', icon: '💰', desc: 'Končaj dan z vsaj 5000 točkami' },
  { key: 'brez-sunka', title: 'Mirne roke', icon: '🧘', desc: 'Zmagaj dan brez enega samega sunka' },
  { key: 'foto', title: 'Foto finiš', icon: '📸', desc: 'Zadeni stavo v foto finišu' },
];
const achDef = k => ACH.find(a => a.key === k);
const unlock = k => hub.unlock(k, { title: achDef(k).title, icon: achDef(k).icon });

/* ===================================================================== */
/*  Stanje                                                               */
/* ===================================================================== */

let TRACKS = [];
const trackById = id => TRACKS.find(T => T.id === id);
let renderer = null, engineFailed = false;
const audio = new RaceAudio();
const settings = Object.assign({ sfx: true, music: false, quality: 'auto', bots: 5, speed: 1 }, S.load('frnikole:settings', {}));
const saveSettings = () => S.save('frnikole:settings', settings);
let board = null;

/** Trenutni dan: { plan, daily, first, accs: Map, race: idx, cur } */
let day = null;
/** Trenutna dirka: { def, T, mb (podatki frnikol), odds, R, bets: Map id→[], phase } */
let cur = null;

const ME = 'me';

/* ===================================================================== */
/*  Zagon                                                                */
/* ===================================================================== */

async function main() {
  await hub.init({ gameId: GAME, scoreOrder: 'desc' });
  await startCloud(hub);   // dnevni poskus online (»prvi poskus šteje« tudi na drugi napravi)
  ui.header({ title: 'Dirka frnikol' });
  try { TRACKS = await loadTracks(new URL('tracks/', import.meta.url)); }
  catch (e) { console.warn(e); $('#menu').innerHTML = '<div class="mg-empty">Prog ni bilo mogoče naložiti.</div>'; return; }
  addEventListener('pointerdown', () => audio.unlock(), { passive: true });
  addEventListener('keydown', () => audio.unlock(), { passive: true });
  audio.setSfx(settings.sfx); audio.setMusic(false);
  setupKeys();
  requestAnimationFrame(frame);
  const tq = parseInt(QS.get('track'), 10);
  if (tq >= 1 && tq <= TRACKS.length) { startDay('free', { only: TRACKS[tq - 1].id }); return; }
  showMenu();
}

function show(id) {
  for (const s of document.querySelectorAll('.fr-screen')) s.classList.toggle('mg-hidden', s.id !== id);
  document.body.classList.toggle('fr-playing', id === 'race');
  window.scrollTo({ top: 0 });
}

/* ===================================================================== */
/*  Meni                                                                 */
/* ===================================================================== */

const dailyKey = () => 'frnikole:daily:' + hub.dailySeed();

async function dailyStatus() {
  const st = S.load(dailyKey(), null);
  const best = await hub.getMyBest({ seed: hub.dailySeed() }).catch(() => null);
  return { played: !!st || best != null, score: st?.score ?? best ?? null, started: !!st };
}

async function showMenu() {
  show('menu');
  const st = await dailyStatus();
  const el = $('#menu');
  el.innerHTML = `
    <div class="mg-card mg-card--glow fr-hero">
      <div class="fr-hero__icon" aria-hidden="true">🔮</div>
      <div class="mg-stack" style="gap:6px">
        <h1 class="mg-title" style="margin:0">Dirka frnikol</h1>
        <p class="mg-muted" style="margin:0">Osem steklenih frnikol drvi po dolgi progi navzdol. Pred dirko staviš točke na zmagovalca,
          stopničke ali dvoboj, med dirko pa imaš <b>3 sunke</b>: porini svojo frnikolo naprej ali tujo vstran. Pet dirk na dan proti botom.</p>
        <div class="fr-row">
          <button class="mg-btn mg-btn--ghost mg-btn--small" data-act="help">Kako igrati</button>
          <a class="mg-btn mg-btn--ghost mg-btn--small" href="${hub.link('games/krogla/')}">🐹 Hrčkova krogla</a>
          <a class="mg-btn mg-btn--ghost mg-btn--small" href="${hub.link('games/rusilec/')}">💥 Rušilec</a>
          <label class="fr-row" style="gap:6px"><span class="mg-small mg-muted">Grafika</span>
            <select class="mg-select" id="mQ" aria-label="Kakovost grafike">${qualityOptions()}</select></label>
          <label class="mg-check"><input type="checkbox" id="mSfx" ${settings.sfx ? 'checked' : ''}> Zvok</label>
        </div>
      </div>
    </div>
    <div class="fr-cards">
      <div class="mg-card">
        <h2 class="mg-title">Dnevni izziv</h2>
        <p class="mg-muted" style="margin:0">Isti dan za vse: iste proge, frnikole, forma in boti. Razlikujejo te le stave in sunki.
          <b>Šteje prvi poskus dneva</b>, ponovitve so trening.</p>
        <p style="margin:8px 0">${st.played ? `Danes: <b>${st.score != null ? fmt(st.score) + ' točk' : 'začeto'}</b> · naslednji poskusi so trening` : 'Danes še ni poskusa.'}</p>
        <button class="mg-btn mg-btn--primary mg-btn--big" data-act="daily">${st.played ? 'Trening dneva' : 'Začni Dirkalni dan'}</button>
      </div>
      <div class="mg-card">
        <h2 class="mg-title">Prosta igra</h2>
        <p class="mg-muted" style="margin:0">Naključen dan, brez lestvice. Izberi število botov.</p>
        <div class="fr-row" style="margin:8px 0">
          <label class="fr-row" style="gap:6px"><span class="mg-small mg-muted">Boti</span>
            <select class="mg-select" id="mBots">${[3, 4, 5, 6, 7].map(n => `<option ${n === settings.bots ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <button class="mg-btn mg-btn--cyan mg-btn--big" data-act="free">Prosta igra</button>
      </div>
    </div>
    <div class="fr-cards">
      <div class="mg-card" id="board"></div>
      <div class="mg-card">
        <h2 class="mg-title">Dosežki</h2>
        <div class="fr-ach" id="achList"></div>
        <h2 class="mg-title" style="margin-top:14px">Proge</h2>
        <div class="fr-tracks">${TRACKS.map(T => `<div><b>${esc(T.name)}</b><small>${esc(T.desc)} · ${Math.round(trackLength(T))} m</small></div>`).join('')}</div>
      </div>
    </div>`;
  el.querySelector('[data-act=daily]').onclick = () => startDay('daily');
  el.querySelector('[data-act=free]').onclick = () => { settings.bots = +$('#mBots').value; saveSettings(); startDay('free'); };
  el.querySelector('[data-act=help]').onclick = helpModal;
  $('#mQ').onchange = e => { settings.quality = e.target.value; saveSettings(); if (renderer) { const q = qualityKey(); renderer.setQuality(q); } };
  $('#mSfx').onchange = e => { settings.sfx = e.target.checked; saveSettings(); audio.setSfx(settings.sfx); };
  board = ui.leaderboard($('#board'), {
    title: 'Lestvica', format: s => fmt(s) + ' točk',
    tabs: [{ label: 'Danes', seed: hub.dailySeed() }, { label: 'Teden', period: 'week' }, { label: 'Vseh časov' }],
  });
  const mine = new Set((await hub.getAchievements().catch(() => [])).map(a => a.key));
  $('#achList').innerHTML = ACH.map(a => `<div class="${mine.has(a.key) ? '' : 'locked'}" title="${esc(a.desc)}">${a.icon} <b>${esc(a.title)}</b><br><small>${esc(a.desc)}</small></div>`).join('');
}

function qualityKey() {
  const q = QS.get('q');
  if (q && QUALITY[q]) return q;
  return settings.quality !== 'auto' && QUALITY[settings.quality] ? settings.quality : detectQuality();
}
function qualityOptions() {
  return `<option value="auto" ${settings.quality === 'auto' ? 'selected' : ''}>Samodejno</option>`
    + QUALITY_ORDER.map(k => `<option value="${k}" ${settings.quality === k ? 'selected' : ''}>${QUALITY[k].name}</option>`).join('');
}

function helpModal() {
  ui.modal({
    title: 'Kako igrati', wide: true, html: `
      <p><b>Dirkalni dan</b> ima 5 dirk. Začneš s ${fmt(BET.START)} točkami (točke so v igri, niso kovanci).</p>
      <p><b>Stave</b> (do ${BET.PER_RACE} na dirko, najmanj ${BET.MIN} točk): <b>zmagovalec</b> (kvota), <b>na stopničkah</b> (prvi trije, nižja kvota),
        <b>dvoboj</b> (A pred B, ~1,8). Izplačilo = vložek × kvota. Kvote izračunamo iz ${ODDS.SIMS} tihih simulacij dirke, zato res odražajo možnosti.</p>
      <p><b>Forma</b> (▲ dobro · – povprečno · ▽ slabo): ravnina, zavoji, masa. Razlike so majhne — izid je vedno odprt.</p>
      <p><b>Sunki:</b> ${RACE.NUDGES} na dirko, ohlajanje ${String(RACE.CD).replace('.', ',')} s. <b>Pomoč</b> porine izbrano frnikolo naprej,
        <b>bočni sunek</b> jo porine proti robu (lahko pade s proge — po 2 s se vrne na zadnjo kontrolno točko).</p>
      <dl class="fr-keys"><dt>Namizje</dt><dd>klik na frnikolo ali <span class="mg-kbd">1</span>–<span class="mg-kbd">8</span> izbere · <span class="mg-kbd">Q</span> pomoč · <span class="mg-kbd">E</span> bočni sunek · <span class="mg-kbd">C</span> kamera</dd>
        <dt>Telefon</dt><dd>barvni gumbi spodaj izberejo frnikolo, velika gumba sta sunka</dd></dl>
      <p><b>Boti</b> stavijo in sunkajo po svoji osebnosti: ${Object.values(PERSONAS).map(p => `${p.icon} ${esc(p.name)} (${esc(p.desc)})`).join(' · ')}.</p>
      <p>Če pade kupček pod ${BET.MIN}, dobiš enkrat na dan posojilo ${BET.LOAN} točk (na koncu se odšteje).</p>` });
}

/* ===================================================================== */
/*  Dan                                                                  */
/* ===================================================================== */

async function startDay(mode, { only = null } = {}) {
  audio.unlock();
  const daily = mode === 'daily';
  let first = false;
  if (daily) {
    const st = await dailyStatus();
    first = !st.played;
    if (first) S.save(dailyKey(), { started: Date.now() });   // poskus je porabljen ob začetku
  }
  const seed = daily ? hub.dailySeed() : 'prosto-' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const ids = TRACKS.map(T => T.id);
  const plan = dayPlan(seed, { bots: daily ? 5 : settings.bots, tracks: only ? [only] : ids, rng: hub.rng });
  if (only) plan.races.forEach(r => { r.track = only; });
  const accs = new Map();
  const me = hub.profile || { nickname: 'Ti', avatar: { emoji: '🙂', color: '#b388ff' } };
  accs.set(ME, { id: ME, name: me.nickname || 'Ti', bank: BET.START, loan: false, wonBets: 0, wonWin: 0, nudges: 0, me: true, history: [] });
  for (const b of plan.bots) accs.set(b.id, { id: b.id, name: b.name, bot: b, bank: BET.START, loan: false, wonBets: 0, wonWin: 0, nudges: 0, history: [] });
  day = { plan, daily, first, accs, idx: 0, mode };
  if (daily && !first) ui.toast('Trening: ta poskus ne šteje za lestvico.', { icon: '🏋️' });
  await prepareRace();
}

/** Podatki frnikol dirke (ime, barva … + forma). */
const marbleData = def => def.marbles.map(m => ({ ...marbleById(m.id), form: m.form }));

async function prepareRace() {
  const def = day.plan.races[day.idx];
  const T = trackById(def.track);
  const mb = marbleData(def);
  cur = { def, T, mb, odds: null, R: null, bets: new Map(), phase: 'odds', slip: { type: 'win', m: -1, vs: -1 } };
  for (const id of day.accs.keys()) cur.bets.set(id, []);
  // posojilo (vsak udeleženec, enkrat na dan)
  for (const a of day.accs.values()) if (maybeLoan(a) && a.me) ui.toast(`Posojilo: +${BET.LOAN} točk (na koncu se odšteje).`, { icon: '🏦', duration: 3500 });
  show('bet');
  renderBetLoading(0);
  // kvote: tihe simulacije po kosih (UI ostane odziven)
  const st = newStats(mb.length);
  const t0 = performance.now();
  for (let k = 0; k < ODDS.SIMS; k++) {
    addSim(st, T, def.marbles, def.seed, k);
    if (k % 3 === 2) { renderBetLoading((k + 1) / ODDS.SIMS); await sleep(0); }
    if (!cur || cur.def !== def) return;
  }
  if (DEV) console.log('[frnikole] kvote', Math.round(performance.now() - t0), 'ms');
  cur.odds = oddsFrom(st);
  cur.phase = 'bet';
  cur.slip.m = cur.odds.fav;
  renderBet();
  if (FAST && QS.has('auto')) autoBet();
}

function renderBetLoading(p) {
  $('#bet').innerHTML = `<div class="mg-card fr-loading"><span class="mg-spin"></span> Računam kvote (${ODDS.SIMS} tihih simulacij) …
    <div class="mg-xpbar"><i style="width:${Math.round(p * 100)}%"></i></div></div>`;
}

const names = () => cur.mb.map(m => m.name);
const insts = () => cur.mb.map(m => m.acc);   // orodnik = tožilnik pri teh imenih (»pred Rdečo zvezdo«)
const myBets = () => cur.bets.get(ME);
const myAcc = () => day.accs.get(ME);

function oddsOf(type, m, vs) {
  if (type === 'win') return cur.odds.win[m];
  if (type === 'podium') return cur.odds.podium[m];
  return duelOdds(cur.odds, m, vs);
}

function renderBet() {
  const { def, T, mb, odds } = cur;
  const acc = myAcc();
  const bets = myBets();
  const staked = bets.reduce((s, b) => s + b.stake, 0);
  const slip = cur.slip;
  const so = slip.m >= 0 ? oddsOf(slip.type, slip.m, slip.vs) : 0;
  const dot = m => `<i class="fr-dot" style="--c:${mb[m].color};--c2:${mb[m].color2}"></i>`;
  $('#bet').innerHTML = `
    <div class="fr-bethead">
      <div>
        <div class="mg-small mg-muted">${day.daily ? (day.first ? 'Dnevni izziv' : 'Dnevni izziv · trening') : 'Prosta igra'} · dirka ${def.no}/${BET.RACES}</div>
        <h1 class="mg-title" style="margin:2px 0">${esc(T.name)}</h1>
        <div class="mg-small mg-muted">${esc(T.desc)} · ${Math.round(trackLength(T))} m · ${T.splits?.length ? `razcep: ${esc(T.splits.map(s => s.name).join(', '))}` : ''}</div>
      </div>
      <div class="fr-bank"><span class="mg-small mg-muted">Kupček</span><b>${fmt(acc.bank)}</b><span class="mg-small mg-muted">${staked ? 'vloženo ' + fmt(staked) : 'točk'}</span></div>
    </div>
    <div class="fr-betgrid">
      <div class="fr-marbles">${mb.map((m, i) => `
        <div class="fr-mcard ${slip.m === i ? 'sel' : ''}" data-m="${i}">
          <div class="fr-mcard__top">${dot(i)}<b>${esc(m.name)}</b><span class="fr-form" title="ravnina · zavoji · masa">${formArrows(m.form)}</span></div>
          <small>${esc(formText(m.form))}</small>
          <div class="fr-odds">
            <button class="fr-oddbtn ${slip.type === 'win' && slip.m === i ? 'on' : ''}" data-bt="win" data-m="${i}"><small>zmaga</small>${fmtOdds(odds.win[i])}</button>
            <button class="fr-oddbtn ${slip.type === 'podium' && slip.m === i ? 'on' : ''}" data-bt="podium" data-m="${i}"><small>top 3</small>${fmtOdds(odds.podium[i])}</button>
          </div>
        </div>`).join('')}
      </div>
      <aside class="mg-stack fr-side">
        <div class="mg-card fr-duels"><h3 class="mg-title">Dvoboji</h3>${odds.duels.map(d => `
          <div class="fr-duel">
            <button class="fr-oddbtn ${slip.type === 'duel' && slip.m === d.a && slip.vs === d.b ? 'on' : ''}" data-bt="duel" data-m="${d.a}" data-vs="${d.b}">${dot(d.a)} ${esc(mb[d.a].name)} <small>pred</small> ${esc(mb[d.b].acc)} <b>${fmtOdds(d.oa)}</b></button>
            <button class="fr-oddbtn ${slip.type === 'duel' && slip.m === d.b && slip.vs === d.a ? 'on' : ''}" data-bt="duel" data-m="${d.b}" data-vs="${d.a}">${dot(d.b)} ${esc(mb[d.b].name)} <small>pred</small> ${esc(mb[d.a].acc)} <b>${fmtOdds(d.ob)}</b></button>
          </div>`).join('')}
        </div>
        <div class="mg-card fr-slip">
          <h3 class="mg-title">Listek</h3>
          ${slip.m >= 0 ? `<div class="fr-slip__sel">${dot(slip.m)} <b>${esc(betLabel(slip, names(), insts()))}</b> · kvota <b>${fmtOdds(so)}</b></div>` : '<div class="mg-muted">Izberi kvoto.</div>'}
          <div class="fr-stake">
            <input class="mg-input" id="stake" type="number" inputmode="numeric" min="${BET.MIN}" step="10" value="${Math.min(acc.bank, Math.max(BET.MIN, cur.lastStake || 100))}" aria-label="Vložek">
            ${[10, 50, 100].map(v => `<button class="mg-btn mg-btn--ghost mg-btn--small" data-stake="${v}">${v}</button>`).join('')}
            <button class="mg-btn mg-btn--ghost mg-btn--small" data-stake="half">½</button>
            <button class="mg-btn mg-btn--ghost mg-btn--small" data-stake="all">Vse</button>
          </div>
          <div class="mg-small mg-muted" id="win">${slip.m >= 0 ? '' : ''}</div>
          <button class="mg-btn mg-btn--pink mg-btn--block" id="addBet" ${bets.length >= BET.PER_RACE || acc.bank < BET.MIN || slip.m < 0 ? 'disabled' : ''}>Dodaj stavo (${bets.length}/${BET.PER_RACE})</button>
          <div class="fr-mybets">${bets.map((b, k) => `<div>${dot(b.m)} ${esc(betLabel(b, names(), insts()))} · ${fmt(b.stake)} × ${fmtOdds(b.odds)} <button class="fr-x" data-del="${k}" aria-label="Odstrani stavo">✕</button></div>`).join('')}</div>
        </div>
        <button class="mg-btn mg-btn--primary mg-btn--big mg-btn--block fr-gobar" id="go">${bets.length ? 'Na start!' : 'Na start brez stave'}</button>
        <button class="mg-btn mg-btn--ghost mg-btn--small" id="quit">Zapusti dan</button>
      </aside>
    </div>`;
  const stakeEl = $('#stake');
  const updWin = () => { const v = +stakeEl.value || 0; $('#win').textContent = slip.m >= 0 ? `Možen dobitek: ${fmt(Math.floor(v * so))} točk` : ''; };
  stakeEl.oninput = updWin; updWin();
  $('#bet').querySelectorAll('[data-bt]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    cur.slip = { type: b.dataset.bt, m: +b.dataset.m, vs: b.dataset.vs != null ? +b.dataset.vs : -1 };
    cur.lastStake = +$('#stake').value || cur.lastStake;
    renderBet();
  });
  $('#bet').querySelectorAll('.fr-mcard').forEach(c => c.onclick = () => { cur.slip = { type: 'win', m: +c.dataset.m, vs: -1 }; cur.lastStake = +$('#stake').value || cur.lastStake; renderBet(); });
  $('#bet').querySelectorAll('[data-stake]').forEach(b => b.onclick = () => {
    const v = b.dataset.stake;
    stakeEl.value = v === 'all' ? acc.bank : v === 'half' ? Math.max(BET.MIN, Math.floor(acc.bank / 2)) : Math.min(acc.bank, +v);
    updWin();
  });
  $('#bet').querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const [x] = bets.splice(+b.dataset.del, 1);
    acc.bank += x.stake;
    renderBet();
  });
  $('#addBet').onclick = () => {
    const stake = Math.floor(+stakeEl.value || 0);
    const bet = { type: slip.type, m: slip.m, stake, odds: so, ...(slip.type === 'duel' ? { vs: slip.vs } : {}) };
    const err = betError(acc.bank, bets, bet);
    if (err) { ui.toast(BET_ERRORS[err], { icon: '⚠️' }); return; }
    bets.push(bet); acc.bank -= stake; cur.lastStake = stake;
    audio.play('stava');
    renderBet();
  };
  $('#go').onclick = () => startRace();
  $('#quit').onclick = async () => { if (await ui.confirm('Zapustim Dirkalni dan? Napredek se izgubi.')) { day = null; cur = null; showMenu(); } };
}

/** Samodejna stava (razvoj: ?fast=1&auto): favorit za 100. */
function autoBet() {
  const acc = myAcc();
  const b = { type: 'win', m: cur.odds.fav, stake: Math.min(acc.bank, 100), odds: cur.odds.win[cur.odds.fav] };
  if (!betError(acc.bank, myBets(), b)) { myBets().push(b); acc.bank -= b.stake; }
  startRace();
}

/* ===================================================================== */
/*  Dirka                                                                */
/* ===================================================================== */

let loop = null;   // { acc, last, speed, slowT, sel, pending: [], mode }

function startRace() {
  if (!cur || cur.phase !== 'bet') return;
  cur.phase = 'race';
  const { def, T, odds } = cur;
  const ids = def.marbles.map(m => m.id);
  // stave botov
  const feed = [];
  for (const a of day.accs.values()) {
    if (!a.bot) continue;
    const bs = botBets(a.bot, { bank: a.bank, odds, ids, seed: def.seed }, hub.rng);
    for (const b of bs) { a.bank -= b.stake; }
    cur.bets.set(a.id, bs);
    if (bs.length) feed.push(`${a.bot.emoji} ${a.name}: ${bs.map(b => `${fmt(b.stake)} na ${betLabel(b, names(), insts())} (${fmtOdds(b.odds)})`).join(', ')}`);
  }
  // saboter: frnikola, na katero ima največ vodilni stavnik (po kupčku pred dirko)
  const brains = [];
  for (const a of day.accs.values()) {
    if (!a.bot) continue;
    const rivals = [...day.accs.values()].filter(x => x.id !== a.id).sort((x, y) => (y.bank + stakeOf(y.id)) - (x.bank + stakeOf(x.id)));
    let target = -1;
    for (const r of rivals) { target = biggestStake(cur.bets.get(r.id)); if (target >= 0) break; }
    if (target < 0) target = odds.fav;
    brains.push(botBrain(a.bot, { mine: biggestStake(cur.bets.get(a.id)), target, seed: def.seed }, hub.rng));
  }
  cur.R = createRace({ track: T, marbles: def.marbles, seed: def.seed, brains, participants: [...day.accs.keys()] });
  cur.mine = biggestStake(myBets());
  cur.feed = feed;
  cur.comments = { last: -1e9, lastFinal: false, lastBonk: -1e9 };
  if (FAST) { runRace(cur.R); onRaceEnd(); return; }
  if (!ensureEngine()) { runRace(cur.R); onRaceEnd(); return; }
  show('race');
  renderer.load(cur.R.w.L, cur.R.w);
  renderer.setMarbles(cur.mb.map(m => ({ name: m.name, color: m.color, color2: m.color2, pattern: m.pattern })));
  loop = { acc: 0, last: performance.now(), slowT: 0, sel: cur.mine >= 0 ? cur.mine : odds.fav, pending: [], mode: 'lead', started: false, speed: settings.speed || 1 };
  $('#feed').innerHTML = '';
  for (const f of feed) pushFeed(esc(f), 'bot', 6000);
  buildHud();
  setComment(`${def.no}. dirka · ${T.name}`);
  const L0 = loop;
  ui.countdown(3, { go: 'ŠTART' }).then(() => {
    if (loop !== L0) return;
    loop.started = true; loop.last = performance.now();
    setComment(line('start', def.no, {}));
    audio.play('go');
  });
}

const stakeOf = id => (cur.bets.get(id) || []).reduce((s, b) => s + b.stake, 0);

function ensureEngine() {
  if (renderer || engineFailed) return !!renderer;
  try { renderer = new RaceRenderer($('#cv'), { quality: qualityKey(), onLost: () => ui.toast('Grafika je bila ponastavljena — kakovost: Nizka.', { icon: '⚙️' }) }); }
  catch (e) {
    try { renderer = new RaceRenderer($('#cv'), { quality: 'low' }); }
    catch (e2) { console.warn(e2); engineFailed = true; ui.toast('Ta naprava ne podpira 3D grafike (WebGL) — dirka teče brez izrisa.', { icon: '⚠️', duration: 5000 }); return false; }
  }
  if (DEV) window.__fr = {
    get renderer() { return renderer; }, get cur() { return cur; }, get day() { return day; },
    /** razvoj: odsimuliraj s steps korakov naprej (brez izrisa) */
    skip(steps = 1e6) { const R = cur?.R; if (!R) return; for (let k = 0; k < steps && !R.done; k++) stepRace(R, null); },
  };
  addEventListener('resize', () => renderer?.resize());
  const cv = $('#cv');
  cv.addEventListener('pointerdown', e => {
    if (!cur?.R || !renderer) return;
    const r = cv.getBoundingClientRect();
    const i = renderer.pick(cur.R, e.clientX - r.left, e.clientY - r.top);
    if (i >= 0) select(i);
  });
  return true;
}

function buildHud() {
  const { mb } = cur;
  $('#mbtns').innerHTML = mb.map((m, i) => `<button class="fr-mbtn" data-i="${i}" style="--c:${m.color};--c2:${m.color2}" aria-label="${esc(m.name)}" title="${i + 1} · ${esc(m.name)}"><span>${i + 1}</span></button>`).join('');
  $('#mbtns').querySelectorAll('.fr-mbtn').forEach(b => b.onclick = () => select(+b.dataset.i));
  $('#hBets').innerHTML = myBets().map(b => `<span class="fr-chip" data-bet style="--c:${mb[b.m].color}">${esc(betLabel(b, names(), insts()))} · ${fmtOdds(b.odds)}</span>`).join('') || '<span class="fr-chip">brez stave</span>';
  $('#btnSpeed').textContent = loop.speed > 1 ? '⏩×2' : '⏩×1';
  updateCamBtn();
  select(loop.sel);
}

function select(i) {
  if (!loop || !cur) return;
  loop.sel = i;
  $('#mbtns').querySelectorAll('.fr-mbtn').forEach(b => b.classList.toggle('sel', +b.dataset.i === i));
  $('#selName').textContent = cur.mb[i]?.name || '';
  $('#selName').style.color = cur.mb[i]?.color === '#2a2a3a' ? '#ffd23f' : cur.mb[i]?.color;
  audio.play('click');
}

function nudge(k) {
  if (!loop || !cur?.R || cur.R.done || !loop.started) return;
  const st = nudgeState(cur.R, ME);
  if (!st.ready) { if (st.left <= 0) ui.toast('Ni več sunkov za to dirko.', { icon: '✋', duration: 1400 }); return; }
  const m = cur.R.M[loop.sel];
  if (!m || m.st !== 'run' || m.finished) { ui.toast('Ta frnikola zdaj ni na progi.', { icon: '✋', duration: 1400 }); return; }
  loop.pending.push({ m: loop.sel, k, by: ME });
}

function setupKeys() {
  addEventListener('keydown', e => {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT' || document.querySelector('.mg-modal-back')) return;
    if ($('#race').classList.contains('mg-hidden')) return;
    if (/^Digit[1-8]$/.test(e.code)) { select(+e.code.slice(5) - 1); e.preventDefault(); }
    else if (e.code === 'KeyQ') { nudge('help'); e.preventDefault(); }
    else if (e.code === 'KeyE') { nudge('hit'); e.preventDefault(); }
    else if (e.code === 'KeyC') { cycleCam(); e.preventDefault(); }
  });
  $('#btnHelp').addEventListener('click', () => nudge('help'));
  $('#btnHit').addEventListener('click', () => nudge('hit'));
  $('#btnCam').addEventListener('click', cycleCam);
  $('#btnMine').addEventListener('click', () => { if (loop) { loop.mode = 'mine'; updateCamBtn(); } });
  $('#btnSpeed').addEventListener('click', () => { if (!loop) return; loop.speed = loop.speed > 1 ? 1 : 2; settings.speed = loop.speed; saveSettings(); $('#btnSpeed').textContent = loop.speed > 1 ? '⏩×2' : '⏩×1'; });
  $('#btnList').addEventListener('click', () => document.body.classList.toggle('fr-list-open'));
  $('#btnMute').addEventListener('click', () => { settings.sfx = !settings.sfx; saveSettings(); audio.setSfx(settings.sfx); $('#btnMute').textContent = settings.sfx ? '🔊' : '🔇'; });
  $('#btnMute').textContent = settings.sfx ? '🔊' : '🔇';
  $('#btnExit').addEventListener('click', async () => { if (await ui.confirm('Zapustim Dirkalni dan? Napredek se izgubi.')) { loop = null; day = null; cur = null; showMenu(); } });
}

const CAMS = ['lead', 'mine', 'overview'];
const CAM_NAMES = { lead: '🎥 Vodilni', mine: '🔮 Moja', overview: '🗺️ Pregled' };
function cycleCam() { if (!loop) return; loop.mode = CAMS[(CAMS.indexOf(loop.mode) + 1) % CAMS.length]; updateCamBtn(); }
function updateCamBtn() { $('#btnCam').textContent = CAM_NAMES[loop.mode]; }

function setComment(text) {
  const el = $('#comment');
  el.textContent = text;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}

function pushFeed(html, cls = '', ms = 4200) {
  const f = $('#feed');
  const d = document.createElement('div');
  d.className = cls; d.innerHTML = html;
  f.prepend(d);
  while (f.children.length > 5) f.lastChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 500); }, ms);
}

/* ------------------------------------------------------------ zanka */

function frame(now) {
  requestAnimationFrame(frame);
  if (!loop || !cur?.R || $('#race').classList.contains('mg-hidden') || !renderer) return;
  const R = cur.R;
  const raw = (now - loop.last) / 1000;
  const dt = Math.min(0.25, raw);
  loop.last = now;
  autoQuality(raw);
  if (loop.started && !R.done) {
    // počasni posnetek tik pred ciljem, če je tesno
    let ts = loop.speed;
    const ord = R.order, a = R.M[ord[0]], b = R.M[ord[1]];
    if (a && b && !a.finished && a.route.finish - a.s < 2.6 && Math.abs(a.ms - b.ms) < 0.8 && !renderer.reduced) ts = 0.35;
    loop.acc += dt * ts;
    let n = 0;
    while (loop.acc >= STEP && n < 90 && !R.done) {
      const p = loop.pending.length ? loop.pending.splice(0) : null;
      stepRace(R, p);
      loop.acc -= STEP; n++;
    }
  }
  handleEvents(R);
  if (R.done && !loop.ended) { loop.ended = true; loop.started = false; const L0 = loop; setTimeout(() => { if (loop === L0) onRaceEnd(); }, 1600); }
  renderer.renderRace(R, dt, { mode: loop.mode, follow: loop.mode === 'mine' ? (cur.mine >= 0 ? cur.mine : loop.sel) : loop.sel, selected: loop.sel, mine: cur.mine });
  // zvok kotaljenja
  let sp = 0, k = 0;
  for (const m of R.M) if (m.st === 'run' && m.b.grounded) { sp += Math.hypot(m.b.vx, m.b.vz); k++; }
  audio.rollAll(k ? sp / k * 0.8 : 0);
  loop.hud = (loop.hud || 0) + dt;
  if (loop.hud > 0.12) { loop.hud = 0; hud(R); }
}

/** FPS < 40 dlje časa → nižja kakovost (kot v Hrčkovi krogli). */
const fpsMeter = { t: 0, n: 0, low: 0 };
function autoQuality(raw) {
  if (!renderer || raw > 1) return;
  fpsMeter.t += raw; fpsMeter.n++;
  if (fpsMeter.t < 2) return;
  const fps = fpsMeter.n / fpsMeter.t;
  fpsMeter.t = 0; fpsMeter.n = 0;
  if (DEV) $('#hTime').title = fps.toFixed(0) + ' FPS';
  if (fps >= 40 || QS.get('q')) { fpsMeter.low = 0; return; }
  if (++fpsMeter.low < 1) return;
  const i = QUALITY_ORDER.indexOf(renderer.qualityKey);
  if (i < 0 || i >= QUALITY_ORDER.length - 1) return;
  const q = QUALITY_ORDER[i + 1];
  renderer.setQuality(q);
  if (cur?.mb) renderer.setMarbles(cur.mb.map(m => ({ name: m.name, color: m.color, color2: m.color2, pattern: m.pattern })));
  ui.toast(`Grafika: ${QUALITY[q].name} (za tekočo sliko)`, { icon: '⚙️', duration: 2200 });
}

function handleEvents(R) {
  if (!R.events.length) return;
  const evs = R.events.splice(0);
  const mb = cur.mb, C = cur.comments;
  const nm = i => mb[i]?.name || '?';
  const acc = i => mb[i]?.acc || nm(i);
  const who = by => by === ME ? null : day.accs.get(by);
  const say = (group, v, prio = 1) => { if (R.t - C.last < (prio > 1 ? 0.4 : 1.6)) return; C.last = R.t; setComment(line(group, R.step, v)); };
  for (const e of evs) {
    const m = R.M[e.m];
    switch (e.type) {
      case 'nudge': {
        const a = who(e.by);
        renderer?.nudgeFx(m.b, e.k);
        audio.play(e.k === 'help' ? 'sunek' : 'udarec');
        pushFeed(`<i class="fr-dot" style="--c:${mb[e.m].color};--c2:${mb[e.m].color2}"></i> ${esc(nudgeFeed(e.k, a ? a.name : null, acc(e.m), a?.bot?.g))}`, e.by === ME ? 'me' : 'bot');
        say(e.k === 'help' ? 'help' : 'hit', { m: nm(e.m), acc: acc(e.m), k: a ? a.name : 'ti' }, 2);
        if (e.by === ME) hud(R);
        break;
      }
      case 'bonk':
        if (R.step - C.lastBonk > 30) { audio.play('klik', e.v); C.lastBonk = R.step; renderer?.bonkFx(e.x, e.y, e.z, e.v); }
        if (e.v > 4.5 && R.t - C.last > 3) say('bonk', {});
        break;
      case 'fall': case 'stuck': {
        audio.play('padec');
        renderer?.fallFx(m.b, mb[e.m].color);
        const by = e.by && e.by.k === 'hit' ? who(e.by.by) : null;
        if (e.type === 'fall' && e.by && e.by.k === 'hit') {
          say('fallHit', { m: nm(e.m), acc: acc(e.m), k: e.by.by === ME ? 'ti' : by?.name || '?' }, 2);
          if (e.by.by === ME) cur.myHitFalls = [...(cur.myHitFalls || []), e.m];
        } else say(e.type, { m: nm(e.m) }, 2);
        if (R.order[0] === e.m && R.t > 4) setTimeout(() => setComment(line('respawnLead', 0, {})), 900);
        break;
      }
      case 'lead': {
        const o = cur.odds.win[e.m];
        if (o >= 7) say('outsider', { m: nm(e.m), o: fmtOdds(o) }, 2);
        else say('lead', { m: nm(e.m), p: nm(e.prev), pacc: acc(e.prev) });
        audio.play('mesto');
        break;
      }
      case 'pass': say('pass', { m: nm(e.m), place: e.place }); break;
      case 'finish':
        if (e.place === 1) {
          const o = cur.odds.win[e.m];
          setComment(line(o >= 7 ? 'winOutsider' : 'win', R.step, { m: nm(e.m), acc: acc(e.m), o: fmtOdds(o) }));
          C.last = R.t + 2;
          renderer?.finishFx(m.b, mb[e.m].color);
          audio.play('cilj'); audio.play('navijanje', 1);
        } else if (e.place <= 3) { audio.play('mesto'); renderer?.finishFx(m.b, mb[e.m].color); }
        break;
      case 'end':
        if (e.photo) { setComment(line('photo', R.step, {})); audio.play('navijanje', 0.8); }
        break;
      case 'spring': audio.play('spring'); break;
    }
  }
  // zadnja tretjina
  const lead = R.M[R.order[0]];
  if (!C.lastFinal && lead && lead.ms / (lead.route.len || 1) > 0.7) { C.lastFinal = true; C.last = R.t; setComment(line('final', R.step, { m: nm(R.order[0]) })); audio.play('navijanje', 0.5); }
}

function hud(R) {
  const { mb } = cur;
  $('#hRace').textContent = `${cur.def.no}/${BET.RACES} · ${cur.T.name}`;
  $('#hTime').textContent = R.t.toFixed(1).replace('.', ',') + ' s';
  $('#hBank').textContent = fmt(myAcc().bank) + ' točk';
  const st = nudgeState(R, ME);
  $('#hNudges').textContent = '⚡'.repeat(st.left) + '·'.repeat(RACE.NUDGES - st.left);
  for (const b of [$('#btnHelp'), $('#btnHit')]) {
    b.disabled = !st.ready || !loop?.started;
    b.style.setProperty('--cd', st.left > 0 && st.wait > 0 ? (st.wait / RACE.CD).toFixed(2) : 0);
  }
  const bets = myBets();
  const pos = i => R.order.indexOf(i);
  $('#list').innerHTML = R.order.map((i, p) => {
    const m = R.M[i], d = mb[i];
    const tag = m.finished ? '🏁' : m.st === 'fall' ? '💥' : '';
    const mineB = bets.some(b => b.m === i || b.vs === i);
    return `<div class="row ${mineB ? 'mine' : ''} ${loop?.sel === i ? 'sel' : ''}" data-i="${i}"><span>${p + 1}.</span><i class="fr-dot" style="--c:${d.color};--c2:${d.color2}"></i><b>${esc(d.name)}</b><small>${fmtOdds(cur.odds.win[i])}</small><em>${tag}</em></div>`;
  }).join('');
  $('#list').querySelectorAll('.row').forEach(r => r.onclick = () => select(+r.dataset.i));
  // stave v živo
  const chips = $('#hBets').querySelectorAll('[data-bet]');
  bets.forEach((b, k) => {
    const c = chips[k]; if (!c) return;
    const p = pos(b.m);
    const okNow = b.type === 'win' ? p === 0 : b.type === 'podium' ? p < 3 : p < pos(b.vs);
    c.classList.toggle('ok', okNow); c.classList.toggle('bad', !okNow);
  });
}

/* ===================================================================== */
/*  Obračun                                                              */
/* ===================================================================== */

async function onRaceEnd() {
  if (!cur || cur.phase !== 'race') return;
  cur.phase = 'after';
  const R = cur.R;
  const ord = R.order;
  const res = [];
  for (const a of day.accs.values()) {
    const bets = cur.bets.get(a.id) || [];
    const s = settle(bets, ord);
    a.bank += s.total;
    a.wonBets += s.won.length;
    a.wonWin += s.won.filter(b => b.type === 'win').length;
    const q = R.nudgers.get(a.id);
    const used = q ? RACE.NUDGES - q.left : 0;
    a.nudges += used;
    a.history.push({ no: cur.def.no, net: s.total - s.staked });
    res.push({ a, s, used });
  }
  const meRes = res.find(r => r.a.me);
  // dosežki in naloge (dirka)
  const won = meRes.s.won;
  for (const b of won) hub.reportEvent('frnikole:kvota', b.odds);
  if (won.some(b => b.odds >= 8)) unlock('outsider');
  if (won.length >= 3) unlock('trojna');
  if (R.photo && won.length) unlock('foto');
  if ((cur.myHitFalls || []).includes(cur.odds.fav) && cur.mine >= 0 && ord[0] === cur.mine) unlock('saboter');
  if (won.length) audio.play('zmaga'); else if (myBets().length) audio.play('poraz');
  loop = null;
  renderAfter(res);
}

function renderAfter(res) {
  show('after');
  const R = cur.R, { mb } = cur;
  const ord = R.order;
  const dot = i => `<i class="fr-dot" style="--c:${mb[i].color};--c2:${mb[i].color2}"></i>`;
  const t = i => R.M[i].finishT != null ? R.M[i].finishT.toFixed(2).replace('.', ',') + ' s' : 'ni v cilju';
  const last = day.idx >= BET.RACES - 1;
  const me = res.find(r => r.a.me);
  const sorted = [...day.accs.values()].sort((a, b) => b.bank - a.bank);
  $('#after').innerHTML = `
    <div class="mg-card mg-card--glow">
      <div class="mg-small mg-muted">Dirka ${cur.def.no}/${BET.RACES} · ${esc(cur.T.name)}${R.photo ? ' · 📸 foto finiš' : ''}</div>
      <div class="fr-podium">${[1, 0, 2].map(p => ord[p] != null ? `<div class="fr-pod fr-pod--${p + 1}">${dot(ord[p])}<b>${esc(mb[ord[p]].name)}</b><small>${t(ord[p])} · kvota ${fmtOdds(cur.odds.win[ord[p]])}</small><div class="fr-pod__block">${p + 1}</div></div>` : '').join('')}</div>
      <ol class="fr-order" start="4">${ord.slice(3).map(i => `<li>${dot(i)} ${esc(mb[i].name)} <small>${t(i)}${R.M[i].falls ? ' · padci: ' + R.M[i].falls : ''}</small></li>`).join('')}</ol>
    </div>
    <div class="fr-cards">
      <div class="mg-card">
        <h2 class="mg-title">Tvoje stave</h2>
        ${me.s.won.length + me.s.lost.length ? [...me.s.won, ...me.s.lost].map(b => `<div class="fr-res ${b.pay ? 'ok' : 'bad'}">${dot(b.m)} ${esc(betLabel(b, names(), insts()))} · ${fmt(b.stake)} × ${fmtOdds(b.odds)} → <b>${b.pay ? '+' + fmt(b.pay) : '0'}</b></div>`).join('') : '<p class="mg-muted">Brez stave.</p>'}
        <p>Kupček: <b>${fmt(me.a.bank)} točk</b> · sunki: ${me.used}/${RACE.NUDGES}</p>
      </div>
      <div class="mg-card">
        <h2 class="mg-title">Stanje dneva</h2>
        <table class="mg-table"><tbody>${sorted.map((a, k) => `<tr class="${a.me ? 'mg-me' : ''}"><td class="mg-rank">${k + 1}.</td>
          <td>${a.me ? ui.who(hub.profile || { nickname: a.name }) : `${a.bot.emoji} ${esc(a.name)} <small class="mg-muted">${PERSONAS[a.bot.persona].icon} ${esc(PERSONAS[a.bot.persona].name)}</small>`}</td>
          <td class="mg-num">${fmt(a.bank)}${a.loan ? ' <small title="posojilo">🏦</small>' : ''}</td>
          <td class="mg-num ${(res.find(r => r.a === a).s.total - res.find(r => r.a === a).s.staked) >= 0 ? 'fr-up' : 'fr-down'}">${signed(res.find(r => r.a === a).s.total - res.find(r => r.a === a).s.staked)}</td></tr>`).join('')}</tbody></table>
      </div>
    </div>
    <div class="fr-row fr-center"><button class="mg-btn mg-btn--primary mg-btn--big" id="next">${last ? 'Konec dneva' : `Naslednja dirka (${cur.def.no + 1}/${BET.RACES})`}</button></div>`;
  $('#next').onclick = () => { if (last) endDay(); else { day.idx++; prepareRace(); } };
  if (FAST && QS.has('auto')) setTimeout(() => $('#next')?.click(), 50);
}
const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v));

async function endDay() {
  const accs = [...day.accs.values()].map(a => ({ a, score: finalScore(a) })).sort((x, y) => y.score - x.score);
  const me = accs.find(x => x.a.me);
  const won = accs[0] === me;
  const score = me.score;
  const xp = Math.min(80, 20 + 10 * me.a.wonWin);
  const daily = day.daily && day.first;
  if (daily) {
    S.save(dailyKey(), { started: true, score });
    await hub.submitScore(score, { seed: hub.dailySeed(), meta: { bots: day.plan.bots.length, nudges: me.a.nudges } }).catch(e => console.warn(e));
  }
  hub.reportGame({ won, players: accs.length, score, daily }).catch(e => console.warn(e));
  hub.awardXp(xp, 'frnikole').catch(() => {});
  hub.reportEvent('frnikole:tocke', score);
  if (me.a.wonBets) hub.reportEvent('frnikole:stava', 1, { times: Math.min(100, me.a.wonBets) });
  if (score >= 5000) unlock('milijonar');
  if (won && me.a.nudges === 0) unlock('brez-sunka');
  const prof = hub.profile || {};
  const list = accs.map(x => x.a.me
    ? { id: hub.userId, nickname: prof.nickname || 'Ti', avatar: prof.avatar, equipped: prof.equipped, scoreText: fmt(x.score) + ' točk', xp }
    : { id: x.a.id, nickname: x.a.name, avatar: { emoji: x.a.bot.emoji, color: '#3a3f66' }, scoreText: fmt(x.score) + ' točk' });
  const note = me.a.loan ? `<p class="mg-center mg-small mg-muted">🏦 Posojilo ${BET.LOAN} točk je vrnjeno (odšteto od kupčka).</p>` : '';
  const extra = `${note}<p class="mg-center mg-small mg-muted">${daily ? 'Rezultat je na dnevni lestvici.' : day.daily ? 'Trening — rezultat ne šteje za lestvico.' : 'Prosta igra — brez lestvice.'} Zadete stave: ${me.a.wonBets} · sunki: ${me.a.nudges}</p>`;
  const v = await ui.results(list, { title: won ? 'Zmaga dneva! 🏆' : 'Konec Dirkalnega dne', again: day.daily ? 'Nazaj v meni' : 'Nova prosta igra', extraHtml: extra });
  const mode = day.mode;
  day = null; cur = null;
  if (v === 'again' && mode === 'free') startDay('free'); else showMenu();
}

main();
