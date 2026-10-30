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
        indicator.textContent = nextState === 'complete' ? '\u2713' : '';
        if (nextState === 'active') spinners.set(indicator, startTextSpinner(indicator));
      }
      item.dataset.state = nextState;
      item.setAttribute('aria-busy', String(nextState === 'active'));
      const label = item.querySelector<HTMLElement>('.build-step-label')!;
      const content = item.querySelector<HTMLElement>('.build-step-content')!;
      if (label.textContent !== item.dataset.label) label.textContent = item.dataset.label!;
      let bar = content.querySelector('progress');
      const tiles = detail?.match(/^Tiles (\d+)\/(\d+)(?:; tile \d+ \((\d+)\/(\d+)\))?$/);
      if (
        !bar &&
        (tiles ||
          ['terrain', 'scenery', 'network', 'canopy', 'corridor'].includes(item.dataset.step!))
      ) {
        bar = document.createElement('progress');
        bar.className = 'build-step-progress';
        bar.setAttribute('aria-label', item.dataset.label!);
        bar.max = 1;
        bar.value = 0;
        bar.setAttribute('aria-valuetext', '0 tiles complete');
        content.append(bar);
      }
      let retry = content.querySelector<HTMLElement>('.build-step-retry');
      if (bar && !retry) {
        retry = document.createElement('span');
        retry.className = 'build-step-retry';
        content.insertBefore(retry, bar);
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
      const retryText =
        !reset && nextState === 'active' && tiles?.[3] ? `(${tiles[3]}/${tiles[4]})` : '';
      if (retry && retry.textContent !== retryText) retry.textContent = retryText;
      if (reset || nextState === 'complete') item.removeAttribute('aria-description');
      else if (current && detail) item.setAttribute('aria-description', detail);
      item.setAttribute(
        'aria-label',
        `${label.textContent}: ${nextState === 'complete' ? 'completed' : nextState === 'active' ? 'in progress' : 'pending'}`,
      );
    }
  };
  return { update, stop };
}
