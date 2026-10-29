/** Saved map scenery in the course's local meter coordinates, independent of driving direction. */
export type SceneryPoint = [number, number];
export type SceneryPolygon = SceneryPoint[][];
export const completeMapSize = 2000;

/** Quarter-circle widening at the main pavement, tapering to the mapped branch width. */
export function junctionRoadFlare(distance: number) {
  const radius = 6;
  const arc = radius - Math.max(0, Math.min(radius, distance));
  return radius - Math.sqrt(Math.max(0, radius * radius - arc * arc));
}

/** Join unambiguous equal-width fragments before rounding their shared corner. */
export function joinSceneryRoads(roads: CourseScenery['roads']): CourseScenery['roads'] {
  const remaining = roads
    .map((road) => ({
      ...road,
      points: road.points.filter(
        (p, i, all) => !i || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) >= 0.01,
      ),
    }))
    .filter((road) => road.points.length >= 2);
  const joined: CourseScenery['roads'] = [];
  const near = (a: SceneryPoint, b: SceneryPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.1;
  while (remaining.length) {
    const road = remaining.shift()!;
    for (const reverse of [false, true]) {
      if (reverse) road.points.reverse();
      while (true) {
        const end = road.points.at(-1)!;
        const degree = roads.reduce(
          (count, other) =>
            count + Number(near(end, other.points[0])) + Number(near(end, other.points.at(-1)!)),
          0,
        );
        if (degree !== 2) break;
        const matches = remaining.flatMap((other, i) =>
          [false, true].flatMap((flip) =>
            near(end, flip ? other.points.at(-1)! : other.points[0]) ? [{ i, flip, other }] : [],
          ),
        );
        if (
          matches.length !== 1 ||
          Math.abs(matches[0].other.width - road.width) > 0.01 ||
          matches[0].other.roadClass !== road.roadClass ||
          (matches[0].other.oneway ?? 0) * (matches[0].flip ? -1 : 1) !==
            (road.oneway ?? 0) * (reverse ? -1 : 1) ||
          matches[0].other.centerline !== road.centerline ||
          matches[0].other.lanes !== road.lanes ||
          matches[0].other.service !== road.service ||
          matches[0].other.structure !== road.structure ||
          (matches[0].other.layer ?? 0) !== (road.layer ?? 0)
        )
          break;
        const { i, flip, other } = matches[0];
        remaining.splice(i, 1);
        const points = flip ? [...other.points].reverse() : other.points;
        road.points.push(...points.slice(1));
      }
      if (reverse) road.points.reverse();
    }
    joined.push(road);
  }
  return joined;
}

/** Round local corners without moving endpoints or cutting far across mapped switchbacks. */
export function smoothSceneryLine(
  points: SceneryPoint[],
  width: number,
  junctions?: ReadonlySet<string>,
): SceneryPoint[] {
  const clean = points.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) >= 0.01,
  );
  if (clean.length < 3) return clean;
  const result: SceneryPoint[] = [clean[0]];
  for (let i = 1; i < clean.length - 1; i++) {
    const a = clean[i - 1],
      b = clean[i],
      c = clean[i + 1];
    if (junctions?.has(sceneryPointKey(b))) {
      result.push(b);
      continue;
    }
    const incoming = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const outgoing = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const trim = Math.min(width * 1.5, 12, incoming / 3, outgoing / 3);
    const start: SceneryPoint = [
      b[0] + ((a[0] - b[0]) * trim) / incoming,
      b[1] + ((a[1] - b[1]) * trim) / incoming,
    ];
    const end: SceneryPoint = [
      b[0] + ((c[0] - b[0]) * trim) / outgoing,
      b[1] + ((c[1] - b[1]) * trim) / outgoing,
    ];
    const steps = Math.max(2, Math.ceil(trim));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps,
        u = 1 - t;
      result.push([
        u * u * start[0] + 2 * u * t * b[0] + t * t * end[0],
        u * u * start[1] + 2 * u * t * b[1] + t * t * end[1],
      ]);
    }
  }
  result.push(clean.at(-1)!);
  return result;
}

export const sceneryPointKey = ([x, z]: SceneryPoint) => `${x.toFixed(2)},${z.toFixed(2)}`;

export function sceneryJunctions(roads: CourseScenery['roads']) {
  const owners = new Map<string, Set<number>>();
  roads.forEach((road, i) => {
    if (road.structure) return;
    for (const point of road.points) {
      const key = sceneryPointKey(point);
      const set = owners.get(key) ?? new Set<number>();
      set.add(i);
      owners.set(key, set);
    }
  });
  return new Set([...owners].filter(([, set]) => set.size > 1).map(([key]) => key));
}

