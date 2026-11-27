/* =====================================================================
   ALU MIZA — konfiguracija (imena, besedila, ravnotežje, paleta, misije)
   Splošne fizikalne konstante so v engine/config.js.
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

  steviloZogic: 3,
  ballSaveSek: 10,            // ball save po izstrelitvi
  multiballSaveSek: 15,
  wizardSaveSek: 20,
  comboOkno: 4,               // s med zaporednimi streli za combo
  rampZaMisijo: 3,            // koliko ramp prižge naslednjo misijo
  orbitZaExtraBall: 8,
  reviewZaMystery: 3,
  spinZaKickback: 50,
};

// sporočila jedra (engine/game.js) s Kadringom, R in R, Servisom
CFG.sporocila = {
  start: [CFG.imena.kadri + ': ZAPOSLEN!', 'dobrodošel v skupini Impol', 'code', 1.6],
  ballSave: [CFG.imena.ballSave, 'ball save — še enkrat!', 'cyan', 1.8],
  ballSearch: [CFG.imena.servis, 'na poti — sproščam žogico', 'cyan', 1.4],
};

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

