export interface TreeSettings {
  treeDrawDistance: number;
  treeDensity: number;
  treeQuality: number;
  treeBakeDistance: number;
  treeSmoothTransitions: boolean;
  treeNearTrackOnly: boolean;
}

export const treeSettingsStorageKey = 'dorifto:tree-settings.v1';

export const treeSliders = [
  {
    key: 'treeDrawDistance',
    parameter: 'tree-draw-distance',
    label: 'Tree draw distance',
    description: 'Maximum distance for trees and shrubs. Set to 0 to disable them.',
    min: 0,
    max: 5000,
    step: 50,
    defaultValue: 500,
  },
  {
    key: 'treeDensity',
    parameter: 'tree-density',
    label: 'Tree density',
    description: 'Higher values render more trees and shrubs.',
    min: 1,
    max: 5,
    step: 1,
    defaultValue: 3,
  },
  {
    key: 'treeQuality',
    parameter: 'tree-quality',
    label: 'Tree quality',
    description: 'Low: baked only. Medium: basic meshes. High: detailed meshes.',
    min: 1,
    max: 3,
    step: 1,
    defaultValue: 2,
  },
  {
    key: 'treeBakeDistance',
    parameter: 'tree-bake-distance',
    label: 'Bake distance',
    description:
      'Use meshes within this distance and baked trees beyond it. Set to 0 for meshes only.',
    min: 0,
    max: 5000,
    step: 50,
    defaultValue: 250,
  },
] as const;

export const defaultTreeSettings: Readonly<TreeSettings> = {
  treeDrawDistance: treeSliders[0].defaultValue,
  treeDensity: treeSliders[1].defaultValue,
  treeQuality: treeSliders[2].defaultValue,
  treeBakeDistance: treeSliders[3].defaultValue,
  treeSmoothTransitions: true,
  treeNearTrackOnly: true,
};

export function readStoredTreeSettings(storage: Storage): TreeSettings {
  const value = storage.getItem(treeSettingsStorageKey);
  if (value === null) return { ...defaultTreeSettings };
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null)
    throw new Error('Invalid stored tree settings');
  const stored = parsed as Record<string, unknown>;
  const settings = { ...defaultTreeSettings };
  for (const control of treeSliders) {
    const value = stored[control.key];
    if (typeof value !== 'number' || !validTreeSlider(control, value))
      throw new Error(`Invalid stored ${control.key}: ${String(value)}`);
    settings[control.key] = value;
  }
  for (const key of ['treeSmoothTransitions', 'treeNearTrackOnly'] as const) {
    const value = stored[key];
    if (typeof value !== 'boolean') throw new Error(`Invalid stored ${key}: ${String(value)}`);
    settings[key] = value;
  }
  return settings;
}

export function validTreeSlider(control: (typeof treeSliders)[number], value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= control.min &&
    value <= control.max &&
    (value - control.min) % control.step === 0
  );
}

export function readTreeSettings(
  params: URLSearchParams,
  base: Readonly<TreeSettings> = defaultTreeSettings,
): TreeSettings {
  const settings = { ...base };
  // Keep shared links using the former vegetation controls useful.
  const detail = params.get('vegetation-detail');
  if (detail !== null && detail !== 'low' && detail !== 'medium' && detail !== 'high')
    throw new Error(`Invalid vegetation-detail: ${detail}`);
  if (detail === 'low') {
    settings.treeQuality = 1;
    settings.treeDensity = 2;
  } else if (detail === 'high') settings.treeDensity = 5;
  const style = params.get('tree-style');
  if (style !== null && style !== 'performance' && style !== 'quality' && style !== 'ultra')
    throw new Error(`Invalid tree-style: ${style}`);
  if (style === 'performance') {
    settings.treeQuality = 2;
    settings.treeDrawDistance = 300;
  } else if (style === 'ultra') {
    settings.treeQuality = 3;
    settings.treeBakeDistance = 0;
  }
  const vegetation = params.get('vegetation');
  if (vegetation !== null && vegetation !== 'on' && vegetation !== 'off')
    throw new Error(`Invalid vegetation: ${vegetation}`);
  if (vegetation === 'off') settings.treeDrawDistance = 0;
  const transition = params.get('tree-transition');
  if (transition !== null && transition !== 'on' && transition !== 'off')
    throw new Error(`Invalid tree-transition: ${transition}`);
  if (transition !== null) settings.treeSmoothTransitions = transition !== 'off';
  const nearTrack = params.get('tree-near-track-only');
  if (nearTrack !== null && nearTrack !== 'on' && nearTrack !== 'off')
    throw new Error(`Invalid tree-near-track-only: ${nearTrack}`);
  if (nearTrack !== null) settings.treeNearTrackOnly = nearTrack !== 'off';
  for (const control of treeSliders) {
    const raw = params.get(control.parameter);
    if (raw === null) continue;
    const value = Number(raw);
    if (raw.trim() === '' || !validTreeSlider(control, value))
      throw new Error(`Invalid ${control.parameter}: ${raw}`);
    settings[control.key] = value;
  }
  return settings;
}
