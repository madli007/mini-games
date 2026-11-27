/* =====================================================================
   BOŽIČNA MIZA — STATIČNA IN DINAMIČNA GRAFIKA (vse proceduralno, brez slikovnih datotek)
   floor  : snežna noč (temno modra pokrajina, vasica z okni, zameti, zaledenel ribnik — prosojen → kovina kot led)
   mask   : G = ogenj v dimniku (animiran v shaderju)
   raised : les in rdeč lak na robovih, zlate letve, vodila kot sladkorne palčke, plastike (bodika, snežne kape), predpasnik
   emis   : girlanda lučk ob loku, topla GI
   ramp   : ledena žičnata »Smučka« s trakovi sladkornih palčk, rdeča »Vlakec igrač« s tiri
   toys   : jelka (lučke po napredku, zvezda z bloomom), vreča z zaklenjenimi žogicami, pokrova lukenj,
            dim iz dimnika, vlakec na rampi, sani z jeleni (med multiballom), sneženje
   ===================================================================== */
import { W, H, TAU } from '../../pinball/src/engine/config.js';
import { rng, tablePath, text, hexA, drawWall, lampSockets, shadows, FONT_T, FONT_U } from '../../pinball/src/engine/render/art.js';
import { PAL, SHOTS } from './config.js';
import { POS, RAMP_L, RAMP_R, smooth } from './table.js';

const PL = smooth(RAMP_L), PR = smooth(RAMP_R);

/* ------------------------------------------------------------------ */
/* pomožne oblike                                                       */
/* ------------------------------------------------------------------ */
function house(g, x, y, w, h, roof, r, lit) {
  // stena
  g.fillStyle = '#1c2a4a'; g.fillRect(x, y - h, w, h);
  // streha s snegom
  g.beginPath(); g.moveTo(x - 4, y - h); g.lineTo(x + w / 2, y - h - roof); g.lineTo(x + w + 4, y - h); g.closePath();
  g.fillStyle = '#2a1820'; g.fill();
  g.beginPath(); g.moveTo(x - 5, y - h + 1); g.lineTo(x + w / 2, y - h - roof - 1); g.lineTo(x + w + 5, y - h + 1);
  g.lineTo(x + w + 1, y - h + 3); g.lineTo(x + w / 2, y - h - roof + 4); g.lineTo(x - 1, y - h + 3); g.closePath();
  g.fillStyle = '#e8f2ff'; g.fill();
  // okna (topla svetloba)
  const nw = Math.max(1, Math.floor(w / 12));
  for (let i = 0; i < nw; i++) {
    const wx = x + 4 + i * (w - 8) / nw + 1, wy = y - h * 0.65;
    if (r() < lit) {
      const gr = g.createRadialGradient(wx + 2.5, wy + 3, 0.5, wx + 2.5, wy + 3, 12);
      gr.addColorStop(0, 'rgba(255,200,110,0.55)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
      g.fillStyle = gr; g.fillRect(wx - 10, wy - 9, 25, 24);
      g.fillStyle = '#ffcf7a'; g.fillRect(wx, wy, 5, 6);
      g.fillStyle = 'rgba(120,60,20,.8)'; g.fillRect(wx + 2.2, wy, 0.8, 6); g.fillRect(wx, wy + 2.6, 5, 0.8);
    } else { g.fillStyle = '#0d1426'; g.fillRect(wx, wy, 5, 6); }
  }
}

function pine(g, x, y, s, snow = true) {
  g.fillStyle = '#0f3a2c';
  for (let k = 0; k < 3; k++) {
    const yy = y - k * s * 0.55, w = s * (0.7 - k * 0.16);
    g.beginPath(); g.moveTo(x, yy - s * 0.75); g.lineTo(x - w, yy); g.lineTo(x + w, yy); g.closePath(); g.fill();
    if (snow) {
      g.fillStyle = 'rgba(235,245,255,.85)';
      g.beginPath(); g.moveTo(x, yy - s * 0.75); g.lineTo(x - w * 0.35, yy - s * 0.48); g.lineTo(x + w * 0.35, yy - s * 0.48); g.closePath(); g.fill();
      g.fillStyle = '#0f3a2c';
    }
  }
  g.fillStyle = '#3a2214'; g.fillRect(x - 1.5, y, 3, s * 0.2);
}

function snowflake(g, x, y, r, a = 0.5) {
  g.save(); g.translate(x, y);
  g.strokeStyle = `rgba(220,238,255,${a})`; g.lineWidth = 1; g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(r, 0); g.moveTo(r * 0.55, 0); g.lineTo(r * 0.75, r * 0.2); g.moveTo(r * 0.55, 0); g.lineTo(r * 0.75, -r * 0.2); g.stroke();
  }
  g.restore();
}

const pathOf = (g, P) => { g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); };
function offsetPath(P, d) {
  return P.map((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    return [p[0] - ty * d, p[1] + tx * d];
  });
}
/** točka na poti po deležu dolžine (0–1) in smer */
export function along(P, k) {
  let L = 0; const seg = [];
  for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(l); L += l; }
  let d = Math.max(0, Math.min(1, k)) * L;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? d / seg[i] : 0, a = P[i], b = P[i + 1];
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    d -= seg[i];
  }
  return { x: P[0][0], y: P[0][1], a: 0 };
}

