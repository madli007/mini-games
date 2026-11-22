/* =====================================================================
   HERODLE — način Klasika 🧩 (ugibanje po atributih, 3 bazeni).

   Vmesnik načina (enak za vse načine; 2. faza doda emoji.js, kostum.js, dosje.js):
     { id, label, icon, isSolved(date), mount(el, ctx), unmount() }
   ctx (iz main.js): { hub, ui, util, daily, heroes, byId, sound, store, date, unlock(key),
                       onChange(), openStats(mode), showLegend() }
   ===================================================================== */
import {
  ATTRS, POOLS, POOL_IDS, poolHeroes, poolLabel, compare, attrValue, allGreen, hardModeViolation, comment,
  shareText, pluralPoskus, vPoskusih, pickBonus, xpFor, streaks, puzzleNumber,
} from '../logic.js';
import { createSearch, token } from '../search.js';
import { runBonus, heroCard, bonusSummary } from '../bonus.js';
import { shareOut, powFx } from '../share.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const SYM = { g: '✓', y: '≈', r: '✗' };
const FLIP_GAP = 120, FLIP_DUR = 460;

let root = null, ctx = null, search = null, mode = 'klasika', game = null, busy = false, timers = [];

export const id = 'klasika';
export const label = 'Klasika';
export const icon = '🧩';
export const pools = POOLS;

/** Ali je rešen (ali predan) dan v bazenu. */
export function isDone(store, m, date) { const g = store.loadGame(m, date); return g.solved || g.gaveUp; }
/** Kljukica na zavihku: rešen bazen Mešano. */
export function isSolved(store, date) { return store.loadGame('klasika', date).solved; }

export function mount(el, c) {
  root = el; ctx = c;
  // arhiv (2. faza): ctx.archive = { mode, onFinish }, ctx.date = pretekli dan, ctx.daily = lokalni lik, ctx.store = archiveView()
  const saved = ctx.archive?.mode || ctx.store.getSettings().pool;
  mode = POOL_IDS.includes(saved) ? saved : 'klasika';
  render();
}

export function unmount() {
  timers.forEach(clearTimeout); timers = [];
  search?.destroy(); search = null;
  if (root) root.innerHTML = '';
  root = null;
}

/** Trenutni bazen (za stranski panel). */
export const currentPool = () => mode;

/* ------------------------------------------------------------------ */

function poolList() { return poolHeroes(mode, ctx.heroes); }
const finished = () => game.solved || game.gaveUp;

function render() {
  timers.forEach(clearTimeout); timers = [];
  search?.destroy(); search = null;
  game = ctx.store.loadGame(mode, ctx.date);
  const hard = game.hard ?? ctx.store.getSettings().hard;
  root.innerHTML = `<div class="hd-mode">
    ${ctx.archive ? '' : `<div class="hd-pools" role="tablist" aria-label="Bazen">${POOLS.map(p => {
      return `<button class="hd-pool" role="tab" data-p="${p.id}" aria-selected="${p.id === mode}">${esc(p.label)}<span class="hd-pool__mark"></span></button>`;
    }).join('')}</div>`}
    <div class="hd-status">
      <span class="hd-status__no">#${puzzleNumber(ctx.date)}</span>
      <span class="hd-status__pool">Klasika · ${esc(poolLabel(mode))}</span>
      <span class="mg-spacer"></span>
      ${hard ? '<span class="mg-badge mg-badge--red" title="Težki način">💀 težki</span>' : ''}
      <span class="hd-status__n" id="hdCount"></span>
    </div>
    <div id="hdSearch" class="hd-searchwrap"></div>
    <div class="hd-comment" id="hdComment" aria-live="polite"></div>
    <div id="hdEnd"></div>
    <div class="hd-board">
      <div class="hd-colhead" aria-hidden="false">${ATTRS.map(a => `<button type="button" class="hd-colh" data-k="${a.key}" title="${esc(a.label)}"><span class="i">${a.icon}</span><span class="t">${esc(a.label)}</span></button>`).join('')}</div>
      <div class="hd-rows" id="hdRows"></div>
      <div class="hd-empty mg-muted" id="hdEmpty">Vpiši prvega junaka. Barve ti povedo, kako blizu si.</div>
    </div>
    <div class="hd-giveup" id="hdGiveUp"></div>
  </div>`;

  refreshPools();
  root.querySelectorAll('.hd-pool').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.p === mode || busy) return;
    mode = b.dataset.p;
    ctx.store.setSettings({ pool: mode });
    render();
    ctx.onChange();
  }));
  root.querySelectorAll('.hd-colh').forEach(b => b.addEventListener('click', () => ctx.showLegend(b.dataset.k)));

  const rows = root.querySelector('#hdRows');
  rows.innerHTML = game.guesses.slice().reverse().map(g => rowHtml(g, false)).join('');
  updateCount();

  if (!finished()) {
    search = createSearch(root.querySelector('#hdSearch'), {
      pool: poolList,
      used: () => new Set(game.guesses.map(g => g.id)),
      onPick: guess,
    });
    renderGiveUp();
  } else {
    showEnd(false);
  }
}

