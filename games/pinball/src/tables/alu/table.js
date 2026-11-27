/* =====================================================================
   ALU MIZA — geometrija (logične koordinate 600 × 1000, y navzdol)
   Plasti: 0 = igralna površina, 1 = rampa »stiskalnica«.
   Vrstni red elementov je pomemben (vrstni red trkov v fiziki → zlati test).
   ===================================================================== */
import { createTable } from '../../engine/table.js';
import { PAL, CFG } from './config.js';

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
  const T = createTable({ id: 'alu' });
  const { seg, poly } = T;
  const N = CFG.imena;

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
  T.launcher({ x: 562.5, y: PLUNGER_Y, laneX: 546, laneY: 880, travel: 28, x1: 545, x2: 580 });

  /* ---------- levi orbit (valjarna) ---------- */
  seg(20, 338, 68, 375, { oneWay: true, kind: 'gate', e: 0.25, look: 'gate' });
  poly([[68, 375], [68, 400], [125, 440]], { r: 3 });

  /* ---------- zgornji kanali A·L·U ---------- */
  for (const x of [215, 265, 315, 365]) {
    seg(x, 92, x, 135, { r: 4, e: 0.5, look: 'post' });
  }

  /* ---------- pop bumperji (peči »Al 13«) ---------- */
  for (const [x, y] of [[235, 215], [335, 215], [285, 292]]) T.bumper(x, y, { r: 26, label: 'Al', sub: '13' });

  /* ---------- slingshoti ---------- */
  T.sling([100, 705], [100, 790], [165, 828], 'L', { label: N.sling });
  T.sling([465, 705], [465, 790], [400, 828], 'R', { label: N.sling });

  /* ---------- outlane / inlane vodila ---------- */
  // vrh vodila je nagnjen proti steni → ozek vhod v outlane, gumijast drog odbija nazaj
  poly([[50, 682], [55, 722], [55, 815], [198, 870]], { r: 3 });
  poly([[515, 682], [510, 722], [510, 815], [367, 870]], { r: 3 });
  seg(50, 682, 50, 682, { r: 6, e: 0.75, look: 'rubberPost', kind: 'post' });
  seg(20, 596, 33, 636, { r: 3, e: 0.5, look: 'rubber' });         // odbojnik ob levi steni
  seg(515, 682, 515, 682, { r: 6, e: 0.75, look: 'rubberPost', kind: 'post' });

  /* ---------- B·U·G drop tarče ---------- */
  T.dropBank('bug', [0, 1, 2].map(i => [533, 560 + i * 45, 533, 560 + i * 45 + 36]), { labels: ['B', 'U', 'G'], color: PAL.code, name: 'B·U·G' });

  /* ---------- code review tarča (sredina) ---------- */
  T.review = T.standup('review', 264, 430, 300, 430, { face: [0, 1], label: 'REVIEW', color: PAL.magenta });

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
  // prehodi plasti: vhod čez ustje navzgor, padec nazaj (prešibek strel), izhod na levi inlane
  T.ramp({
    id: 'ramp', layer: 1, label: N.ramp, made: 'rampMade', friction: 0.35,
    entry: { y: R.entryY, x1: R.entryX1 - 2, x2: R.entryX2 + 2 },
    fail: { y: R.entryY, x1: R.entryX1 - 4 },
    exit: { y: R.exitY, x2: R.downR + 4, dir: 'down' },
    bounds: { x2: R.upR + 30, y1: 250, y2: R.exitY + 30 },
    lift: [{ x1: R.upL - 4, y1: R.turnY, ay: 520 }],      // vzpon: dodatna komponenta proti vhodu
  });

  /* ---------- flipperji ---------- */
  T.flipper({ side: 'L', px: 195, py: 880, len: 74, rest: 0.52, up: -0.45, r1: 13, r2: 7, label: 'ALU' });
  T.flipper({ side: 'R', px: 370, py: 880, len: 74, rest: Math.PI - 0.52, up: Math.PI + 0.45, r1: 13, r2: 7, label: 'ALU' });

  /* ---------- senzorji ---------- */
  const lanes = ['A', 'L', 'U'].map((ch, i) => T.sensor('lane', 240 + 50 * i, 113, 13, { idx: i }));
  T.laneGroup('alu', lanes);
  T.sensor('orbit', 40, 312, 18);
  T.spinner('spinner', SPINNER.x, SPINNER.y, { w: 38, r: 20, label: 'VALJ', x1: 22, x2: 66 });
  T.saucer('scoop', SCOOP.x, SCOOP.y, {
    r: 15, capture: { maxUp: 2800, maxAny: 650 },
    eject: { vx: -380, rvx: -120, vy: -300, rvy: -100 },
  });
  T.sensor('inlane', 78, 760, 14, { idx: 0 });
  T.sensor('inlane', 487, 760, 14, { idx: 1 });
  T.sensor('outlane', 37, 800, 14, { idx: 0 });
  T.sensor('outlane', 528, 800, 14, { idx: 1 });
  T.sensor('rampMade', R.turnCx, R.turnY - (R.turnR + R.turnRi) / 2, 14, { layer: 1 });

  /* ---------- strele (za combo, merilec strelov, debug) ---------- */
  T.shot('orbit', { label: N.orbit + ' orbit', switches: ['orbit'], x: 60, y: 330 });
  T.shot('ramp', { label: N.ramp + ' rampa', switches: ['rampMade'], x: 135, y: 320 });
  T.shot('scoop', { label: N.scoop + ' livarna', switches: ['scoop'], x: SCOOP.x, y: SCOOP.y, combo: false });
  T.shot('bug', { label: 'B·U·G', switches: ['drop'], x: 520, y: 620, combo: false });
  T.shot('review', { label: 'code review', switches: ['review'], x: 282, y: 430 });
  T.shot('lanes', { label: 'A·L·U kanali', switches: ['lane'], x: 290, y: 113, combo: false, minor: true });
  T.shot('pops', { label: 'pop bumperji', switches: ['bumper'], x: 285, y: 240, combo: false, minor: true });
  T.shot('spinner', { label: 'spinner', switches: ['spinner'], x: SPINNER.x, y: SPINNER.y, combo: false, minor: true });

  /* ---------- točke za efekte (kamera, bliski, svetlobni šovi) ---------- */
  T.points = {
    center: [293, 560], modes: [293, 590], scoop: [SCOOP.x, SCOOP.y], ramp: [140, 290], orbit: [60, 330],
    review: [282, 430], drops: [520, 620], lineUp: [187, 0], start: [300, 600],
  };
  T.heat = { x: SCOOP.x, y: SCOOP.y };            // peč: žerjavica, toplotna distorzija, žar

  /* ---------- luči (inserti) ---------- */
  const lamp = T.lamp;
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

  return T.finish();
}
