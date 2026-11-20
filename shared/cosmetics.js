/* =====================================================================
   MINI GAMES — katalog kozmetike (čista logika, brez DOM-a).

   Vsak predmet: { id, kind, name, desc, rarity, price, unlock, value?, anim? }
     kind    — slot: emoji · bg · frame · name · title · badge · win · banner
     rarity  — common · rare · epic · legendary
     price   — v kovancih (0 = brezplačno ali odklep s pogojem)
     unlock  — null | { free: true } | { level: N } | { achievement: 'igra:ključ' } | { streak: N }
     value   — emoji / CSS ozadje / besedilo naslova / ime učinka (odvisno od vrste)
     anim    — animirano (spoštuje prefers-reduced-motion)
   Izgled: shared/cosmetics.css (razredi mgc-<id>).

   MORA se ujemati s tabelo public.shop_items v supabase/schema.sql
   (test »katalog = SQL«). SQL blok ustvari: node tools/shop-sql.mjs
   ===================================================================== */

import { rng } from './util.js';
import { COINS, offerPrice } from './economy.js';

/** Sloti opreme (vrstni red = zavihki v trgovini). */
export const SLOTS = ['frame', 'emoji', 'bg', 'name', 'title', 'badge', 'win', 'banner'];

export const SLOT_LABEL = {
  frame: 'Okvirji', emoji: 'Emoji', bg: 'Ozadja', name: 'Vzdevek',
  title: 'Naslovi', badge: 'Značke', win: 'Učinki', banner: 'Pasice',
};
/** Ednina (za »Opremljen okvir« ipd.). */
export const SLOT_ONE = {
  frame: 'okvir', emoji: 'emoji', bg: 'ozadje', name: 'barva vzdevka',
  title: 'naslov', badge: 'značka', win: 'učinek ob zmagi', banner: 'pasica',
};

export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_LABEL = { common: 'Navadno', rare: 'Redko', epic: 'Epsko', legendary: 'Legendarno' };

const C = 'common', R = 'rare', E = 'epic', L = 'legendary';
const FREE = { free: true };

