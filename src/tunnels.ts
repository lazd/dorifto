import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { courseRoute, courseShoulderWidth, type CourseDefinition } from './courses';
import type { TriangleMeshData } from './terrain-query';

export const tunnelShoulderClearance = 0.5;
export const tunnelApproachLength = 20;

export interface TunnelGeometry extends TriangleMeshData {
  liningCount: number;
  collisionIndices: Uint32Array;
}

type Ring = THREE.Vector3[];
type Bore = { rings: Ring[]; planes: THREE.Plane[][] };

export function tunnelBoreSpans(definition: CourseDefinition, length: number) {
  return (definition.structures?.filter(({ type }) => type === 'tunnel') ?? []).map(
    ({ start, end }) => {
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 1 || end <= start)
        throw new Error('Invalid tunnel span');
      return {
        start: Math.max(0, start - tunnelApproachLength / length),
        end: Math.min(1, end + tunnelApproachLength / length),
      };
    },
  );
}

function tunnelBores(definition: CourseDefinition, floor: (x: number, z: number) => number) {
  const spans = definition.structures?.filter(({ type }) => type === 'tunnel');
  if (!spans?.length || definition.flat) return [];
  const route = courseRoute({ ...definition, reverse: false });
  const length = route.getLength();
  const width =
    definition.width / 2 +
    (definition.shoulderWidth ?? courseShoulderWidth) +
    tunnelShoulderClearance;
  const bores: Bore[] = [];
  for (const { start: from, end: to } of tunnelBoreSpans(definition, length)) {
    const steps = Math.max(1, Math.ceil(((to - from) * length) / 2));
    const rings: Ring[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = THREE.MathUtils.lerp(from, to, i / steps);
      const center = route.getPointAt(t);
      const tangent = route.getTangentAt(t);
      const across = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      const base = floor(center.x, center.z);
      const ring: Ring = [];
      for (let j = 0; j <= 18; j++) {
        const angle = (Math.PI * Math.max(0, Math.min(16, j - 1))) / 16;
        const offset = -width * Math.cos(angle);
        const p = center.clone().addScaledVector(across, offset);
        p.y = j === 0 || j === 18 ? floor(p.x, p.z) - 0.15 : base + 3 + Math.sin(angle) * 3.5;
        ring.push(p);
      }
      rings.push(ring);
    }
    const planes: THREE.Plane[][] = [];
    for (let i = 1; i < rings.length; i++) {
      const a = rings[i - 1],
        b = rings[i];
      const center = a[1].clone().add(a.at(-2)!).add(b[1]).add(b.at(-2)!).multiplyScalar(0.25);
      const faces: THREE.Plane[] = [];
      const face = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) => {
        const plane = new THREE.Plane().setFromCoplanarPoints(p, q, r);
        if (plane.distanceToPoint(center) > 0) plane.negate();
        faces.push(plane);
        return plane;
      };
      face(a[0], a[1], a.at(-1)!);
      face(b[0], b.at(-1)!, b[1]);
      // Embed the lining slightly in the hillside so independent triangle intersections
      // cannot leave hairline daylight gaps around the mouth.
      for (let j = 0; j < a.length - 1; j++) face(a[j], b[j], a[j + 1]).constant += 0.04;
      planes.push(faces);
    }
    bores.push({ rings, planes });
  }
  return bores;
}

/** Splits a polygon, interpolating all vertex attributes at the intersection. */
function splitPolygon(polygon: number[][], distance: (p: number[]) => number) {
  const inside: number[][] = [],
    outside: number[][] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const da = distance(a),
      db = distance(b);
    (da <= 0 ? inside : outside).push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      const p = a.map((v, j) => THREE.MathUtils.lerp(v, b[j], t));
      inside.push(p);
      outside.push(p);
    }
  }
  return { inside, outside };
}

function nondegenerateIndices(positions: ArrayLike<number>, indices: number[]) {
  const triangle = new THREE.Triangle();
  const result: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    triangle.a.fromArray(positions, indices[i] * 3);
    triangle.b.fromArray(positions, indices[i + 1] * 3);
    triangle.c.fromArray(positions, indices[i + 2] * 3);
    // Clipped slivers can collapse after Float32 rounding and cause phantom Ammo contacts.
    if (triangle.getArea() > 1e-6) result.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  return result;
}

