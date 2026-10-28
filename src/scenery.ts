import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { courseShoulderWidth, type CourseDefinition } from './courses';
import type { CourseTerrain } from './terrain';
import { projectTerrainGeometry } from './terrain';
import { TerrainSurface, type TriangleMeshData } from './terrain-query';
import type { SceneryCategory, SceneryPoint, SceneryPolygon } from './scenery-data';

type Point = { x: number; z: number };
type Bounds = { minX: number; minZ: number; maxX: number; maxZ: number };
type Polygon = Bounds & { rings: SceneryPolygon };
type RoadSegment = Bounds & { a: Point; b: Point; width: number };
type Vertex = Point & { y: number };

export interface SceneryOptions {
  /**
   * Projects nearby roads and waterways onto the displayed ground, e.g. a coarse preview grid.
   * Return a new geometry; the source is borrowed and disposed by createScenery.
   * `lift` is the game surface offset; previews can use a larger minimum offset.
   * Must use ground beneath bridges, not the selected route's elevated driving surface.
   */
  projectGroundGeometry?: (source: THREE.BufferGeometry, lift: number) => THREE.BufferGeometry;
}

const categories: SceneryCategory[] = ['buildings', 'water', 'vegetation', 'nearbyRoads'];
const maxPlants = 4000;
const maxPlantAttempts = 24000;

/** Small local indices keep vegetation rejection independent of the total map feature count. */
class SpatialIndex<T extends Bounds> {
  private cells = new Map<string, T[]>();
  private large: T[] = [];

