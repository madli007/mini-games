/* =====================================================================
   WebGL izris: miza (brušen aluminij, talina, dinamične luči),
   HDR-ish bloom (večnivojski dual-kawase), končna obdelava.
   ===================================================================== */

const VS = `
attribute vec2 p;
varying vec2 vUV;
void main(){ vUV = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const NOISE = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return v;
}`;

const TABLE_FS = `
precision highp float;
varying vec2 vUV;
uniform sampler2D uArt, uMask, uRaised, uDyn, uEmiS, uEmiD;
uniform float uTime, uGI, uHeat, uEmiK;
uniform vec2 uParFloor, uParTop;
uniform vec4 uBall[6];
uniform vec4 uFl[8];
uniform vec3 uFlC[8];
uniform float uSpecX;
${NOISE}
vec3 melt(vec2 px, float t, float heat){
  float n = fbm(px * 0.045 + vec2(t * 0.15, -t * 0.55));
  n += 0.5 * fbm(px * 0.11 + vec2(-t * 0.35, t * 0.2));
  float v = clamp(n * 0.9 + heat * 0.35 - 0.1, 0.0, 1.2);
  vec3 c = mix(vec3(0.35, 0.03, 0.0), vec3(1.0, 0.32, 0.03), smoothstep(0.15, 0.6, v));
  c = mix(c, vec3(1.0, 0.82, 0.45), smoothstep(0.65, 1.0, v));
  float crust = smoothstep(0.42, 0.38, fbm(px * 0.07 + vec2(0.0, -t * 0.2)));
  c *= 1.0 - crust * 0.55 * (1.0 - heat);
  return c * (1.1 + heat * 0.9);
}
void main(){
  vec2 tp = vec2(vUV.x, 1.0 - vUV.y);
  vec2 px = tp * vec2(600.0, 1000.0);
  vec2 fp = tp + uParFloor;
  vec4 art = texture2D(uArt, fp);
  vec4 mask = texture2D(uMask, fp);
  vec2 fpx = fp * vec2(600.0, 1000.0);

  // brušen aluminij: vzdolžne proge (vzdolž x), anizotropen odsev
  float s1 = noise(vec2(fpx.x * 0.015, fpx.y * 1.9));
  float s2 = noise(vec2(fpx.x * 0.06, fpx.y * 5.3));
  float streak = s1 * 0.6 + s2 * 0.4;
  vec3 metal = vec3(0.46, 0.49, 0.54) * (0.72 + 0.36 * streak);
  float dx = fpx.x - uSpecX;
  float spec = exp(-dx * dx / (2.0 * 70.0 * 70.0)) * (0.35 + 0.65 * streak);
  float spec2 = exp(-pow(fpx.x - uSpecX * 0.6 - 260.0, 2.0) / (2.0 * 25.0 * 25.0)) * s2;
  metal *= 0.55 + spec * 0.9 + spec2 * 0.35;

  // dinamične luči (žogice in bliski) — anizotropno raztegnjene po y
  vec3 dyn = vec3(0.0);
  vec3 ballLight = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    vec4 b = uBall[i];
    if (b.w < 0.5) continue;
    vec2 d = px - b.xy;
    // odsev žogice na kovini in mehak sij okoli nje (zmerno, da ne zaslepi)
    float refl = exp(-d.x * d.x / (2.0 * 6.0 * 6.0) - d.y * d.y / (2.0 * 38.0 * 38.0));
    float glow = exp(-dot(d, d) / (2.0 * 32.0 * 32.0));
    dyn += vec3(0.85, 0.92, 1.0) * refl * (0.5 + 0.5 * streak) * 0.4;
    ballLight += vec3(0.55, 0.65, 0.8) * glow;
  }
  for (int i = 0; i < 8; i++) {
    vec4 f = uFl[i];
    if (f.w <= 0.001) continue;
    vec2 d = px - f.xy;
    float r = f.z;
    float a = exp(-d.x * d.x / (2.0 * r * r * 0.25) - d.y * d.y / (2.0 * r * r * 2.2));
    float g = exp(-dot(d, d) / (2.0 * r * r));
    dyn += uFlC[i] * f.w * (a * (0.4 + 0.6 * streak) * 0.9 + g * 0.35);
  }
  // kovina sije, potisk le malo
  float bare = 1.0 - art.a;
  vec3 floorc = metal * bare + art.rgb;          // art je premultipliciran
  floorc += dyn * (0.25 + 0.75 * bare);
  floorc *= uGI;
  floorc += ballLight * 0.04;

  // talina
  if (mask.g > 0.01) {
    vec3 m = melt(fpx, uTime, uHeat);
    floorc = mix(floorc, m, mask.g);
  }

  // dvignjeni elementi (parallax) + dinamični sloj
  vec4 rz = texture2D(uRaised, tp + uParTop * 0.6);
  vec3 col = rz.rgb * (0.4 + 0.6 * uGI) + floorc * (1.0 - rz.a);
  vec4 dy = texture2D(uDyn, tp + uParTop);
  col = dy.rgb + col * (1.0 - dy.a);
  // luč žogic na bližnjih elementih
  col += (rz.a + dy.a) * col * ballLight * 0.25;
  col += (rz.a * 0.6 + dy.a * 0.4) * dyn * 0.25;
  // emisija
  col += texture2D(uEmiS, tp + uParTop * 0.6).rgb * uGI * uEmiK;
  col += texture2D(uEmiD, tp + uParTop).rgb * uEmiK;
  gl_FragColor = vec4(col, 1.0);
}`;

