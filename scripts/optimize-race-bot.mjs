#!/usr/bin/env node
// Searches the race bot's driver constants (`raceBotTunings[preset]`) for the fastest valid laps across
// several courses, using a (1+λ) evolution strategy evaluated in parallel child processes.
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { appendFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { emitKeypressEvents } from 'node:readline';
import { createServer } from 'vite';
import AmmoFactory from 'ammojs-typed';
import { loadTrainingCarGeometry } from './bot-assets.mjs';
import { applyBotTuning } from './apply-bot-tuning.mjs';

export const bounds = {
  corneringGrip: [8, 24],
  brakingLimit: [5, 13],
  smallSpeedDrop: [0, 15],
  brakeThreshold: [0, 4],
  lookaheadTime: [0.1, 0.7],
  edgeMargin: [0, 1.5],
  countersteerSlip: [0.03, 0.4],
  tractionSlip: [0.05, 0.4],
  yawDamping: [0, 0.4],
};
const tracks = [
  { course: 'hillside', reverse: false },
  { course: 'hillside', reverse: true },
  { course: 'sweeper', reverse: false },
  { course: 'hilly-drift', reverse: false },
  // Long lap with crests and off-camber corners; one lap keeps generations short.
  { course: 'sonoma-raceway', reverse: false, laps: 1, maxSeconds: 240 },
];
const failurePenalty = 2;
const invalidLapPenalty = 0.05;
// Cost per brake application or full throttle lift per lap; about 0.1 s each on Hillside.
const pedalChangePenalty = 0.003;
// Each track is driven several times with every value nudged by up to this fraction. Laps are
// chaotic, so values must survive small differences (like the game's timing), not one replay.
const jitter = 0.01;

async function main() {
  const { values } = parseArgs({
    options: {
      generations: { type: 'string', default: '12' },
      workers: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
      skill: { type: 'string', default: '1' },
      preset: { type: 'string', default: 'grip-fast' },
      output: { type: 'string' },
      log: { type: 'string' },
      resume: { type: 'boolean', default: false },
      samples: { type: 'string', default: '3' },
    },
  });
  // Results are tracked in the repo so the next run can compare against this one.
  values.output ??= `training-results/race-tuning-${values.preset}.json`;
  values.log ??= `.bot-training/optimize-${values.preset}.log`;
  // Just the tuning object, ready for `npm run apply:bot`.
  const tuneOutput = `${values.output.replace(/(\.json)?$/, '')}-tune.json`;
  const checkpointOutput = `${values.output.replace(/(\.json)?$/, '')}-checkpoint.json`;
  const generations = Number(values.generations);
  const workerCount = Number(values.workers);
  const samples = Number(values.samples);
  let savedCheckpoint;
  if (values.resume) {
    try {
      savedCheckpoint = JSON.parse(await readFile(checkpointOutput, 'utf8'), (_key, value) =>
        value === 'Infinity' ? Infinity : value,
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      console.error(
        `No checkpoint to resume for ${values.preset}. Run npm run train:bot to start training.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const live = process.stdout.isTTY;
  if (live) process.stdout.write('\x1b[2J\x1b[H');
  const state = {
    preset: values.preset,
    generations,
    generation: 0,
    startedAt: Date.now(),
    progress: { done: 0, total: 0 },
    runs: 0,
    latest: [],
    selectedAction: 0,
  };
  const startPhase = (total) => Object.assign(state.progress, { done: 0, total });
  await mkdir(path.dirname(path.resolve(values.log)), { recursive: true });
  if (!values.resume) await writeFile(values.log, '');
  // The log always gets the full detail; the terminal gets it too unless the live table owns it.
  const detail = (text) => {
    appendFileSync(values.log, `${text}\n`);
    if (!live) console.log(text);
  };
  let drawn = 0;
  const clearLive = () => {
    if (drawn) process.stdout.write(`\x1b[${drawn}A\x1b[J`);
    drawn = 0;
  };
  const draw = () => {
    const text = dashboard(state, true);
    process.stdout.write(`${drawn ? `\x1b[${drawn}A` : ''}\x1b[J${text}\n`);
    drawn = text.split('\n').length;
  };

  const { raceBotTunings } = await importTuning();
  if (!raceBotTunings[values.preset]) throw new Error(`Unknown race bot preset: ${values.preset}`);
  const checkpoint = values.resume
    ? savedCheckpoint
    : {
        version: 1,
        preset: values.preset,
        skill: values.skill,
        samples,
        tracks,
        completedGeneration: 0,
        steps: Object.fromEntries(
          Object.entries(bounds).map(([key, [low, high]]) => [key, (high - low) / 6]),
        ),
        best: { tuning: { ...raceBotTunings[values.preset] } },
        groups: [],
      };
  if (
    checkpoint.version !== 1 ||
    checkpoint.preset !== values.preset ||
    checkpoint.skill !== values.skill ||
    checkpoint.samples !== samples ||
    JSON.stringify(checkpoint.tracks) !== JSON.stringify(tracks) ||
    Object.keys(bounds).some((key) => !Object.hasOwn(checkpoint.steps, key))
  )
    throw new Error(
      'Checkpoint does not match this preset, skill, samples, track or tuning configuration',
    );
  // Records are updated every save, so the session's starting records are kept in the checkpoint.
  const records = await readRecords(path.resolve(values.output));
  checkpoint.previousBest ??= tracks.map((track) => records[trackName(track)] ?? null);
  let best = checkpoint.best;
  const steps = checkpoint.steps;
  Object.assign(state, {
    previousBest: checkpoint.previousBest,
    baseline: checkpoint.baseline,
    reference: checkpoint.reference,
    best: checkpoint.baseline ? best : undefined,
    generation: checkpoint.completedGeneration,
    runs: checkpoint.runs ?? 0,
    generations: Math.max(generations, checkpoint.target ?? 0),
  });
  if (checkpoint.completedGeneration >= state.generations)
    state.generations = checkpoint.completedGeneration + generations;
  let cancelled = false;
  const cancellation = new Error('Training cancelled');
  const pending = new Set();
  let writes = Promise.resolve();
  const persist = (apply = false) => {
    const result = structuredClone(best);
    const snapshot = structuredClone({
      ...checkpoint,
      best,
      baseline: state.baseline,
      reference: state.reference,
      runs: state.runs,
      target: state.generations,
    });
    writes = writes.then(async () => {
      await save(result, snapshot);
      if (apply) await applyBotTuning(values.preset, result.tuning);
    });
    return writes;
  };
  const pool = Array.from({ length: workerCount }, () =>
    fork(fileURLToPath(import.meta.url), ['--worker', values.skill, values.preset], {
      stdio: 'inherit',
    }),
  );
  const workerExits = pool.map((child) => new Promise((resolve) => child.once('close', resolve)));
  const idle = [...pool];
  const waiting = [];
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    state.cancelled = true;
    state.message = 'Cancelling — saving best tune…';
    waiting.length = 0;
    for (const reject of pending) reject(cancellation);
    for (const child of pool) child.kill();
  };
  const onKey = (_text, key) => {
    if (['left', 'right', 'up', 'down', 'tab'].includes(key.name)) {
      state.selectedAction = 1 - state.selectedAction;
      draw();
      return;
    }
    const activate = key.name === 'return' || key.name === 'space';
    if (key.name === 'c' || key.name === 'escape' || (activate && state.selectedAction === 0))
      cancel();
    if ((key.name === 's' || (activate && state.selectedAction === 1)) && !cancelled) {
      state.message = 'Saving tune to app…';
      void persist(true).then(
        () => {
          state.message = 'Saved best tune to src/race-bot-tunings.json';
          detail(state.message);
        },
        (error) => {
          state.message = `Save failed: ${error.message}`;
          detail(state.message);
          cancel();
        },
      );
    }
  };
  const interactive = live && process.stdin.isTTY;
  const wasRaw = process.stdin.isRaw;
  if (interactive) {
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', onKey);
    process.stdin.resume();
  }
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  const evaluate = (tuning, track) =>
    new Promise((resolve, reject) => {
      if (cancelled) return reject(cancellation);
      pending.add(reject);
      const run = (child) => {
        child.once('message', (result) => {
          pending.delete(reject);
          if (cancelled) return;
          const next = waiting.shift();
          if (next) next(child);
          else idle.push(child);
          if (result.error) reject(new Error(result.error));
          else {
            state.progress.done++;
            state.runs++;
            state.latest[tracks.indexOf(track)] = result;
            resolve(result);
          }
        });
        child.send({ tuning, track }, (error) => {
          if (error && !cancelled) {
            pending.delete(reject);
            reject(error);
          }
        });
      };
      const child = idle.pop();
      if (child) run(child);
      else waiting.push(run);
    });

  const timer = live ? setInterval(draw, 250) : undefined;
  try {
    await persist();
    if (!state.baseline) {
      startPhase(tracks.length * samples);
      state.progress.done = checkpoint.groups
        .flatMap((group) => group)
        .filter((job) => job.result).length;
      best = { ...best, ...(await score(best.tuning, 0)), evaluations: 1 };
      state.reference = [...best.times];
      state.baseline = { ...best };
      state.best = best;
      checkpoint.groups = [];
      await persist();
    }
    detail(`start: cost ${best.cost.toFixed(3)} | ${formatLaps(best.results)}`);
    detail(`  ${formatTuning(best.tuning)}`);
    for (
      let generation = checkpoint.completedGeneration + 1;
      generation <= state.generations;
      generation++
    ) {
      state.generation = generation;
      checkpoint.candidates ??= Array.from({ length: workerCount }, () =>
        mutate(best.tuning, steps),
      );
      const candidates = checkpoint.candidates;
      startPhase((candidates.length + 1) * tracks.length * samples);
      state.progress.done = checkpoint.groups
        .flatMap((group) => group)
        .filter((job) => job.result).length;
      await persist();
      detail(`\ngeneration ${generation}/${state.generations}: next ${formatSteps(steps)}`);
      const parent = best;
      // Re-score the parent too, so one lucky evaluation can't hold the lead forever.
      const [again, ...scored] = await Promise.all([
        score(parent.tuning, 0),
        ...candidates.map(async (tuning, i) => {
          const result = { tuning, ...(await score(tuning, i + 1)) };
          const delta = result.cost - parent.cost;
          detail(
            `  #${String(i + 1).padStart(2)} ${delta < 0 ? '+' : ' '} cost ${result.cost.toFixed(3)} ` +
              `(${delta >= 0 ? '+' : ''}${delta.toFixed(3)}) | ${formatLaps(result.results)}\n` +
              `       ${formatTuning(tuning, parent.tuning)}`,
          );
          return result;
        }),
      ]);
      parent.cost = (parent.cost * parent.evaluations + again.cost) / (parent.evaluations + 1);
      parent.evaluations++;
      detail(`  parent re-scored ${again.cost.toFixed(3)}, averaging ${parent.cost.toFixed(3)}`);
      const winner = scored.reduce((a, b) => (b.cost < a.cost ? b : a));
      const successes = scored.filter(({ cost }) => cost < parent.cost).length;
      const factor = successes / scored.length > 0.2 ? 1.3 : 0.8;
      for (const key of Object.keys(steps)) steps[key] *= factor;
      if (winner.cost < parent.cost) {
        best = { ...winner, evaluations: 1 };
        state.best = best;
        detail(
          `improved: cost ${parent.cost.toFixed(3)} -> ${best.cost.toFixed(3)} | ${formatLaps(best.results, parent.results)}\n` +
            `  ${formatTuning(best.tuning, parent.tuning)}`,
        );
      } else {
        detail(`no improvement: best remains ${parent.cost.toFixed(3)}`);
      }
      detail(
        `  ${successes}/${scored.length} candidates beat the parent; ` +
          `${factor > 1 ? 'widening' : 'narrowing'} the search (steps x${factor})`,
      );
      checkpoint.completedGeneration = generation;
      checkpoint.groups = [];
      delete checkpoint.candidates;
      await persist();
      detail(`\n${dashboard(state, false)}`);
    }
  } catch (error) {
    if (error !== cancellation) throw error;
    await persist();
  } finally {
    clearInterval(timer);
    if (interactive) {
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
    }
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
    for (const child of pool) child.kill();
    await Promise.all(workerExits);
    clearLive();
    await writes;
  }
  const files = { tune: tuneOutput, output: values.output, log: values.log };
  if (cancelled) {
    detail(`Cancelled. Best tune saved to ${tuneOutput} (app JSON changes only on Save).`);
    if (live) console.log(`Cancelled. Best tune saved to ${tuneOutput}.`);
  }
  if (state.best) {
    appendFileSync(values.log, `\n${summary(state, files, false)}\n`);
    console.log(`\n${summary(state, files, live)}`);
  }

  async function score(tuning, groupIndex) {
    const jobs = (checkpoint.groups[groupIndex] ??= tracks.flatMap((track, trackIndex) =>
      Array.from({ length: samples }, () => ({ tuning: perturb(tuning), trackIndex })),
    ));
    const runs = await Promise.all(
      jobs.map(async (job) => {
        if (!job.result) {
          job.result = await evaluate(job.tuning, tracks[job.trackIndex]);
          await persist();
        }
        return job.result;
      }),
    );
    const results = tracks.map((_, i) => summarize(runs.slice(i * samples, (i + 1) * samples)));
    const times = results.map(({ lapTime }) => lapTime);
    // A track the start values failed takes its first completed lap as the reference.
    const { reference } = state;
    if (reference)
      times.forEach((time, i) => {
        if (!Number.isFinite(reference[i]) && Number.isFinite(time)) reference[i] = time;
      });
    const cost = results.reduce((sum, result, i) => {
      const finished = samples - result.failures;
      const lap = finished
        ? result.lapTime / (Number.isFinite(reference?.[i]) ? reference[i] : result.lapTime) +
          result.invalidLaps * invalidLapPenalty +
          (result.brakesPerLap + result.liftsPerLap) * pedalChangePenalty
        : 0;
      return sum + (result.failures * failurePenalty + finished * lap) / samples;
    }, 0);
    return { cost, times, results };
  }

  async function save(result, snapshot) {
    const output = path.resolve(values.output);
    tracks.forEach((track, i) => {
      const time = result.times?.[i];
      if (Number.isFinite(time) && !(records[trackName(track)] <= time))
        records[trackName(track)] = time;
    });
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      `${output}.tmp`,
      `${JSON.stringify({ preset: values.preset, tracks, ...result, records }, null, 2)}\n`,
    );
    await rename(`${output}.tmp`, output);
    await writeFile(`${tuneOutput}.tmp`, `${JSON.stringify(result.tuning, null, 2)}\n`);
    await rename(`${tuneOutput}.tmp`, tuneOutput);
    await writeFile(
      `${checkpointOutput}.tmp`,
      `${JSON.stringify(
        snapshot,
        (_key, value) => (value === Infinity ? 'Infinity' : value),
        2,
      )}\n`,
    );
    await rename(`${checkpointOutput}.tmp`, checkpointOutput);
  }
}

