/* =====================================================================
   HERODLE — zagon, zavihki načinov, statistika, nastavitve, pomoč,
   »Prijatelji danes«. Načini so ločeni moduli (modes/*.js) z enakim vmesnikom;
   nov način = nov modul + vrstica v MODES spodaj.
   ===================================================================== */
import { hub, ui, util } from '../../shared/hub.js';
import { HEROES } from './heroes.js';
import { ATTRS, POOLS, computeStats, pluralPoskus, poolLabel, compare } from './logic.js';
import * as daily from './daily.js';
import * as store from './store.js';
import * as sound from './sound.js';
import * as klasika from './modes/klasika.js';
import { token } from './search.js';

const GAME = 'herodle';
const $ = s => document.querySelector(s);
const esc = ui.esc;

/** Registrirani načini (2. faza doda emoji, kostum, dosje). */
const MODES = [klasika];

export const ACH = [
  { key: 'prvi-junak', title: 'Prvi junak', icon: '🦸', desc: 'Reši prvo uganko Herodla' },
  { key: 'jasnovidec', title: 'Jasnovidec', icon: '🔮', desc: 'Reši Klasiko v prvem poskusu' },
  { key: 'trojka', title: 'Hat-trick', icon: '🎩', desc: 'Reši Klasiko v največ 3 poskusih' },
  { key: 'vse-zvezdice', title: 'Fanboy', icon: '⭐', desc: 'Dobi vse 3 ⭐ v bonusu' },
  { key: 'teden', title: 'Teden junaštva', icon: '📅', desc: 'Reši Klasiko 7 dni zapored' },
  { key: 'mesec', title: 'Mesečni ritual', icon: '🗓️', desc: 'Reši Klasiko 30 dni zapored' },
  { key: 'lobanja', title: 'Brez milosti', icon: '💀', desc: 'Reši Klasiko v težkem načinu v največ 5 poskusih' },
  { key: 'oba-svetova', title: 'Multiverzum', icon: '🌌', desc: 'Isti dan reši Samo MCU in Samo DC' },
];
const unlock = k => { const a = ACH.find(x => x.key === k); return a ? hub.unlock(k, { title: a.title, icon: a.icon }) : null; };

const byId = new Map(HEROES.map(h => [h.id, h]));
let date = null;
let current = null;     // trenutni način
let friends = null;     // ui.leaderboard

/* ------------------------------------------------------------------ */

function applySettings() {
  const s = store.getSettings();
  document.body.classList.toggle('hd-contrast', !!s.contrast);
  $('#btnSound').textContent = sound.isMuted() ? '🔇' : '🔊';
  $('#btnSound').setAttribute('aria-label', sound.isMuted() ? 'Vklopi zvok' : 'Utišaj');
}

function renderTabs() {
  $('#modeTabs').innerHTML = MODES.map(m => `<button class="hd-tab" role="tab" data-m="${m.id}" aria-selected="${m === current}">
    <span aria-hidden="true">${m.icon}</span> ${esc(m.label)}${m.isSolved(store, date) ? ' <i class="ok" aria-label="rešeno">✓</i>' : ''}</button>`).join('');
  $('#modeTabs').querySelectorAll('.hd-tab').forEach(b => b.addEventListener('click', () => {
    const m = MODES.find(x => x.id === b.dataset.m);
    if (m && m !== current) mountMode(m);
  }));
}

function ctxFor() {
  return {
    hub, ui, util, daily, heroes: HEROES, byId, sound, store, date, unlock,
    onChange: () => { renderTabs(); refreshSide(); },
    openStats, showLegend,
  };
}

function mountMode(m) {
  current?.unmount();
  current = m;
  m.mount($('#modeRoot'), ctxFor());
  renderTabs();
  refreshSide();
}

/* ------------------------------------------------------------------ */
/*  Stranski panel: prijatelji danes + legenda                         */
/* ------------------------------------------------------------------ */

const fmtTries = s => `${s} ${pluralPoskus(s)}`;

function refreshSide() {
  const pool = current?.currentPool?.() || 'klasika';
  if (!friends) {
    friends = ui.leaderboard($('#friends'), {
      title: '', order: 'asc', format: fmtTries, limit: 10,
      tabs: [
        { label: 'Danes', seed: `${date}:klasika` },
        { label: 'MCU', seed: `${date}:klasika-mcu` },
        { label: 'DC', seed: `${date}:klasika-dc` },
        { label: 'Ta teden', period: 'week' },
      ],
    });
  } else friends.refresh();
  miniHist($('#friendsHist'), pool);
}

