/* =====================================================================
   DEBUG (?debug=1, ?debug=shots) — orodja za uglaševanje občutka
   - prekrivni sloj: segmenti po plasteh, enosmerna vrata, senzorji z imeni,
     strele, vhodi/izhodi ramp, hitrost in plast žogice, fps
   - H zadrži fiziko, N en korak (1/60 s), Shift+N en korak fizike, G + klik/poteg: postavi žogico
     (poteg = hitrost), V skrije sloj, J izpiše nastavitve kot JSON
   - drsniki: naklon (gravitacija), hitrost flipperja gor/dol, elastičnost flipperja in gum,
     trenje, sling, bumper, ball save — shranjeni v localStorage (samo za debug)
   - bot: statistika N iger; ?debug=shots: mapa strelov (engine/shots.js)
   V debug načinu se rezultati NE shranjujejo na lestvico.
   ===================================================================== */
import { PHYS, PHYS_DEFAULT, STEP, W, H, PHYSICS_VERSION, fmt } from './config.js';
import * as Store from './storage.js';
import { botGame, botReport } from './bot.js';
import { shotMap, shotMapMarkdown } from './shots.js';

const SLIDERS = [
  ['grav', 'Naklon (gravitacija)', 1200, 2800, 10, 'px/s²'],
  ['flipUp', 'Flipper gor (hitrost)', 20, 60, 0.5, 'rad/s'],
  ['flipDown', 'Flipper dol (hitrost)', 8, 40, 0.5, 'rad/s'],
  ['flipE', 'Elastičnost flipperja (udarec)', 0, 0.8, 0.01, ''],
  ['flipEStill', 'Odbojnost mirnega flipperja', 0, 0.9, 0.01, ''],
  ['flipFalloff', 'Padec odbojnosti (pol pri)', 300, 4000, 50, 'px/s'],
  ['rubberK', 'Elastičnost gum (×)', 0.5, 1.6, 0.01, ''],
  ['friction', 'Trenje ob trku', 0, 0.3, 0.005, ''],
  ['sling', 'Moč slingov', 300, 1600, 10, 'px/s'],
  ['bumper', 'Moč bumperjev', 500, 1800, 10, 'px/s'],
  ['ballSave', 'Ball save', 0, 30, 1, 's'],
];
const COL = { 0: 'rgba(255,255,255,.75)', 1: 'rgba(111,211,255,.95)', 2: 'rgba(255,79,216,.95)', 3: 'rgba(255,210,63,.95)', '-1': 'rgba(57,255,136,.9)' };

