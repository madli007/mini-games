/* =====================================================================
   POTAPLJANJE LADJIC — UI, načini igre, multiplayer (host vodi igro).

   Stanje igre (logic.js) je en JSON. Solo/dnevni: stanje drži ta zavihek.
   Multiplayer: host drži avtoritativno stanje G, ga po vsaki potezi zapiše
   z room.setState(..., { expectedVersion }) in doda potezo z room.pushMove.
   Klienti pošiljajo dejanja z room.send('act'). Ob prenosu hosta nov host
   prebere room.getState() in nadaljuje. Emote gredo prek room.send.
   UI nikoli ne prikaže tujih ladij — le razkrite oznake.
   ===================================================================== */
import { hub, ui } from '../../shared/hub.js';
import * as S from '../../shared/storage.js';
import * as L from './logic.js';
import { LEVELS, aiStep } from './ai.js';
import {
  CAPTAINS, CAPTAIN_IDS, ITEMS, MODIFIERS, CONTRACTS, contractById, LINES, ACHIEVEMENTS, EMOTES,
} from './content.js';
import * as FX from './fx.js';

const GAME = 'ladjice';
const $ = s => document.querySelector(s);
const esc = ui.esc;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => JSON.parse(JSON.stringify(o));
const SOLO_TURN_SEC = 30;

/* ===================================================================== */
/*  Stanje UI                                                            */
/* ===================================================================== */

let ME = null;                 // hub.userId
let ctx = { kind: null };      // { kind: 'solo'|'daily'|'mp', level, captain, practice }
let G = null;                  // avtoritativno stanje (solo/daily ali host v MP)
let V = null;                  // zadnje prejeto stanje (za prikaz)
let shown = null;              // stanje, ki je trenutno narisano
let lastRev = -1;
let skew = 0;                  // Date.now() - V.now
let queue = Promise.resolve();
let animating = false;
let targetId = null;
let uiMode = null;             // { kind:'ability'|'item', item?, pick:'cell'|'line'|'own'|'ownHit' }
let lockUntil = 0;             // MP: po poslanem dejanju počakaj na stanje
let overShown = null;
let room = null;
let isTV = false;
let lobbyView = null;
let picks = {};                // id → { cap, tv }
let lobbyCfg = { dup: false };
let myPick = null;
let lastSettings = null;
let lastEmote = 0;

let soloLevel = S.load('ladjice:level', 'kapitan');
let soloCaptain = S.load('ladjice:captain', 'sonar');

const ACH = Object.fromEntries(ACHIEVEMENTS.map(a => [a.key, a]));
const unlock = k => hub.unlock(k, { title: ACH[k].title, icon: ACH[k].icon });

/* ===================================================================== */
/*  Zasloni                                                              */
/* ===================================================================== */

function show(id) {
  for (const s of document.querySelectorAll('.lj-screen')) s.classList.toggle('mg-hidden', s.id !== id);
  if (id !== 'lobby' && lobbyView) { lobbyView.destroy(); lobbyView = null; }
}
const visible = id => !$('#' + id).classList.contains('mg-hidden');

function meta(id, st = V) {
  return st?.meta?.[id] || { nickname: id === 'ai' ? 'AI' : '???', avatar: { emoji: '❔', color: '#888' }, equipped: {} };
}
const nick = (id, st = V) => meta(id, st).nickname;

/* ===================================================================== */
/*  MENI                                                                 */
/* ===================================================================== */

let board = null;

function capButtons(el, sel, onPick, { taken = {} } = {}) {
  el.innerHTML = CAPTAIN_IDS.map(id => {
    const c = CAPTAINS[id];
    const who = taken[id];
    return `<button type="button" class="lj-cap" role="radio" data-cap="${id}" aria-checked="${id === sel}" style="--cc:${c.color}"
      ${who?.disabled ? 'disabled' : ''} title="${esc(c.ability)} (${c.cost}) — ${esc(c.passive)}">
      <span>${c.icon}</span>${esc(c.name)}<small>${c.cost} 🔮</small>${who?.html ? `<span class="lj-cap__who">${who.html}</span>` : ''}</button>`;
  }).join('') + `<p class="lj-capinfo" style="grid-column:1/-1">${capInfo(sel)}</p>`;
  el.onclick = e => {
    const b = e.target.closest('[data-cap]');
    if (b && !b.disabled) { FX.unlockAudio(); FX.sfx('click'); onPick(b.dataset.cap); }
  };
}
function capInfo(id) {
  const c = CAPTAINS[id];
  if (!c) return '';
  return `<b>${c.icon} ${esc(c.ability)}</b> (${c.cost} mane): ${esc(c.abilityDesc)}<br><b>Pasivka:</b> ${esc(c.passive)}`;
}

function renderMenuControls() {
  $('#levelSeg').innerHTML = Object.values(LEVELS).map(l => `<button type="button" role="radio" data-lvl="${l.id}" aria-checked="${l.id === soloLevel}">${l.icon} ${esc(l.name)}</button>`).join('');
  $('#levelDesc').textContent = LEVELS[soloLevel].desc;
  capButtons($('#soloCaps'), soloCaptain, id => { soloCaptain = id; S.save('ladjice:captain', id); renderMenuControls(); });
}

async function showMenu() {
  ctx = { kind: null };
  G = V = shown = null;
  show('menu');
  window.scrollTo({ top: 0 });
  renderMenuControls();
  const seed = hub.dailySeed();
  const di = L.dailyInfo(seed);
  const cap = CAPTAINS[di.captain], mod = MODIFIERS[di.modifier];
  $('#dailyDate').textContent = seed.split('-').reverse().slice(0, 2).join('. ') + '.';
  $('#dailyInfo').innerHTML = `<div><span>Kapitan dneva</span><b>${cap.icon} ${esc(cap.name)}</b><span>${esc(cap.ability)} · ${cap.cost} 🔮</span></div>
    <div><span>Modifikator</span><b>${mod.icon} ${esc(mod.name)}</b><span>${esc(mod.desc)}</span></div>
    <div style="grid-column:1/-1"><span>AI ne strelja nazaj. Potopi floto 5-4-3-3-2 v čim manj strelih. Šteje <b>prvi poskus</b> dneva.</span></div>`;
  const [today, ever] = await Promise.all([hub.getMyBest({ seed }), hub.getMyBest()]);
  const done = S.load(`ladjice:daily:${ME}:${seed}`, false);
  $('#myBest').innerHTML = `<div><span class="mg-muted mg-small">Moj danes</span><b>${today != null ? today + ' strelov' : '—'}</b></div>
    <div><span class="mg-muted mg-small">Moj rekord</span><b>${ever != null ? ever + ' strelov' : '—'}</b></div>`;
  $('#btnDaily').textContent = done ? 'Vaja (rezultat že oddan)' : 'Igraj dnevni izziv';
  if (!board) {
    board = ui.leaderboard($('#board'), {
      title: 'Lestvica dnevnega izziva', format: s => `${s} strelov`,
      tabs: [{ label: 'Danes', seed }, { label: 'Teden', period: 'week' }, { label: 'Vseh časov' }],
    });
  } else board.refresh();
  const mine = new Set((await hub.getAchievements()).map(a => a.key));
  $('#achList').innerHTML = ACHIEVEMENTS.map(a => `<div class="lj-ach__item ${mine.has(a.key) ? '' : 'locked'}">
    <span>${a.icon}</span><div><b>${esc(a.title)}</b><span class="mg-small mg-muted">${esc(a.desc)}</span></div></div>`).join('');
}

function renderRules() {
  $('#rules').innerHTML = `
    <p class="mg-muted">Ena poteza = <b>en strel ali ena sposobnost</b>. Mana: <b>+2</b> zgrešen strel, <b>+1</b> zadetek, <b>+2</b> potopitev (največ 10).
      Predmeti iz zabojev ne porabijo poteze. Ladje se privzeto ne smejo dotikati (niti diagonalno).</p>
    <table><thead><tr><th>Kapitan</th><th>Aktivna (mana)</th><th>Pasivka</th></tr></thead><tbody>
    ${CAPTAIN_IDS.map(id => { const c = CAPTAINS[id]; return `<tr><td>${c.icon} <b>${esc(c.name)}</b></td><td>${esc(c.abilityDesc)} — ${c.cost}</td><td>${esc(c.passive)}</td></tr>`; }).join('')}
    </tbody></table>
    <h3 class="mg-title" style="font-size:12px;margin-top:14px">Zaboji (inventar največ 2)</h3>
    <ul>${Object.values(ITEMS).map(i => `<li>${i.icon} <b>${esc(i.name)}</b> — ${esc(i.desc)}</li>`).join('')}</ul>
    <h3 class="mg-title" style="font-size:12px">Battle royale</h3>
    <ul><li><b>Glava na pladnju:</b> kdor potopi ladjo igralcu z največ potopitvami, dobi +3 mane.</li>
      <li><b>Maščevanje:</b> strel na tistega, ki te je zadnji zadel, da +1 mano.</li>
      <li><b>Duhovi:</b> izločeni lahko vsake 3 kroge izstrelijo meteor na naključno polje naključnega živega igralca.</li></ul>
    <h3 class="mg-title" style="font-size:12px">Skrivne pogodbe</h3>
    <p class="mg-muted">Na začetku izbereš eno od treh: ${CONTRACTS.map(c => esc(c.text)).join(' · ')}.</p>`;
}

/* ===================================================================== */
/*  Prikaz stanja (vrsta animacij)                                       */
/* ===================================================================== */

/** Novo stanje za prikaz (iz solo pogona, hosta ali room 'state'). */
function onState(s) {
  if (!s) return;
  if (s.rev != null && s.rev <= lastRev && s.gid === V?.gid) return;
  lastRev = s.rev ?? lastRev + 1;
  skew = s.now ? Date.now() - s.now : 0;
  V = s;
  lockUntil = 0;
  queue = queue.then(() => present(s)).catch(e => console.error(e));
}

async function present(s) {
  const prev = shown;
  if (s !== V && V && V.rev > s.rev) return;
  const fresh = !prev || prev.gid !== s.gid;
  if (!fresh && s.evSeq !== prev.evSeq && s.ev?.length && prev.phase !== 'place') {
    animating = true;
    try { await playEvents(prev, s, s.ev); } finally { animating = false; }
  }
  shown = s;
  renderAll();
  afterRender();
}

function amPlayer(st = shown) { return !!st && !isTV && st.players.some(p => p.id === ME && !p.dummy); }

