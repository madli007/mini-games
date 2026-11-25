// Smučarski skoki — prave skakalnice: iz parametrov FIS-ovih certifikatov zgradi games/skoki/hills/<id>.json (brez npm).
// Zagon: node tools/skoki-real-hills.mjs [--check] [--search] [--only=<id>] [n=50]
//   --search  znova poišči privzeto mesto in parametre fizike (sicer uporabi TUNE)
//   --check   le izpiše prileganje profila (h/n v K-točki) in bota, ne piše datotek
//
// Vir: certifikati skakalnic (FIS, Sub-Committee for Jumping Hills), javno objavljeni kot PDF na skisprungschanzen.com
// (povezava v real.source). Številke spodaj so PREPISANE s certifikatov (leto = datum izdaje). Kar model nima ali je
// izpeljano, je opisano v games/skoki/README.md (»Prave skakalnice«) in PROGRESS.md:
//   inrun.e2       = (e1 − es) − t − r1·(γ − α)   (razdalja najnižjega zaletnega mesta nad koncem prehoda)
//   gates.spacing  = es / (število mest − 1)
//   r1             = pri spremenljivem radiju (»225–130«, »140/107«) povprečje; kubična parabola → 0,14·v0² (FIS norma)
//   landing.beta   = βP (naklon v P), landing.betaL = βL (naklon v L), med njima lok (rL) — enakomerna sprememba naklona
//   landing.pArc   = P, landing.lArc = L (= HS), r2 = r2 (klotoida → najmanjši radij), outrunLength = a
//   landing.b0     = IZPELJANO: začetni naklon grbine, prilagojen tako, da K-točka leži na višini h pod robom (certifikat h/n)
//   gates.default, gateFactor = IZBRANO z botom (spretnost 0,7 pristane okoli K), metri na mesto × vrednost metra
import { readFile, writeFile } from 'node:fs/promises';
import { buildHill, validateHill, meterValueFor, baseFor, windFactorsFor } from '../games/skoki/hill.js';
import { balanceRow, meetsTarget } from '../games/skoki/balance.js';
import { DEG } from '../games/skoki/dmath.js';

const root = new URL('../games/skoki/', import.meta.url);
const P = JSON.parse(await readFile(new URL('physics-params.json', root), 'utf8'));
const CHECK = process.argv.includes('--check');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const N = parseInt(process.argv.find(a => /^\d+$/.test(a)), 10) || 50;
const SRC = 'https://www.skisprungschanzen.com/photos/';

