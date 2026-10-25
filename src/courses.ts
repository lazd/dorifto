import * as THREE from 'three';
import { terrainBaseHeight, type TerrainRaster } from './terrain-profile';
import type { CourseGenerationWeights } from './course-generation';
import importedCourseCatalog, { mapSizes, mapUrls } from 'virtual:course-catalog';

export const startDistance = 5;
export const courseShoulderWidth = 1.6;
export const courseLineWidth = 0.16;
const spawnDistance = 30;
/** Open-road grid rows sit behind the start line, pole first. */
export const openRoadGridLead = 4;
export const openRoadGridSpacing = 8;
/**
 * Open-road start and finish lines sit this far from each end: room for a full grid behind
 * the start and braking run-off past the finish. Being symmetric, the same two lines serve
 * either driving direction.
 */
export const openRoadLineDistance = 45;

export interface CourseDefinition {
  id: string;
  name: string;
  venueName?: string;
  configName?: string;
  location?: {
    city: string;
    state: string;
    country: string;
    lat: number;
    lon: number;
  };
  width: number;
  /** Paved width beyond each white edge line; omitted uses courseShoulderWidth. */
  shoulderWidth?: number;
  /** Raster terrain transition distance outside the paved shoulder, in meters. */
  terrainTransition?: number;
  /** Optional pair of solid yellow lines along the road center. */
  doubleYellow?: boolean;
  coneSpacing?: number;
  flat?: boolean;
  elevationScale?: number;
  /** Multiplier for turn banking, independent of elevation. Omitted preserves legacy scaling. */
  bankingScale?: number;
  padRadius?: number;
  reverse?: boolean;
  /** False for a single point-to-point run; omitted keeps the course closed. */
  closed?: boolean;
  generation?:
    | { type: 'random'; seed: number }
    | { type: 'custom'; seed: number; weights: CourseGenerationWeights };
  /** Ground-plane coordinates [x, z], ordered in the driving direction. */
  points: readonly (readonly [number, number])[];
  /**
   * Road heights in meters, evenly spaced by distance along the forward route from
   * its start (t = 0). Replaces the procedural terrain height along the course.
   */
  elevation?: readonly number[];
  elevationSource?: string;
  terrain?: TerrainRaster;
}

/** Periodic heights for circuits; slope-continuous, monotone heights for open roads. */
export function courseProfileHeight(elevation: readonly number[], fraction: number, closed = true) {
  const scaled = closed
    ? THREE.MathUtils.euclideanModulo(fraction, 1) * elevation.length
    : THREE.MathUtils.clamp(fraction, 0, 1) * (elevation.length - 1);
  const index = Math.floor(scaled) % elevation.length;
  if (!closed && elevation.length > 1) {
    const next = Math.min(index + 1, elevation.length - 1);
    const delta = elevation[next] - elevation[index];
    const slope = (i: number) => {
      if (i === 0) return elevation[1] - elevation[0];
      if (i === elevation.length - 1) return elevation[i] - elevation[i - 1];
      const before = elevation[i] - elevation[i - 1];
      const after = elevation[i + 1] - elevation[i];
      return before * after <= 0 ? 0 : (2 * before * after) / (before + after);
    };
    const u = scaled - index;
    return (
      elevation[index] +
      delta * (3 * u ** 2 - 2 * u ** 3) +
      slope(index) * (u ** 3 - 2 * u ** 2 + u) +
      slope(next) * (u ** 3 - u ** 2)
    );
  }
  return THREE.MathUtils.lerp(
    elevation[index],
    elevation[closed ? (index + 1) % elevation.length : Math.min(index + 1, elevation.length - 1)],
    scaled - Math.floor(scaled),
  );
}

class CourseCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly markers: CourseDefinition['points'],
    private readonly reverse = false,
    readonly closed = true,
  ) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const scaled = this.closed
      ? THREE.MathUtils.euclideanModulo(this.reverse ? -t : t, 1) * this.markers.length
      : THREE.MathUtils.clamp(this.reverse ? 1 - t : t, 0, 1) * (this.markers.length - 1);
    if (!this.closed && (scaled === 0 || scaled === this.markers.length - 1)) {
      const [x, z] = this.markers[scaled];
      return target.set(x, 0, z);
    }
    const index = Math.floor(scaled);
    const u = scaled - index;
    const v = 1 - u;
    const weights = [
      v ** 3,
      3 * u ** 3 - 6 * u ** 2 + 4,
      -3 * u ** 3 + 3 * u ** 2 + 3 * u + 1,
      u ** 3,
    ];
    target.set(0, 0, 0);
    for (let i = 0; i < 4; i++) {
      const marker = index + i - 1;
      let x: number;
      let z: number;
      if (!this.closed && (marker < 0 || marker >= this.markers.length)) {
        // Linear endpoint extension preserves both endpoint position and approach direction.
        const end = marker < 0 ? 0 : this.markers.length - 1;
        const neighbor = marker < 0 ? 1 : end - 1;
        const distance = Math.abs(marker - end);
        x = this.markers[end][0] + distance * (this.markers[end][0] - this.markers[neighbor][0]);
        z = this.markers[end][1] + distance * (this.markers[end][1] - this.markers[neighbor][1]);
      } else {
        [x, z] = this.markers[(marker + this.markers.length) % this.markers.length];
      }
      target.x += (x * weights[i]) / 6;
      target.z += (z * weights[i]) / 6;
    }
    return target;
  }

  getTangent(t: number, target = new THREE.Vector3()) {
    return target
      .copy(this.getPoint(t + 0.00001))
      .sub(this.getPoint(t - 0.00001))
      .normalize();
  }
}

export function courseRoute(definition: CourseDefinition) {
  // A periodic cubic B-spline rounds marker corners instead of overshooting them.
  const route = new CourseCurve(definition.points, definition.reverse, definition.closed !== false);
  route.arcLengthDivisions = Math.max(1000, definition.points.length * 100);
  return route;
}

export function courseTurns(route: THREE.Curve<THREE.Vector3>) {
  const length = route.getLength();
  const open = route instanceof CourseCurve && !route.closed;
  const count = Math.ceil(length / 2);
  const spacing = length / count;
  // Signed curvature (1 / radius) sampled every ~2 m.
  const curvature = Array.from({ length: count }, (_, i) => {
    const before = route.getTangentAt(courseFraction(route, i * spacing - 4));
    const after = route.getTangentAt(courseFraction(route, i * spacing + 4));
    return Math.atan2(before.z * after.x - before.x * after.z, before.dot(after)) / 8;
  });
  const at = (i: number) =>
    route instanceof CourseCurve && !route.closed
      ? i < 0 || i >= count
        ? 0
        : curvature[i]
      : curvature[THREE.MathUtils.euclideanModulo(i, count)];
  const bending = (i: number) => Math.abs(at(i)) > 1 / 100;
  const straight = curvature.findIndex((_, i) => !bending(i));
  if (!open && straight < 0) return [];
  // A turn is a sustained bend that changes heading by 45 degrees and tightens below a 70 m radius.
  const turns: {
    distance: number;
    direction: number;
    apexDistance: number;
    exitDistance: number;
  }[] = [];
  for (
    let entry = open ? 0 : straight + 1;
    entry <= (open ? count - 1 : straight + count);
    entry++
  ) {
    if (
      !bending(entry) ||
      (bending(entry - 1) && Math.sign(at(entry - 1)) === Math.sign(at(entry)))
    )
      continue;
    const direction = Math.sign(at(entry));
    let heading = 0;
    let peak = 0;
    const headings: number[] = [];
    for (let i = entry; bending(i) && Math.sign(at(i)) === direction && i - entry < count; i++) {
      heading += Math.abs(at(i)) * spacing;
      headings.push(heading);
      peak = Math.max(peak, Math.abs(at(i)));
    }
    if (heading < Math.PI / 4 || peak < 1 / 70) continue;
    const routeDistance = (distance: number) =>
      open
        ? THREE.MathUtils.clamp(distance, 0, length)
        : THREE.MathUtils.euclideanModulo(distance, length);
    const distance = routeDistance(entry * spacing - 4);
    // Half the heading change gives broad, constant-radius bends a stable apex too.
    const apexIndex = headings.findIndex((value) => value >= heading / 2);
    const previousHeading = apexIndex === 0 ? 0 : headings[apexIndex - 1];
    const apexFraction = (heading / 2 - previousHeading) / (headings[apexIndex] - previousHeading);
    const apexDistance = routeDistance((entry + apexIndex + apexFraction - 0.5) * spacing);
    const exitDistance = routeDistance((entry + headings.length) * spacing);
    if (
      turns.every((turn) => {
        const gap = Math.abs(turn.distance - distance);
        return (open ? gap : Math.min(gap, length - gap)) > 24;
      })
    )
      turns.push({ distance, direction, apexDistance, exitDistance });
  }
  return turns.sort((a, b) => a.distance - b.distance);
}

