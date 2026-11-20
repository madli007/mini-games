/* MINI GAMES — trgovina in garderoba (shop.html) */
import { hub, ui, util, cosmetics as K, economy as E } from './shared/hub.js';

const $ = s => document.querySelector(s);
const esc = ui.esc;
const TABS = [...K.SLOTS, 'moje'];
const TAB_LABEL = { ...K.SLOT_LABEL, moje: 'Moje' };
const WIN_ICON = { confetti: '🎊', fireworks: '🎆', pixelrain: '🟪', stars: '⭐', gg: 'GG' };

let shop = null;          // hub.getShop()
let tab = 'frame';
let rarity = 'all';

/* ------------------------------------------------------------ pomožne */

/** Moj profil (ali privzet za predogled). */
function me() {
  return hub.profile || { nickname: 'Ti', avatar: { emoji: '🙂', color: '#ffd23f' }, equipped: {}, coins: 0 };
}

/** Profil z eno zamenjano opremo (predogled »na mojem avatarju«). */
function withItem(it) {
  const p = me();
  return { ...p, equipped: { ...(p.equipped || {}), [it.kind]: it.id } };
}

/** Vzdevek + značka + naslov (brez avatarja). */
function nameBlock(p) {
  const badge = K.item(p.equipped?.badge), title = K.item(p.equipped?.title);
  return `<div class="shop-hero__who">
    <div class="shop-hero__name">${ui.name(p)}${badge?.kind === 'badge' ? ` <span class="mg-who__badge">${esc(badge.value)}</span>` : ''}</div>
    ${title?.kind === 'title' ? `<div class="mg-who__title">${esc(title.value)}</div>` : ''}</div>`;
}

/** Predogled predmeta na mojem avatarju. */
function previewHtml(it, big = false) {
  const p = withItem(it);
  switch (it.kind) {
    case 'frame': case 'emoji': case 'bg':
      return `<div class="shop-pv">${ui.avatar(p, big ? 'xl' : 'lg')}</div>`;
    case 'name': case 'title': case 'badge':
      return `<div class="shop-pv shop-pv--who">${ui.who(p, big ? 'lg' : '')}</div>`;
    case 'win':
      return `<div class="shop-pv shop-pv--win"><span class="shop-pv__fx">${esc(WIN_ICON[it.value] || '🎉')}</span>
        <button type="button" class="mg-btn mg-btn--ghost mg-btn--small" data-fx="${esc(it.value)}">▶ Predogled</button></div>`;
    case 'banner':
      return `<div class="shop-pv shop-pv--banner ${it.anim ? 'mgc-anim-bg' : ''}" style="--bni:${esc(it.value)}">${ui.who(p, big ? 'lg' : '')}</div>`;
    default:
      return '';
  }
}

/** Gumb/stanje predmeta. */
function actionHtml(it) {
  if (it.equipped) return `<button type="button" class="mg-btn mg-btn--ghost mg-btn--small mg-btn--block" data-unequip="${esc(it.kind)}">✓ Opremljeno · sneži</button>`;
  if (it.owned) return `<button type="button" class="mg-btn mg-btn--green mg-btn--small mg-btn--block" data-equip="${esc(it.id)}">Opremi</button>`;
  if (it.locked) return `<button type="button" class="mg-btn mg-btn--ghost mg-btn--small mg-btn--block" disabled>🔒 ${esc(it.reason)}</button>`;
  if (it.price === 0) return `<button type="button" class="mg-btn mg-btn--cyan mg-btn--small mg-btn--block" data-buy="${esc(it.id)}">Odkleni</button>`;
  const poor = it.priceToday > hub.coins;
  return `<button type="button" class="mg-btn ${poor ? 'mg-btn--ghost' : 'mg-btn--primary'} mg-btn--small mg-btn--block" data-buy="${esc(it.id)}">Kupi · ${ui.coins(it.priceToday)} 🪙</button>`;
}

function priceHtml(it) {
  if (it.price === 0) return `<span class="shop-price">${it.unlock?.free ? 'Brezplačno' : 'Odklep'}</span>`;
  return `<span class="shop-price">${it.offer ? `<s>${ui.coins(it.price)}</s> ` : ''}<b>${ui.coins(it.priceToday)}</b> 🪙</span>`;
}

