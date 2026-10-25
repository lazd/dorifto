#!/usr/bin/env node
// Converts recorded-lap track JSON (featured_lap.points + elevation.points) into a
// course definition that src/courses.ts loads from src/tracks/<slug>.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchTerrainDetail, fetchTerrainRaster } from './import-terrain.mjs';

import {
  convertTrack,
  roadDistances,
  resampleLoop,
  projectLap,
  sampleProfile,
  terrainElevationProfile,
} from '../src/track-conversion.mjs';
export { convertTrack, roadDistances, roadImportDefaults } from '../src/track-conversion.mjs';
const earthRadius = 6371008.8;
const elevationEndpoint = 'https://epqs.nationalmap.gov/v1/json';
const elevationCacheDir = fileURLToPath(
  new URL('../track-import/elevation-cache/', import.meta.url),
);

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
  if (data.terrain) {
    console.log(`  🏔️  ${data.slug}: sampling road elevation from terrain raster`);
    return { ...data, elevation: terrainElevationProfile(data) };
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

function parseArguments(argv) {
  const inputs = [];
  const options = {};
  const selection = {};
  const metadata = {};
  const terrainOptions = {};
  const detailOptions = {};
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
    else if (argument === '--shoulder-width') options.shoulderWidth = Number(value());
    else if (argument === '--terrain-transition') options.terrainTransition = Number(value());
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
    else if (argument === '--terrain-detail-resolution') detailOptions.resolution = Number(value());
    else if (argument === '--terrain-detail-width') detailOptions.width = Number(value());
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
  if (
    options.shoulderWidth !== undefined &&
    (!Number.isFinite(options.shoulderWidth) || options.shoulderWidth < 0)
  )
    throw new Error('--shoulder-width must be a nonnegative finite number');
  if (
    options.terrainTransition !== undefined &&
    (!Number.isFinite(options.terrainTransition) || options.terrainTransition <= 0)
  )
    throw new Error('--terrain-transition must be a positive finite number');
  if (metadata.slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.slug))
    throw new Error('--slug must contain lowercase letters, numbers, and hyphens');
  if ((Object.keys(metadata).length || Object.keys(selection).length) && inputs.length > 1)
    throw new Error('Naming and segment options require a single input file');
  for (const key of ['resolution', 'margin']) {
    if (terrainOptions[key] !== undefined && !Number.isFinite(terrainOptions[key]))
      throw new Error(`Invalid terrain ${key}`);
  }
  if (
    detailOptions.resolution !== undefined &&
    (!Number.isFinite(detailOptions.resolution) || detailOptions.resolution < 1)
  )
    throw new Error('--terrain-detail-resolution must be at least 1');
  if (
    detailOptions.width !== undefined &&
    (!Number.isFinite(detailOptions.width) || detailOptions.width < 0)
  )
    throw new Error('--terrain-detail-width must be a nonnegative finite number');
  return { inputs, options, outDir, selection, metadata, terrainOptions, detailOptions };
}

async function main() {
  const { help, inputs, options, outDir, selection, metadata, terrainOptions, detailOptions } =
    parseArguments(process.argv.slice(2));
  if (help || !inputs.length) {
    console.log(
      'Usage: npm run import-track -- <track.json...> [--start <index> --finish <index>] [--slug <slug>] [--name <name>] [--venue-name <venue>] [--config-name <configuration>] [--terrain] [--terrain-resolution 5] [--terrain-margin 250] [--terrain-detail-resolution 1.5] [--terrain-detail-width 40 (0 disables)] [--terrain-transition 8] [--out-dir src/tracks] [--width <m> (roads: 8, circuits: 15)] [--shoulder-width 1.6] [--double-yellow | --no-double-yellow] [--spacing 8]',
    );
    if (!help) process.exitCode = 1;
    return;
  }
  await mkdir(outDir, { recursive: true });
  for (const input of inputs) {
    const source = selectTrackSegment(
      { ...JSON.parse(await readFile(input, 'utf8')), elevation: undefined },
      selection,
    );
    let data = { ...source, ...metadata };
    if (
      data.closed === false ||
      terrainOptions.enabled ||
      terrainOptions.resolution !== undefined ||
      terrainOptions.margin !== undefined
    ) {
      console.log(`🌄 Fetching surrounding terrain for ${data.display_name ?? data.slug}`);
      data.terrain = await fetchTerrainRaster(data, terrainOptions);
      if (detailOptions.width !== 0)
        data.terrain.detail = await fetchTerrainDetail(data, detailOptions);
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
