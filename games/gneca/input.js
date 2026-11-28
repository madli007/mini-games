/* =====================================================================
   GNEČA — input.js: vnos → { tx, fire, giant } za sim.step.
   Telefon: relativno vlečenje kjerkoli na spodnji polovici zaslona
   (dotik = strel). Namizje: miška (drži in vleci) ali ←/→, A/D in
   Space; G = velikan. Ciljni x je v enotah steze.
   ===================================================================== */

export class Input {
  /**
   * @param {HTMLElement} el površina za dotik / miško
   * @param {{getCannonX:()=>number, laneWidth:()=>number, onAny?:Function, onPause?:Function}} o
   */
  constructor(el, { getCannonX, laneWidth, onAny = null, onPause = null }) {
    this.el = el;
    this.getCannonX = getCannonX; this.laneWidth = laneWidth;
    this.onAny = onAny; this.onPause = onPause;
    this.tx = null; this.pointerFire = false; this.keyFire = false; this.giantReq = false;
    this.keys = new Set();
    this.drag = null;
    this.enabled = true;
    this._h = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); this._h.push([t, ev, fn, o]); };
    on(el, 'pointerdown', e => this._down(e));
    on(window, 'pointermove', e => this._move(e));
    on(window, 'pointerup', e => this._up(e));
    on(window, 'pointercancel', e => this._up(e));
    on(window, 'keydown', e => this._key(e, true));
    on(window, 'keyup', e => this._key(e, false));
    on(window, 'blur', () => { this.keys.clear(); this.keyFire = false; this.pointerFire = false; this.drag = null; });
  }

  _down(e) {
    if (!this.enabled || e.button > 0) return;
    const r = this.el.getBoundingClientRect();
    // na telefonu le spodnja polovica (zgoraj je prikaz)
    if (e.pointerType === 'touch' && e.clientY < r.top + r.height * 0.4) return;
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
    this.drag = { id: e.pointerId, x0: e.clientX, tx0: this.tx ?? this.getCannonX(), w: r.width };
    this.pointerFire = true;
    this.onAny?.();
  }
  _move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    // celotna širina zaslona (ali 360 px na ozkem) ≈ 1,3 širine steze
    const span = Math.min(d.w, 520);
    this.tx = d.tx0 + ((e.clientX - d.x0) / span) * this.laneWidth() * 1.3;
    const hw = this.laneWidth() / 2;
    if (this.tx > hw) { d.tx0 -= this.tx - hw; this.tx = hw; }
    if (this.tx < -hw) { d.tx0 += -hw - this.tx; this.tx = -hw; }
  }
  _up(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    this.pointerFire = false;
  }
  _key(e, down) {
    if (!this.enabled) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.code;
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space'].includes(k)) e.preventDefault();
    if (down && !e.repeat && (k === 'Escape' || k === 'KeyP')) { this.onPause?.(); return; }
    if (k === 'Space') { this.keyFire = down; if (down) this.onAny?.(); }
    if (k === 'KeyG' && down && !e.repeat) { this.giantReq = true; this.onAny?.(); }
    if (down) this.keys.add(k); else this.keys.delete(k);
    if (down && ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(k)) this.onAny?.();
  }

  /** Vnos za en korak simulacije (dt v sekundah realnega časa igre). */
  sample(dt) {
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    if (left !== right) {
      const hw = this.laneWidth() / 2;
      const base = this.tx ?? this.getCannonX();
      this.tx = Math.max(-hw, Math.min(hw, base + (right ? 1 : -1) * 13 * dt));
    }
    const giant = this.giantReq;
    this.giantReq = false;
    return { tx: this.tx, fire: this.pointerFire || this.keyFire, giant };
  }

  requestGiant() { this.giantReq = true; }

  reset(x = 0) { this.tx = x; this.drag = null; this.pointerFire = false; this.keyFire = false; this.giantReq = false; }

  dispose() { for (const [t, ev, fn, o] of this._h) t.removeEventListener(ev, fn, o); }
}
