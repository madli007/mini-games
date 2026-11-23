/* MINI GAMES — dashboard */
import { hub, ui, util, economy as E, cosmetics as K } from './shared/hub.js';

const $ = s => document.querySelector(s);
const esc = ui.esc;
const MODE = { single: 'Solo', realtime: 'V živo', turn: 'Potezno', async: 'Asinhrono' };
const TAG = { party: 'Party', daily: 'Dnevni izziv', strategija: 'Strategija', arkada: 'Arkada', rekordi: 'Rekordi', akcija: 'Akcija', hitrost: 'Hitrost', sezona: 'Sezona' };
const TAG_COLOR = { party: 'pink', daily: 'cyan', rekordi: 'yellow' };

let games = [];
let filter = 'all';
let boardTab = 'xp';

const gameById = id => games.find(g => g.id === id);
const gameHref = (g, room) => {
  const u = new URL(hub.link(g.path));
  if (room) u.searchParams.set('room', room);
  return u.href;
};
const icon = g => /\.(svg|png)$/i.test(g.icon) ? `<img src="${esc(g.icon)}" alt="">` : esc(g.icon);

/* --------------------------------------------------------------- glava */
function header() {
  const el = ui.header({ title: '', back: false });
  el.querySelector('.mg-header__title').innerHTML = '<a class="dash-logo" href="./"><b>MINI</b><i>GAMES</i></a>';
  const off = el.querySelector('.mg-offline');
  off.textContent = 'Offline';
  off.addEventListener('click', () => ui.modal({
    title: 'Offline način',
    html: `<p>Hub trenutno ne uporablja strežnika. ${esc(hub.offlineReason || '')}</p>
      <ul class="mg-small">
        <li>Profil, XP, lestvice in dosežki so shranjeni <b>samo v tem brskalniku</b>.</li>
        <li>Multiplayer deluje <b>med zavihki istega brskalnika</b> (vsak nov zavihek dobi gostujoči profil).</li>
        <li>Ko je strežnik spet dosegljiv, osveži stran.</li>
      </ul>`,
  }));
}

/* --------------------------------------------------------------- jaz */
function renderMe(p) {
  const el = $('#meCard');
  const banner = K.item(p?.equipped?.banner);
  el.style.setProperty('--bni', banner?.kind === 'banner' ? banner.value : '');
  el.classList.toggle('mgc-anim-bg', !!banner?.anim);
  el.classList.toggle('dash-me--banner', !!banner);
  if (!p) { el.innerHTML = '<button class="mg-btn mg-btn--primary" id="mkProfile">Ustvari profil</button>'; $('#mkProfile').onclick = () => ui.profileModal(); return; }
  const lv = hub.level(p.xp);
  const title = K.item(p.equipped?.title);
  const badge = K.item(p.equipped?.badge);
  const streakOn = p.streak > 0 && p.streak_day && (p.streak_day === hub.dailySeed() || p.streak_day === E.addDays(hub.dailySeed(), -1));
  el.innerHTML = `${ui.avatar(p, 'lg')}
    <div class="dash-me__info">
      <div class="dash-me__name">${ui.name(p)}${badge?.kind === 'badge' ? ` <span class="mg-who__badge">${esc(badge.value)}</span>` : ''}</div>
      ${title?.kind === 'title' ? `<div class="mg-who__title">${esc(title.value)}</div>` : ''}
      <div class="dash-me__lvl">NIVO ${lv.level} · ${p.xp.toLocaleString('sl-SI')} XP</div>
      <div class="mg-xpbar" title="${lv.current}/${lv.next} XP do naslednjega nivoja"><i style="width:${(lv.progress * 100).toFixed(1)}%"></i></div>
      <div class="dash-me__stats mg-small">
        <a class="dash-me__coins" href="${esc(hub.link('shop.html'))}" title="Trgovina">🪙 <b>${ui.coins(p.coins)}</b></a>
        ${streakOn ? `<span title="Zaporedni dnevi igranja">🔥 ${esc(util.plural(p.streak, 'dan', 'dneva', 'dnevi', 'dni'))}</span>` : '<span class="mg-muted" title="Odigraj igro in začni niz">🔥 niz 0</span>'}
        <span class="mg-muted">${lv.next - lv.current} XP do niv. ${lv.level + 1}</span>
      </div>
    </div>
    <div class="dash-me__actions">
      <a class="mg-btn mg-btn--primary mg-btn--small" href="${esc(hub.link('shop.html'))}">Trgovina</a>
      <button class="mg-btn mg-btn--ghost mg-btn--small" id="editMe">Uredi</button>
    </div>`;
  $('#editMe').onclick = () => ui.profileModal();
}