/* ------------------------------------------------------------------ */
/* potisk mize                                                          */
/* ------------------------------------------------------------------ */
export function drawFloor(g, T) {
  const r = rng(23);
  g.save();
  tablePath(g, false, T); g.clip();

  // nočno nebo → sneg (neprosojno: brez kovine, razen na ledu)
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#061028'); sky.addColorStop(0.32, '#0b1a3e'); sky.addColorStop(0.55, '#13285a');
  sky.addColorStop(0.75, '#1a3366'); sky.addColorStop(1, '#0d1b3a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // zvezde in luna
  for (let i = 0; i < 140; i++) {
    const x = 30 + r() * 540, y = 30 + r() * 330, s = r();
    g.fillStyle = `rgba(230,240,255,${0.25 + s * 0.6})`; g.fillRect(x, y, s > 0.9 ? 1.6 : 1, s > 0.9 ? 1.6 : 1);
  }
  const moon = g.createRadialGradient(470, 205, 4, 470, 205, 60);
  moon.addColorStop(0, 'rgba(255,248,225,.95)'); moon.addColorStop(0.28, 'rgba(255,240,200,.9)'); moon.addColorStop(0.32, 'rgba(255,230,170,.18)'); moon.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = moon; g.fillRect(410, 145, 120, 120);
  g.beginPath(); g.arc(476, 200, 15, 0, TAU); g.fillStyle = '#0b1a3e'; g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1;
  // severni sij (rahlo)
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    const gr = g.createLinearGradient(0, 120 + k * 40, 0, 220 + k * 40);
    gr.addColorStop(0, 'rgba(80,255,190,0)'); gr.addColorStop(0.5, `rgba(80,220,255,${0.05 - k * 0.012})`); gr.addColorStop(1, 'rgba(80,255,190,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(40, 230 + k * 30);
    for (let x = 40; x <= 560; x += 20) g.lineTo(x, 170 + k * 34 + Math.sin(x / 70 + k) * 26);
    g.lineTo(560, 300); g.lineTo(40, 300); g.closePath(); g.fill();
  }
  g.restore();

  // daljni hribi in gozd
  g.fillStyle = '#122650';
  g.beginPath(); g.moveTo(20, 470); for (let x = 20; x <= 580; x += 10) g.lineTo(x, 420 + Math.sin(x / 55) * 18 + Math.sin(x / 23) * 6); g.lineTo(580, 600); g.lineTo(20, 600); g.closePath(); g.fill();
  for (let i = 0; i < 22; i++) pine(g, 30 + i * 25 + r() * 10, 455 + Math.sin(i) * 10, 16 + r() * 8);
  // snežna pobočja
  const hill = g.createLinearGradient(0, 470, 0, 1000);
  hill.addColorStop(0, '#3a5a98'); hill.addColorStop(0.2, '#26417a'); hill.addColorStop(0.6, '#182c5c'); hill.addColorStop(1, '#0e1a3c');
  g.fillStyle = hill;
  g.beginPath(); g.moveTo(20, 520); for (let x = 20; x <= 580; x += 10) g.lineTo(x, 498 + Math.sin(x / 90 + 1) * 22); g.lineTo(580, 1000); g.lineTo(20, 1000); g.closePath(); g.fill();

  // vasica s prižganimi okni (za puščicami, med slingi)
  const hs = [[118, 640, 30, 24, 16], [152, 650, 24, 30, 14], [182, 636, 34, 22, 18], [372, 636, 34, 22, 18], [408, 652, 26, 30, 14], [440, 640, 30, 22, 16]];
  for (const [x, y, w, h, rf] of hs) house(g, x, y, w, h, rf, r, 0.85);
  // cerkvica s zvonikom
  g.fillStyle = '#1c2a4a'; g.fillRect(270, 560, 26, 34); g.fillRect(276, 532, 14, 30);
  g.beginPath(); g.moveTo(274, 532); g.lineTo(283, 512); g.lineTo(292, 532); g.closePath(); g.fillStyle = '#2a1820'; g.fill();
  g.fillStyle = '#ffcf7a'; g.fillRect(281, 540, 4, 6); g.fillRect(276, 570, 5, 7); g.fillRect(285, 570, 5, 7);
  // zameti ob robovih in pod vasjo
  g.save();
  for (const [x, y, rx, ry] of [[40, 700, 60, 30], [560, 700, 60, 30], [90, 690, 70, 16], [470, 690, 70, 16], [282, 640, 120, 14], [30, 980, 70, 60], [570, 980, 70, 60]]) {
    const gr = g.createRadialGradient(x, y, 2, x, y, Math.max(rx, ry));
    gr.addColorStop(0, 'rgba(225,238,255,.32)'); gr.addColorStop(1, 'rgba(225,238,255,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  }
  g.restore();
  // drobne snežinke na potisku
  for (let i = 0; i < 26; i++) snowflake(g, 40 + r() * 520, 480 + r() * 460, 3 + r() * 4, 0.16 + r() * 0.12);

  // zaledenel ribnik v sredini (prosojen: pod njim kovina = led z odsevom)
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.ellipse(282.5, 780, 70, 26, 0, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill();
  g.restore();
  g.beginPath(); g.ellipse(282.5, 780, 70, 26, 0, 0, TAU); g.strokeStyle = 'rgba(200,235,255,.45)'; g.lineWidth = 1.5; g.stroke();
  // kanal orbitov: sankaška proga (levo) in ledena pot (desno)
  g.save();
  g.fillStyle = 'rgba(225,240,255,.18)'; g.fillRect(22, 330, 46, 140); g.fillRect(507, 300, 36, 180);
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;
  for (let y = 336; y < 470; y += 12) { g.beginPath(); g.moveTo(26, y); g.lineTo(64, y + 5); g.stroke(); }
  g.restore();
  // kanal centra (zlat okvir) in podlaga pod jelko
  const tg = g.createRadialGradient(POS.tree[0], POS.tree[1] + 10, 10, POS.tree[0], POS.tree[1] + 10, 110);
  tg.addColorStop(0, 'rgba(255,210,120,.28)'); tg.addColorStop(1, 'rgba(255,190,90,0)');
  g.fillStyle = tg; g.fillRect(170, 170, 230, 240);

  // dimnik na strehi (Sankališče) in nabiralnik (desni orbit): luknji
  chimneyFloor(g, POS.vuk[0], POS.vuk[1]);
  mailboxFloor(g, POS.scoop[0], POS.scoop[1]);

  // GI: topla svetloba ob robovih
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const l of T.lamps) {
    if (l.group !== 'gi') continue;
    const gr = g.createRadialGradient(l.x, l.y, 2, l.x, l.y, 80);
    gr.addColorStop(0, 'rgba(255,180,100,0.11)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = gr; g.fillRect(l.x - 80, l.y - 80, 160, 160);
  }
  g.restore();

  // imena strelov (gravura)
  const lab = (s, x, y, rot = 0, col = 'rgba(230,240,255,.62)') => text(g, s, x, y, { size: 7.5, weight: 800, color: col, font: FONT_T, spacing: 1, rot });
  lab(SHOTS.orbitL.toUpperCase(), 52, 520, -Math.PI / 2 + 0.12);
  lab(SHOTS.drops.toUpperCase(), 150, 560, -0.5, 'rgba(180,215,255,.7)');
  lab(SHOTS.center.toUpperCase(), 282.5, 618, 0, 'rgba(255,225,150,.8)');
  lab('ORBIT · ✉', 492, 560, -1.1);
  lab(SHOTS.kepa.toUpperCase(), 452, 74, 0.25);
  text(g, 'ADVENTNI VENEC', 282.5, 716, { size: 6, weight: 700, color: 'rgba(210,170,255,.6)', font: FONT_T, spacing: 1 });
  text(g, 'VREČA', 108, 108, { size: 6.5, weight: 800, color: 'rgba(170,255,200,.7)', font: FONT_T, spacing: 1, rot: -0.55 });

  lampSockets(g, T);
  shadows(g, T);
  g.restore();
}

function chimneyFloor(g, x, y) {
  g.save();
  // opeke okoli luknje
  g.fillStyle = '#6e2a1c'; g.fillRect(x - 23, y - 20, 46, 40);
  g.strokeStyle = 'rgba(30,10,6,.8)'; g.lineWidth = 1;
  for (let row = 0; row < 5; row++) {
    const yy = y - 20 + row * 8;
    g.beginPath(); g.moveTo(x - 23, yy); g.lineTo(x + 23, yy); g.stroke();
    for (let c = (row % 2) * 6; c < 46; c += 12) { g.beginPath(); g.moveTo(x - 23 + c, yy); g.lineTo(x - 23 + c, yy + 8); g.stroke(); }
  }
  g.fillStyle = 'rgba(240,248,255,.85)'; g.fillRect(x - 25, y - 23, 50, 5);
  // luknja
  g.beginPath(); g.arc(x, y, 15, 0, TAU); g.fillStyle = '#050303'; g.fill();
  g.strokeStyle = '#ffb26a'; g.globalAlpha = 0.45; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1;
  g.restore();
}
function mailboxFloor(g, x, y) {
  g.save();
  g.beginPath(); g.roundRect ? g.roundRect(x - 18, y - 20, 36, 40, 8) : g.rect(x - 18, y - 20, 36, 40);
  const gr = g.createLinearGradient(x - 18, 0, x + 18, 0);
  gr.addColorStop(0, '#8e0f22'); gr.addColorStop(0.5, '#d2203a'); gr.addColorStop(1, '#7a0c1c');
  g.fillStyle = gr; g.fill();
  g.strokeStyle = '#ffd166'; g.lineWidth = 1.4; g.stroke();
  g.beginPath(); g.arc(x, y, 15, 0, TAU); g.fillStyle = '#050303'; g.fill();
  text(g, '✉', x, y - 26, { size: 9, color: 'rgba(255,230,180,.9)' });
  g.restore();
}

/* ------------------------------------------------------------------ */
export function drawMask(g) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // ogenj v dimniku
  const [x, y] = POS.vuk;
  const gr = g.createRadialGradient(x, y, 3, x, y, 15);
  gr.addColorStop(0, 'rgb(0,255,0)'); gr.addColorStop(0.7, 'rgb(0,200,0)'); gr.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, 15, 0, TAU); g.fill();
}

/* ------------------------------------------------------------------ */
/* dvignjeni elementi                                                    */
/* ------------------------------------------------------------------ */
export function drawRaised(g, T) {
  // ohišje: temen les
  g.save();
  g.beginPath(); g.rect(-50, -50, W + 100, H + 100);
  tablePath(g, true, T);
  const cab = g.createLinearGradient(0, 0, W, 0);
  cab.addColorStop(0, '#1a0c07'); cab.addColorStop(0.5, '#2a140b'); cab.addColorStop(1, '#1a0c07');
  g.fillStyle = cab; g.fill('evenodd');
  g.restore();
  // stranica: rdeč lak + zlata letev
  g.save();
  g.lineJoin = 'round';
  tablePath(g, false, T);
  g.strokeStyle = '#2b0a0f'; g.lineWidth = 12; g.stroke();
  g.strokeStyle = '#a3132a'; g.lineWidth = 7; g.stroke();
  g.strokeStyle = 'rgba(255,120,130,.35)'; g.lineWidth = 2; g.stroke();
  g.strokeStyle = '#e8b64a'; g.lineWidth = 1.6; g.stroke();
  g.restore();
  // ivje v vogalih (steklo)
  for (const [x, y, a] of [[22, 990, -0.8], [578, 990, -2.3], [40, 312, 0.6], [560, 312, 2.5]]) frost(g, x, y, a);

  // pokrov izstrelitvenega kanala
  g.fillStyle = 'rgba(40,12,8,0.55)'; g.fillRect(546, 336, 33, 700);
  for (let y = 360; y < 1000; y += 40) { g.fillStyle = 'rgba(232,182,74,.55)'; g.fillRect(549, y, 27, 1.2); }

  // stene in vodila po izgledu
  for (const s of T.segs) {
    if (!s.draw || s.layer !== 0 || s.look === 'outer' || s.look === 'upPost' || s.look === 'diverter') continue;
    if (s.look === 'candy') candyWall(g, s);
    else if (s.look === 'gold') goldWall(g, s);
    else drawWall(g, s);
  }

  // plastike: snežne kape na slingih, bodika ob inlanih, zvonček nad kanali
  snowCap(g, [[100, 705], [100, 790], [165, 828]], -1);
  snowCap(g, [[465, 705], [465, 790], [400, 828]], 1);
  holly(g, 60, 668); holly(g, 505, 668);
  lanePlastic(g);
  // zgornji flipper: nosilec
  g.beginPath(); g.arc(POS.upper.px, POS.upper.py, 15, 0, TAU); g.fillStyle = '#2a1209'; g.fill();
  g.strokeStyle = '#e8b64a'; g.lineWidth = 1.2; g.stroke();

  apron(g);
}

function frost(g, x, y, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  const gr = g.createRadialGradient(0, 0, 2, 0, 0, 70);
  gr.addColorStop(0, 'rgba(230,245,255,.28)'); gr.addColorStop(1, 'rgba(230,245,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 70, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(235,248,255,.35)'; g.lineWidth = 0.7;
  const rr = rng(Math.round(x * 7 + y));
  for (let i = 0; i < 9; i++) {
    let px = 0, py = 0, ang = (rr() - 0.5) * 1.6;
    g.beginPath(); g.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += Math.cos(ang) * 8; py += Math.sin(ang) * 8; ang += (rr() - 0.5) * 0.9; g.lineTo(px, py); }
    g.stroke();
  }
  g.restore();
}

function candyWall(g, s) {
  const dx = s.bx - s.ax, dy = s.by - s.ay, L = Math.hypot(dx, dy), w = Math.max(5, s.r * 2 + 1.5);
  g.save();
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by);
  g.strokeStyle = '#2a0a0e'; g.lineWidth = w + 3; g.stroke();
  g.strokeStyle = '#f6f1f3'; g.lineWidth = w; g.stroke();
  // rdeče proge
  g.translate(s.ax, s.ay); g.rotate(Math.atan2(dy, dx));
  g.beginPath(); g.rect(-w / 2, -w / 2, L + w, w); g.clip();
  g.fillStyle = '#d81e35';
  for (let x = -w; x < L + w; x += 9) { g.beginPath(); g.moveTo(x, -w / 2); g.lineTo(x + 4, -w / 2); g.lineTo(x + 4 + w * 0.8, w / 2); g.lineTo(x + w * 0.8, w / 2); g.closePath(); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-w / 2, -w / 2, L + w, 1.2);
  g.restore();
}
function goldWall(g, s) {
  g.save(); g.lineCap = 'round';
  const line = () => { g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); };
  line(); g.strokeStyle = '#2b1a04'; g.lineWidth = 9; g.stroke();
  line(); g.strokeStyle = '#a8761c'; g.lineWidth = 6; g.stroke();
  line(); g.strokeStyle = '#f7d27a'; g.lineWidth = 2.5; g.stroke();
  g.translate(-0.6, -0.8); line(); g.strokeStyle = 'rgba(255,250,230,.8)'; g.lineWidth = 0.8; g.stroke();
  g.restore();
}
function snowCap(g, [A, B, C], side) {
  g.save();
  g.beginPath(); g.moveTo(A[0], A[1] - 4); g.lineTo(B[0] + side * 2, B[1] - 2); g.lineTo(C[0] - side * 4, C[1] + 2); g.closePath();
  const gr = g.createLinearGradient(A[0], A[1], C[0], C[1]);
  gr.addColorStop(0, 'rgba(255,60,80,.42)'); gr.addColorStop(1, 'rgba(255,60,80,.18)');
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(255,120,130,.8)'; g.lineWidth = 1.2; g.stroke();
  // sneg na vrhu
  g.beginPath(); g.moveTo(A[0] - 6, A[1] - 4); g.quadraticCurveTo(A[0] + side * -1, A[1] - 12, A[0] + 8 * -side, A[1] + 6);
  g.lineTo(A[0] + 3 * -side, A[1] + 14); g.quadraticCurveTo(A[0] - 2, A[1] + 4, A[0] - 6, A[1] - 4);
  g.fillStyle = 'rgba(240,248,255,.92)'; g.fill();
  text(g, 'SANKAČ', (A[0] + B[0] + C[0]) / 3 - side * 2, (A[1] + B[1] + C[1]) / 3 + 4, { size: 7, color: 'rgba(255,240,240,.85)', font: FONT_T, rot: side < 0 ? 1.25 : -1.25, spacing: 1 });
  g.restore();
}
function holly(g, x, y) {
  g.save(); g.translate(x, y);
  for (const a of [-0.6, 0.6, Math.PI]) {
    g.save(); g.rotate(a);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(7, -7, 16, -2); g.quadraticCurveTo(9, 2, 0, 0); g.closePath();
    g.fillStyle = 'rgba(40,140,70,.85)'; g.fill(); g.strokeStyle = 'rgba(140,255,170,.5)'; g.lineWidth = 0.7; g.stroke();
    g.restore();
  }
  for (const [bx, by] of [[-2, -3], [3, -2], [0, 2]]) { g.beginPath(); g.arc(bx, by, 2.4, 0, TAU); g.fillStyle = '#e0283c'; g.fill(); }
  g.restore();
}
function lanePlastic(g) {
  g.save();
  g.beginPath(); g.moveTo(196, 70); g.lineTo(414, 70); g.lineTo(406, 88); g.lineTo(204, 88); g.closePath();
  const gr = g.createLinearGradient(0, 70, 0, 88);
  gr.addColorStop(0, 'rgba(255,214,102,.55)'); gr.addColorStop(1, 'rgba(255,170,60,.25)');
  g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(255,230,160,.85)'; g.lineWidth = 1; g.stroke();
  text(g, 'Z · V · O · N', 305, 80, { size: 9, weight: 900, color: 'rgba(80,30,10,.9)', font: FONT_T, spacing: 2 });
  g.restore();
}

