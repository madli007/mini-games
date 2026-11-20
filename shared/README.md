# `shared/` — API za igre

Vse, kar igra potrebuje od huba: prijava, profil, XP, lestvice, dosežki, dnevni seed,
sobe z room kodo, realtime in skupni UI. **Igra uvozi samo `hub.js`.**

```html
<link rel="stylesheet" href="../../shared/ui.css">
<body class="mg">
  ...
  <script type="module" src="game.js"></script>
</body>
```

```js
import { hub, ui } from '../../shared/hub.js';

await hub.init({ gameId: 'moja-igra' });   // prijava + modal za vzdevek, če ga še ni
ui.header({ title: 'Moja igra' });          // »← Hub«, ime igre, profil
```

Igre **ne vedo**, ali teče Supabase ali offline način — API je isti.

| Datoteka | Vsebina |
|---|---|
| `hub.js` | glavni vhod: `hub` (profil, XP, lestvice, dosežki, seed, sobe) in re-export `ui`, `Room`, `util` |
| `room.js` | razred `Room` (lobby, broadcast, presence, prenos hosta, stanje, poteze) |
| `ui.js`, `ui.css` | skupni gradniki in izgled |
| `util.js` | čista logika (PRNG, dnevni seed, kode sob, nivoji, validator sheme) |
| `economy.js` | kovanci: viri, omejitve, niz dni, popust (čista logika) |
| `quests.js` | generator dnevnih/tedenskih nalog in napredek (čista logika) |
| `cosmetics.js`, `cosmetics.css` | katalog kozmetike (94 predmetov), dnevna ponudba, pogoji; izgled |
| `storage.js` | varen `localStorage` (vse v `try/catch`) |
| `config.js` | Supabase URL in javni ključ (prazno = offline) |
| `adapters/local.js` | offline: `localStorage` + `BroadcastChannel` |
| `adapters/supabase.js` | Supabase: anonimna prijava, RPC, realtime |
| `adapters/types.js` | JSDoc tipi vmesnika adapterjev |

---

## `hub` — osnovno

### `await hub.init({ gameId, scoreOrder, requireProfile })`
- `gameId` — id iz `games.json` (male črke, številke, `-`).
- `scoreOrder` — `'desc'` (privzeto, več je bolje) ali `'asc'` (manj je bolje, npr. čas).
- `requireProfile` — `false` = ne pokaži modala za vzdevek (npr. igra, ki hub rabi le za XP).

Večkratni klici vrnejo isto obljubo. Po `init`:

| Lastnost | Pomen |
|---|---|
| `hub.profile` | `{ id, nickname, avatar: { emoji, color }, xp, coins, equipped, streak, best_streak, streak_day }` ali `null` |
| `hub.coins` | stanje kovancev |
| `hub.userId` | id prijavljenega |
| `hub.mode` | `'supabase'` ali `'local'` |
| `hub.offline` | `true`, če teče offline način |
| `hub.room` | trenutna soba ali `null` |

### Profil
```js
await hub.updateProfile({ nickname: 'Ana', avatar: { emoji: '🦊', color: '#ff4fd8' } });
// napaka: err.code === 'nickname_taken' | 'invalid'
const off = hub.onProfile(p => console.log(p.nickname, p.xp));   // pokliče se takoj in ob spremembah
ui.profileModal();                                               // okno za urejanje
```

### Lestvice (»na časten način«)
```js
await hub.submitScore(1234, { seed: hub.dailySeed(), meta: { level: 3 } });
const top = await hub.getLeaderboard({ seed: hub.dailySeed(), limit: 10, period: 'today' });
// [{ user_id, nickname, avatar, score, created_at }] — najboljši rezultat vsakega igralca
const best = await hub.getMyBest({ seed: hub.dailySeed() });   // število ali null
```
- `seed: null` (privzeto) = vsi rezultati igre, ne glede na seed.
- `period`: `'all'` | `'today'` (od ljubljanske polnoči) | `'week'` (zadnjih 7 dni).
- `order` povozi `scoreOrder` iz `init`.

### XP in nivoji
```js
const { xp, granted } = await hub.awardXp(50, 'zmaga');   // največ 500 na klic, 5000 na dan
hub.level();        // { level, current, next, progress } za trenutni profil
hub.level(1234);    // za poljuben XP
```
Krivulja: nivo 1→2 stane 100 XP, vsak naslednji 75 XP več (100, 175, 250, …).
Ob novem nivoju se pokaže toast. Priporočilo: 20–50 XP za odigrano igro, 50–150 za zmago.

