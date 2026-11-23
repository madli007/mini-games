# Prompt za AI agenta: kovanci, dnevne naloge, trgovina in kozmetika

> **Stanje:** ✅ narejeno — commit `57f0e50` (20. 11. 2026)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/02-trgovina.md in ga v celoti izvedi.«**

---

## Tvoja naloga

Hub MINI GAMES že ima profil (vzdevek + emoji avatar z barvo), XP z nivoji (`award_xp`: 500/klic, 5000/dan)
in dosežke po igrah. **Nima pa ničesar, kar bi igralec zbiral in kazal drugim.** Dodaj:

1. **Valuto** »kovanci« (🪙), ki jo igralec služi z igranjem.
2. **Dnevne in tedenske naloge** (questi), ki so za vse igralce isti dan enake.
3. **Trgovino**, kjer kovance zamenjaš za kozmetiko (nekaj stvari je brezplačnih, nekaj se odklene z nivojem
   ali dosežkom, večina se kupi s kovanci).
4. **Kozmetiko**, ki se vidi povsod, kjer se pokaže igralec: v glavi, lobbyju, lestvicah, na stopničkah.
5. **Garderobo** (inventar), kjer opremiš kupljene stvari.

Vse mora biti zgrajeno kot del `shared/`, da ga vsaka igra dobi brez dodatnega dela. Igre morajo le
sporočati dogodke (»odigral sem«, »zmagal sem«, »rezultat X«).

Najprej preberi `CLAUDE.md`, `shared/README.md`, `supabase/schema.sql` in `games/reakcija/game.js`.

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (nova sekcija za to nalogo).

**Pravi denar ni del te naloge.** »Plačljivo« pomeni plačljivo s kovanci. Plačila (Stripe ipd.) bi zahtevala
strežnik, davke in pogoje uporabe, kar za igro med prijatelji ni smiselno. To kratko zapiši v README.

---

## Ekonomija (izhodišče; uglasi in utemelji v PROGRESS.md)

Cilj: aktiven igralec (~20 min na dan) si **vsak dan kupi nekaj malega**, **vsak teden nekaj redkega**,
legendarni predmet pa po **3–5 tednih**. Nihče ne sme v enem dnevu »pokupiti vsega«.

| Vir kovancev | Koliko |
|---|---|
| odigrana igra (katerakoli, prek `hub.reportGame`) | 5 (največ 20 iger na dan šteje) |
| zmaga v multiplayerju | +10 |
| dnevna naloga (3 na dan) | 30–60 glede na težavnost |
| vse 3 dnevne naloge (bonus) | +50 |
| tedenska naloga (2 na teden) | 150–250 |
| nov nivo | 25 × nivo (največ 300) |
| dosežek (prvič) | 20 |
| zaporedni dnevi igranja (streak) | dan 1: 10 … dan 7+: 70 (bonus ob prvi igri dneva) |

Dnevna zgornja meja zaslužka (strežnik): **600 kovancev**. Pri izgubi streaka se začne znova pri dnevu 1.

| Redkost | Cena | Primeri |
|---|---|---|
| navadno | brezplačno ali 50–150 | osnovne barve, preprosti okvirji, nekaj emojijev |
| redko | 200–400 | neonski okvirji, gradient vzdevka, dodatni emoji |
| epsko | 600–1000 | animirani okvirji, naslovi, učinki ob zmagi |
| legendarno | 1500–2500 | mavrični/pikselni animirani okvirji, posebni naslovi |

Dodaj test, ki **simulira 30 dni** tipičnega in zelo aktivnega igralca in preveri zgornje cilje
(npr. legendarno ne prej kot v 14 dneh tudi pri maksimalnem zaslužku).

---

## Kozmetika (katalog)

Katalog je v `shared/cosmetics.js` (id, vrsta, ime, opis, redkost, cena, pogoj za odklep, CSS/vsebina)
in **mora se ujemati** s tabelo cen v bazi (glej spodaj). Dodaj test, ki to preveri.
Vse brez slikovnih datotek: CSS, SVG ali emoji. Pripravi **vsaj 60 predmetov**:

- **Avatar emoji** (`emoji`): osnovnih 24 ostane brezplačnih; dodaj ~20 »premium« emojijev (🦖 🧙 🥷 👑 🛸 🐉 …).
- **Barva / ozadje avatarja** (`bg`): osnovnih 8 barv je brezplačnih; dodaj gradiente, vzorce (pike, črte),
  »kovino« (zlato, srebro) in animiran gradient.
- **Okvir avatarja** (`frame`): tanek, neonski (barve), dvojni, pikselni (8-bit rob), zlati z bleščico,
  plameni, ledeni, mavrični animirani, utripajoči »arkadni«, krona v kotu. Vsaj 15 okvirjev.
