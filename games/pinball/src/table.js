/* =====================================================================
   MIZA — geometrija (logične koordinate 600 × 1000, y navzdol)
   Plasti: 0 = igralna površina, 1 = rampa, 2 = obe plasti.
   ===================================================================== */
import { PAL } from './config.js';

export const PLUNGER_Y = 957;
export const SCOOP = { x: 490, y: 470 };
export const SPINNER = { x: 44, y: 392 };

// rampa »Iztiskovalna stiskalnica«: vhod spodaj, lasnica zgoraj, izhod na levi inlane
export const RAMP = {
  entryY: 545, entryX1: 172, entryX2: 202,
  upL: 172, upR: 202, downL: 79, downR: 109, turnY: 330,
  turnCx: 140.5, turnR: 61.5, turnRi: 31.5,
  exitY: 682,
};

export function buildTable() {
  const T = {
    segs: [], bumpers: [], sensors: [], slings: [], drops: [], lamps: [], flippers: [],
    posts: [], plunger: null,
  };

  const seg = (ax, ay, bx, by, o = {}) => {
    const s = {
      ax, ay, bx, by,
      r: o.r ?? 2, e: o.e ?? 0.4, kind: o.kind || 'wall', layer: o.layer ?? 0,
      active: true, flash: 0, cool: 0, data: o.data || null, oneWay: !!o.oneWay,
      nx: 0, ny: 0, look: o.look || 'rail', draw: o.draw ?? true,
    };
    if (s.oneWay) {            // trdna stran je na strani normale (dy, -dx)
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
      s.nx = dy / l; s.ny = -dx / l;
    }
    // AABB za hitro izločanje
    s.minx = Math.min(ax, bx) - s.r; s.maxx = Math.max(ax, bx) + s.r;
    s.miny = Math.min(ay, by) - s.r; s.maxy = Math.max(ay, by) + s.r;
    T.segs.push(s);
    return s;
  };
  const poly = (pts, o) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) out.push(seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], o));
    return out;
  };
  T.seg = seg;

  /* ---------- zunanji rob ---------- */
  const arc = [];
  for (let i = 0; i <= 64; i++) {
    const a = Math.PI + Math.PI * i / 64;
    arc.push([300 + 280 * Math.cos(a), 300 + 280 * Math.sin(a)]);
  }
  seg(20, 1040, 20, 300, { e: 0.35, look: 'outer' });
  poly(arc, { e: 0.3, look: 'outer' });
  seg(580, 300, 580, 1040, { e: 0.35, look: 'outer' });

  /* ---------- izstrelitveni kanal ---------- */
  seg(545, 1040, 545, 335, { r: 3 });
  seg(545, 335, 580, 300, { oneWay: true, kind: 'gate', e: 0.25, look: 'gate' });
  T.plunger = seg(545, PLUNGER_Y, 580, PLUNGER_Y, { kind: 'plunger', e: 0.05, r: 0, draw: false });

  /* ---------- levi orbit (valjarna) ---------- */
  seg(20, 338, 68, 375, { oneWay: true, kind: 'gate', e: 0.25, look: 'gate' });
  poly([[68, 375], [68, 400], [125, 440]], { r: 3 });

  /* ---------- zgornji kanali A·L·U ---------- */
  for (const x of [215, 265, 315, 365]) {
    seg(x, 92, x, 135, { r: 4, e: 0.5, look: 'post' });
  }

  /* ---------- pop bumperji (peči »Al 13«) ---------- */
  for (const [x, y] of [[235, 215], [335, 215], [285, 292]]) {
    T.bumpers.push({ x, y, r: 26, flash: 0, cool: 0, pop: 0, i: T.bumpers.length });
  }

  /* ---------- slingshoti ---------- */
  const mkSling = (A, B, C, side) => {
    seg(A[0], A[1], B[0], B[1], { r: 3, e: 0.6, look: 'rubber' });
    seg(B[0], B[1], C[0], C[1], { r: 3, e: 0.6, look: 'rubber' });
    const kick = seg(A[0], A[1], C[0], C[1], { r: 3, e: 0.6, kind: 'sling', draw: false, data: { side } });
    T.slings.push({ A, B, C, kick, side, flash: 0, bend: 0 });
  };
  mkSling([100, 705], [100, 790], [165, 828], 'L');
  mkSling([465, 705], [465, 790], [400, 828], 'R');

  /* ---------- outlane / inlane vodila ---------- */
  // vrh vodila je nagnjen proti steni → ozek vhod v outlane, gumijast drog odbija nazaj
  poly([[50, 682], [55, 722], [55, 815], [198, 870]], { r: 3 });
  poly([[515, 682], [510, 722], [510, 815], [367, 870]], { r: 3 });
  seg(50, 682, 50, 682, { r: 6, e: 0.75, look: 'rubberPost', kind: 'post' });
  seg(20, 596, 33, 636, { r: 3, e: 0.5, look: 'rubber' });         // odbojnik ob levi steni
  seg(515, 682, 515, 682, { r: 6, e: 0.75, look: 'rubberPost', kind: 'post' });

  /* ---------- B·U·G drop tarče ---------- */
  for (let i = 0; i < 3; i++) {
    const y0 = 560 + i * 45;
    const s = seg(533, y0, 533, y0 + 36, { kind: 'drop', r: 5, e: 0.3, data: { idx: i }, draw: false });
    s.sink = 0;               // 0 = gor, 1 = pogreznjena (animacija)
    T.drops.push(s);
  }

  /* ---------- code review tarča (sredina) ---------- */
  T.review = seg(264, 430, 300, 430, { kind: 'review', r: 5, e: 0.35, draw: false });
  T.review.wobble = 0;

  /* ---------- rampa (plast 1) ---------- */
  const R = RAMP, L1 = { layer: 1, r: 2, e: 0.25, look: 'ramp' };
  seg(R.upL, R.entryY, R.upL, R.turnY, L1);
  seg(R.upR, R.entryY, R.upR, R.turnY, L1);
  const turn = [];
  for (let i = 0; i <= 20; i++) {
    const a = -Math.PI * i / 20;
    turn.push([R.turnCx + R.turnR * Math.cos(a), R.turnY + R.turnR * Math.sin(a)]);
  }
  poly(turn, L1);
  const inner = [];
  for (let i = 0; i <= 14; i++) {
    const a = -Math.PI * i / 14;
    inner.push([R.turnCx + R.turnRi * Math.cos(a), R.turnY + R.turnRi * Math.sin(a)]);
  }
  poly(inner, L1);
  seg(R.downL, R.turnY, R.downL, 600, L1);
  seg(R.downR, R.turnY, R.downR, 600, L1);
  seg(R.downL, 600, 63, 688, L1);
  seg(R.downR, 600, 93, 692, L1);
  // ustje rampe na igralni površini (lijak)
  seg(R.upL, R.entryY, 160, 585, { r: 3, e: 0.35, look: 'rampLip' });
  seg(R.upR, R.entryY, 222, 585, { r: 3, e: 0.35, look: 'rampLip' });

  /* ---------- flipperji ---------- */
  T.flippers.push(
    { side: 'L', px: 195, py: 880, len: 74, rest: 0.52, up: -0.45, angle: 0.52, omega: 0, r1: 13, r2: 7, pressed: false, enabled: true },
    { side: 'R', px: 370, py: 880, len: 74, rest: Math.PI - 0.52, up: Math.PI + 0.45, angle: Math.PI - 0.52, omega: 0, r1: 13, r2: 7, pressed: false, enabled: true },
  );

  /* ---------- senzorji ---------- */
  const sensor = (kind, x, y, r, o = {}) => {
    const s = { kind, x, y, r, layer: o.layer ?? 0, idx: o.idx ?? 0, inside: new Set() };
    T.sensors.push(s);
    return s;
  };
  ['A', 'L', 'U'].forEach((ch, i) => sensor('lane', 240 + 50 * i, 113, 13, { idx: i }));
  sensor('orbit', 40, 312, 18);
  sensor('spinner', SPINNER.x, SPINNER.y, 20);
  sensor('scoop', SCOOP.x, SCOOP.y, 15);
  sensor('inlane', 78, 760, 14, { idx: 0 });
  sensor('inlane', 487, 760, 14, { idx: 1 });
  sensor('outlane', 37, 800, 14, { idx: 0 });
  sensor('outlane', 528, 800, 14, { idx: 1 });
  sensor('rampMade', R.turnCx, R.turnY - (R.turnR + R.turnRi) / 2, 14, { layer: 1 });

  /* ---------- luči (inserti) ---------- */
  const lamp = (id, x, y, o = {}) => {
    const l = { id, x, y, r: o.r ?? 10, shape: o.shape || 'circle', color: o.color || PAL.cyan,
      label: o.label || '', angle: o.angle || 0, onRamp: !!o.onRamp, group: o.group || '', size: o.size || 1 };
    T.lamps.push(l);
    return l;
  };
  ['A', 'L', 'U'].forEach((ch, i) => lamp('lane' + i, 240 + 50 * i, 162, { r: 11, label: ch, group: 'top' }));
  for (let k = 2; k <= 6; k++) lamp('mult' + k, 202 + (k - 2) * 40, 668, { r: 10, label: k + '×', group: 'mult' });
  // puščice strelov
  lamp('arrOrbit', 78, 478, { shape: 'arrow', angle: -2.2, color: PAL.cyan, r: 15, group: 'shot' });
  lamp('arrRamp', 187, 608, { shape: 'arrow', angle: -Math.PI / 2 - 0.08, color: PAL.cyan, r: 15, group: 'shot' });
  lamp('arrScoop', 452, 528, { shape: 'arrow', angle: Math.atan2(SCOOP.y - 528, SCOOP.x - 452), color: PAL.melt, r: 15, group: 'shot' });
  lamp('arrBug', 498, 628, { shape: 'arrow', angle: 0, color: PAL.code, r: 14, group: 'shot' });
  lamp('arrReview', 282, 486, { shape: 'arrow', angle: -Math.PI / 2, color: PAL.magenta, r: 14, group: 'shot' });
  // misije in finale
  lamp('wizard', 293, 552, { shape: 'star', r: 19, color: PAL.gold, group: 'mode' });
  const mpos = [[248, 596], [274, 624], [316, 624], [342, 596]];
  mpos.forEach(([x, y], i) => lamp('mode' + i, x, y, { shape: 'hex', r: 15, group: 'mode' }));
  // talilnica
  lamp('lock1', 470, 506, { r: 6, color: PAL.code, group: 'scoop' });
  lamp('lock2', 490, 510, { r: 6, color: PAL.code, group: 'scoop' });
  lamp('extra', 510, 506, { r: 6, color: PAL.magenta, group: 'scoop' });
  // code review
  for (let i = 0; i < 3; i++) lamp('rev' + i, 264 + i * 18, 455, { r: 5, color: PAL.magenta, group: 'review' });
  // ostalo
  lamp('kick', 37, 905, { r: 9, label: 'K', color: PAL.code, group: 'low' });
  lamp('save', 282, 975, { r: 9, label: 'S', color: PAL.cyan, group: 'low' });
  lamp('spin', 40, 430, { r: 6, color: PAL.cyan, group: 'shot' });
  // na rampi (izris nad rampo)
  for (let i = 0; i < 3; i++) lamp('rampC' + i, 187, 515 - i * 34, { shape: 'chevron', r: 9, onRamp: true, color: PAL.cyan, group: 'ramp' });
  // GI žarnice ob loku in na stenah
  for (let i = 0; i < 11; i++) {
    const a = Math.PI + 0.25 + (Math.PI - 0.5) * i / 10;
    lamp('gi' + i, 300 + 262 * Math.cos(a), 300 + 262 * Math.sin(a), { r: 3.5, color: '#ffe2b0', group: 'gi' });
  }
  for (const [x, y] of [[100, 700], [465, 700], [55, 712], [510, 712], [34, 640], [531, 548]]) {
    lamp('gi' + T.lamps.filter(l => l.group === 'gi').length, x, y, { r: 3, color: '#ffe2b0', group: 'gi' });
  }

  T.lampById = {};
  for (const l of T.lamps) T.lampById[l.id] = l;
  return T;
}

/** točka znotraj zunanjega roba mize (za teste in varovalo pred pobegom) */
export function insideTable(x, y) {
  if (x < 20 || x > 580) return false;
  if (y < 300) return (x - 300) ** 2 + (y - 300) ** 2 < 280 * 280;
  return true;
}
