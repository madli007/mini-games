/* =====================================================================
   SMUČARSKI SKOKI — render/world.js: 3D okolica skakalnice iz profila.
   Fizika je 2D (x, y); svet je 3D: z je širina (kamera gleda iz +z proti −z).
   Teren (višinsko polje), zaletna smučina na jekleni konstrukciji s stopnicami,
   doskočišče iz zbitega snega s črtami daljave, K, HS in »zeleno črto« rekorda,
   iztečišče z ograjo in panoji, smreke in publika (InstancedMesh), gore v ozadju,
   jezero, sneženje. Kakovost (q) določa gostoto.
   ===================================================================== */
import * as THREE from 'three';
import { snow, inrunTrack, label, board, flag, dot, fbm, hash } from './tex.js';

const V3 = THREE.Vector3;
export const WAVE = { uTime: { value: 0 }, uCheer: { value: 0 } };

/** Polovična širina pripravljenega doskočišča na loku s. */
export function hillHalfWidth(hill, s) {
  const k = hill.k;
  if (s < 0) return 1.6;
  return Math.min(4 + s / k * 13, 22) + Math.max(0, s - hill.def.landing.lArc) * 0.12;
}

/** Višina terena (x, z) — pod skakalnico tik pod profilom, ob straneh dolina. */
function makeTerrainFn(hill, seed) {
  const endX = hill.land[hill.land.length - 1][1];
  const topX = hill.top.x;
  const base = x => {
    if (x >= 0) return hill.groundAt(Math.min(x, endX)).y + (x > endX ? (x - endX) * 0.22 : 0);
    // pod zaletom: teren se dviga za zaletom, a ostaja pod smučino (stolp je vse višji)
    const xi = Math.max(x, topX);
    const g = hill.groundAt(xi).y - hill.height - 0.12 * -xi;
    return g + (x < topX ? (topX - x) * 0.55 : 0);
  };
  return (x, z) => {
    const b = base(x);
    const s = x >= 0 ? hill.groundAt(Math.min(x, endX)).s : -1;
    const hw = (x >= 0 ? hillHalfWidth(hill, s) : 4) + 2;
    const az = Math.abs(z);
    if (az <= hw) return b - 0.25;
    const d = az - hw;
    // dolina: blizu skakalnice položno, dlje (gozd, pobočja) strmeje
    const far = Math.max(0, d - (z < 0 ? 90 : 70));
    const bank = d * (z < 0 ? 0.04 : 0.1) + far * (z < 0 ? 0.28 : 0.18) + fbm(x * 0.012, z * 0.012, seed, 4) * Math.min(1, d / 50) * 14 - 0.25;
    return b + bank;
  };
}

function ribbon(pts, widthFn, { uvScale = 1 } = {}) {
  // pts: [{x, y, s}] vzdolž profila; trak po z od −w do +w
  const pos = [], uv = [], idx = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], w = widthFn(p, i);
    pos.push(p.x, p.y, -w, p.x, p.y, w);
    uv.push(-w / 4 * uvScale, p.s / 4 * uvScale, w / 4 * uvScale, p.s / 4 * uvScale);
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Pas čez doskočišče na loku s (črta daljave). */
function lineAt(hill, s, w, color, emissive = 0, opacity = 1) {
  const a = hill.landAt(s - w / 2), b = hill.landAt(s + w / 2);
  const hw = hillHalfWidth(hill, s) - 0.3;
  const g = new THREE.BufferGeometry();
  const lift = 0.035;
  g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y + lift, -hw, a.x, a.y + lift, hw, b.x, b.y + lift, -hw, b.x, b.y + lift, hw], 3));
  g.setIndex([0, 1, 2, 1, 3, 2]);   // normala navzgor (prej obrnjena → nevidno od zgoraj)
  g.computeVertexNormals();
  const m = emissive
    ? new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(emissive), transparent: opacity < 1, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = !emissive;
  return mesh;
}

/* =====================================================================
   Gradnja sveta
   ===================================================================== */
/**
 * @param {Object} hill zgrajena skakalnica (hill.js)
 * @param {Object} q nastavitve kakovosti (scene.js QUALITY)
 * @returns {{group:THREE.Group, recordLine:Function, gateBars:THREE.Object3D[], setGate:Function, terrainAt:Function, crowdAnchor:THREE.Vector3}}
 */
