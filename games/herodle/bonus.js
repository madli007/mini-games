/* =====================================================================
   HERODLE — bonus krogi po zmagi (3 vprašanja, vsako z enim poskusom)
   in kartica lika »Dosje razkrit«.
   ===================================================================== */
import { scoreBonus, attrValue } from './logic.js';
import { token } from './search.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stars = n => (n > 0 ? '⭐'.repeat(n) : '—');

/**
 * Odigraj bonus (nadaljuje pri prvem neodgovorjenem vprašanju — osvežitev ga ne ponovi).
 * @param {HTMLElement} el
 * @param {{questions:any[], answers:any[], byId:Map<string,any>, onAnswer:(i:number, ans:any, stars:number)=>void, sound:any}} o
 * @returns {Promise<void>} ko so odgovorjena vsa vprašanja
 */
export async function runBonus(el, { questions, answers, byId, onAnswer, sound }) {
  for (let i = answers.length; i < questions.length; i++) {
    const q = questions[i];
    const ans = await ask(el, q, i, questions.length, byId);
    const st = scoreBonus(q, ans);
    onAnswer(i, ans, st);
    if (st > 0) sound.ding(); else sound.buzz();
    await reveal(el, q, ans, st, byId);
    await sleep(q.kind === 'choice' ? 1300 : 1900);
  }
}

function head(q, i, n) {
  return `<div class="hd-bq__head"><span class="mg-badge mg-badge--yellow">Bonus ${i + 1}/${n}</span>
    <span class="hd-bq__icon" aria-hidden="true">${q.icon}</span></div>
    <h3 class="hd-bq__text">${esc(q.text)}</h3>`;
}

function ask(el, q, i, n, byId) {
  return new Promise(resolve => {
    if (q.kind === 'choice') {
      el.innerHTML = `<div class="hd-bq">${head(q, i, n)}
        <div class="hd-bq__opts">${q.options.map((o, k) => `<button class="hd-opt" data-k="${k}" type="button">${esc(o)}</button>`).join('')}</div></div>`;
      el.querySelectorAll('.hd-opt').forEach(b => b.addEventListener('click', () => {
        el.querySelectorAll('.hd-opt').forEach(x => { x.disabled = true; });
        b.classList.add('picked');
        resolve(q.options[+b.dataset.k]);
      }, { once: true }));
    } else if (q.kind === 'slider') {
      el.innerHTML = `<div class="hd-bq">${head(q, i, n)}
        <div class="hd-slider"><output class="hd-slider__val">${q.start}</output>
          <input type="range" min="${q.min}" max="${q.max}" step="1" value="${q.start}" aria-label="Leto">
          <div class="hd-slider__row"><button type="button" class="mg-btn mg-btn--small" data-d="-1" aria-label="Leto manj">−</button>
            <span class="mg-small mg-muted">${esc(q.hint)}</span>
            <button type="button" class="mg-btn mg-btn--small" data-d="1" aria-label="Leto več">+</button></div>
          <button type="button" class="mg-btn mg-btn--primary mg-btn--block hd-bq__ok">Potrdi</button></div></div>`;
      const r = el.querySelector('input'), out = el.querySelector('output');
      const upd = () => { out.textContent = r.value; };
      r.addEventListener('input', upd);
      el.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => { r.value = +r.value + +b.dataset.d; upd(); }));
      el.querySelector('.hd-bq__ok').addEventListener('click', () => { r.disabled = true; resolve(+r.value); }, { once: true });
    } else {
      // razvrščanje: povleci (pointer) ali ▲▼
      let order = q.items.slice();
      el.innerHTML = `<div class="hd-bq">${head(q, i, n)}<ol class="hd-order"></ol>
        <button type="button" class="mg-btn mg-btn--primary mg-btn--block hd-bq__ok">Potrdi vrstni red</button></div>`;
      const ol = el.querySelector('.hd-order');
      const draw = () => {
        ol.innerHTML = order.map((id, k) => {
          const h = byId.get(id);
          return `<li class="hd-order__item" data-id="${id}">
            <span class="hd-order__grip" aria-hidden="true">⠿</span>${token(h, 'sm')}<span class="hd-order__name">${esc(h.name)}</span>
            <span class="hd-order__btns"><button type="button" data-k="${k}" data-d="-1" aria-label="Višje" ${k === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" data-k="${k}" data-d="1" aria-label="Nižje" ${k === order.length - 1 ? 'disabled' : ''}>▼</button></span></li>`;
        }).join('');
      };
      draw();
      ol.addEventListener('click', e => {
        const b = e.target.closest('button[data-k]');
        if (!b) return;
        const k = +b.dataset.k, j = k + +b.dataset.d;
        [order[k], order[j]] = [order[j], order[k]];
        draw();
      });
      let drag = null;
      ol.addEventListener('pointerdown', e => {
        const li = e.target.closest('.hd-order__item');
        if (!li || e.target.closest('button')) return;
        e.preventDefault();
        drag = { id: li.dataset.id, li };
        li.classList.add('drag');
        li.setPointerCapture?.(e.pointerId);
      });
      ol.addEventListener('pointermove', e => {
        if (!drag) return;
        const over = [...ol.children].find(c => { const r = c.getBoundingClientRect(); return e.clientY >= r.top && e.clientY <= r.bottom; });
        if (!over || over.dataset.id === drag.id) return;
        const from = order.indexOf(drag.id), to = order.indexOf(over.dataset.id);
        order.splice(from, 1); order.splice(to, 0, drag.id);
        draw();
        drag.li = ol.querySelector(`[data-id="${drag.id}"]`);
        drag.li.classList.add('drag');
      });
      const end = () => { if (drag) { drag.li?.classList.remove('drag'); drag = null; } };
      ol.addEventListener('pointerup', end);
      ol.addEventListener('pointercancel', end);
      el.querySelector('.hd-bq__ok').addEventListener('click', () => { el.querySelectorAll('button').forEach(b => { b.disabled = true; }); resolve(order.slice()); }, { once: true });
    }
  });
}

