import { driveModes, type DriveMode } from './drive-modes';
import { type DrivingTuning, type GameState } from './game-state';
import type { Store } from './store';
import { nextCustomPresetName, nextTuningPresetId, persistTuningPresets } from './tuning-presets';

const sliders: {
  key: keyof DrivingTuning; label: string; min: number; max: number; step: number; hint: string;
}[] = [
  { key: 'horsepower', label: 'Engine horsepower', min: 100, max: 1000, step: 1,
    hint: 'Crank horsepower. Scales the power ceiling and torque curve together; wheel power is lower due to driveline losses.' },
  { key: 'steeringExpo', label: 'Controller steering expo', min: 0, max: 1, step: 0.05,
    hint: 'Softens the stick near center without reducing full lock. 0% is linear; 100% is cubic. Keyboard and camera sticks are unchanged.' },
  { key: 'steeringRate', label: 'Steering rate', min: 0.8, max: 6, step: 0.1,
    hint: 'Maximum wheel-angle change per second, identical for turn-in, counter-steering and unwind in both modes.' },
  { key: 'steeringScale', label: 'Steering angle (low / high speed)', min: 0.4, max: 1.15, step: 0.01,
    hint: 'Higher allows more steering and counter-steer lock. Excessive lock can scrub the front tires.' },
  { key: 'frontGrip', label: 'Front peak grip', min: 0.7, max: 1.8, step: 0.05,
    hint: 'Higher gives the front tires more traction before they wash out.' },
  { key: 'rearGrip', label: 'Rear peak grip', min: 0.7, max: 1.6, step: 0.05,
    hint: 'Higher keeps the rear planted and makes power slides harder to initiate.' },
  { key: 'frontStiffness', label: 'Front cornering stiffness', min: 25000, max: 80000, step: 1000,
    hint: 'Higher builds front cornering force at smaller slip angles; it does not raise peak grip.' },
  { key: 'rearStiffness', label: 'Rear cornering stiffness', min: 25000, max: 80000, step: 1000,
    hint: 'Higher builds rear cornering force sooner and can reduce initial rotation.' },
];

export function createDrivingTuning(
  fieldset: HTMLFieldSetElement,
  store: Store<GameState>,
  onPresetChange: (mode: DriveMode, presetId: string | null) => void,
  reportError: (error: unknown) => void,
) {
  let mode: DriveMode = store.getState().driveMode;
  let tuning = store.getState().profiles[mode];
  const update = (patch: Partial<DrivingTuning>) => {
    const state = store.getState();
    if (Object.entries(patch).every(([key, value]) =>
      state.profiles[state.driveMode][key as keyof DrivingTuning] === value)) return;
    const current = { ...state.profiles[state.driveMode], ...patch };
    const presetId = state.selectedTuningPresets[state.driveMode];
    const preset = state.tuningPresets.find(({ id, mode }) => id === presetId && mode === state.driveMode);
    const selectedPreset = preset && !preset.readonly
      ? { ...preset, tuning: current }
      : {
        id: nextTuningPresetId(state.driveMode, state.tuningPresets),
        name: nextCustomPresetName(state.driveMode, state.tuningPresets),
        mode: state.driveMode,
        tuning: current,
      };
    const tuningPresets = preset && !preset.readonly
      ? state.tuningPresets.map((entry) => entry.id === preset.id ? selectedPreset : entry)
      : [...state.tuningPresets, selectedPreset];
    try {
      persistTuningPresets(localStorage, tuningPresets);
    } catch (error) {
      reportError(error);
    }
    store.update({ profiles: {
      ...state.profiles,
      [state.driveMode]: current,
    }, tuningPresets, selectedTuningPresets: {
      ...state.selectedTuningPresets,
      [state.driveMode]: selectedPreset.id,
    } });
    onPresetChange(state.driveMode, selectedPreset.id);
  };
  const refresh: (() => void)[] = [];
  for (const slider of sliders) {
    const label = document.createElement('label');
    label.className = 'slider-control';
    const title = document.createElement('span');
    title.textContent = slider.label;
    const output = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `drift-${slider.key}`;
    label.htmlFor = input.id;
    title.id = `${input.id}-title`;
    input.setAttribute('aria-labelledby', title.id);
    input.min = String(slider.min);
    input.max = String(slider.max);
    input.step = String(slider.step);
    output.htmlFor = input.id;
    const hint = document.createElement('small');
    hint.id = `${input.id}-hint`;
    hint.textContent = slider.hint;
    input.setAttribute('aria-describedby', hint.id);
    const sync = () => {
      const value = tuning[slider.key];
      if (input.value !== String(value)) input.value = String(value);
      output.value = slider.key === 'steeringScale'
        ? `${(driveModes[mode].steeringLow * value * 180 / Math.PI).toFixed(1)} / ${(driveModes[mode].steeringHigh * value * 180 / Math.PI).toFixed(1)} deg`
        : slider.key === 'horsepower' ? `${value.toFixed(0)} hp`
        : slider.key === 'steeringExpo' ? `${Math.round(value * 100)}%`
        : slider.key === 'steeringRate' ? `${(value * 180 / Math.PI).toFixed(0)} deg/s`
        : slider.key.endsWith('Stiffness') ? `${(value / 1000).toFixed(0)} kN/rad`
        : `${value.toFixed(2)}x`;
      input.setAttribute('aria-valuetext', output.value);
    };
    input.addEventListener('input', () => {
      update({ [slider.key]: input.valueAsNumber });
    });
    sync();
    refresh.push(sync);
    label.append(title, output, input, hint);
    fieldset.append(label);
  }
  return store.subscribe((state) => {
    const next = state.profiles[state.driveMode];
    if (mode === state.driveMode && tuning === next) return;
    mode = state.driveMode;
    tuning = next;
    refresh.forEach((sync) => sync());
  });
}