/* --------------------------------------------------------------- naloge */
const TIER = { e: 'Lahka', m: 'Srednja', h: 'Težka', w1: 'Teden', w2: 'Teden' };

function questRow(q) {
  const pct = Math.round((q.progress / q.target) * 100);
  const state = q.claimed
    ? '<span class="mg-badge mg-badge--green">✓ Prevzeto</span>'
    : q.done
      ? `<button class="mg-btn mg-btn--primary mg-btn--small mg-pulse" data-claim="${esc(q.id)}">Prevzemi</button>`
      : `<span class="mg-small mg-muted">${q.progress}/${q.target}</span>`;
  return `<div class="dash-quest ${q.done ? 'is-done' : ''} ${q.claimed ? 'is-claimed' : ''}">
    <span class="dash-quest__tier dash-quest__tier--${esc(q.slot)}">${TIER[q.slot]}</span>
    <div class="dash-quest__main">
      <div class="dash-quest__text">${esc(q.text)}</div>
      <div class="mg-xpbar dash-quest__bar"><i style="width:${pct}%"></i></div>
    </div>
    <span class="dash-quest__reward">+${q.reward} 🪙</span>
    <span class="dash-quest__state">${state}</span>
  </div>`;
}

let questsBusy = false;
async function renderQuests() {
  const el = $('#quests');
  if (questsBusy) return;
  questsBusy = true;
  try {
    const qs = await hub.getQuests();
    const daily = qs.filter(q => q.period.startsWith('d:'));
    const weekly = qs.filter(q => q.period.startsWith('w:'));
    const all3 = daily.length === 3 && daily.every(q => q.claimed);
    el.innerHTML = `${daily.map(questRow).join('')}
      <div class="dash-quest-bonus ${all3 ? 'is-done' : ''}">${all3 ? '✓' : '🎁'} Vse 3 dnevne naloge: <b>+${E.COINS.ALL_DAILY_BONUS} 🪙</b> bonus</div>
      <h3 class="dash-quests__sub">Tedenske naloge <span class="mg-small mg-muted">· nove v ponedeljek</span></h3>
      ${weekly.map(questRow).join('')}
      ${hub.profile ? '' : '<p class="mg-small mg-muted">Ustvari profil, da se ti napredek beleži.</p>'}`;
  } catch (e) {
    el.innerHTML = '<div class="mg-empty">Nalog ni bilo mogoče naložiti.</div>';
    console.warn(e);
  } finally {
    questsBusy = false;
  }
}

function setupQuests() {
  $('#quests').addEventListener('click', async e => {
    const b = e.target.closest('[data-claim]');
    if (!b) return;
    b.disabled = true;
    try {
      const r = await hub.claimQuest(b.dataset.claim);
      ui.toast(`+${r.granted} 🪙${r.bonus ? ` (vključno z bonusom +${r.bonus})` : ''}`, { icon: '🪙' });
    } catch (ex) {
      ui.toast(ex.message || 'Napaka', { icon: '⚠️' });
    }
    renderQuests();
  });
  hub.onQuests(renderQuests);
  // odštevanje do ljubljanske polnoči
  let day = hub.dailySeed();
  const tick = () => {
    const start = util.dayStart(new Date());
    const next = util.dayStart(new Date(start.getTime() + 30 * 3600e3));
    const ms = Math.max(0, next - Date.now());
    const hh = Math.floor(ms / 3600e3), mm = Math.floor((ms % 3600e3) / 60e3);
    $('#questTimer').textContent = `⏳ nove čez ${hh} h ${String(mm).padStart(2, '0')} min`;
    if (hub.dailySeed() !== day) { day = hub.dailySeed(); renderQuests(); }
  };
  tick();
  setInterval(tick, 20000);
}

