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
import { defaultTreeSettings, type TreeSettings } from './tree-settings';

type Kind = 'trees' | 'bush' | 'rocks';
type Part = {
  geometry: THREE.BufferGeometry;
  basicGeometry?: THREE.BufferGeometry;
  material: THREE.Material;
  name: string;
};
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

const treeDensities = [0.2, 0.4, 0.65, 0.8, 1];

const transitionWidth = 20;
const chunkRadius = Math.SQRT2 * 32;
const lodPosition = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();

class PlantLOD extends THREE.LOD {
  override update(camera: THREE.Camera) {
    lodPosition.setFromMatrixPosition(this.matrixWorld);
    cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    const zoom =
      camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera
        ? camera.zoom
        : 1;
    const distance = lodPosition.distanceTo(cameraPosition) / zoom;
    const visible = distance < this.levels[2].distance;
    const bakedOnly = this.userData.treeQuality === 1 || this.userData.trackBakedOnly;
    const bakeDistance = this.levels[1].distance;
    const overlap = this.userData.treeSmoothTransitions ? chunkRadius + transitionWidth / 2 : 0;
    this.levels[0].object.visible =
      visible && !bakedOnly && (bakeDistance === 0 || distance < bakeDistance + overlap);
    this.levels[1].object.visible =
      visible && (bakedOnly || (bakeDistance > 0 && distance >= bakeDistance - overlap));
    this.levels[2].object.visible = !visible;
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

export function setVegetationSettings(
  parent: THREE.Object3D,
  settings: Readonly<TreeSettings & { showGrass: boolean }>,
) {
  parent.traverse((object) => {
    if (!(object instanceof THREE.LOD) || !object.userData.vegetationKind) return;
    const rocks = object.userData.vegetationKind === 'rocks';
    object.visible = rocks ? settings.showGrass : settings.treeDrawDistance > 0;
    const density = rocks ? 0.65 : treeDensities[settings.treeDensity - 1];
    if (object instanceof PlantLOD) {
      object.userData.treeQuality = settings.treeQuality;
      object.userData.treeSmoothTransitions = settings.treeSmoothTransitions;
      object.userData.trackBakedOnly = settings.treeNearTrackOnly && !object.userData.nearTrack;
      object.levels[1].distance = settings.treeBakeDistance;
      object.levels[2].distance = settings.treeDrawDistance;
    }
    const range =
      settings.treeSmoothTransitions && settings.treeQuality > 1 && !object.userData.trackBakedOnly
        ? settings.treeBakeDistance
        : 0;
    object.traverse((child) => {
      if (!(child instanceof THREE.InstancedMesh)) return;
      child.count = Math.ceil(child.userData.groundCoverCount * density);
      if (child.userData.highGeometry) {
        child.geometry =
          settings.treeQuality === 2 ? child.userData.basicGeometry : child.userData.highGeometry;
      }
      const uniform = child.material.userData.vegetationRange;
      if (uniform) uniform.value = range;
    });
  });
}

function basicFoliageGeometry(source: THREE.BufferGeometry) {
  const geometry = source.clone();
  const indices = source.getIndex()!;
  const reduced: number[] = [];
  // Keep complete leaf cards, not isolated triangles, so alpha-tested foliage remains intact.
  for (let i = 0; i < indices.count; i += 24)
    for (let j = 0; j < 12 && i + j < indices.count; j++) reduced.push(indices.getX(i + j));
  geometry.setIndex(reduced);
  return geometry;
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

export function addVegetation(
  plants: THREE.Group,
  placements: Record<Kind, VegetationPlacements>,
  trackEdgeDistance: (x: number, z: number) => number,
) {
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
    let offTrackParts: Part[] | undefined;
    let offTrackDistant: Part[] | undefined;
    if (distant) {
      distant.forEach((part) => sourceMaterials.add(part.material));
      parts = parts.map((part) => ({
        ...part,
        material: transitionMaterial(part.material, false),
      }));
      offTrackParts = parts.map((part) => ({
        ...part,
        material: transitionMaterial(part.material, false),
      }));
      distant = distant.map((part) => ({
        ...part,
        material: transitionMaterial(part.material, true),
      }));
      offTrackDistant = distant.map((part) => ({
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
    for (const part of [
      ...parts,
      ...(offTrackParts ?? []),
      ...(distant ?? []),
      ...(offTrackDistant ?? []),
    ]) {
      resources.add(new THREE.Mesh(part.geometry, part.material));
      if (part.basicGeometry) resources.add(new THREE.Mesh(part.basicGeometry, part.material));
    }
    if (!entries.matrices.length) return;
    const chunks = new Map<string, number[]>();
    const chunkSize = 64;
    entries.matrices.forEach((matrix, index) => {
      const x = matrix.elements[12],
        z = matrix.elements[14];
      const nearTrack = distant && trackEdgeDistance(x, z) <= 20;
      const key = `${Math.floor(x / chunkSize)}/${Math.floor(z / chunkSize)}/${nearTrack ? 1 : 0}`;
      const indices = chunks.get(key) ?? [];
      indices.push(index);
      chunks.set(key, indices);
    });
    const tint = new THREE.Color();
    for (const [key, indices] of chunks) {
      const [x, z, nearTrack] = key.split('/').map(Number);
      const lod = distant ? new PlantLOD() : new THREE.LOD();
      lod.name = `${kind}-lod`;
      lod.userData.vegetationKind = kind;
      lod.userData.nearTrack = Boolean(nearTrack);
      if (species) lod.userData.treeSpecies = species;
      lod.position.set(
        (x + 0.5) * chunkSize,
        entries.matrices[indices[0]].elements[13],
        (z + 0.5) * chunkSize,
      );
      // Prefix counts then remain spatially uniform at every detail setting.
      indices.sort((a, b) => entries.shades[a] - entries.shades[b]);
      const baked = nearTrack ? distant : offTrackDistant;
      const meshes = nearTrack ? parts : (offTrackParts ?? parts);
      for (const [level, levelParts] of [meshes, ...(baked ? [baked] : [])].entries()) {
        const group = new THREE.Group();
        for (const part of levelParts) {
          const mesh = new THREE.InstancedMesh(part.geometry, part.material, indices.length);
          if (part.basicGeometry) {
            mesh.userData.highGeometry = part.geometry;
            mesh.userData.basicGeometry = part.basicGeometry;
          }
          mesh.name = part.name;
          mesh.position.copy(lod.position).multiplyScalar(-1);
          indices.forEach((index, i) => {
            mesh.setMatrixAt(i, entries.matrices[index]);
            mesh.setColorAt(i, tint.setScalar(0.78 + entries.shades[index] * 0.22));
          });
          mesh.userData.groundCoverCount = indices.length;
          mesh.castShadow = level === 0;
          mesh.receiveShadow = level === 0 && part.name !== 'tree-crowns' && part.name !== 'shrubs';
          mesh.computeBoundingSphere();
          group.add(mesh);
        }
        lod.addLevel(group, level ? 105 : 0, 0.1);
      }
      lod.addLevel(new THREE.Group(), distant ? defaultTreeSettings.treeDrawDistance : 105, 0.1);
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
    const parts = detailed[species].map((part) => ({
      ...part,
      basicGeometry: part.name === 'tree-trunks' ? undefined : basicFoliageGeometry(part.geometry),
    }));
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
      detailed[species].map((part) => ({
        ...part,
        basicGeometry:
          part.name === 'tree-trunks' ? undefined : basicFoliageGeometry(part.geometry),
      })),
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
  setVegetationSettings(plants, { ...defaultTreeSettings, showGrass: true });
  sourceMaterials.forEach((material) => material.dispose());
  // Plants never move; hidden LODs otherwise recompute thousands of matrices each render.
  plants.updateWorldMatrix(true, true);
  plants.traverse((object) => {
    object.matrixAutoUpdate = false;
    object.matrixWorldAutoUpdate = false;
  });
}
