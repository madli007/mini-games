/* =====================================================================
   HRČKOVA KROGLA — render/materials.js: PBR materiali in razširitve
   shaderjev (dither prosojnost ovir med kamero in kroglo, plapolanje blaga).
   ===================================================================== */
import * as THREE from 'three';
import { surface } from './textures.js';

/** Skupne uniforme za »dither fade« (posodobi jih Renderer vsako sličico). */
export const FADE = {
  uBallScr: { value: new THREE.Vector2(-9999, -9999) },
  uBallDist: { value: 0 },
  uFadeR: { value: 0 },
};

const FADE_FRAG_HEAD = /* glsl */`
uniform vec2 uBallScr; uniform float uBallDist; uniform float uFadeR;
`;
const FADE_FRAG = /* glsl */`
{
  float rr = length(gl_FragCoord.xy - uBallScr);
  if (uFadeR > 0.0 && rr < uFadeR && vViewPosition.z < uBallDist - 0.55) {
    float f = 1.0 - smoothstep(uFadeR * 0.55, uFadeR, rr);
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (ign < f * 0.8) discard;
  }
}
`;

/** Doda materialu dither prosojnost, kadar je med kamero in kroglo. */
export function withFade(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, FADE);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', FADE_FRAG_HEAD + 'void main() {')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FADE_FRAG);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|fade';
  return mat;
}

/** PBR material podlage iz proceduralne teksture. */
export function surfaceMaterial(kind, { color = '#ffffff', repeat = 1, physical = false, fade = false, vertexColors = false, emissive = null, emissiveIntensity = 1, envMapIntensity = 1, normalScale = 1, extra = {} } = {}) {
  const s = surface(kind);
  const P = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new P({
    color, map: s.map, normalMap: s.normalMap, roughnessMap: s.ormMap, metalnessMap: s.ormMap,
    roughness: 1, metalness: 1, vertexColors, envMapIntensity,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    ...extra,
  });
  if (s.emissiveMap && emissive) { m.emissiveMap = s.emissiveMap; m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveIntensity; }
  if (repeat !== 1) m.userData.repeat = repeat;
  return fade ? withFade(m) : m;
}

/** Plapolanje blaga (vertex shader); uTime posodablja Renderer. */
export const WAVE = { uTime: { value: 0 } };
export function withWave(mat, amp = 0.05) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = WAVE.uTime;
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uTime;\nvoid main() {')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float k = clamp(position.x + 0.25, 0.0, 1.0);
        transformed.z += sin(position.x * 11.0 - uTime * 7.0 + position.y * 4.0) * ${amp.toFixed(3)} * k * 1.6;
        transformed.y += sin(position.x * 7.0 - uTime * 5.0) * ${(amp * 0.35).toFixed(3)} * k;`);
  };
  mat.customProgramCacheKey = () => 'wave' + amp;
  return mat;
}

/** Emisivni HDR material (za bloom): barva × jakost > 1. */
export function glow(color, intensity = 2, opts = {}) {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c, toneMapped: true, ...opts });
}

/** Dispose materiala (teksture iz predpomnilnika ostanejo). */
export function disposeMaterial(m) {
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'clearcoatNormalMap']) {
    const t = m[k];
    if (t && !t.userData?.cached) t.dispose();
  }
  m.dispose();
}
