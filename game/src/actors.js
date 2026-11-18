// actors.js — the moving population of Costa Verde: low-poly people (player
// avatar, civilians, story NPCs, gang members, foot cops), cars (civilian
// traffic, the stealable Comet GT, police cruisers) with simple arcade
// physics and lane-following traffic AI, and the police helicopter with its
// sweeping searchlight.

import { clamp, lerpAngle, makeRng, rand, pick, WORLD, streetCoord } from './util.js';
import { collide } from './city.js';

const T = () => window.THREE;

// ---------------------------------------------------------------- people ---
const SKIN = [0xf2c49b, 0xc68863, 0x8a5a3b, 0x6e4530, 0xffdbac];
const SHIRTS = [0xff5d5d, 0x39d0ff, 0xffd23e, 0x7dff5e, 0xff8ac2, 0xb78cff, 0xffffff, 0xff7847, 0x4fe3c1];
const PANTS = [0x2e3a55, 0x4a3a2a, 0x222222, 0x5d6a72, 0x704214];

// Builds a little articulated person: swinging legs, one arm that can raise a
// pistol. Returns the group plus the bits the animator needs.
export function makePerson(rng, { shirt, pants, skin, cop = false, gang = false } = {}) {
  const THREE = T();
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin ?? pick(rng, SKIN) });
  const shirtMat = new THREE.MeshLambertMaterial({ color: gang ? 0x39ff6a : cop ? 0x24406e : (shirt ?? pick(rng, SHIRTS)) });
  const pantsMat = new THREE.MeshLambertMaterial({ color: cop ? 0x1c2a44 : (pants ?? pick(rng, PANTS)) });
  const legGeo = new THREE.BoxGeometry(0.20, 0.78, 0.22);
  const legL = new THREE.Mesh(legGeo, pantsMat); legL.position.set(-0.13, 0.39, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat); legR.position.set(0.13, 0.39, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.30), shirtMat);
  torso.position.y = 1.14;
  const armGeo = new THREE.BoxGeometry(0.15, 0.62, 0.17);
  const armL = new THREE.Mesh(armGeo, shirtMat); armL.position.set(-0.36, 1.16, 0);
  const armR = new THREE.Mesh(armGeo, shirtMat); armR.position.set(0.36, 1.16, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skinMat);
  head.position.y = 1.72;
  g.add(legL, legR, torso, armL, armR, head);
  if (cop) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.10, 10),
      new THREE.MeshLambertMaterial({ color: 0x16283f }));
    cap.position.y = 1.90; g.add(cap);
  }
  if (gang) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.09, 10),
      new THREE.MeshBasicMaterial({ color: 0x39ff6a }));
    band.position.y = 1.82; g.add(band);
  }
  g.userData.parts = { legL, legR, armL, armR, torso, head };
  return g;
}

