// City generation for Selara Bay: a 10x10 grid of 90 m blocks split into districts, each with its own
// building generator, plus unique landmarks, parks, the beach, the docks and the piers.
// The output is plain data; city-meshes.js turns it into geometry and collision.js into colliders.
import { mulberry32, clamp } from '../core/math.js';

export const BLOCK = 90;
export const GRID = 10;
export const ROAD_HALF = 5.5; // two lanes of 3.5 m plus gutters
export const SIDEWALK = 4;
export const LOT_INSET = ROAD_HALF + SIDEWALK;
export const CITY_SIZE = BLOCK * GRID;
export const LAND = { x0: -30, z0: -30, x1: CITY_SIZE + 30, z1: CITY_SIZE + 30 };
export const BEACH = { x0: -30, z0: CITY_SIZE + 6, x1: CITY_SIZE + 30, z1: CITY_SIZE + 95 };
export const FERRY_PIER = { x0: 440, z0: CITY_SIZE + 60, x1: 452, z1: CITY_SIZE + 190 };
export const EAST_PIER = { x0: CITY_SIZE + 20, z0: 495, x1: CITY_SIZE + 150, z1: 507 };

export const DISTRICTS = {
  kotalama: { name: 'Kota Lama', subtitle: 'Downtown', color: '#58c4ff' },
  kemuning: { name: 'Kemuning', subtitle: 'Midtown', color: '#ffb35c' },
  bukitasri: { name: 'Bukit Asri', subtitle: 'Residential', color: '#9be36b' },
  docks: { name: 'Pier 9 Docks', subtitle: 'Harbour', color: '#ff7b5c' },
  pantai: { name: 'Pantai Selara', subtitle: 'Beachfront', color: '#ffe07a' },
  park: { name: 'Taman Selara', subtitle: 'Park', color: '#5fe0a0' },
};

const PARKS = new Set(['3,6', '1,2', '7,1', '5,7']);

// Landmarks: block, the side their entrance faces and the kind of building.
export const LANDMARK_DEFS = {
  safehouse: { name: 'Safehouse', block: [1, 4], side: 'e', icon: 'house', color: '#7dff9a' },
  garage: { name: "Lin's Garage", block: [3, 5], side: 'n', icon: 'wrench', color: '#ffd166' },
  hospital: { name: 'Selara General Hospital', block: [3, 0], side: 's', icon: 'cross', color: '#ff6b81' },
  police: { name: 'Selara Police HQ', block: [6, 6], side: 'w', icon: 'badge', color: '#5aa9ff' },
  bank: { name: 'Bank Samudra', block: [5, 3], side: 'w', icon: 'bank', color: '#7fe3d6' },
  tower: { name: 'Orchid Tower', block: [5, 4], side: 'n', icon: 'orchid', color: '#d77bff' },
  freight: { name: 'Orchid Freight', block: [9, 6], side: 'w', icon: 'crate', color: '#d77bff' },
  respray: { name: 'Kilat Respray', block: [7, 3], side: 's', icon: 'spray', color: '#4dffd2' },
  guns: { name: 'Bang Bang Arms', block: [2, 7], side: 'n', icon: 'gun', color: '#ff9f43' },
  dex: { name: "Dex's Apartment", block: [7, 7], side: 'w', icon: 'laptop', color: '#9aa7ff' },
  cafe: { name: 'Kedai Orchid', block: [4, 7], side: 'e', icon: 'cup', color: '#ff7ad9' },
};

