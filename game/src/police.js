// The wanted system: stars rise with crimes, fall with quiet time, and the Costa
// Verde PD answers — cruisers that ram the player, cops on foot who grab him,
// and from three stars up, a police helicopter that pins him in its searchlight.
import { clamp, lerp, dist2D } from './util.js';
import { PITCH, ROAD_K, CITY_HALF, nearestRoadPoint } from './city.js';
import { Car } from './vehicles.js';
import { Person } from './people.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Build the PD helicopter: dark body, glass nose, spinning rotors, skids. */
function makeHelicopterMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a2432 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x0e2a3a });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xe8ecf2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.8, 4.8), bodyMat);
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 1.4), glassMat);
  nose.position.set(0, 0.15, 2.6);
  g.add(nose);
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.5, 2.2), whiteMat);
  band.position.set(0, -0.2, 0.4);
  g.add(band);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 4.6), bodyMat);
  tail.position.set(0, 0.35, -4.4);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 0.9), bodyMat);
  fin.position.set(0, 0.9, -6.5);
  g.add(fin);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.24),
    new THREE.MeshLambertMaterial({ color: 0x30363e }));
  tailRotor.position.set(0.2, 0.9, -6.5);
  g.add(tailRotor);
  const rotor = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.07, 0.75),
    new THREE.MeshLambertMaterial({ color: 0x22262c }));
  rotor.add(blade);
  const blade2 = blade.clone();
  blade2.rotation.y = Math.PI / 2;
  rotor.add(blade2);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  rotor.add(disc);
  rotor.position.y = 1.3;
  g.add(rotor);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 6), bodyMat);
  mast.position.y = 1.05;
  g.add(mast);
  for (const sx of [-0.85, 0.85]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.6), whiteMat);
    skid.position.set(sx, -1.25, 0.3);
    g.add(skid);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), bodyMat);
    strut.position.set(sx, -0.95, 0.9);
    g.add(strut);
  }
  // red/blue beacon pair, flashing like the cruisers' light bars
  const beaconR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.4),
    new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 }));
  beaconR.position.set(-0.5, 1.0, -1.6);
  const beaconB = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0000aa }));
  beaconB.position.set(0.5, 1.0, -1.6);
  g.add(beaconR); g.add(beaconB);
  g.userData.rotor = rotor;
  g.userData.tailRotor = tailRotor;
  g.userData.beaconR = beaconR;
  g.userData.beaconB = beaconB;
  return g;
}

/**
 * One PD helicopter. It shadows the player from ahead of his heading so its
 * searchlight cone rakes the street in front of him — and straight into the
 * chase camera. The cone, the spotlight and the pool of light on the ground
 * all track the player every frame.
 */
