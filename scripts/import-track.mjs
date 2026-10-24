#!/usr/bin/env node
// Converts recorded-lap track JSON (featured_lap.points + elevation.points) into a
// course definition that src/courses.ts loads from src/tracks/<slug>.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchTerrainRaster } from './import-terrain.mjs';
import { geographicRasterSampler } from '../src/terrain-raster.mjs';

const earthRadius = 6371008.8;
export const roadImportDefaults = { width: 8, doubleYellow: true };
const defaults = { width: 15, spacing: 8, elevationSpacing: 5, elevationSmoothing: 15 };
const elevationEndpoint = 'https://epqs.nationalmap.gov/v1/json';
const elevationCacheDir = fileURLToPath(
  new URL('../track-import/elevation-cache/', import.meta.url),
);

/** Evenly resamples a closed polyline; the closing segment bridges any gap at the start line. */
function resampleLoop(points, spacing, closed = true) {
  const distances = [0];
  const segments = closed ? points.length : points.length - 1;
  for (let i = 1; i <= segments; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i % points.length];
    distances.push(distances[i - 1] + Math.hypot(bx - ax, bz - az));
  }
  const length = distances[segments];
  const count = Math.max(8, Math.round(length / spacing));
  const result = [];
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / (closed ? count : count - 1)) * length;
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
  if (!Array.isArray(lap) || lap.length < (data.closed === false ? 2 : 8))
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
  if (data.closed !== false && Math.hypot(last[0] - unique[0][0], last[1] - unique[0][1]) < 0.5)
    unique.pop();
  return { unique, lat0, lon0, cosLat };
}

export function roadDistances(coordinates) {
  const distances = [0];
  const radians = Math.PI / 180;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1];
    const b = coordinates[i];
    const haversine =
      Math.sin(((b.lat - a.lat) * radians) / 2) ** 2 +
      Math.cos(a.lat * radians) *
        Math.cos(b.lat * radians) *
        Math.sin(((b.lon - a.lon) * radians) / 2) ** 2;
    distances.push(
      distances[i - 1] + 2 * earthRadius * Math.asin(Math.sqrt(Math.min(1, haversine))),
    );
  }
  return distances;
}

export function selectTrackSegment(data, { start, finish } = {}) {
  if (start === undefined && finish === undefined) return data;
  if (data.closed !== false) throw new Error('Segment selection requires an open road source');
  const points = data.featured_lap?.points;
  if (
    !Array.isArray(points) ||
    !Number.isInteger(start) ||
    !Number.isInteger(finish) ||
    start < 0 ||
    finish < 0 ||
    start >= points.length ||
    finish >= points.length ||
    start === finish
  )
    throw new Error('--start and --finish must be different valid source point indices');
  const distances = roadDistances(points);
  const total = distances.at(-1);
  const from = distances[start] / total;
  const to = distances[finish] / total;
  if (!Number.isFinite(from) || from === to) throw new Error('Selected road segment has no length');
  const indices = Array.from(
    { length: Math.abs(finish - start) + 1 },
    (_, i) => start + i * Math.sign(finish - start),
  );
  let elevation;
  if (data.elevation?.points?.length) {
    const profile = [...data.elevation.points].sort((a, b) => a.dist_frac - b.dist_frac);
    if (
      profile.length < 2 ||
      !profile.every(
        (point) => Number.isFinite(point.dist_frac) && Number.isFinite(point.altitude_m),
      )
    ) {
      throw new Error(`${data.slug}: supplied elevation profile is invalid`);
    }
    const interior = profile.filter(
      (point) => point.dist_frac > Math.min(from, to) && point.dist_frac < Math.max(from, to),
    );
    if (finish < start) interior.reverse();
    elevation = {
      ...data.elevation,
      points: [
        { dist_frac: 0, altitude_m: sampleProfile(profile, from) },
        ...interior.map((point) => ({
          dist_frac: (point.dist_frac - from) / (to - from),
          altitude_m: point.altitude_m,
        })),
        { dist_frac: 1, altitude_m: sampleProfile(profile, to) },
      ],
    };
    delete elevation.coordinatesHash;
  }
  return {
    ...data,
    slug: `${data.slug}-${start}-${finish}`,
    venue_name: data.display_name ?? data.venue_name,
    config_name: `Segment ${start}–${finish}`,
    featured_lap: { ...data.featured_lap, points: indices.map((index) => points[index]) },
    elevation,
  };
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
  const { points } = resampleLoop(unique, 10, data.closed !== false);
  const coordinates = points.map(([x, z]) => ({
    lat: lat0 + ((z / earthRadius) * 180) / Math.PI,
    lon: lon0 - ((x / (earthRadius * cosLat)) * 180) / Math.PI,
  }));
  const fractions = coordinates.map(
    (_, i) => i / (data.closed === false ? coordinates.length - 1 : coordinates.length),
  );
  if (data.terrain) {
    const sample = geographicRasterSampler(data.terrain);
    console.log(`  🏔️  ${data.slug}: sampling road elevation from terrain raster`);
    return {
      ...data,
      elevation: {
        source: data.terrain.source,
        points: coordinates.map(({ lat, lon }, i) => ({
          dist_frac: fractions[i],
          altitude_m: sample(lat, lon),
        })),
      },
    };
  }
  const elevation = await fetchElevationProfile(data.slug, coordinates, {
    cacheDir,
    fetch,
    fractions,
  });
  return { ...data, elevation };
}

