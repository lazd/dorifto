import * as THREE from 'three';

export function surfaceMaterial(surface: 'asphalt' | 'gravel', repeats = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create terrain texture');
  const image = context.createImageData(256, 256);
  let seed = 12345;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = random();
    const shade = surface === 'asphalt' ? 48 + grain * 24 : 105 + grain * 50;
    image.data[i] = shade;
    image.data[i + 1] = shade * (surface === 'asphalt' ? 1.03 : 0.87);
    image.data[i + 2] = shade * (surface === 'asphalt' ? 1.06 : 0.67);
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  if (surface === 'gravel') {
    for (let i = 0; i < 2400; i++) {
      const shade = Math.floor(85 + random() * 95);
      context.fillStyle = `rgb(${shade}, ${Math.floor(shade * 0.9)}, ${Math.floor(shade * 0.74)})`;
      context.beginPath();
      context.ellipse(random() * 256, random() * 256, 0.5 + random() * 1.7, 0.5 + random(), random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.setScalar(repeats);
  map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({
    map, bumpMap: map, bumpScale: surface === 'asphalt' ? 0.018 : 0.045, roughness: 0.96,
  });
}
