/* =====================================================================
   SMUČARSKI SKOKI — game.js: meni, stanja igre (zaletno mesto, skok,
   počasni posnetek, rezultat, replay, pavza), trening z ghosti, rekord
   skakalnice (3 skoki, najboljši na lestvico), hub (lestvice, ghosti, XP,
   dosežki, naloge), namigi, komentator, zvok; dnevni izziv; odklepanje
   skakalnic; »motor skoka« za tekmo (match.js): skok človeka, bota ali
   gledanje toka vnosov v živo.
   Razvojni parametri: ?hill=<id> ?debug=1 ?bot=0.7 ?q=low|med|high ?offline=1
   ?tv=1 ?bots=9 ?fast=1 ?room=KODA (tekma, glej match.js)
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
import { resultOf, dailyPick, DAILY_TRIES, msToMidnight, isOpen, unlocksBy, unlockKey, unlockText } from './contest.js';
import { flagOf } from './jumpers.js';

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
  // 2. faza: tekma, letalnica, Luna, dnevni izziv
  { key: 'zmaga', title: 'Zmaga', icon: '🥇', desc: 'Prva zmaga na tekmi' },
  { key: 'deset', title: 'Deseterica', icon: '🔟', desc: 'Zmaga na tekmi z 10 ljudmi' },
  { key: 'obrat', title: 'Obrat', icon: '🔄', desc: 'Zmaga iz 4. mesta ali nižje po 1. seriji' },
  { key: 'letalec', title: 'Letalec', icon: '🦅', desc: 'Skok čez 200 m' },
  { key: 'orlovo-gnezdo', title: 'Orlovo gnezdo', icon: '🪺', desc: 'Čez HS na letalnici brez padca' },
  { key: 'luna', title: 'Mali korak', icon: '🌕', desc: 'Skok na Luni' },
  { key: 'zirija', title: 'Žirija!', icon: '🚩', desc: 'Skok, po katerem je žirija znižala zalet' },
  { key: 'dnevni-7', title: 'Teden izzivov', icon: '📅', desc: 'Dnevni izziv 7 dni zapored' },
  { key: 'zvoncek', title: 'Kravji zvonec', icon: '🔔', desc: 'Pošlji 100 reakcij' },
  // prave skakalnice
  { key: 'prava-k', title: 'Prava K-točka', icon: '📐', desc: 'Čez K na pravi skakalnici brez padca' },
  { key: 'rekord-skakalnice', title: 'Rekord skakalnice', icon: '🏆', desc: 'Daljše od pravega rekorda skakalnice, brez padca' },
  { key: 'vse-letalnice', title: 'Vse letalnice', icon: '🛫', desc: 'Čez K na vseh letalnicah' },
  { key: 'popotnik', title: 'Popotnik', icon: '🧳', desc: 'Skok na vseh pravih skakalnicah' },
];
// odklepi skakalnic so dosežki (veljajo na vseh napravah): odklep-<id>
const achDef = k => ACH.find(a => a.key === k) || (k.startsWith('odklep-') ? { key: k, title: 'Odklenjena: ' + (hillOf(k.slice(7))?.def.name || k.slice(7)), icon: '🔓' } : { key: k, title: k, icon: '🏅' });
// že odklenjeni (brez ponovnih vpisov → 409 v konzoli na Supabase)
const unlocked = new Set();
const unlock = k => { if (unlocked.has(k)) return; unlocked.add(k); return hub.unlock(k, { title: achDef(k).title, icon: achDef(k).icon }); };
/** Ali je skakalnica odprta za tega igralca. */
const hillOpen = id => { const h = hillOf(id); return !!h && isOpen(h.def, unlocked); };

/* ------------------------------------------------------------ nastavitve in statistika */
const DEF_SETTINGS = { quality: 'auto', sound: true, music: true, post: true, fps: false, tilt: false, wind: 'random', windSpeed: 1, ghostMine: true };
const settings = { ...DEF_SETTINGS, ...S.load('skoki:settings', {}) };
const saveSettings = () => S.save('skoki:settings', settings);
const stats = S.load('skoki:stats', { jumps: 0, falls: 0, overK: {}, hints: 0 });
const saveStats = () => S.save('skoki:stats', stats);
// lokalni najboljši skok (ghost) na skakalnico — vezan na profil, da si ga dva profila v istem brskalniku ne delita
const bestKey = id => 'skoki:best:' + (hub.userId || 'anon') + ':' + id;
// šteje le »Rekord skakalnice« (trening ne postavlja rekordov); rekord iz starejše fizike (paramsVersion) ne velja
// rekord = najdaljši skok brez padca (v metrih); enako dolge skoke loči točkovanje
const better = (a, b) => !b || a.dist > b.dist || (a.dist === b.dist && a.total > b.total);
const BOARD_SEED = id => 'rekord:' + id;
const localBest = id => { const b = S.load(bestKey(id), null); return b && b.pv === P?.paramsVersion ? b : null; };

/* ------------------------------------------------------------ globalno */
let P = null;             // parametri fizike
let HILLS = [];           // [{ def, hill }]
let GROUPS = [];          // skupine v meniju (hills/index.json → groups), privzeto »trening«
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
  GROUPS = Array.isArray(idx.groups) && idx.groups.length ? idx.groups : [{ id: 'trening', name: 'Trening' }];
  const defs = await Promise.all(idx.hills.map(async f => (await fetch(new URL('hills/' + f, base), { cache: 'no-cache' })).json()));
  HILLS = [];
  for (const def of defs) {
    const errs = validateHill(def);
    // neznan parameter fizike (npr. nova skakalnica s staro, predpomnjeno kodo) le opozori — skakalnica ostane v meniju
    const hard = errs.filter(e => !/^physics\.[a-zA-Z]+: neznan parameter/.test(e));
    if (errs.length) console.warn('Skakalnica ' + def.id + ':', errs);
    if (hard.length) continue;
    if (!def.group) def.group = 'trening';
    HILLS.push({ def, hill: buildHill(def) });
  }
}

