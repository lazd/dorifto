#!/usr/bin/env node
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';
import AmmoFactory from 'ammojs-typed';
import { loadTrainingCarGeometry } from './bot-assets.mjs';

const { values } = parseArgs({
  options: {
    course: { type: 'string' },
    runs: { type: 'string', default: '3' },
    skill: { type: 'string', default: '0.8' },
    preset: { type: 'string', default: 'grip-fast' },
    aggression: { type: 'string', default: '0.4' },
    frozen: { type: 'boolean', default: false },
    reverse: { type: 'boolean', default: false },
    experience: { type: 'string' },
    output: { type: 'string', default: '.bot-training/race.json' },
  },
});
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: 'custom',
});

try {
  const { courses, racetracks } = await server.ssrLoadModule('/src/courses.ts');
  const { CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts');
  const { createConfigurationState } = await server.ssrLoadModule('/src/configuration-state.ts');
  const { trainRaceBot } = await server.ssrLoadModule('/src/bot-training.ts');
  const { trainingCourses, raceBotConfiguration } = await server.ssrLoadModule('/src/race-bot.ts');
  const courseId = values.course ?? trainingCourses.race;
  const course = [...courses, ...racetracks].find(({ id }) => id === courseId);
  if (!course) throw new Error(`Unknown training course: ${courseId}`);
  const definition = { ...course, reverse: values.reverse };
  const geometry = await loadTrainingCarGeometry(server);
  const state = createConfigurationState().getState();
  const configuration = raceBotConfiguration(
    {
      driveMode: 'grip',
      profiles: state.profiles,
      coneMode: 'off',
    },
    values.preset,
  );
  const terrain = new CourseTerrain(definition, false);
  const options = {
    skill: Number(values.skill),
    aggression: Number(values.aggression),
    learning: !values.frozen,
    preset: values.preset,
  };
  const saved = values.experience
    ? JSON.parse(await readFile(values.experience, 'utf8')).experience
    : undefined;
  if (values.experience && !saved) throw new Error('Experience file has no experience record');
  const Ammo = await AmmoFactory.call({});
  const report = trainRaceBot(
    Ammo,
    definition,
    terrain,
    geometry,
    configuration,
    options,
    Number(values.runs),
    saved,
  );
  const output = path.resolve(values.output);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(`${output}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  await rename(`${output}.tmp`, output);
  for (const run of report.runs) {
    console.log(
      `Run ${run.run}: ${run.completed ? 'completed' : run.failure}; laps: ${
        run.laps.map((lap) => `${lap.time.toFixed(3)}s${lap.valid ? '' : ' INVALID'}`).join(', ') ||
        'none'
      }; off-track ${run.metrics.offTrackSeconds.toFixed(2)}s; max slip ${((run.metrics.maxSlip * 180) / Math.PI).toFixed(1)}deg`,
    );
  }
  console.log(`Report and experience: ${output}`);
  if (report.runs.some((run) => !run.completed || run.laps.some((lap) => !lap.valid)))
    process.exitCode = 1;
} finally {
  await server.close();
}
