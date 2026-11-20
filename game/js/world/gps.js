// GPS: a route along the road graph from the player to the active objective or a map waypoint,
// refreshed as the player moves. Also provides the 3D waypoint beam position.
export class Gps {
  constructor(game) { this.game = game; this.waypoint = null; this.objective = null; this.route = null; this.timer = 0; this.color = '#d77bff'; }
  setWaypoint(p) { this.waypoint = p; this.timer = 0; if (p) this.game.hud?.toast('Waypoint set', '#d77bff'); }
  setObjective(p, color = '#ffd166') { this.objective = p; this.objColor = color; this.timer = 0; }
  get target() { return this.objective || this.waypoint; }
  update(dt) {
    this.timer -= dt;
    const t = this.target;
    if (!t) { this.route = null; return; }
    const p = this.game.player, pos = p.state === 'driving' && p.vehicle ? p.vehicle : p;
    if (Math.hypot(pos.x - t[0], pos.z - t[1]) < 12) { if (!this.objective && this.waypoint) { this.waypoint = null; this.game.hud?.toast('Arrived', '#d77bff'); } this.route = null; return; }
    if (this.timer > 0) return;
    this.timer = 0.75;
    this.route = this.game.world.roads.routePoints(pos.x, pos.z, t[0], t[1]);
    this.color = this.objective ? this.objColor : '#d77bff';
  }
}
