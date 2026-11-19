// Costa Verde — Sunset Boulevard: the hand-in program.
//
// What this file is: the entrypoint the grader runs. It takes the finished
// game that lives beside it (game/, plain static files a desktop browser
// loads offline) plus the four dossier stills (screenshots/) and produces
// the deliverable in the output directory: a verbatim copy of both folders
// and a dossier.json describing them.
//
// What this file is not: a rubber stamp. Before anything is copied, the
// entry has to prove itself — the page must exist, every required still
// must be present, be a real PNG or JPEG, and be big enough to be an
// actual render rather than a placeholder, and nothing the scorer's caps
// would refuse may ride along. Every shipped file is hashed (sha256) and
// measured, and the manifest is printed for the run log. The dossier
// itself is written by the vendored make.fun library, because the scorer
// re-runs that exact library on the hand-in and compares bytes; the
// manifest below is how a human reads what went in.
//
// Run it the way the grader does (output defaults to /output):
//   node main.ts
// or, outside the container, point MAKEFUN_OUTPUT_DIR at a scratch dir:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** How the game introduces itself; the same words open its start screen. */
const GAME = {
  title: 'Costa Verde — Sunset Boulevard',
  tagline: 'SEVEN JOBS · ONE SUNSET · EVERY COP IN THE CITY',
  features: [
    'Open-world coastal city on a 9x9 grid, ~107 buildings, golden-hour grade',
    'Seven story jobs: errands, a stolen Comet GT, a gang payback, a tail, a timed score, a showdown',
    'Wanted system 0-5: cruisers, foot cops and a searchlight helicopter; BUSTED and WASTED respawns',
    'Sunset GP street race against three rivals, plus repeatable taxi fares',
    'Live WebAudio synth: engine, sirens and a sunset groove; progress saved to localStorage',
  ],
} as const;

/** The four stills the dossier leads with, in order; the first is the cover. */
const REQUIRED_STILLS = ['1-chase.png', '2-story.png', '3-vista.png', '4-start.png'] as const;

/** A real render of this game is never tiny; a stub or a blank frame is. */
const MIN_STILL_BYTES = 16 * 1024;
/** The scorer's per-image cap (gate.json): a still over this is refused. */
const MAX_STILL_BYTES = 256 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Refuse the hand-in loudly and early, with the reason a human can act on. */
function refuse(reason: string): never {
  throw new Error(`costa-verde: refusing to hand in: ${reason}`);
}

interface ShippedFile {
  /** Path as it will sit in the output directory, POSIX separators. */
  path: string;
  bytes: number;
  sha256: string;
}

/** Every regular file under dir, as output-relative paths, in stable order. */
function walk(dir: string, base: string): ShippedFile[] {
  const found: ShippedFile[] = [];
  const pending = [dir];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        pending.push(full);
      } else if (st.isFile()) {
        const bytes = readFileSync(full);
        found.push({
          path: `${base}/${relative(dir, full).split('\\').join('/')}`,
          bytes: st.size,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      } else {
        refuse(`${full} is not a plain file or directory`);
      }
    }
  }
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** One still, checked against the magic bytes of the formats the dossier holds. */
function checkStill(name: string): void {
  const full = join(here, 'screenshots', name);
  if (!existsSync(full)) refuse(`screenshots/${name} is missing`);
  const head = readFileSync(full);
  const isPng = PNG_MAGIC.every((b, i) => head[i] === b);
  const isJpeg = JPEG_MAGIC.every((b, i) => head[i] === b);
  if (!isPng && !isJpeg) refuse(`screenshots/${name} is neither PNG nor JPEG`);
  if (head.length < MIN_STILL_BYTES) {
    refuse(`screenshots/${name} is only ${head.length} bytes — a placeholder, not a render`);
  }
  if (head.length > MAX_STILL_BYTES) {
    refuse(`screenshots/${name} is ${head.length} bytes, over the scorer's ${MAX_STILL_BYTES} cap`);
  }
}

/** The whole pre-flight: page present, stills exact, nothing extra smuggled in. */
function preflight(): void {
  if (!existsSync(join(here, 'game', 'index.html'))) refuse('game/index.html is missing');
  if (!existsSync(join(here, 'game', 'src', 'main.js'))) refuse('game/src/main.js is missing');
  const shotsDir = join(here, 'screenshots');
  if (!existsSync(shotsDir)) refuse('screenshots/ is missing');
  const present = readdirSync(shotsDir).filter((n) => !n.startsWith('.'));
  for (const name of REQUIRED_STILLS) checkStill(name);
  const extras = present.filter((n) => !(REQUIRED_STILLS as readonly string[]).includes(n));
  if (extras.length > 0) {
    refuse(`screenshots/ holds files the dossier cannot take: ${extras.join(', ')}`);
  }
}

/** The scorer's gate, restated so this program fails where the scorer would. */
const GATE = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

/** Copy one folder of the entry into the output directory, verbatim. */
function ship(folder: 'game' | 'screenshots'): void {
  cpSync(join(here, folder), join(outDir, folder), { recursive: true });
}

/**
 * The manifest a human reads: the game's own words about itself, then every
 * shipped file with its size and sha256. Printed to the run log; the
 * machine-checked twin of this information is the dossier.
 */
function printManifest(files: ShippedFile[]): void {
  const total = files.reduce((n, f) => n + f.bytes, 0);
  console.log(`${GAME.title}`);
  console.log(GAME.tagline);
  for (const feature of GAME.features) console.log(`  - ${feature}`);
  console.log(`manifest: ${files.length} files, ${total} bytes`);
  for (const f of files) console.log(`  ${f.sha256.slice(0, 16)}  ${String(f.bytes).padStart(9)}  ${f.path}`);
}

/**
 * Trust nothing: rebuild the dossier from the output directory a second
 * time and demand byte equality with what was written, and confirm the
 * written dossier really does carry the four stills. A hand-in that
 * cannot reproduce itself is not a hand-in.
 */
function verifyHandIn(written: Uint8Array): void {
  const again = buildDossier(outDir, GATE);
  if (again.length !== written.length || !again.every((b, i) => b === written[i])) {
    refuse('the dossier does not reproduce from the output directory');
  }
  const parsed = JSON.parse(new TextDecoder().decode(written)) as { images?: unknown[] };
  if (!Array.isArray(parsed.images) || parsed.images.length !== REQUIRED_STILLS.length) {
    refuse('the dossier does not carry exactly the four stills');
  }
}

function main(): void {
  preflight();
  mkdirSync(outDir, { recursive: true });
  ship('game');
  ship('screenshots');

  const files = [...walk(join(outDir, 'game'), 'game'), ...walk(join(outDir, 'screenshots'), 'screenshots')];
  printManifest(files);

  const dossier = buildDossier(outDir, GATE);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  verifyHandIn(dossier);
  console.log(`dossier.json: ${dossier.length} bytes, verified reproducible`);
}

main();
