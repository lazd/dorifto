import * as THREE from 'three';
import models from './vegetation-assets/models.json';
import pineUrl from './vegetation-assets/pine.png';
import oakUrl from './vegetation-assets/oak.png';
import barkUrl from './vegetation-assets/bark.jpg';
import aspenUrl from './vegetation-assets/aspen.png';
import ashUrl from './vegetation-assets/ash.png';
import aspenBarkUrl from './vegetation-assets/aspen-bark.jpg';
import { plantGuides } from './vegetation-guides';

export { THREE };
export const treeSpecies = ['pine', 'oak', 'aspen'] as const;
export const bushSpecies = ['bushPine', 'bushAsh', 'bushAspen'] as const;
export type PlantSpecies = (typeof treeSpecies)[number] | (typeof bushSpecies)[number];

export function vegetationGeometry(data: typeof models.rock1) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
  geometry.setIndex(data.index);
  return geometry;
}

export function vegetationTexture(url: string) {
  const texture = new THREE.TextureLoader().load(url, undefined, undefined, (error) => {
    console.error(`Could not load vegetation texture ${url}`, error);
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function detailedPlants() {
  const bark = vegetationTexture(barkUrl);
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
  const branchesMaterial = new THREE.MeshStandardMaterial({ map: bark, roughness: 1 });
  const pine = vegetationTexture(pineUrl);
  const oak = vegetationTexture(oakUrl);
  const aspen = vegetationTexture(aspenUrl);
  const ash = vegetationTexture(ashUrl);
  const aspenBark = vegetationTexture(aspenBarkUrl);
  aspenBark.wrapS = aspenBark.wrapT = THREE.RepeatWrapping;
  const aspenBranches = new THREE.MeshStandardMaterial({ map: aspenBark, roughness: 1 });
  const leaves = { pine, oak, aspen, bushPine: pine, bushAsh: ash, bushAspen: aspen };
  return Object.fromEntries(
    [...treeSpecies, ...bushSpecies].map((species) => [
      species,
      [
        {
          geometry: vegetationGeometry(models[species].branches),
          material: species === 'aspen' ? aspenBranches : branchesMaterial,
          name: 'tree-trunks',
        },
        {
          geometry: vegetationGeometry(models[species].leaves),
          material: new THREE.MeshStandardMaterial({
            map: leaves[species],
            color: plantGuides[species].leaves.tint,
            roughness: 1,
            side: THREE.DoubleSide,
            alphaTest: plantGuides[species].leaves.alphaTest,
            forceSinglePass: true,
          }),
          name: species.startsWith('bush') ? 'shrubs' : 'tree-crowns',
        },
      ],
    ]),
  ) as Record<
    PlantSpecies,
    { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; name: string }[]
  >;
}
