# Bot drivers and training

## Goals

Implement race and drift drivers that use the player's vehicle physics and normal
controls, without hidden traction, power, rotation, or position assistance.
All existing, imported, generated, and reversed courses should work from their
route and terrain data, without hand-authored AI waypoints.

Training courses:

- **Race:** Hillside Circuit (`hillside`).
- **Drift:** Sweeper Loop (`sweeper`).

Use repeated **three timed lap** runs, excluding the approach to the start line.
Record failures explicitly rather than silently resetting or calling incomplete
runs successes.

## Architecture

1. **Shared physics world:** one terrain and collision world, multiple independently
   configured vehicles. Apply every vehicle's forces, integrate the world once,
   then update every vehicle's contacts and lap timer. Preserve single-car and replay behavior.
2. **Course driving map:** sample route position, tangent, curvature, road clearance,
   terrain grade and banking. Track progress locally to avoid jumping between
   adjacent hairpins. Share immutable analysis between drivers.
3. **Planning:** generate a smooth road-constrained line and acceleration/braking
   speed profile. Start conservatively; refine the line and speed estimates.
4. **Control:** feed normal throttle, brake, steer, reverse and handbrake inputs.
   Respect the same steering smoothing, rate limits, drivetrain and tire forces as
   the player. Expose body slip angle, yaw rate and per-wheel traction telemetry.
5. **Evaluation:** run the same fixed-step physics without rendering or real-time
   accumulator limits. Save configuration, controller version, learning state,
   valid lap times, failures and stability/control-effort measurements.

## Race policy

Optimize valid lap time while maintaining grip and remaining on the road.
Use curvature-based speed limits, backward braking and forward acceleration
passes, and feedback for speed/line errors and excessive slip.

Skill and aggression are independent:

- **Skill:** preview, braking precision, consistency, reaction and recovery.
  Never changes physical performance.
- **Aggression:** following gap, pass commitment and safety margins.
  Never permits deliberate contact or creates extra competence.

Start with reliable solo driving and conservative following. Full passing,
side-by-side racing and fair defending are later racecraft work.
Mistakes should be seeded and temporally coherent, not frame-by-frame noise.

## Learning inside the bot

Use bounded, interpretable adaptation, not a neural network initially.
The bot owns course-specific experience: observed difficulty and safe speed
margins per route section. Slow down after loss of grip or road clearance;
increase speed cautiously after clean passages. Apply bounded updates at stable
boundaries rather than making the car's target oscillate during a corner.

Keep learned driving separate from vehicle tuning and expose learning enable/freeze,
reset and serialization. Key saved experience to course geometry/direction,
vehicle setup, driver parameters and controller version. Reject incompatible or
malformed experience rather than silently applying it.

Reset transient controller estimates, including coasting deceleration, between runs
so frozen evaluation repeats from the same state without clearing saved experience.

The evaluator orchestrates repeated runs and comparisons; the bot itself observes
and updates its driving. Frozen evaluation on held-out courses and human driving
are still required: adaptation on Hillside is not proof of general competence.

## Drift policy (after the race foundation)

States: approach, initiate, sustain, transition, straighten and recover.
Initiate using brief handbrake input, releasing once rotation develops.
Control trajectory, body slip angle and yaw rate through countersteer and throttle,
not fixed opposite steering or holding the handbrake throughout the turn.
Build on the race bot's slip-based countersteer (`excessSlip` in `src/race-bot.ts`),
which points the front wheels along the car's velocity once body slip exceeds a
threshold. For drifting, make the threshold a target slip angle per style and
hold it with throttle instead of recovering from it.

Gameplay presets over one controller:

| Style                                       | Priorities                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Japanese-inspired: Touge / High-Speed Feint | Momentum, precise placement, anticipatory transitions, feint with handbrake assistance where safe |
| American-inspired: High Angle / High Power  | Greater feasible angle, assertive entries, power-sustained slides and pronounced transitions      |

These are gameplay labels, not rigid regional definitions. Requested angle and
entry speed must remain feasible for the actual car, steering lock and road width.

Tandem chasing follows a short history of the leader's trajectory, not its current
position. Match course progress, lateral placement, speed, angle and transition
timing. Aggression adjusts desired time gap and physical clearance. Use swept
vehicle footprints and closing speed; back off when the leader spins or stops.
Catch up with ordinary driving, never teleporting or bonus power.

## Vehicle tuning feedback loop

Separate three activities:

- **Setup optimization:** fixed horsepower and tire class; optimize balance,
  controllability and consistency.
- **Build optimization:** explicitly bounded power/tire class or budget.
- **Physics calibration:** underlying model changes, reviewed separately.

Grip measurements: valid lap times, completion rate, collisions, off-track events,
wheelspin, excessive slip, steering saturation and correction effort.

