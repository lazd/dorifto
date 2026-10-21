import * as THREE from 'three';
import { courseHasClearance, courseRoute, createCourseRandom, type CourseDefinition } from './courses';
import { terrainBaseHeight } from './terrain-profile';

export const courseGenerationFields = [
  { key: 'length', label: 'Course length', min: 1000, max: 5000, step: 100, description: 'Target lap distance, from 1 to 5 km.' },
  { key: 'elevation', label: 'Elevation change', min: 0, max: 1, step: 0.01, description: 'Flat pavement to rolling climbs and descents.' },
  { key: 'straightaways', label: 'Straightaways', min: 0, max: 1, step: 0.01, description: 'Longer uninterrupted acceleration zones.' },
  { key: 'tightCorners', label: 'Tight corners', min: 0, max: 1, step: 0.01, description: 'More sharp bends and tight switchbacks, around 28-40 m radius.' },
  { key: 'sweepingCorners', label: 'Sweeping corners', min: 0, max: 1, step: 0.01, description: 'More broad, flowing bends around 95-135 m radius.' },
  { key: 'chicanes', label: 'Chicanes', min: 0, max: 1, step: 0.01, description: 'More closely linked left-right transitions.' },
] as const;

export type CourseGenerationWeights = Readonly<Record<typeof courseGenerationFields[number]['key'], number>>;

