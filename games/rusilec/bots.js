/* =====================================================================
   RUŠILEC — bots.js: računalniški igralci (vodi jih host, del simulacije).
   Bot izbere tarčo (blizu roba, blizu sebe), se postavi na stran tarče, ki je
   stran od roba, in sune, ko je tarča med njim in robom. Izogiba se robu.
   Lahek se kdaj zmoti (zaide proti robu). Deterministično (PRNG v stanju runde).
   ===================================================================== */
import { edgeInfo, hasFloor, tileGone } from './arena.js';
import { TILE, tileIndex } from '../krogla/physics.js';
import { rngNext } from './match.js';

export const BOT_LEVELS = { 1: 'Lahek', 2: 'Srednji', 3: 'Težek' };
const LV = {
  1: { margin: 0.95, think: 0.45, speed: 5.2, dashAlign: 0.9, dashDist: 1.8, mistake: 0.05, lead: 0, noise: 0.35 },
  2: { margin: 1.25, think: 0.22, speed: 6.4, dashAlign: 0.8, dashDist: 2.4, mistake: 0, lead: 0.15, noise: 0.12 },
  3: { margin: 1.35, think: 0.12, speed: 7.2, dashAlign: 0.72, dashDist: 2.9, mistake: 0, lead: 0.3, noise: 0.04 },
};
const NAMES = ['Robo Hrček', 'Kotalko', 'Bip Bop', 'Mr. Krogla', 'Čip', 'Žogica 3000', 'Vrtavka', 'Kroglec'];
export const botName = i => NAMES[i % NAMES.length] + ' 🤖';

/**
 * Vhod bota za en korak.
 * @param {Object} M runda (match.js)
 * @param {Object} p igralec (p.bot = 1|2|3)
 * @returns {{x:number, z:number, d:number}}
 */
export function botInput(M, p) {
  const mem = p.mem || (p.mem = { d: 0, think: 0, tgt: null, wander: null, wanderT: 0, aim: [0, 0] });
  if (p.st !== 'alive') return { x: 0, z: 0, d: mem.d };
  const L = LV[p.bot] || LV[2];
  const w = M.w, b = p.b;
  mem.think -= 1 / 120;
  if (mem.think <= 0) {
    mem.think = L.think;
    think(M, p, L, mem);
  }
  let [dx, dz] = mem.aim;
  // ovire (kladiva, žage): odbijanje
  const hz = hazardPush(w, b.x, b.z);
  if (hz) { dx = dx * 0.4 + hz[0]; dz = dz * 0.4 + hz[1]; const k = Math.hypot(dx, dz) || 1; dx /= k; dz /= k; }
  // krmiljenje: želena hitrost − trenutna
  let ax = dx * L.speed - b.vx * 0.55, az = dz * L.speed - b.vz * 0.55;
  const m = Math.hypot(ax, az);
  if (m > 1) { ax /= m; az /= m; }
  // zasilna zavora: tla pred kroglo izginejo
  const px = b.x + b.vx * 0.3, pz = b.z + b.vz * 0.3;
  if ((p.bot > 1 || mem.wanderT <= 0) && (!hasFloor(w, px, pz) || edgeInfo(w, px, pz, 2).d < 0.35)) {
    const e = edgeInfo(w, b.x, b.z, 3);
    ax = -e.nx; az = -e.nz;
    const sp = Math.hypot(b.vx, b.vz) || 1;
    ax -= b.vx / sp * 0.8; az -= b.vz / sp * 0.8;
    const k = Math.hypot(ax, az) || 1; ax /= k; az /= k;
  }
  return { x: ax, z: az, d: mem.d };
}

/** Razdalja do roba; tekoči trak šteje kot bližji rob (vleče ven). */
function edgeAt(w, x, z) {
  const e = edgeInfo(w, x, z, 4);
  const i = tileIndex(w, x, z);
  if (i >= 0 && w.g.type[i] === TILE.conveyor) {
    const dx = w.g.dx[i], dz = w.g.dz[i];
    return { d: Math.max(0, e.d - 1.4), nx: dx, nz: dz, conv: true };
  }
  return e;
}

/** Ali je ravna pot po tleh (vzorci na 0,3)? */
function clearLine(w, x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.3);
  for (let k = 1; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
    if (!hasFloor(w, x, z) || edgeInfo(w, x, z, 1).d < 0.22) return false;
  }
  return true;
}

