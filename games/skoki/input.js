/* =====================================================================
   SMUČARSKI SKOKI — input.js: miška in dotik (neobvezno nagib telefona)
   → vnos na tick { btn, pitch } za simulacijo.
     btn = število pritisnjenih gumbov (0, 1, 2); pitch = popravek nagiba (°) glede na samodejni
     letalni položaj (+ = bolj pokonci / nazaj, − = bolj naprej).
     Miška: klik = štart; LEVI + DESNI GUMB HKRATI na koncu mize = odriv; premik gor/dol = nagib;
            pred tlemi EN gumb = telemark, OBA gumba = dve nogi. Meni desnega klika je onemogočen.
     Dotik: tap = štart; DVA PRSTA HKRATI = odriv / dve nogi; en tap v letu = telemark;
            vlečenje gor/dol v letu = nagib (relativno na mesto dotika).
     Tipkovnica: le R (nov skok), Enter (replay), Esc/P (pavza) — skoka ne upravlja.
   Kratek pritisk (krajši od ticka) se ne izgubi: največje število gumbov od zadnjega ticka se zadrži.
   Igra nastavi mode ('gate' | 'inrun' | 'air' | 'other') in ob odrivu resetPitch().
   ===================================================================== */
import { quantPitch } from './physics.js';

const MOUSE_SENS = 0.22;   // ° na piksel
const TOUCH_SENS = 0.3;
const TILT_SENS = 1.2;
const LIM = 40;            // največji popravek nagiba (°)
const LAND_GRACE = 7;      // tickov (≈ 60 ms) za drugi gumb ob pristanku: oba = dve nogi, sicer telemark

export class Input {
  /** @param {HTMLElement} surface igralna površina (canvas) */
  constructor(surface) {
    this.surface = surface;
    this.mode = 'other';
    this.left = false; this.right = false;
    this.touches = new Map();  // id → { y0, t0, moved, pitch0, counted }
    this.latch = 0;            // največ gumbov od zadnjega ticka
    this.pulse = 0; this.pulseLevel = 0;   // tap v letu (en prst) = kratek pritisk
    this.pitch = 0;
    this.lastY = null;
    this.tilt = null;
    this.tiltOn = false;
    this.used = { mouse: false, touch: false };
    this.onAction = null;    // (ime) => … : 'press' (štart), 'r', 'enter', 'pause'
    this._bind();
  }

  _count() {
    let t = 0;
    for (const v of this.touches.values()) if (v.counted) t++;
    return Math.min(2, (this.left ? 1 : 0) + (this.right ? 1 : 0) + t);
  }
  _bump() { this.latch = Math.max(this.latch, this._count()); }

