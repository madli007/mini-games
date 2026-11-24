/* =====================================================================
   SMUČARSKI SKOKI — debug.js: stran z drsniki (?debug=1).
   Drsniki po skupinah (zalet, odriv, aerodinamika, telo, veter, pristanek,
   sodniki), urejevalnik krivulj CL/CD/CM z grafom, graf trajektorije in
   časovnih vrst med skokom, primerjava z zadnjimi 5 skoki in ghostom,
   ponovitev zadnjega skoka z novimi parametri, shrani/naloži/izvozi/ponastavi,
   »Poženi bote« (50 skokov × 3 spretnosti na izbrani skakalnici).
   ===================================================================== */
import * as S from '../../shared/storage.js';
import { balanceTable } from './balance.js';
import { decodeGhost, ghostJump } from './ghost.js';

const GROUPS = [
  ['', 'Splošno'], ['inrun', 'Zalet'], ['takeoff', 'Odriv'], ['aero', 'Aerodinamika'], ['body', 'Telo (regulator)'],
  ['wind', 'Veter'], ['landing', 'Pristanek'], ['judges', 'Sodniki'],
];
const CURVES = [['lift', 'CL·A (vzgon)', '#39ff88'], ['drag', 'CD·A (upor)', '#ff8a1f'], ['moment', 'CM (navor)', '#4de1ff']];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initDebug(api, root) {
  root.classList.remove('mg-hidden');
  let original = null;
  fetch(new URL('physics-params.json', import.meta.url), { cache: 'no-cache' }).then(r => r.json()).then(j => { original = j; });
  const history = [];   // zadnjih 5 sledi
  let liveTrace = null;

  function sliders() {
    const P = api.P;
    return GROUPS.map(([key, title]) => {
      const obj = key ? P[key] : P;
      const rows = Object.entries(obj).filter(([k, v]) => typeof v === 'number' && k !== 'paramsVersion').map(([k, v]) => {
        const a = Math.abs(v) || 1;
        const min = v < 0 ? -a * 3 : 0, max = v < 0 ? a : a * 3;
        const step = Math.pow(10, Math.floor(Math.log10(a)) - 2);
        return `<div class="sk-dbrow"><label for="d-${key}-${k}">${esc(k)}</label>
          <input type="range" id="d-${key}-${k}" data-g="${key}" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}">
          <input type="number" data-g="${key}" data-k="${k}" step="${step}" value="${v}"></div>`;
      }).join('');
      return `<details ${key === 'aero' || key === 'body' ? 'open' : ''}><summary>${esc(title)}</summary>${rows}
        ${key === 'aero' ? CURVES.map(([c, t]) => `<h3>${t}</h3><canvas data-curve="${c}" width="380" height="120"></canvas>`).join('') : ''}</details>`;
    }).join('');
  }

  function render() {
    const P = api.P;
    root.innerHTML = `
      <h2 class="mg-title" style="font-size:14px">Uglaševanje · v${P.paramsVersion}</h2>
      <div class="sk-row">
        <button class="mg-btn mg-btn--primary" data-b="rerun" title="Isti vnosi, veter in zaletno mesto, novi parametri">↻ Ponovi zadnji skok</button>
        <button class="mg-btn" data-b="save">Shrani</button><button class="mg-btn" data-b="load">Naloži</button>
        <button class="mg-btn" data-b="export">Izvozi JSON</button><button class="mg-btn mg-btn--danger" data-b="reset">Ponastavi</button>
      </div>
      <div id="dbgInfo" class="sk-note"></div>
      <h3>Trajektorija (zadnjih 5 + ghost)</h3><canvas id="dbgTraj" width="380" height="200"></canvas>
      <h3>Let: α (bela), cilj (rumena), hitrost (modra), višina nad tlemi (zelena), gumb</h3><canvas id="dbgTime" width="380" height="150"></canvas>
      ${sliders()}
      <h3>Boti (50 skokov × 3 spretnosti)</h3>
      <div class="sk-row"><select class="mg-select" id="dbgHill">${api.hills().map(h => `<option value="${h.def.id}">${esc(h.def.name)}</option>`).join('')}</select>
        <label class="mg-check"><input type="checkbox" id="dbgWind"> z vetrom</label>
        <button class="mg-btn" data-b="bots">Poženi bote</button></div>
      <div id="dbgBots"></div>
      <textarea id="dbgOut" class="mg-hidden" spellcheck="false"></textarea>`;
    root.querySelectorAll('input[data-k]').forEach(inp => inp.addEventListener('input', () => {
      const obj = inp.dataset.g ? api.P[inp.dataset.g] : api.P;
      obj[inp.dataset.k] = +inp.value;
      root.querySelectorAll(`input[data-g="${inp.dataset.g}"][data-k="${inp.dataset.k}"]`).forEach(o => { if (o !== inp) o.value = inp.value; });
    }));
    root.querySelectorAll('canvas[data-curve]').forEach(cv => curveEditor(cv, cv.dataset.curve));
    root.querySelectorAll('[data-b]').forEach(b => b.onclick = () => button(b.dataset.b));
  }

  function button(b) {
    const out = root.querySelector('#dbgOut');
    if (b === 'rerun') {
      const prev = api.current().lastJump?.s?.dist;
      const J = api.rerun();
      if (J) info(`Ponovitev: ${prev ?? '—'} m → <b>${J.s.dist} m</b> (${J.s.landing.type}), hitrost ${J.s.tableSpeed} km/h`);
      else info('Najprej skoči vsaj en skok.');
      if (J) pushTrace(J.trace, 'ponovitev');
    } else if (b === 'save') { S.save('skoki:params', api.P); info('Shranjeno v localStorage (velja le z ?debug=1).'); }
    else if (b === 'load') { const p = S.load('skoki:params', null); if (p) { replaceP(p); info('Naloženo.'); } else info('Ni shranjenih parametrov.'); }
    else if (b === 'export') { out.classList.remove('mg-hidden'); out.value = JSON.stringify(api.P, null, 2); out.select(); try { navigator.clipboard?.writeText(out.value); info('JSON je v odložišču — prilepi ga v physics-params.json.'); } catch { /* */ } }
    else if (b === 'reset') { if (original) { replaceP(structuredClone(original)); S.remove('skoki:params'); info('Ponastavljeno na physics-params.json.'); } }
    else if (b === 'bots') {
      const id = root.querySelector('#dbgHill').value;
      const def = api.hills().find(h => h.def.id === id).def;
      root.querySelector('#dbgBots').innerHTML = '<span class="mg-spin"></span>';
      setTimeout(() => {
        const t0 = performance.now();
        const rows = balanceTable([def], api.P, { n: 50, wind: root.querySelector('#dbgWind').checked ? 'random' : 'off' });
        const pct = v => Math.round(v * 100) + '%';
        root.querySelector('#dbgBots').innerHTML = `<table><tr><th>Spretnost</th><th>Povp.</th><th>Padci</th><th>Čez HS</th><th>Točke</th></tr>
          ${rows.map(r => `<tr><td>${r.skill}</td><td>${r.avg.toFixed(1)} m</td><td>${pct(r.falls)}</td><td>${pct(r.overHS)}</td><td>${r.pts.toFixed(1)}</td></tr>`).join('')}</table>
          <p class="sk-note">K${def.k} / HS${def.hs} · ${Math.round(performance.now() - t0)} ms</p>`;
      }, 20);
    }
  }

  function replaceP(p) { const P = api.P; for (const k of Object.keys(P)) delete P[k]; Object.assign(P, p); render(); }
  function info(html) { root.querySelector('#dbgInfo').innerHTML = html; }

  /* ---------------- urejevalnik krivulje: vleci točke gor/dol */
  function curveEditor(cv, key) {
    const g = cv.getContext('2d');
    const color = CURVES.find(c => c[0] === key)[2];
    let drag = -1;
    const pts = () => api.P.aero[key];
    const range = () => { const ys = pts().map(p => p[1]); const lo = Math.min(...ys, 0), hi = Math.max(...ys, 0.1); const pad = (hi - lo) * 0.15 + 0.02; return [lo - pad, hi + pad]; };
    const X = a => 10 + (a + 25) / 120 * (cv.width - 20);
    const draw = () => {
      const [lo, hi] = range(), Y = v => cv.height - 10 - (v - lo) / (hi - lo) * (cv.height - 20);
      g.clearRect(0, 0, cv.width, cv.height);
      g.strokeStyle = '#2b3170'; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(cv.width, Y(0)); g.stroke();
      g.fillStyle = '#9097c8'; g.font = '10px monospace';
      for (let a = -20; a <= 90; a += 10) { g.fillText(a + '°', X(a) - 8, cv.height - 1); }
      // trenutni napadni kot
      const s = api.current().J?.s;
      if (s && s.phase === 'air') { g.strokeStyle = '#ffd23f'; g.beginPath(); const xa = X(s.alpha * 180 / Math.PI); g.moveTo(xa, 0); g.lineTo(xa, cv.height); g.stroke(); }
      g.strokeStyle = color; g.lineWidth = 2; g.beginPath();
      pts().forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, X(p[0]), Y(p[1])));
      g.stroke(); g.lineWidth = 1;
      pts().forEach(p => { g.fillStyle = '#fff'; g.fillRect(X(p[0]) - 3, Y(p[1]) - 3, 6, 6); });
      g.fillStyle = '#9097c8'; g.fillText(hi.toFixed(2), 2, 10); g.fillText(lo.toFixed(2), 2, cv.height - 12);
    };
    const toLocal = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    cv.addEventListener('pointerdown', e => {
      const [x] = toLocal(e);
      let best = -1, bd = 1e9;
      pts().forEach((p, i) => { const d = Math.abs(X(p[0]) - x); if (d < bd) { bd = d; best = i; } });
      if (bd < 14) { drag = best; cv.setPointerCapture(e.pointerId); }
    });
    cv.addEventListener('pointermove', e => {
      if (drag < 0) return;
      const [, y] = toLocal(e);
      const [lo, hi] = range();
      const v = lo + (cv.height - 10 - y) / (cv.height - 20) * (hi - lo);
      pts()[drag][1] = Math.round(v * 1000) / 1000;
      draw();
    });
    cv.addEventListener('pointerup', () => { drag = -1; });
    cv._draw = draw;
    draw();
  }

  /* ---------------- grafi */
  function pushTrace(trace, label) {
    if (!trace?.length) return;
    history.push({ trace, label });
    while (history.length > 5) history.shift();
  }
  function drawGraphs() {
    const G = api.current();
    const cv = root.querySelector('#dbgTraj'); if (!cv) return;
    const g = cv.getContext('2d');
    const H = api.hillOf(G.hillId)?.hill; if (!H) return;
    const xmin = -10, xmax = H.landAt(H.hs + 20).x, ymin = H.landAt(H.hs + 20).y - 2, ymax = 8;
    const X = x => (x - xmin) / (xmax - xmin) * cv.width, Y = y => cv.height - (y - ymin) / (ymax - ymin) * cv.height;
    g.clearRect(0, 0, cv.width, cv.height);
    g.strokeStyle = '#9097c8'; g.beginPath();
    for (let s = 0; s <= H.hs + 20; s += 2) { const p = H.landAt(s); (s ? g.lineTo : g.moveTo).call(g, X(p.x), Y(p.y)); }
    g.stroke();
    for (const [s, c] of [[H.k, '#e3263a'], [H.hs, '#2f6bff']]) { const p = H.landAt(s); g.fillStyle = c; g.fillRect(X(p.x) - 2, Y(p.y) - 6, 4, 12); }
    const line = (tr, color, w = 1) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); let first = true; for (const t of tr) { if (t[1] < xmin) continue; (first ? g.moveTo : g.lineTo).call(g, X(t[1]), Y(t[2])); first = false; } g.stroke(); g.lineWidth = 1; };
    history.forEach((h, i) => line(h.trace, `rgba(255,255,255,${0.15 + i * 0.12})`));
    // ghost (moj najboljši) kot črtkana črta
    if (!G._dbgGhostTrace && G.hillId) {
      const best = S.load('skoki:best:' + G.hillId, null);
      if (best?.data) try {
        const gh = decodeGhost(best.data);
        const r = ghostJump(gh, H, api.P, 2);
        while (!r.J.done) r.J.step(r.input(r.J.s, r.J.s.tick));
        G._dbgGhostTrace = r.J.trace;
      } catch { /* */ }
    }
    if (G._dbgGhostTrace) { g.setLineDash([4, 4]); line(G._dbgGhostTrace, '#4de1ff'); g.setLineDash([]); }
    if (G.J?.trace) line(G.J.trace, '#ffd23f', 2);
    // časovne vrste
    const tv = root.querySelector('#dbgTime'), tg = tv.getContext('2d');
    tg.clearRect(0, 0, tv.width, tv.height);
    const tr = (G.J?.trace || []).filter(t => t[3] !== 0);
    if (tr.length > 2) {
      const t0 = tr[0][0], t1 = tr[tr.length - 1][0];
      const TX = t => (t - t0) / Math.max(1, t1 - t0) * tv.width;
      const series = (idx, lo, hi, color) => { tg.strokeStyle = color; tg.beginPath(); tr.forEach((t, i) => { const y = tv.height - (t[idx] - lo) / (hi - lo) * tv.height; (i ? tg.lineTo : tg.moveTo).call(tg, TX(t[0]), y); }); tg.stroke(); };
      tg.fillStyle = 'rgba(57,255,136,.12)'; const y0 = tv.height - (35 - -10) / 90 * tv.height, y1 = tv.height - (23 - -10) / 90 * tv.height; tg.fillRect(0, y0, tv.width, y1 - y0);
      series(3, -10, 80, '#ffffff');
      tg.strokeStyle = '#ffd23f'; tg.beginPath(); tr.forEach((t, i) => { const a = t[6] - (t[8] - t[3]); const y = tv.height - (a - -10) / 90 * tv.height; (i ? tg.lineTo : tg.moveTo).call(tg, TX(t[0]), y); }); tg.stroke();
      series(4, 15, 35, '#4de1ff');
      series(5, 0, 8, '#39ff88');
      tg.fillStyle = '#ff4fd8'; tr.forEach(t => { if (t[7]) tg.fillRect(TX(t[0]), tv.height - 4, 2, 4); });
    }
    root.querySelectorAll('canvas[data-curve]').forEach(c => c._draw?.());
  }

  api.setHook({
    onJump: lj => { pushTrace(lj.trace, 'skok'); const G = api.current(); G._dbgGhostTrace = null; const L = lj.s.landing; info(`Zadnji skok: <b>${L.dist} m</b> (${L.type}), odriv ${lj.s.takeoff ? Math.round(lj.s.takeoff.err * 1000) + ' ms' : '—'}, hitrost ${lj.s.tableSpeed} km/h, hEq ${L.hEq} m, smuči ${L.skiRel}°, nihanje ${lj.s.wobble.toFixed(3)}`); },
    onNewJump: () => { api.current()._dbgGhostTrace = null; },
  });
  render();
  let n = 0;
  const tick = () => { if (++n % 6 === 0) drawGraphs(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  void liveTrace;
}
