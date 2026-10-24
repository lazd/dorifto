import { Color, MathUtils, Vector3 } from 'three';

interface CloudPalette {
  cloudLight: string;
  cloudShade: string;
  cloudSun?: string;
  fairWeather?: boolean;
  sunOffset: readonly [number, number, number];
}

function hash(x: number, y: number) {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
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
  const detail = new Float32Array(width * height);
  const sunsetCoverage = new Float32Array(width * height);
  const fairCoverage = new Float32Array(width * height);
  const longitude = Array.from({ length: width }, (_, x) => (x / (width - 1) - 0.5) * Math.PI * 2);
  const latitude = Array.from({ length: height }, (_, y) => (0.5 - y / (height - 1)) * Math.PI);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height / 2; y++) {
    const up = Math.sin(latitude[y]);
    const radius = Math.cos(latitude[y]);
    const horizonFade = MathUtils.smoothstep(up, 0.025, 0.12);
    for (let x = 0; x < width; x++) {
      // Project onto a cloud layer above the viewer: distant clouds flatten toward the horizon.
      const px = (radius * Math.cos(longitude[x])) / (up + 0.18);
      const pz = (radius * Math.sin(longitude[x])) / (up + 0.18);
      const billowNoise = fractalNoise(px * 2.6, pz * 2.6);
      const billows = MathUtils.smoothstep(billowNoise, 0.46, 0.64);
      const wisps =
        MathUtils.smoothstep(fractalNoise(px * 0.9 + 23, pz * 7 - 11), 0.58, 0.72) * 0.3;
      coverage[y * width + x] = Math.max(billows, wisps) * horizonFade;
      fairCoverage[y * width + x] = MathUtils.smoothstep(billowNoise, 0.54, 0.67) * horizonFade;
      detail[y * width + x] = billowNoise;
      const banks = fractalNoise(px * 1.1 + 11, pz * 1.3 - 7) * 0.7 + billowNoise * 0.3;
      sunsetCoverage[y * width + x] = MathUtils.smoothstep(banks, 0.34, 0.58) * horizonFade;
    }
  }

  return (palette: CloudPalette) => {
    // Cloud masks differ by time of day, so skipped pixels must not retain the previous sky.
    pixels.fill(0);
    const sunset = palette.cloudSun !== undefined;
    const fair = palette.fairWeather === true;
    const light = new Color(palette.cloudLight).convertLinearToSRGB();
    const shade = new Color(palette.cloudShade).convertLinearToSRGB();
    const sunColor = palette.cloudSun ? new Color(palette.cloudSun).convertLinearToSRGB() : light;
    const sun = new Vector3().fromArray(palette.sunOffset).normalize();
    for (let y = 0; y < height / 2; y++) {
      const up = Math.sin(latitude[y]);
      const radius = Math.cos(latitude[y]);
      for (let x = 0; x < width; x++) {
        const density = (sunset ? sunsetCoverage : fair ? fairCoverage : coverage)[y * width + x];
        if (density === 0) continue;
        const sunFacing = Math.max(
          0,
          radius * Math.cos(longitude[x]) * sun.x +
            up * sun.y +
            radius * Math.sin(longitude[x]) * sun.z,
        );
        const sunward = sunFacing ** (sunset ? 2 : 4);
        const edgeLight = sunset ? 0 : (1 - density) ** 2 * sunward;
        const variation = detail[y * width + x] - 0.5;
        const lowCloud = 1 - MathUtils.smoothstep(up, 0.08, 0.55);
        const illumination = sunset
          ? MathUtils.clamp(
              0.03 + lowCloud * (0.3 + sunward * 0.7) + variation * 0.6 - density * 0.18,
              0,
              1,
            )
          : fair
            ? MathUtils.clamp(0.65 + sunward * 0.18 + up * 0.15 - density * 0.12, 0, 1)
            : MathUtils.clamp(0.25 + sunward * 0.5 + edgeLight * 0.2 + up * 0.08, 0, 1);
        // Low sunlight warms the undersides, not a narrow band around every silhouette.
        const glow = sunset
          ? MathUtils.smoothstep(sunFacing, 0.4, 0.99) *
            lowCloud *
            0.7 *
            MathUtils.smoothstep(density, 0.05, 0.55)
          : 0;
        const index = (y * width + x) * 4;
        pixels[index] =
          MathUtils.lerp(MathUtils.lerp(shade.r, light.r, illumination), sunColor.r, glow) * 255;
        pixels[index + 1] =
          MathUtils.lerp(MathUtils.lerp(shade.g, light.g, illumination), sunColor.g, glow) * 255;
        pixels[index + 2] =
          MathUtils.lerp(MathUtils.lerp(shade.b, light.b, illumination), sunColor.b, glow) * 255;
        pixels[index + 3] = density * 235;
      }
    }
    return pixels;
  };
}