function renderAll() {
  const st = shown;
  if (!st) return;
  if (!amPlayer(st)) {
    if (st.phase === 'place') { show('tv'); renderTV(); $('#tvBanner').textContent = 'Kapitani postavljajo flote …'; return; }
    show('tv'); renderTV(); return;
  }
  if (st.phase === 'place') { if (!visible('place') || placeGid !== st.gid) enterPlace(st); else renderPlaceWait(st); return; }
  if (!visible('play')) { show('play'); window.scrollTo({ top: 0 }); }
  renderPlay();
}

/* ===================================================================== */
/*  Mreža                                                                */
/* ===================================================================== */

function buildGrid(el, size) {
  if (el.dataset.n === String(size)) return;
  el.dataset.n = String(size);
  el.style.setProperty('--n', size);
  let html = '';
  for (let i = 0; i < size * size; i++) html += `<button type="button" class="lj-cell" data-i="${i}" tabindex="-1" aria-label="${String.fromCharCode(65 + (i % size))}${Math.floor(i / size) + 1}"></button>`;
  el.innerHTML = html + '<div class="lj-ships"></div>';
}
const cellEl = (grid, i) => grid?.querySelector(`.lj-cell[data-i="${i}"]`);

function shipsHtml(list, size) {
  return list.map(s => {
    const cells = s.cells.slice().sort((a, b) => a - b);
    const [x, y] = L.xy(cells[0], size);
    const vertical = cells.length > 1 && cells[1] - cells[0] === size;
    const w = vertical ? 1 : cells.length, h = vertical ? cells.length : 1;
    return `<div class="lj-shipbox ${s.cls || ''}" data-ship="${s.key ?? ''}" style="left:${x / size * 100}%;top:${y / size * 100}%;width:${w / size * 100}%;height:${h / size * 100}%">${FX.shipSvg(cells.length, vertical)}</div>`;
  }).join('');
}

/**
 * Nariši mrežo igralca T.
 * @param {HTMLElement} el
 * @param {Object} T igralec iz stanja
 * @param {{own?:boolean, viewer?:string|null, active?:boolean}} o
 */
function drawGrid(el, st, T, { own = false, viewer = ME, active = false } = {}) {
  buildGrid(el, st.size);
  const cs = el.clientWidth / st.size;
  if (cs) el.style.setProperty('--cs', cs + 'px');
  const intel = (!own && viewer && L.playerById(st, viewer)?.intel?.[T.id]) || {};
  const hints = (!own && viewer && (L.playerById(st, viewer)?.hints || []).filter(h => h.target === T.id)) || [];
  const mines = own ? new Set(T.mines) : new Set();
  for (const c of el.querySelectorAll('.lj-cell')) {
    const i = +c.dataset.i;
    const m = T.marks[i];
    if (m) c.dataset.m = m; else delete c.dataset.m;
    if (!m && intel[i] === 1) c.dataset.i1 = ''; else delete c.dataset.i1;
    if (!m && intel[i] === 0) c.dataset.i0 = ''; else delete c.dataset.i0;
    const h = hints.find(x => x.cell === i);
    if (h) c.dataset.dir = h.dir === 'h' ? '↔' : '↕'; else delete c.dataset.dir;
    if (mines.has(i)) c.dataset.mine = ''; else delete c.dataset.mine;
    c.tabIndex = active && !m ? 0 : -1;
    c.classList.remove('lj-preview');
  }
  el.classList.toggle('lj-active', active);
  const list = [];
  for (const s of T.ships || []) {
    if (own || s.sunk) list.push({ cells: s.cells, cls: s.sunk ? 'lj-shipbox--sunk' : '', key: s.id });
  }
  if (own) for (const d of T.decoys || []) list.push({ cells: d.cells, cls: 'lj-shipbox--decoy', key: 'd' });
  el.querySelector('.lj-ships').innerHTML = shipsHtml(list, st.size);
}

/* ===================================================================== */
/*  POSTAVITEV                                                           */
/* ===================================================================== */

let placeGid = null;
let placeShips = [];       // celice
let placeContract = null;
let placeSent = false;
let placeDeadlineLocal = 0;

function enterPlace(st) {
  show('place');
  window.scrollTo({ top: 0 });
  const me = L.playerById(st, ME);
  if (placeGid !== st.gid) {
    placeGid = st.gid;
    placeShips = L.randomFleet(st.size, st.fleet, st.settings.noTouch, Math.random);
    placeContract = me.offer[0] || null;
    placeSent = !!me.ships;
  }
  const cap = CAPTAINS[me.captain];
  $('#placeCaptain').innerHTML = `<div class="mg-row" style="gap:10px"><span style="font-size:34px;font-family:var(--mg-emoji)">${cap.icon}</span>
    <div><div class="mg-small mg-muted">Tvoj kapitan</div><b style="font-size:18px">${esc(cap.name)}</b></div></div>
    <p class="lj-capinfo" style="margin-top:8px">${capInfo(me.captain)}</p>
    <p class="mg-small mg-muted" style="margin:6px 0 0">Mreža ${st.size}×${st.size}, flota ${st.fleet.join('-')}${st.settings.noTouch ? ', ladje se ne dotikajo' : ''}${st.settings.crates ? ', zaboji vklopljeni' : ''}.</p>`;
  renderContracts(me);
  drawPlace(st);
  renderPlaceWait(st);
}

function renderContracts(me) {
  const el = $('#placeContract');
  if (!me.offer.length) { el.classList.add('mg-hidden'); return; }
  el.classList.remove('mg-hidden');
  el.innerHTML = `<div><b>Skrivna pogodba</b> <span class="mg-small mg-muted">— izberi eno (bonus +10 XP)</span></div>` +
    me.offer.map(id => { const c = contractById(id); return `<button type="button" class="lj-contract" role="radio" data-c="${id}" aria-checked="${id === placeContract}"><span>${c.icon}</span>${esc(c.text)}</button>`; }).join('');
  el.onclick = e => {
    const b = e.target.closest('[data-c]');
    if (!b || placeSent) return;
    placeContract = b.dataset.c;
    FX.sfx('click');
    renderContracts(me);
  };
}

function drawPlace(st) {
  const el = $('#placeGrid');
  buildGrid(el, st.size);
  el.querySelector('.lj-ships').innerHTML = shipsHtml(placeShips.map((cells, k) => ({ cells, key: k })), st.size);
}

function renderPlaceWait(st) {
  const total = st.players.filter(p => !p.noFleet).length;
  const done = st.players.filter(p => p.ships).length;
  const me = L.playerById(st, ME);
  placeSent = placeSent || !!me?.ships;
  $('#btnReady').disabled = placeSent;
  $('#btnRandom').disabled = placeSent;
  $('#btnReady').textContent = placeSent ? 'Pripravljen ✓' : 'Pripravljen';
  $('#placeWait').innerHTML = placeSent ? `<span class="mg-pulse">Čakam ostale kapitane … (${done}/${total})</span>` : (total > 1 && ctx.kind === 'mp' ? `${done}/${total} pripravljenih` : '');
}

function placeValid(ships) { return L.validateFleet(shown.size, shown.fleet, ships, shown.settings.noTouch); }

function wirePlacement() {
  const el = $('#placeGrid');
  let drag = null;
  el.addEventListener('pointerdown', e => {
    const box = e.target.closest('.lj-shipbox');
    if (!box || placeSent || !shown) return;
    FX.unlockAudio();
    e.preventDefault();
    const k = +box.dataset.ship;
    const size = shown.size;
    const r = el.getBoundingClientRect();
    const cs = r.width / size;
    const cells = placeShips[k].slice().sort((a, b) => a - b);
    const [x0, y0] = L.xy(cells[0], size);
    drag = { k, box, startX: e.clientX, startY: e.clientY, x0, y0, cs, moved: false, vertical: cells.length > 1 && cells[1] - cells[0] === size, len: cells.length, pos: [x0, y0] };
    box.setPointerCapture?.(e.pointerId);
    box.classList.add('lj-shipbox--drag');
  });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    const size = shown.size;
    const nx = Math.max(0, Math.min(size - (drag.vertical ? 1 : drag.len), Math.round(drag.x0 + dx / drag.cs)));
    const ny = Math.max(0, Math.min(size - (drag.vertical ? drag.len : 1), Math.round(drag.y0 + dy / drag.cs)));
    drag.pos = [nx, ny];
    drag.box.style.left = nx / size * 100 + '%';
    drag.box.style.top = ny / size * 100 + '%';
    const test = placeShips.slice();
    test[drag.k] = L.shipCells(nx, ny, drag.len, drag.vertical, size);
    drag.box.classList.toggle('lj-shipbox--bad', !placeValid(test));
  });
  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    const size = shown.size;
    if (!d.moved) {
      // tap: obrat okrog prvega polja (če ne gre, poskusi zamik)
      for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-2, 0], [0, -2], [1, 0], [0, 1]]) {
        const cells = L.shipCells(d.x0 + ox, d.y0 + oy, d.len, !d.vertical, size);
        if (!cells) continue;
        const test = placeShips.slice();
        test[d.k] = cells;
        if (placeValid(test)) { placeShips = test; FX.sfx('click'); break; }
      }
    } else {
      const test = placeShips.slice();
      test[d.k] = L.shipCells(d.pos[0], d.pos[1], d.len, d.vertical, size);
      if (test[d.k] && placeValid(test)) { placeShips = test; FX.sfx('click'); } else FX.sfx('decoy');
    }
    drawPlace(shown);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  $('#btnRandom').addEventListener('click', () => {
    if (placeSent || !shown) return;
    FX.unlockAudio(); FX.sfx('pop');
    placeShips = L.randomFleet(shown.size, shown.fleet, shown.settings.noTouch, Math.random);
    drawPlace(shown);
  });
  $('#btnReady').addEventListener('click', () => submitPlacement());
}

function submitPlacement() {
  if (placeSent || !shown || shown.phase !== 'place') return;
  FX.unlockAudio();
  if (!placeValid(placeShips)) placeShips = L.randomFleet(shown.size, shown.fleet, shown.settings.noTouch, Math.random);
  placeSent = true;
  FX.sfx('turn');
  if (ctx.kind === 'mp') {
    room.send('fleet', { ships: placeShips, contract: placeContract });
    renderPlaceWait(shown);
  } else {
    L.setFleet(G, ME, placeShips);
    if (placeContract) L.chooseContract(G, ME, placeContract);
    L.startPlay(G);
    setDeadline(G);
    localCommit();
  }
}