/* eslint-disable max-len */
/** @type {{id:string, kind:string, name:string, desc:string, rarity:string, price:number, unlock:Object|null, value?:string, anim?:boolean, active?:boolean}[]} */
export const CATALOG = [
  /* ---------------------------------------------------------------- okvirji */
  { id: 'frame-thin', kind: 'frame', name: 'Tanek rob', desc: 'Preprost bel rob.', rarity: C, price: 0, unlock: FREE },
  { id: 'frame-thin-cyan', kind: 'frame', name: 'Tanek modri', desc: 'Tanek rob v cian barvi.', rarity: C, price: 50, unlock: null },
  { id: 'frame-thin-pink', kind: 'frame', name: 'Tanek roza', desc: 'Tanek rob v roza barvi.', rarity: C, price: 50, unlock: null },
  { id: 'frame-double', kind: 'frame', name: 'Dvojni', desc: 'Dvojni rumen rob.', rarity: C, price: 120, unlock: null },
  { id: 'frame-neon-pink', kind: 'frame', name: 'Neon roza', desc: 'Žareč roza neon.', rarity: R, price: 250, unlock: null },
  { id: 'frame-neon-cyan', kind: 'frame', name: 'Neon modri', desc: 'Žareč cian neon.', rarity: R, price: 250, unlock: null },
  { id: 'frame-neon-green', kind: 'frame', name: 'Neon zeleni', desc: 'Žareč zelen neon.', rarity: R, price: 250, unlock: null },
  { id: 'frame-neon-yellow', kind: 'frame', name: 'Neon rumeni', desc: 'Žareč rumen neon.', rarity: R, price: 300, unlock: { level: 5 } },
  { id: 'frame-pixel', kind: 'frame', name: '8-bit', desc: 'Pikselni rob s stopničastimi vogali.', rarity: R, price: 400, unlock: null },
  { id: 'frame-bolt', kind: 'frame', name: 'Strela', desc: 'Za tiste s hitrimi prsti.', rarity: R, price: 0, unlock: { achievement: 'reakcija:bliskovit' } },
  { id: 'frame-streak', kind: 'frame', name: 'Vroč niz', desc: '7 dni zapored igranja.', rarity: E, price: 0, unlock: { streak: 7 } },
  { id: 'frame-ice', kind: 'frame', name: 'Ledeni', desc: 'Hladen sij in snežinka.', rarity: E, price: 700, unlock: null, anim: true },
  { id: 'frame-arcade', kind: 'frame', name: 'Arkadni', desc: 'Utripa kot stari avtomat.', rarity: E, price: 800, unlock: null, anim: true },
  { id: 'frame-fire', kind: 'frame', name: 'Plameni', desc: 'Plapolajoč ognjeni sij.', rarity: E, price: 900, unlock: null, anim: true },
  { id: 'frame-crown', kind: 'frame', name: 'Krona', desc: 'Zlat rob s krono v kotu.', rarity: E, price: 950, unlock: { level: 10 } },
  { id: 'frame-gold', kind: 'frame', name: 'Zlati z bleščico', desc: 'Kovinsko zlato, ki se zaiskri.', rarity: E, price: 1000, unlock: null, anim: true },
  { id: 'frame-rainbow', kind: 'frame', name: 'Mavrični', desc: 'Animiran mavrični obroč.', rarity: L, price: 3500, unlock: null, anim: true },
  { id: 'frame-pixel-rainbow', kind: 'frame', name: 'Pikselna mavrica', desc: '8-bit rob, ki menja barve.', rarity: L, price: 4000, unlock: null, anim: true },

  /* ---------------------------------------------------------------- emoji */
  { id: 'emoji-dino', kind: 'emoji', name: 'Dino', desc: 'Rjovi!', rarity: C, price: 80, unlock: null, value: '🦖' },
  { id: 'emoji-penguin', kind: 'emoji', name: 'Pingvin', desc: 'Vedno v fraku.', rarity: C, price: 60, unlock: null, value: '🐧' },
  { id: 'emoji-owl', kind: 'emoji', name: 'Sova', desc: 'Nočna ptica.', rarity: C, price: 60, unlock: null, value: '🦉' },
  { id: 'emoji-donut', kind: 'emoji', name: 'Krof', desc: 'Sladko.', rarity: C, price: 60, unlock: null, value: '🍩' },
  { id: 'emoji-bee', kind: 'emoji', name: 'Čebela', desc: 'Bzz.', rarity: C, price: 70, unlock: null, value: '🐝' },
  { id: 'emoji-otter', kind: 'emoji', name: 'Vidra', desc: 'Igriva.', rarity: C, price: 90, unlock: null, value: '🦦' },
  { id: 'emoji-flamingo', kind: 'emoji', name: 'Flamingo', desc: 'Na eni nogi.', rarity: C, price: 90, unlock: null, value: '🦩' },
  { id: 'emoji-guitar', kind: 'emoji', name: 'Kitara', desc: 'Rock zvezda.', rarity: C, price: 100, unlock: null, value: '🎸' },
  { id: 'emoji-cowboy', kind: 'emoji', name: 'Kavboj', desc: 'Najhitrejši na divjem zahodu.', rarity: C, price: 120, unlock: null, value: '🤠' },
  { id: 'emoji-shark', kind: 'emoji', name: 'Morski pes', desc: 'Lovi rekorde.', rarity: R, price: 250, unlock: null, value: '🦈' },
  { id: 'emoji-wolf', kind: 'emoji', name: 'Volk', desc: 'Lovi v tropu.', rarity: R, price: 250, unlock: null, value: '🐺' },
  { id: 'emoji-eagle', kind: 'emoji', name: 'Orel', desc: 'Pogled od zgoraj.', rarity: R, price: 250, unlock: null, value: '🦅' },
  { id: 'emoji-vampire', kind: 'emoji', name: 'Vampir', desc: 'Igra samo ponoči.', rarity: R, price: 300, unlock: null, value: '🧛' },
  { id: 'emoji-skull', kind: 'emoji', name: 'Lobanja', desc: 'Game over.', rarity: R, price: 300, unlock: null, value: '💀' },
  { id: 'emoji-rainbow', kind: 'emoji', name: 'Mavrica', desc: 'Vse barve.', rarity: R, price: 350, unlock: null, value: '🌈' },
  { id: 'emoji-ninja', kind: 'emoji', name: 'Nindža', desc: 'Tiho in hitro.', rarity: R, price: 400, unlock: null, value: '🥷' },
  { id: 'emoji-wizard', kind: 'emoji', name: 'Čarovnik', desc: 'Pozna vse trike.', rarity: E, price: 600, unlock: null, value: '🧙' },
  { id: 'emoji-ufo', kind: 'emoji', name: 'NLP', desc: 'Od drugod.', rarity: E, price: 700, unlock: null, value: '🛸' },
  { id: 'emoji-dragon', kind: 'emoji', name: 'Zmaj', desc: 'Varuh zakladov.', rarity: E, price: 900, unlock: null, value: '🐉' },
  { id: 'emoji-crown', kind: 'emoji', name: 'Kralj', desc: 'Za vladarje sobe.', rarity: E, price: 0, unlock: { achievement: 'reakcija:zmaga-mp' }, value: '👑' },

  /* ---------------------------------------------------------------- ozadja */
  { id: 'bg-mint', kind: 'bg', name: 'Meta', desc: 'Svež zelen preliv.', rarity: C, price: 80, unlock: null, value: 'linear-gradient(135deg,#1d6b54,#39ff88)' },
  { id: 'bg-sunset', kind: 'bg', name: 'Sončni zahod', desc: 'Oranžno-roza preliv.', rarity: C, price: 100, unlock: null, value: 'linear-gradient(135deg,#ff8a1f,#ff4fd8)' },
  { id: 'bg-ocean', kind: 'bg', name: 'Ocean', desc: 'Globoko modro.', rarity: C, price: 120, unlock: null, value: 'linear-gradient(160deg,#0d2a6b,#4de1ff)' },
  { id: 'bg-dots', kind: 'bg', name: 'Pike', desc: 'Retro pikčast vzorec.', rarity: R, price: 250, unlock: null, value: 'radial-gradient(#ff4fd8 22%,transparent 24%) 0 0/8px 8px,#2a1240' },
  { id: 'bg-stripes', kind: 'bg', name: 'Črte', desc: 'Poševne arkadne črte.', rarity: R, price: 250, unlock: null, value: 'repeating-linear-gradient(45deg,#1b2a6e 0 5px,#2f49b8 5px 10px)' },
  { id: 'bg-checker', kind: 'bg', name: 'Šahovnica', desc: 'Ciljna zastava.', rarity: R, price: 300, unlock: null, value: 'conic-gradient(#222 25%,#555 0 50%,#222 0 75%,#555 0) 0 0/10px 10px' },
  { id: 'bg-silver', kind: 'bg', name: 'Srebro', desc: 'Brušena kovina.', rarity: R, price: 350, unlock: null, value: 'linear-gradient(135deg,#6d7486,#e9eef7 45%,#8d95a8 55%,#d5dbe6)' },
  { id: 'bg-gold', kind: 'bg', name: 'Zlato', desc: 'Polirano zlato.', rarity: E, price: 800, unlock: null, value: 'linear-gradient(135deg,#8a5a00,#ffe27a 45%,#c99a10 55%,#fff1b0)' },
  { id: 'bg-galaxy', kind: 'bg', name: 'Galaksija', desc: 'Zvezde in meglica.', rarity: E, price: 900, unlock: { level: 8 }, value: 'radial-gradient(circle at 30% 30%,#fff 0 1px,transparent 2px) 0 0/9px 9px,radial-gradient(circle at 70% 60%,#7b4dff,transparent 60%),#0a0630' },
  { id: 'bg-aurora', kind: 'bg', name: 'Aurora', desc: 'Animiran sij severnega neba.', rarity: E, price: 1000, unlock: null, value: 'linear-gradient(120deg,#0b3d2e,#39ff88,#4de1ff,#a78bfa,#0b3d2e) 0 0/400% 400%', anim: true },

  /* ---------------------------------------------------------------- barva vzdevka */
  { id: 'name-yellow', kind: 'name', name: 'Rumena', desc: 'Arkadno rumen vzdevek.', rarity: C, price: 60, unlock: null },
  { id: 'name-cyan', kind: 'name', name: 'Cian', desc: 'Moder vzdevek.', rarity: C, price: 60, unlock: null },
  { id: 'name-pink', kind: 'name', name: 'Roza', desc: 'Roza vzdevek.', rarity: C, price: 60, unlock: null },
  { id: 'name-green', kind: 'name', name: 'Zelena', desc: 'Zelen vzdevek.', rarity: C, price: 60, unlock: null },
  { id: 'name-sunset', kind: 'name', name: 'Preliv zahod', desc: 'Oranžno-roza preliv.', rarity: R, price: 300, unlock: null },
  { id: 'name-ice', kind: 'name', name: 'Preliv led', desc: 'Belo-moder preliv.', rarity: R, price: 300, unlock: null },
  { id: 'name-neon', kind: 'name', name: 'Neon sij', desc: 'Žareč neonski napis.', rarity: E, price: 700, unlock: null },
  { id: 'name-gold', kind: 'name', name: 'Zlati lesk', desc: 'Zlat napis z bleskom.', rarity: E, price: 900, unlock: null, anim: true },
  { id: 'name-rainbow', kind: 'name', name: 'Mavrični', desc: 'Animirana mavrica.', rarity: L, price: 4500, unlock: null, anim: true },

  /* ---------------------------------------------------------------- naslovi */
  { id: 'title-novinec', kind: 'title', name: 'Novinec', desc: 'Vsak začne nekje.', rarity: C, price: 0, unlock: FREE, value: 'Novinec' },
  { id: 'title-nocna-ptica', kind: 'title', name: 'Nočna ptica', desc: 'Igra, ko drugi spijo.', rarity: C, price: 100, unlock: null, value: 'Nočna ptica' },
  { id: 'title-mirna-roka', kind: 'title', name: 'Mirna roka', desc: 'Dosežek: brez prezgodnjega klika.', rarity: C, price: 0, unlock: { achievement: 'reakcija:mirna-roka' }, value: 'Mirna roka' },
  { id: 'title-bliskovit', kind: 'title', name: 'Bliskovit', desc: 'Dosežek: povprečje pod 250 ms.', rarity: R, price: 0, unlock: { achievement: 'reakcija:bliskovit' }, value: 'Bliskovit' },
  { id: 'title-party', kind: 'title', name: 'Party žival', desc: 'Dosežek: igra s 4+ igralci.', rarity: R, price: 250, unlock: { achievement: 'reakcija:druzabnez' }, value: 'Party žival' },
  { id: 'title-kralj-sobe', kind: 'title', name: 'Kralj sobe', desc: 'Dosežek: zmaga v dvoboju.', rarity: R, price: 300, unlock: { achievement: 'reakcija:zmaga-mp' }, value: 'Kralj sobe' },
  { id: 'title-flipper', kind: 'title', name: 'Flipper car', desc: 'Za mojstre pinballa.', rarity: R, price: 350, unlock: null, value: 'Flipper car' },
  { id: 'title-zbiratelj', kind: 'title', name: 'Zbiratelj', desc: 'Ima vse.', rarity: R, price: 400, unlock: null, value: 'Zbiratelj' },
  { id: 'title-neustavljiv', kind: 'title', name: 'Neustavljiv', desc: '7 dni zapored igranja.', rarity: E, price: 0, unlock: { streak: 7 }, value: 'Neustavljiv' },
  { id: 'title-veteran', kind: 'title', name: 'Veteran', desc: 'Nivo 10.', rarity: E, price: 0, unlock: { level: 10 }, value: 'Veteran' },
  { id: 'title-pikselni-vitez', kind: 'title', name: 'Pikselni vitez', desc: 'Ščit iz 8 bitov.', rarity: E, price: 600, unlock: null, value: 'Pikselni vitez' },
  { id: 'title-arkadni-mojster', kind: 'title', name: 'Arkadni mojster', desc: 'Žetoni so zate drobiž.', rarity: E, price: 800, unlock: null, value: 'Arkadni mojster' },
  { id: 'title-legenda', kind: 'title', name: 'Legenda', desc: 'Nivo 15 in globok žep.', rarity: L, price: 4000, unlock: { level: 15 }, value: 'Legenda' },

  /* ---------------------------------------------------------------- značke */
  { id: 'badge-pad', kind: 'badge', name: 'Igralec', desc: 'Igralni plošček.', rarity: C, price: 0, unlock: FREE, value: '🎮' },
  { id: 'badge-star', kind: 'badge', name: 'Zvezdica', desc: 'Za dober občutek.', rarity: C, price: 60, unlock: null, value: '⭐' },
  { id: 'badge-moon', kind: 'badge', name: 'Luna', desc: 'Nočna izmena.', rarity: C, price: 70, unlock: null, value: '🌙' },
  { id: 'badge-bolt', kind: 'badge', name: 'Strela', desc: 'Hitro!', rarity: C, price: 80, unlock: null, value: '⚡' },
  { id: 'badge-target', kind: 'badge', name: 'Tarča', desc: 'Natančno v center.', rarity: C, price: 90, unlock: null, value: '🎯' },
  { id: 'badge-fire', kind: 'badge', name: 'Ogenj', desc: 'V formi.', rarity: C, price: 100, unlock: null, value: '🔥' },
  { id: 'badge-rocket', kind: 'badge', name: 'Raketa', desc: 'Na poti navzgor.', rarity: C, price: 120, unlock: null, value: '🚀' },
  { id: 'badge-clover', kind: 'badge', name: 'Detelja', desc: 'Sreča pride prav.', rarity: R, price: 250, unlock: null, value: '🍀' },
  { id: 'badge-invader', kind: 'badge', name: 'Vesoljček', desc: 'Klasika.', rarity: R, price: 300, unlock: null, value: '👾' },
  { id: 'badge-trophy', kind: 'badge', name: 'Pokal', desc: 'Nivo 5.', rarity: R, price: 300, unlock: { level: 5 }, value: '🏆' },
  { id: 'badge-diamond', kind: 'badge', name: 'Diamant', desc: 'Redek in trd.', rarity: E, price: 800, unlock: null, value: '💎' },

  /* ---------------------------------------------------------------- učinki ob zmagi */
  { id: 'win-stars', kind: 'win', name: 'Zvezdice', desc: 'Dež zvezdic ob zmagi.', rarity: C, price: 150, unlock: null, value: 'stars', anim: true },
  { id: 'win-confetti', kind: 'win', name: 'Konfeti', desc: 'Barvni konfeti ob zmagi.', rarity: R, price: 300, unlock: null, value: 'confetti', anim: true },
  { id: 'win-gg', kind: 'win', name: 'GG', desc: 'Velik pikselni napis GG.', rarity: R, price: 350, unlock: null, value: 'gg', anim: true },
  { id: 'win-pixelrain', kind: 'win', name: 'Pikselni dež', desc: 'Padajoči pikseli v barvah arkade.', rarity: E, price: 700, unlock: null, value: 'pixelrain', anim: true },
  { id: 'win-fireworks', kind: 'win', name: 'Ognjemet', desc: 'Pravi ognjemet nad stopničkami.', rarity: E, price: 1000, unlock: null, value: 'fireworks', anim: true },

  /* ---------------------------------------------------------------- pasice */
  { id: 'banner-dots', kind: 'banner', name: 'Pike', desc: 'Pikčasta pasica.', rarity: C, price: 100, unlock: null, value: 'radial-gradient(#ffffff22 20%,transparent 22%) 0 0/14px 14px,linear-gradient(135deg,#25105a,#5a1a6b)' },
  { id: 'banner-sunset', kind: 'banner', name: 'Zahod', desc: 'Topel preliv.', rarity: C, price: 100, unlock: null, value: 'linear-gradient(180deg,#ff8a1f 0%,#ff4fd8 55%,#3b1366 100%)' },
  { id: 'banner-stripes', kind: 'banner', name: 'Dirkalne črte', desc: 'Hitrost.', rarity: C, price: 120, unlock: null, value: 'repeating-linear-gradient(-45deg,#15183a 0 14px,#1f2a7a 14px 28px)' },
  { id: 'banner-synthwave', kind: 'banner', name: 'Synthwave', desc: 'Mreža in sonce iz osemdesetih.', rarity: R, price: 300, unlock: null, value: 'linear-gradient(transparent 55%,#ff4fd855 55% 56%,transparent 56%) 0 0/100% 100%,repeating-linear-gradient(90deg,#ff4fd833 0 1px,transparent 1px 24px),radial-gradient(circle at 50% 62%,#ffd23f 0 18%,transparent 19%),linear-gradient(#1a0638,#5a136b 55%,#12052b 56%)' },
  { id: 'banner-night', kind: 'banner', name: 'Zvezdna noč', desc: 'Mirno nebo.', rarity: R, price: 350, unlock: null, value: 'radial-gradient(circle,#fff 0 1px,transparent 1.5px) 0 0/23px 19px,radial-gradient(circle,#fff8 0 1px,transparent 1.5px) 7px 11px/31px 27px,linear-gradient(#050822,#16205a)' },
  { id: 'banner-aurora', kind: 'banner', name: 'Aurora', desc: 'Animiran severni sij.', rarity: E, price: 900, unlock: null, value: 'linear-gradient(120deg,#0b3d2e,#39ff88,#4de1ff,#a78bfa,#0b3d2e) 0 0/400% 400%', anim: true },
  { id: 'banner-gold', kind: 'banner', name: 'Zlata', desc: 'Za tiste z globokim žepom.', rarity: E, price: 1000, unlock: null, value: 'linear-gradient(135deg,#5a3a00,#ffe27a 30%,#b8860b 50%,#fff1b0 70%,#7a5200)' },
  { id: 'banner-rainbow', kind: 'banner', name: 'Mavrica', desc: 'Animirana legendarna mavrica.', rarity: L, price: 3800, unlock: null, value: 'linear-gradient(90deg,#ff3b5c,#ff8a1f,#ffd23f,#39ff88,#4de1ff,#a78bfa,#ff4fd8,#ff3b5c) 0 0/300% 100%', anim: true },
];
/* eslint-enable max-len */

