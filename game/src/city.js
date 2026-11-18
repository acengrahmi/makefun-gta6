// city.js — builds the whole of Costa Verde procedurally: the 9x9 street
// grid, ~100 buildings in three styles with lit windows and neon billboards,
// the hero boulevard running into the sunset, and the coast — animated sea
// with a sun-glitter shader, boardwalk, three piers, beach umbrellas and
// sailboats. Also exports the named story locations the jobs use, and the
// AABB collider list every actor collides against.

import { makeRng, pick, rand, WORLD, streetCoord } from './util.js';

const T = () => window.THREE;

// ---------- canvas texture helpers (all art is generated, nothing loads) ---
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new (T()).CanvasTexture(c);
  if (repeat) { tex.wrapS = tex.wrapT = T().RepeatWrapping; }
  tex.anisotropy = 4;
  return tex;
}

// A facade: flat colour with a grid of windows, a dusk-appropriate share of
// them lit warm. `lit` is the fraction glowing.
function facadeTexture(rng, base, win, litRatio, cols, rows) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const lit = rng() < litRatio;
        g.fillStyle = lit ? win : 'rgba(18,24,38,0.85)';
        g.fillRect(x * cw + cw * 0.22, y * ch + ch * 0.24, cw * 0.56, ch * 0.5);
        if (lit) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x * cw + cw * 0.22, y * ch + ch * 0.24, cw * 0.56, ch * 0.16); }
      }
    }
  });
}

function neonTexture(text, color, sub) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#101018'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
    g.font = 'bold 58px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 26;
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, sub ? h / 2 - 14 : h / 2);
    if (sub) {
      g.font = 'bold 26px Arial, sans-serif';
      g.shadowBlur = 14; g.fillStyle = color;
      g.fillText(sub, w / 2, h / 2 + 36);
    }
  });
}

function roadTexture() {
  return canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#2f2c29'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 300; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.fillStyle = '#e8c96a';
    g.fillRect(w / 2 - 2, 20, 4, 90); g.fillRect(w / 2 - 2, 150, 4, 90);
  }, true);
}

function leafTexture() {
  const tex = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.lineCap = 'round';
    // A full frond: a thick rib with dense, tapering leaflets both sides.
    g.strokeStyle = '#256b2a'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(4, h - 4); g.quadraticCurveTo(w / 2, h * 0.30, w - 4, 8); g.stroke();
    for (let i = 0; i < 15; i++) {
      const t = i / 14, x = 8 + t * (w - 18), y = h - 10 - t * (h - 26);
      const len = 20 * (1 - t * 0.45);
      g.strokeStyle = i % 2 ? '#2f8433' : '#3da344'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + len * 0.7, y + len); g.stroke();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - len * 0.35, y + len * 0.9); g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = T().ClampToEdgeWrapping;
  return tex;
}

// ---------- sky + sea shaders ----------------------------------------------
function makeSky(sunDir) {
  const mat = new (T()).ShaderMaterial({
    side: T().BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: sunDir } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, -0.08, 1.0);
        vec3 zen = vec3(0.11, 0.21, 0.44);
        vec3 mid = vec3(0.78, 0.38, 0.30);
        vec3 hor = vec3(0.98, 0.55, 0.20);
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, zen, smoothstep(0.16, 0.65, h));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.55, 0.2) * pow(s, 7.0) * 0.22;          // warm halo
        col += vec3(1.0, 0.72, 0.38) * pow(s, 60.0) * 0.38;        // inner glow
        col += vec3(1.0, 0.88, 0.66) * smoothstep(0.9988, 0.9996, s) * 2.2; // the disc
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new (T()).Mesh(new (T()).SphereGeometry(880, 24, 16), mat);
  sky.renderOrder = -10;
  return sky;
}