export const SHOP_NAMES = [
  'WARUNG SARI', 'TOKO BINTANG', 'KOPI SENJA', 'MIE OMBAK', 'APOTEK SEHAT', 'BATIK LESTARI', 'PULSA 24', 'LAUNDRY KILAU',
  'SATE PAK GEDE', 'BAKSO MANTAP', 'SALON AYU', 'ELEKTRONIK JAYA', 'ROTI HANGAT', 'SURF & CO', 'TOKO MAS MULIA', 'NASI CAMPUR',
  'BENGKEL MOTOR', 'OPTIK TERANG', 'BUKU PELANGI', 'ES CENDOL', 'MART 88', 'KAIN INDAH', 'TATTOO NAGA', 'FOTO KILAT',
  'KEDAI ORCHID', 'BANG BANG ARMS', 'KILAT RESPRAY', 'BANK SAMUDRA', "LIN'S GARAGE", 'HOSPITAL', 'POLISI', 'HOTEL CAMAR',
  'HOTEL PASIR', 'BEACH CLUB', 'ORCHID FREIGHT', 'PIER 9', 'GELATO BALI', 'SUSHI KAI', 'KARAOKE BULAN', 'GYM BESI',
];
export const BILLBOARDS = [
  { text: 'NOVA COLA', sub: 'TASTE THE TIDE', bg: ['#ff3b6b', '#7a0d3a'], fg: '#fff' },
  { text: 'ZIPPI', sub: 'MOBILE 6G', bg: ['#2de2ff', '#1b3cff'], fg: '#fff' },
  { text: 'KOPI KILAT', sub: 'WAKE UP FAST', bg: ['#ffb000', '#7a3200'], fg: '#1a0b00' },
  { text: 'OMBAK AIR', sub: 'FLY THE COAST', bg: ['#00e5a0', '#005a68'], fg: '#fff' },
  { text: 'VOLTA', sub: 'ENERGY DRINK', bg: ['#c6ff00', '#2b5d00'], fg: '#0b1400' },
  { text: 'LUMA', sub: 'PHONES', bg: ['#b16cff', '#2c0a6b'], fg: '#fff' },
  { text: 'PADI', sub: 'NOODLES', bg: ['#ff7a2f', '#8c1b00'], fg: '#fff' },
  { text: 'SELARA FM', sub: 'NIGHTS 101.7', bg: ['#ff2fd2', '#2a0050'], fg: '#fff' },
];

export function districtOf(bx, bz) {
  if (PARKS.has(`${bx},${bz}`)) return 'park';
  if (bz === 9 && bx >= 1 && bx <= 8) return 'pantai';
  if (bx >= 8) return 'docks';
  if (bx <= 2) return 'bukitasri';
  if (bx >= 4 && bx <= 6 && bz >= 1 && bz <= 5) return 'kotalama';
  return 'kemuning';
}

const PALETTES = {
  kotalama: { glass: [[0.35, 0.55, 0.75], [0.3, 0.62, 0.6], [0.62, 0.66, 0.72], [0.6, 0.48, 0.36], [0.4, 0.45, 0.65]], wall: [[0.6, 0.6, 0.62], [0.72, 0.7, 0.66], [0.45, 0.47, 0.52]] },
  kemuning: { wall: [[0.72, 0.42, 0.3], [0.86, 0.8, 0.66], [0.8, 0.62, 0.36], [0.85, 0.66, 0.6], [0.6, 0.74, 0.64], [0.78, 0.74, 0.6]] },
  bukitasri: { wall: [[0.9, 0.88, 0.82], [0.88, 0.8, 0.62], [0.72, 0.84, 0.8], [0.9, 0.72, 0.62], [0.8, 0.82, 0.88]], roof: [[0.55, 0.22, 0.13], [0.62, 0.3, 0.16], [0.3, 0.3, 0.33], [0.45, 0.2, 0.15]] },
  docks: { wall: [[0.45, 0.5, 0.55], [0.6, 0.33, 0.24], [0.3, 0.45, 0.56], [0.55, 0.55, 0.5]], container: [[0.75, 0.15, 0.12], [0.12, 0.3, 0.65], [0.15, 0.5, 0.25], [0.9, 0.45, 0.1], [0.85, 0.75, 0.15], [0.8, 0.8, 0.78], [0.1, 0.55, 0.55]] },
  pantai: { wall: [[0.92, 0.92, 0.88], [0.55, 0.8, 0.78], [0.95, 0.62, 0.52], [0.95, 0.86, 0.58]] },
};

// Each building is a list of axis-aligned parts {x0,z0,x1,z1,y0,y1} plus style.
function part(x0, z0, x1, z1, y0, y1) { return { x0, z0, x1, z1, y0, y1 }; }

