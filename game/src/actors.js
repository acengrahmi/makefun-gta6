// Costa Verde — actors: cars (traffic, parked, stealable), pedestrians, people.
(function () {
  'use strict';
  const CV = (window.CV = window.CV || {});
  const A = { traffic: [], parked: [], peds: [] };
  CV.actors = A;

  const lam = (color, opts) => new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
  const CAR_COLORS = [0xd64541, 0x2e6fb7, 0xf2a541, 0xe8e3d8, 0x39a06b, 0x8e44ad, 0x22242c, 0xff8fab, 0x16a3a3, 0xf7d774];
  const KINDS = ['sedan', 'sedan', 'sport', 'pickup', 'van', 'convertible'];
  A.KIND_STATS = {
    sedan: { max: 28, accel: 13 }, sport: { max: 36, accel: 18 }, pickup: { max: 24, accel: 11 },
    van: { max: 22, accel: 10 }, convertible: { max: 30, accel: 14 },
  };

  function bx(parent, w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true;
    parent.add(m); return m;
  }

  A.makeCarMesh = (kind, color) => {
    const g = new THREE.Group();
    const paint = lam(color);
    const dark = lam(0x1c1e26);
    const glass = lam(0x2c3e50);
    bx(g, 1.9, 0.55, 4.4, paint, 0, 0.58, 0);                    // body
    bx(g, 1.94, 0.3, 1.1, paint, 0, 0.42, 1.85);                 // nose
    if (kind === 'pickup') {
      bx(g, 1.7, 0.5, 1.5, glass, 0, 1.05, 0.95);                // cab
      bx(g, 1.86, 0.42, 2.2, paint, 0, 0.72, -1.05);             // bed walls
      bx(g, 1.7, 0.1, 2.0, dark, 0, 0.55, -1.05);
    } else if (kind === 'van') {
      bx(g, 1.85, 1.05, 3.4, paint, 0, 1.05, -0.3);
      bx(g, 1.7, 0.45, 0.8, glass, 0, 0.95, 1.6);
    } else if (kind === 'convertible') {
      bx(g, 1.7, 0.34, 2.0, lam(0x7a2020), 0, 0.92, -0.25);      // open top interior
      bx(g, 1.7, 0.4, 0.5, glass, 0, 0.95, 1.15);                // windshield
    } else {
      bx(g, 1.68, 0.5, 2.1, glass, 0, 1.06, -0.15);              // cabin
      if (kind === 'sport') {
        bx(g, 1.8, 0.1, 0.5, dark, 0, 1.05, -2.05);              // spoiler
        bx(g, 0.12, 0.3, 0.3, dark, -0.7, 0.85, -2.0);
        bx(g, 0.12, 0.3, 0.3, dark, 0.7, 0.85, -2.0);
      }
    }
    const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 10);
    const wheels = [];
    for (const [wx, wz] of [[-0.88, 1.45], [0.88, 1.45], [-0.88, -1.45], [0.88, -1.45]]) {
      const w = new THREE.Mesh(wheelGeo, dark);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.37, wz);
      g.add(w); wheels.push(w);
    }
    const hl = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    bx(g, 0.34, 0.14, 0.06, hl, -0.6, 0.62, 2.41);
    bx(g, 0.34, 0.14, 0.06, hl, 0.6, 0.62, 2.41);
    const tl = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    bx(g, 0.34, 0.12, 0.06, tl, -0.6, 0.66, -2.21);
    bx(g, 0.34, 0.12, 0.06, tl, 0.6, 0.66, -2.21);
    g.userData.wheels = wheels;
    return g;
  };

  A.makePerson = (shirt, pants, skin) => {
    const g = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.2);
    const mkLimb = (geo, mat, x, y) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const m = new THREE.Mesh(geo, mat);
      m.position.y = -geo.parameters.height / 2;
      m.castShadow = true;
      pivot.add(m); g.add(pivot);
      return pivot;
    };
    const legL = mkLimb(legGeo, lam(pants), -0.14, 0.8);
    const legR = mkLimb(legGeo, lam(pants), 0.14, 0.8);
    const torso = bx(g, 0.56, 0.68, 0.3, lam(shirt), 0, 1.14, 0);
    torso.castShadow = true;
    const armGeo = new THREE.BoxGeometry(0.15, 0.66, 0.15);
    const armL = mkLimb(armGeo, lam(shirt), -0.37, 1.44);
    const armR = mkLimb(armGeo, lam(shirt), 0.37, 1.44);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), lam(skin));
    head.position.y = 1.72; head.castShadow = true;
    g.add(head);
    g.userData.parts = { legL, legR, armL, armR, head };
    return g;
  };

  const SHIRTS = [0xff6b5e, 0x4ecdc4, 0xf7f7f7, 0xffc93c, 0x7bd88f, 0xff8fab, 0x5e8cff, 0xf2a541];
  const PANTS = [0x2c3e50, 0x5a4632, 0x707a88, 0x30323a, 0x7a3b4f];
  const SKINS = [0xf2c79b, 0xc98d5e, 0x8a5a34, 0x6e4226, 0xffe0bd];

  A.spawn = (scene) => {
    const r = CV.rng(777);
    const streets = CV.WORLD.streets;
    // Traffic: 20 cars driving the grid.
    for (let i = 0; i < 20; i++) {
      const kind = KINDS[i % KINDS.length];
      const color = kind === 'sport' && i === 6 ? 0x14b8a6 : CAR_COLORS[i % CAR_COLORS.length];
      const mesh = A.makeCarMesh(kind, color);
      const alongX = r() < 0.5;
      const street = CV.pick(r, streets);
      const pos = CV.rand(r, -300, 300);
      const car = {
        mesh, kind, traffic: true, speed: CV.rand(r, 8.5, 12.5), angle: 0,
        axis: alongX ? 'x' : 'z', dir: r() < 0.5 ? 1 : -1, lane: 3.8,
        x: alongX ? pos : street + (r() < 0.5 ? 3.8 : -3.8),
        z: alongX ? street + (r() < 0.5 ? 3.8 : -3.8) : pos,
      };
      car.angle = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? Math.PI : 0);
      // Lane side must match travel direction: right-hand traffic.
      if (car.axis === 'x') car.z = street + (car.dir > 0 ? -3.8 : 3.8);
      else car.x = street + (car.dir > 0 ? 3.8 : -3.8);
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.angle;
      scene.add(mesh);
      A.traffic.push(car);
    }
    // Parked stealable cars.
    const spots = [
      [-108, 38], [-44, 96], [24, -52], [84, 148], [150, 12], [-160, -88], [196, 96],
      [-24, -148], [110, -108], [-88, 190], [238, 40], [60, 232],
    ];
    spots.forEach(([sx, sz], i) => {
      const kind = i === 3 ? 'sport' : KINDS[(i + 2) % KINDS.length];
      const color = i === 3 ? 0x14b8a6 : CAR_COLORS[(i + 3) % CAR_COLORS.length]; // a teal Comet GT waits at [84,148]
      const mesh = A.makeCarMesh(kind, color);
      const angle = (i % 4) * Math.PI / 2 + 0.06;
      mesh.position.set(sx, 0, sz);
      mesh.rotation.y = angle;
      scene.add(mesh);
      A.parked.push({ mesh, kind, angle, x: sx, z: sz, speed: 0, parked: true });
    });
    // Pedestrians: 44 strolling the sidewalks.
    for (let i = 0; i < 44; i++) {
      const mesh = A.makePerson(CV.pick(r, SHIRTS), CV.pick(r, PANTS), CV.pick(r, SKINS));
      const alongX = r() < 0.55;
      const street = CV.pick(r, streets);
      const off = (r() < 0.5 ? 10.6 : -10.6);
      const ped = {
        mesh, hp: 30, walker: true, phase: r() * 6.28,
        axis: alongX ? 'x' : 'z', dir: r() < 0.5 ? 1 : -1, speed: CV.rand(r, 1.1, 1.9),
        x: alongX ? CV.rand(r, -310, 310) : street + off,
        z: alongX ? street + off : CV.rand(r, -310, 310),
        flee: 0, down: false,
      };
      mesh.position.set(ped.x, 0, ped.z);
      scene.add(mesh);
      A.peds.push(ped);
    }
  };

  const animatePerson = (mesh, phase, run) => {
    const p = mesh.userData.parts;
    if (!p) return;
    const s = Math.sin(phase) * (run ? 0.75 : 0.5);
    p.legL.rotation.x = s; p.legR.rotation.x = -s;
    p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = s * 0.8;
  };
  A.animatePerson = animatePerson;

  A.update = (dt, t, S) => {
    const streets = CV.WORLD.streets;
    // --- traffic ------------------------------------------------------------
    for (const c of A.traffic) {
      const v = c.speed * dt * c.dir;
      if (c.axis === 'x') c.x += v; else c.z += v;
      // Turn at intersections sometimes.
      const cross = c.axis === 'x' ? c.z : c.x;
      for (const s of streets) {
        const along = c.axis === 'x' ? c.x : c.z;
        if (Math.abs(along - s) < 1.2 && Math.abs(cross - (c.axis === 'x' ? c.z : c.x)) >= 0) {
          // handled below by lane snap check
        }
        if (Math.abs(along - s) < 1.0 && ((c.turnCd || 0) <= 0) && Math.random() < 0.35) {
          const laneCoord = c.axis === 'x' ? c.z : c.x;
          const streetLine = Math.round((laneCoord - (c.dir > 0 ? (c.axis === 'x' ? -3.8 : 3.8) : (c.axis === 'x' ? 3.8 : -3.8))) / 1) ;
          void streetLine;
          c.axis = c.axis === 'x' ? 'z' : 'x';
          c.turnCd = 8;
          // Snap onto the crossed street with correct right-hand lane.
          if (c.axis === 'x') { c.z = s + (c.dir > 0 ? -3.8 : 3.8); c.x = Math.round(c.x); }
          else { c.x = s + (c.dir > 0 ? 3.8 : -3.8); c.z = Math.round(c.z); }
          if (Math.random() < 0.4) c.dir = -c.dir;
          break;
        }
      }
      c.turnCd = Math.max(0, (c.turnCd || 0) - dt);
      if (c.x > 330) c.x = -330; if (c.x < -330) c.x = 330;
      if (c.z > 330) c.z = -330; if (c.z < -330) c.z = 330;
      c.angle = c.axis === 'x' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? Math.PI : 0);
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.angle;
      const wr = c.speed * dt * 2.4;
      for (const w of c.mesh.userData.wheels) w.rotation.x += wr;
    }
    // --- pedestrians ----------------------------------------------------------
    for (const p of A.peds) {
      if (p.down) continue;
      let sp = p.speed;
      if (p.flee > 0 && S.lastShotAt > 0) {
        p.flee -= dt;
        const dx = p.x - S.lastShotX, dz = p.z - S.lastShotZ;
        const d = Math.hypot(dx, dz) || 1;
        p.x += (dx / d) * 3.4 * dt; p.z += (dz / d) * 3.4 * dt;
        p.mesh.rotation.y = Math.atan2(dx, dz);
        p.phase += dt * 11;
        animatePerson(p.mesh, p.phase, true);
        p.mesh.position.set(p.x, 0, p.z);
        continue;
      }
      if (p.axis === 'x') p.x += sp * dt * p.dir; else p.z += sp * dt * p.dir;
      if (p.x > 322) p.dir = -1; if (p.x < -322) p.dir = 1;
      if (p.z > 322) p.dir = -1; if (p.z < -322) p.dir = 1;
      // Occasionally swap axis at intersections.
      const along = p.axis === 'x' ? p.x : p.z;
      for (const s of streets) {
        if (Math.abs(along - s) < 0.8 && Math.random() < 0.012) { p.axis = p.axis === 'x' ? 'z' : 'x'; break; }
      }
      p.phase += dt * 6.4;
      p.mesh.rotation.y = p.axis === 'x' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? Math.PI : 0);
      animatePerson(p.mesh, p.phase, false);
      p.mesh.position.set(p.x, 0, p.z);
    }
  };
})();
