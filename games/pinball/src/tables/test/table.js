/* =====================================================================
   TESTNA MIZA — vsi novi elementi motorja na eni mizi (?miza=test)
   2 rampi (žičnata + plastična z zavrnitvijo), VUK, zgornji flipper, drop banka,
   standupi, ujeta žogica, magnet, vidni lock, dvižni stebriček, preusmernik,
   spinner na rampi, rollover kanali z lane change, igrača. Ne pokaže se v hubu.
   ===================================================================== */
import { createTable } from '../../engine/table.js';
import { PAL } from './config.js';

/** lasnica: navzgor po x = xUp, lok s polmerom r čez vrh, navzdol po drugi strani, nato do izhoda */
function hairpin(xUp, yBottom, yTurn, r, dir, yDown, exit) {
  const cx = xUp + dir * r, P = [[xUp, yBottom], [xUp, yTurn + 60]];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const a = dir < 0 ? -Math.PI * i / n : Math.PI + Math.PI * i / n;
    P.push([+(cx + r * Math.cos(a)).toFixed(2), +(yTurn + r * Math.sin(a)).toFixed(2)]);
  }
  P.push([cx + dir * r, yDown], exit);
  return { path: P, apex: 2 + n / 2 };
}

export function buildTable() {
  const T = createTable({ id: 'test' });
  const { seg, poly } = T;

  /* ---------- zunanji rob ---------- */
  const arc = [];
  for (let i = 0; i <= 64; i++) { const a = Math.PI + Math.PI * i / 64; arc.push([300 + 280 * Math.cos(a), 300 + 280 * Math.sin(a)]); }
  seg(20, 1040, 20, 300, { e: 0.35, look: 'outer' });
  poly(arc, { e: 0.3, look: 'outer' });
  seg(580, 300, 580, 1040, { e: 0.35, look: 'outer' });

  /* ---------- izstrelitveni kanal ---------- */
  seg(545, 1040, 545, 335, { r: 3 });
  seg(545, 335, 580, 300, { oneWay: true, kind: 'gate', e: 0.25, look: 'gate' });
  T.launcher({ x: 562.5, y: 957 });

  /* ---------- levi orbit: enosmerna vrata in vodilo nazaj v polje (sicer žogica iz izstrelitve pade naravnost v outlane) ---------- */
  seg(20, 338, 68, 375, { oneWay: true, kind: 'gate', e: 0.25, look: 'gate' });
  poly([[68, 375], [68, 400], [125, 440]], { r: 3 });
  seg(20, 596, 33, 636, { r: 3, e: 0.5, look: 'rubber' });          // odbojnik ob levi steni

  /* ---------- zgornji kanali (rollover z lane change) ---------- */
  for (const x of [215, 265, 315, 365]) seg(x, 92, x, 135, { r: 4, e: 0.5, look: 'post' });

  /* ---------- pop bumperja ---------- */
  T.bumper(250, 215, { r: 24, label: 'T', sub: '1', color: PAL.cyan });
  T.bumper(350, 215, { r: 24, label: 'T', sub: '2', color: PAL.cyan });

  /* ---------- preusmernik nad bumperji (pravila ga preklopijo) ---------- */
  T.diverter('div', 390, 150, 42, 2.35, 1.2);

  /* ---------- slingshota, inlani, outlani ---------- */
  T.sling([100, 705], [100, 790], [165, 828], 'L', { label: 'TEST' });
  T.sling([465, 705], [465, 790], [400, 828], 'R', { label: 'TEST' });
  poly([[50, 682], [55, 722], [55, 815], [198, 870]], { r: 3 });
  poly([[515, 682], [510, 722], [510, 815], [367, 870]], { r: 3 });
  seg(50, 682, 50, 682, { r: 6, e: 0.75, look: 'rubberPost', kind: 'post' });
  seg(515, 682, 515, 682, { r: 6, e: 0.75, look: 'rubberPost', kind: 'post' });

  /* ---------- ujeta žogica (kanal navzgor nad sredino) ---------- */
  T.captive('captive', 300, 362, 300, 300);

  /* ---------- standup banka (levo) in drop banka (desno) ---------- */
  T.standupBank('stand', [[208, 445, 230, 437], [236, 432, 256, 428], [262, 426, 282, 425]], { face: [0, 1], minFace: 0.3, labels: ['S', 'T', 'D'], color: PAL.magenta });
  T.dropBank('drop', [[316, 425, 334, 425], [338, 427, 356, 429], [360, 431, 378, 435], [382, 438, 400, 444]], { labels: ['1', '2', '3', '4'], color: PAL.code });

  /* ---------- dvižni stebriček pod ujeto žogico ---------- */
  T.post('post', 300, 398, { r: 6 });

  /* ---------- igrača: vrtljiva prečka med kanali in bumperji ---------- */
  T.toy('toy', { x: 300, y: 168, shape: { segs: [[-24, 0, 24, 0, 4]] }, spin: 3, data: { label: 'IGRAČA' } });

  /* ---------- rampa 1: žičnata (plast 1), levo, izhod na levi inlane ---------- */
  T.wireform({
    id: 'wire', layer: 1, look: 'wire', width: 28, label: 'ŽICA', made: 'wireMade',
    ...hairpin(155, 600, 330, 43, -1, 620, [78, 736]),
    exitFeed: { vx: 20, vy: 320 }, incline: 520, color: PAL.cyan,
  });
  /* ---------- rampa 2: plastična (plast 2), desno, strmejša — prešibek strel se vrne (zavrnitev) ---------- */
  T.wireform({
    id: 'ramp', layer: 2, look: 'ramp', width: 28, label: 'RAMPA', made: 'rampMade',
    ...hairpin(420, 600, 330, 47, 1, 640, [487, 736]),
    exitFeed: { vx: -20, vy: 320 }, incline: 900, color: PAL.gold,
  });
  // spinner na žičnati rampi (senzor na plasti 1)
  const sp = T.spinner('spinner', 155, 500, { w: 26, r: 16, label: 'SPIN', x1: 140, x2: 170 });
  sp.sensor.layer = 1;

  /* ---------- flipperji: spodnja dva + zgornji desno (gumb R) ---------- */
  T.flipperAt('L', 195, 880, { label: 'TEST' });
  T.flipperAt('R', 370, 880, { label: 'TEST' });
  T.flipper({ id: 'upper', side: 'R', button: 'R', px: 495, py: 515, len: 52, rest: Math.PI - 0.35, up: Math.PI + 0.45, r1: 11, r2: 6, label: 'UP' });

  /* ---------- luknje: saucer (zgoraj levo), VUK (desno spodaj) ---------- */
  T.saucer('saucer', 150, 250, { r: 14, capture: { maxUp: 2600, maxAny: 700 }, eject: { vx: 380, rvx: 120, vy: 260, rvy: 80 } });
  // VUK: ujame vse; po podzemni poti izvrže zgoraj desno proti bumperjem
  T.vuk('vuk', 370, 560, { r: 13, eject: { x: 470, y: 200, vx: -520, rvx: -80, vy: 240, rvy: 60 } });

  /* ---------- vidni lock (vrsta žogic zgoraj desno) ---------- */
  T.lock('lock', [[420, 160], [442, 160], [464, 160]], { release: { x: 470, y: 200, vx: -380, vy: 260 } });

  /* ---------- magnet nad flipperji ---------- */
  T.magnet('magnet', 283, 640, { r: 60, force: 2.6e5 });

  /* ---------- senzorji ---------- */
  const lanes = [0, 1, 2].map(i => T.sensor('lane', 240 + 50 * i, 113, 13, { idx: i }));
  T.laneGroup('top', lanes);
  T.sensor('inlane', 78, 760, 14, { idx: 0 });
  T.sensor('inlane', 487, 760, 14, { idx: 1 });
  T.sensor('outlane', 37, 800, 14, { idx: 0 });
  T.sensor('outlane', 528, 800, 14, { idx: 1 });

  /* ---------- strele ---------- */
  T.shot('wire', { label: 'žičnata rampa', switches: ['wireMade'], x: 120, y: 300, floorLabel: 'ŽICA' });
  T.shot('ramp', { label: 'plastična rampa', switches: ['rampMade'], x: 470, y: 300, floorLabel: 'RAMPA' });
  T.shot('vuk', { label: 'VUK', switches: ['vuk'], x: 370, y: 560, floorLabel: 'VUK' });
  T.shot('saucer', { label: 'saucer', switches: ['saucer'], x: 150, y: 250, combo: false });
  T.shot('captive', { label: 'ujeta žogica', switches: ['captive'], x: 300, y: 300 });
  T.shot('drops', { label: 'drop banka', switches: ['drop'], x: 358, y: 432, combo: false });
  T.shot('stand', { label: 'standupi', switches: ['stand'], x: 245, y: 435, combo: false });
  T.shot('lanes', { label: 'kanali', switches: ['lane'], x: 290, y: 113, combo: false, minor: true });
  T.shot('pops', { label: 'bumperji', switches: ['bumper'], x: 300, y: 215, combo: false, minor: true });
  T.shot('spinner', { label: 'spinner', switches: ['spinner'], x: 155, y: 500, combo: false, minor: true });
  T.shot('toy', { label: 'igrača', switches: ['toy'], x: 300, y: 168, combo: false, minor: true });

  T.points = { center: [300, 560], modes: [300, 600], scoop: [370, 560], ramp: [470, 300], drops: [358, 432], start: [300, 600] };

  /* ---------- luči ---------- */
  const lamp = T.lamp;
  ['A', 'B', 'C'].forEach((ch, i) => lamp('lane' + i, 240 + 50 * i, 162, { r: 10, label: ch, group: 'top' }));
  lamp('arrWire', 155, 640, { shape: 'arrow', angle: -Math.PI / 2, color: PAL.cyan, r: 14, group: 'shot' });
  lamp('arrRamp', 420, 640, { shape: 'arrow', angle: -Math.PI / 2, color: PAL.gold, r: 14, group: 'shot' });
  lamp('lock', 370, 600, { r: 9, label: 'L', color: PAL.code, group: 'shot' });
  lamp('mag', 283, 700, { r: 9, label: 'M', color: PAL.cyan, group: 'low' });
  lamp('cap', 300, 380, { r: 6, color: PAL.gold, group: 'shot' });
  for (let i = 0; i < 3; i++) lamp('st' + i, 222 + i * 26, 462, { r: 5, color: PAL.magenta, group: 'stand' });
  lamp('save', 282, 975, { r: 9, label: 'S', color: PAL.cyan, group: 'low' });
  for (let i = 0; i < 2; i++) lamp('wireC' + i, 152 - i * 14, 380 - i * 60, { shape: 'chevron', r: 8, layer: 1, color: PAL.cyan, group: 'ramp' });
  for (let i = 0; i < 2; i++) lamp('rampC' + i, 421, 470 - i * 70, { shape: 'chevron', r: 8, layer: 2, color: PAL.gold, group: 'ramp' });
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + 0.3 + (Math.PI - 0.6) * i / 8;
    lamp('gi' + i, 300 + 262 * Math.cos(a), 300 + 262 * Math.sin(a), { r: 3.5, color: '#ffe2b0', group: 'gi' });
  }
  return T.finish();
}
