import * as THREE from 'three';

export interface HeightfieldData {
  spacing: number;
  columns: number;
  rows: number;
  minX: number;
  minZ: number;
  heights: Float32Array;
  minHeight: number;
  maxHeight: number;
}

export interface SurfaceSegment {
  a: { x: number; z: number };
  b: { x: number; z: number };
  bank: number;
}

export interface TerrainQueryData extends HeightfieldData {
  segments: SurfaceSegment[];
  halfWidth: number;
  padRadius?: number;
}

export class TerrainSurface {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly segments: SurfaceSegment[],
    private readonly halfWidth: number,
    private readonly padRadius?: number,
  ) {
    segments.forEach(({ a, b }, i) => {
      for (
        let x = Math.floor((Math.min(a.x, b.x) - 50) / 16);
        x <= Math.floor((Math.max(a.x, b.x) + 50) / 16);
        x++
      ) {
        for (
          let z = Math.floor((Math.min(a.z, b.z) - 50) / 16);
          z <= Math.floor((Math.max(a.z, b.z) + 50) / 16);
          z++
        ) {
          const key = `${x},${z}`;
          const bucket = this.buckets.get(key) ?? [];
          bucket.push(i);
          this.buckets.set(key, bucket);
        }
      }
    });
  }

  nearest(x: number, z: number) {
    let distance = 50;
    let across = 0;
    let bank = 0;
    let centerX = x;
    let centerZ = z;
    let fraction = 0;
    for (const i of this.buckets.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []) {
      const segment = this.segments[i];
      const dx = segment.b.x - segment.a.x;
      const dz = segment.b.z - segment.a.z;
      const t = THREE.MathUtils.clamp(
        ((x - segment.a.x) * dx + (z - segment.a.z) * dz) / (dx * dx + dz * dz),
        0,
        1,
      );
      const ox = x - segment.a.x - t * dx;
      const oz = z - segment.a.z - t * dz;
      const d = Math.hypot(ox, oz);
      if (d < distance) {
        distance = d;
        centerX = segment.a.x + t * dx;
        centerZ = segment.a.z + t * dz;
        across = (ox * dz - oz * dx) / Math.hypot(dx, dz);
        bank = THREE.MathUtils.lerp(
          segment.bank,
          this.segments[(i + 1) % this.segments.length].bank,
          t,
        );
        fraction = (i + t) / this.segments.length;
      }
    }
    return { distance, across, bank, fraction, x: centerX, z: centerZ };
  }

  isAsphalt(position: { x: number; z: number }) {
    if (this.padRadius !== undefined) return Math.hypot(position.x, position.z) <= this.padRadius;
    return this.nearest(position.x, position.z).distance <= this.halfWidth;
  }
}

export function heightAt(terrain: HeightfieldData, x: number, z: number) {
  const { minX, minZ, spacing, columns, rows, heights } = terrain;
  const gx = THREE.MathUtils.clamp((x - minX) / spacing, 0, columns - 1.000001);
  const gz = THREE.MathUtils.clamp((z - minZ) / spacing, 0, rows - 1.000001);
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const u = gx - ix;
  const v = gz - iz;
  const i = iz * columns + ix;
  const a = heights[i];
  const b = heights[i + 1];
  const c = heights[i + columns];
  const d = heights[i + columns + 1];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

export function normalAt(terrain: HeightfieldData, x: number, z: number) {
  const delta = 0.3;
  return new THREE.Vector3(
    heightAt(terrain, x - delta, z) - heightAt(terrain, x + delta, z),
    2 * delta,
    heightAt(terrain, x, z - delta) - heightAt(terrain, x, z + delta),
  ).normalize();
}