function perturb(tuning) {
  return Object.fromEntries(
    Object.entries(tuning).map(([key, value]) => [
      key,
      value * (1 + (Math.random() * 2 - 1) * jitter),
    ]),
  );
}

// Averages a track's runs; lap figures cover only the runs that finished.
function summarize(runs) {
  const finished = runs.filter(({ failure }) => !failure);
  const mean = (key) =>
    finished.length ? finished.reduce((sum, run) => sum + run[key], 0) / finished.length : 0;
  return {
    failures: runs.length - finished.length,
    failure: runs.find(({ failure }) => failure)?.failure ?? null,
    lapTime: finished.length ? mean('lapTime') : Infinity,
    invalidLaps: mean('invalidLaps'),
    brakesPerLap: mean('brakesPerLap'),
    liftsPerLap: mean('liftsPerLap'),
  };
}

function mutate(tuning, steps) {
  const next = { ...tuning };
  for (const [key, [low, high]] of Object.entries(bounds)) {
    const gaussian =
      Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
    next[key] = Math.min(high, Math.max(low, tuning[key] + gaussian * steps[key]));
  }
  return next;
}

function formatLaps(results, previous) {
  return results
    .map(({ failures, failure, lapTime, invalidLaps, brakesPerLap, liftsPerLap }, i) => {
      const name = trackName(tracks[i]);
      if (!Number.isFinite(lapTime)) return `${name} ${failure}`;
      const before = previous?.[i];
      const change =
        before && Number.isFinite(before.lapTime) ? ` (${signed(lapTime - before.lapTime)})` : '';
      const failed = failures ? ` [${failures} ${failure}]` : '';
      const pedals = ` ${brakesPerLap.toFixed(0)}b/${liftsPerLap.toFixed(0)}l`;
      const invalid = invalidLaps ? ` [${invalidLaps.toFixed(1)} invalid]` : '';
      return `${name} ${lapTime.toFixed(2)}s${change}${pedals}${invalid}${failed}`;
    })
    .join(', ');
}