export function courseCornerAt(route: THREE.Curve<THREE.Vector3>, distance: number) {
  const before = route.getTangentAt(courseFraction(route, distance - 6));
  const after = route.getTangentAt(courseFraction(route, distance + 6));
  const bend = Math.atan2(before.z * after.x - before.x * after.z, before.dot(after));
  return Math.abs(bend) > 12 / 75;
}

function courseFraction(route: THREE.Curve<THREE.Vector3>, distance: number) {
  const length = route.getLength();
  return route instanceof CourseCurve && !route.closed
    ? THREE.MathUtils.clamp(distance / length, 0, 1)
    : THREE.MathUtils.euclideanModulo(distance, length) / length;
}

export function courseKerbSegments(route: THREE.Curve<THREE.Vector3>) {
  const length = route.getLength();
  const count = Math.ceil(length / 2);
  const spacing = length / count;
  const wrap = (index: number) =>
    route instanceof CourseCurve && !route.closed
      ? index < 0 || index >= count
        ? -1
        : index
      : THREE.MathUtils.euclideanModulo(index, count);
  const curvature = Array.from({ length: count }, (_, index) => {
    const distance = (index + 0.5) * spacing;
    const before = route.getTangentAt(courseFraction(route, distance - 12));
    const after = route.getTangentAt(courseFraction(route, distance + 12));
    return Math.atan2(before.z * after.x - before.x * after.z, before.dot(after)) / 24;
  });
  const directions = curvature.map((value) => (Math.abs(value) >= 1 / 180 ? Math.sign(value) : 0));
  // Close short holes inside the same bend, without joining opposite sides of a chicane.
  for (let index = 0; index < count; index++) {
    if (!directions[index]) continue;
    for (let gap = 1; gap <= 4; gap++) {
      const next = wrap(index + gap);
      if (!directions[next]) continue;
      if (directions[next] === directions[index]) {
        for (let step = 1; step < gap; step++) directions[wrap(index + step)] = directions[index];
      }
      break;
    }
  }
  const accepted = Array<number>(count).fill(0);
  const visited = new Set<number>();
  for (let index = 0; index < count; index++) {
    const direction = directions[index];
    if (!direction || visited.has(index)) continue;
    let start = index;
    for (let step = 0; step < count - 1 && directions[wrap(start - 1)] === direction; step++)
      start = wrap(start - 1);
    const run: number[] = [];
    let heading = 0;
    let peak = 0;
    for (let step = 0; step < count; step++) {
      const current = wrap(start + step);
      if (directions[current] !== direction) break;
      visited.add(current);
      run.push(current);
      heading += Math.max(0, curvature[current] * direction) * spacing;
      peak = Math.max(peak, Math.abs(curvature[current]));
    }
    if (run.length * spacing < 16 || heading < THREE.MathUtils.degToRad(12) || peak < 1 / 140)
      continue;
    for (const current of run) accepted[current] = direction;
    for (const [edge, step] of [
      [run[0], -1],
      [run[run.length - 1], 1],
    ]) {
      for (let extension = 1; extension * spacing <= 4; extension++) {
        const current = wrap(edge + extension * step);
        if (current < 0 || curvature[current] * direction < 1 / 1000 || directions[current]) break;
        accepted[current] = direction;
      }
    }
  }
  return accepted
    .map((direction, index) => ({
      distance: index * spacing,
      endDistance: (index + 1) * spacing,
      direction,
    }))
    .filter(({ direction }) => direction !== 0);
}

