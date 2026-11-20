/* =====================================================================
   STATIČNA GRAFIKA MIZE — proceduralno (brez slikovnih datotek)
   floor  : potisk na aluminiju (RGBA; alfa = pokritost z barvo)
   mask   : G = talina (animirana v shaderju), R = sijaj kovine
   raised : dvignjeni elementi (stene, drogovi, plastike, predpasnik)
   emis   : statični neon (moduliran z GI)
   ramp   : sprite rampe (riše se med plastmi žogic)
   ===================================================================== */
import { W, H, TAU, PAL, CFG, MODES } from '../config.js';
import { RAMP, SCOOP, SPINNER } from '../table.js';
import { drawLogo, tinted } from '../logos.js';

const N = CFG.imena;

export function makeCanvas(w, h) {
  const c = (typeof OffscreenCanvas !== 'undefined' && false) ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function tablePath(g, keep) {
  if (!keep) g.beginPath();
  g.moveTo(20, H + 40); g.lineTo(20, 300);
  g.arc(300, 300, 280, Math.PI, TAU);
  g.lineTo(580, H + 40); g.closePath();
}

const FONT_T = '"Orbitron", "Rajdhani", "Arial Black", sans-serif';
const FONT_U = '"Rajdhani", "Segoe UI", Arial, sans-serif';
const FONT_M = '"Share Tech Mono", Consolas, monospace';

function text(g, s, x, y, o = {}) {
  g.save();
  g.translate(x, y); if (o.rot) g.rotate(o.rot);
  g.font = `${o.weight || 700} ${o.size || 10}px ${o.font || FONT_U}`;
  g.fillStyle = o.color || 'rgba(220,230,240,.5)';
  g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
  if (o.spacing && 'letterSpacing' in g) g.letterSpacing = o.spacing + 'px';
  g.fillText(s, 0, 0);
  g.restore();
}

/* ------------------------------------------------------------------ */
/* potisk mize                                                          */
/* ------------------------------------------------------------------ */
export function drawFloor(g, T) {
  const r = rng(11);
  g.save();
  tablePath(g); g.clip();

  // osnovna barva: globoka industrijska modra, ki pusti kovino rahlo vidno
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, 'rgba(22,36,62,0.86)');
  base.addColorStop(0.45, 'rgba(16,26,46,0.88)');
  base.addColorStop(1, 'rgba(10,15,28,0.93)');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // ilustracija: velik diagonalni »profil« iztiskanja v ozadju
  g.save();
  g.globalAlpha = 0.5;
  const prof = g.createLinearGradient(0, 200, 600, 900);
  prof.addColorStop(0, 'rgba(111,211,255,0.10)'); prof.addColorStop(0.5, 'rgba(255,122,26,0.08)'); prof.addColorStop(1, 'rgba(111,211,255,0.02)');
  g.fillStyle = prof;
  g.beginPath(); g.moveTo(0, 520); g.lineTo(600, 260); g.lineTo(600, 420); g.lineTo(0, 700); g.closePath(); g.fill();
  g.restore();
  // GI svetlobni krogi (topla luč žarnic na potisku)
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const l of T.lamps) {
    if (l.group !== 'gi') continue;
    const gr = g.createRadialGradient(l.x, l.y, 2, l.x, l.y, 75);
    gr.addColorStop(0, 'rgba(255,215,160,0.16)'); gr.addColorStop(1, 'rgba(255,215,160,0)');
    g.fillStyle = gr; g.fillRect(l.x - 75, l.y - 75, 150, 150);
  }
  g.restore();

  // gole kovinske plošče (izrez barve → brušen aluminij v shaderju)
  g.save();
  g.globalCompositeOperation = 'destination-out';
  // zgornji lok
  g.beginPath(); g.arc(300, 300, 272, Math.PI, TAU); g.arc(300, 300, 250, TAU, Math.PI, true); g.closePath();
  g.fillStyle = 'rgba(0,0,0,0.9)'; g.fill();
  // plošča misij (šesterokotnik)
  hexPath(g, 295, 598, 104); g.fillStyle = 'rgba(0,0,0,0.82)'; g.fill();
  // trak valjarne ob orbitu
  g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(22, 340, 44, 120);
  // pas ob inlanih
  g.beginPath(); g.moveTo(60, 860); g.lineTo(200, 905); g.lineTo(200, 930); g.lineTo(60, 885); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(505, 860); g.lineTo(365, 905); g.lineTo(365, 930); g.lineTo(505, 885); g.closePath(); g.fill();
  // plošča na desni (pod talilnico — »pločevina«)
  g.beginPath(); g.moveTo(430, 540); g.lineTo(528, 520); g.lineTo(528, 545); g.lineTo(430, 565); g.closePath();
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fill();
  g.restore();

  // robovi kovinskih plošč
  g.lineWidth = 1.2;
  g.strokeStyle = 'rgba(111,211,255,0.35)';
  hexPath(g, 295, 598, 104); g.stroke();
  hexPath(g, 295, 598, 110); g.strokeStyle = 'rgba(111,211,255,0.12)'; g.stroke();
  g.beginPath(); g.arc(300, 300, 250, Math.PI + 0.02, TAU - 0.02); g.strokeStyle = 'rgba(255,122,26,0.35)'; g.stroke();

  // načrt tovarne (blueprint) za bumperji
  drawBlueprint(g, r);
  // vezja (Alcad) na desni
  drawCircuits(g, r);
  // koda
  drawCode(g, r);
  // tok taline (robovi kanalov)
  meltPaths(g, (p, w) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(20,6,2,0.95)'; g.lineWidth = w + 6; g.stroke(p);
    g.strokeStyle = 'rgba(255,122,26,0.55)'; g.lineWidth = w + 2.5; g.stroke(p);
    g.strokeStyle = 'rgba(40,8,0,1)'; g.lineWidth = w; g.stroke(p);
  });
  // bazen taline v peči
  g.beginPath(); g.arc(SCOOP.x, SCOOP.y, 36, 0, TAU);
  g.fillStyle = 'rgba(30,6,0,1)'; g.fill();
  g.strokeStyle = 'rgba(255,150,60,0.6)'; g.lineWidth = 2; g.stroke();

  // opozorilni trakovi pri outlanih
  hazard(g, 21, 860, 33, 120);
  hazard(g, 512, 860, 32, 120);

  // napisi
  text(g, N.ramp + ' · ' + N.rampKaj, RAMP.upR + 12, 440, { rot: -Math.PI / 2, size: 9, color: 'rgba(111,211,255,.55)', font: FONT_T, spacing: 1 });
  text(g, N.orbit + ' · ' + N.orbitKaj, 44, 520, { rot: -Math.PI / 2, size: 9, color: 'rgba(111,211,255,.65)', font: FONT_T, spacing: 1 });
  text(g, N.scoop, SCOOP.x, SCOOP.y - 58, { size: 11, color: 'rgba(255,150,60,.9)', font: FONT_T, spacing: 1.5 });
  text(g, N.scoopKaj, SCOOP.x, SCOOP.y - 71, { size: 7, color: 'rgba(255,150,60,.65)', font: FONT_T, spacing: 2 });
  // proizvodne lokacije pod pop bumperji
  T.bumpers.forEach((c, i) => text(g, N.bumperji[i] || '', c.x, c.y + 35, { size: 6, color: 'rgba(255,190,120,.6)', font: FONT_T, spacing: 1 }));
  text(g, 'KONTROLA KAKOVOSTI', 517, 628, { rot: -Math.PI / 2, size: 8, color: 'rgba(57,255,136,.55)', font: FONT_T, spacing: 1 });
  text(g, 'CODE REVIEW', 282, 412, { size: 9, color: 'rgba(255,79,216,.65)', font: FONT_T, spacing: 1.5 });
  text(g, 'MISIJE', 295, 520, { size: 9, color: 'rgba(255,210,63,.75)', font: FONT_T, spacing: 3 });
  text(g, 'NAROČILO', 293, 578, { size: 7, color: 'rgba(255,210,63,.7)', font: FONT_T, spacing: 1 });
  const mpos = T.lamps.filter(l => l.group === 'mode' && l.id !== 'wizard');
  mpos.forEach((l, i) => text(g, MODES[i].ime, l.x, l.y + 22, { size: 7, color: hexA(MODES[i].barva, 0.85), font: FONT_T }));
  text(g, 'BONUS', 282, 650, { size: 8, color: 'rgba(111,211,255,.55)', font: FONT_T, spacing: 3 });
  text(g, N.sling, 37, 955, { rot: -Math.PI / 2, size: 7, color: 'rgba(57,255,136,.6)', font: FONT_T });
  text(g, 'IZSTRELITEV', 562, 760, { rot: -Math.PI / 2, size: 9, color: 'rgba(255,150,60,.45)', font: FONT_T, spacing: 2 });
  text(g, 'A · L · U', 290, 186, { size: 8, color: 'rgba(111,211,255,.5)', font: FONT_T, spacing: 2 });
  // element Al
  g.save();
  g.globalAlpha = 0.5;
  g.strokeStyle = 'rgba(111,211,255,.5)'; g.lineWidth = 1.2;
  g.strokeRect(392, 348, 56, 56);
  text(g, 'Al', 420, 378, { size: 26, weight: 900, color: 'rgba(111,211,255,.7)', font: FONT_T });
  text(g, '13', 400, 356, { size: 8, color: 'rgba(111,211,255,.7)', font: FONT_M, align: 'left' });
  text(g, '26,98', 420, 397, { size: 7, color: 'rgba(111,211,255,.7)', font: FONT_M });
  g.restore();
  const logoOk = drawLogo(g, 'impol', 420, 428, 92, 'rgba(225,235,248,.62)');
  if (!logoOk) text(g, CFG.firmaA, 420, 432, { size: 13, weight: 900, color: 'rgba(255,122,26,.45)', font: FONT_T, spacing: 2 });
  // velik potisk logotipa nad flipperji (kot lak na mizi)
  drawLogo(g, 'impol', 283, 760, 176, 'rgba(160,200,255,.16)');
  text(g, '× ' + CFG.firmaB + ' ×', 420, logoOk ? 457 : 448, { size: 9, color: 'rgba(57,255,136,.45)', font: FONT_T, spacing: 1 });

  // ležišča insertov (vdolbine)
  for (const l of T.lamps) {
    if (l.onRamp || l.group === 'gi') continue;
    g.save();
    g.translate(l.x, l.y); g.rotate(l.angle || 0);
    lampShape(g, l, 1.18);
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fill();
    g.lineWidth = 1; g.strokeStyle = 'rgba(160,190,220,0.22)'; g.stroke();
    g.restore();
  }

  // senca dvignjenih elementov
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 8; g.shadowOffsetX = 5; g.shadowOffsetY = 7;
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineCap = 'round';
  for (const s of T.segs) {
    if (!s.draw || s.layer === 1 || s.look === 'outer') continue;
    g.lineWidth = s.r * 2 + 3;
    g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); g.stroke();
  }
  for (const c of T.bumpers) { g.beginPath(); g.arc(c.x, c.y, c.r + 4, 0, TAU); g.fillStyle = 'rgba(0,0,0,.6)'; g.fill(); }
  // senca rampe (višje → večji zamik)
  g.shadowOffsetX = 14; g.shadowOffsetY = 18; g.shadowBlur = 14;
  g.fillStyle = 'rgba(0,0,0,0.5)';
  rampBodyPath(g); g.fill();
  g.restore();

  g.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function hexPath(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.78;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}

