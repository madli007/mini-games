/* =====================================================================
   GNEČA — ui-game.js: meni (zemljevid sklopov z zvezdicami, delavnica,
   dnevni nivo, lestvica, dosežki), HUD med igro, debug drsniki in
   povzetek ob koncu. Brez logike igre (to je v game.js).
   ===================================================================== */
import { ui } from '../../shared/hub.js';
import { B } from './balance.js';
import { UPGRADES, upgradeCost, isUnlocked } from './upgrades.js';

const esc = ui.esc;
const $ = s => document.querySelector(s);

export const ACH = [
  { key: 'prvi-stolp', title: 'Prvi stolp', icon: '🏰', desc: 'Končaj prvi nivo' },
  { key: 'tisoc', title: 'Tisoč', icon: '🌊', desc: 'Imej 1000 tekačev hkrati (z združenimi vred)' },
  { key: 'brez-izgub', title: 'Brez izgub', icon: '🛡️', desc: 'Zmagaj nivo, ne da bi tekač šel skozi vrata − ali ÷' },
  { key: 'velikan', title: 'Velikanski udarec', icon: '🗿', desc: 'Podri stolp samo z velikani' },
  { key: 'puscava', title: 'Gospodar puščave', icon: '🏜️', desc: 'Vse zvezdice v sklopu Puščava' },
  { key: 'sef', title: 'Šef je padel', icon: '👑', desc: 'Premagaj šefa Kanjona' },
  { key: 'dnevni-3', title: 'Dnevne tri', icon: '⭐', desc: '3 zvezdice na dnevnem nivoju' },
];

const starsHtml = n => `<span class="gn-st">${[0, 1, 2].map(i => (i < n ? '<i>★</i>' : '★')).join('')}</span>`;

/**
 * Nariši meni.
 * @param {HTMLElement} el
 * @param {{sets:any[], prog:any, daily:{seed:string, played:any, level:any}, ach:Set<string>, quality:string, qualities:Object}} m
 * @param {{play:Function, buy:Function, daily:Function, setAuto:Function, setQuality:Function}} h
 */
