import * as THREE from 'three';
import models from './vegetation-assets/models.json';
import pineUrl from './vegetation-assets/pine.png';
import oakUrl from './vegetation-assets/oak.png';
import barkUrl from './vegetation-assets/bark.jpg';

export { THREE };
export const treeSpecies = ['pine', 'oak', 'fir'] as const;
export type PlantSpecies = (typeof treeSpecies)[number] | 'bush';

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
  return Object.fromEntries(
    [...treeSpecies, 'bush' as const].map((species) => [
      species,
      [
        {
          geometry: vegetationGeometry(models[species].branches),
          material: branchesMaterial,
          name: 'tree-trunks',
        },
        {
          geometry: vegetationGeometry(models[species].leaves),
          material: new THREE.MeshStandardMaterial({
            map: species === 'pine' || species === 'fir' ? pine : oak,
            color: species === 'fir' ? 0xb5c9b3 : 0xffffff,
            roughness: 1,
            side: THREE.DoubleSide,
            alphaTest: 0.4,
          }),
          name: species === 'bush' ? 'shrubs' : 'tree-crowns',
        },
      ],
    ]),
  ) as Record<
    PlantSpecies,
    { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; name: string }[]
  >;
}