function hazard(g, x, y, w, h) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = 'rgba(20,16,4,0.9)'; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,190,40,0.35)';
  for (let i = -h; i < w + h; i += 14) {
    g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i + 7, y); g.lineTo(x + i + 7 - h, y + h); g.lineTo(x + i - h, y + h); g.closePath(); g.fill();
  }
  g.restore();
}

function drawBlueprint(g, r) {
  g.save();
  g.strokeStyle = 'rgba(111,211,255,0.16)';
  g.fillStyle = 'rgba(111,211,255,0.2)';
  g.lineWidth = 0.8;
  // mreža
  for (let x = 160; x <= 440; x += 20) { g.beginPath(); g.moveTo(x, 150); g.lineTo(x, 380); g.stroke(); }
  for (let y = 150; y <= 380; y += 20) { g.beginPath(); g.moveTo(160, y); g.lineTo(440, y); g.stroke(); }
  g.strokeStyle = 'rgba(111,211,255,0.32)'; g.lineWidth = 1.1;
  // peč
  g.beginPath(); g.moveTo(170, 370); g.lineTo(170, 300); g.quadraticCurveTo(170, 270, 200, 262); g.lineTo(215, 262); g.lineTo(215, 370); g.stroke();
  g.beginPath(); g.moveTo(185, 262); g.lineTo(185, 232); g.lineTo(197, 232); g.lineTo(197, 262); g.stroke();
  // valji valjarne
  for (const [x, y, rr] of [[410, 250, 16], [410, 286, 16], [372, 240, 8], [372, 296, 8]]) {
    g.beginPath(); g.arc(x, y, rr, 0, TAU); g.stroke();
    g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
  }
  g.beginPath(); g.moveTo(340, 268); g.lineTo(440, 268); g.stroke();
  // kotirne črte
  g.setLineDash([4, 3]);
  g.beginPath(); g.moveTo(170, 384); g.lineTo(215, 384); g.stroke();
  g.beginPath(); g.moveTo(394, 312); g.lineTo(426, 312); g.stroke();
  g.setLineDash([]);
  text(g, 'T = 720 °C', 192, 395, { size: 7, color: 'rgba(111,211,255,.5)', font: FONT_M });
  text(g, 'Ø 1250', 410, 322, { size: 7, color: 'rgba(111,211,255,.5)', font: FONT_M });
  text(g, 'PEČ-01', 192, 250, { size: 6, color: 'rgba(111,211,255,.5)', font: FONT_M });
  text(g, 'VALJ. STAN A3', 405, 222, { size: 6, color: 'rgba(111,211,255,.5)', font: FONT_M });
  g.restore();
}