/* ===================================================================== */
/*  IGRALNI ZASLON                                                       */
/* ===================================================================== */

function opponents(st = shown) { return st.players.filter(p => p.id !== ME && !p.noFleet); }
function myP(st = shown) { return L.playerById(st, ME); }

function fixTarget() {
  const st = shown;
  const ops = opponents(st);
  const cur = ops.find(p => p.id === targetId);
  if (!cur || (!cur.alive && ops.some(p => p.alive))) {
    const alive = ops.filter(p => p.alive);
    targetId = (alive[0] || ops[0])?.id || null;
  }
}

function chipHtml(st, p) {
  const m = meta(p.id, st);
  const ships = (p.ships || []);
  const isCur = st.phase === 'play' && L.current(st).id === p.id;
  const tags = [];
  if (st.phase === 'play' && p.alive && L.hasFleet(p) && L.aliveShips(p).length === 1) tags.push('<span class="lj-tag">zadnji zdihljaj</span>');
  else if (!p.alive && !p.noFleet) tags.push(`<span class="lj-tag lj-tag--off">${st.mode === 'br' ? '👻 duh' : 'potopljen'}</span>`);
  else if (ctx.kind === 'mp' && room && !room.players.some(x => x.id === p.id) && !p.dummy) tags.push('<span class="lj-tag lj-tag--off">odklopljen</span>');
  return `<button type="button" class="lj-chip ${p.id === targetId ? 'sel' : ''} ${p.alive ? '' : 'dead'} ${p.id === ME ? 'me' : ''}" data-id="${esc(p.id)}">
    ${tags.join('')}
    <div class="lj-chip__av">${ui.avatar(m, 'sm')}${isCur ? '<svg class="lj-ring" viewBox="0 0 50 50"><circle class="bg" cx="25" cy="25" r="22"/><circle class="fg" cx="25" cy="25" r="22" stroke-dasharray="138.2" stroke-dashoffset="0"/></svg>' : ''}</div>
    <div class="lj-chip__name">${p.id === ME ? 'Ti' : esc(m.nickname)}</div>
    <div class="lj-pips">${ships.map(s => `<i class="${s.sunk ? 'x' : ''}"></i>`).join('')}</div>
    <div class="lj-chip__mana">${CAPTAINS[p.captain]?.icon || ''} 🔮${L.shownMana(st, p, ME)}${p.inv?.length && p.id !== ME ? ` · 🎒${p.inv.length}` : ''}</div>
  </button>`;
}

function renderPlay() {
  const st = shown;
  const me = myP(st);
  fixTarget();
  const T = L.playerById(st, targetId);
  const cur = st.phase === 'play' ? L.current(st) : null;
  const myTurn = cur?.id === ME && me.alive && !animating && st.phase === 'play';

  // vrstica igralcev (jaz prvi, nato nasprotniki)
  const order = [me, ...opponents(st)].filter(p => !p.noFleet || p.id === ME);
  $('#opps').innerHTML = order.filter(p => !(p.noFleet && p.id === ME && st.mode === 'daily')).map(p => chipHtml(st, p)).join('');

  // pasica
  const b = $('#banner');
  b.className = 'lj-banner';
  if (st.phase === 'over') {
    b.classList.add('over');
    b.textContent = st.mode === 'daily' ? `🏁 Flota potopljena v ${me.stats.turns} strelih` : st.winner === ME ? '🏆 Zmaga!' : `Konec — zmagal je ${nick(st.winner)}`;
  } else if (!me.alive) {
    b.textContent = st.mode === 'br' ? '👻 Si duh — vsake 3 kroge lahko izstreliš meteor' : 'Potopljen si';
  } else if (cur.id === ME) {
    b.classList.add('mine');
    b.textContent = me.extraShots ? '🎯 Dvojni strel — streljaj še enkrat!' : st.mode === 'daily' ? `Strel #${me.stats.turns + 1}` : 'Tvoja poteza!';
  } else {
    b.textContent = `Na potezi: ${nick(cur.id)} · krog ${st.round}`;
  }

  // tarča
  const multi = opponents(st).length > 1;
  $('#prevTarget').classList.toggle('mg-hidden', !multi);
  $('#nextTarget').classList.toggle('mg-hidden', !multi);
  document.querySelector('.lj-targethead').classList.toggle('solo', !multi);
  if (T) {
    const m = meta(T.id, st);
    $('#targetName').innerHTML = `${ui.who(m)} ${!T.alive ? '<span class="mg-badge mg-badge--red">potopljen</span>' : ''}`;
    const canShoot = myTurn && T.alive && (!uiMode || uiMode.pick === 'cell');
    drawGrid($('#targetGrid'), st, T, { active: canShoot });
  }
  renderTorpButtons(st, myTurn && uiMode?.pick === 'line' && T?.alive);

  // moja mreža
  const daily = st.mode === 'daily';
  document.querySelector('.lj-arena').classList.toggle('lj-arena--daily', daily);
  $('#meWrap').classList.toggle('mg-hidden', daily || me.noFleet);
  if (!daily) drawGrid($('#meGrid'), st, me, { own: true, active: myTurn && !!uiMode && (uiMode.pick === 'own' || uiMode.pick === 'ownHit') });
  const cap = CAPTAINS[me.captain];
  const mm = meta(ME, st);
  const isCurMe = cur?.id === ME;
  $('#meHead').innerHTML = `<div class="lj-chip__av" data-me>${ui.avatar(mm, 'sm')}${isCurMe ? '<svg class="lj-ring" viewBox="0 0 50 50"><circle class="bg" cx="25" cy="25" r="22"/><circle class="fg" cx="25" cy="25" r="22" stroke-dasharray="138.2" stroke-dashoffset="0"/></svg>' : ''}</div>
    <div><b>${esc(mm.nickname)}</b> <span class="mg-small mg-muted">· ${cap.icon} ${esc(cap.name)}</span>
    <div class="mg-small">${daily ? `🎯 ${me.stats.turns} strelov · ${MODIFIERS[st.modifier]?.icon || ''} ${esc(MODIFIERS[st.modifier]?.name || '')}` : `🚢 ${L.aliveShips(me).length}/${me.ships.length}`}
    ${me.shield ? ' · 🛡️ ščit' : ''}${me.skip ? ' · 💤 preskok' : ''}${me.contract ? ` · 📜 ${me.contractDone ? '✅' : esc(contractById(me.contract).text)}` : ''}</div></div>`;

  // mana
  const cost = L.abilityCost(st, me);
  $('#mana').innerHTML = Array.from({ length: L.MANA_MAX }, (_, i) => `<i class="${i < me.mana ? 'on' : ''} ${i === cost - 1 ? 'cost' : ''}"></i>`).join('');

  // sposobnost ali meteor
  const ab = $('#btnAbility');
  if (!me.alive && st.mode === 'br') {
    const ready = L.canMeteor(st, me);
    ab.style.setProperty('--cc', '#a78bfa');
    ab.innerHTML = `<span>☄️</span><div>Meteor<small>${ready ? 'Pripravljen! Naključno polje naključnega igralca.' : `Na voljo v krogu ${me.ghostReady}`}</small></div>`;
    ab.disabled = !ready || st.phase !== 'play';
    ab.classList.toggle('ready', ready);
  } else {
    const empBlocked = me.captain === 'emp' && T && me.lastEmp === T.id;
    const label = CAPTAINS[me.captain].needs === 'player' && T ? ` → ${esc(nick(T.id))}` : '';
    ab.style.setProperty('--cc', cap.color);
    ab.innerHTML = `<span>${cap.icon}</span><div>${esc(cap.ability)}${label} · ${cost} 🔮<small>${empBlocked ? 'Istega ne moreš dvakrat zapored.' : esc(cap.abilityDesc)}</small></div>`;
    ab.disabled = !myTurn || me.mana < cost || empBlocked || (cap.needs === 'ownHit' && !me.ships.some(s => !s.sunk && s.hits.some(Boolean)));
    ab.classList.toggle('ready', !ab.disabled);
    ab.classList.toggle('lj-armed', uiMode?.kind === 'ability');
  }

  // inventar
  $('#inv').innerHTML = [0, 1].map(k => {
    const it = me.inv[k];
    return it ? `<button type="button" class="lj-item full" data-item="${it}" ${myTurn ? '' : 'disabled'} title="${esc(ITEMS[it].name)}: ${esc(ITEMS[it].desc)}" aria-label="${esc(ITEMS[it].name)}">${ITEMS[it].icon}</button>`
      : '<button type="button" class="lj-item" disabled aria-label="Prazno mesto">·</button>';
  }).join('');

  // emote
  $('#emotes').innerHTML = EMOTES.map(e => `<button type="button" data-emote="${e}" aria-label="Reakcija ${e}">${e}</button>`).join('');

  // namig načina
  const hint = $('#modeHint');
  hint.classList.toggle('mg-hidden', !uiMode);
  if (uiMode) $('#modeHintTxt').textContent = modeText(uiMode);
  updateTimers();
}

function modeText(m) {
  if (m.kind === 'item' && m.item === 'mina') return '💣 Tapni prazno polje na SVOJI mreži';
  switch (m.pick) {
    case 'cell': return '📡 Tapni središče kvadrata 3×3 na mreži nasprotnika';
    case 'line': return '🚀 Izberi vrstico (levo) ali stolpec (zgoraj)';
    case 'own': return '🎈 Tapni prazno polje na SVOJI mreži za vabo';
    case 'ownHit': return '🔧 Tapni zadeto polje svoje ladje';
    default: return '';
  }
}

function renderTorpButtons(st, on) {
  const wrap = $('#targetWrap');
  wrap.querySelectorAll('.lj-torp').forEach(x => x.remove());
  wrap.classList.toggle('torp', !!on);
  if (!on) return;
  const n = st.size;
  const rows = document.createElement('div');
  rows.className = 'lj-torp lj-torp--rows';
  rows.style.setProperty('--n', n);
  rows.innerHTML = Array.from({ length: n }, (_, i) => `<button type="button" data-line="r:${i}" aria-label="Vrstica ${i + 1}">▶</button>`).join('');
  const cols = document.createElement('div');
  cols.className = 'lj-torp lj-torp--cols';
  cols.style.setProperty('--n', n);
  cols.innerHTML = Array.from({ length: n }, (_, i) => `<button type="button" data-line="c:${i}" aria-label="Stolpec ${String.fromCharCode(65 + i)}">▼</button>`).join('');
  wrap.append(rows, cols);
}

