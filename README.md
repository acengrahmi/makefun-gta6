# Costa Verde — Sunset Boulevard

![GitHub stars](https://img.shields.io/github/stars/acengrahmi/makefun-gta6?style=social)
![GitHub forks](https://img.shields.io/github/forks/acengrahmi/makefun-gta6?style=social)
![GitHub issues](https://img.shields.io/github/issues/acengrahmi/makefun-gta6)

**SEVEN JOBS · ONE SUNSET · EVERY COP IN THE CITY**

Costa Verde is a golden-hour open-world crime game that runs entirely in the
browser. You arrive in a palm-lined coastal city at sunset with nothing but a
pistol and a phone full of questionable contacts. Work seven story jobs for
Lena Cruz, Sal Bianchi, Mateo Reyes and Officer Dana Ruiz — steal a Comet GT,
run the marina, settle a score with the Vipers, pull the Big Score and survive
the Sunset Showdown — while a five-star wanted system sends cruisers, foot
cops and a searchlight helicopter after you. Between jobs, run the Sunset GP
checkpoint race down the hero boulevard or pick up taxi fares along the
boardwalk. Every sound is synthesized live with WebAudio; the whole city is
procedural three.js — no downloads, no assets, no server.

## Controls

| Action | Key |
| --- | --- |
| Move / drive | `W A S D` or arrow keys |
| Run | `Shift` |
| Enter / exit car, talk, interact | `E` |
| Shoot pistol | `F` or mouse click |
| Handbrake | `Space` |
| Camera | mouse drag / `Q` `E` while on foot |
| Pause | `P` |
| Mute | `M` |

## Features

- **A living golden-hour city** — a 9×9 street grid with ~100 buildings in
  three architectural styles (glass towers, art-deco hotels, brick low-rises),
  procedurally lit windows, neon billboards and a warm ACES-graded sunset
  with a visible sun disc and matching fog.
- **The hero boulevard** — one wide palm-lined avenue with set-back buildings
  running straight into the sunset over the sea; the Sunset GP races down it.
- **The coast** — a sun-glitter path on animated water, a boardwalk, three
  piers, sixteen beach umbrellas and seven sailboats.
- **Traffic & crowds** — 20 AI cars driving the grid and 44 pedestrians on
  the sidewalks who flee gunfire and speeding cars.
- **Five-star wanted system** — crimes raise your stars; police cruisers
  chase, foot cops shoot, and at three stars a helicopter joins with a moving
  searchlight. Get cornered and you're BUSTED; get shot down and you wake up
  at the hospital, lighter in the wallet either way.
- **Seven story jobs** — a full campaign from a $400 welcome ride to the
  $4,000 Sunset Showdown finale, with dialogue, objectives and payouts.
- **Side hustles** — the Sunset GP checkpoint race (best time saved) and
  taxi fares with distance fares and speed tips.
- **Synthesized audio** — a WebAudio synthwave loop, engine hum, sirens,
  gunshots and payout chimes; zero audio files.
- **Persistent save** — money, job progress and race best time are kept in
  `localStorage`.

## Running it

Open `game/index.html` in a desktop browser (or serve the folder with
`node serve.ts`). The entrypoint `main.ts` packages `game/` and
`screenshots/` into the make.fun dossier.

Entered on make.fun — see the bounty: https://make.fun/bounty/gta6-01
