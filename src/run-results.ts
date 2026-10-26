import { RunRecording } from './lap-recording';
import { formatLapTime } from './laps';
import type { ConfigurationState } from './configuration-state';
import {
  raceModes,
  validForMode,
  type RaceMode,
  type RaceOptions,
  type LapValidity,
} from './race-rules';
import type { RaceStanding } from './race-standings';
import { speedInUnit } from './speed-units';
import { bindDialogBackdrop, element } from './ui';
import './run-results.css';

function textNode(tag: string, text: string, className?: string) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function setText(node: HTMLElement, text: string) {
  if (node.textContent !== text) node.textContent = text;
}

export function mustardResult(validity: LapValidity) {
  if (validity.mustard === null) return { text: '—', status: 'unknown' };
  if (validity.mustardCrossed ?? !validity.mustard) return { text: 'Crossed', status: 'crossed' };
  if (validity.mustardTouched) return { text: 'Tasted', status: 'tasted' };
  return { text: 'Avoided', status: 'avoided' };
}

export function mayoResult(validity: LapValidity) {
  if (!validity.trackLimits) return { text: 'Exceeded', status: 'exceeded' };
  if (validity.mayoTouched) return { text: 'Tasted', status: 'tasted' };
  return { text: 'Avoided', status: 'avoided' };
}

export function recordOutcome(best: number | null, previous: number | null) {
  if (best === null)
    return {
      badge: '',
      description:
        previous === null
          ? 'No record for this mode yet.'
          : `Track record: ${formatLapTime(previous)} · No valid lap`,
    };
  if (previous === null)
    return { badge: 'New record', description: 'First track record for this mode' };
  if (best < previous)
    return {
      badge: 'New record',
      description: `${(previous - best).toFixed(3)}s faster than the previous record (${formatLapTime(previous)})`,
    };
  if (best === previous)
    return {
      badge: 'Record tied',
      description: `Track record: ${formatLapTime(previous)}`,
    };
  return {
    badge: '',
    description: `Track record: ${formatLapTime(previous)} · ${(best - previous).toFixed(3)}s off`,
  };
}

export function resultStanding(standing: RaceStanding, leaderTime?: number) {
  const status = standing.retired
    ? 'DNF'
    : standing.disqualified
      ? 'DSQ'
      : standing.finished
        ? 'Finished'
        : 'Racing';
  const time = standing.finishTime;
  const timing =
    time !== undefined
      ? leaderTime !== undefined && time > leaderTime && !standing.disqualified
        ? `+${(time - leaderTime).toFixed(3)}s`
        : formatLapTime(time)
      : standing.retired
        ? '—'
        : standing.lapsBehind
          ? `+${standing.lapsBehind} lap${standing.lapsBehind === 1 ? '' : 's'}`
          : standing.gap === null
            ? '—'
            : `+${standing.gap.toFixed(1)}s`;
  return { status, timing };
}

export function raceOutcome(
  completed: boolean,
  qualified: boolean,
  standings: readonly RaceStanding[],
  entrant = 0,
) {
  if (!completed) return '🔴 DNF';
  if (!qualified) return '❌ Disqualified';
  const winner = standings.find(
    (standing) => standing.finished && !standing.disqualified && !standing.retired,
  );
  return winner?.entrant === entrant ? '🏆 Won' : '🏁 Finished';
}

