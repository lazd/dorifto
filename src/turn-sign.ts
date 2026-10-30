import * as THREE from 'three';
import { courseTurns } from './courses';

export type TurnSignMode = 'off' | 'few' | 'several' | 'many';

export function isTurnSignMode(value: string): value is TurnSignMode {
  return value === 'off' || value === 'few' || value === 'several' || value === 'many';
}

export function readTurnSignMode(value: string | null): TurnSignMode {
  if (value === null || value === 'on') return 'several';
  if (!isTurnSignMode(value)) throw new Error(`Invalid signs option: ${value}`);
  return value;
}

export function courseCrestWarnings(
  route: THREE.Curve<THREE.Vector3>,
  heightAt: (x: number, z: number) => number,
) {
  const length = route.getLength();
  const count = Math.ceil(length / 3);
  const spacing = length / count;
  const pointAt = (distance: number) =>
    route.getPointAt(THREE.MathUtils.euclideanModulo(distance, length) / length);
  const height = (distance: number) => {
    const point = pointAt(distance);
    return heightAt(point.x, point.z);
  };
  const warnings: { distance: number; direction: number }[] = [];
  for (let i = 0; i < count; i++) {
    const crest = i * spacing;
    const top = height(crest);
    if (top < height(crest - spacing) || top <= height(crest + spacing)) continue;
    const blind = [12, 30].some((approachDistance) => {
      const approach = height(crest - approachDistance);
      const beyond = height(crest + approachDistance * 2);
      if (
        (top - approach) / approachDistance < 0.015 ||
        (top - beyond) / (approachDistance * 2) < 0.015
      )
        return false;
      // A driver's eye on the approach cannot see the road beyond this crest.
      const sightline = THREE.MathUtils.lerp(approach + 1.1, beyond, 1 / 3);
      return top >= sightline + 0.15;
    });
    if (!blind) continue;
    const before = route.getTangentAt(THREE.MathUtils.euclideanModulo(crest - 8, length) / length);
    let bend = 0;
    for (const ahead of [15, 30, 45]) {
      const after = route.getTangentAt(
        THREE.MathUtils.euclideanModulo(crest + ahead, length) / length,
      );
      const angle = Math.atan2(before.z * after.x - before.x * after.z, before.dot(after));
      if (Math.abs(angle) > Math.abs(bend)) bend = angle;
    }
    if (Math.abs(bend) < THREE.MathUtils.degToRad(8)) continue;
    warnings.push({ distance: crest, direction: Math.sign(bend) });
  }
  return warnings;
}

export function courseTurnSignPlacements(
  route: THREE.Curve<THREE.Vector3>,
  mode: TurnSignMode = 'several',
  heightAt?: (x: number, z: number) => number,
) {
  if (mode === 'off') return [];
  const length = route.getLength();
  const placements = courseTurns(route).flatMap(
    ({ distance, direction, apexDistance, exitDistance }) => {
      if (mode === 'few') {
        return [-6, 0, 6].map((offset) => ({
          distance: THREE.MathUtils.euclideanModulo(distance + offset, length),
          direction,
        }));
      }
      const start = distance - 6;
      const span =
        mode === 'many'
          ? THREE.MathUtils.euclideanModulo(exitDistance - start, length)
          : Math.max(0, THREE.MathUtils.euclideanModulo(apexDistance - start, length) - 6);
      const intervals = Math.max(2, Math.ceil(span / 8));
      return Array.from({ length: intervals + 1 }, (_, index) => ({
        distance: THREE.MathUtils.euclideanModulo(start + (span * index) / intervals, length),
        direction,
      }));
    },
  );
  if (heightAt) {
    for (const { distance, direction } of courseCrestWarnings(route, heightAt)) {
      for (const offset of [-12, -6, 0]) {
        const signDistance = THREE.MathUtils.euclideanModulo(distance + offset, length);
        if (
          placements.some((sign) => {
            const gap = Math.abs(sign.distance - signDistance);
            return sign.direction === direction && Math.min(gap, length - gap) < 5;
          })
        )
          continue;
        placements.push({ distance: signDistance, direction });
      }
    }
  }
  return placements;
}