/* ------------------------------------------------------------ certifikati (prepis) */
// e1: dolžina zaleta od najvišjega mesta do roba, es: razdalja med najvišjim in najnižjim mestom, gates: število mest,
// t, γ, α, r1, h, n, s; P, K, L; βP, β (v K), βL, rL, r2, a (iztek), out: naklon izteka (+ navzdol, »sloping up« = 0)
const CERTS = [
  { id: 'planica-srednja', name: 'Planica, srednja', venue: 'Planica', country: 'SLO', size: 'srednja', year: 2023, file: 'slo/planica_velikanka/HS102_2023.pdf',
    e1: 94.9, es: 20.85, gates: 34, t: 6.4, gamma: 34.0, alpha: 11.0, r1: 90, h: 45.87, n: 82.65, s: 2.40,
    P: 85, K: 95, L: 102, bP: 35.65, bK: 35.17, bL: 30.91, rL: 230, r2: 101, a: 96.15, out: 0, record: { dist: 105.0, year: 2023 } },
  { id: 'planica-velika', name: 'Planica, velika', venue: 'Planica', country: 'SLO', size: 'velika', year: 2023, file: 'slo/planica_velikanka/HS138_2023.pdf',
    e1: 103.4, es: 19.7, gates: 27, t: 6.7, gamma: 35.3, alpha: 10.6, r1: 101, h: 62.40, n: 107.59, s: 3.40,
    P: 109, K: 125, L: 138, bP: 36.55, bK: 33.55, bL: 30.91, rL: 305, r2: 101, a: 97.7, out: 0, record: { dist: 142.0, year: 2014 } },
  { id: 'oberstdorf', name: 'Oberstdorf', venue: 'Oberstdorf', country: 'GER', size: 'velika', year: 2022, file: 'ger/oberstdorf_arena/HS137_2022.pdf',
    e1: 106, es: 27, gates: 54, t: 6.5, gamma: 35, alpha: 11.0, r1: 115, h: 59.52, n: 103.51, s: 3.38,
    P: 108.85, K: 120, L: 137, bP: 37.43, bK: 35.5, bL: 33.56, rL: 321, r2: 100, a: 95, out: 0, record: { dist: 143.5, year: 2003 } },
  { id: 'garmisch', name: 'Garmisch-Partenkirchen', venue: 'Garmisch-Partenkirchen', country: 'GER', size: 'velika', year: 2022, file: 'ger/garmischpartenkirchen_olympia/HS142_2022.pdf',
    e1: 96, es: 24, gates: 49, t: 6.9, gamma: 35, alpha: 11, r1: 103, h: 62.32, n: 107.64, s: 3.20,
    P: 110.35, K: 125, L: 142, bP: 37.2, bK: 34.7, bL: 31.7, rL: 335, r2: 114.5, a: 100, out: 0, record: { dist: 145.5, year: 2025 } },
  { id: 'innsbruck', name: 'Innsbruck', venue: 'Innsbruck', country: 'AUT', size: 'velika', year: 2024, file: 'aut/innsbruck/HS128_2024.pdf',
    e1: 96.4, es: 20.1, gates: 34, t: 6.5, gamma: 35, alpha: 10.75, r1: 100, h: 59.85, n: 103.32, s: 3.08,
    P: 109, K: 120, L: 128, bP: 36.6, bK: 34.5, bL: 30.2, rL: 240, r2: 100, a: 67, out: 0, record: { dist: 138.0, year: 2015 } },
  { id: 'bischofshofen', name: 'Bischofshofen', venue: 'Bischofshofen', country: 'AUT', size: 'velika', year: 2023, file: 'aut/bischofshofen/HS142_2023.pdf',
    e1: 123.85, es: 21.7, gates: 47, t: 6.5, gamma: 27, alpha: 11, r1: null, v0: 26.2, h: 62.36, n: 107.61, s: 4.50,
    P: 110.7, K: 125, L: 142, bP: 37.5, bK: 35.8, bL: 31.6, rL: 335, r2: 115, a: 91, out: 0, record: { dist: 145.0, year: 2019 } },
  { id: 'zakopane', name: 'Zakopane', venue: 'Zakopane', country: 'POL', size: 'velika', year: 2022, file: 'pol/zakopane_wielka/HS140_2022.pdf',
    e1: 97.8, es: 20.8, gates: 34, t: 6.5, gamma: 35, alpha: 11, r1: 90, h: 62.37, n: 107.76, s: 3.13,
    P: 109, K: 125, L: 140, bP: 37, bK: 34.3, bL: 31.3, rL: 310, r2: 99.3, a: 103, out: 0, record: { dist: 147.0, year: 2020 } },
  { id: 'willingen', name: 'Willingen', venue: 'Willingen', country: 'GER', size: 'velika', year: 2025, file: 'ger/willingen_muehlenkopf/HS147_2025.pdf',
    e1: 101.9, es: 23.6, gates: 44, t: 6.7, gamma: 35, alpha: 11, r1: 105, h: 65.73, n: 111.43, s: 3.25,
    P: 111.79, K: 130, L: 147, bP: 38, bK: 34.6, bL: 32, rL: 347, r2: 108, a: 138, out: 0, record: { dist: 155.5, year: 2024 } },
  { id: 'lahti', name: 'Lahti', venue: 'Lahti', country: 'FIN', size: 'velika', year: 2022, file: 'fin/lahti/HS130_2022.pdf',
    e1: 89.9, es: 16.75, gates: 27, t: 6.45, gamma: 38.6, alpha: 10.5, r1: 95.55, h: 56.6, n: 100.7, s: 3.41,
    P: 100, K: 116, L: 130, bP: 37.7, bK: 34.7, bL: 32.2, rL: 305.8, r2: 92.87, a: 83, out: 0, record: { dist: 138.0, year: 2017 } },
  { id: 'engelberg', name: 'Engelberg', venue: 'Engelberg', country: 'SUI', size: 'velika', year: 2021, file: 'sui/engelberg/HS140_2021.pdf',
    e1: 99, es: 22, gates: 32, t: 7, gamma: 36, alpha: 11, r1: 101.1, h: 62.5, n: 107.5, s: 3.15,
    P: 108.8, K: 125, L: 140, bP: 37.8, bK: 34.8, bL: 32.2, rL: 310, r2: 105, a: 90, out: 0, record: { dist: 145.0, year: 2025 } },
  { id: 'planica-letalnica', name: 'Planica, letalnica', venue: 'Planica', country: 'SLO', size: 'letalnica', year: 2026, file: 'slo/planica_letalnica/HS240_2026.pdf',
    e1: 124.7, es: 28.1, gates: 30, t: 8.55, gamma: 35, alpha: 11.5, r1: 130, h: 102, n: 170.45, s: 3.55,
    P: 183, K: 200, L: 240, bP: 35.9, bK: 33.4, bL: 28.7, rL: 700, r2: 100, a: 128, out: 4.5, record: { dist: 254.5, year: 2025 } },
  { id: 'kulm', name: 'Kulm', venue: 'Tauplitz / Bad Mitterndorf', country: 'AUT', size: 'letalnica', year: 2025, file: 'aut/badmitterndorf_tauplitz/HS235_2025.pdf',
    e1: 120.4, es: 29.1, gates: 45, t: 8.0, gamma: 35.3, alpha: 11.3, r1: [140, 107], h: 103.2, n: 170.91, s: 3.50,
    P: 166.2, K: 200, L: 235, bP: 37.2, bK: 33.5, bL: 29.6, rL: 490, r2: 105, a: 110, out: 4, record: { dist: 245.5, year: 2026 } },
  { id: 'vikersund', name: 'Vikersund', venue: 'Vikersund', country: 'NOR', size: 'letalnica', year: 2022, file: 'nor/vikersund_skiflyging/HS240_2022.pdf',
    e1: 128.9, es: 34.89, gates: 42, t: 8, gamma: 36, alpha: 11, r1: [142, 100], h: 102.24, n: 170.47, s: 2.64,
    P: 165, K: 200, L: 240, bP: 38, bK: 34, bL: 28, rL: 454, r2: 109, a: 116.5, out: 5, record: { dist: 253.5, year: 2017 } },
  { id: 'oberstdorf-letalnica', name: 'Oberstdorf, letalnica', venue: 'Oberstdorf', country: 'GER', size: 'letalnica', year: 2023, file: 'ger/oberstdorf_flug/HS235_2023.pdf',
    e1: 118, es: 24, gates: 49, t: 8.5, gamma: 38.7, alpha: 11.2, r1: [225, 130], h: 103.1, n: 170.3, s: 3.40,
    P: 171, K: 200, L: 235, bP: 36.9, bK: 33.9, bL: 31.4, rL: 500, r2: 100, a: 88, out: 0, record: { dist: 242.5, year: 2022 } },
];

