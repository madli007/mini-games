// Merilec strelov pinballa: node tools/pinball-shots.mjs [miza] [--json] [--korak=1]
// Za vsak flipper in začetek (iz inlana / cradle) preleti čas udarca v korakih po 1 ms in izpiše mapo strelov:
// kateri strel žogica zadene, širino okna (ms), kam se žogica vrne (feed) in hitrost. Izpis: markdown tabela.
import { TABLES } from '../games/pinball/src/tables/index.js';
import { shotMap, shotMapMarkdown } from '../games/pinball/src/engine/shots.js';
import { PHYSICS_VERSION } from '../games/pinball/src/engine/config.js';

const args = process.argv.slice(2);
const id = args.find(a => !a.startsWith('--')) || 'alu';
const step = Number((args.find(a => a.startsWith('--korak=')) || '--korak=1').split('=')[1]);
if (!TABLES[id]) { console.error('neznana miza: ' + id); process.exit(1); }
const table = (await TABLES[id]()).default;
const t0 = Date.now();
const map = shotMap(table, { stepMs: step, onProgress: p => process.stderr.write(`\r${Math.round(p * 100)} %`) });
process.stderr.write('\n');
if (args.includes('--json')) console.log(JSON.stringify(map, null, 1));
else {
  console.log(`Mapa strelov — miza ${id}, fizika f${PHYSICS_VERSION}, ${map.samples} vzorcev (korak ${step} ms), ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  console.log(shotMapMarkdown(map));
}