  _bind() {
    const s = this.surface;
    s.style.touchAction = 'none';
    // desni klik bi odprl meni brskalnika — na igralni površini ga onemogočimo
    (s.closest('section') || s).addEventListener('contextmenu', e => e.preventDefault());
    s.addEventListener('mousedown', e => {
      if (e.button === 0) this.left = true;
      else if (e.button === 2) this.right = true;
      else return;
      e.preventDefault();
      this.used.mouse = true;
      this.lastY = e.clientY;
      this._bump();
      this.onAction?.('press');
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.left = false; else if (e.button === 2) this.right = false; });
    window.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return this._touchMove(e);
      if (this.lastY != null && this.mode === 'air') this.pitch -= (e.clientY - this.lastY) * MOUSE_SENS;
      this.lastY = e.clientY;
      this._clamp();
    });
    s.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') this._touchStart(e); });
    window.addEventListener('pointerup', e => { if (e.pointerType === 'touch') this._touchEnd(e); });
    window.addEventListener('pointercancel', e => { if (e.pointerType === 'touch') this._touchEnd(e, true); });
    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key;
      if (k === ' ' || k === 'Spacebar') e.preventDefault();   // preslednica skoka ne upravlja
      else if (k === 'r' || k === 'R') this.onAction?.('r');
      else if (k === 'Enter') this.onAction?.('enter');
      else if (k === 'Escape' || k === 'p' || k === 'P') this.onAction?.('pause');
    });
    window.addEventListener('blur', () => { this.left = this.right = false; this.touches.clear(); });
  }

  /* ---------------- dotik */
  _touchStart(e) {
    this.used.touch = true;
    e.preventDefault();
    const t = { y0: e.clientY, t0: performance.now(), moved: false, pitch0: this.pitch, counted: false };
    this.touches.set(e.pointerId, t);
    // pred letom šteje vsak prst takoj; v letu le dva prsta hkrati (en prst vleče nagib ali tapne)
    if (this.mode !== 'air') t.counted = true;
    else if (this.touches.size >= 2) for (const v of this.touches.values()) v.counted = true;
    this._bump();
    this.onAction?.('press');
  }
  _touchMove(e) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    const dy = e.clientY - t.y0;
    if (Math.abs(dy) > 10) t.moved = true;
    if (this.mode === 'air' && t.moved && !t.counted) { this.pitch = t.pitch0 - dy * TOUCH_SENS; this._clamp(); }
  }
  _touchEnd(e, cancel = false) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    this.touches.delete(e.pointerId);
    // en kratek tap v letu = en gumb (telemark)
    if (!cancel && this.mode === 'air' && !t.counted && !t.moved && performance.now() - t.t0 < 300) { this.pulse = 3; this.pulseLevel = 1; this.latch = Math.max(this.latch, 1); }
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
        if (this.tilt == null) this.tilt = { base: e.beta, pitch: this.pitch };
        if (this.mode === 'air') { this.pitch = this.tilt.pitch - (e.beta - this.tilt.base) * TILT_SENS; this._clamp(); }
      });
    }
    this.tiltOn = true;
    return true;
  }
  disableTilt() { this.tiltOn = false; this.tilt = null; }

  _clamp() { this.pitch = Math.max(-LIM, Math.min(LIM, this.pitch)); }

  /** Ob odrivu: popravek nagiba na 0 (skakalec je v samodejnem letalnem položaju). */
  resetPitch(p = 0) { this.pitch = p; this.tilt = null; for (const t of this.touches.values()) { t.pitch0 = p; } }

  /** Vnos za en tick (kliči natanko enkrat na tick simulacije). */
  sample() {
    let cur = this._count();
    if (this.pulse > 0) { cur = Math.max(cur, this.pulseLevel); this.pulse--; }
    let btn = Math.max(cur, this.latch);
    this.latch = cur;
    if (this.landing) btn = this._landBtn(btn, cur);
    else this.lg = null;
    return { btn, pitch: quantPitch(this.pitch) };
  }

  /**
   * Pristanek (po odrivu): EN gumb = telemark, OBA gumba = dve nogi. Simulacija (in boti, ghosti) pa pozna
   * btn 1 = priprava / dve nogi, btn 2 = telemark (nadgradnja 1 → 2 obdrži trenutek priprave). Zato:
   * prvi pritisk takoj pošlje 1 (priprava se začne brez zamika); če v LAND_GRACE tickih ne pride drugi gumb,
   * pošljemo 2 (telemark), sicer ostane 1 (dve nogi).
   */
  _landBtn(btn, cur) {
    // 'arm': gumba, ki sta še držana od odriva, ne štejeta — pristanek začne šele nov pritisk
    const lg = this.lg || (this.lg = { st: 'arm', t: 0, out: 0 });
    if (lg.st === 'arm') {
      if (btn) return 0;
      lg.st = 'idle';
    }
    if (lg.st === 'idle') {
      if (!btn) return 0;
      if (btn >= 2) { lg.st = 'done'; lg.out = 1; return 1; }        // oba hkrati = dve nogi
      lg.st = 'wait'; lg.t = LAND_GRACE; return 1;
    }
    if (lg.st === 'wait') {
      if (btn >= 2) { lg.st = 'done'; lg.out = 1; return 1; }        // drugi gumb v roku = dve nogi
      if (--lg.t > 0) return btn ? 1 : 0;
      lg.st = 'done'; lg.out = 2; return 2;                          // le en gumb = telemark
    }
    return cur || btn ? lg.out : 0;
  }

  reset() { this.left = this.right = false; this.touches.clear(); this.latch = 0; this.pulse = 0; this.lg = null; }
}