function apron(g) {
  g.save();
  const shape = pts => { g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); };
  const L = [[57, 822], [196, 876], [206, 1000], [57, 1000]];
  const R = [[508, 822], [369, 876], [359, 1000], [508, 1000]];
  for (const pts of [L, R]) {
    shape(pts);
    const gr = g.createLinearGradient(0, 820, 0, 1000);
    gr.addColorStop(0, '#5a1020'); gr.addColorStop(0.5, '#3b0a15'); gr.addColorStop(1, '#22060c');
    g.fillStyle = gr; g.fill();
    g.strokeStyle = '#e8b64a'; g.lineWidth = 1.6; g.stroke();
  }
  g.fillStyle = '#22060c'; g.fillRect(200, 986, 165, 16);
  // kartica pravil (levo) in legende (desno)
  card(g, 66, 884, 124, 100, 'PRAVILA', [
    ['PARKLJI → DIMNIK ODPRT', '#9cc8ff'], ['3 LOCKI V VREČI → MULTIBALL', '#4cf08a'], ['RAMPE + ORBITA = JACKPOT', '#ff5a6a'],
    ['VSI 4 → SUPER V JELKI', '#ffd166'], ['Z·V·O·N → BONUS ×', '#ffd166'], ['10 RAMP → EXTRA BALL ✉', '#ff9a3c'],
  ]);
  card(g, 376, 884, 124, 100, 'LEGENDA', [
    ['● RDEČA  multiball, jackpot', '#ff4d5e'], ['● ZLATA  super jackpot', '#ffd166'], ['● ZELENA  lock', '#4cf08a'],
    ['● ORANŽNA  extra ball', '#ff9a3c'], ['● VIJOLIČNA  mystery', '#c77dff'], ['● BELA  combo · utripa = zdaj!', '#f6fbff'],
  ]);
  g.restore();
}
function card(g, x, y, w, h, title, lines) {
  g.save();
  g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 6) : g.rect(x, y, w, h);
  g.fillStyle = 'rgba(250,244,230,.92)'; g.fill();
  g.strokeStyle = '#a8761c'; g.lineWidth = 1.2; g.stroke();
  text(g, title, x + w / 2, y + 10, { size: 8, weight: 900, color: '#8e0f22', font: FONT_T, spacing: 2 });
  lines.forEach(([s, c], i) => {
    const yy = y + 24 + i * 12.5;
    g.fillStyle = c; g.beginPath(); g.arc(x + 7, yy, 2.6, 0, TAU); g.fill();
    text(g, s.replace(/^● /, ''), x + 13, yy, { size: 6.6, weight: 700, color: '#2a1810', font: FONT_U, align: 'left' });
  });
  g.restore();
}

