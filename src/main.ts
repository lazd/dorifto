import * as THREE from 'three';
import AmmoFactory from 'ammojs-typed';
import { loadCar } from './car';
import { DrivingControls, updateVehicleLights } from './controls';
import { createCourse } from './course';
import { courses, courseSpawn, generateCourse, readCourseReverse, type CourseDefinition } from './courses';
import { generateCustomCourse, readCourseWeights, writeCourseWeights, type CourseGenerationWeights } from './course-generation';
import { isDriveMode } from './drive-modes';
import { LapTimer, formatLapTime } from './laps';
import { VehicleAudio } from './audio';
import { CarStereo, isStereoStation, stereoStations } from './stereo';
import {
  createGameState, defaultTuningPresets, isCameraStyle, isGhostMode, isMinimapOrientation, isTimeOfDay,
  readMirrorResolution, type SavedRunOption,
} from './game-state';
import { loadTuningPresets } from './tuning-presets';
import { deleteSavedCourse, loadSavedCourses, saveCourse } from './saved-courses';
import { bindGameUI, bindGameActions, bindCoursePicker, bindLapRecorder, element } from './ui';
import { createDrivingCamera } from './camera';
import { createLighting } from './lighting';
import { createTireEffects } from './tire-effects';
import { createMinimap } from './minimap';
import { createPhysicsResources, createVehiclePhysics } from './vehicle-physics';
import { createConePhysics } from './cone-physics';
import { createTurnSignPhysics } from './turn-sign-physics';
import { readTurnSignMode } from './turn-sign';
import { createGhostCar } from './ghost-car';
import {
  RunRecording, applyCarPose, captureCarPose, createReplayFrame, deleteRun, listSavedRuns, loadRun,
  loadRecordLap, replayStorageKey, sampleSteps, saveRecordLap, saveRun, type RunSummary,
} from './lap-recording';
import './style.css';

const gameState = createGameState();
bindGameUI(gameState, showError);

