/* =====================================================================
   POTAPLJANJE LADJIC — vsebina (čisti podatki, brez DOM-a):
   kapitani, predmeti, modifikatorji dneva, pogodbe, komentator, dosežki.
   ===================================================================== */

/** Kapitani: aktivna sposobnost (cena v mani) + pasivka. */
export const CAPTAINS = {
  sonar: {
    id: 'sonar', name: 'Sonar', icon: '📡', cost: 4, color: '#4de1ff',
    ability: 'Sonar 3×3', abilityDesc: 'Razkrije, katera polja v kvadratu 3×3 imajo ladjo (ne katera ladja).',
    passive: 'Prvi zadetek igre pokaže, ali ladja leži vodoravno ali navpično.',
    needs: 'cell',
  },
  torpedo: {
    id: 'torpedo', name: 'Torpedo', icon: '🚀', cost: 5, color: '#ff8a1f',
    ability: 'Torpedo', abilityDesc: 'Izstreli po vrstici ali stolpcu — zadene prvo ladjo na poti, prazna polja razkrije.',
    passive: '+1 mana ob vsaki potopitvi.',
    needs: 'line',
  },
  vaba: {
    id: 'vaba', name: 'Vaba', icon: '🎈', cost: 3, color: '#ff4fd8',
    ability: 'Lažna ladja', abilityDesc: 'Na svojo mrežo postavi lažno 2-polje ladjo. Ob zadetku javi »zadetek« … in nato »vaba!«.',
    passive: 'Prva prejeta potopitev se šteje le kot zadetek — ladja ostane z enim poljem.',
    needs: 'own',
  },
  popravilo: {
    id: 'popravilo', name: 'Popravilo', icon: '🔧', cost: 4, color: '#39ff88',
    ability: 'Popravilo', abilityDesc: 'Obnovi eno zadeto (ne potopljeno) polje svoje ladje.',
    passive: 'Vsak 4. krog samodejno +1 mana.',
    needs: 'ownHit',
  },
  emp: {
    id: 'emp', name: 'EMP', icon: '⚡', cost: 6, color: '#ffd23f',
    ability: 'EMP', abilityDesc: 'Izbrani nasprotnik preskoči naslednjo potezo (istega ne dvakrat zapored).',
    passive: 'Nasprotniki vidijo tvojo mano narobe za ±1.',
    needs: 'player',
  },
  kasetna: {
    id: 'kasetna', name: 'Kasetna bomba', icon: '💥', cost: 5, color: '#ff3b5c',
    ability: 'Kasetna bomba', abilityDesc: '4 naključna neodkrita polja na izbrani mreži.',
    passive: 'Zgrešeni streli dajo +3 mane namesto +2.',
    needs: 'player',
  },
};
export const CAPTAIN_IDS = Object.keys(CAPTAINS);

/** Predmeti iz zabojev (inventar največ 2). Uporaba predmeta ne porabi poteze. */
export const ITEMS = {
  radar: { id: 'radar', name: 'Radar', icon: '🛰️', desc: 'Razkrije eno naključno polje ladje izbranega nasprotnika.', needs: 'player' },
  mina: { id: 'mina', name: 'Mina', icon: '💣', desc: 'Postavi na svojo mrežo. Kdor jo zadene, izgubi naslednjo potezo.', needs: 'own' },
  dvojni: { id: 'dvojni', name: 'Dvojni strel', icon: '🎯', desc: 'V tej potezi streljaš dvakrat.', needs: null },
  scit: { id: 'scit', name: 'Ščit', icon: '🛡️', desc: 'Naslednji zadetek na tvojo mrežo se odbije.', needs: null },
};
export const ITEM_IDS = Object.keys(ITEMS);

/** Modifikatorji dnevnega izziva. */
export const MODIFIERS = {
  megla: { id: 'megla', name: 'Megla', icon: '🌫️', desc: 'Sonar stane 1 mano manj.' },
  nevihta: { id: 'nevihta', name: 'Nevihta', icon: '🌪️', desc: 'Vsak 5. strel veter odnese za 1 polje.' },
  zlato: { id: 'zlato', name: 'Zlata obala', icon: '🪙', desc: 'Dvojna mana za zgrešene strele.' },
  plima: { id: 'plima', name: 'Plima', icon: '🌊', desc: 'Začneš s 5 mane.' },
  zakladi: { id: 'zakladi', name: 'Otok zakladov', icon: '🏝️', desc: 'Na mreži so skriti 3 zaboji.' },
};
export const MODIFIER_IDS = Object.keys(MODIFIERS);