/* ------------------------------------------------------------------ */
/* statični neon: girlanda in topli robovi                               */
/* ------------------------------------------------------------------ */
export function drawEmissive(g) {
  g.save();
  g.lineCap = 'round';
  // girlanda (rahel povešen lok med lučkami)
  g.beginPath();
  for (let i = 0; i <= 60; i++) {
    const a = Math.PI + 0.2 + (Math.PI - 0.4) * i / 60, sag = 6 * Math.abs(Math.sin(i * Math.PI / 4));
    const x = 300 + (266 - sag) * Math.cos(a), y = 300 + (266 - sag) * Math.sin(a);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.strokeStyle = 'rgba(80,200,120,.35)'; g.lineWidth = 2.2; g.stroke();
  // topli robovi ob stenah
  g.strokeStyle = 'rgba(255,170,90,.32)'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(24, 700); g.lineTo(24, 320); g.stroke();
  g.beginPath(); g.moveTo(576, 700); g.lineTo(576, 320); g.stroke();
  // okna vasi (rahel sij)
  for (const [x, y] of [[124, 625], [158, 630], [190, 622], [378, 622], [414, 632], [446, 625], [283, 543]]) {
    g.fillStyle = 'rgba(255,190,90,.35)'; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill();
  }
  g.restore();
}

/* ------------------------------------------------------------------ */
/* rampi                                                                */
/* ------------------------------------------------------------------ */
export function drawRamp(g) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  // ---- »Vlakec igrač« (rdeča plastika s tiri), plast 2 ----
  pathOf(g, PR); g.strokeStyle = 'rgba(255,60,80,.20)'; g.lineWidth = 34; g.stroke();
  pathOf(g, PR); g.strokeStyle = 'rgba(255,140,150,.10)'; g.lineWidth = 22; g.stroke();
  // pragovi in tirnici
  let acc = 0;
  for (let i = 1; i < PR.length; i++) {
    const a = PR[i - 1], b = PR[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
    for (let s = (12 - acc % 12); s < l; s += 12) {
      const k = s / l, x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k;
      g.beginPath(); g.moveTo(x - nx * 9, y - ny * 9); g.lineTo(x + nx * 9, y + ny * 9);
      g.strokeStyle = 'rgba(110,60,30,.75)'; g.lineWidth = 2.2; g.stroke();
    }
    acc += l;
  }
  for (const d of [-5.5, 5.5]) { pathOf(g, offsetPath(PR, d)); g.strokeStyle = 'rgba(210,220,235,.9)'; g.lineWidth = 1.3; g.stroke(); }
  for (const d of [-15, 15]) {
    pathOf(g, offsetPath(PR, d));
    g.strokeStyle = '#2b0a0f'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = '#d81e35'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(255,210,215,.8)'; g.lineWidth = 0.9; g.stroke();
  }
  // ---- »Smučka« (ledena žična rampa s trakovi sladkornih palčk), plast 1 ----
  pathOf(g, PL); g.strokeStyle = 'rgba(160,220,255,.12)'; g.lineWidth = 30; g.stroke();
  for (const d of [-13, 13]) {
    const P = offsetPath(PL, d);
    pathOf(g, P); g.strokeStyle = 'rgba(0,10,30,.5)'; g.lineWidth = 3.6; g.stroke();
    pathOf(g, P); g.strokeStyle = 'rgba(225,240,255,.95)'; g.lineWidth = 1.7; g.stroke();
  }
  // trak sladkorne palčke ovit okoli žic
  acc = 0;
  for (let i = 1; i < PL.length; i++) {
    const a = PL[i - 1], b = PL[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
    for (let s = (16 - acc % 16); s < l; s += 16) {
      const k = s / l, x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k, red = Math.round((acc + s) / 16) % 2;
      g.beginPath(); g.moveTo(x - nx * 13, y - ny * 13); g.lineTo(x + nx * 13, y + ny * 13);
      g.strokeStyle = red ? 'rgba(230,40,60,.85)' : 'rgba(250,250,255,.8)'; g.lineWidth = 1.6; g.stroke();
    }
    acc += l;
  }
  // vhodni loputi
  for (const [P, col] of [[PL, '#bfe6ff'], [PR, '#ff8a96']]) {
    const [x, y] = P[0];
    g.fillStyle = col; g.globalAlpha = 0.75;
    g.beginPath(); g.moveTo(x - 14, y + 2); g.lineTo(x + 14, y + 2); g.lineTo(x + 17, y + 10); g.lineTo(x - 17, y + 10); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }
  const lbl = (P, k, s, col) => { const p = along(P, k); text(g, s, p.x, p.y, { size: 6.5, weight: 900, color: col, font: FONT_T, spacing: 1, rot: p.a + Math.PI / 2 }); };
  lbl(PL, 0.13, 'SMUČKA', 'rgba(225,245,255,.95)');
  lbl(PR, 0.13, 'VLAKEC', 'rgba(255,215,220,.95)');
  g.restore();
}

export function drawRampEmissive(g) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const d of [-13, 13]) { pathOf(g, offsetPath(PL, d)); g.strokeStyle = 'rgba(130,210,255,.45)'; g.lineWidth = 2; g.stroke(); }
  for (const d of [-15, 15]) { pathOf(g, offsetPath(PR, d)); g.strokeStyle = 'rgba(255,80,100,.35)'; g.lineWidth = 2; g.stroke(); }
  g.restore();
}

