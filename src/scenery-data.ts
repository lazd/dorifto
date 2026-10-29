/** Saved map scenery in the course's local meter coordinates, independent of driving direction. */
export type SceneryPoint = [number, number];
export type SceneryPolygon = SceneryPoint[][];
export const completeMapSize = 2500;

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

/**
 * Gaussian smoothing by distance along a line. Ends reflect through the endpoints, so endpoint
 * values and their local grade are kept.
 */
export function smoothAlong(values: number[], distances: number[], sigma: number) {
  const reach = sigma * 3;
  const cutoff = Math.exp(-4.5);
  const length = distances.at(-1)!;
  const first = values[0],
    last = values.at(-1)!;
  return values.map((_, i) => {
    const at = distances[i];
    let sum = 0,
      weight = 0;
    const add = (offset: number, value: number) => {
      // Tapered to zero at the reach, so samples landing on the cutoff can't bias the result.
      const w = Math.max(0, Math.exp(-0.5 * (offset / sigma) ** 2) - cutoff);
      sum += value * w;
      weight += w;
    };
    const contribute = (j: number) => {
      add(distances[j] - at, values[j]);
      const before = -distances[j] - at;
      if (j > 0 && before >= -reach) add(before, 2 * first - values[j]);
      const after = 2 * length - distances[j] - at;
      if (j < values.length - 1 && after <= reach) add(after, 2 * last - values[j]);
    };
    for (let j = i; j >= 0 && at - distances[j] <= reach; j--) contribute(j);
    for (let j = i + 1; j < values.length && distances[j] - at <= reach; j++) contribute(j);
    return sum / weight;
  });
}

/** Offsets that fade out from each anchor, averaged where anchors' reaches overlap. */
export function anchorCorrections(
  distances: number[],
  anchors: { distance: number; delta: number }[],
  reach: number,
) {
  return distances.map((distance) => {
    let delta = 0,
      weight = 0;
    for (const anchor of anchors) {
      const w = 1 - smoothstep(Math.abs(distance - anchor.distance), 0, reach);
      delta += anchor.delta * w;
      weight += w;
    }
    return weight ? delta / Math.max(1, weight) : 0;
  });
}

const smoothstep = (x: number, min: number, max: number) => {
  const t = Math.min(1, Math.max(0, (x - min) / (max - min)));
  return t * t * (3 - 2 * t);
};

/**
 * Smooth mapped corners into continuous curves. OSM digitizes bends as dense nodes, so the
 * line is resampled and blurred by arc length, then pulled back onto its ends and junctions.
 */
export function smoothSceneryLine(
  points: SceneryPoint[],
  width: number,
  junctions?: ReadonlySet<string>,
): SceneryPoint[] {
  const clean = points.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) >= 0.01,
  );
  if (clean.length < 3) return clean;
  const sigma = Math.min(Math.max(width, 3), 10);
  const reach = sigma * 3;
  const spacing = Math.min(2, sigma / 3);
  const samples: SceneryPoint[] = [clean[0]];
  const distances = [0];
  const nodes = [0];
  for (let i = 1; i < clean.length; i++) {
    const [ax, az] = clean[i - 1],
      [bx, bz] = clean[i];
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(length / spacing - 1e-6));
    const start = distances.at(-1)!;
    for (let j = 1; j < steps; j++) {
      samples.push([ax + ((bx - ax) * j) / steps, az + ((bz - az) * j) / steps]);
      distances.push(start + (length * j) / steps);
    }
    samples.push(clean[i]);
    distances.push(start + length);
    nodes.push(samples.length - 1);
  }
  const pinned = nodes.slice(1, -1).filter((i) => junctions?.has(sceneryPointKey(samples[i])));
  const axes = [0, 1].map((axis) => {
    const raw = samples.map((p) => p[axis]);
    const smooth = smoothAlong(raw, distances, sigma);
    const corrections = anchorCorrections(
      distances,
      pinned.map((i) => ({ distance: distances[i], delta: raw[i] - smooth[i] })),
      reach,
    );
    return smooth.map((value, i) => value + corrections[i]);
  });
  for (const i of [0, ...pinned, samples.length - 1]) [axes[0][i], axes[1][i]] = samples[i];
  // Keep only the samples needed to hold the smoothed curve within 2 cm, so dense OSM bends
  // don't multiply the draped road geometry.
  const smoothed = samples.map((_, i): SceneryPoint => [axes[0][i], axes[1][i]]);
  const anchors = [0, ...pinned, samples.length - 1];
  const keep = samples.map(() => false);
  for (const i of anchors) keep[i] = true;
  const spans = anchors.slice(1).map((to, i): [number, number] => [anchors[i], to]);
  while (spans.length) {
    const [from, to] = spans.pop()!;
    const a = smoothed[from],
      b = smoothed[to];
    const deviations: number[] = [];
    for (let i = from + 1; i < to; i++) deviations.push(segmentDistance(smoothed[i], a, b));
    const worst = Math.max(0, ...deviations);
    if (worst <= 0.02) continue;
    // Splitting at every tied sample keeps the result independent of travel direction.
    const splits = [from];
    deviations.forEach((d, i) => {
      if (d >= worst - 1e-9) splits.push(from + 1 + i);
    });
    splits.push(to);
    for (let i = 1; i < splits.length; i++) {
      keep[splits[i]] = true;
      spans.push([splits[i - 1], splits[i]]);
    }
  }
  return smoothed.filter((_, i) => keep[i]);
}