function cardHtml(it) {
  const condText = K.checkUnlock(it.unlock, { level: 0, achievements: [], streak: 0 }).reason || '';
  const cond = it.unlock && !it.unlock.free && !it.owned
    ? (it.locked
      ? `<span class="shop-cond">${esc(condText)}${it.price ? ' + nakup' : ''}</span>`
      : `<span class="shop-cond shop-cond--ok">✓ Pogoj izpolnjen</span>`)
    : '';
  return `<article class="shop-item mg-rar-${esc(it.rarity)} ${it.owned ? 'is-owned' : ''} ${it.equipped ? 'is-equipped' : ''} ${it.locked && !it.owned ? 'is-locked' : ''}" data-id="${esc(it.id)}">
    ${it.offer ? '<span class="shop-item__deal">−25 %</span>' : ''}
    ${previewHtml(it)}
    <div class="shop-item__body">
      <div class="shop-item__name">${esc(it.name)}</div>
      <div class="shop-item__meta"><span class="shop-rar">${esc(K.RARITY_LABEL[it.rarity])}</span>${priceHtml(it)}</div>
      <div class="shop-item__desc mg-small mg-muted">${esc(it.desc)}</div>
      ${cond}
    </div>
    ${actionHtml(it)}
  </article>`;
}

/* ------------------------------------------------------------ izris */

function renderHero() {
  const p = me();
  const banner = K.item(p.equipped?.banner);
  const st = shop?.state || {};
  const ownedCount = shop ? shop.items.filter(i => i.owned && !i.free).length : 0;
  const paid = shop ? shop.items.filter(i => !i.free).length : 0;
  $('#hero').innerHTML = `<div class="shop-hero__banner ${banner?.anim ? 'mgc-anim-bg' : ''}" style="--bni:${banner?.kind === 'banner' ? esc(banner.value) : 'none'}">
      ${ui.avatar(p, 'xl')}
      ${nameBlock(p)}
    </div>
    <div class="shop-hero__stats">
      <div class="shop-hero__coins" aria-label="Kovanci">🪙 <b>${ui.coins(hub.coins)}</b></div>
      <div class="mg-small mg-muted">Nivo ${st.level || 1} · niz ${st.streak || 0} · v lasti ${ownedCount}/${paid}</div>
      <div class="mg-small mg-muted">Kovance služiš z igranjem, nalogami, nivoji in dosežki (največ ${E.COINS.PER_DAY} na dan). <a href="${esc(hub.link(''))}">Naloge →</a></div>
    </div>`;
}

function renderOffer() {
  const items = shop.offer.map(id => shop.items.find(i => i.id === id)).filter(Boolean);
  $('#offer').innerHTML = items.map(cardHtml).join('');
}

function renderTabs() {
  $('#tabs').innerHTML = TABS.map(t => `<button class="mg-tab" role="tab" data-tab="${t}" aria-selected="${t === tab}">${esc(TAB_LABEL[t])}${t === 'moje' ? ' 👕' : ''}</button>`).join('');
  $('#filters').innerHTML = tab === 'moje' ? '' : ['all', ...K.RARITIES].map(r => `<button type="button" class="shop-chip ${r === 'all' ? '' : 'mg-rar-' + r}" data-rar="${r}" aria-pressed="${r === rarity}">${r === 'all' ? 'Vse' : esc(K.RARITY_LABEL[r])}</button>`).join('');
}

function renderPanel() {
  if (tab === 'moje') return renderWardrobe();
  const list = shop.items.filter(i => i.kind === tab && (rarity === 'all' || i.rarity === rarity))
    .sort((a, b) => K.RARITIES.indexOf(a.rarity) - K.RARITIES.indexOf(b.rarity) || a.price - b.price || (a.name < b.name ? -1 : 1));
  $('#panel').innerHTML = list.length
    ? `<div class="shop-grid">${list.map(cardHtml).join('')}</div>`
    : '<div class="mg-empty">Ni predmetov za ta filter.</div>';
}

