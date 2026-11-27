/* =====================================================================
   BOŽIČNA MIZA »Trije dobri možje« — geometrija (logične koordinate 600 × 1000, y navzdol)
   Plasti: 0 = igralna površina, 1 = leva žičnata rampa »Smučka«, 2 = desna rampa »Vlakec igrač«.
   Spodnji del (slingi, inlani, outlani, flipperji) je Alu uglasitev (preizkušena).
   Vrstni red elementov vpliva na fiziko (vrstni red trkov).

   Pahljača strelov (od leve):
     levi orbit »Sankališče« (spinner) · VUK »Dimnik« · leva rampa »Smučka« (→ desni inlane) ·
     »Parklji« (drop banka 3) · center »Jelka« (ozek kanal, ujeta žogica »Okrasek«) ·
     desna rampa »Vlakec igrač« (→ levi inlane) · nabiralnik »Pisma« (scoop) · desni orbit (up-post) ·
     zgornji flipper »Kepa« (zgornja zanka)
   ===================================================================== */
import { createTable } from '../../pinball/src/engine/table.js';
import { PAL, SHOTS } from './config.js';

export const PLUNGER_Y = 957;
/** x vrha vodil med inlanom in outlanom (levo, desno) */
export const OUT = { l: 63, r: 502 };

