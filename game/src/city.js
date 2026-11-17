// Costa Verde's city: a sun-soaked grid of streets, towers, palms and a beach.
// The city is deterministic from its seed, so screenshots always show the same place.
import { mulberry32, rand, pick, clamp, makeFacadeTexture, makeRoadTexture, makeGroundTexture } from './util.js';

export const PITCH = 54;          // distance between road centre lines
export const ROAD_HALF = 7;       // half the asphalt width
export const ROAD_K = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
export const CITY_HALF = 4 * PITCH + ROAD_HALF; // 223
export const BLOCK = PITCH - ROAD_HALF * 2;     // 40, the buildable square between roads

const PALETTE = [
  { base: '#f2d8a7', lit: '#ffe9a8' }, // sand plaster
  { base: '#e8b48a', lit: '#ffd9a0' }, // terracotta
  { base: '#a8c8d8', lit: '#cfe8ff' }, // pale glass blue
  { base: '#d8a0a8', lit: '#ffb8c0' }, // coral
  { base: '#f5e6c8', lit: '#fff3c8' }, // cream
  { base: '#b8c8a8', lit: '#e0f0c0' }, // sage
];

export const LANDMARKS = {
  club: { x: 135, z: -135, name: 'Sunset Club' },
  marina: { x: -189, z: 189, name: 'Marina' },
  warehouse: { x: 189, z: 189, name: 'Vipers Warehouse' },
  garage: { x: -135, z: -135, name: "Sal's Garage" },
  safehouse: { x: 27, z: 189, name: 'Safehouse' },
  hospital: { x: -189, z: -189, name: 'Costa General' },
};

/** True when (x,z) is on asphalt (within a road strip). */
export function isOnRoad(x, z) {
  for (const k of ROAD_K) {
    if (Math.abs(x - k * PITCH) <= ROAD_HALF || Math.abs(z - k * PITCH) <= ROAD_HALF) return true;
  }
  return false;
}

/** Nearest point on a road centre line (used to keep traffic and spawns on asphalt). */
export function nearestRoadPoint(x, z) {
  let best = null; let bestD = Infinity;
  for (const k of ROAD_K) {
    const c = k * PITCH;
    const d1 = Math.abs(x - c);
    if (d1 < bestD) { bestD = d1; best = { x: c, z }; }
    const d2 = Math.abs(z - c);
    if (d2 < bestD) { bestD = d2; best = { x, z: c }; }
  }
  return best;
}

/** Push a circle (x,z,r) out of every building AABB it overlaps. Returns true on hit. */
export function collideCircle(p, r, colliders) {
  let hit = false;
  for (const b of colliders) {
    const cx = clamp(p.x, b.minX, b.maxX);
    const cz = clamp(p.z, b.minZ, b.maxZ);
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else {
        // centre inside the box: shove out along the smallest penetration axis
        const pl = p.x - b.minX, pr = b.maxX - p.x, pt = p.z - b.minZ, pb = b.maxZ - p.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) p.x = b.minX - r; else if (m === pr) p.x = b.maxX + r;
        else if (m === pt) p.z = b.minZ - r; else p.z = b.maxZ + r;
      }
    }
  }
  return hit;
}

function makePalm() {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5.2, 6), trunkMat);
  trunk.position.y = 2.6; trunk.castShadow = true;
  g.add(trunk);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i += 1) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.55), frondMat);
    const a = (i / 6) * Math.PI * 2;
    frond.position.set(Math.cos(a) * 1.0, 5.3, Math.sin(a) * 1.0);
    frond.rotation.order = 'YXZ';
    frond.rotation.y = -a;
    frond.rotation.x = -0.95;
    g.add(frond);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x6a4a22 }));
  nuts.position.y = 5.1;
  g.add(nuts);
  return g;
}