/** Koliko poskusov so danes rabili ostali (brez razkritja lika). */
async function miniHist(el, pool) {
  try {
    const rows = await hub.getLeaderboard({ seed: `${date}:${pool}`, limit: 100, order: 'asc' });
    if (!rows.length) { el.innerHTML = `<p class="mg-small mg-muted">Danes v bazenu ${esc(poolLabel(pool))} še nihče ni rešil. Bodi prvi!</p>`; return; }
    const b = Array(7).fill(0);   // 1,2,3,4,5,6–9,10+
    for (const r of rows) b[r.score <= 5 ? r.score - 1 : r.score <= 9 ? 5 : 6]++;
    const max = Math.max(...b);
    const lab = ['1', '2', '3', '4', '5', '6–9', '10+'];
    const mine = rows.find(r => r.user_id === hub.userId)?.score;
    const mineB = mine == null ? -1 : mine <= 5 ? mine - 1 : mine <= 9 ? 5 : 6;
    el.innerHTML = `<div class="hd-mini" aria-label="Porazdelitev poskusov danes">${b.map((n, i) => `<div class="hd-mini__col${i === mineB ? ' me' : ''}">
      <span class="hd-mini__n">${n || ''}</span><i style="height:${max ? Math.max(4, Math.round(56 * n / max)) : 4}px"></i><span>${lab[i]}</span></div>`).join('')}</div>
      <p class="mg-small mg-muted mg-center">${rows.length} ${rows.length === 1 ? 'igralec je' : 'igralcev je'} danes rešil${rows.length === 1 ? '' : 'o'} · ${esc(poolLabel(pool))}</p>`;
  } catch { el.innerHTML = ''; }
}

function legendHtml() {
  return `<ul class="hd-legend">
    <li><span class="hd-cell c-g mini"><i class="sym">✓</i></span> pravilno</li>
    <li><span class="hd-cell c-y mini"><i class="sym">≈</i></span> delno / blizu (±10 let)</li>
    <li><span class="hd-cell c-r mini"><i class="sym">✗</i></span> narobe</li>
    <li><b class="hd-arr up">↑</b><b class="hd-arr down">↓</b> skriti lik je kasnejši / zgodnejši</li>
  </ul>`;
}

const LEGEND = {
  universe: 'Marvel ali DC. Zeleno = isti univerzum.',
  team: 'Zeleno = ista glavna ekipa (»Brez« = brez ekipe). Rumeno = ujema se katera koli ekipa lika (+N pomeni, da jih ima več).',
  species: 'Človek, bog, polbog, vesoljec, atlantid, eternal, android, mutant, simbiot, inhuman, demon …',
  origin: 'Od kod moči: tehnologija, božanski, nesreča, magija, rojen, zelišče, trening, serum, kozmično, brez. Zeleno = vsi izvori enaki, rumeno = vsaj eden.',
  gender: 'M, Ž ali drugo.',
  year: 'Leto prvega stripa. Zeleno = točno, rumeno = največ 10 let razlike. Puščica ↑ = skriti lik je kasnejši, ↓ = zgodnejši.',
  side: 'Junak, zlobec ali antijunak.',
};

function showLegend(focus) {
  ui.modal({
    title: 'Legenda',
    html: `${legendHtml()}<dl class="hd-legdl">${ATTRS.map(a => `<div class="${a.key === focus ? 'focus' : ''}"><dt>${a.icon} ${esc(a.label)}</dt><dd>${esc(LEGEND[a.key])}</dd></div>`).join('')}</dl>`,
  });
}

/* ------------------------------------------------------------------ */
/*  Statistika                                                         */
/* ------------------------------------------------------------------ */

