// Costa Verde — Sunset Boulevard.
// A golden-hour open-world crime game in one ES module: a 9x9 coastal city,
// seven story jobs, a wanted system with cruisers, foot cops and a police
// helicopter, a street race, taxi fares, and a synth soundtrack — all
// procedural, all offline. three.js r149 is vendored beside this file and
// arrives as the global THREE.

const T = window.THREE;

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

/** Deterministic city RNG: the same skyline on every machine, every load. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261119);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

// ---------------------------------------------------------------- layout
// The city is a 9x9 grid of blocks. A block is 44 across, roads take the 16
// between blocks, so the pitch is 60 and the city spans -270..270. South is
// +z: past the last row of blocks lie the beach, the boardwalk and the sea.
// Road centrelines sit at -270 + 60k for k in 0..9, on both axes.
const GRID = 9, BLOCK = 44, ROAD = 16, PITCH = BLOCK + ROAD, HALF = (GRID * PITCH) / 2;
const SEA_Z = HALF + 58;              // the waterline
const roadLine = (k) => -HALF + k * PITCH;
const blockMin = (i) => -HALF + i * PITCH + ROAD / 2;
const blockCenter = (i) => blockMin(i) + BLOCK / 2;

// ---------------------------------------------------------------- input
const keys = new Set();
const virtual = { up: false, down: false, left: false, right: false, hand: false };
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
const input = {
  get up() { return keys.has('KeyW') || keys.has('ArrowUp') || virtual.up; },
  get down() { return keys.has('KeyS') || keys.has('ArrowDown') || virtual.down; },
  get left() { return keys.has('KeyA') || keys.has('ArrowLeft') || virtual.left; },
  get right() { return keys.has('KeyD') || keys.has('ArrowRight') || virtual.right; },
  get hand() { return keys.has('Space') || virtual.hand; },
};

// ---------------------------------------------------------------- audio
// Everything is synthesized: a sawtooth engine whose pitch follows speed, a
// siren for the law, one-shot blips for money and messages, and a slow
// sunset groove (bass, hats, a soft lead) from a lookahead scheduler.
// Nothing loads, nothing streams.
const AudioSys = {
  ctx: null, engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null,
  musicTimer: null, nextNote: 0, step: 0,
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.engineOsc = ctx.createOscillator();
    this.engineGain = ctx.createGain();
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass'; engFilter.frequency.value = 420;
    this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engFilter).connect(this.engineGain).connect(ctx.destination);
    this.engineOsc.start();
    this.sirenOsc = ctx.createOscillator();
    this.sirenGain = ctx.createGain();
    this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 700;
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(ctx.destination);
    this.sirenOsc.start();
    this.nextNote = ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 120);
  },
  blip(freq = 880, dur = 0.09, type = 'square', vol = 0.05) {
    if (!this.ctx) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
  },
  cash() { this.blip(1180, 0.08, 'square', 0.05); setTimeout(() => this.blip(1560, 0.12, 'square', 0.05), 70); },
  bad() { this.blip(160, 0.25, 'sawtooth', 0.07); },
  setEngine(speedRatio, running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + speedRatio * 165, t, 0.06);
    this.engineGain.gain.setTargetAtTime(running ? 0.028 + speedRatio * 0.03 : 0, t, 0.09);
  },
  setSiren(on, wail) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on ? 0.016 : 0, t, 0.2);
    if (on) this.sirenOsc.frequency.setTargetAtTime(wail, t, 0.1);
  },
  schedule() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const bass = [110, 110, 130.8, 98, 110, 110, 164.8, 146.8];   // A A C G A A E D
    const lead = [440, 0, 523.3, 0, 659.3, 0, 523.3, 392];
    while (this.nextNote < ctx.currentTime + 0.3) {
      const s = this.step % 8, at = this.nextNote;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = bass[s];
      g.gain.setValueAtTime(0.055, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.42);
      o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + 0.45);
      if (lead[s] > 0 && this.step % 16 >= 8) {
        const o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.type = 'sine'; o2.frequency.value = lead[s];
        g2.gain.setValueAtTime(0.03, at);
        g2.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
        o2.connect(g2).connect(ctx.destination); o2.start(at); o2.stop(at + 0.42);
      }
      if (s % 2 === 0) { // a hat: a breath of filtered noise
        const len = 0.03, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
        const g3 = ctx.createGain(); g3.gain.value = 0.012;
        src.connect(hp).connect(g3).connect(ctx.destination); src.start(at);
      }
      this.nextNote += 0.24; this.step++;
    }
  },
};

// ---------------------------------------------------------------- save
const SAVE_KEY = 'costa-verde-v9';
const save = {
  cash: 250, job: 0, bestRace: 0, taxis: 0, finished: false,
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) Object.assign(this, JSON.parse(raw));
    } catch { /* a fresh sunset, then */ }
  },
  store() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash, job: this.job, bestRace: this.bestRace,
        taxis: this.taxis, finished: this.finished,
      }));
    } catch { /* private mode: play on, unsaved */ }
  },
  wipe() {
    this.cash = 250; this.job = 0; this.bestRace = 0; this.taxis = 0; this.finished = false;
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  },
};
save.load();

// ---------------------------------------------------------------- renderer
const container = document.getElementById('scene');
const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputEncoding = T.sRGBEncoding;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
container.appendChild(renderer.domElement);

const scene = new T.Scene();
scene.background = new T.Color(0x2e1a2e);
scene.fog = new T.Fog(0xd98a5e, 260, 950);

const camera = new T.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2600);
camera.position.set(0, 90, 420);

const hemi = new T.HemisphereLight(0xffd9b0, 0x33404f, 0.75);
scene.add(hemi);
const sun = new T.DirectionalLight(0xffb066, 1.65);
sun.position.set(-420, 300, -180);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
sun.shadow.camera.far = 1600;
sun.shadow.bias = -0.0006;
scene.add(sun); scene.add(sun.target);

// A low sun disc and a gradient sky dome: the whole game is lit like 7pm.
{
  const skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        vec3 top = vec3(0.16,0.16,0.38);
        vec3 mid = vec3(0.85,0.42,0.35);
        vec3 low = vec3(1.0,0.62,0.30);
        vec3 c = h > 0.22 ? mix(mid, top, smoothstep(0.22, 0.75, h)) : mix(low, mid, smoothstep(-0.04, 0.22, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new T.Mesh(new T.SphereGeometry(1500, 24, 12), skyMat));
  const sunBall = new T.Mesh(
    new T.CircleGeometry(60, 32),
    new T.MeshBasicMaterial({ color: 0xffdf9e, fog: false }),
  );
  sunBall.position.set(-1150, 330, -480);
  sunBall.lookAt(0, 60, 0);
  scene.add(sunBall);
}

// ---------------------------------------------------------------- the city
const colliders = [];        // {minX, maxX, minZ, maxZ} for every solid block of masonry
const dynamics = [];         // update(dt, t) callbacks for boats, water, rotors…
let buildingCount = 0;

function collideBox(x, z, r) {
  // Circle vs every building AABB: returns a push-out, or null when clear.
  for (const c of colliders) {
    const nx = clamp(x, c.minX, c.maxX), nz = clamp(z, c.minZ, c.maxZ);
    const d2 = dist2(x, z, nx, nz);
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        return { x: nx + ((x - nx) / d) * r, z: nz + ((z - nz) / d) * r, hit: true };
      }
      // centre inside the box: push out along the shallowest axis
      const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) return { x: c.minX - r, z, hit: true };
      if (m === pr) return { x: c.maxX + r, z, hit: true };
      if (m === pt) return { x, z: c.minZ - r, hit: true };
      return { x, z: c.maxZ + r, hit: true };
    }
  }
  return null;
}

/** A lit-window facade, painted once per style and shared by the skyline. */
function facadeTexture(base, litRatio, warm) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  const cols = 8, rows = 16, cw = 128 / cols, ch = 256 / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const lit = rng() < litRatio;
    g.fillStyle = lit ? pick(warm) : 'rgba(16,20,32,0.85)';
    g.fillRect(x * cw + 2.5, y * ch + 3.5, cw - 5, ch - 7);
  }
  const tex = new T.CanvasTexture(cv);
  tex.encoding = T.sRGBEncoding;
  return tex;
}
const FACADE_STYLES = [
  { base: '#5a4a52', lit: 0.5, warm: ['#ffd9a0', '#ffb347', '#fff3d6'] },
  { base: '#3e4a5c', lit: 0.42, warm: ['#aef3ff', '#ffd9a0', '#ffffff'] },
  { base: '#6b5540', lit: 0.55, warm: ['#ffc46b', '#ff9d5c', '#ffe9c4'] },
  { base: '#494558', lit: 0.38, warm: ['#ffd9a0', '#aef3ff', '#ffb347'] },
].map((s) => {
  const map = facadeTexture(s.base, s.lit, s.warm);
  return new T.MeshStandardMaterial({ map, emissive: 0xffc98a, emissiveMap: map, emissiveIntensity: 0.55, roughness: 0.9 });
});
const slabMat = new T.MeshStandardMaterial({ color: 0x9a8f88, roughness: 1 });
const roofMat = new T.MeshStandardMaterial({ color: 0x2e2a33, roughness: 1 });

function addBuilding(cx, cz, w, d, h) {
  const mat = pick(FACADE_STYLES);
  const geo = new T.BoxGeometry(w, h, d);
  const mesh = new T.Mesh(geo, mat);
  mesh.position.set(cx, h / 2 + 0.3, cz);
  mesh.castShadow = true; mesh.receiveShadow = true;
  // texture repeat follows the footprint so windows stay window-sized
  mesh.material = mat;
  scene.add(mesh);
  const roof = new T.Mesh(new T.BoxGeometry(w + 0.6, 0.5, d + 0.6), roofMat);
  roof.position.set(cx, h + 0.55, cz);
  scene.add(roof);
  colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  buildingCount++;
  return mesh;
}

