// Costa Verde — an open-world crime game. Wires the city, cars, people, police,
// missions, combat, HUD and sound into one loop, plus the ?shot= scenes used
// for the entry's screenshots.
import { clamp, lerp, angleLerp, dist2D, mulberry32 } from './util.js';
import { buildCity, LANDMARKS, PITCH, ROAD_K, CITY_HALF, nearestRoadPoint, isOnRoad } from './city.js';
import { Car, TrafficManager } from './vehicles.js';
import { PedestrianManager } from './people.js';
import { PoliceSystem } from './police.js';
import { CombatSystem } from './combat.js';
import { MissionManager } from './missions.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';
import { Player } from './player.js';
import { loadSave, writeSave } from './save.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 20261117);
const SHOT = params.get('shot') || '';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

// ---- golden hour: Costa Verde lives at sunset — a gradient sky dome, a low
// orange sun in the west, long shadows and warm haze on the horizon. ----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2a55);
scene.fog = new THREE.Fog(0xe88a5a, 150, 640);

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#1c3260');   // zenith, dusky blue
  grad.addColorStop(0.25, '#54407e');  // violet
  grad.addColorStop(0.38, '#b3546e');  // rose
  grad.addColorStop(0.46, '#f07f4a');  // orange
  grad.addColorStop(0.5, '#ffc46a');   // horizon glow
  grad.addColorStop(0.56, '#e88a52');  // below the horizon (mostly sea-covered)
  grad.addColorStop(1.0, '#7a4a3a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(950, 24, 14),
  new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
);
scene.add(sky);

// the sun itself: a bright disc with a soft halo, low over the western sea road
const SUN_DIR = new THREE.Vector3(-0.83, 0.26, -0.18).normalize();
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(42, 24),
  new THREE.MeshBasicMaterial({ color: 0xffc06a, fog: false }),
);
sunDisc.position.copy(SUN_DIR).multiplyScalar(880);
sunDisc.lookAt(0, 0, 0);
scene.add(sunDisc);
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,190,110,0.85)');
  grad.addColorStop(0.4, 'rgba(255,140,70,0.35)');
  grad.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlowTexture(), transparent: true, opacity: 0.9, fog: false, depthWrite: false,
}));
sunGlow.position.copy(SUN_DIR).multiplyScalar(870);
sunGlow.scale.setScalar(430);
scene.add(sunGlow);

const hemi = new THREE.HemisphereLight(0xffb98a, 0x7a4a34, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xff9a3c, 2.0);
sun.position.copy(SUN_DIR).multiplyScalar(420);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -180; sun.shadow.camera.right = 180;
sun.shadow.camera.top = 180; sun.shadow.camera.bottom = -180;
sun.shadow.camera.far = 1000;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 1.2;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);

// ---- world ----
const rng = mulberry32(SEED);
const city = buildCity(scene, SEED);
const traffic = new TrafficManager(scene, city.colliders, 16);
const peds = new PedestrianManager(scene, city.colliders, 38, SEED);
const combat = new CombatSystem(scene, city.colliders);
const police = new PoliceSystem(scene, city.colliders, rng);
const hud = new Hud();
const sound = new SoundBank();
const player = new Player(scene, city.colliders, SEED);
const world = {
  combat, traffic, police, sound,
  onEvent: handleEvent,
};
const missions = new MissionManager(scene, world);

// Parked cars to steal, lined up near the start.
const parkedSpots = [
  [8, 54, 0], [-8, -54, Math.PI], [62, -8, Math.PI / 2], [-62, 8, -Math.PI / 2],
  [8, -162, 0], [-8, 162, Math.PI],
];
for (const [x, z, h] of parkedSpots) traffic.spawnParked('sedan', x, z, h);
traffic.spawnParked('sports', -46, 108, Math.PI / 2);
traffic.spawnParked('taxi', 46, -108, -Math.PI / 2);
traffic.spawnParked('pickup', 8, 216, 0, 0x3a7a8a); // a teal pickup on the beachfront avenue

