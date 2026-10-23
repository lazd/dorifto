import * as THREE from 'three';
import type { PhysicsCar } from './vehicle-physics';
import { createBotPlate } from './bot-plate';
import { createGroundGlow, createUnderglow, type GroundHeight } from './ground-glow';

// Share exterior geometry/textures; omit cabin instruments and mirror renderers.
const exterior =
  /^(Body2|Front|Hood|rbumper|Wing|Mirrors|Windows|BlackTrim|Mustache|HLblack|hlglass|glasstails|glassmiddle|Glasstop|Rubber_|Cornerglass|FogGlass_|Projectorglass_|Chin_|Badge_|blacklights|tailinside|LightsInside|LicensePlate|platelight|185_T_)|^Cube_Black_0$|_(Badges|Engravings|Reverseref[12]|RefractionInd|Mufflers|Plastico(\.002)?)_0$/;

export const botLampSettings = [
  { pattern: /^tailbrake_/, color: 0xff1008, running: 0.6, braking: 6 },
  { pattern: /^184_001_001_BrakeRefraction_0$/, color: 0xff1008, running: 0.15, braking: 2.5 },
  { pattern: /^Positionbulbrear_/, color: 0xff1008, running: 1, braking: 1 },
  { pattern: /^(thirdrefraction|brakebulbrear)_/, color: 0xff1008, running: 0, braking: 5 },
  { pattern: /^(Cornerglass|Cornerlightbulb)_/, color: 0xff1008, running: 0.7, braking: 0.7 },
  { pattern: /^BulbsPos_/, color: 0xfff3dc, running: 4, braking: 4 },
  { pattern: /^Projectorglass_/, color: 0xffe2b8, running: 0, braking: 0, headlight: true },
  {
    pattern: /^(RevRefraction|Reversebulbs)_/,
    color: 0xfff6df,
    running: 0,
    braking: 0,
    reverse: true,
  },
  {
    pattern: /^(Indrefraction|IndRrear|IndLRear|Ind[LR]_Indicatorbulb|Fenderlight(LEFT|RIGHT))_/,
    color: 0xffa015,
    running: 0,
    braking: 0,
  },
] as const;

const botPalette = [
  { name: 'Cyan', hue: 0.55 },
  { name: 'Yellow', hue: 0.13 },
  { name: 'Purple', hue: 0.7 },
  { name: 'Green', hue: 0.34 },
] as const;

export function botName(index: number) {
  return botPalette[index % botPalette.length].name;
}

export function botColor(index: number) {
  return new THREE.Color().setHSL(botPalette[index % botPalette.length].hue, 0.8, 0.45).getStyle();
}

function createBotLights(source: THREE.Object3D) {
  source.updateMatrixWorld(true);
  const inverse = source.matrixWorld.clone().invert();
  const glows: THREE.Object3D[] = [];
  let front = 0;
  source.traverse((object) => {
    if (object.name !== 'headlight-beam-glow') return;
    const glow = object.clone(false);
    glow.matrix.copy(inverse).multiply(object.matrixWorld);
    glow.matrix.decompose(glow.position, glow.quaternion, glow.scale);
    glow.matrixAutoUpdate = false;
    glow.visible = false;
    glows.push(glow);
    front = Math.max(front, glow.position.z);
  });
  const headlightPool = createGroundGlow(
    'bot-headlight-pool',
    0xfff2e0,
    0.8,
    { x: 0, z: front + 9 },
    { width: 15, length: 25 },
  );
  const underglow = createUnderglow('bot-underglow', 0xffffff);
  const ground = [headlightPool, underglow];
  return {
    lensGlows: glows,
    groundGlows: ground.map(({ mesh }) => mesh),
    setHeadlights(enabled: boolean) {
      for (const glow of [...glows, headlightPool.mesh]) glow.visible = enabled;
    },
    setUnderglow(enabled: boolean) {
      underglow.mesh.visible = enabled;
    },
    setColor(color: THREE.ColorRepresentation) {
      underglow.setColor(color);
    },
    updateGround(matrix: THREE.Matrix4, heightAt: GroundHeight) {
      for (const glow of ground) if (glow.mesh.visible) glow.update(matrix, heightAt);
    },
    dispose() {
      for (const glow of ground) glow.dispose();
    },
  };
}