export const defaultCourseWeights: CourseGenerationWeights = {
  length: 2000, elevation: 0.5, straightaways: 0.5, tightCorners: 0.35,
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

interface Feature {
  radius: number;
  angle: number;
  span: number;
  sign: number;
}

export function generateCustomCourse(seed: number, weights: CourseGenerationWeights): CourseDefinition {
  const random = createCourseRandom(seed);
  validateCourseWeights(weights);
  for (let attempt = 0; attempt < 256; attempt++) {
    const features: Feature[] = [];
    function addFeatures(weight: number, frequency: number, radius: number, angle: number) {
      const count = Math.floor(weight * weights.length / frequency + random());
      for (let i = 0; i < count; i++) {
        const r = radius + (random() - 0.5) * 4;
        const a = THREE.MathUtils.degToRad(angle);
        features.push({ radius: r, angle: a, span: 4 * r * Math.sin(a), sign: random() < 0.5 ? -1 : 1 });
      }
    }
    addFeatures(weights.tightCorners, 2400, 36 - 7 * weights.tightCorners, 55 + 35 * weights.tightCorners);
    addFeatures(weights.chicanes, 900, 42 - 10 * weights.chicanes, 25 + 12 * weights.chicanes);

    const count = 7 + Math.floor(random() * 4) + Math.floor((weights.length - 1000) / 1600);
    const stretch = 0.8 + random() * 0.5;
    const notches = new Set<number>();
    const notchCount = 1 + Math.floor(random() * Math.min(3, Math.floor(count / 3)));
    for (let i = 0; i < notchCount; i++) {
      const available = Array.from({ length: count }, (_, index) => index).filter((index) =>
        ![index, (index + 1) % count, (index + count - 1) % count].some((neighbor) => notches.has(neighbor)));
      notches.add(available[Math.floor(random() * available.length)]);
    }
    const vertices = Array.from({ length: count }, (_, i) => {
      const angle = (i + (random() - 0.5) * 0.3) * Math.PI * 2 / count;
      const radius = (0.85 + random() * 0.35) * (notches.has(i) ? 0.22 + random() * 0.13 : 1);
      return new THREE.Vector2(Math.cos(angle) * radius * stretch, Math.sin(angle) * radius / stretch);
    });
    const corners = vertices.map((vertex, i) => {
      const incoming = vertex.clone().sub(vertices[(i + count - 1) % count]).normalize();
      const outgoing = vertices[(i + 1) % count].clone().sub(vertex).normalize();
      const angle = Math.atan2(incoming.cross(outgoing), incoming.dot(outgoing));
      const tight = random() < weights.tightCorners * 0.75;
      const sweeping = random() < weights.sweepingCorners * 0.65;
      const radius = tight ? 29 + random() * 10
        : (sweeping ? 95 + random() * 40 : 65 + random() * 20) * (1 - 0.2 * weights.straightaways);
      return { incoming, outgoing, angle, radius, minimum: tight ? 29 : Math.min(radius, 55),
        trim: radius * Math.tan(Math.abs(angle) / 2) };
    });
    const perimeter = vertices.reduce((total, vertex, i) => total + vertex.distanceTo(vertices[(i + 1) % count]), 0);
    const extra = features.reduce((total, feature) => total + 4 * feature.radius * feature.angle - feature.span, 0);
    // Fixed-radius fillets and features leave perimeter scale as the only unknown.
    const layoutScale = () => (weights.length - extra - corners.reduce((total, corner) =>
      total + Math.abs(corner.angle) * corner.radius - 2 * corner.trim, 0)) / perimeter;
    let scale = layoutScale();
    // Short layouts may need smaller connecting fillets to keep adjacent corners apart.
    for (let pass = 0; pass < 8; pass++) {
      for (let i = 0; i < count; i++) {
        const corner = corners[i];
        const available = Math.min(vertices[i].distanceTo(vertices[(i + count - 1) % count]),
          vertices[i].distanceTo(vertices[(i + 1) % count])) * scale * 0.45;
        corner.radius = Math.max(corner.minimum, Math.min(corner.radius, available / Math.tan(Math.abs(corner.angle) / 2)));
        corner.trim = corner.radius * Math.tan(Math.abs(corner.angle) / 2);
      }
      scale = layoutScale();
    }
    vertices.forEach((vertex) => vertex.multiplyScalar(scale));
    const edges = vertices.map((vertex, i) => ({
      length: vertex.distanceTo(vertices[(i + 1) % count]) - corners[i].trim - corners[(i + 1) % count].trim,
      features: [] as Feature[],
    }));
    if (edges.some((edge) => edge.length < 8) || corners.some((corner) => Math.abs(corner.angle) > 2.7)) continue;
    let fits = true;
    for (const feature of features.sort((a, b) => b.span - a.span)) {
      const available = edges.filter((edge) =>
        edge.length - edge.features.reduce((total, item) => total + item.span + 12, 0) > feature.span + 24);
      if (available.length === 0) {
        fits = false;
        break;
      }
      available[Math.floor(random() * available.length)].features.push(feature);
    }
    if (!fits) continue;

    const start = vertices[0].clone().sub(corners[0].incoming.clone().multiplyScalar(corners[0].trim));
    const points: [number, number][] = [[start.x, start.y]];
    let x = start.x;
    let z = start.y;
    let heading = Math.atan2(corners[0].incoming.y, corners[0].incoming.x);
    let startIndex = 0;
    let longestStraight = 0;
    function line(length: number) {
      const steps = Math.ceil(length / 8);
      if (length > longestStraight) {
        longestStraight = length;
        startIndex = points.length - 1 + Math.floor(steps / 2);
      }
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
    for (let i = 0; i < count; i++) {
      arc(corners[i].angle, corners[i].radius);
      const edge = edges[i];
      const spacing = (edge.length - edge.features.reduce((total, feature) => total + feature.span, 0))
        / (edge.features.length + 1);
      line(spacing);
      for (const feature of edge.features) {
        arc(feature.sign * feature.angle, feature.radius);
        arc(-2 * feature.sign * feature.angle, feature.radius);
        arc(feature.sign * feature.angle, feature.radius);
        line(spacing);
      }
    }
    points.pop();
    const rotation = random() * Math.PI * 2;
    const mirror = random() < 0.5 ? -1 : 1;
    const definition: CourseDefinition = {
      id: 'custom', name: `Custom Circuit (${seed})`, width: 17.5,
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
    definition.flat = weights.elevation === 0;
    definition.elevationScale = weights.elevation * Math.min(20 / (maxHeight - minHeight), 0.12 / maxGrade);
    return definition;
  }
  throw new Error(`Unable to generate a navigable custom course for seed ${seed}; try another seed or feature mix`);
}
