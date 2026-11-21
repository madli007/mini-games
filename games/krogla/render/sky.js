/* =====================================================================
   HRČKOVA KROGLA — render/sky.js: proceduralno nebo (gradient, sonce,
   FBM oblaki, morje oblakov pod progami, zvezde, posebnosti teme) in
   okolje za odseve (IBL) iz istega neba prek PMREMGenerator.
   ===================================================================== */
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;   // vedno na daljni ravnini
}`;

const FRAG = /* glsl */`
uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor;
uniform float uClouds, uStars, uBokeh, uSea, uSynth, uLava, uSmoke, uTime, uEnv;
varying vec3 vDir;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float sunD = max(dot(d, uSunDir), 0.0);
  // osnovni gradient
  vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(smoothstep(0.0, 1.0, h), 0.55)) : mix(uHorizon, uGround, smoothstep(0.0, -0.35, h));
  // sij okoli sonca (atmosfera)
  col += uSunColor * (pow(sunD, 6.0) * 0.35 + pow(sunD, 48.0) * 0.5);
  // oblaki na nebu
  if (uClouds > 0.0 && h > -0.02) {
    vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = fbm(uv * 0.7);
    float c = smoothstep(0.52 - uClouds * 0.2, 0.85, n) * smoothstep(-0.02, 0.18, h) * uClouds;
    vec3 cc = mix(uHorizon * 0.9 + 0.12, vec3(1.0), 0.35) + uSunColor * pow(sunD, 4.0) * 0.7;
    if (uSmoke > 0.0) cc = mix(cc, uZenith * 1.5 + 0.06, 0.6);
    col = mix(col, cc, c * 0.85);
  }
  // zvezde
  if (uStars > 0.0 && h > 0.0) {
    vec2 sp = vec2(atan(d.z, d.x) * 60.0, h * 120.0);
    vec2 ci = floor(sp); vec2 cf = fract(sp) - 0.5;
    float r = h21(ci);
    float star = step(0.965, r) * smoothstep(0.12, 0.0, length(cf)) * (0.6 + 0.4 * sin(uTime * 2.0 + r * 50.0));
    col += vec3(star) * uStars * smoothstep(0.02, 0.3, h) * 2.4;
  }
  // mehke lučke (bokeh) v ozadju
  if (uBokeh > 0.0) {
    vec2 bp = vec2(atan(d.z, d.x) * 5.0, h * 7.0);
    vec2 bi = floor(bp); vec2 bf = fract(bp) - 0.5;
    float r = h21(bi + 3.0);
    vec2 o = vec2(h21(bi + 7.0), h21(bi + 11.0)) - 0.5;
    float b = smoothstep(0.32, 0.22, length(bf - o * 0.35)) * step(0.45, r) * smoothstep(-0.3, 0.05, h) * smoothstep(0.6, 0.15, h);
    col += mix(vec3(1.0, 0.72, 0.4), vec3(1.0, 0.9, 0.7), r) * b * uBokeh * 0.9;
  }
  // morje oblakov pod progami
  if (uSea > 0.0 && h < 0.04) {
    float k = max(-h, 0.0) + 0.035;
    vec2 uv = d.xz / k * 0.22 + vec2(uTime * 0.01, 0.0);
    float n = fbm(uv);
    float c = smoothstep(0.42, 0.75, n) * uSea;
    float lit = 0.75 + 0.25 * smoothstep(0.4, 0.9, fbm(uv * 1.7 + 4.0));
    vec3 cc = mix(uGround, mix(uHorizon, vec3(1.0), 0.6), 0.5) * lit + uSunColor * pow(sunD, 3.0) * 0.35;
    col = mix(col, cc, c * smoothstep(0.04, -0.06, h) * 0.95);
  }
  // sintetski horizont (neon): progasto sonce in mreža
  if (uSynth > 0.0) {
    vec3 sd = normalize(vec3(uSunDir.x, 0.09, uSunDir.z));
    float s = dot(d, sd);
    float disc = smoothstep(0.988, 0.99, s) * step(0.0, h);
    float stripes = step(0.5, fract(h * 60.0 - uTime * 0.2)) + step(0.12, h);
    col += mix(vec3(1.0, 0.2, 0.75), vec3(1.0, 0.75, 0.2), smoothstep(0.0, 0.16, h)) * disc * min(stripes, 1.0) * 1.1 * uSynth;
    if (h < 0.0) {
      vec2 g = d.xz / max(-h, 0.02) * 0.5 + vec2(0.0, uTime * 0.4);
      vec2 gf = abs(fract(g) - 0.5);
      float line = smoothstep(0.03, 0.0, min(gf.x, gf.y) * max(-h, 0.02) * 6.0);
      col += vec3(1.0, 0.25, 0.85) * line * smoothstep(-0.02, -0.4, h) * smoothstep(-0.9, -0.3, h) * 0.5 * uSynth;
    }
  }
  // lava (ognjeni prepad)
  if (uLava > 0.0 && h < 0.0) {
    vec2 uv = d.xz / max(-h, 0.03) * 0.25 + vec2(uTime * 0.02, uTime * 0.01);
    float n = fbm(uv);
    float glow = smoothstep(0.45, 0.75, n) * smoothstep(0.0, -0.25, h);
    col += vec3(2.4, 0.6, 0.12) * glow * uLava;
  }
  // okolje (IBL) brez prevelikih vrednosti
  if (uEnv > 0.5) col = min(col, vec3(6.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function skyMaterial(look, env = false) {
  const s = look.sky;
  const az = s.sun[0] * Math.PI / 180, el = s.sun[1] * Math.PI / 180;
  const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: true,
    uniforms: {
      uZenith: { value: new THREE.Color(s.zenith) }, uHorizon: { value: new THREE.Color(s.horizon) }, uGround: { value: new THREE.Color(s.ground) },
      uSunDir: { value: sunDir }, uSunColor: { value: new THREE.Color(s.sunColor) },
      uClouds: { value: s.clouds || 0 }, uStars: { value: env ? 0 : s.stars || 0 }, uBokeh: { value: s.bokeh || 0 },
      uSea: { value: s.cloudSea || 0 }, uSynth: { value: s.synth || 0 }, uLava: { value: s.lava || 0 }, uSmoke: { value: s.smoke || 0 },
      uTime: { value: 0 }, uEnv: { value: env ? 1 : 0 },
    },
  });
}

