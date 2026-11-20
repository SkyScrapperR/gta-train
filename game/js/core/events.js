// Tiny synchronous event bus used to decouple systems (crimes, deaths, pickups, missions, UI).
export class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) { if (!this.map.has(name)) this.map.set(name, []); this.map.get(name).push(fn); return () => this.off(name, fn); }
  off(name, fn) { const l = this.map.get(name); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  emit(name, data) { const l = this.map.get(name); if (l) for (const fn of l.slice()) fn(data); }
}