export function courseStartDistance(definition: CourseDefinition, length: number) {
  if (definition.closed === false) return openRoadLineDistance;
  return definition.reverse ? length - startDistance : startDistance;
}

/** Distances of the start line and, on open roads, the separate finish line. */
export function courseGateDistances(definition: CourseDefinition, length: number) {
  const start = courseStartDistance(definition, length);
  return definition.closed === false ? [start, length - start] : [start];
}

export function readCourseReverse(parameters: URLSearchParams) {
  const value = parameters.get('reverse');
  if (value === null || value === '0' || value === 'false') return false;
  if (value === '' || value === '1' || value === 'true') return true;
  throw new Error(`Invalid reverse course option: ${value}`);
}

export function courseSpawn(
  definition: CourseDefinition,
  approachDistance = definition.closed === false ? openRoadGridLead : spawnDistance,
  lateralOffset = 0,
) {
  const route = courseRoute(definition);
  // Spawn on the approach side of the same physical start line in either direction.
  const length = route.getLength();
  const distance = courseStartDistance(definition, length) - approachDistance;
  const t =
    definition.closed === false
      ? THREE.MathUtils.clamp(distance / length, 0, 1)
      : THREE.MathUtils.euclideanModulo(distance, length) / length;
  const position = route.getPointAt(t);
  const tangent = route.getTangentAt(t);
  const heading = Math.atan2(tangent.x, tangent.z);
  return {
    position: [
      position.x + Math.cos(heading) * lateralOffset,
      position.z - Math.sin(heading) * lateralOffset,
    ] as const,
    heading,
  };
}

export function courseHasClearance(route: THREE.Curve<THREE.Vector3>, width: number) {
  const length = route.getLength();
  const samples = route.getSpacedPoints(Math.ceil(length / 2)).slice(0, -1);
  const spacing = length / samples.length;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const separation = Math.min(j - i, samples.length - (j - i)) * spacing;
      if (separation > width * 2 && samples[i].distanceTo(samples[j]) < width + 10) return false;
    }
  }
  return true;
}

// Fixed markers preserve the named course independently of random generation.
const hillsidePoints: CourseDefinition['points'] = [
  [84.01622954751265, 0],
  [83.92487526054921, 26.12612762443657],
  [69.15384490029841, 48.13773738710717],
  [43.14160621121232, 56.89100040112654],
  [19.06506027584704, 56.21735976199199],
  [0, 59.729722283795326],
  [-23.623736833566536, 69.65958110175593],
  [-54.73388835855688, 72.17778701416533],
  [-81.52414272569827, 56.748656259050236],
  [-92.32171154378821, 28.74009417125997],
  [-87.49982195923651, 0],
  [-100, -30],
  [-145, -45],
  [-190, -40],
  [-245, -45],
  [-275, -80],
  [-275, -130],
  [-250, -175],
  [-200, -190],
  [-155, -175],
  [-115, -140],
  [-70, -115],
  [-25, -95],
  [27.363917446122286, -80.68829415215477],
  [53.8119932085613, -70.96208036913637],
  [70.2405650712074, -48.89419930583218],
  [78.21984842673713, -24.350131429050233],
];

