import * as THREE from 'three';
import type { CourseScenery, SceneryPoint } from './scenery-data';

type Building = CourseScenery['buildings'][number];
type Facade = 'siding' | 'brick' | 'office' | 'industrial' | 'wood';
type RoofStyle = 'gabled' | 'hipped' | 'shed' | 'a-frame';
type RoofPoint = { x: number; y: number; z: number };
type RoofGeometry = {
  points: RoofPoint[];
  triangles: number[][];
  wallTriangles?: RoofPoint[][];
};
const facades: Facade[] = ['siding', 'brick', 'office', 'industrial', 'wood'];
const residential = new Set([
  'house',
  'detached',
  'semidetached_house',
  'terrace',
  'bungalow',
  'cabin',
  'residential',
]);
const industrial = new Set([
  'industrial',
  'warehouse',
  'shed',
  'garage',
  'garages',
  'barn',
  'hangar',
]);
const wallPalettes = [0xf0e9d8, 0x9dab91, 0x83a5b4, 0xd6b87c, 0xb9735c, 0x9aabb2];
const woodPalettes = [0xb98953, 0x906c49, 0xc7a779, 0x81917a, 0x637b87, 0xa06049];
const roofPalettes = [0x55585a, 0x755548, 0x645f52, 0x4c565b];
const tileSize = 64;
const atlasColumns = facades.length + 2;

function roofFrame(ring: SceneryPoint[]) {
  let dx = 1,
    dz = 0,
    longest = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > longest) {
      longest = length;
      dx = (b[0] - a[0]) / length;
      dz = (b[1] - a[1]) / length;
    }
  }
  const across = ([x, z]: SceneryPoint) => -(x - ring[0][0]) * dz + (z - ring[0][1]) * dx;
  const along = ring.map(([x, z]) => (x - ring[0][0]) * dx + (z - ring[0][1]) * dz);
  const values = ring.map(across);
  return {
    across,
    min: Math.min(...values),
    max: Math.max(...values),
    length: Math.max(...along) - Math.min(...along),
  };
}

