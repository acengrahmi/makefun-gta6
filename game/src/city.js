// city.js — builds the whole static world of Costa Verde into a THREE group:
// the 9x9 street grid, ~97 buildings in three styles with neon billboards,
// the palm-lined hero boulevard, and the waterfront (glittering sea,
// boardwalk, three piers, beach umbrellas, sailboats) under a low sun.
// Returns the group plus building colliders, story anchors and a tick()
// for the animated dressing (glitter, bobbing boats, flickering neon).

import { CENTERS, PITCH, STREET_HALF, BOULEVARD_HALF, BOARDWALK_Z, BEACH_Z, SEA_Z, mulberry32, rand, pick } from './util.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function windowTexture(base, lit) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 8; y += 16) for (let x = 8; x < w - 8; x += 14) {
      g.fillStyle = Math.random() < 0.42 ? lit : 'rgba(20,24,38,0.85)';
      g.fillRect(x, y, 9, 10);
    }
  });
}

function neonTexture(text, fg, bg) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = fg; g.shadowBlur = 26; g.fillStyle = fg;
    g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 8; g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2);
  });
}

const NEON_SIGNS = [
  ['HOTEL SOL', '#ff5da2', '#1b0f2e'], ['COSTA VERDE', '#ffd23f', '#101d33'],
  ['COMET GT', '#4de3ff', '#0d1b2a'], ['SUNSET GP', '#ff7847', '#220f1a'],
  ['PALMS CLUB', '#7dff6a', '#0f2412'], ['MARINA', '#5db9ff', '#0a1a2e'],
  ['TACOS 24H', '#ffe95d', '#26130a'], ['HOTEL SOL', '#ff5da2', '#1b0f2e'],
];

