#!/usr/bin/env node
// Converts Sensor Logger recordings in data-imports/ into src/real-data/<track file>.json.
// GPS fixes are mapped to progress along the matching track's road and resampled at a fixed
// interval, fusing Doppler speed with positions between 1 Hz fixes. When the phone sat still in
// the car, its IMU adds lateral/longitudinal g (body lean) and path curvature (steering).
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const importsDirectory = join(root, 'data-imports');
const tracksDirectory = join(root, 'src/tracks');
const outputDirectory = join(root, 'src/real-data');
const earthRadius = 6371008.8;
const interval = 0.1;
const movingSpeed = 1;
const maxRoadDistance = 30;
const correctionSigma = 5;

function usage() {
  console.log(`Usage: npm run import-real-data -- [recording.json ...] [--track src/tracks/<track>.json]

Imports every JSON recording in data-imports/ when no recordings are given. Each recording
is matched to the track whose road it follows unless --track is passed.`);
}

function parseArgs(argv) {
  const files = [];
  let track;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') {
      usage();
      process.exit(0);
    }
    if (argv[i] === '--track') {
      track = argv[++i];
      if (!track) throw new Error('--track requires a path');
    } else files.push(argv[i]);
  }
  return { files, track };
}

function roadOf(file, data) {
  const terrain = data.terrain;
  if (data.closed !== false || !terrain) return null;
  if (![terrain.originLat, terrain.originLon, terrain.metersPerLongitude].every(Number.isFinite))
    return null;
  const points = data.points;
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]),
    );
  return {
    file,
    width: data.width,
    points,
    distances,
    length: distances.at(-1),
    // Matches the equirectangular projection used by track-conversion.mjs.
    project: (lat, lon) => [
      -(lon - terrain.originLon) * terrain.metersPerLongitude,
      ((lat - terrain.originLat) * Math.PI * earthRadius) / 180,
    ],
  };
}

