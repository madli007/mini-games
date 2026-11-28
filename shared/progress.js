/* =====================================================================
   Napredek igre online — sinhronizacija lokalnih ključev z enim zapisom
   hub.loadSave / hub.writeSave (Supabase: tabela game_saves; offline: db:saves).

   Igra opiše, kateri ključi v shared/storage.js so NAPREDEK (kariera, rekordi,
   odklepi, dnevni poskusi …), kako se preverijo (tuj vnos) in kako se združita
   lokalna in strežniška vrednost. Nastavitve (zvok, kakovost) ostanejo lokalne.

     import { cloudSync, merge as M } from '../../shared/progress.js';
     const cloud = cloudSync(hub, { slot: 'napredek', rules: [
       { name: 'best',    key: uid => `igra:best:${uid}`, check: v => (v >= 0 ? v : undefined), merge: M.max },
       { name: 'daily:',  prefix: uid => `igra:daily:${uid}:`, re: /^\d{4}-\d{2}-\d{2}$/, merge: M.or, cap: 40 },
     ] });
     await cloud.ready;              // po hub.init, PRED branjem napredka (največ ~4 s, nato lokalno)

   Ob zagonu: prebere strežniški zapis, ga po pravilih združi z lokalnimi ključi,
   novo zapiše lokalno in (če se razlikuje) nazaj na strežnik. Obstoječi lokalni
   napredek (pred to spremembo) se tako ob prvem zagonu sam preseli na strežnik.
   Vsak kasnejši S.save/S.remove ujetega ključa sproži sinhronizacijo (z zamikom).

   Konflikti (dve napravi): pravilo `merge(lokalno, oddaljeno)` je čista funkcija.
   Za stanja, ki jih ni mogoče združiti (kariera), uporabi M.newer(score): večji
   `rev` v vrednosti zmaga, ob enakem `rev` tista z več napredka.
   Brisanje: namesto S.remove zapiši »nagrobnik« z večjim rev (sicer se vrednost
   s strežnika vrne).
   ===================================================================== */
import * as S from './storage.js';

export const MAX_SAVE = 60000;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Enaka zapisa (vrstni red imen ni pomemben). */
export function sameBag(a, b) {
  const ka = Object.keys(a || {}), kb = Object.keys(b || {});
  return ka.length === kb.length && ka.every(k => k in b && same(a[k], b[k]));
}

/* ----------------------------------------------------------- združevanje */

/** Pogosta pravila združevanja (a = lokalno, b = s strežnika; obe že preverjeni). */
export const merge = {
  /** Lokalna vrednost zmaga (privzeto). */
  local: (a) => a,
  max: (a, b) => Math.max(a, b),
  min: (a, b) => Math.min(a, b),
  /** Zastavica: enkrat true, vedno true (npr. »dnevni poskus porabljen«). */
  or: (a, b) => a || b,
  /** Unija seznamov (urejena, največ `cap` zadnjih). */
  union: (cap = 1000) => (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])].sort().slice(-cap),
  /** Objekt števil: po ključih manjši (časi) / večji (točke). */
  minBy: (a, b) => byKey(a, b, Math.min),
  maxBy: (a, b) => byKey(a, b, Math.max),
  /** Daljši seznam (zgodovina brez id-jev); ob enaki dolžini lokalni. */
  longer: (a, b) => ((Array.isArray(b) ? b.length : 0) > (Array.isArray(a) ? a.length : 0) ? b : a),
  /**
   * Celo stanje: večji `rev` zmaga, ob enakem rev več napredka (score), ob enakem lokalno.
   * @param {(v:any)=>number} [score]
   */
  newer: (score = () => 0) => (a, b) => {
    const ra = a?.rev | 0, rb = b?.rev | 0;
    if (ra !== rb) return ra > rb ? a : b;
    return score(b) > score(a) ? b : a;
  },
  /** Novejši po časovnem žigu polja `t` (npr. shranjen turnir; nagrobnik { gone: true, t }). */
  latest: (a, b) => ((b?.t || 0) > (a?.t || 0) ? b : a),
};
function byKey(a, b, fn) {
  const out = { ...(isObj(b) ? b : {}) };
  for (const [k, v] of Object.entries(isObj(a) ? a : {})) out[k] = k in out ? fn(v, out[k]) : v;
  return out;
}

/** Pravilo za ime v zapisu (ali null). */
export function ruleFor(rules, name) {
  for (const r of rules) {
    if (r.key) { if (r.name === name) return r; continue; }
    if (name.startsWith(r.name)) {
      const suf = name.slice(r.name.length);
      if (suf && suf.length <= 80 && (!r.re || r.re.test(suf))) return r;
    }
  }
  return null;
}