/* ------------------------------------------------------------------ */
/* dinamični dekor                                                      */
/* ------------------------------------------------------------------ */
const smoke = [], flakes = [];
let lastT = 0;

const lampV = (game, id, time) => {
  const o = game.lamps[id]; if (!o || !o.v) return 0;
  if (o.v === 1) return 1;
  return o.v === 2 ? 0.5 + 0.5 * Math.sin(time * 6) : (Math.sin(time * 16) > 0 ? 1 : 0.15);
};

function settings() { try { return (globalThis.__pinball && globalThis.__pinball.settings) || {}; } catch (e) { return {}; } }
function quality() { try { return globalThis.__pinball.renderer.q; } catch (e) { return { particles: 1 }; } }

export function drawToys(g, e, game, env, time) {
  const dt = Math.min(0.05, Math.max(0, time - lastT)); lastT = time;
  const R = game.rules, T = game.T;
  // ---- snežaki (obrazi na kapicah bumperjev) ----
  for (const c of T.bumpers) {
    const y = c.y - c.pop * 3.5;
    g.fillStyle = '#1a1a22';
    g.beginPath(); g.arc(c.x - 5, y - 4, 1.8, 0, TAU); g.arc(c.x + 5, y - 4, 1.8, 0, TAU); g.fill();
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(c.x + i * 3, y + 6 - Math.abs(i) * 0.8, 0.9, 0, TAU); g.fill(); }
    g.beginPath(); g.moveTo(c.x - 1, y - 1); g.lineTo(c.x + 9, y + 1.5); g.lineTo(c.x - 1, y + 2); g.closePath(); g.fillStyle = '#ff8a2a'; g.fill();
  }
  // ---- jelka ----
  const toy = T.byId.jelka;
  drawTree(g, e, game, toy, time);
  // ---- vreča z zaklenjenimi žogicami (engine nariše žogice; vreča je prosojna) ----
  drawSack(g, e, T.byId.vreca, time);
  // ---- pokrova lukenj (zaprta luknja = pokrov s snegom) ----
  for (const s of T.saucers) {
    const open = s.capture.maxUp > 0;
    if (!open) {
      g.beginPath(); g.arc(s.x, s.y, 14, 0, TAU);
      const gr = g.createLinearGradient(s.x - 14, s.y - 14, s.x + 14, s.y + 14);
      if (s.id === 'dimnik') { gr.addColorStop(0, '#9aa6b6'); gr.addColorStop(1, '#3d4654'); }
      else { gr.addColorStop(0, '#ffd98a'); gr.addColorStop(1, '#a8761c'); }
      g.fillStyle = gr; g.fill();
      g.beginPath(); g.ellipse(s.x - 2, s.y - 4, 9, 4, 0, 0, TAU); g.fillStyle = 'rgba(245,250,255,.85)'; g.fill();
    } else if (e) {
      const c = s.id === 'dimnik' ? '76,240,138' : '255,154,60';
      e.beginPath(); e.arc(s.x, s.y, 18 + 3 * Math.sin(time * 8), 0, TAU); e.fillStyle = `rgba(${c},${0.35 + 0.2 * Math.sin(time * 8)})`; e.fill();
    }
  }
  // ---- dim iz dimnika ----
  const q = quality(), pk = q.particles ?? 1;
  const [cx, cy] = POS.vuk;
  if (Math.random() < dt * 9 * pk) smoke.push({ x: cx + (Math.random() - 0.5) * 8, y: cy - 16, vx: 12 + Math.random() * 10, vy: -26 - Math.random() * 12, t: 0, life: 2.2 + Math.random(), r: 4 });
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 6;
    if (p.t > p.life) { smoke.splice(i, 1); continue; }
    const a = 0.22 * (1 - p.t / p.life);
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fillStyle = `rgba(200,210,225,${a})`; g.fill();
  }
  // ---- vlakec na desni rampi (pelje ob zadeti rampi) ----
  const tk = R.trainT ? (game.time - R.trainT) / 1.8 : 1;
  drawTrain(g, e, tk < 1 ? 0.05 + tk * 0.9 : 0.04, time);
  // ---- sani z jeleni čez vrh mize (med multiballom in v attract) ----
  if (R.mb || game.state === 'attract') drawSleigh(g, e, (time * 0.09) % 1.25, time);
  // ---- sneženje (subtilno, nikoli prek žogice: drobne prosojne pike) ----
  const st = settings();
  const want = st.snow === false ? 0 : Math.round(60 * pk);
  while (flakes.length < want) flakes.push({ x: 20 + Math.random() * 560, y: Math.random() * 1000, s: 0.6 + Math.random() * 1.2, v: 14 + Math.random() * 22, ph: Math.random() * TAU });
  if (flakes.length > want) flakes.length = want;
  g.fillStyle = 'rgba(240,248,255,.5)';
  for (const f of flakes) {
    f.y += f.v * dt; f.x += Math.sin(time * 0.8 + f.ph) * 6 * dt;
    if (f.y > 1000) { f.y = -4; f.x = 20 + Math.random() * 560; }
    g.globalAlpha = 0.25 + f.s * 0.25;
    g.fillRect(f.x, f.y, f.s, f.s);
  }
  g.globalAlpha = 1;
}

