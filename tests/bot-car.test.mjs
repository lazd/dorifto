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
  const model = await loadTrainingCarModel(server);
  const glowAt = (name, x) => {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    glow.name = `${name}-glow`;
    glow.position.set(x, 0.5, 2);
    model.add(glow);
    return glow;
  };
  const sourceGlows = [-1, 1].map((x) => glowAt('headlight-beam', x));
  for (const name of ['fog-light', 'high-beam']) glowAt(name, 0);
  const sourceLight = new THREE.SpotLight();
  sourceLight.name = 'headlight-beam';
  model.add(sourceLight, new THREE.RectAreaLight());
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
    // Lit shaders compile per count of scene lights, so bots must not add any.
    bot.chassis.traverse((object) => assert.ok(!object.isLight, object.name));
    const botGlows = bot.chassis.children.filter((object) => object.name === 'headlight-beam-glow');
    assert.equal(botGlows.length, sourceGlows.length, 'only low-beam glows are copied');
    botGlows.forEach((glow, index) => {
      assert.ok(glow.position.distanceTo(sourceGlows[index].position) < 1e-10);
    });
    const [headlightPool, underglow] = bot.groundGlows;
    for (const glow of bot.groundGlows) assert.ok(!bot.chassis.getObjectById(glow.id));
    const underbody = bot.chassis.getObjectByName('Cube_Black_0');
    assert.ok(underbody, 'bots retain the existing underbody');
    assert.equal(underbody.geometry, model.getObjectByName(underbody.name).geometry);
    const underglowColor = () => underglow.material.uniforms.color.value.getHex();
    assert.equal(underglowColor(), new THREE.Color(botColor(0)).getHex());
    for (const enabled of [true, false]) {
      bot.setUnderglow(enabled);
      assert.equal(underglow.visible, enabled);
    }
    // Ground glows drape over the terrain ahead of the car's heading instead of a flat plane.
    bot.chassis.position.set(10, 3, -4);
    bot.chassis.rotation.set(0.2, Math.PI / 2, 0);
    bot.setHeadlights(true);
    const slope = (x, z) => 0.1 * x + 0.05 * z * z;
    bot.updateGround(slope);
    const positions = headlightPool.geometry.getAttribute('position');
    const point = new THREE.Vector3();
    const center = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i);
      assert.ok(Math.abs(point.y - slope(point.x, point.z) - 0.05) < 1e-6);
      center.add(point);
    }
    center.divideScalar(positions.count);
    assert.ok(
      center.x > 15 && Math.abs(center.z + 4) < 1e-6,
      'the pool lies ahead of a car heading +x',
    );
    bot.setHeadlights(false);
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
    assert.equal(underglowColor(), new THREE.Color(botColor(1)).getHex());
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
      for (const glow of [...botGlows, headlightPool]) assert.equal(glow.visible, headlights);
      for (const glow of sourceGlows) assert.equal(glow.visible, true);
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
    bot.dispose();
  } finally {
    sourceLight.dispose();
    model.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    await server.close();
  }
});
