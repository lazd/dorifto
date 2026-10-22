import { courseRoute, courseSpawn, courseStartDistance, type CourseDefinition } from './courses';
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

const escape = (text: string) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/**
 * Top-down outline of a course as SVG path data, scaled to fit a square,
 * with +Z at the top to match the in-game map view.
 */
export function coursePreviewGeometry(
  definition: CourseDefinition, size = 200, padding = 12, samples = 400, minStrokeWidth = 1.5,
) {
  const route = courseRoute(definition);
  const points = route.getSpacedPoints(samples);
  points.pop();
  const { path, scale, project, roadWidth, startLine } = createCourseMapGeometry(
    points, size, padding, definition.width,
    { minStrokeWidth, invertZ: true },
  );
  const projectSpawn = (x: number, z: number) => {
    const { x: px, y: py } = project({ x, z });
    return [px, py] as const;
  };
  const spawn = courseSpawn(definition);
  const startT = courseStartDistance(definition, route.getLength()) / route.getLength();
  return {
    path, scale, start: projectSpawn(spawn.position[0], spawn.position[1]),
    heading: spawn.heading, roadWidth,
    startLine: startLine(route.getPointAt(startT), route.getTangentAt(startT)),
  };
}

/** Self-contained SVG markup for a course outline, suitable for a track picker thumbnail. */
export function coursePreviewSvg(definition: CourseDefinition, options: CoursePreviewOptions = {}) {
  const {
    size = 200, padding = 12, samples = 400, trackColor = 'currentColor',
    startColor = startLineStyle.light, minStrokeWidth = 1.5, title = definition.name,
  } = options;
  const { path, startLine, roadWidth } = coursePreviewGeometry(definition, size, padding, samples, minStrokeWidth);
  const stroke = roadWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">`
    + `<title>${escape(title)}</title>`
    + `<path d="${path}" fill="none" stroke="${escape(trackColor)}" stroke-width="${stroke.toFixed(2)}" stroke-linejoin="round"/>`
    + `<g fill="none" stroke-width="${startLineStyle.width}">`
    + `<path d="${startLine}" stroke="${startLineStyle.dark}"/>`
    + `<path d="${startLine}" stroke="${escape(startColor)}" stroke-dasharray="${startLineStyle.dashArray}"/>`
    + '</g>'
    + '</svg>';
}
