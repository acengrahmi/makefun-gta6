// Costa Verde — shared utilities: math, RNG, DOM helpers.
window.CV = window.CV || {};

CV.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
CV.lerp = (a, b, t) => a + (b - a) * t;
CV.dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
CV.dist = (ax, az, bx, bz) => Math.sqrt(CV.dist2(ax, az, bx, bz));
CV.angLerp = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
CV.rand = (a, b) => a + Math.random() * (b - a);
CV.randi = (a, b) => Math.floor(CV.rand(a, b + 1));
CV.pick = arr => arr[Math.floor(Math.random() * arr.length)];
CV.el = id => document.getElementById(id);
CV.makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// World constants shared by every module.
CV.WORLD = {
  pitch: 44,          // building plot (30) + road (14)
  half: 4,            // blocks from -4..4 on each axis (9x9)
  shoreX: -212,       // where the sand starts (west edge of the city)
  seaLevel: 0.55,     // sea plane height — ABOVE the ground plane at 0
  groundY: 0,
};
CV.blockCenter = i => (i - CV.WORLD.half) * CV.WORLD.pitch; // i in 0..8
CV.roadLine = i => CV.blockCenter(i) + CV.WORLD.pitch / 2;   // road centre between plots

// Circle (x,z,r) vs the building colliders registered by city.js.
CV.collideCircle = (x, z, r) => {
  const cols = CV.colliders || [];
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const nx = CV.clamp(x, c.minX, c.maxX), nz = CV.clamp(z, c.minZ, c.maxZ);
    const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2); x = nx + (dx / d) * r; z = nz + (dz / d) * r; }
      else { // centre inside the box: push out along the smallest penetration
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
  }
  return [x, z];
};
CV.insideCollider = (x, z) => {
  const cols = CV.colliders || [];
  for (let i = 0; i < cols.length; i++) { const c = cols[i]; if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true; }
  return false;
};