export class PoliceHelicopter {
  constructor(scene, side) {
    this.scene = scene;
    this.side = side; // +1 / -1: which shoulder it flies on
    this.mesh = makeHelicopterMesh();
    scene.add(this.mesh);
    this.x = 0; this.z = 0; this.y = 34; this.heading = 0;
    this.spin = Math.random() * 6;
    // visible light cone (narrow at the heli, wide at the street)
    this.cone = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 6.0, 1, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffeeb8, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    scene.add(this.cone);
    this.spot = new THREE.SpotLight(0xffe9a8, 2.4, 110, 0.34, 0.55, 0);
    scene.add(this.spot);
    scene.add(this.spot.target);
    this.pool = new THREE.Mesh(
      new THREE.CircleGeometry(5.0, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.pool.rotation.x = -Math.PI / 2;
    scene.add(this.pool);
  }

  /** Place it (used on spawn, flying in from off the player's shoulder). */
  setPose(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.mesh.position.set(x, y, z);
  }

  update(dt, player, t) {
    const heading = player.inCar && player.car ? player.car.heading : player.heading;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const px = fz, pz = -fx; // right-hand perpendicular of the heading
    const ahead = this.side > 0 ? 23 : 17;
    const sideOff = this.side * 10;
    const wantX = player.x + fx * ahead + px * sideOff;
    const wantZ = player.z + fz * ahead + pz * sideOff;
    const wantY = 15.8 + Math.sin(t * 0.8 + this.side) * 1.1;
    const k = clamp(dt * 2.4, 0, 1); // tight tracking: the light stays on the car
    this.x = lerp(this.x, wantX, k);
    this.z = lerp(this.z, wantZ, k);
    this.y = lerp(this.y, wantY, clamp(dt * 1.8, 0, 1));
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.lookAt(player.x, 1.5, player.z);
    // rotors and beacons
    this.spin += dt;
    this.mesh.userData.rotor.rotation.y += dt * 26;
    this.mesh.userData.tailRotor.rotation.x += dt * 34;
    const flash = Math.floor(this.spin * 5) % 2 === 0;
    this.mesh.userData.beaconR.visible = flash;
    this.mesh.userData.beaconB.visible = !flash;
    // searchlight: cone + real spotlight + pool of light on the street
    const from = new THREE.Vector3(this.x, this.y - 1.2, this.z);
    const to = new THREE.Vector3(player.x, 0.2, player.z);
    const dir = to.clone().sub(from);
    const len = dir.length();
    this.cone.position.copy(from).addScaledVector(dir, 0.5);
    this.cone.scale.set(1, len, 1);
    this.cone.quaternion.setFromUnitVectors(UP, dir.normalize().multiplyScalar(-1));
    this.spot.position.copy(from);
    this.spot.target.position.copy(to);
    this.pool.position.set(player.x, 0.14, player.z);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.cone);
    this.scene.remove(this.spot);
    this.scene.remove(this.spot.target);
    this.scene.remove(this.pool);
  }
}

export class PoliceSystem {
  constructor(scene, colliders, rng) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = rng;
    this.wanted = 0;
    this.decayTimer = 0;
    this.spawnTimer = 0;
    this.bustTimer = 0;
    this.cruisers = [];
    this.cops = [];
    this.helis = [];
    this.maxCruisers = 0;
    this.time = 0;
  }

