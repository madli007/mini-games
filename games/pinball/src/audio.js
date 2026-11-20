/* =====================================================================
   ZVOK — Web Audio: sintetizirani efekti (plasti, reverb s
   konvolucijo, stereo panning) in proceduralna glasba z dinamičnimi
   plastmi. Brez zvočnih datotek. Začne se po prvi interakciji.
   ===================================================================== */

export class Audio {
  constructor(settings) {
    this.ac = null;
    this.vol = { music: settings.music ?? 0.6, sfx: settings.sfx ?? 0.8 };
    this.muted = !!settings.muted;
    this.intensity = 0;          // 0 attract … 4 wizard
    this.music = null;
    this.lastWall = 0;
  }

  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ac = new AC(); } catch (e) { return; }
    const ac = this.ac;
    this.master = ac.createGain();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ac.destination);
    this.sfxBus = ac.createGain(); this.musicBus = ac.createGain();
    this.sfxBus.connect(this.master); this.musicBus.connect(this.master);
    // reverb (generiran impulz)
    this.reverb = ac.createConvolver();
    this.reverb.buffer = this.impulse(2.2, 2.8);
    this.revSend = ac.createGain(); this.revSend.gain.value = 0.28;
    this.revSend.connect(this.reverb); this.reverb.connect(this.master);
    // šum
    this.noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolume();
    this.music = new Music(this);
  }

  impulse(sec, decay) {
    const ac = this.ac, n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }

  applyVolume() {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.1);
  }
  setVolume(kind, v) { this.vol[kind] = v; this.applyVolume(); }
  setMuted(m) { this.muted = m; this.applyVolume(); }
  suspend(on) {
    if (!this.ac) return;
    if (on) this.ac.suspend(); else this.ac.resume();
  }

  /* ---------------- osnovni gradniki ---------------- */
  out(pan = 0, rev = 0.3) {
    const ac = this.ac;
    const g = ac.createGain();
    let node = g;
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); node = p;
    }
    node.connect(this.sfxBus);
    if (rev > 0) { const s = ac.createGain(); s.gain.value = rev; node.connect(s); s.connect(this.revSend); }
    return g;
  }
  tone(f, dur, o = {}) {
    if (!this.ac || this.muted) return;
    const ac = this.ac, t = ac.currentTime + (o.delay || 0);
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const v = o.vol ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = g;
    if (o.lp) { const f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; g.connect(f2); last = f2; }
    osc.connect(g);
    last.connect(this.out(o.pan || 0, o.rev ?? 0.25));
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  hiss(dur, o = {}) {
    if (!this.ac || this.muted) return;
    const ac = this.ac, t = ac.currentTime + (o.delay || 0);
    const s = ac.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = o.rate || 1;
    const f = ac.createBiquadFilter(); f.type = o.ftype || 'bandpass'; f.frequency.value = o.freq || 2000; f.Q.value = o.q || 0.8;
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(o.vol ?? 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out(o.pan || 0, o.rev ?? 0.2));
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  /** kovinski udarec: neharmonični delni toni */
  metal(f, dur, vol, pan, rev = 0.35) {
    for (const [m, v] of [[1, 1], [2.76, 0.5], [5.4, 0.3], [8.93, 0.18]]) this.tone(f * m, dur / (1 + m * 0.3), { type: 'sine', vol: vol * v, pan, rev });
  }
  arp(notes, step, o = {}) { notes.forEach((n, i) => this.tone(n, step * 2.2, Object.assign({}, o, { delay: (o.delay || 0) + i * step }))); }

  /* ---------------- efekti ---------------- */
  panX(x) { return (x / 600 - 0.5) * 1.4; }
  play(name, d = {}) {
    if (!this.ac || this.muted) return;
    const p = d.x !== undefined ? this.panX(d.x) : 0;
    switch (name) {
      case 'flipper':
        if (d.down) { this.hiss(0.05, { vol: 0.35, freq: 900, pan: d.side === 'L' ? -0.5 : 0.5 }); this.tone(95, 0.07, { type: 'square', vol: 0.12, f2: 48, lp: 600, pan: d.side === 'L' ? -0.5 : 0.5 }); }
        else this.hiss(0.03, { vol: 0.12, freq: 600, pan: d.side === 'L' ? -0.5 : 0.5 });
        break;
      case 'bumper':
        this.tone(160, 0.12, { type: 'square', vol: 0.16, f2: 70, lp: 1400, pan: p });
        this.metal(880 + d.i * 110, 0.35, 0.09, p);
        this.hiss(0.06, { vol: 0.25, freq: 3000, pan: p });
        break;
      case 'sling': this.hiss(0.07, { vol: 0.35, freq: 2400, pan: p }); this.tone(260, 0.07, { type: 'sawtooth', vol: 0.09, f2: 110, lp: 1600, pan: p }); break;
      case 'drop': this.tone(200, 0.1, { type: 'square', vol: 0.15, f2: 90, lp: 1000, pan: p }); this.hiss(0.05, { vol: 0.25, freq: 1500, pan: p }); this.tone(1200, 0.08, { type: 'sine', vol: 0.06, pan: p, delay: 0.03 }); break;
      case 'dropsComplete': this.arp([523, 659, 784, 1046], 0.06, { type: 'square', vol: 0.08, lp: 3000 }); break;
      case 'review': this.metal(1320, 0.4, 0.08, p); this.tone(660, 0.12, { type: 'triangle', vol: 0.1, pan: p }); break;
      case 'lane': this.tone(1320, 0.1, { type: 'sine', vol: 0.12, pan: p }); this.tone(1760, 0.14, { type: 'sine', vol: 0.09, pan: p, delay: 0.06 }); break;
      case 'lanesComplete': this.arp([784, 988, 1175, 1568], 0.06, { type: 'triangle', vol: 0.12 }); break;
      case 'spin': this.tone(1800 + Math.random() * 300, 0.02, { type: 'square', vol: 0.035, pan: -0.8, rev: 0.05 }); break;
      case 'orbit': this.hiss(0.4, { vol: 0.12, freq: 600, f2: 3000, pan: -0.6 }); this.tone(440, 0.2, { type: 'sawtooth', vol: 0.06, f2: 880, lp: 2000, pan: -0.6 }); break;
      case 'rampEnter': this.hiss(0.5, { vol: 0.08, freq: 400, f2: 1600, pan: -0.3, ftype: 'lowpass' }); break;
      case 'rampMade':
        this.arp([392, 523, 659, 784].map(n => n * (1 + Math.min(4, (d.combo || 1) - 1) * 0.12)), 0.05, { type: 'sawtooth', vol: 0.08, lp: 2600, pan: -0.4 });
        break;
      case 'rampExit': this.metal(520, 0.25, 0.06, -0.7); break;
      case 'scoopEnter': this.tone(120, 0.35, { type: 'sawtooth', vol: 0.15, f2: 50, lp: 700, pan: 0.6 }); this.hiss(0.45, { vol: 0.2, freq: 500, pan: 0.6, f2: 150 }); break;
      case 'scoopEject': this.hiss(0.12, { vol: 0.35, freq: 400, pan: 0.6 }); this.tone(70, 0.18, { type: 'square', vol: 0.18, f2: 160, lp: 500, pan: 0.6 }); break;
      case 'launch': this.hiss(0.3, { vol: 0.15 + (d.power || 0.5) * 0.2, freq: 800, pan: 0.85 }); this.tone(80, 0.25, { type: 'sawtooth', vol: 0.1, f2: 320, lp: 900, pan: 0.85 }); break;
      case 'drain': this.tone(392, 1.0, { type: 'sawtooth', vol: 0.12, f2: 49, lp: 1200 }); this.hiss(0.6, { vol: 0.08, freq: 300, f2: 80 }); break;
      case 'wall': {
        const now = this.ac.currentTime;
        if (now - this.lastWall < 0.04) break;
        this.lastWall = now;
        this.metal(300 + Math.random() * 200, 0.12, Math.min(0.07, d.v / 30000), p, 0.15);
        break;
      }
      case 'lock': this.tone(110, 0.6, { type: 'sawtooth', vol: 0.15, f2: 440, lp: 1500, pan: 0.6 }); this.metal(220, 0.8, 0.12, 0.6); break;
      case 'kickback': this.hiss(0.15, { vol: 0.4, freq: 500, pan: -0.9 }); this.tone(70, 0.2, { type: 'square', vol: 0.2, f2: 200, pan: -0.9 }); break;
      case 'tilt': this.tone(70, 0.9, { type: 'square', vol: 0.25, lp: 400 }); this.tone(74, 0.9, { type: 'square', vol: 0.25, lp: 400 }); break;
      case 'tiltWarn': this.tone(90, 0.3, { type: 'square', vol: 0.18, lp: 500 }); break;
      case 'nudge': this.hiss(0.12, { vol: 0.25, freq: 200, ftype: 'lowpass' }); this.tone(55, 0.15, { type: 'sine', vol: 0.25 }); break;
      case 'jackpot':
        this.arp([523, 659, 784, 1046, 1318, 1568], 0.065, { type: 'square', vol: 0.09, lp: 4000 });
        this.arp([1046, 1318, 1568, 2093], 0.065, { type: 'sine', vol: 0.06, delay: 0.4 });
        this.metal(1046, 1.2, 0.08, p);
        break;
      case 'superJackpot':
        this.arp([392, 523, 659, 784, 1046, 1318, 1568, 2093], 0.07, { type: 'sawtooth', vol: 0.08, lp: 5000 });
        this.tone(65, 1.2, { type: 'sine', vol: 0.3 });
        break;
      case 'multiball': this.arp([196, 262, 330, 392, 330, 392, 523, 659, 784], 0.09, { type: 'sawtooth', vol: 0.09, lp: 3500 }); this.tone(49, 1.4, { type: 'sine', vol: 0.3 }); break;
      case 'modeStart': this.arp([220, 330, 440, 660], 0.1, { type: 'sawtooth', vol: 0.1, lp: 2500 }); this.hiss(1.0, { vol: 0.1, freq: 300, f2: 4000 }); break;
      case 'modeComplete': this.arp([523, 659, 784, 1046, 784, 1046, 1318], 0.08, { type: 'square', vol: 0.09, lp: 3500 }); break;
      case 'modeFail': this.arp([440, 415, 392, 370], 0.14, { type: 'triangle', vol: 0.1 }); break;
      case 'wizardStart': this.arp([262, 330, 392, 523, 659, 784, 1046, 1318, 1568, 2093], 0.08, { type: 'sawtooth', vol: 0.08, lp: 6000 }); this.tone(41, 2, { type: 'sine', vol: 0.35 }); break;
      case 'mystery': this.arp([880, 660, 990, 740, 1100, 830, 1320], 0.05, { type: 'square', vol: 0.06, lp: 3000 }); break;
      case 'skill': case 'extraBall': this.arp([1046, 1318, 1568, 2093, 2637], 0.05, { type: 'square', vol: 0.08, lp: 5000 }); break;
      case 'ballSave': this.arp([660, 880], 0.08, { type: 'triangle', vol: 0.12 }); break;
      case 'combo': this.tone(660 + Math.min(6, d.n) * 110, 0.15, { type: 'square', vol: 0.07, lp: 3000 }); break;
      case 'bonusTick': this.tone(1200 + (d.i || 0) * 30, 0.03, { type: 'square', vol: 0.05, rev: 0.05 }); break;
      case 'click': this.tone(900, 0.03, { type: 'square', vol: 0.06, rev: 0.05 }); break;
      case 'select': this.arp([660, 990], 0.05, { type: 'square', vol: 0.07 }); break;
      case 'gameOver': this.arp([392, 330, 262, 196, 131], 0.2, { type: 'sawtooth', vol: 0.1, lp: 1500 }); break;
      case 'highScore': this.arp([523, 659, 784, 1046, 1318, 1046, 1318, 1568, 2093], 0.09, { type: 'square', vol: 0.08, lp: 4000 }); break;
    }
  }

  setIntensity(level) {
    this.intensity = level;
    if (this.music) this.music.setLevel(level);
  }
  update() { if (this.music) this.music.tick(); }
}

/* =====================================================================
   PROCEDURALNA GLASBA — synthwave/industrial, plasti glede na dogajanje
   ===================================================================== */
const N = (n) => 440 * Math.pow(2, (n - 69) / 12);

class Music {
  constructor(A) {
    this.A = A; const ac = A.ac;
    this.bpm = 112;
    this.step = 0; this.next = ac.currentTime + 0.1;
    this.level = 0; this.transpose = 0;
    // plasti z lastnimi ojačevalniki
    const mk = () => { const g = ac.createGain(); g.gain.value = 0; g.connect(A.musicBus); return g; };
    this.L = { pad: mk(), bass: mk(), kick: mk(), hat: mk(), snare: mk(), arp: mk(), lead: mk() };
    // reverb pošiljka za pad/lead
    for (const k of ['pad', 'lead', 'arp']) { const s = ac.createGain(); s.gain.value = 0.35; this.L[k].connect(s); s.connect(A.revSend); }
    this.filter = ac.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 900;
    this.L.bass.disconnect(); this.L.bass.connect(this.filter); this.filter.connect(A.musicBus);
    this.setLevel(0);
  }

  setLevel(l) {
    this.level = l;
    const ac = this.A.ac, t = ac.currentTime;
    const on = (k, v) => this.L[k].gain.setTargetAtTime(v, t, 0.6);
    // 0 attract, 1 igra, 2 misija, 3 multiball, 4 wizard
    on('pad', l === 0 ? 0.32 : 0.22);
    on('bass', l >= 1 ? 0.42 : 0.0);
    on('kick', l >= 1 ? 0.55 : 0.0);
    on('hat', l >= 1 ? (l >= 3 ? 0.22 : 0.14) : 0.0);
    on('snare', l >= 2 ? 0.3 : 0.0);
    on('arp', l === 0 ? 0.1 : l >= 2 ? 0.16 : 0.08);
    on('lead', l >= 3 ? 0.14 : 0.0);
    this.filter.frequency.setTargetAtTime(l >= 3 ? 2600 : l >= 2 ? 1600 : 900, t, 0.8);
    this.transpose = l >= 4 ? 3 : 0;
    this.bpm = l >= 4 ? 128 : l >= 3 ? 120 : 112;
  }

  tick() {
    const ac = this.A.ac;
    if (!ac || ac.state !== 'running') { if (ac) this.next = ac.currentTime + 0.05; return; }
    if (this.next < ac.currentTime - 0.3) this.next = ac.currentTime + 0.05;
    while (this.next < ac.currentTime + 0.15) {
      this.schedule(this.step, this.next);
      this.next += 60 / this.bpm / 4;
      this.step++;
    }
  }

  schedule(s, t) {
    const ac = this.A.ac;
    const bar = Math.floor(s / 16) % 4, st = s % 16;
    // Am – F – C – G (i–VI–III–VII)
    const roots = [57, 53, 48, 55].map(n => n + this.transpose);
    const chords = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
    const root = roots[bar], ch = chords[bar];
    const L = this.L;
    const note = (bus, f, dur, type, vol, o = {}) => {
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.type = type; osc.frequency.value = f;
      if (o.detune) osc.detune.value = o.detune;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (o.att || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let last = g;
      if (o.lp) { const f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.setValueAtTime(o.lp, t); if (o.lp2) f2.frequency.exponentialRampToValueAtTime(o.lp2, t + dur); g.connect(f2); last = f2; }
      osc.connect(g); last.connect(bus);
      osc.start(t); osc.stop(t + dur + 0.05);
    };
    const beat = 60 / this.bpm;
    // pad: na začetku takta
    if (st === 0) {
      for (const iv of ch) for (const det of [-9, 9]) note(L.pad, N(root + 12 + iv), beat * 4.2, 'sawtooth', 0.05, { detune: det, att: 0.4, lp: 1400, lp2: 600 });
    }
    // bas: osminke s pumpanjem
    if (st % 2 === 0) note(L.bass, N(root - 12 + (st === 14 ? 7 : 0)), beat * 0.45, 'sawtooth', 0.3, { lp: 1800, lp2: 200 });
    // boben
    if (st % 4 === 0) {
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g); g.connect(L.kick); osc.start(t); osc.stop(t + 0.32);
    }
    const noiseHit = (bus, dur, freq, vol, type = 'highpass') => {
      const sN = ac.createBufferSource(); sN.buffer = this.A.noise;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      sN.connect(f); f.connect(g); g.connect(bus); sN.start(t, Math.random() * 0.5); sN.stop(t + dur + 0.02);
    };
    if (st % 2 === 1 || (this.level >= 3 && st % 1 === 0)) noiseHit(L.hat, 0.04, 8000, st % 4 === 2 ? 0.5 : 0.3);
    if (st === 4 || st === 12) { noiseHit(L.snare, 0.18, 1800, 0.7, 'bandpass'); note(L.snare, 190, 0.1, 'triangle', 0.3); }
    // arpeggio (šestnajstinke)
    const arpN = [0, 1, 2, 1, 2, 3, 2, 1];
    const iv = [...ch, 12][arpN[st % 8] % 4];
    note(L.arp, N(root + 24 + iv), beat * 0.22, 'square', 0.09, { lp: 2400 + this.level * 600 });
    // melodija (multiball / wizard)
    const mel = [12, -1, 10, -1, 7, -1, 10, 12, 15, -1, 14, -1, 12, 10, 7, -1];
    const m = mel[st];
    if (m >= 0 && (bar % 2 === 1 || this.level >= 4)) note(L.lead, N(root + 12 + m), beat * 0.45, 'sawtooth', 0.12, { detune: 6, lp: 3200 });
  }
}
