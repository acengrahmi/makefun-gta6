// Costa Verde — Sunset Boulevard: the make.fun gta6-01 entrypoint.
//
// The game itself is the game/ folder beside this file: plain static files
// (game/index.html plus its ES modules and the vendored three.js build) that
// a desktop browser runs offline. This program is the packaging step: it
// validates the entry, inventories it, copies game/ and screenshots/ into
// the output directory and writes dossier.json — the summary the judge
// reads — with the vendored make.fun library.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The files the entry is meaningless without. If any is missing the dossier
// would describe a broken game, so fail loudly here instead.
const REQUIRED = [
  'game/index.html',
  'game/vendor/three.min.js',
  'game/src/util.js',
  'game/src/city.js',
  'game/src/actors.js',
  'game/src/systems.js',
  'game/src/hud.js',
  'game/src/audio.js',
  'game/src/save.js',
  'game/src/main.js',
  'screenshots/1-chase.jpg',
  'screenshots/2-story.jpg',
  'screenshots/3-vista.jpg',
  'screenshots/4-start.jpg',
];
for (const rel of REQUIRED) {
  if (!existsSync(join(here, rel))) {
    throw new Error(`Costa Verde entry is incomplete: missing ${rel}`);
  }
}

// Screenshot gate, mirroring the scorer's own caps: at most 4 shots, each a
// JPEG of at most 256 KiB. Checked here so a bad capture fails the build,
// not the judging.
const shots = readdirSync(join(here, 'screenshots')).filter((f) => /\.jpe?g$/i.test(f)).sort();
if (shots.length > 4) throw new Error(`too many screenshots: ${shots.length} (max 4)`);
let shotBytes = 0;
for (const f of shots) {
  const size = statSync(join(here, 'screenshots', f)).size;
  if (size > 262144) throw new Error(`screenshot ${f} is ${size} bytes (max 262144)`);
  shotBytes += size;
}

// Inventory the game sources for the build log: the judge reads the same
// outline from the dossier, and a human skimming this output should see the
// same shape — eight modules, one vendored library, no stray files.
function inventory(dir, prefix = '') {
  const rows = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) rows.push(...inventory(p, prefix + name + '/'));
    else rows.push({ path: prefix + name, bytes: statSync(p).size });
  }
  return rows;
}
const gameFiles = inventory(join(here, 'game'));
const gameBytes = gameFiles.reduce((a, f) => a + f.bytes, 0);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files in all, or a path under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Costa Verde — Sunset Boulevard`);
console.log(`  game files: ${gameFiles.length} (${gameBytes} bytes)`);
for (const f of gameFiles) console.log(`    ${f.path} — ${f.bytes}`);
console.log(`  screenshots: ${shots.length} (${shotBytes} bytes) — ${shots.join(', ')}`);
console.log(`  dossier written to ${join(out, 'dossier.json')}`);
