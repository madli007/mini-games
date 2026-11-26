/* =====================================================================
   HRČKOVA KROGLA — editor/genui.js: okno »🎲 Naključna proga« (preprosto + napredne nastavitve)
   in zagon generatorja v Web Workerju. Uporabljata ga urejevalnik in meni igre (hitra naključna proga).
   Logika generatorja: editor/generate.js.
   ===================================================================== */
import { ui } from '../../../shared/hub.js';
import * as S from '../../../shared/storage.js';
import * as G from './generate.js';
import { THEME_NAMES } from '../themes.js';
import { drawThumb } from './view2d.js';
import { levelHash } from './model.js';
import * as D from './drafts.js';

export const OPTS_KEY = 'krogla:gen:opts';
const esc = ui.esc;
const num = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');

/** Šibka naprava: manj poskusov in manjša mreža. */
export function deviceLimits() {
  let weak = false;
  try { weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 2; } catch { /* */ }
  return weak ? { maxTries: 8, maxW: 90, maxD: 120, weak } : { maxTries: 20, weak };
}

/**
 * Zaženi generator v Web Workerju (če ni na voljo, v kosih na glavni niti).
 * @returns {{promise: Promise<Object>, cancel: () => void}}
 */
export function runGenerator(opts, { onProgress } = {}) {
  let worker = null, ctrl = null, rej = null, done = false;
  const promise = new Promise((resolve, reject) => {
    rej = reject;
    const ok = v => { done = true; resolve(v); };
    const fail = e => { done = true; reject(e); };
    const fallback = () => {
      worker?.terminate(); worker = null;
      ctrl = new AbortController();
      G.generateLevelAsync(opts, { onProgress, signal: ctrl.signal }).then(ok, fail);
    };
    try { worker = new Worker(new URL('./gen-worker.js', import.meta.url), { type: 'module' }); }
    catch { fallback(); return; }
    let started = false;
    worker.onmessage = e => {
      const m = e.data;
      started = true;
      if (m.type === 'progress') onProgress?.(m);
      else if (m.type === 'done') { worker.terminate(); ok(m.res); }
      else { worker.terminate(); fail(new Error(m.message)); }
    };
    // brskalnik brez modulnih workerjev: napaka pred prvim sporočilom → glavna nit
    worker.onerror = e => { e.preventDefault?.(); if (!started && !done) fallback(); else if (!done) fail(new Error('Generator je odpovedal.')); };
    worker.postMessage({ opts });
  });
  return {
    promise,
    cancel() { if (done) return; done = true; worker?.terminate(); ctrl?.abort(); rej?.(new DOMException('Preklicano', 'AbortError')); },
  };
}

/** Osnutek iz rezultata generatorja (že preverjeno rešljiv, če je autopilot prišel do cilja). */
export function draftFromResult(res, { ready = false } = {}) {
  const L = res.L;
  return {
    key: D.newKey(), L,
    ready: !!(ready && res.ok),
    verified: res.ok ? { hash: levelHash(L), time: res.report.time, by: 'autopilot' } : null,
  };
}

/** Shranjene nastavitve ({ ...opts, base }) ali privzete (Srednja, srednja dolžina). */
export function loadOpts() {
  const s = S.load(OPTS_KEY, null);
  const base = Math.max(1, Math.min(5, Math.round(s?.base ?? s?.diff ?? 2) || 2));
  const o = s && typeof s === 'object' ? G.normalizeOpts({ ...s, seed: '' }) : G.presetOpts(2, 'medium');
  if (o.diff && !G.isPreset(o)) o.diff = null;
  return { o, base: o.diff || base };
}
const saveOpts = (o, base) => { const { seed, maxTries, maxW, maxD, ...rest } = o; S.save(OPTS_KEY, { ...rest, base }); };

/* ===================================================================== */
/*  Povzetek generacije                                                  */
/* ===================================================================== */

