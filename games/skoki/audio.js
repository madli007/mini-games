/* =====================================================================
   SMUČARSKI SKOKI — audio.js: sintetiziran zvok (WebAudio, brez datotek).
   Šumenje smuči (višina po hitrosti), tišina ob odrivu, piš vetra v letu,
   publika (glasnejša z daljavo), kravji zvonci in trobente, pristanek, padec,
   semafor, preprosta glasba v meniju.
   ===================================================================== */

export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.music = null; this.loops = null; }

  /** Ustvari kontekst ob prvi uporabnikovi akciji. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    // skrit zavihek = tišina (tudi glasba v meniju)
    document.addEventListener('visibilitychange', () => { if (document.hidden) c.suspend(); else c.resume(); });
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.5 + b * 2; }
    this._loops();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  _src(loop = true) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = loop; return s; }

  _loops() {
    const c = this.ctx;
    const mk = (type, f, q) => { const n = this._src(); const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q; const g = c.createGain(); g.gain.value = 0; n.connect(flt); flt.connect(g); g.connect(this.master); n.start(); return { flt, g }; };
    const ski = mk('bandpass', 900, 0.8);
    const wind = mk('lowpass', 500, 0.5);
    const crowd = mk('bandpass', 1100, 0.6);
    // publika: amplitudna modulacija za »valovanje«
    const lfo = c.createOscillator(); lfo.frequency.value = 0.7; const lg = c.createGain(); lg.gain.value = 0; lfo.connect(lg); lg.connect(crowd.g.gain); lfo.start();
    this.loops = { ski, wind, crowd, lfoGain: lg };
  }

  /**
   * Zanke vsako sličico.
   * @param {{ski:number, wind:number, crowd:number, speed:number}} v 0–1 jakosti
   */
  update(v) {
    if (!this.ctx || !this.loops) return;
    const t = this.ctx.currentTime, L = this.loops;
    L.ski.g.gain.setTargetAtTime(v.ski * 0.35, t, 0.05);
    L.ski.flt.frequency.setTargetAtTime(500 + v.speed * 1500, t, 0.1);
    L.wind.g.gain.setTargetAtTime(v.wind * 0.5, t, 0.08);
    L.wind.flt.frequency.setTargetAtTime(300 + v.wind * 900, t, 0.1);
    L.crowd.g.gain.setTargetAtTime(0.03 + v.crowd * 0.32, t, 0.25);
    L.lfoGain.gain.setTargetAtTime(0.02 + v.crowd * 0.1, t, 0.25);
  }

  silence() { if (this.loops) { const t = this.ctx.currentTime; for (const k of ['ski', 'wind']) this.loops[k].g.gain.setTargetAtTime(0, t, 0.03); } }

  _tone(f, dur, { type = 'sine', gain = 0.2, at = 0, slide = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  _burst(dur, { f = 800, q = 1, gain = 0.3, at = 0, type = 'bandpass' } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + at;
    const n = this._src(false), flt = c.createBiquadFilter(), g = c.createGain();
    flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(flt); flt.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + dur + 0.05);
  }

  beep(last = false) { this._tone(last ? 1320 : 880, last ? 0.35 : 0.12, { type: 'square', gain: 0.08 }); }
  takeoff(perfect) { this._burst(0.06, { f: 2500, q: 2, gain: 0.35 }); if (perfect) this._tone(1760, 0.25, { gain: 0.08, at: 0.02 }); }
  land(hard = 0) { this._tone(90, 0.25, { gain: 0.35 + hard * 0.2, slide: 0.5 }); this._burst(0.25, { f: 400, q: 0.7, gain: 0.25 + hard * 0.2, type: 'lowpass' }); }
  crash() { for (let i = 0; i < 5; i++) { this._tone(70 + Math.random() * 40, 0.2, { gain: 0.3, at: i * 0.18, slide: 0.6 }); this._burst(0.3, { f: 600, gain: 0.3, at: i * 0.18, type: 'lowpass' }); } }
  cheer(level = 1) { for (let i = 0; i < 3; i++) this._burst(1.2 + level, { f: 1000 + i * 400, q: 0.5, gain: 0.12 * level, at: i * 0.08 }); }
  bells(n = 8) {
    for (let i = 0; i < n; i++) {
      const f = 520 + Math.random() * 260, at = i * 0.16 + Math.random() * 0.08;
      this._tone(f, 0.5, { type: 'triangle', gain: 0.07, at }); this._tone(f * 2.76, 0.25, { gain: 0.03, at });
    }
  }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.35 + (i === 3 ? 0.4 : 0), { type: 'sawtooth', gain: 0.05, at: i * 0.14, attack: 0.02 })); }
  whoosh() { this._burst(0.5, { f: 600, q: 0.4, gain: 0.15, type: 'lowpass' }); }

  /** Preprosta glasba v meniju (arpeggio v zanki). */
  menuMusic(on) {
    if (!this.ctx) return;
    if (on && !this.music) {
      const notes = [262, 330, 392, 523, 392, 330, 294, 349, 440, 587, 440, 349];
      let i = 0;
      this.music = setInterval(() => {
        if (this.muted || document.hidden) return;
        const f = notes[i++ % notes.length];
        this._tone(f, 0.5, { type: 'triangle', gain: 0.035 });
        if (i % 6 === 1) this._tone(f / 2, 1.2, { type: 'sine', gain: 0.04 });
      }, 260);
    } else if (!on && this.music) { clearInterval(this.music); this.music = null; }
  }
}
