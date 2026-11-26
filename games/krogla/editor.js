/* =====================================================================
   HRČKOVA KROGLA — editor.js: urejevalnik prog.
   2D tloris s plastmi (ploščice, višine, objekti, pot autopilota, lastnosti),
   3D predogled, testna vožnja, autopilot, osnutki, uvoz/izvoz in deljenje s povezavo.
   Logika proge je v editor/model.js (testi v tests/tests.js).
   ===================================================================== */
import { hub, ui } from '../../shared/hub.js';
import * as S from '../../shared/storage.js';
import { validateLevel, formatLevelJson, loadLevels } from './level.js';
import { runAutopilot } from './autopilot.js';
import { scoringFromRun, fmtTime } from './rules.js';
import { THEMES, THEME_NAMES } from './themes.js';
import { LOOKS } from './render/looks.js';
import * as M from './editor/model.js';
import * as D from './editor/drafts.js';
import { encodeLevel, sanitizeLevel, MAX_LINK } from './editor/share.js';
import { View2D, drawThumb } from './editor/view2d.js';
import { openGenerator } from './editor/genui.js';

const $ = s => document.querySelector(s);
const esc = ui.esc;
const clone = o => JSON.parse(JSON.stringify(o));
const isTouch = matchMedia('(pointer: coarse)').matches;
const QS = new URLSearchParams(location.search);
const KEEP_QS = ['offline', 'igralec'].filter(k => QS.has(k)).map(k => k + '=' + encodeURIComponent(QS.get(k))).join('&');
const withQs = (url, extra = '') => url + ([KEEP_QS, extra].filter(Boolean).join('&') ? '?' + [KEEP_QS, extra].filter(Boolean).join('&') : '');
const num = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');

/* ===================================================================== */
/*  Stanje                                                               */
/* ===================================================================== */

const st = {
  L: null, key: null, ready: false, verified: null, published: null,
  layer: 1,
  tile: '.', tileTool: 'brush', brush: 1,
  hTool: 'set', hValue: 1, hBrush: 1,
  objKind: null, sel: null, pathEdit: false, pathSel: null,
  routeSel: null,
  trace: null, errors: [], errorsAt: [], warnings: [],
  startHere: null,
  preview: null,
  saved: true,
};
const history = new M.History(250);
let view = null, preview = null, OFFICIAL = null;
let op = null;   // trenutna operacija miške

const LAYERS = [
  { n: 1, icon: '🧱', name: 'Ploščice' },
  { n: 2, icon: '⛰️', name: 'Višine' },
  { n: 3, icon: '⭐', name: 'Objekti' },
  { n: 4, icon: '🤖', name: 'Pot' },
  { n: 5, icon: '⚙️', name: 'Lastnosti' },
];

/* ===================================================================== */
/*  Zagon                                                                */
/* ===================================================================== */

async function boot() {
  $('#btnBack').href = withQs('index.html');
  view = new View2D($('#cv2d'), { onDown, onMove, onUp, onHover, onContext, onCancel });
  const empty = !D.listDrafts().length;
  const d = pickInitialDraft();
  openDraft(d, { fit: true });
  // prazno stanje (še noben osnutek): ponudi naključno progo
  if (empty && !QS.get('draft')) $('#edEmpty').classList.remove('mg-hidden');
  bindUi();
  renderLayers();
  addEventListener('resize', () => { view.resize(); preview?.resize(); });
  view.resize(); view.fit(st.L);
  requestAnimationFrame(loop2d);
  // 3D: na telefonu privzeto skrit (prihrani baterijo); kakovost Srednja ali Nizka
  if (isTouch && innerWidth < 900) document.body.classList.add('ed-no3d');
  init3d();
  addEventListener('beforeunload', () => flushSave());
}

function pickInitialDraft() {
  const k = QS.get('draft');
  if (k && D.getDraft(k)) return D.getDraft(k);
  const cur = S.load(D.CURRENT_KEY, null);
  if (cur && D.getDraft(cur)) return D.getDraft(cur);
  const list = D.listDrafts();
  if (list.length) return list[0];
  return { key: D.newKey(), L: M.newLevel({ name: 'Moja proga' }), ready: false, verified: null };
}

async function init3d() {
  try {
    const [{ Preview }, { DEFAULT_SKIN, detectQuality }] = await Promise.all([import('./editor/preview3d.js'), import('./render.js')]);
    const dq = detectQuality();
    const q = QS.get('q') || (dq === 'low' ? 'low' : 'medium');
    preview = new Preview($('#cv3d'), { quality: q, skin: Object.assign({}, DEFAULT_SKIN, S.load('krogla:skin', {})) });
    preview.visible = !document.body.classList.contains('ed-no3d');
    preview.setLevel(st.L, { delay: 0, focus: true });
  } catch (e) {
    console.warn('[urejevalnik] 3D ni na voljo', e);
    $('#box3d').innerHTML = '<p class="ed-hint" style="padding:12px">3D predogled ni na voljo (WebGL ali povezava do knjižnice Three.js). Urejanje in izvoz delujeta.</p>';
  }
}

function loop2d() {
  requestAnimationFrame(loop2d);
  if (view.dirty) view.draw(st);
}

/* ===================================================================== */
/*  Osnutki                                                              */
/* ===================================================================== */

function openDraft(d, { fit = true } = {}) {
  $('#edEmpty')?.classList.add('mg-hidden');
  st.L = M.normalize(clone(d.L));
  st.key = d.key; st.ready = !!d.ready; st.verified = d.verified || null; st.published = d.published || null;
  st.sel = null; st.routeSel = null; st.pathEdit = false; st.pathSel = null; st.trace = null; st.startHere = null;
  history.clear();
  S.save(D.CURRENT_KEY, st.key);
  st.saved = true;
  afterChange({ save: false, preview: false, check: false });
  if (fit && view) { view.resize(); view.fit(st.L); }
  preview?.setLevel(st.L, { delay: 0, focus: true });
  renderTools(); renderProps();
}

let saveT = 0;
function scheduleSave() {
  st.saved = false;
  renderSaved();
  clearTimeout(saveT);
  saveT = setTimeout(flushSave, 700);
}
function flushSave() {
  clearTimeout(saveT);
  if (st.saved) return;
  const { dropped } = D.saveDraft({ key: st.key, L: st.L, ready: st.ready, verified: st.verified, published: st.published });
  S.save(D.CURRENT_KEY, st.key);
  st.saved = true;
  renderSaved();
  if (dropped) ui.toast(`Shranjenih je največ ${D.MAX_DRAFTS} osnutkov — najstarejši je bil odstranjen.`, { icon: '🗑️' });
}
function renderSaved() {
  $('#edName').textContent = st.L.name || '(brez imena)';
  const el = $('#edSaved');
  el.textContent = st.saved ? '· shranjeno ✓' : '· shranjujem …';
  el.classList.toggle('dirty', !st.saved);
  document.title = `${st.L.name} · Urejevalnik prog · Hrčkova krogla`;
}

/** Po vsaki spremembi proge: validator, opozorila, 3D, samodejno shranjevanje. */
function afterChange({ save = true, preview: pv = true, check = true } = {}) {
  M.normalize(st.L);
  st.errors = validateLevel(st.L);
  st.errorsAt = st.errors.map(e => M.locateError(st.L, e)).filter(Boolean);
  st.warnings = M.heightWarnings(st.L);
  // sprememba oblike proge razveljavi preverjanje rešljivosti → proga ni več pripravljena za igro
  if (check && st.ready && !D.isVerified({ L: st.L, verified: st.verified })) {
    st.ready = false;
    ui.toast('Proga se je spremenila — za »Pripravljeno« jo znova preveri (autopilot ali testna vožnja).', { icon: '🔁', duration: 3500 });
  }
  if (st.sel && !M.getObj(st.L, st.sel)) { st.sel = null; st.pathEdit = false; }
  if (st.routeSel != null && !st.L.route?.[st.routeSel]) st.routeSel = null;
  view.dirty = true;
  if (pv) preview?.setLevel(st.L);
  if (save) scheduleSave();
  if (save && st.layer >= 2 && st.layer <= 4) renderTools();   // števci (zvezdice, točke poti, stopnice)
  renderStatus();
  renderSaved();
  renderReady();
}

/** Ena operacija (za razveljavi). Vrne rezultat fn (ali true), če se je proga spremenila, sicer false. */
function commit(fn) {
  history.begin(st.L);
  const res = fn(st.L);
  const changed = history.end(st.L);
  if (changed) afterChange();
  return changed ? (res ?? true) : false;
}

function undo() { const L = history.undo(st.L); if (L) { st.L = L; afterChange(); renderTools(); renderProps(); } }
function redo() { const L = history.redo(st.L); if (L) { st.L = L; afterChange(); renderTools(); renderProps(); } }

/* ===================================================================== */
/*  Orodja na tlorisu                                                    */
/* ===================================================================== */

const ROUTE_SNAP = 0.25;
const snapFor = (w, g = 0.5) => w.shift ? 0.05 : g;

/** Celice med dvema celicama (da hitra poteza čopiča ne pušča lukenj). */
function lineCells(a, b) {
  const out = [];
  let [x0, y0] = a; const [x1, y1] = b;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 500; n++) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

function paintAt(c, r) {
  const L = st.L;
  if (st.layer === 1) { for (const [x, y] of M.brushCells(c, r, st.brush)) M.setTile(L, x, y, st.tile); return; }
  for (const [x, y] of M.brushCells(c, r, st.hBrush)) {
    if (!M.inside(L, x, y)) continue;
    const k = x + ',' + y;
    if (st.hTool === 'set') M.setHeight(L, x, y, st.hValue);
    else if (!op.done.has(k)) { op.done.add(k); M.setHeight(L, x, y, M.heightAt(L, x, y) + (st.hTool === 'up' ? 0.5 : -0.5)); }
  }
}

