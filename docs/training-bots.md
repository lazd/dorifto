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
- A live table shows each track's baseline, best and latest lap times, brake
  applications and throttle lifts, paired as brakes/lifts in Before B/L and
  After B/L columns. A summary follows with the change from the
  start of the run, the change from the previous saved result and each tuning value.
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
message without starting training or changing files. Keep the checkpoint
alongside the result and tune files.

## Apply and check

Results go to `training-results/race-tuning-grip-default.json`, and just the tuning to
`training-results/race-tuning-grip-default-tune.json`. Run `npm run apply:bot` (or
`npm run apply:bot -- grip-fast`) to copy the tune into
[race-bot-tunings.json](../src/race-bot-tunings.json), which the game bundles at build
time. Commit the `training-results/` files too: the next run
reads them first and compares its lap times against them.

Reload the game and test with `bot-preset=grip-default&bot-skill=1&bot-learning=0`.
Check Sonoma and hilly tracks in-game: clean headless results do **not** guarantee
reliable driving in the browser.

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
