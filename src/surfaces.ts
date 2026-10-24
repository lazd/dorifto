import * as THREE from 'three';

export function surfaceMaterial(surface: 'asphalt' | 'gravel' | 'grass', repeats = 1) {
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
  const patches = Array.from({ length: 64 }, random);
  const patchAt = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const u = THREE.MathUtils.smoothstep(x - ix, 0, 1);
    const v = THREE.MathUtils.smoothstep(y - iy, 0, 1);
    const at = (dx: number, dy: number) => patches[((iy + dy) % 8) * 8 + ((ix + dx) % 8)];
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(at(0, 0), at(1, 0), u),
      THREE.MathUtils.lerp(at(0, 1), at(1, 1), u),
      v,
    );
  };
  const roughness = surface === 'asphalt' ? new Uint8Array(256 * 256 * 4) : undefined;
  for (let i = 0; i < image.data.length; i += 4) {
    const x = (i / 4) % 256;
    const y = Math.floor(i / 4 / 256);
    const patch = patchAt(x / 32, y / 32);
    const grain = random();
    const shade =
      surface === 'asphalt' ? 56 + patch * 5 + grain * 8 : 115 + patch * 22 + grain * 18;
    image.data[i] = shade * (surface === 'grass' ? 0.68 : 1);
    image.data[i + 1] = shade * (surface === 'grass' ? 0.7 : surface === 'asphalt' ? 1.02 : 0.87);
    image.data[i + 2] = shade * (surface === 'grass' ? 0.45 : surface === 'asphalt' ? 1.04 : 0.68);
    image.data[i + 3] = 255;
    if (roughness) {
      const value = Math.round((0.88 + patch * 0.08) * 255);
      roughness[i] = roughness[i + 1] = roughness[i + 2] = value;
      roughness[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  if (surface === 'gravel') {
    for (let i = 0; i < 2400; i++) {
      const shade = Math.floor(113 + random() * 30);
      context.fillStyle = `rgb(${shade}, ${Math.floor(shade * 0.9)}, ${Math.floor(shade * 0.74)})`;
      context.beginPath();
      context.ellipse(
        random() * 256,
        random() * 256,
        0.5 + random() * 1.7,
        0.5 + random(),
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }
  if (surface === 'grass') {
    for (let i = 0; i < 9000; i++) {
      const x = random() * 256;
      const y = random() * 256;
      const shade = 80 + random() * 25;
      const dry = random() < 0.45;
      context.strokeStyle = dry
        ? `rgb(${Math.floor(shade)}, ${Math.floor(shade * 0.88)}, ${Math.floor(shade * 0.58)})`
        : `rgb(${Math.floor(shade * 0.7)}, ${Math.floor(shade * 0.85)}, ${Math.floor(shade * 0.48)})`;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (random() - 0.5) * 3, y - 1 - random() * 4);
      context.stroke();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.setScalar(repeats);
  map.anisotropy = 8;
  if (roughness) {
    const roughnessMap = new THREE.DataTexture(roughness, 256, 256);
    roughnessMap.flipY = true;
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.repeat.setScalar(repeats);
    roughnessMap.magFilter = THREE.LinearFilter;
    roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
    roughnessMap.generateMipmaps = true;
    roughnessMap.anisotropy = 8;
    roughnessMap.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map,
      bumpMap: map,
      bumpScale: 0.012,
      roughnessMap,
      roughness: 1,
    });
  }
  const pixels = context.getImageData(0, 0, 256, 256).data;
  const normals = new Uint8Array(256 * 256 * 4);
  const heightAt = (x: number, y: number) => {
    const i = (((y + 256) % 256) * 256 + ((x + 256) % 256)) * 4;
    return (pixels[i] + pixels[i + 1] + pixels[i + 2]) / (3 * 255);
  };
  const normal = new THREE.Vector3();
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      normal
        .set(
          (heightAt(x - 1, y) - heightAt(x + 1, y)) * 2,
          (heightAt(x, y - 1) - heightAt(x, y + 1)) * 2,
          1,
        )
        .normalize();
      const i = (y * 256 + x) * 4;
      normals[i] = Math.round((normal.x * 0.5 + 0.5) * 255);
      normals[i + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      normals[i + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      normals[i + 3] = 255;
    }
  }
  const normalMap = new THREE.DataTexture(normals, 256, 256);
  normalMap.flipY = true;
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.setScalar(repeats);
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.generateMipmaps = true;
  normalMap.anisotropy = 8;
  normalMap.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.96,
  });
}
