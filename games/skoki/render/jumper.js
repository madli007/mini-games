/* =====================================================================
   SMUČARSKI SKOKI — render/jumper.js: proceduralni 3D skakalec iz preprostih
   oblik z zglobi. Poza izhaja iz stanja simulacije (drža, odriv, V-položaj,
   nagib, mahanje z rokami, priprava, telemark, dve nogi, dotik, padec).
   Videz je parameter (skin): dres, čelada, smuči, zastava — fizika je za vse enaka.
   Lokalni koordinatni sistem: izhodišče = vezi smuči (točka iz simulacije),
   +x = naprej vzdolž smuči, +y = gor pravokotno na smuči, z = levo/desno.
   ===================================================================== */
import * as THREE from 'three';
import { flag as flagTex } from './tex.js';

export const DEFAULT_SKIN = { id: 'osnovni', suit: '#e63946', suit2: '#ffffff', helmet: '#ffd23f', skis: '#1d3557', skiTip: '#ffd23f', flag: ['#ffffff', '#1e66ff', '#e3263a'], goggles: '#ff7a1a' };
export const GHOST_SKIN = { id: 'ghost', suit: '#9fe8ff', suit2: '#ffffff', helmet: '#cfffff', skis: '#9fe8ff', skiTip: '#ffffff', flag: ['#ffffff', '#ffffff', '#ffffff'], goggles: '#ffffff' };

const L_SHIN = 0.48, L_THIGH = 0.48, L_TORSO = 0.62, L_UARM = 0.32, L_FARM = 0.3, SKI = 2.5;

