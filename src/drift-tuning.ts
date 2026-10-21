import { driveModes } from './drive-modes';

const defaults = {
  frontGrip: driveModes.drift.frontGrip,
  rearGrip: 1,
  frontStiffness: driveModes.drift.frontStiffness,
  rearStiffness: driveModes.drift.rearStiffness,
  rearSlidingGrip: driveModes.drift.rearSlidingGrip,
  steeringScale: 0.93,
  steeringExpo: 0.6,
  steeringRate: 2.2,
};

type DriftTuning = { [Key in keyof typeof defaults]: number };

const sliders: {
  key: keyof DriftTuning; label: string; min: number; max: number; step: number; hint: string;
}[] = [
  { key: 'steeringExpo', label: 'Controller steering expo', min: 0, max: 1, step: 0.05,
    hint: 'Softens the stick near center without reducing full lock. 0% is linear; 100% is cubic. Keyboard and camera sticks are unchanged.' },
  { key: 'steeringRate', label: 'Steering rate', min: 0.8, max: 6, step: 0.1,
    hint: 'Maximum turn-in speed. Lower is gentler; counter-steering and unwinding are 60% faster. Applies to keyboard, controller and assist.' },
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
  { key: 'rearSlidingGrip', label: 'Rear sliding grip retained', min: 0.4, max: 1, step: 0.01,
    hint: 'Higher retains more traction after breakaway, making slides less slippery but resisting wheelspin.' },
];

export function createDriftTuning(fieldset: HTMLFieldSetElement, resetButton: HTMLButtonElement) {
  const tuning: DriftTuning & { steeringAssist: boolean } = { ...defaults, steeringAssist: true };
  const refresh: (() => void)[] = [];
  const assistLabel = document.createElement('label');
  assistLabel.className = 'assist-toggle';
  const assist = document.createElement('input');
  assist.type = 'checkbox';
  assist.id = 'drift-steering-assist';
  assist.checked = tuning.steeringAssist;
  const assistTitle = document.createElement('span');
  assistTitle.id = 'drift-steering-assist-title';
  assistTitle.textContent = 'Counter-steering assist';
  assist.setAttribute('aria-labelledby', assistTitle.id);
  const assistHint = document.createElement('small');
  assistHint.id = 'drift-steering-assist-hint';
  assistHint.textContent = 'Helps front wheels follow their travel direction during forward slides. Your steering still adjusts the cornering angle. No extra force or yaw assist.';
  assist.setAttribute('aria-describedby', assistHint.id);
  assist.addEventListener('change', () => { tuning.steeringAssist = assist.checked; });
  assistLabel.append(assist, assistTitle, assistHint);
  fieldset.append(assistLabel);
  for (const slider of sliders) {
    const label = document.createElement('label');
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
      input.value = String(value);
      output.value = slider.key === 'steeringScale'
        ? `${(driveModes.drift.steeringLow * value * 180 / Math.PI).toFixed(1)} / ${(driveModes.drift.steeringHigh * value * 180 / Math.PI).toFixed(1)} deg`
        : slider.key === 'steeringExpo' ? `${Math.round(value * 100)}%`
        : slider.key === 'steeringRate' ? `${(value * 180 / Math.PI).toFixed(0)} deg/s`
        : slider.key.endsWith('Stiffness') ? `${(value / 1000).toFixed(0)} kN/rad`
        : slider.key === 'rearSlidingGrip' ? `${Math.round(value * 100)}%` : `${value.toFixed(2)}x`;
      input.setAttribute('aria-valuetext', output.value);
    };
    input.addEventListener('input', () => {
      tuning[slider.key] = input.valueAsNumber;
      sync();
    });
    sync();
    refresh.push(sync);
    label.append(title, output, input, hint);
    fieldset.append(label);
  }
  resetButton.addEventListener('click', () => {
    Object.assign(tuning, defaults);
    tuning.steeringAssist = assist.checked = true;
    refresh.forEach((sync) => sync());
    resetButton.blur();
  });
  return tuning;
}
