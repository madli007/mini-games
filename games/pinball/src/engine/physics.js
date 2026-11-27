/* =====================================================================
   FIZIKA — 2D, fiksni korak, kapsule + krogi, plasti (rampe)
   Splošna za vse mize: vse dobi iz T (engine/table.js). Ohranjen uglašen
   občutek iz prve verzije (flipperji, cradle, trenje).
   Plasti: 0 = igralna površina, 1, 2 … = rampe; segment s layer -1 velja za vse.
   ===================================================================== */
import { BR, MAXV, PHYS as P } from './config.js';

let _cx = 0, _cy = 0, _ct = 0;
function closest(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  _cx = ax + dx * t; _cy = ay + dy * t; _ct = t;
}

// vrne hitrost udarca vzdolž normale (0 = ni bilo udarca)
function resolve(b, nx, ny, pen, e, svx = 0, svy = 0) {
  b.x += nx * pen; b.y += ny * pen;
  let rvx = b.vx - svx, rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const ee = -vn < 60 ? 0 : e;                 // mirovanje brez tresenja
  const jn = -(1 + ee) * vn;
  rvx += jn * nx; rvy += jn * ny;
  // Coulombovo trenje (majhno — žogica se kotali)
  const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;
  const dvt = Math.min(Math.abs(vt), P.friction * jn) * Math.sign(vt);
  rvx -= dvt * tx; rvy -= dvt * ty;
  b.vx = rvx + svx; b.vy = rvy + svy;
  return -vn;
}

const inBox = (x, y, z) => x > z.x1 && x < z.x2 && y > z.y1 && y < z.y2;

/** je žogica dlje od osi rampe, kot dopušča kanal? (samo rampe s path, npr. T.wireform) */
function offPath(b, R) {
  const P = R.path, lim = R.width / 2 + 6;
  let best = Infinity;
  for (let i = 0; i < P.length - 1; i++) {
    closest(b.x, b.y, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]);
    const d2 = (b.x - _cx) ** 2 + (b.y - _cy) ** 2;
    if (d2 < best) best = d2;
  }
  return best > lim * lim;
}

/**
 * @param T miza (engine/table.js)
 * @param H obravnavalci dogodkov: seg(s,b,imp,cx,cy,nx,ny), bumper(c,b), sensor(s,b), layer(b,from,to,why,ramp), flip(f,b,imp),
 *          captive(c,b,imp)
 */
