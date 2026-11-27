/* =====================================================================
   BOŽIČNA MIZA »Trije dobri možje« — konfiguracija (besedila, ravnotežje, paleta)
   Splošne fizikalne konstante so v ../../pinball/src/engine/config.js.
   ===================================================================== */

export const CFG = {
  naslov: 'BOŽIČNI PINBALL',
  verzija: 'Trije dobri možje',
  podnaslov: 'MIKLAVŽ · BOŽIČEK · DEDEK MRAZ',

  steviloZogic: 3,
  ballSaveSek: 10,            // ball save po izstrelitvi
  multiballSaveSek: 15,       // ball save ob začetku Darilnega multiballa
  comboOkno: 4,               // s med zaporednimi velikimi streli za combo

  skillShot: 150000,          // prva vrednost skill shota (Z·V·O·N kanal), vsakič +50.000
  skillShotKorak: 50000,
  superSkillShot: 1000000,    // zgornji flipper → zgornja zanka v 3 s
  superSkillOkno: 3,

  rampZaExtraBall: 10,        // po toliko rampah se v nabiralniku prižge extra ball
  jackpotZacetek: 500000,     // jackpot Darilnega multiballa (raste z vsakim zadetkom)
  locki: 3,                   // toliko zaklenjenih žogic v vreči → multiball

  // sporočila jedra (engine/game.js)
  sporocila: {
    start: ['TRIJE DOBRI MOŽJE', 'vesel december!', 'gold', 1.6],
    ball1: ['ŽOGA 1', null, 'ice', 3],
    ballN: ['ŽOGA {n}', '', 'ice', 1.8],
    shootAgain: ['ŠE ENA ŽOGA', 'darilo za pridne', 'orange', 2],
    ballSave: ['ANGELČEK', 'ball save — še enkrat!', 'white', 1.8],
    ballSearch: ['PARKELJ IŠČE', 'sproščam žogico', 'ice', 1.4],
    tilt: ['TILT', 'parklji so jezni', 'red', 3],
    tiltWarn: ['POZOR', 'opozorilo {n}/2', 'red', 1.2],
  },
};

/*
 * Legenda barv vstavkov (dosledno na celi mizi):
 * red = multiball / jackpot · gold = super jackpot in wizard · green = lock · orange = extra ball ·
 * violet = mystery (adventni koledar) · white = combo · barve dobrih mož (načini, prompt 24):
 * miklavz (modro-bela), bozicek (rdeča), mraz (modro-srebrna)
 */
export const PAL = {
  // ključi motorja (DEFAULT_PAL) — melt/meltHot so tu topla svetloba (ogenj v dimniku, okna)
  melt: '#ff9a3c', meltHot: '#ffd08a', cyan: '#8fdcff', code: '#4cf08a', gold: '#ffd166',
  magenta: '#c77dff', red: '#ff3b4a', white: '#f6fbff', steel: '#b9c6d6', bg: '#060b18',
  // božična paleta
  ice: '#8fdcff', snow: '#eef6ff', green: '#4cf08a', orange: '#ff9a3c', violet: '#c77dff',
  miklavz: '#9cc8ff', bozicek: '#ff4d5e', mraz: '#7fb2ff', silver: '#d9e4f2',
  night: '#0b1a3a', wood: '#7a3b1e', lacquer: '#b3122b', candy: '#ff2e4c',
};

/** imena strelov (enaka v UI, DMD, README, pomoči) */
export const SHOTS = {
  orbitL: 'Sankališče', vuk: 'Dimnik', rampL: 'Smučka', drops: 'Parklji', center: 'Jelka',
  rampR: 'Vlakec igrač', scoop: 'Pisma', orbitR: 'Desni orbit', kepa: 'Kepa', lanes: 'Z·V·O·N',
  pops: 'Snežaki', venec: 'Adventni venec',
};
