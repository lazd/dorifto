import { courseRoute, courseSpawn, type CourseDefinition } from './courses';

export interface CoursePreviewOptions {
  /** Square output size in CSS pixels. */
  size?: number;
  padding?: number;
  /** Centerline samples; higher values trace tight corners more faithfully. */
  samples?: number;
  trackColor?: string;
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
  const points = courseRoute(definition).getSpacedPoints(samples);
  points.pop();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const { x, z } of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const extent = Math.max(maxX - minX, maxZ - minZ, 1e-6);
  const available = size - 2 * padding;
  const scale = Math.min(available / (extent + definition.width), (available - minStrokeWidth) / extent);
  const offsetX = (size - (maxX - minX) * scale) / 2;
  const offsetY = (size - (maxZ - minZ) * scale) / 2;
  const project = (x: number, z: number) =>
    [(x - minX) * scale + offsetX, (maxZ - z) * scale + offsetY] as const;
  const path = points.map(({ x, z }, i) => {
    const [px, py] = project(x, z);
    return `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
  }).join('') + 'Z';
  const spawn = courseSpawn(definition);
  return { path, scale, start: project(spawn.position[0], spawn.position[1]), heading: spawn.heading };
}

/** Self-contained SVG markup for a course outline, suitable for a track picker thumbnail. */
export function coursePreviewSvg(definition: CourseDefinition, options: CoursePreviewOptions = {}) {
  const {
    size = 200, padding = 12, samples = 400, trackColor = 'currentColor',
    startColor = '#e8372c', minStrokeWidth = 1.5, title = definition.name,
  } = options;
  const { path, scale, start } = coursePreviewGeometry(definition, size, padding, samples, minStrokeWidth);
  const stroke = Math.max(minStrokeWidth, definition.width * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">`
    + `<title>${escape(title)}</title>`
    + `<path d="${path}" fill="none" stroke="${escape(trackColor)}" stroke-width="${stroke.toFixed(2)}" stroke-linejoin="round"/>`
    + `<circle cx="${start[0].toFixed(1)}" cy="${start[1].toFixed(1)}" r="${Math.max(3, Math.min(6, stroke * 0.9)).toFixed(1)}" fill="${escape(startColor)}"/>`
    + '</svg>';
}
