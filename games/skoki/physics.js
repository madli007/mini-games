/* =====================================================================
   SMUČARSKI SKOKI — physics.js: deterministična 2D simulacija skoka.
   Brez DOM-a, brez Date/performance/Math.random, trigonometrija iz dmath.js.

   Skok je določen s: skakalnico, parametri (physics-params.json), zaletnim
   mestom, konfiguracijo vetra (seed) in zaporedjem vnosov po tickih.
   Vnos na tick: { btn: 0|1|2 (število pritisnjenih gumbov), pitch: popravek nagiba v stopinjah (korak 0,5°) }.
     zalet: skakalec se sam spusti v držo; OBA GUMBA HKRATI (btn 2) na koncu mize = odriv
     let:   skakalec sam drži letalni položaj (smer leta z zamikom + body.autoAlpha); pitch = popravek
            (+ = bolj pokonci / nazaj, − = bolj naprej)
            prvi pritisk = priprava na pristanek; oba gumba (btn 2) pred stikom = telemark, en gumb = dve nogi
   Tick 0 = štart z zaletnega mesta (čakanje na semafor je stvar igre).
   ===================================================================== */
import { DEG, sin, cos, atan2, hypot, clamp, lerp, table } from './dmath.js';
import { createWind } from './wind.js';

export const STEP = 1 / 120;
export const TPS = 120;
export const MAX_TICKS = 120 * 40;

const KMH = 3.6;

/** Kvantizacija vnosa (enako v igri, botu in ghostu). */
export const quantPitch = p => Math.round(clamp(p, -60, 80) * 2) / 2;

/**
 * Kakovost odriva iz napake tajminga (s; − = prezgodaj, + = prepozno).
 * @returns {{q:number, perfect:boolean, good:boolean}}
 */
export function takeoffQuality(err, T) {
  const a = Math.abs(err);
  if (a <= T.perfect) return { q: 1, perfect: true, good: true };
  const gd = T.goodDrop ?? 0.12;   // padec kakovosti v oknu »dobro«
  if (a <= T.good) return { q: 1 - gd * (a - T.perfect) / (T.good - T.perfect), perfect: false, good: true };
  const lim = err < 0 ? T.earlyLimit : T.lateLimit;
  const u = clamp((a - T.good) / (lim - T.good), 0, 1);
  return { q: lerp(1 - gd, T.minQ, u), perfect: false, good: false };
}

/** Kakovost telemarka iz časa med pritiskom in stikom. */
export function teleQuality(dt, L) {
  if (dt < L.teleMin) return 0;
  if (dt <= L.teleIdeal) return lerp(0.55, 1, (dt - L.teleMin) / (L.teleIdeal - L.teleMin));
  if (dt <= L.teleMax) return lerp(1, 0.55, (dt - L.teleIdeal) / (L.teleMax - L.teleIdeal));
  return clamp(0.55 - (dt - L.teleMax) * 0.8, 0.15, 0.55);
}

/**
 * Ustvari skok.
 * @param {{hill:Object, P:Object, gate:number, wind:Object, record?:number}} o
 *   record: vsakih koliko tickov shrani točko v sled (0 = brez sledi)
 */
