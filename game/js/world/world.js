// World assembly: generates the city, builds chunk meshes, colliders, road graph, props and water.
import { generateCity, LANDMARK_DEFS } from './city.js';
import { CityMeshBuilder } from './city-meshes.js';
import { CollisionWorld } from './collision.js';
import { RoadGraph } from './roads.js';
import { StreetProps } from './props.js';
import { buildWater, buildShoreTexture, SHORE_RECT } from './water.js';
import { buildSignAtlas } from './signs.js';
import { createTextureFromCanvas } from '../engine/gl.js';

export class World {
  // Built in steps so the loading screen can show progress.
  async build(gl, onProgress = () => {}) {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    onProgress(0.02, 'Generating city');
    this.city = generateCity();
    this.collision = new CollisionWorld();
    this.roads = new RoadGraph();
    await tick();
    onProgress(0.08, 'Painting signs');
    this.atlas = createTextureFromCanvas(gl, buildSignAtlas());
    await tick();
    const cm = new CityMeshBuilder(this.city, this.collision);
    const steps = ['Laying roads', 'Painting markings', 'Raising towers', 'Raising towers', 'Placing props', 'Shaping the coast'];
    const fns = [() => cm.buildGround(), () => cm.buildMarkings(), () => cm.buildBuildings(0), () => cm.buildBuildings(1), () => cm.buildProps(), () => cm.buildCoast()];
    for (let i = 0; i < fns.length; i++) { onProgress(0.1 + i * 0.12, steps[i]); await tick(); fns[i](); }
    onProgress(0.82, 'Uploading meshes');
    await tick();
    this.chunks = cm.finish(gl);
    this.props = new StreetProps(gl, this.city, this.roads, this.collision);
    onProgress(0.9, 'Filling the sea');
    await tick();
    this.water = { mesh: buildWater(gl), shore: buildShoreTexture(gl), rect: SHORE_RECT };
    this.landmarks = this.city.landmarks;
    onProgress(1, 'Ready');
  }
  update(dt, camPos, night) {
    this.roads.update(dt);
    this.props.update(dt, camPos, night);
  }
  collectLights(out, camPos, night) {
    this.props.collectLights(out, camPos, night);
    // neon billboards and crane lights
    for (const l of this.city.billboardLights || []) {
      const dx = l.x - camPos[0], dz = l.z - camPos[2];
      if (dx * dx + dz * dz > 200 * 200) continue;
      out.push({ x: l.x, y: l.y, z: l.z, radius: 26, r: [1, 0.2, 1, 0.1, 0.8, 0.7, 1, 1][l.brand] ?? 1, g: 0.5, b: 0.9, intensity: 1.6 * (0.3 + night) });
    }
    if (night > 0.2) for (const l of this.city.craneLights || []) out.push({ x: l.x, y: l.y, z: l.z, radius: 45, r: 1, g: 0.85, b: 0.6, intensity: 3 * night, dir: [0, -1, 0], cos: 0.6 });
    const tw = this.landmarks.tower;
    if (tw) out.push({ x: tw.top.x, y: tw.top.y - 8, z: tw.top.z, radius: 60, r: 0.8, g: 0.3, b: 1, intensity: 3 * (0.3 + night), priority: 2 });
  }
  batches() { return this.props.batches(); }
}
export { LANDMARK_DEFS };
