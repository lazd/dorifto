# Dorifto

A small Three.js + Ammo.js driving playground built with TypeScript and Vite.
Ammo.js is installed through the `ammojs-typed` npm distribution; there are no
runtime CDN dependencies.

## UI and game state

The toolbar's **Settings** button opens sound, drive mode, time of day, camera
style, mirror resolution, cabin head motion, map orientation, cones, and grass tufts controls in a modal dialog. Changes apply immediately. Close with **Close**,
Escape, or a backdrop click; driving inputs are disabled while it is open.
**Cones** can be shown everywhere (`?cones=all`), limited to corners
(`?cones=corners`, the default), or turned off (`?cones=off`). Hidden cones are also removed
from physics;
**Grass tufts** off (`?grass=off`) hides the decorative blades. Both help
performance on long imported tracks, which carry hundreds of cones.
**Settings > Camera > Mirror resolution** defaults to **Low** (512×256,
`?mirror-resolution=low`). **Medium** (1024×512, `?mirror-resolution=medium`)
gives nearby cabin mirrors more detail without using full-screen render targets.
**High** (`?mirror-resolution=high`) uses drawing-buffer-resolution reflections
for nearby mirrors. Distant mirrors stay at 512×256 in every mode.
Changes apply immediately and are retained in the URL. Older `?low-res-mirrors=on`
and `?low-res-mirrors=off` links still select Low and High respectively;
`mirror-resolution` takes precedence when both parameters are present.
Chase views place the Settings/Tuning/Help buttons at the bottom center and the
tachometer and minimap in the bottom corners, with course selection above the map
and the lap number and times below the map drawing. Expanding the course disclosure
grows the panel upward while the minimap stays anchored at the bottom. Cabin view
keeps the panel at the top, expands course selection below the minimap, and places
the lap number and times above the map drawing.
The course name is inside the minimap: at the bottom in cabin view and at the top
in chase views, without a separate picker caption. Click or tap the minimap (including its name)
to expand course selection, **Reverse course**, **Custom course**, and **Random course**.
The disclosure also works with Enter/Space; close it with another tap, Escape, or an
outside click. Driving inputs are disabled while it is open.
Choosing a course, reversing it, or starting random/custom course generation closes
the disclosure immediately. Opening the custom-course dialog also closes it.
The footer fades out five seconds after loading completes. Hovering over it or
focusing one of its links reveals it again; it stays visible during loading or errors.
Reset uses keyboard **R** or the controller's
Start/Menu/Options button rather than a toolbar button.
Settings, Tuning, Help, Choose course, and Custom course share one dialog lifecycle in `src/ui.ts`: open at the
top, close with the upper-right ×, Escape, or an outside click, and restore focus
to the opening button (the minimap for Custom course). Clicking or dragging controls
inside does not dismiss them.

The dependency-free observable store in `src/store.ts` exposes `getState()`,
`update(patch)`, and `subscribe(listener)` (returning an unsubscribe function).
Subscribers receive an initial snapshot, then one notification per changed patch.
Use immutable replacements for nested values rather than mutating snapshots.

`src/game-state.ts` defines raw telemetry, settings, and independent drive-mode
tuning profiles. Physics reads settings from this store; the frame loop publishes
one telemetry batch per rendered frame, not per physics substep. Three.js and
Ammo objects stay outside the store.

`src/ui.ts` owns HUD formatting, DOM bindings, menus, and status/error rendering;
`src/drift-tuning.ts` binds tuning inputs to profile updates. UI events update the
store or invoke explicit actions (reset/sound). Only changed display values are
written to the DOM. Input polling and audio report state rather than owning UI
elements.

The HUD uses a compact segmented circular 0–8,000 RPM tachometer with amber high-RPM
segments, a redline tied to the drivetrain, and a red limiter indication.
A seven-segment LED-style MPH speedometer sits in the center with a gear readout
below it. Driving-state messages (brakes held, sliding, burnout, etc.) are not shown.
A persistent minimap shows the current lap number on the left
(`--` before crossing the start line) and the current lap time on the right
with the best time directly underneath, including in cabin view. There is
no separate lap timing panel. It shows the complete course, a white start/finish line, and an amber arrow
for the car's live position and heading. It follows course changes automatically;
**Settings > Map orientation** selects **North up** (`?minimap=north-up`)
or **Follow heading** (default, `?minimap=heading-up`). Follow heading rotates the course
so the car always points up, fitting the entire course at any angle. The lap
times stay upright. The choice is retained in the URL across reloads and course changes.

## Runtime modules

- `src/main.ts`: app startup, module wiring, input events, fixed-step scheduling,
  telemetry publication, and rendering.
- `src/camera.ts`: cabin and chase cameras, controller look, course look-ahead,
  camera smoothing, and reset framing.
- `src/minimap.ts`: top-down course outline and live position/heading HUD.
- `src/lighting.ts`: sky, environment, time-of-day presets, and following shadows.
- `src/vehicle-physics.ts`: Ammo world, terrain collision bodies, suspension,
  tire forces, vehicle reset, interpolated vehicle poses, and physics plugin lifecycle.
- `src/physics-plugin.ts`: typed object-plugin context/hooks and reusable pose interpolation.
- `src/cone-physics.ts`: cone shapes/bodies, filtering, resets, interpolated poses,
  collision penalties, and impact sounds.
- `src/turn-sign-physics.ts`: knock-over turn-sign posts/boards, pose interpolation,
  resets, direction/visibility filtering, and impact-triggered metallic clanks.
- `src/tire-effects.ts`: skid marks, tire smoke/dust, and smoke depth capture.
- `src/drive-modes.ts`: Grip/Drift handling and camera presets.
- `src/drivetrain.ts`: fixed ratios, final drive, reverse, shared redline, Sport
  throttle mapping, shift decisions/safety, boost, engine torque, and clutch
  integration, separated into named methods.
- `src/vehicle-settings.ts`: shared vehicle mass, center of mass, inertia,
  suspension/anti-roll, damping, brake torque, differential, drag, and engine/wheel inertia.

Each runtime module owns its working state; the entry point coordinates updates
without sharing its local variables with the camera, physics, or effects.

### Physics object plugins

Register object physics explicitly after creating a world:

```ts
const conePhysics = physics.addPlugin((context) => createConePhysics(context, { course, audio }));
conePhysics.setEnabled(true, true);
```