const BRIGHT_FS = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uScene, uEmiS, uEmiD;
uniform float uThr, uGI;
void main(){
  vec3 c = texture2D(uScene, vUV).rgb;
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 b = c * smoothstep(uThr, 1.0, l) * 0.8;
  vec2 tp = vec2(vUV.x, 1.0 - vUV.y);
  b += texture2D(uEmiS, tp).rgb * uGI * 0.75 + texture2D(uEmiD, tp).rgb * 0.85;
  gl_FragColor = vec4(b, 1.0);
}`;

const DOWN_FS = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main(){
  vec2 h = uTexel;
  vec3 s = texture2D(uSrc, vUV).rgb * 4.0;
  s += texture2D(uSrc, vUV - h).rgb;
  s += texture2D(uSrc, vUV + h).rgb;
  s += texture2D(uSrc, vUV + vec2(h.x, -h.y)).rgb;
  s += texture2D(uSrc, vUV - vec2(h.x, -h.y)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}`;

const UP_FS = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uK;
void main(){
  vec2 h = uTexel;
  vec3 s = texture2D(uSrc, vUV + vec2(-h.x * 2.0, 0.0)).rgb;
  s += texture2D(uSrc, vUV + vec2(-h.x, h.y)).rgb * 2.0;
  s += texture2D(uSrc, vUV + vec2(0.0, h.y * 2.0)).rgb;
  s += texture2D(uSrc, vUV + vec2(h.x, h.y)).rgb * 2.0;
  s += texture2D(uSrc, vUV + vec2(h.x * 2.0, 0.0)).rgb;
  s += texture2D(uSrc, vUV + vec2(h.x, -h.y)).rgb * 2.0;
  s += texture2D(uSrc, vUV + vec2(0.0, -h.y * 2.0)).rgb;
  s += texture2D(uSrc, vUV + vec2(-h.x, -h.y)).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0 * uK, 1.0);
}`;

const FINAL_FS = `
precision highp float;
varying vec2 vUV;
uniform sampler2D uScene, uBloom;
uniform float uBloomK, uZoom, uFade, uCA, uHeatAmt, uTime, uSat, uPersp, uHasBloom, uFlash;
uniform vec2 uZC, uShake, uHeatPos, uRes;
${NOISE}
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = vUV;
  // rahla perspektiva (zgornji del mize je dlje)
  uv.x = 0.5 + (uv.x - 0.5) * (1.0 + uPersp * (uv.y - 0.15));
  uv = (uv - uZC) / uZoom + uZC + uShake;
  // toplotna distorzija nad pečjo
  vec2 tp = vec2(uv.x, 1.0 - uv.y) * vec2(600.0, 1000.0);
  vec2 d = tp - uHeatPos;
  float hm = exp(-d.x * d.x / (2.0 * 34.0 * 34.0)) * smoothstep(30.0, -20.0, d.y) * exp(-max(-d.y, 0.0) / 140.0);
  hm *= uHeatAmt;
  uv += vec2(noise(tp * 0.09 + vec2(0.0, uTime * 3.5)) - 0.5, noise(tp * 0.07 - vec2(uTime * 2.0, 0.0)) - 0.5) * 0.012 * hm;
  vec3 c;
  if (uCA > 0.0) {
    vec2 o = (uv - 0.5) * uCA;
    c = vec3(texture2D(uScene, uv + o).r, texture2D(uScene, uv).g, texture2D(uScene, uv - o).b);
  } else c = texture2D(uScene, uv).rgb;
  if (uHasBloom > 0.5) c += texture2D(uBloom, uv).rgb * uBloomK;
  c += uFlash;
  c = aces(c * 1.3);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  // vinjeta + zrnatost
  vec2 q = vUV - 0.5;
  c *= 1.0 - dot(q, q) * 0.55;
  c += (hash(vUV * uRes + fract(uTime)) - 0.5) * 0.025;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) c *= 0.15;
  gl_FragColor = vec4(c * uFade, 1.0);
}`;

export function createGL(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  } catch (e) { gl = null; }
  if (!gl) return null;

  const fail = [];
  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { fail.push(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  function program(fs) {
    const p = gl.createProgram();
    const v = shader(gl.VERTEX_SHADER, VS), f = shader(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { fail.push(gl.getProgramInfoLog(p)); return null; }
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  const P = {
    table: program(TABLE_FS), bright: program(BRIGHT_FS), down: program(DOWN_FS), up: program(UP_FS), final: program(FINAL_FS),
  };
  if (Object.values(P).some(x => !x)) {
    console.warn('WebGL shader napaka, preklop na 2D:', fail.join('\n'));
    return null;
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function tex() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function upload(t, src) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }
  function fbo(w, h) {
    const t = tex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t, f, w, h };
  }
  function freeFbo(o) { if (!o) return; gl.deleteTexture(o.t); gl.deleteFramebuffer(o.f); }

  const T = { art: tex(), mask: tex(), raised: tex(), emiS: tex(), dyn: tex(), emiD: tex() };
  let scene = null, chain = [], W = 0, H = 0, levels = 0;

  function resize(w, h, bloomLevels) {
    W = w; H = h; levels = bloomLevels;
    canvas.width = w; canvas.height = h;
    freeFbo(scene); chain.forEach(freeFbo); chain = [];
    scene = fbo(w, h);
    let cw = Math.max(1, w >> 1), ch = Math.max(1, h >> 1);
    for (let i = 0; i < levels; i++) {
      chain.push(fbo(cw, ch));
      cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
    }
  }

  function bindTex(unit, t, loc) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, unit); }
  function target(o) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, o ? o.f : null);
    gl.viewport(0, 0, o ? o.w : W, o ? o.h : H);
  }
  const draw = () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  const ballArr = new Float32Array(24), flArr = new Float32Array(32), flcArr = new Float32Array(24);

  function frame(S) {
    gl.disable(gl.BLEND);
    // 1) miza → scene
    target(scene);
    const pt = P.table; gl.useProgram(pt.p);
    bindTex(0, T.art, pt.u.uArt); bindTex(1, T.mask, pt.u.uMask); bindTex(2, T.raised, pt.u.uRaised);
    bindTex(3, T.dyn, pt.u.uDyn); bindTex(4, T.emiS, pt.u.uEmiS); bindTex(5, T.emiD, pt.u.uEmiD);
    gl.uniform1f(pt.u.uTime, S.time); gl.uniform1f(pt.u.uGI, S.gi); gl.uniform1f(pt.u.uHeat, S.heat);
    gl.uniform1f(pt.u.uEmiK, S.emiK);
    gl.uniform2f(pt.u.uParFloor, S.parFloor[0], S.parFloor[1]); gl.uniform2f(pt.u.uParTop, S.parTop[0], S.parTop[1]);
    gl.uniform1f(pt.u.uSpecX, S.specX);
    ballArr.fill(0);
    S.balls.slice(0, 6).forEach((b, i) => { ballArr[i * 4] = b.x; ballArr[i * 4 + 1] = b.y; ballArr[i * 4 + 2] = b.layer; ballArr[i * 4 + 3] = 1; });
    gl.uniform4fv(pt.u.uBall, ballArr);
    flArr.fill(0); flcArr.fill(0);
    S.flashes.slice(0, 8).forEach((f, i) => {
      flArr[i * 4] = f.x; flArr[i * 4 + 1] = f.y; flArr[i * 4 + 2] = f.r; flArr[i * 4 + 3] = f.i;
      flcArr[i * 3] = f.c[0]; flcArr[i * 3 + 1] = f.c[1]; flcArr[i * 3 + 2] = f.c[2];
    });
    gl.uniform4fv(pt.u.uFl, flArr); gl.uniform3fv(pt.u.uFlC, flcArr);
    draw();

    // 2) bloom
    const hasBloom = levels > 0;
    if (hasBloom) {
      target(chain[0]);
      const pb = P.bright; gl.useProgram(pb.p);
      bindTex(0, scene.t, pb.u.uScene); bindTex(1, T.emiS, pb.u.uEmiS); bindTex(2, T.emiD, pb.u.uEmiD);
      gl.uniform1f(pb.u.uThr, S.bloomThr); gl.uniform1f(pb.u.uGI, S.gi);
      draw();
      const pd = P.down; gl.useProgram(pd.p);
      for (let i = 1; i < chain.length; i++) {
        target(chain[i]);
        bindTex(0, chain[i - 1].t, pd.u.uSrc);
        gl.uniform2f(pd.u.uTexel, 1 / chain[i - 1].w, 1 / chain[i - 1].h);
        draw();
      }
      const pu = P.up; gl.useProgram(pu.p);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = chain.length - 1; i > 0; i--) {
        target(chain[i - 1]);
        bindTex(0, chain[i].t, pu.u.uSrc);
        gl.uniform2f(pu.u.uTexel, 1 / chain[i].w, 1 / chain[i].h);
        gl.uniform1f(pu.u.uK, 1.0);
        draw();
      }
      gl.disable(gl.BLEND);
    }

    // 3) končna obdelava → zaslon
    target(null);
    const pf = P.final; gl.useProgram(pf.p);
    bindTex(0, scene.t, pf.u.uScene);
    bindTex(1, hasBloom ? chain[0].t : scene.t, pf.u.uBloom);
    gl.uniform1f(pf.u.uHasBloom, hasBloom ? 1 : 0);
    gl.uniform1f(pf.u.uBloomK, S.bloomK);
    gl.uniform1f(pf.u.uZoom, S.zoom);
    gl.uniform2f(pf.u.uZC, S.zc[0], S.zc[1]);
    gl.uniform2f(pf.u.uShake, S.shake[0], S.shake[1]);
    gl.uniform1f(pf.u.uFade, S.fade);
    gl.uniform1f(pf.u.uCA, S.ca);
    gl.uniform1f(pf.u.uHeatAmt, S.heatAmt);
    gl.uniform2f(pf.u.uHeatPos, S.heatPos[0], S.heatPos[1]);
    gl.uniform1f(pf.u.uTime, S.time);
    gl.uniform1f(pf.u.uSat, S.sat);
    gl.uniform1f(pf.u.uPersp, S.persp);
    gl.uniform1f(pf.u.uFlash, S.flash);
    gl.uniform2f(pf.u.uRes, W, H);
    draw();
  }

  return {
    gl, resize, frame,
    uploadStatic(src) { upload(T.art, src.floor); upload(T.mask, src.mask); upload(T.raised, src.raised); upload(T.emiS, src.emis); },
    uploadDynamic(dyn, emi) { upload(T.dyn, dyn); upload(T.emiD, emi); },
    get lost() { return gl.isContextLost(); },
  };
}
