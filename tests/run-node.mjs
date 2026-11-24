// Zagon testov brez brskalnika: node tests/run-node.mjs
import { readFile } from 'node:fs/promises';
import { runAll } from './tests.js';

const root = new URL('../', import.meta.url);
const games = JSON.parse(await readFile(new URL('games.json', root), 'utf8'));
const schema = JSON.parse(await readFile(new URL('games.schema.json', root), 'utf8'));
const schemaSql = await readFile(new URL('supabase/schema.sql', root), 'utf8');
const kIdx = JSON.parse(await readFile(new URL('games/krogla/levels/index.json', root), 'utf8'));
const kroglaLevels = await Promise.all(kIdx.levels.map(async f => JSON.parse(await readFile(new URL('games/krogla/levels/' + f, root), 'utf8'))));

const rIdx = JSON.parse(await readFile(new URL('games/rusilec/arenas/index.json', root), 'utf8'));
const rusilecArenas = await Promise.all(rIdx.arenas.map(async f => JSON.parse(await readFile(new URL('games/rusilec/arenas/' + f, root), 'utf8'))));

const fIdx = JSON.parse(await readFile(new URL('games/frnikole/tracks/index.json', root), 'utf8'));
const frnikoleTracks = await Promise.all(fIdx.tracks.map(async f => JSON.parse(await readFile(new URL('games/frnikole/tracks/' + f, root), 'utf8'))));

const sIdx = JSON.parse(await readFile(new URL('games/skoki/hills/index.json', root), 'utf8'));
const skokiHills = await Promise.all(sIdx.hills.map(async f => JSON.parse(await readFile(new URL('games/skoki/hills/' + f, root), 'utf8'))));
const skokiParams = JSON.parse(await readFile(new URL('games/skoki/physics-params.json', root), 'utf8'));
const skokiSql = await readFile(new URL('supabase/games/skoki.sql', root), 'utf8');
const skokiRef = JSON.parse(await readFile(new URL('tests/fixtures/skoki-ref.json', root), 'utf8'));
const skokiBotRef = JSON.parse(await readFile(new URL('tests/fixtures/skoki-bot-ref.json', root), 'utf8'));

const herodleFixture = JSON.parse(await readFile(new URL('tests/fixtures/herodle-compare.json', root), 'utf8'));
const herodleHeroesSql = await readFile(new URL('supabase/games/herodle-heroes.sql', root), 'utf8');
const herodleHintsSql = await readFile(new URL('supabase/games/herodle-hints.sql', root), 'utf8');

const t0 = Date.now();
const { fails } = await runAll(console.log, { games, schema, schemaSql, kroglaLevels, rusilecArenas, herodleFixture, herodleHeroesSql, herodleHintsSql, frnikoleTracks, skokiHills, skokiParams, skokiSql, skokiRef, skokiBotRef });
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
