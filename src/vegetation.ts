import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import models from './vegetation-assets/models.json';
import pineAtlas from './vegetation-assets/pine-atlas.webp';
import oakAtlas from './vegetation-assets/oak-atlas.webp';
import aspenAtlas from './vegetation-assets/aspen-atlas.webp';
import bushPineAtlas from './vegetation-assets/bushPine-atlas.webp';
import bushAshAtlas from './vegetation-assets/bushAsh-atlas.webp';
import bushAspenAtlas from './vegetation-assets/bushAspen-atlas.webp';
import rock1Url from './vegetation-assets/rock1.webp';
import {
  detailedPlants,
  treeSpecies,
  bushSpecies,
  vegetationGeometry,
  vegetationTexture,
  type PlantSpecies,
} from './vegetation-models';

export type VegetationDetail = 'low' | 'medium' | 'high';
export type VegetationMode = 'performance' | 'quality' | 'ultra';
type Kind = 'trees' | 'bush' | 'rocks';
type Part = { geometry: THREE.BufferGeometry; material: THREE.Material; name: string };
type VegetationTime = 'noon' | 'sunset' | 'night';
const lightingAtlases = import.meta.glob<string>('./vegetation-assets/*-atlas-*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function setVegetationTime(parent: THREE.Object3D, time: VegetationTime) {
  parent.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshBasicMaterial)) continue;
      const maps = material.userData.vegetationAtlases as
        | Record<VegetationTime, THREE.Texture>
        | undefined;
      if (maps) material.map = maps[time];
    }
  });
}
export interface VegetationPlacements {
  matrices: THREE.Matrix4[];
  shades: number[];
}

export const vegetationDetails = {
  low: { near: 0, trees: 500, ultraTrees: 180, bush: 85, rocks: 65, density: 0.35 },
  medium: { near: 65, trees: 650, ultraTrees: 300, bush: 105, rocks: 105, density: 0.65 },
  high: { near: 95, trees: 800, ultraTrees: 450, bush: 125, rocks: 160, density: 1 },
} as const;

const transitionWidth = 20;
const chunkRadius = Math.SQRT2 * 32;
const lodPosition = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();

class PlantLOD extends THREE.LOD {
  override update(camera: THREE.Camera) {
    super.update(camera);
    lodPosition.setFromMatrixPosition(this.matrixWorld);
    cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    const zoom =
      camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera
        ? camera.zoom
        : 1;
    const distance = lodPosition.distanceTo(cameraPosition) / zoom;
    if (this.userData.vegetationMode === 'ultra') {
      this.levels[0].object.visible = distance < this.levels[2].distance;
      this.levels[1].object.visible = false;
      this.levels[2].object.visible = !this.levels[0].object.visible;
      return;
    }
    if (!this.userData.vegetationTransition) return;
    if (
      this.levels[1].distance > 0 &&
      Math.abs(distance - this.levels[1].distance) < chunkRadius + transitionWidth / 2 &&
      distance < this.levels[2].distance
    ) {
      this.levels[0].object.visible = true;
      this.levels[1].object.visible = true;
    }
  }
}

