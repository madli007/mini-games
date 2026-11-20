/* Shramba: samo localStorage, vsak dostop v try/catch (igra deluje tudi brez shrambe). */

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

/* ---------------- rekordi (top 10) ---------------- */
export function loadScores() {
  const v = load('scores', []);
  if (!Array.isArray(v)) return [];
  return v
    .filter(e => e && typeof e.score === 'number' && typeof e.name === 'string')
    .map(e => ({ name: e.name.slice(0, 12), score: Math.max(0, Math.floor(e.score)), date: e.date || '' }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export function qualifies(score) {
  if (score <= 0) return false;
  const s = loadScores();
  return s.length < 10 || score > s[s.length - 1].score;
}

/** vstavi rezultat, vrne indeks na lestvici (ali -1) */
export function addScore(name, score) {
  const s = loadScores();
  const entry = { name: String(name).slice(0, 12), score: Math.floor(score), date: new Date().toISOString().slice(0, 10) };
  s.push(entry);
  s.sort((a, b) => b.score - a.score);
  const top = s.slice(0, 10);
  save('scores', top);
  return top.indexOf(entry);
}

/* ---------------- statistika ---------------- */
const STATS0 = { games: 0, maxCombo: 0, maxJackpot: 0, bestScore: 0, playSec: 0, wizards: 0, modes: 0 };

export function loadStats() {
  const v = load('stats', {});
  return Object.assign({}, STATS0, typeof v === 'object' && v ? v : {});
}

export function recordGame(g) {
  const s = loadStats();
  s.games++;
  s.maxCombo = Math.max(s.maxCombo, g.maxCombo || 0);
  s.maxJackpot = Math.max(s.maxJackpot, g.maxJackpot || 0);
  s.bestScore = Math.max(s.bestScore, g.score || 0);
  s.playSec += Math.round(g.playSec || 0);
  s.wizards += g.wizards || 0;
  s.modes += g.modes || 0;
  save('stats', s);
  return s;
}

/* ---------------- nastavitve ---------------- */
const SETTINGS0 = { quality: 'auto', music: 0.6, sfx: 0.8, muted: false, fps: false };

export function loadSettings() {
  const v = load('settings', {});
  return Object.assign({}, SETTINGS0, typeof v === 'object' && v ? v : {});
}

export function saveSettings(s) { save('settings', s); }