function makeSea(sunDir) {
  const mat = new (T()).ShaderMaterial({
    transparent: false, fog: false,
    uniforms: { time: { value: 0 }, sunDir: { value: sunDir } },
    vertexShader: `varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `
      varying vec3 vW; uniform float time; uniform vec3 sunDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 deep = vec3(0.03, 0.16, 0.28);
        vec3 lift = vec3(0.10, 0.32, 0.45);
        float wave = sin(vW.x * 0.11 + time * 0.7) * sin(vW.z * 0.13 - time * 0.5);
        vec3 col = mix(deep, lift, 0.5 + 0.5 * wave);
        // glitter: a bright broken path under the sun, narrowing with distance
        float path = exp(-abs(vW.z - sunDir.z * 900.0 * 0.28) / 64.0);
        vec2 cell = floor(vW.xz * 2.4 + vec2(time * 1.7, time * 1.1));
        float sparkle = step(0.90, hash(cell)) * (0.6 + 0.4 * sin(time * 3.0 + hash(cell + 7.0) * 40.0));
        col += vec3(1.0, 0.62, 0.25) * path * sparkle * 2.0;
        col += vec3(1.0, 0.55, 0.2) * path * 0.16;
        // Wet-sand sheen only in a narrow band at the waterline (x ~ -268);
        // open water keeps its colour and glitter.
        float sheen = smoothstep(-288.0, -268.0, vW.x);
        col = mix(col, vec3(0.76, 0.62, 0.42), sheen * 0.45);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sea = new (T()).Mesh(new (T()).PlaneGeometry(620, 620), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(WORLD.seaX - 250, -0.25, 0);
  return { mesh: sea, mat };
}

// ---------- the city itself --------------------------------------------------
export function buildCity(scene) {
  const THREE = T();
  const rng = makeRng(20261118);
  const colliders = [];
  const animated = { boats: [], waterMats: [] };
  const addCollider = (x, z, hx, hz) => colliders.push({ x, z, hx, hz });

  // Golden-hour light rig: low warm sun in the west, cool sky fill.
  const sunDir = new THREE.Vector3(-1, 0.20, 0.30).normalize();
  const sun = new THREE.DirectionalLight(0xffab5e, 1.8);
  sun.position.copy(sunDir).multiplyScalar(420);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffd9a8, 0x2c3550, 0.5));
  const bounce = new THREE.DirectionalLight(0x5a76b8, 0.35);
  bounce.position.set(300, 200, -200);
  scene.add(bounce);
  scene.add(makeSky(sunDir));
  const sea = makeSea(sunDir);
  scene.add(sea.mesh);
  animated.waterMats.push(sea.mat);

  const MAT = {
    sidewalk: new THREE.MeshLambertMaterial({ color: 0x7d7264 }),
    plaza: new THREE.MeshLambertMaterial({ color: 0x8a7a64 }),
    sand: new THREE.MeshLambertMaterial({ color: 0xd9bd8a }),
    grass: new THREE.MeshLambertMaterial({ color: 0x3f6d37 }),
    boardwalk: new THREE.MeshLambertMaterial({ color: 0x8a6844 }),
    pier: new THREE.MeshLambertMaterial({ color: 0x74563a }),
    road: new THREE.MeshLambertMaterial({ map: roadTexture() }),
    boulevard: new THREE.MeshLambertMaterial({ map: roadTexture() }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x7a5c40 }),
    leaf: new THREE.MeshLambertMaterial({ map: leafTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }),
    roof: new THREE.MeshLambertMaterial({ color: 0x3a3642 }),
    white: new THREE.MeshLambertMaterial({ color: 0xf2ead8 }),
  };
  MAT.road.map.repeat.set(1, 34);
  MAT.boulevard.map = MAT.road.map;

  // Ground base (under everything): warm concrete.
  const base = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), new THREE.MeshLambertMaterial({ color: 0x655c50 }));
  base.rotation.x = -Math.PI / 2; base.position.set(0, -0.06, 0);
  scene.add(base);
  // Beach sand strip.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(46, 560), MAT.sand);
  sand.rotation.x = -Math.PI / 2; sand.position.set(-245, -0.02, 0);
  scene.add(sand);
  // Boardwalk: a long wooden deck along the water.
  const walk = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 540), MAT.boardwalk);
  walk.position.set(-233, 0.12, 0);
  scene.add(walk);

  // Roads: vertical + horizontal streets, the boulevard twice as wide.
  for (let i = -4; i <= 4; i++) {
    const c = streetCoord(i);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.road, 500), MAT.road);
    v.rotation.x = -Math.PI / 2; v.rotation.z = Math.PI / 2; v.position.set(c, 0.02, 0);
    scene.add(v);
    const isBlvd = i === 0;
    const h = new THREE.Mesh(new THREE.PlaneGeometry(500, isBlvd ? WORLD.boulevardHalf * 2 : WORLD.road), MAT.road);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.02, c);
    scene.add(h);
  }
  // Boulevard median: a planted strip down the middle of the avenue.
  const median = new THREE.Mesh(new THREE.BoxGeometry(486, 0.35, 2.6), MAT.grass);
  median.position.set(0, 0.17, 0);
  scene.add(median);

  // --- palms ----------------------------------------------------------------
  const palmProto = (() => {
    const g = new THREE.Group();
    let x = 0, y = 0;
    for (let s = 0; s < 4; s++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.22 - s * 0.03, 0.26 - s * 0.03, 1.7, 6), MAT.trunk);
      x += s * 0.16; y += 1.55;
      seg.position.set(x, y - 0.7, 0); seg.rotation.z = -0.10 * s;
      g.add(seg);
    }
    for (let f = 0; f < 8; f++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.0), MAT.leaf);
      const a = (f / 8) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.7, y + 0.8, Math.sin(a) * 1.7);
      leaf.rotation.set(-0.45 - (f % 3) * 0.15, -a + Math.PI / 2, 0, 'YXZ');
      g.add(leaf);
    }
    return g;
  })();
  const plantPalm = (x, z, s = 1) => {
    const p = palmProto.clone();
    p.position.set(x, 0, z);
    p.rotation.y = rng() * Math.PI * 2;
    p.scale.setScalar(s * rand(rng, 0.85, 1.2));
    scene.add(p);
    addCollider(x, z, 0.35, 0.35);
  };
  for (let x = -228; x <= 232; x += 19) { plantPalm(x, -4.6); plantPalm(x + 9, 4.6); }     // boulevard median rows
  for (let z = -250; z <= 250; z += 23) plantPalm(-238.5, z + rand(rng, -4, 4));            // boardwalk
  for (let i = -4; i <= 4; i += 2) { plantPalm(streetCoord(i) + 10, -160); plantPalm(streetCoord(i) - 10, 160); }

  // --- street lights along the boulevard ------------------------------------
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e2e36 });
  for (let x = -220; x <= 230; x += 30) {
    for (const side of [-17.5, 17.5]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5), poleMat);
      pole.position.set(x, 2.8, side);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), lampMat);
      lamp.position.set(x, 5.6, side);
      scene.add(lamp);
    }
  }

  // --- buildings --------------------------------------------------------------
  const styles = [
    { // glass tower
      tex: () => facadeTexture(rng, '#2e4a66', '#ffd98c', 0.46, 8, 16),
      minH: 34, maxH: 62, inset: 3,
    },
    { // art-deco hotel
      tex: () => facadeTexture(rng, '#b3946e', '#ffe9b0', 0.58, 7, 10),
      minH: 16, maxH: 30, inset: 2,
    },
    { // brick low-rise
      tex: () => facadeTexture(rng, '#7c4c33', '#ffca7a', 0.40, 6, 6),
      minH: 9, maxH: 16, inset: 1.5,
    },
  ];
  const styleMats = styles.map((s) => {
    const m = new THREE.MeshLambertMaterial({ map: s.tex() });
    return m;
  });
  const billboards = [
    ['COSTA VERDE', '#ff5da2', 'HOTEL · SOL · MAR'],
    ['COMET GT', '#39d0ff', 'STEAL THE SUNSET'],
    ['CLUB LUNA', '#b78cff', 'OPEN ALL NIGHT'],
    ['BANCO VERDE', '#ffd23e', 'YOUR MONEY, SUNNY'],
    ['SUNSET GP', '#ff7847', 'RACE THE BOULEVARD'],
    ['MARINA', '#4fe3c1', 'BOATS · BAIT · BEER'],
    ['VIPERS', '#7dff5e', 'TURF — KEEP OUT'],
    ['TAXI 24H', '#ffe95e', 'CALL 555-VERDE'],
  ];
  let bbIdx = 0;
  let buildingCount = 0;

  // Special blocks (by block-centre coords) get landmarks instead of towers.
  const blockKey = (cx, cz) => cx + ',' + cz;
  const special = new Map();
  const spots = {};
  const landmark = (cx, cz, name, color, signText, signColor, h = 13) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(30, h, 30),
      new THREE.MeshLambertMaterial({ map: facadeTexture(rng, color, '#ffe9b0', 0.55, 7, 5) }));
    body.position.y = h / 2;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(31, 1, 31), MAT.roof);
    roof.position.y = h + 0.5; g.add(roof);
    if (signText) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(24, 6),
        new THREE.MeshBasicMaterial({ map: neonTexture(signText, signColor) }));
      sign.position.set(0, h - 2.5, 15.2);
      g.add(sign);
      const sign2 = sign.clone(); sign2.rotation.y = Math.PI; sign2.position.z = -15.2; g.add(sign2);
    }
    g.position.set(cx, 0, cz);
    scene.add(g);
    addCollider(cx, cz, 15.5, 15.5);
    buildingCount++;
    return g;
  };

  // Block centres: -189..189 step 54.
  const centres = [];
  for (let i = -4; i <= 3; i++) centres.push(i * WORLD.pitch + 27);

  special.set(blockKey(27, -81), () => { landmark(27, -81, 'hotel', '#cbb59a', 'HOTEL SOL', '#ffb347', 20); spots.hotel = { x: 27, z: -56 }; });
  special.set(blockKey(135, 81), () => { landmark(135, 81, 'garage', '#5d6a72', 'SAL’S GARAGE', '#39d0ff', 10); spots.garage = { x: 135, z: 56 }; });
  special.set(blockKey(189, -135), () => { landmark(189, -135, 'warehouse', '#6a5a4a', 'MARINA FREIGHT', '#4fe3c1', 11); spots.warehouse = { x: 164, z: -135 }; });
  special.set(blockKey(81, -189), () => { landmark(81, -189, 'station', '#7d8894', 'POLICIA', '#5e9dff', 12); spots.station = { x: 81, z: -162 }; spots.dana = { x: 74, z: -160 }; });
  special.set(blockKey(189, 27), () => { landmark(189, 27, 'bank', '#b8a888', 'BANCO VERDE', '#ffd23e', 16); spots.bank = { x: 164, z: 27 }; });
  special.set(blockKey(-189, -189), () => {
    const g = landmark(-189, -189, 'hospital', '#e8e2d4', 'HOSPITAL', '#ff5d5d', 14);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5, 0.4), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
    cross.position.set(0, 10, 15.4); g.add(cross);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 0.4), cross.material);
    cross2.position.set(0, 10, 15.4); g.add(cross2);
    spots.hospital = { x: -189, z: -160 };
  });
  special.set(blockKey(-189, 189), () => { landmark(-189, 189, 'hideout', '#4a4a55', '', '#000000', 10); spots.hideout = { x: -164, z: 189 }; });
  special.set(blockKey(-81, 135), () => {
    // Open parking lot: the Comet GT waits here (actors place the car).
    const lot = new THREE.Mesh(new THREE.BoxGeometry(38, 0.22, 38), new THREE.MeshLambertMaterial({ color: 0x4a4642 }));
    lot.position.set(-81, 0.11, 135); scene.add(lot);
    spots.comet = { x: -81, z: 135 };
  });
  special.set(blockKey(-135, -27), () => {
    // Viper alley: two slabs with a gap — a natural ambush pocket.
    const a = new THREE.Mesh(new THREE.BoxGeometry(38, 15, 12), new THREE.MeshLambertMaterial({ map: facadeTexture(rng, '#5d4a3a', '#ffb060', 0.3, 8, 5) }));
    a.position.set(-135, 7.5, -38); scene.add(a); addCollider(-135, -38, 19, 6);
    const b = a.clone(); b.position.z = -16; scene.add(b); addCollider(-135, -16, 19, 6);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: neonTexture('VIPERS', '#7dff5e') }));
    sign.position.set(-135, 6, -9.6); sign.rotation.y = 0; scene.add(sign);
    buildingCount += 2;
    spots.alley = { x: -135, z: -27 };
  });
  special.set(blockKey(-27, 189), () => {
    // The park: grass, trees, and a bench where a briefcase changes hands.
    const g = new THREE.Mesh(new THREE.BoxGeometry(40, 0.24, 40), MAT.grass);
    g.position.set(-27, 0.12, 189); scene.add(g);
    for (let i = 0; i < 7; i++) {
      const tx = -27 + rand(rng, -15, 15), tz = 189 + rand(rng, -15, 15);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 6), MAT.trunk);
      trunk.position.set(tx, 1.5, tz); scene.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(rand(rng, 2.2, 3.4), 8, 6), new THREE.MeshLambertMaterial({ color: 0x3e6b34 }));
      crown.position.set(tx, 4.6, tz); scene.add(crown);
      addCollider(tx, tz, 0.5, 0.5);
    }
    spots.park = { x: -27, z: 189 };
  });

  for (const cx of centres) {
    for (const cz of centres) {
      // Sidewalk plot under every block.
      const plot = new THREE.Mesh(new THREE.BoxGeometry(42, 0.3, 42), MAT.sidewalk);
      plot.position.set(cx, 0.15, cz);
      scene.add(plot);
      const key = blockKey(cx, cz);
      if (special.has(key)) { special.get(key)(); continue; }
      // Rows beside the boulevard keep their buildings set back behind a
      // plaza strip, so the avenue reads wide and ceremonial.
      const nearBlvd = Math.abs(cz) === 27;
      const styleIdx = Math.floor(rng() * 3);
      const st = styles[styleIdx];
      const two = rng() < 0.78;
      const footprints = two
        ? [{ dx: -10, dz: 0, w: 17, d: 30 }, { dx: 10.5, dz: 0, w: 16, d: 30 }]
        : [{ dx: 0, dz: 0, w: 30, d: 32 }];
      for (const f of footprints) {
        const hgt = rand(rng, st.minH, st.maxH);
        const b = new THREE.Mesh(new THREE.BoxGeometry(f.w, hgt, f.d),
          [styleMats[styleIdx], styleMats[styleIdx], MAT.roof, MAT.roof, styleMats[styleIdx], styleMats[styleIdx]]);
        let bz = cz + f.dz;
        if (nearBlvd) bz = cz + (cz > 0 ? 5 : -5); // set back from the avenue
        b.position.set(cx + f.dx, hgt / 2 + 0.3, bz);
        scene.add(b);
        addCollider(cx + f.dx, bz, f.w / 2 + 0.3, f.d / 2 + 0.3);
        buildingCount++;
        // A share of buildings carry a neon billboard facing the street.
        if (rng() < 0.30 && hgt > 13) {
          const [txt, col, sub] = billboards[bbIdx++ % billboards.length];
          const bb = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.8),
            new THREE.MeshBasicMaterial({ map: neonTexture(txt, col, sub) }));
          const faceWest = rng() < 0.5;
          bb.position.set(cx + f.dx + (faceWest ? -f.w / 2 - 0.15 : f.w / 2 + 0.15), hgt - 4, bz);
          bb.rotation.y = faceWest ? -Math.PI / 2 : Math.PI / 2;
          scene.add(bb);
        }
      }
    }
  }

  // --- piers, umbrellas, boats ----------------------------------------------
  const pierZs = [-108, 0, 108];
  for (const pz of pierZs) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(58, 0.5, 8), MAT.pier);
    deck.position.set(-262, 0.35, pz);
    scene.add(deck);
    for (let px = -238; px >= -286; px -= 12) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 5), MAT.trunk);
      post.position.set(px, -0.5, pz - 3.4); scene.add(post);
      const post2 = post.clone(); post2.position.z = pz + 3.4; scene.add(post2);
    }
  }
  spots.marina = { x: -252, z: -108 };
  spots.pierEnd = { x: -282, z: 0 };

  const umbrellaCols = [0xff5d5d, 0xffd23e, 0x39d0ff, 0xff8ac2, 0x7dff5e, 0xff7847];
  for (let i = 0; i < 16; i++) {
    const ux = rand(rng, -262, -243), uz = -240 + i * 30 + rand(rng, -8, 8);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), MAT.white);
    pole.position.set(ux, 1.3, uz); pole.rotation.z = 0.12; scene.add(pole);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.8, 8),
      new THREE.MeshLambertMaterial({ color: umbrellaCols[i % umbrellaCols.length] }));
    cap.position.set(ux + 0.3, 2.7, uz); scene.add(cap);
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2),
      new THREE.MeshLambertMaterial({ color: umbrellaCols[(i + 2) % umbrellaCols.length] }));
    towel.rotation.x = -Math.PI / 2; towel.rotation.z = rng() * 3;
    towel.position.set(ux + 1.6, 0.06, uz + 1); scene.add(towel);
  }

  const boatCols = [0xffffff, 0xff5d5d, 0x39d0ff, 0xffd23e];
  for (let i = 0; i < 7; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.1, 1.9),
      new THREE.MeshLambertMaterial({ color: boatCols[i % boatCols.length] }));
    hull.position.y = 0.4; boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.4, 5), MAT.white);
    mast.position.y = 3.6; boat.add(mast);
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0); sailShape.lineTo(0, 5.6); sailShape.lineTo(3.4, 0.4); sailShape.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape),
      new THREE.MeshLambertMaterial({ color: 0xfff6e8, side: THREE.DoubleSide }));
    sail.position.set(0.15, 1.1, 0); boat.add(sail);
    boat.position.set(rand(rng, -420, -292), 0, rand(rng, -230, 230));
    if (Math.abs(boat.position.z) < 14) boat.position.z += 30; // keep the pier lane clear
    boat.rotation.y = rand(rng, -0.5, 0.5);
    scene.add(boat);
    animated.boats.push({ g: boat, phase: rng() * 6.28, y: 0 });
  }

  // Named spots that live outside blocks.
  spots.playerSpawn = { x: -206, z: 12 };
  spots.lena = { x: -230, z: 8 };
  spots.mateo = { x: -252, z: -104 };
  spots.raceStart = { x: 208, z: 0 };
  spots.boardwalk = { x: -233, z: 0 };

  return {
    colliders,
    spots,
    buildingCount,
    sunDir,
    update(dt, t) {
      for (const m of animated.waterMats) m.uniforms.time.value = t;
      for (const b of animated.boats) {
        b.g.position.y = Math.sin(t * 0.8 + b.phase) * 0.22 - 0.1;
        b.g.rotation.z = Math.sin(t * 0.6 + b.phase) * 0.03;
      }
    },
  };
}

// Is a point on a street (vs inside a block)? Used for spawning traffic and
// for pedestrian sidewalk logic.
export function onRoad(x, z) {
  if (Math.abs(z) < WORLD.boulevardHalf + 1.5) return true;
  for (let i = -4; i <= 4; i++) {
    const c = streetCoord(i);
    if (Math.abs(x - c) < WORLD.road / 2 + 1.5) return true;
    if (Math.abs(z - c) < WORLD.road / 2 + 1.5) return true;
  }
  return x < WORLD.beachX + 6; // boardwalk + beach count as walkable ground
}

// Resolve a circle (x,z,r) against every AABB collider; mutates and returns
// the position. Buildings only — cheap enough at this scale.
export function collide(pos, r, colliders) {
  for (const c of colliders) {
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const px = c.hx + r - Math.abs(dx), pz = c.hz + r - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) pos.x = c.x + (dx > 0 ? c.hx + r : -c.hx - r);
      else pos.z = c.z + (dz > 0 ? c.hz + r : -c.hz - r);
    }
  }
  pos.x = Math.max(-296, Math.min(WORLD.cityEdge + 20, pos.x));
  pos.z = Math.max(-252, Math.min(252, pos.z));
  return pos;
}
