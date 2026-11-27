/* TESTNA MIZA — modul (?miza=test). Ne pokaže se v hubu. */
import { CFG, PAL } from './config.js';
import { buildTable } from './table.js';
import { TestRules } from './rules.js';

export default {
  id: 'test',
  ime: 'Testna miza',
  CFG, PAL,
  buildTable,
  Rules: TestRules,
  view: () => import('./view.js'),
};