export function createRunResults(actions: {
  restart(): void;
  replay(recording: RunRecording): void;
  speedUnit(): ConfigurationState['speedUnit'];
}) {
  const dialog = element<HTMLDialogElement>('#run-results');
  let run: RunRecording | null = null;
  let record: RunRecording | null = null;
  let previousStandings: readonly RaceStanding[] | undefined;
  let previousRoster: readonly { name: string; color: string }[] | undefined;
  let previousFinished: boolean | undefined;
  let runCompleted = false;
  let runQualified = false;
  let raceMode: RaceMode = 'track-limits';
  let selected = 0;
  let renderDetails: ((recording: RunRecording) => void) | undefined;
  let renderedLapKey = '';
  let metricValues: HTMLElement[] = [];
  function selectDriver(index: number) {
    selected = index;
    rows.forEach(({ row, button }, i) => {
      row.classList.toggle('is-selected', i === selected);
      button.setAttribute('aria-pressed', String(i === selected));
    });
    element('#run-results-driver').setAttribute('aria-labelledby', `run-results-driver-${index}`);
    const recording = index === 0 ? run : run?.field[index - 1];
    if (recording) renderDetails?.(recording);
  }
  let rows: {
    row: HTMLTableRowElement;
    button: HTMLButtonElement;
    position: HTMLElement;
    timing: HTMLElement;
    bestLap: HTMLElement;
    status: HTMLElement;
  }[] = [];
  const notify = () => document.dispatchEvent(new Event('driving-ui-change'));
  const close = () => {
    dialog.close();
    notify();
  };
  element<HTMLFormElement>('#run-results-dialog-close').addEventListener('submit', (event) => {
    event.preventDefault();
    close();
  });
  bindDialogBackdrop(dialog, close);
  element('#run-results-restart').addEventListener('click', actions.restart);
  element('#run-results-replay').addEventListener('click', () => {
    if (run) actions.replay(run);
  });
  element('#run-results-record-replay').addEventListener('click', () => {
    if (record) actions.replay(record);
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  return {
    get open() {
      return dialog.open;
    },
    close,
    updateStandings(
      standings: readonly RaceStanding[],
      entrants: readonly { name: string; color: string }[],
      finished: boolean,
      currentRecord: RunRecording | null = record,
    ) {
      record = currentRecord;
      if (
        !dialog.open ||
        (standings === previousStandings &&
          entrants === previousRoster &&
          finished === previousFinished)
      )
        return;
      previousStandings = standings;
      previousFinished = finished;
      setText(element('#run-results-restart'), finished ? 'Race Again →' : 'Restart Race →');
      setText(element('#run-results-title'), raceOutcome(runCompleted, runQualified, standings));
      const body = element('#run-results-standings');
      if (entrants !== previousRoster) {
        previousRoster = entrants;
        rows = entrants.map(({ name, color }, index) => {
          const row = document.createElement('tr');
          const position = textNode('td', '—');
          const driver = document.createElement('td');
          const label = document.createElement('button');
          label.type = 'button';
          label.className = 'results-driver results-driver-select';
          label.id = `run-results-driver-${index}`;
          label.setAttribute('aria-controls', 'run-results-driver');
          label.addEventListener('click', () => selectDriver(index));
          row.addEventListener('click', (event) => {
            if (!(event.target instanceof Element) || !event.target.closest('button'))
              selectDriver(index);
          });
          const marker = textNode('span', '', 'entrant-color');
          marker.style.setProperty('--entrant-color', color);
          marker.setAttribute('aria-hidden', 'true');
          label.append(marker, textNode('span', name));
          driver.append(label);
          const timing = textNode('td', '—');
          const bestLap = textNode('td', '—');
          const status = textNode('td', 'Waiting');
          row.append(position, driver, timing, bestLap, status);
          return { row, button: label, position, timing, bestLap, status };
        });
        body.replaceChildren(...rows.map(({ row }) => row));
        selectDriver(selected);
      }
      const leaderTime = standings.find(
        (standing) => standing.finished && !standing.disqualified && !standing.retired,
      )?.finishTime;
      standings.forEach((standing, index) => {
        const { row, position, timing, bestLap, status } = rows[standing.entrant];
        const formatted = resultStanding(standing, leaderTime);
        const entrantRecording = standing.entrant === 0 ? run : run?.field[standing.entrant - 1];
        const entrantBestLap = entrantRecording?.bestLapForMode(raceMode) ?? null;
        setText(position, standing.retired || standing.disqualified ? '—' : String(index + 1));
        setText(
          timing,
          index === 0 && !standing.finished && !standing.retired ? 'Leader' : formatted.timing,
        );
        setText(
          bestLap,
          entrantBestLap === null || !entrantRecording
            ? '—'
            : formatLapTime(entrantRecording.lapTimes[entrantBestLap]),
        );
        setText(status, formatted.status);
        if (body.children[index] !== row) body.insertBefore(row, body.children[index] ?? null);
      });
      const done = standings.filter(({ finished }) => finished).length;
      setText(
        element('#run-results-race-status'),
        finished ? 'Final standings' : `${done}/${entrants.length} finished · Live`,
      );
      const recording = selected === 0 ? run : run?.field[selected - 1];
      if (recording) renderDetails?.(recording);
    },
    show(
      recording: RunRecording,
      options: RaceOptions,
      recordLap: RunRecording | null,
      completed: boolean,
      courseName: string,
      previousRecordTime: number | null,
      selectedDriver = 0,
    ) {
      run = recording;
      record = recordLap;
      raceMode = options.mode;
      setText(
        element('#run-results-restart'),
        recording.finished || recording.retired ? 'Race Again →' : 'Restart Race →',
      );
      const valid = recording.lapValidity.filter((lap) => validForMode(lap, options.mode)).length;
      runCompleted = completed;
      runQualified = valid >= options.laps;
      selected = selectedDriver;
      renderedLapKey = '';
      metricValues = [];
      element('#run-results-title').textContent = raceOutcome(completed, runQualified, []);
      element('#run-results-course').textContent = courseName;
      element('#run-results-mode').textContent =
        `${options.laps} lap${options.laps === 1 ? '' : 's'} · ${raceModes[options.mode].name}`;
      renderDetails = (recording) => {
        const qualified =
          recording.lapValidity.filter((lap) => validForMode(lap, options.mode)).length >=
          options.laps;
        const completed = recording.finished || (selected === 0 && runCompleted);
        setText(
          element('#run-results-title'),
          !completed && !recording.retired
            ? 'Racing'
            : raceOutcome(completed, qualified, previousStandings ?? [], selected),
        );
        const stats = recording.statistics;
        const speedUnit = actions.speedUnit();
        const speedUnitLabel = speedUnit === 'kmh' ? 'km/h' : 'MPH';
        const summary = element('#run-results-summary');
        const metrics = [
          ['Top speed', speedInUnit(stats.maxSpeed, speedUnit).toFixed(1), speedUnitLabel],
          [
            'Avg speed',
            speedInUnit(stats.time ? stats.distance / stats.time : 0, speedUnit).toFixed(1),
            speedUnitLabel,
          ],
          ['Drift time', stats.driftTime?.toFixed(1) ?? '—', 's'],
          ['Cones hit', stats.conesHit?.toString() ?? '—', ''],
          ['Car contacts', stats.carContacts?.toString() ?? '—', ''],
          [
            'Time in 1st',
            stats.timeInFirst === undefined
              ? '—'
              : (stats.time ? (stats.timeInFirst / stats.time) * 100 : 0).toFixed(1),
            '%',
          ],
        ];
        if (!metricValues.length) {
          summary.replaceChildren();
          for (const [label, , unit] of metrics) {
            const row = document.createElement('div');
            const valueNode = textNode('dd', '');
            const value = textNode('span', '');
            metricValues.push(value);
            valueNode.append(value, textNode('small', unit ? ` ${unit}` : ''));
            row.append(textNode('dt', label), valueNode);
            summary.append(row);
          }
        }
        metrics.forEach(([, value], index) => setText(metricValues[index], value));
        const best = recording.bestLapForMode(options.mode);
        const hasMustard =
          recording.lapValidity.some(({ mustard }) => mustard !== null) ||
          recording.partialLap?.mustard != null;
        element('#run-results-mustard').hidden = !hasMustard;
        element('#run-results-limits').textContent = hasMustard ? 'Mayo' : 'Track Limits';
        const attempts = recording.lapTimes.map((time, index) => ({
          time,
          validity: recording.lapValidity[index],
          unfinished: false,
        }));
        if (recording.partialLap)
          attempts.push({
            time: recording.partialLap.time,
            validity: recording.partialLap,
            unfinished: true,
          });
        const lapKey = JSON.stringify([
          selected,
          recording.lapTimes,
          recording.lapValidity,
          recording.partialLap && { ...recording.partialLap, time: undefined },
        ]);
        if (lapKey !== renderedLapKey) {
          renderedLapKey = lapKey;
          element('#run-results-laps').replaceChildren(
            ...attempts.map(({ time, validity, unfinished }, index) => {
              const row = document.createElement('tr');
              const lap = textNode('td', String(index + 1));
              const timing = textNode('td', formatLapTime(time));
              if (index === best && !unfinished)
                timing.append(textNode('span', 'Best', 'results-badge'));
              if (unfinished) timing.append(textNode('span', 'Unfinished', 'results-badge'));
              row.append(lap, timing);
              const mayo = mayoResult(validity);
              const limits = textNode(
                'td',
                hasMustard ? mayo.text : validity.trackLimits ? '✓ Valid' : 'Exceeded',
              );
              limits.dataset.valid = String(validity.trackLimits);
              if (hasMustard) limits.dataset.mayo = mayo.status;
              row.append(limits);
              if (hasMustard) {
                const result = mustardResult(validity);
                const cell = textNode('td', result.text);
                cell.dataset.mustard = result.status;
                row.append(cell);
              }
              return row;
            }),
          );
        }
        if (recording.partialLap) {
          const cell = element('#run-results-laps').lastElementChild?.children[1];
          if (cell?.firstChild)
            cell.firstChild.textContent = formatLapTime(recording.partialLap.time);
        }
        const bestTime = best === null ? null : recording.lapTimes[best];
        element('#run-results-best').textContent = formatLapTime(bestTime);
        const badge = element('#run-results-badge');
        const outcome = recordOutcome(bestTime, previousRecordTime);
        badge.hidden = !outcome.badge;
        badge.textContent = outcome.badge;
        element('#run-results-record').textContent = outcome.description;
        element<HTMLButtonElement>('#run-results-record-replay').disabled = !record;
      };
      renderDetails(selected === 0 ? recording : recording.field[selected - 1]);
      element<HTMLButtonElement>('#run-results-replay').disabled = !recording.count;
      previousStandings = previousRoster = undefined;
      previousFinished = undefined;
      dialog.showModal();
      notify();
    },
  };
}
