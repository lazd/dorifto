import * as THREE from 'three';
import type { VehicleAudio } from './audio';
import { turnSignDimensions } from './turn-sign';
import { createPhysicsVisuals, type PhysicsPlugin, type PhysicsPluginContext } from './physics-plugin';

export function createTurnSignPhysics(
  context: PhysicsPluginContext,
  groups: readonly THREE.Group[],
  audio: Pick<VehicleAudio, 'hitTurnSign'>,
) {
  const { Ammo, world, dispatcher } = context;
  const { boardWidth, boardHeight, boardBottom, boardThickness, postSize, postTopInset, postZ,
    centerOfMassHeight } = turnSignDimensions;
  const vector = new Ammo.btVector3(0, 0, 0);
  const transform = new Ammo.btTransform();
  transform.setIdentity();
  const shape = new Ammo.btCompoundShape();
  const postHeight = boardBottom + boardHeight - postTopInset;
  vector.setValue(postSize / 2, postHeight / 2, postSize / 2);
  const postShape = new Ammo.btBoxShape(vector);
  postShape.setMargin(0.005);
  vector.setValue(0, postHeight / 2 - centerOfMassHeight, postZ);
  transform.setOrigin(vector);
  shape.addChildShape(transform, postShape);
  vector.setValue(boardWidth / 2, boardHeight / 2, boardThickness / 2);
  const boardShape = new Ammo.btBoxShape(vector);
  boardShape.setMargin(0.005);
  vector.setValue(0, boardBottom + boardHeight / 2 - centerOfMassHeight, -0.002);
  transform.setOrigin(vector);
  shape.addChildShape(transform, boardShape);
  const offset = new THREE.Vector3();
  const entries = groups.flatMap((group) => group.children.map((object) => {
    const start = object.position.clone();
    const rotation = object.quaternion.clone();
    offset.set(0, centerOfMassHeight, 0).applyQuaternion(rotation);
    const body = context.createRigidBody(8, shape, start.clone().add(offset));
    body.setFriction(0.65);
    body.setRestitution(0.12);
    body.setDamping(0.08, 0.15);
    body.setCcdMotionThreshold(0.05);
    body.setCcdSweptSphereRadius(0.02);
    return { group, object, start, rotation, body, active: group.visible };
  }));
  const ids = new Map(entries.map((entry, index) => [Ammo.getPointer(entry.body), index]));
  const vehiclePointer = Ammo.getPointer(context.vehicleBody);
  const cooldowns = new Map<number, number>();
  const visuals = createPhysicsVisuals(entries.map(({ object }) => object), (index) => entries[index].active);

  function resetBody(entry: typeof entries[number]) {
    transform.setIdentity();
    offset.set(0, centerOfMassHeight, 0).applyQuaternion(entry.rotation).add(entry.start);
    vector.setValue(offset.x, offset.y, offset.z);
    transform.setOrigin(vector);
    const { x, y, z, w } = entry.rotation;
    const rotation = new Ammo.btQuaternion(x, y, z, w);
    transform.setRotation(rotation);
    Ammo.destroy(rotation);
    entry.body.setCenterOfMassTransform(transform);
    entry.body.getMotionState().setWorldTransform(transform);
    vector.setValue(0, 0, 0);
    entry.body.setLinearVelocity(vector);
    entry.body.setAngularVelocity(vector);
    entry.body.clearForces();
    // Stay planted until a collision wakes the sign.
    entry.body.setActivationState(2);
    // Removed bodies have no broadphase proxy; updating one corrupts collision detection.
    if (entry.active) world.updateSingleAabb(entry.body);
    entry.object.position.copy(entry.start);
    entry.object.quaternion.copy(entry.rotation);
  }

  function syncEnabled() {
    let changed = false;
    entries.forEach((entry, index) => {
      const active = entry.group.visible;
      if (entry.active === active) return;
      entry.active = active;
      context.setBodyEnabled(entry.body, active);
      cooldowns.delete(index);
      if (active) resetBody(entry);
      changed = true;
    });
    if (changed) visuals.capture(true);
  }

  entries.forEach((entry) => {
    resetBody(entry);
    context.setBodyEnabled(entry.body, entry.active);
  });
  visuals.capture(true);

  return {
    reset() {
      syncEnabled();
      cooldowns.clear();
      entries.forEach(resetBody);
    },
    beforeStep(dt: number) {
      syncEnabled();
      for (const [index, remaining] of cooldowns) {
        if (remaining <= dt) cooldowns.delete(index);
        else cooldowns.set(index, remaining - dt);
      }
    },
    afterStep() {
      for (let i = 0; i < dispatcher.getNumManifolds(); i++) {
        const manifold = dispatcher.getManifoldByIndexInternal(i);
        const first = Ammo.getPointer(manifold.getBody0());
        const second = Ammo.getPointer(manifold.getBody1());
        const sign = first === vehiclePointer ? ids.get(second)
          : second === vehiclePointer ? ids.get(first) : undefined;
        if (sign === undefined || !entries[sign].active || cooldowns.has(sign)) continue;
        let impulse = 0;
        for (let j = 0; j < manifold.getNumContacts(); j++) {
          const point = manifold.getContactPoint(j);
          if (point.getDistance() <= 0) impulse += point.getAppliedImpulse();
        }
        if (impulse < 1) continue;
        audio.hitTurnSign(impulse);
        cooldowns.set(sign, 0.2);
      }
    },
    captureVisuals(snap: boolean) {
      syncEnabled();
      for (const entry of entries) {
        if (!entry.active) continue;
        const pose = entry.body.getWorldTransform();
        const position = pose.getOrigin();
        const rotation = pose.getRotation();
        entry.object.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
        offset.set(0, centerOfMassHeight, 0).applyQuaternion(entry.object.quaternion);
        entry.object.position.set(position.x(), position.y(), position.z()).sub(offset);
      }
      visuals.capture(snap);
    },
    interpolate: visuals.interpolate,
    dispose() {
      Ammo.destroy(shape);
      Ammo.destroy(postShape);
      Ammo.destroy(boardShape);
      Ammo.destroy(transform);
      Ammo.destroy(vector);
    },
  } satisfies PhysicsPlugin;
}
