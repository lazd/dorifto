import * as THREE from 'three';

export interface TriangleMeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface HeightfieldData {
  spacing: number;
  columns: number;
  rows: number;
  minX: number;
  minZ: number;
  heights: Float32Array;
  minHeight: number;
  maxHeight: number;
  /** Per-cell flags; 1 splits the cell along its other diagonal (corner 0 to corner 3). */
  flippedCells?: Uint8Array;
  /** Per-cell flags; 1 marks a cell with a corner in `warpedVertices`. */
  warpedCells?: Uint8Array;
  /** World positions of grid vertices moved off the regular grid. */
  warpedVertices?: Map<number, { x: number; z: number }>;
  /** x, y, z of extra vertices, indexed after the grid's `columns * rows` vertices. */
  filletVertices?: Float32Array;
  /** Triangle vertex indices of warped cells subdivided across the roadside wall. */
  filletCells?: Map<number, number[]>;
  /** Additional non-heightfield surfaces, such as tunnel walls and ceilings. */
  collisionMesh?: TriangleMeshData & { collisionIndices?: Uint32Array };
  /** Ground below elevated roads; height queries still return the drivable road surface. */
  groundSurface?: { heights: Float32Array; filletVertices?: Float32Array };
  bridgeMesh?: TriangleMeshData & { collisionIndices?: Uint32Array };
  buildingMesh?: TriangleMeshData;
  nearbyStructureMesh?: TriangleMeshData;
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
  /** Route fractions where the course is paved; all of it when omitted. */
  asphaltSpans?: { start: number; end: number }[];
  nearbyRoadMesh?: TriangleMeshData;
}

/** Uses the rendered footprint, so trimmed road panels never become invisible asphalt. */
export class PavementSurface {
  private readonly buckets = new Map<string, number[]>();

  constructor(private readonly mesh?: TriangleMeshData) {
    if (!mesh) return;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const vertices = [0, 1, 2].map((j) => mesh.indices[i + j] * 3);
      const xs = vertices.map((v) => mesh.positions[v]);
      const zs = vertices.map((v) => mesh.positions[v + 2]);
      for (let x = Math.floor(Math.min(...xs) / 16); x <= Math.floor(Math.max(...xs) / 16); x++)
        for (let z = Math.floor(Math.min(...zs) / 16); z <= Math.floor(Math.max(...zs) / 16); z++) {
          const key = `${x},${z}`;
          const bucket = this.buckets.get(key) ?? [];
          bucket.push(i);
          this.buckets.set(key, bucket);
        }
    }
  }

  isAsphalt(position: { x: number; y?: number; z: number }) {
    if (!this.mesh) return false;
    const { positions: p, indices } = this.mesh;
    for (const i of this.buckets.get(
      `${Math.floor(position.x / 16)},${Math.floor(position.z / 16)}`,
    ) ?? []) {
      const a = indices[i] * 3,
        b = indices[i + 1] * 3,
        c = indices[i + 2] * 3;
      const bx = p[b] - p[a],
        bz = p[b + 2] - p[a + 2];
      const cx = p[c] - p[a],
        cz = p[c + 2] - p[a + 2];
      const determinant = bx * cz - bz * cx;
      if (Math.abs(determinant) < 1e-8) continue;
      const x = position.x - p[a],
        z = position.z - p[a + 2];
      const u = (x * cz - z * cx) / determinant;
      const v = (bx * z - bz * x) / determinant;
      if (u < -1e-5 || v < -1e-5 || u + v > 1.00001) continue;
      const height = p[a + 1] + u * (p[b + 1] - p[a + 1]) + v * (p[c + 1] - p[a + 1]);
      if (position.y === undefined || Math.abs(position.y - height) < 2) return true;
    }
    return false;
  }
}

export class TerrainSurface {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly segments: SurfaceSegment[],
    private readonly halfWidth: number,
    private readonly padRadius?: number,
    private readonly asphaltSpans?: { start: number; end: number }[],
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
    const near = this.nearest(position.x, position.z);
    return (
      near.distance <= this.halfWidth &&
      (!this.asphaltSpans ||
        this.asphaltSpans.some(({ start, end }) => near.fraction >= start && near.fraction <= end))
    );
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
  if (terrain.warpedCells?.[iz * (columns - 1) + ix]) {
    // Warped vertices move less than half a cell, so the containing triangle is in a neighbor.
    for (let cz = Math.max(iz - 1, 0); cz <= Math.min(iz + 1, rows - 2); cz++)
      for (let cx = Math.max(ix - 1, 0); cx <= Math.min(ix + 1, columns - 2); cx++) {
        const corners = cellTriangles(terrain, cx, cz);
        for (let t = 0; t < corners.length; t += 3) {
          const height = triangleHeight(terrain, corners.slice(t, t + 3), x, z, 1e-6);
          if (height !== undefined) return height;
        }
      }
  }
  const a = heights[i];
  const b = heights[i + 1];
  const c = heights[i + columns];
  const d = heights[i + columns + 1];
  if (terrain.flippedCells?.[iz * (columns - 1) + ix])
    return u >= v ? a + (b - a) * u + (d - b) * v : a + (c - a) * v + (d - c) * u;
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

export function vertexPosition(terrain: HeightfieldData, i: number) {
  const fillet = (i - terrain.columns * terrain.rows) * 3;
  if (fillet >= 0)
    return { x: terrain.filletVertices![fillet], z: terrain.filletVertices![fillet + 2] };
  return (
    terrain.warpedVertices?.get(i) ?? {
      x: terrain.minX + (i % terrain.columns) * terrain.spacing,
      z: terrain.minZ + Math.floor(i / terrain.columns) * terrain.spacing,
    }
  );
}

export function vertexHeight(terrain: HeightfieldData, i: number) {
  const fillet = (i - terrain.columns * terrain.rows) * 3;
  return fillet >= 0 ? terrain.filletVertices![fillet + 1] : terrain.heights[i];
}

/** Height of a triangle's plane at (x, z), or undefined outside it beyond `tolerance`. */
export function triangleHeight(
  terrain: HeightfieldData,
  corners: number[],
  x: number,
  z: number,
  tolerance = Infinity,
) {
  const [p, q, r] = corners.map((i) => vertexPosition(terrain, i));
  const area = (q.x - p.x) * (r.z - p.z) - (r.x - p.x) * (q.z - p.z);
  if (Math.abs(area) < 1e-9) return undefined;
  const wq = ((x - p.x) * (r.z - p.z) - (r.x - p.x) * (z - p.z)) / area;
  const wr = ((q.x - p.x) * (z - p.z) - (x - p.x) * (q.z - p.z)) / area;
  const wp = 1 - wq - wr;
  if (Math.min(wp, wq, wr) < -tolerance) return undefined;
  const [hp, hq, hr] = corners.map((i) => vertexHeight(terrain, i));
  return wp * hp + wq * hq + wr * hr;
}

/**
 * Vertex indices of a cell's triangles: its fillet subdivision, or two triangles matching
 * Bullet's default split unless flipped.
 */
export function cellTriangles(terrain: HeightfieldData, x: number, z: number) {
  const fillet = terrain.filletCells?.get(z * (terrain.columns - 1) + x);
  if (fillet) return fillet;
  const i = z * terrain.columns + x;
  const a = i;
  const b = i + 1;
  const c = i + terrain.columns;
  const d = c + 1;
  return terrain.flippedCells?.[z * (terrain.columns - 1) + x]
    ? [a, c, d, a, d, b]
    : [a, c, b, b, c, d];
}
