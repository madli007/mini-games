/* =====================================================================
   VNOS — tipkovnica, dotik, gamepad. Pošilja akcije v `actions`.
   actions: flipper(side, down), plunger(down), plungerPull(p), launch(p),
            nudge(dir), pause(), start(), mute(), menu(key)
   ===================================================================== */

const KEYS_L = ['KeyZ', 'ShiftLeft', 'ArrowLeft'];
const KEYS_R = ['KeyM', 'ShiftRight', 'ArrowRight', 'Slash'];
const KEYS_P = ['Space', 'ArrowDown'];

export function setupInput(actions, els) {
  const held = new Set();

  window.addEventListener('keydown', e => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    actions.gesture();
    const c = e.code;
    if ([...KEYS_L, ...KEYS_R, ...KEYS_P, 'ArrowUp', 'Space'].includes(c)) e.preventDefault();
    if (actions.menuKey && actions.menuKey(e)) { e.preventDefault(); return; }
    if (e.repeat) return;
    if (c === 'KeyP' || c === 'Escape') { actions.pause(); return; }
    if (c === 'KeyO') { actions.mute(); return; }
    if (c === 'Enter') { actions.start(); return; }
    if (KEYS_L.includes(c)) { held.add(c); actions.flipper('L', true); }
    if (KEYS_R.includes(c)) { held.add(c); actions.flipper('R', true); }
    if (KEYS_P.includes(c)) actions.plunger(true);
    if (c === 'KeyB' || c === 'ArrowUp') actions.nudge(0);
  });
  window.addEventListener('keyup', e => {
    const c = e.code;
    if (KEYS_L.includes(c)) { held.delete(c); if (!KEYS_L.some(k => held.has(k))) actions.flipper('L', false); }
    if (KEYS_R.includes(c)) { held.delete(c); if (!KEYS_R.some(k => held.has(k))) actions.flipper('R', false); }
    if (KEYS_P.includes(c)) actions.plunger(false);
  });
  window.addEventListener('blur', () => { actions.flipper('L', false); actions.flipper('R', false); held.clear(); });

  /* ---------------- dotik ---------------- */
  const zone = els.touch;
  const touches = new Map();
  const rectOf = () => els.view.getBoundingClientRect();
  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    actions.gesture();
    if (actions.isPaused()) return;
    const r = rectOf();
    for (const t of e.changedTouches) {
      const fx = (t.clientX - r.left) / r.width, fy = (t.clientY - r.top) / r.height;
      const side = t.clientX < window.innerWidth / 2 ? 'L' : 'R';
      // plunger: vlečenje navzdol v spodnjem desnem delu, ko čaka žogica
      const plunge = side === 'R' && fx > 0.62 && fy > 0.6 && actions.ballWaiting();
      const info = { side, plunge, y0: t.clientY, t0: performance.now(), x0: t.clientX, nudged: false };
      touches.set(t.identifier, info);
      if (plunge) actions.plunger(true, true);
      else actions.flipper(side, true);
    }
  }, { passive: false });
  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const info = touches.get(t.identifier);
      if (!info) continue;
      const dy = t.clientY - info.y0;
      if (info.plunge) actions.plungerPull(Math.max(0, Math.min(1, dy / 140)));
      else if (!info.nudged && dy < -70 && performance.now() - info.t0 < 350) {
        info.nudged = true; actions.nudge(info.side === 'L' ? 1 : -1);
      }
    }
  }, { passive: false });
  const end = e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const info = touches.get(t.identifier);
      if (!info) continue;
      touches.delete(t.identifier);
      if (info.plunge) actions.plunger(false, true);
      else if (![...touches.values()].some(v => v.side === info.side && !v.plunge)) actions.flipper(info.side, false);
    }
  };
  zone.addEventListener('touchend', end, { passive: false });
  zone.addEventListener('touchcancel', end, { passive: false });
  // prepreči dvojni tap zoom in scroll
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());

  // miška (namizje): levi/desni klik na mizi
  zone.addEventListener('mousedown', e => {
    actions.gesture();
    if (e.button === 0) actions.flipper(e.clientX < window.innerWidth / 2 ? 'L' : 'R', true);
  });
  zone.addEventListener('mouseup', () => { actions.flipper('L', false); actions.flipper('R', false); });
  zone.addEventListener('contextmenu', e => e.preventDefault());

  /* ---------------- gamepad ---------------- */
  const prev = {};
  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const b = i => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
      const st = {
        L: b(4) || b(6) || b(14), R: b(5) || b(7) || b(15), A: b(0), Y: b(3) || b(12), S: b(9), X: b(2),
      };
      const k = p.index;
      const pr = prev[k] || {};
      if (st.L !== pr.L) { actions.gesture(); if (!actions.menuPad || !actions.menuPad('L', st.L)) actions.flipper('L', st.L); }
      if (st.R !== pr.R) { actions.gesture(); if (!actions.menuPad || !actions.menuPad('R', st.R)) actions.flipper('R', st.R); }
      if (st.A !== pr.A) { if (!actions.menuPad || !actions.menuPad('A', st.A)) actions.plunger(st.A); }
      if (st.Y && !pr.Y) actions.nudge(0);
      if (st.S && !pr.S) actions.pause();
      if (st.X && !pr.X) actions.start();
      prev[k] = st;
    }
  }
  return { pollGamepad };
}
