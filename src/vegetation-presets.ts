import * as THREE from 'three';
import { plantGuides, type PresetSpecies } from './vegetation-guides';

/** Offline generation only; game rendering uses the saved meshes and atlases. */
export async function generateVegetationModels() {
  const { Tree } = await import('@dgreenheck/ez-tree');
  const models = {} as Record<
    PresetSpecies,
    { branches: THREE.BufferGeometry; leaves: THREE.BufferGeometry }
  >;
  for (const species of Object.keys(plantGuides) as PresetSpecies[]) {
    const tree = new Tree();
    Object.assign(tree.options, structuredClone(plantGuides[species]));
    tree.options.bark.textured = false;
    const { branch, leaves } = tree.options;
    branch.sections[0] = 5;
    branch.segments[0] = 6;
    for (const level of [1, 2, 3] as const) {
      branch.sections[level] = Math.min(4, branch.sections[level]);
      branch.segments[level] = 3;
    }
    if (species === 'pine') {
      branch.children[0] = 40;
      leaves.count = 12;
      leaves.size *= 1.4;
    } else if (species === 'oak') {
      branch.children[0] = 4;
      branch.children[1] = 3;
      branch.children[2] = 2;
      leaves.count = 10;
      leaves.size *= 1.3;
    } else if (species === 'aspen') {
      branch.children[0] = 10;
      branch.children[1] = 3;
      leaves.count = 8;
      leaves.size *= 1.3;
    } else {
      branch.children[0] = Math.min(5, branch.children[0]);
      branch.children[1] = Math.min(3, branch.children[1]);
      branch.children[2] = Math.min(2, branch.children[2]);
      leaves.count = Math.min(6, leaves.count);
      leaves.size *= 1.3;
    }
    tree.generate();
    const parts = { branches: tree.branchesMesh.geometry, leaves: tree.leavesMesh.geometry };
    const box = new THREE.Box3();
    for (const geometry of Object.values(parts)) {
      geometry.computeBoundingBox();
      box.union(geometry.boundingBox!);
    }
    const height = { pine: 15, oak: 10, aspen: 14, bushPine: 1.5, bushAsh: 1.5, bushAspen: 1.5 }[
      species
    ];
    const maxRadius = {
      pine: 3.2,
      oak: 3.8,
      aspen: 2.8,
      bushPine: 1.2,
      bushAsh: 1.2,
      bushAspen: 1.2,
    }[species];
    const vertical = height / (box.max.y - box.min.y);
    const radius = Math.max(
      Math.abs(box.min.x),
      Math.abs(box.max.x),
      Math.abs(box.min.z),
      Math.abs(box.max.z),
    );
    const horizontal = Math.min(vertical, maxRadius / radius);
    for (const geometry of Object.values(parts))
      geometry.translate(0, -box.min.y, 0).scale(horizontal, vertical, horizontal);
    for (const mesh of [tree.branchesMesh, tree.leavesMesh]) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    }
    models[species] = parts;
  }
  return models;
}
