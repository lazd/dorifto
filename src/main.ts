import * as THREE from 'three';
import { carLightLayers, loadCar } from './car';
import { DrivingControls, updateVehicleLights } from './controls';
import { inputBindings, keyboardActionForCode } from './input-bindings';
import { createCourse } from './course';
import {
  courses,
  courseSpawn,
  generateCourse,
  readCourseReverse,
  type CourseDefinition,
} from './courses';
import {
  courseGenerationFields,
  defaultCourseWeights,
  generateCustomCourse,
  readCourseWeights,
  writeCourseWeights,
  type CourseGenerationWeights,
} from './course-generation';
import { isDriveMode } from './drive-modes';
import { formatLapTime } from './laps';
import { VehicleAudio } from './audio';
import { CarStereo, isStereoStationSelection } from './stereo';
import {
  createConfigurationState,
  defaultTuningPresets,
  isCameraStyle,
  isGhostMode,
  isLapGateMode,
  isMinimapOrientation,
  isTimeOfDay,
  readMirrorResolution,
  type ConfigurationState,
} from './configuration-state';
import { createGameState, type SavedRunOption } from './game-state';
import { loadTuningPresets } from './tuning-presets';
import {
  deleteSavedCourse,
  loadSavedCourses,
  renameSavedCourse,
  saveCourse,
} from './saved-courses';
import { bindGameUI, bindGameActions, bindCoursePicker, bindLapRecorder, element } from './ui';
import { createDrivingCamera } from './camera';
import { createLighting } from './lighting';
import { createTireEffects } from './tire-effects';
import { createMinimap } from './minimap';
import { createLeaderboard } from './leaderboard';
import { createPhysicsClient } from './physics-client';
import {
  raceBotDriverName,
  botDriveMode,
  botTuning,
  readBotsOnly,
  readRaceBots,
  writeRaceBots,
  type RaceBotOptions,
} from './race-bot';
import type { PhysicsRecord } from './physics-messages';
import { readTurnSignMode } from './turn-sign';
import { createGhostCar } from './ghost-car';
import {
  RunRecording,
  applyCarPose,
  createReplayFrame,
  deleteCourseRecords,
  deleteRun,
  describeRun,
  listSavedRuns,
  loadRun,
  loadRecordLap,
  replayStorageKey,
  saveRecordLap,
  saveRun,
  type RunSummary,
} from './lap-recording';
import './style.css';
import './dialogs.css';

// Imported styles have been applied, so the page can be revealed without unstyled content.
document.body.hidden = false;
const gameState = createGameState();
const configurationState = createConfigurationState();
const ui = bindGameUI(configurationState, gameState, (error) => showError(error, false));

