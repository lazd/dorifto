import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertT300PedalMode,
  initialize,
  parseT300Model,
  t300Models,
  verifyNativeMode,
} from '../scripts/initialize-t300.mjs';

test('verification refreshes stale USB enumeration without accepting another port or mode', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  const generic = {
    busNumber: 1,
    portNumbers: [2, 3],
    deviceDescriptor: { idVendor: 0x044f, idProduct: 0xb65d },
  };
  const native = {
    ...generic,
    deviceDescriptor: { ...generic.deviceDescriptor, idProduct: 0xb66e },
  };
  let refreshed = false;
  const result = await verifyNativeMode(
    '1:2.3',
    () => [generic],
    async () => {
      refreshed = true;
      return [native];
    },
    async () => {},
  );
  assert.equal(result, native);
  assert.equal(refreshed, true);
  assert.equal(
    await verifyNativeMode(
      '1:2.3',
      () => [],
      async () => [
        {
          ...native,
          portNumbers: [4],
        },
      ],
      async () => {},
    ),
    undefined,
  );
  await assert.rejects(
    verifyNativeMode(
      '1:2.3',
      () => [],
      async () => [
        {
          ...native,
          deviceDescriptor: { ...native.deviceDescriptor, idProduct: 0xb66d },
        },
      ],
      async () => {},
    ),
    /is PS4 mode/,
  );
  assert.equal(
    await verifyNativeMode(
      '1:2.3',
      () => [],
      async () => {
        throw new Error('USB inspection unavailable');
      },
      async () => {},
    ),
    undefined,
  );
});

test('only verified PS3 / PC mode is accepted as ready for the pedal mapping', () => {
  assert.doesNotThrow(() => assertT300PedalMode(0xb66e));
  assert.throws(() => assertT300PedalMode(0xb66d), /is PS4 mode.*not the verified PS3/);
  assert.throws(() => assertT300PedalMode(0xb66f), /is PS3 advanced mode.*not the verified PS3/);
  assert.throws(() => assertT300PedalMode(0xb65d), /not the verified PS3/);
});

test('initializer accepts both model-response formats only for known attached T300 models', () => {
  for (const [type, length] of [
    [0x0049, 16],
    [0x0047, 8],
  ]) {
    for (const model of t300Models) {
      const response = Buffer.alloc(length);
      response.writeUInt16LE(type, 0);
      response.writeUInt16LE(model, 6);
      assert.equal(parseT300Model(response), model);
    }
  }
});

test('initializer refuses malformed, truncated, unidentified, and unattached wheels', () => {
  assert.throws(() => parseT300Model(null), /truncated/);
  assert.throws(() => parseT300Model(Buffer.alloc(7)), /truncated/);
  const response = Buffer.alloc(16);
  assert.throws(() => parseT300Model(response), /Unknown model response type/);
  response.writeUInt16LE(0x0049, 0);
  assert.throws(() => parseT300Model(response.subarray(0, 8)), /truncated extended/);
  for (const model of [0xffff, 0x0306, 0x0200]) {
    response.writeUInt16LE(model, 6);
    assert.throws(() => parseT300Model(response), /not a supported attached T300/);
  }
});

test('only a stall on the final switch permits native-mode verification', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  for (const stage of ['preparation', 'model', 'switch']) {
    const previousCalls = log.mock.callCount();
    const response = Buffer.alloc(16);
    response.writeUInt16LE(0x0049, 0);
    response.writeUInt16LE([...t300Models][0], 6);
    const stall = new Error('LIBUSB_TRANSFER_STALL');
    const device = {
      busNumber: 1,
      portNumbers: [2, 3],
      open() {},
      close() {},
      interfaces: [
        {
          isKernelDriverActive: () => false,
          claim() {},
          release: (_closeEndpoints, callback) => callback(),
          endpoints: [
            {
              direction: 'out',
              transferType: 3,
              transfer: (_packet, callback) => callback(stage === 'preparation' ? stall : null),
            },
          ],
        },
      ],
      controlTransfer(_type, request, _value, _index, _data, callback) {
        callback(stage === 'model' || request === 83 ? stall : null, response);
      },
    };
    let enumerated = false;
    const run = initialize(device, () => {
      enumerated = true;
      return [
        {
          busNumber: device.busNumber,
          portNumbers: device.portNumbers,
          deviceDescriptor: { idVendor: 0x044f, idProduct: 0xb66e },
        },
      ];
    });
    if (stage === 'switch') {
      assert.equal(await run, true);
      assert.match(log.mock.calls.at(-1).arguments[0], /^Initialization successful:/);
    } else await assert.rejects(run, /LIBUSB_TRANSFER_STALL/);
    assert.equal(enumerated, stage === 'switch');
    assert.equal(
      log.mock.calls
        .slice(previousCalls)
        .some(({ arguments: args }) => args[0].startsWith('Initialization successful:')),
      stage === 'switch',
    );
  }
});
