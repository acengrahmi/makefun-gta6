// main.js — boots Costa Verde: renderer with the golden-hour grade (ACES,
// warm fog), the city, the game systems, a third-person camera, and a
// fixed-step simulation loop decoupled from requestAnimationFrame (so
// headless staging and the playtest advance deterministically, even at the
// ~1.3 fps a headless browser manages).
//
// Scenes are staged with a #stage= hash: start | chase | story | vista |
// playtest. The first four compose the dossier screenshots; playtest exposes
// window.CV for the automated checks in playtest.mjs.

import { Input, clamp, lerpAngle } from './util.js';
import { buildCity } from './city.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';
import { loadProfile, storeProfile, wipeProfile } from './save.js';
import { Game } from './systems.js';
import { Car } from './actors.js';

const THREE = window.THREE;
const canvas = document.getElementById('game');
const stage = (location.hash.match(/stage=([a-z]+)/) || [])[1] || '';
const staged = stage !== '';
const STEP = 1 / 60;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xef9d5c, 240, 880);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1600);

const world = buildCity(scene);
const hud = new Hud();
const sound = new SoundBank({ silent: staged });
let profile = loadProfile();
const persist = () => storeProfile(profile);
const game = new Game(scene, world, { hud, sound, profile, persist });
hud.setMoney(profile.money);
hud.setWanted(0);

const input = new Input(window);

// ------------------------------------------------------------ camera rig ---
let camYaw = Math.PI / 2; // start looking west, into the sunset
let camPitch = 0.32;
let playing = !staged;    // staged scenes run without a title click
let paused = false;
let dragLook = false;

window.addEventListener('mousedown', () => { dragLook = true; });
window.addEventListener('mouseup', () => { dragLook = false; });
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!staged && !playing && (k === 'enter' || k === ' ')) startPlay(false);
  else if (!staged && !playing && k === 'x') startPlay(true);
  else if (k === 'p' && playing) { paused = !paused; hud.toast(paused ? 'Paused' : 'Resumed', 1.2); }
  else if (k === 'm') { sound.setMuted(!sound.muted); hud.toast(sound.muted ? 'Muted' : 'Sound on', 1); }
});
canvas.addEventListener('click', () => { if (!staged && !playing) startPlay(false); });

function startPlay(fresh) {
  if (fresh) {
    profile = wipeProfile();
    game.profile = profile;
    persist();
  }
  playing = true;
  hud.hideTitle();
  sound.unlock();
  hud.toast(profile.jobIndex > 0 ? 'Welcome back to Costa Verde' : 'Find Lena Cruz on the boardwalk — follow the gold pillar', 4);
}

if (!staged) {
  hud.showTitle(profile.jobIndex > 0
    ? `Click to continue — $${profile.money} · job ${Math.min(profile.jobIndex + 1, 7)} of 7${profile.raceBest ? ' · GP best ' + profile.raceBest.toFixed(1) + 's' : ''} · X for a new game`
    : 'Click to play');
}

// ------------------------------------------------------------- staging -----
let stageReady = false;
let stageSteps = 0;
const stageCam = { pos: new THREE.Vector3(60, 8, 26), look: new THREE.Vector3(-200, 3, -6) };

function stageInit() {
  const S = world.spots;
  if (stage === 'start') {
    hud.showTitle();
    game.player.pos.set(-196, 0, 10);
  } else if (stage === 'chase') {
    // The cover, posed rather than simulated (a live chase drifts out of
    // frame): camera east, then two cruisers, then the hero car fleeing
    // west into the sun, the helicopter up-left with its light on the hero.
    const hero = new Car(scene, game.rng, { kind: 'traffic', color: 0xd64541, x: 24, z: -3.0, heading: -Math.PI / 2 });
    game.traffic.push(hero);
    game.enterCar(hero);
    hero.speed = 0;
    for (const c of game.traffic) if (c !== hero) c.mesh.visible = false;
    for (const [cx, cz, ch] of [[35, -6.8, -Math.PI / 2 + 0.14], [37.5, 1.2, -Math.PI / 2 - 0.05]]) {
      const cop = new Car(scene, game.rng, { kind: 'cop', x: cx, z: cz, heading: ch });
      cop.speed = 0;
      game.cruisers.push(cop);
    }
    game.heat = 4;
    game.heli.setActive(true);
    game.frozen = true;
  } else if (stage === 'story') {
    // Mateo at the marina, mid-pitch, the sea burning behind him.
    const mateo = game.npcs.mateo;
    game.player.pos.set(S.mateo.x + 2.6, 0, S.mateo.z + 1.4);
    game.player.heading = Math.atan2(mateo.pos.x - game.player.pos.x, mateo.pos.z - game.player.pos.z);
    game.playerMesh.rotation.y = game.player.heading;
    mateo.mesh.rotation.y = Math.atan2(game.player.pos.x - mateo.pos.x, game.player.pos.z - mateo.pos.z);
    hud.showDialogue('Mateo Reyes', 'Hermano. A package waits at the end of the middle pier. No names, no questions. The sunset is cover — use it.');
  } else if (stage === 'vista') {
    game.player.pos.set(210, 0, 210); // keep the frame clean
    game.playerMesh.visible = false;
  }
}

