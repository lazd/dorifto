import * as THREE from 'three';
import AmmoFactory from 'ammojs-typed';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCar } from './car';
import { TireSmoke } from './smoke';
import { DrivingControls } from './controls';
import { createCourse } from './course';
import { courses, courseRoute, courseSpawn, generateCourse } from './courses';
import { driveModes, isDriveMode, assistedSteeringAngle } from './drive-modes';
import { LapTimer } from './laps';
import { VehicleAudio } from './audio';
import { Drivetrain, wheelInertia, type DrivetrainInput } from './drivetrain';
import { createGameState, wattsPerHorsepower, isCameraStyle, isTimeOfDay } from './game-state';
import { bindGameUI, bindGameActions, bindCoursePicker, element } from './ui';
import './style.css';

const gameState = createGameState();
bindGameUI(gameState, showError);

const daylight = {
  noon: {
    sky: '#78b5ec', horizon: '#b6d7ee', ground: '#656052',
    ambient: '#d9edff', ambientIntensity: 0.65, environmentIntensity: 0.65,
    sun: '#ffefd4', sunIntensity: 2.4, sunOffset: [-20, 35, -12],
    exposure: 0.95,
  },
  sunset: {
    sky: '#647ca6', horizon: '#f3b074', ground: '#654035',
    ambient: '#ffd3ab', ambientIntensity: 0.45, environmentIntensity: 0.28,
    sun: '#ffb45e', sunIntensity: 3.2, sunOffset: [-42, 12, -20],
    exposure: 0.95,
  },
  night: {
    sky: '#030914', horizon: '#101d35', ground: '#080b13',
    ambient: '#a8bde3', ambientIntensity: 0.35, environmentIntensity: 0.08,
    sun: '#9fbfff', sunIntensity: 0.22, sunOffset: [-20, 35, -12],
    exposure: 0.85,
  },
} satisfies Record<string, {
  sky: string; horizon: string; ground: string; ambient: string;
  ambientIntensity: number; environmentIntensity: number;
  sun: string; sunIntensity: number; sunOffset: [number, number, number]; exposure: number;
}>;

