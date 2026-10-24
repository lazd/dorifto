#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const overpassEndpoint = 'https://overpass-api.de/api/interpreter';
const geocodingEndpoint = 'https://nominatim.openstreetmap.org/search';
const outputDir = fileURLToPath(new URL('../road-imports/', import.meta.url));
const responseCacheDir = path.join(outputDir, 'cache');
const helpText = 'Usage: npm run import-road -- <slug> "<road name>" "<location query>"';

async function cachedResponse(url, { service, timeout, fetchImpl, cacheDir, validate }) {
  const hash = createHash('sha256').update(url.href).digest('hex');
  const cacheFile = path.join(cacheDir, `${service}-${hash}.json`);
  let cached;
  try {
    cached = await readFile(cacheFile, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (cached !== undefined) {
    const result = validate(JSON.parse(cached));
    console.log(`  ${service}: cache hit`);
    return result;
  }

  console.log(`  ${service}: cache miss, requesting data...`);
  const started = performance.now();
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': 'Dorifto road importer' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    const details = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 300);
    throw new Error(
      `${service} request failed: HTTP ${response.status}${details ? `: ${details}` : ''}`,
    );
  }
  const data = await response.json();
  const result = validate(data);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cacheFile, `${JSON.stringify(data)}\n`);
  console.log(
    `  ${service}: response cached (${((performance.now() - started) / 1000).toFixed(1)}s)`,
  );
  return result;
}

function samePoint(a, b) {
  return a.lat === b.lat && a.lon === b.lon;
}

export function orderWaySegments(elements, roadName = 'Road') {
  const segments = elements
    .filter((element) => Array.isArray(element.geometry) && element.geometry.length >= 2)
    .map((element) => {
      const points = element.geometry.map(({ lat, lon }) => ({ lat, lon }));
      if (points.some(({ lat, lon }) => !Number.isFinite(lat) || !Number.isFinite(lon))) {
        throw new Error(`Overpass returned invalid geometry for way ${element.id}`);
      }
      return points.filter((point, i) => i === 0 || !samePoint(point, points[i - 1]));
    })
    .filter((points) => points.length >= 2);

  if (!segments.length) throw new Error(`${roadName}: Overpass returned no road geometry`);

  const remaining = segments.slice(1);
  const points = segments[0].slice();
  while (remaining.length) {
    const tailMatches = remaining
      .map((segment, index) => ({ segment, index }))
      .filter(
        ({ segment }) =>
          samePoint(points.at(-1), segment[0]) || samePoint(points.at(-1), segment.at(-1)),
      );
    if (tailMatches.length > 1) {
      throw new Error(`${roadName}: road geometry branches; narrow the Overpass query`);
    }
    if (tailMatches.length === 1) {
      const { segment, index } = tailMatches[0];
      const ordered = samePoint(points.at(-1), segment[0]) ? segment : segment.toReversed();
      points.push(...ordered.slice(1));
      remaining.splice(index, 1);
      continue;
    }

    const headMatches = remaining
      .map((segment, index) => ({ segment, index }))
      .filter(
        ({ segment }) => samePoint(points[0], segment[0]) || samePoint(points[0], segment.at(-1)),
      );
    if (headMatches.length > 1) {
      throw new Error(`${roadName}: road geometry branches; narrow the Overpass query`);
    }
    if (headMatches.length === 1) {
      const { segment, index } = headMatches[0];
      const ordered = samePoint(points[0], segment.at(-1)) ? segment : segment.toReversed();
      points.unshift(...ordered.slice(0, -1));
      remaining.splice(index, 1);
      continue;
    }

    throw new Error(`${roadName}: ${remaining.length} road segment(s) are disconnected`);
  }

  return points;
}

export async function fetchPlaceBoundingBox(
  locationQuery,
  fetchImpl = globalThis.fetch,
  cacheDir = responseCacheDir,
) {
  const url = new URL(geocodingEndpoint);
  url.searchParams.set('q', locationQuery);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  return cachedResponse(url, {
    service: 'Nominatim',
    timeout: 30000,
    fetchImpl,
    cacheDir,
    validate(results) {
      const raw = Array.isArray(results) ? results[0]?.boundingbox : undefined;
      const bbox = Array.isArray(raw) ? raw.map(Number) : undefined;
      if (
        !bbox ||
        bbox.length !== 4 ||
        !bbox.every(Number.isFinite) ||
        bbox[0] >= bbox[1] ||
        bbox[2] >= bbox[3]
      ) {
        throw new Error(`OpenStreetMap could not find a bounding box for ${locationQuery}`);
      }
      return bbox;
    },
  });
}

export async function fetchRoadCoordinates(
  query,
  roadName,
  locationQuery,
  fetchImpl = globalThis.fetch,
  cacheDir = responseCacheDir,
) {
  const url = new URL(overpassEndpoint);
  url.searchParams.set('data', query);
  return cachedResponse(url, {
    service: 'Overpass',
    timeout: 60000,
    fetchImpl,
    cacheDir,
    validate(result) {
      if (result.remark || !Array.isArray(result.elements)) {
        throw new Error(
          `Overpass API returned an invalid response${result.remark ? `: ${result.remark}` : ''}`,
        );
      }
      console.log(`  Overpass: ordering ${result.elements.length} road segments`);
      return orderWaySegments(result.elements, `${roadName} in ${locationQuery}`);
    },
  });
}

