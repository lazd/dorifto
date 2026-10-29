import type { RoadBuildState, RoadBuildStep } from './course-builder-data';
import { startTextSpinner } from './text-spinner';

export function createBuildProgress(root: HTMLElement) {
  const spinners = new Map<HTMLElement, () => void>();
  const stop = () => {
    for (const cleanup of spinners.values()) cleanup();
    spinners.clear();
  };
  const update = (
    step: RoadBuildStep | 'complete',
    detail?: string,
    state: RoadBuildState = 'active',
  ) => {
    const reset = step === 'starting' && state === 'active';
    if (reset) stop();
    for (const item of root.querySelectorAll<HTMLLIElement>('li')) {
      const current = item.dataset.step === step;
      if (!reset && step !== 'complete' && !current) continue;
      const nextState = reset
        ? current
          ? 'active'
          : 'pending'
        : step === 'complete'
          ? 'complete'
          : state;
      const indicator = item.querySelector<HTMLElement>('.build-step-indicator')!;
      if (
        nextState !== item.dataset.state ||
        (nextState === 'active' && !spinners.has(indicator))
      ) {
        spinners.get(indicator)?.();
        spinners.delete(indicator);
        indicator.textContent =
          nextState === 'complete' ? '\u2713' : nextState === 'pending' ? '\u25cb' : '';
        if (nextState === 'active') spinners.set(indicator, startTextSpinner(indicator));
      }
      item.dataset.state = nextState;
      item.setAttribute('aria-busy', String(nextState === 'active'));
      const label = item.querySelector<HTMLElement>('.build-step-label')!;
      const content = item.querySelector<HTMLElement>('.build-step-content')!;
      let bar = content.querySelector('progress');
      const tiles = detail?.match(/^Tiles (\d+)\/(\d+)(?:; tile \d+ \((\d+)\/(\d+)\))?$/);
      if (
        !bar &&
        (tiles || ['terrain', 'scenery', 'network', 'corridor'].includes(item.dataset.step!))
      ) {
        bar = document.createElement('progress');
        bar.className = 'build-step-progress';
        bar.setAttribute('aria-label', item.dataset.label!);
        bar.max = 1;
        bar.value = 0;
        bar.setAttribute('aria-valuetext', '0 tiles complete');
        content.append(bar);
      }
      if (bar && reset) {
        bar.max = 1;
        bar.value = 0;
        bar.setAttribute('aria-valuetext', '0 tiles complete');
      }
      if (bar && tiles) {
        bar.max = Number(tiles[2]);
        bar.value = Number(tiles[1]);
        bar.setAttribute('aria-valuetext', `${tiles[1]} of ${tiles[2]} tiles complete`);
      }
      if (bar && nextState === 'complete') bar.value = bar.max;
      if (reset || detail !== undefined) {
        const status = tiles ? '' : detail;
        label.textContent =
          current && status ? `${item.dataset.label} ${status}` : item.dataset.label!;
        if (current && tiles?.[3]) {
          const retry = document.createElement('span');
          retry.className = 'build-step-retry';
          retry.textContent = `(${tiles[3]}/${tiles[4]})`;
          label.append(' ', retry);
        }
      }
      item.setAttribute(
        'aria-label',
        `${label.textContent}: ${nextState === 'complete' ? 'completed' : nextState === 'active' ? 'in progress' : 'pending'}`,
      );
    }
  };
  return { update, stop };
}
