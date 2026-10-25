import { RunRecording } from './lap-recording';
import { formatLapTime } from './laps';
import { raceModes, validForMode, type RaceOptions, type LapValidity } from './race-rules';
import type { RaceStanding } from './race-standings';
import { element } from './ui';
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
) {
  if (!completed) return '🔴 DNF';
  if (!qualified) return '❌ Disqualified';
  const winner = standings.find(
    (standing) => standing.finished && !standing.disqualified && !standing.retired,
  );
  return winner?.entrant === 0 ? '🏆 Won' : '🏁 Finished';
}

export function createRunResults(actions: {
  restart(): void;
  replay(recording: RunRecording): void;
}) {
  const dialog = element<HTMLDialogElement>('#run-results');
  let run: RunRecording | null = null;
  let record: RunRecording | null = null;
  let previousStandings: readonly RaceStanding[] | undefined;
  let previousRoster: readonly { name: string; color: string }[] | undefined;
  let previousFinished: boolean | undefined;
  let runCompleted = false;
  let runQualified = false;
  let rows: {
    row: HTMLTableRowElement;
    position: HTMLElement;
    timing: HTMLElement;
    status: HTMLElement;
  }[] = [];
  const notify = () => document.dispatchEvent(new Event('driving-ui-change'));
  const close = () => {
    dialog.close();
    notify();
  };
  element('#run-results-restart').addEventListener('click', actions.restart);
  element('#run-results-replay').addEventListener('click', () => {
    if (run) actions.replay(run);
  });
  element('#run-results-record-replay').addEventListener('click', () => {
    if (record) actions.replay(record);
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    actions.restart();
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
    ) {
      if (
        !dialog.open ||
        (standings === previousStandings &&
          entrants === previousRoster &&
          finished === previousFinished)
      )
        return;
      previousStandings = standings;
      previousFinished = finished;
      setText(element('#run-results-title'), raceOutcome(runCompleted, runQualified, standings));
      const body = element('#run-results-standings');
      if (entrants !== previousRoster) {
        previousRoster = entrants;
        rows = entrants.map(({ name, color }) => {
          const row = document.createElement('tr');
          const position = textNode('td', '—');
          const driver = document.createElement('td');
          const label = textNode('span', '', 'results-driver');
          const marker = textNode('span', '', 'entrant-color');
          marker.style.setProperty('--entrant-color', color);
          marker.setAttribute('aria-hidden', 'true');
          label.append(marker, textNode('span', name));
          driver.append(label);
          const timing = textNode('td', '—');
          const status = textNode('td', 'Waiting');
          row.append(position, driver, timing, status);
          return { row, position, timing, status };
        });
        body.replaceChildren(...rows.map(({ row }) => row));
      }
      const leaderTime = standings.find(
        (standing) => standing.finished && !standing.disqualified && !standing.retired,
      )?.finishTime;
      standings.forEach((standing, index) => {
        const { row, position, timing, status } = rows[standing.entrant];
        const formatted = resultStanding(standing, leaderTime);
        setText(position, standing.retired || standing.disqualified ? '—' : String(index + 1));
        setText(
          timing,
          index === 0 && !standing.finished && !standing.retired ? 'Leader' : formatted.timing,
        );
        setText(status, formatted.status);
        if (body.children[index] !== row) body.insertBefore(row, body.children[index] ?? null);
      });
      const done = standings.filter(({ finished }) => finished).length;
      setText(
        element('#run-results-race-status'),
        finished ? 'Final standings' : `${done}/${entrants.length} finished · Live`,
      );
    },
    show(
      recording: RunRecording,
      options: RaceOptions,
      recordLap: RunRecording | null,
      completed: boolean,
      courseName: string,
      previousRecordTime: number | null,
    ) {
      run = recording;
      record = recordLap;
      const valid = recording.lapValidity.filter((lap) => validForMode(lap, options.mode)).length;
      runCompleted = completed;
      runQualified = valid >= options.laps;
      element('#run-results-title').textContent = raceOutcome(completed, runQualified, []);
      element('#run-results-course').textContent = courseName;
      element('#run-results-mode').textContent =
        `${options.laps} lap${options.laps === 1 ? '' : 's'} · ${raceModes[options.mode].name}`;
      const stats = recording.statistics;
      const summary = element('#run-results-summary');
      summary.replaceChildren();
      for (const [label, value, unit] of [
        ['Top speed', (stats.maxSpeed * 3.6).toFixed(1), 'km/h'],
        ['Avg speed', (stats.time ? (stats.distance / stats.time) * 3.6 : 0).toFixed(1), 'km/h'],
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
      ]) {
        const row = document.createElement('div');
        const valueNode = textNode('dd', value);
        valueNode.append(textNode('small', ` ${unit}`));
        row.append(textNode('dt', label), valueNode);
        summary.append(row);
      }
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
      const bestTime = best === null ? null : recording.lapTimes[best];
      element('#run-results-best').textContent = formatLapTime(bestTime);
      const badge = element('#run-results-badge');
      const outcome = recordOutcome(bestTime, previousRecordTime);
      badge.hidden = !outcome.badge;
      badge.textContent = outcome.badge;
      element('#run-results-record').textContent = outcome.description;
      element<HTMLButtonElement>('#run-results-replay').disabled = !recording.count;
      element<HTMLButtonElement>('#run-results-record-replay').disabled = !recordLap;
      previousStandings = previousRoster = undefined;
      previousFinished = undefined;
      dialog.showModal();
      notify();
    },
  };
}
