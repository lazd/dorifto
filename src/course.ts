import * as THREE from 'three';
import type { CourseDefinition } from './courses';
import {
  courseCornerAt,
  courseGateDistances,
  courseKerbSegments,
  courseLineWidth,
  courseRoute,
  courseShoulderWidth,
} from './courses';
import { surfaceMaterial } from './surfaces';
import { CourseTerrain } from './terrain';
import { courseTurnSignPlacements, createTurnSignFactory, type TurnSignMode } from './turn-sign';
import { createTrainingGates } from './racing-line';
import type { LapGateMode } from './configuration-state';
import { createTrainingGateGeometry, createTrainingGateMaterial } from './training-gates';

export const coneDimensions = {
  height: 0.595,
  bottomRadius: 0.1955,
  topRadius: 0.03825,
  baseWidth: 0.476,
  baseHeight: 0.051,
  centerOfMassHeight: 0.09,
};

export function createCourse(scene: THREE.Scene, definition: CourseDefinition, carWidth: number) {
  const group = new THREE.Group();
  group.name = 'course';
  function dispose() {
    group.removeFromParent();
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
  try {
    const course = buildCourse(group, definition, carWidth);
    scene.add(group);
    return { ...course, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

function buildCourse(scene: THREE.Group, definition: CourseDefinition, carWidth: number) {
  const route = courseRoute({ ...definition, reverse: false });
  const terrain = new CourseTerrain(definition);
  scene.add(terrain.mesh);
  let trainingReverse: boolean | undefined;
  function updateTrainingGates(reverse: boolean) {
    if (trainingReverse === reverse) return;
    const lapGateGeometry = createTrainingGateGeometry(
      createTrainingGates({ ...definition, reverse }, carWidth),
      (x, z) => terrain.heightAt(x, z),
    );
    lapGateMesh.geometry.dispose();
    lapGateMesh.geometry = lapGateGeometry;
    trainingReverse = reverse;
  }
  const lapGateMaterial = createTrainingGateMaterial();
  const lapGateMesh = new THREE.Mesh(new THREE.BufferGeometry(), lapGateMaterial);
  lapGateMesh.name = 'debug-lap-gates';
  lapGateMesh.renderOrder = 10;
  lapGateMesh.visible = false;
  scene.add(lapGateMesh);
  const { height, bottomRadius, topRadius, baseWidth, baseHeight, centerOfMassHeight } =
    coneDimensions;
  const originOffset = height / 2 - centerOfMassHeight;
  const bodyHeight = height - baseHeight;
  const coneGeometry = new THREE.CylinderGeometry(topRadius, bottomRadius, bodyHeight, 24);
  coneGeometry.translate(0, baseHeight / 2 + originOffset, 0);
  const baseGeometry = new THREE.BoxGeometry(baseWidth, baseHeight, baseWidth);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.95 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xf07424, roughness: 0.65 });
  const stripeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.22,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  });
  // Match the cone's taper exactly; a slight radius offset avoids z-fighting.
  const radiusAt = (y: number) =>
    THREE.MathUtils.lerp(bottomRadius, topRadius, (y + height / 2 - baseHeight) / bodyHeight) +
    0.001;
  const stripeHeight = height * 0.2;
  const stripeCenter = height / 14;
  const stripeGeometry = new THREE.CylinderGeometry(
    radiusAt(stripeCenter + stripeHeight / 2),
    radiusAt(stripeCenter - stripeHeight / 2),
    stripeHeight,
    24,
    1,
    true,
  );
  const cones: THREE.Mesh[] = [];
  const cornerCones: THREE.Mesh[] = [];
  const length = route.getLength();
  const gates = Math.ceil(length / (definition.coneSpacing ?? 6));
  const across = new THREE.Vector3();
  for (let i = 0; i < gates; i++) {
    const t = i / gates;
    const distance = (i * length) / gates;
    const center = route.getPointAt(t);
    const tangent = route.getTangentAt(t);
    const corner = courseCornerAt(route, distance);
    across.set(tangent.z, 0, -tangent.x).normalize();
    for (const side of [-1, 1]) {
      const cone = new THREE.Mesh(coneGeometry, orange);
      const coneOffset = definition.width / 2 + 0.8 + baseWidth / Math.SQRT2 + 0.1;
      cone.position.copy(center).addScaledVector(across, side * coneOffset);
      const normal = terrain.normalAt(cone.position.x, cone.position.z);
      cone.position.y = terrain.heightAt(cone.position.x, cone.position.z);
      cone.position.addScaledVector(normal, centerOfMassHeight);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      // Clear the whole square footprint, not just its center on curved ground.
      let clearance = 0;
      const support = new THREE.Vector3();
      for (const x of [-baseWidth / 2, 0, baseWidth / 2]) {
        for (const z of [-baseWidth / 2, 0, baseWidth / 2]) {
          support
            .set(x, -centerOfMassHeight, z)
            .applyQuaternion(cone.quaternion)
            .add(cone.position);
          clearance = Math.max(clearance, terrain.heightAt(support.x, support.z) - support.y);
        }
      }
      cone.position.y += clearance + 0.005;
      cone.castShadow = true;
      cone.receiveShadow = true;
      const base = new THREE.Mesh(baseGeometry, baseMaterial);
      base.position.y = baseHeight / 2 - centerOfMassHeight;
      base.castShadow = true;
      base.receiveShadow = true;
      cone.add(base);
      const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
      stripe.position.y = stripeCenter + originOffset;
      stripe.receiveShadow = true;
      cone.add(stripe);
      scene.add(cone);
      cones.push(cone);
      if (corner) cornerCones.push(cone);
    }
  }

  const white = new THREE.MeshBasicMaterial({ color: 0xe1e6df, side: THREE.DoubleSide });
  const dark = new THREE.MeshBasicMaterial({ color: 0x20282b, side: THREE.DoubleSide });
  const segments = Math.ceil(length / 0.5);
  function ribbon(
    offset: number,
    width: number,
    height: number,
    material: THREE.Material,
    from = 0,
    to = 1,
  ) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const lateral: number[] = [];
    const steps = Math.max(1, Math.ceil((to - from) * segments));
    for (let i = 0; i <= steps; i++) {
      const t = THREE.MathUtils.lerp(from, to, i / steps);
      const center = route.getPointAt(t);
      const tangent = route.getTangentAt(t);
      across.set(tangent.z, 0, -tangent.x).normalize();
      for (const edge of [-width / 2, width / 2]) {
        const point = center.clone().addScaledVector(across, offset + edge);
        positions.push(point.x, height, point.z);
        uvs.push(point.x / 5, point.z / 5);
        lateral.push(edge);
      }
    }
    const indices: number[] = [];
    for (let i = 0; i < steps; i++) {
      const j = i * 2;
      indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('lateral', new THREE.Float32BufferAttribute(lateral, 1));
    geometry.setIndex(indices);
    const projected = terrain.projectGeometry(geometry, height);
    geometry.dispose();
    const mesh = new THREE.Mesh(projected, material);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  const asphalt = surfaceMaterial(
    'asphalt',
    1,
    definition.padRadius === undefined
      ? definition.width / 2 + (definition.shoulderWidth ?? courseShoulderWidth)
      : undefined,
  );
  asphalt.polygonOffset = true;
  asphalt.polygonOffsetFactor = 1;
  asphalt.polygonOffsetUnits = 1;
  if (definition.padRadius !== undefined) {
    const geometry = new THREE.CircleGeometry(definition.padRadius, 256);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      uv.setXY(i, positions.getX(i) / 5, positions.getZ(i) / 5);
    }
    const projected = definition.flat
      ? geometry.translate(0, 0.008, 0)
      : terrain.projectGeometry(geometry, 0.008);
    if (projected !== geometry) geometry.dispose();
    const pad = new THREE.Mesh(projected, asphalt);
    pad.name = 'skidpad-asphalt';
    pad.receiveShadow = true;
    scene.add(pad);
  } else
    ribbon(
      0,
      definition.width + (definition.shoulderWidth ?? courseShoulderWidth) * 2,
      0.008,
      asphalt,
    );
  for (const side of [-1, 1]) ribbon((side * definition.width) / 2, courseLineWidth, 0.016, white);
  if (definition.doubleYellow) {
    const yellow = new THREE.MeshBasicMaterial({ color: 0xffd32a, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const line = ribbon(side * courseLineWidth, courseLineWidth, 0.016, yellow);
      line.name = 'double-yellow-center-line';
    }
  }
  const columns = Math.ceil(definition.width / 0.5);
  const tileWidth = definition.width / columns;
  for (const gateT of courseGateDistances({ ...definition, reverse: false }, length).map(
    (d) => d / length,
  )) {
    const start = route.getPointAt(gateT);
    const startTangent = route.getTangentAt(gateT);
    across.set(startTangent.z, 0, -startTangent.x).normalize();
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < columns; column++) {
        const tile = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>(
          new THREE.PlaneGeometry(tileWidth, 0.5),
          (row + column) % 2 ? dark : white,
        );
        tile.rotation.set(-Math.PI / 2, 0, Math.atan2(startTangent.x, startTangent.z));
        tile.position
          .copy(start)
          .addScaledVector(across, -definition.width / 2 + (column + 0.5) * tileWidth)
          .addScaledVector(startTangent, row * 0.5)
          .setY(0.02);
        tile.updateMatrix();
        const geometry = tile.geometry.clone().applyMatrix4(tile.matrix);
        tile.geometry.dispose();
        tile.geometry = terrain.projectGeometry(geometry, 0.02);
        geometry.dispose();
        tile.position.set(0, 0, 0);
        tile.rotation.set(0, 0, 0);
        scene.add(tile);
      }
    }
  }
  const signVariants = [false, true].flatMap((reverse) =>
    (['few', 'several', 'many'] as const).map((mode) => ({ reverse, mode })),
  );
  const turnSignGroups = signVariants.map(({ reverse, mode }) => {
    const group = new THREE.Group();
    group.name = `${reverse ? 'reverse' : 'forward'}-${mode}-turn-signs`;
    const signRoute = reverse ? courseRoute({ ...definition, reverse: true }) : route;
    const turns = courseTurnSignPlacements(signRoute, mode, (x, z) => terrain.heightAt(x, z));
    if (!turns.length) {
      scene.add(group);
      return group;
    }
    const createSign = createTurnSignFactory();
    for (const { distance, direction } of turns) {
      const t = distance / signRoute.getLength();
      const position = signRoute.getPointAt(t);
      const tangent = signRoute.getTangentAt(t);
      across.set(tangent.z, 0, -tangent.x).normalize();
      position.addScaledVector(across, -direction * (definition.width / 2 + 3.5));

      const sign = createSign(direction);
      sign.position.copy(position);
      sign.position.y = terrain.heightAt(position.x, position.z);
      sign.rotation.y = Math.atan2(-tangent.x, -tangent.z);
      group.add(sign);
    }
    scene.add(group);
    return group;
  });
  let turnSignMode: TurnSignMode = 'several';
  let directionReverse = definition.reverse ?? false;
  function setDirection(reverse: boolean) {
    updateTrainingGates(reverse);
    directionReverse = reverse;
    turnSignGroups.forEach((group, i) => {
      group.visible = signVariants[i].mode === turnSignMode && signVariants[i].reverse === reverse;
    });
  }
  function setTurnSignMode(mode: TurnSignMode) {
    if (mode === turnSignMode) return;
    turnSignMode = mode;
    setDirection(directionReverse);
  }
  setDirection(definition.reverse ?? false);
  const curbRed = new THREE.MeshStandardMaterial({
    color: 0xbc2823,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const curbWhite = new THREE.MeshStandardMaterial({
    color: 0xe6e3d7,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const curbPositions: number[][] = [[], []];
  const kerbs = definition.padRadius === undefined ? courseKerbSegments(route) : [];
  for (const { distance, endDistance, direction } of kerbs) {
    const curb = ribbon(
      direction * (definition.width / 2 + 0.4),
      0.8,
      0.024,
      curbRed,
      distance / length,
      endDistance / length,
    );
    const positions = curb.geometry.getAttribute('position');
    curbPositions[Math.round(distance / (length / Math.ceil(length / 2))) % 2].push(
      ...Array.from(positions.array),
    );
    scene.remove(curb);
    curb.geometry.dispose();
  }
  curbPositions.forEach((positions, i) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const curbs = new THREE.Mesh(geometry, i ? curbWhite : curbRed);
    curbs.name = 'inside-corner-curbs';
    curbs.receiveShadow = true;
    scene.add(curbs);
  });
  return {
    cones,
    cornerCones,
    turnSignGroups,
    terrain,
    setLapGates(mode: LapGateMode) {
      lapGateMesh.visible = mode !== 'off';
      lapGateMaterial.uniforms.rainbow.value = mode === 'rainbow' ? 1 : 0;
    },
    setDirection,
    setTurnSignMode,
    isAsphalt: (position: THREE.Vector3) => terrain.isAsphalt(position),
  };
}