/* ------------------------------------------------------------ izbrane nastavitve (iz iskanja: node tools/skoki-real-hills.mjs --search) */
// g = privzeto zaletno mesto, lift = physics.liftScale, tw = physics.takeoffWindow, push = physics.pushScale
const TUNE = {"planica-srednja":{g: 4, lift: 1.12, tw: 1, push: 1}, "planica-velika":{g: 5, lift: 1.12, tw: 1, push: 1}, oberstdorf: {g: 36, lift: 0.98, tw: 1, push: 1}, garmisch: {g: 34, lift: 1.1, tw: 1, push: 1}, innsbruck: {g: 5, lift: 1.22, tw: 1, push: 1}, bischofshofen: {g: 4, lift: 1.08, tw: 1, push: 1}, zakopane: {g: 11, lift: 1.14, tw: 1, push: 1}, willingen: {g: 19, lift: 1.1, tw: 1, push: 1}, lahti: {g: 19, lift: 1.06, tw: 1, push: 1}, engelberg: {g: 16, lift: 1.08, tw: 1, push: 1}, "planica-letalnica":{g: 17, lift: 1.14, tw: 1, push: 1}, kulm: {g: 32, lift: 1.1, tw: 1, push: 1}, vikersund: {g: 11, lift: 1.18, tw: 1, push: 1}, "oberstdorf-letalnica":{g: 47, lift: 1.12, tw: 1, push: 1}};

