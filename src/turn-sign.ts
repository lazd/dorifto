import * as THREE from 'three';

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
const { boardWidth, boardHeight, boardBottom, postSize, postBuried, postTopInset, postZ } = turnSignDimensions;

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
  [[0.96, 0.5], [0.52, 0.97], [0.05, 0.97], [0.49, 0.5], [0.05, 0.03], [0.52, 0.03]]
    .forEach(([x, y], i) => (i ? context.lineTo : context.moveTo).call(context, ...point(x, y)));
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
    map: postTexture(postLength), metalness: 0.35, roughness: 0.55,
  });
  const backMaterial = new THREE.MeshStandardMaterial({ color: 0xa9aba6, metalness: 0.4, roughness: 0.5 });
  const rightTexture = faceTexture();
  const leftTexture = rightTexture.clone();
  leftTexture.repeat.x = -1;
  leftTexture.offset.x = 1;
  const faceMaterials = [rightTexture, leftTexture].map((map) => new THREE.MeshStandardMaterial({
    map, roughness: 0.55, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.08,
  }));

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