  add(item: T) {
    const x0 = Math.floor(item.minX / 32);
    const z0 = Math.floor(item.minZ / 32);
    const x1 = Math.floor(item.maxX / 32);
    const z1 = Math.floor(item.maxZ / 32);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) {
      this.large.push(item);
      return;
    }
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const key = `${x},${z}`;
        const bucket = this.cells.get(key) ?? [];
        bucket.push(item);
        this.cells.set(key, bucket);
      }
  }

  some(x: number, z: number, predicate: (item: T) => boolean) {
    return [this.cells.get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`) ?? [], this.large].some(
      (items) =>
        items.some(
          (item) =>
            x >= item.minX && x <= item.maxX && z >= item.minZ && z <= item.maxZ && predicate(item),
        ),
    );
  }
}

function polygon(rings: SceneryPolygon): Polygon | undefined {
  const cleaned = rings.map((ring) => {
    const points = ring
      .filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z))
      .filter((p, i, all) => !i || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1]);
    if (
      points.length > 1 &&
      points[0][0] === points.at(-1)![0] &&
      points[0][1] === points.at(-1)![1]
    )
      points.pop();
    return points;
  });
  if (!cleaned[0] || cleaned[0].length < 3) return;
  const valid = cleaned.filter((ring) => ring.length >= 3);
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;
  for (const [x, z] of valid[0]) {
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  }
  return { rings: valid, minX, minZ, maxX, maxZ };
}

function inRing(x: number, z: number, ring: SceneryPoint[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[j];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

function inside(x: number, z: number, shape: Polygon) {
  return inRing(x, z, shape.rings[0]) && !shape.rings.slice(1).some((ring) => inRing(x, z, ring));
}

function segmentDistance(x: number, z: number, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

function nearPolygon(x: number, z: number, shape: Polygon, margin: number) {
  if (inside(x, z, shape)) return true;
  return shape.rings.some((ring) =>
    ring.some(([ax, az], i) => {
      const [bx, bz] = ring[(i + 1) % ring.length];
      return segmentDistance(x, z, { x: ax, z: az }, { x: bx, z: bz }) < margin;
    }),
  );
}

function triangulate(shape: Polygon) {
  const rings = shape.rings.map((ring) => ring.map(([x, z]) => new THREE.Vector2(x, z)));
  return {
    points: rings.flat().map((p) => ({ x: p.x, z: p.y })),
    triangles: THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1)),
  };
}

function clipToBounds(points: Point[], bounds: Bounds) {
  for (const [axis, limit, sign] of [
    ['x', bounds.minX, 1],
    ['x', bounds.maxX, -1],
    ['z', bounds.minZ, 1],
    ['z', bounds.maxZ, -1],
  ] as const) {
    const output: Point[] = [];
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length];
      const dp = (p[axis] - limit) * sign,
        dq = (q[axis] - limit) * sign;
      if (dp >= 0) output.push(p);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        output.push({ x: THREE.MathUtils.lerp(p.x, q.x, t), z: THREE.MathUtils.lerp(p.z, q.z, t) });
      }
    });
    points = output;
  }
  return points;
}

class Batch {
  positions: number[] = [];
  colors: number[] = [];

  triangle(a: Vertex, b: Vertex, c: Vertex, color?: THREE.Color) {
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    if (color) for (let i = 0; i < 3; i++) this.colors.push(color.r, color.g, color.b);
  }

  roof(a: Vertex, b: Vertex, c: Vertex, color?: THREE.Color) {
    if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) this.triangle(a, c, b, color);
    else this.triangle(a, b, c, color);
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    if (this.colors.length)
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function material(color: number, vertexColors = false) {
  return new THREE.MeshStandardMaterial({
    color,
    vertexColors,
    roughness: 0.92,
    flatShading: true,
    shadowSide: THREE.BackSide,
  });
}

function foliageGeometry(shrub = false) {
  const geometry = shrub
    ? new THREE.SphereGeometry(1, 10, 6).scale(1.1, 0.8, 1.1).translate(0, 0.65, 0)
    : new THREE.LatheGeometry(
        [
          [0, 2],
          [1.5, 2.2],
          [2.1, 2.8],
          [1.65, 3.5],
          [1.7, 4.2],
          [1.1, 5.2],
          [0.85, 6.1],
          [0.35, 7.1],
          [0, 8],
        ].map(([radius, height]) => new THREE.Vector2(radius, height)),
        10,
      );
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    // Bake soft foliage clumps and darker undersides once, rather than sampling noise per pixel.
    const clump = Math.sin(x * 5 + y * 3 + Math.sin(z * 4)) * Math.cos(z * 5 - y * 2);
    const light =
      0.74 + 0.12 * clump + 0.12 * THREE.MathUtils.smoothstep(y, shrub ? 0 : 2, shrub ? 1.4 : 8);
    tint.setRGB(light * 0.96, light, light * 0.88);
    tint.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function addBatch(
  parent: THREE.Group,
  batch: Batch,
  surface: THREE.Material,
  name: string,
  shadows = true,
) {
  if (!batch.positions.length) return;
  const mesh = new THREE.Mesh(batch.geometry(), surface);
  mesh.name = name;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Static, forward-coordinate scenery; visibility never changes its collider or cone data. */
export function createScenery(
  definition: CourseDefinition,
  terrain: CourseTerrain,
  options: SceneryOptions = {},
) {
  const group = new THREE.Group();
  group.name = 'scenery';
  const layers = Object.fromEntries(
    categories.map((category) => {
      const layer = new THREE.Group();
      layer.name = category;
      group.add(layer);
      return [category, layer];
    }),
  ) as Record<SceneryCategory, THREE.Group>;
  const junctionCones: Point[] = [];
  const result = {
    group,
    collisionMesh: undefined as TriangleMeshData | undefined,
    junctionCones,
    setVisible(category: SceneryCategory, visible: boolean) {
      layers[category].visible = visible;
    },
  };
  const scenery = definition.scenery;
  if (!scenery) return result;
  const query = terrain.physicsData();
  const bounds = {
    minX: query.minX,
    minZ: query.minZ,
    maxX: query.minX + (query.columns - 1) * query.spacing - 0.001,
    maxZ: query.minZ + (query.rows - 1) * query.spacing - 0.001,
  };
  const surface = new TerrainSurface(query.segments, query.halfWidth, query.padRadius);
  const halfWidth = definition.width / 2 + (definition.shoulderWidth ?? courseShoulderWidth);
  const ground = (x: number, z: number) => terrain.groundHeightAt(x, z);
  const clearance = (x: number, z: number) =>
    definition.padRadius !== undefined
      ? Math.hypot(x, z) - definition.padRadius
      : surface.nearest(x, z).distance - halfWidth;
  const separated = (x: number, z: number) => Math.abs(terrain.heightAt(x, z) - ground(x, z)) > 3;
  const roadBlocked = (x: number, z: number) => clearance(x, z) < 0.8 && !separated(x, z);
  const obstacles = new SpatialIndex<Polygon>();
  const roads = new SpatialIndex<RoadSegment>();
  const buildingBatch = new Batch();

  for (const building of scenery.buildings) {
    const shape = polygon(building.rings);
    // A cut-off building would expose its interior; omit footprints beyond supported terrain.
    if (
      !shape ||
      !Number.isFinite(building.height) ||
      shape.rings.some((ring) => ring.some(([x, z]) => !terrain.contains(x, z)))
    )
      continue;
    obstacles.add({
      ...shape,
      minX: shape.minX - 3,
      minZ: shape.minZ - 3,
      maxX: shape.maxX + 3,
      maxZ: shape.maxZ + 3,
    });
    const rings = shape.rings.map((ring, hole) => {
      const points = ring.map(([x, z]) => new THREE.Vector2(x, z));
      if (THREE.ShapeUtils.isClockWise(points) !== hole > 0) points.reverse();
      const sampled: Point[] = [];
      points.forEach((a, i) => {
        const b = points[(i + 1) % points.length];
        const count = Math.min(256, Math.max(1, Math.ceil(a.distanceTo(b) / 3)));
        for (let j = 0; j < count; j++)
          sampled.push({
            x: THREE.MathUtils.lerp(a.x, b.x, j / count),
            z: THREE.MathUtils.lerp(a.y, b.y, j / count),
          });
      });
      return sampled;
    });
    let base = -Infinity;
    for (const ring of rings) for (const p of ring) base = Math.max(base, ground(p.x, p.z));
    const roof = base + THREE.MathUtils.clamp(building.height, 2, 150);
    const tone = Math.abs(Math.sin(shape.minX * 0.13 + shape.minZ * 0.37));
    const wall = new THREE.Color().setHSL(0.08 + tone * 0.035, 0.12, 0.55 + tone * 0.18);
    const roofColor = new THREE.Color().setHSL(0.035, 0.16, 0.27 + tone * 0.12);
    for (const ring of rings)
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length];
        const bottomA = { ...a, y: ground(a.x, a.z) - 0.15 };
        const bottomB = { ...b, y: ground(b.x, b.z) - 0.15 };
        const topA = { ...a, y: roof },
          topB = { ...b, y: roof };
        buildingBatch.triangle(bottomA, topA, topB, wall);
        buildingBatch.triangle(bottomA, topB, bottomB, wall);
      });
    const { points, triangles } = triangulate(shape);
    for (const [a, b, c] of triangles)
      buildingBatch.roof(
        { ...points[a], y: roof },
        { ...points[b], y: roof },
        { ...points[c], y: roof },
        roofColor,
      );
  }
  if (buildingBatch.positions.length) {
    const mesh = addBatch(
      layers.buildings,
      buildingBatch,
      material(0xffffff, true),
      'building-shells',
    )!;
    const positions = mesh.geometry.getAttribute('position').array as Float32Array;
    result.collisionMesh = {
      positions,
      indices: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i),
    };
  }

  const waterBatch = new Batch();
  let waterBudget = 80000;
  for (const body of scenery.water) {
    const shape = polygon(body.rings);
    if (!shape) continue;
    const boundary = clipToBounds(
      shape.rings[0].map(([x, z]) => ({ x, z })),
      bounds,
    );
    if (boundary.length < 3) continue;
    obstacles.add({
      ...shape,
      minX: shape.minX - 3,
      minZ: shape.minZ - 3,
      maxX: shape.maxX + 3,
      maxZ: shape.maxZ + 3,
    });
    const heights: number[] = [];
    boundary.forEach(({ x, z }, i) => {
      const { x: bx, z: bz } = boundary[(i + 1) % boundary.length];
      const count = Math.min(32, Math.max(1, Math.ceil(Math.hypot(bx - x, bz - z) / 8)));
      for (let j = 0; j < count; j++)
        heights.push(
          ground(THREE.MathUtils.lerp(x, bx, j / count), THREE.MathUtils.lerp(z, bz, j / count)),
        );
    });
    heights.sort((a, b) => a - b);
    const level = heights[Math.floor((heights.length - 1) * 0.35)] + 0.12;
    const { points, triangles } = triangulate(shape);
    // Without hydrological terrain carving, only expose a shallow, horizontal local surface.
    // Clip against ground instead of raising an entire hillside (or a road) to a lake's level.
    const emit = (a: Point, b: Point, c: Point, depth = 0) => {
      if (--waterBudget < 0) return;
      const edges = [
        [a, b],
        [b, c],
        [c, a],
      ];
      const longest = edges.reduce((best, edge) =>
        Math.hypot(edge[0].x - edge[1].x, edge[0].z - edge[1].z) >
        Math.hypot(best[0].x - best[1].x, best[0].z - best[1].z)
          ? edge
          : best,
      );
      if (depth < 18 && Math.hypot(longest[0].x - longest[1].x, longest[0].z - longest[1].z) > 3) {
        const [p, q] = longest;
        const r = [a, b, c].find((v) => v !== p && v !== q)!;
        const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
        emit(p, mid, r, depth + 1);
        emit(mid, q, r, depth + 1);
        return;
      }
      if (
        [a, b, c, { x: (a.x + b.x + c.x) / 3, z: (a.z + b.z + c.z) / 3 }].some((p) =>
          roadBlocked(p.x, p.z),
        )
      )
        return;
      let clipped = [a, b, c].map((p) => ({ ...p, y: ground(p.x, p.z) }));
      for (const [limit, sign] of [
        [level - 0.025, -1],
        [level - 0.65, 1],
      ]) {
        const output: Vertex[] = [];
        clipped.forEach((p, i) => {
          const q = clipped[(i + 1) % clipped.length];
          const dp = (p.y - limit) * sign,
            dq = (q.y - limit) * sign;
          if (dp >= 0) output.push(p);
          if (dp >= 0 !== dq >= 0) {
            const t = dp / (dp - dq);
            output.push({
              x: THREE.MathUtils.lerp(p.x, q.x, t),
              y: limit,
              z: THREE.MathUtils.lerp(p.z, q.z, t),
            });
          }
        });
        clipped = output;
      }
      for (let i = 1; i + 1 < clipped.length; i++)
        waterBatch.roof(
          { ...clipped[0], y: level },
          { ...clipped[i], y: level },
          { ...clipped[i + 1], y: level },
        );
    };
    for (const [a, b, c] of triangles) {
      const clipped = clipToBounds([points[a], points[b], points[c]], bounds);
      for (let i = 1; i + 1 < clipped.length; i++) emit(clipped[0], clipped[i], clipped[i + 1]);
    }
  }

  const roadBatch = new Batch(),
    riverBatch = new Batch();
  const mouths: (Point & { width: number })[] = [];
  function ribbon(
    points: SceneryPoint[],
    rawWidth: number,
    batch: Batch,
    river: boolean,
    conesOnly = false,
  ) {
    if (!Number.isFinite(rawWidth)) return;
    const width = THREE.MathUtils.clamp(rawWidth, 0.6, river ? 40 : 20);
    let connected = false;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1],
        [bx, bz] = points[i];
      const length = Math.hypot(bx - ax, bz - az);
      if (!Number.isFinite(length) || length < 0.01) continue;
      const dx = (bx - ax) / length,
        dz = (bz - az) / length;
      const a = { x: ax, z: az },
        b = { x: bx, z: bz };
      const margin = width / 2 + 3;
      const segment = {
        a,
        b,
        width,
        minX: Math.min(ax, bx) - margin,
        minZ: Math.min(az, bz) - margin,
        maxX: Math.max(ax, bx) + margin,
        maxZ: Math.max(az, bz) + margin,
      };
      if (!conesOnly) {
        // Waterway capsules share the same exclusion index as nearby roads.
        roads.add(river ? { ...segment, width: width + 2 } : segment);
      }
      const steps = Math.min(8192, Math.ceil(length / 2));
      const side = (t: number, offset: number): Vertex => ({
        x: ax + dx * t - dz * offset,
        z: az + dz * t + dx * offset,
        y: 0,
      });
      for (let j = 0; j < steps; j++) {
        const t0 = (length * j) / steps;
        const center = side((length * (j + 0.5)) / steps, 0);
        const distance = clearance(center.x, center.z);
        if (separated(center.x, center.z)) connected = false;
        if (!river && !separated(center.x, center.z)) {
          if (distance <= 0.5) connected = true;
          if (connected && distance >= width / 2 + 1.2) {
            const conePoints: Point[] = [];
            const count = Math.max(2, Math.ceil(width / 1.8) + 1);
            for (let k = 0; k < count; k++) {
              const p = side((length * (j + 0.5)) / steps, width * (k / (count - 1) - 0.5));
              if (
                terrain.contains(p.x - 0.4, p.z - 0.4) &&
                terrain.contains(p.x + 0.4, p.z + 0.4) &&
                clearance(p.x, p.z) > 0.65
              )
                conePoints.push({ x: p.x, z: p.z });
            }
            if (
              conePoints.length === count &&
              !mouths.some(
                (p) => Math.hypot(p.x - center.x, p.z - center.z) < Math.max(width, p.width),
              )
            ) {
              mouths.push({ ...center, width });
              for (const p of conePoints)
                if (!junctionCones.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 1.2))
                  junctionCones.push(p);
            }
            connected = false;
          }
        }
        if (conesOnly) continue;
        // Cone placement needs fine samples; the exact terrain projection below does not.
        const geometrySteps = 8;
        if (j % geometrySteps !== 0) continue;
        const geometryEnd = (length * Math.min(j + geometrySteps, steps)) / steps;
        const corners = [
          side(t0, -width / 2),
          side(t0, width / 2),
          side(geometryEnd, -width / 2),
          side(geometryEnd, width / 2),
        ];
        if ([...corners, center].some((p) => roadBlocked(p.x, p.z))) continue;
        batch.roof(corners[0], corners[1], corners[2]);
        batch.roof(corners[1], corners[3], corners[2]);
      }
    }
  }
  // Traverse both ways so a branch saved from its outer end still gets a mouth barrier.
  for (const road of scenery.roads) {
    ribbon(road.points, road.width, roadBatch, false);
    ribbon([...road.points].reverse(), road.width, roadBatch, false, true);
  }
  for (const waterway of scenery.waterways)
    ribbon(waterway.points, waterway.width, riverBatch, true);
  const groundQuery = query.groundSurface
    ? {
        ...query,
        heights: query.groundSurface.heights,
        filletVertices: query.groundSurface.filletVertices,
      }
    : query;
  const addDraped = (
    batch: Batch,
    parent: THREE.Group,
    color: number,
    name: string,
    lift: number,
  ) => {
    if (!batch.positions.length) return;
    const source = batch.geometry();
    let projected: THREE.BufferGeometry;
    try {
      projected = options.projectGroundGeometry
        ? options.projectGroundGeometry(source, lift)
        : projectTerrainGeometry(groundQuery, source, lift);
    } finally {
      source.dispose();
    }
    const positions = projected.getAttribute('position');
    const kept = new Batch();
    for (let i = 0; i < positions.count; i += 3) {
      const vertices = [0, 1, 2].map((j) => ({
        x: positions.getX(i + j),
        y: positions.getY(i + j),
        z: positions.getZ(i + j),
      }));
      if (vertices.some((p) => roadBlocked(p.x, p.z))) continue;
      const [a, b, c] = vertices;
      if (roadBlocked((a.x + b.x + c.x) / 3, (a.z + b.z + c.z) / 3)) continue;
      kept.roof(a, b, c);
    }
    projected.dispose();
    if (!kept.positions.length) return;
    // Long routes must not submit every surrounding road whenever one end is in view.
    const chunks = new Map<string, Batch>();
    for (let i = 0; i < kept.positions.length; i += 9) {
      const positions = kept.positions;
      const x = (positions[i] + positions[i + 3] + positions[i + 6]) / 3;
      const z = (positions[i + 2] + positions[i + 5] + positions[i + 8]) / 3;
      const key = `${Math.floor(x / 128)},${Math.floor(z / 128)}`;
      const chunk = chunks.get(key) ?? new Batch();
      for (let j = 0; j < 9; j++) chunk.positions.push(positions[i + j]);
      chunks.set(key, chunk);
    }
    const surfaceMaterial = material(color);
    let index = 0;
    for (const chunk of chunks.values()) {
      const unindexed = chunk.geometry();
      const geometry = mergeVertices(unindexed);
      unindexed.dispose();
      const mesh = new THREE.Mesh(geometry, surfaceMaterial);
      mesh.name = index++ === 0 ? name : `${name}-${index}`;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  };
  addDraped(roadBatch, layers.nearbyRoads, 0x55575a, 'nearby-road-surfaces', 0.035);
  addDraped(riverBatch, layers.water, 0x397d89, 'draped-waterways', 0.065);
  if (waterBatch.positions.length) {
    const waterMaterial = material(0x397d89);
    waterMaterial.roughness = 0.38;
    waterMaterial.metalness = 0.12;
    addBatch(layers.water, waterBatch, waterMaterial, 'shallow-water-surfaces', false);
  }

  let seed = 0x5ce9e12;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const trees: THREE.Matrix4[] = [],
    shrubs: THREE.Matrix4[] = [];
  const shades: number[] = [],
    shrubShades: number[] = [];
  const transform = new THREE.Object3D();
  const occupied = new SpatialIndex<Bounds & Point>();
  let attempts = 0;
  for (const feature of scenery.vegetation) {
    if (feature.kind === 'grass') continue;
    const shape = polygon(feature.rings);
    if (!shape) continue;
    const area = (shape.maxX - shape.minX) * (shape.maxZ - shape.minZ);
    const trials = Math.min(6000, Math.ceil(area / (feature.kind === 'trees' ? 32 : 16)));
    for (
      let i = 0;
      i < trials && attempts < maxPlantAttempts && trees.length + shrubs.length < maxPlants;
      i++
    ) {
      attempts++;
      const x = THREE.MathUtils.lerp(shape.minX, shape.maxX, random());
      const z = THREE.MathUtils.lerp(shape.minZ, shape.maxZ, random());
      const tree = feature.kind === 'trees';
      const radius = tree ? 2.8 : 1.5;
      if (
        !inside(x, z, shape) ||
        !terrain.contains(x - radius, z - radius) ||
        !terrain.contains(x + radius, z + radius) ||
        clearance(x, z) < radius + 1 ||
        obstacles.some(x, z, (p) => nearPolygon(x, z, p, radius)) ||
        roads.some(x, z, (s) => segmentDistance(x, z, s.a, s.b) < s.width / 2 + radius + 0.8) ||
        occupied.some(x, z, (p) => Math.hypot(x - p.x, z - p.z) < radius + 1)
      )
        continue;
      const y = ground(x, z);
      const slope =
        Math.hypot(ground(x + 1, z) - ground(x - 1, z), ground(x, z + 1) - ground(x, z - 1)) / 2;
      if (!Number.isFinite(y) || slope > (tree ? 0.65 : 0.9)) continue;
      transform.position.set(x, y - 0.08, z);
      transform.rotation.set(0, random() * Math.PI * 2, 0);
      const size = 0.8 + random() * 0.5;
      transform.scale.set(size, size * (0.85 + random() * 0.3), size);
      transform.updateMatrix();
      (tree ? trees : shrubs).push(transform.matrix.clone());
      (tree ? shades : shrubShades).push(random());
      occupied.add({ x, z, minX: x - 5, maxX: x + 5, minZ: z - 5, maxZ: z + 5 });
    }
  }
  function instances(
    name: string,
    geometry: THREE.BufferGeometry,
    color: number,
    matrices: THREE.Matrix4[],
    colors: number[],
    foliage = false,
  ) {
    if (!matrices.length) {
      geometry.dispose();
      return;
    }
    const surface = material(color, foliage);
    surface.flatShading = false;
    const mesh = new THREE.InstancedMesh(geometry, surface, matrices.length);
    mesh.name = name;
    const tint = new THREE.Color();
    matrices.forEach((matrix, i) => {
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, tint.setHSL(0.25 + colors[i] * 0.06, 0.24, 0.7 + colors[i] * 0.24));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    layers.vegetation.add(mesh);
  }
  instances(
    'tree-trunks',
    new THREE.CylinderGeometry(0.18, 0.3, 3.2, 5).translate(0, 1.6, 0),
    0x79614b,
    trees,
    shades,
  );
  instances('tree-crowns', foliageGeometry(), 0x466941, trees, shades, true);
  instances('shrubs', foliageGeometry(true), 0x667847, shrubs, shrubShades, true);
  return result;
}
