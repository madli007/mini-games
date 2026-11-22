/* =====================================================================
   HRČKOVA KROGLA — render/looks.js: »lokacije« (svetloba, nebo, megla,
   materiali podlag, okras) za vsako progo. Barve igralnih elementov
   (rob, lepilo, led, nevarnosti) ostanejo iz teme proge zaradi berljivosti.
   ===================================================================== */

/**
 * sky: zenith/horizon/ground = barve neba, sun = smer (az od severa proti vzhodu, el nad obzorjem, v stopinjah),
 *      clouds 0–1, stars 0–1, bokeh 0–1 (mehke lučke v ozadju), cloudSea 0–1 (morje oblakov pod progami)
 * light: sun (barva, jakost), hemi (nebo, tla, jakost), env (jakost odsevov okolja)
 * exposure: toneMappingExposure · fog: barva in gostota FogExp2 · bloom: moč/polmer/prag (HDR)
 * floor/side/wall: vrsta proceduralne teksture (render/textures.js) · tintFloor: ali tla prevzamejo barvo teme
 * decor: seznam okrasov (render/decor.js)
 */
export const LOOKS = {
  garden: {
    name: 'Vrt v zlati uri',
    sky: { zenith: '#3f6fb5', horizon: '#ffc98e', ground: '#5e7a8c', sun: [-35, 16], sunColor: '#ffd8a0', clouds: 0.55, stars: 0, cloudSea: 0.55 },
    light: { sun: ['#ffd9a8', 3.4], hemi: ['#bcd4ff', '#6a5a3a', 0.7], env: 0.75 },
    exposure: 1.0, fog: ['#efcf9f', 0.0105], bloom: [0.35, 0.5, 1.0],
    grade: { tint: [1.03, 1.0, 0.95], sat: 1.06, vignette: 0.32 },
    floor: 'turf', side: 'soil', wall: 'hedge', tintFloor: true, edge: 'warm',
    decor: ['islands', 'clouds', 'butterflies', 'fireflies'],
  },
  kitchen: {
    name: 'Topla kuhinja',
    sky: { zenith: '#3b2016', horizon: '#ffb06a', ground: '#6a3a22', sun: [35, 38], sunColor: '#ffd2a0', clouds: 0, stars: 0, bokeh: 1, cloudSea: 0.25 },
    light: { sun: ['#ffd6a8', 3.0], hemi: ['#ffd8b0', '#5a3020', 0.75], env: 0.85 },
    exposure: 1.0, fog: ['#8a5434', 0.013], bloom: [0.4, 0.55, 1.0],
    grade: { tint: [1.05, 0.99, 0.92], sat: 1.04, vignette: 0.38 },
    floor: 'ceramic', side: 'wood', wall: 'enamel', tintFloor: true, edge: 'warm',
    decor: ['motes', 'steam', 'islands'],
  },
  crystal: {
    name: 'Jutro nad oblaki',
    sky: { zenith: '#1d4f92', horizon: '#aee6ff', ground: '#245a8e', sun: [20, 28], sunColor: '#fff2dc', clouds: 0.5, stars: 0, cloudSea: 0.75 },
    light: { sun: ['#fff1de', 3.3], hemi: ['#cfeaff', '#7a9ab8', 0.8], env: 1.0 },
    exposure: 1.0, fog: ['#8cc4ea', 0.011], bloom: [0.35, 0.5, 1.0],
    grade: { tint: [0.98, 1.0, 1.04], sat: 1.04, vignette: 0.28 },
    floor: 'marble', side: 'stone', wall: 'brass', tintFloor: true, edge: 'cool',
    decor: ['clouds', 'birds', 'islands'],
  },
  factory: {
    name: 'Tovarna ob mraku',
    sky: { zenith: '#2a1a2a', horizon: '#ff8a3a', ground: '#3a1a10', sun: [-60, 22], sunColor: '#ffa060', clouds: 0.35, stars: 0.15, cloudSea: 0.3, smoke: 1 },
    light: { sun: ['#ffc08a', 3.4], hemi: ['#b0a0b8', '#4a2a18', 1.0], env: 1.1 },
    exposure: 1.25, fog: ['#3e2318', 0.019], bloom: [0.5, 0.5, 1.0],
    grade: { tint: [1.04, 0.98, 0.93], sat: 1.0, vignette: 0.42 },
    floor: 'metal', side: 'girder', wall: 'rust', tintFloor: true, edge: 'hazard',
    decor: ['steam', 'embers', 'chimneys'],
  },
  tower: {
    name: 'Stolp v mraku',
    sky: { zenith: '#0d0a2c', horizon: '#b593ff', ground: '#241a4a', sun: [40, 30], sunColor: '#e2d6ff', clouds: 0.35, stars: 0.55, cloudSea: 0.6 },
    light: { sun: ['#e4d8ff', 2.6], hemi: ['#a898ff', '#2a2050', 0.7], env: 0.9 },
    exposure: 1.05, fog: ['#3a2c66', 0.014], bloom: [0.45, 0.5, 1.0],
    grade: { tint: [1.0, 0.98, 1.05], sat: 1.05, vignette: 0.36 },
    floor: 'marble', side: 'stone', wall: 'enamel', tintFloor: true, edge: 'cool',
    decor: ['clouds', 'motes', 'islands'],
  },
  ice: {
    name: 'Ledena dvorana',
    sky: { zenith: '#164a82', horizon: '#cdeeff', ground: '#2c6698', sun: [-20, 32], sunColor: '#f0f8ff', clouds: 0.4, stars: 0, cloudSea: 0.6 },
    light: { sun: ['#eef7ff', 3.0], hemi: ['#d8f0ff', '#5a8ab0', 0.85], env: 1.1 },
    exposure: 0.95, fog: ['#8fc2e6', 0.014], bloom: [0.35, 0.5, 1.0],
    grade: { tint: [0.96, 1.0, 1.06], sat: 1.0, vignette: 0.3 },
    floor: 'cloudstone', side: 'iceRock', wall: 'iceRock', tintFloor: true, edge: 'cool',
    decor: ['snow', 'clouds', 'icicles'],
  },
  arena: {
    name: 'Arena ob sončnem zahodu',
    sky: { zenith: '#2a0716', horizon: '#ff5e52', ground: '#3e0e18', sun: [-40, 12], sunColor: '#ffa07a', clouds: 0.65, stars: 0, cloudSea: 0.6 },
    light: { sun: ['#ffae8a', 3.0], hemi: ['#ff9aa8', '#3a0e1a', 0.6], env: 0.85 },
    exposure: 1.0, fog: ['#5e1a2a', 0.014], bloom: [0.45, 0.5, 1.0],
    grade: { tint: [1.04, 0.97, 0.97], sat: 1.05, vignette: 0.42 },
    floor: 'rubber', side: 'stone', wall: 'padded', tintFloor: true, edge: 'warm',
    decor: ['clouds', 'embers'],
  },
  neon: {
    name: 'Neon ponoči',
    sky: { zenith: '#020210', horizon: '#3e0c70', ground: '#07031a', sun: [-38, 7], sunColor: '#ff4fd8', clouds: 0.15, stars: 1, cloudSea: 0, synth: 1 },
    light: { sun: ['#9a8cff', 1.2], hemi: ['#5a3aa0', '#10061e', 0.55], env: 0.9 },
    exposure: 1.05, fog: ['#160a2e', 0.016], bloom: [0.55, 0.4, 1.0],
    grade: { tint: [1.0, 0.97, 1.06], sat: 1.12, vignette: 0.45 },
    floor: 'neon', side: 'darkmetal', wall: 'darkmetal', tintFloor: true, edge: 'neon',
    decor: ['grid', 'motes'],
  },
  sky: {
    name: 'Nebo ob sončnem zahodu',
    sky: { zenith: '#26408f', horizon: '#ffb2c4', ground: '#6e5c9e', sun: [-55, 9], sunColor: '#ffc8a0', clouds: 0.75, stars: 0.05, cloudSea: 0.85 },
    light: { sun: ['#ffcaa8', 3.2], hemi: ['#c8c8ff', '#b08aa8', 0.85], env: 1.0 },
    exposure: 1.0, fog: ['#c8a0c4', 0.0095], bloom: [0.4, 0.55, 1.0],
    grade: { tint: [1.03, 0.99, 1.0], sat: 1.06, vignette: 0.3 },
    floor: 'marble', side: 'cloudstone', wall: 'brass', tintFloor: true, edge: 'warm',
    decor: ['clouds', 'islands', 'birds'],
  },
  inferno: {
    name: 'Ognjeni prepad',
    sky: { zenith: '#020000', horizon: '#ff3010', ground: '#3a0400', sun: [40, 14], sunColor: '#ff6a3a', clouds: 0.5, stars: 0.25, cloudSea: 0, lava: 1 },
    light: { sun: ['#ffa070', 3.2], hemi: ['#ff9a7a', '#4a0a00', 1.0], env: 1.0 },
    exposure: 1.2, fog: ['#2e0806', 0.018], bloom: [0.6, 0.5, 1.0],
    grade: { tint: [1.05, 0.96, 0.94], sat: 1.05, vignette: 0.48 },
    floor: 'metal', side: 'basalt', wall: 'rust', tintFloor: true, edge: 'hazard',
    decor: ['embers'],
  },
};

const BY_NUM = { '01': 'garden', '02': 'garden', '03': 'kitchen', '04': 'kitchen', '05': 'crystal', '06': 'factory', '07': 'tower', '08': 'ice', '09': 'arena', '10': 'neon', '11': 'sky', '12': 'inferno' };

/** Lokacija za progo (izrecni `look` iz urejevalnika, sicer po številki id-ja; neznane proge po sklopu). */
export function lookFor(L) {
  const id = (LOOKS[L.look] && L.look) || BY_NUM[String(L.id || '').slice(0, 2)] || ['garden', 'factory', 'arena'][(L.set || 1) - 1] || 'garden';
  return { id, ...LOOKS[id] };
}