`addPlugin` returns the plugin's own typed controls. New object types implement
`PhysicsPlugin` without changing vehicle physics. The context provides Ammo, the
world/dispatcher, the vehicle body, the current lap timer (including after a
direction change), `createRigidBody`, and `setBodyEnabled`. Managed bodies and
motion states are freed automatically, even when disabled. Plugins own their
collision shapes and any other Ammo allocations.
Only call `world.updateSingleAabb` for enabled bodies: removed bodies have no
broadphase proxy, and passing them to Bullet can corrupt world collision detection.

Optional hooks run in registration order: `beforeStep(dt)` before simulation,
`afterStep(dt)` after collision detection and before lap updates, `reset()` during
vehicle reset, `captureVisuals(snap)` after each fixed step or forced snap, and
`interpolate(alpha)` during rendering. `createPhysicsVisuals` provides reusable
pose snapshots/interpolation; synchronize meshes from bodies before capturing.
`dispose()` runs once after managed bodies are destroyed but before the world
is destroyed, so it should release plugin-owned shapes and temporary allocations.
Register plugins before the initial reset; registration does not reset the world.

Red/white inside kerbs follow sustained bend runs, using smoothed curvature,
a 140 m peak-radius threshold, and at least 12 degrees of heading change over
16 m or more. Short same-side holes are bridged; entry/exit transitions extend
up to 4 m only while the road is still bending, with runs trimmed where the
radius widens beyond 180 m. Wide sweepers, isolated spline
kinks, and straights stay unkerbed. Kerbs follow the inside of each bend,
including direction changes in chicanes; skidpads remain unkerbed.

Yellow turn signs have dynamic 8 kg post-and-board collision bodies. They start
asleep until struck, then tumble freely. Only hard car-to-sign contacts trigger
an impulse-scaled metallic crash with a brief low-end punch, ragged crunch, and faint,
quickly damped sheet-metal clang rather than sustained ringing;
terrain and other prop contacts are silent. Signs do not count as cone penalties.
Reset restores their placed poses.
Hidden signs and the inactive direction's signs leave physics entirely; showing
them again restores their starting positions. Shared visual/collision dimensions
live in `src/turn-sign.ts`.
**Settings > Turn signs** selects one of four densities, persisted in `?signs=`:

- `off`: no visible signs or sign collisions.
- `few`: three signs around each turn entry, at 6 m spacing.
- `several` (default): runs from the approach to 6 m before the apex, estimated
  at half the bend's accumulated heading change.
- `many`: runs from the approach through the entire bend to its exit.

Several/Many use at most 8 m between signs and at least three per turn.
Longer bends receive more signs, and reverse courses have their own runs.
Existing `?signs=on` links map to Several. Inactive density/direction groups
are hidden and removed from physics; switching modes restores the selected
signs to their placed poses.
All enabled sign modes also warn of blind hill crests, even when the upcoming
bend is too gentle for the normal turn detector. Crest warnings use the actual
terrain height and a 1.1 m driver-eye sightline from 12–30 m before the crest
to the road 24–60 m beyond it,
then check the next 45 m for a direction change of at least 8 degrees.
Up to three signs guide drivers on the approach to the crest; nearby existing
chevrons are reused instead of adding overlapping signs. Reverse directions are
evaluated independently. Flat roads and straight crests do not add warnings.

Edit `vehicleSettings` in `src/vehicle-settings.ts` and reload to change the
vehicle's physical setup. Defaults are 2,900 lb (1,315 kg), 50/50 static
front/rear weight distribution, and 2,400/2,600/700 kg m^2 pitch/yaw/roll inertia.
`frontWeightFraction` places the COM longitudinally between the model's front and
rear axle centers. `centerOfMass` sets the remaining chassis-local X/Y offset in
meters (+X right, +Y up); lowering Y lowers the COM.
Axle loads are calculated by the suspension, not by a separate weight-bias multiplier.
Collision vertices, suspension mounts, force lever arms, reset, and rendered chassis
positions all account for the COM offset. Inertia is specified independently; changing
mass or COM does not automatically recalculate the inertia tensor.
Grip/Drift tire and steering presets remain in `src/drive-modes.ts`.
Aerodynamic drag uses `0.5 * airDensityKgM3 * coefficient * frontalAreaM2 * speed²`,
with Cd 0.31, air density 1.225 kg/m³, and an estimated 2.0 m² frontal area.
The separate linear resistance and Bullet chassis damping remain unchanged.

## Run

Use Node.js 20.19+ or 22.12+ (Node 24 recommended).

```sh
npm install
npm run dev
```

Vite opens the game in your browser. Use a desktop browser with WebGL2 and a
keyboard or standard-mapped gamepad. Click the game if focus is in another window.

Run `npm test` for course-generation, geometry, camera, and physics-lifecycle regression
checks, including a multi-seed sweep. Run `npm run build` to type-check and build the app.

## Importing real tracks

`npm run import-track -- src/trackImports/*.json` converts recorded-lap track JSON
into course files in `src/tracks/`, which appear automatically in the course picker.
`featured_lap.points` (lat/lon) is projected to meters around the lap's centroid
(north up, east right in the map view) and resampled every 8 m; a gap between the
last fix and the start is bridged straight. `elevation.points` (`dist_frac`,
`altitude_m`) becomes a smoothed road-height profile along the route, and the
surrounding terrain is interpolated from nearby course heights. Tracks with no
elevation data get a flat road. Options: `--width <m>` (default 15),
`--spacing <m>` (default 8), and `--out-dir <dir>`.

## Controls

Click **Help** to open the keyboard/controller controls dialog; close it with
Close or Escape. Driving inputs are disabled while the dialog is open, but the
simulation continues. Settings remains in the main footer.

| Key                 | Action                                                             |
| ------------------- | ------------------------------------------------------------------ |
| Left / right arrows | Steer                                                              |
| Z                   | Accelerate (rear-wheel drive)                                      |
| X (hold)            | Brake, then reverse near a stop                                    |
| X + Z               | Brakestand (front brakes hold, rear tires spin)                    |
| Space               | Lock the rear wheels / initiate a slide                            |
| R                   | Reset the car, cones, smoke, and tire marks                        |
| C                   | Cycle corner-aware chase, classic chase, in-cabin (once per press) |
| D                   | Toggle Grip / Drift mode (once per press)                          |
| M                   | Toggle the bird's-eye map view of the whole course                 |
| W                   | Cycle Noon / Sunset / Night (once per press)                       |

Map view switches instantly in both directions, without an animated camera flight.

### Gamepad

