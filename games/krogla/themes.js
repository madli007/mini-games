/* =====================================================================
   HRČKOVA KROGLA — themes.js: barvne teme prog (theme v JSON).
   Uporabljata jih generator (tools/krogla-levels.mjs) in urejevalnik prog.
   ===================================================================== */

/** Slovenska imena tem (za urejevalnik). */
export const THEME_NAMES = {
  vrt: 'Vrt', kuhinja: 'Kuhinja', steklo: 'Steklo', tovarna: 'Tovarna', stolp: 'Stolp',
  led: 'Led', arena: 'Arena', neon: 'Neon', nebo: 'Nebo', nemogoce: 'Nemogoče',
};

export const THEMES = {
  vrt: { sky: ['#1b1446', '#ff7ac8'], fog: '#3a2160', floor: '#3ddc84', side: '#1f6f4a', edge: '#b6ffcf', accent: '#ffd23f', wall: '#ff4fd8' },
  kuhinja: { sky: ['#120f2e', '#ffb35c'], fog: '#40264a', floor: '#ffd9a8', side: '#a0603a', edge: '#fff2d6', accent: '#ff4fd8', wall: '#4de1ff' },
  steklo: { sky: ['#06142e', '#4de1ff'], fog: '#0d2a4a', floor: '#9fe8ff', side: '#2a6f9a', edge: '#e6fbff', accent: '#ff4fd8', wall: '#ffd23f' },
  tovarna: { sky: ['#110a1c', '#ff7a1a'], fog: '#2e1a1a', floor: '#c9c3b8', side: '#6b5a4a', edge: '#ffd23f', accent: '#ff3b5c', wall: '#ff7a1a' },
  stolp: { sky: ['#0b0b2a', '#a78bfa'], fog: '#231a4a', floor: '#d6c8ff', side: '#5a4a9a', edge: '#ffffff', accent: '#ffd23f', wall: '#ff4fd8' },
  led: { sky: ['#071a33', '#bfe9ff'], fog: '#173a5e', floor: '#e4f6ff', side: '#5a90c0', edge: '#ffffff', accent: '#ff4fd8', wall: '#4de1ff' },
  arena: { sky: ['#1a0610', '#ff3b5c'], fog: '#3a0f1e', floor: '#ffc0cb', side: '#8a2a4a', edge: '#ffd23f', accent: '#4de1ff', wall: '#ff3b5c' },
  neon: { sky: ['#050510', '#5b1a8a'], fog: '#1a0a2e', floor: '#2b2b55', side: '#131330', edge: '#ff4fd8', accent: '#39ff88', wall: '#4de1ff' },
  nebo: { sky: ['#0a1f5c', '#ffd0f0'], fog: '#5a6fb0', floor: '#ffffff', side: '#9aa8e0', edge: '#ffd23f', accent: '#ff4fd8', wall: '#a78bfa' },
  nemogoce: { sky: ['#000000', '#ff3b5c'], fog: '#1a0000', floor: '#ffd23f', side: '#5a3a00', edge: '#ff3b5c', accent: '#4de1ff', wall: '#ff3b5c' },
};
