/* =====================================================================
   Testi prave skakalnice Smučarskih skokov (prompts/29-skoki-prave-skakalnice.md):
   validator (group, real, betaL, unlock), profil po certifikatu (K-točka na h/n),
   nespremenjeni skoki bota na trening skakalnicah (fikstura skoki-bot-ref.json),
   odklepanje (Orlova / Planica velika / katera koli prava velika), meje v SQL.
   Registrira jih tests/skoki.js.
   ===================================================================== */
import * as H from '../games/skoki/hill.js';
import * as PH from '../games/skoki/physics.js';
import * as SC from '../games/skoki/scoring.js';
import * as BOT from '../games/skoki/bot.js';
import * as K from '../games/skoki/contest.js';

// h, n iz certifikatov (višina in vodoravna razdalja K-točke od roba mize)
const CERT_HN = {
  'planica-srednja': [45.87, 82.65], 'planica-velika': [62.40, 107.59], oberstdorf: [59.52, 103.51], garmisch: [62.32, 107.64],
  innsbruck: [59.85, 103.32], bischofshofen: [62.36, 107.61], zakopane: [62.37, 107.76], willingen: [65.73, 111.43],
  lahti: [56.60, 100.70], engelberg: [62.50, 107.50], 'planica-letalnica': [102.0, 170.45], kulm: [103.2, 170.91],
  vikersund: [102.24, 170.47], 'oberstdorf-letalnica': [103.1, 170.3],
};

/**
 * @param {(name:string, fn:Function)=>void} test
 * @param {{eq:Function, ok:Function}} h
 */
