// Weapon definitions and the player's inventory: fists, Kobra 9 pistol, Wasp SMG, Thunder shotgun.
// Handles ammo, magazines, reload timing, fire rate, spread and recoil bloom.
export const WEAPONS = {
  fists: { id: 'fists', name: 'Fists', melee: true, damage: 12, model: null, icon: 'fist' },
  pistol: { id: 'pistol', name: 'Kobra 9', damage: 26, rate: 0.22, mag: 12, reload: 1.3, spread: 0.012, range: 120, model: 'pistol', icon: 'pistol', sound: 'pistol', shake: 0.15, price: 400, ammoPrice: 60, ammoPack: 36 },
  smg: { id: 'smg', name: 'Wasp', damage: 17, rate: 0.075, mag: 30, reload: 1.7, spread: 0.035, range: 100, auto: true, model: 'smg', icon: 'smg', sound: 'smg', twoHanded: true, shake: 0.08, price: 1200, ammoPrice: 120, ammoPack: 90 },
  shotgun: { id: 'shotgun', name: 'Thunder', damage: 14, pellets: 8, rate: 0.85, mag: 6, reload: 2.2, spread: 0.075, range: 45, model: 'shotgun', icon: 'shotgun', sound: 'shotgun', twoHanded: true, shake: 0.45, price: 1500, ammoPrice: 100, ammoPack: 18 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

export class Inventory {
  constructor(game) {
    this.game = game;
    this.owned = { fists: { clip: 0, reserve: 0 } };
    this.currentId = 'fists';
    this.cooldown = 0;
    this.reloading = 0;
    this.bloom = 0;
  }
  get current() { return WEAPONS[this.currentId]; }
  get ammo() { return this.owned[this.currentId] || { clip: 0, reserve: 0 }; }
  give(id, rounds = 0) {
    const w = WEAPONS[id];
    if (!this.owned[id]) { this.owned[id] = { clip: Math.min(w.mag, rounds), reserve: Math.max(0, rounds - w.mag) }; this.currentId = id; }
    else this.owned[id].reserve += rounds;
  }
  has(id) { return !!this.owned[id]; }
  cycle(dir) {
    const ids = WEAPON_ORDER.filter((id) => this.owned[id]);
    const i = ids.indexOf(this.currentId);
    this.currentId = ids[(i + dir + ids.length) % ids.length];
    this.reloading = 0;
    this.game.audio?.play('switch', null, 0.4);
  }
  select(id) { if (this.owned[id]) this.currentId = id; }
  reload() {
    const w = this.current, a = this.ammo;
    if (w.melee || this.reloading > 0 || a.clip >= w.mag || a.reserve <= 0) return;
    this.reloading = w.reload;
    this.game.audio?.play('reload', null, 0.6);
  }
  update(dt) {
    this.cooldown -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 2.5);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const w = this.current, a = this.ammo;
        const take = Math.min(w.mag - a.clip, a.reserve);
        a.clip += take; a.reserve -= take;
        this.game.audio?.play('reloadDone', null, 0.6);
      }
    }
  }
  // Fires along ray {origin, dir}; returns true if a shot happened.
  fire(shooter, ray) {
    const w = this.current, a = this.ammo;
    if (w.melee || this.cooldown > 0 || this.reloading > 0) return false;
    if (a.clip <= 0) { if (a.reserve > 0) this.reload(); else { this.game.audio?.play('dry', null, 0.5); this.cooldown = 0.3; } return false; }
    a.clip--;
    this.cooldown = w.rate;
    this.game.combat.shoot(shooter, w, ray, this.bloom);
    this.bloom = Math.min(1, this.bloom + (w.auto ? 0.12 : 0.35));
    if (a.clip === 0 && a.reserve > 0) this.reload();
    return true;
  }
  serialize() { return { owned: JSON.parse(JSON.stringify(this.owned)), current: this.currentId }; }
  load(s) { if (!s) return; this.owned = s.owned || this.owned; if (!this.owned.fists) this.owned.fists = { clip: 0, reserve: 0 }; this.currentId = this.owned[s.current] ? s.current : 'fists'; }
  loseAmmo() { for (const [id, a] of Object.entries(this.owned)) if (id !== 'fists') { a.reserve = 0; a.clip = Math.min(a.clip, 0); } }
}
