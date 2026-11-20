# Prompt za AI agenta: MINI GAMES hub (dashboard + skupna infrastruktura)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/01-hub.md in ga v celoti izvedi.«**

---

## Tvoja naloga

Repo `mini-games` je prazen (GitHub: `madli007/mini-games`, veja `main`, še brez commitov). Postavi v njem **hub za zbirko spletnih iger**, ki jih bom igral s prijatelji (do 10 ljudi). Hub sestavljajo:

1. **dashboard** (`index.html`): seznam iger, profil, skupna lestvica, aktivni lobbyji in pridružitev s kodo;
2. **skupna infrastruktura** (`shared/`), na katero se bo naslonila vsaka prihodnja igra (prijava, profil, XP, lestvice, lobby z room kodo, realtime kanali, dnevni seed, skupni UI);
3. **register iger** (`games.json`);
4. **ena majhna demo igra** (`games/reakcija/`), ki preizkusi vso infrastrukturo;
5. **navodila za dodajanje iger** (`CLAUDE.md` + `prompts/TEMPLATE-igra.md`), da bo vsako naslednjo igro mogoče narediti z enim promptom.

Vsaka nadaljnja igra bo nastala z promptom v slogu: »naredi igro X v `/games/x/`, brez build koraka, uporabi `shared/`, dodaj vnos v `games.json`«. Zato mora biti `shared/` **stabilen, preprost in dobro dokumentiran API**. To je najpomembnejši del naloge.

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah, ne sprašuj za potrditev vmesnih korakov in ne oddajaj polovične verzije z »naslednji koraki«. Odločitve sprejmi sam (ta dokument ti da dovolj usmeritev). Vprašaj samo, če si res blokiran. Supabase projekt že obstaja (glej »Supabase projekt«). Vseeno mora vse delovati tudi brez njega (glej »Offline način«).

Sproti vodi `PROGRESS.md` (načrt s kljukicami, dnevnik, kaj ni bilo preverjeno), da lahko nova seja nadaljuje, če zmanjka tokenov.

---

## Tehnične omejitve