// A walker: wanders the sidewalks, flees danger, can stand as an NPC, can be
// shot. The fight behaviour of gang/cops is layered on by systems.js, which
// flips `mode` to 'fight' and steers the walker itself.
export class Walker {
  constructor(scene, rng, opts = {}) {
    this.mesh = makePerson(rng, opts);
    this.rng = rng;
    this.pos = this.mesh.position;
    this.pos.set(opts.x ?? 0, 0, opts.z ?? 0);
    this.heading = rand(rng, 0, Math.PI * 2);
    this.speed = 0;
    this.walkSpeed = rand(rng, 1.1, 1.7);
    this.mode = opts.mode ?? 'walk'; // walk | stand | fight | down | passenger
    this.hp = opts.hp ?? 30;
    this.target = null;
    this.waitT = rand(rng, 0, 2);
    this.fleeFrom = null;
    this.fleeT = 0;
    this.animT = rand(rng, 0, 6);
    this.dead = false;
    scene.add(this.mesh);
  }
  pickSidewalkTarget() {
    const r = this.rng;
    // Walk toward a point on a random nearby sidewalk line.
    const alongX = r() < 0.5;
    const line = streetCoord(Math.floor(rand(r, -4, 5))) + (r() < 0.5 ? -10.5 : 10.5);
    const along = clamp((alongX ? this.pos.z : this.pos.x) + rand(r, -90, 90), -245, 245);
    this.target = alongX ? { x: line, z: along } : { x: along, z: line };
  }
  panic(from, t = 3.5) {
    if (this.mode === 'walk') { this.fleeFrom = from; this.fleeT = t; }
  }
  hit(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.mode = 'down';
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.25;
      return true;
    }
    return false;
  }
  update(dt, colliders) {
    if (this.dead) return;
    this.animT += dt * (2 + this.speed * 3.2);
    const p = this.mesh.userData.parts;
    const swing = Math.sin(this.animT * 3) * clamp(this.speed / 2, 0, 1) * 0.55;
    p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 0.7;
    if (this.mode !== 'fight') p.armR.rotation.x = swing * 0.7;
    if (this.mode === 'stand' || this.mode === 'passenger') { this.speed = 0; return; }
    if (this.mode === 'fight') return; // systems.js steers fighters
    let tx, tz, want = this.walkSpeed;
    if (this.fleeT > 0 && this.fleeFrom) {
      this.fleeT -= dt;
      const dx = this.pos.x - this.fleeFrom.x, dz = this.pos.z - this.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = this.pos.x + (dx / d) * 12; tz = this.pos.z + (dz / d) * 12;
      want = 4.4;
    } else {
      if (!this.target || Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 1.6) {
        if (this.waitT > 0) { this.waitT -= dt; this.speed = 0; return; }
        this.pickSidewalkTarget();
        this.waitT = rand(this.rng, 0, 2.5);
      }
      tx = this.target.x; tz = this.target.z;
    }
    const wantHeading = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    this.heading = lerpAngle(this.heading, wantHeading, clamp(dt * 5, 0, 1));
    this.speed = lerp(this.speed, want, dt * 4);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    collide(this.pos, 0.45, colliders);
    this.mesh.rotation.y = this.heading;
  }
}
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ cars ---
const CAR_COLORS = [0xd64541, 0x3f7fbf, 0xe8b93e, 0xdadada, 0x37b878, 0xe2703a, 0x8e6cc8, 0x30323a, 0xf2f2f2, 0xbf3f7f];

export function makeCarMesh(kind, color) {
  const THREE = T();
  const g = new THREE.Group();
  const isCop = kind === 'cop';
  const isComet = kind === 'comet';
  const paint = new THREE.MeshLambertMaterial({ color: isCop ? 0xf4f4f6 : isComet ? 0x12c2b8 : color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e24 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x18222e });
  const bodyH = isComet ? 0.52 : 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, bodyH, 4.1), paint);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0), isCop ? dark : glass);
  cabin.position.set(0, 1.05, -0.2);
  g.add(cabin);
  if (isCop) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.3, 4.14), dark);
    stripe.position.y = 0.42; g.add(stripe);
    const bar = new THREE.Group();
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    bl.position.x = -0.3;
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    br.position.x = 0.3;
    bar.add(bl, br);
    bar.position.y = 1.42;
    g.add(bar);
    g.userData.lightbar = bar;
  }
  if (isComet) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.4), dark);
    spoiler.position.set(0, 1.02, -1.95); g.add(spoiler);
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 1.1), dark);
    scoop.position.set(0, 0.92, 1.2); g.add(scoop);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w); wheels.push(w);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  hl.position.set(0, 0.62, 2.06); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0xff3524 }));
  tl.position.set(0, 0.66, -2.06); g.add(tl);
  g.userData.wheels = wheels;
  return g;
}

