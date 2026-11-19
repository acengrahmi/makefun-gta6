# Costa Verde v9 — Sunset Boulevard: build report

## What was built

A from-scratch rebuild of the Costa Verde entry for gta6-01, written this
session in `~/workspace/makefun/watch-gta6-01-v9` under a live recording:

- **main.ts rewritten completely** (193 lines, two write passes, none of the
  kit starter's text survives): pre-flight validation (page present, the four
  required stills present, PNG/JPEG magic, 16 KiB–256 KiB each, no extras),
  a sha256 + byte-size manifest of every shipped file printed for the run
  log, the copy to the output directory, the dossier written through the
  vendored `buildDossier` (the scorer re-runs that library byte-for-byte, so
  the dossier must come from it), and a reproducibility self-check that
  rebuilds the dossier from the output and demands byte equality.
- **The game**: one ES module, `game/src/main.js` (1,700 lines), three.js
  r149 vendored at `game/vendor/three.min.js`. 9×9 grid, 104 buildings
  (deterministic seed; the design target was ~107), golden-hour ACES grade
  with a gradient sky dome and sun disc, sea + boardwalk + 3 piers + 16
  umbrellas + 7 sailboats, player car + 14 traffic cars, wanted 0–5 with up
  to 6 cruisers, 5 foot cops and a searchlight helicopter, BUSTED/WASTED
  respawns at the hospital, WebAudio synth engine/sirens/music, localStorage
  save. Seven jobs in order (Welcome to Costa Verde $400, Hot Property $800,
  Marina Run $1,100, Payback Time $1,500, The Informant $1,800, The Big
  Score $2,500, Sunset Showdown $4,000), plus the Sunset GP race (9
  checkpoints, 3 rivals) and repeatable taxi fares.
- **README.md** carries the three live make.fun badge lines (bounty, rank,
  reward) and zero shields.io URLs; **.gitignore** is in the tree with the
  exact four lines (node_modules/, out/, *.log, .DS_Store) — the two things
  that killed v7/v8 are present from the first writes this time.

## Validation

- **Playtest** (headless Chromium, CDP pipe, file://, scripted through the
  game's `window.CV` surface): **23/23 checks PASS, 0 page errors** — page
  load, building count, title → start, real driving, all seven jobs
  completed end-to-end with exact payouts ($400/$800/$1,100/$1,500/$1,800/
  $2,500/$4,000), wanted rising to 2 on the theft, Sunset GP payout, taxi
  fare payout, cruisers rolling at 3 stars, BUSTED (fine + hospital
  respawn), WASTED (repair + respawn), and the save file persisted with
  job 7 and finished=true.
- **Entrypoint run**: `MAKEFUN_OUTPUT_DIR=out node main.ts` → dossier.json
  **634,987 bytes**, verified reproducible; manifest lists all 7 shipped
  files with sha256 (game/index.html 6,313 B; game/src/main.js 74,108 B;
  game/vendor/three.min.js 608,081 B; four stills below).
- **Screenshots** (1280×720, staged via `#stage=`): 1-chase.png 107,628 B
  (frozen tableau: Comet, two cruisers with lit bars, helicopter spotlight
  cone, 3 stars), 2-story.png 62,408 B (Mateo dialog at the pier, boats),
  3-vista.png 122,254 B (full city + sun disc + seafront), 4-start.png
  121,465 B (title + "SEVEN JOBS · ONE SUNSET · EVERY COP IN THE CITY").
  All four inspected visually after capture; chase and story were re-staged
  and recaptured once (first chase frame was a police pile-up on the camera;
  first story frame had the car past the waterline).
- **Badge grep**: exactly 3 `make.fun/badge` URLs in README.md, 0 shields.io.

## Honest failures along the way

- First playtest run: 12/23 — the building generator overshot (167 vs ~107;
  style distribution retuned to land at 104) and the tail job's test hook
  raced the job-start delay (a `debugTail` reset line in the game was
  removed; the rig now waits for the job to arm). Second run: 23/23.
- First screenshot pass: chase and start stages timed out on the readiness
  flag under SwiftShader (50 frames was too many at ~1 fps); threshold
  lowered to 20 frames and both captured cleanly.
- The stills are JPEG-encoded under .png names: the dossier accepts PNG or
  JPEG by magic bytes, and a true PNG of these frames would break the
  scorer's 256 KiB per-image cap.
