/* =====================================================================
   HRČKOVA KROGLA — render/objects.js: objekti, ovire in sovražniki.
   Realistični a takoj prepoznavni modeli z jasnim telegrafom (svetloba,
   gib, barva). Animacije berejo isto stanje kot fizika (pathAt prek
   w.saws/w.wasps, hammerPhase, magnetState, doorOpenness …).
   ===================================================================== */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { P, hammerPhase, magnetState, doorOpenness, groundBelow } from '../physics.js';
import { surface, warnDecal, hazardStripes, clockFace, carbon, waspStripes, streaks, sawBlur, rings, flagCloth, softDot } from './textures.js';
import { withFade, withWave, surfaceMaterial } from './materials.js';
import { tintFor } from './terrain.js';

const col = c => new THREE.Color(c);
const hdr = (c, k) => col(c).multiplyScalar(k);

/** Material »jeklo« (brušena kovina s proceduralno teksturo). */
const steel = (opts = {}) => { const s = surface('metal'); return new THREE.MeshStandardMaterial({ color: '#d8dce4', map: s.map, normalMap: s.normalMap, roughnessMap: s.ormMap, metalnessMap: s.ormMap, roughness: 0.9, metalness: 1, ...opts }); };
const chrome = (opts = {}) => new THREE.MeshStandardMaterial({ color: '#e8ecf2', roughness: 0.12, metalness: 1, ...opts });
const paint = (c, opts = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08, ...opts });
const rubber = (c, opts = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0, ...opts });