/** Subtracts the swept bore from the existing terrain, keeping its heights and attributes. */
export function excavateTunnelTerrain(
  source: THREE.BufferGeometry,
  definition: CourseDefinition,
  floor: (x: number, z: number) => number,
) {
  const bores = tunnelBores(definition, floor);
  if (!bores.length) return source;
  const buckets = new Map<string, THREE.Plane[][]>();
  for (const { rings, planes } of bores) {
    for (let i = 0; i < planes.length; i++) {
      const bounds = new THREE.Box3().setFromPoints([...rings[i], ...rings[i + 1]]);
      for (let x = Math.floor(bounds.min.x / 16); x <= Math.floor(bounds.max.x / 16); x++)
        for (let z = Math.floor(bounds.min.z / 16); z <= Math.floor(bounds.max.z / 16); z++) {
          const key = `${x},${z}`;
          const bucket = buckets.get(key) ?? [];
          bucket.push(planes[i]);
          buckets.set(key, bucket);
        }
    }
  }
  const attributes = Object.entries(source.attributes);
  const position = source.getAttribute('position');
  const index = source.getIndex();
  const values = attributes.map(() => [] as number[]);
  const indices: number[] = [];
  const originals = new Map<number, number>();
  const point = new THREE.Vector3();
  const add = (vertices: number[][]) => {
    if (vertices.length < 3) return;
    const base = values[0].length / attributes[0][1].itemSize;
    for (const vertex of vertices) {
      let offset = 0;
      attributes.forEach(([, attribute], j) => {
        values[j].push(...vertex.slice(offset, offset + attribute.itemSize));
        offset += attribute.itemSize;
      });
    }
    for (let j = 1; j < vertices.length - 1; j++) indices.push(base, base + j, base + j + 1);
  };
  const vertex = (i: number) =>
    attributes.flatMap(([, a]) =>
      Array.from({ length: a.itemSize }, (_, j) => a.getComponent(i, j)),
    );
  const positionOffset = attributes
    .slice(
      0,
      attributes.findIndex(([name]) => name === 'position'),
    )
    .reduce((sum, [, a]) => sum + a.itemSize, 0);
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const corners = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
    const bounds = new THREE.Box3().setFromPoints(
      corners.map((j) => new THREE.Vector3().fromBufferAttribute(position, j)),
    );
    const volumes = new Set<THREE.Plane[]>();
    for (let x = Math.floor(bounds.min.x / 16); x <= Math.floor(bounds.max.x / 16); x++)
      for (let z = Math.floor(bounds.min.z / 16); z <= Math.floor(bounds.max.z / 16); z++)
        for (const volume of buckets.get(`${x},${z}`) ?? []) volumes.add(volume);
    if (!volumes.size) {
      for (const corner of corners) {
        let output = originals.get(corner);
        if (output === undefined) {
          output = values[0].length / attributes[0][1].itemSize;
          const v = vertex(corner);
          let offset = 0;
          attributes.forEach(([, a], j) => {
            values[j].push(...v.slice(offset, offset + a.itemSize));
            offset += a.itemSize;
          });
          originals.set(corner, output);
        }
        indices.push(output);
      }
      continue;
    }
    let polygons = [corners.map(vertex)];
    for (const planes of volumes) {
      const remaining: number[][][] = [];
      for (const polygon of polygons) {
        if (
          planes.some((plane) =>
            polygon.every((p) => plane.distanceToPoint(point.fromArray(p, positionOffset)) >= 0),
          )
        ) {
          remaining.push(polygon);
          continue;
        }
        let inner = polygon;
        for (const plane of planes) {
          if (inner.length < 3) break;
          const split = splitPolygon(inner, (p) =>
            plane.distanceToPoint(point.fromArray(p, positionOffset)),
          );
          if (split.outside.length >= 3) remaining.push(split.outside);
          inner = split.inside;
        }
      }
      polygons = remaining;
    }
    for (const polygon of polygons) add(polygon);
  }
  const geometry = new THREE.BufferGeometry();
  attributes.forEach(([name, a], i) =>
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values[i], a.itemSize)),
  );
  geometry.setIndex(nondegenerateIndices(geometry.getAttribute('position').array, indices));
  return geometry;
}

