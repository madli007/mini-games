/* =====================================================================
   GNEČA — grid.js: prostorska mreža (celice cell × cell) za iskanje
   sosedov. Povezan seznam v tipiziranih poljih: head[celica] → prvi
   indeks, next[indeks] → naslednji v isti celici (-1 = konec).
   ===================================================================== */

export class Grid {
  /**
   * @param {number} width širina steze (x od -width/2 do width/2)
   * @param {number} length dolžina steze (z od 0 do length)
   * @param {number} cell velikost celice
   * @param {number} capacity največ elementov
   */
  constructor(width, length, cell, capacity) {
    this.cell = cell;
    this.x0 = -width / 2 - 1;
    this.z0 = -2;
    this.cols = Math.ceil((width + 2) / cell) + 1;
    this.rows = Math.ceil((length + 4) / cell) + 1;
    this.head = new Int32Array(this.cols * this.rows);
    this.next = new Int32Array(capacity);
    this.clear();
  }

  clear() { this.head.fill(-1); }

  cellOf(x, z) {
    let c = Math.floor((x - this.x0) / this.cell), r = Math.floor((z - this.z0) / this.cell);
    if (c < 0) c = 0; else if (c >= this.cols) c = this.cols - 1;
    if (r < 0) r = 0; else if (r >= this.rows) r = this.rows - 1;
    return r * this.cols + c;
  }

  /** Napolni mrežo iz polj x, z (prvih n). */
  build(xs, zs, n) {
    this.head.fill(-1);
    const head = this.head, next = this.next;
    for (let i = 0; i < n; i++) {
      const k = this.cellOf(xs[i], zs[i]);
      next[i] = head[k];
      head[k] = i;
    }
  }

  /**
   * Pokliči fn(j) za vse elemente v celicah, ki pokrivajo krog (x, z, R).
   * fn vrne true = ustavi iskanje.
   */
  query(x, z, R, fn) {
    const cs = this.cell;
    let c0 = Math.floor((x - R - this.x0) / cs), c1 = Math.floor((x + R - this.x0) / cs);
    let r0 = Math.floor((z - R - this.z0) / cs), r1 = Math.floor((z + R - this.z0) / cs);
    if (c0 < 0) c0 = 0; if (c1 >= this.cols) c1 = this.cols - 1;
    if (r0 < 0) r0 = 0; if (r1 >= this.rows) r1 = this.rows - 1;
    const head = this.head, next = this.next, cols = this.cols;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (let j = head[r * cols + c]; j !== -1; j = next[j]) if (fn(j)) return;
      }
    }
  }
}