  addCrime(level) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + level, 0, 5);
    this.decayTimer = 0;
    this.maxCruisers = Math.min(1 + Math.floor(this.wanted / 2), 4);
    return this.wanted > before;
  }

  clear() {
    this.wanted = 0;
    this.bustTimer = 0;
    for (const c of this.cruisers) this.scene.remove(c.mesh);
    for (const c of this.cops) this.scene.remove(c.mesh);
    for (const h of this.helis) h.dispose();
    this.cruisers = [];
    this.cops = [];
    this.helis = [];
  }

  update(dt, player, traffic, onBusted, onCrime) {
    const px = player.x, pz = player.z;
    this.time += dt;
    // air support: one helicopter from 3 stars, a second at 5
    const wantHelis = this.wanted >= 5 ? 2 : this.wanted >= 3 ? 1 : 0;
    while (this.helis.length < wantHelis) {
      const side = this.helis.length === 0 ? 1 : -1;
      const heli = new PoliceHelicopter(this.scene, side);
      heli.setPose(px + side * 55, 32, pz - 40);
      this.helis.push(heli);
    }
    while (this.helis.length > wantHelis) this.helis.pop().dispose();
    for (const h of this.helis) h.update(dt, player, this.time);
    // wanted decays when the player stays clean and unseen
    if (this.wanted > 0) {
      this.decayTimer += dt;
      const nearCop = this.nearestCopDistance(px, pz) < 45;
      if (this.decayTimer > 22 && !nearCop) {
        this.wanted -= 1;
        this.decayTimer = 0;
        this.maxCruisers = Math.min(1 + Math.floor(this.wanted / 2), 4);
      }
    }
    // spawn cruisers up to the wanted level's cap
    this.spawnTimer -= dt;
    if (this.wanted > 0 && this.cruisers.length < this.maxCruisers && this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      const spot = this.spawnSpotNear(px, pz, 55 + Math.random() * 40);
      const cruiser = new Car(this.scene, 'police');
      cruiser.setPose(spot.x, spot.z, Math.atan2(px - spot.x, pz - spot.z));
      this.cruisers.push(cruiser);
    }
    // spawn a cop on foot when the player is on foot and wanted
    if (this.wanted >= 2 && !player.inCar && this.cops.length < Math.min(this.wanted - 1, 3) && this.spawnTimer <= -1) {
      this.spawnTimer = 1.5;
      const spot = this.spawnSpotNear(px, pz, 25 + Math.random() * 15);
      const cop = new Person(this.scene, 'cop', this.rng);
      cop.setPose(spot.x, spot.z, Math.atan2(px - spot.x, pz - spot.z));
      cop.speed = 3.4;
      this.cops.push(cop);
    }
    // cruisers chase and ram
    let anyNear = false;
    for (const cruiser of this.cruisers) {
      const d = dist2D(cruiser.x, cruiser.z, px, pz);
      if (d < 6) anyNear = true;
      const wantHeading = Math.atan2(px - cruiser.x, pz - cruiser.z);
      let diff = wantHeading - cruiser.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = clamp(diff * 1.6, -1, 1);
      const throttle = d > 6 ? 1 : 0.4;
      cruiser.drive(dt, { throttle, steer, brake: false }, this.colliders);
      if (player.car && cruiser.bump(player.car)) {
        player.car.speed *= 0.6;
        if (onCrime) onCrime('rammed');
      }
      // cruisers bumping traffic out of the way
      for (const t of traffic.cars) cruiser.bump(t);
    }
    // cops on foot chase and grab
    for (const cop of this.cops) {
      const d = dist2D(cop.x, cop.z, px, pz);
      if (d < 2.2) anyNear = true;
      const wantHeading = Math.atan2(px - cop.x, pz - cop.z);
      let diff = wantHeading - cop.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cop.heading += clamp(diff, -3 * dt, 3 * dt);
      cop.walkPhase += dt * 9;
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
      cop.syncMesh();
      // cops give up far away and despawn
      if (d > 160) { this.scene.remove(cop.mesh); this.cops.splice(this.cops.indexOf(cop), 1); }
    }
    // busted: a cruiser pinned against a slow player, or a cop touching him
    const playerSpeed = player.inCar ? Math.abs(player.car.speed) : Math.abs(player.footSpeed || 0);
    const copTouch = this.cops.some((c) => dist2D(c.x, c.z, px, pz) < 1.6);
    if (this.wanted > 0 && ((anyNear && playerSpeed < 1.5) || copTouch)) {
      this.bustTimer += dt;
      if (this.bustTimer > 3.5) { onBusted(); this.bustTimer = 0; }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
    // despawn cruisers that fell far behind
    for (const c of [...this.cruisers]) {
      if (dist2D(c.x, c.z, px, pz) > 220) {
        this.scene.remove(c.mesh);
        this.cruisers.splice(this.cruisers.indexOf(c), 1);
      }
    }
  }

  nearestCopDistance(x, z) {
    let best = Infinity;
    for (const c of this.cruisers) best = Math.min(best, dist2D(c.x, c.z, x, z));
    for (const c of this.cops) best = Math.min(best, dist2D(c.x, c.z, x, z));
    for (const h of this.helis) best = Math.min(best, dist2D(h.x, h.z, x, z));
    return best;
  }

  spawnSpotNear(x, z, dist) {
    for (let tries = 0; tries < 12; tries += 1) {
      const a = Math.random() * Math.PI * 2;
      const sx = clamp(x + Math.sin(a) * dist, -CITY_HALF, CITY_HALF);
      const sz = clamp(z + Math.cos(a) * dist, -CITY_HALF, CITY_HALF);
      const road = nearestRoadPoint(sx, sz);
      if (dist2D(road.x, road.z, x, z) > 25) return road;
    }
    const road = nearestRoadPoint(x + dist, z);
    return road;
  }
}