/* ------------------------------------------------------------ odklepi, teme, opisi */
// vse prave skakalnice so od začetka odprte (prej verige odklepov; napredek zdaj kažejo dosežki in oznake na karticah)
const UNLOCK = {};

const sky = (zenith, horizon, ground, sun, sunColor, clouds) => ({ sun, zenith, horizon, ground, sunColor, clouds });
const THEMES = {
  'planica-srednja': { label: 'Sončen marec pod Poncami', sky: sky('#2a6fd8', '#d4ecff', '#a9bccd', [160, 40], '#fff6e2', 0.25), fog: ['#d6e6f4', 0.0018], sun: 2.9, hemi: ['#cfe6ff', '#7c8a74', 0.65], tint: [1, 1.01, 1], env: 'gore', trees: 1.2, crowd: 1.2, snow: 0, mountains: 1.9, spring: 1, boards: ['MINI GAMES', 'Dolina pod Poncami', 'Herodle', 'Skok v pomlad'], desc: 'Srednja skakalnica v dolini pod strmimi stenami. Krajši zalet, nizek let — dobra za začetek na pravih profilih.' },
  'planica-velika': { label: 'Pomladno popoldne v dolini', sky: sky('#2b6ad0', '#e3f0ff', '#aab8c6', [200, 30], '#fff1d6', 0.35), fog: ['#dbe7f2', 0.0017], sun: 2.8, hemi: ['#d4e8ff', '#7a8670', 0.65], tint: [1.02, 1, 0.98], env: 'gore', trees: 1.2, crowd: 1.5, snow: 0, mountains: 2.0, spring: 1, boards: ['MINI GAMES', 'Velika v dolini', 'Rušilec', 'Pod stenami'], desc: 'Velika skakalnica tik ob letalnici. Strme stene doline, pomladni sneg, glasna domača publika.' },
  oberstdorf: { label: 'Mrzel večer v Allgäuju', sky: sky('#1c2a5c', '#ff9f6a', '#59607a', [12, 4], '#ff8f55', 0.45), fog: ['#a88a8a', 0.0028], sun: 2.2, hemi: ['#8ea0d8', '#4e4458', 0.7], tint: [1.04, 0.98, 0.97], env: 'gore', trees: 1, crowd: 1.6, snow: 0.25, mountains: 1.3, boards: ['MINI GAMES', 'Prva postaja', 'Herodle', 'Zimski večer'], desc: 'Prva postaja turneje štirih skakalnic. Mrzel večer, sonce zahaja za grebeni, polne tribune.' },
  garmisch: { label: 'Novoletno sonce pod visokimi vrhovi', sky: sky('#2c66c8', '#dceaff', '#b6c2d0', [150, 22], '#fff4dd', 0.2), fog: ['#d8e3ef', 0.0018], sun: 3.0, hemi: ['#d6e6ff', '#6a7482', 0.68], tint: [1, 1, 1.02], env: 'gore', trees: 1.1, crowd: 1.7, snow: 0, mountains: 2.1, boards: ['MINI GAMES', 'Novo leto', 'Rušilec', 'Srečno!'], desc: 'Novoletna tekma pod najvišjimi vrhovi. Kratek zalet, strma miza, dolg let nad stadionom.' },
  innsbruck: { label: 'Mesto pod skakalnico', sky: sky('#2f5fae', '#f0d8b8', '#8c8f9e', [205, 14], '#ffd9a0', 0.3), fog: ['#c9b8a6', 0.0022], sun: 2.4, hemi: ['#b8c8e8', '#6a5e58', 0.7], tint: [1.04, 1, 0.96], env: 'gore', trees: 0.6, crowd: 1.3, snow: 0.1, mountains: 1.6, town: 1, boards: ['MINI GAMES', 'Nad mestom', 'Herodle', 'Tretja postaja'], desc: 'Skakalnica nad mestom: iztek se konča tik nad strehami. Kratko doskočišče, HS je blizu — pristani pravočasno.' },
  bischofshofen: { label: 'Večerni finale pod reflektorji', sky: sky('#070b22', '#18224a', '#0e1228', [200, 32], '#9fb6ff', 0.15), fog: ['#1a2244', 0.004], sun: 0.55, hemi: ['#4a5a9a', '#141828', 0.42], tint: [0.96, 0.98, 1.08], env: 'noc', trees: 0.9, crowd: 1.6, snow: 0.35, mountains: 0.8, spotlights: 8, phoneLights: 1, stars: 0.6, boards: ['MINI GAMES', 'Finale turneje', 'Rušilec', 'Zadnji skok'], desc: 'Zadnja postaja turneje. Najdaljši zalet med velikimi (položen, 27°), večer pod reflektorji, sneg v žarkih.' },
  zakopane: { label: 'Zima pod Tatrami, morje navijačev', sky: sky('#2a5ec0', '#e6eef8', '#b9c2cf', [170, 18], '#fff2dc', 0.4), fog: ['#d9e1ec', 0.0022], sun: 2.6, hemi: ['#d0dcf4', '#6e6a6a', 0.68], tint: [1, 1, 1.02], env: 'gore', trees: 1.3, crowd: 2.2, snow: 0.3, mountains: 1.5, town: 0.6, boards: ['MINI GAMES', 'Pod Tatrami', 'Herodle', 'Glasno!'], desc: 'Velika skakalnica pod Tatrami in največja množica sezone. Tribune pojejo od prvega do zadnjega skoka.' },
  willingen: { label: 'Vetrovno gričevje, megla v gozdu', sky: sky('#5d7290', '#c8d2dc', '#8f9aa6', [160, 16], '#f2efe6', 0.85), fog: ['#b9c3cd', 0.0034], sun: 1.8, hemi: ['#b6c4d4', '#5a6252', 0.75], tint: [0.98, 1, 1.02], env: 'gozd', trees: 1.6, crowd: 1.4, snow: 0.2, mountains: 0.25, boards: ['MINI GAMES', 'Največja velika', 'Rušilec', 'Pazi, veter!'], desc: 'Največja velika skakalnica sredi gozdnatega gričevja. Dolg let, veter pa rad obrne smer.' },
  lahti: { label: 'Nizko severno sonce nad jezerom', sky: sky('#2e5a9e', '#ffd9b0', '#9aa6b4', [190, 8], '#ffd29a', 0.25), fog: ['#d8c8b8', 0.0022], sun: 2.2, hemi: ['#c4d2ec', '#5e6a60', 0.7], tint: [1.03, 1, 0.98], env: 'jezero', trees: 1.4, crowd: 1, snow: 0.1, mountains: 0.15, boards: ['MINI GAMES', 'Sever', 'Herodle', 'Jezero'], desc: 'Strm zalet (38,6°) nad ravnino in jezeri. Nizko sonce, breze in smreke, mraz.' },
  engelberg: { label: 'Decembrski sneg pod ledeniki', sky: sky('#355fa8', '#dfe8f2', '#b5bfca', [140, 16], '#fff0d8', 0.55), fog: ['#d4dde8', 0.0024], sun: 2.3, hemi: ['#d0dcf0', '#646c76', 0.7], tint: [0.99, 1, 1.03], env: 'gore', trees: 1, crowd: 1.1, snow: 0.45, mountains: 2.2, boards: ['MINI GAMES', 'Pred božičem', 'Rušilec', 'Ledenik'], desc: 'Velika skakalnica pod ledeniki, tik pred prazniki. Sneži, gore so na dosegu roke.' },
  'planica-letalnica': { label: 'Marčni finale, polna dolina', sky: sky('#2a6cd4', '#d8ecff', '#a2b4c4', [175, 44], '#fff6e6', 0.25), fog: ['#d2e3f2', 0.0015], sun: 3.0, hemi: ['#cfe6ff', '#7a8a70', 0.65], tint: [1, 1.02, 1], env: 'gore', trees: 1.2, crowd: 2.2, snow: 0, mountains: 2.0, spring: 1, boards: ['MINI GAMES', 'Finale sezone', 'Polet', 'Herodle', 'Dolina letenja'], desc: 'Letalnica v dolini pod stenami: finale pokala. Dolgo, ravno jadranje nad doskočiščem, ki se položi šele daleč spodaj.' },
  kulm: { label: 'Zimsko sonce nad gozdnatim pobočjem', sky: sky('#2d62c2', '#e2ecf8', '#b2bcc8', [130, 26], '#fff3dc', 0.3), fog: ['#d6e0ec', 0.0018], sun: 2.8, hemi: ['#d2e0f6', '#5c6a58', 0.68], tint: [1, 1, 1.02], env: 'gozd', trees: 1.5, crowd: 1.6, snow: 0.1, mountains: 1.3, boards: ['MINI GAMES', 'Letenje nad gozdom', 'Rušilec', 'Kulm'], desc: 'Letalnica, ki sledi naravnemu pobočju: doskočišče je bolj zavito, grbina dvigne let visoko nad sneg.' },
  vikersund: { label: 'Večer ob fjordu pod lučmi', sky: sky('#14214a', '#e48a5a', '#3e4560', [20, 2], '#ff9a60', 0.35), fog: ['#8c7d86', 0.0024], sun: 1.6, hemi: ['#7c8cc4', '#3c3a4a', 0.6], tint: [1.03, 0.98, 1], env: 'jezero', trees: 1.3, crowd: 1.6, snow: 0.15, mountains: 0.6, spotlights: 6, boards: ['MINI GAMES', 'Ob fjordu', 'Polet', 'Herodle'], desc: 'Letalnica nad jezerom, prva z reflektorji. Strm zalet, strmo doskočišče — najdaljši poleti sezone.' },
  'oberstdorf-letalnica': { label: 'Ozka dolina, strme stene', sky: sky('#2b5fbe', '#dbe8f6', '#a8b4c2', [150, 30], '#fff2da', 0.35), fog: ['#d2deea', 0.0019], sun: 2.7, hemi: ['#cfe0f8', '#66705e', 0.66], tint: [1, 1, 1.02], env: 'gore', trees: 1.3, crowd: 1.3, snow: 0.1, mountains: 1.8, boards: ['MINI GAMES', 'Med stenami', 'Polet', 'Rušilec'], desc: 'Letalnica v ozki stranski dolini. Najstrmejši zalet (38,7°) in kratek, navzgor nagnjen iztek.' },
};