/** Garderoba: vse, kar imam, po slotih. */
function renderWardrobe() {
  const p = me();
  const rows = K.SLOTS.map(slot => {
    const mine = shop.items.filter(i => i.kind === slot && i.owned);
    const cur = K.item(p.equipped?.[slot]);
    return `<section class="shop-ward__slot">
      <div class="mg-row mg-row--between"><h3>${esc(K.SLOT_LABEL[slot])}</h3>
        ${cur ? `<button type="button" class="mg-btn mg-btn--ghost mg-btn--small" data-unequip="${slot}">Sneži</button>` : '<span class="mg-small mg-muted">nič opremljeno</span>'}</div>
      ${mine.length ? `<div class="shop-ward__list">${mine.map(it => `<button type="button" class="shop-ward__item mg-rar-${esc(it.rarity)}" ${it.equipped ? `data-unequip="${slot}" aria-pressed="true"` : `data-equip="${esc(it.id)}" aria-pressed="false"`} title="${esc(it.desc)}">
          ${wardThumb(it)}<span>${esc(it.name)}</span></button>`).join('')}</div>`
        : `<div class="mg-small mg-muted">Še nimaš ničesar. <button type="button" class="shop-link" data-tab="${slot}">V trgovino →</button></div>`}
    </section>`;
  }).join('');
  const banner = K.item(p.equipped?.banner);
  $('#panel').innerHTML = `<div class="shop-ward">
    <div class="mg-card shop-ward__pv ${banner?.anim ? 'mgc-anim-bg' : ''}" style="--bni:${banner?.kind === 'banner' ? esc(banner.value) : 'none'}">
      ${ui.avatar(p, 'xl')}
      ${nameBlock(p)}
      ${p.equipped?.win ? `<button type="button" class="mg-btn mg-btn--ghost mg-btn--small" data-fx="${esc(K.item(p.equipped.win)?.value || '')}">▶ Moj učinek ob zmagi</button>` : ''}
      <p class="mg-small mg-muted" style="margin:0">Tako te vidijo drugi: v glavi, lobbyju, na lestvicah in stopničkah.</p>
    </div>
    <div class="shop-ward__slots">${rows}</div></div>`;
}

function wardThumb(it) {
  if (['frame', 'emoji', 'bg'].includes(it.kind)) return ui.avatar(withItem(it), 'sm');
  if (it.kind === 'badge') return `<span class="shop-ward__ic">${esc(it.value)}</span>`;
  if (it.kind === 'win') return `<span class="shop-ward__ic">${esc(WIN_ICON[it.value] || '🎉')}</span>`;
  if (it.kind === 'banner') return `<span class="shop-ward__ban" style="--bni:${esc(it.value)}"></span>`;
  if (it.kind === 'name') return `<b class="mgc-${esc(it.id)} shop-ward__ic">Aa</b>`;
  return '<span class="shop-ward__ic">🏷️</span>';
}

function renderAll() {
  renderHero();
  renderOffer();
  renderTabs();
  renderPanel();
}

async function reload() {
  shop = await hub.getShop();
  renderAll();
}

/* ------------------------------------------------------------ dejanja */

