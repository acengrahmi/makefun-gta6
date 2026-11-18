// systems.js — the game itself: player control on foot and in cars, the
// five-star wanted system with cruiser/foot-cop/helicopter response, pistol
// combat, BUSTED and hospital outcomes, the seven story jobs, the Sunset GP
// checkpoint race and taxi fares. Rendering lives in city/actors/hud; this
// file is state and rules.

import { clamp, lerp, lerpAngle, makeRng, rand, pick, dist2d } from './util.js';
import { collide } from './city.js';
import { Walker, Car, Helicopter, makePerson } from './actors.js';

const T = () => window.THREE;

// A glowing objective pillar you can see across the city.
function makeMarker(color = 0xffd23e) {
  const THREE = T();
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 13;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.16, 8, 24),
    new THREE.MeshBasicMaterial({ color, fog: false }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3;
  g.add(beam, ring);
  g.userData = { beam, ring };
  return g;
}

const JOBS = [
  {
    name: 'Welcome to Costa Verde', giver: 'lena', pay: 400,
    intro: [
      ['Lena Cruz', 'You made it! Welcome to Costa Verde, baby. Sun, sea, and money that moves fast.'],
      ['Lena Cruz', 'First rule: wheels. Take any car you like — this city forgives everything but walking.'],
      ['Lena Cruz', 'Drive me to the Hotel Sol, north side. Try not to scratch the paint.'],
    ],
    steps: [
      { type: 'driveTo', at: 'hotel', r: 7, label: 'Drive Lena to the Hotel Sol' },
    ],
    done: 'Lena tips you for the smooth ride.',
  },
  {
    name: 'Hot Property', giver: 'sal', pay: 800,
    intro: [
      ['Sal Bianchi', 'Kid. A Comet GT just landed in the south-west lot. Teal. Very stealable.'],
      ['Sal Bianchi', 'Bring it to my garage. If the cops notice — and they will — lose them after, not before.'],
    ],
    steps: [
      { type: 'goto', at: 'comet', r: 6, label: 'Go to the parking lot in the south-west' },
      { type: 'steal', label: 'Steal the Comet GT' },
      { type: 'driveCarTo', at: 'garage', r: 8, label: 'Deliver the Comet GT to Sal’s garage' },
    ],
    done: 'Sal grins at the Comet like it owes him money. It does now.',
  },
  {
    name: 'Marina Run', giver: 'mateo', pay: 1100,
    intro: [
      ['Mateo Reyes', 'Hermano. A package waits at the end of the middle pier. No names, no questions.'],
      ['Mateo Reyes', 'Pick it up, then drop it at Marina Freight, east side. The sunset is cover — use it.'],
    ],
    steps: [
      { type: 'goto', at: 'pierEnd', r: 5, label: 'Pick up the package at the end of the middle pier', foot: true },
      { type: 'driveTo', at: 'warehouse', r: 8, label: 'Deliver the package to Marina Freight' },
    ],
    done: 'The warehouse door closes. Mateo pays in clean bills.',
  },
  {
    name: 'Payback Time', giver: 'lena', pay: 1500,
    intro: [
      ['Lena Cruz', 'The Vipers jumped my cousin in their alley off the boulevard. Five of them. Green bandanas.'],
      ['Lena Cruz', 'Send a message, love. A loud one.'],
    ],
    steps: [
      { type: 'goto', at: 'alley', r: 9, label: 'Go to the Vipers alley' },
      { type: 'fight', count: 5, label: 'Take down the Vipers (0/5)' },
    ],
    done: 'The alley is quiet. Lena’s cousin can walk home again.',
  },
  {
    name: 'The Informant', giver: 'dana', pay: 1800,
    intro: [
      ['Officer Dana Ruiz', 'Off the record: a briefcase in Verde Park has names my captain would bury.'],
      ['Officer Dana Ruiz', 'Bring it to me here. And keep your stars at zero — I can’t be seen with a headline.'],
    ],
    steps: [
      { type: 'goto', at: 'park', r: 6, label: 'Retrieve the briefcase in Verde Park', foot: true },
      { type: 'goto', at: 'dana', r: 5, label: 'Bring the briefcase back to Officer Ruiz' },
    ],
    done: 'Dana slips the briefcase into her cruiser. “You never saw me.”',
  },
  {
    name: 'The Big Score', giver: 'sal', pay: 2500,
    intro: [
      ['Sal Bianchi', 'Banco Verde, east side. A cash van leaves its doors open for exactly one careless minute.'],
      ['Sal Bianchi', 'Grab the bags, then get to the old hideout in the far south-west. Clock’s running — and so are the cops.'],
    ],
    steps: [
      { type: 'goto', at: 'bank', r: 7, label: 'Hit the cash van at Banco Verde', setsWanted: 3 },
      { type: 'driveTo', at: 'hideout', r: 8, label: 'Reach the hideout!', timed: 120 },
    ],
    done: 'Sirens fade behind the hideout door. Biggest payday yet.',
  },
  {
    name: 'Sunset Showdown', giver: 'mateo', pay: 4000,
    intro: [
      ['Mateo Reyes', 'The Vipers want the boulevard tonight. All of them. And the cops will come watch the fireworks.'],
      ['Mateo Reyes', 'East end of Sunset Boulevard, hermano. End this, and Costa Verde is yours.'],
    ],
    steps: [
      { type: 'goto', at: 'raceStart', r: 9, label: 'Go to the east end of the boulevard' },
      { type: 'fight', count: 8, label: 'Survive the Sunset Showdown (0/8)', wanted: 2 },
    ],
    done: 'The boulevard is yours. Costa Verde sleeps — and so, finally, do you.',
  },
];

