# Dorifto

A small Three.js + Ammo.js driving playground built with TypeScript and Vite.
Ammo.js is installed through the `ammojs-typed` npm distribution and runs in a
dedicated Web Worker; there are no runtime CDN dependencies.

With no query parameters, the game starts on Hillside Circuit at sunset with two bots,
the Grip / Default (`grip-default`) preset, and the cabin camera.

## Bot drivers

Race bots are configured with **Bots** in the race standings panel or through URL parameters:

```text
?course=hillside&bots=2&bot-skill=0.8&bot-aggression=0.4
```

`bots` accepts 0-8 (default 2); use `?bots=0` to drive alone. Skill and aggression accept 0-1. Bots use real,
colliding vehicles with independent **Grip / Fast (`grip-fast`)** setups, start ahead of the player and
drive automatically. They derive a line and speed profile from any selected
course, including reversed courses. A local traffic planner checks road-constrained
passing paths against predicted vehicle footprints, holds a passing side until
clear, and slows/stops when blocked. Close-range recovery checks behind before
backing up for steering room. This is basic passing, not competitive defending.
Color-matched minimap arrows show their positions and
headings. Bots have distance-attenuated stereo engine/tire audio, real-slip smoke
and tire marks, glowing running lamps and telemetry-driven brake lamps.
Their low-beam headlights and lens glow follow the player's headlight setting.
Bots have no real lights: their beams are an unlit additive glow on the road
ahead, and at night their underglow is a paint-colored additive glow beneath
the car, using the same glow as the player's (the observed car in bots-only mode
recolors its own to its paint color). Both are draped over the terrain each frame and fade with fog and while a car is not upright. Lit shaders compile per count
of each light type, so adding, removing, or hiding bots never recompiles shaders. Their exterior includes the model's
black underbody so overturned bots do not expose an empty cabin.
Opponent audio shares the player's mute control and audio context.
Bots are hidden and removed from physics during replays;
reset restores them. Their bounded course-specific speed learning survives resets
within the session, but course changes/reloads start fresh. Player tuning does not
change the bots' Grip / Fast setup.

One `bot-skill` value applies to all bots. A comma-separated list assigns one skill
per bot. For a faster rear bot and slower front bot in spectator mode:

```text
?course=hillside&bots-only=1&bots=2&bot-skill=1,0.2
```

Bots are named after their paint colors: Cyan, Yellow, Purple and Green; red is reserved for the player.

For a **bots-only spectator session**, add `bots-only=1`:

```text
?course=hillside&bots-only=1&bots=1&bot-skill=1
```

No player-controlled vehicle is created. The first bot uses the primary car model,
telemetry, sound, tire effects and lap HUD, and the FPV drone camera
follows it initially unless `camera` is specified. **V** cycles cameras normally;
Click a bot in the leaderboard to spectate it; the observed bot is highlighted.
**Tab** cycles the observed bot when the driving view has focus, including in cabin view, and saves its zero-based
index in `observed-bot` (for example, `observed-bot=1` follows the second bot).
The selection survives refreshes and course changes; an invalid or out-of-range
index falls back to the first bot. The observed bot receives
the full-detail model/interior, gauges, mirrors and matching telemetry; the other
bots use lightweight exteriors. Minimap markers retain each bot's color and
identity when switching views. `bots-only=1` defaults to one bot; explicitly
requesting zero is an error. Player pedals/steering do not control the observed
bot; reset and course/direction changes still work.

Bot control and all vehicle dynamics already run in the physics worker. Rendering,
audio updates and visual effects remain on the main thread. No added presentation
buffer or artificial input delay is enabled. Chase cameras inherit the car's
translation on the same rendered sample and smooth their relative offset,
rather than independently damping world-space translation.

Search driver tuning across tracks with `npm run train:bot`; see
[training race bots](docs/training-bots.md) for the optimizer and applying results.

Run repeatable single-track evaluation without rendering:

```sh
npm run evaluate:bot -- --runs=3
npm run evaluate:bot -- --runs=3 --experience=.bot-training/race.json --output=.bot-training/continued.json
npm run evaluate:bot -- --frozen --experience=.bot-training/continued.json --output=.bot-training/evaluation.json
```

Each run attempts three timed laps on **Hillside Circuit**, excluding the approach
to the start line. The bot itself adjusts bounded per-section speed margins from
clean passages, excessive slip and road clearance. JSON output contains all lap
times, validity, failure reasons, control/stability metrics, configuration and
resumable experience. Frozen evaluation does not update experience. Experience
must match the course, direction, vehicle setup, skill, aggression and controller
version. Headless runs use the actual model geometry and terrain, but omit cones
and traffic. Failed/incomplete or off-road runs return a nonzero exit status after
saving the report. Outputs default to the ignored `.bot-training/` folder.

Controller version 2 removes the blanket 15% starting pace reduction, increases
speed/acceleration targets and adds slip/yaw stabilization and traction-aware
throttle reduction. Older controller experience files must be retrained.

Other options: `--course=<id>`, `--reverse`, `--skill=0.8`, `--aggression=0.4`,
`--output=<path>`. Start a new experience file when changing these parameters.
Drift driving and Sweeper Loop drift training are the next phase, not yet enabled.
See [the implementation plan](docs/bot-drivers.md) for architecture and milestones.

## UI and game state

The toolbar's **Settings** button opens a modal with **Controls**, **Audio**, **Video**,
**Camera**, **HUD & aids**, and **Track** categories. Drive mode and tuning profiles live in
**Tuning**, opened by the toolbar button showing the current mode and profile.
The **Bots** action lives in the race standings panel, including when driving alone.
Settings and tuning
changes apply immediately; bot roster edits apply with **Save & restart race**.
Close with **Done**, **Close**,
Escape, or a backdrop click; driving inputs are disabled while it is open.
Keyboard and standard Xbox-compatible controller bindings can be changed in **Controls**,
including map-view axes and inversion. Select a binding, press the desired key or controller
button, or press Escape to cancel. Conflicting bindings are rejected; **Restore defaults**
resets the bindings. Bindings are saved locally in this browser.
The keyboard and controller diagrams illuminate physical inputs while the Controls
panel is open. Settings keeps the same viewport-constrained size across categories;
long panels scroll internally rather than resizing the dialog.

The course library groups **Built-in courses**, **Racetracks**, **Roads**, and **Saved courses** in
one list. Selecting an entry previews it without changing the race; **Load course** applies
the selection and resets the race. The selected course's details include local records
by direction and access to saved-run replays. An unsaved random or custom course appears
in a **Current layout** group, marked Unsaved, while it is active. Saved courses have a
**⋯** menu for renaming and confirmed deletion.

