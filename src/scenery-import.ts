import { classifyRings, VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { roadClasses } from './road-selection';
import { courseRoute, type CourseDefinition } from './courses';
import type {
  MapDefinition,
  RoadMap,
  RoadBuildProgress,
  RoadBuildState,
} from './course-builder-data';
import type { CourseScenery, SceneryPoint, SceneryPolygon } from './scenery-data';
import { normalizeCourseScenery, sceneryImportRevision } from './scenery-data';
import { defaultCompleteMapDimensions, validateCompleteMapDimensions } from './complete-map';
import {
  geographicDownloadCache,
  geographicDownloadConcurrency,
  geographicTiles,
  forEachConcurrent,
  type GeographicDownloadCache,
} from './geographic-download.mjs';

const tileJsonUrl = 'https://tiles.openfreemap.org/planet';
const zoom = 14;
const corridor = 300;
const completeRoadClasses = new Set([
  ...roadClasses,
  'residential',
  'unclassified',
  'living_street',
]);
const maxTiles = 64;
const concurrency = 4;
const timeoutMs = 12_000;
const overpassTimeoutSeconds = 25;
const overpassRequestTimeoutMs = 60_000;
const overpassEndpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const metersPerDegree = (6371008.8 * Math.PI) / 180;
const maxTileCacheSize = 128;

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type LocalLine = SceneryPoint[];
type Tile = { x: number; y: number; z: number; key: string };
type VectorProperties = Record<string, number | string | boolean>;

const tileBytes = new Map<string, Promise<ArrayBuffer>>();
let tileTemplate: Promise<string> | undefined;

class RetryableSceneryError extends Error {}

async function downloadScenery<T>(
  urls: string[],
  label: string,
  timeout: number,
  read: (response: Response) => Promise<T>,
  init: RequestInit = {},
  onRetry?: (attempt: number, total: number) => void,
): Promise<T> {
  let failure: unknown;
  for (const [attempt, url] of urls.entries()) {
    if (attempt) onRetry?.(attempt + 1, urls.length);
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
      if (!response.ok) {
        const message = `${label} request failed (${response.status}).`;
        if (response.status === 408 || response.status === 429 || response.status >= 500)
          throw new RetryableSceneryError(message);
        throw new Error(message);
      }
      return await read(response);
    } catch (error) {
      const timedOut =
        error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
      const retryable =
        timedOut || error instanceof TypeError || error instanceof RetryableSceneryError;
      const reason = timedOut
        ? `timed out after ${timeout / 1000} seconds`
        : error instanceof Error
          ? error.message
          : String(error);
      failure = new Error(`${label}: ${reason} (${new URL(url).hostname}).`, { cause: error });
      if (!retryable) throw failure;
      if (attempt + 1 < urls.length) {
        console.warn(
          `${label} download failed; retrying with ${new URL(urls[attempt + 1]).hostname}.`,
          failure,
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  throw new Error(
    `${label} could not be downloaded after ${urls.length} attempts. ${failure instanceof Error ? failure.message : ''} Please wait a moment and try saving again.`,
    { cause: failure },
  );
}

function localToLatLon(course: CourseDefinition, [x, z]: SceneryPoint) {
  const terrain = course.terrain!;
  return {
    lat: terrain.originLat + z / metersPerDegree,
    lon: terrain.originLon - x / terrain.metersPerLongitude,
  };
}

function clipSegmentToBounds(
  a: SceneryPoint,
  b: SceneryPoint,
  bounds: Bounds,
): [SceneryPoint, SceneryPoint] | undefined {
  let low = 0;
  let high = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  for (const [p, q] of [
    [-dx, a[0] - bounds.minX],
    [dx, bounds.maxX - a[0]],
    [-dz, a[1] - bounds.minZ],
    [dz, bounds.maxZ - a[1]],
  ]) {
    if (p === 0) {
      if (q < 0) return undefined;
      continue;
    }
    const ratio = q / p;
    if (p < 0) low = Math.max(low, ratio);
    else high = Math.min(high, ratio);
    if (low > high) return undefined;
  }
  return [
    [a[0] + low * dx, a[1] + low * dz],
    [a[0] + high * dx, a[1] + high * dz],
  ];
}

function latLonToLocal(course: CourseDefinition, lat: number, lon: number): SceneryPoint {
  const terrain = course.terrain!;
  return [
    (terrain.originLon - lon) * terrain.metersPerLongitude,
    (lat - terrain.originLat) * metersPerDegree,
  ];
}

function terrainBounds(course: CourseDefinition): Bounds {
  const terrain = course.terrain!;
  const west = (terrain.originLon - terrain.west) * terrain.metersPerLongitude;
  const east = (terrain.originLon - terrain.east) * terrain.metersPerLongitude;
  const south = (terrain.south - terrain.originLat) * metersPerDegree;
  const north = (terrain.north - terrain.originLat) * metersPerDegree;
  return {
    minX: Math.min(west, east),
    maxX: Math.max(west, east),
    minZ: Math.min(south, north),
    maxZ: Math.max(south, north),
  };
}

function sampleRoute(course: CourseDefinition): SceneryPoint[] {
  if (
    course.points.length < 2 ||
    course.points.some((point) => point.length !== 2 || !point.every(Number.isFinite))
  )
    throw new Error('Course scenery needs at least two finite course points.');
  const route = courseRoute({ ...course, reverse: false });
  const count = Math.max(1, Math.ceil(route.getLength() / 80));
  return Array.from({ length: count + 1 }, (_, index) => {
    const point = route.getPointAt(index / count);
    return [point.x, point.z];
  });
}

function segmentsOf(route: readonly SceneryPoint[]) {
  return route.slice(1).map((point, index) => [route[index], point] as const);
}

function terrainGridBounds(course: CourseDefinition): Bounds {
  const route = courseRoute({ ...course, reverse: false });
  const length = route.getLength();
  if (length <= 0) throw new Error('Course scenery needs a non-zero route length.');
  const count = Math.max(1, Math.ceil(length));
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  for (let index = 0; index < count; index++) {
    const point = route.getPointAt(index / count);
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.minZ = Math.min(bounds.minZ, point.z);
    bounds.maxZ = Math.max(bounds.maxZ, point.z);
  }
  const pad = 200 + (course.padRadius ?? 0);
  return {
    minX: bounds.minX - pad,
    maxX: bounds.maxX + pad,
    minZ: bounds.minZ - pad,
    maxZ: bounds.maxZ + pad,
  };
}

function completeMapBounds(course: RoadMap): Bounds {
  const points = course.points;
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minZ = Math.min(...points.map(([, z]) => z));
  const maxZ = Math.max(...points.map(([, z]) => z));
  const dimensions = course.courseBuilder?.completeMapDimensions ?? defaultCompleteMapDimensions;
  validateCompleteMapDimensions(dimensions);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return {
    minX: centerX - dimensions.width / 2,
    maxX: centerX + dimensions.width / 2,
    minZ: centerZ - dimensions.height / 2,
    maxZ: centerZ + dimensions.height / 2,
  };
}

function intersectBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.max(a.minX, b.minX),
    maxX: Math.min(a.maxX, b.maxX),
    minZ: Math.max(a.minZ, b.minZ),
    maxZ: Math.min(a.maxZ, b.maxZ),
  };
}

function distanceToSegment(point: SceneryPoint, a: SceneryPoint, b: SceneryPoint) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSquared = dx * dx + dz * dz;
  const ratio = lengthSquared
    ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared))
    : 0;
  return Math.hypot(point[0] - (a[0] + ratio * dx), point[1] - (a[1] + ratio * dz));
}

