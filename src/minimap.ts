import { courseGateDistances, courseRoute, type CourseDefinition } from './courses';
import type { ConfigurationState } from './configuration-state';
import { createCourseMapGeometry, startLineStyle } from './course-map-geometry';
import { formatLapTime } from './laps';

const size = 180;
const padding = 16;
// Fit the entire square map at any rotation without shrinking the car marker.
const headingUpScale = Math.SQRT1_2;

interface MapPoint {
  x: number;
  z: number;
}

export interface MinimapBot {
  position: MapPoint;
  forward: MapPoint;
  color: string;
  visible: boolean;
}

export function createMinimapLayout(definition: CourseDefinition) {
  const route = courseRoute({ ...definition, reverse: false });
  const points = route.getSpacedPoints(Math.max(256, Math.ceil(route.getLength() / 2)));
  const { project, path, roadWidth, pad, startLine } = createCourseMapGeometry(
    points,
    size,
    padding,
    definition.width,
    { padRadius: definition.padRadius, minimumRoadWidth: 3, closed: definition.closed },
  );
  const length = route.getLength();
  return {
    path,
    project,
    roadWidth,
    startLine: courseGateDistances({ ...definition, reverse: false }, length)
      .map((distance) =>
        startLine(route.getPointAt(distance / length), route.getTangentAt(distance / length)),
      )
      .join(' '),
    pad,
  };
}

function headingAngle(forward: MapPoint) {
  return (Math.atan2(forward.x, -forward.z) * 180) / Math.PI;
}

export function minimapViewTransform(
  forward: MapPoint,
  orientation: ConfigurationState['minimapOrientation'],
) {
  return orientation === 'north-up'
    ? ''
    : `translate(${size / 2} ${size / 2}) rotate(${(-headingAngle(forward)).toFixed(2)}) scale(${headingUpScale}) translate(${-size / 2} ${-size / 2})`;
}

export function minimapMarkerTransform(
  layout: ReturnType<typeof createMinimapLayout>,
  position: MapPoint,
  forward: MapPoint,
  orientation: ConfigurationState['minimapOrientation'] = 'north-up',
) {
  const { x, y } = layout.project(position);
  const angle = headingAngle(forward);
  return (
    `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle.toFixed(2)})` +
    (orientation === 'heading-up' ? ` scale(${1 / headingUpScale})` : '')
  );
}