export function buildCity(scene) {
  const rng = mulberry32(20261118);
  const group = new THREE.Group();
  const colliders = [];
  const tickers = [];
  let buildingCount = 0;

  // ---- sky, sun, sea glitter ---------------------------------------------
  const skyTex = canvasTexture(4, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2c1e56'); grad.addColorStop(0.45, '#7a3d6e');
    grad.addColorStop(0.72, '#e2603f'); grad.addColorStop(0.88, '#ffb347');
    grad.addColorStop(1, '#ffd98a');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  sky.position.y = -40;
  group.add(sky);

  const sunDir = new THREE.Vector3(-0.38, 0.16, 1).normalize();
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(70, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }),
  );
  sunDisc.position.copy(sunDir).multiplyScalar(1350); sunDisc.position.y = 150;
  sunDisc.lookAt(0, 40, 0);
  group.add(sunDisc);
  const glowTex = canvasTexture(256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,190,90,0.85)'); grad.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  // a flat glow disc in the sun's own plane (a camera-facing sprite
  // blended unevenly over the sun disc, so the glow is geometry instead)
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(230, 32),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, fog: false, depthWrite: false }),
  );
  glow.position.copy(sunDir).multiplyScalar(1340); glow.position.y = 150;
  glow.lookAt(0, 40, 0);
  group.add(glow);

  // ---- ground, streets, sidewalks ----------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 620),
    new THREE.MeshLambertMaterial({ color: 0x9a8f7d }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const asphalt = new THREE.MeshLambertMaterial({ color: 0x33323c });
  const boulevardMat = new THREE.MeshLambertMaterial({ color: 0x3d3548 });
  for (const c of CENTERS) {
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(560, c === 0 ? BOULEVARD_HALF * 2 : STREET_HALF * 2), c === 0 ? boulevardMat : asphalt);
    ew.rotation.x = -Math.PI / 2; ew.position.set(0, 0.01, c); ew.receiveShadow = true; group.add(ew);
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(STREET_HALF * 2, 560), asphalt);
    ns.rotation.x = -Math.PI / 2; ns.position.set(c, 0.01, 0); ns.receiveShadow = true; group.add(ns);
  }
  // boulevard median
  const median = new THREE.Mesh(new THREE.BoxGeometry(540, 0.5, 3), new THREE.MeshLambertMaterial({ color: 0x6d7c5f }));
  median.position.set(0, 0.25, 0); group.add(median);

  // ---- palms ---------------------------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d, side: THREE.DoubleSide });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7, 6);
  const frondGeo = new THREE.PlaneGeometry(0.7, 4.4);
  function palm(x, z, s = 1) {
    const p = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5; trunk.rotation.z = rand(rng, -0.06, 0.06); trunk.castShadow = true;
    p.add(trunk);
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(frondGeo, frondMat);
      const a = (i / 7) * Math.PI * 2;
      f.position.set(Math.sin(a) * 1.6, 7.3, Math.cos(a) * 1.6);
      f.rotation.set(0.9, a, 0, 'YXZ');
      p.add(f);
    }
    p.position.set(x, 0, z); p.scale.setScalar(s);
    group.add(p);
  }
  for (let x = -260; x <= 260; x += 26) palm(x, 0, rand(rng, 0.9, 1.15));
  for (let x = -264; x <= 264; x += 24) palm(x, BOARDWALK_Z - 6, rand(rng, 0.85, 1.1));

  // ---- buildings -------------------------------------------------------------
  const glassTex = windowTexture('#3a4a6b', '#ffd98a');
  const glassMat = new THREE.MeshLambertMaterial({ map: glassTex });
  const stuccoMats = [0xf2b880, 0xa8d5ba, 0xf7e8c9, 0xe88ca0, 0x9fc6e8].map(
    (c) => new THREE.MeshLambertMaterial({ color: c }),
  );
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a4a42 });
  let neonIdx = 0;
  function building(x, z, w, d, h, style) {
    buildingCount++;
    let mat;
    if (style === 0) mat = glassMat;
    else mat = pick(rng, stuccoMats);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z);
    b.castShadow = true; b.receiveShadow = true;
    group.add(b);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.7, d + 0.8), roofMat);
    roof.position.set(x, h + 0.35, z);
    group.add(roof);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    // neon billboard on boulevard-facing and waterfront buildings
    if ((Math.abs(z) < 40 || z > 180) && neonIdx < NEON_SIGNS.length * 3) {
      const [text, fg, bg] = NEON_SIGNS[neonIdx++ % NEON_SIGNS.length];
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.9, 15), 3.6),
        new THREE.MeshBasicMaterial({ map: neonTexture(text, fg, bg) }),
      );
      const faceSouth = z >= 0;
      sign.position.set(x, h - 3.4, z + (faceSouth ? d / 2 + 0.15 : -d / 2 - 0.15));
      if (!faceSouth) sign.rotation.y = Math.PI;
      group.add(sign);
      if (neonIdx % 5 === 0) tickers.push((t) => { sign.material.color.setScalar(0.85 + 0.15 * Math.sin(t * 9 + x)); });
    }
    return b;
  }

  const blockCenters = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) blockCenters.push([-210 + i * PITCH, -210 + j * PITCH]);
  for (const [bx, bz] of blockCenters) {
    const hsh = Math.abs(Math.sin(bx * 12.9898 + bz * 78.233) * 43758.5453) % 1;
    if (hsh < 0.4) {
      building(bx, bz, rand(rng, 20, 26), rand(rng, 20, 26), rand(rng, 34, 68), 0); // glass tower
    } else if (hsh < 0.7) {
      building(bx - 11, bz, 18, rand(rng, 24, 30), rand(rng, 13, 22), 1);          // slab pair
      building(bx + 11, bz, 18, rand(rng, 24, 30), rand(rng, 13, 22), 1);
    } else {
      building(bx, bz, rand(rng, 30, 36), rand(rng, 30, 36), rand(rng, 7, 11), 2); // lowrise + annex
      building(bx + rand(rng, -8, 8), bz - 14, 14, 10, rand(rng, 5, 7), 2);
    }
  }
  // seven waterfront hotel towers on the promenade
  for (let i = 0; i < 7; i++) building(-210 + i * 70, 256, 18, 14, rand(rng, 26, 44), i % 2 ? 1 : 0);

  // police station + hospital markers (distinct blocks, signed)
  function landmark(x, z, text, color, flip) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 3.2),
      new THREE.MeshBasicMaterial({ map: neonTexture(text, color, '#141824') }),
    );
    sign.position.set(x, 9, z);
    if (flip) sign.rotation.y = Math.PI;
    group.add(sign);
  }
  landmark(150, -124, 'POLICE', '#5db9ff', false);
  landmark(-150, 124, 'HOSPITAL', '#ff6a6a', true);

  // ---- waterfront: boardwalk, beach, piers, sea -----------------------------
  const walk = new THREE.Mesh(new THREE.BoxGeometry(560, 0.4, 10), new THREE.MeshLambertMaterial({ color: 0xa9835a }));
  walk.position.set(0, 0.2, BOARDWALK_Z); walk.receiveShadow = true; group.add(walk);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(620, 44), new THREE.MeshLambertMaterial({ color: 0xe8cf9e }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, BEACH_Z + 8); sand.receiveShadow = true; group.add(sand);

  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  for (const px of [-150, 0, 150]) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 92), pierMat);
    deck.position.set(px, 0.9, SEA_Z + 42); deck.castShadow = true; group.add(deck);
    for (let pz = SEA_Z + 4; pz < SEA_Z + 88; pz += 12) {
      for (const off of [-3.6, 3.6]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 6), pierMat);
        post.position.set(px + off, 0, pz); group.add(post);
      }
    }
  }

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1700, 640),
    new THREE.MeshPhongMaterial({ color: 0x125263, shininess: 220, specular: 0xdd9046 }),
  );
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.35, SEA_Z + 318);
  group.add(sea);

  // sun-glitter: additive sparkles in a wedge of water under the sun
  const gCount = 900;
  const gPos = new Float32Array(gCount * 3);
  for (let i = 0; i < gCount; i++) {
    const along = rand(rng, 0, 1);
    const spread = (1 - along) * 60 + 6;
    gPos[i * 3] = sunDir.x * along * 700 + rand(rng, -spread, spread);
    gPos[i * 3 + 1] = -0.2;
    gPos[i * 3 + 2] = SEA_Z + 55 + along * 590;
  }
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  const glitter = new THREE.Points(gGeo, new THREE.PointsMaterial({
    color: 0xffcf8a, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  group.add(glitter);
  tickers.push((t) => { glitter.material.opacity = 0.4 + 0.2 * Math.sin(t * 2.3); glitter.position.y = Math.sin(t * 1.4) * 0.08; });

  // beach umbrellas
  const umbrellaMats = [0xff5d5d, 0xffd23f, 0x4de3ff, 0xff8ac2].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  for (let i = 0; i < 16; i++) {
    const ux = -250 + i * 33 + rand(rng, -6, 6);
    const uz = BEACH_Z + rand(rng, -4, 10);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 5), trunkMat);
    pole.position.set(ux, 1.3, uz); group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.3, 0.9, 8), umbrellaMats[i % 4]);
    top.position.set(ux, 2.8, uz); top.castShadow = true; group.add(top);
  }

  // sailboats
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2ede2 });
  const sailMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const boats = [];
  for (let i = 0; i < 7; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 6.4), hullMat);
    hull.position.y = 0.4; boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.5, 5), trunkMat);
    mast.position.y = 4.4; boat.add(mast);
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 6.4), new THREE.Vector2(3.4, 0.6)]);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(shape), sailMat);
    sail.position.set(0.12, 1.4, -0.4); boat.add(sail);
    boat.position.set(-265 + i * 105 + rand(rng, -25, 25), 0, SEA_Z + rand(rng, 60, 300));
    // keep the sun's glitter corridor clear of sails for the postcard view
    if (boat.position.x > -130 && boat.position.x < 20) boat.position.x -= 170;
    boat.rotation.y = rand(rng, 0, Math.PI * 2);
    group.add(boat); boats.push(boat);
  }
  tickers.push((t) => { for (let i = 0; i < boats.length; i++) { boats[i].position.y = Math.sin(t * 0.9 + i * 1.7) * 0.22; boats[i].rotation.z = Math.sin(t * 0.7 + i) * 0.04; } });

  scene.add(group);

  const anchors = {
    lena: { x: 16, z: 24 }, sal: { x: -84, z: -16 }, mateo: { x: 0, z: SEA_Z + 78 },
    dana: { x: 138, z: -136 }, bank: { x: 90, z: 18 }, viperTurf: { x: -204, z: 96 },
    finale: { x: -228, z: 6 }, station: { x: 150, z: -130 }, hospital: { x: -138, z: 132 },
    raceStart: { x: 226, z: 0 }, comet: { x: -98, z: -36 }, start: { x: 6, z: 34 },
  };

  return {
    group, colliders, anchors, buildingCount,
    tick(dt, t) { for (const fn of tickers) fn(t, dt); },
  };
}