Dialog presentation uses shared design tokens and native HTML primitives in
[`src/dialogs.css`](src/dialogs.css): button variants (`button-quiet`, `button-secondary`,
`button-primary`), accessible tabs, radio-based segmented controls, checkbox switches,
master/detail selection lists, action disclosures, and dot-prefixed `dialog-help` footer
text. Reuse these classes rather than introducing dialog-specific versions of the same
component. The shared `button button-pill` style is used by the lap recorder,
with the same `--control-height` as other buttons. Settings and Tuning share the
regular `toolbar-button` style.
Use `button-compact` for content-height buttons with tighter horizontal padding,
and `button-translucent` for a semi-transparent surface on any button.
HUD and track examples are labeled illustrations, ready to be replaced with
cropped in-game screenshots.

**Cones** can be shown everywhere (`?cones=all`), limited to corners
(`?cones=corners`, the default), or turned off (`?cones=off`). Hidden cones are also removed
from physics;
**Grass tufts** off (`?grass=off`) hides the decorative blades. Both help
performance on long imported tracks, which carry hundreds of cones.
**Settings > Video > Mirror resolution** defaults to **Low** (512×256,
`?mirror-resolution=low`). **Medium** (1024×512, `?mirror-resolution=medium`)
gives nearby cabin mirrors more detail without using full-screen render targets.
**High** (`?mirror-resolution=high`) uses drawing-buffer-resolution reflections
for nearby mirrors. Distant cabin mirrors stay at 512×256.
Mirrors render only in cabin view; both chase views skip mirror reflections entirely.
Reflection cameras exclude the car's low beams, high beams, fog beams, and interior
point lights. Cabin ambient, gauge glow, and stereo glow illuminate only cabin view;
chase views skip those lights. Lamp lenses and displays still show their selected state.
Cabin fill follows the time of day, with cool daylight at noon, warmer fill at sunset,
and subdued illumination at night, without changing exterior exposure. Headlights
also switch on a localized warm glow around the instrument cluster and steering column.
Inactive warning lamps use unlit black masks so the cabin lights cannot reveal them.
The steering-wheel badge has a clear-coated dark silver backing, polished black-chrome
Z and rim, and a clear cover.
The windshield's tint strip is visible only from outside, leaving the cabin view unobstructed.
Choose **Off** (`?mirror-resolution=off`) to disable mirrors in cabin view as well.
When reflections are disabled, the mirror glass remains a shiny silver surface
using the scene's environment lighting, with no live reflection render passes.
Changes apply immediately and are retained in the URL. Older `?low-res-mirrors=on`
and `?low-res-mirrors=off` links still select Low and High respectively;
`mirror-resolution` takes precedence when both parameters are present.
Chase views place the Settings/Tuning buttons at the bottom center and the
tachometer and minimap in the bottom corners, with the lap number and times below
the map drawing. Cabin view keeps the panel at the top and places
the lap number and times above the map drawing.
The course name is inside the minimap: at the bottom in cabin view and at the top
in chase views, without a separate picker caption. Click or tap the minimap (including its name)
to open the course library directly. It also opens with Enter/Space.
Choose **Forward / Reverse** alongside the course preview, or **Create course**
to generate a named random/custom layout. Nothing changes the race until loading.
The footer fades out five seconds after loading completes. Hovering over it or
focusing one of its links reveals it again; it stays visible during loading or errors.
On first load, the page stays hidden until styles apply. A progress bar then explains
each startup stage: downloading the car (tracked per file), starting physics, loading
the record lap, compiling light shaders, and preparing mirrors and the ghost car.
The car downloads while the sky and course are built. The header, course HUD,
and tachometer stay hidden until the first gameplay frame.
Reset uses keyboard **R** or the controller's
Start/Menu/Options button rather than a toolbar button.
Settings, Tuning, and Choose course share one dialog lifecycle in `src/ui.ts`: open at the
top, close with the upper-right ×, Escape, or an outside click, and restore focus
to the opening button (the minimap for Choose course). Clicking or dragging controls
inside does not dismiss them.
Dialog visibility is managed by DOM events, not the
per-frame game store. These events also clear and disable driving inputs while UI
is open. Custom-course slider preferences are local to the UI, initialized from
the URL when applicable, and passed to course generation on demand.

The dependency-free observable store in `src/store.ts` exposes `getState()`,
`update(patch)`, and `subscribe(listener, keys?)` (returning an unsubscribe function).
Subscribers receive an initial snapshot, then one notification per changed patch.
When keys are supplied, only changes to those fields notify the subscriber.
Use immutable replacements for nested values rather than mutating snapshots.

`src/configuration-state.ts` owns settings and independent drive-mode tuning
profiles, including stereo selection, mute, camera, course direction, cones,
grass, signs, and ghost preferences. Physics and rendering read this store, but
only settings changes write to it. Configuration subscribers watch their relevant
fields; telemetry never notifies them.