- **Barva vzdevka** (`name`): enobarvne, gradient, »neon glow«, animiran mavrični (legendarno).
- **Naslov** (`title`): kratek napis pod vzdevkom, npr. »Bliskovit«, »Kralj sobe«, »Nočna ptica«,
  »Neustavljiv«. Nekateri se odklenejo samo z dosežki ali nivojem.
- **Značka** (`badge`): majhna ikona ob vzdevku (⚡ 🏆 🔥 💎 …).
- **Učinek ob zmagi** (`win`): konfeti, ognjemet, pikselni dež, »GG« napis — pokaže se pri `ui.results` za zmagovalca.
- **Pasica profila** (`banner`): ozadje kartice profila na dashboardu (CSS gradient/vzorec).

Pogoji za odklep (poleg nakupa): `level: N`, `achievement: '<igra>:<ključ>'`, `streak: N`, `free`.
Predmeti s pogojem so v trgovini vidni z oznako »Odkleni na nivoju 10« ipd.

**Dnevna ponudba:** poleg stalnega kataloga trgovina vsak dan pokaže 4 predmete s 25 % popustom,
izbrane z `hub.rng(hub.dailySeed() + ':shop')` (isti za vse).

---

## Dnevne in tedenske naloge

- Generator v `shared/quests.js` (čista logika, testirana): iz `hub.dailySeed()` izbere 3 dnevne naloge
  (lahka, srednja, težka) in iz tedna (ponedeljek po Europe/Ljubljana) 2 tedenski. Isti za vse igralce.
- Predloge nalog so splošne in vezane na igre iz `games.json` s statusom `live`, npr.:
  »Odigraj 3 igre«, »Odigraj 2 različni igri«, »Zmagaj v multiplayerju«, »Opravi dnevni izziv v igri X«,
  »V Reakciji doseži povprečje pod 260 ms«, »Odigraj igro z vsaj 4 igralci«, »Odkleni dosežek«.
  Igra lahko v `games.json` doda svoje predloge (npr. `quests: [{ id, text, event, target }]`) — razširi shemo.
- Napredek: igre kličejo
  ```js
  hub.reportGame({ won: true, players: 4, score: 231, daily: true });   // po vsaki odigrani igri
  hub.reportEvent('reakcija:avg', 231);                                // za posebne naloge
  ```
  Hub posodobi napredek nalog, ob dokončani nalogi pokaže toast »Naloga opravljena +40 🪙« in jo označi
  za prevzem. Prevzem (»Prevzemi«) gre prek RPC.
- Dodaj `hub.reportGame` v **Reakcijo** (solo in dvoboj) in v **pinball** (poleg obstoječega `hubXp`).

---

## Baza (`supabase/schema.sql` — dopolni, ostani idempotenten)

- `profiles`: dodaj `coins int not null default 0` in `equipped jsonb` (`{ emoji, bg, frame, name, title, badge, win, banner }`).
  Oba stolpca **nista** v `grant update` — spreminjata se samo prek RPC.
- `shop_items`: `id text pk`, `kind`, `rarity`, `price int`, `unlock jsonb`, `active bool`. Polni se iz SQL
  (`insert … on conflict (id) do update`). Cene pozna strežnik, klient jih ne more podtakniti.
- `inventory`: `user_id`, `item_id`, `acquired_at`, `source` (`buy` / `unlock` / `gift`); pk `(user_id, item_id)`.
- `coin_ledger`: `id`, `user_id`, `day`, `amount` (+/−), `reason`, `ref`, `created_at` (dnevnik za dnevno mejo in pregled).
- `quest_progress`: `user_id`, `period` (npr. `d:2026-11-21` / `w:2026-W47`), `quest_id`, `progress`, `claimed_at`;
  pk `(user_id, period, quest_id)`.
- RPC (v `private` kot `security definer`, v `public` le `security invoker` ovojnice, kot obstoječe):
  - `award_coins(amount, reason, ref)`: omejitve (npr. največ 300 na klic, 600 na dan); kliče ga hub.
  - `buy_item(item_id)`: preveri, da predmet obstaja in je aktiven, da ga igralec še nima, da izpolnjuje pogoj
    (`level` iz XP, `achievement` iz tabele `achievements`) in da ima dovolj kovancev; atomarno odšteje in doda
    v inventar. Popust dnevne ponudbe izračuna strežnik sam (enak PRNG kot klient, ali pa dnevno ponudbo shrani v tabelo).
  - `unlock_item(item_id)`: za brezplačne predmete in predmete s pogojem (brez kovancev).
  - `equip(slot, item_id)`: samo predmeti iz inventarja ali brezplačni; `null` sname predmet.
  - `claim_quest(period, quest_id)`: enkrat na nalogo. Napredek je »na časten način« (beleži ga klient),
    nagrada pa gre skozi dnevno mejo `award_coins`.