// Blocks with a job to do are left open: the hotel forecourt, Sal's garage
// yard, the marina, the hospital, a park, parking lots. Everything else is
// built on. (i = west→east column, j = north→south row.)
const OPEN_BLOCKS = new Set(['4,8', '1,7', '7,8', '4,0', '2,4', '6,5', '0,8', '8,8']);
function buildCity() {
  // ground: asphalt everywhere, so the gaps between slabs read as roads
  const ground = new T.Mesh(
    new T.PlaneGeometry(1500, 1500),
    new T.MeshStandardMaterial({ color: 0x35333d, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 160);
  ground.receiveShadow = true;
  scene.add(ground);

  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    const cx = blockCenter(i), cz = blockCenter(j);
    const slab = new T.Mesh(new T.BoxGeometry(BLOCK + 4, 0.3, BLOCK + 4), slabMat);
    slab.position.set(cx, 0.15, cz);
    slab.receiveShadow = true;
    scene.add(slab);
    if (OPEN_BLOCKS.has(`${i},${j}`)) continue;
    const style = rng();
    if (style < 0.66) {           // one tower per block
      addBuilding(cx, cz, 26 + rng() * 8, 26 + rng() * 8, 34 + rng() * 52);
    } else if (style < 0.94) {    // a pair of mid-rises
      addBuilding(cx - 11, cz, 17, 30, 18 + rng() * 22);
      addBuilding(cx + 11, cz + 2, 17, 28, 14 + rng() * 20);
    } else {                      // four walk-ups around a courtyard
      addBuilding(cx - 11, cz - 11, 16, 16, 10 + rng() * 8);
      addBuilding(cx + 11, cz - 11, 16, 16, 10 + rng() * 8);
      addBuilding(cx - 11, cz + 11, 16, 16, 10 + rng() * 8);
      addBuilding(cx + 11, cz + 11, 16, 16, 10 + rng() * 8);
    }
  }
  // Top the skyline up to the promised count with annexes on tower blocks.
  let guard = 0;
  while (buildingCount < 107 && guard++ < 400) {
    const i = Math.floor(rng() * GRID), j = Math.floor(rng() * GRID);
    if (OPEN_BLOCKS.has(`${i},${j}`)) continue;
    const cx = blockCenter(i) + (rng() < 0.5 ? -15 : 15);
    const cz = blockCenter(j) + (rng() < 0.5 ? -15 : 15);
    if (colliders.some((c) => cx > c.minX - 12 && cx < c.maxX + 12 && cz > c.minZ - 12 && cz < c.maxZ + 12)) continue;
    addBuilding(cx, cz, 11, 11, 12 + rng() * 16);
  }
}
buildCity();

// ------------------------------------------------------------- the seafront
{
  // sand, then the boardwalk the whole south face of the city stands on
  const sand = new T.Mesh(new T.PlaneGeometry(1500, 130), new T.MeshStandardMaterial({ color: 0xe0b982, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.06, HALF + 46);
  sand.receiveShadow = true; scene.add(sand);
  const walk = new T.Mesh(new T.BoxGeometry(GRID * PITCH + 30, 0.5, 12), new T.MeshStandardMaterial({ color: 0xb08968, roughness: 0.9 }));
  walk.position.set(0, 0.25, HALF + 12);
  walk.receiveShadow = true; scene.add(walk);

  const waterMat = new T.MeshStandardMaterial({ color: 0x2b6f8e, roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.94 });
  const water = new T.Mesh(new T.PlaneGeometry(2400, 900), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.4, SEA_Z + 450);
  scene.add(water);
  dynamics.push((dt, t) => { water.position.y = 0.4 + Math.sin(t * 0.7) * 0.12; });

  // three piers reaching into the swell
  const pierMat = new T.MeshStandardMaterial({ color: 0x8a6a4e, roughness: 1 });
  for (const px of [-150, 10, 170]) {
    const deck = new T.Mesh(new T.BoxGeometry(10, 1, 74), pierMat);
    deck.position.set(px, 1.1, SEA_Z + 30);
    deck.castShadow = true; deck.receiveShadow = true;
    scene.add(deck);
    for (let k = 0; k < 4; k++) {
      const post = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 3, 6), pierMat);
      post.position.set(px, 0, SEA_Z + 2 + k * 20);
      scene.add(post);
    }
  }

  // sixteen umbrellas in two cheerful rows
  const umbCols = [0xff5d47, 0xffd23e, 0x4ecdc4, 0xff8fab];
  for (let k = 0; k < 16; k++) {
    const ux = -252 + k * 33 + (k % 2) * 6;
    const uz = HALF + 34 + (k % 2) * 16;
    const pole = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 2.6, 5), new T.MeshStandardMaterial({ color: 0xf5f0e6 }));
    pole.position.set(ux, 1.3, uz); scene.add(pole);
    const top = new T.Mesh(new T.ConeGeometry(2.3, 1.1, 8), new T.MeshStandardMaterial({ color: umbCols[k % 4], roughness: 0.8 }));
    top.position.set(ux, 2.9, uz); top.castShadow = true; scene.add(top);
  }

  // seven sailboats riding at anchor
  const hullMat = new T.MeshStandardMaterial({ color: 0xf2ede4, roughness: 0.6 });
  const sailMat = new T.MeshStandardMaterial({ color: 0xffffff, side: T.DoubleSide, roughness: 0.9 });
  for (let k = 0; k < 7; k++) {
    const boat = new T.Group();
    const bx = -260 + k * 82 + rng() * 30, bz = SEA_Z + 60 + rng() * 130;
    const hull = new T.Mesh(new T.BoxGeometry(3.2, 1.1, 8), hullMat);
    hull.position.y = 0.4; boat.add(hull);
    const mast = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 8.5, 5), hullMat);
    mast.position.y = 4.6; boat.add(mast);
    const shape = new T.Shape();
    shape.moveTo(0, 0); shape.lineTo(0, 7.4); shape.lineTo(3.4, 0.6); shape.lineTo(0, 0);
    const sail = new T.Mesh(new T.ShapeGeometry(shape), sailMat);
    sail.position.set(0.12, 1.2, 0.4); boat.add(sail);
    boat.position.set(bx, 0.3, bz);
    boat.rotation.y = rng() * Math.PI * 2;
    scene.add(boat);
    const phase = rng() * Math.PI * 2;
    dynamics.push((dt, t) => {
      boat.position.y = 0.3 + Math.sin(t * 0.9 + phase) * 0.22;
      boat.rotation.z = Math.sin(t * 0.7 + phase) * 0.045;
    });
  }

  // palms along the boardwalk and the avenue ends
  const trunkMat = new T.MeshStandardMaterial({ color: 0x8a6a4e, roughness: 1 });
  const frondMat = new T.MeshStandardMaterial({ color: 0x3f9e4d, side: T.DoubleSide, roughness: 0.9 });
  const frondGeo = new T.PlaneGeometry(4.6, 1.1);
  function palm(x, z) {
    const p = new T.Group();
    const trunk = new T.Mesh(new T.CylinderGeometry(0.22, 0.34, 6.4, 6), trunkMat);
    trunk.position.y = 3.2; trunk.rotation.z = 0.06; trunk.castShadow = true; p.add(trunk);
    for (let f = 0; f < 6; f++) {
      const frond = new T.Mesh(frondGeo, frondMat);
      frond.position.y = 6.5;
      frond.rotation.set(-0.7, (f / 6) * Math.PI * 2, 0, 'YXZ');
      frond.translateZ(1.9);
      p.add(frond);
    }
    p.position.set(x, 0, z);
    scene.add(p);
  }
  for (let k = 0; k < 15; k++) palm(-252 + k * 36, HALF + 20);
  for (let k = 0; k < 10; k++) { palm(roadLine(k) + 10, -HALF - 6); palm(roadLine(k) - 10, HALF + 20 + (k % 3)); }
}

// Named places the story keeps returning to.
const PLACES = {
  spawn: { x: 10, z: HALF + 12, label: 'the boardwalk' },
  hotel: { x: blockCenter(4), z: blockCenter(8), label: 'Hotel Miramar' },
  garage: { x: blockCenter(1), z: blockCenter(7), label: "Sal's garage" },
  marina: { x: 10, z: SEA_Z + 58, label: 'the marina pier' },
  vista: { x: blockCenter(4), z: blockMin(0) - 4, label: 'Vista Point' },
  hospital: { x: blockCenter(4), z: blockCenter(0), label: 'Costa Verde General' },
  raceStart: { x: roadLine(5), z: HALF - 6, label: 'the Sunset GP grid' },
};

// ---------------------------------------------------------------- vehicles
const CAR_COLORS = [0xd64541, 0x4a90d9, 0xf2c230, 0x7bc47f, 0xe8e4da, 0x8e6cc8, 0x3a3f4a, 0xff8c42];
const glassMat = new T.MeshStandardMaterial({ color: 0x18222e, roughness: 0.25, metalness: 0.6 });
const tyreMat = new T.MeshStandardMaterial({ color: 0x14161a, roughness: 1 });
const chromeMat = new T.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.3, metalness: 0.85 });