function formatTuning(tuning, parent) {
  return Object.entries(tuning)
    .map(
      ([key, value]) =>
        `${key} ${value.toFixed(2)}${parent ? ` (${signed(value - parent[key])})` : ''}`,
    )
    .join(', ');
}

function formatSteps(steps) {
  return `mutating around best with σ ${Object.entries(steps)
    .map(([key, step]) => `${key} ±${step.toFixed(2)}`)
    .join(', ')}`;
}

export function signed(value, digits = 2) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

// Fastest lap per track name across every session, kept in the result file as `records`.
async function readRecords(output) {
  try {
    return JSON.parse(await readFile(output, 'utf8')).records ?? {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function trackName({ course, reverse }) {
  return `${course}${reverse ? '-rev' : ''}`;
}

function formatDuration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const ansi = { bold: 1, dim: 2, inverse: 7, red: 31, green: 32 };
const paint = (text, style, color) =>
  color && style ? `\x1b[${ansi[style]}m${text}\x1b[0m` : text;

// Cells are `[text, style?]`; the first column is left-aligned, the rest right-aligned.
export function formatTable(columns, rows, color, minimumWidths = {}) {
  const cells = rows.map((row) => columns.map((column) => row[column] ?? ['']));
  const widths = columns.map((column, c) =>
    Math.max(minimumWidths[column] ?? 0, column.length, ...cells.map((row) => row[c][0].length)),
  );
  const line = (row) =>
    row
      .map(([text, style], c) =>
        paint(c ? text.padStart(widths[c]) : text.padEnd(widths[c]), style, color),
      )
      .join('  ');
  return [
    line(columns.map((column) => [column, 'bold'])),
    line(widths.map((width) => ['─'.repeat(width), 'dim'])),
    ...cells.map(line),
  ].join('\n');
}

// Lower is better for lap times and pedal counts.
const improvement = (delta) => (delta < 0 ? 'green' : delta > 0 ? 'red' : undefined);

// `live` adds the latest run per track; the summary compares against the previous best instead.
function trackTable({ baseline, best, reference, latest, previousBest }, color, live) {
  const lap = (time) =>
    time == null ? '–' : Number.isFinite(time) ? `${time.toFixed(2)}s` : 'fail';
  const change = (before, after) => {
    if (!Number.isFinite(before) || !Number.isFinite(after)) return ['–'];
    const delta = after - before;
    return [`${signed(delta)}s ${signed((delta / before) * 100)}%`, improvement(delta)];
  };
  const pedals = (result) => [
    Number.isFinite(result?.lapTime)
      ? `${result.brakesPerLap.toFixed(1)}/${result.liftsPerLap.toFixed(1)}`
      : '–',
  ];
  const rows = tracks.map((track, i) => ({
    Track: [trackName(track)],
    Baseline: [lap(reference?.[i] ?? latest[i]?.lapTime)],
    Best: [lap(best?.times[i])],
    Change: change(reference?.[i], best?.times[i]),
    'Prev Best': [lap(previousBest?.[i]), 'dim'],
    'vs Prev Best': change(previousBest?.[i], best?.times[i]),
    Latest: [latest[i] ? lap(latest[i].lapTime) : '–', 'dim'],
    'Before B/L': pedals(baseline?.results[i]),
    'After B/L': pedals(best?.results[i]),
    Inv: [best ? String(Number(best.results[i].invalidLaps.toFixed(1))) : '–'],
    Fail: [
      best ? String(best.results[i].failures) : '–',
      best?.results[i].failures ? 'red' : undefined,
    ],
  }));
  const columns = [
    'Track',
    'Prev Best',
    'Baseline',
    'Best',
    'Change',
    ...(live ? ['Latest'] : ['vs Prev Best']),
    'Before B/L',
    'After B/L',
    'Inv',
    'Fail',
  ];
  return formatTable(columns, rows, color, { 'Prev Best': 7, Baseline: 7, Best: 7, Latest: 7 });
}

function tuneScore({ baseline, best, reference }, color) {
  const score = (100 * baseline.cost) / best.cost;
  const delta = score - 100;
  const style = improvement(-delta);
  const before = reference.reduce((sum, time) => sum + time, 0);
  const after = best.times.reduce((sum, time) => sum + time, 0);
  const paceDelta = ((before - after) / before) * 100;
  const pace =
    Number.isFinite(before) && Number.isFinite(after) && before > 0
      ? `${Math.abs(paceDelta).toFixed(1)}% ${paceDelta >= 0 ? 'faster' : 'slower'}`
      : 'unavailable (incomplete tracks)';
  const failures = best.results.reduce((sum, result) => sum + result.failures, 0);
  const invalid =
    best.results.reduce((sum, result) => sum + result.invalidLaps, 0) / best.results.length;
  return [
    `  ${paint('Tune score', 'bold', color)}  ${paint(score.toFixed(1), style ?? 'bold', color)}  ${paint(`(${signed(delta, 1)}% score improvement)`, style, color)}`,
    `  Pace: ${pace} · Failed runs: ${failures} · Avg invalid laps/run: ${invalid.toFixed(1)}`,
  ].join('\n');
}

// The live view while running (`live`), and its plain-text snapshot for the log.
function dashboard(state, live) {
  const { generation, generations, progress, best } = state;
  const filled = progress.total ? Math.round((progress.done / progress.total) * 20) : 0;
  const status = [
    paint(state.preset, 'bold', live),
    generation ? `generation ${generation}/${generations}` : 'baseline',
    `${'█'.repeat(filled)}${'░'.repeat(20 - filled)} ${progress.done}/${progress.total} runs`,
    formatDuration(Date.now() - state.startedAt),
  ].join('  ');
  const controls = live
    ? '\n\n  ' +
      ['🛑 Cancel', '💾 Save']
        .map(
          (label, i) =>
            `[${paint(` ${label} `, state.selectedAction === i ? 'inverse' : 'dim', live)}]`,
        )
        .join('  ') +
      '\n\n'
    : '';
  const message = state.message ? `\n${state.message}` : '';
  if (!best) return `${status}\n\n${trackTable(state, live, live)}${controls}${message}`;
  return [
    status,
    '',
    trackTable(state, live, live),
    '',
    tuneScore(state, live),
    ...(live ? [controls] : []),
    ...(state.message ? [state.message] : []),
  ].join('\n');
}

function summary(state, files, color) {
  const { baseline, best } = state;
  const tuningRows = Object.keys(bounds).map((key) => {
    const change = best.tuning[key] - baseline.tuning[key];
    return {
      Parameter: [key],
      Start: [baseline.tuning[key].toFixed(3)],
      Final: [best.tuning[key].toFixed(3)],
      Change: [signed(change, 3), change ? 'bold' : 'dim'],
    };
  });
  return [
    paint(
      `${state.cancelled ? 'Stopped' : 'Finished'} ${state.preset}: ${state.generation}/${state.generations} generations, ${state.runs} runs, ` +
        formatDuration(Date.now() - state.startedAt),
      'bold',
      color,
    ),
    '',
    trackTable(state, color, false),
    '',
    tuneScore(state, color),
    '',
    formatTable(['Parameter', 'Start', 'Final', 'Change'], tuningRows, color),
    '',
    `Tuning (apply with npm run apply:bot): ${files.tune}`,
    `Full results: ${files.output}`,
    `Log: ${files.log}`,
  ].join('\n');
}

async function importTuning() {
  const server = await viteServer();
  try {
    return await server.ssrLoadModule('/src/race-bot.ts');
  } finally {
    await server.close();
  }
}

export function viteServer() {
  return createServer({
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
    logLevel: 'error',
  });
}

async function worker() {
  const send = (result) => {
    if (!process.connected) return;
    process.send(result, (error) => {
      // The parent can close IPC while a synchronous physics run is finishing.
      if (error && error.code !== 'EPIPE' && error.code !== 'ERR_IPC_CHANNEL_CLOSED') {
        console.error('Could not send training result:', error);
        process.exitCode = 1;
      }
    });
  };
  const skill = Number(process.argv[3]);
  const preset = process.argv[4];
  const server = await viteServer();
  const { courses } = await server.ssrLoadModule('/src/courses.ts');
  const { CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts');
  const { createConfigurationState } = await server.ssrLoadModule('/src/configuration-state.ts');
  const { trainRaceBot } = await server.ssrLoadModule('/src/bot-training.ts');
  const { raceBotTunings, raceBotConfiguration } = await server.ssrLoadModule('/src/race-bot.ts');
  const geometry = await loadTrainingCarGeometry(server);
  const configuration = raceBotConfiguration(
    {
      driveMode: 'grip',
      profiles: createConfigurationState().getState().profiles,
      coneMode: 'off',
    },
    preset,
  );
  const Ammo = await AmmoFactory.call({});
  const terrains = new Map();
  process.on('message', ({ tuning, track }) => {
    try {
      Object.assign(raceBotTunings[preset], tuning);
      const definition = {
        ...courses.find(({ id }) => id === track.course),
        reverse: track.reverse,
      };
      const key = `${track.course}:${track.reverse}`;
      if (!terrains.has(key)) terrains.set(key, new CourseTerrain(definition, false));
      const [run] = trainRaceBot(
        Ammo,
        definition,
        terrains.get(key),
        geometry,
        configuration,
        { skill, aggression: 0.5, learning: false, preset },
        1,
        undefined,
        { maxSeconds: track.maxSeconds ?? 150, laps: track.laps ?? 3 },
      ).runs;
      const times = run.laps.map(({ time }) => time);
      send({
        failure: run.completed ? null : run.failure,
        lapTime: times.length ? Math.min(...times) : Infinity,
        invalidLaps: run.laps.filter(({ valid }) => !valid).length,
        // Includes the approach lap, so these slightly overstate per-lap counts.
        brakesPerLap: run.metrics.brakeApplications / Math.max(1, run.laps.length),
        liftsPerLap: run.metrics.throttleLifts / Math.max(1, run.laps.length),
      });
    } catch (error) {
      send({ error: String(error?.stack ?? error) });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--worker') await worker();
  else await main();
}
