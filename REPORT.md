# Costa Verde — Sunset Boulevard · Build Report

## What was built

A golden-hour open-world crime game in vanilla JS + three.js r149 (vendored
at `game/vendor/three.min.js`), written from scratch for gta6-01:

- **City** (`game/src/city.js`) — a 9×9 street grid with **107 buildings** in
  three styles (glass towers with lit windows, pastel stucco slabs, lowrises)
  plus animated neon billboards, wrapped around a palm-lined hero boulevard
  with a planted median. ACES-filmic golden-hour grade, gradient sky, low
  sun disc with a halo over the sea.
- **Waterfront** — sun-glitter sea (900 animated sparkle points in a wedge
  under the sun), boardwalk, **3 piers**, **16 beach umbrellas**, **7
  sailboats** bobbing on the swell.
- **Actors** (`game/src/actors.js`) — **20 traffic cars** with lane-following
  AI that turns at intersections and brakes for the player, **44
  pedestrians** who wander the sidewalks and flee gunfire, police cruisers
  with flashing lightbars, foot cops, and a **searchlight helicopter** whose
  spotlight tracks the player at 3+ stars.
- **Systems** (`game/src/systems.js`) — a 0–5 star wanted system with decay,
  a bust meter, BUSTED (police station respawn, 10% fine) and WASTED
  (hospital respawn) states, **7 story jobs with full dialogue** — Welcome
  to Costa Verde ($400), Hot Property (steal the gold Comet GT, $800),
  Marina Run ($1,100), Payback Time (5 Vipers, $1,500), The Informant
  ($1,800), The Big Score (timed bank job, $2,500), Sunset Showdown (finale,
  $4,000) — plus the **Sunset GP** 9-checkpoint race ($600, best time kept)
  and **taxi fares** with distance-based pay.
- **Presentation** — HUD with cash, wanted stars, health and bust bars, a
  live minimap (roads, sea, police, objective blips), dialogue boxes, centre
  banners and a title screen carrying the pitch line. All sound is
  synthesized WebAudio (`game/src/audio.js`): engine, sirens, gunfire, cash
  registers and a 100 BPM synthwave loop. Progress persists in localStorage
  (`game/src/save.js`). The simulation runs on a fixed 60 Hz timestep
  decoupled from rAF.

## Playtest results

`node playtest.mjs` (headless Chromium, CDP pipe, driving the game's
`window.CV` surface): **40 passed, 0 failed** — page loads with zero page
errors; world counts verified (107 buildings, 20 traffic, 49 pedestrians
incl. NPCs, 9 parked cars); title → play; walking; entering/driving/exiting
cars; gunfire fells a target and raises a wanted star; cruisers and the
helicopter respond at 3 stars and stand down at 0; jobs 1, 2 and 4 played
end to end with exact payouts ($400 / $800 / $1,500); the Sunset GP raced
through all 9 checkpoints ($600, best time recorded); a taxi fare picked up,
delivered and paid; BUSTED respawn at the station; WASTED respawn at the
hospital at full health; cash verified identical after a full page reload
(localStorage save). One intermediate run scored 38/40 on two timing-sensitive
harness checks (random police spawn distances); the surrounding runs are
40/40.

## Dossier

`MAKEFUN_OUTPUT_DIR=out node main.ts` exits 0. `out/dossier.json` is
**385,657 bytes**; `out/game` totals 702,099 bytes (10 source files +
index.html + the vendored three.min.js); the four screenshots total
216,048 bytes, each a 1280×720 JPEG under the 256 KiB cap.

## Screenshots

- `1-chase.jpg` (cover) — the orange Comet GT mid-chase on the hero
  boulevard: two cruisers with lightbars on its tail, the helicopter's
  searchlight above, 4 wanted stars, "LOSE THE COPS!" objective, minimap.
- `2-story.jpg` — Mateo Reyes on the middle pier at sunset, mid-dialogue
  ("Amigo! My cousin left a package at the marina office…"), sun halo over
  the glittering sea behind the two figures.
- `3-vista.jpg` — the postcard: sun disc and halo over the glitter path,
  pier, beach umbrellas, sailboats and a framing palm from the boardwalk.
- `4-start.jpg` — the title screen: COSTA VERDE / SUNSET BOULEVARD with the
  pitch line "SEVEN JOBS · ONE SUNSET · EVERY COP IN THE CITY", PLAY button
  and the full control list over the live city.

## Validation commands

```
node --check game/src/*.js playtest.mjs shots.mjs   # all parse
node playtest.mjs                                    # 40 passed, 0 failed
node shots.mjs                                       # captures all 4 screenshots
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts  # dossier builds, exit 0
```

Every screenshot was inspected after capture; the chase staging, pier
framing, vista camera and sun glow were each revised and recaptured at
least once (hash-only navigation reload fix in shots.mjs, cruiser/heli
repositioning for the cover, pier-deck height fix for the story scene,
flat glow disc replacing a sprite that blended unevenly over the sun).
