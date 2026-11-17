# makefun-gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/acengrahmi/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/acengrahmi/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Costa Verde — an open-world crime game

**Seven jobs. One sunset. Every cop in the city.**

Rico Santana rolls into **Costa Verde** at golden hour with an empty wallet
and a reputation to build. Fixer **Lena Cruz**, garage boss **Sal Bianchi**,
boat captain **Mateo Reyes** and one cop who shouldn't be helping him have
seven jobs that will make him rich — or busted. Steal any car, run the jobs,
and when the third wanted star lights up, watch the sky: the police
helicopter is coming, and its searchlight does not let go.

An original game: its own city, characters, vehicles, names, story, art, sound
and music. Nothing is copied from any commercial game. It runs fully offline
from static files — serve `game/` and open `game/index.html` in desktop Chrome.

## Run it

```bash
node serve.ts
```

This starts a tiny static server for the game on `http://localhost:8080`;
open that address in desktop Chrome and play. (Or serve `game/` with any
static file server and open `game/index.html`.)

## How to play

- **WASD / arrows** — move on foot, drive a car
- **Mouse** — look around (click the game to lock the mouse; click again to shoot)
- **E** — enter / exit a car (any car can be stolen — in front of a cop, that raises your wanted level)
- **Click** — shoot (on foot)
- **Shift** — sprint · **Space** — brake · **H** — horn · **M** — music on/off
- **P / Esc** — pause (save from the pause menu) · **T** — retry the current job

## The city

- **Golden hour, always** — the whole game is lit by a low western sun:
  gradient sunset sky, warm haze, long shadows, and windows lighting up as
  dusk settles over the grid.
- **Seven story jobs** — a full campaign with dialogue: meet Lena at the
  Sunset Club, steal the Comet GT, run cargo for Captain Mateo at the Marina,
  settle the Vipers' score, follow an undercover cop's tip, pull the Big
  Score on a timer, and survive the Sunset Showdown. Every job opens with
  the characters talking, and the HUD counts them — *JOB 3/7*.
- **Wanted system** — crimes raise your stars; PD cruisers chase and ram
  you, cops on foot grab you, and from **three stars a police helicopter**
  tracks you from the air with a sweeping searchlight (a second unit joins
  at five stars). Get busted and you lose 10% of your cash at the hospital.
- **Chase camera** — the driving camera leans into turns and its field of
  view stretches with speed; engine pitch climbs with the revs.
- **The waterfront** — a beach with umbrellas and crowds, a boardwalk,
  marina piers and bobbing sailboats, palm-lined boulevards, and six kinds
  of stealable vehicles (sedans, sports cars, taxis, vans, convertibles —
  and a pickup) in traffic that drives the whole grid.
- **HUD** — money, health, wanted stars, story dialogue, mission objective
  with distance, speedometer, and a live minimap (helicopters included).
- **Sound** — engine, sirens, gunshots and a sunset-drive groove, all
  synthesized live with WebAudio. No audio files.
- **Save** — progress autosaves after every mission; continue from the menu.

## Files

- `game/index.html` — the game page (HUD + canvas)
- `game/src/` — one job per file: `main.js` (loop & camera), `city.js`,
  `vehicles.js` (driving & traffic), `people.js`, `police.js`, `combat.js`,
  `missions.js`, `hud.js`, `audio.js`, `player.js`, `save.js`, `util.js`
- `game/vendor/three.min.js` — three.js r149 (vendored library build)
- `main.ts` — hands the game in (copies `game/` + `screenshots/`, writes the dossier)
- `serve.ts` — tiny static server for local play (`node serve.ts`)

## License

MIT — see `LICENSE`.

---

Entered on make.fun — see the bounty: https://make.fun/bounty/gta6-01
