import * as THREE from 'three';
import { courseRoute, courseShoulderWidth, type CourseDefinition } from './courses';
import { terrainRasterSampler } from './terrain-profile';
import type { TriangleMeshData } from './terrain-query';

export const tunnelShoulderClearance = 0.5;

export interface TunnelGeometry extends TriangleMeshData {
  liningCount: number;
}

/** Covers the existing road cut without replacing its drivable heightfield floor. */
export function buildTunnelGeometry(
  definition: CourseDefinition,
  floor: (x: number, z: number) => number,
): TunnelGeometry | undefined {
  const spans = definition.structures?.filter(({ type }) => type === 'tunnel');
  if (!spans?.length || definition.flat) return;
  const route = courseRoute({ ...definition, reverse: false });
  const length = route.getLength();
  const halfWidth = definition.width / 2 + (definition.shoulderWidth ?? courseShoulderWidth);
  const boreWidth = halfWidth + tunnelShoulderClearance;
  const coverWidth = halfWidth + (definition.terrainTransition ?? 12) + 6;
  const ground = definition.terrain ? terrainRasterSampler(definition.terrain) : floor;
  const elevationScale = definition.elevationScale ?? 1;
  const wallHeight = 3;
  const crownHeight = 6.5;
  const sides = 16;
  const positions: number[] = [];
  const lining: number[] = [];
  const cover: number[] = [];
  const across = new THREE.Vector3();
  for (const { start, end } of spans) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 1 || end <= start)
      throw new Error('Invalid tunnel span');
    const steps = Math.max(1, Math.ceil(((end - start) * length) / 2));
    const rings: { inner: number[]; outer: number[]; contour: THREE.Vector2[] }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = THREE.MathUtils.lerp(start, end, i / steps);
      const center = route.getPointAt(t);
      const tangent = route.getTangentAt(t);
      across.set(tangent.z, 0, -tangent.x).normalize();
      const base = floor(center.x, center.z);
      const inner: number[] = [];
      const outer: number[] = [];
      const contour: THREE.Vector2[] = [];
      const add = (offset: number, height: number) => {
        const index = positions.length / 3;
        positions.push(center.x + across.x * offset, height, center.z + across.z * offset);
        return index;
      };
      // Vertical sidewalls and an elliptical crown leave full shoulder clearance.
      for (let j = 0; j <= sides + 2; j++) {
        const angle = (Math.PI * Math.max(0, Math.min(sides, j - 1))) / sides;
        const offset = -boreWidth * Math.cos(angle);
        const height =
          j === 0 || j === sides + 2
            ? floor(center.x + across.x * offset, center.z + across.z * offset) - 0.15
            : base + wallHeight + Math.sin(angle) * (crownHeight - wallHeight);
        inner.push(add(offset, height));
        contour.push(new THREE.Vector2(offset, height));
      }
      const outerContour: THREE.Vector2[] = [];
      for (let j = 0; j <= sides; j++) {
        const offset = THREE.MathUtils.lerp(-coverWidth, coverWidth, j / sides);
        const x = center.x + across.x * offset;
        const z = center.z + across.z * offset;
        const blend = THREE.MathUtils.smoothstep(Math.abs(offset), boreWidth, coverWidth);
        const top = Math.max(
          ground(x, z) * (definition.terrain ? elevationScale : 1),
          base + crownHeight + 1,
        );
        const height = THREE.MathUtils.lerp(top, floor(x, z), blend);
        outer.push(add(offset, height));
        outerContour.push(new THREE.Vector2(offset, height));
      }
      rings.push({ inner, outer, contour: [...contour, ...outerContour.reverse()] });
      if (i === 0) continue;
      const previous = rings[i - 1];
      for (const [from, to, indices, inward] of [
        [previous.inner, inner, lining, true],
        [previous.outer, outer, cover, false],
      ] as const) {
        for (let j = 0; j < from.length - 1; j++) {
          const quad = [from[j], from[j + 1], to[j], to[j], from[j + 1], to[j + 1]];
          indices.push(...(inward ? quad : quad.reverse()));
        }
      }
      // Seal the narrow outer sides between the cut's ground and the bore wall feet.
      for (const side of [0, 1]) {
        const a = side ? previous.inner.at(-1)! : previous.inner[0];
        const b = side ? inner.at(-1)! : inner[0];
        const c = side ? previous.outer.at(-1)! : previous.outer[0];
        const d = side ? outer.at(-1)! : outer[0];
        cover.push(...(side ? [a, c, b, c, d, b] : [a, b, c, c, b, d]));
      }
    }
    for (const [end, ring] of [rings[0], rings.at(-1)!].entries()) {
      const vertices = [...ring.inner, ...[...ring.outer].reverse()];
      for (const triangle of THREE.ShapeUtils.triangulateShape(ring.contour, [])) {
        const [a, b, c] = triangle.map((i) => ring.contour[i]);
        const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        cover.push(
          ...(area * (end ? 1 : -1) > 0 ? triangle : triangle.reverse()).map((i) => vertices[i]),
        );
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array([...lining, ...cover]),
    liningCount: lining.length,
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
    ['tunnel-mountain', data.indices.subarray(data.liningCount), colors.ground ?? 0x665b43],
  ] as const) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const material =
      name === 'tunnel-mountain' && groundMaterial
        ? groundMaterial
        : new THREE.MeshStandardMaterial({
            color,
            roughness: 0.95,
            side: THREE.DoubleSide,
          });
    if (name === 'tunnel-mountain' && groundMaterial) {
      const count = data.positions.length / 3;
      const uv = new Float32Array(count * 2);
      const vegetation = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        uv.set([data.positions[i * 3] / 6, data.positions[i * 3 + 2] / 6], i * 2);
        vegetation.set([100, Math.PI / 2], i * 2);
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3),
      );
      geometry.setAttribute('vegetation', new THREE.BufferAttribute(vegetation, 2));
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