/** Žarek svetlobe (aditiven, gradient navzgor, premikajoče proge). */
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: hdr(color, 1.4) }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
      void main(){ float a = pow(1.0 - vUv.y, 1.6) * (0.55 + 0.45 * sin(vUv.y * 18.0 - uTime * 3.0)) * (0.5 + 0.5 * pow(abs(sin(vUv.x * 3.14159 * 6.0 + uTime)), 4.0));
        gl_FragColor = vec4(uColor * a * 0.45, a * 0.45); }`,
  });
}

export function buildObjects({ L, w, th, look, q, parent, fx, reduced }) {
  const o = { dyn: [], lists: {}, prev: new Map() };
  const accent = th.accent || '#ffd23f';
  const add = (m, shadow = false) => { if (shadow && q.shadows) m.traverse(x => { if (x.isMesh) x.castShadow = true; }); parent.add(m); return m; };
  const gy = (x, z) => { const v = groundBelow(w, x, z); return Number.isFinite(v) ? v : 0; };

  /* -------------------------------------------- start */
  {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.5, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: hdr('#4de1ff', 1.8), transparent: true, opacity: 0.85, depthWrite: false }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.36, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4de1ff', transparent: true, opacity: 0.12, depthWrite: false }));
    g.add(ring, disc);
    g.position.set(L.start[0], gy(...L.start) + 0.02, L.start[1]);
    add(g, false);
    o.dyn.push(t => { ring.material.opacity = 0.6 + 0.25 * Math.sin(t * 3); });
  }

  /* -------------------------------------------- cilj: zlat obroč, svetlobni steber, delci */
  {
    const g = new THREE.Group();
    const gold = new THREE.MeshPhysicalMaterial({ color: '#ffd36a', metalness: 1, roughness: 0.16, clearcoat: 0.6, emissive: accent, emissiveIntensity: 0.85, envMapIntensity: 1.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.075, 20, 72), gold);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 10, 64), new THREE.MeshBasicMaterial({ color: hdr(accent, 2.6) }));
    inner.rotation.x = Math.PI / 2; inner.position.y = 0.04; g.add(inner);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: hdr(accent, 1.2), transparent: true, opacity: 0.28, depthWrite: false }));
    pad.position.y = 0.02; g.add(pad);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 7, 32, 1, true).translate(0, 3.5, 0), beamMaterial(accent));
    beam.renderOrder = 6; g.add(beam);
    g.position.set(L.goal[0], gy(...L.goal), L.goal[1]);
    add(g, false);
    // dvigajoči se delci (shader-free: preprosta lebdeča zanka)
    const N = Math.round(26 * q.particles) + 6, pos = new Float32Array(N * 3);
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: hdr(accent, 2.2), size: 0.07, map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; g.add(pts);
    o.goal = { g, ring };
    o.dyn.push((t, dt) => {
      ring.rotation.z = t * 0.6;
      ring.scale.setScalar(1 + 0.04 * Math.sin(t * 4));
      beam.material.uniforms.uTime.value = t;
      const p = pts.geometry.attributes.position;
      for (let k = 0; k < N; k++) {
        const f = ((k * 0.618 + t * 0.25) % 1), a = k * 2.4 + t * 0.5, r = 0.2 + ((k * 0.37) % 1) * 0.4;
        p.setXYZ(k, Math.cos(a) * r, 0.1 + f * 3, Math.sin(a) * r);
      }
      p.needsUpdate = true;
    });
  }

  /* -------------------------------------------- kontrolne točke: plapolajoče zastavice */
  const flagGeo = new THREE.PlaneGeometry(0.46, 0.3, 14, 6);
  const fc = flagCloth();
  o.flags = (L.checkpoints || []).map((p, k) => {
    const f = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.12, 10), chrome());
    pole.position.y = 0.56; f.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), chrome()); knob.position.y = 1.13; f.add(knob);
    const clothMat = withWave(new THREE.MeshStandardMaterial({ color: '#8a8c99', map: fc.map, normalMap: fc.normalMap, roughness: 0.85, side: THREE.DoubleSide, emissive: accent, emissiveIntensity: 0 }), 0.045);
    const cloth = new THREE.Mesh(flagGeo, clothMat);
    cloth.position.set(0.25, 0.92, 0); f.add(cloth);
    const base = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#8a8c99', transparent: true, opacity: 0.55, depthWrite: false }));
    base.position.y = 0.02; f.add(base);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.05, 16), steel()); foot.position.y = 0.025; f.add(foot);
    f.position.set(p[0] + 0.55, gy(p[0], p[1]), p[1]);
    f.userData = { cloth, base, k, on: false };
    return add(f);
  });

  /* -------------------------------------------- pobiralke: zvezdice in ure */
  const starShape = new THREE.Shape();
  for (let j = 0; j < 10; j++) {
    const a = j / 10 * Math.PI * 2 - Math.PI / 2, rr = j % 2 ? 0.1 : 0.24;
    if (j) starShape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else starShape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.018, bevelSegments: 2 }); starGeo.center();
  const starMat = new THREE.MeshPhysicalMaterial({ color: '#ffcc33', metalness: 1, roughness: 0.18, clearcoat: 1, emissive: '#ffae00', emissiveIntensity: 0.9, envMapIntensity: 1.6 });
  const cf = clockFace();
  const clockMats = [new THREE.MeshPhysicalMaterial({ color: '#39ff88', metalness: 0.9, roughness: 0.2, emissive: '#18c060', emissiveIntensity: 0.9 }), new THREE.MeshStandardMaterial({ map: cf, emissive: '#ffffff', emissiveMap: cf, emissiveIntensity: 0.55, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: '#204030' })];
  const clockGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 28).rotateX(Math.PI / 2);
  const clockRim = new THREE.TorusGeometry(0.205, 0.03, 10, 36);
  o.pickups = (L.pickups || []).map((p, k) => {
    let m;
    if (p.t === 'star') m = new THREE.Mesh(starGeo, starMat);
    else { m = new THREE.Group(); m.add(new THREE.Mesh(clockGeo, clockMats)); m.add(new THREE.Mesh(clockRim, clockMats[0])); }
    const y = p.y != null ? p.y + 0.05 : gy(p.x, p.z) + 0.45;
    m.position.set(p.x, y, p.z);
    m.userData = { k, y, star: p.t === 'star', was: true };
    return add(m);
  });

  /* -------------------------------------------- premične ploščice: kovina, vijaki, opozorilni pas */
  const hz = hazardStripes();
  o.movers = (L.movers || []).map(mv => {
    const g = new THREE.Group();
    const th0 = mv.thick || 0.4;
    const body = new THREE.Mesh(new RoundedBoxGeometry(mv.size[0], th0, mv.size[1], 2, 0.05), mv.ice
      ? new THREE.MeshPhysicalMaterial({ color: '#cfefff', roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.9, emissive: '#3a90c8', emissiveIntensity: 0.25 })
      : surfaceMaterial('metal', { color: tintFor('metal', accent).lerp(col('#ffffff'), 0.35) }));
    body.receiveShadow = true; g.add(body);
    const band = new THREE.Mesh(new THREE.BoxGeometry(mv.size[0] + 0.02, 0.07, mv.size[1] + 0.02), new THREE.MeshStandardMaterial({ map: hz, roughness: 0.5, emissive: '#ffb000', emissiveMap: hz, emissiveIntensity: 0.35 }));
    band.position.y = -th0 / 2 + 0.09; g.add(band);
    return add(g, true);
  });

  /* -------------------------------------------- vrtljive plošče */
  o.spinners = (L.spinners || []).map(s => {
    const geo = new THREE.CylinderGeometry(s.r, s.r, 0.3, 48, 1);
    const cols = [], pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const a = Math.atan2(pos.getZ(k), pos.getX(k));
      const stripe = Math.floor((a + Math.PI) / (Math.PI / 4)) % 2;
      const cc = col(stripe ? th.wall || '#ff4fd8' : th.edge || '#ffffff');
      cols.push(cc.r, cc.g, cc.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 1, metalness: 0.1 }));
    m.position.set(s.x, s.y - 0.15, s.z);
    m.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(s.r, 0.05, 10, 64), chrome()); rim.rotation.x = Math.PI / 2; rim.position.y = 0.13; m.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 20), steel()); hub.position.y = -0.35; m.add(hub);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 20), new THREE.MeshBasicMaterial({ color: hdr(th.edge || '#ffffff', 1.5) })); cap.position.y = 0.155; m.add(cap);
    return add(m, true);
  });

  /* -------------------------------------------- vzmeti: vijačnica, gumijasta plošča s puščico */
  o.springs = (L.springs || []).map(s => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.04, 28), steel()); g.add(base);
    const pts = []; for (let k = 0; k <= 60; k++) { const a = k / 60 * Math.PI * 2 * 4; pts.push(new THREE.Vector3(Math.cos(a) * 0.26, k / 60 * 0.12, Math.sin(a) * 0.26)); }
    const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.018, 6), chrome()); g.add(coil);
    const plate = new THREE.Group(); plate.position.y = 0.12; g.add(plate);
    plate.add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 28), paint('#ff3b5c', { emissive: '#ff1a3a', emissiveIntensity: 0.35 })));
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 3), new THREE.MeshBasicMaterial({ color: hdr('#ffffff', 1.4) }));
    arrow.position.y = 0.04; arrow.rotation.set(-Math.PI / 2, 0, Math.atan2(-s.dir[0], -s.dir[1])); plate.add(arrow);
    g.position.set(s.x, gy(s.x, s.z) + 0.0, s.z);
    g.userData = { plate, coil, t: -9 };
    return add(g);
  });

  /* -------------------------------------------- ventilatorji: ohišje z rešetko, vidni tokovi */
  const streakTex = streaks().clone(); streakTex.userData = { cached: false }; streakTex.needsUpdate = true;
  o.ownTex = [streakTex];
  o.fans = (L.fans || []).map(f => {
    const g = new THREE.Group();
    const y = f.y ?? gy(f.x + f.dir[0], f.z + f.dir[1]);
    const W = f.width || 1;
    const housing = new THREE.Mesh(new RoundedBoxGeometry(W, 0.9, 0.32, 2, 0.06), steel({ color: '#8a909c' })); g.add(housing);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 10, 40), chrome()); ring.position.z = 0.17; g.add(ring);
    const grille = [];
    for (let k = -2; k <= 2; k++) { const b = new THREE.BoxGeometry(0.012, 0.7, 0.012).translate(k * 0.13, 0, 0.2); grille.push(b); }
    for (let k = -2; k <= 2; k++) { const b = new THREE.BoxGeometry(0.7, 0.012, 0.012).translate(0, k * 0.13, 0.2); grille.push(b); }
    const gr = new THREE.Mesh(mergeGeometries(grille), chrome({ roughness: 0.3 })); grille.forEach(b => b.dispose()); g.add(gr);
    const blades = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.02), paint('#4de1ff', { emissive: '#1aa0c0', emissiveIntensity: 0.4 }));
      b.position.y = 0.17; b.rotation.y = 0.5; const piv = new THREE.Group(); piv.rotation.z = k * Math.PI * 2 / 5; piv.add(b); blades.add(piv);
    }
    blades.position.z = 0.15; g.add(blades);
    // tok zraka: prosojni animirani trakovi
    const flowMat = new THREE.MeshBasicMaterial({ color: hdr('#d8f6ff', 1.1), alphaMap: streakTex, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    for (const yy of [-0.2, 0.05, 0.25]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.85, f.len, 1, 1).rotateX(Math.PI / 2), flowMat);
      pl.position.set(0, yy, 0.2 + f.len / 2);
      pl.renderOrder = 6;
      g.add(pl);
    }
    g.position.set(f.x, y + 0.45, f.z);
    g.rotation.y = Math.atan2(f.dir[0], f.dir[1]);
    const N = Math.round(16 * q.particles) + 4, pos = new Float32Array(N * 3);
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ color: '#ffffff', size: 0.06, map: softDot(), transparent: true, opacity: 0.75, depthWrite: false }));
    pts.frustumCulled = false; parent.add(pts);
    g.userData = { blades, pts, f, y, seeds: Array.from({ length: N }, (_, k) => [(k * 0.618) % 1, ((k * 0.381) % 1) - 0.5, ((k * 0.73) % 1) * 0.6]) };
    return add(g, true);
  });

  /* -------------------------------------------- odbijači: kromiran steber z gumijastim obročem */
  o.bumpers = (L.bumpers || []).map(b => {
    const g = new THREE.Group();
    const r = b.r || 0.4;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.95, 0.7, 28), chrome()));
    const ringMat = rubber('#4de1ff', { emissive: '#4de1ff', emissiveIntensity: 0.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.07, 12, 40), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.04, 24), new THREE.MeshBasicMaterial({ color: hdr('#4de1ff', 1.6) })); cap.position.y = 0.36; g.add(cap);
    g.position.set(b.x, (b.y ?? gy(b.x, b.z)) + 0.35, b.z);
    g.userData = { b, ringMat, flash: 0 };
    return add(g, true);
  });

  /* -------------------------------------------- kladiva: težka jeklena glava, rdeča svetloba na tleh */
  const wd = warnDecal();
  o.hammers = (L.hammers || []).map(hm => {
    const g = new THREE.Group();
    const y = gy(hm.x + hm.w / 2, hm.z + hm.d / 2);
    const headMat = steel({ color: '#b8bcc6', emissive: '#ff1a2a', emissiveIntensity: 0 });
    const head = new THREE.Mesh(new RoundedBoxGeometry(hm.w * 0.95, 0.5, hm.d * 0.95, 3, 0.07), headMat);
    g.add(head);
    const band = new THREE.Mesh(new THREE.BoxGeometry(hm.w * 0.97, 0.08, hm.d * 0.97), new THREE.MeshStandardMaterial({ map: hz, roughness: 0.5 }));
    head.add(band);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 3, 12), chrome({ roughness: 0.25 }));
    shaft.position.y = 1.75; g.add(shaft);
    const warnMat = new THREE.MeshBasicMaterial({ color: hdr('#ff2a3a', 1.2), alphaMap: wd, transparent: true, opacity: 0, depthWrite: false });
    const warn = new THREE.Mesh(new THREE.PlaneGeometry(hm.w * 1.08, hm.d * 1.08).rotateX(-Math.PI / 2), warnMat);
    warn.position.set(hm.x + hm.w / 2, y + 0.03, hm.z + hm.d / 2); warn.renderOrder = 2;
    parent.add(warn);
    g.position.set(hm.x + hm.w / 2, y, hm.z + hm.d / 2);
    g.userData = { head, shaft, warn, warnMat, headMat, y, hm, ph: 'idle' };
    return add(g, true);
  });

  /* -------------------------------------------- stikala in vrata */
  o.switches = (L.switches || []).map(s => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.06, 28), steel()));
    const btnMat = paint('#ff3b5c', { emissive: '#ff1a3a', emissiveIntensity: 0.6 });
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.12, 28), btnMat); btn.position.y = 0.07; g.add(btn);
    g.position.set(s.x, gy(s.x, s.z) + 0.03, s.z);
    g.userData = { id: s.id, btn, btnMat };
    return add(g);
  });
  o.doors = (L.doors || []).map(d => {
    const g = new THREE.Group();
    const H = d.h || 1.2;
    g.add(new THREE.Mesh(new RoundedBoxGeometry(d.w, H, d.d, 2, 0.04), withFade(steel({ color: '#a8acb6' }))));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.01, 0.12, d.d + 0.01), new THREE.MeshStandardMaterial({ map: hz, emissive: '#ffb000', emissiveMap: hz, emissiveIntensity: 0.3 }));
    stripe.position.y = H * 0.25; g.add(stripe);
    const light = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.012, 0.05, d.d + 0.012), new THREE.MeshBasicMaterial({ color: hdr('#ff3b5c', 2.2) }));
    light.position.y = H / 2 - 0.08; g.add(light);
    g.position.set(d.x + d.w / 2, d.y + H / 2, d.z + d.d / 2);
    g.userData = { d, y: g.position.y, light };
    return add(g, true);
  });
  const blockMat = surfaceMaterial(look.wall, { color: tintFor(look.wall, th.wall || '#ff4fd8'), fade: true });
  for (const b of L.blocks || []) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(b.w, b.y1 - b.y0, b.d, 2, Math.min(0.05, b.w / 3, b.d / 3)), blockMat);
    m.position.set(b.x + b.w / 2, (b.y0 + b.y1) / 2, b.z + b.d / 2);
    m.receiveShadow = true;
    add(m, true);
  }

  /* -------------------------------------------- žage: kovinski disk z zobmi, zameglitev, iskre, vodila */
  const railParts = [];
  o.saws = w.saws.map(s => {
    const g = new THREE.Group();
    const sh = new THREE.Shape();
    const T = 18;
    for (let k = 0; k < T * 2; k++) {
      const a = k / (T * 2) * Math.PI * 2, rr = k % 2 ? s.r * 0.86 : s.r;
      const a2 = a + (k % 2 ? 0 : 0.06);
      if (k) sh.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr); else sh.moveTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
    }
    const hole = new THREE.Path(); hole.absarc(0, 0, s.r * 0.12, 0, Math.PI * 2, true); sh.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 4 }); geo.center();
    const disc = new THREE.Group(); g.add(disc);
    disc.add(new THREE.Mesh(geo, chrome({ roughness: 0.22, color: '#dfe3ea' })));
    const dz = new THREE.Mesh(new THREE.RingGeometry(s.r * 0.5, s.r * 0.6, 40), new THREE.MeshBasicMaterial({ color: hdr('#ff3b5c', 1.6), side: THREE.DoubleSide })); disc.add(dz);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.16, s.r * 0.16, 0.07, 6).rotateX(Math.PI / 2), steel()); g.add(nut);
    const blur = new THREE.Mesh(new THREE.CircleGeometry(s.r * 1.04, 40), new THREE.MeshBasicMaterial({ map: sawBlur(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.9 }));
    blur.renderOrder = 5; g.add(blur);
    // vodila
    const pts = s.path.map(p => new THREE.Vector3(p[0], gy(p[0], p[1]) + 0.015, p[1]));
    if (s.loop !== false) pts.push(pts[0].clone());
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], len = a.distanceTo(b);
      const ang = Math.atan2(b.x - a.x, b.z - a.z);
      for (const off of [-0.07, 0.07]) {
        const rail = new THREE.BoxGeometry(0.03, 0.03, len + 0.03);
        rail.applyMatrix4(new THREE.Matrix4().makeTranslation(off, 0, 0)).applyMatrix4(new THREE.Matrix4().makeRotationY(ang)).applyMatrix4(new THREE.Matrix4().makeTranslation((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
        railParts.push(rail);
      }
      const n = Math.max(1, Math.floor(len / 0.5));
      for (let j = 0; j <= n; j++) {
        const f = j / n, sl = new THREE.BoxGeometry(0.26, 0.012, 0.05);
        sl.applyMatrix4(new THREE.Matrix4().makeRotationY(ang)).applyMatrix4(new THREE.Matrix4().makeTranslation(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - 0.008, a.z + (b.z - a.z) * f));
        railParts.push(sl);
      }
    }
    g.userData = { disc, blur, s, last: null, ang: 0, sparkT: 0 };
    return add(g, true);
  });
  if (railParts.length) {
    const rails = new THREE.Mesh(mergeGeometries(railParts), chrome({ roughness: 0.35, color: '#c8ccd4' }));
    railParts.forEach(r => r.dispose());
    rails.receiveShadow = true;
    add(rails, false);
  }

  /* -------------------------------------------- ose: rumeno-črne, prosojna krila */
  const ws = waspStripes();
  const waspBody = new THREE.SphereGeometry(0.16, 20, 14).rotateX(Math.PI / 2).scale(1, 0.85, 1.35);
  const waspMat = new THREE.MeshPhysicalMaterial({ map: ws, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#141008', roughness: 0.3, clearcoat: 1 });
  const wingMat = new THREE.MeshPhysicalMaterial({ color: '#e8f4ff', roughness: 0.05, transparent: true, opacity: 0.45, side: THREE.DoubleSide, iridescence: 1, iridescenceIOR: 1.6, depthWrite: false });
  const wingGeo = new THREE.CircleGeometry(0.15, 14).scale(1.4, 0.55, 1);
  o.wasps = w.wasps.map((s, k) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(waspBody, waspMat));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), black); head.position.z = 0.24; g.add(head);
    for (const sx of [1, -1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: hdr('#ff3b5c', 1.5) })); e.position.set(sx * 0.045, 0.03, 0.3); g.add(e); }
    const sting = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 8).rotateX(-Math.PI / 2), black); sting.position.z = -0.27; g.add(sting);
    const wings = [1, -1].map(sx => {
      const piv = new THREE.Group(); piv.position.set(sx * 0.05, 0.11, 0.04); g.add(piv);
      const wg = new THREE.Mesh(wingGeo, wingMat); wg.rotation.x = -Math.PI / 2; wg.position.x = sx * 0.19; wg.renderOrder = 5; piv.add(wg);
      return piv;
    });
    g.userData = { wings, s, last: new THREE.Vector3(s.pos[0], 0, s.pos[1]) };
    return add(g);
  });

  /* -------------------------------------------- nasilneži: temna težka krogla (karbon), jezne oči */
  const cb = carbon();
  o.bullies = w.bullies.map(b => {
    const g = new THREE.Group();
    const sph = new THREE.Mesh(new THREE.SphereGeometry(b.r, 40, 28), new THREE.MeshPhysicalMaterial({ color: '#4a3040', map: cb.map, normalMap: cb.normalMap, roughness: 0.45, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
    g.add(sph);
    const band = new THREE.Mesh(new THREE.TorusGeometry(b.r * 1.0, 0.04, 10, 48), rubber('#7a1020', { emissive: '#ff1a3a', emissiveIntensity: 0.5 }));
    band.rotation.x = Math.PI / 2; g.add(band);
    const face = new THREE.Group();
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.2 }));
      eye.position.set(0.17 * s, 0.12, b.r * 0.86); eye.scale.z = 0.6; face.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), new THREE.MeshBasicMaterial({ color: hdr('#ff2030', 1.8) }));
      pupil.position.set(0.17 * s, 0.1, b.r * 0.95); face.add(pupil);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.05), black);
      brow.position.set(0.16 * s, 0.25, b.r * 0.9); brow.rotation.z = -0.45 * s; face.add(brow);
    }
    g.add(face);
    g.userData = { face, b, sph, last: null, dustT: 0 };
    return add(g, true);
  });

  /* -------------------------------------------- sesalci: ohišje z rešetko, vidni tok navznoter */
  o.vacuums = w.vacuums.map(v => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.75, 0.8, 3, 0.12), paint('#6a5a8a', { metalness: 0.3 })); body.position.z = -0.65; g.add(body);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.87, 0.06, 0.82), new THREE.MeshBasicMaterial({ color: hdr('#a78bfa', 1.8) })); stripe.position.set(0, 0.2, -0.65); g.add(stripe);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.26, 0.6, 28, 1, true).rotateX(Math.PI / 2), steel({ side: THREE.DoubleSide, color: '#a8acb8' })); nozzle.position.z = -0.05; g.add(nozzle);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.04, 10, 40), rubber('#2a2238')); lip.position.z = 0.25; g.add(lip);
    const grille = [];
    for (let k = -3; k <= 3; k++) grille.push(new THREE.BoxGeometry(0.01, 0.48, 0.01).translate(k * 0.07, 0, -0.32));
    const gm = new THREE.Mesh(mergeGeometries(grille), chrome()); grille.forEach(x => x.dispose()); g.add(gm);
    const range = v.range || 4, spread = Math.tan((v.angle || 35) * Math.PI / 180) * range * 0.6;
    const flowMat = new THREE.MeshBasicMaterial({ color: hdr('#e4d8ff', 1.1), alphaMap: streakTex, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const flow = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.6, spread), 0.3, range, 24, 1, true).rotateX(-Math.PI / 2), flowMat);
    flow.position.z = 0.25 + range / 2; flow.renderOrder = 6; g.add(flow);
    const dir = v.dir || [0, 1];
    g.position.set(v.x, gy(v.x + dir[0] * 1.5, v.z + dir[1] * 1.5) + 0.4, v.z);
    g.rotation.y = Math.atan2(dir[0], dir[1]);
    const N = Math.round(20 * q.particles) + 6, pos = new Float32Array(N * 3);
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ color: '#e4d8ff', size: 0.07, map: softDot(), transparent: true, opacity: 0.8, depthWrite: false }));
    pts.frustumCulled = false; parent.add(pts);
    g.userData = { v, pts, y: g.position.y };
    return add(g, true);
  });

  /* -------------------------------------------- magneti: pobarvana podkev, valovanje polja */
  const rg = rings();
  o.magnets = w.magnets.map(mg => {
    const g = new THREE.Group();
    const c = mg.mode === 'push' ? '#4de1ff' : '#ff3b5c';
    const uMat = paint(c, { emissive: c, emissiveIntensity: 0 });
    const u = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 16, 36, Math.PI), uMat);
    u.rotation.z = Math.PI; g.add(u);
    for (const s of [1, -1]) {
      const tip = new THREE.Mesh(new RoundedBoxGeometry(0.23, 0.17, 0.23, 2, 0.03), chrome());
      tip.position.set(0.32 * s, 0.05, 0); g.add(tip);
    }
    const fieldMat = new THREE.MeshBasicMaterial({ color: hdr(c, 1.5), alphaMap: rg, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const R = mg.range || 3.5;
    const field = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2).rotateX(-Math.PI / 2), fieldMat);
    const fy = gy(mg.x, mg.z);
    field.position.set(mg.x, fy + 0.035, mg.z); field.renderOrder = 2;
    parent.add(field);
    const field2 = new THREE.Mesh(field.geometry, fieldMat); field2.position.copy(field.position); field2.position.y += 0.005; parent.add(field2);
    g.position.set(mg.x, fy + 0.9, mg.z);
    g.userData = { u, uMat, field, field2, fieldMat, mg };
    return add(g, true);
  });

  o.update = (w2, t, dt, ctx) => update(o, w2, t, dt, ctx, fx, q, reduced, accent);
  return o;
}

/* ===================================================================== */

function update(o, w, t, dt, ctx, fx, q, reduced, accent) {
  for (const f of o.dyn) f(t, dt);
  for (const tx of o.ownTex) tx.offset.y = -(t * 1.6) % 1;
  w.movers.forEach((m, k) => o.movers[k].position.set(m.pos[0], m.pos[1] - (m.thick || 0.4) / 2, m.pos[2]));
  w.spinners.forEach((s, k) => { o.spinners[k].rotation.y = -s.speed * t; });
  o.flags.forEach(f => {
    const on = f.userData.k <= w.checkpoint;
    if (on !== f.userData.on) {
      f.userData.on = on;
      const c = on ? accent : '#8a8c99';
      f.userData.cloth.material.color.set(c); f.userData.cloth.material.emissiveIntensity = on ? 0.55 : 0;
      f.userData.base.material.color.set(on ? new THREE.Color(accent).multiplyScalar(1.8) : '#8a8c99');
    }
  });
  o.pickups.forEach(p => {
    const vis = !w.collected.has(p.userData.k);
    if (p.userData.was && !vis) {
      // razpad v delce
      fx.spark(p.position.x, p.position.y, p.position.z, p.userData.star ? '#ffd23f' : '#39ff88', 22, 2.6, 0.7, 2.6);
      fx.puff(p.position.x, p.position.y, p.position.z, '#ffffff', 6, 1.2, 0.5, 0);
    }
    p.userData.was = vis;
    p.visible = vis;
    p.rotation.y = t * 2.2 + p.userData.k;
    p.position.y = p.userData.y + Math.sin(t * 3 + p.userData.k) * 0.06;
  });
  for (const s of o.springs) {
    const a = t - s.userData.t;
    const lift = a >= 0 && a < 0.25 ? Math.sin(a / 0.25 * Math.PI) * 0.25 : 0;
    s.userData.plate.position.y = 0.12 + lift;
    s.userData.coil.scale.y = 1 + lift / 0.12;
  }
  for (const f of o.fans) {
    f.userData.blades.rotation.z = t * 16;
    const { pts, f: fan, y, seeds } = f.userData;
    const pos = pts.geometry.attributes.position;
    const px = -fan.dir[1], pz = fan.dir[0];
    seeds.forEach((sd, k) => {
      const u = (sd[0] + t * 0.9) % 1;
      const along = u * fan.len, side = sd[1] * (fan.width || 1);
      pos.setXYZ(k, fan.x + fan.dir[0] * along + px * side, y + 0.2 + sd[2], fan.z + fan.dir[1] * along + pz * side);
    });
    pos.needsUpdate = true;
  }
  for (const b of o.bumpers) {
    const bb = b.userData.b;
    const d = Math.hypot(w.ball.x - bb.x, w.ball.z - bb.z);
    if (d < (bb.r || 0.4) + w.R + 0.06) b.userData.flash = 1;
    b.userData.flash = Math.max(0, b.userData.flash - dt * 4);
    b.userData.ringMat.emissiveIntensity = 0.6 + b.userData.flash * 3;
  }
  for (const h of o.hammers) {
    const st = hammerPhase(w, h.userData.hm);
    let y = 1.6;
    if (st.ph === 'warn') y = 1.6 + st.f * 0.9 + (reduced ? 0 : Math.sin(t * 40) * 0.03 * st.f);
    else if (st.ph === 'strike') y = 2.5 - 2.25 * Math.min(1, st.f * 2);
    else if (st.ph === 'up') y = 0.25 + st.f * 1.35;
    h.userData.head.position.y = y;
    h.userData.shaft.position.y = y + 1.75;
    // telegraf: rdeča svetloba na tleh se krepi do udarca
    const wf = st.ph === 'warn' ? st.f : st.ph === 'strike' ? 1 : 0;
    h.userData.warnMat.opacity = st.ph === 'warn' ? 0.25 + 0.55 * st.f + 0.15 * Math.sin(t * 20) : st.ph === 'strike' ? 0.9 : 0;
    h.userData.warnMat.color.setRGB(1, 0.04, 0.06).multiplyScalar(0.9 + wf * 1.6);
    h.userData.headMat.emissiveIntensity = wf * 0.6;
    if (st.ph === 'strike' && st.f >= 0.5 && h.userData.ph !== 'hit') {
      h.userData.ph = 'hit';
      const hm = h.userData.hm;
      for (let k = 0; k < 4; k++) fx.puff(hm.x + hm.w * (k % 2), h.userData.y + 0.1, hm.z + hm.d * (k >> 1), '#d8d0c4', 6, 2.2, 0.9, 0.4);
    } else if (st.ph !== 'strike') h.userData.ph = st.ph;
  }
  for (const s of o.switches) {
    const on = w.switches.has(s.userData.id);
    s.userData.btnMat.color.set(on ? '#39ff88' : '#ff3b5c'); s.userData.btnMat.emissive.set(on ? '#20ff70' : '#ff1a3a');
    s.userData.btn.scale.y = on ? 0.35 : 1;
    s.userData.btn.position.y = on ? 0.03 : 0.07;
  }
  for (const d of o.doors) {
    const op = doorOpenness(w, d.userData.d.id);
    d.position.y = d.userData.y - op * ((d.userData.d.h || 1.2) + 0.05);
    d.visible = op < 0.98;
    d.userData.light.material.color.set(op > 0 ? '#39ff88' : '#ff3b5c').multiplyScalar(2.2);
  }
  o.saws.forEach((m, k) => {
    const s = w.saws[k];
    const y = groundBelow(w, s.pos[0], s.pos[1]);
    const gyv = Number.isFinite(y) ? y : 0;
    m.position.set(s.pos[0], gyv + s.r * 0.9, s.pos[1]);
    const last = m.userData.last;
    if (last) {
      const dx = s.pos[0] - last[0], dz = s.pos[1] - last[1];
      if (dx * dx + dz * dz > 1e-7) m.userData.ang = Math.atan2(dx, dz) + Math.PI / 2;
    } else {
      const nx = s.info.seg[0].b[0] - s.info.seg[0].a[0], nz = s.info.seg[0].b[1] - s.info.seg[0].a[1];
      m.userData.ang = Math.atan2(nx, nz) + Math.PI / 2;
    }
    m.userData.last = [s.pos[0], s.pos[1]];
    m.rotation.y = m.userData.ang;
    m.userData.disc.rotation.z = -t * 18;
    m.userData.blur.rotation.z = -t * 5;
    // iskre ob stiku z vodili
    m.userData.sparkT -= dt;
    if (m.userData.sparkT <= 0 && dt > 0 && ctx.near(s.pos[0], s.pos[1], 14)) {
      m.userData.sparkT = reduced ? 0.25 : 0.06;
      fx.spark(s.pos[0], gyv + 0.03, s.pos[1], '#ffb060', 2, 2.2, 0.35, 3);
    }
  });
  o.wasps.forEach((m, k) => {
    const s = w.wasps[k];
    const y = groundBelow(w, s.pos[0], s.pos[1]);
    const ny = (Number.isFinite(y) ? y : w.ball.y - w.R) + 0.45 + Math.sin(t * 6 + k) * 0.06;
    const last = m.userData.last;
    const dx = s.pos[0] - last.x, dz = s.pos[1] - last.z;
    if (dx * dx + dz * dz > 1e-6) m.rotation.y = Math.atan2(dx, dz);
    last.set(s.pos[0], ny, s.pos[1]);
    m.position.copy(last);
    m.userData.wings.forEach((wg, j) => { wg.rotation.z = Math.sin(t * 62) * 0.75 * (j ? -1 : 1); });
  });
  o.bullies.forEach((m, k) => {
    const b = w.bullies[k];
    m.visible = b.deadT <= 0 || b.y > w.killY;
    m.position.set(b.x, b.y, b.z);
    m.userData.face.rotation.y = Math.atan2(w.ball.x - b.x, w.ball.z - b.z);
    const last = m.userData.last;
    if (last && dt > 0) {
      const v = Math.hypot(b.x - last[0], b.z - last[1]) / dt;
      // kotaljenje
      if (v > 0.05) { m.userData.sph.rotation.x += (b.z - last[1]) / b.r; m.userData.sph.rotation.z -= (b.x - last[0]) / b.r; }
      m.userData.dustT -= dt;
      if (v > 4 && m.userData.dustT <= 0 && Math.abs(b.y - b.r - groundBelow(w, b.x, b.z)) < 0.1) {
        m.userData.dustT = reduced ? 0.3 : 0.08;
        fx.puff(b.x, b.y - b.r + 0.05, b.z, '#c8b8a8', 2, 1, 0.6, 0.3);
      }
    }
    m.userData.last = [b.x, b.z];
  });
  o.vacuums.forEach(m => {
    const { v, pts, y } = m.userData;
    const dir = v.dir || [0, 1];
    const pos = pts.geometry.attributes.position;
    const n = pos.count;
    for (let k = 0; k < n; k++) {
      const u = 1 - ((k / n + t * 0.6) % 1);
      const a = k * 2.4;
      const spread = u * (v.range || 4) * Math.tan((v.angle || 35) * Math.PI / 180) * 0.6;
      const px = -dir[1], pz = dir[0];
      pos.setXYZ(k, v.x + dir[0] * u * (v.range || 4) + px * Math.cos(a) * spread, y + Math.sin(a) * 0.3, v.z + dir[1] * u * (v.range || 4) + pz * Math.cos(a) * spread);
    }
    pos.needsUpdate = true;
  });
  o.magnets.forEach(m => {
    const st = magnetState(w, m.userData.mg);
    const blink = st.warn && Math.sin(t * 30) > 0;
    const push = m.userData.mg.mode === 'push';
    m.userData.uMat.emissiveIntensity = st.on ? 0.9 + 0.3 * Math.sin(t * 12) : blink ? 0.7 : 0;
    if (blink) m.userData.uMat.emissive.set('#ffffff'); else m.userData.uMat.emissive.set(push ? '#4de1ff' : '#ff3b5c');
    m.userData.fieldMat.opacity = st.on ? 0.55 : blink ? 0.3 : 0;
    // valovanje: privlak se krči proti magnetu, odboj širi
    const ph = (t * 0.9) % 1, s1 = push ? 0.4 + ph * 0.6 : 1 - ph * 0.6, s2 = push ? 0.4 + ((ph + 0.5) % 1) * 0.6 : 1 - ((ph + 0.5) % 1) * 0.6;
    m.userData.field.scale.set(s1, 1, s1); m.userData.field2.scale.set(s2, 1, s2);
    m.rotation.y = t * (st.on ? 3 : 0.5);
  });
}
