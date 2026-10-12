# Nitro Rush

A browser-based street racing game in the spirit of *Need for Speed*: a career mode, rival racers, drifting, traffic, nitro boosts and police pursuits. Plain HTML/CSS/JavaScript with no build step, libraries or image assets. Every car, building and palm tree is drawn in code, and the sound is synthesised with the Web Audio API.

## Play

**▶ [Play Nitro Rush](https://hartj77-blip.github.io/Racer/)**

To run it locally, open `index.html` in a browser, or serve the folder with any static server:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

The link above is served by GitHub Pages. To turn Pages on: **Settings → Pages → Deploy from a branch**, then pick `main` and `/ (root)`.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Accelerate | `↑` / `W` | GAS |
| Brake / drift | `↓` / `S` | BRK |
| Steer | `←` `→` / `A` `D` | ◀ ▶ |
| Nitro | `Space` / `Shift` / `N` | NOS |
| Pause | `P` / `Esc` | ❚❚ |
| Mute | `M` | 🔊 |

**Drift:** tap brake while steering at speed, then hold the turn. Counter-steer to straighten out.
**Perfect start:** hold gas during the countdown and keep the needle in the green zone when the lights go.

## Features

- **Career mode:** 9 events across circuit races, drift challenges and police escapes. You earn cash, unlock events, buy cars, and upgrade engine, turbo, tires and nitrous. Progress is saved in your browser.
- **Quick Race:** any car on any track, with 1, 3 or 5 laps and police on or off.
- **3 cars** with different top speed, acceleration and handling.
- **3 tracks:**
  - *Downtown Midnight*: neon city with a tunnel
  - *Sunset Coast*: seaside highway with guardrails and big hills
  - *Harbor Rain*: stormy docks with rain, lightning, an underpass and concrete barriers
- **Drifting** with chained multipliers. Drifts, near misses and overtakes fill your **nitro**.
- **AI rivals** with name tags. They dodge traffic, use bursts of speed and stay close to the pack.
- **Heat and police pursuits:** crashes and reckless driving bring the cops. Outrun them or make them crash into traffic. Slow down near one and you're **BUSTED**.
- **Visuals:**
  - Cars turn and show their sides through corners.
  - Headlights, taillight glow and street-lamp light pools at night.
  - Tunnels, barriers and exhaust backfire on upshifts.
  - Tyre smoke, rain spray and speed lines.
- **HUD:** analogue tachometer, minimap, lap timing and race standings.

## Code layout

| File | Purpose |
| --- | --- |
| `js/util.js` | Math, projection and timing helpers |
| `js/sprites.js` | Draws all cars (including turned views), scenery and backgrounds onto off-screen canvases |
| `js/audio.js` | Synthesised engine, nitro, skid, siren, rain and crash sounds |
| `js/track.js` | Track layouts, themes, tunnels, scenery placement and minimap outlines |
| `js/career.js` | Career events, cash, car prices and upgrades |
| `js/game.js` | Game loop, physics, drifting, AI, police, rendering, HUD and menus |

The road uses the classic "pseudo-3D" segment projection technique used by arcade racers of the 80s and 90s.
