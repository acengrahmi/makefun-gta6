// Cars: a box-built sedan / taxi / sports / van / police cruiser, arcade driving
// physics for the player, and traffic that follows the road grid.
import { clamp, lerp, angleLerp, dist2D } from './util.js';
import { PITCH, ROAD_K, ROAD_HALF, CITY_HALF, collideCircle } from './city.js';

const CAR_COLORS = {
  sedan: [0xc23b2e, 0x2e6fc2, 0xe8e8e8, 0x3a3f46, 0x7a4a9e, 0x2e8a6a],
  taxi: [0xffc21a],
  sports: [0xd41e2a, 0xff7a1a, 0x1a1a22, 0x0e7a5a],
  van: [0xd8d8d8, 0x5a6a7a, 0x8a5a3a],
  police: [0x14181e],
};

const CAR_STATS = {
  sedan: { accel: 13, top: 30, grip: 2.4 },
  taxi: { accel: 12, top: 28, grip: 2.3 },
  sports: { accel: 18, top: 42, grip: 3.0 },
  van: { accel: 9, top: 22, grip: 2.0 },
  police: { accel: 16, top: 38, grip: 2.8 },
};

/** Build a low-poly car mesh. `kind` picks colour pool and shape; police gets a light bar. */
export function makeCarMesh(kind, colorHex) {
  const g = new THREE.Group();
  const color = colorHex ?? CAR_COLORS[kind][Math.floor(Math.random() * CAR_COLORS[kind].length)];
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const trim = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const bodyH = kind === 'van' ? 1.5 : 0.85;
  const bodyL = kind === 'van' ? 4.6 : 4.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, bodyH, bodyL), paint);
  body.position.y = 0.75; body.castShadow = true;
  g.add(body);
  const cabinH = kind === 'van' ? 0.9 : 0.7;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, cabinH, kind === 'van' ? 3.4 : 2.1), glass);
  cabin.position.set(0, bodyH + 0.35 + cabinH / 2 - 0.3, kind === 'van' ? -0.2 : 0.15);
  cabin.castShadow = true;
  g.add(cabin);
  if (kind === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), trim);
    spoiler.position.set(0, 1.55, -2.05);
    g.add(spoiler);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xaa8833 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), lightMat);
    h.position.set(sx, 0.85, bodyL / 2 + 0.02);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08),
      new THREE.MeshLambertMaterial({ color: 0xc22a2a, emissive: 0x661111 }));
    t.position.set(sx, 0.85, -bodyL / 2 - 0.02);
    g.add(t);
  }
  let lightBar = null;
  if (kind === 'police') {
    const bar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 }));
    r.position.x = -0.4;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0000aa }));
    b.position.x = 0.4;
    bar.add(r); bar.add(b);
    bar.position.set(0, bodyH + cabinH + 0.15, 0.15);
    g.add(bar);
    lightBar = bar;
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.5, 1.2),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    door.position.set(0, 0.8, 0.3);
    g.add(door);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xffe94d, emissive: 0x887700 }));
    sign.position.set(0, bodyH + cabinH + 0.1, 0.15);
    g.add(sign);
  }
  g.userData.wheels = wheels;
  g.userData.lightBar = lightBar;
  return g;
}

export class Car {
  constructor(scene, kind, colorHex) {
    this.kind = kind;
    this.stats = CAR_STATS[kind];
    this.mesh = makeCarMesh(kind, colorHex);
    scene.add(this.mesh);
    this.x = 0; this.z = 0; this.heading = 0;
    this.speed = 0;
    this.wheelSpin = 0;
    this.radius = 1.9;
    this.ai = null; // traffic brain when set
    this.flash = 0;
  }

  setPose(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * 0.016;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin * 0.6;
    if (this.mesh.userData.lightBar) {
      this.flash += 0.016;
      this.mesh.userData.lightBar.visible = Math.floor(this.flash * 6) % 2 === 0;
    }
  }

  /** Arcade drive step. input: {throttle -1..1, steer -1..1, brake bool}. */
  drive(dt, input, colliders) {
    const s = this.stats;
    if (input.throttle > 0) this.speed += s.accel * input.throttle * dt;
    else if (input.throttle < 0) this.speed += s.accel * 0.9 * input.throttle * dt;
    if (input.brake) this.speed -= Math.sign(this.speed) * 26 * dt;
    // drag + rolling resistance
    this.speed -= this.speed * 0.55 * dt;
    this.speed = clamp(this.speed, -10, s.top);
    if (Math.abs(this.speed) < 0.05 && input.throttle === 0) this.speed = 0;
    const steerAmount = input.steer * s.grip * clamp(Math.abs(this.speed) / 8, 0, 1) * dt;
    this.heading += steerAmount * Math.sign(this.speed || 1) * (this.speed >= 0 ? 1 : -1);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const p = { x: nx, z: nz };
    if (collideCircle(p, this.radius, colliders)) {
      // scrape along the wall: keep the unblocked axis, bleed speed
      const px = { x: nx, z: this.z };
      const pz = { x: this.x, z: nz };
      const hitX = collideCircle(px, this.radius, colliders);
      const hitZ = collideCircle(pz, this.radius, colliders);
      if (!hitX) { this.x = px.x; }
      if (!hitZ) { this.z = pz.z; }
      this.speed *= 0.45;
    } else {
      this.x = nx; this.z = nz;
    }
    // stay inside the city (the sea is the edge)
    this.x = clamp(this.x, -CITY_HALF - 10, CITY_HALF + 10);
    this.z = clamp(this.z, -CITY_HALF - 10, CITY_HALF + 8);
    this.syncMesh();
  }

