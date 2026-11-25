/* =====================================================================
   Testi Smučarskih skokov, 3. faza (prompts/13-skoki-pokal.md): koledar
   pokala na pravih skakalnicah (finale na letalnici, turneja), okna v SQL
   = koledar igre, RPC in tabele v skoki.sql, predmeti za igre (katalog = SQL,
   cene, odklepi z dosežki), hub.gameItem in opremljanje v offline adapterju,
   pokal v offline adapterju (okno, ena serija, rez, velikost), naloge.
   Registrira jih tests/tests.js.
   ===================================================================== */
import * as K from '../shared/cosmetics.js';
import * as S from '../shared/storage.js';
import * as SE from '../shared/sport/season.js';
import * as SIM from './economy-sim.js';
import { LocalBackend } from '../shared/adapters/local.js';
import { cupCalendar, CUP_VENUES, CUP_FINALS, TOUR, LEAGUES, careerVenues } from '../games/skoki/cup-config.js';
import { cupEventsSql, cupSeasons } from '../tools/skoki-cup-sql.mjs';
import { gameItemsSql } from '../tools/shop-sql.mjs';

async function throwsCode(fn, code) {
  try { await fn(); } catch (e) { if (e.code === code) return; throw new Error(`pričakovana napaka ${code}, dobljena ${e.code || e.message}`); }
  throw new Error(`pričakovana napaka ${code}, a napake ni bilo`);
}
async function user(id) {
  const b = new LocalBackend({ userId: 'test4-' + id });
  await b.init();
  await b.saveProfile({ nickname: 'S4_' + id + Math.random().toString(36).slice(2, 6), avatar: { emoji: '🙂', color: '#fff' } });
  return b;
}
const rich = (b, coins) => { const all = S.load('db:profiles', {}); all[b.userId].coins = coins; S.save('db:profiles', all); };

/**
 * @param {(name:string, fn:Function)=>void} test
 * @param {{eq:Function, ok:Function}} h
 */