export function generateCity(seed = 20261120) {
  const rnd = mulberry32(seed);
  const city = {
    blocks: [], buildings: [], landmarks: {}, shops: [], billboards: [],
    trees: [], palms: [], lamps: [], benches: [], bins: [], busStops: [], parkedCars: [],
    containers: [], cranes: [], props: [], boats: [], fountains: [], ponds: [], pools: [],
    umbrellas: [], fences: [], tags: [], hydrants: [], crates: [],
  };
  let shopIndex = 0;
  const nextShop = () => (shopIndex++ * 7) % 24;

  for (let bz = 0; bz < GRID; bz++) {
    for (let bx = 0; bx < GRID; bx++) {
      const x0 = bx * BLOCK + LOT_INSET, z0 = bz * BLOCK + LOT_INSET;
      const x1 = (bx + 1) * BLOCK - LOT_INSET, z1 = (bz + 1) * BLOCK - LOT_INSET;
      const district = districtOf(bx, bz);
      const block = { bx, bz, x0, z0, x1, z1, district, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
      city.blocks.push(block);
      const lm = Object.entries(LANDMARK_DEFS).find(([, d]) => d.block[0] === bx && d.block[1] === bz);
      if (lm) { buildLandmark(city, block, lm[0], lm[1], rnd); continue; }
      switch (district) {
        case 'kotalama': genDowntown(city, block, rnd, nextShop); break;
        case 'kemuning': genMidtown(city, block, rnd, nextShop); break;
        case 'bukitasri': genResidential(city, block, rnd); break;
        case 'docks': genDocks(city, block, rnd); break;
        case 'pantai': genBeachfront(city, block, rnd, nextShop); break;
        case 'park': genPark(city, block, rnd); break;
      }
    }
  }
  genStreetFurniture(city, rnd);
  genBeachAndPiers(city, rnd);
  genTags(city);
  // Billboards on tall downtown rooftops, facing the street.
  return city;
}

// ---------------------------------------------------------------- districts
function addBuilding(city, b) { b.id = city.buildings.length; city.buildings.push(b); return b; }

function shopfrontsFor(city, b, block, nextShop, chance = 0.85) {
  // Ground-floor shopfronts on faces that look onto a street.
  const p = b.parts[0];
  const faces = [];
  if (Math.abs(p.z0 - block.z0) < 2) faces.push('n');
  if (Math.abs(p.z1 - block.z1) < 2) faces.push('s');
  if (Math.abs(p.x0 - block.x0) < 2) faces.push('w');
  if (Math.abs(p.x1 - block.x1) < 2) faces.push('e');
  b.shopfronts = [];
  for (const f of faces) b.shopfronts.push({ side: f, sign: nextShop(), awning: chance > 0.5 });
}

function genDowntown(city, block, rnd, nextShop) {
  const pal = PALETTES.kotalama;
  const { x0, z0, x1, z1 } = block;
  const layout = rnd.int(0, 2);
  const lots = [];
  const mx = (x0 + x1) / 2 + rnd.range(-8, 8), mz = (z0 + z1) / 2 + rnd.range(-8, 8);
  if (layout === 0) { lots.push([x0, z0, mx - 3, z1], [mx + 3, z0, x1, mz - 3], [mx + 3, mz + 3, x1, z1]); }
  else if (layout === 1) { lots.push([x0, z0, x1, mz - 3], [x0, mz + 3, mx - 3, z1], [mx + 3, mz + 3, x1, z1]); }
  else { lots.push([x0, z0, mx - 3, mz - 3], [mx + 3, z0, x1, mz - 3], [x0, mz + 3, mx - 3, z1], [mx + 3, mz + 3, x1, z1]); }
  // plaza with fountain in some blocks
  const plaza = rnd.chance(0.35) ? rnd.int(0, lots.length - 1) : -1;
  lots.forEach((l, i) => {
    const [a, b, c, d] = l;
    if (i === plaza) {
      city.fountains.push({ x: (a + c) / 2, z: (b + d) / 2, r: Math.min(c - a, d - b) * 0.22 });
      city.props.push({ type: 'plaza', x0: a, z0: b, x1: c, z1: d });
      for (let k = 0; k < 4; k++) city.trees.push({ x: a + 4 + (k % 2) * (c - a - 8), z: b + 4 + Math.floor(k / 2) * (d - b - 8), kind: 'round', s: 1.1 });
      return;
    }
    const glass = rnd.chance(0.7);
    const h = rnd.range(40, 120);
    const color = glass ? rnd.pick(pal.glass) : rnd.pick(pal.wall);
    const mat = glass ? 'glass' : 'punched';
    const parts = [];
    const style = rnd.int(0, 3);
    const w = c - a, dd = d - b;
    if (style === 0 || w < 24 || dd < 24) parts.push(part(a + 1, b + 1, c - 1, d - 1, 0, h));
    else if (style === 1) { // podium + tower
      parts.push(part(a + 0.5, b + 0.5, c - 0.5, d - 0.5, 0, 12));
      parts.push(part(a + w * 0.2, b + dd * 0.2, c - w * 0.2, d - dd * 0.2, 12, h));
    } else if (style === 2) { // stepped setbacks
      let ih = 0, inset = 1;
      for (let s = 0; s < 3; s++) { const top = ih + h * [0.5, 0.3, 0.2][s]; parts.push(part(a + inset, b + inset, c - inset, d - inset, ih, top)); ih = top; inset += Math.min(w, dd) * 0.11; }
    } else { // L-shape
      parts.push(part(a + 1, b + 1, c - 1, b + dd * 0.5, 0, h));
      parts.push(part(a + 1, b + dd * 0.5, a + w * 0.5, d - 1, 0, h * 0.7));
    }
    const bld = addBuilding(city, { parts, color, mat, seed: rnd.int(1, 999), district: 'kotalama', roof: rnd.pick(['ac', 'ac', 'tanks', 'antenna', 'garden', 'solar']) });
    if (rnd.chance(1 / 6) && h > 60) bld.roof = 'helipad';
    shopfrontsFor(city, bld, block, nextShop);
    if (rnd.chance(0.45)) city.billboards.push({ building: bld.id, brand: rnd.int(0, BILLBOARDS.length - 1) });
  });
}

function genMidtown(city, block, rnd, nextShop) {
  const pal = PALETTES.kemuning;
  const { x0, z0, x1, z1 } = block;
  // Perimeter row of 4-10 storey buildings with an alley/courtyard in the middle.
  const n = 3;
  const w = (x1 - x0) / n, d = (z1 - z0) / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === 1 && j === 1) { // courtyard: parked cars and trees
        city.parkedCars.push({ x: x0 + w * 1.5, z: z0 + d * 1.5, yaw: rnd.pick([0, Math.PI / 2]) });
        city.trees.push({ x: x0 + w * 1.2, z: z0 + d * 1.3, kind: 'round', s: 0.9 });
        city.crates.push({ x: x0 + w * 1.7, z: z0 + d * 1.2 });
        continue;
      }
      const a = x0 + i * w, b = z0 + j * d;
      const storeys = rnd.int(4, 10);
      const h = storeys * 3.4 + 0.6;
      const inset = 0.6;
      const parts = [part(a + inset, b + inset, a + w - inset, b + d - inset, 0, h)];
      if (rnd.chance(0.3)) parts.push(part(a + inset + 3, b + inset + 3, a + w - inset - 3, b + d - inset - 3, h, h + 3.4));
      const bld = addBuilding(city, { parts, color: rnd.pick(pal.wall), mat: 'punched', seed: rnd.int(1, 999), district: 'kemuning', roof: rnd.pick(['ac', 'tanks', 'garden', 'solar', 'ac']), balconies: rnd.chance(0.6) });
      shopfrontsFor(city, bld, block, nextShop);
    }
  }
  city.bins.push({ x: x0 + w * 1.5 + 4, z: z0 + d * 1.5 - 4 });
}