function makeCarMesh(color, opts = {}) {
  const g = new T.Group();
  const paint = new T.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const body = new T.Mesh(new T.BoxGeometry(2.1, 0.62, 4.4), paint);
  body.position.y = 0.62; body.castShadow = true; g.add(body);
  const nose = new T.Mesh(new T.BoxGeometry(1.9, 0.4, 0.9), paint);
  nose.position.set(0, 0.52, 2.5); g.add(nose);
  const cabin = new T.Mesh(new T.BoxGeometry(1.8, 0.58, 2.1), glassMat);
  cabin.position.set(0, 1.18, -0.25); cabin.castShadow = true; g.add(cabin);
  const wheelGeo = new T.CylinderGeometry(0.42, 0.42, 0.3, 12);
  const wheels = [];
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new T.Mesh(wheelGeo, tyreMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w); wheels.push(w);
  }
  const lightGeo = new T.BoxGeometry(0.42, 0.16, 0.08);
  const headMat = new T.MeshStandardMaterial({ color: 0xfff6cf, emissive: 0xffedb5, emissiveIntensity: 1.4 });
  const tailMat = new T.MeshStandardMaterial({ color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 0.9 });
  for (const s of [-0.62, 0.62]) {
    const h = new T.Mesh(lightGeo, headMat); h.position.set(s, 0.62, 2.96); g.add(h);
    const t = new T.Mesh(lightGeo, tailMat); t.position.set(s, 0.66, -2.22); g.add(t);
  }
  if (opts.police) {
    const bar = new T.Mesh(new T.BoxGeometry(1.3, 0.16, 0.5), chromeMat);
    bar.position.set(0, 1.56, -0.25); g.add(bar);
    const red = new T.Mesh(new T.BoxGeometry(0.55, 0.14, 0.4),
      new T.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 0 }));
    red.position.set(-0.34, 1.58, -0.25); g.add(red);
    const blue = new T.Mesh(new T.BoxGeometry(0.55, 0.14, 0.4),
      new T.MeshStandardMaterial({ color: 0x000033, emissive: 0x2266ff, emissiveIntensity: 0 }));
    blue.position.set(0.34, 1.58, -0.25); g.add(blue);
    g.userData.barLights = [red.material, blue.material];
    const stripe = new T.Mesh(new T.BoxGeometry(2.14, 0.3, 4.44),
      new T.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
    stripe.position.y = 0.78; g.add(stripe);
  }
  if (opts.taxi) {
    const sign = new T.Mesh(new T.BoxGeometry(0.9, 0.24, 0.4),
      new T.MeshStandardMaterial({ color: 0xffd23e, emissive: 0xffd23e, emissiveIntensity: 0.7 }));
    sign.position.set(0, 1.58, -0.25); g.add(sign);
  }
  g.userData.wheels = wheels;
  scene.add(g);
  return g;
}

/** Arcade car physics: the shared heart of player, traffic and police. */
class Car {
  constructor(mesh, opts = {}) {
    this.mesh = mesh;
    this.x = mesh.position.x; this.z = mesh.position.z;
    this.angle = opts.angle || 0;
    this.speed = 0;
    this.health = 100;
    this.maxSpeed = opts.maxSpeed || 37;
    this.accel = opts.accel || 21;
    this.radius = 1.7;
    this.dead = false;
    this.smoke = 0;
  }
  get pos() { return this.mesh.position; }
  step(dt, ctl) {
    if (this.dead) { this.speed = 0; this.sync(0); return; }
    const throttle = (ctl.up ? 1 : 0) - (ctl.down ? 1 : 0);
    if (throttle > 0) this.speed += this.accel * dt * (1 - this.speed / (this.maxSpeed * 1.25));
    else if (throttle < 0) this.speed -= (this.speed > 0.5 ? 30 : 9) * dt;
    else this.speed -= this.speed * 0.6 * dt;
    if (ctl.hand) this.speed -= this.speed * 2.4 * dt;
    this.speed = clamp(this.speed, -11, this.maxSpeed);
    const steer = (ctl.left ? 1 : 0) - (ctl.right ? 1 : 0);
    if (Math.abs(this.speed) > 0.2) {
      const grip = clamp(Math.abs(this.speed) / 9, 0.25, 1);
      this.angle += steer * 1.65 * grip * dt * Math.sign(this.speed);
    }
    const vx = Math.sin(this.angle) * this.speed, vz = Math.cos(this.angle) * this.speed;
    this.x += vx * dt; this.z += vz * dt;
    // the world ends at the fences: soft walls past the city's skin
    this.x = clamp(this.x, -HALF - 26, HALF + 26);
    this.z = clamp(this.z, -HALF - 22, SEA_Z - 4);
    const push = collideBox(this.x, this.z, this.radius);
    if (push) {
      const impact = Math.abs(this.speed);
      this.x = push.x; this.z = push.z;
      if (impact > 9) this.hurt((impact - 8) * 1.5);
      this.speed *= -0.25;
    }
    this.sync(dt);
  }
  sync(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.angle;
    const spin = this.speed * dt * 2.2;
    for (const w of this.mesh.userData.wheels || []) w.rotation.x += spin;
  }
  hurt(n) {
    if (this.dead) return;
    this.health -= n;
    if (this.health <= 0) { this.health = 0; this.dead = true; this.onDeath && this.onDeath(); }
  }
  repair() { this.health = 100; this.dead = false; }
}

/** Circle bumps between cars: damage, a shove, and a noise the law notices. */
function carBumps(cars, onPlayerCrash) {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (a.dead && b.dead) continue;
    const rr = a.radius + b.radius;
    if (dist2(a.x, a.z, b.x, b.z) > rr * rr) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.sqrt(dist2(a.x, a.z, b.x, b.z)) || 0.01;
    const push = (rr - d) / 2, nx = dx / d, nz = dz / d;
    a.x -= nx * push; a.z -= nz * push;
    b.x += nx * push; b.z += nz * push;
    const closing = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3;
    if (closing > 5) {
      a.hurt(closing * 0.55); b.hurt(closing * 0.55);
      if (onPlayerCrash && (a === playerCar || b === playerCar)) onPlayerCrash(closing, b === playerCar ? a : b);
    }
    const swap = (a.speed + b.speed) / 2;
    a.speed = swap * 0.7; b.speed = swap * 0.7;
  }
}

// ------------------------------------------------------------- traffic & co
const traffic = [];
function spawnTraffic() {
  for (let k = 0; k < 14; k++) {
    const vertical = rng() < 0.5;
    const line = roadLine(1 + Math.floor(rng() * 8));
    const along = -HALF + rng() * GRID * PITCH;
    const mesh = makeCarMesh(pick(CAR_COLORS));
    const car = new Car(mesh, { maxSpeed: 15 + rng() * 5, accel: 11 });
    car.x = vertical ? line + (rng() < 0.5 ? 3.4 : -3.4) : along;
    car.z = vertical ? along : line + (rng() < 0.5 ? 3.4 : -3.4);
    car.angle = vertical ? (car.x > line ? Math.PI : 0) : (car.z > line ? -Math.PI / 2 : Math.PI / 2);
    car.ai = { vertical, line, dir: 1 };
    if (vertical) car.angle = car.x > line ? Math.PI : 0; else car.angle = car.z > line ? Math.PI / 2 : -Math.PI / 2;
    car.sync(0);
    traffic.push(car);
  }
}
function driveTraffic(dt) {
  for (const car of traffic) {
    if (car.dead) { car.sync(dt); continue; }
    const ai = car.ai;
    // head for the far end of the current road; turn at random junctions
    let tx, tz;
    if (ai.vertical) { tx = car.x; tz = ai.dir > 0 ? HALF + 30 : -HALF - 30; }
    else { tz = car.z; tx = ai.dir > 0 ? HALF + 30 : -HALF - 30; }
    // reached the city edge: loop round to the other side
    if (Math.abs(car.x) > HALF + 24 || Math.abs(car.z) > HALF + 24) {
      if (ai.vertical) car.z = car.z > 0 ? -HALF - 20 : HALF + 20;
      else car.x = car.x > 0 ? -HALF - 20 : HALF + 20;
    }
    // junction turns
    const nearLineX = Math.round((car.x + HALF) / PITCH);
    const nearLineZ = Math.round((car.z + HALF) / PITCH);
    const atJunction = Math.abs(car.x - roadLine(clamp(nearLineX, 0, 9))) < 2.4 && Math.abs(car.z - roadLine(clamp(nearLineZ, 0, 9))) < 2.4;
    if (atJunction && rng() < 0.006) {
      ai.vertical = !ai.vertical;
      ai.dir = rng() < 0.5 ? 1 : -1;
      const cx = roadLine(clamp(nearLineX, 0, 9)), cz = roadLine(clamp(nearLineZ, 0, 9));
      car.x = cx + (ai.vertical ? (ai.dir > 0 ? -3.4 : 3.4) : 0);
      car.z = cz + (ai.vertical ? 0 : (ai.dir > 0 ? 3.4 : -3.4));
    }
    const want = Math.atan2(tx - car.x, tz - car.z);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const blocked = traffic.some((o) => o !== car && !o.dead &&
      dist2(car.x + Math.sin(car.angle) * 6, car.z + Math.cos(car.angle) * 6, o.x, o.z) < 16) ||
      dist2(car.x + Math.sin(car.angle) * 7, car.z + Math.cos(car.angle) * 7, playerCar.x, playerCar.z) < 20;
    car.step(dt, {
      up: !blocked && Math.abs(diff) < 1.2,
      down: blocked,
      left: diff > 0.06, right: diff < -0.06, hand: false,
    });
  }
}

