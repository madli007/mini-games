/* =====================================================================
   SMUČARSKI SKOKI — input.js: miška, tipkovnica, dotik (in nagib telefona)
   → vnos na tick { btn, pitch } za simulacijo.
     Miška: klik = štart, držanje = drža, spust = odriv, premik gor/dol = nagib,
            klik = telemark, držanje = dve nogi.
     Tipkovnica: preslednica = akcije, ↑/↓ (W/S) = nagib.
     Dotik: tap = štart, prst = drža, dvig = odriv, vlečenje gor/dol = nagib
            (relativno na mesto dotika), tap = telemark, mirno držanje = dve nogi.
   Igra nastavi mode ('gate' | 'inrun' | 'air' | 'other') in ob odrivu resetPitch().
   ===================================================================== */
import { quantPitch } from './physics.js';

const MOUSE_SENS = 0.22;   // ° na piksel
const TOUCH_SENS = 0.3;
const KEY_RATE = 55;       // °/s
const TILT_SENS = 1.2;

export class Input {
  /** @param {HTMLElement} surface igralna površina (canvas) */
  constructor(surface) {
    this.surface = surface;
    this.mode = 'other';
    this.btnMouse = false; this.btnKey = false; this.btnTouch = false;
    this.pitch = 18;
    this.keyUp = false; this.keyDown = false;
    this.pulse = 0;          // tap: gumb pritisnjen za nekaj tickov
    this.touch = null;       // { id, y0, t0, moved, pitch0, holdTimer }
    this.lastY = null;
    this.tilt = null;        // { base } nagib telefona
    this.tiltOn = false;
    this.used = { mouse: false, key: false, touch: false };
    this.onAction = null;    // (ime) => … : 'press' (štart / klik), 'r', 'enter', 'pause'
    this._bind();
  }

  _bind() {
    const s = this.surface;
    s.style.touchAction = 'none';
    s.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return this._touchStart(e);
      if (e.button !== 0) return;
      this.used.mouse = true;
      this.btnMouse = true; this.lastY = e.clientY;
      this.onAction?.('press');
    });
    window.addEventListener('pointerup', e => {
      if (e.pointerType === 'touch') return this._touchEnd(e);
      if (e.button === 0) this.btnMouse = false;
    });
    window.addEventListener('pointercancel', e => { if (e.pointerType === 'touch') this._touchEnd(e, true); else this.btnMouse = false; });
    window.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return this._touchMove(e);
      if (this.lastY != null && this.mode === 'air') this.pitch -= (e.clientY - this.lastY) * MOUSE_SENS;
      this.lastY = e.clientY;
      this._clamp();
    });
    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key;
      if (k === ' ' || k === 'Spacebar') {
        e.preventDefault();
        if (e.repeat) return;
        this.used.key = true;
        this.btnKey = true;
        this.onAction?.('press');
      } else if (k === 'ArrowUp' || k === 'w' || k === 'W') { this.keyUp = true; this.used.key = true; e.preventDefault(); }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { this.keyDown = true; this.used.key = true; e.preventDefault(); }
      else if (k === 'r' || k === 'R') this.onAction?.('r');
      else if (k === 'Enter') this.onAction?.('enter');
      else if (k === 'Escape' || k === 'p' || k === 'P') this.onAction?.('pause');
    });
    window.addEventListener('keyup', e => {
      const k = e.key;
      if (k === ' ' || k === 'Spacebar') this.btnKey = false;
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') this.keyUp = false;
      else if (k === 'ArrowDown' || k === 's' || k === 'S') this.keyDown = false;
    });
    window.addEventListener('blur', () => { this.btnMouse = this.btnKey = this.btnTouch = false; this.keyUp = this.keyDown = false; });
  }

  /* ---------------- dotik */
  _touchStart(e) {
    if (this.touch) return;
    this.used.touch = true;
    e.preventDefault();
    this.touch = { id: e.pointerId, y0: e.clientY, t0: performance.now(), moved: false, pitch0: this.pitch, hold: false };
    if (this.mode === 'air') {
      // v letu: vlečenje = nagib, tap = telemark, mirno držanje = dve nogi
      const t = this.touch;
      t.holdTimer = setTimeout(() => { if (this.touch === t && !t.moved) { t.hold = true; this.btnTouch = true; } }, 350);
    } else {
      this.btnTouch = true;
      this.onAction?.('press');
    }
  }
  _touchMove(e) {
    const t = this.touch;
    if (!t || t.id !== e.pointerId) return;
    const dy = e.clientY - t.y0;
    if (Math.abs(dy) > 10) t.moved = true;
    if (this.mode === 'air' && t.moved && !t.hold) { this.pitch = t.pitch0 - dy * TOUCH_SENS; this._clamp(); }
  }
  _touchEnd(e, cancel = false) {
    const t = this.touch;
    if (!t || t.id !== e.pointerId) return;
    clearTimeout(t.holdTimer);
    this.touch = null;
    this.btnTouch = false;
    if (!cancel && this.mode === 'air' && !t.moved && !t.hold && performance.now() - t.t0 < 350) {
      this.pulse = 4;   // tap → kratek pritisk (telemark)
      this.onAction?.('press');
    }
  }

  /* ---------------- nagib telefona (neobvezno) */
  async enableTilt() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return false;
      }
    } catch { return false; }
    if (!this._tiltBound) {
      this._tiltBound = true;
      window.addEventListener('deviceorientation', e => {
        if (!this.tiltOn || e.beta == null) return;
        const b = e.beta;
        if (this.tilt == null) this.tilt = { base: b, pitch: this.pitch };
        if (this.mode === 'air') { this.pitch = this.tilt.pitch - (b - this.tilt.base) * TILT_SENS; this._clamp(); }
      });
    }
    this.tiltOn = true;
    return true;
  }
  disableTilt() { this.tiltOn = false; this.tilt = null; }

  _clamp() { this.pitch = Math.max(-45, Math.min(60, this.pitch)); }

  /** Ob odrivu: ciljni nagib na privzeto vrednost. */
  resetPitch(p = 18) { this.pitch = p; this.tilt = null; if (this.touch) { this.touch.pitch0 = p; this.touch.y0 = this.touch.y0; } }

  get btn() { return this.btnMouse || this.btnKey || this.btnTouch || this.pulse > 0; }

  /** Vnos za en tick (kliči natanko enkrat na tick simulacije). */
  sample() {
    if (this.mode === 'air') {
      if (this.keyUp) this.pitch += KEY_RATE / 120;
      if (this.keyDown) this.pitch -= KEY_RATE / 120;
      this._clamp();
    }
    const btn = this.btn ? 1 : 0;
    if (this.pulse > 0) this.pulse--;
    return { btn, pitch: quantPitch(this.pitch) };
  }

  reset() { this.btnMouse = this.btnKey = this.btnTouch = false; this.pulse = 0; this.keyUp = this.keyDown = false; }
}