function genResidential(city, block, rnd) {
  const pal = PALETTES.bukitasri;
  const { x0, z0, x1, z1 } = block;
  const n = 3, w = (x1 - x0) / n, d = (z1 - z0) / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === 1 && j === 1) { city.trees.push({ x: x0 + w * 1.5, z: z0 + d * 1.5, kind: 'round', s: 1.4 }); city.trees.push({ x: x0 + w * 1.3, z: z0 + d * 1.7, kind: 'round', s: 1.1 }); continue; }
      const a = x0 + i * w, b = z0 + j * d;
      const hw = rnd.range(9, 13), hd = rnd.range(8, 11);
      const cx = a + w / 2 + rnd.range(-2, 2), cz = b + d / 2 + rnd.range(-2, 2);
      const storeys = rnd.chance(0.4) ? 2 : 1;
      const h = storeys * 3.2;
      const parts = [part(cx - hw / 2, cz - hd / 2, cx + hw / 2, cz + hd / 2, 0, h)];
      addBuilding(city, { parts, color: rnd.pick(pal.wall), roofColor: rnd.pick(pal.roof), mat: 'house', seed: rnd.int(1, 999), district: 'bukitasri', roof: 'pitched', ridgeX: hw > hd });
      // garden: grass lot, fence, trees, maybe pool
      city.props.push({ type: 'garden', x0: a + 0.5, z0: b + 0.5, x1: a + w - 0.5, z1: b + d - 0.5 });
      city.fences.push({ x0: a + 0.5, z0: b + 0.5, x1: a + w - 0.5, z1: b + d - 0.5 });
      if (rnd.chance(0.35)) city.pools.push({ x0: cx + hw / 2 + 1.2, z0: cz - 3, x1: Math.min(a + w - 1.5, cx + hw / 2 + 6.5), z1: cz + 3 });
      for (let t = 0; t < 2; t++) city.trees.push({ x: a + rnd.range(2, w - 2), z: b + (t ? d - 2 : 2), kind: rnd.chance(0.5) ? 'palm' : 'round', s: rnd.range(0.8, 1.2) });
      if (rnd.chance(0.5)) city.parkedCars.push({ x: a + (i === 0 ? 3 : w - 3), z: b + d / 2, yaw: 0 });
    }
  }
}