function drawCircuits(g, r) {
  g.save();
  g.lineWidth = 1.4; g.lineCap = 'round';
  for (let k = 0; k < 16; k++) {
    let x = 455 + r() * 60, y = 540 + r() * 180;
    g.strokeStyle = `rgba(57,255,136,${0.12 + r() * 0.18})`;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      if (r() < 0.5) x += (r() < 0.5 ? -1 : 1) * (10 + r() * 20);
      else y += (r() < 0.6 ? -1 : 1) * (10 + r() * 30);
      x = Math.max(440, Math.min(525, x)); y = Math.max(500, Math.min(730, y));
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = g.strokeStyle;
    g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill();
  }
  // čip
  g.fillStyle = 'rgba(57,255,136,0.12)'; g.strokeStyle = 'rgba(57,255,136,0.35)';
  g.fillRect(462, 650, 26, 26); g.strokeRect(462, 650, 26, 26);
  for (let i = 0; i < 5; i++) {
    g.beginPath(); g.moveTo(464 + i * 5.5, 650); g.lineTo(464 + i * 5.5, 645); g.stroke();
    g.beginPath(); g.moveTo(464 + i * 5.5, 676); g.lineTo(464 + i * 5.5, 681); g.stroke();
  }
  text(g, 'QA', 475, 663, { size: 8, color: 'rgba(57,255,136,.6)', font: FONT_M, weight: 700 });
  g.restore();
}

