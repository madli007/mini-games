/* =====================================================================
   RUŠILEC — sound.js: WebAudio (podrazred Audio iz ../krogla/audio.js).
   Dodano: trk krogel (glasnost po moči), sunek, izriv, odštevanje finala,
   glasba, ki se v finalu pospeši.
   ===================================================================== */
import { Audio } from '../krogla/audio.js';

export class ArenaAudio extends Audio {
  constructor() { super(); this.bpm = 118; }

  play(name, v = 1) {
    if (!this.ctx || !this.sfx) return;
    switch (name) {
      case 'bonk': {
        const k = Math.min(1, v / 12);
        this._tone(170 + k * 90, 0.16, { type: 'triangle', vol: 0.06 + k * 0.32, slide: 0.55 });
        this._noise(0.09, { freq: 900 + k * 1800, vol: 0.04 + k * 0.22, q: 2 });
        break;
      }
      case 'dash': this._noise(0.28, { freq: 1400, vol: 0.18, type: 'highpass' }); this._tone(240, 0.22, { type: 'sawtooth', vol: 0.07, slide: 2.2 }); break;
      case 'izriv': [0, 7, 12].forEach((s, i) => this._tone(330 * 2 ** (s / 12), 0.2, { type: 'square', vol: 0.09, at: i * 0.07 })); break;
      case 'padec': this._tone(520, 0.9, { type: 'sawtooth', vol: 0.1, slide: 0.18 }); break;
      case 'pick': [0, 5, 9, 12].forEach((s, i) => this._tone(660 * 2 ** (s / 12), 0.14, { type: 'square', vol: 0.07, at: i * 0.05 })); break;
      case 'crumble': this._noise(0.35, { freq: 260, vol: 0.18, q: 0.8 }); break;
      case 'finale': [0, 0.25, 0.5].forEach(at => this._tone(880, 0.12, { type: 'square', vol: 0.1, at })); this._tone(1320, 0.4, { type: 'square', vol: 0.12, at: 0.75 }); break;
      case 'gust': this._noise(0.8, { freq: 600, vol: 0.2, type: 'lowpass' }); break;
      case 'win': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this._tone(392 * 2 ** (s / 12), 0.3, { type: 'square', vol: 0.08, at: i * 0.08 })); break;
      default: super.play(name, v);
    }
  }

  /** Tempo glasbe (finale: hitreje). */
  setTempo(bpm) { this.bpm = bpm; }

  startMusic(set = 1) {
    this.set = set;
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const scale = [0, 3, 7, 10, 12, 10, 7, 5];
    const bass = [0, 0, 5, 5, 3, 3, 7, 7];
    let n = 0, next = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.musicOn || !this.ctx) return;
      const step = 60 / this.bpm / 2;
      while (next < this.ctx.currentTime + 0.25) {
        const root = 196;
        const note = scale[n % 8] + (Math.floor(n / 16) % 2 ? 12 : 0);
        this._mus(root * 2 ** (note / 12), step * 0.85, next, 'square', 0.045);
        if (n % 2 === 0) this._mus(root / 2 * 2 ** (bass[(n / 2 | 0) % 8] / 12), step * 1.8, next, 'triangle', 0.18);
        if (n % 4 === 0) this._kick(next);
        if (this.bpm > 130 && n % 2 === 1) this._mus(root * 4, step * 0.3, next, 'square', 0.02);
        n++; next += step;
      }
      this._musT = setTimeout(tick, 80);
    };
    tick();
  }
}
