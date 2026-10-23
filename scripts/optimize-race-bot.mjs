#!/usr/bin/env node
// Searches the race bot's driver constants (`raceBotTuning`) for the fastest valid laps across
// several courses, using a (1+λ) evolution strategy evaluated in parallel child processes.
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import AmmoFactory from 'ammojs-typed';
import { loadTrainingCarGeometry } from './bot-assets.mjs';

const bounds = {
  corneringGrip: [8, 24],
  brakingLimit: [5, 13],
  liftDeceleration: [1, 8],
  smallSpeedDrop: [0, 15],
  lookaheadTime: [0.1, 0.7],
  edgeMargin: [0, 1.5],
};
const tracks = [
  { course: 'hillside', reverse: false },
  { course: 'hillside', reverse: true },
  { course: 'sweeper', reverse: false },
  { course: 'hilly-drift', reverse: false },
];
const failurePenalty = 2;
const invalidLapPenalty = 0.05;

if (process.argv[2] === '--worker') await worker();
else await main();

async function main() {
  const { values } = parseArgs({
    options: {
      generations: { type: 'string', default: '12' },
      workers: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
      skill: { type: 'string', default: '1' },
      output: { type: 'string', default: '.bot-training/race-tuning.json' },
    },
  });
  const generations = Number(values.generations);
  const workerCount = Number(values.workers);
  const pool = Array.from({ length: workerCount }, () =>
    fork(fileURLToPath(import.meta.url), ['--worker', values.skill], { stdio: 'inherit' }),
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

  const { raceBotTuning } = await importTuning();
  let reference;
  let best = { tuning: { ...raceBotTuning } };
  best = { ...best, ...(await score(best.tuning)) };
  reference = best.times;
  // Step sizes start at a sixth of each range and adapt with the 1/5th success rule.
  const steps = Object.fromEntries(
    Object.entries(bounds).map(([key, [low, high]]) => [key, (high - low) / 6]),
  );
  report('start', best);
  for (let generation = 1; generation <= generations; generation++) {
    const candidates = Array.from({ length: workerCount }, () => mutate(best.tuning, steps));
    const scored = await Promise.all(
      candidates.map(async (tuning) => ({ tuning, ...(await score(tuning)) })),
    );
    const winner = scored.reduce((a, b) => (b.cost < a.cost ? b : a));
    const successes = scored.filter(({ cost }) => cost < best.cost).length;
    const factor = successes / scored.length > 0.2 ? 1.3 : 0.8;
    for (const key of Object.keys(steps)) steps[key] *= factor;
    if (winner.cost < best.cost) best = winner;
    report(`generation ${generation}`, best);
    await save(best);
  }
  for (const child of pool) child.kill();

  async function score(tuning) {
    const results = await Promise.all(tracks.map((track) => evaluate(tuning, track)));
    const times = results.map(({ lapTime }) => lapTime);
    const cost = results.reduce(
      (sum, result, i) =>
        sum +
        (result.failure
          ? failurePenalty
          : result.lapTime / (Number.isFinite(reference?.[i]) ? reference[i] : result.lapTime) +
            result.invalidLaps * invalidLapPenalty),
      0,
    );
    return { cost, times, results };
  }

  async function save(result) {
    const output = path.resolve(values.output);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify({ tracks, ...result }, null, 2)}\n`);
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

function report(label, { cost, tuning, results }) {
  const laps = results
    .map(
      ({ failure, lapTime, invalidLaps }, i) =>
        `${tracks[i].course}${tracks[i].reverse ? '-rev' : ''} ${
          failure ?? `${lapTime.toFixed(2)}s${invalidLaps ? ` (${invalidLaps} invalid)` : ''}`
        }`,
    )
    .join(', ');
  const values = Object.entries(tuning)
    .map(([key, value]) => `${key} ${value.toFixed(2)}`)
    .join(', ');
  console.log(`${label}: cost ${cost.toFixed(3)} | ${laps}\n  ${values}`);
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
  const server = await viteServer();
  const { courses } = await server.ssrLoadModule('/src/courses.ts');
  const { CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts');
  const { createConfigurationState } = await server.ssrLoadModule('/src/configuration-state.ts');
  const { trainRaceBot } = await server.ssrLoadModule('/src/bot-training.ts');
  const { raceBotTuning, raceBotConfiguration } = await server.ssrLoadModule('/src/race-bot.ts');
  const geometry = await loadTrainingCarGeometry(server);
  const configuration = raceBotConfiguration({
    driveMode: 'grip',
    profiles: createConfigurationState().getState().profiles,
    coneMode: 'off',
  });
  const Ammo = await AmmoFactory.call({});
  const terrains = new Map();
  process.on('message', ({ tuning, track }) => {
    try {
      Object.assign(raceBotTuning, tuning);
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
        { skill, aggression: 0.5, learning: false },
        1,
        undefined,
        150,
      ).runs;
      const times = run.laps.map(({ time }) => time);
      process.send({
        failure: run.completed ? null : run.failure,
        lapTime: times.length ? Math.min(...times) : Infinity,
        invalidLaps: run.laps.filter(({ valid }) => !valid).length,
      });
    } catch (error) {
      process.send({ error: String(error?.stack ?? error) });
    }
  });
}
