/* =====================================================================
   ZLATI TEST — varovalo pred nenamernimi spremembami obnašanja.
   Bot odigra 12 iger s fiksnimi semeni; zapišemo točke, trajanje (frame-i),
   štetje dogodkov in hash zaporedja dogodkov (ime | točke | frame).
   Pri isti verziji fizike (PHYSICS_VERSION) se morajo vrednosti ujemati
   bit za bitom. Posnetek: tests/fixtures/pinball-golden.json (v korenu repoja).
   Regeneracija (samo ob namerni spremembi z novo verzijo fizike):
     node games/pinball/tests/golden.mjs --update
   ===================================================================== */

export const GOLDEN_SEEDS = [1000, 1017, 1034, 1051, 1068, 1085, 1102, 1119, 1136, 1153, 1170, 1187];

/** FNV-1a (32 bit) nad nizom */
function fnv(h, s) {
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/**
 * @param play (seed, trace) => rezultat bot igre ({ score, frames, events })
 */
export function goldenRun(play, physicsVersion, seeds = GOLDEN_SEEDS) {
  const games = [], raw = [];
  for (const seed of seeds) {
    let h = 2166136261 >>> 0, n = 0;
    const r = play(seed, (name, score, frame) => { h = fnv(h, name + '|' + score + '|' + frame + ';'); n++; });
    raw.push(r);
    const counts = {};
    for (const k of Object.keys(r.events).sort()) counts[k] = r.events[k];
    games.push({ seed, score: r.score, frames: r.frames, events: n, hash: h.toString(16).padStart(8, '0'), counts });
  }
  return { physicsVersion, games, raw };
}

/** primerja dejanski posnetek s pričakovanim; vrne seznam razlik (prazen = enako) */
export function compareGolden(actual, expected) {
  const diffs = [];
  if (!expected) return ['ni posnetka'];
  if (actual.physicsVersion !== expected.physicsVersion) {
    return ['verzija fizike ' + actual.physicsVersion + ' ≠ posnetek ' + expected.physicsVersion + ' (regeneriraj z golden.mjs --update)'];
  }
  const byseed = new Map(expected.games.map(g => [g.seed, g]));
  for (const a of actual.games) {
    const e = byseed.get(a.seed);
    if (!e) { diffs.push('seme ' + a.seed + ': ni v posnetku'); continue; }
    for (const k of ['score', 'frames', 'events', 'hash']) {
      if (a[k] !== e[k]) diffs.push(`seme ${a.seed}: ${k} ${a[k]} ≠ ${e[k]}`);
    }
    const keys = new Set([...Object.keys(a.counts), ...Object.keys(e.counts)]);
    for (const k of keys) if (a.counts[k] !== e.counts[k]) diffs.push(`seme ${a.seed}: dogodek ${k} ${a.counts[k]} ≠ ${e.counts[k]}`);
  }
  return diffs;
}
