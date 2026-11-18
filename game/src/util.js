// util.js — shared helpers for Costa Verde: seeded RNG, math, the street-grid
// layout constants every other module builds on, and circle-vs-AABB collision.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

/** Street layout: avenues and streets centred on multiples of PITCH. */
export const PITCH = 60;
export const STREET_HALF = 8;          // ordinary street half-width (16 m wide)
export const BOULEVARD_HALF = 13;      // hero boulevard half-width (26 m wide)
export const CENTERS = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
export const CITY_MIN = -268;
export const CITY_MAX = 268;
export const BOARDWALK_Z = 282;
export const BEACH_Z = 306;
export const SEA_Z = 322;

export function streetHalfAt(z) { return Math.abs(z) < 1 ? BOULEVARD_HALF : STREET_HALF; }

/** Distance from a point to the nearest street centre line on each axis. */
export function nearStreetX(x) { let m = 1e9; for (const c of CENTERS) m = Math.min(m, Math.abs(x - c)); return m; }
export function nearStreetZ(z) { let m = 1e9; for (const c of CENTERS) m = Math.min(m, Math.abs(z - c)); return m; }
export function onStreet(x, z) {
  return nearStreetX(x) < STREET_HALF + 2 || nearStreetZ(z) < streetHalfAt(z) + 2;
}

/** Push a circle (x,z,r) out of every AABB in `boxes` ({minX,maxX,minZ,maxZ}). Returns corrected [x,z]. */
export function collideCircle(x, z, r, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const cx = clamp(x, b.minX, b.maxX);
    const cz = clamp(z, b.minZ, b.maxZ);
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r; z = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = x - b.minX, pr = b.maxX - x, pt = z - b.minZ, pb = b.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.minX - r; else if (m === pr) x = b.maxX + r;
        else if (m === pt) z = b.minZ - r; else z = b.maxZ + r;
      }
    }
  }
  return [x, z];
}

export function headingToVec(h) { return [Math.sin(h), Math.cos(h)]; }
