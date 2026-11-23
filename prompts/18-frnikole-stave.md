# Prompt za AI agenta: Dirka frnikol (3. del: stave s kovanci huba + trgovina)

> **Stanje:** ⬜ čaka — najbolje po 17

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/18-frnikole-stave.md in ga v celoti izvedi.«**
>
> Ozadje: 1. del (`prompts/16-frnikole.md`, solo Dirkalni dan proti botom) je narejen; 2. del
> (`prompts/17-frnikole-multiplayer.md`, party v živo) je ali bo narejen pred tem — preberi `PROGRESS.md`
> (sekcija »Dirka frnikol«) in `games/frnikole/README.md`, da veš, kaj obstaja. Če 2. del še ni narejen, naredi ta
> del le za solo način in v `PROGRESS.md` zapiši, kaj mora 2. del dodati.
>
> Danes so stave **točke igre** (kupček 1000, `bets.js`), ki ne vplivajo na kovance huba. Ta del doda neobvezen
> **»Kovančni vložek«**: igralec lahko ob dnevu (ali večeru) založi nekaj **kovancev huba**, ki se mu glede na
> končno uvrstitev vrnejo pomnoženi ali izgubijo. Vse prek RPC v Supabase (strežnik varuje vložek), offline adapter
> enako v `localStorage`.

---

## Igra (3. del)

### Kovančni vložek (predlog — odloči podrobnosti in jih zapiši v README)
- Pred začetkom dneva/večera izbira vložka: 0 (privzeto) / 10 / 25 / 50 kovancev. Vložek se **odšteje takoj**
  (RPC `frnikole_stake_open`), na koncu se izplača glede na **končni rezultat v točkah** (npr. `vložek × min(3,
  rezultat / 1000)`, zaokroženo navzdol; 1000 točk = vrnjen vložek) prek RPC `frnikole_stake_settle`.
- **Strežnik ne zaupa klientu** (lestvice so »na časten način«, kovanci pa ne smejo biti): omeji izplačilo in vložek.
  - Dnevna omejitev vložka (npr. ≤ 100 kovancev/dan skupaj, ≤ 3 vložki na dan).
  - Izplačilo največ 3× vložek; neto dobiček na dan največ npr. 60 kovancev (izplačilo gre skozi `private.grant_coins`
    z razlogom `frnikole` — upošteva dnevno mejo igranja 120 —, vračilo vložka pa mimo meje, ker ni nov kovanec).
  - Rezultat, ki ga pošlje klient, mora biti verjeten: ≤ teoretični maksimum (npr. 1000 × 12⁵ je nesmiselno — uporabi
    razumno mejo, npr. 50.000) in čas od `open` do `settle` ≥ 5 × najkrajša dirka (~2 min); sicer se vrne le vložek.
  - Odprt vložek, ki ni zaprt v 6 urah, se ob naslednjem klicu samodejno vrne (ne izgubi).
  - Idempotentno: `settle` za isti `stake_id` drugič ne naredi nič (vrne prejšnji izid).
- V MP (če 2. del obstaja): vsak igralec zase odpre/zapre svoj vložek; host ne more upravljati tujih kovancev.
- UI: kartica v meniju (»🪙 Kovančni vložek«), jasno sporočilo o tveganju, prikaz izida na končnem zaslonu
  (`ui.results` → `extraHtml`), `hub.coins` se osveži. Ne prikazuj kot igre na srečo s pravim denarjem — kovanci so
  kozmetična valuta huba; vložek je izbiren in privzeto 0.

### SQL: `supabase/games/frnikole.sql`
- Tabela `frnikole_stakes` (`id uuid pk default gen_random_uuid()`, `user_id`, `day` (Ljubljana, `private.mg_today()`),
  `amount int check (amount in (10,25,50))`, `mode text` (`solo` | `daily` | `party`), `seed text`, `opened_at`,
  `settled_at`, `score int`, `payout int`, `status text check (status in ('open','settled','refunded'))`).
- RLS vklopljen; `select` le svoje vrstice; **brez** `insert/update/delete` za `authenticated` (le prek funkcij).
- Funkcije `security definer` v shemi **`private`** (`set search_path = ''`), v `public` le `security invoker` ovojnice
  (`public.frnikole_stake_open(p_amount int, p_mode text, p_seed text)` → `{ id, coins }`,
  `public.frnikole_stake_settle(p_id uuid, p_score int)` → `{ payout, coins, status }`,
  `public.frnikole_stake_status()` → odprti/današnji vložki). `revoke all … from public, anon`, `grant execute … to authenticated`.