/* --------------------------------------------------------------- koda */
function setupJoin() {
  const input = $('#joinCode');
  const err = $('#joinErr');
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    err.textContent = '';
  });
  $('#joinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{4}$/.test(code)) {
      err.textContent = /[01IO]/.test(code) ? 'Koda nima črk O, I ali številk 0, 1.' : 'Koda ima 4 znake.';
      return;
    }
    err.textContent = 'Iščem sobo …';
    try {
      const r = await hub.findRoom(code);
      if (!r) { err.textContent = 'Soba s to kodo ne obstaja.'; return; }
      const g = gameById(r.game);
      if (!g || g.status !== 'live') { err.textContent = 'Ta igra še ni na voljo.'; return; }
      if (r.status === 'finished') { err.textContent = 'Igra v tej sobi je že končana.'; return; }
      location.href = gameHref(g, r.code);
    } catch (ex) {
      err.textContent = 'Napaka: ' + ex.message;
    }
  });
  // ?room=KODA na dashboardu → takoj v pravo igro
  const fromUrl = hub.roomFromUrl();
  if (fromUrl) { input.value = fromUrl; $('#joinForm').requestSubmit(); }
}

/* --------------------------------------------------------------- lobbyji */
async function renderLobbies() {
  const el = $('#lobbies');
  try {
    const list = (await hub.listLobbies()).filter(l => gameById(l.game)?.status === 'live');
    if (!list.length) {
      el.innerHTML = '<div class="mg-empty" style="grid-column:1/-1">Trenutno ni odprtih sob. Odpri igro in ustvari svojo!</div>';
      return;
    }
    el.innerHTML = list.map(l => {
      const g = gameById(l.game);
      const full = l.players >= l.max_players;
      return `<div class="dash-lobby">
        <span class="dash-lobby__icon">${icon(g)}</span>
        <span class="dash-lobby__info"><b>${esc(g.name)}</b>
          <span class="mg-small mg-muted">${ui.avatar({ avatar: l.host_avatar, equipped: l.host_equipped }, 'sm')} ${esc(l.host_nickname)} · ${l.players}/${l.max_players}</span>
          <span class="dash-lobby__code">${esc(l.code)}</span></span>
        <a class="mg-btn mg-btn--green mg-btn--small" ${full ? 'aria-disabled="true"' : `href="${esc(gameHref(g, l.code))}"`}>${full ? 'Polna' : 'Pridruži se'}</a>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="mg-empty">Lobbyjev ni bilo mogoče naložiti.</div>';
    console.warn(e);
  }
}

/* --------------------------------------------------------------- igre */
function matches(g) {
  switch (filter) {
    case 'solo': return g.players.min === 1;
    case 'multi': return g.players.max > 1;
    case 'party': return g.tags.includes('party');
    case 'daily': return g.tags.includes('daily');
    default: return true;
  }
}

function renderGames() {
  const list = games.filter(matches).sort((a, b) => (a.status === b.status ? 0 : a.status === 'live' ? -1 : 1));
  $('#games').innerHTML = list.length ? list.map(g => {
    const live = g.status === 'live';
    const pl = g.players.min === g.players.max ? `${g.players.min}` : `${g.players.min}–${g.players.max}`;
    const tag = `${live ? 'a' : 'div'} class="dash-game ${live ? '' : 'dash-game--soon'}" style="--gc:${esc(g.color || '#ffd23f')}" ${live ? `href="${esc(gameHref(g))}"` : 'aria-disabled="true"'}`;
    return `<${tag}>
      ${live ? '' : '<span class="dash-game__soon">Kmalu</span>'}
      <div class="dash-game__top"><span class="dash-game__icon">${icon(g)}</span><span class="dash-game__name">${esc(g.name)}</span></div>
      <div class="dash-game__desc">${esc(g.description)}</div>
      <div class="dash-game__tags">
        <span class="mg-badge">👥 ${pl}</span>
        <span class="mg-badge">${MODE[g.mode]}</span>
        ${g.tags.map(t => `<span class="mg-badge ${TAG_COLOR[t] ? 'mg-badge--' + TAG_COLOR[t] : ''}">${esc(TAG[t] || t)}</span>`).join('')}
      </div>
    </${live ? 'a' : 'div'}>`;
  }).join('') : '<div class="mg-empty">Ni iger za ta filter.</div>';
}

/* --------------------------------------------------------------- lestvica */
async function renderBoard() {
  const el = $('#board');
  document.querySelectorAll('#boardTabs .mg-tab').forEach(b => b.setAttribute('aria-selected', b.dataset.b === boardTab));
  el.innerHTML = '<div class="mg-empty"><span class="mg-spin"></span></div>';
  try {
    if (boardTab === 'xp') {
      const rows = await hub.topXp(10);
      el.innerHTML = rows.length ? `<table class="mg-table"><tbody>${rows.map((r, i) => `<tr class="${r.id === hub.userId ? 'mg-me' : ''}">
        <td class="mg-rank">${i + 1}.</td><td>${ui.who(r)}</td>
        <td class="mg-small mg-muted">niv ${hub.level(r.xp).level}</td><td class="mg-num">${r.xp.toLocaleString('sl-SI')} XP</td></tr>`).join('')}</tbody></table>`
        : '<div class="mg-empty">Še nihče nima XP.</div>';
    } else {
      const seed = hub.dailySeed();
      const daily = games.filter(g => g.status === 'live' && g.tags.includes('daily'));
      const rows = await Promise.all(daily.map(async g => ({
        g, top: (await hub.getLeaderboard({ game: g.id, seed, limit: 1, order: g.scoreOrder || 'desc' }))[0],
      })));
      el.innerHTML = `<p class="mg-small mg-muted" style="margin-top:0">Izziv dneva ${esc(seed.split('-').reverse().join('. '))}</p>
        <table class="mg-table"><tbody>${rows.map(({ g, top }) => `<tr>
          <td style="width:2em">${icon(g)}</td><td><b>${esc(g.name)}</b></td>
          <td>${top ? ui.who(top) : '<span class="mg-muted">še nihče</span>'}</td>
          <td class="mg-num">${top ? esc(top.score.toLocaleString('sl-SI') + (g.scoreUnit ? ' ' + g.scoreUnit : '')) : ''}</td></tr>`).join('')}</tbody></table>`;
    }
  } catch (e) {
    el.innerHTML = '<div class="mg-empty">Lestvice ni bilo mogoče naložiti.</div>';
    console.warn(e);
  }
}

/* --------------------------------------------------------------- dosežki */
async function renderAch() {
  const el = $('#ach');
  if (!hub.profile) { el.innerHTML = '<div class="mg-empty">Ustvari profil in začni zbirati.</div>'; return; }
  try {
    const list = await hub.getAchievements({ game: null });
    if (!list.length) { el.innerHTML = '<div class="mg-empty">Še nimaš dosežkov. Zaigraj kaj!</div>'; return; }
    const by = new Map();
    for (const a of list) { if (!by.has(a.game)) by.set(a.game, []); by.get(a.game).push(a); }
    el.innerHTML = [...by].map(([gid, arr]) => {
      const g = gameById(gid);
      return `<div class="dash-ach-game"><h3>${g ? icon(g) + ' ' + esc(g.name) : esc(gid)} · ${arr.length}</h3>
        <div class="dash-ach-list">${arr.map(a => `<span class="dash-ach" title="${esc(new Date(a.unlocked_at).toLocaleDateString('sl-SI'))}">${esc(a.icon || '🏆')} ${esc(a.title || a.key)}</span>`).join('')}</div></div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="mg-empty">Dosežkov ni bilo mogoče naložiti.</div>';
    console.warn(e);
  }
}

/* --------------------------------------------------------------- zagon */
async function main() {
  try { games = await hub.games(); } catch (e) { console.error('games.json:', e); games = []; }
  renderGames();
  await hub.init({ requireProfile: false });
  header();
  setupJoin();
  setupQuests();
  let lastUid = null;
  hub.onProfile(p => { renderMe(p); if ((p?.id || null) !== lastUid) { lastUid = p?.id || null; renderAch(); renderQuests(); } });
  if (!hub.profile) {
    renderMe(null);
    renderAch();
    renderQuests();
    ui.profileModal({ required: true }).then(() => { renderBoard(); renderAch(); });
  }
  renderBoard();
  renderLobbies();
  let t = null;
  hub.onLobbiesChange(() => { clearTimeout(t); t = setTimeout(renderLobbies, 250); });
  setInterval(() => { if (document.visibilityState === 'visible') renderLobbies(); }, 15000);

  document.getElementById('filters').addEventListener('click', e => {
    const b = e.target.closest('.mg-tab');
    if (!b) return;
    filter = b.dataset.f;
    document.querySelectorAll('#filters .mg-tab').forEach(x => x.setAttribute('aria-selected', x === b));
    renderGames();
  });
  document.getElementById('boardTabs').addEventListener('click', e => {
    const b = e.target.closest('.mg-tab');
    if (b) { boardTab = b.dataset.b; renderBoard(); }
  });
}

main();