/** Nearest point on the road within [from, to] meters of progress. */
function nearestOnRoad(road, [x, z], from = 0, to = road.length) {
  let best = { distance: Infinity, progress: 0 };
  for (let i = 0; i < road.points.length - 1; i++) {
    if (road.distances[i + 1] < from || road.distances[i] > to) continue;
    const [ax, az] = road.points[i];
    const [bx, bz] = road.points[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const distance = Math.hypot(x - ax - u * dx, z - az - u * dz);
    if (distance < best.distance)
      best = {
        distance,
        progress: road.distances[i] + u * (road.distances[i + 1] - road.distances[i]),
      };
  }
  return best;
}

function readFixes(records) {
  const fixes = records
    .filter((record) => record.sensor === 'Location')
    .map((record) => ({
      time: Number(record.seconds_elapsed),
      lat: Number(record.latitude),
      lon: Number(record.longitude),
      speed: Math.max(0, Number(record.speed)),
      accuracy: Math.max(5, Number(record.horizontalAccuracy) || 50),
    }))
    // Negative times are cached fixes from before the recording started.
    .filter((fix) => fix.time >= 0 && [fix.lat, fix.lon, fix.speed].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
  const first = fixes.findIndex(({ speed }) => speed >= movingSpeed);
  const last = fixes.findLastIndex(({ speed }) => speed >= movingSpeed);
  if (first < 0) throw new Error('Recording never moves');
  // Keep one resting fix on either side so the ghost launches from and comes to a stop.
  return fixes.slice(Math.max(0, first - 1), Math.min(fixes.length, last + 2));
}

function matchRoad(roads, fixes) {
  const scored = roads.map((road) => {
    const distances = fixes
      .map(({ lat, lon }) => nearestOnRoad(road, road.project(lat, lon)).distance)
      .sort((a, b) => a - b);
    return { road, median: distances[Math.floor(distances.length / 2)] };
  });
  scored.sort((a, b) => a.median - b.median);
  if (!scored.length || scored[0].median > maxRoadDistance)
    throw new Error('No track follows this recording');
  return scored[0].road;
}

/** Road progress per fix, searching only near the previous fix so hairpins cannot jump. */
function roadProgress(road, fixes) {
  let previous = null;
  return fixes.map((fix, i) => {
    const point = road.project(fix.lat, fix.lon);
    const reach = previous
      ? 50 + 2 * Math.max(fix.speed, fixes[i - 1].speed) * (fix.time - fixes[i - 1].time)
      : Infinity;
    const nearest = nearestOnRoad(
      road,
      point,
      previous === null ? 0 : previous - reach,
      previous === null ? road.length : previous + reach,
    );
    if (nearest.distance > maxRoadDistance)
      throw new Error(
        `GPS fix at ${fix.time.toFixed(1)}s is ${nearest.distance.toFixed(0)} m off the road`,
      );
    previous = nearest.progress;
    return nearest.progress;
  });
}

/**
 * Integrates Doppler speed for smooth motion, then removes its drift with a heavily smoothed,
 * accuracy-weighted correction toward the GPS positions.
 */
function resample(fixes, progress, direction) {
  const travelled = [0];
  for (let i = 1; i < fixes.length; i++)
    travelled.push(
      travelled[i - 1] +
        ((fixes[i].speed + fixes[i - 1].speed) / 2) * (fixes[i].time - fixes[i - 1].time),
    );
  const residuals = fixes.map((_, i) => direction * (progress[i] - progress[0]) - travelled[i]);
  const corrections = fixes.map(({ time }) => {
    let sum = 0;
    let weights = 0;
    fixes.forEach((fix, j) => {
      const weight =
        Math.exp(-0.5 * ((fix.time - time) / correctionSigma) ** 2) / fix.accuracy ** 2;
      sum += residuals[j] * weight;
      weights += weight;
    });
    return sum / weights;
  });
  const start = fixes[0].time;
  const duration = fixes.at(-1).time - start;
  const samples = [];
  let segment = 0;
  let furthest = -Infinity;
  for (let i = 0; i <= Math.floor(duration / interval); i++) {
    const time = start + i * interval;
    while (segment < fixes.length - 2 && fixes[segment + 1].time <= time) segment++;
    const a = fixes[segment];
    const b = fixes[segment + 1];
    const dt = b.time - a.time;
    const u = (time - a.time) / dt;
    // Exact integral of the linearly interpolated speed.
    const distance = travelled[segment] + dt * (a.speed * u + ((b.speed - a.speed) * u * u) / 2);
    const correction = corrections[segment] + (corrections[segment + 1] - corrections[segment]) * u;
    furthest = Math.max(furthest, distance + correction);
    samples.push(progress[0] + direction * furthest);
  }
  return samples;
}

const gravityAcceleration = 9.80665;
const motionSigma = 0.2;
const minFitSpeed = 3;
const minMountFit = 0.8;
const maxMountTilt = 20;
const minCurvatureSpeed = 2;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const scale = (a, s) => a.map((value) => value * s);
const normalize = (a) => scale(a, 1 / Math.hypot(...a));

function readSensor(records, name) {
  return records
    .filter((record) => record.sensor === name && Number(record.seconds_elapsed) >= 0)
    .map((record) => ({
      time: Number(record.seconds_elapsed),
      value: ['x', 'y', 'z'].map((axis) => Number(record[axis])),
    }))
    .filter(({ time, value }) => [time, ...value].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
}

/** Gaussian-smoothed sensor vectors at the given times, so road vibration doesn't shake the ghost. */
function smoothAt(readings, times) {
  let first = 0;
  return times.map((time) => {
    while (first < readings.length && readings[first].time < time - 3 * motionSigma) first++;
    const sum = [0, 0, 0];
    let weights = 0;
    for (let i = first; i < readings.length && readings[i].time <= time + 3 * motionSigma; i++) {
      const weight = Math.exp(-0.5 * ((readings[i].time - time) / motionSigma) ** 2);
      for (let k = 0; k < 3; k++) sum[k] += readings[i].value[k] * weight;
      weights += weight;
    }
    return weights ? scale(sum, 1 / weights) : null;
  });
}

/** Pearson correlation of [x, y] pairs. */
function correlation(pairs) {
  const mean = (k) => pairs.reduce((sum, pair) => sum + pair[k], 0) / pairs.length;
  const [mx, my] = [mean(0), mean(1)];
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * The angle, in a horizontal basis, of the axis whose acceleration best matches the targets (least
 * squares), and how well it correlates.
 */
function fitAxis(samples) {
  let a11 = 0;
  let a12 = 0;
  let a22 = 0;
  let b1 = 0;
  let b2 = 0;
  for (const { h1, h2, target } of samples) {
    a11 += h1 * h1;
    a12 += h1 * h2;
    a22 += h2 * h2;
    b1 += h1 * target;
    b2 += h2 * target;
  }
  const angle = Math.atan2(a11 * b2 - a12 * b1, b1 * a22 - b2 * a12);
  const fit = correlation(
    samples.map(({ h1, h2, target }) => [h1 * Math.cos(angle) + h2 * Math.sin(angle), target]),
  );
  return { angle, fit: Number.isFinite(fit) ? fit : 0 };
}

/**
 * Lateral/longitudinal g and path curvature from the phone's IMU. The phone may sit at any angle,
 * so up comes from gravity, the car's left axis is the horizontal direction whose acceleration best
 * matches speed × yaw rate, and its forward axis the one best matching the change in GPS speed.
 * Returns null when the phone wasn't held still enough for those fits to hold.
 */
function readMotion(records, times, speeds) {
  const [gravity, rotation, acceleration] = ['Gravity', 'Gyroscope', 'Accelerometer'].map((name) =>
    smoothAt(readSensor(records, name), times),
  );
  const rows = times.map((_, i) => {
    if (!gravity[i] || !rotation[i] || !acceleration[i]) return null;
    const up = normalize(scale(gravity[i], -1));
    return { up, yawRate: dot(rotation[i], up), acceleration: acceleration[i] };
  });
  const moving = rows
    .map((row, i) => row && speeds[i] >= minFitSpeed && i)
    .filter((i) => typeof i === 'number');
  if (moving.length < 50) return null;
  const mount = normalize(
    moving.reduce((sum, i) => sum.map((value, k) => value + rows[i].up[k]), [0, 0, 0]),
  );
  // A horizontal basis fixed to the phone; any axis not parallel to up works.
  const reference = Math.abs(mount[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const basis = (up) => {
    const first = normalize(reference.map((value, k) => value - dot(reference, up) * up[k]));
    return [first, cross(up, first)];
  };
  const horizontal = (i) => {
    const [first, second] = basis(rows[i].up);
    return { h1: dot(rows[i].acceleration, first), h2: dot(rows[i].acceleration, second) };
  };
  const speedChange = (i) => {
    const before = Math.max(i - 1, 0);
    const after = Math.min(i + 1, speeds.length - 1);
    return (speeds[after] - speeds[before]) / ((after - before) * interval);
  };
  const left = fitAxis(
    moving.map((i) => ({ ...horizontal(i), target: speeds[i] * rows[i].yawRate })),
  );
  const forward = fitAxis(moving.map((i) => ({ ...horizontal(i), target: speedChange(i) })));
  if (Math.min(left.fit, forward.fit) < minMountFit) {
    console.warn(
      `  Skipping motion data: phone mount fit ${left.fit.toFixed(2)} lateral, ` +
        `${forward.fit.toFixed(2)} longitudinal (< ${minMountFit})`,
    );
    return null;
  }
  const round = (value, digits) => Number(value.toFixed(digits)) || 0;
  const along = ({ h1, h2 }, { angle }) =>
    (h1 * Math.cos(angle) + h2 * Math.sin(angle)) / gravityAcceleration;
  const lateral = [];
  const longitudinal = [];
  const curvature = [];
  rows.forEach((row, i) => {
    // Zero motion wherever the phone was picked up or slid out of its mount.
    if (!row || Math.acos(Math.min(1, dot(row.up, mount))) > (maxMountTilt * Math.PI) / 180) {
      lateral.push(0);
      longitudinal.push(0);
      curvature.push(0);
      return;
    }
    const acceleration = horizontal(i);
    lateral.push(round(along(acceleration, left), 3));
    longitudinal.push(round(along(acceleration, forward), 3));
    curvature.push(round(row.yawRate / Math.max(speeds[i], minCurvatureSpeed), 4));
  });
  console.log(
    `  Phone mount fit ${left.fit.toFixed(2)} lateral, ${forward.fit.toFixed(2)} longitudinal`,
  );
  return { lateral, longitudinal, curvature };
}

async function importRecording(file, roads) {
  const records = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(records)) throw new Error(`${file}: expected a Sensor Logger JSON array`);
  const metadata = records.find((record) => record.sensor === 'Metadata');
  const fixes = readFixes(records);
  const road = matchRoad(roads, fixes);
  const progress = roadProgress(road, fixes);
  const direction = Math.sign(progress.at(-1) - progress[0]) || 1;
  const samples = resample(fixes, progress, direction);
  const times = samples.map((_, i) => fixes[0].time + i * interval);
  const speeds = samples.map(
    (_, i) =>
      Math.abs(samples[Math.min(i + 1, samples.length - 1)] - samples[Math.max(i - 1, 0)]) /
      (interval * (Math.min(i + 1, samples.length - 1) - Math.max(i - 1, 0))),
  );
  const motion = readMotion(records, times, speeds);
  const output = {
    source: [
      'Sensor Logger',
      metadata?.['device name'] && `(${metadata['device name']})`,
      metadata?.['recording time'] && `recorded ${metadata['recording time']}`,
    ]
      .filter(Boolean)
      .join(' '),
    reverse: direction < 0,
    interval,
    progress: samples.map((meters) =>
      Number(Math.max(0, Math.min(1, meters / road.length)).toFixed(6)),
    ),
    ...motion,
  };
  await mkdir(outputDirectory, { recursive: true });
  const target = join(outputDirectory, basename(road.file));
  await writeFile(target, `${JSON.stringify(output)}\n`);
  const covered = [samples[0], samples.at(-1)].map((meters) => Math.round(meters));
  console.log(
    `${basename(file)} → ${target.slice(root.length)}: ${fixes.length} GPS fixes, ` +
      `${(samples.length * interval).toFixed(1)} s, road ${covered[0]}–${covered[1]} of ${Math.round(road.length)} m` +
      `${output.reverse ? ' (reverse)' : ''}`,
  );
}

const { files, track } = parseArgs(process.argv.slice(2));
const trackFiles = track
  ? [track]
  : (await readdir(tracksDirectory))
      .filter((file) => file.endsWith('.json'))
      .map((file) => join(tracksDirectory, file));
const roads = (
  await Promise.all(
    trackFiles.map(async (file) => roadOf(file, JSON.parse(await readFile(file, 'utf8')))),
  )
).filter(Boolean);
if (!roads.length) throw new Error('No open roads with terrain origins to match against');
const recordings = files.length
  ? files
  : (await readdir(importsDirectory))
      .filter((file) => file.endsWith('.json'))
      .map((file) => join(importsDirectory, file));
if (!recordings.length) {
  usage();
  process.exit(1);
}
for (const file of recordings) await importRecording(file, roads);