export async function fetchElevationProfile(
  slug,
  coordinates,
  {
    cacheDir = elevationCacheDir,
    fetch = globalThis.fetch,
    fractions = coordinates.map((_, i) => i / coordinates.length),
  } = {},
) {
  if (
    coordinates.length < 2 ||
    fractions.length !== coordinates.length ||
    !fractions.every((fraction) => Number.isFinite(fraction) && fraction >= 0 && fraction <= 1)
  ) {
    throw new Error(`${slug}: invalid elevation samples`);
  }
  if (
    coordinates.some(
      ({ lat, lon }) =>
        !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180,
    )
  ) {
    throw new Error(`${slug}: invalid GPS coordinates`);
  }
  const coordinatesHash = createHash('sha256').update(JSON.stringify(coordinates)).digest('hex');
  const cacheFile = path.join(cacheDir, `${encodeURIComponent(slug)}.json`);
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
        (point, i) => Number.isFinite(point.altitude_m) && point.dist_frac === fractions[i],
      )
    ) {
      throw new Error(`${slug}: invalid elevation cache ${cacheFile}`);
    }
    elevation = cached;
    console.log(
      `  📦 ${slug}: using cached USGS elevation (${coordinates.length.toLocaleString('en-US')} samples)`,
    );
  } else {
    console.log(
      `  🌐 ${slug}: fetching USGS elevation for ${coordinates.length.toLocaleString('en-US')} samples (4 requests at a time)`,
    );
    const started = performance.now();
    const profile = [];
    try {
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
                throw new Error(`${slug}: USGS elevation request failed: HTTP ${response.status}`);
              const result = await response.json();
              const altitude =
                typeof result.value === 'string' && result.value.trim() !== ''
                  ? Number(result.value)
                  : result.value;
              if (!Number.isFinite(altitude) || altitude <= -100000) {
                throw new Error(`${slug}: USGS returned no valid elevation at ${lat}, ${lon}`);
              }
              return { dist_frac: fractions[start + offset], altitude_m: altitude };
            }),
          )),
        );
        const seconds = Math.floor((performance.now() - started) / 1000);
        const elapsed = `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const progress =
          `  🏔️  ${slug}: ${profile.length.toLocaleString('en-US')} / ${coordinates.length.toLocaleString('en-US')} elevations ` +
          `(${Math.floor((profile.length / coordinates.length) * 100)}%) · ${elapsed} elapsed`;
        if (process.stdout.isTTY) {
          process.stdout.write(`\r\x1b[2K${progress}`);
        } else if (profile.length === coordinates.length) {
          console.log(progress);
        }
      }
    } finally {
      if (process.stdout.isTTY) process.stdout.write('\n');
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
  return elevation;
}

export function convertTrack(data, options = {}) {
  const settings = {
    ...defaults,
    ...(data.closed === false ? roadImportDefaults : {}),
    ...options,
  };
  if (!Number.isFinite(settings.width) || settings.width <= 0)
    throw new Error('--width must be a positive finite number');
  const closed = data.closed !== false;
  const { unique, lat0, lon0, cosLat } = projectLap(data);
  const { points, length } = resampleLoop(unique, settings.spacing, closed);

  const profile = data.elevation?.points
    ?.filter((point) => Number.isFinite(point.altitude_m) && Number.isFinite(point.dist_frac))
    .sort((a, b) => a.dist_frac - b.dist_frac);
  let elevation = [0];
  let elevationOffset = 0;
  if (profile?.length >= 2) {
    const count = Math.max(8, Math.round(length / settings.elevationSpacing));
    const raw = Array.from({ length: count }, (_, i) =>
      sampleProfile(profile, i / (closed ? count : count - 1)),
    );
    if (closed) smoothElevationSeam(raw, length / count);
    // Open-road terrain samples need a wider, smoothly weighted filter, not a periodic seam.
    const radius = Math.round(settings.elevationSmoothing / 2 / (length / count));
    const smoothed = raw.map((_, i) => {
      if (!closed) {
        const spacing = length / (count - 1);
        const sigma = settings.elevationSmoothing / spacing;
        const extent = Math.ceil(3 * sigma);
        if (!(sigma > 0)) return raw[i];
        let sum = 0;
        let weights = 0;
        for (let offset = -extent; offset <= extent; offset++) {
          const index = i + offset;
          const weight = Math.exp(-0.5 * (offset / sigma) ** 2);
          const height =
            index < 0
              ? raw[0] + index * (raw[1] - raw[0])
              : index >= count
                ? raw[count - 1] + (index - count + 1) * (raw[count - 1] - raw[count - 2])
                : raw[index];
          sum += height * weight;
          weights += weight;
        }
        return sum / weights;
      }
      let sum = 0;
      for (let j = -radius; j <= radius; j++)
        sum += raw[closed ? (i + j + count) % count : Math.max(0, Math.min(count - 1, i + j))];
      return sum / (2 * radius + 1);
    });
    const min = Math.min(...smoothed);
    elevationOffset = min;
    elevation = smoothed.map((height) => round(height - min, 2));
  }

  return {
    id: data.slug,
    ...(!closed ? { closed: false } : {}),
    name: data.display_name ?? data.slug,
    venueName: data.venue_name,
    configName: data.config_name,
    location: data.location,
    width: settings.width,
    ...(settings.doubleYellow ? { doubleYellow: true } : {}),
    coneSpacing: 10,
    points: points.map(([x, z]) => [round(x, 2), round(z, 2)]),
    elevation,
    ...(data.terrain
      ? {
          terrain: {
            ...data.terrain,
            originLat: lat0,
            originLon: lon0,
            metersPerLongitude: ((earthRadius * Math.PI) / 180) * cosLat,
            elevationOffset,
          },
        }
      : {}),
    ...(data.elevation?.source ? { elevationSource: data.elevation.source } : {}),
  };
}

function parseArguments(argv) {
  const inputs = [];
  const options = {};
  const selection = {};
  const metadata = {};
  const terrainOptions = {};
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
    else if (argument === '--double-yellow') options.doubleYellow = true;
    else if (argument === '--no-double-yellow') options.doubleYellow = false;
    else if (argument === '--spacing') options.spacing = Number(value());
    else if (argument === '--start') selection.start = Number(value());
    else if (argument === '--finish') selection.finish = Number(value());
    else if (argument === '--slug') metadata.slug = value();
    else if (argument === '--name') metadata.display_name = value();
    else if (argument === '--venue-name') metadata.venue_name = value();
    else if (argument === '--config-name') metadata.config_name = value();
    else if (argument === '--terrain-resolution') terrainOptions.resolution = Number(value());
    else if (argument === '--terrain-margin') terrainOptions.margin = Number(value());
    else if (argument === '--terrain') terrainOptions.enabled = true;
    else if (argument === '--help' || argument === '-h') return { help: true };
    else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else inputs.push(argument);
  }
  for (const key of ['width', 'spacing']) {
    const number = options[key];
    if (number !== undefined && (!Number.isFinite(number) || number <= 0))
      throw new Error(`--${key} must be a positive finite number`);
  }
  if (metadata.slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.slug))
    throw new Error('--slug must contain lowercase letters, numbers, and hyphens');
  if ((Object.keys(metadata).length || Object.keys(selection).length) && inputs.length > 1)
    throw new Error('Naming and segment options require a single input file');
  for (const key of ['resolution', 'margin']) {
    if (terrainOptions[key] !== undefined && !Number.isFinite(terrainOptions[key]))
      throw new Error(`Invalid terrain ${key}`);
  }
  return { inputs, options, outDir, selection, metadata, terrainOptions };
}

async function main() {
  const { help, inputs, options, outDir, selection, metadata, terrainOptions } = parseArguments(
    process.argv.slice(2),
  );
  if (help || !inputs.length) {
    console.log(
      'Usage: npm run import-track -- <track.json...> [--start <index> --finish <index>] [--slug <slug>] [--name <name>] [--venue-name <venue>] [--config-name <configuration>] [--terrain] [--terrain-resolution 5] [--terrain-margin 250] [--out-dir src/tracks] [--width <m> (roads: 8, circuits: 15)] [--double-yellow | --no-double-yellow] [--spacing 8]',
    );
    if (!help) process.exitCode = 1;
    return;
  }
  await mkdir(outDir, { recursive: true });
  for (const input of inputs) {
    const source = selectTrackSegment(JSON.parse(await readFile(input, 'utf8')), selection);
    let data = { ...source, ...metadata };
    if (
      data.closed === false ||
      terrainOptions.enabled ||
      terrainOptions.resolution !== undefined ||
      terrainOptions.margin !== undefined
    ) {
      console.log(`🌄 Fetching surrounding terrain for ${data.display_name ?? data.slug}`);
      data.terrain = await fetchTerrainRaster(data, terrainOptions);
    }
    data = await fetchMissingElevation(
      data,
      source.closed === false
        ? { cacheDir: fileURLToPath(new URL('../road-imports/cache/', import.meta.url)) }
        : {},
    );
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