function drawTree(g, e, game, toy, time) {
  const R = game.rules;
  g.save();
  g.translate(toy.x, toy.y); g.rotate(toy.angle);
  // senca
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(8, 58, 40, 9, 0, 0, TAU); g.fill();
  // deblo
  g.fillStyle = '#4a2a14'; g.fillRect(-6, 44, 12, 14);
  // tri plasti iglic s snegom
  const layers = [[52, 40, -6], [36, 30, -32], [22, 20, -56]];
  layers.forEach(([w, h, y0], i) => {
    g.beginPath(); g.moveTo(0, y0 - h - 12); g.lineTo(-w, y0 + 8); g.quadraticCurveTo(0, y0 + 16, w, y0 + 8); g.closePath();
    const gr = g.createLinearGradient(-w, 0, w, 0);
    gr.addColorStop(0, '#0b3a24'); gr.addColorStop(0.45, '#1c6b3e'); gr.addColorStop(1, '#0a2e1d');
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(150,255,190,.25)'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(-w + 3, y0 + 6); g.quadraticCurveTo(0, y0 + 14, w - 3, y0 + 6); g.strokeStyle = 'rgba(240,248,255,.8)'; g.lineWidth = 2.2; g.stroke();
    void i;
  });
  // girlanda zlatih nitk
  g.strokeStyle = 'rgba(255,214,102,.6)'; g.lineWidth = 1;
  for (const [y, w] of [[-14, 40], [-40, 26]]) { g.beginPath(); g.moveTo(-w, y); g.quadraticCurveTo(0, y + 10, w, y - 6); g.stroke(); }
  g.restore();
  // lučke (stanje iz pravil: tree0..8) — v svetovnih koordinatah, z bloomom
  const pos = [[-24, 4], [-8, 8], [8, 8], [24, 4], [-16, -24], [0, -20], [16, -24], [-8, -48], [8, -48]];
  const cols = ['#ff4d5e', '#ffd166', '#8fdcff', '#4cf08a'];
  const c = Math.cos(toy.angle), s = Math.sin(toy.angle);
  pos.forEach(([dx, dy], i) => {
    const x = toy.x + dx * c - dy * s, y = toy.y + dx * s + dy * c;
    const v = lampV(game, 'tree' + i, time + i * 0.37), col = cols[i % 4];
    g.beginPath(); g.arc(x, y, 3.4, 0, TAU); g.fillStyle = v > 0.05 ? col : 'rgba(40,30,30,.8)'; g.fill();
    g.beginPath(); g.arc(x - 1, y - 1, 1.1, 0, TAU); g.fillStyle = 'rgba(255,255,255,.7)'; g.fill();
    if (e && v > 0.05) { e.beginPath(); e.arc(x, y, 7, 0, TAU); e.fillStyle = hexA(col, 0.75 * v); e.fill(); }
  });
  // zvezda na vrhu (bloom)
  const sv = Math.max(lampV(game, 'star', time), R.mb ? 0.5 : 0.25);
  const sx = toy.x + 0 * c - (-78) * s, sy = toy.y + 0 * s + (-78) * c;
  star(g, sx, sy, 11, '#ffd166', '#fff3c4');
  if (e) { star(e, sx, sy, 13 + 4 * sv, hexA('#ffd166', 0.4 + 0.6 * sv)); e.beginPath(); e.arc(sx, sy, 26 * sv, 0, TAU); e.fillStyle = hexA('#ffd166', 0.25 * sv); e.fill(); }
}
function star(g, x, y, r, col, inner) {
  g.save(); g.translate(x, y);
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = col; g.fill();
  if (inner) { g.scale(0.5, 0.5); g.fillStyle = inner; g.fill(); }
  g.restore();
}