/** One repeatable floor/window bay per facade, plus shingles and flat roofing. */
export function createBuildingTexture() {
  const width = tileSize * atlasColumns;
  const pixels = new Uint8Array(width * tileSize * 4);
  for (let y = 0; y < tileSize; y++)
    for (let x = 0; x < width; x++) {
      const style = Math.floor(x / tileSize);
      const facade = facades[style];
      const u = x % tileSize;
      const grain = ((x * 13 + y * 7) % 9) - 4;
      let rgb = [230 + grain, 228 + grain, 220 + grain];
      if (facade === 'siding' && y % 8 === 0) rgb = [174, 178, 170];
      if (facade === 'brick') {
        const mortar = y % 8 === 0 || (u + (Math.floor(y / 8) % 2) * 8) % 16 === 0;
        rgb = mortar ? [186, 177, 161] : [190 + grain, 142 + grain, 119 + grain];
      }
      if (facade === 'industrial' && u % 8 < 2) rgb = [170, 179, 179];
      if (facade === 'wood') {
        const groove = u % 8 === 0;
        const grain = Math.round(Math.sin(u * 3.1 + Math.sin(y * 0.18) * 0.6) * 7);
        const shade = groove ? 135 : 233 + grain;
        rgb = [shade, shade - 4, shade - 10];
      }
      const houseFacade = facade === 'siding' || facade === 'brick' || facade === 'wood';
      const window = houseFacade
        ? u >= 19 && u <= 44 && y >= 22 && y <= 49
        : facade === 'office'
          ? u >= 5 && u <= 58 && y >= 14 && y <= 55
          : u >= 13 && u <= 50 && y >= 40 && y <= 51;
      if (window) {
        const frame = houseFacade
          ? u < 22 || u > 41 || y < 25 || y > 46 || u === 31 || u === 32 || y === 35
          : u % 21 < 2 || y < 17 || y > 52;
        rgb = frame
          ? [221, 220, 205]
          : [47 + Math.floor(y / 4), 73 + Math.floor(y / 4), 88 + Math.floor(y / 3)];
      }
      if (y < 3 || y > 60) rgb = facade === 'wood' ? [205, 200, 187] : [174, 175, 166];
      if (style === facades.length) {
        const seam = y % 8 === 0 || (u + (Math.floor(y / 8) % 2) * 2) % 4 === 0;
        const shade = seam ? 130 : 215 + grain;
        rgb = [shade, shade, shade];
      }
      if (style === facades.length + 1) {
        const shade = 205 + grain * 2;
        rgb = [shade, shade, shade - 5];
      }
      const offset = (y * width + x) * 4;
      pixels.set([...rgb, 255], offset);
    }
  const texture = new THREE.DataTexture(pixels, width, tileSize);
  texture.name = 'building-facades-and-shingles';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function buildingAppearance(building: Building) {
  const ring = building.rings[0];
  const area =
    Math.abs(
      ring.reduce((sum, a, i) => {
        const b = ring[(i + 1) % ring.length];
        return sum + a[0] * b[1] - b[0] * a[1];
      }, 0),
    ) / 2;
  const type = building.buildingType ?? '';
  const house = residential.has(type) || (!type && building.height <= 9 && area <= 450);
  const minX = Math.min(...ring.map(([x]) => x));
  const minZ = Math.min(...ring.map(([, z]) => z));
  const seed = Math.abs(Math.sin(minX * 0.13 + minZ * 0.37));
  const colorHash = Math.sin(minX * 41.31 + minZ * 17.73) * 43758.5453;
  const colorSeed = colorHash - Math.floor(colorHash);
  const frame = roofFrame(ring);
  const width = frame.max - frame.min;
  const variety = Math.abs(Math.sin(minX * 12.9898 + minZ * 78.233));
  const compact =
    ring.length <= 5 && width <= 12 && frame.length / width < 1.3 && building.height <= 6;
  const roofStyle: RoofStyle =
    building.roofShape === 'a-frame'
      ? 'a-frame'
      : building.roofShape === 'hipped' || building.roofShape === 'pyramidal'
        ? 'hipped'
        : building.roofShape === 'skillion'
          ? 'shed'
          : building.roofShape === 'gabled'
            ? 'gabled'
            : compact && variety < 0.16
              ? 'a-frame'
              : frame.length / width > 1.5 && variety < 0.24
                ? 'shed'
                : variety > 0.88
                  ? 'hipped'
                  : 'gabled';
  const facade: Facade =
    industrial.has(type) || (!type && !house && area > 900 && building.height < 12)
      ? 'industrial'
      : house
        ? roofStyle === 'hipped' && seed > 0.65
          ? 'brick'
          : roofStyle === 'a-frame' || seed < 0.55
            ? 'wood'
            : 'siding'
        : 'office';
  const palette = facade === 'wood' ? woodPalettes : wallPalettes;
  const wallColor = new THREE.Color(palette[Math.floor(colorSeed * palette.length)]);
  if (facade === 'brick') wallColor.set(0xe4c7b1);
  if (facade === 'office') wallColor.set(0xd0d5d4);
  const roofColor = new THREE.Color(
    roofPalettes[Math.min(roofPalettes.length - 1, Math.floor(seed * roofPalettes.length))],
  );
  return {
    facade,
    column: facades.indexOf(facade),
    wallColor,
    roofColor,
    roofStyle,
    pitched:
      house &&
      building.height <= 12 &&
      (!building.roofShape ||
        ['gabled', 'hipped', 'pyramidal', 'skillion', 'a-frame'].includes(building.roofShape)) &&
      building.rings.length === 1,
  };
}

/** Split at the ridge so every roof panel stays planar, including on irregular footprints. */
function profileBuildingRoof(ring: SceneryPoint[], height: number, style: RoofStyle): RoofGeometry {
  const frame = roofFrame(ring);
  const width = frame.max - frame.min;
  const middle = (frame.min + frame.max) / 2;
  const rise =
    style === 'a-frame' ? width * 0.85 : Math.min(style === 'shed' ? 2.5 : 4, width * 0.32);
  const heightAt = (p: SceneryPoint) => {
    const t = (frame.across(p) - frame.min) / width;
    return height + rise * (style === 'shed' ? t : 1 - Math.abs(t * 2 - 1));
  };
  const point = (p: SceneryPoint): RoofPoint => ({ x: p[0], y: heightAt(p), z: p[1] });
  const split = (polygon: SceneryPoint[], sign: number) => {
    const result: SceneryPoint[] = [];
    polygon.forEach((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      const da = (frame.across(a) - middle) * sign,
        db = (frame.across(b) - middle) * sign;
      if (da >= 0) result.push(a);
      if (da < 0 !== db < 0) {
        const t = da / (da - db);
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    });
    return result;
  };
  const points: RoofPoint[] = [];
  const triangles: number[][] = [];
  const vertices = ring.map(([x, z]) => new THREE.Vector2(x, z));
  for (const indices of THREE.ShapeUtils.triangulateShape(vertices, [])) {
    const triangle = indices.map((i) => ring[i]);
    for (const panel of style === 'shed' ? [triangle] : [split(triangle, 1), split(triangle, -1)]) {
      const start = points.length;
      points.push(...panel.map(point));
      for (let i = 1; i < panel.length - 1; i++) triangles.push([start, start + i, start + i + 1]);
    }
  }
  const wallTriangles: RoofPoint[][] = [];
  const boundary = THREE.ShapeUtils.isClockWise(vertices) ? ring.slice().reverse() : ring;
  boundary.forEach((a, i) => {
    const b = boundary[(i + 1) % boundary.length];
    const edge = [a];
    const da = frame.across(a) - middle,
      db = frame.across(b) - middle;
    if (style !== 'shed' && da * db < 0) {
      const t = da / (da - db);
      edge.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    edge.push(b);
    for (let j = 0; j < edge.length - 1; j++) {
      const topA = point(edge[j]),
        topB = point(edge[j + 1]);
      const bottomA = { ...topA, y: height },
        bottomB = { ...topB, y: height };
      wallTriangles.push([bottomA, topA, topB], [bottomA, topB, bottomB]);
    }
  });
  return { points, triangles, wallTriangles };
}

/** Sample distance to the eaves so concave wings meet without long, twisted roof panels. */
function insetBuildingRoof(ring: SceneryPoint[], height: number) {
  const points: { x: number; y: number; z: number }[] = [];
  const triangles: number[][] = [];
  const vertices = ring.map(([x, z]) => new THREE.Vector2(x, z));
  const addPoint = (p: THREE.Vector2) => {
    let distance = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0],
        dz = b[1] - a[1];
      const lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared
        ? THREE.MathUtils.clamp(((p.x - a[0]) * dx + (p.y - a[1]) * dz) / lengthSquared, 0, 1)
        : 0;
      distance = Math.min(distance, Math.hypot(p.x - a[0] - t * dx, p.y - a[1] - t * dz));
    }
    points.push({ x: p.x, y: height + distance * 0.6, z: p.y });
    return points.length - 1;
  };
  const subdivide = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, depth = 0) => {
    const ab = a.distanceToSquared(b),
      bc = b.distanceToSquared(c),
      ca = c.distanceToSquared(a);
    if (depth < 16 && Math.max(ab, bc, ca) > 2.25) {
      if (bc >= ab && bc >= ca) {
        [a, b, c] = [b, c, a];
      } else if (ca > ab) {
        [a, b, c] = [c, a, b];
      }
      const middle = a.clone().add(b).multiplyScalar(0.5);
      subdivide(a, middle, c, depth + 1);
      subdivide(middle, b, c, depth + 1);
      return;
    }
    triangles.push([addPoint(a), addPoint(b), addPoint(c)]);
  };
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(vertices, []))
    subdivide(vertices[a], vertices[b], vertices[c]);
  return { points, triangles };
}