async function openStats(pool = current?.currentPool?.() || 'klasika') {
  let active = pool;
  const draw = el => {
    const s = computeStats(store.statsDays(active), date);
    const max = Math.max(1, ...s.hist);
    el.querySelector('.hd-stats__tabs').innerHTML = POOLS.map(p => `<button class="mg-tab" data-p="${p.id}" aria-selected="${p.id === active}">${esc(p.label)}</button>`).join('');
    el.querySelector('.hd-stats__body').innerHTML = `
      <div class="hd-nums">
        <div><b>${s.played}</b><span>odigrano</span></div>
        <div><b>${s.pct}%</b><span>rešenih</span></div>
        <div><b>${s.current}</b><span>niz 🔥</span></div>
        <div><b>${s.best}</b><span>najdaljši niz</span></div>
        <div><b>${s.avg ?? '—'}</b><span>povprečje</span></div>
      </div>
      <h3 class="hd-sub">Poskusi do rešitve</h3>
      <div class="hd-hist">${s.hist.map((n, i) => `<div class="hd-hist__row${s.todayBucket === i + 1 ? ' today' : ''}">
        <span>${i === 9 ? '10+' : i + 1}</span><i style="width:${Math.max(6, Math.round(100 * n / max))}%"><b>${n}</b></i></div>`).join('')}</div>`;
    el.querySelectorAll('.hd-stats__tabs .mg-tab').forEach(b => b.addEventListener('click', () => { active = b.dataset.p; draw(el); }));
  };
  const mine = new Set((await hub.getAchievements().catch(() => [])).map(a => a.key));
  await ui.modal({
    title: 'Statistika',
    wide: true,
    html: `<div class="hd-stats"><div class="mg-tabs hd-stats__tabs" role="tablist"></div><div class="hd-stats__body"></div>
      <h3 class="hd-sub">Prijatelji danes</h3><div class="hd-stats__board"></div>
      <h3 class="hd-sub">Dosežki</h3><div class="hd-ach">${ACH.map(a => `<div class="hd-ach__item ${mine.has(a.key) ? '' : 'locked'}"><span>${a.icon}</span><div><b>${esc(a.title)}</b><small>${esc(a.desc)}</small></div></div>`).join('')}</div></div>`,
    onOpen: el => {
      draw(el);
      ui.leaderboard(el.querySelector('.hd-stats__board'), {
        title: '', order: 'asc', format: fmtTries,
        tabs: [{ label: 'Danes', seed: `${date}:klasika` }, { label: 'MCU', seed: `${date}:klasika-mcu` }, { label: 'DC', seed: `${date}:klasika-dc` }, { label: 'Ta teden', period: 'week' }],
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Nastavitve in pomoč                                                */
/* ------------------------------------------------------------------ */

async function openSettings() {
  const s = store.getSettings();
  const r = { hard: !!s.hard, contrast: !!s.contrast, sound: !sound.isMuted() };
  const started = POOLS.some(p => store.loadGame(p.id, date).guesses.length && !store.loadGame(p.id, date).solved && !store.loadGame(p.id, date).gaveUp);
  const v = await ui.modal({
    title: 'Nastavitve',
    html: `<div class="mg-stack">
      <label class="mg-check"><input type="checkbox" id="setHard" ${s.hard ? 'checked' : ''} ${started ? 'disabled' : ''}>
        <span>💀 <b>Težki način</b> — vsak poskus mora upoštevati vse zelene namige.${started ? '<br><small class="mg-muted">Spremeniš ga lahko le pred prvim poskusom dneva (v bazenu, ki ga igraš).</small>' : ''}</span></label>
      <label class="mg-check"><input type="checkbox" id="setContrast" ${s.contrast ? 'checked' : ''}>
        <span>🎨 <b>Visok kontrast</b> — oranžno (pravilno) in modro (delno).</span></label>
      <label class="mg-check"><input type="checkbox" id="setSound" ${sound.isMuted() ? '' : 'checked'}>
        <span>🔊 <b>Zvok</b></span></label>
      <p class="mg-small mg-muted">${hub.offline ? 'Offline način: lik dneva se izračuna v brskalniku.' : 'Lik dneva preverja strežnik — v kodi strani ga ni.'}</p>
    </div>`,
    actions: [{ label: 'Zapri', value: false }, { label: 'Shrani', value: true, kind: 'primary' }],
    onOpen: el => {
      for (const [id, k] of [['#setHard', 'hard'], ['#setContrast', 'contrast'], ['#setSound', 'sound']]) {
        el.querySelector(id).addEventListener('change', e => { r[k] = e.target.checked; });
      }
    },
  });
  if (!v) return;
  store.setSettings({ hard: r.hard, contrast: r.contrast });
  sound.setMuted(!r.sound);
  applySettings();
  if (current) mountMode(current);
}

function helpHtml() {
  const ex = HEROES.find(h => h.id === 'iron-man'), tg = HEROES.find(h => h.id === 'hawkeye');
  const r = compare(ex, tg);
  const val = { universe: ex.universe, team: 'Avengers', species: ex.species, origin: 'Tehnol.', gender: 'M', year: String(ex.firstComic), side: ex.alignment };
  return `<div class="hd-help">
    <p>Vsak dan je skrit <b>en junak ali zlobec</b> (Marvel ali DC) — za vse igralce isti. Vpiši lik in barve ti povedo, kako blizu si.
    Poskusov je neomejeno, šteje pa vsak.</p>
    <div class="hd-help__ex" aria-label="Primer vrstice">
      <div class="hd-row__who">${token(ex)}<b>${esc(ex.name)}</b></div>
      <div class="hd-row__cells">${ATTRS.map((a, k) => `<div class="hd-cell c-${r[a.key]}" style="--i:${k}"><span class="hd-cell__in"><span class="v-full v-any">${esc(val[a.key])}</span>
        <span class="hd-cell__foot"><i class="sym">${{ g: '✓', y: '≈', r: '✗' }[r[a.key]]}</i>${a.key === 'year' && r.dir ? `<span class="hd-arr ${r.dir}">${r.dir === 'up' ? '↑' : '↓'}</span>` : ''}</span></span></div>`).join('')}</div>
    </div>
    <p class="mg-small mg-muted">Skriti lik je tu nekdo iz Avengers, človek, moški, junak … in njegov prvi strip je izšel kasneje (↑), a v 10 letih (rumeno).</p>
    ${legendHtml()}
    <p>Po zmagi te čaka <b>bonus krog</b> (3 vprašanja za ⭐), potem pa <b>dosje</b> lika. Bazena <b>Samo MCU</b> in <b>Samo DC</b> imata svoj lik, niz in lestvico.</p>
    <p class="mg-small mg-muted">Neuradna fan igra, ni povezana z Marvel ali DC.</p></div>`;
}
const openHelp = () => ui.modal({ title: 'Kako se igra', wide: true, html: helpHtml(), actions: [{ label: 'Gremo!', value: true, kind: 'primary' }] });

/* ------------------------------------------------------------------ */

function watchMidnight() {
  if (daily.isSimulated()) return;
  setInterval(async () => {
    if (hub.dailySeed() === date) return;
    ui.toast('Nov dan, nov junak!', { icon: '🦸', duration: 4000 });
    await ui.modal({ title: 'Nov dan, nov junak', html: '<p>Polnoč je mimo — pripravljen je nov skriti lik.</p>', actions: [{ label: 'Osveži', value: true, kind: 'primary' }], dismissible: false });
    location.reload();
  }, 20000);
}

async function main() {
  await hub.init({ gameId: GAME, scoreOrder: 'asc' });
  ui.header({ title: 'Herodle' });
  daily.init(hub, HEROES);
  store.setScope(`${hub.mode === 'supabase' ? 'sb' : 'off'}-${hub.userId || 'anon'}`);
  date = daily.today();
  if (daily.isSimulated()) $('#simBanner').innerHTML = `<div class="hd-sim">🧪 Simuliran datum: <b>${esc(date)}</b> (offline, ?date=)</div>`;
  applySettings();
  $('#btnStats').addEventListener('click', () => openStats());
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnHelp').addEventListener('click', openHelp);
  $('#btnSound').addEventListener('click', () => { sound.setMuted(!sound.isMuted()); applySettings(); sound.unlockAudio(); sound.tick('g'); });
  $('#sideLegend').innerHTML = legendHtml();
  const unlockA = () => sound.unlockAudio();
  window.addEventListener('pointerdown', unlockA, { once: true });
  window.addEventListener('keydown', unlockA, { once: true });
  mountMode(MODES[0]);
  watchMidnight();
  if (!store.getSettings().seenHelp) {
    store.setSettings({ seenHelp: true });
    await openHelp();
  }
}

main().catch(e => {
  console.error(e);
  ui.toast('Herodle se ni naložil: ' + (e.message || e), { icon: '⚠️', duration: 6000 });
});