function genDocks(city, block, rnd) {
  const pal = PALETTES.docks;
  const { x0, z0, x1, z1 } = block;
  city.props.push({ type: 'dockyard', x0, z0, x1, z1 });
  // one or two warehouses
  const big = rnd.chance(0.5);
  const wx1 = big ? x1 - 2 : (x0 + x1) / 2 - 2;
  const parts = [part(x0 + 2, z0 + 2, wx1, z0 + 30, 0, rnd.range(10, 14))];
  addBuilding(city, { parts, color: rnd.pick(pal.wall), mat: 'metal', seed: rnd.int(1, 999), district: 'docks', roof: 'warehouse' });
  // container stacks
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (rnd.chance(0.25)) continue;
      const cx = x0 + 8 + c * 15, cz = z0 + 40 + r * 9;
      if (cx > x1 - 6 || cz > z1 - 4) continue;
      const stack = rnd.int(1, 3);
      for (let s = 0; s < stack; s++) city.containers.push({ x: cx, z: cz, y: s * 2.6, yaw: 0, color: rnd.pick(pal.container) });
    }
  }
  if (rnd.chance(0.6)) city.cranes.push({ x: x1 - 6, z: (z0 + z1) / 2 + 10, yaw: Math.PI / 2 });
  for (let k = 0; k < 6; k++) city.crates.push({ x: rnd.range(x0 + 4, x1 - 4), z: rnd.range(z0 + 33, z0 + 37) });
  for (let k = 0; k < 4; k++) city.props.push({ type: 'barrel', x: rnd.range(x0 + 4, x1 - 4), z: z0 + 35.5 + rnd.range(-1, 1) });
  city.props.push({ type: 'forklift', x: x0 + 12, z: z0 + 36, yaw: rnd.range(0, 6) });
}

function genBeachfront(city, block, rnd, nextShop) {
  const pal = PALETTES.pantai;
  const { x0, z0, x1, z1 } = block;
  const w = x1 - x0;
  // hotel tower on the north half, pool deck to the south facing the sea
  const h = rnd.range(18, 45);
  const parts = [part(x0 + 4, z0 + 2, x1 - 4, z0 + 26, 0, h)];
  const bld = addBuilding(city, { parts, color: rnd.pick(pal.wall), mat: 'punched', seed: rnd.int(1, 999), district: 'pantai', roof: rnd.pick(['garden', 'ac', 'pool']), balconies: true });
  shopfrontsFor(city, bld, block, () => 31 + rnd.int(0, 2));
  city.pools.push({ x0: x0 + 10, z0: z0 + 34, x1: x1 - 10, z1: z0 + 50 });
  city.props.push({ type: 'deck', x0: x0 + 2, z0: z0 + 28, x1: x1 - 2, z1: z1 - 2 });
  for (let k = 0; k < 5; k++) city.umbrellas.push({ x: x0 + 8 + k * (w - 16) / 4, z: z0 + 56, color: rnd.pick([[0.95, 0.3, 0.3], [0.2, 0.7, 0.8], [0.98, 0.85, 0.3], [0.95, 0.95, 0.95]]) });
  for (let k = 0; k < 4; k++) city.palms.push({ x: x0 + 3 + k * (w - 6) / 3, z: z1 - 3, s: rnd.range(0.9, 1.3) });
}