export function createBotCar(source: PhysicsCar, index: number) {
  const chassis = new THREE.Group();
  const materials: THREE.Material[] = [];
  const paintMaterials: THREE.MeshStandardMaterial[] = [];
  const lamps: {
    material: THREE.MeshStandardMaterial;
    settings: (typeof botLampSettings)[number];
  }[] = [];
  source.chassis.updateMatrixWorld(true);
  const inverse = source.chassis.matrixWorld.clone().invert();
  source.chassis.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const lamp = botLampSettings.find(({ pattern }) => pattern.test(object.name));
    if (!exterior.test(object.name) && !lamp) return;
    const mesh = new THREE.Mesh(object.geometry, object.material);
    mesh.name = object.name;
    if (
      (lamp || object.name.endsWith('_Paint_0')) &&
      object.material instanceof THREE.MeshStandardMaterial
    ) {
      const material = object.material.clone();
      if (lamp) {
        material.emissive.setHex(lamp.color);
        material.emissiveIntensity = lamp.running;
        if ('reverse' in lamp) material.color.setHex(0x555555);
        lamps.push({ material, settings: lamp });
      } else {
        material.color.setStyle(botColor(index));
        paintMaterials.push(material);
      }
      materials.push(material);
      mesh.material = material;
    }
    mesh.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    mesh.castShadow = mesh.receiveShadow = true;
    chassis.add(mesh);
  });
  let braking = false;
  let headlightsOn = false;
  let underglowOn = false;
  let reversing = false;
  function updateLamps() {
    for (const { material, settings } of lamps) {
      if ('reverse' in settings) material.color.setHex(reversing ? 0xffffff : 0x555555);
      material.emissiveIntensity =
        'reverse' in settings
          ? reversing
            ? 4
            : 0
          : 'headlight' in settings
            ? headlightsOn
              ? 8
              : 0
            : braking
              ? settings.braking
              : settings.running;
    }
  }
  const wheels = source.wheels.map((wheel) => {
    const group = new THREE.Group();
    for (const child of wheel.children) {
      if (child instanceof THREE.Mesh) {
        const mesh = new THREE.Mesh(child.geometry, child.material);
        mesh.position.copy(child.position);
        mesh.quaternion.copy(child.quaternion);
        mesh.scale.copy(child.scale);
        mesh.castShadow = true;
        group.add(mesh);
      }
    }
    return group;
  });
  const hubs = source.hubs.map((hub) => {
    const group = hub.clone();
    group.position.set(0, 0, 0);
    group.quaternion.identity();
    return group;
  });
  for (const root of [chassis, ...wheels, ...hubs]) {
    root.traverse((object) => {
      if (object === root) return;
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    });
  }
  const plate = createBotPlate(chassis);
  plate.setColor(botColor(index));
  const lights = createBotLights(source.chassis);
  chassis.add(...lights.lensGlows);
  lights.setColor(botColor(index));
  return {
    chassis,
    wheels,
    hubs,
    groundGlows: lights.groundGlows,
    /** Drape lit ground glows over the terrain at the chassis' current pose. */
    updateGround(heightAt: GroundHeight) {
      chassis.updateMatrix();
      lights.updateGround(chassis.matrix, heightAt);
    },
    setThinking: plate.setThinking,
    setColor(color: THREE.ColorRepresentation) {
      for (const material of paintMaterials) material.color.set(color);
      lights.setColor(color);
      plate.setColor(color);
    },
    setUnderglow(enabled: boolean) {
      if (underglowOn === enabled) return;
      underglowOn = enabled;
      lights.setUnderglow(enabled);
    },
    setBraking(value: boolean) {
      if (braking === value) return;
      braking = value;
      updateLamps();
    },
    setHeadlights(value: boolean) {
      if (headlightsOn === value) return;
      headlightsOn = value;
      lights.setHeadlights(value);
      updateLamps();
    },
    setReversing(value: boolean) {
      if (reversing === value) return;
      reversing = value;
      updateLamps();
    },
    dispose() {
      plate.dispose();
      lights.dispose();
      chassis.removeFromParent();
      for (const object of [...wheels, ...hubs]) object.removeFromParent();
      materials.forEach((material) => material.dispose());
    },
  };
}
