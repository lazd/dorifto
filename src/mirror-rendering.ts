import type * as THREE from 'three';

/** Keep the drivable course and vehicles, but omit expensive surrounding scenery. */
export function hideMirrorScenery(scene: THREE.Scene) {
  const objects = ['scenery', 'roadside-grass'].flatMap((name) => {
    const object = scene.getObjectByName(name);
    return object ? [{ object, visible: object.visible }] : [];
  });
  for (const { object } of objects) object.visible = false;
  return () => {
    for (const { object, visible } of objects) object.visible = visible;
  };
}

export function mirrorEnabled(
  cabin: boolean,
  resolution: string,
  passenger: boolean,
  passengerEnabled: boolean,
) {
  return cabin && resolution !== 'off' && (!passenger || passengerEnabled);
}
