import type * as THREE from 'three';
import { setVegetationMode, setVegetationTransition } from './vegetation';

export function installTreeStylePreview(scene: THREE.Scene, reportError: (error: unknown) => void) {
  const previous = document.querySelector<HTMLElement>('#tree-style-preview');
  if (previous) {
    previous.dispatchEvent(new Event('coursechange'));
    return previous;
  }
  const detailSection = document.querySelector('#vegetation-detail')?.closest('section');
  if (!detailSection) throw new Error('Vegetation settings are not available');
  const field = document.createElement('div');
  field.className = 'field';
  field.id = 'tree-style-preview';
  field.innerHTML = `
    <label for="tree-style">Developer vegetation</label>
    <p id="tree-style-description">Baked pine, oak, aspen and three bush styles.
      Performance uses shorter mesh ranges and fewer bushes; Quality draws more detail.
      Ultra uses 3D meshes throughout, with no baked distant plants.</p>
    <select id="tree-style" aria-describedby="tree-style-description">
      <option value="performance">Performance</option>
      <option value="quality">Quality</option>
      <option value="ultra">Ultra</option>
    </select>
    <label for="tree-transition">Smooth transitions</label>
    <input id="tree-transition" class="switch" role="switch" type="checkbox">
    <output id="tree-style-budget" role="status"></output>`;
  const section = document.createElement('section');
  section.className = 'illustrated-setting';
  section.append(field);
  detailSection.after(section);
  const select = field.querySelector<HTMLSelectElement>('#tree-style')!;
  const status = field.querySelector<HTMLOutputElement>('#tree-style-budget')!;
  const transition = field.querySelector<HTMLInputElement>('#tree-transition')!;
  const initial = new URL(location.href).searchParams.get('tree-style');
  if (initial === 'performance' || initial === 'quality' || initial === 'ultra')
    select.value = initial;
  transition.checked = new URL(location.href).searchParams.get('tree-transition') === 'on';
  function apply() {
    try {
      const mode = select.value;
      if (mode !== 'performance' && mode !== 'quality' && mode !== 'ultra')
        throw new Error(`Unknown vegetation mode: ${mode}`);
      setVegetationMode(scene, mode);
      setVegetationTransition(scene, transition.checked);
      transition.disabled = mode === 'ultra';
      const url = new URL(location.href);
      url.searchParams.set('tree-style', mode);
      url.searchParams.set('tree-transition', transition.checked ? 'on' : 'off');
      history.replaceState(null, '', url);
      status.textContent =
        mode === 'ultra'
          ? '3D meshes only. Higher GPU cost; no baked-to-mesh transition.'
          : 'Shared near meshes; four-triangle distant plants. No runtime generation.';
    } catch (error) {
      status.textContent = 'Unable to apply vegetation mode.';
      reportError(error);
    }
  }
  select.addEventListener('change', apply);
  transition.addEventListener('change', apply);
  field.addEventListener('coursechange', apply);
  apply();
  return field;
}
