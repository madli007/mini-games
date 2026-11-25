/* =====================================================================
   SMUČARSKI SKOKI — render/jumper.js: proceduralni 3D skakalec iz preprostih
   oblik z zglobi. Poza izhaja iz stanja simulacije (drža, odriv, V-položaj,
   nagib, mahanje z rokami, priprava, telemark, dve nogi, dotik, padec).
   Videz je parameter (skin): dres, čelada, smuči, zastava — fizika je za vse enaka.
   Lokalni koordinatni sistem: izhodišče = vezi smuči (točka iz simulacije),
   +x = naprej vzdolž smuči, +y = gor pravokotno na smuči, z = levo/desno.
   V letu: V-položaj s skupaj repi smuči in razprtimi konicami, roke ob telesu,
   tokovnice in plapolanje dresa, ko je let blizu optimalnega (v.glide).
   ===================================================================== */
import * as THREE from 'three';
import { flag as flagTex } from './tex.js';

export const DEFAULT_SKIN = { id: 'osnovni', suit: '#e63946', suit2: '#ffffff', helmet: '#ffd23f', skis: '#1d3557', skiTip: '#ffd23f', flag: ['#ffffff', '#1e66ff', '#e3263a'], goggles: '#ff7a1a' };
export const GHOST_SKIN = { id: 'ghost', suit: '#9fe8ff', suit2: '#ffffff', helmet: '#cfffff', skis: '#9fe8ff', skiTip: '#ffffff', flag: ['#ffffff', '#ffffff', '#ffffff'], goggles: '#ffffff' };

const L_SHIN = 0.47, L_THIGH = 0.47, L_TORSO = 0.6, L_UARM = 0.31, L_FARM = 0.29, SKI = 2.55;
const SKI_TAIL = 1.02;   // od vezi do repa smuči (vezi so malo za sredino)

/* ---------------- poze (2D v ravnini smuči: pelvis, kot trupa, roke, stopala)
   arm = kot nadlakti glede na trup (−180 = ob telesu nazaj), armOut = razmik rok od telesa (m), v = kot V (°) */
const POSES = {
  sit:    { px: -0.35, py: 0.5, torso: 75, arm: -160, elbow: 30, fF: 0.05, fB: -0.05, v: 0, head: 10, armOut: 0.04 },
  tuck:   { px: -0.3, py: 0.48, torso: 10, arm: -168, elbow: 6, fF: 0.0, fB: 0.0, v: 0, head: 38, armOut: 0.02 },
  stand:  { px: -0.02, py: 0.93, torso: 82, arm: -100, elbow: 10, fF: 0.0, fB: 0.0, v: 0, head: 5, armOut: 0.1 },
  push:   { px: 0.22, py: 0.9, torso: 38, arm: -160, elbow: 6, fF: 0, fB: 0, v: 4, head: 22, armOut: 0.06 },
  fly:    { px: 0.88, py: 0.46, torso: 17, arm: -168, elbow: 3, fF: 0, fB: 0, v: 34, head: 12, armOut: 0.16 },
  sitair: { px: 0.45, py: 0.72, torso: 46, arm: -150, elbow: 14, fF: 0, fB: 0, v: 26, head: 15, armOut: 0.24 },
  prep:   { px: 0.25, py: 0.85, torso: 62, arm: -60, elbow: 25, fF: 0, fB: 0, v: 6, head: 10, armOut: 0.3 },
  tele:   { px: 0.0, py: 0.68, torso: 78, arm: -15, elbow: 15, fF: 0.42, fB: -0.42, v: 0, head: 0, armOut: 0.34 },
  two:    { px: -0.12, py: 0.6, torso: 58, arm: -40, elbow: 30, fF: 0.03, fB: -0.03, v: 0, head: 10, armOut: 0.3 },
  touch:  { px: -0.3, py: 0.42, torso: 40, arm: -95, elbow: 0, fF: 0.1, fB: -0.1, v: 0, head: 10, armOut: 0.3 },
  cheer:  { px: -0.02, py: 0.92, torso: 84, arm: 55, elbow: 10, fF: 0, fB: 0, v: 0, head: -5, armOut: 0.22 },
  fall:   { px: -0.1, py: 0.35, torso: 0, arm: 30, elbow: 40, fF: 0.2, fB: -0.2, v: 18, head: 0, armOut: 0.3 },
};
const KEYS = Object.keys(POSES.tuck);

function lerpPose(a, b, t) { const o = {}; for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t; return o; }

