// util.js — shared helpers for Costa Verde: a seeded RNG (so the city, the
// traffic and the staged screenshots are identical on every load), small math
// helpers, and a keyboard/mouse input state the rest of the game polls.

// mulberry32: tiny deterministic PRNG. One stream builds the world, another
// drives ambient behaviour; both are seeded so a staged scene is reproducible.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Shortest-path angle interpolation, for steering and camera work.
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
export const randInt = (rng, lo, hi) => Math.floor(rand(rng, lo, hi + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// World geometry constants, shared by the city builder, the actors and the
// systems so the road network is defined exactly once. Streets run along the
// lines of a 9x9 block grid; the sea lies to the west (-x).
export const WORLD = {
  block: 40,          // building block pitch content
  road: 14,           // standard street width
  pitch: 54,          // block + road
  half: 4,            // streets at indices -4..4
  boulevardHalf: 15,  // hero boulevard half width (z=0 avenue, runs E-W)
  seaX: -268,         // water starts west of here
  beachX: -246,       // boardwalk line
  cityEdge: 246,      // playable clamp
};
export const streetCoord = (i) => i * WORLD.pitch; // centre line of street i

// Input: a flat key state plus edge-triggered "pressed" queries and pointer
// state. The game polls this each simulation step; nothing here touches the
// DOM beyond listeners.
export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.pressedSet = new Set();
    this.mouseDown = false;
    this.mousePressed = false;
    this.mouseDX = 0;
    this.pointerSeen = false;
    const down = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.pressedSet.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    };
    const up = (e) => this.keys.delete(e.key.toLowerCase());
    dom.addEventListener('keydown', down);
    dom.addEventListener('keyup', up);
    dom.addEventListener('mousedown', () => { this.mouseDown = true; this.mousePressed = true; this.pointerSeen = true; });
    dom.addEventListener('mouseup', () => { this.mouseDown = false; });
    dom.addEventListener('mousemove', (e) => { this.mouseDX += e.movementX || 0; });
    dom.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
  }
  down(k) { return this.keys.has(k); }
  // Edge trigger: true only on the first step after the key went down.
  pressed(k) {
    if (this.pressedSet.has(k)) { this.pressedSet.delete(k); return true; }
    return false;
  }
  peekPressed(k) { return this.pressedSet.has(k); }
  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }
  consumeMouseDX() { const d = this.mouseDX; this.mouseDX = 0; return d; }
  endStep() { this.mousePressed = false; this.pressedSet.clear(); }
}

// Format dollars the way the HUD shows them: $1,250.
export const money = (n) => '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
