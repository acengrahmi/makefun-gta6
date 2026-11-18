// Costa Verde — the city: golden-hour sky, sun + halo, hero boulevard, sea with
// a sun-glitter path, marina, art-deco + glass buildings, palms, billboards.
(function () {
  'use strict';
  const CV = (window.CV = window.CV || {});

  const STREETS = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
  CV.WORLD = {
    streets: STREETS,
    boulevardZ: 60,       // the hero avenue runs east–west at z = 60
    coastX: -300,         // sea starts here; boardwalk at x ≈ -252
    sunDir: new THREE.Vector3(-1, 0.17, -0.30).normalize(),
    placeAt(x, z) {
      if (x < -246) return 'MARINA BOARDWALK';
      if (Math.abs(z - 60) < 24 && x > -246) return 'SUNSET BOULEVARD';
      if (x > 185) return 'EAST WAREHOUSE';
      if (x < -120) return 'PALM SHORES';
      if (Math.abs(x) < 80 && z < 20) return 'DOWNTOWN';
      return 'COSTA VERDE';
    },
  };

  const city = { colliders: [], boats: [], t: 0, glitter: null };
  CV.city = city;

  const lam = (color, opts) => new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
  const box = (w, h, d, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    (parent || city.group).add(m);
    return m;
  };

  function palm(x, z, r) {
    const g = new THREE.Group();
    const trunkMat = lam(0x8a6844);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 5.6, 5), trunkMat);
    trunk.position.y = 2.8; trunk.rotation.z = CV.rand(r, -0.07, 0.07);
    trunk.castShadow = true;
    g.add(trunk);
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.65), frondMat);
      const a = (i / 6) * Math.PI * 2 + r() * 0.5;
      f.position.set(Math.cos(a) * 1.35, 5.75 - Math.abs(Math.sin(a)) * 0.2, Math.sin(a) * 1.35);
      f.rotation.set(-0.5 - r() * 0.25, -a + Math.PI / 2, 0, 'YXZ');
      f.castShadow = true;
      g.add(f);
    }
    g.position.set(x, 0, z);
    city.group.add(g);
  }

  city.build = (scene) => {
    const r = CV.rng(20261118);
    const group = (city.group = new THREE.Group());
    scene.add(group);
    const sunDir = CV.WORLD.sunDir;

    // ---- lights & atmosphere ---------------------------------------------
    scene.fog = new THREE.Fog(0xdd7f52, 260, 1500);
    const hemi = new THREE.HemisphereLight(0xffd9b0, 0x503a58, 0.6);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffa050, 1.5);
    sun.position.copy(sunDir).multiplyScalar(700);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -360; sun.shadow.camera.right = 360;
    sun.shadow.camera.top = 360; sun.shadow.camera.bottom = -360;
    sun.shadow.camera.near = 100; sun.shadow.camera.far = 1600;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 1.5;
    scene.add(sun); scene.add(sun.target);
    scene.add(new THREE.AmbientLight(0x604a6a, 0.5));

    // ---- sky dome: multi-stop gradient + sun glow baked into the shader --
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'varying vec3 vDir; uniform vec3 sunDir;',
        'void main(){',
        '  float h = clamp(vDir.y, -0.08, 1.0);',
        '  vec3 col = mix(vec3(1.00,0.62,0.30), vec3(0.98,0.45,0.42), smoothstep(0.0,0.16,h));',
        '  col = mix(col, vec3(0.62,0.36,0.58), smoothstep(0.13,0.34,h));',
        '  col = mix(col, vec3(0.16,0.24,0.55), smoothstep(0.32,0.75,h));',
        '  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);',
        '  col += vec3(1.0,0.55,0.22) * pow(s, 18.0) * 0.55;',
        '  col += vec3(1.0,0.75,0.42) * pow(s, 90.0) * 0.8;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}',
      ].join('\n'),
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 16), skyMat);
    scene.add(sky);

    // ---- the sun itself: big disc + halo ----------------------------------
    const sunPos = sunDir.clone().multiplyScalar(1380);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(105, 40),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false })
    );
    disc.position.copy(sunPos); disc.lookAt(0, 60, 0);
    scene.add(disc);
    const haloTex = CV.glowTexture('rgba(255,190,90,0.85)', 'rgba(255,120,40,0)');
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, fog: false }));
    halo.position.copy(sunPos); halo.scale.set(680, 680, 1);
    scene.add(halo);

    // ---- clouds: flat pink-lit slabs drifting very slowly -----------------
    city.clouds = [];
    const cloudTex = CV.glowTexture('rgba(255,205,190,0.95)', 'rgba(255,160,150,0)');
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
      c.position.set(CV.rand(r, -1100, 500), CV.rand(r, 210, 330), CV.rand(r, -700, 300));
      c.scale.set(CV.rand(r, 320, 520), CV.rand(r, 46, 74), 1);
      scene.add(c); city.clouds.push(c);
    }

    // ---- ground, streets, sidewalks ---------------------------------------
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 760), lam(0x8a7358));
    ground.rotation.x = -Math.PI / 2; ground.position.set(-20, -0.05, 0);
    ground.receiveShadow = true;
    group.add(ground);
    const asphalt = lam(0x3d3a44);
    const walkMat = lam(0xb59a78);
    for (const s of STREETS) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(15, 640), asphalt);
      v.rotation.x = -Math.PI / 2; v.position.set(s, 0.02, 0); v.receiveShadow = true; group.add(v);
      if (s !== CV.WORLD.boulevardZ) {
        const h = new THREE.Mesh(new THREE.PlaneGeometry(640, 15), asphalt);
        h.rotation.x = -Math.PI / 2; h.position.set(-10, 0.02, s); h.receiveShadow = true; group.add(h);
      }
    }
    // The hero boulevard: extra wide, with sidewalks and a palm median.
    const blvd = new THREE.Mesh(new THREE.PlaneGeometry(660, 30), lam(0x45404c));
    blvd.rotation.x = -Math.PI / 2; blvd.position.set(-10, 0.04, 60); blvd.receiveShadow = true; group.add(blvd);
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(660, 5), walkMat);
      walk.rotation.x = -Math.PI / 2; walk.position.set(-10, 0.06, 60 + side * 17.5); walk.receiveShadow = true; group.add(walk);
      const median = new THREE.Mesh(new THREE.PlaneGeometry(660, 2.4), lam(0x6d8f57));
      median.rotation.x = -Math.PI / 2; median.position.set(-10, 0.06, 60); group.add(median);
    }
    // Lane dashes down the boulevard.
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf7d774 });
    for (let x = -320; x < 320; x += 14) {
      for (const off of [-7.5, 7.5]) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.5), dashMat);
        d.rotation.x = -Math.PI / 2; d.position.set(x, 0.07, 60 + off); group.add(d);
      }
    }

    // ---- sea, glitter path, beach, boardwalk, piers ------------------------
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(760, 900),
      new THREE.MeshPhongMaterial({ color: 0x177e8c, specular: 0xffc978, shininess: 110 })
    );
    sea.rotation.x = -Math.PI / 2; sea.position.set(-300 - 380, 0.12, 0);
    group.add(sea);
    const glitTex = CV.canvasTexture(256, 64, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,170,80,0)');
      gr.addColorStop(0.5, 'rgba(255,205,110,0.95)');
      gr.addColorStop(1, 'rgba(255,170,80,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const gr2 = g.createLinearGradient(0, 0, w, 0);
      gr2.addColorStop(0, 'rgba(0,0,0,1)'); gr2.addColorStop(0.25, 'rgba(0,0,0,0)');
      gr2.addColorStop(0.75, 'rgba(0,0,0,0)'); gr2.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = gr2; g.fillRect(0, 0, w, h);
    });
    city.glitter = new THREE.Mesh(
      new THREE.PlaneGeometry(620, 120),
      new THREE.MeshBasicMaterial({ map: glitTex, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    city.glitter.rotation.x = -Math.PI / 2;
    city.glitter.position.set(-640, 0.3, -150);
    group.add(city.glitter);

    const beach = new THREE.Mesh(new THREE.PlaneGeometry(46, 700), lam(0xe3c493));
    beach.rotation.x = -Math.PI / 2; beach.position.set(-279, 0.03, 0); beach.receiveShadow = true; group.add(beach);
    const board = box(9, 0.5, 700, lam(0x9a6b48), -252, 0.25, 0);
    board.receiveShadow = true;
    const railMat = lam(0x6e4f33);
    for (let z = -345; z <= 345; z += 15) box(0.35, 1.1, 0.35, railMat, -256.5, 0.9, z);
    box(0.3, 0.25, 700, railMat, -256.5, 1.45, 0);
    const pierMat = lam(0x8a6242);
    for (const pz of [-140, 30, 180]) {
      box(95, 0.7, 10, pierMat, -345, 0.7, pz);
      for (let px = -300; px >= -385; px -= 21) box(0.8, 1.6, 0.8, pierMat, px, 0, pz - 4);
    }
    // Beach umbrellas.
    const umbCols = [0xff5a4e, 0xffc93c, 0x4ecdc4, 0xff8fab, 0xf7f7f7, 0xff8c42];
    for (let i = 0; i < 16; i++) {
      const ux = CV.rand(r, -294, -266), uz = -320 + i * 40 + CV.rand(r, -8, 8);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 5), railMat);
      pole.position.set(ux, 1.2, uz); group.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8), lam(umbCols[i % umbCols.length]));
      top.position.set(ux, 2.5, uz); top.castShadow = true; group.add(top);
    }
    // Sailboats.
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0); sailShape.lineTo(0, 5.2); sailShape.lineTo(2.6, 0.4); sailShape.lineTo(0, 0);
    const sailGeo = new THREE.ShapeGeometry(sailShape);
    const sailMat = new THREE.MeshLambertMaterial({ color: 0xfff6e8, side: THREE.DoubleSide });
    const hullCols = [0xd64541, 0x2e6fb7, 0xf2a541, 0x39a06b, 0xe8e3d8, 0x8e44ad, 0x16a3a3];
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Group();
      const hull = box(4.6, 1.0, 1.5, lam(hullCols[i]), 0, 0.4, 0, b);
      hull.castShadow = true;
      box(0.12, 5.4, 0.12, railMat, 0, 3, 0, b);
      const sail = new THREE.Mesh(sailGeo, sailMat);
      sail.position.set(0.1, 0.9, 0); b.add(sail);
      b.position.set(CV.rand(r, -560, -340), 0.1, -260 + i * 78 + CV.rand(r, -16, 16));
      b.rotation.y = CV.rand(r, -0.5, 0.5);
      b.userData.phase = r() * 6.28;
      group.add(b); city.boats.push(b);
    }

    // ---- buildings ----------------------------------------------------------
    const facades = [
      CV.facadeTexture('#e8a2b4', 0.55, 11, 6, 12),  // deco pink
      CV.facadeTexture('#a8d8c8', 0.5, 22, 6, 12),   // deco mint
      CV.facadeTexture('#f2e2c4', 0.58, 33, 6, 12),  // deco cream
      CV.facadeTexture('#5a6f8f', 0.72, 44, 8, 18),  // glass tower
      CV.facadeTexture('#7a4a3a', 0.5, 55, 6, 12),   // brick
      CV.facadeTexture('#c97b4a', 0.55, 66, 6, 12),  // terracotta
    ];
    const roofMat = lam(0x4c4048);
    const signs = [
      ['HOTEL', 'PALMS'], ['COSTA VERDE', ''], ['OPEN LATE', 'DINER'],
      ['MARINA', 'BOAT RENTALS'], ['SURF SHOP', ''], ['CASINO', 'ROYALE'],
    ];
    let signIdx = 0;
    const centers = [-210, -150, -90, -30, 30, 90, 150, 210];
    for (const bx of centers) {
      for (const bz of centers) {
        if (r() < 0.06) continue; // a few open lots
        const coastal = bx < -110, downtown = Math.abs(bx) < 70 && bz < 30;
        const nearBlvd = Math.abs(bz - 60) === 30;
        const fi = coastal ? Math.floor(r() * 3) : downtown ? 3 : 4 + Math.floor(r() * 2);
        const mat = new THREE.MeshLambertMaterial({ map: facades[fi] });
        const w = CV.rand(r, 26, 40), d = CV.rand(r, 26, 40);
        const h = downtown ? CV.rand(r, 36, 58) : coastal ? CV.rand(r, 13, 27) : CV.rand(r, 16, 34);
        const inset = nearBlvd ? 7 : 0; // set back from the hero boulevard
        const px = bx + CV.rand(r, -5, 5), pz = bz + (nearBlvd ? (bz < 60 ? -inset : inset) : CV.rand(r, -5, 5));
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, roofMat, roofMat, mat, mat]);
        b.position.set(px, h / 2, pz);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        city.colliders.push({ x: px, z: pz, hw: w / 2 + 0.6, hd: d / 2 + 0.6 });
        // Rooftop props.
        if (r() < 0.45) {
          if (r() < 0.5) {
            const wt = new THREE.Group();
            const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 3.4, 8), lam(0x7a5a40));
            tank.position.y = 1.7; tank.castShadow = true; wt.add(tank);
            const cap = new THREE.Mesh(new THREE.ConeGeometry(2, 1.2, 8), lam(0x54402e));
            cap.position.y = 4; wt.add(cap);
            wt.position.set(px + CV.rand(r, -6, 6), h, pz + CV.rand(r, -6, 6));
            group.add(wt);
          } else {
            box(CV.rand(r, 3, 5), 1.4, CV.rand(r, 3, 5), lam(0x9aa0a8), px + CV.rand(r, -7, 7), h + 0.7, pz + CV.rand(r, -7, 7));
          }
        }
        // Billboard on some street-facing tops.
        if (signIdx < signs.length && r() < 0.3 && h > 18) {
          const [word, sub] = signs[signIdx++];
          const tex = CV.signTexture(word, sub, '#2a1440', '#ffb347', signIdx * 7);
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(15, 7.5), new THREE.MeshBasicMaterial({ map: tex }));
          sign.position.set(px, h + 4.5, pz);
          sign.rotation.y = r() < 0.5 ? 0 : Math.PI / 2;
          group.add(sign);
          box(0.4, 4.5, 0.4, railMat, px, h + 1, pz);
        }
        // A second, smaller building shares many blocks (density + variety).
        if (r() < 0.55) {
          const fi2 = coastal ? Math.floor(r() * 3) : downtown ? 3 : 4 + Math.floor(r() * 2);
          const mat2 = new THREE.MeshLambertMaterial({ map: facades[fi2] });
          const w2 = CV.rand(r, 15, 21), d2 = CV.rand(r, 15, 21);
          const h2 = downtown ? CV.rand(r, 20, 38) : CV.rand(r, 10, 24);
          const alongX = r() < 0.5;
          const off = 15.5;
          const qx = bx + (alongX ? off : CV.rand(r, -8, 8));
          const qz = bz + (alongX ? CV.rand(r, -8, 8) : off) + (nearBlvd ? (bz < 60 ? -inset : inset) : 0);
          const b2 = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, d2), [mat2, mat2, roofMat, roofMat, mat2, mat2]);
          b2.position.set(qx, h2 / 2, qz);
          b2.castShadow = true; b2.receiveShadow = true;
          group.add(b2);
          city.colliders.push({ x: qx, z: qz, hw: w2 / 2 + 0.6, hd: d2 / 2 + 0.6 });
        }
      }
    }
    // East warehouse: two long low sheds.
    for (const wz of [-120, -30]) {
      const wh = box(64, 13, 40, lam(0x6a7078), 268, 6.5, wz);
      wh.castShadow = true; wh.receiveShadow = true;
      city.colliders.push({ x: 268, z: wz, hw: 33, hd: 21 });
    }

    // ---- palms + streetlights ----------------------------------------------
    for (let x = -320; x <= 320; x += 23) {
      palm(x, 60 - 20.5, r); palm(x + 11, 60 + 20.5, r);
      if (x % 46 === 0) palm(x, 60, r); // median palms
    }
    for (let z = -330; z <= 330; z += 34) palm(-262 + CV.rand(r, -3, 3), z, r);
    const lampMat = lam(0x3a3f4a);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    for (let x = -300; x <= 320; x += 44) {
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.4, 5), lampMat);
        pole.position.set(x, 3.2, 60 + side * 16); group.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), bulbMat);
        bulb.position.set(x, 6.5, 60 + side * 16); group.add(bulb);
      }
    }
  };

  city.update = (dt, t) => {
    city.t = t;
    for (const b of city.boats) {
      b.position.y = 0.1 + Math.sin(t * 0.9 + b.userData.phase) * 0.28;
      b.rotation.z = Math.sin(t * 0.7 + b.userData.phase) * 0.05;
    }
    if (city.glitter) city.glitter.material.opacity = 0.62 + Math.sin(t * 1.7) * 0.16;
    if (city.clouds) for (const c of city.clouds) { c.position.x += dt * 1.1; if (c.position.x > 900) c.position.x = -1200; }
  };

  // Resolve a position against building colliders (circle radius rad).
  city.collide = (x, z, rad) => {
    for (const c of city.colliders) {
      const dx = x - c.x, dz = z - c.z;
      const px = c.hw + rad - Math.abs(dx), pz = c.hd + rad - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) x = c.x + (dx >= 0 ? c.hw + rad : -c.hw - rad);
        else z = c.z + (dz >= 0 ? c.hd + rad : -c.hd - rad);
      }
    }
    return [x, z];
  };
})();