/* ===================================================================== */
/*  Meni                                                                 */
/* ===================================================================== */

function showMenu() {
  G.state = 'menu';
  if (G.ext && !G.ext.done) engine.abort();
  G.ext = null;
  matchApi?.onMenu?.();
  clearInterval(dailyTimer);
  document.body.classList.remove('sk-playing');
  $('#play').classList.add('mg-hidden');
  $('#menu').classList.remove('mg-hidden');
  if (settings.music) audio.menuMusic(true);
  audio.silence(); audio.setLoops(false);
  renderMenu();
}

const THEME_COLORS = { brezova: ['#3f7a5c', '#10261d'], bistra: ['#2f78d0', '#0d2140'], orlova: ['#a0524a', '#1c1838'], zajcek: ['#e58fb5', '#3a2040'], sipina: ['#d4a04f', '#3b2410'], reflektor: ['#3b4fa8', '#05081c'], 'orlovo-gnezdo': ['#4f8f6a', '#13283a'], 'mirno-morje': ['#6c6c78', '#050508'] };

// prave skakalnice: koda države (real.country) → zastava iz jumpers.js; kraj v mestniku (»v Planici«)
const COUNTRY_FLAG = { SLO: 'si', AUT: 'at', GER: 'de', POL: 'pl', FIN: 'fi', SUI: 'ch', NOR: 'no', ITA: 'it', CZE: 'cz', JPN: 'jp' };
const LOCATIVE = { Planica: 'Planici', Zakopane: 'Zakopanah', 'Tauplitz / Bad Mitterndorf': 'Tauplitzu / Bad Mitterndorfu', Garmisch: 'Garmischu',
  'Garmisch-Partenkirchen': 'Garmisch-Partenkirchnu', Oberstdorf: 'Oberstdorfu', Innsbruck: 'Innsbrucku', Bischofshofen: 'Bischofshofnu',
  Willingen: 'Willingenu', Lahti: 'Lahtiju', Engelberg: 'Engelbergu', Vikersund: 'Vikersundu' };
const locative = v => LOCATIVE[v] || v;

function renderMenu() {
  if (!G.hillId || !hillOpen(G.hillId)) G.hillId = (hillOf('bistra') ? 'bistra' : HILLS[0].def.id);
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
      <div class="sk-modes sk-modes--4">
        <button class="sk-modecard" id="mOnline"><span>🏆</span><b>Tekma</b><em>2–10 prijateljev, vsak s svojega zaslona, replay v živo</em></button>
        <button class="sk-modecard" id="mLocal"><span>🖥️</span><b>Lokalna tekma</b><em>Tvoji skakalci na eni napravi, tudi brez povezave</em></button>
        <button class="sk-modecard" id="mDaily"><span>📅</span><b>Dnevni izziv</b><em>${esc(dailyLine())}</em></button>
        <button class="sk-modecard" id="mJumpers"><span>🎽</span><b>Moji skakalci</b><em>Sestavi svojo ekipo, statistika tvoje lige</em></button>
      </div>
      ${GROUPS.map(gr => {
        const list = HILLS.filter(h => (h.def.group || 'trening') === gr.id);
        if (!list.length) return '';
        const nOpen = list.filter(h => isOpen(h.def, unlocked)).length;
        const closed = (settings.groupsClosed || []).includes(gr.id) && !list.some(h => h.def.id === H.id);
        return `<details class="sk-groupbox" data-group="${gr.id}" ${closed ? '' : 'open'}>
        <summary class="sk-group"><span class="mg-title">${esc(gr.name)}</span> <span class="mg-muted mg-small">${nOpen}/${list.length} odprtih${gr.desc ? ' · ' + esc(gr.desc) : ''}</span></summary>
        <div class="sk-hills" role="list">${list.map(({ def }) => {
        const b = localBest(def.id);
        const open = isOpen(def, unlocked);
        const [c1, c2] = THEME_COLORS[def.id] || [def.theme?.sky?.zenith || '#24356e', '#0f1530'];
        const R = def.real;
        return `<button class="sk-hillcard ${open ? '' : 'locked'} ${R ? 'sk-hillcard--real' : ''}" role="listitem" data-hill="${def.id}" aria-pressed="${def.id === H.id}" style="--c1:${c1};--c2:${c2}">
          <span class="kh">${R ? `<span class="sk-flag" aria-label="${esc(R.country)}">${flagOf(COUNTRY_FLAG[R.country])}</span> ` : ''}K${def.k} · HS${def.hs}${def.size === 'letalnica' ? ' · letalnica' : ''}</span><b>${open ? '' : '🔒 '}${esc(def.name)}</b><span class="desc">${esc(open ? def.desc || '' : unlockText(def, HILLS.map(x => x.def)))}</span>
          ${R ? `<span class="sk-real">${R.record ? `Rekord skakalnice: ${fmtDist(R.record.dist)} (${R.record.year})<br>` : ''}po profilu skakalnice v ${esc(locative(R.venue))} (certifikat ${R.certYear})</span>` : ''}
          <span class="pb">${b ? '🏅 Moj rekord: ' + fmtDist(b.dist) + ' · ' + fmt1(b.total) + ' t' : ''}</span></button>`;
      }).join('')}</div></details>`;
      }).join('')}
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
          <p class="sk-note">Trije skoki s privzetega zaletnega mesta (${H.gates.default}) in z naključnim vetrom. Šteje <b>najdaljši skok brez padca</b> (v metrih; enako dolge loči točkovanje), ki gre na lestvico ${esc(H.name)}.</p>
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
  $('#menu').querySelectorAll('[data-hill]').forEach(b => b.onclick = () => {
    audio.unlock();
    if (!hillOpen(b.dataset.hill)) { ui.toast(unlockText(hillOf(b.dataset.hill).def, HILLS.map(x => x.def)), { icon: '🔒' }); return; }
    G.hillId = b.dataset.hill; renderMenu();
  });
  $('#menu').querySelectorAll('details[data-group]').forEach(d => d.addEventListener('toggle', () => {
    const set = new Set(settings.groupsClosed || []);
    if (d.open) set.delete(d.dataset.group); else set.add(d.dataset.group);
    settings.groupsClosed = [...set]; saveSettings();
  }));
  $('#mOnline').onclick = () => { audio.unlock(); matchApi?.openOnline(); };
  $('#mLocal').onclick = () => { audio.unlock(); matchApi?.openLocal(); };
  $('#mJumpers').onclick = () => { audio.unlock(); matchApi?.openJumpers(); };
  $('#mDaily').onclick = () => { audio.unlock(); startDaily(); };
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
  const seed = BOARD_SEED(H.id);
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
  G.ext = null;
  G.hillId = hillId; G.mode = mode;
  G.record = mode === 'record' ? { tries: [], best: null } : null;
  await enterPlay(hillId, { theme: mode === 'daily' ? G.daily?.theme : null });
  $('#hudMode').textContent = mode === 'record' ? 'Rekord skakalnice' : mode === 'daily' ? 'Dnevni izziv' : 'Trening';
  $('#barWho').innerHTML = hub.profile ? ui.who(hub.profile) : '';
  G.hintsOn = (stats.hints || 0) < 3;
  newJump();
}

