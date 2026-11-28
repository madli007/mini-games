/* =====================================================================
   GNEČA — autopilot.js: preprost igralec za teste in ?demo=1.
   Ves čas strelja, velikana izstreli takoj, ko je merilec poln, top pa
   postavi na x, pri katerem bi namišljena skupina tekačev skozi vsa
   vrata pred sabo zrasla največ (upošteva premična vrata ob prihodu,
   ograje, ki odrivajo, in smrtne ovire).
   ===================================================================== */
import { B } from './balance.js';

/**
 * Oceni, koliko tekačev ostane od 10 izstreljenih na x.
 * @param {any} st stanje simulacije
 * @param {number} x0
 */
export function pathValue(st, x0) {
  const p = st.p, L = st.L;
  let x = x0, c = 10;
  const t0 = st.step * B.dt;
  const items = [];
  for (const g of st.gates) if (!g.spent) items.push({ z: g.z, g });
  for (const o of st.obstacles) items.push({ z: o.z, o });
  items.sort((a, b) => a.z - b.z);
  for (const it of items) {
    const arrive = t0 + (it.z - B.cannon.z) / p.runSpeed;
    if (it.g) {
      const g = it.g;
      const gx = g.move ? g.x0 + g.move.amp * Math.sin(g.move.phase + arrive * g.move.speed) : g.x;
      if (Math.abs(x - gx) > g.w / 2 - 0.25) continue;
      const v = g.v;
      if (g.op === 'x') c *= v;
      else if (g.op === '+') c += Math.min(g.left, c);
      else if (g.op === '-') c -= Math.min(g.left, c);
      else if (g.op === '/') c /= v;
    } else {
      const o = it.o;
      if (o.type === 'fence') {
        if (Math.abs(x - o.x) < o.w / 2 + 0.3) x = o.x + (x >= o.x ? o.w / 2 + 0.4 : -o.w / 2 - 0.4);
        continue;
      }
      const ox = o.amp ? o.x0 + o.amp * Math.sin(o.phase + arrive * o.speed) : o.x;
      const half = o.type === 'saw' ? o.r : o.w / 2;
      if (Math.abs(x - ox) < half + 0.5) c *= 0.35;
    }
    if (c < 0) c = 0;
  }
  // stolpiči ob stezi: manjša kazen blizu njih
  for (const tu of st.turrets) if (tu.alive && Math.abs(x - tu.x) < 2.5) c *= 0.85;
  void L;
  return c;
}

/** Ustvari autopilot. Vrne funkcijo st → vnos za step. */
export function createAutopilot({ every = 6, samples = 31 } = {}) {
  let tx = 0, last = -999;
  return st => {
    if (st.step - last >= every) {
      last = st.step;
      const hw = st.L.width / 2 - 0.45;
      let best = -1, bx = 0;
      for (let k = 0; k < samples; k++) {
        const x = -hw + (2 * hw * k) / (samples - 1);
        // množica se razleze: oceni tudi sosednje x (raje sredina dobrih vrat kot rob)
        const v = (pathValue(st, x - 0.9) + 2 * pathValue(st, x) + pathValue(st, x + 0.9)) / 4 - Math.abs(x - st.cannon.x) * 0.02;
        if (v > best + 1e-6) { best = v; bx = x; }
      }
      tx = bx;
    }
    return { tx, fire: true, giant: st.cannon.meter >= st.p.giantCharge };
  };
}

/**
 * Odigraj cel nivo z autopilotom.
 * @param {Function} createState
 * @param {Function} step
 * @param {any} level
 * @param {{seed?:string, params?:Object}} opt
 */
export function playOut(createState, step, level, opt = {}) {
  const st = createState(level, opt);
  const ap = createAutopilot();
  while (!st.over) { step(st, ap(st)); st.events.length = 0; }
  return st;
}
