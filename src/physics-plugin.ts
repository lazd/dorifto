import * as THREE from 'three';
import type AmmoFactory from 'ammojs-typed';
import type { LapTimer } from './laps';

export interface PhysicsPluginContext {
  Ammo: typeof AmmoFactory;
  world: AmmoFactory.btDiscreteDynamicsWorld;
  dispatcher: AmmoFactory.btCollisionDispatcher;
  vehicleBody: AmmoFactory.btRigidBody;
  readonly laps: LapTimer;
  createRigidBody(
    mass: number,
    shape: AmmoFactory.btCollisionShape,
    position: THREE.Vector3,
  ): AmmoFactory.btRigidBody;
  setBodyEnabled(body: AmmoFactory.btRigidBody, enabled: boolean): void;
}

export interface PhysicsPlugin {
  beforeStep?(dt: number): void;
  afterStep?(dt: number): void;
  reset?(): void;
  captureVisuals?(snap: boolean): void;
  interpolate?(alpha: number): void;
  // Bodies and motion states are already destroyed; release plugin-owned shapes and temporaries here.
  dispose?(): void;
}

export function createPhysicsVisuals(
  objects: readonly THREE.Object3D[],
  isActive = (_index: number) => true,
) {
  const states = objects.map((object) => ({
    object,
    previousPosition: object.position.clone(),
    position: object.position.clone(),
    previousRotation: object.quaternion.clone(),
    rotation: object.quaternion.clone(),
  }));
  return {
    capture(snap = false) {
      states.forEach((state, index) => {
        if (!isActive(index)) return;
        state.previousPosition.copy(state.position);
        state.previousRotation.copy(state.rotation);
        state.position.copy(state.object.position);
        state.rotation.copy(state.object.quaternion);
        if (snap) {
          state.previousPosition.copy(state.position);
          state.previousRotation.copy(state.rotation);
        }
      });
    },
    interpolate(alpha: number) {
      states.forEach((state, index) => {
        if (!isActive(index)) return;
        state.object.position.lerpVectors(state.previousPosition, state.position, alpha);
        state.object.quaternion.slerpQuaternions(state.previousRotation, state.rotation, alpha);
      });
    },
  };
}
