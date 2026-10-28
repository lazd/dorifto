import * as THREE from 'three';
import { courseRoute, courseShoulderWidth, type CourseDefinition } from './courses';
import type { TriangleMeshData } from './terrain-query';

export const bridgeDimensions = {
  deckThickness: 0.7,
  edgeWidth: 0.4,
  curbHeight: 0.45,
  railingHeight: 1.15,
  postSpacing: 2.5,
  pierSpacing: 28,
  trussMinLength: 120,
  trussMinClearance: 12,
  trussPanelLength: 12,
  trussPierSpacing: 120,
  trussMaxDepth: 20,
  trussBeamWidth: 0.32,
};

export interface BridgeGeometry extends TriangleMeshData {
  concreteCount: number;
  deckSurfaceCount: number;
  trussCount: number;
}

export function buildBridgeGeometry(
  definition: CourseDefinition,
  floor: (x: number, z: number) => number,
  ground: (x: number, z: number) => number,
  projectSurface: (geometry: THREE.BufferGeometry, lift: number) => THREE.BufferGeometry,
): BridgeGeometry | undefined {
  const spans = definition.structures?.filter(({ type }) => type === 'bridge');
  if (!spans?.length || definition.flat) return;
  const route = courseRoute({ ...definition, reverse: false });
  const length = route.getLength();
  const halfWidth = definition.width / 2 + (definition.shoulderWidth ?? courseShoulderWidth);
  const { deckThickness, edgeWidth, curbHeight, railingHeight, postSpacing, pierSpacing } =
    bridgeDimensions;
  const positions: number[] = [];
  const concrete: number[] = [];
  const deckSurface: number[] = [];
  const steel: number[] = [];
  const trusses: number[] = [];
  // Duplicate face vertices so concrete edges and the rails keep crisp normals.
  const quad = (points: THREE.Vector3[], indices: number[]) => {
    const first = positions.length / 3;
    for (const p of points) positions.push(p.x, p.y, p.z);
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };
  const deckTop = (points: THREE.Vector3[]) => {
    const source = new THREE.BufferGeometry();
    source.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        points.flatMap((p) => [p.x, p.y, p.z]),
        3,
      ),
    );
    source.setIndex([0, 1, 2, 0, 2, 3]);
    const projected = projectSurface(source, -0.015);
    try {
      const vertices = projected.getAttribute('position');
      const index = projected.getIndex();
      const first = positions.length / 3;
      for (let i = 0; i < vertices.count; i++)
        positions.push(vertices.getX(i), vertices.getY(i), vertices.getZ(i));
      for (let i = 0; i < (index?.count ?? vertices.count); i++)
        deckSurface.push(first + (index ? index.getX(i) : i));
    } finally {
      source.dispose();
      projected.dispose();
    }
  };
  const frame = (fraction: number) => {
    const center = route.getPointAt(fraction);
    const tangent = route.getTangentAt(fraction);
    const across = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    return {
      point(offset: number, rise: number) {
        const p = center.clone().addScaledVector(across, offset);
        p.y = floor(p.x, p.z) + rise;
        return p;
      },
    };
  };
  const beam = (a: THREE.Vector3, b: THREE.Vector3) => {
    const axis = b.clone().sub(a).normalize();
    const reference =
      Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3()
      .crossVectors(axis, reference)
      .normalize()
      .multiplyScalar(bridgeDimensions.trussBeamWidth / 2);
    const up = new THREE.Vector3()
      .crossVectors(axis, side)
      .normalize()
      .multiplyScalar(bridgeDimensions.trussBeamWidth / 2);
    const ring = (p: THREE.Vector3) => [
      p.clone().add(side).add(up),
      p.clone().sub(side).add(up),
      p.clone().sub(side).sub(up),
      p.clone().add(side).sub(up),
    ];
    const first = ring(a),
      last = ring(b);
    quad([...first].reverse(), trusses);
    quad(last, trusses);
    for (let i = 0; i < 4; i++)
      quad([first[i], first[(i + 1) % 4], last[(i + 1) % 4], last[i]], trusses);
  };
  const sweep = (
    start: number,
    end: number,
    left: number,
    right: number,
    bottom: number,
    top: number,
    indices: number[],
    slab = false,
  ) => {
    const steps = Math.max(1, Math.ceil(((end - start) * length) / 1.5));
    let previous: THREE.Vector3[] | undefined;
    for (let i = 0; i <= steps; i++) {
      const { point } = frame(THREE.MathUtils.lerp(start, end, i / steps));
      const ring = [point(left, bottom), point(right, bottom), point(right, top), point(left, top)];
      // Abutment end caps are buried in the approach terrain. Keep them for collision
      // only: their full-width chords can cross the banked pavement between samples.
      if (!previous) quad([...ring].reverse(), slab ? deckSurface : indices);
      else
        for (let side = 0; side < 4; side++) {
          const next = (side + 1) % 4;
          const points = [previous[side], previous[next], ring[next], ring[side]];
          if (slab && side === 2) deckTop(points);
          else quad(points, indices);
        }
      if (i === steps) quad(ring, slab ? deckSurface : indices);
      previous = ring;
    }
  };
  for (const { start, end } of spans) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 1 || end <= start)
      throw new Error('Invalid bridge span');
    const size = (end - start) * length;
    const center = frame((start + end) / 2).point(0, -deckThickness);
    const truss =
      size >= bridgeDimensions.trussMinLength &&
      center.y - ground(center.x, center.z) >= bridgeDimensions.trussMinClearance;
    const bays = Math.max(
      1,
      Math.ceil(size / (truss ? bridgeDimensions.trussPierSpacing : pierSpacing)),
    );
    // The existing asphalt/paint overlays sit immediately above this structural slab.
    sweep(
      start,
      end,
      -halfWidth - edgeWidth,
      halfWidth + edgeWidth,
      -deckThickness,
      -0.015,
      concrete,
      true,
    );
    for (const side of [-1, 1]) {
      const outer = side * (halfWidth + edgeWidth / 2);
      sweep(start, end, outer - edgeWidth / 2, outer + edgeWidth / 2, -0.03, curbHeight, concrete);
      for (const rise of [0.8, railingHeight])
        sweep(start, end, outer - 0.065, outer + 0.065, rise - 0.07, rise + 0.07, steel);
      const posts = Math.max(1, Math.ceil(size / postSpacing));
      for (let i = 0; i <= posts; i++) {
        const t = THREE.MathUtils.lerp(start, end, i / posts);
        const halfPost = Math.min(0.08 / length, (end - start) / 4);
        sweep(
          Math.max(start, t - halfPost),
          Math.min(end, t + halfPost),
          outer - 0.07,
          outer + 0.07,
          curbHeight,
          railingHeight,
          steel,
        );
      }
    }
    if (truss) {
      const panelsPerBay = Math.ceil(size / bays / bridgeDimensions.trussPanelLength);
      const panels = bays * panelsPerBay;
      let previous: THREE.Vector3[] | undefined;
      for (let i = 0; i <= panels; i++) {
        const t = THREE.MathUtils.lerp(start, end, i / panels);
        const { point } = frame(t);
        const tops = [-1, 1].map((side) => point(side * halfWidth, -deckThickness - 0.2));
        const clearance = Math.min(...tops.map((p) => p.y - ground(p.x, p.z)));
        const bayPosition = (i % panelsPerBay) / panelsPerBay;
        const arch = 0.6 + 0.4 * (2 * bayPosition - 1) ** 2;
        const depth = Math.max(
          0.5,
          Math.min(Math.min(bridgeDimensions.trussMaxDepth, size * 0.055) * arch, clearance - 2),
        );
        const bottoms = tops.map((p) => p.clone().add(new THREE.Vector3(0, -depth, 0)));
        const nodes = [...tops, ...bottoms];
        beam(bottoms[0], bottoms[1]);
        for (let side = 0; side < 2; side++) {
          beam(tops[side], bottoms[side]);
          if (previous) {
            beam(previous[side], tops[side]);
            beam(previous[side + 2], bottoms[side]);
            beam(i % 2 ? previous[side] : previous[side + 2], i % 2 ? bottoms[side] : tops[side]);
          }
        }
        if (previous) beam(previous[2], bottoms[1]);
        previous = nodes;
      }
    }
    for (let i = 1; i < bays; i++) {
      const t = THREE.MathUtils.lerp(start, end, i / bays);
      const { point } = frame(t);
      for (const side of [-1, 1]) {
        const offset = side * halfWidth * 0.65;
        const p = point(offset, -deckThickness);
        const bottom = ground(p.x, p.z) - p.y - deckThickness - 0.5;
        if (bottom > -deckThickness - 2) continue;
        const pierHalfWidth = truss ? THREE.MathUtils.clamp(-bottom * 0.025, 0.65, 2.5) : 0.65;
        sweep(
          t - pierHalfWidth / length,
          t + pierHalfWidth / length,
          offset - pierHalfWidth,
          offset + pierHalfWidth,
          bottom,
          -deckThickness,
          concrete,
        );
      }
      sweep(
        t - 0.9 / length,
        t + 0.9 / length,
        -halfWidth,
        halfWidth,
        -deckThickness - 0.65,
        -deckThickness,
        concrete,
      );
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array([...concrete, ...steel, ...trusses, ...deckSurface]),
    concreteCount: concrete.length,
    deckSurfaceCount: deckSurface.length,
    trussCount: trusses.length,
  };
}

export function createBridgeMeshes(
  data: BridgeGeometry,
  colors: { concrete?: THREE.ColorRepresentation; steel?: THREE.ColorRepresentation } = {},
) {
  const group = new THREE.Group();
  group.name = 'bridges';
  for (const [name, indices, color, metalness] of [
    [
      'bridge-concrete',
      data.indices.subarray(0, data.concreteCount),
      colors.concrete ?? 0xa39e91,
      0,
    ],
    [
      'bridge-railings',
      data.indices.subarray(
        data.concreteCount,
        data.indices.length - data.deckSurfaceCount - data.trussCount,
      ),
      colors.steel ?? 0x76838a,
      0.65,
    ],
    [
      'bridge-trusses',
      data.indices.subarray(
        data.indices.length - data.deckSurfaceCount - data.trussCount,
        data.indices.length - data.deckSurfaceCount,
      ),
      colors.steel ?? 0x526d59,
      0.65,
    ],
  ] as const) {
    if (!indices.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: metalness ? 0.45 : 0.9,
      metalness,
      side: THREE.DoubleSide,
      // The asphalt is the visible slab top; its near-coplanar collision cap is not rendered.
      shadowSide: THREE.BackSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
