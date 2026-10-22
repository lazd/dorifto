import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { loadCar } from './car';

type Car = Awaited<ReturnType<typeof loadCar>>;

// Exterior shell only; the cabin and engine bay would just add see-through clutter.
const bodyParts = /^((Body2|Front|Hood|rbumper|Wing|Mirrors)_Paint|Windows_Windows|BlackTrim|Mustache|HLblack|hlglass|glasstails|glassmiddle|Cornerglass|72_T_Cornerglass)/;
const wheelParts = /^(tyr_|llantaoem)/;
const ghostOpacity = 0.38;

function mergeParts(meshes: { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[]) {
  const geometries = meshes.map(({ mesh, matrix }) => {
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', source.getAttribute('position'));
    if (source.getAttribute('normal')) geometry.setAttribute('normal', source.getAttribute('normal'));
    else geometry.computeVertexNormals();
    return geometry.applyMatrix4(matrix);
  });
  const merged = mergeGeometries(geometries);
  if (!merged) throw new Error('Unable to build ghost car geometry');
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}

/**
 * A translucent, non-colliding copy of the car. A depth-only prepass makes only the
 * nearest surface visible, so overlapping panels don't stack into a muddy blob.
 */
export function createGhostCar(scene: THREE.Scene, car: Car) {
  const prepass = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
  const material = new THREE.MeshStandardMaterial({
    color: 0x9ee8ff, emissive: 0x3a9fd0, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0,
    transparent: true, opacity: ghostOpacity, depthWrite: false,
  });
  const meshesFor = (geometry: THREE.BufferGeometry) => {
    const depth = new THREE.Mesh(geometry, prepass);
    const color = new THREE.Mesh(geometry, material);
    depth.renderOrder = 10;
    color.renderOrder = 11;
    return [depth, color];
  };

  car.chassis.updateMatrixWorld(true);
  const toChassis = car.chassis.matrixWorld.clone().invert();
  const body: { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[] = [];
  car.chassis.traverse((object) => {
    if (object instanceof THREE.Mesh && bodyParts.test(object.name))
      body.push({ mesh: object, matrix: toChassis.clone().multiply(object.matrixWorld) });
  });
  if (!body.length) throw new Error('Missing car body geometry for the ghost car');
  const chassis = new THREE.Group();
  chassis.add(...meshesFor(mergeParts(body)));
  const wheels = car.wheels.map((wheel) => {
    wheel.updateMatrixWorld(true);
    const parts = wheel.children
      .filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && wheelParts.test(child.name))
      .map((mesh) => ({ mesh, matrix: mesh.matrix.clone() }));
    const group = new THREE.Group();
    if (parts.length) group.add(...meshesFor(mergeParts(parts)));
    return group;
  });
  const root = new THREE.Group();
  root.name = 'ghost-car';
  root.visible = false;
  root.add(chassis, ...wheels);
  scene.add(root);

  return {
    chassis,
    wheels,
    get visible() { return root.visible; },
    set visible(visible: boolean) { root.visible = visible; },
    /** Fade out when the ghost overlaps the player so it doesn't fill the cabin view. */
    fadeNear(position: THREE.Vector3) {
      const distance = chassis.position.distanceTo(position);
      material.opacity = ghostOpacity * THREE.MathUtils.smoothstep(distance, 2.5, 7);
    },
  };
}