export interface CourseScenery {
  version: 1;
  importRevision?: number;
  bounds?: { minX: number; minZ: number; maxX: number; maxZ: number };
  buildings: { rings: SceneryPolygon; height: number }[];
  water: { rings: SceneryPolygon }[];
  waterways: { points: SceneryPoint[]; width: number }[];
  vegetation: { rings: SceneryPolygon; kind: 'trees' | 'scrub' | 'grass' }[];
  roads: {
    points: SceneryPoint[];
    width: number;
    roadClass?: string;
    centerline?: 'double-yellow' | 'dashed-yellow';
    oneway?: -1 | 1;
    structure?: 'bridge' | 'tunnel';
    layer?: number;
    lanes?: number;
    service?: string;
  }[];
  parking?: { rings: SceneryPolygon }[];
  stopSigns?: { point: SceneryPoint; direction: SceneryPoint; width: number; oneway?: boolean }[];
}

export const sceneryImportRevision = 8;

/** Normalize decoded tile fragments once, before saving imported scenery. */
export function normalizeCourseScenery(scenery: CourseScenery): CourseScenery {
  return {
    ...scenery,
    roads: joinSceneryRoads(scenery.roads),
  };
}

export type SceneryCategory = 'buildings' | 'water' | 'vegetation' | 'nearbyRoads';

export function validateCourseScenery(value: CourseScenery) {
  const point = (p: SceneryPoint) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const line = (points: SceneryPoint[]) =>
    Array.isArray(points) && points.length >= 2 && points.every(point);
  const polygon = (rings: SceneryPolygon) =>
    Array.isArray(rings) &&
    rings.length > 0 &&
    rings.every((ring) => line(ring) && ring.length >= 3);
  const width = (n: number) => Number.isFinite(n) && n > 0 && n <= 100;
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.buildings) ||
    !Array.isArray(value.water) ||
    !Array.isArray(value.waterways) ||
    !Array.isArray(value.vegetation) ||
    !Array.isArray(value.roads) ||
    (value.bounds !== undefined &&
      (!Number.isFinite(value.bounds.minX) ||
        !Number.isFinite(value.bounds.minZ) ||
        !Number.isFinite(value.bounds.maxX) ||
        !Number.isFinite(value.bounds.maxZ) ||
        value.bounds.minX >= value.bounds.maxX ||
        value.bounds.minZ >= value.bounds.maxZ)) ||
    !value.buildings.every(
      (b) => b && polygon(b.rings) && Number.isFinite(b.height) && b.height > 0 && b.height <= 1000,
    ) ||
    !value.water.every((w) => w && polygon(w.rings)) ||
    !value.waterways.every((w) => w && line(w.points) && width(w.width)) ||
    !value.vegetation.every(
      (v) => v && polygon(v.rings) && ['trees', 'scrub', 'grass'].includes(v.kind),
    ) ||
    (value.parking !== undefined &&
      (!Array.isArray(value.parking) || !value.parking.every((p) => p && polygon(p.rings)))) ||
    (value.stopSigns !== undefined &&
      (!Array.isArray(value.stopSigns) ||
        !value.stopSigns.every(
          (s) =>
            s &&
            point(s.point) &&
            point(s.direction) &&
            Math.abs(Math.hypot(...s.direction) - 1) < 0.001 &&
            width(s.width) &&
            (s.oneway === undefined || typeof s.oneway === 'boolean'),
        ))) ||
    !value.roads.every(
      (r) =>
        r &&
        line(r.points) &&
        width(r.width) &&
        (r.roadClass === undefined || typeof r.roadClass === 'string') &&
        (r.centerline === undefined ||
          r.centerline === 'double-yellow' ||
          r.centerline === 'dashed-yellow') &&
        (r.oneway === undefined || r.oneway === -1 || r.oneway === 1) &&
        (r.structure === undefined || r.structure === 'bridge' || r.structure === 'tunnel') &&
        (r.layer === undefined || Number.isInteger(r.layer)) &&
        (r.lanes === undefined || (Number.isInteger(r.lanes) && r.lanes > 0 && r.lanes <= 20)) &&
        (r.service === undefined || typeof r.service === 'string'),
    )
  )
    throw new Error('Invalid saved course scenery');
}
