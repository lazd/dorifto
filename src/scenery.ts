import * as THREE from 'three';
import { mergeVertices } from './merge-vertices';
import { courseShoulderWidth, type CourseDefinition } from './courses';
import type { CourseTerrain } from './terrain';
import { projectTerrainGeometry } from './terrain';
import { PavementSurface, TerrainSurface, cellKey, type TriangleMeshData } from './terrain-query';
import type { SceneryCategory, SceneryPoint, SceneryPolygon } from './scenery-data';
import { junctionRoadFlare, sceneryJunctions, sceneryPointKey, treeCanopyAt } from './scenery-data';
import {
  nearbyRoadLift,
  nearbyRoadTaperLength,
  sceneryBridgeGroups,
  sceneryRoadProfiles,
} from './scenery-roads';
import { riverWaterLift } from './scenery-river-channels';
import { buildBridgeGeometry, createBridgeMeshes } from './bridges';
import { createStopSignFactory } from './turn-sign';
import * as polygonClipping from './polygon-boolean';
import { runSync, type LoadStep, type LoadTask } from './load-task';
import { addVegetation, setVegetationSettings } from './vegetation';
import { defaultTreeSettings, type TreeSettings } from './tree-settings';
import {
  buildingAppearance,
  buildingFlatRoofColumn,
  buildingGableColumn,
  buildingRoof,
  buildingRoofColumn,
  buildingUV,
  createBuildingTexture,
} from './building-appearance';

type Point = { x: number; z: number };
type Bounds = { minX: number; minZ: number; maxX: number; maxZ: number };
type Polygon = Bounds & { rings: SceneryPolygon };
type RoadSegment = Bounds & {
  a: Point;
  b: Point;
  width: number;
  widthA?: number;
  widthB?: number;
};
type Vertex = Point & { y: number };
type MultiPolygon = SceneryPolygon[];
type RoadCrossSection = { position: Point; tangent: Point; width: number };

export interface SceneryOptions {
  /** Compact, untextured models for serialized course previews. */
  simpleVegetation?: boolean;
  createRoadMaterial?: () => THREE.MeshStandardMaterial;
  /** Adds roadside dirt to a ground-level road or paint material; false when unavailable. */
  addRoadDirt?: (material: THREE.MeshStandardMaterial) => boolean;
  /**
   * Projects nearby roads and waterways onto the displayed ground, e.g. a coarse preview grid.
   * Return a new geometry; the source is borrowed and disposed by createScenery.
   * `lift` is the game surface offset; previews can use a larger minimum offset.
   * Must use ground beneath bridges, not the selected route's elevated driving surface.
   * With `horizontal`, clip water to the ground while preserving its source level.
   * The 'river' mode keeps deep channel water too, rather than only shallow margins.
   */
  projectGroundGeometry?: (
    source: THREE.BufferGeometry,
    lift: number,
    horizontal?: boolean | 'river',
  ) => THREE.BufferGeometry;
}

const categories: SceneryCategory[] = ['buildings', 'water', 'vegetation', 'nearbyRoads'];
const maxPlants = 4000;
const maxPlantAttempts = 24000;
const maxCanopyPlants = 100_000;
const vegetationChunkSize = 128;
// Terrain projection runs in slices of this many triangles so a caller can paint between them.
const projectionSlice = 20_000;
// Pavement edges are indexed far enough out to cover the terrain's roadside dirt verge.
const pavementEdgeReach = 6;
// Every road vertex looks up nearby pavement edges, so their buckets are small.
const pavementEdgeCell = 8;
// Largest error, in meters, of the interpolated edge distance that road dirt tolerates per triangle.
const dirtErrorLimit = 0.5;
export const highwayMedianProfile: readonly (readonly [number, number])[] = [
  [-0.305, -0.1],
  [-0.305, 0.075],
  [-0.175, 0.255],
  [-0.075, 0.81],
  [0.075, 0.81],
  [0.175, 0.255],
  [0.305, 0.075],
  [0.305, -0.1],
];

/** Small local indices keep vegetation rejection independent of the total map feature count. */
class SpatialIndex<T extends Bounds> {
  private cells = new Map<number, T[]>();
  private large: T[] = [];

  /** `cell` is the bucket size in meters; dense indexes queried per vertex want small buckets. */
  constructor(private readonly cell = 32) {}

  add(item: T) {
    const x0 = Math.floor(item.minX / this.cell);
    const z0 = Math.floor(item.minZ / this.cell);
    const x1 = Math.floor(item.maxX / this.cell);
    const z1 = Math.floor(item.maxZ / this.cell);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) {
      this.large.push(item);
      return;
    }
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const key = cellKey(x, z);
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(item);
        else this.cells.set(key, [item]);
      }
  }

  some(x: number, z: number, predicate: (item: T) => boolean) {
    return (
      this.anyAt(
        this.cells.get(cellKey(Math.floor(x / this.cell), Math.floor(z / this.cell))),
        x,
        z,
        predicate,
      ) || this.anyAt(this.large, x, z, predicate)
    );
  }

  private anyAt(items: T[] | undefined, x: number, z: number, predicate: (item: T) => boolean) {
    if (items)
      for (const item of items)
        if (x >= item.minX && x <= item.maxX && z >= item.minZ && z <= item.maxZ && predicate(item))
          return true;
    return false;
  }

  query(bounds: Bounds) {
    const x0 = Math.floor(bounds.minX / this.cell);
    const z0 = Math.floor(bounds.minZ / this.cell);
    const x1 = Math.floor(bounds.maxX / this.cell);
    const z1 = Math.floor(bounds.maxZ / this.cell);
    const result: T[] = [];
    const overlaps = (item: T) =>
      item.minX <= bounds.maxX &&
      item.maxX >= bounds.minX &&
      item.minZ <= bounds.maxZ &&
      item.maxZ >= bounds.minZ;
    for (const item of this.large) if (overlaps(item)) result.push(item);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) {
      const seen = new Set<T>();
      for (const bucket of this.cells.values())
        for (const item of bucket) {
          if (seen.has(item)) continue;
          seen.add(item);
          if (overlaps(item)) result.push(item);
        }
      return result;
    }
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        for (const item of this.cells.get(cellKey(x, z)) ?? [])
          // An item spanning several cells is reported from the first of them in range.
          if (
            Math.max(x0, Math.floor(item.minX / this.cell)) === x &&
            Math.max(z0, Math.floor(item.minZ / this.cell)) === z &&
            overlaps(item)
          )
            result.push(item);
    return result;
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

function segmentEntersPolygon(a: Point, b: Point, shape: Polygon, radius = 0) {
  if (inside(a.x, a.z, shape) || inside(b.x, b.z, shape)) return true;
  const side = (p: Point, q: Point, r: readonly number[]) =>
    Math.sign((q.x - p.x) * (r[1] - p.z) - (q.z - p.z) * (r[0] - p.x));
  return shape.rings.some((ring) =>
    ring.some((c, i) => {
      const d = ring[(i + 1) % ring.length];
      const p = { x: c[0], z: c[1] },
        q = { x: d[0], z: d[1] };
      return (
        (side(a, b, c) !== side(a, b, d) && side(p, q, [a.x, a.z]) !== side(p, q, [b.x, b.z])) ||
        segmentDistance(c[0], c[1], a, b) < radius ||
        segmentDistance(a.x, a.z, p, q) < radius ||
        segmentDistance(b.x, b.z, p, q) < radius
      );
    }),
  );
}

function segmentDistance(x: number, z: number, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.sqrt((x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2);
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
        output.push({
          x: THREE.MathUtils.lerp(p.x, q.x, t),
          z: THREE.MathUtils.lerp(p.z, q.z, t),
        });
      }
    });
    points = output;
  }
  return points;
}

class Batch {
  positions: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  outlines?: SceneryPolygon[];

  triangle(a: Vertex, b: Vertex, c: Vertex, color?: THREE.Color, uvs?: [number, number][]) {
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    if (color) for (let i = 0; i < 3; i++) this.colors.push(color.r, color.g, color.b);
    if (uvs) for (const uv of uvs) this.uvs.push(...uv);
  }

  roof(a: Vertex, b: Vertex, c: Vertex, color?: THREE.Color, uvs?: [number, number][]) {
    const area = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    if (Math.abs(area) < 1e-8) return;
    if (area < 0) this.triangle(a, c, b, color, uvs && [uvs[0], uvs[2], uvs[1]]);
    else this.triangle(a, b, c, color, uvs);
  }