function genPark(city, block, rnd) {
  const { x0, z0, x1, z1, cx, cz } = block;
  city.props.push({ type: 'park', x0, z0, x1, z1 });
  city.ponds.push({ x: cx + rnd.range(-8, 8), z: cz + rnd.range(-8, 8), rx: rnd.range(10, 16), rz: rnd.range(8, 13) });
  for (let k = 0; k < 26; k++) {
    const x = rnd.range(x0 + 3, x1 - 3), z = rnd.range(z0 + 3, z1 - 3);
    if (Math.hypot(x - cx, z - cz) < 20) continue;
    if (Math.abs(x - cx) < 2.5 || Math.abs(z - cz) < 2.5) continue; // keep paths clear
    city.trees.push({ x, z, kind: rnd.chance(0.3) ? 'palm' : (rnd.chance(0.5) ? 'round' : 'cone'), s: rnd.range(0.8, 1.4) });
  }
  for (let k = 0; k < 4; k++) city.benches.push({ x: cx + [-24, 24, 0, 0][k], z: cz + [0, 0, -24, 24][k] + 2, yaw: [0, Math.PI, Math.PI / 2, -Math.PI / 2][k] });
}

// ---------------------------------------------------------------- landmarks
function landmarkEntry(block, side) {
  const { x0, z0, x1, z1, cx, cz } = block;
  switch (side) {
    case 'n': return { x: cx, z: z0 - 2, yaw: Math.PI };
    case 's': return { x: cx, z: z1 + 2, yaw: 0 };
    case 'w': return { x: x0 - 2, z: cz, yaw: -Math.PI / 2 };
    default: return { x: x1 + 2, z: cz, yaw: Math.PI / 2 };
  }
}

