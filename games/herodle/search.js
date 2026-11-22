/* =====================================================================
   HERODLE — iskalno polje z avtocomplete (skupno vsem načinom).
   - išče po imenu, aliasih in alter egu (logic.search: brez šumnikov/ločil)
   - že ugibani liki so prečrtani in jih ni mogoče izbrati
   - puščice + Enter na namizju, tap na telefonu
   - na telefonu z odprto tipkovnico je polje pritrjeno nad tipkovnico (visualViewport),
     predlogi se takrat odprejo NAVZGOR, da ne prekrijejo vnosa
   ===================================================================== */
import { search, initials, textOn } from './logic.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Žeton lika (krog z inicialkami v barvi kostuma — ne slika). */
export function token(h, size = '') {
  return `<span class="hd-token ${size}" style="--c:${h.color};color:${textOn(h.color)}" aria-hidden="true">${esc(initials(h.name))}</span>`;
}

/**
 * @param {HTMLElement} el
 * @param {{pool:()=>any[], used:()=>Set<string>, onPick:(hero:any)=>void, placeholder?:string}} opt
 */
export function createSearch(el, { pool, used, onPick, placeholder = 'Vpiši junaka ali zlobca …' }) {
  el.innerHTML = `<div class="hd-search">
      <div class="hd-search__box">
        <span class="hd-search__icon" aria-hidden="true">🔎</span>
        <input class="hd-search__input" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          enterkeyhint="go" placeholder="${esc(placeholder)}" role="combobox" aria-expanded="false" aria-controls="hdSugg" aria-label="Ime lika">
        <button class="hd-search__go" type="button">Ugibaj</button>
      </div>
      <ul class="hd-sugg" id="hdSugg" role="listbox" hidden></ul>
    </div>`;
  const wrap = el.querySelector('.hd-search');
  const input = el.querySelector('input');
  const list = el.querySelector('.hd-sugg');
  let items = [];
  let active = -1;
  let disabled = false;

  const pickable = i => items[i] && !used().has(items[i].hero.id);

  function render() {
    const q = input.value;
    items = q.trim() ? search(pool(), q, { limit: 8 }) : [];
    const u = used();
    if (active >= items.length || !pickable(active)) active = items.findIndex((_, i) => pickable(i));
    if (!items.length) {
      list.innerHTML = q.trim() ? '<li class="hd-sugg__none">Ni takega lika v tem bazenu.</li>' : '';
    } else {
      list.innerHTML = items.map(({ hero, via }, i) => {
        const isUsed = u.has(hero.id);
        return `<li role="option" data-i="${i}" class="hd-sugg__item${isUsed ? ' used' : ''}${i === active ? ' active' : ''}" aria-disabled="${isUsed}" aria-selected="${i === active}">
          ${token(hero, 'sm')}<span class="hd-sugg__name">${esc(hero.name)}</span>
          ${via ? `<span class="hd-sugg__via">${esc(via)}</span>` : ''}${isUsed ? '<span class="hd-sugg__via">že ugibano</span>' : ''}</li>`;
      }).join('');
    }
    const open = !!q.trim() && document.activeElement === input;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
  }

  function pick(i = active) {
    if (disabled) return;
    if (i < 0) i = items.findIndex((_, k) => pickable(k));
    if (!pickable(i)) return;
    const hero = items[i].hero;
    input.value = '';
    items = []; active = -1;
    render();
    onPick(hero);
  }

  input.addEventListener('input', () => { active = -1; render(); });
  input.addEventListener('focus', () => { render(); fitKeyboard(); });
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; wrap.classList.remove('kb'); wrap.style.removeProperty('--kb'); }, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      for (let k = 1; k <= items.length; k++) {
        const i = (active + dir * k + items.length * 2) % items.length;
        if (pickable(i)) { active = i; break; }
      }
      render();
      list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); pick(); }
    else if (e.key === 'Escape') { input.value = ''; render(); }
  });
  // pointerdown + preventDefault: vnos ne izgubi fokusa (tipkovnica ostane odprta)
  list.addEventListener('pointerdown', e => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    e.preventDefault();
    pick(+li.dataset.i);
  });
  el.querySelector('.hd-search__go').addEventListener('pointerdown', e => e.preventDefault());
  el.querySelector('.hd-search__go').addEventListener('click', () => { pick(); input.focus(); });

  // telefon: polje nad tipkovnico
  const vv = window.visualViewport;
  function fitKeyboard() {
    if (!vv || document.activeElement !== input) return;
    const kb = window.innerHeight - vv.height - vv.offsetTop;
    const open = kb > 120 && matchMedia('(pointer: coarse)').matches;
    wrap.classList.toggle('kb', open);
    if (open) wrap.style.setProperty('--kb', `${Math.max(0, kb)}px`); else wrap.style.removeProperty('--kb');
  }
  vv?.addEventListener('resize', fitKeyboard);
  vv?.addEventListener('scroll', fitKeyboard);

  return {
    focus() { input.focus({ preventScroll: true }); },
    setDisabled(v) {
      disabled = !!v;
      input.disabled = disabled;
      el.querySelector('.hd-search__go').disabled = disabled;
      wrap.classList.toggle('disabled', disabled);
    },
    refresh: render,
    shake() { wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake'); },
    destroy() { vv?.removeEventListener('resize', fitKeyboard); vv?.removeEventListener('scroll', fitKeyboard); el.innerHTML = ''; },
  };
}