function poseHeli() {
  // Hand-aim the helicopter for the cover: hover up-left of the hero car,
  // rotor spinning, spotlight + cone + light pool pinned to the hero.
  const heli = game.heli;
  const hero = game.player.car;
  if (!hero) return;
  heli.pos.set(13, 15, -10.5);
  heli.mesh.rotation.y = Math.atan2(hero.pos.x - heli.pos.x, hero.pos.z - heli.pos.z);
  heli.rotor.rotation.y += 0.85;
  scene.updateMatrixWorld(true);
  heli.spot.target.position.copy(heli.mesh.worldToLocal(new THREE.Vector3(hero.pos.x, 0.6, hero.pos.z)));
  const mid = new THREE.Vector3((heli.pos.x + hero.pos.x) / 2, heli.pos.y / 2, (heli.pos.z + hero.pos.z) / 2);
  heli.cone.position.copy(mid);
  heli.cone.lookAt(hero.pos.x, 0, hero.pos.z);
  heli.cone.rotateX(-Math.PI / 2);
  heli.cone.scale.y = heli.pos.y / 30;
  heli.pool.position.set(hero.pos.x, 0.25, hero.pos.z);
}

function stageTick() {
  stageSteps++;
  if (stage === 'chase') {
    poseHeli();
    if (stageSteps === 26) {
      stageCam.pos.set(44.5, 3.2, 6.5);
      stageCam.look.set(6, 2.2, -6);
      stageReady = true;
    }
  } else if (stage === 'start') {
    // Slow push-in along the boulevard toward the sunset.
    const t = Math.min(stageSteps / 150, 1);
    stageCam.pos.set(120 - t * 60, 7.5 - t * 2, 26 - t * 10);
    stageCam.look.set(-200, 3, -6);
    if (stageSteps >= 130) stageReady = true;
  } else if (stage === 'story') {
    const m = world.spots.mateo;
    stageCam.pos.set(m.x + 4.4, 1.8, m.z + 3.6);
    stageCam.look.set(m.x - 5, 1.5, m.z - 2.5);
    if (stageSteps >= 40) stageReady = true;
  } else if (stage === 'vista') {
    stageCam.pos.set(-224, 5.0, -16);
    stageCam.look.set(-600, 3, 44);
    if (stageSteps >= 40) stageReady = true;
  } else if (stage === 'playtest') {
    stageReady = true;
  }
  if (stageReady) window.__stageReady = true;
}

// ------------------------------------------------------------ main loop ----
let last = performance.now();
let acc = 0;

function stepOnce() {
  if (!paused) {
    game.update(STEP, input, camYaw);
    if (staged && stage !== 'playtest') stageTick();
    else if (stage === 'playtest') window.__stageReady = true;
  }
  input.endStep();
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 6) { stepOnce(); acc -= STEP; n++; }
  if (n === 6) acc = 0;

  // Camera.
  if (staged && stage !== 'playtest') {
    camera.position.copy(stageCam.pos);
    camera.lookAt(stageCam.look);
  } else if (!playing) {
    // Title cinematic: drift above the boulevard.
    const t = now / 1000;
    camera.position.set(90 - Math.sin(t * 0.05) * 30, 9, 30 - (t * 0.6) % 20);
    camera.lookAt(-220, 2, -10);
  } else {
    if (dragLook) camYaw -= input.consumeMouseDX() * 0.004;
    const P = game.player;
    const target = game.playerPos;
    let dist = 8, height = 3.4;
    if (P.car) {
      dist = 11; height = 4.2;
      camYaw = lerpAngle(camYaw, P.car.heading + Math.PI, clamp(dt * 2.2, 0, 1));
    }
    const cx = target.x - Math.sin(camYaw) * dist * Math.cos(camPitch);
    const cz = target.z - Math.cos(camYaw) * dist * Math.cos(camPitch);
    const cy = height + Math.sin(camPitch) * dist;
    camera.position.x += (cx - camera.position.x) * clamp(dt * 7, 0, 1);
    camera.position.y += (cy - camera.position.y) * clamp(dt * 7, 0, 1);
    camera.position.z += (cz - camera.position.z) * clamp(dt * 7, 0, 1);
    camera.lookAt(target.x, 1.6, target.z);
  }
  hud.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------- test surface ------
// Used by playtest.mjs (and only meaningful in #stage=playtest).
window.CV = {
  game, hud, world, input, profile: () => profile,
  step(n = 1) { for (let i = 0; i < n; i++) stepOnce(); },
  press(k) { input.pressedSet.add(k); input.keys.add(k); setTimeout(() => input.keys.delete(k), 30); },
  state() {
    const g = game;
    return {
      money: profile.money, jobIndex: profile.jobIndex, stars: g.stars,
      health: g.player.health, inCar: !!g.player.car, dead: g.player.dead,
      px: +g.playerPos.x.toFixed(1), pz: +g.playerPos.z.toFixed(1),
      jobStep: g.job ? g.job.stepIdx : null, jobName: g.job ? g.job.def.name : null,
      race: !!g.race, raceCp: g.race ? g.race.cpIdx : -1,
      taxi: !!g.taxi, cruisers: g.cruisers.length, footCops: g.footCops.length,
      heli: g.heli.active, dialogue: !!g.dialogue, over: g.over,
      buildings: world.buildingCount, traffic: g.traffic.length, peds: g.civilians.length,
      raceBest: profile.raceBest, fares: profile.faresDone,
    };
  },
};

if (staged) stageInit();
requestAnimationFrame(frame);