function buildLandmark(city, block, key, def, rnd) {
  const { x0, z0, x1, z1, cx, cz } = block;
  const entry = landmarkEntry(block, def.side);
  const lm = { key, name: def.name, icon: def.icon, color: def.color, block, entry, x: entry.x, z: entry.z };
  city.landmarks[key] = lm;
  const add = (parts, o) => addBuilding(city, { parts, seed: rnd.int(1, 999), district: block.district, landmark: key, ...o });
  switch (key) {
    case 'safehouse': {
      add([part(cx - 6, cz - 7, cx + 8, cz + 7, 0, 6.4)], { color: [0.92, 0.9, 0.84], roofColor: [0.5, 0.2, 0.12], mat: 'house', roof: 'pitched', ridgeX: false });
      city.props.push({ type: 'garden', x0, z0, x1, z1 });
      city.pools.push({ x0: cx - 18, z0: cz - 5, x1: cx - 9, z1: cz + 5 });
      for (let k = 0; k < 8; k++) city.trees.push({ x: x0 + 4 + (k % 4) * 20, z: k < 4 ? z0 + 4 : z1 - 4, kind: k % 2 ? 'palm' : 'round', s: 1.1 });
      lm.save = { x: x1 + 1.5, z: cz + 6 };
      break;
    }
    case 'garage': {
      add([part(x0 + 8, z0 + 2, x1 - 8, z0 + 30, 0, 9)], { color: [0.85, 0.7, 0.3], mat: 'metal', roof: 'warehouse', bigDoor: 'n', signText: "LIN'S GARAGE", signIndex: 28 });
      add([part(x0 + 2, z0 + 34, x1 - 2, z1 - 2, 0, 16)], { color: [0.78, 0.5, 0.36], mat: 'punched', roof: 'ac' });
      city.parkedCars.push({ x: x0 + 4, z: z0 + 10, yaw: 0 });
      for (let k = 0; k < 5; k++) city.props.push({ type: 'tyres', x: x0 + 3 + k * 1.3, z: z0 + 24 });
      lm.inside = { x: cx, z: z0 + 12 };
      break;
    }
    case 'hospital':
      add([part(x0 + 6, z0 + 4, x1 - 6, z1 - 18, 0, 34)], { color: [0.9, 0.92, 0.94], mat: 'punched', roof: 'helipad', signText: 'HOSPITAL', signIndex: 29, redCross: true });
      add([part(x0 + 20, z1 - 18, x1 - 20, z1 - 6, 0, 5)], { color: [0.85, 0.88, 0.9], mat: 'glass', roof: 'flat' });
      break;
    case 'police':
      add([part(x0 + 14, z0 + 6, x1 - 6, z1 - 6, 0, 22)], { color: [0.35, 0.42, 0.55], mat: 'punched', roof: 'antenna', signText: 'POLISI', signIndex: 30 });
      for (let k = 0; k < 3; k++) city.parkedCars.push({ x: x0 + 6, z: z0 + 18 + k * 12, yaw: 0, model: 'police' });
      break;
    case 'bank':
      add([part(x0 + 4, z0 + 4, x1 - 4, z1 - 4, 0, 14)], { color: [0.86, 0.82, 0.72], mat: 'punched', roof: 'flat', columns: 'w', signText: 'BANK SAMUDRA', signIndex: 27 });
      add([part(x0 + 20, z0 + 14, x1 - 10, z1 - 14, 14, 58)], { color: [0.3, 0.62, 0.62], mat: 'glass', roof: 'ac' });
      break;
    case 'tower': {
      const b = add([
        part(x0 + 4, z0 + 4, x1 - 4, z1 - 4, 0, 16),
        part(x0 + 14, z0 + 14, x1 - 14, z1 - 14, 16, 112),
        part(x0 + 19, z0 + 19, x1 - 19, z1 - 19, 112, 142),
        part(x0 + 24, z0 + 24, x1 - 24, z1 - 24, 142, 158),
      ], { color: [0.55, 0.28, 0.75], mat: 'glass', roof: 'orchid' });
      lm.top = { x: cx, y: 158, z: cz };
      lm.garage = { x: cx, z: z0 - 2 };
      b.tallest = true;
      break;
    }
    case 'freight':
      add([part(x0 + 14, z0 + 6, x1 - 4, z1 - 20, 0, 13)], { color: [0.28, 0.25, 0.32], mat: 'metal', roof: 'warehouse', bigDoor: 'w', signText: 'ORCHID FREIGHT', signIndex: 34 });
      city.props.push({ type: 'dockyard', x0, z0, x1, z1 });
      for (let k = 0; k < 6; k++) city.containers.push({ x: x0 + 6 + (k % 3) * 1, z: z0 + 10 + k * 7.5, y: 0, yaw: Math.PI / 2, color: [[0.45, 0.15, 0.55], [0.75, 0.15, 0.12], [0.12, 0.3, 0.65]][k % 3] });
      for (let k = 0; k < 4; k++) city.containers.push({ x: x0 + 20 + k * 13, z: z1 - 10, y: 0, yaw: 0, color: [[0.45, 0.15, 0.55], [0.9, 0.45, 0.1]][k % 2] });
      city.containers.push({ x: x0 + 33, z: z1 - 10, y: 2.6, yaw: 0, color: [0.45, 0.15, 0.55] });
      city.cranes.push({ x: x1 + 14, z: cz, yaw: Math.PI / 2 });
      for (let k = 0; k < 8; k++) city.crates.push({ x: x0 + 9 + rnd.range(-1, 1), z: z0 + 50 + k * 1.4 });
      lm.yard = { x: x0 + 8, z: cz };
      break;
    case 'respray':
      add([part(x0 + 14, z0 + 30, x1 - 14, z1 - 4, 0, 8)], { color: [0.2, 0.75, 0.68], mat: 'metal', roof: 'warehouse', bigDoor: 's', signText: 'KILAT RESPRAY', signIndex: 26 });
      add([part(x0 + 2, z0 + 2, x1 - 2, z0 + 24, 0, 20)], { color: [0.82, 0.78, 0.64], mat: 'punched', roof: 'ac' });
      break;
    case 'guns':
      add([part(x0 + 8, z0 + 2, x1 - 8, z0 + 22, 0, 7)], { color: [0.3, 0.3, 0.32], mat: 'punched', roof: 'flat', signText: 'BANG BANG ARMS', signIndex: 25 });
      add([part(x0 + 2, z0 + 28, x1 - 2, z1 - 2, 0, 18)], { color: [0.8, 0.6, 0.4], mat: 'punched', roof: 'tanks' });
      break;
    case 'dex':
      add([part(x0 + 4, z0 + 4, x1 - 30, z1 - 4, 0, 30)], { color: [0.55, 0.6, 0.72], mat: 'punched', roof: 'antenna', balconies: true });
      add([part(x1 - 26, z0 + 4, x1 - 4, z1 - 4, 0, 18)], { color: [0.86, 0.8, 0.66], mat: 'punched', roof: 'ac' });
      break;
    case 'cafe':
      add([part(x1 - 22, z0 + 20, x1 - 2, z1 - 20, 0, 6)], { color: [0.95, 0.85, 0.75], mat: 'punched', roof: 'garden', signText: 'KEDAI ORCHID', signIndex: 24, awningAll: true });
      add([part(x0 + 2, z0 + 2, x1 - 28, z1 - 2, 0, 24)], { color: [0.72, 0.42, 0.3], mat: 'punched', roof: 'ac' });
      for (let k = 0; k < 4; k++) city.umbrellas.push({ x: x1 + 0.0 - 5, z: z0 + 24 + k * 6, color: [0.6, 0.2, 0.6], small: true });
      break;
  }
}

