// Shared helpers: seeded random, math, and procedural canvas textures.
// Everything the city and cars wear is drawn here at runtime — no image files.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Draw a building facade (warm plaster + lit windows) and return a THREE texture. */
export function makeFacadeTexture(base, lit, floors, cols, rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 128, 10);
  const ww = 128 / cols, wh = 256 / floors;
  for (let f = 0; f < floors; f += 1) {
    for (let k = 0; k < cols; k += 1) {
      const on = rng() < 0.42;
      g.fillStyle = on ? lit : 'rgba(52,64,84,0.9)';
      g.fillRect(4 + k * ww, 8 + f * wh + 4, ww - 8, wh - 10);
      if (on && rng() < 0.4) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(4 + k * ww, 8 + f * wh + 4, ww - 8, 3); }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Asphalt strip with a dashed centre line, tiled along its length. */
export function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#33363d'; g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#3d4048';
  for (let i = 0; i < 160; i += 1) g.fillRect(Math.random() * 64, Math.random() * 128, 2, 2);
  g.fillStyle = '#e8c33a'; g.fillRect(30, 8, 4, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Warm sand / pavement ground texture with subtle noise and tile seams. */
export function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a06e';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1200; i += 1) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
