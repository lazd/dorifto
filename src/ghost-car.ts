import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { carHeadlightRanges } from './car';
import type { loadCar } from './car';

type Car = Awaited<ReturnType<typeof loadCar>>;

// Exterior shell only; the cabin and engine bay would just add see-through clutter.
const bodyParts =
  /^((Body2|Front|Hood|rbumper|Wing|Mirrors)_Paint|Windows_Windows|BlackTrim|Mustache|HLblack|hlglass|glasstails|glassmiddle|Glasstop|334_T_001_001_LightsGlass|Rubber_001_001_Black|Cornerglass|72_T_Cornerglass)/;
const trimParts =
  /^(BlackTrim|Mustache|Rubber_|Cube_Black|68_T_003_001_Plastico|Fenderlight1_Plastico|glasstails|glassmiddle|Glasstop|334_T_001_001_LightsGlass)/;
const frontParts =
  /^(FogGlass_|Projectorglass_|Chin_003_001_Paint|Badge_(Insideglass|003_001_Chrome|001_001_Badgecolor))/;
const wheelParts = /^(tyr_|llantaoem)/;
const brakeParts = /^(184_001_001_BrakeRefraction_0$|thirdrefraction_|brakebulbrear_)/;
const ghostOpacity = 0.38;
const lightIntensity = 0.45;
const groundLightIntensity = 4;
const brakeGlow = 4;