/** The road floor is separate from the untouched hillside above the bore. */
export function buildTunnelGeometry(
  definition: CourseDefinition,
  floor: (x: number, z: number) => number,
  ground?: (x: number, z: number) => number,
  projectFloor?: (source: THREE.BufferGeometry) => THREE.BufferGeometry,
): TunnelGeometry | undefined {
  const bores = tunnelBores(definition, floor);
  if (!bores.length) return;
  const positions: number[] = [],
    lining: number[] = [],
    floors: number[] = [],
    floorPositions: number[] = [];
  const add = (triangle: THREE.Vector3[], target: number[], trim: boolean) => {
    let polygon: number[][] = triangle.map((p) => p.toArray());
    if (trim && ground)
      polygon = splitPolygon(polygon, (p) => p[1] - ground(p[0], p[2]) + 0.02).inside;
    if (polygon.length < 3) return;
    const vertices = target === floors ? floorPositions : positions;
    const base = vertices.length / 3;
    for (const p of polygon) vertices.push(...p);
    for (let i = 1; i < polygon.length - 1; i++) target.push(base, base + i, base + i + 1);
  };
  for (const { rings } of bores) {
    for (let i = 1; i < rings.length; i++) {
      const a = rings[i - 1],
        b = rings[i];
      for (let j = 0; j < a.length - 1; j++) {
        add([a[j], a[j + 1], b[j]], lining, true);
        add([b[j], a[j + 1], b[j + 1]], lining, true);
      }
      const feet = [a[0], b[0], a.at(-1)!, b.at(-1)!].map(
        (p) => new THREE.Vector3(p.x, floor(p.x, p.z), p.z),
      );
      add([feet[0], feet[1], feet[2]], floors, false);
      add([feet[2], feet[1], feet[3]], floors, false);
    }
  }
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute(floorPositions, 3));
  source.setIndex(floors);
  const projected = projectFloor ? projectFloor(source) : source;
  const floorVertices = projected.getAttribute('position');
  const floorIndex = projected.getIndex();
  const base = positions.length / 3;
  for (let i = 0; i < floorVertices.count; i++)
    positions.push(floorVertices.getX(i), floorVertices.getY(i), floorVertices.getZ(i));
  const floorIndices = Array.from(
    { length: floorIndex?.count ?? floorVertices.count },
    (_, i) => base + (floorIndex ? floorIndex.getX(i) : i),
  );
  if (projected !== source) projected.dispose();
  source.dispose();
  const vertices = new Float32Array(positions);
  const liningIndices = nondegenerateIndices(vertices, lining);
  return {
    positions: vertices,
    indices: new Uint32Array([...liningIndices, ...nondegenerateIndices(vertices, floorIndices)]),
    collisionIndices: new Uint32Array(liningIndices),
    liningCount: liningIndices.length,
  };
}

export function createTunnelMeshes(
  data: TunnelGeometry,
  colors: { lining?: THREE.ColorRepresentation; ground?: THREE.ColorRepresentation } = {},
  groundMaterial?: THREE.MeshStandardMaterial,
) {
  const group = new THREE.Group();
  group.name = 'tunnels';
  for (const [name, indices, color] of [
    ['tunnel-lining', data.indices.subarray(0, data.liningCount), colors.lining ?? 0x77756e],
    ['tunnel-floor', data.indices.subarray(data.liningCount), colors.ground ?? 0x665b43],
  ] as const) {
    let geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const material =
      name === 'tunnel-floor' && groundMaterial
        ? groundMaterial
        : new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide });
    if (name === 'tunnel-floor' && groundMaterial) {
      const count = data.positions.length / 3;
      const uv = new Float32Array(count * 2);
      for (let i = 0; i < count; i++)
        uv.set([data.positions[i * 3] / 6, data.positions[i * 3 + 2] / 6], i * 2);
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3),
      );
      geometry.setAttribute(
        'vegetation',
        new THREE.BufferAttribute(new Float32Array(count * 2), 2),
      );
      geometry.setAttribute(
        'sceneryRoad',
        new THREE.BufferAttribute(new Float32Array(count).fill(1000), 1),
      );
    }
    const source = geometry;
    geometry = mergeVertices(source);
    source.dispose();
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
