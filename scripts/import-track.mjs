#!/usr/bin/env node
// Converts recorded-lap track JSON (featured_lap.points + elevation.points) into a
// course definition that src/courses.ts loads from src/tracks/<slug>.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const earthRadius = 6371008.8;
const defaults = { width: 15, spacing: 8, elevationSpacing: 5, elevationSmoothing: 15 };

/** Evenly resamples a closed polyline; the closing segment bridges any gap at the start line. */
function resampleLoop(points, spacing) {
  const distances = [0];
  for (let i = 1; i <= points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i % points.length];
    distances.push(distances[i - 1] + Math.hypot(bx - ax, bz - az));
  }
  const length = distances[points.length];
  const count = Math.max(8, Math.round(length / spacing));
  const result = [];
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const target = i / count * length;
    while (distances[segment + 1] < target) segment++;
    const [ax, az] = points[segment];
    const [bx, bz] = points[(segment + 1) % points.length];
    const u = (target - distances[segment]) / (distances[segment + 1] - distances[segment] || 1);
    result.push([ax + (bx - ax) * u, az + (bz - az) * u]);
  }
  return { points: result, length };
}

function sampleProfile(profile, fraction) {
  const high = profile.findIndex((point) => point.dist_frac >= fraction);
  if (high === -1) return profile[profile.length - 1].altitude_m;
  if (high === 0) return profile[0].altitude_m;
  const low = profile[high - 1];
  const next = profile[high];
  const u = (fraction - low.dist_frac) / (next.dist_frac - low.dist_frac || 1);
  return low.altitude_m + (next.altitude_m - low.altitude_m) * u;
}

const round = (value, digits) => Number(value.toFixed(digits));

export function convertTrack(data, options = {}) {
  const settings = { ...defaults, ...options };
  const lap = data.featured_lap?.points;
  if (!data.slug) throw new Error('Track JSON is missing slug');
  if (!Array.isArray(lap) || lap.length < 8) throw new Error(`${data.slug}: featured_lap.points is missing`);
  const lat0 = lap.reduce((sum, point) => sum + point.lat, 0) / lap.length;
  const lon0 = lap.reduce((sum, point) => sum + point.lon, 0) / lap.length;
  const cosLat = Math.cos(lat0 * Math.PI / 180);
  // Local equirectangular projection. The map view shows +Z at the top with +X on
  // the left, so north -> +Z and east -> -X keeps the layout unmirrored, north up.
  const projected = lap.map(({ lat, lon }) => [
    -(lon - lon0) * Math.PI / 180 * earthRadius * cosLat,
    (lat - lat0) * Math.PI / 180 * earthRadius,
  ]);
  // Drop duplicate fixes and a trailing point that repeats the start.
  const unique = projected.filter((point, i) => i === 0
    || Math.hypot(point[0] - projected[i - 1][0], point[1] - projected[i - 1][1]) > 0.05);
  const last = unique[unique.length - 1];
  if (Math.hypot(last[0] - unique[0][0], last[1] - unique[0][1]) < 0.5) unique.pop();
  const { points, length } = resampleLoop(unique, settings.spacing);

  const profile = data.elevation?.points?.filter((point) => Number.isFinite(point.altitude_m)
    && Number.isFinite(point.dist_frac)).sort((a, b) => a.dist_frac - b.dist_frac);
  let elevation = [0];
  if (profile?.length >= 2) {
    const count = Math.max(8, Math.round(length / settings.elevationSpacing));
    const raw = Array.from({ length: count }, (_, i) => sampleProfile(profile, i / count));
    // A periodic moving average removes sensor jitter without flattening real grades.
    const radius = Math.round(settings.elevationSmoothing / 2 / (length / count));
    const smoothed = raw.map((_, i) => {
      let sum = 0;
      for (let j = -radius; j <= radius; j++) sum += raw[(i + j + count) % count];
      return sum / (2 * radius + 1);
    });
    const min = Math.min(...smoothed);
    elevation = smoothed.map((height) => round(height - min, 2));
  }

  return {
    id: data.slug,
    name: data.display_name ?? data.slug,
    width: settings.width,
    coneSpacing: 10,
    points: points.map(([x, z]) => [round(x, 2), round(z, 2)]),
    elevation,
  };
}

function parseArguments(argv) {
  const inputs = [];
  const options = {};
  let outDir = fileURLToPath(new URL('../src/tracks/', import.meta.url));
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`Missing value for ${argument}`);
      return next;
    };
    if (argument === '--out-dir') outDir = value();
    else if (argument === '--width') options.width = Number(value());
    else if (argument === '--spacing') options.spacing = Number(value());
    else if (argument === '--help' || argument === '-h') return { help: true };
    else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else inputs.push(argument);
  }
  for (const [key, number] of Object.entries(options)) {
    if (!(number > 0)) throw new Error(`--${key} must be a positive number`);
  }
  return { inputs, options, outDir };
}

async function main() {
  const { help, inputs, options, outDir } = parseArguments(process.argv.slice(2));
  if (help || !inputs.length) {
    console.log('Usage: npm run import-track -- <track.json...> [--out-dir src/tracks] [--width 15] [--spacing 8]');
    if (!help) process.exitCode = 1;
    return;
  }
  await mkdir(outDir, { recursive: true });
  for (const input of inputs) {
    const course = convertTrack(JSON.parse(await readFile(input, 'utf8')), options);
    const output = path.join(outDir, `${course.id}.json`);
    await writeFile(output, `${JSON.stringify(course)}\n`);
    const heights = course.elevation;
    console.log(`${input} -> ${output}: ${course.points.length} points, `
      + (heights.length > 1 ? `${Math.max(...heights).toFixed(1)} m elevation range` : 'no elevation data (flat road)'));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
