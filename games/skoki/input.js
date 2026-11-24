/* =====================================================================
   SMUČARSKI SKOKI — input.js: miška, tipkovnica, dotik (in nagib telefona)
   → vnos na tick { btn, pitch } za simulacijo.
     Miška (le levi gumb; desni meni je onemogočen): klik = štart, DVOKLIK na koncu mize = odriv,
            premik gor/dol = nagib, DVOKLIK pred tlemi = telemark, en klik = dve nogi.
     Tipkovnica: le R (nov skok), Enter (replay), Esc/P (pavza) — preslednica in puščice NE upravljajo skoka.
     Dotik: tap = klik (dvojni tap = dvoklik), vlečenje gor/dol v letu = nagib (relativno na mesto dotika).
   Vsak klik je kratek impulz gumba (2 ticka); simulacija šteje le pritiske.
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
    this.pulse = 0;          // klik: gumb pritisnjen 2 ticka
    this.queue = 0;          // klik, ki je prišel med impulzom (hiter dvoklik)
    this.gap = 0;
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
    // desni klik bi odprl meni brskalnika — na igralni površini ga onemogočimo
    (s.closest('section') || s).addEventListener('contextmenu', e => e.preventDefault());
    s.addEventListener('dblclick', e => e.preventDefault());
    s.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return this._touchStart(e);
      if (e.button !== 0) return;
      this.used.mouse = true;
      this.lastY = e.clientY;
      this.click();
    });
    window.addEventListener('pointerup', e => { if (e.pointerType === 'touch') this._touchEnd(e); });
    window.addEventListener('pointercancel', e => { if (e.pointerType === 'touch') this._touchEnd(e, true); });
    window.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return this._touchMove(e);
      if (this.lastY != null && this.mode === 'air') this.pitch -= (e.clientY - this.lastY) * MOUSE_SENS;
      this.lastY = e.clientY;
      this._clamp();
    });
    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key;
      // skok se upravlja samo z miško (dvoklik med vodenjem nagiba, kot pri DSJ) — tipke le za meni
      if (k === ' ' || k === 'Spacebar') e.preventDefault();
      else if (k === 'r' || k === 'R') this.onAction?.('r');
      else if (k === 'Enter') this.onAction?.('enter');
      else if (k === 'Escape' || k === 'p' || k === 'P') this.onAction?.('pause');
    });
    window.addEventListener('keyup', e => {
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') this.keyUp = false;
      else if (k === 'ArrowDown' || k === 's' || k === 'S') this.keyDown = false;
    });
    window.addEventListener('blur', () => { this.keyUp = this.keyDown = false; });
  }

  /* ---------------- dotik */
  _touchStart(e) {
    if (this.touch) return;
    this.used.touch = true;
    e.preventDefault();
    this.touch = { id: e.pointerId, y0: e.clientY, t0: performance.now(), moved: false, pitch0: this.pitch };
    // pred letom: tap je takoj klik (hiter dvojni tap za odriv); v letu ločimo tap od vlečenja ob dvigu prsta
    if (this.mode !== 'air') { this.touch.clicked = true; this.click(); }
  }
  _touchMove(e) {
    const t = this.touch;
    if (!t || t.id !== e.pointerId) return;
    const dy = e.clientY - t.y0;
    if (Math.abs(dy) > 10) t.moved = true;
    if (this.mode === 'air' && t.moved) { this.pitch = t.pitch0 - dy * TOUCH_SENS; this._clamp(); }
  }
  _touchEnd(e, cancel = false) {
    const t = this.touch;
    if (!t || t.id !== e.pointerId) return;
    this.touch = null;
    if (!cancel && !t.clicked && !t.moved && performance.now() - t.t0 < 350) this.click();
  }

  /** En klik (impulz gumba za simulacijo). */
  click() {
    if (this.pulse > 0 || this.gap > 0) this.queue = Math.min(2, this.queue + 1);
    else this.pulse = 2;
    this.onAction?.('press');
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

  get btn() { return this.pulse > 0; }

  /** Vnos za en tick (kliči natanko enkrat na tick simulacije). */
  sample() {
    if (this.mode === 'air') {
      if (this.keyUp) this.pitch += KEY_RATE / 120;
      if (this.keyDown) this.pitch -= KEY_RATE / 120;
      this._clamp();
    }
    let btn = 0;
    if (this.pulse > 0) { btn = 1; if (--this.pulse === 0) this.gap = 1; }
    else if (this.gap > 0) this.gap--;
    else if (this.queue > 0) { this.queue--; btn = 1; this.pulse = 1; }
    return { btn, pitch: quantPitch(this.pitch) };
  }

  reset() { this.pulse = 0; this.queue = 0; this.gap = 0; this.keyUp = this.keyDown = false; }
}
