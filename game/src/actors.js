// Costa Verde — vehicles, pedestrians, the player character.
const CAR_COLORS = [0xe23b3b, 0x3b82e2, 0xf2c230, 0x39c26d, 0xf2762e, 0xe8e4da, 0x9b59d0, 0x2ec4c6, 0xff6b9d, 0x8a93a6];

CV.makeCarMesh = function (kind, color, police) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0xf4f4f6 : color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22242c });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd4e8 });
  let L = 4.4, Wd = 2.0, bodyH = 0.75, bodyY = 0.62;
  if (kind === 'comet') { L = 4.7; bodyH = 0.55; bodyY = 0.52; }
  if (kind === 'pickup') { L = 4.9; }
  if (kind === 'van') { L = 5.0; bodyH = 1.15; bodyY = 0.95; }
  const body = new THREE.Mesh(new THREE.BoxGeometry(Wd, bodyH, L), paint);
  body.position.y = bodyY; body.castShadow = true; g.add(body);
  if (kind === 'pickup') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.15, 0.75, 1.5), paint);
    cab.position.set(0, bodyY + 0.65, -L / 2 + 1.15); cab.castShadow = true; g.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.3, 0.5, 1.2), glass);
    win.position.set(0, bodyY + 0.68, -L / 2 + 1.15); g.add(win);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.2, 0.3, L - 2.1), dark);
    bed.position.set(0, bodyY + 0.28, 0.85); g.add(bed);
  } else if (kind === 'van') {
    const win = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.2, 0.55, 1.0), glass);
    win.position.set(0, bodyY + 0.35, -L / 2 + 0.8); g.add(win);
  } else {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.3, 0.55, L * 0.48), kind === 'comet' ? paint : glass);
    cab.position.set(0, bodyY + bodyH / 2 + 0.22, kind === 'comet' ? 0.25 : -0.1); cab.castShadow = true; g.add(cab);
    if (kind === 'comet') {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.1, 0.12, 0.5), dark);
      spoiler.position.set(0, bodyY + 0.55, L / 2 - 0.3); g.add(spoiler);
    }
    if (kind === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
      sign.position.set(0, bodyY + bodyH / 2 + 0.62, -0.1); g.add(sign);
    }
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.5), dark);
    bar.position.set(0, bodyY + bodyH / 2 + 0.55, -0.1); g.add(bar);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    bl.position.set(-0.4, bodyY + bodyH / 2 + 0.56, -0.1); g.add(bl); g.userData.lightL = bl;
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    br.position.set(0.4, bodyY + bodyH / 2 + 0.56, -0.1); g.add(br); g.userData.lightR = br;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(Wd + 0.04, 0.3, L - 0.6), dark);
    stripe.position.y = bodyY; g.add(stripe);
  }
  const wheelG = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheels = [];
  for (const [wx, wz] of [[-Wd / 2, -L / 2 + 0.85], [Wd / 2, -L / 2 + 0.85], [-Wd / 2, L / 2 - 0.85], [Wd / 2, L / 2 - 0.85]]) {
    const w = new THREE.Mesh(wheelG, dark);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.42, wz); g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  const hl = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.3, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  hl.position.set(0, 0.68, -L / 2 - 0.03); g.add(hl);
  return g;
};

CV.makeCar = function (kind, color, x, z, heading, police) {
  const mesh = CV.makeCarMesh(kind, color, police);
  mesh.position.set(x, 0, z); mesh.rotation.y = heading;
  return { mesh, kind, x, z, heading, speed: 0, police: !!police, dead: false };
};
CV.syncCar = function (car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * 0.12;
  for (const w of car.mesh.userData.wheels || []) w.rotation.x += spin;
  if (car.police) {
    const on = Math.sin(performance.now() * 0.02) > 0;
    if (car.mesh.userData.lightL) car.mesh.userData.lightL.material.color.setHex(on ? 0xff2a2a : 0x551111);
    if (car.mesh.userData.lightR) car.mesh.userData.lightR.material.color.setHex(on ? 0x113377 : 0x2a6bff);
  }
};

