import * as THREE from 'three';
import { terrainBaseHeight } from './terrain-profile';

export const startDistance = 5;

export interface CourseDefinition {
  id: string;
  name: string;
  width: number;
  coneSpacing?: number;
  flat?: boolean;
  elevationScale?: number;
  padRadius?: number;
  reverse?: boolean;
  /** Ground-plane coordinates [x, z], ordered in the driving direction. */
  points: readonly (readonly [number, number])[];
  /**
   * Road heights in meters, evenly spaced by distance along the forward route from
   * its start (t = 0). Replaces the procedural terrain height along the course.
   */
  elevation?: readonly number[];
}

/** Periodic linear interpolation of an elevation profile at a forward route fraction. */
export function courseProfileHeight(elevation: readonly number[], fraction: number) {
  const scaled = THREE.MathUtils.euclideanModulo(fraction, 1) * elevation.length;
  const index = Math.floor(scaled) % elevation.length;
  return THREE.MathUtils.lerp(elevation[index], elevation[(index + 1) % elevation.length], scaled - Math.floor(scaled));
}

class CourseCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly markers: CourseDefinition['points'], private readonly reverse = false) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const scaled = THREE.MathUtils.euclideanModulo(this.reverse ? -t : t, 1) * this.markers.length;
    const index = Math.floor(scaled);
    const u = scaled - index;
    const v = 1 - u;
    const weights = [v ** 3, 3 * u ** 3 - 6 * u ** 2 + 4,
      -3 * u ** 3 + 3 * u ** 2 + 3 * u + 1, u ** 3];
    target.set(0, 0, 0);
    for (let i = 0; i < 4; i++) {
      const [x, z] = this.markers[(index + i - 1 + this.markers.length) % this.markers.length];
      target.x += x * weights[i] / 6;
      target.z += z * weights[i] / 6;
    }
    return target;
  }

  getTangent(t: number, target = new THREE.Vector3()) {
    return target.copy(this.getPoint(t + 0.00001)).sub(this.getPoint(t - 0.00001)).normalize();
  }
}

export function courseRoute(definition: CourseDefinition) {
  // A periodic cubic B-spline rounds marker corners instead of overshooting them.
  const route = new CourseCurve(definition.points, definition.reverse);
  route.arcLengthDivisions = Math.max(1000, definition.points.length * 100);
  return route;
}

export function courseTurns(route: THREE.Curve<THREE.Vector3>) {
  const length = route.getLength();
  const count = Math.ceil(length / 2);
  const spacing = length / count;
  // Signed curvature (1 / radius) sampled every ~2 m.
  const curvature = Array.from({ length: count }, (_, i) => {
    const before = route.getTangentAt(THREE.MathUtils.euclideanModulo((i * spacing - 4) / length, 1));
    const after = route.getTangentAt(((i * spacing + 4) / length) % 1);
    return Math.atan2(before.z * after.x - before.x * after.z, before.dot(after)) / 8;
  });
  const at = (i: number) => curvature[THREE.MathUtils.euclideanModulo(i, count)];
  const bending = (i: number) => Math.abs(at(i)) > 1 / 100;
  const straight = curvature.findIndex((_, i) => !bending(i));
  if (straight < 0) return [];
  // A turn is a sustained bend that changes heading by 45 degrees and tightens below a 70 m radius.
  const turns: { distance: number; direction: number; apexDistance: number; exitDistance: number }[] = [];
  for (let entry = straight + 1; entry <= straight + count; entry++) {
    if (!bending(entry) || (bending(entry - 1) && Math.sign(at(entry - 1)) === Math.sign(at(entry)))) continue;
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
    const distance = THREE.MathUtils.euclideanModulo(entry * spacing - 4, length);
    // Half the heading change gives broad, constant-radius bends a stable apex too.
    const apexIndex = headings.findIndex((value) => value >= heading / 2);
    const previousHeading = apexIndex === 0 ? 0 : headings[apexIndex - 1];
    const apexFraction = (heading / 2 - previousHeading) / (headings[apexIndex] - previousHeading);
    const apexDistance = THREE.MathUtils.euclideanModulo(
      (entry + apexIndex + apexFraction - 0.5) * spacing, length,
    );
    const exitDistance = THREE.MathUtils.euclideanModulo((entry + headings.length) * spacing, length);
    if (turns.every((turn) => {
      const gap = Math.abs(turn.distance - distance);
      return Math.min(gap, length - gap) > 24;
    })) turns.push({ distance, direction, apexDistance, exitDistance });
  }
  return turns.sort((a, b) => a.distance - b.distance);
}