/** Teme za pogoje dneva (noč, sneženje) — kopija skakalnice z drugačno temo za izris. */
function themedHill(H, theme) {
  if (!theme) return H.hill;
  const key = H.def.id + ':' + theme.id;
  if (!themedHill.cache) themedHill.cache = new Map();
  if (!themedHill.cache.has(key)) themedHill.cache.set(key, { ...H.hill, def: { ...H.def, theme } });
  return themedHill.cache.get(key);
}

/** Pokaži igralno površino s skakalnico (brez skoka). */
async function enterPlay(hillId, { skin = null, theme = null } = {}) {
  const H = hillOf(hillId);
  G.hillId = hillId;
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
  const hv = themedHill(H, theme);
  if (renderer.hill !== hv) renderer.load(hv, skin || DEFAULT_SKIN);
  else renderer.setSkin(skin || DEFAULT_SKIN);
  renderer.resize();
  $('#loader').classList.add('mg-hidden');
  $('#hudHill').textContent = `${H.def.name} · K${H.def.k}`;
  if (!loopOn) { loopOn = true; last = performance.now(); requestAnimationFrame(loop); }
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
  if (G.mode === 'daily') for (const o of G.daily.ghosts || []) if (o.on) list.push(o);
  const mods = G.mode === 'daily' ? G.daily.mods : null;
  return list.map(o => { const r = ghostJump(o.g, H.hill, P, 0, mods); return { ...o, J: r.J, input: r.input, snap: gateSnapshot(H.hill, o.g.gate) }; });
}

function newJump() {
  const H = hillOf(G.hillId);
  const X = G.ext;
  hideResult();
  if (X) G.gate = X.gate;
  else if (G.mode === 'daily') G.gate = G.daily.gate;
  else G.gate = G.mode === 'record' ? H.def.gates.default : (G.trainGate?.[H.def.id] ?? H.def.gates.default);
  G.wind = X ? X.wind : G.mode === 'daily' ? G.daily.wind : windForJump();
  G.mods = X ? X.mods || null : G.mode === 'daily' ? G.daily.mods : null;
  G.windObj = createWind(H.def.physics?.noAir ? { mode: 'off', seed: 0 } : G.wind, G.mods?.gust ? { ...P, wind: { ...P.wind, gustAmp: P.wind.gustAmp * G.mods.gust } } : P);
  G.J = createJump({ hill: H.hill, P, gate: G.gate, wind: G.wind, record: DEBUG ? 2 : 0, mods: G.mods });
  G.rec = new InputRecorder();
  G.hist = [];
  G.ghosts = X ? [] : prepGhosts(H);
  G.slow = null; G.replay = null; G.landShown = false; G.flags = {}; G.stall = false;
  G.stream = X?.source === 'stream' ? X.stream : null;
  G.bot = X ? (X.source === 'bot' ? createBot(X.bot) : null) : BOT_SKILL != null ? createBot({ skill: BOT_SKILL, seed: (Math.random() * 1e9) >>> 0 }) : null;
  renderer.setGate(G.gate);
  renderer.setGhosts(G.ghosts.length);
  const rec = X ? X.recordLine || 0 : Math.max(localBest(H.def.id)?.dist || 0, ...G.ghosts.map(g => g.g.dist));
  renderer.setRecord(rec || null);
  $('#barRec').textContent = rec ? fmtDist(rec) : '—';
  $('#barRecLbl').textContent = X ? (X.recordLabel || 'Vodilni') : G.ghosts.length ? 'Rekord / ghost' : 'Rekord';
  if (X) { $('#hudMode').textContent = X.label || 'Tekma'; $('#barWho').innerHTML = X.whoHtml || esc(X.who?.name || ''); }
  $('#hudGhost').classList.toggle('mg-hidden', !G.ghosts.length);
  $('#hudGhost').textContent = '👻 ' + G.ghosts.map(g => g.name).join(', ');
  $('#barGate').textContent = G.gate;
  $('#barSpeed').textContent = '—';
  $('#big').classList.add('mg-hidden');
  $('#comment').classList.add('mg-hidden');
  $('#lean').classList.add('mg-hidden');
  $('#replayBar').classList.add('mg-hidden');
  if (G.record) $('#hudMode').textContent = `Rekord skakalnice · skok ${G.record.tries.length + 1}/3`;
  if (G.mode === 'daily' && !X) $('#hudMode').textContent = dailyHud();
  input.reset(); input.mode = 'gate'; input.resetPitch(0);
  G.state = 'gate'; G.gateT = 0; G.view = gateSnapshot(H.hill, G.gate); G.view.snap = true;
  renderer.setCheer(0.1);
  showLight(!G.stream);
  if (G.stream) hint('Čakam na skok …');
  clock.reset();
  dbgHook?.onNewJump?.();
}

