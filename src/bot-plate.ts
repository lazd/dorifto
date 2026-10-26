import * as THREE from 'three';
import type { BotThinking } from './race-bot';
import { createSegmentedDisplay, mapDisplaySurface } from './segmented-display';

const maneuverLabels = {
  'racing-line': 'CRUISE',
  chasing: 'CHASE',
  attacking: 'ATTACK',
  returning: 'RETURN',
  grip: 'GRIP',
  initiation: 'INIT',
  drift: 'DRIFT',
  termination: 'EXIT',
} satisfies Record<BotThinking['maneuver'], string>;
const plateColumns = 'BRAKE STOP'.length;
type PlateMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
const plateSurfaces = new WeakMap<
  PlateMesh,
  {
    geometry: PlateMesh['geometry'];
    material: PlateMesh['material'];
    displays: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  }
>();

export function botPlateText(thinking: BotThinking | null, finished = false) {
  if (finished) return 'FINISH\n\n';
  if (!thinking) return '';
  const { slowing, braking, stoppingBackward } = thinking.conditions;
  const pedal = braking ? 'BRAKE' : slowing ? 'LIFT' : '';
  const conditions = [pedal, stoppingBackward ? 'STOP' : ''].filter(Boolean).join(' ');
  const maneuver =
    thinking.phase === 'settling'
      ? 'ANTILAG'
      : thinking.phase === 'launching' &&
          (thinking.maneuver === 'racing-line' || thinking.maneuver === 'chasing')
        ? 'LAUNCH'
        : maneuverLabels[thinking.maneuver];
  return `${maneuver}\n${conditions || '--'}\n${thinking.conditions.stabilizing ? 'OH SHIT' : '--'}`;
}

export function createBotPlate(chassis: THREE.Group) {
  let plate: PlateMesh | undefined;
  chassis.traverse((object) => {
    if (object instanceof THREE.Mesh && /^Frontplate_.*_ext_plate_rear_0$/.test(object.name))
      plate = object;
  });
  if (!plate) throw new Error('Missing bot license plate surface.');
  const mesh = plate;
  let surface = plateSurfaces.get(mesh);
  if (!surface) {
    surface = { geometry: mesh.geometry, material: mesh.material, displays: [] };
    plateSurfaces.set(mesh, surface);
  }
  chassis.updateMatrixWorld(true);
  const transform = new THREE.Matrix4()
    .copy(chassis.matrixWorld)
    .invert()
    .multiply(mesh.matrixWorld);
  const geometry = surface.geometry.clone().applyMatrix4(transform);
  mapDisplaySurface(geometry);
  geometry.applyMatrix4(transform.invert());
  const display = createSegmentedDisplay(1024, 512, '#111516', '#ffffff', plateColumns, 3);
  const material = new THREE.MeshBasicMaterial({ map: display.texture });
  const attachment = { geometry, material };
  surface.displays.push(attachment);
  mesh.geometry = geometry;
  mesh.material = material;
  display.setText(botPlateText(null));
  return {
    setColor(color: THREE.ColorRepresentation) {
      material.color.set(color);
    },
    setThinking(thinking: BotThinking | null, finished = false) {
      display.setText(botPlateText(thinking, finished));
    },
    dispose() {
      const index = surface.displays.indexOf(attachment);
      if (index < 0) return;
      const wasActive = index === surface.displays.length - 1;
      surface.displays.splice(index, 1);
      if (wasActive) {
        const active = surface.displays.at(-1) ?? surface;
        mesh.geometry = active.geometry;
        mesh.material = active.material;
      }
      if (!surface.displays.length) plateSurfaces.delete(mesh);
      geometry.dispose();
      material.dispose();
      display.texture.dispose();
    },
  };
}
