import * as THREE from 'three';
import { carLightLayers, loadCar } from './car';
import { DrivingControls, updateVehicleLights } from './controls';
import { inputBindings, keyboardActionForCode } from './input-bindings';
import { createCourse } from './course';
import {
  courses,
  courseSpawn,
  loadCourseDefinition,
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
import {
  defaultRaceOptions,
  isRaceMode,
  raceModes,
  recordStorageKey,
  type RaceMode,
  type RaceOptions,
} from './race-rules';
import { createRunResults } from './run-results';
import { VehicleAudio } from './audio';
import { CarStereo, isStereoStationSelection } from './stereo';
import {
  createConfigurationState,
  defaultTuningPresets,
  isCameraStyle,
  isGhostMode,
  isLapGateMode,
  isMinimapOrientation,
  isSpeedUnit,
  isTimeOfDay,
  readMirrorResolution,
  type ConfigurationState,
} from './configuration-state';
import { createGameState, type SavedRunOption } from './game-state';
import { loadTuningPresets } from './tuning-presets';
import {
  deleteSavedCourse,
  loadSavedCourses,
  migrateSavedCourses,
  updateSavedCourse,
  saveCourse,
} from './saved-courses';
import { openRoadMaps } from './course-builder-storage';
import { bindGameUI, bindGameActions, bindCoursePicker, bindLapRecorder, element } from './ui';
import { createDrivingCamera } from './camera';
import { createLighting } from './lighting';
import { loadTerrainSurfaces } from './surfaces';
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
  bestRunTime,
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
import { browserStorage } from './browser-storage';

// Imported styles have been applied, so the page can be revealed without unstyled content.
document.body.hidden = false;
const gameState = createGameState();
const configurationState = createConfigurationState();
let ui: ReturnType<typeof bindGameUI>;

async function start() {
  await browserStorage.open(await navigator.storage.getDirectory(), localStorage, (error) =>
    showError(error, false),
  );
  configurationState.update({
    tuningPresets: loadTuningPresets(browserStorage, defaultTuningPresets()),
  });
  ui = bindGameUI(configurationState, gameState, (error) => showError(error, false));
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
    speedUnit: readOption('speed-unit', configurationState.getState().speedUnit, isSpeedUnit),
    cabinHeadMotion: readToggle('head-motion'),
    mirrorResolution: readParams(
      ['mirror-resolution', 'low-res-mirrors'],
      readMirrorResolution,
      'low',
    ),
    coneMode: requestedConeMode,
    showGrass: readToggle('grass'),
    showKerbs: readToggle('kerbs'),
    showRoadEdgeDirt: readToggle('road-edge-dirt'),
    lapGateMode: readOption('lap-gates', 'off', isLapGateMode),
    ghostMode: requestedGhost,
    turnSignMode: readParams(
      ['signs'],
      (params) => readTurnSignMode(params.get('signs')),
      'several',
    ),
    muted: !readToggle('sound'),
  });
  const settingsUrl = new URL(location.href);
  if (settingsUrl.searchParams.has('transmission')) {
    settingsUrl.searchParams.delete('transmission');
    history.replaceState(null, '', settingsUrl);
  }
  const courseUrl = new URL(location.href);
  let botsOnly = readBotsOnly(courseUrl.searchParams);
  let botOptions = readRaceBots(courseUrl.searchParams);
  // Recordings follow the primary car: the player, or the first bot in bots-only mode.
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
  const botProfileNames = new Map(defaultTuningPresets().map(({ id, name }) => [id, name]));
  let recordedDriver = recordedDriverFor(botOptions, botsOnly);
  if (botsOnly)
    configurationState.update({
      driveMode: botDriveMode(botOptions[0]?.preset),
      ...(!courseUrl.searchParams.has('camera') ? { cameraStyle: 'fpv' as const } : {}),
    });
  const trackDirectory = await openRoadMaps();
  await migrateSavedCourses(trackDirectory, localStorage);
  let storedCourses = await loadSavedCourses(trackDirectory);
  const combinedCourses = () => [
    ...storedCourses,
    ...courses.filter((course) => !storedCourses.some(({ id }) => id === course.id)),
  ];
  const availableCourses = combinedCourses();
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
  let modelProgress = 0;
  let mapProgress = 0;
  const showAssetProgress = () =>
    showLoading(
      mapProgress < 1 ? `Loading map: ${definition.name}…` : 'Loading models…',
      0.1 * (modelProgress + mapProgress),
    );
  const carLoad = loadCar((fraction) => {
    modelProgress = fraction;
    showAssetProgress();
  });
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
  const [car, loadedDefinition] = await Promise.all([
    carLoad,
    loadCourseDefinition(definition, (fraction) => {
      mapProgress = fraction;
      showAssetProgress();
    }),
    loadTerrainSurfaces(),
  ]);
  const initialDefinition = { ...loadedDefinition, reverse: requestedReverse };
  let raceOptions = readParams<RaceOptions>(
    ['race-mode', 'race-laps'],
    (params) => {
      const mode = params.get('race-mode') ?? defaultRaceOptions.mode;
      const laps = Number(params.get('race-laps') ?? defaultRaceOptions.laps);
      if (!isRaceMode(mode) || (mode === 'mustard' && !loadedDefinition.doubleYellow))
        throw new Error('Invalid race mode for this course');
      if (!Number.isSafeInteger(laps) || laps < 1)
        throw new Error('Race laps must be a positive whole number');
      return { mode, laps };
    },
    { ...defaultRaceOptions },
  );
  showLoading('Loading map…');
  await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
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

  configurationState.subscribe(({ speedUnit }) => car.setSpeedUnit(speedUnit), ['speedUnit']);
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
    race: RaceOptions = raceOptions,
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
      course.setKerbs(configurationState.getState().showKerbs);
      course.setRoadEdgeDirt(configurationState.getState().showRoadEdgeDirt);
      physics = createPhysicsClient({
        race,
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
      course.setKerbs(latest.showKerbs);
      course.setRoadEdgeDirt(latest.showRoadEdgeDirt);
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

  let activeDefinition = loadedDefinition;
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
  configurationState.subscribe(({ showKerbs }) => course.setKerbs(showKerbs), ['showKerbs']);
  configurationState.subscribe(
    ({ showRoadEdgeDirt }) => course.setRoadEdgeDirt(showRoadEdgeDirt),
    ['showRoadEdgeDirt'],
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

  // Record from launch; completed and stopped runs are saved by the results dialog.
  let run: RunRecording | null = null;
  let automaticResultsHandled = false;
  let cameraNeedsReset = false;
  const storedRuns = new WeakSet<RunRecording>();
  let replay: { recording: RunRecording; time: number } | null = null;
  let storageKey = replayStorageKey({ ...definition, reverse: requestedReverse });
  let savedRuns: RunSummary[] = [];
  let runOptions: readonly SavedRunOption[] = [];
  let selectedRun: string | null = null;
  let recordLap: RunRecording | null = null;
  let runRecordTime: number | null = null;
  const modeRecords: Record<RaceMode, RunRecording | null> = {
    'track-limits': null,
    mustard: null,
    'anything-goes': null,
  };
  let recordLoad = 0;
  const results = createRunResults({ restart: reset, replay: startReplay });
  element('#race-panel').addEventListener('click', () => showResults(false, true));
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
    const best = bestRunTime(run);
    const label =
      (times.length
        ? `${date} · ${count} · ${best === null ? 'no valid laps' : `best ${formatLapTime(best)}`}`
        : `${date} · partial lap`) + ` · ${raceModes[run.mode ?? 'track-limits'].name}`;
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

  function keepRecord(lap: RunRecording, mode: RaceMode = raceOptions.mode) {
    const previous = modeRecords[mode];
    if (previous && previous.lapTimes[0] <= lap.lapTimes[0]) return;
    modeRecords[mode] = lap;
    if (mode === raceOptions.mode) recordLap = lap;
    void saveRecordLap(recordStorageKey(storageKey, mode), lap).catch((error) =>
      reportLapError('Unable to save record lap:', error),
    );
  }

  async function refreshRecordLap() {
    const key = storageKey;
    const generation = ++recordLoad;
    recordLap = null;
    for (const mode of Object.keys(modeRecords) as RaceMode[]) modeRecords[mode] = null;
    try {
      for (const mode of Object.keys(modeRecords) as RaceMode[]) {
        if (mode === 'mustard' && !activeDefinition.doubleYellow) continue;
        let loaded = await loadRecordLap(recordStorageKey(key, mode));
        const bestSaved = savedRuns.reduce<RunSummary | null>((best, saved) => {
          const time = bestRunTime(saved, mode);
          if (time === null) return best;
          return !best || time < bestRunTime(best, mode)! ? saved : best;
        }, null);
        if (bestSaved && (!loaded || bestRunTime(bestSaved, mode)! < loaded.lapTimes[0])) {
          const saved = await loadRun(key, bestSaved.id);
          const index = saved.bestLapForMode(mode);
          if (index !== null) loaded = saved.extractLap(index);
        }
        if (generation !== recordLoad || key !== storageKey) return;
        if (loaded) keepRecord(loaded, mode);
      }
    } catch (error) {
      reportLapError('Unable to load record lap:', error);
    }
  }

  function keepRunRecord() {
    if (!run) return;
    for (const recording of [run, ...run.field]) {
      for (const mode of Object.keys(modeRecords) as RaceMode[]) {
        const index = recording.bestLapForMode(mode);
        if (
          index !== null &&
          (!modeRecords[mode] || recording.lapTimes[index] < modeRecords[mode]!.lapTimes[0])
        )
          keepRecord(recording.extractLap(index), mode);
      }
    }
  }

  function clearLapRecording() {
    results.close();
    keepRunRecord();
    if (run?.count) storeRun(run);
    run = null;
    automaticResultsHandled = false;
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

  function showResults(completed = false, live = false) {
    if (!run || results.open) return;
    keepRunRecord();
    controls.clear();
    if (!completed && !live) {
      run.retired = true;
      physics.retire();
    }
    results.show(
      run,
      {
        ...raceOptions,
        laps: activeDefinition.closed === false ? 1 : raceOptions.laps,
      },
      recordLap,
      completed,
      activeDefinition.name,
      runRecordTime,
      live && botsOnly ? physics.observedBot : 0,
    );
    results.updateStandings(
      physics.standings,
      physics.raceEntrants,
      physics.raceFinished,
      recordLap,
    );
  }

  function requestReset() {
    for (const record of physics.takeRecords()) {
      if (!replay && !physics.resetting) recordStep(record);
    }
    if (results.open || replay || !run || !run.count) reset();
    else showResults();
  }

  function startReplay(recording: RunRecording, time = 0) {
    void playRaceReplay(recording, time).catch((error) =>
      reportLapError('Unable to replay race:', error),
    );
  }

  async function playRaceReplay(recording: RunRecording, time: number) {
    if (
      recording.race &&
      (recording.race.botsOnly !== botsOnly ||
        JSON.stringify(recording.race.bots) !== JSON.stringify(botOptions))
    ) {
      await applyBotSettings(recording.race.bots, recording.race.botsOnly);
    }
    reset();
    replay = { recording, time };
    physics.startReplay(recording, time);
    recording.read(time, playbackFrame);
    applyCarPose(playbackFrame, car.chassis, car.wheels, car.hubs);
    physics.applyReplayField(recording, time);
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
    if (storedRuns.has(finished)) return;
    storedRuns.add(finished);
    const key = storageKey;
    saveRun(key, finished, recordedDriver).then(
      (saved) => {
        if (key !== storageKey) return;
        selectedRun = saved.id;
        refreshSavedRuns();
      },
      (error) => {
        storedRuns.delete(finished);
        reportLapError('Unable to save laps:', error);
      },
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

  function recordStep(record: PhysicsRecord) {
    if (!run) {
      run = new RunRecording();
      runRecordTime = recordLap?.lapTimes[0] ?? null;
      run.mode = raceOptions.mode;
      run.race = {
        bots: botOptions.map((options) => ({ ...options })),
        botsOnly,
        entrants: physics.raceEntrants.map((entrant) => ({ ...entrant })),
      };
      run.field.push(
        ...(record.field ?? []).map(() => {
          const entrant = new RunRecording();
          entrant.mode = raceOptions.mode;
          return entrant;
        }),
      );
    }
    const started = run.started;
    run.recordStep(record);
    record.field?.forEach((entrant, index) => run!.field[index].recordStep(entrant));
    if (!started && run.started) syncLapRecorder();
    if (record.sample) keepRunRecord();
    if (record.raceFinished) storeRun(run);
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
    physics.applyReplayField(recording, shownTime);
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
    nextRace: RaceOptions = raceOptions,
  ) {
    changingCourse = true;
    controls.clear();
    audio.reset();
    clearLapRecording();
    showLoading('Loading map…', 0);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const nextDefinition = await loadCourseDefinition(build(), (fraction) =>
        showLoading('Loading map…', fraction),
      );
      showLoading('Loading map…');
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const race = {
        ...nextRace,
        mode:
          nextRace.mode === 'mustard' && !nextDefinition.doubleYellow
            ? ('track-limits' as const)
            : nextRace.mode,
      };
      const next = await createCourseSession(
        { ...nextDefinition, reverse },
        undefined,
        botOptions,
        botsOnly,
        race,
      );
      minimap.setCourse(nextDefinition);
      const previousPhysics = physics;
      const previousCourse = course;
      ({ course, terrain, spawn, laps, physics, drivingCamera } = next);
      tireEffects.setCourse(terrain, course.isAsphalt);
      previousPhysics.dispose(false);
      previousCourse.dispose();
      const url = new URL(location.href);
      updateUrl(url);
      raceOptions = race;
      url.searchParams.set('race-mode', race.mode);
      url.searchParams.set('race-laps', String(race.laps));
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
    race: RaceOptions = raceOptions,
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
      race,
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
    isSavedCourse: (id) => storedCourses.some((course) => course.id === id),
    refreshCourses: async () => {
      storedCourses = await loadSavedCourses(trackDirectory);
      availableCourses.splice(0, availableCourses.length, ...combinedCourses());
      return availableCourses;
    },
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
    saveCourse: async (name, definition = activeDefinition) => {
      const saved = await saveCourse(trackDirectory, definition, name);
      storedCourses.push(saved);
      availableCourses.push(saved);
      if (definition !== activeDefinition) return saved;
      activeDefinition = saved;
      minimap.setCourse(saved);
      storageKey = replayStorageKey({
        ...saved,
        reverse: configurationState.getState().courseReverse,
      });
      ++recordLoad;
      for (const mode of Object.keys(modeRecords) as RaceMode[]) {
        const record = modeRecords[mode];
        if (record)
          void saveRecordLap(recordStorageKey(storageKey, mode), record).catch((error) =>
            reportLapError('Unable to save record lap:', error),
          );
      }
      refreshSavedRuns();
      const url = new URL(location.href);
      url.searchParams.set('course', saved.id);
      url.searchParams.delete('seed');
      writeCourseWeights(url.searchParams);
      history.replaceState(null, '', url);
      return saved;
    },
    updateCourse: async (definition) => {
      const renamed = await updateSavedCourse(trackDirectory, definition);
      storedCourses[storedCourses.findIndex((course) => course.id === definition.id)] = renamed;
      availableCourses[availableCourses.findIndex((course) => course.id === definition.id)] =
        renamed;
      if (activeDefinition.id === definition.id) {
        activeDefinition = renamed;
        minimap.setCourse(renamed);
      }
      return renamed;
    },
    deleteCourse: async (id) => {
      const savedCourse = (await loadSavedCourses(trackDirectory)).find(
        (course) => course.id === id,
      );
      if (!savedCourse) throw new Error('Only saved courses can be deleted');
      if (changingCourse) throw new Error('Wait for the current course change to finish');
      const active = activeDefinition.id === id;
      const fallback = active ? await changeCourse(courses[0].id) : activeDefinition;
      try {
        await deleteSavedCourse(trackDirectory, id);
        storedCourses = storedCourses.filter((course) => course.id !== id);
      } catch (error) {
        if (active) await changeCourse(id);
        throw error;
      }
      availableCourses.splice(
        availableCourses.findIndex((course) => course.id === id),
        1,
      );
      try {
        await deleteCourseRecords(savedCourse);
      } catch (error) {
        reportLapError('Unable to delete course records:', error);
      }
      return fallback;
    },
    playRun: playCourseRun,
    deleteReplay: async (course, reverse, id) => {
      const key = replayStorageKey({ ...course, reverse });
      await deleteRun(key, id);
      if (key === storageKey) refreshSavedRuns();
    },
    getCourseWeights: ui.getCourseWeights,
    setCourseWeights: ui.setCourseWeights,
    getRaceOptions: () => ({ ...raceOptions }),
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
    if (results.open && keyboardActionForCode(event.code) === 'reset') {
      event.preventDefault();
      if (!event.repeat) requestReset();
      return;
    }
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
      if (!event.repeat) requestReset();
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
    controls.poll(!dialogOpen, profiles[driveMode].steeringExpo, ui.dismissError, results.open);
    if (controls.lightingRequested && !replay) {
      vehicleLights = updateVehicleLights(vehicleLights, controls.lightingRequested);
      headlightsOverridden = true;
    }
    if (controls.driveModeRequested) toggleDriveMode();
    if (controls.cameraRequested) cycleCamera();
    if (controls.timeOfDayRequested) cycleTimeOfDay();
    if (controls.resetRequested) requestReset();
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
      if (!replay) recordStep(record);
    }
    if (
      !replay &&
      !automaticResultsHandled &&
      run?.count &&
      run.lapTimes.length >= (activeDefinition.closed === false ? 1 : raceOptions.laps) &&
      run.duration >= run.lapStarts[run.lapStarts.length - 1]
    ) {
      automaticResultsHandled = true;
      if (!dialogOpen) showResults(true);
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
    const observedBot = botsOnly && !replaying ? botOptions[physics.observedBot] : null;
    const observedMode = observedBot ? botDriveMode(observedBot.preset) : null;
    const observedProfile = observedBot
      ? botProfileNames.get(observedBot.preset ?? 'grip-fast')
      : null;
    if (observedBot && !observedProfile)
      throw new Error(`Missing observed bot tuning profile: ${observedBot.preset}`);
    const previousDriver = gameState.getState().observedDriver;
    if (
      previousDriver?.driveMode !== (observedMode ?? undefined) ||
      previousDriver?.profile !== (observedProfile ?? undefined)
    ) {
      gameState.update({
        observedDriver:
          observedMode && observedProfile
            ? { driveMode: observedMode, profile: observedProfile }
            : null,
      });
    }
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
    if (results.open)
      results.updateStandings(
        physics.standings,
        physics.raceEntrants,
        physics.raceFinished,
        recordLap,
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
    physics.updateBotEffects(
      dt,
      camera,
      frameHeadlights,
      appliedTime,
      !replaying || Boolean(replay?.recording.field.length),
    );
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
        finished: replay
          ? replay.recording.finished &&
            replay.time >=
              (replay.recording.lapStarts[replay.recording.lapTimes.length] ?? Infinity)
          : laps.finished,
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

function showLoading(message: string, progress = gameState.getState().status.progress ?? 0.8) {
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

void start().catch((error) => {
  ui ??= bindGameUI(configurationState, gameState, (error) => showError(error, false));
  showError(error);
});
