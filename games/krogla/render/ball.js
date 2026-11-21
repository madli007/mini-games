/* =====================================================================
   HRČKOVA KROGLA — render/ball.js: steklena krogla in hrček.
   Krogla: prava transmisija (ultra/visoka) ali lažno Fresnel steklo
   (srednja/nizka), šiv, loputa in luknjice za zrak, vzorec iz skina.
   Hrček: zaobljene oblike, krzno s »shell texturing« (instancirane lupine
   v enem klicu), sijoče oči, rožnata ušesa, brki; tek, panika, veselje.
   ===================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glassScratches, furNoise, ballPattern } from './textures.js';

/* ------------------------------------------------------------ steklo */

/** Lažno steklo: robovi (Fresnel) bolj neprosojni in odsevni kot sredina. */
function fresnelGlass(opts, edge = 0.85, power = 2.6) {
  const m = new THREE.MeshPhysicalMaterial(opts);
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float frs = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), ${power.toFixed(2)});
      outgoingLight += vec3(frs) * 0.12;
      #include <opaque_fragment>
      gl_FragColor.a = mix(gl_FragColor.a, ${edge.toFixed(2)}, frs);`);
  };
  m.customProgramCacheKey = () => 'fresnel' + edge + power;
  return m;
}

export function glassMaterial(skin, real) {
  const tint = new THREE.Color(skin.glass || '#bfeaff');
  const rough = (skin.roughness ?? 0.03) / 0.031;
  const common = {
    color: tint.clone().lerp(new THREE.Color('#ffffff'), 0.35),
    roughness: rough, roughnessMap: glassScratches(), metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3, ior: 1.5, specularIntensity: 1,
  };
  if (real) {
    return new THREE.MeshPhysicalMaterial({
      ...common,
      transmission: Math.max(0.55, 1 - (skin.opacity ?? 0.28) * 0.7), thickness: 0.05,
      attenuationColor: new THREE.Color(skin.tint || skin.glass || '#bfeaff'), attenuationDistance: 0.9,
    });
  }
  return fresnelGlass({ ...common, transparent: true, opacity: Math.max(0.06, (skin.opacity ?? 0.28) * 0.55), depthWrite: false });
}

/* ------------------------------------------------------------ krzno (shell texturing) */

function furMaterial(shells, len) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.6 });
  const tex = furNoise();
  m.onBeforeCompile = sh => {
    sh.uniforms.uFurTex = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'varying float vLayer; varying vec2 vFurUv;\nvoid main() {')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float layer = float(gl_InstanceID) / ${shells.toFixed(1)};
        transformed += normal * layer * ${len.toFixed(4)};
        transformed.y -= layer * layer * ${(len * 0.25).toFixed(4)};
        vLayer = layer; vFurUv = uv;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform sampler2D uFurTex; varying float vLayer; varying vec2 vFurUv;\nvoid main() {')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vLayer > 0.0) {
          vec2 fu = vFurUv * vec2(56.0, 28.0);
          float n = texture2D(uFurTex, fu).r;
          if (n < vLayer * 0.92 + 0.08) discard;
        }
        diffuseColor.rgb *= mix(0.78, 1.18, vLayer);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 2.5) * 0.35;`);
  };
  m.customProgramCacheKey = () => 'fur' + shells + len;
  return m;
}

function colored(geo, color) {
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const sph = (r, ws = 28, hs = 20) => new THREE.SphereGeometry(r, ws, hs);
const place = (g, [x, y, z], [sx, sy, sz] = [1, 1, 1]) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));

function furMesh(parts, shells, len) {
  const geo = mergeGeometries(parts.map(([g, c]) => colored(g, c)));
  parts.forEach(([g]) => g.dispose());
  const m = new THREE.InstancedMesh(geo, furMaterial(shells, len), shells + 1);
  const I = new THREE.Matrix4();
  for (let k = 0; k <= shells; k++) m.setMatrixAt(k, I);
  m.castShadow = true;
  m.frustumCulled = false;
  return m;
}

/* ------------------------------------------------------------ hrček */

