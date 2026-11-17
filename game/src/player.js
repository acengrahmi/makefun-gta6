// The player: Rico Santana on foot (WASD + mouse look, sprint, shoot) and the
// logic for stealing and exiting cars. The camera lives in main.js; this file
// only moves the body and decides what the player is doing.
import { clamp, dist2D, angleLerp, mulberry32 } from './util.js';
import { collideCircle } from './city.js';
import { Person } from './people.js';

export class Player {
  constructor(scene, colliders, rngSeed) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = mulberry32(rngSeed + 5);
    this.body = new Person(scene, 'player', this.rng);
    this.x = 0; this.z = 0; this.heading = 0;
    this.footSpeed = 0;
    this.health = 100;
    this.money = 0;
    this.inCar = false;
    this.car = null;
    this.shootCooldown = 0;
    this.hurtTimer = 0;
  }

  setPose(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.body.setPose(x, z, heading);
  }

  /** On-foot step. move: {x (strafe -1..1), z (forward -1..1)} in camera space. */
  walk(dt, move, sprint, camYaw) {
    const targetSpeed = sprint ? 7.5 : 4.2;
    const mx = move.x, mz = move.z;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      // camera-relative movement: forward is where the camera looks
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      const wx = (fx * mz + rx * mx) / len;
      const wz = (fz * mz + rz * mx) / len;
      this.heading = angleLerp(this.heading, Math.atan2(wx, wz), clamp(dt * 12, 0, 1));
      this.footSpeed = targetSpeed;
      const nx = this.x + wx * targetSpeed * dt;
      const nz = this.z + wz * targetSpeed * dt;
      const p = { x: nx, z: nz };
      if (!collideCircle(p, 0.7, this.colliders)) { this.x = nx; this.z = nz; }
      else {
        const px = { x: nx, z: this.z };
        const pz = { x: this.x, z: nz };
        if (!collideCircle(px, 0.7, this.colliders)) this.x = nx;
        if (!collideCircle(pz, 0.7, this.colliders)) this.z = nz;
      }
    } else {
      this.footSpeed = 0;
    }
    this.body.x = this.x; this.body.z = this.z;
    this.body.heading = this.heading;
    this.body.speed = this.footSpeed;
    this.body.walkPhase += dt * (this.footSpeed > 0 ? 9 : 2);
    this.body.syncMesh();
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
  }

  /** Try to enter the nearest car within 3.5 units. Returns the car or null. */
  tryEnterCar(traffic) {
    let best = null; let bestD = 3.5;
    for (const car of traffic.cars) {
      const d = dist2D(this.x, this.z, car.x, car.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return null;
    this.inCar = true;
    this.car = best;
    this.body.mesh.visible = false;
    return best;
  }

  exitCar() {
    if (!this.car) return;
    const a = this.car.heading + Math.PI / 2;
    this.x = this.car.x + Math.sin(a) * 3;
    this.z = this.car.z + Math.cos(a) * 3;
    this.heading = this.car.heading;
    this.inCar = false;
    this.car = null;
    this.body.mesh.visible = true;
    this.setPose(this.x, this.z, this.heading);
  }

  hurt(amount) {
    if (this.hurtTimer > 0) return;
    this.hurtTimer = 0.35;
    this.health = clamp(this.health - amount, 0, 100);
  }

  heal(dt) {
    if (this.health > 0 && this.health < 100) this.health = clamp(this.health + 1.6 * dt, 0, 100);
  }
}
