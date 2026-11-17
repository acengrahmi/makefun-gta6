// People: pedestrians strolling the sidewalks, cops on foot, and the Vipers gang.
// Everyone is a small box-built figure with a walk cycle; no external models.
import { clamp, rand, pick, dist2D, mulberry32 } from './util.js';
import { PITCH, ROAD_K, ROAD_HALF, CITY_HALF, collideCircle } from './city.js';

const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf2c9a0, 0x6a4a2e];
const SHIRTS = [0xd43a3a, 0x3a7ad4, 0x3ad47a, 0xe8d43a, 0x9a4ad4, 0xe8e8e8, 0x222222, 0xff7a3a];
const PANTS = [0x2a3a5a, 0x3a3a3a, 0x5a4a3a, 0x4a5a6a];

/** Build a person mesh. `kind`: 'ped' | 'cop' | 'gang' | 'player' | 'npc'.
 * Story NPCs (Lena, Sal, Mateo, Dana…) wear gold so the player can spot them. */
export function makePersonMesh(kind, rng) {
  const g = new THREE.Group();
  const skin = kind === 'player' ? 0xe8b88a : pick(rng, SKINS);
  const shirt = kind === 'cop' ? 0x1a2a4a : kind === 'gang' ? 0x8a1a2a : kind === 'npc' ? 0xffb52e : pick(rng, SHIRTS);
  const pants = kind === 'cop' ? 0x141a24 : kind === 'gang' ? 0x2a2a2a : kind === 'npc' ? 0x24304a : pick(rng, PANTS);
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
  head.position.y = 1.62; head.castShadow = true;
  g.add(head);
  if (kind === 'cop') {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46),
      new THREE.MeshLambertMaterial({ color: 0x0e1420 }));
    cap.position.y = 1.86; g.add(cap);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.02),
      new THREE.MeshLambertMaterial({ color: 0xffd94d, emissive: 0x886600 }));
    badge.position.set(-0.12, 1.25, 0.26); g.add(badge);
  }
  if (kind === 'gang') {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.44),
      new THREE.MeshLambertMaterial({ color: 0xc22a2a }));
    band.position.y = 1.78; g.add(band);
  }
  if (kind === 'player') {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.44),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    hair.position.y = 1.86; g.add(hair);
    const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.36),
      new THREE.MeshLambertMaterial({ color: 0xff8a2a }));
    jacket.position.y = 1.15; g.add(jacket);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.72, 0.34), shirtMat);
  torso.position.y = 1.05; torso.castShadow = true;
  g.add(torso);
  const legs = [];
  for (const sx of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.26), pantsMat);
    leg.position.set(sx, 0.35, 0);
    leg.castShadow = true;
    g.add(leg); legs.push(leg);
  }
  const arms = [];
  for (const sx of [-0.38, 0.38]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), kind === 'player' ? shirtMat : skinMat);
    arm.position.set(sx, 1.05, 0);
    g.add(arm); arms.push(arm);
  }
  g.userData.legs = legs;
  g.userData.arms = arms;
  return g;
}

export class Person {
  constructor(scene, kind, rng) {
    this.kind = kind;
    this.mesh = makePersonMesh(kind, rng);
    scene.add(this.mesh);
    this.x = 0; this.z = 0; this.heading = 0;
    this.speed = 0;
    this.walkPhase = Math.random() * 6;
    this.health = kind === 'gang' ? 100 : 100;
    this.target = null; // {x,z} waypoint
    this.panic = 0;
    this.radius = 0.7;
    this.shootCooldown = 0;
    this.dead = false;
  }

  setPose(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(this.walkPhase) * 0.55 * clamp(Math.abs(this.speed) / 3, 0, 1);
    const [l1, l2] = this.mesh.userData.legs;
    const [a1, a2] = this.mesh.userData.arms;
    l1.rotation.x = swing; l2.rotation.x = -swing;
    a1.rotation.x = -swing; a2.rotation.x = swing;
  }

  die(scene) {
    this.dead = true;
    this.mesh.rotation.z = Math.PI / 2;
    this.mesh.position.y = 0.25;
  }
}

/** Sidewalk wanderers: pick a waypoint on a sidewalk, stroll, flee from gunfire. */
export class PedestrianManager {
  constructor(scene, colliders, count, seed) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = mulberry32(seed + 99);
    this.peds = [];
    for (let i = 0; i < count; i += 1) {
      const p = new Person(scene, 'ped', this.rng);
      const spot = this.randomSidewalkSpot();
      p.setPose(spot.x, spot.z, this.rng() * Math.PI * 2);
      p.target = this.randomSidewalkSpot();
      p.speed = 1.2 + this.rng() * 1.2;
      this.peds.push(p);
    }
  }

  randomSidewalkSpot() {
    // a third of the crowd drifts along the boardwalk and the sand instead
    if (this.rng() < 0.3) {
      return {
        x: (this.rng() * 2 - 1) * (CITY_HALF - 8),
        z: CITY_HALF + 5 + this.rng() * 24,
      };
    }
    const k = ROAD_K[Math.floor(this.rng() * ROAD_K.length)] * PITCH;
    const along = (this.rng() * 2 - 1) * (CITY_HALF - 10);
    const side = this.rng() < 0.5 ? -1 : 1;
    const off = ROAD_HALF + 2 + this.rng() * 3;
    if (this.rng() < 0.5) return { x: k + side * off, z: along };
    return { x: along, z: k + side * off };
  }

  update(dt, danger) {
    for (const p of this.peds) {
      if (p.dead) continue;
      p.walkPhase += dt * 6 * clamp(Math.abs(p.speed) / 2, 0.2, 2);
      if (p.panic > 0) p.panic -= dt;
      // flee from the danger point when it is close
      let tx = p.target.x, tz = p.target.z;
      if (danger && p.panic > 0) {
        const d = dist2D(p.x, p.z, danger.x, danger.z);
        if (d < 30) {
          const away = Math.atan2(p.x - danger.x, p.z - danger.z);
          tx = p.x + Math.sin(away) * 20; tz = p.z + Math.cos(away) * 20;
        }
      }
      const d = dist2D(p.x, p.z, tx, tz);
      if (d < 1.5) {
        p.target = this.randomSidewalkSpot();
      } else {
        const want = Math.atan2(tx - p.x, tz - p.z);
        let diff = want - p.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
        const sp = p.panic > 0 ? 4.5 : p.speed;
        p.x += Math.sin(p.heading) * sp * dt;
        p.z += Math.cos(p.heading) * sp * dt;
        p.speed = sp;
        if (collideCircle(p, p.radius, this.colliders)) p.target = this.randomSidewalkSpot();
      }
      p.syncMesh();
    }
  }

  scare(x, z) {
    for (const p of this.peds) {
      if (dist2D(p.x, p.z, x, z) < 26) p.panic = 3 + Math.random() * 2;
    }
  }

  /** The nearest living ped within `range` of (x,z). */
  nearest(x, z, range) {
    let best = null; let bestD = range;
    for (const p of this.peds) {
      if (p.dead) continue;
      const d = dist2D(p.x, p.z, x, z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
}