// One car, three brains: 'traffic' follows the grid, 'cop' hunts a target,
// 'player' is driven by systems.js directly (this class just holds state).
export class Car {
  constructor(scene, rng, { kind = 'traffic', color, x = 0, z = 0, heading = 0 } = {}) {
    this.kind = kind;
    this.mesh = makeCarMesh(kind, color ?? pick(rng, CAR_COLORS));
    this.pos = this.mesh.position;
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.maxSpeed = kind === 'cop' ? 27 : kind === 'comet' ? 30 : rand(rng, 9.5, 13);
    this.rng = rng;
    this.steer = 0;
    this.throttle = 0;
    this.brake = false;
    this.target = null;
    this.stuckT = 0;
    this.flashT = rand(rng, 0, 1);
    scene.add(this.mesh);
  }
  get x() { return this.pos.x; }
  get z() { return this.pos.z; }
  frontX() { return this.pos.x + Math.sin(this.heading) * 2.4; }
  frontZ() { return this.pos.z + Math.cos(this.heading) * 2.4; }

  // Shared arcade move: accelerate toward `wantSpeed`, steer toward a point.
  drive(dt, steerTarget, wantSpeed, colliders, obstacles) {
    if (steerTarget) {
      const want = Math.atan2(steerTarget.x - this.pos.x, steerTarget.z - this.pos.z);
      let d = want - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.steer = clamp(d * 1.6, -1, 1);
      this.heading += this.steer * clamp(Math.abs(this.speed) * 0.16, 0.2, 1.5) * dt * 2.2 * Math.sign(this.speed || 1);
    }
    // Obstacle braking: anything solid in the front arc slows us down.
    let blocked = false;
    if (obstacles) {
      const fx = this.frontX(), fz = this.frontZ();
      for (const o of obstacles) {
        if (o === this) continue;
        const ox = o.pos ? o.pos.x : o.x, oz = o.pos ? o.pos.z : o.z;
        if (Math.hypot(ox - fx, oz - fz) < 2.6) { blocked = true; break; }
      }
    }
    const goal = blocked ? 0 : wantSpeed;
    this.speed += clamp(goal - this.speed, -dt * 22, dt * 9);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    collide(this.pos, 1.7, colliders);
    this.mesh.rotation.y = this.heading;
    const w = this.mesh.userData.wheels;
    if (w) for (const wh of w) wh.rotation.x += this.speed * dt * 2.6;
    return blocked;
  }

  // Traffic brain: cruise the street you are on; at an intersection, maybe
  // turn. Streets are the grid lines; the car holds a lane offset.
  updateTraffic(dt, colliders, obstacles) {
    if (!this.target || Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 6) {
      this.pickTrafficTarget();
    }
    this.drive(dt, this.target, this.maxSpeed, colliders, obstacles);
  }
  pickTrafficTarget() {
    const r = this.rng;
    // Snap to the nearest street line on each axis, then run far along one.
    const nearStreet = (v) => streetCoord(Math.round(v / WORLD.pitch));
    const goX = r() < 0.5;
    if (goX) {
      const laneZ = nearStreet(this.pos.z) + (this.pos.x > 0 ? -3.4 : 3.4) * (r() < 0.5 ? 1 : -1);
      this.target = { x: clamp(this.pos.x + rand(r, 120, 300) * (r() < 0.5 ? 1 : -1), -225, 225), z: clamp(laneZ, -222, 222) };
    } else {
      const laneX = nearStreet(this.pos.x) + (r() < 0.5 ? -3.4 : 3.4);
      this.target = { x: clamp(laneX, -222, 222), z: clamp(this.pos.z + rand(r, 120, 300) * (r() < 0.5 ? 1 : -1), -225, 225) };
    }
  }

  // Cop brain: hunt the target point, back off if nose-to-nose and stuck.
  updateCop(dt, colliders, obstacles, targetPos) {
    this.flashT += dt * 6;
    const bar = this.mesh.userData.lightbar;
    if (bar) {
      const on = Math.sin(this.flashT * 6) > 0;
      bar.children[0].material.color.setHex(on ? 0xff2a2a : 0x551111);
      bar.children[1].material.color.setHex(on ? 0x111155 : 0x2a6bff);
    }
    const d = Math.hypot(targetPos.x - this.pos.x, targetPos.z - this.pos.z);
    let goal = this.maxSpeed;
    if (d < 7) goal = 4; // arrive on scene, don't orbit through the player
    const blocked = this.drive(dt, targetPos, goal, colliders, obstacles);
    if (blocked && Math.abs(this.speed) < 0.5) {
      this.stuckT += dt;
      if (this.stuckT > 1.4) { // reverse out and re-approach
        this.pos.x -= Math.sin(this.heading) * 2.2;
        this.pos.z -= Math.cos(this.heading) * 2.2;
        this.heading += 0.7;
        this.stuckT = 0;
      }
    } else this.stuckT = 0;
  }
}

