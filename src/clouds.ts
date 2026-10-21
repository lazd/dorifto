import { Color, MathUtils, Vector3 } from 'three';

interface CloudPalette {
  cloudLight: string;
  cloudShade: string;
  sunOffset: readonly [number, number, number];
}

function hash(x: number, y: number) {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 4294967295;
}

function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const u = MathUtils.smoothstep(x - ix, 0, 1);
  const v = MathUtils.smoothstep(y - iy, 0, 1);
  return MathUtils.lerp(
    MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), u),
    MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u),
    v,
  );
}

function fractalNoise(x: number, y: number) {
  let value = 0;
  let amplitude = 0.5;
  for (let octave = 0; octave < 5; octave++) {
    value += noise(x, y) * amplitude;
    const nextX = x * 1.8 + y * 0.8 + 13.7;
    y = y * 1.8 - x * 0.8 + 5.2;
    x = nextX;
    amplitude *= 0.5;
  }
  return value / 0.96875;
}

export function createCloudLayer(width: number, height: number) {
  const coverage = new Float32Array(width * height);
  const longitude = Array.from({ length: width }, (_, x) => (x / (width - 1) - 0.5) * Math.PI * 2);
  const latitude = Array.from({ length: height }, (_, y) => (0.5 - y / (height - 1)) * Math.PI);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height / 2; y++) {
    const up = Math.sin(latitude[y]);
    const radius = Math.cos(latitude[y]);
    const horizonFade = MathUtils.smoothstep(up, 0.025, 0.12);
    for (let x = 0; x < width; x++) {
      // Project onto a cloud layer above the viewer: distant clouds flatten toward the horizon.
      const px = radius * Math.cos(longitude[x]) / (up + 0.18);
      const pz = radius * Math.sin(longitude[x]) / (up + 0.18);
      const billows = MathUtils.smoothstep(fractalNoise(px * 2.6, pz * 2.6), 0.46, 0.64);
      const wisps = MathUtils.smoothstep(fractalNoise(px * 0.9 + 23, pz * 7 - 11), 0.58, 0.72) * 0.3;
      coverage[y * width + x] = Math.max(billows, wisps) * horizonFade;
    }
  }

  return (palette: CloudPalette) => {
    const light = new Color(palette.cloudLight).convertLinearToSRGB();
    const shade = new Color(palette.cloudShade).convertLinearToSRGB();
    const sun = new Vector3().fromArray(palette.sunOffset).normalize();
    for (let y = 0; y < height / 2; y++) {
      const up = Math.sin(latitude[y]);
      const radius = Math.cos(latitude[y]);
      for (let x = 0; x < width; x++) {
        const density = coverage[y * width + x];
        if (density === 0) continue;
        const sunward = Math.max(0, radius * Math.cos(longitude[x]) * sun.x
          + up * sun.y + radius * Math.sin(longitude[x]) * sun.z) ** 4;
        const edgeLight = (1 - density) ** 2 * sunward;
        const illumination = Math.min(1, 0.25 + sunward * 0.5 + edgeLight * 0.2 + up * 0.08);
        const index = (y * width + x) * 4;
        pixels[index] = MathUtils.lerp(shade.r, light.r, illumination) * 255;
        pixels[index + 1] = MathUtils.lerp(shade.g, light.g, illumination) * 255;
        pixels[index + 2] = MathUtils.lerp(shade.b, light.b, illumination) * 255;
        pixels[index + 3] = density * 235;
      }
    }
    return pixels;
  };
}
