import { isDriveMode, type DriveMode } from './drive-modes';

export interface DrivingTuning {
  readonly horsepower: number;
  readonly steeringExpo: number;
  readonly steeringRate: number;
  readonly steeringScale: number;
  readonly frontGrip: number;
  readonly rearGrip: number;
  readonly frontStiffness: number;
  readonly rearStiffness: number;
  readonly steeringLow: number;
  readonly steeringHigh: number;
  readonly friction: number;
  readonly engineTorque: number;
  readonly enginePower: number;
}

export interface TuningPreset {
  id: string;
  name: string;
  mode: DriveMode;
  tuning: DrivingTuning;
  readonly?: boolean;
}

export const tuningPresetsStorageKey = 'dorifto:tuning-presets';

const baseTune: Record<DriveMode, DrivingTuning> = {
  drift: {
    horsepower: 483,
    steeringExpo: 0.6,
    steeringRate: (160 * Math.PI) / 180,
    steeringScale: 1,
    frontGrip: 1.05,
    rearGrip: 1,
    frontStiffness: 45000,
    rearStiffness: 48000,
    steeringLow: (55 * Math.PI) / 180,
    steeringHigh: (45 * Math.PI) / 180,
    friction: 1.25,
    engineTorque: 560,
    enginePower: 360000,
  },
  grip: {
    horsepower: 342,
    steeringExpo: 0.6,
    steeringRate: 2,
    steeringScale: 1,
    frontGrip: 1.15,
    rearGrip: 1.1,
    frontStiffness: 45000,
    rearStiffness: 48000,
    steeringLow: 0.65,
    steeringHigh: 0.3,
    friction: 1.35,
    engineTorque: 400,
    enginePower: 255000,
  },
};

export function defaultTuning(mode: DriveMode): DrivingTuning {
  return { ...baseTune[mode] };
}

export function defaultTuningPresets(): TuningPreset[] {
  return [
    {
      id: 'drift-default',
      name: 'Default',
      mode: 'drift',
      readonly: true,
      tuning: defaultTuning('drift'),
    },
    {
      id: 'drift-aggressive',
      name: 'Aggressive',
      mode: 'drift',
      readonly: true,
      tuning: {
        ...defaultTuning('drift'),
        horsepower: 515,
        steeringRate: 2.8,
        steeringScale: 1.03,
        rearStiffness: 43000,
      },
    },
    {
      id: 'grip-default',
      name: 'Default',
      mode: 'grip',
      readonly: true,
      tuning: defaultTuning('grip'),
    },
    {
      id: 'grip-fast',
      name: 'Fast',
      mode: 'grip',
      readonly: true,
      tuning: {
        ...defaultTuning('grip'),
        horsepower: 500,
        frontGrip: 1.1,
        rearGrip: 1.15,
        frontStiffness: 51000,
        rearStiffness: 51000,
      },
    },
  ];
}

const presetTuningKeys: (keyof DrivingTuning)[] = [
  'horsepower',
  'steeringExpo',
  'steeringRate',
  'steeringScale',
  'frontGrip',
  'rearGrip',
  'frontStiffness',
  'rearStiffness',
];

type PresetDrivingTuning = Pick<
  DrivingTuning,
  | 'horsepower'
  | 'steeringExpo'
  | 'steeringRate'
  | 'steeringScale'
  | 'frontGrip'
  | 'rearGrip'
  | 'frontStiffness'
  | 'rearStiffness'
>;
type StoredTuningPreset = Omit<TuningPreset, 'tuning'> & {
  tuning: PresetDrivingTuning;
};

export function nextTuningPresetId(mode: DriveMode, presets: readonly TuningPreset[]) {
  let id = `${mode}-${Math.random().toString(36).slice(2, 8)}`;
  while (presets.some((preset) => preset.id === id)) {
    id = `${mode}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return id;
}

export function nextCustomPresetName(mode: DriveMode, presets: readonly TuningPreset[]) {
  const names = new Set(
    presets
      .filter((preset) => preset.mode === mode)
      .map((preset) => preset.name.toLocaleLowerCase()),
  );
  const base = 'Custom Preset';
  if (!names.has(base.toLocaleLowerCase())) return base;
  for (let suffix = 2; ; suffix++) {
    const name = `${base} ${suffix}`;
    if (!names.has(name.toLocaleLowerCase())) return name;
  }
}

function hasTuningKeys(value: unknown, keys: readonly (keyof DrivingTuning)[]) {
  if (typeof value !== 'object' || value === null) return false;
  const tuning = value as Record<string, unknown>;
  return (
    Object.keys(tuning).length === keys.length &&
    keys.every((key) => typeof tuning[key] === 'number' && Number.isFinite(tuning[key]))
  );
}

function isTuning(value: unknown): value is PresetDrivingTuning {
  return hasTuningKeys(value, presetTuningKeys);
}

function isTuningPreset(value: unknown): value is StoredTuningPreset {
  if (typeof value !== 'object' || value === null) return false;
  const preset = value as Record<string, unknown>;
  return (
    typeof preset.id === 'string' &&
    preset.id.length > 0 &&
    typeof preset.name === 'string' &&
    preset.name.trim().length > 0 &&
    typeof preset.mode === 'string' &&
    isDriveMode(preset.mode) &&
    (preset.readonly === undefined || typeof preset.readonly === 'boolean') &&
    isTuning(preset.tuning)
  );
}

export function loadTuningPresets(
  storage: Pick<Storage, 'getItem'>,
  defaults: readonly TuningPreset[],
): TuningPreset[] {
  const stored = storage.getItem(tuningPresetsStorageKey);
  const builtIns = defaults.map((preset) => ({ ...preset, tuning: { ...preset.tuning } }));
  if (stored === null) return builtIns;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch (error) {
    throw new Error('Saved tuning presets are not valid JSON', { cause: error });
  }
  if (!Array.isArray(parsed) || !parsed.every(isTuningPreset)) {
    throw new Error('Saved tuning presets have an invalid format');
  }
  const presets = (parsed as StoredTuningPreset[]).map((preset) => ({
    ...preset,
    tuning: { ...defaultTuning(preset.mode), ...preset.tuning },
  }));
  if (new Set(presets.map(({ id }) => id)).size !== presets.length) {
    throw new Error('Saved tuning presets contain duplicate IDs');
  }
  return [...builtIns, ...presets];
}

export function persistTuningPresets(
  storage: Pick<Storage, 'setItem'>,
  presets: readonly TuningPreset[],
) {
  const storedPresets = presets
    .filter((preset) => !preset.readonly)
    .map((preset) => ({
      ...preset,
      tuning: Object.fromEntries(presetTuningKeys.map((key) => [key, preset.tuning[key]])),
    }));
  storage.setItem(tuningPresetsStorageKey, JSON.stringify(storedPresets));
}
