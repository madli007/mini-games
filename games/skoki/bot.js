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
  const gap = 0.13 + r() * 0.06;   // razmik med klikoma dvoklika
  void standUp;
  let noise = 0, tick = 0;
  const clicks = [];               // ticki klikov (gumb pritisnjen 2 ticka)
  let toClicks = 0, landTick = -1;
  const click = () => { clicks.push(tick); };
  const btnNow = () => clicks.some(c => tick >= c && tick < c + 2) ? 1 : 0;

  return {
    skill, plan: { toErr, landLead, twoFeet },
    /** @param {Object} s stanje simulacije (J.s) */
    input(s) {
      tick = s.tick;
      noise += (r.gauss() * noiseAmp - noise) * 0.04;
      hist.push(s.gamma);
      const gamDelayed = hist[Math.max(0, hist.length - 1 - delayTicks)];
      let pitch = 18;
      // odriv: dvoklik, drugi klik ob času toErr glede na rob (− = pred robom)
      if (s.phase === 'inrun' || (s.phase === 'air' && !s.takeoff)) {
        const rel = s.phase === 'inrun' ? -(s.v > 0.1 ? s.d / s.v : 9) : (tick - s.edgeTick) * STEP;
        if (toClicks === 0 && rel >= toErr - gap && tick > 12) { click(); toClicks = 1; }
        else if (toClicks === 1 && rel >= toErr && tick - clicks[clicks.length - 1] >= 3) { click(); toClicks = 2; }
        return { btn: btnNow(), pitch };
      }
      if (s.phase === 'air') {
        const air = (tick - s.takeoff.tick) * STEP;
        pitch = quantPitch((gamDelayed / DEG) + alpha + alphaBias + noise - (air < 0.25 ? 6 : 0));
        // pristanek: prvi klik ob landLead pred stikom, drugi (telemark) po razmiku
        const ttc = s.vn > 0.1 ? s.hag / s.vn : 9;
        if (landTick < 0 && air > 0.5 && ttc <= landLead) { landTick = tick; click(); }
        else if (landTick >= 0 && !twoFeet && clicks[clicks.length - 1] === landTick && (tick - landTick) * STEP >= gap * 0.8) click();
        return { btn: btnNow(), pitch };
      }
      return { btn: 0, pitch };
    },
  };
}
