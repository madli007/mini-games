// Izpiše SQL blok za public.shop_items iz shared/cosmetics.js.
// Uporaba: node tools/shop-sql.mjs   → kopiraj med oznaki SHOP_ITEMS v supabase/schema.sql
// (test »katalog = SQL« v tests/tests.js preveri, da se ujemata).
import { CATALOG } from '../shared/cosmetics.js';

export function shopSql(catalog = CATALOG) {
  const q = s => `'${String(s).replace(/'/g, "''")}'`;
  const rows = catalog.map(i => `  (${q(i.id)}, ${q(i.kind)}, ${q(i.rarity)}, ${i.price}, ${i.unlock ? q(JSON.stringify(i.unlock)) + '::jsonb' : 'null'}, ${i.active === false ? 'false' : 'true'})`);
  return `-- SHOP_ITEMS:BEGIN (ustvari: node tools/shop-sql.mjs)
insert into public.shop_items (id, kind, rarity, price, unlock, active) values
${rows.join(',\n')}
on conflict (id) do update set kind = excluded.kind, rarity = excluded.rarity, price = excluded.price,
  unlock = excluded.unlock, active = excluded.active;
update public.shop_items set active = false where id not in (${catalog.map(i => q(i.id)).join(', ')});
-- SHOP_ITEMS:END`;
}

if (typeof process !== 'undefined' && /shop-sql\.mjs$/.test(process.argv?.[1] || '')) {
  console.log(shopSql());
}