/** Časovnik poteze (krožni trak) in postavitve. */
function updateTimers() {
  const st = shown;
  if (!st) return;
  const now = Date.now() - skew;
  if (st.phase === 'place' && visible('place')) {
    const dl = ctx.kind === 'mp' ? st.placeDeadline : placeDeadlineLocal;
    const left = Math.max(0, Math.ceil((dl - now) / 1000));
    const t = $('#placeTimer');
    t.textContent = `⏱ ${left} s`;
    t.classList.toggle('urgent', left <= 10);
    if (left <= 0 && !placeSent) submitPlacement();
  }
  if (st.phase !== 'play') return;
  const total = st.turnMs || (st.settings.turnSec || 0) * 1000;
  const rem = st.deadline ? Math.max(0, st.deadline - now) : null;
  const frac = rem == null || !total ? 1 : Math.min(1, rem / total);
  for (const ring of document.querySelectorAll('.lj-ring')) {
    const fg = ring.querySelector('.fg');
    fg.style.strokeDashoffset = String(138.2 * (1 - frac));
    ring.classList.toggle('warn', rem != null && rem <= 5000);
  }
  if (rem != null && rem <= 5000 && rem > 0 && L.current(st).id === ME) {
    const sec = Math.ceil(rem / 1000);
    if (sec !== updateTimers.lastTick) { updateTimers.lastTick = sec; FX.sfx('tick'); }
  }
}

/* ===================================================================== */
/*  Dejanja igralca                                                      */
/* ===================================================================== */

function canAct() {
  const st = shown;
  return st && st.phase === 'play' && !animating && Date.now() > lockUntil && L.current(st).id === ME && myP(st).alive;
}

function doAction(a) {
  FX.unlockAudio();
  uiMode = null;
  if (ctx.kind === 'mp') {
    if (!room) return;
    lockUntil = Date.now() + 2500;
    room.send('act', { a, turnNo: shown.turnNo });
    if (a.t === 'shot') FX.sfx('shot');
    renderPlay();
    return;
  }
  const before = G.turnNo;
  const r = L.act(G, ME, a);
  if (!r.ok) { errToast(r.err); renderPlay(); return; }
  if (G.turnNo !== before) setDeadline(G);
  if (a.t === 'shot') FX.sfx('shot');
  localCommit();
}

function errToast(err) {
  const msg = { no_mana: 'Premalo mane.', bad_cell: 'Tja ne gre.', bad_target: 'Neveljavna tarča.', emp_repeat: 'Istega igralca ne moreš EMP-jati dvakrat zapored.',
    not_your_turn: 'Nisi na potezi.', nothing: 'Ni kaj razkriti.', already: 'Ščit je že dvignjen.', not_ready: 'Meteor še ni pripravljen.' }[err] || 'Ne gre.';
  ui.toast(msg, { icon: '⚠️', duration: 1800 });
}

function wirePlay() {
  $('#targetGrid').addEventListener('click', e => {
    const c = e.target.closest('.lj-cell');
    if (!c || !canAct() || c.dataset.m) return;
    const cell = +c.dataset.i;
    if (uiMode?.pick === 'cell') doAction({ t: 'ability', target: targetId, cell });
    else if (!uiMode) doAction({ t: 'shot', target: targetId, cell });
  });
  // predogled sonarja 3×3
  $('#targetGrid').addEventListener('pointerover', e => {
    const c = e.target.closest('.lj-cell');
    for (const x of $('#targetGrid').querySelectorAll('.lj-preview')) x.classList.remove('lj-preview');
    if (!c || uiMode?.pick !== 'cell' || !shown) return;
    const [cx, cy] = L.xy(+c.dataset.i, shown.size);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (L.inB(cx + dx, cy + dy, shown.size)) cellEl($('#targetGrid'), L.idx(cx + dx, cy + dy, shown.size))?.classList.add('lj-preview');
    }
  });
  $('#targetWrap').addEventListener('click', e => {
    const b = e.target.closest('[data-line]');
    if (!b || !canAct() || uiMode?.pick !== 'line') return;
    const [dir, i] = b.dataset.line.split(':');
    doAction({ t: 'ability', target: targetId, line: { dir, i: +i } });
  });
  $('#meGrid').addEventListener('click', e => {
    const c = e.target.closest('.lj-cell');
    if (!c || !canAct() || !uiMode) return;
    const cell = +c.dataset.i;
    if (uiMode.kind === 'item') doAction({ t: 'item', item: uiMode.item, cell });
    else if (uiMode.pick === 'own') doAction({ t: 'ability', cell, vertical: false });
    else if (uiMode.pick === 'ownHit') doAction({ t: 'ability', cell });
  });
  $('#btnAbility').addEventListener('click', () => {
    FX.unlockAudio();
    const st = shown;
    const me = myP(st);
    if (!me.alive) {
      if (st.mode === 'br' && L.canMeteor(st, me)) {
        if (ctx.kind === 'mp') room.send('act', { a: { t: 'meteor' } });
        else doAction({ t: 'meteor' });
      }
      return;
    }
    if (!canAct()) return;
    const need = CAPTAINS[me.captain].needs;
    if (uiMode?.kind === 'ability') { uiMode = null; renderPlay(); return; }
    if (need === 'player') { doAction({ t: 'ability', target: targetId }); return; }
    uiMode = { kind: 'ability', pick: need === 'own' ? 'own' : need === 'ownHit' ? 'ownHit' : need === 'line' ? 'line' : 'cell' };
    FX.sfx('click');
    renderPlay();
  });
  $('#inv').addEventListener('click', e => {
    const b = e.target.closest('[data-item]');
    if (!b || !canAct()) return;
    const it = b.dataset.item;
    if (it === 'mina') { uiMode = { kind: 'item', item: 'mina', pick: 'own' }; renderPlay(); return; }
    doAction({ t: 'item', item: it, target: it === 'radar' ? targetId : undefined });
  });
  $('#btnCancelMode').addEventListener('click', () => { uiMode = null; renderPlay(); });
  $('#opps').addEventListener('click', e => {
    const b = e.target.closest('.lj-chip');
    if (!b || b.dataset.id === ME) return;
    targetId = b.dataset.id;
    FX.sfx('click');
    renderPlay();
  });
  const step = d => {
    const ops = opponents(shown).filter(p => p.alive);
    if (ops.length < 2) return;
    const k = ops.findIndex(p => p.id === targetId);
    targetId = ops[(k + d + ops.length) % ops.length].id;
    FX.sfx('click');
    renderPlay();
  };
  $('#prevTarget').addEventListener('click', () => step(-1));
  $('#nextTarget').addEventListener('click', () => step(1));
  // swipe za menjavo nasprotnika
  let sx = null, sy = null;
  $('#targetWrap').addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
  $('#targetWrap').addEventListener('pointerup', e => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  });
  $('#emotes').addEventListener('click', e => {
    const b = e.target.closest('[data-emote]');
    if (!b) return;
    if (Date.now() - lastEmote < 2000) return;
    lastEmote = Date.now();
    for (const x of $('#emotes').querySelectorAll('button')) x.disabled = true;
    setTimeout(() => { for (const x of $('#emotes').querySelectorAll('button')) x.disabled = false; }, 2000);
    if (ctx.kind === 'mp' && room) room.send('emote', { e: b.dataset.emote });
    else {
      showEmote(ME, b.dataset.emote);
      if (Math.random() < 0.6) setTimeout(() => showEmote('ai', EMOTES[Math.floor(Math.random() * EMOTES.length)]), 700 + Math.random() * 800);
    }
  });
  $('#btnMenuPlay').addEventListener('click', quitDialog);
}

function showEmote(pid, e) {
  if (!EMOTES.includes(e)) return;
  const host = document.querySelector(`.lj-chip[data-id="${CSS.escape(pid)}"]`) || (pid === ME ? $('#meHead') : null)
    || document.querySelector(`.lj-tvcard[data-id="${CSS.escape(pid)}"]`);
  if (!host) return;
  const s = document.createElement('span');
  s.className = 'lj-emote';
  s.textContent = e;
  host.style.position = host.style.position || 'relative';
  host.appendChild(s);
  FX.sfx('pop');
  setTimeout(() => s.remove(), 1900);
}

async function quitDialog() {
  const msg = ctx.kind === 'mp' ? 'Zapustiš sobo? Če igra teče, te bo zamenjal AI in po 2 minutah boš izločen.' : 'Prekineš igro? Napredek ne bo shranjen.';
  if (!(await ui.confirm(msg, { yes: 'Zapusti', danger: true }))) return;
  await leaveRoom();
  showMenu();
}

async function leaveRoom() {
  stopHost();
  if (room) { const r = room; room = null; try { await r.leave(); } catch { /* ignore */ } }
}

/* ===================================================================== */
/*  Animacije dogodkov in komentator                                     */
/* ===================================================================== */

const recent = [];
function line(kind, vars = {}) {
  const list = LINES[kind];
  if (!list) return '';
  const fresh = list.filter(l => !recent.includes(l));
  const l = (fresh.length ? fresh : list)[Math.floor(Math.random() * (fresh.length || list.length))];
  recent.push(l);
  if (recent.length > 12) recent.shift();
  return l.replace('{a}', vars.a ?? '').replace('{b}', vars.b ?? '').replace('{n}', vars.n ?? '');
}

function feed(text, cls = '') {
  if (!text) return;
  for (const el of [$('#feed'), $('#tvFeed')]) {
    const p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    el.prepend(p);
    while (el.children.length > 8) el.lastChild.remove();
  }
}

