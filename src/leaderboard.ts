import type { RaceStanding } from './race-standings';

export function formatStanding(standing: RaceStanding, leader: boolean) {
  if (standing.retired) return 'DNF';
  if (standing.disqualified) return 'DSQ';
  if (standing.finished) return 'Finished';
  if (leader) {
    if (standing.lastLap === null) return '--:--';
    const seconds = Math.floor(standing.lastLap);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  if (standing.lapsBehind)
    return `+${standing.lapsBehind} ${standing.lapsBehind === 1 ? 'lap' : 'laps'}`;
  return standing.gap === null ? '--' : `+${standing.gap.toFixed(1)}s`;
}

export function createLeaderboard(
  container: HTMLOListElement,
  spectate?: (entrant: number) => void,
) {
  let previous: readonly RaceStanding[] | undefined;
  let roster: readonly { name: string; color: string }[] | undefined;
  let rows: { row: HTMLLIElement; timing: HTMLSpanElement }[] = [];
  let observed: number | null = null;
  let interactive = false;

  return {
    update(
      standings: readonly RaceStanding[],
      entrants: readonly { name: string; color: string }[],
      observedBot: number | null = null,
    ) {
      const canSpectate = spectate !== undefined && observedBot !== null;
      if (standings === previous && roster === entrants && observed === observedBot) return;
      previous = standings;
      if (roster !== entrants || interactive !== canSpectate) {
        roster = entrants;
        interactive = canSpectate;
        rows = entrants.map(({ name, color }, index) => {
          const row = document.createElement('li');
          const marker = document.createElement('span');
          marker.className = 'entrant-color';
          marker.style.setProperty('--entrant-color', color);
          marker.setAttribute('aria-hidden', 'true');
          const label = document.createElement(canSpectate ? 'button' : 'span');
          label.className = 'leaderboard-name';
          label.textContent = name;
          if (canSpectate) {
            label.setAttribute('type', 'button');
            label.setAttribute('aria-label', `Spectate ${name}`);
            label.addEventListener('click', () => spectate?.(index));
          }
          const timing = document.createElement('span');
          timing.className = 'leaderboard-timing';
          row.append(marker, label, timing);
          return { row, timing };
        });
        container.replaceChildren(...rows.map(({ row }) => row));
      }
      if (canSpectate) {
        rows.forEach(({ row }, index) => {
          const button = row.querySelector('button');
          if (button && button.getAttribute('aria-pressed') !== String(index === observedBot))
            button.setAttribute('aria-pressed', String(index === observedBot));
        });
      }
      observed = observedBot;
      const hidden = entrants.length < 2;
      if (container.hidden !== hidden) container.hidden = hidden;
      const ranked = standings.length > 0;
      if (container.dataset.ranked !== String(ranked)) container.dataset.ranked = String(ranked);
      if (!ranked) {
        rows.forEach(({ row, timing }, index) => {
          if (timing.textContent !== '--') timing.textContent = '--';
          if (timing.dataset.pending !== 'true') timing.dataset.pending = 'true';
          if (timing.title !== 'Waiting for race positions')
            timing.title = 'Waiting for race positions';
          if (container.children[index] !== row)
            container.insertBefore(row, container.children[index] ?? null);
        });
      }
      standings.forEach((standing, index) => {
        const { row, timing } = rows[standing.entrant];
        const text = formatStanding(standing, index === 0);
        if (timing.textContent !== text) timing.textContent = text;
        const pending = text.startsWith('--') ? 'true' : 'false';
        if (timing.dataset.pending !== pending) timing.dataset.pending = pending;
        const title = standing.retired
          ? 'Did not finish'
          : standing.disqualified
            ? 'Disqualified: invalid laps'
            : standing.finished
              ? 'Race finished'
              : index === 0
                ? 'Last valid lap time'
                : 'Gap to leader';
        if (timing.title !== title) timing.title = title;
        if (container.children[index] !== row)
          container.insertBefore(row, container.children[index] ?? null);
      });
    },
  };
}
