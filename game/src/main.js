// main.js — Costa Verde's engine room: renderer, golden-hour lighting, the
// player on foot and behind the wheel, gunfire, the fixed-step game loop,
// screenshot staging (#stage=…) and the window.CV surface the playtest drives.

import { SoundBank } from './audio.js';
import { buildCity } from './city.js';
import { Hud } from './hud.js';
import { spawnTraffic, spawnPeds, makePedMesh, makeVehicleMesh, makeHeli, updateTraffic, updatePeds, updatePolice, updateHeli } from './actors.js';
import { createState, initActors, updateSystems, tryInteract, advanceDialogue, beginJob, commitCrime, damagePed, damageCar, startRace, raceStartPoint, JOBS } from './systems.js';
import { storeSave } from './save.js';
import { mulberry32, clamp, dist2, collideCircle, CITY_MIN, CITY_MAX, SEA_Z } from './util.js';

const rng = mulberry32(987654);
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe88a5a, 240, 1350);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);

const hemi = new THREE.HemisphereLight(0xffd9a0, 0x4a3b52, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffab4a, 1.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
sun.shadow.camera.far = 900;
sun.shadow.bias = -0.0006;
scene.add(sun); scene.add(sun.target);

const city = buildCity(scene);
const state = createState();
const sound = new SoundBank();
const hud = new Hud();

state.traffic = spawnTraffic(scene, rng, 20);
state.peds = spawnPeds(scene, rng, 44);
initActors(state, scene, city, rng);
state.heli = makeHeli(scene);

// the player figure
const playerMesh = makePedMesh(rng, { shirt: 0xff7847, pants: 0x24304a });
scene.add(playerMesh);

// ---- input ---------------------------------------------------------------------
const keys = {};
let camYaw = Math.PI, camPitch = 0.32, pointerLocked = false;
let fireCooldown = 0, paused = false;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM' && state.mode !== 'title') { sound.setMuted(!sound.muted); }
  if (e.code === 'KeyP' && state.mode === 'play') paused = !paused;
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyF') toggleCar();
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', () => {
  sound.unlock();
  if (state.mode !== 'play') return;
  if (state.dialogue) { advanceDialogue(state); return; }
  if (!pointerLocked) canvas.requestPointerLock?.();
  fire();
});
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvas; });
window.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  camYaw -= e.movementX * 0.0026;
  camPitch = clamp(camPitch + e.movementY * 0.0022, -0.05, 1.1);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.getElementById('title').addEventListener('click', () => startGame());

function startGame() {
  if (state.mode !== 'title') return;
  sound.unlock();
  state.mode = 'play';
  hud.hideTitle();
}

function interact() {
  if (state.mode !== 'play') return;
  sound.unlock();
  if (state.dialogue) { advanceDialogue(state); return; }
  if (tryInteract(state)) return;
  const p = state.player;
  if (p.car && !state.race.active) {
    const rs = raceStartPoint();
    if (dist2(p.car.x, p.car.z, rs.x, rs.z) < 10) startRace(state);
  }
}
function nearestCar(maxD) {
  const p = state.player;
  let best = null, bd = maxD;
  for (const list of [state.parked, state.traffic, state.police]) {
    for (const car of list) {
      if (car === p.car) continue;
      const d = dist2(p.x, p.z, car.x, car.z);
      if (d < bd) { bd = d; best = car; }
    }
  }
  return best;
}

function toggleCar() {
  if (state.mode !== 'play' || state.dialogue) return;
  const p = state.player;
  if (p.car) {
    const car = p.car;
    car.driver = null; car.speed = 0;
    p.x = car.x + Math.cos(car.heading) * 2.4; p.z = car.z - Math.sin(car.heading) * 2.4;
    p.car = null;
    playerMesh.visible = true;
    sound.door(); sound.engine(0, false);
    return;
  }
  const car = nearestCar(3.6);
  if (!car) return;
  if (car.driver === 'traffic' && Math.abs(car.speed) > 5) {
    state.flash = { text: 'Too fast to jack — slow it down first', color: '#ff5d5d', t: state.time };
    return;
  }
  if (car.driver === 'police') return;
  const wasTraffic = car.driver === 'traffic';
  car.driver = 'player';
  p.car = car;
  playerMesh.visible = false;
  sound.door();
  if (wasTraffic || car.id === 'comet') {
    commitCrime(state, 1);
    state.threat.x = p.x; state.threat.z = p.z;
    for (const ped of state.peds) {
      if (ped.role === 'ped' && dist2(ped.x, ped.z, p.x, p.z) < 16) { ped.state = 'flee'; ped.fleeT = 3; }
    }
  }
  // story hook: stealing the Comet GT advances job 2
  if (car.id === 'comet') {
    const job = JOBS[state.jobIndex];
    const step = job && job.steps[state.jobStep];
    if (step && step.t === 'steal' && step.id === 'comet') {
      state.jobStep++;
      const next = job.steps[state.jobStep];
      state.objective = next ? (next.label || job.title) : job.title;
      state.marker = next && next.x !== undefined ? { x: next.x, z: next.z } : null;
      state.flash = { text: 'Comet GT acquired — deliver it!', color: '#ffd23f', t: state.time };
    }
  }
}

