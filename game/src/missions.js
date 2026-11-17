// Missions and story: four jobs for fixer Lena Cruz, each a chain of objectives
// with a glowing marker, plus cash bundles scattered around the city to collect.
import { dist2D } from './util.js';

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
    steps: [
      { text: 'Meet Lena at the Sunset Club', x: TARGETS.club.x, z: TARGETS.club.z, r: 6, kind: 'goto' },
      { text: 'Drive Lena home to the Safehouse', x: TARGETS.safehouse.x, z: TARGETS.safehouse.z, r: 7, kind: 'goto' },
    ],
  },
  {
    id: 'm2', title: 'HOT PROPERTY', reward: 800,
    brief: "Sal needs a Comet GT from the Marina — the red sports car by the docks. Take it, and bring it to his garage. The owner will not be happy.",
    steps: [
      { text: 'Go to the Marina and find the red Comet GT', x: TARGETS.marina.x, z: TARGETS.marina.z, r: 8, kind: 'goto' },
      { text: 'Steal the Comet GT (press E beside it)', x: TARGETS.marina.x, z: TARGETS.marina.z, r: 8, kind: 'steal' },
      { text: 'Deliver the Comet GT to Sal\'s Garage', x: TARGETS.garage.x, z: TARGETS.garage.z, r: 7, kind: 'deliver' },
    ],
  },
  {
    id: 'm3', title: 'PAYBACK TIME', reward: 1500,
    brief: 'The Vipers jumped one of Lena\'s couriers at their warehouse. Go in heavy, drop every Viper, and take back the courier cash.',
    steps: [
      { text: 'Go to the Vipers Warehouse', x: TARGETS.warehouse.x, z: TARGETS.warehouse.z, r: 9, kind: 'goto' },
      { text: 'Drop all 5 Vipers', x: TARGETS.warehouse.x, z: TARGETS.warehouse.z, r: 30, kind: 'fight' },
      { text: 'Grab the courier cash', x: 183, z: 162, r: 4, kind: 'collect' },
      { text: 'Lose the heat — get back to the Safehouse', x: TARGETS.safehouse.x, z: TARGETS.safehouse.z, r: 7, kind: 'goto' },
    ],
  },
  {
    id: 'm4', title: 'THE BIG SCORE', reward: 2500,
    brief: "One package, one run across the whole city. The cops will be all over it — pick it up at Sal's, and do not stop for anything.",
    steps: [
      { text: 'Pick up the package at Sal\'s Garage', x: TARGETS.garage.x, z: TARGETS.garage.z, r: 6, kind: 'goto' },
      { text: 'Deliver the package to the Sunset Club — FAST (2:30)', x: TARGETS.club.x, z: TARGETS.club.z, r: 7, kind: 'timed' },
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
    this.buildCash();
  }

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
    this.placeMarker();
    this.onStepStart();
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
    if (s.kind === 'fight') {
      this.world.combat.spawnGang(s.x, s.z, 5, 1000 + this.index * 77);
      this.world.onEvent('fight-start');
    }
    if (this.current.id === 'm2' && this.step === 1 && !this.missionCar) {
      this.missionCar = this.world.traffic.spawnParked('sports', TARGETS.marina.x + 8, TARGETS.marina.z, Math.PI / 2);
      this.missionCar.mesh.userData.isMissionCar = true;
    }
    if (this.current.id === 'm4' && this.step === 1) {
      this.timer = 0;
      this.world.police.addCrime(3);
      this.world.onEvent('heat');
    }
  }

  /** Distance to the current objective, for the HUD. */
  objectiveDistance(player) {
    const s = this.currentStep;
    return s ? Math.round(dist2D(player.x, player.z, s.x, s.z)) : 0;
  }
}
