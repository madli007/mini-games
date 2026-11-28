/* =====================================================================
   GNEČA — render/looks.js: videz tem (nebo za krogla/render/sky.js,
   svetloba, barve steze in okolice). Barve strani so stalne zaradi
   berljivosti: moji modri, sovražni oranžno-rdeči.
   ===================================================================== */

export const SIDE = {
  me: { color: '#3fa9ff', giant: '#1f5fd0', cannon: '#2f7fe0' },
  en: { color: '#ff6a3d', giant: '#c0281e', tower: '#b8432e' },
};

export const LOOKS = {
  puscava: {
    id: 'gneca-puscava', name: 'Puščava',
    sky: { zenith: '#3f7fcf', horizon: '#ffd9a6', ground: '#d8a866', sun: [-35, 38], sunColor: '#fff1d6', clouds: 0.3, stars: 0, cloudSea: 0 },
    light: { sun: ['#fff0d8', 2.6], hemi: ['#cfe2ff', '#b08050', 0.9] },
    exposure: 1.0, fog: ['#f0cf9c', 0.008],
    lane: ['#f2d49a', '#e6c483'], edge: '#c48a4a', ground: '#dcae6c', rock: '#c98d58', deco: 'cactus',
  },
  kanjon: {
    id: 'gneca-kanjon', name: 'Kanjon',
    sky: { zenith: '#2d5a9e', horizon: '#ffb88a', ground: '#8a4c34', sun: [40, 26], sunColor: '#ffd8b0', clouds: 0.45, stars: 0, cloudSea: 0 },
    light: { sun: ['#ffd9b8', 2.7], hemi: ['#c8d8ff', '#7a3c28', 0.85] },
    exposure: 1.0, fog: ['#d9906a', 0.011],
    lane: ['#d9a37a', '#cc946b'], edge: '#8e4a30', ground: '#a85a3a', rock: '#9a4e32', deco: 'mesa',
  },
};

export const lookFor = theme => LOOKS[theme] || LOOKS.puscava;