function fire() {
  if (state.mode !== 'play' || state.dialogue || state.player.car || fireCooldown > 0) return;
  fireCooldown = 0.22;
  sound.shot();
  commitCrime(state, 1);
  state.threat.x = state.player.x; state.threat.z = state.player.z;
  for (const ped of state.peds) {
    if (ped.role === 'ped' && dist2(ped.x, ped.z, state.player.x, state.player.z) < 18) { ped.state = 'flee'; ped.fleeT = 3; }
  }
  // hitscan along the camera's aim, resolved in the ground plane: the
  // target nearest the aim line within range takes the round.
  const p = state.player;
  p.heading = camYaw;
  const dx = Math.sin(camYaw), dz = Math.cos(camYaw);
  let bestT = 70, bestPed = null, bestCar = null;
  const test = (x, z, r) => {
    const tx = x - p.x, tz = z - p.z;
    const t = tx * dx + tz * dz;
    if (t < 1 || t > bestT) return -1;
    const perp = Math.abs(tx * dz - tz * dx);
    return perp < r ? t : -1;
  };
  for (const ped of state.peds) {
    if (ped.state === 'down' || ped.role === 'fare-ride') continue;
    const t = test(ped.x, ped.z, 1.0);
    if (t > 0) { bestT = t; bestPed = ped; bestCar = null; }
  }
  for (const list of [state.parked, state.traffic, state.police]) {
    for (const car of list) {
      const t = test(car.x, car.z, 2.6);
      if (t > 0) { bestT = t; bestCar = car; bestPed = null; }
    }
  }
  if (bestPed) damagePed(state, bestPed, 34);
  else if (bestCar) damageCar(state, bestCar, 20);
}

