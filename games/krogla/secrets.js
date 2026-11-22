/* =====================================================================
   HRČKOVA KROGLA — secrets.js: skrite ključavnice (odklenejo skrivne arene v Rušilcu).
   Ključavnica je komaj vidna pobiralka na stranski poti, ki ni na glavni poti (route).
   Je zunaj fizike in JSON-a proge: ne vpliva na čas, medalje, ghoste, autopilot ali rešljivost.
   Pobrana (v kateremkoli načinu) → dosežek krogla:kljucavnica-<arena> (velja na vseh napravah).
   ===================================================================== */

/** id proge → ključavnice. x, z sta v koordinatah nezrcaljene proge. */
export const SECRETS = {
  '10-neon': [{ arena: '07-vrtiljak', name: 'Vrtiljak', x: 8.5, z: 31.5 }],
  '11-nebo': [{ arena: '08-oblak', name: 'Oblak', x: 1.5, z: 26.5 }],
};

/** Ključ dosežka v Hrčkovi krogli za areno (npr. 'kljucavnica-vrtiljak'). */
export const lockKey = arenaId => 'kljucavnica-' + String(arenaId).replace(/^\d+-/, '');

/** Ključavnice na progi (upošteva zrcaljenje). */
export function secretsFor(L) {
  const base = String(L.id || '').replace(/-m$/, '');
  return (SECRETS[base] || []).map(s => ({ ...s, x: L.mirror ? L.size[0] - s.x : s.x }));
}

/** Ali se krogla dotika ključavnice s (vodoravno 0,55, navpično 1). */
export function touches(s, b, groundY) {
  return (b.x - s.x) ** 2 + (b.z - s.z) ** 2 < 0.55 ** 2 && (!Number.isFinite(groundY) || Math.abs(b.y - b.r - groundY) < 1);
}
