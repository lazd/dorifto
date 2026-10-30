#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../data-imports/geofabrik/', import.meta.url));
const indexVersion = 1;
const usage = `Usage: npm run serve-map-data -- REGION [REGION ...] [--port 8787]
Example: npm run serve-map-data -- north-america/us/california/norcal
Requires Node >=22.13 and osmium-tool; run import-osm-region for each region first.
Builds/reuses a disk-backed SQLite spatial index beside each network.osm.pbf.
Serves GET /osm?bbox=west,south,east,north on loopback only.
Coverage misses are appended to data-imports/geofabrik/coverage-misses.jsonl.
Enable the client with VITE_LOCAL_MAP_DATA=true (optional VITE_LOCAL_MAP_DATA_URL).
The index is derived data and can be deleted/rebuilt; no Brotli file is needed.`;

const decodeOpl = (value) =>
  value.replace(/%([0-9a-f]+)%/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

export function parseOpl(line) {
  const [identity, ...fields] = line.split(' ');
  const type = { n: 'node', w: 'way', r: 'relation' }[identity[0]];
  if (!type) throw new Error(`Unknown OPL object: ${identity}`);
  const values = Object.fromEntries(fields.map((field) => [field[0], field.slice(1)]));
  const tags = Object.fromEntries(
    (values.T ? values.T.split(',') : []).map((tag) => {
      const separator = tag.indexOf('=');
      if (separator < 1) throw new Error(`Invalid OPL tag: ${tag}`);
      return [decodeOpl(tag.slice(0, separator)), decodeOpl(tag.slice(separator + 1))];
    }),
  );
  const element = { type, id: Number(identity.slice(1)), tags };
  if (type === 'node') {
    element.lon = Number(values.x);
    element.lat = Number(values.y);
    if (![element.lon, element.lat].every(Number.isFinite))
      throw new Error(`Missing coordinates for OSM node ${element.id}`);
  } else if (type === 'way') {
    element.nodes = values.N ? values.N.split(',').map((ref) => Number(ref.slice(1))) : [];
  } else {
    element.members = values.M
      ? values.M.split(',').map((member) => {
          const separator = member.indexOf('@');
          if (separator < 2) throw new Error(`Invalid OPL member: ${member}`);
          return {
            type: { n: 'node', w: 'way', r: 'relation' }[member[0]],
            ref: Number(member.slice(1, separator)),
            role: decodeOpl(member.slice(separator + 1)),
          };
        })
      : [];
  }
  return element;
}

export function parsePolygon(text) {
  const lines = text.trim().split(/\r?\n/);
  const rings = [];
  let ring;
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'END') {
      if (ring) {
        if (ring.points.length < 3) throw new Error('Invalid Geofabrik coverage ring');
        rings.push(ring);
        ring = undefined;
      } else break;
    } else if (!ring) {
      ring = { hole: line.startsWith('!'), points: [] };
    } else {
      const point = line.split(/\s+/).map(Number);
      if (point.length !== 2 || !point.every(Number.isFinite))
        throw new Error('Invalid Geofabrik coverage coordinate');
      ring.points.push(point);
    }
  }
  if (ring || !rings.some((item) => !item.hole))
    throw new Error('Incomplete Geofabrik coverage polygon');
  return rings;
}

function inRing([x, y], points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function coversBox(rings, [west, south, east, north]) {
  const corners = [
    [west, south],
    [west, north],
    [east, south],
    [east, north],
  ];
  if (
    !corners.every(
      (point) =>
        rings.some((ring) => !ring.hole && inRing(point, ring.points)) &&
        !rings.some((ring) => ring.hole && inRing(point, ring.points)),
    )
  )
    return false;
  // Corners alone miss holes and concave boundaries crossing the requested square.
  for (const { points } of rings) {
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [x, y] = points[j];
      const dx = points[i][0] - x;
      const dy = points[i][1] - y;
      let low = 0;
      let high = 1;
      for (const [p, q] of [
        [-dx, x - west],
        [dx, east - x],
        [-dy, y - south],
        [dy, north - y],
      ]) {
        if (p === 0) {
          if (q < 0) high = -1;
        } else if (p < 0) low = Math.max(low, q / p);
        else high = Math.min(high, q / p);
      }
      if (low <= high) return false;
    }
  }
  return true;
}

function unionBounds(boxes) {
  if (!boxes.length) throw new Error('OSM object has no referenced geometry');
  return [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3])),
  ];
}

