/* =====================================================================
   REAKCIJA — demo igra, ki preizkusi vso hub infrastrukturo:
   profil, XP, dosežki, dnevni seed, lestvice, sobe, realtime, prenos hosta.
   ===================================================================== */
import { hub, ui } from '../../shared/hub.js';
import {
  SOLO_ROUNDS, PENALTY_MS, TIMEOUT_MS, dailyDelays, average, soloXp, mpXp, roundWinner, standings,
} from './logic.js';

const GAME = 'reakcija';
const $ = s => document.querySelector(s);
const esc = ui.esc;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = ms => `${ms} ms`;

const ACH = [
  { key: 'pod-200', title: 'Pod 200 ms', icon: '⚡', desc: 'Krog, hitrejši od 200 ms' },
  { key: 'mirna-roka', title: 'Mirna roka', icon: '🧘', desc: 'Dnevni izziv brez prezgodnjega klika' },
  { key: 'bliskovit', title: 'Bliskovit', icon: '🚀', desc: 'Povprečje dnevnega izziva pod 250 ms' },
  { key: 'zmaga-mp', title: 'Najhitrejši v sobi', icon: '👑', desc: 'Zmaga v multiplayerju' },
  { key: 'druzabnez', title: 'Družabnež', icon: '🎉', desc: 'Odigraj dvoboj s 4 ali več igralci' },
];
const achDef = k => ACH.find(a => a.key === k);
const unlock = k => hub.unlock(k, { title: achDef(k).title, icon: achDef(k).icon });

/* ===================================================================== */
/*  Zasloni                                                              */
/* ===================================================================== */

let lobbyView = null;
let board = null;

function show(id) {
  for (const s of document.querySelectorAll('.rk-screen')) s.classList.toggle('mg-hidden', s.id !== id);
  if (id !== 'lobby' && lobbyView) { lobbyView.destroy(); lobbyView = null; }
  window.scrollTo({ top: 0 });
}

async function showMenu() {
  show('menu');
  refreshMenu();
}

async function refreshMenu() {
  const seed = hub.dailySeed();
  const [today, ever] = await Promise.all([hub.getMyBest({ seed }), hub.getMyBest()]);
  $('#myBest').innerHTML = `<div><span class="mg-muted mg-small">Moj danes</span><b>${today != null ? fmt(today) : '—'}</b></div>
    <div><span class="mg-muted mg-small">Moj rekord</span><b>${ever != null ? fmt(ever) : '—'}</b></div>`;
  if (!board) {
    board = ui.leaderboard($('#board'), {
      title: 'Lestvica', format: fmt,
      tabs: [{ label: 'Danes', seed }, { label: 'Teden', period: 'week' }, { label: 'Vseh časov' }],
    });
  } else board.refresh();
  const mine = new Set((await hub.getAchievements()).map(a => a.key));
  $('#achList').innerHTML = ACH.map(a => `<div class="rk-ach__item ${mine.has(a.key) ? '' : 'locked'}">
    <span>${a.icon}</span><div><b>${esc(a.title)}</b><span class="mg-small mg-muted">${esc(a.desc)}</span></div></div>`).join('');
}

/* ===================================================================== */
/*  Krog: čakanje na zeleno in merjenje                                  */
/* ===================================================================== */

const zone = $('#zone');
let active = null;   // trenutni krog

function setZone(cls, big, small = '') {
  zone.className = 'rk-zone ' + cls;
  $('#zoneBig').textContent = big;
  $('#zoneSmall').textContent = small;
}

/**
 * En krog. Vrne obljubo {ms, early, slow}, ki se razreši ob kliku (ali po izteku časa).
 * @param {number} delay ms do zelenega
 */