async function start() {
  const requestedCamera = new URL(location.href).searchParams.get('camera') ?? 'corner';
  if (!isCameraStyle(requestedCamera)) throw new Error(`Unknown camera style: ${requestedCamera}`);
  const requestedMode = new URL(location.href).searchParams.get('mode') ?? 'drift';
  if (!isDriveMode(requestedMode)) throw new Error(`Unknown drive mode: ${requestedMode}`);
  gameState.update({ driveMode: requestedMode, cameraStyle: requestedCamera });
  const courseUrl = new URL(location.href);
  const requestedCourse = courseUrl.searchParams.get('course');
  let seed = 0;
  if (requestedCourse === 'random') {
    const value = courseUrl.searchParams.get('seed');
    if (value !== null && !/^\d{1,10}$/.test(value)) throw new Error(`Invalid course seed: ${value}`);
    seed = value === null ? crypto.getRandomValues(new Uint32Array(1))[0] : Number(value);
    courseUrl.searchParams.set('seed', String(seed));
    history.replaceState(null, '', courseUrl);
  }
  const definition = requestedCourse === 'random' ? generateCourse(seed)
    : requestedCourse ? courses.find((course) => course.id === requestedCourse) : courses[0];
  if (!definition) throw new Error(`Unknown course: ${requestedCourse}`);
  const spawn = courseSpawn(definition);
  const cameraRoute = courseRoute(definition);
  const cameraRouteLength = cameraRoute.getLength();
  const cameraCourseWidth = definition.width;
  const cameraRoutePoints = cameraRoute.getSpacedPoints(Math.ceil(cameraRouteLength / 2));
  cameraRoutePoints.pop();
  const laps = new LapTimer(definition);
  const lapPosition = new THREE.Vector3();
  bindCoursePicker(courses, definition);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  element('#app').append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D driving playground');

  const scene = new THREE.Scene();
  const fog = new THREE.Fog(0x78b5ec, 220, 650);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1500);
  camera.layers.enable(1);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = new RoomEnvironment();
  scene.environment = pmrem.fromScene(environment, 0.04).texture;
  environment.dispose();
  pmrem.dispose();
  const ambient = new THREE.HemisphereLight();
  scene.add(ambient);
  const sun = new THREE.DirectionalLight();
  const shadowOffset = new THREE.Vector3();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -24;
  sun.shadow.camera.right = sun.shadow.camera.top = 24;
  sun.shadow.camera.far = 100;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);

  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 16;
  skyCanvas.height = 256;
  const skyContext = skyCanvas.getContext('2d');
  if (!skyContext) throw new Error('Unable to create sky texture');
  let sky: THREE.CanvasTexture | undefined;
  const requestedTime = new URL(location.href).searchParams.get('time') ?? 'noon';
  if (!isTimeOfDay(requestedTime)) throw new Error(`Unknown time of day: ${requestedTime}`);
  gameState.update({ timeOfDay: requestedTime });
  const applyTimeOfDay = (time: keyof typeof daylight) => {
    const preset = daylight[time];
    const gradient = skyContext.createLinearGradient(0, 0, 0, skyCanvas.height);
    gradient.addColorStop(0, preset.sky);
    gradient.addColorStop(0.5, preset.horizon);
    gradient.addColorStop(1, preset.ground);
    skyContext.fillStyle = gradient;
    skyContext.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
    // Replacing the texture invalidates Three's cached equirectangular conversion.
    const previousSky = sky;
    sky = new THREE.CanvasTexture(skyCanvas);
    sky.colorSpace = THREE.SRGBColorSpace;
    sky.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = sky;
    previousSky?.dispose();
    fog.color.set(preset.horizon);
    ambient.color.set(preset.ambient);
    ambient.groundColor.set(preset.ground);
    ambient.intensity = preset.ambientIntensity;
    scene.environmentIntensity = preset.environmentIntensity;
    sun.color.set(preset.sun);
    sun.intensity = preset.sunIntensity;
    shadowOffset.fromArray(preset.sunOffset);
    sun.position.copy(sun.target.position).add(shadowOffset);
    renderer.toneMappingExposure = preset.exposure;
  };
  applyTimeOfDay(requestedTime);
  const { cones, terrain, isAsphalt } = createCourse(scene, definition);

  // The upstream Emscripten factory writes to `this`; ESM calls have no receiver.
  const [Ammo, car] = await Promise.all([AmmoFactory.call({}), loadCar()]);
  // The picker may change while the model is loading.
  const selectedTime = gameState.getState().timeOfDay;
  applyTimeOfDay(selectedTime);
  car.setLighting(selectedTime !== 'noon', selectedTime === 'night');
  let appliedTime = selectedTime;
  gameState.subscribe(({ timeOfDay }) => {
    if (timeOfDay === appliedTime) return;
    appliedTime = timeOfDay;
    applyTimeOfDay(timeOfDay);
    car.setLighting(timeOfDay !== 'noon', timeOfDay === 'night');
  });

  scene.add(car.chassis, ...car.wheels);
  const configuration = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher = new Ammo.btCollisionDispatcher(configuration);
  const broadphase = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();
  const world = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, configuration);
  const vector = new Ammo.btVector3(0, -9.81, 0);
  world.setGravity(vector);

  function rigidBody(mass: number, shape: AmmoFactory.btCollisionShape, position: THREE.Vector3) {
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    vector.setValue(position.x, position.y, position.z);
    transform.setOrigin(vector);
    const motion = new Ammo.btDefaultMotionState(transform);
    vector.setValue(0, 0, 0);
    shape.calculateLocalInertia(mass, vector);
    const info = new Ammo.btRigidBodyConstructionInfo(mass, motion, shape, vector);
    const body = new Ammo.btRigidBody(info);
    world.addRigidBody(body);
    Ammo.destroy(info);
    Ammo.destroy(transform);
    return body;
  }

  const heightData = Ammo._malloc(terrain.heights.byteLength);
  Ammo.HEAPF32.set(terrain.heights, heightData / 4);
  const groundShape = new Ammo.btHeightfieldTerrainShape(
    terrain.columns, terrain.rows, heightData, 1, terrain.minHeight, terrain.maxHeight, 1, Ammo.PHY_FLOAT, false,
  );
  vector.setValue(terrain.spacing, 1, terrain.spacing);
  groundShape.setLocalScaling(vector);
  groundShape.setMargin(0.01);
  rigidBody(0, groundShape, new THREE.Vector3(
    terrain.minX + (terrain.columns - 1) * terrain.spacing / 2,
    (terrain.minHeight + terrain.maxHeight) / 2,
    terrain.minZ + (terrain.rows - 1) * terrain.spacing / 2,
  ));
  const coneStarts = cones.map((cone) => cone.position.clone());
  const coneRotations = cones.map((cone) => cone.quaternion.clone());
  const coneResetTransform = new Ammo.btTransform();
  const coneBodies = cones.map((mesh) => {
    const body = rigidBody(3, new Ammo.btConeShape(0.23, 0.7), mesh.position);
    const transform = body.getWorldTransform();
    const rotation = new Ammo.btQuaternion(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
    transform.setRotation(rotation);
    body.setCenterOfMassTransform(transform);
    body.getMotionState().setWorldTransform(transform);
    world.updateSingleAabb(body);
    Ammo.destroy(rotation);
    body.setFriction(0.7);
    body.setRestitution(0.15);
    body.setDamping(0.08, 0.12);
    body.setCcdMotionThreshold(0.1);
    body.setCcdSweptSphereRadius(0.12);
    return body;
  });
  const chassisShape = new Ammo.btConvexHullShape();
  for (let i = 0; i < car.collisionVertices.length; i++) {
    const point = car.collisionVertices[i];
    vector.setValue(point.x, point.y, point.z);
    chassisShape.addPoint(vector, i === car.collisionVertices.length - 1);
  }
  chassisShape.setMargin(0.025);
  const body = rigidBody(1450, chassisShape, new THREE.Vector3(0, 0.8, 0));
  // Vehicle-scale pitch/yaw/roll inertia, not the thin underbody box's inertia.
  vector.setValue(2400, 2600, 700);
  body.setMassProps(1450, vector);
  body.updateInertiaTensor();
  const carPointer = Ammo.getPointer(body);
  const coneIds = new Map(coneBodies.map((cone, i) => [Ammo.getPointer(cone), i]));
  body.setActivationState(4);
  body.setDamping(0.02, 0.05);
  const tuning = new Ammo.btVehicleTuning();
  const raycaster = new Ammo.btDefaultVehicleRaycaster(world);
  const vehicle = new Ammo.btRaycastVehicle(tuning, body, raycaster);
  vehicle.setCoordinateSystem(0, 1, 2);
  world.addAction(vehicle);
  const direction = new Ammo.btVector3(0, -1, 0);
  const axle = new Ammo.btVector3(-1, 0, 0);
  car.centers.forEach((center, i) => {
    const pair = i < 2 ? car.centers.slice(0, 2) : car.centers.slice(2);
    const halfTrack = (Math.abs(pair[0].x) + Math.abs(pair[1].x)) / 2;
    vector.setValue(i % 2 === 0 ? -halfTrack : halfTrack, center.y + 0.28, (pair[0].z + pair[1].z) / 2);
    const wheel = vehicle.addWheel(vector, direction, axle, 0.28, car.radii[i], tuning, i < 2);
    wheel.set_m_suspensionStiffness(35);
    wheel.set_m_wheelsDampingRelaxation(2.8);
    wheel.set_m_wheelsDampingCompression(4.5);
    wheel.set_m_maxSuspensionForce(12000);
    // Ammo supplies suspension/contact; the combined-slip tire model below
    // supplies all road forces, so Bullet must not apply a second tire model.
    wheel.set_m_frictionSlip(0);
    wheel.set_m_rollInfluence(0.06);
  });
  Ammo.destroy(direction);
  Ammo.destroy(axle);

  const controls = new DrivingControls();
  const audio = new VehicleAudio((sound) => {
    gameState.update({ sound: { ...gameState.getState().sound, ...sound } });
  }, (error) => {
    console.error('Vehicle audio unavailable:', error);
    gameState.update({ sound: {
      ...gameState.getState().sound, error: error instanceof Error ? error.message : String(error),
    } });
  });
  const tireSounds = Array.from({ length: 4 }, () => ({ slip: 0, speed: 0, load: 0 }));
  const coneSoundCooldowns = new Map<number, number>();
  let helpOpen = gameState.getState().helpOpen;
  gameState.subscribe((state) => {
    if (state.helpOpen === helpOpen) return;
    helpOpen = state.helpOpen;
    controls.clear();
  });
  const keys = controls.keys;
  const controlKeys = new Set(['ArrowLeft', 'ArrowRight', 'KeyX', 'KeyZ', 'Space', 'KeyR']);
  let steering = 0;
  let accumulator = 0;
  let lastTime = 0;
  let burnout = 0;
  let reversing = false;
  let spawnBrakeHeld = true;
  let offTrackTime = 0;
  let cameraYaw = 0;
  let cameraPitch = 0;
  const cameraOrbit = new THREE.Vector3();
  const cabinEye = new THREE.Vector3(-0.36, 0.55, -0.25);
  const cabinDirection = new THREE.Vector3();
  const cabinUp = new THREE.Vector3();
  let previousCameraStyle: ReturnType<typeof gameState.getState>['cameraStyle'] | null = null;
  const previousTravel = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const cornerTarget = new THREE.Vector3();
  const routeTangent = new THREE.Vector3();
  let slideCameraAmount = 0;
  let outsideOffset = 0;
  let cameraTurnRate = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const tireSpeeds = [0, 0, 0, 0];
  const tireAngles = [0, 0, 0, 0];
  const drivetrain = new Drivetrain();
  const drivetrainInput: DrivetrainInput = {
    throttle: 0, reversing: false, wheelSpeed: 0, sliding: false, handbrake: false,
    speedLimited: false, peakTorque: 0, peakPower: 0,
  };
  const tireContacts = Array.from({ length: 4 }, () => ({
    forward: new THREE.Vector3(), lateral: new THREE.Vector3(), offset: new THREE.Vector3(),
    along: 0, across: 0, slipAngle: 0, load: 0, capacity: 0, lateralDemand: 0,
    brakeTorque: 0, longitudinalForce: 0, lateralForce: 0, paved: true,
  }));
  const cameraHeight = 2.3;
  const fixedStep = 1 / 120;
  const velocity = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, 1);
  const travel = new THREE.Vector3(0, 0, 1);
  const cameraDirection = new THREE.Vector3(0, 0, 1);
  const desiredCamera = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const desiredLookTarget = new THREE.Vector3();
  const travelVelocity = new THREE.Vector3();
  const previousVelocity = new THREE.Vector3();
  const currentVelocity = new THREE.Vector3();
  const visualStates = [car.chassis, ...car.wheels, ...cones].map((object) => ({
    object,
    previousPosition: new THREE.Vector3(),
    position: new THREE.Vector3(),
    previousRotation: new THREE.Quaternion(),
    rotation: new THREE.Quaternion(),
  }));
  const wheelBasis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const wheelContacts = [false, false, false, false];
  const physicsRotation = new THREE.Quaternion();
  const tireOffset = new THREE.Vector3();
  const contactPosition = new THREE.Vector3();
  const tireForward = new THREE.Vector3();
  const tireLateral = new THREE.Vector3();
  const tireNormal = new THREE.Vector3();
  const forceOffset = new Ammo.btVector3(0, 0, 0);
  const suspensionUp = new THREE.Vector3();
  const antiRollOffset = new THREE.Vector3();
  const resetTransform = new Ammo.btTransform();
  resetTransform.setIdentity();
  const spawnNormal = terrain.normalAt(spawn.position[0], spawn.position[1]);
  const spawnForward = new THREE.Vector3(Math.sin(spawn.heading), 0, Math.cos(spawn.heading))
    .projectOnPlane(spawnNormal).normalize();
  const spawnRight = new THREE.Vector3().crossVectors(spawnNormal, spawnForward).normalize();
  const spawnQuaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(spawnRight, spawnNormal, spawnForward),
  );
  vector.setValue(spawn.position[0], terrain.heightAt(spawn.position[0], spawn.position[1]) + 0.8, spawn.position[1]);
  resetTransform.setOrigin(vector);
  const spawnRotation = new Ammo.btQuaternion(spawnQuaternion.x, spawnQuaternion.y, spawnQuaternion.z, spawnQuaternion.w);
  resetTransform.setRotation(spawnRotation);
  Ammo.destroy(spawnRotation);

  const maxMarks = 6000;
  const markPositions = new Float32Array(maxMarks * 18);
  const markColors = new Float32Array(maxMarks * 18);
  const markNormals = new Float32Array(maxMarks * 18);
  const markGeometry = new THREE.BufferGeometry();
  const markAttribute = new THREE.BufferAttribute(markPositions, 3).setUsage(THREE.DynamicDrawUsage);
  markGeometry.setAttribute('position', markAttribute);
  const markColorAttribute = new THREE.BufferAttribute(markColors, 3).setUsage(THREE.DynamicDrawUsage);
  markGeometry.setAttribute('color', markColorAttribute);
  const markNormalAttribute = new THREE.BufferAttribute(markNormals, 3).setUsage(THREE.DynamicDrawUsage);
  markGeometry.setAttribute('normal', markNormalAttribute);
  markGeometry.setDrawRange(0, 0);
  const marks = new THREE.Mesh(markGeometry, new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 1,
    transparent: true, opacity: 0.45, depthWrite: false,
  }));
  marks.frustumCulled = false;
  scene.add(marks);
  const previousTires = [new THREE.Vector3(), new THREE.Vector3()];
  const previousLeft = [new THREE.Vector3(), new THREE.Vector3()];
  const previousRight = [new THREE.Vector3(), new THREE.Vector3()];
  const tireAcross = new THREE.Vector3();
  const tireLeft = new THREE.Vector3();
  const tireRight = new THREE.Vector3();
  const markTriangle = new THREE.Triangle();
  const markNormal = new THREE.Vector3();
  const marking = [false, false];
  const wheelAsphalt = [true, true, true, true];
  const previousAsphalt = [true, true];
  const asphaltMark = new THREE.Color(0x101214);
  const dirtMark = new THREE.Color(0x493827);
  let markCount = 0;

  const smoke = new TireSmoke(scene);
  scene.add(smoke.mesh);

  function syncVisuals() {
    cones.forEach((cone, i) => {
      const transform = coneBodies[i].getWorldTransform();
      const position = transform.getOrigin();
      const rotation = transform.getRotation();
      cone.position.set(position.x(), position.y(), position.z());
      cone.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    });
    const transform = body.getWorldTransform();
    const position = transform.getOrigin();
    const rotation = transform.getRotation();
    car.chassis.position.set(position.x(), position.y(), position.z());
    car.chassis.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    car.wheels.forEach((wheel, i) => {
      vehicle.getWheelInfo(i).set_m_rotation(tireAngles[i]);
      vehicle.updateWheelTransform(i, true);
      const transform = vehicle.getWheelTransformWS(i);
      const position = transform.getOrigin();
      const rotation = transform.getRotation();
      wheel.position.set(position.x(), position.y(), position.z());
      wheel.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
      wheel.quaternion.multiply(wheelBasis);
    });
  }

  function captureVisuals(snap = false) {
    for (const state of visualStates) {
      state.previousPosition.copy(state.position);
      state.previousRotation.copy(state.rotation);
    }
    previousVelocity.copy(currentVelocity);
    syncVisuals();
    const linear = body.getLinearVelocity();
    currentVelocity.set(linear.x(), 0, linear.z());
    for (const state of visualStates) {
      state.position.copy(state.object.position);
      state.rotation.copy(state.object.quaternion);
      if (snap) {
        state.previousPosition.copy(state.position);
        state.previousRotation.copy(state.rotation);
      }
    }
    if (snap) previousVelocity.copy(currentVelocity);
  }

  function reset() {
    controls.clear();
    audio.reset();
    drivetrain.reset();
    for (const tire of tireSounds) tire.slip = tire.speed = tire.load = 0;
    coneSoundCooldowns.clear();
    spawnBrakeHeld = true;
    car.setBraking(true);
    car.setReversing(false);
    car.setHazards(false);
    offTrackTime = 0;
    reversing = false;
    cameraYaw = cameraPitch = 0;
    slideCameraAmount = outsideOffset = cameraTurnRate = 0;
    previousTravel.set(0, 0, 0);
    steering = 0;
    accumulator = 0;
    burnout = 0;
    tireSpeeds.fill(0);
    tireAngles.fill(0);
    wheelContacts.fill(false);
    smoke.reset();
    markCount = 0;
    markGeometry.setDrawRange(0, 0);
    coneBodies.forEach((cone, i) => {
      coneResetTransform.setIdentity();
      const start = coneStarts[i];
      const rotation = coneRotations[i];
      const coneRotation = new Ammo.btQuaternion(rotation.x, rotation.y, rotation.z, rotation.w);
      coneResetTransform.setRotation(coneRotation);
      Ammo.destroy(coneRotation);
      vector.setValue(start.x, start.y, start.z);
      coneResetTransform.setOrigin(vector);
      cone.setCenterOfMassTransform(coneResetTransform);
      cone.getMotionState().setWorldTransform(coneResetTransform);
      vector.setValue(0, 0, 0);
      cone.setLinearVelocity(vector);
      cone.setAngularVelocity(vector);
      cone.clearForces();
      cone.activate(true);
      world.updateSingleAabb(cone);
    });
    body.setCenterOfMassTransform(resetTransform);
    body.getMotionState().setWorldTransform(resetTransform);
    vector.setValue(0, 0, 0);
    body.setLinearVelocity(vector);
    body.setAngularVelocity(vector);
    body.clearForces();
    vehicle.resetSuspension();
    for (let i = 0; i < 4; i++) {
      vehicle.setSteeringValue(0, i);
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(0, i);
    }
    world.updateSingleAabb(body);
    captureVisuals(true);
    laps.reset(car.chassis.position);
    velocity.set(0, 0, 0);
    cameraDirection.set(Math.sin(spawn.heading), 0, Math.cos(spawn.heading));
    camera.position.copy(car.chassis.position).addScaledVector(cameraDirection, -9);
    camera.position.y += cameraHeight;
    lookTarget.copy(car.chassis.position).add(new THREE.Vector3(0, 0.65, 0));
    camera.lookAt(lookTarget);
    marking.fill(false);
  }

  window.addEventListener('keydown', (event) => {
    if (gameState.getState().helpOpen) return;
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
    if (!controlKeys.has(event.code)) return;
    if (event.target instanceof HTMLButtonElement && event.code === 'Space') return;
    event.preventDefault();
    if (event.code === 'KeyR') {
      if (!event.repeat) reset();
    } else keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    if (event.target instanceof HTMLInputElement) {
      keys.delete(event.code);
      return;
    }
    if (event.target instanceof HTMLSelectElement) return;
    if (controlKeys.has(event.code)) {
      event.preventDefault();
      keys.delete(event.code);
    }
  });
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => {
    keys.clear();
    lastTime = 0;
    accumulator = 0;
    captureVisuals(true);
  });
  bindGameActions({ reset, sound: () => audio.toggle(), clearInput: () => controls.clear() });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
  });
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    audio.silence();
    renderer.setAnimationLoop(null);
    gameState.update({ status: { visible: true, error: true, message: 'Graphics context lost. Reload the page to restart.' } });
  });

  function step() {
    const { driveMode, profiles } = gameState.getState();
    const tune = driveModes[driveMode];
    const tireTune = profiles[driveMode];
    const linear = body.getLinearVelocity();
    const angular = body.getAngularVelocity();
    const speed = Math.hypot(linear.x(), linear.z()) * 3.6;
    const rotation = body.getWorldTransform().getRotation();
    physicsRotation.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    tireForward.set(0, 0, 1).applyQuaternion(physicsRotation);
    const forwardSpeed = linear.x() * tireForward.x + linear.z() * tireForward.z;
    if (controls.throttle > 0) spawnBrakeHeld = false;
    if (spawnBrakeHeld || controls.throttle > 0 || controls.reverse === 0) reversing = false;
    else if (Math.abs(forwardSpeed) < 0.5 && Math.abs(angular.y()) < 0.5 && speed < 4) reversing = true;
    const input = controls.steer;
    const steeringLimit = THREE.MathUtils.lerp(tune.steeringLow, tune.steeringHigh, Math.min(speed / 140, 1))
      * tireTune.steeringScale;
    let targetSteering = input * steeringLimit;
    if (tireTune.steeringAssist && !reversing) {
      tireOffset.copy(car.centers[0]).add(car.centers[1]).multiplyScalar(0.5).applyQuaternion(physicsRotation);
      tireLateral.set(1, 0, 0).applyQuaternion(physicsRotation);
      const vx = linear.x() + angular.y() * tireOffset.z - angular.z() * tireOffset.y;
      const vy = linear.y() + angular.z() * tireOffset.x - angular.x() * tireOffset.z;
      const vz = linear.z() + angular.x() * tireOffset.y - angular.y() * tireOffset.x;
      targetSteering = assistedSteeringAngle(input, steeringLimit,
        vx * tireForward.x + vy * tireForward.y + vz * tireForward.z,
        vx * tireLateral.x + vy * tireLateral.y + vz * tireLateral.z, tune.steeringSlipLimit);
    }
    const counterSteering = targetSteering !== 0 && Math.sign(targetSteering) !== Math.sign(steering);
    const smoothedSteering = THREE.MathUtils.damp(steering, targetSteering, counterSteering ? 16 : 10, fixedStep);
    const unwinding = Math.abs(targetSteering) < Math.abs(steering);
    const maxChange = tireTune.steeringRate * (counterSteering || unwinding ? 1.6 : 1) * fixedStep;
    steering += THREE.MathUtils.clamp(smoothedSteering - steering, -maxChange, maxChange);
    const brakeAmount = spawnBrakeHeld ? 1 : reversing ? 0 : controls.brake;
    const braking = brakeAmount > 0;
    const handbrake = controls.handbrake;
    const throttle = reversing ? controls.reverse : controls.throttle;
    const brakestand = throttle > 0 && braking && !reversing;
    burnout = 0;
    for (const tire of tireSounds) tire.slip = tire.speed = tire.load = 0;
    for (const [cone, remaining] of coneSoundCooldowns) {
      if (remaining <= fixedStep) coneSoundCooldowns.delete(cone);
      else coneSoundCooldowns.set(cone, remaining - fixedStep);
    }
    suspensionUp.set(0, 1, 0).applyQuaternion(physicsRotation);
    for (const axle of [0, 2]) {
      const left = vehicle.getWheelInfo(axle).get_m_raycastInfo();
      const right = vehicle.getWheelInfo(axle + 1).get_m_raycastInfo();
      // A bar transfers spring force, never pulls an airborne wheel toward the road.
      if (!wheelContacts[axle] || !wheelContacts[axle + 1]) continue;
      const leftLoad = Math.max(0, vehicle.getWheelInfo(axle).get_m_wheelsSuspensionForce());
      const rightLoad = Math.max(0, vehicle.getWheelInfo(axle + 1).get_m_wheelsSuspensionForce());
      const limit = Math.min(leftLoad, rightLoad) * 0.4;
      const barForce = THREE.MathUtils.clamp(
        (right.get_m_suspensionLength() - left.get_m_suspensionLength()) * 12000, -limit, limit,
      );
      for (let side = 0; side < 2; side++) {
        antiRollOffset.copy(car.centers[axle + side]).applyQuaternion(physicsRotation);
        const force = side === 0 ? barForce : -barForce;
        vector.setValue(suspensionUp.x * force, suspensionUp.y * force, suspensionUp.z * force);
        forceOffset.setValue(antiRollOffset.x, antiRollOffset.y, antiRollOffset.z);
        body.applyForce(vector, forceOffset);
      }
    }
    for (let i = 0; i < 4; i++) {
      const rear = i >= 2;
      vehicle.setSteeringValue(rear ? 0 : steering, i);
      const wheel = vehicle.getWheelInfo(i);
      const contact = wheel.get_m_raycastInfo();
      let paved = true;
      tireNormal.set(0, 1, 0);
      tireOffset.copy(car.centers[i]).applyQuaternion(physicsRotation);
      if (wheelContacts[i]) {
        const point = contact.get_m_contactPointWS();
        const origin = body.getWorldTransform().getOrigin();
        tireOffset.set(point.x() - origin.x(), point.y() - origin.y(), point.z() - origin.z());
        contactPosition.set(point.x(), point.y(), point.z());
        paved = isAsphalt(contactPosition);
        const normal = contact.get_m_contactNormalWS();
        tireNormal.set(normal.x(), normal.y(), normal.z()).normalize();
      }
      tireForward.set(Math.sin(rear ? 0 : steering), 0, Math.cos(rear ? 0 : steering))
        .applyQuaternion(physicsRotation);
      tireForward.projectOnPlane(tireNormal).normalize();
      tireLateral.crossVectors(tireNormal, tireForward).normalize();
      const vx = linear.x() + angular.y() * tireOffset.z - angular.z() * tireOffset.y;
      const vy = linear.y() + angular.z() * tireOffset.x - angular.x() * tireOffset.z;
      const vz = linear.z() + angular.x() * tireOffset.y - angular.y() * tireOffset.x;
      const along = vx * tireForward.x + vy * tireForward.y + vz * tireForward.z;
      const across = vx * tireLateral.x + vy * tireLateral.y + vz * tireLateral.z;
      const slipAngle = Math.atan2(across, Math.max(Math.abs(along), 2));
      const load = wheelContacts[i] ? Math.max(0, wheel.get_m_wheelsSuspensionForce()) : 0;
      const staticGrip = braking && !rear ? 0.15 * brakeAmount * (1 - THREE.MathUtils.smoothstep(Math.abs(along), 0.2, 0.5)) : 0;
      const surfaceGrip = paved ? 1 : 0.65;
      const capacity = load * (tune.friction * (rear ? tireTune.rearGrip : tireTune.frontGrip) + staticGrip) * surfaceGrip;
      const lateralDemand = -(rear ? tireTune.rearStiffness : tireTune.frontStiffness) * slipAngle * surfaceGrip;
      const brakeTorque = rear && handbrake ? 4500
        : brakeAmount * (rear ? brakestand ? 0 : 1300 : 1900);
      const tire = tireContacts[i];
      tire.forward.copy(tireForward);
      tire.lateral.copy(tireLateral);
      tire.offset.copy(tireOffset);
      Object.assign(tire, {
        along, across, slipAngle, load, capacity, lateralDemand, brakeTorque, paved,
        longitudinalForce: 0, lateralForce: 0,
      });
    }
    drivetrainInput.throttle = throttle;
    drivetrainInput.reversing = reversing;
    drivetrainInput.handbrake = handbrake;
    drivetrainInput.speedLimited = speed >= (reversing ? 35 : 240);
    const powerScale = tireTune.horsepower / Math.round(tune.enginePower / wattsPerHorsepower);
    drivetrainInput.peakTorque = tune.engineTorque * powerScale;
    drivetrainInput.peakPower = tune.enginePower * powerScale;
    // Integrate the engine and both driven wheels together, so each wheel sees
    // the same differential snapshot and tire reaction reaches the crankshaft.
    const tireStep = fixedStep / 12;
    for (let j = 0; j < 12; j++) {
      let driveSlip = 0;
      let excessSpeed = 0;
      let cornerSlip = 0;
      for (let i = 2; i < 4; i++) {
        const tire = tireContacts[i];
        const excess = (tireSpeeds[i] * car.radii[i] - tire.along) * (reversing ? -1 : 1);
        driveSlip = Math.max(driveSlip, excess / Math.max(Math.abs(tire.along), 4));
        excessSpeed = Math.max(excessSpeed, excess);
        if (wheelContacts[i]) cornerSlip = Math.max(cornerSlip, Math.abs(tire.slipAngle));
      }
      drivetrainInput.wheelSpeed = (tireSpeeds[2] + tireSpeeds[3]) / 2;
      drivetrainInput.sliding = (driveSlip > 0.12 && excessSpeed > 1.5)
        || (cornerSlip > 0.16 && speed > 15);
      const engineTorque = drivetrain.step(tireStep, drivetrainInput);
      const differential = THREE.MathUtils.clamp((tireSpeeds[3] - tireSpeeds[2]) * 8, -250, 250);
      for (let i = 0; i < 4; i++) {
        const rear = i >= 2;
        const tire = tireContacts[i];
        const { along, capacity, lateralDemand, brakeTorque } = tire;
        const slipRatio = (tireSpeeds[i] * car.radii[i] - along) / Math.max(Math.abs(along), braking ? 0.5 : 4);
        // Saturate both pure-slip demands before sharing the friction circle;
        // unbounded wheelspin demand would erase lateral force under throttle.
        const driveDemand = capacity * Math.tanh(slipRatio * 8);
        const lateral = capacity * Math.tanh(lateralDemand / Math.max(capacity, 1));
        const combined = Math.hypot(driveDemand, lateral);
        // Sliding rubber has less grip than the peak, allowing genuine
        // wheelspin instead of holding maximum traction at unlimited slip.
        const combinedSlip = Math.hypot(slipRatio / 0.12, tire.slipAngle / 0.16);
        const minimumGrip = rear ? tireTune.rearSlidingGrip : tune.frontSlidingGrip;
        const slidingGrip = 1 - (1 - minimumGrip) * THREE.MathUtils.smoothstep(combinedSlip, 1, 4);
        const scale = (combined > capacity ? capacity / combined : 1) * slidingGrip;
        const fx = driveDemand * scale;
        const fy = lateral * scale;
        const torque = (rear ? engineTorque + (i === 2 ? differential : -differential) : 0) - fx * car.radii[i];
        const nextSpeed = tireSpeeds[i] + torque / wheelInertia * tireStep;
        tireSpeeds[i] = Math.sign(nextSpeed) * Math.max(0, Math.abs(nextSpeed) - brakeTorque / wheelInertia * tireStep);
        tireAngles[i] += tireSpeeds[i] * tireStep;
        tire.longitudinalForce += fx / 12;
        tire.lateralForce += fy / 12;
      }
    }
    for (let i = 0; i < 4; i++) {
      const rear = i >= 2;
      const tire = tireContacts[i];
      const { along, across, slipAngle, load, paved, longitudinalForce, lateralForce } = tire;
      tireForward.copy(tire.forward);
      tireLateral.copy(tire.lateral);
      tireOffset.copy(tire.offset);
      if (wheelContacts[i]) {
        const excessSpeed = Math.abs(tireSpeeds[i] * car.radii[i] - along);
        const slipRatio = excessSpeed / Math.max(Math.abs(along), 4);
        if (paved && load > 100) {
          const lateralSlip = THREE.MathUtils.smoothstep(Math.abs(slipAngle), 0.08, 0.35)
            * THREE.MathUtils.smoothstep(Math.abs(across), 0.8, 4);
          const longitudinalSlip = THREE.MathUtils.smoothstep(slipRatio, 0.15, 0.65)
            * THREE.MathUtils.smoothstep(excessSpeed, 1, 5);
          tireSounds[i].slip = Math.max(lateralSlip, longitudinalSlip);
          tireSounds[i].speed = Math.hypot(across, excessSpeed);
          tireSounds[i].load = load / (1450 * 9.81 / 4);
        }
        // Normal acceleration needs a small amount of slip, not tire smoke.
        if (rear) burnout = Math.max(burnout, THREE.MathUtils.smoothstep(slipRatio, 0.18, 0.65)
          * THREE.MathUtils.smoothstep(excessSpeed, 1, 4));
      }
      vector.setValue(
        tireForward.x * longitudinalForce,
        tireForward.y * longitudinalForce,
        tireForward.z * longitudinalForce,
      );
      forceOffset.setValue(tireOffset.x, tireOffset.y, tireOffset.z);
      body.applyForce(vector, forceOffset);
      // Approximate suspension roll-center geometry for our custom lateral forces.
      // Bullet's rollInfluence only affects its disabled built-in tire model.
      const rollCenterOffset = -tireOffset.dot(suspensionUp) * 0.5;
      forceOffset.setValue(
        tireOffset.x + suspensionUp.x * rollCenterOffset,
        tireOffset.y + suspensionUp.y * rollCenterOffset,
        tireOffset.z + suspensionUp.z * rollCenterOffset,
      );
      vector.setValue(tireLateral.x * lateralForce, tireLateral.y * lateralForce, tireLateral.z * lateralForce);
      body.applyForce(vector, forceOffset);
    }
    const drag = 8 + 0.45 * Math.hypot(linear.x(), linear.z());
    vector.setValue(-linear.x() * drag, 0, -linear.z() * drag);
    body.applyCentralForce(vector);
    world.stepSimulation(fixedStep, 0);
    for (let i = 0; i < dispatcher.getNumManifolds(); i++) {
      const manifold = dispatcher.getManifoldByIndexInternal(i);
      const first = Ammo.getPointer(manifold.getBody0());
      const second = Ammo.getPointer(manifold.getBody1());
      const cone = first === carPointer ? coneIds.get(second)
        : second === carPointer ? coneIds.get(first) : undefined;
      if (cone === undefined) continue;
      let impulse = 0;
      let touching = false;
      for (let j = 0; j < manifold.getNumContacts(); j++) {
        const point = manifold.getContactPoint(j);
        if (point.getDistance() <= 0) {
          touching = true;
          impulse += point.getAppliedImpulse();
        }
      }
      if (touching) {
        laps.hitCone(cone);
        if (impulse >= 0.5 && !coneSoundCooldowns.has(cone)) {
          audio.hitCone(impulse);
          coneSoundCooldowns.set(cone, 0.3);
        }
      }
    }
    const lapOrigin = body.getWorldTransform().getOrigin();
    lapPosition.set(lapOrigin.x(), lapOrigin.y(), lapOrigin.z());
    laps.update(lapPosition, fixedStep);
    offTrackTime = isAsphalt(lapPosition) ? 0 : offTrackTime + fixedStep;
    car.setHazards(offTrackTime > 3 && (offTrackTime - 3) % 0.8 < 0.4);
    for (let i = 0; i < 4; i++) {
      wheelContacts[i] = vehicle.getWheelInfo(i).get_m_raycastInfo().get_m_isInContact();
    }
  }

  function frame(time: number) {
    const { driveMode, profiles, cameraStyle, helpOpen, focused } = gameState.getState();
    const tune = driveModes[driveMode];
    controls.poll(!helpOpen, profiles[driveMode].steeringExpo);
    if (controls.resetRequested) reset();
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : fixedStep;
    lastTime = time;
    accumulator += dt;
    while (accumulator >= fixedStep) {
      step();
      captureVisuals();
      accumulator -= fixedStep;
    }
    const alpha = accumulator / fixedStep;
    car.setBraking(spawnBrakeHeld || (!reversing && controls.brake > 0));
    car.setReversing(reversing);
    for (const state of visualStates) {
      state.object.position.lerpVectors(state.previousPosition, state.position, alpha);
      state.object.quaternion.slerpQuaternions(state.previousRotation, state.rotation, alpha);
    }
    velocity.lerpVectors(previousVelocity, currentVelocity, alpha);
    const speed = velocity.length();
    audio.update({
      drivetrain: drivetrain.state,
      tires: tireSounds,
    }, focused && !helpOpen);
    const engine = drivetrain.state;
    forward.set(0, 0, 1).applyQuaternion(car.chassis.quaternion);
    forward.y = 0;
    forward.normalize();
    travel.copy(forward);
    travelVelocity.copy(velocity).normalize();
    travel.lerp(travelVelocity, tune.cameraTravelBlend * THREE.MathUtils.smoothstep(speed, 0.5, 3)).normalize();
    cameraDirection.lerp(travel, 1 - Math.exp(-tune.cameraDirectionResponse * dt)).normalize();
    const yawResponse = !controls.lookBehind && controls.cameraX === 0 ? tune.cameraRecenterResponse : 9;
    const pitchResponse = controls.cameraY === 0 ? tune.cameraRecenterResponse : 9;
    cameraYaw = THREE.MathUtils.damp(cameraYaw, controls.lookBehind ? Math.PI : -controls.cameraX * 0.45, yawResponse, dt);
    cameraPitch = THREE.MathUtils.damp(cameraPitch, -controls.cameraY * 0.8, pitchResponse, dt);
    const cabin = cameraStyle === 'cabin';
    if (cameraStyle !== previousCameraStyle) {
      camera.fov = cabin ? 75 : 55;
      camera.near = cabin ? 0.03 : 0.1;
      camera.updateProjectionMatrix();
    }
    if (cabin) {
      camera.position.copy(cabinEye).applyQuaternion(car.chassis.quaternion).add(car.chassis.position);
      cabinDirection.set(0, 0, 1)
        .applyAxisAngle(up, cameraYaw)
        .applyAxisAngle(cameraRight.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw)), -cameraPitch * 0.6)
        .applyQuaternion(car.chassis.quaternion);
      cabinUp.set(0, 1, 0).applyQuaternion(car.chassis.quaternion);
      camera.up.copy(cabinUp);
      camera.lookAt(desiredLookTarget.copy(camera.position).add(cabinDirection));
      previousTravel.copy(travelVelocity);
    } else {
      camera.up.copy(up);
      cameraOrbit.copy(cameraDirection).applyAxisAngle(up, cameraYaw);
      desiredCamera.copy(car.chassis.position).addScaledVector(cameraOrbit, -9 - Math.min(speed * 0.04, 2));
      desiredCamera.y = car.chassis.position.y + cameraHeight + cameraPitch;
      const motionTurn = speed > 3 && previousTravel.lengthSq() > 0
        ? Math.atan2(previousTravel.z * travelVelocity.x - previousTravel.x * travelVelocity.z,
          previousTravel.dot(travelVelocity)) / Math.max(dt, 0.001) : 0;
      previousTravel.copy(travelVelocity);
      cameraTurnRate = THREE.MathUtils.damp(cameraTurnRate, motionTurn, 4, dt);
      const manualCamera = controls.lookBehind || Math.abs(cameraYaw) > 0.1
        || Math.abs(controls.cameraX) > 0 || Math.abs(controls.cameraY) > 0;
      const cornerCamera = cameraStyle === 'corner' && !manualCamera && !reversing;
      const slideAngle = speed > 3 ? Math.acos(THREE.MathUtils.clamp(forward.dot(travelVelocity), -1, 1)) : 0;
      const slideAmount = cornerCamera
        ? THREE.MathUtils.smoothstep(slideAngle, 0.12, 0.65) * THREE.MathUtils.smoothstep(speed, 3, 10) : 0;
      slideCameraAmount = THREE.MathUtils.damp(slideCameraAmount, slideAmount, 3, dt);
      outsideOffset = THREE.MathUtils.damp(outsideOffset,
        -THREE.MathUtils.clamp(cameraTurnRate / 0.35, -1, 1) * slideCameraAmount * 1.8, 3, dt);
      if (cameraStyle === 'corner') {
        cameraRight.set(cameraDirection.z, 0, -cameraDirection.x);
        desiredCamera.addScaledVector(cameraRight, outsideOffset).addScaledVector(cameraOrbit, -slideCameraAmount);
        desiredCamera.y += slideCameraAmount * 0.7;
      }
      if (previousCameraStyle === 'cabin') camera.position.copy(desiredCamera);
      else camera.position.lerp(desiredCamera, 1 - Math.exp(-tune.cameraPositionResponse * dt));
      camera.position.y = Math.max(camera.position.y, terrain.heightAt(camera.position.x, camera.position.z) + 1);
      desiredLookTarget.copy(car.chassis.position).addScaledVector(velocity, 0.18);
      desiredLookTarget.y += 0.65;
      if (cornerCamera) {
        let nearest = 0;
        let distance = Infinity;
        for (let i = 0; i < cameraRoutePoints.length; i++) {
          const point = cameraRoutePoints[i];
          const next = cameraRoutePoints[(i + 1) % cameraRoutePoints.length];
          const dx = next.x - point.x;
          const dz = next.z - point.z;
          const fraction = THREE.MathUtils.clamp(
            ((car.chassis.position.x - point.x) * dx + (car.chassis.position.z - point.z) * dz)
            / Math.max(dx * dx + dz * dz, 0.000001), 0, 1,
          );
          const squared = (point.x + dx * fraction - car.chassis.position.x) ** 2
            + (point.z + dz * fraction - car.chassis.position.z) ** 2;
          if (squared < distance) {
            distance = squared;
            nearest = i + fraction;
          }
        }
        const t = nearest / cameraRoutePoints.length;
        cameraRoute.getTangentAt(t, routeTangent);
        const onCourse = 1 - THREE.MathUtils.smoothstep(Math.sqrt(distance), cameraCourseWidth / 2, cameraCourseWidth);
        const alignment = THREE.MathUtils.smoothstep(travelVelocity.dot(routeTangent), 0.2, 0.8);
        const amount = onCourse * alignment * THREE.MathUtils.smoothstep(speed, 2, 8);
        cameraRoute.getPointAt((t + THREE.MathUtils.clamp(speed * 0.8, 10, 28) / cameraRouteLength) % 1, cornerTarget);
        cornerTarget.y = terrain.heightAt(cornerTarget.x, cornerTarget.z) + 0.65;
        desiredLookTarget.lerp(cornerTarget, amount * 0.4);
      }
      if (previousCameraStyle === 'cabin') lookTarget.copy(desiredLookTarget);
      else lookTarget.lerp(desiredLookTarget, 1 - Math.exp(-(cameraStyle === 'corner' ? 5 : 10) * dt));
      camera.lookAt(lookTarget);
    }
    previousCameraStyle = cameraStyle;
    sun.position.copy(car.chassis.position).add(shadowOffset);
    sun.target.position.copy(car.chassis.position);

    const slip = speed > 3 ? 1 - Math.abs(forward.dot(velocity) / speed) : 0;
    const sliding = speed > 3 && (controls.handbrake || slip > 0.045);
    const burningOut = burnout > 0.1 && (wheelContacts[2] || wheelContacts[3]);
    const leavingMarks = sliding || burningOut;
    for (let i = 2; i < 4; i++) wheelAsphalt[i] = isAsphalt(car.wheels[i].position);
    if (leavingMarks) {
      car.wheels.slice(2).forEach((wheel, i) => {
        const contact = wheelContacts[i + 2];
        tireAcross.set(1, 0, 0).applyQuaternion(wheel.quaternion);
        tireAcross.y = 0;
        tireAcross.normalize().multiplyScalar(car.widths[i + 2] / 2);
        const paved = wheelAsphalt[i + 2];
        tireLeft.copy(wheel.position).sub(tireAcross);
        tireRight.copy(wheel.position).add(tireAcross);
        tireLeft.y = terrain.heightAt(tireLeft.x, tireLeft.z) + 0.04;
        tireRight.y = terrain.heightAt(tireRight.x, tireRight.z) + 0.04;
        if (marking[i] && contact && paved === previousAsphalt[i] && wheel.position.distanceToSquared(previousTires[i]) < 4) {
          const offset = (markCount % maxMarks) * 18;
          markPositions.set([
            ...previousLeft[i].toArray(),
            ...previousRight[i].toArray(),
            ...tireLeft.toArray(),
            ...previousRight[i].toArray(),
            ...tireRight.toArray(),
            ...tireLeft.toArray(),
          ], offset);
          const color = paved ? asphaltMark : dirtMark;
          for (let vertex = 0; vertex < 6; vertex++) color.toArray(markColors, offset + vertex * 3);
          for (let triangle = 0; triangle < 2; triangle++) {
            const start = offset + triangle * 9;
            markTriangle.a.fromArray(markPositions, start);
            markTriangle.b.fromArray(markPositions, start + 3);
            markTriangle.c.fromArray(markPositions, start + 6);
            markTriangle.getNormal(markNormal);
            for (let vertex = 0; vertex < 3; vertex++) markNormal.toArray(markNormals, start + vertex * 3);
          }
          markCount++;
        }
        previousTires[i].copy(wheel.position);
        previousLeft[i].copy(tireLeft);
        previousRight[i].copy(tireRight);
        marking[i] = contact;
        previousAsphalt[i] = paved;
      });
      markAttribute.needsUpdate = true;
      markColorAttribute.needsUpdate = true;
      markNormalAttribute.needsUpdate = true;
      markGeometry.setDrawRange(0, Math.min(markCount, maxMarks) * 6);
    } else {
      marking.fill(false);
    }
    smoke.update(dt, car.wheels, wheelContacts, leavingMarks, velocity, camera, wheelAsphalt,
      (x, z) => terrain.heightAt(x, z));
    gameState.update({
      controllerStatus: controls.controllerStatus,
      telemetry: {
        speed, rpm: engine.rpm, gear: engine.gear, limiter: engine.limiterCut,
        lap: laps.lap, current: laps.current, last: laps.last, best: laps.best,
        cones: laps.conesHit, lastCones: laps.lastCones,
        driving: spawnBrakeHeld ? 'brakes-held'
          : controls.handbrake ? 'handbrake'
          : controls.brake > 0 && controls.throttle > 0 ? 'brakestand'
          : reversing ? 'reverse' : controls.brake > 0 ? 'braking'
          : burningOut ? 'burnout' : sliding ? 'sliding' : 'driving',
      },
    });
    if (!terrain.contains(car.chassis.position.x, car.chassis.position.z)
      || car.chassis.position.y < terrain.heightAt(car.chassis.position.x, car.chassis.position.z) - 5) reset();
    smoke.captureDepth(renderer, scene, camera);
    renderer.render(scene, camera);
  }

  reset();
  gameState.update({ status: { visible: false, error: false, message: '' } });
  renderer.setAnimationLoop((time) => {
    try {
      frame(time);
    } catch (error) {
      audio.silence();
      renderer.setAnimationLoop(null);
      showError(error);
    }
  });
}

function showError(error: unknown) {
  console.error('Unable to run Dorifto:', error);
  gameState.update({ status: {
    visible: true, error: true,
    message: `Unable to run the demo: ${error instanceof Error ? error.message : String(error)}. Check the console and reload to retry.`,
  } });
}

void start().catch(showError);
