// systems.js — the rules of Costa Verde: game state, the seven story jobs
// with their dialogue, the wanted system and police response, BUSTED/WASTED,
// the Sunset GP checkpoint race, taxi fares and hostile Vipers.

import { CENTERS, clamp, dist2 } from './util.js';
import { makePedMesh, makeVehicleMesh, spawnParked } from './actors.js';
import { loadSave } from './save.js';

export function createState() {
  const saved = loadSave();
  const state = {
    time: 0, mode: 'title', // title | play | busted | wasted | done
    cash: saved ? saved.cash : 120,
    jobIndex: saved ? saved.jobIndex : 0,
    jobStep: 0, stepData: {}, storyDone: false,
    objective: '', marker: null,
    dialogue: null,
    wanted: 0, lastCrime: -99, bust: 0,
    player: {
      x: saved ? saved.x : 6, z: saved ? saved.z : 34, heading: Math.PI,
      hp: 100, lastHurt: -99, car: null, speed: 0,
    },
    traffic: [], parked: [], police: [], peds: [], npcs: {}, vipers: [],
    heli: null, threat: { x: 0, z: 0 },
    race: { active: false, cp: 0, t: 0, checkpoints: [] },
    taxi: { phase: 'idle', ped: null, dest: null, timer: 8 },
    bestRace: saved ? saved.bestRace : 0, fares: saved ? saved.fares : 0,
    flash: null, sfx: [], saveTimer: 0, kills: 0,
  };
  if (state.jobIndex >= JOBS.length) { state.jobIndex = JOBS.length - 1; state.storyDone = true; }
  return state;
}

export function commitCrime(state, stars) {
  state.wanted = clamp(Math.max(state.wanted, stars), 0, 5);
  state.lastCrime = state.time;
}

function flash(state, text, color) { state.flash = { text, color: color || '#ffd23f', t: state.time }; }
function pay(state, amount, why) {
  state.cash += amount;
  state.sfx.push('cash');
  flash(state, `+ $${amount.toLocaleString()} — ${why}`, '#7dff6a');
}

