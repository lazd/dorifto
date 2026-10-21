import { driveModes, type DriveMode } from './drive-modes';
import { createStore } from './store';

export const wattsPerHorsepower = 745.699872;

export function isCameraStyle(value: string): value is GameState['cameraStyle'] {
  return value === 'corner' || value === 'classic' || value === 'cabin';
}

export function isTimeOfDay(value: string): value is GameState['timeOfDay'] {
  return value === 'noon' || value === 'sunset' || value === 'night';
}

export function defaultTuning(mode: DriveMode) {
  const preset = driveModes[mode];
  return {
    frontGrip: preset.frontGrip,
    rearGrip: preset.rearGrip,
    frontStiffness: preset.frontStiffness,
    rearStiffness: preset.rearStiffness,
    rearSlidingGrip: preset.rearSlidingGrip,
    steeringScale: preset.steeringScale,
    steeringExpo: preset.steeringExpo,
    steeringRate: preset.steeringRate,
    horsepower: Math.round(preset.enginePower / wattsPerHorsepower),
  };
}

export type DrivingTuning = Readonly<ReturnType<typeof defaultTuning>>;
export interface GameState {
  driveMode: DriveMode;
  profiles: Readonly<Record<DriveMode, DrivingTuning>>;
  cameraStyle: 'corner' | 'classic' | 'cabin';
  timeOfDay: 'noon' | 'sunset' | 'night';
  helpOpen: boolean;
  tuningOpen: boolean;
  settingsOpen: boolean;
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

export function createGameState() {
  const store = createStore<GameState>({
    driveMode: 'drift',
    profiles: { drift: defaultTuning('drift'), grip: defaultTuning('grip') },
    cameraStyle: 'corner', timeOfDay: 'noon', helpOpen: false, tuningOpen: false, settingsOpen: false,
    focused: true, controllerStatus: '',
    sound: { running: false, muted: false, failed: false, error: null },
    status: { message: 'Loading car and physics...', error: false, visible: true },
    telemetry: {
      speed: 0, rpm: 850, gear: 1, limiter: false,
      lap: 0, current: 0, last: null, best: null, cones: 0, lastCones: null, driving: 'brakes-held',
    },
  });
  return store;
}
