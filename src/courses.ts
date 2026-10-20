import * as THREE from 'three';

export interface CourseDefinition {
  id: string;
  name: string;
  width: number;
  coneSpacing?: number;
  /** Ground-plane coordinates [x, z], ordered in the driving direction. */
  points: readonly (readonly [number, number])[];
}

class CourseCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly markers: CourseDefinition['points']) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const scaled = THREE.MathUtils.euclideanModulo(t, 1) * this.markers.length;
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
  const route = new CourseCurve(definition.points);
  route.arcLengthDivisions = Math.max(1000, definition.points.length * 100);
  return route;
}

export function courseTurns(route: THREE.Curve<THREE.Vector3>) {
  const length = route.getLength();
  const count = Math.ceil(length / 2);
  const spacing = length / count;
  const bends = Array.from({ length: count }, (_, i) => {
    const before = route.getTangentAt(THREE.MathUtils.euclideanModulo((i * spacing - 6) / length, 1));
    const after = route.getTangentAt(((i * spacing + 6) / length) % 1);
    return Math.atan2(before.z * after.x - before.x * after.z, before.dot(after));
  });
  const candidates = bends.map((bend, i) => ({ bend, i }))
    .filter(({ bend, i }) => Math.abs(bend) > 12 / 35
      && Math.abs(bend) >= Math.abs(bends[(i + count - 1) % count])
      && Math.abs(bend) > Math.abs(bends[(i + 1) % count]))
    .sort((a, b) => Math.abs(b.bend) - Math.abs(a.bend));
  const turns: { distance: number; direction: number }[] = [];
  for (const { bend, i } of candidates) {
    let approach = i;
    while (i - approach < count / 2) {
      const previous = bends[(approach - 1 + count) % count];
      if (Math.sign(previous) !== Math.sign(bend) || Math.abs(previous) < 12 / 45) break;
      approach--;
    }
    const distance = THREE.MathUtils.euclideanModulo(approach * spacing - 12, length);
    if (turns.every((turn) => {
      const gap = Math.abs(turn.distance - distance);
      return Math.min(gap, length - gap) > 24;
    })) turns.push({ distance, direction: Math.sign(bend) });
  }
  return turns.sort((a, b) => a.distance - b.distance);
}

export function courseSpawn(definition: CourseDefinition) {
  const route = courseRoute(definition);
  const position = route.getPointAt(0);
  const tangent = route.getTangentAt(0);
  return { position: [position.x, position.z] as const, heading: Math.atan2(tangent.x, tangent.z) };
}

export function generateCourse(seed: number): CourseDefinition {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('Course seed must be an unsigned 32-bit integer');
  }
  let state = seed;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  for (let attempt = 0; attempt < 80; attempt++) {
    const radius = 75 + random() * 20;
    const stretch = 0.85 + random() * 0.4;
    const phases = [random(), random(), random()].map((value) => value * Math.PI * 2);
    const points: [number, number][] = [];
    for (let i = 0; i < 20; i++) {
      const angle = i / 20 * Math.PI * 2;
      const r = radius * (1 + 0.16 * Math.sin(angle * 2 + phases[0])
        + 0.1 * Math.sin(angle * 3 + phases[1]) + 0.05 * Math.sin(angle * 4 + phases[2]));
      points.push([Math.cos(angle) * r * stretch, Math.sin(angle) * r]);
    }
    const definition: CourseDefinition = { id: 'random', name: `Random Circuit (${seed})`, width: 14, points };
    const route = courseRoute(definition);
    const samples = route.getSpacedPoints(2048).slice(0, -1);
    let navigable = true;
    for (let i = 0; i < samples.length && navigable; i++) {
      const before = samples[(i + samples.length - 1) % samples.length];
      const current = samples[i];
      const after = samples[(i + 1) % samples.length];
      const incoming = current.clone().sub(before);
      const outgoing = after.clone().sub(current);
      const bend = incoming.angleTo(outgoing);
      // Leave a small margin above the 22 m limit for discrete curve sampling.
      if (bend > 0 && (incoming.length() + outgoing.length()) / (2 * bend) < 22.1) navigable = false;
    }
    const clearanceSamples = samples.filter((_, i) => i % 8 === 0);
    const spacing = route.getLength() / clearanceSamples.length;
    for (let i = 0; i < clearanceSamples.length && navigable; i++) {
      for (let j = i + 1; j < clearanceSamples.length && navigable; j++) {
        const separation = Math.min(j - i, clearanceSamples.length - (j - i)) * spacing;
        if (separation > definition.width * 2 && clearanceSamples[i].distanceTo(clearanceSamples[j]) < definition.width + 8) {
          navigable = false;
        }
      }
    }
    if (navigable) return definition;
  }
  throw new Error(`Unable to generate a navigable course for seed ${seed}`);
}

export const courses: readonly CourseDefinition[] = [
  {
    id: 'autocross',
    name: 'Autocross Playground',
    width: 12,
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
    width: 14,
    coneSpacing: 6,
    points: [
      [0, 0], [0, 30], [-8, 60], [0, 90], [30, 115],
      [65, 110], [90, 80], [85, 45], [60, 25],
      [65, -10], [40, -35], [10, -25],
    ],
  },
];
