/* =====================================================================
   HRČKOVA KROGLA — audio.js: WebAudio sintetizirani učinki in glasba v zanki.
   ===================================================================== */

export class Audio {
  constructor() {
    this.ctx = null;
    this.sfx = true;
    this.music = true;
    this.musicOn = false;
    this.set = 1;
  }

  /** Ob prvi interakciji uporabnika. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
      this.fx = this.ctx.createGain(); this.fx.gain.value = this.sfx ? 1 : 0; this.fx.connect(this.master);
      this.mus = this.ctx.createGain(); this.mus.gain.value = this.music ? 0.22 : 0; this.mus.connect(this.master);
      // šum za kotaljenje
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }
      this.noiseBuf = buf;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      this.rollF = this.ctx.createBiquadFilter(); this.rollF.type = 'lowpass'; this.rollF.frequency.value = 300;
      this.rollG = this.ctx.createGain(); this.rollG.gain.value = 0;
      src.connect(this.rollF); this.rollF.connect(this.rollG); this.rollG.connect(this.fx);
      src.start();
    } catch { this.ctx = null; }
  }

  setSfx(on) { this.sfx = on; if (this.fx) this.fx.gain.value = on ? 1 : 0; }
  setMusic(on) { this.music = on; if (this.mus) this.mus.gain.value = on ? 0.22 : 0; }

  /** Kotaljenje glede na hitrost. */
  roll(speed, grounded, surf) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = grounded ? Math.min(1, speed / 10) : 0;
    const k = surf === 'ice' ? 0.5 : surf === 'glue' ? 1.4 : 1;
    this.rollG.gain.setTargetAtTime(v * 0.5 * k, t, 0.05);
    this.rollF.frequency.setTargetAtTime(150 + v * (surf === 'ice' ? 1400 : 700), t, 0.05);
  }

  _tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, at = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.fx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, { freq = 800, vol = 0.3, type = 'bandpass', at = 0, q = 1 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.fx);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  play(name, v = 1) {
    if (!this.ctx || !this.sfx) return;
    switch (name) {
      case 'bump': this._tone(110, 0.12, { type: 'triangle', vol: Math.min(0.4, 0.08 * v) }); this._noise(0.08, { freq: 500, vol: Math.min(0.3, 0.05 * v) }); break;
      case 'land': this._tone(80, 0.18, { type: 'sine', vol: 0.35, slide: 0.6 }); break;
      case 'fall': this._tone(700, 1.0, { type: 'sawtooth', vol: 0.12, slide: 0.15 }); this._noise(0.9, { freq: 1200, vol: 0.08, type: 'lowpass' }); break;
      case 'star': [0, 4, 7, 12].forEach((s, i) => this._tone(880 * 2 ** (s / 12), 0.18, { type: 'square', vol: 0.08, at: i * 0.06 })); break;
      case 'clock': this._tone(1320, 0.08, { type: 'square', vol: 0.1 }); this._tone(1760, 0.12, { type: 'square', vol: 0.1, at: 0.08 }); break;
      case 'checkpoint': [0, 7, 12].forEach((s, i) => this._tone(523 * 2 ** (s / 12), 0.3, { type: 'triangle', vol: 0.18, at: i * 0.09 })); break;
      case 'goal': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this._tone(392 * 2 ** (s / 12), 0.35, { type: 'square', vol: 0.09, at: i * 0.08 })); break;
      case 'tick': this._tone(1800, 0.04, { type: 'square', vol: 0.08 }); break;
      case 'spring': this._tone(200, 0.35, { type: 'triangle', vol: 0.3, slide: 4 }); break;
      case 'hammer': this._tone(60, 0.3, { type: 'square', vol: 0.3, slide: 0.5 }); this._noise(0.2, { freq: 300, vol: 0.4 }); break;
      case 'warn': this._tone(440, 0.06, { type: 'square', vol: 0.05 }); break;
      case 'saw': this._noise(0.25, { freq: 3000, vol: 0.25, q: 6 }); this._tone(900, 0.2, { type: 'sawtooth', vol: 0.08 }); break;
      case 'wasp': this._tone(220, 0.25, { type: 'sawtooth', vol: 0.1, slide: 1.3 }); break;
      case 'bully': this._tone(70, 0.22, { type: 'sine', vol: 0.45 }); this._noise(0.1, { freq: 200, vol: 0.3 }); break;
      case 'bumper': this._tone(600, 0.15, { type: 'square', vol: 0.15, slide: 1.5 }); break;
      case 'switch': this._tone(300, 0.06, { type: 'square', vol: 0.15 }); this._tone(600, 0.1, { type: 'square', vol: 0.15, at: 0.06 }); break;
      case 'shake': this._noise(0.3, { freq: 2500, vol: 0.12, q: 3 }); break;
      case 'respawn': this._tone(300, 0.25, { type: 'sine', vol: 0.15, slide: 2 }); break;
      case 'go': this._tone(880, 0.3, { type: 'square', vol: 0.12 }); break;
      case 'count': this._tone(440, 0.15, { type: 'square', vol: 0.1 }); break;
      case 'over': [0, -3, -7, -12].forEach((s, i) => this._tone(392 * 2 ** (s / 12), 0.4, { type: 'triangle', vol: 0.2, at: i * 0.18 })); break;
      case 'click': this._tone(1000, 0.03, { type: 'square', vol: 0.06 }); break;
    }
  }

  /** Preprosta glasba v zanki (različna lestvica po sklopih). */
  startMusic(set = 1) {
    this.set = set;
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const scales = { 1: [0, 4, 7, 9, 12, 9, 7, 4], 2: [0, 3, 7, 10, 12, 10, 7, 3], 3: [0, 3, 5, 7, 10, 12, 10, 7] };
    const bass = [0, 0, 5, 5, 7, 7, 3, 5];
    const bpm = 112, step = 60 / bpm / 2;
    let n = 0, next = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.musicOn || !this.ctx) return;
      while (next < this.ctx.currentTime + 0.25) {
        const sc = scales[this.set] || scales[1];
        const root = 220 * (this.set === 2 ? 0.89 : this.set === 3 ? 0.84 : 1);
        const note = sc[n % 8] + (Math.floor(n / 16) % 2 ? 12 : 0);
        this._mus(root * 2 ** (note / 12), step * 0.9, next, 'square', 0.05);
        if (n % 2 === 0) this._mus(root / 2 * 2 ** (bass[(n / 2 | 0) % 8] / 12), step * 1.8, next, 'triangle', 0.18);
        if (n % 4 === 0) this._kick(next);
        n++; next += step;
      }
      this._musT = setTimeout(tick, 80);
    };
    tick();
  }
  stopMusic() { this.musicOn = false; clearTimeout(this._musT); }

  _mus(freq, dur, t, type, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.mus); o.start(t); o.stop(t + dur + 0.02);
  }
  _kick(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(this.mus); o.start(t); o.stop(t + 0.2);
  }
}
