// Zagon testov brez brskalnika: node tests/run-node.mjs
import { readFile } from 'node:fs/promises';
import { runAll } from './tests.js';

const root = new URL('../', import.meta.url);
const games = JSON.parse(await readFile(new URL('games.json', root), 'utf8'));
const schema = JSON.parse(await readFile(new URL('games.schema.json', root), 'utf8'));
const schemaSql = await readFile(new URL('supabase/schema.sql', root), 'utf8');

const t0 = Date.now();
const { fails } = await runAll(console.log, { games, schema, schemaSql });
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