// ---- story jobs --------------------------------------------------------------
export const JOBS = [
  {
    title: 'Welcome to Costa Verde', giver: 'lena', pay: 400,
    steps: [
      { t: 'talk', npc: 'lena', lines: [
        ['Lena Cruz', 'You must be the new wheel in town. I\'m Lena — I run sunset tours and, let\'s say, sunset errands.'],
        ['You', 'I just got in. Name your price and point me at the work.'],
        ['Lena Cruz', 'First, learn the shore. Walk the boardwalk to the middle pier and look at my city. Then come back.'],
      ] },
      { t: 'goto', x: 0, z: 296, r: 7, label: 'Reach the middle pier boardwalk' },
      { t: 'talk', npc: 'lena', lines: [
        ['Lena Cruz', 'Golden hour over the marina. Beautiful, no? Everything here is for sale at this hour — even loyalty.'],
        ['Lena Cruz', 'Good. You can follow directions. That pays $400 today and a lot more tomorrow.'],
      ] },
    ],
  },
  {
    title: 'Hot Property', giver: 'sal', pay: 800,
    steps: [
      { t: 'talk', npc: 'sal', lines: [
        ['Sal Bianchi', 'Kid, a gold Comet GT sits in my lot with somebody else\'s name on the papers. Criminal, honestly.'],
        ['Sal Bianchi', 'Take it. Drive it to my lockup by the south-west marina. Don\'t scratch the paint — the paint is the point.'],
      ] },
      { t: 'steal', id: 'comet', label: 'Steal the gold Comet GT from Sal\'s lot' },
      { t: 'driveTo', x: -196, z: 226, r: 9, label: 'Deliver the Comet GT to Sal\'s lockup' },
    ],
  },
  {
    title: 'Marina Run', giver: 'mateo', pay: 1100,
    steps: [
      { t: 'talk', npc: 'mateo', lines: [
        ['Mateo Reyes', 'Amigo! My cousin left a package at the marina office, west end of the boardwalk. The tide — and my buyer — won\'t wait.'],
        ['Mateo Reyes', 'Fetch it by car, bring it back to this pier. Fast hands, soft brakes.'],
      ] },
      { t: 'driveTo', x: -228, z: 252, r: 10, label: 'Drive to the marina office' },
      { t: 'driveTo', x: 14, z: 298, r: 10, label: 'Bring the package back to the pier parking' },
      { t: 'talk', npc: 'mateo', lines: [
        ['Mateo Reyes', '¡Perfecto! Still warm. You drive like the sunset owes you money.'],
        ['Mateo Reyes', 'Here — $1,100. The marina remembers its friends, amigo.'],
      ] },
    ],
  },
  {
    title: 'Payback Time', giver: 'sal', pay: 1500,
    steps: [
      { t: 'talk', npc: 'sal', lines: [
        ['Sal Bianchi', 'The Vipers shook down two of my drivers last night. Five of them, holed up in the north-west blocks.'],
        ['Sal Bianchi', 'Send a message they can read from the hospital. All five.'],
      ] },
      { t: 'kill', n: 5, x: -204, z: 96, label: 'Take out the 5 Vipers' },
    ],
  },
  {
    title: 'The Informant', giver: 'dana', pay: 1800,
    steps: [
      { t: 'talk', npc: 'dana', lines: [
        ['Officer Dana Ruiz', 'Off the record: my informant is pinned at the north-east corner, and Internal Affairs is circling him.'],
        ['Officer Dana Ruiz', 'Pick him up, lose the attention, and drop him at the safehouse in the south-west. Nobody sees his face. Nobody.'],
      ] },
      { t: 'goto', x: 204, z: -204, r: 8, label: 'Reach the informant' },
      { t: 'talk', npc: 'informant', lines: [
        ['The Informant', 'You\'re Ruiz\'s driver? Thank God. They photographed my car an hour ago — move, MOVE.'],
      ], crime: 2 },
      { t: 'driveTo', x: -228, z: 228, r: 10, label: 'Get the informant to the safehouse', keepWanted: true },
    ],
  },
  {
    title: 'The Big Score', giver: 'lena', pay: 2500,
    steps: [
      { t: 'talk', npc: 'lena', lines: [
        ['Lena Cruz', 'The Boulevard Bank moves its cash at sunset. Today, we move it first.'],
        ['Lena Cruz', 'Get to the bank fast — the vault window is one minute. Then run it to the east docks. Every cop in the city will object.'],
      ] },
      { t: 'timed', x: 90, z: 20, r: 9, seconds: 60, label: 'Reach the Boulevard Bank', crimeOnArrive: 3 },
      { t: 'driveTo', x: 232, z: -232, r: 11, label: 'Escape to the east docks', keepWanted: true },
    ],
  },
  {
    title: 'Sunset Showdown', giver: 'mateo', pay: 4000,
    steps: [
      { t: 'talk', npc: 'mateo', lines: [
        ['Mateo Reyes', 'The Vipers are coming for the pier at sunset, amigo. Six of them. They say Costa Verde is theirs now.'],
        ['Mateo Reyes', 'Stand with me at the west end of the boulevard. We end this where the sun goes down.'],
      ] },
      { t: 'kill', n: 6, x: -228, z: 6, label: 'Stop the 6 Vipers at the boulevard\'s west end', crime: 3 },
    ],
  },
];

const RACE_CHECKPOINTS = [
  { x: 150, z: 0 }, { x: 60, z: 0 }, { x: -60, z: 0 }, { x: -180, z: 0 },
  { x: -238, z: -60 }, { x: -120, z: -118 }, { x: 60, z: -118 }, { x: 178, z: -60 },
  { x: 226, z: 0 },
];

