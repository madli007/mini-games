/* =====================================================================
   Generator prog za Hrčkovo kroglo (brez npm odvisnosti).
     node tools/krogla-levels.mjs          → zapiše games/krogla/levels/*.json, index.json
                                              in blok zlatih časov v supabase/games/krogla.sql
     node tools/krogla-levels.mjs --check  → samo izpiše čase autopilota

   Proge opišemo z »želvico« (Track): naprej, zavij, klančina gor/dol, prepad, ožina …
   Želvica sproti zapiše tudi pot za autopilota (route), s katero preverimo, da je proga
   rešljiva, in izmerimo čase za medalje. Rezultat je navaden JSON (format: games/krogla/README.md).
   ===================================================================== */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { validateLevel, formatLevelJson } from '../games/krogla/level.js';
import { Track, finish, D4 } from '../games/krogla/editor/track.js';
import { medalsFromTime, timeBonusFromTime, lenFromTime } from '../games/krogla/rules.js';
import { runAutopilot } from '../games/krogla/autopilot.js';
import { measureLevel, spearman, cleanRun, cupClockSim, SCORE_CUTS } from '../games/krogla/balance.js';
import { validateCups, weeklyPick, weekShift, isoWeek, cupDiffs, diffOf, lenOf, DIFF_IDS, DIFFS } from '../games/krogla/rules.js';
import { rng } from '../shared/util.js';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('games/krogla/levels/', ROOT);
const CHECK = process.argv.includes('--check');
const BALANCE = process.argv.includes('--balance');
const RUNS = parseInt((process.argv.find(a => a.startsWith('--runs=')) || '').slice(7), 10) || 30;
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);

// barvne teme so v games/krogla/themes.js, želvica (Track, finish) pa v games/krogla/editor/track.js
// (isto želvico uporablja generator naključnih prog v urejevalniku)

/* ===================================================================== */
/*  PROGE                                                                */
/* ===================================================================== */

const LEVELS = [];
const def = (meta, fn) => LEVELS.push({ meta, fn });

/* ------------------------------------------------- SKLOP 1: Vrt in kuhinja */

def({ id: '01-ogrevanje', name: 'Ogrevanje', set: 1, theme: 'vrt', desc: 'Široka pot, klančina in cilj. Spoznaj kontrole in kamero.' }, () => {
  const T = new Track({ speed: 6 });
  T.at(0, 0, 'N').row(0, 0, 5, '.', 0); T.mark('start'); T.w = 5;
  T.go(1).mark('star', 2, 0);
  T.go(7).mark('clock');
  T.go(4, { up: 2 });
  T.go(3).pocket(3, 2);
  T.turn('E', { w: 5 }).go(7).mark('cp');
  T.go(3).turn('N', { w: 5 }).go(6, { w: 3 }).pocket(2, 3);
  T.go(4, { down: 2 }).go(2).turn('W', { w: 3 }).go(9).mark('star', 0, 0);
  T.turn('N').go(4).mark('cp').go(5, { up: 2 }).go(4, { w: 5 }).pocket(-3, 2);
  T.go(3).turn('E', { w: 5 }).go(5).turn('N', { w: 5 }).go(6).mark('goal').go(2);
  T.wp({}, 0, -2);
  return T;
});