export function createCourseRandom(seed: number) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('Course seed must be an unsigned 32-bit integer');
  }
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCourse(seed: number): CourseDefinition {
  const random = createCourseRandom(seed);
  for (let attempt = 0; attempt < 256; attempt++) {
    const stretchX = 0.9 + random() * 0.2;
    const stretchZ = 0.9 + random() * 0.2;
    const angle = random() * Math.PI * 2;
    const mirror = random() < 0.5 ? -1 : 1;
    const phaseX = random() * Math.PI * 2;
    const phaseZ = random() * Math.PI * 2;
    // Spatially smooth warping varies the lobes without kinking nearby markers.
    const points: [number, number][] = hillsidePoints.map(([x, z]) => {
      const px = (x + 95) * stretchX + 15 * Math.sin((z + 55) / 100 + phaseX);
      const pz = (z + 55) * stretchZ + 15 * Math.sin((x + 95) / 150 + phaseZ);
      return [
        mirror * (px * Math.cos(angle) - pz * Math.sin(angle)),
        px * Math.sin(angle) + pz * Math.cos(angle),
      ];
    });
    const definition: CourseDefinition = {
      id: 'random',
      name: `Random Circuit (${seed})`,
      width: 17.5,
      points,
      generation: { type: 'random', seed },
    };
    const scale = (975 + random() * 100) / courseRoute(definition).getLength();
    points.forEach((point) => {
      point[0] *= scale;
      point[1] *= scale;
    });
    const route = courseRoute(definition);
    const length = route.getLength();
    const samples = route.getSpacedPoints(Math.ceil(length / 0.5)).slice(0, -1);
    let navigable = true;
    const radii: number[] = [];
    let leftDistance = 0;
    let rightDistance = 0;
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    for (let i = 0; i < samples.length && navigable; i++) {
      const before = samples[(i + samples.length - 1) % samples.length];
      const current = samples[i];
      const after = samples[(i + 1) % samples.length];
      const incoming = current.clone().sub(before);
      const outgoing = after.clone().sub(current);
      const bend = Math.atan2(
        incoming.z * outgoing.x - incoming.x * outgoing.z,
        incoming.dot(outgoing),
      );
      const radius = (incoming.length() + outgoing.length()) / (2 * Math.abs(bend));
      radii.push(radius);
      // Sampling margin keeps the actual centerline radius above 38 m.
      if (radius < 38.2) navigable = false;
      if (radius < 150) {
        if (bend > 0) leftDistance += length / samples.length;
        else rightDistance += length / samples.length;
      }
      const height = terrainBaseHeight(current.x, current.z);
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
      const grade = Math.abs(terrainBaseHeight(after.x, after.z) - height) / outgoing.length();
      if (grade > 0.12) navigable = false;
    }
    if (
      !navigable ||
      Math.min(leftDistance, rightDistance) < length * 0.1 ||
      maxHeight - minHeight < 10 ||
      maxHeight - minHeight > 20
    )
      continue;
    radii.sort((a, b) => a - b);
    const medianRadius = radii[Math.floor(radii.length / 2)];
    if (medianRadius < 60 || medianRadius > 110) continue;
    if (courseHasClearance(route, definition.width)) {
      definition.bankingScale = 1.2 + (random() + random()) * 0.4;
      return definition;
    }
  }
  throw new Error(`Unable to generate a navigable course for seed ${seed}`);
}

// Generated by scripts/import-track.mjs from recorded-lap or road GPS data.
const importedCourses = importedCourseCatalog.sort((a, b) => a.name.localeCompare(b.name));

type MapProgress = (fraction: number) => void;
const loadedMaps = new Map<
  string,
  {
    promise: Promise<CourseDefinition>;
    progress: { fraction: number; listeners: Set<MapProgress> };
  }
>();

