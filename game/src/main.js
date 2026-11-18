// Costa Verde — game core: boot, fixed-step simulation, input, cameras, staging hooks.
(function () {
  const save0 = CV.save.load();
  const G = {
    started: false, paused: false, time: 0,
    px: save0.px, pz: save0.pz, heading: Math.PI, health: 100,
    cash: save0.cash, jobIndex: save0.jobIndex,
    inCar: false, car: null, moveSpeed: 0,
    wanted: 0, seenT: 0, bustedMeter: 0, busted: false, bustedT: 0, wasted: false,
    dialogue: null, dialogueT: 0, radioText: '', radioT: 0,
    bannerTitle: '', bannerSub: '', bannerT: 0, hurtT: 0,
    walkPhase: 0, fov: 62, saveT: 0, autoDrive: false, vistaCam: false,
  };
  window.__cvG = G;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game-wrap').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
  camera.position.set(210, 90, 210); camera.lookAt(0, 0, 0);

  const city = CV.buildCity(scene);
  CV.buildTraffic(scene);
  CV.buildPeds(scene);
  CV.systems.init(scene);
  const playerMesh = CV.makePerson(0xd94f30, 0x27324a, 0xc68863, false);
  playerMesh.position.set(G.px, 0, G.pz);
  scene.add(playerMesh);
  CV.hud.init();

  // ---------------- input ----------------
  const keys = {};
  let mouseDX = 0;
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyM') CV.audio.musicOn = !CV.audio.musicOn;
    if (e.code === 'KeyP' && G.started) G.paused = !G.paused;
    if (e.code === 'KeyF' && G.dialogue) advanceDialogue();
    if (e.code === 'KeyT' && G.started && !CV.mission.active && G.jobIndex < 7 && !G.busted) CV.mission.start(G.jobIndex, G);
    if (e.code === 'KeyE' && G.started && !G.busted) toggleCar();
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  renderer.domElement.addEventListener('click', () => {
    CV.audio.init();
    if (G.started && !G.busted && document.pointerLockElement !== renderer.domElement)
      renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
    else if (G.started && !G.busted) playerShoot();
  });
  document.addEventListener('mousemove', e => { if (document.pointerLockElement === renderer.domElement) mouseDX += e.movementX || 0; });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function advanceDialogue() { if (G.dialogue) { G.dialogue.shift(); if (!G.dialogue.length) G.dialogue = null; } }
  function toggleCar() {
    if (G.inCar) {
      const car = G.car;
      G.inCar = false; G.car = null; car.speed = 0;
      G.px = car.x + Math.cos(car.heading) * 2.4; G.pz = car.z - Math.sin(car.heading) * 2.4;
      G.heading = car.heading;
      if (!CV.parked.includes(car)) CV.parked.push(car);
      return;
    }
    let best = null, bd = 5.2;
    const cands = CV.parked.concat(CV.mission.car ? [CV.mission.car] : []);
    for (const c of cands) { const d = CV.dist(G.px, G.pz, c.x, c.z); if (d < bd) { bd = d; best = c; } }
    if (best) {
      G.inCar = true; G.car = best; G.heading = best.heading;
      const ix = CV.parked.indexOf(best); if (ix >= 0) CV.parked.splice(ix, 1);
      if (CV.mission.active && CV.JOBS[CV.mission.idx].steps[CV.mission.step].t === 'steal' && CV.mission.car === best)
        CV.hudBanner(G, 'COMET GT SECURED', 'Get it back to Sal\'s garage.');
    }
  }
  function playerShoot() {
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const len = Math.hypot(dir.x, dir.z) || 1;
    CV.systems.shoot(G, G.px, G.pz, dir.x / len, dir.z / len);
    if (G.wanted === 0 && CV.systems.gangers.some(g => !g.downed)) CV.raiseWanted(G, 1);
  }

  function startGame() {
    if (G.started) return;
    G.started = true; CV.audio.init();
    CV.hud.els.startScreen.style.display = 'none';
    CV.hudBanner(G, 'COSTA VERDE', G.jobIndex < 7 ? 'Press T — ' + CV.JOBS[G.jobIndex].giver + ' has a job for you' : 'All jobs complete');
  }
  document.getElementById('start-btn').addEventListener('click', startGame);

  // ---------------- simulation step (fixed dt) ----------------
  function step(dt) {
    G.time += dt;
    city.update(dt, G.time);
    CV.updateTraffic(dt);
    CV.updatePeds(dt);
    if (G.bannerT > 0) G.bannerT -= dt;
    if (G.radioT > 0) G.radioT -= dt;
    if (G.hurtT > 0) G.hurtT -= dt;
    if (G.dialogue) { G.dialogueT += dt; if (G.dialogueT > 4.5) { G.dialogueT = 0; advanceDialogue(); } }
    if (!G.started || G.paused) { updateCamera(dt); return; }

    if (G.busted) {
      G.bustedT += dt;
      CV.systems.update(dt, G);
      if (G.bustedT > 2.3) {
        const fine = Math.min(G.cash, 200);
        G.cash -= fine; G.health = 100; G.busted = false; G.bustedT = 0; G.wasted = false;
        G.inCar = false; G.car = null;
        G.px = -88; G.pz = 22; G.heading = Math.PI;
        CV.systems.resetHeat(G);
        CV.save.data.cash = G.cash; CV.save.data.px = G.px; CV.save.data.pz = G.pz; CV.save.store();
        CV.hudBanner(G, 'ST. VERDE HOSPITAL', 'Patched up. Fine paid: $' + fine + '.');
      }
      updateCamera(dt); return;
    }
    if (G.health <= 0) { G.busted = true; G.wasted = true; G.bustedT = 0; }

    if (G.inCar) {
      const car = G.car, maxF = car.kind === 'comet' ? 38 : 34;
      if (G.autoDrive) { car.speed = 30.3; }
      else {
        if (keys.KeyW || keys.ArrowUp) car.speed += 16 * dt;
        else if (keys.KeyS || keys.ArrowDown) car.speed -= (car.speed > 0.5 ? 22 : 7) * dt;
        else car.speed -= car.speed * 0.4 * dt;
        if (keys.Space) car.speed -= car.speed * 2.4 * dt;
      }
      car.speed = CV.clamp(car.speed, -9, maxF);
      const steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
      if (!G.autoDrive && Math.abs(car.speed) > 0.4)
        car.heading += steer * dt * 1.45 * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 9);
      let nx = car.x + Math.sin(car.heading) * car.speed * dt;
      let nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const before = Math.abs(car.speed);
      [nx, nz] = CV.collideCircle(nx, nz, 1.7);
      if (CV.dist(nx, nz, car.x, car.z) < Math.abs(car.speed) * dt * 0.4 && before > 4) car.speed *= 0.45;
      car.x = CV.clamp(nx, -262, 205); car.z = CV.clamp(nz, -205, 205);
      CV.syncCar(car);
      G.px = car.x; G.pz = car.z; G.heading = car.heading; G.moveSpeed = Math.abs(car.speed);
      if (stage === 'chase' && G.autoDrive && car.x < -60) { // cover staging: loop the sunset boulevard forever
        car.x = 84; car.z = 66; car.heading = -Math.PI / 2; CV.syncCar(car);
        G.px = car.x; G.pz = car.z; G.heading = car.heading;
        camera.position.set(car.x + 10.5, 4.4, car.z);
      }
      playerMesh.visible = false;
    } else {
      if (mouseDX) { G.heading -= mouseDX * 0.0026; mouseDX = 0; }
      const turn = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
      G.heading += turn * 1.9 * dt;
      let mv = 0;
      if (keys.KeyW || keys.ArrowUp) mv = 1; else if (keys.KeyS || keys.ArrowDown) mv = -0.6;
      const spd = (keys.ShiftLeft || keys.ShiftRight) ? 8.6 : 5.2;
      G.moveSpeed = Math.abs(mv) * spd;
      if (mv) {
        let nx = G.px + Math.sin(G.heading) * spd * mv * dt;
        let nz = G.pz + Math.cos(G.heading) * spd * mv * dt;
        [nx, nz] = CV.collideCircle(nx, nz, 0.6);
        G.px = CV.clamp(nx, -262, 205); G.pz = CV.clamp(nz, -205, 205);
        G.walkPhase += dt * spd * 1.7;
      }
      playerMesh.visible = true;
      playerMesh.position.set(G.px, 0, G.pz);
      playerMesh.rotation.y = G.heading;
      CV.animPerson(playerMesh, G.walkPhase, !!mv);
    }
    if (G.health < 100) G.health = Math.min(100, G.health + dt * 1.6);
    CV.mission.update(dt, G);
    CV.systems.update(dt, G);
    CV.audio.update(dt, G);
    // periodic save of position
    G.saveT -= dt;
    if (G.saveT <= 0) { G.saveT = 5; CV.save.data.px = G.px; CV.save.data.pz = G.pz; CV.save.data.cash = G.cash; CV.save.store(); }
    updateCamera(dt);
  }

  function updateCamera(dt) {
    if (G.vistaCam) {
      camera.position.set(-248, 30, 128);
      camera.lookAt(-300, 0, -60);
      camera.fov = 62; camera.updateProjectionMatrix();
      return;
    }
    if (!G.started) {
      const a = G.time * 0.05;
      camera.position.set(Math.cos(a) * 215, 88, Math.sin(a) * 215);
      camera.lookAt(-30, 8, 0);
      camera.fov = 58; camera.updateProjectionMatrix();
      return;
    }
    if (G.inCar) {
      const car = G.car, fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const tx = car.x - fx * 10.5, tz = car.z - fz * 10.5;
      camera.position.x = CV.lerp(camera.position.x, tx, 0.22);
      camera.position.y = CV.lerp(camera.position.y, 4.4, 0.22);
      camera.position.z = CV.lerp(camera.position.z, tz, 0.22);
      const steerLean = ((keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0)) * 0.03;
      camera.up.set(steerLean, 1, 0);
      camera.lookAt(car.x + fx * 9, 1.6, car.z + fz * 9);
      const targetFov = 62 + Math.min(11, Math.abs(car.speed) * 0.36);
      G.fov = CV.lerp(G.fov, targetFov, 0.08);
      camera.fov = G.fov; camera.updateProjectionMatrix();
    } else {
      const fx = Math.sin(G.heading), fz = Math.cos(G.heading);
      camera.up.set(0, 1, 0);
      camera.position.set(G.px - fx * 7.6, 3.4, G.pz - fz * 7.6);
      camera.lookAt(G.px + fx * 7, 1.7, G.pz + fz * 7);
      G.fov = CV.lerp(G.fov, 62, 0.1); camera.fov = G.fov; camera.updateProjectionMatrix();
    }
  }

  // ---------------- staging + test hooks ----------------
  const Q = new URLSearchParams(location.search);
  const stage = Q.get('stage') || new URLSearchParams(location.hash.slice(1)).get('stage');
  function teleport(x, z, heading) { G.px = x; G.pz = z; if (heading != null) G.heading = heading; playerMesh.position.set(x, 0, z); }
  function chaseReady() {
    if (!G.inCar || !CV.systems.helis.length) return false;
    const h = CV.systems.helis[0];
    if (!h || !h.active) return false;
    if (Math.abs(G.car.speed) < 28) return false;
    if (CV.dist(h.x, h.z, G.px, G.pz) > 34) return false; // settled at its hover point, not mid-transit
    const v = h.mesh.position.clone().project(camera);
    return v.z < 1 && Math.abs(v.x) < 0.82 && v.y > -0.15 && v.y < 0.8;
  }
  function applyStage() {
    if (!stage) return;
    startGame();
    if (stage === 'story') {
      G.jobIndex = 2; G.cash = 1200;
      teleport(-213, -32, Math.atan2(-222 - -213, -40 - -32));
      CV.mission.start(2, G);
    } else if (stage === 'vista') {
      G.jobIndex = 7; G.cash = 1200; G.vistaCam = true;
      teleport(-150, 150, 0);
    } else if (stage === 'chase') {
      G.jobIndex = 5; G.cash = 2450;
      CV.mission.start(5, G);
      CV.mission.step = 2; CV.mission.placeStep(G);
      const car = CV.makeCar('sedan', 0xe23b3b, 84, 66, -Math.PI / 2, false);
      scene.add(car.mesh); car.speed = 30.3;
      G.inCar = true; G.car = car; G.autoDrive = true;
      G.px = car.x; G.pz = car.z; G.heading = car.heading;
      G.wanted = 4;
      camera.position.set(car.x + 10.5, 4.4, car.z);
      for (let i = 0; i < 150; i++) step(1 / 60);
      const S = CV.systems;
      if (!S.cruisers.length) S.spawnCruiser(G);
      const cr = S.cruisers[0];
      cr.x = 26; cr.z = 62.5; cr.heading = -Math.PI / 2; cr.speed = 16;
      G.dialogue = null; G.bannerT = 0;
    }
  }
  applyStage();

  window.__cv = {
    G, step, jobs: CV.JOBS, mission: CV.mission, systems: CV.systems, save: CV.save,
    stepN(n) { for (let i = 0; i < n; i++) step(1 / 60); },
    start: startGame, teleport, chaseReady,
    enterCar: toggleCar,
    press(code) { window.dispatchEvent(new KeyboardEvent('keydown', { code })); window.dispatchEvent(new KeyboardEvent('keyup', { code })); },
    shootAt(npc) { const dx = npc.x - G.px, dz = npc.z - G.pz, l = Math.hypot(dx, dz) || 1; return CV.systems.shoot(G, G.px, G.pz, dx / l, dz / l); },
    counts() { return { traffic: CV.traffic.length, peds: CV.peds.length, parked: CV.parked.length, cruisers: CV.systems.cruisers.length, helis: CV.systems.helis.filter(h => h.active).length }; },
  };

  // ---------------- main loop: fixed-step sim, render every frame ----------------
  const STEP = 1 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let delta = Math.min(0.1, (now - last) / 1000); last = now;
    acc += delta;
    let n = 0;
    while (acc >= STEP && n < 5) { step(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
    CV.hud.update(G);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
})();