export const turnSignDimensions = {
  boardWidth: 0.8,
  boardHeight: 1,
  boardBottom: 1.45,
  boardThickness: 0.012,
  postSize: 0.05,
  postBuried: 0.15,
  postTopInset: 0.05,
  postZ: -0.045,
  centerOfMassHeight: 1.35,
};
const { boardWidth, boardHeight, boardBottom, postSize, postBuried, postTopInset, postZ } =
  turnSignDimensions;

function roundedRect(width: number, height: number, radius: number) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ShapeGeometry(shape, 6);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, (position.getX(i) - x) / width, (position.getY(i) - y) / height);
  }
  return geometry;
}

function random(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

// Paints the whole sign face (rim, sheeting, chevron, bolts) into one texture so nothing z-fights.
function faceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const context = canvas.getContext('2d')!;
  const { width, height } = canvas;
  context.fillStyle = '#c7c8c3';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#eea21f';
  context.fillRect(4, 4, width - 8, height - 8);
  const grime = context.createLinearGradient(0, 0, width, height);
  grime.addColorStop(0, 'rgba(255, 220, 140, 0.12)');
  grime.addColorStop(1, 'rgba(90, 50, 0, 0.12)');
  context.fillStyle = grime;
  context.fillRect(4, 4, width - 8, height - 8);
  const next = random(7);
  for (let i = 0; i < 900; i++) {
    context.fillStyle = `rgba(${next() > 0.5 ? '255, 230, 170' : '120, 70, 10'}, ${0.03 + next() * 0.05})`;
    context.fillRect(next() * width, next() * height, 1 + next() * 3, 1 + next() * 3);
  }
  // Chevron pointing right, filling the board like a W1-8 sign.
  const point = (x: number, y: number) => [x * width, (1 - y) * height] as const;
  context.fillStyle = '#141210';
  context.beginPath();
  [
    [0.96, 0.5],
    [0.52, 0.97],
    [0.05, 0.97],
    [0.49, 0.5],
    [0.05, 0.03],
    [0.52, 0.03],
  ].forEach(([x, y], i) => (i ? context.lineTo : context.moveTo).call(context, ...point(x, y)));
  context.closePath();
  context.fill();
  for (const y of [0.955, 0.045]) {
    const [cx, cy] = point(0.49, y);
    const bolt = context.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 8);
    bolt.addColorStop(0, '#f4f4f0');
    bolt.addColorStop(0.6, '#a8a9a5');
    bolt.addColorStop(1, '#5d5e5b');
    context.fillStyle = bolt;
    context.beginPath();
    context.arc(cx, cy, 8, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function postTexture(length: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#8e908b';
  context.fillRect(0, 0, 32, 32);
  context.fillStyle = 'rgba(255, 255, 255, 0.08)';
  context.fillRect(0, 0, 10, 32);
  context.fillStyle = '#2a2b29';
  context.beginPath();
  context.arc(16, 16, 4, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, length / 0.026);
  texture.anisotropy = 8;
  return texture;
}

export function createTurnSignFactory() {
  const postLength = boardBottom + boardHeight - postTopInset + postBuried;
  const postGeometry = new THREE.BoxGeometry(postSize, postLength, postSize);
  const boardGeometry = roundedRect(boardWidth, boardHeight, 0.05);
  const postMaterial = new THREE.MeshStandardMaterial({
    map: postTexture(postLength),
    metalness: 0.35,
    roughness: 0.55,
  });
  const backMaterial = new THREE.MeshStandardMaterial({
    color: 0xa9aba6,
    metalness: 0.4,
    roughness: 0.5,
  });
  const rightTexture = faceTexture();
  const leftTexture = rightTexture.clone();
  leftTexture.repeat.x = -1;
  leftTexture.offset.x = 1;
  const faceMaterials = [rightTexture, leftTexture].map(
    (map) =>
      new THREE.MeshStandardMaterial({
        map,
        roughness: 0.55,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: 0.08,
      }),
  );

  // The sign faces local +z; positive direction points the chevron to the viewer's left.
  return (direction: number) => {
    const sign = new THREE.Group();
    sign.name = 'turn-chevron-sign';
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(0, postLength / 2 - postBuried, postZ);
    post.castShadow = true;
    sign.add(post);

    const boardY = boardBottom + boardHeight / 2;
    const face = new THREE.Mesh(boardGeometry, faceMaterials[direction > 0 ? 1 : 0]);
    face.position.set(0, boardY, 0);
    face.castShadow = true;
    sign.add(face);

    const back = new THREE.Mesh(boardGeometry, backMaterial);
    back.position.set(0, boardY, -0.004);
    back.rotation.y = Math.PI;
    back.castShadow = true;
    sign.add(back);
    return sign;
  };
}

function octagon(radius: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const angle = Math.PI / 8 + (i * Math.PI) / 4;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

const stopGlyphs: Record<string, string[]> = {
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
};

function stopFaceTexture(halfHeight: number) {
  const size = 512;
  const pixels = new Uint8Array(size * size * 4);
  const innerHalfHeight = 0.35 * Math.cos(Math.PI / 8);
  const innerDiagonal = 0.35 * (Math.cos(Math.PI / 8) + Math.sin(Math.PI / 8));
  const letters = 'STOP';
  const cell = 0.025;
  const gap = cell * 0.65;
  const totalWidth = letters.length * 5 * cell + (letters.length - 1) * gap;
  const height = 7 * cell;
  // Raw pixels work in workers and survive Object3D serialization without DOM image loading.
  for (let row = 0; row < size; row++) {
    const y = ((row + 0.5) / size - 0.5) * halfHeight * 2;
    for (let column = 0; column < size; column++) {
      const x = ((column + 0.5) / size - 0.5) * halfHeight * 2;
      const red =
        Math.max(Math.abs(x), Math.abs(y)) <= innerHalfHeight &&
        Math.abs(x) + Math.abs(y) <= innerDiagonal;
      const textX = x + totalWidth / 2;
      const letter = Math.floor(textX / (5 * cell + gap));
      const glyphX = Math.floor((textX - letter * (5 * cell + gap)) / cell);
      const glyphY = Math.floor((height / 2 - y) / cell);
      const white =
        letter >= 0 &&
        letter < letters.length &&
        glyphX >= 0 &&
        glyphX < 5 &&
        stopGlyphs[letters[letter]][glyphY]?.[glyphX] === '1';
      const offset = (row * size + column) * 4;
      pixels[offset] = white ? 255 : red ? 201 : 242;
      pixels[offset + 1] = white ? 255 : red ? 34 : 238;
      pixels[offset + 2] = white ? 255 : red ? 39 : 227;
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function createStopSignFactory() {
  const postLength = boardBottom + boardHeight - postTopInset + postBuried;
  const postGeometry = new THREE.BoxGeometry(postSize, postLength, postSize);
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x858985,
    metalness: 0.35,
    roughness: 0.55,
  });
  const backMaterial = new THREE.MeshStandardMaterial({
    color: 0xa9aba6,
    metalness: 0.4,
    roughness: 0.5,
  });
  const radius = 0.39;
  const halfHeight = radius * Math.cos(Math.PI / 8);
  const boardGeometry = octagon(radius);
  const positions = boardGeometry.getAttribute('position');
  const uv = boardGeometry.getAttribute('uv');
  for (let i = 0; i < positions.count; i++)
    uv.setXY(
      i,
      positions.getX(i) / (halfHeight * 2) + 0.5,
      positions.getY(i) / (halfHeight * 2) + 0.5,
    );
  const faceMaterial = new THREE.MeshStandardMaterial({
    map: stopFaceTexture(halfHeight),
    roughness: 0.72,
  });

  return () => {
    const sign = new THREE.Group();
    sign.name = 'stop-sign';
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(0, postLength / 2 - postBuried, postZ);
    post.castShadow = true;
    sign.add(post);

    const boardY = postLength - postBuried + postTopInset - halfHeight;
    const back = new THREE.Mesh(boardGeometry, backMaterial);
    back.position.set(0, boardY, -0.004);
    back.rotation.y = Math.PI;
    back.castShadow = true;
    sign.add(back);
    const face = new THREE.Mesh(boardGeometry, faceMaterial);
    face.name = 'stop-sign-face';
    face.position.set(0, boardY, 0);
    face.castShadow = true;
    sign.add(face);
    return sign;
  };
}
