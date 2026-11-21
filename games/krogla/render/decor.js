/* =====================================================================
   HRČKOVA KROGLA — render/decor.js: okras okolice (ne vpliva na fiziko in
   ne zakriva poti): lebdeči otočki, oblaki, ptice/metulji, kresnice, sneg,
   para, iskre, neonska mreža, industrijski stebri. Vse proceduralno,
   determinističen razpored, skalirano po kakovosti.
   ===================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cloudPuff } from './textures.js';
import { ambient } from './fx.js';

/** Billboard (vedno obrnjen h kameri) za instancirane ploskve — 1 klic za vse oblake. */
function billboard(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float bs = length(instanceMatrix[0].xyz);
      mvPosition.xy += position.xy * vec2(bs, length(instanceMatrix[1].xyz));
      gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'billboard';
  return mat;
}

export function buildDecor({ L, w, look, q, parent }) {
  const out = { items: [], update: null };
  const [W, D] = L.size;
  const g = w.g;
  let s = 1234 + W * 31 + D;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const k = q.decor;
  const minY = g.minH, maxY = g.maxH;
  const has = id => look.decor.includes(id);
  const upd = [];
  // izven proge: točka ne sme biti nad ploščico ali tik ob njej (da okras ne zakrije poti)
  const free = (x, z, y) => {
    if (y < minY - 3) return true;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const c = Math.floor(x) + dx, r = Math.floor(z) + dz;
      if (c >= 0 && r >= 0 && c < g.W && r < g.D && g.type[r * g.W + c]) return false;
    }
    return true;
  };
  const farFromTrack = (x, z, R) => {
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const c = Math.floor(x) + dx, r = Math.floor(z) + dz;
      if (c >= 0 && r >= 0 && c < g.W && r < g.D && g.type[r * g.W + c]) return false;
    }
    return true;
  };
  const place = (yMin, yMax, margin = 10) => {
    for (let tries = 0; tries < 30; tries++) {
      const x = -margin + rnd() * (W + margin * 2), z = -margin + rnd() * (D + margin * 2), y = yMin + rnd() * (yMax - yMin);
      if (free(x, z, y)) return [x, y, z];
    }
    return [-margin - 5, yMin, -margin];
  };

  /* -------------------- lebdeči otočki (skala + zgornja plast, ena mreža) */
  if (has('islands')) {
    const n = Math.round(9 * k) + 2;
    const rock = new THREE.IcosahedronGeometry(1, 1);
    const p = rock.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const f = y > 0.2 ? 0.35 : 1 + (-y) * 0.9;
      p.setXYZ(i, p.getX(i) * (y > 0.2 ? 1.05 : 0.95), y > 0.2 ? 0.35 : y * f - 0.15, p.getZ(i) * (y > 0.2 ? 1.05 : 0.95));
    }
    rock.computeVertexNormals();
    const topC = { garden: '#6fb84a', kitchen: '#e8c79a', tower: '#9a8ad8', crystal: '#cfeaf8', sky: '#ffffff' }[look.id] || '#8a9a7a';
    const cols = new Float32Array(p.count * 3), cTop = new THREE.Color(topC), cRock = new THREE.Color(look.id === 'sky' ? '#b8b0d8' : '#7a6a5a');
    for (let i = 0; i < p.count; i++) { const c = p.getY(i) > 0.3 ? cTop : cRock; cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
    rock.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const im = new THREE.InstancedMesh(rock, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), n);
    const base = [];
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = place(minY - 14, maxY + 3, 14);
      const size = 0.8 + rnd() * 2.6;
      base.push({ x, y, z, size, rot: rnd() * 6, ph: rnd() * 6 });
    }
    const setAll = t => base.forEach((b, i) => im.setMatrixAt(i, m4.compose(v.set(b.x, b.y + Math.sin(t * 0.4 + b.ph) * 0.25, b.z), qq.setFromAxisAngle(up, b.rot + t * 0.02), sc.set(b.size, b.size * 0.8, b.size))));
    setAll(0);
    im.receiveShadow = false;
    parent.add(im); out.items.push(im);
    upd.push(t => { setAll(t); im.instanceMatrix.needsUpdate = true; });
  }

  /* -------------------- oblaki: billboard kosmi pod in okoli prog */
  if (has('clouds')) {
    const n = Math.round(40 * k) + 6;
    const sea = look.sky.cloudSea || 0;
    const mat = billboard(new THREE.MeshBasicMaterial({ map: cloudPuff(), transparent: true, depthWrite: false, color: '#ffffff' }));
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, n);
    const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), sc = new THREE.Vector3(), qq = new THREE.Quaternion();
    const tint = new THREE.Color(look.sky.horizon).lerp(new THREE.Color('#ffffff'), 0.45).lerp(new THREE.Color(look.sky.ground), 0.15);
    const base = [];
    for (let i = 0; i < n; i++) {
      const low = i < n * (0.55 + sea * 0.3);
      const [x, y, z] = low ? place(minY - 26, minY - 7, 18) : place(minY - 6, maxY + 4, 18);
      const size = (low ? 7 : 3.5) + rnd() * (low ? 9 : 5);
      base.push({ x, y, z, size, sp: 0.1 + rnd() * 0.2 });
      im.setColorAt(i, tint.clone().multiplyScalar(0.85 + rnd() * 0.2));
    }
    const setAll = t => base.forEach((b, i) => im.setMatrixAt(i, m4.compose(v.set(b.x + Math.sin(t * 0.03 * b.sp + i) * 2, b.y, b.z), qq, sc.set(b.size, b.size * 0.55, 1))));
    setAll(0);
    im.renderOrder = -1;
    im.frustumCulled = false;
    parent.add(im); out.items.push(im);
    upd.push(t => { setAll(t); im.instanceMatrix.needsUpdate = true; });
  }

  /* -------------------- ptice (silhuete daleč) in metulji (barviti, ob progi) */
  const flyers = (n, near, colorFn, size) => {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.1, -1, 0, 0, 0, 0, -0.25, 0, 0, 0.1, 0, 0, -0.25, 1, 0, 0], 3));
    wing.computeVertexNormals();
    const im = new THREE.InstancedMesh(wing, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7, emissive: near ? '#402030' : '#000000', emissiveIntensity: 0.3 }), n);
    const base = [];
    for (let i = 0; i < n; i++) {
      const [x, y, z] = near ? [rnd() * W, maxY + 1.5 + rnd() * 2, rnd() * D] : place(minY + 2, maxY + 10, 16);
      base.push({ x, y, z, r: near ? 2 + rnd() * 4 : 6 + rnd() * 12, sp: (near ? 0.4 : 0.15) + rnd() * 0.3, ph: rnd() * 6 });
      im.setColorAt(i, colorFn(i));
    }
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
    const setAll = t => base.forEach((b, i) => {
      const a = t * b.sp + b.ph;
      const flap = Math.sin(t * (near ? 18 : 7) + i) * 0.8;
      qq.setFromEuler(e.set(0, -a, flap * 0.3));
      im.setMatrixAt(i, m4.compose(v.set(b.x + Math.cos(a) * b.r, b.y + Math.sin(a * 2.3) * 0.4, b.z + Math.sin(a) * b.r), qq, sc.set(size, size * (0.4 + Math.abs(flap) * 0.6), size)));
    });
    setAll(0);
    im.frustumCulled = false;
    parent.add(im); out.items.push(im);
    upd.push(t => { setAll(t); im.instanceMatrix.needsUpdate = true; });
  };
  if (has('birds')) flyers(Math.round(10 * k) + 3, false, () => new THREE.Color('#3a3040'), 0.45);
  if (has('butterflies')) { const pal = ['#ffd23f', '#ff7ac8', '#7ad8ff', '#ffffff']; flyers(Math.round(8 * k) + 2, true, i => new THREE.Color(pal[i % pal.length]), 0.12); }

  /* -------------------- ambientni delci */
  const box = (y0, y1, m = 4) => new THREE.Box3(new THREE.Vector3(-m, y0, -m), new THREE.Vector3(W + m, y1, D + m));
  const amb = [];
  if (has('fireflies')) amb.push(ambient(parent, { count: Math.round(70 * k) + 10, box: box(minY - 2, maxY + 3), mode: 0, color: '#ffe68a', size: 0.12, additive: true, intensity: 2.2 }));
  if (has('motes')) amb.push(ambient(parent, { count: Math.round(90 * k) + 10, box: box(minY - 1, maxY + 4), mode: 0, color: look.id === 'neon' ? '#ff6ae0' : '#fff2d8', size: 0.06, additive: true, intensity: look.id === 'neon' ? 2 : 1.2, alpha: 0.7 }));
  if (has('snow')) amb.push(ambient(parent, { count: Math.round(220 * k) + 30, box: box(minY - 4, maxY + 7), mode: 1, color: '#ffffff', size: 0.07, additive: false, alpha: 0.9 }));
  if (has('embers')) amb.push(ambient(parent, { count: Math.round(110 * k) + 15, box: box(minY - 8, maxY + 2, 8), mode: 2, color: '#ff8a3a', size: 0.07, additive: true, intensity: 3 }));
  if (has('steam')) amb.push(ambient(parent, { count: Math.round(40 * k) + 8, box: box(minY - 6, maxY + 1, 6), mode: 2, color: '#e8e4e0', size: 0.9, additive: false, alpha: 0.28 }));
  out.items.push(...amb);
  out.ambient = amb;

  /* -------------------- neonska mreža globoko pod progami */
  if (has('grid')) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color('#ff4fd8').multiplyScalar(0.8) }, uB: { value: new THREE.Color('#4de1ff').multiplyScalar(0.8) }, uC: { value: new THREE.Vector2(W / 2, D / 2) } },
      vertexShader: 'varying vec3 vP; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: `uniform float uTime; uniform vec3 uA, uB; uniform vec2 uC; varying vec3 vP;
        void main(){ vec2 g = vP.xz / 3.0 + vec2(0.0, uTime * 0.3); vec2 f = abs(fract(g) - 0.5); float l = smoothstep(0.035, 0.0, min(f.x, f.y));
          float d = length(vP.xz - cameraPosition.xz); float fade = smoothstep(70.0, 18.0, d) * 0.8;
          vec3 c = mix(uA, uB, 0.5 + 0.5 * sin(vP.x * 0.05 + uTime * 0.2));
          gl_FragColor = vec4(c * l * fade, l * fade * 0.9);
          #include <colorspace_fragment>
        }`,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(220, 220).rotateX(-Math.PI / 2), mat);
    plane.position.set(W / 2, minY - 22, D / 2);
    parent.add(plane); out.items.push(plane);
    upd.push(t => { mat.uniforms.uTime.value = t; });
  }

  /* -------------------- industrijski stebri (tovarna) */
  if (has('chimneys')) {
    const n = Math.round(7 * k) + 3;
    const parts = [];
    const sc = [];
    for (let i = 0; i < n; i++) {
      let x = 0, z = 0;
      for (let tr = 0; tr < 40; tr++) { x = -16 + rnd() * (W + 32); z = -16 + rnd() * (D + 32); if (farFromTrack(x, z, 6)) break; }
      const h = 18 + rnd() * 16, r = 0.6 + rnd() * 1.1;
      const top = minY - 1.5 - rnd() * 4;
      const c = new THREE.CylinderGeometry(r * 0.8, r, h, 12).translate(x, top - h / 2, z);
      parts.push(c);
      sc.push(new THREE.TorusGeometry(r * 0.85, 0.08, 6, 20).rotateX(Math.PI / 2).translate(x, top - 0.6, z));
    }
    const ch = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: '#4a3a34', roughness: 0.85, metalness: 0.3 }));
    const rings = new THREE.Mesh(mergeGeometries(sc), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(2.4) }));
    parts.forEach(p => p.dispose()); sc.forEach(p => p.dispose());
    parent.add(ch, rings); out.items.push(ch, rings);
  }

  out.update = (t, cam) => {
    for (const f of upd) f(t);
    for (const a of amb) a.material.uniforms.uTime.value = t;
  };
  out.setScale = px => { for (const a of amb) a.material.uniforms.uScale.value = px; };
  return out;
}
