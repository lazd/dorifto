import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { courseShoulderWidth, type CourseDefinition } from './courses';
import type { CourseTerrain } from './terrain';
import { projectTerrainGeometry } from './terrain';
import { PavementSurface, TerrainSurface, type TriangleMeshData } from './terrain-query';
import type { SceneryCategory, SceneryPoint, SceneryPolygon } from './scenery-data';
import { junctionRoadFlare } from './scenery-data';
import { sceneryRoadProfiles } from './scenery-roads';
import { buildBridgeGeometry, createBridgeMeshes } from './bridges';
import { createStopSignFactory } from './turn-sign';
import * as polygonClipping from './polygon-boolean';

type Point = { x: number; z: number };
type Bounds = { minX: number; minZ: number; maxX: number; maxZ: number };
type Polygon = Bounds & { rings: SceneryPolygon };
type RoadSegment = Bounds & { a: Point; b: Point; width: number; widthA?: number; widthB?: number };
type Vertex = Point & { y: number };
type MultiPolygon = SceneryPolygon[];

export interface SceneryOptions {
  createRoadMaterial?: () => THREE.MeshStandardMaterial;
  /** Adds roadside dirt to a ground-level road or paint material; false when unavailable. */
  addRoadDirt?: (material: THREE.MeshStandardMaterial) => boolean;
  /**
   * Projects nearby roads and waterways onto the displayed ground, e.g. a coarse preview grid.
   * Return a new geometry; the source is borrowed and disposed by createScenery.
   * `lift` is the game surface offset; previews can use a larger minimum offset.
   * Must use ground beneath bridges, not the selected route's elevated driving surface.
   * With `horizontal`, clip shallow water to the ground while preserving its source level.
   */
  projectGroundGeometry?: (
    source: THREE.BufferGeometry,
    lift: number,
    horizontal?: boolean,
  ) => THREE.BufferGeometry;
}