async function reveal(el, q, ans, st, byId) {
  const box = el.querySelector('.hd-bq');
  if (q.kind === 'choice') {
    el.querySelectorAll('.hd-opt').forEach(b => {
      const v = q.options[+b.dataset.k];
      if (q.correct.includes(v)) b.classList.add('right');
      else if (v === ans) b.classList.add('wrong');
    });
  } else if (q.kind === 'slider') {
    el.querySelector('.hd-slider__val').innerHTML = `${esc(ans)} <small>· pravilno: <b>${q.answer}</b></small>`;
  } else {
    el.querySelectorAll('.hd-order__item').forEach((li, k) => {
      li.classList.add(li.dataset.id === q.answer[k] ? 'right' : 'wrong');
      const h = byId.get(li.dataset.id);
      li.querySelector('.hd-order__btns').innerHTML = `<b>${h.firstComic}</b>`;
    });
  }
  box.insertAdjacentHTML('beforeend', `<div class="hd-bq__res ${st ? 'ok' : 'no'}">${st ? `+${stars(st)}` : 'Žal ne.'}</div>`);
}

/** Povzetek odgovorjenih vprašanj (po osvežitvi). */
export function bonusSummary(questions, answers) {
  return `<ul class="hd-bsum">${questions.map((q, i) => {
    const a = answers[i];
    if (!a) return '';
    return `<li><span aria-hidden="true">${q.icon}</span> ${esc(q.text)} <b>${a.stars ? stars(a.stars) : '✗'}</b></li>`;
  }).join('')}</ul>`;
}

/** Kartica lika »Dosje razkrit« (brez slik). */
export function heroCard(h, byId) {
  const nem = h.nemesis ? (byId.get(h.nemesis)?.name || h.nemesis) : null;
  const row = (k, v) => (v ? `<div class="hd-card__row"><span>${k}</span><b>${esc(v)}</b></div>` : '');
  return `<article class="hd-card" style="--c:${h.color}">
    <div class="hd-card__stamp" aria-hidden="true">DOSJE RAZKRIT</div>
    <div class="hd-card__head">${token(h, 'xl')}<div><h3 class="hd-card__name">${esc(h.name)}</h3>
      ${h.alterEgo ? `<div class="hd-card__alter">${esc(h.alterEgo)}</div>` : ''}</div></div>
    <div class="hd-card__grid">
      ${row('Univerzum', h.universe)}
      ${row('Ekipe', h.teams.length ? h.teams.join(', ') : 'Brez')}
      ${row('Vrsta', h.species)}
      ${row('Izvor moči', attrValue(h, 'origin'))}
      ${row('Stran', h.alignment)}
      ${row('Prvi strip', String(h.firstComic))}
      ${row('Prvi film', h.firstFilm ? String(h.firstFilm) : '—')}
      ${row('Domovanje', h.home)}
      ${row('Nemesis', nem)}
      ${h.actors.length ? row('V filmu', h.actors.slice(0, 3).join(', ')) : ''}
    </div>
    <div class="hd-card__more" data-more="${esc(h.id)}"></div></article>`;
}

/**
 * Kartice lika dopolni s paleto kostuma (trakovi) in zanimivimi dejstvi iz hints.js.
 * hints.js se naloži dinamično (šele, ko je kartica prikazana = po rešitvi/predaji).
 * @param {ParentNode} root
 */
export async function enrichCards(root) {
  const els = [...root.querySelectorAll('[data-more]:not([data-done])')];
  if (!els.length) return;
  els.forEach(el => el.setAttribute('data-done', '1'));
  let HINTS;
  try { ({ HINTS } = await import('./hints.js')); } catch { return; }
  for (const el of els) {
    const x = HINTS[el.dataset.more];
    if (!x) continue;
    el.innerHTML = `<div class="hd-card__pal" role="img" aria-label="Barve kostuma">${x.palette.map((c, i) => `<i style="--c:${c};--f:${i === 0 ? 3 : 1}"></i>`).join('')}</div>
      <ul class="hd-card__facts">${x.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`;
  }
}