// ---- player + car simulation -------------------------------------------------------
function stepPlayer(dt) {
  const p = state.player;
  if (p.car) {
    const car = p.car;
    const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
    const top = car.kind === 'comet' ? 35 : car.kind === 'van' ? 24 : 29;
    if (fwd > 0) car.speed += 15 * dt;
    else if (fwd < 0) car.speed -= (car.speed > 0.5 ? 24 : 8) * dt;
    else car.speed -= car.speed * 0.7 * dt;
    if (keys.Space) car.speed -= car.speed * 3.2 * dt;
    car.speed = clamp(car.speed, -9, top);
    if (Math.abs(car.speed) > 0.05) {
      car.heading += steer * clamp(car.speed * 0.036, -1.15, 1.15) * dt * (keys.Space ? 1.45 : 1);
    }
    let nx = car.x + Math.sin(car.heading) * car.speed * dt;
    let nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const before = [nx, nz];
    [nx, nz] = collideCircle(nx, nz, 2.3, city.colliders);
    if (Math.hypot(nx - before[0], nz - before[1]) > 0.4 && Math.abs(car.speed) > 6) {
      car.hp -= 4; car.speed *= 0.35; sound.hit();
    }
    car.x = clamp(nx, CITY_MIN - 4, CITY_MAX + 4);
    car.z = clamp(nz, CITY_MIN - 4, SEA_Z + 70);
    // running people over is very illegal
    if (Math.abs(car.speed) > 4) {
      for (const ped of state.peds) {
        if (ped.role === 'npc' || ped.state === 'down' || ped.role === 'fare-ride') continue;
        if (dist2(ped.x, ped.z, car.x, car.z) < 2.7) {
          damagePed(state, ped, 100);
          car.speed *= 0.6;
        }
      }
    }
    // traffic bumps
    for (const other of state.traffic) {
      if (other === car) continue;
      const d = dist2(other.x, other.z, car.x, car.z);
      if (d < 4.4 && d > 0.01) {
        const push = (4.4 - d) / 2;
        const dx = (other.x - car.x) / d, dz = (other.z - car.z) / d;
        other.x += dx * push; other.z += dz * push;
        if (Math.abs(car.speed) > 8) { damageCar(state, other, 8); car.speed *= 0.7; }
      }
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    p.x = car.x; p.z = car.z; p.heading = car.heading;
    sound.engine(clamp(Math.abs(car.speed) / 32, 0, 1), true);
  } else {
    const sprint = keys.ShiftLeft || keys.ShiftRight;
    const sp = sprint ? 8.4 : 5.2;
    let mx = 0, mz = 0;
    if (!state.dialogue) {
      const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      mx = (sin * -f + cos * s); mz = (cos * -f - sin * s);
      const len = Math.hypot(mx, mz);
      if (len > 0.01) {
        mx /= len; mz /= len;
        p.heading = Math.atan2(mx, mz);
        let nx = p.x + mx * sp * dt;
        let nz = p.z + mz * sp * dt;
        [nx, nz] = collideCircle(nx, nz, 0.5, city.colliders);
        p.x = clamp(nx, CITY_MIN - 4, CITY_MAX + 4);
        p.z = clamp(nz, CITY_MIN - 4, SEA_Z + 88);
        p.walkPhase = (p.walkPhase || 0) + dt * (sprint ? 11 : 8);
      }
    }
    playerMesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase || 0)) * 0.06, p.z);
    playerMesh.rotation.y = p.heading;
    sound.engine(0, false);
  }
  fireCooldown = Math.max(0, fireCooldown - dt);
}

function updatePrompt() {
  const p = state.player;
  if (state.dialogue) { state.promptText = ''; return; }
  const job = JOBS[state.jobIndex];
  const step = job && !state.storyDone ? job.steps[state.jobStep] : null;
  if (step && step.t === 'talk') {
    const npc = state.npcs[step.npc];
    if (npc && dist2(p.x, p.z, npc.x, npc.z) < 4.2) { state.promptText = `E — Talk to ${npc.name}`; return; }
  }
  if (!p.car) {
    state.promptText = nearestCar(3.6) ? 'F — Enter car' : '';
  } else if (!state.race.active) {
    const rs = raceStartPoint();
    state.promptText = dist2(p.car.x, p.car.z, rs.x, rs.z) < 10 ? 'E — Start the Sunset GP ($600 prize)' : 'F — Exit car';
  } else state.promptText = '';
}

// ---- busted / wasted ------------------------------------------------------------------
function stepMode(dt) {
  if (state.mode !== 'busted' && state.mode !== 'wasted') return;
  state.modeT += dt;
  if (state.modeT < 0.1) {
    if (state.mode === 'busted') {
      hud.showOverlay('BUSTED', 'The Costa Verde PD impounds your dignity. Fine: 10% of your cash.', '#5db9ff');
      sound.bustedJingle();
    } else {
      hud.showOverlay('WASTED', 'You wake up at Costa Verde General. The bill stings more than the bullets.', '#ff5d5d');
      sound.wastedJingle();
    }
  }
  if (state.modeT > 2.8) {
    const p = state.player;
    if (p.car) { p.car.driver = null; p.car = null; playerMesh.visible = true; }
    if (state.mode === 'busted') {
      state.cash = Math.max(20, Math.round(state.cash * 0.9));
      p.x = city.anchors.station.x; p.z = city.anchors.station.z;
    } else {
      state.cash = Math.max(0, state.cash - Math.min(150, state.cash));
      p.x = city.anchors.hospital.x; p.z = city.anchors.hospital.z;
      p.hp = 100;
    }
    state.wanted = 0; state.bust = 0;
    for (const cop of state.police) { scene.remove(cop.mesh); }
    state.police = [];
    hud.hideOverlay();
    state.mode = 'play';
    storeSave(state);
  }
}