function drawSack(g, e, lock, time) {
  const sl = lock.slots;
  const x = (sl[0][0] + sl[2][0]) / 2, y = (sl[0][1] + sl[2][1]) / 2;
  g.save(); g.translate(x, y); g.rotate(-0.55);
  g.beginPath(); g.ellipse(0, 2, 44, 20, 0, 0, TAU);
  const gr = g.createLinearGradient(0, -20, 0, 22);
  gr.addColorStop(0, 'rgba(190,30,50,.38)'); gr.addColorStop(1, 'rgba(110,10,25,.55)');
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(255,200,120,.75)'; g.lineWidth = 1.4; g.stroke();
  // zavezan vrh (desno)
  g.beginPath(); g.moveTo(42, -6); g.quadraticCurveTo(54, -12, 56, -2); g.quadraticCurveTo(52, 6, 42, 6); g.closePath();
  g.fillStyle = 'rgba(150,20,40,.7)'; g.fill();
  g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, -8); g.lineTo(40, 8); g.stroke();
  g.restore();
  if (e && lock.balls) { e.beginPath(); e.arc(x, y, 30, 0, TAU); e.fillStyle = `rgba(76,240,138,${0.12 + 0.06 * Math.sin(time * 4)})`; e.fill(); }
}

function drawTrain(g, e, k, time) {
  const cars = [0, -0.045, -0.09];
  cars.forEach((dk, i) => {
    const p = along(PR, k + dk);
    g.save(); g.translate(p.x, p.y); g.rotate(p.a);
    g.fillStyle = i === 0 ? '#2a6a3a' : ['#d81e35', '#2a5cd8'][i - 1];
    g.fillRect(-7, -6, 14, 12);
    g.fillStyle = '#ffd166'; g.fillRect(-7, -6, 14, 2);
    if (i === 0) { g.fillStyle = '#1a1a1a'; g.fillRect(3, -3, 4, 6); }
    g.restore();
    if (i === 0 && e) { e.beginPath(); e.arc(p.x + Math.cos(p.a) * 8, p.y + Math.sin(p.a) * 8, 5, 0, TAU); e.fillStyle = `rgba(255,220,140,${0.5 + 0.2 * Math.sin(time * 10)})`; e.fill(); }
  });
}

