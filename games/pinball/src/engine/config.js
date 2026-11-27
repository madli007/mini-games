/* =====================================================================
   MOTOR — splošne konstante (enake za vse mize)
   Fizika, dimenzije, kakovost izrisa in privzeta paleta.
   Posebnosti mize (imena, misije, barve) so v tables/<id>/config.js.
   ===================================================================== */

// verzija fizike: poveča se ob vsaki namerni spremembi fizike (zlati test, lestvica po verziji)
export const PHYSICS_VERSION = 1;

// logične dimenzije mize in fizika (uglašeno — previdno!)
export const W = 600, H = 1000;
export const BR = 10;               // polmer žogice
export const GRAV = 1900;           // px/s²
export const MAXV = 3400;           // px/s
export const STEP = 1 / 720;        // korak fizike (12 substepov / frame pri 60 fps)
export const TAU = Math.PI * 2;

/**
 * Nastavljivi parametri fizike (drsniki v ?debug=1). Privzete vrednosti so uglašene;
 * PHYS_DEFAULT je kopija za ponastavitev in primerjavo.
 */
export const PHYS = {
  grav: GRAV,            // naklon mize (gravitacija vzdolž mize), px/s²
  flipUp: 38,            // hitrost flipperja navzgor, rad/s
  flipDown: 18,          // hitrost vračanja, rad/s
  flipE: 0.32,           // elastičnost gume flipperja
  rubberK: 1,            // množitelj elastičnosti gum (slingi, gumijasti drogovi, odbojniki)
  friction: 0.06,        // Coulombovo trenje ob trku
  sling: 900,            // impulz slingshota, px/s
  bumper: 1100,          // najmanjša hitrost odboja od pop bumperja, px/s
  ballSave: null,        // povozi čas ball save (s); null = vrednost mize
};
export const PHYS_DEFAULT = Object.freeze({ ...PHYS });

// privzeta paleta (vsaka miza jo lahko povozi; ključi so del vmesnika motorja)
export const DEFAULT_PAL = {
  melt: '#ff7a1a', meltHot: '#ffc46b', cyan: '#6fd3ff', code: '#39ff88', gold: '#ffd23f',
  magenta: '#ff4fd8', red: '#ff3b4a', white: '#f4f8ff', steel: '#9aa8b8', bg: '#05070b',
};

// nastavitve kakovosti izrisa
export const QUALITY = {
  low:   { ime: 'Nizka',   dprCap: 1,   scale: 0.7, bloom: 0, emi: 0,    heat: false, ca: false, motion: false, particles: 0.4 },
  med:   { ime: 'Srednja', dprCap: 1,   scale: 1,   bloom: 3, emi: 0.35, heat: true,  ca: false, motion: false, particles: 0.7 },
  high:  { ime: 'Visoka',  dprCap: 1.5, scale: 1,   bloom: 5, emi: 0.5,  heat: true,  ca: true,  motion: true,  particles: 1 },
  ultra: { ime: 'Ultra',   dprCap: 2,   scale: 1,   bloom: 6, emi: 0.6,  heat: true,  ca: true,  motion: true,  particles: 1.5 },
};
export const QUALITY_ORDER = ['low', 'med', 'high', 'ultra'];

export const fmt = n => Math.round(n).toLocaleString('sl-SI');
