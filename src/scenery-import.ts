import { classifyRings, VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { roadClasses } from './road-selection';
import { courseRoute, type CourseDefinition } from './courses';
import type { MapDefinition } from './course-builder-data';
import type { CourseScenery, SceneryPoint, SceneryPolygon } from './scenery-data';
import { completeMapSize, normalizeCourseScenery, sceneryImportRevision } from './scenery-data';

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
const metersPerDegree = (6371008.8 * Math.PI) / 180;
const maxTileCacheSize = 128;

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type LocalLine = SceneryPoint[];
type Tile = { x: number; y: number; z: number; key: string };
type VectorProperties = Record<string, number | string | boolean>;

const tileBytes = new Map<string, Promise<ArrayBuffer>>();
let tileTemplate: Promise<string> | undefined;

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

function completeMapBounds(course: CourseDefinition): Bounds {
  const points = course.points;
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minZ = Math.min(...points.map(([, z]) => z));
  const maxZ = Math.max(...points.map(([, z]) => z));
  const half = completeMapSize / 2;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return {
    minX: centerX - half,
    maxX: centerX + half,
    minZ: centerZ - half,
    maxZ: centerZ + half,
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
  const corners: SceneryPoint[] = [
    [bounds.minX, bounds.minZ],
    [bounds.minX, bounds.maxZ],
    [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ],
  ];
  const tiles = new Map<string, Tile>();
  const count = 2 ** zoom;
  const tilePoints = corners.map((point) => {
    const { lat, lon } = localToLatLon(course, point);
    return tileCoordinate(lon, lat);
  });
  const minX = Math.max(0, Math.floor(Math.min(...tilePoints.map(({ x }) => x))));
  const maxX = Math.min(count - 1, Math.floor(Math.max(...tilePoints.map(({ x }) => x))));
  const minY = Math.max(0, Math.floor(Math.min(...tilePoints.map(({ y }) => y))));
  const maxY = Math.min(count - 1, Math.floor(Math.max(...tilePoints.map(({ y }) => y))));
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++) {
      const boundsForTile = tileLocalBounds(course, x, y);
      if (
        boundsForTile.maxX < bounds.minX ||
        boundsForTile.minX > bounds.maxX ||
        boundsForTile.maxZ < bounds.minZ ||
        boundsForTile.minZ > bounds.maxZ
      )
        continue;
      const key = `${zoom}/${x}/${y}`;
      tiles.set(key, { x, y, z: zoom, key });
    }
  if (tiles.size > maxTiles)
    throw new Error(
      `Complete map scenery needs ${tiles.size} vector tiles at zoom ${zoom}; the limit is ${maxTiles}.`,
    );
  return [...tiles.values()];
}

async function fetchTileTemplate(): Promise<string> {
  if (!tileTemplate) {
    tileTemplate = (async () => {
      const response = await fetch(tileJsonUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`OpenFreeMap TileJSON failed (${response.status}).`);
      const metadata = (await response.json()) as { tiles?: string[] };
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
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok)
        throw new Error(`OpenFreeMap tile request failed (${response.status}): ${url}`);
      return response.arrayBuffer();
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

async function loadTiles(tiles: Tile[], template: string) {
  const responses = new Map<string, ArrayBuffer>();
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tiles.length) }, async () => {
    while (next < tiles.length) {
      const index = next++;
      const tile = tiles[index];
      const url = tileUrl(template, tile);
      try {
        responses.set(tile.key, await loadTile(url));
      } catch (error) {
        throw new Error(`Could not acquire scenery tile ${tile.key}.`, { cause: error });
      }
    }
  });
  await Promise.all(workers);
  return responses;
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
      if (rings.length && polygonNearRoute(rings, route, routeSegments)) {
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
      if (!rings.length || !polygonNearRoute(rings, route, routeSegments)) continue;
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
      clippedLine(
        path,
        bounds,
        routeSegments,
        lines,
        completeMap && layer === 'transportation' ? Infinity : corridor,
      );
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
  course: CourseDefinition,
  mode: boolean | MapDefinition,
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
  const template = await fetchTileTemplate();
  const tileData = await loadTiles(tiles, template);
  const bounds = mapBounds
    ? intersectBounds(terrainBounds(course), mapBounds)
    : intersectBounds(terrainBounds(course), terrainGridBounds(course));
  if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ)
    throw new Error('Course scenery bounds do not overlap the supported terrain grid.');
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
  }
  return normalizeCourseScenery(scenery);
}