/** gladka pot skozi kontrolne točke (Catmull-Rom), n vzorcev na odsek */
export function smooth(pts, n = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([+f(p0[0], p1[0], p2[0], p3[0]).toFixed(2), +f(p0[1], p1[1], p2[1], p3[1]).toFixed(2)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
/** indeks najvišje točke poti (najmanjši y) */
const apexOf = P => P.reduce((bi, p, i) => (p[1] < P[bi][1] ? i : bi), 0);

// kontrolne točke ramp (vhod spodaj → izhod v inlanu pod vrhom slinga)
export const RAMP_L = [[249, 616], [252, 540], [256, 470], [262, 415], [284, 378], [322, 357], [375, 353], [430, 366], [467, 396], [483, 450], [486, 600], [487, 736]];
export const RAMP_R = [[317, 612], [316, 540], [313, 470], [306, 415], [286, 382], [250, 358], [190, 353], [135, 366], [98, 396], [82, 450], [79, 600], [78, 736]];

export const POS = {
  vuk: [45, 372], scoop: [525, 372], post: [417, 70], tree: [282.5, 282],
  captiveA: [282.5, 434], captiveB: [282.5, 384],
  upper: { px: 453, py: 296 },
};

export function buildTable() {
  const T = createTable({ id: 'bozic' });
  const { seg, poly } = T;

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

  /* ---------- levi orbit »Sankališče«: enosmerna vrata zgoraj, vodilo ---------- */
  // vrata so položna: žogica iz desnega orbita se po njih skotali v kanal (70–100) in pade na levi inlane
  seg(20, 330, 70, 350, { oneWay: true, kind: 'gate', e: 0.2, look: 'gate' });
  seg(70, 350, 70, 462, { r: 3, look: 'candy' });
  poly([[100, 292], [100, 430], [97, 468]], { r: 3, look: 'candy' });
  seg(20, 596, 33, 636, { r: 3, e: 0.5, look: 'rubber' });           // odbojnik ob levi steni (Alu)

  /* ---------- desni orbit: kanal ob izstrelitvenem kanalu, vodilo do desnega inlana ---------- */
  seg(505, 300, 505, 478, { r: 3, look: 'candy' });
  seg(505, 482, 505, 482, { r: 5, e: 0.6, look: 'rubberPost', kind: 'post' });
  seg(545, 556, 500, 628, { r: 3, look: 'candy' });                  // žleb: iz orbita v desni inlane

  /* ---------- zgornji kanali Z·V·O·N ---------- */
  for (const x of [205, 255, 305, 355, 405]) seg(x, 92, x, 135, { r: 4, e: 0.5, look: 'post' });

  /* ---------- pop bumperji »Snežaki« (zgornji levi žep) ---------- */
  for (const [x, y] of [[148, 214], [212, 180], [198, 262]]) T.bumper(x, y, { r: 23, label: '', sub: '', color: PAL.ice });

  /* ---------- up-post na vrhu desnega orbita (super skill shot) ---------- */
  T.post('post', POS.post[0], POS.post[1], { r: 6 });

  /* ---------- slingshota, inlani, outlani (Alu) ---------- */
  T.sling([100, 705], [100, 790], [165, 828], 'L', { label: 'SANKAČ' });
  T.sling([465, 705], [465, 790], [400, 828], 'R', { label: 'SANKAČ' });
  // vrh vodil je bližje sredini kot na Alu mizi (več žogic v outlane — uglašeno z botom, glej README)
  poly([[OUT.l, 680], [OUT.l + 2, 722], [55, 815], [198, 870]], { r: 3, look: 'candy' });
  poly([[OUT.r, 680], [OUT.r - 2, 722], [510, 815], [367, 870]], { r: 3, look: 'candy' });
  seg(OUT.l, 680, OUT.l, 680, { r: 6, e: 0.75, look: 'rubberPost', kind: 'post' });
  seg(OUT.r, 680, OUT.r, 680, { r: 6, e: 0.75, look: 'rubberPost', kind: 'post' });

  /* ---------- Parklji: drop banka 3 levo od centra ---------- */
  T.dropBank('parklji', [[110, 540, 124, 528], [132, 522, 146, 510], [154, 504, 168, 492]],
    { labels: ['P', 'A', 'R'], color: PAL.miklavz, name: SHOTS.drops });

  /* ---------- center »Jelka«: ozek kanal, ujeta žogica »Okrasek«, jelka (igrača) ---------- */
  seg(265, 598, 266, 452, { r: 3, look: 'gold' });
  seg(301, 596, 299, 452, { r: 3, look: 'gold' });
  T.captive('okrasek', POS.captiveA[0], POS.captiveA[1], POS.captiveB[0], POS.captiveB[1], { look: 'gold' });
  T.toy('jelka', { x: POS.tree[0], y: POS.tree[1], spin: 0.6,
    shape: { segs: [[0, -62, -36, 48, 4], [0, -62, 36, 48, 4], [-36, 48, 36, 48, 4]] }, data: { label: 'JELKA' } });

  /* ---------- adventni venec: 4 standupi (sveče) ---------- */
  T.standupBank('venec', [[190, 532, 206, 522], [372, 500, 388, 510], [228, 318, 246, 318], [320, 318, 338, 318]],
    { face: null, labels: ['1', '2', '3', '4'], color: PAL.violet, name: SHOTS.venec });

  /* ---------- rampi ---------- */
  const pL = smooth(RAMP_L), pR = smooth(RAMP_R);
  T.wireform({ id: 'rampL', layer: 1, look: 'wire', width: 26, label: '', lips: false, made: 'rampLMade', path: pL, apex: apexOf(pL),
    exitFeed: { vx: -20, vy: 320 }, incline: 320, color: PAL.ice });
  T.wireform({ id: 'rampR', layer: 2, look: 'ramp', width: 26, label: '', lips: false, made: 'rampRMade', path: pR, apex: apexOf(pR),
    exitFeed: { vx: 20, vy: 320 }, incline: 320, color: PAL.bozicek });

  // kratka ustja ramp (zunanji strani); notranji strani nadaljujeta stene centra
  seg(236, 616, 218, 650, { r: 3, e: 0.35, look: 'rampLip' });
  seg(330, 612, 348, 646, { r: 3, e: 0.35, look: 'rampLip' });

  /* ---------- flipperji: spodnja (Alu) + zgornji »Kepa« desno (gumb R) ---------- */
  T.flipper({ side: 'L', px: 195, py: 880, len: 74, rest: 0.52, up: -0.45, r1: 13, r2: 7, label: 'DOBRI' });
  T.flipper({ side: 'R', px: 370, py: 880, len: 74, rest: Math.PI - 0.52, up: Math.PI + 0.45, r1: 13, r2: 7, label: 'MOŽJE' });
  T.flipper({ id: 'kepa', side: 'L', button: 'R', px: POS.upper.px, py: POS.upper.py, len: 50, rest: 0.4, up: -0.45,
    r1: 11, r2: 6, label: 'KEPA' });

  /*
   * ---------- luknji v orbitih (odpirata se): VUK »Dimnik« v Sankališču, nabiralnik »Pisma« v desnem orbitu ----------
   * Zaprta luknja (capture 0) žogico spusti naprej po orbitu (pretok); pravila jo odprejo (lock, pismo, extra ball).
   * Obe izvržeta podzemno na levi inlane (proti levemu flipperju).
   */
  T.vuk('dimnik', POS.vuk[0], POS.vuk[1], { r: 14, capture: { maxUp: 0, maxAny: 0 },
    eject: { x: 78, y: 690, vx: 0, rvx: 10, vy: 160, rvy: 40 } });
  T.vuk('pisma', POS.scoop[0], POS.scoop[1], { r: 14, capture: { maxUp: 0, maxAny: 0 },
    eject: { x: 78, y: 690, vx: 0, rvx: 10, vy: 160, rvy: 40 } });

  /* ---------- darilna vreča: vidni lock s 3 mesti (zgoraj levo) ---------- */
  T.lock('vreca', [[92, 150], [112, 136], [134, 124]], { release: { x: 96, y: 186, vx: 260, vy: 120 } });

  /* ---------- senzorji ---------- */
  const lanes = [0, 1, 2, 3].map(i => T.sensor('lane', 230 + 50 * i, 113, 13, { idx: i }));
  T.laneGroup('zvon', lanes);
  T.sensor('orbitL', 44, 448, 17);
  T.sensor('orbitR', 525, 452, 17);
  T.sensor('zanka', 450, 98, 16);                       // »Kepa«: tarča zgoraj desno (doseže jo le zgornji flipper)
  T.spinner('spinner', 45, 414, { w: 38, r: 18, label: 'SANI', x1: 22, x2: 68 });
  T.sensor('inlane', 78, 760, 14, { idx: 0 });
  T.sensor('inlane', 487, 760, 14, { idx: 1 });
  T.sensor('outlane', 37, 800, 14, { idx: 0 });
  T.sensor('outlane', 528, 800, 14, { idx: 1 });

  /* ---------- strele (combo, merilec strelov, debug, pomoč) ---------- */
  T.shot('orbitL', { label: SHOTS.orbitL + ' · Dimnik', switches: ['orbitL'], x: 46, y: 420, color: PAL.white, labelX: 70, labelY: 300 });
  T.shot('vuk', { label: SHOTS.vuk + ' (odprt v Sankališču)', switches: ['dimnik'], x: POS.vuk[0], y: POS.vuk[1], combo: false, minor: true, color: PAL.green });
  T.shot('rampL', { label: SHOTS.rampL, switches: ['rampLMade'], x: 250, y: 560, color: PAL.ice, labelX: 200, labelY: 452 });
  T.shot('drops', { label: SHOTS.drops, switches: ['drop'], x: 139, y: 516, combo: false, color: PAL.miklavz, labelX: 120, labelY: 572 });
  T.shot('center', { label: SHOTS.center, switches: ['okrasek'], x: 282, y: 470, color: PAL.gold, labelY: 404 });
  T.shot('rampR', { label: SHOTS.rampR, switches: ['rampRMade'], x: 318, y: 560, color: PAL.bozicek, labelX: 380, labelY: 452 });
  T.shot('scoop', { label: SHOTS.scoop + ' (odprt v desnem orbitu)', switches: ['pisma'], x: POS.scoop[0], y: POS.scoop[1], combo: false, minor: true, color: PAL.orange });
  T.shot('orbitR', { label: SHOTS.orbitR + ' · ✉', switches: ['orbitR'], x: 525, y: 440, color: PAL.white, labelX: 500, labelY: 290 });
  T.shot('kepa', { label: SHOTS.kepa + ' (zgornji flipper)', switches: ['zanka'], x: 450, y: 98, color: PAL.snow, from: [453, 296], labelX: 420, labelY: 150 });
  T.shot('lanes', { label: SHOTS.lanes + ' kanali', switches: ['lane'], x: 305, y: 113, combo: false, minor: true });
  T.shot('pops', { label: SHOTS.pops, switches: ['bumper'], x: 186, y: 220, combo: false, minor: true });
  T.shot('venec', { label: SHOTS.venec, switches: ['venec'], x: 282, y: 330, combo: false, minor: true });
  T.shot('spinner', { label: 'spinner', switches: ['spinner'], x: 45, y: 410, combo: false, minor: true });

  T.heat = { x: POS.vuk[0], y: POS.vuk[1] };      // dimnik: iskre, topel sij in tresenje zraka nad njim
  T.points = {
    center: [282, 560], modes: [282, 600], scoop: POS.scoop, ramp: [250, 400], orbit: [60, 400], review: [282, 430],
    drops: [139, 516], lock: [112, 140], tree: [282, 240], start: [282, 600], chimney: POS.vuk,
  };

  /* ---------- luči (vstavki) ---------- */
  buildLamps(T);
  return T.finish();
}

/*
 * Vstavki: puščice velikih strelov v pahljači (kažejo točno smer strela), ob njih manjši vstavki
 * (J jackpot, C combo, L lock, ✉ pismo, EB extra ball, ? mystery), kanali, bonus X, sveče venca, vreča, jelka, GI.
 */
function buildLamps(T) {
  const lamp = T.lamp;
  const arrow = (id, x, y, tx, ty, color) =>
    lamp(id, x, y, { shape: 'arrow', angle: Math.atan2(ty - y, tx - x), r: 15, color, group: 'shot' });
  arrow('arrOrbitL', 84, 566, 46, 470, PAL.white);
  arrow('arrDrops', 168, 590, 139, 516, PAL.miklavz);
  arrow('arrRampL', 236, 676, 246, 612, PAL.ice);
  arrow('arrCenter', 282.5, 652, 282.5, 580, PAL.gold);
  arrow('arrRampR', 329, 676, 319, 612, PAL.bozicek);
  arrow('arrOrbitR', 470, 600, 522, 486, PAL.white);
  // manjši vstavki ob puščicah: [id, x, y, barva, oznaka]
  const small = [
    ['jpOrbitL', 62, 604, PAL.red, 'J'], ['lockL', 88, 612, PAL.green, 'L'], ['cbOrbitL', 112, 600, PAL.white, 'C'],
    ['jpRampL', 216, 706, PAL.red, 'J'], ['cbRampL', 242, 712, PAL.white, 'C'],
    ['superJ', 282.5, 690, PAL.gold, '★'],
    ['jpRampR', 323, 712, PAL.red, 'J'], ['cbRampR', 349, 706, PAL.white, 'C'],
    ['cbOrbitR', 444, 626, PAL.white, 'C'], ['jpOrbitR', 470, 640, PAL.red, 'J'],
    ['pismo', 418, 600, PAL.silver, '✉'], ['extra', 438, 574, PAL.orange, 'EB'], ['mystery', 410, 558, PAL.violet, '?'],
  ];
  for (const [id, x, y, color, label] of small) lamp(id, x, y, { r: 8, color, group: 'shot', label });
  // zgornji kanali Z·V·O·N in bonus X
  ['Z', 'V', 'O', 'N'].forEach((ch, i) => lamp('lane' + i, 230 + 50 * i, 160, { r: 11, label: ch, group: 'top' }));
  for (let k = 2; k <= 6; k++) lamp('mult' + k, 202 + (k - 2) * 40, 748, { r: 10, label: k + '×', group: 'mult', color: PAL.gold });
  // sveče adventnega venca (4) v krogu okoli zvezde super jackpota
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 2 + Math.PI / 4;
    lamp('svec' + i, 282.5 + Math.cos(a) * 24, 690 + Math.sin(a) * 18, { r: 5, color: PAL.violet, group: 'venec' });
  }
  // vreča (lock): 3 vstavki ob vreči
  for (let i = 0; i < 3; i++) lamp('vreca' + i, 64 + i * 22, 182 - i * 12, { r: 6, color: PAL.green, group: 'lock' });
  // jelka: lučke tree0..8 in zvezdo »star« nastavijo pravila, nariše jih igrača (art.drawToys), zato niso v T.lamps
  // spodaj: kickback, ball save »Angelček«, spinner, Kepa
  lamp('kick', 37, 905, { r: 9, label: 'K', color: PAL.green, group: 'low' });
  lamp('save', 282.5, 975, { r: 9, label: 'S', color: PAL.white, group: 'low' });
  lamp('spin', 45, 494, { r: 6, color: PAL.ice, group: 'shot' });
  lamp('kepaL', 450, 126, { r: 8, color: PAL.white, group: 'shot', label: 'K' });
  // chevroni na rampah (izris nad rampo)
  for (let i = 0; i < 3; i++) lamp('rampLC' + i, 250 + i * 2, 560 - i * 42, { shape: 'chevron', r: 8, layer: 1, color: PAL.ice, group: 'ramp' });
  for (let i = 0; i < 3; i++) lamp('rampRC' + i, 316 - i * 1, 560 - i * 42, { shape: 'chevron', r: 8, layer: 2, color: PAL.bozicek, group: 'ramp' });
  // GI: girlanda lučk ob loku in na stenah
  for (let i = 0; i < 15; i++) {
    const a = Math.PI + 0.2 + (Math.PI - 0.4) * i / 14;
    lamp('gi' + i, 300 + 266 * Math.cos(a), 300 + 266 * Math.sin(a), { r: 3.2, color: ['#ffd9a0', '#ff8a8a', '#a8ffcf', '#9fd8ff'][i % 4], group: 'gi' });
  }
  let k = 15;
  for (const [x, y] of [[100, 700], [465, 700], [55, 712], [510, 712], [34, 640], [531, 640], [34, 520], [531, 600]]) {
    lamp('gi' + k++, x, y, { r: 3, color: '#ffd9a0', group: 'gi' });
  }
}
