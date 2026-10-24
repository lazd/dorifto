# Training race bots

The optimizer tunes **driver limits**, not the car setup. Train each preset
separately: `grip-default` or `grip-fast`.

From the repository root, with dependencies installed:

```sh
npm run train:bot
```

This runs `grip-default` for 15 generations. For another preset or options, run
the command with overrides:

```sh
npm run train:bot -- --preset grip-fast --generations 15
```

- Defaults: skill **1**, learning **off**, three jittered samples per track.
- Evaluates Hillside (both directions), Sweeper, Hilly Drift and Sonoma.
- Below the table, **Tune score** starts at **100**; higher is better. It is
  `100 × starting cost / current cost`, combining pace with penalties for spins,
  off-track failures, invalid laps and pedal changes. Score improvement is not
  a speed percentage: pace is shown separately, alongside failed runs and average
  invalid laps per run across tracks. Scores are relative to this session's
  baseline (preserved on resume), not comparable between fresh sessions.
- Use `--workers 4` to limit CPU usage, or `--samples 5` for more robustness.
- A live table shows each track's previous best, baseline, best and latest lap
  times, brake applications and throttle lifts, paired as brakes/lifts in Before
  B/L and After B/L columns. A summary follows with the change from the start of
  the run, the change from the previous best and each tuning value.
- **Prev Best** is the fastest lap per track from earlier sessions, kept in the
  result file's `records` and fixed for the session (including on resume). It can
  come from older bot versions.
- Details go to `.bot-training/optimize-<preset>.log` (the ignored folder); from
  another terminal, follow them with `tail -f`.
- Terminal buttons: use **arrow keys / Tab** to select **🛑 Cancel** or **💾 Save**,
  then **Enter / Space** to activate. **C / Ctrl+C** cancels and saves the best tune so far to the
  result files; **S** saves it and updates the app's bundled tuning JSON without
  stopping training. Save applies the best fully evaluated tune, or the starting
  tune if the baseline is still running. Cancel alone does not update the app.

To continue from the saved tuning, run `npm run train:bot:resume` (the log is
appended to instead of replaced). Options can still be overridden, for example
`npm run train:bot:resume -- --preset grip-fast`.

Training saves a `-checkpoint.json` beside the results after each completed
sample. Resume restores the baseline, generation counter, mutation step sizes,
candidates and completed samples. Only in-flight samples are rerun after stopping.
The preset, skill, sample count and tracks must match; worker count may change.
An interrupted session continues to its original generation target. Resuming a
finished session adds another requested batch (15 generations by default).
Older results without a checkpoint cannot be resumed; start a new training run
once to create one. If no checkpoint exists, the resume command exits with a
message without starting training or changing files. Checkpoints are local
and gitignored; don't commit them.

## Apply and check

Results go to `training-results/race-tuning-grip-default.json`, and just the tuning to
`training-results/race-tuning-grip-default-tune.json`. Run `npm run apply:bot` (or
`npm run apply:bot -- grip-fast`) to copy the tune into
[race-bot-tunings.json](../src/race-bot-tunings.json), which the game bundles at build
time. Commit the `training-results/` files too: their `records` feed the next
run's Prev Best column.

Reload the game and test with `bot-preset=grip-default&bot-skill=1&bot-learning=0`.
Check Sonoma and hilly tracks in-game: clean headless results do **not** guarantee
reliable driving in the browser.

## Training drift bots

Drift bots (`drift-default`) have their own trainer, which tunes the constants of
the drift controller in [drift-bot.ts](../src/drift-bot.ts) rather than lap time:

```sh
npm run train:drift
```

- Runs 20 generations of the same (1+λ) search, two jittered samples per track,
  two laps per run, on Hillside and Sweeper.
- The score ([`driftScore`](../src/drift-training.ts)) is higher for more of the
  lap drifted through corners, a mean drift angle near 35°, and linked
  transitions (direction changes without regaining grip). It is lower for time
  on dirt, sliding on straights, yaw-rate tracking error and steering effort.
  Running beyond the white lines is fine; touching dirt is not. Spins, more than
  2 s on dirt, or getting stuck cost 200 points.
- The live table shows each track's start, best and latest results: laps
  covered, drift %, mean angle, new drifts and linked transitions per lap, dirt
  seconds per lap, yaw error and failures. **S** saves the best tune into the
  app; **C / Ctrl+C** cancels and saves it to the result files only.
- Results go to `training-results/drift-tuning-drift-default.json` and
  `-tune.json`, and the log to `.bot-training/optimize-drift-default.log`. Apply with
  `npm run apply:bot -- drift-default`, which writes
  [drift-bot-tunings.json](../src/drift-bot-tunings.json).
- There is no resume; rerun training to continue from the applied tuning.

Test in-game with `bots-only=1&bot-preset=drift-default`, or choose **Drift** as a
bot's drive mode in the bots dialog.

## Learn from a human lap

`learn:bot` compares one of your record laps with the bot on the same course,
then suggests tuning values from what you did differently:

```sh
npm run learn:bot -- .bot-training/human-hillside.json [--course hillside] [--reverse] [--preset grip-default] [--apply]
```

The input is a JSON object of localStorage entries, such as the output of
`copy(JSON.stringify(localStorage))` in the browser console. It needs a
`dorifto.record.v1:…` record lap. Pass `--course` and `--reverse` when the file
has records for more than one course or direction.

The corner table shows minimum speed, peak lateral acceleration and your slip
for each corner, plus the time the bot loses in the section around it. These
section gaps add up to the lap gap. Suggestions come from measured driving:

- `corneringGrip` from corner speeds;
- `tractionSlip` from slip at full throttle;
- `countersteerSlip` from when you countersteer;
- `smallSpeedDrop` from speed drops you coast through;
- `brakingLimit` from your deceleration under braking;
- `edgeMargin` from how close your apexes are to the edge.

Each suggestion is driven alone on that course (skill 1, learning off). If
your value is slower, the value halfway to it is also tried. The changes that
helped are then driven together. `--apply` writes the fastest tested set into
[race-bot-tunings.json](../src/race-bot-tunings.json).

A suggestion only proves itself on one course, so run `npm run train:bot`
afterwards to check the other tracks. `brakeThreshold`, `lookaheadTime` and
`yawDamping` can't be measured from a recording; leave them to training.

## Evaluate a single track

The old `train:bot` command is now `evaluate:bot`. It runs the current tuning on
one track without searching for new driver limits:

```sh
npm run evaluate:bot -- --course=sonoma-raceway --runs=3 --frozen
```

It announces the track, direction, preset and settings before driving, then adds
a table row after each run with lap times, validity, off-track time and wall time.
The final summary shows the best valid lap and total elapsed time. Without
`--frozen`, the bot still learns per-section speed margins; it does not change
the bundled tuning. Reports and resumable experience default to `.bot-training/race.json`.
