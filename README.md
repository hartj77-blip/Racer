# Nitro Rush

A 3D street racing game for the browser in the spirit of *Need for Speed*: a career mode, rival racers, drifting, traffic, nitro boosts and police pursuits. It's built with [three.js](https://threejs.org) (vendored in `js/vendor`, MIT licensed) and plain HTML/CSS/JavaScript, with no build step and no model or image files. Every car, building and palm tree is generated in code, and the sound is synthesised with the Web Audio API.

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
| Brake / reverse / drift | `↓` / `S` | BRK |
| Steer | `←` `→` / `A` `D` | ◀ ▶ |
| Nitro | `Space` / `Shift` / `N` | NOS |
| Change camera (chase / far / bumper) | `C` | 🎥 |
| Reset car onto the track | `R` | ⟲ |
| Pause | `P` / `Esc` | ❚❚ |
| Mute | `M` | 🔊 |

**Drift:** tap brake while steering at speed. The rear steps out and the car slides; hold the turn to keep it going and counter-steer to catch it.
**Perfect start:** hold gas during the countdown and keep the needle in the green zone when the lights go.

## Features

- **Real 3D** with a chase camera that swings wide in drifts and widens its field of view at speed. Cars have body roll, brake dive, spinning wheels, steering front wheels and nitro flames.
- **Handling:** the car has momentum and grip. You brake for hairpins, and slides come from the car actually losing traction.
- **Career mode:** 9 events across circuit races, drift challenges and police escapes. You earn cash, unlock events, buy cars, and upgrade engine, turbo, tires and nitrous. Progress is saved in your browser.
- **Quick Race:** any car on any track, with 1, 3 or 5 laps and police on or off.
- **3 tracks**, each about 3 km:
  - *Downtown Midnight*: neon city blocks, a long tunnel and an elevated section
  - *Sunset Coast*: coastal highway with palms, guardrails and big elevation changes
  - *Harbor Rain*: stormy docks with rain, lightning, containers, cranes and an underpass
- **AI rivals** with name tags. They take racing lines, brake for corners, pass traffic and use bursts of speed.
- **Traffic** to weave through. Near misses, overtakes and drifts fill your **nitro**.
- **Heat and police pursuits:** cops ram you and try to box you in. Make them crash into traffic, outrun them, or lose them in a tunnel. Slow down near one and you're **BUSTED**.
- **Auto-recovery:** if the car is wedged and going nowhere for a few seconds, or driving the wrong way for a long time, it's put back on the road.
- **HUD:** analogue tachometer, minimap, lap timing, standings and a wrong-way warning.

## Code layout

| File | Purpose |
| --- | --- |
| `js/vendor/three.min.js` | three.js r160 (MIT) |
| `js/util.js` | Math and timing helpers |
| `js/audio.js` | Synthesised engine, nitro, skid, siren, rain and crash sounds |
| `js/career.js` | Career events, cash, car prices and upgrades |
| `js/cars3d.js` | Low-poly 3D car models built from extruded profiles |
| `js/tracks3d.js` | Spline track layouts, road and terrain geometry, tunnels, scenery, sky and lighting |
| `js/game3d.js` | Game loop, car physics, drifting, AI, police, camera, effects, HUD and menus |
