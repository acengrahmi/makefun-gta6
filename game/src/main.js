// Costa Verde — bootstrap: renderer, input, player + car physics, cameras,
// the fixed-step loop, screenshot staging hooks and the playtest API (window.CV.api).
(function () {
  'use strict';
  const CV = (window.CV = window.CV || {});
  const SYS = CV.systems;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.className = 'webgl';
  CV.el('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 3200);
  camera.position.set(-60, 14, 108);

  CV.save.load();
  const S = SYS.newState();
  S.cash = CV.save.data.cash;
  S.jobIdx = CV.save.data.nextJob;
  S.hurtT = 0;
  S.player = {
    x: CV.save.data.x, z: CV.save.data.z, angle: -Math.PI / 2,
    mode: 'foot', car: null, phase: 0, speed: 0,
  };
  CV.state = S;

  CV.city.build(scene);
  CV.actors.spawn(scene);
  SYS.spawnGivers(scene, S);
  SYS.buildRaceGate(scene);
  CV.hud.init();

  const playerMesh = CV.actors.makePerson(0xd64541, 0x2c3e50, 0xc98d5e);
  scene.add(playerMesh);
  S.player.mesh = playerMesh;

  // ---------------------------------------------------------------- input
  const keys = {};
  let camYaw = Math.PI / 2, camPitch = 0.18, staged = null, stageCruiser = null;
  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyF') SYS.advanceDialogue(S);
    if (e.code === 'KeyE') toggleCar();
    if (e.code === 'KeyT') startNextJob();
    if (e.code === 'KeyP' && S.started) { S.paused = !S.paused; CV.el('paused').style.display = S.paused ? 'block' : 'none'; }
    if (e.code === 'KeyM') CV.audio.toggleMusic();
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === renderer.domElement) {
      camYaw -= e.movementX * 0.0026;
      camPitch = CV.clamp(camPitch + e.movementY * 0.002, -0.12, 0.62);
    }
  });
  renderer.domElement.addEventListener('click', () => {
    CV.audio.init();
    if (S.started && !staged && document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock();
    } else if (S.started && S.player.mode === 'foot') {
      SYS.shoot(scene, S);
    } else if (S.started && S.dialogue) {
      SYS.advanceDialogue(S);
    }
  });
  CV.el('start-btn').addEventListener('click', () => startGame());

  function startGame() {
    if (S.started) return;
    S.started = true;
    CV.el('title').style.display = 'none';
    CV.audio.init();
  }

  function startNextJob() {
    if (!S.started || S.job || S.dialogue) return;
    const idx = CV.save.data.nextJob;
    if (idx >= 7) return;
    S.jobIdx = idx;
    SYS.startJob(scene, S, idx);
  }
  CV.startNextJob = startNextJob;

  function toggleCar() {
    if (!S.started || S.dialogue) return;
    const P = S.player;
    if (P.mode === 'car') {
      const car = P.car;
      P.mode = 'foot'; P.car = null;
      P.x = car.x + Math.cos(car.angle) * 2.2;
      P.z = car.z - Math.sin(car.angle) * 2.2;
      P.angle = car.angle;
      car.parked = true;
      if (!CV.actors.parked.includes(car)) CV.actors.parked.push(car);
      playerMesh.visible = true;
      return;
    }
    let best = null, bestD = 3.6;
    const consider = (car, isTraffic) => {
      const d = CV.dist(P.x, P.z, car.x, car.z);
      if (d < bestD) { best = { car, isTraffic }; bestD = d; }
    };
    for (const c of CV.actors.parked) consider(c, false);
    for (const c of CV.actors.traffic) consider(c, true);
    if (S.jobCar) consider(S.jobCar, false);
    if (!best) return;
    const car = best.car;
    if (best.isTraffic) {
      CV.actors.traffic.splice(CV.actors.traffic.indexOf(car), 1);
      SYS.addWanted(S, Math.max(S.wanted, 1)); // grand theft auto, witnessed downtown
      car.traffic = false;
    }
    const pi = CV.actors.parked.indexOf(car);
    if (pi >= 0) CV.actors.parked.splice(pi, 1);
    car.parked = false;
    P.mode = 'car'; P.car = car;
    P.x = car.x; P.z = car.z; P.angle = car.angle;
    playerMesh.visible = false;
  }

  // ---------------------------------------------------------------- player physics
  function stepPlayer(dt) {
    const P = S.player;
    if (S.dialogue) { P.speed = 0; return; }
    if (P.mode === 'foot') {
      let mx = 0, mz = 0;
      const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      mx = (-sin * f + cos * s);
      mz = (-cos * f - sin * s);
      const len = Math.hypot(mx, mz);
      const sprint = keys.ShiftLeft || keys.ShiftRight;
      const spd = sprint ? 8.6 : 5.2;
      if (len > 0.01) {
        mx /= len; mz /= len;
        const targetA = Math.atan2(mx, mz);
        P.angle = CV.angLerp(P.angle, targetA, Math.min(1, dt * 14));
        P.x += mx * spd * dt;
        P.z += mz * spd * dt;
        P.speed = spd;
        P.phase += dt * (sprint ? 11 : 8);
      } else P.speed = 0;
      [P.x, P.z] = CV.city.collide(P.x, P.z, 0.55);
      // Keep the player out of the sea, except along the piers.
      const onPier = [-140, 30, 180].some((pz) => Math.abs(P.z - pz) < 5.6);
      const minX = onPier ? -390 : -297;
      P.x = CV.clamp(P.x, minX, 296);
      P.z = CV.clamp(P.z, -330, 330);
      playerMesh.position.set(P.x, 0, P.z);
      playerMesh.rotation.y = P.angle;
      CV.actors.animatePerson(playerMesh, P.phase, sprint);
      if (len <= 0.01) CV.actors.animatePerson(playerMesh, 0, false);
    } else {
      const car = P.car;
      const st = CV.actors.KIND_STATS[car.kind] || CV.actors.KIND_STATS.sedan;
      const thr = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      const steerIn = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
      car.steer = CV.lerp(car.steer || 0, steerIn * 0.55, Math.min(1, dt * 7));
      if (thr > 0) car.speed += st.accel * dt;
      else if (thr < 0) car.speed -= (car.speed > 0.5 ? 22 : 7) * dt;
      if (keys.Space) car.speed -= Math.sign(car.speed) * 26 * dt;
      car.speed -= car.speed * 0.55 * dt; // drag
      if (Math.abs(car.speed) < 0.04 && thr === 0) car.speed = 0;
      car.speed = CV.clamp(car.speed, -9, st.max);
      if (Math.abs(car.speed) > 0.05) {
        car.angle += car.steer * car.speed * dt * 0.30;
      }
      car.x += Math.sin(car.angle) * car.speed * dt;
      car.z += Math.cos(car.angle) * car.speed * dt;
      const before = car.speed;
      [car.x, car.z] = CV.city.collide(car.x, car.z, 1.7);
      if (Math.abs(car.x - P.x) > 0.001 || Math.abs(car.z - P.z) > 0.001) { /* collided */ }
      car.x = CV.clamp(car.x, -296, 296);
      car.z = CV.clamp(car.z, -330, 330);
      // Running someone down is a serious crime.
      if (Math.abs(car.speed) > 4) {
        for (const p of CV.actors.peds) {
          if (!p.down && CV.dist(p.x, p.z, car.x, car.z) < 1.7) {
            p.down = true; p.mesh.rotation.x = -Math.PI / 2; p.mesh.position.y = 0.25;
            SYS.addWanted(S, 3);
          }
        }
        for (const c of CV.actors.traffic) {
          if (CV.dist(c.x, c.z, car.x, car.z) < 3.1) { car.speed *= 0.45; c.speed *= 0.5; }
        }
        void before;
      }
      P.x = car.x; P.z = car.z; P.angle = car.angle; P.speed = car.speed;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.angle;
      const wr = car.speed * dt * 2.4;
      for (const w of car.mesh.userData.wheels) w.rotation.x += wr;
    }
  }

  // ---------------------------------------------------------------- cameras
  const camTarget = new THREE.Vector3();
  function updateCamera(dt, t) {
    const P = S.player;
    if (!S.started) {
      // Title orbit: hovering over the hero boulevard, looking into the sunset.
      const cx = -30 + Math.sin(t * 0.05) * 12;
      camera.position.set(cx, 9.5, 60 + Math.cos(t * 0.04) * 5);
      camera.lookAt(-520, 30, -14);
      camera.fov = 58; camera.updateProjectionMatrix();
      return;
    }
    if (staged === 'story') {
      camera.position.set(-293, 3.4, 47);
      camera.lookAt(-301, 1.2, 29);
      return;
    }
    if (staged === 'vista') {
      camera.position.set(-258, 26, 190);
      camera.lookAt(-860, 30, -105);
      return;
    }
    if (P.mode === 'car') {
      const car = P.car;
      const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
      const back = 10.5 + Math.abs(car.speed) * 0.06;
      camTarget.set(car.x - fx * back, 4.1 + Math.abs(car.speed) * 0.012, car.z - fz * back);
      camera.position.lerp(camTarget, 1 - Math.exp(-dt * 6));
      camera.lookAt(car.x + fx * 9, 1.3, car.z + fz * 9);
      const wantFov = 62 + Math.min(11, Math.abs(car.speed) * 0.34);
      if (Math.abs(camera.fov - wantFov) > 0.1) { camera.fov += (wantFov - camera.fov) * 0.12; camera.updateProjectionMatrix(); }
      camera.rotateZ(-(car.steer || 0) * Math.min(0.05, Math.abs(car.speed) * 0.0016));
      camYaw = -car.angle + Math.PI;
    } else {
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      camTarget.set(P.x + fx * 7.6, 2.4 + camPitch * 6, P.z + fz * 7.6);
      camera.position.lerp(camTarget, 1 - Math.exp(-dt * 10));
      camera.lookAt(P.x - fx * 4, 1.7, P.z - fz * 4);
      if (Math.abs(camera.fov - 58) > 0.1) { camera.fov += (58 - camera.fov) * 0.15; camera.updateProjectionMatrix(); }
    }
  }

  // ---------------------------------------------------------------- staging (screenshots)
  function stage(name) {
    staged = name;
    const P = S.player;
    if (name === 'start') {
      S.started = false;
      CV.el('title').style.display = 'flex';
      return;
    }
    startGame();
    if (name === 'chase') {
      // Job 6 on the hero boulevard, driving west into the sun at ~109 km/h.
      S.jobIdx = 5;
      S.cash = 2450;
      S.job = { def: SYS.JOBS[5], idx: 5, step: 0, stepT: 145, spawned: true };
      SYS.addWanted(S, 4);
      const mesh = CV.actors.makeCarMesh('sport', 0xd92323);
      scene.add(mesh);
      const car = { mesh, kind: 'sport', angle: -Math.PI / 2, x: 150, z: 52.5, speed: 30.3, steer: 0, parked: false };
      P.mode = 'car'; P.car = car; P.x = car.x; P.z = car.z; P.angle = car.angle;
      playerMesh.visible = false;
      // A roadblock cruiser parked ahead, facing the player.
      stageCruiser = CV.actors.makeCarMesh('sedan', 0xf2f2f2);
      scene.add(stageCruiser);
    }
    if (name === 'story') {
      S.jobIdx = 2;
      S.cash = 1200;
      P.mode = 'foot'; P.car = null;
      P.x = -295.5; P.z = 36.5; P.angle = Math.atan2(-300 - P.x, 30 - P.z);
      playerMesh.visible = true;
      playerMesh.position.set(P.x, 0, P.z);
      camYaw = Math.PI * 0.78;
      SYS.startJob(scene, S, 2); // opens Mateo's dialogue; marker + giver in frame
    }
    if (name === 'vista') {
      P.mode = 'foot';
      P.x = -258; P.z = 190;
      CV.save.data.nextJob = 7; // so the objective bar agrees with the banner
      S.banner = { title: 'COSTA VERDE', text: 'All seven jobs done — the city is yours.', sub: '', t: 9999 };
      S.cash = 1200;
    }
  }

  function stageUpdate(dt) {
    if (staged !== 'chase' || !S.player.car) return;
    const car = S.player.car;
    car.speed = 30.3;
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    if (car.x < -215) car.x = 195;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.angle;
    const wr = car.speed * dt * 2.4;
    for (const w of car.mesh.userData.wheels) w.rotation.x += wr;
    S.player.x = car.x; S.player.z = car.z; S.player.speed = car.speed;
    if (stageCruiser) {
      stageCruiser.position.set(car.x - 52, 0, 66);
      stageCruiser.rotation.y = Math.PI / 2 + Math.PI; // nose toward the player
    }
    // Park the helicopter at its photogenic hover: ahead, low, near the sun.
    if (S.helis.length) {
      const h = S.helis[0];
      h.ox = -34; h.oz = -15; h.hov = 17;
      h.x = car.x - 34; h.z = car.z - 15;
    }
  }

  // ---------------------------------------------------------------- fixed-step loop
  function stepSim(dt) {
    S.time += dt;
    if (S.started && !S.paused) {
      if (staged === 'chase') stageUpdate(dt);
      else stepPlayer(dt);
      CV.actors.update(dt, S.time, S);
      SYS.update(scene, S, dt);
      if (S.banner && S.banner.t < 9000) S.banner.t -= dt;
      S.hurtT = Math.max(0, (S.hurtT || 0) - dt);
      CV.audio.update(dt, { driving: S.player.mode === 'car', speed: S.player.speed || 0, wanted: S.wanted, copNear: S.copNear });
    }
    CV.city.update(dt, S.time);
    updateCamera(dt, S.time);
    CV.hud.update(S, dt);
  }

  let last = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.06, (now - last) / 1000);
    last = now;
    acc += dt;
    const step = 1 / 60;
    let n = 0;
    while (acc >= step && n < 4) { stepSim(step); acc -= step; n++; }
    if (n === 4) acc = 0;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------------------------------------------------------------- staging from URL hash + API
  const hashStage = (location.hash.match(/stage=([a-z]+)/) || [])[1];
  if (hashStage) stage(hashStage);

  CV.api = {
    state: S, scene, camera, renderer, stage, startGame, startNextJob,
    step: (n, dt) => { const d = dt || 1 / 60; for (let i = 0; i < (n || 1); i++) stepSim(d); renderer.render(scene, camera); },
    teleport: (x, z) => {
      const P = S.player;
      P.x = x; P.z = z;
      if (P.car) { P.car.x = x; P.car.z = z; P.car.mesh.position.set(x, 0, z); }
      playerMesh.position.set(x, 0, z);
    },
    enterCar: () => toggleCar(),
    exitCar: () => { if (S.player.mode === 'car') toggleCar(); },
    shoot: () => SYS.shoot(scene, S),
    setWanted: (n) => { S.wanted = n; },
    face: (a) => { S.player.angle = a; },
    projectHeli: () => SYS.projectHeli(S, camera),
    counts: () => ({
      traffic: CV.actors.traffic.length, parked: CV.actors.parked.length, peds: CV.actors.peds.length,
      colliders: CV.city.colliders.length, boats: CV.city.boats.length,
      cruisers: S.cruisers.length, helis: S.helis.length, cops: S.cops.length,
    }),
    resetSave: () => { CV.save.reset(); S.cash = 0; S.jobIdx = 0; },
  };
})();
