import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let createCloudLayer;
let daylight;
const width = 256;
const height = 128;
const sunset = { cloudLight: '#ffd0a3', cloudShade: '#776f91', sunOffset: [-42, 12, -20] };
const noon = { cloudLight: '#fffaf0', cloudShade: '#849bb8', sunOffset: [-20, 35, -12] };
const night = { cloudLight: '#33415c', cloudShade: '#111b30', sunOffset: [-20, 35, -12] };

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ createCloudLayer } = await server.ssrLoadModule('/src/clouds.ts'));
  ({ daylight } = await server.ssrLoadModule('/src/lighting.ts'));
});

after(async () => {
  await server?.close();
});

test('clouds are deterministic, seamless, varied, and confined above the horizon', () => {
  const pixels = createCloudLayer(width, height)(sunset);
  assert.equal(pixels.length, width * height * 4);
  assert.deepEqual(pixels, createCloudLayer(width, height)(sunset));
  let cloudPixels = 0;
  let clearPixels = 0;
  let softPixels = 0;
  for (let y = 0; y < height; y++) {
    const left = y * width * 4;
    const right = (y * width + width - 1) * 4;
    assert.deepEqual(pixels.slice(left, left + 4), pixels.slice(right, right + 4));
    for (let x = 0; x < width; x++) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (y >= height / 2) assert.equal(alpha, 0);
      else {
        if (alpha > 128) cloudPixels++;
        if (alpha === 0) clearPixels++;
        if (alpha > 0 && alpha < 128) softPixels++;
      }
    }
  }
  const skyPixels = (width * height) / 2;
  assert.ok(cloudPixels > skyPixels * 0.05 && cloudPixels < skyPixels * 0.65);
  assert.ok(clearPixels > skyPixels * 0.1);
  assert.ok(softPixels > skyPixels * 0.1);
});

test('time-of-day colors change without moving clouds, and night clouds stay subdued', () => {
  const paint = createCloudLayer(width, height);
  const sunsetPixels = paint(sunset).slice();
  const noonPixels = paint(noon).slice();
  const nightPixels = paint(night);
  let sunsetRed = 0;
  let sunsetBlue = 0;
  let noonBrightness = 0;
  let nightBrightness = 0;
  for (let i = 0; i < sunsetPixels.length; i += 4) {
    assert.equal(sunsetPixels[i + 3], noonPixels[i + 3]);
    assert.equal(sunsetPixels[i + 3], nightPixels[i + 3]);
    const weight = sunsetPixels[i + 3] / 255;
    sunsetRed += sunsetPixels[i] * weight;
    sunsetBlue += sunsetPixels[i + 2] * weight;
    noonBrightness += (noonPixels[i] + noonPixels[i + 1] + noonPixels[i + 2]) * weight;
    nightBrightness += (nightPixels[i] + nightPixels[i + 1] + nightPixels[i + 2]) * weight;
  }
  assert.ok(sunsetRed > sunsetBlue);
  assert.ok(nightBrightness < noonBrightness * 0.3);
});

test('baked sunset and night presets remain deterministic across palette switches', () => {
  const paint = createCloudLayer(width, height);
  for (const preset of [daylight.sunset, daylight.night, daylight.sunset]) {
    assert.deepEqual(paint(preset), createCloudLayer(width, height)(preset));
  }
});
