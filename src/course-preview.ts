import { courseGateDistances, courseRoute, courseSpawn, type CourseDefinition } from './courses';
import { createCourseMapGeometry, startLineStyle } from './course-map-geometry';

export interface CoursePreviewOptions {
  /** Square output size in CSS pixels. */
  size?: number;
  padding?: number;
  /** Centerline samples; higher values trace tight corners more faithfully. */
  samples?: number;
  trackColor?: string;
  /** Light stripe color of the black-and-white start/finish line. */
  startColor?: string;
  /** Draw the road at true scale relative to the layout, with this minimum stroke width. */
  minStrokeWidth?: number;
  /** Accessible label; defaults to the course name. */
  title?: string;
}

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/**
 * Top-down outline of a course as SVG path data, scaled to fit a square,
 * with +Z at the top to match the in-game map view.
 */
export function coursePreviewGeometry(
  definition: CourseDefinition,
  size = 200,
  padding = 12,
  samples = 400,
  minStrokeWidth = 1.5,
) {
  const route = courseRoute(definition);
  const points = route.getSpacedPoints(samples);
  if (definition.closed !== false) points.pop();
  const { path, scale, project, roadWidth, startLine } = createCourseMapGeometry(
    points,
    size,
    padding,
    definition.width,
    { minStrokeWidth, invertZ: true, closed: definition.closed },
  );
  const projectSpawn = (x: number, z: number) => {
    const { x: px, y: py } = project({ x, z });
    return [px, py] as const;
  };
  const spawn = courseSpawn(definition);
  const length = route.getLength();
  const [startT, finishT] = courseGateDistances(definition, length).map((d) => d / length);
  return {
    path,
    scale,
    start: projectSpawn(spawn.position[0], spawn.position[1]),
    heading: spawn.heading,
    roadWidth,
    startLine: startLine(route.getPointAt(startT), route.getTangentAt(startT)),
    finishLine:
      finishT === undefined
        ? undefined
        : startLine(route.getPointAt(finishT), route.getTangentAt(finishT)),
  };
}

/** Self-contained SVG markup for a course outline, suitable for a track picker thumbnail. */
export function coursePreviewSvg(definition: CourseDefinition, options: CoursePreviewOptions = {}) {
  const {
    size = 200,
    padding = 12,
    samples = 400,
    trackColor = 'currentColor',
    startColor = startLineStyle.light,
    minStrokeWidth = 1.5,
    title = definition.name,
  } = options;
  const { path, startLine, finishLine, roadWidth } = coursePreviewGeometry(
    definition,
    size,
    padding,
    samples,
    minStrokeWidth,
  );
  return previewSvg(
    path,
    finishLine ? [startLine, finishLine] : [startLine],
    roadWidth,
    size,
    title,
    trackColor,
    startColor,
  );
}

/** Preview an ordered open road without adding a closing segment or smoothing its geometry. */
export function roadPreviewSvg(
  points: readonly { x: number; z: number }[],
  width: number,
  options: CoursePreviewOptions = {},
) {
  if (points.length < 2) throw new Error('Road preview requires at least two points');
  const {
    size = 200,
    padding = 12,
    trackColor = 'currentColor',
    startColor = startLineStyle.light,
    minStrokeWidth = 1.5,
    title = 'Road preview',
  } = options;
  const { path, roadWidth, startLine } = createCourseMapGeometry(points, size, padding, width, {
    minStrokeWidth,
    invertZ: true,
    closed: false,
  });
  const endpointLine = (point: { x: number; z: number }, next: { x: number; z: number }) => {
    const length = Math.hypot(next.x - point.x, next.z - point.z);
    if (!length) throw new Error('Road preview endpoints must have distinct neighboring points');
    return startLine(point, { x: (next.x - point.x) / length, z: (next.z - point.z) / length });
  };
  return previewSvg(
    path,
    [
      endpointLine(points[0], points[1]),
      endpointLine(points[points.length - 1], points[points.length - 2]),
    ],
    roadWidth,
    size,
    title,
    trackColor,
    startColor,
  );
}

function previewSvg(
  path: string,
  lines: readonly string[],
  roadWidth: number,
  size: number,
  title: string,
  trackColor: string,
  startColor: string,
) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">` +
    `<title>${escape(title)}</title>` +
    `<path d="${path}" fill="none" stroke="${escape(trackColor)}" stroke-width="${roadWidth.toFixed(2)}" stroke-linejoin="round"/>` +
    `<g fill="none" stroke-width="${startLineStyle.width}">` +
    lines
      .map(
        (line) =>
          `<path d="${line}" stroke="${startLineStyle.dark}"/>` +
          `<path d="${line}" stroke="${escape(startColor)}" stroke-dasharray="${startLineStyle.dashArray}"/>`,
      )
      .join('') +
    '</g>' +
    '</svg>'
  );
}
