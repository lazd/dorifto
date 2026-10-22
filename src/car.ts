import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { ConvexHull } from "three/addons/math/ConvexHull.js";
import { idleRpm, redlineRpm } from "./drivetrain";
import type { GameState } from "./game-state";
import { clockText, createSegmentedDisplay, mapDisplaySurface } from "./segmented-display";

type StandardMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

// Real Z32 two-seater length; the export's units are arbitrary.
const CAR_LENGTH_M = 4.31;
const PAINT_COLOR = 0xe51b23;
const WHEEL_COLOR = 0x111216;
const INTERIOR_COLOR = 0x303030;
// Chassis offsets in meters: X is lateral, +Z is forward.
const UNDERGLOW_SIDE_OFFSET = 0.55;
const UNDERGLOW_FRONT_OFFSET = 1.85;
const UNDERGLOW_REAR_OFFSET = 1.5;
// Needle sweeps measured from the instrument-cluster texture.
const SPEEDO_DEG_PER_KMH = 1.338;
const TACH_DEG_PER_RPM = 0.02759;
const BOOST_DEG_PER_MMHG = 0.0523;
const OIL_DEG_PER_KG_CM2 = 8.25;
const OIL_PRESSURE_RESPONSE = 0.8;
// The boost needle's hub is hidden behind the speedometer face, above the sub-dial.
// Mirror adjustment as seen from the driver's eye. The car is right-hand drive, so the
// driver's door mirror is on the -X side.
const DRIVER_MIRROR_OUTBOARD_DEG = 2;
const PASSENGER_MIRROR_OUTBOARD_DEG = -2;
// Positive tilts the rear-view mirror's view upward.
const REAR_VIEW_MIRROR_TILT_DEG = -1;
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
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial))
      return;
    object.castShadow = true;
    object.receiveShadow = true;
    meshes.push(object as StandardMesh);
  });
  // Mesh names are `<node>_<material>_0`; the exported material names are not descriptive.
  const named = (pattern: RegExp) => meshes.filter((mesh) => pattern.test(mesh.name));
  const tuned = new Set<THREE.Material>();
  function tune(
    pattern: RegExp,
    settings: {
      color?: number;
      metalness?: number;
      roughness?: number;
      envMapIntensity?: number;
    },
  ) {
    for (const { material } of named(pattern)) {
      if (tuned.has(material)) continue;
      tuned.add(material);
      const { color, ...rest } = settings;
      if (color !== undefined) material.color.set(color);
      Object.assign(material, rest);
    }
  }
  tune(/_Paint_0$/, { color: PAINT_COLOR, metalness: 0.25, roughness: 0.16, envMapIntensity: 0.3 });
  tune(/^llantaoem.*_(llantaoem|wheelalu)_0$/, {
    color: WHEEL_COLOR,
    metalness: 0.35,
    roughness: 0.6,
  });
  tune(/^llantaoem.*_centercap_0$/, { color: 0x1c1d22, metalness: 0.5, roughness: 0.35 });
  tune(/^tyr_/, { roughness: 0.92 });
  tune(/rotors(front|rear)_0$/, { metalness: 0.8, roughness: 0.45 });
  tune(/_(Chrome|LightChrome|Interiorchrome)_0$/, { metalness: 1, roughness: 0.12 });
  tune(/_(Windows|Headlightsglass|Headlight|LightsGlass|FogGlass)_0$/, {
    metalness: 0,
    roughness: 0.04,
  });
  // Near-black cabin like the real car; the textures are light gray and soaked up sunset tint.
  tune(
    /_(Leather|Smoothleather|PlasticInterior|Trim|carpetfabric|Darkfabric|Alcantara|Leatherboots)_0$/,
    { color: INTERIOR_COLOR, envMapIntensity: 0.45 },
  );
  // The tinted glass is two shells (outer normals face out, inner face in). Draw both
  // only from outside, so the tint shows on the car but the cabin view is clear.
  for (const [pattern, side] of [
    [/^Windows_Windows_0$/, THREE.FrontSide],
    [/^WindowIn_WindowsIn_0$/, THREE.BackSide],
  ] as const) {
    const [glass] = named(pattern);
    if (!glass) throw new Error(`Missing ${pattern} in the car model.`);
    glass.material = glass.material.clone();
    glass.material.side = side;
  }
  const headlightCovers = named(/^hlglass_/).map((mesh) => {
    mesh.material = mesh.material.clone();
    return mesh.material;
  });

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
      const positions = mesh.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        sides[point.x < 0 ? 0 : 1].expandByPoint(point);
      }
    }
    if (sides.some((side) => side.isEmpty()))
      throw new Error(`Missing paired car light geometry: ${pattern}`);
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
  const projectors = emissive(/^(Projectorglass|BulbHL)_/, 0xffe2b8);
  const gaugeFaces = emissive(/^gaugeface[12]_Gauges_0$/, 0xd7f5df, true);
  const odometer = emissive(/^Odo_Odometer_0$/, 0xd7f5df, true);
  const gaugeNeedles = emissive(/_Gaugered_0$/, 0xff3820);

  function splitSurface(
    pattern: RegExp,
    name: string,
    contains: (x: number, y: number, z: number) => boolean,
  ) {
    const [source] = named(pattern);
    if (!source) throw new Error(`Missing ${name} geometry.`);
    const geometry = source.geometry;
    const positions = geometry.getAttribute("position");
    const indices = geometry.getIndex();
    if (!indices) throw new Error(`Missing ${name} indices.`);
    const selected: number[] = [];
    const remaining: number[] = [];
    for (let i = 0; i < indices.count; i += 3) {
      const triangle = [0, 1, 2].map((offset) => indices.getX(i + offset));
      const included = triangle.every((index) =>
        contains(positions.getX(index), positions.getY(index), positions.getZ(index)),
      );
      (included ? selected : remaining).push(...triangle);
    }
    if (!selected.length) throw new Error(`Missing ${name} surface.`);
    const surface = source.clone(false);
    surface.name = name;
    surface.geometry = geometry.clone().setIndex(selected).toNonIndexed();
    source.geometry = geometry.clone().setIndex(remaining).toNonIndexed();
    for (const part of [surface.geometry, source.geometry]) {
      part.computeBoundingBox();
      part.computeBoundingSphere();
    }
    surface.material = source.material.clone();
    source.parent!.add(surface);
    return surface;
  }
  // Radioface also includes the gauge cover, clock and A/C glass; the stereo is at +X.
  const stereoDisplay = splitSurface(/^intglass_Radioface_0$/, "stereo-display", (x) => x > 0);
  const stereoMaterial = stereoDisplay.material;
  const radioReadout = createSegmentedDisplay(1024, 256, "#123522", "#8fffc1", 8);
  let stereoStationId = "";
  let stereoPowered = false;
  radioReadout.setText(" ");
  mapDisplaySurface(stereoDisplay.geometry);
  stereoMaterial.map = radioReadout.texture;
  stereoMaterial.emissiveMap = radioReadout.texture;
  stereoMaterial.color.set(0xffffff);
  stereoMaterial.emissive.set(0x42ff88);
  stereoMaterial.emissiveIntensity = 0;
  stereoMaterial.toneMapped = false;
  const stereoBounds = new THREE.Box3().setFromObject(stereoDisplay);
  const stereoLight = new THREE.PointLight(0x42ff88, 0.025, 0.45, 2);
  stereoLight.name = "stereo-glow";
  stereoLight.position.copy(stereoBounds.getCenter(new THREE.Vector3()));
  stereoLight.position.z = stereoBounds.min.z - 0.025;
  chassis.worldToLocal(stereoLight.position);
  stereoLight.visible = false;
  chassis.add(stereoLight);

  const [clock] = named(/^CLOCKTIME_Clocktime_0$/);
  if (!clock) throw new Error("Missing clock display geometry.");
  const clockReadout = createSegmentedDisplay(512, 128, "#07130e", "#b9f8d1", 5);
  clock.geometry = clock.geometry.clone();
  const [clockFace] = named(/^clockface_Clockface_0$/);
  if (!clockFace) throw new Error("Missing clock bezel geometry.");
  clockFace.geometry.computeBoundingBox();
  const faceBounds = clockFace.geometry.boundingBox!;
  const faceSlope = (faceBounds.max.z - faceBounds.min.z) / (faceBounds.max.y - faceBounds.min.y);
  const clockPositions = clock.geometry.getAttribute("position");
  // The exported digits tilt opposite to the bezel, which hides half of the readout.
  for (let i = 0; i < clockPositions.count; i++) {
    clockPositions.setZ(i, faceBounds.min.z + (clockPositions.getY(i) - faceBounds.min.y) * faceSlope - 0.0005);
  }
  clock.geometry.computeVertexNormals();
  clock.geometry.computeBoundingSphere();
  mapDisplaySurface(clock.geometry);
  clock.material = clock.material.clone();
  clock.material.map = clockReadout.texture;
  clock.material.emissiveMap = clockReadout.texture;
  clock.material.color.set(0xffffff);
  clock.material.emissive.set(0xffffff);
  clock.material.emissiveIntensity = 0.7;
  clock.material.toneMapped = false;
  clock.material.transparent = false;
  clockReadout.setText(clockText(new Date()));

  // The label atlas is shared by cabin buttons; isolate the two gauge-side pods.
  const podLabels = splitSurface(
    /^Intbuttons_Interiorbuttons_0$/,
    "gauge-pod-labels",
    (x, y, z) =>
      ((x > -0.21 && x < -0.1) || (x > -0.65 && x < -0.56)) &&
      y > 0.57 && y < 0.71 && z > 0.2 && z < 0.27,
  );
  podLabels.material.emissive.set(0xffffff);
  podLabels.material.emissiveMap = podLabels.material.map;
  podLabels.material.emissiveIntensity = 0;
  podLabels.material.toneMapped = false;

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
  const brakeLights = sideBounds(/^184_001_001_BrakeRefraction_0$/).map((box) =>
    rearSpot(box, 0xff0000),
  );
  const reverseLights = sideBounds(/^RevRefraction_Reverseref1_0$/).map((box) =>
    rearSpot(box, 0xfff6df),
  );

  let headlightsOn = false;
  let brakingActive = false;
  let hazardsActive = false;
  const setIntensity = (materials: THREE.MeshStandardMaterial[], intensity: number) => {
    for (const material of materials) material.emissiveIntensity = intensity;
  };
  function setHazards(illuminated: boolean) {
    hazardsActive = illuminated;
    setIntensity(rearSignals, illuminated ? 3 : 0);
    setIntensity(frontSignals, illuminated ? 3 : headlightsOn ? 0.8 : 0);
    setIntensity(sideMarkers, illuminated ? 2 : headlightsOn ? 0.9 : 0);
    setDashLight("leftSignal", illuminated);
    setDashLight("rightSignal", illuminated);
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
    setIntensity(tailLamps, braking ? 6 : headlightsOn ? 2.5 : 0);
    setIntensity(brakeLenses, braking ? 2.5 : headlightsOn ? 0.65 : 0);
    setIntensity(rearPositionBulbs, braking || headlightsOn ? 4 : 0);
    setIntensity(thirdBrakeLight, braking ? 5 : 0);
    for (const light of brakeLights) {
      light.intensity = braking ? 8 : 0;
      light.visible = braking;
    }
  }

  RectAreaLightUniformsLib.init();
  const underglow: THREE.RectAreaLight[] = [];
  const lightStrips = [
    { x: -UNDERGLOW_SIDE_OFFSET, z: 0, width: 0.08, length: 1.6 }, // Right (driver) side
    { x: UNDERGLOW_SIDE_OFFSET, z: 0, width: 0.08, length: 1.6 }, // Left (passenger) side
    { x: 0, z: UNDERGLOW_FRONT_OFFSET, width: 1, length: 0.08 }, // Front
    { x: 0, z: -UNDERGLOW_REAR_OFFSET, width: 1.25, length: 0.08 }, // Rear
  ];
  for (const strip of lightStrips) {
    const light = new THREE.RectAreaLight(0xff1824, 18, strip.width, strip.length);
    light.name = "red-underglow";
    light.position.set(strip.x, -0.38, strip.z);
    light.rotation.x = -Math.PI / 2;
    light.visible = false;
    chassis.add(light);
    underglow.push(light);
  }

  const headlights = sideBounds(/^Projectorglass_/).map((box) => {
    const lamp = box.getCenter(new THREE.Vector3());
    const light = new THREE.SpotLight(0xffe2b8, 550, 65, Math.PI / 7, 0.55, 1.2);
    light.name = "headlight-beam";
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
  const cabinLight = new THREE.PointLight(0xffd9b0, 0.06, 1.4, 2);
  cabinLight.name = "cabin-ambient";
  cabinLight.position.set(0, 0.62, -0.15);
  cabinLight.visible = false;
  chassis.add(cabinLight);

  const gaugeBounds = meshBounds(/^gaugeface[12]_Gauges_0$/);
  const gaugeLight = new THREE.PointLight(0xffd9b0, 0.025, 0.45, 2);
  gaugeLight.name = "gauge-glow";
  gaugeLight.position.copy(gaugeBounds.getCenter(new THREE.Vector3()));
  gaugeLight.position.z = gaugeBounds.min.z - 0.025;
  chassis.worldToLocal(gaugeLight.position);
  gaugeLight.visible = false;
  chassis.add(gaugeLight);

  function setLighting(enabled: boolean, night: boolean) {
    headlightsOn = enabled;
    setBraking(brakingActive);
    setHazards(hazardsActive);
    setIntensity(rearCornerMarkers, enabled ? 2.5 : 0);
    setIntensity(frontPosition, enabled ? 3.5 : 0);
    setIntensity(projectors, enabled ? 8 : 0);
    setIntensity(gaugeFaces, enabled ? 0.5 : 0);
    setIntensity(odometer, enabled ? 0.35 : 0);
    setIntensity(gaugeNeedles, enabled ? 0.9 : 0);
    podLabels.material.emissiveIntensity = enabled ? 0.6 : 0;
    for (const material of headlightCovers) material.opacity = enabled ? 0.2 : 0.6;
    cabinLight.visible = night;
    gaugeLight.visible = enabled;
    for (const light of headlights) light.visible = enabled;
    for (const light of underglow) light.visible = night;
  }

  // Replace the flat mirror-glass mesh with live planar reflections.
  let mirrorResolution: GameState["mirrorResolution"] = "low";
  const mirrors: Reflector[] = [];
  const mirrorMounts: {
    mirror: Reflector;
    center: THREE.Vector3;
    normal: THREE.Vector3;
    orientation: THREE.Quaternion;
    sightLine: THREE.Vector3;
    housing?: THREE.Group;
  }[] = [];
  for (const mesh of named(/^Mirrorglass_/)) {
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const index = geometry.getIndex();
    // Right door mirror, interior rear-view mirror, left door mirror.
    const sides: number[][] = [[], [], []];
    const point = new THREE.Vector3();
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      const triangle = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
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
      const orientation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        normal,
      );
      side.translate(-mirrorCenter.x, -mirrorCenter.y, -mirrorCenter.z);
      side.applyQuaternion(orientation.clone().invert());
      side.deleteAttribute("normal");
      const mirror = new Reflector(side, {
        color: 0xe8efff,
        textureWidth: 512,
        textureHeight: 256,
        clipBias: 0.003,
        multisample: 0,
      });
      mirror.position.copy(mirrorCenter).addScaledVector(normal, 0.002);
      mirror.quaternion.copy(orientation);
      // Do not recursively render the other mirrors in a reflection pass.
      const reflect = mirror.onBeforeRender;
      const eye = new THREE.Vector3();
      const size = new THREE.Vector2();
      mirror.onBeforeRender = function (...args) {
        // Only nearby mirrors use higher resolutions; distant mirrors keep a fixed budget.
        const [renderer, , camera] = args;
        const close = mirror.getWorldPosition(eye).distanceToSquared(camera.position) < 2 ** 2;
        if (close && mirrorResolution === "high") renderer.getDrawingBufferSize(size);
        else if (close && mirrorResolution === "medium") size.set(1024, 512);
        else size.set(512, 256);
        const target = mirror.getRenderTarget();
        if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);
        const others = mirrors.filter((other) => other !== mirror);
        others.forEach((other) => {
          other.visible = false;
        });
        try {
          reflect.apply(this, args);
        } finally {
          others.forEach((other) => {
            other.visible = true;
          });
        }
      };
      mirrors.push(mirror);
      // Sight line the driver sees in each mirror: straight back (tilted) for the interior
      // mirror, angled outboard for the door mirrors.
      const degrees = THREE.MathUtils.degToRad;
      const sightLine = interior
        ? new THREE.Vector3(
            0,
            Math.sin(degrees(REAR_VIEW_MIRROR_TILT_DEG)),
            -Math.cos(degrees(REAR_VIEW_MIRROR_TILT_DEG)),
          )
        : new THREE.Vector3(
            Math.sign(mirrorCenter.x) *
              Math.sin(
                degrees(
                  mirrorCenter.x < 0 ? DRIVER_MIRROR_OUTBOARD_DEG : PASSENGER_MIRROR_OUTBOARD_DEG,
                ),
              ),
            0,
            -1,
          ).normalize();
      mirrorMounts.push({ mirror, center: mirrorCenter, normal, orientation, sightLine });
      chassis.add(mirror);
    }
    geometry.dispose();
    mesh.visible = false;
  }
  if (mirrors.length !== 3) throw new Error("Missing mirror glass in the car model.");

  // Pivot each glass in its housing so that a ray from the driver's eye reflects
  // along the mirror's sight line (eye is in chassis space).
  // The interior mirror housing (and dimmer tab) are baked into large shared interior
  // meshes; cut those triangles into a group that swivels on the stem's ball joint.
  const housing = new THREE.Group();
  housing.position.set(0, 0.55, 0.05);
  const housingParts: [RegExp, (point: THREE.Vector3) => boolean][] = [
    [
      /^intmain_Leather_0$/,
      (v) => Math.abs(v.x) < 0.11 && v.y > 0.48 && v.y < 0.56 && v.z > 0 && v.z < 0.09,
    ],
    [
      /^Plastic_PlasticInterior_0$/,
      (v) => Math.abs(v.x) < 0.02 && v.y > 0.47 && v.y < 0.515 && v.z > 0.04 && v.z < 0.07,
    ],
  ];
  for (const [pattern, inside] of housingParts) {
    const [mesh] = named(pattern);
    if (!mesh) throw new Error(`Missing ${pattern} in the car model.`);
    const geometry = mesh.geometry.clone();
    const positions = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const vertex = new THREE.Vector3();
    const kept: number[] = [];
    const moved: number[] = [];
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      const triangle = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
      const inHousing = triangle.every((v) =>
        inside(vertex.fromBufferAttribute(positions, v).applyMatrix4(mesh.matrixWorld)),
      );
      (inHousing ? moved : kept).push(...triangle);
    }
    if (!moved.length) throw new Error(`Missing interior mirror housing in ${pattern}.`);
    geometry.setIndex(kept);
    mesh.geometry = geometry;
    const part = geometry.clone().applyMatrix4(mesh.matrixWorld);
    part.setIndex(moved);
    part.translate(-housing.position.x, -housing.position.y, -housing.position.z);
    housing.add(new THREE.Mesh(part, mesh.material));
  }
  chassis.add(housing);
  const interiorMount = mirrorMounts.find(({ center }) => Math.abs(center.x) < 0.5)!;
  interiorMount.housing = housing;
  housing.add(interiorMount.mirror);

  const toEye = new THREE.Vector3();
  const aimedNormal = new THREE.Vector3();
  const tilt = new THREE.Quaternion();
  function aimMirrors(eye: THREE.Vector3) {
    for (const { mirror, center, normal, orientation, sightLine, housing } of mirrorMounts) {
      toEye.subVectors(eye, center).normalize();
      aimedNormal.addVectors(toEye, sightLine).normalize();
      tilt.setFromUnitVectors(normal, aimedNormal);
      if (housing) {
        // The glass is fixed in the housing; the whole housing swivels on its joint.
        housing.quaternion.copy(tilt);
        mirror.quaternion.copy(orientation);
        mirror.position.copy(center).sub(housing.position).addScaledVector(normal, 0.002);
        continue;
      }
      mirror.quaternion.multiplyQuaternions(tilt, orientation);
      mirror.position.copy(center).addScaledVector(aimedNormal, 0.002);
    }
  }

  for (const mesh of named(/^(visors_|Frontplate_ext_plate_rear_0$|165_T_Plastico_0$)|_Defrost_0$/))
    mesh.removeFromParent();

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
  const rotateSteeringWheel = pivot(
    /^(Steeringwheel|badgeglass|badgechrome|badgeburgundy)_/,
    new THREE.Vector3(-0.3808, 0.1946, 0.07),
    new THREE.Vector3(0, 0.3095, -0.9509).normalize(),
  );
  // The gauge face points at the driver; positive rotation is counter-clockwise from the seat.
  // The boost needle hangs below its hub, so sweeping toward +7 is counter-clockwise.
  const gaugeAxis = new THREE.Vector3(0, 0.1591, -0.9873).normalize();
  const rotateSpeedNeedle = pivot(
    /^speedarrow_/,
    new THREE.Vector3(-0.3287, 0.2348, 0.4068),
    gaugeAxis,
  );
  const rotateRpmNeedle = pivot(
    /^rpmarrow_/,
    new THREE.Vector3(-0.4389, 0.2348, 0.4068),
    gaugeAxis,
  );
  const rotateBoostNeedle = pivot(/^turboarrow_/, BOOST_PIVOT, gaugeAxis);
  const rotateOilNeedle = pivot(
    /^Oilarrow_/,
    new THREE.Vector3(-0.4359, 0.2256, 0.4106),
    gaugeAxis,
  );
  // Coolant temperature sits mid-scale and the tank stays full.
  pivot(
    /^temparrow_/,
    new THREE.Vector3(-0.2615, 0.2159, 0.4037),
    gaugeAxis,
  )(-THREE.MathUtils.degToRad(TEMP_NORMAL_DEG));
  pivot(
    /^fuelarrow_/,
    new THREE.Vector3(-0.5365, 0.2157, 0.4039),
    gaugeAxis,
  )(-THREE.MathUtils.degToRad(FUEL_FULL_DEG));
  // Lit warning lamps glow unshaded; unlit masks match the dark gray panel
  // and respond to cabin lighting without revealing the warning symbols.
  const dashLightMeshes = {
    leftSignal: /^leftind_/,
    rightSignal: /^rightind_/,
    highBeam: /^highbeam_/,
    brake: /^pbrake_/,
    battery: /^battery_/,
    checkEngine: /^check_/,
    catalyst: /^cattemp_/,
    abs: /^abswarning_/,
  };
  type DashLight = keyof typeof dashLightMeshes;
  const dashLights = {} as Record<DashLight, THREE.Mesh[]>;
  const unlitDashLight = new THREE.MeshStandardMaterial({
    color: 0x282828,
    roughness: 0.96,
    metalness: 0,
  });
  const unlitCatalystLight = unlitDashLight.clone();
  unlitCatalystLight.color.set(0x181818);
  let litDashLight: THREE.MeshBasicMaterial | undefined;
  for (const [light, pattern] of Object.entries(dashLightMeshes) as [DashLight, RegExp][]) {
    dashLights[light] = named(pattern);
    if (!dashLights[light].length) throw new Error(`Missing ${pattern} in the car model.`);
    litDashLight ??= new THREE.MeshBasicMaterial({
      map: (dashLights[light][0].material as THREE.MeshStandardMaterial).map,
    });
  }
  function setDashLight(light: DashLight, on: boolean) {
    const unlitMaterial = light === "catalyst" ? unlitCatalystLight : unlitDashLight;
    for (const mesh of dashLights[light]) mesh.material = on ? litDashLight! : unlitMaterial;
  }
  for (const light of Object.keys(dashLights) as DashLight[]) setDashLight(light, false);

  // Quick race-style rack: about ±150-250° at the wheel across the drive modes.
  const STEERING_RATIO = 4;
  function setSteering(roadWheelAngle: number) {
    rotateSteeringWheel(roadWheelAngle * STEERING_RATIO);
  }
  let oilPressure = 2;
  function setGauges(speedKmh: number, rpm: number, boostMmHg: number, dt: number) {
    const degrees = THREE.MathUtils.degToRad;
    rotateSpeedNeedle(-degrees(SPEEDO_DEG_PER_KMH * THREE.MathUtils.clamp(speedKmh, 0, 190)));
    rotateRpmNeedle(-degrees(TACH_DEG_PER_RPM * THREE.MathUtils.clamp(rpm, 0, 9200)));
    rotateBoostNeedle(degrees(BOOST_DEG_PER_MMHG * THREE.MathUtils.clamp(boostMmHg, -760, 760)));
    const targetOilPressure = THREE.MathUtils.mapLinear(
      THREE.MathUtils.clamp(rpm, idleRpm, redlineRpm),
      idleRpm,
      redlineRpm,
      2,
      5,
    );
    oilPressure = THREE.MathUtils.damp(oilPressure, targetOilPressure, OIL_PRESSURE_RESPONSE, dt);
    rotateOilNeedle(degrees(OIL_DEG_PER_KG_CM2 * oilPressure));
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
    if (box.isEmpty()) throw new Error("The car model is missing expected wheel geometry.");
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
    const positions = mesh.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(mesh.matrixWorld);
      if (point.y >= 0) collisionPoints.push(point);
    }
  }
  if (collisionPoints.length === 8)
    throw new Error("Missing car body geometry for collision hull.");
  const hull = new ConvexHull().setFromPoints(collisionPoints);
  const collisionVertices = new Set<THREE.Vector3>();
  for (const face of hull.faces) {
    let edge = face.edge;
    do {
      collisionVertices.add(edge.head().point);
      edge = edge.next;
    } while (edge !== face.edge);
  }
  return {
    chassis,
    wheels,
    hubs,
    centers,
    radii,
    widths,
    collisionVertices: [...collisionVertices],
    setBraking,
    setReversing,
    setHazards,
    setLighting,
    setStereo(powered: boolean) {
      stereoPowered = powered;
      radioReadout.setText(powered ? stereoStationId : " ");
      stereoMaterial.emissiveIntensity = powered ? 1.5 : 0;
      stereoLight.visible = powered;
    },
    setStereoStation(id: string) {
      stereoStationId = id;
      radioReadout.setText(stereoPowered ? id : " ");
    },
    updateClock(date: Date) {
      clockReadout.setText(clockText(date));
    },
    setMirrorResolution(resolution: GameState["mirrorResolution"]) {
      mirrorResolution = resolution;
    },
    setSteering,
    setGauges,
    setDashLight,
    aimMirrors,
  };
}