const categories: SceneryCategory[] = ['buildings', 'water', 'vegetation', 'nearbyRoads'];
const maxPlants = 4000;
const maxPlantAttempts = 24000;
// Pavement edges are indexed far enough out to cover the terrain's roadside dirt verge.
const pavementEdgeReach = 6;

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

  query(bounds: Bounds) {
    const x0 = Math.floor(bounds.minX / 32);
    const z0 = Math.floor(bounds.minZ / 32);
    const x1 = Math.floor(bounds.maxX / 32);
    const z1 = Math.floor(bounds.maxZ / 32);
    const candidates = new Set<T>(this.large);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) {
      for (const bucket of this.cells.values()) for (const item of bucket) candidates.add(item);
    } else {
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++)
          for (const item of this.cells.get(`${x},${z}`) ?? []) candidates.add(item);
    }
    return [...candidates].filter(
      (item) =>
        item.minX <= bounds.maxX &&
        item.maxX >= bounds.minX &&
        item.minZ <= bounds.maxZ &&
        item.maxZ >= bounds.minZ,
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
  outlines?: SceneryPolygon[];

  triangle(a: Vertex, b: Vertex, c: Vertex, color?: THREE.Color) {
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    if (color) for (let i = 0; i < 3; i++) this.colors.push(color.r, color.g, color.b);
  }

  roof(a: Vertex, b: Vertex, c: Vertex, color?: THREE.Color) {
    const area = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    if (Math.abs(area) < 1e-8) return;
    if (area < 0) this.triangle(a, c, b, color);
    else this.triangle(a, b, c, color);
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
  let pavementEdges = new SpatialIndex<RoadSegment>();
  let junctionEdges = new SpatialIndex<RoadSegment>();
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
    collisionMesh: undefined as TriangleMeshData | undefined,
    roadMesh: undefined as TriangleMeshData | undefined,
    structureMesh: undefined as TriangleMeshData | undefined,
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
      const intersection = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
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
    for (const building of buildings) {
      const shape = polygon(building.rings);
      // A cut-off building would expose its interior; omit footprints beyond supported terrain.
      if (
        !shape ||
        !Number.isFinite(building.height) ||
        shape.rings.some((ring) => ring.some(([x, z]) => !terrain.contains(x, z)))
      )
        continue;
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
    raisedBatch = new Batch(),
    roadbedBatch = new Batch(),
    markingBatch = new Batch(),
    centerlineBatch = new Batch(),
    directionBatch = new Batch(),
    stopLineBatch = new Batch(),
    medianBatch = new Batch(),
    abutmentBatch = new Batch(),
    riverBatch = new Batch();
  const profiles = sceneryRoadProfiles(
    scenery.roads,
    ground,
    (x, z) => terrain.heightAt(x, z),
    (x, z) => surface.nearest(x, z).distance - halfWidth,
    selectedRoadCopy,
    completeMap,
  );
  type RoadProfile = (typeof profiles)[number];
  type IndexedRoadSegment = RoadSegment & { profile: RoadProfile; profileIndex: number };
  type RoadIntersection = {
    point: Point;
    small: RoadProfile;
    large: RoadProfile;
    tangent: Point;
  };
  const roadSegments = new SpatialIndex<IndexedRoadSegment>();
  const profileIndices = new Map(profiles.map((profile, index) => [profile, index]));
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
      });
    }
  }
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
    return { point: { x: a.x + t * abx, z: a.z + t * abz }, tangent: { x: abx, z: abz } };
  };
  for (const segment of roadSegments.query(bounds)) {
    for (const other of roadSegments.query(segment)) {
      if (
        segment.profile === other.profile ||
        segment.profileIndex >= other.profileIndex ||
        segment.profile.road.structure ||
        other.profile.road.structure ||
        segment.profile.bridgeApproach ||
        other.profile.bridgeApproach ||
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
      const c = { x: a.x + inboundX * lineDepth, y, z: a.z + inboundZ * lineDepth };
      const d = { x: b.x + inboundX * lineDepth, y, z: b.z + inboundZ * lineDepth };
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
  const roadEnd = (road: (typeof roadPaths)[number], end: boolean): RoadEnd | undefined => {
    const p = end ? road.points.at(-1)! : road.points[0];
    const neighbors = roadPaths.flatMap((other) =>
      other === road
        ? []
        : [false, true].flatMap((last) => {
            const q = last ? other.points.at(-1)! : other.points[0];
            return Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.1
              ? [
                  {
                    point: last ? other.points.at(-2)! : other.points[1],
                    width:
                      (THREE.MathUtils.clamp(road.width, 0.6, 20) +
                        THREE.MathUtils.clamp(other.width, 0.6, 20)) /
                      2,
                  },
                ]
              : [];
          }),
    );
    return neighbors.length === 1 ? neighbors[0] : undefined;
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
          outlineBatch.outlines.push([[...left, ...right.reverse()]]);
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
          const target = elevation && !elevated ? roadBatch : batch;
          if (outlineBatch !== target) finishOutline();
          outlineBatch = target;
          if (!left.length) {
            left.push([corners[0].x, corners[0].z]);
            right.push([corners[1].x, corners[1].z]);
          }
          left.push([corners[2].x, corners[2].z]);
          right.push([corners[3].x, corners[3].z]);
        }
        const target = elevation && !elevated ? roadBatch : batch;
        const vertices = elevation && !elevated ? corners.map((p) => ({ ...p, y: 0 })) : corners;
        target.roof(vertices[0], vertices[1], vertices[2]);
        target.roof(vertices[1], vertices[3], vertices[2]);
        if (elevated && profile) {
          if (
            profile.road.structure !== 'bridge' &&
            Math.abs(center.y - ground(center.x, center.z)) < 2
          ) {
            addPavementEdge(corners[0], corners[2]);
            addPavementEdge(corners[1], corners[3]);
          }
          if (
            profile.major &&
            (separated(center.x, center.z) || clearance(center.x, center.z) >= 0)
          ) {
            const across = (a: Vertex, b: Vertex, t: number) => ({
              x: THREE.MathUtils.lerp(a.x, b.x, t),
              y: THREE.MathUtils.lerp(a.y, b.y, t) + 0.02,
              z: THREE.MathUtils.lerp(a.z, b.z, t),
            });
            for (const sign of [-1, 1]) {
              const from = sign < 0 ? 0.6 / width : 1 - 0.72 / width;
              const to = from + 0.12 / width;
              const a = across(corners[0], corners[1], from);
              const b = across(corners[0], corners[1], to);
              const c = across(corners[2], corners[3], from);
              const d = across(corners[2], corners[3], to);
              markingBatch.roof(a, b, c);
              markingBatch.roof(b, d, c);
            }
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
  for (const profile of profiles) {
    const { road } = profile;
    // Ground copies merge into the course pavement; a copied structure would duplicate the course's deck.
    if (profile.selected && road.structure) continue;
    if (profile.raised) {
      const ends = [roadEnd(road, false), roadEnd(road, true)];
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
          profile.heightAt,
          ground,
          (source, lift) => {
            const geometry = source.clone();
            const positions = geometry.getAttribute('position');
            for (let i = 0; i < positions.count; i++)
              positions.setY(i, profile.heightAt(positions.getX(i), positions.getZ(i)) + lift);
            return geometry;
          },
          {
            route: profile.curve,
            allowPier: (x, z) => surface.nearest(x, z).distance > halfWidth + 4,
          },
        );
        if (data) {
          layers.nearbyRoads.add(createBridgeMeshes(data));
          appendStructure({ positions: data.positions, indices: data.collisionIndices });
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
    const ends = [roadEnd(road, false), roadEnd(road, true)];
    ribbon(points, road.width, roadBatch, false, false, ends, profile);
    ribbon([...points].reverse(), road.width, roadBatch, false, true, [], profile);
  }
  for (const [profileIndex, profile] of profiles.entries()) {
    const { road, curve } = profile;
    if (
      road.structure ||
      profile.bridgeApproach ||
      !['motorway', 'trunk', 'primary', 'secondary'].includes(road.roadClass ?? '')
    )
      continue;
    const length = curve.getLength();
    for (let distance = 2; distance < length - 2; distance += 2) {
      const center = curve.getPointAt(distance / length);
      const tangent = curve.getTangentAt(distance / length);
      let medianX = center.x,
        medianZ = center.z,
        medianWidth = 0;
      if (!road.oneway && (road.lanes ?? 0) >= 4) medianWidth = 1;
      else if (road.oneway) {
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
          const gap = separation - (road.width + other.road.width) / 2;
          if (gap < 0.6 || gap > 12 || separation >= closest) continue;
          closest = separation;
          if (profileIndex > segment.profileIndex) {
            medianWidth = 0;
            continue;
          }
          const offset = (road.width / 2 + gap / 2) / separation;
          medianX = center.x + (x - center.x) * offset;
          medianZ = center.z + (z - center.z) * offset;
          medianWidth = Math.min(3, gap - 0.3);
        }
      }
      if (!medianWidth) continue;
      const crossingRoad = roadSegments
        .query({ minX: medianX - 20, maxX: medianX + 20, minZ: medianZ - 20, maxZ: medianZ + 20 })
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
      const corners = [-1, 1].flatMap((along) =>
        [-1, 1].map((side) => {
          const x = medianX + tangent.x * along + (tangent.z * side * medianWidth) / 2;
          const z = medianZ + tangent.z * along - (tangent.x * side * medianWidth) / 2;
          return { x, z, y: ground(x, z) + 0.22 };
        }),
      );
      if (corners.some((p) => !terrain.contains(p.x, p.z))) continue;
      medianBatch.roof(corners[0], corners[1], corners[2]);
      medianBatch.roof(corners[1], corners[3], corners[2]);
      for (const [a, b] of [
        [0, 1],
        [1, 3],
        [3, 2],
        [2, 0],
      ]) {
        const p = corners[a],
          q = corners[b];
        const lowerP = { ...p, y: p.y - 0.2 },
          lowerQ = { ...q, y: q.y - 0.2 };
        medianBatch.triangle(p, lowerP, q);
        medianBatch.triangle(q, lowerP, lowerQ);
      }
    }
  }
  const paintRoadStrip = (
    profile: RoadProfile,
    batch: Batch,
    distance: number,
    lateral: number,
    length: number,
    width: number,
  ) => {
    const total = profile.curve.getLength();
    const centerAt = (at: number) =>
      profile.curve.getPointAt(THREE.MathUtils.clamp(at / total, 0, 1));
    const normalAt = (at: number) => {
      const tangent = profile.curve.getTangentAt(THREE.MathUtils.clamp(at / total, 0, 1));
      return new THREE.Vector2(-tangent.z, tangent.x);
    };
    const aDistance = Math.max(0, distance - length / 2);
    const bDistance = Math.min(total, distance + length / 2);
    const a = centerAt(aDistance);
    const b = centerAt(bDistance);
    const aNormal = normalAt(aDistance);
    const bNormal = normalAt(bDistance);
    const offsetPoint = (center: THREE.Vector3, normal: THREE.Vector2, side: number): Vertex => {
      const x = center.x + normal.x * (lateral + (side * width) / 2);
      const z = center.z + normal.y * (lateral + (side * width) / 2);
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
    const aLeft = offsetPoint(a, aNormal, -1);
    const aRight = offsetPoint(a, aNormal, 1);
    const bLeft = offsetPoint(b, bNormal, -1);
    const bRight = offsetPoint(b, bNormal, 1);
    batch.roof(aLeft, aRight, bLeft);
    batch.roof(aRight, bRight, bLeft);
  };
  const nearEnd = (profile: RoadProfile, point: Point) =>
    [profile.points[0], profile.points.at(-1)!].some(
      ([x, z]) => Math.hypot(x - point.x, z - point.z) < 1,
    );
  // The course and crossing roads keep their own markings; another road's paint stops at their pavement.
  const paintCovered = (profile: RoadProfile, x: number, z: number) =>
    (!separated(x, z) && surface.nearest(x, z).distance < definition.width / 2 + 0.5) ||
    (junctionsByRoad.get(profile) ?? []).some(
      ({ small, large, point }) =>
        small === profile &&
        !nearEnd(large, point) &&
        Math.hypot(x - point.x, z - point.z) < Math.min(20, large.road.width) / 2 + 0.5,
    );
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
        const outline = [
          [-2, -0.14],
          [0.5, -0.14],
          [0.5, -0.6],
          [2, 0],
          [0.5, 0.6],
          [0.5, 0.14],
          [-2, 0.14],
        ].map(([forward, side]) => {
          const x = center.x + direction.x * forward + normal.x * side;
          const z = center.z + direction.y * forward + normal.y * side;
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
        for (const [a, b, c] of triangles) directionBatch.roof(outline[a], outline[b], outline[c]);
      }
    } else if (road.centerline) {
      const dashed = road.centerline === 'dashed-yellow';
      for (const lateral of dashed ? [0] : [-0.14, 0.14]) {
        for (let distance = 0; distance < length; distance += 2) {
          if (dashed && (distance % 12 >= 3 || distance + 2 > length)) continue;
          const center = curve.getPointAt(Math.min(1, (distance + 1) / length));
          if (paintCovered(profile, center.x, center.z)) continue;
          paintRoadStrip(profile, centerlineBatch, distance + 1, lateral, 2, 0.12);
        }
      }
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
  const pavement = pavementFootprint(roadBatch);
  fillFootprint(roadBatch, pavement);
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
  pavementEdges = new SpatialIndex<RoadSegment>();
  junctionEdges = new SpatialIndex<RoadSegment>();
  for (const rings of pavement)
    for (const ring of rings)
      for (let i = 1; i < ring.length; i++)
        addPavementEdge({ x: ring[i - 1][0], z: ring[i - 1][1] }, { x: ring[i][0], z: ring[i][1] });
  buildBuildings();
  const groundQuery = query.groundSurface
    ? {
        ...query,
        heights: query.groundSurface.heights,
        filletVertices: query.groundSurface.filletVertices,
      }
    : query;
  const onDeck = (p: Vertex) =>
    raisedPavement.isAsphalt(p) && Math.abs(p.y - ground(p.x, p.z)) > 0.15;
  // Dirt spills from the pavement edges over ground-level asphalt and paint, never decks.
  const addRoadDirt = (
    material: THREE.MeshStandardMaterial,
    geometries: THREE.BufferGeometry[],
  ) => {
    if (!options.addRoadDirt?.(material)) return;
    for (const geometry of geometries) {
      const positions = geometry.getAttribute('position');
      const lateral = new Float32Array(positions.count);
      const mainRoad = new Float32Array(positions.count);
      for (let i = 0; i < positions.count; i++) {
        const p = { x: positions.getX(i), y: positions.getY(i), z: positions.getZ(i) };
        lateral[i] = onDeck(p) ? 3 : roadDistance(p.x, p.z);
        mainRoad[i] = separated(p.x, p.z) ? 3 : surface.nearest(p.x, p.z).distance - halfWidth;
      }
      geometry.setAttribute('lateral', new THREE.BufferAttribute(lateral, 1));
      geometry.setAttribute('mainRoad', new THREE.BufferAttribute(mainRoad, 1));
    }
  };
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
      projected =
        batch === raisedBatch
          ? source.clone()
          : options.projectGroundGeometry
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
      if (batch === raisedBatch && vertices.some((p) => !terrain.contains(p.x, p.z))) continue;
      if (batch === raisedBatch) {
        kept.roof(vertices[0], vertices[1], vertices[2]);
      } else if (parent === layers.nearbyRoads) {
        const distance = pavementClearance;
        const clipped: Vertex[] = [];
        const intersections: Vertex[] = [];
        vertices.forEach((p, i) => {
          const q = vertices[(i + 1) % 3],
            dp = distance(p),
            dq = distance(q);
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
        appendStructure(mesh);
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
    if (parent === layers.nearbyRoads) surfaceMaterial.flatShading = false;
    let index = 0;
    for (const chunk of kept.chunks()) {
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
      const mesh = new THREE.Mesh(geometry, surfaceMaterial);
      mesh.name = index++ === 0 ? name : `${name}-${index}`;
      mesh.receiveShadow = true;
      parent.add(mesh);
      geometries.push(geometry);
    }
    if (batch === roadBatch) addRoadDirt(surfaceMaterial, geometries);
  };
  addDraped(roadBatch, layers.nearbyRoads, 0x55575a, 'nearby-road-surfaces', 0.035);
  addDraped(raisedBatch, layers.nearbyRoads, 0x55575a, 'nearby-road-decks', 0.035);
  const drapePaint = (batch: Batch) => {
    const groundPaint = new Batch(),
      deckPaint = new Batch();
    for (let i = 0; i < batch.positions.length; i += 9) {
      const vertices = [0, 3, 6].map((j) => ({
        x: batch.positions[i + j],
        y: batch.positions[i + j + 1],
        z: batch.positions[i + j + 2],
      }));
      if (onDeck(vertices[0])) deckPaint.roof(vertices[0], vertices[1], vertices[2]);
      else groundPaint.roof(...(vertices.map((p) => ({ ...p, y: 0 })) as [Vertex, Vertex, Vertex]));
    }
    batch.positions = deckPaint.positions;
    if (!groundPaint.positions.length) return;
    const source = groundPaint.geometry();
    let projected: THREE.BufferGeometry;
    try {
      projected = options.projectGroundGeometry
        ? options.projectGroundGeometry(source, 0.075)
        : projectTerrainGeometry(groundQuery, source, 0.075);
    } finally {
      source.dispose();
    }
    const positions = projected.getAttribute('position');
    for (let i = 0; i < positions.count; i++)
      batch.positions.push(positions.getX(i), positions.getY(i), positions.getZ(i));
    projected.dispose();
  };
  for (const batch of [markingBatch, centerlineBatch, directionBatch, stopLineBatch])
    drapePaint(batch);
  for (const [batch, color, name] of [
    [roadbedBatch, 0x84775f, 'nearby-road-embankments'],
    [abutmentBatch, 0xa39e91, 'nearby-road-abutments'],
    [markingBatch, 0xdddcd2, 'nearby-road-edge-lines'],
    [centerlineBatch, 0xf0c928, 'nearby-road-centerlines'],
    [directionBatch, 0xe9e9e4, 'nearby-road-oneway-arrows'],
    [stopLineBatch, 0xe9e9e4, 'nearby-road-stop-lines'],
    [medianBatch, 0xa39e91, 'nearby-road-medians'],
  ] as const) {
    if (!batch.positions.length) continue;
    const surfaceMaterial = material(color);
    surfaceMaterial.side = THREE.DoubleSide;
    let index = 0;
    const meshes = [...batch.chunks()].map((chunk) =>
      addBatch(layers.nearbyRoads, chunk, surfaceMaterial, index++ ? `${name}-${index}` : name),
    );
    const paint = [markingBatch, centerlineBatch, directionBatch, stopLineBatch].includes(batch);
    if (paint)
      addRoadDirt(
        surfaceMaterial,
        meshes.flatMap((mesh) => (mesh ? [mesh.geometry] : [])),
      );
    if (!paint) {
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
  addDraped(riverBatch, layers.water, 0x397d89, 'draped-waterways', 0.065);
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
