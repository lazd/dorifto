import * as THREE from 'three';
import { courseRoute, courseStartDistance, type CourseDefinition } from './courses';

/** Minimize squared second differences on an evenly sampled closed route, within lateral bounds. */
export function optimizeRacingLine(centers: readonly THREE.Vector3[], maxOffset: number) {
  const count = centers.length;
  if (count < 5 || !Number.isFinite(maxOffset) || maxOffset < 0)
    throw new Error('Invalid racing-line samples or lateral bound');
  const normals = centers.map((_, i) => {
    const tangent = centers[(i + 1) % count].clone().sub(centers[(i + count - 1) % count]);
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
      gradient
        .copy(points[i])
        .multiplyScalar(6)
        .addScaledVector(points[(i + count - 1) % count], -4)
        .addScaledVector(points[(i + 1) % count], -4)
        .add(points[(i + count - 2) % count])
        .add(points[(i + 2) % count]);
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
  const halfWidth = (carWidth * 3) / 2;
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
