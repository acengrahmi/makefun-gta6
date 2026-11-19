# Costa Verde — Sunset Boulevard

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![make.fun rank](https://make.fun/badge/gta6-01/acengrahmi/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01)
[![make.fun reward](https://make.fun/badge/gta6-01/acengrahmi/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01)

A golden-hour open-world crime game that runs entirely in the browser. One
sunset, one coastal city, seven jobs — and every cop in the city.

## The game

You arrive in Costa Verde with a borrowed car and a phone full of other
people's problems. Work your way up the ladder: run an errand for Lena Cruz,
steal a Comet GT for Sal Bianchi, race the Marina Run for Mateo Reyes, settle
a score with the Vipers, feed information to Officer Dana Ruiz, pull the Big
Score against the clock, and face the Sunset Showdown as the light dies.

- **A living city** — a 9×9 grid of towers and palms at golden hour, with a
  working seafront: boardwalk, three piers, beach umbrellas and sailboats
  riding the swell.
- **Real traffic** — civilian cars cruise the grid, brake for trouble and
  scatter when the shooting starts.
- **A wanted system that escalates** — cruisers first, then foot cops, then a
  searchlight helicopter that pins you in its beam. Get surrounded and you're
  BUSTED; wreck the car and you're WASTED. Either way you wake up at the
  hospital with lighter pockets.
- **Side money** — the Sunset GP street race against three rivals, and taxi
  fares for anyone with somewhere to be.
- **Synth soundtrack** — engine, sirens and a sunset groove, all generated
  live with WebAudio. No audio files, no network, no build step.

## Play it

Open `game/index.html` in a desktop browser, or serve the folder:

```
node serve.ts        # then visit http://localhost:8080
```

Drive with WASD or the arrow keys, brake/reverse with S, handbrake with
Space. Enter and M answer the phone and advance conversations.

## Layout

- `main.ts` — the entrypoint: validates the entry, copies `game/` and
  `screenshots/` to the output directory and writes the dossier.
- `game/` — the game itself: `index.html` plus one ES module,
  `src/main.js`, with three.js r149 vendored under `game/vendor/`.
- `screenshots/` — the four dossier stills: the chase, the story, the
  vista, the start screen.

Entered on make.fun — see the bounty: https://make.fun/bounty/gta6-01