function segmentDistance(a: SceneryPoint, b: SceneryPoint, c: SceneryPoint, d: SceneryPoint) {
  const cross = (p: SceneryPoint, q: SceneryPoint, r: SceneryPoint) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  const onSegment = (p: SceneryPoint, q: SceneryPoint, r: SceneryPoint) =>
    q[0] >= Math.min(p[0], r[0]) - 1e-8 &&
    q[0] <= Math.max(p[0], r[0]) + 1e-8 &&
    q[1] >= Math.min(p[1], r[1]) - 1e-8 &&
    q[1] <= Math.max(p[1], r[1]) + 1e-8;
  if (
    (abC * abD < 0 && cdA * cdB < 0) ||
    (Math.abs(abC) < 1e-8 && onSegment(a, c, b)) ||
    (Math.abs(abD) < 1e-8 && onSegment(a, d, b)) ||
    (Math.abs(cdA) < 1e-8 && onSegment(c, a, d)) ||
    (Math.abs(cdB) < 1e-8 && onSegment(c, b, d))
  )
    return 0;
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b),
  );
}

function distanceToRoute(point: SceneryPoint, routeSegments: ReturnType<typeof segmentsOf>) {
  let distance = Infinity;
  for (const [a, b] of routeSegments) distance = Math.min(distance, distanceToSegment(point, a, b));
  return distance;
}

function pointInRing(point: SceneryPoint, ring: readonly SceneryPoint[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (
      zi > point[1] !== zj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - zi)) / (zj - zi) + xi
    )
      inside = !inside;
  }
  return inside;
}

function polygonNearRoute(
  rings: SceneryPolygon,
  route: readonly SceneryPoint[],
  routeSegments: ReturnType<typeof segmentsOf>,
) {
  const outer = rings[0];
  if (!outer?.length) return false;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      for (const [a, b] of routeSegments) {
        if (segmentDistance(ring[i - 1], ring[i], a, b) <= corridor) return true;
      }
    }
  }
  return route.some(
    (point) =>
      pointInRing(point, outer) && !rings.slice(1).some((hole) => pointInRing(point, hole)),
  );
}

function clipRing(ring: readonly SceneryPoint[], bounds: Bounds): SceneryPoint[] {
  let points = ring.slice();
  const edges: ((point: SceneryPoint) => boolean)[] = [
    ([x]) => x >= bounds.minX,
    ([x]) => x <= bounds.maxX,
    ([, z]) => z >= bounds.minZ,
    ([, z]) => z <= bounds.maxZ,
  ];
  for (let edge = 0; edge < edges.length; edge++) {
    const inside = edges[edge];
    const intersection = (a: SceneryPoint, b: SceneryPoint): SceneryPoint => {
      if (edge < 2) {
        const x = edge === 0 ? bounds.minX : bounds.maxX;
        const ratio = (x - a[0]) / (b[0] - a[0]);
        return [x, a[1] + ratio * (b[1] - a[1])];
      }
      const z = edge === 2 ? bounds.minZ : bounds.maxZ;
      const ratio = (z - a[1]) / (b[1] - a[1]);
      return [a[0] + ratio * (b[0] - a[0]), z];
    };
    const output: SceneryPoint[] = [];
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const previous = points[(i + points.length - 1) % points.length];
      const currentInside = inside(current);
      const previousInside = inside(previous);
      if (currentInside !== previousInside) output.push(intersection(previous, current));
      if (currentInside) output.push(current);
    }
    points = output;
    if (!points.length) break;
  }
  if (points.length > 2) points.push(points[0]);
  return points;
}

function tileCoordinate(lon: number, lat: number) {
  const count = 2 ** zoom;
  const x = ((lon + 180) / 360) * count;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * count;
  return { x, y };
}

function tileLocalBounds(course: CourseDefinition, x: number, y: number): Bounds {
  const count = 2 ** zoom;
  const corners: SceneryPoint[] = [];
  for (const [tx, ty] of [
    [x, y],
    [x + 1, y],
    [x, y + 1],
    [x + 1, y + 1],
  ]) {
    const lon = (tx / count) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / count))) * 180) / Math.PI;
    corners.push(latLonToLocal(course, lat, lon));
  }
  return {
    minX: Math.min(...corners.map(([x]) => x)),
    maxX: Math.max(...corners.map(([x]) => x)),
    minZ: Math.min(...corners.map(([, z]) => z)),
    maxZ: Math.max(...corners.map(([, z]) => z)),
  };
}