export function renderMenu(el, m, h) {
  const { sets, prog } = m;
  let next = null;
  sets.forEach((s, si) => s.levels.forEach((L, li) => {
    if (!next && isUnlocked(prog, sets, si, li) && !(prog.levels[L.id]?.stars)) next = L.id;
  }));
  const total = sets.reduce((a, s) => a + s.levels.length * 3, 0);
  const got = Object.values(prog.levels).reduce((a, l) => a + l.stars, 0);
  const dp = m.daily.played;
  el.innerHTML = `
  <div class="mg-stack">
    <div class="mg-card mg-card--glow gn-hero">
      <div class="gn-hero__icon">🏃</div>
      <div class="gn-hero__txt">
        <h1 class="mg-title" style="margin:0 0 6px">Gneča</h1>
        <p class="mg-muted" style="margin:0">Drži za strel in vleci levo-desno. Pošlji tekače skozi <b style="color:var(--mg-cyan)">×2</b> in <b style="color:var(--mg-cyan)">×3</b>,
          izogni se <b style="color:var(--mg-red)">−</b> in <b style="color:var(--mg-red)">÷</b>, preplavi hordo in podri stolp.</p>
      </div>
      <div class="gn-gears" title="Zobniki za delavnico">⚙️ ${prog.gears} <span class="mg-muted mg-small">· ★ ${got}/${total}</span></div>
    </div>
    <div class="gn-layout">
      <div class="mg-stack">
        <div class="mg-card">
          <h2 class="mg-title">Zemljevid</h2>
          ${sets.map((s, si) => {
            const st = s.levels.reduce((a, L) => a + (prog.levels[L.id]?.stars || 0), 0);
            return `<div class="gn-set">
              <div class="gn-set__head"><span style="font-size:24px">${s.icon || ''}</span><h3 class="mg-title">${si + 1}. ${esc(s.name)}</h3><span class="gn-set__stars">★ ${st}/${s.levels.length * 3}</span></div>
              <div class="gn-levels">${s.levels.map((L, li) => {
                const open = isUnlocked(prog, sets, si, li), rec = prog.levels[L.id];
                return `<button class="gn-lv ${L.id === next ? 'gn-lv--next' : ''} ${L.boss ? 'gn-lv--boss' : ''}" data-lv="${esc(L.id)}" ${open ? '' : 'disabled'}
                  title="${esc(L.name)}${rec?.best ? ' · rekord ' + rec.best : ''}" aria-label="Nivo ${si + 1}-${li + 1} ${esc(L.name)}${open ? '' : ', zaklenjen'}">
                  ${open ? `<b>${si + 1}-${li + 1}</b>${starsHtml(rec?.stars || 0)}` : '<span class="gn-lv__lock">🔒</span>'}</button>`;
              }).join('')}</div></div>`;
          }).join('')}
          ${next ? `<button class="mg-btn mg-btn--primary mg-btn--big mg-btn--block" data-lv="${esc(next)}">▶ Igraj ${esc(levelName(sets, next))}</button>` : '<p class="mg-center mg-muted">Kampanja je končana — lovi 3 zvezdice in dnevni nivo!</p>'}
        </div>
        <div class="mg-card">
          <h2 class="mg-title">Dosežki</h2>
          <div class="gn-ach">${ACH.map(a => `<div class="gn-ach__it ${m.ach.has(a.key) ? '' : 'locked'}"><span>${a.icon}</span><div><b>${esc(a.title)}</b><span class="mg-small mg-muted">${esc(a.desc)}</span></div></div>`).join('')}</div>
        </div>
      </div>
      <div class="mg-stack">
        <div class="mg-card mg-stack">
          <h2 class="mg-title">Dnevni nivo</h2>
          <div class="gn-daily">
            <div class="gn-daily__info">
              <p class="mg-muted" style="margin:0">Nov nivo vsak dan, za vse enak. Nadgradnje so <b>fiksne</b>, zato je lestvica poštena.
                Za lestvico šteje <b>prvi poskus</b>, ostali so vadba.</p>
              <p class="mg-small" style="margin:6px 0 0">${dp ? `Prvi poskus: <b>${dp.first} točk</b> ${starsHtml(dp.stars)} · najboljši ${dp.best}` : '<span style="color:var(--mg-green)">Še nisi igral — prvi poskus šteje!</span>'}</p>
            </div>
            <button class="mg-btn mg-btn--green mg-btn--big" id="btnDaily">${dp ? 'Vadi' : '▶ Igraj'}</button>
          </div>
        </div>
        <div class="mg-card">
          <h2 class="mg-title">Delavnica</h2>
          <p class="mg-small mg-muted" style="margin:0 0 6px">Zobnike dobiš za nove zvezdice (${B.gears.perStar} ⚙️), zmago (${B.gears.perWin} ⚙️) in dnevni nivo.</p>
          ${UPGRADES.map(u => {
            const lv = prog.up[u.id] | 0, cost = upgradeCost(u, lv);
            return `<div class="gn-up"><span class="gn-up__icon">${u.icon}</span>
              <div><b>${esc(u.name)}</b><div class="mg-small mg-muted">${esc(u.desc)}</div>
                <div class="gn-up__pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
              ${cost == null ? '<span class="mg-badge mg-badge--green">MAX</span>' : `<button class="mg-btn mg-btn--small ${prog.gears >= cost ? 'mg-btn--cyan' : ''}" data-buy="${u.id}" ${prog.gears >= cost ? '' : 'disabled'}>⚙️ ${cost}</button>`}
            </div>`;
          }).join('')}
          <label class="mg-check" style="margin-top:10px"><input type="checkbox" id="autoGiant" ${prog.autoGiant ? 'checked' : ''}> Velikan samodejno, ko je merilec poln</label>
          <label class="mg-field" style="margin-top:8px"><span class="mg-label">Grafika</span>
            <select class="mg-select" id="quality">${Object.entries(m.qualities).map(([k, q]) => `<option value="${k}" ${k === m.quality ? 'selected' : ''}>${esc(q.name)}</option>`).join('')}
              <option value="auto" ${m.quality === 'auto' ? 'selected' : ''}>Samodejno</option></select></label>
        </div>
        <div class="mg-card" id="board"></div>
      </div>
    </div>
  </div>`;
  el.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => h.play(b.dataset.lv)));
  el.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => h.buy(b.dataset.buy)));
  el.querySelector('#btnDaily').addEventListener('click', () => h.daily());
  el.querySelector('#autoGiant').addEventListener('change', e => h.setAuto(e.target.checked));
  el.querySelector('#quality').addEventListener('change', e => h.setQuality(e.target.value));
}

