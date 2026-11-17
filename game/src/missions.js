// Missions and story: seven jobs that carry Rico Santana from nobody to the
// most wanted man in Costa Verde — for fixer Lena Cruz, garage boss Sal
// Bianchi, boat captain Mateo Reyes and undercover cop Dana Ruiz. Each job
// opens with dialogue, chains objectives behind a glowing marker, and closes
// with a completion banner. Cash bundles are scattered around the city too.
import { dist2D, mulberry32 } from './util.js';
import { Person } from './people.js';

const CASH_SPOTS = [
  [54, -27], [-108, 81], [162, 27], [-27, -162], [81, 135], [-162, -81],
  [27, 81], [-81, 189], [189, -81], [-189, 27], [108, -189], [0, -108],
];

// Mission targets sit on the road beside each landmark (block centres would hide
// the marker inside a building).
const TARGETS = {
  club: { x: 135, z: -108 },
  marina: { x: -189, z: 162 },
  warehouse: { x: 189, z: 162 },
  garage: { x: -135, z: -108 },
  safehouse: { x: 27, z: 162 },
};

export const MISSIONS = [
  {
    id: 'm1', title: 'WELCOME TO COSTA VERDE', reward: 400,
    brief: 'Lena Cruz is waiting at the Sunset Club. Go meet her — she has work for a new face in town.',
    intro: [
      { who: 'LENA CRUZ', text: 'You must be Rico Santana. I\'m Lena — I run the Sunset Club, and half the errands in this city.' },
      { who: 'RICO SANTANA', text: 'Then you\'re the woman I need. I\'m broke, Lena. Point me at the money.' },
      { who: 'LENA CRUZ', text: 'Start by driving me home. Impress me, and the real jobs follow.' },
    ],
    outro: 'Lena is watching you now. That is worth more than money.',
    steps: [
      { text: 'Meet Lena at the Sunset Club', x: TARGETS.club.x, z: TARGETS.club.z, r: 6, kind: 'goto' },
      { text: 'Drive Lena home to the Safehouse', x: TARGETS.safehouse.x, z: TARGETS.safehouse.z, r: 7, kind: 'goto' },
    ],
  },
  {
    id: 'm2', title: 'HOT PROPERTY', reward: 800,
    brief: "Sal Bianchi needs a Comet GT from the Marina — the red sports car by the docks. Take it, and bring it to his garage. The owner will not be happy.",
    intro: [
      { who: 'SAL BIANCHI', text: 'Sal Bianchi. My garage, my rules. There\'s a red Comet GT sitting down at the marina with my name on it.' },
      { who: 'RICO SANTANA', text: 'You mean with somebody else\'s name on it.' },
      { who: 'SAL BIANCHI', text: 'Details. Bring it to me unmarked and there\'s eight hundred in it for you.' },
    ],
    outro: 'Sal nods at the Comet. "Kid\'s got hands," he says.',
    steps: [
      { text: 'Go to the Marina and find the red Comet GT', x: TARGETS.marina.x, z: TARGETS.marina.z, r: 8, kind: 'goto' },
      { text: 'Steal the Comet GT (press E beside it)', x: TARGETS.marina.x, z: TARGETS.marina.z, r: 8, kind: 'steal' },
      { text: 'Deliver the Comet GT to Sal\'s Garage', x: TARGETS.garage.x, z: TARGETS.garage.z, r: 7, kind: 'deliver' },
    ],
  },
  {
    id: 'm3', title: 'MARINA RUN', reward: 1100,
    brief: "Captain Mateo Reyes has cargo on the docks that cannot sit in the sun. Pick it up at the Marina and run it to Sal's Garage — the harbour patrol naps lightly.",
    intro: [
      { who: 'MATEO REYES', text: 'Captain Mateo Reyes, fastest boat on this coast. My cargo just came in — and it cannot be on that dock at sunset.' },
      { who: 'RICO SANTANA', text: 'What is it, Mateo?' },
      { who: 'MATEO REYES', text: 'Better you don\'t know, amigo. Load it, drive it to Sal\'s, and if the harbour patrol wakes up — you were never here.' },
    ],
    outro: 'Mateo counts the crates twice, then pays once. Fair enough.',
    steps: [
      { text: 'Meet Mateo at the Marina', x: TARGETS.marina.x, z: TARGETS.marina.z, r: 8, kind: 'goto' },
      { text: 'Load the cargo from the docks', x: -181, z: 162, r: 5, kind: 'collect' },
      { text: 'Run the cargo to Sal\'s Garage', x: TARGETS.garage.x, z: TARGETS.garage.z, r: 7, kind: 'goto',
        say: { who: 'MATEO REYES', text: 'Radio check — the harbour patrol just woke up, amigo. Whatever you do, do NOT stop.' } },
    ],
  },
  {
    id: 'm4', title: 'PAYBACK TIME', reward: 1500,
    brief: 'The Vipers jumped one of Lena\'s couriers at their warehouse. Go in heavy, drop every Viper, and take back the courier cash.',
    intro: [
      { who: 'LENA CRUZ', text: 'The Vipers jumped my courier at their warehouse and took his cash. Nobody steals from me, Rico.' },
      { who: 'RICO SANTANA', text: 'How many of them?' },
      { who: 'LENA CRUZ', text: 'Five. Six by the time you\'re done hearing about it. Bring my money home.' },
    ],
    outro: 'The Vipers will remember your face now. So will Lena.',
    steps: [
      { text: 'Go to the Vipers Warehouse', x: TARGETS.warehouse.x, z: TARGETS.warehouse.z, r: 9, kind: 'goto' },
      { text: 'Drop all 5 Vipers', x: TARGETS.warehouse.x, z: TARGETS.warehouse.z, r: 30, kind: 'fight', gang: 5 },
      { text: 'Grab the courier cash', x: 183, z: 162, r: 4, kind: 'collect' },
      { text: 'Lose the heat — get back to the Safehouse', x: TARGETS.safehouse.x, z: TARGETS.safehouse.z, r: 7, kind: 'goto' },
    ],
  },
  {
    id: 'm5', title: 'THE INFORMANT', reward: 1800,
    brief: "A woman named Dana is waiting at Costa General with information Lena needs. Pick her up and bring her to the Sunset Club. The Vipers are watching the hospital — expect company.",
    intro: [
      { who: 'DANA RUIZ', text: 'Officer Dana Ruiz. Undercover — which means if the Vipers spot me with you, we\'re both dead.' },
      { who: 'RICO SANTANA', text: 'A cop. Lena sends me to chauffeur a cop.' },
      { who: 'DANA RUIZ', text: 'Drive, Santana. Talk when we\'re inside the club and not before.' },
    ],
    outro: 'Dana vanishes into the club. Lena\'s smile says it was worth it.',
    steps: [
      { text: 'Pick up Dana at Costa General', x: -189, z: -162, r: 7, kind: 'goto' },
      { text: 'Drive Dana to the Sunset Club — the Vipers are watching', x: TARGETS.club.x, z: TARGETS.club.z, r: 7, kind: 'goto',
        say: { who: 'DANA RUIZ', text: 'Black car, two blocks back — that\'s them. Lose them or lose me, your call.' } },
    ],
  },
  {
    id: 'm6', title: 'THE BIG SCORE', reward: 2500,
    brief: "One package, one run across the whole city. The cops will be all over it — pick it up at Sal's, and do not stop for anything.",
    intro: [
      { who: 'LENA CRUZ', text: 'This is the one, Rico. One package, Sal\'s to my club, and every badge in Costa Verde will know your name.' },
      { who: 'RICO SANTANA', text: 'And if I make it?' },
      { who: 'LENA CRUZ', text: 'Then nobody in this city says no to you again. Two and a half minutes. Go.' },
    ],
    outro: 'The package lands on Lena\'s desk. The city exhales.',
    steps: [
      { text: 'Pick up the package at Sal\'s Garage', x: TARGETS.garage.x, z: TARGETS.garage.z, r: 6, kind: 'goto' },
      { text: 'Deliver the package to the Sunset Club — FAST (2:30)', x: TARGETS.club.x, z: TARGETS.club.z, r: 7, kind: 'timed',
        say: { who: 'LENA CRUZ', text: 'Every cop in Costa Verde just heard your name. Do NOT stop.' } },
    ],
  },
  {
    id: 'm7', title: 'SUNSET SHOWDOWN', reward: 4000,
    brief: "The Vipers are making their last stand at the warehouse, and Lena wants it ended tonight. Clear them out, take their war chest, and get to Mateo's boat at the Marina before the whole PD lands on you.",
    intro: [
      { who: 'LENA CRUZ', text: 'Tonight it ends. The Vipers are dug in at their warehouse with everything they\'ve stolen this year.' },
      { who: 'MATEO REYES', text: 'I\'ll be at the marina with the engine running, amigo. When the sky fills with helicopters — that\'s your cue to run.' },
      { who: 'RICO SANTANA', text: 'Clear the warehouse, grab the chest, make the boat. See you at sunset, Mateo.' },
    ],
    outro: 'The boat pulls away as the sun drops. Costa Verde is yours.',
    steps: [
      { text: 'Go to the Vipers Warehouse', x: TARGETS.warehouse.x, z: TARGETS.warehouse.z, r: 9, kind: 'goto' },
      { text: 'Drop all 6 Vipers — end this', x: TARGETS.warehouse.x, z: TARGETS.warehouse.z, r: 30, kind: 'fight', gang: 6 },
      { text: 'Take the Vipers\' war chest', x: 183, z: 162, r: 4, kind: 'collect' },
      { text: 'ESCAPE — reach Mateo\'s boat at the Marina!', x: TARGETS.marina.x, z: TARGETS.marina.z, r: 8, kind: 'goto',
        say: { who: 'MATEO REYES', text: 'I see the helicopters, amigo — I see YOU. Bring her home!' } },
    ],
  },
];

