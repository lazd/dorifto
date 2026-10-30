#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createBrotliCompress, constants } from 'node:zlib';
import { isOsmNetworkTag, osmRoadClasses } from '../src/osm-network.mjs';

const usage = `Usage: npm run import-osm-region -- REGION [--input FILE] [--output FILE.osm.pbf]

Example: npm run import-osm-region -- north-america/us/california/norcal
Requires osmium-tool (macOS: brew install osmium-tool).
Downloads and MD5-verifies the Geofabrik extract, reusing an unchanged cached file.
Keeps drivable roads, their stop signs, parking, and all referenced geometry.
Preserves road connectivity, coordinate precision, lane/turn-lane and speed tags.
Removes unrelated features, names, edit metadata, and unused tags.
Writes standard .osm.pbf and whole-file Brotli-compressed .osm.pbf.br versions.
Both are regional datasets, not spatially indexed browser tiles.
Buildings, vegetation, water, and elevation still use the existing importers.`;
const defaultDirectory = fileURLToPath(new URL('../data-imports/geofabrik/', import.meta.url));
const highways = new Set(osmRoadClasses.flatMap((name) => [name, `${name}_link`]));

function osmium(args, stdio = ['ignore', 'inherit', 'inherit']) {
  const child = spawn('osmium', args, { stdio });
  const done = new Promise((resolve, reject) => {
    child.once('error', (error) =>
      reject(
        new Error(`Could not run osmium: ${error.message}. Install osmium-tool before importing.`, {
          cause: error,
        }),
      ),
    );
    child.once('close', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`osmium ${args[0]} failed (${signal ?? code}).`)),
    );
  });
  return { child, done };
}

