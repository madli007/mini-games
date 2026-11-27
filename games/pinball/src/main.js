/* =====================================================================
   PINBALL — vhod: izbere mizo (?miza=<id>, privzeto alu) in jo zažene.
   Neznana miza → alu.
   ?debug=1 → sloj za uglaševanje (senzorji, drsniki fizike, korak za korakom)
   ?debug=shots → merilec strelov v brskalniku
   ===================================================================== */
import { TABLES, DEFAULT_TABLE } from './tables/index.js';
import { startApp } from './engine/app.js';

const params = new URLSearchParams(location.search);
const want = params.get('miza');
// božična miza je svoja igra v hubu (lestvica pod bozicni-pinball)
if (want === 'bozic') location.replace('../bozicni-pinball/' + location.search.replace(/([?&])miza=bozic&?/, '$1').replace(/[?&]$/, ''));
let id = want && Object.prototype.hasOwnProperty.call(TABLES, want) ? want : DEFAULT_TABLE;
let table;
try { table = (await TABLES[id]()).default; } catch (e) {
  console.warn('miza ' + id + ' se ni naložila', e);
  id = DEFAULT_TABLE; table = (await TABLES[id]()).default;
}
const view = table.view ? await table.view() : {};
startApp(table, view, { debug: params.get('debug') || null });
