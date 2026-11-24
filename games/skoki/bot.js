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
  let noise = 0, pressTick = -1, released = false, tick = 0;

  return {
    skill, plan: { toErr, landLead, twoFeet },
    /** @param {Object} s stanje simulacije (J.s) */
    input(s) {
      tick = s.tick;
      noise += (r.gauss() * noiseAmp - noise) * 0.04;
      hist.push(s.gamma);
      const gamDelayed = hist[Math.max(0, hist.length - 1 - delayTicks)];
      let pitch = 18;
      if (s.phase === 'inrun') {
        let btn = 1;
        if (standUp && tick >= standUp.at && tick < standUp.at + standUp.len) btn = 0;
        const tte = s.v > 0.1 ? s.d / s.v : 9;
        if (toErr < 0 && tte <= -toErr) btn = 0;
        return { btn, pitch };
      }
      if (s.phase === 'air') {
        if (!s.takeoff) {
          const since = (tick - s.edgeTick) * STEP;
          return { btn: since >= toErr ? 0 : 1, pitch };
        }
        const air = (tick - s.takeoff.tick) * STEP;
        pitch = quantPitch((gamDelayed / DEG) + alpha + alphaBias + noise - (air < 0.25 ? 6 : 0));
        // pristanek
        const ttc = s.vn > 0.1 ? s.hag / s.vn : 9;
        if (pressTick < 0 && air > 0.5 && ttc <= landLead) pressTick = tick;
        if (pressTick >= 0) {
          if (!twoFeet && !released && (tick - pressTick) * STEP > 0.06) released = true;
          return { btn: released ? 0 : 1, pitch };
        }
        return { btn: 0, pitch };
      }
      return { btn: twoFeet && pressTick >= 0 ? 1 : 0, pitch };
    },
  };
}
