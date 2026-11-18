// actors.js — the living population of Costa Verde: vehicle and pedestrian
// factories (traffic sedans, taxis, the Comet GT, police cruisers, foot cops,
// the searchlight helicopter) and the AI that drives them: lane-following
// traffic, wandering/fleeing pedestrians, and police who hunt the player.

import { CENTERS, STREET_HALF, CITY_MIN, CITY_MAX, clamp, angleLerp, dist2, collideCircle } from './util.js';

const bodyGeo = new THREE.BoxGeometry(1.9, 0.62, 4.4);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.55, 2.2);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14151a });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });

export function makeVehicleMesh(kind, color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, paint);
  body.position.y = 0.62; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.position.set(0, 1.18, -0.2); g.add(cabin);
  if (kind === 'comet') {
    body.scale.set(1.02, 0.78, 1.06);
    cabin.position.y = 1.02;
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), paint);
    spoiler.position.set(0, 1.05, -2.1); g.add(spoiler);
  }
  if (kind === 'van') { body.scale.set(1.05, 1.5, 1.15); cabin.position.y = 1.5; }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe95d }));
    sign.position.set(0, 1.6, -0.2); g.add(sign);
  }
  if (kind === 'cruiser') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.3, 4.44),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    stripe.position.y = 0.66; g.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.x = -0.45;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0x2a6aff }));
    blue.position.x = 0.45;
    bar.add(red); bar.add(blue);
    bar.position.set(0, 1.55, -0.2);
    g.add(bar);
    g.userData.lightbar = bar;
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  hl.position.set(0, 0.66, 2.22); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3040 }));
  tl.position.set(0, 0.7, -2.22); g.add(tl);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.36, wz);
    g.add(w);
  }
  return g;
}

function laneCoord(center, dir, axis) {
  // right-hand traffic: offset to the driver's right of the centre line
  return axis === 'z' ? center + (dir > 0 ? -4 : 4) : center + (dir > 0 ? 4 : -4);
}

export function spawnTraffic(scene, rng, count) {
  const cars = [];
  const colors = [0xd94f30, 0x3f7fbf, 0xe8e3d8, 0x59b06a, 0x8a5fb0, 0xbfb23f, 0x707880, 0xff8c42];
  for (let i = 0; i < count; i++) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const dir = rng() < 0.5 ? 1 : -1;
    const center = CENTERS[Math.floor(rng() * CENTERS.length)];
    const along = -250 + rng() * 500;
    const kind = rng() < 0.18 ? 'taxi' : (rng() < 0.1 ? 'van' : 'sedan');
    const mesh = makeVehicleMesh(kind, kind === 'taxi' ? 0xffc61a : colors[i % colors.length]);
    const lane = laneCoord(center, dir, axis);
    const car = {
      mesh, kind, axis, dir, center, lane,
      x: axis === 'x' ? along : lane,
      z: axis === 'z' ? along : lane,
      heading: axis === 'x' ? dir * Math.PI / 2 : (dir > 0 ? 0 : Math.PI),
      speed: 0, targetSpeed: 9 + rng() * 4, turnCooldown: rng() * 6,
      driver: 'traffic', hp: 100, honk: 0,
    };
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.heading;
    scene.add(mesh);
    cars.push(car);
  }
  return cars;
}

export function spawnParked(scene, rng, spots) {
  const cars = [];
  const colors = [0xb0b6ba, 0x7a4a8c, 0x2a6a8c, 0xc2b280, 0x50565c, 0x8c2a3a];
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const kind = s.kind || 'sedan';
    const mesh = makeVehicleMesh(kind, s.color || colors[i % colors.length]);
    const car = {
      mesh, kind, x: s.x, z: s.z, heading: s.heading || 0, speed: 0,
      driver: null, hp: 100, locked: !!s.locked, id: s.id || '',
    };
    mesh.position.set(s.x, 0, s.z);
    mesh.rotation.y = car.heading;
    scene.add(mesh);
    cars.push(car);
  }
  return cars;
}

// ---- pedestrians -----------------------------------------------------------
const skinTones = [0xf2c79b, 0xc98d5e, 0x8a5a34, 0x6e4525];
const shirtColors = [0xff5d5d, 0x4de3ff, 0xffd23f, 0x7dff6a, 0xff8ac2, 0xf2ede2, 0x5db9ff, 0xff7847];