const NPC_DEFS = {
  lena: { name: 'Lena Cruz', color: 0xff5da2, spot: 'lena' },
  sal: { name: 'Sal Bianchi', color: 0x39d0ff, spot: 'garage', at: { x: 128, z: 56 } },
  mateo: { name: 'Mateo Reyes', color: 0xffd23e, spot: 'mateo' },
  dana: { name: 'Officer Dana Ruiz', color: 0x5e9dff, spot: 'dana', cop: true },
};

export class Game {
  constructor(scene, world, { hud, sound, profile, persist }) {
    this.scene = scene;
    this.world = world;
    this.spots = world.spots;
    this.colliders = world.colliders;
    this.hud = hud;
    this.sound = sound;
    this.profile = profile;
    this.persist = persist;
    this.rng = makeRng(777);
    const THREE = T();

    // --- player ---
    this.playerMesh = makePerson(this.rng, { shirt: 0xff7847, pants: 0x2e3a55 });
    scene.add(this.playerMesh);
    this.player = {
      pos: this.playerMesh.position, heading: Math.PI / 2, speed: 0,
      health: 100, car: null, dead: false, lastHurt: -99, animT: 0,
    };
    this.player.pos.set(this.spots.playerSpawn.x, 0, this.spots.playerSpawn.z);

    // --- population ---
    this.civilians = [];
    for (let i = 0; i < 44; i++) {
      const w = new Walker(scene, this.rng, {
        x: rand(this.rng, -240, 240), z: rand(this.rng, -245, 245),
      });
      if (!this.isWalkable(w.pos.x, w.pos.z)) { w.pos.x = -233; w.pos.z = rand(this.rng, -200, 200); }
      this.civilians.push(w);
    }
    this.traffic = [];
    for (let i = 0; i < 20; i++) {
      const onX = this.rng() < 0.5;
      const line = Math.floor(rand(this.rng, -4, 5)) * 54;
      const car = new Car(scene, this.rng, {
        x: onX ? rand(this.rng, -220, 220) : line + 3.4,
        z: onX ? line - 3.4 : rand(this.rng, -220, 220),
        heading: onX ? Math.PI / 2 : 0,
      });
      this.traffic.push(car);
    }
    // The Comet GT, parked and waiting to be stolen.
    this.comet = new Car(scene, this.rng, { kind: 'comet', x: this.spots.comet.x, z: this.spots.comet.z, heading: 0.4 });
    this.comet.parked = true;

    // NPCs stand at their spots.
    this.npcs = {};
    for (const [key, def] of Object.entries(NPC_DEFS)) {
      const at = def.at ?? this.spots[def.spot];
      const w = new Walker(scene, this.rng, {
        x: at.x, z: at.z, mode: 'stand', shirt: def.color, cop: !!def.cop, hp: 9999,
      });
      w.isNpc = key;
      this.npcs[key] = w;
    }

    // --- police ---
    this.cruisers = [];
    this.footCops = [];
    this.heli = new Helicopter(scene);
    this.heat = 0;               // 0..5 float; stars = ceil
    this.lastCrime = -99;
    this.bustedT = 0;
    this.copSpawnCd = 0;
    this.footSpawnCd = 0;

    // --- jobs / race / taxi ---
    this.job = null;             // { def, stepIdx, fightLeft, timer }
    this.dialogue = null;        // { lines, idx, onDone }
    this.race = null;            // { cpIdx, t, checkpoints }
    this.taxi = null;            // { passenger, dest, fare }
    this.waitingFares = [];
    this.fareTimer = 4;

    // Markers (one gold job marker, one green race marker).
    this.jobMarker = makeMarker(0xffd23e);
    this.jobMarker.visible = false;
    scene.add(this.jobMarker);
    this.raceMarker = makeMarker(0x7dff5e);
    this.raceMarker.visible = false;
    scene.add(this.raceMarker);
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffcf6e, transparent: true, opacity: 0, fog: false }));
    scene.add(this.muzzle);
    this.muzzleT = 0;
    this.time = 0;
    this.shotCd = 0;
    this.frozen = false; // staged screenshots pose the world and freeze play
    this.over = false; // campaign complete
    if (this.profile.jobIndex >= 7) this.over = true;
  }

  get stars() { return this.heat <= 0.02 ? 0 : Math.min(5, Math.ceil(this.heat)); }
  get playerPos() { return this.player.car ? this.player.car.pos : this.player.pos; }

  isWalkable(x, z) {
    // Rough "not inside a building": reuse colliders with a small probe.
    for (const c of this.colliders) {
      if (Math.abs(x - c.x) < c.hx + 0.4 && Math.abs(z - c.z) < c.hz + 0.4) return false;
    }
    return true;
  }

  // ------------------------------------------------------------- crime ---
  reportCrime(points, at) {
    // A crime only counts if someone could plausibly see it — or it's huge.
    let witnessed = points >= 2.5;
    if (!witnessed) {
      for (const w of this.civilians) if (!w.dead && dist2d(w.pos.x, w.pos.z, at.x, at.z) < 34) { witnessed = true; break; }
      if (!witnessed) for (const c of this.cruisers) if (dist2d(c.pos.x, c.pos.z, at.x, at.z) < 46) witnessed = true;
    }
    if (!witnessed) return;
    this.heat = Math.min(5, this.heat + points);
    this.lastCrime = this.time;
  }

  addMoney(n, why) {
    this.profile.money = Math.max(0, this.profile.money + n);
    this.profile.totalEarned += Math.max(0, n);
    this.hud.setMoney(this.profile.money);
    if (n > 0) { this.sound.cash(); if (why) this.hud.toast(why + '  +' + '$' + n); }
    this.persist();
  }

  // ------------------------------------------------------------ update ---
  update(dt, input, camYaw) {
    this.time += dt;
    if (this.frozen) {
      // Posed still: ambient life only — pedestrians stroll, water moves,
      // the HUD stays honest. No traffic AI, no police, no player physics.
      for (const w of this.civilians) w.update(dt, this.colliders);
      for (const n of Object.values(this.npcs)) n.update(dt, this.colliders);
      this.world.update(dt, this.time);
      this.hud.setWanted(this.stars);
      this.hud.setHealth(this.player.health / 100);
      this.hud.setMoney(this.profile.money);
      return;
    }
    const P = this.player;
    this.shotCd -= dt;
    if (this.muzzleT > 0) { this.muzzleT -= dt; this.muzzle.material.opacity = Math.max(0, this.muzzleT / 0.07); }

    // Dialogue freezes the world interaction, not the world.
    if (this.dialogue) {
      if (input.pressed('e') || input.mousePressed) this.advanceDialogue();
    } else if (!P.dead) {
      this.updatePlayer(dt, input, camYaw);
      this.checkInteract(input);
    }

    this.updateJobs(dt);
    this.updateRace(dt);
    this.updateTaxi(dt);
    for (const w of this.civilians) w.update(dt, this.colliders);
    for (const n of Object.values(this.npcs)) n.update(dt, this.colliders);
    const obstacles = [...this.traffic, ...this.cruisers, this.comet];
    if (P.car && !obstacles.includes(P.car)) obstacles.push(P.car);
    for (const c of this.traffic) if (c !== P.car) c.updateTraffic(dt, this.colliders, obstacles);
    this.updatePolice(dt, obstacles);
    this.updateFighters(dt);
    this.heli.update(dt, this.time, this.playerPos);
    this.world.update(dt, this.time);

    // Wanted decay: unseen + no fresh crime -> heat bleeds off.
    const seen = this.copSeesPlayer();
    if (this.time - this.lastCrime > 9 && !seen) this.heat = Math.max(0, this.heat - dt * 0.045);
    if (this.heat < 0.02 && this.stars === 0) this.heat = 0;

    // Health regen after a quiet spell.
    if (!P.dead && P.health > 0 && this.time - P.lastHurt > 6) {
      P.health = Math.min(100, P.health + dt * 4);
    }

    // HUD + audio state.
    this.hud.setWanted(this.stars);
    this.hud.setHealth(P.health / 100);
    this.hud.setMoney(this.profile.money);
    const driving = !!P.car;
    this.sound.setEngine(driving, driving ? Math.abs(P.car.speed) / 28 : 0);
    this.sound.setSiren(this.stars > 0 && this.cruisers.length > 0, this.time);
    this.drawHudExtras();
  }

  copSeesPlayer() {
    const pp = this.playerPos;
    for (const c of this.cruisers) if (dist2d(c.pos.x, c.pos.z, pp.x, pp.z) < 36) return true;
    for (const c of this.footCops) if (!c.dead && dist2d(c.pos.x, c.pos.z, pp.x, pp.z) < 30) return true;
    return false;
  }

  // ------------------------------------------------------------ player ---
  updatePlayer(dt, input, camYaw) {
    const P = this.player;
    if (P.car) {
      const car = P.car;
      const fwd = (input.down('w') || input.down('arrowup') ? 1 : 0) - (input.down('s') || input.down('arrowdown') ? 1 : 0);
      const steerIn = (input.down('a') || input.down('arrowleft') ? 1 : 0) - (input.down('d') || input.down('arrowright') ? 1 : 0);
      const maxF = car.kind === 'comet' ? 31 : 25;
      if (fwd > 0) car.speed += 15 * dt * (1 - Math.max(0, car.speed) / maxF);
      else if (fwd < 0) car.speed -= (car.speed > 0.5 ? 24 : 8) * dt * (car.speed > 0.5 ? 1 : (1 - Math.abs(car.speed) / 9));
      else car.speed -= car.speed * dt * 0.7;
      if (input.down(' ')) car.speed -= car.speed * dt * 2.6;
      car.speed = clamp(car.speed, -9, maxF);
      const steerRate = steerIn * clamp(Math.abs(car.speed), 0, 12) * 0.055 * Math.sign(car.speed || 1);
      car.heading += steerRate * dt * 4.2;
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      collide(car.pos, 1.7, this.colliders);
      // Car vs car: soft push-apart.
      for (const o of [...this.traffic, ...this.cruisers, this.comet]) {
        if (o === car) continue;
        const d = dist2d(car.pos.x, car.pos.z, o.pos.x, o.pos.z);
        if (d < 3.6 && d > 0.001) {
          const push = (3.6 - d) / 2;
          const nx = (car.pos.x - o.pos.x) / d, nz = (car.pos.z - o.pos.z) / d;
          car.pos.x += nx * push; car.pos.z += nz * push;
          o.pos.x -= nx * push; o.pos.z -= nz * push;
          o.mesh.rotation.y = o.heading;
          if (Math.abs(car.speed) > 12 && o.kind === 'cop') this.reportCrime(0.6, car.pos);
          car.speed *= 0.82;
        }
      }
      // Running someone down is very much a crime.
      for (const w of [...this.civilians, ...this.footCops]) {
        if (w.dead) continue;
        if (Math.abs(car.speed) > 4 && dist2d(car.pos.x, car.pos.z, w.pos.x, w.pos.z) < 2.1) {
          if (w.hit(999)) {
            this.reportCrime(w.isCop ? 2.2 : 1.8, car.pos);
            this.hud.toast(w.isCop ? 'You ran down an officer!' : 'You ran someone down!');
            car.speed *= 0.55;
          }
        }
      }
      car.mesh.rotation.y = car.heading;
      const wheels = car.mesh.userData.wheels;
      if (wheels) for (const wh of wheels) wh.rotation.x += car.speed * dt * 2.6;
      // Park the avatar in the driver's seat (hidden: cleaner in chase cam).
      P.pos.copy(car.pos);
      P.heading = car.heading;
      // E exits — unless we are idling at the Sunset GP start, where E
      // starts the race instead (checkInteract handles it).
      const atRaceStart = !this.race && dist2d(car.pos.x, car.pos.z, this.spots.raceStart.x, this.spots.raceStart.z) < 8;
      if (!atRaceStart && input.pressed('e')) this.exitCar();
      if ((input.pressed('f') || input.mouseDown) && this.shotCd <= 0) this.shoot(car.heading);
      return;
    }
    // On foot.
    const ix = input.axis('a', 'd') + input.axis('arrowleft', 'arrowright');
    const iz = input.axis('s', 'w') + input.axis('arrowdown', 'arrowup');
    const moving = ix !== 0 || iz !== 0;
    const run = input.down('shift');
    const speed = run ? 7.2 : 4.3;
    if (moving) {
      const ang = Math.atan2(ix, iz) + camYaw;
      P.heading = lerpAngle(P.heading, ang, clamp(dt * 12, 0, 1));
      P.pos.x += Math.sin(P.heading) * speed * dt;
      P.pos.z += Math.cos(P.heading) * speed * dt;
      P.speed = speed;
      P.animT += dt * (run ? 11 : 8);
    } else { P.speed = 0; P.animT += dt * 1.6; }
    collide(P.pos, 0.45, this.colliders);
    this.playerMesh.rotation.y = P.heading;
    const parts = this.playerMesh.userData.parts;
    const sw = Math.sin(P.animT) * (moving ? 0.6 : 0.04);
    parts.legL.rotation.x = sw; parts.legR.rotation.x = -sw;
    parts.armL.rotation.x = -sw * 0.7;
    parts.armR.rotation.x = (input.mouseDown || input.down('f')) ? -1.35 : sw * 0.7;
    if ((input.pressed('f') || input.mousePressed) && this.shotCd <= 0) this.shoot(P.heading);
  }

  enterCar(car) {
    const P = this.player;
    P.car = car;
    car.parked = false;
    this.playerMesh.visible = false;
    this.sound.door();
    if (car === this.comet && this.job?.def === JOBS[1] && this.job.stepIdx === 1) {
      this.reportCrime(1.2, car.pos);
      this.hud.toast('The owner saw that. The city knows.');
      this.advanceJob();
    } else if (car.kind === 'traffic') {
      this.reportCrime(0.8, car.pos);
    }
    if (this.taxi && !this.taxi.passenger) { /* fares need your own ride; fine */ }
  }

  exitCar() {
    const P = this.player;
    if (!P.car) return;
    const car = P.car;
    P.car = null;
    car.speed = 0;
    P.pos.set(car.pos.x + Math.cos(car.heading) * 2.2, 0, car.pos.z - Math.sin(car.heading) * 2.2);
    collide(P.pos, 0.45, this.colliders);
    this.playerMesh.visible = true;
    this.sound.door();
  }

  shoot(heading) {
    const P = this.player;
    this.shotCd = 0.24;
    this.sound.shot();
    const from = this.playerPos;
    this.muzzle.position.set(from.x + Math.sin(heading) * 0.7, 1.35, from.z + Math.cos(heading) * 0.7);
    this.muzzleT = 0.07;
    this.muzzle.material.opacity = 0.95;
    // Everyone nearby panics; crime if witnessed.
    for (const w of this.civilians) if (!w.dead && dist2d(w.pos.x, w.pos.z, from.x, from.z) < 17) w.panic(from);
    this.reportCrime(0.7, from);
    // Hitscan: nearest shootable within a narrow cone, 34 range.
    let best = null, bestD = 34;
    const targets = [...this.footCops, ...this.fighters(), ...this.civilians];
    for (const w of targets) {
      if (w.dead || w.isNpc) continue;
      const d = dist2d(w.pos.x, w.pos.z, from.x, from.z);
      if (d > bestD || d < 0.8) continue;
      const ang = Math.atan2(w.pos.x - from.x, w.pos.z - from.z);
      let diff = Math.abs(ang - heading) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < 0.16 + 0.5 / Math.max(d, 1)) { best = w; bestD = d; }
    }
    if (best) {
      const killed = best.hit(best.isCop ? 34 : 30);
      this.sound.hit();
      if (killed) {
        this.reportCrime(best.isCop ? 2.4 : 1.6, from);
        if (this.job && this.job.fightSet && this.job.fightSet.has(best)) {
          this.job.fightSet.delete(best);
          const left = this.job.fightSet.size;
          const total = this.job.def.steps[this.job.stepIdx].count;
          this.hud.setObjective(this.job.def.steps[this.job.stepIdx].label.replace(/\(\d+\/\d+\)/, `(${total - left}/${total})`));
          if (left === 0) this.advanceJob();
        }
      }
    }
  }

  fighters() { return this.job?.fightSet ? [...this.job.fightSet] : []; }

  hurtPlayer(dmg) {
    const P = this.player;
    if (P.dead) return;
    P.health -= dmg;
    P.lastHurt = this.time;
    if (P.health <= 0) {
      P.health = 0;
      P.dead = true;
      this.hud.banner('WASTED', 'You wake up at the hospital', 3);
      this.sound.fail();
      setTimeout(() => this.respawn(true), 1400);
    }
  }

  respawn(wasted) {
    const P = this.player;
    if (P.car) { P.car = null; this.playerMesh.visible = true; }
    const fee = wasted ? Math.floor(this.profile.money * 0.10) : Math.min(150, this.profile.money);
    this.profile.money -= fee;
    if (wasted) this.profile.timesBusted += 0; else this.profile.timesBusted += 1;
    P.pos.set(this.spots.hospital.x, 0, this.spots.hospital.z);
    P.health = 100;
    P.dead = false;
    this.heat = 0;
    this.bustedT = 0;
    // Police stand down.
    for (const c of this.cruisers) this.scene.remove(c.mesh);
    this.cruisers = [];
    for (const c of this.footCops) this.scene.remove(c.mesh);
    this.footCops = [];
    this.heli.setActive(false);
    this.persist();
  }

  busted() {
    const P = this.player;
    P.dead = true;
    this.hud.banner('BUSTED', 'The Verde PD thanks you for your donation', 3);
    this.sound.busted();
    setTimeout(() => this.respawn(false), 1400);
  }

  // ------------------------------------------------------------ police ---
  updatePolice(dt, obstacles) {
    const P = this.player;
    const stars = this.stars;
    const pp = this.playerPos;
    this.copSpawnCd -= dt;
    this.footSpawnCd -= dt;
    const wantCars = [0, 1, 2, 2, 3, 4][stars];
    if (this.cruisers.length < wantCars && this.copSpawnCd <= 0) {
      this.copSpawnCd = 2.2;
      // Spawn on a street 65–100 away.
      const ang = rand(this.rng, 0, Math.PI * 2);
      const sx = clamp(pp.x + Math.sin(ang) * rand(this.rng, 65, 100), -228, 228);
      const sz = clamp(pp.z + Math.cos(ang) * rand(this.rng, 65, 100), -228, 228);
      const car = new Car(this.scene, this.rng, { kind: 'cop', x: sx, z: sz, heading: rand(this.rng, 0, 6.28) });
      this.cruisers.push(car);
    }
    if (stars === 0) {
      // Stand down: cruisers leave and despawn far away.
      for (let i = this.cruisers.length - 1; i >= 0; i--) {
        const c = this.cruisers[i];
        c.drive(dt, { x: c.pos.x + Math.sin(c.heading) * 40, z: c.pos.z + Math.cos(c.heading) * 40 }, 12, this.colliders, null);
        if (dist2d(c.pos.x, c.pos.z, pp.x, pp.z) > 130) { this.scene.remove(c.mesh); this.cruisers.splice(i, 1); }
      }
    } else {
      for (const c of this.cruisers) if (c !== P.car) c.updateCop(dt, this.colliders, obstacles, pp);
      // Foot cops pile out when close.
      const wantFoot = stars >= 2 ? Math.min(4, stars) : 0;
      if (this.footCops.filter((f) => !f.dead).length < wantFoot && this.footSpawnCd <= 0) {
        const near = this.cruisers.find((c) => dist2d(c.pos.x, c.pos.z, pp.x, pp.z) < 15);
        if (near) {
          this.footSpawnCd = 3;
          const cop = new Walker(this.scene, this.rng, { x: near.pos.x + 2, z: near.pos.z + 1, mode: 'fight', cop: true, hp: 45 });
          cop.isCop = true;
          this.footCops.push(cop);
        }
      }
    }
    this.heli.setActive(stars >= 3);
    // Foot cop behaviour (shared fighter update below covers shooting).
    // Busted check.
    if (!P.dead && stars > 0) {
      const pSpeed = P.car ? Math.abs(P.car.speed) : P.speed;
      let close = false;
      for (const c of this.footCops) if (!c.dead && dist2d(c.pos.x, c.pos.z, pp.x, pp.z) < 5.5) close = true;
      if (!P.car) for (const c of this.cruisers) if (dist2d(c.pos.x, c.pos.z, pp.x, pp.z) < 5) close = true;
      if (close && pSpeed < 1.6) {
        this.bustedT += dt;
        this.hud.setHint('THE POLICE ARE ON YOU — RUN!');
        if (this.bustedT > 1.7) this.busted();
      } else this.bustedT = Math.max(0, this.bustedT - dt * 1.5);
    }
  }

  // Fighters: foot cops + job gang members. They close in and shoot.
  updateFighters(dt) {
    const pp = this.playerPos;
    const combatants = [...this.footCops, ...this.fighters()];
    for (const w of combatants) {
      if (w.dead) continue;
      w.update(dt, this.colliders); // anim only in fight mode
      const d = dist2d(w.pos.x, w.pos.z, pp.x, pp.z);
      // Foot cops stand down and jog off when the heat is gone.
      if (w.isCop && this.stars === 0) {
        const away = Math.atan2(w.pos.x - pp.x, w.pos.z - pp.z);
        w.heading = lerpAngle(w.heading, away, clamp(dt * 6, 0, 1));
        w.pos.x += Math.sin(w.heading) * 4 * dt;
        w.pos.z += Math.cos(w.heading) * 4 * dt;
        w.speed = 4;
        w.mesh.rotation.y = w.heading;
        continue;
      }
      const parts = w.mesh.userData.parts;
      parts.armR.rotation.x = -1.35;
      if (d > 15) {
        const ang = Math.atan2(pp.x - w.pos.x, pp.z - w.pos.z);
        w.heading = lerpAngle(w.heading, ang, clamp(dt * 6, 0, 1));
        w.pos.x += Math.sin(w.heading) * 3.4 * dt;
        w.pos.z += Math.cos(w.heading) * 3.4 * dt;
        collide(w.pos, 0.45, this.colliders);
        w.speed = 3.4;
      } else {
        w.heading = lerpAngle(w.heading, Math.atan2(pp.x - w.pos.x, pp.z - w.pos.z), clamp(dt * 8, 0, 1));
        w.speed = 0;
        w.fireT = (w.fireT ?? rand(this.rng, 0.4, 1.2)) - dt;
        if (w.fireT <= 0 && d < 24 && !this.player.dead) {
          w.fireT = rand(this.rng, 0.9, 1.5);
          this.sound.shot();
          if (this.rng() < 0.55) this.hurtPlayer(w.isCop ? 5 : 4);
        }
      }
      w.mesh.rotation.y = w.heading;
    }
    // Clean up dead foot cops after a while & when wanted clears.
    if (this.stars === 0) {
      for (let i = this.footCops.length - 1; i >= 0; i--) {
        const c = this.footCops[i];
        if (c.dead || dist2d(c.pos.x, c.pos.z, pp.x, pp.z) > 42) { this.scene.remove(c.mesh); this.footCops.splice(i, 1); }
      }
    }
  }

  // ------------------------------------------------------------- jobs ----
  giverNpc() { return this.job ? this.npcs[this.job.def.giver] : null; }

  startDialogue(lines, onDone) {
    this.dialogue = { lines, idx: 0, onDone };
    this.hud.showDialogue(lines[0][0], lines[0][1]);
  }
  advanceDialogue() {
    const d = this.dialogue;
    if (!d) return;
    d.idx++;
    if (d.idx >= d.lines.length) {
      this.dialogue = null;
      this.hud.hideDialogue();
      d.onDone && d.onDone();
    } else {
      this.hud.showDialogue(d.lines[d.idx][0], d.lines[d.idx][1]);
    }
  }

  offerJob() {
    const idx = this.profile.jobIndex;
    if (idx >= 7 || this.job) return;
    const def = JOBS[idx];
    const npc = this.npcs[def.giver];
    this.jobMarker.visible = true;
    this.jobMarker.position.set(npc.pos.x, 0, npc.pos.z);
    this.hud.setObjective(`Meet ${NPC_DEFS[def.giver].name} — “${def.name}”`);
  }

  beginJob() {
    const def = JOBS[this.profile.jobIndex];
    this.job = { def, stepIdx: -1, fightSet: null, timer: 0 };
    this.startDialogue(def.intro, () => {
      this.job.stepIdx = 0;
      this.setupStep();
    });
  }

  setupStep() {
    const job = this.job;
    if (!job) return;
    const step = job.def.steps[job.stepIdx];
    if (!step) return this.finishJob();
    job.timer = step.timed ?? 0;
    if (step.type === 'fight') {
      job.fightSet = new Set();
      const at = job.def.steps[job.stepIdx - 1]?.at ?? 'alley';
      const centre = at === 'alley' ? this.spots.alley : this.spots.raceStart;
      for (let i = 0; i < step.count; i++) {
        const g = new Walker(this.scene, this.rng, {
          x: centre.x + rand(this.rng, -7, 7), z: centre.z + rand(this.rng, -7, 7),
          mode: 'fight', gang: true, hp: 40,
        });
        job.fightSet.add(g);
      }
      if (step.wanted) { this.heat = Math.max(this.heat, step.wanted); this.lastCrime = this.time; }
    }
    this.refreshObjective();
  }

  refreshObjective() {
    const job = this.job;
    if (!job || job.stepIdx < 0) return;
    const step = job.def.steps[job.stepIdx];
    if (step) this.hud.setObjective(step.label);
  }

  currentStepTarget() {
    const job = this.job;
    if (!job || job.stepIdx < 0) return null;
    const step = job.def.steps[job.stepIdx];
    if (!step) return null;
    if (step.type === 'steal') return this.spots.comet;
    if (step.at) return this.spots[step.at];
    return null;
  }

  updateJobs(dt) {
    if (!this.job) { this.offerJob(); return; }
    const job = this.job;
    // Marker follows the current step target (or the giver while talking).
    const target = job.stepIdx < 0 ? null : this.currentStepTarget();
    if (target) {
      this.jobMarker.visible = true;
      this.jobMarker.position.set(target.x, 0, target.z);
      const s = 1 + Math.sin(this.time * 3) * 0.06;
      this.jobMarker.scale.setScalar(s);
    } else if (job.stepIdx >= 0) this.jobMarker.visible = false;
    if (job.stepIdx < 0) return;
    const step = job.def.steps[job.stepIdx];
    if (!step) return;
    if (step.timed) {
      job.timer -= dt;
      this.hud.setTimer('⏱ ' + Math.max(0, job.timer).toFixed(0) + 's — ' + job.def.name);
      if (job.timer <= 0) {
        this.hud.setTimer('');
        this.sound.fail();
        this.hud.toast('Too slow — the trail went cold. Try the score again.');
        job.stepIdx = 0; // restart the job's steps (re-grab at the bank)
        this.heat = Math.max(0, this.heat - 1);
        this.setupStep();
        return;
      }
    }
    // Arrival checks.
    const P = this.player;
    const at = step.at ? this.spots[step.at] : null;
    if (step.type === 'goto' && at) {
      const ok = step.foot ? !P.car : true;
      if (ok && dist2d(this.playerPos.x, this.playerPos.z, at.x, at.z) < step.r) this.advanceJob();
    } else if (step.type === 'driveTo' && at) {
      if (P.car && dist2d(P.car.pos.x, P.car.pos.z, at.x, at.z) < step.r) this.advanceJob();
    } else if (step.type === 'driveCarTo' && at) {
      if (P.car === this.comet && dist2d(P.car.pos.x, P.car.pos.z, at.x, at.z) < step.r) this.advanceJob();
    } else if (step.type === 'steal') {
      // Completed in enterCar(); also complete if somehow already driving it.
      if (P.car === this.comet) this.advanceJob();
    }
  }

  advanceJob() {
    const job = this.job;
    if (!job) return;
    // Leaving a step can itself be the crime (grabbing the bank loot).
    const leaving = job.def.steps[job.stepIdx];
    if (leaving?.setsWanted) {
      this.heat = Math.max(this.heat, leaving.setsWanted);
      this.lastCrime = this.time;
      this.hud.toast('You have the bags. GO!');
    }
    job.stepIdx++;
    this.hud.setTimer('');
    if (job.stepIdx >= job.def.steps.length) this.finishJob();
    else { this.sound.beep(980); this.setupStep(); }
  }

  finishJob() {
    const job = this.job;
    if (!job) return;
    this.hud.banner('JOB COMPLETE', job.def.name + '  ·  +$' + job.def.pay);
    this.addMoney(job.def.pay);
    this.hud.toast(job.def.done);
    this.profile.jobIndex = Math.min(7, this.profile.jobIndex + 1);
    this.job = null;
    this.jobMarker.visible = false;
    this.hud.setObjective('');
    if (this.profile.jobIndex >= 7 && !this.over) {
      this.over = true;
      setTimeout(() => this.hud.banner('COSTA VERDE IS YOURS', 'All seven jobs done — the city, the sunset, everything', 4), 3200);
    }
    this.persist();
  }

  // -------------------------------------------------------------- race ---
  startRace() {
    if (this.race) return;
    const cps = [];
    for (let i = 0; i < 4; i++) cps.push({ x: 150 - i * 95, z: i % 2 ? 6 : -6 });
    cps.push({ x: -215, z: 0 });
    for (let i = 0; i < 3; i++) cps.push({ x: -140 + i * 95, z: i % 2 ? -6 : 6 });
    cps.push({ x: 195, z: 0 });
    this.race = { cpIdx: 0, t: 0, checkpoints: cps, par: 150 };
    this.hud.banner('SUNSET GP', 'Follow the green pillars — beat 2:30 for $300', 2.6);
    this.sound.beep(660);
    this.showRaceCp();
  }
  showRaceCp() {
    const cp = this.race.checkpoints[this.race.cpIdx];
    this.raceMarker.visible = true;
    this.raceMarker.position.set(cp.x, 0, cp.z);
  }
  updateRace(dt) {
    if (!this.race) {
      // Offer the race when the player idles near the start in a car.
      return;
    }
    const race = this.race;
    race.t += dt;
    this.hud.setTimer('🏁 Sunset GP  ' + race.t.toFixed(1) + 's  ·  CP ' + (race.cpIdx + 1) + '/' + race.checkpoints.length);
    const cp = race.checkpoints[race.cpIdx];
    if (this.player.car && dist2d(this.player.car.pos.x, this.player.car.pos.z, cp.x, cp.z) < 9) {
      race.cpIdx++;
      this.sound.beep(880 + race.cpIdx * 40);
      if (race.cpIdx >= race.checkpoints.length) {
        const t = race.t;
        this.race = null;
        this.raceMarker.visible = false;
        this.hud.setTimer('');
        if (t < race.par) {
          this.addMoney(300);
          this.hud.banner('SUNSET GP — YOU WIN', 'Time ' + t.toFixed(1) + 's · +$300');
        } else {
          this.hud.banner('SUNSET GP — FINISHED', 'Time ' + t.toFixed(1) + 's — par is 2:30. Run it again.');
        }
        if (!this.profile.raceBest || t < this.profile.raceBest) { this.profile.raceBest = t; this.persist(); }
      } else this.showRaceCp();
    }
  }

  // -------------------------------------------------------------- taxi ---
  updateTaxi(dt) {
    this.fareTimer -= dt;
    if (this.fareTimer <= 0 && this.waitingFares.length < 2 && !this.taxi) {
      this.fareTimer = rand(this.rng, 14, 26);
      // A fare waits at a random sidewalk near the player.
      const pp = this.playerPos;
      const fx = clamp(pp.x + rand(this.rng, -70, 70), -238, 235);
      const fz = clamp(pp.z + rand(this.rng, -70, 70), -240, 240);
      if (this.isWalkable(fx, fz)) {
        const w = new Walker(this.scene, this.rng, { x: fx, z: fz, mode: 'stand', shirt: 0xffe95e });
        w.isFare = true;
        this.waitingFares.push(w);
        this.hud.toast('🚕 A fare is waiting nearby — check your map');
      }
    }
    // Pickup.
    if (!this.taxi && this.player.car) {
      for (let i = 0; i < this.waitingFares.length; i++) {
        const w = this.waitingFares[i];
        if (dist2d(this.player.car.pos.x, this.player.car.pos.z, w.pos.x, w.pos.z) < 4.5) {
          this.waitingFares.splice(i, 1);
          this.scene.remove(w.mesh);
          const dests = ['hotel', 'marina', 'station', 'park', 'bank', 'garage', 'warehouse', 'pierEnd'];
          const destKey = pick(this.rng, dests);
          const dest = this.spots[destKey];
          const fare = Math.round(dist2d(w.pos.x, w.pos.z, dest.x, dest.z) * 0.55) + 12;
          this.taxi = { dest, destKey, fare, t: 0 };
          this.hud.toast('Fare aboard! Take them to the gold pillar.');
          this.sound.beep(740);
          break;
        }
      }
    }
    if (this.taxi) {
      this.taxi.t += dt;
      this.jobMarker.visible = true;
      this.jobMarker.position.set(this.taxi.dest.x, 0, this.taxi.dest.z);
      if (this.player.car && dist2d(this.player.car.pos.x, this.player.car.pos.z, this.taxi.dest.x, this.taxi.dest.z) < 7) {
        const tip = this.taxi.t < 45 ? 15 : this.taxi.t < 90 ? 6 : 0;
        const total = this.taxi.fare + tip;
        this.profile.faresDone++;
        this.hud.banner('FARE COMPLETE', '+$' + total + (tip ? ' (includes $' + tip + ' tip)' : ''));
        this.addMoney(total);
        this.taxi = null;
        if (!this.job) this.jobMarker.visible = false;
      }
    }
  }

  // --------------------------------------------------------- interact ----
  checkInteract(input) {
    const P = this.player;
    let hint = '';
    if (!P.car) {
      // Talk to the job giver.
      if (this.job && this.job.stepIdx === -1) { /* mid-dialogue handled elsewhere */ }
      if (!this.job && this.profile.jobIndex < 7) {
        const def = JOBS[this.profile.jobIndex];
        const npc = this.npcs[def.giver];
        if (dist2d(P.pos.x, P.pos.z, npc.pos.x, npc.pos.z) < 3.4) {
          hint = 'E — ' + NPC_DEFS[def.giver].name + ': “' + def.name + '”';
          if (input.pressed('e')) { this.beginJob(); this.hud.setHint(''); return; }
        }
      }
      // Enter a car.
      let nearest = null, nd = 3.8;
      for (const c of [...this.traffic, this.comet, ...this.cruisers]) {
        const d = dist2d(P.pos.x, P.pos.z, c.pos.x, c.pos.z);
        if (d < nd) { nd = d; nearest = c; }
      }
      if (nearest) {
        hint = nearest === this.comet ? 'E — Steal the Comet GT' : 'E — Enter car';
        if (input.pressed('e')) { this.enterCar(nearest); this.hud.setHint(''); return; }
      }
      // Race start on foot? No — races need a car. Hint only.
    } else {
      if (!this.race && dist2d(P.car.pos.x, P.car.pos.z, this.spots.raceStart.x, this.spots.raceStart.z) < 8) {
        hint = 'E — Start the Sunset GP';
        if (input.pressed('e')) { /* E also exits; race takes precedence here */ this.startRace(); this.hud.setHint(''); return; }
      }
    }
    this.hud.setHint(hint);
  }

  drawHudExtras() {
    const markers = [];
    if (this.job && this.job.stepIdx >= 0) {
      const t = this.currentStepTarget();
      if (t) markers.push({ x: t.x, z: t.z, color: '#ffd23e' });
    } else if (!this.job && this.profile.jobIndex < 7) {
      const npc = this.npcs[JOBS[this.profile.jobIndex].giver];
      markers.push({ x: npc.pos.x, z: npc.pos.z, color: '#ffd23e' });
    }
    if (this.taxi) markers.push({ x: this.taxi.dest.x, z: this.taxi.dest.z, color: '#ffd23e' });
    if (this.race) {
      const cp = this.race.checkpoints[this.race.cpIdx];
      markers.push({ x: cp.x, z: cp.z, color: '#7dff5e' });
    }
    for (const w of this.waitingFares) markers.push({ x: w.pos.x, z: w.pos.z, color: '#ffe95e' });
    const cops = [...this.cruisers.map((c) => c.pos), ...this.footCops.filter((f) => !f.dead).map((f) => f.pos)];
    this.hud.drawMap({ player: this.playerPos, heading: this.player.heading, markers, cops });
  }
}
