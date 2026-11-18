# Costa Verde — an open-world crime story

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/acengrahmi/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/acengrahmi/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game that runs entirely in the browser — no build
step, no server, no network. Open `game/index.html` and play. Rico Santana
rolls into the coastal city of Costa Verde at golden hour with an empty wallet
and seven jobs between him and a fortune.

## The game

- **Golden-hour world** — gradient sunset sky dome, low sun with long shadows,
  warm fog, ACES tone mapping. A 9×9 city grid of ~100 buildings with lit
  windows, palm boulevards and landmarks: the hospital, the east warehouse,
  the Sunset Club and Sal's garage.
- **Waterfront** — a visible teal sea (above the ground plane, as it should
  be), beach, boardwalk with rails, three marina piers, 16 umbrellas and
  seven bobbing sailboats.
- **On foot and behind the wheel** — walk, sprint, steal any parked car.
  Five vehicle kinds including a pickup and the Comet GT. Chase camera with
  a speed-driven FOV kick, a slight roll in turns and a km/h readout.
- **Wanted system, 0–5 stars** — cruisers pursue and ram, foot cops chase on
  foot, and getting caught means a BUSTED banner, a fine and a hospital
  respawn. Stars decay while nobody sees you.
- **Police helicopter** — from three stars (a second at five): dark body,
  spinning rotors, flashing beacons and a real searchlight — additive cone,
  true spotlight and a light pool that tracks you, plus a purple dot on the
  minimap. It counts as seeing you, so the stars stop decaying.
- **Pistol combat both ways** — click to shoot; Vipers and cops shoot back.
- **Sound, synthesized live** — engine pitch follows speed, sirens, gunshots
  and a little sunset synth loop, all WebAudio. No audio files.
- **Saves itself** — cash, story progress and position persist in
  localStorage.

## The seven jobs

| # | Job | Giver | Pay |
|---|-----|-------|-----|
| 1 | Welcome to Costa Verde | Lena Cruz | $400 |
| 2 | Hot Property | Sal Bianchi | $800 |
| 3 | Marina Run | Mateo Reyes | $1,100 |
| 4 | Payback Time | Sal Bianchi | $1,500 |
| 5 | The Informant | Officer Dana Ruiz | $1,800 |
| 6 | The Big Score | Lena Cruz | $2,500 |
| 7 | Sunset Showdown | Lena Cruz | $4,000 |

Every job opens with the giver — gold shirt, gold marker — a dialogue box and
radio chatter, runs under an objective bar with distance or a timer, and pays
out on the completion banner. Press **T** in free-roam to start the next job.

## Controls

**WASD** move / drive · **Mouse** look · **E** enter / exit car ·
**Click** shoot · **Shift** sprint · **Space** brake · **T** next job ·
**F** advance dialogue · **P** pause · **M** music

## Tech

Plain JavaScript on three.js (vendored, r149), one fixed-step simulation
decoupled from the frame rate, zero external requests. `main.ts` builds the
make.fun dossier; `shots.mjs` stages and captures the screenshots headlessly;
`playtest.mjs` plays the game end-to-end in a headless browser and checks the
story payouts to the dollar.

Original game. No real city, person or car is copied. Runs fully offline.

Entered on make.fun — see the bounty: https://make.fun/bounty/gta6-01