export function makePedMesh(rng, opts = {}) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: opts.shirt ?? shirtColors[Math.floor(rng() * shirtColors.length)] });
  const skin = new THREE.MeshLambertMaterial({ color: skinTones[Math.floor(rng() * skinTones.length)] });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.26), new THREE.MeshLambertMaterial({ color: opts.pants ?? 0x2c3242 }));
  legs.position.y = 0.38; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), shirt);
  torso.position.y = 1.1; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.68; g.add(head);
  if (opts.cop) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.25, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x1c2f57 }));
    cap.position.y = 1.86; g.add(cap);
  }
  if (opts.marker) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 4), new THREE.MeshBasicMaterial({ color: opts.marker }));
    m.rotation.x = Math.PI; m.position.y = 2.6; g.add(m);
    g.userData.markerMesh = m;
  }
  g.userData.legs = legs; g.userData.torso = torso;
  return g;
}

export function spawnPeds(scene, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const mesh = makePedMesh(rng);
    // sidewalk points: just outside a random street centre line
    const cx = CENTERS[Math.floor(rng() * CENTERS.length)];
    const cz = CENTERS[Math.floor(rng() * CENTERS.length)];
    const onX = rng() < 0.5;
    const x = onX ? cx + (rng() < 0.5 ? -1 : 1) * (STREET_HALF + 2.6) : -250 + rng() * 500;
    const z = onX ? -250 + rng() * 500 : cz + (rng() < 0.5 ? -1 : 1) * (STREET_HALF + 2.6);
    const ped = {
      mesh, x, z, tx: x, tz: z, heading: rng() * Math.PI * 2,
      speed: 1.2 + rng() * 0.9, state: 'walk', hp: 30, role: 'ped',
      walkPhase: rng() * 6, fleeT: 0, repick: rng() * 4,
    };
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push(ped);
  }
  return peds;
}

// ---- helicopter --------------------------------------------------------------
export function makeHeli(scene) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x22242c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 5.6), bodyMat);
  g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 5), bodyMat);
  tail.position.set(0, 0.3, -5); g.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.7), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  rotor.position.y = 1.4; g.add(rotor);
  g.userData.rotor = rotor;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(10, 38, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  cone.position.y = -20;
  g.add(cone);
  const spot = new THREE.SpotLight(0xfff2b0, 1.6, 90, 0.32, 0.5, 0.6);
  spot.position.set(0, -1, 0);
  g.add(spot); g.add(spot.target);
  g.userData.spot = spot;
  g.visible = false;
  scene.add(g);
  return { mesh: g, angle: 0, active: false };
}