// ---- camera ------------------------------------------------------------------------------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const p = state.player;
  if (state.camOverride) {
    camera.position.copy(state.camOverride.pos);
    camera.lookAt(state.camOverride.look);
    return;
  }
  const focus = p.car ? p.car : p;
  const fx = focus.x, fz = focus.z;
  const dist = p.car ? 10.5 : 7.5;
  const height = p.car ? 4 : 3.1;
  const cx = fx - Math.sin(camYaw) * Math.cos(camPitch) * dist;
  const cz = fz - Math.cos(camYaw) * Math.cos(camPitch) * dist;
  const cy = height + Math.sin(camPitch) * dist;
  camera.position.x = cx; camera.position.z = cz;
  camera.position.y = Math.max(1.1, cy);
  camTarget.set(fx, 1.4, fz);
  camera.lookAt(camTarget);
  if (p.car) camYaw = dampAngle(camYaw, p.car.heading, 1.6, dt);
  sun.position.set(fx - 190, 150, fz + 260);
  sun.target.position.set(fx, 0, fz);
}
function dampAngle(a, b, l, dt) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-l * dt));
}

// ---- the loop: fixed-step simulation, decoupled from rAF --------------------------------
const STEP = 1 / 60;
let acc = 0, lastTs = 0;
function simStep(dt) {
  if (state.frozen) { city.tick(dt, performance.now() / 1000); return; }
  if (state.mode === 'play' && !paused) {
    stepPlayer(dt);
    updateSystems(state, scene, rng, dt);
    updateTraffic(state, dt, rng);
    updatePeds(state, dt, rng, city.colliders);
    updatePolice(state, dt);
    updateHeli(state, dt);
    updatePrompt();
    for (const s of state.sfx.splice(0)) {
      if (s === 'cash') sound.cash(); else if (s === 'hit') sound.hit();
      else if (s === 'pickup') sound.pickup(); else if (s === 'checkpoint') sound.checkpoint();
      else if (s === 'jobDone') sound.jobDone(); else if (s === 'fail') sound.fail();
      else if (s === 'busted') sound.bustedJingle(); else if (s === 'wasted') sound.wastedJingle();
    }
    sound.setSiren(state.wanted > 0 && (state.police.length > 0));
    if (state.dirty) { state.dirty = false; storeSave(state); }
  } else if (state.mode === 'busted' || state.mode === 'wasted') {
    state.time += dt;
    stepMode(dt);
  }
  city.tick(dt, performance.now() / 1000);
}

function frame(ts) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.25, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  acc += dtReal;
  let n = 0;
  while (acc >= STEP && n < 16) { simStep(STEP); acc -= STEP; n++; }
  if (n === 16) acc = 0;
  updateCamera(dtReal);
  hud.update(state);
  renderer.render(scene, camera);
}