function themeOf(c) {
  const T = THEMES[c.id];
  const out = {
    id: c.id + '-tema', label: T.label, sky: { ...T.sky, ...(T.stars ? { stars: T.stars } : {}) },
    fog: { color: T.fog[0], density: T.fog[1] }, sunIntensity: T.sun, hemi: T.hemi,
    bloom: T.env === 'noc' ? [0.85, 0.5, 0.78] : [0.32, 0.52, 0.98],
    grade: { tint: T.tint, sat: 1.1, vignette: T.env === 'noc' ? 0.42 : 0.3 },
    env: T.env, trees: T.trees, crowd: T.crowd, snowfall: T.snow, mountains: T.mountains, boards: T.boards,
  };
  for (const k of ['spring', 'spotlights', 'phoneLights', 'town']) if (T[k] != null) out[k] = T[k];
  return out;
}

/* ------------------------------------------------------------ certifikat → JSON */
const r1Of = c => Array.isArray(c.r1) ? (c.r1[0] + c.r1[1]) / 2 : c.r1 ?? Math.round(0.14 * c.v0 * c.v0 * 10) / 10;
const r2d = v => Math.round(v * 100) / 100;

const range = (a, b, st) => Array.from({ length: Math.round((b - a) / st) + 1 }, (_, i) => Math.round((a + i * st) * 1000) / 1000);
const LIFTS = { velika: range(0.98, 1.24, 0.02), srednja: range(0.98, 1.24, 0.02), letalnica: range(1.02, 1.34, 0.01) };
// različice fizike skakalnice: [takeoffWindow, pushScale]
// (paramsVersion 4: velike in srednje brez ožjega okna — odriv naj bo za igralca enako prijazen povsod)
const TWS = { velika: [[1, 1]], letalnica: [[1, 1], [1, 1.1], [1, 1.2], [1.3, 1], [1.6, 1], [2, 1]] };
TWS.srednja = TWS.velika;
const LIFT0 = { velika: 1, srednja: 1, letalnica: 1.045 };
function defFrom(c, b0, gate = 1, gateFactor = 7, lift = LIFT0[c.size], tw = 1, push = 1) {
  const r1 = r1Of(c);
  const trans = r1 * (c.gamma - c.alpha) * DEG;
  const lowGate = c.e1 - c.es;
  const fly = c.size === 'letalnica';
  const def = {
    id: c.id, name: c.name, size: c.size, group: 'prave',
    k: c.K, hs: c.L, meterValue: meterValueFor(c.K), base: baseFor(c.K), windFactors: windFactorsFor(c.K),
    gateFactor, gates: { count: c.gates, default: gate, spacing: r2d(c.es / (c.gates - 1)) },
    inrun: { gamma: c.gamma, alpha: c.alpha, r1: r2d(r1), t: c.t, e2: r2d(lowGate - c.t - trans) },
    landing: { s: c.s, b0: r2d(b0), beta: c.bP, betaL: c.bL, pArc: c.P, lArc: c.L, r2: c.r2, outrunAngle: c.out, outrunLength: Math.max(40, c.a) },
    real: { venue: c.venue, country: c.country, certYear: c.year, source: SRC + c.file, ...(c.record ? { record: c.record } : {}) },
    theme: themeOf(c),
    desc: THEMES[c.id].desc,
  };
  const u = UNLOCK[c.id] !== undefined ? UNLOCK[c.id] : UNLOCK[c.size];
  if (u) def.unlock = u;
  // liftScale (parameter fizike skakalnice iz 2. faze): pravi profili se pred L položijo (βL 28–32°), zato potrebujejo
  // položnejši let kot izmišljene skakalnice (β 35–36° do HS), da je pristanek pri HS varen — glej README »Prave skakalnice«
  // takeoffWindow < 1: ožji okni dobrega odriva — natančnost odriva šteje več (večji razpon med spretnostmi, glej README)
  const ph = {};
  if (lift !== 1) ph.liftScale = lift;
  if (tw !== 1) ph.takeoffWindow = tw;
  if (push !== 1) ph.pushScale = push;
  if (Object.keys(ph).length) def.physics = ph;
  return def;
}

