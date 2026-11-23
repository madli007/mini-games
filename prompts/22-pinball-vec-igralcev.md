# Prompt za AI agenta: Pinball za več igralcev (4/4 — obe mizi)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/22-pinball-vec-igralcev.md in ga v celoti izvedi.«**
>
> Predpogoj: prompt 19 (motor) je narejen; idealno tudi 20 in 21 (Božična miza). Vse spremembe so v motorju,
> zato delujejo na **obeh mizah**. Ne spreminjaj tabele `scores` in repoja `D:\Git\Brainstorm\pinball`.

---

## 1. Izmenično na eni napravi (hot-seat, kot pravi avtomati)
- Na začetnem zaslonu izbira **1–4 igralcev** (Enter / gumb večkrat = dodaj igralca, kot »Start« na avtomatu).
- Vsak igralec ima svoje točke, žogice, bonus X, napredek načinov, locke itd. (stanje pravil mize na igralca,
  shranjeno ob menjavi). **Vidni locki** v vreči/peči: če drug igralec nima locka, žogice izstreli (»lock krade«
  kot na pravih mizah) ali uporabi virtualne locke — izberi in utemelji.
- DMD: »IGRALEC 2 — ŽOGA 1«, ob strani točke vseh igralcev; na koncu primerjava in stopničke.
- Extra ball = isti igralec še enkrat. Match za vsakega.
- Vsi rezultati gredo na lestvico (Alu: `scores` z inicialkami kot zdaj, Božična: hub). Prek huba samo prijavljeni
  profil (ostali so gosti z inicialkami).

## 2. Online: izmenično prek room kode (gledanje v živo)
- `hub.createRoom` / `ui.lobby` / `?room=`: 2–4 igralci, vsak igra svojo žogico na **svoji napravi**, ko je na vrsti.
  Ostali **gledajo v živo** (stanje žogic in luči prek `room.send`, ~20 Hz, interpolacija), z emoji odzivi.
- Igralec na vrsti je avtoriteta za svojo žogico; host vodi vrstni red in točke, preživi **prenos hosta**
  (`hostChanged`) in **osvežitev strani**. Če igralec na vrsti odide, se njegova žogica konča.
- TV pogled (`?tv=1`): velika miza in točke vseh, telefoni samo kontrole tistega, ki je na vrsti (opcijsko).

## 3. Pinball dvoboj (opcijsko, če ostane čas)
- Vsak na svoji mizi hkrati 3 minute. Določeni streli (super jackpot, combo ×5, način) pošljejo nasprotniku »napad«:
  nagnjena miza 5 s, krajši flipper, sneženje čez mizo (Božična), dodatna žogica. Zmaga več točk.

## Hub
- `hub.reportGame({ won, players, score })` za vsakega igralca enkrat. Dosežek »Zmaga v pinball dvoboju«, naloga
  »Odigraj pinball s prijateljem«.

---

## Fiksni del

**Delaj v enem kosu, do konca.** Sproti vodi `PROGRESS.md`.

### Najprej preberi
`CLAUDE.md`, `shared/README.md` (sobe, `room.send`, prenos hosta), `games/pinball/README.md`, `games/rusilec/net.js`
(primer pošiljanja stanja in interpolacije).

### Obvezna preverjanja (pred commitom)
1. Konzola brez napak na obeh mizah.
2. Testi uspešni (zlati test Alu, menjava igralcev: stanje pravil se pravilno shrani in obnovi, extra ball, konec igre).
3. Hot-seat s 3 igralci do konca na obeh mizah.
4. Online v **offline načinu** (`?offline=1`) v 2–3 zavihkih: ustvari sobo, pridruži se s kodo in prek `?room=`,
   odigraj do konca, odhod hosta sredi igre, osvežitev igralca, ki je na vrsti.
5. Telefon (375×812) in namizje, posnetki zaslona pregledani.
6. README obeh miz in `PROGRESS.md` posodobljena. **Commit** na `main`. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati v več, kaj ni bilo preverjeno.
