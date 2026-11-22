/* =====================================================================
   HERODLE — skupno ogrodje načinov z namigi (Emoji, Kostum, Dosje).

   createHintMode(cfg) vrne modul z enakim vmesnikom kot modes/klasika.js:
     { id, label, icon, isSolved(store, date), isDone(store, date), mount(el, ctx), unmount(), currentPool() }
   cfg:
     id                          'emoji' | 'kostum' | 'dosje'
     intro                       kratko navodilo nad namigi
     board(hints, o) → HTML      prikaz namigov; o: { fresh, full, finished, wrong }
     counter(game) → besedilo    števec v statusni vrstici
     achievements(n) → [ključi]  dosežki ob rešitvi v n poskusih

   Lik dneva vedno prek ctx.daily (online: strežnik šteje napačne poskuse in vrne le
   dovoljene namige). V arhivu (ctx.archive = { date, heroId, entry, hero, onFinish })
   se igra lokalno z logic.stepGuess + visibleHints.
   ===================================================================== */
import { HINT_MODES, puzzleNumber, pluralPoskus, vPoskusih, hintComment, hintShareText, xpForHint, stepGuess, visibleHints } from '../logic.js';
import { createSearch, token } from '../search.js';
import { heroCard } from '../bonus.js';
import { shareOut, powFx, countdown, reduced } from '../share.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Število poskusov (napačni + pravilni). */
export const attemptsOf = g => (g.wrong | 0) + (g.solved && !g.gaveUp ? 1 : 0);

