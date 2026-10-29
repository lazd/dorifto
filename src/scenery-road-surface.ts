import { MathUtils } from 'three';
import { cleanRoadElevation, roadElevationSmoothing } from './road-elevation.mjs';
import {
  anchorCorrections,
  sceneryJunctions,
  sceneryPointKey,
  smoothAlong,
  smoothSceneryRoads,
  type CourseScenery,
} from './scenery-data';

type Sample = { x: number; z: number; height: number; distance: number };
type EndPlane = { x: number; z: number; dx: number; dz: number; distance: number };
type Segment = { a: Sample; b: Sample; width: number; endPlanes: EndPlane[] };
type Anchor = Sample & {
  slopeX: number;
  slopeZ: number;
  through: boolean;
  width: number;
  roadIndex: number;
};
type Junction = Anchor & { inner: number; roads: ReadonlySet<number> };
const junctionReach = 30;
export const sceneryRoadBlendReach = 20;

/** A common unbanked surface for ground roads, including their shared junction heights. */
export class SceneryRoadSurface {
  private readonly cells = new Map<string, Map<number, Segment[]>>();
  private readonly junctionCells = new Map<string, Junction[]>();

  constructor(roads: CourseScenery['roads'], height: (x: number, z: number) => number) {
    const junctions = sceneryJunctions(roads);
    const roundedRoads = smoothSceneryRoads(roads);
    const bridgeEnds = new Set(
      roads
        .filter((road) => road.structure === 'bridge')
        .flatMap((road) => [road.points[0], road.points.at(-1)!].map(sceneryPointKey)),
    );
    const anchors = new Map<string, Anchor[]>();
    const lines = roads
      .filter((road) => !road.structure)
      .map((road, roadIndex) => {
        const points = roundedRoads.get(road)!;
        const samples: Sample[] = [{ x: points[0][0], z: points[0][1], height: 0, distance: 0 }];
        for (let i = 1; i < points.length; i++) {
          const [ax, az] = points[i - 1],
            [bx, bz] = points[i];
          const length = Math.hypot(bx - ax, bz - az);
          const steps = Math.max(1, Math.ceil(length / 2 - 1e-6));
          const start = samples.at(-1)!.distance;
          for (let j = 1; j <= steps; j++)
            samples.push({
              x: ax + ((bx - ax) * j) / steps,
              z: az + ((bz - az) * j) / steps,
              distance: start + (length * j) / steps,
              height: 0,
            });
        }
        const distances = samples.map((p) => p.distance);
        const length = distances.at(-1)!;
        const spacing = length / Math.max(1, samples.length - 1);
        const raw = cleanRoadElevation(
          samples.map((p) => height(p.x, p.z)),
          spacing || 1,
        );
        // Same Gaussian as course profiles.
        const smoothed = smoothAlong(raw, distances, roadElevationSmoothing);
        for (let i = 0; i < samples.length; i++) {
          samples[i].height = smoothed[i];
          const key = sceneryPointKey([samples[i].x, samples[i].z]);
          if (junctions.has(key)) {
            const shared = anchors.get(key) ?? [];
            const before = Math.max(0, i - 1),
              after = Math.min(samples.length - 1, i + 1);
            const dx = samples[after].x - samples[before].x;
            const dz = samples[after].z - samples[before].z;
            const length = Math.hypot(dx, dz);
            const grade =
              (smoothed[after] - smoothed[before]) / (distances[after] - distances[before]);
            shared.push({
              ...samples[i],
              slopeX: (grade * dx) / length,
              slopeZ: (grade * dz) / length,
              through: i > 0 && i < samples.length - 1,
              width: road.width,
              roadIndex,
            });
            anchors.set(key, shared);
          }
        }
        const endPlanes = [0, samples.length - 1].flatMap((end) => {
          const point = samples[end];
          if (!bridgeEnds.has(sceneryPointKey([point.x, point.z]))) return [];
          const neighbor = samples[end ? end - 1 : 1];
          const length = Math.hypot(point.x - neighbor.x, point.z - neighbor.z);
          if (!length) return [];
          return [
            {
              x: point.x,
              z: point.z,
              distance: point.distance,
              dx: (point.x - neighbor.x) / length,
              dz: (point.z - neighbor.z) / length,
            },
          ];
        });
        return { samples, width: road.width, endPlanes };
      });
    const targets = new Map(
      [...anchors].map(([key, samples]) => [
        key,
        samples.reduce((sum, p) => sum + p.height, 0) / samples.length,
      ]),
    );
    for (const [line, { samples, width }] of lines.entries()) {
      const deltas = anchorCorrections(
        samples.map((p) => p.distance),
        samples.flatMap((p) => {
          const target = targets.get(sceneryPointKey([p.x, p.z]));
          return target === undefined ? [] : [{ distance: p.distance, delta: target - p.height }];
        }),
        25,
      );
      samples.forEach((sample, i) => (sample.height += deltas[i]));
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1],
          b = samples[i];
        const segment = {
          a,
          b,
          width,
          endPlanes: lines[line].endPlanes.filter(
            (plane) =>
              Math.min(
                Math.abs(a.distance - plane.distance),
                Math.abs(b.distance - plane.distance),
              ) <
              width / 2,
          ),
        };
        const radius = width / 2 + sceneryRoadBlendReach;
        for (
          let x = Math.floor((Math.min(a.x, b.x) - radius) / 32);
          x <= Math.floor((Math.max(a.x, b.x) + radius) / 32);
          x++
        )
          for (
            let z = Math.floor((Math.min(a.z, b.z) - radius) / 32);
            z <= Math.floor((Math.max(a.z, b.z) + radius) / 32);
            z++
          ) {
            const key = `${x},${z}`;
            const roads = this.cells.get(key) ?? new Map<number, Segment[]>();
            const bucket = roads.get(line) ?? [];
            bucket.push(segment);
            roads.set(line, bucket);
            this.cells.set(key, roads);
          }
      }
    }
    for (const samples of anchors.values()) {
      const main = [...samples].sort(
        (a, b) => Number(b.through) - Number(a.through) || b.width - a.width,
      )[0];
      const junction: Junction = {
        ...main,
        height: targets.get(sceneryPointKey([main.x, main.z]))!,
        inner: Math.min(15, Math.max(...samples.map((p) => p.width)) / 2 + 7),
        roads: new Set(samples.map((p) => p.roadIndex)),
      };
      const { x, z } = junction;
      for (
        let cx = Math.floor((x - junctionReach) / 32);
        cx <= Math.floor((x + junctionReach) / 32);
        cx++
      )
        for (
          let cz = Math.floor((z - junctionReach) / 32);
          cz <= Math.floor((z + junctionReach) / 32);
          cz++
        ) {
          const key = `${cx},${cz}`;
          const bucket = this.junctionCells.get(key) ?? [];
          bucket.push(junction);
          this.junctionCells.set(key, bucket);
        }
    }
  }

  bankingWeight(x: number, z: number) {
    let distance = junctionReach;
    for (const p of this.junctionCells.get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`) ?? [])
      distance = Math.min(distance, Math.hypot(x - p.x, z - p.z));
    return MathUtils.smoothstep(distance, 8, junctionReach);
  }

  pavementDistance(x: number, z: number) {
    let nearest = Infinity;
    for (const segments of this.cells
      .get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`)
      ?.values() ?? [])
      for (const { a, b, width, endPlanes } of segments) {
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const length = dx * dx + dz * dz;
        if (!length) continue;
        const t = MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / length, 0, 1);
        let distance = Math.hypot(x - a.x - t * dx, z - a.z - t * dz) - width / 2;
        // A ground road stops at its abutment, not a round cap extending underneath the bridge.
        for (const plane of endPlanes)
          distance = Math.max(distance, (x - plane.x) * plane.dx + (z - plane.z) * plane.dz);
        nearest = Math.min(nearest, distance);
      }
    return nearest;
  }

  heightAt(x: number, z: number, ground: number) {
    // Keep a road's full cross-section on its own profile, not a blend with uphill neighbors.
    let profileHeight = ground,
      closest = Infinity,
      blend = 0,
      closestEdge = Infinity,
      surroundingHeight = 0,
      surroundingWeight = 0,
      surroundingBlend = 0;
    const junctions = this.junctionCells.get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`) ?? [];
    const junctionHeight = (roadIndex: number, profile: number) => {
      let sum = 0,
        weights = 0,
        blend = 0;
      for (const junction of junctions) {
        if (!junction.roads.has(roadIndex)) continue;
        const distance = Math.hypot(x - junction.x, z - junction.z);
        const weight = 1 - MathUtils.smoothstep(distance, junction.inner, junctionReach);
        sum +=
          (junction.height +
            (x - junction.x) * junction.slopeX +
            (z - junction.z) * junction.slopeZ) *
          weight;
        weights += weight;
        blend = Math.max(blend, weight);
      }
      return weights ? MathUtils.lerp(profile, sum / weights, blend) : profile;
    };
    for (const [roadIndex, segments] of this.cells
      .get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`)
      ?.entries() ?? []) {
      let nearest = Infinity,
        height = 0;
      const width = segments[0].width;
      for (const { a, b } of segments) {
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const length = dx * dx + dz * dz;
        if (!length) continue;
        const t = MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / length, 0, 1);
        const distance = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
        if (distance >= nearest) continue;
        nearest = distance;
        height = MathUtils.lerp(a.height, b.height, t);
      }
      const distance = nearest;
      const influence =
        1 - MathUtils.smoothstep(distance, width / 2 + 7, width / 2 + sceneryRoadBlendReach);
      if (!influence) continue;
      const edge = distance - width / 2;
      height = junctionHeight(roadIndex, height);
      // Outside the protected roadbed, continuous distance weights avoid nearest-road cliffs.
      const weight = influence / Math.max(0.001, edge - 2) ** 2;
      surroundingHeight += height * weight;
      surroundingWeight += weight;
      surroundingBlend = Math.max(surroundingBlend, influence);
      closestEdge = Math.min(closestEdge, edge);
      const score = edge <= 2 ? distance / (width / 2 + 2) - 1 : distance / (width / 2 + 7);
      if (score >= closest) continue;
      closest = score;
      blend = influence;
      profileHeight = height;
    }
    if (!blend) return ground;
    if (closestEdge > 2)
      return MathUtils.lerp(ground, surroundingHeight / surroundingWeight, surroundingBlend);
    return MathUtils.lerp(ground, profileHeight, blend);
  }
}
