import * as THREE from 'three';

const strokes = [
  [2, 1, 10, 1],
  [11, 2, 11, 8],
  [11, 10, 11, 16],
  [2, 17, 10, 17],
  [1, 10, 1, 16],
  [1, 2, 1, 8],
  [2, 9, 5, 9],
  [7, 9, 10, 9],
  [2, 2, 5, 8],
  [6, 2, 6, 8],
  [10, 2, 7, 8],
  [7, 10, 10, 16],
  [6, 10, 6, 16],
  [5, 10, 2, 16],
] as const;

const glyphs: Record<string, readonly number[]> = {
  '0': [0, 1, 2, 3, 4, 5],
  '1': [1, 2],
  '2': [0, 1, 6, 7, 4, 3],
  '3': [0, 1, 2, 3, 6, 7],
  '4': [5, 6, 7, 1, 2],
  '5': [0, 5, 6, 7, 2, 3],
  '6': [0, 5, 4, 3, 2, 6, 7],
  '7': [0, 1, 2],
  '8': [0, 1, 2, 3, 4, 5, 6, 7],
  '9': [0, 1, 2, 3, 5, 6, 7],
  A: [0, 1, 2, 4, 5, 6, 7],
  B: [0, 1, 2, 3, 7, 9, 12],
  C: [0, 3, 4, 5],
  D: [0, 1, 2, 3, 9, 12],
  E: [0, 3, 4, 5, 6, 7],
  F: [0, 4, 5, 6, 7],
  G: [0, 2, 3, 4, 5, 7],
  H: [1, 2, 4, 5, 6, 7],
  I: [0, 3, 9, 12],
  J: [1, 2, 3, 4],
  K: [4, 5, 6, 10, 11],
  L: [3, 4, 5],
  M: [1, 2, 4, 5, 8, 10],
  N: [1, 2, 4, 5, 8, 11],
  O: [0, 1, 2, 3, 4, 5],
  P: [0, 1, 4, 5, 6, 7],
  Q: [0, 1, 2, 3, 4, 5, 11],
  R: [0, 1, 4, 5, 6, 7, 11],
  S: [0, 2, 3, 5, 6, 7],
  T: [0, 9, 12],
  U: [1, 2, 3, 4, 5],
  V: [4, 5, 10, 13],
  W: [1, 2, 4, 5, 11, 13],
  X: [8, 10, 11, 13],
  Y: [8, 10, 12],
  Z: [0, 3, 10, 13],
  '-': [6, 7],
  ' ': [],
};

export function clockText(date: Date) {
  return `${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`.padStart(
    5,
    ' ',
  );
}

export function createSegmentedDisplay(
  width: number,
  height: number,
  background: string,
  color: string,
  columns: number,
  rows = 1,
) {
  if (!Number.isInteger(columns) || columns <= 0)
    throw new Error('Display columns must be a positive integer.');
  if (!Number.isInteger(rows) || rows <= 0)
    throw new Error('Display rows must be a positive integer.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create segmented display canvas.');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  let previous = '';
  return {
    texture,
    setText(text: string) {
      const lines = text.toUpperCase().split('\n');
      text = Array.from({ length: rows }, (_, row) =>
        (lines[row] ?? '').slice(0, columns).padEnd(columns, ' '),
      ).join('\n');
      if (text === previous) return;
      previous = text;
      const rowHeight = height / rows;
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
      for (const [row, paddedLine] of text.split('\n').entries()) {
        const line = rows === 1 ? paddedLine : paddedLine.trimEnd();
        const scale = Math.min(width / (line.length * 15 + 16), rowHeight / 21);
        context.save();
        context.translate(
          (width - line.length * 15 * scale) / 2,
          row * rowHeight + (rowHeight - 18 * scale) / 2,
        );
        context.scale(scale, scale);
        context.strokeStyle = color;
        context.fillStyle = color;
        context.lineWidth = 1.15;
        context.lineCap = 'square';
        for (const character of line) {
          if (character === ':') {
            context.fillRect(5, 5, 2, 2);
            context.fillRect(5, 12, 2, 2);
          } else {
            const segments = glyphs[character];
            if (!segments) throw new Error(`Unsupported segmented display character: ${character}`);
            for (const index of segments) {
              const [x1, y1, x2, y2] = strokes[index];
              context.beginPath();
              context.moveTo(x1, y1);
              context.lineTo(x2, y2);
              context.stroke();
            }
          }
          context.translate(15, 0);
        }
        context.restore();
      }
      texture.needsUpdate = true;
    },
  };
}

export function mapDisplaySurface(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) throw new Error('Missing display surface bounds.');
  const size = bounds.getSize(new THREE.Vector3());
  if (size.x <= 0 || size.y <= 0) throw new Error('Invalid display surface dimensions.');
  const positions = geometry.getAttribute('position');
  const uv = new THREE.Float32BufferAttribute(positions.count * 2, 2);
  for (let i = 0; i < positions.count; i++) {
    uv.setXY(
      i,
      (bounds.max.x - positions.getX(i)) / size.x,
      (positions.getY(i) - bounds.min.y) / size.y,
    );
  }
  geometry.setAttribute('uv', uv);
}