export function levelName(sets, id) {
  for (let si = 0; si < sets.length; si++) {
    const li = sets[si].levels.findIndex(L => L.id === id);
    if (li >= 0) return `${si + 1}-${li + 1} ${sets[si].levels[li].name}`;
  }
  return id === 'dnevni' ? 'Dnevni nivo' : id;
}

/* ------------------------------------------------------------ HUD */

const fmtTime = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class Hud {
  constructor() {
    this.el = {
      level: $('#hudLevel'), tower: $('#hudTower'), bar: $('#hudTowerBar'), time: $('#hudTime'),
      crowd: $('#hudCrowd'), enemy: $('#hudEnemy'), hearts: $('#hudHearts'), giant: $('#btnGiant'), ring: $('#giantRing'), glbl: $('#giantLbl'),
    };
    this.last = {};
  }
  setLevel(text) { this.el.level.textContent = text; }
  update(st) {
    const E = this.el, L = this.last;
    const hp = Math.max(0, Math.ceil(st.tower.hp));
    if (hp !== L.hp) { L.hp = hp; E.tower.textContent = '🏰 ' + hp; E.bar.style.width = (100 * hp / st.tower.max).toFixed(1) + '%'; }
    const tl = Math.ceil((st.maxSteps - st.step) / B.hz);
    if (tl !== L.tl) { L.tl = tl; E.time.textContent = fmtTime(tl); E.time.classList.toggle('low', tl <= 10); }
    const c = Math.round(st.crowd);
    if (c !== L.c) { L.c = c; E.crowd.textContent = '🏃 ' + c; }
    const ec = Math.round(st.enemyCrowd);
    if (ec !== L.ec) { L.ec = ec; E.enemy.textContent = '👹 ' + ec; }
    const left = Math.max(0, B.breachMax - Math.round(st.breach));
    if (left !== L.left) { L.left = left; E.hearts.innerHTML = '❤'.repeat(left) + '<s>' + '❤'.repeat(B.breachMax - left) + '</s>'; }
    const charge = Math.max(1, Math.round(st.p.giantCharge));
    const f = Math.min(1, st.cannon.meter / charge);
    const pf = Math.round(f * 100);
    if (pf !== L.pf) {
      L.pf = pf;
      E.ring.style.strokeDashoffset = String(176 * (1 - f));
      E.glbl.textContent = f >= 1 ? 'VELIKAN' : pf + ' %';
      E.giant.classList.toggle('ready', f >= 1);
    }
  }
}

/* ------------------------------------------------------------ debug (?debug=1) */

/**
 * @param {HTMLElement} el
 * @param {{get:()=>any, speed:{v:number}, onGrid:Function, onStress:Function, onQuality:Function, quality:()=>string}} o
 */