Connect an Xbox-style controller and press a button while the game has focus.
The native Gamepad API requires localhost or HTTPS; browser/OS support determines
which controllers expose the `standard` mapping. Connection status appears below
the keyboard controls. The first connected standard-mapped controller is used.

| Controller input                     | Action                                                             |
| ------------------------------------ | ------------------------------------------------------------------ |
| R2 / RT                              | Analog accelerator                                                 |
| L2 / LT                              | Analog brake; reverse near a stop                                  |
| Left stick horizontal                | Analog steering                                                    |
| Left stick vertical (map view)       | Up: zoom in; down: zoom out                                        |
| Right stick                          | Camera orbit/height; pan up/down/left/right in map view            |
| R1 / RB or Xbox X (west face button) | Handbrake                                                          |
| R3 (right-stick click, hold)         | Look behind; release to return                                     |
| B / Circle (east face button)        | Toggle the bird's-eye map view (once per press)                    |
| RT + LT                              | Brakestand                                                         |
| Start / Menu / Options               | Reset (once per press)                                             |
| View / Select / Back                 | Cycle corner-aware chase, classic chase, in-cabin (once per press) |
| Y / Triangle (north face button)     | Toggle Grip / Drift mode (once per press)                          |
| D-pad Down                           | Cycle Noon / Sunset / Night (once per press)                       |
| D-pad Up                             | Stop recording and replay, or play saved laps before the start line |
| D-pad Left / Right                   | Skip to the previous / next lap during replay                      |

Both triggers together allow brakestand behavior only below 4 km/h. LT alone brakes forward
motion, then engages reverse only near a stop; release LT to leave reverse.
Reverse is limited to 35 km/h. Keyboard X also brakes into reverse near a stop;
release X to leave reverse, or press Z to switch to forward drive. Sticks use a
rescaled deadzone to avoid drift, and trigger values control torque/brake force
proportionally. Keyboard inputs remain available alongside the controller.
Disconnecting releases controller inputs immediately, and losing focus releases
all controls until the game regains focus.

In map view, push the left stick up to zoom in or down to zoom out, and use the
right stick to pan in any direction. Release either stick to stop; map framing
is retained when toggling the map and restored to the whole course on reset.

