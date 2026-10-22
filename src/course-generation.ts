import * as THREE from 'three';
import { courseHasClearance, courseRoute, createCourseRandom, type CourseDefinition } from './courses';
import { terrainBaseHeight } from './terrain-profile';

export const courseGenerationFields = [
  { key: 'length', label: 'Course length', min: 1000, max: 5000, step: 100, description: 'Target lap distance, from 1 to 5 km.' },
  { key: 'elevation', label: 'Elevation change', min: 0, max: 1, step: 0.01, description: 'Flat centerline to rolling climbs and descents, independent of banking.' },
  { key: 'banking', label: 'Turn banking', min: 0, max: 1, step: 0.01, description: 'Unbanked turns to steep banking up to 33°, independent of elevation.' },
  { key: 'straightaways', label: 'Straightaways', min: 0, max: 1, step: 0.01, description: 'Longer straights and fewer corner complexes.' },
  { key: 'tightCorners', label: 'Tight corners', min: 0, max: 1, step: 0.01, description: 'More 90° corners and hairpins, around 25-40 m radius.' },
  { key: 'sweepingCorners', label: 'Sweeping corners', min: 0, max: 1, step: 0.01, description: 'More broad, flowing bends around 95-140 m radius.' },
  { key: 'chicanes', label: 'Chicanes', min: 0, max: 1, step: 0.01, description: 'More left-right chicanes and esses.' },
] as const;

export type CourseGenerationWeights = Readonly<Record<typeof courseGenerationFields[number]['key'], number>>;

export const defaultCourseWeights: CourseGenerationWeights = {
  length: 2000, elevation: 0.5, banking: 0.1, straightaways: 0.5, tightCorners: 0.35,
  sweepingCorners: 0.7, chicanes: 0.35,
};

export function validateCourseWeights(weights: CourseGenerationWeights) {
  for (const { key, label, min, max } of courseGenerationFields) {
    if (!Number.isFinite(weights[key]) || weights[key] < min || weights[key] > max) {
      throw new Error(`${label} must be a number between ${min} and ${max}${key === 'length' ? ' metres' : ''}`);
    }
  }
}

export function readCourseWeights(parameters: URLSearchParams): CourseGenerationWeights {
  const weights = { ...defaultCourseWeights };
  for (const { key } of courseGenerationFields) {
    const value = parameters.get(key);
    if (value !== null) {
      if (value.trim() === '') throw new Error(`Invalid course weight: ${key}`);
      weights[key] = Number(value);
    }
  }
  validateCourseWeights(weights);
  return weights;
}

export function writeCourseWeights(parameters: URLSearchParams, weights?: CourseGenerationWeights) {
  if (weights) validateCourseWeights(weights);
  parameters.delete('hairpins');
  for (const { key } of courseGenerationFields) {
    if (weights) parameters.set(key, String(weights[key]));
    else parameters.delete(key);
  }
}

type ComplexKind = 'hairpin' | 'tight' | 'medium' | 'sweeper' | 'kink' | 'double' | 'esses' | 'chicane';

interface Bend {
  /** Signed relative to the complex's direction; esses and chicanes alternate. */
  angle: number;
  radius: number;
  /** Fixed straight after this bend inside the complex. */
  link: number;
}

interface Complex {
  kind: ComplexKind;
  bends: Bend[];
  /** Whether scaling the bends adjusts the lap's net rotation (single-direction, non-hairpin complexes). */
  scalable: boolean;
}

const degrees = THREE.MathUtils.degToRad;
const maximumBend = degrees(195);
const headingSlack = degrees(120);
const minimumCounterTurn = degrees(70);