/** Kapitani, ki imajo smisel v dnevnem izzivu (AI ne strelja nazaj). */
export const DAILY_CAPTAINS = ['sonar', 'torpedo', 'kasetna'];

/**
 * Skrivne pogodbe. check(p, st, ctx) → true, ko je izpolnjena.
 *   p — igralec (stats), st — stanje, ctx.end — ob koncu igre (ctx.won)
 */
export const CONTRACTS = [
  { id: 'torp-sink', text: 'Potopi ladjo s torpedom', icon: '🚀', check: p => p.stats.torpSinks >= 1 },
  { id: 'streak3', text: 'Zadeni 3× zapored', icon: '🔥', check: p => p.stats.bestStreak >= 3 },
  { id: 'elim', text: 'Izloči nasprotnika (potopi mu zadnjo ladjo)', icon: '☠️', check: p => p.stats.kills >= 1 },
  { id: 'big-safe', text: 'Zmagaj, ne da bi izgubil ladjo 4+', icon: '🛳️', check: (p, st, c) => c.end && c.won && !p.ships.some(s => s.size >= 4 && s.sunk) },
  { id: 'ability3', text: 'Uporabi sposobnost 3×', icon: '✨', check: p => p.stats.abilities >= 3 },
  { id: 'crates2', text: 'Poberi 2 zaboja', icon: '📦', check: p => p.stats.crates >= 2 },
  { id: 'emp-hit', text: 'Preživi EMP in v naslednji potezi zadeni', icon: '⚡', check: p => p.stats.empHit >= 1 },
  { id: 'sink3', text: 'Potopi 3 ladje', icon: '⚓', check: p => p.stats.sinks >= 3 },
  { id: 'mana10', text: 'Napolni mano do 10', icon: '🔮', check: p => p.stats.maxMana >= 10 },
  { id: 'first-blood', text: 'Prvi zadetek igre je tvoj', icon: '🩸', check: p => p.stats.firstBlood >= 1 },
  { id: 'sink-small', text: 'Potopi najmanjšo ladjo (2 polji)', icon: '🚤', check: p => p.stats.smallSinks >= 1 },
  { id: 'items2', text: 'Uporabi 2 predmeta', icon: '🎒', check: p => p.stats.items >= 2 },
  { id: 'last-stand', text: 'Preživi 3 kroge z le eno ladjo', icon: '🫀', check: p => p.stats.lastStandRounds >= 3 },
  { id: 'intel-hit', text: 'Zadeni polje, ki si ga prej odkril s sonarjem ali radarjem', icon: '🛰️', check: p => p.stats.intelHits >= 1 },
  { id: 'comeback5', text: 'Zgreši 5× zapored in vseeno zmagaj', icon: '🎲', check: (p, st, c) => c.end && c.won && p.stats.maxMissStreak >= 5 },
];
export const contractById = id => CONTRACTS.find(c => c.id === id);

/**
 * Komentator: vrstice po vrsti dogodka. {a} = strelec, {b} = tarča, {n} = število.
 * Skupaj vsaj 25 variant, izbira brez takojšnjega ponavljanja.
 */