Build speed, turn, then tap the handbrake and counter-steer. The camera follows
the direction of travel smoothly rather than locking to the car's rotation,
so you can see the car's angle during slides. Losing focus releases all controls.
Rendered car, wheel, and cone transforms interpolate between fixed physics steps.
The chase camera smooths both its position and look target, with a gradual
transition to following travel direction at low speed. Reset snaps the camera
and interpolation history together.
Ammo handles suspension and collisions using a compact convex chassis envelope
and traffic cones with square rubber bases and flat-topped tapered bodies.
Cone rendering and compound collision shapes share dimensions in `src/course.ts`.
Cones use a low center of mass, clear their full base footprint on uneven ground,
and start asleep on load/reset; impacts wake them normally.
The chassis envelope
covers the roof, rear hatch and spoiler
for rollover contacts, while retaining the original underbody clearance.
Chassis pitch/yaw/roll inertia is 2400/2600/700 kg m^2 rather than that of a thin
underbody box. Each axle has a 12,000 N/m anti-roll bar, capped at 40% of the
lighter wheel's suspension load and active only with both wheels grounded.
Custom lateral tire forces use a suspension roll-center approximation halfway
between contact height and center-of-mass height; longitudinal forces retain
their full contact-point lever arm. This avoids excessive rollover torque during
sideways grip recovery without locking the car upright or adding yaw assistance.
The car remains free to roll in severe impacts or while airborne.
A simplified combined-slip tire model handles road forces at each wheel's
contact point. Tire forces depend on suspension
load, lateral slip angle, and wheelspin, sharing a finite friction budget. Wheel
inertia, rear drive torque, a limited-slip differential, and brake torque determine
traction continuously. Engine inertia, combustion torque, turbo spool, an automatic
clutch and six forward gears (plus reverse) now run in the same 1,440 Hz
integration as the wheels. Clutch torque loads the crankshaft and applies equal
geared drive torque to both rear wheels; tire resistance feeds back to engine RPM.
Lifting off produces engine braking through the engaged clutch and current gear.
The clutch slips for launch, releases near idle to avoid stalling, opens during
shifts, and disengages with the handbrake so locked rear wheels cannot stall the engine.
Engine braking uses the same tire traction budget as cornering and road braking.
There is no drift latch, target angle, yaw assist, or extra
forward force. Counter-steer and modulate Z to balance a slide; lift off to let
wheelspin settle and regain lateral grip. Steering can transfer the slide either way.
Both modes use manual steering with symmetric steering response. Drift uses
55-to-45-degree speed-dependent lock; Grip retains 37-to-17-degree lock.
There is no automatic counter-steering,
velocity-alignment remapping, or Drift-only tire-response memory.
Drift defaults to 483 hp with a 560 Nm / 360 kW engine envelope,
90% forward driveline efficiency, and a 1.25 tire friction coefficient.
Grip defaults to 342 hp with 400 Nm / 255 kW and a 1.35 friction coefficient.
Both use 45,000/48,000 N/rad front/rear cornering stiffness with no axle grip bias.
Wheel torque
depends on engine RPM, boost, gear ratio and clutch engagement, not a separate
wheel-speed power approximation.
Smoke and burnout marks require substantial slip, not the small tire slip
needed for ordinary acceleration.
Longitudinal and lateral slip demands saturate together, so spinning the rear
tires reduces their cornering grip. Both longitudinal and lateral pure-slip
demands saturate smoothly before the combined friction-circle limit. This
simplified tire model preserves cornering authority under wheelspin instead of
letting unbounded longitudinal demand crowd out virtually all lateral force.
It is a game-oriented approximation, not a calibrated real-tire model.
Throttle redirects the available rear traction toward
propulsion rather than applying a scripted shove. A rounded friction-circle
boundary shares the load-dependent force budget between both axes:
`scale = (1 + (combinedDemand / capacity)^8)^(-1/8)`.
There is no separate slip-triggered sliding-grip reduction or breakaway state.
The rounded boundary slightly softens force near full utilization; it does not
increase peak grip or guarantee a stable drift. Drift's
torque reserve can overcome rear sliding resistance even while the car is moving
backward, spinning the tires forward before the chassis changes direction.
Below 4 km/h (2.5 mph), throttle plus foot brake holds the front wheels while
releasing the rear brakes for a brakestand. At or above that speed, the foot brake
acts on all four wheels even with throttle overlap, including during drift
transitions. The threshold is `vehicleSettings.brakes.brakestandMaxSpeedKmh`;
it uses chassis speed, not driven-wheel speed, so stationary burnouts still work.
Hold Z and either steering arrow from a stop
for donuts; release throttle and unwind/counter-steer to recover traction.
The red Z32 has black wheels, no front license plate (the rear plate is retained),
and a low chase camera. Hold Z from a stop for a
rear-wheel burnout, with wheelspin, tire smoke, and skid marks. Grip returns as
wheel speed matches road speed. Reverse is limited to 35 km/h; forward speed is
limited by engine power, drag and the 7,200 RPM rev limiter, not a road-speed cap.
Burnout and drift marks are flat strips matching each rear tire's model width.
Tracks are translucent, rough, light-responsive ground geometry that blends with
the road instead of glowing as solid-color strips at night. Each track triangle
has a surface normal so headlights illuminate the rubber correctly on slopes.
Smoke uses sorted, instanced
billboard puffs that expand, rise, drift, and fade over their lifetime. A solid
scene depth pass softens intersections with the car and terrain, avoiding hard
particle cuts. Per-fragment car-local body/cabin exclusion boxes also suppress
smoke and dust inside the car, fading over 18 cm outside the boxes. These follow
the rendered chassis pose and approximate its volume rather than simulating
particle collisions against the model. The depth pass also prevents
tracks drawing over the smoke. This extra pass runs only while
puffs are alive and follows the drawing-buffer resolution on resize. Smoke is
excluded from side-mirror reflection passes, whose camera depth differs.
Silver headlight interiors contain softly glowing warm-white projectors with real,
shadow-casting spotlights at intensity 800 and a slightly warm `#ffe8c8` tint
illuminating the surface ahead. The two rear brake lenses and spoiler
brake strip glow red
while the foot brake is pressed (keyboard X or controller LT when braking)
or the initial spawn brake hold is active.
They stay unlit while coasting, engine braking, or using LT to reverse;
bumper reflectors remain unchanged. Front and rear turn-signal lenses are clear
instead of amber beneath their existing tinted covers.
After the car's center is off the pavement for more than three continuous
seconds, the front and rear turn signals flash amber together (0.4 seconds on,
0.4 seconds off). Returning to pavement or resetting switches the hazards off
and restarts the delay. Unlit signals retain their clear lenses and smoked covers.
Rear brake and reverse covers have 35% smoked tint when off and become
clear independently when their lamps are on; turn-signal covers stay tinted and
window glass is unchanged. This keeps the unlit lenses subdued without washing
their illuminated colors white.
When braking, short-range shadow-casting red spotlights illuminate the ground
and nearby objects behind all three brake lenses.
Brake and reverse spill uses soft, narrow rearward beams with reduced intensity
and a 4 m range to limit bumper highlights without dimming the illuminated lenses.
All four clear lenses in the center rear panel glow warm white and cast a subtle
white light only in reverse. Headlight inserts have a bright warm-white glow
behind their covers, independently of the reduced beam intensity that avoids
washing out the road. Running-light lenses are brighter for nighttime visibility,
while braking and hazards remain distinct from the steady running lights.
Headlights retain the original non-glowing covers with reduced tint opacity,
especially when lit, so their low-beam inserts remain bright; window tint is unchanged.
The inner rectangular high-beam sections remain tinted and unlit; only the
outer low-beam sections glow and project light.
The door mirrors and interior rear-view mirror use live planar reflections.
Their glass is aimed from the cabin camera's eye point, the way a driver would
set them. `DRIVER_MIRROR_OUTBOARD_DEG` and `PASSENGER_MIRROR_OUTBOARD_DEG` in
`src/car.ts` set how far each door mirror looks outboard, and
`REAR_VIEW_MIRROR_TILT_DEG` tilts the interior mirror's view up (positive) or
down. `setCabinEye()` in `src/camera.ts` moves the head and re-aims all
three mirrors. The interior mirror's whole housing swivels on its ball joint.
Dash warning lamps are off by default. The turn-signal arrows flash with the
hazards, BRAKE stays solid while the handbrake is held, and ABS stays lit in Drift
mode and switches off in Grip mode. `car.setDashLight()` can switch any lamp
(including the high-beam indicator) on or off.
Unlit warning lamps use blank dark gray masks that respond to cabin lighting
and blend into the surrounding panel without revealing the warning symbols.
At sunset and night, the gauge markings and odometer have a subdued green-white
backlight and the red needles glow. Gauge illumination switches off at noon.
A very dim warm light gently illuminates the cabin at night only.
Oil pressure reads about 2 at idle and rises toward 5 at redline, with a gradual,
frame-rate-independent response that lags behind both rising and falling RPM.
Window tint only renders when looking in from outside, so the cabin view is
clear, and the on-screen tachometer is hidden in cabin view in favor of the
car's working gauges. The cones are lightweight dynamic physics objects: hit them to send
them sliding and tumbling. Reset restores the car and all cones to their starting
positions and clears smoke and tire marks.

## Lap timing

Cross the checkered start/finish line in the driving direction to start lap 1.
The timing panel shows the current lap, last completed lap, and session best.
It also shows cones hit on the current and last completed lap. Actual car/cone
contacts count each cone once per lap; ground contacts and cone-to-cone collisions
do not count. Hits before timing starts are ignored. The count restarts each lap
and clears on reset; cone hits do not add time penalties.
Sixteen ordered gates around the course require a full forward lap, preventing
extra laps from reversing across the line or cutting directly back to the start.
Crossings must be within the paved corridor. Timing uses fixed physics time and
interpolates the crossing within a step; hidden-tab pauses do not add lap time.
Reset clears session lap times. Reloading or changing courses also starts a new session.

Runs are recorded automatically from launch. Stop recording to save and replay a
run, or use the play button before the start line to watch a saved run. During
replay, the lap controls show the current lap's completed time (or "Partial lap"
for an unfinished lap), with a trophy for the fastest lap in that run. The arrows
jump directly to the previous or next lap, including the first lap from the launch,
and reset cones and signs to their initial positions.

Every completed lap can set an all-time record, saved locally for that map layout
and direction, regardless of tuning or drive mode. Records survive resets, reloads,
and deletion of saved replay runs. **Ghost car → Record lap** races that record
from the first start-line crossing and restarts it each lap. A faster lap replaces
the record and becomes the ghost for subsequent laps. A cyan arrow on the minimap
tracks the active ghost's position and heading alongside the player's gold arrow.
**Fastest lap** and
**Previous lap** still use only the current run, starting on lap 2.

