import './bot-tuning.css';
import type { DriveMode } from './drive-modes';
import { type DrivingTuning, type ConfigurationState } from './configuration-state';
import type { Store } from './store';
import { nextCustomPresetName, nextTuningPresetId, persistTuningPresets } from './tuning-presets';

type TuningControl = {
  key: keyof DrivingTuning;
  label: string;
  min: number;
  max: number;
  step: number;
  summary: string;
  hint: string;
};

const sections: { title: string; description: string; controls: TuningControl[] }[] = [
  {
    title: 'Power',
    description: 'Engine output',
    controls: [
      {
        key: 'horsepower',
        label: 'Horsepower',
        min: 100,
        max: 1000,
        step: 1,
        summary: 'Scales engine power and torque.',
        hint: 'Crank horsepower. Scales the power ceiling and torque curve together; wheel power is lower due to driveline losses.',
      },
    ],
  },
  {
    title: 'Steering',
    description: 'Response and available lock',
    controls: [
      {
        key: 'steeringRate',
        label: 'Steering rate',
        min: 0.8,
        max: 6,
        step: 0.1,
        summary: 'How quickly the wheels turn.',
        hint: 'Maximum wheel-angle change per second, identical for turn-in, counter-steering and unwind in both modes.',
      },
      {
        key: 'steeringScale',
        label: 'Steering angle',
        min: 0.4,
        max: 1.15,
        step: 0.01,
        summary: 'Maximum lock at low and high speed.',
        hint: 'Higher allows more steering and counter-steer lock. Excessive lock can scrub the front tires.',
      },
      {
        key: 'steeringExpo',
        label: 'Controller steering expo',
        min: 0,
        max: 1,
        step: 0.05,
        summary: 'Softens controller input near center.',
        hint: 'Softens the stick near center without reducing full lock. 0% is linear; 100% is cubic. Keyboard and camera sticks are unchanged.',
      },
    ],
  },
  {
    title: 'Tires',
    description: 'Front and rear balance',
    controls: [
      {
        key: 'frontGrip',
        label: 'Front peak grip',
        min: 0.7,
        max: 1.8,
        step: 0.05,
        summary: 'Higher resists front tire washout.',
        hint: 'Higher gives the front tires more traction before they wash out.',
      },
      {
        key: 'rearGrip',
        label: 'Rear peak grip',
        min: 0.7,
        max: 1.6,
        step: 0.05,
        summary: 'Higher makes power slides harder.',
        hint: 'Higher keeps the rear planted and makes power slides harder to initiate.',
      },
      {
        key: 'frontStiffness',
        label: 'Front cornering stiffness',
        min: 25000,
        max: 80000,
        step: 1000,
        summary: 'How quickly front cornering force builds.',
        hint: 'Higher builds front cornering force at smaller slip angles; it does not raise peak grip.',
      },
      {
        key: 'rearStiffness',
        label: 'Rear cornering stiffness',
        min: 25000,
        max: 80000,
        step: 1000,
        summary: 'How quickly rear cornering force builds.',
        hint: 'Higher builds rear cornering force sooner and can reduce initial rotation.',
      },
    ],
  },
];

const formatValue = (key: keyof DrivingTuning, value: number, tuning: DrivingTuning) =>
  key === 'steeringScale'
    ? `${((tuning.steeringLow * value * 180) / Math.PI).toFixed(1)} / ${((tuning.steeringHigh * value * 180) / Math.PI).toFixed(1)} deg`
    : key === 'horsepower'
      ? `${value.toFixed(0)} hp`
      : key === 'steeringExpo'
        ? `${Math.round(value * 100)}%`
        : key === 'steeringRate'
          ? `${((value * 180) / Math.PI).toFixed(0)} deg/s`
          : key.endsWith('Stiffness')
            ? `${(value / 1000).toFixed(0)} kN/rad`
            : `${value.toFixed(2)}x`;

