import * as THREE from 'three';
import AmmoFactory from 'ammojs-typed';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCar } from './car';
import { TireSmoke } from './smoke';
import { DrivingControls } from './controls';
import { createCourse } from './course';
import { courses, courseSpawn, generateCourse } from './courses';
import { driveModes, isDriveMode } from './drive-modes';
import { LapTimer, formatLapTime } from './laps';
import './style.css';

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing UI element: ${selector}`);
  return found;
}

const status = element('#status');
const speedDisplay = element('#speed');
const stateDisplay = element('#state');

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

function isTimeOfDay(value: string): value is keyof typeof daylight {
  return Object.hasOwn(daylight, value);
}

async function start() {
  const modeSelect = element<HTMLSelectElement>('#drive-mode');
  const requestedMode = new URL(location.href).searchParams.get('mode') ?? 'drift';
  if (!isDriveMode(requestedMode)) throw new Error(`Unknown drive mode: ${requestedMode}`);
  let driveMode = requestedMode;
  modeSelect.value = driveMode;
  modeSelect.addEventListener('change', () => {
    const value = modeSelect.value;
    if (!isDriveMode(value)) {
      showError(new Error(`Unknown drive mode: ${value}`));
      return;
    }
    driveMode = value;
    const url = new URL(location.href);
    url.searchParams.set('mode', driveMode);
    history.replaceState(null, '', url);
    modeSelect.blur();
  });
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
  const laps = new LapTimer(definition);
  const lapPosition = new THREE.Vector3();
  const lapNumber = element('#lap-number');
  const lapCurrent = element('#lap-current');
  const lapLast = element('#lap-last');
  const lapBest = element('#lap-best');
  const lapCones = element('#lap-cones');
  const lapLastCones = element('#lap-last-cones');
  const courseSelect = document.querySelector<HTMLSelectElement>('#course');
  if (!courseSelect) throw new Error('Missing course selector');
  for (const course of courses) courseSelect.add(new Option(course.name, course.id));
  courseSelect.add(new Option(requestedCourse === 'random' ? definition.name : 'Random Circuit', 'random'));
  courseSelect.value = definition.id;
  function randomCourse() {
    const url = new URL(location.href);
    url.searchParams.set('course', 'random');
    url.searchParams.set('seed', String(crypto.getRandomValues(new Uint32Array(1))[0]));
    location.assign(url.href);
  }
  element('#random-course').addEventListener('click', randomCourse);
  courseSelect.addEventListener('change', () => {
    if (courseSelect.value === 'random') {
      randomCourse();
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set('course', courseSelect.value);
    url.searchParams.delete('seed');
    location.assign(url.href);
  });
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
  const timeSelect = element<HTMLSelectElement>('#time-of-day');
  const requestedTime = new URL(location.href).searchParams.get('time') ?? 'noon';
  if (!isTimeOfDay(requestedTime)) throw new Error(`Unknown time of day: ${requestedTime}`);
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
    timeSelect.value = time;
  };
  applyTimeOfDay(requestedTime);
  const { cones, terrain, isAsphalt } = createCourse(scene, definition);

  // The upstream Emscripten factory writes to `this`; ESM calls have no receiver.
  const [Ammo, car] = await Promise.all([AmmoFactory.call({}), loadCar()]);
  // The picker may change while the model is loading.
  const selectedTime = timeSelect.value;
  if (!isTimeOfDay(selectedTime)) throw new Error(`Unknown time of day: ${selectedTime}`);
  applyTimeOfDay(selectedTime);
  car.setNightLighting(selectedTime === 'night');
  timeSelect.addEventListener('change', () => {
    const value = timeSelect.value;
    if (!isTimeOfDay(value)) {
      showError(new Error(`Unknown time of day: ${value}`));
      return;
    }
    applyTimeOfDay(value);
    car.setNightLighting(value === 'night');
    const url = new URL(location.href);
    url.searchParams.set('time', value);
    history.replaceState(null, '', url);
    timeSelect.blur();
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
  vector.setValue(0.86, 0.23, 2.02);
  const body = rigidBody(1450, new Ammo.btBoxShape(vector), new THREE.Vector3(0, 0.8, 0));
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

  const controls = new DrivingControls(element('#controller-status'));
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
  const up = new THREE.Vector3(0, 1, 0);
  const tireSpeeds = [0, 0, 0, 0];
  const tireAngles = [0, 0, 0, 0];
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
  const markGeometry = new THREE.BufferGeometry();
  const markAttribute = new THREE.BufferAttribute(markPositions, 3).setUsage(THREE.DynamicDrawUsage);
  markGeometry.setAttribute('position', markAttribute);
  const markColorAttribute = new THREE.BufferAttribute(markColors, 3).setUsage(THREE.DynamicDrawUsage);
  markGeometry.setAttribute('color', markColorAttribute);
  markGeometry.setDrawRange(0, 0);
  const marks = new THREE.Mesh(markGeometry, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide,
  }));
  marks.frustumCulled = false;
  scene.add(marks);
  const previousTires = [new THREE.Vector3(), new THREE.Vector3()];
  const previousLeft = [new THREE.Vector3(), new THREE.Vector3()];
  const previousRight = [new THREE.Vector3(), new THREE.Vector3()];
  const tireAcross = new THREE.Vector3();
  const tireLeft = new THREE.Vector3();
  const tireRight = new THREE.Vector3();
  const marking = [false, false];
  const wheelAsphalt = [true, true, true, true];
  const previousAsphalt = [true, true];
  const asphaltMark = new THREE.Color(0x484f53);
  const dirtMark = new THREE.Color(0x8d7659);
  let markCount = 0;

  const smoke = new TireSmoke();
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
    spawnBrakeHeld = true;
    car.setBraking(true);
    car.setReversing(false);
    car.setHazards(false);
    offTrackTime = 0;
    reversing = false;
    cameraYaw = cameraPitch = 0;
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
    if (event.target instanceof HTMLSelectElement) return;
    if (!controlKeys.has(event.code)) return;
    if (event.target instanceof HTMLButtonElement && event.code === 'Space') return;
    event.preventDefault();
    if (event.code === 'KeyR') {
      if (!event.repeat) reset();
    } else keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
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
  element('#reset').addEventListener('click', () => {
    reset();
    element<HTMLButtonElement>('#reset').blur();
  });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
  });
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    status.hidden = false;
    status.classList.add('error');
    status.textContent = 'Graphics context lost. Reload the page to restart.';
  });

  function step() {
    const tune = driveModes[driveMode];
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
    const steeringLimit = THREE.MathUtils.lerp(tune.steeringLow, tune.steeringHigh, Math.min(speed / 140, 1));
    const counterSteering = input !== 0 && Math.sign(input) !== Math.sign(steering);
    steering = THREE.MathUtils.damp(steering, input * steeringLimit, counterSteering ? 16 : 10, fixedStep);
    const brakeAmount = spawnBrakeHeld ? 1 : reversing ? 0 : controls.brake;
    const braking = brakeAmount > 0;
    const handbrake = controls.handbrake;
    const throttle = reversing ? controls.reverse : controls.throttle;
    const brakestand = throttle > 0 && braking && !reversing;
    burnout = 0;
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
      const capacity = load * (tune.friction + staticGrip) * surfaceGrip;
      const lateralDemand = -(rear ? tune.rearStiffness : tune.frontStiffness) * slipAngle * surfaceGrip;
      const engineBraking = rear
        ? 500 * (1 - THREE.MathUtils.smoothstep(throttle, 0, 0.25))
          * THREE.MathUtils.smoothstep(Math.abs(along), 0.5, 3) : 0;
      const brakeTorque = rear && handbrake ? 4500
        : Math.max(engineBraking, brakeAmount * (rear ? brakestand ? 650 : 1300 : 1900));
      let longitudinalForce = 0;
      let lateralForce = 0;
      // Substep wheel inertia so tire slip remains stable at low road speeds.
      const tireStep = fixedStep / 12;
      for (let j = 0; j < 12; j++) {
        const driveDirection = reversing ? -1 : 1;
        const driveSlip = (tireSpeeds[i] * car.radii[i] - along) * driveDirection / Math.max(Math.abs(along), 4);
        const traction = tune.tractionControl && !brakestand && !handbrake
          ? 1 - THREE.MathUtils.smoothstep(driveSlip, 0.06, 0.16) : 1;
        const engineTorque = rear && speed < (reversing ? 35 : 240)
          ? throttle * driveDirection * traction
            * Math.min(tune.wheelTorque, tune.wheelPower / Math.max(Math.abs(tireSpeeds[i]), 1)) : 0;
        const slipRatio = (tireSpeeds[i] * car.radii[i] - along) / Math.max(Math.abs(along), braking ? 0.5 : 4);
        // Saturate the combined demand, not each axis independently: a tire
        // spinning far above road speed must lose lateral authority.
        const driveDemand = capacity * slipRatio * 8;
        const lateral = lateralDemand;
        const combined = Math.hypot(driveDemand, lateral);
        const scale = combined > 0 ? capacity * Math.tanh(combined / Math.max(capacity, 1)) / combined : 1;
        const fx = driveDemand * scale;
        const fy = lateral * scale;
        const differential = rear ? THREE.MathUtils.clamp((tireSpeeds[i === 2 ? 3 : 2] - tireSpeeds[i]) * 8, -250, 250) : 0;
        const torque = engineTorque + differential - fx * car.radii[i];
        const nextSpeed = tireSpeeds[i] + torque / 2 * tireStep;
        tireSpeeds[i] = Math.sign(nextSpeed) * Math.max(0, Math.abs(nextSpeed) - brakeTorque / 2 * tireStep);
        tireAngles[i] += tireSpeeds[i] * tireStep;
        longitudinalForce += fx / 12;
        lateralForce += fy / 12;
      }
      if (rear && wheelContacts[i]) {
        const excessSpeed = Math.abs(tireSpeeds[i] * car.radii[i] - along);
        const slipRatio = excessSpeed / Math.max(Math.abs(along), 4);
        // Normal acceleration needs a small amount of slip, not tire smoke.
        burnout = Math.max(burnout, THREE.MathUtils.smoothstep(slipRatio, 0.18, 0.65)
          * THREE.MathUtils.smoothstep(excessSpeed, 1, 4));
      }
      vector.setValue(
        tireForward.x * longitudinalForce + tireLateral.x * lateralForce,
        tireForward.y * longitudinalForce + tireLateral.y * lateralForce,
        tireForward.z * longitudinalForce + tireLateral.z * lateralForce,
      );
      forceOffset.setValue(tireOffset.x, tireOffset.y, tireOffset.z);
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
      for (let j = 0; j < manifold.getNumContacts(); j++) {
        if (manifold.getContactPoint(j).getDistance() <= 0) {
          laps.hitCone(cone);
          break;
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
    const tune = driveModes[driveMode];
    controls.poll();
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
    cameraOrbit.copy(cameraDirection).applyAxisAngle(up, cameraYaw);
    desiredCamera.copy(car.chassis.position).addScaledVector(cameraOrbit, -9 - Math.min(speed * 0.04, 2));
    desiredCamera.y = car.chassis.position.y + cameraHeight + cameraPitch;
    camera.position.lerp(desiredCamera, 1 - Math.exp(-tune.cameraPositionResponse * dt));
    camera.position.y = Math.max(camera.position.y, terrain.heightAt(camera.position.x, camera.position.z) + 1);
    desiredLookTarget.copy(car.chassis.position).addScaledVector(velocity, 0.18);
    desiredLookTarget.y += 0.65;
    lookTarget.lerp(desiredLookTarget, 1 - Math.exp(-10 * dt));
    camera.lookAt(lookTarget);
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
      markGeometry.setDrawRange(0, Math.min(markCount, maxMarks) * 6);
    } else {
      marking.fill(false);
    }
    smoke.update(dt, car.wheels, wheelContacts, leavingMarks, velocity, camera, wheelAsphalt,
      (x, z) => terrain.heightAt(x, z));
    speedDisplay.textContent = String(Math.round(speed * 3.6));
    lapNumber.textContent = laps.lap ? `LAP ${laps.lap}` : 'CROSS START TO BEGIN';
    lapCurrent.textContent = formatLapTime(laps.lap ? laps.current : null);
    lapLast.textContent = formatLapTime(laps.last);
    lapBest.textContent = formatLapTime(laps.best);
    lapCones.textContent = String(laps.conesHit);
    lapLastCones.textContent = laps.lastCones === null ? '--' : String(laps.lastCones);
    stateDisplay.textContent = spawnBrakeHeld ? 'BRAKES HELD'
      : controls.handbrake ? 'HANDBRAKE'
      : controls.brake > 0 && controls.throttle > 0 ? 'BRAKESTAND'
      : reversing ? 'REVERSE' : controls.brake > 0 ? 'BRAKING'
      : burningOut ? 'BURNOUT' : sliding ? 'SLIDING' : 'REAR-WHEEL DRIVE';
    if (!terrain.contains(car.chassis.position.x, car.chassis.position.z)
      || car.chassis.position.y < terrain.heightAt(car.chassis.position.x, car.chassis.position.z) - 5) reset();
    smoke.captureDepth(renderer, scene, camera);
    renderer.render(scene, camera);
  }

  reset();
  status.hidden = true;
  renderer.setAnimationLoop((time) => {
    try {
      frame(time);
    } catch (error) {
      renderer.setAnimationLoop(null);
      showError(error);
    }
  });
}

function showError(error: unknown) {
  console.error('Unable to run Dorifto:', error);
  status.hidden = false;
  status.classList.add('error');
  status.setAttribute('role', 'alert');
  status.textContent = `Unable to run the demo: ${error instanceof Error ? error.message : String(error)}. Check the console and reload to retry.`;
}

void start().catch(showError);