- Statična stran za **GitHub Pages**, objavljena na `https://madli007.github.io/mini-games/`. **Vse poti relativne** (repo ni v korenu domene). Lokalno: `npx --yes http-server@14.1.1 . -p 8124 -c-1`. Ustvari `.claude/launch.json` s to konfiguracijo (ime `mini-games`).
- **Brez build koraka** in brez npm odvisnosti v repoju. Čisti HTML, CSS in JS z ES moduli (`<script type="module">`).
- Zunanje knjižnice samo prek CDN z **natančno pripeto verzijo**. Supabase: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm`. Pisave iz Google Fonts so dovoljene; brez njih mora vse delovati s sistemskimi pisavami.
- Vsa besedila v UI so **v slovenščini** (pravilni šumniki).
- Vsak dostop do `localStorage` zavij v `try/catch`.
- Deluje na telefonu (portret, 375 px) in na namizju. Party igre se bodo igrale tako, da je host na TV-ju ali prenosniku, ostali na telefonih.

---

## Supabase: arhitektura in varnost

GitHub Pages je statičen, zato je **anon key javen**. Varnost je izključno v **RLS** (Row Level Security), ki mora biti vklopljen na vseh tabelah. Strežnika ni: pri realtime igrah je eden od igralcev **host** in preverja pravila.

### Prijava

- **Anonimna prijava** (`signInAnonymously`) ob prvem obisku: igralec takoj izbere samo vzdevek in avatar, brez emaila in gesla.
- Opcijsko »Shrani profil« prek **magic link** emaila (`linkIdentity` / `updateUser({ email })`), da profil preneseš na drugo napravo. Če je to preveč zapleteno za zanesljivo delovanje, naredi samo anonimno prijavo in to zapiši v README.

### Shema (`supabase/schema.sql`, ena datoteka, ki jo jaz poženem v SQL editorju)

- `profiles`: `id uuid` (= `auth.uid()`), `nickname` (unikaten, 2–16 znakov), `avatar` (emoji + barva), `xp int`, `created_at`, `updated_at`.
- `game_scores` (ne `scores`, ker to ime že uporablja pinball): `id`, `game text`, `user_id`, `score int`, `seed text null` (za dnevni izziv), `meta jsonb`, `created_at`. Indeks na `(game, seed, score desc)`.
- `achievements`: `user_id`, `game`, `key`, `unlocked_at`; primarni ključ `(user_id, game, key)`.
- `rooms`: `code text pk` (4 znaki, brez zamenljivih znakov kot O/0, I/1), `game`, `host_id`, `status` (`lobby` / `playing` / `finished`), `max_players`, `settings jsonb`, `is_public bool`, `created_at`, `updated_at`.
- `room_state`: `room_code` pk, `state jsonb`, `version int`, `updated_at`. Za potezne in asinhrone igre (ena vrstica stanja na sobo, optimistično zaklepanje z `version`).
- `moves`: `id`, `room_code`, `seq int`, `user_id`, `move jsonb`, `created_at`; unikaten `(room_code, seq)`. Za potezne igre in replay.

Pravila RLS in funkcije:

- Branje profilov, lestvic, dosežkov in javnih sob je dovoljeno vsem prijavljenim.
- Pisanje samo v svoje vrstice (`user_id = auth.uid()`); sobe ureja samo host; `room_state` in `moves` lahko pišejo le igralci v sobi (dodaj tabelo `room_players` ali drug preprost mehanizem, ki ga RLS lahko preveri).
- **XP se ne piše neposredno**: samo prek RPC funkcije `award_xp(amount int, reason text)` (`security definer`) z omejitvijo na klic (npr. največ 500) in na dan (npr. 5000), da ni očitnega goljufanja.
- `submit_score` je navadna vstavitev; v README zapiši, da so lestvice »na časten način« (brez strežnika ni mogoče preprečiti goljufanja), in zakaj je to sprejemljivo za igro med prijatelji.
- Čiščenje starih sob (starejše od 24 ur) prek `pg_cron`, če je na voljo, sicer kot ročna funkcija, ki jo omeni README.
- Realtime: igre v realnem času uporabljajo **broadcast** in **presence** na kanalu `room:<KODA>` (brez pisanja v bazo za vsak tick). Kjer je potrebno, vklopi `postgres_changes` za `rooms` (seznam aktivnih lobbyjev na dashboardu).

Shema mora biti **idempotentna** (`create table if not exists`, `create or replace`, `drop policy if exists`), da jo lahko poženem večkrat.

### Supabase projekt

- Projekt **`mini-games`**, ref `ygdjxwchjfvzigasmayg`, regija eu-west-1.
- URL: `https://ygdjxwchjfvzigasmayg.supabase.co`
- Publishable ključ (javen, sme v repo): `sb_publishable_tIyU-rppDYcHt6AxIu9ahA_P1ofVudB`
- V projektu je **že tabela `public.scores`** z rekordi pinballa (svoja pravila RLS in sprožilec `scores_check`). **Ne spreminjaj je in ne briši**; hub tabele so ločene (`game_scores` ...).
- Če imaš v seji Supabase MCP orodja (`apply_migration`, `execute_sql`, `get_advisors`), shemo huba poženi kar sam kot migracijo, nato preveri `get_advisors` (security in performance) in popravi vse opozorila. Anonymous sign-ins vklopi v nastavitvah Auth, če to orodja omogočajo; sicer to zapiši v README kot ročni korak. Če orodij nimaš, shemo samo pripravi in v README napiši, kaj moram pognati.

### Konfiguracija

`shared/config.js` vsebuje `SUPABASE_URL` in `SUPABASE_ANON_KEY` z zgornjima vrednostma (ime spremenljivke je lahko tudi `SUPABASE_PUBLISHABLE_KEY`). Prazni vrednosti pomenita offline način. README ima korak za korakom navodila: vklopi Anonymous sign-ins, poženi `schema.sql`, nastavi Site URL in redirect za magic link na GitHub Pages naslov, kako preklopiš na drug projekt.

---

## Offline način (obvezno)