## Drive modes

Built-in tuning presets always come from code, not localStorage. Only user presets
are saved locally per browser.
The preset picker shows presets for the active Grip or Drift mode only.

Click **Tuning** in the bottom toolbar to open a dialog and adjust the selected mode live without
resetting the car. Sliders control steering angle (showing low/high-speed limits
in degrees), independent front/rear peak-grip multipliers, front/rear cornering
stiffness. Steering adjustment
scales both speed-dependent limits together. Higher stiffness builds force sooner
but does not raise peak traction. For a rear end that breaks loose too quickly,
try increasing rear peak grip first.
Both modes have independent settings, including an **Engine horsepower** slider
(100–1,000 crank hp). Horsepower scales the engine's power ceiling and torque curve
together, retaining each mode's engine characteristics. Defaults are approximately
342 hp for Grip and 483 hp for Drift; driveline losses still apply.
**Restore defaults** resets all eight sliders
for the active mode only. Car reset and mode changes retain tuning for the current
page; reloading restores defaults. Focused sliders use arrow keys for adjustment,
not steering. Keyboard and controller driving inputs are disabled while the dialog
is open; the simulation continues. Close it with **Close**, Escape, or a backdrop
click. Focus returns to the tuning button.

Both modes default to **60% controller steering expo**, blending linear and cubic
response after the stick deadzone. This softens fine adjustments near center
while preserving full lock at full stick; keyboard and camera axes retain
their previous input response. **Steering rate** defaults to 160 degrees/second
in Drift (about 2.79 rad/s) and 115 degrees/second in Grip (2 rad/s),
limiting how quickly the wheels move toward lock in addition to
existing smoothing. Both modes use the same rate limit for turn-in,
counter-steering, and unwind, with a 10/s smoothing response and a steering scale
of 1 (55 degrees low-speed / 45 degrees high-speed lock in Drift,
37.2 / 17.2 degrees in Grip).
Expo and steering rate remain adjustable live; the rate limit also applies to
keyboard steering. Steering always requests a wheel angle, never a target slip
angle. Automatic counter-steering, front-scrub remapping, faster return steering,
and Drift-only lateral relaxation have been removed.
Both modes now use the same instantaneous combined-slip tire model.
Full throttle and excessive steering can still spin or scrub the car.
Unwind/counter-steer and reduce throttle to recover rear lateral grip.

Throttle's forward "push" during a slide is ordinary longitudinal rear-tire force:
engine/clutch torque accelerates the wheels, tread overspeed creates drive demand,
and the combined-slip friction limit shares available traction with cornering.
The force acts along the car's rear wheel direction, not necessarily along its
current travel direction. It can drive through a counter-steered corner or shed
backward momentum, but there is no extra forward impulse or yaw assistance.
Raising rear grip also raises this propulsion budget while making wheelspin harder.

The Drive mode selector switches handling live without resetting the course.
Drift is the default, with more power and slightly less tire grip for power slides.
Neither mode has a front-biased grip preset, scripted drift gate, or yaw assistance.
Its loose chase camera follows travel direction to show slides. Grip's camera
stays more closely aligned with the car's heading and responds faster through
turns, while retaining smooth interpolation and the controller camera controls.
Grip recenters quickly after releasing the camera stick or look-behind, with
faster heading/position response; Drift retains its slower camera return.
Grip and Drift share the steering, drivetrain, combined-slip tire and
force-application implementation; differences are parameter presets, not separate
handling paths. Grip uses a 400 Nm / 255 kW engine envelope and a 1.35 base
friction coefficient, versus Drift's 560 Nm / 360 kW and 1.25 coefficient.
Neither mode has traction control:
wheelspin does not cut throttle or engine torque. Grip comes from tire parameters
and lower engine output; normal gear-shift, rev-limiter and speed-limit cuts
still apply. Both modes support keyboard, analog gamepad, and reverse.
The selected mode is carried in `?mode=grip` or `?mode=drift` and preserved when
switching courses. Tune values are defined in `src/drive-modes.ts`.

## Camera style

The live Camera style picker offers **Corner-aware chase** (default) and
**Classic chase** (the original camera), plus **In-cabin** at the right-hand
driver's seat. In-cabin follows the car's orientation, including hills, banking,
and slides, with a wider 75-degree field of view. A damped head response shifts
opposite the car's measured 3D acceleration, with subtle pitch/roll from the same
motion. This naturally responds to turns, gear changes, braking, elevation changes,
and impacts without event-specific effects. `cabinCameraMotion` in `src/camera.ts`
sets lateral, longitudinal, and vertical displacement in meters per g, the force
limit, spring response, and tilt per meter. Resets clear the motion history;
constant velocity settles back to the base seating position. Mirrors remain aimed
at that base position and do not re-aim with head movement.
**Settings > Cabin head motion** turns this effect off or on (on by default).
The choice persists in the URL as `?head-motion=off` or `?head-motion=on`.
Turning it off clears the offset immediately; re-enabling it starts with fresh
motion history, avoiding a jump from stale velocity. Right-stick look and R3
look-behind remain available. Camera style is independent of drive mode.
Corner-aware chase shifts gently outside the direction of motion's turn during
slides, raises/pulls back slightly, and looks ahead along the course toward the
exit. Off-course, low-speed, reverse, and manual camera input fade or suppress
the assistance. Transitions are smoothed; counter-steering does not flip the offset.
Classic chase keeps the original framing and motion. `?camera=corner` or
`?camera=classic` or `?camera=cabin` persists the choice through reloads and course changes.
Corner look-ahead projects continuously between route samples; filtered motion
turn rate and a slower look-target response prevent small physics changes from
jerking the view.

## Time of day

