import { spinnerFrames } from './text-spinner';

const maxRows = 8;
const labelWidth = 18;
const spinnerMs = 80;

export interface DebugRow {
  /** Stops the row's clock and marks it with a checkmark. */
  done(): void;
}

export interface DebugLog {
  /** Appends a timed row; `footer` rows stay below the others and show no spinner while running. */
  row(label: string, footer?: boolean): DebugRow;
}

const off: DebugLog = { row: () => ({ done() {} }) };

/** A small on-screen log for `?debug=1`; does nothing, and adds no DOM, otherwise. */
export function createDebugLog(enabled: boolean): DebugLog {
  if (!enabled) return off;
  const panel = document.createElement('div');
  panel.className = 'debug-log';
  panel.setAttribute('aria-hidden', 'true');
  const list = document.createElement('div');
  const footers = document.createElement('div');
  panel.append(list, footers);
  document.body.append(panel);
  type Timed = {
    element: HTMLElement;
    label: string;
    footer: boolean;
    started: number;
    stopped?: number;
  };
  const running = new Set<Timed>();
  let frame = 0;
  const render = (row: Timed, now: number) => {
    const mark = row.footer
      ? ' '
      : row.stopped !== undefined
        ? '✓'
        : spinnerFrames[Math.floor(now / spinnerMs) % spinnerFrames.length];
    const seconds = (((row.stopped ?? now) - row.started) / 1000).toFixed(1);
    row.element.textContent = `${mark} ${row.label.padEnd(labelWidth)}${seconds.padStart(6)}s`;
  };
  const tick = () => {
    const now = performance.now();
    for (const row of running) render(row, now);
    frame = running.size ? requestAnimationFrame(tick) : 0;
  };
  return {
    row(label, footer = false) {
      const element = document.createElement('div');
      if (footer) {
        element.className = 'debug-log-total';
        footers.replaceChildren(element);
      } else {
        list.append(element);
        while (list.children.length > maxRows - 1) list.firstElementChild!.remove();
      }
      const row: Timed = {
        element,
        label: label[0].toUpperCase() + label.slice(1),
        footer,
        started: performance.now(),
      };
      running.add(row);
      render(row, row.started);
      if (!frame) frame = requestAnimationFrame(tick);
      return {
        done() {
          row.stopped = performance.now();
          running.delete(row);
          render(row, row.stopped);
        },
      };
    },
  };
}
