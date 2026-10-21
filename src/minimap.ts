import { courseRoute, startDistance, type CourseDefinition } from './courses';
import type { GameState } from './game-state';

const size = 180;
const padding = 16;
// Fit the entire square map at any rotation without shrinking the car marker.
const headingUpScale = Math.SQRT1_2;

interface MapPoint {
  x: number;
  z: number;
}

export function createMinimapLayout(definition: CourseDefinition) {
  const route = courseRoute({ ...definition, reverse: false });
  const points = route.getSpacedPoints(Math.max(256, Math.ceil(route.getLength() / 2)));
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const roadRadius = definition.width / 2;
  for (const point of points) {
    minX = Math.min(minX, point.x - roadRadius);
    maxX = Math.max(maxX, point.x + roadRadius);
    minZ = Math.min(minZ, point.z - roadRadius);
    maxZ = Math.max(maxZ, point.z + roadRadius);
  }
  if (definition.padRadius !== undefined) {
    minX = Math.min(minX, -definition.padRadius);
    maxX = Math.max(maxX, definition.padRadius);
    minZ = Math.min(minZ, -definition.padRadius);
    maxZ = Math.max(maxZ, definition.padRadius);
  }
  const scale = (size - padding * 2) / Math.max(maxX - minX, maxZ - minZ);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const project = (point: MapPoint) => ({
    x: size / 2 + (point.x - centerX) * scale,
    y: size / 2 + (point.z - centerZ) * scale,
  });
  const path = points.map((point, index) => {
    const { x, y } = project(point);
    return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + ' Z';
  const start = route.getPointAt(startDistance / route.getLength());
  const tangent = route.getTangentAt(startDistance / route.getLength());
  const halfLine = Math.max(roadRadius, 3 / scale);
  const startLeft = project({ x: start.x - tangent.z * halfLine, z: start.z + tangent.x * halfLine });
  const startRight = project({ x: start.x + tangent.z * halfLine, z: start.z - tangent.x * halfLine });
  return {
    path, project,
    roadWidth: Math.max(3, definition.width * scale),
    startLine: `M${startLeft.x},${startLeft.y} L${startRight.x},${startRight.y}`,
    pad: definition.padRadius === undefined ? undefined : { ...project({ x: 0, z: 0 }), radius: definition.padRadius * scale },
  };
}

function headingAngle(forward: MapPoint) {
  return Math.atan2(forward.x, -forward.z) * 180 / Math.PI;
}

export function minimapViewTransform(forward: MapPoint, orientation: GameState['minimapOrientation']) {
  return orientation === 'north-up' ? '' :
    `translate(${size / 2} ${size / 2}) rotate(${(-headingAngle(forward)).toFixed(2)}) scale(${headingUpScale}) translate(${-size / 2} ${-size / 2})`;
}

export function minimapMarkerTransform(
  layout: ReturnType<typeof createMinimapLayout>, position: MapPoint, forward: MapPoint,
  orientation: GameState['minimapOrientation'] = 'north-up',
) {
  const { x, y } = layout.project(position);
  const angle = headingAngle(forward);
  return `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle.toFixed(2)})`
    + (orientation === 'heading-up' ? ` scale(${1 / headingUpScale})` : '');
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
  const start = document.createElementNS(namespace, 'path');
  start.setAttribute('class', 'minimap-start');
  const marker = document.createElementNS(namespace, 'path');
  marker.setAttribute('class', 'minimap-marker');
  marker.setAttribute('d', 'M0,-8 L5.5,6 L0,3 L-5.5,6 Z');
  const map = document.createElementNS(namespace, 'g');
  map.append(pad, road, start, marker);
  svg.append(map);
  container.append(svg);
  let layout: ReturnType<typeof createMinimapLayout>;
  function setCourse(next: CourseDefinition) {
    layout = createMinimapLayout(next);
    svg.setAttribute('aria-label', `${next.name}: bird's-eye course map with live car position and heading`);
    road.setAttribute('d', layout.path);
    road.setAttribute('stroke-width', String(layout.roadWidth));
    start.setAttribute('d', layout.startLine);
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
    update(position: MapPoint, forward: MapPoint, orientation: GameState['minimapOrientation']) {
      map.setAttribute('transform', minimapViewTransform(forward, orientation));
      marker.setAttribute('transform', minimapMarkerTransform(layout, position, forward, orientation));
    },
  };
}
