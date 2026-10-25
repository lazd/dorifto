import { courseGateDistances, courseRoute, type CourseDefinition } from './courses';
import type { ConfigurationState } from './configuration-state';
import { createCourseMapGeometry, startLineStyle } from './course-map-geometry';

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
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  const pad = document.createElementNS(namespace, 'circle');
  pad.setAttribute('class', 'minimap-pad');
  const road = document.createElementNS(namespace, 'path');
  road.setAttribute('class', 'minimap-road');
  const start = document.createElementNS(namespace, 'g');
  start.setAttribute('class', 'minimap-start');
  start.setAttribute('fill', 'none');
  start.setAttribute('stroke-width', String(startLineStyle.width));
  const startBase = document.createElementNS(namespace, 'path');
  startBase.setAttribute('stroke', startLineStyle.dark);
  const startStripes = document.createElementNS(namespace, 'path');
  startStripes.setAttribute('stroke', startLineStyle.light);
  startStripes.setAttribute('stroke-dasharray', startLineStyle.dashArray);
  start.append(startBase, startStripes);
  const marker = document.createElementNS(namespace, 'path');
  marker.setAttribute('class', 'minimap-marker');
  const markerPath = 'M0,-8 L5.5,6 L0,3 L-5.5,6 Z';
  marker.setAttribute('d', markerPath);
  const ghostMarker = document.createElementNS(namespace, 'path');
  ghostMarker.setAttribute('class', 'minimap-marker minimap-ghost');
  ghostMarker.setAttribute('d', markerPath);
  ghostMarker.setAttribute('visibility', 'hidden');
  const map = document.createElementNS(namespace, 'g');
  map.append(pad, road, start, ghostMarker, marker);
  const botLayer = document.createElementNS(namespace, 'g');
  map.append(botLayer);
  const botMarkers: SVGPathElement[] = [];
  svg.append(map);
  container.append(svg);
  let layout: ReturnType<typeof createMinimapLayout>;
  function setCourse(next: CourseDefinition) {
    layout = createMinimapLayout(next);
    container.classList.toggle('is-open-course', next.closed === false);
    svg.setAttribute(
      'aria-label',
      `${next.name}: bird's-eye course map with live car, bot and ghost positions and headings`,
    );
    ghostMarker.setAttribute('visibility', 'hidden');
    for (const bot of botMarkers) bot.setAttribute('visibility', 'hidden');
    road.setAttribute('d', layout.path);
    road.setAttribute('stroke-width', String(layout.roadWidth));
    startBase.setAttribute('d', layout.startLine);
    startStripes.setAttribute('d', layout.startLine);
    pad.setAttribute('visibility', layout.pad ? 'visible' : 'hidden');
    if (layout.pad) {
      pad.setAttribute('cx', String(layout.pad.x));
      pad.setAttribute('cy', String(layout.pad.y));
      pad.setAttribute('r', String(layout.pad.radius));
    }
  }
  setCourse(definition);
  return {
    setCourse,
    update(
      position: MapPoint,
      forward: MapPoint,
      orientation: ConfigurationState['minimapOrientation'],
      ghost?: { position: MapPoint; forward: MapPoint } | null,
      bots: readonly MinimapBot[] = [],
      showPlayer = true,
    ) {
      marker.setAttribute('visibility', showPlayer ? 'visible' : 'hidden');
      map.setAttribute('transform', minimapViewTransform(forward, orientation));
      marker.setAttribute(
        'transform',
        minimapMarkerTransform(layout, position, forward, orientation),
      );
      ghostMarker.setAttribute('visibility', ghost ? 'visible' : 'hidden');
      if (ghost)
        ghostMarker.setAttribute(
          'transform',
          minimapMarkerTransform(layout, ghost.position, ghost.forward, orientation),
        );
      while (botMarkers.length < bots.length) {
        const bot = document.createElementNS(namespace, 'path');
        bot.setAttribute('class', 'minimap-marker');
        bot.setAttribute('d', markerPath);
        botLayer.append(bot);
        botMarkers.push(bot);
      }
      botMarkers.forEach((marker, index) => {
        const bot = bots[index];
        marker.setAttribute('visibility', bot?.visible ? 'visible' : 'hidden');
        if (!bot?.visible) return;
        marker.style.setProperty('fill', bot.color);
        marker.setAttribute(
          'transform',
          minimapMarkerTransform(layout, bot.position, bot.forward, orientation),
        );
      });
    },
  };
}
