/* =====================================================================
   ALU MIZA — modul mize za motor (engine/)
   Logika (CFG, geometrija, pravila) se naloži tudi v Node (testi, bot);
   grafika (art.js, logotipi) se naloži le v brskalniku prek view().
   ===================================================================== */
import { CFG, PAL, MODES } from './config.js';
import { buildTable } from './table.js';
import { AluRules } from './rules.js';

export default {
  id: 'alu',
  ime: 'Alu Pinball',
  CFG, PAL, MODES,
  buildTable,
  Rules: AluRules,
  /** grafika in posebnosti izrisa (samo brskalnik) */
  view: () => import('./view.js'),
};
