// Costa Verde — police, helicopter, combat, and the seven-job story engine.
CV.JOBS = [
  { name: 'WELCOME TO COSTA VERDE', giver: 'Lena Cruz', pay: 400,
    intro: [["Lena Cruz", "Rico Santana. Heard you drive like the devil owes you money."], ["Lena Cruz", "Simple first run: grab the package across town, drop it at the east docks. Don't dent it."]],
    radio: ["Lena (radio): Clock's ticking, Rico.", "Lena (radio): That's the spot. Easy money."],
    outro: "Lena: Clean. Very clean. I may have more work for you.",
    steps: [ { t: 'meet', x: -110, z: -110 }, { t: 'pickup', x: 110, z: -22 }, { t: 'deliver', x: 154, z: 110 } ] },
  { name: 'HOT PROPERTY', giver: 'Sal Bianchi', pay: 800,
    intro: [["Sal Bianchi", "A Comet GT, cherry red, parked by the north market. Owner's behind on payments."], ["Sal Bianchi", "Bring her to my garage. Gently, Rico. GENTLY."]],
    radio: ["Sal (radio): She's the red one. Keys in the visor, probably.", "Sal (radio): Roll her in, paisan."],
    outro: "Sal: Ha! Showroom condition. You're wasted on deliveries.",
    steps: [ { t: 'meet', x: -44, z: -110 }, { t: 'steal', x: 66, z: 154 }, { t: 'deliver', x: -44, z: -110 } ] },
  { name: 'MARINA RUN', giver: 'Mateo Reyes', pay: 1100,
    intro: [["Mateo Reyes", "Name's Mateo Reyes. I run boats, and tonight one crate runs by land."], ["Mateo Reyes", "It's waiting at the far pier. If the harbour patrol wakes up — you were never here."]],
    radio: ["Mateo (radio): Patrol boat just lit up. Move, amigo.", "Mateo (radio): Sal's garage. He knows the crate."],
    outro: "Mateo: Smooth as glass water. The sea provides, eh?",
    steps: [ { t: 'meet', x: -222, z: -40 }, { t: 'pickup', x: -252, z: 60, heat: 2 }, { t: 'deliver', x: -44, z: -110 } ] },
  { name: 'PAYBACK TIME', giver: 'Lena Cruz', pay: 1500,
    intro: [["Lena Cruz", "The Vipers hit one of my couriers. Five of them, squatting by the east warehouse."], ["Lena Cruz", "Send a message, Rico. Loud one."]],
    radio: ["Lena (radio): Warehouse yard, east side. All five."],
    outro: "Lena: Message received, apparently. You're earning a reputation.",
    steps: [ { t: 'meet', x: -110, z: -110 }, { t: 'fight', x: 110, z: 132, count: 5 } ] },
  { name: 'THE INFORMANT', giver: 'Officer Dana Ruiz', pay: 1800,
    intro: [["Officer Dana Ruiz", "Keep your voice down. I'm Dana — badge by day, and tonight, your guardian angel."], ["Officer Dana Ruiz", "Pick up the evidence bag at the hospital. My colleagues will chase you. Let them. It sells the story."]],
    radio: ["Dana (radio): Bag's by the hospital doors. Go.", "Dana (radio): Warehouse drop. Lose the tail if you can — or don't."],
    outro: "Dana: Perfect theatre, Rico. The Vipers just took the blame.",
    steps: [ { t: 'meet', x: -88, z: 22 }, { t: 'pickup', x: -66, z: 44, heat: 3 }, { t: 'deliver', x: 110, z: 132 } ] },
  { name: 'THE BIG SCORE', giver: 'Sal Bianchi', pay: 2500,
    intro: [["Sal Bianchi", "The big one, Rico. A package in the far north-west, the Sunset Club needs it before the song ends."], ["Sal Bianchi", "Every cop in the city will smell it. Drive like the sunset's chasing YOU."]],
    radio: ["Sal (radio): Package is hot — the whole city knows.", "Sal (radio): Club door, east side. FAST."],
    outro: "Sal: LEGEND. Drinks at the club are on me forever.",
    steps: [ { t: 'meet', x: -44, z: -110 }, { t: 'pickup', x: -154, z: 154, heat: 4 }, { t: 'deliver', x: 176, z: -154, timer: 150 } ] },
  { name: 'SUNSET SHOWDOWN', giver: 'Lena Cruz', pay: 4000,
    intro: [["Lena Cruz", "Last job, Rico. The Vipers' war chest sits in their warehouse — guarded by six."], ["Lena Cruz", "Take it, then run to Mateo at the marina. Five stars, helicopters, everything. Become a ghost."]],
    radio: ["Lena (radio): Six guns at the warehouse. End it.", "Lena (radio): The marina, Rico! Mateo's boat is waiting!"],
    outro: "Lena: You did it. Costa Verde is yours now, Rico Santana.",
    steps: [ { t: 'meet', x: -110, z: -110 }, { t: 'fight', x: 110, z: 132, count: 6 }, { t: 'escape', x: -222, z: -40, heat: 5 } ] },
];

