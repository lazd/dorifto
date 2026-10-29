import { MathUtils } from 'three';
import type { CourseScenery } from './scenery-data';

type Sample = { x: number; z: number; height: number };
type Segment = { a: Sample; b: Sample; halfWidth: number };
const bankWidth = 6;
export const riverWaterLift = 0.065;
const channelDepth = 1 + riverWaterLift;
const cellSize = 32;

function project(segment: Segment, x: number, z: number) {
  const { a, b } = segment;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return { t, distance: Math.hypot(x - a.x - dx * t, z - a.z - dz * t) };
}

/** Riverbeds and banks sampled before excavation, independent of terrain tessellation. */
export class SceneryRiverChannels {
  private readonly cells = new Map<string, Segment[]>();

  constructor(waterways: CourseScenery['waterways'], height: (x: number, z: number) => number) {
    for (const river of waterways) {
      for (let i = 1; i < river.points.length; i++) {
        const [ax, az] = river.points[i - 1];
        const [bx, bz] = river.points[i];
        const length = Math.hypot(bx - ax, bz - az);
        if (!length) continue;
        const count = Math.ceil(length / 2);
        let a: Sample = { x: ax, z: az, height: height(ax, az) - channelDepth };
        for (let j = 1; j <= count; j++) {
          const x = MathUtils.lerp(ax, bx, j / count);
          const z = MathUtils.lerp(az, bz, j / count);
          const b = { x, z, height: height(x, z) - channelDepth };
          const segment = { a, b, halfWidth: river.width / 2 };
          const reach = segment.halfWidth + bankWidth + 8;
          for (
            let cx = Math.floor((Math.min(a.x, b.x) - reach) / cellSize);
            cx <= Math.floor((Math.max(a.x, b.x) + reach) / cellSize);
            cx++
          )
            for (
              let cz = Math.floor((Math.min(a.z, b.z) - reach) / cellSize);
              cz <= Math.floor((Math.max(a.z, b.z) + reach) / cellSize);
              cz++
            ) {
              const key = `${cx},${cz}`;
              const bucket = this.cells.get(key) ?? [];
              bucket.push(segment);
              this.cells.set(key, bucket);
            }
          a = b;
        }
      }
    }
  }

  private segmentsAt(x: number, z: number) {
    return this.cells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? [];
  }

  near(x: number, z: number, padding: number) {
    return this.segmentsAt(x, z).some(
      (segment) => project(segment, x, z).distance <= segment.halfWidth + bankWidth + padding,
    );
  }

  heightAt(x: number, z: number, height: number, pavementDistance: number) {
    // Keep pavement and its immediate support intact, easing the channel into roadside banks.
    const protection = MathUtils.smoothstep(pavementDistance, 1, 5);
    if (!protection) return height;
    let result = height;
    for (const segment of this.segmentsAt(x, z)) {
      const { t, distance } = project(segment, x, z);
      const weight =
        protection *
        (1 - MathUtils.smoothstep(distance, segment.halfWidth, segment.halfWidth + bankWidth));
      if (!weight) continue;
      const bed = MathUtils.lerp(segment.a.height, segment.b.height, t);
      result = Math.min(result, MathUtils.lerp(height, Math.min(height, bed), weight));
    }
    return result;
  }
}
