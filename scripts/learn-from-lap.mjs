#!/usr/bin/env node
// Compares a human record lap with the bot on the same course, suggests driver tuning values for
// what the recording can measure, and checks each suggestion with a simulated lap.
// Usage: npm run learn:bot -- <localStorage.json> [--course id] [--reverse] [--preset name] [--apply]
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import AmmoFactory from 'ammojs-typed';
import { applyBotTuning } from './apply-bot-tuning.mjs';
import { loadTrainingCarGeometry } from './bot-assets.mjs';
import { bounds, formatTable, signed, viteServer } from './optimize-race-bot.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    course: { type: 'string' },
    reverse: { type: 'boolean', default: false },
    preset: { type: 'string', default: 'grip-default' },
    apply: { type: 'boolean', default: false },
  },
});
if (positionals.length !== 1)
  throw new Error('Usage: npm run learn:bot -- <localStorage.json> [--course id] [--reverse]');

const storage = JSON.parse(await readFile(positionals[0], 'utf8'));
const prefix = 'dorifto.record.v1:';
const records = Object.keys(storage).filter((key) => key.startsWith(prefix));
const key =
  records.length === 1 && !values.course
    ? records[0]
    : records.find((key) => {
        const [, course, , direction] = key.split(':');
        return course === values.course && direction === (values.reverse ? 'reverse' : 'forward');
      });
if (!key) {
  const found = records.map((key) =>
    key
      .split(':')
      .filter((_, i) => i === 1 || i === 3)
      .join(' '),
  );
  throw new Error(
    `Pick a record lap with --course [--reverse]: ${found.join(', ') || 'none found'}`,
  );
}
const [, courseId, , direction] = key.split(':');
const { preset } = values;
const color = process.stdout.isTTY;
const dim = (text) => (color ? `\x1b[2m${text}\x1b[0m` : text);