export function skokiRealTests(test, { eq, ok }) {
  const real = ctx => ctx.skokiHills.filter(d => d.group === 'prave');

  test('skoki: prave skakalnice (vsaj 12, validator, real, imena krajev, brez imen skakalcev)', ctx => {
    const R = real(ctx);
    ok(R.length >= 12, 'vsaj 12 pravih skakalnic, je ' + R.length);
    ok(R.filter(d => d.size === 'letalnica').length >= 3, 'vsaj 3 letalnice');
    for (const d of R) {
      eq(H.validateHill(d), [], d.id);
      ok(d.real.source.startsWith('https://') && /\.pdf$/.test(d.real.source), d.id + ': vir certifikata');
      ok(d.real.certYear >= 2018, d.id + ': aktualen certifikat');
      if (d.real.record) eq(Object.keys(d.real.record).sort(), ['dist', 'year'], d.id + ': rekord brez imena');
      ok(!/schanze|arena|velikanka|krokiew|gorišek|bergisel/i.test(d.name), d.id + ': ime kraja, ne objekta');
      eq(d.meterValue, H.meterValueFor(d.k)); eq(d.base, H.baseFor(d.k));
    }
    const ids = ['planica-srednja', 'planica-velika', 'oberstdorf', 'garmisch', 'innsbruck', 'bischofshofen', 'zakopane', 'willingen', 'lahti', 'engelberg', 'planica-letalnica', 'kulm', 'vikersund'];
    for (const id of ids) ok(R.some(d => d.id === id), 'manjka ' + id);
  });

  test('skoki: validator — group/real/betaL/unlock', ctx => {
    const base = structuredClone(ctx.skokiHills.find(d => d.id === 'planica-velika'));
    const bad = (mut, re) => { const d = structuredClone(base); mut(d); const e = H.validateHill(d); ok(e.some(x => re.test(x)), 'pričakovana napaka ' + re + ': ' + e.join('; ')); };
    bad(d => { delete d.real; }, /real: obvezno/);
    bad(d => { d.real.country = 'Slovenija'; }, /real\.country/);
    bad(d => { d.real.source = 'skisprungschanzen'; }, /real\.source/);
    bad(d => { d.real.record = { dist: 142, year: 2014, name: 'X' }; }, /brez imena/);
    bad(d => { d.group = 'trening'; }, /real: le pri group/);
    bad(d => { d.landing.betaL = d.landing.beta + 1; }, /betaL/);
    bad(d => { d.unlock = { over: 'k' }; }, /unlock/);
    const ok1 = structuredClone(base); ok1.unlock = { group: 'prave', size: 'velika', over: 'hs' }; eq(H.validateHill(ok1), []);
  });

  test('skoki: profil po certifikatu (K-točka na h/n, naklon v L = βL)', ctx => {
    for (const d of real(ctx)) {
      const hill = H.buildHill(d), [h, n] = CERT_HN[d.id];
      const kp = hill.landAt(d.k);
      ok(Math.abs(-kp.y - h) < 0.1, `${d.id}: višina K ${(-kp.y).toFixed(2)} ≠ h ${h}`);
      ok(Math.abs(kp.x - n) < (d.size === 'letalnica' ? 2.5 : 1.2), `${d.id}: K x ${kp.x.toFixed(2)} ≠ n ${n}`);
      ok(Math.abs(hill.landAt(d.hs).theta * 180 / Math.PI - d.landing.betaL) < 0.2, d.id + ': naklon v L');
      eq(d.hs, d.landing.lArc, d.id + ': L = HS');
    }
  });

  test('skoki: trening skakalnice — skoki bota nespremenjeni (fikstura)', ctx => {
    const ref = ctx.skokiBotRef;
    ok(ref && Object.keys(ref).length >= 8, 'fikstura');
    for (const [id, rows] of Object.entries(ref)) {
      const def = ctx.skokiHills.find(d => d.id === id);
      ok(def && (def.group || 'trening') === 'trening' && !def.real, id + ': trening');
      const hill = H.buildHill(def); let k = 0;
      for (const skill of [0.3, 0.7, 1]) for (let i = 0; i < 4; i++) {
        const b = BOT.createBot({ skill, seed: 11 + i * 7919 });
        const J = PH.simulate({ hill, P: ctx.skokiParams, gate: def.gates.default, wind: { mode: 'random', seed: 5 + i }, input: s => b.input(s) });
        eq([J.s.dist, J.s.tick, J.s.landing.type], rows[k++], `${id} ${skill} #${i}`);
      }
    }
  });

  test('skoki: prave skakalnice so vse odprte; pogoji odklepa (hill / hills / size + group) še delujejo', ctx => {
    const defs = ctx.skokiHills, by = id => defs.find(d => d.id === id);
    for (const d of defs.filter(x => x.group === 'prave')) ok(!d.unlock && K.isOpen(d, new Set()), d.id + ': odprta');
    // splošni pogoji (za morebitne nove skakalnice)
    const t = (unlock, hill, dist, fall = false) => K.unlocksBy([{ id: 'x', unlock }], { hill: by(hill), dist, fall }).length === 1;
    ok(t({ hill: 'orlova', over: 'k' }, 'orlova', 125) && !t({ hill: 'orlova', over: 'k' }, 'orlova', 124.5), 'hill + K');
    ok(t({ hills: ['orlova', 'zakopane'], over: 'hs' }, 'zakopane', 140) && !t({ hills: ['orlova'], over: 'hs' }, 'zakopane', 140), 'hills + HS');
    ok(t({ group: 'prave', size: 'velika', over: 'hs' }, 'zakopane', 140) && !t({ group: 'prave', size: 'velika', over: 'hs' }, 'sipina', 117), 'group + size');
    ok(t({ size: 'letalnica', over: 'k' }, 'orlovo-gnezdo', 200) && t({ size: 'letalnica', over: 'k' }, 'vikersund', 200), 'size brez skupine');
    ok(!t({ hill: 'orlova', over: 'k' }, 'orlova', 140, true), 'padec ne odklene');
    ok(/skakalnici »Orlova« ali »Planica, velika«/.test(K.unlockText({ unlock: { hills: ['orlova', 'planica-velika'], over: 'k' } }, defs)));
    ok(/kateri koli pravi veliki/.test(K.unlockText({ unlock: { group: 'prave', size: 'velika', over: 'hs' } }, defs)));
  });

  test('skoki: prave skakalnice — max_points/max_dist v SQL = scoring.js, zaletna mesta po certifikatu', ctx => {
    for (const d of real(ctx)) {
      ok(ctx.skokiSql.includes(`('${d.id}', ${SC.maxPoints(d)}, ${SC.maxDist(d)})`), d.id + ': vrstica v skoki_hills');
      ok(d.gates.default >= 1 && d.gates.default <= d.gates.count, d.id + ': privzeto mesto');
      ok(d.gateFactor > 0, d.id + ': gateFactor');
    }
  });
}