// ---- staging for screenshots ---------------------------------------------------------------
const stage = (location.hash.match(/stage=([a-z]+)/) || [])[1] || '';
function applyStage() {
  if (!stage) { hud.showTitle(!!loadHasSave()); return; }
  state.mode = 'play';
  hud.hideTitle();
  const p = state.player;
  if (stage === 'start') {
    state.mode = 'title';
    hud.showTitle(false);
    camYaw = -0.7; camPitch = 0.24;
    p.x = 30; p.z = 60;
  } else if (stage === 'chase') {
    // a posed mid-chase tableau on the hero boulevard, frozen for the cover:
    // hero Comet in the right lane, two cruisers on its tail, the helicopter's
    // searchlight cone leaning onto the car, four stars on the HUD.
    const mesh = makeHeroCar();
    const car = { mesh, kind: 'comet', x: 40, z: 6, heading: Math.PI / 2, speed: 13, driver: 'player', hp: 100 };
    mesh.position.set(40, 0, 6); mesh.rotation.y = Math.PI / 2;
    scene.add(mesh);
    p.car = car; p.x = 40; p.z = 6; playerMesh.visible = false;
    state.wanted = 4;
    state.objective = 'LOSE THE COPS!';
    for (const [cx, cz] of [[35.5, 0.5], [36, 11]]) {
      const cruiser = makeVehicleMesh('cruiser', 0x1c1e26);
      cruiser.position.set(cx, 0, cz);
      cruiser.rotation.y = Math.PI / 2 + (cz < 6 ? 0.1 : -0.08);
      scene.add(cruiser);
    }
    const heli = state.heli.mesh;
    heli.visible = true;
    heli.position.set(74, 13, -10);
    heli.rotation.set(0.06, 2.0, 0.5);
    const spot = heli.userData.spot;
    spot.target.position.set(40 - 74, -13, 6 - (-10));
    spot.target.updateMatrixWorld();
    camYaw = Math.PI / 2; camPitch = 0.12;
    state.frozen = true;
  } else if (stage === 'story') {
    state.jobIndex = 2;
    const mateo = state.npcs.mateo;
    p.x = mateo.x + 2.2; p.z = mateo.z - 1.5; p.heading = Math.atan2(mateo.x - p.x, mateo.z - p.z);
    mateo.heading = Math.atan2(p.x - mateo.x, p.z - mateo.z);
    mateo.mesh.position.y = 1.2; // standing on the pier deck
    mateo.mesh.rotation.y = mateo.heading;
    playerMesh.position.set(p.x, 1.2, p.z);
    playerMesh.rotation.y = p.heading;
    state.dialogue = { lines: JOBS[2].steps[0].lines, i: 0, step: JOBS[2].steps[0] };
    state.objective = '';
    state.camOverride = {
      pos: new THREE.Vector3(mateo.x + 4.2, 2.8, mateo.z - 5.2),
      look: new THREE.Vector3(mateo.x + 1.0, 1.7, mateo.z),
    };
    state.frozen = true;
  } else if (stage === 'vista') {
    p.x = 36; p.z = 292; p.heading = Math.PI;
    state.camOverride = {
      pos: new THREE.Vector3(36, 3.4, 266),
      look: new THREE.Vector3(-52, 7, 700),
    };
    state.frozen = true;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__stageReady = true; }));
}
function makeHeroCar() {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: 0xcc4400 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.5, 4.7), paint);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.1), new THREE.MeshLambertMaterial({ color: 0x1c2733 }));
  cabin.position.set(0, 1.0, -0.2); g.add(cabin);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), paint);
  spoiler.position.set(0, 0.95, -2.2); g.add(spoiler);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14151a });
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.36, wz); g.add(w);
  }
  return g;
}
function loadHasSave() {
  try { return !!localStorage.getItem('costa-verde-save-v1'); } catch { return false; }
}

// ---- playtest surface -------------------------------------------------------------------------
window.CV = {
  state, JOBS,
  start: () => startGame(),
  counts: () => ({
    buildings: city.buildingCount, traffic: state.traffic.length,
    peds: state.peds.length, parked: state.parked.length, police: state.police.length,
  }),
  teleport: (x, z) => { const p = state.player; if (p.car) { p.car.x = x; p.car.z = z; } p.x = x; p.z = z; },
  pos: () => ({ x: state.player.x, z: state.player.z, hp: state.player.hp, inCar: !!state.player.car }),
  cash: () => state.cash,
  job: () => ({ index: state.jobIndex, step: state.jobStep, done: state.storyDone, objective: state.objective }),
  wanted: () => state.wanted,
  setWanted: (n) => { commitCrime(state, n); if (n === 0) { state.wanted = 0; } },
  keys,
  interact: () => interact(),
  toggleCar: () => toggleCar(),
  fire: () => fire(),
  aim: (x, z) => { camYaw = Math.atan2(x - state.player.x, z - state.player.z); },
  setCamYaw: (v) => { camYaw = v; },
  setCamPitch: (v) => { camPitch = v; },
  beginJob: (i) => { state.jobIndex = i; state.storyDone = false; beginJob(state); },
  startRace: () => startRace(state),
  race: () => ({ ...state.race }),
  taxi: () => ({ phase: state.taxi.phase }),
  hurt: (n) => { state.player.hp -= n; state.player.lastHurt = state.time; },
  heal: () => { state.player.hp = 100; },
  mode: () => state.mode,
  bust: () => state.bust,
  dialogue: () => state.dialogue ? { who: state.dialogue.lines[state.dialogue.i][0], i: state.dialogue.i } : null,
  nearestPedByRole: (role) => state.peds.find((pd) => pd.role === role && pd.state !== 'down') || null,
  step: (n) => { for (let i = 0; i < n; i++) simStep(STEP); },
  saveRaw: () => { try { return localStorage.getItem('costa-verde-save-v1'); } catch { return null; } },
};

hud.showTitle(loadHasSave());
applyStage();
requestAnimationFrame(frame);
