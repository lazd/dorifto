#!/usr/bin/env node
// Searches the drift bot's controller constants (`driftBotTunings[preset]`) for long, steady,
// well-linked drifts that stay off the dirt and never spin, using the same (1+λ) evolution
// strategy as the race trainer. Scoring lives in `src/drift-training.ts` (`driftScore`).
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { appendFileSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { emitKeypressEvents } from 'node:readline';
import AmmoFactory from 'ammojs-typed';
import { loadTrainingCarGeometry } from './bot-assets.mjs';
import { applyBotTuning } from './apply-bot-tuning.mjs';
import { formatTable, mutate, signed, viteServer } from './optimize-race-bot.mjs';

// Every range reaches the paper's pure controller: zero angle term, zero handbrake and speed
// coupling, and its λ_des of 0.3.
const bounds = {
  rearSlipRatio: [0.1, 0.8],
  speedSlipGain: [0, 0.2],
  slipGain: [0.5, 8],
  slipIntegral: [0, 10],
  yawGain: [1, 12],
  lookaheadTime: [0.2, 1.2],
  previewTime: [0.5, 2],
  driftCurvature: [0.004, 0.03],
  driftGrip: [4, 16],
  brakingLimit: [3, 10],
  exitThrottle: [0, 0.6],
  driftAngle: [0.3, 1],
  angleGain: [0, 3],
  handbrakeSlip: [0, 0.6],
};
const tracks = ['hillside', 'sweeper'];
// Values are nudged by up to this fraction per run so the tune survives small differences.
const jitter = 0.01;
const degrees = (radians) => (radians * 180) / Math.PI;

async function main() {
  const { values } = parseArgs({
    options: {
      generations: { type: 'string', default: '20' },
      workers: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
      preset: { type: 'string', default: 'drift-default' },
      samples: { type: 'string', default: '2' },
      laps: { type: 'string', default: '2' },
    },
  });
  const { preset } = values;
  const output = `training-results/drift-tuning-${preset}.json`;
  const tuneOutput = output.replace(/\.json$/, '-tune.json');
  const log = `.bot-training/optimize-${preset}.log`;
  const generations = Number(values.generations);
  const workerCount = Number(values.workers);
  const samples = Number(values.samples);
  const laps = Number(values.laps);

  const server = await viteServer();
  const { driftBotTunings } = await server.ssrLoadModule('/src/drift-bot.ts');
  await server.close();
  if (!driftBotTunings[preset]) throw new Error(`Unknown drift bot preset: ${preset}`);

  const live = process.stdout.isTTY;
  const state = {
    preset,
    generation: 0,
    generations,
    startedAt: Date.now(),
    progress: { done: 0, total: 0 },
    runs: 0,
    latest: [],
    message: '',
  };
  await mkdir(path.dirname(log), { recursive: true });
  await writeFile(log, '');
  const detail = (text) => {
    appendFileSync(log, `${text}\n`);
    if (!live) console.log(text);
  };
  let drawn = 0;
  const draw = () => {
    const text = dashboard(state, true);
    process.stdout.write(`${drawn ? `\x1b[${drawn}A` : ''}\x1b[J${text}\n`);
    drawn = text.split('\n').length;
  };

  let cancelled = false;
  const cancellation = new Error('Training cancelled');
  const pending = new Set();
  const pool = Array.from({ length: workerCount }, () =>
    fork(fileURLToPath(import.meta.url), ['--worker', preset, String(laps)], { stdio: 'inherit' }),
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
  let writes = Promise.resolve();
  const persist = (apply = false) => {
    const best = structuredClone(state.best);
    writes = writes.then(async () => {
      await mkdir(path.dirname(output), { recursive: true });
      await writeAtomic(output, { preset, tracks, ...best });
      await writeAtomic(tuneOutput, best.tuning);
      if (apply) await applyBotTuning(preset, best.tuning);
    });
    return writes;
  };
  const onKey = (_text, key) => {
    if (key.name === 'c' || key.name === 'escape' || (key.ctrl && key.name === 'c')) cancel();
    if (key.name === 's' && state.best && !cancelled) {
      state.message = 'Saving tune to app…';
      void persist(true).then(
        () => detail((state.message = `Saved best tune to src/drift-bot-tunings.json`)),
        (error) => detail((state.message = `Save failed: ${error.message}`)),
      );
    }
  };
  const interactive = live && process.stdin.isTTY;
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
          if (result.error) return reject(new Error(result.error));
          state.progress.done++;
          state.runs++;
          state.latest[tracks.indexOf(track)] = summarize([result]);
          resolve(result);
        });
        child.send({ tuning, track });
      };
      const child = idle.pop();
      if (child) run(child);
      else waiting.push(run);
    });
  const score = async (tuning) => {
    const runs = await Promise.all(
      tracks.flatMap((track) =>
        Array.from({ length: samples }, () => evaluate(perturb(tuning), track)),
      ),
    );
    const results = tracks.map((_, i) => summarize(runs.slice(i * samples, (i + 1) * samples)));
    return { score: mean(results.map((result) => result.score)), results };
  };

  if (live) process.stdout.write('\x1b[2J\x1b[H');
  const timer = live ? setInterval(draw, 250) : undefined;
  const steps = Object.fromEntries(
    Object.entries(bounds).map(([key, [low, high]]) => [key, (high - low) / 6]),
  );
  try {
    state.progress = { done: 0, total: tracks.length * samples };
    const start = { ...driftBotTunings[preset] };
    state.baseline = { tuning: start, ...(await score(start)), evaluations: 1 };
    state.best = state.baseline;
    detail(`start: score ${state.best.score.toFixed(1)} | ${formatRuns(state.best.results)}`);
    await persist();
    for (let generation = 1; generation <= generations; generation++) {
      state.generation = generation;
      const parent = state.best;
      const candidates = Array.from({ length: workerCount }, () =>
        mutate(parent.tuning, steps, bounds),
      );
      state.progress = { done: 0, total: (candidates.length + 1) * tracks.length * samples };
      detail(`\ngeneration ${generation}/${generations}`);
      // Re-score the parent too, so one lucky evaluation can't hold the lead forever.
      const [again, ...scored] = await Promise.all([
        score(parent.tuning),
        ...candidates.map(async (tuning, i) => {
          const result = { tuning, ...(await score(tuning)) };
          detail(
            `  #${String(i + 1).padStart(2)} score ${result.score.toFixed(1)} ` +
              `(${signed(result.score - parent.score, 1)}) | ${formatRuns(result.results)}`,
          );
          return result;
        }),
      ]);
      parent.score = (parent.score * parent.evaluations + again.score) / (parent.evaluations + 1);
      parent.evaluations++;
      const winner = scored.reduce((a, b) => (b.score > a.score ? b : a));
      const successes = scored.filter((result) => result.score > parent.score).length;
      const factor = successes / scored.length > 0.2 ? 1.3 : 0.8;
      for (const key of Object.keys(steps)) steps[key] *= factor;
      if (winner.score > parent.score) {
        state.best = { ...winner, evaluations: 1 };
        detail(
          `improved: ${parent.score.toFixed(1)} -> ${winner.score.toFixed(1)}\n` +
            `  ${formatTuning(winner.tuning, parent.tuning)}`,
        );
        await persist();
      } else detail(`no improvement: best remains ${parent.score.toFixed(1)}`);
      detail(`  ${successes}/${scored.length} beat the parent; steps x${factor}`);
    }
  } catch (error) {
    if (error !== cancellation) throw error;
  } finally {
    clearInterval(timer);
    if (interactive) {
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
    for (const child of pool) child.kill();
    await Promise.all(workerExits);
    if (drawn) process.stdout.write(`\x1b[${drawn}A\x1b[J`);
    if (state.best) await persist();
    await writes;
  }
  if (!state.best) return;
  const text = (color) =>
    [
      dashboard(state, color),
      '',
      tuningTable(state, color),
      '',
      `Tuning (apply with npm run apply:bot -- ${preset}): ${tuneOutput}`,
      `Full results: ${output}`,
      `Log: ${log}`,
    ].join('\n');
  appendFileSync(log, `\n${text(false)}\n`);
  console.log(text(live));
}

