# `sport/` — skupni modul za tekmovanja

Čista logika brez DOM-a in brez skakalnih pojmov, da jo lahko uporabijo druge športne igre (biatlon, slalom, bob …).
V 3. fazi se lahko preseli v `shared/`. Testi: `tests/skoki2.js` (»sport: …«).

## `competition.js` — serije, vrstni red, razvrstitev

Stanje je navaden JSON (gre v `room.setState`, v `localStorage`):

```js
import * as C from './sport/competition.js';

let st = C.createCompetition({
  seed: room.code + ':1',                       // vrstni red 1. serije iz seeda
  participants: [{ id: 'u1', name: 'Ana', kind: 'human' }, { id: 'bot:0', name: 'Bot', kind: 'bot', team: 'A' }],
  rounds: 2, trial: false, cut: 30,            // dve točkovani seriji, v 2. gre najboljših 30 (izenačeni na meji vsi)
});
while (!st.finished) {
  const id = C.currentId(st);                   // kdo je na vrsti
  const score = await igraj(id);                // igra izračuna točke (ali status)
  st = C.record(st, id, { score, data: { čas: 41.2 } });   // vrne NOVO stanje; 2. serija se začne sama (obratni vrstni red)
}
C.standings(st);   // [{ id, rank (deljeno mesto pri izenačenju), total, scores, status }]
```

- Statusi: `ok`, `dns` (ni štartal), `dsq` (diskvalificiran), `dnf` (ni dokončal). Rezultat ≠ `ok` = izpade iz naslednjih serij.
- `moveToEnd(st, id)` (sproščen način), `markAbsent(st, id)` (odhod: vse preostale serije DNS), `upcoming(st, n)`,
  `roundNumber(st)` (0 = poskusna), `rankChanges(prej, potem)` (puščice ↑↓), `teamStandings(st)`, `restore(json)` (preveri tuj vnos).
- `higher: false` za športe, kjer je manj bolje (čas).
- **Posebne nagrade kot vtičniki:** `C.prizes(st, [{ key, title, icon, pick: (rezultati, st) => ({ id, text }) | null }])` —
  pokvarjen vtičnik ne podre tekme.

## `live-replay.js` — tok vnosov v živo

Za deterministične igre: pošilja se vnos, ne stanje.

```js
import { createSender, createReceiver, verify } from './sport/live-replay.js';

// aktivni tekmovalec
const tx = createSender({ jumpId, send: pkt => room.send('in', pkt) });
// vsak tick:  tx.push(tick, [gumb, smer]);   na koncu:  tx.end();
room.on('need', p => { if (p.jk === jumpId) room.send('in', tx.full()); });   // pozno pridruženi

// gledalec
const rx = createReceiver({ jumpId, delayMs: 300 });
room.on('in', pkt => rx.accept(pkt));            // vrstni red, podvojeni, zamujeni paketi so urejeni
// vsak okvir:  const { n, stalled } = rx.advance(dt);  nato n-krat korak simulacije z rx.inputAt(tick)
// stalled = paketa še ni → gledalec stoji (»…«), ne ugiba

// host: uradni rezultat iz vnosov
const { ok, result } = verify(changes => mojaSimulacija(changes), poteza.changes, poteza.res);
```

Paket: `{ j: jumpId, f: od ticka, t: do ticka, c: [[tick, …vrednosti]], e?: 1 }` (le spremembe vnosa).

## Primer: psevdo igra »Tek na 100 m«

```js
// simulate(changes) → { time } (deterministično: tick = 1/120 s, vnos [korak 0|1])
const tekmovanje = C.createCompetition({ seed: 'tek', participants, rounds: 1, higher: false });
// skakalec → tekač: isti sender/receiver, host verify(simulate, changes, claimed); record(st, id, { score: time })
```