function drawSleigh(g, e, k, time) {
  if (k > 1) return;
  const a = Math.PI + 0.25 + (Math.PI - 0.5) * k, r = 236;
  const x = 300 + r * Math.cos(a), y = 300 + r * Math.sin(a) + Math.sin(time * 3) * 3;
  const dir = a + Math.PI / 2;
  g.save(); g.translate(x, y); g.rotate(dir); g.globalAlpha = 0.9;
  // jeleni
  for (const off of [26, 40]) {
    g.fillStyle = '#7a4a26'; g.beginPath(); g.ellipse(off, 0, 7, 3.5, 0, 0, TAU); g.fill();
    g.strokeStyle = '#d8b48a'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(off + 6, -2); g.lineTo(off + 9, -6); g.moveTo(off + 6, 2); g.lineTo(off + 9, 6); g.stroke();
  }
  g.strokeStyle = 'rgba(255,214,102,.8)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(8, 0); g.lineTo(40, 0); g.stroke();
  // sani
  g.fillStyle = '#d81e35'; g.beginPath(); g.moveTo(-12, -7); g.lineTo(8, -7); g.quadraticCurveTo(14, 0, 8, 7); g.lineTo(-12, 7); g.closePath(); g.fill();
  g.strokeStyle = '#ffd166'; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = '#e8d8c0'; g.beginPath(); g.arc(-3, 0, 4.5, 0, TAU); g.fill();
  g.restore();
  if (e) { const nx = x + Math.cos(dir) * 47, ny = y + Math.sin(dir) * 47; e.beginPath(); e.arc(nx, ny, 4, 0, TAU); e.fillStyle = 'rgba(255,60,60,.9)'; e.fill(); }
}

/** panorama za odsev v žogici: topla okna in mrzla modrina */
export const envBlobs = [[60, 92, 30, 'rgba(255,170,80,0.85)'], [190, 88, 26, 'rgba(140,210,255,0.7)'], [130, 100, 18, 'rgba(255,60,80,0.5)']];