/** Preserve the mapped outline rather than replacing houses with bounding boxes. */
export function buildingRoof(
  ring: SceneryPoint[],
  height: number,
  style: RoofStyle = 'hipped',
): RoofGeometry | undefined {
  const open = ring.filter((p, i) => !i || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]);
  if (open.length > 1 && open[0][0] === open.at(-1)![0] && open[0][1] === open.at(-1)![1])
    open.pop();
  if (style !== 'hipped') return profileBuildingRoof(open, height, style);
  const fallback = () => insetBuildingRoof(open, height);
  const corners = open.filter((p, i) => {
    const a = open[(i + open.length - 1) % open.length];
    const b = open[(i + 1) % open.length];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 0.05;
  });
  if (corners.length !== 4) return fallback();
  const length = (a: SceneryPoint, b: SceneryPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (let i = 0; i < 4; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 4],
      c = corners[(i + 2) % 4];
    const dot = (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]);
    if (Math.abs(dot) > length(a, b) * length(b, c) * 0.2) return fallback();
  }
  if (length(corners[0], corners[1]) < length(corners[1], corners[2]))
    corners.push(corners.shift()!);
  const [a, b, c, d] = corners;
  const long = length(a, b),
    short = length(b, c);
  if (short < 3 || short > 24 || long > 40) return fallback();
  const rise = Math.min(3.5, short * 0.28);
  const inset = short / 2 / long;
  const ridge = (t: number) => ({
    x: (a[0] + d[0]) / 2 + (b[0] - a[0]) * t,
    y: height + rise,
    z: (a[1] + d[1]) / 2 + (b[1] - a[1]) * t,
  });
  const points = corners.map(([x, z], i) => {
    const previous = corners[(i + 3) % 4];
    const next = corners[(i + 1) % 4];
    return {
      x:
        x +
        0.25 *
          ((x - previous[0]) / length(corners[i], previous) +
            (x - next[0]) / length(corners[i], next)),
      y: height - (rise * 0.5) / short,
      z:
        z +
        0.25 *
          ((z - previous[1]) / length(corners[i], previous) +
            (z - next[1]) / length(corners[i], next)),
    };
  });
  points.push(ridge(inset), ridge(1 - inset));
  return {
    points,
    triangles: [
      [0, 1, 5],
      [0, 5, 4],
      [1, 2, 5],
      [2, 3, 4],
      [2, 4, 5],
      [3, 0, 4],
    ],
  };
}

export function buildingUV(column: number, u: number, v: number): [number, number] {
  // Half-texel gutters prevent adjacent facade styles bleeding into each other.
  return [(column * tileSize + 0.5 + u * (tileSize - 1)) / (tileSize * atlasColumns), v];
}

export const buildingRoofColumn = facades.length;
export const buildingFlatRoofColumn = facades.length + 1;
