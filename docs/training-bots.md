# Training race bots

The optimizer tunes **driver limits**, not the car setup. Train each preset
separately: `grip-default` or `grip-fast`.

From the repository root, with dependencies installed:

```sh
mkdir -p .bot-training
node scripts/optimize-race-bot.mjs --preset grip-default --generations 30 \
  > .bot-training/optimize-grip-default.log 2>&1
```

- Defaults: skill **1**, learning **off**, three jittered samples per track.
- Evaluates Hillside (both directions), Sweeper, Hilly Drift and Sonoma.
- Lower cost is better; spins, off-track failures, invalid laps and pedal changes
  add penalties.
- Use `--workers 4` to limit CPU usage, or `--samples 5` for more robustness.
- Follow progress with `tail -f .bot-training/optimize-grip-default.log`.

To continue from the saved tuning, rerun with `--resume` (use `>>` instead of `>`
to keep the previous log).

## Apply and check

Results go to `.bot-training/race-tuning-grip-default.json`. Copy its `tuning`
object into the matching entry in `raceBotTunings` in
[race-bot.ts](../src/race-bot.ts), preserving full precision.

Reload the game and test with `bot-preset=grip-default&bot-skill=1&bot-learning=0`.
Check Sonoma and hilly tracks in-game: clean headless results do **not** guarantee
reliable driving in the browser.