export function createHintMode(cfg) {
  const meta = HINT_MODES.find(m => m.id === cfg.id);
  const id = meta.id;
  let root = null, ctx = null, search = null, game = null, busy = false, timers = [], date = null, store = null, engine = null, gen = 0;

  const finished = () => !!(game.solved || game.gaveUp || game.lost);

  /* ---------------------------------------------------------------- vir resnice */
  function dailyEngine() {
    return {
      check: heroId => ctx.daily.check(id, date, heroId),
      hints: () => ctx.daily.hints(id, date),
      giveUp: () => ctx.daily.giveUp(id, date),
    };
  }
  function localEngine(a) {
    const vis = w => visibleHints(id, a.entry, w, a.hero);
    return {
      async check(heroId) {
        const r = stepGuess(id, { wrong: game.wrong, solved: game.solved }, heroId, a.heroId);
        return { ...r, hints: vis(r.wrong), ...(r.solved || r.lost ? { heroId: a.heroId } : {}) };
      },
      async hints() {
        return { wrong: game.wrong | 0, solved: !!game.solved, lost: !!game.lost, hints: vis(game.wrong | 0), ...(game.solved || game.lost ? { heroId: a.heroId } : {}) };
      },
      async giveUp() { return a.heroId; },
    };
  }

  /* ---------------------------------------------------------------- vmesnik */
  const mod = {
    id, label: meta.label, icon: meta.icon,
    isSolved: (st, d) => !!st.loadGame(id, d).solved,
    isDone: (st, d) => { const g = st.loadGame(id, d); return !!(g.solved || g.gaveUp || g.lost); },
    currentPool: () => id,
    mount(el, c) {
      root = el; ctx = c; gen++;
      date = ctx.archive?.date || ctx.date;
      store = ctx.store;
      engine = ctx.archive ? localEngine(ctx.archive) : dailyEngine();
      game = { wrong: 0, hints: null, lost: false, ...store.loadGame(id, date) };
      render();
      sync(gen);
    },
    unmount() {
      gen++;
      timers.forEach(clearTimeout); timers = [];
      search?.destroy(); search = null;
      if (root) root.innerHTML = '';
      root = null;
    },
  };

  const save = () => store.saveGame(id, date, game);

  /* ---------------------------------------------------------------- izris */
  function render() {
    timers.forEach(clearTimeout); timers = [];
    search?.destroy(); search = null;
    root.innerHTML = `<div class="hd-mode hd-hm hd-hm--${id}">
      <div class="hd-status">
        <span class="hd-status__no">#${puzzleNumber(date)}</span>
        <span class="hd-status__pool"><span aria-hidden="true">${meta.icon}</span> ${esc(meta.label)}</span>
        <span class="mg-spacer"></span>
        <span class="hd-status__n" id="hdCount"></span>
      </div>
      <p class="hd-hm__intro">${cfg.intro}</p>
      <div class="hd-hm__board" id="hmBoard" aria-live="polite"></div>
      <div id="hdSearch" class="hd-searchwrap"></div>
      <div class="hd-comment" id="hdComment" aria-live="polite"></div>
      <div id="hdEnd"></div>
      <div class="hd-hm__tries" id="hmTries"></div>
      <div class="hd-giveup" id="hdGiveUp"></div>
    </div>`;
    renderBoard(null);
    renderTries();
    updateCount();
    if (!finished()) {
      search = createSearch(root.querySelector('#hdSearch'), {
        pool: () => ctx.heroes,
        used: () => new Set(game.guesses),
        onPick: guess,
      });
      renderGiveUp();
    } else {
      showEnd();
    }
  }

  let full = null;   // vsi namigi (šele po koncu — hints.js se naloži dinamično)
  function renderBoard(fresh) {
    const el = root?.querySelector('#hmBoard');
    if (!el) return;
    if (!game.hints) { el.innerHTML = '<div class="hd-hm__loading mg-muted">Odpiram tajne spise …</div>'; return; }
    el.innerHTML = cfg.board(game.hints, { fresh: reduced() ? null : fresh, full, finished: finished(), wrong: game.wrong | 0 });
  }

  function renderTries() {
    const el = root?.querySelector('#hmTries');
    if (!el) return;
    const wrongIds = game.guesses.filter(g => g !== game.heroId || !game.solved);
    const extra = Math.max(0, (game.wrong | 0) - wrongIds.length);   // poskusi z druge naprave
    if (!wrongIds.length && !extra) { el.innerHTML = ''; return; }
    el.innerHTML = `<h3 class="hd-hm__h">Ni bil:</h3><div class="hd-chips">${wrongIds.slice().reverse().map(g => {
      const h = ctx.byId.get(g);
      return h ? `<span class="hd-chip">${token(h, 'sm')}<s>${esc(h.name)}</s></span>` : '';
    }).join('')}${extra ? `<span class="hd-chip hd-chip--more">+${extra} z druge naprave</span>` : ''}</div>`;
  }

  function updateCount() {
    const el = root?.querySelector('#hdCount');
    if (el) el.textContent = cfg.counter(game);
  }

  function renderGiveUp() {
    const el = root?.querySelector('#hdGiveUp');
    if (!el) return;
    if (finished() || id === 'dosje' || !(game.wrong | 0)) { el.innerHTML = ''; return; }
    const loud = (game.wrong | 0) >= 8;
    el.innerHTML = `<button type="button" class="mg-btn ${loud ? 'mg-btn--danger' : 'mg-btn--ghost mg-btn--small'}" id="hdGive">🏳️ Predam se</button>`;
    el.querySelector('#hdGive').addEventListener('click', giveUp);
  }

  /* ---------------------------------------------------------------- uskladitev s strežnikom */
  async function sync(g) {
    let res;
    try { res = await engine.hints(); } catch (e) {
      if (g === gen && root) { ctx.ui.toast(e.message || 'Namigov ni bilo mogoče naložiti.', { icon: '⚠️' }); renderBoard(null); }
      return;
    }
    if (g !== gen || !root) return;
    const before = game.hints ? shown(game.hints) : -1;
    game.wrong = Math.max(game.wrong | 0, res.wrong | 0);
    game.hints = res.hints;
    let changed = false;
    if (res.solved && !game.solved && !game.gaveUp) { game.solved = true; game.heroId = res.heroId; game.reported = true; changed = true; }
    if (res.lost && !game.lost && !game.solved) { game.lost = true; game.heroId = res.heroId; game.reported = true; changed = true; }
    save();
    if (changed) {
      // rešeno/izgubljeno na drugi napravi: zapiši statistiko, brez ponovne nagrade
      if (!ctx.archive) store.recordDay(id, date, { solved: !!game.solved, attempts: attemptsOf(game), gaveUp: false, lost: !!game.lost });
      render();
      ctx.onChange();
      return;
    }
    renderBoard(before >= 0 && shown(game.hints) > before ? shown(game.hints) - 1 : null);
    updateCount();
    renderGiveUp();
    if (finished()) loadFull();
  }

  const shown = h => (h.emoji?.length ?? h.dossier?.length ?? ((h.dominant ? 1 : 0) + (h.symbol ? 1 : 0)));

  async function loadFull() {
    if (full || !game.heroId) return;
    try {
      const { HINTS } = await import('../hints.js');
      full = HINTS[game.heroId] || null;
      if (root) renderBoard(null);
    } catch { /* kartica brez polnih namigov */ }
  }

  /* ---------------------------------------------------------------- poskus */
  async function guess(hero) {
    if (busy || finished() || game.guesses.includes(hero.id)) return;
    busy = true;
    search?.setDisabled(true);
    const g = gen;
    let res;
    try {
      res = await engine.check(hero.id);
    } catch (e) {
      busy = false;
      if (g !== gen || !root) return;
      search?.setDisabled(false);
      ctx.ui.toast(e.message || 'Napaka pri preverjanju.', { icon: '⚠️' });
      if (e.code === 'finished') sync(gen);
      return;
    }
    if (g !== gen || !root) { busy = false; return; }
    const before = game.hints ? shown(game.hints) : 0;
    game.guesses.push(hero.id);
    if (res.hints) game.hints = res.hints;
    game.wrong = res.wrong ?? game.wrong;
    if (res.solved) { game.solved = true; game.heroId = res.heroId || hero.id; }
    else if (res.lost) { game.lost = true; game.heroId = res.heroId; }
    save();
    const after = game.hints ? shown(game.hints) : 0;
    renderBoard(after > before ? after - 1 : null);
    renderTries();
    updateCount();
    renderGiveUp();
    root.querySelector('#hdComment').textContent = hintComment(id, game.wrong | 0, !!res.solved, !!res.lost);
    if (res.solved) { await win(); return; }
    if (res.lost) { await lose(); return; }
    ctx.sound.buzz();
    if (after > before) timers.push(setTimeout(() => ctx.sound.ding(), 260));
    search?.shake();
    busy = false;
    search?.setDisabled(false);
    search?.focus();
  }

  /* ---------------------------------------------------------------- konec */
  async function win() {
    ctx.sound.fanfare();
    powFx();
    ctx.ui.winFx?.('confetti');
    const n = attemptsOf(game);
    if (!ctx.archive) store.recordDay(id, date, { solved: true, attempts: n, gaveUp: false });
    search?.destroy(); search = null;
    root.querySelector('#hdSearch').innerHTML = '';
    busy = false;
    if (!game.reported) {
      game.reported = true;
      save();
      report(n);
    }
    await sleep(reduced() ? 150 : 900);
    if (!root) return;
    showEnd();
    ctx.onChange();
  }

  async function report(n) {
    const { hub } = ctx;
    if (ctx.archive) { ctx.archive.onFinish({ mode: id, solved: true, attempts: n }); return; }
    try {
      await hub.submitScore(n, { seed: `${date}:${id}`, meta: { mode: id } });
      await hub.awardXp(xpForHint({ solved: true, attempts: n }), `herodle: ${id}`);
      hub.reportGame({ won: true, players: 1, score: n, daily: true })
        .then(() => hub.reportEvent('herodle:mode', 1))
        .then(() => id === 'dosje' && hub.reportEvent('herodle:dossier', n))
        .catch(e => console.warn('[herodle] reportGame', e));
      await ctx.unlock('prvi-junak');
      for (const k of cfg.achievements(n)) await ctx.unlock(k);
      await ctx.afterSolve?.();
    } catch (e) {
      console.warn('[herodle] report', e);
    }
    ctx.onChange();
  }

  function reportLoss() {
    if (game.reported) return;
    game.reported = true;
    save();
    if (ctx.archive) { ctx.archive.onFinish({ mode: id, solved: false, attempts: attemptsOf(game) }); return; }
    ctx.hub.reportGame({ won: false, players: 1, daily: true }).catch(e => console.warn(e));
  }

  async function lose() {
    ctx.sound.buzz();
    if (!ctx.archive) store.recordDay(id, date, { solved: false, attempts: game.wrong | 0, gaveUp: false, lost: true });
    search?.destroy(); search = null;
    root.querySelector('#hdSearch').innerHTML = '';
    busy = false;
    reportLoss();
    showEnd();
    ctx.onChange();
  }

  async function giveUp() {
    if (busy || finished()) return;
    const ok = await ctx.ui.modal({
      title: 'Predaš se?',
      html: `<p>Razkrijem lik ${ctx.archive ? 'tega dne' : 'dneva'} v načinu <b>${esc(meta.label)}</b>.${ctx.archive ? '' : ' Rezultat ne gre na lestvico, niz v tem načinu se prekine.'}</p>`,
      actions: [{ label: 'Še poskusim', value: false }, { label: '🏳️ Predam se', value: true, kind: 'danger' }],
    });
    if (!ok || !root) return;
    busy = true;
    try {
      const heroId = await engine.giveUp();
      game.gaveUp = true;
      game.heroId = heroId;
      save();
      if (!ctx.archive) store.recordDay(id, date, { solved: false, attempts: game.wrong | 0, gaveUp: true });
      reportLoss();
      search?.destroy(); search = null;
      root.querySelector('#hdSearch').innerHTML = '';
      root.querySelector('#hdComment').textContent = 'Naslednjič bo bolje. Junaki tudi kdaj izgubijo.';
      showEnd();
      ctx.onChange();
    } catch (e) {
      ctx.ui.toast(e.message || 'Napaka.', { icon: '⚠️' });
    } finally {
      busy = false;
    }
  }

  function showEnd() {
    renderGiveUp();
    loadFull();
    const el = root.querySelector('#hdEnd');
    const hero = ctx.byId.get(game.heroId);
    if (!hero) { el.innerHTML = ''; return; }
    const n = attemptsOf(game);
    const next = ctx.archive ? null : ctx.nextMode?.(id);
    const title = game.solved
      ? `Bravo, uganil si ${vPoskusih(n).replace(String(n), `<b>${n}</b>`)}!`
      : game.lost ? 'Dosje je zaprt. Iskali smo …' : 'Predaja. To je bil …';
    el.innerHTML = `<section class="hd-endcard ${game.solved ? 'ok' : 'lost'}">
      <div class="hd-end__title">${title}</div>
      <div class="hd-end__hero">${token(hero, 'lg')}<b>${esc(hero.name)}</b></div>
      ${ctx.archive ? '' : '<div class="hd-end__next">Nov lik čez <b class="hd-cd">--:--:--</b></div>'}
      <div class="hd-end__btns">
        <button type="button" class="mg-btn mg-btn--primary" data-act="share">📤 Deli rezultat</button>
        ${ctx.archive ? '' : '<button type="button" class="mg-btn mg-btn--cyan" data-act="stats">📊 Statistika</button>'}
        ${next ? `<button type="button" class="mg-btn mg-btn--ghost" data-act="next">Naslednji način → ${next.icon} ${esc(next.label)}</button>` : ''}
        ${!ctx.archive && ctx.shareAll ? '<button type="button" class="mg-btn mg-btn--ghost" data-act="all">📋 Deli vse današnje</button>' : ''}
      </div>
      <div class="hd-end__card">${heroCard(hero, ctx.byId)}</div>
    </section>`;
    const cd = el.querySelector('.hd-cd');
    if (cd) countdown(cd, ctx.util, timers);
    el.querySelector('[data-act="share"]').addEventListener('click', () => shareOut(ctx.ui, hintShareText({
      date, mode: id, attempts: n, solved: !!game.solved, gaveUp: !!game.gaveUp, lost: !!game.lost, archive: !!ctx.archive,
    })));
    el.querySelector('[data-act="stats"]')?.addEventListener('click', () => ctx.openStats(id));
    el.querySelector('[data-act="next"]')?.addEventListener('click', () => { ctx.goMode(next.id); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    el.querySelector('[data-act="all"]')?.addEventListener('click', () => ctx.shareAll());
  }

  return mod;
}

/** Skupni števec: »3 poskusi«. */
export const triesCounter = g => { const n = attemptsOf(g); return n ? `${n} ${pluralPoskus(n)}` : ''; };