async function checksum(file) {
  const hash = createHash('md5');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function download(region, directory) {
  const url = `https://download.geofabrik.de/${region}-latest.osm.pbf`;
  const checksumResponse = await fetch(`${url}.md5`, { signal: AbortSignal.timeout(30_000) });
  if (!checksumResponse.ok)
    throw new Error(`Geofabrik checksum request failed (${checksumResponse.status}): ${url}.md5`);
  const expected = (await checksumResponse.text()).match(/^([a-f0-9]{32})\s/i)?.[1].toLowerCase();
  if (!expected) throw new Error('Geofabrik returned an invalid MD5 checksum.');
  const file = path.join(directory, 'source.osm.pbf');
  let cached = false;
  try {
    cached = (await checksum(file)) === expected;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (cached) {
    console.log(`Using verified cached extract: ${file}`);
    return file;
  }
  console.log(`Downloading ${url}`);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30 * 60_000) });
    if (!response.ok || !response.body)
      throw new Error(`Geofabrik download failed (${response.status}): ${url}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }));
    if ((await checksum(temporary)) !== expected)
      throw new Error('Geofabrik download checksum mismatch. Run the import again.');
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  return file;
}

export async function* compactOpl(input, counts) {
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    const fields = line.split(' ');
    const kind = fields[0][0];
    if (!['n', 'w', 'r'].includes(kind)) throw new Error('Invalid OPL object from osmium.');
    const entries = (fields.find((field) => field.startsWith('T'))?.slice(1) ?? '')
      .split(',')
      .filter(Boolean);
    const tags = new Map(
      entries.map((entry) => {
        const separator = entry.indexOf('=');
        if (separator < 1) throw new Error('Invalid OPL tag from osmium.');
        return [entry.slice(0, separator), entry.slice(separator + 1)];
      }),
    );
    const road = kind === 'w' && highways.has(tags.get('highway'));
    const stop = kind === 'n' && tags.get('highway') === 'stop';
    const parking = tags.get('amenity') === 'parking';
    const retained =
      road || stop || parking
        ? entries.filter((entry) => isOsmNetworkTag(entry.split('=')[0]))
        : [];
    counts.nodes += Number(kind === 'n');
    counts.ways += Number(kind === 'w');
    counts.relations += Number(kind === 'r');
    counts.roads += Number(road);
    counts.stopSigns += Number(stop);
    counts.parking += Number(parking);
    const geometry = fields.filter((field) => ['x', 'y', 'N', 'M'].includes(field[0]));
    yield `${[fields[0], `T${retained.join(',')}`, ...geometry].join(' ')}\n`;
  }
}

async function compact(source, selected, output) {
  console.log('Selecting roads, parking, and their referenced geometry...');
  await osmium([
    'tags-filter',
    source,
    `w/highway=${[...highways].join(',')}`,
    'nwr/amenity=parking',
    '-o',
    selected,
    '-f',
    'pbf,add_metadata=false',
  ]).done;
  console.log('Removing unused tags and edit metadata...');
  const reader = osmium(['cat', selected, '-f', 'opl'], ['ignore', 'pipe', 'inherit']);
  const writer = osmium(
    [
      'cat',
      '-F',
      'opl',
      '-',
      '-o',
      output,
      '-f',
      'pbf,add_metadata=false,pbf_compression=zlib,pbf_compression_level=9',
    ],
    ['pipe', 'inherit', 'inherit'],
  );
  const counts = { nodes: 0, ways: 0, relations: 0, roads: 0, stopSigns: 0, parking: 0 };
  try {
    await Promise.all([
      reader.done,
      writer.done,
      pipeline(compactOpl(reader.child.stdout, counts), writer.child.stdin),
    ]);
  } catch (error) {
    reader.child.kill();
    writer.child.kill();
    await Promise.allSettled([reader.done, writer.done]);
    throw error;
  }
  console.log('Checking that every way and relation reference is present...');
  await osmium(['check-refs', '--check-relations', output]).done;
  return counts;
}

async function brotli(source, output) {
  console.log('Brotli-compressing the compact protobuf data...');
  const reader = osmium(
    ['cat', source, '-f', 'pbf,add_metadata=false,pbf_compression=none'],
    ['ignore', 'pipe', 'inherit'],
  );
  try {
    await Promise.all([
      reader.done,
      pipeline(
        reader.child.stdout,
        createBrotliCompress({
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        }),
        createWriteStream(output, { flags: 'wx' }),
      ),
    ]);
  } catch (error) {
    reader.child.kill();
    await Promise.allSettled([reader.done]);
    throw error;
  }
}

async function main(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  const [region, ...options] = args;
  if (!region || !/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(region))
    throw new Error(`Supply a Geofabrik region path.\n${usage}`);
  let input;
  let output;
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (!['--input', '--output'].includes(option) || !options[i + 1])
      throw new Error(`Unknown or incomplete option: ${option}\n${usage}`);
    if (option === '--input') input = path.resolve(options[++i]);
    else output = path.resolve(options[++i]);
  }
  const directory = path.join(defaultDirectory, region);
  output ??= path.join(directory, 'network.osm.pbf');
  if (!output.endsWith('.osm.pbf')) throw new Error('--output must end with .osm.pbf');
  await osmium(['--version']).done;
  await mkdir(directory, { recursive: true });
  await mkdir(path.dirname(output), { recursive: true });
  const source = input ?? (await download(region, directory));
  if (path.resolve(source) === output) throw new Error('Input and output paths must differ.');
  const temporary = `${output}.${randomUUID()}`;
  const selected = `${temporary}.selected.osm.pbf`;
  const compacted = `${temporary}.osm.pbf`;
  const compressed = `${temporary}.osm.pbf.br`;
  try {
    const counts = await compact(source, selected, compacted);
    await brotli(compacted, compressed);
    await rename(compacted, output);
    await rename(compressed, `${output}.br`);
    const originalBytes = (await stat(source)).size;
    const pbfBytes = (await stat(output)).size;
    const brotliBytes = (await stat(`${output}.br`)).size;
    console.log(
      JSON.stringify(
        {
          region,
          source,
          originalBytes,
          pbf: { file: output, bytes: pbfBytes },
          brotli: { file: `${output}.br`, bytes: brotliBytes },
          reductionPercent: Number(
            ((1 - Math.min(pbfBytes, brotliBytes) / originalBytes) * 100).toFixed(2),
          ),
          counts,
          attribution: 'OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright',
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all([selected, compacted, compressed].map((file) => rm(file, { force: true })));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