export function createDebug(api, mode) {
  const { game, T, renderer, app } = api;
  const saved = Store.load('physDebug', {});
  for (const [k] of SLIDERS) if (saved && saved[k] !== undefined) PHYS[k] = saved[k];
  if (PHYS.ballSave === null) PHYS.ballSave = game.cfg.ballSaveSek;
  const st = { hold: false, steps: 0, overlay: true, place: false, drag: null, last: null };

  /* ---------------- plošča ---------------- */
  const panel = document.createElement('div');
  panel.id = 'dbg';
  panel.innerHTML = `
    <style>
      #dbg{position:fixed;right:8px;top:8px;z-index:800;width:260px;max-height:calc(100vh - 16px);overflow:auto;background:rgba(6,9,14,.92);
        border:1px solid rgba(111,211,255,.35);border-radius:10px;padding:10px;font:12px/1.35 Consolas,'Share Tech Mono',monospace;color:#cfe3f5}
      #dbg h4{margin:4px 0 6px;font:700 12px system-ui;letter-spacing:1px;color:#6fd3ff}
      #dbg label{display:block;margin:6px 0 2px} #dbg input[type=range]{width:100%}
      #dbg button{background:#13202e;color:#cfe3f5;border:1px solid #2c4258;border-radius:6px;padding:4px 7px;margin:2px;cursor:pointer;font:inherit}
      #dbg button.on{background:#ff7a1a;color:#140700}
      #dbg pre,#dbg textarea{white-space:pre-wrap;background:#020406;border:1px solid #1d2a38;border-radius:6px;padding:6px;max-height:260px;overflow:auto;width:100%;box-sizing:border-box;color:#cfe3f5;font:11px Consolas,monospace}
      #dbg .k{color:#8796a8} #dbg .row{display:flex;justify-content:space-between}
      #dbg table{border-collapse:collapse;width:100%;font-size:10.5px} #dbg td,#dbg th{border-bottom:1px solid #1d2a38;padding:2px 3px;text-align:left}
      @media (max-width:700px){#dbg{width:200px;font-size:11px;opacity:.95}}
    </style>
    <h4>DEBUG · miza ${T.id} · fizika f${PHYSICS_VERSION}</h4>
    <div id="dbgInfo" class="k"></div>
    <div>
      <button id="dbgHold">H zadrži</button><button id="dbgStep">N korak</button><button id="dbgPlace">G postavi</button><button id="dbgOv" class="on">V sloj</button>
    </div>
    <h4>FIZIKA</h4>
    <div id="dbgSl"></div>
    <div><button id="dbgReset">Privzeto</button><button id="dbgJson">J JSON</button></div>
    <textarea id="dbgOut" rows="5" readonly style="display:none"></textarea>
    <h4>BOT</h4>
    <div><button data-n="10">10 iger</button><button data-n="30">30 iger</button></div>
    <pre id="dbgBot" class="k">—</pre>
    <h4>MAPA STRELOV</h4>
    <div><button id="dbgShots">Izmeri (5 ms)</button><button id="dbgShots1">1 ms</button></div>
    <div id="dbgMap" class="k">—</div>
    <div class="k" style="margin-top:6px">V debug načinu se rezultati ne shranjujejo na lestvico.</div>`;
  document.body.appendChild(panel);
  const $ = id => panel.querySelector('#' + id);
  const sl = $('dbgSl');
  for (const [k, name, min, max, step, unit] of SLIDERS) {
    const id = 'dbgS_' + k;
    sl.insertAdjacentHTML('beforeend', `<label for="${id}">${name}: <b id="${id}v"></b> ${unit}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}">`);
    const inp = $(id), out = $(id + 'v');
    inp.value = PHYS[k];
    out.textContent = PHYS[k];
    inp.addEventListener('input', () => { PHYS[k] = +inp.value; out.textContent = inp.value; persist(); });
  }
  function persist() {
    const o = {};
    for (const [k] of SLIDERS) if (PHYS[k] !== (k === 'ballSave' ? game.cfg.ballSaveSek : PHYS_DEFAULT[k])) o[k] = PHYS[k];
    Store.save('physDebug', o);
    return o;
  }
  $('dbgReset').onclick = () => {
    for (const [k] of SLIDERS) { PHYS[k] = k === 'ballSave' ? game.cfg.ballSaveSek : PHYS_DEFAULT[k]; $('dbgS_' + k).value = PHYS[k]; $('dbgS_' + k + 'v').textContent = PHYS[k]; }
    persist();
  };
  const showJson = () => {
    const o = {};
    for (const [k] of SLIDERS) o[k] = PHYS[k];
    const out = $('dbgOut');
    out.style.display = 'block';
    out.value = '// engine/config.js → PHYS (spremenjeno: ' + Object.keys(persist()).join(', ') + ')\n' + JSON.stringify(o, null, 2);
    out.select();
  };
  $('dbgJson').onclick = showJson;
  const setHold = v => { st.hold = v; $('dbgHold').classList.toggle('on', v); };
  $('dbgHold').onclick = () => setHold(!st.hold);
  $('dbgStep').onclick = () => { setHold(true); st.steps++; };
  $('dbgPlace').onclick = () => { st.place = !st.place; $('dbgPlace').classList.toggle('on', st.place); };
  $('dbgOv').onclick = () => { st.overlay = !st.overlay; $('dbgOv').classList.toggle('on', st.overlay); };
  panel.querySelectorAll('button[data-n]').forEach(b => b.onclick = () => runBot(+b.dataset.n));
  $('dbgShots').onclick = () => runShots(5);
  $('dbgShots1').onclick = () => runShots(1);

  function runBot(n) {
    const out = $('dbgBot');
    out.textContent = 'igram …';
    const games = [];
    const one = i => {
      games.push(botGame({ table: api.table, seed: 5000 + i * 31 }));
      out.textContent = 'igram … ' + (i + 1) + ' / ' + n;
      if (i + 1 < n) setTimeout(() => one(i + 1), 0);
      else {
        const r = botReport(games);
        out.textContent = [
          'iger ' + r.games + ' · povp. ' + fmt(r.avgScore) + ' točk',
          'igra ' + r.avgSec + ' s · žoga ' + r.avgBallSec + ' s',
          'drain sredina ' + r.centerDrainPct + ' % · outlane ' + r.outlaneDrainPct + ' %',
          'strelov/min ' + r.shotsPerMin + ' · multiballov ' + r.multiballs,
          'načinov ' + r.modeStarts + ' začetih / ' + r.modes + ' opravljenih',
        ].join('\n');
      }
    };
    setTimeout(() => one(0), 30);
  }

  function runShots(step) {
    const out = $('dbgMap');
    out.textContent = 'merim … (lahko traja)';
    setTimeout(() => {
      const t0 = performance.now();
      const map = shotMap(api.table, { stepMs: step });
      st.map = map;
      const rows = map.rows.filter(r => r.shot !== '—');
      out.innerHTML = `<div>${map.samples} vzorcev, ${((performance.now() - t0) / 1000).toFixed(1)} s</div><table><tr><th>flipper</th><th>strel</th><th>ms</th><th>vrnitev</th></tr>${rows.map(r =>
        `<tr><td>${r.flipper[0].toUpperCase()}${r.start === 'cradle' ? '·c' : '·i'}</td><td>${r.label}</td><td>${r.windowMs}/${r.bestWindowMs}</td><td>${Object.entries(r.feeds).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]).join(', ')}</td></tr>`).join('')}</table>`;
      console.log(shotMapMarkdown(map));
    }, 30);
  }

  /* ---------------- miška: postavi žogico ---------------- */
  const view = renderer.canvas;
  const toTable = e => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
  view.addEventListener('mousedown', e => {
    if (!st.place) return;
    e.stopPropagation(); e.preventDefault();
    st.drag = toTable(e);
  }, true);
  window.addEventListener('mousemove', e => { if (st.drag) st.dragTo = toTable(e); });
  window.addEventListener('mouseup', e => {
    if (!st.drag) return;
    const [x, y] = st.drag, [x2, y2] = toTable(e);
    if (game.state !== 'play') game.startGame();
    let b = game.balls.find(q => !q.captured);
    if (!b) b = game.newBall(x, y);
    b.x = x; b.y = y; b.layer = 0; b.ramp = undefined; b.captured = false;
    b.vx = (x2 - x) * 6; b.vy = (y2 - y) * 6;
    b.ax = x; b.ay = y; b.anchorT = game.time;
    st.drag = null; st.dragTo = null;
  });

  /* ---------------- sloj ---------------- */
  renderer.debug = {
    draw(g) {
      if (!st.overlay) return;
      g.save();
      g.lineWidth = 1; g.font = '9px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const s of T.segs) {
        if (!s.active && s.kind !== 'drop' && s.kind !== 'post') continue;
        g.strokeStyle = COL[s.layer] || COL[3];
        g.globalAlpha = s.active ? 1 : 0.35;
        g.lineWidth = Math.max(1, s.r * 2 * 0.5);
        g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); g.stroke();
        if (s.oneWay) {
          const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
          g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + s.nx * 10, my + s.ny * 10); g.strokeStyle = '#ffd23f'; g.stroke();
        }
      }
      g.globalAlpha = 1;
      for (const s of T.sensors) {
        g.strokeStyle = s.layer ? COL[s.layer] : 'rgba(255,170,60,.9)';
        g.setLineDash([3, 2]); g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#ffd6a0'; g.fillText(s.name + (s.kind === 'lane' || s.name === 'inlane' || s.name === 'outlane' ? s.idx : ''), s.x, s.y - s.r - 5);
      }
      for (const R of T.ramps) {
        g.strokeStyle = '#39ff88'; g.lineWidth = 2;
        const E = R.entry, X = R.exit;
        g.beginPath(); g.moveTo(Math.max(0, E.x1), E.y); g.lineTo(Math.min(W, E.x2), E.y); g.stroke();
        g.strokeStyle = '#ff3b4a';
        g.beginPath(); g.moveTo(Math.max(0, X.x1), X.y); g.lineTo(Math.min(W, X.x2), X.y); g.stroke();
        g.fillStyle = '#39ff88'; g.fillText(R.id + ' (plast ' + R.layer + ')', (Math.max(0, E.x1) + Math.min(W, E.x2)) / 2, E.y + 10);
      }
      for (const m of T.magnets) { g.strokeStyle = m.on ? '#6fd3ff' : 'rgba(111,211,255,.35)'; g.beginPath(); g.arc(m.x, m.y, m.r, 0, Math.PI * 2); g.stroke(); }
      g.font = 'bold 10px Consolas, monospace';
      for (const sh of T.shots) { g.fillStyle = sh.minor ? 'rgba(200,220,240,.6)' : '#ffd23f'; g.fillText('▶ ' + sh.id, sh.x, sh.y); }
      for (const f of T.flippers) {
        g.strokeStyle = f.pressed ? '#ff7a1a' : 'rgba(255,255,255,.6)';
        g.beginPath(); g.moveTo(f.px, f.py); g.lineTo(f.px + Math.cos(f.angle) * f.len, f.py + Math.sin(f.angle) * f.len); g.stroke();
        g.fillStyle = '#cfe3f5'; g.fillText(f.button + (f.layer ? '·' + f.layer : ''), f.px, f.py + 22);
      }
      for (const b of game.balls) {
        const sp = Math.hypot(b.vx, b.vy);
        g.strokeStyle = '#39ff88'; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x + b.vx * 0.05, b.y + b.vy * 0.05); g.stroke();
        g.fillStyle = '#fff';
        g.fillText(Math.round(sp) + ' px/s · p' + b.layer, b.x, b.y - 18);
      }
      if (st.drag && st.dragTo) {
        g.strokeStyle = '#ffd23f'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(st.drag[0], st.drag[1]); g.lineTo(st.dragTo[0], st.dragTo[1]); g.stroke();
      }
      g.restore();
    },
  };

  /* ---------------- tipke in zanka ---------------- */
  const api2 = {
    key(e) {
      if (e.type && e.type !== 'keydown') return false;
      const c = e.code;
      if (c === 'KeyH') { if (!e.repeat) setHold(!st.hold); return true; }
      if (c === 'KeyN') { setHold(true); st.steps += e.shiftKey ? 0.01 : 1; return true; }
      if (c === 'KeyG') { if (!e.repeat) $('dbgPlace').click(); return true; }
      if (c === 'KeyV') { if (!e.repeat) $('dbgOv').click(); return true; }
      if (c === 'KeyJ') { if (!e.repeat) showJson(); return true; }
      return false;
    },
    frame(dt) {
      if (!st.hold) { if (!game.paused) game.update(dt); }
      else if (st.steps > 0) {
        // korak: cel frame (1/60 s) ali en korak fizike (Shift+N)
        const d = st.steps >= 1 ? 1 / 60 : STEP;
        st.steps = st.steps >= 1 ? st.steps - 1 : 0;
        game.update(d);
      }
      const b = game.balls.find(q => !q.captured) || game.balls[0];
      const info = $('dbgInfo');
      const t = performance.now();
      if (!st.last || t - st.last > 150) {
        st.last = t;
        info.innerHTML = `${app.fps || '–'} fps · žogic ${game.balls.length}${st.hold ? ' · <b style="color:#ff7a1a">ZADRŽANO</b>' : ''}<br>` +
          (b ? `žoga: ${Math.round(b.x)}, ${Math.round(b.y)} · ${Math.round(Math.hypot(b.vx, b.vy))} px/s · plast ${b.layer}` : 'ni žogice');
      }
    },
    get state() { return st; },
  };
  if (mode === 'shots') setTimeout(() => runShots(5), 300);
  return api2;
}