### Dosežki
```js
await hub.unlock('pod-200', { title: 'Pod 200 ms', icon: '⚡' });   // toast samo ob prvem odklepu
const mine = await hub.getAchievements();                             // te igre
const all = await hub.getAchievements({ game: null });                // vseh iger
```
`key`: male črke, številke, `-`, `_` (do 40 znakov).

Prvi odklep dosežka prinese tudi **15 kovancev** in šteje za naloge (»Odkleni nov dosežek«).

### Kovanci, naloge, trgovina, kozmetika
**Vsaka igra po vsaki odigrani igri pokliče `hub.reportGame`** (solo in multiplayer, enkrat na igralca):
```js
await hub.reportGame({ won: true, players: 4, score: 231, daily: true });
//   won: zmaga (šteje le pri players ≥ 2) · players: število igralcev · score: rezultat (za naloge)
//   daily: odigran dnevni izziv · vrne { coins, granted, streak, streak_bonus } ali null
await hub.reportEvent('reakcija:avg', 231);   // poseben dogodek za naloge (ime 'igra:ime')
await hub.awardCoins(20, 'bonus');            // bonus iz igre: ≤100 na klic, skozi dnevno mejo
hub.coins                                     // trenutno stanje (tudi hub.profile.coins)
```
Kovanci: igra 4 (20/dan), zmaga v MP +8 (10/dan), naloge e15 · m25 · h40 · tedenski 100/150, vse 3 dnevne +25,
nov nivo 5 × nivo (≤100), dosežek 15, niz dni 5 × dan (≤35, ob prvi igri dneva). **Dnevna meja 250** (strežnik).
Številke: `shared/economy.js` (`COINS`) — iste so v `schema.sql` in `adapters/local.js`.

```js
const quests = await hub.getQuests();
// [{ id: 'h.win-1', slot: 'e'|'m'|'h'|'w1'|'w2', text, target, progress, done, claimed, reward, period }]
await hub.claimQuest('h.win-1');               // napake: claimed, not_done, expired, invalid
hub.onQuests(() => refresh());                 // napredek se je spremenil

const shop = await hub.getShop();
// { items: [{ id, kind, name, desc, rarity, price, priceToday, offer, owned, locked, reason, equipped, free }],
//   offer: [4 id-ji dnevne ponudbe], coins, equipped, state: { level, achievements, streak } }
await hub.buy('frame-neon-pink');              // napake: not_enough_coins, locked, owned, unavailable
await hub.equip('frame', 'frame-neon-pink');   // null sname; napake: not_owned, invalid
await hub.getInventory();                      // [{ item_id, acquired_at, source }]
```
- **Naloge** (`quests.js`): 3 dnevne (lahka/srednja/težka) + 2 tedenski (ISO teden po Ljubljani), za vse enake.
  Igra lahko v `games.json` doda svoje predloge: `"quests": [{ "id": "avg-260", "tier": "h", "text": "…",
  "event": "reakcija:avg", "target": 1, "cmp": "lte", "goal": 259 }]` (`tier` e/m/h/w; `event` je
  `play:<igra>`, `daily:<igra>`, `score:<igra>` ali ime iz `hub.reportEvent`; `cmp`/`goal` = prag vrednosti).
  Splošni dogodki iz `reportGame`: `play`, `play:<igra>`, `mp` (≥2), `win`, `party` (≥4), `daily`, `distinct`, `ach`.
- **Sloti opreme** (`profile.equipped`): `emoji`, `bg`, `frame`, `name`, `title`, `badge`, `win`, `banner`
  (id-ji iz `cosmetics.js`). `equipped` je tudi v `room.players[i]`, v vrsticah `getLeaderboard`, `topXp`
  in `listLobbies` (`host_equipped`).
- **Prikaz:** `ui.who(p)` in `ui.avatar(p, size)` sama narišeta okvir, ozadje, premium emoji, barvo vzdevka,
  značko in naslov — **podaj celega igralca** (`{ nickname, avatar, equipped }`), ne le `p.avatar`.
  `ui.results` pokaže zmagovalčev učinek (`players[0].equipped.win`); `ui.winFx('confetti')` ga sproži ročno.
  Animacije spoštujejo `prefers-reduced-motion`. CSS: `cosmetics.css` (naloži za `ui.css`; hub ga doda sam).