export function createMinimap(container: HTMLElement, definition: CourseDefinition) {
  const map = document.createElement('span');
  map.className = 'minimap-map';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  const context = canvas.getContext('2d');
  const courseCanvas = document.createElement('canvas');
  const courseContext = courseCanvas.getContext('2d');
  const timer = container.querySelector<HTMLElement>('#lap-current');
  if (!context || !courseContext || !timer)
    throw new Error('Minimap requires a 2D canvas context and lap timer');
  container.append(map, canvas);
  const markerPath = new Path2D('M0,-8 L5.5,6 L0,3 L-5.5,6 Z');
  let layout: ReturnType<typeof createMinimapLayout>;
  let mapX = 0;
  let mapY = 0;
  let mapWidth = 0;
  let mapHeight = 0;
  let mapScale = 1;
  let timerX = 0;
  let timerY = 0;
  let timerWidth = 0;
  let timerHeight = 0;
  let markerColor = '';
  let markerOutline = '';
  let ghostColor = '';
  let timeColor = '';
  let invalidColor = '';
  let timerFont = '';
  let timeText = formatLapTime(null);
  let timeInvalid = false;
  let paintedTime = '';
  let paintedInvalid = false;
  container.addEventListener('focus', () => {
    timer.setAttribute(
      'aria-label',
      `${timeInvalid ? 'Invalid lap time' : 'Current lap time'}: ${timeText}`,
    );
  });
  const paintTime = () => {
    if (!timerWidth || (paintedTime === timeText && paintedInvalid === timeInvalid)) return;
    context.clearRect(timerX, timerY, timerWidth, timerHeight);
    context.font = timerFont;
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    context.fillStyle = timeInvalid ? invalidColor : timeColor;
    context.fillText(timeText, timerX + timerWidth, timerY + timerHeight / 2 + 1.5, timerWidth);
    paintedTime = timeText;
    paintedInvalid = timeInvalid;
  };
  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    mapX = map.offsetLeft;
    mapY = map.offsetTop;
    mapWidth = map.clientWidth;
    mapHeight = map.clientHeight;
    mapScale = Math.min(mapWidth, mapHeight) / size;
    timerX = timer.offsetLeft;
    timerY = timer.offsetTop;
    // The timer's containing block uses layout containment.
    for (
      let parent = timer.offsetParent;
      parent && parent !== container;
      parent = parent.offsetParent
    ) {
      if (!(parent instanceof HTMLElement)) break;
      timerX += parent.offsetLeft;
      timerY += parent.offsetTop;
    }
    timerWidth = timer.clientWidth;
    timerHeight = timer.clientHeight;
    const style = getComputedStyle(container);
    const timerStyle = getComputedStyle(timer);
    timerFont = `${timerStyle.fontWeight} ${timerStyle.fontSize} ${timerStyle.fontFamily}`;
    markerColor = style.getPropertyValue('--map-marker-color').trim();
    markerOutline = style.getPropertyValue('--map-marker-outline').trim();
    ghostColor = style.getPropertyValue('--map-ghost-color').trim();
    timeColor = style.getPropertyValue('--lap-time-color').trim();
    invalidColor = style.getPropertyValue('--lap-invalid-color').trim();
    // Cache the static course at display resolution; only markers change each frame.
    const resolution = Math.max(1, Math.ceil(size * mapScale * ratio));
    courseCanvas.width = resolution;
    courseCanvas.height = resolution;
    courseContext.setTransform(resolution / size, 0, 0, resolution / size, 0, 0);
    if (layout.pad) {
      courseContext.fillStyle = style.getPropertyValue('--map-pad-color').trim();
      courseContext.beginPath();
      courseContext.arc(layout.pad.x, layout.pad.y, layout.pad.radius, 0, Math.PI * 2);
      courseContext.fill();
    }
    courseContext.lineCap = 'round';
    courseContext.lineJoin = 'round';
    courseContext.strokeStyle = style.getPropertyValue('--map-road-color').trim();
    courseContext.lineWidth = layout.roadWidth;
    courseContext.stroke(new Path2D(layout.path));
    courseContext.lineCap = 'butt';
    courseContext.lineWidth = startLineStyle.width;
    const start = new Path2D(layout.startLine);
    courseContext.strokeStyle = startLineStyle.dark;
    courseContext.stroke(start);
    courseContext.strokeStyle = startLineStyle.light;
    courseContext.setLineDash(startLineStyle.dashArray.split(' ').map(Number));
    courseContext.stroke(start);
    paintedTime = '';
    paintTime();
  };
  function setCourse(next: CourseDefinition) {
    layout = createMinimapLayout(next);
    container.classList.toggle('is-open-course', next.closed === false);
    canvas.setAttribute(
      'aria-label',
      `${next.name}: bird's-eye course map with live car, bot and ghost positions and headings`,
    );
    resize();
  }
  setCourse(definition);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  observer.observe(map);
  observer.observe(timer);
  const viewObserver = new MutationObserver(resize);
  viewObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', resize);
  void document.fonts.ready.then(resize);
  const paintMarker = (
    position: MapPoint,
    forward: MapPoint,
    color: string,
    headingUp: boolean,
  ) => {
    const { x, y } = layout.project(position);
    context.save();
    context.translate(x, y);
    context.rotate(Math.atan2(forward.x, -forward.z));
    if (headingUp) context.scale(1 / headingUpScale, 1 / headingUpScale);
    context.fillStyle = color;
    context.fill(markerPath);
    context.strokeStyle = markerOutline;
    context.lineWidth = 1.5;
    context.lineJoin = 'round';
    context.stroke(markerPath);
    context.restore();
  };
  return {
    setCourse,
    updateLapTime(time: number | null, invalid: boolean) {
      timeText = formatLapTime(time);
      timeInvalid = invalid;
      paintTime();
    },
    update(
      position: MapPoint,
      forward: MapPoint,
      orientation: ConfigurationState['minimapOrientation'],
      ghost?: { position: MapPoint; forward: MapPoint } | null,
      bots: readonly MinimapBot[] = [],
      showPlayer = true,
    ) {
      if (!mapWidth || !mapHeight) return;
      const headingUp = orientation === 'heading-up';
      context.clearRect(mapX, mapY, mapWidth, mapHeight);
      context.save();
      context.beginPath();
      context.rect(mapX, mapY, mapWidth, mapHeight);
      context.clip();
      context.translate(mapX + mapWidth / 2, mapY + mapHeight / 2);
      context.scale(mapScale, mapScale);
      if (headingUp) {
        context.rotate(-Math.atan2(forward.x, -forward.z));
        context.scale(headingUpScale, headingUpScale);
      }
      context.translate(-size / 2, -size / 2);
      context.drawImage(courseCanvas, 0, 0, size, size);
      if (ghost) {
        context.globalAlpha = 0.65;
        paintMarker(ghost.position, ghost.forward, ghostColor, headingUp);
        context.globalAlpha = 1;
      }
      if (showPlayer) paintMarker(position, forward, markerColor, headingUp);
      for (const bot of bots) {
        if (bot.visible) paintMarker(bot.position, bot.forward, bot.color, headingUp);
      }
      context.restore();
    },
  };
}