function segmentIntersectsBounds(a: SceneryPoint, b: SceneryPoint, bounds: Bounds) {
  let low = 0;
  let high = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  for (const [p, q] of [
    [-dx, a[0] - bounds.minX],
    [dx, bounds.maxX - a[0]],
    [-dz, a[1] - bounds.minZ],
    [dz, bounds.maxZ - a[1]],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const ratio = q / p;
    if (p < 0) low = Math.max(low, ratio);
    else high = Math.min(high, ratio);
    if (low > high) return false;
  }
  return true;
}

function segmentToBoundsDistance(a: SceneryPoint, b: SceneryPoint, bounds: Bounds) {
  if (segmentIntersectsBounds(a, b, bounds)) return 0;
  const corners: SceneryPoint[] = [
    [bounds.minX, bounds.minZ],
    [bounds.minX, bounds.maxZ],
    [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ],
  ];
  const endpointDistance = (point: SceneryPoint) =>
    Math.hypot(
      Math.max(bounds.minX - point[0], 0, point[0] - bounds.maxX),
      Math.max(bounds.minZ - point[1], 0, point[1] - bounds.maxZ),
    );
  return Math.min(
    endpointDistance(a),
    endpointDistance(b),
    ...corners.map((point) => distanceToSegment(point, a, b)),
  );
}

function tilesForRoute(course: CourseDefinition, route: SceneryPoint[]): Tile[] {
  const routeSegments = segmentsOf(route);
  const candidates = new Map<string, Tile>();
  const count = 2 ** zoom;
  for (const [a, b] of routeSegments) {
    const corners = [
      [a[0] - corridor, a[1] - corridor],
      [a[0] - corridor, a[1] + corridor],
      [a[0] + corridor, a[1] - corridor],
      [a[0] + corridor, a[1] + corridor],
      [b[0] - corridor, b[1] - corridor],
      [b[0] - corridor, b[1] + corridor],
      [b[0] + corridor, b[1] - corridor],
      [b[0] + corridor, b[1] + corridor],
    ] as SceneryPoint[];
    const tilePoints = corners.map((point) => {
      const { lat, lon } = localToLatLon(course, point);
      return tileCoordinate(lon, lat);
    });
    const minX = Math.max(0, Math.floor(Math.min(...tilePoints.map(({ x }) => x))));
    const maxX = Math.min(count - 1, Math.floor(Math.max(...tilePoints.map(({ x }) => x))));
    const minY = Math.max(0, Math.floor(Math.min(...tilePoints.map(({ y }) => y))));
    const maxY = Math.min(count - 1, Math.floor(Math.max(...tilePoints.map(({ y }) => y))));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = `${zoom}/${x}/${y}`;
        if (!candidates.has(key)) candidates.set(key, { x, y, z: zoom, key });
      }
    }
  }
  const tiles = [...candidates.values()].filter((tile) => {
    const bounds = tileLocalBounds(course, tile.x, tile.y);
    return routeSegments.some(([a, b]) => segmentToBoundsDistance(a, b, bounds) <= corridor);
  });
  if (tiles.length > maxTiles) {
    throw new Error(
      `OpenFreeMap scenery needs ${tiles.length} vector tiles at zoom ${zoom}; the limit is ${maxTiles}.`,
    );
  }
  return tiles;
}

function tilesForMapBounds(course: CourseDefinition, bounds: Bounds): Tile[] {
  const a = localToLatLon(course, [bounds.minX, bounds.minZ]);
  const b = localToLatLon(course, [bounds.maxX, bounds.maxZ]);
  return tilesForGeoBounds({
    west: Math.min(a.lon, b.lon),
    east: Math.max(a.lon, b.lon),
    south: Math.min(a.lat, b.lat),
    north: Math.max(a.lat, b.lat),
  });
}

function tilesForGeoBounds({ west, east, south, north }: GeoBox): Tile[] {
  if (![west, east, south, north].every(Number.isFinite) || west >= east || south >= north)
    throw new Error('Scenery downloads require finite geographic bounds with positive area.');
  const tiles: Tile[] = [];
  const count = 2 ** zoom;
  const tilePoints = [tileCoordinate(west, south), tileCoordinate(east, north)];
  const minX = Math.max(0, Math.floor(Math.min(...tilePoints.map(({ x }) => x))));
  const maxX = Math.min(count - 1, Math.floor(Math.max(...tilePoints.map(({ x }) => x))));
  const minY = Math.max(0, Math.floor(Math.min(...tilePoints.map(({ y }) => y))));
  const maxY = Math.min(count - 1, Math.floor(Math.max(...tilePoints.map(({ y }) => y))));
  const size = (maxX - minX + 1) * (maxY - minY + 1);
  if (size > maxTiles)
    throw new Error(
      `Complete map scenery needs ${size} vector tiles at zoom ${zoom}; the limit is ${maxTiles}.`,
    );
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++) tiles.push({ x, y, z: zoom, key: `${zoom}/${x}/${y}` });
  return tiles;
}

async function fetchTileTemplate(): Promise<string> {
  if (!tileTemplate) {
    tileTemplate = (async () => {
      const metadata = await downloadScenery(
        [tileJsonUrl, tileJsonUrl],
        'OpenFreeMap tile metadata',
        timeoutMs,
        (response) => response.json() as Promise<{ tiles?: string[] }>,
      );
      if (
        !metadata.tiles?.[0] ||
        !['{z}', '{x}', '{y}'].every((key) => metadata.tiles![0].includes(key))
      )
        throw new Error('OpenFreeMap TileJSON did not provide a usable vector tile URL.');
      return metadata.tiles[0];
    })().catch((error: unknown) => {
      tileTemplate = undefined;
      throw error;
    });
  }
  return tileTemplate;
}

