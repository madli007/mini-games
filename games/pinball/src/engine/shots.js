/* =====================================================================
   MERILEC STRELOV — kateri strel zadene žogica s flipperja glede na čas udarca
   Za vsak flipper in začetek (žogica pride iz inlana / leži v cradlu) preleti
   čas pritiska v korakih po 1 ms in zapiše: kateri strel žogica zadene, širino
   okna (ms, kako lahek je strel), kam se žogica vrne (feed) in hitrost.
   Teče v Node (tools/pinball-shots.mjs) in v brskalniku (?debug=shots).
   ===================================================================== */
import { makeGame, seeded } from './bot.js';

const MS = 0.001;

/** začetna lega žogice za flipper: iz inlana nad flipperjem ali v cradlu */
function startFor(T, f, kind) {
  if (kind === 'cradle') {
    // na dvignjenem flipperju, blizu osi (miruje v »zibelki«)
    const a = f.up, k = 0.55, d = f.len * k, r = f.r1 + (f.r2 - f.r1) * k + 10.5;
    const nx = f.side === 'L' ? Math.sin(a) : -Math.sin(a), ny = f.side === 'L' ? -Math.cos(a) : Math.cos(a);
    return { x: f.px + Math.cos(a) * d + nx * r, y: f.py + Math.sin(a) * d + ny * r, vx: 0, vy: 0, hold: true };
  }
  // inlane: senzor 'inlane' na isti strani ali privzeto nad zunanjim koncem flipperja
  const inl = T.sensors.filter(s => s.name === 'inlane' && s.layer === f.layer)
    .sort((a, b) => Math.abs(a.x - f.px) - Math.abs(b.x - f.px))[0];
  if (inl && Math.abs(inl.x - f.px) < 200) return { x: inl.x, y: inl.y - 30, vx: 0, vy: 60 };
  return { x: f.px + (f.side === 'L' ? -20 : 20), y: f.py - 110, vx: 0, vy: 0 };
}

function classifyFeed(T, b, fl, outlaneHit, captured) {
  if (captured) return 'ujeta';
  if (outlaneHit) return 'outlane ' + outlaneHit;
  if (!b) return 'drain';
  const main = fl.filter(f => f.layer === 0);
  const L = main.find(f => f.side === 'L'), R = main.find(f => f.side === 'R');
  if (L && R) {
    const tipL = L.px + Math.cos(L.rest) * L.len, tipR = R.px + Math.cos(R.rest) * R.len;
    if (b.y > L.py + 25 && b.x > tipL - 4 && b.x < tipR + 4) return 'drain (sredina)';
    return b.x < (L.px + R.px) / 2 ? 'levi flipper' : 'desni flipper';
  }
  return 'flipper';
}

/**
 * en vzorec: žogica na začetku, pritisk po `pressMs` ms, spust po 350 ms
 * vrne { shot, shots, feed, speed }
 */
export function sampleShot(table, flipperIdx, kind, pressMs, o = {}) {
  const save = Math.random;
  Math.random = seeded(o.seed || 7);
  try {
    const { g, T } = makeGame(table);
    g.state = 'play';
    g.rules.resetGame(); g.rules.resetBall();
    if ('skillArmed' in g.rules) g.rules.skillArmed = false;
    if (g.rules.shotMapSetup) g.rules.shotMapSetup();      // miza lahko pripravi stanje za merjenje (npr. zapre luknje)
    const f = T.flippers[flipperIdx];
    const st = startFor(T, f, kind);
    const hits = [];
    let outlaneHit = '', speed = 0, captured = false, lastSpeed = 0;
    const minor = new Set(T.shots.filter(s => s.minor).map(s => s.id));
    const orig = g.rules.onSwitch.bind(g.rules);
    g.rules.onSwitch = (name, d) => {
      const sh = T.shotBySwitch[name];
      if (sh && !hits.includes(sh.id)) {
        hits.push(sh.id);
        if (!minor.has(sh.id) && !speed) speed = Math.round(lastSpeed);
      }
      if (name === 'outlane') outlaneHit = d && d.idx === 0 ? 'levo' : 'desno';
      return orig(name, d);
    };
    if (st.hold) { f.pressed = true; f.angle = f.up; }
    const b = g.newBall(st.x, st.y);
    b.vx = st.vx; b.vy = st.vy;
    if (st.hold) {
      // umiri žogico v cradlu (držimo flipper), nato spust ob t = 0
      g.setFlipper(f.button, true);
      for (let i = 0; i < 1500; i++) g.update(MS);
      g.setFlipper(f.button, false);
    }
    let t = 0, pressed = false, released = false, returnT = -1;
    const maxT = o.maxT || 4.5;
    while (t < maxT) {
      if (!pressed && t >= pressMs * MS) { g.setFlipper(f.button, true); pressed = true; }
      if (pressed && !released && t >= pressMs * MS + 0.35) { g.setFlipper(f.button, false); released = true; }
      lastSpeed = Math.hypot(b.vx, b.vy);           // hitrost tik pred morebitnim zadetkom
      g.update(MS);
      t += MS;
      const live = g.balls.includes(b);
      if (!live) break;
      if (b.captured) captured = true;
      else if (captured && !b.captured) captured = false;
      // vrnitev: po pritisku se žogica spet spusti k flipperjem (ali je ujeta v luknji po strelu)
      if (released && hits.length && b.layer === 0 && !b.captured && b.y > f.py - 70 && b.vy > 0) { returnT = t; break; }
      if (released && hits.some(h => !minor.has(h)) && b.captured) { captured = true; break; }
      if (released && !hits.length && b.y > f.py - 40 && b.vy > 0 && t > pressMs * MS + 0.5) break;
    }
    const major = hits.find(h => !minor.has(h)) || hits[0] || null;
    const ball = g.balls.includes(b) ? b : null;
    return { shot: major, shots: hits, feed: major ? classifyFeed(T, ball, T.flippers, outlaneHit, captured) : null, speed, returnT };
  } finally {
    Math.random = save;
  }
}

