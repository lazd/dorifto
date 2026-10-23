import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';
import { loadTrainingCarModel } from '../scripts/bot-assets.mjs';

test('bot exteriors retain light geometry and isolate running, braking and reverse lamps', async () => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  const { createBotCar, botLampSettings } = await server.ssrLoadModule('/src/bot-car.ts');
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
