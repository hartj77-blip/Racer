# Nitro Rush

A browser-based street racing game in the spirit of *Need for Speed*: rival racers, traffic, nitro boosts and police pursuits. Plain HTML/CSS/JavaScript with no build step, libraries or image assets. Every car, building and palm tree is drawn in code, and the sound is synthesised with the Web Audio API.

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
| Brake | `↓` / `S` | BRK |
| Steer | `←` `→` / `A` `D` | ◀ ▶ |
| Nitro | `Space` / `Shift` / `N` | NOS |
| Pause | `P` / `Esc` | ❚❚ |
| Mute | `M` | 🔊 |

## Features

- **3 cars** with different top speed, acceleration and handling.
- **2 tracks**: *Downtown Midnight* (neon city at night) and *Sunset Coast* (seaside highway with big hills).
- **3 AI rivals** that dodge traffic, use bursts of speed, and stay close to the pack.
- **Traffic** to weave through. Near misses, overtakes and carving through corners fill your **nitro**.
- **Heat & police pursuits**: crashes and reckless driving raise your heat. Once a cop is on you, outrun it or make it crash into traffic to escape. If you slow down near the cop, you're **BUSTED**.
- Lap timing, finishing order, and best times saved per track in your browser.

## Code layout

| File | Purpose |
| --- | --- |
| `js/util.js` | Math, projection and timing helpers |
| `js/sprites.js` | Draws all cars, scenery and backgrounds onto off-screen canvases |
| `js/audio.js` | Synthesised engine, nitro, siren and crash sounds |
| `js/track.js` | Track layouts, themes and scenery placement |
| `js/game.js` | Game loop, physics, AI, police, rendering, HUD and menus |

The road uses the classic "pseudo-3D" segment projection technique used by arcade racers of the 80s and 90s.