/** Kratek povzetek report (HTML). */
export function reportHtml(res) {
  const r = res.report;
  const line = (defs, src) => Object.entries(defs).map(([k, d]) => {
    const p = r.placed[k] || 0, w = r.wanted[k] || 0;
    if (!p && !w) return '';
    return `<span title="${esc(d.name)}">${d.icon} ${p}${p !== w ? `<small>/${w}</small>` : ''}</span>`;
  }).filter(Boolean).join(' ') || '<span class="mg-muted">—</span>';
  const surf = Object.entries(G.SURFACES).filter(([k]) => r.surfaces[k]).map(([k, d]) => `<span title="${esc(d.name)}">${d.icon} ${r.surfaces[k]}</span>`).join(' ');
  const jumps = r.placed.jump || r.wanted.jump ? ` · skoki ${r.placed.jump}${r.placed.jump !== r.wanted.jump ? `<small>/${r.wanted.jump}</small>` : ''}` : '';
  return `<div class="gen-rep">
    <p class="${res.ok ? 'good' : 'bad'}"><b>${res.ok ? '✔ Preverjeno rešljiva' : '✘ Ni preverjena'}</b>${r.time != null ? ` · autopilot ${num(r.time)} s` : ''} · ${r.tries}. poskus · seme <b>${esc(res.seed)}</b></p>
    <p>${r.segments} odsekov · ${r.tiles} ploščic · ${r.size[0]}×${r.size[1]} · 🚩 ${r.checkpoints} · ⏱️ ${r.clocks} · ⭐ ${r.stars} (žepi ${r.pockets})${jumps}</p>
    <p>Sovražniki: ${line(G.ENEMIES)}</p>
    <p>Ovire: ${line(G.OBSTACLES)}</p>
    ${surf || r.narrow ? `<p>Podlage: ${surf || '—'}${r.narrow ? ` · ozki mostovi ${r.narrow}` : ''}</p>` : ''}
    ${r.warnings.length ? `<ul class="gen-warn">${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

/* ===================================================================== */
/*  Okno                                                                 */
/* ===================================================================== */

const pct = v => Math.round(v * 100) + ' %';

/** Slog okna (enkrat na stran; okno uporabljata urejevalnik in meni igre). */
const CSS = `
.gen { text-align: left; gap: 10px; }
.gen-r, .gen-f { display: grid; grid-template-columns: minmax(0, 1fr) minmax(120px, 1.25fr) 3.6em; gap: 4px 10px; align-items: center; font-size: 14px; }
.gen-f { grid-template-columns: minmax(0, 1fr) minmax(120px, 1.25fr) 0; }
.gen-r > span, .gen-f > span { color: var(--mg-dim); }
.gen-r output { font-variant-numeric: tabular-nums; text-align: right; font-weight: 700; font-size: 13px; }
.gen-r output.custom { color: var(--mg-yellow); }
.gen-r--diff output { font-size: 14px; text-align: left; }
.gen-r--diff { grid-template-columns: minmax(0, 1fr) minmax(120px, 1.25fr) 6.5em; }
.gen input[type="range"] { -webkit-appearance: none; appearance: none; width: 100%; height: 36px; background: transparent; touch-action: manipulation; margin: 0; }
.gen input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: var(--mg-line); }
.gen input[type="range"]::-moz-range-track { height: 6px; border-radius: 3px; background: var(--mg-line); }
.gen input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 26px; height: 26px; margin-top: -10px; border-radius: 50%; background: var(--mg-yellow); border: 2px solid #1a1030; }
.gen input[type="range"]::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: var(--mg-yellow); border: 2px solid #1a1030; }
.gen input[type="range"]:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--mg-cyan); }
.gen-seg { display: flex; gap: 4px; flex-wrap: wrap; }
.gen-seg .mg-btn { flex: 1; touch-action: manipulation; padding: 6px 4px; }
.gen-seg .mg-btn { flex-direction: column; gap: 0; line-height: 1.15; }
.gen-seg .mg-btn small { display: block; opacity: .7; font-weight: 400; text-transform: none; }
.gen-seg .mg-btn[aria-pressed="true"] { border-color: var(--mg-yellow); color: var(--mg-yellow); background: rgba(255, 210, 63, .1); }
.gen-seed { display: flex; gap: 4px; }
.gen-seed .mg-input { flex: 1; min-width: 0; text-transform: uppercase; font-family: ui-monospace, monospace; }
.gen-adv { border: 1px solid var(--mg-line); border-radius: 10px; padding: 6px 10px; }
.gen-adv summary { cursor: pointer; font-weight: 700; padding: 4px 0; touch-action: manipulation; }
.gen-grid { display: grid; gap: 0 18px; grid-template-columns: 1fr; }
@media (min-width: 1200px) { .gen-grid { grid-template-columns: 1fr 1fr; } .gen-grid h4 { grid-column: 1 / -1; } }
.gen-grid h4 { margin: 10px 0 2px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--mg-cyan); }
.gen-grid h4 small { text-transform: none; letter-spacing: 0; color: var(--mg-dim); font-weight: 400; }
.gen-grid .mg-select { padding: 6px 8px; min-height: 0; }
.gen-go { display: flex; gap: 6px; flex-wrap: wrap; }
.gen-go .mg-btn { flex: 1 1 140px; touch-action: manipulation; }
.gen-prog { display: flex; gap: 10px; align-items: center; font-size: 14px; }
.gen-prog span:nth-child(2) { flex: 1; }
.gen-out { display: grid; grid-template-columns: 160px 1fr; gap: 10px; align-items: start; }
.gen-out canvas { width: 160px; height: 100px; border-radius: 8px; background: #0e1030; }
@media (max-width: 520px) { .gen-out { grid-template-columns: 1fr; } .gen-out canvas { width: 100%; height: 120px; }
  .gen-r, .gen-f, .gen-r--diff { grid-template-columns: minmax(0, 1fr) 3.6em; } .gen-r > span, .gen-f > span { grid-column: 1 / -1; }
  .gen-f { grid-template-columns: 1fr; } .gen-r--diff { grid-template-columns: minmax(0, 1fr) 6.5em; } }
.gen-rep p { margin: 0 0 3px; font-size: 13px; }
.gen-rep .good { color: var(--mg-green); } .gen-rep .bad { color: var(--mg-red); }
.gen-rep small { color: var(--mg-red); }
.gen-warn { margin: 4px 0 0; padding-left: 18px; font-size: 12px; color: var(--mg-yellow); }
`;
function injectCss() {
  if (document.getElementById('gen-css')) return;
  const st = document.createElement('style');
  st.id = 'gen-css'; st.textContent = CSS;
  document.head.appendChild(st);
}

/**
 * Odpri okno generatorja.
 * @param {{onCreate:(draft:Object, res:Object)=>void, onPlay:(draft:Object)=>void}} cb
 *   onCreate: nov osnutek je shranjen (urejevalnik ga odpre) · onPlay: »Ustvari in igraj«
 */
export function openGenerator({ onCreate, onPlay } = {}) {
  injectCss();
  let { o, base } = loadOpts();
  const lim = deviceLimits();
  o.seed = G.randomSeed();
  let job = null, last = null;

  const box = document.createElement('div');
  box.className = 'gen mg-stack';
  const range = (k, label, min, max, step = 1, fmt = v => String(v), scale = 1) =>
    `<label class="gen-r"><span>${label}</span><input type="range" data-k="${k}" data-scale="${scale}" min="${min}" max="${max}" step="${step}"><output data-o="${k}" data-fmt="${fmt === pct ? 'pct' : ''}"></output></label>`;
  box.innerHTML = `
    <div class="gen-simple">
      <label class="gen-r gen-r--diff"><span>Težavnost</span><input type="range" id="gDiff" min="1" max="5" step="1"><output id="gDiffName"></output></label>
      <div class="gen-f"><span>Dolžina</span><div class="gen-seg" id="gLen">${G.LENGTH_IDS.map(l => `<button type="button" class="mg-btn mg-btn--ghost mg-btn--small" data-len="${l}">${G.LENGTHS[l].name}<small> ≈${G.LENGTHS[l].target} s</small></button>`).join('')}</div></div>
      <label class="gen-f"><span>Lokacija / tema</span><select class="mg-select" id="gTheme"><option value="random">🎲 Naključno</option>${G.THEME_IDS.map(t => `<option value="${t}">${esc(THEME_NAMES[t] || t)}</option>`).join('')}</select></label>
      <div class="gen-f"><span>Seme</span><div class="gen-seed"><input class="mg-input" id="gSeed" maxlength="32" autocomplete="off" spellcheck="false" aria-label="Seme"><button type="button" class="mg-btn mg-btn--ghost mg-btn--small" id="gReseed" title="Novo seme" aria-label="Novo seme">🎲</button></div></div>
      <p class="ed-hint" id="gEst"></p>
    </div>
    <details class="gen-adv" id="gAdv"><summary>⚙️ Napredne nastavitve</summary>
      <div class="gen-grid">
        <h4>Proga</h4>
        ${range('segments', 'Dolžina (odseki)', G.SEG_MIN, G.SEG_MAX)}
        ${range('wMin', 'Širina poti — najmanj', 1, 5)}
        ${range('wMax', 'Širina poti — največ', 1, 5)}
        ${range('narrow', 'Ozki mostovi', 0, 100, 5, pct, 100)}
        ${range('hills', 'Višinske razlike (ravno ↔ gorato)', 0, 100, 5, pct, 100)}
        <h4>Sovražniki <small>(0 = izklop)</small></h4>
        ${Object.entries(G.ENEMIES).map(([k, e]) => range('enemies.' + k, `${e.icon} ${e.name}`, 0, e.max)).join('')}
        <h4>Ovire</h4>
        ${Object.entries(G.OBSTACLES).map(([k, e]) => range('obstacles.' + k, `${e.icon} ${e.name}`, 0, e.max)).join('')}
        <h4>Podlage <small>(delež odsekov)</small></h4>
        ${Object.entries(G.SURFACES).map(([k, e]) => range('surfaces.' + k, `${e.icon} ${e.name}`, 0, 100, 5, pct, 100)).join('')}
        <h4>Prepadi in skoki</h4>
        ${range('jumps', '🔼 Skoki čez prepad (vzmeti, klančine)', 0, G.JUMPS_MAX)}
        ${range('walls', '🧱 Zidovi ob strani poti', 0, 100, 5, pct, 100)}
        <h4>Kontrolne točke, ure, zvezdice</h4>
        <label class="gen-r"><span>🚩 Kontrolne točke</span><select class="mg-select" data-k="checkpoints">${Object.entries(G.CHECKPOINTS).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join('')}</select><output></output></label>
        ${range('clocks', '⏱️ Ure (+3 s)', 0, 5)}
        ${range('pockets', '⭐ Zvezdice izven glavne poti (žepi)', 0, 100, 20, pct, 100)}
      </div>
      <button type="button" class="mg-btn mg-btn--ghost mg-btn--small" id="gReset">↺ Ponastavi na težavnost</button>
    </details>
    <div class="gen-go">
      <button type="button" class="mg-btn mg-btn--primary" data-g="create">🎲 Ustvari</button>
      <button type="button" class="mg-btn mg-btn--green" data-g="play">▶ Ustvari in igraj</button>
      <button type="button" class="mg-btn mg-btn--cyan mg-hidden" data-g="again" title="Nova različica z novim semenom (prejšnji osnutek ostane)">🎲 Znova</button>
    </div>
    <div class="gen-prog mg-hidden" id="gProg" role="status"><span class="mg-spin"></span><span id="gProgT">Gradim progo …</span><button type="button" class="mg-btn mg-btn--danger mg-btn--small" id="gCancel">Prekliči</button></div>
    <div class="gen-out mg-hidden" id="gOut"><canvas width="240" height="150" id="gThumb"></canvas><div id="gRep"></div></div>`;

  const $ = s => box.querySelector(s);
  const get = k => k.split('.').reduce((a, p) => a?.[p], o);
  const set = (k, v) => { const ps = k.split('.'); let a = o; while (ps.length > 1) a = a[ps.shift()]; a[ps[0]] = v; };

  function render() {
    $('#gDiff').value = base;
    $('#gDiffName').textContent = o.diff ? G.DIFF_NAMES[o.diff - 1] : 'Po meri';
    $('#gDiffName').classList.toggle('custom', !o.diff);
    for (const b of box.querySelectorAll('[data-len]')) b.setAttribute('aria-pressed', b.dataset.len === o.length);
    $('#gTheme').value = o.theme;
    if (document.activeElement !== $('#gSeed')) $('#gSeed').value = o.seed;
    for (const el of box.querySelectorAll('[data-k]')) {
      const v = get(el.dataset.k);
      if (el.tagName === 'SELECT') el.value = v;
      else el.value = Math.round(v * (+el.dataset.scale || 1));
    }
    renderOut();
  }
  function renderOut() {
    for (const out of box.querySelectorAll('output[data-o]')) {
      const v = get(out.dataset.o);
      out.textContent = out.dataset.fmt === 'pct' ? pct(v) : (v === 0 && /^(enemies|obstacles)\./.test(out.dataset.o) ? 'izklop' : String(v));
    }
    $('#gEst').textContent = `Ocena: ≈ ${Math.round(G.estimateTime(o))} s vožnje autopilota · ${o.segments} odsekov${lim.weak ? ' · šibka naprava: manj poskusov in manjša mreža' : ''}`;
  }
  const changed = () => { saveOpts(o, base); render(); };
  const custom = () => { o.diff = null; saveOpts(o, base); renderOut(); $('#gDiffName').textContent = 'Po meri'; $('#gDiffName').classList.add('custom'); };
  const preset = () => { const { theme, seed } = o; o = { ...G.presetOpts(base, o.length), theme, seed }; changed(); };

  box.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'gDiff') { base = +t.value; preset(); return; }
    if (t.id === 'gSeed') { o.seed = t.value.trim().slice(0, 32); return; }
    if (t.dataset.k) {
      let v = t.tagName === 'SELECT' ? t.value : +t.value / (+t.dataset.scale || 1);
      set(t.dataset.k, v);
      if (t.dataset.k === 'wMin' && o.wMax < v) { o.wMax = v; box.querySelector('[data-k="wMax"]').value = v; }
      if (t.dataset.k === 'wMax' && o.wMin > v) { o.wMin = v; box.querySelector('[data-k="wMin"]').value = v; }
      custom();
    }
  });
  box.addEventListener('change', e => {
    if (e.target.id === 'gTheme') { o.theme = e.target.value; saveOpts(o, base); }
    if (e.target.tagName === 'SELECT' && e.target.dataset.k) { set(e.target.dataset.k, e.target.value); custom(); }
  });
  box.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.len) {
      if (o.diff) { o.length = b.dataset.len; preset(); }
      else { o.length = b.dataset.len; o.segments = G.presetOpts(base, o.length).segments; changed(); }
    } else if (b.id === 'gReseed') { o.seed = G.randomSeed(); $('#gSeed').value = o.seed; }
    else if (b.id === 'gReset') preset();
    else if (b.id === 'gCancel') job?.cancel();
    else if (b.dataset.g) go(b.dataset.g);
  });

  function busy(on) {
    for (const b of box.querySelectorAll('.gen-go button, #gReseed')) b.disabled = on;
    $('#gProg').classList.toggle('mg-hidden', !on);
  }

  async function go(kind) {
    if (job) return;
    if (kind === 'again' || !o.seed) { o.seed = G.randomSeed(); $('#gSeed').value = o.seed; }
    busy(true);
    $('#gProgT').textContent = 'Gradim progo …';
    const opts = { ...o, maxTries: lim.maxTries, ...(lim.maxW ? { maxW: lim.maxW, maxD: lim.maxD } : {}) };
    job = runGenerator(opts, { onProgress: p => { $('#gProgT').textContent = p.k > 1 ? `Poskus ${p.k}/${p.tries} … (autopilot preverja rešljivost)` : 'Gradim progo in jo preverjam z autopilotom …'; } });
    let res;
    try { res = await job.promise; }
    catch (err) {
      job = null; busy(false);
      if (err?.name !== 'AbortError') { console.warn(err); ui.toast('Generator je odpovedal: ' + (err?.message || err), { icon: '⚠️', duration: 4000 }); }
      else ui.toast('Preklicano.', { icon: '✋', duration: 1200 });
      return;
    }
    job = null; busy(false);
    last = res;
    $('#gOut').classList.remove('mg-hidden');
    drawThumb($('#gThumb'), res.L);
    $('#gRep').innerHTML = reportHtml(res);
    box.querySelector('[data-g="again"]').classList.remove('mg-hidden');
    const draft = draftFromResult(res, { ready: kind === 'play' });
    const { dropped } = D.saveDraft(draft);
    if (dropped) ui.toast(`Shranjenih je največ ${D.MAX_DRAFTS} osnutkov — najstarejši je bil odstranjen.`, { icon: '🗑️' });
    if (kind === 'play') {
      if (!res.ok) ui.toast('Proga ni preverjeno rešljiva — odprta je v urejevalniku.', { icon: '⚠️', duration: 3500 });
      else { close?.(); onPlay?.(draft); return; }
    }
    onCreate?.(draft, res);
    ui.toast(`Nov osnutek »${res.L.name}«${res.ok ? ' (preverjeno rešljiv)' : ''}.`, { icon: '🎲', duration: 2200 });
  }

  let close;
  render();
  ui.modal({
    title: '🎲 Naključna proga', content: box, wide: true,
    actions: [{ label: 'Zapri', value: null }],
    onOpen: (_, c) => { close = c; },
  }).then(() => { job?.cancel(); job = null; });
  return { get last() { return last; } };
}