async function start() {
  gameState.update({ tuningPresets: loadTuningPresets(localStorage, defaultTuningPresets()) });
  const requestedCamera = new URL(location.href).searchParams.get('camera') ?? 'corner';
  if (!isCameraStyle(requestedCamera)) throw new Error(`Unknown camera style: ${requestedCamera}`);
  const requestedMode = new URL(location.href).searchParams.get('mode') ?? 'drift';
  if (!isDriveMode(requestedMode)) throw new Error(`Unknown drive mode: ${requestedMode}`);
  const requestedStation = new URL(location.href).searchParams.get('station') ?? stereoStations[0].id;
  if (!isStereoStation(requestedStation)) throw new Error(`Unknown stereo station: ${requestedStation}`);
  gameState.update({ stereoStation: requestedStation });
  const requestedPresetId = new URL(location.href).searchParams.get('preset') ?? `${requestedMode}-default`;
  const matchedPreset = requestedPresetId === 'custom' ? null
    : gameState.getState().tuningPresets.find(({ id, mode }) =>
      id === requestedPresetId && mode === requestedMode);
  const requestedPreset = requestedPresetId !== 'custom' && !matchedPreset
    ? gameState.getState().tuningPresets.find(({ id }) => id === `${requestedMode}-default`)
    : matchedPreset;
  const resolvedPresetId = requestedPreset?.id ?? (requestedPresetId === 'custom' ? 'custom' : `${requestedMode}-default`);
  const selectedTuningPresets = {
    ...gameState.getState().selectedTuningPresets,
    [requestedMode]: requestedPreset?.id ?? null,
  };
  const profiles = requestedPreset
    ? { ...gameState.getState().profiles, [requestedMode]: { ...requestedPreset.tuning } }
    : gameState.getState().profiles;
  const requestedMinimap = new URL(location.href).searchParams.get('minimap') ?? gameState.getState().minimapOrientation;
  if (!isMinimapOrientation(requestedMinimap)) throw new Error(`Unknown map orientation: ${requestedMinimap}`);
  const readToggle = (name: string) => {
    const value = new URL(location.href).searchParams.get(name) ?? 'on';
    if (value !== 'on' && value !== 'off') throw new Error(`Invalid ${name} option: ${value}`);
    return value === 'on';
  };
  const coneMode = new URL(location.href).searchParams.get('cones') ?? gameState.getState().coneMode;
  if (coneMode !== 'all' && coneMode !== 'on' && coneMode !== 'corners' && coneMode !== 'off')
    throw new Error(`Invalid cones option: ${coneMode}`);
  const requestedConeMode = coneMode === 'on' ? 'all' : coneMode;
  const requestedGhost = new URL(location.href).searchParams.get('ghost') ?? 'fastest';
  if (!isGhostMode(requestedGhost)) throw new Error(`Invalid ghost option: ${requestedGhost}`);
  gameState.update({
    driveMode: requestedMode, profiles, selectedTuningPresets, cameraStyle: requestedCamera,
    minimapOrientation: requestedMinimap,
    cabinHeadMotion: readToggle('head-motion'),
    mirrorResolution: readMirrorResolution(new URL(location.href).searchParams),
    coneMode: requestedConeMode, showGrass: readToggle('grass'), ghostMode: requestedGhost,
    turnSignMode: readTurnSignMode(new URL(location.href).searchParams.get('signs')),
  });
  const presetUrl = new URL(location.href);
  if (presetUrl.searchParams.get('preset') !== resolvedPresetId) {
    presetUrl.searchParams.set('preset', resolvedPresetId);
    history.replaceState(null, '', presetUrl);
  }
  const settingsUrl = new URL(location.href);
  if (settingsUrl.searchParams.has('transmission')) {
    settingsUrl.searchParams.delete('transmission');
    history.replaceState(null, '', settingsUrl);
  }
  const courseUrl = new URL(location.href);
  const availableCourses = [...courses, ...loadSavedCourses(localStorage)];
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
    : requestedCourse ? availableCourses.find((course) => course.id === requestedCourse) : courses[0];
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
  let vehicleLights = {
    headlights: selectedTime !== 'noon', fogLights: false, headlightsAtPress: false,
  };
  let shownHeadlights = vehicleLights.headlights;
  car.setLighting(shownHeadlights, selectedTime === 'night');
  let appliedTime = selectedTime;
  gameState.subscribe(({ timeOfDay, mirrorResolution }) => {
    car.setMirrorResolution(mirrorResolution);
    if (timeOfDay === appliedTime) return;
    appliedTime = timeOfDay;
    lighting.apply(timeOfDay);
    vehicleLights = {
      headlights: timeOfDay !== 'noon', fogLights: false, headlightsAtPress: false,
    };
    shownHeadlights = vehicleLights.headlights;
    car.setLighting(shownHeadlights, timeOfDay === 'night');
  });

  scene.add(car.chassis, ...car.wheels, ...car.hubs);
  const ghost = createGhostCar(scene, car);
  const controls = new DrivingControls();
  const audio = new VehicleAudio((sound) => {
    gameState.update({ sound: { ...gameState.getState().sound, ...sound } });
  }, (error) => {
    console.error('Vehicle audio unavailable:', error);
    gameState.update({ sound: {
      ...gameState.getState().sound, error: error instanceof Error ? error.message : String(error),
    } });
  }, new URL(location.href).searchParams.get('sound') === 'off');
  const stereo = new CarStereo((powered) => {
    car.setStereo(powered);
    const { status } = gameState.getState();
    if (powered && status.error && status.message.startsWith('Stereo unavailable:')) {
      gameState.update({ status: { visible: false, error: false, message: '' } });
    }
  }, (error) => {
    console.error('Stereo unavailable:', error);
    gameState.update({ status: {
      visible: true, error: true,
      message: `Stereo unavailable: ${error instanceof Error ? error.message : String(error)} Press S to retry.`,
    } });
  }, gameState.getState().sound.muted);
  gameState.subscribe(({ stereoStation }) => {
    stereo.setStation(stereoStation);
    car.setStereoStation(stereoStation);
  });
  if (new URL(location.href).searchParams.has('station')) stereo.turnOn();
  let dialogOpen = false;
  gameState.subscribe((state) => {
    const open = state.helpOpen || state.tuningOpen || state.settingsOpen || state.customCourseOpen
      || state.coursePickerOpen || state.courseMenuOpen;
    if (open === dialogOpen) return;
    dialogOpen = open;
    controls.clear();
  });
  const keys = controls.keys;
  const controlKeys = new Set(['ArrowLeft', 'ArrowRight', 'KeyX', 'KeyZ', 'Space', 'KeyR', 'KeyC', 'KeyD', 'KeyM', 'KeyW', 'KeyS', 'KeyF', 'KeyH']);
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
      physics = createVehiclePhysics({ Ammo, resources: physicsResources, car, course, spawn, controls, gameState, laps });
      const conePhysics = physics.addPlugin((context) => createConePhysics(context, { course, audio }));
      const drivingCamera = createDrivingCamera(camera, car, controls, nextDefinition, course.terrain);
      const { coneMode, showGrass, turnSignMode } = gameState.getState();
      conePhysics.setEnabled(coneMode !== 'off', coneMode === 'corners');
      course.setTurnSignMode(turnSignMode);
      physics.addPlugin((context) => createTurnSignPhysics(context, course.turnSignGroups, audio));
      course.terrain.grass.visible = showGrass;
      physics.reset();
      drivingCamera.reset(spawn.heading);
      return { course, terrain: course.terrain, spawn, laps, physics, conePhysics, drivingCamera };
    } catch (error) {
      physics?.dispose();
      course.dispose();
      throw error;
    }
  }

  let activeDefinition = definition;
  let { course, terrain, spawn, laps, physics, conePhysics, drivingCamera } = createCourseSession({ ...definition, reverse: requestedReverse });
  const minimap = createMinimap(element('#minimap'), definition);
  const { fixedStep } = physics;
  gameState.subscribe(({ coneMode, showGrass, turnSignMode }) => {
    conePhysics.setEnabled(coneMode !== 'off', coneMode === 'corners');
    course.setTurnSignMode(turnSignMode);
    terrain.grass.visible = showGrass;
  });
  const tireEffects = createTireEffects(scene, car, terrain, course.isAsphalt);
  const forward = new THREE.Vector3();
  const ghostForward = new THREE.Vector3();
  const minimapGhost = { position: ghost.chassis.position, forward: ghostForward };

  // Lap recording: a run is captured from launch, shown once it crosses the start/finish line, and discarded by any reset.
  let run: RunRecording | null = null;
  let runOrigin = 0;
  let runSteps = 0;
  let replay: { recording: RunRecording; time: number } | null = null;
  let storageKey = replayStorageKey({ ...definition, reverse: requestedReverse });
  let savedRuns: RunSummary[] = [];
  let runOptions: readonly SavedRunOption[] = [];
  let selectedRun: string | null = null;
  let recordLap: RunRecording | null = null;
  let recordLoad = 0;
  const recordFrame = createReplayFrame();
  const playbackFrame = createReplayFrame();
  const ghostFrame = createReplayFrame();
  const replayBefore = createReplayFrame();
  const replayAfter = createReplayFrame();
  const replayVelocity = new THREE.Vector3();
  const replayFlatVelocity = new THREE.Vector3();
  const replayEngine = { rpm: 0, gear: 1, throttle: 0, load: 0, boost: 0, shifting: false, limiterCut: false };

  function syncLapRecorder() {
    const mode = replay ? 'replay' : run?.started ? 'recording' : savedRuns.length ? 'ready' : 'off';
    const replayLap = replay ? replay.recording.replayLapAt(replay.time) : null;
    const current = gameState.getState().lapRecorder;
    if (current.mode === mode && current.runs === runOptions && current.selectedRun === selectedRun
      && current.replayLap?.lap === replayLap?.lap) return;
    gameState.update({ lapRecorder: { mode, runs: runOptions, selectedRun, replayLap } });
  }

  function runLabel({ createdAt, laps: times }: RunSummary) {
    const date = new Date(createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const count = `${times.length} lap${times.length === 1 ? '' : 's'}`;
    return times.length ? `${date} · ${count} · best ${formatLapTime(Math.min(...times))}` : `${date} · partial lap`;
  }

  function refreshSavedRuns() {
    try {
      savedRuns = listSavedRuns(storageKey);
    } catch (error) {
      console.error('Unable to read saved laps:', error);
      savedRuns = [];
    }
    if (!savedRuns.some((saved) => saved.id === selectedRun)) selectedRun = savedRuns.at(-1)?.id ?? null;
    runOptions = savedRuns.map((saved) => ({ id: saved.id, label: runLabel(saved) })).reverse();
    syncLapRecorder();
  }

  function reportLapError(message: string, error: unknown) {
    console.error(message, error);
    const status = { visible: true, error: true, message: `${message} ${error instanceof Error ? error.message : String(error)}` };
    gameState.update({ status });
    setTimeout(() => {
      if (gameState.getState().status === status) gameState.update({ status: { visible: false, error: false, message: '' } });
    }, 5000);
  }

  function keepRecord(lap: RunRecording) {
    if (recordLap && recordLap.lapTimes[0] <= lap.lapTimes[0]) return;
    recordLap = lap;
    void saveRecordLap(storageKey, lap).catch((error) => reportLapError('Unable to save record lap:', error));
  }

  async function refreshRecordLap() {
    const key = storageKey;
    const generation = ++recordLoad;
    recordLap = null;
    try {
      let loaded = await loadRecordLap(key);
      const bestSaved = savedRuns.reduce<RunSummary | null>((best, saved) => {
        if (!saved.laps.length) return best;
        return !best || Math.min(...saved.laps) < Math.min(...best.laps) ? saved : best;
      }, null);
      if (bestSaved && (!loaded || Math.min(...bestSaved.laps) < loaded.lapTimes[0])) {
        const saved = await loadRun(key, bestSaved.id);
        const index = saved.bestLap;
        if (index !== null) {
          loaded = saved.extractLap(index);
          await saveRecordLap(key, loaded);
        }
      }
      if (generation === recordLoad && key === storageKey && loaded) keepRecord(loaded);
    } catch (error) {
      reportLapError('Unable to load record lap:', error);
    }
  }

  function keepRunRecord() {
    const index = run?.bestLap;
    if (run && index !== null && index !== undefined
      && (!recordLap || run.lapTimes[index] < recordLap.lapTimes[0]))
      keepRecord(run.extractLap(index));
  }

  function clearLapRecording() {
    keepRunRecord();
    run = null;
    replay = null;
    ghost.visible = false;
    syncLapRecorder();
  }

  function reset() {
    controls.clear();
    audio.reset();
    accumulator = 0;
    physics.reset();
    drivingCamera.reset(spawn.heading);
    tireEffects.reset();
    clearLapRecording();
  }

  function startReplay(recording: RunRecording, time = 0) {
    reset();
    replay = { recording, time };
    recording.read(time, playbackFrame);
    applyCarPose(playbackFrame, car.chassis, car.wheels, car.hubs);
    forward.set(0, 0, 1).applyQuaternion(playbackFrame.quaternion);
    drivingCamera.reset(Math.atan2(forward.x, forward.z));
    syncLapRecorder();
  }

  function stopRecording(finished: RunRecording) {
    const key = storageKey;
    startReplay(finished);
    saveRun(key, finished).then((saved) => {
      if (key !== storageKey) return;
      selectedRun = saved.id;
      refreshSavedRuns();
    }, (error) => reportLapError('Unable to save laps:', error));
  }

  async function playSavedRun(id: string) {
    const key = storageKey;
    try {
      const recording = await loadRun(key, id);
      if (key === storageKey && !run?.started && !replay && !changingCourse) startReplay(recording);
    } catch (error) {
      reportLapError('Unable to load saved laps:', error);
    }
  }

  function pressLapRecorder() {
    if (changingCourse) return;
    if (replay) reset();
    else if (run?.started) stopRecording(run);
    else if (selectedRun) void playSavedRun(selectedRun);
  }

  function seekReplayLap(direction: 'previous' | 'next') {
    if (!replay || changingCourse) return;
    const time = replay.recording.replayLapAt(replay.time)[direction];
    if (time !== null) startReplay(replay.recording, time);
  }

  function recordStep() {
    if (!run) {
      if (physics.spawnBrakeHeld) return;
      runOrigin = laps.elapsedTime;
      run = new RunRecording();
      runSteps = 0;
    }
    if (!run.started && laps.lap) {
      run.lapStarts.push(laps.lapStartedAt - runOrigin);
      syncLapRecorder();
    }
    if (run.lapStarts.length < laps.lap && laps.last !== null)
      run.completeLap(laps.lapStartedAt - runOrigin, laps.last, laps.lastCones ?? 0);
    if (runSteps++ % sampleSteps) return;
    captureCarPose(recordFrame, car.chassis, car.hubs, physics.tireAngles);
    const { engine, wheelContacts } = physics;
    Object.assign(recordFrame, {
      rpm: engine.rpm, gear: engine.gear, throttle: engine.throttle, load: engine.load, boost: engine.boost,
      shifting: engine.shifting, limiterCut: engine.limiterCut, steering: physics.steering,
      braking: physics.spawnBrakeHeld || (!physics.reversing && controls.brake > 0),
      reversing: physics.reversing, handbrake: controls.handbrake,
      highBeams: controls.highBeams,
      headlights: vehicleLights.headlights,
      fogLights: vehicleLights.fogLights,
      leftSignal: controls.leftSignal, rightSignal: controls.rightSignal,
      burnout: physics.burnout > 0.1 && (wheelContacts[2] || wheelContacts[3]),
    });
    wheelContacts.forEach((contact, i) => { recordFrame.contacts[i] = contact; });
    physics.tireSounds.forEach((tire, i) => Object.assign(recordFrame.tires[i], tire));
    run.push(recordFrame);
    keepRunRecord();
  }

  function updateGhost(alpha: number) {
    const mode = gameState.getState().ghostMode;
    const source = mode === 'record' ? recordLap : run;
    const index = mode === 'record' ? laps.lap > 0 && recordLap ? 0 : null
      : !run || mode === 'off' || laps.lap < 2 ? null
      : mode === 'fastest' ? run.bestLap : run.lapTimes.length - 1;
    // laps.current matches the newest physics state; the drawn car lags it by the interpolation remainder.
    const lapTime = Math.max(laps.current - (1 - alpha) * fixedStep, 0);
    if (source === null || index === null || index < 0 || lapTime > source.lapTimes[index]) {
      ghost.visible = false;
      return;
    }
    source.read(source.lapStarts[index] + lapTime, ghostFrame);
    applyCarPose(ghostFrame, ghost.chassis, ghost.wheels);
    ghost.fadeNear(car.chassis.position, gameState.getState().cameraStyle === 'cabin');
    ghost.visible = true;
  }

  /**
   * Steps the world along the replay so cones and signs fly again, poses the car, and returns its
   * velocity, or null once the replay has finished.
   */
  function updateReplay(dt: number) {
    if (!replay) return null;
    const { recording } = replay;
    if (replay.time >= recording.duration) {
      reset();
      return null;
    }
    accumulator += dt;
    while (accumulator >= fixedStep) {
      recording.read(replay.time, replayBefore);
      replay.time += fixedStep;
      recording.read(replay.time, replayAfter);
      physics.stepReplay(replayBefore, replayAfter, fixedStep);
      physics.captureReplayVisuals();
      accumulator -= fixedStep;
    }
    const alpha = accumulator / fixedStep;
    physics.interpolateReplay(alpha);
    // Draw the car at the same moment as the interpolated cones and signs.
    const shownTime = Math.max(replay.time - (1 - alpha) * fixedStep, 0);
    recording.read(shownTime, playbackFrame);
    applyCarPose(playbackFrame, car.chassis, car.wheels, car.hubs);
    const h = recording.interval / 2;
    recording.read(shownTime - h, replayBefore);
    recording.read(shownTime + h, replayAfter);
    replayVelocity.subVectors(replayAfter.position, replayBefore.position).divideScalar(2 * h);
    Object.assign(replayEngine, {
      rpm: playbackFrame.rpm, gear: playbackFrame.gear, throttle: playbackFrame.throttle, load: playbackFrame.load,
      boost: playbackFrame.boost, shifting: playbackFrame.shifting, limiterCut: playbackFrame.limiterCut,
    });
    car.setBraking(playbackFrame.braking);
    car.setReversing(playbackFrame.reversing);
    syncLapRecorder();
    return replayVelocity;
  }

  async function loadCourse(build: () => CourseDefinition, updateUrl: (url: URL) => void, reverse: boolean) {
    changingCourse = true;
    controls.clear();
    audio.reset();
    clearLapRecording();
    gameState.update({ status: { visible: true, error: false, message: 'Building course…' } });
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const nextDefinition = build();
      const next = createCourseSession({ ...nextDefinition, reverse });
      minimap.setCourse(nextDefinition);
      const previousPhysics = physics;
      const previousCourse = course;
      ({ course, terrain, spawn, laps, physics, conePhysics, drivingCamera } = next);
      tireEffects.setCourse(terrain, course.isAsphalt);
      previousPhysics.dispose();
      previousCourse.dispose();
      const url = new URL(location.href);
      updateUrl(url);
      if (reverse) url.searchParams.set('reverse', '1');
      else url.searchParams.delete('reverse');
      history.replaceState(null, '', url);
      activeDefinition = nextDefinition;
      storageKey = replayStorageKey({ ...nextDefinition, reverse });
      refreshSavedRuns();
      gameState.update({ courseReverse: reverse, status: { visible: false, error: false, message: '' } });
      await refreshRecordLap();
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
        : availableCourses.find((course) => course.id === id);
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
    storageKey = replayStorageKey(directed);
    refreshSavedRuns();
    const url = new URL(location.href);
    if (reverse) url.searchParams.set('reverse', '1');
    else url.searchParams.delete('reverse');
    history.replaceState(null, '', url);
    gameState.update({ courseReverse: reverse, status: { visible: false, error: false, message: '' } });
    await refreshRecordLap();
  }

  bindCoursePicker(availableCourses, definition, changeCourse, changeCourseDirection, (error) => {
    console.error('Unable to change course:', error);
    gameState.update({ status: {
      visible: true, error: true,
      message: `Unable to change course: ${error instanceof Error ? error.message : String(error)}`,
    } });
  }, gameState, (name) => {
    const saved = saveCourse(localStorage, activeDefinition, name);
    availableCourses.push(saved);
    activeDefinition = saved;
    minimap.setCourse(saved);
    storageKey = replayStorageKey({ ...saved, reverse: gameState.getState().courseReverse });
    ++recordLoad;
    if (recordLap)
      void saveRecordLap(storageKey, recordLap).catch((error) => reportLapError('Unable to save record lap:', error));
    refreshSavedRuns();
    const url = new URL(location.href);
    url.searchParams.set('course', saved.id);
    url.searchParams.delete('seed');
    writeCourseWeights(url.searchParams);
    history.replaceState(null, '', url);
    return saved;
  }, async (id) => {
    if (!loadSavedCourses(localStorage).some((course) => course.id === id))
      throw new Error('Only saved courses can be deleted');
    const fallback = await changeCourse(courses[0].id);
    try {
      deleteSavedCourse(localStorage, id);
    } catch (error) {
      await changeCourse(id);
      throw error;
    }
    availableCourses.splice(availableCourses.findIndex((course) => course.id === id), 1);
    return fallback;
  });

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

  function pressStereo(direction: 'previous' | 'next' = 'next') {
    const stereoStation = stereo.press(direction);
    gameState.update({ stereoStation });
    const url = new URL(location.href);
    if (stereo.isPowered) url.searchParams.set('station', stereoStation);
    else url.searchParams.delete('station');
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
    } else if (event.code === 'KeyS') {
      if (!event.repeat) pressStereo();
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
  bindGameActions({
    sound: (muted) => {
      audio.setMuted(muted);
      stereo.setMuted(muted);
    },
    clearInput: () => controls.clear(),
  });
  bindLapRecorder(gameState, {
    press: pressLapRecorder,
    seek(time) {
      if (replay && !changingCourse) startReplay(replay.recording, time);
    },
    select(id) {
      selectedRun = id;
      syncLapRecorder();
    },
    remove(id) {
      try {
        deleteRun(storageKey, id);
      } catch (error) {
        reportLapError('Unable to delete saved laps:', error);
      }
      refreshSavedRuns();
    },
  });
  refreshSavedRuns();
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
    if (controls.lightingRequested && !replay) {
      vehicleLights = updateVehicleLights(vehicleLights, controls.lightingRequested);
    }
    if (controls.driveModeRequested) toggleDriveMode();
    if (controls.cameraRequested) cycleCamera();
    if (controls.timeOfDayRequested) cycleTimeOfDay();
    if (controls.resetRequested) reset();
    if (controls.recordRequested) pressLapRecorder();
    if (controls.previousLapRequested) {
      if (replay) seekReplayLap('previous');
      else pressStereo('previous');
    }
    if (controls.nextLapRequested) {
      if (replay) seekReplayLap('next');
      else pressStereo('next');
    }
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : fixedStep;
    lastTime = time;
    const replayVelocity3d = updateReplay(dt);
    const replaying = replayVelocity3d !== null;
    const frameHeadlights = replaying
      ? playbackFrame.headlights ?? vehicleLights.headlights : vehicleLights.headlights;
    if (shownHeadlights !== frameHeadlights) {
      shownHeadlights = frameHeadlights;
      car.setLighting(frameHeadlights, appliedTime === 'night');
    }
    let velocity: THREE.Vector3;
    if (replayVelocity3d) {
      velocity = replayFlatVelocity.copy(replayVelocity3d).setY(0);
    } else {
      accumulator += dt;
      while (accumulator >= fixedStep) {
        physics.step();
        physics.captureVisuals();
        recordStep();
        accumulator -= fixedStep;
      }
      velocity = physics.interpolate(accumulator / fixedStep);
      updateGhost(accumulator / fixedStep);
    }
    const speed = velocity.length();
    const engine = replaying ? replayEngine : physics.engine;
    const reversing = replaying ? playbackFrame.reversing : physics.reversing;
    const wheelContacts = replaying ? playbackFrame.contacts : physics.wheelContacts;
    const handbrake = replaying ? playbackFrame.handbrake : controls.handbrake;
    car.setHighBeams(replaying ? playbackFrame.highBeams : controls.highBeams);
    car.setFogLights(replaying ? playbackFrame.fogLights : vehicleLights.fogLights);
    car.setTurnSignals(
      replaying ? playbackFrame.leftSignal : controls.leftSignal,
      replaying ? playbackFrame.rightSignal : controls.rightSignal,
    );
    const spawnBrakeHeld = !replaying && physics.spawnBrakeHeld;
    audio.update({ drivetrain: engine, tires: replaying ? playbackFrame.tires : physics.tireSounds });
    const cameraState = gameState.getState();
    drivingCamera.update(dt, replayVelocity3d ?? physics.linearVelocity, cameraState.driveMode, cameraState.cameraStyle, reversing, cameraState.cabinHeadMotion);
    lighting.update(car.chassis.position, controls.mapView ? camera.far : undefined);
    forward.set(0, 0, 1).applyQuaternion(car.chassis.quaternion);
    forward.y = 0;
    forward.normalize();
    ghostForward.set(0, 0, 1).applyQuaternion(ghost.chassis.quaternion);
    minimap.update(car.chassis.position, forward, cameraState.minimapOrientation, ghost.visible ? minimapGhost : null);
    // Manifold pressure: closed-throttle vacuum through to full turbo boost.
    const manifoldMmHg = THREE.MathUtils.lerp(-550, 0, engine.load) * (1 - engine.boost) + 650 * engine.boost;
    car.setGauges(Math.abs(forward.dot(velocity)) * 3.6, engine.rpm, manifoldMmHg, dt);
    car.updateClock(new Date());
    car.setSteering(replaying ? playbackFrame.steering : physics.steering);
    car.setDashLight('brake', handbrake);
    car.setDashLight('abs', cameraState.driveMode === 'drift');
    const slip = speed > 3 ? 1 - Math.abs(forward.dot(velocity) / speed) : 0;
    const sliding = speed > 3 && (handbrake || slip > 0.045);
    const burningOut = replaying ? playbackFrame.burnout
      : physics.burnout > 0.1 && (wheelContacts[2] || wheelContacts[3]);
    tireEffects.update(dt, velocity, camera, wheelContacts, sliding, burningOut);
    const timing = replay ? replay.recording.timingAt(replay.time)
      : { lap: laps.lap, current: laps.current, last: laps.last, best: laps.best, lastCones: laps.lastCones };
    const braking = replaying ? playbackFrame.braking && !reversing : controls.brake > 0;
    gameState.update({
      controllerStatus: controls.controllerStatus,
      telemetry: {
        speed, rpm: engine.rpm, gear: engine.gear, limiter: engine.limiterCut,
        ...timing, cones: replaying ? 0 : laps.conesHit,
        driving: spawnBrakeHeld ? 'brakes-held'
          : handbrake ? 'handbrake'
          : !replaying && physics.brakestand ? 'brakestand'
          : reversing ? 'reverse' : braking ? 'braking'
          : burningOut ? 'burnout' : sliding ? 'sliding' : 'driving',
      },
    });
    if (!replaying && (!terrain.contains(car.chassis.position.x, car.chassis.position.z)
      || car.chassis.position.y < terrain.heightAt(car.chassis.position.x, car.chassis.position.z) - 5)) reset();
    tireEffects.captureDepth(renderer, scene, camera);
    renderer.render(scene, camera);
  }

  reset();
  gameState.update({ status: { visible: false, error: false, message: '' } });
  await refreshRecordLap();
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
