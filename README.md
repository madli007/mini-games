# MINI GAMES

Hub za zbirko spletnih iger, ki jih igramo s prijatelji (do 10 ljudi): **dashboard** s seznamom iger,
profilom, skupno lestvico in aktivnimi lobbyji, **skupna infrastruktura** (`shared/`) za vse igre
(prijava, profil, XP, lestvice, dosežki, lobby z room kodo, realtime, dnevni seed, skupni UI),
**kovanci, dnevne naloge in trgovina s kozmetiko** (`shop.html`) ter **register iger** (`games.json`).

- Objavljeno: **https://madli007.github.io/mini-games/**
- Igre: **Reakcija** (demo: dnevni izziv + dvoboj do 10 igralcev), **Alu Pinball** (kopija), **Potapljanje ladjic**
  (kapitani, mana, powerupi; solo proti AI, dnevni izziv, dvoboj, battle royale do 10, TV pogled), **Hrčkova krogla**
  (3D, 12 prog v treh sklopih: turnir s prenosom časa, Na čas z ghosti, zrcalni turnir, dnevni izziv; nove proge
  in več turnirjev čakajo v promptu 35), **Rušilec**
  (party arena Hrčkove krogle za 2–8 igralcev v realnem času: izrivanje čez rob, 9 aren, boti, ekipe, TV pogled),
  **Zaporedje**, **Ustavi uro** (štoparica, ki izgine: dnevni izziv s 7 modifikatorji, dvoboj, Zadnji stoji),
  **Dirka frnikol**, **Smučarski skoki** (2,5D, deterministična fizika, 3 skakalnice, prava pravila
  točkovanja, veter, trening z ghosti in rekord skakalnice) in napovedane igre (npr. **Motorist**, fizikalni trial — prompti
  32–34 v [`prompts/README.md`](prompts/README.md)).
- Čisti HTML/CSS/JS z ES moduli. **Brez build koraka, brez npm odvisnosti.**
- Backend: Supabase (anonimna prijava, RLS, realtime). Brez njega vse deluje v **offline načinu**.

## Zagon lokalno

ES moduli zahtevajo strežnik (dvoklik na `index.html` ne deluje):

```
npx --yes http-server@14.1.1 . -p 8124 -c-1
```

Odpri http://localhost:8124/. Uporabni parametri:

| URL parameter | Učinek |
|---|---|
| `?offline=1` | vsili offline način (localStorage + BroadcastChannel) |
| `?room=ABCD` | pridruži se sobi (na dashboardu preusmeri v pravo igro) |
| `?igralec=2` | ločena identiteta v istem brskalniku (testiranje več igralcev s Supabase) |

**Multiplayer brez Supabasea:** odpri igro z `?offline=1` v dveh ali treh zavihkih. Vsak dodatni hkrati
odprt zavihek dobi gostujoči profil, sporočila gredo prek `BroadcastChannel`.

Testi: `node tests/run-node.mjs` ali http://localhost:8124/tests.html. Pinball: `node games/pinball/tests/run-node.mjs`.

## Nastavitev Supabase (korak za korakom)

Projekt `mini-games` (ref `ygdjxwchjfvzigasmayg`, eu-west-1) je že povezan v `shared/config.js`.
Shema huba (`supabase/schema.sql`) je na projektu **že pognana**; pinball tabele `scores` se ne dotika.

1. **Vklopi anonimno prijavo** — *Authentication → Sign In / Providers → Anonymous sign-ins → Enable*.
   **Vklopljeno 20. 11. 2026.** Če je izklopljeno, hub zazna napako (»Anonymous sign-ins are disabled«)
   in teče v offline načinu (v konzoli je ena napaka 422 od Supabase).
2. *(Če shemo spremeniš ali preklopiš projekt)* **SQL Editor → New query** → prilepi `supabase/schema.sql` → *Run*.
   Shema je idempotentna (lahko jo poženeš večkrat).
3. **Magic link** (»Shrani profil za drugo napravo«) — *Authentication → URL Configuration*:
   - *Site URL*: `https://madli007.github.io/mini-games/`
   - *Redirect URLs*: `https://madli007.github.io/mini-games/**` in za lokalni razvoj `http://localhost:8124/**`
   - *Authentication → Sign In / Providers → Email* naj bo vklopljen (privzeto je).
   Brez tega deluje vse razen povezovanja profila z emailom.
4. *(Priporočeno)* *Authentication → Rate Limits*: omejitev anonimnih prijav na IP (privzeto 30/h) je za
   skupino prijateljev dovolj.
5. **Hrčkova krogla (ghosti)**: `supabase/games/krogla.sql` (tabeli `krogla_levels`, `krogla_ghosts`, RPC `krogla_save_ghost`).
   **Pognano 21. 11. 2026** (migracija `krogla_ghosts`). Po spremembi prog (`node tools/krogla-levels.mjs`) ga poženi znova.