/** Preveri vrednost po pravilu: vrne vrednost ali undefined (zavrženo). */
function checked(rule, v) {
  if (v === undefined || v === null) return undefined;
  if (!rule.check) return v;
  try { const out = rule.check(v); return out === null ? undefined : out; } catch { return undefined; }
}

/** Kratka zgoščena vrednost JSON (FNV-1a) — osnova za tristransko združevanje. */
export function hashOf(v) {
  if (v === undefined || v === null) return '-';
  const s = JSON.stringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + s.length.toString(36);
}
/** Osnova (ime → zgoščena vrednost) za zapis. */
export const baseOf = bag => Object.fromEntries(Object.entries(bag || {}).map(([k, v]) => [k, hashOf(v)]));

/**
 * Združi lokalni in strežniški zapis ({ ime: vrednost }) po pravilih. Čista funkcija (testi).
 * `base` (ime → hashOf zadnjega skupnega stanja) omogoči tristransko združevanje: če se je spremenila
 * le ena stran, zmaga ta (tudi urejanje in brisanje); šele ko sta se spremenili obe, odloči `merge`.
 * Brez osnove (prvi zagon, selitev) vedno odloči `merge`.
 * Neznana imena in neveljavne vrednosti se zavržejo; predponska pravila s `cap` obdržijo zadnjih N.
 * @returns {Record<string, any>}
 */
export function mergeBags(rules, local, remote, base = null) {
  const L = isObj(local) ? local : {}, R = isObj(remote) ? remote : {};
  const out = {};
  for (const name of new Set([...Object.keys(L), ...Object.keys(R), ...Object.keys(base || {})])) {
    const rule = ruleFor(rules, name);
    if (!rule) continue;
    const a = checked(rule, L[name]), b = checked(rule, R[name]);
    const badRemote = R[name] != null && b === undefined;   // tuj neveljaven vnos: prezri
    const h = base ? base[name] : undefined;
    let v;
    if (badRemote) v = a;
    else if (h !== undefined && hashOf(a) === h) v = b;        // lokalno nespremenjeno → strežnik (tudi brisanje)
    else if (h !== undefined && hashOf(b) === h) v = a;        // strežnik nespremenjen → lokalno
    else if (a === undefined) v = b;
    else if (b === undefined) v = a;
    else { try { v = (rule.merge || merge.local)(a, b); } catch { v = a; } }
    if (v !== undefined) out[name] = v;
  }
  for (const r of rules) {
    if (r.key || !r.cap) continue;
    const names = Object.keys(out).filter(n => ruleFor(rules, n) === r).sort();
    for (const n of names.slice(0, Math.max(0, names.length - r.cap))) delete out[n];
  }
  return out;
}

/* ----------------------------------------------------------- lokalni ključi */

/** Seznam [ime, lokalni ključ] za vse lokalne ključe, ki jih pravila zajamejo. */
export function localEntries(rules, uid, store = S) {
  const out = [];
  for (const r of rules) {
    if (r.key) { out.push([r.name, r.key(uid)]); continue; }
    const p = r.prefix(uid);
    for (const k of store.keys(p)) {
      const suf = k.slice(p.length);
      if (suf && (!r.re || r.re.test(suf))) out.push([r.name + suf, k]);
    }
  }
  return out;
}
/** Lokalni ključ za ime iz zapisa (ali null). */
export function localKeyOf(rules, uid, name) {
  const r = ruleFor(rules, name);
  if (!r) return null;
  return r.key ? r.key(uid) : r.prefix(uid) + name.slice(r.name.length);
}
/** Preberi lokalni zapis. */
export function collect(rules, uid, store = S) {
  const bag = {};
  for (const [name, k] of localEntries(rules, uid, store)) {
    const v = store.load(k, null);
    if (v !== null && v !== undefined) bag[name] = v;
  }
  return bag;
}

/** Skrči zapis pod mejo (igra lahko poda svoj `shrink`, sicer odreže najstarejša predponska imena). */
export function fitBag(bag, { shrink, max = MAX_SAVE } = {}) {
  let b = bag;
  const size = x => JSON.stringify({ v: 1, k: x }).length;
  if (size(b) <= max) return b;
  if (shrink) { try { b = shrink(structuredClone(b), max) || b; } catch { /* */ } }
  if (size(b) <= max) return b;
  const names = Object.keys(b).sort();
  b = { ...b };
  while (names.length && size(b) > max) delete b[names.shift()];
  return b;
}

/* ----------------------------------------------------------- sinhronizacija */