export function createPhysics(T, H) {
  const segs = T.segs, bumpers = T.bumpers, flippers = T.flippers, sensors = T.sensors;
  const ramps = T.ramps, magnets = T.magnets, captives = T.captives, toys = T.toys;

  function collideSeg(b, s) {
    if (!s.active) return;
    if (s.layer !== -1 && s.layer !== b.layer) return;
    const rr = BR + s.r;
    if (b.x + BR < s.minx || b.x - BR > s.maxx || b.y + BR < s.miny || b.y - BR > s.maxy) return;
    closest(b.x, b.y, s.ax, s.ay, s.bx, s.by);
    const dx = b.x - _cx, dy = b.y - _cy, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    if (s.oneWay && ((b.x - s.ax) * s.nx + (b.y - s.ay) * s.ny) < 0) return;
    const d = Math.sqrt(d2);
    if (d < 1e-6) return;
    const nx = dx / d, ny = dy / d, cx = _cx, cy = _cy;
    const imp = resolve(b, nx, ny, rr - d, s.rubber ? s.e * P.rubberK : s.e, s.svx || 0, s.svy || 0);
    if (imp > 0) H.seg(s, b, imp, cx, cy, nx, ny);
  }

  function collideBumper(b, c) {
    if (b.layer !== 0) return;
    const dx = b.x - c.x, dy = b.y - c.y, rr = BR + c.r, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2);
    if (d < 1e-6) return;
    const nx = dx / d, ny = dy / d;
    resolve(b, nx, ny, rr - d, 0.5);
    if (c.cool <= 0) {
      const vn = b.vx * nx + b.vy * ny, kick = P.bumper;
      if (vn < kick) { b.vx += nx * (kick - vn); b.vy += ny * (kick - vn); }
      c.cool = 0.06;
      H.bumper(c, b, nx, ny);
    }
  }

  function updateFlipper(f, dt) {
    const on = f.pressed && f.enabled;
    const target = on ? f.up : f.rest;
    const speed = on ? P.flipUp : P.flipDown;
    const diff = target - f.angle, max = speed * dt;
    const step = diff > max ? max : diff < -max ? -max : diff;
    f.angle += step;
    f.omega = step / dt;
  }

  function collideFlipper(b, f) {
    if (b.layer !== f.layer) return;
    if (Math.abs(b.x - f.px) > f.len + 30 || Math.abs(b.y - f.py) > f.len + 30) return;
    const tx = f.px + Math.cos(f.angle) * f.len, ty = f.py + Math.sin(f.angle) * f.len;
    closest(b.x, b.y, f.px, f.py, tx, ty);
    const rr = BR + f.r1 + (f.r2 - f.r1) * _ct;
    const dx = b.x - _cx, dy = b.y - _cy, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2);
    if (d < 1e-6) return;
    // hitrost površine flipperja v točki stika (ω × r)
    const svx = -f.omega * (_cy - f.py), svy = f.omega * (_cx - f.px);
    const nx = dx / d, ny = dy / d;
    // f3: miren flipper (dvignjen ali spuščen) ima gumo z odbojnostjo, ki pada s hitrostjo udarca:
    // počasna žogica malo odskoči, hitra »umre« (live catch, dead bounce). Udarec s flipperjem v gibanju ostane enak.
    let e = P.flipE;
    if (f.omega === 0) {
      const vn = -((b.vx - svx) * nx + (b.vy - svy) * ny);
      if (vn > 0) e = P.flipEStill / (1 + vn / P.flipFalloff);
    }
    const imp = resolve(b, nx, ny, rr - d, e, svx, svy);
    if (imp > 0 && H.flip) H.flip(f, b, imp);
  }

  function collideBalls(balls) {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.captured) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const c = balls[j];
        if (c.captured || c.layer !== a.layer) continue;
        const dx = a.x - c.x, dy = a.y - c.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * BR * BR || d2 < 1e-9) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = (2 * BR - d) / 2;
        a.x += nx * pen; a.y += ny * pen; c.x -= nx * pen; c.y -= ny * pen;
        const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        if (rel < 0) {
          const j2 = -1.9 * rel / 2;
          a.vx += j2 * nx; a.vy += j2 * ny; c.vx -= j2 * nx; c.vy -= j2 * ny;
        }
      }
    }
  }

  /* ---------- ujeta žogica (captive): drsi le vzdolž svojega kanala ---------- */
  function stepCaptive(c, dt) {
    // gravitacija vzdolž kanala (ux, uy = smer od mirovanja proti koncu)
    c.v += P.grav * c.uy * dt;
    c.v *= 1 - 0.8 * dt;
    c.t += c.v * dt;
    if (c.t < 0) { c.t = 0; if (c.v < 0) c.v = -c.v * 0.3; }
    if (c.t > c.len) {
      c.t = c.len;
      if (c.v > 0) { if (!c.hitEnd && H.captive) H.captive(c, null, c.v); c.hitEnd = true; c.v = -c.v * 0.4; }
    } else if (c.t < c.len - 4) c.hitEnd = false;
    c.x = c.ax + c.ux * c.t; c.y = c.ay + c.uy * c.t;
  }
  function collideCaptive(b, c) {
    if (b.layer !== 0) return;
    const dx = b.x - c.x, dy = b.y - c.y, d2 = dx * dx + dy * dy;
    if (d2 >= 4 * BR * BR || d2 < 1e-9) return;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.x += nx * (2 * BR - d); b.y += ny * (2 * BR - d);
    // hitrost ujete žogice v ravnini
    const cvx = c.ux * c.v, cvy = c.uy * c.v;
    const rel = (b.vx - cvx) * nx + (b.vy - cvy) * ny;
    if (rel >= 0) return;
    // enaki masi; ujeta se giblje le vzdolž kanala (u), zato impulz projiciramo nanjo
    const un = c.ux * nx + c.uy * ny;               // kako »vzdolž kanala« je normala
    const k = 1 + un * un;                          // efektivna masa (1 + projekcija)
    const j = -1.85 * rel / k;
    b.vx += j * nx; b.vy += j * ny;
    c.v -= j * un;
    if (H.captive) H.captive(c, b, -rel);
  }

  /* ---------- magnet: privlak v radiju, zadrži v središču ---------- */
  function applyMagnets(b, dt) {
    for (const m of magnets) {
      if (!m.on || b.layer !== 0) continue;
      const dx = m.x - b.x, dy = m.y - b.y, d = Math.hypot(dx, dy);
      if (d > m.r) continue;
      if (m.hold && d < 6) {
        // zgrabi: žogica obmiruje na sredini, dokler je magnet prižgan
        b.x = m.x; b.y = m.y; b.vx = 0; b.vy = 0; m.held = b.id;
        continue;
      }
      const f = m.force * (1 - d / m.r * 0.6) / Math.max(8, d);
      b.vx += dx * f * dt; b.vy += dy * f * dt;
      if (m.hold) { b.vx *= 1 - 6 * dt; b.vy *= 1 - 6 * dt; }
    }
  }

  function checkSensors(b) {
    for (const s of sensors) {
      if (s.layer !== b.layer) { s.inside.delete(b.id); continue; }
      const inside = (b.x - s.x) ** 2 + (b.y - s.y) ** 2 < s.r * s.r;
      const was = s.inside.has(b.id);
      if (inside && !was) { s.inside.add(b.id); H.sensor(s, b); }
      else if (!inside && was) s.inside.delete(b.id);
    }
  }

  /*
   * prehodi med plastmi (rampe). Vsaka rampa (engine/table.js → ramp):
   *  entry  { y, x1, x2 }      žogica prečka črto y navzgor med x1 in x2 → vstopi na plast rampe
   *  fail   { y, x1, x2 }      na rampi prečka isto črto navzdol → pade nazaj (prešibek strel, zavrnitev)
   *  exit   { y, x1, x2, dir } doseže izhod → nazaj na igralno površino ('down' = y ≥, 'up' = y ≤)
   *  bounds { x1, x2, y1, y2 } varovalo: zunaj okvira žogica ne more biti na rampi
   */
  function checkLayers(b, py) {
    if (b.layer === 0) {
      for (let i = 0; i < ramps.length; i++) {
        const R = ramps[i], E = R.entry;
        if (py >= E.y && b.y < E.y && b.x > E.x1 && b.x < E.x2) {
          b.layer = R.layer; b.ramp = i; H.layer(b, 0, R.layer, 'enter', R);
          return;
        }
      }
    } else {
      const R = ramps[b.ramp];
      if (!R) { b.layer = 0; return; }
      const F = R.fail, X = R.exit, B = R.bounds;
      if (R.path && offPath(b, R)) {
        // rampa po poti: žogica ne more biti izven kanala (npr. vstop na robu okna) → nazaj na površino
        b.layer = 0; H.layer(b, R.layer, 0, 'fail', R);
      } else if (b.y >= F.y && py < F.y && b.x > F.x1 && b.x < F.x2) {
        b.layer = 0; H.layer(b, R.layer, 0, 'fail', R);
      } else if ((X.dir === 'up' ? b.y <= X.y : b.y >= X.y) && b.x > X.x1 && b.x < X.x2) {
        b.layer = 0; H.layer(b, R.layer, 0, 'exit', R);
        if (R.feed) { b.vx = R.feed.vx; b.vy = R.feed.vy; }
      } else if (b.y > B.y2 || b.y < B.y1 || b.x > B.x2 || b.x < B.x1) {
        // varovalo: žogica na rampi ne more biti tu
        b.layer = 0; H.layer(b, R.layer, 0, 'fail', R);
      }
    }
  }

  function step(dt, balls) {
    for (const f of flippers) updateFlipper(f, dt);
    for (const t of toys) if (t.step) t.step(dt);
    for (const c of captives) stepCaptive(c, dt);
    for (const b of balls) {
      if (b.captured) continue;
      b.vy += P.grav * dt;
      if (b.layer !== 0) {
        const R = ramps[b.ramp];
        if (R) {
          // žična / plastična rampa: rahlo kotalno trenje
          const k = 1 - R.friction * dt;
          b.vx *= k; b.vy *= k;
          // vzpon rampe: dodatna komponenta proti vhodu
          for (const L of R.lift) {
            if (!inBox(b.x, b.y, L)) continue;
            if (L.seg) { const q = L.seg; closest(b.x, b.y, q[0], q[1], q[2], q[3]); if ((b.x - _cx) ** 2 + (b.y - _cy) ** 2 > L.r * L.r) continue; }
            if (L.ax) b.vx += L.ax * dt;
            if (L.ay) b.vy += L.ay * dt;
          }
        }
      }
      if (magnets.length) applyMagnets(b, dt);
      const sp = b.vx * b.vx + b.vy * b.vy;
      if (sp > MAXV * MAXV) { const k = MAXV / Math.sqrt(sp); b.vx *= k; b.vy *= k; }
      const py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      for (let i = 0; i < segs.length; i++) collideSeg(b, segs[i]);
      if (b.layer === 0) {
        for (let i = 0; i < bumpers.length; i++) collideBumper(b, bumpers[i]);
        for (let i = 0; i < captives.length; i++) collideCaptive(b, captives[i]);
      }
      for (let i = 0; i < flippers.length; i++) collideFlipper(b, flippers[i]);
      checkLayers(b, py);
    }
    collideBalls(balls);
    for (const b of balls.slice()) if (!b.captured && balls.includes(b)) checkSensors(b);
  }

  return { step, updateFlipper, collideSeg };
}
