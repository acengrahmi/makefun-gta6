// Costa Verde — systems: story jobs, wanted/police/helicopter, combat,
// street race, taxi fares, markers and dialogue data.
(function () {
  'use strict';
  const CV = (window.CV = window.CV || {});
  const SYS = {};
  CV.systems = SYS;

  const lam = (color, opts) => new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
  const GOLD = 0xffc93c;

  // ------------------------------------------------------------------ jobs
  SYS.JOBS = [
    {
      name: 'WELCOME TO COSTA VERDE', giver: 'Lena Cruz', gx: 150, gz: 44, pay: 400,
      intro: ['Rico Santana. Word travels fast — I hear you drive like the devil owes you money.', 'Take this package across town. No questions, no scratches. Welcome to Costa Verde.'],
      radio: 'LENA (radio): Package is hot in ten. Move.',
      steps: [
        { t: 'goto', x: -120, z: -60, label: 'Pick up the package', r: 10 },
        { t: 'goto', x: 60, z: 120, label: 'Deliver it to the Palm Court', r: 10 },
      ],
      outro: 'Clean run. The city is already talking about you.',
    },
    {
      name: 'HOT PROPERTY', giver: 'Sal Bianchi', gx: -246, gz: -60, pay: 800,
      intro: ['Sal Bianchi. I run the garage, I run the docks, I run my mouth — in that order.', 'A teal Comet GT sits pretty by the boardwalk. She should sit pretty in MY warehouse instead.'],
      radio: 'SAL (radio): Keys are in it. Some people are careless.',
      steps: [
        { t: 'steal', x: -230, z: -86, label: 'Steal the teal Comet GT', r: 12 },
        { t: 'goto', x: 236, z: -100, label: 'Deliver the Comet to the warehouse', r: 12 },
      ],
      outro: 'Beautiful. She purrs like a kitten with a secret.',
    },
    {
      name: 'MARINA RUN', giver: 'Mateo Reyes', gx: -300, gz: 30, pay: 1100,
      intro: ["Mateo Reyes, captain of the 'Second Chance'. My cargo waits at the far pier.", 'If the harbour patrol wakes up — you were never here.'],
      radio: 'MATEO (radio): Tide turns in twenty. So should you.',
      steps: [
        { t: 'goto', x: -378, z: 30, label: 'Collect the cargo at the far pier', r: 9, heat: 2 },
        { t: 'goto', x: -250, z: 96, label: 'Bring the cargo to the boat shed', r: 10 },
      ],
      outro: 'The sea keeps secrets. So do we.',
    },
    {
      name: 'PAYBACK TIME', giver: 'Lena Cruz', gx: 150, gz: 44, pay: 1500,
      intro: ['The Vipers hit one of my couriers at the east warehouse. Five of them. All armed.', 'Send a message they can read from the hospital.'],
      radio: 'LENA (radio): Warehouse yard. Make it loud.',
      steps: [
        { t: 'fight', x: 232, z: -60, count: 5, label: 'Take down the Vipers at the warehouse', r: 26 },
      ],
      outro: 'Message delivered. The Vipers will limp for a month.',
    },
    {
      name: 'THE INFORMANT', giver: 'Officer Dana Ruiz', gx: 52, gz: -122, pay: 1800,
      intro: ['Officer Dana Ruiz. Off the record: my informant knows who runs the docks — and the Vipers know his face.', 'Pick him up at Palm Shores and bring him to me. Quietly, if you can. Loudly, if you must.'],
      radio: 'DANA (radio): No sirens. I was never here either.',
      steps: [
        { t: 'goto', x: -180, z: 120, label: 'Pick up the informant', r: 10, heat: 3 },
        { t: 'goto', x: 52, z: -122, label: 'Bring him to Officer Ruiz', r: 11 },
      ],
      outro: 'He talks, the docks fall. You did the city a favour, Rico.',
    },
    {
      name: 'THE BIG SCORE', giver: 'Sal Bianchi', gx: -246, gz: -60, pay: 2500,
      intro: ['One envelope, Sal-to-Santana, cross-city in two and a half minutes. Every badge in town will smell it.', 'Drive it like the sunset is chasing YOU.'],
      radio: 'SAL (radio): Clock is running. So are they.',
      steps: [
        { t: 'deliver', x: 236, z: 180, label: 'Deliver the package — FAST', r: 12, time: 150, heat: 4 },
      ],
      outro: 'Two minutes of legend. Drinks are on me.',
    },
    {
      name: 'SUNSET SHOWDOWN', giver: 'Mateo Reyes', gx: -300, gz: 30, pay: 4000,
      intro: ['The Vipers stole my war chest and hold my marina like a fortress. Six guns between you and it.', 'Take it back, then run the sunset to my pier. Every cop in the city will light up — let them watch.'],
      radio: 'MATEO (radio): The chest is yours if the sea says so.',
      steps: [
        { t: 'fight', x: -272, z: 120, count: 6, label: 'Take back the war chest at the marina', r: 26 },
        { t: 'escape', x: -378, z: 30, label: 'Escape to the far pier', r: 10, heat: 5 },
      ],
      outro: 'The chest, the sunset, the city. All yours, Rico Santana.',
    },
  ];

  // ------------------------------------------------------------------ state helpers
  SYS.newState = () => ({
    started: false, paused: false, time: 0,
    cash: 0, health: 100, wanted: 0, unseenT: 0, bustT: 0,
    lastShotAt: -99, lastShotX: 0, lastShotZ: 0, copNear: false,
    job: null, dialogue: null, banner: null, radio: null,
    enemies: [], cops: [], cruisers: [], helis: [],
    race: { active: false, cp: -1, time: 0, cd: 0 },
    taxi: { state: 'idle', ped: null, dx: 0, dz: 0, t: 25 },
    saveT: 0,
  });

  SYS.addWanted = (S, n) => { S.wanted = Math.max(S.wanted, Math.min(5, n)); };

  // ------------------------------------------------------------------ markers
  let marker = null, markerMat = null;
  SYS.setMarker = (scene, x, z, color) => {
    if (!marker) {
      markerMat = new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      marker = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true), markerMat);
      beam.position.y = 13;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.22, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffc93c }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.4;
      marker.add(beam); marker.add(ring);
      marker.userData.ring = ring;
      scene.add(marker);
    }
    markerMat.color.setHex(color || 0xffc93c);
    marker.visible = true;
    marker.position.set(x, 0, z);
  };
  SYS.hideMarker = () => { if (marker) marker.visible = false; };

  // ------------------------------------------------------------------ people of the story
  SYS.spawnGivers = (scene, S) => {
    S.givers = [];
    const spots = new Map();
    for (const j of SYS.JOBS) {
      const key = j.giver + '@' + j.gx + ',' + j.gz;
      if (spots.has(key)) continue;
      spots.set(key, true);
      const mesh = CV.actors.makePerson(GOLD, 0x30323a, 0xc98d5e);
      mesh.position.set(j.gx, 0, j.gz);
      mesh.rotation.y = Math.PI / 2;
      scene.add(mesh);
      // Floating name label.
      const tex = CV.canvasTexture(256, 56, (g, w, h) => {
        g.fillStyle = 'rgba(20,10,30,0.72)'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffd76a'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(j.giver.toUpperCase(), w / 2, h / 2 + 1);
      });
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      spr.scale.set(7.5, 1.65, 1);
      spr.position.set(j.gx, 2.9, j.gz);
      scene.add(spr);
      S.givers.push({ name: j.giver, mesh, x: j.gx, z: j.gz });
    }
  };

  SYS.openDialogue = (S, name, lines, onDone) => {
    S.dialogue = { name, lines, i: 0, onDone: onDone || null };
  };
  SYS.advanceDialogue = (S) => {
    if (!S.dialogue) return;
    S.dialogue.i++;
    CV.audio.blip(660, 0.07, 0.1);
    if (S.dialogue.i >= S.dialogue.lines.length) {
      const cb = S.dialogue.onDone;
      S.dialogue = null;
      if (cb) cb();
    }
  };

  // ------------------------------------------------------------------ jobs engine
  SYS.startJob = (scene, S, idx) => {
    const def = SYS.JOBS[idx];
    if (!def) return false;
    S.job = { def, idx, step: 0, stepT: 0, spawned: false };
    SYS.openDialogue(S, def.giver, def.intro, () => {
      S.radio = def.radio;
      SYS.beginStep(scene, S);
    });
    return true;
  };

  SYS.beginStep = (scene, S) => {
    const st = S.job.def.steps[S.job.step];
    S.job.stepT = st.time || 0;
    S.job.spawned = false;
    if (st.heat) SYS.addWanted(S, st.heat);
    if (st.t === 'steal' && !S.jobCar) {
      const mesh = CV.actors.makeCarMesh('sport', 0x14b8a6);
      mesh.position.set(st.x, 0, st.z);
      mesh.rotation.y = Math.PI / 2;
      scene.add(mesh);
      S.jobCar = { mesh, kind: 'sport', angle: Math.PI / 2, x: st.x, z: st.z, speed: 0, parked: true };
      CV.actors.parked.push(S.jobCar);
    }
    if (st.t === 'fight') {
      for (let i = 0; i < st.count; i++) {
        const a = (i / st.count) * Math.PI * 2;
        SYS.spawnEnemy(scene, S, st.x + Math.cos(a) * 9, st.z + Math.sin(a) * 9);
      }
      S.job.spawned = true;
    }
  };

  SYS.completeJob = (S) => {
    const def = S.job.def;
    S.cash += def.pay;
    CV.audio.cash();
    S.banner = { title: 'JOB COMPLETE', text: def.name + '  ·  +' + CV.fmtMoney(def.pay), sub: def.outro, t: 4.2 };
    S.job = null;
    SYS.hideMarker();
    const sv = CV.save.data;
    sv.cash = S.cash;
    sv.nextJob = Math.min(7, S.jobIdx + 1);
    sv.jobsDone = Math.max(sv.jobsDone, sv.nextJob);
    CV.save.write();
  };

  SYS.jobObjective = (S) => {
    if (!S.job) return null;
    const st = S.job.def.steps[S.job.step];
    return st || null;
  };

  // ------------------------------------------------------------------ enemies & cops
  SYS.spawnEnemy = (scene, S, x, z) => {
    const mesh = CV.actors.makePerson(0xb03030, 0x22242c, 0x8a5a34);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    S.enemies.push({ mesh, x, z, hp: 68, down: false, shootCd: 1 + Math.random() * 1.4, phase: Math.random() * 6 });
  };

  function spawnCruiser(scene, S) {
    const mesh = CV.actors.makeCarMesh('sedan', 0xf2f2f2);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.4;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.4;
    bar.add(red); bar.add(blue);
    bar.position.set(0, 1.42, -0.15);
    mesh.add(bar);
    const a = Math.random() * Math.PI * 2;
    const px = S.player.x + Math.cos(a) * 70, pz = S.player.z + Math.sin(a) * 70;
    mesh.position.set(px, 0, pz);
    scene.add(mesh);
    S.cruisers.push({ mesh, x: px, z: pz, angle: 0, speed: 0, red, blue });
  }

  function spawnFootCop(scene, S) {
    const mesh = CV.actors.makePerson(0x1d2f57, 0x141c30, 0xf2c79b);
    const a = Math.random() * Math.PI * 2;
    const x = S.player.x + Math.cos(a) * 26, z = S.player.z + Math.sin(a) * 26;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    S.cops.push({ mesh, x, z, hp: 60, down: false, shootCd: 1.5, phase: Math.random() * 6 });
  }

  function spawnHeli(scene, S) {
    const g = new THREE.Group();
    const bodyMat = lam(0x23242e);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.7, 4.8), bodyMat);
    body.castShadow = true; g.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8), lam(0x39506b));
    nose.position.set(0, -0.1, 2.4); g.add(nose);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.4), bodyMat);
    tail.position.set(0, 0.25, -4.2); g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.7), bodyMat);
    fin.position.set(0, 0.6, -6.3); g.add(fin);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.07, 0.65), lam(0x11131a));
    rotor.position.y = 1.15; g.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.7, 0.3), lam(0x11131a));
    tailRotor.position.set(0.35, 0.6, -6.3); g.add(tailRotor);
    for (const sx of [-0.9, 0.9]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.6), bodyMat);
      skid.position.set(sx, -1.25, 0); g.add(skid);
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
    beacon.position.set(0, 1.05, -1); g.add(beacon);
    // Searchlight: real spotlight + visible cone + ground pool.
    const spot = new THREE.SpotLight(0xfff0bb, 1.6, 120, 0.4, 0.55, 0.6);
    g.add(spot); g.add(spot.target);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(6.5, 27, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffeebb, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    scene.add(cone);
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(5.6, 20),
      new THREE.MeshBasicMaterial({ map: CV.glowTexture('rgba(255,240,190,0.9)', 'rgba(255,240,190,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    pool.rotation.x = -Math.PI / 2;
    scene.add(pool);
    scene.add(g);
    const h = { mesh: g, rotor, tailRotor, spot, cone, pool, beacon, x: S.player.x - 40, z: S.player.z - 30, y: 30, ox: -17, oz: -13, hov: 27 };
    S.helis.push(h);
    return h;
  }

  // ------------------------------------------------------------------ combat
  SYS.damagePlayer = (S, dmg) => {
    if (!S.started || S.health <= 0) return;
    S.health -= dmg;
    S.hurtT = 0.35;
    if (S.health <= 0) SYS.wasted(S);
  };

  SYS.wasted = (S) => {
    const fine = Math.min(S.cash, 150);
    S.cash -= fine;
    S.banner = { title: 'WASTED', text: 'The city spits you out at Costa Verde General.', sub: 'Medical bill: ' + CV.fmtMoney(fine), t: 3.6 };
    SYS.resetHeat(S);
    S.health = 100;
    S.player.mode = 'foot';
    S.player.car = null;
    S.player.x = 44; S.player.z = -126;
    CV.save.data.cash = S.cash; CV.save.write();
  };

  SYS.resetHeat = (S) => {
    S.wanted = 0; S.bustT = 0; S.unseenT = 0;
    for (const c of S.cruisers) c.mesh.parent && c.mesh.parent.remove(c.mesh);
    for (const c of S.cops) c.mesh.parent && c.mesh.parent.remove(c.mesh);
    for (const h of S.helis) { h.mesh.parent && h.mesh.parent.remove(h.mesh); h.cone.parent && h.cone.parent.remove(h.cone); h.pool.parent && h.pool.parent.remove(h.pool); }
    S.cruisers = []; S.cops = []; S.helis = [];
  };

  SYS.busted = (S) => {
    const fine = Math.min(S.cash, Math.max(100, Math.round(S.cash * 0.1)));
    S.cash -= fine;
    CV.audio.busted();
    S.banner = { title: 'BUSTED', text: 'Costa Verde PD takes its cut.', sub: 'Fine: ' + CV.fmtMoney(fine) + ' · Released from Costa Verde General', t: 3.8 };
    SYS.resetHeat(S);
    S.health = 100;
    S.player.mode = 'foot';
    S.player.car = null;
    S.player.x = 44; S.player.z = -126;
    CV.save.data.cash = S.cash; CV.save.write();
  };

  // The one shooting routine — used by the click handler AND the playtest.
  SYS.shoot = (scene, S) => {
    if (!S.started || S.dialogue) return;
    CV.audio.shot();
    const P = S.player;
    S.lastShotAt = S.time; S.lastShotX = P.x; S.lastShotZ = P.z;
    const fx = Math.sin(P.angle), fz = Math.cos(P.angle);
    // Muzzle flash tracer.
    if (!SYS._tracer) {
      SYS._tracer = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 })
      );
      scene.add(SYS._tracer);
    }
    const from = new THREE.Vector3(P.x + fx * 0.8, 1.35, P.z + fz * 0.8);
    let best = null, bestD = 34;
    const test = (e, isPed) => {
      if (e.down) return;
      const dx = e.x - P.x, dz = e.z - P.z;
      const d = Math.hypot(dx, dz);
      if (d > 34 || d < 0.4) return;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot > 0.86 && d < bestD) { best = { e, isPed }; bestD = d; }
    };
    for (const e of S.enemies) test(e, false);
    for (const c of S.cops) test(c, false);
    for (const p of CV.actors.peds) test(p, true);
    let end = new THREE.Vector3(P.x + fx * 26, 1.2, P.z + fz * 26);
    if (best) {
      end = new THREE.Vector3(best.e.x, 1.15, best.e.z);
      best.e.hp -= 34;
      if (best.isPed) {
        if (best.e.hp <= 0 && !best.e.down) { best.e.down = true; best.e.mesh.rotation.x = -Math.PI / 2; best.e.mesh.position.y = 0.25; }
        SYS.addWanted(S, 3);
      } else if (best.e.hp <= 0 && !best.e.down) {
        best.e.down = true;
        best.e.mesh.rotation.x = -Math.PI / 2;
        best.e.mesh.position.y = 0.25;
        SYS.addWanted(S, S.enemies.includes(best.e) ? Math.max(S.wanted, 2) : 4);
      }
    }
    SYS._tracer.geometry.setFromPoints([from, end]);
    SYS._tracer.material.opacity = 0.95;
    // Witnesses panic.
    for (const p of CV.actors.peds) {
      if (CV.dist(p.x, p.z, P.x, P.z) < 26) p.flee = 2.6;
    }
    if (S.cruisers.length || S.cops.length) SYS.addWanted(S, Math.max(S.wanted, 2));
  };

  // ------------------------------------------------------------------ race & taxi
  SYS.RACE_CPS = [[120, 60], [-40, 60], [-180, 60], [-228, -30], [-120, -120], [40, -120], [160, -40]];
  SYS.RACE_GATE = { x: 205, z: 60 };

  SYS.buildRaceGate = (scene) => {
    const g = new THREE.Group();
    const poleMat = lam(0x2c2f38);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 7.6, 8), poleMat);
      p.position.set(SYS.RACE_GATE.x, 3.8, 60 + s * 13);
      g.add(p);
    }
    const tex = CV.signTexture('STREET RACE', 'SUNSET GP', '#101828', '#ffd76a', 5);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(24, 4.6), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    banner.position.set(SYS.RACE_GATE.x, 6.6, 60);
    banner.rotation.y = Math.PI / 2;
    g.add(banner);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.3, 8, 30), new THREE.MeshBasicMaterial({ color: 0x51ff8a }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(SYS.RACE_GATE.x, 0.4, 60);
    g.add(ring);
    scene.add(g);
    // Checkpoint ring (moved around by the race logic).
    SYS._cpRing = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.35, 8, 30), new THREE.MeshBasicMaterial({ color: 0x51ff8a, transparent: true, opacity: 0.9 }));
    SYS._cpRing.rotation.x = Math.PI / 2;
    SYS._cpRing.visible = false;
    scene.add(SYS._cpRing);
  };

  // ------------------------------------------------------------------ main update
  SYS.update = (scene, S, dt) => {
    const P = S.player;
    if (SYS._tracer) SYS._tracer.material.opacity = Math.max(0, SYS._tracer.material.opacity - dt * 6);
    if (marker && marker.visible) marker.userData.ring.rotation.z += dt * 1.4;

    // ----- job steps ---------------------------------------------------------
    if (S.job && !S.dialogue) {
      const st = SYS.jobObjective(S);
      if (st) {
        SYS.setMarker(scene, st.x, st.z, st.t === 'fight' ? 0xff5040 : 0xffc93c);
        let done = false;
        if (st.t === 'goto' || st.t === 'deliver' || st.t === 'escape') {
          if (CV.dist(P.x, P.z, st.x, st.z) < st.r) done = true;
          if (st.t === 'deliver') {
            S.job.stepT -= dt;
            if (S.job.stepT <= 0) {
              S.job.stepT = st.time;
              S.banner = { title: 'TOO SLOW', text: 'The buyer walked. Run it again.', sub: '', t: 2.4 };
              P.x = -230; P.z = -60;
              if (P.car) { P.car.x = P.x; P.car.z = P.z; }
            }
          }
        } else if (st.t === 'steal') {
          if (P.car && S.jobCar && P.car === S.jobCar) done = true;
        } else if (st.t === 'fight') {
          if (S.enemies.every((e) => e.down)) done = true;
        }
        if (done) {
          S.job.step++;
          CV.audio.checkpoint();
          if (S.job.step >= S.job.def.steps.length) SYS.completeJob(S);
          else SYS.beginStep(scene, S);
        }
      }
    }

    // ----- wanted / police ----------------------------------------------------
    const wantCruisers = S.wanted === 0 ? 0 : Math.min(1 + S.wanted, 5);
    while (S.cruisers.length < wantCruisers) spawnCruiser(scene, S);
    while (S.cruisers.length > wantCruisers) { const c = S.cruisers.pop(); scene.remove(c.mesh); }
    const wantCops = S.wanted >= 2 && P.mode === 'foot' ? Math.min(S.wanted, 4) : 0;
    while (S.cops.length < wantCops) spawnFootCop(scene, S);
    while (S.cops.length > wantCops) { const c = S.cops.pop(); scene.remove(c.mesh); }
    const wantHelis = S.wanted >= 5 ? 2 : S.wanted >= 3 ? 1 : 0;
    while (S.helis.length < wantHelis) spawnHeli(scene, S);
    while (S.helis.length > wantHelis) { const h = S.helis.pop(); scene.remove(h.mesh); scene.remove(h.cone); scene.remove(h.pool); }

    let seen = S.helis.length > 0;
    S.copNear = false;
    for (const c of S.cruisers) {
      const dx = P.x - c.x, dz = P.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 60) seen = true;
      if (d < 26) S.copNear = true;
      const targetA = Math.atan2(dx, dz);
      c.angle = CV.angLerp(c.angle, targetA, Math.min(1, dt * 2.4));
      const top = P.mode === 'car' ? 31 : 24;
      c.speed = Math.min(top, c.speed + 16 * dt);
      if (d < 7) c.speed = Math.min(c.speed, 9);
      c.x += Math.sin(c.angle) * c.speed * dt;
      c.z += Math.cos(c.angle) * c.speed * dt;
      [c.x, c.z] = CV.city.collide(c.x, c.z, 1.6);
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.angle;
      const flash = Math.sin(S.time * 11) > 0;
      c.red.material.color.setHex(flash ? 0xff2222 : 0x661111);
      c.blue.material.color.setHex(flash ? 0x113366 : 0x2266ff);
      if (P.mode === 'foot' && d < 3) S.bustT += dt;
      if (P.mode === 'car' && d < 3.4 && Math.abs(P.car.speed) < 2.5) S.bustT += dt;
    }
    for (const c of S.cops) {
      if (c.down) continue;
      const dx = P.x - c.x, dz = P.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 55) seen = true;
      if (d < 26) S.copNear = true;
      if (d > 1.5) {
        c.x += (dx / d) * 3.6 * dt; c.z += (dz / d) * 3.6 * dt;
        c.mesh.rotation.y = Math.atan2(dx, dz);
      }
      c.phase += dt * 9;
      CV.actors.animatePerson(c.mesh, c.phase, true);
      c.mesh.position.set(c.x, 0, c.z);
      if (d < 1.7) S.bustT += dt;
      if (S.wanted >= 3 && d < 17 && d > 3) {
        c.shootCd -= dt;
        if (c.shootCd <= 0) { c.shootCd = 1.8 + Math.random(); if (Math.random() < 0.42) SYS.damagePlayer(S, 5); CV.audio.shot(); }
      }
    }
    if (S.bustT > 0 && !(S.cruisers.some((c) => CV.dist(c.x, c.z, P.x, P.z) < 3.4) || S.cops.some((c) => !c.down && CV.dist(c.x, c.z, P.x, P.z) < 1.8))) {
      S.bustT = Math.max(0, S.bustT - dt * 1.6);
    }
    if (S.bustT >= 2.2 && S.wanted > 0) SYS.busted(S);

    if (S.wanted > 0) {
      if (seen) S.unseenT = 0;
      else {
        S.unseenT += dt;
        if (S.unseenT > 14) { S.wanted--; S.unseenT = 0; if (S.wanted === 0) SYS.resetHeat(S); }
      }
    }

    // ----- helicopters ---------------------------------------------------------
    S.helis.forEach((h, i) => {
      const ox = h.ox !== undefined ? h.ox : (i === 0 ? -17 : 15), oz = h.oz !== undefined ? h.oz : (i === 0 ? -13 : 16);
      const hov = h.hov || 27;
      const tx = P.x + ox, tz = P.z + oz;
      h.x += (tx - h.x) * Math.min(1, dt * 1.6);
      h.z += (tz - h.z) * Math.min(1, dt * 1.6);
      h.mesh.position.set(h.x, hov + Math.sin(S.time * 0.8 + i * 2) * 1.2, h.z);
      h.mesh.rotation.y = Math.atan2(P.x - h.x, P.z - h.z);
      h.rotor.rotation.y += dt * 28;
      h.tailRotor.rotation.x += dt * 30;
      h.beacon.material.color.setHex(Math.sin(S.time * 9) > 0 ? 0xff3333 : 0x551111);
      h.spot.position.set(0, -0.8, 1.5);
      h.spot.target.position.copy(h.mesh.worldToLocal(new THREE.Vector3(P.x, 1, P.z)));
      // Cone from heli down to the player, pool on the ground.
      const top = new THREE.Vector3(h.x, hov - 1, h.z);
      const bot = new THREE.Vector3(P.x, 0.4, P.z);
      const mid = top.clone().add(bot).multiplyScalar(0.5);
      h.cone.position.copy(mid);
      const dir = bot.clone().sub(top);
      h.cone.scale.set(1, dir.length() / 27, 1);
      h.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
      h.pool.position.set(P.x, 0.32, P.z);
    });

    // ----- enemies --------------------------------------------------------------
    for (const e of S.enemies) {
      if (e.down) continue;
      const dx = P.x - e.x, dz = P.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      const want = 8.5;
      const mv = d > want + 1 ? 1 : d < want - 1 ? -1 : 0;
      e.x += (dx / d) * mv * 2.6 * dt + Math.cos(S.time * 0.9 + e.phase) * 0.7 * dt;
      e.z += (dz / d) * mv * 2.6 * dt + Math.sin(S.time * 0.8 + e.phase) * 0.7 * dt;
      e.mesh.rotation.y = Math.atan2(dx, dz);
      e.phase += dt * 7;
      CV.actors.animatePerson(e.mesh, e.phase, mv !== 0);
      e.mesh.position.set(e.x, 0, e.z);
      e.shootCd -= dt;
      if (e.shootCd <= 0 && d < 24) {
        e.shootCd = 1.6 + Math.random() * 1.1;
        CV.audio.shot();
        if (Math.random() < 0.4) SYS.damagePlayer(S, 6);
      }
    }

    // ----- street race ------------------------------------------------------------
    const R = S.race;
    R.cd = Math.max(0, R.cd - dt);
    if (!R.active && P.mode === 'car' && R.cd <= 0) {
      if (CV.dist(P.x, P.z, SYS.RACE_GATE.x, SYS.RACE_GATE.z) < 6.5) {
        R.active = true; R.cp = 0; R.time = 0;
        S.banner = { title: 'STREET RACE', text: 'Sunset GP — hit every checkpoint!', sub: 'Prize: $300', t: 2.2 };
        CV.audio.checkpoint();
      }
    }
    if (R.active) {
      R.time += dt;
      const cp = SYS.RACE_CPS[R.cp];
      if (cp) {
        SYS._cpRing.visible = true;
        SYS._cpRing.position.set(cp[0], 0.5, cp[1]);
        SYS.setMarker(scene, cp[0], cp[1], 0x51ff8a);
        if (CV.dist(P.x, P.z, cp[0], cp[1]) < 9.5) {
          R.cp++;
          CV.audio.checkpoint();
          if (R.cp >= SYS.RACE_CPS.length) {
            R.active = false; R.cd = 6;
            SYS._cpRing.visible = false;
            S.cash += 300;
            CV.audio.cash();
            const sv = CV.save.data;
            sv.racesWon++;
            if (!sv.bestRace || R.time < sv.bestRace) sv.bestRace = Math.round(R.time * 10) / 10;
            sv.cash = S.cash;
            CV.save.write();
            S.banner = { title: 'RACE WON', text: 'Sunset GP in ' + R.time.toFixed(1) + 's  ·  +$300', sub: 'Best: ' + (sv.bestRace || R.time).toFixed(1) + 's', t: 3.4 };
          }
        }
      }
      if (R.time > 150) { R.active = false; SYS._cpRing.visible = false; S.banner = { title: 'RACE LOST', text: 'Out of time.', sub: '', t: 2 }; }
    }

    // ----- taxi fares ----------------------------------------------------------------
    const T = S.taxi;
    if (T.state === 'idle') {
      T.t -= dt;
      if (T.t <= 0) {
        const peds = CV.actors.peds.filter((p) => !p.down);
        if (peds.length) {
          T.ped = peds[Math.floor(Math.random() * peds.length)];
          T.state = 'hail';
          T.ped.hailing = true;
        }
        T.t = 30;
      }
    } else if (T.state === 'hail' && T.ped) {
      const p = T.ped;
      p.mesh.userData.parts.armR.rotation.x = Math.PI * 0.92 + Math.sin(S.time * 7) * 0.18; // waving
      SYS.setMarker(scene, p.x, p.z, 0xffe94e);
      if (P.mode === 'car' && Math.abs(P.car.speed) < 1.5 && CV.dist(P.x, P.z, p.x, p.z) < 6.5) {
        T.state = 'ride';
        p.mesh.visible = false;
        const ints = [];
        for (const sx of CV.WORLD.streets) for (const sz of CV.WORLD.streets) ints.push([sx, sz]);
        let dest = ints[Math.floor(Math.random() * ints.length)];
        if (CV.dist(dest[0], dest[1], P.x, P.z) < 90) dest = ints[Math.floor(Math.random() * ints.length)];
        T.dx = dest[0]; T.dz = dest[1];
        T.dist0 = CV.dist(P.x, P.z, T.dx, T.dz);
        S.banner = { title: 'TAXI FARE', text: 'Passenger aboard — follow the gold marker!', sub: '', t: 2.2 };
        CV.audio.blip(990, 0.14, 0.18);
      }
    } else if (T.state === 'ride') {
      SYS.setMarker(scene, T.dx, T.dz, 0xffe94e);
      if (CV.dist(P.x, P.z, T.dx, T.dz) < 9.5) {
        const fare = Math.round(35 + T.dist0 * 0.55);
        S.cash += fare;
        CV.audio.cash();
        const sv = CV.save.data;
        sv.fares++; sv.cash = S.cash; CV.save.write();
        S.banner = { title: 'FARE PAID', text: '+' + CV.fmtMoney(fare) + ' — "Five stars, driver."', sub: '', t: 2.6 };
        const p = T.ped;
        if (p) { p.x = T.dx + 4; p.z = T.dz + 4; p.mesh.visible = true; p.mesh.userData.parts.armR.rotation.x = 0; p.hailing = false; }
        T.state = 'idle'; T.ped = null; T.t = 26;
      }
    }
    // Job markers take priority over taxi/race markers.
    if (S.job && !S.dialogue) { const st = SYS.jobObjective(S); if (st) SYS.setMarker(scene, st.x, st.z, st.t === 'fight' ? 0xff5040 : 0xffc93c); }
    if (!S.job && T.state === 'idle' && !R.active) SYS.hideMarker();

    // ----- autosave position ----------------------------------------------------------
    S.saveT -= dt;
    if (S.saveT <= 0) {
      S.saveT = 4;
      const sv = CV.save.data;
      sv.x = Math.round(P.x); sv.z = Math.round(P.z); sv.cash = S.cash;
      CV.save.write();
    }
  };

  // For screenshot staging / playtest: project the first helicopter into a camera.
  SYS.projectHeli = (S, camera) => {
    if (!S.helis.length) return null;
    const h = S.helis[0];
    const v = new THREE.Vector3(h.x, h.hov || 27, h.z).project(camera);
    return { x: v.x, y: v.y, z: v.z, hx: h.x, hz: h.z };
  };
})();