- RLS: vsi prijavljeni berejo `shop_items`, `equipped` in inventar drugih (da se kozmetika vidi);
  pisanje samo prek RPC.
- Poženi kot migracijo (Supabase MCP), nato `get_advisors` (security + performance) in popravi opozorila.
  Z lažnimi JWT (kot v prejšnji seji) preizkusi luknje: nakup brez kovancev, nakup tujega pogoja, dvojni prevzem
  naloge, neposreden zapis `coins`/`equipped`, nakup neaktivnega predmeta, preseganje dnevne meje.
- Isto logiko in omejitve zrcali v **offline adapterju** (`adapters/local.js`).

---

## `shared/` API (dopolni `shared/README.md`)

```js
hub.coins                              // trenutno stanje
hub.onProfile(cb)                      // že obstaja; profil zdaj vsebuje coins in equipped
await hub.reportGame({ won, players, score, daily })
await hub.reportEvent(name, value)
await hub.getQuests()                  // [{ id, text, target, progress, done, claimed, reward, period }]
await hub.claimQuest(id)
await hub.getShop()                    // katalog + dnevna ponudba + stanje (owned, locked, reason)
await hub.buy(itemId)                  // napake: not_enough_coins, locked, owned
await hub.equip(slot, itemId | null)
await hub.getInventory()
```

- `ui.avatar(p, size)` in `ui.who(p)` naj **samodejno** narišeta opremljen okvir, ozadje, barvo vzdevka,
  značko in naslov. Ker se `ui.who` uporablja povsod (glava, lobby, lestvice, rezultati), se bo kozmetika
  pokazala v vseh igrah brez sprememb v igrah.
- `equipped` mora priti tudi v **presence** sob (`room.players[i].equipped`), da ga drugi vidijo v lobbyju.
- `ui.results` pokaže zmagovalčev učinek ob zmagi.
- Lestvice (`get_leaderboard`, `topXp`) morajo vračati tudi `equipped`.
- Animacije spoštujejo `prefers-reduced-motion`.

---

## UI

- **Glava** (`ui.header`): poleg nivoja prikaži stanje kovancev (🪙 1.240); klik odpre trgovino.
- **Dashboard**: nova kartica »Dnevne naloge« (3 dnevne + 2 tedenski, vrstica napredka, »Prevzemi«,
  odštevanje do nove ponudbe ob ljubljanski polnoči) in kartica profila s pasico in opremo.
- **`shop.html`** (Trgovina): zavihki po vrsti (Okvirji, Emoji, Ozadja, Vzdevek, Naslovi, Značke, Učinki, Pasice),
  filter po redkosti, »Dnevna ponudba« na vrhu, kartica predmeta s predogledom **na mojem avatarju**,
  ceno, redkostjo (barvni rob: siva / modra / vijolična / zlata), stanjem (Kupi / V lasti / Opremi / Zaklenjeno:
  razlog). Potrditveno okno pred nakupom. Animacija ob nakupu.
- **Garderoba** (v trgovini zavihek »Moje« ali v urejanju profila): vse, kar imam, po slotih, z »Opremi«/»Sneži«
  in velikim predogledom profila.
- Vse v slovenščini, telefon (375 px) in namizje, `ui.css` slog.

---

## Kakovost in preverjanje (obvezno, pred commitom)

1. Testi (`node tests/run-node.mjs`, `tests.html`): generator nalog (determinizem, isti za vse, pravilen teden po
   Europe/Ljubljana), napredek nalog, ekonomija (simulacija 30 dni), skladnost kataloga s SQL, lokalni adapter
   (nakup, pogoji, dnevna meja, dvojni prevzem, opremljanje).
2. Brskalnik, **offline** in **s Supabase** (`?igralec=1`, `?igralec=2`): zasluži kovance v Reakciji, opravi in
   prevzemi nalogo, kupi in opremi okvir, naslov in barvo vzdevka; preveri, da jih drugi igralec vidi v lobbyju,
   na lestvici in na stopničkah.
3. Konzola brez napak; telefon (375×812) in namizje; posnetke zaslona sam preglej in popravi neurejeno.
4. Supabase advisors brez opozoril; RLS preizkus z lažnimi JWT; tabela `scores` (pinball) nedotaknjena.
5. Posodobi `README.md`, `shared/README.md`, `CLAUDE.md` (pravilo: vsaka nova igra kliče `hub.reportGame`)
   in `prompts/TEMPLATE-igra.md` (isto v fiksnem delu).
6. Testne profile, ki jih ustvariš v produkcijski bazi, na koncu **izbriši**.
7. Commit na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako je uglašena ekonomija, kaj moram narediti v Supabaseu
in kaj ni bilo preverjeno.
