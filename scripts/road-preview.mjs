const svg = document.querySelector('svg');
const road = svg.querySelector('path');
const points = [...road.getAttribute('d').matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((match) => ({
  x: Number(match[1]),
  y: Number(match[2]),
}));
const status = document.querySelector('#selection-status');
const copyStatus = document.querySelector('#copy-status');
const command = document.querySelector('#import-command');
const copyButton = document.querySelector('#copy-command');
const fields = Object.fromEntries(
  ['slug', 'name', 'venue', 'config'].map((key) => [
    key,
    document.querySelector(`#segment-${key}`),
  ]),
);
const namespace = svg.namespaceURI;
const selected = document.createElementNS(namespace, 'path');
selected.setAttribute('class', 'selection');
svg.append(selected);
const markers = ['Start', 'Finish'].map((label) => {
  const group = document.createElementNS(namespace, 'g');
  const circle = document.createElementNS(namespace, 'circle');
  circle.setAttribute('r', '6');
  circle.setAttribute('class', 'endpoint');
  const text = document.createElementNS(namespace, 'text');
  text.textContent = label;
  text.setAttribute('fill', 'currentColor');
  text.setAttribute('x', '10');
  text.setAttribute('y', '-10');
  group.append(circle, text);
  group.setAttribute('visibility', 'hidden');
  svg.append(group);
  return group;
});
let start = null;
let finish = null;
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

function updateCommand() {
  copyStatus.textContent = '';
  if (finish === null) {
    command.value = '';
    copyButton.disabled = true;
    return;
  }
  const valid =
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.slug.value) &&
    ['name', 'venue', 'config'].every((key) => fields[key].value.trim());
  copyButton.disabled = !valid;
  if (!valid) {
    command.value = '';
    copyStatus.textContent = 'Provide a lowercase hyphenated slug and nonempty names.';
    return;
  }
  command.value =
    `npm run import-track -- ${quote(command.dataset.source)} --start ${start} --finish ${finish}` +
    ` --slug ${quote(fields.slug.value)} --name ${quote(fields.name.value)}` +
    ` --venue-name ${quote(fields.venue.value)} --config-name ${quote(fields.config.value)}`;
}

async function copyCommand() {
  if (copyButton.disabled) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable');
    await navigator.clipboard.writeText(command.value);
    copyStatus.textContent = 'Import command copied to clipboard.';
  } catch (error) {
    command.focus();
    command.select();
    copyStatus.textContent = `${error.message}. The command is selected; press Ctrl+C or ⌘C to copy.`;
  }
}

svg.addEventListener('click', (event) => {
  const matrix = svg.getScreenCTM();
  if (!matrix) return;
  const click = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  let index = 0;
  let nearest = Infinity;
  points.forEach((point, i) => {
    const distance = Math.hypot(point.x - click.x, point.y - click.y);
    if (distance < nearest) {
      index = i;
      nearest = distance;
    }
  });
  if (nearest > 20) {
    status.textContent = 'Click closer to the road to select a coordinate.';
    return;
  }
  if (start === null || finish !== null) {
    start = index;
    finish = null;
    markers[1].setAttribute('visibility', 'hidden');
    selected.setAttribute('d', '');
    status.textContent = `Start: point ${start}. Now click the finish.`;
  } else {
    if (index === start) {
      status.textContent = 'Choose a finish different from the start.';
      return;
    }
    finish = index;
    const range = points.slice(Math.min(start, finish), Math.max(start, finish) + 1);
    if (finish < start) range.reverse();
    selected.setAttribute(
      'd',
      range.map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' '),
    );
    fields.slug.value = `${command.dataset.slug}-${start}-${finish}`;
    fields.config.value = `Segment ${start}–${finish}`;
    status.textContent = `Start: point ${start} → Finish: point ${finish} (${range.length} coordinates). Click again to select a new segment.`;
  }
  const marker = markers[finish === null ? 0 : 1];
  marker.setAttribute('transform', `translate(${points[index].x} ${points[index].y})`);
  marker.setAttribute('visibility', 'visible');
  updateCommand();
  if (finish !== null) void copyCommand();
});
Object.values(fields).forEach((field) => field.addEventListener('input', updateCommand));
copyButton.addEventListener('click', () => void copyCommand());
document.querySelector('#reset-selection').addEventListener('click', () => {
  start = finish = null;
  selected.setAttribute('d', '');
  markers.forEach((marker) => marker.setAttribute('visibility', 'hidden'));
  status.textContent = 'Click the road to choose a start, then click again to choose a finish.';
  updateCommand();
});
