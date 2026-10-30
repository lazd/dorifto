import { Tabs } from './tabs';
import type { ConfigurationState } from './configuration-state';
import type { Store } from './store';
import { treeSliders, validTreeSlider } from './tree-settings';
import './settings.css';

export function bindSettingsLayout() {
  const root = document.getElementById('settings-tabs');
  if (!root) throw new Error('Missing settings tabs');
  return new Tabs(root);
}

export function bindTreeSettings(
  configuration: Store<ConfigurationState>,
  reportError: (error: unknown) => void,
) {
  const root = document.getElementById('tree-settings');
  if (!root) throw new Error('Missing tree settings');
  const controls = treeSliders.map((control) => {
    const section = document.createElement('section');
    section.className = 'illustrated-setting';
    section.innerHTML = `
      <div class="field setting-range">
        <label for="${control.parameter}">${control.label}</label>
        <output for="${control.parameter}" class="setting-value"></output>
        <p id="${control.parameter}-description">${control.description}</p>
        <input id="${control.parameter}" type="range"
          min="${control.min}" max="${control.max}" step="${control.step}"
          aria-describedby="${control.parameter}-description">
      </div>`;
    const input = section.querySelector<HTMLInputElement>('input')!;
    const output = section.querySelector<HTMLOutputElement>('output')!;
    input.addEventListener('input', () => {
      const value = input.valueAsNumber;
      if (!validTreeSlider(control, value)) {
        reportError(new Error(`Invalid ${control.label}: ${input.value}`));
        return;
      }
      configuration.update({ [control.key]: value });
    });
    root.append(section);
    return { control, input, output };
  });
  const nearTrackSection = document.createElement('section');
  nearTrackSection.className = 'illustrated-setting';
  nearTrackSection.innerHTML = `
    <div class="field">
      <label for="tree-near-track-only">Quality trees near track only</label>
      <p id="tree-near-track-only-description">
        Only trees and shrubs within 20 m of the track edge can use meshes. All others stay baked.
      </p>
      <input id="tree-near-track-only" type="checkbox" class="switch" role="switch"
        aria-describedby="tree-near-track-only-description">
    </div>`;
  const nearTrack = nearTrackSection.querySelector<HTMLInputElement>('input')!;
  nearTrack.addEventListener('change', () => {
    configuration.update({ treeNearTrackOnly: nearTrack.checked });
  });
  root.append(nearTrackSection);
  const section = document.createElement('section');
  section.className = 'illustrated-setting';
  section.innerHTML = `
    <div class="field">
      <label for="tree-transition">Smooth transitions</label>
      <p id="tree-transition-description">Blend between baked trees and meshes.</p>
      <input id="tree-transition" type="checkbox" class="switch" role="switch"
        aria-describedby="tree-transition-description">
    </div>`;
  const smooth = section.querySelector<HTMLInputElement>('input')!;
  smooth.addEventListener('change', () => {
    configuration.update({ treeSmoothTransitions: smooth.checked });
  });
  root.append(section);
  configuration.subscribe(
    (state) => {
      const disabled = state.treeDrawDistance === 0;
      for (const { control, input, output } of controls) {
        const value = state[control.key];
        input.value = String(value);
        input.disabled =
          control.key !== 'treeDrawDistance' &&
          (disabled || (control.key === 'treeBakeDistance' && state.treeQuality === 1));
        const formatted =
          control.key === 'treeQuality'
            ? ['Low', 'Medium', 'High'][value - 1]
            : control.key === 'treeDensity'
              ? String(value)
              : value === 0
                ? control.key === 'treeDrawDistance'
                  ? 'Off'
                  : 'Meshes only'
                : value >= 1000
                  ? `${value / 1000} km`
                  : `${value} m`;
        output.value = formatted;
        input.setAttribute('aria-valuetext', formatted);
      }
      smooth.checked = state.treeSmoothTransitions;
      smooth.disabled = disabled || state.treeQuality === 1 || state.treeBakeDistance === 0;
      nearTrack.checked = state.treeNearTrackOnly;
      nearTrack.disabled = disabled || state.treeQuality === 1;
    },
    [...treeSliders.map(({ key }) => key), 'treeSmoothTransitions', 'treeNearTrackOnly'],
  );
}