/** BFS po ploščicah od cilja: smer proti sosednji ploščici, ki je bližje cilju (ali null). */
function pathDir(w, x0, z0, x1, z1) {
  const g = w.g, W = g.W, D = g.D;
  const walk = i => !tileGone(w, i) && g.type[i] !== TILE.wall;
  const start = tileIndex(w, x1, z1), me = tileIndex(w, x0, z0);
  if (start < 0 || me < 0 || !walk(start)) return null;
  const dist = new Int16Array(W * D).fill(-1);
  const q = [start]; dist[start] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], c = i % W, r = (i / W) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= W || rr >= D) continue;
      const j = rr * W + cc;
      if (dist[j] >= 0 || !walk(j)) continue;
      dist[j] = dist[i] + 1; q.push(j);
    }
    if (dist[me] >= 0) break;
  }
  if (dist[me] < 0) return null;
  const c = me % W, r = (me / W) | 0;
  let best = null, bd = dist[me];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cc = c + dc, rr = r + dr;
    if (cc < 0 || rr < 0 || cc >= W || rr >= D) continue;
    const j = rr * W + cc;
    if (dist[j] >= 0 && dist[j] < bd) { bd = dist[j]; best = [cc + 0.5, rr + 0.5]; }
  }
  if (!best) return null;
  // proti središču sosednje ploščice in nekoliko proti središču trenutne (ne reži vogalov)
  return norm(best[0] - x0 + (c + 0.5 - x0) * 0.6, best[1] - z0 + (r + 0.5 - z0) * 0.6);
}