/** Kljukice na bazenih (rešeno ✓ / predano ✗). */
function refreshPools() {
  root?.querySelectorAll('.hd-pool').forEach(b => {
    const g = ctx.store.loadGame(b.dataset.p, ctx.date);
    b.querySelector('.hd-pool__mark').innerHTML = g.solved ? '<i class="ok">✓</i>' : g.gaveUp ? '<i class="no">✗</i>' : '';
  });
}

function updateCount() {
  const n = game.guesses.length;
  root.querySelector('#hdCount').textContent = n ? `${n} ${pluralPoskus(n)}` : '';
  root.querySelector('#hdEmpty').hidden = n > 0;
}

function renderGiveUp() {
  const el = root.querySelector('#hdGiveUp');
  if (finished() || !game.guesses.length) { el.innerHTML = ''; return; }
  const loud = game.guesses.length >= 10;
  el.innerHTML = `<button type="button" class="mg-btn ${loud ? 'mg-btn--danger' : 'mg-btn--ghost mg-btn--small'}" id="hdGive">🏳️ Predam se</button>`;
  el.querySelector('#hdGive').addEventListener('click', giveUp);
}

function cellHtml(h, a, r, k) {
  const c = r[a.key];
  const full = attrValue(h, a.key), short = attrValue(h, a.key, true);
  const arrow = a.key === 'year' && r.dir ? `<span class="hd-arr ${r.dir}" aria-label="${r.dir === 'up' ? 'kasneje' : 'prej'}">${r.dir === 'up' ? '↑' : '↓'}</span>` : '';
  const desc = { g: 'pravilno', y: a.key === 'year' ? 'blizu' : 'delno', r: 'narobe' }[c];
  return `<div class="hd-cell c-${c}" style="--i:${k}" title="${esc(a.label)}: ${esc(full)} (${desc})">
    <span class="hd-cell__in"><span class="v-full">${esc(full)}</span><span class="v-short">${esc(short)}</span>
    <span class="hd-cell__foot"><i class="sym" aria-hidden="true">${SYM[c]}</i>${arrow}</span></span>
    <span class="mg-hidden">${desc}</span></div>`;
}

function rowHtml(g, fresh) {
  const h = ctx.byId.get(g.id);
  const win = allGreen(g.r);
  return `<div class="hd-row${fresh ? ' fresh' : ''}${win ? ' win' : ''}" data-id="${g.id}">
    <div class="hd-row__who">${token(h)}<b>${esc(h.name)}</b></div>
    <div class="hd-row__cells">${ATTRS.map((a, k) => cellHtml(h, a, g.r, k)).join('')}</div></div>`;
}

/* ------------------------------------------------------------------ */
/*  Poskus                                                             */
/* ------------------------------------------------------------------ */

