#!/usr/bin/env node
// Converts recorded-lap track JSON (featured_lap.points + elevation.points) into a
// course definition that src/courses.ts loads from src/tracks/<slug>.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const earthRadius = 6371008.8;
const defaults = { width: 15, spacing: 8, elevationSpacing: 5, elevationSmoothing: 15 };
const elevationEndpoint = 'https://epqs.nationalmap.gov/v1/json';
const elevationCacheDir = fileURLToPath(
  new URL('../src/trackImports/elevation-cache/', import.meta.url),
);

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
    const target = (i / count) * length;
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

function smoothElevationSeam(heights, spacing) {
  const count = heights.length;
  const radius = Math.min(Math.round(100 / spacing), Math.floor((count - 1) / 4));
  if (radius < 1) return;
  const start = count - radius;
  const end = radius;
  const span = 2 * radius;
  const startHeight = heights[start];
  const endHeight = heights[end];
  const startSlope = (heights[(start + 1) % count] - heights[start - 1]) / 2;
  const endSlope = (heights[end + 1] - heights[end - 1]) / 2;
  // Bridge the lap boundary with a cubic Hermite curve, matching both grades so
  // closing a GPS/elevation recording cannot turn an endpoint mismatch into a bump.
  for (let offset = 1; offset < span; offset++) {
    const t = offset / span;
    const t2 = t * t;
    const t3 = t2 * t;
    heights[(start + offset) % count] =
      (2 * t3 - 3 * t2 + 1) * startHeight +
      (t3 - 2 * t2 + t) * span * startSlope +
      (-2 * t3 + 3 * t2) * endHeight +
      (t3 - t2) * span * endSlope;
  }
}

const round = (value, digits) => Number(value.toFixed(digits));

function projectLap(data) {
  const lap = data.featured_lap?.points;
  if (!data.slug) throw new Error('Track JSON is missing slug');
  if (!Array.isArray(lap) || lap.length < 8)
    throw new Error(`${data.slug}: featured_lap.points is missing`);
  const lat0 = lap.reduce((sum, point) => sum + point.lat, 0) / lap.length;
  const lon0 = lap.reduce((sum, point) => sum + point.lon, 0) / lap.length;
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  // Local equirectangular projection. The map view shows +Z at the top with +X on
  // the left, so north -> +Z and east -> -X keeps the layout unmirrored, north up.
  const projected = lap.map(({ lat, lon }) => [
    ((-(lon - lon0) * Math.PI) / 180) * earthRadius * cosLat,
    (((lat - lat0) * Math.PI) / 180) * earthRadius,
  ]);
  // Drop duplicate fixes and a trailing point that repeats the start.
  const unique = projected.filter(
    (point, i) =>
      i === 0 || Math.hypot(point[0] - projected[i - 1][0], point[1] - projected[i - 1][1]) > 0.05,
  );
  const last = unique[unique.length - 1];
  if (Math.hypot(last[0] - unique[0][0], last[1] - unique[0][1]) < 0.5) unique.pop();
  return { unique, lat0, lon0, cosLat };
}

