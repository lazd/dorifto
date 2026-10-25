#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import { roadDistances, roadImportDefaults } from './import-track.mjs';

const overpassEndpoint = 'https://overpass-api.de/api/interpreter';
const geocodingEndpoint = 'https://nominatim.openstreetmap.org/search';
const outputDir = fileURLToPath(new URL('../road-imports/', import.meta.url));
const responseCacheDir = path.join(outputDir, 'cache');
const helpText =
  'Usage: npm run import-road -- <slug> "<road name>" "<location query>"\n       npm run import-road -- <slug> "relation(<id>)" ["<location query>"]';
const isRelation = (name) => /^relation\(\d+\)$/.test(name);

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
    console.log(`  📦 ${service}: using cached response`);
    return result;
  }

  console.log(`  🌐 ${service}: requesting fresh data…`);
  const started = performance.now();
  let response;
  for (let attempt = 0; ; attempt++) {
    response = await fetchImpl(url, {
      headers: { accept: 'application/json', 'user-agent': 'Dorifto road importer' },
      signal: AbortSignal.timeout(timeout),
    });
    if (response.ok) break;
    const details = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 300);
    if (service === 'Overpass' && [429, 502, 503, 504].includes(response.status) && attempt < 3) {
      console.log(
        `  ⏳ Overpass: HTTP ${response.status}; retrying in 2 seconds (retry ${attempt + 1}/3)…`,
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    throw new Error(
      `${service} request failed: HTTP ${response.status}${details ? `: ${details}` : ''}`,
    );
  }
  const data = await response.json();
  const result = validate(data);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cacheFile, `${JSON.stringify(data)}\n`);
  console.log(
    `  💾 ${service}: response cached in ${((performance.now() - started) / 1000).toFixed(1)} seconds`,
  );
  return result;
}

function samePoint(a, b) {
  return a.lat === b.lat && a.lon === b.lon;
}

export function roadSections(elements, roadName = 'Road') {
  const segments = elements
    .filter((element) => Array.isArray(element.geometry) && element.geometry.length >= 2)
    .map((element) => {
      const points = element.geometry.map(({ lat, lon }) => ({ lat, lon }));
      if (points.some(({ lat, lon }) => !Number.isFinite(lat) || !Number.isFinite(lon))) {
        throw new Error(`Overpass returned invalid geometry for way ${element.id}`);
      }
      return {
        way: { id: element.id, ...element.tags },
        points: points.filter((point, i) => i === 0 || !samePoint(point, points[i - 1])),
      };
    })
    .filter(({ points }) => points.length >= 2);

  if (!segments.length) throw new Error(`${roadName}: Overpass returned no road geometry`);

  const key = ({ lat, lon }) => `${lat},${lon}`;
  const endpoints = new Map();
  for (const segment of segments) {
    for (const point of [segment.points[0], segment.points.at(-1)]) {
      const connections = endpoints.get(key(point)) ?? [];
      connections.push(segment);
      endpoints.set(key(point), connections);
    }
  }
  const remaining = new Set(segments);
  const sections = [];
  for (const segment of segments) {
    if (!remaining.delete(segment)) continue;
    const points = segment.points.slice();
    const ways = [segment.way];
    for (const prepend of [false, true]) {
      while (true) {
        const endpoint = prepend ? points[0] : points.at(-1);
        const connections = endpoints.get(key(endpoint));
        // Do not choose an arbitrary continuation at a junction.
        if (connections.length !== 2) break;
        const next = connections.find((candidate) => remaining.has(candidate));
        if (!next) break;
        remaining.delete(next);
        const ordered = samePoint(endpoint, prepend ? next.points.at(-1) : next.points[0])
          ? next.points
          : next.points.toReversed();
        if (prepend) points.unshift(...ordered.slice(0, -1));
        else points.push(...ordered.slice(1));
        ways.push(next.way);
      }
    }
    sections.push({ points, ways, length: roadDistances(points).at(-1) });
  }
  return sections.sort((a, b) => b.length - a.length);
}