/** Build the whole city into `scene`. Returns colliders, palms and road data. */
export function buildCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // Sky, sun and haze are set in main.js; here the ground and sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 320, CITY_HALF * 2 + 320),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(), color: 0xffffff }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 60);
  ground.receiveShadow = true;
  group.add(ground);

  // Ocean to the south (warm turquoise) and a pale beach strip.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 260),
    new THREE.MeshLambertMaterial({ color: 0x2e9fc8 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.05, CITY_HALF + 130);
  group.add(sea);
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 320, 34),
    new THREE.MeshLambertMaterial({ color: 0xf2e2b8 }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.02, CITY_HALF + 17);
  beach.receiveShadow = true;
  group.add(beach);

  // Asphalt: one long strip per road line, dashed centre line texture.
  const roadTex = makeRoadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (const k of ROAD_K) {
    const c = k * PITCH;
    const len = CITY_HALF * 2 + 40;
    for (const vertical of [true, false]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len), roadMat.clone());
      strip.material.map = roadTex.clone();
      strip.material.map.repeat.set(1, len / 24);
      strip.material.map.needsUpdate = true;
      strip.rotation.x = -Math.PI / 2;
      if (vertical) { strip.position.set(c, 0.06, 0); strip.rotation.z = 0; }
      else { strip.position.set(0, 0.06, c); strip.rotation.z = Math.PI / 2; }
      strip.receiveShadow = true;
      group.add(strip);
    }
  }

  // Buildings, one per block, taller toward the centre (downtown).
  const facades = PALETTE.map((p) => makeFacadeTexture(p.base, p.lit, 8, 5, mulberry32(seed + 7)));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5148 });
  for (let i = -4; i < 4; i += 1) {
    for (let j = -4; j < 4; j += 1) {
      const bx = i * PITCH + PITCH / 2;
      const bz = j * PITCH + PITCH / 2;
      const downtown = Math.max(Math.abs(i + 0.5), Math.abs(j + 0.5)) <= 1.5;
      const tall = downtown ? rand(rng, 26, 52) : rand(rng, 9, 26);
      const w = rand(rng, 16, 26);
      const d = rand(rng, 16, 26);
      const mat = new THREE.MeshLambertMaterial({ map: pick(rng, facades) });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, tall, d), [mat, mat, roofMat, roofMat, mat, mat]);
      b.position.set(bx, tall / 2, bz);
      b.castShadow = true; b.receiveShadow = true;
      group.add(b);
      colliders.push({ minX: bx - w / 2 - 0.4, maxX: bx + w / 2 + 0.4, minZ: bz - d / 2 - 0.4, maxZ: bz + d / 2 + 0.4 });
      // A low annex or a second small block building on roomy plots.
      if (!downtown && rng() < 0.55) {
        const w2 = rand(rng, 8, 12), d2 = rand(rng, 8, 12), h2 = rand(rng, 5, 9);
        const ox = bx + (rng() < 0.5 ? -1 : 1) * (w / 2 + w2 / 2 + 2);
        const oz = bz + (rng() < 0.5 ? -1 : 1) * (d / 2 + d2 / 2 + 2);
        const m2 = new THREE.MeshLambertMaterial({ map: pick(rng, facades) });
        const b2 = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, d2), m2);
        b2.position.set(ox, h2 / 2, oz);
        b2.castShadow = true; b2.receiveShadow = true;
        group.add(b2);
        colliders.push({ minX: ox - w2 / 2 - 0.4, maxX: ox + w2 / 2 + 0.4, minZ: oz - d2 / 2 - 0.4, maxZ: oz + d2 / 2 + 0.4 });
      }
    }
  }

  // Palms along the sidewalks and the beach front.
  for (let n = 0; n < 150; n += 1) {
    const k = pick(rng, ROAD_K);
    const along = rand(rng, -CITY_HALF, CITY_HALF);
    const side = rng() < 0.5 ? -1 : 1;
    const x = rng() < 0.5 ? k * PITCH + side * (ROAD_HALF + 2.5) : along;
    const z = rng() < 0.5 ? along : k * PITCH + side * (ROAD_HALF + 2.5);
    if (Math.abs(x) > CITY_HALF || Math.abs(z) > CITY_HALF) continue;
    // keep palms off building footprints
    let inside = false;
    for (const b of colliders) if (x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1) { inside = true; break; }
    if (inside) continue;
    const palm = makePalm();
    palm.position.set(x, 0, z);
    palm.rotation.y = rng() * Math.PI * 2;
    const s = rand(rng, 0.85, 1.3);
    palm.scale.setScalar(s);
    group.add(palm);
  }

  // Street lamps at intersections.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a4048 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xcc9933 });
  for (const kx of ROAD_K) {
    for (const kz of ROAD_K) {
      if (rng() < 0.45) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 5), poleMat);
      pole.position.set(kx * PITCH + ROAD_HALF + 1, 3, kz * PITCH + ROAD_HALF + 1);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
      head.position.set(kx * PITCH + ROAD_HALF + 1, 6.1, kz * PITCH + ROAD_HALF + 1);
      group.add(head);
    }
  }

  // Landmark signs: a big glowing "SUNSET CLUB" and "MARINA" so the city reads at a glance.
  function landmarkSign(text, x, z, color) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#101418'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = color; g.font = 'bold 56px Trebuchet MS, Verdana, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 50);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(18, 3.4),
      new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(x, 8, z);
    sign.rotation.y = Math.PI / 4;
    group.add(sign);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), poleMat);
    post.position.set(x, 4, z);
    group.add(post);
  }
  landmarkSign('SUNSET CLUB', 140, -99, '#ff7ad9');
  landmarkSign('MARINA', -180, 170, '#7ad9ff');
  landmarkSign("SAL'S GARAGE", -128, -99, '#ffd94d');

  return { colliders, group };
}
