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
export type VegetationMode = 'performance' | 'quality';
type Kind = 'trees' | 'bush' | 'rocks';
type Part = { geometry: THREE.BufferGeometry; material: THREE.Material; name: string };
export interface VegetationPlacements {
  matrices: THREE.Matrix4[];
  shades: number[];
}

export const vegetationDetails = {
  low: { near: 0, trees: 500, bush: 85, rocks: 65, density: 0.35 },
  medium: { near: 65, trees: 650, bush: 105, rocks: 105, density: 0.65 },
  high: { near: 95, trees: 800, bush: 125, rocks: 160, density: 1 },
} as const;

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
  const performance = lod.userData.vegetationMode !== 'quality';
  if (kind === 'trees' || kind === 'bush') {
    lod.levels[1].distance =
      kind === 'trees'
        ? Math.min(settings.near, performance ? 65 : 95)
        : Math.min(settings.near, performance ? 30 : 55);
    lod.levels[2].distance =
      kind === 'trees' ? Math.min(settings.trees, performance ? 300 : 600) : settings.bush;
  } else lod.levels[1].distance = settings.rocks;
  lod.traverse((object) => {
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
  return {
    geometry,
    material: new THREE.MeshBasicMaterial({
      map: vegetationTexture(url),
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    }),
    name: species.startsWith('bush') ? 'shrubs' : 'tree-crowns',
  };
}

export function addVegetation(plants: THREE.Group, placements: Record<Kind, VegetationPlacements>) {
  const detailed = detailedPlants();
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
      const lod = new THREE.LOD();
      lod.name = `${kind}-lod`;
      lod.userData.vegetationKind = kind;
      if (species) lod.userData.treeSpecies = species;
      lod.position.set(
        (x + 0.5) * chunkSize,
        entries.matrices[indices[0]].elements[13],
        (z + 0.5) * chunkSize,
      );
      if (kind !== 'trees') {
        // Prefix counts then remain spatially uniform at every detail setting.
        indices.sort((a, b) => entries.shades[a] - entries.shades[b]);
      }
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
          if (kind !== 'trees') mesh.userData.groundCoverCount = indices.length;
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
}