export function sunDirection(look) {
  const s = look.sky;
  const az = s.sun[0] * Math.PI / 180, el = Math.max(s.sun[1], 18) * Math.PI / 180;   // svetloba za sence vsaj 18° nad obzorjem
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

/** Kupola neba, ki sledi kameri. */
export function makeSky(look) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), skyMaterial(look));
  m.frustumCulled = false;
  m.renderOrder = -10;
  m.name = 'sky';
  return m;
}

/* ------------------------------------------------------------ okolje za odseve (PMREM), predpomnjeno po lokaciji */

const envCache = new Map();

export function envFor(gl, look) {
  if (envCache.has(look.id)) return envCache.get(look.id).texture;
  const pm = new THREE.PMREMGenerator(gl);
  const sc = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(look, true));
  sc.add(dome);
  // svetle »softbox« plošče za lepe odseve na kovini in steklu
  const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.sky.sunColor).multiplyScalar(2.2), side: THREE.DoubleSide, toneMapped: false });
  const az = look.sky.sun[0] * Math.PI / 180, el = Math.max(14, look.sky.sun[1]) * Math.PI / 180;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), panelMat);
  p.position.set(Math.sin(az) * Math.cos(el) * 40, Math.sin(el) * 40, -Math.cos(az) * Math.cos(el) * 40); p.lookAt(0, 0, 0); sc.add(p);
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.sky.zenith).lerp(new THREE.Color('#ffffff'), 0.5).multiplyScalar(0.9), side: THREE.DoubleSide, toneMapped: false }));
  fill.position.set(0, 38, 8); fill.lookAt(0, 0, 0); sc.add(fill);
  const rt = pm.fromScene(sc, 0.02, 0.1, 200);
  dome.geometry.dispose(); dome.material.dispose(); p.geometry.dispose(); panelMat.dispose(); fill.geometry.dispose(); fill.material.dispose();
  pm.dispose();
  envCache.set(look.id, rt);
  return rt.texture;
}

export const hasEnv = id => envCache.has(id);
export function clearEnvCache() { for (const rt of envCache.values()) rt.dispose(); envCache.clear(); }