/**
 * Vklopi sinhronizacijo napredka igre.
 * @param {*} hub shared/hub.js (po hub.init)
 * @param {{slot?:string, rules:Object[], shrink?:Function, delay?:number, timeout?:number, onRemote?:(names:string[])=>void}} opt
 *   rules: { name, key: uid => ključ } ali { name: 'predpona:', prefix: uid => ključ, re?, cap? };
 *          + check(v) → v | undefined (validacija tujega vnosa), merge(a, b) → v
 *   onRemote: imena, ki jih je strežnik lokalno spremenil (po prvem zagonu — npr. osveži meni)
 * @returns {{ready:Promise<void>, sync:()=>Promise<boolean>, flush:()=>void, stop:()=>void}}
 */
export function cloudSync(hub, opt) {
  const { slot = 'main', rules, shrink, delay = 1500, timeout = 4000, onRemote } = opt;
  const uid = hub.userId;
  if (!uid) return { ready: Promise.resolve(), sync: async () => false, flush() {}, stop() {} };
  let applying = false, timer = null, busy = null, again = false, first = true;
  let remoteBag = {}, remoteRev = 0;
  // osnova = zgoščene vrednosti strežniškega zapisa ob zadnji uspešni sinhronizaciji (lokalno, ne gre na strežnik)
  const baseKey = `progress:${hub.gameId}:${slot}:${uid}`;
  let base = isObj(S.load(baseKey, null)) ? S.load(baseKey, null) : null;
  const setBase = bag => { base = baseOf(bag); S.save(baseKey, base); };
  const watched = key => {
    for (const r of rules) {
      if (r.key ? r.key(uid) === key : key.startsWith(r.prefix(uid))) return true;
    }
    return false;
  };

  async function write(bag) {
    const ok = await hub.writeSave({ v: 1, k: bag }, { slot, rev: remoteRev + 1 });
    if (ok) { remoteBag = bag; remoteRev++; setBase(bag); }
    return ok;
  }

  async function run() {
    let remote;
    // neposredno prek adapterja: »ni zapisa« (null) ≠ napaka (brez povezave) — ob napaki ne spreminjaj ničesar
    try { remote = await hub.backend.loadSave({ game: hub.gameId, slot }); }
    catch (e) { console.warn('[progress] branje napredka ni uspelo:', e?.message || e); return false; }
    remoteBag = remote && isObj(remote.data) && isObj(remote.data.k) ? remote.data.k : {};
    remoteRev = Math.max(remoteRev, remote?.rev | 0);
    const local = collect(rules, uid);
    if (!remote) base = null;   // na strežniku ni zapisa (nov igralec, izbrisana baza): nič ne briši, vse pošlji
    const merged = mergeBags(rules, local, remoteBag, base);
    const changed = [];
    applying = true;
    try {
      for (const [name, v] of Object.entries(merged)) {
        if (same(v, local[name])) continue;
        const k = localKeyOf(rules, uid, name);
        if (k) { S.save(k, v); changed.push(name); }
      }
      // brisanje z druge naprave: ime je bilo v osnovi, zdaj ga ni več
      for (const name of Object.keys(local)) {
        if (name in merged || !base || !(name in base)) continue;
        const k = localKeyOf(rules, uid, name);
        if (k) { S.remove(k); changed.push(name); }
      }
    } finally { applying = false; }
    if (changed.length && !first && onRemote) { try { onRemote(changed); } catch (e) { console.warn(e); } }
    first = false;
    const out = fitBag(merged, { shrink });
    if (!sameBag(out, remoteBag)) return write(out);
    setBase(remoteBag);
    return true;
  }

  /** Preberi, združi, zapiši (zaporedno; med tekom zahtevan sync se izvede še enkrat). */
  async function sync() {
    clearTimeout(timer);
    if (busy) { again = true; return busy; }
    busy = run().catch(e => { console.warn('[progress] sinhronizacija:', e?.message || e); return false; });
    const res = await busy;
    busy = null;
    if (again) { again = false; return sync(); }
    return res;
  }

  /** Takoj pošlji lokalno stanje (ob zapiranju strani; brez branja). */
  function flush() {
    if (!timer) return;
    clearTimeout(timer); timer = null;
    write(fitBag(mergeBags(rules, collect(rules, uid), remoteBag, base), { shrink })).catch(() => {});
  }

  const off = S.onChange(key => {
    if (applying || !watched(key)) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; sync(); }, delay);
  });
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onHide);
    addEventListener('pagehide', flush);
  }

  const ready = Promise.race([sync().then(() => {}), new Promise(r => setTimeout(r, timeout))]);
  return {
    ready, sync, flush,
    stop() { off(); clearTimeout(timer); if (typeof document !== 'undefined') { document.removeEventListener('visibilitychange', onHide); removeEventListener('pagehide', flush); } },
  };
}
