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
Ammo handles suspension and collisions; a simplified combined-slip tire model
handles road forces at each wheel's contact point. Tire forces depend on suspension
load, lateral slip angle, and wheelspin, sharing a finite friction budget. Wheel
inertia, rear drive torque, a limited-slip differential, and brake torque determine
traction continuously. There is no drift latch, target angle, yaw assist, or extra
forward force. Counter-steer and modulate X to balance a slide; lift off to let
wheelspin settle and regain lateral grip. Steering can transfer the slide either way.
Front steering lock ranges from 37 degrees at low speed to 29 degrees at high
speed, retaining enough range to counter-steer into a slide. Direction changes
respond faster than initial turn-in. Unwind the steering as rotation stops to
avoid snapping into an opposite slide.
Power tuning uses up to 2200 Nm of drive torque per rear wheel, limited to
110 kW per wheel (220 kW total), with a 1.25 tire friction coefficient. Torque
falls as wheel speed rises so launch wheelspin settles as the car accelerates.
Smoke and burnout marks require substantial slip, not the small tire slip
needed for ordinary acceleration.
Longitudinal and lateral slip demands saturate together, so spinning the rear
tires reduces their cornering grip. Hold X and either steering arrow from a stop
for donuts; release throttle and unwind/counter-steer to recover traction.
The red Z32 has black wheels and a low chase camera. Hold X from a stop for a
rear-wheel burnout, with wheelspin, tire smoke, and skid marks. Grip returns as
wheel speed matches road speed. The engine has a 240 km/h speed limiter.
Burnout and drift marks are flat strips matching each rear tire's model width.
Tracks are opaque, depth-writing ground geometry. Smoke uses sorted, instanced
billboard puffs that expand, rise, drift, and fade over their lifetime. A solid
scene depth pass softens intersections with the car and terrain, avoiding hard
particle cuts and tracks drawing over the smoke. This extra pass runs only while
puffs are alive and follows the drawing-buffer resolution on resize. Smoke is
excluded from side-mirror reflection passes, whose camera depth differs.
Silver headlight interiors contain warm-white projectors with real, shadow-casting
spotlights illuminating the surface ahead. Side-view mirror glass uses live planar
reflections. The cones are lightweight dynamic physics objects: hit them to send
them sliding and tumbling. Reset only resets the car; reload to restore the cones.

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
