import * as THREE from 'three';
import {
  courseGateDistances,
  courseLineWidth,
  courseRoute,
  courseShoulderWidth,
  type CourseDefinition,
} from './courses';
import { CourseTerrain, projectTerrainGeometry } from './terrain';
import { createTunnelMeshes, excavateTunnelTerrain } from './tunnels';
import { createBridgeMeshes } from './bridges';
import { createScenery } from './scenery';

export interface CoursePreviewColors {
  ground: string;
  road: string;
  start: string;
  /** Key and sky light color. */
  light: string;
  /** Hemisphere ground-bounce color. */
  shade: string;
}

/** Terrain cells along the longer side of the preview; the game heightfield is far denser. */
const terrainCells = 128;
/** Ground shown around the road, in meters. */
const terrainMargin = 30;
const roadLift = 0.15;

function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
  group.clear();
}

function meshFrom(positions: number[], indices: number[], material: THREE.Material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

/**
 * Untextured terrain block, road and start line for a course, draped on the same heightfield the
 * game builds. Callers own the result and must call `dispose`.
 */
export function createCoursePreviewModel(
  definition: CourseDefinition,
  colors: Pick<CoursePreviewColors, 'ground' | 'road' | 'start'>,
  cells = terrainCells,
) {
  const group = new THREE.Group();
  try {
    const terrain = new CourseTerrain(
      {
        ...definition,
        scenery: definition.scenery && { ...definition.scenery, bounds: undefined },
      },
      false,
    );
    const route = courseRoute({ ...definition, reverse: false });
    const length = route.getLength();
    const height = (x: number, z: number) => terrain.heightAt(x, z);
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: colors.road,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const halfRoad = definition.width / 2 + (definition.shoulderWidth ?? courseShoulderWidth);
    const bounds = new THREE.Box2();
    if (definition.padRadius !== undefined) {
      const pad = new THREE.CircleGeometry(definition.padRadius, 96);
      pad.rotateX(-Math.PI / 2);
      const position = pad.getAttribute('position');
      for (let i = 0; i < position.count; i++)
        position.setY(i, height(position.getX(i), position.getZ(i)) + roadLift);
      pad.computeVertexNormals();
      group.add(new THREE.Mesh(pad, roadMaterial));
      bounds.expandByPoint(new THREE.Vector2(-definition.padRadius, -definition.padRadius));
      bounds.expandByPoint(new THREE.Vector2(definition.padRadius, definition.padRadius));
    } else {
      const samples = THREE.MathUtils.clamp(Math.round(length / 2), 200, 2000);
      const positions: number[] = [];
      const indices: number[] = [];
      const linePositions: number[] = [];
      const lineIndices: number[] = [];
      for (let i = 0; i < samples; i++) {
        const t = i / (definition.closed === false ? samples - 1 : samples);
        const center = route.getPointAt(t);
        const tangent = route.getTangentAt(t);
        for (const side of [-1, 1]) {
          const x = center.x + tangent.z * side * halfRoad;
          const z = center.z - tangent.x * side * halfRoad;
          positions.push(x, height(x, z) + roadLift, z);
          bounds.expandByPoint(new THREE.Vector2(x, z));
        }
        const j = i * 2;
        const k = ((i + 1) % samples) * 2;
        if (definition.closed !== false || i < samples - 1)
          indices.push(j, k, j + 1, j + 1, k, k + 1);
        if (definition.doubleYellow) {
          for (const side of [-1, 1]) {
            for (const edge of [-0.5, 0.5]) {
              const offset = (side + edge) * courseLineWidth;
              const x = center.x + tangent.z * offset;
              const z = center.z - tangent.x * offset;
              linePositions.push(x, height(x, z) + roadLift * 2, z);
            }
            const from = i * 4 + (side === -1 ? 0 : 2);
            const to = ((i + 1) % samples) * 4 + (side === -1 ? 0 : 2);
            if (definition.closed !== false || i < samples - 1)
              lineIndices.push(from, to, from + 1, from + 1, to, to + 1);
          }
        }
      }
      group.add(meshFrom(positions, indices, roadMaterial));
      if (definition.doubleYellow) {
        const line = meshFrom(
          linePositions,
          lineIndices,
          new THREE.MeshBasicMaterial({
            color: 0xffd32a,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -1,
          }),
        );
        line.name = 'double-yellow-center-line';
        group.add(line);
      }
    }
    for (const startT of courseGateDistances({ ...definition, reverse: false }, length).map(
      (d) => d / length,
    )) {
      const start = route.getPointAt(startT);
      const startTangent = route.getTangentAt(startT);
      const startPositions: number[] = [];
      for (const along of [-1, 1])
        for (const side of [-1, 1]) {
          const x = start.x + startTangent.z * side * halfRoad + startTangent.x * along;
          const z = start.z - startTangent.x * side * halfRoad + startTangent.z * along;
          startPositions.push(x, height(x, z) + roadLift * 2, z);
        }
      group.add(
        meshFrom(
          startPositions,
          [0, 2, 1, 1, 2, 3],
          new THREE.MeshBasicMaterial({ color: colors.start, side: THREE.DoubleSide }),
        ),
      );
    }

    bounds.expandByScalar(definition.scenery ? 300 : terrainMargin);
    const minX = Math.max(bounds.min.x, terrain.minX);
    const minZ = Math.max(bounds.min.y, terrain.minZ);
    let maxX = Math.min(bounds.max.x, terrain.minX + (terrain.columns - 1) * terrain.spacing);
    let maxZ = Math.min(bounds.max.y, terrain.minZ + (terrain.rows - 1) * terrain.spacing);
    const cell = Math.max(maxX - minX, maxZ - minZ) / cells;
    const columns = Math.floor((maxX - minX) / cell) + 1;
    const rows = Math.floor((maxZ - minZ) / cell) + 1;
    maxX = minX + (columns - 1) * cell;
    maxZ = minZ + (rows - 1) * cell;
    const positions: number[] = [];
    const indices: number[] = [];
    const heights = new Float32Array(columns * rows);
    const groundHeights = new Float32Array(heights.length);
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const x = Math.min(minX + column * cell, maxX);
        const z = Math.min(minZ + row * cell, maxZ);
        const ground = terrain.exteriorHeightAt(x, z);
        positions.push(x, ground, z);
        groundHeights[row * columns + column] = ground;
        heights[row * columns + column] = height(x, z);
        if (row && column) {
          const i = row * columns + column;
          indices.push(i - columns - 1, i - 1, i - columns, i - columns, i - 1, i);
        }
      }
    const previewTerrain = {
      minX,
      minZ,
      columns,
      rows,
      spacing: cell,
      heights,
      minHeight: terrain.minHeight,
      maxHeight: terrain.maxHeight,
    };
    for (const object of group.children) {
      if (!(object instanceof THREE.Mesh)) continue;
      const source = object.geometry;
      object.geometry = projectTerrainGeometry(
        terrain.bridgeMesh || terrain.collisionMesh ? terrain : previewTerrain,
        source,
        object === group.children[0] ? roadLift : roadLift * 2,
      );
      source.dispose();
    }
    // Outward-facing walls and a downward-facing cap close the terrain into a solid block.
    const base = terrain.minHeight - Math.max(4, (maxX - minX) * 0.02);
    const edge = [
      ...Array.from({ length: columns }, (_, column) => column),
      ...Array.from({ length: rows - 1 }, (_, row) => (row + 1) * columns + columns - 1),
      ...Array.from({ length: columns - 1 }, (_, column) => rows * columns - 2 - column),
      ...Array.from({ length: rows - 1 }, (_, row) => (rows - 2 - row) * columns),
    ];
    const skirt = positions.length / 3;
    for (const i of edge) positions.push(positions[i * 3], base, positions[i * 3 + 2]);
    const bottom = positions.length / 3;
    positions.push((minX + maxX) / 2, base, (minZ + maxZ) / 2);
    for (let i = 0; i < edge.length - 1; i++) {
      indices.push(edge[i], edge[i + 1], skirt + i, edge[i + 1], skirt + i + 1, skirt + i);
      indices.push(bottom, skirt + i, skirt + i + 1);
    }
    const ground = meshFrom(
      positions,
      indices,
      new THREE.MeshStandardMaterial({ color: colors.ground, roughness: 1, flatShading: true }),
    );
    ground.name = 'preview-ground';
    if (terrain.collisionMesh) {
      const source = ground.geometry;
      ground.geometry = excavateTunnelTerrain(source, definition, height);
      source.dispose();
    }
    group.add(ground);
    if (terrain.collisionMesh)
      group.add(
        createTunnelMeshes(terrain.collisionMesh, { ground: colors.ground, lining: colors.road }),
      );
    if (terrain.bridgeMesh)
      group.add(createBridgeMeshes(terrain.bridgeMesh, { concrete: colors.road }));
    if (definition.scenery)
      group.add(
        createScenery(definition, terrain, {
          projectGroundGeometry: (source, lift, horizontal) =>
            projectTerrainGeometry(
              { ...previewTerrain, heights: groundHeights },
              source,
              Math.max(lift, roadLift),
              undefined,
              horizontal,
            ),
        }).group,
      );
    return { group, dispose: () => disposeGroup(group) };
  } catch (error) {
    disposeGroup(group);
    throw error;
  }
}