async function writeAtomic(file, data) {
  await writeFile(`${file}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  await rename(`${file}.tmp`, file);
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function perturb(tuning) {
  return Object.fromEntries(
    Object.entries(tuning).map(([key, value]) => [
      key,
      value * (1 + (Math.random() * 2 - 1) * jitter),
    ]),
  );
}

// Averages a track's runs; angles in degrees, counts and dirt per lap driven.
function summarize(runs) {
  const average = (pick) => mean(runs.map(pick));
  const lapsDriven = (run) => Math.max(run.distance / run.lapLength, 0.25);
  return {
    score: average((run) => run.score),
    failures: runs.filter((run) => run.failure).length,
    failure: runs.find((run) => run.failure)?.failure ?? null,
    laps: average((run) => run.distance / run.lapLength),
    coverage: average((run) => run.driftDistance / Math.max(run.distance, 1)),
    angle: average((run) => degrees(run.meanAngle)),
    drifts: average((run) => run.drifts / lapsDriven(run)),
    transitions: average((run) => run.transitions / lapsDriven(run)),
    dirt: average((run) => run.dirtSeconds / lapsDriven(run)),
    yawError: average((run) => run.yawError),
  };
}

function formatRuns(results) {
  return results
    .map(
      (result, i) =>
        `${tracks[i]} ${result.score.toFixed(0)} ${(result.coverage * 100).toFixed(0)}% ` +
        `${result.angle.toFixed(0)}° ${result.transitions.toFixed(1)}t ${result.dirt.toFixed(1)}s` +
        (result.failures ? ` [${result.failures} ${result.failure}]` : ''),
    )
    .join(' | ');
}

function formatTuning(tuning, previous) {
  return Object.keys(bounds)
    .filter((key) => !previous || Math.abs(tuning[key] - previous[key]) > 1e-3)
    .map((key) => `${key} ${tuning[key].toFixed(3)}`)
    .join(', ');
}

function formatDuration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// One row per track and run (start, best, latest), so the trend is visible at a glance.
function trackTable(state, color) {
  const rows = tracks.flatMap((track, i) =>
    [
      ['start', state.baseline?.results[i], 'dim'],
      ['best', state.best?.results[i]],
      ['latest', state.latest[i], 'dim'],
    ]
      .filter(([, result]) => result)
      .map(([label, result, style]) => ({
        Track: [`${track} ${label}`, style],
        Score: [result.score.toFixed(1), label === 'best' ? 'bold' : style],
        Laps: [result.laps.toFixed(2), style],
        'Drift %': [(result.coverage * 100).toFixed(0), style],
        Angle: [`${result.angle.toFixed(0)}°`, style],
        'Drifts/lap': [result.drifts.toFixed(1), style],
        'Links/lap': [result.transitions.toFixed(1), style],
        'Dirt s/lap': [result.dirt.toFixed(1), result.dirt > 0.5 ? 'red' : style],
        'Yaw err': [result.yawError.toFixed(2), style],
        Fail: [
          result.failures ? `${result.failures} ${result.failure}` : '0',
          result.failures ? 'red' : 'green',
        ],
      })),
  );
  return formatTable(
    [
      'Track',
      'Score',
      'Laps',
      'Drift %',
      'Angle',
      'Drifts/lap',
      'Links/lap',
      'Dirt s/lap',
      'Yaw err',
      'Fail',
    ],
    rows,
    color,
  );
}

function tuningTable({ baseline, best }, color) {
  const rows = Object.keys(bounds).map((key) => {
    const change = best.tuning[key] - baseline.tuning[key];
    return {
      Parameter: [key],
      Start: [baseline.tuning[key].toFixed(3)],
      Best: [best.tuning[key].toFixed(3)],
      Change: [signed(change, 3), Math.abs(change) > 1e-3 ? 'bold' : 'dim'],
    };
  });
  return formatTable(['Parameter', 'Start', 'Best', 'Change'], rows, color);
}

function dashboard(state, color) {
  const { generation, generations, progress, baseline, best } = state;
  const filled = progress.total ? Math.round((progress.done / progress.total) * 20) : 0;
  const status = [
    state.preset,
    generation ? `generation ${generation}/${generations}` : 'baseline',
    `${'█'.repeat(filled)}${'░'.repeat(20 - filled)} ${progress.done}/${progress.total} runs`,
    `${state.runs} total`,
    formatDuration(Date.now() - state.startedAt),
  ].join('  ');
  const gain =
    baseline && best
      ? `Score ${best.score.toFixed(1)} (start ${baseline.score.toFixed(1)}, ${signed(best.score - baseline.score, 1)})`
      : '';
  return [
    status,
    '',
    trackTable(state, color),
    '',
    gain,
    color && process.stdin.isTTY ? '\n[s] save best to app   [c] cancel' : '',
    state.message,
  ]
    .filter((line, i) => i < 4 || line)
    .join('\n');
}

async function worker() {
  const send = (result) => {
    if (process.connected) process.send(result, () => {});
  };
  const preset = process.argv[3];
  const laps = Number(process.argv[4]);
  const server = await viteServer();
  const { courses } = await server.ssrLoadModule('/src/courses.ts');
  const { CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts');
  const { createConfigurationState } = await server.ssrLoadModule('/src/configuration-state.ts');
  const { raceBotConfiguration } = await server.ssrLoadModule('/src/race-bot.ts');
  const { runDriftBot, driftScore } = await server.ssrLoadModule('/src/drift-training.ts');
  const geometry = await loadTrainingCarGeometry(server);
  const configuration = raceBotConfiguration(
    {
      driveMode: 'drift',
      profiles: createConfigurationState().getState().profiles,
      coneMode: 'off',
    },
    preset,
  );
  const Ammo = await AmmoFactory.call({});
  const terrains = new Map();
  process.on('message', ({ tuning, track }) => {
    try {
      const definition = { ...courses.find(({ id }) => id === track), reverse: false };
      if (!terrains.has(track)) terrains.set(track, new CourseTerrain(definition, false));
      const run = runDriftBot(
        Ammo,
        definition,
        terrains.get(track),
        geometry,
        configuration,
        tuning,
        { laps },
      );
      send({ ...run, score: driftScore(run) });
    } catch (error) {
      send({ error: String(error?.stack ?? error) });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--worker') await worker();
  else await main();
}