/* ---------------- semafor */
const RED_TIME = 1.2, GATE_TIME = 10;
function showLight(on) { $('#light').classList.toggle('mg-hidden', !on); }
function updateGate(dt) {
  // gledalec: ni semaforja, skok se začne, ko je v vmesnem pomnilniku dovolj vnosov
  if (G.stream) {
    const a = G.stream.advance(0);
    if (!a.waiting) { G.state = 'jump'; input.mode = 'other'; hint(''); audio.whoosh(); G.ext?.onStart?.(); }
    return;
  }
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
  if (green && G.bot && G.gateT > RED_TIME + (G.ext ? 0.9 : 0.6)) startJump();
  // tekma: 10 s po zeleni luči za štart, sicer diskvalifikacija (ali »preskoči« v sproščenem načinu)
  if (green && G.ext && !G.bot && G.ext.startLimit && G.gateT - RED_TIME > GATE_TIME) { extFinish({ status: G.ext.relaxed ? 'skip' : 'dsq' }); return; }
  if (G.hintsOn) hint(green ? (IS_TOUCH ? 'Tapni za štart' : 'Klikni za štart') : 'Pripravi se …');
}

function startJump() {
  if (G.state !== 'gate' || G.gateT < RED_TIME || G.stream) return;
  if (G.mode === 'daily' && !G.ext) dailyUseTry();
  G.ext?.onStart?.();
  showLight(false);
  G.state = 'jump';
  input.mode = 'inrun';
  clock.reset();
  audio.whoosh();
}

/* ---------------- tick simulacije */
function tick() {
  const J = G.J, s = J.s;
  let inp;
  if (G.stream) {
    const v = G.stream.inputAt(s.tick);
    if (!v && !G.stream.ready(s.tick)) { G.stall = true; return false; }   // ni še vnosa: počakaj, ne ugibaj
    G.stall = false;
    inp = v ? { btn: v[0], pitch: v[1] / 2 } : { btn: 0, pitch: 0 };
  } else inp = G.bot ? G.bot.input(s) : input.sample();
  G.rec.push(s.tick, inp);
  if (G.ext?.onInput && !G.stream) G.ext.onInput(s.tick, [inp.btn >= 2 ? 2 : inp.btn ? 1 : 0, Math.round(inp.pitch * 2)]);
  J.step(inp);
  for (const e of J.ev) onEvent(e);
  J.ev.length = 0;
  G.hist.push(snapshot(s, P));
  for (const gh of G.ghosts) {
    if (!gh.J.done) { gh.J.step(gh.input(gh.J.s, gh.J.s.tick)); gh.J.ev.length = 0; }
    gh.snap = snapshot(gh.J.s, P);
  }
  if (!G.bot && !G.stream) input.mode = s.phase === 'inrun' ? 'inrun' : s.phase === 'air' ? 'air' : 'other';
  return true;
}