// ------------------------------------------------------------ helicopter ---
export class Helicopter {
  constructor(scene) {
    const THREE = T();
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x22242c });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.7, 4.6), bodyMat);
    g.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), new THREE.MeshLambertMaterial({ color: 0x8fb6d8 }));
    nose.position.set(0, -0.1, 2.2); nose.scale.set(1, 0.75, 1); g.add(nose);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.6), bodyMat);
    tail.position.set(0, 0.25, -4.2); g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.7), bodyMat);
    fin.position.set(0, 0.6, -6.4); g.add(fin);
    this.rotor = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.06, 0.7), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    this.rotor.position.y = 1.15; g.add(this.rotor);
    const skidMat = new THREE.MeshLambertMaterial({ color: 0x555a63 });
    for (const sx of [-0.9, 0.9]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.6), skidMat);
      skid.position.set(sx, -1.15, 0); g.add(skid);
    }
    // Searchlight: a real spotlight plus a visible additive cone.
    this.spot = new THREE.SpotLight(0xfff3c4, 2.4, 90, 0.30, 0.45, 0.6);
    this.spot.position.set(0, -0.8, 1.4);
    g.add(this.spot);
    g.add(this.spot.target);
    const coneGeo = new THREE.ConeGeometry(6.5, 30, 20, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffeebb, transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.cone = new THREE.Mesh(coneGeo, coneMat);
    scene.add(this.cone);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(5.6, 20),
      new THREE.MeshBasicMaterial({ color: 0xffeebb, transparent: true, opacity: 0.20, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    this.pool = pool;
    scene.add(pool);
    this.mesh = g;
    this.pos = g.position;
    this.pos.set(260, 60, 0);
    this.active = false;
    this.orbit = 0;
    scene.add(g);
    this.mesh.visible = false;
    this.cone.visible = false;
    this.pool.visible = false;
  }
  setActive(on) {
    this.active = on;
    this.mesh.visible = on;
    this.cone.visible = on;
    this.pool.visible = on;
  }
  update(dt, t, targetPos) {
    if (!this.active) return;
    this.rotor.rotation.y += dt * 28;
    this.orbit += dt * 0.35;
    const R = 17;
    const wx = targetPos.x + Math.cos(this.orbit) * R;
    const wz = targetPos.z + Math.sin(this.orbit) * R;
    this.pos.x += (wx - this.pos.x) * clamp(dt * 1.6, 0, 1);
    this.pos.z += (wz - this.pos.z) * clamp(dt * 1.6, 0, 1);
    this.pos.y = 27 + Math.sin(t * 0.9) * 1.4;
    this.mesh.rotation.y = Math.atan2(targetPos.x - this.pos.x, targetPos.z - this.pos.z);
    this.mesh.rotation.z = Math.sin(this.orbit * 2) * 0.06;
    // Aim the light + cone at the target.
    this.spot.target.position.copy(this.mesh.worldToLocal(new (T()).Vector3(targetPos.x, 0, targetPos.z)));
    const mid = new (T()).Vector3((this.pos.x + targetPos.x) / 2, this.pos.y / 2, (this.pos.z + targetPos.z) / 2);
    this.cone.position.copy(mid);
    this.cone.lookAt(targetPos.x, 0, targetPos.z);
    this.cone.rotateX(-Math.PI / 2);
    this.cone.scale.y = this.pos.y / 30;
    this.pool.position.set(targetPos.x, 0.25, targetPos.z);
  }
}