function storeQueries(db) {
  const node = db.prepare('SELECT lon, lat, tags FROM nodes WHERE id = ?');
  const object = db.prepare('SELECT key, data FROM objects WHERE type = ? AND id = ?');
  const bounds = db.prepare('SELECT west, south, east, north FROM bounds WHERE key = ?');
  const getNode = (id) => {
    const point = node.get(id);
    if (!point) throw new Error(`Missing OSM node ${id} in local index`);
    return point;
  };
  const getObject = (type, id) => {
    const row = object.get(type, id);
    if (!row) throw new Error(`Missing OSM ${type} ${id} in local index`);
    return { key: row.key, element: JSON.parse(row.data) };
  };
  const objectBounds = (type, id, ancestors = new Set()) => {
    if (type === 'node') {
      const { lon, lat } = getNode(id);
      return [lon, lat, lon, lat];
    }
    const { key, element } = getObject(type, id);
    const indexed = bounds.get(key);
    if (indexed) return [indexed.west, indexed.south, indexed.east, indexed.north];
    if (ancestors.has(id)) {
      console.warn(`OSM relation ${id} contains a cyclic member; ignoring that reference.`);
      return;
    }
    const next = new Set([...ancestors, id]);
    const boxes = element.members
      .map((member) => objectBounds(member.type, member.ref, next))
      .filter(Boolean);
    if (boxes.length) return unionBounds(boxes);
  };
  const geometry = (element) =>
    element.nodes.map((id) => {
      const { lon, lat } = getNode(id);
      return { lon, lat };
    });
  return { getNode, getObject, objectBounds, geometry };
}