6. **Čiščenje starih sob**: `pg_cron` je vklopljen in vsako uro pobriše sobe, starejše od 24 h
   (opravilo `mg_cleanup_rooms`). Ročno: `select private.cleanup_old_rooms();`. Stare sobe se brišejo
   tudi sproti ob ustvarjanju nove.

### Preklop na drug Supabase projekt
1. V novem projektu poženi `supabase/schema.sql`, `supabase/games/krogla.sql` (in po želji `games/pinball/supabase/scores.sql`).
2. Ponovi korake 1, 3 in 4 zgoraj.
3. V `shared/config.js` vpiši `SUPABASE_URL` in `SUPABASE_ANON_KEY` (*Project Settings → API Keys →
   publishable*). **Nikoli ne vpiši `service_role` ključa.**
4. Pinball ima svojo konfiguracijo v `games/pinball/src/config.js` (`lestvica.url`, `lestvica.kljuc`).
5. Prazni vrednosti v `config.js` = vedno offline način.

## Varnost in »časten« način

GitHub Pages je statičen, zato je publishable/anon ključ javen. Vsa zaščita je v **RLS**:

- profile, lestvice, dosežke in javne sobe berejo vsi prijavljeni; pišeš lahko samo svoje vrstice;
- **XP se ne da pisati neposredno** (pravice na stolpcih) — samo prek RPC `award_xp` z omejitvijo
  500 XP na klic in 5000 XP na dan (po Europe/Ljubljana);
- sobe ustvarjaš in se jim pridružiš prek RPC (`create_room`, `join_room`: polna soba, že začeta igra);
  sobo ureja samo host; `room_state` in `moves` pišejo le člani sobe;
- **kovanci, nakupi, oprema in naloge** gredo samo prek RPC z omejitvami (dnevna meja igranja 120, en prevzem na
  nalogo, cene in pogoji na strežniku);
- `security definer` funkcije so v neizpostavljeni shemi `private`. Supabase advisors: performance le
  »unused index« (INFO), security le »Anonymous Access Policies« (namerno — vsi igralci so anonimni
  uporabniki) in »Leaked Password Protection« (gesel ne uporabljamo).

**Lestvice so »na časten način«.** Brez lastnega strežnika, ki bi sam izračunal rezultat, ni mogoče
preprečiti, da si kdo iz konzole brskalnika vpiše izmišljen rezultat. Za igro med prijatelji je to
sprejemljivo: vsi se poznamo, goljufanje je očitno (in nesmiselno), XP pa je omejen na strani baze.
Podobno je pri realtime igrah host tisti, ki preverja pravila; kanali `room:<KODA>` so javni broadcast
kanali (kdor pozna kodo, lahko posluša).

## Objava na GitHub Pages

Repo: `madli007/mini-games`, veja `main`.

1. `git push origin main`
2. GitHub → *Settings → Pages → Build and deployment → Source: **Deploy from a branch*** → veja **`main`**, mapa **`/ (root)`** → *Save*.
3. Po minuti je stran na https://madli007.github.io/mini-games/. Vse poti so relativne, zato deluje iz podmape.

## Struktura

```
index.html  dashboard.js  dashboard.css   dashboard (+ dnevne naloge)
shop.html  shop.js  shop.css              trgovina in garderoba
games.json  games.schema.json             register iger + JSON Schema
shared/                                   skupni API (dokumentacija: shared/README.md)
  hub.js room.js ui.js ui.css util.js storage.js config.js
  economy.js quests.js cosmetics.js cosmetics.css   kovanci, naloge, katalog kozmetike
  adapters/local.js adapters/supabase.js adapters/types.js
games/reakcija/                           demo igra (index.html, game.js, logic.js, game.css)
games/ladjice/                            Potapljanje ladjic (logic.js, ai.js, content.js, fx.js, game.js)
games/krogla/                             Hrčkova krogla (physics, level, rules, ghost, render, … · levels/*.json · README.md)
games/rusilec/                            Rušilec (match, collide, net, bots, arena, view · arenas/*.json · README.md)
games/ustavi-uro/                         Ustavi uro (logic.js, audio.js, game.js, game.css)
games/pinball/                            kopija ALU PINBALL 2.0 (izvirnik v repoju pinball)
supabase/schema.sql                       shema huba (idempotentna)
supabase/games/                           SQL posameznih iger (če ga potrebujejo)
tests/  tests.html                        testi brez build koraka (+ simulacija ekonomije)
tools/shop-sql.mjs                        SQL blok kataloga (shop_items) za schema.sql
tools/krogla-levels.mjs                   generator prog Hrčkove krogle (+ autopilot, medalje, SQL zlatih časov)
tools/rusilec-arenas.mjs                  generator aren Rušilca (arenas/*.json + index.json)
prompts/README.md                         kazalo vseh promptov (stanje, vrstni red, naslednja prosta številka)
prompts/NN-*.md                           prompti, s katerimi so nastale igre (01 hub, 02 trgovina …) in čakajoči
prompts/TEMPLATE-igra.md                  predloga prompta za novo igro
CLAUDE.md                                 pravila repoja za AI agente
PROGRESS.md                               dnevnik dela
```