// ---- state ----
let state = 'menu'; // menu | playing | paused | busted | wasted
let camYaw = Math.PI; // looking north down the main drag
let camPitch = 0.26;
let camDist = 12;
let camPos = new THREE.Vector3(0, 8, -20);
let keys = {};
let dragging = false;
let lastDrag = 0;
let autopilot = null; // { mode: 'drive'|'foot', path: [...], wp: 0 }
let crimeCooldown = 0;
let pedKillCooldown = 0;
let nextMissionTimer = -1;
let playSeconds = 0;
let elapsed = 0; // always advances — drives the boats, even in menus/shots
let vistaCam = null; // { pos, look } while the vista screenshot is staged
let prevCarHeading = 0;
let camRoll = 0;
let menuOrbit = 0;
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

// ---- input ----
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
  if (e.code === 'KeyM') { sound.musicOn = !sound.musicOn; hud.toast(sound.musicOn ? 'Music on' : 'Music off'); }
  if (e.code === 'KeyH' && player.inCar) sound.horn();
  if (e.code === 'KeyE' && state === 'playing') enterExitCar();
  if (e.code === 'KeyT' && state === 'playing') retryMission();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('click', () => {
  sound.ensure();
  if (state === 'playing' && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    camYaw -= e.movementX * 0.0028;
    camPitch = clamp(camPitch + e.movementY * 0.0022, -0.05, 0.9);
    lastDrag = performance.now();
  } else if (dragging) {
    camYaw -= e.movementX * 0.005;
    camPitch = clamp(camPitch + e.movementY * 0.004, -0.05, 0.9);
    lastDrag = performance.now();
  }
});
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  if (e.button === 0) {
    if (document.pointerLockElement === canvas) shoot();
    else dragging = true;
  }
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('wheel', (e) => { camDist = clamp(camDist + e.deltaY * 0.01, 6, 16); }, { passive: true });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- menu buttons ----
document.getElementById('btnStart').addEventListener('click', () => startGame(null));
document.getElementById('btnContinue').addEventListener('click', () => startGame(loadSave()));
document.getElementById('btnResume').addEventListener('click', resumeGame);
document.getElementById('btnSave').addEventListener('click', () => {
  const ok = saveGame();
  hud.toast(ok ? 'Game saved' : 'Save failed');
});
document.getElementById('btnQuit').addEventListener('click', () => {
  state = 'menu';
  hud.showPause(false);
  hud.showMenu(true);
  document.exitPointerLock?.();
});
const existingSave = loadSave();
if (existingSave) document.getElementById('btnContinue').style.display = 'inline-block';

function saveGame() {
  return writeSave({
    money: player.money,
    missionIndex: missions.index,
    missionsDone: missions.completed,
    health: player.health,
    x: player.x, z: player.z,
  });
}

function startGame(save) {
  sound.ensure();
  hud.showMenu(false);
  hud.showPause(false);
  state = 'playing';
  if (save) {
    player.money = save.money;
    player.health = save.health;
    player.setPose(save.x, save.z, 0);
    missions.index = Math.min(save.missionIndex, missions.total - 1);
    missions.completed = save.missionsDone || 0;
    missions.startMission(missions.index);
    hud.toast('Save loaded — welcome back to Costa Verde');
  } else {
    player.money = 0;
    player.health = 100;
    player.setPose(10, 27, Math.PI);
    missions.startMission(0);
  }
  camYaw = Math.PI;
  camPitch = 0.26;
}

function pauseGame() {
  state = 'paused';
  document.exitPointerLock?.();
  hud.showPause(true, `Money $${player.money.toLocaleString('en-US')} · Missions done ${missions.completed} · Wanted ${police.wanted}★ · ${Math.round(playSeconds)}s in the city`);
}
function resumeGame() {
  state = 'playing';
  hud.showPause(false);
}

function retryMission() {
  if (!missions.current) return;
  if (missions.active) { hud.toast('Mission already running — finish it or fail it first'); return; }
  missions.startMission(missions.index);
  hud.toast(`Mission restarted: ${missions.current.title}`);
}

