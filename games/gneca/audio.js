/* =====================================================================
   GNEČA — audio.js: WebAudio sinteza (brez datotek): strel, »pop« pri
   množenju, udarec, velikan, padec stolpa, fanfara, poraz.
   Pogosti zvoki so omejeni (največ en na nekaj deset ms).
   ===================================================================== */
import * as S from '../../shared/storage.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = !!S.load('gneca:mute', false);
    this.last = {};
  }

  /** Ustvari kontekst ob prvi interakciji. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }

  setMuted(m) { this.muted = m; S.save('gneca:mute', m); }

  _ok(key, gapMs) {
    if (this.muted || !this.ctx) return false;
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < gapMs) return false;
    this.last[key] = now;
    return true;
  }

  _tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, { vol = 0.2, freq = 1200, q = 1, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  }

  shot() { if (this._ok('shot', 90)) this._tone(420 + Math.random() * 60, 0.06, { type: 'triangle', vol: 0.06, slide: 0.6 }); }
  pop() { if (this._ok('pop', 45)) this._tone(700 + Math.random() * 500, 0.07, { type: 'sine', vol: 0.09, slide: 1.8 }); }
  hit() { if (this._ok('hit', 40)) this._noise(0.07, { vol: 0.12, freq: 900 + Math.random() * 600, q: 2 }); }
  minus() { if (this._ok('minus', 80)) this._tone(260, 0.12, { type: 'square', vol: 0.05, slide: 0.5 }); }
  zap() { if (this._ok('zap', 60)) this._tone(1400, 0.05, { type: 'sawtooth', vol: 0.035, slide: 0.4 }); }
  giant() { if (this._ok('giant', 200)) { this._tone(90, 0.4, { type: 'sawtooth', vol: 0.18, slide: 0.5 }); this._noise(0.3, { vol: 0.15, freq: 300 }); } }
  tower() { if (this._ok('tower', 70)) this._noise(0.1, { vol: 0.1, freq: 500, q: 3 }); }
  crash() {
    if (this.muted || !this.ctx) return;
    this._noise(1.2, { vol: 0.35, freq: 220, q: 0.7 });
    this._tone(70, 1.0, { type: 'sine', vol: 0.3, slide: 0.4 });
  }
  fanfare() {
    if (this.muted || !this.ctx) return;
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, i === 3 ? 0.5 : 0.16, { type: 'triangle', vol: 0.16, delay: 0.5 + i * 0.13 }));
  }
  lose() {
    if (this.muted || !this.ctx) return;
    [392, 330, 262].forEach((f, i) => this._tone(f, 0.25, { type: 'triangle', vol: 0.14, delay: i * 0.2 }));
  }
  click() { if (this._ok('click', 30)) this._tone(880, 0.04, { type: 'square', vol: 0.05 }); }

  /** Zvoki iz dogodkov simulacije. */
  events(evs) {
    if (this.muted || !this.ctx) return;
    for (const e of evs) {
      switch (e.t) {
        case 'shot': this.shot(); break;
        case 'pop': this.pop(); break;
        case 'clash': this.hit(); break;
        case 'minus': case 'cut': this.minus(); break;
        case 'zap': this.zap(); break;
        case 'giant': case 'egiant': this.giant(); break;
        case 'tower': this.tower(); break;
        case 'turretdown': this.crash(); break;
        case 'win': this.crash(); this.fanfare(); break;
        case 'lose': this.lose(); break;
        default: break;
      }
    }
  }
}