function transitionMaterial(source: THREE.Material, distant: boolean) {
  const material = source.clone();
  if (source.userData.vegetationAtlases)
    material.userData.vegetationAtlases = source.userData.vegetationAtlases;
  const range = { value: 0 };
  material.userData.vegetationRange = range;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.vegetationRange = range;
    shader.vertexShader = `varying float vPlantDistance;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 plantCenter = vec4(0.0, 0.0, 0.0, 1.0);
      #ifdef USE_INSTANCING
        plantCenter = instanceMatrix * plantCenter;
      #endif
      vPlantDistance = distance(cameraPosition, (modelMatrix * plantCenter).xyz);`,
    );
    shader.fragmentShader =
      `uniform float vegetationRange;\nvarying float vPlantDistance;\n${shader.fragmentShader}`.replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
        if (vegetationRange > 0.0) {
          float blend = smoothstep(vegetationRange - ${transitionWidth / 2}.0,
            vegetationRange + ${transitionWidth / 2}.0, vPlantDistance);
          float noise = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
          if (${distant ? 'noise >= blend' : 'noise < blend'}) discard;
        }`,
      );
  };
  material.customProgramCacheKey = () => `vegetation-transition-${distant}`;
  return material;
}

export function setVegetationTransition(parent: THREE.Object3D, enabled: boolean) {
  parent.traverse((object) => {
    if (!(object instanceof PlantLOD)) return;
    object.userData.vegetationTransition = enabled;
    applyDetail(object, object.userData.vegetationDetail ?? 'medium');
  });
}

export function setVegetationMode(parent: THREE.Object3D, mode: VegetationMode) {
  parent.traverse((object) => {
    if (!(object instanceof THREE.LOD) || !object.userData.vegetationKind) return;
    object.userData.vegetationMode = mode;
    applyDetail(object, object.userData.vegetationDetail ?? 'medium');
  });
}

function applyDetail(lod: THREE.LOD, detail: VegetationDetail) {
  const settings = vegetationDetails[detail];
  const kind = lod.userData.vegetationKind as Kind;
  const performance = (lod.userData.vegetationMode ?? 'performance') === 'performance';
  const ultra = lod.userData.vegetationMode === 'ultra';
  if (kind === 'trees' || kind === 'bush') {
    lod.levels[1].distance =
      kind === 'trees'
        ? Math.min(settings.near, performance ? 65 : 95)
        : Math.min(settings.near, performance ? 30 : 55);
    lod.levels[2].distance =
      kind === 'trees'
        ? ultra
          ? settings.ultraTrees
          : Math.min(settings.trees, performance ? 300 : 600)
        : settings.bush;
    if (ultra) lod.levels[1].distance = lod.levels[2].distance;
  } else lod.levels[1].distance = settings.rocks;
  lod.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const range = object.material.userData.vegetationRange;
      if (range)
        range.value = lod.userData.vegetationTransition && !ultra ? lod.levels[1].distance : 0;
    }
    if (!(object instanceof THREE.InstancedMesh) || !object.userData.groundCoverCount) return;
    const density = settings.density * (kind === 'bush' && performance ? 0.6 : 1);
    object.count = Math.ceil(object.userData.groundCoverCount * density);
  });
}

export function setVegetationDetail(parent: THREE.Object3D, detail: VegetationDetail) {
  parent.traverse((object) => {
    if (object instanceof THREE.LOD && object.userData.vegetationKind) {
      object.userData.vegetationDetail = detail;
      applyDetail(object, detail);
    }
  });
}

function cutout(species: PlantSpecies, parts: Part[], url: string): Part {
  const box = new THREE.Box3();
  for (const { geometry } of parts) {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  }
  const extent =
    Math.max(
      box.max.y,
      2 *
        Math.max(
          Math.abs(box.min.x),
          Math.abs(box.max.x),
          Math.abs(box.min.z),
          Math.abs(box.max.z),
        ),
    ) * 1.05;
  const cards = [0, 1].map((view) => {
    const card = new THREE.PlaneGeometry(extent, extent);
    const uv = card.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) + view) / 2);
    card.rotateY((view * Math.PI) / 2).translate(0, box.max.y / 2, 0);
    return card;
  });
  const geometry = mergeGeometries(cards);
  cards.forEach((card) => card.dispose());
  function lightingTexture(time: 'sunset' | 'night') {
    const url = lightingAtlases[`./vegetation-assets/${species}-atlas-${time}.webp`];
    if (!url) throw new Error(`Missing ${time} vegetation atlas for ${species}`);
    return vegetationTexture(url);
  }
  const maps = {
    noon: vegetationTexture(url),
    sunset: lightingTexture('sunset'),
    night: lightingTexture('night'),
  };
  const material = new THREE.MeshBasicMaterial({
    map: maps.noon,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
  });
  material.userData.vegetationAtlases = maps;
  return {
    geometry,
    material,
    name: species.startsWith('bush') ? 'shrubs' : 'tree-crowns',
  };
}

export function addVegetation(plants: THREE.Group, placements: Record<Kind, VegetationPlacements>) {
  const detailed = detailedPlants();
  const sourceMaterials = new Set<THREE.Material>(
    Object.values(detailed).flatMap((parts) => parts.map((part) => part.material)),
  );
  const atlases = {
    pine: pineAtlas,
    oak: oakAtlas,
    aspen: aspenAtlas,
    bushPine: bushPineAtlas,
    bushAsh: bushAshAtlas,
    bushAspen: bushAspenAtlas,
  };
  const resources = new THREE.Group();
  resources.name = 'vegetation-resources';
  resources.visible = false;
  plants.add(resources);

  function batches(
    kind: Kind,
    entries: VegetationPlacements,
    parts: Part[],
    distant?: Part[],
    species?: PlantSpecies,
  ) {
    if (distant) {
      distant.forEach((part) => sourceMaterials.add(part.material));
      parts = parts.map((part) => ({
        ...part,
        material: transitionMaterial(part.material, false),
      }));
      distant = distant.map((part) => ({
        ...part,
        material: transitionMaterial(part.material, true),
      }));
      // Resource meshes keep every time-of-day texture visible to course disposal.
      for (const part of distant) {
        const maps = part.material.userData.vegetationAtlases;
        for (const map of Object.values<THREE.Texture>(maps)) {
          resources.add(new THREE.Mesh(part.geometry, new THREE.MeshBasicMaterial({ map })));
        }
      }
    }
    // Keep ownership even when a course has no placements for a particular model.
    for (const part of [...parts, ...(distant ?? [])]) {
      resources.add(new THREE.Mesh(part.geometry, part.material));
    }
    if (!entries.matrices.length) return;
    const chunks = new Map<string, number[]>();
    const chunkSize = 64;
    entries.matrices.forEach((matrix, index) => {
      const key = `${Math.floor(matrix.elements[12] / chunkSize)}/${Math.floor(matrix.elements[14] / chunkSize)}`;
      const indices = chunks.get(key) ?? [];
      indices.push(index);
      chunks.set(key, indices);
    });
    const tint = new THREE.Color();
    for (const [key, indices] of chunks) {
      const [x, z] = key.split('/').map(Number);
      const lod = distant ? new PlantLOD() : new THREE.LOD();
      lod.name = `${kind}-lod`;
      lod.userData.vegetationKind = kind;
      if (species) lod.userData.treeSpecies = species;
      lod.position.set(
        (x + 0.5) * chunkSize,
        entries.matrices[indices[0]].elements[13],
        (z + 0.5) * chunkSize,
      );
      // Prefix counts then remain spatially uniform at every detail setting.
      indices.sort((a, b) => entries.shades[a] - entries.shades[b]);
      for (const [level, meshes] of [parts, ...(distant ? [distant] : [])].entries()) {
        const group = new THREE.Group();
        for (const part of meshes) {
          const mesh = new THREE.InstancedMesh(part.geometry, part.material, indices.length);
          mesh.name = part.name;
          mesh.position.copy(lod.position).multiplyScalar(-1);
          indices.forEach((index, i) => {
            mesh.setMatrixAt(i, entries.matrices[index]);
            mesh.setColorAt(i, tint.setScalar(0.78 + entries.shades[index] * 0.22));
          });
          mesh.userData.groundCoverCount = indices.length;
          mesh.castShadow = level === 0;
          mesh.receiveShadow = level === 0;
          mesh.computeBoundingSphere();
          group.add(mesh);
        }
        lod.addLevel(group, level ? 105 : 0, 0.1);
      }
      lod.addLevel(new THREE.Group(), kind === 'trees' ? 650 : 100, 0.1);
      plants.add(lod);
    }
  }

  const mixed = treeSpecies.map(() => ({
    matrices: [] as THREE.Matrix4[],
    shades: [] as number[],
  }));
  placements.trees.matrices.forEach((matrix, i) => {
    const shade = placements.trees.shades[i];
    const entry = mixed[Math.min(2, Math.floor(shade * 3))];
    entry.matrices.push(matrix);
    entry.shades.push((shade * 3) % 1);
  });
  for (const [i, species] of treeSpecies.entries()) {
    const parts = detailed[species];
    batches('trees', mixed[i], parts, [cutout(species, parts, atlases[species])], species);
  }
  const bushes = bushSpecies.map(() => ({
    matrices: [] as THREE.Matrix4[],
    shades: [] as number[],
  }));
  placements.bush.matrices.forEach((matrix, i) => {
    const shade = placements.bush.shades[i];
    const entry = bushes[Math.min(bushSpecies.length - 1, Math.floor(shade * bushSpecies.length))];
    entry.matrices.push(matrix);
    entry.shades.push((shade * bushSpecies.length) % 1);
  });
  for (const [i, species] of bushSpecies.entries()) {
    batches(
      'bush',
      bushes[i],
      detailed[species],
      [cutout(species, detailed[species], atlases[species])],
      species,
    );
  }
  const rocks = ['rock1', 'rock2', 'rock3'] as const;
  const rockMaterial = new THREE.MeshStandardMaterial({
    map: vegetationTexture(rock1Url),
    roughness: 1,
  });
  for (const [variant, name] of rocks.entries()) {
    const entries = { matrices: [] as THREE.Matrix4[], shades: [] as number[] };
    placements.rocks.matrices.forEach((matrix, i) => {
      if (i % rocks.length !== variant) return;
      entries.matrices.push(matrix);
      entries.shades.push(placements.rocks.shades[i]);
    });
    batches('rocks', entries, [
      {
        geometry: vegetationGeometry(models[name]),
        material: rockMaterial,
        name: 'mossy-rocks',
      },
    ]);
  }
  setVegetationDetail(plants, 'medium');
  sourceMaterials.forEach((material) => material.dispose());
  // Plants never move; hidden LODs otherwise recompute thousands of matrices each render.
  plants.updateWorldMatrix(true, true);
  plants.traverse((object) => {
    object.matrixAutoUpdate = false;
    object.matrixWorldAutoUpdate = false;
  });
}