function playRound(delay) {
  cancelRound();
  return new Promise(resolve => {
    const st = { phase: 'wait', tGo: 0, timers: [] };
    active = st;
    setZone('wait', 'Počakaj …', 'Tapni, ko postane zeleno');
    const finish = res => {
      if (st.phase === 'done') return;
      st.phase = 'done';
      st.timers.forEach(clearTimeout);
      active = null;
      resolve(res);
    };
    st.finish = finish;
    st.timers.push(setTimeout(() => {
      st.phase = 'go';
      setZone('go', 'ZDAJ!', '');
      // čas merimo od trenutka, ko je zelena barva narisana (rAF); če rAF ne pride
      // (zavihek v ozadju), ostane čas preklopa
      st.tGo = performance.now();
      requestAnimationFrame(t => { if (st.phase === 'go') st.tGo = Math.max(st.tGo, t); });
      st.timers.push(setTimeout(() => {
        setZone('early', 'Prepočasi', `+${TIMEOUT_MS} ms`);
        finish({ ms: TIMEOUT_MS, slow: true });
      }, TIMEOUT_MS));
    }, delay));
    st.hit = () => {
      if (st.phase === 'wait') {
        setZone('early', 'Prezgodaj!', `kazen ${PENALTY_MS} ms`);
        finish({ ms: PENALTY_MS, early: true });
      } else if (st.phase === 'go') {
        const ms = Math.max(1, Math.round(performance.now() - st.tGo));
        setZone('result', fmt(ms), ms < 200 ? 'Bliskovito!' : ms < 260 ? 'Odlično!' : ms < 350 ? 'Dobro' : 'Lahko bolje');
        finish({ ms });
      }
    };
  });
}

function cancelRound() {
  if (active) { active.timers.forEach(clearTimeout); active.phase = 'done'; active = null; }
}

zone.addEventListener('pointerdown', e => { e.preventDefault(); active?.hit(); });
document.addEventListener('keydown', e => {
  if ((e.code === 'Space' || e.code === 'Enter') && !$('#play').classList.contains('mg-hidden') && !document.querySelector('.mg-modal-back')) {
    e.preventDefault();
    if (!e.repeat) active?.hit();
  }
});

function dots(n, results, cur) {
  $('#dots').innerHTML = Array.from({ length: n }, (_, i) => {
    const r = results[i];
    return `<i class="${r ? (r.early || r.slow ? 'bad' : 'ok') : i === cur ? 'cur' : ''}"></i>`;
  }).join('');
}

/* ===================================================================== */
/*  SOLO — dnevni izziv                                                  */
/* ===================================================================== */

let soloRunning = false;

async function playSolo() {
  if (soloRunning) return;
  soloRunning = true;
  show('play');
  $('#mpScores').classList.add('mg-hidden');
  const seed = hub.dailySeed();
  const delays = dailyDelays(hub.rng, seed);
  const results = [];
  setZone('idle', 'Pripravi se', 'Dnevni izziv · 10 krogov');
  dots(SOLO_ROUNDS, results, 0);
  $('#roundLbl').textContent = `Krog 1/${SOLO_ROUNDS}`;
  await ui.countdown(3, { go: '' });
  for (let i = 0; i < SOLO_ROUNDS; i++) {
    if (!soloRunning) return;
    $('#roundLbl').textContent = `Krog ${i + 1}/${SOLO_ROUNDS}`;
    dots(SOLO_ROUNDS, results, i);
    const res = await playRound(delays[i]);
    if (!soloRunning) return;
    results.push(res);
    dots(SOLO_ROUNDS, results, i + 1);
    await sleep(900);
  }
  soloRunning = false;
  await soloFinish(results, seed);
}

async function soloFinish(results, seed) {
  const times = results.map(r => r.ms);
  const avg = average(times);
  const early = results.filter(r => r.early).length;
  const clean = results.filter(r => !r.early && !r.slow).map(r => r.ms);
  const best = clean.length ? Math.min(...clean) : null;
  setZone('result', fmt(avg), 'povprečje');

  const prevBest = await hub.getMyBest({ seed });
  await hub.submitScore(avg, { seed, meta: { times, early } });
  const xp = soloXp(avg);
  const { granted } = await hub.awardXp(xp, 'reakcija: dnevni izziv');
  // kovanci in naloge (ne čakamo — rezultat se pokaže takoj)
  hub.reportGame({ players: 1, score: avg, daily: true }).then(() => hub.reportEvent('reakcija:avg', avg));
  if (best != null && best < 200) await unlock('pod-200');
  if (!early) await unlock('mirna-roka');
  if (avg < 250) await unlock('bliskovit');

  const top = await hub.getLeaderboard({ seed, limit: 100 });
  const rank = top.findIndex(r => r.user_id === hub.userId) + 1;
  const record = prevBest == null || avg < prevBest;

  const v = await ui.modal({
    title: record ? 'Nov dnevni rekord!' : 'Konec izziva',
    wide: true,
    dismissible: false,
    html: `<div class="rk-summary">
        <div><span class="mg-small mg-muted">Povprečje</span><b>${fmt(avg)}</b></div>
        <div><span class="mg-small mg-muted">Najboljši</span><b>${best != null ? fmt(best) : '—'}</b></div>
        <div><span class="mg-small mg-muted">Mesto danes</span><b>${rank ? rank + '.' : '—'}</b></div>
      </div>
      <div class="rk-times">${results.map(r => `<span class="${r.early || r.slow ? 'bad' : r.ms === best ? 'best' : ''}">${r.early ? 'prezgodaj' : r.slow ? 'zamuda' : r.ms}</span>`).join('')}</div>
      <p class="mg-center mg-xp-gain">+${granted} XP</p>
      ${early ? `<p class="mg-center mg-small mg-muted">${early}× prezgodaj (+${PENALTY_MS} ms vsakič)</p>` : ''}`,
    actions: [{ label: 'Meni', value: 'menu' }, { label: 'Še enkrat', value: 'again', kind: 'primary' }],
  });
  if (v === 'again') playSolo(); else showMenu();
}

