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
import { addNearbyRoadDirt, addRoadDirt, surfaceMaterial } from './surfaces';
import { CourseTerrain } from './terrain';
import { courseTurnSignPlacements, createTurnSignFactory, type TurnSignMode } from './turn-sign';
import { createTrainingGates } from './racing-line';
import type { ConfigurationState, LapGateMode } from './configuration-state';
import { createTrainingGateGeometry, createTrainingGateMaterial } from './training-gates';
import { createScenery } from './scenery';

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
  // A complete map's roads are the pavement; the course only marks a route over them.
  const overlay = definition.scenery?.bounds !== undefined && definition.padRadius === undefined;
  terrain.grass.name = 'roadside-grass';
  scene.add(terrain.mesh);
  const roadDirtVisible = { value: 1 };
  const scenery = createScenery(definition, terrain, {
    createRoadMaterial: () => surfaceMaterial('asphalt'),
    addRoadDirt: (material) =>
      addNearbyRoadDirt(material, roadDirtVisible, definition.shoulderWidth ?? courseShoulderWidth),
    projectGroundGeometry: (source, lift, horizontal) =>
      terrain.projectGroundGeometry(source, lift, horizontal),
  });
  scene.add(scenery.group);
  if (definition.scenery?.roads.length)
    terrain.setSceneryRoadDistance((x, z) => scenery.pavementEdgeDistance(x, z));
  const junctionsVisible = { value: 1 };
  /** Hides the material (with `feather`) and any road dirt on it where side roads join. */
  function maskJunctionMaterial(material: THREE.Material, feather?: number) {
    const compile = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      shader.uniforms.junctionsVisible = junctionsVisible;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float junction;\nvarying float vJunction;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvJunction = junction;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float junctionsVisible;\nvarying float vJunction;',
        )
        .replace(
          'float aa = max(fwidth(edgeDistance), DIRT_FEATHER);',
          `float junctionSoil = (1.0 - smoothstep(0.0, 3.0, vJunction)) * junctionsVisible;
reach = mix(reach, mix(DIRT_MIN, DIRT_MAX, 0.5) + ragged, junctionSoil);
float aa = max(fwidth(edgeDistance), max(DIRT_FEATHER, junctionSoil * 0.15));`,
        )
        .replace(
          '// road dirt mask',
          'dirtCover *= mix(1.0, smoothstep(-0.9, 0.9, vJunction), junctionsVisible);',
        );
      if (feather !== undefined)
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <alphatest_fragment>',
          `#include <alphatest_fragment>
diffuseColor.a *= mix(1.0, smoothstep(-${feather.toFixed(2)}, ${feather.toFixed(2)}, vJunction), junctionsVisible);
if (diffuseColor.a < ${material.transparent ? '0.01' : '0.5'}) discard;`,
        );
    };
    material.customProgramCacheKey = () => `${key}-junctions-${feather}`;
  }
  function maskJunctionGeometry(geometry: THREE.BufferGeometry, margin = 0) {
    const positions = geometry.getAttribute('position');
    geometry.setAttribute(
      'junction',
      new THREE.BufferAttribute(
        Float32Array.from(
          { length: positions.count },
          (_, i) => scenery.roadDistance(positions.getX(i), positions.getZ(i), true) - margin,
        ),
        1,
      ),
    );
  }
  const grassMask = new Float32Array(terrain.grass.count);
  const grassMatrix = new THREE.Matrix4();
  for (let i = 0; i < grassMask.length; i++) {
    terrain.grass.getMatrixAt(i, grassMatrix);
    grassMask[i] = scenery.roadDistance(grassMatrix.elements[12], grassMatrix.elements[14], true);
  }
  terrain.grass.geometry.setAttribute('junction', new THREE.InstancedBufferAttribute(grassMask, 1));
  for (const material of Array.isArray(terrain.grass.material)
    ? terrain.grass.material
    : [terrain.grass.material])
    maskJunctionMaterial(material);
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
  const shoulder = definition.shoulderWidth ?? courseShoulderWidth;
  const cones: THREE.Mesh[] = [];
  const cornerCones: THREE.Mesh[] = [];
  const junctionCones: THREE.Mesh[] = [];
  const length = route.getLength();
  const gates = Math.ceil(length / (definition.coneSpacing ?? 6));
  const across = new THREE.Vector3();
  function placeCone(position: THREE.Vector3) {
    const cone = new THREE.Mesh(coneGeometry, orange);
    cone.position.copy(position);
    const normal = terrain.normalAt(cone.position.x, cone.position.z);
    cone.position.y = terrain.heightAt(cone.position.x, cone.position.z);
    cone.position.addScaledVector(normal, centerOfMassHeight);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    let clearance = 0;
    const support = new THREE.Vector3();
    for (const x of [-baseWidth / 2, 0, baseWidth / 2]) {
      for (const z of [-baseWidth / 2, 0, baseWidth / 2]) {
        support.set(x, -centerOfMassHeight, z).applyQuaternion(cone.quaternion).add(cone.position);
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
    return cone;
  }
  for (let i = 0; i < gates; i++) {
    const t = i / gates;
    const distance = (i * length) / gates;
    const center = route.getPointAt(t);
    const tangent = route.getTangentAt(t);
    const corner = courseCornerAt(route, distance);
    across.set(tangent.z, 0, -tangent.x).normalize();
    for (const side of [-1, 1]) {
      // Stay on the shoulder; beyond it the ground may already be climbing a wall.
      const coneOffset =
        definition.width / 2 + Math.min(0.8 + baseWidth / Math.SQRT2 + 0.1, shoulder);
      const cone = placeCone(center.clone().addScaledVector(across, side * coneOffset));
      if (corner) cornerCones.push(cone);
    }
  }
  for (const { x, z } of scenery.junctionCones)
    junctionCones.push(placeCone(new THREE.Vector3(x, 0, z)));

  const paint = (color: number) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.75, side: THREE.DoubleSide });
  // Dirt washes in from beyond the pavement or kerbs, whichever reaches further. It always
  // covers the pavement edge and drifts up to just past the edge line, across every surface.
  const dirtEdge = definition.width / 2 + Math.max(shoulder, 0.8);
  const dirtMin = dirtEdge - definition.width / 2 - shoulder;
  const dirtMax = dirtEdge - definition.width / 2 + 0.35;
  const addDirt = (material: THREE.MeshStandardMaterial) =>
    !overlay &&
    definition.padRadius === undefined &&
    addRoadDirt(material, dirtEdge, dirtMin, dirtMax, roadDirtVisible);
  const white = paint(0xe1e6df);
  const dark = paint(0x20282b);
  addDirt(white);
  addDirt(dark);
  const segments = Math.ceil(length / 0.5);
  function ribbon(
    offset: number | ((fraction: number) => number),
    width: number,
    height: number,
    material: THREE.Material,
    from = 0,
    to = 1,
    relativeLateral = false,
  ) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const lateral: number[] = [];
    const structure: number[] = [];
    const steps = Math.max(1, Math.ceil((to - from) * segments));
    for (let i = 0; i <= steps; i++) {
      const t = THREE.MathUtils.lerp(from, to, i / steps);
      const center = route.getPointAt(t);
      const tangent = route.getTangentAt(t);
      across.set(tangent.z, 0, -tangent.x).normalize();
      const centerOffset = typeof offset === 'number' ? offset : offset(t);
      const onStructure = definition.structures?.some(({ start, end }) => t >= start && t <= end);
      for (const edge of [-width / 2, width / 2]) {
        const point = center.clone().addScaledVector(across, centerOffset + edge);
        positions.push(point.x, height, point.z);
        uvs.push(point.x / 5, point.z / 5);
        lateral.push(relativeLateral ? edge : centerOffset + edge);
        structure.push(onStructure ? 1 : 0);
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
    if (definition.structures?.length)
      geometry.setAttribute('structure', new THREE.Float32BufferAttribute(structure, 1));
    geometry.setIndex(indices);
    const projected = terrain.projectGeometry(geometry, height);
    geometry.dispose();
    const mesh = new THREE.Mesh(projected, material);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  // Complete maps pave only the course's tunnels; mapped roads pave everything else.
  const pavedSpans = overlay
    ? (definition.structures?.filter(({ type }) => type === 'tunnel') ?? [])
    : [{ start: 0, end: 1 }];
  const asphalt = surfaceMaterial('asphalt');
  const asphaltDirt = addDirt(asphalt);
  if (asphaltDirt) maskJunctionMaterial(asphalt);
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
    for (const { start, end } of pavedSpans) {
      const road = ribbon(0, definition.width + shoulder * 2, 0.008, asphalt, start, end);
      if (asphaltDirt) maskJunctionGeometry(road.geometry);
    }
  const edgeWhite = paint(0xe1e6df);
  addDirt(edgeWhite);
  maskJunctionMaterial(edgeWhite, 0.25);
  for (const { start, end } of pavedSpans)
    for (const side of [-1, 1]) {
      const edge = ribbon(
        (side * definition.width) / 2,
        courseLineWidth,
        0.016,
        edgeWhite,
        start,
        end,
      );
      maskJunctionGeometry(edge.geometry, courseLineWidth);
    }
  if (definition.doubleYellow) {
    const yellow = paint(0xffd32a);
    for (const { start, end } of pavedSpans)
      for (const side of [-1, 1]) {
        const line = ribbon(side * courseLineWidth, courseLineWidth, 0.016, yellow, start, end);
        line.name = 'double-yellow-center-line';
      }
  }
  const columns = Math.ceil(definition.width / 0.5);
  const tileWidth = definition.width / columns;
  // Complete map paints the course over scenery pavement and its markings, which sit higher.
  const gateLift = overlay ? 0.09 : 0.02;
  const gateTiles = new THREE.Group();
  gateTiles.name = 'start-finish-lines';
  scene.add(gateTiles);
  /** Paints the checkered start (and open-road finish) lines for the given gate placement. */
  function setGates(gates: CourseDefinition['gates']) {
    for (const tile of gateTiles.children as THREE.Mesh[]) tile.geometry.dispose();
    gateTiles.clear();
    for (const gateT of courseGateDistances({ ...definition, reverse: false, gates }, length).map(
      (d) => d / length,
    )) {
      const start = route.getPointAt(gateT);
      const startTangent = route.getTangentAt(gateT);
      across.set(startTangent.z, 0, -startTangent.x).normalize();
      for (let row = 0; row < 2; row++) {
        for (let column = 0; column < columns; column++) {
          const tile = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>(
            new THREE.PlaneGeometry(tileWidth, 0.5),
            (row + column) % 2 ? dark : white,
          );
          tile.rotation.set(-Math.PI / 2, 0, Math.atan2(startTangent.x, startTangent.z));
          tile.position
            .copy(start)
            .addScaledVector(across, -definition.width / 2 + (column + 0.5) * tileWidth)
            .addScaledVector(startTangent, row * 0.5)
            .setY(gateLift);
          tile.updateMatrix();
          const geometry = tile.geometry.clone().applyMatrix4(tile.matrix);
          const corners = geometry.getAttribute('position');
          geometry.setAttribute(
            'lateral',
            new THREE.Float32BufferAttribute(
              Array.from(
                { length: corners.count },
                (_, i) =>
                  (corners.getX(i) - start.x) * across.x + (corners.getZ(i) - start.z) * across.z,
              ),
              1,
            ),
          );
          tile.geometry.dispose();
          tile.geometry = terrain.projectGeometry(geometry, gateLift);
          geometry.dispose();
          tile.position.set(0, 0, 0);
          tile.rotation.set(0, 0, 0);
          tile.receiveShadow = true;
          gateTiles.add(tile);
        }
      }
    }
  }
  setGates(definition.gates);
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
      // Like cones, stay on the shoulder rather than up a roadside slope.
      position.addScaledVector(
        across,
        -direction * (definition.width / 2 + Math.min(3.5, shoulder)),
      );

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
    vertexColors: true,
    transparent: true,
  });
  const curbWhite = new THREE.MeshStandardMaterial({
    color: 0xe6e3d7,
    roughness: 0.85,
    side: THREE.DoubleSide,
    vertexColors: true,
    transparent: true,
  });
  const kerbDirt = addDirt(curbRed) && addDirt(curbWhite);
  if (kerbDirt) for (const material of [curbRed, curbWhite]) maskJunctionMaterial(material);
  const curbAttributes = [0, 1].map(() => ({
    position: [] as number[],
    lateral: [] as number[],
    structure: [] as number[],
  }));
  const kerbs = definition.padRadius === undefined && !overlay ? courseKerbSegments(route) : [];
  for (const { distance, endDistance, direction } of kerbs) {
    const curb = ribbon(
      direction * (definition.width / 2 + 0.4),
      0.8,
      0.024,
      curbRed,
      distance / length,
      endDistance / length,
    );
    const attributes = curbAttributes[Math.round(distance / (length / Math.ceil(length / 2))) % 2];
    for (const [name, values] of Object.entries(attributes)) {
      const attribute = curb.geometry.getAttribute(name);
      const count = curb.geometry.getAttribute('position').count * (name === 'position' ? 3 : 1);
      for (let i = 0; i < count; i++) values.push(attribute ? attribute.array[i] : 0);
    }
    scene.remove(curb);
    curb.geometry.dispose();
  }
  const kerbMeshes = curbAttributes.map((attributes, i) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, values] of Object.entries(attributes))
      geometry.setAttribute(
        name,
        new THREE.Float32BufferAttribute(values, name === 'position' ? 3 : 1),
      );
    if (kerbDirt) maskJunctionGeometry(geometry);
    geometry.computeVertexNormals();
    // Vanish as soon as the shoulder starts curving up into a roadside wall (about 8°), while
    // tolerating steep road grades.
    const normals = geometry.getAttribute('normal');
    const colors = new Float32Array(normals.count * 4).fill(1);
    for (let v = 0; v < normals.count; v++) {
      colors[v * 4 + 3] = THREE.MathUtils.smoothstep(Math.abs(normals.getY(v)), 0.99, 0.996);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    const curbs = new THREE.Mesh(geometry, i ? curbWhite : curbRed);
    curbs.name = 'inside-corner-curbs';
    curbs.receiveShadow = true;
    scene.add(curbs);
    return curbs;
  });
  return {
    cones,
    cornerCones,
    junctionCones,
    scenery,
    setScenery(
      settings: Pick<
        ConfigurationState,
        'showBuildings' | 'showWater' | 'showVegetation' | 'showNearbyRoads'
      >,
    ) {
      scenery.setVisible('buildings', settings.showBuildings);
      scenery.setVisible('water', settings.showWater);
      scenery.setVisible('vegetation', settings.showVegetation);
      scenery.setVisible('nearbyRoads', settings.showNearbyRoads);
      junctionsVisible.value = terrain.sceneryRoadsVisible.value = settings.showNearbyRoads ? 1 : 0;
    },
    turnSignGroups: [...turnSignGroups, scenery.stopSignGroup],
    terrain,
    setKerbs(visible: boolean) {
      for (const mesh of kerbMeshes) mesh.visible = visible;
    },
    setRoadEdgeDirt(visible: boolean) {
      roadDirtVisible.value = visible ? 1 : 0;
    },
    setLapGates(mode: LapGateMode) {
      lapGateMesh.visible = mode !== 'off';
      lapGateMaterial.uniforms.rainbow.value = mode === 'rainbow' ? 1 : 0;
    },
    setDirection,
    setGates,
    setTurnSignMode,
    /** Drape a strip along the forward route between arc-length fractions, owned by the course. */
    drape: ribbon,
    isAsphalt: (position: THREE.Vector3) =>
      terrain.isAsphalt(position) || scenery.isAsphalt(position),
  };
}
