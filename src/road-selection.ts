import { roadDistances, type GPSPoint } from './track-conversion.mjs';
import type { RoadStructureLine } from './road-structures.mjs';

export const maximumRoadLength = 8000;
export const minimumRoadLength = 100;
export const roadClasses = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'minor',
  'service',
  'track',
];

export interface RoadLine {
  coordinates: readonly (readonly number[])[];
  brunnel?: string;
}

interface Edge {
  to: string;
  distance: number;
}

interface Snap {
  point: GPSPoint;
  a: string;
  b: string;
}

const key = (point: GPSPoint) => `${point.lon.toFixed(7)},${point.lat.toFixed(7)}`;
const distance = (a: GPSPoint, b: GPSPoint) => roadDistances([a, b])[1];
const tileCell = 1000;

function doublesBack(a: GPSPoint, b: GPSPoint, c: GPSPoint) {
  if (distance(a, b) < 1 || distance(b, c) < 1) return false;
  const scale = Math.cos((b.lat * Math.PI) / 180);
  const ux = (b.lon - a.lon) * scale;
  const uy = b.lat - a.lat;
  const vx = (c.lon - b.lon) * scale;
  const vy = c.lat - b.lat;
  return (
    (ux * vx + uy * vy) / Math.hypot(ux, uy) / Math.hypot(vx, vy) < Math.cos((150 * Math.PI) / 180)
  );
}

function projectPoint(point: GPSPoint, from: GPSPoint, to: GPSPoint) {
  const scale = Math.cos((point.lat * Math.PI) / 180);
  const dx = (to.lon - from.lon) * scale;
  const dy = to.lat - from.lat;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.lon - from.lon) * scale * dx + (point.lat - from.lat) * dy) / (dx * dx + dy * dy),
    ),
  );
  return { lat: from.lat + t * dy, lon: from.lon + t * (to.lon - from.lon) };
}

export function routeLength(points: readonly GPSPoint[]) {
  return points.length ? roadDistances(points).at(-1)! : 0;
}

/** Remove collinear tile-overlap spurs without flattening real road hairpins. */
export function cleanRoadRoute(points: readonly GPSPoint[]): GPSPoint[] {
  const result: GPSPoint[] = [];
  for (const point of points) {
    result.push(point);
    while (result.length >= 4) {
      const [a, b, c, d] = result.slice(-4);
      if (
        distance(a, d) < 1 ||
        (!doublesBack(a, b, c) && !doublesBack(b, c, d)) ||
        distance(b, projectPoint(b, a, d)) > 2 ||
        distance(c, projectPoint(c, a, d)) > 2
      )
        break;
      result.splice(result.length - 3, 2);
    }
  }
  return result;
}

export function validateImportRoute(points: readonly GPSPoint[], closed = false) {
  if (
    points.length < 2 ||
    points.some(
      ({ lat, lon }) =>
        !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180,
    )
  )
    throw new Error('Select a route with valid geographic coordinates');
  const length = routeLength(points);
  if (length < minimumRoadLength || length > maximumRoadLength)
    throw new Error('Select between 100 m and 8 km of connected road');
  const checked = closed ? [points.at(-2)!, ...points] : points;
  for (let i = 1; i < checked.length - 1; i++) {
    const a = checked[i - 1];
    const b = checked[i];
    const c = checked[i + 1];
    if (doublesBack(a, b, c))
      throw new Error(
        'The route doubles back sharply. Remove or reposition waypoints near the reversal before building.',
      );
  }
  return length;
}

export function closeRoadLoop(points: readonly GPSPoint[], graph: RoadGraph) {
  const connection = graph.connect(points.at(-1)!, points[0], 2, {
    incoming: points.at(-2)!,
    outgoing: points[1],
    maximumLength: maximumRoadLength - routeLength(points),
  });
  validateImportRoute([...points, ...connection.slice(1)], true);
  return connection;
}

export function removeRouteWaypoint(
  sections: readonly GPSPoint[][],
  index: number,
  graph: RoadGraph,
) {
  if (!Number.isInteger(index) || index < 0 || index >= sections.length)
    throw new Error('Waypoint not found');
  if (sections.length === 1) return [];
  if (index === 0) return [[sections[1].at(-1)!], ...sections.slice(2)];
  if (index === sections.length - 1) return sections.slice(0, -1);
  const connection = graph.connect(sections[index - 1].at(-1)!, sections[index + 1].at(-1)!, 2);
  const result = [...sections.slice(0, index), connection, ...sections.slice(index + 2)];
  const points = result.flatMap((part, i) => (i ? part.slice(1) : part));
  if (routeLength(points) > maximumRoadLength)
    throw new Error('Removing this waypoint would create a route longer than 8 km.');
  return result;
}

