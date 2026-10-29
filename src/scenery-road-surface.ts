import { MathUtils } from 'three';
import {
  sceneryJunctions,
  sceneryPointKey,
  smoothSceneryLine,
  type CourseScenery,
  type SceneryPoint,
} from './scenery-data';

type Sample = { x: number; z: number; height: number; distance: number };
type Segment = { a: Sample; b: Sample; width: number };

/** A common unbanked surface for ground roads, including their shared junction heights. */
export class SceneryRoadSurface {
  private readonly cells = new Map<string, Segment[]>();
  private readonly junctionCells = new Map<string, SceneryPoint[]>();

  constructor(roads: CourseScenery['roads'], height: (x: number, z: number) => number) {
    const junctions = sceneryJunctions(roads);
    const anchors = new Map<string, Sample[]>();
    const lines = roads
      .filter((road) => !road.structure)
      .map((road) => {
        const points = smoothSceneryLine(road.points, road.width, junctions);
        const samples: Sample[] = [{ x: points[0][0], z: points[0][1], height: 0, distance: 0 }];
        for (let i = 1; i < points.length; i++) {
          const [ax, az] = points[i - 1],
            [bx, bz] = points[i];
          const length = Math.hypot(bx - ax, bz - az);
          const steps = Math.max(1, Math.ceil(length / 2));
          const start = samples.at(-1)!.distance;
          for (let j = 1; j <= steps; j++)
            samples.push({
              x: ax + ((bx - ax) * j) / steps,
              z: az + ((bz - az) * j) / steps,
              distance: start + (length * j) / steps,
              height: 0,
            });
        }
        const raw = samples.map((p) => height(p.x, p.z));
        for (let i = 0; i < samples.length; i++) {
          let sum = 0,
            weight = 0;
          for (let j = i; j >= 0 && samples[i].distance - samples[j].distance <= 20; j--) {
            const w = Math.exp(-(((samples[i].distance - samples[j].distance) / 9) ** 2));
            sum += raw[j] * w;
            weight += w;
          }
          for (
            let j = i + 1;
            j < samples.length && samples[j].distance - samples[i].distance <= 20;
            j++
          ) {
            const w = Math.exp(-(((samples[j].distance - samples[i].distance) / 9) ** 2));
            sum += raw[j] * w;
            weight += w;
          }
          samples[i].height = sum / weight;
          const key = sceneryPointKey([samples[i].x, samples[i].z]);
          if (junctions.has(key)) {
            const shared = anchors.get(key) ?? [];
            shared.push(samples[i]);
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
    for (const { samples, width } of lines) {
      const corrections = samples.flatMap((p) => {
        const target = targets.get(sceneryPointKey([p.x, p.z]));
        return target === undefined ? [] : [{ distance: p.distance, delta: target - p.height }];
      });
      for (const sample of samples) {
        let delta = 0,
          weight = 0;
        for (const correction of corrections) {
          const w =
            1 - MathUtils.smoothstep(Math.abs(sample.distance - correction.distance), 0, 25);
          delta += correction.delta * w;
          weight += w;
        }
        if (weight) sample.height += delta / Math.max(1, weight);
      }
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
            const bucket = this.cells.get(key) ?? [];
            bucket.push(segment);
            this.cells.set(key, bucket);
          }
      }
    }
    for (const samples of anchors.values()) {
      const { x, z } = samples[0];
      for (let cx = Math.floor((x - 30) / 32); cx <= Math.floor((x + 30) / 32); cx++)
        for (let cz = Math.floor((z - 30) / 32); cz <= Math.floor((z + 30) / 32); cz++) {
          const key = `${cx},${cz}`;
          const bucket = this.junctionCells.get(key) ?? [];
          bucket.push([x, z]);
          this.junctionCells.set(key, bucket);
        }
    }
  }

  bankingWeight(x: number, z: number) {
    let distance = 30;
    for (const p of this.junctionCells.get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`) ?? [])
      distance = Math.min(distance, Math.hypot(x - p[0], z - p[1]));
    return MathUtils.smoothstep(distance, 8, 30);
  }

  heightAt(x: number, z: number, ground: number) {
    // A width-weighted local blend gives overlapping corridors one surface, not stacked decks.
    let sum = 0,
      weights = 0,
      blend = 0;
    for (const { a, b, width } of this.cells.get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`) ??
      []) {
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const length = dx * dx + dz * dz;
      if (!length) continue;
      const t = MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / length, 0, 1);
      const distance = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
      const influence = 1 - MathUtils.smoothstep(distance, width / 2 + 7, width / 2 + 20);
      if (!influence) continue;
      const weight = influence / (1 + distance * distance);
      sum += MathUtils.lerp(a.height, b.height, t) * weight;
      weights += weight;
      blend = Math.max(blend, influence);
    }
    return weights ? MathUtils.lerp(ground, sum / weights, blend) : ground;
  }
}