export const LINES = {
  hit: [
    'Bum! {a} zadene {b}.',
    '{a} je našel železo.',
    'Zadetek! {b} je začutil/a tresljaj.',
    'Neposreden zadetek v {b}!',
  ],
  streak2: ['Dvojni zadetek!', '{a} se ogreva — dva zapored!'],
  streak3: ['Trojni niz! Kdo ga bo ustavil?', '{a} je v ognju — {n} zapored!', 'Niz {n}! {a} ne zgreši.'],
  miss: [
    'Pljusk. Ribe so prestrašene.',
    '{a} je zadel/a samo valove.',
    'Mimo! Mana pa raste …',
    'Ups, morje je danes veliko.',
    '{a} lovi meduze.',
  ],
  missStreak: ['{a} že {n}× mimo. Comeback se kuha?', 'Smolar dneva: {a} ({n}× mimo).'],
  sink: [
    'Potopljeno! {b} je izgubil/a ladjo.',
    'Ladja kapitana {b} je šla ribe hranit.',
    '{a} pošlje ladjo na dno.',
    'Glu glu glu … {b} je ob ladjo.',
    'Na dno! {a} ne pozna milosti.',
  ],
  elim: ['{b} je izločen/a! {a} pobere skalp.', 'Zbogom, {b}. Morje ne odpušča.', '{b} je zdaj duh. Buuu.'],
  emp: ['EMP! {b} ta krog spi.', '{a} izklopi {b}. Lučke ugasnejo.'],
  sonar: ['Ping … ping … {a} posluša morje.', 'Sonar zazna sumljive sence.'],
  torpedo: ['Torpedo v vodi!', '{a} izstreli torpedo — vsi držijo dih.'],
  kasetna: ['Kasetna bomba! Dežuje železo.', '{a} posipa morje z bombami.'],
  vaba: ['Vaba! {a} je ugriznil/a.', 'Ha! To je bil le balon. {a} je nasedel/a.'],
  shield: ['Ščit! Strel se odbije od {b}.', 'Klank! {b} ima ščit.'],
  mine: ['Mina! {a} izgubi naslednjo potezo.', 'Bum pod vodo — {a} je zapeljal/a na mino.'],
  crate: ['{a} pobere zaboj: {n}!', 'Zaboj! {a} dobi {n}.'],
  repair: ['{a} zakrpa luknjo.', 'Varilci na delo: {a} popravlja.'],
  decoySet: ['{a} spušča nekaj v vodo … sumljivo.'],
  bounty: ['Glava na pladnju! {a} dobi +3 mane.', '{a} unovči nagrado za {b}.'],
  revenge: ['Maščevanje! {a} vrača udarec.'],
  meteor: ['Meteor iz onstranstva! {a} se maščuje kot duh.', 'Duh {a} pošlje meteor na {b}.'],
  saved: ['{b} je preživel/a potopitev — ladja visi na eni nitki!'],
  lastShip: ['{b} ima samo še eno ladjo. Zadnji zdihljaj!'],
  timeout: ['{a} je zaspal/a — naključen strel.'],
  storm: ['Veter odnese strel!'],
  win: ['{a} je kralj/ica morja!', 'Konec! {a} vlada valovom.'],
};

/** Število vseh variant (test: ≥ 25). */
export const LINE_COUNT = Object.values(LINES).reduce((a, l) => a + l.length, 0);

/** Dosežki igre. */
export const ACHIEVEMENTS = [
  { key: 'prva-krv', title: 'Prva krv', icon: '🩸', desc: 'Prvi zadetek v igri ladjic' },
  { key: 'admiral', title: 'Admiral', icon: '🎖️', desc: 'Premagaj AI na težavnosti Admiral' },
  { key: 'brez-praske', title: 'Brez praske', icon: '🛡️', desc: 'Zmagaj dvoboj brez izgubljene ladje' },
  { key: 'royale', title: 'Kralj morja', icon: '👑', desc: 'Zmagaj battle royale z vsaj 5 igralci' },
  { key: 'comeback', title: 'Vstajenje', icon: '🫀', desc: 'Zmagaj z le še eno preživelo ladjo' },
  { key: 'torpedist', title: 'Torpedist', icon: '🚀', desc: 'Potopi ladjo z enim torpedom' },
  { key: 'vaba', title: 'Nasedli so', icon: '🎈', desc: 'Nasprotnik zadene tvojo vabo' },
  { key: 'snajper', title: 'Snajper', icon: '🎯', desc: 'Dnevni izziv v največ 30 strelih' },
  { key: 'pogodbenik', title: 'Plačanec', icon: '📜', desc: 'Izpolni 10 pogodb (skupno)' },
  { key: 'duh', title: 'Maščevanje iz groba', icon: '👻', desc: 'Kot duh z meteorjem potopi ladjo' },
  { key: 'vsi-kapitani', title: 'Flota legend', icon: '⚓', desc: 'Zmagaj z vsakim kapitanom vsaj enkrat' },
];

/** Emote reakcije. */
export const EMOTES = ['😂', '😱', '🔥', '🫡', '🧂', '👀'];
