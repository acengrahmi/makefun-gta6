// Costa Verde — make.fun dossier builder (entrypoint).
// Copies game/ and screenshots/ into the output directory, sanity-checks the
// screenshots, prints the feature outline the judges read, and writes the
// dossier with the kit's own buildDossier so it matches the scorer byte for byte.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const root = process.cwd();
const outDir = process.env.MAKEFUN_OUTPUT_DIR
  ? join(root, process.env.MAKEFUN_OUTPUT_DIR)
  : join(root, 'out');

export const FEATURES = [
  'Open-world crime game in a golden-hour coastal city: a 9x9 street grid, ~100 buildings, one sunset that never sets',
  'HERO BOULEVARD: a wide palm-lined avenue running into the sun, with set-back art-deco blocks, glass towers, rooftop water towers and neon billboards (HOTEL, COSTA VERDE, OPEN LATE, MARINA)',
  'Sky: multi-stop gradient dome (deep blue to gold), a big low sun disc with halo, pink-lit clouds, warm fog and long shadows',
  'Sea with a sun-glitter path, 7 bobbing sailboats, 3 marina piers, beach, boardwalk and 16 umbrellas',
  'On foot and driving: WASD + mouse look, sprint, steal any parked or moving car (sedans, sports, pickups, vans, a convertible)',
  'Chase camera with speed FOV kick (62 to 73 degrees), camera roll in turns and a live km/h speedometer',
  'Wanted system 0-5 stars: pursuing cruisers with flashing light bars, foot cops, BUSTED fines and hospital respawns, stars decay when unseen',
  'POLICE HELICOPTER from 3 stars (a second at 5): spinning rotors, flashing beacon, a real spotlight with a visible searchlight cone and ground light pool, purple minimap dot',
  'Pistol combat both ways with tracers: Vipers and cops shoot back, pedestrians flee gunfire',
  'STORY MODE: 7 jobs with named givers and dialogue — Lena Cruz, Sal Bianchi, Mateo Reyes, Officer Dana Ruiz — package runs, a stolen Comet GT, a marina cargo run, a warehouse fight, an informant rescue, a timed big score and a sunset showdown finale',
  'STREET RACE (Sunset GP): a glowing start gate on the boulevard, 6 checkpoints, timer, $300 prize, best time saved, repeatable',
  'TAXI FARES: waving pedestrians hail you — pick them up in any car and deliver them across town for distance-based fares',
  'Street life: 20 traffic cars with headlights, 44 pedestrians, streetlights, parked stealable cars',
  'Full HUD: cash, district name, health, wanted stars with a bust meter, objective bar with distance, dialogue boxes, radio lines, banners and a live minimap (police red, helicopter purple, objectives gold)',
  'Synthesized WebAudio only: engine pitch follows speed, gunshots, sirens, cash chimes and a four-chord sunset music loop — no audio files',
  'localStorage save: cash, story progress, position, race best time, fares and races won',
  'Runs fully offline from static files; the only library is a vendored three.js',
];

function copyTree() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
  cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

function checkScreenshots() {
  const dir = join(outDir, 'screenshots');
  const files = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
  if (files.length < 3 || files.length > 4) throw new Error(`screenshots: expected 3-4 images, found ${files.length}`);
  for (const f of files) {
    const p = join(dir, f);
    const bytes = statSync(p).size;
    if (bytes > 262144) throw new Error(`screenshots/${f}: ${bytes} bytes, over the 262144 cap`);
    const head = readFileSync(p).subarray(0, 3);
    const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e;
    if (!isJpeg && !isPng) throw new Error(`screenshots/${f}: not a JPEG or PNG`);
    console.log(`  shot ${f}: ${bytes} bytes OK`);
  }
  return files;
}

function main() {
  console.log('Costa Verde — building dossier into', outDir);
  copyTree();
  const shots = checkScreenshots();
  if (!existsSync(join(outDir, 'game', 'index.html'))) throw new Error('game/index.html missing after copy');
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(`dossier.json: ${dossier.length} bytes, ${shots.length} screenshots embedded`);
  console.log('\nFeatures:');
  for (const f of FEATURES) console.log('  - ' + f);
  console.log(`\nDone: Costa Verde dossier ready (${FEATURES.length} features, ${shots.length} screenshots).`);
}

main();