// ---- traffic: cars loop the grid roads, wrapping at the edges
CV.traffic = [];
CV.buildTraffic = function (scene) {
  const kinds = ['sedan', 'taxi', 'pickup', 'van', 'sedan', 'comet'];
  for (let i = 0; i < 16; i++) {
    const axisX = i % 2 === 0; // travel along X on a z-road, or along Z on an x-road
    const line = CV.roadLine(i % 8) + (i % 3 === 0 ? 3.2 : -3.2);
    const pos = CV.rand(-185, 185), dir = i % 4 < 2 ? 1 : -1;
    const car = CV.makeCar(kinds[i % kinds.length], CV.pick(CAR_COLORS), axisX ? pos : line, axisX ? line : pos, 0, false);
    car.axisX = axisX; car.line = line; car.dir = dir; car.cruise = CV.rand(9, 14);
    car.heading = axisX ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? Math.PI : 0);
    if (axisX) car.x = pos; else car.z = pos;
    scene.add(car.mesh); CV.traffic.push(car);
  }
  // parked stealable cars at road edges
  CV.parked = [];
  const spots = [[-66, 30], [22, -60], [110, 74], [-154, -102], [66, 162], [154, -30], [-22, 118], [30, -154]];
  const pk = ['sedan', 'pickup', 'sedan', 'van', 'sedan', 'pickup', 'sedan', 'taxi'];
  spots.forEach(([x, z], i) => {
    const car = CV.makeCar(pk[i], CV.pick(CAR_COLORS), x, z, i % 2 ? 0 : Math.PI / 2, false);
    scene.add(car.mesh); CV.parked.push(car);
  });
};
CV.updateTraffic = function (dt) {
  for (const car of CV.traffic) {
    let target = car.cruise;
    for (const o of CV.traffic) {
      if (o === car || o.axisX !== car.axisX || Math.abs(o.line - car.line) > 1) continue;
      const ahead = car.axisX ? (o.x - car.x) * car.dir : (o.z - car.z) * car.dir;
      if (ahead > 0 && ahead < 10) target = Math.min(target, o.speed);
    }
    car.speed = CV.lerp(car.speed || 0, target, dt * 2);
    if (car.axisX) car.x += car.dir * car.speed * dt; else car.z += car.dir * car.speed * dt;
    if (car.x > 200) car.x = -200; if (car.x < -200) car.x = 200;
    if (car.z > 200) car.z = -200; if (car.z < -200) car.z = 200;
    CV.syncCar(car);
  }
};

// ---- people
CV.makePerson = function (shirt, pants, skin, gold) {
  const g = new THREE.Group();
  const skinM = new THREE.MeshLambertMaterial({ color: skin });
  const shirtM = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsM = new THREE.MeshLambertMaterial({ color: pants });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.26), pantsM); legL.position.set(-0.16, 0.4, 0);
  const legR = legL.clone(); legR.position.x = 0.16;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), shirtM); torso.position.y = 1.22; torso.castShadow = true;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), shirtM); armL.position.set(-0.47, 1.2, 0);
  const armR = armL.clone(); armR.position.x = 0.47;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.42), skinM); head.position.y = 1.88;
  if (gold) { const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd94d })); cap.position.y = 2.14; g.add(cap); }
  g.add(legL, legR, torso, armL, armR, head);
  g.userData.parts = { legL, legR, armL, armR };
  return g;
};
CV.animPerson = function (mesh, phase, moving) {
  const p = mesh.userData.parts; if (!p) return;
  const s = moving ? Math.sin(phase) * 0.55 : 0;
  p.legL.rotation.x = s; p.legR.rotation.x = -s; p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = s * 0.8;
};
const SKINS = [0xf2c79b, 0xc68863, 0x8d5524, 0xffdbac];
const SHIRTS = [0x3b82e2, 0xe23b3b, 0xf2f2f2, 0x39c26d, 0xf2762e, 0x9b59d0, 0x2ec4c6, 0xff6b9d];
CV.peds = [];
CV.buildPeds = function (scene) {
  for (let i = 0; i < 38; i++) {
    const beach = i >= 30;
    const mesh = CV.makePerson(CV.pick(SHIRTS), CV.pick([0x33415c, 0x5c4a33, 0x22242c, 0xe8e4da]), CV.pick(SKINS), false);
    const p = {
      mesh, beach,
      x: beach ? CV.rand(-232, -216) : CV.rand(-185, 185),
      z: CV.rand(-190, 190), heading: CV.rand(0, 6.28), speed: CV.rand(1.1, 2.0),
      tx: 0, tz: 0, phase: CV.rand(0, 6),
    };
    p.tx = p.x; p.tz = p.z;
    mesh.position.set(p.x, 0, p.z);
    scene.add(mesh); CV.peds.push(p);
  }
};
CV.updatePeds = function (dt) {
  for (const p of CV.peds) {
    if (CV.dist(p.x, p.z, p.tx, p.tz) < 1.5) {
      if (p.beach) { p.tx = CV.rand(-234, -215); p.tz = CV.clamp(p.z + CV.rand(-70, 70), -195, 195); }
      else { p.tx = CV.clamp(p.x + CV.rand(-80, 80), -190, 190); p.tz = CV.clamp(p.z + CV.rand(-80, 80), -195, 195); }
    }
    const want = Math.atan2(p.tx - p.x, p.tz - p.z);
    p.heading = CV.angLerp(p.heading, want, dt * 4);
    let nx = p.x + Math.sin(p.heading) * p.speed * dt, nz = p.z + Math.cos(p.heading) * p.speed * dt;
    if (!p.beach) [nx, nz] = CV.collideCircle(nx, nz, 0.5);
    p.x = nx; p.z = nz; p.phase += dt * 7;
    p.mesh.position.set(p.x, 0, p.z); p.mesh.rotation.y = p.heading;
    CV.animPerson(p.mesh, p.phase, true);
  }
};
