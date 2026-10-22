import type { VehicleAudio } from './audio';
import type * as THREE from 'three';
import { coneDimensions } from './course';
import {
  createPhysicsVisuals,
  type PhysicsPluginContext,
  type PhysicsPlugin,
} from './physics-plugin';

interface ConePhysicsOptions {
  course: { cones: THREE.Object3D[]; cornerCones: THREE.Object3D[] };
  audio: Pick<VehicleAudio, 'hitCone'>;
}

export function createConePhysics(
  context: PhysicsPluginContext,
  { course, audio }: ConePhysicsOptions,
) {
  const { Ammo, world, dispatcher, vehicleBody, createRigidBody, setBodyEnabled } = context;
  const { cones } = course;
  const cornerIndices = new Set((course.cornerCones ?? []).map((cone) => cones.indexOf(cone)));
  const starts = cones.map((cone) => cone.position.clone());
  const rotations = cones.map((cone) => cone.quaternion.clone());
  const vector = new Ammo.btVector3(0, 0, 0);
  const resetTransform = new Ammo.btTransform();
  resetTransform.setIdentity();
  const shape = new Ammo.btCompoundShape();
  const bodyShape = new Ammo.btConvexHullShape();
  const { height, bottomRadius, topRadius, baseWidth, baseHeight, centerOfMassHeight } =
    coneDimensions;
  for (const [y, radius] of [
    [baseHeight - centerOfMassHeight, bottomRadius],
    [height - centerOfMassHeight, topRadius],
  ]) {
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      vector.setValue(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      bodyShape.addPoint(vector, true);
    }
  }
  bodyShape.setMargin(0.005);
  shape.addChildShape(resetTransform, bodyShape);
  vector.setValue(baseWidth / 2, baseHeight / 2, baseWidth / 2);
  const baseShape = new Ammo.btBoxShape(vector);
  baseShape.setMargin(0.005);
  vector.setValue(0, baseHeight / 2 - centerOfMassHeight, 0);
  resetTransform.setOrigin(vector);
  shape.addChildShape(resetTransform, baseShape);
  const bodies = cones.map((mesh) => {
    const body = createRigidBody(3, shape, mesh.position);
    const transform = body.getWorldTransform();
    const rotation = new Ammo.btQuaternion(
      mesh.quaternion.x,
      mesh.quaternion.y,
      mesh.quaternion.z,
      mesh.quaternion.w,
    );
    transform.setRotation(rotation);
    body.setCenterOfMassTransform(transform);
    body.getMotionState().setWorldTransform(transform);
    world.updateSingleAabb(body);
    Ammo.destroy(rotation);
    body.setFriction(0.7);
    body.setRestitution(0.15);
    body.setDamping(0.08, 0.12);
    body.setCcdMotionThreshold(0.1);
    body.setCcdSweptSphereRadius(0.12);
    body.setActivationState(2);
    return body;
  });
  const vehiclePointer = Ammo.getPointer(vehicleBody);
  const ids = new Map(bodies.map((body, index) => [Ammo.getPointer(body), index]));
  const soundCooldowns = new Map<number, number>();
  let enabled = true;
  let cornerOnly = false;
  const isActive = (index: number) => enabled && (!cornerOnly || cornerIndices.has(index));
  const visuals = createPhysicsVisuals(cones, isActive);

  function captureVisuals(snap: boolean) {
    cones.forEach((cone, index) => {
      if (!isActive(index)) return;
      const transform = bodies[index].getWorldTransform();
      const position = transform.getOrigin();
      const rotation = transform.getRotation();
      cone.position.set(position.x(), position.y(), position.z());
      cone.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    });
    visuals.capture(snap);
  }

  function resetBodies() {
    bodies.forEach((body, index) => {
      if (!isActive(index)) return;
      resetTransform.setIdentity();
      const start = starts[index];
      const rotation = rotations[index];
      const bodyRotation = new Ammo.btQuaternion(rotation.x, rotation.y, rotation.z, rotation.w);
      resetTransform.setRotation(bodyRotation);
      Ammo.destroy(bodyRotation);
      vector.setValue(start.x, start.y, start.z);
      resetTransform.setOrigin(vector);
      body.setCenterOfMassTransform(resetTransform);
      body.getMotionState().setWorldTransform(resetTransform);
      vector.setValue(0, 0, 0);
      body.setLinearVelocity(vector);
      body.setAngularVelocity(vector);
      body.clearForces();
      // Placed props start asleep; collisions still wake them normally.
      body.setActivationState(2);
      world.updateSingleAabb(body);
    });
  }

  return {
    setEnabled(nextEnabled: boolean, onlyCorners = false) {
      if (nextEnabled === enabled && onlyCorners === cornerOnly) return;
      enabled = nextEnabled;
      cornerOnly = onlyCorners;
      bodies.forEach((body, index) => {
        const active = isActive(index);
        cones[index].visible = active;
        setBodyEnabled(body, active);
      });
      if (enabled) {
        resetBodies();
        captureVisuals(true);
      }
    },
    reset() {
      soundCooldowns.clear();
      resetBodies();
    },
    beforeStep(dt: number) {
      for (const [cone, remaining] of soundCooldowns) {
        if (remaining <= dt) soundCooldowns.delete(cone);
        else soundCooldowns.set(cone, remaining - dt);
      }
    },
    afterStep() {
      for (let i = 0; i < dispatcher.getNumManifolds(); i++) {
        const manifold = dispatcher.getManifoldByIndexInternal(i);
        const first = Ammo.getPointer(manifold.getBody0());
        const second = Ammo.getPointer(manifold.getBody1());
        const cone =
          first === vehiclePointer
            ? ids.get(second)
            : second === vehiclePointer
              ? ids.get(first)
              : undefined;
        if (cone === undefined || !isActive(cone)) continue;
        let impulse = 0;
        let touching = false;
        for (let j = 0; j < manifold.getNumContacts(); j++) {
          const point = manifold.getContactPoint(j);
          if (point.getDistance() <= 0) {
            touching = true;
            impulse += point.getAppliedImpulse();
          }
        }
        if (touching) {
          context.laps.hitCone(cone);
          if (impulse >= 0.5 && !soundCooldowns.has(cone)) {
            audio.hitCone(impulse);
            soundCooldowns.set(cone, 0.3);
          }
        }
      }
    },
    captureVisuals,
    interpolate: visuals.interpolate,
    dispose() {
      Ammo.destroy(shape);
      Ammo.destroy(bodyShape);
      Ammo.destroy(baseShape);
      Ammo.destroy(resetTransform);
      Ammo.destroy(vector);
    },
  } satisfies PhysicsPlugin & { setEnabled(enabled: boolean, onlyCorners?: boolean): void };
}