/** Connects road vertices and tile seams, not arbitrary road-interior crossings. */
export class RoadGraph {
  private structureSegments = new Map<string, RoadStructureLine>();
  private points = new Map<string, GPSPoint>();
  private edges = new Map<string, Edge[]>();
  private segments = new Map<string, readonly [string, string]>();
  private buckets = new Map<string, string[]>();
  private segmentBuckets = new Map<string, Set<string>>();
  private junctions = new Map<string, Set<string>>();
  private dirty = false;

  private node(point: GPSPoint) {
    const id = key(point);
    if (this.points.has(id)) return id;
    const x = Math.floor(point.lon * 10000);
    const y = Math.floor(point.lat * 10000);
    // Adjacent tiles quantize the same OSM vertex slightly differently.
    const reach = Math.ceil(2 / (11.1195 * Math.cos((point.lat * Math.PI) / 180)));
    let nearest: string | undefined;
    let gap = 2;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const candidate of this.buckets.get(`${x + dx},${y + dy}`) ?? []) {
          const separation = distance(point, this.points.get(candidate)!);
          if (separation < gap) {
            nearest = candidate;
            gap = separation;
          }
        }
      }
    }
    if (nearest) return nearest;
    this.points.set(id, point);
    const bucket = `${x},${y}`;
    this.buckets.set(bucket, [...(this.buckets.get(bucket) ?? []), id]);
    return id;
  }

  add(lines: readonly RoadLine[]) {
    for (const { coordinates, brunnel } of lines) {
      for (let i = 1; i < coordinates.length; i++) {
        const pair = [coordinates[i - 1], coordinates[i]].map(([lon, lat]) => ({ lon, lat }));
        if (pair.some(({ lat, lon }) => !Number.isFinite(lat) || !Number.isFinite(lon)))
          throw new Error('OpenFreeMap supplied invalid road coordinates');
        const [a, b] = pair.map((point) => this.node(point));
        const id = [a, b].sort().join('/');
        if (a !== b && (brunnel === 'bridge' || brunnel === 'tunnel'))
          this.structureSegments.set(`${brunnel}/${id}`, {
            type: brunnel,
            coordinates: [coordinates[i - 1], coordinates[i]],
          });
        if (a === b || this.segments.has(id)) continue;
        const length = distance(this.points.get(a)!, this.points.get(b)!);
        this.edges.set(a, [...(this.edges.get(a) ?? []), { to: b, distance: length }]);
        this.edges.set(b, [...(this.edges.get(b) ?? []), { to: a, distance: length }]);
        this.segments.set(id, [a, b]);
        this.dirty = true;
        const from = this.points.get(a)!;
        const to = this.points.get(b)!;
        for (
          let x = Math.floor(Math.min(from.lon, to.lon) * tileCell);
          x <= Math.floor(Math.max(from.lon, to.lon) * tileCell);
          x++
        ) {
          for (
            let y = Math.floor(Math.min(from.lat, to.lat) * tileCell);
            y <= Math.floor(Math.max(from.lat, to.lat) * tileCell);
            y++
          ) {
            const cell = `${x},${y}`;
            if (!this.segmentBuckets.has(cell)) this.segmentBuckets.set(cell, new Set());
            this.segmentBuckets.get(cell)!.add(id);
          }
        }
      }
    }
  }

  structureLines() {
    return [...this.structureSegments.values()];
  }

  findSnap(point: GPSPoint, tolerance: number): Snap | undefined {
    let best: Snap | undefined;
    let closest = tolerance;
    for (const [a, b] of this.segments.values()) {
      const from = this.points.get(a)!;
      const to = this.points.get(b)!;
      const projected = projectPoint(point, from, to);
      const gap = distance(point, projected);
      if (gap < closest) {
        closest = gap;
        best = { point: projected, a, b };
      }
    }
    return best;
  }

  snap(point: GPSPoint, tolerance: number): Snap {
    const result = this.findSnap(point, tolerance);
    if (!result) throw new Error('Click closer to a road. Zoom in to load more road detail.');
    return result;
  }

  private joinTileEndpoints() {
    if (!this.dirty) return;
    this.dirty = false;
    // Buffered tiles can clip a road inside an overlapping tile's segment.
    // Join only dangling vertices, never arbitrary crossings between road interiors.
    for (const [id, links] of this.edges) {
      if (links.length !== 1) continue;
      const point = this.points.get(id)!;
      const x = Math.floor(point.lon * tileCell);
      const y = Math.floor(point.lat * tileCell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const segment of this.segmentBuckets.get(`${x + dx},${y + dy}`) ?? []) {
            const [a, b] = this.segments.get(segment)!;
            if (id === a || id === b) continue;
            const projection = projectPoint(point, this.points.get(a)!, this.points.get(b)!);
            if (distance(point, projection) > 2) continue;
            if (!this.junctions.has(segment)) this.junctions.set(segment, new Set());
            this.junctions.get(segment)!.add(id);
            for (const endpoint of [a, b]) {
              if (links.some((edge) => edge.to === endpoint)) continue;
              const length = distance(point, this.points.get(endpoint)!);
              links.push({ to: endpoint, distance: length });
              this.edges.get(endpoint)!.push({ to: id, distance: length });
            }
          }
        }
      }
    }
  }

  connect(
    from: GPSPoint,
    to: GPSPoint,
    tolerance: number,
    {
      incoming,
      outgoing,
      maximumLength = maximumRoadLength,
    }: {
      incoming?: GPSPoint;
      outgoing?: GPSPoint;
      maximumLength?: number;
    } = {},
  ): GPSPoint[] {
    this.joinTileEndpoints();
    const start = this.snap(from, tolerance);
    const finish = this.snap(to, tolerance);
    const nodes = new Map(this.points);
    const edges = new Map(this.edges);
    for (const [id, snap] of [
      ['start', start],
      ['finish', finish],
    ] as const) {
      nodes.set(id, snap.point);
      edges.set(id, []);
      const segment = [snap.a, snap.b].sort().join('/');
      for (const endpoint of [snap.a, snap.b, ...(this.junctions.get(segment) ?? [])]) {
        const length = distance(snap.point, nodes.get(endpoint)!);
        edges.get(id)!.push({ to: endpoint, distance: length });
        edges.set(endpoint, [...edges.get(endpoint)!, { to: id, distance: length }]);
      }
    }
    if (
      (start.a === finish.a && start.b === finish.b) ||
      (start.a === finish.b && start.b === finish.a)
    ) {
      edges.get('start')!.push({ to: 'finish', distance: distance(start.point, finish.point) });
    }
    const distances = new Map([['start', 0]]);
    const previous = new Map<string, string>();
    const stateNodes = new Map([['start', 'start']]);
    const heap: { id: string; cost: number }[] = [];
    const push = (item: { id: string; cost: number }) => {
      let index = heap.length;
      heap.push(item);
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (heap[parent].cost <= item.cost) break;
        heap[index] = heap[parent];
        index = parent;
      }
      heap[index] = item;
    };
    const pop = () => {
      const first = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        let index = 0;
        while (index * 2 + 1 < heap.length) {
          let child = index * 2 + 1;
          if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
          if (heap[child].cost >= last.cost) break;
          heap[index] = heap[child];
          index = child;
        }
        heap[index] = last;
      }
      return first;
    };
    push({ id: 'start', cost: 0 });
    while (heap.length) {
      const { id: state, cost } = pop();
      if (cost !== distances.get(state)) continue;
      const id = stateNodes.get(state)!;
      if (id === 'finish') {
        const result = [nodes.get(id)!];
        let cursor = state;
        while (previous.has(cursor)) {
          cursor = previous.get(cursor)!;
          result.push(nodes.get(stateNodes.get(cursor)!)!);
        }
        return cleanRoadRoute(
          result
            .reverse()
            .filter((point, i, points) => i === 0 || distance(point, points[i - 1]) > 0.05),
        );
      }
      for (const edge of edges.get(id) ?? []) {
        const predecessor = previous.get(state);
        if (
          (incoming || outgoing) &&
          predecessor &&
          doublesBack(nodes.get(stateNodes.get(predecessor)!)!, nodes.get(id)!, nodes.get(edge.to)!)
        )
          continue;
        // A loop must continue forward at its finish and rejoin the start in its driving direction.
        if (
          incoming &&
          distance(nodes.get(id)!, start.point) < 1 &&
          doublesBack(incoming, start.point, nodes.get(edge.to)!)
        )
          continue;
        if (
          outgoing &&
          distance(nodes.get(edge.to)!, finish.point) < 1 &&
          doublesBack(nodes.get(id)!, finish.point, outgoing)
        )
          continue;
        const next = cost + edge.distance;
        const nextState = incoming || outgoing ? JSON.stringify([id, edge.to]) : edge.to;
        if (next > maximumLength || next >= (distances.get(nextState) ?? Infinity)) continue;
        stateNodes.set(nextState, edge.to);
        distances.set(nextState, next);
        previous.set(nextState, state);
        push({ id: nextState, cost: next });
      }
    }
    throw new Error(
      incoming || outgoing
        ? 'No forward closing road was found within the remaining 8 km limit. Pan along the unselected part of the loop or zoom in to load its roads, or add a waypoint farther around the loop before clicking S.'
        : 'No connected route within 8 km in the loaded tiles. Pan along the road or zoom in for more detail, or add a closer waypoint.',
    );
  }
}
