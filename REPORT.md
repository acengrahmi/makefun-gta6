# Costa Verde — Sunset Boulevard · Build Report

Entry for make.fun **gta6-01** ("Make GTA 6"), rebuilt from scratch in a
single recorded session. This file is updated as the build progresses; the
final numbers below are the ones measured on the finished build.

## What was built

A three.js (r149, vendored under `game/vendor/`) open-world crime game:

- `game/src/util.js` — seeded RNG, math helpers, keyboard/mouse input.
- `game/src/city.js` — procedural city: 9×9 grid, ~100 buildings in 3 styles,
  hero boulevard, sea with sun-glitter shader, boardwalk, piers, umbrellas,
  sailboats, neon billboards, palms, streetlights.
- `game/src/actors.js` — player, drivable/traffic/police cars, pedestrians,
  police helicopter with searchlight.
- `game/src/systems.js` — wanted system, combat, busted/hospital, the 7 story
  jobs, Sunset GP race, taxi fares.
- `game/src/hud.js` — HUD, dialogue, banners, minimap, title screen.
- `game/src/audio.js` — WebAudio synthesized music + SFX.
- `game/src/save.js` — localStorage save (money, job index, race best).
- `game/src/main.js` — scene, golden-hour grade, fixed-step simulation loop,
  `#stage=` staging for screenshots and the headless playtest.
- `main.ts` — dossier packaging entrypoint (validation + inventory + copy).

## Playtest

`playtest.mjs` drives the game headlessly (Chromium, CDP pipe) in
`#stage=playtest` mode and exercises movement, driving, wanted escalation,
job flow, race, taxi, busted and save/load through the game's `window.CV`
test surface.

Results: **34/34 checks passed** (headless Chromium, `#stage=playtest`;
re-run on the final code after all visual polish, still 34/34),
covering: world composition (97 buildings, 20 traffic cars,
44 pedestrians), ambient traffic/pedestrian motion, walking, entering /
driving / exiting cars, crime → 3+ stars with helicopter and cruiser
response, pistol hits, job 1 and job 2 end-to-end with exact payouts
($250 → $650 → $1,450), the Sunset GP (finish + best time saved), a taxi
fare (spawn, pickup, delivery, payment), BUSTED by police contact with
hospital respawn and cleared heat, WASTED with hospital respawn, save
persistence across a page reload, and the Sunset Showdown finale (8 Vipers,
campaign complete). Zero page errors during the whole run.

## Screenshots

Captured with `shots.mjs` at 1280×720 from staged scenes:

- `1-chase.jpg` — cover: boulevard chase into the sun, helicopter searchlight.
- `2-story.jpg` — dialogue with Mateo Reyes at the marina.
- `3-vista.jpg` — sunset vista, sun disc + glitter path on the sea.
- `4-start.jpg` — title screen.

Self-assessment: all four reviewed individually; weak first takes were
re-staged and re-shot (posed frozen chase, deepened grade, rebuilt sea
shader). **1-chase** — hero car with two cruisers in pursuit and the
helicopter's searchlight cone on it, palms receding into the sunset, 4
stars showing: strong cover. **2-story** — over-shoulder dialogue with
Mateo Reyes on the pier, his name and line crisp in the dialogue box,
boats and sunset behind: strong. **3-vista** — sun disc over a deep-blue
sea covered in sun-glitter, palm silhouettes framing, pier as a leading
line: strong. **4-start** — title over the boulevard at sunset, pitch line
"SEVEN JOBS · ONE SUNSET · EVERY COP IN THE CITY" legible: strong.

## Dossier

`MAKEFUN_OUTPUT_DIR=out node main.ts` — dossier written: **613,174 bytes**
(10 game files, 719,287 bytes of source including vendored three.js;
4 screenshots, 373,461 bytes total, each under the 256 KiB cap). The
`out/` build directory is a local artifact and is not part of the entry.
