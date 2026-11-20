/* Preprost dogodkovni vodilo: pravila oddajajo dogodke, izris/zvok/DMD jih poslušajo. */

export class Bus {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, []);
    this.map.get(name).push(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    const a = this.map.get(name);
    if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  }
  emit(name, data) {
    const a = this.map.get(name);
    if (a) for (const fn of a.slice()) fn(data || {}, name);
    const all = this.map.get('*');
    if (all) for (const fn of all.slice()) fn(data || {}, name);
  }
}
