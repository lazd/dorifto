interface CoursePoint {
  x: number;
  z: number;
}

interface SvgPoint {
  x: number;
  y: number;
}

interface CourseMapOptions {
  padRadius?: number;
  minStrokeWidth?: number;
  minimumRoadWidth?: number;
  invertZ?: boolean;
}

export const startLineStyle = {
  width: 3,
  dashArray: '3 3',
  light: '#fff',
  dark: '#000',
};

export function createCourseMapGeometry(
  points: readonly CoursePoint[],
  size: number,
  padding: number,
  roadWidth: number,
  options: CourseMapOptions = {},
) {
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
  const routeExtent = Math.max(maxX - minX, maxZ - minZ, 1e-6);
  const roadRadius = roadWidth / 2;
  minX -= roadRadius;
  maxX += roadRadius;
  minZ -= roadRadius;
  maxZ += roadRadius;
  if (options.padRadius !== undefined) {
    minX = Math.min(minX, -options.padRadius);
    maxX = Math.max(maxX, options.padRadius);
    minZ = Math.min(minZ, -options.padRadius);
    maxZ = Math.max(maxZ, options.padRadius);
  }
  const available = size - padding * 2;
  const boundsExtent = Math.max(maxX - minX, maxZ - minZ, 1e-6);
  const scale = Math.min(
    available / boundsExtent,
    (available - (options.minStrokeWidth ?? 0)) / routeExtent,
  );
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const project = ({ x, z }: CoursePoint): SvgPoint => ({
    x: size / 2 + (x - centerX) * scale,
    y: size / 2 + (z - centerZ) * scale * (options.invertZ ? -1 : 1),
  });
  const path = points.map((point, index) => {
    const { x, y } = project(point);
    return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + ' Z';
  const pad = options.padRadius === undefined
    ? undefined
    : { ...project({ x: 0, z: 0 }), radius: options.padRadius * scale };
  const renderedRoadWidth = Math.max(options.minimumRoadWidth ?? 0, options.minStrokeWidth ?? 0, roadWidth * scale);
  const startLine = (position: CoursePoint, tangent: CoursePoint) => {
    const halfLine = (renderedRoadWidth / 2 + 2) / scale;
    const left = project({ x: position.x - tangent.z * halfLine, z: position.z + tangent.x * halfLine });
    const right = project({ x: position.x + tangent.z * halfLine, z: position.z - tangent.x * halfLine });
    return `M${left.x},${left.y} L${right.x},${right.y}`;
  };
  return {
    path,
    scale,
    project,
    roadWidth: renderedRoadWidth,
    pad,
    startLine,
  };
}
