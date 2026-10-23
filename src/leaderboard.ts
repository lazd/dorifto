import type { RaceStanding } from './race-standings';

export function formatStanding(standing: RaceStanding, leader: boolean) {
  if (leader) {
    if (standing.lastLap === null) return '--:--';
    const seconds = Math.floor(standing.lastLap);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  if (standing.lapsBehind)
    return `+${standing.lapsBehind} ${standing.lapsBehind === 1 ? 'lap' : 'laps'}`;
  return standing.gap === null ? '--' : `+${standing.gap.toFixed(1)}s`;
}

export function createLeaderboard(container: HTMLOListElement) {
  let previous: readonly RaceStanding[] | undefined;
  let roster: readonly { name: string; color: string }[] | undefined;
  let rows: { row: HTMLLIElement; timing: HTMLSpanElement }[] = [];

  return {
    update(
      standings: readonly RaceStanding[],
      entrants: readonly { name: string; color: string }[],
    ) {
      if (standings === previous && roster === entrants) return;
      previous = standings;
      if (roster !== entrants) {
        roster = entrants;
        rows = entrants.map(({ name, color }) => {
          const row = document.createElement('li');
          const marker = document.createElement('span');
          marker.className = 'entrant-color';
          marker.style.setProperty('--entrant-color', color);
          marker.setAttribute('aria-hidden', 'true');
          const label = document.createElement('span');
          label.className = 'leaderboard-name';
          label.textContent = name;
          const timing = document.createElement('span');
          timing.className = 'leaderboard-timing';
          row.append(marker, label, timing);
          return { row, timing };
        });
        container.replaceChildren(...rows.map(({ row }) => row));
      }
      const hidden = standings.length < 2;
      if (container.hidden !== hidden) container.hidden = hidden;
      standings.forEach((standing, index) => {
        const { row, timing } = rows[standing.entrant];
        const text = formatStanding(standing, index === 0);
        if (timing.textContent !== text) timing.textContent = text;
        const title = index === 0 ? 'Last valid lap time' : 'Gap to leader';
        if (timing.title !== title) timing.title = title;
        if (container.children[index] !== row)
          container.insertBefore(row, container.children[index] ?? null);
      });
    },
  };
}
