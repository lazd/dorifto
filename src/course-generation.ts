import * as THREE from 'three';
import { courseHasClearance, courseRoute, createCourseRandom, type CourseDefinition } from './courses';
import { terrainBaseHeight } from './terrain-profile';

export const courseGenerationFields = [
  { key: 'elevation', label: 'Elevation change', description: 'Flat pavement to rolling climbs and descents.' },
  { key: 'straightaways', label: 'Straightaways', description: 'Longer uninterrupted acceleration zones.' },
  { key: 'tightCorners', label: 'Tight corners', description: 'More sharp bends, with radii around 28-44 m.' },
  { key: 'sweepingCorners', label: 'Sweeping corners', description: 'More broad, flowing bends around 80-115 m radius.' },
  { key: 'hairpins', label: 'Hairpins', description: 'More tight 180-degree switchbacks.' },
  { key: 'chicanes', label: 'Chicanes', description: 'More closely linked left-right transitions.' },
] as const;

export type CourseGenerationWeights = Readonly<Record<typeof courseGenerationFields[number]['key'], number>>;

export const defaultCourseWeights: CourseGenerationWeights = {
  elevation: 0.5, straightaways: 0.5, tightCorners: 0.35,
  sweepingCorners: 0.7, hairpins: 0.2, chicanes: 0.35,
};

export function validateCourseWeights(weights: CourseGenerationWeights) {
  for (const { key, label } of courseGenerationFields) {
    if (!Number.isFinite(weights[key]) || weights[key] < 0 || weights[key] > 1) {
      throw new Error(`${label} weight must be a number between 0 and 1`);
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
  for (const { key } of courseGenerationFields) {
    if (weights) parameters.set(key, String(weights[key]));
    else parameters.delete(key);
  }
}

interface Feature {
  radius: number;
  angle: number;
  repeats: number;
  span: number;
}

export function generateCustomCourse(seed: number, weights: CourseGenerationWeights): CourseDefinition {
  const random = createCourseRandom(seed);
  validateCourseWeights(weights);
  for (let attempt = 0; attempt < 64; attempt++) {
    const features: Feature[] = [];
    function addFeatures(weight: number, radius: number, angle: number, repeats = 1) {
      const count = Math.floor(weight * 2 + random());
      for (let i = 0; i < count; i++) {
        const r = radius + (random() - 0.5) * 4;
        const a = THREE.MathUtils.degToRad(angle);
        features.push({ radius: r, angle: a, repeats, span: 4 * r * Math.sin(a) * repeats });
      }
    }
    addFeatures(weights.tightCorners, 44 - 16 * weights.tightCorners, 50 + 15 * weights.tightCorners);
    addFeatures(weights.sweepingCorners, 80 + 30 * weights.sweepingCorners, 20 + 15 * weights.sweepingCorners);
    addFeatures(weights.hairpins, 34 - 7 * weights.hairpins, 90);
    addFeatures(weights.chicanes, 50 - 16 * weights.chicanes, 30 + 15 * weights.chicanes, 2);
    for (let i = features.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [features[i], features[j]] = [features[j], features[i]];
    }
    const sides: Feature[][] = [[], []];
    const spans = [0, 0];
    for (const feature of features) {
      const side = spans[0] <= spans[1] ? 0 : 1;
      sides[side].push(feature);
      spans[side] += feature.span;
    }
    const gap = (6 + 50 * weights.straightaways) * (0.9 + random() * 0.2);
    const span = Math.max(
      (180 + 200 * weights.straightaways) * (0.9 + random() * 0.2),
      ...spans.map((length, i) => length + gap * (sides[i].length + 1)),
    );
    const returnRadius = (70 + 25 * weights.sweepingCorners - 10 * weights.tightCorners)
      * (0.95 + random() * 0.1);
    const points: [number, number][] = [[-span / 2, returnRadius]];
    let x = -span / 2;
    let z = returnRadius;
    let heading = 0;
    function line(length: number) {
      const steps = Math.ceil(length / 8);
      const startX = x;
      const startZ = z;
      for (let i = 1; i <= steps; i++) {
        x = startX + Math.cos(heading) * length * i / steps;
        z = startZ + Math.sin(heading) * length * i / steps;
        points.push([x, z]);
      }
    }
    function arc(angle: number, radius: number) {
      const steps = Math.ceil(Math.abs(angle) * radius / 8);
      const curvature = Math.sign(angle) / radius;
      const startX = x;
      const startZ = z;
      for (let i = 1; i <= steps; i++) {
        const direction = heading + angle * i / steps;
        x = startX + (Math.sin(direction) - Math.sin(heading)) / curvature;
        z = startZ + (Math.cos(heading) - Math.cos(direction)) / curvature;
        points.push([x, z]);
      }
      heading += angle;
    }
    for (let side = 0; side < 2; side++) {
      const spacing = (span - spans[side]) / (sides[side].length + 1);
      line(spacing);
      for (const feature of sides[side]) {
        // Opposite arcs return to the leg's heading without crossing the infield.
        for (let i = 0; i < feature.repeats; i++) {
          arc(feature.angle, feature.radius);
          arc(-2 * feature.angle, feature.radius);
          arc(feature.angle, feature.radius);
        }
        line(spacing);
      }
      arc(-Math.PI, returnRadius);
    }
    points.pop();
    const rotation = random() * Math.PI * 2;
    const mirror = random() < 0.5 ? -1 : 1;
    const definition: CourseDefinition = {
      id: 'custom', name: `Custom Circuit (${seed})`, width: 17.5,
      points: points.map(([px, pz]) => [
        mirror * (px * Math.cos(rotation) - pz * Math.sin(rotation)),
        px * Math.sin(rotation) + pz * Math.cos(rotation),
      ]),
    };
    const route = courseRoute(definition);
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
    definition.flat = weights.elevation === 0;
    definition.elevationScale = weights.elevation * Math.min(20 / (maxHeight - minHeight), 0.12 / maxGrade);
    return definition;
  }
  throw new Error(`Unable to generate a navigable custom course for seed ${seed}; try another seed or feature mix`);
}