function chipCenter(pid) {
  const el = document.querySelector(`.lj-chip[data-id="${CSS.escape(pid)}"] .lj-chip__av`)
    || document.querySelector(`.lj-tvcard[data-id="${CSS.escape(pid)}"] .lj-tvcard__av`)
    || (pid === ME ? $('#meHead .lj-chip__av') : null);
  if (el) { const r = el.getBoundingClientRect(); if (r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  return { x: innerWidth / 2, y: innerHeight - 40 };
}

/** Mreža, na kateri je prikazan igralec pid (ali null). */
function gridFor(pid) {
  if (visible('tv')) return document.querySelector(`.lj-tvcard[data-id="${CSS.escape(pid)}"] .lj-grid`);
  if (!visible('play')) return null;
  if (pid === ME) return $('#meWrap').classList.contains('mg-hidden') ? null : $('#meGrid');
  if (pid === targetId) return $('#targetGrid');
  return null;
}

async function playEvents(prev, s, evs) {
  const fast = evs.length > 18 || document.hidden;
  const N = id => nick(id, s);
  for (const e of evs) {
    switch (e.k) {
      case 'shot': await animShot(e, s, fast); break;
      case 'torpedo': {
        feed(line('torpedo', { a: N(e.pid) }), 'gold');
        FX.sfx('torpedo');
        ensureView(e.target, prev);
        const g = gridFor(e.target);
        if (g && !fast) {
          await FX.torpedoRun(e.path.map(c => cellEl(g, c)).filter(Boolean));
          const T = L.playerById(s, e.target);
          for (const c of e.path) { const el = cellEl(g, c); if (el && T.marks[c] === 'm') el.dataset.m = 'm'; }
        }
        if (e.end == null) feed(`Torpedo ${N(e.pid)} ni zadel ničesar.`);
        break;
      }
      case 'cluster': feed(line('kasetna', { a: N(e.pid) }), 'hot'); ensureView(e.target, prev); FX.sfx('whistle'); break;
      case 'sonar': {
        FX.sfx('ping');
        feed(line('sonar', { a: N(e.pid) }), 'gold');
        ensureView(e.target, prev);
        const g = gridFor(e.target);
        if (g) FX.burst(cellEl(g, e.cell), 'sonar');
        if (e.pid === ME) ui.toast(`Sonar: ${e.n} ${e.n === 1 ? 'polje' : e.n === 2 ? 'polji' : e.n <= 4 ? 'polja' : 'polj'} z ladjo`, { icon: '📡' });
        if (!fast) await sleep(500);
        break;
      }
      case 'emp':
        FX.sfx('emp');
        feed(line('emp', { a: N(e.pid), b: N(e.target) }), 'gold');
        if (e.target === ME) { document.body.classList.add('lj-emp-flash'); setTimeout(() => document.body.classList.remove('lj-emp-flash'), 900); FX.vibrate([60, 40, 60]); }
        if (!fast) await sleep(500);
        break;
      case 'meteor': FX.sfx('meteor'); feed(line('meteor', { a: N(e.pid), b: N(e.target) }), 'purple'); ensureView(e.target, prev); break;
      case 'elim':
        feed(e.forfeit ? `${N(e.pid)} je zapustil/a boj.` : line('elim', { a: N(e.by), b: N(e.pid) }), 'hot');
        if (e.pid === ME && s.mode === 'br' && s.phase === 'play') ui.toast('Izločen si — zdaj si duh. Vsake 3 kroge izstreli meteor! 👻', { icon: '👻', duration: 4000 });
        break;
      case 'streak':
        if (e.n === 2) feed(line('streak2', { a: N(e.pid) }), 'gold');
        else if (e.n >= 3) feed(line('streak3', { a: N(e.pid), n: e.n }), 'gold');
        break;
      case 'missStreak': if (e.n === 4 || e.n === 7) feed(line('missStreak', { a: N(e.pid), n: e.n })); break;
      case 'bounty': feed(line('bounty', { a: N(e.pid), b: N(e.target) }), 'gold'); break;
      case 'revenge': feed(line('revenge', { a: N(e.pid) })); break;
      case 'saved': feed(line('saved', { b: N(e.pid) }), 'purple'); break;
      case 'lastShip': feed(line('lastShip', { b: N(e.pid) }), 'hot'); break;
      case 'repair': FX.sfx('shield'); feed(line('repair', { a: N(e.pid) })); break;
      case 'decoySet': feed(line('decoySet', { a: N(e.pid) }), 'purple'); break;
      case 'radar': if (e.pid === ME) { FX.sfx('ping'); ui.toast('Radar je razkril polje ladje!', { icon: '🛰️' }); } else feed(`${N(e.pid)} uporabi radar.`); break;
      case 'mineSet': if (e.pid === ME) ui.toast('Mina postavljena.', { icon: '💣' }); break;
      case 'double': feed(`${N(e.pid)} pripravi dvojni strel! 🎯`, 'gold'); break;
      case 'shieldSet': FX.sfx('shield'); feed(`${N(e.pid)} dvigne ščit. 🛡️`); break;
      case 'skipped': feed(`${N(e.pid)} preskoči potezo. 💤`); break;
      case 'timeout': feed(line('timeout', { a: N(e.pid) })); break;
      case 'storm': feed(line('storm'), 'purple'); break;
      case 'firstBlood':
        feed(`🩸 Prva kri: ${N(e.pid)}!`, 'hot');
        break;
      case 'contract':
        if (e.pid === ME) { FX.sfx('crate'); ui.toast(`Pogodba izpolnjena: ${contractById(e.id).text} (+10 XP)`, { icon: '📜', duration: 3500 }); }
        else feed(`📜 ${N(e.pid)} je izpolnil/a skrivno pogodbo …`, 'gold');
        break;
      case 'dir': if (e.pid === ME) ui.toast(`Pasivka sonarja: ladja leži ${e.dir === 'h' ? 'vodoravno ↔' : 'navpično ↕'}`, { icon: '📡' }); break;
      case 'mana': if (e.pid === ME && e.n) FX.floatText($('#mana'), `+${e.n} 🔮`, 'purple'); break;
      case 'turn': if (e.pid === ME && s.phase === 'play' && s.mode !== 'daily') { FX.sfx('turn'); FX.vibrate(40); } break;
      case 'tie': feed(`Neodločeno — zmaga ${N(e.pid)} z več preživelimi polji.`, 'gold'); break;
      case 'win': if (e.pid) feed(line('win', { a: N(e.pid) }), 'gold'); break;
      default: break;
    }
  }
}

/** Ob tuji potezi pokaži mrežo, na katero se strelja. */
function ensureView(pid, prev) {
  if (!visible('play') || pid === ME || pid === targetId) return;
  const st = shown || prev;
  if (!st || L.current(st).id === ME) return;
  targetId = pid;
  const T = L.playerById(st, pid);
  if (T) { drawGrid($('#targetGrid'), st, T, { active: false }); $('#targetName').innerHTML = ui.who(meta(pid, st)); }
}

async function animShot(e, s, fast) {
  ensureView(e.target, shown);
  const g = gridFor(e.target);
  const cell = cellEl(g, e.cell);
  const T = L.playerById(s, e.target);
  const by = e.by;
  if (cell && !fast && e.src !== 'torpedo') {
    const from = e.src === 'meteor' ? { x: innerWidth * Math.random(), y: -20 } : chipCenter(by);
    if (e.src !== 'kasetna') FX.sfx('whistle');
    await FX.projectile(from, cell, { color: e.src === 'meteor' ? '#a78bfa' : by === ME ? '#4de1ff' : '#ffd23f', dur: e.src === 'kasetna' ? 300 : 430, kind: e.src === 'meteor' ? 'meteor' : 'shell' });
  }
  const shakeEl = g?.closest('.lj-gridwrap, .lj-tvcard') || g;
  const N = id => nick(id, s);
  switch (e.res) {
    case 'miss':
      FX.sfx('splash'); FX.burst(cell, 'miss');
      if (e.src === 'shot') feed(line('miss', { a: N(by) }));
      break;
    case 'hit':
      FX.sfx('hit'); FX.burst(cell, 'hit'); FX.shake(shakeEl); FX.floatText(cell, 'ZADETEK!', 'hit');
      if (e.target === ME) FX.vibrate(80);
      feed(line('hit', { a: N(by), b: N(e.target) }), 'hot');
      if (by === ME && e.src !== 'meteor') unlock('prva-krv');
      break;
    case 'sink':
      FX.sfx('hit'); FX.burst(cell, 'sink'); FX.shake(shakeEl, true); FX.floatText(cell, 'POTOPLJENO!', 'sink');
      if (e.target === ME) FX.vibrate([120, 60, 200]);
      setTimeout(() => FX.sfx('sink'), 250);
      feed(line('sink', { a: N(by), b: N(e.target) }), 'hot');
      if (by === ME && e.src !== 'meteor') unlock('prva-krv');
      break;
    case 'decoy':
      FX.sfx('hit'); FX.burst(cell, 'hit'); FX.floatText(cell, 'ZADETEK?', 'hit');
      if (!fast) await sleep(450);
      FX.sfx('decoy'); FX.floatText(cell, 'VABA! 🎈', 'purple');
      feed(line('vaba', { a: N(by) }), 'purple');
      break;
    case 'shield':
      FX.sfx('shield'); FX.burst(cell, 'shield'); FX.floatText(cell, 'ŠČIT!', 'cyan');
      feed(line('shield', { b: N(e.target) }));
      break;
    case 'crate':
      FX.sfx('splash'); FX.burst(cell, 'miss');
      setTimeout(() => FX.sfx('crate'), 200);
      FX.floatText(cell, e.item ? `📦 ${ITEMS[e.item].name}` : '📦 Poln inventar', 'gold');
      feed(line('crate', { a: N(by), n: e.item ? ITEMS[e.item].name : 'nič (poln inventar)' }), 'gold');
      break;
    case 'mine':
      FX.sfx('hit'); FX.burst(cell, 'hit'); FX.shake(shakeEl); FX.floatText(cell, 'MINA!', 'hit');
      feed(line('mine', { a: N(by) }), 'hot');
      break;
    default: break;
  }
  // posodobi celico in ladje
  if (g && T) {
    const cells = e.cells || [e.cell];
    for (const c of cells) { const el = cellEl(g, c); if (el) { if (T.marks[c]) el.dataset.m = T.marks[c]; delete el.dataset.i1; delete el.dataset.i0; } }
    if (e.res === 'sink') {
      const own = e.target === ME && !visible('tv');
      const list = [];
      for (const sh of T.ships || []) {
        if (own || sh.sunk) list.push({ cells: sh.cells, cls: sh.sunk ? `lj-shipbox--sunk ${sh.cells.includes(e.cell) ? 'lj-shipbox--sinking' : ''}` : '', key: sh.id });
      }
      g.querySelector('.lj-ships').innerHTML = shipsHtml(list, s.size);
    }
  }
  if (!fast) await sleep(e.res === 'sink' ? 700 : e.src === 'kasetna' ? 120 : 260);
}

/* ===================================================================== */
/*  Po izrisu: AI poteza (solo), konec igre                              */
/* ===================================================================== */

let aiTimer = null;
function afterRender() {
  const st = shown;
  if (!st) return;
  if (st.phase === 'over') { gameOver(st); return; }
  if ((ctx.kind === 'solo') && G && G.phase === 'play' && L.current(G).ai && !aiTimer) {
    aiTimer = setTimeout(() => {
      aiTimer = null;
      if (!G || G.phase !== 'play' || !L.current(G).ai || ctx.kind !== 'solo') return;
      const cur = L.current(G);
      const before = G.turnNo;
      aiStep(G, cur.id, cur.ai, L.act, L.randomShot);
      if (G.turnNo !== before) setDeadline(G);
      localCommit();
    }, 650 + Math.random() * 400);
  }
}

function localCommit() {
  G.rev = (G.rev || 0) + 1;
  G.now = Date.now();
  onState(clone(G));
}

function setDeadline(st, absent = () => false) {
  if (st.phase !== 'play') { st.deadline = 0; st.turnMs = 0; return; }
  const cp = L.current(st);
  const ms = (st.settings.turnSec || 0) * 1000;
  const t = ms || (absent(cp.id) ? 20000 : 0);
  st.deadline = t ? Date.now() + t : 0;
  st.turnMs = t;
}

/* ===================================================================== */
/*  SOLO in DNEVNI IZZIV                                                 */
/* ===================================================================== */

function myMeta() {
  const p = hub.profile || {};
  return { nickname: p.nickname || 'Ti', avatar: p.avatar || { emoji: '🙂', color: '#ffd23f' }, equipped: p.equipped || {} };
}

function startSolo() {
  FX.unlockAudio();
  stopHost();
  ctx = { kind: 'solo', level: soloLevel, captain: soloCaptain };
  S.save('ladjice:level', soloLevel);
  const aiCaps = CAPTAIN_IDS.filter(c => c !== soloCaptain);
  const aiCap = aiCaps[Math.floor(Math.random() * aiCaps.length)];
  G = L.newGame({
    mode: 'ai', seed: String(Date.now()) + Math.random(), settings: { turnSec: SOLO_TURN_SEC },
    players: [{ id: ME, captain: soloCaptain }, { id: 'ai', captain: aiCap, ai: soloLevel }],
  });
  G.gid = 'solo-' + Date.now();
  G.meta = { [ME]: myMeta(), ai: { nickname: `AI ${LEVELS[soloLevel].name}`, avatar: { emoji: LEVELS[soloLevel].icon, color: '#4de1ff' }, equipped: {} } };
  placeDeadlineLocal = Date.now() + L.PLACE_SEC * 1000;
  resetView();
  localCommit();
}

function startDaily() {
  FX.unlockAudio();
  stopHost();
  const seed = hub.dailySeed();
  const practice = !!S.load(`ladjice:daily:${ME}:${seed}`, false);
  ctx = { kind: 'daily', seed, practice };
  G = L.dailyGame(seed, ME);
  G.gid = 'daily-' + Date.now();
  G.settings.turnSec = 0;
  G.meta = { [ME]: myMeta(), ai: { nickname: 'Flota dneva', avatar: { emoji: '🏴‍☠️', color: '#ffd23f' }, equipped: {} } };
  if (!practice) S.save(`ladjice:daily:${ME}:${seed}`, true);   // en poskus na dan šteje
  resetView();
  localCommit();
  const cap = CAPTAINS[G.players[0].captain], mod = MODIFIERS[G.modifier];
  ui.toast(`${practice ? 'Vaja · ' : ''}${cap.icon} ${cap.name} · ${mod.icon} ${mod.name}`, { icon: '🗓️', duration: 3500 });
}

function resetView() {
  shown = null; V = null; lastRev = -1; overShown = null; uiMode = null; targetId = null; placeGid = null; placeSent = false;
  $('#feed').innerHTML = ''; $('#tvFeed').innerHTML = '';
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
}

/* ===================================================================== */
/*  KONEC IGRE                                                           */
/* ===================================================================== */

async function gameOver(st) {
  if (overShown === st.gid) return;
  overShown = st.gid;
  if (amPlayer(st) && visible('play')) renderPlay();
  await sleep(900);
  const me = L.playerById(st, ME);
  const player = !!me && !isTV && !me.dummy;
  const won = st.winner === ME;
  if (player) FX.sfx(won ? 'win' : 'lose');
  let xp = 0;
  let extra = '';
  if (player) ({ xp, extra } = await rewards(st, me, won));
  const summary = summaryHtml(st) + extra;

  if (st.mode === 'daily') {
    const v = await ui.modal({
      title: ctx.practice ? 'Vaja končana' : 'Dnevni izziv končan!', wide: true, dismissible: false,
      html: `<div class="lj-best" style="justify-content:center"><div><span class="mg-small mg-muted">Streli</span><b style="font-size:22px">${me.stats.turns}</b></div>
        <div><span class="mg-small mg-muted">Natančnost</span><b>${L.accuracy(me)} %</b></div><div><span class="mg-small mg-muted">Najdaljši niz</span><b>${me.stats.bestStreak}</b></div></div>
        ${xp ? `<p class="mg-center mg-xp-gain">+${xp} XP</p>` : ''}${extra}`,
      actions: [{ label: 'Meni', value: 'menu' }, { label: 'Vaja', value: 'again', kind: 'primary' }],
    });
    if (v === 'again') startDaily(); else showMenu();
    return;
  }
  const list = L.standings(st).map(p => ({
    id: p.id, ...meta(p.id, st), scoreText: `${p.stats.sinks} ⚓ · ${L.accuracy(p)} %`, xp: p.id === ME ? xp : 0,
  }));
  const host = ctx.kind !== 'mp' || room?.isHost;
  const v = await ui.results(list, {
    title: won ? 'Zmaga! 🏆' : st.mode === 'ai' ? 'Poraz' : 'Konec igre', extraHtml: summary,
    again: ctx.kind === 'mp' ? (host ? 'Revanša' : 'Počakaj na revanšo') : 'Revanša',
  });
  if (v !== 'again') return;
  if (ctx.kind === 'solo') { startSolo(); return; }
  if (ctx.kind === 'mp' && room && !room.left) {
    if (room.isHost) await room.start(lastSettings || room.settings);
    else ui.toast('Ko host začne revanšo, se igra začne sama.', { icon: '⏳' });
  }
}

function summaryHtml(st) {
  const ps = L.standings(st);
  const rows = ps.map(p => `<tr class="${p.id === ME ? 'mg-me' : ''}"><td>${ui.who(meta(p.id, st))}</td><td>${L.accuracy(p)} %</td><td>${p.stats.bestStreak}</td>
    <td>${p.stats.manaSpent}</td><td>${p.stats.sinks}</td><td>${p.stats.abilities}</td></tr>`).join('');
  const aw = L.awards(st);
  const contracts = ps.filter(p => p.contract).map(p => `<li>${p.id === ME ? '<b>Ti</b>' : esc(nick(p.id, st))} ${p.id === ME ? 'si imel/a' : 'je imel/a'} pogodbo: ${contractById(p.contract).icon} ${esc(contractById(p.contract).text)} ${p.contractDone ? '✅' : '❌'}</li>`).join('');
  return `<div class="lj-sumwrap"><table class="lj-sum"><thead><tr><th>Igralec</th><th>Natančnost</th><th title="Najdaljši niz zadetkov">Niz</th><th title="Porabljena mana">Porab. 🔮</th><th title="Potopljene ladje">⚓</th><th title="Uporabljene sposobnosti">✨</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${aw.length ? `<div class="lj-awards">${aw.map(a => `<div><b>${a.icon} ${esc(a.title)}</b>${esc(nick(a.pid, st))} · ${esc(a.text)}</div>`).join('')}</div>` : ''}
    ${contracts ? `<ul class="lj-contracts">${contracts}</ul>` : ''}`;
}

/** XP, kovanci, dosežki, naloge. */
async function rewards(st, me, won) {
  const mode = st.mode;
  const humans = st.players.filter(p => !p.dummy && !p.noFleet && !p.ai).length;
  const players = mode === 'duel' || mode === 'br' ? humans : 1;
  const contracts = me.contractDone ? 1 : 0;
  const xp = L.xpFor({ mode, won, contracts, level: ctx.level });
  let granted = 0;
  try { ({ granted } = await hub.awardXp(xp, `ladjice: ${mode}`)); } catch (e) { console.warn(e); }
  let extra = '';
  const daily = mode === 'daily';
  const score = daily ? me.stats.turns : null;
  if (daily && !ctx.practice) {
    const seed = ctx.seed;
    const prevBest = await hub.getMyBest({ seed });
    await hub.submitScore(score, { seed, meta: { modifier: st.modifier, captain: me.captain, acc: L.accuracy(me) } });
    const top = await hub.getLeaderboard({ seed, limit: 100 });
    const rank = top.findIndex(r => r.user_id === ME) + 1;
    extra += `<p class="mg-center">${rank ? `Mesto danes: <b>${rank}.</b>` : ''} ${prevBest == null || score < prevBest ? '· nov dnevni rekord!' : ''}</p>`;
  } else if (daily) extra += '<p class="mg-center mg-small mg-muted">Vaja — rezultat ne gre na lestvico.</p>';

  // kovanci in naloge (ne čakamo)
  (async () => {
    await hub.reportGame({ won: won && players >= 2, players, score, daily: daily && !ctx.practice });
    const rep = (name, n, cap) => { const k = Math.min(n, cap); let p = Promise.resolve(); for (let i = 0; i < k; i++) p = p.then(() => hub.reportEvent(name, 1)); return p; };
    await rep('ladjice:ability', me.stats.abilities, 5);
    await rep('ladjice:sink', me.stats.sinks, 10);
    await rep('ladjice:crate', me.stats.crates, 5);
    if (contracts) await hub.reportEvent('ladjice:contract', 1);
    if (daily && !ctx.practice) await hub.reportEvent('ladjice:daily-shots', score);
    if (mode === 'br' && won && humans >= 4) await hub.reportEvent('ladjice:br-win', 1);
    if (mode === 'ai' && won && ctx.level === 'admiral') await hub.reportEvent('ladjice:admiral-win', 1);
    if ((mode === 'duel' || mode === 'br') && won) await hub.reportEvent('ladjice:mp-win', 1);
  })().catch(e => console.warn('reportGame:', e));

  // dosežki
  const keyC = `ladjice:contracts:${ME}`;
  if (contracts) S.save(keyC, (S.load(keyC, 0) || 0) + 1);
  const ach = [];
  if (mode === 'ai' && won && ctx.level === 'admiral') ach.push('admiral');
  if ((mode === 'duel' || mode === 'ai') && won && me.stats.lostShips === 0) ach.push('brez-praske');
  if (mode === 'br' && won && humans >= 5) ach.push('royale');
  if (!daily && won && L.aliveShips(me).length === 1) ach.push('comeback');
  if (me.stats.torpSinks > 0) ach.push('torpedist');
  if (me.stats.decoyHits > 0) ach.push('vaba');
  if (daily && !ctx.practice && score <= 30) ach.push('snajper');
  if ((S.load(keyC, 0) || 0) >= 10) ach.push('pogodbenik');
  if (me.stats.ghostSinks > 0) ach.push('duh');
  if (!daily && won) {
    const k = `ladjice:capwins:${ME}`;
    const set = new Set(S.load(k, []));
    set.add(me.captain);
    S.save(k, [...set]);
    if (CAPTAIN_IDS.every(c => set.has(c))) ach.push('vsi-kapitani');
  }
  for (const a of ach) await unlock(a);
  return { xp: granted, extra };
}

/* ===================================================================== */
/*  MULTIPLAYER                                                          */
/* ===================================================================== */

const H = { active: false, ver: 0, queue: Promise.resolve(), absent: {}, timer: null };

function stopHost() {
  H.active = false;
  if (H.timer) { clearInterval(H.timer); H.timer = null; }
}

function hostBegin(state, version) {
  G = state;
  H.active = true;
  H.ver = version || 0;
  if (!H.timer) H.timer = setInterval(hostTick, 500);
}

function hostCommit(move = null) {
  if (!H.active || !room) return;
  G.rev = (G.rev || 0) + 1;
  G.now = Date.now();
  const snap = clone(G);
  onState(clone(snap));
  H.queue = H.queue.then(async () => {
    if (!room) return;
    try {
      H.ver = await room.setState(snap, { expectedVersion: H.ver });
    } catch (e) {
      if (e.code === 'version_conflict') {
        try { const cur = await room.getState(); H.ver = await room.setState(snap, { expectedVersion: cur.version }); } catch (e2) { console.warn('setState:', e2.message); }
      } else console.warn('setState:', e.message);
    }
    if (move) room.pushMove(move).catch(() => {});
  });
}

const present_ = id => !!room?.players.some(p => p.id === id);
const absentFn = id => !present_(id);

function hostAct(pid, a) {
  if (!H.active || !G) return;
  const before = G.turnNo;
  const r = L.act(G, pid, a);
  if (!r.ok) { room?.send('err', { to: pid, err: r.err }); return; }
  if (G.turnNo !== before || G.phase !== 'play') setDeadline(G, absentFn);
  if (G.phase === 'over' && room?.isHost) room.setStatus('finished').catch(() => {});
  hostCommit({ pid, a });
}

function hostTick() {
  if (!H.active || !G || !room || room.left) return;
  if (!room.isHost) { stopHost(); return; }
  const now = Date.now();
  for (const p of G.players) {
    if (p.dummy) continue;
    if (present_(p.id)) delete H.absent[p.id];
    else if (!H.absent[p.id]) H.absent[p.id] = now;
  }
  if (G.phase === 'place') {
    const all = G.players.every(p => p.ships || p.noFleet);
    if (all || now > G.placeDeadline + 3000) {
      L.startPlay(G);
      setDeadline(G, absentFn);
      hostCommit({ t: 'start' });
    }
    return;
  }
  if (G.phase !== 'play') return;
  // odklopljen več kot 2 minuti → izločen
  for (const p of G.players) {
    if (p.alive && H.absent[p.id] && now - H.absent[p.id] > L.DISCONNECT_ELIM_MS) {
      const before = G.turnNo;
      L.forfeit(G, p.id);
      if (G.turnNo !== before) setDeadline(G, absentFn);
      hostCommit({ t: 'forfeit', pid: p.id });
      return;
    }
  }
  const cp = L.current(G);
  if (!G.deadline && absentFn(cp.id)) { setDeadline(G, absentFn); hostCommit(); return; }
  if (G.deadline && now > G.deadline) {
    const before = G.turnNo;
    if (absentFn(cp.id)) {
      // odklopljenega igra preprost AI (Kapitan)
      for (let k = 0; k < 4 && G.phase === 'play' && G.turnNo === before; k++) aiStep(G, cp.id, 'kapitan', L.act, L.randomShot);
    } else {
      const a = L.randomShot(G, cp.id);
      if (a) { L.act(G, cp.id, a); G.ev.unshift({ k: 'timeout', pid: cp.id }); }
    }
    if (G.turnNo === before && G.phase === 'play') G.deadline = now + 5000;
    else setDeadline(G, absentFn);
    if (G.phase === 'over') room.setStatus('finished').catch(() => {});
    hostCommit({ t: 'timeout', pid: cp.id });
  }
}

/** Host: nova igra iz nastavitev sobe. */
function hostNewGame(settings) {
  const tv = new Set(settings.tv || []);
  const ps = room.players.filter(p => !tv.has(p.id));
  if (ps.length < 2) {
    ui.toast('Za igro sta potrebna vsaj 2 igralca (TV ne šteje).', { icon: '⚠️' });
    room.setStatus('lobby').catch(() => {});
    return;
  }
  const mode = ps.length === 2 ? 'duel' : 'br';
  const caps = settings.caps || {};
  const st = L.newGame({
    mode, seed: room.code + ':' + Date.now(),
    settings: { noTouch: settings.noTouch !== false, crates: settings.crates !== false, turnSec: settings.turnSec ?? L.TURN_SEC },
    players: ps.map(p => ({ id: p.id, captain: caps[p.id] || 'sonar' })),
  });
  st.gid = room.code + '-' + Date.now();
  st.meta = Object.fromEntries(room.players.map(p => [p.id, { nickname: p.nickname, avatar: p.avatar, equipped: p.equipped || {} }]));
  st.placeDeadline = Date.now() + L.PLACE_SEC * 1000;
  H.absent = {};
  hostBegin(st, H.ver);
  hostCommit({ t: 'new' });
}

async function createRoom() {
  FX.unlockAudio();
  try {
    const r = await hub.createRoom({ maxPlayers: 10, settings: { turnSec: 20, noTouch: true, crates: true, dup: false } });
    enterRoom(r);
  } catch (e) { ui.toast(e.message, { icon: '⚠️' }); }
}

async function joinRoom(code) {
  FX.unlockAudio();
  try {
    const r = await hub.joinRoom(code);
    enterRoom(r);
  } catch (e) {
    if (e.code === 'wrong_game') {
      const games = await hub.games();
      const g = games.find(x => x.id === e.game);
      if (g) { const l = hub.link(g.path); location.href = l + (l.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(code); return; }
    }
    const msg = { room_full: 'Soba je polna.', room_started: 'Igra v tej sobi se je že začela.', room_not_found: 'Soba s to kodo ne obstaja.' }[e.code] || e.message;
    await ui.modal({ title: 'Ne gre', html: `<p>${esc(msg)}</p>` });
    try { const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u); } catch { /* ignore */ }
    showMenu();
  }
}

async function enterRoom(r) {
  room = r;
  ctx = { kind: 'mp' };
  resetView();
  wireRoom(r);
  myPick = myPick || S.load('ladjice:captain', 'sonar');
  r.send('pick', { cap: myPick, tv: isTV });
  r.send('pickReq', {});
  if (r.status === 'playing' || r.status === 'finished') {
    const s = await r.getState();
    if (s.state && s.state.v) {
      if (r.isHost) hostBegin(s.state, s.version);
      onState(s.state);
      return;
    }
  }
  showLobby();
}

function showLobby() {
  show('lobby');
  window.scrollTo({ top: 0 });
  lobbyView = ui.lobby($('#lobbyMain'), room, {
    minPlayers: 2,
    title: 'Potapljanje ladjic',
    onLeave: () => { room = null; stopHost(); showMenu(); },
    settingsForm(el) {
      const s = room.settings || {};
      el.innerHTML = `<div class="mg-grid mg-grid--2" style="gap:10px">
        <div class="mg-field"><label class="mg-label" for="setTurn">Čas poteze</label>
          <select class="mg-select" id="setTurn">${[[10, '10 s'], [20, '20 s'], [30, '30 s'], [0, 'brez']].map(([v, l]) => `<option value="${v}" ${v === (s.turnSec ?? 20) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="mg-stack" style="gap:6px;justify-content:center">
          <label class="mg-check"><input type="checkbox" id="setTouch" ${s.noTouch !== false ? 'checked' : ''}> Ladje se ne dotikajo</label>
          <label class="mg-check"><input type="checkbox" id="setCrates" ${s.crates !== false ? 'checked' : ''}> Powerup zaboji</label>
          <label class="mg-check"><input type="checkbox" id="setDup" ${s.dup ? 'checked' : ''}> Podvojeni kapitani dovoljeni</label>
        </div></div>`;
      el.querySelector('#setDup').addEventListener('change', e => { lobbyCfg.dup = e.target.checked; room.send('lcfg', { dup: lobbyCfg.dup }); });
      lobbyCfg.dup = !!s.dup;
      room.send('lcfg', { dup: lobbyCfg.dup });
      return () => {
        const settings = {
          turnSec: +el.querySelector('#setTurn').value,
          noTouch: el.querySelector('#setTouch').checked,
          crates: el.querySelector('#setCrates').checked,
          dup: el.querySelector('#setDup').checked,
        };
        settings.tv = Object.entries(picks).filter(([id, p]) => p.tv && room.players.some(x => x.id === id)).map(([id]) => id);
        settings.caps = assignCaptains(settings.dup, settings.tv);
        lastSettings = settings;
        return settings;
      };
    },
  });
  renderLobbyCaps();
}

function assignCaptains(dup, tv = []) {
  const out = {}, used = new Set();
  const ps = room.players.filter(p => !tv.includes(p.id));
  for (const p of ps) {
    const want = picks[p.id]?.cap;
    if (want && CAPTAINS[want] && (dup || !used.has(want))) { out[p.id] = want; used.add(want); }
  }
  for (const p of ps) {
    if (out[p.id]) continue;
    const free = CAPTAIN_IDS.filter(c => !used.has(c));
    const c = free.length ? free[0] : CAPTAIN_IDS[Math.floor(Math.random() * CAPTAIN_IDS.length)];
    out[p.id] = c;
    used.add(c);
  }
  return out;
}

function renderLobbyCaps() {
  const el = $('#lobbyCaps');
  if (!room || !visible('lobby')) return;
  const present = room.players.filter(p => !picks[p.id]?.tv);
  const n = present.length;
  const taken = {};
  for (const p of present) {
    const c = picks[p.id]?.cap;
    if (!c || p.id === ME) continue;
    taken[c] = taken[c] || { html: '', disabled: false };
    taken[c].html += `<span title="${esc(p.nickname)}">${esc(p.avatar?.emoji || '🙂')}</span>`;
    if (!lobbyCfg.dup) taken[c].disabled = true;
  }
  const modeTxt = n <= 1 ? 'Čakam igralce …' : n === 2 ? '⚔️ Dvoboj · mreža 10×10 · flota 5-4-3-3-2' : `👑 Battle royale (${n}) · mreža ${L.configFor('br', n).size}×${L.configFor('br', n).size} · flota ${L.configFor('br', n).fleet.join('-')}`;
  el.innerHTML = `<div class="mg-row mg-row--between"><h2 class="mg-title" style="margin:0">Kapitan</h2><span class="mg-badge mg-badge--cyan">${esc(modeTxt)}</span></div>
    ${isTV ? '<p class="mg-muted">Ta naprava je <b>TV</b> (opazovalec brez flote). Prikazala bo mreže vseh z meglo vojne, killfeed in lestvico preživelih.</p>'
      : `<div class="lj-caps lj-lobbycaps" id="lobbyCapBtns"></div>`}
    <button type="button" class="mg-btn mg-btn--ghost mg-btn--small lj-tvbtn" id="btnTv">${isTV ? '📱 Igram tudi jaz' : '📺 Ta naprava je TV (opazovalec)'}</button>`;
  if (!isTV) {
    if (taken[myPick]?.disabled) {
      const free = CAPTAIN_IDS.find(c => !taken[c]?.disabled);
      if (free) { myPick = free; room.send('pick', { cap: myPick, tv: isTV }); }
    }
    capButtons($('#lobbyCapBtns'), myPick, id => { myPick = id; S.save('ladjice:captain', id); room.send('pick', { cap: id, tv: isTV }); }, { taken });
  }
  $('#btnTv').onclick = () => {
    isTV = !isTV;
    try { const u = new URL(location.href); if (isTV) u.searchParams.set('tv', '1'); else u.searchParams.delete('tv'); history.replaceState(null, '', u); } catch { /* ignore */ }
    room.send('pick', { cap: myPick, tv: isTV });
  };
}

function wireRoom(r) {
  r.onPlayers(() => { renderLobbyCaps(); if (visible('play')) renderPlay(); if (visible('tv')) renderTV(); });
  r.on('pick', (p, from) => { picks[from] = { cap: CAPTAINS[p?.cap] ? p.cap : null, tv: !!p?.tv }; renderLobbyCaps(); });
  r.on('pickReq', (_p, from) => { if (from !== ME) { r.send('pick', { cap: myPick, tv: isTV }); if (r.isHost) r.send('lcfg', lobbyCfg); } });
  r.on('lcfg', (p, from) => { if (from === r.hostId) { lobbyCfg = { dup: !!p?.dup }; renderLobbyCaps(); } });
  r.onStart(settings => {
    lastSettings = settings;
    document.querySelectorAll('.mg-modal-back').forEach(x => x.remove());
    resetView();
    show('place');
    $('#placeWait').innerHTML = '<span class="mg-pulse">Pripravljam igro …</span>';
    if (r.isHost) hostNewGame(settings);
  });
  r.on('state', ({ state }) => { if (state?.v && !(H.active && r.isHost)) onState(state); });
  r.on('act', (p, from) => { if (r.isHost && H.active) hostAct(from, p?.a); });
  r.on('fleet', (p, from) => {
    if (!r.isHost || !H.active || !G || G.phase !== 'place') return;
    const ok = L.setFleet(G, from, p?.ships);
    if (p?.contract) L.chooseContract(G, from, p.contract);
    if (!ok) r.send('err', { to: from, err: 'bad_fleet' });
    hostCommit({ t: 'fleet', pid: from });
  });
  r.on('err', p => { if (p?.to === ME) { lockUntil = 0; errToast(p.err); } });
  r.on('emote', (p, from) => showEmote(from, p?.e));
  r.on('hostChanged', async ({ hostId }) => {
    if (hostId !== ME) return;
    const s = await r.getState().catch(() => null);
    if (s?.state?.v && (r.status === 'playing' || s.state.phase !== 'over')) {
      ui.toast('Host je odšel — igro vodiš ti.', { icon: '👑' });
      hostBegin(s.state, s.version);
      if (G.phase === 'play') setDeadline(G, absentFn);
      hostCommit();
    }
  });
  r.on('status', s => {
    if (s === 'lobby' && !visible('lobby') && !document.querySelector('.mg-modal-back')) { stopHost(); resetView(); showLobby(); }
  });
  r.on('kicked', () => { room = null; stopHost(); ui.toast('Host te je odstranil iz sobe.', { icon: '🚪' }); showMenu(); });
}

/* ===================================================================== */
/*  TV POGLED                                                            */
/* ===================================================================== */

function renderTV() {
  const st = shown;
  if (!st) return;
  const cur = st.phase === 'play' ? L.current(st) : null;
  const wrap = $('#tvGrids');
  const ps = st.players.filter(p => !p.noFleet);
  const ids = ps.map(p => p.id).join();
  if (wrap.dataset.ids !== ids) {
    wrap.dataset.ids = ids;
    wrap.innerHTML = ps.map(p => `<div class="lj-tvcard" data-id="${esc(p.id)}"><div class="mg-row" style="gap:8px"><span class="lj-tvcard__av"></span><span class="lj-tvcard__info"></span></div><div class="lj-grid"></div></div>`).join('');
  }
  for (const p of ps) {
    const card = wrap.querySelector(`.lj-tvcard[data-id="${CSS.escape(p.id)}"]`);
    card.classList.toggle('turn', cur?.id === p.id);
    card.classList.toggle('dead', !p.alive);
    card.querySelector('.lj-tvcard__av').innerHTML = ui.avatar(meta(p.id, st), 'sm');
    card.querySelector('.lj-tvcard__info').innerHTML = `<b>${esc(nick(p.id, st))}</b> <span class="mg-small mg-muted">${CAPTAINS[p.captain].icon} · 🚢 ${p.ships ? L.aliveShips(p).length : '?'} · 🔮${p.mana}</span>
      ${!p.alive ? `<span class="mg-badge">${st.mode === 'br' ? '👻 duh' : 'potopljen'}</span>` : ''}${p.alive && p.ships && L.aliveShips(p).length === 1 && st.phase === 'play' ? '<span class="mg-badge mg-badge--red">zadnji zdihljaj</span>' : ''}`;
    if (p.ships || st.phase !== 'place') drawGrid(card.querySelector('.lj-grid'), st, p, { viewer: null });
    else buildGrid(card.querySelector('.lj-grid'), st.size);
  }
  const alive = L.standings(st);
  $('#tvAlive').innerHTML = `<h2 class="mg-title" style="margin:0 0 8px">Preživeli</h2>
    <table class="mg-table"><tbody>${alive.map((p, i) => `<tr><td class="mg-rank">${i + 1}.</td><td>${ui.who(meta(p.id, st))}</td><td class="mg-num">${p.alive ? `🚢 ${p.ships ? L.aliveShips(p).length : '?'}` : '☠️'}</td><td class="mg-num">⚓ ${p.stats.sinks}</td></tr>`).join('')}</tbody></table>`;
  const b = $('#tvBanner');
  if (st.phase === 'over') b.textContent = st.winner ? `🏆 ${nick(st.winner, st)} je kralj morja!` : 'Konec';
  else if (cur) b.textContent = `Krog ${st.round} · na potezi ${nick(cur.id, st)}`;
}

/* ===================================================================== */
/*  Zagon                                                                */
/* ===================================================================== */

async function main() {
  try { isTV = new URLSearchParams(location.search).get('tv') === '1'; } catch { isTV = false; }
  FX.startOcean($('#ocean'));
  // obrazec ne sme poslati strani, preden je hub pripravljen
  $('#joinForm').addEventListener('submit', e => e.preventDefault());
  await hub.init({ gameId: GAME, scoreOrder: 'asc' });
  ME = hub.userId;
  ui.header({ title: 'Potapljanje ladjic' });
  $('#heroArt').innerHTML = FX.shipSvg(5, false);
  renderRules();
  const muteBtn = $('#btnMute');
  const setMuteLbl = () => { muteBtn.textContent = FX.isMuted() ? '🔇' : '🔊'; muteBtn.setAttribute('aria-label', FX.isMuted() ? 'Vklopi zvok' : 'Utišaj'); };
  setMuteLbl();
  muteBtn.addEventListener('click', () => { FX.unlockAudio(); FX.setMuted(!FX.isMuted()); setMuteLbl(); FX.sfx('click'); });
  document.addEventListener('pointerdown', () => FX.unlockAudio(), { once: true });
  $('#levelSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-lvl]');
    if (!b) return;
    soloLevel = b.dataset.lvl;
    FX.unlockAudio(); FX.sfx('click');
    renderMenuControls();
  });
  $('#btnSolo').addEventListener('click', startSolo);
  $('#btnDaily').addEventListener('click', startDaily);
  $('#btnCreate').addEventListener('click', createRoom);
  $('#joinCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
  $('#joinForm').addEventListener('submit', e => { e.preventDefault(); joinRoom($('#joinCode').value); });
  wirePlacement();
  wirePlay();
  setInterval(() => {
    updateTimers();
    // lokalni iztek poteze (solo)
    if (ctx.kind === 'solo' && G?.phase === 'play' && G.deadline && Date.now() > G.deadline && L.current(G).id === ME && !animating) {
      const a = L.randomShot(G, ME);
      if (a) { L.act(G, ME, a); G.ev.unshift({ k: 'timeout', pid: ME }); setDeadline(G); localCommit(); }
    }
  }, 250);
  window.addEventListener('resize', () => { if (shown && visible('play')) renderPlay(); });
  const code = hub.roomFromUrl();
  if (code) joinRoom(code); else showMenu();
}

main();
