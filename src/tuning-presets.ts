import { isDriveMode, type DriveMode } from './drive-modes';
import type { DrivingTuning } from './game-state';

export interface TuningPreset {
  id: string;
  name: string;
  mode: DriveMode;
  tuning: DrivingTuning;
  readonly?: boolean;
}

export const tuningPresetsStorageKey = 'dorifto:tuning-presets';

const tuningKeys: (keyof DrivingTuning)[] = [
  'horsepower', 'steeringExpo', 'steeringRate', 'steeringScale',
  'frontGrip', 'rearGrip', 'frontStiffness', 'rearStiffness',
];

export function nextTuningPresetId(mode: DriveMode, presets: readonly TuningPreset[]) {
  let id = `${mode}-${Math.random().toString(36).slice(2, 8)}`;
  while (presets.some((preset) => preset.id === id)) {
    id = `${mode}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return id;
}

export function nextCustomPresetName(mode: DriveMode, presets: readonly TuningPreset[]) {
  const names = new Set(presets.filter((preset) => preset.mode === mode)
    .map((preset) => preset.name.toLocaleLowerCase()));
  const base = 'Custom Preset';
  if (!names.has(base.toLocaleLowerCase())) return base;
  for (let suffix = 2; ; suffix++) {
    const name = `${base} ${suffix}`;
    if (!names.has(name.toLocaleLowerCase())) return name;
  }
}

function isTuning(value: unknown): value is DrivingTuning {
  if (typeof value !== 'object' || value === null) return false;
  const tuning = value as Record<string, unknown>;
  return Object.keys(tuning).length === tuningKeys.length
    && tuningKeys.every((key) => typeof tuning[key] === 'number' && Number.isFinite(tuning[key]));
}

function isTuningPreset(value: unknown): value is TuningPreset {
  if (typeof value !== 'object' || value === null) return false;
  const preset = value as Record<string, unknown>;
  return typeof preset.id === 'string' && preset.id.length > 0
    && typeof preset.name === 'string' && preset.name.trim().length > 0
    && typeof preset.mode === 'string' && isDriveMode(preset.mode)
    && (preset.readonly === undefined || typeof preset.readonly === 'boolean')
    && isTuning(preset.tuning);
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
  const presets = parsed as TuningPreset[];
  if (new Set(presets.map(({ id }) => id)).size !== presets.length) {
    throw new Error('Saved tuning presets contain duplicate IDs');
  }
  return [...builtIns, ...presets.map((preset) => ({ ...preset, tuning: { ...preset.tuning } }))];
}

export function persistTuningPresets(storage: Pick<Storage, 'setItem'>, presets: readonly TuningPreset[]) {
  storage.setItem(tuningPresetsStorageKey,
    JSON.stringify(presets.filter((preset) => !preset.readonly)));
}