// ------------------------------------------------------------- pedestrians
const peds = [];
const pedBodyMat = new T.MeshStandardMaterial({ roughness: 0.9 });
function makePed(color) {
  const g = new T.Group();
  const body = new T.Mesh(new T.CylinderGeometry(0.32, 0.4, 1.05, 8),
    new T.MeshStandardMaterial({ color, roughness: 0.9 }));
  body.position.y = 0.85; body.castShadow = true; g.add(body);
  const head = new T.Mesh(new T.SphereGeometry(0.3, 10, 8),
    new T.MeshStandardMaterial({ color: 0xe8b98d, roughness: 0.8 }));
  head.position.y = 1.62; g.add(head);
  scene.add(g);
  return g;
}
function spawnPeds() {
  for (let k = 0; k < 18; k++) {
    const mesh = makePed(pick(CAR_COLORS));
    const ped = {
      mesh, x: 0, z: 0, angle: rng() * Math.PI * 2, speed: 1.1 + rng() * 0.7,
      down: 0, tx: 0, tz: 0, retarget: 0,
    };
    const i = Math.floor(rng() * GRID), j = Math.floor(rng() * GRID);
    ped.x = blockCenter(i) + (rng() - 0.5) * 30;
    ped.z = blockCenter(j) + (rng() - 0.5) * 30;
    ped.tx = ped.x; ped.tz = ped.z;
    peds.push(ped);
  }
}
function stepPeds(dt) {
  for (const ped of peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      ped.mesh.rotation.x = Math.min(Math.PI / 2, ped.mesh.rotation.x + dt * 6);
      if (ped.down <= 0) { // scramble up somewhere safer and walk on
        ped.mesh.rotation.x = 0;
        ped.x = clamp(ped.x + (rng() - 0.5) * 60, -HALF, HALF);
        ped.z = clamp(ped.z + (rng() - 0.5) * 60, -HALF, HALF - 10);
      }
      ped.mesh.position.set(ped.x, 0.1, ped.z);
      continue;
    }
    ped.retarget -= dt;
    if (ped.retarget <= 0 || dist2(ped.x, ped.z, ped.tx, ped.tz) < 4) {
      ped.retarget = 4 + rng() * 6;
      ped.tx = clamp(ped.x + (rng() - 0.5) * 90, -HALF - 4, HALF + 4);
      ped.tz = clamp(ped.z + (rng() - 0.5) * 90, -HALF - 4, HALF + 22);
    }
    let sp = ped.speed;
    // dive away from anything fast and close
    const threat = playerCar && !playerCar.dead && Math.abs(playerCar.speed) > 8 &&
      dist2(ped.x, ped.z, playerCar.x, playerCar.z) < 64;
    if (threat) sp = 5.2;
    const want = Math.atan2(ped.tx - ped.x, ped.tz - ped.z);
    ped.angle = want;
    ped.x += Math.sin(ped.angle) * sp * dt;
    ped.z += Math.cos(ped.angle) * sp * dt;
    const push = collideBox(ped.x, ped.z, 0.5);
    if (push) { ped.x = push.x; ped.z = push.z; ped.retarget = 0; }
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.angle;
    // struck by the player: a scandal, a star, no gore
    if (playerCar && Math.abs(playerCar.speed) > 4 && dist2(ped.x, ped.z, playerCar.x, playerCar.z) < 3.6) {
      ped.down = 5;
      Game.crime(1, 'You flattened a pedestrian!');
    }
  }
}

// ---------------------------------------------------------------- the law
const cruisers = [];
function spawnCruisers() {
  for (let k = 0; k < 6; k++) {
    const mesh = makeCarMesh(0x1c2733, { police: true });
    const car = new Car(mesh, { maxSpeed: 40, accel: 24 });
    car.x = 0; car.z = -HALF - 60; car.active = false;
    mesh.visible = false;
    cruisers.push(car);
  }
}
function stepPolice(dt, t) {
  const want = Game.wanted;
  let sirenNear = false;
  cruisers.forEach((car, idx) => {
    const shouldBeOut = idx < Math.min(want, 4) || (want >= 5 && idx < 6);
    if (shouldBeOut && !car.active) {
      // roll in from a road mouth a good way off, lights already hot
      const side = Math.floor(rng() * 4);
      const line = roadLine(1 + Math.floor(rng() * 8));
      if (side === 0) { car.x = line; car.z = playerCar.z - 130; }
      else if (side === 1) { car.x = line; car.z = playerCar.z + 130; }
      else if (side === 2) { car.x = playerCar.x - 130; car.z = line; }
      else { car.x = playerCar.x + 130; car.z = line; }
      car.x = clamp(car.x, -HALF - 10, HALF + 10);
      car.z = clamp(car.z, -HALF - 10, SEA_Z - 10);
      car.repair(); car.active = true; car.mesh.visible = true;
    }
    if (!car.active) return;
    if (!shouldBeOut && Game.heat <= 0) { car.active = false; car.mesh.visible = false; car.sync(dt); return; }
    const px = playerCar.x + Math.sin(playerCar.angle) * playerCar.speed * 0.45;
    const pz = playerCar.z + Math.cos(playerCar.angle) * playerCar.speed * 0.45;
    const wantA = Math.atan2(px - car.x, pz - car.z);
    let diff = wantA - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const d = Math.sqrt(dist2(car.x, car.z, playerCar.x, playerCar.z));
    car.step(dt, { up: true, down: d < 4 && playerCar.speed < 2, left: diff > 0.05, right: diff < -0.05, hand: false });
    const bars = car.mesh.userData.barLights;
    if (bars) {
      const phase = Math.floor(t * 5 + idx) % 2;
      bars[0].emissiveIntensity = phase === 0 ? 2.6 : 0.1;
      bars[1].emissiveIntensity = phase === 1 ? 2.6 : 0.1;
    }
    if (d < 60) sirenNear = true;
    // a pin: nose to the player's car while it crawls is a bust in progress
    if (d < 4.4 && Math.abs(playerCar.speed) < 3.2) Game.pin(dt);
    else Game.unpin(dt);
  });
  AudioSys.setSiren(sirenNear && Game.mode === 'play', 640 + Math.sin(t * 6) * 130);
}

// foot cops: they pour out of the cruisers' city when the stars climb
const footCops = [];
function spawnFootCops() {
  for (let k = 0; k < 5; k++) {
    const mesh = makePed(0x22355e);
    mesh.visible = false;
    footCops.push({ mesh, x: 0, z: 0, active: false });
  }
}
function stepFootCops(dt) {
  const want = Game.wanted >= 2 ? Math.min(5, Game.wanted) : 0;
  footCops.forEach((cop, idx) => {
    if (idx < want && !cop.active) {
      const a = rng() * Math.PI * 2;
      cop.x = clamp(playerCar.x + Math.sin(a) * 55, -HALF, HALF);
      cop.z = clamp(playerCar.z + Math.cos(a) * 55, -HALF, HALF);
      cop.active = true; cop.mesh.visible = true;
    }
    if (!cop.active) return;
    if (idx >= want && Game.heat <= 0) { cop.active = false; cop.mesh.visible = false; return; }
    const wantA = Math.atan2(playerCar.x - cop.x, playerCar.z - cop.z);
    cop.x += Math.sin(wantA) * 6.4 * dt;
    cop.z += Math.cos(wantA) * 6.4 * dt;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = wantA;
    if (dist2(cop.x, cop.z, playerCar.x, playerCar.z) < 5.2 && Math.abs(playerCar.speed) < 3.2) Game.pin(dt);
  });
}

// the helicopter: a spotlight with a rotor, from three stars up
const heli = { group: null, light: null, cone: null, angle: 0 };
function buildHeli() {
  const g = new T.Group();
  const bodyMat = new T.MeshStandardMaterial({ color: 0x232a33, roughness: 0.4, metalness: 0.5 });
  const body = new T.Mesh(new T.BoxGeometry(2.4, 1.8, 5.2), bodyMat); g.add(body);
  const tail = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 4.6), bodyMat);
  tail.position.set(0, 0.3, -4.6); g.add(tail);
  const rotor = new T.Mesh(new T.BoxGeometry(11, 0.08, 0.7),
    new T.MeshStandardMaterial({ color: 0x111111 }));
  rotor.position.y = 1.25; g.add(rotor);
  g.userData.rotor = rotor;
  const skidMat = new T.MeshStandardMaterial({ color: 0x555c66 });
  for (const s of [-0.9, 0.9]) {
    const skid = new T.Mesh(new T.BoxGeometry(0.14, 0.14, 4), skidMat);
    skid.position.set(s, -1.2, 0); g.add(skid);
  }
  const light = new T.SpotLight(0xfff2cc, 0, 160, 0.32, 0.45, 0.6);
  g.add(light); g.add(light.target);
  const cone = new T.Mesh(
    new T.ConeGeometry(11, 34, 20, 1, true),
    new T.MeshBasicMaterial({ color: 0xffedb5, transparent: true, opacity: 0.13, side: T.DoubleSide, depthWrite: false }),
  );
  cone.position.y = -18; g.add(cone);
  g.visible = false;
  scene.add(g);
  heli.group = g; heli.light = light; heli.cone = cone;
}
function stepHeli(dt, t) {
  const on = Game.wanted >= 3 && Game.mode === 'play';
  heli.group.visible = on;
  if (!on) { heli.light.intensity = 0; return; }
  heli.angle += dt * 0.45;
  const hx = playerCar.x + Math.cos(heli.angle) * 17;
  const hz = playerCar.z + Math.sin(heli.angle) * 17;
  heli.group.position.set(hx, 30, hz);
  heli.group.rotation.y = Math.atan2(playerCar.x - hx, playerCar.z - hz);
  heli.group.userData.rotor.rotation.y += dt * 42;
  heli.light.position.set(0, -1, 0);
  heli.light.target.position.set(playerCar.x - hx, -30, playerCar.z - hz);
  heli.light.intensity = 2.4;
}

// ---------------------------------------------------------------- the game
const el = (id) => document.getElementById(id);
const hud = {
  cash: el('cash'), job: el('jobline'), obj: el('objective'), stars: el('stars'),
  speed: el('speed'), health: el('health'), banner: el('banner'), toast: el('toast'),
  dialog: el('dialog'), phone: el('phonemenu'), fader: el('fader'), start: el('start'),
  minimap: el('minimap').getContext('2d'),
};
let bannerTimer = null;
function banner(big, small = '', holdMs = 2600) {
  hud.banner.innerHTML = `${big}${small ? `<small>${small}</small>` : ''}`;
  hud.banner.style.opacity = '1';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { hud.banner.style.opacity = '0'; }, holdMs);
}
let toastTimer = null;
function toast(msg, holdMs = 3000) {
  hud.toast.textContent = msg;
  hud.toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { hud.toast.style.opacity = '0'; }, holdMs);
}