const server = await viteServer();
try {
  const load = (path) => server.ssrLoadModule(path);
  const { courses, racetracks } = await load('/src/courses.ts');
  const { CourseTerrain } = await load('/src/terrain.ts');
  const { createConfigurationState } = await load('/src/configuration-state.ts');
  const { trainRaceBot } = await load('/src/bot-training.ts');
  const { loadRecordLap, createReplayFrame, sampleSteps } = await load('/src/lap-recording.ts');
  const { physicsStep } = await load('/src/physics-messages.ts');
  const { vehicleDimensions } = await load('/src/car-geometry.ts');
  const { raceBotTunings, raceBotConfiguration, createDrivingMap } = await load('/src/race-bot.ts');
  const THREE = await load('three');

  const course = [...courses, ...racetracks].find(({ id }) => id === courseId);
  if (!course) throw new Error(`Unknown course: ${courseId}`);
  const definition = { ...course, reverse: direction === 'reverse' };
  const terrain = new CourseTerrain(definition, false);
  const geometry = await loadTrainingCarGeometry(server);
  const { halfWidth } = vehicleDimensions(geometry);
  const configuration = raceBotConfiguration(
    {
      driveMode: 'grip',
      profiles: createConfigurationState().getState().profiles,
      coneMode: 'off',
    },
    preset,
  );
  const Ammo = await AmmoFactory.call({});
  const current = { ...raceBotTunings[preset] };
  const map = createDrivingMap(definition, terrain, halfWidth, current.edgeMargin);
  const count = map.centers.length;

  // Both laps become the same trace: 30 Hz pose plus engine throttle (sqrt of the pedal).
  const recording = await loadRecordLap(key.slice(prefix.length), {
    getItem: (name) => storage[name] ?? null,
  });
  const humanTime = recording.lapTimes[0];
  const frame = createReplayFrame();
  const forward = new THREE.Vector3();
  const humanTrace = [];
  for (let t = 0; t <= humanTime; t += recording.interval) {
    recording.read(t, frame);
    forward.set(0, 0, 1).applyQuaternion(frame.quaternion);
    humanTrace.push({
      t,
      x: frame.position.x,
      z: frame.position.z,
      heading: Math.atan2(forward.x, forward.z),
      throttle: frame.throttle,
      braking: frame.braking,
      steering: frame.steering,
    });
  }

  function drive(tuning, onStep) {
    Object.assign(raceBotTunings[preset], tuning);
    const [run] = trainRaceBot(
      Ammo,
      definition,
      terrain,
      geometry,
      configuration,
      { skill: 1, aggression: 0.5, learning: false, preset },
      1,
      undefined,
      { maxSeconds: 150, laps: 3, onStep },
    ).runs;
    const times = run.laps.filter(({ valid }) => valid).map(({ time }) => time);
    return times.length ? Math.min(...times) : Infinity;
  }
  let step = 0;
  const botTrace = [];
  const baseline = drive(current, (state, bot) => {
    if (step++ % sampleSteps) return;
    botTrace.push({
      t: step * physicsStep,
      x: state.x,
      z: state.z,
      heading: state.heading,
      throttle: Math.sqrt(bot.controls.throttle),
      braking: bot.controls.brake > 0,
      steering: bot.controls.steer,
    });
  });

  const wrap = (i) => ((i % count) + count) % count;
  const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function measure(trace) {
    const distance = (i, { x, z }) => (map.centers[i].x - x) ** 2 + (map.centers[i].z - z) ** 2;
    let index = 0;
    for (let i = 1; i < count; i++)
      if (distance(i, trace[0]) < distance(index, trace[0])) index = i;
    const samples = trace.map((sample) => {
      let best = index;
      for (let k = -3; k <= 10; k++)
        if (distance(wrap(index + k), sample) < distance(best, sample)) best = wrap(index + k);
      index = best;
      const center = map.centers[index];
      const right = map.rights[index];
      const offset = (sample.x - center.x) * right.x + (sample.z - center.z) * right.z;
      return { ...sample, index, offset };
    });
    const around = (i) => [
      samples[Math.max(i - 1, 0)],
      samples[Math.min(i + 1, samples.length - 1)],
    ];
    samples.forEach((sample, i) => {
      const [a, b] = around(i);
      const vx = (b.x - a.x) / (b.t - a.t);
      const vz = (b.z - a.z) / (b.t - a.t);
      sample.speed = Math.hypot(vx, vz);
      sample.course = Math.atan2(vx, vz);
      sample.slip = Math.abs(angle(sample.course - sample.heading));
      sample.yawRate = angle(b.heading - a.heading) / (b.t - a.t);
    });
    samples.forEach((sample, i) => {
      const [a, b] = around(i);
      sample.acceleration = (b.speed - a.speed) / (b.t - a.t);
      sample.lateral = (sample.speed * Math.abs(angle(b.course - a.course))) / (b.t - a.t);
    });
    return samples;
  }

  // The bot's fastest lap between two start/finish crossings.
  const botSamples = measure(botTrace);
  const crossings = botSamples.flatMap((sample, i) =>
    i && sample.index < count / 10 && botSamples[i - 1].index > (count * 9) / 10 ? [i] : [],
  );
  const botLaps = crossings.slice(1).map((end, i) => botSamples.slice(crossings[i], end));
  if (!botLaps.length) throw new Error('The bot did not complete a lap with the current tune');
  const lapDuration = (lap) => lap.at(-1).t - lap[0].t;
  const botLap = botLaps.reduce((best, lap) => (lapDuration(lap) < lapDuration(best) ? lap : best));
  const humanLap = measure(humanTrace);

  function profile(samples, lapTime) {
    const bins = Array.from({ length: count }, () => []);
    for (const sample of samples) bins[sample.index].push(sample);
    // Bins just before the start line are reached at the end of the lap; count them as
    // before the line so sections across it measure one traversal.
    const times = bins.map((bin, i) => {
      if (!bin.length) return null;
      const time = bin[0].t - samples[0].t;
      return i < count / 2 && time > lapTime / 2 ? time - lapTime : time;
    });
    // Forward-fill the odd bin skipped at speed.
    for (let i = 1; i < count; i++) times[i] ??= times[i - 1];
    return {
      bins,
      timeAt: (i) => (i >= count ? (times[0] ?? 0) + lapTime : (times[i] ?? 0)),
      speed: bins.map((bin) => (bin.length ? mean(bin.map(({ speed }) => speed)) : null)),
    };
  }
  const human = profile(humanLap, humanTime);
  const bot = profile(botLap, lapDuration(botLap));

  // Corners on the racing line (radius under 120 m); sections split halfway between them.
  const corners = [];
  map.samples.forEach(({ curvature }, i) => {
    if (Math.abs(curvature) < 1 / 120) return;
    const last = corners.at(-1);
    if (last && i - last.end <= 5) last.end = i;
    else corners.push({ start: i, end: i });
  });
  const turns = corners.filter(({ start, end }) => end - start >= 2);
  const sectionRows = turns.map((turn, i) => {
    const from = i ? Math.round((turns[i - 1].end + turn.start) / 2) : 0;
    const to = i < turns.length - 1 ? Math.round((turn.end + turns[i + 1].start) / 2) : count;
    const range = (profile) => profile.bins.slice(turn.start, turn.end + 1).flat();
    const minimum = (samples) => Math.min(...samples.map(({ speed }) => speed));
    const peakLateral = (samples) => Math.max(...samples.map(({ lateral }) => lateral));
    const you = range(human);
    const gap = bot.timeAt(to) - bot.timeAt(from) - (human.timeAt(to) - human.timeAt(from));
    Object.assign(turn, {
      ratio: (minimum(you) / minimum(range(bot))) ** 2,
      clearance: Math.min(
        ...you.map(({ offset }) => definition.width / 2 - Math.abs(offset) - halfWidth),
      ),
    });
    return {
      Corner: [`${i + 1} @ ${Math.round(turn.start * map.spacing)} m`],
      'Bot min': [`${minimum(range(bot)).toFixed(1)}`],
      'You min': [`${minimum(you).toFixed(1)}`],
      'Bot lat': [`${peakLateral(range(bot)).toFixed(1)}`],
      'You lat': [`${peakLateral(you).toFixed(1)}`],
      'You slip': [`${degrees(Math.max(...you.map(({ slip }) => slip)))}°`],
      'Bot loses': [`${signed(gap)}s`, gap > 0.05 ? 'red' : gap < -0.05 ? 'green' : undefined],
    };
  });

  const fast = humanLap.filter(({ speed }) => speed > 10);
  const steerSense = Math.sign(
    fast.filter(({ slip }) => slip < 0.03).reduce((sum, s) => sum + s.steering * s.yawRate, 0),
  );
  const countersteering = fast
    .filter((s) => s.slip > 0.03 && steerSense * s.steering * s.yawRate < 0)
    .map(({ slip }) => slip);
  const braking = fast.filter(({ braking }) => braking).map(({ acceleration }) => -acceleration);
  const drops = speedDrops(human);
  const coasted = drops.filter(({ braked }) => !braked).map(({ drop }) => drop);

  const measured = {
    corneringGrip: [
      current.corneringGrip * median(turns.map(({ ratio }) => ratio)),
      (value) =>
        `you corner ${signed((Math.sqrt(value / current.corneringGrip) - 1) * 100, 0)}% faster`,
    ],
    tractionSlip: fast.some(({ throttle }) => throttle > 0.95) && [
      quantile(
        fast.filter(({ throttle }) => throttle > 0.95).map(({ slip }) => slip),
        0.75,
      ),
      (value) => `full throttle up to ${degrees(value)}° slip`,
    ],
    countersteerSlip: countersteering.length >= 15 && [
      quantile(countersteering, 0.25),
      (value) => `you countersteer from ${degrees(value)}°`,
    ],
    smallSpeedDrop: coasted.length > 0 && [
      Math.max(...coasted),
      (value) => `you coast through ${value.toFixed(1)} m/s drops`,
    ],
    brakingLimit: braking.length >= 15 && [
      quantile(braking, 0.9),
      (value) => `you brake at ${value.toFixed(1)} m/s²`,
    ],
    edgeMargin: [
      median(turns.map(({ clearance }) => clearance)),
      (value) => `apexes ${value.toFixed(2)} m from the edge`,
    ],
  };
  const suggestions = Object.entries(measured).flatMap(([name, entry]) => {
    if (!entry) return [];
    const [min, max] = bounds[name];
    const round = (value) => Number(value.toPrecision(3));
    const measuredValue = round(Math.min(max, Math.max(min, entry[0])));
    if (Math.abs(measuredValue - current[name]) <= Math.abs(current[name]) * 0.02) return [];
    // Copying the human outright can overshoot what the bot can control; try halfway too.
    let best = { value: measuredValue, lap: drive({ ...current, [name]: measuredValue }) };
    if (!(best.lap < baseline)) {
      const value = round((current[name] + measuredValue) / 2);
      const lap = drive({ ...current, [name]: value });
      if (lap < best.lap) best = { value, lap, halfway: true };
    }
    return [{ name, ...best, evidence: entry[1](entry[0]) }];
  });
  const helpful = suggestions.filter(({ lap }) => lap < baseline);
  const combined = Object.fromEntries(helpful.map(({ name, value }) => [name, value]));
  const combinedLap = helpful.length > 1 ? drive({ ...current, ...combined }) : null;

  const lap = (time) => (Number.isFinite(time) ? `${time.toFixed(3)}s` : 'fail');
  const change = (time) =>
    Number.isFinite(time)
      ? [`${signed(time - baseline)}s`, time < baseline ? 'green' : 'red']
      : ['–', 'red'];
  console.log(
    `${course.name}${definition.reverse ? ' (reverse)' : ''} · ${preset} · you ${lap(humanTime)} · bot ${lap(baseline)}\n`,
  );
  console.log(
    formatTable(
      ['Corner', 'Bot min', 'You min', 'Bot lat', 'You lat', 'You slip', 'Bot loses'],
      sectionRows,
      color,
    ),
  );
  console.log(
    dim('Speeds m/s · lat = peak lateral acceleration m/s² · loses = section time gap\n'),
  );
  const suggestionRows = suggestions.map(({ name, value, halfway, evidence, lap: time }) => ({
    Value: [name],
    Current: [String(Number(current[name].toPrecision(3)))],
    Suggested: [`${halfway ? '½ ' : ''}${value}`],
    Lap: [lap(time)],
    Change: change(time),
    Evidence: [evidence, 'dim'],
  }));
  if (combinedLap !== null)
    suggestionRows.push({
      Value: ['all that helped'],
      Lap: [lap(combinedLap)],
      Change: change(combinedLap),
    });
  console.log(
    suggestionRows.length
      ? formatTable(
          ['Value', 'Current', 'Suggested', 'Lap', 'Change', 'Evidence'],
          suggestionRows,
          color,
        )
      : 'Every measurable value already matches your driving.',
  );
  console.log(
    dim(
      `Laps are the bot's best of 3 on this course with one value changed; ½ marks halfway to your value, used when that was faster. brakeThreshold, lookaheadTime and yawDamping can't be read from a recording; train them with npm run train:bot.`,
    ),
  );

  const [best] = [
    ...(combinedLap !== null ? [{ tuning: combined, lap: combinedLap }] : []),
    ...helpful.map(({ name, value, lap }) => ({ tuning: { [name]: value }, lap })),
  ].sort((a, b) => a.lap - b.lap);
  if (values.apply && best) {
    await applyBotTuning(preset, best.tuning);
    console.log(`\nApplied ${JSON.stringify(best.tuning)} to src/race-bot-tunings.json`);
  } else if (best)
    console.log(
      `\nRe-run with --apply to write ${JSON.stringify(best.tuning)} (${lap(best.lap)}), then npm run train:bot to check the other tracks.`,
    );
} finally {
  await server.close();
}

/** Slowing phases (peak to trough, beyond 1 m/s of noise) and whether any of them used the brakes. */
function speedDrops({ bins, speed }) {
  const drops = [];
  let peak = -Infinity;
  let trough = Infinity;
  let falling = false;
  let braked = false;
  speed.forEach((value, i) => {
    if (value === null) return;
    const brakes = bins[i].some(({ braking }) => braking);
    if (!falling) {
      peak = Math.max(peak, value);
      if (value < peak - 1) [falling, trough, braked] = [true, value, brakes];
    } else {
      trough = Math.min(trough, value);
      braked ||= brakes;
      if (value > trough + 1) {
        drops.push({ drop: peak - trough, braked });
        [falling, peak] = [false, value];
      }
    }
  });
  return drops;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function median(values) {
  return quantile(values, 0.5);
}

function degrees(radians) {
  return ((radians * 180) / Math.PI).toFixed(1);
}