  /** Simple circle push against another car. Returns true on contact. */
  bump(other) {
    const d = dist2D(this.x, this.z, other.x, other.z);
    const min = this.radius + other.radius - 0.4;
    if (d >= min || d < 0.001) return false;
    const push = (min - d) / 2;
    const nx = (this.x - other.x) / d, nz = (this.z - other.z) / d;
    this.x += nx * push; this.z += nz * push;
    other.x -= nx * push; other.z -= nz * push;
    const avg = (this.speed + other.speed) / 2;
    this.speed = avg * 0.7; other.speed = avg * 0.7;
    this.syncMesh(); other.syncMesh();
    return true;
  }
}

/** Traffic that drives the grid: pick a road, a direction, turn at intersections. */
export class TrafficManager {
  constructor(scene, colliders, count) {
    this.scene = scene;
    this.colliders = colliders;
    this.cars = [];
    const kinds = ['sedan', 'sedan', 'taxi', 'van', 'sports'];
    for (let i = 0; i < count; i += 1) {
      const kind = kinds[i % kinds.length];
      const car = new Car(scene, kind);
      car.ai = this.randomBrain(true);
      car.setPose(car.ai.x, car.ai.z, car.ai.heading);
      this.cars.push(car);
    }
  }

  randomBrain(initial) {
    const vertical = Math.random() < 0.5;
    const line = ROAD_K[Math.floor(Math.random() * ROAD_K.length)] * PITCH;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = 3.5;
    const along = (Math.random() * 2 - 1) * (CITY_HALF - 20);
    const x = vertical ? line + lane * dir : along;
    const z = vertical ? along : line + lane * dir;
    const heading = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    return {
      vertical, line, dir, lane,
      x, z, heading,
      speed: 8 + Math.random() * 6,
      nextTurn: along + dir * (20 + Math.random() * 40),
    };
  }

  update(dt, playerCar, onCrash) {
    for (const car of this.cars) {
      const b = car.ai;
      if (!b) { car.syncMesh(); continue; } // parked car: stands still, still bumpable
      // brake for the car ahead on the same road
      let target = b.speed;
      for (const other of this.cars) {
        if (other === car || !other.ai) continue;
        const o = other.ai;
        if (o.vertical !== b.vertical || o.line !== b.line || o.dir !== b.dir) continue;
        const ahead = b.vertical ? (o.z - b.z) * b.dir : (o.x - b.x) * b.dir;
        const side = b.vertical ? Math.abs(o.x - b.x) : Math.abs(o.z - b.z);
        if (ahead > 0 && ahead < 10 && side < 3) { target = 0; break; }
      }
      if (playerCar) {
        const d = dist2D(car.x, car.z, playerCar.x, playerCar.z);
        if (d < 9) {
          const ahead = b.vertical ? (playerCar.z - b.z) * b.dir : (playerCar.x - b.x) * b.dir;
          if (ahead > 0 && ahead < 9) target = 0;
        }
      }
      car.speed = lerp(car.speed, target, clamp(dt * 3, 0, 1));
      const step = car.speed * b.dir * dt;
      if (b.vertical) car.z += step; else car.x += step;
      car.heading = angleLerp(car.heading, b.heading, clamp(dt * 6, 0, 1));
      // reached the next intersection: maybe turn
      const along = b.vertical ? car.z : car.x;
      if ((b.dir > 0 && along >= b.nextTurn) || (b.dir < 0 && along <= b.nextTurn)) {
        const crossLine = Math.round(along / PITCH) * PITCH;
        const r = Math.random();
        if (r < 0.62) {
          b.nextTurn = along + b.dir * PITCH;
        } else {
          // turn onto the crossing road
          const newDir = Math.random() < 0.5 ? 1 : -1;
          b.vertical = !b.vertical;
          b.line = crossLine;
          b.dir = newDir;
          if (b.vertical) {
            car.x = crossLine + b.lane * newDir;
            car.z = Math.round(car.z / PITCH) * PITCH;
            b.heading = newDir > 0 ? 0 : Math.PI;
          } else {
            car.z = crossLine + b.lane * newDir;
            car.x = Math.round(car.x / PITCH) * PITCH;
            b.heading = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
          b.nextTurn = (b.vertical ? car.z : car.x) + newDir * (PITCH + Math.random() * 40);
        }
      }
      // keep inside the city: U-turn at the edge
      const alongNow = b.vertical ? car.z : car.x;
      if (Math.abs(alongNow) > CITY_HALF) {
        b.dir *= -1;
        b.heading += Math.PI;
        b.nextTurn = alongNow + b.dir * PITCH;
      }
      if (collideCircle(car, car.radius, this.colliders)) car.speed *= 0.5;
      car.syncMesh();
    }
    // traffic vs player bumps
    if (playerCar) {
      for (const car of this.cars) {
        if (car.bump(playerCar) && onCrash) onCrash(car);
      }
    }
    // traffic vs traffic: simple separation so they do not stack
    for (let i = 0; i < this.cars.length; i += 1) {
      for (let j = i + 1; j < this.cars.length; j += 1) this.cars[i].bump(this.cars[j]);
    }
  }

  /** A random parked car the player can steal, placed on a road near (x,z). */
  spawnParked(kind, x, z, heading, colorHex) {
    const car = new Car(this.scene, kind, colorHex);
    car.setPose(x, z, heading);
    car.ai = null;
    this.cars.push(car);
    return car;
  }

  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.mesh);
  }
}
