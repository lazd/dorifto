#!/usr/bin/env node
// Searches the race bot's driver constants (`raceBotTunings[preset]`) for the fastest valid laps across
// several courses, using a (1+λ) evolution strategy evaluated in parallel child processes.
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import AmmoFactory from 'ammojs-typed';
import { loadTrainingCarGeometry } from './bot-assets.mjs';

const bounds = {
  corneringGrip: [8, 24],
  brakingLimit: [5, 13],
  smallSpeedDrop: [0, 15],
  brakeThreshold: [0, 4],
  lookaheadTime: [0.1, 0.7],
  edgeMargin: [0, 1.5],
  countersteerSlip: [0.03, 0.4],
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

if (process.argv[2] === '--worker') await worker();
else await main();

async function main() {
  const { values } = parseArgs({
    options: {
      generations: { type: 'string', default: '12' },
      workers: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
      skill: { type: 'string', default: '1' },
      preset: { type: 'string', default: 'grip-fast' },
      output: { type: 'string' },
      resume: { type: 'boolean', default: false },
    },
  });
  values.output ??= `.bot-training/race-tuning-${values.preset}.json`;
  const generations = Number(values.generations);
  const workerCount = Number(values.workers);
  const pool = Array.from({ length: workerCount }, () =>
    fork(fileURLToPath(import.meta.url), ['--worker', values.skill, values.preset], {
      stdio: 'inherit',
    }),
  );
  const idle = [...pool];
  const waiting = [];
  const evaluate = (tuning, track) =>
    new Promise((resolve, reject) => {
      const run = (child) => {
        child.once('message', (result) => {
          const next = waiting.shift();
          if (next) next(child);
          else idle.push(child);
          if (result.error) reject(new Error(result.error));
          else resolve(result);
        });
        child.send({ tuning, track });
      };
      const child = idle.pop();
      if (child) run(child);
      else waiting.push(run);
    });

  const { raceBotTunings } = await importTuning();
  if (!raceBotTunings[values.preset]) throw new Error(`Unknown race bot preset: ${values.preset}`);
  let reference;
  const start = values.resume
    ? JSON.parse(await readFile(path.resolve(values.output), 'utf8')).tuning
    : raceBotTunings[values.preset];
  let best = { tuning: { ...start } };
  best = { ...best, ...(await score(best.tuning)) };
  reference = [...best.times];
  // Step sizes start at a sixth of each range and adapt with the 1/5th success rule.
  const steps = Object.fromEntries(
    Object.entries(bounds).map(([key, [low, high]]) => [key, (high - low) / 6]),
  );
  console.log(`start: cost ${best.cost.toFixed(3)} | ${formatLaps(best.results)}`);
  console.log(`  ${formatTuning(best.tuning)}`);
  for (let generation = 1; generation <= generations; generation++) {
    console.log(`\ngeneration ${generation}/${generations}: next ${formatSteps(steps)}`);
    const parent = best;
    const candidates = Array.from({ length: workerCount }, () => mutate(parent.tuning, steps));
    const scored = await Promise.all(
      candidates.map(async (tuning, i) => {
        const result = { tuning, ...(await score(tuning)) };
        const delta = result.cost - parent.cost;
        console.log(
          `  #${String(i + 1).padStart(2)} ${delta < 0 ? '+' : ' '} cost ${result.cost.toFixed(3)} ` +
            `(${delta >= 0 ? '+' : ''}${delta.toFixed(3)}) | ${formatLaps(result.results)}\n` +
            `       ${formatTuning(tuning, parent.tuning)}`,
        );
        return result;
      }),
    );
    const winner = scored.reduce((a, b) => (b.cost < a.cost ? b : a));
    const successes = scored.filter(({ cost }) => cost < parent.cost).length;
    const factor = successes / scored.length > 0.2 ? 1.3 : 0.8;
    for (const key of Object.keys(steps)) steps[key] *= factor;
    if (winner.cost < parent.cost) {
      best = winner;
      console.log(
        `improved: cost ${parent.cost.toFixed(3)} -> ${best.cost.toFixed(3)} | ${formatLaps(best.results, parent.results)}\n` +
          `  ${formatTuning(best.tuning, parent.tuning)}`,
      );
    } else {
      console.log(`no improvement: best remains ${parent.cost.toFixed(3)}`);
    }
    console.log(
      `  ${successes}/${scored.length} candidates beat the parent; ` +
        `${factor > 1 ? 'widening' : 'narrowing'} the search (steps x${factor})`,
    );
    await save(best);
  }
  console.log(`\nbest: cost ${best.cost.toFixed(3)} | ${formatLaps(best.results)}`);
  console.log(`  ${formatTuning(best.tuning)}`);
  for (const child of pool) child.kill();

  async function score(tuning) {
    const results = await Promise.all(tracks.map((track) => evaluate(tuning, track)));
    const times = results.map(({ lapTime }) => lapTime);
    // A track the start values failed takes its first completed lap as the reference.
    if (reference)
      times.forEach((time, i) => {
        if (!Number.isFinite(reference[i]) && Number.isFinite(time)) reference[i] = time;
      });
    const cost = results.reduce(
      (sum, result, i) =>
        sum +
        (result.failure
          ? failurePenalty
          : result.lapTime / (Number.isFinite(reference?.[i]) ? reference[i] : result.lapTime) +
            result.invalidLaps * invalidLapPenalty +
            (result.brakesPerLap + result.liftsPerLap) * pedalChangePenalty),
      0,
    );
    return { cost, times, results };
  }

  async function save(result) {
    const output = path.resolve(values.output);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output,
      `${JSON.stringify({ preset: values.preset, tracks, ...result }, null, 2)}\n`,
    );
  }
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
    .map(({ failure, lapTime, invalidLaps, brakesPerLap, liftsPerLap }, i) => {
      const name = `${tracks[i].course}${tracks[i].reverse ? '-rev' : ''}`;
      if (failure) return `${name} ${failure}`;
      const before = previous?.[i];
      const change = before && !before.failure ? ` (${signed(lapTime - before.lapTime)})` : '';
      const pedals = ` ${brakesPerLap.toFixed(0)}b/${liftsPerLap.toFixed(0)}l`;
      return `${name} ${lapTime.toFixed(2)}s${change}${pedals}${invalidLaps ? ` [${invalidLaps} invalid]` : ''}`;
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

function signed(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

async function importTuning() {
  const server = await viteServer();
  try {
    return await server.ssrLoadModule('/src/race-bot.ts');
  } finally {
    await server.close();
  }
}

function viteServer() {
  return createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
    logLevel: 'error',
  });
}

async function worker() {
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
      process.send({
        failure: run.completed ? null : run.failure,
        lapTime: times.length ? Math.min(...times) : Infinity,
        invalidLaps: run.laps.filter(({ valid }) => !valid).length,
        // Includes the approach lap, so these slightly overstate per-lap counts.
        brakesPerLap: run.metrics.brakeApplications / Math.max(1, run.laps.length),
        liftsPerLap: run.metrics.throttleLifts / Math.max(1, run.laps.length),
      });
    } catch (error) {
      process.send({ error: String(error?.stack ?? error) });
    }
  });
}