/* ===================================================================== */
/*  MULTIPLAYER                                                          */
/* ===================================================================== */

let room = null;
let mp = null;          // stanje igre (pri vseh igralcih isto, iz roundResult)
let hostRunning = false;

function freshMp(rounds) {
  return { rounds, lastResult: 0, curKey: null, totals: {}, counts: {}, wins: {}, names: {}, myTimes: [], finished: false, lastRound: null };
}

function nameOf(id) {
  const p = room?.players.find(x => x.id === id) || mp?.names[id];
  return p || { nickname: '???', avatar: { emoji: '❔', color: '#888' } };
}

async function createRoom() {
  try {
    const r = await hub.createRoom({ maxPlayers: 10, settings: { rounds: 5 } });
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

function enterRoom(r) {
  room = r;
  wireRoom(r);
  if (r.status === 'playing') {
    mp = freshMp(r.settings.rounds || 5);
    show('play');
    $('#mpScores').classList.remove('mg-hidden');
    setZone('idle', 'Igra teče', 'Pridružiš se v naslednjem krogu');
    renderScores();
    r.send('needSync', {});
  } else {
    showLobby();
  }
}

function showLobby() {
  show('lobby');
  lobbyView = ui.lobby($('#lobby'), room, {
    minPlayers: 2,
    title: 'Reakcija · dvoboj',
    onStart: s => startMp(s),
    onLeave: () => { room = null; mp = null; showMenu(); },
    settingsForm(el) {
      const cur = room.settings.rounds || 5;
      el.innerHTML = `<div class="mg-field"><label class="mg-label" for="setRounds">Število krogov</label>
        <select class="mg-select" id="setRounds">${[3, 5, 7, 10].map(n => `<option value="${n}" ${n === cur ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
      return () => ({ rounds: +el.querySelector('#setRounds').value });
    },
  });
}

function wireRoom(r) {
  r.on('round', p => clientRound(p));
  r.on('time', (p, from) => hostCollect(p, from));
  r.on('roundResult', p => applyResult(p));
  r.on('final', p => showFinal(p));
  r.on('needSync', (_p, from) => {
    if (r.isHost && mp && from !== hub.userId) r.send('sync', { to: from, state: publicState() });
  });
  r.on('sync', p => {
    if (p.to !== hub.userId || !mp) return;
    Object.assign(mp, p.state);
    renderScores();
  });
  r.on('hostChanged', ({ hostId }) => {
    if (hostId === hub.userId && r.status === 'playing' && mp && !mp.finished) {
      ui.toast('Host je odšel — igro vodiš ti.', { icon: '👑' });
      hostLoop(mp.lastResult + 1);
    }
  });
  r.on('status', s => {
    if (s === 'lobby' && $('#lobby').classList.contains('mg-hidden') && !document.querySelector('.mg-modal-back')) showLobby();
  });
  r.on('kicked', () => { room = null; ui.toast('Host te je odstranil iz sobe.', { icon: '🚪' }); showMenu(); });
}

function publicState() {
  const { rounds, lastResult, totals, counts, wins, names, lastRound } = mp;
  return { rounds, lastResult, totals, counts, wins, names, lastRound };
}

async function startMp(settings) {
  mp = freshMp(settings.rounds || 5);
  for (const p of room.players) mp.names[p.id] = { nickname: p.nickname, avatar: p.avatar, equipped: p.equipped || {} };
  show('play');
  $('#mpScores').classList.remove('mg-hidden');
  setZone('idle', 'Pripravi se', `${mp.rounds} krogov`);
  dots(mp.rounds, [], 0);
  $('#roundLbl').textContent = `Krog 1/${mp.rounds}`;
  renderScores();
  await ui.countdown(3, { go: '' });
  if (room?.isHost) hostLoop(1);
}

/* -------- host: vodi kroge -------- */

let pending = null;   // { r, times: {id: res} }

async function hostLoop(from) {
  if (hostRunning) return;
  hostRunning = true;
  try {
    for (let r = from; r <= mp.rounds; r++) {
      if (!room || room.left || !room.isHost) return;
      const delay = Math.round(1500 + Math.random() * 3000);
      const key = `${r}:${hub.userId}:${Date.now()}`;
      pending = { r, key, times: {} };
      room.send('round', { r, key, delay, rounds: mp.rounds });
      const deadline = Date.now() + delay + TIMEOUT_MS + 2500;
      while (Date.now() < deadline) {
        await sleep(100);
        if (!room || room.left || !room.isHost) return;
        if (room.players.every(p => pending.times[p.id])) break;
      }
      const times = { ...pending.times };
      for (const p of room.players) if (!times[p.id]) times[p.id] = { ms: TIMEOUT_MS, slow: true };
      const winnerId = roundWinner(times);
      const totals = { ...mp.totals }, counts = { ...mp.counts }, wins = { ...mp.wins }, names = { ...mp.names };
      for (const [id, t] of Object.entries(times)) {
        totals[id] = (totals[id] || 0) + t.ms;
        counts[id] = (counts[id] || 0) + 1;
        const p = room.players.find(x => x.id === id);
        if (p) names[id] = { nickname: p.nickname, avatar: p.avatar, equipped: p.equipped || {} };
      }
      if (winnerId) wins[winnerId] = (wins[winnerId] || 0) + 1;
      room.send('roundResult', { r, times, winnerId, totals, counts, wins, names, rounds: mp.rounds });
      await sleep(2300);
    }
    if (!room || !room.isHost) return;
    const st = standings(mp.totals, mp.counts, mp.wins);
    room.send('final', { standings: st, names: mp.names, players: room.players.length });
    room.setStatus('finished');
  } finally {
    hostRunning = false;
  }
}

function hostCollect(p, from) {
  if (!room?.isHost || !pending || p.key !== pending.key) return;
  if (!pending.times[from]) pending.times[from] = { ms: p.ms, early: !!p.early, slow: !!p.slow };
}

/* -------- vsi: igrajo krog -------- */

async function clientRound({ r, key, delay, rounds }) {
  if (!mp) mp = freshMp(rounds);
  if (key === mp.curKey || r <= mp.lastResult) return;
  mp.curKey = key;
  mp.rounds = rounds;
  if ($('#play').classList.contains('mg-hidden')) { show('play'); $('#mpScores').classList.remove('mg-hidden'); }
  $('#roundLbl').textContent = `Krog ${r}/${rounds}`;
  dots(rounds, mp.myTimes, r - 1);
  const res = await playRound(delay);
  if (mp.curKey !== key) return;
  mp.myTimes[r - 1] = res;
  room?.send('time', { key, ms: res.ms, early: !!res.early, slow: !!res.slow });
  await sleep(700);
  if (mp.curKey === key && mp.lastResult < r) setZone('idle', 'Čakam ostale …', res.early ? 'Prezgodaj!' : fmt(res.ms));
}

function applyResult(p) {
  if (!mp) mp = freshMp(p.rounds);
  mp.lastResult = Math.max(mp.lastResult, p.r);
  Object.assign(mp, { totals: p.totals, counts: p.counts, wins: p.wins, names: p.names, rounds: p.rounds });
  mp.lastRound = { r: p.r, times: p.times, winnerId: p.winnerId };
  if (!active) {
    const w = p.winnerId && nameOf(p.winnerId);
    if (p.winnerId === hub.userId) setZone('result', 'Najhitrejši!', `${fmt(p.times[p.winnerId].ms)} · krog ${p.r}`);
    else setZone('idle', w ? `${w.nickname}` : 'Nihče', w ? `je bil najhitrejši (${fmt(p.times[p.winnerId].ms)})` : 'vsi prezgodaj ali prepozno');
  }
  dots(p.rounds, mp.myTimes, p.r);
  renderScores();
}

function renderScores() {
  if (!mp) return;
  const st = standings(mp.totals, mp.counts, mp.wins);
  const present = new Set(room?.players.map(p => p.id) || []);
  const ids = [...new Set([...st.map(s => s.id), ...present])];
  const last = mp.lastRound;
  const rows = ids.map(id => ({ id, s: st.find(x => x.id === id), t: last?.times?.[id] }))
    .sort((a, b) => (a.s?.avg ?? 1e9) - (b.s?.avg ?? 1e9));
  $('#mpScores').innerHTML = `<div class="mg-row mg-row--between"><h2 class="mg-title" style="margin:0">Stanje</h2>
      <span class="mg-badge">Soba ${esc(room?.code || '')}</span></div>
    <table class="mg-table"><thead><tr><th></th><th>Igralec</th><th class="mg-num">Zadnji</th><th class="mg-num">Povpr.</th><th class="mg-num">👑</th></tr></thead><tbody>
    ${rows.map(({ id, s, t }, i) => `<tr class="${id === hub.userId ? 'mg-me' : ''}">
      <td class="mg-rank">${i + 1}.</td>
      <td>${ui.who({ ...nameOf(id), id })}${present.has(id) ? '' : ' <span class="mg-badge">odšel</span>'}${room?.hostId === id ? ' <span class="mg-badge mg-badge--yellow">host</span>' : ''}</td>
      <td class="mg-num ${t?.early || t?.slow ? 'rk-early' : last?.winnerId === id ? 'rk-win' : ''}">${t ? (t.early ? 'prezgodaj' : t.slow ? '—' : t.ms) : ''}</td>
      <td class="mg-num">${s ? s.avg : '—'}</td><td class="mg-num">${s?.wins || 0}</td></tr>`).join('')}
    </tbody></table>`;
}

async function showFinal({ standings: st, names, players }) {
  if (!mp || mp.finished) return;
  mp.finished = true;
  cancelRound();
  const winner = st[0]?.id;
  const iWon = winner === hub.userId;
  const meIn = st.some(s => s.id === hub.userId);
  let xp = 0;
  if (meIn) {
    ({ granted: xp } = await hub.awardXp(mpXp(iWon, players), 'reakcija: dvoboj'));
    const mine = st.find(s => s.id === hub.userId);
    hub.reportGame({ won: iWon, players, score: mine?.avg ?? null })
      .then(() => hub.reportEvent('reakcija:duel'))
      .then(() => mine && hub.reportEvent('reakcija:avg', mine.avg));
    if (iWon) await unlock('zmaga-mp');
    if (players >= 4) await unlock('druzabnez');
    if (mp.myTimes.some(t => t && !t.early && !t.slow && t.ms < 200)) await unlock('pod-200');
  }
  setZone('result', iWon ? 'ZMAGA!' : 'Konec', iWon ? 'Najhitrejši v sobi' : `Zmagal je ${names[winner]?.nickname || '???'}`);
  const list = st.map(s => ({
    id: s.id, nickname: names[s.id]?.nickname || '???', avatar: names[s.id]?.avatar, equipped: names[s.id]?.equipped || {},
    scoreText: `${s.avg} ms · ${s.wins}👑`, xp: s.id === hub.userId ? xp : 0,
  }));
  const v = await ui.results(list, { title: 'Rezultati dvoboja', again: room?.isHost ? 'Nova runda' : 'Nazaj v lobby' });
  if (v === 'again' && room && !room.left) {
    if (room.isHost) await room.setStatus('lobby');
    await room.setReady(false);
    mp = null;
    showLobby();
  }
}

/* ===================================================================== */
/*  Zagon                                                                */
/* ===================================================================== */

async function main() {
  await hub.init({ gameId: GAME, scoreOrder: 'asc' });
  ui.header({ title: 'Reakcija' });
  $('#btnSolo').addEventListener('click', playSolo);
  $('#btnCreate').addEventListener('click', createRoom);
  $('#joinCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
  $('#joinForm').addEventListener('submit', e => { e.preventDefault(); joinRoom($('#joinCode').value); });
  $('#btnQuit').addEventListener('click', async () => {
    if (!(await ui.confirm(room ? 'Zapustiš sobo?' : 'Prekineš izziv? Rezultat ne bo shranjen.', { yes: 'Prekini', danger: true }))) return;
    soloRunning = false;
    cancelRound();
    if (room) { await room.leave(); room = null; mp = null; }
    showMenu();
  });
  const code = hub.roomFromUrl();
  if (code) joinRoom(code); else showMenu();
}

main();
