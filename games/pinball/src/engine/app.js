/* =====================================================================
   APLIKACIJA — povezuje jedro, pravila mize, izris, DMD, zvok, UI in vnos.
   startApp(table, view) zažene izbrano mizo v index.html (#view, #dmd …).
   table = tables/<id>/index.js (logika), view = tables/<id>/view.js (grafika).
   ===================================================================== */
import { W, H, QUALITY } from './config.js';
import { Bus } from './bus.js';
import { Game } from './game.js';
import { Renderer } from './render/renderer.js';
import { DMD } from './render/dmd.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { setupInput } from './input.js';
import * as Store from './storage.js';
import * as Board from './leaderboard.js';

const $ = id => document.getElementById(id);

export function startApp(table, view = {}, opts = {}) {
  const settings = Store.loadSettings();
  const bus = new Bus();
  const T = table.buildTable();
  const game = new Game(T, bus, table);
  const PAL = game.PAL;
  const renderer = new Renderer($('view'), T, game, bus, view);
  const dmd = new DMD($('dmd'), $('dmdGlow'), view.dmd || {}, PAL);
  const audio = new Audio(settings);
  Board.init(table.id);

  const isTouch = matchMedia('(pointer: coarse)').matches;
  window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
  if (isTouch) document.body.classList.add('touch');
  game.launchHint = isTouch ? 'povleci navzdol spodaj desno' : 'drži PRESLEDEK, nato spusti';
  if (view.ui && view.ui.title) document.title = view.ui.title + (view.ui.version ? ' ' + view.ui.version : '');

  /* ---------------- akcije aplikacije ---------------- */
  const app = {
    game, audio, renderer, settings, tableId: table.id,
    startGame() {
      audio.init();
      ui.close();
      game.startGame();
      showTouchHint();
    },
    resume() { game.paused = false; ui.close(); audio.setVolume('music', settings.music); },
    pause() {
      if (game.state !== 'play' && game.state !== 'bonus') return;
      game.paused = true;
      for (const f of T.flippers) game.setFlipper(f.button, false);
      ui.showPause();
      audio.setVolume('music', settings.music * 0.35);
    },
    quit() {
      game.paused = false;
      game.balls = []; game.timers = []; game.pending = 0;
      game.rules.abort();
      game.state = 'attract';
      audio.setVolume('music', settings.music);
      ui.showStart();
    },
    setQuality(k) {
      settings.quality = k; Store.saveSettings(settings);
      if (k === 'auto') renderer.setQuality(defaultQuality(), true);
      else renderer.setQuality(k, false);
    },
    setVolume(kind, v) { settings[kind] = v; Store.saveSettings(settings); audio.setVolume(kind, v); },
    setMuted(m) { settings.muted = m; Store.saveSettings(settings); audio.setMuted(m); },
    setFps(on) { settings.fps = on; Store.saveSettings(settings); $('fps').classList.toggle('on', on); },
  };
  const ui = new UI(app, view);

  function defaultQuality() { return isTouch ? 'med' : 'high'; }

  /* ---------------- dogodki → zvok, DMD, UI ---------------- */
  const SFX = new Set(['bumper', 'sling', 'drop', 'dropsComplete', 'review', 'standup', 'lane', 'lanesComplete', 'spin', 'orbit', 'rampEnter',
    'rampMade', 'rampExit', 'scoopEnter', 'scoopEject', 'launch', 'drain', 'wall', 'lock', 'kickback', 'tilt', 'tiltWarn', 'nudge',
    'jackpot', 'superJackpot', 'multiball', 'modeStart', 'modeComplete', 'modeFail', 'wizardStart', 'mystery', 'skill', 'extraBall',
    'ballSave', 'combo', 'flipper']);
  const ALIAS = { standup: 'review', ballLocked: 'lock', lockRelease: 'scoopEject', captiveHit: 'drop', post: 'drop', magnet: 'rampEnter' };
  bus.on('*', (d, n) => { if (SFX.has(n)) audio.play(n, d); else if (ALIAS[n]) audio.play(ALIAS[n], d); });
  bus.on('msg', m => dmd.show(m));
  bus.on('endOfBall', d => {
    dmd.showBonus(d);
    if (!d.tilted) for (let i = 0; i < 14; i++) setTimeout(() => audio.play('bonusTick', { i }), 200 + i * 110);
  });
  bus.on('gameOver', d => {
    audio.play('gameOver');
    dmd.show({ text: 'KONEC IGRE', sub: Math.round(d.score).toLocaleString('sl-SI'), color: PAL.melt, dur: 3 });
    if (d.match) dmd.show({ anim: 'match', text: 'MATCH', num: d.match.num, last: d.match.last, hit: d.match.hit, color: PAL.cyan, dur: 3 });
    d.balls = game.cfg.steviloZogic; d.tilted = game.tilted;
    Store.recordGame(d, table.id);
    dmd.stats = Store.loadStats(table.id);
    setTimeout(() => {
      if (game.state !== 'over') return;
      ui.showGameOver(d);
    }, 1600);
  });
  bus.on('quality', d => ui.toast('Kakovost: ' + QUALITY[d.key].ime + ' (samodejno)'));
  dmd.scores = Board.scores();
  dmd.stats = Store.loadStats(table.id);
  bus.on('gameStart', () => { dmd.scores = Board.scores(); Board.refresh(); });
  // lestvica: ob spremembi osveži panele, DMD in odprt začetni zaslon
  Board.onChange(() => {
    ui.refreshBoards();
    dmd.scores = Board.scores();
    const top = document.getElementById('uTop'); if (top) top.innerHTML = ui.topHtml();
  });
  Board.refresh();
  setInterval(() => { if (game.state !== 'play' && document.visibilityState === 'visible') Board.refresh(); }, 60000);

  /* ---------------- vnos ---------------- */
  const input = setupInput({
    gesture: () => audio.init(),
    isPaused: () => game.paused || ui.blocking,
    ballWaiting: () => game.ballWaiting(),
    flipper: (side, down) => { if (!game.paused) game.setFlipper(side, down); },
    plunger: (down) => {
      if (game.paused) return;
      if (down) game.plungerDown();
      else game.plungerUp();
    },
    plungerPull: p => { if (game.plungerHeld) game.plungerPull = p; },
    nudge: dir => { if (!game.paused) game.nudge(dir); },
    pause: () => {
      if (ui.screen === 'pause') app.resume();
      else if (ui.screen === 'settings' && game.paused) ui.showPause();
      else app.pause();
    },
    start: () => {
      if (game.state === 'attract' || (game.state === 'over' && ui.screen !== 'none')) app.startGame();
    },
    mute: () => app.setMuted(!settings.muted),
    menuKey: e => ui.menuKey(e) || (app.debug ? app.debug.key(e) : false),
    menuPad: (b, d) => ui.menuPad(b, d),
  }, { touch: $('stage'), view: $('view') });

  $('btnPause').addEventListener('touchstart', e => { e.stopPropagation(); e.preventDefault(); app.pause(); }, { passive: false });
  $('btnNudge').addEventListener('touchstart', e => { e.stopPropagation(); e.preventDefault(); game.nudge(0); }, { passive: false });
  $('btnPause').addEventListener('click', () => app.pause());

  function showTouchHint() {
    const h = $('touchHint');
    if (!isTouch) return;
    h.classList.add('show'); h.style.opacity = 1;
    setTimeout(() => { h.style.opacity = 0; }, 3500);
    setTimeout(() => h.classList.remove('show'), 4200);
  }

  window.addEventListener('blur', () => { if (game.state === 'play' && !game.paused && ui.screen === 'none' && !app.debug) app.pause(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (game.state === 'play' || game.state === 'bonus') app.pause();
      audio.suspend(true);
    } else audio.suspend(false);
  });

  /* ---------------- postavitev ---------------- */
  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const wide = vw >= 1020 && vw / vh > 1.15;
    document.body.classList.toggle('wide', wide);
    const pad = vw <= 520 ? 10 + 8 : 16 + 16;  // ohišje + rob
    const sideW = wide ? Math.min(300, Math.max(240, (vw - 560) / 2 - 30)) : 0;
    document.querySelectorAll('.side').forEach(s => { s.style.width = sideW + 'px'; });
    const availW = wide ? vw - 2 * sideW - 80 : vw - pad;
    const dmdK = 32 / 128;                     // višina DMD glede na širino
    const extra = 12 + 8 + 12;                 // robovi backboxa
    const availH = vh - pad - extra;
    let tw = Math.min(availW, availH / (H / W + dmdK));
    tw = Math.max(200, Math.floor(tw));
    $('backbox').style.width = tw + 'px';
    $('pf').style.width = tw + 'px';
    $('pf').style.height = Math.round(tw * H / W) + 'px';
    renderer.resize(tw, Math.round(tw * H / W));
    dmd.resize();
  }
  window.addEventListener('resize', () => { clearTimeout(layout._t); layout._t = setTimeout(layout, 80); });
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));

  /* ---------------- zagon ---------------- */
  const initQ = settings.quality === 'auto' ? defaultQuality() : settings.quality;
  renderer.setQuality(initQ, settings.quality === 'auto');
  layout();
  if (settings.fps) $('fps').classList.add('on');
  ui.showStart();
  // pisave: ko so naložene, ponovno nariši statične sloje (napisi na mizi)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { renderer.rebuild(); });
  // slike mize (npr. logotipi): ko se naložijo, ponovno nariši mizo; brez njih ostane tekst
  if (view.loadAssets) view.loadAssets(() => renderer.rebuild());

  let last = performance.now(), fpsAcc = 0, fpsN = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    const realDt = dt;
    if (dt > 1 / 30) dt = 1 / 30;
    if (dt <= 0) dt = 1 / 60;
    input.pollGamepad();
    const ts = renderer.timeScale();
    const dbg = app.debug;
    if (dbg) dbg.frame(dt * ts);
    else if (!game.paused) game.update(dt * ts);
    renderer.update(game.paused ? 0 : dt);
    renderer.draw();
    dmd.render(dt, game, ui);
    ui.update(dt, game);
    // glasba glede na dogajanje
    let lvl = 0;
    if (game.state === 'play' || game.state === 'bonus') lvl = game.rules.musicLevel ? game.rules.musicLevel() : (game.multi ? 3 : 1);
    if (lvl !== audio.intensity) audio.setIntensity(lvl);
    audio.update();
    if (ui.screen === 'none' || game.state === 'attract') renderer.measure(realDt);
    fpsAcc += realDt; fpsN++;
    if (fpsAcc > 0.5) {
      const fps = Math.round(fpsN / fpsAcc);
      app.fps = fps;
      if (settings.fps) $('fps').textContent = fps + ' fps · ' + QUALITY[renderer.qualityKey].ime + (renderer.usingGL ? '' : ' 2D');
      fpsAcc = 0; fpsN = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // za razhroščevanje in teste v konzoli
  const api = {
    game, T, renderer, dmd, audio, ui, bus, settings, table, view, app,
    /** posnetek mize v polni ločljivosti (za pregled): snap(x, y, w, h, merilo) */
    snap(x0 = 0, y0 = 0, w = 600, h = 1000, scale = 1) {
      const r = renderer, old = [r.cssW, r.cssH];
      r.resize(600 * scale / (r.q.scale || 1), 1000 * scale);
      r.update(0.016); r.draw();
      const url = r.canvas.toDataURL('image/png');
      r.resize(old[0], old[1]);
      let el = document.getElementById('__snap');
      if (!el) {
        el = document.createElement('div'); el.id = '__snap';
        el.style.cssText = 'position:fixed;inset:0;z-index:999;background:#000;overflow:hidden';
        document.body.appendChild(el); el.onclick = () => el.remove();
      }
      const k = Math.min(innerWidth / w, innerHeight / h);
      el.innerHTML = `<img src="${url}" style="position:absolute;left:${-x0 * k}px;top:${-y0 * k}px;width:${600 * k}px;height:${1000 * k}px">`;
      return k;
    },
  };
  window.__pinball = api;
  if (opts.debug) import('./debug.js').then(m => { app.debug = m.createDebug(api, opts.debug); });
  return api;
}