function enterExitCar() {
  if (player.inCar) {
    player.exitCar();
    hud.toast('You left the car');
    return;
  }
  const car = player.tryEnterCar(traffic);
  if (!car) return;
  const isMissionCar = car === missions.missionCar;
  const copsNear = police.nearestCopDistance(player.x, player.z) < 45;
  if (isMissionCar || copsNear) {
    police.addCrime(1);
    hud.toast(isMissionCar ? 'STOLEN — the Comet GT is yours. Lose the heat!' : 'Car stolen in front of the cops!');
  } else {
    hud.toast('Car taken — nobody saw a thing');
  }
  sound.blip(180, 0.15, 'square', 0.15);
}

function shoot() {
  if (player.inCar || state !== 'playing') return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  combat.playerShoot(origin, dir, (enemy, killed) => {
    if (killed) {
      player.money += 25;
      hud.toast('Viper down +$25');
    }
  });
  sound.gunshot();
  if (crimeCooldown <= 0) {
    crimeCooldown = 8;
    police.addCrime(1);
    peds.scare(player.x, player.z);
  }
}

function handleEvent(type, data) {
  if (type === 'mission-start') {
    hud.banner(data.title, data.brief, 4200);
    hud.setObjective(data.title, data.steps[0].text);
    sound.missionDone();
  } else if (type === 'dialogue') {
    hud.showDialogue(data);
  } else if (type === 'step') {
    hud.setObjective(missions.current.title, data.text);
    hud.toast(data.text);
  } else if (type === 'mission-done') {
    player.money += data.reward;
    hud.banner(`JOB ${missions.index + 1} OF ${missions.total} COMPLETE`, `+$${data.reward.toLocaleString('en-US')} — ${data.outro || data.title}`, 4200);
    sound.missionDone();
    saveGame();
    if (missions.index + 1 < missions.total) {
      nextMissionTimer = 4;
    } else {
      hud.banner('COSTA VERDE IS YOURS', 'Every job done. The city is yours, Rico.', 5000);
    }
  } else if (type === 'mission-fail') {
    hud.banner('MISSION FAILED', 'Press T to retry the job', 3600);
    sound.busted();
  } else if (type === 'cash') {
    player.money += data;
    hud.toast(`Cash picked up +$${data}`);
    sound.cash();
  } else if (type === 'fight-start') {
    hud.toast('Take down the Vipers!');
    sound.blip(110, 0.4, 'sawtooth', 0.2);
  } else if (type === 'heat') {
    hud.toast('The cops are onto you — run!');
  }
}

function onBusted() {
  if (state !== 'playing') return;
  state = 'busted';
  const fine = Math.floor(player.money * 0.1);
  player.money -= fine;
  hud.banner('BUSTED', `The PD took $${fine.toLocaleString('en-US')} — back to the hospital`, 3000);
  sound.busted();
  document.exitPointerLock?.();
  setTimeout(() => {
    police.clear();
    combat.clearGang();
    player.health = 100;
    if (player.inCar) player.exitCar();
    player.setPose(-181, -162, 0);
    missions.active = false;
    state = 'playing';
    hud.toast('Released. Press T to retry the job.');
  }, 3000);
}

function onWasted() {
  if (state !== 'playing') return;
  state = 'wasted';
  const fine = Math.floor(player.money * 0.1);
  player.money -= fine;
  hud.banner('WASTED', `You woke up at Costa General, $${fine.toLocaleString('en-US')} lighter`, 3000);
  sound.busted();
  document.exitPointerLock?.();
  setTimeout(() => {
    police.clear();
    combat.clearGang();
    player.health = 100;
    if (player.inCar) player.exitCar();
    player.setPose(-181, -162, 0);
    missions.active = false;
    state = 'playing';
    hud.toast('Back on your feet. Press T to retry the job.');
  }, 3000);
}