// The player: one borrowed turquoise coupe, increasingly dented.
const playerCar = new Car(makeCarMesh(0x2ec4b6), { maxSpeed: 39, accel: 23 });
playerCar.x = PLACES.spawn.x; playerCar.z = PLACES.spawn.z - 6;
playerCar.angle = Math.PI; // facing the city
playerCar.sync(0);
playerCar.onDeath = () => Game.wasted();

const Game = {
  mode: 'title',          // title | play | dialog | phone | over | pause
  cash: save.cash,
  wanted: 0,
  heat: 0,                // seconds since the last crime the law saw
  pinTime: 0,
  objective: null,        // {x, z, r, label, onArrive, marker}
  dialogQueue: [],
  dialogDone: null,
  jobIndex: save.job,
  jobCleanup: null,
  time: 0,
  race: null,
  taxi: null,
  pausedFrom: null,

  crime(stars, msg) {
    if (this.mode !== 'play' && this.mode !== 'dialog') return;
    this.wanted = clamp(this.wanted + stars, 0, 5);
    this.heat = 9;
    if (msg) toast(msg);
    AudioSys.bad();
    this.refreshStars();
  },
  pin(dt) { this.pinTime += dt; if (this.pinTime > 3) this.busted(); },
  unpin(dt) { this.pinTime = Math.max(0, this.pinTime - dt * 1.6); },
  refreshStars() {
    hud.stars.innerHTML = [0, 1, 2, 3, 4].map((i) =>
      `<span class="${i < this.wanted ? 'lit' : ''}">★</span>`).join('');
  },
  pay(n, why) {
    this.cash += n;
    save.cash = this.cash; save.store();
    hud.cash.textContent = `$${this.cash.toLocaleString()}`;
    if (n > 0) AudioSys.cash();
    if (why) toast(`${why} ${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString()}`);
  },
  setObjective(o) {
    this.clearObjective();
    if (!o) { hud.obj.textContent = ''; return; }
    this.objective = o;
    const geo = new T.CylinderGeometry(o.r * 0.55, o.r * 0.55, 42, 20, 1, true);
    const mat = new T.MeshBasicMaterial({
      color: 0xffc93e, transparent: true, opacity: 0.34,
      side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending,
    });
    o.marker = new T.Mesh(geo, mat);
    o.marker.position.set(o.x, 21, o.z);
    scene.add(o.marker);
    hud.obj.textContent = o.label;
  },
  clearObjective() {
    if (this.objective && this.objective.marker) scene.remove(this.objective.marker);
    this.objective = null;
  },
  checkObjective(dt) {
    const o = this.objective;
    if (!o) return;
    o.marker.material.opacity = 0.26 + Math.sin(this.time * 4) * 0.1;
    const d = Math.sqrt(dist2(playerCar.x, playerCar.z, o.x, o.z));
    hud.obj.textContent = `${o.label} — ${Math.round(d)}m`;
    if (d < o.r && !o.track) {
      const fn = o.onArrive;
      this.clearObjective();
      hud.obj.textContent = '';
      fn && fn();
    }
  },
  say(lines, done) {
    this.dialogQueue = [...lines];
    this.dialogDone = done || null;
    this.mode = 'dialog';
    this.nextLine();
  },
  nextLine() {
    const line = this.dialogQueue.shift();
    if (!line) {
      hud.dialog.style.display = 'none';
      this.mode = 'play';
      const done = this.dialogDone; this.dialogDone = null;
      done && done();
      return;
    }
    hud.dialog.querySelector('.who').textContent = line.who;
    hud.dialog.querySelector('.line').textContent = line.text;
    hud.dialog.style.display = 'block';
    AudioSys.blip(660, 0.05, 'sine', 0.03);
  },
  busted() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    banner('BUSTED', 'The law sends its regards');
    AudioSys.bad();
    this.endRun(0.12);
  },
  wasted() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    banner('WASTED', 'The sunset wins this round');
    AudioSys.bad();
    this.endRun(0.18);
  },
  endRun(fineRatio) {
    setTimeout(() => {
      hud.fader.style.opacity = '1';
      setTimeout(() => {
        const fine = Math.floor(this.cash * fineRatio);
        this.pay(-fine, 'Hospital & impound');
        this.wanted = 0; this.heat = 0; this.pinTime = 0;
        this.refreshStars();
        playerCar.repair();
        playerCar.x = PLACES.hospital.x; playerCar.z = PLACES.hospital.z + 16;
        playerCar.angle = 0; playerCar.speed = 0; playerCar.sync(0);
        for (const c of cruisers) { c.active = false; c.mesh.visible = false; }
        for (const c of footCops) { c.active = false; c.mesh.visible = false; }
        this.mode = 'play';
        hud.fader.style.opacity = '0';
        toast('You wake up outside Costa Verde General. The car, somehow, is fine.');
      }, 650);
    }, 1400);
  },
};
hud.cash.textContent = `$${Game.cash.toLocaleString()}`;
Game.refreshStars();

// ------------------------------------------------------------- phone & jobs
function openPhone() {
  if (Game.mode !== 'play') return;
  Game.mode = 'phone';
  const canJob = !Game.race && !Game.taxi;
  hud.phone.innerHTML = `
    <h3>Phone</h3>
    <div class="sub">Costa Verde, ${Game.jobIndex < JOBS.length ? `job ${Game.jobIndex + 1} of ${JOBS.length} waiting` : 'all jobs done — the city is yours'}</div>
    ${canJob ? '<button data-act="race">🏁 Sunset GP — street race</button>' : ''}
    ${canJob ? '<button data-act="taxi">🚕 Taxi shift — pick up a fare</button>' : ''}
    ${Game.jobIndex < JOBS.length ? '<button data-act="job">📍 Directions to the current job</button>' : ''}
    <button data-act="close">Put it away</button>`;
  hud.phone.style.display = 'block';
  hud.phone.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    closePhone();
    const act = b.dataset.act;
    if (act === 'race') startRace();
    else if (act === 'taxi') startTaxi();
    else if (act === 'job') toast('Follow the gold beacon — the minimap knows the way.');
  }));
}
function closePhone() {
  hud.phone.style.display = 'none';
  if (Game.mode === 'phone') Game.mode = 'play';
}

// ---------------------------------------------------------------- the jobs
function startJob(i) {
  if (i >= JOBS.length) {
    hud.job.textContent = 'Free roam — press M for work';
    hud.obj.textContent = '';
    return;
  }
  hud.job.textContent = `Job ${i + 1} — ${JOBS[i].title}`;
  JOBS[i].start();
}
function completeJob(amount, nextLine) {
  Game.pay(amount, 'Job complete:');
  Game.jobIndex++;
  save.job = Game.jobIndex; save.store();
  Game.jobTick = null;
  banner('JOB COMPLETE', nextLine || '', 2400);
  setTimeout(() => startJob(Game.jobIndex), 2600);
}
/** A steering helper for story cars: aim at a point, drive, don't be clever. */
function steerTo(car, tx, tz, dt, cruise = 24) {
  const want = Math.atan2(tx - car.x, tz - car.z);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const d = Math.sqrt(dist2(car.x, car.z, tx, tz));
  car.step(dt, {
    up: d > 6, down: d <= 6 && car.speed > 1,
    left: diff > 0.05, right: diff < -0.05, hand: false,
  });
  return d;
}