export function createJump({ hill, P, gate, wind, record = 0, mods = null }) {
  // parametri skakalnice (hills/<id>.json → physics): gravity, airDensity, liftScale, noAir (brez zraka: ni vzgona,
  // upora ne vetra). Skakalnice brez bloka physics računajo natanko kot prej (iste vrednosti, isti vrstni red operacij).
  //   thermals: toplotni stebri (navpični sunki od spodaj na stalnih mestih, puščava).
  // mods (dnevni izziv): inrunMu = faktor trenja v smučini, gust = faktor sunkov vetra.
  const HP = hill.def?.physics || {};
  const PW = mods?.gust ? { ...P, wind: { ...P.wind, gustAmp: P.wind.gustAmp * mods.gust, vertical: P.wind.vertical * mods.gust } } : P;
  const W = createWind(HP.noAir ? { mode: 'off', seed: 0 } : wind, PW);
  const therm = HP.thermals ? x => { if (x <= 5) return 0; const u = Math.max(0, sin((x - 5) / 22 * Math.PI)), u2 = u * u; return HP.thermals * 1.6 * u2 * u2 * u2; } : null;
  const A = P.aero, B = P.body, L = P.landing, IR = P.inrun;
  // takeoffWindow: širša okna odriva (mala skakalnica: kratka miza pri majhni hitrosti, 0,1 s je le ~1 m);
  // < 1 (prave skakalnice): ožji okni »popoln« in »dober« — natančen odriv šteje več; meji za »prezgodaj« in »padeš z mize«
  // ostaneta (faktor ≥ 1 se obnaša natanko kot prej)
  const TW = HP.takeoffWindow, T0 = P.takeoff;
  const T = TW ? { ...T0, perfect: T0.perfect * TW, good: T0.good * TW, earlyLimit: T0.earlyLimit * Math.max(1, TW), lateLimit: T0.lateLimit * Math.max(1, TW) } : T0;
  const g = HP.gravity != null ? HP.gravity : P.g, m = P.mass;
  const rho = HP.noAir ? 0 : HP.airDensity != null ? P.rho * HP.airDensity : P.rho;
  const liftScale = HP.liftScale != null ? A.liftScale * HP.liftScale : A.liftScale;
  const vPush = HP.pushScale != null ? T.vPush * HP.pushScale : T.vPush;   // odriv (na Luni noge »nesejo« več)
  // pogoji dneva (dnevni izziv): mods.inrunMu = faktor trenja v smučini
  const mu = mods?.inrunMu ? IR.mu * mods.inrunMu : IR.mu;
  const windPts = [0.25, 0.45, 0.65, 0.85, 1.0].map(f => hill.landAt(hill.k * f).x);

  const s = {
    phase: 'inrun', tick: 0, gate,
    d: hill.gateD(gate), v: IR.startSpeed, crouch: 0,
    x: 0, y: 0, vx: 0, vy: 0, pitch: 0, omega: 0, alpha: 0, gamma: 0, speed: 0, hag: 0,
    target: B.startPitch, btn: 0, prevBtn: 2, gs: 0,   // prevBtn=2: štartni pritisk ni odriv
    tableSpeed: 0, edgeTick: -1, airTick: -1,
    takeoff: null, prep: null, landing: null, fallen: null,
    wobble: 0, flail: 0, flightTime: 0, maxHag: 0, windSamples: [], windIdx: 0,
    outS: 0, outV: 0, outTick: 0, dist: 0,
    lift: 0, drag: 0, torque: 0, vn: 0, wind: { h: 0, v: 0 },
    pos: { x: 0, y: 0 },
  };
  const p0 = hill.inrunAt(s.d);
  s.x = p0.x; s.y = p0.y; s.pitch = -p0.theta;
  const ev = [];
  const trace = [];

  /* ---------------- odriv */
  function doTakeoff(err) {
    const tq = takeoffQuality(err, T);
    let vx = s.vx, vy = s.vy;
    const a = hill.alpha;
    if (s.phase === 'inrun') {
      const loss = err < 0 ? 1 - T.earlySpeedLoss * clamp(-err / T.earlyLimit, 0, 1) : 1;
      vx = s.v * cos(a) * loss; vy = -s.v * sin(a) * loss;
      if (s.tableSpeed === 0) s.tableSpeed = Math.round(s.v * KMH * 10) / 10;
    }
    const push = vPush * tq.q;
    vx += push * sin(a); vy += push * cos(a);
    s.vx = vx; s.vy = vy;
    const gam = atan2(vy, vx);
    s.pitch = gam + (T.pitch0 ?? 55) * DEG;   // telo ob odrivu nad smerjo leta (prej fiksno 55°)
    s.omega = -(T.spin + (err > 0 ? T.spinLate * err : 0)) * (0.7 + 0.3 * tq.q);
    s.takeoff = { err: Math.round(err * 1000) / 1000, q: tq.q, perfect: tq.perfect, good: tq.good, tick: s.tick };
    if (s.phase === 'inrun') { s.phase = 'air'; s.airTick = s.tick; }
    ev.push({ type: 'takeoff', ...s.takeoff });
  }

  /* ---------------- zalet */
  function stepInrun(inp) {
    const chord = inp.btn >= 2 && s.prevBtn < 2;   // oba gumba hkrati
    const tte = s.v > 0.1 ? s.d / s.v : 9;   // čas do roba
    if (chord && s.tick > 10 && tte <= T.earlyLimit) {
      doTakeoff(-tte - T.idealOffset);
      return;
    }
    s.crouch = clamp(s.crouch + IR.crouchRate * STEP, 0, 1);
    const pt = hill.inrunAt(s.d);
    const w = W.at(s.tick * STEP, pt.x).h * IR.windEffect;
    const cda = lerp(IR.cdaUp, IR.cdaCrouch, s.crouch);
    const vr = s.v + w;
    const acc = g * sin(pt.theta) - mu * (g * cos(pt.theta) + s.v * s.v * pt.kappa) - 0.5 * rho * cda * vr * (vr < 0 ? -vr : vr) / m;
    s.v = Math.max(0, s.v + acc * STEP);
    s.d -= s.v * STEP;
    if (s.d <= 0) {
      // čez rob brez odriva: »padeš z mize«
      const a = hill.alpha;
      s.tableSpeed = Math.round(s.v * KMH * 10) / 10;
      s.edgeTick = s.tick;
      s.x = 0; s.y = 0; s.vx = s.v * cos(a); s.vy = -s.v * sin(a);
      s.pitch = -a; s.omega = 0;
      s.phase = 'air'; s.airTick = s.tick;
      ev.push({ type: 'edge' });
      return;
    }
    const q = hill.inrunAt(s.d);
    s.x = q.x; s.y = q.y; s.pitch = -q.theta;
    s.speed = s.v;
  }

  /* ---------------- let */
  function stepAir(inp) {
    const pressed = inp.btn >= 1 && s.prevBtn === 0, chord = inp.btn >= 2 && s.prevBtn < 2;
    if (!s.takeoff) {
      const late = (s.tick - s.edgeTick) * STEP;
      if (chord) doTakeoff(late);
      else if (late > T.lateLimit) doTakeoff(T.lateLimit * 2.5);
      if (s.takeoff) return;
    } else if (!s.prep && (pressed || chord) && !s.fallen) {
      s.prep = { tick: s.tick, type: 'press', clicks: chord ? 2 : 1 };
      ev.push({ type: 'prep' });
    } else if (chord && s.prep && s.prep.type === 'press' && s.prep.clicks === 1) {
      s.prep.clicks = 2;   // oba gumba = telemark
      ev.push({ type: 'tele' });
    } else if ((pressed || chord) && s.prep && s.prep.type === 'reflex') {
      s.prep.late = true;   // klik šele po refleksu: prepozno za telemark
    }

    const t = s.tick * STEP;
    let w = W.at(t, s.x);
    if (therm) w = { h: w.h, v: w.v + therm(s.x) };
    s.wind = w;
    // veter piha vzdolž pobočja (čelni ima zato tudi komponento navzgor) + navpični sunki
    const gw = hill.groundAt(s.x).theta;
    const rx = s.vx + w.h * cos(gw), ry = s.vy - w.h * sin(gw) * P.wind.updraft - w.v;
    const V = hypot(rx, ry) || 1e-6;
    const gam = atan2(ry, rx);
    const alpha = s.pitch - gam;
    s.alpha = alpha; s.gamma = gam; s.speed = V;
    // samodejni letalni položaj: sledi smeri leta z zamikom (autoLag); vnos je popravek
    if (s.takeoff) {
      if (s.tick === s.takeoff.tick + 1) s.gs = gam;
      s.gs += (gam - s.gs) * Math.min(1, STEP / B.autoLag);
      s.auto = s.gs / DEG + B.autoAlpha;
      s.target = clamp(s.auto + inp.pitch, B.pitchMin, B.pitchMax);
    }
    const ad = alpha / DEG;
    const q = 0.5 * rho * V * V;
    const air = s.takeoff ? (s.tick - s.takeoff.tick) * STEP : 0;
    let lm = s.takeoff ? lerp(A.openStart, 1, clamp(air / A.openTime, 0, 1)) : 0.5, dm = 1;
    if (s.prep) {
      const u = clamp((s.tick - s.prep.tick) * STEP / L.prepTime, 0, 1);
      lm *= lerp(1, L.prepLift, u); dm *= lerp(1, L.prepDrag, u);
    }
    if (s.fallen) { lm = 0.1; dm = 1.6; }
    const Lf = q * table(A.lift, ad) * liftScale * lm;
    const Df = q * table(A.drag, ad) * A.dragScale * dm;
    s.lift = Lf; s.drag = Df;
    const ax = (Lf * (-ry / V) + Df * (-rx / V)) / m;
    const ay = (Lf * (rx / V) - Df * (ry / V)) / m - g;

    // nagib: aerodinamični navor + PD regulator z omejenim navorom
    const gr = hill.groundAt(s.x);
    const Ma = q * table(A.moment, ad) * A.momentScale * (s.fallen ? 0 : 1);
    let tgt = s.target * DEG, maxT = B.maxTorque;
    if (s.prep) { tgt = -gr.theta + L.prepPitch * DEG; maxT *= L.prepTorque; }
    if (!s.takeoff) { tgt = s.pitch; maxT = 0; }
    let Mc = clamp(B.kp * (tgt - s.pitch) - B.kd * s.omega, -maxT, maxT);
    if (s.fallen) Mc = 0;
    s.torque = Ma;
    s.omega += (Ma + Mc) / B.inertia * STEP;
    // priprava na pristanek: skakalec aktivno poravna smuči s pobočjem (omejena hitrost vrtenja)
    if (s.prep && !s.fallen) s.omega = clamp((tgt - s.pitch) / 0.06, -L.prepRate, L.prepRate);
    if (s.fallen) s.omega = s.fallen === 'back' ? 4 : -4;
    s.pitch += s.omega * STEP;

    s.vx += ax * STEP; s.vy += ay * STEP;
    s.x += s.vx * STEP; s.y += s.vy * STEP;

    // statistika leta (za sodnike)
    if (s.takeoff && !s.prep && !s.fallen && air > 0.35) {
      s.wobble += s.omega * s.omega * STEP;
      if (Math.abs(Ma) > B.maxTorque * 0.8) s.flail += STEP;
    }
    if (s.takeoff) s.flightTime += STEP;
    const g2 = hill.groundAt(s.x);
    s.hag = s.y - g2.y;
    if (s.hag > s.maxHag) s.maxHag = s.hag;
    while (s.windIdx < windPts.length && s.x >= windPts[s.windIdx]) { s.windSamples.push(w.h); s.windIdx++; }

    // padec v zraku: na nos ali nazaj
    if (s.takeoff && !s.fallen && !s.prep && air > 0.2) {
      if (ad < B.noseCrash) { s.fallen = 'nose'; ev.push({ type: 'crash', how: 'nose' }); }
      else if (ad > B.backCrash) { s.fallen = 'back'; ev.push({ type: 'crash', how: 'back' }); }
    }
    // refleks: brez priprave tik pred tlemi skakalec sam začne pristajati (prepozno)
    s.vn = -s.vy + s.vx * slope(g2.theta);   // hitrost približevanja tlom
    if (s.takeoff && !s.prep && !s.fallen && s.vn > 0.1 && s.hag / s.vn < L.reflex) {
      s.prep = { tick: s.tick, type: 'reflex' }; ev.push({ type: 'reflex' });
    }
    if (s.hag <= 0 && s.x > -hill.tableLen) land(inp, g2);
  }

  const slope = th => -sin(th) / cos(th);   // dy/dx tal (negativno navzdol)

  /* ---------------- pristanek */
  function land(inp, gr) {
    const th = gr.theta;
    const nx = sin(th), ny = cos(th);
    const vn = -(s.vx * nx + s.vy * ny);
    const hEq = vn > 0 ? vn * vn / (2 * P.g) : 0;   // meje pristanka v »zemeljskih« metrih (tudi na Luni)
    const skiRel = (s.pitch + th) / DEG;
    const sLand = Math.max(0, gr.s);
    const dist = Math.floor(sLand * 2) / 2;
    let type, teleQ = 0, timing = null, lateTele = 0;
    if (s.fallen) type = 'fall';
    else {
      // brez klika: refleks tik pred tlemi → trd pristanek na obe nogi ('none')
      // klik šele po refleksu: za telemark prepozno → trd pristanek (paramsVersion 5; prej padec — pozen klik je bil slabši od nobenega)
      if (s.prep && s.prep.late) type = 'none';
      else if (!s.prep || s.prep.type === 'reflex') type = 'none';
      else {
        timing = (s.tick - s.prep.tick) * STEP;
        if (s.prep.clicks >= 2) {
          teleQ = teleQuality(timing, L);
          type = 'tele';
        } else type = 'two';
        // prepozen klik: telemarka ni več mogoče narediti → pristanek na obe nogi; le skrajno pozen (< lateTouch) = dotik z roko
        if (timing < L.teleMin) { if (timing < (L.lateTouch ?? L.teleMin * 0.6)) lateTele = 1; else { type = 'two'; teleQ = 0; } }
      }
      // letalnice (paramsVersion 6): za HS se doskočišče izravna, udarec hitro raste — večja toleranca, da je čist pristanek
      // mogoč do ~HS + 10 (rekordne daljave), dlje dotik, nato padec
      const fly = hill.def?.size === 'letalnica' ? (L.flyFactor ?? 1) : 1;
      const lim = (type === 'tele' ? L.hTele : type === 'two' ? L.hTwo : L.hNone) * fly;
      const ar = Math.abs(skiRel);
      if (hEq > lim * L.touchMargin || ar > L.pitchTouch || lateTele === 2) type = 'fall';
      else if (hEq > lim || ar > L.pitchOk || lateTele === 1) type = 'touch';
    }
    const wind = s.windSamples.slice();
    while (wind.length < windPts.length) wind.push(s.wind.h);
    const windAvg = Math.round(wind.reduce((a, b) => a + b, 0) / wind.length * 100) / 100;
    s.landing = { tick: s.tick, type, hEq: Math.round(hEq * 100) / 100, skiRel: Math.round(skiRel * 10) / 10, teleQ, timing, dist, windAvg, x: s.x };
    s.dist = dist;
    if (type === 'fall' && !s.fallen) s.fallen = 'land';
    s.phase = 'out';
    s.outS = sLand;
    s.outV = s.vx * cos(th) - s.vy * sin(th);
    s.outTick = s.tick;
    s.y = gr.y;
    ev.push({ ...s.landing, kind: type, type: 'land' });
  }

  /* ---------------- iztek */
  function stepOut() {
    const pt = hill.landAt(s.outS);
    const mu = s.fallen ? L.fallMu : L.outrunMu;
    const acc = g * sin(pt.theta) - mu * g * cos(pt.theta) - 0.5 * rho * 0.5 * s.outV * s.outV / m;
    s.outV = Math.max(0, s.outV + acc * STEP);
    s.outS += s.outV * STEP;
    const q = hill.landAt(s.outS);
    s.x = q.x; s.y = q.y;
    const tgt = -q.theta + (s.fallen ? 0 : 0);
    s.pitch += (tgt - s.pitch) * (s.fallen ? 0.05 : 0.25);
    s.speed = s.outV;
    if ((s.tick - s.outTick) * STEP >= L.outrunTime || (s.outV < 0.5 && s.tick - s.outTick > 60)) { s.phase = 'done'; ev.push({ type: 'done' }); }
  }

  return {
    s, hill, P, wind: W, trace, ev,
    get done() { return s.phase === 'done'; },
    /** En tick simulacije. */
    step(inp) {
      if (s.phase === 'done') return;
      s.btn = inp.btn >= 2 ? 2 : inp.btn ? 1 : 0;
      if (s.phase === 'inrun') stepInrun(inp);
      else if (s.phase === 'air') stepAir(inp);
      else if (s.phase === 'out') stepOut();
      s.prevBtn = s.btn;
      if (record && s.tick % record === 0) {
        trace.push([s.tick, s.x, s.y, s.phase === 'air' ? s.alpha / DEG : 0, s.speed, s.phase === 'air' ? s.hag : 0, s.target, s.btn, s.pitch / DEG]);
      }
      s.tick++;
      if (s.tick > MAX_TICKS && s.phase !== 'done') { s.phase = 'done'; ev.push({ type: 'done' }); }
    },
  };
}

/**
 * Celoten skok iz funkcije vnosov (za teste, bote in ghoste).
 * @param {Object} o kot createJump + input: (state, tick) => {btn, pitch}
 */
export function simulate(o) {
  const J = createJump(o);
  while (!J.done) { const inp = o.input(J.s, J.s.tick); J.step(inp); J.ev.length = 0; }
  return J;
}

/**
 * Akumulator fiksnega koraka: advance(dt, onTick) pokliče onTick tolikokrat, kolikor tickov je minilo.
 * Vrne delež do naslednjega ticka (za interpolacijo izrisa). Največ 30 tickov na klic (po pavzi ne »dohiteva«).
 */
export function makeClock() {
  let acc = 0;
  return {
    advance(dt, onTick) {
      acc += Math.min(dt, 0.25);
      let n = 0;
      while (acc >= STEP && n < 30) { acc -= STEP; onTick(); n++; }
      if (n >= 30) acc = 0;
      return acc / STEP;
    },
    reset() { acc = 0; },
  };
}