/** Full terrain is fetched only for a selected preview or driving session. */
export async function loadCourseDefinition(
  definition: CourseDefinition,
  onProgress?: MapProgress,
): Promise<CourseDefinition> {
  const url = mapUrls[definition.id];
  if (!url || definition.terrain) {
    onProgress?.(1);
    return definition;
  }
  let pending = loadedMaps.get(url);
  if (!pending) {
    const progress = { fraction: 0, listeners: new Set<MapProgress>() };
    const report = (fraction: number) => {
      if (fraction === progress.fraction) return;
      progress.fraction = fraction;
      progress.listeners.forEach((listener) => listener(fraction));
    };
    const promise = (async () => {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok)
        throw new Error(`Unable to load ${definition.name}: HTTP ${response.status}`);
      if (!response.body) throw new Error(`Empty map response for ${definition.name}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];
      let received = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(decoder.decode(value, { stream: true }));
          received += value.byteLength;
          // Fetch exposes decoded bytes, even when the server compresses the response.
          report(Math.min(0.99, Math.floor((received / mapSizes[definition.id]) * 100) / 100));
        }
      } finally {
        reader.releaseLock();
      }
      chunks.push(decoder.decode());
      const course: CourseDefinition = JSON.parse(chunks.join(''));
      if (course.id !== definition.id || !Array.isArray(course.points) || !course.terrain)
        throw new Error(`Invalid map data for ${definition.name}`);
      report(1);
      return course;
    })();
    pending = { promise, progress };
    loadedMaps.set(url, pending);
  }
  try {
    if (onProgress) {
      pending.progress.listeners.add(onProgress);
      onProgress(pending.progress.fraction);
    }
    return { ...(await pending.promise), reverse: definition.reverse };
  } catch (error) {
    loadedMaps.delete(url);
    throw error;
  } finally {
    if (onProgress) pending.progress.listeners.delete(onProgress);
  }
}

export const roads = importedCourses.filter(({ closed }) => closed === false);
export const racetracks = importedCourses.filter(({ closed }) => closed !== false);

export const courses: readonly CourseDefinition[] = [
  {
    id: 'sweeper',
    name: 'Sweeper Loop',
    width: 17.5,
    coneSpacing: 6,
    bankingScale: 3,
    points: [
      [0, 0],
      [0, 30],
      [-8, 60],
      [0, 90],
      [30, 115],
      [65, 110],
      [90, 80],
      [85, 45],
      [60, 25],
      [65, -10],
      [40, -35],
      [10, -25],
    ],
  },
  {
    id: 'hillside',
    name: 'Hillside Circuit',
    width: 17.5,
    bankingScale: 4,
    points: hillsidePoints,
  },
  {
    id: 'hilly-drift',
    name: 'Hilly Drift',
    width: 17.5,
    points: [
      [-61.88367320531236, -204.52177657500891],
      [-89.18017635133648, -206.61585002562447],
      [-113.61744077245802, -192.38808424074043],
      [-124.87576766268573, -165.77666244806716],
      [-125.6557427687624, -140.96417789058538],
      [-130.21062590328663, -121.33948620731705],
      [-141.34052772392874, -96.94992962029923],
      [-144.3266661514913, -64.78527853066096],
      [-127.9364140048153, -37.092731936662695],
      [-98.40694631893439, -24.95523271419227],
      [-68.4831302192617, -27.60006170065486],
      [-36.946210607536194, -10.81672989596017],
      [-19.75158219788583, 38.19064083060414],
      [-22.72233837107017, 83.99250068812825],
      [-14.559242367977689, 141.84063498857188],
      [23.2503436506156, 179.5525132741382],
      [75.10117154460352, 190.48087159008563],
      [120.56638775890984, 174.40757653954924],
      [133.45532280628453, 125.58802407737316],
      [115.5718702558673, 75.93667589405798],
      [77.66235581807635, 26.911776431816087],
      [50.78921768207196, -25.26280780915116],
      [30.301247568508014, -76.16238354533743],
      [17.531138807976387, -133.19516382556097],
      [9.254238250007111, -162.3996392751518],
      [-12.28241398419404, -183.43002428364392],
      [-37.07271277101184, -195.54119071713902],
    ],
  },
  {
    id: 'skidpad',
    name: 'Flat Skidpad',
    width: 62.5,
    coneSpacing: 12,
    flat: true,
    padRadius: 250,
    points: Array.from({ length: 32 }, (_, i): [number, number] => {
      const angle = (-i / 32) * Math.PI * 2;
      return [50 * Math.cos(angle), 50 * Math.sin(angle)];
    }),
  },
  ...racetracks,
  ...roads,
];
