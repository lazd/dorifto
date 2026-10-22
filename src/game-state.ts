import { driveModes, type DriveMode } from './drive-modes';
import { idleRpm } from './drivetrain';
import { createStore } from './store';
import { defaultCourseWeights, type CourseGenerationWeights } from './course-generation';
import type { TurnSignMode } from './turn-sign';
import { loadTuningPresets, type TuningPreset } from './tuning-presets';

export const wattsPerHorsepower = 745.699872;

export function isCameraStyle(value: string): value is GameState['cameraStyle'] {
  return value === 'corner' || value === 'classic' || value === 'cabin';
}

export function isTimeOfDay(value: string): value is GameState['timeOfDay'] {
  return value === 'noon' || value === 'sunset' || value === 'night';
}

export function isMinimapOrientation(value: string): value is GameState['minimapOrientation'] {
  return value === 'north-up' || value === 'heading-up';
}

export function isMirrorResolution(value: string): value is GameState['mirrorResolution'] {
  return value === 'low' || value === 'medium' || value === 'high';
}

export function readMirrorResolution(params: URLSearchParams): GameState['mirrorResolution'] {
  const value = params.get('mirror-resolution');
  if (value !== null) {
    if (!isMirrorResolution(value)) throw new Error(`Invalid mirror resolution: ${value}`);
    return value;
  }
  const legacy = params.get('low-res-mirrors');
  if (legacy === null || legacy === 'on') return 'low';
  if (legacy === 'off') return 'high';
  throw new Error(`Invalid low-res-mirrors option: ${legacy}`);
}

export function isGhostMode(value: string): value is GameState['ghostMode'] {
  return value === 'fastest' || value === 'previous' || value === 'record' || value === 'off';
}

export interface SavedRunOption { id: string; label: string }

export function defaultTuning(mode: DriveMode) {
  const preset = driveModes[mode];
  return {
    frontGrip: preset.frontGrip,
    rearGrip: preset.rearGrip,
    frontStiffness: preset.frontStiffness,
    rearStiffness: preset.rearStiffness,
    steeringScale: preset.steeringScale,
    steeringExpo: preset.steeringExpo,
    steeringRate: preset.steeringRate,
    horsepower: Math.round(preset.enginePower / wattsPerHorsepower),
  };
}

export type DrivingTuning = Readonly<ReturnType<typeof defaultTuning>>;
export type { TuningPreset } from './tuning-presets';

export function defaultTuningPresets(): TuningPreset[] {
  return [
    { id: 'drift-default', name: 'Default', mode: 'drift', readonly: true, tuning: defaultTuning('drift') },
    {
      id: 'drift-aggressive', name: 'Aggressive', mode: 'drift',
      readonly: true,
      tuning: {
        horsepower: 515, steeringExpo: 0.6, steeringRate: 2.8, steeringScale: 1.03,
        frontGrip: 1.05, rearGrip: 1, frontStiffness: 45000, rearStiffness: 43000,
      },
    },
    { id: 'grip-default', name: 'Default', mode: 'grip', readonly: true, tuning: defaultTuning('grip') },
    {
      id: 'grip-fast', name: 'Fast', mode: 'grip', readonly: true,
      tuning: {
        horsepower: 500, steeringExpo: 0.6, steeringRate: 2, steeringScale: 1,
        frontGrip: 1.1, rearGrip: 1.15, frontStiffness: 51000, rearStiffness: 51000,
      },
    },
  ];
}

export interface GameState {
  driveMode: DriveMode;
  profiles: Readonly<Record<DriveMode, DrivingTuning>>;
  selectedTuningPresets: Readonly<Record<DriveMode, string | null>>;
  tuningPresets: readonly TuningPreset[];
  cameraStyle: 'corner' | 'classic' | 'cabin';
  cabinHeadMotion: boolean;
  mirrorResolution: 'low' | 'medium' | 'high';
  minimapOrientation: 'north-up' | 'heading-up';
  timeOfDay: 'noon' | 'sunset' | 'night';
  helpOpen: boolean;
  tuningOpen: boolean;
  settingsOpen: boolean;
  customCourseOpen: boolean;
  courseMenuOpen: boolean;
  courseWeights: CourseGenerationWeights;
  courseReverse: boolean;
  coneMode: 'all' | 'corners' | 'off';
  showGrass: boolean;
  turnSignMode: TurnSignMode;
  ghostMode: 'fastest' | 'previous' | 'record' | 'off';
  /** off: nothing to show; ready: saved laps can be replayed; recording: run in progress; replay: watching. */
  lapRecorder: Readonly<{
    mode: 'off' | 'ready' | 'recording' | 'replay';
    runs: readonly SavedRunOption[];
    selectedRun: string | null;
    replayLap: Readonly<{ lap: number; time: number | null; fastest: boolean; previous: number | null; next: number | null }> | null;
  }>;
  focused: boolean;
  controllerStatus: string;
  sound: Readonly<{ running: boolean; muted: boolean; failed: boolean; error: string | null }>;
  status: Readonly<{ message: string; error: boolean; visible: boolean }>;
  telemetry: Readonly<{
    speed: number; rpm: number; gear: number; limiter: boolean;
    lap: number; current: number; last: number | null; best: number | null;
    cones: number; lastCones: number | null;
    driving: 'brakes-held' | 'handbrake' | 'brakestand' | 'reverse' | 'braking' | 'burnout' | 'sliding' | 'driving';
  }>;
}

export function createGameState(storage?: Storage) {
  const tuningPresets = storage
    ? loadTuningPresets(storage, defaultTuningPresets())
    : defaultTuningPresets();
  const store = createStore<GameState>({
    driveMode: 'drift',
    profiles: { drift: defaultTuning('drift'), grip: defaultTuning('grip') },
    selectedTuningPresets: { drift: 'drift-default', grip: 'grip-default' },
    tuningPresets,
    cameraStyle: 'corner', timeOfDay: 'noon', helpOpen: false, tuningOpen: false, settingsOpen: false,
    minimapOrientation: 'heading-up', cabinHeadMotion: true, mirrorResolution: 'low',
    customCourseOpen: false, courseMenuOpen: false, courseWeights: { ...defaultCourseWeights },
    courseReverse: false, coneMode: 'corners', showGrass: true, turnSignMode: 'several',
    ghostMode: 'fastest', lapRecorder: { mode: 'off', runs: [], selectedRun: null, replayLap: null },
    focused: true, controllerStatus: '',
    sound: { running: false, muted: false, failed: false, error: null },
    status: { message: 'Loading car and physics...', error: false, visible: true },
    telemetry: {
      speed: 0, rpm: idleRpm, gear: 1, limiter: false,
      lap: 0, current: 0, last: null, best: null, cones: 0, lastCones: null, driving: 'brakes-held',
    },
  });
  return store;
}
