/* =====================================================================
   SPORT — live-replay.js: tok vnosov aktivnega tekmovalca v živo (brez DOM-a).

   Ker je simulacija igre deterministična, ni treba pošiljati stanja — dovolj
   so vnosi. Aktivni tekmovalec zapisuje SPREMEMBE vnosa po tickih in jih na
   ~100 ms pošlje kot paket { j: jumpId, f: fromTick, t: toTick, c: [[tick, …vrednosti], …] }
   (pokriva ticke [f, t); prazen c = vnos se ni spremenil). Gledalci pakete
   zložijo po vrsti (zamujene/podvojene/izven vrstnega reda uredijo), simulirajo
   isti skok z zamikom ~300 ms in se USTAVIJO, če naslednjega paketa še ni
   (nikoli ne ugibajo). Ob pridružitvi zahtevajo celoten tok od začetka.

   Host na koncu ponovi simulacijo iz celotnega zapisa (verify) — kliče
   funkcijo igre simulate(changes) → rezultat.
   ===================================================================== */

export const PACKET_MS = 100;
export const DELAY_MS = 300;

/* ------------------------------------------------------------ pošiljatelj */

/**
 * Zapisovalnik in pošiljatelj toka vnosov.
 * @param {{jumpId:string, send:(pkt:Object)=>void, every?:number}} o every = ticki na paket (pri 120 TPS 12 ≈ 100 ms)
 */
export function createSender({ jumpId, send, every = 12 }) {
  const changes = [];   // [[tick, ...v]]
  let last = null, sentTo = 0, tick = 0, sentIdx = 0, ended = false;
  const key = v => v.join(',');
  function flush(force = false) {
    if (tick - sentTo < every && !force) return null;
    if (tick <= sentTo && !force) return null;
    const c = changes.slice(sentIdx);
    const pkt = { j: jumpId, f: sentTo, t: tick, c };
    sentIdx = changes.length; sentTo = tick;
    send(pkt);
    return pkt;
  }
  return {
    jumpId, changes,
    get tick() { return tick; },
    /** Vnos za tick (kliči za vsak tick po vrsti). v = polje števil, npr. [btn, pitch×2]. */
    push(t, v) {
      if (ended) return;
      if (!last || key(last) !== key(v)) { changes.push([t, ...v]); last = v.slice(); }
      tick = t + 1;
      flush();
    },
    /** Konec toka: pošlje ostanek in zaključni paket (e: 1). */
    end() {
      if (ended) return;
      ended = true;
      const c = changes.slice(sentIdx);
      sentIdx = changes.length;
      const pkt = { j: jumpId, f: sentTo, t: tick, c, e: 1 };
      sentTo = tick;
      send(pkt);
    },
    /** Celoten tok (za pozno pridružene gledalce in za host). */
    full() { return { j: jumpId, f: 0, t: tick, c: changes.slice(), ...(ended ? { e: 1 } : {}) }; },
  };
}

/* ------------------------------------------------------------ prejemnik */

/**
 * Sprejemnik toka: zloži pakete po vrsti in vrača vnose po tickih.
 * @param {{jumpId:string, delayMs?:number, tps?:number}} o
 */
export function createReceiver({ jumpId, delayMs = DELAY_MS, tps = 120 }) {
  const pending = new Map();   // f → paket (čaka na luknjo)
  const changes = [];
  let have = 0, ended = false, idx = 0, cur = null, playTick = 0, buffered = 0, started = false, lag = 0;
  function accept(pkt) {
    if (!pkt || pkt.j !== jumpId) return false;
    if (!(pkt.f >= 0 && pkt.t >= pkt.f && Array.isArray(pkt.c))) return false;
    if (pkt.f > have) { pending.set(pkt.f, pkt); return true; }   // luknja: počakaj na manjkajoči paket
    if (pkt.t < have || (pkt.t === have && !(pkt.e && !ended))) return false;   // že imamo (podvojen)
    let lastT = changes.length ? changes[changes.length - 1][0] : -1;
    for (const ch of pkt.c) if (Array.isArray(ch) && ch[0] > lastT) { changes.push(ch); lastT = ch[0]; }
    have = pkt.t;
    if (pkt.e) ended = true;
    // zapolni luknjo iz čakajočih paketov
    for (let progressed = true; progressed;) {
      progressed = false;
      for (const [f, p] of pending) if (f <= have) { pending.delete(f); accept(p); progressed = true; break; }
    }
    return true;
  }
  return {
    jumpId, changes,
    accept,
    get have() { return have; },
    get ended() { return ended; },
    get missing() { return pending.size > 0; },
    /** Ali je vnos za tick že na voljo. */
    ready(tick) { return tick < have; },
    /** Vnos za tick (vrednosti brez ticka) ali null, če ga še ni (gledalec počaka). */
    inputAt(tick) {
      if (tick >= have) return null;
      if (tick < (cur ? cur[0] : 0)) { idx = 0; cur = null; }   // previjanje nazaj
      while (idx < changes.length && changes[idx][0] <= tick) { cur = changes[idx]; idx++; }
      return cur ? cur.slice(1) : null;
    },
    /**
     * Koliko tickov naj gledalec simulira v tem okvirju (realni čas dt, s).
     * Začne šele, ko ima vmesni pomnilnik ≥ delayMs; nato teče z realnim časom; če je pomnilnik
     * prevelik (> 2× zamik), rahlo pospeši (×1,25); če vnosa ni, stoji (vrne 0 in stalled = true).
     */
    advance(dt) {
      const delayTicks = Math.round(delayMs / 1000 * tps);
      if (!started) { if (have - playTick >= delayTicks || ended) started = true; else return { n: 0, stalled: false, waiting: true }; }
      const ahead = have - playTick;
      const speed = ended ? 1 : ahead > delayTicks * 2 ? 1.25 : 1;
      buffered += dt * tps * speed;
      let n = Math.floor(buffered);
      buffered -= n;
      const can = Math.max(0, have - playTick);
      const stalled = n > can && !ended;
      if (n > can) { n = can; buffered = 0; }
      playTick += n;
      lag = (have - playTick) / tps;
      return { n, stalled, waiting: false };
    },
    /** Trenutni zamik gledalca za skakalcem (s) — za meritve. */
    get lag() { return lag; },
    get playTick() { return playTick; },
    /** Celoten zapis sprememb (ko je tok končan) — npr. za verify. */
    full() { return changes.slice(); },
  };
}

/* ------------------------------------------------------------ preverjanje pri hostu */

/**
 * Host ponovi simulacijo iz zapisa vnosov in primerja z izračunom tekmovalca.
 * @param {(changes:Array)=>Object} simulate funkcija igre (deterministična)
 * @param {Array} changes zapis vnosov
 * @param {Object} claimed rezultat, ki ga je poslal tekmovalec
 * @param {(a:Object, b:Object)=>boolean} [same] primerjava (privzeto JSON)
 * @returns {{ok:boolean, result:Object}} result = hostov (uradni) rezultat
 */
export function verify(simulate, changes, claimed, same = (a, b) => JSON.stringify(a) === JSON.stringify(b)) {
  const result = simulate(changes);
  return { ok: !!claimed && same(result, claimed), result };
}

/** Funkcija vnosov po tickih iz zapisa sprememb [[tick, …v]] → (tick) => v. */
export function inputFn(changes) {
  let i = 0, cur = null;
  return tick => {
    if (cur && tick < cur[0]) { i = 0; cur = null; }
    while (i < changes.length && changes[i][0] <= tick) { cur = changes[i]; i++; }
    return cur ? cur.slice(1) : null;
  };
}