Drift measurements: successful initiation, useful forward progress, sustained
angle/speed in intended sections, transition success/settling time, spins,
collisions, control effort and tolerance to modest input errors. Do not reward
donuts, stationary wheelspin or unnecessary straight-line slides.

Procedure:

1. Establish a baseline over multiple three-lap runs.
2. Measure one-parameter sensitivity, then search small combinations.
3. Compare identical courses, seeds and initial states; initially freeze the driver.
4. Later allow every candidate the same bounded adaptation budget.
5. Validate finalists on held-out courses, disturbances and controller precision.
6. Save optional presets with tradeoffs; human-drive before replacing defaults.

Keep parameter ranges physically plausible. Do not optimize player steering expo
as vehicle handling. Do not let an optimizer change mass, gravity or damping to
game its score. A winning setup demonstrates performance in this simulation, not
proof of a real-world setup. Retain failed runs and avoid reporting only best laps.

## Delivery sequence

1. Shared world, per-car configuration and telemetry.
2. Reliable course-independent race bot, playable opponents and repeatable
   three-lap Hillside training with persistent bounded learning.
3. Solo drift controller and three-lap Sweeper training.
4. Drift styles and tandem.
5. Passing/defending, richer skill behavior and multi-bot traffic.
6. Automated tuning search and preset comparison.

Profile multi-car cost before increasing bot counts. Keep feedback control in
the physics worker, share course maps, and avoid per-frame DOM updates.

## Live standings

With multiple drivers, the map HUD shows a color-matched leaderboard: the leader's
last valid lap (`m:ss`), then each trailing driver's gap to the leader (`+1.2s` or
`+1 lap`). Before passage history is available, gaps show `--`.

All drivers use the same sampled course centerline, with continuous segment
projection and a bounded local search each physics step. Progress unwraps across
the start line and decreases in reverse. An invalid lap subtracts one circuit
only when the driver crosses the finish line, matching the lap timer's policy.
Resets and course/direction changes clear progress and passage history.

Standings publish through existing worker snapshots at 10 Hz, outside the game
store. Time gaps refresh twice per simulation second (and on leader changes),
using the leader's interpolated passage time at each trailing driver's credited
course distance, not distance divided by speed. Passage history is bounded to
roughly one circuit per driver; invalid finishes clear that driver's history.
The UI retains its rows and only changes displayed text or ordering when needed.
Single-driver sessions and replays hide the leaderboard.

## Initial delivery status

Phases 1 and 2 are implemented:

- Shared terrain/world with per-vehicle forces, configuration and telemetry.
- Up to four colliding, exterior-only race opponents, configured through URL parameters.
- Road-constrained minimum-bending line, grade/banking-aware speed planning,
  conservative traffic following, and skill-dependent pace/preview.
- Driver-owned bounded section-speed learning, reset and frozen evaluation.
- Headless repeated three-lap training using the application's actual car model
  geometry and terrain, with JSON reports and compatible experience reload.

Initial measurements with the default grip setup and skill 0.8:

- Hillside: six successive three-lap training runs, all valid; first timed lap
  59.261 s, final training lap 54.116 s.
- Frozen learned evaluation: two three-lap runs reproduced the same times:
  53.869, 53.837, 53.871 s.
- Reversed Hillside: three three-lap runs, all valid.
- Sonoma: one three-lap frozen run, all valid.
- Sweeper: two three-lap race-policy runs, all valid; this is **not** drift training.

These are solo simulation results without props/traffic, not a claim of optimal
racing or human-friendly tuning. Live bots retain experience across resets only;
CLI reports persist it across processes. Richer mistakes, competitive defending,
live experience import, and automatic tuning searches remain future work.

**Next: phase 3, solo drift control and Sweeper drift evaluation.**

### Race presentation and pace follow-up

Races with bots first run three seconds of settling physics with all cars held on
the brakes in neutral (`N`), with a 4,500 RPM limiter. The player can rev with the
accelerator; bots rev at 60% throttle. Bot launch timers, lap timing, and race progress tracking
start after release. Resets and settings/direction changes restart settling.
Solo driving and headless solo training retain their existing immediate start.

The player can also activate the same neutral/4,500 RPM ANTILAG while stopped
(under 0.5 m/s, without spinning) by holding the handbrake and full throttle.
Releasing either input exits neutral. Moving handbrake use and partial throttle
retain their normal behavior; manual ANTILAG does not pause lap timing.

From a standing launch, bots hold their initial heading for 1 second to build
speed, then smoothly blend into racing-line steering over 2 seconds. Rolling
starts use racing-line steering immediately; resets restart the launch phase.

