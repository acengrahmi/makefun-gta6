# Costa Verde — an open-world crime game

Rico Santana just rolled into **Costa Verde** with an empty wallet and a
reputation to build. Fixer Lena Cruz has work for him — if he can drive, steal
and shoot his way through it. The whole sun-soaked city is yours: steal any
car, run missions, dodge the cops, and get rich.

An original game: its own city, characters, vehicles, names, story, art, sound
and music. Nothing is copied from any commercial game. It runs fully offline
from static files — serve `game/` and open `game/index.html` in desktop Chrome.

## How to play

- **WASD / arrows** — move on foot, drive a car
- **Mouse** — look around (click the game to lock the mouse; click again to shoot)
- **E** — enter / exit a car (any car can be stolen — in front of a cop, that raises your wanted level)
- **Click** — shoot (on foot)
- **Shift** — sprint · **Space** — brake · **H** — horn · **M** — music on/off
- **P / Esc** — pause (save from the pause menu) · **T** — retry the current job

## The city

- **Missions & story** — four jobs for Lena Cruz: meet her at the Sunset Club,
  steal a Comet GT from the Marina, take down the Vipers at their warehouse,
  and one timed run across the whole city with the cops on your tail.
- **Wanted system** — crimes raise your stars; PD cruisers chase and ram you,
  cops on foot grab you. Get busted and you lose 10% of your cash at the hospital.
- **Traffic & pedestrians** — cars drive the grid, people stroll the sidewalks
  and flee from gunfire. Cash bundles are hidden around the city.
- **HUD** — money, health, wanted stars, mission objective with distance,
  speedometer, and a live minimap.
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