- Kovanci se spreminjajo **le** prek teh funkcij in obstoječih (`private.grant_coins`, `coin_ledger`) — odštevanje
  vložka zapiši v `coin_ledger` z negativnim zneskom in razlogom `frnikole:vlozek` (preveri, da `grant_coins` in
  ekonomska simulacija negativnih vrstic ne štejeta v mejo).
- Idempotentna skripta (`create table if not exists`, `drop policy if exists`, `create or replace function`), indeks na
  `(user_id, day)`. Če imaš Supabase MCP: poženi kot migracijo in preveri **advisors** (security + performance);
  sicer v `PROGRESS.md` zapiši, kaj mora uporabnik pognati.

### Offline adapter in hub
- `shared/adapters/local.js` in `shared/adapters/supabase.js`: nova metoda (npr. `hub.frnikoleStake.open/settle/status`
  ali splošneje `hub.rpc('frnikole_stake_open', …)`, če to ustreza obstoječemu vzorcu — poglej, kako so narejeni
  `saveGhost`/`publishLevel` za Kroglo) z **enakimi pravili** v obeh adapterjih (test v `tests/`).
- Dokumentiraj v `shared/README.md`. Ekonomska simulacija (`tests/economy-sim.js`) naj pokaže, da vložek ne podre
  ekonomije (pričakovana vrednost za igralca ≤ 0 pri naključnem stavljenju, a ni kaznovalna).

### Po želji: trgovina (ali ločen prompt `22-frnikole-trgovina.md`)
- Kozmetika za frnikole v `shared/cosmetics.js` (nov slot, npr. `marble`: vzorec in barva »tvoje« frnikole na kartici
  in v izrisu ter `trail` — sled za frnikolo, na katero imaš največjo stavo). Katalog se mora ujemati s `shop_items` v
  `schema.sql` (`node tools/shop-sql.mjs`). Fizika je za vse enaka.
- Urejevalnik prog (podobno kot `games/krogla/editor.html`, a za format `tracks/*.json` — ali le uvoz/izvoz JSON z
  validatorjem `validateTrack` in preverjanjem (a)–(c) v brskalniku). Če ne gre v tem delu, napiši `22-…`.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja (Supabase in varnost: RLS, `private` / `public`, service role nikoli v repo).
2. `shared/README.md` — API, kovanci (`COINS`, dnevna meja igranja 120, naloge izvzete), `hub.reportGame`.
3. `supabase/schema.sql` (`private.grant_coins`, `coin_ledger`, `award_coins`, `report_game`) in `supabase/games/krogla.sql`
   (vzorec za RPC igre z omejitvami).
4. `games/frnikole/README.md`, `games/frnikole/bets.js`, `games/frnikole/game.js` (`endDay`, `startDay`).

### Tehnično
- Brez build koraka, ES moduli, relativne poti, besedila v slovenščini.
- Kovanci, nakupi in oprema **samo prek RPC**. Lestvice ostanejo »na časten način«, kovanci ne.
- **Po vsaki odigrani igri** še naprej `hub.reportGame({ won, players, score, daily })`.
- Čisto logiko (izračun izplačila, omejitve) v ločen modul z testi v `tests/frnikole.js`; enaka pravila v SQL.
- Telefon (portret, 375 px) in namizje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, v Krogli, v Rušilcu, v trgovini in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (vsi obstoječi testi nespremenjeni, nova pravila v obeh adapterjih).
4. Offline (`?offline=1`): odpri vložek, odigraj dan, izplačilo; drugi vložek isti dan; prekoračitev dnevne omejitve;
   osvežitev sredi dneva (vložek ostane odprt in se pozneje zapre ali vrne). Če je Supabase dosegljiv: isto z dvema
   identitetama (`?igralec=2`) in preveri, da klient ne more klicati `private.*` ali pisati v `frnikole_stakes`.
5. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi.
6. Supabase **advisors** (security + performance) brez novih opozoril.
7. Posodobi `PROGRESS.md`, `games/frnikole/README.md`, `shared/README.md`.
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, pravila vložka, kaj (če kaj) moram narediti v Supabaseu
in kaj ni bilo preverjeno.