The Time of day picker switches lighting live without resetting the car or lap.
Noon has a blue sky and neutral daylight. Sunset uses a warm horizon, golden
directional light, and a low sun angle for long shadows. Night uses a dark blue
sky with soft cool ambient moonlight to reveal the car and nearby hills;
the car's headlights remain the main illumination on the road.
Procedural clouds are baked into the sky texture. Sunset alone uses
dense slate-blue cloud banks and fiery coral/orange undersides.
A low sun and localized golden glow brighten the horizon beneath a cooler
overhead sky, with warm direct light contrasted against cooler ambient light.
Noon retains the original soft white billows and thin wisps; night retains
the original muted blue clouds. Neither uses the dramatic sunset treatment.
Cloud patterns are deterministic, wrap seamlessly around the horizon, and
add no per-frame cloud rendering passes.
Sky, fog, ambient illumination, reflections, and exposure change together.
At sunset and night, reflective materials use the visible sky, so the car
reflects the actual clouds and sky colors. Noon retains the original neutral
studio reflections and paint settings. The studio map is generated once, and
Three.js caches the roughness-filtered sky maps until the time of day changes;
no extra per-frame scene captures are needed.
At Sunset and Night, headlights (beams and lens glow) switch on together with
the running lights. At Noon they switch off. The two body brake lenses use a
dark red base and low emission as running lights, with a pronounced jump to
full red emission when braking so brake application stays visible at Sunset/Night. They brighten
when braking; the spoiler strip remains brake-only. Front turn signals glow dim amber
and brighten during hazard flashes; rear signals illuminate only for hazards.
Side markers glow amber. Soft red
underglow uses downward-facing area-light strips tucked inward and below the
side skirts (between the wheel wells) and behind the front/rear bumpers to keep
the light on the ground rather than the body, without visible point sources.
Underglow is Night-only. Foot braking, hazards, and reverse lights
still work at any time of day, independently of the running-light state.
The selection is saved in `?time=noon`, `?time=sunset`, or `?time=night` and
preserved when switching courses or generating a random layout. Noon is the default.

## Courses

The minimap disclosure's **Reverse course** checkbox drives any named, random, or custom
layout in the opposite direction. Use `?reverse=1` in a course URL to open it
reversed; omit the parameter (or use `reverse=0`) for the normal direction.
`reverse=true`, `reverse=false`, and a bare `reverse` flag are also supported.
Changing direction switches route guidance and resets the car to the start facing
the new direction, without rebuilding the track or physics world. It resets lap
timing and effects while keeping the same layout, seed, custom generation
parameters, and settings. The preference
also carries over when selecting or generating another course.

Both directions use the same pavement, terrain, banking, and physical start/finish
location. Spawn/reset places the car 15 m before the line in either direction.
Reversed spawn places the car on the other approach to the line, facing
the new driving direction. Lap gates, turn arrows, and camera look-ahead follow
that direction; lap timing still requires a complete forward lap.

**Hillside Circuit** (`?course=hillside`) extends random seed **1077036780**
into a roughly 982 m lap, about twice the original 511 m. It keeps the original
eastern and northern sweepers and replaces the southwest section with a longer
loop and linked left-hand transitions. The tightest centerline radius remains
about 38 m, with the same 17.5 m road width, rolling terrain, and corner banking
as the original. Its fixed markers preserve this layout independently of later
changes to the random-course generator. Select it from the Course picker.

**Hilly Drift** (`?course=hilly-drift`) is a built-in 17.5 m-wide course with
rolling terrain. Its fixed layout preserves the original saved course's 27 markers
and is available in the Course picker without importing or saving it locally.

**Flat Skidpad** is a solid asphalt disk 500 m across, with a counter-clockwise
reference route of approximately 50 m centerline radius and 62.5 m marked width.
The center and the space outside the reference circle are paved and have full
asphalt traction; dirt begins at the disk's 250 m radius. Select it from the Course picker
or use `?course=skidpad`. The entire terrain, including runoff, is at zero
elevation with no banking or hills; physics and rendering use the same flat
heightfield. Cones and edge markings provide references for sustained circles,
donuts and live Drift tuning. Existing courses retain their hills and banking.

### Elevation and terrain

All layouts use a shared rolling heightfield: gentle climbs and descents on the
road, with dry golden hills rising beside the course. Corners bank toward the
inside (up to about 3.7 degrees); the road's cross-slope is derived from its turn,
not from the surrounding hillside, so hills do not introduce adverse camber.
Red-and-white painted curbs follow the inside of bends, within the paved shoulder.
They are flush painted runoff, not raised collision bumps.

The 1.5 m terrain grid drives both rendering and Ammo heightfield collisions.
Terrain keeps a gravel shoulder, blending to muted meadow-green ground cover
roughly 1.5–3.2 m beyond the pavement. Per-fragment noise breaks up the transition
edge and adds broad color patches alongside the fine grass texture. Vegetation
favors gentle slopes and fades to exposed earth between 30 and 50 degrees, using
the smoothed heightfield.
Grass includes subdued dry strands and broad color variation. Grass and soil use
separate procedural normal maps blended with the surface coverage. Sparse instanced
grass tufts add height along the verge, aligned to the terrain; they are decorative
and do not add collision bodies.
Tuft lighting is subdued under headlights and low-angle sunlight so the blades
blend into the verge rather than glowing gold at sunset.
This material blend does not change terrain geometry, collision, or tire grip.
Off-track height smoothing softens infield ridges without changing pavement or
the immediate shoulder. The hillside blend completes within the route lookup's
50 m range so its cutoff cannot leave a height seam.
Pavement and markings are split along those same triangles to avoid clipping.
Cones, spawn/reset orientation, tire forces, skid marks, smoke/dust and camera
clearance all follow the elevated surface. `src/terrain.ts` owns the height and
banking profile; existing marker definitions and random seeds still work.

On spawn/reset, the brakes hold the car until the first accelerator input
(Z or RT/R2). The HUD shows BRAKES HELD and brake lights stay on during the hold.
After releasing the hold, ordinary braking/reverse and lift-off behavior resume.

### Layouts

Use **Choose course** in the minimap's course menu to load Sweeper Circuit, Hillside Circuit, Hilly Drift,
Flat Skidpad, or an imported track. Switching courses replaces the track in place without
reloading the page or car assets. It resets the car, physics world, lap timing,
cones, smoke, and tire marks while retaining tuning, sound, camera, drive mode,
and time-of-day settings. Replaced track graphics and physics bodies are freed;
native heightfield buffers are pooled and reused because this Ammo build does not
export a working memory-free function.
Course controls are disabled during loading, and failures appear in the status
message without navigating away. The selection is encoded in `?course=sweeper` or
`?course=hilly-drift`, so links can open a particular course.