/** b0 (začetni naklon grbine), da K-točka leži h pod robom (bisekcija; višja b0 = strmejša grbina = nižja K). */
function fitB0(c) {
  const yK = b0 => buildHill(defFrom(c, b0)).landAt(c.K).y;
  let lo = 0, hi = c.bP - 0.01;
  if (yK(lo) < -c.h) return { b0: 0, err: yK(0) + c.h };
  if (yK(hi) > -c.h) return { b0: hi, err: yK(hi) + c.h };
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (yK(m) > -c.h) lo = m; else hi = m; }
  return { b0: (lo + hi) / 2, err: yK((lo + hi) / 2) + c.h };
}

/** Povprečje bota pri zaletnem mestu. */
const avgAt = (def, skill, gate, n = N) => balanceRow({ ...def, _built: buildHill(def) }, P, skill, { n, gate });

const out = [];
for (const c of CERTS) {
  if (ONLY && c.id !== ONLY) continue;
  const { b0, err } = fitB0(c);
  let def = defFrom(c, b0);
  const H = buildHill(def);
  const kp = H.landAt(c.K), up = H.landAt(c.L);
  // privzeto mesto in liftScale: kandidati, ki izpolnijo cilje za 0,3 / 0,7 / 1,0 (16 skokov), razvrščeni po najmanjšem
  // odmiku liftScale od izhodišča (čim bolj nespremenjena fizika, čim višja hitrost), nato 0,7 najbližje K + 1;
  // prvi, ki cilje izpolni tudi s polno statistiko (BALANCE_N skokov, kot test), zmaga
  const LA = (process.argv.find(a => a.startsWith('--lifts=')) || '').slice(8).split(',').map(Number);
  const SEARCH = process.argv.includes('--search') || !TUNE[c.id];
  const lifts = !SEARCH ? [] : c.fine?.lifts ? range(...c.fine.lifts) : LA.length === 3 ? range(...LA) : LIFTS[c.size];
  const cands = [];
  const m7 = new Map();
  for (const [tw, push] of TWS[c.size]) for (const lift of lifts) {
    for (let g = 1; g <= c.gates; g++) {
      const d = defFrom(c, b0, g, 7, lift, tw, push);
      const r7 = avgAt(d, 0.7, g, 16);
      m7.set(tw + ':' + push + ':' + lift + ':' + g, r7.avg);
      if (r7.avg > c.K + 8) break;
      if (r7.avg < c.K - 6) continue;
      const rs = [avgAt(d, 0.3, g, 16), r7, avgAt(d, 1, g, 16)];
      // + čist pristanek najboljšega (≥ 50 % telemarkov): na pravih profilih je doskočišče pred L položno
      const met = rs.filter(r => meetsTarget(d, r)).length + (rs[2].tele >= 0.5 ? 1 : 0);
      cands.push({ g, lift, tw, push, met, pen: Math.abs(1 - tw) + Math.abs(1 - push) * 2 + (lift - LIFT0[c.size]) * 12, d7: Math.abs(r7.avg - c.K - 1) });
      if (process.argv.includes('--grid')) console.log(`  tw ${tw} push ${push} lift ${lift} mesto ${g}: ${rs.map(r => r.avg.toFixed(1) + (meetsTarget(d, r) ? '✔' : '✘') + ' p' + Math.round(r.falls * 100)).join(' / ')}`);
    }
  }
  // občutljivost (metri na zaletno mesto, iz sosednjih mest): manj je bolj igralno (žirija, trening)
  for (const cd of cands) { const k = cd.tw + ':' + cd.push + ':' + cd.lift + ':'; const a = m7.get(k + (cd.g - 1)), b = m7.get(k + (cd.g + 1)); cd.mpg = a != null && b != null ? (b - a) / 2 : 10; cd.pen += Math.max(0, cd.mpg - 6) / 10; }
  cands.sort((x, y) => y.met - x.met || x.pen - y.pen || x.d7 - y.d7);
  let best = SEARCH ? cands[0] : { ...TUNE[c.id] };
  for (const cd of SEARCH ? cands.filter(x => x.met === 4).slice(0, 25) : []) {
    const d = defFrom(c, b0, cd.g, 7, cd.lift, cd.tw, cd.push);
    const fr = [0.3, 0.7, 1].map(sk => balanceRow({ ...d, _built: buildHill(d) }, P, sk, { gate: cd.g }));
    if (fr.every(r => meetsTarget(d, r)) && fr[2].tele >= 0.5) { best = cd; break; }
  }
  const gate = best.g, lift = best.lift, tw = best.tw, push = best.push;
  // metri na mesto (okoli privzetega) × vrednost metra
  const at7 = g => m7.get(tw + ':' + push + ':' + lift + ':' + g) ?? avgAt(defFrom(c, b0, g, 7, lift, tw, push), 0.7, g, 16).avg;
  const a = at7(Math.max(1, gate - 2)), b = at7(Math.min(c.gates, gate + 2));
  const mPerGate = (b - a) / (Math.min(c.gates, gate + 2) - Math.max(1, gate - 2));
  const gateFactor = Math.max(0.5, Math.round(mPerGate * meterValueFor(c.K) * 10) / 10);
  def = defFrom(c, b0, gate, gateFactor, lift, tw, push);
  const errs = validateHill(def);
  const res = [0.3, 0.7, 1].map(sk => { const r = balanceRow({ ...def, _built: buildHill(def) }, P, sk, { n: N }); return { sk, r, ok: meetsTarget(def, r) }; });
  console.log(`${c.name.padEnd(24)} b0 ${b0.toFixed(2)}° (Δh ${err.toFixed(2)} m) · K: x ${kp.x.toFixed(2)} (n ${c.n}) y ${(-kp.y).toFixed(2)} (h ${c.h}) · β(K) ${kp.theta / DEG > 0 ? (kp.theta / DEG).toFixed(2) : '?'}° (cert ${c.bK}) · L β ${(up.theta / DEG).toFixed(2)}° · mesto ${gate}/${c.gates} · lift ${lift} · tw ${tw} · push ${push} · ${mPerGate.toFixed(2)} m/mesto · gf ${gateFactor} ${errs.length ? 'NAPAKE ' + errs.join('; ') : ''}`);
  console.log('   ' + res.map(({ sk, r, ok }) => `${sk}: ${r.avg.toFixed(1)} m t${Math.round(r.tele * 100)}% p${Math.round(r.falls * 100)}% hs${Math.round(r.overHS * 100)}% ${r.speed.toFixed(1)} km/h ${ok ? '✔' : '✘'}`).join(' · '));
  out.push(def);
  if (!CHECK && !errs.length) await writeFile(new URL('hills/' + c.id + '.json', root), JSON.stringify(def, null, 2) + '\n');
}
if (!CHECK) console.log(`\nZapisanih ${out.length} skakalnic v games/skoki/hills/. Dodaj jih v hills/index.json (skupina »prave«).`);
