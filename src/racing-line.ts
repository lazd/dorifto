import * as THREE from 'three';
import { courseRoute, courseStartDistance, type CourseDefinition } from './courses';

export type RacingLineMode = 'full' | 'lane';
const paths = new WeakMap<CourseDefinition, Map<string, ReturnType<typeof buildRacingLinePath>>>();

export function racingLinePath(
  definition: CourseDefinition,
  mode: RacingLineMode,
  reverse = definition.reverse ?? false,
  edgeClearance = 1,
) {
  if (!Number.isFinite(edgeClearance) || edgeClearance < 0)
    throw new Error('Invalid racing-line edge clearance');
  let cached = paths.get(definition);
  if (!cached) {
    cached = new Map();
    paths.set(definition, cached);
  }
  const key = `${mode}:${reverse}:${edgeClearance}`;
  let path = cached.get(key);
  if (!path) {
    path = buildRacingLinePath(definition, mode, reverse, edgeClearance);
    cached.set(key, path);
  }
  return path;
}

function buildRacingLinePath(
  definition: CourseDefinition,
  mode: RacingLineMode,
  reverse: boolean,
  edgeClearance: number,
) {
  const route = courseRoute({ ...definition, reverse: false });
  const length = route.getLength();
  const closed = definition.closed !== false;
  const count = Math.max(5, Math.ceil(length / 5));
  const divisions = closed ? count : count - 1;
  const laneCenter = mode === 'lane' ? ((reverse ? 1 : -1) * definition.width) / 4 : 0;
  const limit = Math.max(0, definition.width / (mode === 'lane' ? 4 : 2) - edgeClearance);
  const normals = Array.from({ length: count }, (_, i) => {
    const tangent = route.getTangentAt(i / divisions);
    return new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  });
  const centers = normals.map((normal, i) =>
    route.getPointAt(i / divisions).addScaledVector(normal, laneCenter),
  );
  const points = optimizeRacingLine(centers, limit, closed);
  const offsets = points.map(
    (point, i) =>
      THREE.MathUtils.clamp(point.clone().sub(centers[i]).dot(normals[i]), -limit, limit) +
      laneCenter,
  );
  const at = (i: number): number => {
    if (closed) return offsets[THREE.MathUtils.euclideanModulo(i, count)];
    if (i < 0) return 2 * offsets[0] - offsets[1];
    if (i >= count) return 2 * offsets[count - 1] - offsets[count - 2];
    return offsets[i];
  };
  // Cubic B-spline offsets keep direction and curvature continuous without bound overshoot.
  // Extrapolated endpoint controls preserve the fixed open-road endpoints.
  const offsetAt = (fraction: number) => {
    const sample = THREE.MathUtils.clamp(fraction, 0, 1) * divisions;
    const i = Math.min(Math.floor(sample), closed ? count - 1 : count - 2);
    const t = sample - i;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      ((1 - t) ** 3 * at(i - 1) +
        (3 * t3 - 6 * t2 + 4) * at(i) +
        (-3 * t3 + 3 * t2 + 3 * t + 1) * at(i + 1) +
        t3 * at(i + 2)) /
      6
    );
  };
  const normal = new THREE.Vector3();
  const before = new THREE.Vector3();
  const after = new THREE.Vector3();
  const pointAt = (fraction: number, target: THREE.Vector3) => {
    const at = closed
      ? THREE.MathUtils.euclideanModulo(fraction, 1)
      : THREE.MathUtils.clamp(fraction, 0, 1);
    route.getPointAt(at, target);
    route.getTangentAt(at, normal);
    normal.set(normal.z, 0, -normal.x).normalize();
    return target.addScaledVector(normal, offsetAt(at));
  };
  const tangentAt = (fraction: number, target: THREE.Vector3) => {
    const span = 0.5 / length;
    pointAt(fraction - span, before);
    pointAt(fraction + span, after);
    return target.subVectors(after, before).normalize();
  };
  return { length, offsetAt, pointAt, tangentAt };
}