export function debugPanel(el, o) {
  const sliders = [
    ['fireRate', 'Hitrost streljanja', 1, 30, 1],
    ['runSpeed', 'Hitrost tekačev', 2, 14, 0.5],
    ['enemySpeed', 'Hitrost sovražnikov', 1, 12, 0.5],
    ['sep', 'Ločevanje', 0, 15, 0.5],
    ['cap', 'Meja tekačev', 50, 1500, 50],
    ['giantHp', 'HP velikana', 5, 120, 5],
    ['giantCharge', 'Polnilec velikana', 5, 80, 5],
  ];
  el.classList.remove('mg-hidden');
  el.innerHTML = `<button data-fold style="float:right">▾</button><b>Debug</b><div data-body>
    ${sliders.map(([k, n, a, b, s]) => `<label>${n}: <span data-v="${k}"></span><input type="range" min="${a}" max="${b}" step="${s}" data-k="${k}"></label>`).join('')}
    <div class="row">Hitrost igre: ${[1, 2, 4].map(v => `<button data-sp="${v}">×${v}</button>`).join('')}</div>
    <div class="row"><button data-grid>Mreža trkov</button><button data-stress>600 + 600</button></div>
    <div class="row">Kakovost: ${['high', 'medium', 'low'].map(q => `<button data-q="${q}">${q}</button>`).join('')}</div></div>`;
  // na ozkem zaslonu je plošča zložena
  const body = el.querySelector('[data-body]'), fold = el.querySelector('[data-fold]');
  const setFold = f => { body.style.display = f ? 'none' : ''; fold.textContent = f ? '▸' : '▾'; };
  setFold(innerWidth < 600);
  fold.addEventListener('click', () => setFold(body.style.display !== 'none'));
  const sync = () => {
    const st = o.get(); if (!st) return;
    el.querySelectorAll('[data-k]').forEach(i => { i.value = st.p[i.dataset.k]; el.querySelector(`[data-v="${i.dataset.k}"]`).textContent = st.p[i.dataset.k]; });
    el.querySelectorAll('[data-sp]').forEach(b => b.classList.toggle('on', +b.dataset.sp === o.speed.v));
    el.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('on', b.dataset.q === o.quality()));
  };
  el.querySelectorAll('[data-k]').forEach(i => i.addEventListener('input', () => {
    const st = o.get(); if (!st) return;
    st.p[i.dataset.k] = +i.value; sync();
  }));
  el.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', () => { o.speed.v = +b.dataset.sp; sync(); }));
  let grid = false;
  el.querySelector('[data-grid]').addEventListener('click', e => { grid = !grid; e.target.classList.toggle('on', grid); o.onGrid(grid); });
  el.querySelector('[data-stress]').addEventListener('click', () => o.onStress());
  el.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { o.onQuality(b.dataset.q); sync(); }));
  // dogodki v panelu ne smejo streljati
  for (const ev of ['pointerdown', 'pointerup']) el.addEventListener(ev, e => e.stopPropagation());
  return { sync };
}

/* ------------------------------------------------------------ povzetek ob koncu */

export function resultHtml(res, { gears = 0, daily = false, first = false, best = 0, record = false, reason = '' } = {}) {
  const reasons = { stolp: 'Stolp je padel!', preboj: 'Horda je prebila do topa.', cas: 'Zmanjkalo je časa.' };
  const p = res.parts;
  return `<div class="gn-res">
    <p style="margin:0" class="mg-muted">${esc(reasons[reason] || '')}</p>
    <div class="gn-res__stars">${[0, 1, 2].map(i => (i < res.stars ? '⭐' : '<s>⭐</s>')).join('')}</div>
    <table class="mg-small"><tbody>
      <tr><td>Zmaga</td><td>${p.win}</td></tr>
      <tr><td>Preostali čas</td><td>${p.time}</td></tr>
      <tr><td>Uničeni sovražniki</td><td>${p.kills}</td></tr>
      <tr><td>Škoda stolpu</td><td>${p.tower}</td></tr>
      ${p.lost ? `<tr><td>Izgubljeni v − in ÷</td><td style="color:var(--mg-red)">${p.lost}</td></tr>` : ''}
      <tr><td><b>Skupaj</b></td><td><b>${res.score}</b></td></tr>
    </tbody></table>
    ${gears ? `<p class="gn-gears" style="margin:8px 0 0">+${gears} ⚙️</p>` : ''}
    ${record ? '<p style="margin:6px 0 0;color:var(--mg-green)"><b>Nov rekord!</b></p>' : best ? `<p class="mg-small mg-muted" style="margin:6px 0 0">Rekord: ${best}</p>` : ''}
    ${daily ? `<p class="mg-small" style="margin:6px 0 0">${first ? '✅ Prvi poskus — vpisano na dnevno lestvico.' : '🏋️ Vadba — na lestvici ostane prvi poskus.'}</p>` : ''}
  </div>`;
}
