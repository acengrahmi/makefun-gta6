// The wanted system: stars rise with crimes, fall with quiet time, and the Costa
// Verde PD answers — cruisers that ram the player and cops on foot who grab him.
import { clamp, dist2D } from './util.js';
import { PITCH, ROAD_K, CITY_HALF, nearestRoadPoint } from './city.js';
import { Car } from './vehicles.js';
import { Person } from './people.js';

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
    this.maxCruisers = 0;
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
    this.cruisers = [];
    this.cops = [];
  }

  update(dt, player, traffic, onBusted, onCrime) {
    const px = player.x, pz = player.z;
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
