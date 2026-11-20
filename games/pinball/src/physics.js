/* =====================================================================
   FIZIKA — 2D, fiksni korak (1/720 s), kapsule + krogi, plasti
   Ohranjen uglašen občutek iz prve verzije (flipperji, cradle, trenje).
   ===================================================================== */
import { BR, GRAV, MAXV } from './config.js';
import { RAMP } from './table.js';

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
  const dvt = Math.min(Math.abs(vt), 0.06 * jn) * Math.sign(vt);
  rvx -= dvt * tx; rvy -= dvt * ty;
  b.vx = rvx + svx; b.vy = rvy + svy;
  return -vn;
}

/**
 * @param T miza (buildTable)
 * @param H obravnavalci dogodkov: seg(s,b,imp,cx,cy,nx,ny), bumper(c,b), sensor(s,b), layer(b,from,to,why), flip(f,b,imp)
 */
export function createPhysics(T, H) {
  const segs = T.segs, bumpers = T.bumpers, flippers = T.flippers, sensors = T.sensors;

  function collideSeg(b, s) {
    if (!s.active) return;
    if (s.layer !== 2 && s.layer !== b.layer) return;
    const rr = BR + s.r;
    if (b.x + BR < s.minx || b.x - BR > s.maxx || b.y + BR < s.miny || b.y - BR > s.maxy) return;
    closest(b.x, b.y, s.ax, s.ay, s.bx, s.by);
    const dx = b.x - _cx, dy = b.y - _cy, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    if (s.oneWay && ((b.x - s.ax) * s.nx + (b.y - s.ay) * s.ny) < 0) return;
    const d = Math.sqrt(d2);
    if (d < 1e-6) return;
    const nx = dx / d, ny = dy / d, cx = _cx, cy = _cy;
    const imp = resolve(b, nx, ny, rr - d, s.e);
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
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 1100) { b.vx += nx * (1100 - vn); b.vy += ny * (1100 - vn); }
      c.cool = 0.06;
      H.bumper(c, b, nx, ny);
    }
  }

  function updateFlipper(f, dt) {
    const on = f.pressed && f.enabled;
    const target = on ? f.up : f.rest;
    const speed = on ? 38 : 18;
    const diff = target - f.angle, max = speed * dt;
    const step = diff > max ? max : diff < -max ? -max : diff;
    f.angle += step;
    f.omega = step / dt;
  }

  function collideFlipper(b, f) {
    if (b.layer !== 0) return;
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
    const imp = resolve(b, dx / d, dy / d, rr - d, 0.32, svx, svy);
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

  function checkSensors(b) {
    for (const s of sensors) {
      if (s.layer !== b.layer) { s.inside.delete(b.id); continue; }
      const inside = (b.x - s.x) ** 2 + (b.y - s.y) ** 2 < s.r * s.r;
      const was = s.inside.has(b.id);
      if (inside && !was) { s.inside.add(b.id); H.sensor(s, b); }
      else if (!inside && was) s.inside.delete(b.id);
    }
  }

  // prehodi med plastmi (rampa)
  function checkLayers(b, py) {
    const R = RAMP;
    if (b.layer === 0) {
      if (py >= R.entryY && b.y < R.entryY && b.x > R.entryX1 - 2 && b.x < R.entryX2 + 2) {
        b.layer = 1; H.layer(b, 0, 1, 'enter');
      }
    } else if (b.layer === 1) {
      if (b.y >= R.entryY && py < R.entryY && b.x > R.entryX1 - 4) {
        b.layer = 0; H.layer(b, 1, 0, 'fail');
      } else if (b.y >= R.exitY && b.x < R.downR + 4) {
        b.layer = 0; H.layer(b, 1, 0, 'exit');
      } else if (b.y > R.exitY + 30 || b.y < 250 || b.x > R.upR + 30) {
        // varovalo: žogica na rampi ne more biti tu
        b.layer = 0; H.layer(b, 1, 0, 'fail');
      }
    }
  }

  function step(dt, balls) {
    for (const f of flippers) updateFlipper(f, dt);
    for (const b of balls) {
      if (b.captured) continue;
      b.vy += GRAV * dt;
      if (b.layer === 1) {
        // žična / plastična rampa: rahlo kotalno trenje
        const k = 1 - 0.35 * dt;
        b.vx *= k; b.vy *= k;
        // dvig rampe: dodatna komponenta proti vhodu na vzponu
        if (b.x > RAMP.upL - 4 && b.y > RAMP.turnY) b.vy += 520 * dt;
      }
      const sp = b.vx * b.vx + b.vy * b.vy;
      if (sp > MAXV * MAXV) { const k = MAXV / Math.sqrt(sp); b.vx *= k; b.vy *= k; }
      const py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      for (let i = 0; i < segs.length; i++) collideSeg(b, segs[i]);
      if (b.layer === 0) {
        for (let i = 0; i < bumpers.length; i++) collideBumper(b, bumpers[i]);
        for (let i = 0; i < flippers.length; i++) collideFlipper(b, flippers[i]);
      }
      checkLayers(b, py);
    }
    collideBalls(balls);
    for (const b of balls.slice()) if (!b.captured && balls.includes(b)) checkSensors(b);
  }

  return { step, updateFlipper, collideSeg };
}
