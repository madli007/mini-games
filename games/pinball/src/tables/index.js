/* =====================================================================
   REGISTER MIZ — id → modul mize (tables/<id>/index.js)
   Nova miza: mapa tables/<id>/ (index.js, table.js, rules.js, config.js,
   view.js, art.js) + vrstica tukaj. »test« se ne pokaže v hubu.
   ===================================================================== */
export const TABLES = {
  alu: () => import('./alu/index.js'),
  test: () => import('./test/index.js'),
  // božična miza je svoja igra v hubu (games/bozicni-pinball/); tu je le za orodja (merilec strelov, bot) in teste
  bozic: () => import('../../../bozicni-pinball/table/index.js'),
};
export const DEFAULT_TABLE = 'alu';