/** čas, ko žogica (brez pritiska) prvič pride do flipperja — referenca za prelet */
function touchTime(table, flipperIdx, kind) {
  if (kind === 'cradle') return 0;
  const save = Math.random;
  Math.random = seeded(7);
  try {
    const { g, T } = makeGame(table);
    g.state = 'play';
    const f = T.flippers[flipperIdx];
    const st = startFor(T, f, kind);
    const b = g.newBall(st.x, st.y); b.vx = st.vx; b.vy = st.vy;
    for (let t = 0; t < 3; t += MS) {
      g.update(MS);
      if (Math.hypot(b.x - f.px, b.y - f.py) < f.len + 18 && b.y > f.py - 30) return t;
    }
    return 0;
  } finally { Math.random = save; }
}

/**
 * mapa strelov: za vsak flipper (layer 0 in zgornji) in začetek preleti čas udarca.
 * @returns {{ rows: Array, samples: number }}
 *   rows: { flipper, start, shot, windowMs, bestWindowMs, feeds: {feed: n}, speed }
 */
export function shotMap(table, { starts = ['inlane', 'cradle'], before = 120, after = 380, stepMs = 1, onProgress = null } = {}) {
  const T0 = table.buildTable();
  const rows = [];
  let samples = 0;
  const jobs = [];
  T0.flippers.forEach((f, i) => { for (const s of starts) if (!(s === 'cradle' && f.layer !== 0 && f.len < 50)) jobs.push([i, s, f]); });
  jobs.forEach(([fi, kind, f], ji) => {
    const t0 = touchTime(table, fi, kind) * 1000;
    const from = Math.max(0, Math.round(t0 - (kind === 'cradle' ? 0 : before))), to = Math.round(t0 + after);
    const res = [];
    for (let ms = from; ms <= to; ms += stepMs) { res.push(sampleShot(table, fi, kind, ms)); samples++; }
    if (onProgress) onProgress((ji + 1) / jobs.length);
    const by = new Map();
    let run = null, runLen = 0;
    const flush = () => { if (run) { const r = by.get(run); r.best = Math.max(r.best, runLen * stepMs); } };
    for (const r of res) {
      const k = r.shot || '—';
      if (!by.has(k)) by.set(k, { n: 0, best: 0, feeds: {}, speeds: [] });
      const e = by.get(k);
      e.n++;
      if (r.feed) e.feeds[r.feed] = (e.feeds[r.feed] || 0) + 1;
      if (r.speed) e.speeds.push(r.speed);
      if (k === run) runLen++; else { flush(); run = k; runLen = 1; }
    }
    flush();
    const low = Math.max(...T0.flippers.map(q => q.py));
    const name = (f.py < low - 60 ? 'zgornji ' + (f.id || f.button) : f.side === 'L' ? 'levi' : 'desni') + (f.layer ? ' (plast ' + f.layer + ')' : '');
    for (const [shot, e] of [...by.entries()].sort((a, b) => b[1].n - a[1].n)) {
      const sp = e.speeds.sort((a, b) => a - b);
      rows.push({
        flipper: name, flipperId: f.id, start: kind, shot, label: (T0.shots.find(s => s.id === shot) || {}).label || shot,
        windowMs: e.n * stepMs, bestWindowMs: e.best, feeds: e.feeds,
        speed: sp.length ? sp[Math.floor(sp.length / 2)] : 0, range: [from - Math.round(t0), to - Math.round(t0)],
      });
    }
  });
  return { rows, samples, table: table.id };
}

/** mapa kot markdown tabela (za README in konzolo) */
export function shotMapMarkdown(map) {
  const feedTxt = f => Object.entries(f).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ');
  const lines = ['| flipper | začetek | strel | okno skupaj (ms) | najdaljše okno (ms) | vrnitev žogice (število vzorcev) | hitrost (px/s) |',
    '|---|---|---|---:|---:|---|---:|'];
  for (const r of map.rows) {
    if (r.shot === '—') continue;
    lines.push(`| ${r.flipper} | ${r.start === 'cradle' ? 'cradle' : 'iz inlana'} | ${r.label} | ${r.windowMs} | ${r.bestWindowMs} | ${feedTxt(r.feeds)} | ${r.speed} |`);
  }
  return lines.join('\n');
}