export function courseCornerAt(route: THREE.Curve<THREE.Vector3>, distance: number) {
  const length = route.getLength();
  const before = route.getTangentAt(THREE.MathUtils.euclideanModulo(distance - 6, length) / length);
  const after = route.getTangentAt(THREE.MathUtils.euclideanModulo(distance + 6, length) / length);
  const bend = Math.atan2(before.z * after.x - before.x * after.z, before.dot(after));
  return Math.abs(bend) > 12 / 75;
}

export function courseKerbSegments(route: THREE.Curve<THREE.Vector3>) {
  const length = route.getLength();
  const count = Math.ceil(length / 2);
  const spacing = length / count;
  const wrap = (index: number) => THREE.MathUtils.euclideanModulo(index, count);
  const curvature = Array.from({ length: count }, (_, index) => {
    const distance = (index + 0.5) * spacing;
    const before = route.getTangentAt(THREE.MathUtils.euclideanModulo(distance - 12, length) / length);
    const after = route.getTangentAt(THREE.MathUtils.euclideanModulo(distance + 12, length) / length);
    return Math.atan2(before.z * after.x - before.x * after.z, before.dot(after)) / 24;
  });
  const directions = curvature.map((value) => Math.abs(value) >= 1 / 180 ? Math.sign(value) : 0);
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
    for (let step = 0; step < count - 1 && directions[wrap(start - 1)] === direction; step++) start = wrap(start - 1);
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
    if (run.length * spacing < 16 || heading < THREE.MathUtils.degToRad(12) || peak < 1 / 140) continue;
    for (const current of run) accepted[current] = direction;
    for (const [edge, step] of [[run[0], -1], [run[run.length - 1], 1]]) {
      for (let extension = 1; extension * spacing <= 4; extension++) {
        const current = wrap(edge + extension * step);
        if (curvature[current] * direction < 1 / 1000 || directions[current]) break;
        accepted[current] = direction;
      }
    }
  }
  return accepted.map((direction, index) => ({
    distance: index * spacing, endDistance: (index + 1) * spacing, direction,
  })).filter(({ direction }) => direction !== 0);
}

export function courseStartDistance(definition: CourseDefinition, length: number) {
  return definition.reverse ? length - startDistance : startDistance;
}

export function readCourseReverse(parameters: URLSearchParams) {
  const value = parameters.get('reverse');
  if (value === null || value === '0' || value === 'false') return false;
  if (value === '' || value === '1' || value === 'true') return true;
  throw new Error(`Invalid reverse course option: ${value}`);
}

export function courseSpawn(definition: CourseDefinition) {
  const route = courseRoute(definition);
  // Spawn on the approach side of the same physical start line in either direction.
  const t = definition.reverse ? 1 - 2 * startDistance / route.getLength() : 0;
  const position = route.getPointAt(t);
  const tangent = route.getTangentAt(t);
  return { position: [position.x, position.z] as const, heading: Math.atan2(tangent.x, tangent.z) };
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
  [84.01622954751265, 0], [83.92487526054921, 26.12612762443657],
  [69.15384490029841, 48.13773738710717], [43.14160621121232, 56.89100040112654],
  [19.06506027584704, 56.21735976199199], [0, 59.729722283795326],
  [-23.623736833566536, 69.65958110175593], [-54.73388835855688, 72.17778701416533],
  [-81.52414272569827, 56.748656259050236], [-92.32171154378821, 28.74009417125997],
  [-87.49982195923651, 0], [-100, -30], [-145, -45], [-190, -40], [-245, -45],
  [-275, -80], [-275, -130], [-250, -175], [-200, -190],
  [-155, -175], [-115, -140], [-70, -115], [-25, -95],
  [27.363917446122286, -80.68829415215477], [53.8119932085613, -70.96208036913637],
  [70.2405650712074, -48.89419930583218], [78.21984842673713, -24.350131429050233],
];