// ---------------------------------------------------------------- streets
function genStreetFurniture(city, rnd) {
  // Lamps along sidewalks every ~30 m, on both sides of each road segment; bins, benches, bus stops, hydrants.
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      for (const side of [-1, 1]) {
        const off = ROAD_HALF + 0.8;
        // road along X at z = i*BLOCK, between x = j*BLOCK and (j+1)*BLOCK
        for (let k = 1; k <= 2; k++) {
          const along = j * BLOCK + k * 30 + (side > 0 ? 8 : -8);
          if (!(i === GRID && side > 0)) city.lamps.push({ x: along, z: i * BLOCK + side * off, yaw: side > 0 ? Math.PI : 0 });
          if (!(i === GRID && side > 0)) city.lamps.push({ x: i * BLOCK + side * off, z: along, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
        }
        if (rnd.chance(0.25)) city.bins.push({ x: j * BLOCK + 22, z: i * BLOCK + side * (ROAD_HALF + 3.2) });
        if (rnd.chance(0.12)) city.busStops.push({ x: j * BLOCK + 50, z: i * BLOCK + side * (ROAD_HALF + 2.6), yaw: side > 0 ? 0 : Math.PI, axis: 'x' });
        if (rnd.chance(0.2)) city.hydrants.push({ x: i * BLOCK + side * (ROAD_HALF + 0.6), z: j * BLOCK + 60 });
        if (rnd.chance(0.25)) city.palms.push({ x: j * BLOCK + 70, z: i * BLOCK + side * (ROAD_HALF + 2.4), s: rnd.range(0.8, 1.1) });
      }
    }
  }
  // remove lamps that fall inside the outer sea edge
  city.lamps = city.lamps.filter((l) => l.x > LAND.x0 + 2 && l.x < LAND.x1 - 2 && l.z > LAND.z0 + 2 && l.z < BEACH.z1);
}

function genBeachAndPiers(city, rnd) {
  // Palms and umbrellas on the sand; moored boats by the east pier and the ferry pier.
  for (let k = 0; k < 40; k++) {
    const x = rnd.range(0, CITY_SIZE), z = rnd.range(BEACH.z0 + 14, BEACH.z0 + 40);
    if (Math.abs(x - 446) < 14) continue;
    if (rnd.chance(0.5)) city.palms.push({ x, z, s: rnd.range(0.9, 1.4) });
    else city.umbrellas.push({ x, z: z + 12, color: rnd.pick([[0.95, 0.3, 0.3], [0.2, 0.7, 0.8], [0.98, 0.85, 0.3]]) });
  }
  city.boats.push({ x: FERRY_PIER.x1 + 9, z: FERRY_PIER.z1 - 25, yaw: 0, kind: 'ferry' });
  for (let k = 0; k < 5; k++) city.boats.push({ x: EAST_PIER.x0 + 20 + k * 22, z: EAST_PIER.z0 - 8, yaw: Math.PI / 2, kind: k % 2 ? 'fishing' : 'speed' });
  city.boats.push({ x: EAST_PIER.x1 - 8, z: EAST_PIER.z1 + 8, yaw: Math.PI / 2, kind: 'yacht', escape: true });
  for (let k = 0; k < 4; k++) city.boats.push({ x: CITY_SIZE + 60 + k * 18, z: 300 + k * 7, yaw: Math.PI / 2 + 0.2, kind: 'fishing' });
}

// Twelve hidden Orchid tags, placed in alleys, rooftops-adjacent corners, beaches and docks.
function genTags(city) {
  const spots = [
    [62, 62], [255, 340], [420, 160], [610, 330], [700, 640], [880, 120],
    [905, 470], [160, 820], [520, 945], [830, 905], [45, 470], [345, 600],
  ];
  city.tags = spots.map(([x, z], i) => ({ id: i, x, z }));
}

export function districtAtPoint(x, z) {
  const bx = clamp(Math.floor(x / BLOCK), 0, GRID - 1), bz = clamp(Math.floor(z / BLOCK), 0, GRID - 1);
  if (z > CITY_SIZE + 4) return 'pantai';
  if (x > CITY_SIZE + 4) return 'docks';
  return districtOf(bx, bz);
}