async function buildIndex(region, source, destination, fingerprint) {
  console.log(`Indexing ${region}; this is a one-time streaming import...`);
  const response = await fetch(`https://download.geofabrik.de/${region}.poly`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Geofabrik coverage download failed (${response.status})`);
  const polygon = parsePolygon(await response.text());
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const db = new DatabaseSync(temporary);
  let reader;
  let done;
  let ready = false;
  try {
    db.exec(`
      PRAGMA journal_mode=OFF;
      PRAGMA synchronous=OFF;
      CREATE TABLE metadata (data TEXT NOT NULL);
      CREATE TABLE nodes (id INTEGER PRIMARY KEY, lon REAL NOT NULL, lat REAL NOT NULL, tags TEXT);
      CREATE TABLE objects (key INTEGER PRIMARY KEY, type TEXT NOT NULL, id INTEGER NOT NULL,
        data TEXT NOT NULL, UNIQUE(type, id));
      CREATE VIRTUAL TABLE bounds USING rtree(key, west, east, south, north);
      BEGIN;
    `);
    const insertNode = db.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?)');
    const insertObject = db.prepare('INSERT INTO objects(type, id, data) VALUES (?, ?, ?)');
    const insertBounds = db.prepare('INSERT INTO bounds VALUES (?, ?, ?, ?, ?)');
    const queries = storeQueries(db);
    reader = spawn('osmium', ['cat', source, '-f', 'opl'], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    done = new Promise((resolve, reject) => {
      reader.once('error', reject);
      reader.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`osmium index reader failed (${code})`)),
      );
    });
    done.catch(() => {});
    let count = 0;
    const relations = [];
    for await (const line of createInterface({ input: reader.stdout, crlfDelay: Infinity })) {
      const element = parseOpl(line);
      if (element.type === 'node') {
        insertNode.run(
          element.id,
          element.lon,
          element.lat,
          Object.keys(element.tags).length ? JSON.stringify(element.tags) : null,
        );
        if (element.tags.highway !== 'stop' && element.tags.amenity !== 'parking') continue;
      }
      const { lastInsertRowid } = insertObject.run(
        element.type,
        element.id,
        JSON.stringify(element),
      );
      if (element.type === 'relation') relations.push({ key: lastInsertRowid, id: element.id });
      else {
        const box =
          element.type === 'node'
            ? [element.lon, element.lat, element.lon, element.lat]
            : unionBounds(
                element.nodes.map((id) => {
                  const { lon, lat } = queries.getNode(id);
                  return [lon, lat, lon, lat];
                }),
              );
        insertBounds.run(lastInsertRowid, box[0], box[2], box[1], box[3]);
      }
      if (++count % 100_000 === 0) {
        db.exec('COMMIT; BEGIN;');
        console.log(`  Indexed ${count.toLocaleString()} tagged nodes, ways and relations`);
      }
    }
    await done;
    for (const { key, id } of relations) {
      const box = queries.objectBounds('relation', id);
      if (!box) {
        console.warn(`OSM relation ${id} has no locatable geometry; not spatially indexed.`);
        continue;
      }
      insertBounds.run(key, box[0], box[2], box[1], box[3]);
    }
    db.prepare('INSERT INTO metadata VALUES (?)').run(
      JSON.stringify({ ...fingerprint, region, polygon }),
    );
    db.exec('COMMIT; PRAGMA optimize;');
    ready = true;
  } finally {
    reader?.kill();
    if (done) await Promise.allSettled([done]);
    db.close();
    try {
      if (ready) await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

export async function openRegion(region) {
  const directory = path.join(root, region);
  const source = path.join(directory, 'network.osm.pbf');
  const destination = path.join(directory, 'network.sqlite');
  const info = await stat(source);
  const fingerprint = { version: indexVersion, bytes: info.size, modified: info.mtimeMs };
  let db;
  try {
    await stat(destination);
    db = new DatabaseSync(destination, { readOnly: true });
    const saved = JSON.parse(db.prepare('SELECT data FROM metadata').get().data);
    if (Object.entries(fingerprint).some(([key, value]) => saved[key] !== value)) {
      db.close();
      db = undefined;
    }
  } catch (error) {
    db?.close();
    if (error.code !== 'ENOENT') throw error;
  }
  if (!db) {
    await buildIndex(region, source, destination, fingerprint);
    db = new DatabaseSync(destination, { readOnly: true });
  }
  const metadata = JSON.parse(db.prepare('SELECT data FROM metadata').get().data);
  const select = db.prepare(`
    SELECT objects.data FROM bounds JOIN objects USING(key)
    WHERE bounds.west <= ? AND bounds.east >= ? AND bounds.south <= ? AND bounds.north >= ?
  `);
  const queries = storeQueries(db);
  return {
    region,
    polygon: metadata.polygon,
    close: () => db.close(),
    query([west, south, east, north]) {
      const elements = new Map();
      for (const row of select.all(east, west, north, south)) {
        const element = JSON.parse(row.data);
        if (!element.tags.highway && element.tags.amenity !== 'parking') continue;
        if (element.type === 'way') {
          element.geometry = queries.geometry(element);
          for (const id of element.nodes) {
            const node = queries.getNode(id);
            if (!node.tags) continue;
            const tags = JSON.parse(node.tags);
            if (tags.highway === 'stop')
              elements.set(`node/${id}`, { type: 'node', id, lat: node.lat, lon: node.lon, tags });
          }
        } else if (element.type === 'relation') {
          element.members = element.members.map((member) =>
            member.type === 'way'
              ? {
                  ...member,
                  geometry: queries.geometry(queries.getObject('way', member.ref).element),
                }
              : member,
          );
        }
        elements.set(`${element.type}/${element.id}`, element);
      }
      return [...elements.values()];
    },
  };
}

export function mapDataServer(regions, missLog = path.join(root, 'coverage-misses.jsonl')) {
  return createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 'no-store');
    const send = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(data));
    };
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method !== 'GET') return send(405, { error: 'Use GET' });
      if (url.pathname === '/health')
        return send(200, { regions: regions.map(({ region }) => region) });
      if (url.pathname !== '/osm') return send(404, { error: 'Unknown endpoint' });
      const box = (url.searchParams.get('bbox') ?? '').split(',').map(Number);
      const [west, south, east, north] = box;
      if (
        box.length !== 4 ||
        !box.every(Number.isFinite) ||
        west < -180 ||
        east > 180 ||
        south <= -90 ||
        north >= 90 ||
        east <= west ||
        north <= south ||
        east - west > 0.05 ||
        north - south > 0.05
      )
        return send(400, {
          error: 'bbox must be a tile: west,south,east,north (max 0.05 degrees)',
        });
      const available = regions.filter(({ polygon }) => coversBox(polygon, box));
      if (!available.length) {
        const miss = { time: new Date().toISOString(), bbox: box, reason: 'outside-coverage' };
        await appendFile(missLog, `${JSON.stringify(miss)}\n`);
        console.log('OSM coverage miss:', JSON.stringify(miss));
        return send(404, { error: 'No complete regional coverage for this tile', ...miss });
      }
      const elements = new Map();
      for (const region of available)
        for (const element of region.query(box))
          elements.set(`${element.type}/${element.id}`, element);
      console.log(
        `OSM tile ${box.join(',')}: ${elements.size} elements (${available.map((r) => r.region).join(', ')})`,
      );
      send(200, { elements: [...elements.values()], regions: available.map((r) => r.region) });
    } catch (error) {
      console.error('Map data request failed:', error);
      if (!response.headersSent)
        send(500, { error: 'Local map data request failed; see server log' });
      else response.destroy(error);
    }
  });
}

async function main(args) {
  if (args.includes('--help') || args.includes('-h')) return console.log(usage);
  const names = [];
  let port = 8787;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') port = Number(args[++i]);
    else if (/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(args[i])) names.push(args[i]);
    else throw new Error(`Invalid region or option: ${args[i]}\n${usage}`);
  }
  if (!names.length || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error(usage);
  await mkdir(root, { recursive: true });
  const regions = [];
  try {
    for (const name of new Set(names)) regions.push(await openRegion(name));
    const server = mapDataServer(regions);
    server.on('error', (error) => {
      console.error('Map data server failed:', error);
      process.exitCode = 1;
      for (const region of regions) region.close();
    });
    server.listen(port, '127.0.0.1', () =>
      console.log(`Local map data ready: http://127.0.0.1:${port} (${names.join(', ')})`),
    );
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () =>
        server.close(() => {
          for (const region of regions) region.close();
        }),
      );
  } catch (error) {
    for (const region of regions) region.close();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
