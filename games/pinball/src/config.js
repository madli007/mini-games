/* =====================================================================
   ALU PINBALL 2.0 — konfiguracija
   Spremeni po želji: imena, število žogic, ravnotežje igre.
   ===================================================================== */

export const CFG = {
  naslov: 'ALU PINBALL',
  verzija: '2.0',
  podnaslov: 'SKUPINA IMPOL × ALCAD edition',
  firmaA: 'IMPOL',            // industrija: livarna, valjarna, iztiskovanje
  firmaB: 'ALCAD',            // programiranje: bugi, hotfix, sprint
  opomba: 'Igra za hec. Imena in logotipi so uporabljeni z dovoljenjem.',
  logotipi: true,             // false = povsod tekst namesto logotipov (assets/logos/)

  // prava podjetja skupine Impol in Alcad na mizi (glej PREDLOGI-FIRME.md)
  imena: {
    scoop: 'IMPOL LLT', scoopKaj: 'LIVARNA',          // scoop: livarna
    ramp: 'IMPOL PCP', rampKaj: 'STISKALNICA',        // rampa: iztiskovanje
    orbit: 'IMPOL FT', orbitKaj: 'VALJARNA',          // levi orbit + spinner: valjanje folije
    sling: 'STAMPAL SB',                              // slingshota in kickback: kovačija
    extraBall: 'RONDELA',                             // Rondal: rondele
    ballSave: 'IMPOL R in R',                         // razvoj
    servis: 'IMPOL SERVIS',                           // ball search
    kadri: 'KADRING',                                 // HR: začetek igre, bonus
    mystery: 'ALCLOUD',                               // Alcad
    bumperji: ['IMPOL', 'IMPOL SEVAL', 'IMPOL-TLM'],  // Slovenska Bistrica, Sevojno (Srbija), Šibenik (Hrvaška)
    lock: ['IMPOL SEVAL', 'IMPOL-TLM'],
    superJackpot: 'NEW YORK',                         // Impol Aluminum Corp.
    podjetja: 'LLT · PCP · FT · STAMPAL SB · RONDAL · SEVAL · TLM · ALCAD',
  },
  skillShot: 182500,          // »od 1825«

  // skupna lestvica (Supabase; tabela in pravila: supabase/scores.sql).
  // Ključ je javni »publishable« ključ — zaščito zagotavljajo pravila v bazi.
  // Prazen url = samo lokalna lestvica (localStorage).
  lestvica: {
    url: 'https://ygdjxwchjfvzigasmayg.supabase.co',
    kljuc: 'sb_publishable_tIyU-rppDYcHt6AxIu9ahA_P1ofVudB',
  },

  steviloZogic: 3,
  ballSaveSek: 10,            // ball save po izstrelitvi
  multiballSaveSek: 15,
  wizardSaveSek: 20,
  comboOkno: 4,               // s med zaporednimi streli za combo
  rampZaMisijo: 3,            // koliko ramp prižge naslednjo misijo
  orbitZaExtraBall: 8,
  reviewZaMystery: 3,
  spinZaKickback: 25,
};

// logične dimenzije mize in fizika (uglašeno — previdno!)
export const W = 600, H = 1000;
export const BR = 10;               // polmer žogice
export const GRAV = 1900;           // px/s²
export const MAXV = 3400;           // px/s
export const STEP = 1 / 720;        // korak fizike (12 substepov / frame pri 60 fps)
export const TAU = Math.PI * 2;

// barvna paleta (ena za celo igro)
export const PAL = {
  melt: '#ff7a1a',
  meltHot: '#ffc46b',
  cyan: '#6fd3ff',
  code: '#39ff88',
  gold: '#ffd23f',
  magenta: '#ff4fd8',
  red: '#ff3b4a',
  white: '#f4f8ff',
  steel: '#9aa8b8',
  impol: '#004282',           // Impolova modra (iz logotipa)
  bg: '#05070b',
};

// misije (modi). Začnejo se v talilnici, ko je misija prižgana.
export const MODES = [
  {
    id: 'talina', ime: 'LIVARNA', polno: 'LLT: LIVARNA', firma: 'A', barva: PAL.melt, cas: 40, cilj: 12, nagrada: 750000,
    opis: 'Zadeni bumperje 12× v 40 s — Impol LLT lije drogove',
  },
  {
    id: 'valjarna', ime: 'FOLIJA', polno: 'FT: FOLIJA', firma: 'A', barva: PAL.cyan, cas: 45, cilj: 50, nagrada: 750000,
    opis: 'Navij 50 m folije za Impol FT: spinner in orbit',
  },
  {
    id: 'hotfix', ime: 'HOTFIX', polno: 'ALCAD HOTFIX', firma: 'B', barva: PAL.red, cas: 30, zacetek: 2000000,
    opis: 'Zadeni rampo, preden vrednost pade na nič',
  },
  {
    id: 'sprint', ime: 'SPRINT', polno: 'ALCAD SPRINT', firma: 'B', barva: PAL.code, cas: 60, cilj: 5, nagrada: 1000000,
    opis: 'Zadeni vseh 5 označenih strelov, preden se sprint izteče',
  },
];

// nastavitve kakovosti izrisa
export const QUALITY = {
  low:   { ime: 'Nizka',   dprCap: 1,   scale: 0.7, bloom: 0, emi: 0,    heat: false, ca: false, motion: false, particles: 0.4 },
  med:   { ime: 'Srednja', dprCap: 1,   scale: 1,   bloom: 3, emi: 0.35, heat: true,  ca: false, motion: false, particles: 0.7 },
  high:  { ime: 'Visoka',  dprCap: 1.5, scale: 1,   bloom: 5, emi: 0.5,  heat: true,  ca: true,  motion: true,  particles: 1 },
  ultra: { ime: 'Ultra',   dprCap: 2,   scale: 1,   bloom: 6, emi: 0.6,  heat: true,  ca: true,  motion: true,  particles: 1.5 },
};
export const QUALITY_ORDER = ['low', 'med', 'high', 'ultra'];