function onDown(w) {
  hideMenu();
  const L = st.L;
  if (st.layer === 1 || st.layer === 2) {
    const tool = st.layer === 1 ? st.tileTool : st.hTool;
    if (w.alt || tool === 'pick') { pick(w); return; }
    if (tool === 'fill') { commit(L => M.floodFill(L, w.c, w.r, st.tile)); return; }
    if (tool === 'rect') { op = { kind: 'rect', a: [w.c, w.r], b: [w.c, w.r] }; st.preview = { cells: M.rectCells(w.c, w.r, w.c, w.r) }; view.dirty = true; return; }
    if (tool === 'ramp') { op = { kind: 'ramp', a: [w.c, w.r], b: [w.c, w.r] }; st.preview = { line: [op.a, op.b] }; view.dirty = true; return; }
    history.begin(L);
    op = { kind: 'paint', last: [w.c, w.r], done: new Set() };
    paintAt(w.c, w.r);
    afterChange({ save: false, preview: false });
    return;
  }
  if (st.layer === 3) {
    // urejanje točk poti izbranega objekta
    if (st.sel && st.pathEdit && M.pathPts(L, st.sel)) {
      const pts = M.pathPts(L, st.sel);
      const k = pts.findIndex(p => Math.hypot(p[0] - w.x, p[1] - w.z) < Math.max(0.3, 10 / view.scale));
      history.begin(L);
      if (k >= 0) st.pathSel = k;
      else st.pathSel = M.addPathPt(L, st.sel, M.snap(w.x, snapFor(w)), M.snap(w.z, snapFor(w)), st.pathSel);
      op = { kind: 'pathpt' };
      afterChange({ save: false });
      renderProps();
      return;
    }
    const hit = M.pickObj(L, w.x, w.z);
    if (hit) {
      selectObj(hit);
      const p = M.objPos(L, hit);
      history.begin(L);
      op = { kind: 'move', ref: hit, off: [p[0] - w.x, p[1] - w.z], grid: M.KINDS[M.kindOf(L, hit)].grid || 0.5 };
      return;
    }
    if (st.objKind) {
      const kind = st.objKind;
      let ref;
      commit(L => { ref = M.addObj(L, kind, w.c + 0.5, w.r + 0.5); });
      if (ref) selectObj(ref);
      if (M.KINDS[kind].single) setObjKind(null);
      return;
    }
    selectObj(null);
    return;
  }
  if (st.layer === 4) {
    const rt = L.route || (L.route = []);
    const k = rt.findIndex(p => { const q = M.routePos(L, p); return Math.hypot(q[0] - w.x, q[1] - w.z) < Math.max(0.3, 10 / view.scale); });
    history.begin(L);
    if (k >= 0) st.routeSel = k;
    else {
      const at = st.routeSel != null ? st.routeSel + 1 : rt.length;
      const prev = rt[at - 1] || rt[at];
      rt.splice(at, 0, { x: M.snap(w.x, snapFor(w, ROUTE_SNAP)), z: M.snap(w.z, snapFor(w, ROUTE_SNAP)), speed: prev?.speed ?? 5 });
      st.routeSel = at;
    }
    op = { kind: 'route' };
    afterChange({ save: false });
    renderProps();
    return;
  }
  if (st.layer === 5) view.dirty = true;
}

function onMove(w) {
  if (!op) return;
  const L = st.L;
  if (op.kind === 'paint') {
    for (const [c, r] of lineCells(op.last, [w.c, w.r])) paintAt(c, r);
    op.last = [w.c, w.r];
    afterChange({ save: false, preview: false });
  } else if (op.kind === 'rect') {
    op.b = [w.c, w.r];
    st.preview = { cells: M.rectCells(op.a[0], op.a[1], w.c, w.r) };
  } else if (op.kind === 'ramp') {
    // ravna črta: prevladujoča os
    const dc = w.c - op.a[0], dr = w.r - op.a[1];
    op.b = Math.abs(dc) >= Math.abs(dr) ? [w.c, op.a[1]] : [op.a[0], w.r];
    st.preview = { line: [op.a, op.b] };
  } else if (op.kind === 'move') {
    const g = snapFor(w, op.grid);
    const K = M.KINDS[M.kindOf(L, op.ref)];
    if (K.shape === 'rect') {
      const o = M.getObj(L, op.ref);
      o.x = M.snap(w.x + op.off[0], g); o.z = M.snap(w.z + op.off[1], g);
    } else M.moveObj(L, op.ref, M.snap(w.x + op.off[0], g), M.snap(w.z + op.off[1], g));
    afterChange({ save: false, preview: false });
  } else if (op.kind === 'pathpt') {
    M.movePathPt(L, st.sel, st.pathSel, M.snap(w.x, snapFor(w)), M.snap(w.z, snapFor(w)));
    afterChange({ save: false, preview: false });
  } else if (op.kind === 'route') {
    const p = L.route[st.routeSel];
    const x = M.snap(w.x, snapFor(w, ROUTE_SNAP)), z = M.snap(w.z, snapFor(w, ROUTE_SNAP));
    if (p.mover != null && L.movers?.[p.mover]) { const m = L.movers[p.mover].path[0]; p.x = Math.round((x - m[0]) * 100) / 100; p.z = Math.round((z - m[2]) * 100) / 100; }
    else { p.x = x; p.z = z; }
    afterChange({ save: false, preview: false });
  }
  view.dirty = true;
}

function onUp() {
  if (!op) return;
  const L = st.L, o = op;
  op = null;
  if (o.kind === 'rect') {
    st.preview = null;
    const [a, b] = [o.a, o.b];
    if (st.layer === 1) commit(L => { for (const [c, r] of M.rectCells(a[0], a[1], b[0], b[1])) M.setTile(L, c, r, st.tile); });
    else commit(L => { for (const [c, r] of M.rectCells(a[0], a[1], b[0], b[1])) M.setHeight(L, c, r, st.hValue); });
    return;
  }
  if (o.kind === 'ramp') {
    st.preview = null;
    let res;
    commit(L => { res = M.smoothRamp(L, o.a, o.b, st.hBrush); });
    if (res && res.msg) ui.toast(res.msg, { icon: res.ok ? '⚠️' : '✋', duration: 3500 });
    view.dirty = true;
    return;
  }
  if (history.end(L)) afterChange();
  if (o.kind === 'move' || o.kind === 'pathpt' || o.kind === 'route') renderProps();
}

function onCancel() {
  if (!op) return;
  op = null; st.preview = null;
  if (history.open != null) { const before = JSON.parse(history.open); history.open = null; st.L = before; afterChange({ save: false }); }
  view.dirty = true;
}

function pick(w) {
  if (!M.inside(st.L, w.c, w.r)) return;
  if (st.layer === 1) { st.tile = M.tileAt(st.L, w.c, w.r); ui.toast(`Pipeta: ${M.tileInfo(st.tile).name}`, { icon: '💧', duration: 1200 }); }
  else { st.hValue = M.heightAt(st.L, w.c, w.r); ui.toast(`Pipeta: višina ${num(st.hValue)}`, { icon: '💧', duration: 1200 }); }
  renderTools();
}

function onHover(w) {
  const el = $('#coords');
  if (!w) { el.textContent = ''; if (!op) { st.preview = null; view.dirty = true; } return; }
  const L = st.L;
  if (M.inside(L, w.c, w.r)) {
    const ch = M.tileAt(L, w.c, w.r);
    el.textContent = `x ${num(w.x, 2)} · z ${num(w.z, 2)} · ploščica (${w.c}, ${w.r}) · ${M.tileInfo(ch).name} · višina ${num(M.heightAt(L, w.c, w.r))}`;
  } else el.textContent = `x ${num(w.x, 2)} · z ${num(w.z, 2)} · izven mreže`;
  // predogled čopiča
  if (!op && (st.layer === 1 || st.layer === 2)) {
    const tool = st.layer === 1 ? st.tileTool : st.hTool;
    const n = st.layer === 1 ? st.brush : st.hBrush;
    st.preview = ['brush', 'set', 'up', 'down'].includes(tool) ? { cells: M.brushCells(w.c, w.r, n) } : { cells: [[w.c, w.r]] };
  } else if (!op) st.preview = null;
  view.dirty = true;
}

/* ------------------------------------------------------------ desni klik / dolg pritisk */

function onContext(w, e) {
  const L = st.L;
  // desni klik na točko poti: izbriši
  if (st.layer === 3 && st.sel && st.pathEdit) {
    const pts = M.pathPts(L, st.sel) || [];
    const k = pts.findIndex(p => Math.hypot(p[0] - w.x, p[1] - w.z) < Math.max(0.3, 10 / view.scale));
    if (k >= 0) { if (!commit(L => M.removePathPt(L, st.sel, k))) ui.toast('Pot mora imeti vsaj 2 točki.', { icon: '✋' }); st.pathSel = null; renderProps(); return; }
  }
  if (st.layer === 4) {
    const k = (L.route || []).findIndex(p => { const q = M.routePos(L, p); return Math.hypot(q[0] - w.x, q[1] - w.z) < Math.max(0.3, 10 / view.scale); });
    if (k >= 0) { commit(L => L.route.splice(k, 1)); st.routeSel = null; renderProps(); return; }
  }
  const items = [
    { label: '▶ Začni tukaj (testna vožnja)', act: () => { st.startHere = [M.snap(w.x, 0.5), M.snap(w.z, 0.5)]; view.dirty = true; testDrive(st.startHere); } },
    { label: '🎯 Pokaži v 3D', act: () => { if (document.body.classList.contains('ed-no3d')) toggle3d(); preview?.focus(w.x, w.z, 12); } },
  ];
  const hit = st.layer === 3 ? M.pickObj(L, w.x, w.z) : null;
  if (hit) {
    items.push({ label: '🗑️ Izbriši objekt', act: () => { selectObj(hit); deleteSel(); } });
    items.push({ label: '⧉ Podvoji objekt', act: () => { selectObj(hit); duplicateSel(); } });
  }
  if (st.layer === 1 || st.layer === 2) items.push({ label: '💧 Pipeta', act: () => pick(w) });
  showMenu(e.clientX, e.clientY, items);
}

function showMenu(x, y, items) {
  const m = $('#ctxMenu');
  m.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = it.label; b.setAttribute('role', 'menuitem');
    b.onclick = () => { hideMenu(); it.act(); };
    m.appendChild(b);
  }
  m.classList.remove('mg-hidden');
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  m.querySelector('button')?.focus();
}
function hideMenu() { $('#ctxMenu').classList.add('mg-hidden'); }

/* ------------------------------------------------------------ izbira objektov */

function selectObj(ref) {
  const same = ref && st.sel && ref.arr === st.sel.arr && ref.i === st.sel.i;
  st.sel = ref;
  if (!same) { st.pathEdit = false; st.pathSel = null; }
  view.dirty = true;
  renderProps();
  if (ref && preview) { const p = M.objCenter(st.L, ref); if (p) preview.focus(p[0], p[1]); }
}
function setObjKind(k) { st.objKind = k; renderTools(); }

function deleteSel() {
  if (st.layer === 3 && st.sel) {
    if (st.pathEdit && st.pathSel != null) { if (!commit(L => M.removePathPt(L, st.sel, st.pathSel))) ui.toast('Pot mora imeti vsaj 2 točki.', { icon: '✋' }); st.pathSel = null; renderProps(); return; }
    const ref = st.sel;
    if (!commit(L => M.removeObj(L, ref))) { ui.toast('Starta in cilja ni mogoče izbrisati — premakni ju.', { icon: '✋' }); return; }
    selectObj(null);
  } else if (st.layer === 4 && st.routeSel != null) {
    const k = st.routeSel;
    commit(L => L.route.splice(k, 1));
    st.routeSel = Math.min(k, (st.L.route.length || 1) - 1);
    if (!st.L.route.length) st.routeSel = null;
    renderProps();
  }
}
function duplicateSel() {
  if (st.layer !== 3 || !st.sel) return;
  let ref;
  commit(L => { ref = M.duplicateObj(L, st.sel); });
  if (ref) selectObj(ref);
}

