# MINI GAMES

Hub za zbirko spletnih iger, ki jih igramo s prijatelji (do 10 ljudi): **dashboard** s seznamom iger,
profilom, skupno lestvico in aktivnimi lobbyji, **skupna infrastruktura** (`shared/`) za vse igre
(prijava, profil, XP, lestvice, dosežki, lobby z room kodo, realtime, dnevni seed, skupni UI) in
**register iger** (`games.json`).

- Objavljeno: **https://madli007.github.io/mini-games/**
- Igre: **Reakcija** (demo: dnevni izziv + dvoboj do 10 igralcev), **Alu Pinball** (kopija) in 14 napovedanih.
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
5. **Čiščenje starih sob**: `pg_cron` je vklopljen in vsako uro pobriše sobe, starejše od 24 h
   (opravilo `mg_cleanup_rooms`). Ročno: `select private.cleanup_old_rooms();`. Stare sobe se brišejo
   tudi sproti ob ustvarjanju nove.

### Preklop na drug Supabase projekt
1. V novem projektu poženi `supabase/schema.sql` (in po želji `games/pinball/supabase/scores.sql`).
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
- `security definer` funkcije so v neizpostavljeni shemi `private`; Supabase advisors (security) so čisti.

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
index.html  dashboard.js  dashboard.css   dashboard
games.json  games.schema.json             register iger + JSON Schema
shared/                                   skupni API (dokumentacija: shared/README.md)
  hub.js room.js ui.js ui.css util.js storage.js config.js
  adapters/local.js adapters/supabase.js adapters/types.js
games/reakcija/                           demo igra (index.html, game.js, logic.js, game.css)
games/pinball/                            kopija ALU PINBALL 2.0 (izvirnik v repoju pinball)
supabase/schema.sql                       shema huba (idempotentna)
supabase/games/                           SQL posameznih iger (če ga potrebujejo)
tests/  tests.html                        testi brez build koraka
prompts/01-hub.md                         prompt, s katerim je nastal hub
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
<link rel="stylesheet" href="../../shared/ui.css"></head>
<body class="mg"><main class="mg-container"><button class="mg-btn mg-btn--primary" id="b">Klikni</button></main>
<script type="module">
  import { hub, ui } from '../../shared/hub.js';
  await hub.init({ gameId: 'moja-igra' });
  ui.header({ title: 'Moja igra' });
  let n = 0;
  document.getElementById('b').onclick = async () => {
    if (++n === 10) { await hub.submitScore(n); await hub.awardXp(20, 'klik'); ui.toast('Bravo!'); }
  };
</script></body></html>
```

## Profil

Ob prvem obisku izbereš vzdevek (2–16 znakov, unikaten) in avatar (emoji + barva) — brez emaila in gesla
(anonimna prijava). V urejanju profila lahko profil povežeš z emailom (magic link) in se nanj prijaviš na
drugi napravi. *Opomba:* povezovanje z emailom ni bilo preizkušeno do konca (glej `PROGRESS.md`); če ne
deluje, ostane anonimna prijava, ki je vezana na brskalnik.