Inside passing attempts request 25% more throttle, capped at full throttle, while
retaining normal braking and slip-based throttle reduction.
After an inside attempt ends, its heading adjustment eases back to the racing
line with a 0.4-second time constant instead of disappearing immediately.

Every live bot has a three-row segmented license-plate readout, including the
full-detail car used when observing bots. It reports the controller's `thinking`
snapshot independently of numeric metrics, with lettering tinted to match the car:

- **Maneuver:** `CRUISE` when leading/solo, `CHASE` when behind in race position,
  `ATTACK` for a close inside pass, or `RETURN` while the passing offset eases away.
- **Speed control:** `BRAKE` when requesting braking, otherwise `LIFT` when planning
  to slow without braking. These labels are mutually exclusive. `STOP` also appears
  when braking backward motion. No active conditions is `--`.
- **Stabilization:** `OH SHIT` during excess-slip stabilization, otherwise `--`.

During the three-second pre-start settling/revving period the plate reads `ANTILAG`.
Revving above 2,500 RPM in this neutral produces frequent exhaust pops, brief flames,
and mixed black/white smoke from all four tailpipes. Throttle lift above 3,000 RPM in forward
gear has a 35% chance per throttle lift to produce quieter, less frequent
burbles/flames for a short period; skipped lifts stay silent until the next lift.
Overrun does not emit the pre-start black smoke. Sound and flames use the same event
trigger. This does not add engine power or alter the turbo model. Replay exhaust
effects are disabled because exhaust events are not recorded.
Emitter positions are derived from each rear pipe lip, not the wider muffler bounds,
so flames and smoke align with all four openings.
Neutral uses a 200 RPM limiter hysteresis for rapid cuts (normal driving keeps
350 RPM). Audio limiter cuts suppress loaded combustion while preserving the
underlying unloaded engine sound instead of nearly muting the entire engine.
Smoke jets rearward at 7-11 m/s before drag slows it and buoyancy
lifts it gently. Puffs are approximately 80% black and 20% white, with low upward
velocity to keep the plume flatter than tire smoke.
Exhaust pops use randomized waiting times rather than a fixed cadence;
deceleration burbles are substantially quieter and less frequent than pre-start pops.
ANTILAG averages roughly six pops per second, with randomized gaps. Its backfires
are dominated by a sharp noise crack, followed by a subdued punch and short rumbling
decay rather than a drum-like tone; overrun backfires are deeper and longer-bodied.
Pitch, decay, and crack/body
balance vary per event. Both share event timing with their visible flame.
Overrun detection remembers throttle use through a gradual lift, rather than
requiring an abrupt single-frame pedal release. Its deeper backfires have uneven
amplitude pulses for a gurgling decay and remain quieter than pre-start backfires.
Each ANTILAG or deceleration backfire selects one random tailpipe, excluding the previous pipe; the
other flames remain off. Smoke continues to emit from all four pipes.
During the launch hold and the full steering blend, `LAUNCH` replaces `CRUISE`
and `CHASE`. `ATTACK` and `RETURN` take priority immediately.

These categories overlap: an attacking bot can still brake or countersteer.
The controller receives its one-based `racePosition` from the same progress/lap
ranking used by the standings, including the player. Ranking updates every physics
step independently of HUD publication; resets and direction changes rebuild it.
Trailing bots use an effective skill of `min(1.01, configured skill + 0.06)` regardless
of the distance to the leader, without changing their racing line. Both the current
target and braking lookahead use that skill's complete cornering/braking speed
profile and initial pace scaling. Normal and boosted profiles are cached and rebuilt
only when learning changes pace. Learned experience remains owned by the configured
skill; its relative pace adjustments are preserved in the boosted profile.
Close inside attacks use the same skill bump, adjust the line, and optionally
request 25% more throttle. Chase and attack skill bumps do not stack. Returning
from an attack keeps chase pace if still behind, but only eases away the existing
heading offset. Solo training has no race position or chase boost.

Each bot's **Attack throttle boost** checkbox enables/disables only the extra
25% throttle request during attacks (enabled by default). The +0.06 effective-skill
bump, passing line, chase behavior, and slip/braking safeguards are unchanged.
`bot-attack-throttle-boost=0,1` disables it for the first bot and enables it for
the second; a single `0` or `1` applies to all bots. The dialog applies settings
through the URL and reloads, allowing repeatable on/off comparisons.
The readout describes decisions, not necessarily the instantaneous pedal position
while controls are smoothing. Textures update only when the displayed text changes;
resets and replay clear stale labels to `--`. Replays do not record bot thinking.

Controller version 2 starts closer to its intended skill-dependent pace, uses more
assertive acceleration and stabilizes slip/yaw without changing vehicle physics.
On Hillside at skill 1, three successive three-lap runs completed cleanly, with
timed laps from 46.512 s to 44.711 s. Experience from version 1 is incompatible.