/**
 * Renders one still frame per call, so the preview costs nothing between selections.
 * The WebGL context only lives until `dispose`.
 */
export class CoursePreviewRenderer {
  private renderer: THREE.WebGLRenderer | null = null;

  constructor(private readonly container: HTMLElement) {}

  render(definition: CourseDefinition, colors: CoursePreviewColors, label: string) {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) throw new Error('Course preview has no visible area');
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setClearAlpha(0);
      this.renderer.domElement.setAttribute('role', 'img');
      this.container.append(this.renderer.domElement);
    }
    const renderer = this.renderer;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.domElement.setAttribute('aria-label', label);
    const model = createCoursePreviewModel(definition, colors);
    try {
      const scene = new THREE.Scene();
      // Course maps draw +X right with +Z up, which is the mirror of a view from above.
      model.group.scale.x = -1;
      scene.add(model.group);
      scene.add(new THREE.HemisphereLight(colors.light, colors.shade, 1.6));
      const sun = new THREE.DirectionalLight(colors.light, 1.8);
      sun.position.set(-0.6, 1, 0.35);
      scene.add(sun);
      const sphere = new THREE.Box3()
        .setFromObject(model.group)
        .getBoundingSphere(new THREE.Sphere());
      const camera = new THREE.PerspectiveCamera(30, width / height, 1, 1);
      const fit = THREE.MathUtils.degToRad(camera.fov / 2) * Math.min(1, camera.aspect);
      const distance = sphere.radius / Math.sin(fit);
      camera.near = Math.max(0.1, distance - sphere.radius * 2);
      camera.far = distance + sphere.radius * 2;
      camera.position.set(0.55, 1.1, -1).setLength(distance).add(sphere.center);
      camera.lookAt(sphere.center);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    } finally {
      model.dispose();
    }
  }

  dispose() {
    if (!this.renderer) return;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.renderer = null;
  }
}