export function createCourseRandom(seed: number) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('Course seed must be an unsigned 32-bit integer');
  }
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
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
      return [mirror * (px * Math.cos(angle) - pz * Math.sin(angle)),
        px * Math.sin(angle) + pz * Math.cos(angle)];
    });
    const definition: CourseDefinition = { id: 'random', name: `Random Circuit (${seed})`, width: 17.5, points };
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
      const bend = Math.atan2(incoming.z * outgoing.x - incoming.x * outgoing.z, incoming.dot(outgoing));
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
    if (!navigable || Math.min(leftDistance, rightDistance) < length * 0.1
      || maxHeight - minHeight < 10 || maxHeight - minHeight > 20) continue;
    radii.sort((a, b) => a - b);
    const medianRadius = radii[Math.floor(radii.length / 2)];
    if (medianRadius < 60 || medianRadius > 110) continue;
    if (courseHasClearance(route, definition.width)) return definition;
  }
  throw new Error(`Unable to generate a navigable course for seed ${seed}`);
}

// Generated by scripts/import-track.mjs from recorded-lap GPS data.
const importedCourses = Object.values(import.meta.glob<CourseDefinition>('./tracks/*.json', {
  eager: true, import: 'default',
})).sort((a, b) => a.name.localeCompare(b.name));

export const courses: readonly CourseDefinition[] = [
  {
    id: 'autocross',
    name: 'Autocross Playground',
    width: 15,
    coneSpacing: 5,
    points: [
      [0, 0], [0, 21], [-6, 40.5], [6, 60], [-6, 79.5],
      [0, 99], [24, 120], [54, 111], [63, 82.5], [42, 63],
      [34.5, 42], [51, 33], [69, 43.5], [81, 27],
      [66, -7.5], [33, -21], [7.5, -15],
    ],
  },
  {
    id: 'sweeper',
    name: 'Sweeper Circuit',
    width: 17.5,
    coneSpacing: 6,
    points: [
      [0, 0], [0, 30], [-8, 60], [0, 90], [30, 115],
      [65, 110], [90, 80], [85, 45], [60, 25],
      [65, -10], [40, -35], [10, -25],
    ],
  },
  {
    id: 'drift-test',
    name: 'Drift Test Loop',
    width: 14,
    coneSpacing: 7,
    elevationScale: 0.35,
    points: [
      [0, 0], [0, 22.5], [0, 45], [0, 67.5],
      [15, 101.25], [48.75, 120], [86.25, 112.5], [112.5, 86.25],
      [120, 52.5], [101.25, 22.5], [75, 0], [75, -30],
      [101.25, -56.25], [112.5, -86.25], [93.75, -116.25], [56.25, -131.25],
      [18.75, -116.25], [0, -90], [0, -45],
    ],
  },
  {
    id: 'hillside',
    name: 'Hillside Circuit',
    width: 17.5,
    points: hillsidePoints,
  },
  {
    id: 'skidpad',
    name: 'Flat Skidpad',
    width: 62.5,
    coneSpacing: 12,
    flat: true,
    padRadius: 250,
    points: Array.from({ length: 32 }, (_, i): [number, number] => {
      const angle = -i / 32 * Math.PI * 2;
      return [50 * Math.cos(angle), 50 * Math.sin(angle)];
    }),
  },
  ...importedCourses,
];
