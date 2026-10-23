import * as THREE from 'three';
import type { BotThinking } from './race-bot';
import { createSegmentedDisplay, mapDisplaySurface } from './segmented-display';

const maneuverLabels = {
  'racing-line': 'CRUISE',
  attacking: 'ATTACK',
  returning: 'RETURN',
} satisfies Record<BotThinking['maneuver'], string>;
const plateColumns = 'BRAKE STOP'.length;

export function botPlateText(thinking: BotThinking | null) {
  if (!thinking) return '--\n--\n--';
  const { slowing, braking, stoppingBackward } = thinking.conditions;
  const pedal = braking ? 'BRAKE' : slowing ? 'LIFT' : '';
  const conditions = [pedal, stoppingBackward ? 'STOP' : ''].filter(Boolean).join(' ');
  return `${maneuverLabels[thinking.maneuver]}\n${conditions || '--'}\n${thinking.conditions.stabilizing ? 'OH SHIT' : '--'}`;
}

export function createBotPlate(chassis: THREE.Group) {
  let plate: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]> | undefined;
  chassis.traverse((object) => {
    if (object instanceof THREE.Mesh && /^Frontplate_.*_ext_plate_rear_0$/.test(object.name))
      plate = object;
  });
  if (!plate) throw new Error('Missing bot license plate surface.');
  const mesh = plate;
  const originalGeometry = mesh.geometry;
  const originalMaterial = mesh.material;
  chassis.updateMatrixWorld(true);
  const transform = new THREE.Matrix4()
    .copy(chassis.matrixWorld)
    .invert()
    .multiply(mesh.matrixWorld);
  const geometry = originalGeometry.clone().applyMatrix4(transform);
  mapDisplaySurface(geometry);
  geometry.applyMatrix4(transform.invert());
  const display = createSegmentedDisplay(1024, 512, '#111516', '#ffffff', plateColumns, 3);
  const material = new THREE.MeshBasicMaterial({ map: display.texture });
  mesh.geometry = geometry;
  mesh.material = material;
  display.setText(botPlateText(null));
  return {
    setColor(color: THREE.ColorRepresentation) {
      material.color.set(color);
    },
    setThinking(thinking: BotThinking | null) {
      display.setText(botPlateText(thinking));
    },
    dispose() {
      mesh.geometry = originalGeometry;
      mesh.material = originalMaterial;
      geometry.dispose();
      material.dispose();
      display.texture.dispose();
    },
  };
}
