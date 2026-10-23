import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';
import { loadTrainingCarModel } from '../scripts/bot-assets.mjs';

test('bot exteriors isolate lamps and render thinking on independent segmented plates', async (t) => {
  const previousDocument = globalThis.document;
  const context = {
    fillRect() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
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
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  const { createBotCar, botLampSettings, botColor } = await server.ssrLoadModule('/src/bot-car.ts');
  const { createBotPlate, botPlateText } = await server.ssrLoadModule('/src/bot-plate.ts');
  const model = await loadTrainingCarModel(server);
  const bot = createBotCar(
    {
      chassis: model,
      wheels: Array.from({ length: 4 }, () => new THREE.Group()),
      hubs: Array.from({ length: 4 }, () => new THREE.Group()),
    },
    0,
  );
  try {
    let originalPlate;
    model.traverse((mesh) => {
      if (/^Frontplate_.*_ext_plate_rear_0$/.test(mesh.name)) originalPlate = mesh;
    });
    assert.ok(originalPlate);
    const botPlate = bot.chassis.getObjectByName(originalPlate.name);
    assert.ok(botPlate);
    assert.notEqual(botPlate.geometry, originalPlate.geometry);
    assert.notEqual(botPlate.material, originalPlate.material);
    const thinking = {
      phase: 'driving',
      maneuver: 'attacking',
      conditions: { slowing: true, braking: true, stabilizing: true, stoppingBackward: true },
    };
    assert.equal(botPlateText(thinking), 'ATTACK\nBRAKE STOP\nOH SHIT');
    for (const slowing of [false, true]) {
      for (const braking of [false, true]) {
        const text = botPlateText({
          ...thinking,
          conditions: { slowing, braking, stabilizing: false, stoppingBackward: false },
        });
        assert.equal(text, `ATTACK\n${braking ? 'BRAKE' : slowing ? 'LIFT' : '--'}\n--`);
      }
    }
    assert.equal(botPlateText({ ...thinking, phase: 'launching' }), botPlateText(thinking));
    assert.equal(botPlateText({ ...thinking, phase: 'settling' }).split('\n')[0], 'ANTILAG');
    for (const maneuver of ['racing-line', 'chasing', 'attacking', 'returning']) {
      const text = botPlateText({ ...thinking, phase: 'launching', maneuver });
      assert.equal(
        text.split('\n')[0],
        maneuver === 'racing-line' || maneuver === 'chasing'
          ? 'LAUNCH'
          : botPlateText({ ...thinking, maneuver }).split('\n')[0],
      );
    }
    assert.equal(botPlateText({ ...thinking, maneuver: 'chasing' }), 'CHASE\nBRAKE STOP\nOH SHIT');
    assert.equal(
      botPlateText({
        ...thinking,
        maneuver: 'racing-line',
        conditions: { slowing: false, braking: false, stabilizing: false, stoppingBackward: false },
      }),
      'CRUISE\n--\n--',
    );
    const texture = botPlate.material.map;
    assert.equal(botPlate.material.color.getHex(), new THREE.Color(botColor(0)).getHex());
    const version = texture.version;
    bot.setThinking(thinking);
    assert.equal(texture.version, version + 1);
    bot.setThinking(structuredClone(thinking));
    assert.equal(texture.version, version + 1, 'unchanged text does not upload a texture');
    bot.setColor(botColor(1));
    assert.equal(botPlate.material.color.getHex(), new THREE.Color(botColor(1)).getHex());
    assert.equal(texture.version, version + 1, 'color changes do not redraw the texture');
    const geometry = originalPlate.geometry;
    const material = originalPlate.material;
    const fullDetailPlate = createBotPlate(model);
    fullDetailPlate.setThinking(thinking);
    assert.notEqual(originalPlate.material.map, texture);
    fullDetailPlate.dispose();
    assert.equal(originalPlate.geometry, geometry);
    assert.equal(originalPlate.material, material);
    const previousSession = createBotPlate(model);
    const nextSession = createBotPlate(model);
    const nextGeometry = originalPlate.geometry;
    const nextMaterial = originalPlate.material;
    previousSession.dispose();
    assert.equal(originalPlate.geometry, nextGeometry, 'old session preserves the new plate');
    assert.equal(originalPlate.material, nextMaterial);
    nextSession.setThinking(thinking);
    nextSession.dispose();
    assert.equal(originalPlate.geometry, geometry);
    assert.equal(originalPlate.material, material);
    const retainedSession = createBotPlate(model);
    const retainedMaterial = originalPlate.material;
    const failedSession = createBotPlate(model);
    failedSession.dispose();
    assert.equal(
      originalPlate.material,
      retainedMaterial,
      'failed handoff restores the active plate',
    );
    retainedSession.dispose();
    assert.equal(originalPlate.material, material);
    const lamps = [];
    model.traverse((mesh) => {
      if (!mesh.isMesh || !botLampSettings.some(({ pattern }) => pattern.test(mesh.name))) return;
      const copy = bot.chassis.getObjectByName(mesh.name);
      assert.ok(copy, `missing ${mesh.name}`);
      assert.notEqual(copy.material, mesh.material);
      lamps.push(copy);
    });
    for (const headlights of [false, true]) {
      bot.setHeadlights(headlights);
      for (const braking of [false, true]) {
        bot.setBraking(braking);
        for (const mesh of lamps) {
          const setting = botLampSettings.find(({ pattern }) => pattern.test(mesh.name));
          const expected =
            'reverse' in setting
              ? 0
              : 'headlight' in setting
                ? headlights
                  ? 8
                  : 0
                : braking
                  ? setting.braking
                  : setting.running;
          assert.equal(mesh.material.emissiveIntensity, expected, mesh.name);
        }
      }
    }
    bot.setReversing(true);
    for (const mesh of lamps.filter((mesh) =>
      botLampSettings.some((setting) => 'reverse' in setting && setting.pattern.test(mesh.name)),
    )) {
      assert.equal(mesh.material.emissiveIntensity, 4);
      bot.setReversing(false);
      assert.equal(mesh.material.emissiveIntensity, 0);
      bot.setReversing(true);
    }
  } finally {
    bot.dispose();
    model.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    await server.close();
  }
});