export function skoki4Tests(test, { eq, ok }) {
  test('skoki pokal: koledar samo na pravih skakalnicah, finale na letalnici (praviloma Planica), turneja decembra', ctx => {
    const real = new Set(ctx.skokiHills.filter(d => d.group === 'prave').map(d => d.id));
    const flying = new Set(ctx.skokiHills.filter(d => d.size === 'letalnica' && d.group === 'prave').map(d => d.id));
    for (const v of [...CUP_VENUES, ...CUP_FINALS, ...TOUR.venues]) ok(real.has(v), v + ' ni prava skakalnica');
    let planica = 0, n = 0;
    for (const s of cupSeasons()) {
      const cal = cupCalendar(s);
      ok(cal.events.every(e => real.has(e.venue)), s + ': le prave skakalnice');
      const fin = cal.events.at(-1);
      ok(fin.final && flying.has(fin.venue), s + ': finale na letalnici');
      if (fin.venue === 'planica-letalnica') planica++;
      n++;
      ok(cal.events.every(e => ['none', 'sneg', 'noc', 'sunki'].includes(e.cond)), s + ': pogoji brez Lune');
      ok(cal.events.every(e => Math.abs(e.wind.mean) <= 1.5), s + ': veter');
    }
    ok(planica / n > 0.6, `Planica v finalu ${planica}/${n}`);
    const dec = cupCalendar('2026-12');
    eq(dec.events.filter(e => e.tour).map(e => e.venue), ['oberstdorf', 'garmisch', 'innsbruck', 'bischofshofen']);
    eq(dec.name, 'Pokal Decembra 2026');
    eq(SE.FIRST_SEASON, '2026-12');
  });
  test('skoki pokal: okna v skoki.sql (CUP_EVENTS) = koledar igre (node tools/skoki-cup-sql.mjs --write)', ctx => {
    const m = ctx.skokiSql.match(/-- CUP_EVENTS:BEGIN[\s\S]*?-- CUP_EVENTS:END/);
    ok(m, 'v skoki.sql manjka blok CUP_EVENTS');
    eq(m[0].replace(/\r/g, ''), cupEventsSql(), 'blok se ne ujema s koledarjem — poženi node tools/skoki-cup-sql.mjs --write');
    ok(cupSeasons().length >= 24, 'vsaj 2 leti sezon');
  });
  test('skoki pokal: SQL — tabele z RLS, branje za prijavljene, pisanje le prek RPC, preverjanja v RPC', ctx => {
    const s = ctx.skokiSql;
    for (const t of ['skoki_cup_events', 'skoki_cup_jumps']) {
      ok(s.includes(`create table if not exists public.${t}`), t);
      ok(s.includes(`alter table public.${t} enable row level security`), t + ' RLS');
      ok(s.includes(`revoke all on table public.${t} from anon, authenticated`), t + ' revoke');
      ok(new RegExp(`grant select on table public\\.${t} to authenticated`).test(s), t + ' select');
      ok(!new RegExp(`grant (insert|update|delete)[^;]*public\\.${t}`).test(s), t + ' brez pisanja');
    }
    ok(/create or replace view public\.skoki_cup_board with \(security_invoker = true\)/.test(s), 'pogled security invoker');
    ok(/primary key \(user_id, season, event, round\)/.test(s), 'en zapis na serijo');
    ok(/function private\.skoki_cup_submit[\s\S]*security definer/.test(s), 'RPC v private, security definer');
    ok(/function public\.skoki_cup_submit[\s\S]*security invoker/.test(s), 'ovojnica security invoker');
    for (const code of ['not_authenticated', 'no_profile', 'cup_unknown', 'cup_closed', 'cup_already', 'cup_no_r1', 'cup_cut', 'cup_too_big', 'cup_impossible']) ok(s.includes(`'${code}'`), 'napaka ' + code);
    ok(/n >= 30 then raise exception 'cup_cut'/.test(s), 'rez 30');
    ok(/char_length\(p_inputs\) > 6000/.test(s), 'velikost vnosov');
  });
  test('trgovina: predmeti za igre (skoki: ≥8 dresov, 6 čelad, 6 smuči, 10 zastavic, cene po redkosti, odklepi z dosežki)', ctx => {
    const G = K.GAME_ITEMS.filter(i => i.game === 'skoki');
    const by = slot => G.filter(i => i.slot === slot);
    ok(by('suit').length >= 8 && by('helmet').length >= 6 && by('skis').length >= 6 && by('flag').length >= 10, 'premalo predmetov');
    const RANGE = { common: [0, 150], rare: [0, 450], epic: [0, 1200], legendary: [3500, 4500] };
    const ids = new Set(K.CATALOG.map(i => i.id));
    for (const it of G) {
      ok(/^skoki-[a-z]+-[a-z0-9-]+$/.test(it.id) && !ids.has(it.id), 'id ' + it.id); ids.add(it.id);
      eq(it.kind, 'game'); ok(K.GAME_SLOTS.skoki.includes(it.slot), 'slot ' + it.id);
      ok(it.price >= RANGE[it.rarity][0] && it.price <= RANGE[it.rarity][1], 'cena ' + it.id);
      ok(it.price > 0 || it.unlock?.achievement, 'brezplačen brez dosežka ' + it.id);
      ok(it.value && typeof it.value === 'object', 'value ' + it.id);
      if (it.unlock?.achievement) ok(/^skoki:[a-z0-9-]+$/.test(it.unlock.achievement), 'dosežek ' + it.id);
    }
    const ach = G.filter(i => i.unlock?.achievement).map(i => i.unlock.achievement).sort();
    eq(ach, ['skoki:letalec', 'skoki:luna', 'skoki:padci-50', 'skoki:rumena', 'skoki:sezona'].sort());
    // predmeti za igre niso v dnevni ponudbi (kozmetika profila ostane nespremenjena)
    ok(K.offerPool().every(id => K.item(id).kind !== 'game'));
    eq(K.dailyOffer('2026-11-20'), ['bg-mint', 'name-gold', 'emoji-eagle', 'badge-trophy']);
  });
  test('trgovina: predmeti za igre = SQL (blok GAME_ITEMS v schema.sql) in equip za sloti iger', ctx => {
    const m = ctx.schemaSql.replace(/\r/g, '').match(/-- GAME_ITEMS:BEGIN[\s\S]*?-- GAME_ITEMS:END/);
    ok(m, 'v schema.sql manjka blok GAME_ITEMS (node tools/shop-sql.mjs --write)');
    eq(m[0], gameItemsSql(), 'blok GAME_ITEMS ni ažuren');
    ok(/kind in \('emoji', 'bg', 'frame', 'name', 'title', 'badge', 'win', 'banner', 'game'\)/.test(ctx.schemaSql), 'kind game');
    ok(/s\.kind <> 'game' order by s\.id collate "C"/.test(ctx.schemaSql), 'dnevna ponudba brez predmetov za igre');
    ok(/where kind <> 'game' and id not in/.test(ctx.schemaSql), 'SHOP_ITEMS ne deaktivira predmetov za igre');
    ok(/p_slot ~ '\^\[a-z0-9-\]\{1,32\}\\\.\[a-z\]\{1,16\}\$'/.test(ctx.schemaSql), 'equip pozna slot igre');
  });
  test('trgovina: cene opreme za skoke so uglašene z ekonomijo (navaden kos v 2 dneh, cel komplet v ~3 tednih)', () => {
    const typ = SIM.simulate(SIM.PLAYERS.typical);
    const G = K.GAME_ITEMS.filter(i => i.game === 'skoki' && i.price > 0);
    const cheapest = Math.min(...G.map(i => i.price));
    const set = ['suit', 'helmet', 'skis', 'flag'].reduce((a, s) => a + Math.max(...G.filter(i => i.slot === s).map(i => i.price)), 0);
    ok(SIM.dayToAfford(typ.total, cheapest) <= 2, 'najcenejši kos v 2 dneh');
    const d = SIM.dayToAfford(typ.total, set);
    ok(d != null && d >= 7 && d <= 30, `najdražji komplet ${set} 🪙 v ${d}. dnevu`);
    return `najdražji komplet ${set} 🪙 → ${d}. dan (tipičen igralec)`;
  });
  test('lokalno: predmet za igro — nakup, odklep z dosežkom, hub.gameItem / gameItemOf, opremljanje v equipped.games', async () => {
    S.remove('db:profiles'); S.remove('db:inventory'); S.remove('db:ach'); S.remove('db:ledger');
    const a = await user('g1');
    await throwsCode(() => a.equip('skoki.suit', 'skoki-suit-neon'), 'not_owned');
    await throwsCode(() => a.equip('skoki.hat', 'skoki-suit-neon'), 'invalid');
    await throwsCode(() => a.equip('skoki.helmet', 'skoki-suit-neon'), 'invalid');
    await throwsCode(() => a.equip('suit', 'skoki-suit-neon'), 'invalid');
    await throwsCode(() => a.equip('frame', 'skoki-suit-neon'), 'invalid');
    rich(a, 2000);
    const r = await a.buyItem('skoki-suit-neon');
    eq(r.price, 250);
    eq(await a.equip('skoki.suit', 'skoki-suit-neon'), { games: { skoki: { suit: 'skoki-suit-neon' } } });
    await a.buyItem('skoki-flag-si');
    const eq2 = await a.equip('skoki.flag', 'skoki-flag-si');
    eq(eq2, { games: { skoki: { suit: 'skoki-suit-neon', flag: 'skoki-flag-si' } } });
    eq(K.gameItemOf(eq2, 'skoki', 'suit').value, { suit: '#39ff88', suit2: '#ff4fd8' });
    eq(K.gameItemOf(eq2, 'skoki', 'helmet'), null);
    eq(K.gameItemOf(eq2, 'krogla', 'ball'), null);
    eq(K.gameItemOf({ games: { skoki: { suit: 'frame-thin' } } }, 'skoki', 'suit'), null, 'napačna vrsta');
    ok(K.isEquipped(eq2, K.item('skoki-flag-si')) && !K.isEquipped(eq2, K.item('skoki-flag-at')));
    // profil (equip) ostane: kozmetika profila deluje naprej
    eq(await a.equip('title', 'title-novinec'), { games: { skoki: { suit: 'skoki-suit-neon', flag: 'skoki-flag-si' } }, title: 'title-novinec' });
    eq(await a.equip('skoki.suit', null), { games: { skoki: { flag: 'skoki-flag-si' } }, title: 'title-novinec' });
    eq(await a.equip('skoki.flag', null), { title: 'title-novinec' });
    // odklep z dosežkom (Lunin dres)
    await throwsCode(() => a.unlockItem('skoki-suit-luna'), 'locked');
    await a.unlock({ game: 'skoki', key: 'luna', title: 'Mali korak' });
    await a.unlockItem('skoki-suit-luna');
    eq((await a.equip('skoki.suit', 'skoki-suit-luna')).games.skoki.suit, 'skoki-suit-luna');
    eq(K.parseGameSlot('skoki.skis'), { game: 'skoki', slot: 'skis' });
    eq(K.parseGameSlot('skoki.trail'), null);
  });
  test('lokalno: pokal — okno serije, en zapis na serijo, 2. serija le z 1. in v rezu, velikost, nemogoče točke', async () => {
    S.remove('db:cup');
    const a = await user('c1'), b = await user('c2');
    const cal = cupCalendar('2026-12');
    const ev = cal.events[0];
    const w = { opens: ev.opens, r2: ev.r2, closes: ev.closes };
    const base = { game: 'skoki', season: '2026-12', event: 1, points: 120.5, dist: 98, inputs: 'QUJD', paramsVersion: 6, window: w, cut: 30, maxPoints: 300 };
    await throwsCode(() => a.cupSubmit({ ...base, round: 1, now: ev.opens - 1 }), 'cup_closed');
    await throwsCode(() => a.cupSubmit({ ...base, round: 1, now: ev.closes }), 'cup_closed');
    await throwsCode(() => a.cupSubmit({ ...base, round: 2, now: ev.r2 + 1 }), 'cup_no_r1');
    await throwsCode(() => a.cupSubmit({ ...base, round: 1, now: ev.opens + 1, inputs: 'x'.repeat(6001) }), 'cup_too_big');
    await throwsCode(() => a.cupSubmit({ ...base, round: 1, now: ev.opens + 1, inputs: '<script>' }), 'cup_too_big');
    await throwsCode(() => a.cupSubmit({ ...base, round: 1, now: ev.opens + 1, points: 999 }), 'cup_impossible');
    eq(await a.cupSubmit({ ...base, round: 1, now: ev.opens + 1 }), { saved: true });
    await throwsCode(() => a.cupSubmit({ ...base, round: 1, now: ev.opens + 2 }), 'cup_already');
    await throwsCode(() => a.cupSubmit({ ...base, round: 2, now: ev.r2 - 1 }), 'cup_closed');
    eq(await b.cupSubmit({ ...base, round: 1, points: 130, now: ev.opens + 5 }), { saved: true });
    // rez 1: a je 2. → ne gre v 2. serijo
    await throwsCode(() => a.cupSubmit({ ...base, round: 2, now: ev.r2 + 1, cut: 1 }), 'cup_cut');
    eq(await a.cupSubmit({ ...base, round: 2, points: 125, now: ev.r2 + 1 }), { saved: true });
    const rows = await a.cupStandings({ game: 'skoki', season: '2026-12' });
    eq(rows.length, 3);
    ok(rows.every(r => r.nickname && !('inputs' in r)), 'brez vnosov, s profilom');
    const j = await b.cupJump({ game: 'skoki', season: '2026-12', event: 1, round: 2, userId: a.userId });
    eq([j.points, j.inputs], [125, 'QUJD']);
    const st = SE.eventStandings(rows, 1);
    eq(st.map(x => [x.user_id === a.userId ? 'a' : 'b', x.rank, x.total, x.cupPoints]), [['a', 1, 245.5, 100], ['b', 2, 130, 80]]);
    S.remove('db:cup');
  });
  test('skoki kariera: lige (Celinski pokal → Svetovni pokal → Poleti) in prizorišča po velikosti', ctx => {
    eq(LEAGUES.map(l => l.id), ['celinski', 'svetovni', 'poleti']);
    ok(LEAGUES[0].tags.includes('mini') && LEAGUES[0].tags.includes('mala'), 'začetek na Mini in mali');
    ok(LEAGUES[2].tags.includes('letalnica'), 'Poleti = letalnice');
    const v = careerVenues(ctx.skokiHills);
    ok(!v.some(x => x.id === 'mirno-morje'), 'brez Lune');
    for (const L of LEAGUES) ok(v.filter(x => L.tags.includes(x.tag)).length >= 3, L.id + ': dovolj prizorišč');
    for (let i = 1; i < LEAGUES.length; i++) ok(LEAGUES[i].skill[0] > LEAGUES[i - 1].skill[0] && LEAGUES[i].skill[1] > LEAGUES[i - 1].skill[1], 'višja liga = močnejši rivali');
  });
  test('skoki: naloge pokala in kariere v games.json', ctx => {
    const g = (ctx.games.games || ctx.games).find(x => x.id === 'skoki');
    const q = id => g.quests.find(x => x.id === id);
    eq([q('pokal').tier, q('pokal').event, q('pokal').target], ['m', 'skoki:pokal', 1]);
    eq([q('kariera-zmaga').tier, q('kariera-zmaga').event, q('kariera-zmaga').target], ['h', 'skoki:kariera-zmaga', 1]);
    eq([q('w-pokal-3').tier, q('w-pokal-3').event, q('w-pokal-3').target], ['w', 'skoki:pokal', 3]);
    for (const id of ['skok-10', 'k-tocka', 'tocke-130', 'w-skok-50', 'zmaga-tekma', 'letalnica-k', 'w-tekme-5']) ok(q(id), 'obstoječa naloga ' + id);
  });
}
