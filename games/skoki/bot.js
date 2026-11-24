/* =====================================================================
   SMUČARSKI SKOKI — bot.js: simuliran skakalec s spretnostjo 0–1.
   Bere stanje simulacije (physics.js) in vrača vnose po tickih, tako kot igralec.
   Napake: tajming odriva in pristanka (Gauss), reakcijski zamik in šum pri
   vodenju nagiba, občasno »vstajanje« v zaletu pri nizki spretnosti.
   API: const bot = createBot({ skill, seed }); bot.input(state) → { btn, pitch }
   ===================================================================== */
import { prng, clamp, DEG } from './dmath.js';
import { quantPitch, STEP } from './physics.js';

/** Optimalni napadni kot (°), ki ga bot lovi (najdaljši let pri teh parametrih). */
export const BOT_ALPHA = 29;

/**
 * @param {{skill:number, seed:number, alpha?:number}} o
 */
export function createBot({ skill = 0.7, seed = 1, alpha = BOT_ALPHA } = {}) {
  skill = clamp(skill, 0, 1);
  const r = prng((seed >>> 0) ^ 0x2545f491);
  const miss = 1 - skill;
  // načrt skoka (vse naključno vnaprej, deterministično iz seeda)
  const toErr = clamp(r.gauss() * (0.006 + miss * 0.075) + miss * 0.01, -0.2, 0.14);
  const landLead = 0.28 + r.gauss() * (0.015 + miss * 0.11);
  const twoFeet = r() < miss * 0.45;
  const delayTicks = Math.round((0.03 + miss * 0.22) / STEP);
  const noiseAmp = 0.4 + miss * 7;
  const alphaBias = r.gauss() * miss * 4 + miss * 6;   // začetniki se radi »usedejo« (premalo naprej)
  const standUp = r() < miss * 0.35 ? { at: 120 + Math.floor(r() * 300), len: 20 + Math.floor(r() * 50) } : null;
  const hist = [];
  void r();                        // (rezerva: ohrani zaporedje naključnih števil)
  void standUp;
  let noise = 0, tick = 0;
  let toTick = -1, landTick = -1;
  const held = (t0, n = 2) => t0 >= 0 && tick >= t0 && tick < t0 + n;

  return {
    skill, plan: { toErr, landLead, twoFeet },
    /** @param {Object} s stanje simulacije (J.s) */
    input(s) {
      tick = s.tick;
      noise += (r.gauss() * noiseAmp - noise) * 0.04;
      hist.push(s.gamma);
      const gamDelayed = hist[Math.max(0, hist.length - 1 - delayTicks)];
      // odriv: oba gumba hkrati ob času toErr glede na rob (− = pred robom)
      if (s.phase === 'inrun' || (s.phase === 'air' && !s.takeoff)) {
        const rel = s.phase === 'inrun' ? -(s.v > 0.1 ? s.d / s.v : 9) : (tick - s.edgeTick) * STEP;
        if (toTick < 0 && rel >= toErr && tick > 12) toTick = tick;
        return { btn: held(toTick) ? 2 : 0, pitch: 0 };
      }
      if (s.phase === 'air') {
        const air = (tick - s.takeoff.tick) * STEP;
        // želeni absolutni nagib → popravek glede na samodejni letalni položaj (s.auto)
        const want = (gamDelayed / DEG) + alpha + alphaBias + noise - (air < 0.25 ? 6 : 0);
        const pitch = quantPitch(want - (s.auto ?? want));
        // pristanek: ob landLead pred stikom en gumb (dve nogi) ali oba (telemark)
        const ttc = s.vn > 0.1 ? s.hag / s.vn : 9;
        if (landTick < 0 && air > 0.5 && ttc <= landLead) landTick = tick;
        return { btn: held(landTick) ? (twoFeet ? 1 : 2) : 0, pitch };
      }
      return { btn: 0, pitch: 0 };
    },
  };
}
