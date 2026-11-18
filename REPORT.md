# Build report — Costa Verde (gta6-01, from-scratch rebuild)

Built in one recorded session, from the kit starter only. Every game file was
written fresh this session; three.js r149 is vendored from cdnjs.

## Layout
- `game/index.html` — HUD DOM + title screen; loads the scripts in order.
- `game/src/` — util (world constants, collision), city (sky/sun/city/
  waterfront/sea), actors (vehicles, people, player), systems (police,
  helicopter, combat, the 7-job mission engine), hud (incl. canvas minimap),
  audio (synthesized WebAudio), save (localStorage), main (fixed-step loop
  decoupled from rAF, input, chase cam, `?stage=`/`#stage=` staging hooks,
  `window.__cv` test API).
- `main.ts` — dossier builder (3 write/edit passes): copies the game, embeds
  the 4 screenshots, sanity-checks them (JPEG magic, < 256 KiB), prints the
  feature list, writes dossier.json via the kit's `buildDossier`.

## Staging (screenshots)
`shots.mjs` drives headless Chromium over raw CDP. This Chromium build needs
the platform's canonical WebGL policy file + SHA-256 switches to start, and
blocks http://127.0.0.1 navigations (Local Network Access), so pages load via
file:// and stages via `#stage=`. The cover is gated geometrically by
`__cv.chaseReady()`: car above 100 km/h, helicopter settled at its hover
point and projected inside the frustum below the HUD bar — capture only while
the gate holds. The chase stage loops the boulevard (wrap at x < −60) so the
gate always samples the car inside the city.

## Validation
- `playtest.mjs`: **25/25 checks pass, 0 console errors, 0 external
  requests.** Covers boot/render, the 7 jobs with exact payouts, counts
  (16 traffic / 38 peds), walking, stealing, driving, exit, job 1 = exactly
  +$400, autosave, job 2 steal + deliver = $1,200 total, the job-4 fight
  (5 Vipers spawn, shoot back, all downed, +$1,500), wanted 4 → cruisers +
  helicopter active and converging.
- `MAKEFUN_OUTPUT_DIR=out node main.ts`: dossier.json **542 KiB**, game
  664 KiB, screenshots 96 / 71 / 66 / 119 KiB (all < 256 KiB).

## Screenshots
- `1-chase.jpg` — chase cam behind the red sedan at 109 km/h down Sunset
  Boulevard during job 6, helicopter body + searchlight cone upper right,
  light pool on the car, cruiser ahead, minimap pursuit. Recaptured in a
  targeted fix pass after the first two rounds framed it over the sea /
  behind the HUD bar.
- `2-story.jpg` — Mateo Reyes dialogue open at the marina marker, gold giver
  beside the beacon, sea behind.
- `3-vista.jpg` — over teal water along the coast: sailboats, two piers,
  beach, boardwalk, palms, skyline.
- `4-start.jpg` — title screen over the orbiting sunset city.

## Honest weaknesses
- The vista's sun sits just out of frame; the grade is warm but flatter than
  a saturated grade in open areas (fog + untextured ground).
- The helicopter flies low (altitude 15) so it reads on the cover; it can
  clip tall rooftops in normal play. Cosmetic only.
- Buildings are simple boxes with canvas facades; no interiors, no traffic
  lights, pedestrians are capsule people with a walk cycle.
- The fight test exposed two real bugs that were fixed during the build:
  downed pedestrians kept absorbing bullets, and point-blank targets
  (under 2 m) could not be hit at all.