// ---- autopilot for screenshots (?shot=) ----
/** Manhattan path along the road grid: stay on road lines the whole way. */
function computeDrivePath(fromX, fromZ, toX, toZ) {
  const snap = (v) => Math.round(v / PITCH) * PITCH;
  const onVerticalRoad = (x) => Math.abs(x - snap(x)) < 0.5;
  const start = nearestRoadPoint(fromX, fromZ);
  const goal = { x: toX, z: toZ };
  let waypoints;
  if (onVerticalRoad(start.x)) {
    // ride the vertical road to the goal's horizontal road, then turn east/west
    waypoints = [start, { x: start.x, z: snap(toZ) }, { x: snap(toX), z: snap(toZ) }, goal];
  } else {
    // ride the horizontal road to the goal's vertical road, then turn north/south
    waypoints = [start, { x: snap(toX), z: start.z }, { x: snap(toX), z: snap(toZ) }, goal];
  }
  return waypoints.filter((p, i, a) => i === 0 || dist2D(p.x, p.z, a[i - 1].x, a[i - 1].z) > 4);
}

function autopilotUpdate(dt) {
  if (!autopilot || state !== 'playing') return;
  if (autopilot.mode === 'foot') {
    const s = missions.currentStep;
    if (!s) return;
    const dx = s.x - player.x, dz = s.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) return;
    const wantYaw = Math.atan2(dx, dz);
    camYaw = angleLerp(camYaw, wantYaw, clamp(dt * 4, 0, 1));
    const mz = 1, mx = 0;
    player.walk(dt, { x: mx, z: mz }, false, camYaw);
    return;
  }
  // drive mode: follow the waypoint path
  const path = autopilot.path;
  if (!path || autopilot.wp >= path.length) return;
  const target = path[autopilot.wp];
  const d = dist2D(player.x, player.z, target.x, target.z);
  if (d < 8) { autopilot.wp += 1; return; }
  const car = player.car;
  if (!car) return;
  const wantHeading = Math.atan2(target.x - car.x, target.z - car.z);
  let diff = wantHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = clamp(diff * 1.8, -1, 1);
  const throttle = Math.abs(diff) > 1.2 ? 0.25 : Math.abs(diff) > 0.6 ? 0.55 : 1;
  car.drive(dt, { throttle, steer, brake: d < 14 && autopilot.wp === path.length - 1 }, city.colliders);
  player.x = car.x; player.z = car.z; player.heading = car.heading;
}

function stageShot(name) {
  sound.ensure();
  if (name === 'start') return; // menu + orbiting camera
  hud.showMenu(false);
  state = 'playing';
  if (name === 'foot') {
    player.setPose(128, -84, Math.PI);
    missions.startMission(0);
    autopilot = { mode: 'foot' };
    camYaw = Math.PI * 0.9;
  } else if (name === 'drive') {
    const car = traffic.spawnParked('sports', 46, -100, Math.PI / 2, 0xd41e2a);
    player.setPose(46, -100, Math.PI / 2);
    player.inCar = true; player.car = car; player.body.mesh.visible = false;
    missions.startMission(1);
    missions.step = 2;
    missions.missionCar = car;
    missions.placeMarker();
    const path = computeDrivePath(46, -100, -135, -108);
    clearPathTraffic(path);
    autopilot = { mode: 'drive', path, wp: 0 };
  } else if (name === 'chase') {
    // The cover: westbound into the sunset on the Big Score, four stars, a
    // cruiser crossing ahead and the PD helicopter raking its searchlight
    // across the frame from the player's shoulder.
    const car = traffic.spawnParked('sports', 120, -100, -Math.PI / 2, 0xd41e2a);
    player.setPose(120, -100, -Math.PI / 2);
    player.inCar = true; player.car = car; player.body.mesh.visible = false;
    camYaw = -Math.PI / 2; // camera square behind the car (the autopilot never turns it)
    player.money = 2450;
    missions.startMission(5); // THE BIG SCORE
    missions.step = 1;
    missions.placeMarker();
    missions.onStepStart(); // sets wanted 3 + timer
    police.addCrime(1); // four stars: cruisers behind, helicopter overhead
    missions.timer = 12;
    camPitch = -0.02; // camera rides low, view tilts up: sky, sun, helicopter
    camDist = 14.5;
    // A two-cruiser roadblock angled across the intersection ahead — pursuit
    // the camera can actually see, not just hear behind it.
    traffic.spawnParked('police', -16, -97.5, -Math.PI / 2 + 0.35);
    traffic.spawnParked('police', -16, -118.5, -Math.PI / 2 - 0.35);
    const path = computeDrivePath(120, -100, -135, -108);
    clearPathTraffic(path);
    autopilot = { mode: 'drive', path, wp: 0 };
    // One police cruiser crossing ahead on the cross street, so the chase is in
    // the frame before it turns to pursue; the system spawns a second behind.
    const cruiser = new Car(scene, 'police');
    cruiser.setPose(-108, -216, 0);
    police.cruisers.push(cruiser);
    police.spawnTimer = 4;
  } else if (name === 'story') {
    // A story beat: Rico meets Captain Mateo Reyes at the Marina, dialogue box
    // open, the giver in his gold shirt beside the mission beacon, sea behind.
    player.setPose(-183, 155, -Math.PI / 4);
    player.money = 1200;
    missions.startMission(2); // MARINA RUN — intro dialogue plays
    camYaw = -Math.PI / 4;
    camPitch = 0.2;
    camDist = 11;
  } else if (name === 'vista') {
    // The postcard: over the water looking WNW along the coast — boats in
    // the foreground, marina piers reaching into the sea, the boardwalk and
    // beach sweeping away, the whole golden-hour skyline behind, sun in frame.
    player.setPose(30, CITY_HALF + 8, Math.PI);
    player.money = 1200;
    vistaCam = { pos: new THREE.Vector3(120, 18, CITY_HALF + 107), look: new THREE.Vector3(-140, 6, 150) };
  } else {
    player.setPose(10, 27, Math.PI);
    missions.startMission(0);
    autopilot = { mode: 'foot' };
  }
}

