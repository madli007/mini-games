/* Shramba: samo localStorage, vsak dostop v try/catch (igra deluje tudi brez shrambe).
   Lestvica ni tu: gre prek huba (tudi offline, lokalni adapter huba). */

const PREFIX = 'aluPinball2.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch (e) {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------------- statistika ---------------- */
const STATS0 = { games: 0, maxCombo: 0, maxJackpot: 0, bestScore: 0, playSec: 0, wizards: 0, modes: 0 };

// statistika po mizah (Alu ohrani stari ključ 'stats')
const statsKey = id => (!id || id === 'alu') ? 'stats' : 'stats:' + id;

export function loadStats(id) {
  const v = load(statsKey(id), {});
  return Object.assign({}, STATS0, typeof v === 'object' && v ? v : {});
}

export function recordGame(g, id) {
  const s = loadStats(id);
  s.games++;
  s.maxCombo = Math.max(s.maxCombo, g.maxCombo || 0);
  s.maxJackpot = Math.max(s.maxJackpot, g.maxJackpot || 0);
  s.bestScore = Math.max(s.bestScore, g.score || 0);
  s.playSec += Math.round(g.playSec || 0);
  s.wizards += g.wizards || 0;
  s.modes += g.modes || 0;
  save(statsKey(id), s);
  return s;
}

/* ---------------- nastavitve ---------------- */
const SETTINGS0 = { quality: 'auto', music: 0.6, sfx: 0.8, muted: false, fps: false };

export function loadSettings() {
  const v = load('settings', {});
  return Object.assign({}, SETTINGS0, typeof v === 'object' && v ? v : {});
}

export function saveSettings(s) { save('settings', s); }
