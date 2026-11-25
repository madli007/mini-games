// Izpiše SQL bloka za public.shop_items iz shared/cosmetics.js:
//   SHOP_ITEMS (kozmetika profila) in GAME_ITEMS (predmeti za posamezne igre, stolpca game in slot).
// Uporaba: node tools/shop-sql.mjs   → kopiraj med oznaki SHOP_ITEMS oz. GAME_ITEMS v supabase/schema.sql
//          node tools/shop-sql.mjs --write   → zamenja oba bloka v schema.sql
// (testa »katalog = SQL« in »predmeti za igre = SQL« v tests/ preverita, da se ujemata).
import { CATALOG, GAME_ITEMS } from '../shared/cosmetics.js';

const q = s => `'${String(s).replace(/'/g, "''")}'`;
const unl = i => (i.unlock ? q(JSON.stringify(i.unlock)) + '::jsonb' : 'null');

export function shopSql(catalog = CATALOG) {
  const rows = catalog.map(i => `  (${q(i.id)}, ${q(i.kind)}, ${q(i.rarity)}, ${i.price}, ${unl(i)}, ${i.active === false ? 'false' : 'true'})`);
  return `-- SHOP_ITEMS:BEGIN (ustvari: node tools/shop-sql.mjs)
insert into public.shop_items (id, kind, rarity, price, unlock, active) values
${rows.join(',\n')}
on conflict (id) do update set kind = excluded.kind, rarity = excluded.rarity, price = excluded.price,
  unlock = excluded.unlock, active = excluded.active;
update public.shop_items set active = false where kind <> 'game' and id not in (${catalog.map(i => q(i.id)).join(', ')});
-- SHOP_ITEMS:END`;
}

export function gameItemsSql(items = GAME_ITEMS) {
  const rows = items.map(i => `  (${q(i.id)}, 'game', ${q(i.rarity)}, ${i.price}, ${unl(i)}, ${i.active === false ? 'false' : 'true'}, ${q(i.game)}, ${q(i.slot)})`);
  return `-- GAME_ITEMS:BEGIN (ustvari: node tools/shop-sql.mjs)
insert into public.shop_items (id, kind, rarity, price, unlock, active, game, slot) values
${rows.join(',\n')}
on conflict (id) do update set kind = excluded.kind, rarity = excluded.rarity, price = excluded.price,
  unlock = excluded.unlock, active = excluded.active, game = excluded.game, slot = excluded.slot;
update public.shop_items set active = false where kind = 'game' and id not in (${items.map(i => q(i.id)).join(', ')});
-- GAME_ITEMS:END`;
}

if (typeof process !== 'undefined' && /shop-sql\.mjs$/.test(process.argv?.[1] || '')) {
  if (process.argv.includes('--write')) {
    const fs = await import('node:fs');
    const file = new URL('../supabase/schema.sql', import.meta.url);
    let s = fs.readFileSync(file, 'utf8');
    s = s.replace(/-- SHOP_ITEMS:BEGIN[\s\S]*?-- SHOP_ITEMS:END/, () => shopSql());
    if (/-- GAME_ITEMS:BEGIN/.test(s)) s = s.replace(/-- GAME_ITEMS:BEGIN[\s\S]*?-- GAME_ITEMS:END/, () => gameItemsSql());
    else s = s.replace(/-- SHOP_ITEMS:END/, m => m + '\n\n' + gameItemsSql());
    fs.writeFileSync(file, s);
    console.log('schema.sql: bloka SHOP_ITEMS in GAME_ITEMS posodobljena.');
  } else {
    console.log(shopSql());
    console.log();
    console.log(gameItemsSql());
  }
}
