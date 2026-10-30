import type * as THREE from 'three';
import { setVegetationMode } from './vegetation';

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
      Performance uses shorter mesh ranges and fewer bushes; Quality draws more detail.</p>
    <select id="tree-style" aria-describedby="tree-style-description">
      <option value="performance">Performance</option>
      <option value="quality">Quality</option>
    </select>
    <output id="tree-style-budget" role="status"></output>`;
  const section = document.createElement('section');
  section.className = 'illustrated-setting';
  section.append(field);
  detailSection.after(section);
  const select = field.querySelector<HTMLSelectElement>('#tree-style')!;
  const status = field.querySelector<HTMLOutputElement>('#tree-style-budget')!;
  const initial = new URL(location.href).searchParams.get('tree-style');
  if (initial === 'performance' || initial === 'quality') select.value = initial;
  function apply() {
    try {
      const mode = select.value;
      if (mode !== 'performance' && mode !== 'quality')
        throw new Error(`Unknown vegetation mode: ${mode}`);
      setVegetationMode(scene, mode);
      const url = new URL(location.href);
      url.searchParams.set('tree-style', mode);
      history.replaceState(null, '', url);
      status.textContent =
        'Shared near meshes; four-triangle distant plants. No runtime generation.';
    } catch (error) {
      status.textContent = 'Unable to apply vegetation mode.';
      reportError(error);
    }
  }
  select.addEventListener('change', apply);
  field.addEventListener('coursechange', apply);
  apply();
  return field;
}