const CODE = [
  'while(!done){', ' talina(720);', ' if(bug)', '  hotfix();', ' roll(0.2);', '}', 'git push', 'sprint++;',
  '// TODO:', '// manj bugov', 'deploy --prod', 'review()', ' .approve();', '$ npm test', '✓ 42 passed',
];
function drawCode(g, r) {
  g.save();
  g.font = `600 6.5px ${FONT_M}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  for (let i = 0; i < CODE.length; i++) {
    g.fillStyle = i % 4 === 0 ? 'rgba(57,255,136,0.55)' : 'rgba(111,211,255,0.42)';
    g.fillText(CODE[i], RAMP.downR + 6, RAMP.turnY + 12 + i * 12.5);
  }
  g.restore();
}

/** poti kanalov taline (za potisk in masko) */
export function meltPaths(g, cb) {
  const P = typeof Path2D !== 'undefined' ? Path2D : null;
  if (!P) return;
  const a = new P();
  a.moveTo(SCOOP.x - 20, SCOOP.y + 24);
  a.bezierCurveTo(430, 560, 400, 520, 380, 560);
  a.bezierCurveTo(365, 590, 372, 620, 360, 650);
  cb(a, 7);
  const b = new P();
  b.moveTo(SCOOP.x + 10, SCOOP.y + 32);
  b.bezierCurveTo(500, 560, 470, 600, 482, 640);
  cb(b, 5);
  const c = new P();
  c.moveTo(380, 560); c.bezierCurveTo(350, 545, 330, 530, 318, 540);
  cb(c, 4);
}

/* ------------------------------------------------------------------ */
/* maska taline                                                          */
/* ------------------------------------------------------------------ */
export function drawMask(g) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  meltPaths(g, (p, w) => { g.strokeStyle = 'rgb(0,255,0)'; g.lineWidth = w; g.stroke(p); });
  const gr = g.createRadialGradient(SCOOP.x, SCOOP.y, 10, SCOOP.x, SCOOP.y, 35);
  gr.addColorStop(0, 'rgb(0,255,0)'); gr.addColorStop(0.85, 'rgb(0,255,0)'); gr.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(SCOOP.x, SCOOP.y, 35, 0, TAU); g.fill();
  g.restore();
}

/* ------------------------------------------------------------------ */
/* dvignjeni elementi                                                    */
/* ------------------------------------------------------------------ */
export function drawRaised(g, T) {
  // ohišje izven mize
  g.save();
  g.beginPath(); g.rect(-50, -50, W + 100, H + 100);
  tablePath(g, true);
  const cab = g.createLinearGradient(0, 0, W, 0);
  cab.addColorStop(0, '#07090d'); cab.addColorStop(0.5, '#0b0f16'); cab.addColorStop(1, '#07090d');
  g.fillStyle = cab; g.fill('evenodd');
  g.restore();

  // zunanja stranica (kovinska letev z notranjim robom)
  g.save();
  g.lineJoin = 'round';
  tablePath(g);
  g.strokeStyle = '#1a222e'; g.lineWidth = 10; g.stroke();
  g.strokeStyle = '#6d7a8c'; g.lineWidth = 3; g.stroke();
  g.strokeStyle = 'rgba(230,240,255,.55)'; g.lineWidth = 1; g.stroke();
  g.restore();

  // plošča izstrelitvenega kanala
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(546, 336, 33, 700);
  g.restore();

  // stene / vodila
  for (const s of T.segs) {
    if (!s.draw || s.layer === 1 || s.look === 'outer') continue;
    drawWall(g, s);
  }

  // ohišje peči (talilnica)
  furnace(g);

  // plastike
  plastic(g, [[200, 70], [380, 70], [372, 88], [208, 88]], PAL.cyan, 'A · L · U');
  plastic(g, [[66, 365], [92, 392], [128, 428], [134, 446], [122, 446], [70, 410]], PAL.cyan);
  plastic(g, [[548, 300], [578, 300], [578, 334], [548, 334]], PAL.melt);

  // predpasnik
  apron(g);
}

function drawWall(g, s) {
  g.save();
  g.lineCap = 'round';
  const line = () => { g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); };
  const w = Math.max(3.5, s.r * 2);
  if (s.look === 'rubber') {
    line(); g.strokeStyle = '#0c0d10'; g.lineWidth = w + 3; g.stroke();
    line(); g.strokeStyle = '#2a2d33'; g.lineWidth = w; g.stroke();
    g.translate(-0.6, -0.8); line(); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.stroke();
  } else if (s.look === 'rubberPost') {
    g.beginPath(); g.arc(s.ax, s.ay, s.r + 1, 0, TAU); g.fillStyle = '#0c0d10'; g.fill();
    g.beginPath(); g.arc(s.ax, s.ay, s.r - 1, 0, TAU); g.fillStyle = '#2b2e35'; g.fill();
    const gr = g.createRadialGradient(s.ax - 1.5, s.ay - 2, 0.5, s.ax, s.ay, s.r * 0.6);
    gr.addColorStop(0, '#f2f6ff'); gr.addColorStop(1, '#4a5566');
    g.beginPath(); g.arc(s.ax, s.ay, s.r * 0.55, 0, TAU); g.fillStyle = gr; g.fill();
  } else if (s.look === 'post') {
    line(); g.strokeStyle = '#141a24'; g.lineWidth = w + 3; g.stroke();
    line(); g.strokeStyle = '#8796a8'; g.lineWidth = w; g.stroke();
    g.translate(-0.8, -0.8); line(); g.strokeStyle = 'rgba(240,248,255,.8)'; g.lineWidth = 1.2; g.stroke();
    g.translate(0.8, 0.8);
    for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by]]) {
      const gr = g.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 6);
      gr.addColorStop(0, '#e6faff'); gr.addColorStop(0.5, '#3aa9d8'); gr.addColorStop(1, '#0b3b55');
      g.beginPath(); g.arc(x, y, 5.5, 0, TAU); g.fillStyle = gr; g.fill();
    }
  } else if (s.look === 'gate') {
    line(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 4; g.stroke();
    line(); g.strokeStyle = '#c9d3df'; g.lineWidth = 1.6; g.stroke();
    g.beginPath(); g.arc(s.ax, s.ay, 3, 0, TAU); g.fillStyle = '#ffab3d'; g.fill();
  } else if (s.look === 'rampLip') {
    line(); g.strokeStyle = '#1a222e'; g.lineWidth = w + 3; g.stroke();
    line(); g.strokeStyle = '#a9b6c6'; g.lineWidth = w; g.stroke();
  } else {
    // kovinsko vodilo
    line(); g.strokeStyle = '#121822'; g.lineWidth = w + 3.5; g.stroke();
    line(); g.strokeStyle = '#5f6d80'; g.lineWidth = w + 1; g.stroke();
    line(); g.strokeStyle = '#a7b4c4'; g.lineWidth = Math.max(1.5, w - 2); g.stroke();
    g.translate(-0.7, -0.9); line(); g.strokeStyle = 'rgba(245,250,255,.75)'; g.lineWidth = 0.9; g.stroke();
  }
  g.restore();
}

function furnace(g) {
  const { x, y } = SCOOP;
  g.save();
  // obroč z odprtino spredaj (spodaj levo)
  const a0 = 2.05, a1 = 2.05 + TAU - 1.25;
  g.lineCap = 'round';
  g.beginPath(); g.arc(x, y, 26, a0, a1); g.strokeStyle = '#151b25'; g.lineWidth = 11; g.stroke();
  g.beginPath(); g.arc(x, y, 26, a0, a1);
  const gr = g.createLinearGradient(x - 26, y - 26, x + 26, y + 26);
  gr.addColorStop(0, '#d8e1ec'); gr.addColorStop(0.5, '#6a7789'); gr.addColorStop(1, '#2d3644');
  g.strokeStyle = gr; g.lineWidth = 7; g.stroke();
  // kovice
  for (let i = 0; i < 9; i++) {
    const a = a0 + 0.15 + (a1 - a0 - 0.3) * i / 8;
    g.beginPath(); g.arc(x + Math.cos(a) * 26, y + Math.sin(a) * 26, 1.3, 0, TAU); g.fillStyle = '#e9f0f8'; g.fill();
  }
  // dimnik
  g.fillStyle = '#1a212c'; g.fillRect(x + 10, y - 50, 12, 22);
  g.fillStyle = '#5d6a7c'; g.fillRect(x + 8, y - 52, 16, 4);
  g.restore();
}

function plastic(g, pts, color, label) {
  g.save();
  g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath();
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const gr = g.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  gr.addColorStop(0, hexA(color, 0.42)); gr.addColorStop(1, hexA(color, 0.16));
  g.fillStyle = gr; g.fill();
  g.strokeStyle = hexA(color, 0.8); g.lineWidth = 1.2; g.stroke();
  g.clip();
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(Math.min(...xs), Math.min(...ys) + 3); g.lineTo(Math.max(...xs), Math.min(...ys) + 1); g.stroke();
  g.restore();
  if (label) text(g, label, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, { size: 9, color: 'rgba(240,250,255,.85)', font: FONT_T, spacing: 3 });
}

function apron(g) {
  g.save();
  const shape = (pts) => { g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); };
  const metal = (x0, y0, x1, y1) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, '#2a3342'); gr.addColorStop(0.45, '#151b25'); gr.addColorStop(1, '#0a0e14');
    return gr;
  };
  const L = [[57, 822], [196, 876], [206, 1000], [57, 1000]];
  const R = [[508, 822], [369, 876], [359, 1000], [508, 1000]];
  for (const pts of [L, R]) {
    shape(pts); g.fillStyle = metal(0, 820, 0, 1000); g.fill();
    g.strokeStyle = 'rgba(255,122,26,.5)'; g.lineWidth = 1.5; g.stroke();
  }
  // sredina pod flipperji
  g.fillStyle = metal(0, 985, 0, 1000); g.fillRect(200, 986, 165, 16);
  text(g, CFG.naslov, 128, 916, { size: 13, weight: 900, color: 'rgba(255,170,90,.9)', font: FONT_T, spacing: 1 });
  text(g, CFG.verzija, 128, 934, { size: 10, weight: 700, color: 'rgba(111,211,255,.85)', font: FONT_T, spacing: 4 });
  if (tinted('impol')) {
    // napisna tablica: logotip v originalnih barvah na beli plošči
    const pw = 84, ph = 32, px = 437 - pw / 2, py = 892;
    g.save();
    g.beginPath(); g.roundRect ? g.roundRect(px, py, pw, ph, 5) : g.rect(px, py, pw, ph);
    const pg = g.createLinearGradient(0, py, 0, py + ph);
    // ne čisto bela: svetlejše od praga za bloom bi tablica žarela kot luč
    pg.addColorStop(0, '#c4cdd8'); pg.addColorStop(1, '#a3afbd');
    g.fillStyle = pg; g.fill();
    g.strokeStyle = 'rgba(120,140,165,.9)'; g.lineWidth = 1; g.stroke();
    g.restore();
    drawLogo(g, 'impol', 437, py + ph / 2 + 0.5, pw - 12);
    text(g, '× ' + CFG.firmaB, 437, 937, { size: 10, weight: 800, color: 'rgba(57,255,136,.85)', font: FONT_T, spacing: 2 });
  } else {
    text(g, CFG.firmaA + ' × ' + CFG.firmaB, 437, 916, { size: 11, weight: 800, color: 'rgba(111,211,255,.85)', font: FONT_T, spacing: 1 });
  }
  text(g, 'igra za hec', 437, 952, { size: 9, color: 'rgba(200,210,225,.6)', font: FONT_U });
  // vijaki
  for (const [x, y] of [[70, 990], [190, 990], [375, 990], [495, 990]]) {
    g.beginPath(); g.arc(x, y, 2.5, 0, TAU); g.fillStyle = '#7d8a9c'; g.fill();
    g.beginPath(); g.moveTo(x - 1.6, y); g.lineTo(x + 1.6, y); g.strokeStyle = '#1b222d'; g.lineWidth = 0.8; g.stroke();
  }
  g.restore();
}

/* ------------------------------------------------------------------ */
/* statični neon                                                         */
/* ------------------------------------------------------------------ */
export function drawEmissive(g, T) {
  g.save();
  g.lineCap = 'round';
  g.beginPath(); g.arc(300, 300, 268, Math.PI + 0.06, TAU - 0.06);
  g.strokeStyle = 'rgba(111,211,255,.55)'; g.lineWidth = 2; g.stroke();
  // orbit
  g.beginPath(); g.moveTo(70, 380); g.lineTo(70, 398); g.lineTo(126, 437);
  g.strokeStyle = 'rgba(111,211,255,.6)'; g.lineWidth = 1.6; g.stroke();
  // izstrelitveni kanal
  g.beginPath(); g.moveTo(543, 345); g.lineTo(543, 840);
  g.strokeStyle = 'rgba(255,122,26,.55)'; g.lineWidth = 1.6; g.stroke();
  // inlane vodila
  for (const [a, b, c] of [[[57, 728], [57, 812], [196, 866]], [[508, 728], [508, 812], [369, 866]]]) {
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c);
    g.strokeStyle = 'rgba(255,122,26,.35)'; g.lineWidth = 1.2; g.stroke();
  }
  // plošča misij
  hexPath(g, 295, 598, 104); g.strokeStyle = 'rgba(111,211,255,.25)'; g.lineWidth = 1.2; g.stroke();
  // peč
  g.beginPath(); g.arc(SCOOP.x, SCOOP.y, 31, 2.05, 2.05 + TAU - 1.25);
  g.strokeStyle = 'rgba(255,122,26,.5)'; g.lineWidth = 2; g.stroke();
  g.restore();
}

/* ------------------------------------------------------------------ */
/* rampa                                                                */
/* ------------------------------------------------------------------ */
function rampBodyPath(g) {
  const R = RAMP;
  g.beginPath();
  g.moveTo(R.upL - 3, R.entryY + 2);
  g.lineTo(R.upL - 3, R.turnY);
  g.arc(R.turnCx, R.turnY, R.turnRi - 3, 0, -Math.PI, true);
  g.lineTo(R.downR + 3, 600);
  g.lineTo(93 + 3, 694);
  g.lineTo(63 - 3, 690);
  g.lineTo(R.downL - 3, 600);
  g.lineTo(R.downL - 3, R.turnY);
  g.arc(R.turnCx, R.turnY, R.turnR + 3, Math.PI, 0, false);
  g.lineTo(R.upR + 3, R.entryY + 2);
  g.closePath();
}

export function drawRamp(g) {
  const R = RAMP;
  g.save();
  // prosojna plastika (vzpon + zavoj)
  const up = new Path2D();
  up.moveTo(R.upL - 3, R.entryY + 4); up.lineTo(R.upL - 3, R.turnY);
  up.arc(R.turnCx, R.turnY, R.turnRi - 3, 0, -Math.PI, true);
  up.lineTo(R.downR + 3, R.turnY + 40); up.lineTo(R.downL - 3, R.turnY + 40);
  up.lineTo(R.downL - 3, R.turnY);
  up.arc(R.turnCx, R.turnY, R.turnR + 3, Math.PI, 0, false);
  up.lineTo(R.upR + 3, R.entryY + 4); up.closePath();
  const gr = g.createLinearGradient(0, R.entryY, 0, R.turnY - R.turnR);
  gr.addColorStop(0, 'rgba(111,211,255,0.10)');
  gr.addColorStop(1, 'rgba(160,225,255,0.30)');
  g.fillStyle = gr; g.fill(up);
  // svetlobni odsev na plastiki
  g.save(); g.clip(up);
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(R.upL + 6, R.entryY); g.lineTo(R.upL + 6, R.turnY); g.arc(R.turnCx, R.turnY, R.turnRi + 6, 0, -Math.PI * 0.6, true); g.stroke();
  // prečne rebra
  g.strokeStyle = 'rgba(200,235,255,0.16)'; g.lineWidth = 1;
  for (let y = R.entryY - 10; y > R.turnY; y -= 22) { g.beginPath(); g.moveTo(R.upL, y); g.lineTo(R.upR, y); g.stroke(); }
  g.restore();

  // stranske ograje (kovina)
  const rail = (pts, arcDef) => {
    const p = new Path2D();
    pts.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y));
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#0e131b'; g.lineWidth = 6; g.stroke(p);
    g.strokeStyle = '#8c9aac'; g.lineWidth = 3.2; g.stroke(p);
    g.strokeStyle = 'rgba(250,252,255,.85)'; g.lineWidth = 1; g.stroke(p);
  };
  const arcPts = (r, a0, a1, n = 24) => {
    const out = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([R.turnCx + Math.cos(a) * r, R.turnY + Math.sin(a) * r]); }
    return out;
  };
  rail([[R.upR, R.entryY], [R.upR, R.turnY], ...arcPts(R.turnR, 0, -Math.PI).slice(1), [R.downL, 600], [63, 688]]);
  rail([[R.upL, R.entryY], [R.upL, R.turnY], ...arcPts(R.turnRi, 0, -Math.PI).slice(1), [R.downR, 600], [93, 692]]);

  // žični del (spust) — habitrail: dve žici nad igralno površino
  g.strokeStyle = 'rgba(210,222,236,.9)'; g.lineWidth = 1.3;
  for (const off of [-6, 6]) {
    g.beginPath(); g.moveTo(94 + off, R.turnY + 40); g.lineTo(94 + off, 600); g.lineTo(78 + off, 688); g.stroke();
  }
  g.strokeStyle = 'rgba(150,165,185,.8)'; g.lineWidth = 1.2;
  for (let y = R.turnY + 60; y < 680; y += 34) {
    const k = y > 600 ? (y - 600) / 88 : 0, cx = 94 - 16 * k;
    g.beginPath(); g.moveTo(cx - 15, y); g.lineTo(cx + 15, y); g.stroke();
  }
  // vhodna loputa
  g.fillStyle = '#7d8a9c';
  g.beginPath(); g.moveTo(R.upL - 2, R.entryY + 4); g.lineTo(R.upR + 2, R.entryY + 4); g.lineTo(R.upR + 6, R.entryY + 12); g.lineTo(R.upL - 6, R.entryY + 12); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(R.upL - 2, R.entryY + 4, R.upR - R.upL + 4, 1.2);
  // napis
  text(g, 'STISKALNICA', R.turnCx, R.turnY - R.turnR + 12, { size: 7, color: 'rgba(230,248,255,.75)', font: FONT_T, spacing: 1 });
  g.restore();
}

export function drawRampEmissive(g) {
  const R = RAMP;
  g.save();
  g.strokeStyle = 'rgba(111,211,255,.55)'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(R.upR + 3, R.entryY); g.lineTo(R.upR + 3, R.turnY);
  g.arc(R.turnCx, R.turnY, R.turnR + 3, 0, -Math.PI, true); g.stroke();
  g.restore();
}

/* ------------------------------------------------------------------ */
/* oblike insertov                                                       */
/* ------------------------------------------------------------------ */
export function lampShape(g, l, k = 1) {
  const r = l.r * k;
  g.beginPath();
  switch (l.shape) {
    case 'arrow':
      g.moveTo(r * 1.15, 0); g.lineTo(-r * 0.7, -r * 0.8); g.lineTo(-r * 0.35, 0); g.lineTo(-r * 0.7, r * 0.8); g.closePath();
      break;
    case 'chevron':
      g.moveTo(0, -r * 0.7); g.lineTo(r, r * 0.3); g.lineTo(r * 0.6, r * 0.7); g.lineTo(0, 0); g.lineTo(-r * 0.6, r * 0.7); g.lineTo(-r, r * 0.3); g.closePath();
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
        i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      break;
    default:
      g.arc(0, 0, r, 0, TAU);
  }
}

/* ------------------------------------------------------------------ */
/* panorama za kromirano žogico                                          */
/* ------------------------------------------------------------------ */
export function makeEnvMap() {
  const c = makeCanvas(256, 128), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, '#dfe9f5'); sky.addColorStop(0.35, '#7b8899'); sky.addColorStop(0.55, '#2b3340');
  sky.addColorStop(0.75, '#14181f'); sky.addColorStop(1, '#3a2a20');
  g.fillStyle = sky; g.fillRect(0, 0, 256, 128);
  // okna / luči strehe tovarne
  for (let i = 0; i < 8; i++) {
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(i * 32 + 6, 10, 18, 8);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(i * 32 + 4, 22, 22, 4);
  }
  // talina in neon
  const blob = (x, y, r, col) => {
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  blob(60, 92, 30, 'rgba(255,120,30,0.9)');
  blob(190, 88, 26, 'rgba(111,211,255,0.7)');
  blob(130, 100, 18, 'rgba(57,255,136,0.5)');
  return c;
}
