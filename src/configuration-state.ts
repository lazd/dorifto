import type { DriveMode } from './drive-modes';
import { createStore } from './store';
import type { TurnSignMode } from './turn-sign';
import { type StereoStationSelection } from './stereo';
import {
  defaultTuning,
  defaultTuningPresets,
  loadTuningPresets,
  type DrivingTuning,
  type TuningPreset,
} from './tuning-presets';

export { defaultTuning, defaultTuningPresets } from './tuning-presets';

export function isCameraStyle(value: string): value is ConfigurationState['cameraStyle'] {
  return value === 'classic' || value === 'fpv' || value === 'cabin';
}

export function isTimeOfDay(value: string): value is ConfigurationState['timeOfDay'] {
  return value === 'noon' || value === 'sunset' || value === 'night';
}

export function isMinimapOrientation(
  value: string,
): value is ConfigurationState['minimapOrientation'] {
  return value === 'north-up' || value === 'heading-up';
}

export function isSpeedUnit(value: string): value is ConfigurationState['speedUnit'] {
  return value === 'mph' || value === 'kmh';
}

export function isMirrorResolution(value: string): value is ConfigurationState['mirrorResolution'] {
  return value === 'off' || value === 'low' || value === 'medium' || value === 'high';
}

export function readMirrorResolution(
  params: URLSearchParams,
): ConfigurationState['mirrorResolution'] {
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

export function isGhostMode(value: string): value is ConfigurationState['ghostMode'] {
  return value === 'fastest' || value === 'previous' || value === 'record' || value === 'off';
}

export type { DrivingTuning, TuningPreset } from './tuning-presets';

export const lapGateModes = ['off', 'on', 'rainbow'] as const;
export type LapGateMode = (typeof lapGateModes)[number];
export const isLapGateMode = (value: string): value is LapGateMode =>
  (lapGateModes as readonly string[]).includes(value);

export interface ConfigurationState {
  driveMode: DriveMode;
  profiles: Readonly<Record<DriveMode, DrivingTuning>>;
  selectedTuningPresets: Readonly<Record<DriveMode, string | null>>;
  tuningPresets: readonly TuningPreset[];
  cameraStyle: 'classic' | 'fpv' | 'cabin';
  cabinHeadMotion: boolean;
  mirrorResolution: 'off' | 'low' | 'medium' | 'high';
  minimapOrientation: 'north-up' | 'heading-up';
  speedUnit: 'mph' | 'kmh';
  timeOfDay: 'noon' | 'sunset' | 'night';
  courseReverse: boolean;
  coneMode: 'all' | 'corners' | 'off';
  showGrass: boolean;
  showKerbs: boolean;
  showRoadEdgeDirt: boolean;
  lapGateMode: LapGateMode;
  turnSignMode: TurnSignMode;
  ghostMode: 'fastest' | 'previous' | 'record' | 'off';
  muted: boolean;
  stereoStation: StereoStationSelection;
}

export function createConfigurationState(storage?: Storage) {
  const tuningPresets = storage
    ? loadTuningPresets(storage, defaultTuningPresets())
    : defaultTuningPresets();
  const store = createStore<ConfigurationState>({
    driveMode: 'grip',
    profiles: { drift: defaultTuning('drift'), grip: defaultTuning('grip') },
    selectedTuningPresets: { drift: 'drift-default', grip: 'grip-default' },
    tuningPresets,
    cameraStyle: 'cabin',
    timeOfDay: 'sunset',
    minimapOrientation: 'heading-up',
    speedUnit: 'mph',
    cabinHeadMotion: true,
    mirrorResolution: 'low',
    courseReverse: false,
    coneMode: 'corners',
    showGrass: true,
    showKerbs: true,
    showRoadEdgeDirt: true,
    lapGateMode: 'off',
    turnSignMode: 'several',
    ghostMode: 'fastest',
    muted: false,
    stereoStation: 'off',
  });
  return store;
}
