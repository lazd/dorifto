// Temporary: trace one bot lap on a course for comparison with a recorded human lap.
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import AmmoFactory from 'ammojs-typed';
import { loadTrainingCarGeometry } from './bot-assets.mjs';

const [course = 'hillside', output = '/tmp/bot-trace.json', tuningJson] = process.argv.slice(2);
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
const { courses } = await server.ssrLoadModule('/src/courses.ts');
const { CourseTerrain } = await server.ssrLoadModule('/src/terrain.ts');
const { createConfigurationState } = await server.ssrLoadModule('/src/configuration-state.ts');
const { trainRaceBot } = await server.ssrLoadModule('/src/bot-training.ts');
const { raceBotTuning, raceBotConfiguration } = await server.ssrLoadModule('/src/race-bot.ts');
if (tuningJson) Object.assign(raceBotTuning, JSON.parse(tuningJson));
const geometry = await loadTrainingCarGeometry(server);
const configuration = raceBotConfiguration({
  driveMode: 'grip',
  profiles: createConfigurationState().getState().profiles,
  coneMode: 'off',
});
const Ammo = await AmmoFactory.call({});
const definition = { ...courses.find(({ id }) => id === course), reverse: false };
const rows = [];
let t = 0;
const result = trainRaceBot(
  Ammo,
  definition,
  new CourseTerrain(definition, false),
  geometry,
  configuration,
  { skill: 1, aggression: 0.5, learning: false },
  1,
  undefined,
  {
    maxSeconds: 200,
    laps: Number(process.env.LAPS ?? 3),
    onStep: (state, bot) => {
      t += 1 / 120;
      const m = bot.metrics;
      rows.push([
        t,
        state.x,
        state.z,
        state.speed,
        bot.controls.throttle,
        bot.controls.brake,
        state.slipAngle,
        m.targetSpeed,
        m.lateralError,
        m.progress,
        bot.controls.steer,
        state.yawRate,
      ]);
    },
  },
);
const run = result.runs[0];
console.log(
  run.failure,
  run.laps.map((l) => l.time.toFixed(2)).join(' '),
  run.metrics.brakeApplications,
  run.metrics.throttleLifts,
);
writeFileSync(output, JSON.stringify({ laps: run.laps, rows }));
await server.close();