const formatCoordinate = ({ lat, lon }) =>
  `${Math.abs(lat).toFixed(6)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(6)}° ${lon < 0 ? 'W' : 'E'}`;

export function combineRoadSections(sections) {
  if (!sections.length) throw new Error('No road sections to combine');
  const remaining = [...sections].sort((a, b) => b.length - a.length);
  const points = remaining.shift().points.slice();
  const connectors = [];
  while (remaining.length) {
    let best;
    remaining.forEach((section, index) => {
      for (const prepend of [false, true]) {
        const from = prepend ? points[0] : points.at(-1);
        for (const reverse of [false, true]) {
          const to = prepend !== reverse ? section.points.at(-1) : section.points[0];
          const distance = roadDistances([from, to]).at(-1);
          if (!best || distance < best.distance)
            best = { index, prepend, reverse, from, to, distance };
        }
      }
    });
    const section = remaining.splice(best.index, 1)[0];
    const ordered = best.reverse ? section.points.toReversed() : section.points;
    const connected = samePoint(best.from, best.to);
    if (!connected) connectors.push({ from: best.from, to: best.to, length: best.distance });
    if (best.prepend) points.unshift(...(connected ? ordered.slice(0, -1) : ordered));
    else points.push(...(connected ? ordered.slice(1) : ordered));
  }
  return { points, connectors };
}

async function chooseRoadSection(sections) {
  const prompt = `Choose a section (1–${sections.length}), c to combine all, or q to cancel: `;
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    input.setPrompt(prompt);
    input.prompt();
    for await (const answer of input) {
      if (answer.trim().toLowerCase() === 'q') throw new Error('Road import cancelled');
      if (['c', 'combine'].includes(answer.trim().toLowerCase())) return 'combine';
      const choice = Number(answer.trim());
      if (Number.isInteger(choice) && choice >= 1 && choice <= sections.length) return choice - 1;
      console.log(`Enter a number from 1 to ${sections.length}, c to combine all, or q to cancel.`);
      input.prompt();
    }
    throw new Error('No road section selected; run interactively to choose a section');
  } finally {
    input.close();
  }
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
  selectSection = chooseRoadSection,
) {
  const url = new URL(overpassEndpoint);
  url.searchParams.set('data', query);
  const sections = await cachedResponse(url, {
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
      console.log(
        `  🧩 Connecting ${result.elements.length.toLocaleString('en-US')} road segments`,
      );
      return roadSections(
        result.elements,
        locationQuery ? `${roadName} in ${locationQuery}` : roadName,
      );
    },
  });
  if (sections.length === 1) return sections[0].points;
  console.log(
    `  🧭 Found ${sections.length} separate sections (split at gaps and branching junctions):`,
  );
  sections.forEach(({ points, ways, length }, index) => {
    const details = ['name', 'ref', 'highway', 'surface', 'lanes', 'oneway', 'access']
      .map((tag) => {
        const values = [...new Set(ways.map((way) => way[tag]).filter(Boolean))];
        return values.length ? `${tag}: ${values.join(', ')}` : '';
      })
      .filter(Boolean)
      .join(' · ');
    const distance = length < 1000 ? `${length.toFixed(0)} m` : `${(length / 1000).toFixed(2)} km`;
    console.log(
      `\n     ${index + 1}. ${distance} · ${points.length.toLocaleString('en-US')} coordinates · ${ways.length} OSM ways\n` +
        `        Start: ${formatCoordinate(points[0])}\n` +
        `        End:   ${formatCoordinate(points.at(-1))}\n` +
        (details ? `        ${details}\n` : '') +
        `        ${ways.map(({ id }) => `https://www.openstreetmap.org/way/${id}`).join('\n        ')}`,
    );
  });
  console.log(
    '\n     c. Combine all sections (nearest endpoints; straight connectors across gaps)',
  );
  const choice = await selectSection(sections);
  if (choice === 'combine') {
    const { points, connectors } = combineRoadSections(sections);
    for (const { from, to, length } of connectors) {
      console.log(
        `  ⚠️  Adding straight connector: ${length.toFixed(1)} m · ${formatCoordinate(from)} → ${formatCoordinate(to)}`,
      );
    }
    console.log(
      `  ✅ Combined ${sections.length} sections · ${(roadDistances(points).at(-1) / 1000).toFixed(2)} km · ${connectors.length} artificial connectors`,
    );
    return points;
  }
  if (!Number.isInteger(choice) || choice < 0 || choice >= sections.length)
    throw new Error('Invalid road section selection');
  console.log(`  ✅ Selected section ${choice + 1}`);
  return sections[choice].points;
}