async function guess(hero) {
  if (busy || finished()) return;
  if (game.guesses.some(g => g.id === hero.id)) return;
  const hard = game.hard ?? ctx.store.getSettings().hard;
  if (hard) {
    const why = hardModeViolation(game.guesses.map(g => ({ hero: ctx.byId.get(g.id), result: g.r })), hero);
    if (why) {
      ctx.sound.buzz();
      search?.shake();
      ctx.ui.toast(`💀 Težki način: ${why}`, { duration: 3200 });
      return;
    }
  }
  busy = true;
  search?.setDisabled(true);
  let res;
  try {
    res = await ctx.daily.check(mode, ctx.date, hero.id);
  } catch (e) {
    busy = false;
    search?.setDisabled(false);
    ctx.ui.toast(e.message || 'Napaka pri preverjanju.', { icon: '⚠️' });
    return;
  }
  if (game.hard == null) game.hard = !!hard;
  game.guesses.push({ id: hero.id, r: res.result });
  if (res.solved) { game.solved = true; game.heroId = res.heroId || hero.id; }
  ctx.store.saveGame(mode, ctx.date, game);

  const rows = root.querySelector('#hdRows');
  rows.insertAdjacentHTML('afterbegin', rowHtml(game.guesses.at(-1), !reduced()));
  updateCount();
  renderGiveUp();
  const anim = reduced() ? 0 : (ATTRS.length - 1) * FLIP_GAP + FLIP_DUR;
  if (!reduced()) ATTRS.forEach((a, k) => timers.push(setTimeout(() => ctx.sound.tick(res.result[a.key]), k * FLIP_GAP + FLIP_DUR / 2)));
  await sleep(anim + 60);
  if (!root) return;
  const n = game.guesses.length;
  root.querySelector('#hdComment').textContent = comment(res.result, n, res.solved);
  if (res.solved) {
    await win();
  } else {
    ctx.sound.whoosh();
    busy = false;
    search?.setDisabled(false);
    search?.focus();
  }
}

/* ------------------------------------------------------------------ */
/*  Zmaga / predaja                                                    */
/* ------------------------------------------------------------------ */

async function win() {
  ctx.sound.fanfare();
  pow();
  ctx.ui.winFx?.('confetti');
  const n = game.guesses.length;
  ctx.store.recordDay(mode, ctx.date, { solved: true, attempts: n, gaveUp: false, hard: !!game.hard });
  const firstToday = ctx.store.markSolvedDay(ctx.date);
  search?.destroy(); search = null;
  root.querySelector('#hdSearch').innerHTML = '';
  busy = false;
  if (!game.reported) {
    game.reported = true;
    ctx.store.saveGame(mode, ctx.date, game);
    report(n, firstToday);
  }
  refreshPools();
  await sleep(reduced() ? 200 : 1100);
  if (!root) return;
  showEnd(true);
  ctx.onChange();
}

async function report(n, firstToday) {
  const { hub } = ctx;
  if (ctx.archive) { ctx.archive.onFinish({ mode, solved: true, attempts: n }); ctx.onChange(); return; }
  try {
    await hub.submitScore(n, { seed: `${ctx.date}:${mode}`, meta: { hard: !!game.hard, mode } });
    await hub.awardXp(xpFor({ solved: true, attempts: n }), 'herodle: klasika');
    hub.reportGame({ won: true, players: 1, score: n, daily: true })
      .then(() => hub.reportEvent('herodle:classic', n))
      .then(() => firstToday && hub.reportEvent('herodle:solved-day', 1))
      .then(() => firstToday && hub.reportEvent('herodle:mode', 1))
      .catch(e => console.warn('[herodle] reportGame', e));
    await ctx.unlock('prvi-junak');
    if (n === 1) await ctx.unlock('jasnovidec');
    if (n <= 3) await ctx.unlock('trojka');
    if (game.hard && n <= 5) await ctx.unlock('lobanja');
    const st = streaks(ctx.store.solvedDays(), ctx.date).current;
    if (st >= 7) await ctx.unlock('teden');
    if (st >= 30) await ctx.unlock('mesec');
    if (ctx.store.loadGame('klasika-mcu', ctx.date).solved && ctx.store.loadGame('klasika-dc', ctx.date).solved) await ctx.unlock('oba-svetova');
    await ctx.afterSolve?.();
  } catch (e) {
    console.warn('[herodle] report', e);
  }
  ctx.onChange();
}