const BY_ID = new Map(CATALOG.map(i => [i.id, i]));

/** Predmet po id-ju (ali undefined). */
export function item(id) { return id ? BY_ID.get(id) : undefined; }

/** Prazna oprema. */
export function emptyEquipped() {
  return Object.fromEntries(SLOTS.map(s => [s, null]));
}

/** Ali je predmet brezplačen brez pogoja (lahko ga opremi vsak, tudi brez inventarja)? */
export function isFree(it) { return !!it && it.price === 0 && (!it.unlock || it.unlock.free); }

/**
 * Ali igralec izpolnjuje pogoj predmeta?
 * @param {Object|null} unlock
 * @param {{level:number, achievements:Set<string>|string[], streak:number}} st achievements: 'igra:ključ'
 * @returns {{ok:boolean, reason:string|null}} reason: »Odkleni na nivoju 10« ipd.
 */
export function checkUnlock(unlock, { level = 1, achievements = [], streak = 0 } = {}) {
  if (!unlock || unlock.free) return { ok: true, reason: null };
  if (unlock.level != null) return level >= unlock.level ? { ok: true, reason: null } : { ok: false, reason: `Odkleni na nivoju ${unlock.level}` };
  if (unlock.streak != null) return streak >= unlock.streak ? { ok: true, reason: null } : { ok: false, reason: `Odkleni z nizom ${unlock.streak} dni` };
  if (unlock.achievement) {
    const has = (achievements instanceof Set ? achievements : new Set(achievements)).has(unlock.achievement);
    return has ? { ok: true, reason: null } : { ok: false, reason: 'Odkleni z dosežkom' };
  }
  return { ok: false, reason: 'Zaklenjeno' };
}

/** Predmeti, ki lahko pridejo v dnevno ponudbo (plačljivi, aktivni), urejeni po id-ju (kot v SQL: collate "C"). */
export function offerPool(catalog = CATALOG) {
  return catalog.filter(i => i.price > 0 && i.active !== false).map(i => i.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Dnevna ponudba: 4 predmeti s 25 % popustom, isti za vse (rng(dan + ':shop')).
 * Enak algoritem je v SQL (private.mg_daily_offer).
 * @param {string} day 'YYYY-MM-DD' (hub.dailySeed())
 * @returns {string[]} id-ji
 */
export function dailyOffer(day, catalog = CATALOG) {
  return rng(day + ':shop').shuffle(offerPool(catalog)).slice(0, COINS.OFFER_SIZE);
}

/** Cena predmeta danes (upošteva dnevno ponudbo). */
export function priceToday(it, offerIds) {
  return offerIds.includes(it.id) ? offerPrice(it.price) : it.price;
}