function escapeOverpassString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function escapeOverpassRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildOverpassStateHighwayQuery(name, locationQuery) {
  return `[out:json][timeout:25];

area["ISO3166-2"="${locationQuery}"]->.searchArea;
(
  way["highway"]["ref"="${name}"](area.searchArea);
);

// Output the geometry so it draws on the map
out geom;`;
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
    const svg = roadPreviewSvg(points, roadImportDefaults.width, {
      size: 800,
      padding: 32,
      title: source.display_name,
    });
    const escape = (text) =>
      text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
    const previewScript = await readFile(new URL('./road-preview.mjs', import.meta.url), 'utf8');
    await writeFile(
      output,
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(source.display_name)} — Road preview</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #181818; color: #eee; --accent: #6de2b8; --panel: #262626; --border: #555; }
    body { max-width: 800px; margin: auto; padding: 24px; }
    svg { display: block; width: 100%; height: auto; cursor: crosshair; }
    p { line-height: 1.5; }
    .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    label { display: grid; gap: 6px; }
    input, select, textarea, button { font: inherit; padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: inherit; }
    textarea { box-sizing: border-box; width: 100%; margin: 16px 0; min-height: 100px; }
    button { cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    .selection { stroke: var(--accent); stroke-width: 5; fill: none; pointer-events: none; }
    .endpoint { fill: var(--accent); stroke: #181818; stroke-width: 2; pointer-events: none; }
  </style>
</head>
<body>
  <h1>${escape(source.display_name)}</h1>
  <p>${escape(source.venue_name)} · ${points.length} coordinates · North up</p>
  ${svg}
  <p>Open road: checkered markers show the start and finish. No closing segment is added.</p>
  <p id="selection-status" role="status">Click the road to choose a start, then click again to choose a finish.</p>
  <div class="fields">
    <label>Import slug<input id="segment-slug" value="${escape(source.slug)}"></label>
    <label>Display name<input id="segment-name" value="${escape(source.display_name)}"></label>
    <label>Venue name<input id="segment-venue" value="${escape(source.display_name)}"></label>
    <label>Configuration name<input id="segment-config" value=""></label>
    <label>Road width (meters)<input id="segment-width" type="number" min="0.1" step="0.1" value="${roadImportDefaults.width}"></label>
    <label>Paved shoulder width (meters per side)<input id="segment-shoulder" type="number" min="0" step="0.1" value="1.6"></label>
    <label>Terrain transition (meters)<input id="segment-transition" type="number" min="0.1" step="0.1" value="8"></label>
    <label>Center divider<select id="segment-divider"><option value="">None</option><option value="double-yellow" selected>Double yellow</option></select></label>
  </div>
  <textarea id="import-command" readonly aria-label="Import command" data-source="${escape(path.relative(process.cwd(), output.replace(/\.html$/, '.json')))}" data-slug="${escape(source.slug)}"></textarea>
  <button id="copy-command" disabled>Copy import command</button>
  <button id="reset-selection">Reset selection</button>
  <p id="copy-status" role="status"></p>
  <script type="module">${previewScript}</script>
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
  if (!isRelation(name) && !locationQuery?.trim())
    throw new Error('A location query is required as the third argument');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Slug must contain only lowercase letters, numbers, and hyphens');
  }
  console.log(`\n📍 [1/4] Finding ${name}${locationQuery ? ` in ${locationQuery}` : ''}`);

  let query;
  if (isRelation(name)) {
    console.log(`  🛠️  Detected relation: ${name}`);
    query = `[out:json][timeout:25];
${name};
way(r);
out geom;`;
  } else if (
    locationQuery.match(/^US-[A-Z]+/) &&
    (name.match(/^I\s\d+$/) || name.match(/^US\s\d+$/) || name.match(/^[A-Z]{2}\s\d+[A-Za-z]?$/))
  ) {
    console.log(`  🇺🇸 Detected US state query: ${locationQuery}`);
    query = buildOverpassStateHighwayQuery(name, locationQuery);
  } else {
    const bbox = await fetchPlaceBoundingBox(locationQuery, fetchImpl, cacheDir);
    const [south, north, west, east] = bbox;
    const latitude = (value) => `${Math.abs(value).toFixed(6)}° ${value < 0 ? 'S' : 'N'}`;
    const longitude = (value) => `${Math.abs(value).toFixed(6)}° ${value < 0 ? 'W' : 'E'}`;
    console.log(
      `  🗺️  Search bounds:\n` +
        `     Southwest: ${latitude(south)}, ${longitude(west)}\n` +
        `     Northeast: ${latitude(north)}, ${longitude(east)}`,
    );
    query = buildOverpassQuery(name, bbox);
  }
  console.log(`\n🛣️  [2/4] Finding ${name}`);
  if (process.env['DEBUG']) {
    console.log(`  🔍 Overpass query:\n${query}`);
  }
  const coordinates = await fetchRoadCoordinates(query, name, locationQuery, fetchImpl, cacheDir);
  console.log(
    `  ✅ ${coordinates.length.toLocaleString('en-US')} coordinates ordered from start to finish`,
  );
  const length = roadDistances(coordinates).at(-1);
  if (!(length > 0)) throw new Error(`${name}: road has no length`);

  const source = {
    slug,
    closed: false,
    display_name: name,
    venue_name: locationQuery?.trim() || name,
    location: {
      lat: coordinates.reduce((sum, point) => sum + point.lat, 0) / coordinates.length,
      lon: coordinates.reduce((sum, point) => sum + point.lon, 0) / coordinates.length,
    },
    featured_lap: { points: coordinates },
  };
  const output = path.join(outDir, `${source.slug}.json`);
  console.log(`\n📝 [3/4] Saving road source`);
  await mkdir(outDir, { recursive: true });
  await writeFile(output, `${JSON.stringify(source, null, 2)}\n`);
  console.log(`  💾 ${output}`);
  console.log(`\n🖼️  [4/4] Generating HTML preview`);
  const previewOutput = path.join(outDir, `${source.slug}.html`);
  await writeRoadPreview(source, previewOutput);
  console.log(`  🔗 ${previewOutput}`);
  console.log(`\n✅ ${name} imported successfully (${(length / 1000).toFixed(2)} km, open route)`);
  console.log(
    '  👉 Open the HTML preview to select a section before fetching elevation at track import.',
  );
  console.log(
    `  👉 Import into the game:\n     npm run import-track -- ${path.relative(process.cwd(), output)}`,
  );
}

export function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  if (argv.length !== 3 && !(argv.length === 2 && isRelation(argv[1]))) throw new Error(helpText);
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
        console.error(`❌ Road import failed: ${error.message}`);
        process.exitCode = 1;
      });
    }
  } catch (error) {
    console.error(`❌ Road import failed: ${error.message}`);
    process.exitCode = 1;
  }
}