/** 2-kostna IK v ravnini: stopalo (fx, fy) → koleno proti +x (naprej). */
function knee(fx, fy, px, py, l1, l2) {
  const dx = px - fx, dy = py - fy;
  let d = Math.hypot(dx, dy);
  d = Math.min(d, l1 + l2 - 1e-4);
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const base = Math.atan2(dy, dx);
  const ang = base - a;   // koleno naprej
  return [fx + Math.cos(ang) * l1, fy + Math.sin(ang) * l1];
}

/** Kapsula od (0,0) vzdolž +x; r0 = polmer, sz/sy = sploščenost (dres skakalca je širok in ploščat). */
function seg(mat, r, len, { sz = 1, sy = 1 } = {}) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  g.rotateZ(-Math.PI / 2); g.scale(1, sy, sz); g.translate(len / 2, 0, 0);
  const m = new THREE.Mesh(g, mat); m.castShadow = true;
  return m;
}
const setSeg = (m, ax, ay, bx, by, z) => { m.position.set(ax, ay, z); m.rotation.set(0, 0, Math.atan2(by - ay, bx - ax)); };

/** Smučka s privihano konico (ukrivljen trak), robniki in vezi. */
function skiMesh(skiM, tipM, bootM, bindM) {
  const g = new THREE.Group();
  const len = SKI, w = 0.11, t = 0.022;
  const front = len - SKI_TAIL;
  // telo smučke (do začetka privihanja)
  const flat = front - 0.32;
  const body = new THREE.Mesh(new THREE.BoxGeometry(SKI_TAIL + flat, t, w), skiM);
  body.position.set((flat - SKI_TAIL) / 2, t / 2, 0); body.castShadow = true; g.add(body);
  // privihana konica: kratki segmenti po loku
  const n = 5, R = 0.34;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 0.75, a1 = ((i + 1) / n) * 0.75;
    const x0 = flat + Math.sin(a0) * R, y0 = R - Math.cos(a0) * R, x1 = flat + Math.sin(a1) * R, y1 = R - Math.cos(a1) * R;
    const sl = Math.hypot(x1 - x0, y1 - y0) + 0.004;
    const s = new THREE.Mesh(new THREE.BoxGeometry(sl, t, w * (1 - i * 0.05)), i >= n - 2 ? tipM : skiM);
    s.position.set((x0 + x1) / 2, (y0 + y1) / 2 + t / 2, 0); s.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    s.castShadow = true; g.add(s);
  }
  // barvni trak na zgornji strani
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(flat + SKI_TAIL - 0.3, t * 0.4, w * 0.35), tipM);
  stripe.position.set((flat - SKI_TAIL) / 2 + 0.1, t + 0.002, 0); g.add(stripe);
  // vezi in čevelj (skakalni čevlji so visoki in nagnjeni naprej)
  const bind = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.1), bindM); bind.position.set(0.02, t + 0.015, 0); g.add(bind);
  const boot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.12), bootM); boot.position.set(0.02, 0.1, 0); boot.castShadow = true; g.add(boot);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.125), bootM); cuff.position.set(-0.02, 0.2, 0); cuff.rotation.z = -0.25; cuff.castShadow = true; g.add(cuff);
  return g;
}

/**
 * @param {Object} skin
 * @param {{ghost?:boolean}} opt
 */