/** `scale` shrinks sweepers and kinks on short layouts so they leave room for straights. */
function createComplex(kind: ComplexKind, random: () => number, scale: number): Complex {
  const range = (min: number, max: number) => min + random() * (max - min);
  const open = (min: number, max: number) => range(min, max) * scale;
  const bend = (angle: number, radius: number, link = 0) => ({ angle: degrees(angle), radius, link });
  switch (kind) {
    case 'hairpin': return { kind, scalable: false, bends: [bend(range(155, 185), range(25, 34))] };
    case 'tight': return { kind, scalable: true, bends: [bend(range(70, 115), range(27, 40))] };
    case 'medium': return { kind, scalable: true, bends: [bend(range(45, 120), range(45, 75))] };
    case 'sweeper': return { kind, scalable: true, bends: [bend(range(40, 110), open(98, 140))] };
    case 'kink': return { kind, scalable: true, bends: [bend(range(15, 35), open(130, 200))] };
    case 'double': {
      const radius = range(45, 70);
      return { kind, scalable: true, bends: [bend(range(40, 80), radius, range(20, 60)), bend(range(40, 80), radius)] };
    }
    case 'esses': {
      const count = random() < 0.5 ? 2 : 3;
      return { kind, scalable: false, bends: Array.from({ length: count }, (_, i) =>
        bend((i % 2 ? -1 : 1) * range(45, 80), range(45, 75), i < count - 1 ? range(10, 30) : 0)) };
    }
    case 'chicane': {
      const angle = range(30, 50);
      return { kind, scalable: false, bends: [bend(angle, range(26, 34), range(4, 12)), bend(-angle * range(0.85, 1.15), range(26, 34))] };
    }
  }
}

/** Weighted least-change straight lengths that close the loop at the target distance. */
function solveStraights(headings: number[], desired: number[], minimum: number[], gap: THREE.Vector2, total: number) {
  const n = headings.length;
  const lengths = desired.slice();
  const fixed = new Array<boolean>(n).fill(false);
  for (let pass = 0; pass <= n; pass++) {
    // Constraints: sum(L_i * cos h_i) = gap.x, sum(L_i * sin h_i) = gap.y, sum(L_i) = total.
    const residual = [gap.x, gap.y, total];
    const rows = headings.map((heading) => [Math.cos(heading), Math.sin(heading), 1]);
    for (let i = 0; i < n; i++) {
      const value = fixed[i] ? lengths[i] : desired[i];
      for (let r = 0; r < 3; r++) residual[r] -= rows[i][r] * value;
    }
    const matrix = new THREE.Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const m = matrix.elements;
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[c * 3 + r] += desired[i] * rows[i][r] * rows[i][c];
    }
    if (Math.abs(matrix.determinant()) < 1e-6) return null;
    const multipliers = new THREE.Vector3(...residual).applyMatrix3(matrix.invert()).toArray();
    let clamped = false;
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      lengths[i] = desired[i] + desired[i] * (rows[i][0] * multipliers[0] + rows[i][1] * multipliers[1] + rows[i][2] * multipliers[2]);
      if (lengths[i] < minimum[i]) {
        lengths[i] = minimum[i];
        fixed[i] = clamped = true;
      }
    }
    if (!clamped) return lengths;
  }
  return null;
}

function roughClearance(points: readonly (readonly [number, number])[], distances: number[], width: number) {
  const cell = 32;
  const limit = (width + 10) ** 2;
  const grid = new Map<string, number[]>();
  points.forEach(([x, z], i) => {
    const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
  });
  const length = distances[distances.length - 1];
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
        if (j <= i) continue;
        const separation = distances[j] - distances[i];
        if (Math.min(separation, length - separation) <= width * 2.5) continue;
        if ((points[j][0] - x) ** 2 + (points[j][1] - z) ** 2 < limit) return false;
      }
    }
  }
  return true;
}