function mergeParts(meshes: { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[]) {
  const geometries = meshes.map(({ mesh, matrix }) => {
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', source.getAttribute('position'));
    const colors = new Float32Array(source.getAttribute('position').count * 3);
    colors.fill(trimParts.test(mesh.name) ? 0.6 : 1);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (source.getAttribute('normal'))
      geometry.setAttribute('normal', source.getAttribute('normal'));
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
  const prepass = new THREE.MeshBasicMaterial({
    colorWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  const material = new THREE.MeshStandardMaterial({
    color: 0x9ee8ff,
    emissive: 0x3a9fd0,
    emissiveIntensity: 0.7,
    roughness: 0.35,
    metalness: 0,
    transparent: true,
    opacity: ghostOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    const lightingChunk = THREE.ShaderChunk.lights_fragment_begin;
    const spotStart = lightingChunk.indexOf('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )');
    const spotLoopEnd = lightingChunk.indexOf('#pragma unroll_loop_end', spotStart);
    const spotEnd =
      spotLoopEnd < 0 ? -1 : lightingChunk.indexOf('#endif', spotLoopEnd) + '#endif'.length;
    if (spotStart < 0 || spotEnd < 0) {
      console.warn('Ghost headlight filter is unavailable in this Three.js shader chunk');
      return;
    }
    const spotLights = lightingChunk.slice(spotStart, spotEnd);
    const lightAssignment = '\t\tspotLight = spotLights[ i ];';
    const directLighting =
      '\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
    if (!spotLights.includes(lightAssignment) || !spotLights.includes(directLighting)) {
      console.warn('Ghost headlight filter markers are unavailable in this shader chunk');
      return;
    }
    const filteredSpotLights = spotLights
      .replace(
        lightAssignment,
        `\t\tspotLight = spotLights[ i ];
\t\tif (abs(spotLight.distance - ${carHeadlightRanges.headlights.toFixed(1)}) > 0.001 &&
\t\t\tabs(spotLight.distance - ${carHeadlightRanges.highBeams.toFixed(1)}) > 0.001 &&
\t\t\tabs(spotLight.distance - ${carHeadlightRanges.fogLights.toFixed(1)}) > 0.001) {`,
      )
      .replace(directLighting, `${directLighting}\n\t\t}`);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>',
      `${lightingChunk.slice(0, spotStart)}${filteredSpotLights}${lightingChunk.slice(spotEnd)}`,
    );
  };
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
    if (
      object instanceof THREE.Mesh &&
      (bodyParts.test(object.name) || trimParts.test(object.name) || frontParts.test(object.name))
    )
      body.push({ mesh: object, matrix: toChassis.clone().multiply(object.matrixWorld) });
  });
  if (!body.length) throw new Error('Missing car body geometry for the ghost car');
  const chassis = new THREE.Group();
  chassis.add(...meshesFor(mergeParts(body)));
  // The lit lenses sit behind the tail glass, so they draw before the depth prepass and cull
  // their back faces rather than depth-testing against the ghost's own shell. Unlit, the glass
  // keeps the ghost look.
  const brakeMaterial = new THREE.MeshBasicMaterial({
    // Overbright so the lenses still read as lit through the ghost's tinted tail glass.
    color: new THREE.Color(0xff1008).multiplyScalar(brakeGlow),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const brakeLenses: { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[] = [];
  car.chassis.traverse((object) => {
    if (object instanceof THREE.Mesh && brakeParts.test(object.name))
      brakeLenses.push({ mesh: object, matrix: toChassis.clone().multiply(object.matrixWorld) });
  });
  if (!brakeLenses.length) throw new Error('Missing brake light geometry for the ghost car');
  const brakeLights = new THREE.Mesh(mergeParts(brakeLenses), brakeMaterial);
  brakeLights.renderOrder = 9;
  brakeLights.visible = false;
  const wheels = car.wheels.map((wheel) => {
    wheel.updateMatrixWorld(true);
    const parts = wheel.children
      .filter(
        (child): child is THREE.Mesh => child instanceof THREE.Mesh && wheelParts.test(child.name),
      )
      .map((mesh) => ({ mesh, matrix: mesh.matrix.clone() }));
    const group = new THREE.Group();
    if (parts.length) group.add(...meshesFor(mergeParts(parts)));
    return group;
  });
  const root = new THREE.Group();
  root.name = 'ghost-car';
  root.visible = false;
  root.add(chassis, ...wheels);
  // Keep the light count stable so ghost visibility never recompiles the scene's shaders.
  const lightRoot = new THREE.Group();
  lightRoot.name = 'ghost-car-lights';
  lightRoot.matrixAutoUpdate = false;
  const lights = [-1.2, 0, 1.2].map((z) => {
    const light = new THREE.PointLight(0x9ee8ff, 0, 8, 2);
    light.position.set(0, 0.65, z);
    lightRoot.add(light);
    return light;
  });
  const groundLights = [-1, 1].map((z) => {
    const light = new THREE.SpotLight(0x9ee8ff, 0, 7, Math.PI * 0.4, 1, 2);
    light.position.set(0, 0.65, z);
    light.target.position.set(0, -1, z);
    lightRoot.add(light, light.target);
    return light;
  });
  scene.add(root, lightRoot);
  function updateLights() {
    chassis.updateWorldMatrix(true, false);
    lightRoot.matrix.copy(chassis.matrixWorld);
    lightRoot.matrixWorldNeedsUpdate = true;
    const fade = root.visible ? material.opacity / ghostOpacity : 0;
    for (const light of lights) light.intensity = lightIntensity * fade;
    for (const light of groundLights) light.intensity = groundLightIntensity * fade;
  }
  chassis.add(brakeLights);

  return {
    chassis,
    wheels,
    get visible() {
      return root.visible;
    },
    set visible(visible: boolean) {
      root.visible = visible;
      updateLights();
    },
    /** Fade overlapping ghosts slightly in chase view and fully in cabin view. */
    fadeNear(position: THREE.Vector3, cabinView: boolean) {
      const distance = chassis.position.distanceTo(position);
      const fade = THREE.MathUtils.smoothstep(distance, 2.5, 7);
      material.opacity = ghostOpacity * THREE.MathUtils.lerp(cabinView ? 0 : 0.7, 1, fade);
      brakeMaterial.opacity = material.opacity / ghostOpacity;
      updateLights();
    },
    setBraking(braking: boolean) {
      brakeLights.visible = braking;
    },
  };
}