// ---- AI updates ---------------------------------------------------------------
export function updateTraffic(state, dt, rng) {
  const p = state.player;
  for (const car of state.traffic) {
    if (car.driver !== 'traffic') continue;
    car.turnCooldown -= dt;
    const along = car.axis === 'x' ? car.x : car.z;
    // brake for the car ahead or the player
    let want = car.targetSpeed;
    for (const other of state.traffic) {
      if (other === car || other.axis !== car.axis || other.dir !== car.dir || other.center !== car.center) continue;
      const gap = (car.axis === 'x' ? other.x - car.x : other.z - car.z) * car.dir;
      if (gap > 0 && gap < 10) want = Math.min(want, gap < 5 ? 0 : other.speed);
    }
    const pGap = (car.axis === 'x' ? p.x - car.x : p.z - car.z) * car.dir;
    const pLat = Math.abs((car.axis === 'x' ? p.z : p.x) - car.lane);
    if (pGap > 0 && pGap < 9 && pLat < 3) want = 0;
    car.speed = clamp(car.speed + (want > car.speed ? 6 : -14) * dt, 0, car.targetSpeed);
    const step = car.speed * dt * car.dir;
    if (car.axis === 'x') car.x += step; else car.z += step;
    // intersection turn
    if (car.turnCooldown <= 0) {
      for (const c of CENTERS) {
        if (Math.abs(along - c) < 1.6 && c !== car.center) {
          if (rng() < 0.45 || Math.abs(along) > 245) {
            const newAxis = car.axis === 'x' ? 'z' : 'x';
            const newDir = Math.abs(along) > 245 ? (along > 0 ? -1 : 1) : (rng() < 0.5 ? 1 : -1);
            car.center = c;
            car.axis = newAxis; car.dir = newDir;
            car.lane = laneCoord(c, newDir, newAxis);
            car.turnCooldown = 4 + rng() * 5;
          }
          break;
        }
      }
    }
    // hard bounds: turn around at the city edge
    if (along > CITY_MAX - 6 || along < CITY_MIN + 6) {
      car.dir *= -1;
      car.lane = laneCoord(car.center, car.dir, car.axis);
      car.turnCooldown = 3;
    }
    if (car.axis === 'x') { car.z = car.lane; car.heading = angleLerp(car.heading, car.dir * Math.PI / 2, 1 - Math.exp(-6 * dt)); }
    else { car.x = car.lane; car.heading = angleLerp(car.heading, car.dir > 0 ? 0 : Math.PI, 1 - Math.exp(-6 * dt)); }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}

export function updatePeds(state, dt, rng, colliders) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    ped.walkPhase += dt * (ped.state === 'flee' ? 11 : 6);
    let moving = false;
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const dx = ped.x - state.threat.x, dz = ped.z - state.threat.z;
      const d = Math.hypot(dx, dz) || 1;
      ped.tx = ped.x + (dx / d) * 20; ped.tz = ped.z + (dz / d) * 20;
      if (ped.fleeT <= 0) ped.state = 'walk';
      moving = true;
    } else if (ped.role === 'cop') {
      ped.tx = p.x; ped.tz = p.z; moving = true;
    } else if (ped.role === 'viper') {
      moving = ped.state !== 'idle'; // systems.js steers vipers via tx/tz
    } else if (ped.role === 'npc' || ped.role === 'fare-wait' || ped.role === 'fare-ride') {
      moving = false; // story characters and taxi fares are driven by systems.js
    } else {
      ped.repick -= dt;
      if (ped.repick <= 0 || dist2(ped.x, ped.z, ped.tx, ped.tz) < 1.2) {
        ped.repick = 5 + rng() * 8;
        const cx = CENTERS[Math.floor(rng() * CENTERS.length)];
        if (rng() < 0.5) { ped.tx = cx + (rng() < 0.5 ? -1 : 1) * (STREET_HALF + 2.6); ped.tz = clamp(ped.z + rand2(rng, -90, 90), -258, 258); }
        else { ped.tz = CENTERS[Math.floor(rng() * CENTERS.length)] + (rng() < 0.5 ? -1 : 1) * (STREET_HALF + 2.6); ped.tx = clamp(ped.x + rand2(rng, -90, 90), -258, 258); }
      }
      moving = true;
    }
    if (moving) {
      const dx = ped.tx - ped.x, dz = ped.tz - ped.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        const sp = ped.state === 'flee' ? 5.4 : (ped.role === 'cop' ? 6.3 : ped.speed);
        ped.heading = angleLerp(ped.heading, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
        let nx = ped.x + Math.sin(ped.heading) * sp * dt;
        let nz = ped.z + Math.cos(ped.heading) * sp * dt;
        [nx, nz] = collideCircle(nx, nz, 0.45, colliders);
        ped.x = clamp(nx, -266, 266); ped.z = clamp(nz, -266, 392);
        ped.mesh.position.y = Math.abs(Math.sin(ped.walkPhase)) * 0.07;
        if (ped.mesh.userData.legs) ped.mesh.userData.legs.rotation.x = Math.sin(ped.walkPhase) * 0.5;
      }
    }
    if (ped.mesh.userData.markerMesh) ped.mesh.userData.markerMesh.rotation.y += dt * 2.4;
    ped.mesh.position.x = ped.x; ped.mesh.position.z = ped.z;
    ped.mesh.rotation.y = ped.heading;
  }
}

function rand2(rng, lo, hi) { return lo + rng() * (hi - lo); }

export function updatePolice(state, dt) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  for (const cop of state.police) {
    const d = dist2(cop.x, cop.z, px, pz);
    if (d > 260) { // respawn nearer, at a street behind the player
      cop.x = px + (Math.random() - 0.5) * 90;
      cop.z = pz + (Math.random() - 0.5) * 90;
      cop.speed = 0;
    }
    const want = Math.atan2(px - cop.x, pz - cop.z);
    const diff = ((want - cop.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    cop.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
    const topSpeed = p.car ? 27 : 17;
    cop.speed = clamp(cop.speed + (d > 7 ? 14 : -6) * dt, 0, topSpeed);
    cop.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.z += Math.cos(cop.heading) * cop.speed * dt;
    cop.x = clamp(cop.x, -272, 272); cop.z = clamp(cop.z, -272, 396);
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
    const bar = cop.mesh.userData.lightbar;
    if (bar) bar.children[0].material.color.setHex(Math.floor(state.time * 6) % 2 ? 0xff2a2a : 0x550000);
    if (bar) bar.children[1].material.color.setHex(Math.floor(state.time * 6) % 2 ? 0x5500ff : 0x2a6aff);
  }
}

export function updateHeli(state, dt) {
  const h = state.heli;
  if (!h) return;
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  h.active = state.wanted >= 3;
  h.mesh.visible = h.active;
  if (!h.active) return;
  h.angle += dt * 0.45;
  const hx = px + Math.sin(h.angle) * 24;
  const hz = pz + Math.cos(h.angle) * 24;
  h.mesh.position.set(hx, 33, hz);
  h.mesh.rotation.y = h.angle + Math.PI / 2;
  h.mesh.userData.rotor.rotation.y += dt * 28;
  const spot = h.mesh.userData.spot;
  spot.target.position.set(px - hx, -33, pz - hz);
  spot.target.updateMatrixWorld();
}