export function generateCustomCourse(seed: number, weights: CourseGenerationWeights): CourseDefinition {
  const random = createCourseRandom(seed);
  validateCourseWeights(weights);
  const range = (min: number, max: number) => min + random() * (max - min);
  const width = 17.5;
  const kinds: [ComplexKind, number][] = [
    ['hairpin', 0.9 * weights.tightCorners],
    ['tight', 1.4 * weights.tightCorners],
    ['medium', 0.6],
    ['double', 0.25],
    ['sweeper', 1.6 * weights.sweepingCorners],
    ['kink', 0.15 + 0.4 * weights.sweepingCorners + 0.3 * weights.straightaways],
    ['esses', 1.1 * weights.chicanes],
    ['chicane', 1 * weights.chicanes],
  ];
  const cornerKinds = kinds.filter(([kind]) => !['kink', 'esses', 'chicane'].includes(kind));
  const pickKind = (options: [ComplexKind, number][]) => {
    let value = random() * options.reduce((total, [, weight]) => total + weight, 0);
    for (const [kind, weight] of options) if ((value -= weight) < 0) return kind;
    return options[options.length - 1][0];
  };

  const radiusScale = THREE.MathUtils.clamp(weights.length / 2500, 0.65, 1);
  for (let attempt = 0; attempt < 600; attempt++) {
    // Real circuits run roughly one corner complex every 220-450 m.
    const spacing = range(230, 300) + 150 * weights.straightaways - 50 * weights.tightCorners - 40 * weights.chicanes;
    const count = Math.max(6, Math.round(weights.length / Math.max(spacing, 220)));
    // Every layout gets at least four real corners; the rest follow the full feature mix.
    const complexes = Array.from({ length: count }, (_, i) =>
      createComplex(pickKind(i < 4 ? cornerKinds : kinds), random, radiusScale));
    const isCorner = (complex: Complex) => !['kink', 'esses', 'chicane'].includes(complex.kind);

    // Assign directions so the lap turns exactly once; some corners turn against the lap.
    const net = (complex: Complex) => complex.bends.reduce((total, bend) => total + bend.angle, 0);
    const totalTurn = complexes.reduce((total, complex) => total + Math.abs(net(complex)), 0);
    const counterChance = THREE.MathUtils.clamp((1 - Math.PI * 2 / totalTurn) / 2, 0.2, 0.48);
    let signs: number[] = [];
    let factor = NaN;
    for (let draw = 0; draw < 24 && !(factor > 0.75 && factor < 1.35); draw++) {
      signs = complexes.map(() => (random() < counterChance ? -1 : 1));
      // Substantial corners against the lap direction fold the outline instead of leaving a convex blob.
      const counterTurn = complexes.reduce((total, complex, i) =>
        total + (signs[i] < 0 && isCorner(complex) ? net(complex) : 0), 0);
      if (counterTurn < minimumCounterTurn) continue;
      let fixedTurn = 0;
      let positive = 0;
      let negative = 0;
      complexes.forEach((complex, i) => {
        if (!complex.scalable) fixedTurn += signs[i] * net(complex);
        else if (signs[i] > 0) positive += net(complex);
        else negative += net(complex);
      });
      factor = (Math.PI * 2 - fixedTurn + negative) / positive;
    }
    if (!(factor > 0.75 && factor < 1.35)) continue;
    complexes.forEach((complex, i) => {
      complex.bends.forEach((bend) => {
        if (complex.scalable && signs[i] > 0) bend.angle *= factor;
        bend.angle *= signs[i];
      });
    });
    if (complexes.some((complex) => complex.bends.some((bend) => Math.abs(bend.angle) > maximumBend))) continue;
    // Shuffle until the running heading stays within one lap plus a fold; wider swings spiral into overlaps.
    const windowed = () => {
      let turned = 0;
      for (const complex of complexes) {
        for (const bend of complex.bends) {
          turned += bend.angle;
          if (turned < -headingSlack || turned > Math.PI * 2 + headingSlack) return false;
        }
      }
      return true;
    };
    let ordered = false;
    for (let shuffle = 0; shuffle < 40 && !ordered; shuffle++) {
      for (let i = complexes.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [complexes[i], complexes[j]] = [complexes[j], complexes[i]];
      }
      ordered = windowed();
    }
    if (!ordered) continue;

    // Walk the complexes with zero-length straights to find each straight's heading and the closing gap.
    const headings: number[] = [];
    const position = new THREE.Vector2();
    let heading = 0;
    let fixedLength = 0;
    for (const complex of complexes) {
      headings.push(heading);
      for (const bend of complex.bends) {
        const curvature = Math.sign(bend.angle) / bend.radius;
        position.x += (Math.sin(heading + bend.angle) - Math.sin(heading)) / curvature;
        position.y += (Math.cos(heading) - Math.cos(heading + bend.angle)) / curvature;
        heading += bend.angle;
        position.x += Math.cos(heading) * bend.link;
        position.y += Math.sin(heading) * bend.link;
        fixedLength += Math.abs(bend.angle) * bend.radius + bend.link;
      }
    }
    const desired = complexes.map((_, i) => i === 0
      ? weights.length * range(0.1, 0.16) * (0.7 + 0.6 * weights.straightaways)
      : range(15, 30 + 200 * weights.straightaways) * (random() < 0.3 ? 2 : 1));
    const minimum = complexes.map((_, i) => (i === 0 ? Math.min(desired[0], 90) : 15));
    const straightTotal = weights.length - fixedLength;
    if (straightTotal < minimum.reduce((total, value) => total + value, 0)) continue;
    const desiredTotal = desired.reduce((total, value) => total + value, 0);
    for (let i = 0; i < desired.length; i++) desired[i] *= straightTotal / desiredTotal;
    const lengths = solveStraights(headings, desired, minimum, position.clone().negate(), straightTotal);
    // Reject solutions that distort the planned rhythm into very long or very lopsided straights.
    if (!lengths || lengths.some((length, i) => length > desired[i] * 2.5 + 80)) continue;

    const points: [number, number][] = [[0, 0]];
    const distances = [0];
    let x = 0;
    let z = 0;
    heading = 0;
    let startIndex = 0;
    function line(length: number, start = false) {
      const steps = Math.max(1, Math.ceil(length / 8));
      const startX = x;
      const startZ = z;
      if (start) startIndex = points.length - 1 + Math.floor(steps * range(0.35, 0.6));
      for (let i = 1; i <= steps; i++) {
        x = startX + Math.cos(heading) * length * i / steps;
        z = startZ + Math.sin(heading) * length * i / steps;
        points.push([x, z]);
        distances.push(distances[distances.length - 1] + length / steps);
      }
    }
    function arc(angle: number, radius: number) {
      const steps = Math.ceil(Math.abs(angle) * radius / 8);
      const curvature = Math.sign(angle) / radius;
      const startX = x;
      const startZ = z;
      const startHeading = heading;
      for (let i = 1; i <= steps; i++) {
        const direction = startHeading + angle * i / steps;
        x = startX + (Math.sin(direction) - Math.sin(startHeading)) / curvature;
        z = startZ + (Math.cos(startHeading) - Math.cos(direction)) / curvature;
        points.push([x, z]);
        distances.push(distances[distances.length - 1] + Math.abs(angle) * radius / steps);
      }
      heading += angle;
    }
    complexes.forEach((complex, i) => {
      line(lengths[i], i === 0);
      for (const bend of complex.bends) {
        arc(bend.angle, bend.radius);
        if (bend.link > 0) line(bend.link);
      }
    });
    points.pop();
    distances.pop();
    distances.push(weights.length);
    if (!roughClearance(points, distances, width)) continue;

    const rotation = random() * Math.PI * 2;
    const mirror = random() < 0.5 ? -1 : 1;
    const definition: CourseDefinition = {
      id: 'custom', name: `Custom Circuit (${seed})`, width,
      generation: { type: 'custom', seed, weights: { ...weights } },
      points: [...points.slice(startIndex), ...points.slice(0, startIndex)].map(([px, pz]) => [
        mirror * (px * Math.cos(rotation) - pz * Math.sin(rotation)),
        px * Math.sin(rotation) + pz * Math.cos(rotation),
      ]),
    };
    const route = courseRoute(definition);
    if (Math.abs(route.getLength() / weights.length - 1) > 0.05) continue;
    const samples = route.getSpacedPoints(Math.ceil(route.getLength() / 0.5)).slice(0, -1);
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    let maxGrade = 0;
    let navigable = true;
    for (let i = 0; i < samples.length; i++) {
      const current = samples[i];
      const after = samples[(i + 1) % samples.length];
      const incoming = current.clone().sub(samples[(i + samples.length - 1) % samples.length]);
      const outgoing = after.clone().sub(current);
      const bend = incoming.angleTo(outgoing);
      if (bend > 0 && (incoming.length() + outgoing.length()) / (2 * bend) < 22.2) {
        navigable = false;
        break;
      }
      const height = terrainBaseHeight(current.x, current.z);
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
      maxGrade = Math.max(maxGrade, Math.abs(terrainBaseHeight(after.x, after.z) - height) / outgoing.length());
    }
    if (!navigable || !courseHasClearance(route, definition.width)) continue;
    definition.flat = weights.elevation === 0 && weights.banking === 0;
    definition.bankingScale = weights.banking * 10;
    definition.elevationScale = weights.elevation * Math.min(20 / (maxHeight - minHeight), 0.12 / maxGrade);
    return definition;
  }
  throw new Error(`Unable to generate a navigable custom course for seed ${seed}; try another seed, length, or feature mix`);
}
