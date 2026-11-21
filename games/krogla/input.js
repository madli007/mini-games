/* =====================================================================
   HRČKOVA KROGLA — input.js: tipkovnica, miška (palica proti kazalcu),
   virtualna palica na dotik in nagib telefona. Vhod je relativen na kamero.
   ===================================================================== */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Input {
  /**
   * @param {HTMLElement} area element igre (canvas ovoj)
   * @param {{stickEl:HTMLElement, knobEl:HTMLElement}} touch
   */
  constructor(area, { stickEl, knobEl }) {
    this.area = area;
    this.keys = new Set();
    this.mode = 'auto';          // 'auto' | 'keys' | 'mouse'
    this.touchMode = 'stick';    // 'stick' | 'tilt'
    this.mouse = { active: false, x: 0, y: 0, inside: false, moved: 0 };
    this.ballScreen = { x: 0, y: 0 };
    this.stick = { el: stickEl, knob: knobEl, id: null, cx: 0, cy: 0, x: 0, y: 0 };
    this.tilt = { on: false, beta: 0, gamma: 0, b0: null, g0: null, ok: false };
    this.enabled = true;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this._bind();
  }

  _bind() {
    const k = e => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return null;
      return e.code;
    };
    addEventListener('keydown', e => {
      const c = k(e); if (!c) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(c)) {
        this.keys.add(c); this.mouse.active = false;
        if (this.enabled) e.preventDefault();
      }
    });
    addEventListener('keyup', e => { const c = k(e); if (c) this.keys.delete(c); });
    addEventListener('blur', () => { this.keys.clear(); this._stickEnd(); });

    const a = this.area;
    a.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = a.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
      this.mouse.inside = true;
      if (++this.mouse.moved > 2) this.mouse.active = true;
    });
    a.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { this.mouse.inside = false; this.mouse.moved = 0; } });

    // virtualna palica
    const s = this.stick;
    if (s.el) {
      s.el.addEventListener('pointerdown', e => {
        e.preventDefault();
        s.id = e.pointerId;
        s.el.setPointerCapture(e.pointerId);
        const r = s.el.getBoundingClientRect();
        s.cx = r.left + r.width / 2; s.cy = r.top + r.height / 2;
        this._stickMove(e);
      });
      s.el.addEventListener('pointermove', e => { if (e.pointerId === s.id) this._stickMove(e); });
      const end = e => { if (e.pointerId === s.id) this._stickEnd(); };
      s.el.addEventListener('pointerup', end);
      s.el.addEventListener('pointercancel', end);
    }
    addEventListener('deviceorientation', e => {
      if (e.beta == null) return;
      this.tilt.ok = true;
      this.tilt.beta = e.beta; this.tilt.gamma = e.gamma;
      if (this.tilt.b0 == null) this.calibrate();
    });
  }

  _stickMove(e) {
    const s = this.stick;
    const R = (s.el.getBoundingClientRect().width / 2) || 60;
    let dx = e.clientX - s.cx, dy = e.clientY - s.cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    s.x = dx / R; s.y = -dy / R;
    if (s.knob) s.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  _stickEnd() {
    const s = this.stick;
    s.id = null; s.x = s.y = 0;
    if (s.knob) s.knob.style.transform = '';
  }

  /** Nagib: trenutni položaj = ravno. */
  calibrate() { this.tilt.b0 = this.tilt.beta; this.tilt.g0 = this.tilt.gamma; }

  /** Vklopi nagib (na iOS zahteva dovoljenje ob tapu). */
  async enableTilt() {
    try {
      const DOE = window.DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return false;
      }
      this.tilt.on = true;
      this.tilt.b0 = null;
      return true;
    } catch { return false; }
  }

  /** Položaj krogle na zaslonu (za miško). */
  setBall(x, y) { this.ballScreen.x = x; this.ballScreen.y = y; }

  /** Vhod v prostoru zaslona: [desno, naprej] ∈ [-1, 1]. */
  screen() {
    if (!this.enabled) return [0, 0];
    let x = 0, y = 0;
    const K = this.keys;
    if (K.has('ArrowLeft') || K.has('KeyA')) x -= 1;
    if (K.has('ArrowRight') || K.has('KeyD')) x += 1;
    if (K.has('ArrowUp') || K.has('KeyW')) y += 1;
    if (K.has('ArrowDown') || K.has('KeyS')) y -= 1;
    if (x || y) { const m = Math.hypot(x, y); return [x / m, y / m]; }
    if (this.stick.id != null) return [this.stick.x, this.stick.y];
    if (this.tilt.on && this.tilt.ok && this.touchMode === 'tilt') {
      let gx = this.tilt.gamma - (this.tilt.g0 || 0), by = this.tilt.beta - (this.tilt.b0 || 0);
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      if (ang === 90) [gx, by] = [by, -gx]; else if (ang === -90 || ang === 270) [gx, by] = [-by, gx];
      const dz = 3;
      const f = v => Math.abs(v) < dz ? 0 : clamp((v - Math.sign(v) * dz) / 22, -1, 1);
      return [f(gx), -f(by)];
    }
    if (this.mode !== 'keys' && this.mouse.active && this.mouse.inside) {
      const dx = this.mouse.x - this.ballScreen.x, dy = this.mouse.y - this.ballScreen.y;
      const d = Math.hypot(dx, dy);
      const dead = 26, full = 170;
      if (d < dead) return [0, 0];
      const m = clamp((d - dead) / (full - dead), 0, 1);
      return [dx / d * m, -dy / d * m];
    }
    return [0, 0];
  }

  /** Vhod v svetu glede na kamero (yaw): [ix, iz]. */
  world(yaw) {
    const [sx, sy] = this.screen();
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    return [rx * sx + fx * sy, rz * sx + fz * sy];
  }
}