/** Remove traffic cars sitting on the shot's drive path, so the autopilot has
 * a clean lane and the frame shows the player's car, not a traffic jam. */
function clearPathTraffic(path) {
  for (const car of [...traffic.cars]) {
    if (!car.ai) continue;
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i], b = path[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((car.x - a.x) * dx + (car.z - a.z) * dz) / len2)) : 0;
      const px = a.x + dx * t, pz = a.z + dz * t;
      if (dist2D(car.x, car.z, px, pz) < 12) { traffic.remove(car); break; }
    }
  }
}

// ---- per-frame update ----
function update(dt) {
  playSeconds += dt;
  elapsed += dt;
  // boats ride the swell off the marina, whatever the game state
  if (city.boats) {
    city.boats.forEach((b, i) => {
      b.position.y = b.userData.baseY + Math.sin(elapsed * 0.9 + i * 1.7) * 0.22;
      b.rotation.z = Math.sin(elapsed * 0.7 + i * 1.3) * 0.045;
      b.rotation.x = Math.cos(elapsed * 0.55 + i * 2.1) * 0.03;
    });
  }
  crimeCooldown = Math.max(0, crimeCooldown - dt);
  pedKillCooldown = Math.max(0, pedKillCooldown - dt);
  if (nextMissionTimer > 0) {
    nextMissionTimer -= dt;
    if (nextMissionTimer <= 0) {
      missions.startMission(missions.index + 1);
    }
  }
  if (state !== 'playing') return;

  const driving = player.inCar && player.car;
  if (autopilot) {
    autopilotUpdate(dt);
  } else if (driving) {
    const throttle = (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0);
    const steer = (keys.KeyA || keys.ArrowLeft ? -1 : 0) + (keys.KeyD || keys.ArrowRight ? 1 : 0);
    player.car.drive(dt, { throttle, steer, brake: keys.Space }, city.colliders);
    player.x = player.car.x; player.z = player.car.z; player.heading = player.car.heading;
    // camera follows behind the car unless the player just dragged it
    if (performance.now() - lastDrag > 2500) {
      camYaw = angleLerp(camYaw, player.car.heading, clamp(dt * 1.6, 0, 1));
    }
  } else {
    const mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0);
    const mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) + (keys.KeyA || keys.ArrowLeft ? -1 : 0);
    player.walk(dt, { x: mx, z: mz }, keys.ShiftLeft || keys.ShiftRight, camYaw);
  }

  // traffic, peds, police, combat, missions
  traffic.update(dt, driving ? player.car : null, (car) => {
    if (Math.abs(player.car.speed) > 8) sound.thud();
  });
  const danger = crimeCooldown > 0 ? { x: player.x, z: player.z } : null;
  peds.update(dt, danger);
  police.update(dt, player, traffic, onBusted, null);
  combat.update(dt, { x: player.x, z: player.z }, (dmg) => {
    player.hurt(dmg);
    hud.setDamageFlash(0.7);
    if (player.health <= 0) onWasted();
  });
  missions.update(dt, player);

  // player car running over a pedestrian
  if (driving && Math.abs(player.car.speed) > 4 && pedKillCooldown <= 0) {
    const victim = peds.nearest(player.x, player.z, 2.4);
    if (victim) {
      victim.die(scene);
      pedKillCooldown = 3;
      police.addCrime(1);
      peds.scare(player.x, player.z);
      hud.toast('Pedestrian down! The cops saw that.');
      sound.thud();
    }
  }

  // audio + regen
  sound.setEngine(driving ? Math.abs(player.car.speed) / 40 : 0, driving);
  sound.setSiren(police.wanted > 0 && police.nearestCopDistance(player.x, player.z) < 60);
  sound.updateMusic();
  player.heal(dt);

  // HUD
  hud.setMoney(player.money);
  hud.setHealth(player.health);
  hud.setWanted(police.wanted);
  hud.setSpeed(driving ? Math.abs(player.car.speed) * 3.6 : 0, driving);
  hud.setCrosshair(!driving);
  const s = missions.currentStep;
  if (missions.active && s) {
    const dist = missions.objectiveDistance(player);
    const timerText = s.kind === 'timed' ? ` — ${Math.max(0, Math.ceil(150 - missions.timer))}s left` : '';
    hud.setObjective(`JOB ${missions.index + 1}/${missions.total} · ${missions.current.title}  ·  ${dist}m${timerText}`, s.text);
  } else if (!missions.active && missions.current) {
    hud.setObjective('COSTA VERDE', 'Press T to start the next job');
  }
  hud.drawMinimap(player, traffic, police, missions, city);
}

