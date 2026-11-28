/* =====================================================================
   GNEČA — balance.js: vse številke igre na enem mestu (brez DOM-a).
   Enote: dolžina v enotah steze (1 enota ≈ 1 m), čas v sekundah.
   Koordinate simulacije: x levo–desno (0 = sredina steze), z od mojega
   topa (z = 0) proti sovražnemu stolpu (z = dolžina steze).
   ===================================================================== */

export const B = {
  hz: 60,                    // fiksni korak simulacije
  dt: 1 / 60,

  /** Privzete mere steze (nivo jih lahko povozi). */
  lane: { length: 60, width: 10, time: 90 },

  cannon: {
    z: 0.9,                  // kje nastanejo moji tekači
    speed: 22,               // največja hitrost premika topa (enot/s)
    fireRate: 8,             // tekačev na sekundo (osnovno, brez nadgradenj)
    spread: 0.45,            // naključni odmik ob strelu (levo-desno)
    pairGap: 0.32,           // razmik pri širšem topu (2 tekača naenkrat)
  },

  runner: {
    speed: 6,                // moji tekači
    radius: 0.26,
    maxMergedRadius: 0.62,   // združen tekač je večji, a ne čez to mejo
  },
  enemy: { speed: 4.2, radius: 0.26 },

  /** Ločevanje (odrivanje) znotraj iste strani. */
  separation: { dist: 1.15, strength: 5.5, maxPush: 2.5 },
  /** Privlačnost: tekač zavije (levo-desno) k najbližjemu nasprotniku pred sabo v dosegu. */
  attract: { enemy: { range: 4.5, speed: 2.6 }, mine: { range: 2.2, speed: 1.2 } },

  giant: {
    charge: 40,              // koliko izstreljenih tekačev napolni merilec
    hp: 30,
    speed: 3.2,
    radius: 0.75,
    towerDamage: 10,         // škoda sovražnemu stolpu
    turretDamage: 10,
  },
  enemyGiant: { hp: 25, speed: 2.4, radius: 0.75, breach: 5 },

  gate: { depth: 0.6, jitter: 0.35 },

  /** Ovire: valjar in žaga ubijeta moje tekače (velikan je imun), ograja odriva. */
  obstacle: { rollerDepth: 1.0, sawRadius: 0.9 },

  turret: { hp: 12, rate: 2, range: 6.5, radius: 0.65, damage: 1 },

  tower: { hp: 200, reach: 0.7 },

  /** Poraz: toliko sovražnikov (velikan šteje 5) mora priti do mojega topa. */
  breachMax: 5,
  breachZ: 0.45,

  /** Meja živih tekačev na stran; nad njo se novi tekači združujejo v obstoječe (hp se sešteje). */
  cap: 600,
  alloc: 1600,               // velikost tipiziranih polj (debug drsnik meje gre do 1500)

  /** Najvišji polmer, ki ga upošteva mreža trkov pri iskanju sosedov. */
  maxRadius: 0.8,
  gridCell: 1,

  /** Točke (score.js). */
  score: { win: 1000, perSecondLeft: 20, perKill: 1, killsMax: 800, tower: 500, perLost: 2, lostMax: 600 },   // tower: največ toliko za cel podrt stolp (sorazmerno)

  /** Zobniki (valuta delavnice). */
  gears: { perStar: 12, perWin: 4, perDaily: 10 },

  /** Fiksne nadgradnje dnevnega nivoja (vsi enako, poštena lestvica). */
  dailyUpgrades: { rate: 2, bonus: 1, charge: 2, giantHp: 2, width: 0 },
};

/** Polmer tekača glede na hp (združeni tekači so večji). */
export function runnerRadius(hp, base = B.runner.radius) {
  if (hp <= 1) return base;
  return Math.min(B.runner.maxMergedRadius, base * (1 + 0.28 * Math.log2(hp)));
}