### Dnevni seed in naključnost
```js
const seed = hub.dailySeed();          // '2026-11-20' po Europe/Ljubljana — isti za vse cel dan
const rand = hub.rng(seed + ':moja-igra');
rand();             // [0, 1)
rand.int(1, 6);     // kocka
rand.range(1.5, 3); // decimalno
rand.pick(['a', 'b']);
rand.shuffle([1, 2, 3]);
```
Vedno dodaj id igre v seed, da imajo različne igre različna zaporedja.

---

## Sobe in realtime (`room.js`)

```js
// host
const room = await hub.createRoom({ maxPlayers: 8, settings: { rounds: 5 }, isPublic: true });
// ostali (koda ali ?room=KODA v URL-ju)
const code = hub.roomFromUrl();
const room = await hub.joinRoom(code);
// napake (err.code): room_not_found, room_full, room_started, wrong_game (err.game = prava igra)
```
`createRoom`/`joinRoom` v URL zapišeta `?room=KODA`, zato se igralec po **osvežitvi strani
vrne v isto sobo** z istim profilom (tudi med igro: pokliči `joinRoom(hub.roomFromUrl())`).

| Lastnost | Pomen |
|---|---|
| `room.code` | 4-znakovna koda (brez O/0, I/1) |
| `room.players` | prisotni: `[{ id, nickname, avatar, equipped, isHost, ready, joinedAt }]`, po času pridružitve |
| `room.me`, `room.isHost`, `room.hostId` | jaz / ali sem host / id hosta |
| `room.status` | `'lobby'` · `'playing'` · `'finished'` |
| `room.settings`, `room.maxPlayers` | nastavitve iz `createRoom` / `start` |

### Sporočila (broadcast — brez pisanja v bazo)
```js
room.send('shot', { x: 3, y: 5 });                     // vsem, TUDI sebi
const off = room.on('shot', (payload, fromId) => {});  // vrne odjavo
room.on('*', (type, payload, fromId) => {});           // vsa sporočila
```
Imena z `__` so rezervirana. Sporočila naj bodo majhna (JSON). Za igre v realnem času pošiljaj
stanje ~10–20× na sekundo, ne za vsak frame.

### Lobby in začetek
```js
room.onPlayers(players => render(players));   // takoj + ob vsaki spremembi
await room.setReady(true);
room.onStart(settings => startGame(settings)); // vsi (tudi host)
if (room.isHost) await room.start({ rounds: 5 });
await room.setStatus('lobby');                 // host: nova runda
await room.leave();
```
Ali kar `ui.lobby(...)` (spodaj), ki naredi vse to.

### Dogodki
| `room.on(...)` | Kdaj |
|---|---|
| `'start'` (settings) | host je začel igro |
| `'status'` (status) | sprememba statusa |
| `'hostChanged'` ({ hostId, previous }) | host je odšel; nov host je igralec z najstarejšim `joinedAt` |
| `'playerJoined'` / `'playerLeft'` (player) | prihod / odhod |
| `'state'` ({ state, version, from }) | nekdo je zapisal `setState` |
| `'move'` ({ seq, move, user_id }) | nekdo je dodal potezo |
| `'kicked'` | host te je odstranil |

### Prenos hosta
Ko host odide (zapre zavihek, izgubi povezavo za več kot 5 s ali pokliče `leave()`), vsi klienti
izračunajo istega novega hosta (prisotni igralec z najstarejšim `joinedAt`). Nov host dobi
`'hostChanged'` in mora **nadaljevati igro**. Zato naj host stanje igre redno pošilja vsem
(npr. ob koncu vsakega kroga), da ga lahko kdorkoli prevzame:

```js
room.on('hostChanged', ({ hostId }) => {
  if (hostId === hub.userId && room.status === 'playing') resumeAsHost(lastKnownState);
});
```

### Potezne in asinhrone igre (stanje v bazi)
```js
const { state, version } = await room.getState();          // { state: null, version: 0 } na začetku
try {
  await room.setState(next, { expectedVersion: version }); // optimistično zaklepanje
} catch (e) {
  if (e.code === 'version_conflict') { /* nekdo je bil hitrejši: ponovno preberi */ }
}
room.onState(({ state, version }) => render(state));

const seq = await room.pushMove({ from: 'a2', to: 'a4' });  // zaporedna številka se dodeli sama
room.onMove(({ seq, move, user_id }) => apply(move));
const history = await room.getMoves(0);                      // replay / ponovna povezava
```
`setState` in `pushMove` lahko kličejo le igralci v sobi (RLS).

