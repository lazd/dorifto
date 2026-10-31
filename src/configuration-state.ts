import { isDriveMode, type DriveMode } from './drive-modes';
import { createStore } from './store';
import { isTurnSignMode, type TurnSignMode } from './turn-sign';
import { isStereoStationSelection, type StereoStationSelection } from './stereo';
import {
  defaultTreeSettings,
  treeSliders,
  type TreeSettings,
  validTreeSlider,
} from './tree-settings';
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

export function isPixelRatio(value: string): value is ConfigurationState['pixelRatio'] {
  return value === 'auto' || value === '0.5' || value === '0.75' || value === '1' || value === '2';
}

export function isTerrainShadows(value: string): value is ConfigurationState['terrainShadows'] {
  return value === 'auto' || value === 'on' || value === 'off';
}

export function readMirrorResolution(
  params: URLSearchParams,
  fallback: ConfigurationState['mirrorResolution'] = 'low',
): ConfigurationState['mirrorResolution'] {
  const value = params.get('mirror-resolution');
  if (value !== null) {
    if (!isMirrorResolution(value)) throw new Error(`Invalid mirror resolution: ${value}`);
    return value;
  }
  const legacy = params.get('low-res-mirrors');
  if (legacy === null) return fallback;
  if (legacy === 'on') return 'low';
  if (legacy === 'off') return 'high';
  throw new Error(`Invalid low-res-mirrors option: ${legacy}`);
}

export function isGhostMode(value: string): value is ConfigurationState['ghostMode'] {
  return (
    value === 'fastest' ||
    value === 'previous' ||
    value === 'record' ||
    value === 'real' ||
    value === 'off'
  );
}

/** The ghost a course can show for the preferred mode; `realDriver` says if it has a recording. */
export function courseGhostMode(
  mode: ConfigurationState['ghostMode'],
  closed?: boolean,
  realDriver = false,
) {
  if (mode === 'real' && !realDriver) return closed === false ? 'record' : 'fastest';
  return closed === false && (mode === 'fastest' || mode === 'previous') ? 'record' : mode;
}

export type { DrivingTuning, TuningPreset } from './tuning-presets';

export const lapGateModes = ['off', 'on', 'rainbow'] as const;
export type LapGateMode = (typeof lapGateModes)[number];
export const isLapGateMode = (value: string): value is LapGateMode =>
  (lapGateModes as readonly string[]).includes(value);

export function isRacingLineMode(value: string): value is ConfigurationState['racingLineMode'] {
  return value === 'off' || value === 'full' || value === 'lane';
}

export interface ConfigurationState extends TreeSettings {
  driveMode: DriveMode;
  profiles: Readonly<Record<DriveMode, DrivingTuning>>;
  selectedTuningPresets: Readonly<Record<DriveMode, string | null>>;
  tuningPresets: readonly TuningPreset[];
  cameraStyle: 'classic' | 'fpv' | 'cabin';
  cabinHeadMotion: boolean;
  cabinHeadOffsetY: number;
  mirrorResolution: 'off' | 'low' | 'medium' | 'high';
  passengerMirror: boolean;
  pixelRatio: 'auto' | '0.5' | '0.75' | '1' | '2';
  terrainShadows: 'auto' | 'on' | 'off';
  showFps: boolean;
  minimapOrientation: 'north-up' | 'heading-up';
  speedUnit: 'mph' | 'kmh';
  timeOfDay: 'noon' | 'sunset' | 'night';
  courseReverse: boolean;
  coneMode: 'all' | 'corners' | 'off';
  showGrass: boolean;
  showKerbs: boolean;
  showRoadEdgeDirt: boolean;
  showBuildings: boolean;
  showWater: boolean;
  showNearbyRoads: boolean;
  lapGateMode: LapGateMode;
  racingLineMode: 'off' | 'full' | 'lane';
  turnSignMode: TurnSignMode;
  ghostMode: 'fastest' | 'previous' | 'record' | 'real' | 'off';
  muted: boolean;
  stereoStation: StereoStationSelection;
}

export const configurationSettingsStorageKey = 'dorifto:settings.v1';
export const hudVisibilityStorageKey = 'dorifto:settings.hud-visibility';

export const configurationSettingKeys = [
  'driveMode',
  'selectedTuningPresets',
  'cameraStyle',
  'cabinHeadMotion',
  'cabinHeadOffsetY',
  'mirrorResolution',
  'passengerMirror',
  'pixelRatio',
  'terrainShadows',
  'treeDrawDistance',
  'treeDensity',
  'treeQuality',
  'treeBakeDistance',
  'treeSmoothTransitions',
  'treeNearTrackOnly',
  'showFps',
  'minimapOrientation',
  'speedUnit',
  'timeOfDay',
  'coneMode',
  'showGrass',
  'showKerbs',
  'showRoadEdgeDirt',
  'showBuildings',
  'showWater',
  'showNearbyRoads',
  'lapGateMode',
  'racingLineMode',
  'turnSignMode',
  'ghostMode',
  'muted',
  'stereoStation',
] as const satisfies readonly (keyof ConfigurationState)[];