function loadTile(url: string): Promise<ArrayBuffer> {
  let result = tileBytes.get(url);
  if (!result) {
    result = (async () => {
      return downloadScenery([url, url], 'OpenFreeMap scenery tile', timeoutMs, (response) =>
        response.arrayBuffer(),
      );
    })();
    tileBytes.set(url, result);
    while (tileBytes.size > maxTileCacheSize) tileBytes.delete(tileBytes.keys().next().value!);
    result.catch(() => tileBytes.delete(url));
  }
  return result;
}

function tileUrl(template: string, tile: Tile) {
  return template
    .replaceAll('{z}', String(tile.z))
    .replaceAll('{x}', String(tile.x))
    .replaceAll('{y}', String(tile.y));
}

async function loadTiles(
  tiles: Tile[],
  template: string,
  cache?: GeographicDownloadCache,
  onProgress?: (completed: number, total: number) => void,
) {
  const responses = new Map<string, ArrayBuffer>();
  const downloaded = new Set<string>();
  let completed = 0;
  onProgress?.(0, tiles.length);
  await forEachConcurrent(tiles, concurrency, async (tile) => {
    const url = tileUrl(template, tile);
    try {
      const cached = cache ? await cache.read(url) : undefined;
      if (cached) responses.set(tile.key, new Uint8Array(cached).buffer);
      else {
        responses.set(tile.key, await loadTile(url));
        if (cache) downloaded.add(tile.key);
      }
      onProgress?.(++completed, tiles.length);
    } catch (error) {
      throw new Error(
        `Could not acquire scenery tile ${tile.key}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  });
  return { responses, downloaded };
}

export interface SceneryTileDownload {
  template: string;
  responses: Map<string, ArrayBuffer>;
  downloaded: Set<string>;
}

async function loadSceneryTiles(
  tiles: Tile[],
  cache?: GeographicDownloadCache,
  onProgress?: (completed: number, total: number) => void,
): Promise<SceneryTileDownload> {
  const template = await fetchTileTemplate();
  return { template, ...(await loadTiles(tiles, template, cache, onProgress)) };
}

export function requestSceneryTiles(
  box: GeoBox,
  cache?: GeographicDownloadCache,
  onProgress?: (completed: number, total: number) => void,
): Promise<SceneryTileDownload> {
  const request = loadSceneryTiles(tilesForGeoBounds(box), cache, onProgress);
  // Terrain may fail before the caller reaches scenery; still surface this error when awaited.
  request.catch(() => {});
  return request;
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)))
    return Number(value);
  return undefined;
}

function polygonSignature(rings: SceneryPolygon) {
  const canonicalRing = (ring: SceneryPoint[]) => {
    const points = ring.slice(0, -1);
    if (!points.length) return '';
    const values = points.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`);
    const rotations = (items: string[]) =>
      items.map((_, index) => [...items.slice(index), ...items.slice(0, index)].join(';'));
    return [...rotations(values), ...rotations([...values].reverse())].sort()[0];
  };
  return rings.map(canonicalRing).sort().join('|');
}

function lineSignature(line: LocalLine) {
  const values = line.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`);
  const forward = values.join(';');
  return [forward, values.reverse().join(';')].sort()[0];
}

function clippedLine(
  line: LocalLine,
  bounds: Bounds,
  routeSegments: ReturnType<typeof segmentsOf>,
  result: LocalLine[],
  maxRouteDistance = corridor,
) {
  let current: LocalLine = [];
  const finish = () => {
    if (current.length > 1) result.push(current);
    current = [];
  };
  for (let i = 1; i < line.length; i++) {
    const clipped = clipSegmentToBounds(line[i - 1], line[i], bounds);
    if (!clipped) {
      finish();
      continue;
    }
    const [a, b] = clipped;
    const samples = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 20));
    for (let step = 0; step < samples; step++) {
      const t0 = step / samples;
      const t1 = (step + 1) / samples;
      const from: SceneryPoint = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
      const to: SceneryPoint = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      const middle: SceneryPoint = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      const insideBounds =
        middle[0] >= bounds.minX &&
        middle[0] <= bounds.maxX &&
        middle[1] >= bounds.minZ &&
        middle[1] <= bounds.maxZ;
      if (insideBounds && distanceToRoute(middle, routeSegments) <= maxRouteDistance) {
        if (!current.length) current.push(from);
        current.push(to);
      } else {
        finish();
      }
    }
  }
  finish();
}

function localizeTilePoint(
  { x, y }: { x: number; y: number },
  course: CourseDefinition,
  tile: Tile,
  extent: number,
) {
  const count = 2 ** tile.z;
  const lon = ((tile.x + x / extent) / count) * 360 - 180;
  const lat =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * (tile.y + y / extent)) / count))) * 180) / Math.PI;
  return latLonToLocal(course, lat, lon);
}

function geometryToLocal(
  geometry: { x: number; y: number }[][],
  course: CourseDefinition,
  tile: Tile,
  extent: number,
): SceneryPoint[][] {
  return geometry.map((path) =>
    path.map((point) => localizeTilePoint(point, course, tile, extent)),
  );
}

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
  members?: { role: string; geometry?: { lat: number; lon: number }[] }[];
}

export interface GeoBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface MappedNetworkRequest {
  elements: Promise<OsmElement[]>;
  /** Completed tiles and, when retrying, the current tile and provider attempt. */
  retry?: string;
  state?: RoadBuildState;
  onRetry?: () => void;
}

async function fetchMappedNetworkTile(
  { south, west, north, east }: GeoBox,
  onRetry: (attempt: number, total: number) => void,
  cache: GeographicDownloadCache,
) {
  const query = `[out:json][timeout:${overpassTimeoutSeconds}][bbox:${south},${west},${north},${east}];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|track)(_link)?$"]->.roads;(.roads;node(w.roads)["highway"="stop"];nwr["amenity"="parking"];);out body geom qt;`;
  const cacheKey = `${overpassEndpoints[0]}?${new URLSearchParams({ data: query })}`;
  const cached = await cache.read(cacheKey);
  if (cached) return JSON.parse(new TextDecoder().decode(cached)) as OsmElement[];
  const elements = await downloadScenery(
    overpassEndpoints,
    'OpenStreetMap road network',
    overpassRequestTimeoutMs,
    async (response) => {
      const data = (await response.json()) as {
        elements?: OsmElement[];
        remark?: string;
      };
      if (data.remark) {
        if (/timed? out|timeout|too busy|rate|quota|out of memory/i.test(data.remark))
          throw new RetryableSceneryError(data.remark);
        throw new Error(`OpenStreetMap road network response failed: ${data.remark}`);
      }
      if (!Array.isArray(data.elements))
        throw new Error('OpenStreetMap road network response is missing elements.');
      return data.elements;
    },
    { method: 'POST', body: new URLSearchParams({ data: query }) },
    onRetry,
  );
  await cache.write(cacheKey, new TextEncoder().encode(JSON.stringify(elements)));
  return elements;
}

const networkCaches = new WeakMap<GeographicDownloadCache, Map<string, Promise<OsmElement[]>>>();

async function fetchMappedNetwork(
  box: GeoBox,
  onProgress: (label: string) => void,
  cache: GeographicDownloadCache,
): Promise<OsmElement[]> {
  const networkTiles = networkCaches.get(cache) ?? new Map<string, Promise<OsmElement[]>>();
  networkCaches.set(cache, networkTiles);
  const tiles = geographicTiles(box);
  const results: OsmElement[][] = new Array(tiles.length);
  let completed = 0;
  const label = () => `Tiles ${completed}/${tiles.length}`;
  onProgress(label());
  await forEachConcurrent(tiles, geographicDownloadConcurrency.osm, async (tile, index) => {
    let pending = networkTiles.get(tile.key);
    if (!pending) {
      pending = fetchMappedNetworkTile(
        tile,
        (attempt, total) => onProgress(`${label()}; tile ${index + 1} (${attempt}/${total})`),
        cache,
      );
      networkTiles.set(tile.key, pending);
    }
    try {
      results[index] = await pending;
      completed++;
      onProgress(label());
    } finally {
      if (networkTiles.get(tile.key) === pending) networkTiles.delete(tile.key);
    }
  });
  const elements = new Map<string, OsmElement>();
  for (const result of results)
    for (const element of result) elements.set(`${element.type}/${element.id}`, element);
  return [...elements.values()];
}

/** Start the Complete map OpenStreetMap download; it only needs the geographic map square. */
export function requestMappedNetwork(
  box: GeoBox,
  cache: GeographicDownloadCache = geographicDownloadCache,
  onProgress?: (detail: string, state: RoadBuildState) => void,
): MappedNetworkRequest {
  const request: MappedNetworkRequest = {} as MappedNetworkRequest;
  request.elements = fetchMappedNetwork(
    box,
    (label) => {
      request.retry = label;
      request.state = 'active';
      request.onRetry?.();
      onProgress?.(label, 'active');
    },
    cache,
  ).then((elements) => {
    request.state = 'complete';
    request.onRetry?.();
    onProgress?.(request.retry!, 'complete');
    return elements;
  });
  // Callers may fail earlier stages before awaiting; the rejection is still observed when awaited.
  request.elements.catch(() => {});
  return request;
}

function mappedNetworkScenery(
  course: CourseDefinition,
  bounds: Bounds,
  elements: readonly OsmElement[],
) {
  const data = { elements };
  const roads: CourseScenery['roads'] = [];
  const parking: NonNullable<CourseScenery['parking']> = [];
  const stopSigns: NonNullable<CourseScenery['stopSigns']> = [];
  const local = (p: { lat: number; lon: number }) => latLonToLocal(course, p.lat, p.lon);
  const ways = data.elements.filter(
    (e) => e.type === 'way' && e.tags?.highway && e.geometry?.length && e.nodes?.length,
  );
  const widths = new Map<number, number>();
  const neighbors = new Map<number, Set<number>>();
  const incident = new Map<number, OsmElement[]>();
  const oneWay = (way: OsmElement): -1 | 1 | undefined => {
    const tags = way.tags!;
    if (tags.oneway === '-1') return -1;
    if (tags.oneway === 'no' || tags.oneway === '0') return;
    if (
      ['yes', '1', 'true'].includes(tags.oneway) ||
      tags.junction === 'roundabout' ||
      tags.highway === 'motorway'
    )
      return 1;
  };
  for (const way of ways) {
    const tags = way.tags!;
    const mappedLanes = asNumber(tags.lanes);
    const lanes =
      mappedLanes !== undefined &&
      Number.isInteger(mappedLanes) &&
      mappedLanes > 0 &&
      mappedLanes <= 20
        ? mappedLanes
        : undefined;
    const layer = asNumber(tags.layer);
    const oneway = oneWay(way);
    const roadClass = tags.highway.replace(/_link$/, '');
    const width = Math.max(
      2,
      Math.min(
        60,
        asNumber(tags.width) ??
          (lanes && Number.isInteger(lanes)
            ? lanes * 3.25
            : ({
                motorway: oneway ? 7 : 14,
                trunk: oneway ? 7 : 12,
                primary: 10,
                secondary: 8,
                tertiary: 7,
                service: 4,
                track: 3,
              }[roadClass] ?? 6)),
      ),
    );
    widths.set(way.id, width);
    const lines: LocalLine[] = [];
    clippedLine(way.geometry!.map(local), bounds, [], lines, Infinity);
    for (const points of lines)
      roads.push({
        points,
        width,
        roadClass,
        ...(oneway ? { oneway } : {}),
        ...(!oneway && !['service', 'track', 'living_street'].includes(roadClass)
          ? {
              centerline: ['primary', 'secondary', 'trunk'].includes(roadClass)
                ? ('double-yellow' as const)
                : ('dashed-yellow' as const),
            }
          : {}),
        ...(lanes && Number.isInteger(lanes) && lanes <= 20 ? { lanes } : {}),
        ...(tags.service ? { service: tags.service } : {}),
        ...(tags.bridge && tags.bridge !== 'no'
          ? { structure: 'bridge' as const }
          : tags.tunnel && tags.tunnel !== 'no'
            ? { structure: 'tunnel' as const }
            : {}),
        ...(layer !== undefined && Number.isInteger(layer) ? { layer } : {}),
      });
    way.nodes!.forEach((id, i, nodes) => {
      const adjacent = neighbors.get(id) ?? new Set<number>();
      if (i) adjacent.add(nodes[i - 1]);
      if (i + 1 < nodes.length) adjacent.add(nodes[i + 1]);
      neighbors.set(id, adjacent);
      const connected = incident.get(id) ?? [];
      connected.push(way);
      incident.set(id, connected);
    });
  }
  for (const element of data.elements) {
    if (element.tags?.amenity !== 'parking') continue;
    if (['underground', 'multi-storey', 'rooftop'].includes(element.tags.parking)) continue;
    const paths =
      element.type === 'way'
        ? [{ role: 'outer', geometry: element.geometry }]
        : (element.members ?? []);
    const rings: { role: string; points: SceneryPoint[] }[] = [];
    for (const path of paths) {
      if (!path.geometry?.length) continue;
      let points = path.geometry.map(local);
      let joined = true;
      while (joined) {
        joined = false;
        for (let i = 0; i < rings.length; i++) {
          if (rings[i].role !== path.role) continue;
          const other = rings[i].points;
          const near = (a: SceneryPoint, b: SceneryPoint) =>
            Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01;
          if (near(points.at(-1)!, other[0])) points.push(...other.slice(1));
          else if (near(points.at(-1)!, other.at(-1)!))
            points.push(...other.slice(0, -1).reverse());
          else if (near(points[0], other.at(-1)!)) points = [...other.slice(0, -1), ...points];
          else if (near(points[0], other[0])) points = [...other.slice(1).reverse(), ...points];
          else continue;
          rings.splice(i, 1);
          joined = true;
          break;
        }
      }
      rings.push({ role: path.role, points });
    }
    const closed = rings.filter(
      ({ points }) =>
        points.length >= 4 &&
        Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]) < 0.01,
    );
    if (closed.length !== rings.length)
      console.warn(
        `OSM parking area ${element.id} contains incomplete rings; only closed areas can be modeled.`,
      );
    for (const outer of closed.filter((r) => r.role !== 'inner')) {
      const holes = closed.filter(
        (r) => r.role === 'inner' && pointInRing(r.points[0], outer.points),
      );
      const clipped = [outer, ...holes]
        .map((r) => clipRing(r.points, bounds))
        .filter((r) => r.length >= 4);
      if (clipped.length) parking.push({ rings: clipped });
    }
  }
  const seen = new Set<string>();
  for (const node of data.elements) {
    if (node.type !== 'node' || node.tags?.highway !== 'stop') continue;
    for (const way of incident.get(node.id) ?? []) {
      if (
        way.tags!.service === 'parking_aisle' ||
        (way.tags!.bridge && way.tags!.bridge !== 'no') ||
        (way.tags!.tunnel && way.tags!.tunnel !== 'no')
      )
        continue;
      const i = way.nodes!.indexOf(node.id);
      const points = way.geometry!.map(local);
      const isJunction = (neighbors.get(node.id)?.size ?? 0) > 2;
      if (isJunction && node.tags.stop === 'minor') {
        console.warn(
          `OSM stop node ${node.id} does not identify controlled approaches; not guessing priority.`,
        );
        continue;
      }
      let direction: string | undefined = node.tags.direction ?? node.tags['stop:direction'];
      if (!isJunction && direction !== 'forward' && direction !== 'backward') {
        const junctions = way.nodes!.flatMap((id, j) =>
          (neighbors.get(id)?.size ?? 0) > 2 ? [j] : [],
        );
        let nearest = Infinity;
        let nextNearest = Infinity;
        for (const j of junctions) {
          let distance = 0;
          for (let k = Math.min(i, j) + 1; k <= Math.max(i, j); k++)
            distance += Math.hypot(
              points[k][0] - points[k - 1][0],
              points[k][1] - points[k - 1][1],
            );
          if (distance < nearest && distance <= 60) {
            nextNearest = nearest;
            nearest = distance;
            direction = j > i ? 'forward' : 'backward';
          } else nextNearest = Math.min(nextNearest, distance);
        }
        if (nextNearest - nearest < 1) direction = undefined;
      }
      if (!isJunction && direction !== 'forward' && direction !== 'backward') {
        console.warn(
          `OSM stop node ${node.id} has no unambiguous approach; not inventing a stop direction.`,
        );
        continue;
      }
      for (const travel of [-1, 1] as const) {
        if (oneWay(way) && oneWay(way) !== travel) continue;
        if (!isJunction && (direction === 'forward' ? 1 : -1) !== travel) continue;
        const at = points[i];
        const after = points[i + travel];
        const from =
          points[i - travel] ??
          (!isJunction && after ? [2 * at[0] - after[0], 2 * at[1] - after[1]] : undefined);
        if (!from) continue;
        const length = Math.hypot(at[0] - from[0], at[1] - from[1]);
        if (length < 0.01) continue;
        const heading: SceneryPoint = [(at[0] - from[0]) / length, (at[1] - from[1]) / length];
        const crossingWidth = Math.max(
          4,
          ...(incident.get(node.id) ?? [])
            .filter((w) => w !== way)
            .map((w) => widths.get(w.id) ?? 4),
        );
        const inset = isJunction ? Math.min(length * 0.8, crossingWidth / 2 + 1.5) : 0;
        const point: SceneryPoint = [at[0] - heading[0] * inset, at[1] - heading[1] * inset];
        if (
          point[0] < bounds.minX ||
          point[0] > bounds.maxX ||
          point[1] < bounds.minZ ||
          point[1] > bounds.maxZ ||
          parking.some(
            (p) =>
              pointInRing(point, p.rings[0]) &&
              !p.rings.slice(1).some((r) => pointInRing(point, r)),
          )
        )
          continue;
        const key = `${node.id}:${way.nodes![i - travel]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        stopSigns.push({
          point,
          direction: heading,
          width: widths.get(way.id)!,
          ...(oneWay(way) ? { oneway: true } : {}),
        });
      }
    }
  }
  return { roads, parking, stopSigns };
}

function decodedFeature(
  layer: string,
  properties: VectorProperties,
  paths: SceneryPoint[][],
  polygons: SceneryPolygon[],
  bounds: Bounds,
  route: SceneryPoint[],
  routeSegments: ReturnType<typeof segmentsOf>,
  scenery: CourseScenery,
  seenPolygons: Set<string>,
  seenLines: Set<string>,
  completeMap: boolean,
) {
  if (layer === 'building' && polygons.length) {
    const height = Math.max(
      2,
      Math.min(
        150,
        asNumber(properties.render_height) ??
          asNumber(properties.height) ??
          (asNumber(properties['building:levels']) ?? 2) * 3,
      ),
    );
    for (const polygon of polygons) {
      const rings = polygon
        .map((ring) => clipRing(ring, bounds))
        .filter((ring) => ring.length >= 4) as SceneryPolygon;
      if (rings.length && (completeMap || polygonNearRoute(rings, route, routeSegments))) {
        const key = polygonSignature(rings);
        if (!seenPolygons.has(key)) {
          seenPolygons.add(key);
          scenery.buildings.push({ rings, height });
        }
      }
    }
    return;
  }
  if (
    (layer === 'water' || layer === 'landcover' || layer === 'landuse' || layer === 'park') &&
    polygons.length
  ) {
    let vegetationKind: 'trees' | 'scrub' | 'grass' | undefined;
    if (layer !== 'water') {
      const kind = `${properties.subclass ?? ''} ${properties.class ?? ''}`.toLowerCase();
      vegetationKind = /scrub|heath|shrub/.test(kind)
        ? 'scrub'
        : /wood|forest|tree|orchard/.test(kind)
          ? 'trees'
          : /grass|park|garden|meadow|pitch|cemetery/.test(kind) || layer === 'park'
            ? 'grass'
            : undefined;
      if (!vegetationKind) return;
    }
    for (const polygon of polygons) {
      const rings = polygon
        .map((ring) => clipRing(ring, bounds))
        .filter((ring) => ring.length >= 4) as SceneryPolygon;
      if (!rings.length || (!completeMap && !polygonNearRoute(rings, route, routeSegments)))
        continue;
      const key = `${layer === 'water' ? 'water' : vegetationKind}:${polygonSignature(rings)}`;
      if (seenPolygons.has(key)) continue;
      seenPolygons.add(key);
      if (layer === 'water') scenery.water.push({ rings });
      else scenery.vegetation.push({ rings, kind: vegetationKind! });
    }
    return;
  }
  if (
    layer === 'waterway' ||
    (layer === 'transportation' &&
      (completeMap
        ? completeRoadClasses.has(String(properties.class))
        : roadClasses.includes(String(properties.class))))
  ) {
    const structure =
      properties.brunnel === 'bridge' || properties.brunnel === 'tunnel'
        ? properties.brunnel
        : undefined;
    const layerNumber = asNumber(properties.layer);
    const roadLayer =
      layerNumber !== undefined && Number.isInteger(layerNumber) ? layerNumber : undefined;
    const roadClass = String(properties.class);
    const onewayValue = properties.oneway;
    const oneway =
      onewayValue === -1 || onewayValue === '-1' || onewayValue === 'reverse'
        ? -1
        : onewayValue === 1 || onewayValue === '1' || onewayValue === true || onewayValue === 'yes'
          ? 1
          : undefined;
    const explicitMarking = String(properties.centerline ?? properties.marking ?? '');
    const centerline =
      oneway !== undefined
        ? undefined
        : explicitMarking === 'double-yellow' || explicitMarking === 'dashed-yellow'
          ? explicitMarking
          : ['primary', 'secondary'].includes(roadClass)
            ? 'double-yellow'
            : ['tertiary', 'minor', 'residential', 'unclassified', 'living_street'].includes(
                  roadClass,
                )
              ? 'dashed-yellow'
              : undefined;
    const width =
      asNumber(properties.width) ??
      (layer === 'waterway'
        ? ({ river: 5, canal: 4, stream: 1.5, ditch: 1 }[String(properties.class)] ?? 2)
        : ({
            motorway: 15,
            trunk: 12,
            primary: 10,
            secondary: 8,
            tertiary: 7,
            minor: 6,
            residential: 6,
            unclassified: 6,
            living_street: 5,
            service: 4,
            track: 3,
          }[String(properties.class)] ?? 5));
    for (const path of paths) {
      const lines: LocalLine[] = [];
      clippedLine(path, bounds, routeSegments, lines, completeMap ? Infinity : corridor);
      for (const points of lines) {
        const key = `${layer}:${properties.class ?? ''}:${structure ?? ''}:${roadLayer ?? 0}:${oneway ?? 0}:${lineSignature(points)}`;
        if (seenLines.has(key)) continue;
        seenLines.add(key);
        if (layer === 'waterway')
          scenery.waterways.push({ points, width: Math.max(0.5, Math.min(40, width)) });
        else
          scenery.roads.push({
            points,
            width: Math.max(1, Math.min(60, width)),
            roadClass,
            ...(centerline ? { centerline } : {}),
            ...(oneway !== undefined ? { oneway: oneway as -1 | 1 } : {}),
            ...(structure ? { structure } : {}),
            ...(roadLayer !== undefined ? { layer: roadLayer } : {}),
          });
      }
    }
  }
}

/**
 * Fetch and decode the bounded OpenFreeMap/OpenMapTiles scenery corridor around a course.
 * Network failures and routes exceeding the tile budget are reported to the caller.
 */
export async function fetchCourseScenery(
  course: RoadMap,
  mode: boolean | MapDefinition,
  {
    progress = () => {},
    network,
    cache,
    tileRequest,
  }: {
    progress?: RoadBuildProgress;
    /** Complete map download already started from the geographic selection. */
    network?: MappedNetworkRequest;
    cache?: GeographicDownloadCache;
    tileRequest?: Promise<SceneryTileDownload>;
  } = {},
): Promise<CourseScenery> {
  const definition: MapDefinition =
    typeof mode === 'boolean' ? (mode ? 'nearby-roads' : 'course') : mode;
  const includeNearbyRoads = definition !== 'course';
  const completeMap = definition === 'complete-map';
  const terrain = course.terrain;
  if (
    !terrain ||
    ![
      terrain.originLat,
      terrain.originLon,
      terrain.metersPerLongitude,
      terrain.west,
      terrain.east,
      terrain.south,
      terrain.north,
    ].every(Number.isFinite) ||
    terrain.metersPerLongitude <= 0
  )
    throw new Error('Course scenery requires valid terrain geographic bounds and origin.');
  const route = sampleRoute(course);
  const routeSegments = segmentsOf(route);
  const mapBounds = completeMap ? completeMapBounds(course) : undefined;
  const tiles = mapBounds ? tilesForMapBounds(course, mapBounds) : tilesForRoute(course, route);
  const bounds = mapBounds
    ? intersectBounds(terrainBounds(course), mapBounds)
    : intersectBounds(terrainBounds(course), terrainGridBounds(course));
  if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ)
    throw new Error('Course scenery bounds do not overlap the supported terrain grid.');
  if (completeMap && !network) {
    const a = localToLatLon(course, [bounds.minX, bounds.minZ]);
    const b = localToLatLon(course, [bounds.maxX, bounds.maxZ]);
    network = requestMappedNetwork(
      {
        south: Math.min(a.lat, b.lat),
        west: Math.min(a.lon, b.lon),
        north: Math.max(a.lat, b.lat),
        east: Math.max(a.lon, b.lon),
      },
      cache,
    );
  }
  if (!tileRequest) progress('scenery', 'Connecting to OpenFreeMap', 'active');
  const tileProgress = (completed: number, total: number) =>
    progress('scenery', `Tiles ${completed}/${total}`, 'active');
  const loaded = await (tileRequest ?? loadSceneryTiles(tiles, cache, tileProgress));
  const missing = tiles.filter((tile) => !loaded.responses.has(tile.key));
  if (missing.length) {
    const additional = await loadTiles(missing, loaded.template, cache);
    for (const [key, bytes] of additional.responses) loaded.responses.set(key, bytes);
    for (const key of additional.downloaded) loaded.downloaded.add(key);
  }
  const { template, responses: tileData, downloaded } = loaded;
  if (completeMap && network) {
    const request = network;
    request.onRetry = () => progress('network', request.retry, request.state);
    request.onRetry();
  }
  progress('scenery', '', 'active');
  const scenery: CourseScenery = {
    version: 1,
    importRevision: sceneryImportRevision,
    ...(mapBounds ? { bounds: mapBounds } : {}),
    buildings: [],
    water: [],
    waterways: [],
    vegetation: [],
    roads: [],
  };
  const seenPolygons = new Set<string>();
  const seenLines = new Set<string>();
  for (const tile of tiles) {
    let vectorTile: VectorTile;
    try {
      vectorTile = new VectorTile(new PbfReader(tileData.get(tile.key)!));
    } catch (error) {
      throw new Error(`Could not decode OpenFreeMap tile ${tile.key}.`, { cause: error });
    }
    for (const [layerName, layer] of Object.entries(vectorTile.layers)) {
      if (
        layerName !== 'building' &&
        layerName !== 'water' &&
        layerName !== 'waterway' &&
        layerName !== 'landcover' &&
        layerName !== 'landuse' &&
        layerName !== 'park' &&
        !(includeNearbyRoads && layerName === 'transportation')
      )
        continue;
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const properties = feature.properties;
        if (
          layerName === 'transportation' &&
          !(completeMap
            ? completeRoadClasses.has(String(properties.class))
            : roadClasses.includes(String(properties.class)))
        )
          continue;
        const geometry = feature.loadGeometry();
        const paths = geometryToLocal(geometry, course, tile, layer.extent);
        const polygons =
          layerName === 'building' ||
          layerName === 'water' ||
          layerName === 'landcover' ||
          layerName === 'landuse' ||
          layerName === 'park'
            ? classifyRings(geometry as Parameters<typeof classifyRings>[0]).map((polygon) =>
                polygon.map((ring) =>
                  ring.map((point) => localizeTilePoint(point, course, tile, layer.extent)),
                ),
              )
            : [];
        decodedFeature(
          layerName,
          properties,
          paths,
          polygons,
          bounds,
          route,
          routeSegments,
          scenery,
          seenPolygons,
          seenLines,
          completeMap,
        );
      }
    }
    if (cache && downloaded.has(tile.key))
      await cache.write(tileUrl(template, tile), new Uint8Array(tileData.get(tile.key)!));
  }
  progress('scenery', undefined, 'complete');
  if (completeMap && network)
    Object.assign(scenery, mappedNetworkScenery(course, bounds, await network.elements));
  return normalizeCourseScenery(scenery);
}