export function createDrivingTuning(
  fieldset: HTMLFieldSetElement,
  store: Store<ConfigurationState>,
  onPresetChange: (mode: DriveMode, presetId: string | null) => void,
  reportError: (error: unknown) => void,
) {
  let mode: DriveMode = store.getState().driveMode;
  let tuning = store.getState().profiles[mode];
  const update = (patch: Partial<DrivingTuning>) => {
    const state = store.getState();
    if (
      Object.entries(patch).every(
        ([key, value]) => state.profiles[state.driveMode][key as keyof DrivingTuning] === value,
      )
    )
      return;
    const current = { ...state.profiles[state.driveMode], ...patch };
    const presetId = state.selectedTuningPresets[state.driveMode];
    const preset = state.tuningPresets.find(
      ({ id, mode }) => id === presetId && mode === state.driveMode,
    );
    const selectedPreset =
      preset && !preset.readonly
        ? { ...preset, tuning: current }
        : {
            id: nextTuningPresetId(state.driveMode, state.tuningPresets),
            name: nextCustomPresetName(state.driveMode, state.tuningPresets),
            mode: state.driveMode,
            tuning: current,
          };
    const tuningPresets =
      preset && !preset.readonly
        ? state.tuningPresets.map((entry) => (entry.id === preset.id ? selectedPreset : entry))
        : [...state.tuningPresets, selectedPreset];
    try {
      persistTuningPresets(localStorage, tuningPresets);
    } catch (error) {
      reportError(error);
    }
    store.update({
      profiles: {
        ...state.profiles,
        [state.driveMode]: current,
      },
      tuningPresets,
      selectedTuningPresets: {
        ...state.selectedTuningPresets,
        [state.driveMode]: selectedPreset.id,
      },
    });
    onPresetChange(state.driveMode, selectedPreset.id);
  };

  const refresh: (() => void)[] = [];
  for (const section of sections) {
    const group = document.createElement('section');
    const heading = document.createElement('div');
    const title = document.createElement('h3');
    const description = document.createElement('span');
    const controls = document.createElement('div');
    const sectionId = `tuning-${section.title.toLocaleLowerCase()}`;
    group.className = 'tuning-section';
    group.setAttribute('aria-labelledby', sectionId);
    heading.className = 'tuning-section-heading';
    title.id = sectionId;
    title.textContent = section.title;
    description.className = 'tuning-section-description';
    description.textContent = section.description;
    controls.className = `tuning-controls tuning-controls-${section.title.toLocaleLowerCase()}`;
    heading.append(title, description);

    for (const slider of section.controls) {
      const control = document.createElement('div');
      const label = document.createElement('label');
      const input = document.createElement('input');
      const header = document.createElement('span');
      const title = document.createElement('span');
      const output = document.createElement('output');
      const help = document.createElement('details');
      const summary = document.createElement('summary');
      const hint = document.createElement('p');
      const id = `drift-${slider.key}`;
      control.className = `tuning-control tuning-control-${slider.key}`;
      label.className = 'tuning-control-label';
      label.htmlFor = id;
      input.type = 'range';
      input.id = id;
      input.min = String(slider.min);
      input.max = String(slider.max);
      input.step = String(slider.step);
      title.textContent = slider.label;
      title.id = `${id}-title`;
      output.htmlFor = id;
      header.className = 'tuning-control-heading';
      header.append(title, output);
      input.setAttribute('aria-labelledby', title.id);
      help.className = 'tuning-help';
      summary.className = 'help-text';
      summary.textContent = slider.summary;
      hint.className = 'dialog-help';
      hint.textContent = slider.hint;
      help.append(summary, hint);

      const sync = () => {
        const value = tuning[slider.key];
        if (input.value !== String(value)) input.value = String(value);
        const percentage = ((value - slider.min) / (slider.max - slider.min)) * 100;
        input.style.setProperty('--value', `${percentage}%`);
        output.value = formatValue(slider.key, value, tuning);
        input.setAttribute('aria-valuetext', output.value);
      };
      input.addEventListener('input', () => {
        update({ [slider.key]: input.valueAsNumber });
      });
      sync();
      refresh.push(sync);
      label.append(header, input);
      control.append(label, help);
      controls.append(control);
    }

    group.append(heading, controls);
    fieldset.append(group);
  }
  return store.subscribe(
    (state) => {
      const next = state.profiles[state.driveMode];
      if (mode === state.driveMode && tuning === next) return;
      mode = state.driveMode;
      tuning = next;
      refresh.forEach((sync) => sync());
    },
    ['driveMode', 'profiles'],
  );
}