export async function fetchMissingElevation(
  data,
  { cacheDir = elevationCacheDir, fetch = globalThis.fetch } = {},
) {
  if (data.elevation?.points?.length) {
    if (
      data.elevation.points.length < 2 ||
      !data.elevation.points.every(
        (point) => Number.isFinite(point.altitude_m) && Number.isFinite(point.dist_frac),
      )
    ) {
      throw new Error(`${data.slug}: supplied elevation profile is invalid`);
    }
    return data;
  }

  const { unique, lat0, lon0, cosLat } = projectLap(data);
  const { points } = resampleLoop(unique, 10);
  const coordinates = points.map(([x, z]) => ({
    lat: lat0 + ((z / earthRadius) * 180) / Math.PI,
    lon: lon0 - ((x / (earthRadius * cosLat)) * 180) / Math.PI,
  }));
  if (
    coordinates.some(
      ({ lat, lon }) =>
        !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180,
    )
  ) {
    throw new Error(`${data.slug}: invalid GPS coordinates`);
  }
  const coordinatesHash = createHash('sha256').update(JSON.stringify(coordinates)).digest('hex');
  const cacheFile = path.join(cacheDir, `${encodeURIComponent(data.slug)}.json`);
  let cached;
  try {
    cached = JSON.parse(await readFile(cacheFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let elevation;
  if (cached?.coordinatesHash === coordinatesHash) {
    if (
      cached.source !== 'USGS 3DEP' ||
      !Array.isArray(cached.points) ||
      cached.points.length !== coordinates.length ||
      !cached.points.every(
        (point, i) =>
          Number.isFinite(point.altitude_m) && point.dist_frac === i / coordinates.length,
      )
    ) {
      throw new Error(`${data.slug}: invalid elevation cache ${cacheFile}`);
    }
    elevation = cached;
    console.log(`${data.slug}: using cached USGS elevation (${coordinates.length} samples)`);
  } else {
    console.log(`${data.slug}: fetching USGS elevation (${coordinates.length} samples)`);
    const profile = [];
    // Limit concurrent requests to avoid overwhelming the public service.
    for (let start = 0; start < coordinates.length; start += 4) {
      profile.push(
        ...(await Promise.all(
          coordinates.slice(start, start + 4).map(async ({ lat, lon }, offset) => {
            const url = new URL(elevationEndpoint);
            url.search = new URLSearchParams({
              x: String(lon),
              y: String(lat),
              wkid: '4326',
              units: 'Meters',
              includeDate: 'false',
            });
            const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
            if (!response.ok)
              throw new Error(
                `${data.slug}: USGS elevation request failed: HTTP ${response.status}`,
              );
            const result = await response.json();
            const altitude =
              typeof result.value === 'string' && result.value.trim() !== ''
                ? Number(result.value)
                : result.value;
            if (!Number.isFinite(altitude) || altitude <= -100000) {
              throw new Error(`${data.slug}: USGS returned no valid elevation at ${lat}, ${lon}`);
            }
            return { dist_frac: (start + offset) / coordinates.length, altitude_m: altitude };
          }),
        )),
      );
    }
    elevation = {
      source: 'USGS 3DEP',
      endpoint: elevationEndpoint,
      coordinatesHash,
      points: profile,
    };
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cacheFile, `${JSON.stringify(elevation)}\n`);
  }
  return { ...data, elevation };
}

export function convertTrack(data, options = {}) {
  const settings = { ...defaults, ...options };
  const { unique } = projectLap(data);
  const { points, length } = resampleLoop(unique, settings.spacing);

  const profile = data.elevation?.points
    ?.filter((point) => Number.isFinite(point.altitude_m) && Number.isFinite(point.dist_frac))
    .sort((a, b) => a.dist_frac - b.dist_frac);
  let elevation = [0];
  if (profile?.length >= 2) {
    const count = Math.max(8, Math.round(length / settings.elevationSpacing));
    const raw = Array.from({ length: count }, (_, i) => sampleProfile(profile, i / count));
    smoothElevationSeam(raw, length / count);
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
    venueName: data.venue_name,
    configName: data.config_name,
    location: data.location,
    width: settings.width,
    coneSpacing: 10,
    points: points.map(([x, z]) => [round(x, 2), round(z, 2)]),
    elevation,
    ...(data.elevation?.source ? { elevationSource: data.elevation.source } : {}),
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
    console.log(
      'Usage: npm run import-track -- <track.json...> [--out-dir src/tracks] [--width 15] [--spacing 8]',
    );
    if (!help) process.exitCode = 1;
    return;
  }
  await mkdir(outDir, { recursive: true });
  for (const input of inputs) {
    const data = await fetchMissingElevation(JSON.parse(await readFile(input, 'utf8')));
    const course = convertTrack(data, options);
    const output = path.join(outDir, `${course.id}.json`);
    await writeFile(output, `${JSON.stringify(course)}\n`);
    const heights = course.elevation;
    console.log(
      `${input} -> ${output}: ${course.points.length} points, ` +
        (heights.length > 1
          ? `${Math.max(...heights).toFixed(1)} m elevation range`
          : 'no elevation data (flat road)'),
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