async function giveUp() {
  if (busy || finished()) return;
  const ok = await ctx.ui.modal({
    title: 'Predaš se?',
    html: ctx.archive ? `<p>Razkrijem lik tega dne v bazenu <b>${esc(poolLabel(mode))}</b>.</p>`
      : `<p>Razkrijem lik dneva v bazenu <b>${esc(poolLabel(mode))}</b>. Rezultat ne gre na lestvico, niz v tem bazenu se prekine.</p>`,
    actions: [{ label: 'Še poskusim', value: false }, { label: '🏳️ Predam se', value: true, kind: 'danger' }],
  });
  if (!ok || !root) return;
  busy = true;
  try {
    const heroId = await ctx.daily.giveUp(mode, ctx.date);
    game.gaveUp = true;
    game.heroId = heroId;
    if (game.hard == null) game.hard = !!ctx.store.getSettings().hard;
    ctx.store.saveGame(mode, ctx.date, game);
    ctx.store.recordDay(mode, ctx.date, { solved: false, attempts: game.guesses.length, gaveUp: true, hard: !!game.hard });
    if (!game.reported) {
      game.reported = true;
      ctx.store.saveGame(mode, ctx.date, game);
      if (ctx.archive) ctx.archive.onFinish({ mode, solved: false, attempts: game.guesses.length });
      else ctx.hub.reportGame({ won: false, players: 1, daily: true }).catch(e => console.warn(e));
    }
    search?.destroy(); search = null;
    root.querySelector('#hdSearch').innerHTML = '';
    root.querySelector('#hdComment').textContent = 'Naslednjič bo bolje. Junaki tudi kdaj izgubijo.';
    refreshPools();
    showEnd(false);
    ctx.onChange();
  } catch (e) {
    ctx.ui.toast(e.message || 'Napaka.', { icon: '⚠️' });
  } finally {
    busy = false;
  }
}

const pow = () => powFx();

/* ------------------------------------------------------------------ */
/*  Konec dneva: bonus, kartica, deljenje, odštevalnik                  */
/* ------------------------------------------------------------------ */