Ko ključa nista nastavljena (ali Supabase ni dosegljiv), mora **vse delovati lokalno**, z istim API-jem:

- profil, XP, lestvice in dosežki v `localStorage`;
- sobe in realtime prek **`BroadcastChannel`**, tako da multiplayer deluje **med zavihki istega brskalnika**. Tako lahko vsako igro preizkusiš brez Supabasea, tudi ti v tej seji;
- na dashboardu je diskreten znak »Offline način« z razlago.

Izvedi to kot dva adapterja (`supabase` in `local`) za isti vmesnik; igre ne smejo vedeti, kateri teče.

---

## `shared/` API

Natančna imena lahko prilagodiš, a API mora pokriti vse spodaj in biti dokumentiran v `shared/README.md` (s kratkimi primeri kode) ter z JSDoc komentarji.

**`shared/hub.js`**: glavni vhod za igre.

- `await hub.init({ gameId })` → prijava, nalaganje profila; če vzdevka še ni, pokaže modal za izbiro.
- `hub.profile`, `hub.updateProfile({ nickname, avatar })`, `hub.onProfile(cb)`.
- `hub.submitScore(score, { seed, meta })`, `hub.getLeaderboard({ seed, limit, period: 'all' | 'today' | 'week' })`, `hub.getMyBest({ seed })`.
- `hub.awardXp(amount, reason)`, `hub.unlock(key, { title, icon })` (pokaže toast »Dosežek odklenjen«), `hub.getAchievements()`.
- `hub.level(xp)`: krivulja nivojev (npr. naraščajoča), vrne `{ level, current, next, progress }`.
- `hub.dailySeed()`: niz iz datuma po **Europe/Ljubljana** (isti za vse igralce cel dan); `hub.rng(seed)`: determinističen PRNG (npr. mulberry32 s hashom niza).

**`shared/room.js`**: lobby in realtime.

- `await hub.createRoom({ maxPlayers, settings, isPublic })` → `room`; `await hub.joinRoom(code)` → `room`; pridružitev tudi prek URL-ja `?room=KODA`.
- `room.code`, `room.players` (iz presence: id, vzdevek, avatar, `isHost`, `ready`), `room.me`, `room.isHost`.
- `room.send(type, payload)`, `room.on(type, cb)`, `room.onPlayers(cb)`, `room.setReady(bool)`, `room.start(settings)` (samo host), `room.onStart(cb)`, `room.setStatus(status)`, `room.leave()`.
- **Prenos hosta**: ko host odide, novi host postane igralec z najstarejšim `joined_at` in dobi dogodek `hostChanged`.
- Za potezne igre: `room.getState()`, `room.setState(state, { expectedVersion })`, `room.pushMove(move)`, `room.onMove(cb)`.
- Omejitev igralcev (`maxPlayers`), zavrnitev ob polni sobi ali že začeti igri (z lepim sporočilom).
- Ponovna povezava: če igralec osveži stran, se z istim profilom vrne v sobo.

**`shared/ui.js`** + **`shared/ui.css`**: skupni gradniki, da so vse igre videti kot ena celota.

- `ui.header({ title })`: zgornja vrstica z gumbom »← Hub«, imenom igre in profilom (avatar, vzdevek, nivo).
- `ui.lobby(container, room, { minPlayers, onStart, settingsForm })`: zaslon lobbyja z veliko kodo sobe, QR kodo ali povezavo za kopiranje (QR generiraj sam ali s pripeto CDN knjižnico), seznamom igralcev, »Pripravljen« in gumbom »Začni« za hosta.
- `ui.leaderboard(container, { seed, period })`, `ui.toast(text, { icon })`, `ui.modal(...)`, `ui.countdown(3)`, `ui.results(players)` (končni zaslon s stopničkami in XP).
- `ui.css`: retro arkadni izgled s CSS spremenljivkami (barve, razmiki, radiji, pisave), temna podlaga, pisave npr. »Press Start 2P« za naslove in »Inter« ali »Rajdhani« za tekst. Gumbi, kartice, vnosna polja, značke, tabele, mreža. Igre dobijo izgled samo z vključitvijo `ui.css` in uporabo razredov.

