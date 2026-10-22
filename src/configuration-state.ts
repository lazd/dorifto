import { driveModes, type DriveMode } from './drive-modes';
import { createStore } from './store';
import type { TurnSignMode } from './turn-sign';
import { type StereoStationSelection } from './stereo';
import { loadTuningPresets, type TuningPreset } from './tuning-presets';

export const wattsPerHorsepower = 745.699872;

export function isCameraStyle(value: string): value is ConfigurationState['cameraStyle'] {
  return value === 'corner' || value === 'classic' || value === 'cabin';
}

export function isTimeOfDay(value: string): value is ConfigurationState['timeOfDay'] {
  return value === 'noon' || value === 'sunset' || value === 'night';
}

export function isMinimapOrientation(value: string): value is ConfigurationState['minimapOrientation'] {
  return value === 'north-up' || value === 'heading-up';
}

export function isMirrorResolution(value: string): value is ConfigurationState['mirrorResolution'] {
  return value === 'off' || value === 'low' || value === 'medium' || value === 'high';
}

export function readMirrorResolution(params: URLSearchParams): ConfigurationState['mirrorResolution'] {
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

export interface ConfigurationState {
  driveMode: DriveMode;
  profiles: Readonly<Record<DriveMode, DrivingTuning>>;
  selectedTuningPresets: Readonly<Record<DriveMode, string | null>>;
  tuningPresets: readonly TuningPreset[];
  cameraStyle: 'corner' | 'classic' | 'cabin';
  cabinHeadMotion: boolean;
  mirrorResolution: 'off' | 'low' | 'medium' | 'high';
  minimapOrientation: 'north-up' | 'heading-up';
  timeOfDay: 'noon' | 'sunset' | 'night';
  courseReverse: boolean;
  coneMode: 'all' | 'corners' | 'off';
  showGrass: boolean;
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
    driveMode: 'drift',
    profiles: { drift: defaultTuning('drift'), grip: defaultTuning('grip') },
    selectedTuningPresets: { drift: 'drift-default', grip: 'grip-default' },
    tuningPresets,
    cameraStyle: 'corner', timeOfDay: 'noon',
    minimapOrientation: 'heading-up', cabinHeadMotion: true, mirrorResolution: 'low',
    courseReverse: false, coneMode: 'corners', showGrass: true, turnSignMode: 'several',
    ghostMode: 'fastest', muted: false,
    stereoStation: 'off',
  });
  return store;
}