async function buy(id) {
  const it = shop.items.find(i => i.id === id);
  if (!it) return;
  if (!hub.profile) { await ui.profileModal({ required: true }); return reload(); }
  if (it.price > 0 && it.priceToday > hub.coins) {
    ui.toast(`Premalo kovancev — manjka še ${ui.coins(it.priceToday - hub.coins)} 🪙.`, { icon: '🪙' });
    return;
  }
  const ok = await ui.modal({
    title: it.price === 0 ? 'Odkleni predmet' : 'Potrdi nakup',
    html: `<div class="shop-confirm mg-rar-${esc(it.rarity)}">${previewHtml(it, true)}
      <div class="shop-item__name">${esc(it.name)}</div>
      <div class="shop-rar">${esc(K.RARITY_LABEL[it.rarity])} · ${esc(K.SLOT_ONE[it.kind])}</div>
      <p class="mg-muted">${esc(it.desc)}</p>
      ${it.price ? `<p>Cena: <b>${ui.coins(it.priceToday)} 🪙</b>${it.offer ? ` <s class="mg-muted">${ui.coins(it.price)}</s>` : ''} · po nakupu ti ostane <b>${ui.coins(hub.coins - it.priceToday)} 🪙</b></p>` : ''}</div>`,
    actions: [{ label: 'Prekliči', value: false }, { label: it.price ? `Kupi · ${ui.coins(it.priceToday)} 🪙` : 'Odkleni', value: true, kind: 'primary' }],
    onOpen: box => box.querySelector('[data-fx]')?.addEventListener('click', e => ui.winFx(e.currentTarget.dataset.fx)),
  });
  if (!ok) return;
  try {
    await hub.buy(id);
  } catch (e) {
    const msg = { not_enough_coins: 'Premalo kovancev.', locked: 'Predmet je zaklenjen.', owned: 'Ta predmet že imaš.', unavailable: 'Predmet ni na voljo.' }[e.code] || e.message;
    ui.toast(msg, { icon: '⚠️' });
    return reload();
  }
  await reload();
  const card = document.querySelector(`.shop-item[data-id="${CSS.escape(id)}"]`);
  card?.classList.add('shop-item--bought');
  ui.winFx('stars', { duration: 2200 });
  const eq = await ui.modal({
    title: it.price ? 'Kupljeno!' : 'Odklenjeno!',
    html: `<div class="shop-confirm shop-confirm--yay mg-rar-${esc(it.rarity)}">${previewHtml(it, true)}<div class="shop-item__name">${esc(it.name)}</div></div>`,
    actions: [{ label: 'Kasneje', value: false }, { label: 'Opremi zdaj', value: true, kind: 'green' }],
  });
  if (eq) await equip(id);
}

async function equip(id) {
  const it = K.item(id);
  try {
    await hub.equip(it.kind, id);
    ui.toast(`Opremljeno: ${it.name}`, { icon: '✨' });
  } catch (e) {
    ui.toast(e.message || 'Napaka', { icon: '⚠️' });
  }
  await reload();
}

async function unequip(slot) {
  try {
    await hub.equip(slot, null);
    ui.toast(`Snel si: ${K.SLOT_ONE[slot]}`, { icon: '👕' });
  } catch (e) {
    ui.toast(e.message || 'Napaka', { icon: '⚠️' });
  }
  await reload();
}

function setTab(t) {
  tab = TABS.includes(t) ? t : 'frame';
  try { history.replaceState(null, '', '#' + tab); } catch { /* ignore */ }
  renderTabs();
  renderPanel();
}

function offerTimer() {
  const start = util.dayStart(new Date());
  const next = util.dayStart(new Date(start.getTime() + 30 * 3600e3));
  const ms = Math.max(0, next - Date.now());
  $('#offerTimer').textContent = `⏳ nova čez ${Math.floor(ms / 3600e3)} h ${String(Math.floor((ms % 3600e3) / 60e3)).padStart(2, '0')} min`;
}

/* ------------------------------------------------------------ zagon */

async function main() {
  await hub.init({ requireProfile: false });
  ui.header({ title: 'Trgovina' });
  const h = location.hash.slice(1);
  if (TABS.includes(h)) tab = h;
  await reload();
  if (!hub.profile) ui.profileModal({ required: true }).then(reload);

  document.body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.tab) setTab(b.dataset.tab);
    else if (b.dataset.rar) { rarity = b.dataset.rar; renderTabs(); renderPanel(); }
    else if (b.dataset.buy) buy(b.dataset.buy);
    else if (b.dataset.equip) equip(b.dataset.equip);
    else if (b.dataset.unequip) unequip(b.dataset.unequip);
    else if (b.dataset.fx && !b.closest('.mg-modal')) ui.winFx(b.dataset.fx);
  });
  let lastDay = hub.dailySeed();
  offerTimer();
  setInterval(() => {
    offerTimer();
    if (hub.dailySeed() !== lastDay) { lastDay = hub.dailySeed(); reload(); }
  }, 20000);
  hub.onProfile(() => { if (shop) renderHero(); });
  window.addEventListener('hashchange', () => {
    const t = location.hash.slice(1);
    if (TABS.includes(t) && t !== tab) setTab(t);
  });
}

main();