def({ id: '02-vrtnarija', name: 'Vrtnarija', set: 1, theme: 'vrt', desc: 'Ozke poti brez ograj in prvi zavoji ob robu.' }, () => {
  const T = new Track({ speed: 4.2 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(2).mark('star', 0, -2);
  T.go(5, { w: 1 }).turn('E').go(5).pocket(-1, 2).turn('N').go(4).mark('clock').go(3);
  T.turn('W').go(8).mark('cp').go(1).turn('N').go(6, { up: 2 }).pocket(1, 3);
  T.go(2).turn('E').go(3).turn('N').go(3).turn('E').go(3).turn('N').go(3).turn('W').go(2);
  T.go(2).turn('N').go(5).mark('cp').go(2);
  T.turn('E').go(7, { down: 2 }).pocket(1, 2);
  T.turn('N').go(4).mark('star').go(3).turn('W').go(4).turn('N').go(3, { w: 3 }).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '03-skodelice', name: 'Skodelice', set: 1, theme: 'kuhinja', desc: 'Sklede, v katerih krogla zakroži, in valovita tla.' }, () => {
  const T = new Track({ speed: 5 });
  T.at(0, 0, 'N').row(0, 0, 5, '.', 0); T.mark('start'); T.w = 5;
  T.go(3);
  T.go(6, { ch: '~' }).mark('star', -2);
  T.go(3).wp();
  // velika skleda
  T.go(7, { w: 7 }); T.add('bowls', { x: T.x, z: T.z + 3, r: 3, depth: 0.8 }); T.mark('star', 0, -3);
  T.go(2, { w: 5 }).mark('cp').turn('E', { w: 5 }).go(4, { ch: '~' }).go(8, { w: 5 });
  T.add('bowls', { x: T.x - 4, z: T.z, r: 2, depth: 0.7 }, ).add('bowls', { x: T.x, z: T.z, r: 1.6, depth: 0.6 });
  T.mark('star', 2, -4);
  T.go(3).turn('N', { w: 5 }).go(5, { up: 2 }).mark('clock').go(4).mark('cp');
  T.go(6, { w: 7, ch: '~' }).mark('star', 3);
  T.go(3, { w: 5 }).turn('W', { w: 5 }).go(6);
  T.add('bowls', { x: T.x + 1, z: T.z, r: 2.2, depth: 0.9 }); T.mark('star', 0, -1);
  T.go(3).turn('N', { w: 5 }).go(5, { down: 2 }).go(3).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '04-kuhinja', name: 'Kuhinja', set: 1, theme: 'kuhinja', desc: 'Premične ploščice, ki vozijo levo-desno čez prepade.' }, () => {
  const T = new Track({ speed: 4 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(6).mark('clock').go(2).wp({ until: [11.5, 0.1, 1.0], speed: 3 });
  // ploščica 1: od leve proti desni
  const z1 = T.z - 2;
  T.add('movers', { path: [[T.x, T.h, z1], [T.x + 6, T.h, z1]], size: [3, 3], speed: 1.6, pause: 2, phase: 0 });
  T.add('pickups', { t: 'star', x: T.x + 3, z: z1, y: T.h + 0.32 });
  T.route.push({ mover: 0, x: 0, z: 0, until: [11.5, 5.95, 7.0], speed: 3, r: 0.25 });
  T.gap(3).move(6, 0).go(1).wp({ speed: 3 }).go(3).mark('cp').go(2).pocket(2, 2);
  T.wp({ until: [11.5, 0.1, 1.0], speed: 3 });
  const z2 = T.z - 2;
  T.add('movers', { path: [[T.x, T.h, z2], [T.x - 6, T.h, z2]], size: [3, 3], speed: 1.6, pause: 2, phase: 0 });
  T.route.push({ mover: 1, x: 0, z: 0, until: [11.5, 5.95, 7.0], speed: 3, r: 0.25 });
  T.gap(3).move(-6, 0).go(1).wp({ speed: 3 }).go(3).mark('star', -1);
  T.turn('W').go(5).mark('cp').wp({ until: [9, 0.1, 0.9], speed: 3 });
  // ploščica 3: hitrejša, sprednja-zadnja smer
  const x3 = T.x - 1.5;
  T.add('movers', { path: [[x3, T.h, T.z], [x3, T.h, T.z - 6]], size: [2, 3], speed: 2, pause: 1.5, phase: 0, _w: 1 });
  T.route.push({ mover: 2, x: 0, z: 0, until: [9, 4.6, 5.6], speed: 3, r: 0.3 });
  T.move(-2, -6).go(1).wp({ speed: 3 }).go(4).mark('star').go(1);
  T.turn('N').go(4, { up: 2 }).go(3).mark('star', 1).go(1).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

/* ------------------------------------------- SKLOP 2: Steklo, tovarna, stolp, led */

def({ id: '05-steklena-pot', name: 'Steklena pot', set: 2, theme: 'steklo', desc: 'Ozek most in padajoče ploščice: ne ustavljaj se!' }, () => {
  const T = new Track({ speed: 4 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(3).go(8, { w: 1 }).mark('star', 0, 0).turn('E').go(3).turn('N').go(5).mark('cp');
  T.go(3, { w: 3 }).wp();
  T.go(8, { w: 1, ch: 'x', wp: { speed: 3.6 } });
  T.go(2, { w: 3 }).mark('clock').turn('W', { w: 3 }).go(2).go(7, { w: 1, ch: 'x' }).go(2, { w: 3 }).mark('cp');
  T.pocket(-2, 2);
  T.turn('N', { w: 3 }).go(3, { w: 1 }).turn('E').go(2).turn('N').go(2).turn('W').go(2).turn('N').go(2);
  T.turn('E').go(2).turn('N').go(3).mark('star').go(2, { w: 3 }).mark('cp');
  T.go(10, { w: 1, ch: 'x', wp: { speed: 3.6 } }).mark('star', 0, 0);
  T.go(2, { w: 3 }).turn('E', { w: 3 }).go(6, { w: 1 }).pocket(1, 2).turn('N').go(4).go(3, { w: 3 }).mark('goal').go(1);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '06-tovarna', name: 'Tovarna', set: 2, theme: 'tovarna', desc: 'Tekoči trakovi, kladiva na časovnik in vrata na stikalo.' }, () => {
  const T = new Track({ speed: 4.5 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(3).go(8, { conv: 'F' }).mark('star', 1).go(2);
  T.turn('E').go(10, { conv: 'B', wp: { speed: 5.5 } }).go(2).mark('cp');
  T.turn('N').go(3).wp({ until: [3, 2.32, 2.6] });
  // kladiva
  for (let k = 0; k < 3; k++) {
    T.go(2);
    T.add('hammers', { x: T.c - 1, z: T.r, w: 3, d: 1, period: 3, phase: 0.15, dir: [k % 2 ? -1 : 1, 0] });
    T.go(1);
  }
  T.wp({ speed: 5 }).go(2).mark('clock').turn('W').go(4).mark('cp').go(1);
  // vrata in stikalo v stranskem žepu
  T.turn('N').go(1);
  const sw = { x: T.x + 4, z: T.z, id: 'a' };
  T.rect(T.c + 2, T.r, 3, 1, '.'); T.add('switches', sw); T.mark('star', 5, 0);
  T.wpAt(sw.x, sw.z, { stop: true, r: 0.3 }).wp({ stop: true, r: 0.4 });
  T.go(2); T.add('doors', { x: T.c - 1, z: T.r, w: 3, d: 1, y: T.h, h: 1.2, id: 'a' });
  T.go(4, { conv: 'B', wp: { speed: 6 } }).go(2, { up: 2 }).go(2).mark('cp');
  T.turn('E').go(1).wp({ until: [2.4, 2.25, 2.4] });
  for (let k = 0; k < 2; k++) {
    T.go(2);
    T.add('hammers', { x: T.c, z: T.r - 1, w: 1, d: 3, period: 2.4, phase: 0, dir: [0, k ? 1 : -1] });
    T.go(1);
  }
  T.go(2).mark('star', 1).turn('N').go(5, { conv: 'F' }).mark('star').go(2).mark('star', -1, 0).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '07-stolp', name: 'Stolp', set: 2, theme: 'stolp', desc: 'Spiralna pot navzgor, dvigala in ventilatorji.' }, () => {
  const T = new Track({ speed: 4.5 });
  const climb = (n, every = 4) => { for (let i = 1; i <= n; i++) T.go(1, i % every === 2 && i < n - 1 ? { up: 1 } : {}); };
  T.at(1, 18, 'N', 0).row(1, 18, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(1).mark('star', 1, 0);
  climb(16); T.mark('cp', 0, 0);
  T.turn('E').go(2);
  // ventilatorji pihajo proti notranjemu prepadu
  for (const fx of [5.5, 10.5, 14.5]) T.add('fans', { x: fx, z: -0.7, dir: [0, 1], len: 3.6, width: 1.6, force: 8 });
  climb(14); T.mark('star', -1, 0);
  T.turn('S').go(1).mark('cp'); climb(15); T.mark('clock');
  T.turn('W').go(1).mark('star', 1, 0); climb(11); T.mark('cp');
  T.turn('N').go(3).wp({ until: [7.2, 0.15, 1.1], speed: 2.5, r: 0.4 });
  const H0 = T.h;
  T.add('movers', { path: [[T.x, H0, T.z - 2], [T.x, H0 + 2, T.z - 2]], size: [3, 3], speed: 1, pause: 1.6, phase: 0 });
  T.route.push({ mover: 0, x: 0, z: 0, until: [7.2, 3.75, 5.0], speed: 2, r: 0.3 });
  T.gap(3, 2).go(1).wp({ speed: 3 }); climb(5); T.mark('cp');
  T.turn('E').go(1); climb(7);
  T.add('fans', { x: 9.5, z: 3.3, dir: [0, 1], len: 3.4, width: 1.6, force: 7 });
  T.turn('S').mark('star', 1, 0); climb(8); T.mark('cp');
  T.turn('W'); climb(4);
  T.turn('N').go(3).mark('star').mark('goal', 0, -1).go(1);
  return T;
});

def({ id: '08-ledena-dvorana', name: 'Ledena dvorana', set: 2, theme: 'led', desc: 'Led (malo trenja), lepilo (veliko trenja) in vzmeti.' }, () => {
  const T = new Track({ speed: 4 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(2).go(10, { w: 5, ch: 'i' }).mark('star', 2).go(2, { w: 5 }).mark('cp');
  T.turn('E', { w: 5 }).go(5, { w: 3, ch: 'i' }).go(3, { ch: 'g' }).mark('clock').go(5, { ch: 'i' }).pocket(-2, 2);
  T.go(2).turn('N').go(3).mark('cp');
  // vzmet čez prepad
  T.go(1); T.add('springs', { x: T.x, z: T.z, dir: [0, -1], power: 8.5, up: 6.5 });
  T.wp({ speed: 3, r: 0.6 });
  T.gap(4).go(1, { w: 3 }).wp({ speed: 3, r: 0.6 }).go(2, { ch: 'g' }).go(6, { w: 3, ch: 'i' }).mark('star', 1, -3);
  T.go(2).turn('W').go(6, { w: 1, ch: 'i', wp: { speed: 3 } }).go(2, { w: 3 }).mark('cp');
  T.turn('N').go(2); T.add('springs', { x: T.x, z: T.z, dir: [0, -1], power: 9.5, up: 8 });
  T.wp({ speed: 3, r: 0.6 });
  T.gap(4, 1).go(2, { w: 5, ch: 'g' }).wp({ speed: 3, r: 0.8 }).mark('star', 2);
  T.go(7, { w: 5, ch: 'i' }).mark('star', -2, 0).go(3, { w: 3 }).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

/* ------------------------------------------------------ SKLOP 3: Nevarnosti */

def({ id: '09-nasilnezi', name: 'Nasilneži', set: 3, theme: 'arena', desc: 'Sovražna krogla te lovi in izriva čez rob. Magneti.' }, () => {
  const T = new Track({ speed: 5 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(4).mark('clock').go(2);
  // arena 1: en nasilnež
  T.go(9, { w: 9 }); T.add('enemies', { t: 'bully', x: T.x + 2.5, z: T.z + 4, zone: 5.5 });
  T.mark('star', -4, -4);
  T.wp({ speed: 5.5 }, -2.5, 4);
  T.go(2, { w: 3 }).wp({ speed: 3, r: 0.3 }).mark('cp').go(3, { w: 1 }).go(2, { w: 3 });
  // magnet ob ozki poti
  T.turn('E').go(10, { w: 1 }); T.add('enemies', { t: 'magnet', x: T.x - 5, z: T.z - 2.5, mode: 'pull', period: 3, duty: 0.4, range: 3.5, force: 10 });
  T.add('enemies', { t: 'magnet', x: T.x - 2, z: T.z + 2.5, mode: 'pull', period: 3, duty: 0.4, phase: 0.5, range: 3.5, force: 10 });
  T.go(2, { w: 3 }).mark('cp').mark('star', 1);
  T.turn('N').go(3);
  // arena 2: dva nasilneža
  T.go(10, { w: 9 }); T.add('enemies', { t: 'bully', x: T.x - 2.5, z: T.z + 6, zone: 4.5 }).add('enemies', { t: 'bully', x: T.x + 2.5, z: T.z + 2, zone: 4.5 });
  T.mark('star', 4, -8); T.mark('star', -4, -1);
  T.wp({ speed: 5.5 }, 2.5, 6).wp({ speed: 5.5 }, -2.5, 2);
  T.go(2, { w: 3 }).wp({ speed: 4, r: 0.4 }).mark('cp').go(4, { up: 2 }).go(3, { w: 5 });
  T.add('enemies', { t: 'magnet', x: T.x, z: T.z - 3.5, mode: 'push', period: 2.5, duty: 0.5, range: 3, force: 12 });
  T.go(4, { w: 5 }).mark('star', 2).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '10-neon', name: 'Neon', set: 3, theme: 'neon', desc: 'Vrtljive plošče, žage na tirnicah in ose po vzorcu.' }, () => {
  const T = new Track({ speed: 4.5 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(4).wp();
  // vrtljiva plošča čez prepad
  T.add('spinners', { x: T.x, z: T.z - 3, r: 2.55, y: T.h, speed: 0.6 });
  T.gap(1).wpAt(T.x, T.z - 2, { speed: 3, r: 0.5 }).gap(4).go(2).mark('cp').wp({ speed: 3, r: 0.8 }).go(2);
  // žage
  T.go(10, { w: 5 });
  T.add('enemies', { t: 'saw', path: [[T.x - 2, T.z + 7], [T.x + 2, T.z + 7]], loop: false, speed: 2.6, phase: 0 });
  T.add('enemies', { t: 'saw', path: [[T.x + 2, T.z + 4], [T.x - 2, T.z + 4]], loop: false, speed: 2.6, phase: 0.25 });
  T.add('enemies', { t: 'saw', path: [[T.x - 2, T.z + 1], [T.x + 2, T.z + 1]], loop: false, speed: 2.6, phase: 0.5 });
  T.mark('star', 2, -9);
  T.wp({ speed: 3.5 }, 0, 8.5).wp({ until: [3.0769, 2.4, 2.9], speed: 3.5, r: 0.4 }, 0, 8.5).wp({ speed: 5 }, 0, -1);
  T.go(2, { w: 3 }).mark('cp').turn('W').go(3, { w: 3 });
  // ose letijo čez pot sem in tja
  T.wp({ until: [4, 3.3, 3.9], speed: 3, r: 0.4 });
  T.add('enemies', { t: 'wasp', path: [[T.x - 1.5, T.z - 1.6], [T.x - 1.5, T.z + 1.6]], loop: false, speed: 1.6 });
  T.go(3).mark('clock').pocket(-2, 2);
  T.wp({ until: [4, 1.3, 1.9], speed: 3, r: 0.4 });
  T.add('enemies', { t: 'wasp', path: [[T.x - 1.5, T.z - 1.6], [T.x - 1.5, T.z + 1.6]], loop: false, speed: 1.6 });
  T.go(3);
  T.go(2).mark('star', 1).turn('N').go(3).wp();
  T.add('spinners', { x: T.x, z: T.z - 3.5, r: 3.05, y: T.h, speed: -0.7 });
  T.gap(1).wpAt(T.x, T.z - 2.5, { speed: 3, r: 0.5 }).gap(5).go(2).mark('cp').wp({ speed: 3, r: 0.8 }).wp({ speed: 2.5, r: 0.2 });
  T.go(3, { w: 1 }).wp({ speed: 3, r: 0.3 }).go(8, { w: 3 }).mark('star', -1, -3);
  T.add('enemies', { t: 'saw', path: [[T.x, T.z + 6], [T.x, T.z + 1]], loop: false, speed: 2, phase: 0, r: 0.38 });
  T.wp({ speed: 4 }, 1, 6.5).wp({ speed: 4 }, 1, 1);
  T.go(3, { w: 5 }).mark('star', 2).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '11-nebo', name: 'Nebo', set: 3, theme: 'nebo', desc: 'Vse skupaj: dolgi skoki z rampe čez prepad in sesalec.' }, () => {
  const T = new Track({ speed: 5 });
  T.at(0, 0, 'N', 3).row(0, 0, 3, '.', 3); T.mark('start'); T.w = 3;
  T.go(3).go(4, { down: 4 }).go(3).go(1, { up: 1, w: 3 });
  // skok čez prepad
  T.wp({ speed: 9 });
  T.gap(3, -1).go(1, { w: 5 }).wp({ speed: 9, r: 1.5 }).go(4).mark('cp').mark('star', 2);
  T.wp({ speed: 4, r: 0.8 });
  // sesalec ob ozki poti
  T.turn('E', { w: 5 }).go(9, { w: 1 }); T.add('enemies', { t: 'vacuum', x: T.x - 4.5, z: T.z + 2.6, dir: [0, -1], range: 4, angle: 45, force: 7 });
  T.go(2, { w: 3 }).mark('clock').turn('N').go(4, { ch: 'x' }).go(2).mark('cp');
  T.go(4, { up: 2 }).go(4, { conv: 'F' }).go(2).turn('W');
  T.go(3); T.add('hammers', { x: T.c, z: T.r - 1, w: 1, d: 3, period: 2.5, phase: 0, dir: [0, 1] });
  T.go(3).mark('star', -1).go(2, { down: 2 }).go(2);
  // drugi skok
  T.go(2, { up: 2 }).wp({ speed: 9 }).gap(2, -1.5).go(1, { w: 5 }).wp({ speed: 9, r: 1.5 }).go(3).mark('cp').wp({ speed: 4, r: 0.8 });
  T.turn('N', { w: 5 }).go(4, { w: 3 }); T.add('springs', { x: T.x, z: T.z, dir: [0, -1], power: 9, up: 7 });
  T.wp({ speed: 3, r: 0.6 }).gap(4, 0.5).go(3, { w: 5, ch: 'g' }).wp({ speed: 3, r: 0.8 }).mark('star', -2);
  T.go(5, { w: 3, ch: 'i' }).mark('star', 1, -2);
  T.go(3).mark('star', 0, 0).go(2).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '12-nemogoce', name: 'Nemogoče', set: 3, theme: 'nemogoce', desc: 'Kratka, zelo težka proga z vsem. Za mojstre.' }, () => {
  const T = new Track({ speed: 4 });
  T.at(0, 0, 'N', 2).row(0, 0, 3, '.', 2); T.mark('start'); T.w = 3;
  T.go(2).go(6, { w: 1, ch: 'i', wp: { speed: 3.5 } }).go(1, { w: 3 }).mark('cp');
  T.go(4).go(2, { up: 2 }).wp({ speed: 9 }).gap(2, -1).go(1, { w: 3, ch: 'x' }).wp({ speed: 9, r: 1.2 }).go(2, { ch: 'x' }).wp({ speed: 3.5, r: 0.6 });
  T.turn('E').go(8, { w: 1, ch: 'x' }); T.add('enemies', { t: 'magnet', x: T.x - 4, z: T.z + 2.2, mode: 'pull', period: 2, duty: 0.4, range: 3, force: 6 });
  T.go(2, { w: 3 }).mark('cp').mark('star', 1).mark('clock', -1);
  T.turn('N').go(1);
  T.go(7, { w: 7 }); T.add('enemies', { t: 'bully', x: T.x - 1.5, z: T.z + 3, zone: 3.2, accel: 5.5 });
  T.add('enemies', { t: 'saw', path: [[T.x - 2, T.z + 5], [T.x + 2, T.z + 5]], loop: false, speed: 3, phase: 0 });
  T.mark('star', -2, -5); T.wp({ speed: 5 }, 1.5, 4).wp({ until: [2.667, 2.0, 2.4], speed: 4, r: 0.5 }, 1.5, 3.5).wp({ speed: 5 }, 1, 0);
  T.go(2, { w: 3 }).mark('cp');
  T.add('spinners', { x: T.x, z: T.z - 3, r: 2.55, y: T.h, speed: 0.9 });
  T.wp({ speed: 3 }).gap(1).wpAt(T.x, T.z - 2, { speed: 3, r: 0.5 }).gap(4).go(1).wp({ speed: 3, r: 0.6 }).mark('star', 1);
  T.turn('W').go(6, { w: 1, ch: 'g' }); T.add('enemies', { t: 'vacuum', x: T.x + 3, z: T.z - 2.4, dir: [0, 1], range: 3.5, angle: 45, force: 6 });
  T.go(1, { w: 3 }).mark('star', 0, 0).turn('N').go(5, { w: 1, ch: 'i' }).mark('star', 0, -1).go(2, { w: 3 }).mark('goal').go(1);
  T.wp({}, 0, 0);
  return T;
});

/* ===================================================================== */
/*  PROGE POKALOV (13–28)                                                */
/* ===================================================================== */

/**
 * Želvica z relativnimi koordinatami in vzorci ovir (po zgledu klasičnih prog; vsak vzorec doda tudi točke
 * poti za autopilota). Vzorci so namenoma kopija in ne uvoz iz editor/generate.js — uradne proge se ne smejo
 * spremeniti, ko se spremeni generator naključnih prog.
 * Sproti preverja, ali se proga dotakne ali prekrije svoj starejši del (izpiše opozorilo).
 */
class OT extends Track {
  constructor(o) { super(o); this.stamp = 0; this.clash = []; this.altSpec = null; this.shortcuts = []; }
  set(c, r, ch, h = this.h) {
    const old = this.get(c, r);
    if (old && old.stamp != null && old.stamp < this.stamp - 3) this.clash.push(`prekrivanje ${c},${r}`);
    else if (!old) {
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.get(c + a, r + b);
        if (n && n.stamp != null && n.stamp < this.stamp - 4) { this.clash.push(`dotik ${c},${r}`); break; }
      }
    }
    super.set(c, r, ch, h);
    this.get(c, r).stamp = this.stamp;
    return this;
  }
  go(n, o = {}) { this.stamp++; return super.go(n, o); }
  turn(dir, o = {}) { this.stamp++; return super.turn(dir, o); }
  gap(n, dh = 0) { this.stamp++; return super.gap(n, dh); }
  get px() { return -this.dr; }
  get pz() { return this.dc; }
  /** Svetovni položaj relativno na želvico (side: desno +, fwd: naprej +). */
  rel(side, fwd) { return [this.x + this.px * side + this.dc * fwd, this.z + this.pz * side + this.dr * fwd]; }
  wpRel(side, fwd, o = {}) { const [x, z] = this.rel(side, fwd); return this.wpAt(x, z, o); }
  /** Pravokotnik vrstice ploščic na želvici (za kladiva in vrata). */
  rowRect(w) {
    const lo = -Math.floor((w - 1) / 2);
    const cs = [], rs = [];
    for (let k = lo; k < lo + w; k++) { cs.push(this.c + this.px * k); rs.push(this.r + this.pz * k); }
    const x = Math.min(...cs), z = Math.min(...rs);
    return { x, z, w: Math.max(...cs) - x + 1, d: Math.max(...rs) - z + 1 };
  }
  /** Kladiva čez pot (počakaj takoj po udarcu, nato skozi vsa). */
  hammers(n, { w = 3, period = 3, phase = 0.15, until = [3, 2.32, 2.6], speed = 5, ch } = {}) {
    const o = ch ? { ch } : {};
    this.go(3, { w, ...o }).wp({ until });
    for (let k = 0; k < n; k++) {
      this.go(2, o);
      const s = k % 2 ? -1 : 1;
      this.add('hammers', { ...this.rowRect(w), period, phase, dir: [this.px * s, this.pz * s] });
      this.go(1, o);
    }
    return this.wp({ speed }).go(2);
  }
  /** Premična plošča vstran čez prepad (cikel 11,5 s). s: stran (+1 desno). */
  moverSide(s = 1) {
    this.go(3, { w: 3 }).wp({ until: [11.5, 0.1, 1.0], speed: 3 });
    const [mx, mz] = this.rel(0, 2);
    const dx = this.px * s * 6, dz = this.pz * s * 6;
    const idx = (this.obj.movers || []).length;
    this.add('movers', { path: [[mx, this.h, mz], [mx + dx, this.h, mz + dz]], size: [3, 3], speed: 1.6, pause: 2, phase: 0 });
    this.route.push({ mover: idx, x: 0, z: 0, until: [11.5, 5.95, 7.0], speed: 3, r: 0.25 });
    this.stamp++;
    return this.gap(3).move(dx, dz).go(1, { w: 3 }).wp({ speed: 3 }).go(2);
  }
  /** »Voziček«: plošča, ki pelje naprej čez dolg prepad (n ploščic). */
  cart(n = 6, { speed = 1.6, pause = 2 } = {}) {
    const run = n / speed, per = Math.round((2 * run + 2 * pause) * 1e4) / 1e4;
    this.go(2, { w: 3 }).wp({ until: [per, 0.1, 1.0], speed: 3 });
    const [mx, mz] = this.rel(0, 2);
    const idx = (this.obj.movers || []).length;
    this.add('movers', { path: [[mx, this.h, mz], [mx + this.dc * n, this.h, mz + this.dr * n]], size: [3, 3], speed, pause, phase: 0 });
    this.route.push({ mover: idx, x: 0, z: 0, until: [per, Math.round((pause + run + 0.05) * 1e3) / 1e3, Math.round((pause + run + pause * 0.6) * 1e3) / 1e3], speed: 3, r: 0.25 });
    return this.gap(3 + n).go(1, { w: 3 }).wp({ speed: 3 }).go(2);
  }
  /** Dvigalo: plošča se dvigne za dh (cikel 2·dh/speed + 2·pause). */
  lift(dh = 2, { speed = 1, pause = 1.6 } = {}) {
    const run = dh / speed, per = Math.round((2 * run + 2 * pause) * 1e4) / 1e4;
    this.go(3, { w: 3 }).wp({ until: [per, 0.15, 1.1], speed: 2.5, r: 0.4 });
    const H0 = this.h, [mx, mz] = this.rel(0, 2);
    const idx = (this.obj.movers || []).length;
    this.add('movers', { path: [[mx, H0, mz], [mx, H0 + dh, mz]], size: [3, 3], speed, pause, phase: 0 });
    this.route.push({ mover: idx, x: 0, z: 0, until: [per, Math.round((pause + run + 0.15) * 1e3) / 1e3, Math.round((pause + run + pause * 0.85) * 1e3) / 1e3], speed: 2, r: 0.3 });
    return this.gap(3, dh).go(1, { w: 3 }).wp({ speed: 3 });
  }
  /** Vrtljiva plošča čez prepad. */
  spinner(speed = 0.6) {
    this.go(4, { w: 3 }).wp();
    const [sx, sz] = this.rel(0, 3);
    this.add('spinners', { x: sx, z: sz, r: 2.55, y: this.h, speed });
    return this.gap(1).wpAt(sx, sz, { speed: 3, r: 0.5 }).gap(4).go(2).wp({ speed: 3, r: 0.8 }).go(2);
  }
  /** Skok z rampe čez prepad (pred skokom spust, kot na Nebu). big: 4 navzdol + prepad 3, sicer 2 + 2. */
  rampJump(big = true) {
    const drop = big ? 4 : 2;
    this.go(2, { w: 3 });
    if (this.h < drop * 0.5) this.go(drop + 2, { up: drop }).go(1);
    if (big) { this.go(4, { down: 4 }).go(3).go(1, { up: 1 }); this.wp({ speed: 9 }); this.gap(3, -1); }
    else { this.go(2, { down: 2 }).go(2).go(2, { up: 2 }); this.wp({ speed: 9 }); this.gap(2, -1.5); }
    return this.go(3, { w: 5 }).wp({ speed: 9, r: 1 }).go(3).wp({ speed: 4, r: 0.8 }).go(2, { w: 3 });
  }
  /** Vzmet čez prepad (hi: višji pristanek). */
  springGap(hi = false, { land = hi ? 5 : 3, glue = true } = {}) {
    this.go(3, { w: 3 }).go(1);
    this.add('springs', { x: this.x, z: this.z, dir: [this.dc, this.dr], power: hi ? 9.5 : 8.5, up: hi ? 8 : 6.5 });
    this.wp({ speed: 3, r: 0.6 });
    return this.gap(4, hi ? 1 : 0).go(2, { w: land, ...(glue ? { ch: 'g' } : {}) }).wp({ speed: 3, r: 0.8 }).go(2, { w: 3 });
  }
  /** Slalom med odbijači. */
  bumpers(n, { s = 1, w = 5, power = 7, ch, speed = 3.5 } = {}) {
    const o = ch ? { ch } : {};
    this.go(2, { w, ...o });
    for (let k = 0; k < n; k++) {
      this.go(2, o);
      const [bx, bz] = this.rel(s * 1.2, 0);
      this.add('bumpers', { x: bx, z: bz, r: 0.4, power, y: this.h });
      this.wpRel(-s * 1.0, 0, { speed, r: 0.6 });
      s = -s;
    }
    return this.go(2, o).wp({ speed: 4, r: 0.6 }).go(1, { w: 3 });
  }
  /** Ventilatorji pihajo čez pot (rhythm: { period, duty } — ventilatorji v ritmu). */
  fans(n, { w = 3, s = 1, force = 7, rhythm = null, every = 3 } = {}) {
    this.go(2, { w }).wp();
    for (let k = 0; k < n; k++) {
      this.go(every);
      const [fx, fz] = this.rel(s * (w / 2 + 0.2), 0);
      this.add('fans', { x: fx, z: fz, dir: [-this.px * s, -this.pz * s], len: w + 0.6, width: 1.6, force, ...(rhythm || {}) });
      s = -s;
    }
    return this.go(2).wp();
  }
  /** Skleda na široki poti (zvezdica na dnu). */
  bowl(w = 7, depth = 0.8, star = true) {
    this.go(1, { w: 3 }).go(7, { w });
    const [bx, bz] = this.rel(0, -3);
    this.add('bowls', { x: bx, z: bz, r: (w - 1) / 2, depth });
    if (star) this.mark('star', 0, -3);
    return this.go(2, { w: 3 });
  }
  /** Stikalo v stranskem žepu in vrata. */
  door(s = 1, { star = false } = {}) {
    this.go(3, { w: 3 });
    const id = String.fromCharCode(97 + (this.obj.doors || []).length);
    for (let k = 2; k <= 4; k++) { const [cx, cz] = this.rel(s * k, 0); this.set(Math.floor(cx), Math.floor(cz), '.'); }
    const [wx, wz] = this.rel(s * 4, 0);
    this.add('switches', { x: wx, z: wz, id });
    if (star) { const [sx, sz] = this.rel(s * 4, 0); this.marks.pickups.push({ t: 'star', x: sx + this.px * s * 0.01, z: sz }); }
    this.wp({ speed: 3, r: 0.4 }).wpAt(wx, wz, { stop: true, r: 0.3 }).wp({ stop: true, r: 0.4 });
    this.go(2);
    this.add('doors', { ...this.rowRect(3), y: this.h, h: 1.2, id });
    return this.go(3);
  }
  /** Arena z nasilnežem (pot autopilota obide območje lova). */
  bully(n = 1, { s = 1, accel } = {}) {
    this.go(4, { w: 3 }).wp({ speed: 4.5, r: 0.6 });
    const ac = accel ? { accel } : {};
    if (n >= 2) {
      this.go(12, { w: 9 });
      const a = this.rel(-s * 2.5, -8.5), b = this.rel(s * 2.5, -3.5);
      this.add('enemies', { t: 'bully', x: a[0], z: a[1], zone: 3.2, ...ac }).add('enemies', { t: 'bully', x: b[0], z: b[1], zone: 3.2, ...ac });
      this.wpRel(s * 3, -9, { speed: 5 }).wpRel(-s * 3, -3, { speed: 5 });
    } else {
      this.go(9, { w: 9 });
      const a = this.rel(s * 2.5, -4);
      this.add('enemies', { t: 'bully', x: a[0], z: a[1], zone: 4.5, ...ac });
      this.wpRel(-s * 3, -7, { speed: 5 }).wpRel(-s * 3, -1, { speed: 5 });
    }
    return this.go(2, { w: 3 }).wp({ speed: 3.5, r: 0.4 }).go(2);
  }
  /** Žage čez široko pot (prehod ob pravem času). */
  saws(n = 3) {
    this.go(2, { w: 3 }).go(10, { w: 5 });
    const F = [-7, -4, -1], PH = [0, 0.25, 0.5];
    for (let k = 0; k < n; k++) {
      const s = k % 2 ? 1 : -1;
      this.add('enemies', { t: 'saw', path: [this.rel(s * 2, F[k]), this.rel(-s * 2, F[k])], loop: false, speed: 2.6, phase: PH[k] });
    }
    this.wpRel(0, -8.5, { speed: 3.5 }).wpRel(0, -8.5, { until: [3.0769, 2.4, 2.9], speed: 3.5, r: 0.4 }).wpRel(0, 1, { speed: 5 });
    return this.go(2, { w: 3 });
  }
  /** Ose letijo čez pot. */
  wasps(n = 2) {
    this.go(3, { w: 3 });
    for (let k = 0; k < n; k++) {
      this.wp({ until: [4, 3.3, 3.9], speed: 3, r: 0.4 });
      this.add('enemies', { t: 'wasp', path: [this.rel(1.6, 1.5), this.rel(-1.6, 1.5)], loop: false, speed: 1.6 });
      this.go(3);
    }
    return this.go(1).wp();
  }
  /** Sesalec ob ozkem mostu. */
  vacuum(s = 1, { len = 9, force = 7 } = {}) {
    this.go(2, { w: 3 }).wp();
    this.go(len, { w: 1 });
    const [vx, vz] = this.rel(s * 2.6, -len / 2);
    this.add('enemies', { t: 'vacuum', x: vx, z: vz, dir: [-this.px * s, -this.pz * s], range: 4, angle: 45, force });
    return this.go(3, { w: 3 }).wp({ speed: 4.5, r: 0.6 });
  }
  /** Magneta ob ozki poti. */
  magnets(n = 2, { s = 1, mode = 'pull', force = 10, len = 10 } = {}) {
    this.go(2, { w: 3 }).wp();
    this.go(len, { w: 1 });
    const P = [[-len / 2, -s * 2.5, 0], [-2, s * 2.5, 0.5]];
    for (let k = 0; k < n; k++) {
      const [mx, mz] = this.rel(P[k][1], P[k][0]);
      this.add('enemies', { t: 'magnet', x: mx, z: mz, mode: Array.isArray(mode) ? mode[k] : mode, period: 3, duty: 0.4, phase: P[k][2], range: 3.5, force });
    }
    return this.go(2, { w: 3 }).wp({ speed: 4, r: 0.5 });
  }
  /** Most s padajočimi ploščicami. */
  fallBridge(n = 6, { w = 1, speed = 3.6 } = {}) {
    this.go(2, { w: 3 }).wp();
    return this.go(n, { w, ch: 'x', wp: { speed } }).go(2, { w: 3 });
  }
  /**
   * Razcep: varna pot naokoli (zavije na stran s, gre naprej len, se vrne) in bližnjica naravnost čez ozek most
   * (1 ploščica, brez ograj, z zvezdico). Autopilot vozi varno pot; bližnjica je v routes.alt.
   */
  fork(s = 1, { len = 12, out = 6, bridge = '.', speed = 4 } = {}) {
    const d0 = this.dir, sideDir = { N: s > 0 ? 'E' : 'W', E: s > 0 ? 'S' : 'N', W: s > 0 ? 'N' : 'S' }[d0];
    const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[sideDir];
    const c0 = this.c, r0 = this.r, h0 = this.h;
    const from = this.route.length;
    this.turn(sideDir, { w: 3 }).go(out).turn(d0).go(len).turn(back).go(out);
    // bližnjica: ozek most od razcepa do stičišča
    const bridgeWp = [];
    const cells = [];
    for (let k = 2; k <= len - 2; k++) cells.push([c0 + this.dc * 0 + D4[d0][0] * k, r0 + D4[d0][1] * k]);
    for (const [c, r] of cells) super.set(c, r, bridge, h0);
    bridgeWp.push({ x: c0 + 0.5, z: r0 + 0.5, speed, stop: true, r: 0.35 });
    const mid = cells[Math.floor(cells.length / 2)];
    this.marks.pickups.push({ t: 'star', x: mid[0] + 0.5, z: mid[1] + 0.5 });
    const xs = cells.map(p => p[0]), zs = cells.map(p => p[1]);
    this.shortcuts.push({ x: Math.min(...xs), z: Math.min(...zs), w: Math.max(...xs) - Math.min(...xs) + 1, d: Math.max(...zs) - Math.min(...zs) + 1 });
    this.turn(d0);
    const to = this.route.length - 1;   // točka poti v stičišču (zavoj nazaj na glavno smer)
    this.altSpec = { from, to, via: bridgeWp };
    return this;
  }
}

/** Časovno okno [perioda, od, do], ko pot od A do B (hitrost v) ne pride bližje kot `clear` nobenemu od sovražnikov. */
function safeWindow(T, list, A, B, v, { clear = 1.0, per } = {}) {
  const P = per || list[0].per;
  const dur = Math.hypot(B[0] - A[0], B[1] - A[1]) / v + 0.6;
  const pos = (e, t) => {
    const pts = e.loop ? [...e.path, e.path[0]] : e.path;
    let len = 0; const seg = [];
    for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push([pts[i], pts[i + 1], len, l]); len += l; }
    let s;
    if (e.loop) s = (((t * e.speed + (e.phase || 0) * len) % len) + len) % len;
    else { const run = len / e.speed, pp = 2 * run; const u = (((t + (e.phase || 0) * pp) % pp) + pp) % pp; s = u < run ? u * e.speed : len - (u - run) * e.speed; }
    const g = seg.find(q => s <= q[2] + q[3]) || seg[seg.length - 1];
    const f = g[3] ? (s - g[2]) / g[3] : 0;
    return [g[0][0] + (g[1][0] - g[0][0]) * f, g[0][1] + (g[1][1] - g[0][1]) * f];
  };
  const ok = t0 => {
    for (let tau = 0; tau <= dur; tau += 0.04) {
      const f = Math.min(1, Math.max(0, (tau - 0.3) / (dur - 0.6)));
      const bx = A[0] + (B[0] - A[0]) * f, bz = A[1] + (B[1] - A[1]) * f;
      for (const e of list) { const p = pos(e, t0 + tau); if (Math.hypot(p[0] - bx, p[1] - bz) < clear) return false; }
    }
    return true;
  };
  let best = null, cur = null;
  const N = Math.ceil(P / 0.02);
  for (let i = 0; i < 2 * N; i++) {
    const t = (i % N) * 0.02;
    if (ok(t)) { if (!cur) cur = [i, i]; else cur[1] = i; }
    else { if (cur && (!best || cur[1] - cur[0] > best[1] - best[0])) best = cur; cur = null; }
  }
  if (cur && (!best || cur[1] - cur[0] > best[1] - best[0])) best = cur;
  if (!best) throw new Error('ni varnega okna');
  const a = (best[0] % N) * 0.02, len = Math.min(best[1] - best[0], N) * 0.02;
  // začni malo po začetku okna, konec pred koncem (rezerva za pospeševanje)
  const r3 = x => Math.round(x * 1000) / 1000;
  return [r3(P), r3((a + Math.min(0.1, len * 0.15)) % P), r3((a + Math.max(0.15, len * 0.45)) % P)];
}

/* ------------------------------------------------- kratke proge (sprinti) */

def({ id: '13-tobogan', name: 'Tobogan', set: 1, theme: 'vrt', look: 'garden', diff: 1, tags: ['spust', 'valovi', 'skleda'], scoring: { sharp: true },
  desc: 'Širok spust z valovi in skledo. Hitrost brez kazni — za ogrevanje prstov.' }, () => {
  const T = new OT({ speed: 6.5 });
  T.at(0, 0, 'N', 4).row(0, 0, 5, '.', 4); T.mark('start'); T.w = 5;
  T.go(2).mark('star', -2, 0);
  T.go(6, { down: 4 }).mark('star', 2, 0);
  T.go(5, { ch: '~' }).wp();
  T.bowl(7, 0.6);
  T.turn('E', { w: 5 }).go(2).go(5, { down: 2 }).mark('clock');
  T.go(4, { ch: '~' }).mark('star', -2, 0);
  T.turn('N', { w: 5 }).go(3).go(5, { down: 2 }).mark('star', 2, 0).go(2).mark('goal').go(2);
  T.wp({}, 0, -2);
  return T;
});

def({ id: '14-odskocna-deska', name: 'Odskočna deska', set: 2, theme: 'nebo', look: 'sky', diff: 3, tags: ['skoki', 'vzmeti', 'ozko'], scoring: { sharp: true },
  desc: 'Trije skoki čez prepade — vzmet, rampa, visoka vzmet. Pristanki so ozki.' }, () => {
  const T = new OT({ speed: 5 });
  T.at(0, 0, 'N', 3).row(0, 0, 3, '.', 3); T.mark('start'); T.w = 3;
  T.go(1).mark('star', 1, 0);
  T.springGap(false);
  T.mark('star', 0, -1);
  T.rampJump(false);
  T.mark('cp').mark('star', 1, -2);
  T.turn('E').go(1).springGap(true, { land: 3 });
  T.mark('star', 0, -1).go(1).turn('N').go(2).mark('clock', -1).mark('star', 1).go(1).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '15-britev', name: 'Britev', set: 3, theme: 'neon', look: 'neon', diff: 4, tags: ['ozko', 'ventilatorji', 'ritem'], scoring: { sharp: true },
  desc: 'Most, širok eno ploščico, brez robov. Ventilatorji pihajo v ritmu — počakaj na premor.' }, () => {
  const T = new OT({ speed: 4 });
  T.at(0, 0, 'N', 2).row(0, 0, 3, '.', 2); T.mark('start'); T.w = 3;
  const RH = { period: 3, duty: 0.35, phase: 0 };
  T.go(2).mark('star', -1, 0);
  // most 1: dva ventilatorja v ritmu (piha v [0; 1,05) s od začetka cikla)
  T.go(1).wp({ until: [3, 1.12, 1.3], stop: true, r: 0.35 });
  T.go(1, { w: 1 });
  for (let k = 0; k < 2; k++) { T.go(2, { w: 1 }); const [fx, fz] = T.rel((k ? -1 : 1) * 0.7, 0); T.add('fans', { x: fx, z: fz, dir: [k ? 1 : -1, 0], len: 1.6, width: 1.6, force: 9, ...RH }); }
  T.go(2, { w: 1 }).mark('star', 0, -1).wp({ speed: 4 });
  T.go(2, { w: 3 }).mark('cp');
  // cikcak brez robov
  T.turn('E').go(2, { w: 1 }).turn('N').go(3).turn('W').go(2).turn('N').go(3).mark('star', 0, 0).turn('E').go(2).turn('N').go(2, { w: 3 });
  // most 2: trije ventilatorji, izmenično
  T.go(1).wp({ until: [3, 1.12, 1.3], stop: true, r: 0.35 });
  T.go(1, { w: 1 });
  for (let k = 0; k < 3; k++) { T.go(2, { w: 1 }); const [fx, fz] = T.rel((k % 2 ? -1 : 1) * 0.7, 0); T.add('fans', { x: fx, z: fz, dir: [k % 2 ? 1 : -1, 0], len: 1.6, width: 1.6, force: 9, ...RH }); }
  T.go(1, { w: 1 }).wp({ speed: 4 }).go(2, { w: 3 }).mark('star', 1).mark('clock', -1).go(1).mark('star').mark('goal').go(1);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '16-sivankino-uho', name: 'Šivankino uho', set: 3, theme: 'tovarna', look: 'factory', diff: 5, tags: ['ozko', 'kladiva', 'padajoče ploščice', 'vrata'], scoring: { sharp: true },
  desc: 'Ozka vrata, kladiva z ozkimi okni in padajoče ploščice. Ena napaka in dobrega časa ni več.' }, () => {
  const T = new OT({ speed: 4 });
  T.at(0, 0, 'N', 1).row(0, 0, 3, '.', 1); T.mark('start'); T.w = 3;
  const gate = side => {   // vrata: zid čez pot z eno ploščico odprtine (side: −1 levo, 0 sredina, 1 desno)
    T.go(1);
    for (const k of [-1, 0, 1]) if (k !== side) { const [bx, bz] = T.rel(k, 0); T.add('blocks', { x: Math.floor(bx), z: Math.floor(bz) + 0.35, w: 1, d: 0.3, y0: T.h, y1: T.h + 1 }); }
    T.wpRel(side, -0.7, { speed: 3.2, r: 0.3 }).wpRel(side, 0.7, { speed: 3.6, r: 0.35 });
  };
  T.go(2).mark('star', 1, 0);
  gate(-1); T.go(2); gate(1); T.go(2);
  // kladiva na ozkem mostu (okno takoj po udarcu)
  T.go(1).wp({ until: [2.4, 2.24, 2.36], stop: true, r: 0.3 });
  T.go(1, { w: 1 });
  for (let k = 0; k < 2; k++) { T.go(2, { w: 1 }); T.add('hammers', { ...T.rowRect(1), period: 2.4, phase: 0, dir: [k ? -1 : 1, 0] }); }
  T.go(1, { w: 1 }).wp({ speed: 4 }).mark('star', 0, 0).go(2, { w: 3 }).mark('cp');
  T.turn('W').fallBridge(6, { speed: 3.8 }).mark('star', 0, -1);
  T.turn('N').go(1); gate(0); T.go(1); gate(-1); T.go(1).mark('star', 1, 0);
  T.go(1).wp({ speed: 3.2, r: 0.3 }).go(4, { w: 1, ch: 'x', wp: { speed: 3.8 } }).go(2, { w: 3 }).mark('star', -1).mark('goal').go(1);
  T.wp({}, 0, -1);
  return T;
});

/* ------------------------------------------------- srednje proge */

def({ id: '17-pekarna', name: 'Pekarna', set: 1, theme: 'kuhinja', look: 'kitchen', diff: 2, tags: ['tekoči trakovi', 'sklede', 'premična plošča'],
  desc: 'Tekoči trakovi naprej in nazaj, sklede za testo in plošča čez vroč pekač.' }, () => {
  const T = new OT({ speed: 4.8 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(3).go(7, { conv: 'F' }).mark('star', 1).go(2);
  T.bowl(5, 0.6);
  T.turn('E').go(8, { conv: 'B', wp: { speed: 5.5 } }).go(2).mark('cp').pocket(-2, 2, 'clock');
  T.turn('N').moverSide(-1);
  T.go(1).mark('cp');
  T.bowl(7, 0.8);
  T.turn('W').go(7, { conv: 'F' }).mark('star', 0, -2).go(2);
  T.turn('N').go(4, { up: 2 }).go(4, { conv: 'B', wp: { speed: 5.5 } }).go(2).mark('star', -1).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '18-botanicni-vrt', name: 'Botanični vrt', set: 1, theme: 'vrt', look: 'garden', diff: 2, tags: ['razcep', 'bližnjica', 'ozko'],
  desc: 'Prvi razcep: varna pot okrog gred ali hitra bližnjica čez ozek most z zvezdico.' }, () => {
  const T = new OT({ speed: 5 });
  T.at(0, 0, 'N').row(0, 0, 5, '.', 0); T.mark('start'); T.w = 5;
  T.go(4).mark('star', 2, 0).go(4, { up: 2 }).go(3, { w: 3 });
  T.fork(1, { len: 12, out: 6 });
  T.go(3).mark('cp').go(2);
  T.turn('W').go(8).pocket(-2, 3).go(2);
  T.turn('N').go(4, { w: 5, ch: '~' }).mark('clock', 2).mark('star', -2).go(3, { w: 3 });
  T.turn('E').go(4, { down: 2 }).go(3).mark('cp');
  T.turn('N').bumpers(3, { s: 1 });
  T.go(2).mark('star', 1).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '19-drsalisce', name: 'Drsališče', set: 2, theme: 'led', look: 'ice', diff: 3, tags: ['led', 'odbijači', 'lepilo'],
  desc: 'Led z odbijači, vijuge brez ograj in lepilo kot zavora pred zavoji.' }, () => {
  const T = new OT({ speed: 4 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(2).wp().go(7, { w: 5, ch: 'i' }).mark('star', 2, 0);
  T.bumpers(3, { ch: 'i', speed: 2.6, power: 3.5 });
  T.go(2, { ch: 'g' }).mark('cp');
  T.turn('E').go(2).go(6, { ch: 'i', wp: { speed: 3.5 } }).go(2, { ch: 'g' }).mark('star', 0, -1);
  T.turn('N').go(2).go(5, { w: 1, ch: 'i', wp: { speed: 3 } }).go(2, { w: 3, ch: 'g' }).mark('clock', 1);
  T.turn('W').go(3).go(5, { ch: 'i', wp: { speed: 3.5 } }).go(2, { ch: 'g' }).mark('cp');
  T.turn('N').go(1).bumpers(4, { ch: 'i', speed: 2.6, power: 3.5, s: -1 }).mark('star', -1, -2);
  T.go(2, { ch: 'g' }).turn('E').go(3).go(5, { w: 1, ch: 'i', wp: { speed: 3 } }).go(2, { w: 3, ch: 'g' }).mark('star', 0, -1);
  T.turn('N').go(3).go(5, { w: 5, ch: 'i' }).mark('star', -2).go(2, { w: 3 }).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '20-rudnik', name: 'Rudnik', set: 2, theme: 'tovarna', look: 'mine', diff: 3, tags: ['vozički', 'padajoče ploščice', 'žage'],
  themeOver: { floor: '#b89a6a', side: '#5a4030', edge: '#ffb347', accent: '#ffd23f', wall: '#8a5a2a' },
  desc: 'Vozički čez globoke jaške, padajoče ploščice in žage v temnih rovih.' }, () => {
  const T = new OT({ speed: 4.5 });
  T.at(0, 0, 'N', 2).row(0, 0, 3, '.', 2); T.mark('start'); T.w = 3;
  T.go(3).mark('star', 1, 0);
  T.cart(6);
  T.mark('cp').go(1);
  T.fallBridge(6, { w: 3 }).mark('star', 0, -1);
  T.saws(2);
  T.mark('cp').turn('E').go(2).mark('clock', 0, 0);
  T.cart(5);
  T.mark('star', 0, -1).go(1).turn('N').go(2).mark('star', 1, 0).go(4, { down: 2 }).mark('cp');
  T.fallBridge(5, { w: 1 });
  T.go(2).mark('star', 1).go(1).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '21-laboratorij', name: 'Laboratorij', set: 3, theme: 'steklo', look: 'crystal', diff: 4, tags: ['magneti', 'stikala', 'sesalec'],
  desc: 'Magneti vlečejo in odbijajo, tri stikala odpirajo vrata po vrsti, sesalec ob ozkem mostu.' }, () => {
  const T = new OT({ speed: 4.5 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(2).door(1, { star: true });
  T.magnets(2, { s: 1, mode: ['push', 'pull'], force: 9 });
  T.mark('cp').door(-1);
  T.mark('star', 1, -1);
  T.turn('E').go(2).vacuum(1, { len: 9 }).mark('clock', 0, -1).mark('cp');
  T.turn('N').go(1).door(-1, { star: true });
  T.magnets(2, { s: -1, mode: 'pull', force: 10, len: 10 });
  T.mark('cp').turn('W').go(2).vacuum(-1, { len: 7, force: 7.5 }).mark('star', 0, -1);
  T.turn('N').go(3).mark('star', 1).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '22-panj', name: 'Panj', set: 3, theme: 'kuhinja', look: 'garden', diff: 4, tags: ['ose', 'lepilo', 'ozki prehodi'],
  themeOver: { floor: '#ffc94a', side: '#a86a10', edge: '#fff0b0', accent: '#ff4fd8', wall: '#ffb020' },
  desc: 'Ose krožijo nad satovjem, med celicami so ozki prehodi, med, ki lepi, pa te upočasni.' }, () => {
  const T = new OT({ speed: 4.2 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  // satovje: kvadri na široki poti, med njimi ozki prehodi (cikcak)
  const comb = (rows, flip) => {
    T.go(1, { w: 5 });
    for (let k = 0; k < rows; k++) {
      T.go(2, { w: 5 });
      const open = ((k + flip) % 2) ? 1 : -1;
      for (const sd of [-2, -1, 0, 1, 2]) if (Math.abs(sd - open) > 0 && !(sd === open * 2)) { const [bx, bz] = T.rel(sd, 0); T.add('blocks', { x: Math.floor(bx) + 0.1, z: Math.floor(bz) + 0.1, w: 0.8, d: 0.8, y0: T.h, y1: T.h + 0.9 }); }
      T.wpRel(open * 1.5, 0, { speed: 3, r: 0.35 });
    }
    T.go(2, { w: 5 }).wp({ speed: 3.5 }).go(1, { w: 3 });
  };
  // krožna osa čez pot (zanka okoli točke ob poti); okno izračuna safeWindow
  const ring = (side, r, sp, ph = 0) => {
    const [cx, cz] = T.rel(side, 2);
    const path = Array.from({ length: 8 }, (_, k) => [cx + r * Math.cos(k * Math.PI / 4), cz + r * Math.sin(k * Math.PI / 4)]);
    let per = 0; for (let k = 0; k < 8; k++) per += Math.hypot(path[(k + 1) % 8][0] - path[k][0], path[(k + 1) % 8][1] - path[k][1]);
    const e = { t: 'wasp', path, loop: true, speed: sp, phase: ph, per: per / sp };
    return e;
  };
  const waspPass = (es, len) => {
    const A = T.rel(0, 0), B = T.rel(0, len);
    const win = safeWindow(T, es, A, B, 3.4, { clear: 1.05 });
    T.wp({ until: win, stop: true, r: 0.3 });
    for (const e of es) { const { per, ...o } = e; T.add('enemies', o); }
    T.go(len, { wp: { speed: 4 } });
  };
  T.go(3).mark('star', -1, 0);
  T.go(1); waspPass([ring(1.8, 1.7, 1.4)], 5);
  T.go(2, { ch: 'g' }).mark('cp');
  comb(4, 0); T.mark('star', 0, -1);
  T.turn('E').go(2); waspPass([ring(-1.8, 1.7, 1.4), ring(1.8, 1.7, 1.4, 0.5)], 5);
  T.go(3, { ch: 'g' }).mark('clock', 0, -1).mark('cp');
  T.turn('N').go(1); comb(5, 1); T.mark('star', -1, -1);
  T.go(2, { ch: 'g' }); waspPass([ring(1.8, 1.7, 1.6), ring(-1.8, 1.7, 1.6, 0.5)], 5);
  T.mark('cp').turn('W').go(3).pocket(-2, 2).go(2); waspPass([ring(1.6, 1.6, 1.5)], 5);
  T.turn('N').go(3, { ch: 'g' }).mark('star', 1).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '23-ognjenik', name: 'Ognjenik', set: 3, theme: 'nemogoce', look: 'inferno', diff: 5, tags: ['padajoče ploščice', 'žage', 'nasilnež', 'klanci'],
  desc: 'Padajoče ploščice nad lavo, žage, nasilnež na ploščadi in strmi klanci navzgor.' }, () => {
  const T = new OT({ speed: 4.5 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(2).mark('star', 1, 0);
  T.fallBridge(7, { w: 1, speed: 3.8 });
  T.go(4, { up: 3 }).mark('cp');
  T.bully(1, { s: 1, accel: 6.5 });
  T.mark('star', -1, -1);
  T.saws(3);
  T.mark('cp').turn('E').go(1).go(5, { up: 4 }).go(1).mark('clock', 0, 0);
  T.fallBridge(8, { w: 1, speed: 3.8 }).mark('star', 0, -1);
  T.turn('N').go(2).mark('cp');
  T.magnets(1, { s: -1, mode: 'pull', force: 9, len: 8 });
  T.go(4, { up: 3 }).mark('star', 1, 0);
  T.bully(2, { s: -1, accel: 6 });
  T.mark('star', 0, -1).go(1).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

/* ------------------------------------------------- dolge proge */

def({ id: '24-nedeljski-sprehod', name: 'Nedeljski sprehod', set: 1, theme: 'vrt', look: 'garden', diff: 1, tags: ['dolga', 'široko', 'ure', 'žepi'],
  desc: 'Dolga, široka in slikovita. Malo ovir, veliko ur in zvezdic v žepih — dolga ne pomeni težka.' }, () => {
  const T = new OT({ speed: 5.5 });
  T.at(0, 0, 'N').row(0, 0, 5, '.', 0); T.mark('start'); T.w = 5;
  T.go(4).mark('clock', 1).go(6).pocket(-3, 3).go(4, { up: 2 }).go(4);
  T.turn('E').go(10).mark('cp').go(8, { ch: '~' }).pocket(-3, 2, 'clock').go(6);
  T.turn('N').go(6).mark('star', 2, 0).go(4);
  T.turn('W').go(8).go(6, { down: 2 }).mark('cp').go(8).pocket(3, 3).go(4);
  T.turn('N').go(5).bowl(7, 0.6, false); T.go(3, { w: 5 }).mark('clock', -1, 0).go(2);
  T.turn('E').go(10, { w: 5 }).mark('cp').go(6, { up: 2 }).go(8).pocket(3, 3).go(4);
  T.turn('N').go(8).mark('star', -2, 0).go(4);
  T.turn('W').go(12).mark('cp').go(6, { ch: '~' }).mark('clock', 1).go(8);
  T.turn('N').go(6).go(4, { down: 2 }).go(4).pocket(-3, 3, 'clock').go(4);
  T.turn('E').go(10).mark('cp').go(14);
  T.turn('N').go(7).mark('clock', 1).go(3);
  T.turn('W').go(10).mark('cp').go(6, { up: 2 }).go(8);
  T.turn('N').go(8).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '25-velika-tura', name: 'Velika tura', set: 2, theme: 'kuhinja', look: 'kitchen', diff: 3, tags: ['dolga', 'mešano', 'premične plošče', 'kladiva'],
  desc: 'Najboljše iz prvih dveh sklopov: sklede, plošče, trakovi, kladiva, stikalo, led in vzmeti.' }, () => {
  const T = new OT({ speed: 4.8 });
  T.at(0, 0, 'N').row(0, 0, 5, '.', 0); T.mark('start'); T.w = 5;
  T.go(3).go(6, { ch: '~' }).mark('star', -2).go(2);
  T.bowl(7, 0.8, false); T.mark('cp');
  T.turn('E', { w: 3 }).go(8, { conv: 'F' }).mark('clock', 0, 0).go(2);
  T.turn('N').moverSide(1);
  T.mark('cp').go(2);
  T.hammers(3);
  T.mark('star', 1, -1).turn('W').go(6, { conv: 'B', wp: { speed: 5.5 } }).go(2).mark('cp');
  T.turn('N').door(-1, { star: true });
  T.go(3).go(8, { w: 1, ch: 'x', wp: { speed: 3.6 } }).go(2, { w: 3 }).mark('cp');
  T.turn('E').go(2).go(6, { w: 5, ch: 'i', wp: { speed: 3.5 } }).go(2, { w: 3, ch: 'g' }).mark('clock', 0, 0);
  T.turn('N').springGap(false).mark('cp');
  T.fans(3, { s: 1 });
  T.go(2).turn('W').go(4).moverSide(1);
  T.mark('cp').turn('N').go(3).go(4, { up: 2 }).spinner(0.6);
  T.mark('star', 1, -1).go(2).mark('cp');
  T.turn('E').go(3).go(8, { w: 1 }).go(3, { w: 3 }).mark('clock', 0, -1);
  T.turn('N').bumpers(3).springGap(true);
  T.mark('star', 0, -1).go(2).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '26-kristalna-jama', name: 'Kristalna jama', set: 2, theme: 'steklo', look: 'crystal', diff: 3, tags: ['dolga', 'spust', 'led', 'odbijači', 'razcep'],
  desc: 'Spust v globino: spirale navzdol, ledeni deli, odbijači in ena tvegana bližnjica.' }, () => {
  const T = new OT({ speed: 4.6 });
  const H = 16;
  T.at(0, 0, 'N', H).row(0, 0, 3, '.', H); T.mark('start'); T.w = 3;
  T.go(3).mark('star', 1, 0).go(6, { down: 3 }).go(2);
  T.turn('E').go(3).go(6, { ch: 'i', wp: { speed: 3.5 } }).go(2, { ch: 'g' }).mark('cp');
  T.turn('N').go(2).bumpers(3, { s: 1 });
  T.go(4, { down: 3 }).go(2).mark('clock', 0, 0);
  T.turn('W').go(3).go(6, { down: 3 }).go(3).mark('cp').mark('clock', 0, -1);
  T.turn('N').go(2).fork(-1, { len: 12, out: 6, bridge: 'i', speed: 3 });
  T.go(3).mark('cp').go(4, { down: 3 }).go(2);
  T.turn('E').go(2).go(8, { w: 5, ch: 'i', wp: { speed: 3.5 } }).go(2, { w: 3, ch: 'g' }).mark('star', 0, -1);
  T.turn('N').go(3).bumpers(4, { s: -1, ch: 'i', speed: 2.6, power: 3.5 }).go(2, { ch: 'g' }).mark('cp');
  // spirala navzdol v srce jame (proti sredini)
  const legs = [['W', 14], ['N', 14], ['E', 14], ['S', 10], ['W', 10], ['N', 6], ['E', 5]];
  for (const [d, n] of legs) {
    T.turn(d).go(1);
    for (let i = 0; i < n - 1; i++) T.go(1, i % 4 === 1 && i < n - 2 ? { down: 1 } : {});
    if (d === 'N' || d === 'S') T.mark('cp');
    if (d === 'E' && n === 14) T.mark('clock', 0, -4).mark('star', 0, -8);
  }
  T.mark('star', 0, 0).go(1).mark('goal').go(1);
  T.wp({}, 0, 0);
  return T;
});

def({ id: '27-nebesna-lestev', name: 'Nebesna lestev', set: 3, theme: 'stolp', look: 'tower', diff: 4, tags: ['dolga', 'vzpon', 'dvigala', 'ventilatorji', 'ose'],
  desc: 'Vzpon v nebo: dvigala, ventilatorji, ozki mostovi in ose. Pogoste kontrolne točke.' }, () => {
  const T = new OT({ speed: 4.5 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(2).mark('star', 1, 0).go(5, { up: 3 }).go(1);
  T.lift(2).mark('cp');
  T.fans(3, { s: 1 }).go(2, { up: 2 }).go(2).mark('cp');
  T.turn('E').go(2).go(8, { w: 1, wp: { speed: 4 } }).go(2, { w: 3 }).mark('clock', 0, -1);
  T.lift(2).mark('cp');
  T.turn('N').go(1).wasps(2).go(5, { up: 3 }).mark('cp');
  T.turn('W').go(2).fans(3, { s: -1, force: 7.5 }).mark('star', 0, -2);
  T.lift(2).mark('cp');
  T.turn('N').go(2).go(7, { w: 1, ch: 'x', wp: { speed: 3.6 } }).go(2, { w: 3 }).mark('cp');
  T.go(4, { up: 3 }).mark('clock', -1);
  T.turn('E').go(2).wasps(2).mark('cp');
  T.lift(2).go(1).mark('star', 1, 0);
  T.turn('N').go(2).vacuum(1, { len: 8, force: 6.5 }).mark('cp');
  T.go(3, { up: 2 }).springGap(true).mark('cp');
  T.turn('W').go(2).fans(2, { s: 1, force: 8 }).go(6, { w: 1 }).go(2, { w: 3 }).mark('star', 0, -1).mark('cp');
  T.lift(2).turn('N').go(2).mark('clock', 1).go(3).mark('star').mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '28-hrckov-maraton', name: 'Hrčkov maraton', set: 3, theme: 'nemogoce', look: 'arena', diff: 5, tags: ['dolga', 'vse mehanike', 'vsi sovražniki'],
  themeOver: { floor: '#ffe07a', edge: '#ff4fd8' },
  desc: 'Vse mehanike in vsi sovražniki na eni progi. Finale Peklenskega pokala.' }, () => {
  const T = new OT({ speed: 4.8 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(2).go(5, { w: 5, ch: '~' }).mark('star', 2).go(1, { w: 3 });
  T.bowl(7, 0.8, false); T.mark('cp');
  T.turn('E').go(2).go(7, { conv: 'B', wp: { speed: 5.5 } }).go(2);
  T.hammers(3).mark('cp');
  T.turn('N').moverSide(-1).mark('clock', 0, -1);
  T.fallBridge(6, { w: 1 }).mark('cp');
  T.bully(1, { s: 1 });
  T.mark('star', 0, -1).turn('W').go(2);
  T.saws(3).mark('cp');
  T.wasps(2).go(2);
  T.turn('N').door(1).mark('cp');
  T.magnets(2, { s: 1, mode: ['pull', 'push'], force: 9 });
  T.springGap(false).mark('cp');
  T.turn('E').go(2).vacuum(-1, { len: 9 }).mark('clock', 0, -1);
  T.go(2).go(6, { w: 5, ch: 'i', wp: { speed: 3.5 } }).go(2, { w: 3, ch: 'g' }).mark('cp');
  T.turn('N').go(2).spinner(0.7).mark('star', 1, -1);
  T.fans(3, { s: -1, rhythm: { period: 3, duty: 0.5 } }).mark('cp');
  T.go(3).lift(2).go(1);
  T.turn('W').go(2).bumpers(3, { s: 1 }).mark('cp');
  T.cart(5).mark('star', 0, -1);
  T.go(2).turn('N').go(2).bully(2, { s: 1 });
  T.mark('cp').rampJump(true).mark('clock', 0, -1);
  T.turn('E').go(2).go(8, { w: 1, ch: 'x', wp: { speed: 3.6 } }).go(2, { w: 3 }).mark('cp');
  T.turn('N').springGap(true).mark('star', 0, -1).go(2).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

/* ===================================================================== */
/*  Zapis                                                                */
/* ===================================================================== */

const r1 = x => Math.round(x * 10) / 10;
const DUMP = (process.argv.find(a => a.startsWith('--dump=')) || '').slice(7);

/** Izpis proge z višinami, potjo autopilota (številke) in mesti padcev (X). */
function dump(L, res) {
  const g = L.map.map(r => [...r]);
  L.route.forEach((w, i) => { if (w.mover == null) { const c = Math.floor(w.x), r = Math.floor(w.z); if (g[r]?.[c] != null) g[r][c] = String.fromCharCode(i < 10 ? 48 + i : 55 + i); } });
  for (const f of res.trace || []) { const c = Math.floor(f.x), r = Math.floor(f.z); if (g[r]?.[c] != null) g[r][c] = 'X'; }
  g.forEach((row, r) => console.log(String(r).padStart(3) + ' ' + row.join('') + '   ' + (L.hmap ? L.hmap[r] : '')));
  if (res.trace?.[0]?.hist) console.log(res.trace[0].hist.join('\n'));
  for (const f of (res.trace || []).slice(0, 8)) console.log(`  padec t=${f.t.toFixed(1)} pri ${f.x.toFixed(2)}, ${f.z.toFixed(2)} (točka poti ${f.k})`);
}

/**
 * Združi generirane proge z obstoječim index.json: mesta generiranih prog zapolni po vrstnem redu generatorja,
 * ročno dodane proge (datoteke, ki jih generator ne pozna) ostanejo na svojem mestu, nove generirane gredo na konec.
 */
async function mergeIndex(out) {
  let old = [];
  try { old = JSON.parse(await readFile(new URL('index.json', OUT), 'utf8')).levels || []; } catch { /* prvi zagon */ }
  const known = new Set(LEVELS.map(d => d.meta.id + '.json'));
  const queue = out.map(L => L.id + '.json');
  const files = [], manual = [];
  for (const f of old) {
    if (known.has(f)) { if (queue.length) files.push(queue.shift()); continue; }
    try {
      const L = JSON.parse(await readFile(new URL(f, OUT), 'utf8'));
      const errs = validateLevel(L);
      if (errs.length) console.log('✘ ' + errs.join('\n✘ '));
      files.push(f); manual.push(L);
    } catch { console.log(`(index.json: »${f}« ne obstaja ali ni veljaven JSON — odstranjeno)`); }
  }
  files.push(...queue);
  return { files, manual };
}

/** Prikazana težavnost klasičnih prog (ročna ocena, potrjena z --balance). */
const CLASSIC_DIFF = { '01': 1, '02': 2, '03': 1, '04': 2, '05': 3, '06': 3, '07': 3, '08': 3, '09': 4, '10': 4, '11': 4, '12': 5 };

/** --check: generirane proge morajo biti enake datotekam (izpiše polja, ki se razlikujejo). */
async function compareFiles(out) {
  let n = 0;
  for (const L of out) {
    let disk;
    try { disk = JSON.parse(await readFile(new URL(L.id + '.json', OUT), 'utf8')); } catch { console.log(`✘ ${L.id}: datoteke še ni (poženi node tools/krogla-levels.mjs)`); n++; continue; }
    const keys = [...new Set([...Object.keys(L), ...Object.keys(disk)])].filter(k => JSON.stringify(L[k]) !== JSON.stringify(disk[k]));
    if (keys.length) { console.log(`✘ ${L.id}: razlikuje se od datoteke v poljih ${keys.join(', ')}`); n++; }
  }
  if (!n) console.log(`✔ vseh ${out.length} prog je enakih datotekam`);
  return n;
}

/* ===================================================================== */
/*  --balance: izmerjena težavnost, rezerve ure pokalov, tedenski pokal  */
/* ===================================================================== */

const pct = x => Math.round(x * 100) + ' %';
const fmtS = s => (s >= 60 ? Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0') : Math.round(s) + ' s');

async function balance(levels) {
  let bad = 0;
  const md = [];
  console.log(`\n— Izmerjena težavnost (${RUNS} zašumljenih voženj na progo) —`);
  const rows = levels.map(L => measureLevel(L, { runs: RUNS }));
  md.push('| Proga | Autopilot | Medalje 🥇/🥈/🥉 | Ura | Dolžina | Težavnost dekl. / izm. | Uspeh pod uro | Padci | Nevarnosti/10 s | Ocena |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const L = levels.find(x => x.id === r.id);
    const off = Math.abs(r.measured - r.diff);
    if (off > 1) bad++;
    console.log(`${r.id.padEnd(22)} ${String(r.time).padStart(6)} s  ${lenOf(L).padEnd(8)} dekl. ${r.diff}  izm. ${r.measured} (ocena ${r.score.toFixed(2)})  uspeh ${pct(r.ok).padStart(5)}  padci ${r.falls.toFixed(1)}  nevarnosti ${r.density.toFixed(1)}/10 s${off > 1 ? '  ✘ razlika > 1' : ''}`);
    md.push(`| ${L.id.slice(0, 2)} ${L.name} | ${r.time} s | ${L.medals.gold} / ${L.medals.silver} / ${L.medals.bronze} | ${L.timeBonus} s | ${lenOf(L)} | ${'★'.repeat(r.diff)} / ${'★'.repeat(r.measured)}${off > 1 ? ' ✘' : ''} | ${pct(r.ok)} | ${r.falls.toFixed(1)} | ${r.density.toFixed(1)} | ${r.score.toFixed(2)} |`);
  }
  const rho = spearman(rows.map(r => r.diff), rows.map(r => r.score));
  console.log(`Spearman (deklarirana ↔ izmerjena): ${rho.toFixed(2)}${rho < 0.7 ? '  ✘ < 0,7' : ''}`);
  if (rho < 0.7) bad++;
  md.push('', `Spearman (deklarirana težavnost ↔ izmerjena ocena): **${rho.toFixed(2)}** · meje ocene za ★2–★5: ${SCORE_CUTS.join(' / ')}`);

  // pokali: rezerva ure (autopilot brez šuma; v oklepaju brez pobranih ur)
  const cups = JSON.parse(await readFile(new URL('cups.json', OUT), 'utf8'));
  const errs = validateCups(cups, levels.map(L => L.id));
  if (errs.length) { console.log('✘ ' + errs.join('\n✘ ')); bad += errs.length; }
  const runs = new Map(levels.map(L => [L.id, cleanRun(L)]));
  const byId = new Map(levels.map(L => [L.id, L]));
  console.log('\n— Pokali: rezerva ure (autopilot; v oklepaju brez pobranih ur) —');
  md.push('', '| Pokal | Proge | Skupaj (autopilot) | Ura | Lahka | Normalna | Noro | Krivulja težavnosti |', '|---|---|---|---|---|---|---|---|');
  const week = isoWeek(new Date());
  for (const c of cups.cups) {
    const ids = c.weekly ? weeklyPick(rng, week, levels) : c.levels;
    const ls = ids.map(id => byId.get(id));
    const total = ls.reduce((s, L) => s + runs.get(L.id).time, 0);
    const cell = d => {
      if (!cupDiffs(c).includes(d)) return '—';
      const a = cupClockSim(c, ls, d, runs), b = cupClockSim(c, ls, d, runs, { clocks: false });
      return (a.done ? pct(a.reserve) : 'ne konča') + ' (' + (b.done ? pct(b.reserve) : 'ne konča') + ')';
    };
    const curve = ls.map(L => diffOf(L)).join('-');
    const cells = DIFF_IDS.map(cell);
    console.log(`${(c.icon + ' ' + c.name).padEnd(22)} ${String(ls.length).padStart(2)} prog  ${fmtS(total).padStart(5)}  ura ×${c.clock || 1}  ${DIFF_IDS.map((d, i) => DIFFS[d].name + ' ' + cells[i]).join(' · ')}  · ${curve}`);
    md.push(`| ${c.icon} ${c.name}${c.weekly ? ' (' + week + ')' : ''} | ${ls.length} | ${fmtS(total)} | ×${String(c.clock || 1).replace('.', ',')} | ${cells.join(' | ')} | ${curve} |`);
    // pravila: Normalna 20–40 %, Lahka ≥ 50 %, Noro 0–15 % ali brez ur ne konča
    const n = cupClockSim(c, ls, 'normalna', runs), e = cupClockSim(c, ls, 'lahka', runs);
    const x = cupClockSim(c, ls, 'noro', runs), x0 = cupClockSim(c, ls, 'noro', runs, { clocks: false });
    const bads = [];
    if (cupDiffs(c).includes('normalna') && !(n.done && n.reserve >= 0.2 && n.reserve <= 0.4)) bads.push('Normalna ni 20–40 %');
    if (cupDiffs(c).includes('lahka') && !(e.done && e.reserve >= 0.5)) bads.push('Lahka < 50 %');
    if (cupDiffs(c).includes('noro') && !((x.done && x.reserve <= 0.15) || !x0.done)) bads.push('Noro: preveč rezerve');
    // Klasični turnir ostane natanko tak kot prej (ura in proge), zato zanj pravila rezerve ne veljajo
    if (bads.length && c.id === 'klasika') console.log('   (izjema — nespremenjen: ' + bads.join(', ') + ')');
    else if (bads.length) { console.log('   ✘ ' + bads.join(', ')); bad++; }
  }

  // tedenski pokal: 52 tednov
  const pool = levels.filter(L => diffOf(L) <= 4).map(L => L.id);
  const seen = new Set();
  let prev = null, repeats = 0;
  const avgs = [], lens = [];
  for (let k = 0; k < 52; k++) {
    const ids = weeklyPick(rng, weekShift(week, k), levels);
    ids.forEach(id => seen.add(id));
    if (prev && ids.some(id => prev.includes(id))) repeats++;
    prev = ids;
    avgs.push(ids.reduce((s, id) => s + diffOf(byId.get(id)), 0) / ids.length);
    lens.push(ids.reduce((s, id) => s + runs.get(id).time, 0));
  }
  const missing = pool.filter(id => !seen.has(id));
  const q = (arr, f) => arr.slice().sort((a, b) => a - b)[Math.floor((arr.length - 1) * f)];
  const wtxt = `Tedenski pokal (52 tednov od ${week}): povprečna težavnost ${Math.min(...avgs).toFixed(1)}–${Math.max(...avgs).toFixed(1)} (mediana ${q(avgs, 0.5).toFixed(1)}), skupna dolžina ${fmtS(Math.min(...lens))}–${fmtS(Math.max(...lens))} (mediana ${fmtS(q(lens, 0.5))}), ponovitve v zaporednih tednih: ${repeats}, proge iz bazena, ki se ne pojavijo: ${missing.length ? missing.join(', ') : 'nobena'}.`;
  console.log('\n' + wtxt);
  if (repeats || missing.length || Math.min(...avgs) < 2.5 || Math.max(...avgs) > 3.5) bad++;
  md.push('', wtxt);

  // zapis v PROGRESS.md (blok med oznakama)
  const pu = new URL('PROGRESS.md', ROOT);
  const RE = /<!-- BEGIN KROGLA BALANCE[\s\S]*?<!-- END KROGLA BALANCE -->/;
  try {
    let txt = await readFile(pu, 'utf8');
    if (RE.test(txt)) {
      txt = txt.replace(RE, `<!-- BEGIN KROGLA BALANCE (node tools/krogla-levels.mjs --balance) -->\n${md.join('\n')}\n<!-- END KROGLA BALANCE -->`);
      await writeFile(pu, txt);
    } else console.log('(PROGRESS.md nima bloka BEGIN KROGLA BALANCE — tabele niso zapisane)');
  } catch (e) { console.log('(PROGRESS.md ni bilo mogoče posodobiti: ' + e.message + ')'); }
  console.log(bad ? `\n✘ balans: ${bad} napak` : '\n✔ balans v mejah');
  return bad;
}

async function main() {
  const out = [];
  let bad = 0;
  for (const { meta, fn } of LEVELS) {
    if ((ONLY || DUMP) && !meta.id.startsWith(ONLY || DUMP)) continue;
    const T = fn();
    if (!T.route.length || T.route[T.route.length - 1].x !== undefined) T.route.push({ x: T.marks.goal[0], z: T.marks.goal[1], speed: T.speed });
    const L = finish(T, meta);
    const num = parseInt(meta.id, 10);
    // premik koordinat, ki ga je naredil finish (za alternativno pot in bližnjice)
    const sx = L.start[0] - T.marks.start[0], sz = L.start[1] - T.marks.start[1];
    if (meta.look) L.look = meta.look;
    if (T.altSpec) {
      const { from, to, via } = T.altSpec;
      const sh = w => (w.mover != null ? { ...w } : { ...w, x: w.x + sx, z: w.z + sz });
      L.routes = { alt: [...T.route.slice(0, from), ...via, ...T.route.slice(to)].map(sh) };
    }
    if (T.shortcuts?.length) L.shortcuts = T.shortcuts.map(r => ({ x: r.x + sx, z: r.z + sz, w: r.w, d: r.d }));
    if (T.clash?.length) console.log(`⚠ ${meta.id}: proga se dotika sama sebe: ${[...new Set(T.clash)].slice(0, 8).join('; ')}`);
    const res = runAutopilot(L, { trace: DUMP && meta.id.startsWith(DUMP) });
    if (DUMP && meta.id.startsWith(DUMP)) dump(L, res);
    const A = res.time;
    if (!res.finished) { const b = res.world.ball; console.log(`✘ ${L.id}: autopilot ne pride do cilja (padci ${res.falls}, krogla ${b.x.toFixed(1)}, ${b.z.toFixed(1)})`); bad++; }
    const a = A || 60;
    L.medals = meta.medals || medalsFromTime(a, meta.scoring);
    L.timeBonus = meta.timeBonus || timeBonusFromTime(a, meta.scoring);
    // nova polja: diff (vse proge), len in tags (proge 13+; klasičnim se ne spremeni nič razen diff)
    L.diff = meta.diff ?? CLASSIC_DIFF[meta.id.slice(0, 2)];
    if (num >= 13) { L.len = lenFromTime(A); if (meta.tags) L.tags = meta.tags; }
    if (meta.scoring && num >= 13) L.scoring = meta.scoring;
    L.dev = { time: A != null ? r1(A) : null, falls: res.falls };
    if (L.routes?.alt) {
      const alt = runAutopilot({ ...L, route: L.routes.alt });
      console.log(`   ${L.id}: alternativna pot ${alt.finished ? r1(alt.time) + ' s' : 'NE pride do cilja'} (glavna ${r1(A)} s)`);
      if (!alt.finished) bad++;
    }
    const errs = validateLevel(L);
    if (errs.length) { console.log('✘ ' + errs.join('\n✘ ')); bad++; }
    console.log(`${L.id.padEnd(18)} ${String(L.size).padEnd(7)} autopilot ${A != null ? r1(A) + ' s' : '—'}  padci ${res.falls}  zvezdice ${res.stars}/5  · zlato ${L.medals.gold} srebro ${L.medals.silver} bron ${L.medals.bronze} · čas ${L.timeBonus} s`);
    out.push(L);
  }
  if (CHECK) bad += await compareFiles(out);
  if (BALANCE) bad += await balance(out);
  if (CHECK || BALANCE || ONLY || DUMP) { process.exit(bad ? 1 : 0); }
  await mkdir(OUT, { recursive: true });
  for (const L of out) await writeFile(new URL(L.id + '.json', OUT), formatLevelJson(L));
  // ročno dodane proge (JSON brez generatorja, npr. iz urejevalnika) ostanejo v index.json na svojem mestu
  const { files, manual } = await mergeIndex(out);
  await writeFile(new URL('index.json', OUT), JSON.stringify({ levels: files }, null, 2) + '\n');
  if (manual.length) console.log('Ročno dodane proge (ohranjene): ' + manual.map(L => L.id).join(', '));
  const sqlUrl = new URL('supabase/games/krogla.sql', ROOT);
  try {
    let sql = await readFile(sqlUrl, 'utf8');
    const rows = [...out, ...manual].map(L => `  ('${L.id}', ${Math.round(L.medals.gold * 1000)})`).join(',\n');
    const block = `-- BEGIN LEVELS (tools/krogla-levels.mjs)\ninsert into public.krogla_levels (level, gold_ms) values\n${rows}\non conflict (level) do update set gold_ms = excluded.gold_ms;\n-- END LEVELS`;
    sql = sql.replace(/-- BEGIN LEVELS[\s\S]*?-- END LEVELS/, block);
    await writeFile(sqlUrl, sql);
  } catch { console.log('(supabase/games/krogla.sql še ne obstaja — blok zlatih časov ni zapisan)'); }
  console.log(`\nZapisanih ${out.length} prog.` + (bad ? ` NAPAKE: ${bad}` : ''));
  process.exit(bad ? 1 : 0);
}

await main();