function updateCamera(dt) {
  if (state === 'menu') {
    menuOrbit += dt * 0.05;
    const cx = Math.sin(menuOrbit) * 175;
    const cz = Math.cos(menuOrbit) * 175;
    camera.position.set(cx, 48, cz);
    camera.lookAt(0, 16, 0);
    hud.drawMinimap(player, traffic, police, missions, city);
    return;
  }
  if (vistaCam) {
    // staged postcard: a slow drift over the water toward the skyline
    const drift = Math.sin(elapsed * 0.05) * 6;
    camera.position.set(vistaCam.pos.x + drift, vistaCam.pos.y, vistaCam.pos.z);
    camera.lookAt(vistaCam.look.x, vistaCam.look.y, vistaCam.look.z);
    if (Math.abs(camera.fov - 55) > 0.1) { camera.fov = 55; camera.updateProjectionMatrix(); }
    return;
  }
  const target = new THREE.Vector3(player.x, 0, player.z);
  const height = player.inCar ? 3.2 : 2.6;
  const dist = player.inCar ? camDist : camDist * 0.75;
  const desired = new THREE.Vector3(
    target.x - Math.sin(camYaw) * dist * Math.cos(camPitch),
    height + Math.sin(camPitch) * dist,
    target.z - Math.cos(camYaw) * dist * Math.cos(camPitch),
  );
  camPos.lerp(desired, clamp(dt * 6, 0, 1));
  camera.position.copy(camPos);
  camera.lookAt(target.x, target.y + 2.2, target.z);
  if (player.inCar && player.car) {
    // chase cam feel: the field of view stretches with speed, and the frame
    // leans a few degrees into every turn
    const speed01 = clamp(Math.abs(player.car.speed) / player.car.stats.top, 0, 1);
    const targetFov = 62 + speed01 * 11;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = lerp(camera.fov, targetFov, clamp(dt * 3.5, 0, 1));
      camera.updateProjectionMatrix();
    }
    let rate = player.car.heading - prevCarHeading;
    while (rate > Math.PI) rate -= Math.PI * 2;
    while (rate < -Math.PI) rate += Math.PI * 2;
    const targetRoll = clamp(-rate * 1.1, -0.055, 0.055);
    camRoll = lerp(camRoll, targetRoll, clamp(dt * 5, 0, 1));
    camera.rotateZ(camRoll);
  } else {
    prevCarHeading = player.inCar && player.car ? player.car.heading : prevCarHeading;
    if (Math.abs(camera.fov - 62) > 0.05) {
      camera.fov = lerp(camera.fov, 62, clamp(dt * 3.5, 0, 1));
      camera.updateProjectionMatrix();
    }
    camRoll = lerp(camRoll, 0, clamp(dt * 5, 0, 1));
    if (Math.abs(camRoll) > 0.001) camera.rotateZ(camRoll);
  }
  if (player.inCar && player.car) prevCarHeading = player.car.heading;
}