CV.systems = {
  cruisers: [], footCops: [], helis: [], gangers: [], spawnCd: 0,
  init(scene) {
    this.scene = scene;
    // mission marker: gold ring + beacon column
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.7, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 70, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
    beam.position.y = 35;
    this.marker = new THREE.Group(); this.marker.add(ring); this.marker.add(beam);
    this.marker.visible = false; scene.add(this.marker);
  },
  // ---------- helicopter ----------
  makeHeli() {
    const g = new THREE.Group();
    const bodyM = new THREE.MeshLambertMaterial({ color: 0x23262e });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.0, 5.6), bodyM); body.castShadow = true; g.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.25, 10, 8), new THREE.MeshLambertMaterial({ color: 0x9fd4e8 }));
    nose.position.set(0, -0.1, -2.9); nose.scale.set(1, 0.8, 0.8); g.add(nose);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 4.6), bodyM); tail.position.set(0, 0.3, 4.8); g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 0.9), bodyM); fin.position.set(0, 0.7, 6.9); g.add(fin);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.09, 0.55), new THREE.MeshBasicMaterial({ color: 0x14151a }));
    rotor.position.y = 1.35; g.add(rotor); g.userData.rotor = rotor;
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.0, 0.4), new THREE.MeshBasicMaterial({ color: 0x14151a }));
    tailRotor.position.set(0.35, 0.7, 6.9); g.add(tailRotor); g.userData.tailRotor = tailRotor;
    const skidM = new THREE.MeshLambertMaterial({ color: 0x555a66 });
    for (const sx of [-1.15, 1.15]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 4.4), skidM);
      skid.position.set(sx, -1.5, 0); g.add(skid);
    }
    const bcnR = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    bcnR.position.set(0, 0.5, 7.0); g.add(bcnR); g.userData.bcnR = bcnR;
    const bcnB = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    bcnB.position.set(0, -1.1, -2.2); g.add(bcnB); g.userData.bcnB = bcnB;
    // searchlight: cone + spotlight + ground pool
    const cone = new THREE.Mesh(new THREE.ConeGeometry(6.5, 30, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.y = -16; g.add(cone);
    const spot = new THREE.SpotLight(0xffe0b0, 1.6, 110, 0.34, 0.65, 0.6);
    g.add(spot); g.add(spot.target); g.userData.spot = spot;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(6.2, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.20, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; this.scene.add(pool); g.userData.pool = pool;
    g.visible = false; this.scene.add(g);
    return { mesh: g, x: 0, z: 0, active: false };
  },
  // ---------- spawning ----------
  spawnCruiser(G) {
    const a = CV.rand(0, Math.PI * 2), d = CV.rand(85, 115);
    let x = CV.clamp(G.px + Math.cos(a) * d, -195, 195), z = CV.clamp(G.pz + Math.sin(a) * d, -195, 195);
    if (CV.insideCollider(x, z)) { x = CV.roadLine(CV.randi(0, 7)); z = CV.clamp(G.pz, -190, 190); }
    const car = CV.makeCar('sedan', 0xf4f4f6, x, z, 0, true);
    this.scene.add(car.mesh); this.cruisers.push(car);
  },
  spawnFootCop(G) {
    const a = CV.rand(0, Math.PI * 2);
    const mesh = CV.makePerson(0x1d2f57, 0x141a2c, CV.pick([0xf2c79b, 0xc68863, 0x8d5524]), false);
    const cop = { mesh, x: G.px + Math.cos(a) * 38, z: G.pz + Math.sin(a) * 38, heading: 0, phase: CV.rand(0, 6) };
    mesh.position.set(cop.x, 0, cop.z); this.scene.add(mesh); this.footCops.push(cop);
  },
  resetHeat(G) {
    for (const c of this.cruisers) this.scene.remove(c.mesh);
    for (const c of this.footCops) this.scene.remove(c.mesh);
    this.cruisers = []; this.footCops = [];
    for (const h of this.helis) { h.active = false; h.mesh.visible = false; if (h.mesh.userData.pool) h.mesh.userData.pool.visible = false; }
    G.wanted = 0; G.bustedMeter = 0; G.seenT = 0;
  },
  // ---------- combat ----------
  shoot(G, ox, oz, dirx, dirz) {
    CV.audio.shot();
    let best = null, bestD = 70;
    const consider = (npc, isGanger) => {
      const dx = npc.x - ox, dz = npc.z - oz, along = dx * dirx + dz * dirz;
      if (along < 0.4 || along > 70) return;
      const perp = Math.abs(dx * dirz - dz * dirx);
      if (perp < 1.3 && along < bestD) { best = npc; bestD = along; best._ganger = isGanger; }
    };
    for (const gn of this.gangers) if (!gn.downed) consider(gn, true);
    for (const p of CV.peds) if (!p.downed) consider(p, false);
    if (best) {
      best.health = (best.health == null ? 100 : best.health) - 60;
      if (best.health <= 0 && !best.downed) {
        best.downed = true;
        best.mesh.rotation.x = -Math.PI / 2; best.mesh.position.y = 0.25;
        if (!best._ganger) { G.cash = Math.max(0, G.cash - 0); CV.raiseWanted(G, 1); }
      }
      if (best._ganger) CV.raiseWanted(G, Math.max(1, G.wanted));
      return true;
    }
    return false;
  },
};
CV.raiseWanted = function (G, n) { G.wanted = CV.clamp(Math.max(G.wanted, n), 0, 5); G.seenT = 0; };

// ---------- mission engine ----------
CV.mission = {
  active: false, idx: -1, step: 0, giverMesh: null, car: null, timer: -1, radioT: 0,
  start(i, G) {
    const job = CV.JOBS[i]; if (!job) return;
    this.active = true; this.idx = i; this.step = 0; this.timer = -1; this.radioT = 0;
    G.dialogue = job.intro.map(([speaker, text]) => ({ speaker, text }));
    G.dialogueT = 0;
    this.placeStep(G);
    CV.hudBanner(G, 'JOB ' + (i + 1) + '/7 · ' + job.name, job.giver + ' has work for you');
  },
  placeStep(G) {
    const job = CV.JOBS[this.idx], st = job.steps[this.step];
    const S = CV.systems;
    S.marker.visible = true; S.marker.position.set(st.x, 0.6, st.z);
    // giver NPC waits at every meet marker
    if (this.giverMesh) { S.scene.remove(this.giverMesh); this.giverMesh = null; }
    if (st.t === 'meet') {
      this.giverMesh = CV.makePerson(0xffd94d, 0x33415c, 0xc68863, true);
      this.giverMesh.position.set(st.x + 2.2, 0, st.z + 1.2);
      S.scene.add(this.giverMesh);
    }
    if (st.t === 'steal' && !this.car) {
      this.car = CV.makeCar('comet', 0xe23b3b, st.x, st.z, Math.PI / 2, false);
      S.scene.add(this.car.mesh);
    }
    if (st.t === 'fight') {
      for (let k = 0; k < st.count; k++) {
        const a = k / st.count * Math.PI * 2;
        const mesh = CV.makePerson(0xb02020, 0x22242c, CV.pick([0xf2c79b, 0xc68863, 0x8d5524]), false);
        const gn = { mesh, x: st.x + Math.cos(a) * 8, z: st.z + Math.sin(a) * 8, health: 100, downed: false, shootCd: CV.rand(0.8, 2), phase: CV.rand(0, 6), heading: 0 };
        mesh.position.set(gn.x, 0, gn.z); S.scene.add(mesh); S.gangers.push(gn);
      }
    }
    this.timer = st.timer || -1;
  },
  completeStep(G) {
    const job = CV.JOBS[this.idx], st = job.steps[this.step];
    if (st.heat) CV.raiseWanted(G, st.heat);
    const radio = job.radio[this.step - 1] || job.radio[job.radio.length - 1];
    if (this.step > 0 && radio) { G.radioText = radio; G.radioT = 4; }
    if (st.t === 'steal' && this.car) { CV.parked.push(this.car); this.car = null; } // stays parked & enterable for the drive back
    this.step++;
    if (this.step >= job.steps.length) { this.finish(G); return; }
    this.placeStep(G);
  },
  finish(G) {
    const job = CV.JOBS[this.idx];
    G.cash += job.pay; CV.audio.cash();
    G.jobIndex = Math.min(7, this.idx + 1);
    CV.hudBanner(G, 'JOB COMPLETE — $' + job.pay.toLocaleString(), job.outro);
    this.active = false; this.idx = -1;
    CV.systems.marker.visible = false;
    if (this.giverMesh) { CV.systems.scene.remove(this.giverMesh); this.giverMesh = null; }
    CV.save.data.cash = G.cash; CV.save.data.jobIndex = G.jobIndex; CV.save.store();
  },
  update(dt, G) {
    if (!this.active) return;
    const job = CV.JOBS[this.idx], st = job.steps[this.step];
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { CV.hudBanner(G, 'TOO SLOW', 'The trail went cold — the clock restarts.'); this.timer = st.timer; }
    }
    if (st.t === 'fight') {
      if (CV.systems.gangers.every(gn => gn.downed)) { CV.systems.gangers = []; this.completeStep(G); }
      return;
    }
    const d = CV.dist(G.px, G.pz, st.x, st.z);
    if (d < 4.2) this.completeStep(G);
  },
};