Bots now publish engine, tire/contact, burnout, braking and velocity telemetry.
The client uses it for stereo/distance-attenuated audio, actual-slip smoke and tire
marks, brake lamps, and color-matched minimap arrows in both orientations.
Running lights are always illuminated; low-beam lens glow and an unlit additive
pool of light on the road ahead follow the player's headlight setting. Bots do
not get fog lights or high beams. At night each bot also gets a paint-matched
additive underglow; both glows are draped over the terrain each frame. The player's underglow uses the same glow, and the full-detail
observed car in bots-only mode recolors it. Three.js keys lit shader programs on the count of each light
type, so bots add no real lights and adding, removing, or hiding them never
recompiles shaders. Bot exteriors retain the model's black underbody
mesh to close the underside when a car rolls over.
Bot smoke shares the player's scene
depth pass instead of adding a depth render per opponent.

An experimental 50-100 ms presentation buffer was removed: delaying player
feedback is not an acceptable workaround for the observed stutter. Bot decisions
and dynamics already execute in the physics worker. Profiling and rendering
optimization, rather than adding visual latency, remain the performance work.

`bots-only=1` creates only bot vehicles and initially follows the first with the
corner-aware chase camera (an explicit `camera` URL setting takes precedence).
V cycles camera styles; Tab cycles the observed bot. The full-detail model,
interior, telemetry, audio, effects and lap HUD belong to
that bot, not to an additional hidden player. This mode also supports observing
bot behavior without a player vehicle influencing collisions.

### Controller version 3 follow-up

- Live race bots and the training CLI default to the application's built-in
  **Grip / Fast (`grip-fast`)** tuning, independent of player tuning.
  `bot-preset=grip-default` (or one comma-separated preset per bot) selects another
  built-in setup. Each preset has its own driver limits in `raceBotTunings`, searched
  with `scripts/optimize-race-bot.mjs --preset <id>`.
- `bot-learning=0` freezes bots at their saved experience, matching optimizer runs.
- `bot-skill`, `bot-aggression`, `bot-preset` and `bot-learning` each take one value
  or one comma-separated value per bot (up to `maxRaceBots`). The 🤖 dialog writes
  these parameters and reloads.
- `bot-skill=1,0.2` assigns different skills by bot index. In a two-bot spectator
  grid, bot 0 starts behind bot 1, making this a reproducible overtaking exercise.
- Traffic planning is currently a no-op. Each bot follows its optimized racing line and
  normal skill-based speed profile without reacting to opponents. There is no
  attack pace, passing offset, following limit, avoidance, or reversing recovery.
  Vehicles still collide in the shared physics world.
- Continuous speed interpolation, acceleration-profile feed-forward, mutually
  exclusive pedals and brake hysteresis replace direct speed-error pedal switching.
  Throttle commands invert the actual drivetrain's square-root pedal response;
  a braking-zone gate avoids reapplying throttle partway through braking.
- Chase-camera translation follows the same car pose sample, damping relative
  offsets rather than world translation.
- The visible stutter came from the client interpolation clock. It used message
  arrival wall time, so poses alternated between holding still and jumping two
  frames' worth (0/100 cm per frame at 30 m/s). Poses now use simulation time:
  the time sent to the worker and the render-frame time.
- Unobserved exteriors include rear trim, turn-signal lenses and the center reverse
  panel; reverse lamps use independent materials and only illuminate in reverse.
  Dim red running lights are distinct from bright braking lamps. All bots have
  non-red paint and stable color-matched minimap markers.

Version 3 experience is incompatible with earlier controller versions; the
configuration compatibility key also distinguishes the Fast setup.

#### Prior art informing further refinement

- [TUM global racing trajectory optimization](https://github.com/TUMFTM/global_racetrajectory_optimization):
  separates shortest/minimum-curvature/minimum-time line objectives and vehicle
  dynamics constraints. Minimum curvature alone is not a complete minimum-time solution.
- [TUM trajectory planning helpers](https://github.com/TUMFTM/trajectory_planning_helpers):
  forward/backward velocity-profile solving and longitudinal-acceleration profiles.
- [Nav2 regulated pure pursuit](https://docs.ros.org/en/iron/p/nav2_regulated_pure_pursuit_controller/):
  speed regulation and time-projected collision checking; explicitly requires
  kinematically feasible paths for car-like vehicles. It is navigation prior art,
  not a racing policy to copy unchanged.

Remaining driving work should be evaluated using pedal reversals and per-corner
speed/line traces as well as clean lap times. Passing very similar drivers is
harder than passing a deliberately slower car; a single successful overtake is
not evidence of complete racecraft.