export type ConfigurationSettings = Pick<
  ConfigurationState,
  (typeof configurationSettingKeys)[number]
>;

const isStoredSetting: Record<keyof ConfigurationSettings, (value: unknown) => boolean> = {
  driveMode: (value) => typeof value === 'string' && isDriveMode(value),
  selectedTuningPresets: (value) =>
    typeof value === 'object' &&
    value !== null &&
    ['drift', 'grip'].every(
      (mode) =>
        (value as Record<string, unknown>)[mode] === null ||
        typeof (value as Record<string, unknown>)[mode] === 'string',
    ),
  cameraStyle: (value) => typeof value === 'string' && isCameraStyle(value),
  cabinHeadMotion: (value) => typeof value === 'boolean',
  cabinHeadOffsetY: isStoredCabinHeadOffset,
  mirrorResolution: (value) => typeof value === 'string' && isMirrorResolution(value),
  passengerMirror: (value) => typeof value === 'boolean',
  pixelRatio: (value) => typeof value === 'string' && isPixelRatio(value),
  terrainShadows: (value) => typeof value === 'string' && isTerrainShadows(value),
  treeDrawDistance: (value) => isStoredTreeSlider('treeDrawDistance', value),
  treeDensity: (value) => isStoredTreeSlider('treeDensity', value),
  treeQuality: (value) => isStoredTreeSlider('treeQuality', value),
  treeBakeDistance: (value) => isStoredTreeSlider('treeBakeDistance', value),
  treeSmoothTransitions: (value) => typeof value === 'boolean',
  treeNearTrackOnly: (value) => typeof value === 'boolean',
  showFps: (value) => typeof value === 'boolean',
  minimapOrientation: (value) => typeof value === 'string' && isMinimapOrientation(value),
  speedUnit: (value) => typeof value === 'string' && isSpeedUnit(value),
  timeOfDay: (value) => typeof value === 'string' && isTimeOfDay(value),
  coneMode: (value) => value === 'all' || value === 'corners' || value === 'off',
  showGrass: (value) => typeof value === 'boolean',
  showKerbs: (value) => typeof value === 'boolean',
  showRoadEdgeDirt: (value) => typeof value === 'boolean',
  showBuildings: (value) => typeof value === 'boolean',
  showWater: (value) => typeof value === 'boolean',
  showNearbyRoads: (value) => typeof value === 'boolean',
  lapGateMode: (value) => typeof value === 'string' && isLapGateMode(value),
  racingLineMode: (value) => typeof value === 'string' && isRacingLineMode(value),
  turnSignMode: (value) => typeof value === 'string' && isTurnSignMode(value),
  ghostMode: (value) => typeof value === 'string' && isGhostMode(value),
  muted: (value) => typeof value === 'boolean',
  stereoStation: (value) => typeof value === 'string' && isStereoStationSelection(value),
};

export function isStoredCabinHeadOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -0.15 && value <= 0.15;
}

function isStoredTreeSlider(key: keyof TreeSettings, value: unknown): boolean {
  const control = treeSliders.find((entry) => entry.key === key);
  return typeof value === 'number' && control !== undefined && validTreeSlider(control, value);
}

export function readStoredConfigurationSettings(
  storage: Pick<Storage, 'getItem'>,
): Partial<ConfigurationSettings> {
  const text = storage.getItem(configurationSettingsStorageKey);
  if (text === null) return {};
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('Invalid stored settings');
  const stored = parsed as Record<string, unknown>;
  const settings: Partial<ConfigurationSettings> = {};
  for (const key of configurationSettingKeys) {
    if (!(key in stored)) continue;
    if (!isStoredSetting[key](stored[key])) throw new Error(`Invalid stored setting: ${key}`);
    Object.assign(settings, { [key]: stored[key] });
  }
  return settings;
}

export function getConfigurationSettings(
  state: Readonly<ConfigurationState>,
): ConfigurationSettings {
  return Object.fromEntries(
    configurationSettingKeys.map((key) => [key, state[key]]),
  ) as ConfigurationSettings;
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
    cabinHeadOffsetY: 0,
    mirrorResolution: 'low',
    passengerMirror: false,
    pixelRatio: 'auto',
    terrainShadows: 'auto',
    ...defaultTreeSettings,
    showFps: false,
    courseReverse: false,
    coneMode: 'corners',
    showGrass: true,
    showKerbs: true,
    showRoadEdgeDirt: true,
    showBuildings: true,
    showWater: true,
    showNearbyRoads: true,
    lapGateMode: 'off',
    racingLineMode: 'off',
    turnSignMode: 'several',
    ghostMode: 'fastest',
    muted: false,
    stereoStation: 'off',
  });
  return store;
}
