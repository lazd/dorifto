import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let display;
let THREE;
let stereoStations;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  display = await server.ssrLoadModule('/src/segmented-display.ts');
  THREE = await server.ssrLoadModule('three');
  ({ stereoStations } = await server.ssrLoadModule('/src/stereo.ts'));
});
after(async () => {
  await server?.close();
});

test('clock formats local 12-hour time with a blank leading hour cell and zero-padded minutes', () => {
  for (const [hour, minute, expected] of [
    [0, 0, '12:00'],
    [1, 7, ' 1:07'],
    [9, 5, ' 9:05'],
    [12, 30, '12:30'],
    [13, 7, ' 1:07'],
    [22, 0, '10:00'],
    [23, 59, '11:59'],
  ]) {
    assert.equal(display.clockText(new Date(2026, 9, 22, hour, minute)), expected);
  }
});

test('display renders all station IDs and clock characters and only uploads changed text', (t) => {
  const previousDocument = globalThis.document;
  let strokes = 0;
  const context = {
    fillRect() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      strokes++;
    },
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const readout = display.createSegmentedDisplay(512, 128, '#000000', '#ffffff', 8);
  for (const station of stereoStations) {
    readout.setText(station.id);
    const version = readout.texture.version;
    readout.setText(station.id);
    assert.equal(readout.texture.version, version);
  }
  readout.setText('01:23');
  const version = readout.texture.version;
  readout.setText('01:24');
  assert.equal(readout.texture.version, version + 1);
  assert.ok(strokes > 0);
  readout.setText(' ');
  readout.texture.dispose();
});

test('eight-column displays pad or truncate text without changing character size or alignment', (t) => {
  const previousDocument = globalThis.document;
  const scales = [];
  const translations = [];
  let slots = 0;
  const context = {
    fillRect() {},
    save() {},
    restore() {},
    translate(x, y) {
      if (x === 15 && y === 0) slots++;
      else translations.push([x, y]);
    },
    scale(x, y) {
      scales.push([x, y]);
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const readout = display.createSegmentedDisplay(1024, 256, '#000000', '#ffffff', 8);
  for (const text of [...stereoStations.map(({ id }) => id), 'A', 'ABCDEFGH-extra']) {
    const before = slots;
    readout.setText(text);
    assert.equal(slots - before, 8);
    assert.deepEqual(scales.at(-1), scales[0]);
    assert.deepEqual(translations.at(-1), translations[0]);
    assert.ok(translations.at(-1)[0] >= 1024 * 0.055);
  }
  const version = readout.texture.version;
  readout.setText('ABCDEFGH-different suffix');
  assert.equal(readout.texture.version, version);
  readout.texture.dispose();
});

test('display UVs face the cabin without mirroring or stretching outside the panel', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([1, 2, 3, 5, 2, 3, 1, 4, 4, 5, 4, 4], 3),
  );
  display.mapDisplaySurface(geometry);
  assert.deepEqual(Array.from(geometry.getAttribute('uv').array), [1, 0, 0, 0, 1, 1, 0, 1]);
  geometry.dispose();
});