---

## Dashboard (`index.html`)

- **Glava**: logo »MINI GAMES« (CSS ali SVG, brez slik), profil z avatarjem, vzdevkom, nivojem in XP vrstico; klik odpre urejanje profila.
- **Pridruži se s kodo**: velik vnos za 4 znake; poišče sobo in preusmeri v pravo igro (`games/<id>/?room=KODA`).
- **Aktivni lobbyji**: javne sobe s statusom `lobby` (igra, host, igralci x/max, gumb »Pridruži se«), osvežujejo se v realnem času.
- **Igre**: mreža kartic iz `games.json` (ikona, ime, opis, število igralcev, oznake, način). Filtri: Solo / Multiplayer / Party / Dnevni izziv. Igre s statusom `soon` so prikazane zatemnjene z oznako »Kmalu«.
- **Skupna lestvica**: top igralci po XP; zavihek z dnevnimi zmagovalci iger z dnevnim seedom.
- **Moji dosežki**: kratek pregled po igrah.

### `games.json`

Vsak vnos: `id`, `name`, `description`, `icon` (emoji ali pot do SVG), `path`, `players: { min, max }`, `mode` (`single` / `realtime` / `turn` / `async`), `tags` (npr. `party`, `daily`, `strategija`), `status` (`live` / `soon`). Dodaj JSON Schema (`games.schema.json`) in test, ki register preveri.

Vnesi demo igro kot `live`, ostale načrtovane igre pa kot `soon`, da dashboard že od začetka izgleda poln:

- Potapljanje ladjic s powerupi (2–10, turn)
- Bomba arena (2–8, realtime)
- Lane wars skozi dobe (1–2, realtime)
- Topovi na terenu (2–10, turn)
- Plemena (sezonska strategija, 2–10, async)
- Osvajanje heks mape (2–10, async)
- Obramba gradu (1, single, daily)
- Motorist (1, single, daily)
- Celice arena (2–10, realtime)
- Top-down dirke (1–8, realtime)
- Riši in ugibaj (3–10, realtime, party)
- Kviz z room kodo (2–10, realtime, party)
- Kdo je izdajalec (4–10, realtime, party)
- Retro arkada z dnevnim seedom (1, single, daily)

---

## Demo igra: `games/reakcija/`

Majhna, a zabavna igra, ki preizkusi **vso** infrastrukturo. Naj bo dodelana, ne samo tehnični test.

- **Solo z dnevnim seedom**: 10 krogov, zaslon postane zelen po naključnem zamiku (iz `hub.rng(hub.dailySeed())`), klikneš ali tapneš čim hitreje; prezgoden klik je kazen. Rezultat je povprečni čas. Dnevna lestvica in lestvica vseh časov.
- **Multiplayer (2–10)**: soba z room kodo, lobby iz `ui.lobby`, host sproži kroge (signal prek `room.send`), vsak igralec pošlje svoj čas, host razglasi zmagovalca kroga, na koncu `ui.results` s stopničkami.
- XP za odigrano igro in za zmago, vsaj 3 dosežki (npr. »Pod 200 ms«, »Brez prezgodnjega klika«, »Zmaga v multiplayerju«).

---

## Pinball: kopija obstoječe igre (`games/pinball/`)

V `D:\Git\Brainstorm\pinball` je dokončan pinball (ALU PINBALL 2.0, svoj git repo). **Original pusti nedotaknjen**, v hub samo prekopiraj igro:

- Kopiraj `index.html`, `src/`, `tests/`, `tests.html`, `README.md`, `supabase/scores.sql` in `assets/logos/impol.png` v `games/pinball/`.
- **Ne kopiraj**: `.git/`, `.DS_Store`, `PROMPT.md`, `PROGRESS.md`, `PREDLOGI-FIRME.md` in izvornih datotek logotipa (`.eps`, `.pdf`, `.jpg`, `Impol logotip.png`). Preveri, da `src/` ne uporablja nobene izpuščene datoteke.
- Igre **ne prepisuj** in ne spreminjaj fizike, pravil ali izrisa. Poti so že relativne, zato mora delovati iz podmape. Preveri to v brskalniku na `/games/pinball/`.
- Lestvica pinballa že teče na projektu `mini-games` (tabela `scores`, `src/config.js` že kaže tja). Konfiguracije ne spreminjaj in lestvice ne seli v `game_scores`.
- Dodaj samo diskreten gumb ali povezavo »← Hub« (`../../`) na začetnem zaslonu, ki ne moti igranja. Če gre brez posega v logiko igre, ob koncu igre pokliči še `hub.awardXp(...)` za skupni XP. Če to zahteva večje spremembe, izpusti in zapiši v `PROGRESS.md`.
- V `games.json` vnos `pinball` s statusom `live` (1 igralec, `single`, oznaki `arkada` in `rekordi`).
- Testi pinballa (`node games/pinball/tests/run-node.mjs`) morajo po kopiranju še vedno uspeti.
- V `games/pinball/README.md` dodaj na vrh opombo, da je to kopija in da je izvirnik v ločenem repoju `pinball`.

---

## Navodila za prihodnje igre

- **`CLAUDE.md`** v korenu: kratka pravila repoja (struktura, brez build koraka, relativne poti, slovenščina, uporaba `shared/`, offline način kot obvezen, RLS, kako testirati, vnos v `games.json`, commit brez pusha). Prihodnji agent ga prebere samodejno.
- **`prompts/TEMPLATE-igra.md`**: predloga prompta za novo igro z mesti za izpolnitev (ime, opis, pravila, način, število igralcev) in fiksnim delom (uporabi `shared/`, kje je dokumentacija, obvezna preverjanja: konzola brez napak, multiplayer v dveh zavihkih v offline načinu, telefon in namizje, testi, vnos v `games.json` iz `soon` v `live`, posodobitev `PROGRESS.md`, commit).
- Če nova igra potrebuje svoje tabele, gre njen SQL v `supabase/games/<id>.sql`; to pravilo zapiši v `CLAUDE.md`.

---

## Kakovost in preverjanje (obvezno, pred commitom)

1. Zaženi strežnik prek `.claude/launch.json` in vse preizkusi v brskalniku.
2. **Brez napak v konzoli** na dashboardu in v demo igri.
3. **Testi brez build koraka**: `tests.html` in `node tests/run-node.mjs` za čisto logiko (PRNG in dnevni seed z Europe/Ljubljana, generator kod sob, krivulja nivojev, veljavnost `games.json` proti shemi, lokalni adapter: lestvica, XP omejitve, prenos hosta).
4. **Multiplayer v offline načinu**: odpri dva ali tri zavihke, ustvari sobo, pridruži se s kodo in prek `?room=`, odigraj demo igro do konca, preizkusi odhod hosta sredi igre in osvežitev strani igralca.
5. Preveri izgled na **telefonu** (375×812) in **namizju**; posnemi zaslone in jih sam preglej. Popravi vse, kar izgleda neurejeno.
6. `schema.sql` preglej še enkrat posebej za RLS luknje (ali lahko kdo piše tuje vrstice, si dodeli XP mimo RPC, spremeni tujo sobo). Če je shema pognana na projektu, preizkusi hub še z njim (prijava, profil, lestvica, soba v dveh zavihkih) in preveri, da pinball lestvica še deluje. Kar ni bilo preverjeno, zapiši pod »Ni bilo preverjeno«.

---

## Oddaja

- `README.md`: kaj je hub, zagon lokalno, nastavitev Supabase korak za korakom, objava na GitHub Pages (**Settings → Pages → Deploy from a branch → `main` / root**), struktura datotek, kako dodati igro (povezava na `CLAUDE.md` in predlogo).
- `.gitignore` (npr. `node_modules/`, `.DS_Store`), brez skrivnosti v repoju (anon key je javen, **service role key nikoli**).
- **Komitaj** vse v lokalni git na vejo `main` z opisnim sporočilom. Ne pushaj.
- V končnem odgovoru kratko povzemi: kaj je narejeno, kako zagnati, kaj moram narediti v Supabaseu in kaj ni bilo preverjeno.