### Seznam lobbyjev
```js
const lobbies = await hub.listLobbies();   // javne sobe v statusu 'lobby', host aktiven v zadnjih 3 min
const off = hub.onLobbiesChange(() => refresh());
const info = await hub.findRoom('ABCD');   // { code, game, status, max_players, players, host_nickname } ali null
```

---

## `ui` — skupni gradniki

```js
ui.header({ title: 'Moja igra' });                    // back: false = brez gumba »← Hub«
ui.toast('Shranjeno', { icon: '💾', duration: 2500 });
const v = await ui.modal({ title: 'Naslov', html: '<p>…</p>',
  actions: [{ label: 'Ne', value: false }, { label: 'Da', value: true, kind: 'primary' }] });
if (await ui.confirm('Res?', { danger: true })) { … }
await ui.countdown(3);                                // 3, 2, 1, START
ui.leaderboard(el, { seed: hub.dailySeed(), period: 'today', format: s => s + ' ms' });
ui.leaderboard(el, { tabs: [{ label: 'Danes', seed: hub.dailySeed() }, { label: 'Vseh časov' }] });
ui.lobby(el, room, {
  minPlayers: 2,
  onStart: settings => startGame(settings),
  onLeave: () => showMenu(),
  settingsForm: el => { el.innerHTML = '<select …>'; return () => ({ rounds: +el.querySelector('select').value }); },
});
const choice = await ui.results(sortedPlayers.map(p => ({ ...p, scoreText: p.score + ' točk', xp: 50 })),
  { again: 'Še enkrat' });                            // 'again' | 'hub' | null
ui.profileModal();
ui.avatar(p, 'sm' | '' | 'lg' | 'xl');                // HTML: avatar z okvirjem, ozadjem, emojijem (p = igralec ali {emoji,color})
ui.who(p);                                            // HTML: avatar + vzdevek + značka + naslov (z opremo)
ui.name(p); ui.coins(1240);                           // vzdevek z barvo · '1.240'
ui.esc(text);                                         // escape za HTML
```

### CSS razredi (`ui.css`)
- postavitev: `mg-container`, `mg-stack`, `mg-row`, `mg-row--between`, `mg-spacer`, `mg-grid`, `mg-grid--2`
- `mg-card` (`--glow`, `--flat`), `mg-title` (pikselna pisava, `h1/h2/h3`), `mg-muted`, `mg-small`, `mg-center`, `mg-hidden`
- gumbi: `mg-btn` + `--primary` `--pink` `--cyan` `--green` `--danger` `--ghost` · `--big` `--small` `--block`
- vnos: `mg-input` (`--code` za kode), `mg-select`, `mg-label`, `mg-field`, `mg-error`, `mg-check`
- `mg-badge` (`--yellow` `--pink` `--cyan` `--green` `--red`), `mg-tabs` + `mg-tab[aria-selected]`
- `mg-table` (+ `mg-rank`, `mg-num`, `tr.mg-me`), `mg-empty`, `mg-avatar`, `mg-xpbar > i`, `mg-kbd`, `mg-spin`, `mg-pulse`
- spremenljivke: `--mg-bg`, `--mg-panel`, `--mg-line`, `--mg-text`, `--mg-dim`, `--mg-yellow`, `--mg-pink`, `--mg-cyan`,
  `--mg-green`, `--mg-red`, `--mg-orange`, `--mg-accent`, `--mg-font`, `--mg-font-title`, `--mg-s1…s7`, `--mg-r1…r3`

---

## Offline način

Če sta `SUPABASE_URL`/`SUPABASE_ANON_KEY` prazna, Supabase ni dosegljiv ali je v URL-ju `?offline=1`:
- profil, XP, lestvice, dosežki, sobe, stanje in poteze so v `localStorage`;
- realtime gre prek `BroadcastChannel` → **multiplayer deluje med zavihki istega brskalnika**;
- vsak zavihek ima svojo identiteto v `sessionStorage` (preživi osvežitev). Prvi zavihek dobi
  glavni profil brskalnika, vsak naslednji hkrati odprt zavihek pa **gostujoči profil** — tako lahko
  multiplayer preizkusiš sam v dveh ali treh zavihkih;
- `?igralec=2` (v obeh načinih) vsili ločeno identiteto — uporabno za testiranje s Supabase.

Omejitve XP (500/klic, 5000/dan), kovancev (dnevna meja 250, števci iger in zmag, en prevzem na nalogo),
pravila nakupa/opreme in pravila sob (polna, začeta, prevzem hosta) so v obeh adapterjih enaka (testi).
