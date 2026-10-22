import * as THREE from 'three';
import AmmoFactory from 'ammojs-typed';
import { loadCar } from './car';
import { DrivingControls } from './controls';
import { createCourse } from './course';
import { courses, courseSpawn, generateCourse, readCourseReverse, type CourseDefinition } from './courses';
import { generateCustomCourse, readCourseWeights, writeCourseWeights, type CourseGenerationWeights } from './course-generation';
import { isDriveMode } from './drive-modes';
import { LapTimer } from './laps';
import { VehicleAudio } from './audio';
import { createGameState, isCameraStyle, isMinimapOrientation, isTimeOfDay } from './game-state';
import { bindGameUI, bindGameActions, bindCoursePicker, element } from './ui';
import { createDrivingCamera } from './camera';
import { createLighting } from './lighting';
import { createTireEffects } from './tire-effects';
import { createMinimap } from './minimap';
import { createPhysicsResources, createVehiclePhysics } from './vehicle-physics';
import './style.css';

const gameState = createGameState();
bindGameUI(gameState, showError);

async function start() {
  const requestedCamera = new URL(location.href).searchParams.get('camera') ?? 'corner';
  if (!isCameraStyle(requestedCamera)) throw new Error(`Unknown camera style: ${requestedCamera}`);
  const requestedMode = new URL(location.href).searchParams.get('mode') ?? 'drift';
  if (!isDriveMode(requestedMode)) throw new Error(`Unknown drive mode: ${requestedMode}`);
  const requestedMinimap = new URL(location.href).searchParams.get('minimap') ?? 'north-up';
  if (!isMinimapOrientation(requestedMinimap)) throw new Error(`Unknown map orientation: ${requestedMinimap}`);
  const readToggle = (name: string) => {
    const value = new URL(location.href).searchParams.get(name) ?? 'on';
    if (value !== 'on' && value !== 'off') throw new Error(`Invalid ${name} option: ${value}`);
    return value === 'on';
  };
  gameState.update({
    driveMode: requestedMode, cameraStyle: requestedCamera,
    minimapOrientation: requestedMinimap,
    cabinHeadMotion: readToggle('head-motion'),
    showCones: readToggle('cones'), showGrass: readToggle('grass'),
  });
  const settingsUrl = new URL(location.href);
  if (settingsUrl.searchParams.has('transmission')) {
    settingsUrl.searchParams.delete('transmission');
    history.replaceState(null, '', settingsUrl);
  }
  const courseUrl = new URL(location.href);
  const requestedCourse = courseUrl.searchParams.get('course');
  const requestedReverse = readCourseReverse(courseUrl.searchParams);
  const requestedWeights = requestedCourse === 'custom' ? readCourseWeights(courseUrl.searchParams)
    : gameState.getState().courseWeights;
  gameState.update({ courseWeights: requestedWeights, courseReverse: requestedReverse });
  let seed = 0;
  if (requestedCourse === 'random' || requestedCourse === 'custom') {
    const value = courseUrl.searchParams.get('seed');
    if (value !== null && !/^\d{1,10}$/.test(value)) throw new Error(`Invalid course seed: ${value}`);
    seed = value === null ? crypto.getRandomValues(new Uint32Array(1))[0] : Number(value);
    courseUrl.searchParams.set('seed', String(seed));
    if (requestedCourse === 'custom') writeCourseWeights(courseUrl.searchParams, requestedWeights);
    history.replaceState(null, '', courseUrl);
  }
  const definition = requestedCourse === 'custom' ? generateCustomCourse(seed, requestedWeights)
    : requestedCourse === 'random' ? generateCourse(seed)
    : requestedCourse ? courses.find((course) => course.id === requestedCourse) : courses[0];
  if (!definition) throw new Error(`Unknown course: ${requestedCourse}`);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  element('#app').append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D driving playground');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1500);
  camera.layers.enable(1);
  const lighting = createLighting(scene, renderer);
  const requestedTime = new URL(location.href).searchParams.get('time') ?? 'noon';
  if (!isTimeOfDay(requestedTime)) throw new Error(`Unknown time of day: ${requestedTime}`);
  gameState.update({ timeOfDay: requestedTime });
  lighting.apply(requestedTime);
  // The upstream Emscripten factory writes to `this`; ESM calls have no receiver.
  const [Ammo, car] = await Promise.all([AmmoFactory.call({}), loadCar()]);
  // The picker may change while the model is loading.
  const selectedTime = gameState.getState().timeOfDay;
  lighting.apply(selectedTime);
  car.setLighting(selectedTime !== 'noon', selectedTime === 'night');
  let appliedTime = selectedTime;
  gameState.subscribe(({ timeOfDay }) => {
    if (timeOfDay === appliedTime) return;
    appliedTime = timeOfDay;
    lighting.apply(timeOfDay);
    car.setLighting(timeOfDay !== 'noon', timeOfDay === 'night');
  });

  scene.add(car.chassis, ...car.wheels, ...car.hubs);
  const controls = new DrivingControls();
  const audio = new VehicleAudio((sound) => {
    gameState.update({ sound: { ...gameState.getState().sound, ...sound } });
  }, (error) => {
    console.error('Vehicle audio unavailable:', error);
    gameState.update({ sound: {
      ...gameState.getState().sound, error: error instanceof Error ? error.message : String(error),
    } });
  }, new URL(location.href).searchParams.get('sound') === 'off');
  let dialogOpen = false;
  gameState.subscribe((state) => {
    const open = state.helpOpen || state.tuningOpen || state.settingsOpen || state.customCourseOpen || state.courseMenuOpen;
    if (open === dialogOpen) return;
    dialogOpen = open;
    controls.clear();
  });
  const keys = controls.keys;
  const controlKeys = new Set(['ArrowLeft', 'ArrowRight', 'KeyX', 'KeyZ', 'Space', 'KeyR', 'KeyC', 'KeyD', 'KeyM', 'KeyW']);
  let accumulator = 0;
  let lastTime = 0;
  let changingCourse = false;
  const physicsResources = createPhysicsResources(Ammo);

  function createCourseSession(nextDefinition: CourseDefinition) {
    const course = createCourse(scene, nextDefinition);
    let physics: ReturnType<typeof createVehiclePhysics> | undefined;
    try {
      const spawn = courseSpawn(nextDefinition);
      const laps = new LapTimer(nextDefinition);
      physics = createVehiclePhysics({ Ammo, resources: physicsResources, car, course, spawn, controls, gameState, laps, audio });
      const drivingCamera = createDrivingCamera(camera, car, controls, nextDefinition, course.terrain);
      const { showCones, showGrass } = gameState.getState();
      physics.setConesEnabled(showCones);
      course.terrain.grass.visible = showGrass;
      physics.reset();
      drivingCamera.reset(spawn.heading);
      return { course, terrain: course.terrain, spawn, laps, physics, drivingCamera };
    } catch (error) {
      physics?.dispose();
      course.dispose();
      throw error;
    }
  }

  let activeDefinition = definition;
  let { course, terrain, spawn, laps, physics, drivingCamera } = createCourseSession({ ...definition, reverse: requestedReverse });
  const minimap = createMinimap(element('#minimap'), definition);
  const { fixedStep } = physics;
  gameState.subscribe(({ showCones, showGrass }) => {
    physics.setConesEnabled(showCones);
    terrain.grass.visible = showGrass;
  });
  const tireEffects = createTireEffects(scene, car, terrain, course.isAsphalt);
  const forward = new THREE.Vector3();

  function reset() {
    controls.clear();
    audio.reset();
    accumulator = 0;
    physics.reset();
    drivingCamera.reset(spawn.heading);
    tireEffects.reset();
  }

  async function loadCourse(build: () => CourseDefinition, updateUrl: (url: URL) => void, reverse: boolean) {
    changingCourse = true;
    controls.clear();
    audio.reset();
    gameState.update({ status: { visible: true, error: false, message: 'Building course…' } });
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const nextDefinition = build();
      const next = createCourseSession({ ...nextDefinition, reverse });
      minimap.setCourse(nextDefinition);
      const previousPhysics = physics;
      const previousCourse = course;
      ({ course, terrain, spawn, laps, physics, drivingCamera } = next);
      tireEffects.setCourse(terrain, course.isAsphalt);
      previousPhysics.dispose();
      previousCourse.dispose();
      const url = new URL(location.href);
      updateUrl(url);
      if (reverse) url.searchParams.set('reverse', '1');
      else url.searchParams.delete('reverse');
      history.replaceState(null, '', url);
      activeDefinition = nextDefinition;
      gameState.update({ courseReverse: reverse, status: { visible: false, error: false, message: '' } });
      return nextDefinition;
    } catch (error) {
      physics.captureVisuals(true);
      drivingCamera.reset(spawn.heading);
      throw error;
    } finally {
      accumulator = lastTime = 0;
      changingCourse = false;
    }
  }

  function changeCourse(id: string, seed?: number, weights?: CourseGenerationWeights) {
    const customWeights = weights ?? gameState.getState().courseWeights;
    return loadCourse(() => {
      const nextDefinition = id === 'custom' && seed !== undefined ? generateCustomCourse(seed, customWeights)
        : id === 'random' && seed !== undefined ? generateCourse(seed)
        : courses.find((course) => course.id === id);
      if (!nextDefinition) throw new Error(`Unknown course: ${id}`);
      return nextDefinition;
    }, (url) => {
      url.searchParams.set('course', id);
      if ((id === 'random' || id === 'custom') && seed !== undefined) url.searchParams.set('seed', String(seed));
      else url.searchParams.delete('seed');
      writeCourseWeights(url.searchParams, id === 'custom' ? customWeights : undefined);
    }, gameState.getState().courseReverse);
  }

  async function changeCourseDirection(reverse: boolean) {
    const directed = { ...activeDefinition, reverse };
    const nextSpawn = courseSpawn(directed);
    const nextLaps = new LapTimer(directed);
    const nextCamera = createDrivingCamera(camera, car, controls, directed, terrain);
    physics.setCourseDirection(nextSpawn, nextLaps);
    course.setDirection(reverse);
    spawn = nextSpawn;
    laps = nextLaps;
    drivingCamera = nextCamera;
    reset();
    lastTime = 0;
    const url = new URL(location.href);
    if (reverse) url.searchParams.set('reverse', '1');
    else url.searchParams.delete('reverse');
    history.replaceState(null, '', url);
    gameState.update({ courseReverse: reverse, status: { visible: false, error: false, message: '' } });
  }

  bindCoursePicker(courses, definition, changeCourse, changeCourseDirection, (error) => {
    console.error('Unable to change course:', error);
    gameState.update({ status: {
      visible: true, error: true,
      message: `Unable to change course: ${error instanceof Error ? error.message : String(error)}`,
    } });
  }, gameState);

  function cycleCamera() {
    const styles = ['corner', 'classic', 'cabin'] as const;
    const cameraStyle = styles[(styles.indexOf(gameState.getState().cameraStyle) + 1) % styles.length];
    gameState.update({ cameraStyle });
    const url = new URL(location.href);
    url.searchParams.set('camera', cameraStyle);
    history.replaceState(null, '', url);
  }

  function toggleDriveMode() {
    const driveMode = gameState.getState().driveMode === 'drift' ? 'grip' : 'drift';
    gameState.update({ driveMode });
    const url = new URL(location.href);
    url.searchParams.set('mode', driveMode);
    history.replaceState(null, '', url);
  }

  function cycleTimeOfDay() {
    const times = ['noon', 'sunset', 'night'] as const;
    const timeOfDay = times[(times.indexOf(gameState.getState().timeOfDay) + 1) % times.length];
    gameState.update({ timeOfDay });
    const url = new URL(location.href);
    url.searchParams.set('time', timeOfDay);
    history.replaceState(null, '', url);
  }

  window.addEventListener('keydown', (event) => {
    if (dialogOpen) return;
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
    if (!controlKeys.has(event.code)) return;
    if (event.target instanceof HTMLButtonElement && event.code === 'Space') return;
    event.preventDefault();
    if (event.code === 'KeyR') {
      if (!event.repeat) reset();
    } else if (event.code === 'KeyC') {
      if (!event.repeat) cycleCamera();
    } else if (event.code === 'KeyD') {
      if (!event.repeat) toggleDriveMode();
    } else if (event.code === 'KeyM') {
      if (!event.repeat) controls.mapView = !controls.mapView;
    } else if (event.code === 'KeyW') {
      if (!event.repeat) cycleTimeOfDay();
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
    physics.captureVisuals(true);
  });
  bindGameActions({ sound: (muted) => audio.setMuted(muted), clearInput: () => controls.clear() });
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

  function frame(time: number) {
    if (changingCourse) return;
    const { driveMode, profiles } = gameState.getState();
    controls.poll(!dialogOpen, profiles[driveMode].steeringExpo);
    if (controls.driveModeRequested) toggleDriveMode();
    if (controls.cameraRequested) cycleCamera();
    if (controls.timeOfDayRequested) cycleTimeOfDay();
    if (controls.resetRequested) reset();
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : fixedStep;
    lastTime = time;
    accumulator += dt;
    while (accumulator >= fixedStep) {
      physics.step();
      physics.captureVisuals();
      accumulator -= fixedStep;
    }
    const velocity = physics.interpolate(accumulator / fixedStep);
    const speed = velocity.length();
    const { engine, reversing, spawnBrakeHeld, wheelContacts, burnout } = physics;
    audio.update({ drivetrain: engine, tires: physics.tireSounds });
    const cameraState = gameState.getState();
    drivingCamera.update(dt, physics.linearVelocity, cameraState.driveMode, cameraState.cameraStyle, reversing, cameraState.cabinHeadMotion);
    lighting.update(car.chassis.position, controls.mapView ? camera.far : undefined);
    forward.set(0, 0, 1).applyQuaternion(car.chassis.quaternion);
    forward.y = 0;
    forward.normalize();
    minimap.update(car.chassis.position, forward, cameraState.minimapOrientation);
    // Manifold pressure: closed-throttle vacuum through to full turbo boost.
    const manifoldMmHg = THREE.MathUtils.lerp(-550, 0, engine.load) * (1 - engine.boost) + 650 * engine.boost;
    car.setGauges(Math.abs(forward.dot(velocity)) * 3.6, engine.rpm, manifoldMmHg, dt);
    car.setSteering(physics.steering);
    car.setDashLight('brake', controls.handbrake);
    car.setDashLight('abs', cameraState.driveMode === 'drift');
    const slip = speed > 3 ? 1 - Math.abs(forward.dot(velocity) / speed) : 0;
    const sliding = speed > 3 && (controls.handbrake || slip > 0.045);
    const burningOut = burnout > 0.1 && (wheelContacts[2] || wheelContacts[3]);
    tireEffects.update(dt, velocity, camera, wheelContacts, sliding, burningOut);
    gameState.update({
      controllerStatus: controls.controllerStatus,
      telemetry: {
        speed, rpm: engine.rpm, gear: engine.gear, limiter: engine.limiterCut,
        lap: laps.lap, current: laps.current, last: laps.last, best: laps.best,
        cones: laps.conesHit, lastCones: laps.lastCones,
        driving: spawnBrakeHeld ? 'brakes-held'
          : controls.handbrake ? 'handbrake'
          : physics.brakestand ? 'brakestand'
          : reversing ? 'reverse' : controls.brake > 0 ? 'braking'
          : burningOut ? 'burnout' : sliding ? 'sliding' : 'driving',
      },
    });
    if (!terrain.contains(car.chassis.position.x, car.chassis.position.z)
      || car.chassis.position.y < terrain.heightAt(car.chassis.position.x, car.chassis.position.z) - 5) reset();
    tireEffects.captureDepth(renderer, scene, camera);
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
