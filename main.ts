// Costa Verde — a gta6-01 entry (Node 22, standard library only).
//
// The game is the static files under game/: a three.js open-world crime story
// set in a golden-hour coastal city — seven story jobs with voiced-by-text
// dialogue, a wanted system whose third star brings a police helicopter with
// a searchlight, a boardwalk-and-marina waterfront, traffic, pedestrians,
// combat, HUD, minimap and synthesized sound — that plays offline in desktop
// Chrome from game/index.html. This program hands it in: it copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json
// with the vendored make.fun library (vendor/makefun-game.ts).
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// What the entry ships, in the order the screenshots tell it: a sunset chase
// under the helicopter's searchlight, a story meeting at the marina, the
// waterfront postcard, and the title screen.
const EXPECTED_SCREENSHOTS = ['1-chase.jpg', '2-story.jpg', '3-vista.jpg', '4-start.jpg'];
const FEATURES = [
  'golden-hour coastal city: gradient sunset sky, low sun, long shadows',
  'seven story jobs with dialogue — Lena Cruz, Sal Bianchi, Mateo Reyes, Dana Ruiz',
  'police helicopter with a live searchlight from three wanted stars',
  'chase camera with speed-stretched FOV and lean-in roll',
  'boardwalk, marina piers and boats; beach crowds; palm boulevards',
  'six stealable vehicle kinds, traffic, pedestrians, combat, save game',
];

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
// Copy the game in whole, then the screenshots. A stale output tree is wiped
// first so a removed file can never leak into a later submission.
rmSync(join(out, 'game'), { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// dossier's bytes; the other limits refuse an entry the scorer would refuse
// (more than 4 screenshots or one over 256 KiB; more than 993 files in game/
// or 48 MiB of game files in all, or a path under game/ over 1000 bytes).
// The dossier is the judge's view of the entry, so the run prints its size.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// Sanity-check the hand-in before reporting it: the dossier's screenshots are
// the judge's first impression, so a missing or renamed shot fails loudly here
// instead of silently on the leaderboard.
const shippedShots = existsSync(join(out, 'screenshots'))
  ? readdirSync(join(out, 'screenshots')).filter((f) => f.endsWith('.jpg')).sort()
  : [];
const missing = EXPECTED_SCREENSHOTS.filter((f) => !shippedShots.includes(f));
if (missing.length) {
  console.error(`WARNING: screenshots missing from the entry: ${missing.join(', ')}`);
}
console.log(`Costa Verde entry written to ${out} (dossier ${dossier.length} bytes)`);
console.log(`Screenshots shipped: ${shippedShots.join(', ') || 'none'}`);
for (const f of FEATURES) console.log(`  · ${f}`);
