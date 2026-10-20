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
keyboard or standard-mapped gamepad. Click the game if focus is in another window.

## Controls

| Key | Action |
| --- | --- |
| Left / right arrows | Steer |
| Z | Accelerate (rear-wheel drive) |
| X | Brake all four wheels |
| X + Z | Brakestand (front brakes hold, rear tires spin) |
| Space | Lock the rear wheels / initiate a slide |
| R or Reset | Reset the car, cones, smoke, and tire marks |

### Gamepad

Connect an Xbox-style controller and press a button while the game has focus.
The native Gamepad API requires localhost or HTTPS; browser/OS support determines
which controllers expose the `standard` mapping. Connection status appears below
the keyboard controls. The first connected standard-mapped controller is used.

| Controller input | Action |
| --- | --- |
| R2 / RT | Analog accelerator |
| L2 / LT | Analog brake; reverse near a stop |
| Left stick horizontal | Analog steering |
| Right stick | Small camera orbit/height adjustment; release to recenter |
| R1 / RB or Xbox X (west face button) | Handbrake |
| R3 (right-stick click, hold) | Look behind; release to return |
| RT + LT | Brakestand |

Both triggers together retain brakestand behavior. LT alone brakes forward
motion, then engages reverse only near a stop; release LT to leave reverse.
Reverse is limited to 35 km/h. Keyboard X remains brake-only. Sticks use a
rescaled deadzone to avoid drift, and trigger values control torque/brake force
proportionally. Keyboard inputs remain available alongside the controller.
Disconnecting releases controller inputs immediately, and losing focus releases
all controls until the game regains focus.

Build speed, turn, then tap the handbrake and counter-steer. The camera follows
the direction of travel smoothly rather than locking to the car's rotation,
so you can see the car's angle during slides. Losing focus releases all controls.
Rendered car, wheel, and cone transforms interpolate between fixed physics steps.
The chase camera smooths both its position and look target, with a gradual
transition to following travel direction at low speed. Reset snaps the camera
and interpolation history together.
Ammo handles suspension and collisions; a simplified combined-slip tire model
handles road forces at each wheel's contact point. Tire forces depend on suspension
load, lateral slip angle, and wheelspin, sharing a finite friction budget. Wheel
inertia, rear drive torque, a limited-slip differential, and brake torque determine
traction continuously. There is no drift latch, target angle, yaw assist, or extra
forward force. Counter-steer and modulate Z to balance a slide; lift off to let
wheelspin settle and regain lateral grip. Steering can transfer the slide either way.
Front steering lock ranges from 37 degrees at low speed to 29 degrees at high
speed, retaining enough range to counter-steer into a slide. Direction changes
respond faster than initial turn-in. Unwind the steering as rotation stops to
avoid snapping into an opposite slide.
Drift tuning uses up to 2000 Nm of drive torque per rear wheel, limited to
110 kW per wheel (220 kW total), with a 1.4 tire friction coefficient. Torque
falls as wheel speed rises so launch wheelspin settles as the car accelerates.
Smoke and burnout marks require substantial slip, not the small tire slip
needed for ordinary acceleration.
Longitudinal and lateral slip demands saturate together, so spinning the rear
tires reduces their cornering grip. Hold Z and either steering arrow from a stop
for donuts; release throttle and unwind/counter-steer to recover traction.
The red Z32 has black wheels and a low chase camera. Hold Z from a stop for a
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
them sliding and tumbling. Reset restores the car and all cones to their starting
positions and clears smoke and tire marks.
The autocross loop starts straight ahead through a checkered line, then follows
an opening slalom, sweeping bend, hairpin, and return section. Paired cones mark
a twelve-meter-wide corridor, with painted arrows indicating direction. Cones
have glossy white reflective-style bands that catch the headlights (a visual
approximation, not a retroreflective optical simulation).

## Drive modes

The Drive mode selector switches handling live without resetting the course.
Drift is the default, with full steering lock and wheelspin for power slides.
Increased tire grip and rear cornering stiffness, plus slightly reduced launch
torque, make it less eager to slide during ordinary cornering.
Its loose chase camera follows travel direction to show slides. Grip's camera
stays more closely aligned with the car's heading and responds faster through
turns, while retaining smooth interpolation and the controller camera controls.
Grip uses 26-to-11-degree steering lock, 1900 Nm / 115 kW per driven wheel,
higher tire friction and rear cornering stiffness, and slip-based traction
control to preserve cornering grip under throttle. Traction control reduces
engine torque, not steering or yaw; it is bypassed for intentional brakestands
and handbrake use. Both modes support keyboard, analog gamepad, and reverse.
The selected mode is carried in `?mode=grip` or `?mode=drift` and preserved when
switching courses. Tune values are defined in `src/drive-modes.ts`.

## Courses

Use the Course selector to load Autocross Playground (12 m wide) or Sweeper
Circuit (14 m wide). Switching courses restarts the demo for a clean physics world,
cones, and tire marks. The selection is encoded in `?course=autocross` or
`?course=sweeper`, so links can open a particular course.

The driving corridor is textured asphalt with an 80 cm paved shoulder; everything
outside it is textured dirt/gravel. Both receive shadows and headlights.
Each wheel checks its physics contact against the pavement mesh: dirt/gravel has
65% of the selected mode's asphalt friction and cornering stiffness, reducing
acceleration, braking, and cornering traction. The paved shoulder retains full
grip, and returning to asphalt restores it immediately.
Rear tires detect the actual pavement mesh, including the shoulder. Off pavement,
sliding/spinning tires emit tan dust at half the smoke rate with slightly lower
opacity and less upward drift, and leave muted brown dirt tracks rather than
dark rubber stripes. Asphalt skid marks are softened charcoal gray.
Each tire is classified separately;
existing puffs and tracks keep their original appearance across surface changes.
The gravel meets the physics ground plane; the pavement sits only 8 mm above it,
with depth bias to prevent distant flicker without a visible tire-to-ground gap.
Cone bases sit 22 cm outside the outer edge of each white boundary line.
Bent left/right warning arrows appear about 12 m before hard-turn entry,
not periodically along the course; nearby warnings are merged.

**Random course** generates a new closed circuit and restarts the demo, retaining
your drive mode. Its seed is saved in `?course=random&seed=12345` so the same link
recreates the same layout. Smooth radial variations create fast sections, sweeping
bends, and tighter sections. Candidates are checked for a minimum 22 m centerline
turn radius and clearance between non-neighboring sections; the road is 14 m wide.
These are geometric limits, not an autopilot: slow down for the tighter bends.

Course data lives in `src/courses.ts`: add a `CourseDefinition` with a unique ID,
name, corridor width, and ordered `[x, z]` centerline markers in driving order.
Cone spacing is optional (defaults to 6 m). A closed cubic B-spline fits smoothly
inside the marker path rather than passing through every marker, rounding tight
corners so the offset road edges do not fold over; no hand-drawn edges are needed.
Space markers generously and avoid abrupt reversals or crossings.
The shared curve automatically generates the asphalt ribbon, cones, 16 cm white
boundary lines, turn-warning arrows, and a combined checkered start/finish line 5 m
after the curve's start. Spawn/reset position and heading come from the curve's
start near the first marker and its tangent. There are no per-course cone, arrow, line, or spawn
coordinates to maintain. `generateCourse` uses the same definition and renderer.

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
