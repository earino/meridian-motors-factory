# Meridian Motors — 3D Factory Line

A real-time 3D visualization of a car factory, rendered in the browser with Three.js.
Watch raw materials roll in on the conveyor and drive off as finished cars:
**raw steel → frame & weld → paint shop → assembly → quality check → delivery**.

## Live demo

Hosted on GitHub Pages — open the repository's **Pages** URL from any browser.

## What you see

- A dusk-lit factory hall with a scrolling conveyor belt, robotic arms, welding sparks,
  paint mist, a quality-check scanner sweep and animated smokestacks.
- Cars spawn as bare rolling frames on the left, gain their hull at the weld station,
  change color in the paint shop, pop wheels/cabin into place at assembly, get scanned,
  then drive off down the exit road with headlights on — and increment the production counter.
- Live stats (cars produced / cars on line / speed), a stage legend that lights up as cars pass each station,
  delivery toasts, pause/resume, 0.5×–2× line speed, and an orbit camera with auto-drift.

## Controls

| Input | Action |
| --- | --- |
| Drag | Orbit the camera |
| Scroll / pinch | Zoom in & out |
| Double-click (or reset button) | Return to the default view |
| Pause button | Freeze / resume the line |
| Speed buttons | 0.5× · 1× · 2× line speed |

## Run locally

Any static file server works, e.g.:

```sh
python3 -m http.server 8080
# then open http://localhost:8080/index.html
```

No build step — plain HTML + ES modules with Three.js vendored locally in `vendor/`.

## Project layout

```
index.html            page shell, UI overlay, import map
css/style.css         dark glassmorphism industrial UI
js/main.js            scene bootstrap, camera rig, game loop, UI wiring
js/world.js           static environment: sky, building, conveyor, stations, robots, city
js/car.js             staged car model (frame → hull → paint → assembly → lights)
js/effects.js         spark / mist particle pools + smoke sprites
js/layout.js          shared layout constants & surface-height math
vendor/three.module.min.js   Three.js r160 (vendored, no CDN dependency)
vendor/RoundedBoxGeometry.js rounded-box geometry helper from three examples
```