/** Minimize squared second differences within lateral bounds; open routes retain their endpoints. */
export function optimizeRacingLine(
  centers: readonly THREE.Vector3[],
  maxOffset: number,
  closed = true,
) {
  const count = centers.length;
  if (count < 5 || !Number.isFinite(maxOffset) || maxOffset < 0)
    throw new Error('Invalid racing-line samples or lateral bound');
  const index = (i: number) =>
    closed ? (i + count) % count : THREE.MathUtils.clamp(i, 0, count - 1);
  const normals = centers.map((_, i) => {
    const tangent = centers[index(i + 1)].clone().sub(centers[index(i - 1)]);
    return new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  });
  const points = centers.map((center) => center.clone());
  if (maxOffset === 0) return points;
  const offsets = new Float64Array(count);
  const extrapolated = new Float64Array(count);
  const nextOffsets = new Float64Array(count);
  const checkedOffsets = new Float64Array(count);
  const gradient = new THREE.Vector3();
  // The second-difference operator has norm <= 4, so its squared objective has
  // gradient Lipschitz constant <= 16. FISTA uses the corresponding 1/16 step.
  function projectedStep(input: Float64Array, output: Float64Array) {
    for (let i = 0; i < count; i++) {
      points[i].copy(centers[i]).addScaledVector(normals[i], input[i]);
    }
    let maxChange = 0;
    for (let i = 0; i < count; i++) {
      if (!closed && (i === 0 || i === count - 1)) {
        output[i] = 0;
        continue;
      }
      if (closed)
        gradient
          .copy(points[i])
          .multiplyScalar(6)
          .addScaledVector(points[(i + count - 1) % count], -4)
          .addScaledVector(points[(i + 1) % count], -4)
          .add(points[(i + count - 2) % count])
          .add(points[(i + 2) % count]);
      else {
        gradient.set(0, 0, 0);
        for (let j = Math.max(1, i - 1); j <= Math.min(count - 2, i + 1); j++) {
          const coefficient = j === i ? -2 : 1;
          gradient
            .addScaledVector(points[j - 1], coefficient)
            .addScaledVector(points[j], -2 * coefficient)
            .addScaledVector(points[j + 1], coefficient);
        }
      }
      const next = THREE.MathUtils.clamp(
        input[i] - gradient.dot(normals[i]) / 16,
        -maxOffset,
        maxOffset,
      );
      maxChange = Math.max(maxChange, Math.abs(next - input[i]));
      output[i] = next;
    }
    return maxChange;
  }
  let momentum = 1;
  let converged = false;
  for (let iteration = 0; iteration < 50000; iteration++) {
    projectedStep(extrapolated, nextOffsets);
    const nextMomentum = (1 + Math.sqrt(1 + 4 * momentum * momentum)) / 2;
    const acceleration = (momentum - 1) / nextMomentum;
    for (let i = 0; i < count; i++) {
      extrapolated[i] = nextOffsets[i] + acceleration * (nextOffsets[i] - offsets[i]);
    }
    offsets.set(nextOffsets);
    momentum = nextMomentum;
    if (iteration % 25 === 0 && projectedStep(offsets, checkedOffsets) <= 0.00001) {
      converged = true;
      break;
    }
  }
  if (!converged) throw new Error('Racing-line optimization did not converge');
  for (let i = 0; i < count; i++) {
    points[i].copy(centers[i]).addScaledVector(normals[i], offsets[i]);
  }
  return points;
}

/** A bounded curvature approximation, not a vehicle-specific minimum-lap-time solution. */
export function createTrainingGates(definition: CourseDefinition, carWidth: number) {
  if (!Number.isFinite(carWidth) || carWidth <= 0) throw new Error('Invalid training car width');
  const halfWidth = carWidth;
  const route = courseRoute(definition);
  const length = route.getLength();
  const start = courseStartDistance(definition, length);
  const count = Math.max(64, Math.ceil(length / 5));
  const centers = Array.from({ length: count }, (_, i) =>
    route.getPointAt(
      definition.closed === false
        ? i / (count - 1)
        : ((start + (i * length) / count) % length) / length,
    ),
  );
  const limit = Math.max(0, definition.width / 2 - halfWidth);
  const points = definition.closed === false ? centers : optimizeRacingLine(centers, limit);
  // Keep two thirds of the former targets without reducing optimizer resolution.
  const gateCount = Math.round((Math.ceil(count / 3) * 2) / 3);
  const gates = Array.from({ length: gateCount }, (_, gate) => {
    const i = Math.floor((gate * count) / gateCount);
    return {
      distance:
        definition.closed === false
          ? (i * length) / (count - 1)
          : (start + (i * length) / count) % length,
      center: points[i],
      forward: points[definition.closed === false ? Math.min(i + 1, count - 1) : (i + 1) % count]
        .clone()
        .sub(points[definition.closed === false ? Math.max(i - 1, 0) : (i + count - 1) % count])
        .normalize(),
    };
  });
  return { gates, halfWidth };
}