  chunks() {
    const chunks = new Map<string, Batch>();
    for (let i = 0; i < this.positions.length; i += 9) {
      const positions = this.positions;
      const x = (positions[i] + positions[i + 3] + positions[i + 6]) / 3;
      const z = (positions[i + 2] + positions[i + 5] + positions[i + 8]) / 3;
      const key = `${Math.floor(x / 128)},${Math.floor(z / 128)}`;
      const chunk = chunks.get(key) ?? new Batch();
      for (let j = 0; j < 9; j++) chunk.positions.push(positions[i + j]);
      chunks.set(key, chunk);
    }
    return chunks.values();
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    if (this.colors.length)
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    if (this.uvs.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function pavementFootprint(batch: Batch): MultiPolygon {
  if (batch.outlines) {
    const polygons = batch.outlines
      .map((rings) =>
        rings.map((ring) =>
          ring.filter((p, i) => {
            const a = ring[(i + ring.length - 1) % ring.length],
              b = ring[(i + 1) % ring.length];
            return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-8;
          }),
        ),
      )
      .filter((rings) => rings[0].length >= 3);
    return polygons.length ? polygonClipping.union(polygons) : [];
  }
  const chunks: MultiPolygon[] = [];
  for (const chunk of batch.chunks()) {
    const triangles: MultiPolygon = [];
    for (let i = 0; i < chunk.positions.length; i += 9) {
      const p = chunk.positions;
      const ring: SceneryPoint[] = [0, 3, 6].map((j) => [p[i + j], p[i + j + 2]]);
      if (
        Math.abs(
          (ring[1][0] - ring[0][0]) * (ring[2][1] - ring[0][1]) -
            (ring[1][1] - ring[0][1]) * (ring[2][0] - ring[0][0]),
        ) > 1e-8
      )
        triangles.push([ring]);
    }
    if (triangles.length) chunks.push(polygonClipping.union(triangles));
  }
  return chunks.length ? polygonClipping.union(chunks[0], ...chunks.slice(1)) : [];
}

function fillFootprint(batch: Batch, footprint: MultiPolygon) {
  batch.positions.length = 0;
  for (const rings of footprint) {
    const shape = polygon(rings);
    if (!shape) continue;
    const { points, triangles } = triangulate(shape);
    for (const [a, b, c] of triangles) {
      const triangle = [points[a], points[b], points[c]];
      const minX = Math.min(...triangle.map((p) => p.x)),
        maxX = Math.max(...triangle.map((p) => p.x));
      const minZ = Math.min(...triangle.map((p) => p.z)),
        maxZ = Math.max(...triangle.map((p) => p.z));
      // Bound the terrain-projection search even for kilometer-long diagonal ribbons.
      for (let x = Math.floor(minX / 128); x <= Math.floor(maxX / 128); x++)
        for (let z = Math.floor(minZ / 128); z <= Math.floor(maxZ / 128); z++) {
          const clipped = clipToBounds(triangle, {
            minX: x * 128,
            maxX: (x + 1) * 128,
            minZ: z * 128,
            maxZ: (z + 1) * 128,
          });
          for (let i = 1; i + 1 < clipped.length; i++)
            batch.roof(
              { ...clipped[0], y: 0 },
              { ...clipped[i], y: 0 },
              { ...clipped[i + 1], y: 0 },
            );
        }
    }
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
  return runSync(createSceneryTask(definition, terrain, options));
}

/** Builds scenery as a task that yields progress, so a caller can run it in slices. */
export function* createSceneryTask(
  definition: CourseDefinition,
  terrain: CourseTerrain,
  options: SceneryOptions = {},
) {
  yield { message: 'Building nearby roads…', fraction: 0 };
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
  const stopSignGroup = new THREE.Group();
  stopSignGroup.name = 'nearby-road-stop-signs';
  let roadsVisible = true;
  let pavementEdges = new SpatialIndex<RoadSegment>(pavementEdgeCell);
  let junctionEdges = new SpatialIndex<RoadSegment>(pavementEdgeCell);
  let pavementSurface = new PavementSurface();
  let raisedPavement = new PavementSurface();
  let hasRaisedPavement = false;
  let junctionExpansion = (_x: number, _z: number) => 0;
  const edgeDistance = (edges: SpatialIndex<RoadSegment>, x: number, z: number, reach: number) => {
    let distance = reach;
    edges.some(x, z, (edge) => {
      distance = Math.min(distance, segmentDistance(x, z, edge.a, edge.b));
      return false;
    });
    return distance;
  };
  const roadDistance = (x: number, z: number, atGradeOnly = false) => {
    const distance = edgeDistance(atGradeOnly ? junctionEdges : pavementEdges, x, z, 3);
    const groundPavement =
      pavementSurface.isAsphalt({ x, z }) ||
      (hasRaisedPavement && raisedPavement.isAsphalt({ x, z, y: terrain.groundHeightAt(x, z) }));
    return groundPavement && (!atGradeOnly || !separated(x, z)) ? -distance : distance;
  };
  const result = {
    group,
    setVegetationSettings(settings: Readonly<TreeSettings & { showGrass: boolean }>) {
      setVegetationSettings(layers.vegetation, settings);
    },
    collisionMesh: undefined as TriangleMeshData | undefined,
    roadMesh: undefined as TriangleMeshData | undefined,
    structureMesh: undefined as TriangleMeshData | undefined,
    roadCrossSection: undefined as
      | ((position: Point, direction: Point) => RoadCrossSection | undefined)
      | undefined,
    setRoadDirtAttributes: undefined as ((geometries: THREE.BufferGeometry[]) => void) | undefined,
    stopSignGroup,
    isAsphalt: (position: { x: number; y?: number; z: number }) =>
      roadsVisible && (pavementSurface.isAsphalt(position) || raisedPavement.isAsphalt(position)),
    junctionCones,
    roadDistance,
    /** Unsigned distance to the nearest pavement edge, capped where roadside dirt ends. */
    pavementEdgeDistance: (x: number, z: number) =>
      edgeDistance(pavementEdges, x, z, pavementEdgeReach),
    roadCoverage(x: number, z: number) {
      return roadDistance(x, z, true) <= 0.25 ? 1 : 0;
    },
    setVisible(category: SceneryCategory, visible: boolean) {
      layers[category].visible = visible;
      if (category === 'nearbyRoads') {
        roadsVisible = visible;
        stopSignGroup.visible = visible;
      }
    },
  };
  const scenery = definition.scenery;
  if (!scenery) return result;
  const completeMap = scenery.bounds !== undefined;
  const query = terrain.physicsData();
  const bounds = {
    minX: query.minX,
    minZ: query.minZ,
    maxX: query.minX + (query.columns - 1) * query.spacing - 0.001,
    maxZ: query.minZ + (query.rows - 1) * query.spacing - 0.001,
  };
  // A complete map's course is only a route over its roads, so nothing yields to it.
  const courseSegments = completeMap ? [] : query.segments;
  const surface = new TerrainSurface(courseSegments, query.halfWidth, query.padRadius);
  const halfWidth = definition.width / 2 + (definition.shoulderWidth ?? courseShoulderWidth);
  const ground = (x: number, z: number) => terrain.groundHeightAt(x, z);
  const clearance = (x: number, z: number) =>
    definition.padRadius !== undefined
      ? Math.hypot(x, z) - definition.padRadius
      : surface.nearest(x, z).distance - halfWidth;
  const separated = (x: number, z: number) => Math.abs(terrain.heightAt(x, z) - ground(x, z)) > 3;
  const pavementClearance = (p: Point) => {
    if (separated(p.x, p.z)) return 100;
    const near = surface.nearest(p.x, p.z);
    // The course pavement ends square, so roads continuing past an open end must not lose a round cap.
    if (
      definition.closed === false &&
      (near.fraction <= 0 || near.fraction >= 1) &&
      Math.abs(near.across) < near.distance - 0.01
    )
      return 100;
    return near.distance - (definition.width / 2 - 0.5);
  };
  const addPavementEdge = (a: Point, b: Point) => {
    const da = pavementClearance(a),
      db = pavementClearance(b);
    if (da < 0 && db < 0) return;
    if (da < 0 !== db < 0) {
      const t = da / (da - db);
      const intersection = {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
      };
      if (da < 0) a = intersection;
      else b = intersection;
    }
    if (Math.hypot(a.x - b.x, a.z - b.z) < 0.001) return;
    const edge = {
      a,
      b,
      width: 0,
      minX: Math.min(a.x, b.x) - pavementEdgeReach,
      minZ: Math.min(a.z, b.z) - pavementEdgeReach,
      maxX: Math.max(a.x, b.x) + pavementEdgeReach,
      maxZ: Math.max(a.z, b.z) + pavementEdgeReach,
    };
    pavementEdges.add(edge);
    if (!separated((a.x + b.x) / 2, (a.z + b.z) / 2)) junctionEdges.add(edge);
  };
  junctionExpansion = (x, z) =>
    separated(x, z) ? 0 : junctionRoadFlare(surface.nearest(x, z).distance - definition.width / 2);
  const roadBlocked = (x: number, z: number) => clearance(x, z) < 0.8 && !separated(x, z);
  const selectedRoadCopy = (x: number, z: number, dx: number, dz: number, width: number) => {
    const near = surface.nearest(x, z);
    if (near.distance >= halfWidth + width / 2 + 0.8) return false;
    const selected =
      query.segments[
        Math.min(query.segments.length - 1, Math.floor(near.fraction * query.segments.length))
      ];
    if (!selected) return false;
    const sx = selected.b.x - selected.a.x,
      sz = selected.b.z - selected.a.z;
    return Math.abs(dx * sx + dz * sz) / Math.hypot(sx, sz) > 0.85;
  };
  const obstacles = new SpatialIndex<Polygon>();
  const centerlines = new SpatialIndex<RoadSegment>();
  const roads = new SpatialIndex<RoadSegment>();
  const buildingBatch = new Batch();
  const buildings = scenery.buildings;

  function buildBuildings() {
    const footprintGroups = new Map<
      string,
      { height: number; buildingType?: string; roofShape?: string; footprints: MultiPolygon }
    >();
    for (const building of buildings) {
      const shape = polygon(building.rings);
      // A cut-off building would expose its interior; omit footprints beyond supported terrain.
      if (
        !shape ||
        !Number.isFinite(building.height) ||
        shape.rings.some((ring) => ring.some(([x, z]) => !terrain.contains(x, z)))
      )
        continue;
      const height = THREE.MathUtils.clamp(building.height, 2, 150);
      const { buildingType, roofShape } = building;
      const key = JSON.stringify([height, buildingType, roofShape]);
      const entry = footprintGroups.get(key) ?? { height, buildingType, roofShape, footprints: [] };
      entry.footprints.push(shape.rings);
      footprintGroups.set(key, entry);
    }
    // Tile-clipped copies can overlap without having identical footprint signatures.
    const mergedBuildings = [...footprintGroups.values()].flatMap(
      ({ height, buildingType, roofShape, footprints }) =>
        polygonClipping
          .union(footprints)
          .map((rings) => ({ rings, height, buildingType, roofShape })),
    );
    for (const building of mergedBuildings) {
      const shape = polygon(building.rings);
      if (!shape) continue;
      // Mapped road widths are estimates; only a road driven through a footprint, or the course's
      // own pavement, removes it.
      if (
        centerlines
          .query(shape)
          .some(({ a, b, width }) => segmentEntersPolygon(a, b, shape, width / 2))
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
      const appearance = buildingAppearance({ ...building, rings: shape.rings });
      const wallHeight =
        THREE.MathUtils.clamp(building.height, 2, 150) *
        (appearance.pitched && appearance.roofStyle === 'a-frame' ? 0.25 : 1);
      const roof = base + wallHeight;
      const { wallColor, roofColor, column } = appearance;
      const floors = Math.max(1, Math.round(wallHeight / 3.2));
      const floorHeight = wallHeight / floors;
      for (const ring of rings)
        ring.forEach((a, i) => {
          const b = ring[(i + 1) % ring.length];
          const bottomA = { ...a, y: ground(a.x, a.z) - 0.15 };
          const bottomB = { ...b, y: ground(b.x, b.z) - 0.15 };
          const topA = { ...a, y: roof },
            topB = { ...b, y: roof };
          const uv = (u: number, y: number) => buildingUV(column, u, (y - base) / floorHeight);
          buildingBatch.triangle(bottomA, topA, topB, wallColor, [
            uv(0, bottomA.y),
            uv(0, roof),
            uv(1, roof),
          ]);
          buildingBatch.triangle(bottomA, topB, bottomB, wallColor, [
            uv(0, bottomA.y),
            uv(1, roof),
            uv(1, bottomB.y),
          ]);
        });
      const pitchedRoof = appearance.pitched
        ? buildingRoof(shape.rings[0], roof, appearance.roofStyle)
        : undefined;
      for (const [a, b, c] of pitchedRoof?.wallTriangles ?? []) {
        buildingBatch.triangle(
          a,
          b,
          c,
          wallColor,
          [a, b, c].map((p) =>
            buildingUV(
              buildingGableColumn(appearance.facade),
              (p.x - shape.minX) / Math.max(1, shape.maxX - shape.minX),
              (p.y - base) / floorHeight,
            ),
          ),
        );
      }
      const roofTint = pitchedRoof ? roofColor : new THREE.Color(0x85867f);
      const { points, triangles } = pitchedRoof ?? triangulate(shape);
      for (const [a, b, c] of triangles)
        buildingBatch.roof(
          { y: roof, ...points[a] },
          { y: roof, ...points[b] },
          { y: roof, ...points[c] },
          roofTint,
          [a, b, c].map((i) =>
            buildingUV(
              pitchedRoof ? buildingRoofColumn : buildingFlatRoofColumn,
              (points[i].x - shape.minX + 0.5) / (shape.maxX - shape.minX + 1),
              points[i].z / 4,
            ),
          ),
        );
    }
    if (buildingBatch.positions.length) {
      const surface = material(0xffffff, true);
      surface.map = createBuildingTexture();
      surface.side = THREE.DoubleSide;
      const mesh = addBatch(layers.buildings, buildingBatch, surface, 'building-shells')!;
      const positions = mesh.geometry.getAttribute('position').array as Float32Array;
      result.collisionMesh = {
        positions,
        indices: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i),
      };
    }
  }

  const waterBatch = new Batch();
  const buildWaterBodies = (pavement: MultiPolygon) => {
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
        if (
          depth < 18 &&
          Math.hypot(longest[0].x - longest[1].x, longest[0].z - longest[1].z) > 3
        ) {
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
      for (const rings of polygonClipping.difference([shape.rings], pavement)) {
        const visible = polygon(rings);
        if (!visible) continue;
        const { points, triangles } = triangulate(visible);
        for (const [a, b, c] of triangles) {
          const clipped = clipToBounds([points[a], points[b], points[c]], bounds);
          for (let i = 1; i + 1 < clipped.length; i++) emit(clipped[0], clipped[i], clipped[i + 1]);
        }
      }
    }
  };

  const roadBatch = new Batch(),
    groundRampBatch = new Batch(),
    approachPavementBatch = new Batch(),
    raisedBatch = new Batch(),
    roadbedBatch = new Batch(),
    markingBatch = new Batch(),
    centerlineBatch = new Batch(),
    directionBatch = new Batch(),
    stopLineBatch = new Batch(),
    medianBatch = new Batch(),
    medianReflectorBatch = new Batch(),
    abutmentBatch = new Batch(),
    riverBatch = new Batch();
  const tunnelCourse =
    completeMap && scenery.roads.some((road) => road.structure === 'tunnel')
      ? new TerrainSurface(query.segments, query.halfWidth)
      : undefined;
  const profiles = sceneryRoadProfiles(
    scenery.roads,
    ground,
    (x, z) => terrain.heightAt(x, z),
    (x, z) => surface.nearest(x, z).distance - halfWidth,
    selectedRoadCopy,
    completeMap,
    completeMap,
  ).filter(({ road, curve }) => {
    if (road.structure !== 'tunnel') return true;
    if (!tunnelCourse) return false;
    const point = curve.getPointAt(0.5);
    const near = tunnelCourse.nearest(point.x, point.z);
    return (
      near.distance < definition.width / 2 &&
      definition.structures?.some(
        ({ type, start, end }) =>
          type === 'tunnel' && near.fraction >= start && near.fraction <= end,
      )
    );
  });
  type RoadProfile = (typeof profiles)[number];
  const tunnelBatches = new Map<Batch, Batch>();
  const profileBatch = (batch: Batch, profile: RoadProfile) => {
    if (profile.road.structure !== 'tunnel') return batch;
    let tunnel = tunnelBatches.get(batch);
    if (!tunnel) tunnelBatches.set(batch, (tunnel = new Batch()));
    return tunnel;
  };
  const raisedPaintBatches = new Map<Batch, Batch>();
  const paintBatch = (batch: Batch, profile: RoadProfile) => {
    if (!profile.bridgeApproach && profile.road.structure !== 'bridge')
      return profileBatch(batch, profile);
    let raised = raisedPaintBatches.get(batch);
    if (!raised) raisedPaintBatches.set(batch, (raised = new Batch()));
    return raised;
  };
  type IndexedRoadSegment = RoadSegment & {
    profile: RoadProfile;
    profileIndex: number;
    distance: number;
  };
  type RoadIntersection = {
    point: Point;
    small: RoadProfile;
    large: RoadProfile;
    tangent: Point;
  };
  const roadSegments = new SpatialIndex<IndexedRoadSegment>();
  const profileIndices = new Map(profiles.map((profile, index) => [profile, index]));
  yield { message: 'Building nearby roads…', fraction: 0.02 };
  for (const [profileIndex, profile] of profiles.entries()) {
    for (let i = 1; i < profile.points.length; i++) {
      const [ax, az] = profile.points[i - 1];
      const [bx, bz] = profile.points[i];
      roadSegments.add({
        a: { x: ax, z: az },
        b: { x: bx, z: bz },
        width: profile.road.width,
        minX: Math.min(ax, bx),
        minZ: Math.min(az, bz),
        maxX: Math.max(ax, bx),
        maxZ: Math.max(az, bz),
        profile,
        profileIndex,
        distance: profile.curve.distances[i - 1],
      });
    }
  }
  result.roadCrossSection = (position, direction) => {
    const reach = definition.width / 2;
    let distance = reach;
    let section: RoadCrossSection | undefined;
    for (const { a, b, profile, distance: along } of roadSegments.query({
      minX: position.x - reach,
      maxX: position.x + reach,
      minZ: position.z - reach,
      maxZ: position.z + reach,
    })) {
      if (profile.raised) continue;
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const dot = dx * direction.x + dz * direction.z;
      if (!length || Math.abs(dot) / length < 0.85) continue;
      // Intersect the mapped centerline with the timing plane, not a different lap distance.
      const t = ((position.x - a.x) * direction.x + (position.z - a.z) * direction.z) / dot;
      if (t < 0 || t > 1) continue;
      const point = { x: a.x + dx * t, z: a.z + dz * t };
      const offset = Math.hypot(point.x - position.x, point.z - position.z);
      if (offset >= distance) continue;
      distance = offset;
      const sign = dot < 0 ? -1 : 1;
      section = {
        position: point,
        tangent: { x: (sign * dx) / length, z: (sign * dz) / length },
        width: roadWidthAt(profile, along + t * length),
      };
    }
    return section;
  };
  const roadPriority: Record<string, number> = {
    motorway: 6,
    trunk: 5,
    primary: 4,
    secondary: 3,
    tertiary: 2,
    minor: 1,
  };
  const lowerPriorityRoad = (a: RoadProfile, b: RoadProfile) => {
    if (a.road.width !== b.road.width) return a.road.width < b.road.width ? a : b;
    const aRank = roadPriority[a.road.roadClass ?? ''] ?? 0;
    const bRank = roadPriority[b.road.roadClass ?? ''] ?? 0;
    return aRank === bRank ? undefined : aRank < bRank ? a : b;
  };
  const intersections: RoadIntersection[] = [];
  const seenIntersections = new Set<string>();
  const crossing = (a: Point, b: Point, c: Point, d: Point) => {
    const abx = b.x - a.x,
      abz = b.z - a.z,
      cdx = d.x - c.x,
      cdz = d.z - c.z;
    const denominator = abx * cdz - abz * cdx;
    if (Math.abs(denominator) < 1e-8) return;
    const acx = c.x - a.x,
      acz = c.z - a.z;
    const t = (acx * cdz - acz * cdx) / denominator;
    const u = (acx * abz - acz * abx) / denominator;
    if (t < 0 || t > 1 || u < 0 || u > 1) return;
    return {
      point: { x: a.x + t * abx, z: a.z + t * abz },
      tangent: { x: abx, z: abz },
    };
  };
  for (const segment of roadSegments.query(bounds)) {
    for (const other of roadSegments.query(segment)) {
      if (
        segment.profile === other.profile ||
        segment.profileIndex >= other.profileIndex ||
        segment.profile.road.structure ||
        other.profile.road.structure ||
        (segment.profile.road.layer ?? 0) !== (other.profile.road.layer ?? 0)
      )
        continue;
      const hit = crossing(segment.a, segment.b, other.a, other.b);
      if (!hit || !terrain.contains(hit.point.x, hit.point.z)) continue;
      const segmentHeight = segment.profile.raised
        ? segment.profile.heightAt(hit.point.x, hit.point.z)
        : ground(hit.point.x, hit.point.z) + 0.035;
      const otherHeight = other.profile.raised
        ? other.profile.heightAt(hit.point.x, hit.point.z)
        : ground(hit.point.x, hit.point.z) + 0.035;
      if (Math.abs(segmentHeight - otherHeight) > 2.5) continue;
      const small = lowerPriorityRoad(segment.profile, other.profile) ?? segment.profile;
      const large = small === segment.profile ? other.profile : segment.profile;
      const smallSegment = small === segment.profile ? segment : other;
      const smallTangent = new THREE.Vector2(
        smallSegment.b.x - smallSegment.a.x,
        smallSegment.b.z - smallSegment.a.z,
      ).normalize();
      const key = `${profileIndices.get(small)}:${Math.round(hit.point.x * 2)}:${Math.round(hit.point.z * 2)}`;
      if (seenIntersections.has(key)) continue;
      seenIntersections.add(key);
      intersections.push({
        point: hit.point,
        small,
        large,
        tangent: { x: smallTangent.x, z: smallTangent.y },
      });
    }
  }
  const junctionsByRoad = new Map<RoadProfile, RoadIntersection[]>();
  for (const intersection of intersections) {
    for (const profile of [intersection.small, intersection.large]) {
      const junctions = junctionsByRoad.get(profile) ?? [];
      junctions.push(intersection);
      junctionsByRoad.set(profile, junctions);
    }
  }
  const junctionExpansionSamples = new Map<RoadProfile, Float32Array[]>();
  const expansionSamplesFor = (profile: RoadProfile) => {
    let samples = junctionExpansionSamples.get(profile);
    if (samples) return samples;
    const junctions = junctionsByRoad.get(profile) ?? [];
    samples = [];
    for (let i = 1; i < profile.points.length; i++) {
      const [ax, az] = profile.points[i - 1];
      const [bx, bz] = profile.points[i];
      const dx = bx - ax;
      const dz = bz - az;
      const length = Math.hypot(dx, dz);
      const steps = Math.min(8192, Math.ceil(length / 2));
      const segmentSamples = new Float32Array(steps + 1);
      for (let j = 0; j <= steps; j++) {
        const t = (length * j) / steps;
        const x = ax + (dx * t) / length;
        const z = az + (dz * t) / length;
        let branchExpansion = 0;
        for (const junction of junctions)
          branchExpansion = Math.max(
            branchExpansion,
            junctionRoadFlare(
              Math.max(
                0,
                Math.hypot(x - junction.point.x, z - junction.point.z) -
                  Math.min(
                    20,
                    (junction.small === profile ? junction.large : junction.small).road.width,
                  ) /
                    2,
              ),
            ),
          );
        segmentSamples[j] = Math.max(junctionExpansion(x, z), branchExpansion);
      }
      samples.push(segmentSamples);
    }
    junctionExpansionSamples.set(profile, samples);
    return samples;
  };
  if (scenery.stopSigns?.length) {
    const createStopSign = createStopSignFactory();
    for (const control of scenery.stopSigns) {
      const [x, z] = control.point;
      if (!terrain.contains(x, z)) continue;
      if (scenery.parking?.some(({ rings }) => inside(x, z, polygon(rings)!))) continue;
      const [inboundX, inboundZ] = control.direction;
      const rightX = -inboundZ;
      const rightZ = inboundX;
      const halfWidth = Math.min(20, control.width) / 2;
      const signX = x + rightX * (halfWidth + 1.1);
      const signZ = z + rightZ * (halfWidth + 1.1);
      const y = ground(x, z) + 0.06;
      const left = control.oneway ? -halfWidth : 0;
      const a = { x: x + rightX * left, y, z: z + rightZ * left };
      const b = { x: x + rightX * halfWidth, y, z: z + rightZ * halfWidth };
      const lineDepth = 0.45;
      const c = {
        x: a.x + inboundX * lineDepth,
        y,
        z: a.z + inboundZ * lineDepth,
      };
      const d = {
        x: b.x + inboundX * lineDepth,
        y,
        z: b.z + inboundZ * lineDepth,
      };
      stopLineBatch.roof(a, b, c);
      stopLineBatch.roof(b, d, c);
      if (!terrain.contains(signX, signZ)) continue;
      const sign = createStopSign();
      sign.position.set(signX, ground(signX, signZ), signZ);
      sign.rotation.y = Math.atan2(-inboundX, -inboundZ);
      stopSignGroup.add(sign);
    }
  }
  if (stopSignGroup.children.length) layers.nearbyRoads.add(stopSignGroup);
  const roadPaths = profiles.map(({ road }) => road);
  type RoadEnd = { point: SceneryPoint; width: number };
  const findRoadEnd = (profile: RoadProfile, end: boolean): RoadEnd | undefined => {
    const { road, points } = profile;
    const p = end ? points.at(-1)! : points[0];
    const height = profile.raised ? profile.heightAt(...p) : ground(...p);
    const neighbors = profiles.flatMap((other) =>
      other.road === road
        ? []
        : [false, true].flatMap((last) => {
            const q = last ? other.points.at(-1)! : other.points[0];
            return Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.1 &&
              Math.abs(height - (other.raised ? other.heightAt(...q) : ground(...q))) < 0.5
              ? [
                  {
                    point: last ? other.points.at(-2)! : other.points[1],
                    width: THREE.MathUtils.clamp(
                      road.structure === 'bridge'
                        ? road.width
                        : other.road.structure === 'bridge'
                          ? other.road.width
                          : profile.bridgeApproach && !other.bridgeApproach
                            ? other.road.width
                            : other.bridgeApproach && !profile.bridgeApproach
                              ? road.width
                              : (road.width + other.road.width) / 2,
                      0.6,
                      20,
                    ),
                  },
                ]
              : [];
          }),
    );
    if (neighbors.length === 1) return neighbors[0];
    const inside = end ? points.at(-2)! : points[1];
    const dx = p[0] - inside[0],
      dz = p[1] - inside[1];
    const length = Math.hypot(dx, dz);
    const aligned = neighbors
      .map((neighbor) => ({
        ...neighbor,
        alignment:
          ((neighbor.point[0] - p[0]) * dx + (neighbor.point[1] - p[1]) * dz) /
          (Math.hypot(neighbor.point[0] - p[0], neighbor.point[1] - p[1]) * length),
      }))
      .filter(({ alignment }) => alignment > 0.85)
      .sort((a, b) => b.alignment - a.alignment);
    return aligned[0];
  };
  const roadEnds = new Map<RoadProfile, (RoadEnd | undefined)[]>();
  const roadCrossSections = new Map<RoadProfile, { widths: number[]; offsets: THREE.Vector2[] }>();
  const roadEnd = (profile: RoadProfile, last: boolean) => {
    let ends = roadEnds.get(profile);
    if (!ends) {
      ends = [findRoadEnd(profile, false), findRoadEnd(profile, true)];
      roadEnds.set(profile, ends);
    }
    return ends[last ? 1 : 0];
  };
  const roadWidthAt = (profile: RoadProfile, distance: number) => {
    const sections = roadCrossSections.get(profile);
    if (sections) {
      const { i, t } = profile.curve.segment(distance / profile.curve.getLength());
      return THREE.MathUtils.lerp(sections.widths[i - 1], sections.widths[i], t);
    }
    const width = THREE.MathUtils.clamp(profile.road.width, 0.6, 20);
    const total = profile.curve.getLength();
    const start = roadEnd(profile, false)?.width ?? width;
    const end = roadEnd(profile, true)?.width ?? width;
    const reach = Math.min(
      profile.bridgeApproach ? 40 : nearbyRoadTaperLength,
      start !== width && end !== width ? total / 2 : total,
    );
    return (
      width +
      (start - width) * (1 - THREE.MathUtils.smoothstep(distance, 0, reach)) +
      (end - width) * (1 - THREE.MathUtils.smoothstep(total - distance, 0, reach))
    );
  };
  const mouths: (Point & { width: number })[] = [];
  function ribbon(
    points: SceneryPoint[],
    rawWidth: number,
    batch: Batch,
    river: boolean,
    conesOnly = false,
    ends: (RoadEnd | undefined)[] = [],
    profile?: (typeof profiles)[number],
  ) {
    const elevation = profile?.raised ? profile.heightAt : undefined;
    if (!Number.isFinite(rawWidth)) return;
    const width = THREE.MathUtils.clamp(rawWidth, 0.6, river ? 40 : 20);
    const usesProfilePoints = profile !== undefined && points === profile.points;
    points = points.filter(
      (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) >= 0.01,
    );
    if (points.length < 2) return;
    const cachedExpansion =
      usesProfilePoints && !completeMap && points.length === profile.points.length
        ? expansionSamplesFor(profile)
        : undefined;
    const closed =
      points.length > 2 &&
      Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]) < 0.01;
    const widths = points.map((_, i) => {
      if (usesProfilePoints) return roadWidthAt(profile, profile.curve.distances[i]);
      const end = i === 0 ? ends[0] : i === points.length - 1 ? ends[1] : undefined;
      return end ? end.width : width;
    });
    const offsets = points.map(([x, z], i) => {
      const before = points[i - 1] ?? (closed ? points.at(-2)! : (ends[0]?.point ?? points[i]));
      const after = points[i + 1] ?? (closed ? points[1] : (ends[1]?.point ?? points[i]));
      const localWidth = widths[i];
      const incoming = new THREE.Vector2(x - before[0], z - before[1]).normalize();
      const outgoing = new THREE.Vector2(after[0] - x, after[1] - z).normalize();
      if (incoming.lengthSq() === 0) incoming.copy(outgoing);
      if (outgoing.lengthSq() === 0) outgoing.copy(incoming);
      const normal = new THREE.Vector2(-outgoing.y, outgoing.x);
      const miter = new THREE.Vector2(-incoming.y, incoming.x).add(normal).normalize();
      const denominator = miter.dot(normal);
      // Share a bounded cross-section at each bend instead of overlapping disconnected quads.
      if (denominator < 0.001) return normal.multiplyScalar(localWidth / 2);
      return miter.multiplyScalar(Math.min(localWidth / 2 / denominator, localWidth));
    });
    if (usesProfilePoints && points.length === profile.points.length)
      roadCrossSections.set(profile, { widths, offsets });
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
      const margin = Math.max(widths[i - 1], widths[i]) / 2 + junctionRoadFlare(0) + 3;
      const segment = {
        a,
        b,
        width,
        widthA: widths[i - 1],
        widthB: widths[i],
        minX: Math.min(ax, bx) - margin,
        minZ: Math.min(az, bz) - margin,
        maxX: Math.max(ax, bx) + margin,
        maxZ: Math.max(az, bz) + margin,
      };
      const atGrade = (x: number, z: number) =>
        !elevation ||
        (profile?.bridgeApproach &&
          Math.abs(elevation(x, z) - ground(x, z) - nearbyRoadLift) < 1e-5) ||
        (clearance(x, z) < width / 2 + 7 &&
          (!profile?.bridgeApproach || Math.abs(elevation(x, z) - terrain.heightAt(x, z)) < 3) &&
          profile?.road.structure !== 'bridge');
      if (!conesOnly && profile?.road.structure !== 'bridge') {
        // Waterway capsules share the same exclusion index as nearby roads.
        roads.add(river ? { ...segment, width: width + 2 } : segment);
      }
      const steps = Math.min(8192, Math.ceil(length / 2));
      let outlineBatch: Batch | undefined;
      let left: SceneryPoint[] = [],
        right: SceneryPoint[] = [];
      const finishOutline = () => {
        if (outlineBatch && left.length > 1) {
          outlineBatch.outlines ??= [];
          const outline = [[...left, ...right.reverse()]];
          outlineBatch.outlines.push(outline);
          if (
            (profile?.bridgeApproach || profile?.road.structure === 'bridge') &&
            outlineBatch !== roadBatch
          ) {
            approachPavementBatch.outlines ??= [];
            approachPavementBatch.outlines.push(outline);
          }
        }
        left = [];
        right = [];
        outlineBatch = undefined;
      };
      const side = (t: number, offset: number): Vertex => ({
        x: ax + dx * t - dz * offset,
        z: az + dz * t + dx * offset,
        y: elevation?.(ax + dx * t - dz * offset, az + dz * t + dx * offset) ?? 0,
      });
      const edge = (t: number, sign: number): Vertex => {
        const fraction = t / length;
        const offset = offsets[i - 1].clone().lerp(offsets[i], fraction);
        const point = {
          x: ax + dx * t + offset.x * sign,
          z: az + dz * t + offset.y * sign,
          y: 0,
        };
        // Complete maps union their pavement, so junction corners come from the mapped geometry.
        if (!river && !completeMap && atGrade(point.x, point.z)) {
          const centerX = ax + dx * t;
          const centerZ = az + dz * t;
          const sampleIndex = Math.round((t / length) * steps);
          const expansion =
            cachedExpansion?.[i - 1]?.[sampleIndex] ??
            Math.max(
              junctionExpansion(centerX, centerZ),
              (profile && junctionsByRoad.get(profile))?.reduce(
                (maximum, junction) =>
                  Math.max(
                    maximum,
                    junctionRoadFlare(
                      Math.max(
                        0,
                        Math.hypot(centerX - junction.point.x, centerZ - junction.point.z) -
                          Math.min(20, junction.large.road.width) / 2,
                      ),
                    ),
                  ),
                0,
              ) ?? 0,
            );
          const normal = offset
            .clone()
            .normalize()
            .multiplyScalar(expansion * sign);
          point.x += normal.x;
          point.z += normal.y;
        }
        if (elevation) point.y = elevation(point.x, point.z);
        return point;
      };
      for (let j = 0; j < steps; j++) {
        const t0 = (length * j) / steps;
        const center = side((length * (j + 0.5)) / steps, 0);
        const elevated = elevation && !atGrade(center.x, center.z);
        const distance = clearance(center.x, center.z);
        if (elevated || separated(center.x, center.z)) connected = false;
        if (!river && !elevated && !separated(center.x, center.z) && !completeMap) {
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
        const geometrySteps = river ? 8 : 1;
        if (j % geometrySteps !== 0) continue;
        const geometryEnd = (length * Math.min(j + geometrySteps, steps)) / steps;
        const corners = [edge(t0, -1), edge(t0, 1), edge(geometryEnd, -1), edge(geometryEnd, 1)];
        const distanceAlong = profile
          ? THREE.MathUtils.lerp(
              profile.curve.distances[i - 1],
              profile.curve.distances[i],
              (j + 0.5) / steps,
            )
          : 0;
        const target =
          elevation && !elevated
            ? roadBatch
            : profile?.bridgeApproach && profile.groundBlendAt(distanceAlong) < 1
              ? groundRampBatch
              : batch;
        if (river && [...corners, center].some((p) => roadBlocked(p.x, p.z))) continue;
        if (!river && !elevated) {
          for (const [a, b] of [
            [corners[0], corners[2]],
            [corners[1], corners[3]],
          ]) {
            addPavementEdge(a, b);
          }
          if (!closed && i === 1 && j === 0 && !ends[0]) addPavementEdge(corners[0], corners[1]);
          if (!closed && i === points.length - 1 && j === steps - 1 && !ends[1])
            addPavementEdge(corners[2], corners[3]);
        }
        if (!river) {
          if (outlineBatch !== target) finishOutline();
          outlineBatch = target;
          if (!left.length) {
            left.push([corners[0].x, corners[0].z]);
            right.push([corners[1].x, corners[1].z]);
          }
          left.push([corners[2].x, corners[2].z]);
          right.push([corners[3].x, corners[3].z]);
        }
        const vertices = elevation && !elevated ? corners.map((p) => ({ ...p, y: 0 })) : corners;
        // Edge-only vertices would interpolate the dirt mask across the entire approach.
        const columns = profile?.bridgeApproach && elevated ? Math.ceil(width / 2) : 1;
        const across = (a: Vertex, b: Vertex, t: number, lift = 0): Vertex => ({
          x: THREE.MathUtils.lerp(a.x, b.x, t),
          y: THREE.MathUtils.lerp(a.y, b.y, t) + lift,
          z: THREE.MathUtils.lerp(a.z, b.z, t),
        });
        let a = vertices[0],
          b = vertices[2];
        for (let column = 1; column <= columns; column++) {
          const c = across(vertices[0], vertices[1], column / columns);
          const d = across(vertices[2], vertices[3], column / columns);
          if (elevation && columns > 1) {
            c.y = elevation(c.x, c.z);
            d.y = elevation(d.x, d.z);
          }
          target.roof(a, c, b);
          target.roof(c, d, b);
          a = c;
          b = d;
        }
        if (elevated && profile) {
          if (
            profile.road.structure !== 'bridge' &&
            Math.abs(center.y - ground(center.x, center.z)) < 2
          ) {
            addPavementEdge(corners[0], corners[2]);
            addPavementEdge(corners[1], corners[3]);
          }
          if (profile.road.structure !== 'bridge') {
            for (const side of [0, 1]) {
              const a = corners[side],
                b = corners[side + 2];
              const toe = (p: Vertex, other: Vertex): Vertex => {
                const out = new THREE.Vector2(p.x - other.x, p.z - other.z).normalize();
                const height = Math.max(0, p.y - ground(p.x, p.z));
                const run = THREE.MathUtils.clamp(height * 1.5, 2, 12);
                const x = p.x + out.x * run,
                  z = p.z + out.y * run;
                return { x, z, y: Math.min(p.y - 0.06, ground(x, z) - 0.06) };
              };
              const c = toe(a, corners[1 - side]);
              const d = toe(b, corners[3 - side]);
              if ([a, b, c, d].some((p) => !terrain.contains(p.x, p.z) || clearance(p.x, p.z) < 2))
                continue;
              const topA = { ...a, y: a.y - 0.03 },
                topB = { ...b, y: b.y - 0.03 };
              roadbedBatch.roof(topA, c, topB);
              roadbedBatch.roof(c, d, topB);
              for (const [atEnd, top, toe] of [
                [i === 1 && j === 0, topA, c],
                [i === points.length - 1 && j === steps - 1, topB, d],
              ] as const) {
                if (!atEnd) continue;
                const endpoint = i === 1 && j === 0 ? points[0] : points.at(-1)!;
                const meetsBridge = roadPaths.some(
                  (road) =>
                    road.structure === 'bridge' &&
                    [road.points[0], road.points.at(-1)!].some(
                      (p) => Math.hypot(p[0] - endpoint[0], p[1] - endpoint[1]) < 0.1,
                    ),
                );
                if (!meetsBridge) continue;
                // Close the exposed end of the sloped roadbed beside the narrower abutment.
                const foot = { ...top, y: ground(top.x, top.z) - 0.5 };
                roadbedBatch.triangle(top, toe, foot);
              }
            }
          }
        }
      }
      finishOutline();
    }
  }
  // Traverse both ways so a branch saved from its outer end still gets a mouth barrier.
  const structurePositions: number[] = [];
  const structureIndices: number[] = [];
  const appendStructure = (data: TriangleMeshData) => {
    const offset = structurePositions.length / 3;
    for (const value of data.positions) structurePositions.push(value);
    for (const index of data.indices) structureIndices.push(index + offset);
  };
  const bridgeGroups = sceneryBridgeGroups(profiles.filter((profile) => !profile.selected));
  const sharedBridgeProfiles = new Set(
    bridgeGroups.filter(({ members }) => members.length > 1).flatMap(({ members }) => members),
  );
  for (const profile of profiles) {
    const { road } = profile;
    // Ground copies merge into the course pavement; a copied structure would duplicate the course's deck.
    if (profile.selected && road.structure) continue;
    if (profile.raised) {
      const ends = [roadEnd(profile, false), roadEnd(profile, true)];
      ribbon(profile.points, road.width, raisedBatch, false, false, ends, profile);
      ribbon([...profile.points].reverse(), road.width, raisedBatch, false, true, [], profile);
      if (road.structure === 'bridge') {
        const data = buildBridgeGeometry(
          {
            ...definition,
            flat: false,
            terrain: undefined,
            points: road.points,
            width: Math.min(20, road.width),
            shoulderWidth: 0,
            structures: [{ type: 'bridge', start: 0, end: 1 }],
          },
          (x, z) => profile.heightAt(x, z) - nearbyRoadLift,
          ground,
          (source, lift) => {
            const geometry = source.clone();
            const positions = geometry.getAttribute('position');
            for (let i = 0; i < positions.count; i++)
              positions.setY(
                i,
                profile.heightAt(positions.getX(i), positions.getZ(i)) - nearbyRoadLift + lift,
              );
            return geometry;
          },
          {
            route: profile.curve,
            allowPier: (x, z) => surface.nearest(x, z).distance > halfWidth + 4,
            parts: sharedBridgeProfiles.has(profile) ? 'deck' : undefined,
          },
        );
        if (data) {
          layers.nearbyRoads.add(createBridgeMeshes(data));
          appendStructure({
            positions: data.positions,
            indices: data.collisionIndices,
          });
        }
        for (const end of [0, 1]) {
          const center = profile.curve.getPointAt(end);
          const tangent = profile.curve.getTangentAt(end);
          const vertices = [-1, 1].map((side) => {
            const width = Math.min(20, road.width) / 2 + 0.4;
            const x = center.x + tangent.z * side * width;
            const z = center.z - tangent.x * side * width;
            return { x, z, y: profile.heightAt(x, z) - 0.03 };
          });
          if (vertices.some((p) => !terrain.contains(p.x, p.z) || clearance(p.x, p.z) < 2))
            continue;
          const [a, b] = vertices;
          const c = { ...a, y: ground(a.x, a.z) - 0.5 };
          const d = { ...b, y: ground(b.x, b.z) - 0.5 };
          abutmentBatch.triangle(a, b, c);
          abutmentBatch.triangle(b, d, c);
        }
      }
      continue;
    }
    const points = profile.points;
    const ends = [roadEnd(profile, false), roadEnd(profile, true)];
    const batch = profileBatch(roadBatch, profile);
    ribbon(points, road.width, batch, false, false, ends, profile);
    ribbon([...points].reverse(), road.width, batch, false, true, [], profile);
  }
  for (const { members, curve, width, heightAt } of bridgeGroups) {
    if (members.length < 2) continue;
    const data = buildBridgeGeometry(
      {
        ...definition,
        flat: false,
        width,
        shoulderWidth: 0,
        structures: [{ type: 'bridge', start: 0, end: 1 }],
      },
      (x, z) => heightAt(x, z) - nearbyRoadLift,
      ground,
      (source) => source.clone(),
      {
        route: curve,
        parts: 'substructure',
        allowPier: (x, z) => surface.nearest(x, z).distance > halfWidth + 4,
      },
    );
    if (data) {
      layers.nearbyRoads.add(createBridgeMeshes(data));
      appendStructure({
        positions: data.positions,
        indices: data.collisionIndices,
      });
    }
  }
  const medianBaseWidth = highwayMedianProfile.at(-1)![0] - highwayMedianProfile[0][0];
  const medianCaps = THREE.ShapeUtils.triangulateShape(
    highwayMedianProfile.map(([x, y]) => new THREE.Vector2(x, y)),
    [],
  );
  const medianEnds: {
    section: Vertex[];
    reverse: boolean;
    road: RoadProfile['road'];
    joined?: boolean;
  }[] = [];
  const medianSections: {
    start: Vertex[];
    end: Vertex[];
    tangent: Point;
    reflector: boolean;
  }[] = [];
  const shoulderHeight = highwayMedianProfile[5][1];
  const topHeight = highwayMedianProfile[4][1];
  yield { message: 'Building nearby roads…', fraction: 0.06 };
  for (const [profileIndex, profile] of profiles.entries()) {
    const { road, curve } = profile;
    if (
      road.structure ||
      profile.bridgeApproach ||
      !['motorway', 'trunk'].includes(road.roadClass ?? '')
    )
      continue;
    const length = curve.getLength();
    let previous: { distance: number; end: Vertex[] } | undefined;
    for (let distance = 2; distance < length - 2; distance += 2) {
      const center = curve.getPointAt(distance / length);
      const tangent = curve.getTangentAt(distance / length);
      const width = roadWidthAt(profile, distance);
      let medianX = center.x,
        medianZ = center.z,
        oppositeX = center.x,
        oppositeZ = center.z,
        medianWidth = 0;
      if (road.oneway) {
        let closest = Infinity;
        for (const segment of roadSegments.query({
          minX: center.x - 30,
          maxX: center.x + 30,
          minZ: center.z - 30,
          maxZ: center.z + 30,
        })) {
          const other = segment.profile;
          if (
            other === profile ||
            other.road.structure ||
            other.bridgeApproach ||
            !other.road.oneway ||
            other.road.roadClass !== road.roadClass ||
            (other.road.layer ?? 0) !== (road.layer ?? 0)
          )
            continue;
          const dx = segment.b.x - segment.a.x,
            dz = segment.b.z - segment.a.z;
          const size = Math.hypot(dx, dz);
          if (!size) continue;
          if (((tangent.x * dx + tangent.z * dz) / size) * road.oneway * other.road.oneway > -0.95)
            continue;
          const t = THREE.MathUtils.clamp(
            ((center.x - segment.a.x) * dx + (center.z - segment.a.z) * dz) / (size * size),
            0,
            1,
          );
          const x = segment.a.x + dx * t,
            z = segment.a.z + dz * t;
          const separation = Math.hypot(x - center.x, z - center.z);
          const otherWidth = roadWidthAt(other, segment.distance + t * size);
          const gap = separation - (width + otherWidth) / 2;
          if (gap < 0.6 || gap > 12 || separation >= closest) continue;
          const acrossX = x - center.x,
            acrossZ = z - center.z;
          const interveningRoad = roadSegments
            .query({
              minX: Math.min(center.x, x),
              maxX: Math.max(center.x, x),
              minZ: Math.min(center.z, z),
              maxZ: Math.max(center.z, z),
            })
            .some((segment) => {
              if (
                segment.profile === profile ||
                segment.profile === other ||
                segment.profile.road.structure ||
                (segment.profile.road.layer ?? 0) !== (road.layer ?? 0)
              )
                return false;
              const dx = segment.b.x - segment.a.x,
                dz = segment.b.z - segment.a.z;
              const denominator = acrossX * dz - acrossZ * dx;
              if (Math.abs(denominator) < 1e-8) return false;
              const ax = segment.a.x - center.x,
                az = segment.a.z - center.z;
              const across = (ax * dz - az * dx) / denominator;
              const along = (ax * acrossZ - az * acrossX) / denominator;
              return across > 0 && across < 1 && along >= 0 && along <= 1;
            });
          if (interveningRoad) continue;
          closest = separation;
          if (profileIndex > segment.profileIndex) {
            medianWidth = 0;
            continue;
          }
          const offset = (width / 2 + gap / 2) / separation;
          medianX = center.x + (x - center.x) * offset;
          medianZ = center.z + (z - center.z) * offset;
          oppositeX = x;
          oppositeZ = z;
          medianWidth = Math.min(3, gap - 0.3);
        }
      }
      if (!medianWidth) continue;
      const crossingRoad = roadSegments
        .query({
          minX: medianX - 20,
          maxX: medianX + 20,
          minZ: medianZ - 20,
          maxZ: medianZ + 20,
        })
        .some((segment) => {
          if (
            segment.profile === profile ||
            segment.profile.road.structure ||
            (segment.profile.road.layer ?? 0) !== (road.layer ?? 0)
          )
            return false;
          const dx = segment.b.x - segment.a.x,
            dz = segment.b.z - segment.a.z;
          const size = Math.hypot(dx, dz);
          if (!size || Math.abs((tangent.x * dx + tangent.z * dz) / size) > 0.85) return false;
          return segmentDistance(medianX, medianZ, segment.a, segment.b) < segment.width / 2 + 5;
        });
      if (crossingRoad || !terrain.contains(medianX, medianZ)) continue;
      const scale = Math.min(1, medianWidth / medianBaseWidth);
      const section = (along: number) => {
        const point = curve.getPointAt((distance + along) / length);
        const direction = curve.getTangentAt((distance + along) / length);
        const x = point.x + medianX - center.x,
          z = point.z + medianZ - center.z;
        const base =
          (ground(point.x, point.z) +
            ground(point.x + oppositeX - center.x, point.z + oppositeZ - center.z)) /
            2 +
          nearbyRoadLift;
        return highwayMedianProfile.map(([offset, height]) => ({
          x: x + direction.z * offset * scale,
          z: z - direction.x * offset * scale,
          y: base + height,
        }));
      };
      const start = previous?.distance === distance - 2 ? previous.end : section(-1);
      const end = section(1);
      if ([...start, ...end].some((p) => !terrain.contains(p.x, p.z))) continue;
      if (previous?.distance !== distance - 2) {
        if (previous) medianEnds.push({ section: previous.end, reverse: false, road });
        medianEnds.push({ section: start, reverse: true, road });
      }
      medianSections.push({
        start,
        end,
        tangent,
        reflector: distance % 12 === 2,
      });
      previous = { distance, end };
    }
    if (previous) medianEnds.push({ section: previous.end, reverse: false, road });
  }
  const endCenter = (section: Vertex[]) => ({
    x: (section[0].x + section.at(-1)!.x) / 2,
    y: (section[0].y + section.at(-1)!.y) / 2,
    z: (section[0].z + section.at(-1)!.z) / 2,
  });
  // Width/class fragments can hand median ownership to the opposite carriageway.
  for (const a of medianEnds) {
    if (a.joined) continue;
    const center = endCenter(a.section);
    const direction = new THREE.Vector2(
      a.section[0].z - a.section.at(-1)!.z,
      a.section.at(-1)!.x - a.section[0].x,
    )
      .normalize()
      .multiplyScalar(a.reverse ? -1 : 1);
    let closest = 4;
    let match: (typeof medianEnds)[number] | undefined;
    for (const b of medianEnds) {
      if (
        b === a ||
        b.joined ||
        b.road === a.road ||
        b.road.roadClass !== a.road.roadClass ||
        (b.road.layer ?? 0) !== (a.road.layer ?? 0)
      )
        continue;
      const other = endCenter(b.section);
      const distance = Math.hypot(center.x - other.x, center.z - other.z);
      if (distance >= closest || Math.abs(center.y - other.y) > 1) continue;
      const facing = new THREE.Vector2(
        b.section[0].z - b.section.at(-1)!.z,
        b.section.at(-1)!.x - b.section[0].x,
      )
        .normalize()
        .multiplyScalar(b.reverse ? -1 : 1);
      if (direction.dot(facing) > -0.95) continue;
      closest = distance;
      match = b;
    }
    if (!match) continue;
    for (let i = 0; i < a.section.length; i++) {
      const p = a.section[i];
      const q = match.section[a.reverse === match.reverse ? a.section.length - 1 - i : i];
      const shared = {
        x: (p.x + q.x) / 2,
        y: (p.y + q.y) / 2,
        z: (p.z + q.z) / 2,
      };
      Object.assign(p, shared);
      Object.assign(q, shared);
    }
    a.joined = match.joined = true;
  }
  for (const { section, reverse, joined } of medianEnds) {
    if (joined) continue;
    for (const [a, b, c] of medianCaps)
      if (reverse) medianBatch.triangle(section[a], section[c], section[b]);
      else medianBatch.triangle(section[a], section[b], section[c]);
  }
  for (const { start, end, tangent, reflector } of medianSections) {
    for (let i = 0; i < start.length; i++) {
      const j = (i + 1) % start.length;
      medianBatch.triangle(start[i], end[i], start[j]);
      medianBatch.triangle(start[j], end[i], end[j]);
    }
    if (reflector) {
      for (const side of [-1, 1]) {
        const vertices = [-0.06, 0.06].flatMap((along) =>
          [topHeight - 0.21, topHeight - 0.13].map((height) => {
            const lower = side < 0 ? 2 : 5,
              upper = side < 0 ? 3 : 4;
            const at = (section: Vertex[]) => {
              const a = section[lower],
                b = section[upper];
              return new THREE.Vector3(a.x, a.y, a.z).lerp(
                new THREE.Vector3(b.x, b.y, b.z),
                (height - shoulderHeight) / (topHeight - shoulderHeight),
              );
            };
            return at(start)
              .lerp(at(end), (along + 1) / 2)
              .add(new THREE.Vector3(tangent.z, 0, -tangent.x).multiplyScalar(side * 0.005));
          }),
        );
        medianReflectorBatch.triangle(vertices[0], vertices[1], vertices[2]);
        medianReflectorBatch.triangle(vertices[1], vertices[3], vertices[2]);
      }
    }
  }
  const paintRoadStrip = (
    profile: RoadProfile,
    batch: Batch,
    distance: number,
    lateral: number | ((distance: number) => number),
    length: number,
    width: number,
  ) => {
    const total = profile.curve.getLength();
    const centerAt = (at: number) =>
      profile.curve.getPointAt(THREE.MathUtils.clamp(at / total, 0, 1));
    const normalAt = (at: number) => {
      const sections = roadCrossSections.get(profile);
      if (sections) {
        const { i, t } = profile.curve.segment(at / total);
        return sections.offsets[i - 1]
          .clone()
          .lerp(sections.offsets[i], t)
          .multiplyScalar(2 / roadWidthAt(profile, at));
      }
      const tangent = profile.curve.getTangentAt(THREE.MathUtils.clamp(at / total, 0, 1));
      return new THREE.Vector2(-tangent.z, tangent.x);
    };
    const aDistance = Math.max(0, distance - length / 2);
    const bDistance = Math.min(total, distance + length / 2);
    const a = centerAt(aDistance);
    const b = centerAt(bDistance);
    const aNormal = normalAt(aDistance);
    const bNormal = normalAt(bDistance);
    const offsetPoint = (
      center: THREE.Vector3,
      normal: THREE.Vector2,
      side: number,
      at: number,
    ): Vertex => {
      const offset = typeof lateral === 'function' ? lateral(at) : lateral;
      const x = center.x + normal.x * (offset + (side * width) / 2);
      const z = center.z + normal.y * (offset + (side * width) / 2);
      const raised =
        profile.road.structure === 'bridge' ||
        profile.bridgeApproach ||
        (profile.raised && Math.abs(profile.heightAt(x, z) - ground(x, z)) > 2.5);
      return {
        x,
        z,
        y: (raised ? profile.heightAt(x, z) : ground(x, z)) + 0.075,
      };
    };
    const aLeft = offsetPoint(a, aNormal, -1, aDistance);
    const aRight = offsetPoint(a, aNormal, 1, aDistance);
    const bLeft = offsetPoint(b, bNormal, -1, bDistance);
    const bRight = offsetPoint(b, bNormal, 1, bDistance);
    batch.roof(aLeft, aRight, bLeft);
    batch.roof(aRight, bRight, bLeft);
  };
  const nearEnd = (profile: RoadProfile, point: Point) =>
    [profile.points[0], profile.points.at(-1)!].some(
      ([x, z]) => Math.hypot(x - point.x, z - point.z) < 1,
    );
  const paintJunctions = new SpatialIndex<Bounds & { x: number; z: number; radius: number }>();
  const junctionArms = new Map<string, { point: SceneryPoint; arms: Set<string>; width: number }>();
  for (const profile of profiles)
    for (let i = 0; i < profile.road.points.length; i++) {
      const point = profile.road.points[i],
        key = sceneryPointKey(point);
      const junction = junctionArms.get(key) ?? { point, arms: new Set<string>(), width: 0 };
      for (const neighbor of [profile.road.points[i - 1], profile.road.points[i + 1]])
        if (neighbor) junction.arms.add(sceneryPointKey(neighbor));
      junction.width = Math.max(junction.width, Math.min(20, profile.road.width));
      junctionArms.set(key, junction);
    }
  for (const {
    point: [x, z],
    arms,
    width,
  } of junctionArms.values()) {
    if (arms.size < 3) continue;
    const radius = width / 2 + 0.5;
    paintJunctions.add({
      x,
      z,
      radius,
      minX: x - radius,
      maxX: x + radius,
      minZ: z - radius,
      maxZ: z + radius,
    });
  }
  // Keep junction interiors clear; degree-two road fragments remain continuous.
  const paintCovered = (profile: RoadProfile, x: number, z: number) =>
    (!separated(x, z) && surface.nearest(x, z).distance < definition.width / 2 + 0.5) ||
    paintJunctions.some(
      x,
      z,
      (junction) =>
        Math.hypot(x - junction.x, z - junction.z) < junction.radius &&
        (!profile.raised || Math.abs(profile.heightAt(x, z) - ground(x, z) - nearbyRoadLift) < 0.5),
    ) ||
    (junctionsByRoad.get(profile) ?? []).some(
      ({ small, large, point }) =>
        small === profile &&
        !nearEnd(large, point) &&
        Math.hypot(x - point.x, z - point.z) < Math.min(20, large.road.width) / 2 + 0.5,
    );
  const laneCount = (profile: RoadProfile) =>
    Math.max(1, Math.round(profile.road.lanes ?? profile.road.width / 3.25));
  const paintEnds = new Map<string, { profile: RoadProfile; last: boolean }[]>();
  const paintEndKey = (profile: RoadProfile, last: boolean) =>
    sceneryPointKey(last ? profile.points.at(-1)! : profile.points[0]);
  for (const profile of profiles)
    for (const last of [false, true]) {
      const key = paintEndKey(profile, last);
      const ends = paintEnds.get(key) ?? [];
      ends.push({ profile, last });
      paintEnds.set(key, ends);
    }
  const paintPhases = new Map<RoadProfile, { phase: number; direction: number }>();
  for (const root of profiles) {
    if (paintPhases.has(root)) continue;
    paintPhases.set(root, { phase: 0, direction: 1 });
    const pending = [root];
    while (pending.length) {
      const profile = pending.pop()!;
      const { phase, direction } = paintPhases.get(profile)!;
      for (const last of [false, true]) {
        const key = paintEndKey(profile, last),
          ends = paintEnds.get(key)!;
        if (ends.length !== 2 || (junctionArms.get(key)?.arms.size ?? 2) !== 2) continue;
        const other = ends.find((end) => end.profile !== profile);
        if (
          !other ||
          paintPhases.has(other.profile) ||
          laneCount(profile) !== laneCount(other.profile) ||
          profile.road.centerline !== other.profile.road.centerline ||
          (profile.road.oneway === undefined) !== (other.profile.road.oneway === undefined)
        )
          continue;
        const nextDirection = direction * (last === other.last ? -1 : 1);
        const sharedPhase = phase + (last ? direction * profile.curve.getLength() : 0);
        paintPhases.set(other.profile, {
          phase: sharedPhase - (other.last ? nextDirection * other.profile.curve.getLength() : 0),
          direction: nextDirection,
        });
        pending.push(other.profile);
      }
    }
  }
  const paintLine = (
    profile: RoadProfile,
    batch: Batch,
    lateral: number | ((distance: number) => number),
    dashed: boolean,
  ) => {
    const length = profile.curve.getLength();
    const intervals: [number, number][] = [];
    if (dashed) {
      const { phase, direction } = paintPhases.get(profile)!;
      const end = phase + direction * length;
      for (
        let dash = Math.floor(Math.min(phase, end) / 12);
        dash <= Math.floor(Math.max(phase, end) / 12);
        dash++
      ) {
        const a = direction * (dash * 12 - phase);
        const b = direction * (dash * 12 + 3 - phase);
        const start = Math.max(0, Math.min(a, b)),
          finish = Math.min(length, Math.max(a, b));
        if (finish > start) intervals.push([start, finish]);
      }
    } else intervals.push([0, length]);
    for (const [start, finish] of intervals)
      for (let distance = start; distance < finish; distance += 2) {
        const size = Math.min(2, finish - distance);
        const center = profile.curve.getPointAt((distance + size / 2) / length);
        if (paintCovered(profile, center.x, center.z)) continue;
        paintRoadStrip(
          profile,
          paintBatch(batch, profile),
          distance + size / 2,
          lateral,
          size,
          0.12,
        );
      }
  };
  for (const profile of profiles) {
    const { road, curve } = profile;
    const length = curve.getLength();
    if (road.oneway !== undefined) {
      for (let distance = 18; distance < length - 3; distance += 36) {
        const center = curve.getPointAt(distance / length);
        if (paintCovered(profile, center.x, center.z)) continue;
        const tangent = curve.getTangentAt(distance / length);
        const direction = new THREE.Vector2(tangent.x, tangent.z).multiplyScalar(
          road.oneway === 1 ? 1 : -1,
        );
        const normal = new THREE.Vector2(-direction.y, direction.x);
        for (let lane = 0; lane < laneCount(profile); lane++) {
          const laneOffset =
            roadWidthAt(profile, distance) * ((lane + 0.5) / laneCount(profile) - 0.5);
          const outline = [
            [-2, -0.14],
            [0.5, -0.14],
            [0.5, -0.6],
            [2, 0],
            [0.5, 0.6],
            [0.5, 0.14],
            [-2, 0.14],
          ].map(([forward, side]) => {
            const x = center.x + direction.x * forward + normal.x * (side + laneOffset);
            const z = center.z + direction.y * forward + normal.y * (side + laneOffset);
            const raised =
              road.structure === 'bridge' ||
              profile.bridgeApproach ||
              (profile.raised && Math.abs(profile.heightAt(x, z) - ground(x, z)) > 2.5);
            return {
              x,
              z,
              y: (raised ? profile.heightAt(x, z) : ground(x, z)) + 0.075,
            };
          });
          const triangles = THREE.ShapeUtils.triangulateShape(
            outline.map((p) => new THREE.Vector2(p.x, p.z)),
            [],
          );
          for (const [a, b, c] of triangles)
            paintBatch(directionBatch, profile).roof(outline[a], outline[b], outline[c]);
        }
      }
    } else if (road.centerline) {
      const dashed = road.centerline === 'dashed-yellow';
      for (const lateral of dashed ? [0] : [-0.14, 0.14])
        paintLine(profile, centerlineBatch, lateral, dashed);
    }
    if (road.oneway !== undefined || (road.lanes && road.lanes > 2 && road.lanes % 2 === 0))
      for (let lane = 1; lane < laneCount(profile); lane++) {
        if (road.oneway === undefined && lane * 2 === laneCount(profile)) continue;
        paintLine(
          profile,
          markingBatch,
          (at) => roadWidthAt(profile, at) * (lane / laneCount(profile) - 0.5),
          true,
        );
      }
  }
  for (const waterway of scenery.waterways)
    ribbon(waterway.points, waterway.width, riverBatch, true);
  for (const area of scenery.parking ?? []) {
    const shape = polygon(area.rings);
    if (!shape) continue;
    roadBatch.outlines ??= [];
    roadBatch.outlines.push(shape.rings);
    obstacles.add({
      ...shape,
      minX: shape.minX - 3,
      minZ: shape.minZ - 3,
      maxX: shape.maxX + 3,
      maxZ: shape.maxZ + 3,
    });
    const { points, triangles } = triangulate(shape);
    for (const [a, b, c] of triangles)
      roadBatch.roof({ ...points[a], y: 0 }, { ...points[b], y: 0 }, { ...points[c], y: 0 });
  }
  const junctionCorners = new SpatialIndex<Bounds & { radius: number }>();
  const junctionKeys = sceneryJunctions(scenery.roads);
  const junctionWidths = new Map<string, number>();
  for (const road of scenery.roads) {
    if (road.structure) continue;
    for (const p of road.points) {
      const key = sceneryPointKey(p);
      if (junctionKeys.has(key))
        junctionWidths.set(key, Math.max(junctionWidths.get(key) ?? 0, road.width));
    }
  }
  for (const [key, width] of junctionWidths) {
    const [x, z] = key.split(',').map(Number);
    const reach = width + 2;
    junctionCorners.add({
      minX: x - reach,
      maxX: x + reach,
      minZ: z - reach,
      maxZ: z + reach,
      radius: THREE.MathUtils.clamp(width / 2, 2, 8),
    });
  }
  const groundPavement = polygonClipping.roundConcaveCorners(
    pavementFootprint(roadBatch),
    ([x, z]) => {
      let radius = 0;
      junctionCorners.some(x, z, (junction) => {
        radius = Math.max(radius, junction.radius);
        return false;
      });
      return radius;
    },
  );
  fillFootprint(roadBatch, groundPavement);
  // Only surface pavement interrupts water; bridges and underground roads do not.
  if (riverBatch.positions.length)
    fillFootprint(
      riverBatch,
      polygonClipping.difference(pavementFootprint(riverBatch), groundPavement),
    );
  buildWaterBodies(groundPavement);
  const tunnelRoads = tunnelBatches.get(roadBatch);
  const tunnelPavement = tunnelRoads ? pavementFootprint(tunnelRoads) : [];
  if (tunnelRoads) fillFootprint(tunnelRoads, tunnelPavement);
  const approachPavement = pavementFootprint(approachPavementBatch);
  const pavement = polygonClipping.union(groundPavement, tunnelPavement, approachPavement);
  for (const segment of courseSegments)
    if (!separated((segment.a.x + segment.b.x) / 2, (segment.a.z + segment.b.z) / 2))
      centerlines.add({
        a: segment.a,
        b: segment.b,
        width: definition.width,
        minX: Math.min(segment.a.x, segment.b.x) - definition.width / 2,
        minZ: Math.min(segment.a.z, segment.b.z) - definition.width / 2,
        maxX: Math.max(segment.a.x, segment.b.x) + definition.width / 2,
        maxZ: Math.max(segment.a.z, segment.b.z) + definition.width / 2,
      });
  for (const segment of roadSegments.query(bounds))
    if (!segment.profile.road.structure) centerlines.add({ ...segment, width: 0 });
  pavementEdges = new SpatialIndex<RoadSegment>(pavementEdgeCell);
  junctionEdges = new SpatialIndex<RoadSegment>(pavementEdgeCell);
  yield { message: 'Building nearby roads…', fraction: 0.1 };
  for (const rings of pavement)
    for (const ring of rings)
      for (let i = 1; i < ring.length; i++)
        addPavementEdge({ x: ring[i - 1][0], z: ring[i - 1][1] }, { x: ring[i][0], z: ring[i][1] });
  const edgeLineInset = 0.66;
  const edgeLineWidth = 0.12;
  const edgeSampleLength = 2;
  const groundEdgeBatch = new Batch();
  for (const profile of profiles) {
    if (!profile.major) continue;
    const length = profile.curve.getLength();
    for (let distance = 0; distance < length; distance += edgeSampleLength) {
      const size = Math.min(edgeSampleLength, length - distance);
      const at = (distance + size / 2) / length;
      const center = profile.curve.getPointAt(at);
      const tangent = profile.curve.getTangentAt(at);
      for (const sign of [-1, 1]) {
        const lateral = sign * (roadWidthAt(profile, distance + size / 2) / 2 - edgeLineInset);
        const x = center.x - tangent.z * lateral,
          z = center.z + tangent.x * lateral;
        if (profile.road.structure !== 'bridge' && edgeDistance(pavementEdges, x, z, 2) > 1)
          continue;
        paintRoadStrip(
          profile,
          profile.road.structure ? paintBatch(markingBatch, profile) : groundEdgeBatch,
          distance + size / 2,
          (at) => sign * (roadWidthAt(profile, at) / 2 - edgeLineInset),
          size,
          edgeLineWidth,
        );
      }
    }
  }
  if (groundEdgeBatch.positions.length) {
    const coverage = polygonClipping.offset(pavementFootprint(groundEdgeBatch), edgeSampleLength);
    const edgeBand = polygonClipping.difference(
      polygonClipping.offset(pavement, -edgeLineInset + edgeLineWidth / 2),
      polygonClipping.offset(pavement, -edgeLineInset - edgeLineWidth / 2),
    );
    fillFootprint(groundEdgeBatch, polygonClipping.intersection(edgeBand, coverage));
  }
  yield { message: 'Building buildings…', fraction: 0.13 };
  buildBuildings();
  const groundQuery = query.groundSurface
    ? {
        ...query,
        heights: query.groundSurface.heights,
        filletVertices: query.groundSurface.filletVertices,
      }
    : query;
  if (groundRampBatch.positions.length) {
    const source = groundRampBatch.geometry();
    const positions = source.getAttribute('position');
    source.setAttribute(
      'elevation',
      new THREE.Float32BufferAttribute(
        Array.from(
          { length: positions.count },
          (_, i) =>
            positions.getY(i) - ground(positions.getX(i), positions.getZ(i)) - nearbyRoadLift,
        ),
        1,
      ),
    );
    let projected: THREE.BufferGeometry;
    try {
      projected = options.projectGroundGeometry
        ? options.projectGroundGeometry(source, nearbyRoadLift)
        : projectTerrainGeometry(groundQuery, source, nearbyRoadLift);
    } finally {
      source.dispose();
    }
    const points = projected.getAttribute('position');
    const elevations = projected.getAttribute('elevation');
    for (let i = 0; i < points.count; i++)
      raisedBatch.positions.push(
        points.getX(i),
        points.getY(i) + elevations.getX(i),
        points.getZ(i),
      );
    projected.dispose();
  }
  const onDeck = (p: Vertex) =>
    raisedPavement.isAsphalt(p) && Math.abs(p.y - ground(p.x, p.z)) > 0.15;
  const appendTunnelBatch = (batch: Batch, target: Batch, lift: number) => {
    const tunnel = tunnelBatches.get(batch);
    if (!tunnel) return;
    const source = tunnel.geometry();
    const projected = projectTerrainGeometry(query, source, lift);
    source.dispose();
    const positions = projected.getAttribute('position');
    for (let i = 0; i < positions.count; i++)
      target.positions.push(positions.getX(i), positions.getY(i), positions.getZ(i));
    projected.dispose();
  };
  function* roadDirtAttributes(
    geometries: THREE.BufferGeometry[],
    report?: (done: number) => LoadStep,
  ): LoadTask<void> {
    for (const [index, geometry] of geometries.entries()) {
      const positions = geometry.getAttribute('position');
      const lateral = new Float32Array(positions.count);
      const mainRoad = new Float32Array(positions.count);
      const structure = new Float32Array(positions.count);
      for (let i = 0; i < positions.count; i++) {
        const p = {
          x: positions.getX(i),
          y: positions.getY(i),
          z: positions.getZ(i),
        };
        lateral[i] = roadDistance(p.x, p.z);
        mainRoad[i] = separated(p.x, p.z) ? 3 : surface.nearest(p.x, p.z).distance - halfWidth;
        structure[i] = THREE.MathUtils.smoothstep(Math.abs(p.y - ground(p.x, p.z)), 0.05, 0.5);
      }
      geometry.setAttribute('lateral', new THREE.BufferAttribute(lateral, 1));
      geometry.setAttribute('mainRoad', new THREE.BufferAttribute(mainRoad, 1));
      geometry.setAttribute('structure', new THREE.BufferAttribute(structure, 1));
      if (report) yield report((index + 1) / geometries.length);
    }
  }
  const setRoadDirtAttributes = (geometries: THREE.BufferGeometry[]) =>
    runSync(roadDirtAttributes(geometries));
  result.setRoadDirtAttributes = setRoadDirtAttributes;
  // Dirt spills from the pavement edges over ground-level asphalt and paint, never decks.
  function* addRoadDirt(
    material: THREE.MeshStandardMaterial,
    geometries: THREE.BufferGeometry[],
    report?: (done: number) => LoadStep,
  ): LoadTask<void> {
    if (options.addRoadDirt?.(material)) yield* roadDirtAttributes(geometries, report);
  }
  const refineRoadDirt = (batch: Batch) => {
    // Sample the shader's transition range, splitting on the original planes, not the terrain.
    type Sample = Vertex & { dirt: number };
    // Neighboring triangles share vertices and edge midpoints; sample each position once.
    const known = new Map<number, number>();
    const sample = (p: Vertex): Sample => {
      const key = Math.round(p.x * 100) * 4e7 + Math.round(p.z * 100);
      let dirt = known.get(key);
      if (dirt === undefined) {
        dirt = roadDistance(p.x, p.z);
        known.set(key, dirt);
      }
      return { ...p, dirt };
    };
    const error = (actual: number, interpolated: number) =>
      Math.abs(
        THREE.MathUtils.clamp(actual, -1.5, 0) - THREE.MathUtils.clamp(interpolated, -1.5, 0),
      );
    const middle = (a: Sample, b: Sample) =>
      sample({
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        z: (a.z + b.z) / 2,
      });
    const result = new Batch();
    const refine = (a: Sample, b: Sample, c: Sample, depth: number) => {
      // Distance changes by at most the triangle's longest edge, so a triangle whose corners are
      // that far past the clamped range is flat there and needs no splitting.
      const reach = Math.max(
        Math.hypot(a.x - b.x, a.z - b.z),
        Math.hypot(b.x - c.x, b.z - c.z),
        Math.hypot(c.x - a.x, c.z - a.z),
      );
      const lowest = Math.min(a.dirt, b.dirt, c.dirt);
      const highest = Math.max(a.dirt, b.dirt, c.dirt);
      if (depth === 8 || highest <= -1.5 - reach || lowest >= reach) {
        result.roof(a, b, c);
        return;
      }
      const ab = middle(a, b),
        bc = middle(b, c),
        ca = middle(c, a);
      const errors = [
        error(ab.dirt, (a.dirt + b.dirt) / 2),
        error(bc.dirt, (b.dirt + c.dirt) / 2),
        error(ca.dirt, (c.dirt + a.dirt) / 2),
      ];
      const worst = Math.max(...errors);
      if (worst > dirtErrorLimit) {
        if (errors[0] === worst) {
          refine(a, ab, c, depth + 1);
          refine(ab, b, c, depth + 1);
        } else if (errors[1] === worst) {
          refine(a, b, bc, depth + 1);
          refine(a, bc, c, depth + 1);
        } else {
          refine(a, b, ca, depth + 1);
          refine(ca, b, c, depth + 1);
        }
        return;
      }
      const center = sample({
        x: (a.x + b.x + c.x) / 3,
        y: (a.y + b.y + c.y) / 3,
        z: (a.z + b.z + c.z) / 3,
      });
      if (error(center.dirt, (a.dirt + b.dirt + c.dirt) / 3) > dirtErrorLimit) {
        refine(a, b, center, depth + 1);
        refine(b, c, center, depth + 1);
        refine(c, a, center, depth + 1);
      } else result.roof(a, b, c);
    };
    for (let i = 0; i < batch.positions.length; i += 9) {
      const vertices = [0, 3, 6].map((j) =>
        sample({
          x: batch.positions[i + j],
          y: batch.positions[i + j + 1],
          z: batch.positions[i + j + 2],
        }),
      );
      refine(vertices[0], vertices[1], vertices[2], 0);
    }
    return result;
  };
  function* addDraped(
    batch: Batch,
    parent: THREE.Group,
    color: number,
    name: string,
    lift: number,
    range: readonly [number, number],
    message: string,
  ): LoadTask<void> {
    if (!batch.positions.length && !tunnelBatches.has(batch)) return;
    const progress = (done: number): LoadStep => ({
      message,
      fraction: range[0] + (range[1] - range[0]) * done,
    });
    let input = batch;
    if (batch === riverBatch) {
      const sampled = new Batch();
      const subdivide = (a: Point, b: Point, c: Point) => {
        if (Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) < 1e-8) return;
        const edges = [
          [a, b, c],
          [b, c, a],
          [c, a, b],
        ];
        edges.sort(
          ([a, b], [c, d]) => Math.hypot(c.x - d.x, c.z - d.z) - Math.hypot(a.x - b.x, a.z - b.z),
        );
        const [p, q, opposite] = edges[0];
        if (Math.hypot(p.x - q.x, p.z - q.z) > 2) {
          const middle = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
          subdivide(p, middle, opposite);
          subdivide(middle, q, opposite);
          return;
        }
        sampled.roof(
          { ...a, y: terrain.waterwayHeightAt(a.x, a.z) + lift },
          { ...b, y: terrain.waterwayHeightAt(b.x, b.z) + lift },
          { ...c, y: terrain.waterwayHeightAt(c.x, c.z) + lift },
        );
      };
      const p = batch.positions;
      for (let i = 0; i < p.length; i += 9)
        subdivide(
          { x: p[i], z: p[i + 2] },
          { x: p[i + 3], z: p[i + 5] },
          { x: p[i + 6], z: p[i + 8] },
        );
      input = sampled;
    }
    const kept = new Batch();
    appendTunnelBatch(batch, kept, lift);
    const sliceLength = projectionSlice * 9;
    for (let start = 0; start < input.positions.length; start += sliceLength) {
      const slice = new Batch();
      slice.positions = input.positions.slice(start, start + sliceLength);
      const source = slice.geometry();
      let projected: THREE.BufferGeometry;
      try {
        projected =
          batch === raisedBatch
            ? source.clone()
            : options.projectGroundGeometry
              ? options.projectGroundGeometry(source, lift, batch === riverBatch ? 'river' : false)
              : projectTerrainGeometry(
                  groundQuery,
                  source,
                  lift,
                  undefined,
                  batch === riverBatch ? 'river' : false,
                );
      } finally {
        source.dispose();
      }
      const positions = projected.getAttribute('position');
      for (let i = 0; i < positions.count; i += 3) {
        const vertices = [0, 1, 2].map((j) => ({
          x: positions.getX(i + j),
          y: positions.getY(i + j),
          z: positions.getZ(i + j),
        }));
        if (batch === raisedBatch && vertices.some((p) => !terrain.contains(p.x, p.z))) continue;
        if (batch === raisedBatch) {
          kept.roof(vertices[0], vertices[1], vertices[2]);
        } else if (parent === layers.nearbyRoads) {
          const clipped: Vertex[] = [];
          const intersections: Vertex[] = [];
          const distances = vertices.map(pavementClearance);
          vertices.forEach((p, i) => {
            const q = vertices[(i + 1) % 3],
              dp = distances[i],
              dq = distances[(i + 1) % 3];
            if (dp >= 0) clipped.push(p);
            if (dp >= 0 !== dq >= 0) {
              const t = dp / (dp - dq);
              const intersection = {
                x: p.x + (q.x - p.x) * t,
                y: p.y + (q.y - p.y) * t,
                z: p.z + (q.z - p.z) * t,
              };
              clipped.push(intersection);
              intersections.push(intersection);
            }
          });
          if (intersections.length === 2) addPavementEdge(intersections[0], intersections[1]);
          for (let j = 1; j + 1 < clipped.length; j++) {
            kept.roof(clipped[0], clipped[j], clipped[j + 1]);
          }
        } else {
          if (vertices.some((p) => roadBlocked(p.x, p.z))) continue;
          const [a, b, c] = vertices;
          if (roadBlocked((a.x + b.x + c.x) / 3, (a.z + b.z + c.z) / 3)) continue;
          kept.roof(a, b, c);
        }
      }
      projected.dispose();
      yield progress(0.4 * Math.min(1, (start + sliceLength) / input.positions.length));
    }
    if (!kept.positions.length) return;
    if (batch === roadBatch || batch === raisedBatch) {
      const positions = new Float32Array(kept.positions);
      const mesh = {
        positions,
        indices: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i),
      };
      if (batch === raisedBatch) {
        raisedPavement = new PavementSurface(mesh);
        hasRaisedPavement = true;
        const collisionPositions = positions.slice();
        for (let i = 1; i < collisionPositions.length; i += 3)
          collisionPositions[i] -= nearbyRoadLift;
        appendStructure({
          positions: collisionPositions,
          indices: mesh.indices,
        });
      } else pavementSurface = new PavementSurface(mesh);
      if (result.roadMesh) {
        const previous = result.roadMesh;
        const combined = new Float32Array(previous.positions.length + positions.length);
        combined.set(previous.positions);
        combined.set(positions, previous.positions.length);
        result.roadMesh = {
          positions: combined,
          indices: Uint32Array.from({ length: combined.length / 3 }, (_, i) => i),
        };
      } else result.roadMesh = mesh;
    }
    // Long routes must not submit every surrounding road whenever one end is in view.
    const surfaceMaterial =
      parent === layers.nearbyRoads && options.createRoadMaterial
        ? options.createRoadMaterial()
        : material(color);
    const geometries: THREE.BufferGeometry[] = [];
    let deckMaterial: THREE.MeshStandardMaterial | undefined;
    if (parent === layers.nearbyRoads) surfaceMaterial.flatShading = false;
    let index = 0;
    const dirt =
      (batch === roadBatch || batch === raisedBatch) && options.addRoadDirt?.(surfaceMaterial);
    const chunks = [...kept.chunks()];
    for (const [chunkIndex, original] of chunks.entries()) {
      let chunk = original;
      const elevated =
        batch === raisedBatch &&
        chunk.positions.every(
          (_, i, p) => i % 3 !== 0 || Math.abs(p[i + 1] - ground(p[i], p[i + 2])) >= 0.5,
        );
      if (dirt && !elevated) chunk = refineRoadDirt(chunk);
      const unindexed = chunk.geometry();
      const positions = unindexed.getAttribute('position');
      const uv = new Float32Array(positions.count * 2);
      for (let i = 0; i < positions.count; i++) {
        uv[i * 2] = positions.getX(i) / 5;
        uv[i * 2 + 1] = positions.getZ(i) / 5;
      }
      unindexed.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (parent === layers.nearbyRoads) unindexed.deleteAttribute('normal');
      const geometry = mergeVertices(unindexed);
      if (parent === layers.nearbyRoads) geometry.computeVertexNormals();
      unindexed.dispose();
      if (elevated && !deckMaterial) {
        deckMaterial = options.createRoadMaterial?.() ?? material(color);
        deckMaterial.flatShading = false;
      }
      const mesh = new THREE.Mesh(geometry, elevated ? deckMaterial : surfaceMaterial);
      mesh.name = index++ === 0 ? name : `${name}-${index}`;
      mesh.receiveShadow = true;
      parent.add(mesh);
      if (!elevated) geometries.push(geometry);
      yield progress(0.4 + 0.4 * ((chunkIndex + 1) / chunks.length));
    }
    if (geometries.length) {
      if (dirt) yield* roadDirtAttributes(geometries, (done) => progress(0.8 + 0.2 * done));
    } else surfaceMaterial.dispose();
  }
  yield* addDraped(
    roadBatch,
    layers.nearbyRoads,
    0x55575a,
    'nearby-road-surfaces',
    0.035,
    [0.15, 0.6],
    'Draping roads onto the terrain…',
  );
  yield* addDraped(
    raisedBatch,
    layers.nearbyRoads,
    0x55575a,
    'nearby-road-decks',
    0.035,
    [0.6, 0.62],
    'Building bridges…',
  );
  function* drapePaint(batch: Batch, range: readonly [number, number]): LoadTask<void> {
    const progress = (done: number): LoadStep => ({
      message: 'Painting road markings…',
      fraction: range[0] + (range[1] - range[0]) * done,
    });
    const groundPaint = new Batch(),
      deckPaint = new Batch();
    // Neighboring paint vertices share one wide query, filtered to each vertex's own 20 m reach.
    let nearby:
      | { x: number; z: number; segments: ReturnType<typeof roadSegments.query> }
      | undefined;
    const nearbySegments = (x: number, z: number) => {
      if (!nearby || Math.abs(x - nearby.x) > 16 || Math.abs(z - nearby.z) > 16)
        nearby = {
          x,
          z,
          segments: roadSegments.query({
            minX: x - 36,
            maxX: x + 36,
            minZ: z - 36,
            maxZ: z + 36,
          }),
        };
      return nearby.segments;
    };
    for (let i = 0; i < batch.positions.length; i += 9) {
      if (i && i % (projectionSlice * 9) === 0) yield progress(0.2 * (i / batch.positions.length));
      const vertices = [0, 3, 6].map((j) => ({
        x: batch.positions[i + j],
        y: batch.positions[i + j + 1],
        z: batch.positions[i + j + 2],
      }));
      if (batch !== groundEdgeBatch && onDeck(vertices[0]))
        deckPaint.roof(vertices[0], vertices[1], vertices[2]);
      else groundPaint.roof(...(vertices.map((p) => ({ ...p, y: 0 })) as [Vertex, Vertex, Vertex]));
    }
    const raised = raisedPaintBatches.get(batch);
    if (raised)
      for (let i = 0; i < raised.positions.length; i += 9) {
        const vertices = [0, 3, 6].flatMap((j) => {
          const point = {
            x: raised.positions[i + j],
            y: raised.positions[i + j + 1],
            z: raised.positions[i + j + 2],
          };
          const height = raisedPavement.heightAt(point) ?? pavementSurface.heightAt(point);
          return height === undefined ? [] : [{ ...point, y: height + 0.075 - nearbyRoadLift }];
        });
        if (vertices.length === 3) deckPaint.roof(vertices[0], vertices[1], vertices[2]);
      }
    batch.positions = deckPaint.positions;
    appendTunnelBatch(batch, batch, 0.075);
    if (!groundPaint.positions.length) return;
    const sliceLength = projectionSlice * 9;
    for (let start = 0; start < groundPaint.positions.length; start += sliceLength) {
      const slice = new Batch();
      slice.positions = groundPaint.positions.slice(start, start + sliceLength);
      const source = slice.geometry();
      let projected: THREE.BufferGeometry;
      try {
        projected = options.projectGroundGeometry
          ? options.projectGroundGeometry(source, 0.075)
          : projectTerrainGeometry(groundQuery, source, 0.075);
      } finally {
        source.dispose();
      }
      const positions = projected.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const point = {
          x: positions.getX(i),
          y: positions.getY(i),
          z: positions.getZ(i),
        };
        if (batch === groundEdgeBatch) {
          let nearest = Infinity;
          let road: RoadProfile | undefined;
          for (const { a, b, profile, distance, minX, maxX, minZ, maxZ } of nearbySegments(
            point.x,
            point.z,
          )) {
            if (
              minX > point.x + 20 ||
              maxX < point.x - 20 ||
              minZ > point.z + 20 ||
              maxZ < point.z - 20 ||
              !profile.major ||
              profile.road.structure
            )
              continue;
            const dx = b.x - a.x,
              dz = b.z - a.z;
            const along = segmentDistance(point.x, point.z, a, b);
            // Road widths are capped at 20 m, so a segment this far can't beat the current best.
            if (along - 10 >= nearest) continue;
            const t = THREE.MathUtils.clamp(
              ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz),
              0,
              1,
            );
            const edgeDistance = Math.abs(
              along - roadWidthAt(profile, distance + t * Math.hypot(dx, dz)) / 2,
            );
            if (edgeDistance >= nearest) continue;
            nearest = edgeDistance;
            road = profile;
          }
          if (road) {
            const surface = road.bridgeApproach ? raisedPavement : pavementSurface;
            const height = surface.heightAt({
              ...point,
              y: road.bridgeApproach ? road.heightAt(point.x, point.z) : point.y,
            });
            if (height !== undefined) point.y = height + 0.075 - nearbyRoadLift;
          }
        }
        batch.positions.push(point.x, point.y, point.z);
      }
      projected.dispose();
      yield progress(0.2 + 0.8 * Math.min(1, (start + sliceLength) / groundPaint.positions.length));
    }
  }
  const paintBatches = [
    markingBatch,
    centerlineBatch,
    directionBatch,
    stopLineBatch,
    groundEdgeBatch,
  ];
  for (const [i, batch] of paintBatches.entries())
    yield* drapePaint(batch, [
      0.62 + (0.28 * i) / paintBatches.length,
      0.62 + (0.28 * (i + 1)) / paintBatches.length,
    ]);
  markingBatch.positions = markingBatch.positions.concat(groundEdgeBatch.positions);
  for (const [batch, color, name] of [
    [roadbedBatch, 0x84775f, 'nearby-road-embankments'],
    [abutmentBatch, 0xa39e91, 'nearby-road-abutments'],
    [markingBatch, 0xdddcd2, 'nearby-road-edge-lines'],
    [centerlineBatch, 0xf0c928, 'nearby-road-centerlines'],
    [directionBatch, 0xe9e9e4, 'nearby-road-oneway-arrows'],
    [stopLineBatch, 0xe9e9e4, 'nearby-road-stop-lines'],
    [medianBatch, 0xb4b1a6, 'nearby-road-medians'],
    [medianReflectorBatch, 0xf4c143, 'nearby-road-median-reflectors'],
  ] as const) {
    if (!batch.positions.length) continue;
    const surfaceMaterial = material(color);
    surfaceMaterial.side = THREE.DoubleSide;
    const paint = [markingBatch, centerlineBatch, directionBatch, stopLineBatch].includes(batch);
    let index = 0;
    const meshes = [...batch.chunks()].map((chunk) =>
      addBatch(
        layers.nearbyRoads,
        chunk,
        surfaceMaterial,
        index++ ? `${name}-${index}` : name,
        !paint && batch !== medianReflectorBatch,
      ),
    );
    if (paint)
      yield* addRoadDirt(
        surfaceMaterial,
        meshes.flatMap((mesh) => (mesh ? [mesh.geometry] : [])),
        (done) => ({ message: 'Shading road edges…', fraction: 0.9 + 0.05 * done }),
      );
    if (!paint && batch !== medianReflectorBatch) {
      const positions = new Float32Array(batch.positions);
      appendStructure({
        positions,
        indices: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i),
      });
    }
  }
  if (structurePositions.length)
    result.structureMesh = {
      positions: new Float32Array(structurePositions),
      indices: new Uint32Array(structureIndices),
    };
  yield* addDraped(
    riverBatch,
    layers.water,
    0x397d89,
    'draped-waterways',
    riverWaterLift,
    [0.95, 0.98],
    'Building rivers…',
  );
  if (waterBatch.positions.length) {
    const waterMaterial = material(0x397d89);
    waterMaterial.roughness = 0.38;
    waterMaterial.metalness = 0.12;
    const mesh = addBatch(
      layers.water,
      waterBatch,
      waterMaterial,
      'shallow-water-surfaces',
      false,
    )!;
    if (options.projectGroundGeometry) {
      const source = mesh.geometry;
      mesh.geometry = options.projectGroundGeometry(source, 0, true);
      source.dispose();
    }
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
  const roadsideDistance = (x: number, z: number) => {
    let distance = clearance(x, z);
    for (const road of roads.query({ minX: x - 20, maxX: x + 20, minZ: z - 20, maxZ: z + 20 })) {
      distance = Math.min(distance, segmentDistance(x, z, road.a, road.b) - road.width / 2);
    }
    return distance;
  };
  yield { message: 'Planting vegetation…', fraction: 0.98 };
  const canopy = scenery.canopy;
  const vegetation = scenery.vegetation;
  function* plantCandidates() {
    if (canopy) {
      const area = (canopy.maxX - canopy.minX) * (canopy.maxZ - canopy.minZ);
      const spacing = Math.max(8, Math.sqrt(area / maxCanopyPlants));
      const columns = Math.ceil((canopy.maxX - canopy.minX) / spacing);
      const rows = Math.ceil((canopy.maxZ - canopy.minZ) / spacing);
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const x = canopy.minX + ((column + random()) / columns) * (canopy.maxX - canopy.minX);
          const z = canopy.minZ + ((row + random()) / rows) * (canopy.maxZ - canopy.minZ);
          const cover = treeCanopyAt(canopy, x, z);
          if (cover <= 100 && random() < cover / 100) yield { x, z, tree: true };
        }
      }
    }
    let attempts = 0;
    for (const feature of vegetation) {
      if (feature.kind === 'grass') continue;
      const shape = polygon(feature.rings);
      if (!shape) continue;
      const tree = feature.kind === 'trees';
      const area = (shape.maxX - shape.minX) * (shape.maxZ - shape.minZ);
      const trials = Math.min(6000, Math.ceil(area / (tree ? 32 : 16)));
      for (let i = 0; i < trials && attempts < maxPlantAttempts; i++) {
        attempts++;
        const x = THREE.MathUtils.lerp(shape.minX, shape.maxX, random());
        const z = THREE.MathUtils.lerp(shape.minZ, shape.maxZ, random());
        if (!inside(x, z, shape)) continue;
        if (canopy && tree && treeCanopyAt(canopy, x, z) !== 255) continue;
        yield { x, z, tree };
      }
    }
  }
  let attempts = 0;
  for (const { x, z, tree } of plantCandidates()) {
    if (++attempts % 1024 === 0) yield { message: 'Planting vegetation…', fraction: 0.98 };
    if (trees.length + shrubs.length >= (canopy ? maxCanopyPlants : maxPlants)) break;
    if (!tree && roadsideDistance(x, z) > 12) continue;
    const radius = tree ? 4.5 : 1.5;
    if (
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
    occupied.add({
      x,
      z,
      minX: x - 5,
      maxX: x + 5,
      minZ: z - 5,
      maxZ: z + 5,
    });
  }
  // Saved/headless previews deliberately retain their compact, untextured vegetation.
  if (typeof document !== 'undefined' && !options.simpleVegetation) {
    const rockMatrices: THREE.Matrix4[] = [];
    const rockShades: number[] = [];
    const area = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
    const spacing = Math.max(6, Math.sqrt(area / 160_000));
    let candidates = 0;
    for (let z0 = bounds.minZ; z0 < bounds.maxZ; z0 += spacing) {
      for (let x0 = bounds.minX; x0 < bounds.maxX; x0 += spacing) {
        if (++candidates % 2048 === 0) yield { message: 'Planting ground cover…', fraction: 0.99 };
        const x = x0 + random() * spacing,
          z = z0 + random() * spacing;
        if (random() > 0.65) continue;
        const choice = random();
        if (choice < 0.012 || choice >= 0.45 || roadsideDistance(x, z) > 12) continue;
        if (
          !terrain.contains(x - 1.5, z - 1.5) ||
          !terrain.contains(x + 1.5, z + 1.5) ||
          clearance(x, z) < 2 ||
          obstacles.some(x, z, (p) => nearPolygon(x, z, p, 1.5)) ||
          roads.some(x, z, (s) => segmentDistance(x, z, s.a, s.b) < s.width / 2 + 2.5)
        )
          continue;
        const y = ground(x, z);
        const dx = (ground(x + 1, z) - ground(x - 1, z)) / 2;
        const dz = (ground(x, z + 1) - ground(x, z - 1)) / 2;
        if (!Number.isFinite(y) || Math.hypot(dx, dz) > 0.65) continue;
        transform.position.set(x, y - 0.04, z);
        transform.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(-dx, 1, -dz).normalize(),
        );
        transform.rotateY(random() * Math.PI * 2);
        const size = 0.7 + random() * 0.7;
        transform.scale.setScalar(size);
        transform.updateMatrix();
        shrubs.push(transform.matrix.clone());
        shrubShades.push(random());
      }
    }
    // Landscape the sides of mapped entrances, never scatter boulders through open terrain.
    const frontage = new SpatialIndex<RoadSegment>();
    const frontageRoads = [
      ...scenery.roads.filter(
        (road) => !road.structure && road.roadClass !== 'service' && !road.service,
      ),
      {
        points: courseSegments.flatMap(
          ({ a, b }) =>
            [
              [a.x, a.z],
              [b.x, b.z],
            ] as SceneryPoint[],
        ),
        width: definition.width,
      },
    ];
    for (const road of frontageRoads)
      for (let i = 1; i < road.points.length; i++) {
        const [ax, az] = road.points[i - 1],
          [bx, bz] = road.points[i];
        const reach = road.width / 2 + 8;
        frontage.add({
          a: { x: ax, z: az },
          b: { x: bx, z: bz },
          width: road.width,
          minX: Math.min(ax, bx) - reach,
          maxX: Math.max(ax, bx) + reach,
          minZ: Math.min(az, bz) - reach,
          maxZ: Math.max(az, bz) + reach,
        });
      }
    for (const driveway of scenery.roads) {
      if (
        driveway.structure ||
        !(
          driveway.service === 'driveway' ||
          (driveway.roadClass === 'service' && !driveway.service && driveway.width <= 5)
        )
      )
        continue;
      for (const reverse of [false, true]) {
        const points = reverse ? driveway.points.slice().reverse() : driveway.points;
        const [x0, z0] = points[0];
        const next = points.find(([x, z]) => Math.hypot(x - x0, z - z0) >= 2);
        if (!next) continue;
        const length = Math.hypot(next[0] - x0, next[1] - z0);
        const dx = (next[0] - x0) / length,
          dz = (next[1] - z0) / length;
        const atEntrance = frontage.some(x0, z0, (road) => {
          const rx = road.b.x - road.a.x,
            rz = road.b.z - road.a.z;
          return (
            segmentDistance(x0, z0, road.a, road.b) <= road.width / 2 + 2 &&
            Math.abs(dx * rx + dz * rz) < Math.hypot(rx, rz) * 0.9
          );
        });
        if (!atEntrance) continue;
        for (const side of [-1, 1]) {
          const clusterShade = random();
          for (let i = 0; i < 3; i++) {
            const along = 5 + i * 2.2;
            const across = side * (driveway.width / 2 + 2.8 + random() * 0.4);
            const x = x0 + dx * along - dz * across,
              z = z0 + dz * along + dx * across;
            if (
              !terrain.contains(x - 1.5, z - 1.5) ||
              !terrain.contains(x + 1.5, z + 1.5) ||
              roadsideDistance(x, z) > 8 ||
              clearance(x, z) < 2.5 ||
              obstacles.some(x, z, (p) => nearPolygon(x, z, p, 1.5)) ||
              roads.some(x, z, (s) => segmentDistance(x, z, s.a, s.b) < s.width / 2 + 2.5) ||
              occupied.some(x, z, (p) => Math.hypot(x - p.x, z - p.z) < 2)
            )
              continue;
            const y = ground(x, z);
            const slopeX = (ground(x + 1, z) - ground(x - 1, z)) / 2;
            const slopeZ = (ground(x, z + 1) - ground(x, z - 1)) / 2;
            if (!Number.isFinite(y) || Math.hypot(slopeX, slopeZ) > 0.45) continue;
            transform.position.set(x, y - 0.16, z);
            transform.quaternion.setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              new THREE.Vector3(-slopeX, 1, -slopeZ).normalize(),
            );
            transform.rotateY(random() * Math.PI * 2);
            transform.scale.setScalar((i === 0 ? 1.1 : 0.65) + random() * 0.25);
            transform.updateMatrix();
            rockMatrices.push(transform.matrix.clone());
            rockShades.push(clusterShade);
            occupied.add({ x, z, minX: x - 2, maxX: x + 2, minZ: z - 2, maxZ: z + 2 });
          }
        }
      }
    }
    const trackSurface = completeMap
      ? new TerrainSurface(query.segments, query.halfWidth, query.padRadius)
      : surface;
    addVegetation(
      layers.vegetation,
      {
        trees: { matrices: trees, shades },
        bush: { matrices: shrubs, shades: shrubShades },
        rocks: { matrices: rockMatrices, shades: rockShades },
      },
      (x, z) =>
        definition.padRadius !== undefined
          ? Math.hypot(x, z) - definition.padRadius
          : trackSurface.nearest(x, z).distance - halfWidth,
    );
    return result;
  }
  const chunks = new Map<string, { lod: THREE.LOD; plants: THREE.Group }>();
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
    const batches = new Map<string, number[]>();
    matrices.forEach((matrix, index) => {
      const x = Math.floor(matrix.elements[12] / vegetationChunkSize);
      const z = Math.floor(matrix.elements[14] / vegetationChunkSize);
      const key = `${x}/${z}`;
      const batch = batches.get(key) ?? [];
      batch.push(index);
      batches.set(key, batch);
      if (!chunks.has(key)) {
        const lod = new THREE.LOD();
        lod.userData.vegetationChunk = true;
        lod.position.set(
          (x + 0.5) * vegetationChunkSize,
          matrix.elements[13],
          (z + 0.5) * vegetationChunkSize,
        );
        const plants = new THREE.Group();
        lod.addLevel(plants, 0);
        lod.addLevel(new THREE.Group(), defaultTreeSettings.treeDrawDistance, 0.1);
        layers.vegetation.add(lod);
        chunks.set(key, { lod, plants });
      }
    });
    const tint = new THREE.Color();
    for (const [key, indices] of batches) {
      const { lod, plants } = chunks.get(key)!;
      const mesh = new THREE.InstancedMesh(geometry, surface, indices.length);
      mesh.name = name;
      // Keep instance transforms in course coordinates for saved previews and existing tooling.
      mesh.position.copy(lod.position).multiplyScalar(-1);
      for (const [i, index] of indices.entries()) {
        mesh.setMatrixAt(i, matrices[index]);
        mesh.setColorAt(
          i,
          tint.setHSL(0.25 + colors[index] * 0.06, 0.24, 0.7 + colors[index] * 0.24),
        );
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      plants.add(mesh);
    }
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
