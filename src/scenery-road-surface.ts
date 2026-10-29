import { MathUtils } from 'three';
import { cleanRoadElevation, roadElevationSmoothing } from './road-elevation.mjs';
import {
  anchorCorrections,
  sceneryJunctions,
  sceneryPointKey,
  smoothAlong,
  smoothSceneryLine,
  type CourseScenery,
} from './scenery-data';

type Sample = { x: number; z: number; height: number; distance: number };
type Segment = { a: Sample; b: Sample; width: number };
type Anchor = Sample & { slopeX: number; slopeZ: number; through: boolean; width: number };
type Junction = Anchor & { inner: number };
const junctionReach = 30;

/** A common unbanked surface for ground roads, including their shared junction heights. */
export class SceneryRoadSurface {
  private readonly cells = new Map<string, Map<number, Segment[]>>();
  private readonly junctionCells = new Map<string, Junction[]>();

  constructor(roads: CourseScenery['roads'], height: (x: number, z: number) => number) {
    const junctions = sceneryJunctions(roads);
    const anchors = new Map<string, Anchor[]>();
    const lines = roads
      .filter((road) => !road.structure)
      .map((road) => {
        const points = smoothSceneryLine(road.points, road.width, junctions);
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
            });
            anchors.set(key, shared);
          }
        }
        return { samples, width: road.width };
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
        const segment = { a, b, width };
        const radius = width / 2 + 20;
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

  heightAt(x: number, z: number, ground: number) {
    // A width-weighted local blend gives overlapping corridors one surface, not stacked decks.
    let sum = 0,
      weights = 0,
      blend = 0;
    for (const segments of this.cells
      .get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`)
      ?.values() ?? []) {
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
      const influence = 1 - MathUtils.smoothstep(distance, width / 2 + 7, width / 2 + 20);
      if (!influence) continue;
      const weight = influence / (1 + distance * distance);
      sum += height * weight;
      weights += weight;
      blend = Math.max(blend, influence);
    }
    if (!weights) return ground;
    let height = sum / weights,
      junctionSum = 0,
      junctionWeights = 0,
      junctionBlend = 0;
    for (const junction of this.junctionCells.get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`) ??
      []) {
      const distance = Math.hypot(x - junction.x, z - junction.z);
      const weight = 1 - MathUtils.smoothstep(distance, junction.inner, junctionReach);
      junctionSum +=
        (junction.height +
          (x - junction.x) * junction.slopeX +
          (z - junction.z) * junction.slopeZ) *
        weight;
      junctionWeights += weight;
      junctionBlend = Math.max(junctionBlend, weight);
    }
    if (junctionWeights)
      height = MathUtils.lerp(height, junctionSum / junctionWeights, junctionBlend);
    return MathUtils.lerp(ground, height, blend);
  }
}
