import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

type StandardMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

// Real Z32 two-seater length; the export's units are arbitrary.
const CAR_LENGTH_M = 4.31;
const PAINT_COLOR = 0xe51b23;
const WHEEL_COLOR = 0x111216;
// Needle sweeps measured from the instrument-cluster texture.
const SPEEDO_DEG_PER_KMH = 1.338;
const TACH_DEG_PER_RPM = 0.02759;
const BOOST_DEG_PER_MMHG = 0.0523;
// The boost needle's hub is hidden behind the speedometer face, above the sub-dial.
const DOOR_MIRROR_OUTBOARD_DEG = 12;
const TEMP_NORMAL_DEG = 30;
const FUEL_FULL_DEG = 57;
const BOOST_PIVOT = new THREE.Vector3(-0.3258, 0.2205, 0.4106);

export async function loadCar() {
  const { scene: model } = await new GLTFLoader().loadAsync(
    `${import.meta.env.BASE_URL}nissan_300zx/scene.gltf`,
  );
  const chassis = new THREE.Group();
  chassis.add(model);
  let bounds = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(CAR_LENGTH_M / bounds.getSize(new THREE.Vector3()).z);
  bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -bounds.min.y - 0.55, -center.z);
  chassis.updateMatrixWorld(true);

  const meshes: StandardMesh[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    meshes.push(object as StandardMesh);
  });
  // Mesh names are `<node>_<material>_0`; the exported material names are not descriptive.
  const named = (pattern: RegExp) => meshes.filter((mesh) => pattern.test(mesh.name));
  const tuned = new Set<THREE.Material>();
  function tune(pattern: RegExp, settings: {
    color?: number; metalness?: number; roughness?: number; envMapIntensity?: number;
  }) {
    for (const { material } of named(pattern)) {
      if (tuned.has(material)) continue;
      tuned.add(material);
      const { color, ...rest } = settings;
      if (color !== undefined) material.color.set(color);
      Object.assign(material, rest);
    }
  }
  tune(/_Paint_0$/, { color: PAINT_COLOR, metalness: 0.25, roughness: 0.16, envMapIntensity: 0.3 });
  tune(/^llantaoem.*_(llantaoem|wheelalu)_0$/, { color: WHEEL_COLOR, metalness: 0.35, roughness: 0.6 });
  tune(/^llantaoem.*_centercap_0$/, { color: 0x1c1d22, metalness: 0.5, roughness: 0.35 });
  tune(/^tyr_/, { roughness: 0.92 });
  tune(/rotors(front|rear)_0$/, { metalness: 0.8, roughness: 0.45 });
  tune(/_(Chrome|LightChrome|Interiorchrome)_0$/, { metalness: 1, roughness: 0.12 });
  tune(/_(Windows|Headlightsglass|Headlight|LightsGlass|FogGlass)_0$/, { metalness: 0, roughness: 0.04 });

  function emissive(pattern: RegExp, color: number, useMap = false) {
    const materials: THREE.MeshStandardMaterial[] = [];
    for (const mesh of named(pattern)) {
      const material = mesh.material.clone();
      material.emissive.set(color);
      if (useMap) material.emissiveMap = material.map;
      material.emissiveIntensity = 0;
      material.toneMapped = false;
      mesh.material = material;
      materials.push(material);
    }
    if (!materials.length) throw new Error(`Missing car light geometry: ${pattern}`);
    return materials;
  }
  function meshBounds(pattern: RegExp) {
    const box = new THREE.Box3();
    for (const mesh of named(pattern)) box.expandByObject(mesh);
    return box;
  }
  function sideBounds(pattern: RegExp) {
    const sides = [new THREE.Box3(), new THREE.Box3()];
    const point = new THREE.Vector3();
    for (const mesh of named(pattern)) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        sides[point.x < 0 ? 0 : 1].expandByPoint(point);
      }
    }
    if (sides.some((side) => side.isEmpty())) throw new Error(`Missing paired car light geometry: ${pattern}`);
    return sides;
  }

  const tailLamps = emissive(/^tailbrake_/, 0xffffff, true);
  const brakeLenses = emissive(/^184_001_001_BrakeRefraction_0$/, 0xff1008);
  const rearPositionBulbs = emissive(/^Positionbulbrear_/, 0xff1008);
  const thirdBrakeLight = emissive(/^(thirdrefraction|brakebulbrear)_/, 0xff1008);
  const reverseLenses = emissive(/^(RevRefraction|Reversebulbs)_/, 0xfff6df);
  const rearSignals = emissive(/^(Indrefraction|IndRrear|IndLRear)_/, 0xff8800);
  const frontSignals = emissive(/^Ind[LR]_Indicatorbulb_0$/, 0xff8800);
  const sideMarkers = emissive(/^Fenderlight(LEFT|RIGHT)_/, 0xff8800);
  const rearCornerMarkers = emissive(/^(Cornerglass|Cornerlightbulb)_/, 0xff1008);
  const frontPosition = emissive(/^BulbsPos_/, 0xfff3dc);
  const projectors = emissive(/^(Projectorglass|BulbHL)_/, 0xfff3dc);

  function rearSpot(box: THREE.Box3, color: number) {
    const light = new THREE.SpotLight(color, 0, 4, Math.PI / 5, 0.9, 2);
    light.position.copy(box.getCenter(new THREE.Vector3()));
    light.position.z = box.min.z - 0.18;
    light.target.position.set(light.position.x, light.position.y - 0.35, light.position.z - 2.5);
    light.castShadow = true;
    light.shadow.mapSize.set(256, 256);
    light.shadow.camera.near = 0.03;
    light.shadow.normalBias = 0.015;
    light.visible = false;
    chassis.add(light, light.target);
    return light;
  }
  const brakeLights = sideBounds(/^184_001_001_BrakeRefraction_0$/).map((box) => rearSpot(box, 0xff0000));
  const reverseLights = sideBounds(/^RevRefraction_Reverseref1_0$/).map((box) => rearSpot(box, 0xfff6df));

  let headlightsOn = false;
  let brakingActive = false;
  let hazardsActive = false;
  const setIntensity = (materials: THREE.MeshStandardMaterial[], intensity: number) => {
    for (const material of materials) material.emissiveIntensity = intensity;
  };
  function setHazards(illuminated: boolean) {
    hazardsActive = illuminated;
    setIntensity(rearSignals, illuminated ? 3 : 0);
    setIntensity(frontSignals, illuminated ? 3 : headlightsOn ? 0.4 : 0);
    setIntensity(sideMarkers, illuminated ? 2 : headlightsOn ? 0.5 : 0);
  }
  function setReversing(reversing: boolean) {
    setIntensity(reverseLenses, reversing ? 4 : 0);
    for (const light of reverseLights) {
      light.intensity = reversing ? 4 : 0;
      light.visible = reversing;
    }
  }
  function setBraking(braking: boolean) {
    brakingActive = braking;
    setIntensity(tailLamps, braking ? 6 : headlightsOn ? 1.5 : 0);
    setIntensity(brakeLenses, braking ? 2.5 : headlightsOn ? 0.35 : 0);
    setIntensity(rearPositionBulbs, braking || headlightsOn ? 3 : 0);
    setIntensity(thirdBrakeLight, braking ? 5 : 0);
    for (const light of brakeLights) {
      light.intensity = braking ? 8 : 0;
      light.visible = braking;
    }
  }

  RectAreaLightUniformsLib.init();
  const underglow: THREE.RectAreaLight[] = [];
  const lightStrips = [
    { x: -0.76, z: 0, width: 0.08, length: 1.6 },
    { x: 0.76, z: 0, width: 0.08, length: 1.6 },
    { x: 0, z: 1.85, width: 1.5, length: 0.08 },
    { x: 0, z: -1.85, width: 1.5, length: 0.08 },
  ];
  for (const strip of lightStrips) {
    const light = new THREE.RectAreaLight(0xff1824, 18, strip.width, strip.length);
    light.name = 'red-underglow';
    light.position.set(strip.x, -0.25, strip.z);
    light.rotation.x = -Math.PI / 2;
    light.visible = false;
    chassis.add(light);
    underglow.push(light);
  }

  const headlights = sideBounds(/^Projectorglass_/).map((box) => {
    const lamp = box.getCenter(new THREE.Vector3());
    const light = new THREE.SpotLight(0xfff3dc, 1100, 65, Math.PI / 7, 0.55, 1.2);
    light.name = 'headlight-beam';
    light.position.set(lamp.x, lamp.y, meshBounds(/^hlglass_/).max.z + 0.05);
    light.target.position.set(lamp.x * 1.5, lamp.y - 1.1, light.position.z + 20);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.camera.near = 0.08;
    light.shadow.camera.far = 65;
    light.shadow.normalBias = 0.02;
    chassis.add(light, light.target);
    return light;
  });
  function setLighting(enabled: boolean, underglowEnabled: boolean) {
    headlightsOn = enabled;
    setBraking(brakingActive);
    setHazards(hazardsActive);
    setIntensity(rearCornerMarkers, enabled ? 1.5 : 0);
    setIntensity(frontPosition, enabled ? 2 : 0);
    setIntensity(projectors, enabled ? 3 : 0);
    for (const light of headlights) light.visible = enabled;
    for (const light of underglow) light.visible = underglowEnabled;
  }

  // Replace the flat mirror-glass mesh with live planar reflections.
  const mirrors: Reflector[] = [];
  const mirrorMounts: { mirror: Reflector; center: THREE.Vector3; normal: THREE.Vector3;
    orientation: THREE.Quaternion; sightLine: THREE.Vector3 }[] = [];
  for (const mesh of named(/^Mirrorglass_/)) {
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const index = geometry.getIndex();
    // Right door mirror, interior rear-view mirror, left door mirror.
    const sides: number[][] = [[], [], []];
    const point = new THREE.Vector3();
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      const triangle = [0, 1, 2].map((j) => index ? index.getX(i + j) : i + j);
      let x = 0;
      for (const v of triangle) x += point.fromBufferAttribute(positions, v).x;
      sides[x / 3 < -0.5 ? 0 : x / 3 > 0.5 ? 2 : 1].push(...triangle);
    }
    for (const [sideIndex, indices] of sides.entries()) {
      if (!indices.length) continue;
      const interior = sideIndex === 1;
      const side = geometry.clone();
      side.setIndex(indices);
      const box = new THREE.Box3();
      const normal = new THREE.Vector3();
      for (const i of indices) {
        box.expandByPoint(point.fromBufferAttribute(positions, i));
        normal.add(point.fromBufferAttribute(normals, i));
      }
      normal.normalize();
      if (normal.z > 0) normal.negate();
      const mirrorCenter = box.getCenter(new THREE.Vector3());
      const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      side.translate(-mirrorCenter.x, -mirrorCenter.y, -mirrorCenter.z);
      side.applyQuaternion(orientation.clone().invert());
      side.deleteAttribute('normal');
      const mirror = new Reflector(side, {
        color: 0xe8efff, textureWidth: 512, textureHeight: 256, clipBias: 0.003, multisample: 0,
      });
      mirror.position.copy(mirrorCenter).addScaledVector(normal, 0.002);
      mirror.quaternion.copy(orientation);
      // Do not recursively render the other mirrors in a reflection pass.
      const reflect = mirror.onBeforeRender;
      const eye = new THREE.Vector3();
      const size = new THREE.Vector2();
      mirror.onBeforeRender = function (...args) {
        // The reflection texture spans the whole viewport, so a mirror filling a close-up
        // cabin view needs screen resolution to stay sharp.
        if (interior) {
          const [renderer, , camera] = args;
          const close = mirror.getWorldPosition(eye).distanceToSquared(camera.position) < 1.5 ** 2;
          if (close) renderer.getDrawingBufferSize(size);
          else size.set(512, 256);
          const target = mirror.getRenderTarget();
          if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);
        }
        const others = mirrors.filter((other) => other !== mirror);
        others.forEach((other) => { other.visible = false; });
        try {
          reflect.apply(this, args);
        } finally {
          others.forEach((other) => { other.visible = true; });
        }
      };
      mirrors.push(mirror);
      // Interior mirror looks straight back; door mirrors are set slightly outboard
      // so the car's flank only just shows at their inner edge.
      const outboard = interior ? 0 : Math.sign(mirrorCenter.x) * Math.sin(THREE.MathUtils.degToRad(DOOR_MIRROR_OUTBOARD_DEG));
      const sightLine = new THREE.Vector3(outboard, 0, -1).normalize();
      mirrorMounts.push({ mirror, center: mirrorCenter, normal, orientation, sightLine });
      chassis.add(mirror);
    }
    geometry.dispose();
    mesh.visible = false;
  }
  if (mirrors.length !== 3) throw new Error('Missing mirror glass in the car model.');

  // Pivot each glass in its housing so that a ray from the driver's eye reflects
  // along the mirror's sight line (eye is in chassis space).
  const toEye = new THREE.Vector3();
  const aimedNormal = new THREE.Vector3();
  const tilt = new THREE.Quaternion();
  function aimMirrors(eye: THREE.Vector3) {
    for (const { mirror, center, normal, orientation, sightLine } of mirrorMounts) {
      toEye.subVectors(eye, center).normalize();
      aimedNormal.addVectors(toEye, sightLine).normalize();
      tilt.setFromUnitVectors(normal, aimedNormal);
      mirror.quaternion.multiplyQuaternions(tilt, orientation);
      mirror.position.copy(center).addScaledVector(aimedNormal, 0.002);
    }
  }

  for (const mesh of named(/^(visors_|Frontplate_ext_plate_rear_0$|165_T_Plastico_0$)/)) mesh.removeFromParent();

  // Re-parent interior parts under pivots so they can rotate about their real hubs.
  function pivot(pattern: RegExp, origin: THREE.Vector3, axis: THREE.Vector3) {
    const group = new THREE.Group();
    group.position.copy(origin);
    for (const mesh of named(pattern)) {
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      geometry.translate(-origin.x, -origin.y, -origin.z);
      const part = new THREE.Mesh(geometry, mesh.material);
      part.name = mesh.name;
      group.add(part);
      mesh.removeFromParent();
    }
    if (!group.children.length) throw new Error(`Missing ${pattern} in the car model.`);
    chassis.add(group);
    return (angle: number) => group.quaternion.setFromAxisAngle(axis, angle);
  }
  const rotateSteeringWheel = pivot(/^(Steeringwheel|badgeglass|badgechrome|badgeburgundy)_/,
    new THREE.Vector3(-0.3808, 0.1946, 0.07), new THREE.Vector3(0, 0.3095, -0.9509).normalize());
  // The gauge face points at the driver; positive rotation is counter-clockwise from the seat.
  // The boost needle hangs below its hub, so sweeping toward +7 is counter-clockwise.
  const gaugeAxis = new THREE.Vector3(0, 0.1591, -0.9873).normalize();
  const rotateSpeedNeedle = pivot(/^speedarrow_/, new THREE.Vector3(-0.3287, 0.2348, 0.4068), gaugeAxis);
  const rotateRpmNeedle = pivot(/^rpmarrow_/, new THREE.Vector3(-0.4389, 0.2348, 0.4068), gaugeAxis);
  const rotateBoostNeedle = pivot(/^turboarrow_/, BOOST_PIVOT, gaugeAxis);
  // Coolant temperature sits mid-scale and the tank stays full.
  pivot(/^temparrow_/, new THREE.Vector3(-0.2615, 0.2159, 0.4037), gaugeAxis)(-THREE.MathUtils.degToRad(TEMP_NORMAL_DEG));
  pivot(/^fuelarrow_/, new THREE.Vector3(-0.5365, 0.2157, 0.4039), gaugeAxis)(-THREE.MathUtils.degToRad(FUEL_FULL_DEG));
  // Quick race-style rack: about ±150-250° at the wheel across the drive modes.
  const STEERING_RATIO = 4;
  function setSteering(roadWheelAngle: number) {
    rotateSteeringWheel(roadWheelAngle * STEERING_RATIO);
  }
  function setGauges(speedKmh: number, rpm: number, boostMmHg: number) {
    const degrees = THREE.MathUtils.degToRad;
    rotateSpeedNeedle(-degrees(SPEEDO_DEG_PER_KMH * THREE.MathUtils.clamp(speedKmh, 0, 190)));
    rotateRpmNeedle(-degrees(TACH_DEG_PER_RPM * THREE.MathUtils.clamp(rpm, 0, 9200)));
    rotateBoostNeedle(degrees(BOOST_DEG_PER_MMHG * THREE.MathUtils.clamp(boostMmHg, -760, 760)));
  }

  // Wheels spin; calipers and dust shields only steer and follow suspension travel.
  // Order: front right, front left, rear right, rear left (+X is the car's left, +Z front).
  const wheels = Array.from({ length: 4 }, () => new THREE.Group());
  const hubs = Array.from({ length: 4 }, () => new THREE.Group());
  const tireBounds = wheels.map(() => new THREE.Box3());
  const cornerOf = (box: THREE.Box3) => {
    const middle = box.getCenter(new THREE.Vector3());
    return (middle.z > 0 ? 0 : 2) + (middle.x > 0 ? 1 : 0);
  };
  for (const mesh of named(/^tyr_/)) {
    const box = new THREE.Box3().setFromObject(mesh);
    tireBounds[cornerOf(box)].union(box);
  }
  const centers = tireBounds.map((box) => {
    if (box.isEmpty()) throw new Error('The car model is missing expected wheel geometry.');
    return box.getCenter(new THREE.Vector3());
  });
  const radii = tireBounds.map((box) => box.getSize(new THREE.Vector3()).y / 2);
  const widths = tireBounds.map((box) => box.getSize(new THREE.Vector3()).x);
  for (const mesh of named(/^(llantaoem|tyr_|frontrotor|rearrotor|frontcaliper|rearcaliper)/)) {
    const corner = cornerOf(new THREE.Box3().setFromObject(mesh));
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.translate(-centers[corner].x, -centers[corner].y, -centers[corner].z);
    const part = new THREE.Mesh(geometry, mesh.material);
    part.name = mesh.name;
    part.castShadow = true;
    part.receiveShadow = true;
    (/caliper/.test(mesh.name) ? hubs : wheels)[corner].add(part);
    mesh.removeFromParent();
  }

  // Preserve underbody clearance while covering the actual roof, hatch and spoiler.
  const collisionPoints: THREE.Vector3[] = [];
  for (const x of [-0.86, 0.86]) {
    for (const y of [-0.23, 0.23]) {
      for (const z of [-2.02, 2.02]) collisionPoints.push(new THREE.Vector3(x, y, z));
    }
  }
  for (const mesh of named(/^(Body2|Front|Hood|rbumper|Wing)_Paint_0$/)) {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      if (point.y >= 0) collisionPoints.push(point);
    }
  }
  if (collisionPoints.length === 8) throw new Error('Missing car body geometry for collision hull.');
  const hull = new ConvexHull().setFromPoints(collisionPoints);
  const collisionVertices = new Set<THREE.Vector3>();
  for (const face of hull.faces) {
    let edge = face.edge;
    do {
      collisionVertices.add(edge.head().point);
      edge = edge.next;
    } while (edge !== face.edge);
  }
  return { chassis, wheels, hubs, centers, radii, widths, collisionVertices: [...collisionVertices],
    setBraking, setReversing, setHazards, setLighting, setSteering, setGauges, aimMirrors };
}