const JOBS = [
  {
    title: 'Welcome to Costa Verde', pay: 400,
    start() {
      Game.say([
        { who: 'Lena Cruz — phone', text: 'You actually came! Okay. Ground rules of Costa Verde: the sunsets are free, everything else costs.' },
        { who: 'Lena Cruz — phone', text: "I'm at the Hotel Miramar, south-east tower block. Pick me up and I'll show you the only view that matters." },
      ], () => {
        Game.setObjective({
          x: PLACES.hotel.x, z: PLACES.hotel.z + 18, r: 8, label: 'Pick up Lena at the Hotel Miramar',
          onArrive() {
            Game.say([
              { who: 'Lena Cruz', text: "There she is. Nice car — borrowed, stolen, or inherited? Don't answer. Drive: Vista Point, north edge of town." },
            ], () => {
              Game.setObjective({
                x: PLACES.vista.x, z: PLACES.vista.z, r: 9, label: 'Drive Lena to Vista Point',
                onArrive() {
                  Game.say([
                    { who: 'Lena Cruz', text: 'See that? Seven miles of water and not one honest man on it. Welcome home. There are people here who pay for drivers who don\'t talk. You don\'t talk, do you?' },
                    { who: 'Lena Cruz', text: "Good. Sal Bianchi will call you. Answer it." },
                  ], () => completeJob(400, 'Lena approves of you'));
                },
              });
            });
          },
        });
      });
    },
  },
  {
    title: 'Hot Property', pay: 800,
    start() {
      // the prize: a tangerine Comet GT, parked and unwatched
      const comet = new Car(makeCarMesh(0xff7a1a), { maxSpeed: 42, accel: 25 });
      comet.x = blockCenter(2); comet.z = blockCenter(4);
      comet.angle = Math.PI / 2; comet.sync(0);
      Game.say([
        { who: 'Sal Bianchi — phone', text: "Kid. Lena says you drive and you don't talk. Perfect. There's a Comet GT in the lot on Mercer and 4th whose owner owes me money and, tragically, his car." },
        { who: 'Sal Bianchi — phone', text: 'Take it. Bring it to my garage. If the police object, that is between you and the police.' },
      ], () => {
        Game.setObjective({
          x: comet.x, z: comet.z, r: 7, label: 'Steal the Comet GT',
          onArrive() {
            // the swap: the Comet is yours now, paint, pace and all
            playerCar.mesh.children[0].material.color.set(0xff7a1a);
            playerCar.mesh.children[1].material.color.set(0xff7a1a);
            playerCar.maxSpeed = 42;
            comet.mesh.visible = false;
            Game.crime(2, 'Grand theft auto — the law noticed!');
            Game.say([
              { who: 'Sal Bianchi — phone', text: "You're in it? Beautiful. Now bring her home — and lose the sirens first, I run a respectable garage." },
            ], () => {
              Game.setObjective({
                x: PLACES.garage.x, z: PLACES.garage.z + 14, r: 9, label: "Deliver the Comet to Sal's garage",
                onArrive() {
                  Game.wanted = 0; Game.heat = 0; Game.refreshStars();
                  Game.say([
                    { who: 'Sal Bianchi', text: 'Look at her. Not a scratch that matters. My friends downtown lost the paperwork, so keep the car — call it a signing bonus.' },
                  ], () => completeJob(800, 'Sal owes you one'));
                },
              });
            });
          },
        });
      });
    },
  },
  {
    title: 'Marina Run', pay: 1100,
    start() {
      Game.say([
        { who: 'Mateo Reyes — phone', text: "Amigo! I run the boats at the marina — the middle pier, south shore. Come see me. Bring the fast car, leave the conscience." },
      ], () => {
        Game.setObjective({
          x: -6, z: 306, r: 9, label: 'Meet Mateo at the marina',
          onArrive() {
            Game.say([
              { who: 'Mateo Reyes', text: "There's a crate at the foot of my pier. Fish, officially. Heavy fish. Take it to my cousin's warehouse, north-east side, and don't open it, don't drop it, don't race anyone. Much." },
            ], () => {
              Game.setObjective({
                x: 10, z: 320, r: 8, label: 'Collect the crate from the pier',
                onArrive() {
                  Game.setObjective({
                    x: roadLine(7), z: roadLine(1), r: 10, label: "Deliver the crate to the warehouse",
                    onArrive() {
                      Game.say([
                        { who: 'Mateo Reyes — phone', text: 'Delivered, sealed, and nobody drowned. You are wasted on honest work, amigo.' },
                      ], () => completeJob(1100, 'The fish are safe'));
                    },
                  });
                },
              });
            });
          },
        });
      });
    },
  },
  {
    title: 'Payback Time', pay: 1500,
    start() {
      const vipers = [];
      for (let k = 0; k < 5; k++) {
        const v = new Car(makeCarMesh(0x8e2bd8), { maxSpeed: 36, accel: 22 });
        const line = roadLine(1 + Math.floor(rng() * 8));
        v.x = rng() < 0.5 ? line : -HALF + rng() * GRID * PITCH;
        v.z = rng() < 0.5 ? -HALF + rng() * GRID * PITCH : line;
        v.health = 45;
        v.sync(0);
        v.onDeath = () => {
          const left = vipers.filter((o) => !o.dead).length;
          toast(left > 0 ? `Viper down — ${left} to go` : 'That is the last Viper');
          AudioSys.cash();
          if (left === 0) {
            Game.jobTick = null;
            Game.clearObjective();
            Game.say([
              { who: 'Sal Bianchi — phone', text: 'Five purple wrecks. The Vipers send their regards and, more importantly, their surrender. Come by sometime, I\'ll make pasta.' },
            ], () => completeJob(1500, 'The Vipers are done'));
          }
        };
        vipers.push(v);
      }
      Game.trafficExtra = vipers;
      Game.say([
        { who: 'Sal Bianchi — phone', text: 'The Vipers — purple cars, purple jackets, no imagination — ran my nephew off the road. Five of them cruise this city. Introduce their cars to the concept of consequences.' },
      ], () => {
        Game.setObjective({ x: vipers[0].x, z: vipers[0].z, r: 6, track: true, label: 'Wreck the Vipers (0/5)', onArrive() { } });
        let retarget = 0;
        Game.jobTick = (dt) => {
          for (const v of vipers) {
            if (v.dead) { v.sync(dt); continue; }
            // flee the player, favouring open road ahead
            const away = Math.atan2(v.x - playerCar.x, v.z - playerCar.z);
            const tx = v.x + Math.sin(away) * 60, tz = v.z + Math.cos(away) * 60;
            steerTo(v, clamp(tx, -HALF, HALF), clamp(tz, -HALF, SEA_Z - 8), dt, 30);
          }
          retarget -= dt;
          if (retarget <= 0 && Game.objective) {
            retarget = 0.4;
            const alive = vipers.filter((v) => !v.dead);
            if (alive.length) {
              alive.sort((a, b) => dist2(a.x, a.z, playerCar.x, playerCar.z) - dist2(b.x, b.z, playerCar.x, playerCar.z));
              const t = alive[0];
              Game.objective.x = t.x; Game.objective.z = t.z;
              Game.objective.marker.position.set(t.x, 21, t.z);
              Game.objective.label = `Wreck the Vipers (${5 - alive.length}/5)`;
            }
          }
        };
      });
    },
  },
  {
    title: 'The Informant', pay: 1800,
    start() {
      const meetX = roadLine(6), meetZ = roadLine(3);
      Game.setObjective({
        x: meetX, z: meetZ + 6, r: 8, label: 'Meet the informant (east side)',
        onArrive() {
          Game.say([
            { who: 'Officer Dana Ruiz', text: "Don't look so surprised — half this city works for me, the other half works against me, and you're about to pick a side." },
            { who: 'Officer Dana Ruiz', text: 'A grey sedan is moving product across town. Tail it. Stay close enough to see, far enough to be furniture. Forty seconds of eyes and I pay you like a citizen.' },
          ], () => {
            const suspect = new Car(makeCarMesh(0x9aa0a8), { maxSpeed: 21, accel: 13 });
            suspect.x = roadLine(2); suspect.z = roadLine(2);
            suspect.sync(0);
            Game.trafficExtra = [suspect];
            const route = [
              [roadLine(2), roadLine(2)], [roadLine(7), roadLine(2)], [roadLine(7), roadLine(6)],
              [roadLine(3), roadLine(6)], [roadLine(3), roadLine(3)], [roadLine(6), roadLine(3)],
            ];
            let wp = 1, progress = 0, tooClose = 0, losing = 0;
            Game.setObjective({ x: suspect.x, z: suspect.z, r: 6, track: true, label: 'Tail the grey sedan', onArrive() { } });
            Game.jobTick = (dt) => {
              if (steerTo(suspect, route[wp][0], route[wp][1], dt) < 8) wp = (wp + 1) % route.length;
              if (Game.objective) {
                Game.objective.x = suspect.x; Game.objective.z = suspect.z;
                Game.objective.marker.position.set(suspect.x, 21, suspect.z);
              }
              const d = Math.sqrt(dist2(playerCar.x, playerCar.z, suspect.x, suspect.z));
              if (Game.debugTail) { progress = 40; Game.debugTail = false; }
              if (d >= 15 && d <= 62) { progress += dt; tooClose = Math.max(0, tooClose - dt); losing = 0; }
              else if (d < 15) { tooClose += dt; if (tooClose > 2 && Math.floor(tooClose) === 2) toast('Too close — back off!'); }
              else { losing += dt; if (losing > 3 && Math.floor(losing) === 3) toast('You are losing the sedan!'); }
              if (Game.objective) Game.objective.label = `Tail the sedan — eyes on: ${Math.floor(progress)}/40s`;
              if (tooClose > 6 || losing > 20) {
                progress = 0; tooClose = 0; losing = 0;
                toast('The tail went cold — pick it up again');
                AudioSys.bad();
              }
              if (progress >= 40) {
                Game.jobTick = null;
                Game.trafficExtra = [];
                suspect.mesh.visible = false;
                Game.setObjective({
                  x: meetX, z: meetZ + 6, r: 8, label: 'Report back to Dana',
                  onArrive() {
                    Game.say([
                      { who: 'Officer Dana Ruiz', text: 'Forty seconds of clean surveillance. You know, with a badge you\'d be dangerous. Without one, you\'re just useful. There\'s a difference, and it pays $1,800.' },
                    ], () => completeJob(1800, 'Dana trusts you now'));
                  },
                });
              }
            };
          });
        },
      });
    },
  },
  {
    title: 'The Big Score', pay: 2500,
    start() {
      Game.say([
        { who: 'Sal Bianchi — phone', text: 'Tonight we stop being employees. Four drops, one bag, every alarm in the city wired to it. The law will be at three stars before you finish reading this.' },
        { who: 'Sal Bianchi — phone', text: "Ninety seconds a leg. Don't stop to sightsee." },
      ], () => {
        const legs = [
          [roadLine(1), roadLine(7)], [roadLine(8), roadLine(6)],
          [roadLine(7), roadLine(1)], [PLACES.garage.x, PLACES.garage.z + 14],
        ];
        let leg = 0, clock = 95;
        Game.crime(3, 'The Big Score is on!');
        const armLeg = () => {
          clock = 95;
          Game.setObjective({
            x: legs[leg][0], z: legs[leg][1], r: 10,
            label: `Drop ${leg + 1} of 4 — move!`,
            onArrive() {
              leg++;
              AudioSys.cash();
              if (leg >= legs.length) {
                Game.jobTick = null;
                Game.wanted = Math.min(Game.wanted, 1);
                Game.say([
                  { who: 'Sal Bianchi', text: 'Four drops, no witnesses, one legend. Split\'s in your account. We never met, we never spoke, we are absolutely doing this again.' },
                ], () => completeJob(2500, 'The Big Score lands'));
              } else {
                toast(`Drop made — ${legs.length - leg} to go`);
                armLeg();
              }
            },
          });
        };
        armLeg();
        Game.jobTick = (dt) => {
          Game.wanted = Math.max(Game.wanted, 3);
          Game.heat = Math.max(Game.heat, 4);
          clock -= dt;
          if (Game.objective) Game.objective.label = `Drop ${leg + 1} of 4 — ${Math.ceil(clock)}s`;
          if (clock <= 0) {
            Game.jobTick = null;
            Game.clearObjective();
            Game.wanted = 1; Game.heat = 0; Game.refreshStars();
            Game.say([
              { who: 'Sal Bianchi — phone', text: 'Too slow — the bag went cold and so did the buyers. Breathe. We run it again when you\'re ready.' },
            ], () => startJob(5));
          }
        };
      });
    },
  },
  {
    title: 'Sunset Showdown', pay: 4000,
    start() {
      Game.say([
        { who: 'Lena Cruz — phone', text: "The man who owns the Vipers, the pier, and half the police is leaving Costa Verde tonight — north gate, black Comet, no plates. If he leaves, everything you did here gets undone by lawyers." },
        { who: 'Officer Dana Ruiz — phone', text: 'Officially, I never called. Unofficially: stop that car before the north gate and the city owes you a sunset.' },
      ], () => {
        const boss = new Car(makeCarMesh(0x0c0c10), { maxSpeed: 41, accel: 25 });
        boss.x = roadLine(4); boss.z = HALF - 20;
        boss.angle = Math.PI; boss.health = 170;
        boss.sync(0);
        Game.trafficExtra = [boss];
        Game.crime(2, 'Stop the black Comet!');
        Game.setObjective({ x: boss.x, z: boss.z, r: 6, track: true, label: 'Stop the black Comet before the north gate', onArrive() { } });
        boss.onDeath = () => {
          Game.jobTick = null;
          Game.trafficExtra = [];
          Game.clearObjective();
          Game.wanted = 0; Game.heat = 0; Game.refreshStars();
          save.finished = true; save.store();
          Game.say([
            { who: 'Lena Cruz', text: 'He\'s done. The pier, the Vipers, the paperwork — all of it washes out with the tide tonight.' },
            { who: 'Mateo Reyes — phone', text: 'Amigo, the marina is yours whenever. First boat ride is free. The fish, officially, remain fish.' },
            { who: 'Lena Cruz', text: 'Seven jobs, one sunset, every cop in the city — and you\'re still standing. Costa Verde is yours now, driver.' },
          ], () => completeJob(4000, 'SUNSET BOULEVARD — COMPLETE'));
        };
        Game.jobTick = (dt) => {
          if (boss.dead) return;
          steerTo(boss, roadLine(4) + Math.sin(Game.time * 0.7) * 3, -HALF - 30, dt, 38);
          if (Game.objective) {
            Game.objective.x = boss.x; Game.objective.z = boss.z;
            Game.objective.marker.position.set(boss.x, 21, boss.z);
          }
          if (boss.z < -HALF - 16) {
            Game.jobTick = null;
            Game.trafficExtra = [];
            boss.mesh.visible = false;
            Game.clearObjective();
            Game.wanted = 0; Game.heat = 0; Game.refreshStars();
            Game.say([
              { who: 'Lena Cruz — phone', text: 'He made the gate. The lawyers win this round — but he has to sleep somewhere, and so does his car. We go again.' },
            ], () => startJob(6));
          }
        };
      });
    },
  },
];

