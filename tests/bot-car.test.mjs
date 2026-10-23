import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';
import { loadTrainingCarModel } from '../scripts/bot-assets.mjs';

test('bot exteriors share underbody and isolate lighting and segmented plates', async (t) => {
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
  const { headlightIntensity, carLightLayers, underglowIntensity } =
    await server.ssrLoadModule('/src/car.ts');
  const model = await loadTrainingCarModel(server);
  const sourceHeadlights = [-1, 1].map((side) => {
    const light = new THREE.SpotLight();
    light.name = 'headlight-beam';
    light.layers.set(carLightLayers.headlights);
    light.position.set(side, 0.5, 2);
    light.target.position.set(side, 0, 20);
    light.castShadow = true;
    light.intensity = 0;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    glow.name = 'headlight-beam-glow';
    glow.position.copy(light.position);
    model.add(light, light.target, glow);
    return { light, glow };
  });
  for (const name of ['fog-light', 'high-beam']) {
    const light = new THREE.SpotLight();
    light.name = name;
    model.add(light);
  }
  const sourceUnderglow = new THREE.RectAreaLight();
  sourceUnderglow.name = 'red-underglow';
  sourceUnderglow.intensity = 0;
  model.add(sourceUnderglow);
  model.position.set(5, 2, -3);
  model.rotation.y = Math.PI / 3;
  const bot = createBotCar(
    {
      chassis: model,
      wheels: Array.from({ length: 4 }, () => new THREE.Group()),
      hubs: Array.from({ length: 4 }, () => new THREE.Group()),
    },
    0,
  );
  try {
    const botHeadlights = bot.chassis.children.filter((object) => object.isSpotLight);
    const botGlows = bot.chassis.children.filter((object) => object.name === 'headlight-beam-glow');
    assert.equal(botHeadlights.length, sourceHeadlights.length, 'only low beams are copied');
    assert.equal(botGlows.length, sourceHeadlights.length);
    const underbody = bot.chassis.getObjectByName('Cube_Black_0');
    assert.ok(underbody, 'bots retain the existing underbody');
    assert.equal(underbody.geometry, model.getObjectByName(underbody.name).geometry);
    const underglow = bot.chassis.getObjectByName('bot-underglow');
    assert.ok(underglow?.isRectAreaLight);
    assert.notEqual(underglow, sourceUnderglow);
    assert.equal(underglow.color.getHex(), new THREE.Color(botColor(0)).getHex());
    for (const enabled of [true, false]) {
      bot.setUnderglow(enabled);
      assert.equal(underglow.intensity, enabled ? underglowIntensity : 0);
      assert.equal(sourceUnderglow.intensity, 0);
    }
    botHeadlights.forEach((light, index) => {
      const source = sourceHeadlights[index].light;
      assert.notEqual(light, source);
      assert.notEqual(light.target, source.target);
      assert.ok(light.position.distanceTo(source.position) < 1e-10);
      assert.ok(light.target.position.distanceTo(source.target.position) < 1e-10);
      assert.equal(light.target.parent, bot.chassis);
      assert.equal(light.layers.mask, source.layers.mask);
      assert.equal(light.castShadow, false);
    });
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
    assert.equal(underglow.color.getHex(), new THREE.Color(botColor(1)).getHex());
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
      for (const light of botHeadlights) {
        assert.equal(light.visible, true, 'switching headlights preserves the light count');
        assert.equal(light.intensity, headlights ? headlightIntensity : 0);
      }
      for (const glow of botGlows) assert.equal(glow.visible, headlights);
      for (const { light } of sourceHeadlights) assert.equal(light.intensity, 0);
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
    for (const { light } of sourceHeadlights) light.dispose();
    model.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    await server.close();
  }
});
