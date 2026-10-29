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
      const label = item.lastChild!;
      if (reset || detail !== undefined)
        label.textContent =
          current && detail ? `${item.dataset.label} ${detail}` : item.dataset.label!;
      item.setAttribute(
        'aria-label',
        `${label.textContent}: ${nextState === 'complete' ? 'completed' : nextState === 'active' ? 'in progress' : 'pending'}`,
      );
    }
  };
  return { update, stop };
}