/* ---------------- poze (2D v ravnini smuči: pelvis, kot trupa, roke, stopala) */
const POSES = {
  sit:    { px: -0.35, py: 0.5, torso: 75, arm: -160, elbow: 30, fF: 0.05, fB: -0.05, v: 0, head: 10 },
  tuck:   { px: -0.28, py: 0.5, torso: 12, arm: -172, elbow: 4, fF: 0.0, fB: 0.0, v: 0, head: 35 },
  stand:  { px: -0.02, py: 0.95, torso: 82, arm: -100, elbow: 10, fF: 0.0, fB: 0.0, v: 0, head: 5 },
  push:   { px: 0.18, py: 0.92, torso: 50, arm: -140, elbow: 8, fF: 0, fB: 0, v: 0, head: 25 },
  fly:    { px: 0.82, py: 0.36, torso: 14, arm: -172, elbow: 2, fF: 0, fB: 0, v: 30, head: 8 },
  sitair: { px: 0.45, py: 0.72, torso: 48, arm: -150, elbow: 14, fF: 0, fB: 0, v: 26, head: 15 },
  prep:   { px: 0.25, py: 0.85, torso: 62, arm: -60, elbow: 25, fF: 0, fB: 0, v: 6, head: 10 },
  tele:   { px: 0.0, py: 0.68, torso: 78, arm: -15, elbow: 15, fF: 0.42, fB: -0.42, v: 0, head: 0 },
  two:    { px: -0.12, py: 0.6, torso: 58, arm: -40, elbow: 30, fF: 0.03, fB: -0.03, v: 0, head: 10 },
  touch:  { px: -0.3, py: 0.42, torso: 40, arm: -95, elbow: 0, fF: 0.1, fB: -0.1, v: 0, head: 10 },
  cheer:  { px: -0.02, py: 0.92, torso: 84, arm: 55, elbow: 10, fF: 0, fB: 0, v: 0, head: -5 },
  fall:   { px: -0.1, py: 0.35, torso: 0, arm: 30, elbow: 40, fF: 0.2, fB: -0.2, v: 18, head: 0 },
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

function seg(mat, r, len) {
  const g = new THREE.CapsuleGeometry(r, len, 3, 8);
  g.rotateZ(-Math.PI / 2); g.translate(len / 2, 0, 0);
  const m = new THREE.Mesh(g, mat); m.castShadow = true;
  return m;
}
const setSeg = (m, ax, ay, bx, by, z) => { m.position.set(ax, ay, z); m.rotation.set(0, 0, Math.atan2(by - ay, bx - ax)); };

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
  const suit = mk(skin.suit, { roughness: 0.45, metalness: 0.05 });
  const suit2 = mk(skin.suit2);
  const helmetM = mk(skin.helmet, { roughness: 0.25, metalness: 0.3 });
  const skiM = mk(skin.skis, { roughness: 0.3, metalness: 0.2 });
  const tipM = mk(skin.skiTip);
  const gogM = ghost ? mk(skin.goggles) : new THREE.MeshStandardMaterial({ color: skin.goggles, roughness: 0.05, metalness: 0.9, envMapIntensity: 2 });
  const skinM = mk('#f0c8a0');
  const bootM = mk('#222831');

  // smuči (vsaka v svoji skupini za V-položaj in telemark zamik)
  const skis = [];
  for (const side of [1, -1]) {
    const g = new THREE.Group();
    const ski = new THREE.Mesh(new THREE.BoxGeometry(SKI, 0.025, 0.11), skiM);
    ski.position.set(0.25, 0.012, 0); ski.castShadow = true; g.add(ski);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.115), tipM);
    tip.position.set(0.25 + SKI / 2 - 0.08, 0.04, 0); tip.rotation.z = 0.35; g.add(tip);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.13), bootM);
    boot.position.set(0.02, 0.09, 0); boot.castShadow = true; g.add(boot);
    g.position.z = side * 0.12;
    body.add(g); skis.push(g);
  }
  // noge, trup, roke, glava
  const legs = [1, -1].map(side => ({ side, shin: seg(suit, 0.065, L_SHIN), thigh: seg(suit, 0.08, L_THIGH) }));
  legs.forEach(l => body.add(l.shin, l.thigh));
  const torso = seg(suit, 0.15, L_TORSO); body.add(torso);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(L_TORSO * 0.8, 0.05, 0.31), suit2); torso.add(stripe); stripe.position.set(L_TORSO * 0.5, 0.11, 0);
  const bib = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.22), mk('#ffffff')); bib.position.set(L_TORSO * 0.55, 0, 0.162); torso.add(bib);
  const arms = [1, -1].map(side => ({ side, up: seg(suit, 0.05, L_UARM), lo: seg(suit, 0.045, L_FARM), hand: new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mk('#222831')) }));
  arms.forEach(a => body.add(a.up, a.lo, a.hand));
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), skinM); head.add(skull);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), helmetM);
  helmet.rotation.z = -0.5; helmet.castShadow = true; head.add(helmet);
  const gog = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.24), gogM); gog.position.set(0.12, 0.02, 0); head.add(gog);
  if (!ghost && skin.flag) {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.066), new THREE.MeshBasicMaterial({ map: flagTex(skin.flag), side: THREE.DoubleSide }));
    fl.position.set(-0.02, 0.09, 0.143); fl.rotation.set(0, 0, -0.4); head.add(fl);
  }
  body.add(head);
  if (ghost) root.traverse(o => { o.castShadow = false; o.renderOrder = 5; });

  let cur = { ...POSES.sit };
  let flailT = 0;

  /**
   * Nastavi pozo iz posnetka stanja.
   * @param {Object} v {x, y, pitch, phase, crouch, air, alpha, prep, landType, landT, fallen, flail, cheer, t}
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
      else if (v.air < 0.22) { target = lerpPose(POSES.push, POSES.fly, v.air / 0.22); k = 30; }
      else {
        // nagib: velik napadni kot = »sede«, majhen = leži naprej
        const sitK = Math.max(0, Math.min(1, (v.alpha - 30) / 30));
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

    // ob odrivu fizika postavi nagib takoj na smer leta + 55°; izris ga v prvih 0,3 s leta gladko pripelje z naklona mize,
    // sicer se trup v enem okvirju prevesi ~1 m nazaj po skakalnici (videti je kot prezgoden odriv). Fizika je nespremenjena.
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

    // smuči: V-položaj, telemark zamik
    const vr = p.v * Math.PI / 180;
    skis[0].rotation.set(0, vr / 2, 0); skis[1].rotation.set(0, -vr / 2, 0);
    skis[0].position.x = p.fF; skis[1].position.x = p.fB;
    // noge (IK) od stopal do medenice
    const hipZ = 0.1;
    legs.forEach((l, i) => {
      const fx = i === 0 ? p.fF : p.fB, fy = 0.14;
      const [kx, ky] = knee(fx, fy, p.px, p.py, L_SHIN, L_THIGH);
      setSeg(l.shin, fx, fy, kx, ky, l.side * hipZ);
      setSeg(l.thigh, kx, ky, p.px, p.py, l.side * hipZ);
    });
    const tr = p.torso * Math.PI / 180;
    torso.position.set(p.px, p.py, 0); torso.rotation.set(0, 0, tr);
    const sx = p.px + Math.cos(tr) * L_TORSO * 0.92, sy = p.py + Math.sin(tr) * L_TORSO * 0.92;
    head.position.set(p.px + Math.cos(tr) * (L_TORSO + 0.22), p.py + Math.sin(tr) * (L_TORSO + 0.22), 0);
    head.rotation.set(0, 0, tr - Math.PI / 2 + p.head * Math.PI / 180);
    arms.forEach(ar => {
      const a1 = tr + p.arm * Math.PI / 180, a2 = a1 + p.elbow * Math.PI / 180 * (ar.side > 0 ? 1 : 1.1);
      const ex = sx + Math.cos(a1) * L_UARM, ey = sy + Math.sin(a1) * L_UARM;
      const hx = ex + Math.cos(a2) * L_FARM, hy = ey + Math.sin(a2) * L_FARM;
      const z = ar.side * (0.2 + (p.arm > -100 ? 0.12 : 0));
      setSeg(ar.up, sx, sy, ex, ey, z); setSeg(ar.lo, ex, ey, hx, hy, z);
      ar.hand.position.set(hx, hy, z);
    });
  }

  function dispose() {
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  return { root, pose, dispose };
}
