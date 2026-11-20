/* MINI GAMES — dashboard */
import { hub, ui } from './shared/hub.js';

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
  if (!p) { el.innerHTML = '<button class="mg-btn mg-btn--primary" id="mkProfile">Ustvari profil</button>'; $('#mkProfile').onclick = () => ui.profileModal(); return; }
  const lv = hub.level(p.xp);
  el.innerHTML = `${ui.avatar(p.avatar, 'lg')}
    <div class="dash-me__info">
      <div class="dash-me__name">${esc(p.nickname)}</div>
      <div class="dash-me__lvl">NIVO ${lv.level} · ${p.xp.toLocaleString('sl-SI')} XP</div>
      <div class="mg-xpbar" title="${lv.current}/${lv.next} XP do naslednjega nivoja"><i style="width:${(lv.progress * 100).toFixed(1)}%"></i></div>
      <div class="mg-small mg-muted">${lv.next - lv.current} XP do nivoja ${lv.level + 1}</div>
    </div>
    <button class="mg-btn mg-btn--ghost mg-btn--small" id="editMe">Uredi</button>`;
  $('#editMe').onclick = () => ui.profileModal();
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
          <span class="mg-small mg-muted">${ui.avatar(l.host_avatar, 'sm')} ${esc(l.host_nickname)} · ${l.players}/${l.max_players}</span>
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
  hub.onProfile(p => { renderMe(p); renderAch(); });
  if (!hub.profile) {
    renderMe(null);
    renderAch();
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