`src/game-state.ts` owns runtime telemetry, controller status, focus, audio
health, loading/errors, and lap-recorder state. The frame loop publishes one
telemetry batch per rendered frame, not per physics substep. Status, sound, and
lap-recorder UI subscribe only to their own fields, so they do not run on
telemetry updates. Three.js and Ammo objects stay outside both stores.

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
with the current run's best time labeled **RECORD** directly underneath, including in cabin view.
Setting a new run record flashes the label and time gold for two seconds; reduced-motion
mode uses a steady gold highlight instead. Replay does not trigger record celebrations. There is
no separate lap timing panel. It shows the complete course, a white start/finish line, and an amber arrow
for the car's live position and heading. It follows course changes automatically;
**Settings > HUD & aids > Minimap orientation** selects **North up** (`?minimap=north-up`)
or **Follow heading** (default, `?minimap=heading-up`). Follow heading rotates the course
so the car always points up, fitting the entire course at any angle. The lap
times stay upright. The choice is retained in the URL across reloads and course changes.
When all four tires, including their tread edges, are beyond the outer edges of the white lines (farther than
half the track width plus half the 16 cm stripe width from the centerline), the current lap time turns red and pulses (solid red with
reduced motion enabled). Asphalt shoulders do not count as inside the track. The warning
stays latched after rejoining; reset clears it, or crossing start/finish discards the invalid
attempt and starts fresh without changing completed times or the best lap. Airborne tires
use their projected wheel positions rather than stale ground-contact points. The check includes
the loaded model's tire widths and front-wheel steering, so a tread edge touching the line
keeps the lap valid even when the tire's center is outside.
**Settings > HUD & aids > Racing line training gate display** (`?lap-gates=on`, or `rainbow` to color
gates by lap position) shows visual targets
3 times the loaded car's width, spaced roughly 22.5 m along a geometry-based,
minimum-curvature racing-line approximation. This is not a vehicle-specific optimal line.
Bounded geometric relaxation minimizes squared second differences around the closed route,
leaving room for the full gate width. There are no forced corner-entry or apex targets.
The box-constrained quadratic is solved using accelerated projected gradient (FISTA),
with a projected-gradient convergence check rather than a fixed number of smoothing passes.
Unlike averaging offsets initialized to zero, this produces an actual change from the centerline.
It is a lightweight geometric approximation, not the 3D minimum-lap-time optimal-control
solver in [TUM's planner](https://github.com/TUMRT/online_3D_racing_line_planning), which also
models vehicle acceleration limits, speed, banking, and elevation.
Targets are 36 cm-thick tubular semicircular arches, visible from overhead, emerging from the terrain with a bright core and soft additive
glow, without lights, shadows, or bloom render passes. The first target is red and the rest cyan.
The 3x car-width measurement is the diameter of the arch's luminous centerline.
Missing training gates never affects lap validity
or counting; they update with the course and driving direction.

## Runtime modules

- `src/main.ts`: app startup, module wiring, input events,
  telemetry publication, and rendering.
- `src/physics-client.ts`: worker lifecycle, bounded advance requests, snapshot
  interpolation, collision audio delivery, and simulation-tick recording delivery.
- `src/physics-worker.ts`: worker entry point, Ammo initialization, and error reporting.
- `src/physics-simulation.ts`: worker-local vehicle/prop poses, 120 Hz scheduling,
  lap timing, replay collisions, and sparse transferable snapshots.
- `src/physics-messages.ts`: typed worker commands, snapshots, and scene-data serialization.
- `src/terrain-query.ts`: shared, render-independent heightfield and pavement queries.
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

### Physics worker

Each course session owns a dedicated module worker. Ammo, the drivetrain, custom
tire/suspension forces, cone/sign bodies, collision detection, and lap timing run
there. Course loading sends plain car collision/wheel data, prop placements, and
the terrain heightfield/surface segments; no meshes, materials, DOM, audio nodes,
or Ammo pointers cross the boundary. The worker uses lightweight Three.js pose
objects and math, not a renderer.

Rendering requests elapsed time with the latest controls, tuning, lights, and prop
visibility. Only one advance batch is in flight at a time; pending time is capped
at 50 ms, matching the render loop's existing long-frame limit. The worker retains
the 1/120 s fixed step and fractional remainder. It does not run ahead when the
tab stops rendering. Visibility changes clear pending time and snap interpolation.

Snapshots contain the last two fixed-step poses in recycled transferable buffers.
Unchanged props are omitted after their final resting pose has been delivered.
The main thread interpolates poses without waiting for the worker, then updates
cameras, lights, audio, UI, and tire effects. Interpolation runs on a simulation-time
clock: each request runs the worker one frame ahead of render time, so a timely
reply covers the next frame and poses interpolate between delivered ticks. Only
when a reply is late (e.g. CPU contention) do poses extrapolate along the newest
tick, up to 50 ms. Message arrival timing never moves the drawn time. Impact sounds arrive as impulse
events. Recording samples are encoded at 30 Hz in the worker, with per-step lap
crossings, so rendering/message frequency cannot skip samples or shift lap times.
Replay poses drive the same worker-owned world, preserving prop collisions.

Resets, replay starts/seeks, and direction changes invalidate older replies.
Course replacement terminates the previous worker, releasing its entire Ammo
heap, including allocations the upstream build cannot explicitly free. Worker
startup/runtime/message errors are shown through the normal fatal-error UI;
there is no silent main-thread fallback. SharedArrayBuffer and cross-origin
isolation headers are not required.

### Physics object plugins

Register object physics explicitly inside `src/physics-simulation.ts`: after creating a world:

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
`interpolate(alpha)` for in-process interpolation. `createPhysicsVisuals` provides
reusable pose snapshots/interpolation; synchronize pose objects from bodies before
capturing. In the app, the worker captures these poses and `physics-client.ts`
interpolates the actual meshes. Plugins emit audio events instead of playing
sounds in the worker.
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
**Settings > Track > Turn sign density** selects one of four densities, persisted in `?signs=`:

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

Code is linted with [oxlint](https://oxc.rs/docs/guide/usage/linter) and formatted with
[oxfmt](https://oxc.rs/docs/guide/usage/formatter) (`.oxlintrc.json`, `.oxfmtrc.json`).
`npm install` points Git at `.githooks/`, whose pre-commit hook runs both on staged
files through lint-staged. Run `npm run lint`, `npm run format`, or `npm run format:check`
manually. The oxc VS Code extension reads the same config for format-on-save.

## Importing real tracks

`npm run import-track -- src/trackImports/*.json` converts recorded-lap track JSON
into course files in `src/tracks/`, which appear automatically in the course picker.
Imported point-to-point routes (`closed: false`) appear under **Roads** with a
**Road** badge; closed circuits remain under **Racetracks**. On roads, the start and
finish lines sit 45 m in from each end, so the full starting grid lines up on
pavement behind the start line and cars have room to brake past the finish. The
same two lines serve both driving directions.
`npm run import-road -- <slug> "<road name>" "<location query>"` first
looks up the freeform location with OpenStreetMap's geocoding API, then queries Overpass for
the named road within the returned bounding box. It writes a compatible source
file to `road-imports/`. Only highway ways are included, and ways tagged
`access=private` are excluded. Use the road name as labeled in
OpenStreetMap; common road suffixes such as `Road`/`Rd` are matched
interchangeably. Quote each multiword argument so the script receives the slug,
road name, and location query as separate arguments. The location query is stored
as `venue_name`; `location` contains the road's centroid coordinates. For example:

```sh
npm run import-road -- newtown-road "Newtown Road" "Placerville, CA, US"
npm run import-track -- road-imports/newtown-road.json
```

Generated road source files are ignored by Git.
The importer also generates a standalone `road-imports/<slug>.html`
preview using the shared course-preview SVG renderer. Open it directly in a
browser to inspect the north-up road geometry and its start/finish markers;
the preview does not connect the endpoints. Click the road once for the start
and again for the finish to highlight a segment and copy an import command.
Selection snaps to original source coordinates; selecting in reverse order
imports the segment in the opposite direction. Edit the slug, display name,
venue name, and configuration name in the preview, then use **Copy import command**.
If clipboard access is blocked, the command is selected for manual copying.

```sh
npm run import-track -- road-imports/newtown-road.json --start 20 --finish 100 \
  --slug newtown-lower --name "Newtown Lower" \
  --venue-name "Newtown Road" --config-name "Lower section"
```

`--start` and `--finish` are zero-based, inclusive source point indices and must
be supplied together. Elevation and surrounding terrain are fetched only at track
import, after selecting the segment, so unselected roadway is not sampled.
Source JSON elevation profiles are ignored; track import derives fresh heights
from USGS data after selecting the segment.
Without naming overrides, a segment gets a unique `<source-slug>-<start>-<finish>`
slug and a `Segment <start>–<finish>` configuration name. Naming/selection options
apply to a single input file, so separate segments cannot accidentally overwrite
one another in a batch.
Road imports preserve an open, ordered route with distinct start and finish
points using `closed: false`; the endpoints do not need to connect. The converter,
game terrain, and maps preserve the open route. The car spawns at its first point,
timing begins when the spawn brake is released, and crossing the finish ends a
single run. The timer remains on lap 1 and freezes until reset; reverse direction
swaps the endpoints. Existing courses without `closed: false` remain closed circuits.
Successful geocoding and Overpass responses are cached in `road-imports/cache/`,
keyed by the location query or the road query including its bounding box.
Repeated imports reuse these responses without contacting either service.
Delete the corresponding cache files to refresh the data. Import logs show each
step, cache hits and misses, request durations, and the generated output path.
The road importer saves geometry and the HTML preview without fetching elevation.
Use the preview to choose a section, then run its track-import command to download
USGS 3DEP terrain for that section and sample road elevation locally from it.
Importing without a selection downloads terrain covering the entire road.
Raster-backed imports make no individual elevation point requests.
For imports without a raster, an in-place terminal progress line reports completed samples, percentage, and elapsed
time after each batch of up to four requests (redirected output prints only the final
summary). Failed elevation requests stop the track import; the source
geometry and HTML preview remain available for retrying.
`display_name` becomes the course `name` (falling back to `slug` if absent);
`venue_name` and `config_name` are stored as optional `venueName` and `configName`.
The optional `location` object retains `city`, `state`, `country`, `lat`, and `lon`.
`blurb` is not imported.
`featured_lap.points` (lat/lon) is projected to meters around the lap's centroid
(north up, east right in the map view) and resampled every 8 m; a gap between the
last fix and the start is bridged straight for closed circuits only.
`elevation.points` (`dist_frac`,
`altitude_m`) becomes a smoothed road-height profile along the route, and the
surrounding terrain is interpolated from nearby course heights. The last and first
100 m of elevation are joined with a height- and grade-matched curve before
smoothing, preventing recording endpoint mismatches from forming a start/finish
bump (the transition is shortened for very small loops). Open roads preserve both
endpoints and use an endpoint-preserving cubic B-spline for the playable centerline.
Their elevation uses a Gaussian filter with a 15 m standard deviation and
monotone cubic interpolation for continuous grades, without wrapping or a seam
bridge. Raw GPS and cached USGS samples are unchanged. Re-import existing road
configurations to apply the elevation filter. Raster-backed imports sample absolute heights locally
at 10 m intervals using the same raster sampler as the game's terrain,
then apply the road-height smoothing described above. Imports without a raster
fetch terrain heights from the
[USGS 3DEP Elevation Point Query Service](https://apps.nationalmap.gov/epqs/)
at 10 m intervals along the selected route, including the closing segment only
for closed circuits. Supplied elevation profiles are ignored so the road and
surrounding terrain share the same vertical datum. Failed or missing USGS results
stop the import instead of silently producing a flat road.
Fetched profiles are cached locally in `src/trackImports/elevation-cache/`, keyed
by the sampled GPS coordinates, so unchanged laps can be re-imported offline.
Remove a track's cache file to refresh its elevation. Generated courses identify
fetched data with `elevationSource: "USGS 3DEP"`. These are terrain estimates, not
surveyed road heights; coverage and source resolution vary by location.
Options: `--width <m>` (default 8 for open roads, 15 for closed circuits),
`--spacing <m>` (default 8), and `--out-dir <dir>`.
Width is the distance between the white edge lines. `--shoulder-width <m>` sets
the paved shoulder beyond each line (default 1.6 m per side; accepts zero).
For a road with pavement ending at the white lines, use `--shoulder-width 0`.
Open roads default to double-yellow center lines; closed circuits default to none.
Use `--double-yellow` to draw two continuous yellow center lines, following the
road's curves, elevation, and banking. This is visual only, not a barrier;
use `--no-double-yellow` to keep the center unmarked. The HTML segment selector
defaults to 8 m width and double yellow, and includes width, shoulder, and divider controls in its copied
import command. For example, a narrower road can use `--width 7.5`.

After selecting a segment, the track importer automatically downloads surrounding
USGS 3DEP terrain for open roads, then derives centerline elevation
from that raster regardless of any supplied elevation profile.
Closed tracks can opt in with `--terrain`. The default raster spacing is 5 m, with
a 250 m margin around the selected GPS bounds; configure these with
`--terrain-resolution <m>` (minimum 1) and `--terrain-margin <m>` (minimum 210).
Source resolution varies by location: requesting a finer grid does not guarantee
additional surveyed detail. Oversized requests fail with guidance to select a
shorter segment or use coarser spacing.

The importer also downloads a high-resolution detail raster (default 1.5 m,
matching the game's terrain grid) but keeps only pixels within
`--terrain-detail-width <m>` (default 40 m) of the road centerline, stored as row
runs. This captures real cut banks and roadside dropoffs from 1 m lidar where
available, adding roughly 1–2 MB per course instead of a full high-resolution
raster. Detail fades into the coarse raster over the last quarter of that width.
Configure spacing with `--terrain-detail-resolution <m>` (minimum 1), or disable
detail with `--terrain-detail-width 0`. Both rasters are lightly anti-aliased
(a two-pass binomial blur) and sampled with Catmull-Rom interpolation, removing
pixel stair-steps that USGS resampling produces along sharp road cuts.

Validated GeoTIFFs are cached in `road-imports/cache/terrain-<hash>.tif`, keyed by
the service request, including geographic bounds, resolution, and margin.
Identical imports reuse the cached raster; other segments or resolutions request
their own raster. Delete the corresponding file to refresh it. Terminal output
reports downloads and cache hits. Missing data or service failures stop the import.
The generated course embeds the geographic raster and elevation datum, so the game
does not fetch terrain or depend on the local cache. Terrain follows real hillsides
and dropoffs outside the smoothed pavement and shoulders. Older courses without a
raster retain their existing procedural surroundings; re-import to add real terrain.
Raster-backed terrain protects a one-grid-diagonal support collar (about 2.1 m)
outside the paved shoulder so hillside vertices cannot lift triangles crossing
the pavement edge. This does not widen the asphalt. Terrain blends after that collar and
returns fully to raster heights within `--terrain-transition <m>` (default 3 m;
must be positive); the preview includes this setting in its copied import command.
Where the raster rises or falls more than that beside the road, the transition widens
to match the height difference, up to 8 m, so walls and drops start with a rounded foot
instead of a crease. The cap keeps blends from switchback legs from meeting.
Roadside raster heights are not grid-smoothed; each vertex samples
the anti-aliased raster blend at its own position.
Within 20 m of the pavement, raster terrain splits each 1.5 m grid cell along the
diagonal that best follows the hillside's contours instead of one fixed diagonal,
which otherwise turns roadside walls into sawtooth facets. From the collar's outer edge
through the transition, grid vertices are snapped onto lines parallel to the road one
grid step apart, so the wall's crest, face, and foot follow the road instead of
stair-stepping along grid rows; cells between snapped vertices split along those lines.
Where snap lines converge inside tight bends, cells that would fold are left unsnapped.
Pavement and paint are clipped against the same triangles. Bullet's heightfield
only supports a fixed diagonal at grid positions, so flipped and snapped cells are
sunk below the heightfield and covered by a triangle-mesh collider with the rendered
triangulation.
Rendering and physics use the same surface. Non-raster terrain keeps its existing
wider transition and smoothing. Existing courses retain 1.6 m shoulders unless
re-imported with `--shoulder-width`.

Imported-track terrain banking is blended over 50 m around the closed loop, preventing small
GPS stitching S-bends from creating abrupt cross-slope bumps at start/finish.

## Controls

Choose **Settings > Controls** to open the keyboard/controller
bindings; close Settings with Done, Close or Escape. Driving inputs are disabled
while the dialog is open, but the simulation continues. The following tables show
the default bindings; remapped bindings are reflected in the in-app diagrams.

| Key                 | Action                                                            |
| ------------------- | ----------------------------------------------------------------- |
| Left / right arrows | Steer                                                             |
| Z                   | Accelerate (rear-wheel drive)                                     |
| X (hold)            | Brake, then reverse near a stop                                   |
| X + Z               | Brakestand (front brakes hold, rear tires spin)                   |
| Space               | Lock the rear wheels / initiate a slide                           |
| F                   | Flash high beams; hold 1 second to toggle high beams on/off       |
| H                   | Tap to toggle headlights; hold 1 second to toggle fog lights      |
| R                   | Reset the car, cones, smoke, and tire marks                       |
| V                   | Cycle FPV drone, classic chase, in-cabin (once per press)         |
| D                   | Toggle Grip / Drift mode (once per press)                         |
| M                   | Toggle the bird's-eye map view of the whole course                |
| U                   | Hide tach, map, leaderboard, then all HUD; press again to restore |
| W                   | Cycle Noon / Sunset / Night (once per press)                      |
| S                   | Turn on the stereo / next station / off after the last station    |

Map view switches instantly in both directions, without an animated camera flight.
Each U press advances one step; holding it does not repeat. Restoring the HUD preserves
normal visibility rules (for example, the tach stays hidden in cabin view).
Use `?hide-ui=0` through `?hide-ui=4` to start at a visibility level; U updates the
parameter as you cycle.

### Gamepad

Connect an Xbox-style controller and press a button while the game has focus.
The native Gamepad API requires localhost or HTTPS; browser/OS support determines
which controllers expose the `standard` mapping. Connection status appears in
Settings > Controls. The first connected standard-mapped controller is used.

| Controller input                    | Action                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| R2 / RT                             | Analog accelerator                                                                  |
| L2 / LT                             | Analog brake; reverse near a stop                                                   |
| Left stick horizontal               | Analog steering                                                                     |
| Left stick vertical (map view)      | Up: zoom in; down: zoom out                                                         |
| Right stick                         | Camera orbit/height; pan up/down/left/right in map view                             |
| Right stick left / right (hold 1 s) | Corresponding turn signal flashes four times; camera still pans (not in map view)   |
| R1 / RB                             | Handbrake                                                                           |
| A / Cross (south face button)       | Clutch: hold at high revs, release to clutch kick                                   |
| X / Square (west face button)       | Tap to toggle headlights; hold 1 second to toggle fog lights                        |
| L1 / LB                             | Flash high beams; hold 1 second to toggle high beams on/off                         |
| R3 (right-stick click, hold)        | Look behind; move right stick to pan; release to return                             |
| B / Circle (east face button)       | Dismiss a nonfatal error; otherwise toggle the bird's-eye map view (once per press) |
| RT + LT                             | Brakestand                                                                          |
| Start / Menu / Options              | Reset (once per press)                                                              |
| View / Select / Back                | Cycle FPV drone, classic chase, in-cabin (once per press)                           |
| Y / Triangle (north face button)    | Toggle Grip / Drift mode (once per press)                                           |
| D-pad Down                          | Cycle Noon / Sunset / Night (once per press)                                        |
| D-pad Up                            | Stop recording and replay, or play saved laps before the start line                 |
| D-pad Left / Right                  | Stereo previous / next (including Off); previous / next lap during replay           |

Both triggers together allow brakestand behavior only below 4 km/h. LT alone brakes forward
motion, then engages reverse only near a stop; release LT to leave reverse.
Reverse is limited to 35 km/h. Keyboard X also brakes into reverse near a stop;
release X to leave reverse, or press Z to switch to forward drive. Sticks use a
rescaled deadzone to avoid drift, and trigger values control torque/brake force
continuously across their full range; crossing the controller's digital press
threshold does not force full throttle or braking. Keyboard pedals remain on/off
and available alongside the controller.
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
Near rest, tire contacts smoothly transition to static friction: contact forces
oppose tangential velocity and gravity, bounded by the same load-dependent grip
budget. Braked wheels can hold on hills and banked pavement without requiring
continuous sliding; longitudinal holding is also limited by brake torque.
Unbraked wheels remain free to roll downhill, and slopes beyond available grip
still cause sliding. The usual combined-slip model takes over as road speed or
wheelspin increases; there is no bank-specific lock or chassis velocity reset.
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
Silver headlight interiors contain bright emissive warm-white projectors with real,
shadow-casting spotlights at intensity 550 and a warm `#ffe2b8` tint.
Press F or L1 / LB to flash the rectangular inboard high beams, even at noon.
Release before one second for a momentary flash, or hold for one second to
toggle high beams on/off. H or controller X / Square turns headlights on immediately
when pressed from off; releasing before one second leaves just the headlights on.
If headlights are already on, a short press turns both headlights and fog lights off
on release. Holding for one second toggles fog lights immediately,
without waiting for release, and always leaves headlights on.
This enables both pairs from off, adds fog lights
to headlights alone, or turns off just fog lights when both are on.
Each hold toggles only once, and latched lights stay on after release.
Changing time of day restores the automatic headlight setting (off at noon,
on at sunset/night) and switches fog lights off; H / B can override that setting
until the next change.
Controller B / Circle still toggles map view; X / Square no longer applies the handbrake.
Clearing driving inputs (including focus loss or opening a dialog) cancels pending
holds, high beams, and turn signals, but preserves the selected headlights and fog lights.
Disconnecting a controller cancels its pending hold.
Their reflectors and bulbs use the same warm-white emission as the projectors,
with stronger, longer-range beams aimed slightly higher (0.25 m down over 20 m,
versus 1.1 m for low beams). A blue dashboard indicator follows both flashed
and latched high beams.
The lower fog lights have the same warm-white lens emission and halos, with
shorter, wider beams aimed farther down and outward
(3 m down over 20 m, versus 1.1 m for low beams).
Only the low beams cast shadows; high beams, fog lights and rear lamps do not,
keeping the night scene within WebGL's 16 fragment-texture-unit minimum.
All three pairs have soft additive, forward-facing lens halos rendered as scene geometry,
so their glow also appears in live mirrors without a separate bloom pass.
Lit shaders compile per count of each visible light type and shadow caster, so
every car, cabin, stereo and ghost light stays registered at zero
intensity when off. Switching any lamp never recompiles shaders, and startup
compiles just the chase and cabin views for the selected time of day. All three mirror render targets
are also compiled and rendered during startup, even when starting in chase view
or with mirrors off. The selected light and mirror settings are restored afterward;
warmup does not start radio playback. Switching time of day for the first time
compiles that sky's lighting variants, so it can briefly stutter.
The halos are depth-tested, do not write depth, and cannot show through cars or walls.
Manual headlight choices, high beams and fog lights are preserved in lap recordings.
Automatic headlights follow the playback time of day, so daytime runs viewed at night
have headlights on unless they were manually switched off. Older recordings without
headlight state also follow the playback time of day and default high beams and fog lights to off.
The two rear brake lenses and spoiler
brake strip glow red
while the foot brake is pressed (keyboard X or controller LT when braking)
or the initial spawn brake hold is active.
They stay unlit while coasting, engine braking, or using LT to reverse;
bumper reflectors remain unchanged. Front and rear turn-signal lenses are clear
instead of amber beneath their existing tinted covers.
Hold the right stick at least halfway left or right for one second to trigger
four flashes on that side's front, rear, side marker, and dashboard arrow
(0.4 seconds on, 0.4 seconds off). Camera panning still works. Release or change
direction before another one-second hold to trigger again; keeping the stick
held does not repeat the sequence. Map panning does not trigger signals.
Turn-signal states are preserved in lap recordings.
After the car's center is off the pavement for more than three continuous
seconds, the front and rear turn signals flash amber together (0.4 seconds on,
0.4 seconds off). Returning to pavement or resetting switches the hazards off
and restarts the delay. Unlit signals retain their clear lenses and smoked covers.
Automatic hazards take priority over manual turn signals, including their off phase.
Rear brake and reverse covers have 35% smoked tint when off and become
clear independently when their lamps are on; turn-signal covers stay tinted and
window glass is unchanged. This keeps the unlit lenses subdued without washing
their illuminated colors white.
When braking, short-range red spotlights illuminate the ground
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
The steering column, wheel, and stalk tilt upward by 2.5 degrees to keep the
turn-signal indicators visible from the default cabin eye position.
Dash warning lamps are off by default. The turn-signal arrows flash with the
hazards, BRAKE stays solid while the handbrake is held, and ABS stays lit in Drift
mode and switches off in Grip mode. `car.setDashLight()` can switch any lamp
(including the high-beam indicator) on or off.
Unlit warning lamps use blank dark gray masks that respond to cabin lighting
and blend into the surrounding panel without revealing the warning symbols.
At sunset and night, the gauge markings and odometer have a subdued green-white
backlight and the red needles glow. A small warm-white light softly illuminates
the gauge cluster whenever the headlights are on, including when manually enabled at noon.
The left climate-control and right gauge-side pod labels also brighten with neutral-white backlighting when
the headlights are on, retaining their original label colors rather than glowing green.
A very dim warm light gently illuminates the cabin at night only.
The console clock shows local real-world time in 12-hour `h:mm` format without a leading zero, updating
when the minute changes. It shares a fourteen-segment digital readout style with
the stereo, whose green display shows the selected station ID while powered on.
The stereo uses eight fixed-width character cells; longer IDs are truncated to
eight characters and shorter IDs are padded without changing character size.
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
run, or use **View replays → Watch** in the course picker to watch a saved run. During
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
The ghost has an even, very soft cyan halo around its silhouette and casts a faint
cyan light on nearby surfaces. Its halo respects scene depth, and both effects fade
with the ghost near your car in cabin view.
Exterior stripes and trim use a slightly darker cyan, including the front lamp and bumper details.
The ghost mesh, lighting variants, and halo passes are warmed up on the game canvas
during startup, with GPU work completed before loading ends, to avoid first-use
shader compilation at the finish line.
Ghost lights stay registered at zero intensity while hidden, keeping scene shader
layouts stable when the ghost appears or disappears. The canvas stays hidden
through warmup until the first gameplay frame is ready.
Chase views fade it only slightly,
to 70% of its normal opacity when the cars overlap.
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

The live Camera style picker offers **FPV drone** and **Classic chase** (the original
camera), plus **In-cabin** at the right-hand
driver's seat. In-cabin follows the car's orientation, including hills, banking,
and slides, with a wider 75-degree field of view. A damped head response shifts
opposite the car's measured 3D acceleration, with subtle pitch/roll from the same
motion. This naturally responds to turns, gear changes, braking, elevation changes,
and impacts without event-specific effects. `cabinCameraMotion` in `src/camera.ts`
sets lateral, longitudinal, and vertical displacement in meters per g, the force
limit, spring response, and tilt per meter. Resets clear the motion history;
constant velocity settles back to the base seating position. Mirrors remain aimed
at that base position and do not re-aim with head movement.
**Settings > Camera > Cabin head motion** turns this effect off or on (on by default).
The choice persists in the URL as `?head-motion=off` or `?head-motion=on`.
Turning it off clears the offset immediately; re-enabling it starts with fresh
motion history, avoiding a jump from stale velocity. Right-stick look and R3
look-behind remain available. Camera style is independent of drive mode.
Classic chase keeps the original framing and motion. `?camera=fpv`, `?camera=classic`,
or `?camera=cabin` persists the choice through reloads and course changes.
FPV drone flies low and close behind the car with a wider field of view, lining up with
the course a short, speed-scaled distance ahead rather than the car's body heading, so
drifts stay framed side-on instead of swinging the camera around. Its offset from the
car follows a critically damped spring, and it banks into turns in proportion to its
own lateral acceleration. Off-course, low-speed, reverse, and manual camera input fall
back to the car's direction of travel. `fpvCameraMotion` in `src/camera.ts` holds its
distance, height, field of view, course look-ahead, responses, and bank limits.
Course look-ahead projects continuously between route samples, so small physics
changes don't jerk the view.

## Time of day

The Time of day picker switches lighting live without resetting the car or lap.
The Noon preset has a blue sky and early-afternoon (roughly 2 PM) lighting,
with a high sun (about 56 degrees elevation), brighter warm-neutral ambient fill,
and near-white sunlight. Warm ground bounce keeps shaded rock faces earthy rather
than blue-gray, while headlights add a modest warmer tint.
Its existing `?time=noon` identifier is unchanged. Sunset uses a warm horizon, golden
directional light, and a low sun angle for long shadows. Night uses a dark blue
sky with soft cool ambient moonlight to reveal the car and nearby hills;
the car's headlights remain the main illumination on the road.
Procedural clouds are baked into the sky texture. Sunset alone uses
dense slate-blue cloud banks and fiery coral/orange undersides.
A low sun and localized golden glow brighten the horizon beneath a cooler
overhead sky, with warm direct light contrasted against cooler ambient light.
Noon uses a physically based atmospheric sky with sun-direction-dependent scattering,
a visible solar disc, and scattered clouds. Its HDR sky and filtered reflections
are baked once during loading; the solar disc is omitted from reflections because
the directional light already supplies direct sunlight.
night retains the original muted blue clouds. Neither uses the dramatic sunset treatment.
Cloud patterns are deterministic, wrap seamlessly around the horizon, and
add no per-frame cloud rendering passes.
Sky, fog, ambient illumination, reflections, and exposure change together.
Distance haze fades in from 800 m to 3 km, using muted time-of-day colors
separate from the sky horizon so distant slopes retain their shading.
At every time of day, reflective materials use the visible sky, so the car
reflects the actual clouds and sky colors. All three skies and their reflection maps
are generated during loading, then reused when switching time of day; only the
selected time of day is shader-warmed at startup.
Time-of-day car lights stay registered at zero intensity when off, avoiding
scene-wide shader recompilation. No extra per-frame scene captures are needed.
At Sunset and Night, headlights (beams and lens glow) switch on together with
the running lights. At Noon they switch off by default; H or controller X / Square
can override either setting. The two body brake lenses use a
dark red base and low emission as running lights, with a pronounced jump to
full red emission when braking so brake application stays visible at Sunset/Night. They brighten
when braking; the spoiler strip remains brake-only. Front turn signals glow dim amber
and brighten during hazard flashes; rear signals illuminate only for hazards.
Side markers glow amber. Soft red
underglow is an unlit additive glow draped over the terrain beneath the car each
frame, shared with the bots; it adds no scene lights, fades with fog, and fades
out while the car is not upright.
Underglow is Night-only. Foot braking, hazards, and reverse lights
still work at any time of day, independently of the running-light state.
The selection is saved in `?time=noon`, `?time=sunset`, or `?time=night` and
preserved when switching courses or generating a random layout. Sunset is the default.

## Courses

The course library's **Forward / Reverse** control selects the direction applied
when loading any named, random, or custom layout. Use `?reverse=1` in a course URL to open it
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
the steepest edge around each vertex of the smoothed heightfield so grass does not
creep onto walls from the flat ground at their foot or crest.
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

Click the minimap to open **Choose course** and load Sweeper Circuit, Hillside Circuit, Hilly Drift,
Flat Skidpad, or an imported track. Switching courses replaces the track in place without
reloading the page or car assets. It resets the car, physics world, lap timing,
cones, smoke, and tire marks while retaining tuning, sound, camera, drive mode,
and time-of-day settings. Replaced track graphics and physics bodies are freed;
native heightfield buffers are pooled and reused because this Ammo build does not
export a working memory-free function.
Course controls are disabled during loading, and failures appear in the status
message without navigating away. The selection is encoded in `?course=sweeper` or
`?course=hilly-drift`, so links can open a particular course.

Nonfatal status errors can be dismissed with their close button, **Escape**, or
**B / Circle** on a controller. Dismissing an error does not also toggle the map
or close an open dialog. Fatal startup/runtime errors and graphics-context loss
cannot be dismissed; reload the page to restart.

The driving corridor is textured asphalt with an 80 cm paved shoulder; everything
outside it is textured dirt/gravel. Both receive shadows and headlights.
Surface textures use subdued fine grain and seamless weathering patches; asphalt
also has baked roughness variation and larger-scale weathering. Rock faces, and soil
on slopes steeper than about 30°, use world-space triplanar color and normal mapping
to avoid stretching top-down textures into vertical streaks on steep slopes.
Offset texture samples blend together to reduce obvious tiling;
irregular multi-scale patches add subdued green/dry-grass variation without regular
vertex-color stripes or artificial rock strata.
Terrain uses ambientCG Rock030, Ground037, and Grass004 CC0 scanned materials,
with separate 1024px color, OpenGL normal, and roughness maps. Soil blends into
rock on steep slopes and grass on gentler ground. A ragged brown dirt verge runs
2.5–5 m out from the pavement and washes 0.1–0.9 m onto the asphalt's outer edge in
drifts and loose grains, drawn as a transparent overlay above edge lines, kerbs, and the
start/finish line so the paving edge isn't a clean line. Rock is tinted tan so cut banks read as earth rather
than gray stone. Maps load before the first course;
download failures stop loading with the normal startup error rather than silently
substituting textures. Headless training retains procedural surfaces without image loading.
Source and license details are in [models/terrain/LICENSE.txt](models/terrain/LICENSE.txt).
Broad world-space patches mix olive and dry
grass with exposed soil across the hills, without changing terrain geometry or grip.
The terrain also casts shadows; decorative grass tufts only receive them.
The sun uses three cascaded 2048×2048 shadow maps following the camera, with
splits at 30 m, 180 m, and 1500 m and blended transitions. This keeps nearby car
shadows detailed while extending terrain shadows into the distance haze.
Mirrors reuse the main view's shadow maps. Cascades add two sun shadow passes
and use roughly three times the sun shadow-map memory of a single map.
Each wheel checks its physics contact against the course corridor: dirt/gravel has
65% of the selected mode's asphalt friction and cornering stiffness, reducing
acceleration, braking, and cornering traction. The paved shoulder retains full
grip, and returning to asphalt restores it immediately.
Rear tires detect the paved corridor, including the shoulder. Off pavement,
sliding/spinning tires emit tan dust at half the smoke rate with slightly lower
opacity and less upward drift, and leave muted brown dirt tracks rather than
dark rubber stripes. Dust opacity is capped at 14% per puff before edge/lifetime
fading. Smoke and dust receive per-puff colored lighting from daylight/moonlight
and headlight and brake/reverse beams. Beam angle,
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

**Create course → Random** previews a new closed circuit, retaining
your settings and tuning. Loading it replaces the race without reloading the game.
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
Banking varies deterministically with the seed, favoring moderate banking around
6° (a 4.5–7.4° cap depending on the seed), rather than extreme slopes.

### Custom generation

Choose **Create course** in the library. An editable temporary name is filled in
automatically (New course, New course 2, etc., avoiding existing saved names).
You can keep it or enter your own name; empty names cannot be generated or saved.
A temporary **New course** entry at the bottom of **Saved courses** becomes selected
instead of the current layout.
Choose Random or Custom, adjust the settings, then **Generate preview**.
The draft can be edited and regenerated without changing the current race.
**Save layout…** saves without loading; **Save & load course** saves and starts the new layout.
Closing the library discards an unsaved draft. An unsaved active course from a URL can
also be named and saved with **Save layout…**.
The exact course layout is stored in localStorage,
added to and selected in the **Choose course** picker, including after reloading.
Saved layouts also retain their generator type and seed; custom courses include
the exact generation parameters used, independent of later slider changes.
Saved courses are
local to this browser; their `?course=saved-…` links require the same local data.
The picker groups **Built-in courses**, **Racetracks**, **Roads**, and **Saved courses** in a
scrollable list of outline thumbnails, names and lap lengths (meters for courses
under 1 km, otherwise kilometers). The current course is marked independently
of the preview selection. Selecting a course updates its details and 2-D preview;
building the larger 3-D preview is temporarily disabled.
**Load course** changes the course and closes the dialog on success. Loading
errors remain visible in the dialog. While an unsaved random or custom course is
active, a **Current layout** group lists it (marked Unsaved) so its records and
replays stay reachable; loading it rebuilds the same seed. The group disappears once
the layout is saved or another course loads. The Saved courses group explains how to save
a course when empty. A saved course's action disclosure offers rename and confirmed
deletion.
Replay rows offer **Watch** and confirmed **Delete** actions. Right-click a row to
copy that run's JSON to the clipboard, including its metadata and compressed frames
in localStorage-compatible format. Deleting a replay
does not load its course or remove the local record. Saved-run playback and deletion
live in the course picker; the main HUD only shows the stop-recording button while
recording, and lap navigation during replay.

The reusable `Tabs` class in `src/tabs.ts` handles Settings and Controls tab/panel
ARIA relationships, roving focus, orientation-aware arrow navigation with wraparound,
and Home/End navigation.
Static Settings and Controls markup, including illustrations, lives in `index.html`;
TypeScript binds behavior and renders data-driven binding rows and input highlights.
Escape, the close button, or a backdrop click dismisses the dialog and restores
focus to the minimap. Driving inputs are disabled while it is open.
Deleting the active saved course loads the default course. Built-in and unsaved
generated layouts cannot be deleted.

**Create course → Custom** shows a **1–5 km course length** slider (100 m
steps), six independent preference sliders from **0 to 1** (0.01 steps),
percentage readouts, and **Reset defaults**. Adjusting sliders does
not change the current course. **Generate preview** builds a new seeded layout without
resetting the driving session. Generation controls are disabled while building;
a failure stays visible so you can adjust the mix or retry. Settings scroll inside
the fixed-size dialog. Driving inputs are disabled
while it is open, as with the other dialogs.

The weights do not need to sum to one: 0 avoids a feature, while 1 strongly
favors it. Intermediate corner weights vary the chance of including each
feature as well as its shape. A closed circuit still needs connecting bends, and
connecting sections can remain straight even with a zero straightaway preference.
Length is a distance target, not a weight: the generator fits the feature mix
within 5% of that target without shrinking corners below the safety limit.
Short layouts use somewhat smaller sweepers and kinks to leave room for straights.

| Preference       | Default | Effect                                                                                                                                                                 |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Course length    | 2.0 km  | Targets a lap between 1 and 5 km.                                                                                                                                      |
| Elevation change | 0.50    | Scales climbs and descents independently of banking. Zero flattens the centerline; one targets up to 20 m centerline relief, capped at 12% grade.                      |
| Turn banking     | 0.10    | Scales inward corner banking independently of elevation. Zero removes banking; one allows up to 33°. Set both elevation and banking to zero for entirely flat terrain. |
| Straightaways    | 0.50    | Lengthens the main straight and the straights between corner complexes, with fewer complexes per lap.                                                                  |
| Tight corners    | 0.35    | Adds 90° corners and 155–185° hairpins, typically around 25–40 m radius. This also controls hairpins; there is no separate hairpin preference.                         |
| Sweeping corners | 0.70    | Adds broad, flowing bends around 95–140 m radius, plus more high-speed kinks.                                                                                          |
| Chicanes         | 0.35    | Adds tight left-right chicanes and longer two- or three-bend esses.                                                                                                    |

Banking changes the terrain cross-slope, not the layout, and is retained in custom
course links and saved courses. Sweeper Loop sets `bankingScale: 3` in its course
definition for stronger banking with smooth transitions (up to about 11° on
sustained turns). Other built-in courses and imported racetracks keep their
existing banking profiles.
Generated banking is smoothly blended along 150 m of the closed route, including
across the start/finish seam. This rolls the pavement gradually into and out of
each turn, raising the outside relative to the inside without changing centerline
elevation. Short bends and quick left-right transitions receive less banking so
they do not become abrupt ramps; the maximum angle requires a sustained corner.

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
Length (in metres), all six preferences, and the seed are stored in the URL, for example
`?course=custom&seed=123&length=2000&elevation=0.5&banking=0.1&straightaways=0.5&tightCorners=0.35&sweepingCorners=0.7&chicanes=0.35`.
Old links without a length use 2 km; links without banking use 0.10.
Previously saved courses retain their existing terrain banking.
Obsolete `hairpins` parameters are ignored
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

Vehicle audio is synthesized in real time with Web Audio and an AudioWorklet; no recorded
vehicle sound assets are used. Vehicle audio attempts to start immediately
on initialization. If browser autoplay policy blocks it, a click or keypress retries
the unlock; controller-only players may need to click the page once. The Sound
dropdown in Settings defaults to On and selects On/Off explicitly. Off is saved as
`?sound=off`, so muted sound survives reloads and course changes.
Audio is not muted on window blur, hidden tabs, or while dialogs are open.
Browser autoplay and background-tab suspension policies still apply.

Press **S** to turn on the stereo, illuminate its green display with a soft green
glow on the nearby console, and stream
[SomaFM Groove Salad](https://somafm.com/groovesalad.pls) by default. Settings
**Stereo station** includes **Off**, Groove Salad, Secret Agent, Vaporwaves,
Heavyweight Reggae, Underground 80s, and Metal Detector. Selecting a station
powers on the stereo and switches the live stream immediately; selecting **Off**
stops playback. The choice is saved in the URL using the station's display ID,
such as `?station=grvesald`, `?station=metal`, or `?station=scrtagnt`.
With a station ID in the query parameter, the stereo attempts to play that station
on load; `?station=off` explicitly keeps it off.
If the browser blocks autoplay, a click or keypress retries playback without
advancing the station. Without the parameter, the stereo stays off until requested.
Streaming requires an internet connection. Each further **S** press selects
the next station in menu order, followed by Off.
The next press starts again at Groove Salad. Turning off stops the stream and
extinguishes the green display and console light. Holding **S**
does not repeatedly change stations.
Outside replay, gamepad **D-pad Left / Right** also turns on the selected station;
subsequent presses select the previous / next station, with Off between the first
and last stations.
During replay these buttons retain their previous / next lap controls.
Settings **Sound: Off** mutes both the vehicle and stereo. Playback continues across
car resets and course changes. Turning the stereo off with a keyboard/controller
removes the `station` parameter; choosing **Off** in Settings saves `station=off`.
Both keep it off after reloading. Stream failures
appear in the status message and turn off the display; press **S** to retry.

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

### GitHub Pages

```sh
npm run deploy
```

This type-checks and builds the app, then publishes only the contents of `dist/`
to the `gh-pages` branch of the `origin` remote. It does not commit or push the
source code or your current branch. Git must have push access to `origin`.
The deployment includes `.nojekyll` so GitHub Pages serves the output unchanged.

In the repository's **Settings > Pages**, select **Deploy from a branch**,
then **gh-pages** and **/ (root)**. For this repository, the site URL is
<https://lazd.github.io/dorifto/>.

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
near-black interior. Painted body panels use a physical clearcoat layer for glossy,
colorless highlights over the existing paint textures; bot paint inherits the same finish.