// ---- world population ----------------------------------------------------------
export function initActors(state, scene, city, rng) {
  const A = city.anchors;
  const npcDefs = [
    ['lena', 'Lena Cruz', A.lena, 0xff5da2], ['sal', 'Sal Bianchi', A.sal, 0x8a5fb0],
    ['mateo', 'Mateo Reyes', A.mateo, 0x4de3ff], ['dana', 'Officer Dana Ruiz', A.dana, 0x2a4a8c],
    ['informant', 'The Informant', { x: 204, z: -204 }, 0x707880],
  ];
  for (const [id, name, pos, shirt] of npcDefs) {
    const mesh = makePedMesh(rng, { shirt, marker: 0xffd23f });
    const ped = {
      mesh, x: pos.x, z: pos.z, tx: pos.x, tz: pos.z, heading: rng() * 6.28,
      speed: 0, state: 'idle', hp: 999, role: 'npc', id, name, walkPhase: 0, fleeT: 0, repick: 0,
    };
    mesh.position.set(pos.x, 0, pos.z);
    mesh.userData.markerMesh.visible = false;
    scene.add(mesh);
    state.npcs[id] = ped;
    state.peds.push(ped);
  }
  const spots = [
    { id: 'comet', kind: 'comet', color: 0xd4af37, x: A.comet.x, z: A.comet.z, heading: 0.4 },
    { x: 30, z: 252, heading: 1.57 }, { x: -60, z: -252, heading: -1.57 },
    { x: 132, z: -108, heading: 0 }, { x: -132, z: 108, heading: 3.14 },
    { x: 14, z: 298, heading: 1.57 }, { x: 200, z: 40, heading: 0 },
    { x: -40, z: -190, heading: 1.57 }, { x: 96, z: 130, heading: 0 },
  ];
  state.parked = spawnParked(scene, rng, spots);

  // objective marker pillar (gold) + race checkpoint pillar (cyan)
  const pillarGeo = new THREE.CylinderGeometry(2.2, 2.2, 42, 12, 1, true);
  state.markerMesh = new THREE.Mesh(pillarGeo, new THREE.MeshBasicMaterial({
    color: 0xffd23f, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  state.markerMesh.position.y = 21;
  scene.add(state.markerMesh);
  state.cpMesh = new THREE.Mesh(pillarGeo, new THREE.MeshBasicMaterial({
    color: 0x4de3ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  state.cpMesh.position.y = 21;
  scene.add(state.cpMesh);
  beginJob(state);
}

export function beginJob(state) {
  const job = JOBS[state.jobIndex];
  state.jobStep = 0;
  state.stepData = {};
  if (!job || state.storyDone) { state.objective = 'Free roam — race the Sunset GP or run taxi fares'; state.marker = null; return; }
  applyStep(state);
}

function applyStep(state) {
  const job = JOBS[state.jobIndex];
  const step = job.steps[state.jobStep];
  if (!step) { completeJob(state); return; }
  state.stepData = { t: step.seconds || 0, kills: 0, spawned: false };
  if (step.t === 'talk') {
    const npc = state.npcs[step.npc];
    state.objective = `Talk to ${npc ? npc.name : step.npc}`;
    state.marker = npc ? { x: npc.x, z: npc.z } : null;
    for (const id in state.npcs) state.npcs[id].mesh.userData.markerMesh.visible = id === step.npc;
  } else if (step.t === 'steal') {
    const car = state.parked.find((c) => c.id === step.id);
    state.objective = step.label;
    state.marker = car ? { x: car.x, z: car.z } : null;
  } else {
    state.objective = step.label || job.title;
    state.marker = step.x !== undefined ? { x: step.x, z: step.z } : null;
  }
}

function completeJob(state) {
  const job = JOBS[state.jobIndex];
  pay(state, job.pay, job.title);
  state.sfx.push('jobDone');
  state.jobIndex++;
  for (const id in state.npcs) state.npcs[id].mesh.userData.markerMesh.visible = false;
  if (state.jobIndex >= JOBS.length) {
    state.storyDone = true;
    state.jobIndex = JOBS.length - 1;
    flash(state, 'STORY COMPLETE — Costa Verde is yours. Free roam!', '#4de3ff');
    state.objective = 'Free roam — race the Sunset GP or run taxi fares';
    state.marker = null;
  } else {
    beginJob(state);
  }
}

function advanceStep(state) {
  state.jobStep++;
  const job = JOBS[state.jobIndex];
  if (state.jobStep >= job.steps.length) completeJob(state);
  else applyStep(state);
}

/** Player pressed interact near the current talk target. */
export function tryInteract(state) {
  if (state.dialogue) { advanceDialogue(state); return true; }
  const job = JOBS[state.jobIndex];
  if (!job || state.storyDone) return false;
  const step = job.steps[state.jobStep];
  if (!step || step.t !== 'talk') return false;
  const npc = state.npcs[step.npc];
  if (!npc) return false;
  if (dist2(state.player.x, state.player.z, npc.x, npc.z) > 4.2) return false;
  npc.heading = Math.atan2(state.player.x - npc.x, state.player.z - npc.z);
  state.dialogue = { lines: step.lines, i: 0, step };
  return true;
}

export function advanceDialogue(state) {
  const d = state.dialogue;
  if (!d) return;
  d.i++;
  state.sfx.push('pickup');
  if (d.i >= d.lines.length) {
    state.dialogue = null;
    if (d.step.crime) commitCrime(state, d.step.crime);
    advanceStep(state);
  }
}

// ---- damage ---------------------------------------------------------------------
export function damagePed(state, ped, dmg) {
  if (ped.role === 'npc') return; // story characters are bulletproof (and polite about it)
  ped.hp -= dmg;
  state.sfx.push('hit');
  if (ped.hp <= 0 && ped.state !== 'down') {
    ped.state = 'down';
    ped.mesh.rotation.x = Math.PI / 2;
    ped.mesh.position.y = 0.25;
    if (ped.role === 'viper') {
      state.kills++;
      commitCrime(state, 2);
      const job = JOBS[state.jobIndex];
      const step = job && job.steps[state.jobStep];
      if (step && step.t === 'kill') {
        state.stepData.kills++;
        flash(state, `Viper down — ${state.stepData.kills}/${step.n}`, '#ff8c42');
        if (state.stepData.kills >= step.n) advanceStep(state);
      }
    } else if (ped.role === 'cop') {
      commitCrime(state, 3);
    } else {
      commitCrime(state, 2);
      state.threat.x = ped.x; state.threat.z = ped.z;
    }
  } else if (ped.role === 'ped') {
    ped.state = 'flee'; ped.fleeT = 3;
    state.threat.x = state.player.x; state.threat.z = state.player.z;
  }
}

export function damageCar(state, car, dmg) {
  car.hp -= dmg;
  state.sfx.push('hit');
  if (car.driver === 'police') commitCrime(state, 2);
}

// ---- police management -------------------------------------------------------------
function streetPointNear(x, z, minD, maxD) {
  for (let tries = 0; tries < 12; tries++) {
    const cx = CENTERS[Math.floor(Math.random() * CENTERS.length)];
    const cz = CENTERS[Math.floor(Math.random() * CENTERS.length)];
    const px = Math.random() < 0.5 ? cx : clamp(x + (Math.random() - 0.5) * 2 * maxD, -258, 258);
    const pz = Math.random() < 0.5 ? cz : clamp(z + (Math.random() - 0.5) * 2 * maxD, -258, 258);
    const d = dist2(px, pz, x, z);
    if (d >= minD && d <= maxD) return { x: px, z: pz };
  }
  return { x: clamp(x + maxD, -258, 258), z };
}

function managePolice(state, scene, rng) {
  const wantCruisers = [0, 1, 2, 2, 3, 4][state.wanted];
  const p = state.player;
  while (state.police.length < wantCruisers) {
    const s = streetPointNear(p.x, p.z, 55, 95);
    const mesh = makeVehicleMesh('cruiser', 0x1c1e26);
    const cop = { mesh, kind: 'cruiser', x: s.x, z: s.z, heading: Math.random() * 6.28, speed: 0, driver: 'police', hp: 220 };
    mesh.position.set(s.x, 0, s.z);
    scene.add(mesh);
    state.police.push(cop);
  }
  while (state.police.length > wantCruisers) {
    const cop = state.police.pop();
    scene.remove(cop.mesh);
  }
  const wantCops = state.wanted >= 2 ? Math.min(3, state.wanted - 1) : 0;
  const footCops = state.peds.filter((pd) => pd.role === 'cop' && pd.state !== 'down');
  if (footCops.length < wantCops) {
    const s = streetPointNear(p.x, p.z, 30, 55);
    const mesh = makePedMesh(rng, { cop: true, shirt: 0x2a4a8c, pants: 0x1c2f57 });
    const cop = {
      mesh, x: s.x, z: s.z, tx: s.x, tz: s.z, heading: 0, speed: 6.3,
      state: 'walk', hp: 60, role: 'cop', walkPhase: 0, fleeT: 0, repick: 0,
    };
    mesh.position.set(s.x, 0, s.z);
    scene.add(mesh);
    state.peds.push(cop);
  } else if (footCops.length > wantCops) {
    const cop = footCops[0];
    state.peds.splice(state.peds.indexOf(cop), 1);
    scene.remove(cop.mesh);
  }
}

// ---- per-frame systems update ---------------------------------------------------------
export function updateSystems(state, scene, rng, dt) {
  const p = state.player;
  state.time += dt;

  // wanted decay: stay out of trouble and out of sight
  if (state.wanted > 0 && state.time - state.lastCrime > 16) {
    const nearCop = state.police.some((c) => dist2(c.x, c.z, p.x, p.z) < 30);
    if (!nearCop) {
      state.decayT = (state.decayT || 0) + dt;
      if (state.decayT > 6) { state.decayT = 0; state.wanted--; state.lastCrime = state.time - 10; }
    }
  }
  managePolice(state, scene, rng);

  // bust meter
  let bustPressure = false;
  if (state.wanted > 0) {
    if (!p.car) bustPressure = state.peds.some((pd) => pd.role === 'cop' && pd.state !== 'down' && dist2(pd.x, pd.z, p.x, p.z) < 2.6);
    else if (Math.abs(p.car.speed) < 2.5) bustPressure = state.police.some((c) => dist2(c.x, c.z, p.car.x, p.car.z) < 5.5);
  }
  state.bust = clamp(state.bust + (bustPressure ? dt / 2.0 : -dt / 1.2), 0, 1);
  if (state.bust >= 1 && state.mode === 'play') {
    state.mode = 'busted'; state.modeT = 0; state.sfx.push('busted');
  }

  // health regen
  if (state.time - p.lastHurt > 5 && p.hp > 0) p.hp = Math.min(100, p.hp + 2.2 * dt);
  if (p.hp <= 0 && state.mode === 'play') { state.mode = 'wasted'; state.modeT = 0; state.sfx.push('wasted'); }

  // job step checks
  const job = JOBS[state.jobIndex];
  if (job && !state.storyDone && !state.dialogue) {
    const step = job.steps[state.jobStep];
    if (step) {
      if (step.t === 'goto' && dist2(p.x, p.z, step.x, step.z) < step.r) advanceStep(state);
      else if (step.t === 'driveTo' && p.car && dist2(p.car.x, p.car.z, step.x, step.z) < step.r) advanceStep(state);
      else if (step.t === 'timed') {
        state.stepData.t -= dt;
        if (dist2(p.x, p.z, step.x, step.z) < step.r || (p.car && dist2(p.car.x, p.car.z, step.x, step.z) < step.r)) {
          if (step.crimeOnArrive) { commitCrime(state, step.crimeOnArrive); flash(state, 'That\'s the bank job done — now RUN!', '#ff5d5d'); }
          advanceStep(state);
        } else if (state.stepData.t <= 0) {
          state.stepData.t = step.seconds;
          flash(state, 'Too slow — the vault window resets. Go again!', '#ff5d5d');
          state.sfx.push('fail');
        }
      } else if (step.t === 'kill' && !state.stepData.spawned) {
        state.stepData.spawned = true;
        for (let i = 0; i < step.n; i++) {
          const mesh = makePedMesh(rng, { shirt: 0x59b06a, pants: 0x14151a });
          const vx = step.x + (rng() - 0.5) * 26, vz = step.z + (rng() - 0.5) * 26;
          const viper = {
            mesh, x: vx, z: vz, tx: vx, tz: vz, heading: rng() * 6.28, speed: 4.6,
            state: 'walk', hp: 45, role: 'viper', walkPhase: 0, fleeT: 0, repick: 0, shootT: rng() * 1.5,
          };
          mesh.position.set(vx, 0, vz);
          scene.add(mesh);
          state.peds.push(viper);
          state.vipers.push(viper);
        }
        if (step.crime) commitCrime(state, step.crime);
        flash(state, 'Vipers incoming!', '#ff5d5d');
      }
    }
  }

  // vipers hunt and shoot
  for (const v of state.vipers) {
    if (v.state === 'down') continue;
    const d = dist2(v.x, v.z, p.x, p.z);
    if (d > 11) { v.tx = p.x; v.tz = p.z; v.state = 'walk'; }
    else v.state = 'idle';
    v.shootT -= dt;
    if (d < 26 && v.shootT <= 0 && state.mode === 'play') {
      v.shootT = 1.3 + Math.random() * 0.5;
      if (Math.random() < 0.65) {
        p.hp -= 5; p.lastHurt = state.time;
        state.sfx.push('hit');
        if (p.car) p.car.hp -= 3;
      }
    }
    v.mesh.rotation.y = Math.atan2(p.x - v.x, p.z - v.z);
  }

  updateRace(state, dt);
  updateTaxi(state, scene, rng, dt);

  // marker pillar follows the current objective
  if (state.markerMesh) {
    if (state.marker && !state.race.active) {
      state.markerMesh.visible = true;
      state.markerMesh.position.x = state.marker.x;
      state.markerMesh.position.z = state.marker.z;
    } else state.markerMesh.visible = false;
  }
  if (state.cpMesh) {
    if (state.race.active) {
      const cp = state.race.checkpoints[state.race.cp];
      state.cpMesh.visible = true;
      state.cpMesh.position.x = cp.x; state.cpMesh.position.z = cp.z;
    } else state.cpMesh.visible = false;
  }

  // periodic save
  state.saveTimer -= dt;
  if (state.saveTimer <= 0) { state.saveTimer = 5; state.dirty = true; }
}

// ---- race ----------------------------------------------------------------------------
export function startRace(state) {
  state.race.active = true;
  state.race.cp = 0;
  state.race.t = 0;
  state.race.checkpoints = RACE_CHECKPOINTS;
  flash(state, 'SUNSET GP — follow the cyan pillars!', '#4de3ff');
  state.sfx.push('checkpoint');
}

function updateRace(state, dt) {
  const r = state.race;
  if (!r.active) return;
  r.t += dt;
  const p = state.player;
  const cp = r.checkpoints[r.cp];
  const px = p.car ? p.car.x : p.x, pz = p.car ? p.car.z : p.z;
  if (dist2(px, pz, cp.x, cp.z) < 11) {
    state.sfx.push('checkpoint');
    r.cp++;
    if (r.cp >= r.checkpoints.length) {
      r.active = false;
      const t = Math.round(r.t * 10) / 10;
      let bonus = '';
      if (!state.bestRace || t < state.bestRace) { state.bestRace = t; bonus = ' New best time!'; }
      pay(state, 600, `Sunset GP — ${t}s.${bonus}`);
    } else {
      flash(state, `Checkpoint ${r.cp}/${r.checkpoints.length - 1} — ${(Math.round(r.t * 10) / 10)}s`, '#4de3ff');
    }
  }
}

// ---- taxi -------------------------------------------------------------------------------
function updateTaxi(state, scene, rng, dt) {
  const tx = state.taxi;
  const p = state.player;
  if (tx.phase === 'idle') {
    tx.timer -= dt;
    if (tx.timer <= 0 && state.mode === 'play') {
      const a = rng() * Math.PI * 2, d = 55 + rng() * 45;
      const fx = clamp(p.x + Math.sin(a) * d, -258, 258), fz = clamp(p.z + Math.cos(a) * d, -258, 258);
      const mesh = makePedMesh(rng, { marker: 0xffe95d });
      const ped = {
        mesh, x: fx, z: fz, tx: fx, tz: fz, heading: rng() * 6.28, speed: 0,
        state: 'idle', hp: 30, role: 'fare-wait', walkPhase: 0, fleeT: 0, repick: 0,
      };
      mesh.position.set(fx, 0, fz);
      scene.add(mesh);
      state.peds.push(ped);
      tx.ped = ped; tx.phase = 'pickup';
      flash(state, 'A fare is waiting nearby — check the minimap', '#ffe95d');
    }
  } else if (tx.phase === 'pickup') {
    const ped = tx.ped;
    if (!ped || ped.state === 'down') { tx.phase = 'idle'; tx.timer = 25; tx.ped = null; return; }
    if (p.car && dist2(p.car.x, p.car.z, ped.x, ped.z) < 5.5 && Math.abs(p.car.speed) < 3) {
      ped.role = 'fare-ride';
      ped.mesh.visible = false;
      const a = rng() * Math.PI * 2, d = 160 + rng() * 160;
      tx.dest = { x: clamp(p.x + Math.sin(a) * d, -250, 250), z: clamp(p.z + Math.cos(a) * d, -250, 290) };
      tx.phase = 'dropoff';
      state.objective = 'Taxi: drive your fare to the gold marker';
      state.marker = tx.dest;
      state.sfx.push('pickup');
      flash(state, 'Fare aboard — go!', '#ffe95d');
    }
  } else if (tx.phase === 'dropoff') {
    if (p.car && dist2(p.car.x, p.car.z, tx.dest.x, tx.dest.z) < 9 && Math.abs(p.car.speed) < 3) {
      const ped = tx.ped;
      const fare = Math.round(25 + dist2(ped.x, ped.z, tx.dest.x, tx.dest.z) * 0.35);
      if (ped) {
        ped.role = 'ped'; ped.state = 'walk';
        ped.x = p.car.x + 3; ped.z = p.car.z + 3;
        ped.mesh.visible = true;
        if (ped.mesh.userData.markerMesh) ped.mesh.userData.markerMesh.visible = false;
      }
      state.fares++;
      pay(state, fare, 'Taxi fare');
      tx.phase = 'idle'; tx.timer = 18 + rng() * 20; tx.ped = null; tx.dest = null;
      // restore the story objective/marker
      state.objective = ''; state.marker = null;
      const job = JOBS[state.jobIndex];
      if (job && !state.storyDone) {
        const step = job.steps[state.jobStep];
        if (step) {
          state.objective = step.t === 'talk' ? `Talk to ${state.npcs[step.npc]?.name || step.npc}` : (step.label || job.title);
          if (step.t === 'talk') { const n = state.npcs[step.npc]; state.marker = n ? { x: n.x, z: n.z } : null; }
          else if (step.x !== undefined) state.marker = { x: step.x, z: step.z };
        }
      }
    }
  }
}

export function raceStartPoint() { return { x: 226, z: 0 }; }