// ---------- per-frame systems update ----------
CV.systems.update = function (dt, G) {
  const S = this;
  if (S.helis.length === 0) { S.helis.push(S.makeHeli(), S.makeHeli()); }
  // cruisers
  const wantCruisers = G.busted ? 0 : Math.min(4, G.wanted);
  S.spawnCd -= dt;
  if (S.cruisers.length < wantCruisers && S.spawnCd <= 0) { S.spawnCruiser(G); S.spawnCd = 1.2; }
  let seen = false, nearCop = false;
  for (let i = S.cruisers.length - 1; i >= 0; i--) {
    const c = S.cruisers[i], d = CV.dist(c.x, c.z, G.px, G.pz);
    if (d > 210) { S.scene.remove(c.mesh); S.cruisers.splice(i, 1); continue; }
    if (d < 60) seen = true;
    if (d < 4.6) nearCop = true;
    const want = Math.atan2(G.px - c.x, G.pz - c.z);
    c.heading = CV.angLerp(c.heading, want, dt * 2.2);
    const top = G.inCar ? 25 : 13;
    c.speed = CV.lerp(c.speed, d > 7 ? top : top * 0.35, dt * 1.6);
    let nx = c.x + Math.sin(c.heading) * c.speed * dt, nz = c.z + Math.cos(c.heading) * c.speed * dt;
    [nx, nz] = CV.collideCircle(nx, nz, 1.7); c.x = nx; c.z = nz;
    if (G.inCar && d < 3.4) G.car.speed *= (1 - dt * 2.5);
    CV.syncCar(c);
  }
  // foot cops (only chase an on-foot player)
  const wantCops = (!G.inCar && G.wanted >= 2 && !G.busted) ? 2 : 0;
  if (S.footCops.length < wantCops && S.spawnCd <= 0) { S.spawnFootCop(G); S.spawnCd = 1.5; }
  for (let i = S.footCops.length - 1; i >= 0; i--) {
    const c = S.footCops[i], d = CV.dist(c.x, c.z, G.px, G.pz);
    if (d > 120 || wantCops === 0) { S.scene.remove(c.mesh); S.footCops.splice(i, 1); continue; }
    if (d < 32) seen = true;
    if (d < 3.6) nearCop = true;
    const want = Math.atan2(G.px - c.x, G.pz - c.z);
    c.heading = CV.angLerp(c.heading, want, dt * 5);
    if (d > 2.6) { c.x += Math.sin(c.heading) * 5.4 * dt; c.z += Math.cos(c.heading) * 5.4 * dt; }
    c.phase += dt * 9;
    c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.heading;
    CV.animPerson(c.mesh, c.phase, true);
  }
  // helicopters
  const wantHelis = G.busted ? 0 : (G.wanted >= 5 ? 2 : G.wanted >= 3 ? 1 : 0);
  S.helis.forEach((h, hi) => {
    const on = hi < wantHelis;
    if (on && !h.active) { h.x = G.px + 40; h.z = G.pz + 40; }
    h.active = on; h.mesh.visible = on;
    if (h.mesh.userData.pool) h.mesh.userData.pool.visible = on;
    if (!on) return;
    seen = true;
    const dirx = Math.sin(G.heading), dirz = Math.cos(G.heading);
    const side = hi === 0 ? 7 : -9;
    const tx = G.px + dirx * 20 - dirz * side, tz = G.pz + dirz * 20 + dirx * side;
    h.x = CV.lerp(h.x, tx, dt * 1.7); h.z = CV.lerp(h.z, tz, dt * 1.7);
    h.mesh.position.set(h.x, 15 + Math.sin(performance.now() * 0.0016 + hi * 2) * 0.8, h.z);
    h.mesh.rotation.y = Math.atan2(G.px - h.x, G.pz - h.z);
    h.mesh.userData.rotor.rotation.y += dt * 28;
    h.mesh.userData.tailRotor.rotation.x += dt * 30;
    const flash = Math.sin(performance.now() * 0.014) > 0;
    h.mesh.userData.bcnR.material.color.setHex(flash ? 0xff2a2a : 0x440d0d);
    h.mesh.userData.bcnB.material.color.setHex(flash ? 0x0d1e44 : 0x2a6bff);
    const spot = h.mesh.userData.spot;
    spot.target.position.set(G.px - h.x, -15, G.pz - h.z);
    const pool = h.mesh.userData.pool;
    pool.position.set(G.px, 0.35, G.pz);
    if (CV.dist(h.x, h.z, G.px, G.pz) < 5) nearCop = true;
  });
  // gangers shoot back + shuffle toward the player
  for (const gn of S.gangers) {
    if (gn.downed) continue;
    const d = CV.dist(gn.x, gn.z, G.px, G.pz);
    gn.heading = Math.atan2(G.px - gn.x, G.pz - gn.z);
    gn.mesh.rotation.y = gn.heading;
    if (d > 16) { gn.x += Math.sin(gn.heading) * 2.6 * dt; gn.z += Math.cos(gn.heading) * 2.6 * dt; gn.phase += dt * 8; CV.animPerson(gn.mesh, gn.phase, true); gn.mesh.position.set(gn.x, 0, gn.z); }
    gn.shootCd -= dt;
    if (gn.shootCd <= 0 && d < 38 && !G.busted) {
      gn.shootCd = CV.rand(1.1, 1.9);
      G.health -= CV.rand(3, 8); G.hurtT = 0.35;
      CV.audio.shot();
    }
  }
  // wanted bookkeeping: seen resets the decay clock; busted meter
  const pSpeed = G.inCar ? Math.abs(G.car.speed) : G.moveSpeed;
  if (seen) G.seenT = 0; else G.seenT += dt;
  if (G.wanted > 0 && G.seenT > 9) { G.wanted--; G.seenT = 0; }
  if (nearCop && pSpeed < 3.2 && G.wanted > 0 && !G.busted) G.bustedMeter += dt / 2.4;
  else G.bustedMeter = Math.max(0, G.bustedMeter - dt * 0.7);
  if (G.bustedMeter >= 1 && !G.busted) { G.busted = true; G.bustedT = 0; }
};