// ---------------------------------------------------------------- side work
const RACE_CPS = [
  [roadLine(5), roadLine(6)], [roadLine(5), roadLine(2)], [roadLine(8), roadLine(2)],
  [roadLine(8), roadLine(5)], [roadLine(6), roadLine(5)], [roadLine(6), roadLine(8)],
  [roadLine(3), roadLine(8)], [roadLine(3), roadLine(6)], [roadLine(5), HALF - 12],
];
function startRace() {
  if (Game.race || Game.taxi) return;
  Game.setObjective({
    x: PLACES.raceStart.x, z: PLACES.raceStart.z, r: 9, label: 'Get to the Sunset GP grid',
    onArrive() {
      const rivals = [];
      const cols = [0xd64541, 0xf2c230, 0x4a90d9];
      for (let k = 0; k < 3; k++) {
        const rc = new Car(makeCarMesh(cols[k]), { maxSpeed: 35.5 + k * 0.8, accel: 22 });
        rc.x = PLACES.raceStart.x - 6 + k * 6;
        rc.z = PLACES.raceStart.z + 7;
        rc.angle = Math.PI;
        rc.sync(0);
        rivals.push({ car: rc, cp: 0, done: false, t: 0 });
      }
      Game.race = { t: 0, cp: 0, rivals, over: false };
      Game.trafficExtra = rivals.map((r) => r.car);
      banner('SUNSET GP', 'Nine checkpoints. No rules worth mentioning.', 2200);
      Game.setObjective({
        x: RACE_CPS[0][0], z: RACE_CPS[0][1], r: 13, label: 'Checkpoint 1/9',
        onArrive() { raceCheckpoint(); },
      });
    },
  });
  toast('Sunset GP: the grid is on the south boulevard');
}
function raceCheckpoint() {
  const race = Game.race;
  if (!race) return;
  race.cp++;
  AudioSys.blip(990, 0.07, 'square', 0.05);
  if (race.cp >= RACE_CPS.length) { finishRace(); return; }
  Game.setObjective({
    x: RACE_CPS[race.cp][0], z: RACE_CPS[race.cp][1], r: 13,
    label: `Checkpoint ${race.cp + 1}/9`,
    onArrive() { raceCheckpoint(); },
  });
}
function raceTick(dt) {
  const race = Game.race;
  if (!race || race.over) return;
  race.t += dt;
  for (const r of race.rivals) {
    if (r.done) { r.car.sync(dt); continue; }
    const [tx, tz] = RACE_CPS[Math.min(r.cp, RACE_CPS.length - 1)];
    if (steerTo(r.car, tx, tz, dt) < 14) {
      r.cp++;
      if (r.cp >= RACE_CPS.length) { r.done = true; r.t = race.t; }
    }
  }
  if (Game.objective && !race.over) {
    hud.obj.textContent = `Checkpoint ${Math.min(race.cp + 1, 9)}/9 — ${race.t.toFixed(1)}s`;
  }
}
function finishRace() {
  const race = Game.race;
  race.over = true;
  const ahead = race.rivals.filter((r) => r.done && r.t <= race.t).length +
    race.rivals.filter((r) => !r.done && r.cp > race.cp).length;
  const place = ahead + 1;
  const prize = [600, 300, 150, 75][place - 1] || 75;
  Game.pay(prize, `Sunset GP — P${place}:`);
  if (save.bestRace === 0 || race.t < save.bestRace) {
    save.bestRace = race.t; save.store();
    toast(`New GP best: ${race.t.toFixed(1)}s`);
  }
  banner(`P${place} — SUNSET GP`, `${race.t.toFixed(1)} seconds`, 2800);
  for (const r of race.rivals) r.car.mesh.visible = false;
  Game.trafficExtra = [];
  Game.race = null;
}

function startTaxi() {
  if (Game.taxi || Game.race) return;
  const px = roadLine(1 + Math.floor(rng() * 8));
  const pz = roadLine(1 + Math.floor(rng() * 8));
  const fare = { phase: 'pickup', x: px, z: pz, t: 0, mesh: makePed(0xffd23e) };
  fare.mesh.position.set(px, 0, pz);
  Game.taxi = fare;
  Game.setObjective({
    x: px, z: pz, r: 6, label: 'Pick up your fare',
    onArrive() {
      fare.phase = 'drop';
      fare.mesh.visible = false;
      const dx = roadLine(1 + Math.floor(rng() * 8)), dz = roadLine(1 + Math.floor(rng() * 8));
      fare.x = dx; fare.z = dz;
      fare.dist = Math.sqrt(dist2(playerCar.x, playerCar.z, dx, dz));
      AudioSys.blip(740, 0.06, 'sine', 0.04);
      Game.setObjective({
        x: dx, z: dz, r: 8, label: 'Drop off your fare',
        onArrive() {
          const tip = fare.t < fare.dist / 9 ? 35 : 0;
          const total = Math.round(45 + fare.dist * 0.09 + tip);
          Game.pay(total, tip ? 'Fare + speedy tip:' : 'Fare:');
          save.taxis++; save.store();
          Game.taxi = null;
          toast('The city always needs drivers — M for another fare');
        },
      });
    },
  });
  toast('Taxi shift: a fare is waiting — follow the beacon');
}
function taxiTick(dt) { if (Game.taxi) Game.taxi.t += dt; }

