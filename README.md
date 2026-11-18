[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/acengrahmi/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/acengrahmi/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Costa Verde — an open-world crime story

A golden-hour open-world crime game that runs entirely in the browser from static files. You are **Rico Santana**, rolling into the coastal city of Costa Verde at sunset with an empty wallet and seven jobs between you and the big money.

## The city

- A 9×9 street grid with ~100 buildings: pastel art-deco beach blocks, downtown glass towers, brick and terracotta mid-rises, rooftop water towers and AC units, and canvas-texture neon billboards (`HOTEL`, `COSTA VERDE`, `OPEN LATE`, `MARINA`, `SURF SHOP`, `CASINO`).
- **The Hero Boulevard** — a wide palm-lined avenue built for one shot: driving west, into the sun, with long shadows raking the road and the sea glinting at the end of the street.
- A multi-stop gradient sky (deep blue → violet → rose → orange → gold), a big low sun disc with a halo, pink-lit clouds, warm fog and ACES tone mapping.
- The waterfront: teal sea with a **sun-glitter path**, 7 bobbing sailboats, 3 marina piers, a beach with 16 umbrellas, and a railed boardwalk.
- Street life: 20 traffic cars (one convertible, glowing headlights), 44 pedestrians, streetlights, and parked stealable cars everywhere.

## How to play

| Input | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse | Look |
| E | Enter / exit car (any parked or moving car can be stolen) |
| Click | Shoot |
| Shift | Sprint |
| Space | Brake |
| T | Start the next story job |
| F | Advance dialogue |
| P | Pause |
| M | Music on/off |

## Story mode — seven jobs

Each job opens with a named giver, a dialogue scene and radio chatter, and pays out on completion:

1. **Welcome to Costa Verde** — Lena Cruz — a package run across town — $400
2. **Hot Property** — Sal Bianchi — steal the teal Comet GT and deliver it to the warehouse — $800
3. **Marina Run** — Mateo Reyes — cargo at the far pier, harbour patrol heat — $1,100
4. **Payback Time** — Lena Cruz — take down 5 Vipers at the east warehouse — $1,500
5. **The Informant** — Officer Dana Ruiz — rescue an informant under a 3-star heat — $1,800
6. **The Big Score** — Sal Bianchi — a timed cross-city delivery with every badge in town awake — $2,500
7. **Sunset Showdown** — Mateo Reyes — a six-gun marina fight, then a 5-star escape to the pier — $4,000

## Side systems

- **Street Race (Sunset GP)** — drive through the glowing gate on the boulevard to start a 6-checkpoint race against the clock. Win $300, chase your saved best time, repeat forever.
- **Taxi Fares** — pedestrians wave and hail you. Stop beside them in any car, take them to the gold marker, and earn a fare that scales with distance.

## The law

- Wanted level 0–5 stars. Cruisers with flashing light bars pursue and ram; foot cops chase on foot; commit crimes near witnesses and the stars climb.
- From **3 stars the police helicopter arrives** (a second at 5): spinning rotors, flashing beacon, and a real spotlight with a visible searchlight cone and a pool of light that pins you to the street. It counts as eyes on you — break line of sight and stay unseen to let the stars decay.
- Get cornered and you are **BUSTED**: a fine, and you wake up outside Costa Verde General. Get shot down and the hospital bill stings instead.

## Tech

- Plain JavaScript modules under `game/src/` on a vendored three.js (r149) — no build step, no network, fully offline.
- Fixed-step simulation decoupled from the render loop; chase camera with speed-based FOV kick (62°→73°) and turn roll.
- Synthesized WebAudio only: engine pitch follows speed, gunshots, two-tone sirens, cash chimes, and a four-chord sunset pad loop. No audio files.
- `localStorage` save: cash, story progress, position, race best time, fares and races won.
- `playtest.mjs` drives the real game headlessly (CDP) through walking, stealing, driving, all seven jobs with exact payouts, combat both ways, police/helicopter response, the race and a taxi fare — 28 checks, all passing, with 0 console errors and 0 external requests.
- `shots.mjs` captures the four screenshots through the game's own staging hooks; the cover shot is gated geometrically on the helicopter's projected position in frame.

Original game. No real city, person or car is copied.

Entered on make.fun — see the bounty: https://make.fun/bounty/gta6-01