export function buildWorld(hill, q) {
  const T = hill.def.theme;
  const seed = hill.id.length * 7 + 3;
  const group = new THREE.Group();
  const terrainAt = makeTerrainFn(hill, seed);
  const sn = snow(q.detail >= 2 ? 512 : 256, q.detail >= 2);
  const endX = hill.land[hill.land.length - 1][1];

  /* ---------------- teren */
  {
    const x0 = hill.top.x - 160, x1 = endX + 260, z0 = -240, z1 = 220;
    const st = q.detail >= 2 ? 2.5 : q.detail >= 1 ? 3.5 : 5;
    const nx = Math.ceil((x1 - x0) / st), nz = Math.ceil((z1 - z0) / st);
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2), col = new Float32Array((nx + 1) * (nz + 1) * 3);
    const rock = new THREE.Color('#8b8f9c'), white = new THREE.Color('#ffffff'), tmp = new THREE.Color();
    let p = 0;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + i * st, z = z0 + j * st, y = terrainAt(x, z);
      pos[p * 3] = x; pos[p * 3 + 1] = y; pos[p * 3 + 2] = z;
      uv[p * 2] = x / 6; uv[p * 2 + 1] = z / 6;
      const r = Math.max(0, fbm(x * 0.05, z * 0.05, 31, 3) - 0.62) * 3 * Math.min(1, Math.abs(z) / 60);
      tmp.copy(white).lerp(rock, Math.min(0.7, r));
      col[p * 3] = tmp.r; col[p * 3 + 1] = tmp.g; col[p * 3 + 2] = tmp.b;
      p++;
    }
    const idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ color: '#f4f8ff', vertexColors: true, map: sn.map, normalMap: sn.normalMap, roughnessMap: sn.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(0.6, 0.6) });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.name = 'terrain';
    group.add(mesh);
  }

  /* ---------------- doskočišče (zbit sneg) */
  const landPts = [];
  for (let s = 0; s <= hill.endS + 25; s += q.detail >= 1 ? 0.75 : 1.5) { const p = hill.landAt(s); landPts.push({ x: p.x, y: p.y + 0.02, s }); }
  {
    const g = ribbon(landPts, p => hillHalfWidth(hill, p.s), { uvScale: 1.6 });
    const m = new THREE.MeshStandardMaterial({ color: '#dfe8f4', map: sn.map, normalMap: sn.normalMap, roughnessMap: sn.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 0.7 });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.name = 'landing';
    group.add(mesh);
    // smrečje ob robovih doskočišča (zelene črtice za občutek globine, kot na pravih skakalnicah)
    {
      const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.06, 0.35), new THREE.MeshStandardMaterial({ color: '#1f5a36', roughness: 0.9 }), Math.ceil((hill.endS + 20) / 2) * 2 + 4);
      const mtx = new THREE.Matrix4(), qn = new THREE.Quaternion(), ax = new V3(0, 0, 1), sc = new V3(1, 1, 1), ps = new V3();
      let k = 0;
      for (let s = 2; s < hill.endS + 15; s += 2) {
        const p = hill.landAt(s), hw = hillHalfWidth(hill, s);
        qn.setFromAxisAngle(ax, -p.theta);
        for (const side of [-1, 1]) { ps.set(p.x, p.y + 0.04, side * (hw - 0.5)); mtx.compose(ps, qn, sc); dash.setMatrixAt(k++, mtx); }
      }
      dash.count = k; dash.receiveShadow = true; group.add(dash);
    }
    // robova (nizek snežni nasip)
    for (const side of [-1, 1]) {
      const pos = [], idx = [];
      landPts.forEach((p, i) => {
        const w = hillHalfWidth(hill, p.s);
        pos.push(p.x, p.y, side * w, p.x, p.y + 0.45, side * (w + 0.4), p.x, terrainAt(p.x, side * (w + 2.2)) + 0.1, side * (w + 2.2));
        if (i) { const a = (i - 1) * 3, b = i * 3; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2); }
      });
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setIndex(side > 0 ? idx : idx.map((_, i, a) => a[i - (i % 3) + (2 - (i % 3))])); bg.computeVertexNormals();
      const be = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: '#eef4fb', roughness: 0.95, side: THREE.DoubleSide }));
      be.receiveShadow = true; group.add(be);
    }
  }

  /* ---------------- črte daljave, K, HS, številke */
  const lines = new THREE.Group(); lines.name = 'lines';
  const s0 = Math.ceil(hill.k * 0.45 / 5) * 5;
  for (let s = s0; s <= hill.hs + 15; s += 5) {
    if (Math.abs(s - hill.k) < 0.01 || Math.abs(s - hill.hs) < 0.01 || s === Math.round(hill.def.landing.pArc * 0.85)) continue;
    lines.add(lineAt(hill, s, s % 10 === 0 ? 0.22 : 0.12, s % 10 === 0 ? '#1c46c4' : '#3a66d8', 1.0));   // vsakih 5 m (vsakih 10 m debelejša)
    if (s % 10 === 0) {
      const p = hill.landAt(s), hw = hillHalfWidth(hill, s);
      for (const side of [1, -1]) {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: label(String(s), { color: '#ffffff', bg: '#1d3b7a' }), toneMapped: false }));
        pl.position.set(p.x, p.y + 0.9, side * (hw + 0.9));
        if (side < 0) pl.rotation.y = 0; else pl.rotation.y = 0;
        lines.add(pl);
      }
    }
  }
  // P-točka (začetek doskočišča), K-točka in HS: debele črte čez celo doskočišče, oznake in količki na obeh straneh
  const P_S = Math.round(hill.def.landing.pArc * 0.85);
  const MARKS = [[P_S, 'P ' + P_S, '#1fb86b'], [hill.k, 'K ' + hill.k, '#e3263a'], [hill.hs, 'HS ' + hill.hs, '#2f6bff']];
  for (const [s, , colr] of MARKS) lines.add(lineAt(hill, s, s === P_S ? 0.3 : 0.6, colr, 1.8));
  const poleG = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6); poleG.translate(0, 1.3, 0);
  for (const [s, txt, colr] of MARKS) {
    const p = hill.landAt(s), hw = hillHalfWidth(hill, s);
    for (const side of [1, -1]) {
      const z = side * (hw + 1.1);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.4), new THREE.MeshBasicMaterial({ map: label(txt, { color: '#ffffff', bg: colr, w: 192 }), toneMapped: false, side: THREE.DoubleSide }));
      pl.position.set(p.x, p.y + 2.1, z);
      lines.add(pl);
      const pole = new THREE.Mesh(poleG, new THREE.MeshStandardMaterial({ color: colr, emissive: colr, emissiveIntensity: 0.4 }));
      pole.position.set(p.x - 1.9, p.y, z); pole.castShadow = true;
      lines.add(pole);
    }
  }
  // barvna pasova ob robovih: P → K zelen, K → HS rdeč, za HS moder (območje pristanka na prvi pogled)
  for (const [s0, s1, colr] of [[P_S, hill.k, '#1fb86b'], [hill.k, hill.hs, '#e3263a'], [hill.hs, hill.hs + 12, '#2f6bff']]) {
    for (const side of [-1, 1]) {
      const pos = [], idx = [];
      let i = 0;
      for (let s = s0; s <= s1 + 1e-6; s += 1) {
        const p = hill.landAt(s), hw = hillHalfWidth(hill, s);
        pos.push(p.x, p.y + 0.045, side * (hw - 0.15), p.x, p.y + 0.045, side * (hw - 1.05));
        if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
        i++;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      lines.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(colr).multiplyScalar(1.3), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 })));
    }
  }
  group.add(lines);
  let recLine = null;
  const recordLine = s => {
    if (recLine) { lines.remove(recLine); recLine.geometry.dispose(); recLine.material.dispose(); recLine = null; }
    if (s && s > 5) { recLine = lineAt(hill, s, 0.45, '#2bff7a', 2.2, 0.85); recLine.renderOrder = 2; lines.add(recLine); }
  };

  /* ---------------- zalet: smučina, krov, ograja, stopnice, konstrukcija */
  const inPts = [];
  for (let d = 0; d <= hill.inrunLen; d += 0.5) { const p = hill.inrunAt(d); inPts.push({ x: p.x, y: p.y, s: d, th: p.theta }); }
  {
    const tex = inrunTrack(); tex.repeat.set(1, 1);
    const tg = ribbon(inPts.map(p => ({ ...p, y: p.y + 0.01 })), () => 0.75);
    const trackM = new THREE.MeshStandardMaterial({ color: '#f2f6fb', map: tex, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.5 });
    const track = new THREE.Mesh(tg, trackM); track.receiveShadow = true; group.add(track);
    // krov: zaprt kvader (zgoraj, ob straneh, spodaj) vzdolž zaleta
    {
      const W = 2.4, Dp = 0.6, pos = [], idx = [];
      inPts.forEach((p, i) => {
        const y0 = p.y - 0.02, y1 = p.y - Dp;
        // 0: zgoraj −z, 1: zgoraj +z, 2: spodaj +z, 3: spodaj −z
        pos.push(p.x, y0, -W, p.x, y0, W, p.x, y1, W, p.x, y1, -W);
        if (i) {
          const o = (i - 1) * 4, n = i * 4;
          const quad = (a0, a1) => idx.push(o + a0, n + a0, o + a1, o + a1, n + a0, n + a1);
          quad(1, 0); quad(2, 1); quad(0, 3); quad(3, 2);
        }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const dMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#59606c', roughness: 0.75, metalness: 0.35, side: THREE.DoubleSide }));
      dMesh.castShadow = true; dMesh.receiveShadow = true; group.add(dMesh);
    }
    // ograji: nizka ob smučini (±1,15) in višja na robu krova (±2,35)
    const railM = new THREE.MeshStandardMaterial({ color: '#d9dde3', roughness: 0.35, metalness: 0.8 });
    const RAILS = [[-1.15, 0.55], [1.15, 0.55], [-2.35, 0.95], [2.35, 0.95]];
    for (const [z, h] of RAILS) {
      const pts = inPts.map(p => new V3(p.x, p.y + h, z));
      const curve = new THREE.CatmullRomCurve3(pts.filter((_, i) => i % 4 === 0));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.035, 5, false), railM);
      tube.castShadow = true; group.add(tube);
    }
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 1, 0.05), railM, (Math.ceil(inPts.length / 6) + 1) * RAILS.length);
    let k = 0; const mtx = new THREE.Matrix4(), sc1 = new V3(), q1 = new THREE.Quaternion(), p1 = new V3();
    for (let i = 0; i < inPts.length; i += 6) for (const [z, h] of RAILS) { p1.set(inPts[i].x, inPts[i].y + h / 2, z); sc1.set(1, h, 1); mtx.compose(p1, q1, sc1); posts.setMatrixAt(k++, mtx); }
    posts.count = k; group.add(posts);
    // stopnice na krovu ob smučini (bližnja stran, med ograjama)
    const stepM = new THREE.MeshStandardMaterial({ color: '#7a828e', roughness: 0.6, metalness: 0.6 });
    const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.16, 0.9), stepM, inPts.length);
    k = 0;
    for (let i = 4; i < inPts.length; i++) { const p = inPts[i]; if (p.th < 0.3) continue; mtx.makeTranslation(p.x, p.y + 0.06, 1.75); steps.setMatrixAt(k++, mtx); }
    steps.count = k; steps.castShadow = true; steps.receiveShadow = true; group.add(steps);
    // jeklena konstrukcija: stebri in diagonale (rešetka)
    const steel = new THREE.MeshStandardMaterial({ color: '#8a929e', roughness: 0.4, metalness: 0.85 });
    const beams = [];
    for (let i = 10; i < inPts.length; i += 10) {
      const p = inPts[i];
      for (const z of [-2, 2]) {
        const yb = terrainAt(p.x, z);
        if (p.y - 0.6 - yb > 0.5) beams.push([new V3(p.x, yb, z), new V3(p.x, p.y - 0.6, z), 0.16]);
      }
      if (i + 10 < inPts.length) {
        const n = inPts[i + 10];
        for (const z of [-2, 2]) {
          const yb = Math.max(terrainAt(p.x, z), terrainAt(n.x, z));
          const top = Math.min(p.y, n.y) - 0.6;
          if (top - yb > 3) {
            beams.push([new V3(p.x, yb + 0.5, z), new V3(n.x, top, z), 0.07]);
            beams.push([new V3(n.x, yb + 0.5, z), new V3(p.x, top, z), 0.07]);
          }
        }
        const yb = terrainAt(p.x, 0);
        for (let y = yb + 4; y < p.y - 2; y += 4) beams.push([new V3(p.x, y, -2), new V3(p.x, y, 2), 0.06]);
      }
    }
    const beamMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steel, beams.length);
    const up = new V3(0, 1, 0), dir = new V3(), quat = new THREE.Quaternion(), sc = new V3(), mid = new V3();
    beams.forEach(([a, b, t], i) => {
      dir.subVectors(b, a); const len = dir.length(); dir.normalize();
      quat.setFromUnitVectors(up, dir); sc.set(t, len, t); mid.addVectors(a, b).multiplyScalar(0.5);
      mtx.compose(mid, quat, sc); beamMesh.setMatrixAt(i, mtx);
    });
    beamMesh.castShadow = true; group.add(beamMesh);
    // greda in štartna hiška na vrhu
    const top = hill.top;
    const hut = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 6), new THREE.MeshStandardMaterial({ color: '#c33c3c', roughness: 0.6 }));
    hut.position.set(top.x - 1.5, top.y + 1.5, 0); hut.castShadow = true; group.add(hut);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.3, 6.6), new THREE.MeshStandardMaterial({ color: '#2b2f38', roughness: 0.5 }));
    roof.position.set(top.x - 1.5, top.y + 3.2, 0); group.add(roof);
    // kabina trenerjev ob mizi
    const cab = new THREE.Group();
    const cb = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3), new THREE.MeshStandardMaterial({ color: '#e8edf3', roughness: 0.4, metalness: 0.2 }));
    cb.castShadow = true; cab.add(cb);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1), new THREE.MeshStandardMaterial({ color: '#1b2a3a', roughness: 0.05, metalness: 0.9, envMapIntensity: 2 }));
    win.position.set(0, 0.3, 1.51); cab.add(win);
    cab.position.set(6, terrainAt(6, -hillHalfWidth(hill, 6) - 5) + 1.2, -hillHalfWidth(hill, 6) - 5);
    group.add(cab);
  }

  /* ---------------- zaletna mesta: le prečka izbranega mesta (za skakalcem) + oštevilčene oznake ob ograji */
  const gateBars = [];
  const markers = [];
  {
    for (let gi = 1; gi <= hill.def.gates.count; gi++) {
      const p = hill.inrunAt(hill.gateD(gi));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ map: label(String(gi), { color: '#ffffff', bg: '#2b3140', w: 96, h: 64, font: 'bold 46px system-ui, sans-serif' }), toneMapped: false, side: THREE.DoubleSide }));
      m.position.set(p.x, p.y + 0.72, -1.17);
      m.userData.base = m.material;
      m.userData.active = new THREE.MeshBasicMaterial({ map: label(String(gi), { color: '#14141e', bg: '#ffd23f', w: 96, h: 64, font: 'bold 46px system-ui, sans-serif' }), toneMapped: false, side: THREE.DoubleSide });
      group.add(m); markers.push(m);
    }
  }
  const gateBar = new THREE.Group();
  {
    const bm = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.4 });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), bm); bar.rotation.x = Math.PI / 2; bar.position.y = 0.38;
    gateBar.add(bar);
    for (const z of [-1.15, 1.15]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), bm); st.position.set(0, 0.2, z); gateBar.add(st); }
    bar.castShadow = true; group.add(gateBar); gateBars.push(gateBar);
  }
  const setGate = g => {
    const p = hill.inrunAt(hill.gateD(g) + 0.45);   // prečka je za skakalcem (višje po zaletu)
    gateBar.position.set(p.x, p.y, 0); gateBar.rotation.set(0, 0, -p.theta);
    markers.forEach((m, i) => { m.material = i === g - 1 ? m.userData.active : m.userData.base; });
  };

  /* ---------------- iztečišče: ograja in reklamni panoji */
  {
    const sA = hill.def.landing.lArc - 10, sB = hill.endS + 20;
    const txt = T.boards || ['MINI GAMES'];
    const colors = [['#ff4fd8', '#ffffff'], ['#0f1a3a', '#ffd23f'], ['#1e66ff', '#ffffff'], ['#ffd23f', '#14141e'], ['#39ff88', '#0b1220']];
    let bi = 0;
    for (const side of [1, -1]) {
      for (let s = sA; s < sB; s += 8) {
        const p = hill.landAt(s), p2 = hill.landAt(s + 8);
        const hw = hillHalfWidth(hill, s) + 0.8;
        const len = Math.hypot(p2.x - p.x, p2.y - p.y);
        const [bg, fg] = colors[bi % colors.length];
        const m = new THREE.MeshStandardMaterial({ map: board(txt[bi % txt.length], bg, fg), roughness: 0.5, emissive: '#ffffff', emissiveMap: board(txt[bi % txt.length], bg, fg), emissiveIntensity: 0.25 });
        bi++;
        const pl = new THREE.Mesh(new THREE.BoxGeometry(len - 0.2, 0.9, 0.08), m);
        pl.position.set((p.x + p.x + (p2.x - p.x)) / 2, (p.y + p2.y) / 2 + 0.55, side * hw);
        pl.rotation.z = Math.atan2(p2.y - p.y, p2.x - p.x);
        pl.castShadow = true;
        group.add(pl);
      }
    }
    // mreža ob doskočišču
    const netM = new THREE.MeshStandardMaterial({ color: '#2a5bd7', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    for (const side of [-1]) {
      const pts = [];
      for (let s = 4; s < sA; s += 2) pts.push({ ...hill.landAt(s), s });
      const pos = [], idx = [];
      pts.forEach((p, i) => { const w = hillHalfWidth(hill, p.s) + 1.6; pos.push(p.x, p.y, side * w, p.x, p.y + 1.6, side * w); if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      group.add(new THREE.Mesh(g, netM));
    }
  }

  /* ---------------- smreke (instanced) */
  {
    const count = Math.round(1400 * (T.trees ?? 1) * q.decor);
    const cone = new THREE.ConeGeometry(1, 1, 7); cone.translate(0, 0.5, 0);
    const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1, 5); trunk.translate(0, 0.5, 0);
    const leaf = new THREE.MeshStandardMaterial({ color: T.env === 'gozd' ? '#28503a' : '#244a3a', roughness: 0.9, flatShading: true });
    const snowCap = new THREE.MeshStandardMaterial({ color: '#f4f8ff', roughness: 0.8, flatShading: true });
    const bark = new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.9 });
    const tA = new THREE.InstancedMesh(cone, leaf, count * 2), tC = new THREE.InstancedMesh(cone, snowCap, count), tB = new THREE.InstancedMesh(trunk, bark, count);
    const birch = T.env === 'gozd';
    const tBirch = birch ? new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.8 }), count) : null;
    const mtx = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new V3(), ps = new V3();
    let n = 0, nb = 0, tries = 0;
    while (n < count && tries < count * 8) {
      tries++;
      const x = hill.top.x - 140 + hash(tries, 1, seed) * (endX - hill.top.x + 360);
      const z = -230 + hash(tries, 2, seed) * 420;
      const s = x >= 0 ? hill.groundAt(Math.min(x, endX)).s : -1;
      const hw = x >= 0 ? hillHalfWidth(hill, s) : 4;
      if (Math.abs(z) < hw + (x < 20 ? 22 : z < 0 ? 45 : 9)) continue;
      if (z > 0 && z < 70) continue;                      // pred kamero ni dreves
      if (x > hill.def.landing.lArc * 0.75 && x < endX + 40 && z < 0 && z > -hw - 40) continue;   // tribuna
      if (T.env === 'jezero' && x > endX + 30 && z > -120 && z < 140) continue;   // jezero
      const y = terrainAt(x, z);
      const h = 7 + hash(tries, 3, seed) * 9;
      const r = h * (0.26 + hash(tries, 4, seed) * 0.08);
      if (birch && hash(tries, 9, seed) < 0.3) {
        qn.identity(); sc.set(1, h * 0.9, 1); ps.set(x, y, z); mtx.compose(ps, qn, sc); tBirch.setMatrixAt(nb++, mtx);
        sc.set(r * 0.7, h * 0.45, r * 0.7); ps.set(x, y + h * 0.5, z); mtx.compose(ps, qn, sc); tA.setMatrixAt(n * 2, mtx); tA.setMatrixAt(n * 2 + 1, mtx);
        sc.set(0.001, 0.001, 0.001); mtx.compose(ps, qn, sc); tC.setMatrixAt(n, mtx); tB.setMatrixAt(n, mtx);
        n++; continue;
      }
      qn.setFromAxisAngle(new V3(0, 1, 0), hash(tries, 5, seed) * 6);
      sc.set(0.5, h * 0.15, 0.5); ps.set(x, y, z); mtx.compose(ps, qn, sc); tB.setMatrixAt(n, mtx);
      sc.set(r, h * 0.6, r); ps.set(x, y + h * 0.12, z); mtx.compose(ps, qn, sc); tA.setMatrixAt(n * 2, mtx);
      sc.set(r * 0.7, h * 0.5, r * 0.7); ps.set(x, y + h * 0.45, z); mtx.compose(ps, qn, sc); tA.setMatrixAt(n * 2 + 1, mtx);
      sc.set(r * 0.42, h * 0.22, r * 0.42); ps.set(x, y + h * 0.75, z); mtx.compose(ps, qn, sc); tC.setMatrixAt(n, mtx);
      n++;
    }
    tA.count = n * 2; tB.count = n; tC.count = n;
    for (const m of [tA, tB, tC]) { m.castShadow = q.detail >= 2; m.receiveShadow = false; group.add(m); }
    if (tBirch) { tBirch.count = nb; group.add(tBirch); }
  }

  /* ---------------- publika in zastave (instanced, valovanje v vertex shaderju) */
  const crowdAnchor = new V3();
  {
    const sA = hill.def.landing.lArc + 5, sB = hill.endS - 10;
    const per = Math.round(900 * (T.crowd ?? 1) * q.decor);
    const body = new THREE.CapsuleGeometry(0.22, 0.75, 2, 6); body.translate(0, 0.6, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = WAVE.uTime; sh.uniforms.uCheer = WAVE.uCheer;
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uTime; uniform float uCheer;\nvoid main() {')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          transformed.y += abs(sin(uTime * (5.0 + ph * 4.0) + ph * 6.283)) * (0.05 + 0.3 * uCheer) * step(0.3, ph + uCheer);`);
    };
    mat.customProgramCacheKey = () => 'crowd';
    const crowd = new THREE.InstancedMesh(body, mat, per);
    const mtx = new THREE.Matrix4(), c = new THREE.Color();
    const palette = ['#e63946', '#1d3557', '#f1c40f', '#2a9d8f', '#ff7a1a', '#7b2cbf', '#ffffff', '#3a86ff', '#ff4fd8', '#222831'];
    let n = 0;
    for (let i = 0; i < per; i++) {
      const s = sA + hash(i, 11, seed) * (sB - sA);
      const p = hill.landAt(s);
      const hw = hillHalfWidth(hill, s);
      const row = Math.floor(hash(i, 12, seed) * 9);
      const z = -(hw + 2.2 + row * 1.1 + hash(i, 13, seed) * 0.4);
      const x = p.x + (hash(i, 14, seed) - 0.5) * 1.5;
      const y = Math.max(terrainAt(x, z), p.y) + row * 0.45;
      mtx.makeTranslation(x, y, z); crowd.setMatrixAt(n, mtx);
      c.set(palette[Math.floor(hash(i, 15, seed) * palette.length)]); crowd.setColorAt(n, c);
      n++;
    }
    crowd.count = n; crowd.castShadow = false; group.add(crowd);
    crowdAnchor.copy(hill.landAt((sA + sB) / 2)); crowdAnchor.z = -hillHalfWidth(hill, (sA + sB) / 2) - 6;
    // tribuna (stopnice pod publiko)
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#4c5260', roughness: 0.8 }));
    const pA = hill.landAt(sA), pB = hill.landAt(sB);
    stand.scale.set(pB.x - pA.x, 4, 11); stand.position.set((pA.x + pB.x) / 2, Math.min(pA.y, pB.y) - 1.4, -hillHalfWidth(hill, (sA + sB) / 2) - 7.5);
    stand.receiveShadow = true; group.add(stand);
    // zastave na palicah (valovanje)
    const flags = Math.round(40 * (T.crowd ?? 1) * q.decor);
    const fg = new THREE.PlaneGeometry(1.2, 0.8, 8, 2); fg.translate(0.6, 0, 0);
    const sets = [['#ffffff', '#1e66ff', '#e3263a'], ['#e3263a', '#ffffff', '#e3263a'], ['#000000', '#e3263a', '#ffd23f'], ['#1e66ff', '#ffd23f', '#1e66ff'], ['#ffffff', '#e3263a', '#ffffff']];
    const pole = new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4); pole.translate(0, 1.1, 0);
    const poleM = new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.8, roughness: 0.4 });
    for (let i = 0; i < flags; i++) {
      const m = new THREE.MeshStandardMaterial({ map: flag(sets[i % sets.length]), side: THREE.DoubleSide, roughness: 0.8 });
      const uPhase = { value: i * 1.7 };
      m.onBeforeCompile = sh => {
        sh.uniforms.uTime = WAVE.uTime; sh.uniforms.uPhase = uPhase;
        sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uTime; uniform float uPhase;\nvoid main() {')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            float k = position.x / 1.2;
            transformed.z += sin(position.x * 5.0 - uTime * 6.0 + uPhase) * 0.12 * k;
            transformed.y += sin(position.x * 3.0 - uTime * 4.0) * 0.04 * k;`);
      };
      m.customProgramCacheKey = () => 'flag';
      const s = sA + hash(i, 21, seed) * (sB - sA);
      const p = hill.landAt(s), hw = hillHalfWidth(hill, s);
      const z = -(hw + 2.5 + hash(i, 22, seed) * 8);
      const y = Math.max(terrainAt(p.x, z), p.y) + Math.floor(hash(i, 22, seed) * 9) * 0.45;
      const f = new THREE.Mesh(fg, m); f.position.set(p.x, y + 1.9, z); f.rotation.y = hash(i, 23, seed) * 0.6 - 0.3;
      const pl = new THREE.Mesh(pole, poleM); pl.position.set(p.x, y, z);
      group.add(f, pl);
    }
  }

  /* ---------------- gore v ozadju */
  if ((T.mountains ?? 1) > 0) {
    const g = new THREE.Group();
    const n = 9;
    const rockM = new THREE.MeshStandardMaterial({ color: '#8d93a3', roughness: 1, flatShading: true, vertexColors: true });
    for (let i = 0; i < n; i++) {
      const w = 260 + hash(i, 31, seed) * 260, h = (90 + hash(i, 32, seed) * 160) * (T.mountains ?? 1);
      const geo = new THREE.ConeGeometry(w / 2, h, 10, 6);
      const pos = geo.attributes.position, colors = [];
      const cc = new THREE.Color();
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k);
        const jit = (hash(k, i, 40) - 0.5) * 0.18 * w * (1 - (y + h / 2) / h);
        pos.setX(k, pos.getX(k) + jit); pos.setZ(k, pos.getZ(k) + (hash(k, i, 41) - 0.5) * 0.12 * w);
        const t = (y + h / 2) / h;
        cc.set(t > 0.55 + hash(k, i, 42) * 0.15 ? '#f6f9ff' : '#7d8494'); colors.push(cc.r, cc.g, cc.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, rockM);
      m.position.set(hill.top.x - 300 + i * (endX - hill.top.x + 700) / n + (hash(i, 33, seed) - 0.5) * 80, terrainAt(0, -200) + h / 2 - 30, -520 - hash(i, 34, seed) * 360);
      g.add(m);
    }
    group.add(g);
  }

  /* ---------------- jezero */
  if (T.env === 'jezero') {
    const lake = new THREE.Mesh(new THREE.CircleGeometry(140, 48), new THREE.MeshStandardMaterial({ color: '#2d6f9e', roughness: 0.06, metalness: 0.1, envMapIntensity: 1.5 }));
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(endX + 150, hill.land[hill.land.length - 1][2] + 0.6, 10);
    lake.receiveShadow = true; group.add(lake);
  }

  /* ---------------- sneženje */
  let snowPts = null;
  if ((T.snowfall ?? 0) > 0 && q.particles > 0) {
    const N = Math.round(2500 * T.snowfall * q.particles);
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (hash(i, 51, 1) - 0.5) * 120; pos[i * 3 + 1] = hash(i, 52, 1) * 60; pos[i * 3 + 2] = (hash(i, 53, 1) - 0.5) * 120; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ map: dot(), size: 0.22, transparent: true, depthWrite: false, opacity: 0.85, color: '#ffffff' });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = WAVE.uTime;
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uTime;\nvoid main() {')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed.y = mod(transformed.y - uTime * 1.6, 60.0) - 20.0;
          transformed.x += sin(uTime * 0.7 + position.z) * 1.5;`);
    };
    m.customProgramCacheKey = () => 'snowfall';
    snowPts = new THREE.Points(g, m); snowPts.frustumCulled = false;
    group.add(snowPts);
  }

  return { group, recordLine, gateBars, setGate, terrainAt, crowdAnchor, snowPts, lines };
}
