/* =====================================================================
   DIRKA FRNIKOL — sound.js: WebAudio (podrazred Audio iz ../krogla/audio.js,
   po vzoru ../rusilec/sound.js). Dodano: steklen »klik« trkov, sunek,
   cilj, navijanje množice, kovanček stave, odštevanje na startu.
   ===================================================================== */
import { Audio } from '../krogla/audio.js';

export class RaceAudio extends Audio {
  constructor() { super(); this.cheerT = 0; }

  play(name, v = 1) {
    if (!this.ctx || !this.sfx) return;
    switch (name) {
      case 'klik': {
        // steklo ob steklo: kratek visok ton z rahlim šumom (glasnost po moči trka)
        const k = Math.min(1, v / 8);
        const f = 1900 + Math.random() * 900;
        this._tone(f, 0.07 + k * 0.05, { type: 'sine', vol: 0.03 + k * 0.12 });
        this._tone(f * 1.51, 0.05, { type: 'sine', vol: 0.02 + k * 0.05 });
        break;
      }
      case 'sunek': this._noise(0.3, { freq: 1200, vol: 0.2, type: 'highpass' }); this._tone(260, 0.25, { type: 'triangle', vol: 0.12, slide: 2.4 }); break;
      case 'udarec': this._noise(0.22, { freq: 500, vol: 0.25, q: 1.5 }); this._tone(140, 0.22, { type: 'square', vol: 0.1, slide: 0.5 }); break;
      case 'padec': this._tone(640, 0.8, { type: 'sine', vol: 0.09, slide: 0.2 }); break;
      case 'cilj': [0, 4, 7, 12, 16].forEach((s, i) => this._tone(523 * 2 ** (s / 12), 0.28, { type: 'square', vol: 0.07, at: i * 0.07 })); break;
      case 'mesto': this._tone(988, 0.12, { type: 'triangle', vol: 0.1 }); break;
      case 'stava': this._tone(1320, 0.06, { type: 'square', vol: 0.07 }); this._tone(1980, 0.12, { type: 'square', vol: 0.06, at: 0.06 }); break;
      case 'zmaga': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this._tone(392 * 2 ** (s / 12), 0.3, { type: 'square', vol: 0.08, at: i * 0.08 })); break;
      case 'poraz': [0, -3, -7].forEach((s, i) => this._tone(330 * 2 ** (s / 12), 0.3, { type: 'triangle', vol: 0.12, at: i * 0.15 })); break;
      case 'navijanje': this.cheer(v); break;
      default: super.play(name, v);
    }
  }

  /** Navijanje množice: filtriran šum, ki naraste in upade (moč 0–1). */
  cheer(k = 1) {
    if (!this.ctx || !this.sfx) return;
    const now = this.ctx.currentTime;
    if (now < this.cheerT) return;
    this.cheerT = now + 0.9;
    const t = now;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
    const g = this.ctx.createGain();
    const vol = 0.08 + 0.22 * Math.min(1, k);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    s.connect(f); f.connect(g); g.connect(this.fx);
    s.start(t, Math.random()); s.stop(t + 1.7);
  }

  /** Kotaljenje vseh frnikol: povprečna hitrost tistih na tleh. */
  rollAll(speed) { this.roll(speed, speed > 0.2, 'floor'); }
}