function showEnd(fresh) {
  renderGiveUp();
  const el = root.querySelector('#hdEnd');
  const hero = ctx.byId.get(game.heroId);
  if (!hero) { el.innerHTML = ''; return; }
  const n = game.guesses.length;
  const other = ctx.archive ? [] : POOLS.filter(p => p.id !== mode && !isDone(ctx.store, p.id, ctx.date));
  const nextMode = ctx.archive ? null : ctx.nextMode?.('klasika');
  el.innerHTML = `<section class="hd-endcard ${game.solved ? 'ok' : 'lost'}">
    <div class="hd-end__title">${game.solved
      ? `Bravo, uganil si ${vPoskusih(n).replace(String(n), `<b>${n}</b>`)}!${game.hard ? ' 💀' : ''}`
      : 'Predaja. Danes je bil to …'}</div>
    <div class="hd-end__hero">${token(hero, 'lg')}<b>${esc(hero.name)}</b></div>
    <div id="hdBonus" class="hd-bonus"></div>
    ${ctx.archive ? '' : '<div class="hd-end__next">Naslednji junak čez <b id="hdCd">--:--:--</b></div>'}
    <div class="hd-end__btns">
      <button type="button" class="mg-btn mg-btn--primary" id="hdShare">📤 Deli rezultat</button>
      <button type="button" class="mg-btn mg-btn--cyan" id="hdStats">📊 Statistika</button>
      ${other.length ? `<button type="button" class="mg-btn mg-btn--ghost" id="hdNext" data-p="${other[0].id}">Še ${esc(other[0].label)} →</button>` : ''}
      ${nextMode ? `<button type="button" class="mg-btn mg-btn--ghost" id="hdNextMode">Naslednji način → ${nextMode.icon} ${esc(nextMode.label)}</button>` : ''}
      ${!ctx.archive && ctx.shareAll ? '<button type="button" class="mg-btn mg-btn--ghost" id="hdShareAll">📋 Deli vse današnje</button>' : ''}
    </div>
    <div id="hdCard"></div>
  </section>`;
  el.querySelector('#hdShare').addEventListener('click', share);
  el.querySelector('#hdStats').addEventListener('click', () => ctx.openStats(mode));
  el.querySelector('#hdNextMode')?.addEventListener('click', () => { ctx.goMode(nextMode.id); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  el.querySelector('#hdShareAll')?.addEventListener('click', () => ctx.shareAll());
  el.querySelector('#hdNext')?.addEventListener('click', e => {
    mode = e.currentTarget.dataset.p;
    ctx.store.setSettings({ pool: mode });
    render();
    ctx.onChange();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  tickCountdown();
  if (game.solved) bonus(fresh); else el.querySelector('#hdCard').innerHTML = heroCard(hero, ctx.byId);
}

function tickCountdown() {
  const cd = root?.querySelector('#hdCd');
  if (!cd) return;
  const next = nextMidnight();
  const s = Math.max(0, Math.round((next - Date.now()) / 1000));
  cd.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':');
  timers.push(setTimeout(tickCountdown, 1000));
}

function nextMidnight() {
  const { util } = ctx;
  const start = util.dayStart(new Date()).getTime();
  return util.dayStart(new Date(start + 30 * 3600e3)).getTime();
}

async function bonus(fresh) {
  const hero = ctx.byId.get(game.heroId);
  const box = root.querySelector('#hdBonus');
  const qs = pickBonus(hero, ctx.heroes, `${ctx.date}:herodle:bonus:${mode}`);
  const b = game.bonus;
  const done = () => {
    box.innerHTML = `<div class="hd-bonus__done"><span>Bonus</span><b>${b.stars ? '⭐'.repeat(b.stars) : '0 ⭐'}</b></div>${bonusSummary(qs, b.answers)}`;
    root.querySelector('#hdCard').innerHTML = heroCard(hero, ctx.byId);
  };
  if (!qs.length || b.done) { if (!qs.length) b.done = true; done(); return; }
  const start = async () => {
    box.innerHTML = '<div class="hd-bq-host"></div>';
    await runBonus(box.querySelector('.hd-bq-host'), {
      questions: qs, answers: b.answers, byId: ctx.byId, sound: ctx.sound,
      onAnswer: (i, ans, st) => {
        b.answers[i] = { ans, stars: st };
        b.stars += st;
        if (st > 0) b.correct++;
        ctx.store.saveGame(mode, ctx.date, game);   // osvežitev ne ponovi vprašanja
      },
    });
    if (!root) return;
    b.done = true;
    ctx.store.saveGame(mode, ctx.date, game);
    if (!b.reported) {
      b.reported = true;
      ctx.store.saveGame(mode, ctx.date, game);
      const { hub } = ctx;
      if (b.stars > 0) {
        if (!ctx.archive) hub.awardXp(5 * b.stars, 'herodle: bonus').catch(() => {});   // arhiv: ⭐ le za naloge
        hub.reportEvent('herodle:star', 1, { times: b.stars }).catch(() => {});
      }
      hub.reportEvent('herodle:stars', b.stars).catch(() => {});
      if (b.correct >= 3 && qs.length >= 3) ctx.unlock('vse-zvezdice');
      if (b.stars >= 3) ctx.ui.winFx?.('stars');
    }
    done();
    ctx.onChange();
  };
  if (b.answers.length === 0 && fresh) {
    box.innerHTML = '<div class="hd-bonus__intro">⭐ Bonus krog: 3 vprašanja o tem liku …</div>';
    await sleep(900);
    if (root) start();
  } else {
    box.innerHTML = `<button type="button" class="mg-btn mg-btn--pink mg-btn--block mg-pulse" id="hdBonusGo">⭐ ${b.answers.length ? 'Nadaljuj bonus' : 'Bonus krog'} (${qs.length - b.answers.length} ${qs.length - b.answers.length === 1 ? 'vprašanje' : 'vprašanja'})</button>`;
    box.querySelector('#hdBonusGo').addEventListener('click', start, { once: true });
  }
}

async function share() {
  const results = game.guesses.map(g => g.r);
  const text = shareText({ date: ctx.date, mode, results, solved: game.solved, gaveUp: game.gaveUp, hard: !!game.hard,
    stars: game.bonus.done ? game.bonus.stars : null });
  await shareOut(ctx.ui, ctx.archive ? text.replace(/^Herodle #(\d+)/, 'Herodle #$1 (arhiv)') : text);
}