// ---- main loop ----
// In shot mode the renderer may run at ~2 fps under SwiftShader, so the world
// advances in fixed 1/30 s steps (up to 12 a frame) instead of wall-clock dt:
// the autopilot then covers real distance before the screenshot is taken.
let last = performance.now();
let frames = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const realDt = clamp((now - last) / 1000, 0, 1);
  last = now;
  if (SHOT) {
    const steps = Math.min(12, Math.max(1, Math.round(realDt / (1 / 30))));
    for (let i = 0; i < steps; i += 1) update(1 / 30);
    updateCamera(0.12);
  } else {
    const dt = clamp(realDt, 0, 0.05);
    update(dt);
    updateCamera(dt);
  }
  renderer.render(scene, camera);
  frames += 1;
  if (!window.__shotReady) {
    if (!SHOT) {
      if (frames === 12) window.__shotReady = true; // the playtest's load signal
    } else if (SHOT === 'chase') {
      // The cover is only ready once the chase is actually composed: the car
      // at speed, cruisers rolling and the helicopter overhead. (Wall-clock
      // waits proved unreliable — a slow first frame let the run play out
      // into a bust before the capture.)
      // Compose by position, not by clock: mid-run on the open stretch
      // (x between 45 and -10) the car is at full speed, cruisers are
      // rolling and the parked roadblock at x=-16 sits ahead in the frame.
      // The decisive test is geometric: project the helicopter into the
      // frame and fire only while its body is actually visible (upper
      // middle, clear of the objective banner) — in earlier takes it kept
      // hanging just above the top edge, only its cone raking in.
      let heliInFrame = false;
      const heli = police.helis[0];
      if (heli) {
        const hv = new THREE.Vector3(heli.x, heli.y, heli.z).project(camera);
        heliInFrame = hv.z < 1 && Math.abs(hv.x) < 0.8 && hv.y > 0.05 && hv.y < 0.78;
      }
      const composed = player.inCar && player.car && Math.abs(player.car.speed) > 24
        && heliInFrame && police.cruisers.length >= 1
        && player.x < 45 && player.x > 5;
      if (composed || frames > 900) window.__shotReady = true;
    } else if (frames === 12) {
      window.__shotReady = true;
    }
  }
}
requestAnimationFrame(loop);

// ---- boot ----
player.setPose(10, 27, Math.PI);
hud.setMoney(0);
hud.setHealth(100);
hud.setWanted(0);
hud.setObjective('COSTA VERDE', 'Welcome to the coast.');
if (SHOT) stageShot(SHOT);
window.__game = { player, missions, police, traffic, peds, combat, camera, startGame, stageShot,
  // debug handle: advance the simulation by dt seconds (used by the playtest)
  step: (dt) => { update(dt); updateCamera(dt); } };