// ---------------------------------------------------------------- minimap
function drawMinimap() {
  const g = hud.minimap, S = 176, scale = S / 660;
  const px = (x) => (x + 330) * scale, pz = (z) => (z + 330) * scale;
  g.fillStyle = '#20242e'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#2b6f8e'; g.fillRect(0, pz(SEA_Z), S, S - pz(SEA_Z));
  g.fillStyle = '#8f8578';
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    g.fillRect(px(blockMin(i)), pz(blockMin(j)), BLOCK * scale, BLOCK * scale);
  }
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
  for (let k = 0; k <= GRID; k++) {
    g.beginPath(); g.moveTo(px(roadLine(k)), pz(-HALF)); g.lineTo(px(roadLine(k)), pz(HALF)); g.stroke();
    g.beginPath(); g.moveTo(px(-HALF), pz(roadLine(k))); g.lineTo(px(HALF), pz(roadLine(k))); g.stroke();
  }
  const o = Game.objective;
  if (o) {
    g.fillStyle = '#ffc93e';
    g.beginPath(); g.arc(px(o.x), pz(o.z), 4.5, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#e8e8e8';
  for (const c of traffic) { if (!c.dead) g.fillRect(px(c.x) - 1, pz(c.z) - 1, 2, 2); }
  for (const c of Game.trafficExtra || []) {
    g.fillStyle = '#c77dff';
    g.fillRect(px(c.x) - 2, pz(c.z) - 2, 4, 4);
    g.fillStyle = '#e8e8e8';
  }
  g.fillStyle = '#ff4040';
  for (const c of cruisers) if (c.active) { g.beginPath(); g.arc(px(c.x), pz(c.z), 3, 0, Math.PI * 2); g.fill(); }
  // the player: a white arrow that turns with the car
  g.save();
  g.translate(px(playerCar.x), pz(playerCar.z));
  g.rotate(playerCar.angle);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill();
  g.restore();
}

// ---------------------------------------------------------------- the loop
// Fixed-step simulation (60 Hz) decoupled from the render rate: a slow
// headless frame still advances the world honestly, just in more steps.
const STEP = 1 / 60;
let lastNow = performance.now(), accumulator = 0, framesRendered = 0;

function step(dt) {
  Game.time += dt;
  for (const fn of dynamics) fn(dt, Game.time);
  if (Game.mode !== 'play') return;

  playerCar.step(dt, input);
  Game.checkObjective(dt);
  if (Game.jobTick) Game.jobTick(dt);
  raceTick(dt);
  taxiTick(dt);

  // the law forgets, slowly, when you stay clean
  if (Game.wanted > 0) {
    Game.heat -= dt;
    if (Game.heat <= 0) {
      Game.wanted--;
      Game.refreshStars();
      Game.heat = Game.wanted > 0 ? 7 : 0;
      if (Game.wanted === 0) toast('You lost the law. For now.');
    }
  }
  Game.crashCd = Math.max(0, (Game.crashCd || 0) - dt);

  driveTraffic(dt);
  stepPeds(dt);
  const pack = [playerCar, ...traffic,
    ...cruisers.filter((c) => c.active),
    ...(Game.trafficExtra || [])];
  carBumps(pack, (closing, other) => {
    if (Game.crashCd > 0 || closing < 7) return;
    Game.crashCd = 2.5;
    if (other && other.mesh && cruisers.includes(other)) Game.crime(1, 'You rammed a police cruiser!');
    else Game.crime(1, 'Hit and run!');
  });
  stepPolice(dt, Game.time);
  stepFootCops(dt);
  stepHeli(dt, Game.time);

  hud.speed.textContent = String(Math.round(Math.abs(playerCar.speed) * 2.4));
  hud.health.style.width = `${playerCar.health}%`;
  AudioSys.setEngine(Math.abs(playerCar.speed) / playerCar.maxSpeed, true);
}

function updateCamera(dt) {
  if (stage === 'vista') {
    camera.position.set(255, 135, 385);
    camera.lookAt(-50, 0, -80);
    return;
  }
  if (stage === 'chase') {
    // a frozen cinematic angle: the car, both cruisers and the helicopter
    camera.position.set(playerCar.x + 11, 6.5, playerCar.z + 18);
    camera.lookAt(playerCar.x - 2, 1.2, playerCar.z - 16);
    return;
  }
  if (Game.mode === 'title') {
    const t = performance.now() * 0.00004;
    camera.position.set(Math.sin(t) * 300, 105, Math.cos(t) * 300 + 60);
    camera.lookAt(0, 12, 0);
    return;
  }
  const fx = Math.sin(playerCar.angle), fz = Math.cos(playerCar.angle);
  const want = {
    x: playerCar.x - fx * 11.5,
    y: 5.2 + Math.abs(playerCar.speed) * 0.02,
    z: playerCar.z - fz * 11.5,
  };
  const k = 1 - Math.pow(0.0015, dt);
  camera.position.x = lerp(camera.position.x, want.x, k);
  camera.position.y = lerp(camera.position.y, want.y, k);
  camera.position.z = lerp(camera.position.z, want.z, k);
  camera.lookAt(playerCar.x + fx * 9, 1.6, playerCar.z + fz * 9);
  sun.position.set(playerCar.x - 260, 230, playerCar.z - 120);
  sun.target.position.set(playerCar.x, 0, playerCar.z);
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastNow) / 1000;
  lastNow = now;
  if (dt > 0.3) dt = 0.3;
  accumulator += dt;
  while (accumulator >= STEP) { step(STEP); accumulator -= STEP; }
  updateCamera(dt);
  drawMinimap();
  renderer.render(scene, camera);
  framesRendered++;
  if (stage && framesRendered > 20) window.__stageReady = true;
}

// ---------------------------------------------------------------- staging
// #stage=<name> poses the game for the dossier stills: start (the title
// over the city), chase (three stars, mid-pursuit), story (Mateo, on the
// pier), vista (the whole bay at golden hour).
const stage = (location.hash.match(/stage=(\w+)/) || [])[1] || null;

function beginGame() {
  if (Game.started) return;
  Game.started = true;
  hud.start.style.display = 'none';
  AudioSys.init();
  Game.mode = 'play';
  startJob(Game.jobIndex);
}
hud.start.addEventListener('click', beginGame);
hud.dialog.addEventListener('click', () => { if (Game.mode === 'dialog') Game.nextLine(); });
addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    if (Game.mode === 'dialog') Game.nextLine();
    else if (Game.mode === 'title') beginGame();
  }
  if (e.code === 'KeyM') {
    if (Game.mode === 'phone') closePhone();
    else openPhone();
  }
  if (e.code === 'KeyP') {
    if (Game.mode === 'play') { Game.mode = 'pause'; banner('PAUSED', 'Press P to roll on', 1200); }
    else if (Game.mode === 'pause') Game.mode = 'play';
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function applyStage() {
  if (!stage) return;
  if (stage === 'start') return; // the title screen, orbiting — as shipped
  hud.start.style.display = 'none';
  Game.started = true;
  if (stage === 'vista') { Game.mode = 'title'; return; }
  Game.mode = 'play';
  hud.job.textContent = 'Job 3 — Marina Run';
  if (stage === 'chase') {
    playerCar.x = roadLine(5); playerCar.z = 40;
    playerCar.angle = Math.PI; playerCar.speed = 0;
    playerCar.mesh.children[0].material.color.set(0xff7a1a);
    playerCar.mesh.children[1].material.color.set(0xff7a1a);
    playerCar.sync(0);
    Game.wanted = 3; Game.heat = 30; Game.refreshStars();
    cruisers.forEach((c, i) => {
      if (i < 2) {
        c.active = true; c.mesh.visible = true;
        c.x = roadLine(5) + (i === 0 ? -3.6 : 3.8);
        c.z = 40 + (i === 0 ? 7 : 13);
        c.angle = Math.PI; c.speed = 0; c.sync(0);
        const bars = c.mesh.userData.barLights;
        if (bars) { bars[0].emissiveIntensity = 2.6; bars[1].emissiveIntensity = 0.4; }
      }
    });
    heli.group.visible = true;
    heli.group.position.set(playerCar.x + 13, 27, playerCar.z - 12);
    heli.light.intensity = 2.2;
    heli.light.target.position.set(playerCar.x - heli.group.position.x, -27, playerCar.z - heli.group.position.z);
    Game.mode = 'dialog'; // frozen tableau: the world holds its breath
  }
  if (stage === 'story') {
    playerCar.x = 6; playerCar.z = 310;
    playerCar.angle = 0.15; playerCar.sync(0);
    Game.say([
      { who: 'Mateo Reyes', text: "There's a crate at the foot of my pier. Fish, officially. Heavy fish. Take it north, don't open it, don't drop it — and amigo, don't race anyone. Much." },
    ], () => { Game.mode = 'dialog'; hud.dialog.style.display = 'block'; });
    Game.mode = 'dialog';
  }
}

// ---------------------------------------------------------------- test rig
// A small, honest handle for the scripted playtest: read the state, drive
// the car, walk the story. Nothing here a player cannot do with keys.
window.CV = {
  state: () => ({
    mode: Game.mode, cash: Game.cash, wanted: Game.wanted, job: Game.jobIndex,
    health: playerCar.health, speed: Math.round(playerCar.speed),
    x: Math.round(playerCar.x), z: Math.round(playerCar.z),
    objective: Game.objective ? Game.objective.label : null,
    racing: !!Game.race, taxi: !!Game.taxi,
    cruisersOut: cruisers.filter((c) => c.active).length,
    buildings: buildingCount,
    save: { ...save },
  }),
  start: () => beginGame(),
  advance: () => { if (Game.mode === 'dialog') Game.nextLine(); },
  teleport: (x, z) => { playerCar.x = x; playerCar.z = z; playerCar.speed = 0; playerCar.sync(0); },
  gotoObjective: () => {
    const o = Game.objective;
    if (o) { playerCar.x = o.x + o.r + 5; playerCar.z = o.z; playerCar.speed = 0; playerCar.sync(0); }
  },
  objPos: () => (Game.objective ? { x: Game.objective.x, z: Game.objective.z, r: Game.objective.r } : null),
  hold: (k, on) => { virtual[k] = !!on; },
  releaseAll: () => { for (const k of Object.keys(virtual)) virtual[k] = false; },
  setWanted: (n) => { Game.wanted = n; Game.heat = 12; Game.refreshStars(); },
  hurt: (n) => playerCar.hurt(n),
  bust: () => Game.busted(),
  phone: () => openPhone(),
  race: () => startRace(),
  taxi: () => startTaxi(),
  tailBoost: () => { Game.debugTail = true; },
  killExtras: () => { for (const c of Game.trafficExtra || []) c.hurt(99999); },
  wipe: () => { save.wipe(); location.reload(); },
};

// ---------------------------------------------------------------- boot
spawnTraffic();
spawnPeds();
spawnCruisers();
spawnFootCops();
buildHeli();
applyStage();
requestAnimationFrame(frame);