function segmentDistance([x, z]: SceneryPoint, [ax, az]: SceneryPoint, [bx, bz]: SceneryPoint) {
  const dx = bx - ax,
    dz = bz - az;
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
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

/** Smooth continuous road fragments together, retaining their shared junction anchors. */
export function smoothSceneryRoads(roads: CourseScenery['roads']) {
  type Road = CourseScenery['roads'][number];
  const junctions = sceneryJunctions(roads);
  const ends = new Map<string, { road: Road; last: boolean }[]>();
  const interiors = new Set<string>();
  for (const road of roads) {
    for (const point of road.points.slice(1, -1)) interiors.add(sceneryPointKey(point));
    for (const last of [false, true]) {
      const key = sceneryPointKey(last ? road.points.at(-1)! : road.points[0]);
      const bucket = ends.get(key) ?? [];
      bucket.push({ road, last });
      ends.set(key, bucket);
    }
  }
  const result = new Map<Road, SceneryPoint[]>();
  const visited = new Set<Road>();
  for (const road of roads) {
    if (visited.has(road)) continue;
    visited.add(road);
    if (road.structure) {
      result.set(road, smoothSceneryLine(road.points, road.width, junctions));
      continue;
    }
    const chain = [{ road, reverse: false }];
    const extend = (last: boolean) => {
      while (true) {
        const member = last ? chain.at(-1)! : chain[0];
        const point = last !== member.reverse ? member.road.points.at(-1)! : member.road.points[0];
        const key = sceneryPointKey(point),
          bucket = ends.get(key)!;
        if (bucket.length !== 2 || interiors.has(key)) break;
        const next = bucket.find((end) => end.road !== member.road);
        if (
          !next ||
          visited.has(next.road) ||
          next.road.structure ||
          (next.road.layer ?? 0) !== (member.road.layer ?? 0)
        )
          break;
        visited.add(next.road);
        const entry = { road: next.road, reverse: last ? next.last : !next.last };
        if (last) chain.push(entry);
        else chain.unshift(entry);
      }
    };
    extend(false);
    extend(true);
    const points = chain.flatMap(({ road, reverse }, i) => {
      const points = reverse ? [...road.points].reverse() : road.points;
      return i ? points.slice(1) : points;
    });
    const rounded = smoothSceneryLine(
      points,
      Math.max(...chain.map(({ road }) => road.width)),
      junctions,
    );
    if (chain.length === 1) {
      result.set(road, rounded);
      continue;
    }
    let from = 0;
    for (const { road, reverse } of chain) {
      const key = sceneryPointKey(reverse ? road.points[0] : road.points.at(-1)!);
      const to = rounded.findIndex((point, i) => i > from && sceneryPointKey(point) === key);
      if (to < 0) throw new Error('Smoothed road lost a fragment endpoint');
      const points = rounded.slice(from, to + 1);
      result.set(road, reverse ? points.reverse() : points);
      from = to;
    }
  }
  return result;
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