## Kako dodati igro

1. Preberi [`CLAUDE.md`](CLAUDE.md) (pravila) in [`shared/README.md`](shared/README.md) (API).
2. Kopiraj [`prompts/TEMPLATE-igra.md`](prompts/TEMPLATE-igra.md), izpolni del »Igra« in ga daj agentu:
   »Preberi prompts/NN-igra.md in ga v celoti izvedi.«
3. Ročno: mapa `games/<id>/`, `import { hub, ui } from '../../shared/hub.js'`, vnos v `games.json`
   (`status: "live"`), testi, preverjanje v brskalniku (tudi offline multiplayer v več zavihkih).

Najmanjša igra:

```html
<!doctype html><html lang="sl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="../../shared/ui.css"><link rel="stylesheet" href="../../shared/cosmetics.css"></head>
<body class="mg"><main class="mg-container"><button class="mg-btn mg-btn--primary" id="b">Klikni</button></main>
<script type="module">
  import { hub, ui } from '../../shared/hub.js';
  await hub.init({ gameId: 'moja-igra' });
  ui.header({ title: 'Moja igra' });
  let n = 0;
  document.getElementById('b').onclick = async () => {
    if (++n === 10) { await hub.submitScore(n); await hub.awardXp(20, 'klik'); await hub.reportGame({ score: n }); ui.toast('Bravo!'); }
  };
</script></body></html>
```

## Kovanci, naloge in trgovina

- **Kovanci (🪙)** se služijo z igranjem (vsaka igra kliče `hub.reportGame`): odigrana igra 4 (20 iger na dan),
  zmaga v multiplayerju +8 (10 na dan), dnevne naloge 15/25/40 + 25 za vse tri, tedenski nalogi 100/150,
  nov nivo 5 × nivo (največ 100), prvi odklep dosežka 15, niz zaporednih dni 5 × dan (največ 35).
  **Dnevna meja igranja: 120 kovancev** (igre, zmage, niz, nivoji, dosežki, bonusi iger); **naloge niso pod mejo**
  (omejene so z enim prevzemom na nalogo). Uglasitev in simulacija 30 dni: `PROGRESS.md`, `tests/economy-sim.js`.
- **Naloge**: 3 dnevne (lahka, srednja, težka) in 2 tedenski, za vse igralce isti dan enake (generator
  `shared/quests.js` iz dnevnega seeda in iger `live`). Napredek beleži klient (»na časten način«),
  nagrado prevzameš na dashboardu (RPC `claim_quest`, enkrat na nalogo).
- **Trgovina** (`shop.html`): 94 kozmetičnih predmetov (okvirji, emoji, ozadja, barve vzdevka, naslovi, značke,
  učinki ob zmagi, pasice), vse iz CSS/emoji. Redkosti: navadno (≤150), redko (≤450), epsko (600–1000),
  legendarno (3500–4500). Nekateri se odklenejo z nivojem, dosežkom ali nizom dni. Vsak dan 4 predmeti s 25 %
  popustom. Zavihek **Moje** je garderoba.
- Opremljena kozmetika se vidi povsod, kjer hub nariše igralca (`ui.who`, `ui.avatar`): glava, lobby,
  lestvice, stopničke; zmagovalčev učinek se pokaže na končnem zaslonu.
- **Pravi denar ni del projekta.** »Plačljivo« pomeni plačljivo s kovanci. Plačila (Stripe ipd.) bi zahtevala
  lasten strežnik, obračun davkov in pogoje uporabe, kar za igro med prijatelji ni smiselno.
- Cene in pogoje pozna strežnik (`public.shop_items`); kovancev in opreme ni mogoče pisati neposredno
  (samo RPC `report_game`, `award_coins`, `buy_item`, `unlock_item`, `equip`, `claim_quest`). Katalog v
  `shared/cosmetics.js` se mora ujemati s tabelo: po spremembi `node tools/shop-sql.mjs` → blok `SHOP_ITEMS`
  v `supabase/schema.sql` (test »katalog = SQL« to preveri) → poženi shemo.

## Profil

Ob prvem obisku izbereš vzdevek (2–16 znakov, unikaten) in avatar (emoji + barva) — brez emaila in gesla
(anonimna prijava). V urejanju profila lahko profil povežeš z emailom (magic link) in se nanj prijaviš na
drugi napravi. *Opomba:* povezovanje z emailom ni bilo preizkušeno do konca (glej `PROGRESS.md`); če ne
deluje, ostane anonimna prijava, ki je vezana na brskalnik.