function emojiRider(emoji) {
  const px = 128;
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  g.font = `${px * 0.78}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, px / 2, px / 2 + px * 0.05);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  // neprosojen (alphaTest), da ga prava transmisija stekla vidi
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, alphaTest: 0.5, transparent: false }));
  sp.scale.set(0.46, 0.46, 1);
  const grp = new THREE.Group(); grp.add(sp);
  grp.userData = { legs: [], emoji: true, step: 0 };
  return grp;
}

export function makeHamster(skin, shells) {
  if (skin.rider && skin.rider !== 'hamster') return emojiRider(skin.rider);
  const fur = skin.fur || '#e8a25a';
  const cream = new THREE.Color(fur).lerp(new THREE.Color('#fff8ee'), 0.88).getStyle();
  const len = 0.022;
  const g = new THREE.Group();
  const bodyG = new THREE.Group(); g.add(bodyG);
  const body = furMesh([
    [place(sph(0.15), [0, -0.045, -0.01], [1, 0.86, 1.2]), fur],
    [place(sph(0.115), [0, -0.075, 0.04], [0.92, 0.74, 1.05]), cream],
    [place(sph(0.03, 10, 8), [0, -0.03, -0.185]), fur],   // rep
  ], shells, len);
  bodyG.add(body);
  // glava (ločena skupina za obrat proti smeri)
  const head = new THREE.Group(); head.position.set(0, 0.05, 0.14); bodyG.add(head);
  const headFur = furMesh([
    [place(sph(0.105), [0, 0, 0.01], [1, 0.94, 0.95]), fur],
    [place(sph(0.05, 16, 12), [0.064, -0.028, 0.06]), cream],
    [place(sph(0.05, 16, 12), [-0.064, -0.028, 0.06]), cream],
    [place(sph(0.04, 14, 10), [0, -0.035, 0.085], [1, 0.8, 1]), cream],
  ], shells, len * 0.8);
  head.add(headFur);
  const pink = new THREE.MeshPhysicalMaterial({ color: '#ff9fb2', roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#ffd0dc'), sheenRoughness: 0.5, emissive: '#ff5f86', emissiveIntensity: 0.18 });
  const earMat = new THREE.MeshPhysicalMaterial({ color: '#ffb0c0', roughness: 0.6, sheen: 1, sheenColor: new THREE.Color('#ffe0ea'), emissive: '#ff6a8a', emissiveIntensity: 0.35, side: THREE.DoubleSide });
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: '#0c0610', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2 });
  const hiMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.6) });
  // ušesa, oči, odsevi in tačke: združene mreže (manj klicev izrisa)
  const M = (p, e, sc) => new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...e)), new THREE.Vector3(...sc));
  const geoAt = (g0, m) => g0.applyMatrix4(m);
  const outerParts = [], innerParts = [];
  for (const s of [1, -1]) {
    const em = M([0.062 * s, 0.085, -0.015], [-0.2, 0, -0.35 * s], [1, 1, 1]);
    outerParts.push(geoAt(sph(0.036, 16, 12), em.clone().multiply(M([0, 0, 0], [0, 0, 0], [1, 1.05, 0.42]))));
    innerParts.push(geoAt(sph(0.027, 14, 10), em.clone().multiply(M([0, 0, 0.009], [0, 0, 0], [1, 1, 0.3]))));
  }
  const earOuter = new THREE.Mesh(mergeGeometries(outerParts), new THREE.MeshStandardMaterial({ color: fur, roughness: 0.9 }));
  const earInner = new THREE.Mesh(mergeGeometries(innerParts), earMat);
  outerParts.concat(innerParts).forEach(x => x.dispose());
  head.add(earOuter, earInner);
  const eyes = new THREE.Group(); eyes.position.set(0, 0.022, 0.082); head.add(eyes);
  const eyeParts = [1, -1].map(s => sph(0.021, 18, 14).translate(0.046 * s, 0, 0));
  const hiParts = [1, -1].map(s => sph(0.006, 8, 6).translate(0.046 * s + 0.007 * s * 0.4 - 0.004, 0.008, 0.017));
  eyes.add(new THREE.Mesh(mergeGeometries(eyeParts), eyeMat), new THREE.Mesh(mergeGeometries(hiParts), hiMat));
  eyeParts.concat(hiParts).forEach(x => x.dispose());
  const nose = new THREE.Mesh(sph(0.014, 12, 10), pink); nose.position.set(0, -0.012, 0.118); nose.scale.set(1.2, 0.8, 0.9); head.add(nose);
  // brki
  const wp = [];
  for (const s of [1, -1]) for (const k of [-1, 0, 1]) wp.push(0.03 * s, -0.02, 0.105, 0.11 * s, -0.02 + k * 0.022, 0.09 + k * 0.006);
  const whiskers = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)), new THREE.LineBasicMaterial({ color: '#f4ece4', transparent: true, opacity: 0.8 }));
  head.add(whiskers);
  // tačke v parih (diagonalni kas)
  const legAt = ([x, y, z]) => sph(0.032, 12, 10).scale(1, 0.7, 1.3).translate(x, y, z);
  const legs = [[[0.075, -0.15, 0.09], [-0.08, -0.165, -0.08]], [[-0.075, -0.15, 0.09], [0.08, -0.165, -0.08]]].map(pair => {
    const parts = pair.map(legAt);
    const l = new THREE.Mesh(mergeGeometries(parts), pink); parts.forEach(x => x.dispose());
    l.userData.base = new THREE.Vector3();
    bodyG.add(l); return l;
  });
  // sence mečeta le krzno telesa in glave (dovolj za obris, manj klicev)
  body.castShadow = headFur.castShadow = true;
  const ears = [];
  g.userData = { legs, head, ears, eyes: [eyes], bodyG, mood: 0, look: 0, step: 0 };
  return g;
}

/* ------------------------------------------------------------ krogla */

export function makeBall(skin, R, q, { ghost = false, ghostColor = '#ffffff' } = {}) {
  const root = new THREE.Group();
  const roll = new THREE.Group();
  root.add(roll);
  let glass;
  if (ghost) {
    const c = new THREE.Color(ghostColor);
    glass = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), fresnelGlass({ color: c, emissive: c, emissiveIntensity: 0.9, transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.2 }, 0.9, 1.8));
  } else {
    glass = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), glassMaterial(skin, q.glass === 'real'));
  }
  glass.renderOrder = 3;
  roll.add(glass);
  // šiv (obroč, kjer se polovici krogle stakneta) — vidno kotaljenje
  const rimC = new THREE.Color(ghost ? ghostColor : skin.rim || '#ffffff');
  const rimMat = ghost
    ? new THREE.MeshBasicMaterial({ color: rimC.clone().multiplyScalar(1.2), transparent: true, opacity: 0.45, depthWrite: false })
    : new THREE.MeshPhysicalMaterial({ color: rimC, roughness: 0.25, clearcoat: 1, transparent: q.glass !== 'real', opacity: 0.85 });
  if (ghost) roll.add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.002, R * 0.035, 8, 64), rimMat));
  else {
    // šiv, drugi obroč in loputa na polu: ena mreža
    const parts = [
      new THREE.TorusGeometry(R * 1.002, R * 0.035, 8, 64),
      new THREE.TorusGeometry(R * 1.001, R * 0.014, 6, 64).rotateY(Math.PI / 2),
      new THREE.TorusGeometry(R * 0.38, R * 0.03, 8, 40).rotateX(Math.PI / 2).translate(0, R * 0.925, 0),
    ];
    roll.add(new THREE.Mesh(mergeGeometries(parts), rimMat)); parts.forEach(p => p.dispose());
  }
  if (!ghost) {
    // luknjice za zrak (instancirano)
    const holes = [];
    for (const lat of [0.42, -0.42, 0.78, -0.78]) {
      const n = Math.abs(lat) > 0.6 ? 8 : 12;
      for (let k = 0; k < n; k++) holes.push([lat, (k + (lat > 0 ? 0 : 0.5)) / n * Math.PI * 2]);
    }
    const hole = new THREE.InstancedMesh(new THREE.CircleGeometry(R * 0.03, 10), new THREE.MeshBasicMaterial({ color: '#2a3038', transparent: true, opacity: 0.3, depthWrite: false }), holes.length);
    const mtx = new THREE.Matrix4(), qn = new THREE.Quaternion(), p = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1);
    holes.forEach(([lat, lon], i) => {
      p.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).multiplyScalar(R * 1.004);
      qn.setFromUnitVectors(z, p.clone().normalize());
      hole.setMatrixAt(i, mtx.compose(p, qn, one));
    });
    hole.renderOrder = 4;
    roll.add(hole);
    if (skin.pattern && skin.pattern !== 'none') {
      const pat = new THREE.Mesh(new THREE.SphereGeometry(R * 1.003, 40, 24), new THREE.MeshStandardMaterial({ color: skin.rim || '#ffffff', alphaMap: ballPattern(skin.pattern), transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.3 }));
      pat.renderOrder = 4; roll.add(pat);
    }
  }
  let rider = null;
  if (!ghost) {
    rider = makeHamster(skin, q.furShells);
    // hrček se skalira s polmerom (dnevni dodatek »mala krogla«), da ne gleda iz stekla
    const k = R / 0.32; rider.scale.setScalar(k); rider.userData.k = k;
    rider.position.y = -0.08 * k; root.add(rider);
  }
  root.userData = { roll, rider, glass, step: 0, prevYaw: 0, ghost };
  return root;
}

/**
 * Animacija hrčka: tek v smeri kotaljenja, obrat glave v zavoj, panika ob padcu, veselje na cilju.
 * st: { sp, yaw, dt, t, falling, dead, finished, reduced }
 */
export function animateRider(r, st) {
  const u = r.userData;
  const { sp, dt, t } = st;
  const K = u.k || 1;
  if (u.emoji) { r.rotation.y = st.yaw; r.position.y = K * (-0.08 + (st.finished ? Math.abs(Math.sin(t * 9)) * 0.05 : 0)); return; }
  // zasuk telesa v smer gibanja (gladko)
  let d = st.yaw - r.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  r.rotation.y += d * Math.min(1, dt * 12);
  const turn = Math.max(-0.6, Math.min(0.6, d * 2.2));
  u.look += (turn - u.look) * Math.min(1, dt * 6);
  const panic = st.falling || st.dead;
  const mood = panic ? 1 : st.finished ? 2 : 0;
  u.step += (panic ? 26 : sp * 9) * dt;
  const s = u.step;
  const amp = panic ? 0.06 : Math.min(0.05, sp * 0.02);
  u.bodyG.rotation.x = panic ? -0.5 + Math.sin(t * 30) * 0.08 : Math.min(0.35, sp * 0.045);
  u.bodyG.rotation.z = panic && !st.reduced ? Math.sin(t * 23) * 0.15 : 0;
  r.position.y = K * (-0.08 + (mood === 2 ? Math.abs(Math.sin(t * 9)) * 0.06 : Math.abs(Math.sin(s)) * Math.min(0.035, sp * 0.008)));
  u.head.rotation.y = mood === 2 ? Math.sin(t * 6) * 0.4 : u.look;
  u.head.rotation.x = panic ? -0.35 : mood === 2 ? -0.25 : -Math.min(0.2, sp * 0.02);
  const eyeS = panic ? 1.45 : 1;
  for (const e of u.eyes) e.scale.setScalar(e.scale.x + (eyeS - e.scale.x) * Math.min(1, dt * 10));
  u.ears.forEach((e, k) => { e.rotation.x = panic ? 0.5 : -0.2 + Math.sin(t * 2 + k) * 0.05; });
  u.legs.forEach((l, k) => {
    const ph = s + k * Math.PI;
    l.position.z = l.userData.base.z + Math.sin(ph) * amp;
    l.position.y = l.userData.base.y + Math.max(0, Math.cos(ph)) * amp * 0.6 + (panic && k < 2 ? 0.05 : 0);
  });
}