The driving corridor is textured asphalt with an 80 cm paved shoulder; everything
outside it is textured dirt/gravel. Both receive shadows and headlights.
Each wheel checks its physics contact against the course corridor: dirt/gravel has
65% of the selected mode's asphalt friction and cornering stiffness, reducing
acceleration, braking, and cornering traction. The paved shoulder retains full
grip, and returning to asphalt restores it immediately.
Rear tires detect the paved corridor, including the shoulder. Off pavement,
sliding/spinning tires emit tan dust at half the smoke rate with slightly lower
opacity and less upward drift, and leave muted brown dirt tracks rather than
dark rubber stripes. Dust opacity is capped at 14% per puff before edge/lifetime
fading. Smoke and dust receive per-puff colored lighting from daylight/moonlight,
headlight and brake/reverse beams, and downward underglow strips. Beam angle,
distance falloff, and light state control illumination; unlit nighttime puffs
remain faint. Lighting is calculated once per puff with the existing instanced
draw and depth pass, without additional rendering passes or shadow-map sampling.
Smoke lighting does not account for car/terrain occlusion.
Pavement smoke receives only a subtle daylight tint so it remains white at
sunset; dirt dust keeps the full daylight tint. Local car-light colors are retained.
Asphalt skid marks use near-black rubber and dirt tracks use dark earth brown,
both at 45% opacity.
Each tire is classified separately;
existing puffs and tracks keep their original appearance across surface changes.
The terrain meets the physics heightfield; the pavement sits only 8 mm above it,
with depth bias to prevent distant flicker without a visible tire-to-ground gap.
Cone bases sit 22 cm outside the outer edge of each white boundary line.
Bent left/right warning arrows appear about 12 m before hard-turn entry,
not periodically along the course; nearby warnings are merged.

**Random course** generates and loads a new closed circuit in place, retaining
your settings and tuning without reloading the game.
Its seed is saved in `?course=random&seed=12345` so the same link
recreates the same layout with the current generator. The generator smoothly warps,
stretches, rotates, and mirrors Hillside Circuit's lobed outline, targeting
975–1,075 m laps with a 17.5 m road width. It rejects layouts with centerline
turn radii below 38 m or median radii outside 60–110 m. Each direction must account
for at least 10% of the lap in bends tighter than 150 m radius, ensuring meaningful
left- and right-hand cornering rather than tiny inflections. Centerline elevation
relief must stay between 10 and 20 m, with grades no steeper than 12%, using the
same height profile as the terrain. Non-neighboring sections retain at least 8 m
between their marked road edges, with an extra sampling margin.
Existing random seed links now use this generator and therefore produce new layouts;
the named Hillside Circuit stays fixed.
These are geometric limits, not an autopilot: slow down for the tighter bends.

### Custom generation

After generating a random or custom course, open the course menu to enter a name
and choose **Save course**. The exact course layout is stored in localStorage,
added to and selected in the **Choose course** picker, including after reloading.
Saved layouts also retain their generator type and seed; custom courses include
the exact generation parameters used, independent of later slider changes.
The save controls disappear once the saved course is selected. Saved courses are
local to this browser; their `?course=saved-…` links require the same local data.
The picker opens a dialog with **Built-in courses**, **Racetracks** (Sonoma Raceway
and Thunderhill East), and **Saved courses** tabs. Each tab shows a responsive grid
of SVG course previews with names and lap lengths underneath (meters for courses
under 1 km, otherwise kilometers); the current course is highlighted.
Selecting a card loads the course and closes the dialog on success; loading errors
remain visible in the dialog. The Saved courses tab explains how to save a course
when empty. The reusable `Tabs` class in `src/tabs.ts` provides tab/panel ARIA
relationships, roving focus, Left/Right arrow navigation with wraparound, and
Home/End navigation. Opening the picker selects the current course's tab.
Escape, the close button, or a backdrop click dismisses the dialog and restores
focus to the minimap. Driving inputs are disabled while it is open.
Use the generation buttons in the course menu to create random or custom courses.
The course menu's delete button removes the selected saved course and switches to
the default course. Deletion is disabled for built-in and unsaved generated courses.

**Custom course** opens a dialog with a **1–5 km course length** slider (100 m
steps), five independent preference sliders from **0 to 1** (0.01 steps),
numeric readouts, and **Restore defaults**. Adjusting sliders does
not change the current course. **Generate course** builds a new seeded layout in
place, resets the driving session, and closes the dialog on success. Generation
controls are disabled while building; a failure stays visible in the dialog so
you can adjust the mix or retry. Escape, the upper-right close button, or a
backdrop click closes the dialog without generating. Driving inputs are disabled
while it is open, as with the other dialogs.

The weights do not need to sum to one: 0 avoids a feature, while 1 strongly
favors it. Intermediate corner weights vary the chance of including each
feature as well as its shape. A closed circuit still needs connecting bends, and
connecting sections can remain straight even with a zero straightaway preference.
Length is a distance target, not a weight: the generator fits the feature mix
within 5% of that target without shrinking corners below the safety limit.
Short layouts use somewhat smaller sweepers and kinks to leave room for straights.

| Preference       | Default | Effect                                                                                                                                         |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Course length    | 2.0 km  | Targets a lap between 1 and 5 km.                                                                                                              |
| Elevation change | 0.50    | Scales climbs, descents, and banking. Zero makes the entire terrain flat; one targets up to 20 m centerline relief, capped at 12% grade.       |
| Straightaways    | 0.50    | Lengthens the main straight and the straights between corner complexes, with fewer complexes per lap.                                          |
| Tight corners    | 0.35    | Adds 90° corners and 155–185° hairpins, typically around 25–40 m radius. This also controls hairpins; there is no separate hairpin preference. |
| Sweeping corners | 0.70    | Adds broad, flowing bends around 95–140 m radius, plus more high-speed kinks.                                                                  |
| Chicanes         | 0.35    | Adds tight left-right chicanes and longer two- or three-bend esses.                                                                            |

Custom layouts are assembled like real road courses: a main straight followed by
a shuffled sequence of corner complexes (hairpins, 90° corners, medium corners,
double apexes, sweepers, kinks, esses, and chicanes) joined by straights, with
roughly one complex every 220–450 m. Every lap has at least four real corners,
and at least 70° of cornering turns against the lap direction, so the outline
folds back on itself rather than forming an oval or convex blob. Corner order is
shuffled until the running heading stays within one lap plus a fold, avoiding
spirals. Straight lengths are then solved so the loop closes exactly at the
target distance. The shared closed B-spline smooths the tangent-connected
straights and arcs.
Layouts retain the 17.5 m road width and
clearance checks, but allow centerline radii down to 22 m for tighter features.
Length (in metres), all five preferences, and the seed are stored in the URL, for example
`?course=custom&seed=123&length=2000&elevation=0.5&straightaways=0.5&tightCorners=0.35&sweepingCorners=0.7&chicanes=0.35`.
Old links without a length use 2 km; obsolete `hairpins` parameters are ignored
and removed when a course URL is written. Existing custom seeds now use the new layouts.
Reloading that link recreates the layout and slider values. Preferences remain
available when reopening the dialog or switching courses within the same page.
**Random course** still uses the existing Hillside-style generator; switching to
a random or named course removes custom weights from its URL.

