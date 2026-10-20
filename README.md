# Dorifto

A small Three.js + Ammo.js driving playground built with TypeScript and Vite.
Ammo.js is installed through the `ammojs-typed` npm distribution; there are no
runtime CDN dependencies.

## Run

Use Node.js 20.19+ or 22.12+ (Node 24 recommended).

```sh
npm install
npm run dev
```

Vite opens the game in your browser. Use a desktop browser with WebGL2 and a
keyboard. Click the game if keyboard focus is in another window.

## Controls

| Key | Action |
| --- | --- |
| Left / right arrows | Steer |
| X | Accelerate (rear-wheel drive) |
| Z | Brake all four wheels |
| Space | Lock the rear wheels / initiate a slide |
| R or Reset car | Return to the starting position |

Build speed, turn, then tap the handbrake and counter-steer. The camera follows
the direction of travel smoothly rather than locking to the car's rotation,
so you can see the car's angle during slides. Losing focus releases all controls.
The red Z32 has black wheels and a low chase camera. Hold X from a stop for a
rear-wheel burnout, with wheelspin, tire smoke, and skid marks; rear grip builds
back up as speed increases. The tuned engine has a 240 km/h speed limiter.

## Build

```sh
npm run build
npm run preview
```

The build type-checks the app and writes a deployable static site to `dist/`.
Deploy the entire directory, including the car assets. Vite uses `models/` as
its public asset directory, preserving the glTF's relative binary and texture
URLs and copying the model license alongside them. Relative URLs support
deployment beneath a subdirectory.

`gindex.html` is an unused historical prototype, not part of the app.

## Model attribution

This work is based on
["Nissan Fairlady 300ZX (Z32) 1989"](https://sketchfab.com/3d-models/nissan-fairlady-300zx-z32-1989-8c04336a4ed84f6f836760db8256f9f0)
by [Lexyc16](https://sketchfab.com/Lexyc16), licensed under
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
**The supplied model is non-commercial.** See
[the original model license](models/nissan_fairlady_300zx_z32_1989/license.txt).
The demo rescales/recenters the model and separates its existing wheel geometry
for animation, with red paint and black rim materials.