export class MissionManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world; // { combat, traffic, police, sound, onEvent }
    this.index = 0;      // which mission is active
    this.step = 0;
    this.active = false;
    this.completed = 0;
    this.timer = 0;
    this.missionCar = null;
    this.marker = this.makeMarker();
    this.cash = [];
    this.cashTotal = 0;
    this.giver = null; // the gold-shirted story NPC waiting at the first marker
    this.buildCash();
  }

  get total() { return MISSIONS.length; }

  makeMarker() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 15;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd94d }),
    );
    diamond.position.y = 6;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    g.add(beam); g.add(diamond); g.add(ring);
    g.userData.diamond = diamond;
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  buildCash() {
    for (const [x, z] of CASH_SPOTS) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.5, 0.8),
        new THREE.MeshLambertMaterial({ color: 0x2aff7a, emissive: 0x0a662a }),
      );
      box.position.set(x, 0.6, z);
      box.castShadow = true;
      this.scene.add(box);
      this.cash.push({ mesh: box, x, z, taken: false, value: 50 + Math.floor(Math.random() * 100) });
    }
  }

  get current() { return MISSIONS[this.index] || null; }
  get currentStep() { return this.current ? this.current.steps[this.step] : null; }

  startMission(i) {
    this.index = i;
    this.step = 0;
    this.active = true;
    this.timer = 0;
    this.world.onEvent('mission-start', this.current);
    if (this.current.intro) this.world.onEvent('dialogue', this.current.intro);
    this.spawnGiver();
    this.placeMarker();
    this.onStepStart();
  }

  /** Stand the job's named contact (gold shirt) beside the first marker. */
  spawnGiver() {
    if (this.giver) { this.scene.remove(this.giver.mesh); this.giver = null; }
    const s = this.currentStep;
    if (!s) return;
    const giver = new Person(this.scene, 'npc', mulberry32(1000 + this.index * 131));
    giver.setPose(s.x + 3, s.z + 2, Math.atan2(-3, -2));
    this.giver = giver;
  }

  placeMarker() {
    const s = this.currentStep;
    if (!s) { this.marker.visible = false; return; }
    this.marker.visible = true;
    this.marker.position.set(s.x, 0, s.z);
  }

  /** Advance to the next step, or finish the mission. Returns 'step' | 'done' | null. */
  advance() {
    this.step += 1;
    const m = this.current;
    if (this.step >= m.steps.length) {
      this.active = false;
      this.completed += 1;
      this.marker.visible = false;
      this.missionCar = null;
      this.world.onEvent('mission-done', m);
      return 'done';
    }
    this.placeMarker();
    this.onStepStart();
    this.world.onEvent('step', this.currentStep);
    return 'step';
  }

  update(dt, player) {
    // marker spin + bob
    if (this.marker.visible) {
      this.marker.userData.diamond.rotation.y += dt * 2.2;
      this.marker.userData.diamond.position.y = 6 + Math.sin(performance.now() / 350) * 0.5;
    }
    // cash pickups spin and get collected
    for (const c of this.cash) {
      if (c.taken) continue;
      c.mesh.rotation.y += dt * 1.5;
      if (dist2D(player.x, player.z, c.x, c.z) < 2.6) {
        c.taken = true;
        this.scene.remove(c.mesh);
        this.cashTotal += c.value;
        this.world.onEvent('cash', c.value);
      }
    }
    if (!this.active) return;
    const s = this.currentStep;
    if (!s) return;
    const d = dist2D(player.x, player.z, s.x, s.z);
    if (s.kind === 'timed') {
      this.timer += dt;
      if (this.timer > 150) {
        this.world.onEvent('mission-fail', this.current);
        this.active = false;
        this.marker.visible = false;
        this.step = 0;
        return;
      }
    }
    if (s.kind === 'goto' || s.kind === 'timed' || s.kind === 'deliver') {
      if (d < s.r) {
        if (s.kind === 'deliver' && this.missionCar && player.car !== this.missionCar) return;
        this.advance();
      }
    } else if (s.kind === 'fight') {
      if (this.world.combat.aliveCount === 0) this.advance();
    } else if (s.kind === 'collect') {
      if (d < s.r) this.advance();
    } else if (s.kind === 'steal') {
      if (player.car === this.missionCar) this.advance();
    }
  }

  /** Called when a step begins that needs a setup (gang spawn, mission car, wanted). */
  onStepStart() {
    const s = this.currentStep;
    if (!s) return;
    if (s.say) this.world.onEvent('dialogue', [s.say]);
    if (s.kind === 'fight') {
      this.world.combat.spawnGang(s.x, s.z, s.gang || 5, 1000 + this.index * 77);
      this.world.onEvent('fight-start');
    }
    if (this.current.id === 'm2' && this.step === 1 && !this.missionCar) {
      this.missionCar = this.world.traffic.spawnParked('sports', TARGETS.marina.x + 8, TARGETS.marina.z, Math.PI / 2);
      this.missionCar.mesh.userData.isMissionCar = true;
    }
    // the harbour patrol wakes up once Mateo's cargo is loaded
    if (this.current.id === 'm3' && this.step === 2) {
      this.world.police.addCrime(2);
      this.world.onEvent('heat');
    }
    // the Vipers tail Dana the moment she gets in
    if (this.current.id === 'm5' && this.step === 1) {
      this.world.police.addCrime(2);
      this.world.onEvent('heat');
    }
    if (this.current.id === 'm6' && this.step === 1) {
      this.timer = 0;
      this.world.police.addCrime(3);
      this.world.onEvent('heat');
    }
    // the finale: the whole PD, helicopters included, comes for the escape
    if (this.current.id === 'm7' && this.step === 3) {
      this.world.police.addCrime(5);
      this.world.onEvent('heat');
    }
  }

  /** Distance to the current objective, for the HUD. */
  objectiveDistance(player) {
    const s = this.currentStep;
    return s ? Math.round(dist2D(player.x, player.z, s.x, s.z)) : 0;
  }
}