async function start() {
  configurationState.update({
    tuningPresets: loadTuningPresets(localStorage, defaultTuningPresets()),
  });
  // Invalid URL parameters are not fatal: drop them and use the default.
  const readParams = <Value>(
    names: string[],
    read: (params: URLSearchParams) => Value,
    fallback: Value,
  ): Value => {
    try {
      return read(new URL(location.href).searchParams);
    } catch (error) {
      console.warn(`Ignoring invalid URL option ${names.join(', ')}:`, error);
      const url = new URL(location.href);
      for (const name of names) url.searchParams.delete(name);
      history.replaceState(null, '', url);
      return fallback;
    }
  };
  const readOption = <Value extends string>(
    name: string,
    fallback: Value,
    valid: (value: string) => value is Value,
  ): Value =>
    readParams(
      [name],
      (params) => {
        const value = params.get(name);
        if (value === null) return fallback;
        if (!valid(value)) throw new Error(`Invalid ${name} option: ${value}`);
        return value;
      },
      fallback,
    );
  const requestedHudLevel = readParams(
    ['hide-ui'],
    (params) => {
      const value = params.get('hide-ui');
      if (value === null) return 0;
      if (!/^[0-4]$/.test(value)) throw new Error(`Invalid hide-ui option: ${value}`);
      return Number(value);
    },
    0,
  );
  ui.setHudVisibility(requestedHudLevel);
  const requestedCamera = readOption(
    'camera',
    configurationState.getState().cameraStyle,
    isCameraStyle,
  );
  const requestedMode = readOption('mode', configurationState.getState().driveMode, isDriveMode);
  const requestedStation = readOption('station', 'off', isStereoStationSelection);
  configurationState.update({ stereoStation: requestedStation });
  const requestedPresetId =
    new URL(location.href).searchParams.get('preset') ?? `${requestedMode}-default`;
  const matchedPreset =
    requestedPresetId === 'custom'
      ? null
      : configurationState
          .getState()
          .tuningPresets.find(({ id, mode }) => id === requestedPresetId && mode === requestedMode);
  const requestedPreset =
    requestedPresetId !== 'custom' && !matchedPreset
      ? configurationState
          .getState()
          .tuningPresets.find(({ id }) => id === `${requestedMode}-default`)
      : matchedPreset;
  const resolvedPresetId =
    requestedPreset?.id ?? (requestedPresetId === 'custom' ? 'custom' : `${requestedMode}-default`);
  const selectedTuningPresets = {
    ...configurationState.getState().selectedTuningPresets,
    [requestedMode]: requestedPreset?.id ?? null,
  };
  const profiles = requestedPreset
    ? { ...configurationState.getState().profiles, [requestedMode]: { ...requestedPreset.tuning } }
    : configurationState.getState().profiles;
  const requestedMinimap = readOption(
    'minimap',
    configurationState.getState().minimapOrientation,
    isMinimapOrientation,
  );
  const readToggle = (name: string) =>
    readOption(name, 'on', (value): value is 'on' | 'off' => value === 'on' || value === 'off') ===
    'on';
  const coneMode = readOption(
    'cones',
    configurationState.getState().coneMode,
    (value): value is ConfigurationState['coneMode'] | 'on' =>
      value === 'all' || value === 'on' || value === 'corners' || value === 'off',
  );
  const requestedConeMode = coneMode === 'on' ? 'all' : coneMode;
  const requestedGhost = readOption('ghost', 'fastest', isGhostMode);
  configurationState.update({
    driveMode: requestedMode,
    profiles,
    selectedTuningPresets,
    cameraStyle: requestedCamera,
    minimapOrientation: requestedMinimap,
    cabinHeadMotion: readToggle('head-motion'),
    mirrorResolution: readParams(
      ['mirror-resolution', 'low-res-mirrors'],
      readMirrorResolution,
      'low',
    ),
    coneMode: requestedConeMode,
    showGrass: readToggle('grass'),
    lapGateMode: readOption('lap-gates', 'off', isLapGateMode),
    ghostMode: requestedGhost,
    turnSignMode: readParams(
      ['signs'],
      (params) => readTurnSignMode(params.get('signs')),
      'several',
    ),
    muted: !readToggle('sound'),
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
  let botsOnly = readBotsOnly(courseUrl.searchParams);
  let botOptions = readRaceBots(courseUrl.searchParams);
  // Recordings follow the primary car: the player, or the first bot in bots-only mode.
  const botRunLaps = 3;
  const recordedDriverFor = (bots: RaceBotOptions[], only: boolean) => {
    const recordedBot = only ? bots[0] : null;
    return recordedBot
      ? {
          driver: raceBotDriverName(recordedBot),
          botTuning: { ...botTuning(recordedBot.preset) },
        }
      : { driver: 'human' };
  };
  let recordedBot = botsOnly ? botOptions[0] : null;
  let recordedDriver = recordedDriverFor(botOptions, botsOnly);
  if (botsOnly)
    configurationState.update({
      driveMode: botDriveMode(botOptions[0]?.preset),
      ...(!courseUrl.searchParams.has('camera') ? { cameraStyle: 'fpv' as const } : {}),
    });
  const availableCourses = [...courses, ...loadSavedCourses(localStorage)];
  const courseId = courseUrl.searchParams.get('course');
  const requestedCourse =
    courseId === null ||
    courseId === 'random' ||
    courseId === 'custom' ||
    availableCourses.some((course) => course.id === courseId)
      ? courseId
      : null;
  if (requestedCourse !== courseId) {
    console.warn(`Ignoring unknown course: ${courseId}`);
    courseUrl.searchParams.delete('course');
    history.replaceState(null, '', courseUrl);
  }
  const requestedReverse = readParams(['reverse'], readCourseReverse, false);
  const requestedWeights =
    requestedCourse === 'custom'
      ? readParams(
          ['hairpins', ...courseGenerationFields.map(({ key }) => key)],
          readCourseWeights,
          { ...defaultCourseWeights },
        )
      : ui.getCourseWeights();
  ui.setCourseWeights(requestedWeights);
  configurationState.update({ courseReverse: requestedReverse });
  let seed = 0;
  if (requestedCourse === 'random' || requestedCourse === 'custom') {
    let value = courseUrl.searchParams.get('seed');
    if (value !== null && !/^\d{1,10}$/.test(value)) value = null;
    seed = value === null ? crypto.getRandomValues(new Uint32Array(1))[0] : Number(value);
    courseUrl.searchParams.set('seed', String(seed));
    if (requestedCourse === 'custom') writeCourseWeights(courseUrl.searchParams, requestedWeights);
    history.replaceState(null, '', courseUrl);
  }
  const definition =
    requestedCourse === 'custom'
      ? generateCustomCourse(seed, requestedWeights)
      : requestedCourse === 'random'
        ? generateCourse(seed)
        : availableCourses.find((course) => course.id === (requestedCourse ?? 'hillside'));
  if (!definition) throw new Error(`Unknown course: ${requestedCourse}`);
  // Download the car while the sky, lighting, and course are built.
  const carLoad = loadCar((fraction) => showLoading('Loading models…', 0.2 * fraction));
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.visibility = 'hidden';
  element('#app').append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D driving playground');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 3000);
  camera.layers.enable(1);
  const lighting = createLighting(scene, renderer, camera);
  const requestedTime = readOption('time', configurationState.getState().timeOfDay, isTimeOfDay);
  configurationState.update({ timeOfDay: requestedTime });
  lighting.apply(requestedTime);
  const initialDefinition = { ...definition, reverse: requestedReverse };
  const car = await carLoad;
  const initialCourse = createCourse(scene, initialDefinition, car.width);
  showLoading('Starting physics…', 0.2);
  // The picker may change while the model is loading.
  const selectedTime = configurationState.getState().timeOfDay;
  lighting.apply(selectedTime);
  let vehicleLights = {
    headlights: selectedTime !== 'noon',
    fogLights: false,
    headlightsAtPress: false,
  };
  let headlightsOverridden = false;
  let shownHeadlights = vehicleLights.headlights;
  car.setLighting(shownHeadlights, selectedTime);
  let appliedTime = selectedTime;
  configurationState.subscribe(
    ({ cameraStyle, mirrorResolution }) => {
      car.setMirrors(cameraStyle, mirrorResolution);
    },
    ['cameraStyle', 'mirrorResolution'],
  );
  configurationState.subscribe(
    ({ timeOfDay }) => {
      if (timeOfDay === appliedTime) return;
      appliedTime = timeOfDay;
      lighting.apply(timeOfDay);
      vehicleLights = {
        headlights: timeOfDay !== 'noon',
        fogLights: false,
        headlightsAtPress: false,
      };
      headlightsOverridden = false;
      shownHeadlights = vehicleLights.headlights;
      car.setLighting(shownHeadlights, timeOfDay);
    },
    ['timeOfDay'],
  );

  scene.add(car.chassis, ...car.wheels, ...car.hubs, car.underglow);
  const ghost = createGhostCar(scene, car);
  const controls = new DrivingControls();
  const audio = new VehicleAudio(
    ({ muted, ...sound }) => {
      if (configurationState.getState().muted !== muted) configurationState.update({ muted });
      const previous = gameState.getState().sound;
      if (previous.running !== sound.running || previous.failed !== sound.failed) {
        gameState.update({ sound: { ...previous, ...sound } });
      }
    },
    (error) => {
      console.error('Vehicle audio unavailable:', error);
      gameState.update({
        sound: {
          ...gameState.getState().sound,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    },
    configurationState.getState().muted,
  );
  const stereo = new CarStereo(
    (powered) => {
      car.setStereo(powered);
      const { status } = gameState.getState();
      if (powered && status.error && status.message.startsWith('Stereo unavailable:')) {
        gameState.update({ status: { visible: false, error: false, message: '' } });
      }
    },
    (error) => {
      console.error('Stereo unavailable:', error);
      gameState.update({
        status: {
          visible: true,
          error: true,
          message: `Stereo unavailable: ${error instanceof Error ? error.message : String(error)} Press S to retry.`,
        },
      });
    },
    configurationState.getState().muted,
  );
  configurationState.subscribe(
    ({ stereoStation }) => {
      if (stereoStation === 'off') {
        stereo.turnOff();
        return;
      }
      stereo.setStation(stereoStation);
      car.setStereoStation(stereoStation);
      stereo.turnOn();
    },
    ['stereoStation'],
  );
  configurationState.subscribe(
    ({ muted }) => {
      audio.setMuted(muted);
      stereo.setMuted(muted);
    },
    ['muted'],
  );
  let dialogOpen = false;
  const keys = controls.keys;
  let lastTime = 0;
  let changingCourse = false;

  async function createCourseSession(
    nextDefinition: CourseDefinition,
    existingCourse?: ReturnType<typeof createCourse>,
    nextBots: RaceBotOptions[] = botOptions,
    nextBotsOnly = botsOnly,
  ) {
    const ownsCourse = existingCourse === undefined;
    const course = existingCourse ?? createCourse(scene, nextDefinition, car.width);
    let physics: ReturnType<typeof createPhysicsClient> | undefined;
    try {
      const spawn = courseSpawn(nextDefinition);
      const { coneMode, showGrass, lapGateMode, turnSignMode } = configurationState.getState();
      course.setTurnSignMode(turnSignMode);
      course.setLapGates(lapGateMode);
      course.terrain.grass.visible = showGrass;
      physics = createPhysicsClient({
        bots: nextBots,
        botsOnly: nextBotsOnly,
        observedBot: nextBotsOnly
          ? readParams(
              ['observed-bot'],
              (params) => {
                const value = params.get('observed-bot');
                if (value === null) return 0;
                if (!/^\d+$/.test(value) || Number(value) >= nextBots.length)
                  throw new Error(`Invalid observed-bot option: ${value}`);
                return Number(value);
              },
              0,
            )
          : 0,
        car,
        course,
        definition: nextDefinition,
        controls,
        configurationState,
        audio,
        lights: () => ({
          headlights: headlightsOverridden ? vehicleLights.headlights : null,
          fogLights: vehicleLights.fogLights,
          highBeams: controls.highBeams,
          leftSignal: controls.leftSignal,
          rightSignal: controls.rightSignal,
        }),
        onError(error) {
          audio.silence();
          renderer.setAnimationLoop(null);
          showError(error);
        },
      });
      physics.setCones(coneMode !== 'off', coneMode === 'corners');
      await physics.ready;
      const latest = configurationState.getState();
      physics.setCones(latest.coneMode !== 'off', latest.coneMode === 'corners');
      course.setTurnSignMode(latest.turnSignMode);
      course.setLapGates(latest.lapGateMode);
      course.terrain.grass.visible = latest.showGrass;
      const laps = physics.laps;
      const drivingCamera = createDrivingCamera(
        camera,
        car,
        controls,
        nextDefinition,
        course.terrain,
      );
      drivingCamera.reset(spawn.heading);
      lighting.setupMaterials();
      return { course, terrain: course.terrain, spawn, laps, physics, drivingCamera };
    } catch (error) {
      physics?.dispose(!botsOnly);
      if (ownsCourse) course.dispose();
      throw error;
    }
  }

  let activeDefinition = definition;
  let { course, terrain, spawn, laps, physics, drivingCamera } = await createCourseSession(
    initialDefinition,
    initialCourse,
  );
  const groundHeight = (x: number, z: number) => terrain.heightAt(x, z);
  const minimap = createMinimap(element('#minimap'), definition);
  const leaderboard = createLeaderboard(element<HTMLOListElement>('#leaderboard'), (index) => {
    if (physics.observeBot(index)) syncObservedBot();
  });
  const { fixedStep } = physics;
  configurationState.subscribe(
    ({ coneMode }) => {
      physics.setCones(coneMode !== 'off', coneMode === 'corners');
    },
    ['coneMode'],
  );
  configurationState.subscribe(
    ({ turnSignMode }) => {
      course.setTurnSignMode(turnSignMode);
    },
    ['turnSignMode'],
  );
  configurationState.subscribe(
    ({ showGrass }) => {
      terrain.grass.visible = showGrass;
    },
    ['showGrass'],
  );
  configurationState.subscribe(
    ({ lapGateMode }) => {
      course.setLapGates(lapGateMode);
    },
    ['lapGateMode'],
  );
  const tireEffects = createTireEffects(scene, car, terrain, course.isAsphalt);
  lighting.setupMaterials();
  const forward = new THREE.Vector3();
  const ghostForward = new THREE.Vector3();
  const minimapGhost = { position: ghost.chassis.position, forward: ghostForward };

  // Lap recording: a run is captured from launch, shown once it crosses the start/finish line, and discarded by any reset.
  let run: RunRecording | null = null;
  let cameraNeedsReset = false;
  let runOrigin = 0;
  let replay: { recording: RunRecording; time: number } | null = null;
  let storageKey = replayStorageKey({ ...definition, reverse: requestedReverse });
  let savedRuns: RunSummary[] = [];
  let runOptions: readonly SavedRunOption[] = [];
  let selectedRun: string | null = null;
  let recordLap: RunRecording | null = null;
  let recordLoad = 0;
  const playbackFrame = createReplayFrame();
  const ghostFrame = createReplayFrame();
  const replayBefore = createReplayFrame();
  const replayAfter = createReplayFrame();
  const replayVelocity = new THREE.Vector3();
  const replayFlatVelocity = new THREE.Vector3();
  const replayEngine = {
    rpm: 0,
    gear: 1,
    throttle: 0,
    load: 0,
    boost: 0,
    shifting: false,
    limiterCut: false,
  };

  function syncLapRecorder() {
    const mode = replay
      ? 'replay'
      : run?.started
        ? 'recording'
        : savedRuns.length
          ? 'ready'
          : 'off';
    const replayLap = replay ? replay.recording.replayLapAt(replay.time) : null;
    const current = gameState.getState().lapRecorder;
    if (
      current.mode === mode &&
      current.runs === runOptions &&
      current.selectedRun === selectedRun &&
      current.replayLap?.lap === replayLap?.lap
    )
      return;
    gameState.update({ lapRecorder: { mode, runs: runOptions, selectedRun, replayLap } });
  }

  function runLabel(run: RunSummary) {
    const { laps: times, driver } = run;
    const { date, laps: count } = describeRun(run);
    const label = times.length
      ? `${date} · ${count} · best ${formatLapTime(Math.min(...times))}`
      : `${date} · partial lap`;
    return driver?.startsWith('bot') ? `🤖 ${label} · ${driver}` : `🧑🏽‍🔧 ${label}`;
  }

  function refreshSavedRuns() {
    try {
      savedRuns = listSavedRuns(storageKey);
    } catch (error) {
      console.error('Unable to read saved laps:', error);
      savedRuns = [];
    }
    if (!savedRuns.some((saved) => saved.id === selectedRun))
      selectedRun = savedRuns.at(-1)?.id ?? null;
    runOptions = savedRuns.map((saved) => ({ id: saved.id, label: runLabel(saved) })).reverse();
    syncLapRecorder();
  }

  function reportLapError(message: string, error: unknown) {
    console.error(message, error);
    const status = {
      visible: true,
      error: true,
      message: `${message} ${error instanceof Error ? error.message : String(error)}`,
    };
    gameState.update({ status });
    setTimeout(() => {
      if (gameState.getState().status === status)
        gameState.update({ status: { visible: false, error: false, message: '' } });
    }, 5000);
  }

  function keepRecord(lap: RunRecording) {
    if (recordLap && recordLap.lapTimes[0] <= lap.lapTimes[0]) return;
    recordLap = lap;
    void saveRecordLap(storageKey, lap).catch((error) =>
      reportLapError('Unable to save record lap:', error),
    );
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
    if (
      run &&
      index !== null &&
      index !== undefined &&
      (!recordLap || run.lapTimes[index] < recordLap.lapTimes[0])
    )
      keepRecord(run.extractLap(index));
  }

  function clearLapRecording() {
    keepRunRecord();
    run = null;
    replay = null;
    ghost.visible = false;
    syncLapRecorder();
  }

  async function applyBotSettings(nextBots: RaceBotOptions[], nextBotsOnly: boolean) {
    if (changingCourse) throw new Error('Wait for the current course change to finish');
    changingCourse = true;
    controls.clear();
    audio.reset();
    clearLapRecording();
    gameState.update({ status: { visible: true, error: false, message: 'Resetting race…' } });
    const previousSettings = configurationState.getState();
    try {
      const url = new URL(location.href);
      const nextMode = readOption('mode', requestedMode, isDriveMode);
      const nextCamera = readOption('camera', requestedCamera, isCameraStyle);
      configurationState.update({
        driveMode: nextBotsOnly ? botDriveMode(nextBots[0]?.preset) : nextMode,
        cameraStyle: nextBotsOnly && !url.searchParams.has('camera') ? 'fpv' : nextCamera,
      });
      const next = await createCourseSession(activeDefinition, course, nextBots, nextBotsOnly);
      const previousPhysics = physics;
      ({ course, terrain, spawn, laps, physics, drivingCamera } = next);
      previousPhysics.dispose(botsOnly && !nextBotsOnly);
      botsOnly = nextBotsOnly;
      botOptions = nextBots;
      recordedBot = botsOnly ? botOptions[0] : null;
      recordedDriver = recordedDriverFor(botOptions, botsOnly);
      const botsUrl = new URL(location.href);
      writeRaceBots(botsUrl.searchParams, botOptions, botsOnly);
      history.replaceState(null, '', botsUrl);
      cameraNeedsReset = true;
      gameState.update({ status: { visible: false, error: false, message: '' } });
    } catch (error) {
      configurationState.update({
        driveMode: previousSettings.driveMode,
        cameraStyle: previousSettings.cameraStyle,
      });
      physics.captureVisuals(true);
      throw error;
    } finally {
      lastTime = 0;
      changingCourse = false;
    }
  }

  ui.setBotSettingsHandler(applyBotSettings);

  function reset() {
    controls.clear();
    audio.reset();
    physics.reset();
    cameraNeedsReset = true;
    tireEffects.reset();
    clearLapRecording();
  }

  function startReplay(recording: RunRecording, time = 0) {
    reset();
    replay = { recording, time };
    physics.startReplay(recording, time);
    recording.read(time, playbackFrame);
    applyCarPose(playbackFrame, car.chassis, car.wheels, car.hubs);
    cameraNeedsReset = false;
    forward.set(0, 0, 1).applyQuaternion(playbackFrame.quaternion);
    drivingCamera.reset(Math.atan2(forward.x, forward.z));
    syncLapRecorder();
  }

  function stopRecording(finished: RunRecording) {
    startReplay(finished);
    storeRun(finished);
  }

  function storeRun(finished: RunRecording) {
    const key = storageKey;
    saveRun(key, finished, recordedDriver).then(
      (saved) => {
        if (key !== storageKey) return;
        selectedRun = saved.id;
        refreshSavedRuns();
      },
      (error) => reportLapError('Unable to save laps:', error),
    );
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

  function recordStep({ laps: timing, sample }: PhysicsRecord) {
    if (!run) {
      runOrigin = timing.elapsedTime;
      run = new RunRecording();
    }
    if (timing.finished && run.lapTimes.length) return;
    if (!run.started && timing.lap) {
      run.lapStarts.push(timing.lapStartedAt - runOrigin);
      syncLapRecorder();
    }
    if (
      (run.lapStarts.length < timing.lap || (timing.finished && !run.lapTimes.length)) &&
      timing.last !== null
    )
      run.completeLap(timing.lapStartedAt - runOrigin, timing.last, timing.lastCones ?? 0);
    else if (
      !timing.finished &&
      run.started &&
      run.lapStarts[run.lapStarts.length - 1] !== timing.lapStartedAt - runOrigin
    )
      run.lapStarts[run.lapStarts.length - 1] = timing.lapStartedAt - runOrigin;
    // Bots save each three-lap run and start over, so unattended sessions log repeatable runs.
    if (recordedBot && run.lapTimes.length >= botRunLaps) {
      const finished = run;
      reset();
      storeRun(finished);
      return;
    }
    if (!sample) return;
    run.pushSample(sample);
    keepRunRecord();
  }

  function updateGhost(alpha: number) {
    if (botsOnly) {
      ghost.visible = false;
      return;
    }
    const mode = configurationState.getState().ghostMode;
    const source = mode === 'record' ? recordLap : run;
    const index =
      mode === 'record'
        ? laps.lap > 0 && recordLap
          ? 0
          : null
        : !run || mode === 'off' || laps.lap < 2
          ? null
          : mode === 'fastest'
            ? run.bestLap
            : run.lapTimes.length - 1;
    // laps.current matches the newest physics state; the drawn car lags it by the interpolation remainder.
    const lapTime = Math.max(laps.current - (1 - alpha) * fixedStep, 0);
    if (source === null || index === null || index < 0 || lapTime > source.lapTimes[index]) {
      ghost.visible = false;
      return;
    }
    source.read(source.lapStarts[index] + lapTime, ghostFrame);
    applyCarPose(ghostFrame, ghost.chassis, ghost.wheels);
    ghost.fadeNear(car.chassis.position, configurationState.getState().cameraStyle === 'cabin');
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
    physics.advance(dt);
    replay.time = physics.replayTime ?? replay.time;
    const alpha = physics.interpolationAlpha();
    physics.interpolateReplay();
    // Draw the car at the same moment as the interpolated cones and signs.
    const shownTime = Math.max(replay.time - (1 - alpha) * fixedStep, 0);
    recording.read(shownTime, playbackFrame);
    applyCarPose(playbackFrame, car.chassis, car.wheels, car.hubs);
    const h = recording.interval / 2;
    recording.read(shownTime - h, replayBefore);
    recording.read(shownTime + h, replayAfter);
    replayVelocity.subVectors(replayAfter.position, replayBefore.position).divideScalar(2 * h);
    Object.assign(replayEngine, {
      rpm: playbackFrame.rpm,
      gear: playbackFrame.gear,
      throttle: playbackFrame.throttle,
      load: playbackFrame.load,
      boost: playbackFrame.boost,
      shifting: playbackFrame.shifting,
      limiterCut: playbackFrame.limiterCut,
    });
    car.setBraking(playbackFrame.braking);
    car.setReversing(playbackFrame.reversing);
    syncLapRecorder();
    return replayVelocity;
  }

  async function loadCourse(
    build: () => CourseDefinition,
    updateUrl: (url: URL) => void,
    reverse: boolean,
  ) {
    changingCourse = true;
    controls.clear();
    audio.reset();
    clearLapRecording();
    gameState.update({ status: { visible: true, error: false, message: 'Building course…' } });
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const nextDefinition = build();
      const next = await createCourseSession({ ...nextDefinition, reverse });
      minimap.setCourse(nextDefinition);
      const previousPhysics = physics;
      const previousCourse = course;
      ({ course, terrain, spawn, laps, physics, drivingCamera } = next);
      tireEffects.setCourse(terrain, course.isAsphalt);
      previousPhysics.dispose(false);
      previousCourse.dispose();
      const url = new URL(location.href);
      updateUrl(url);
      if (reverse) url.searchParams.set('reverse', '1');
      else url.searchParams.delete('reverse');
      history.replaceState(null, '', url);
      activeDefinition = nextDefinition;
      storageKey = replayStorageKey({ ...nextDefinition, reverse });
      refreshSavedRuns();
      configurationState.update({ courseReverse: reverse });
      gameState.update({ status: { visible: false, error: false, message: '' } });
      await refreshRecordLap();
      return nextDefinition;
    } catch (error) {
      physics.captureVisuals(true);
      drivingCamera.reset(spawn.heading);
      throw error;
    } finally {
      lastTime = 0;
      changingCourse = false;
    }
  }

  function changeCourse(
    id: string,
    seed?: number,
    weights?: CourseGenerationWeights,
    reverse = configurationState.getState().courseReverse,
  ) {
    const customWeights = weights ?? ui.getCourseWeights();
    return loadCourse(
      () => {
        const nextDefinition =
          id === 'custom' && seed !== undefined
            ? generateCustomCourse(seed, customWeights)
            : id === 'random' && seed !== undefined
              ? generateCourse(seed)
              : availableCourses.find((course) => course.id === id);
        if (!nextDefinition) throw new Error(`Unknown course: ${id}`);
        return nextDefinition;
      },
      (url) => {
        url.searchParams.set('course', id);
        if ((id === 'random' || id === 'custom') && seed !== undefined)
          url.searchParams.set('seed', String(seed));
        else url.searchParams.delete('seed');
        writeCourseWeights(url.searchParams, id === 'custom' ? customWeights : undefined);
      },
      reverse,
    );
  }

  async function changeCourseDirection(reverse: boolean) {
    const directed = { ...activeDefinition, reverse };
    const nextSpawn = courseSpawn(directed);
    const nextCamera = createDrivingCamera(camera, car, controls, directed, terrain);
    course.setDirection(reverse);
    spawn = nextSpawn;
    drivingCamera = nextCamera;
    reset();
    physics.setCourseDirection(nextSpawn, directed);
    lastTime = 0;
    storageKey = replayStorageKey(directed);
    refreshSavedRuns();
    const url = new URL(location.href);
    if (reverse) url.searchParams.set('reverse', '1');
    else url.searchParams.delete('reverse');
    history.replaceState(null, '', url);
    configurationState.update({ courseReverse: reverse });
    gameState.update({ status: { visible: false, error: false, message: '' } });
    await refreshRecordLap();
  }

  async function playCourseRun(runId: string) {
    if (changingCourse) throw new Error('Wait for the current course change to finish');
    const recording = await loadRun(storageKey, runId);
    selectedRun = runId;
    startReplay(recording);
  }

  bindCoursePicker(availableCourses, definition, configurationState, {
    changeCourse,
    changeDirection: changeCourseDirection,
    reportError: (error) => {
      console.error('Unable to change course:', error);
      gameState.update({
        status: {
          visible: true,
          error: true,
          message: `Unable to change course: ${error instanceof Error ? error.message : String(error)}`,
        },
      });
    },
    saveCourse: (name, definition = activeDefinition) => {
      const saved = saveCourse(localStorage, definition, name);
      availableCourses.push(saved);
      if (definition !== activeDefinition) return saved;
      activeDefinition = saved;
      minimap.setCourse(saved);
      storageKey = replayStorageKey({
        ...saved,
        reverse: configurationState.getState().courseReverse,
      });
      ++recordLoad;
      if (recordLap)
        void saveRecordLap(storageKey, recordLap).catch((error) =>
          reportLapError('Unable to save record lap:', error),
        );
      refreshSavedRuns();
      const url = new URL(location.href);
      url.searchParams.set('course', saved.id);
      url.searchParams.delete('seed');
      writeCourseWeights(url.searchParams);
      history.replaceState(null, '', url);
      return saved;
    },
    // Records are keyed by the stable saved ID, so renaming keeps them.
    renameCourse: (id, name) => {
      const renamed = renameSavedCourse(localStorage, id, name);
      availableCourses[availableCourses.findIndex((course) => course.id === id)] = renamed;
      if (activeDefinition.id === id) {
        activeDefinition = renamed;
        minimap.setCourse(renamed);
      }
      return renamed;
    },
    deleteCourse: async (id) => {
      const savedCourse = loadSavedCourses(localStorage).find((course) => course.id === id);
      if (!savedCourse) throw new Error('Only saved courses can be deleted');
      if (changingCourse) throw new Error('Wait for the current course change to finish');
      const active = activeDefinition.id === id;
      const fallback = active ? await changeCourse(courses[0].id) : activeDefinition;
      try {
        deleteSavedCourse(localStorage, id);
      } catch (error) {
        if (active) await changeCourse(id);
        throw error;
      }
      availableCourses.splice(
        availableCourses.findIndex((course) => course.id === id),
        1,
      );
      try {
        deleteCourseRecords(savedCourse);
      } catch (error) {
        reportLapError('Unable to delete course records:', error);
      }
      return fallback;
    },
    playRun: playCourseRun,
    deleteReplay: (course, reverse, id) => {
      const key = replayStorageKey({ ...course, reverse });
      deleteRun(key, id);
      if (key === storageKey) refreshSavedRuns();
    },
    getCourseWeights: ui.getCourseWeights,
  });

  function cycleCamera() {
    const styles = ['fpv', 'classic', 'cabin'] as const;
    const cameraStyle =
      styles[(styles.indexOf(configurationState.getState().cameraStyle) + 1) % styles.length];
    configurationState.update({ cameraStyle });
    const url = new URL(location.href);
    url.searchParams.set('camera', cameraStyle);
    history.replaceState(null, '', url);
  }

  function toggleDriveMode() {
    const driveMode = configurationState.getState().driveMode === 'drift' ? 'grip' : 'drift';
    configurationState.update({ driveMode });
    const url = new URL(location.href);
    url.searchParams.set('mode', driveMode);
    history.replaceState(null, '', url);
  }

  function cycleTimeOfDay() {
    const times = ['noon', 'sunset', 'night'] as const;
    const timeOfDay =
      times[(times.indexOf(configurationState.getState().timeOfDay) + 1) % times.length];
    configurationState.update({ timeOfDay });
    const url = new URL(location.href);
    url.searchParams.set('time', timeOfDay);
    history.replaceState(null, '', url);
  }

  function pressStereo(direction: 'previous' | 'next' = 'next') {
    const station = stereo.press(direction);
    const stereoStation = stereo.isPowered ? station : 'off';
    configurationState.update({ stereoStation });
    const url = new URL(location.href);
    if (stereo.isPowered) url.searchParams.set('station', station);
    else url.searchParams.delete('station');
    history.replaceState(null, '', url);
  }

  function syncObservedBot() {
    const url = new URL(location.href);
    url.searchParams.set('observed-bot', String(physics.observedBot));
    history.replaceState(null, '', url);
    forward.set(0, 0, 1).applyQuaternion(car.chassis.quaternion);
    drivingCamera.reset(Math.atan2(forward.x, forward.z));
    tireEffects.reset();
    audio.reset();
  }

  window.addEventListener('keydown', (event) => {
    if (inputBindings.isCaptureActive()) return;
    if (dialogOpen) return;
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement)
      return;
    const action = keyboardActionForCode(event.code);
    const cycleObservedBot =
      botsOnly && event.code === 'Tab' && !(event.target instanceof HTMLButtonElement);
    if (!action && !cycleObservedBot) return;
    if (event.target instanceof HTMLButtonElement && event.code === 'Space') return;
    event.preventDefault();
    if (action === 'reset') {
      if (!event.repeat) reset();
    } else if (action === 'camera') {
      if (!event.repeat) cycleCamera();
    } else if (cycleObservedBot) {
      if (!event.repeat && physics.cycleObservedBot()) {
        syncObservedBot();
      }
    } else if (action === 'driveMode') {
      if (!event.repeat) toggleDriveMode();
    } else if (action === 'map') {
      if (!event.repeat) controls.mapView = !controls.mapView;
    } else if (action === 'timeOfDay') {
      if (!event.repeat) cycleTimeOfDay();
    } else if (action === 'stereo') {
      if (!event.repeat) pressStereo();
    } else if (action === 'hud') {
      if (!event.repeat) {
        const level = ui.cycleHudVisibility();
        const url = new URL(location.href);
        url.searchParams.set('hide-ui', String(level));
        history.replaceState(null, '', url);
      }
    } else keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    if (inputBindings.isCaptureActive()) {
      keys.clear();
      return;
    }
    if (event.target instanceof HTMLInputElement) {
      keys.delete(event.code);
      return;
    }
    if (event.target instanceof HTMLSelectElement) return;
    if (keys.has(event.code) || keyboardActionForCode(event.code)) {
      event.preventDefault();
      keys.delete(event.code);
    }
  });
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => {
    keys.clear();
    lastTime = 0;
    physics.captureVisuals(true);
  });
  bindGameActions({
    sound: (muted) => {
      configurationState.update({ muted });
    },
    clearInput: () => controls.clear(),
    setUIOpen(open) {
      if (open === dialogOpen) return;
      dialogOpen = open;
      controls.clear();
    },
  });
  bindLapRecorder(gameState, {
    press: pressLapRecorder,
    seek(time) {
      if (replay && !changingCourse) startReplay(replay.recording, time);
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
    gameState.update({
      status: {
        visible: true,
        error: true,
        fatal: true,
        message: 'Graphics context lost. Reload the page to restart.',
      },
    });
  });

  function frame(time: number) {
    if (changingCourse) return;
    const { driveMode, profiles } = configurationState.getState();
    controls.poll(!dialogOpen, profiles[driveMode].steeringExpo, ui.dismissError);
    if (controls.lightingRequested && !replay) {
      vehicleLights = updateVehicleLights(vehicleLights, controls.lightingRequested);
      headlightsOverridden = true;
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
    for (const record of physics.takeRecords()) {
      // Records already taken belong to the run a bot reset just ended.
      if (physics.resetting) break;
      recordStep(record);
    }
    if (cameraNeedsReset && !physics.resetting) {
      physics.interpolate(1);
      drivingCamera.reset(spawn.heading);
      cameraNeedsReset = false;
    }
    const replayVelocity3d = updateReplay(dt);
    const replaying = replayVelocity3d !== null;
    const frameHeadlights = replaying
      ? (playbackFrame.headlights ?? appliedTime !== 'noon')
      : vehicleLights.headlights;
    if (shownHeadlights !== frameHeadlights) {
      shownHeadlights = frameHeadlights;
      car.setLighting(frameHeadlights, appliedTime);
    }
    let velocity: THREE.Vector3;
    if (replayVelocity3d) {
      velocity = replayFlatVelocity.copy(replayVelocity3d).setY(0);
    } else {
      physics.advance(dt);
      const alpha = physics.interpolationAlpha();
      velocity = physics.interpolate(alpha);
      updateGhost(alpha);
    }
    const speed = velocity.length();
    const engine = replaying ? replayEngine : physics.engine;
    const reversing = replaying ? playbackFrame.reversing : physics.reversing;
    const wheelContacts = replaying ? playbackFrame.contacts : physics.wheelContacts;
    const handbrake = replaying ? playbackFrame.handbrake : !botsOnly && controls.handbrake;
    car.setHighBeams(replaying ? playbackFrame.highBeams : controls.highBeams);
    car.setFogLights(replaying ? playbackFrame.fogLights : vehicleLights.fogLights);
    car.setTurnSignals(
      replaying ? playbackFrame.leftSignal : controls.leftSignal,
      replaying ? playbackFrame.rightSignal : controls.rightSignal,
    );
    const spawnBrakeHeld = !replaying && physics.spawnBrakeHeld;
    const cameraState = configurationState.getState();
    drivingCamera.update(
      dt,
      replayVelocity3d ?? physics.linearVelocity,
      botsOnly ? botDriveMode(recordedBot?.preset) : cameraState.driveMode,
      cameraState.cameraStyle,
      reversing,
      cameraState.cabinHeadMotion,
    );
    lighting.update(controls.mapView ? camera.far : undefined);
    forward.set(0, 0, 1).applyQuaternion(car.chassis.quaternion);
    forward.y = 0;
    forward.normalize();
    ghostForward.set(0, 0, 1).applyQuaternion(ghost.chassis.quaternion);
    minimap.update(
      car.chassis.position,
      forward,
      cameraState.minimapOrientation,
      ghost.visible ? minimapGhost : null,
      replaying ? [] : physics.botMarkers,
      !botsOnly || replaying,
    );
    leaderboard.update(
      physics.standings,
      physics.raceEntrants,
      botsOnly ? physics.observedBot : null,
    );
    // Manifold pressure: closed-throttle vacuum through to full turbo boost.
    const manifoldMmHg =
      THREE.MathUtils.lerp(-550, 0, engine.load) * (1 - engine.boost) + 650 * engine.boost;
    car.setGauges(Math.abs(forward.dot(velocity)) * 3.6, engine.rpm, manifoldMmHg, dt);
    car.updateClock(new Date());
    car.updateUnderglow(groundHeight);
    car.setSteering(replaying ? playbackFrame.steering : physics.steering);
    car.setDashLight('brake', handbrake);
    car.setDashLight('abs', cameraState.driveMode === 'drift');
    const slip = speed > 3 ? 1 - Math.abs(forward.dot(velocity) / speed) : 0;
    const sliding = speed > 3 && (handbrake || slip > 0.045);
    const burningOut = replaying
      ? playbackFrame.burnout
      : physics.burnout > 0.1 && (wheelContacts[2] || wheelContacts[3]);
    const backfire = tireEffects.update(
      dt,
      velocity,
      camera,
      wheelContacts,
      sliding,
      burningOut,
      replaying ? undefined : engine,
    );
    audio.update({
      drivetrain: engine,
      tires: replaying ? playbackFrame.tires : physics.tireSounds,
      ...backfire,
    });
    physics.updateBotEffects(dt, camera, frameHeadlights, appliedTime, !replaying);
    audio.updateOpponents(physics.botSounds);
    const timing = replay
      ? replay.recording.timingAt(replay.time)
      : {
          lap: laps.lap,
          finished: laps.finished,
          current: laps.current,
          last: laps.last,
          best: laps.best,
          lastCones: laps.lastCones,
        };
    const braking = replaying
      ? playbackFrame.braking && !reversing
      : botsOnly
        ? physics.braking
        : controls.brake > 0;
    gameState.update({
      controllerStatus: controls.controllerStatus,
      telemetry: {
        speed,
        rpm: engine.rpm,
        gear: engine.gear,
        limiter: engine.limiterCut,
        ...timing,
        finished: !replaying && laps.finished,
        invalid: !replaying && laps.invalid,
        cones: replaying ? 0 : laps.conesHit,
        driving: spawnBrakeHeld
          ? 'brakes-held'
          : handbrake
            ? 'handbrake'
            : !replaying && physics.brakestand
              ? 'brakestand'
              : reversing
                ? 'reverse'
                : braking
                  ? 'braking'
                  : burningOut
                    ? 'burnout'
                    : sliding
                      ? 'sliding'
                      : 'driving',
      },
    });
    if (
      !replaying &&
      (!terrain.contains(car.chassis.position.x, car.chassis.position.z) ||
        car.chassis.position.y <
          terrain.heightAt(car.chassis.position.x, car.chassis.position.z) - 5)
    )
      reset();
    const sceneDepth = tireEffects.captureDepth(
      renderer,
      scene,
      camera,
      ghost.visible || physics.botSmokeActive,
    );
    physics.captureBotDepth(renderer, scene, camera, sceneDepth);
    renderer.render(scene, camera);
    ghost.renderGlow(renderer, camera, sceneDepth);
  }

  reset();
  showLoading('Loading your record lap…', 0.4);
  await refreshRecordLap();
  const warmupCamera = camera.clone();
  warmupCamera.position.copy(car.chassis.position).add(new THREE.Vector3(5, 3, 6));
  warmupCamera.lookAt(car.chassis.position);
  const mirrorWarmupCamera = warmupCamera.clone();
  mirrorWarmupCamera.layers.enable(carLightLayers.interior);
  drivingCamera.getCabinEye(mirrorWarmupCamera.position);
  mirrorWarmupCamera.lookAt(
    mirrorWarmupCamera.position
      .clone()
      .add(new THREE.Vector3(0, 0, 1).applyQuaternion(car.chassis.quaternion)),
  );
  const previousTarget = renderer.getRenderTarget();
  ghost.chassis.position.copy(car.chassis.position);
  ghost.chassis.quaternion.copy(car.chassis.quaternion);
  ghost.wheels.forEach((wheel, i) => {
    wheel.position.copy(car.wheels[i].position);
    wheel.quaternion.copy(car.wheels[i].quaternion);
  });
  function restoreLighting() {
    const { cameraStyle, mirrorResolution } = configurationState.getState();
    car.setMirrors(cameraStyle, mirrorResolution);
    lighting.apply(appliedTime);
    car.setHighBeams(controls.highBeams);
    car.setFogLights(vehicleLights.fogLights);
    car.setBraking(physics.spawnBrakeHeld);
    car.setReversing(physics.reversing);
    car.setLighting(shownHeadlights, appliedTime);
    physics.setBotLighting(shownHeadlights, appliedTime);
    car.setStereo(stereo.isPowered);
    car.setDashLight('abs', configurationState.getState().driveMode === 'drift');
  }
  try {
    // Offscreen targets use different output and tone-mapping shaders than the game canvas.
    renderer.setRenderTarget(null);
    ghost.visible = true;
    car.setDashLight('abs', true);
    // Every light stays registered at zero intensity when off, so each view has one light layout.
    // Lamps are switched on here so their unlit glow meshes compile too.
    car.setLighting(true, appliedTime);
    physics.setBotLighting(true, appliedTime);
    car.setHighBeams(true);
    car.setFogLights(true);
    car.setBraking(true);
    const { mirrorResolution } = configurationState.getState();
    const warmMirrorResolution = mirrorResolution === 'off' ? 'low' : mirrorResolution;
    // The sky shader only re-keys for the current lights when the background changes, so other
    // times of day compile on first switch.
    const sky = scene.background;
    const placeholderSky = new THREE.DataTexture(new Uint8Array(4 * 4 * 2), 4, 2);
    placeholderSky.mapping = THREE.EquirectangularReflectionMapping;
    placeholderSky.colorSpace = THREE.SRGBColorSpace;
    placeholderSky.needsUpdate = true;
    for (const [index, interior] of [false, true].entries()) {
      showLoading('Compiling shaders…', 0.45 + 0.2 * index);
      car.setMirrors(interior ? 'cabin' : 'fpv', warmMirrorResolution);
      const view = interior ? mirrorWarmupCamera : warmupCamera;
      scene.background = index % 2 ? placeholderSky : sky;
      await renderer.compileAsync(scene, view);
      // Rendering allocates the shadow maps and render targets the lights sample.
      renderer.render(scene, view);
    }
    scene.background = sky;
    placeholderSky.dispose();
    showLoading('Preparing rear-view mirrors…', 0.85);
    car.setMirrors('cabin', warmMirrorResolution);
    await renderer.compileAsync(scene, mirrorWarmupCamera);
    await car.warmMirrors(renderer, scene, mirrorWarmupCamera);
    showLoading('Preparing the ghost car…', 0.95);
    restoreLighting();
    car.setMirrors('fpv', configurationState.getState().mirrorResolution);
    ghost.visible = true;
    await renderer.compileAsync(scene, warmupCamera);
    const depth = tireEffects.captureDepth(renderer, scene, warmupCamera, true);
    renderer.render(scene, warmupCamera);
    ghost.renderGlow(renderer, warmupCamera, depth);
    ghost.visible = false;
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, warmupCamera);
    renderer.getContext().finish();
  } finally {
    ghost.visible = false;
    restoreLighting();
    renderer.setRenderTarget(previousTarget);
  }
  gameState.update({ status: { visible: false, error: false, message: '' } });
  document.querySelectorAll('.hide-when-loading').forEach((node) => {
    node.classList.remove('hide-when-loading');
  });
  let firstFrame = true;
  renderer.setAnimationLoop((time) => {
    try {
      frame(time);
      if (firstFrame) {
        renderer.domElement.style.visibility = '';
        firstFrame = false;
      }
    } catch (error) {
      audio.silence();
      renderer.setAnimationLoop(null);
      showError(error);
    }
  });
}

function showLoading(message: string, progress: number) {
  gameState.update({ status: { visible: true, error: false, message, progress } });
}

function showError(error: unknown, fatal = true) {
  console.error('Unable to run Dorifto:', error);
  gameState.update({
    status: {
      visible: true,
      error: true,
      fatal,
      message: `Unable to run the demo: ${error instanceof Error ? error.message : String(error)}. Check the console and reload to retry.`,
    },
  });
}

void start().catch(showError);
