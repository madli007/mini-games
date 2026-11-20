/* =====================================================================
   MINI GAMES — skupni UI gradniki (glava, lobby, lestvica, toast, modal,
   odštevanje, končni zaslon). Uvozi prek hub.js:
     import { hub, ui } from '../../shared/hub.js';
   ===================================================================== */

import { hub } from './hub.js';
import {
  esc, level as levelOf, validateNickname, AVATAR_EMOJIS, AVATAR_COLORS, randomAvatar,
} from './util.js';

const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';

/** Ustvari element iz HTML niza. */
function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** HTML avatarja. */
function avatarHtml(avatar, size = '') {
  const a = avatar || { emoji: '❔', color: '#888' };
  return `<span class="mg-avatar ${size ? 'mg-avatar--' + size : ''}" style="--c:${esc(a.color)}">${esc(a.emoji)}</span>`;
}

let toastWrap = null;

export const ui = {
  /** Vstavi ui.css, če ga stran še nima. */
  _ensureCss() {
    if (typeof document === 'undefined') return;
    const href = new URL('./ui.css', import.meta.url).href;
    const has = [...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href === href);
    if (!has) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      document.head.appendChild(l);
    }
  },

  /** HTML avatarja (emoji v barvnem kvadratku). size: '' | 'sm' | 'lg' */
  avatar: avatarHtml,

  /** HTML »avatar + vzdevek«. */
  who(p, size = 'sm') {
    return `<span class="mg-who">${avatarHtml(p?.avatar, size)}<b>${esc(p?.nickname || '???')}</b></span>`;
  },

  /** Escape za HTML. */
  esc,

  /* ------------------------------ glava ------------------------------ */

  /**
   * Zgornja vrstica: »← Hub«, ime igre, profil (avatar, vzdevek, nivo). Klik na profil odpre urejanje.
   * @param {{title:string, back?:string|false, parent?:HTMLElement}} opt back: povezava za gumb (privzeto hub)
   * @returns {HTMLElement}
   */
  header({ title, back, parent = document.body } = {}) {
    const href = back === false ? null : (back || hub.link(''));
    const el = h(`<header class="mg-header">
      ${href ? `<a class="mg-btn mg-btn--ghost mg-btn--small mg-header__back" href="${esc(href)}">← Hub</a>` : ''}
      <div class="mg-header__title">${esc(title || '')}</div>
      <span class="mg-offline mg-hidden" title="">Offline</span>
      <button class="mg-profile-chip" type="button" aria-label="Uredi profil"></button>
    </header>`);
    const chip = el.querySelector('.mg-profile-chip');
    const off = el.querySelector('.mg-offline');
    chip.addEventListener('click', () => ui.profileModal());
    const render = p => {
      if (hub.offline) {
        off.classList.remove('mg-hidden');
        off.title = 'Offline način: podatki so shranjeni samo v tem brskalniku. ' + (hub.offlineReason || '');
      }
      if (!p) { chip.innerHTML = '<span class="mg-profile-chip__name">Profil</span>'; return; }
      const lv = levelOf(p.xp);
      chip.innerHTML = `${avatarHtml(p.avatar)}<span class="mg-profile-chip__info">
        <span class="mg-profile-chip__name">${esc(p.nickname)}</span>
        <span class="mg-profile-chip__lvl">NIV ${lv.level}</span>
        <span class="mg-xpbar"><i style="width:${(lv.progress * 100).toFixed(1)}%"></i></span></span>`;
      chip.title = `${p.xp} XP · nivo ${lv.level} (${lv.current}/${lv.next})`;
    };
    render(hub.profile);
    hub.onProfile(render);
    parent.prepend(el);
    return el;
  },

  /* ------------------------------ toast ------------------------------ */

  /**
   * Kratko obvestilo na dnu zaslona.
   * @param {string} text
   * @param {{icon?:string, duration?:number}} [opt]
   */
  toast(text, { icon = '', duration = 2600 } = {}) {
    if (typeof document === 'undefined') return;
    if (!toastWrap || !toastWrap.isConnected) {
      toastWrap = h('<div class="mg-toasts" role="status" aria-live="polite"></div>');
      document.body.appendChild(toastWrap);
    }
    const t = h(`<div class="mg-toast">${icon ? `<span class="mg-toast__icon">${esc(icon)}</span>` : ''}<span>${esc(text)}</span></div>`);
    toastWrap.appendChild(t);
    setTimeout(() => { t.classList.add('mg-out'); setTimeout(() => t.remove(), 320); }, duration);
  },

  /* ------------------------------ modal ------------------------------ */

  /**
   * Modalno okno. Vrne obljubo z vrednostjo izbranega gumba (ali null ob zaprtju).
   * @param {{title?:string, html?:string, content?:HTMLElement, actions?:{label:string, value?:any, kind?:'primary'|'ghost'|'danger'|'pink'|'cyan'|'green', close?:boolean}[], dismissible?:boolean, wide?:boolean, onOpen?:(el:HTMLElement, close:(v:any)=>void)=>void}} opt
   *   close:false → gumb ne zapre okna (uporabi onOpen za lastno logiko)
   * @returns {Promise<any>}
   */
  modal({ title = '', html = '', content = null, actions = [{ label: 'V redu', value: true, kind: 'primary' }], dismissible = true, wide = false, onOpen } = {}) {
    return new Promise(resolve => {
      const back = h(`<div class="mg-modal-back"><div class="mg-modal ${wide ? 'mg-modal--wide' : ''}" role="dialog" aria-modal="true">
        ${title ? `<h2 class="mg-modal__title">${esc(title)}</h2>` : ''}
        <div class="mg-modal__body">${html}</div>
        <div class="mg-modal__actions"></div></div></div>`);
      const box = back.querySelector('.mg-modal');
      if (content) box.querySelector('.mg-modal__body').appendChild(content);
      const close = v => {
        back.remove();
        document.removeEventListener('keydown', onKey);
        resolve(v);
      };
      const onKey = e => { if (e.key === 'Escape' && dismissible) close(null); };
      const bar = box.querySelector('.mg-modal__actions');
      if (!actions.length) bar.remove();
      for (const a of actions) {
        const b = h(`<button type="button" class="mg-btn mg-btn--${a.kind || 'ghost'}">${esc(a.label)}</button>`);
        b.dataset.value = JSON.stringify(a.value ?? null);
        if (a.close !== false) b.addEventListener('click', () => close(a.value ?? null));
        bar.appendChild(b);
      }
      if (dismissible) back.addEventListener('pointerdown', e => { if (e.target === back) close(null); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      onOpen?.(box, close);
      (box.querySelector('input, .mg-btn--primary') || box.querySelector('button'))?.focus({ preventScroll: true });
    });
  },

  /** Potrditveno okno. @returns {Promise<boolean>} */
  async confirm(text, { title = 'Potrditev', yes = 'Da', no = 'Prekliči', danger = false } = {}) {
    return !!(await ui.modal({ title, html: `<p>${esc(text)}</p>`, actions: [{ label: no, value: false }, { label: yes, value: true, kind: danger ? 'danger' : 'primary' }] }));
  },

  /* -------------------------- urejanje profila -------------------------- */

  /**
   * Okno za vzdevek in avatar. required: brez zapiranja, dokler profil ni shranjen.
   * @param {{required?:boolean}} [opt]
   */
  profileModal({ required = false } = {}) {
    const cur = hub.profile;
    let avatar = { ...(cur?.avatar || randomAvatar()) };
    const backend = hub.backend;
    const canEmail = backend?.kind === 'supabase' && typeof backend.linkEmail === 'function';
    const html = `
      <div class="mg-stack">
        <div class="mg-row" style="justify-content:center"><span class="mg-pv">${avatarHtml(avatar, 'lg')}</span></div>
        <div class="mg-field"><label class="mg-label" for="mgNick">Vzdevek</label>
          <input id="mgNick" class="mg-input" maxlength="16" autocomplete="nickname" placeholder="2–16 znakov" value="${esc(cur?.nickname || '')}"></div>
        <div class="mg-field"><span class="mg-label">Avatar</span>
          <div class="mg-emoji-grid">${AVATAR_EMOJIS.map(e => `<button type="button" data-e="${e}" aria-pressed="${e === avatar.emoji}">${e}</button>`).join('')}</div></div>
        <div class="mg-field"><span class="mg-label">Barva</span>
          <div class="mg-color-grid">${AVATAR_COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" aria-label="Barva ${c}" aria-pressed="${c === avatar.color}"></button>`).join('')}</div></div>
        <div class="mg-error" id="mgErr"></div>
        ${hub.offline ? `<p class="mg-small mg-muted">Offline način: profil je shranjen samo v tem brskalniku.${backend?.isGuest ? ' Ta zavihek ima <b>gostujoči profil</b> (za testiranje multiplayerja v več zavihkih).' : ''}</p>` : ''}
        ${canEmail && cur ? `<details class="mg-small"><summary class="mg-muted" style="cursor:pointer">Shrani profil za drugo napravo (email)</summary>
          <div class="mg-stack" style="margin-top:8px">
            <p class="mg-muted" style="margin:0">${backend.email ? `Profil je povezan z <b>${esc(backend.email)}</b>.` : 'Poveži profil z emailom. Dobiš povezavo za potrditev, nato se lahko z istim emailom prijaviš na drugi napravi.'}</p>
            <div class="mg-row"><input id="mgEmail" class="mg-input" type="email" placeholder="ime@primer.si" style="flex:1;min-width:180px">
              <button type="button" class="mg-btn mg-btn--cyan mg-btn--small" id="mgLink">Poveži</button>
              <button type="button" class="mg-btn mg-btn--ghost mg-btn--small" id="mgLogin" title="Prijava v že shranjen profil">Prijava</button></div>
            <div class="mg-small" id="mgEmailMsg"></div></div></details>` : ''}
      </div>`;
    return ui.modal({
      title: cur ? 'Tvoj profil' : 'Kdo igra?',
      html,
      dismissible: !required,
      actions: [
        ...(required ? [] : [{ label: 'Prekliči', value: null }]),
        { label: 'Shrani', kind: 'primary', close: false, value: 'save' },
      ],
      onOpen(box, close) {
        const nick = box.querySelector('#mgNick');
        const err = box.querySelector('#mgErr');
        const pv = box.querySelector('.mg-pv');
        const sync = () => {
          pv.innerHTML = avatarHtml(avatar, 'lg');
          box.querySelectorAll('[data-e]').forEach(b => b.setAttribute('aria-pressed', b.dataset.e === avatar.emoji));
          box.querySelectorAll('[data-c]').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === avatar.color));
        };
        box.addEventListener('click', e => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.e) { avatar.emoji = b.dataset.e; sync(); }
          if (b.dataset.c) { avatar.color = b.dataset.c; sync(); }
        });
        const save = async () => {
          const msg = validateNickname(nick.value);
          if (msg) { err.textContent = msg; nick.focus(); return; }
          err.textContent = '';
          try {
            const p = await hub.updateProfile({ nickname: nick.value, avatar });
            close(p);
            ui.toast(cur ? 'Profil shranjen.' : `Živjo, ${p.nickname}!`, { icon: p.avatar.emoji });
          } catch (e) {
            err.textContent = e.code === 'nickname_taken' ? 'Ta vzdevek je že zaseden. Izberi drugega.' : (e.message || 'Napaka pri shranjevanju.');
          }
        };
        box.querySelector('.mg-modal__actions .mg-btn--primary').addEventListener('click', save);
        nick.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
        const emailMsg = box.querySelector('#mgEmailMsg');
        const email = box.querySelector('#mgEmail');
        const doEmail = async fn => {
          const v = email.value.trim();
          if (!/^\S+@\S+\.\S+$/.test(v)) { emailMsg.textContent = 'Vpiši veljaven email.'; return; }
          emailMsg.textContent = 'Pošiljam …';
          try { await fn(v); emailMsg.textContent = 'Preveri pošto in klikni povezavo.'; } catch (e) { emailMsg.textContent = 'Napaka: ' + e.message; }
        };
        box.querySelector('#mgLink')?.addEventListener('click', () => doEmail(v => backend.linkEmail(v)));
        box.querySelector('#mgLogin')?.addEventListener('click', () => doEmail(v => backend.signInWithEmail(v)));
      },
    });
  },

  /* --------------------------- odštevanje ---------------------------- */

  /**
   * Veliko odštevanje čez zaslon (3, 2, 1, START).
   * @param {number} [from]
   * @param {{go?:string, step?:number}} [opt]
   * @returns {Promise<void>}
   */
  countdown(from = 3, { go = 'START', step = 800 } = {}) {
    return new Promise(resolve => {
      const el = h('<div class="mg-countdown" aria-live="assertive"></div>');
      document.body.appendChild(el);
      let n = from;
      const show = txt => { el.innerHTML = `<span>${esc(txt)}</span>`; };
      const next = () => {
        if (n > 0) { show(String(n)); n--; setTimeout(next, step); }
        else if (go) { show(go); setTimeout(() => { el.remove(); resolve(); }, step * 0.7); go = null; }
        else { el.remove(); resolve(); }
      };
      next();
    });
  },

  /* ---------------------------- lestvica ----------------------------- */

  /**
   * Lestvica z zavihki obdobij.
   * @param {HTMLElement} container
   * @param {{game?:string, seed?:string|null, period?:'all'|'today'|'week', periods?:('all'|'today'|'week')[]|false,
   *          order?:'asc'|'desc', limit?:number, format?:(score:number)=>string, title?:string, tabs?:{label:string, seed?:string|null, period?:string}[]}} [opt]
   *   tabs: lastni zavihki (npr. [{label:'Danes', seed: hub.dailySeed()}, {label:'Vseh časov'}]) — povozi periods
   * @returns {{refresh:()=>Promise<void>, el:HTMLElement}}
   */
  leaderboard(container, { game = hub.gameId, seed = null, period = 'all', periods = ['today', 'week', 'all'], order = hub.scoreOrder,
    limit = 10, format = s => s.toLocaleString('sl-SI'), title = 'Lestvica', tabs = null } = {}) {
    const LABEL = { today: 'Danes', week: 'Teden', all: 'Vseh časov' };
    const tabList = tabs || (periods ? periods.map(p => ({ label: LABEL[p], period: p, seed })) : [{ label: '', period, seed }]);
    let active = tabs ? 0 : Math.max(0, tabList.findIndex(t => (t.period || 'all') === period && (t.seed ?? null) === (seed ?? null)));
    const el = h(`<div class="mg-board">
      ${title ? `<h2 class="mg-title">${esc(title)}</h2>` : ''}
      ${tabList.length > 1 ? `<div class="mg-tabs" role="tablist">${tabList.map((t, i) => `<button class="mg-tab" role="tab" data-i="${i}">${esc(t.label)}</button>`).join('')}</div>` : ''}
      <div class="mg-board__body"><div class="mg-empty"><span class="mg-spin"></span></div></div></div>`);
    container.replaceChildren(el);
    const body = el.querySelector('.mg-board__body');
    const refresh = async () => {
      el.querySelectorAll('.mg-tab').forEach(b => b.setAttribute('aria-selected', +b.dataset.i === active));
      const t = tabList[active];
      try {
        const rows = await hub.getLeaderboard({ game, seed: t.seed ?? null, period: t.period || 'all', order, limit });
        body.innerHTML = rows.length
          ? `<table class="mg-table"><tbody>${rows.map((r, i) => `<tr class="${r.user_id === hub.userId ? 'mg-me' : ''}">
              <td class="mg-rank">${i + 1}.</td><td>${ui.who(r)}</td><td class="mg-num">${esc(format(r.score))}</td></tr>`).join('')}</tbody></table>`
          : '<div class="mg-empty">Še ni rezultatov. Bodi prvi!</div>';
      } catch (e) {
        body.innerHTML = `<div class="mg-empty">Lestvice ni bilo mogoče naložiti.</div>`;
        console.warn(e);
      }
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('.mg-tab');
      if (b) { active = +b.dataset.i; refresh(); }
    });
    refresh();
    return { refresh, el };
  },

  /* ------------------------------ lobby ------------------------------ */

  /**
   * Zaslon lobbyja: velika koda, QR, povezava, igralci, »Pripravljen«, »Začni« (host).
   * @param {HTMLElement} container
   * @param {import('./room.js').Room} room
   * @param {{minPlayers?:number, title?:string, onStart?:(settings:Object)=>void, onLeave?:()=>void,
   *          settingsForm?:(el:HTMLElement, room:import('./room.js').Room)=>(()=>Object), requireReady?:boolean}} [opt]
   *   settingsForm: nariše nastavitve v el (samo pri hostu) in vrne funkcijo, ki vrne nastavitve ob začetku
   *   requireReady: vsi morajo biti pripravljeni (privzeto false: host lahko začne, ko je dovolj igralcev)
   * @returns {{destroy:()=>void, el:HTMLElement}}
   */
  lobby(container, room, { minPlayers = 2, title = 'Lobby', onStart, onLeave, settingsForm, requireReady = false } = {}) {
    const url = joinUrl(room.code);
    const el = h(`<div class="mg-lobby">
      <section class="mg-card mg-card--glow mg-stack">
        <h2 class="mg-title">${esc(title)}</h2>
        <div class="mg-center mg-muted">Koda sobe</div>
        <div class="mg-lobby__code" aria-label="Koda sobe">${esc(room.code)}</div>
        <div class="mg-lobby__share">
          <div class="mg-qr" aria-label="QR koda za pridružitev"><span class="mg-spin"></span></div>
          <div class="mg-stack" style="min-width:180px;flex:1;max-width:320px">
            <div class="mg-muted mg-small">Skeniraj QR ali odpri povezavo. Na dashboardu lahko vpišeš kodo.</div>
            <button type="button" class="mg-btn mg-btn--cyan mg-btn--small mg-copy">Kopiraj povezavo</button>
            <div class="mg-small mg-muted" style="word-break:break-all">${esc(url)}</div>
          </div>
        </div>
      </section>
      <section class="mg-card mg-stack">
        <div class="mg-row mg-row--between"><h2 class="mg-title" style="margin:0">Igralci</h2><span class="mg-badge mg-count"></span></div>
        <ul class="mg-players"></ul>
        <div class="mg-settings"></div>
        <div class="mg-lobby__hint mg-muted mg-small mg-center"></div>
        <div class="mg-row">
          <button type="button" class="mg-btn mg-btn--ghost mg-leave">Zapusti</button>
          <span class="mg-spacer"></span>
          <button type="button" class="mg-btn mg-btn--green mg-ready">Pripravljen</button>
          <button type="button" class="mg-btn mg-btn--primary mg-btn--big mg-start mg-hidden">Začni</button>
        </div>
      </section></div>`);
    container.replaceChildren(el);
    const list = el.querySelector('.mg-players');
    const count = el.querySelector('.mg-count');
    const hint = el.querySelector('.mg-lobby__hint');
    const readyBtn = el.querySelector('.mg-ready');
    const startBtn = el.querySelector('.mg-start');
    const settingsEl = el.querySelector('.mg-settings');
    let readSettings = null;

    renderQr(el.querySelector('.mg-qr'), url);
    el.querySelector('.mg-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); ui.toast('Povezava kopirana.', { icon: '📋' }); }
      catch { ui.modal({ title: 'Povezava', html: `<input class="mg-input" readonly value="${esc(url)}" onfocus="this.select()">` }); }
    });

    const render = players => {
      count.textContent = `${players.length}/${room.maxPlayers}`;
      // posodobi samo spremenjene vrstice (da animacija ne utripa)
      const want = players.map(p => [p.id, `${ui.who(p)}
        ${p.isHost ? '<span class="mg-badge mg-badge--yellow">Host</span>' : ''}
        ${p.ready ? '<span class="mg-badge mg-badge--green">Pripravljen</span>' : '<span class="mg-badge">Čaka</span>'}
        ${room.isHost && p.id !== hub.userId ? `<button class="mg-btn mg-btn--ghost mg-btn--small" data-kick="${esc(p.id)}" title="Odstrani" aria-label="Odstrani igralca">✕</button>` : ''}`]);
      const existing = new Map([...list.children].map(li => [li.dataset.id, li]));
      want.forEach(([id, html], i) => {
        let li = existing.get(id);
        if (!li) { li = document.createElement('li'); li.dataset.id = id; }
        existing.delete(id);
        if (li.dataset.html !== html) { li.innerHTML = html; li.dataset.html = html; }
        li.className = id === hub.userId ? 'mg-me' : '';
        if (list.children[i] !== li) list.insertBefore(li, list.children[i] || null);
      });
      existing.forEach(li => li.remove());
      readyBtn.textContent = room.ready ? 'Nisem pripravljen' : 'Pripravljen';
      readyBtn.classList.toggle('mg-btn--green', !room.ready);
      readyBtn.classList.toggle('mg-btn--ghost', room.ready);
      startBtn.classList.toggle('mg-hidden', !room.isHost);
      const enough = players.length >= minPlayers;
      const allReady = players.filter(p => !p.isHost).every(p => p.ready);
      const can = enough && (!requireReady || allReady);
      startBtn.disabled = !can;
      if (!enough) hint.textContent = `Čakam igralce … (vsaj ${minPlayers})`;
      else if (room.isHost) hint.textContent = allReady ? 'Vsi so pripravljeni. Začni!' : (requireReady ? 'Čakam, da so vsi pripravljeni.' : 'Lahko začneš, ko želiš.');
      else hint.textContent = 'Čakam, da host začne igro.';
      // nastavitve samo pri hostu
      if (room.isHost && settingsForm && !readSettings) readSettings = settingsForm(settingsEl, room);
      if (!room.isHost && readSettings) { settingsEl.innerHTML = ''; readSettings = null; }
    };

    list.addEventListener('click', e => {
      const b = e.target.closest('[data-kick]');
      if (b) room.kick(b.dataset.kick);
    });
    readyBtn.addEventListener('click', () => room.setReady(!room.ready));
    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      await room.start(readSettings ? readSettings() : room.settings);
    });
    el.querySelector('.mg-leave').addEventListener('click', async () => {
      await room.leave();
      onLeave ? onLeave() : (location.href = location.pathname);
    });

    const offs = [
      room.onPlayers(render),
      room.on('hostChanged', ({ hostId }) => {
        render(room.players);
        if (hostId === hub.userId) ui.toast('Zdaj si ti host.', { icon: '👑' });
      }),
      room.onStart(s => onStart?.(s)),
    ];
    return { el, destroy: () => offs.forEach(f => f()) };
  },

  /* ---------------------------- rezultati ---------------------------- */

  /**
   * Končni zaslon s stopničkami.
   * @param {{id:string, nickname:string, avatar:Object, score?:number, scoreText?:string, xp?:number}[]} players
   *   urejeni od zmagovalca naprej
   * @param {{title?:string, again?:string|false, hub?:boolean, extraHtml?:string}} [opt]
   * @returns {Promise<'again'|'hub'|null>}
   */
  results(players, { title = 'Rezultati', again = 'Še enkrat', hub: showHub = true, extraHtml = '' } = {}) {
    const top = players.slice(0, 3);
    const order = [top[1], top[0], top[2]].map((p, i) => p ? { p, place: [2, 1, 3][i] } : null).filter(Boolean);
    const scoreOf = p => p.scoreText ?? (p.score != null ? p.score.toLocaleString('sl-SI') : '');
    const html = `
      <div class="mg-podium">${order.map(({ p, place }) => `<div class="mg-podium__col">
        ${avatarHtml(p.avatar, 'lg')}<div class="mg-podium__name">${esc(p.nickname)}</div>
        <div class="mg-podium__score">${esc(scoreOf(p))}</div>
        <div class="mg-podium__block mg-podium__block--${place}">${place}</div></div>`).join('')}</div>
      ${players.length > 3 ? `<table class="mg-table"><tbody>${players.slice(3).map((p, i) => `<tr class="${p.id === hub.userId ? 'mg-me' : ''}">
        <td class="mg-rank">${i + 4}.</td><td>${ui.who(p)}</td><td class="mg-num">${esc(scoreOf(p))}</td></tr>`).join('')}</tbody></table>` : ''}
      ${(() => { const me = players.find(p => p.id === hub.userId); return me?.xp ? `<p class="mg-center mg-xp-gain">+${me.xp} XP</p>` : ''; })()}
      ${extraHtml}`;
    return ui.modal({
      title, html, wide: true, dismissible: false,
      actions: [
        ...(showHub ? [{ label: '← Hub', value: 'hub' }] : []),
        ...(again ? [{ label: again, value: 'again', kind: 'primary' }] : []),
      ],
    }).then(v => {
      if (v === 'hub') location.href = hub.link('');
      return v;
    });
  },
};

/** Povezava za pridružitev sobi (ohrani ?igralec ne — vsak ima svojega). */
function joinUrl(code) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  if (new URLSearchParams(location.search).get('offline') === '1') u.searchParams.set('offline', '1');
  u.searchParams.set('room', code);
  return u.href;
}

async function renderQr(el, text) {
  try {
    const mod = await import(/* @vite-ignore */ QR_LIB);
    const qrcode = mod.default || mod;
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch (e) {
    el.innerHTML = '<span style="color:#000;font:700 12px sans-serif;text-align:center">QR ni na voljo</span>';
    console.warn('QR:', e.message);
  }
}