function think(M, p, L, mem) {
  const w = M.w, b = p.b;
  const e = edgeAt(w, b.x, b.z);
  const cx = M.bounds.mx, cz = M.bounds.mz;
  const toC = norm(cx - b.x, cz - b.z);
  const noise = () => (rngNext(M, 'bs') - 0.5) * 2 * L.noise;
  // napaka (Lahek): za trenutek zaide v naključno smer
  if (mem.wanderT > 0) { mem.wanderT -= L.think; mem.aim = mem.wander; return; }
  if (L.mistake && rngNext(M, 'bs') < L.mistake) {
    const a = rngNext(M, 'bs') * Math.PI * 2;
    mem.wander = [Math.sin(a), Math.cos(a)]; mem.wanderT = 0.6 + rngNext(M, 'bs');
    mem.aim = mem.wander; return;
  }
  // nevarnost: blizu roba → stran od roba, proti sredini
  const vn = b.vx * e.nx + b.vz * e.nz;
  // ozek most/klančina: ne beži od roba (na drugi strani je tudi rob), pelji po ploščicah
  if (e.d < L.margin && !e.conv) {
    const o = e.d + 0.55;
    if (edgeInfo(w, b.x - e.nx * o, b.z - e.nz * o, 1).d < 0.5) {
      const goal = nearestEnemy(M, p) || { b: { x: cx, z: cz } };
      const pd = pathDir(w, b.x, b.z, goal.b.x, goal.b.z) || pathDir(w, b.x, b.z, cx, cz);
      if (pd) { mem.path = true; mem.aim = pd; return; }
    }
  }
  if (e.d < L.margin && (e.conv || vn > -0.5 || e.d < L.margin * 0.45) && !(mem.path && e.d > 0.3 && vn < 1.5)) {
    const k = 1 - e.d / L.margin;
    mem.aim = norm(-e.nx * (0.6 + k) + toC[0] * 0.6, -e.nz * (0.6 + k) + toC[1] * 0.6);
    return;
  }
  // pobiralka v bližini (Srednji, Težek)
  if (p.bot >= 2 && M.pickups.length) {
    const pk = M.pickups.find(k => !k.taken && M.t - k.t0 > 0.6 && Math.hypot(k.x - b.x, k.z - b.z) < (p.bot === 3 ? 5 : 3.2));
    if (pk && edgeInfo(w, pk.x, pk.z, 2).d > 0.9) { mem.aim = norm(pk.x - b.x, pk.z - b.z); return; }
  }
  // tarča: nasprotnik blizu roba in blizu mene
  let tgt = null, best = Infinity;
  for (const q of M.players) {
    if (q === p || q.st !== 'alive' || q.invT > 0) continue;
    if (M.cfg.mode === 'teams' && q.team === p.team) continue;
    const qe = edgeInfo(w, q.b.x, q.b.z, 4).d;
    const s = qe * 1.2 + Math.hypot(q.b.x - b.x, q.b.z - b.z) * 0.4;
    if (s < best) { best = s; tgt = q; }
  }
  if (!tgt) { mem.aim = e.d < 1.8 ? toC : [0, 0]; return; }
  const tb = tgt.b;
  const tx = tb.x + tb.vx * L.lead, tz = tb.z + tb.vz * L.lead;
  const te = edgeInfo(w, tx, tz, 5);
  const push = [te.nx, te.nz];          // smer od tarče proti robu
  const to = norm(tx - b.x, tz - b.z);
  const dist = Math.hypot(tx - b.x, tz - b.z);
  const align = to[0] * push[0] + to[1] * push[1];
  if ((align > L.dashAlign || dist < 1.0) && clearLine(w, b.x, b.z, tx, tz)) {
    // tarča je med mano in robom: napad (in sunek od blizu)
    mem.aim = norm(to[0] + noise(), to[1] + noise());
    if (dist < L.dashDist && b.dashCd <= 0 && M.cfg.dash && align > L.dashAlign - 0.1 && e.d > L.margin + 0.4) mem.d++;
    return;
  }
  // obkroži: točka za tarčo (na strani stran od roba)
  const ax = tx - push[0] * 1.3, az = tz - push[1] * 1.3;
  let aim = norm(ax - b.x, az - b.z);
  // tarča na drugem otoku: po ploščicah (BFS)
  mem.path = false;
  if (!clearLine(w, b.x, b.z, tx, tz)) {
    const pd = pathDir(w, b.x, b.z, tx, tz);
    if (pd) { mem.path = true; mem.aim = pd; return; }
  }
  // ne vozi skozi tarčo: rahlo mimo
  if (dist < 2.2 && align < 0) { const side = [-to[1], to[0]]; const s = side[0] * push[0] + side[1] * push[1] > 0 ? -1 : 1; aim = norm(aim[0] + side[0] * s * 0.8, aim[1] + side[1] * s * 0.8); }
  // pot ne sme peljati čez rob
  const ahead = edgeInfo(w, b.x + aim[0] * 1.2, b.z + aim[1] * 1.2, 3).d;
  if (ahead < L.margin * 0.8 || !hasFloor(w, b.x + aim[0] * 1.2, b.z + aim[1] * 1.2)) aim = norm(aim[0] * 0.3 + toC[0], aim[1] * 0.3 + toC[1]);
  mem.aim = [aim[0] + noise() * 0.5, aim[1] + noise() * 0.5];
}

function nearestEnemy(M, p) {
  let best = null, bd = Infinity;
  for (const q of M.players) {
    if (q === p || q.st !== 'alive' || (M.cfg.mode === 'teams' && q.team === p.team)) continue;
    const d = Math.hypot(q.b.x - p.b.x, q.b.z - p.b.z);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/** Odboj od nevarnih ovir v bližini (kladiva, žage) ali null. */
function hazardPush(w, x, z) {
  let fx = 0, fz = 0;
  for (const hm of w.L.hammers || []) {
    const cx = Math.min(Math.max(x, hm.x), hm.x + hm.w), cz = Math.min(Math.max(z, hm.z), hm.z + hm.d);
    const d = Math.hypot(x - cx, z - cz);
    if (d < 1.3) { const k = (1.3 - d) / 1.3 * 2; const n = d > 1e-3 ? [(x - cx) / d, (z - cz) / d] : [x > hm.x + hm.w / 2 ? 1 : -1, 0]; fx += n[0] * k; fz += n[1] * k; }
  }
  for (const sw of w.saws) {
    const d = Math.hypot(x - sw.pos[0], z - sw.pos[1]);
    if (d < 1.4 && d > 1e-3) { const k = (1.4 - d) / 1.4 * 1.6; fx += (x - sw.pos[0]) / d * k; fz += (z - sw.pos[1]) / d * k; }
  }
  return fx || fz ? [fx, fz] : null;
}

function norm(x, z) { const m = Math.hypot(x, z); return m > 1e-6 ? [x / m, z / m] : [0, 0]; }
