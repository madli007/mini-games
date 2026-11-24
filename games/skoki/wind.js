/* =====================================================================
   SMUČARSKI SKOKI — wind.js: deterministični veter iz seeda.
   Konfiguracija: { mode: 'off'|'const'|'random', speed?, seed }
     off    — brez vetra
     const  — stalen veter `speed` (m/s, + = čelni), le majhni sunki
     random — povprečje iz seeda (−3 … +3 m/s), počasna sprememba vzdolž doskočišča in sunki
   at(t, x) → { h, v }: h = čelna komponenta (+ = proti skakalcu, ugodno), v = navpična (+ = gor).
   ===================================================================== */
import { noise1, prng, clamp } from './dmath.js';

export const WIND_MAX = 3;

/** Normaliziraj konfiguracijo vetra (za ghost in prikaz). */
export function windConfig(c = {}) {
  const mode = ['off', 'const', 'random'].includes(c.mode) ? c.mode : 'off';
  const seed = (c.seed >>> 0) || 0;
  const speed = clamp(Math.round((+c.speed || 0) * 10) / 10, -WIND_MAX, WIND_MAX);
  return { mode, seed, speed: mode === 'const' ? speed : 0 };
}

/**
 * @param {{mode:string, seed:number, speed?:number}} cfg
 * @param {Object} P parametri fizike (P.wind)
 */
export function createWind(cfg, P) {
  cfg = windConfig(cfg);
  const W = P.wind;
  const r = prng(cfg.seed ^ 0x5bd1e995);
  let mean = 0, gust = 0, along = 0;
  if (cfg.mode === 'random') {
    // povprečje: bolj verjetno blizu 0, a celoten razpon −3 … +3
    const u = r() * 2 - 1;
    mean = Math.round(clamp(u * (0.55 + 0.45 * Math.abs(u)) * WIND_MAX, -WIND_MAX, WIND_MAX) * 100) / 100;
    gust = W.gustAmp; along = W.varAlong;
  } else if (cfg.mode === 'const') {
    mean = cfg.speed; gust = W.gustAmp * 0.4; along = W.varAlong * 0.3;
  }
  const s1 = (cfg.seed * 7 + 1) | 0, s2 = (cfg.seed * 13 + 2) | 0, s3 = (cfg.seed * 17 + 3) | 0, s4 = (cfg.seed * 19 + 4) | 0;
  const off = cfg.mode === 'off';
  return {
    cfg, mean,
    at(t, x) {
      if (off) return { h: 0, v: 0 };
      const f = W.gustFreq;
      const h = mean + along * noise1(x / 35, s1) + gust * (noise1(t * f, s2) + 0.5 * noise1(t * f * 2.7 + 11, s3));
      const v = W.vertical * (gust > 0 ? gust / W.gustAmp : 0) * noise1(t * 1.3 + 5, s4);
      return { h, v };
    },
  };
}