function onEvent(e) {
  const H = hillOf(G.hillId).def;
  const s = G.J.s;
  switch (e.type) {
    case 'takeoff': {
      if (!G.bot && !G.stream) input.resetPitch(0);
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
      if (!reducedMotion() && !G.stream && !G.ext?.noSlowmo && L.dist >= H.k && L.kind !== 'fall' && G.hist.length > TPS) {
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

/** Skok pod nadzorom tekme je končan (ali diskvalificiran/preskočen): vrni rezultat klicatelju (match.js). */
function extFinish(out) {
  const X = G.ext;
  if (!X || X.done) return;
  X.done = true;
  showLight(false); hint('');
  G.state = 'result';
  X.resolve({ status: 'ok', ...out, changes: G.stream ? G.stream.full() : G.rec.changes, hist: G.hist });
}

/** Statistika, naloge, dosežki in odklepi za MOJ skok (trening, rekord, dnevni, tekma). */
function myJumpProgress(Hd, s, L, res, judges) {
  stats.jumps = (stats.jumps || 0) + 1;
  if (res.fall) stats.falls = (stats.falls || 0) + 1;
  else if (G.hintsOn) { stats.hints = (stats.hints || 0) + 1; if (stats.hints >= 3) G.hintsOn = false; }
  if (!res.fall && L.dist >= Hd.k) stats.overK = { ...(stats.overK || {}), [Hd.id]: true };
  saveStats();
  if (!res.fall) hub.reportEvent('skoki:skok', 1);
  if (L.dist >= Hd.k) hub.reportEvent('skoki:k', 1);
  if (!res.fall && L.dist >= Hd.hs) hub.reportEvent('skoki:hs', 1);
  hub.reportEvent('skoki:tocke', Math.round(res.total));
  if (L.type === 'tele') hub.reportEvent('skoki:telemark', 1);
  if (Hd.k >= 170 && L.dist >= Hd.k) hub.reportEvent('skoki:letalnica', 1);
  const ach = ['prvi-skok'];
  if (L.dist >= Hd.k) ach.push('k-tocka');
  if (!res.fall && L.dist >= Hd.hs) ach.push('hs');
  if (s.takeoff?.perfect) ach.push('popoln-odriv');
  if (judges.filter(j => j >= 19).length >= 4) ach.push('telemark-19');
  if (res.fall) ach.push('snezni-angel');
  if (['brezova', 'bistra', 'orlova'].every(id => stats.overK?.[id])) ach.push('vse-tri');
  if (!res.fall && L.dist < Hd.k / 2) ach.push('zavora');
  if (!res.fall && L.dist >= Hd.k && L.windAvg <= -2) ach.push('veter-v-hrbet');
  if (stats.jumps >= 100) ach.push('stotica');
  if (L.dist >= 200) ach.push('letalec');
  if (Hd.k >= 170 && !res.fall && L.dist >= Hd.hs) ach.push('orlovo-gnezdo');
  if (Hd.physics?.noAir) ach.push('luna');
  // prave skakalnice
  if (Hd.group === 'prave') {
    stats.visited = { ...(stats.visited || {}), [Hd.id]: true }; saveStats();
    if (!res.fall && L.dist >= Hd.k) ach.push('prava-k');
    if (!res.fall && Hd.real?.record && L.dist > Hd.real.record.dist) ach.push('rekord-skakalnice');
    const real = HILLS.filter(h => h.def.group === 'prave').map(h => h.def.id);
    if (real.length && real.every(id => stats.visited[id])) ach.push('popotnik');
  }
  const flying = HILLS.filter(h => h.def.size === 'letalnica').map(h => h.def.id);
  if (flying.length && flying.every(id => stats.overK?.[id])) ach.push('vse-letalnice');
  // odklepi skakalnic (več hkrati = en toast)
  const fresh = unlocksBy(HILLS.map(h => h.def), { hill: Hd, dist: L.dist, fall: res.fall }).filter(d => !unlocked.has(unlockKey(d.id)));
  for (const d of fresh) ach.push(unlockKey(d.id));
  if (fresh.length) setTimeout(() => ui.toast(fresh.length === 1 ? 'Odklenjena skakalnica: ' + fresh[0].name : `Odklenjenih ${fresh.length} skakalnic: ${fresh.map(d => d.name).join(', ')}`, { icon: '🔓', duration: 5000 }), 1500);
  for (const k of ach) unlock(k);
}

async function finishJump() {
  const Hd = hillOf(G.hillId).def;
  const s = G.J.s, L = s.landing;
  if (G.ext) {
    const X = G.ext;
    const res = resultOf(s, Hd, P, { gate: G.gate, refGate: X.refGate, judgeSeed: X.judgeSeed, teleOnly: !!X.teleOnly });
    G.lastJump = { res, changes: G.stream ? G.stream.full() : G.rec.changes, wind: G.wind, gate: G.gate, hill: Hd.id, hist: G.hist, s: structuredClone(s) };
    if (X.mine) myJumpProgress(Hd, s, L, res, res.judges);
    if (!G.landShown) showBig();
    await sleep(X.holdMs ?? 900);
    extFinish({ res });
    return;
  }
  let res;
  if (G.mode === 'daily') res = resultOf(s, Hd, P, { gate: G.gate, refGate: G.daily.refGate, judgeSeed: (G.wind.seed ^ s.tick) >>> 0, teleOnly: !!G.daily.cond.mods.teleOnly });
  else res = scoreJump(Hd, { dist: L.dist, judges: judgeScores(s, P, (G.wind.seed ^ s.tick) >>> 0), wind: L.windAvg, gate: G.gate });
  const judges = res.judges;
  res.type = L.type; res.fall = L.type === 'fall'; res.speed = s.tableSpeed; res.takeoff = s.takeoff;
  const jump = { hill: Hd.id, dist: L.dist, total: res.total, fall: res.fall, mode: G.mode };
  G.session.jumps.push(jump);
  const ghostData = encodeGhost({ pv: P.paramsVersion, hill: Hd.id, gate: G.gate, wind: G.wind, changes: G.rec.changes, ticks: G.rec.ticks, dist: L.dist, total: res.total });
  G.lastJump = { res, ghost: ghostData, changes: G.rec.changes, wind: G.wind, gate: G.gate, hill: Hd.id, hist: G.hist, trace: G.J.trace, s: structuredClone(s) };
  G.state = 'result';
  if (!G.landShown) showBig();

  // lokalni najboljši skok (ghost) — po točkah, le v »Rekordu skakalnice« (trening ne šteje)
  const prev = localBest(Hd.id);
  const isPb = G.mode === 'record' && !res.fall && better(res, prev);
  if (isPb && ghostData.length < GHOST_MAX) S.save(bestKey(Hd.id), { total: res.total, dist: L.dist, data: ghostData, pv: P.paramsVersion, at: Date.now() });

  myJumpProgress(Hd, s, L, res, judges);

  // XP za skok čez HS (enkrat na skakalnico na sejo)
  if (!res.fall && L.dist >= Hd.hs && !G.session.xpHs[Hd.id]) { G.session.xpHs[Hd.id] = true; hub.awardXp(10, 'skoki: čez HS'); }

  if (G.mode === 'daily') await dailyAfterJump(res, ghostData);
  else if (G.mode === 'record') {
    G.record.tries.push({ ...res, ghost: ghostData });
    if (!res.fall && better(res, G.record.best)) { G.record.best = { ...res, ghost: ghostData }; G.record.bestIdx = G.record.tries.length - 1; }
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
  const seed = BOARD_SEED(Hd.id);
  if (!best) {   // vsi trije skoki s padcem: ni veljavnega rekorda
    hub.reportGame({ won: false, players: 1, score: 0, daily: false });
    G.lastReport = Date.now();
    hub.awardXp(15, 'skoki: rekord skakalnice');
    G.record.done = { xp: 15, none: true };
    return;
  }
  const prevBest = await hub.getMyBest({ seed });
  const enc = encodeBoard(best.total, best.dist);
  await hub.submitScore(enc, { seed, meta: { dist: best.dist, wind: best.wind, gate: best.gate, style: best.style, total: best.total } });
  await hub.saveGhost({ level: Hd.id, timeMs: enc, data: best.ghost, order: 'desc' });
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
  const mine = G.session.jumps.filter(j => j.hill === G.hillId).map(j => j.dist).sort((a, b) => b - a);
  const r = mine.indexOf(res.dist) + 1;
  return `${r}. od ${mine.length} ${mine.length === 1 ? 'skoka' : 'skokov'} v seji`;
}

function showResult(res, isPb) {
  const Hd = hillOf(G.hillId).def;
  const el = $('#card');
  $('#big').classList.add('mg-hidden');
  const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  const rec = G.record;
  const tries = rec ? `<div class="sk-tries">${rec.tries.map((t, i) => `<span class="${i === rec.bestIdx ? 'best' : ''}">${i + 1}. ${fmtDist(t.dist)} · ${fmt1(t.total)} t</span>`).join('')}</div>` : '';
  const done = rec?.done;
  el.innerHTML = `
    <div class="sk-card__head"><b>${esc(Hd.name)} · K${Hd.k}</b><span>${G.mode === 'record' ? `Skok ${rec.tries.length}/3` : G.mode === 'daily' ? esc(G.daily.cond.icon + ' ' + G.daily.cond.name) : 'Trening'}</span></div>
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
    ${G.mode === 'daily' ? dailyCardLine() : ''}
    ${done ? (done.none ? `<div class="sk-card__rank">🏁 Vsi trije skoki s padcem — ni veljavnega rekorda. +${done.xp} XP</div>` : `<div class="sk-card__rank">🏁 Rekord: <b>${fmtDist(rec.best.dist)}</b> (${fmt1(rec.best.total)} t) → lestvica. ${done.newPb ? '<b style="color:var(--mg-green)">Nov osebni rekord!</b>' : ''} +${done.xp} XP</div>`) : ''}
    <div class="sk-card__btns">
      ${rec && done ? `<button class="mg-btn mg-btn--pink" data-a="again">Nov poskus (R)</button>` : `<button class="mg-btn mg-btn--primary" data-a="next">${rec ? 'Naslednji skok' : 'Nov skok'} (R)</button>`}
      <button class="mg-btn" data-a="replay">Replay (Enter)</button>
      ${G.mode === 'daily' ? '<button class="mg-btn mg-btn--ghost" data-a="daily">Lestvica dneva</button>' : ''}
      <button class="mg-btn mg-btn--ghost" data-a="menu">Meni</button>
    </div>`;
  el.classList.remove('mg-hidden');
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = e => { e.stopPropagation(); action(b.dataset.a); });
}
function dailyCardLine() {
  const st = dailyState();
  const left = DAILY_TRIES - st.used;
  return `<div class="sk-card__rank">📅 Najboljši danes: <b>${st.best ? fmt1(st.best.total) + ' t' : '—'}</b> · ${left > 0 ? 'ostali poskusi: ' + left : st.reported ? 'izziv opravljen (+20 XP) — naprej je trening' : 'poskusi porabljeni'}</div>`;
}
function hideResult() { $('#card').classList.add('mg-hidden'); }

function action(a) {
  audio.unlock();
  if (a === 'next') newJump();
  else if (a === 'again') { G.record = { tries: [], best: null }; newJump(); }
  else if (a === 'replay') startReplay();
  else if (a === 'menu') { hideResult(); showMenu(); }
  else if (a === 'daily') { hideResult(); startDaily(); }
}

/* ===================================================================== */
/*  Dnevni izziv                                                         */
/* ===================================================================== */

const dailyKey = () => 'skoki:daily:' + (hub.userId || 'anon');
const dailyLevel = day => 'd-' + day.replace(/-/g, '');
function dailyConfig() {
  const day = hub.dailySeed();
  if (G.daily?.seed === day) return G.daily;
  const pick = dailyPick(day, HILLS.map(h => h.def), sd => hub.rng(sd));
  const H = hillOf(pick.hill);
  let theme = null;
  if (pick.cond.id === 'noc' && !H.def.theme.spotlights) {
    theme = { ...H.def.theme, id: H.def.theme.id + '-noc', sky: { ...H.def.theme.sky, zenith: '#03061a', horizon: '#1b2550', ground: '#10142a', sunColor: '#9fb6ff', stars: 0.7, clouds: 0.1 },
      fog: { color: '#1c2448', density: 0.004 }, sunIntensity: 0.55, hemi: ['#4a5a9a', '#141828', 0.42], bloom: [0.85, 0.5, 0.78], spotlights: 8, phoneLights: 1 };
  } else if (pick.cond.id === 'sneg') {
    theme = { ...H.def.theme, id: H.def.theme.id + '-sneg', snowfall: 0.9, fog: { ...H.def.theme.fog, density: H.def.theme.fog.density * pick.cond.mods.fog }, sky: { ...H.def.theme.sky, clouds: 0.9 } };
  }
  G.daily = { ...pick, theme, ghosts: [] };
  return G.daily;
}
function dailyState() {
  const day = hub.dailySeed();
  const st = S.load(dailyKey(), null);
  const base = { day, used: 0, best: null, reported: false, done: st?.done || [] };
  return st && st.day === day ? { ...base, ...st } : base;
}
const saveDaily = st => S.save(dailyKey(), st);
function dailyLine() {
  try {
    const D = dailyConfig(), st = dailyState();
    const H = hillOf(D.hill).def;
    return `${D.cond.icon} ${H.name} · ${D.cond.name} · ${st.used >= DAILY_TRIES ? 'opravljeno' : (DAILY_TRIES - st.used) + ' poskusi'}`;
  } catch { return 'Ista skakalnica in veter za vse.'; }
}
function dailyHud() {
  const st = dailyState();
  return st.used >= DAILY_TRIES && !G.dailyTry ? 'Dnevni izziv · trening (ne šteje)' : `Dnevni izziv · poskus ${Math.min(DAILY_TRIES, st.used + (G.dailyTry ? 0 : 1))}/${DAILY_TRIES}`;
}
/** Poskus se porabi ob štartu (zelena luč), ne ob odprtju igre. */
function dailyUseTry() {
  const st = dailyState();
  if (st.used >= DAILY_TRIES) { G.dailyTry = null; return; }
  st.used++; saveDaily(st);
  G.dailyTry = st.used;
  $('#hudMode').textContent = `Dnevni izziv · poskus ${st.used}/${DAILY_TRIES}`;
}

async function dailyAfterJump(res, ghostData) {
  const D = G.daily;
  const tryNo = G.dailyTry; G.dailyTry = null;
  if (!tryNo) return;   // trening po porabljenih poskusih
  const st = dailyState();
  const enc = Math.round(res.total * 10);
  if (!st.best || res.total > st.best.total) {
    st.best = { total: res.total, dist: res.dist, fall: res.fall };
    saveDaily(st);
    await hub.submitScore(enc, { seed: D.seed, meta: { hill: D.hill, dist: res.dist, cond: D.cond.id } });
    if (ghostData.length < GHOST_MAX) await hub.saveGhost({ level: dailyLevel(D.seed), timeMs: encodeBoard(res.total, res.dist), data: ghostData, order: 'desc' });
  }
  if (st.used >= DAILY_TRIES && !st.reported) await dailyReport(st);
}

/** Konec dneva za igralca: hub (kovanci, niz, naloge »daily:skoki«), XP, dosežek 7 dni zapored. */
async function dailyReport(st) {
  st.reported = true;
  const day = hub.dailySeed();
  st.done = [...new Set([...(st.done || []), day])].sort().slice(-30);
  saveDaily(st);
  await hub.reportGame({ won: false, players: 1, score: Math.round(st.best?.total || 0), daily: true });
  G.lastReport = Date.now();
  hub.awardXp(20, 'skoki: dnevni izziv');
  // 7 dni zapored (po ljubljanskih datumih)
  let n = 0;
  for (let i = 0; i < 7; i++) { const d = hub.dailySeed(new Date(Date.now() - i * 86400000)); if (st.done.includes(d)) n++; else break; }
  if (n >= 7) unlock('dnevni-7');
}

let dailyTimer = 0;
async function startDaily() {
  const D = dailyConfig();
  const H = hillOf(D.hill).def;
  const st = dailyState();
  clearInterval(dailyTimer);
  document.body.classList.remove('sk-playing');
  $('#play').classList.add('mg-hidden');
  $('#menu').classList.remove('mg-hidden');
  G.state = 'menu';
  const left = DAILY_TRIES - st.used;
  const fmtLeft = () => { const ms = msToMidnight(); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s2 = Math.floor(ms / 1000) % 60; return `${h} h ${String(m).padStart(2, '0')} min ${String(s2).padStart(2, '0')} s`; };
  $('#menu').innerHTML = `<div class="mg-stack">
    <div class="sk-hero"><div class="sk-hero__icon" aria-hidden="true">📅</div>
      <div><h1 class="mg-title">Dnevni izziv</h1><p class="mg-muted">Ista skakalnica, isti veter in isti pogoj za vse. Trije poskusi, šteje najboljši.</p></div></div>
    <div class="mg-grid mg-grid--2">
      <div class="mg-card mg-stack">
        <h2 class="mg-title">${esc(H.name)} · K${H.k} / HS${H.hs}</h2>
        <div class="sk-daily">
          <div><span class="mg-muted mg-small">Pogoj dneva</span><b>${D.cond.icon} ${esc(D.cond.name)}</b><span class="mg-small">${esc(D.cond.desc)}</span></div>
          <div><span class="mg-muted mg-small">Veter dneva</span><b>${H.physics?.noAir ? 'brez zraka' : sign(D.windMean) + ' m/s'}</b><span class="mg-small">${D.mods.gust ? 'močni sunki' : 'z rahlimi sunki'}</span></div>
          <div><span class="mg-muted mg-small">Zaletno mesto</span><b>${D.gate}</b><span class="mg-small">ref. ${D.refGate}</span></div>
          <div><span class="mg-muted mg-small">Poskusi</span><b class="sk-tries-left">${'●'.repeat(Math.max(0, left))}${'○'.repeat(DAILY_TRIES - Math.max(0, left))}</b><span class="mg-small">${left > 0 ? 'ostali še ' + left : 'porabljeni'}</span></div>
        </div>
        <p class="sk-note">Najboljši danes: <b>${st.best ? fmt1(st.best.total) + ' t · ' + fmtDist(st.best.dist) : '—'}</b> · do polnoči še <b id="dLeft">${fmtLeft()}</b></p>
        <div class="sk-ghostsel" id="dGhosts">Nalagam ghosta vodilnega …</div>
        <button class="mg-btn ${left > 0 ? 'mg-btn--pink' : 'mg-btn--ghost'} mg-btn--big mg-btn--block" id="dGo" ${isOpen(H, unlocked) || true ? '' : 'disabled'}>${left > 0 ? `Skoči (poskus ${st.used + 1}/${DAILY_TRIES})` : 'Trening na skakalnici dneva (ne šteje)'}</button>
        <button class="mg-btn mg-btn--ghost" id="dBack">← Meni</button>
      </div>
      <div class="mg-card" id="dBoard"></div>
    </div></div>`;
  dailyTimer = setInterval(() => { const el = $('#dLeft'); if (!el) { clearInterval(dailyTimer); return; } el.textContent = fmtLeft(); if (msToMidnight() < 1500) { clearInterval(dailyTimer); setTimeout(startDaily, 2500); } }, 1000);
  $('#dBack').onclick = () => { clearInterval(dailyTimer); showMenu(); };
  $('#dGo').onclick = () => { clearInterval(dailyTimer); audio.unlock(); startSession(D.hill, 'daily'); };
  ui.leaderboard($('#dBoard'), {
    title: 'Lestvica dneva', format: v => fmt1(v / 10) + ' t',
    tabs: [{ label: 'Danes', seed: D.seed, period: 'today' }],
    onRow: row => dailyFriendGhost(row), rowHint: () => ' 👻',
  });
  // ghost vodilnega dneva
  try {
    const top = await hub.getGhosts({ level: dailyLevel(D.seed), order: 'desc', limit: 1 });
    if (top?.[0] && top[0].user_id !== hub.userId) await dailyFriendGhost({ user_id: top[0].user_id, nickname: top[0].nickname }, true);
  } catch (e) { console.warn(e); }
  renderDailyGhosts();
}
function renderDailyGhosts() {
  const el = $('#dGhosts'); if (!el) return;
  const list = G.daily.ghosts || [];
  el.innerHTML = list.length ? list.map((o, i) => `<label class="mg-check"><input type="checkbox" data-dg="${i}" ${o.on ? 'checked' : ''}> 👻 ${esc(o.name)} (${fmtDist(o.g.dist)})</label>`).join('') : 'Še ni ghosta vodilnega. Klikni vrstico na lestvici dneva za ghosta prijatelja.';
  el.querySelectorAll('[data-dg]').forEach(c => c.onchange = () => { list[+c.dataset.dg].on = c.checked; });
}
async function dailyFriendGhost(row, leader = false) {
  const D = G.daily;
  const g = await hub.getGhost({ level: dailyLevel(D.seed), userId: row.user_id });
  if (!g?.data) { if (!leader) ui.toast('Ta igralec še nima posnetka skoka.', { icon: '👻' }); return; }
  try {
    const gh = decodeGhost(g.data);
    if (gh.pv !== P.paramsVersion || gh.hill !== D.hill) throw new Error('napačen ghost');
    D.ghosts = (D.ghosts || []).filter(o => o.userId !== row.user_id).slice(-2);
    D.ghosts.push({ g: gh, name: (leader ? 'Vodilni: ' : '') + (row.nickname || '???'), userId: row.user_id, on: true });
    renderDailyGhosts();
  } catch (e) { console.warn(e); }
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
  if (G.ext) { if (a === 'press' && G.state === 'gate' && !G.bot && !G.stream) startJump(); return; }
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
  if (G.ext) return;   // tekma ne čaka (drugi gledajo)
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
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)) * (dbgApi.timeScale || 1);
  last = now;
  if (G.state !== 'menu' && renderer) {
    if (!G.paused) {
      if (G.state === 'gate') updateGate(dt);
      else if (G.stream && (G.state === 'jump' || (G.state === 'result' && !G.J.done))) {
        // gledalec: toliko tickov, kot jih dovoli vmesni pomnilnik (ustavi se, če paketov ni)
        const a = G.stream.advance(dt * (G.ext?.speed || 1));
        let n = 0;
        for (; n < a.n && !G.J.done; n++) if (!tick()) break;
        G.alpha = 0;
        const st = a.stalled || G.stall;
        if (st !== G.shownStall) { G.shownStall = st; hint(st ? '… čakam na podatke' : ''); }
      }
      else if (G.state === 'jump' || (G.state === 'result' && !G.J.done)) G.alpha = clock.advance(dt * (G.ext?.speed || 1), tick);
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
  hills: () => HILLS, groups: () => GROUPS, hillOf, current: () => G, renderer: () => renderer,
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
  unlock: k => unlock(k),
  /** Testiranje: pospeši čas zanke (semafor, replay v živo). */
  timeScale: 1,
  bestKey,
  /** Testiranje: semafor takoj zelen. */
  skipRed() { if (G.state === 'gate') G.gateT = Math.max(G.gateT, RED_TIME + 0.01); },
  /** Testiranje: n tickov skoka (brez izrisa). */
  step(n = 1) { for (let i = 0; i < n && G.state === 'jump'; i++) tick(); return G.J.s; },
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
if (DEBUG || URLP.get('test') === '1') window.__skoki = dbgApi;   // ?test=1: razvojni most brez strani z drsniki
if (DEBUG) {
  document.body.classList.add('sk-dbg');
  const m = await import('./debug.js');
  m.initDebug(dbgApi, $('#debug'));
}
// tekma (lobby, TV, lokalna tekma, moji skakalci) — match.js uporablja ta »motor skoka«
const engine = {
  get P() { return P; }, hills: () => HILLS, groups: () => GROUPS, hillOf, hillOpen, unlocked, unlock, audio, settings,
  isTouch: IS_TOUCH, showMenu, renderMenu,
  /**
   * Skok pod nadzorom tekme. Vrne obljubo { status: 'ok'|'dsq'|'skip'|'abort', res, changes, hist }.
   * o: { hillId, gate, refGate, wind, mods, teleOnly, judgeSeed, source: 'me'|'bot'|'stream', bot: { skill, style, seed },
   *      stream: createReceiver(), speed, onInput(tick, [btn, pitch×2]), onStart(), startLimit, relaxed, mine,
   *      skin, label, whoHtml, recordLine, recordLabel, noSlowmo, holdMs }
   */
  async jump(o) {
    if (G.ext && !G.ext.done) engine.abort();
    G.mode = 'ext'; G.record = null;
    await enterPlay(o.hillId, { skin: o.skin, theme: o.theme });
    return new Promise(resolve => { G.ext = { ...o, resolve, done: false }; G.paused = false; $('#overlay').classList.add('mg-hidden'); newJump(); });
  },
  /** Prekini skok (npr. host je preskočil skakalca). */
  abort() { const X = G.ext; if (X && !X.done) { X.done = true; X.resolve({ status: 'abort' }); } },
  /** Replay zadnjega skoka (zgodovina) ali iz danega zapisa. */
  replay(hist) { startReplay(hist || G.lastJump?.hist); },
  get state() { return G.state; },
  get playing() { return !!G.ext && !G.ext.done; },
  renderer: () => renderer,
  /** Pogled TV: širša kamera. */
  setWide(on) { if (renderer) renderer.wide = on; },
};
let matchApi = null;
try {
  const M = await import('./match.js');
  matchApi = M.initMatch(engine);
} catch (e) { console.error('match.js:', e); }

const startHill = URLP.get('hill');
if (hub.roomFromUrl() && matchApi) matchApi.joinFromUrl();
else if (startHill && hillOf(startHill) && hillOpen(startHill)) { G.hillId = startHill; startSession(startHill, 'train'); }
else showMenu();
