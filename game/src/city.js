// Costa Verde — the city: golden-hour sky, 9x9 grid, waterfront, marina, landmarks.
CV.colliders = [];
CV.boats = [];

function facadeTexture(base, litRatio) {
  const c = CV.makeCanvas(128, 256), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 6; x++) {
    const lit = Math.random() < litRatio;
    g.fillStyle = lit ? (Math.random() < 0.5 ? '#ffd98a' : '#ffb45e') : '#2c2f3d';
    g.fillRect(10 + x * 19, 12 + y * 20, 11, 12);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 128, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function skyTexture() {
  const c = CV.makeCanvas(64, 512), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0.0, '#2e3a6e'); gr.addColorStop(0.30, '#7a4a8c');
  gr.addColorStop(0.52, '#c65b7c'); gr.addColorStop(0.68, '#f08a4b');
  gr.addColorStop(0.82, '#ffc46b'); gr.addColorStop(1.0, '#ffe3a1');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTexture() {
  const c = CV.makeCanvas(256, 256), g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 8, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,230,170,0.95)'); gr.addColorStop(0.25, 'rgba(255,190,110,0.55)');
  gr.addColorStop(1, 'rgba(255,160,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function groundTexture() {
  const S = 1024, c = CV.makeCanvas(S, S), g = c.getContext('2d');
  const px = v => (v + 200) / 400 * S; // world -200..200 -> px
  g.fillStyle = '#4c4a52'; g.fillRect(0, 0, S, S); // asphalt
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
    const cx = CV.blockCenter(i), cz = CV.blockCenter(j);
    g.fillStyle = '#8d8578'; // sidewalk / plot
    g.fillRect(px(cx - 22), px(cz - 22), 44 / 400 * S, 44 / 400 * S);
    g.fillStyle = '#7a7264';
    g.fillRect(px(cx - 15), px(cz - 15), 30 / 400 * S, 30 / 400 * S);
  }
  g.strokeStyle = 'rgba(255,214,120,0.75)'; g.lineWidth = 2; g.setLineDash([14, 18]);
  for (let i = 0; i < 8; i++) {
    const r = CV.roadLine(i);
    g.beginPath(); g.moveTo(px(r), 0); g.lineTo(px(r), S); g.stroke();
    g.beginPath(); g.moveTo(0, px(r)); g.lineTo(S, px(r)); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; return t;
}

CV.buildCity = function (scene) {
  const W = CV.WORLD;
  scene.fog = new THREE.Fog(0xf2a56b, 200, 900);
  // sky dome + sun
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
  scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }));
  sunDisc.position.set(-1330, 150, 90); sunDisc.lookAt(0, 60, 0); scene.add(sunDisc);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, fog: false, depthWrite: false }));
  glow.position.copy(sunDisc.position); glow.scale.set(620, 620, 1); scene.add(glow);
  // lights
  const sun = new THREE.DirectionalLight(0xffa050, 1.5);
  sun.position.set(-320, 130, 70); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -300; sun.shadow.camera.right = 300;
  sun.shadow.camera.top = 300; sun.shadow.camera.bottom = -300; sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0008;
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xffd9a0, 0x4a3b5c, 0.75));
  scene.add(new THREE.AmbientLight(0xff9a60, 0.25));

  // city ground with painted roads
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
    new THREE.MeshLambertMaterial({ map: groundTexture() }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0; ground.receiveShadow = true; scene.add(ground);
  // sand + sea (sea plane ABOVE ground level so it always renders)
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(150, 640), new THREE.MeshLambertMaterial({ color: 0xe8c188 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(-287, 0.06, 0); sand.receiveShadow = true; scene.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(760, 900), new THREE.MeshLambertMaterial({ color: 0x2fa3a0 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(-595, W.seaLevel, 0); scene.add(sea);
  CV.seaMesh = sea;

  // buildings
  const facades = [facadeTexture('#b98a68', 0.55), facadeTexture('#a89a8c', 0.5), facadeTexture('#c47b5a', 0.6), facadeTexture('#8f7f96', 0.45)];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a4a44 });
  const specials = { '2,5': 'hospital', '7,7': 'warehouse', '8,0': 'club', '3,1': 'garage' };
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
    const cx = CV.blockCenter(i), cz = CV.blockCenter(j), kind = specials[i + ',' + j];
    let w = 26, d = 26, h = CV.rand(13, 30) + (Math.abs(i - 4) + Math.abs(j - 4) < 3 ? CV.rand(6, 18) : 0);
    let mat = new THREE.MeshLambertMaterial({ map: CV.pick(facades) });
    if (kind === 'hospital') { h = 30; mat = new THREE.MeshLambertMaterial({ color: 0xf2ede4 }); }
    if (kind === 'warehouse') { w = 34; d = 30; h = 11; mat = new THREE.MeshLambertMaterial({ color: 0x7d7a72 }); }
    if (kind === 'club') { h = 17; mat = new THREE.MeshLambertMaterial({ map: facades[2] }); }
    if (kind === 'garage') { h = 9; mat = new THREE.MeshLambertMaterial({ color: 0x9c6b4f }); }
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(cx, h / 2, cz); b.castShadow = true; b.receiveShadow = true; scene.add(b);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.2, d + 1), roofMat);
    roof.position.set(cx, h + 0.6, cz); scene.add(roof);
    CV.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    if (kind === 'hospital') { // red cross on the street face
      const red = new THREE.MeshBasicMaterial({ color: 0xe33f3f });
      const v = new THREE.Mesh(new THREE.BoxGeometry(1.6, 7, 0.4), red); v.position.set(cx - w / 2 - 0.3, h - 6, cz); scene.add(v);
      const hz = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 7), red); hz.position.set(cx - w / 2 - 0.3, h - 6, cz); hz.rotation.x = 0; scene.add(hz);
      const hz2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.4), red); hz2.position.set(cx - w / 2 - 0.3, h - 6, cz); scene.add(hz2);
    }
    if (kind === 'club') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 0.6),
        new THREE.MeshBasicMaterial({ color: 0xff4fd8 }));
      sign.position.set(cx, h - 3, cz - d / 2 - 0.4); scene.add(sign);
    }
    if (kind === 'garage') {
      const door = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 0.5), new THREE.MeshLambertMaterial({ color: 0x3c3a40 }));
      door.position.set(cx, 3, cz + d / 2 + 0.3); scene.add(door);
    }
  }

  // palms along the beach road and the z=66 boulevard
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6742 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d, side: THREE.DoubleSide });
  const palm = (x, z) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 9, 5), trunkMat);
    trunk.position.y = 4.5; trunk.rotation.z = CV.rand(-0.08, 0.08); trunk.castShadow = true; g.add(trunk);
    for (let k = 0; k < 6; k++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.1), leafMat);
      const a = k / 6 * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 2.2, 9.4, Math.sin(a) * 2.2);
      leaf.rotation.set(0.5, -a, 0, 'YXZ'); g.add(leaf);
    }
    g.position.set(x, 0, z); scene.add(g);
  };
  for (let z = -196; z <= 196; z += 28) { palm(-198, z); palm(-204, z + 14); }
  for (let x = -188; x <= 188; x += 31) { palm(x, 66 - 10.5); palm(x + 15, 66 + 10.5); }

  // boardwalk + rails
  const wood = new THREE.MeshLambertMaterial({ color: 0xa9743f });
  const walk = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 420), wood);
  walk.position.set(-206, 0.28, 0); walk.receiveShadow = true; scene.add(walk);
  const railMat = new THREE.MeshLambertMaterial({ color: 0x6e4f30 });
  for (let z = -208; z <= 208; z += 8) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.6, 0.35), railMat);
    post.position.set(-210.5, 1.05, z); scene.add(post);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 420), railMat);
  rail.position.set(-210.5, 1.85, 0); scene.add(rail);

  // marina piers
  CV.piers = [-80, 10, 100];
  for (const pz of CV.piers) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(52, 0.6, 8), wood);
    deck.position.set(-236, 0.75, pz); deck.receiveShadow = true; scene.add(deck);
    for (let x = -216; x >= -258; x -= 10) for (const dz of [-3.4, 3.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 5), railMat);
      post.position.set(x, 0.1, pz + dz); scene.add(post);
    }
  }
  // beach umbrellas
  const umbCols = [0xff5a5a, 0xffc94d, 0x4fc3ff, 0xff8ad8, 0x7be495];
  for (let k = 0; k < 16; k++) {
    const x = CV.rand(-238, -218), z = -190 + k * 24 + CV.rand(-6, 6);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 5), railMat);
    pole.position.set(x, 1.3, z); scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.8, 8), new THREE.MeshLambertMaterial({ color: umbCols[k % 5] }));
    top.position.set(x, 2.8, z); top.castShadow = true; scene.add(top);
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), new THREE.MeshLambertMaterial({ color: umbCols[(k + 2) % 5] }));
    towel.rotation.x = -Math.PI / 2; towel.rotation.z = CV.rand(0, 3); towel.position.set(x + 1.4, 0.12, z + 0.6); scene.add(towel);
  }
  // sailboats
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf0ead8 });
  const sailMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  for (let k = 0; k < 7; k++) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.4, 2.2), hullMat); hull.position.y = 0.4; g.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 8, 5), railMat); mast.position.y = 4.6; g.add(mast);
    const sailShape = new THREE.Shape(); sailShape.moveTo(0, 0); sailShape.lineTo(0, 6.4); sailShape.lineTo(3.6, 0.4); sailShape.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), sailMat);
    sail.position.set(0.15, 1.6, 0); g.add(sail);
    g.position.set(CV.rand(-430, -275), W.seaLevel, CV.rand(-190, 190));
    g.rotation.y = CV.rand(0, Math.PI * 2);
    g.userData.phase = CV.rand(0, 6);
    scene.add(g); CV.boats.push(g);
  }
  return {
    update(dt, t) {
      for (const b of CV.boats) {
        b.position.y = W.seaLevel + Math.sin(t * 0.9 + b.userData.phase) * 0.22;
        b.rotation.z = Math.sin(t * 0.7 + b.userData.phase) * 0.05;
        b.rotation.x = Math.cos(t * 0.55 + b.userData.phase) * 0.03;
      }
    },
  };
};
