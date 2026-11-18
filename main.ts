// Costa Verde — make.fun entrypoint: builds the competition dossier.
// Copies game/ and screenshots/ into the output directory, sanity-checks the
// screenshot set, then writes dossier.json with the kit's own buildDossier,
// byte-identical to what the scorer produces from the same tree.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier, readGameTree } from './vendor/makefun-game.ts';

const ROOT = new URL('.', import.meta.url).pathname;
const OUT = process.env.MAKEFUN_OUTPUT_DIR || join(ROOT, 'out');

const FEATURES = [
  'Golden-hour open world: gradient sunset sky, low sun with long shadows, warm fog, ACES tone mapping',
  '9x9 city grid, ~100 buildings with lit windows, palm boulevards, landmarks (hospital, warehouse, Sunset Club, Sal\'s garage)',
  'Waterfront: visible teal sea, beach, boardwalk, 3 marina piers, 16 umbrellas, 7 bobbing sailboats',
  'On foot and driving: steal any parked car, 5 vehicle kinds, chase cam with speed FOV kick and turn roll',
  'Wanted 0-5: pursuing cruisers, foot cops, BUSTED with fines and hospital respawn, star decay when unseen',
  'Police helicopter from 3 stars (second at 5): searchlight cone, real spotlight, light pool, purple minimap dot',
  'Seven story jobs with named givers, dialogue, radio lines, timers and payouts from $400 to $4,000',
  'Pistol combat both ways, synthesized WebAudio (engine, sirens, shots, music), localStorage save',
];

const EXPECTED_SHOTS = ['1-chase.jpg', '2-story.jpg', '3-vista.jpg', '4-start.jpg'];
const SHOT_MAX_BYTES = 262144;

function sanityCheckScreenshots(dir) {
  const files = readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort();
  if (files.length !== EXPECTED_SHOTS.length)
    throw new Error(`screenshots: expected ${EXPECTED_SHOTS.length} images, found ${files.length}: ${files.join(', ')}`);
  for (const name of EXPECTED_SHOTS) {
    const p = join(dir, name);
    if (!existsSync(p)) throw new Error(`screenshots: missing ${name}`);
    const bytes = readFileSync(p);
    if (bytes.length > SHOT_MAX_BYTES) throw new Error(`screenshots: ${name} is ${bytes.length} bytes, over the ${SHOT_MAX_BYTES} cap`);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`screenshots: ${name} is not a JPEG`);
  }
  return files;
}

function printManifest(tree) {
  const byClass = { source: [], vendored: [], asset: [] };
  for (const f of tree.files) byClass[f.cls].push(f);
  console.log(`  manifest: ${byClass.source.length} source, ${byClass.vendored.length} vendored, ${byClass.asset.length} asset`);
  for (const f of byClass.source) console.log(`    source   ${f.path} (${f.bytes} B)`);
  for (const f of byClass.vendored) console.log(`    vendored ${f.path} (${(f.bytes / 1024).toFixed(0)} KiB)`);
}

function main() {
  const shots = sanityCheckScreenshots(join(ROOT, 'screenshots'));
  mkdirSync(OUT, { recursive: true });
  cpSync(join(ROOT, 'game'), join(OUT, 'game'), { recursive: true });
  cpSync(join(ROOT, 'screenshots'), join(OUT, 'screenshots'), { recursive: true });
  const dossier = buildDossier(OUT, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: SHOT_MAX_BYTES },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  writeFileSync(join(OUT, 'dossier.json'), dossier);
  const tree = readGameTree(join(OUT, 'game'));
  printManifest(tree);
  console.log('Costa Verde — dossier built');
  console.log(`  game: ${tree.files.length} files, ${(tree.totalBytes / 1024).toFixed(0)} KiB (source + vendored three.js)`);
  console.log(`  screenshots: ${shots.length} shipped (${shots.join(', ')})`);
  console.log(`  dossier.json: ${(dossier.length / 1024).toFixed(0)} KiB`);
  console.log('  features:');
  for (const f of FEATURES) console.log('   - ' + f);
}

main();