function escapeOverpassString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function escapeOverpassRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildOverpassQuery(name, [south, north, west, east]) {
  const suffixes = {
    Road: ['Road', 'Rd'],
    Street: ['Street', 'St'],
    Avenue: ['Avenue', 'Ave'],
    Boulevard: ['Boulevard', 'Blvd'],
    Highway: ['Highway', 'Hwy'],
    Drive: ['Drive', 'Dr'],
    Lane: ['Lane', 'Ln'],
    Court: ['Court', 'Ct'],
    Place: ['Place', 'Pl'],
    Parkway: ['Parkway', 'Pkwy'],
    Circle: ['Circle', 'Cir'],
  };
  const suffixMatch = name.match(/^(.*\S)\s+(\S+)$/);
  const variants =
    suffixMatch &&
    Object.entries(suffixes).find(([full, [_, abbreviation]]) =>
      [full, abbreviation].some((suffix) => suffix.toLowerCase() === suffixMatch[2].toLowerCase()),
    );
  const names = variants ? variants[1].map((suffix) => `${suffixMatch[1]} ${suffix}`) : [name];
  const namePattern = `^(${names.map(escapeOverpassRegex).join('|')})$`;
  return `
[out:json][timeout:25];
way["highway"]["access"!="private"]["name"~"${escapeOverpassString(namePattern)}",i](${south},${west},${north},${east});
out geom;
`;
}

async function writeRoadPreview(source, output) {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  try {
    const { roadPreviewSvg } = await server.ssrLoadModule('/src/course-preview.ts');
    const earthRadius = 6371008.8;
    const radians = Math.PI / 180;
    const { lat, lon } = source.location;
    const points = source.featured_lap.points.map((point) => ({
      x: (point.lon - lon) * radians * earthRadius * Math.cos(lat * radians),
      z: (point.lat - lat) * radians * earthRadius,
    }));
    const svg = roadPreviewSvg(points, 15, { size: 800, padding: 32, title: source.display_name });
    const escape = (text) =>
      text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
    await writeFile(
      output,
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(source.display_name)} — Road preview</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #181818; color: #eee; }
    body { max-width: 800px; margin: auto; padding: 24px; }
    svg { display: block; width: 100%; height: auto; }
    p { line-height: 1.5; }
  </style>
</head>
<body>
  <h1>${escape(source.display_name)}</h1>
  <p>${escape(source.venue_name)} · ${points.length} coordinates · North up</p>
  ${svg}
  <p>Open road: checkered markers show the start and finish. No closing segment is added.</p>
</body>
</html>
`,
    );
  } finally {
    await server.close();
  }
}

export async function importRoad({
  slug,
  name,
  locationQuery,
  fetchImpl = globalThis.fetch,
  outDir = outputDir,
  cacheDir = responseCacheDir,
} = {}) {
  if (!slug) throw new Error('A slug is required as the first argument');
  if (!name?.trim()) throw new Error('A road name is required as the second argument');
  if (!locationQuery?.trim()) throw new Error('A location query is required as the third argument');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Slug must contain only lowercase letters, numbers, and hyphens');
  }
  console.log(`[1/4] Finding bounding box for ${locationQuery}`);
  const bbox = await fetchPlaceBoundingBox(locationQuery, fetchImpl, cacheDir);
  const [south, north, west, east] = bbox;
  console.log(`${name}: bounding box`, { south, west, north, east });
  const query = buildOverpassQuery(name, bbox);
  console.log(`[2/4] Finding ${name} road geometry`);
  const coordinates = await fetchRoadCoordinates(query, name, locationQuery, fetchImpl, cacheDir);
  if (coordinates.length < 8) {
    throw new Error(`${name}: expected at least 8 coordinates, got ${coordinates.length}`);
  }
  console.log(`${name}: fetched ${coordinates.length} ordered road coordinates`);

  const source = {
    slug,
    display_name: name,
    venue_name: locationQuery,
    location: {
      lat: coordinates.reduce((sum, point) => sum + point.lat, 0) / coordinates.length,
      lon: coordinates.reduce((sum, point) => sum + point.lon, 0) / coordinates.length,
    },
    featured_lap: { points: coordinates },
  };
  const output = path.join(outDir, `${source.slug}.json`);
  console.log(`[3/4] Writing road source`);
  await mkdir(outDir, { recursive: true });
  await writeFile(output, `${JSON.stringify(source, null, 2)}\n`);
  console.log(`${name}: wrote ${output}`);
  console.log(`[4/4] Generating HTML preview`);
  const previewOutput = path.join(outDir, `${source.slug}.html`);
  await writeRoadPreview(source, previewOutput);
  console.log(`${name}: preview ${previewOutput}`);
  console.log(`Next: npm run import-track -- ${path.relative(process.cwd(), output)}`);
}

export function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  if (argv.length !== 3) throw new Error(helpText);
  const [slug, name, locationQuery] = argv;
  return { slug, name, locationQuery };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(`${helpText}\nQuote each multiword argument.`);
    } else {
      importRoad(options).catch((error) => {
        console.error(`Road import failed: ${error.message}`);
        process.exitCode = 1;
      });
    }
  } catch (error) {
    console.error(`Road import failed: ${error.message}`);
    process.exitCode = 1;
  }
}