/* ===================================================================== */
/*  Levi panel: plasti in orodja                                         */
/* ===================================================================== */

function renderLayers() {
  $('#layers').innerHTML = LAYERS.map(l => `<button type="button" class="ed-layer" role="tab" data-layer="${l.n}" aria-selected="${st.layer === l.n}" title="${l.name} (${l.n})"><b>${l.icon}</b>${l.name}</button>`).join('');
}

function setLayer(n) {
  st.layer = n; st.preview = null; op = null;
  if (n !== 3) st.pathEdit = false;
  renderLayers(); renderTools(); renderProps();
  view.dirty = true;
}

const TOOLS1 = [['brush', '🖌️ Čopič', 'B'], ['rect', '▭ Pravokotnik', 'R'], ['fill', '🪣 Zapolni', 'F'], ['pick', '💧 Pipeta', 'K']];
const TOOLS2 = [['set', '📏 Nastavi', 'B'], ['up', '⬆ Dvigni +0,5', 'U'], ['down', '⬇ Spusti −0,5', 'J'], ['ramp', '◢ Klančina', 'L'], ['rect', '▭ Pravokotnik', 'R'], ['pick', '💧 Pipeta', 'K']];

function renderTools() {
  const el = $('#tools');
  const L = st.L;
  const brushSel = (v, id) => `<div class="ed-f"><span>Velikost čopiča <span class="mg-kbd">[ ]</span></span><select class="mg-select" id="${id}">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === v ? 'selected' : ''}>${n} × ${n}</option>`).join('')}</select></div>`;
  if (st.layer === 1) {
    el.innerHTML = `<h4>Orodje</h4><div class="ed-tbtns">${TOOLS1.map(([k, n, key]) => `<button type="button" class="ed-t" data-tool="${k}" aria-pressed="${st.tileTool === k}" title="${n} (${key})">${n}</button>`).join('')}</div>
      ${brushSel(st.brush, 'brushSize')}
      <h4>Ploščice</h4><div class="ed-pal">${M.TILES.map(t => `<button type="button" class="ed-t" data-tile="${t.ch === ' ' ? 'void' : esc(t.ch)}" aria-pressed="${st.tile === t.ch}" title="${esc(t.name)} — znak »${esc(t.ch)}«">
        <span class="sw" style="background:${t.color || '#070816'}">${esc(t.icon)}</span>${esc(t.name.replace(/ \(.*\)/, ''))}</button>`).join('')}</div>
      <p class="ed-hint">Alt + klik = pipeta · desni klik = meni (»Začni tukaj«).</p>`;
  } else if (st.layer === 2) {
    el.innerHTML = `<h4>Orodje</h4><div class="ed-tbtns">${TOOLS2.map(([k, n, key]) => `<button type="button" class="ed-t" data-htool="${k}" aria-pressed="${st.hTool === k}" title="${n} (${key})">${n}</button>`).join('')}</div>
      <div class="ed-f"><span>Višina (0–17,5)</span><input class="mg-input" type="number" id="hValue" min="0" max="17.5" step="0.5" value="${st.hValue}"></div>
      ${brushSel(st.hBrush, 'hBrush')}
      <div class="ed-grad" aria-hidden="true"></div><div class="ed-row ed-hint" style="justify-content:space-between"><span>0</span><span>4</span><span>7</span><span>12</span><span>17,5</span></div>
      <p class="ed-hint"><b>Klančina:</b> povleci od nižje do višje ploščice (ali obratno) v isti vrstici/stolpcu — vmes se samodejno postavijo klančine (vsaka +0,5).
      <b style="color:var(--mg-red)">Rdeče črte</b> so stopnice, ki jih krogla ne prevozi (> 0,22).</p>
      <p class="ed-hint">Stopnic: <b>${st.warnings.length}</b></p>`;
  } else if (st.layer === 3) {
    const cnt = k => {
      const K = M.KINDS[k];
      if (K.single) return '';
      const a = L[K.arr] || [];
      const n = K.match ? a.filter(o => Object.entries(K.match).every(([kk, v]) => o[kk] === v)).length : a.length;
      return n;
    };
    el.innerHTML = `<h4>Postavi</h4><div class="ed-pal">
      <button type="button" class="ed-t" data-kind="" aria-pressed="${!st.objKind}" title="Izberi in premakni (Esc)"><span class="ic">👆</span>Izberi</button>
      ${M.KIND_ORDER.map(k => { const K = M.KINDS[k]; const n = cnt(k); const cls = k === 'star' ? (n === 5 ? 'good' : 'bad') : '';
        return `<button type="button" class="ed-t" data-kind="${k}" aria-pressed="${st.objKind === k}" title="${esc(K.name)}"><span class="ic">${K.icon}</span>${esc(K.name)}${n !== '' ? `<span class="n ${cls}">${k === 'star' ? n + '/5' : n}</span>` : ''}</button>`; }).join('')}</div>
      <p class="ed-hint">Klik na prazno = postavi · vleka = premakni (Shift = prosto) · <span class="mg-kbd">Del</span> izbriši · <span class="mg-kbd">Ctrl+D</span> podvoji.</p>`;
  } else if (st.layer === 4) {
    const rt = L.route || [];
    el.innerHTML = `<h4>Pot autopilota</h4>
      <p class="ed-hint">Autopilot vozi od starta skozi točke po vrsti. Klik = dodaj točko (za izbrano), vleka = premakni, desni klik = izbriši.
      Na koncu naj bo točka na cilju. <span style="color:#4de1ff">●</span> čaka · <span style="color:#ffb35c">●</span> na premični plošči.</p>
      <p class="ed-hint">Točk: <b>${rt.length}</b></p>
      <div class="ed-tbtns">
        <button type="button" class="ed-t" id="rtGoal">🏁 Dodaj točko na cilju</button>
        <button type="button" class="ed-t" id="rtDrive">🎮 Iz zadnje vožnje</button>
        <button type="button" class="ed-t" id="rtClear">🗑️ Počisti pot</button>
        <button type="button" class="ed-t" id="rtBot">🤖 Preveri</button>
      </div>
      <p class="ed-hint">»Iz zadnje vožnje«: točke iz tvoje zadnje testne vožnje do cilja (nato jih po potrebi popravi).</p>`;
  } else {
    el.innerHTML = `<h4>Lastnosti proge</h4><p class="ed-hint">Ime, opis, sklop, tema in lokacija, velikost mreže, medalje in čas so na desni.</p>
      <div class="ed-tbtns"><button type="button" class="ed-t" id="crop">✂️ Obreži prazne robove</button><button type="button" class="ed-t" id="fitView">⤢ Cela proga</button></div>`;
  }
}

/* ===================================================================== */
/*  Desni panel: lastnosti                                               */
/* ===================================================================== */

const DIR8 = [[[0, -1], '↑ sever'], [[1, -1], '↗ SV'], [[1, 0], '→ vzhod'], [[1, 1], '↘ JV'], [[0, 1], '↓ jug'], [[-1, 1], '↙ JZ'], [[-1, 0], '← zahod'], [[-1, -1], '↖ SZ']];
const dirKey = d => d ? Math.round(Math.atan2(d[1], d[0]) / (Math.PI / 4)) : null;
const dirVec = k => { const [v] = DIR8.find(([v]) => dirKey(v) === k) || DIR8[0]; const m = Math.hypot(v[0], v[1]); return m === 1 ? v : [Math.round(v[0] / m * 10000) / 10000, Math.round(v[1] / m * 10000) / 10000]; };

/** HTML enega polja (vrednosti nastavimo prek DOM, da so imena varna). */
function fieldHtml(f, o, prefix = 'f') {
  const v = M.getField(o, f.key);
  const id = prefix + '_' + f.key.replace(/\W/g, '_');
  const lab = `<span>${esc(f.label)}</span>`;
  if (f.type === 'bool') {
    const on = f.key === 'loop' && o.t && (o.t === 'saw' || o.t === 'wasp') ? v !== false : !!v;
    return `<label class="mg-check"><input type="checkbox" data-f="${esc(f.key)}" data-t="bool" ${on ? 'checked' : ''}> ${esc(f.label)}</label>`;
  }
  if (f.type === 'text') return `<label class="ed-f">${lab}<input class="mg-input" id="${id}" data-f="${esc(f.key)}" data-t="text" maxlength="20"></label>`;
  if (f.type === 'select') return `<label class="ed-f">${lab}<select class="mg-select" data-f="${esc(f.key)}" data-t="select">${f.options.map(([k, n]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  if (f.type === 'dir') {
    const k = dirKey(v);
    return `<label class="ed-f">${lab}<select class="mg-select" data-f="dir" data-t="dir">${DIR8.map(([d, n]) => `<option value="${dirKey(d)}" ${dirKey(d) === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  }
  if (f.type === 'until') {
    const u = Array.isArray(v) ? v : ['', '', ''];
    return `<div class="ed-f"><span>${esc(f.label)}</span><div class="ed-f3">${[0, 1, 2].map(i => `<input class="mg-input" type="number" step="0.05" min="0" data-f="until" data-t="until" data-i="${i}" value="${u[i]}" aria-label="until ${i}">`).join('')}</div></div>`;
  }
  const step = f.type === 'int' ? 1 : f.step || 0.1;
  return `<label class="ed-f">${lab}<input class="mg-input" type="number" data-f="${esc(f.key)}" data-t="${f.type === 'int' ? 'int' : 'num'}" ${f.opt ? 'data-opt="1"' : ''} step="${step}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} value="${v ?? ''}" placeholder="${f.opt ? '—' : ''}"></label>`;
}

/** Preberi vrednost polja iz vnosa in jo zapiši v objekt (vrne false, če ni veljavna). */
function readField(inp, o, f) {
  const t = inp.dataset.t, key = inp.dataset.f;
  if (t === 'bool') { M.setField(o, key, inp.checked); if (key === 'stop' && !inp.checked) delete o.stop; return true; }
  if (t === 'text') { const s = inp.value.trim().slice(0, 20); if (!s) return false; M.setField(o, key, s); return true; }
  if (t === 'select') { M.setField(o, key, inp.value); return true; }
  if (t === 'dir') { o.dir = dirVec(+inp.value); return true; }
  if (t === 'until') {
    const ins = [...inp.parentElement.querySelectorAll('input')].map(x => x.value.trim());
    if (ins.every(s => s === '')) { delete o.until; return true; }
    const n = ins.map(Number);
    if (n.some(x => !Number.isFinite(x)) || n[0] <= 0) return false;
    o.until = n; return true;
  }
  if (inp.value.trim() === '') { if (inp.dataset.opt) { M.setField(o, key, undefined); return true; } return false; }
  let v = Number(inp.value);
  if (!Number.isFinite(v)) return false;
  if (f?.min != null) v = Math.max(f.min, v);
  if (f?.max != null) v = Math.min(f.max, v);
  if (t === 'int') v = Math.round(v);
  M.setField(o, key, v);
  return true;
}

function renderProps() {
  const el = $('#props');
  const L = st.L;
  if (st.layer === 3 && st.sel && M.getObj(L, st.sel)) return objProps(el);
  if (st.layer === 4 && st.routeSel != null && L.route?.[st.routeSel]) return routeProps(el);
  if (st.layer === 5) return levelProps(el);
  // povzetek
  const stars = M.starCount(L);
  el.innerHTML = `<h3></h3>
    <p class="ed-hint" id="pDesc"></p>
    <div class="ed-f"><span>Velikost</span><b>${L.size[0]} × ${L.size[1]}</b></div>
    <div class="ed-f"><span>Zvezdice</span><b class="${stars === 5 ? '' : 'bad'}" style="color:${stars === 5 ? 'var(--mg-green)' : 'var(--mg-red)'}">${stars}/5</b></div>
    <div class="ed-f"><span>Kontrolne točke</span><b>${(L.checkpoints || []).length}</b></div>
    <div class="ed-f"><span>Medalje</span><b>🥇 ${L.medals?.gold ?? '—'} · 🥈 ${L.medals?.silver ?? '—'} · 🥉 ${L.medals?.bronze ?? '—'}</b></div>
    <div class="ed-f"><span>Časovni bonus</span><b>${L.timeBonus ?? '—'} s</b></div>
    <div class="ed-f"><span>Autopilot (dev)</span><b>${L.dev?.time != null ? num(L.dev.time) + ' s' : '—'}</b></div>
    <p class="ed-hint">${st.layer === 3 ? 'Izberi objekt na tlorisu za urejanje lastnosti.' : st.layer === 4 ? 'Izberi točko poti za njene parametre.' : 'Plast 5 (⚙️) = ime, tema, velikost mreže.'}</p>`;
  el.querySelector('h3').textContent = L.name;
  el.querySelector('#pDesc').textContent = L.desc || '';
}

function objProps(el) {
  const L = st.L, ref = st.sel, k = M.kindOf(L, ref), K = M.KINDS[k], o = M.getObj(L, ref);
  const pos = M.objPos(L, ref);
  const isRect = K.shape === 'rect';
  let html = `<h3>${K.icon} ${esc(K.name)}${ref.i != null ? ` <span class="ed-hint">#${ref.i + 1}</span>` : ''}</h3>
    <div class="ed-f"><span>${isRect ? 'Levi zgornji kot x' : 'x'}</span><input class="mg-input" type="number" step="0.5" data-pos="0" value="${isRect ? o.x : pos[0]}"></div>
    <div class="ed-f"><span>${isRect ? 'Levi zgornji kot z' : 'z'}</span><input class="mg-input" type="number" step="0.5" data-pos="1" value="${isRect ? o.z : pos[1]}"></div>`;
  html += (K.fields || []).map(f => fieldHtml(f, o)).join('');
  if (K.path) {
    const pts = o.path;
    html += `<h3>Pot (${pts.length} točk)</h3>
      <button type="button" class="mg-btn ${st.pathEdit ? 'mg-btn--primary' : 'mg-btn--ghost'} mg-btn--small" id="pathEdit">✏️ ${st.pathEdit ? 'Urejam točke — klik doda, vleka premakne, desni klik izbriše' : 'Urejaj točke poti'}</button>`;
    if (K.path === 3) html += `<div class="ed-hint">Višina y vsake točke (plošča se dviga/spušča med točkami):</div>` +
      pts.map((p, i) => `<label class="ed-f"><span>${i === st.pathSel ? '▶ ' : ''}Točka ${i + 1} (${num(p[0])}; ${num(p[2])}) · y</span><input class="mg-input" type="number" step="0.5" min="0" max="20" data-py="${i}" value="${p[1]}"></label>`).join('');
  }
  if (k === 'switch' || k === 'door') {
    const other = k === 'switch' ? (L.doors || []).some(d => d.id === o.id) : (L.switches || []).some(s => s.id === o.id);
    html += `<p class="ed-hint" style="color:${other ? 'var(--mg-green)' : 'var(--mg-red)'}">${other ? '✔ povezano' : `✘ manjkajo ${k === 'switch' ? 'vrata' : 'stikalo'} z istim id`}</p>`;
  }
  html += `<div class="ed-row" style="margin-top:6px">
    ${K.single ? '' : '<button type="button" class="mg-btn mg-btn--ghost mg-btn--small" id="objDup">⧉ Podvoji (Ctrl+D)</button><button type="button" class="mg-btn mg-btn--danger mg-btn--small" id="objDel">🗑️ Izbriši (Del)</button>'}
    <button type="button" class="mg-btn mg-btn--ghost mg-btn--small" id="objFocus">🎯 V 3D</button></div>`;
  el.innerHTML = html;
  // besedilna polja (id) nastavimo prek DOM
  el.querySelectorAll('input[data-t="text"]').forEach(inp => { inp.value = String(M.getField(o, inp.dataset.f) ?? ''); });
  el.onchange = e => {
    const inp = e.target;
    if (inp.dataset.pos != null) {
      const v = Number(inp.value); if (!Number.isFinite(v)) return;
      commit(L => {
        const ob = M.getObj(L, ref);
        if (isRect) { if (inp.dataset.pos === '0') ob.x = v; else ob.z = v; }
        else { const p = M.objPos(L, ref); M.moveObj(L, ref, inp.dataset.pos === '0' ? v : p[0], inp.dataset.pos === '1' ? v : p[1]); }
      });
      return;
    }
    if (inp.dataset.py != null) { const v = Number(inp.value); if (Number.isFinite(v)) commit(L => { M.getObj(L, ref).path[+inp.dataset.py][1] = Math.max(0, Math.min(20, v)); }); return; }
    if (!inp.dataset.f) return;
    const f = (K.fields || []).find(x => x.key === inp.dataset.f);
    const before = JSON.stringify(st.L);
    history.begin(st.L);
    const okv = readField(inp, M.getObj(st.L, ref), f);
    if (!okv) { history.open = null; st.L = JSON.parse(before); ui.toast('Neveljavna vrednost.', { icon: '✋' }); renderProps(); return; }
    if (history.end(st.L)) afterChange();
    if (inp.dataset.t === 'text' || inp.dataset.t === 'select') renderProps();
  };
  el.onclick = e => {
    const id = e.target.closest('button')?.id;
    if (id === 'pathEdit') { st.pathEdit = !st.pathEdit; st.pathSel = null; view.dirty = true; renderProps(); }
    else if (id === 'objDel') deleteSel();
    else if (id === 'objDup') duplicateSel();
    else if (id === 'objFocus') { if (document.body.classList.contains('ed-no3d')) toggle3d(); const p = M.objCenter(st.L, ref); preview?.focus(p[0], p[1], 10); }
  };
}

function routeProps(el) {
  const L = st.L, i = st.routeSel, w = L.route[i];
  el.innerHTML = `<h3>🤖 Točka poti ${i + 1} / ${L.route.length}</h3>
    <div class="ed-f"><span>${w.mover != null ? 'odmik x' : 'x'}</span><input class="mg-input" type="number" step="0.25" data-f="x" data-t="num" value="${w.x}"></div>
    <div class="ed-f"><span>${w.mover != null ? 'odmik z' : 'z'}</span><input class="mg-input" type="number" step="0.25" data-f="z" data-t="num" value="${w.z}"></div>
    ${M.ROUTE_FIELDS.map(f => fieldHtml(f, w, 'r')).join('')}
    <p class="ed-hint">»until« = počakaj, da je (čas proge mod perioda) med »od« in »do« (sinhronizacija s premičnimi deli, kladivi …).</p>
    <div class="ed-row"><button type="button" class="mg-btn mg-btn--ghost mg-btn--small" data-mv="-1">▲ Prej</button><button type="button" class="mg-btn mg-btn--ghost mg-btn--small" data-mv="1">▼ Kasneje</button>
    <button type="button" class="mg-btn mg-btn--danger mg-btn--small" id="rtDel">🗑️ Izbriši</button></div>`;
  el.onchange = e => {
    const inp = e.target;
    if (!inp.dataset.f) return;
    const f = M.ROUTE_FIELDS.find(x => x.key === inp.dataset.f);
    const before = JSON.stringify(st.L);
    history.begin(st.L);
    const wp = st.L.route[i];
    const prevMover = wp.mover;
    if (!readField(inp, wp, f)) { history.open = null; st.L = JSON.parse(before); ui.toast('Neveljavna vrednost.', { icon: '✋' }); renderProps(); return; }
    if (inp.dataset.f === 'mover' && wp.mover !== prevMover) {
      // pretvori med absolutnimi koordinatami in odmikom od plošče
      const abs = prevMover != null && st.L.movers?.[prevMover] ? [st.L.movers[prevMover].path[0][0] + wp.x, st.L.movers[prevMover].path[0][2] + wp.z] : [wp.x, wp.z];
      const m = wp.mover != null ? st.L.movers?.[wp.mover] : null;
      if (wp.mover != null && !m) delete wp.mover;
      if (m) { wp.x = Math.round((abs[0] - m.path[0][0]) * 100) / 100; wp.z = Math.round((abs[1] - m.path[0][2]) * 100) / 100; }
      else { wp.x = abs[0]; wp.z = abs[1]; }
    }
    if (history.end(st.L)) afterChange();
    if (inp.dataset.f === 'mover') renderProps();
  };
  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'rtDel') deleteSel();
    else if (b.dataset.mv) {
      const j = i + +b.dataset.mv;
      if (j < 0 || j >= L.route.length) return;
      commit(L => { const [x] = L.route.splice(i, 1); L.route.splice(j, 0, x); });
      st.routeSel = j; renderProps();
    }
  };
}

function levelProps(el) {
  const L = st.L, th = L.theme || {};
  const preset = Object.keys(THEMES).find(k => JSON.stringify(THEMES[k]) === JSON.stringify(th)) || '';
  const COLS = [['sky.0', 'Nebo zgoraj'], ['sky.1', 'Nebo spodaj'], ['fog', 'Megla'], ['floor', 'Tla'], ['side', 'Stranice'], ['edge', 'Rob'], ['accent', 'Poudarek'], ['wall', 'Zid']];
  el.innerHTML = `<h3>⚙️ Proga</h3>
    <label class="ed-f"><span>Ime</span><input class="mg-input" id="lpName" maxlength="40"></label>
    <label class="mg-field"><span class="mg-label">Opis</span><textarea class="mg-input" id="lpDesc" maxlength="200" rows="2"></textarea></label>
    <div class="ed-f"><span>Id (NN-ime)</span><div class="ed-row" style="flex-wrap:nowrap"><input class="mg-input" id="lpId" maxlength="50" style="min-width:0"><button type="button" class="ed-ib" id="lpIdName" title="Id iz imena">↻</button></div></div>
    <label class="ed-f"><span>Sklop (glasba, privzeta lokacija)</span><select class="mg-select" id="lpSet">${[1, 2, 3].map(n => `<option ${L.set === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="ed-f"><span>Lokacija (nebo, svetloba, teksture)</span><select class="mg-select" id="lpLook"><option value="">Samodejno (po številki/sklopu)</option>${Object.entries(LOOKS).map(([k, v]) => `<option value="${k}" ${L.look === k ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    <label class="ed-f"><span>Barvna tema</span><select class="mg-select" id="lpTheme"><option value="">Lastne barve</option>${Object.keys(THEMES).map(k => `<option value="${k}" ${preset === k ? 'selected' : ''}>${esc(THEME_NAMES[k] || k)}</option>`).join('')}</select></label>
    ${COLS.map(([k, n]) => `<label class="ed-f"><span>${n}</span><input type="color" data-col="${k}" value="${/^#[0-9a-f]{6}$/i.test(M.getField(th, k) || '') ? M.getField(th, k) : '#888888'}"></label>`).join('')}
    <label class="ed-f"><span>Zasuk kamere (°, prazno = 0)</span><input class="mg-input" type="number" id="lpYaw" step="15" min="-180" max="180" value="${L.camYaw != null ? Math.round(L.camYaw * 180 / Math.PI) : ''}"></label>
    <h3>Medalje in čas</h3>
    <div class="ed-f"><span>🥇 zlato (s)</span><input class="mg-input" type="number" data-md="gold" min="1" max="600" value="${L.medals?.gold ?? ''}"></div>
    <div class="ed-f"><span>🥈 srebro (s)</span><input class="mg-input" type="number" data-md="silver" min="1" max="600" value="${L.medals?.silver ?? ''}"></div>
    <div class="ed-f"><span>🥉 bron (s)</span><input class="mg-input" type="number" data-md="bronze" min="1" max="600" value="${L.medals?.bronze ?? ''}"></div>
    <div class="ed-f"><span>Časovni bonus (s, 5–300)</span><input class="mg-input" type="number" id="lpTime" min="5" max="300" value="${L.timeBonus ?? ''}"></div>
    <p class="ed-hint">Najlažje: »🤖 Preveri rešljivost« → »Izračunaj medalje« (ista formula kot generator uradnih prog).</p>
    <h3>Velikost mreže: ${L.size[0]} × ${L.size[1]}</h3>
    <div class="ed-resize">
      ${[['top', 'Sever (zgoraj)'], ['bottom', 'Jug (spodaj)'], ['left', 'Zahod (levo)'], ['right', 'Vzhod (desno)']].map(([k, n]) => `<span>${n}</span><span></span>
        <button type="button" class="mg-btn mg-btn--ghost mg-btn--small" data-rs="${k}" data-d="-1" title="Odstrani vrstico/stolpec">−1</button>
        <button type="button" class="mg-btn mg-btn--ghost mg-btn--small" data-rs="${k}" data-d="1" title="Dodaj vrstico/stolpec">+1</button>`).join('')}
    </div>
    <p class="ed-hint">Ob spremembi na severu/zahodu se vsi objekti, start, cilj in poti premaknejo skupaj s ploščicami.</p>`;
  el.querySelector('#lpName').value = L.name || '';
  el.querySelector('#lpDesc').value = L.desc || '';
  el.querySelector('#lpId').value = L.id || '';
  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'lpIdName') { commit(L => { L.id = M.makeId(parseInt(L.id, 10) || 20, L.name); }); renderProps(); }
    if (b.dataset.rs) {
      const n = +b.dataset.d;
      const ok = commit(L => M.resizeLevel(L, { [b.dataset.rs]: n }));
      if (!ok) ui.toast(`Mreža mora biti med 3×3 in ${M.MAX_W}×${M.MAX_D}.`, { icon: '✋' });
      else if (b.dataset.rs === 'left' || b.dataset.rs === 'top') { view.ox -= (b.dataset.rs === 'left' ? n : 0) * view.scale; view.oy -= (b.dataset.rs === 'top' ? n : 0) * view.scale; }
      renderProps();
    }
  };
  el.onchange = e => {
    const t = e.target;
    if (t.id === 'lpName') { const v = t.value.trim().slice(0, 40); if (v.length >= 2) commit(L => { L.name = v; }); else ui.toast('Ime naj ima vsaj 2 znaka.', { icon: '✋' }); }
    else if (t.id === 'lpDesc') commit(L => { L.desc = t.value.trim().slice(0, 200); });
    else if (t.id === 'lpId') { const v = t.value.trim().toLowerCase(); if (/^[0-9]{2}-[a-z0-9-]+$/.test(v)) commit(L => { L.id = v; }); else ui.toast('Id mora biti oblike »NN-ime« (npr. 20-moja-proga).', { icon: '✋' }); }
    else if (t.id === 'lpSet') commit(L => { L.set = +t.value; });
    else if (t.id === 'lpLook') commit(L => { if (t.value) L.look = t.value; else delete L.look; });
    else if (t.id === 'lpTheme') { if (t.value) commit(L => { L.theme = clone(THEMES[t.value]); }); }
    else if (t.dataset.col) commit(L => { L.theme ||= {}; if (!Array.isArray(L.theme.sky)) L.theme.sky = ['#000000', '#888888']; M.setField(L.theme, t.dataset.col, t.value); });
    else if (t.id === 'lpYaw') commit(L => { if (t.value.trim() === '' || +t.value === 0) delete L.camYaw; else L.camYaw = Math.round(+t.value * Math.PI / 180 * 1000) / 1000; });
    else if (t.dataset.md) { const v = Math.round(+t.value); if (v > 0) commit(L => { L.medals ||= {}; L.medals[t.dataset.md] = v; }); }
    else if (t.id === 'lpTime') { const v = Math.round(+t.value); if (v >= 5 && v <= 300) commit(L => { L.timeBonus = v; }); }
    renderProps();
  };
}

/* ===================================================================== */
/*  Statusna vrstica                                                     */
/* ===================================================================== */

function renderStatus() {
  const L = st.L;
  const stars = M.starCount(L);
  const ver = D.isVerified({ L, verified: st.verified });
  const el = $('#status');
  el.innerHTML = `<span class="${stars === 5 ? 'good' : 'bad'}">★ ${stars}/5 zvezdic</span>
    ${st.errors.length ? `<button type="button" class="lnk bad" id="stErr">✘ Napake: ${st.errors.length}</button>` : '<span class="good">✔ Brez napak</span>'}
    ${st.warnings.length ? `<span class="warn" title="Stopnice brez klančine (plast Višine)">⚠ Stopnic: ${st.warnings.length}</span>` : ''}
    <span class="${ver ? 'good' : 'warn'}">${ver ? `✔ Rešljiva (${st.verified.by === 'autopilot' ? 'autopilot' : 'testna vožnja'}, ${num(st.verified.time, 1)} s)` : '○ Rešljivost ni preverjena'}</span>
    ${st.ready ? '<span class="good">🎮 V »Moje proge«</span>' : ''}
    ${st.published ? `<span class="${st.published.hash === M.levelHash(L) ? 'good' : 'warn'}">🌍 ${st.published.hash === M.levelHash(L) ? 'Objavljena' : 'Objavljena starejša različica'}</span>` : ''}
    <span class="ed-hint">${L.size[0]}×${L.size[1]} · <span class="mg-kbd">?</span> bližnjice</span>`;
  $('#stErr')?.addEventListener('click', showErrors);
}

function showErrors() {
  document.querySelector('.ed-errs')?.remove();
  const box = document.createElement('div');
  box.className = 'ed-errs';
  for (const e of st.errors.slice(0, 40)) {
    const b = document.createElement('button');
    b.type = 'button';
    const at = M.locateError(st.L, e);
    b.textContent = (at ? '📍 ' : '• ') + e.replace(/^proga[^:]*: /, '');
    b.onclick = () => { box.remove(); if (at) { view.centerOn(at[0], at[1]); if (view.scale < 20) { const r = $('#cv2d').getBoundingClientRect(); view.zoomAt(r.width / 2, r.height / 2, 24 / view.scale); } preview?.focus(at[0], at[1], 10); } };
    box.appendChild(b);
  }
  document.body.appendChild(box);
  setTimeout(() => addEventListener('pointerdown', function off(ev) { if (!box.contains(ev.target)) { box.remove(); removeEventListener('pointerdown', off); } }), 0);
}

function renderReady() {
  const b = $('#btnReady');
  b.classList.toggle('on', st.ready);
  b.textContent = st.ready ? '✅ Pripravljeno' : '☐ Pripravljeno';
  b.setAttribute('aria-pressed', st.ready);
  $('#btnUndo').disabled = !history.canUndo; $('#btnRedo').disabled = !history.canRedo;
}

/* ===================================================================== */
/*  Autopilot, medalje, testna vožnja                                    */
/* ===================================================================== */

function playableCopy() {
  const L = clone(st.L);
  const rt = L.route || [];
  const last = rt[rt.length - 1];
  const lp = last ? M.routePos(L, last) : null;
  let added = false;
  if (!lp || Math.hypot(lp[0] - L.goal[0], lp[1] - L.goal[1]) > 0.6) { L.route = [...rt, { x: L.goal[0], z: L.goal[1], speed: last?.speed ?? 5 }]; added = true; }
  return { L, added };
}

async function runBot() {
  if (!st.L.start || !st.L.goal) { ui.toast('Proga potrebuje start in cilj.', { icon: '✋' }); return; }
  ui.toast('Autopilot vozi …', { icon: '🤖', duration: 900 });
  await new Promise(r => setTimeout(r, 40));
  const { L, added } = playableCopy();
  let res;
  try { res = runAutopilot(L, { trace: true, maxT: 240 }); }
  catch (e) { console.warn(e); ui.toast('Autopilot ne more voziti te proge (napaka v progi).', { icon: '⚠️' }); return; }
  st.trace = { frames: res.frames, falls: res.trace.map(f => ({ x: f.x, z: f.z })), ok: res.finished };
  view.dirty = true;
  if (!res.finished) {
    const b = res.world.ball;
    ui.modal({ title: '🤖 Autopilot ni prišel do cilja', html: `<p>Padci: <b>${res.falls}</b>. Krogla je obstala pri x ${num(b.x)}, z ${num(b.z)}.
      Rdeči križci na tlorisu so mesta padcev, sled kaže pot.</p><p class="mg-small mg-muted">Popravi pot autopilota (plast 4 🤖): dodaj točke v zavojih, upočasni (<i>speed</i>), počakaj na premične dele (<i>until</i>).
      ${added ? 'Na konec poti je bila začasno dodana točka na cilju.' : ''}</p>` });
    return;
  }
  st.verified = { hash: M.levelHash(st.L), time: res.time, by: 'autopilot' };
  scheduleSave(); renderStatus();
  const sc = scoringFromRun(res);
  const v = await ui.modal({
    title: '🤖 Proga je rešljiva!',
    html: `<p>Autopilot je prišel do cilja v <b>${num(res.time, 2)} s</b> (padci: ${res.falls}, zvezdice: ${res.stars}/5).${added ? ' <span class="mg-muted">(na konec poti je bila začasno dodana točka na cilju)</span>' : ''}</p>
      <p>Medalje po formuli generatorja: 🥇 <b>${sc.medals.gold} s</b> · 🥈 <b>${sc.medals.silver} s</b> · 🥉 <b>${sc.medals.bronze} s</b>, časovni bonus <b>${sc.timeBonus} s</b>.</p>`,
    actions: [{ label: 'Zapri', value: false }, { label: 'Izračunaj medalje in časovni bonus', value: true, kind: 'primary' }],
  });
  if (v) { commit(L => { L.medals = sc.medals; L.timeBonus = sc.timeBonus; L.dev = sc.dev; }); renderProps(); ui.toast('Medalje, čas in dev zapisani.', { icon: '🥇' }); }
}

let lastDrive = null;
function testDrive(from = null) {
  if (!preview) { ui.toast('Testna vožnja potrebuje 3D (WebGL).', { icon: '⚠️' }); return; }
  if (!st.L.start || !st.L.goal) { ui.toast('Proga potrebuje start in cilj.', { icon: '✋' }); return; }
  flushSave();
  hideMenu();
  const dr = $('#drive');
  dr.classList.remove('mg-hidden');
  $('#dOver').classList.add('mg-hidden');
  $('#dStick').classList.toggle('mg-hidden', !isTouch);
  $('#dFrom').textContent = from ? `od točke (${num(from[0])}; ${num(from[1])})` : 'od starta';
  document.body.classList.add('ed-driving');
  preview.startDrive(st.L, {
    from, host: dr, stickEl: $('#dStick'), knobEl: $('#dKnob'),
    onUpdate: s => {
      $('#dTime').textContent = fmtTime(s.t * 1000);
      $('#dStars').textContent = `★ ${s.stars}/5`;
      $('#dFalls').textContent = `padci ${s.falls}`;
    },
    onEnd: r => driveEnd(r),
  });
}

function driveEnd(r) {
  lastDrive = r;
  const ov = $('#dOver');
  let note = '';
  if (r.fromStart) {
    st.verified = { hash: M.levelHash(st.L), time: r.time, by: 'drive' };
    scheduleSave(); renderStatus();
    note = '<p class="good" style="margin:0;color:var(--mg-green)">✔ Proga je rešljiva (lastna vožnja od starta do cilja).</p>';
  } else note = '<p class="mg-small mg-muted" style="margin:0">Vožnja ni bila od starta, zato ne šteje kot preverjanje rešljivosti.</p>';
  ov.innerHTML = `<div class="mg-card mg-card--glow"><h2 class="mg-title" style="margin:0">Cilj!</h2>
    <p style="margin:0">Čas <b>${fmtTime(r.time * 1000)}</b> · padci <b>${r.falls}</b> · zvezdice <b>${r.stars}/5</b></p>${note}
    <button type="button" class="mg-btn mg-btn--primary" data-d="again">Še enkrat (R)</button>
    ${r.fromStart ? '<button type="button" class="mg-btn mg-btn--cyan" data-d="medals">Medalje iz mojega časa</button>' : ''}
    <button type="button" class="mg-btn mg-btn--ghost" data-d="back">Nazaj v urejevalnik (Esc)</button></div>`;
  ov.classList.remove('mg-hidden');
  ov.onclick = e => {
    const v = e.target.closest('[data-d]')?.dataset.d;
    if (v === 'again') { ov.classList.add('mg-hidden'); preview.restartDrive(); }
    else if (v === 'back') endDrive();
    else if (v === 'medals') {
      const sc = scoringFromRun({ time: r.time, falls: r.falls });
      commit(L => { L.medals = sc.medals; L.timeBonus = sc.timeBonus; });
      ui.toast(`Medalje: 🥇 ${sc.medals.gold} · 🥈 ${sc.medals.silver} · 🥉 ${sc.medals.bronze} s, čas ${sc.timeBonus} s`, { icon: '🥇', duration: 3500 });
    }
  };
}

function endDrive() {
  if (!preview?.drive) return;
  preview.stopDrive();
  $('#drive').classList.add('mg-hidden');
  document.body.classList.remove('ed-driving');
  view.resize();
}

/** Pot autopilota iz zadnje testne vožnje do cilja (vzorec na ~0,6 s). */
function routeFromDrive() {
  if (!lastDrive?.fromStart || !lastDrive.frames?.length) { ui.toast('Najprej prevozi progo od starta do cilja (▶ Preizkusi).', { icon: '🎮' }); return; }
  const fr = lastDrive.frames;
  const pts = [];
  for (let i = 12; i < fr.length; i += 12) {
    const [x, y, z] = fr[i];
    const prev = fr[i - 12];
    if (y < -20 || Math.hypot(x - prev[0], z - prev[2]) > 12) continue;   // padci / vrnitve
    const sp = Math.hypot(x - prev[0], z - prev[2]) / 0.6;
    pts.push({ x: Math.round(x * 4) / 4, z: Math.round(z * 4) / 4, speed: Math.max(2.5, Math.min(9, Math.round(sp * 2) / 2)) });
  }
  pts.push({ x: st.L.goal[0], z: st.L.goal[1], speed: 4 });
  commit(L => { L.route = pts; });
  st.routeSel = null; renderTools(); renderProps();
  ui.toast(`Pot: ${pts.length} točk iz tvoje vožnje. Preveri z autopilotom.`, { icon: '🤖' });
}

/* ===================================================================== */
/*  Proge: nova, osnutki, uradne, uvoz                                   */
/* ===================================================================== */

async function officialLevels() {
  if (OFFICIAL) return OFFICIAL;
  try { OFFICIAL = await loadLevels(new URL('./levels/', import.meta.url)); } catch { OFFICIAL = []; }
  return OFFICIAL;
}

async function filesModal() {
  flushSave();
  const box = document.createElement('div');
  box.className = 'mg-stack';
  box.innerHTML = `<div class="ed-row"><button type="button" class="mg-btn mg-btn--primary mg-btn--small" data-a="new">＋ Nova proga</button>
      <button type="button" class="mg-btn mg-btn--cyan mg-btn--small" data-a="random">🎲 Naključna proga</button>
      <label class="ed-row ed-hint">Velikost <input class="mg-input" type="number" id="nW" min="5" max="${M.MAX_W}" value="15" style="width:64px"> × <input class="mg-input" type="number" id="nD" min="5" max="${M.MAX_D}" value="22" style="width:64px"></label></div>
    <h3 class="mg-title" style="margin:6px 0 0;font-size:14px">Moji osnutki (${D.listDrafts().length}/${D.MAX_DRAFTS})</h3>
    <div class="ed-list" id="dList"></div>
    <h3 class="mg-title" style="margin:6px 0 0;font-size:14px">Uradne proge (kopija kot izhodišče)</h3>
    <div class="ed-off" id="oList"><span class="mg-spin"></span></div>
    <h3 class="mg-title" style="margin:6px 0 0;font-size:14px">Uvozi</h3>
    <div class="ed-row"><label class="mg-btn mg-btn--ghost mg-btn--small">📂 Odpri datoteko .json<input type="file" accept=".json,application/json" id="impFile" hidden></label></div>
    <textarea class="mg-input ed-ta" id="impText" placeholder="… ali prilepi JSON proge sem"></textarea>
    <div><button type="button" class="mg-btn mg-btn--cyan mg-btn--small" data-a="paste">Uvozi prilepljeno</button></div>`;
  const list = box.querySelector('#dList');
  for (const d of D.listDrafts()) {
    const it = document.createElement('div');
    it.className = 'ed-item';
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 128;
    drawThumb(cv, d.L);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = (d.key === st.key ? '✏️ ' : '') + (d.L.name || '(brez imena)');
    const dt = document.createElement('div'); dt.className = 'dt';
    dt.textContent = new Date(d.updated || 0).toLocaleString('sl-SI', { dateStyle: 'short', timeStyle: 'short' }) + (d.ready ? ' · 🎮 pripravljena' : '') + ` · ${d.L.size[0]}×${d.L.size[1]}`;
    const row = document.createElement('div'); row.className = 'ed-row';
    row.innerHTML = `<button type="button" class="mg-btn mg-btn--primary" data-open="${esc(d.key)}">Odpri</button><button type="button" class="mg-btn mg-btn--danger" data-del="${esc(d.key)}" aria-label="Izbriši">🗑️</button>`;
    it.append(cv, nm, dt, row);
    list.appendChild(it);
  }
  if (!list.children.length) list.innerHTML = '<p class="ed-hint">Ni osnutkov.</p>';
  let close;
  const done = d => { close?.(); openDraft(d); scheduleSave(); };
  box.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.a === 'new') {
      const W = +box.querySelector('#nW').value || 15, Dd = +box.querySelector('#nD').value || 22;
      done({ key: D.newKey(), L: M.newLevel({ name: 'Nova proga', W, D: Dd }), ready: false, verified: null });
    } else if (b.dataset.a === 'random') { close?.(); randomModal(); }
    else if (b.dataset.open) { const d = D.getDraft(b.dataset.open); if (d) { close?.(); openDraft(d); } }
    else if (b.dataset.del) {
      if (!(await ui.confirm('Izbrišem ta osnutek? Tega ni mogoče razveljaviti.', { danger: true, yes: 'Izbriši' }))) return;
      D.removeDraft(b.dataset.del);
      if (b.dataset.del === st.key) { const next = D.listDrafts()[0]; close?.(); openDraft(next || { key: D.newKey(), L: M.newLevel(), ready: false }); if (!next) scheduleSave(); }
      else b.closest('.ed-item').remove();
    } else if (b.dataset.off) {
      const O = (await officialLevels()).find(L => L.id === b.dataset.off);
      if (O) done({ key: D.newKey(), L: M.copyLevel(O), ready: false, verified: null });
    } else if (b.dataset.a === 'paste') importText(box.querySelector('#impText').value, done);
  });
  box.querySelector('#impFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 1e6) { ui.toast('Datoteka je prevelika.', { icon: '✋' }); return; }
    importText(await f.text(), done);
  });
  officialLevels().then(list => {
    const o = box.querySelector('#oList');
    o.innerHTML = '';
    for (const L of list) { const b = document.createElement('button'); b.type = 'button'; b.className = 'mg-btn mg-btn--ghost mg-btn--small'; b.dataset.off = L.id; b.textContent = L.id.slice(0, 2) + ' · ' + L.name; o.appendChild(b); }
    if (!list.length) o.textContent = 'Uradnih prog ni bilo mogoče naložiti.';
  });
  ui.modal({ title: '📁 Proge', content: box, wide: true, actions: [{ label: 'Zapri', value: null }], onOpen: (_, c) => { close = c; } });
}

/** 🎲 Naključna proga: generator (editor/generate.js) ustvari nov, že preverjeno rešljiv osnutek. */
function randomModal() {
  flushSave();
  $('#edEmpty').classList.add('mg-hidden');
  openGenerator({
    onCreate: d => openDraft(d),
    onPlay: d => { location.href = withQs('index.html', 'play=' + encodeURIComponent(d.key)); },
  });
}

function importText(text, done) {
  let L;
  try { L = JSON.parse(text); } catch { ui.toast('To ni veljaven JSON.', { icon: '⚠️' }); return; }
  // uvoz dovoli tudi nedokončane proge (urejamo jih), a zavrne tuje oblike
  if (!L || typeof L !== 'object' || !Array.isArray(L.map)) { ui.toast('To ni proga (manjka »map«).', { icon: '⚠️' }); return; }
  try { L = sanitizeLevel(L); }
  catch (e) {
    if (!e.errors) { ui.toast(e.message, { icon: '⚠️', duration: 4000 }); return; }
    // veljavna oblika, a z napakami validatorja: odpri in pokaži napake
    L = JSON.parse(text);
    if (L.map.length > M.MAX_D || L.map.some(r => typeof r !== 'string' || r.length > M.MAX_W)) { ui.toast('Mreža je prevelika.', { icon: '⚠️' }); return; }
    ui.toast(`Uvoženo z ${e.errors.length} napakami — glej statusno vrstico.`, { icon: '⚠️', duration: 3500 });
  }
  L.name = String(L.name || 'Uvožena proga').slice(0, 40);
  if (!L.start) L.start = [0.5, 0.5];
  if (!L.goal) L.goal = [0.5, 0.5];
  done({ key: D.newKey(), L, ready: false, verified: null });
}

/* ===================================================================== */
/*  Izvoz, deljenje, pripravljeno                                        */
/* ===================================================================== */

function exportModal() {
  const json = formatLevelJson(st.L);
  const box = document.createElement('div');
  box.className = 'mg-stack';
  box.innerHTML = `<p class="mg-small mg-muted" style="margin:0">Datoteka <b></b> (${(json.length / 1024).toFixed(1).replace('.', ',')} KB), enaka oblika kot uradne proge v <code>levels/</code>.</p>
    <div class="ed-row"><button type="button" class="mg-btn mg-btn--primary" data-a="dl">⬇ Prenesi JSON</button><button type="button" class="mg-btn mg-btn--cyan" data-a="copy">📋 Kopiraj v odložišče</button></div>
    ${st.errors.length ? `<p class="mg-small" style="color:var(--mg-red);margin:0">Proga ima ${st.errors.length} napak validatorja — izvoz je mogoč, v igri pa je ne bo mogoče odpreti.</p>` : ''}`;
  box.querySelector('b').textContent = st.L.id + '.json';
  box.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'dl') {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const l = document.createElement('a'); l.href = url; l.download = st.L.id + '.json'; document.body.appendChild(l); l.click(); l.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else if (a === 'copy') {
      try { await navigator.clipboard.writeText(json); ui.toast('JSON je v odložišču.', { icon: '📋' }); }
      catch { ui.toast('Kopiranje ni uspelo — uporabi »Prenesi JSON«.', { icon: '⚠️' }); }
    }
  });
  ui.modal({ title: '⬇ Izvozi progo', content: box, actions: [{ label: 'Zapri', value: null }] });
}

function requireReady(what) {
  if (st.errors.length) { ui.toast(`Najprej popravi napake (${st.errors.length}) — glej statusno vrstico.`, { icon: '✋', duration: 3500 }); return false; }
  if (!D.isVerified({ L: st.L, verified: st.verified })) {
    ui.modal({ title: 'Najprej preveri rešljivost', html: `<p>${what} je mogoče le, ko je proga dokazano rešljiva: <b>🤖 Preveri rešljivost</b> (autopilot pride do cilja) ali <b>▶ Preizkusi</b> in prevozi progo od starta do cilja.</p>` });
    return false;
  }
  return true;
}

async function toggleReady() {
  if (st.ready) { st.ready = false; scheduleSave(); renderReady(); renderStatus(); ui.toast('Proga ni več med »Moje proge«.', { icon: '☐' }); return; }
  if (!requireReady('Objava med »Moje proge«')) return;
  st.ready = true; scheduleSave(); flushSave(); renderReady(); renderStatus();
  const v = await ui.modal({ title: '✅ Pripravljeno', html: '<p>Proga je v igri med <b>»Moje proge«</b> (Na čas, lokalni čas in ghost; brez uradnih lestvic).</p>',
    actions: [{ label: 'Ostani tukaj', value: false }, { label: '🎮 Igraj v igri', value: true, kind: 'primary' }] });
  if (v) location.href = withQs('index.html', 'play=' + encodeURIComponent(st.key));
}

/* ------------------------------------------------------------ objava med »Proge skupnosti« */

/** Hub (prijava, profil) šele ob objavi — urejevalnik deluje tudi brez strežnika. */
async function ensureHub() {
  await hub.init({ gameId: 'krogla' });
  return hub.profile;
}

async function publish() {
  if (!requireReady('Objava med »Proge skupnosti«')) return;
  if (!(await ensureHub())) return;
  const hash = M.levelHash(st.L);
  const time = st.L.dev?.time ?? st.verified?.time;
  let data;
  try { data = sanitizeLevel(clone(st.L)); } catch (e) { ui.toast(e.message, { icon: '⚠️' }); return; }
  // objava je morda umaknjena v igri (ali objavljena v drugem načinu, npr. offline)
  if (st.published) {
    let still = true;
    try { still = !!(await hub.getLevel(st.published.id)); } catch { /* brez povezave: pusti */ }
    if (!still) { st.published = null; st.saved = false; flushSave(); renderStatus(); }
  }
  const pub = st.published;
  const box = document.createElement('div');
  box.className = 'mg-stack';
  const fresh = !pub, same = pub && pub.hash === hash;
  box.innerHTML = `<p style="margin:0">${fresh ? 'Proga bo vidna vsem igralcem v igri pod <b>»🌍 Proge skupnosti«</b>, z lastno lestvico časov.'
      : same ? 'Ta proga je že objavljena. Objava posodobi ime in opis.' : '<b>Proga se je od objave spremenila.</b> Nova različica nadomesti staro — lestvica stare različice se ne prenese.'}</p>
    <p class="mg-small mg-muted" style="margin:0">Objavljaš kot <b id="pubWho"></b>${hub.offline ? ' · <span style="color:var(--mg-yellow)">offline način: objava je vidna le v tem brskalniku</span>' : ''}. Največ 20 objavljenih prog na igralca.</p>
    <div class="ed-row"><button type="button" class="mg-btn mg-btn--primary" data-a="pub">🌍 ${fresh ? 'Objavi' : same ? 'Posodobi objavo' : 'Objavi novo različico'}</button>
      ${pub ? '<button type="button" class="mg-btn mg-btn--danger" data-a="del">Umakni objavo</button>' : ''}
      ${pub ? '<a class="mg-btn mg-btn--ghost" id="pubOpen">Odpri v igri</a>' : ''}</div>`;
  box.querySelector('#pubWho').textContent = hub.profile.nickname;
  if (pub) box.querySelector('#pubOpen').href = withQs('index.html', 'community=' + encodeURIComponent(pub.id));
  let close;
  box.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    e.target.closest('button').disabled = true;
    try {
      if (a === 'pub') {
        const r = await hub.publishLevel({ name: st.L.name, hash, data, devMs: Math.max(1, Math.round((time || 60) * 1000)), replace: pub && !same ? pub.id : null });
        st.published = { id: r.id, hash };
        st.saved = false; flushSave(); renderStatus();
        close?.();
        const v = await ui.modal({ title: '🌍 Objavljeno', html: '<p>Proga je med »Proge skupnosti«. Prijatelji jo najdejo v meniju igre.</p>',
          actions: [{ label: 'Zapri', value: false }, { label: 'Odpri v igri', value: true, kind: 'primary' }] });
        if (v) location.href = withQs('index.html', 'community=' + encodeURIComponent(r.id));
      } else if (a === 'del') {
        if (!(await ui.confirm('Umaknem progo iz »Proge skupnosti«? Njena lestvica ne bo več dosegljiva.', { danger: true, yes: 'Umakni' }))) { e.target.closest('button').disabled = false; return; }
        await hub.deleteLevel(pub.id);
        st.published = null; st.saved = false; flushSave(); renderStatus();
        close?.();
        ui.toast('Objava umaknjena.', { icon: '🗑️' });
      }
    } catch (err) {
      e.target.closest('button').disabled = false;
      ui.toast(err.message || 'Objava ni uspela.', { icon: '⚠️', duration: 4000 });
    }
  });
  ui.modal({ title: '🌍 Proge skupnosti', content: box, actions: [{ label: 'Zapri', value: null }], onOpen: (_, c) => { close = c; } });
}

async function share() {
  if (!requireReady('Deljenje')) return;
  let data;
  try { data = await encodeLevel(st.L); } catch (e) { console.warn(e); ui.toast('Povezave ni bilo mogoče ustvariti.', { icon: '⚠️' }); return; }
  const url = new URL(withQs('index.html'), location.href);
  url.searchParams.set('custom', data);
  const link = url.href;
  const box = document.createElement('div');
  box.className = 'mg-stack';
  if (link.length > MAX_LINK) {
    box.innerHTML = `<p><b style="color:var(--mg-red)">Povezava je predolga</b> (${link.length.toLocaleString('sl-SI')} znakov, največ ~${MAX_LINK.toLocaleString('sl-SI')}). Takšne povezave se pogosto odrežejo v sporočilih in brskalnikih.</p>
      <p class="mg-small mg-muted">Pomanjšaj progo (✂️ Obreži prazne robove) ali jo deli kot datoteko JSON — prejemnik jo odpre v urejevalniku (📁 Proge → Odpri datoteko).</p>
      <div class="ed-row"><button type="button" class="mg-btn mg-btn--primary" data-a="file">⬇ Izvozi datoteko</button><button type="button" class="mg-btn mg-btn--ghost" data-a="copy">Vseeno kopiraj povezavo</button></div>`;
  } else {
    box.innerHTML = `<p class="mg-small mg-muted" style="margin:0">Kdor odpre povezavo, lahko progo odigra ali shrani med svoje proge (${link.length.toLocaleString('sl-SI')} znakov${typeof CompressionStream === 'function' ? ', stisnjeno' : ''}).</p>
      <textarea class="mg-input ed-ta" readonly id="shLink"></textarea>
      <div class="ed-row"><button type="button" class="mg-btn mg-btn--primary" data-a="copy">📋 Kopiraj povezavo</button><a class="mg-btn mg-btn--ghost" target="_blank" rel="noopener" id="shOpen">Odpri v novem zavihku</a></div>`;
    box.querySelector('#shLink').value = link;
    box.querySelector('#shOpen').href = link;
  }
  box.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'copy') { try { await navigator.clipboard.writeText(link); ui.toast('Povezava je v odložišču.', { icon: '🔗' }); } catch { box.querySelector('#shLink')?.select(); ui.toast('Označi in kopiraj ročno (Ctrl+C).', { icon: '⚠️' }); } }
    else if (a === 'file') exportModal();
  });
  ui.modal({ title: '🔗 Deli progo', content: box, actions: [{ label: 'Zapri', value: null }] });
}

/* ===================================================================== */
/*  Pomoč, 3D, bližnjice                                                 */
/* ===================================================================== */

function help() {
  const k = s => `<span class="mg-kbd">${s}</span>`;
  ui.modal({
    title: 'Urejevalnik prog — bližnjice', wide: true,
    html: `<div class="mg-stack" style="text-align:left;font-size:14px">
      <p><b>Plasti:</b> ${k('1')} ploščice · ${k('2')} višine · ${k('3')} objekti · ${k('4')} pot autopilota · ${k('5')} lastnosti proge.</p>
      <p><b>Pogled:</b> kolešček = zoom · srednji gumb ali ${k('presledek')} + vleka = premik · ${k('Home')} = cela proga · telefon: dva prsta = premik in zoom, tap = postavi, dolg pritisk = meni.</p>
      <p><b>Ploščice/višine:</b> ${k('B')} čopič/nastavi · ${k('R')} pravokotnik · ${k('F')} zapolni · ${k('K')} ali Alt + klik = pipeta · ${k('U')}/${k('J')} dvigni/spusti · ${k('L')} klančina · ${k('[')} ${k(']')} velikost čopiča.</p>
      <p><b>Objekti:</b> klik = izberi/postavi · vleka = premakni (Shift = brez mreže) · ${k('Del')} izbriši · ${k('Ctrl+D')} podvoji · ${k('Esc')} prekliči izbiro. Poti žag, os in plošč: »✏️ Urejaj točke poti« — klik doda, vleka premakne, desni klik izbriše.</p>
      <p><b>Splošno:</b> ${k('Ctrl+Z')} razveljavi · ${k('Ctrl+Y')}/${k('Ctrl+Shift+Z')} uveljavi · ${k('Ctrl+S')} shrani · ${k('T')} testna vožnja · desni klik → »Začni tukaj« · ${k('Tab')} 3D da/ne · ${k('?')} ta pomoč.</p>
      <p><b>Testna vožnja:</b> puščice/WASD ali miška · ${k('R')} znova · ${k('Esc')} nazaj v urejevalnik.</p>
      <p><b>Objava:</b> proga mora imeti 5 zvezdic, brez napak, in biti rešljiva (🤖 autopilot ali lastna vožnja do cilja). Nato ✅ Pripravljeno → v igri »Moje proge«, ali 🔗 Deli.</p>
    </div>`,
  });
}

function toggle3d() {
  document.body.classList.toggle('ed-no3d');
  if (preview) { preview.visible = !document.body.classList.contains('ed-no3d'); preview.setLevel(st.L, { delay: 0 }); }
  requestAnimationFrame(() => { view.resize(); preview?.resize(); });
}

function bindUi() {
  $('#layers').onclick = e => { const b = e.target.closest('[data-layer]'); if (b) setLayer(+b.dataset.layer); };
  $('#tools').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tool) { st.tileTool = b.dataset.tool; renderTools(); }
    else if (b.dataset.tile) { st.tile = b.dataset.tile === 'void' ? ' ' : b.dataset.tile; if (st.tileTool === 'pick') st.tileTool = 'brush'; renderTools(); }
    else if (b.dataset.htool) { st.hTool = b.dataset.htool; renderTools(); }
    else if (b.dataset.kind != null) setObjKind(b.dataset.kind || null);
    else if (b.id === 'rtGoal') { commit(L => { (L.route ||= []).push({ x: L.goal[0], z: L.goal[1], speed: 4 }); }); renderTools(); }
    else if (b.id === 'rtClear') { commit(L => { L.route = []; }); st.routeSel = null; renderTools(); renderProps(); }
    else if (b.id === 'rtBot') runBot();
    else if (b.id === 'rtDrive') routeFromDrive();
    else if (b.id === 'crop') crop();
    else if (b.id === 'fitView') view.fit(st.L);
  };
  $('#tools').onchange = e => {
    if (e.target.id === 'brushSize') st.brush = +e.target.value;
    if (e.target.id === 'hBrush') st.hBrush = +e.target.value;
    if (e.target.id === 'hValue') { const v = Math.max(0, Math.min(17.5, Math.round(+e.target.value * 2) / 2)); st.hValue = Number.isFinite(v) ? v : 0; e.target.value = st.hValue; }
  };
  $('#btnFiles').onclick = filesModal;
  $('#edEmptyGen').onclick = randomModal;
  $('#edEmptyClose').onclick = () => $('#edEmpty').classList.add('mg-hidden');
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
  $('#btnTest').onclick = () => testDrive(null);
  $('#btnBot').onclick = runBot;
  $('#btnExport').onclick = exportModal;
  $('#btnShare').onclick = share;
  $('#btnPublish').onclick = publish;
  $('#btnReady').onclick = toggleReady;
  $('#btn3d').onclick = toggle3d;
  $('#btnHelp').onclick = help;
  $('#fit3d').onclick = () => preview?.frameAll();
  $('#zIn').onclick = () => { const r = $('#cv2d').getBoundingClientRect(); view.zoomAt(r.width / 2, r.height / 2, 1.25); };
  $('#zOut').onclick = () => { const r = $('#cv2d').getBoundingClientRect(); view.zoomAt(r.width / 2, r.height / 2, 0.8); };
  $('#zFit').onclick = () => view.fit(st.L);
  $('#dBack').onclick = endDrive;
  $('#dRestart').onclick = () => { $('#dOver').classList.add('mg-hidden'); preview?.restartDrive(); };
  // klik drugam zapre meni (desni klik na tloris ga odpre v istem dogodku, zato tega ne štejemo)
  addEventListener('pointerdown', e => { if (!$('#ctxMenu').contains(e.target) && !(e.target.id === 'cv2d' && e.button === 2)) hideMenu(); });
  addEventListener('keydown', onKey);
}

function crop() {
  const L = st.L;
  let c0 = Infinity, r0 = Infinity, c1 = -1, r1 = -1;
  L.map.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] !== ' ') { c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); } });
  if (c1 < 0) return;
  const d = { left: -(c0 - 1), top: -(r0 - 1), right: -(L.size[0] - 2 - c1), bottom: -(L.size[1] - 2 - r1) };
  if (Object.values(d).every(v => v === 0)) { ui.toast('Robovi so že obrezani (1 prazna vrstica okoli).', { icon: '✂️' }); return; }
  if (commit(L => M.resizeLevel(L, d))) { view.fit(st.L); renderProps(); ui.toast(`Nova velikost: ${st.L.size[0]} × ${st.L.size[1]}`, { icon: '✂️' }); }
}

function onKey(e) {
  if (preview?.drive) {
    if (e.code === 'Escape') { e.preventDefault(); endDrive(); }
    else if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); $('#dOver').classList.add('mg-hidden'); preview.restartDrive(); }
    return;
  }
  if (document.querySelector('.mg-modal-back')) return;
  const t = e.target;
  if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (ctrl && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
  if (ctrl && e.code === 'KeyS') { e.preventDefault(); st.saved = false; flushSave(); ui.toast('Shranjeno.', { icon: '💾', duration: 1200 }); return; }
  if (ctrl && e.code === 'KeyD') { e.preventDefault(); duplicateSel(); return; }
  if (ctrl) return;
  if (e.code === 'Tab') { e.preventDefault(); toggle3d(); return; }
  if (/^Digit[1-5]$/.test(e.code)) { setLayer(+e.code.slice(5)); return; }
  if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); deleteSel(); return; }
  if (e.code === 'Escape') { hideMenu(); if (op) onCancel(); else if (st.pathEdit) { st.pathEdit = false; renderProps(); } else if (st.objKind) setObjKind(null); else { selectObj(null); st.routeSel = null; renderProps(); } view.dirty = true; return; }
  if (e.key === '?') { help(); return; }
  if (e.code === 'KeyT') { testDrive(null); return; }
  if (e.code === 'Home') { view.fit(st.L); return; }
  const tl = { KeyB: 'brush', KeyR: 'rect', KeyF: 'fill', KeyK: 'pick' }, th = { KeyB: 'set', KeyU: 'up', KeyJ: 'down', KeyL: 'ramp', KeyR: 'rect', KeyK: 'pick' };
  if (st.layer === 1 && tl[e.code]) { st.tileTool = tl[e.code]; renderTools(); return; }
  if (st.layer === 2 && th[e.code]) { st.hTool = th[e.code]; renderTools(); return; }
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    const d = e.code === 'BracketLeft' ? -1 : 1;
    if (st.layer === 1) st.brush = Math.max(1, Math.min(5, st.brush + d));
    if (st.layer === 2) st.hBrush = Math.max(1, Math.min(5, st.hBrush + d));
    renderTools(); return;
  }
  // puščice premaknejo izbrani objekt
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.code] && st.layer === 3 && st.sel) {
    e.preventDefault();
    const [dx, dz] = arrows[e.code].map(v => v * (e.shiftKey ? 0.1 : 0.5));
    commit(L => { const K = M.KINDS[M.kindOf(L, st.sel)]; if (K.shape === 'rect') { const o = M.getObj(L, st.sel); o.x = Math.round((o.x + dx) * 100) / 100; o.z = Math.round((o.z + dz) * 100) / 100; } else { const p = M.objPos(L, st.sel); M.moveObj(L, st.sel, Math.round((p[0] + dx) * 100) / 100, Math.round((p[1] + dz) * 100) / 100); } });
    renderProps();
  }
}

boot();

// razvojni dostop (samo za preverjanje v brskalniku)
if (QS.has('dev')) window.__ed = { st, history, M, D, randomModal, commit, undo, redo, runBot, testDrive, endDrive, openDraft, flushSave, setLayer, selectObj, get preview() { return preview; }, get view() { return view; } };