export function makeJumper(skin = DEFAULT_SKIN, { ghost = false } = {}) {
  const root = new THREE.Group();        // položaj + nagib (pitch)
  const body = new THREE.Group();        // padec: dodatna rotacija
  root.add(body);
  const mk = (color, o = {}) => ghost
    ? new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.38, emissive: color, emissiveIntensity: 0.9, depthWrite: false, roughness: 0.4 })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });
  const suit = mk(skin.suit, { roughness: 0.42, metalness: 0.06 });
  const suit2 = mk(skin.suit2, { roughness: 0.45 });
  const helmetM = mk(skin.helmet, { roughness: 0.22, metalness: 0.35 });
  const skiM = mk(skin.skis, { roughness: 0.28, metalness: 0.25 });
  const tipM = mk(skin.skiTip, { roughness: 0.35 });
  const gogM = ghost ? mk(skin.goggles) : new THREE.MeshStandardMaterial({ color: skin.goggles, roughness: 0.05, metalness: 0.9, envMapIntensity: 2 });
  const skinM = mk('#f0c8a0');
  const bootM = mk('#1f242c', { roughness: 0.4, metalness: 0.2 });
  const bindM = mk('#b9c0c8', { roughness: 0.3, metalness: 0.7 });
  const gloveM = mk('#20252d');

  // smuči (vsaka v svoji skupini za V-položaj in telemark zamik)
  const skis = [];
  for (const side of [1, -1]) {
    const g = skiMesh(skiM, tipM, bootM, bindM);
    g.position.z = side * 0.12;
    body.add(g); skis.push(g);
  }
  // noge (stegno širše od goleni), medenica, trup (prsni koš ploščat in širok), ramena, vrat
  const legs = [1, -1].map(side => ({ side, shin: seg(suit, 0.062, L_SHIN, { sz: 1.05 }), thigh: seg(suit, 0.088, L_THIGH, { sz: 1.1 }), kneeJ: new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), suit) }));
  legs.forEach(l => body.add(l.shin, l.thigh, l.kneeJ));
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), suit); pelvis.scale.set(1, 0.8, 1.25); pelvis.castShadow = true; body.add(pelvis);
  const torso = seg(suit, 0.15, L_TORSO, { sz: 1.3, sy: 0.82 }); body.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), suit); chest.scale.set(1, 0.78, 1.42); chest.position.set(L_TORSO * 0.78, 0.0, 0); chest.castShadow = true; torso.add(chest);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(L_TORSO * 0.85, 0.045, 0.4), suit2); torso.add(stripe); stripe.position.set(L_TORSO * 0.5, 0.11, 0);
  const side2 = new THREE.Mesh(new THREE.BoxGeometry(L_TORSO * 0.9, 0.2, 0.012), suit2); torso.add(side2); side2.position.set(L_TORSO * 0.5, 0, 0.2);
  const bib = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.24), mk('#ffffff')); bib.position.set(L_TORSO * 0.55, 0, 0.198); torso.add(bib);
  const neck = seg(skinM, 0.05, 0.08); body.add(neck);
  const arms = [1, -1].map(side => ({
    side, sh: new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), suit),
    up: seg(suit, 0.052, L_UARM), lo: seg(suit, 0.046, L_FARM),
    hand: new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), gloveM),
  }));
  arms.forEach(a => { a.hand.scale.set(1.3, 0.7, 1); body.add(a.sh, a.up, a.lo, a.hand); });
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), skinM); head.add(skull);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.142, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), helmetM);
  helmet.rotation.z = -0.5; helmet.castShadow = true; head.add(helmet);
  const visorRim = new THREE.Mesh(new THREE.TorusGeometry(0.143, 0.012, 6, 20, Math.PI * 1.1), helmetM); visorRim.rotation.set(Math.PI / 2, 0, -0.35); visorRim.position.y = -0.005; head.add(visorRim);
  const gog = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.065, 0.25), gogM); gog.position.set(0.12, 0.015, 0); head.add(gog);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 4, 18), mk('#202020')); strap.rotation.y = Math.PI / 2; strap.position.set(0.0, 0.015, 0); strap.scale.set(1, 1, 0.9); head.add(strap);
  if (!ghost && skin.flag) {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.066), new THREE.MeshBasicMaterial({ map: flagTex(skin.flag), side: THREE.DoubleSide }));
    fl.position.set(-0.02, 0.09, 0.143); fl.rotation.set(0, 0, -0.4); head.add(fl);
  }
  body.add(head);

  // tokovnice: tanke prosojne črte, ki v dobrem letu drsijo mimo telesa in smuči (občutek vzgona)
  const flows = [];
  if (!ghost) {
    const fm = new THREE.MeshBasicMaterial({ color: '#e8f6ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const lanes = [[0.05, 0.55], [0.08, -0.55], [0.55, 0.32], [0.62, -0.3], [0.95, 0.18], [0.3, 0.75], [0.3, -0.75], [-0.04, 0.0]];
    lanes.forEach(([y, z], i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + (i % 3) * 0.35, 0.014), fm);
      m.rotation.x = Math.PI / 2 * (i % 2);   // polovica vodoravno, polovica pokončno (vidno z več strani)
      m.position.set(0, y, z); m.renderOrder = 6; m.userData.ph = i * 0.37; m.userData.sp = 1 + (i % 4) * 0.18;
      root.add(m); flows.push(m);
    });
    flows.mat = fm;
  }
  if (ghost) root.traverse(o => { o.castShadow = false; o.renderOrder = 5; });

  let cur = { ...POSES.sit };
  let flailT = 0, flutT = 0, glideS = 0, flowT = 0;

  /**
   * Nastavi pozo iz posnetka stanja.
   * @param {Object} v {x, y, pitch, phase, crouch, air, alpha, prep, landType, landT, fallen, flail, cheer, t, glide, windH, speed}
   * @param {number} dt
   */
  let inrunPitch = null;   // zadnji nagib na mizi (za gladek prehod v let)
  function pose(v, dt) {
    root.position.set(v.x, v.y, v.z || 0);
    if (v.phase === 'inrun' || v.phase === 'gate') inrunPitch = v.pitch;
    else if (v.phase !== 'air') inrunPitch = null;
    let target, k = 12;
    if (v.phase === 'gate') target = POSES.sit;
    else if (v.phase === 'inrun') target = lerpPose(POSES.stand, POSES.tuck, v.crouch);
    else if (v.phase === 'air') {
      if (v.air < 0) target = POSES.tuck;
      else if (v.fallen) { target = POSES.fall; }
      else if (v.prep) { target = POSES.prep; k = 14; }
      else if (v.air < 0.3) { const u = v.air / 0.3; target = lerpPose(POSES.push, POSES.fly, u * u * (3 - 2 * u)); k = 24; }
      else {
        // nagib: velik napadni kot = »sede«, majhen = leži naprej
        const sitK = Math.max(0, Math.min(1, (v.alpha - 31) / 28));
        target = lerpPose(POSES.fly, POSES.sitair, sitK);
        k = 10;
      }
    } else {
      // pristanek in iztek
      const lt = v.landT;
      const kind = v.fallen ? 'fall' : v.landType;
      if (kind === 'fall') target = POSES.fall;
      else if (kind === 'touch') target = lt < 0.9 ? POSES.touch : POSES.stand;
      else if (kind === 'tele') target = lt < 1.1 ? POSES.tele : (v.cheer ? POSES.cheer : POSES.stand);
      else target = lt < 0.8 ? POSES.two : (v.cheer ? POSES.cheer : POSES.stand);
      k = lt < 0.2 ? 30 : 6;
    }
    const a = 1 - Math.exp(-k * Math.max(0, dt));
    cur = lerpPose(cur, target, v.snap ? 1 : a);
    const p = { ...cur };
    // mahanje z rokami ob nestabilnosti
    if (v.flail && v.phase === 'air' && !v.prep && !v.fallen) { flailT += dt * 14; p.arm = -110 + Math.sin(flailT) * 60; p.elbow = 30 + Math.sin(flailT * 1.3) * 20; }
    // jadranje (zglajeno): dres plapola, roke rahlo »nosijo« zrak
    glideS += ((v.glide || 0) - glideS) * Math.min(1, dt * 6);
    const inFlight = v.phase === 'air' && v.air >= 0.3 && !v.prep && !v.fallen;
    if (inFlight) {
      flutT += dt * (22 + (v.speed || 25) * 0.6);
      const fl = (0.4 + glideS) * 0.9;
      p.arm += Math.sin(flutT) * fl; p.elbow += Math.sin(flutT * 1.7) * fl * 0.8; p.head += Math.sin(flutT * 0.9) * fl * 0.5;
      p.armOut += glideS * 0.04;
    }

    // ob odrivu fizika postavi nagib na smer leta + nekaj stopinj; izris ga v prvih 0,3 s gladko pripelje z naklona mize
    let rp = v.pitch;
    if (v.phase === 'air' && inrunPitch != null && v.air >= 0 && v.air < 0.3 && !v.fallen) { const u = v.air / 0.3, e = u * u * (3 - 2 * u); rp = inrunPitch + (v.pitch - inrunPitch) * e; }
    else if (v.phase === 'air' && v.air >= 0.3) inrunPitch = null;
    root.rotation.set(0, 0, rp);
    // padec: kotaljenje
    if (v.fallen && v.phase !== 'air') {
      const t = Math.min(v.landT, 2.2);
      body.rotation.set(t * 2.2, 0, -t * 4.5 * Math.max(0, 1 - t / 2.4));
      body.position.y = 0.25;
    } else if (v.fallen) {
      body.rotation.set(0, 0, (v.t || 0) * 3);
      body.position.y = 0;
    } else { body.rotation.set(0, 0, 0); body.position.y = 0; }

    // smuči: V-položaj (repi skupaj, konici narazen), telemark zamik
    const half = p.v * Math.PI / 360;
    skis.forEach((g, i) => {
      const side = i === 0 ? 1 : -1;
      g.rotation.set(0, -side * half, 0);
      // rep smučke (x = −SKI_TAIL) ostane blizu sredine; vezi se ob V nekoliko razmaknejo
      g.position.z = side * (0.12 * (1 - p.v / 60) + 0.065 * (p.v / 60) + Math.sin(half) * SKI_TAIL * (p.v / 60));
      g.position.x = i === 0 ? p.fF : p.fB;
    });
    // noge (IK) od stopal do medenice; v V-položaju stopala sledijo smučem
    legs.forEach((l, i) => {
      const fx = i === 0 ? p.fF : p.fB, fy = 0.16;
      const fz = skis[i].position.z, hz = l.side * 0.1;
      const [kx, ky] = knee(fx, fy, p.px, p.py, L_SHIN, L_THIGH);
      const kz = (fz + hz) / 2;
      setSeg(l.shin, fx, fy, kx, ky, kz); l.shin.rotation.y = Math.atan2(fz - kz, Math.hypot(kx - fx, ky - fy)) * 0.6;
      setSeg(l.thigh, kx, ky, p.px, p.py, kz); l.thigh.rotation.y = Math.atan2(kz - hz, Math.hypot(p.px - kx, p.py - ky)) * 0.6;
      l.kneeJ.position.set(kx, ky, kz);
    });
    const tr = p.torso * Math.PI / 180;
    pelvis.position.set(p.px, p.py, 0); pelvis.rotation.set(0, 0, tr);
    torso.position.set(p.px, p.py, 0); torso.rotation.set(0, 0, tr);
    const sx = p.px + Math.cos(tr) * L_TORSO * 0.9, sy = p.py + Math.sin(tr) * L_TORSO * 0.9;
    const nx = p.px + Math.cos(tr) * (L_TORSO + 0.08), ny = p.py + Math.sin(tr) * (L_TORSO + 0.08);
    setSeg(neck, nx, ny, nx + Math.cos(tr + p.head * Math.PI / 360) * 0.08, ny + Math.sin(tr + p.head * Math.PI / 360) * 0.08, 0);
    head.position.set(p.px + Math.cos(tr) * (L_TORSO + 0.22), p.py + Math.sin(tr) * (L_TORSO + 0.22), 0);
    head.rotation.set(0, 0, tr - Math.PI / 2 + p.head * Math.PI / 180);
    arms.forEach(ar => {
      const a1 = tr + p.arm * Math.PI / 180, a2 = a1 + p.elbow * Math.PI / 180 * (ar.side > 0 ? 1 : 1.1);
      const ex = sx + Math.cos(a1) * L_UARM, ey = sy + Math.sin(a1) * L_UARM;
      const hx = ex + Math.cos(a2) * L_FARM, hy = ey + Math.sin(a2) * L_FARM;
      const zs = ar.side * 0.21, ze = ar.side * (0.21 + p.armOut * 0.6), zh = ar.side * (0.21 + p.armOut);
      ar.sh.position.set(sx, sy, zs);
      setSeg(ar.up, sx, sy, ex, ey, zs); ar.up.rotation.y = -Math.atan2(ze - zs, L_UARM);
      setSeg(ar.lo, ex, ey, hx, hy, ze); ar.lo.rotation.y = -Math.atan2(zh - ze, L_FARM);
      ar.hand.position.set(hx, hy, zh); ar.hand.rotation.set(0, 0, a2);
    });

    // tokovnice: vidne le v letu, močnejše pri dobrem jadranju in čelnem vetru, slabše v hrbtnem
    if (flows.length) {
      const wk = Math.max(0.5, Math.min(1.5, 1 + (v.windH || 0) * 0.2));
      const op = inFlight ? Math.min(0.55, glideS * 0.45 * wk) * Math.min(1, (v.air - 0.3) * 3) : 0;
      flows.mat.opacity += (op - flows.mat.opacity) * Math.min(1, dt * 8);
      flows.forEach(m => { m.visible = flows.mat.opacity > 0.01; });
      if (flows.mat.opacity > 0.01) {
        flowT += dt * (v.speed || 25) * 0.22;
        flows.forEach(m => {
          const u = (flowT * m.userData.sp + m.userData.ph) % 1;
          m.position.x = 1.9 - u * 3.8;
          m.scale.x = 0.6 + Math.sin(u * Math.PI) * 0.6;
        });
      }
    }
  }

  function dispose() {
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  return { root, pose, dispose };
}