Course data lives in `src/courses.ts`: add a `CourseDefinition` with a unique ID,
name, corridor width, and ordered `[x, z]` centerline markers in driving order.
Cone spacing is optional (defaults to 6 m). A closed cubic B-spline fits smoothly
inside the marker path rather than passing through every marker, rounding tight
corners so the offset road edges do not fold over; no hand-drawn edges are needed.
Space markers generously and avoid abrupt reversals or crossings.
The shared curve automatically generates the asphalt ribbon, cones, 16 cm white
boundary lines, turn-warning arrows, and a combined checkered start/finish line 5 m
after the curve's start. Spawn/reset position is 15 m before the line along the
curve, with heading taken from its tangent. There are no per-course cone, arrow, line, or spawn
coordinates to maintain. `generateCourse` uses the same definition and renderer.

## Sound

Audio is synthesized in real time with Web Audio and an AudioWorklet; no recorded
sound assets or external audio services are used. Audio attempts to start immediately
on initialization. If browser autoplay policy blocks it, a click or keypress retries
the unlock; controller-only players may need to click the page once. The Sound
dropdown in Settings defaults to On and selects On/Off explicitly. Off is saved as
`?sound=off`, so muted sound survives reloads and course changes.
Audio is not muted on window blur, hidden tabs, or while dialogs are open.
Browser autoplay and background-tab suspension policies still apply.

The four-stroke V6 voice combines combustion pulses, exhaust harmonics, and noise.
It reads RPM, combustion load, boost, gear shifts and limiter cuts directly from
the physical drivetrain; there is no independent audio gearbox or synthetic
slip-to-RPM target. Six fixed forward ratios, a 3.692 final drive and 3.369
reverse ratio do not depend on horsepower or wheel radius. Forward ratios are
specified directly in `src/drivetrain.ts`:

| Gear | Ratio |
| ---- | ----- |
| 1    | 2.97  |
| 2    | 2.10  |
| 3    | 1.46  |
| 4    | 1.00  |
| 5    | 0.80  |
| 6    | 0.63  |

The transmission always uses Sport behavior in both Grip and Drift; there is no
transmission selector. The TCU uses actual engine RPM: upshifts at 7,200 RPM and
downshifts below 4,000 RPM to keep the engine in its useful power range.
The shared `redlineRpm` constant in `src/drivetrain.ts` controls the upshift
threshold and rev limiter.
Sport applies the square root of pedal input (50% pedal gives about 71% throttle).
This mapping affects combustion and boost, not just the audio.
After a pedal reduction, upshifts are held until the driver increases the pedal
again. Downshifts remain available while lifting or coasting for engine braking
and corner exit; each shift still respects the cooldown and over-rev protection.
The previous road-RPM shift schedule and launch timer are removed.
Shifts take 0.22 seconds with a 0.65-second cooldown. An upshift requires enough
road speed for at least 4,000 rolling RPM in the next gear,
preventing stationary wheelspin from cycling through all six gears
and avoiding an immediate downshift after wheelspin settles. Downshifts are blocked when driven
wheel speed would produce 6,000 RPM or more in the lower gear.
The handbrake suspends shifting and opens the clutch; reverse bypasses the TCU.
There is no traction-control torque cut or target-speed-based gearing.
Clutch capacity scales with peak engine torque so increasing horsepower does not
overwhelm a fixed 560 Nm clutch. The clutch still slips during launch and opens
during shifts; wheelspin can still raise engine RPM above road-speed RPM.
Fuel is cut at 7,200 RPM and restored below 6,850 RPM, changing both delivered
torque and sound. Burnouts and powered slides can bounce off this physical limiter
when engine torque overcomes sliding-tire resistance; merely sliding sideways
does not force maximum RPM. Grip recovery loads the engine through the clutch,
bringing wheel speed and revs back toward rolling speed.
The engine mixes deep two-bank/cycle components, saturated exhaust pulses and
low-frequency body rather than emphasizing a thin high-frequency buzz.
The driving HUD shows the same gear, RPM and limiter state used by the sound.
Turbo boost spools with throttle/RPM, with a breathy 3.2-4.6 kHz whistle made
from narrow-band airflow noise and a lightly wavering tone rather than a dominant
lower-pitched whine. It vents a short noise burst when lifting off or shifting
under boost. Asphalt tire squeal follows actual contacting-wheel
lateral/longitudinal slip (including burnouts and handbrake lockup), not steering
input; dirt does not squeal. Tire squeal uses four independent stereo voices, each driven by its wheel's
contact load and lateral/longitudinal sliding. Irregular friction excitation
feeds three broad, non-harmonic resonances per tire, producing overlapping
screeches rather than a single sine-wave whistle. Sliding speed and load vary
the tuning and texture; unloaded, airborne and dirt tires do not squeal.
A restrained pair of wavering, non-harmonic tones per wheel emerges as slip
builds, so heavy sliding adds a recognizable squeal above the gentle scrub layer.
This is a perceptual approximation, not a calibrated tire-acoustics simulation.
The approach is informed by [Kröger and Moldenhauer, ISMA 2010:
Influences on the vibration frequencies of tyre tread blocks](https://past.isma-isaac.be/downloads/isma2010/papers/isma2010_0480.pdf).
Its quiet mix, progressive slip-volume curve, and 140 ms onset ease it in gently;
an 80 ms release lets it fade promptly as traction returns.
Car/cone contact impulses produce debounced hollow thuds, with harder hits louder.
Reset clears the physical drivetrain, wheel state and audio transients together.
All voices share a conservative master level and dynamics compressor. Procedural
voices approximate a turbocharged car rather than reproduce a recorded Z32.

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

## Model attribution

This work is based on
["nissan_300zx"](https://sketchfab.com/3d-models/nissan-300zx-88be494c18134b1ca820f776d5144164)
by [MattDoesBlender](https://sketchfab.com/MattDoesBlender), licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
**The supplied model is non-commercial, and modified versions must use the same
license.** See [the original model license](models/nissan_300zx/license.txt).
The demo rescales/recenters the model, separates its wheels, brake hubs, steering
wheel, gauge needles and interior mirror housing for animation, removes the sun
visors and front plate, and repaints it with red paint, black rims and a
near-black interior.
