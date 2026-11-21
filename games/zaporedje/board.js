/* =====================================================================
   ZAPOREDJE — plošča s ploščicami (DOM), predvajanje in učinki.
   ===================================================================== */
import { TILES, KEY_LABELS4, KEY_LABELS6 } from './logic.js';
import { tone } from './audio.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/**
 * @param {HTMLElement} stage element .zp-stage (vsebuje .zp-wave in .zp-board)
 * @param {{onPress:(tileId:number, pos:number)=>void}} opt
 */
export function createBoard(stage, { onPress }) {
  const boardEl = stage.querySelector('.zp-board');
  const wave = stage.querySelector('.zp-wave');
  let layout = [0, 1, 2, 3];
  let locked = true;
  let lightOnPress = true;
  const offTimers = new Map();

  const tileEl = id => boardEl.querySelector(`.zp-tile[data-id="${id}"]`);

  function render() {
    const n = layout.length;
    const labels = n === 6 ? KEY_LABELS6 : KEY_LABELS4;
    boardEl.classList.toggle('zp-board--6', n === 6);
    boardEl.innerHTML = layout.map((id, pos) => {
      const t = TILES[id];
      return `<button type="button" class="zp-tile" data-id="${id}" data-pos="${pos}" style="--c:${t.color}" aria-label="${t.name}">
        <span class="zp-tile__sym" aria-hidden="true">${t.sym}</span><span class="zp-tile__key" aria-hidden="true">${labels[pos]}</span></button>`;
    }).join('');
  }

  /** Nova razporeditev (Kameleon: animiran premik ploščic). */
  function setLayout(next, { animate = false } = {}) {
    const same = next.length === layout.length && boardEl.children.length === next.length;
    if (!animate || !same || reducedMotion()) {
      layout = next.slice();
      render();
      return;
    }
    const before = new Map(layout.map(id => [id, tileEl(id).getBoundingClientRect()]));
    layout = next.slice();
    const labels = layout.length === 6 ? KEY_LABELS6 : KEY_LABELS4;
    layout.forEach((id, pos) => {
      const el = tileEl(id);
      el.dataset.pos = pos;
      el.querySelector('.zp-tile__key').textContent = labels[pos];
      boardEl.appendChild(el);
    });
    for (const id of layout) {
      const el = tileEl(id);
      const a = before.get(id), b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.9)` }, { transform: 'translate(0,0) scale(1)' }],
        { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    }
  }

  function lock(v) {
    locked = !!v;
    boardEl.classList.toggle('locked', locked);
  }

  /** Prižgi ploščico (luč in/ali ton). */
  function flash(id, ms = 300, { light = true, sound = true } = {}) {
    const el = tileEl(id);
    if (sound) tone(TILES[id].freq, Math.max(0.16, ms / 1000 * 0.9));
    if (!el || !light) return;
    el.classList.remove('lit');
    void el.offsetWidth;
    el.classList.add('lit');
    clearTimeout(offTimers.get(id));
    offTimers.set(id, setTimeout(() => el.classList.remove('lit'), ms));
    stage.style.setProperty('--wave', TILES[id].color);
    wave.classList.remove('go');
    void wave.offsetWidth;
    wave.classList.add('go');
  }

  /**
   * Predvajaj zaporedje.
   * @param {number[]} seq id-ji ploščic
   * @param {number} tempo ms na korak
   * @param {{light?:boolean, sound?:boolean, token?:{cancelled:boolean}}} [opt]
   */
  async function play(seq, tempo, { light = true, sound = true, token = { cancelled: false } } = {}) {
    lock(true);
    boardEl.classList.add('playing');
    const on = Math.round(tempo * 0.62);
    try {
      for (const id of seq) {
        if (token.cancelled) return false;
        flash(id, on, { light, sound });
        await sleep(tempo);
      }
    } finally {
      boardEl.classList.remove('playing');
    }
    return !token.cancelled;
  }

  /** Vsi skupaj — ob pravilno končanem krogu. */
  function pulse() {
    boardEl.classList.remove('pulse');
    void boardEl.offsetWidth;
    boardEl.classList.add('pulse');
  }

  /** Pravilna ploščica utripne (kje si se zmotil). */
  function hint(id) {
    const el = tileEl(id);
    if (!el) return;
    el.classList.remove('hint');
    void el.offsetWidth;
    el.classList.add('hint');
    setTimeout(() => el.classList.remove('hint'), 1600);
  }

  function wrong(id) {
    const el = id != null && tileEl(id);
    if (el) { el.classList.add('wrong'); setTimeout(() => el.classList.remove('wrong'), 700); }
  }

  function shake() {
    if (reducedMotion()) return;
    stage.classList.remove('shake');
    void stage.offsetWidth;
    stage.classList.add('shake');
  }

  /** Pritisk na položaju (miška, prst ali tipka). */
  function pressPos(pos) {
    if (locked) return;
    const id = layout[pos];
    if (id == null) return;
    flash(id, 200, { light: true, sound: lightOnPress });
    onPress(id, pos);
  }

  boardEl.addEventListener('pointerdown', e => {
    const b = e.target.closest('.zp-tile');
    if (!b) return;
    e.preventDefault();
    pressPos(+b.dataset.pos);
  });
  boardEl.addEventListener('contextmenu', e => e.preventDefault());

  render();
  lock(true);
  return {
    setLayout, lock, flash, play, pulse, hint, wrong, shake, pressPos,
    get layout() { return layout.slice(); },
    get locked() { return locked; },
    /** false = ob pritisku ni tona (modifikator Tišina — zvok ureja audio.js; tu ostane za TV). */
    set pressSound(v) { lightOnPress = !!v; },
  };
}
