import * as THREE from 'three';
import type AmmoFactory from 'ammojs-typed';
import type { loadCar } from './car';
import type { courseSpawn } from './courses';
import type { DrivingControls } from './controls';
import type { LapTimer } from './laps';
import type { ConfigurationState } from './configuration-state';
import type { Store } from './store';
import { wattsPerHorsepower } from './configuration-state';
import { driveModes } from './drive-modes';
import { Drivetrain, wheelInertia, type DrivetrainInput } from './drivetrain';
import { vehicleSettings } from './vehicle-settings';
import {
  createPhysicsVisuals,
  type PhysicsPlugin,
  type PhysicsPluginContext,
} from './physics-plugin';
import type { HeightfieldData } from './terrain-query';
import { createPhysicsResources, createPhysicsWorld } from './physics-world';
export { createPhysicsResources, createPhysicsWorld } from './physics-world';

export type PhysicsControls = Pick<
  DrivingControls,
  'throttle' | 'brake' | 'reverse' | 'steer' | 'handbrake'
>;
export type PhysicsConfiguration = Pick<ConfigurationState, 'driveMode' | 'profiles' | 'coneMode'>;
export type PhysicsCar = Pick<
  Awaited<ReturnType<typeof loadCar>>,
  | 'centers'
  | 'radii'
  | 'widths'
  | 'collisionVertices'
  | 'setBraking'
  | 'setReversing'
  | 'setHazards'
> & {
  chassis: THREE.Object3D;
  wheels: THREE.Object3D[];
  hubs: THREE.Object3D[];
};

export interface ChassisPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

interface VehiclePhysicsOptions {
  Ammo: typeof AmmoFactory;
  resources: ReturnType<typeof createPhysicsResources>;
  car: PhysicsCar;
  course: {
    terrain: HeightfieldData & {
      heightAt(x: number, z: number): number;
      normalAt(x: number, z: number): THREE.Vector3;
    };
    isAsphalt(position: THREE.Vector3): boolean;
  };
  spawn: ReturnType<typeof courseSpawn>;
  controls: PhysicsControls;
  configurationState: Pick<Store<PhysicsConfiguration>, 'getState'>;
  laps: LapTimer;
  simulationWorld?: ReturnType<typeof createPhysicsWorld>;
}

export function createVehiclePhysics({
  Ammo,
  resources,
  car,
  course,
  spawn,
  controls,
  configurationState,
  laps,
  simulationWorld,
}: VehiclePhysicsOptions) {
  const { terrain, isAsphalt } = course;
  const settings = vehicleSettings;
  const { suspension } = settings;
  const frontAxleZ = (car.centers[0].z + car.centers[1].z) / 2;
  const rearAxleZ = (car.centers[2].z + car.centers[3].z) / 2;
  const centerOfMass = new THREE.Vector3(
    settings.centerOfMass.x,
    settings.centerOfMass.y,
    rearAxleZ + (frontAxleZ - rearAxleZ) * settings.frontWeightFraction,
  );
  const centerOfMassOffset = new THREE.Vector3();
  const lapPosition = new THREE.Vector3();
  const sharedWorld = simulationWorld ?? createPhysicsWorld(Ammo, resources, terrain);
  const { world, dispatcher } = sharedWorld;
  const vector = new Ammo.btVector3(0, 0, 0);
  const lapTirePoints = Array.from({ length: 12 }, () => new THREE.Vector3());
  const lapTireAcross = new THREE.Vector3();
  const rigidBodies = new Map<AmmoFactory.btRigidBody, AmmoFactory.btDefaultMotionState>();
  const enabledBodies = new Set<AmmoFactory.btRigidBody>();
  const plugins: PhysicsPlugin[] = [];
  let disposed = false;
  let enabled = true;

  function rigidBody(mass: number, shape: AmmoFactory.btCollisionShape, position: THREE.Vector3) {
    if (disposed) throw new Error('Cannot create a body in disposed vehicle physics');
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    vector.setValue(position.x, position.y, position.z);
    transform.setOrigin(vector);
    const motion = new Ammo.btDefaultMotionState(transform);
    vector.setValue(0, 0, 0);
    shape.calculateLocalInertia(mass, vector);
    const info = new Ammo.btRigidBodyConstructionInfo(mass, motion, shape, vector);
    const body = new Ammo.btRigidBody(info);
    world.addRigidBody(body);
    enabledBodies.add(body);
    rigidBodies.set(body, motion);
    Ammo.destroy(info);
    Ammo.destroy(transform);
    return body;
  }

  const chassisShape = new Ammo.btConvexHullShape();
  for (let i = 0; i < car.collisionVertices.length; i++) {
    const point = car.collisionVertices[i];
    vector.setValue(point.x - centerOfMass.x, point.y - centerOfMass.y, point.z - centerOfMass.z);
    chassisShape.addPoint(vector, i === car.collisionVertices.length - 1);
  }
  chassisShape.setMargin(settings.collisionMarginM);
  const body = rigidBody(
    settings.massKg,
    chassisShape,
    new THREE.Vector3(0, settings.spawnHeightM, 0).add(centerOfMass),
  );
  // Vehicle-scale pitch/yaw/roll inertia, not the thin underbody box's inertia.
  vector.setValue(settings.inertiaKgM2.pitch, settings.inertiaKgM2.yaw, settings.inertiaKgM2.roll);
  body.setMassProps(settings.massKg, vector);
  body.updateInertiaTensor();
  body.setActivationState(4);
  body.setDamping(settings.damping.linear, settings.damping.angular);
  const tuning = resources.vehicleTuning;
  const raycaster = new Ammo.btDefaultVehicleRaycaster(world);
  const vehicle = new Ammo.btRaycastVehicle(tuning, body, raycaster);
  vehicle.setCoordinateSystem(0, 1, 2);
  world.addAction(vehicle);
  const direction = new Ammo.btVector3(0, -1, 0);
  const axle = new Ammo.btVector3(-1, 0, 0);
  car.centers.forEach((center, i) => {
    const pair = i < 2 ? car.centers.slice(0, 2) : car.centers.slice(2);
    const halfTrack = (Math.abs(pair[0].x) + Math.abs(pair[1].x)) / 2;
    vector.setValue(
      (i % 2 === 0 ? -halfTrack : halfTrack) - centerOfMass.x,
      center.y + suspension.mountHeightOffsetM - centerOfMass.y,
      (pair[0].z + pair[1].z) / 2 - centerOfMass.z,
    );
    const wheel = vehicle.addWheel(
      vector,
      direction,
      axle,
      suspension.restLengthM,
      car.radii[i],
      tuning,
      i < 2,
    );
    wheel.set_m_suspensionStiffness(suspension.stiffness);
    wheel.set_m_wheelsDampingRelaxation(suspension.dampingRelaxation);
    wheel.set_m_wheelsDampingCompression(suspension.dampingCompression);
    wheel.set_m_maxSuspensionForce(suspension.maxForceN);
    // Ammo supplies suspension/contact; the combined-slip tire model below
    // supplies all road forces, so Bullet must not apply a second tire model.
    wheel.set_m_frictionSlip(0);
    wheel.set_m_rollInfluence(suspension.bulletRollInfluence);
  });
  Ammo.destroy(direction);
  Ammo.destroy(axle);

  const tireSounds = Array.from({ length: 4 }, () => ({ slip: 0, speed: 0, load: 0 }));

  let steering = 0;
  let burnout = 0;
  let reversing = false;
  let spawnBrakeHeld = true;
  let brakestand = false;
  let offTrackTime = 0;
  const tireSpeeds = [0, 0, 0, 0];
  const tireAngles = [0, 0, 0, 0];
  const drivenWheelRadius = (car.radii[2] + car.radii[3]) / 2;
  const drivetrain = new Drivetrain();
  const drivetrainInput: DrivetrainInput = {
    throttle: 0,
    reversing: false,
    wheelSpeed: 0,
    roadWheelSpeed: 0,
    handbrake: false,
    speedLimited: false,
    peakTorque: 0,
    peakPower: 0,
  };
  const tireContacts = Array.from({ length: 4 }, () => ({
    forward: new THREE.Vector3(),
    lateral: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    along: 0,
    across: 0,
    slipAngle: 0,
    load: 0,
    capacity: 0,
    lateralDemand: 0,
    staticLateral: 0,
    staticLongitudinal: 0,
    staticBlend: 0,
    brakeTorque: 0,
    longitudinalForce: 0,
    lateralForce: 0,
    paved: true,
  }));
  const fixedStep = 1 / 120;
  const velocity = new THREE.Vector3();
  const linearVelocity = new THREE.Vector3();
  const previousVelocity = new THREE.Vector3();
  const currentVelocity = new THREE.Vector3();
  const visuals = createPhysicsVisuals([car.chassis, ...car.wheels, ...car.hubs]);
  const wheelBasis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const wheelContacts = [false, false, false, false];
  const physicsRotation = new THREE.Quaternion();
  const tireOffset = new THREE.Vector3();
  const contactPosition = new THREE.Vector3();
  const tireForward = new THREE.Vector3();
  const tireLateral = new THREE.Vector3();
  const tireNormal = new THREE.Vector3();
  const forceOffset = new Ammo.btVector3(0, 0, 0);
  const suspensionUp = new THREE.Vector3();
  const antiRollOffset = new THREE.Vector3();
  const resetTransform = new Ammo.btTransform();
  resetTransform.setIdentity();
  const replayTransform = new Ammo.btTransform();
  replayTransform.setIdentity();
  const replayRotation = new Ammo.btQuaternion(0, 0, 0, 1);
  const replayFrom = new THREE.Vector3();
  const replayTo = new THREE.Vector3();
  const replaySpin = new THREE.Quaternion();
  function setCourseDirection(nextSpawn: ReturnType<typeof courseSpawn>, nextLaps: LapTimer) {
    const spawnNormal = terrain.normalAt(nextSpawn.position[0], nextSpawn.position[1]);
    const spawnForward = new THREE.Vector3(
      Math.sin(nextSpawn.heading),
      0,
      Math.cos(nextSpawn.heading),
    )
      .projectOnPlane(spawnNormal)
      .normalize();
    const spawnRight = new THREE.Vector3().crossVectors(spawnNormal, spawnForward).normalize();
    const spawnQuaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(spawnRight, spawnNormal, spawnForward),
    );
    centerOfMassOffset.copy(centerOfMass).applyQuaternion(spawnQuaternion);
    vector.setValue(
      nextSpawn.position[0] + centerOfMassOffset.x,
      terrain.heightAt(nextSpawn.position[0], nextSpawn.position[1]) +
        settings.spawnHeightM +
        centerOfMassOffset.y,
      nextSpawn.position[1] + centerOfMassOffset.z,
    );
    resetTransform.setOrigin(vector);
    const spawnRotation = new Ammo.btQuaternion(
      spawnQuaternion.x,
      spawnQuaternion.y,
      spawnQuaternion.z,
      spawnQuaternion.w,
    );
    resetTransform.setRotation(spawnRotation);
    Ammo.destroy(spawnRotation);
    laps = nextLaps;
  }
  setCourseDirection(spawn, laps);

  function syncVisuals() {
    const transform = body.getWorldTransform();
    const position = transform.getOrigin();
    const rotation = transform.getRotation();
    car.chassis.position.set(position.x(), position.y(), position.z());
    car.chassis.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    centerOfMassOffset.copy(centerOfMass).applyQuaternion(car.chassis.quaternion);
    car.chassis.position.sub(centerOfMassOffset);
    car.wheels.forEach((wheel, i) => {
      // Non-rotating hub pose first, for the calipers, then the spinning wheel pose.
      for (const [object, angle] of [
        [car.hubs[i], 0],
        [wheel, tireAngles[i]],
      ] as const) {
        vehicle.getWheelInfo(i).set_m_rotation(angle);
        vehicle.updateWheelTransform(i, true);
        const transform = vehicle.getWheelTransformWS(i);
        const position = transform.getOrigin();
        const rotation = transform.getRotation();
        object.position.set(position.x(), position.y(), position.z());
        object.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
        object.quaternion.multiply(wheelBasis);
      }
    });
  }

  function captureVisuals(snap = false) {
    previousVelocity.copy(currentVelocity);
    syncVisuals();
    const linear = body.getLinearVelocity();
    currentVelocity.set(linear.x(), linear.y(), linear.z());
    visuals.capture(snap);
    for (const plugin of plugins) plugin.captureVisuals?.(snap);
    if (snap) previousVelocity.copy(currentVelocity);
  }

  function reset() {
    drivetrain.reset();
    for (const tire of tireSounds) tire.slip = tire.speed = tire.load = 0;
    spawnBrakeHeld = true;
    brakestand = false;
    car.setBraking(true);
    car.setReversing(false);
    car.setHazards(false);
    offTrackTime = 0;
    reversing = false;
    steering = 0;
    burnout = 0;
    tireSpeeds.fill(0);
    tireAngles.fill(0);
    wheelContacts.fill(false);
    for (const plugin of plugins) plugin.reset?.();
    body.setCenterOfMassTransform(resetTransform);
    body.getMotionState().setWorldTransform(resetTransform);
    vector.setValue(0, 0, 0);
    body.setLinearVelocity(vector);
    body.setAngularVelocity(vector);
    body.clearForces();
    vehicle.resetSuspension();
    for (let i = 0; i < 4; i++) {
      vehicle.setSteeringValue(0, i);
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(0, i);
    }
    world.updateSingleAabb(body);
    captureVisuals(true);
    laps.reset(car.chassis.position);
    velocity.set(0, 0, 0);
  }

  function beforeStep(startHeld = false) {
    const { driveMode, profiles } = configurationState.getState();
    const tune = driveModes[driveMode];
    const tireTune = profiles[driveMode];
    const linear = body.getLinearVelocity();
    const angular = body.getAngularVelocity();
    const speed = Math.hypot(linear.x(), linear.z()) * 3.6;
    const rotation = body.getWorldTransform().getRotation();
    physicsRotation.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    tireForward.set(0, 0, 1).applyQuaternion(physicsRotation);
    const forwardSpeed =
      linear.x() * tireForward.x + linear.y() * tireForward.y + linear.z() * tireForward.z;
    if (!startHeld && (controls.throttle > 0 || controls.reverse > 0)) spawnBrakeHeld = false;
    if (spawnBrakeHeld || controls.throttle > 0 || controls.reverse === 0) reversing = false;
    else if (Math.abs(forwardSpeed) < 0.5 && Math.abs(angular.y()) < 0.5 && speed < 4)
      reversing = true;
    const input = startHeld ? 0 : controls.steer;
    const steeringLimit =
      THREE.MathUtils.lerp(tune.steeringLow, tune.steeringHigh, Math.min(speed / 140, 1)) *
      tireTune.steeringScale;
    const targetSteering = input * steeringLimit;
    const smoothedSteering = THREE.MathUtils.damp(steering, targetSteering, 10, fixedStep);
    const maxChange = tireTune.steeringRate * fixedStep;
    steering += THREE.MathUtils.clamp(smoothedSteering - steering, -maxChange, maxChange);
    const brakeAmount = startHeld || spawnBrakeHeld ? 1 : reversing ? 0 : controls.brake;
    const braking = brakeAmount > 0;
    const handbrake = startHeld || controls.handbrake;
    const throttle = reversing ? controls.reverse : controls.throttle;
    brakestand =
      !startHeld &&
      throttle > 0 &&
      braking &&
      !reversing &&
      speed < settings.brakes.brakestandMaxSpeedKmh;
    burnout = 0;
    for (const tire of tireSounds) tire.slip = tire.speed = tire.load = 0;
    for (const plugin of plugins) plugin.beforeStep?.(fixedStep);
    suspensionUp.set(0, 1, 0).applyQuaternion(physicsRotation);
    for (const axle of [0, 2]) {
      const left = vehicle.getWheelInfo(axle).get_m_raycastInfo();
      const right = vehicle.getWheelInfo(axle + 1).get_m_raycastInfo();
      // A bar transfers spring force, never pulls an airborne wheel toward the road.
      if (!wheelContacts[axle] || !wheelContacts[axle + 1]) continue;
      const leftLoad = Math.max(0, vehicle.getWheelInfo(axle).get_m_wheelsSuspensionForce());
      const rightLoad = Math.max(0, vehicle.getWheelInfo(axle + 1).get_m_wheelsSuspensionForce());
      const limit = Math.min(leftLoad, rightLoad) * suspension.antiRollMaxLoadFraction;
      const barForce = THREE.MathUtils.clamp(
        (right.get_m_suspensionLength() - left.get_m_suspensionLength()) *
          suspension.antiRollStiffness,
        -limit,
        limit,
      );
      for (let side = 0; side < 2; side++) {
        antiRollOffset
          .copy(car.centers[axle + side])
          .sub(centerOfMass)
          .applyQuaternion(physicsRotation);
        const force = side === 0 ? barForce : -barForce;
        vector.setValue(suspensionUp.x * force, suspensionUp.y * force, suspensionUp.z * force);
        forceOffset.setValue(antiRollOffset.x, antiRollOffset.y, antiRollOffset.z);
        body.applyForce(vector, forceOffset);
      }
    }
    for (let i = 0; i < 4; i++) {
      const rear = i >= 2;
      vehicle.setSteeringValue(rear ? 0 : steering, i);
      const wheel = vehicle.getWheelInfo(i);
      const contact = wheel.get_m_raycastInfo();
      let paved = true;
      tireNormal.set(0, 1, 0);
      tireOffset.copy(car.centers[i]).sub(centerOfMass).applyQuaternion(physicsRotation);
      if (wheelContacts[i]) {
        const point = contact.get_m_contactPointWS();
        const origin = body.getWorldTransform().getOrigin();
        tireOffset.set(point.x() - origin.x(), point.y() - origin.y(), point.z() - origin.z());
        contactPosition.set(point.x(), point.y(), point.z());
        paved = isAsphalt(contactPosition);
        const normal = contact.get_m_contactNormalWS();
        tireNormal.set(normal.x(), normal.y(), normal.z()).normalize();
      }
      tireForward
        .set(Math.sin(rear ? 0 : steering), 0, Math.cos(rear ? 0 : steering))
        .applyQuaternion(physicsRotation);
      tireForward.projectOnPlane(tireNormal).normalize();
      tireLateral.crossVectors(tireNormal, tireForward).normalize();
      const vx = linear.x() + angular.y() * tireOffset.z - angular.z() * tireOffset.y;
      const vy = linear.y() + angular.z() * tireOffset.x - angular.x() * tireOffset.z;
      const vz = linear.z() + angular.x() * tireOffset.y - angular.y() * tireOffset.x;
      const along = vx * tireForward.x + vy * tireForward.y + vz * tireForward.z;
      const across = vx * tireLateral.x + vy * tireLateral.y + vz * tireLateral.z;
      const slipAngle = Math.atan2(across, Math.max(Math.abs(along), 2));
      const load = wheelContacts[i] ? Math.max(0, wheel.get_m_wheelsSuspensionForce()) : 0;
      const staticGrip =
        braking && !rear
          ? 0.15 * brakeAmount * (1 - THREE.MathUtils.smoothstep(Math.abs(along), 0.2, 0.5))
          : 0;
      const surfaceGrip = paved ? 1 : 0.65;
      const capacity =
        load *
        (tune.friction * (rear ? tireTune.rearGrip : tireTune.frontGrip) + staticGrip) *
        surfaceGrip;
      const lateralDemand =
        -(rear ? tireTune.rearStiffness : tireTune.frontStiffness) * slipAngle * surfaceGrip;
      // At low speed, solve for the contact force that cancels tangential
      // velocity and gravity over this step, instead of requiring tire slip.
      const contactMass = settings.massKg / 4;
      const staticLateral = contactMass * (9.81 * tireLateral.y - across / fixedStep);
      const staticLongitudinal = contactMass * (9.81 * tireForward.y - along / fixedStep);
      const staticBlend = 1 - THREE.MathUtils.smoothstep(Math.hypot(along, across), 0.5, 2);
      const brakeTorque =
        rear && handbrake
          ? settings.brakes.handbrakeTorqueNm
          : brakeAmount *
            (rear
              ? brakestand
                ? 0
                : settings.brakes.rearTorqueNm
              : settings.brakes.frontTorqueNm);
      const tire = tireContacts[i];
      tire.forward.copy(tireForward);
      tire.lateral.copy(tireLateral);
      tire.offset.copy(tireOffset);
      Object.assign(tire, {
        along,
        across,
        slipAngle,
        load,
        capacity,
        lateralDemand,
        staticLateral,
        staticLongitudinal,
        staticBlend,
        brakeTorque,
        paved,
        longitudinalForce: 0,
        lateralForce: 0,
      });
    }
    drivetrainInput.throttle = throttle;
    drivetrainInput.reversing = reversing;
    drivetrainInput.handbrake = handbrake;
    drivetrainInput.roadWheelSpeed = forwardSpeed / drivenWheelRadius;
    drivetrainInput.speedLimited = reversing && speed >= 35;
    const powerScale = tireTune.horsepower / Math.round(tune.enginePower / wattsPerHorsepower);
    drivetrainInput.peakTorque = tune.engineTorque * powerScale;
    drivetrainInput.peakPower = tune.enginePower * powerScale;
    // Integrate the engine and both driven wheels together, so each wheel sees
    // the same differential snapshot and tire reaction reaches the crankshaft.
    const tireStep = fixedStep / 12;
    for (let j = 0; j < 12; j++) {
      drivetrainInput.wheelSpeed = (tireSpeeds[2] + tireSpeeds[3]) / 2;
      const engineTorque = drivetrain.step(tireStep, drivetrainInput);
      const differential = THREE.MathUtils.clamp(
        (tireSpeeds[3] - tireSpeeds[2]) * settings.differential.coupling,
        -settings.differential.maxTorqueNm,
        settings.differential.maxTorqueNm,
      );
      for (let i = 0; i < 4; i++) {
        const rear = i >= 2;
        const tire = tireContacts[i];
        const { along, capacity, lateralDemand, brakeTorque } = tire;
        const slipRatio =
          (tireSpeeds[i] * car.radii[i] - along) / Math.max(Math.abs(along), braking ? 0.5 : 4);
        // Saturate both pure-slip demands before sharing the friction circle;
        // unbounded wheelspin demand would erase lateral force under throttle.
        const staticBlend =
          tire.staticBlend *
          (1 - THREE.MathUtils.smoothstep(Math.abs(tireSpeeds[i] * car.radii[i]), 0.5, 2));
        const brakeCapacity = brakeTorque / car.radii[i];
        const driveDemand = THREE.MathUtils.lerp(
          capacity * Math.tanh(slipRatio * 8),
          THREE.MathUtils.clamp(tire.staticLongitudinal, -brakeCapacity, brakeCapacity),
          brakeTorque > 0 ? staticBlend : 0,
        );
        const lateral = THREE.MathUtils.lerp(
          capacity * Math.tanh(lateralDemand / Math.max(capacity, 1)),
          THREE.MathUtils.clamp(tire.staticLateral, -capacity, capacity),
          staticBlend,
        );
        const combined = Math.hypot(driveDemand, lateral);
        // Round the friction-circle boundary without a separate breakaway drop.
        const utilization = combined / Math.max(capacity, 1);
        const scale = THREE.MathUtils.lerp(
          1 / (1 + utilization ** 8) ** (1 / 8),
          1 / Math.max(1, utilization),
          staticBlend,
        );
        const fx = driveDemand * scale;
        const fy = lateral * scale;
        const torque =
          (rear ? engineTorque + (i === 2 ? differential : -differential) : 0) - fx * car.radii[i];
        const nextSpeed = tireSpeeds[i] + (torque / wheelInertia) * tireStep;
        tireSpeeds[i] =
          Math.sign(nextSpeed) *
          Math.max(0, Math.abs(nextSpeed) - (brakeTorque / wheelInertia) * tireStep);
        tireAngles[i] += tireSpeeds[i] * tireStep;
        tire.longitudinalForce += fx / 12;
        tire.lateralForce += fy / 12;
      }
    }
    for (let i = 0; i < 4; i++) {
      const rear = i >= 2;
      const tire = tireContacts[i];
      const { along, across, slipAngle, load, paved, longitudinalForce, lateralForce } = tire;
      tireForward.copy(tire.forward);
      tireLateral.copy(tire.lateral);
      tireOffset.copy(tire.offset);
      if (wheelContacts[i]) {
        const excessSpeed = Math.abs(tireSpeeds[i] * car.radii[i] - along);
        const slipRatio = excessSpeed / Math.max(Math.abs(along), 4);
        if (paved && load > 100) {
          const lateralSlip =
            THREE.MathUtils.smoothstep(Math.abs(slipAngle), 0.08, 0.35) *
            THREE.MathUtils.smoothstep(Math.abs(across), 0.8, 4);
          const longitudinalSlip =
            THREE.MathUtils.smoothstep(slipRatio, 0.15, 0.65) *
            THREE.MathUtils.smoothstep(excessSpeed, 1, 5);
          tireSounds[i].slip = Math.max(lateralSlip, longitudinalSlip);
          tireSounds[i].speed = Math.hypot(across, excessSpeed);
          tireSounds[i].load = load / ((settings.massKg * 9.81) / 4);
        }
        // Normal acceleration needs a small amount of slip, not tire smoke.
        if (rear)
          burnout = Math.max(
            burnout,
            THREE.MathUtils.smoothstep(slipRatio, 0.18, 0.65) *
              THREE.MathUtils.smoothstep(excessSpeed, 1, 4),
          );
      }
      vector.setValue(
        tireForward.x * longitudinalForce,
        tireForward.y * longitudinalForce,
        tireForward.z * longitudinalForce,
      );
      forceOffset.setValue(tireOffset.x, tireOffset.y, tireOffset.z);
      body.applyForce(vector, forceOffset);
      // Approximate suspension roll-center geometry for our custom lateral forces.
      // Bullet's rollInfluence only affects its disabled built-in tire model.
      const rollCenterOffset =
        -tireOffset.dot(suspensionUp) * suspension.lateralForceHeightFraction;
      forceOffset.setValue(
        tireOffset.x + suspensionUp.x * rollCenterOffset,
        tireOffset.y + suspensionUp.y * rollCenterOffset,
        tireOffset.z + suspensionUp.z * rollCenterOffset,
      );
      vector.setValue(
        tireLateral.x * lateralForce,
        tireLateral.y * lateralForce,
        tireLateral.z * lateralForce,
      );
      body.applyForce(vector, forceOffset);
    }
    const drag =
      settings.drag.linearResistance +
      0.5 *
        settings.drag.airDensityKgM3 *
        settings.drag.coefficient *
        settings.drag.frontalAreaM2 *
        Math.hypot(linear.x(), linear.z());
    vector.setValue(-linear.x() * drag, 0, -linear.z() * drag);
    body.applyCentralForce(vector);
  }

  function afterStep(startHeld = false) {
    for (const plugin of plugins) plugin.afterStep?.(fixedStep);
    const lapOrigin = body.getWorldTransform().getOrigin();
    lapPosition.set(lapOrigin.x(), lapOrigin.y(), lapOrigin.z());
    const lapRotation = body.getWorldTransform().getRotation();
    physicsRotation.set(lapRotation.x(), lapRotation.y(), lapRotation.z(), lapRotation.w());
    for (let i = 0; i < 4; i++) {
      const center = lapTirePoints[i * 3];
      const contact = vehicle.getWheelInfo(i).get_m_raycastInfo();
      if (contact.get_m_isInContact()) {
        const point = contact.get_m_contactPointWS();
        center.set(point.x(), point.y(), point.z());
      } else {
        center
          .copy(car.centers[i])
          .sub(centerOfMass)
          .applyQuaternion(physicsRotation)
          .add(lapPosition);
      }
      const wheelSteering = i < 2 ? steering : 0;
      lapTireAcross
        .set(Math.cos(wheelSteering), 0, -Math.sin(wheelSteering))
        .applyQuaternion(physicsRotation)
        .multiplyScalar(car.widths[i] / 2);
      lapTirePoints[i * 3 + 1].copy(center).add(lapTireAcross);
      lapTirePoints[i * 3 + 2].copy(center).sub(lapTireAcross);
    }
    if (!startHeld) laps.update(lapPosition, fixedStep, lapTirePoints);
    offTrackTime = isAsphalt(lapPosition) ? 0 : offTrackTime + fixedStep;
    car.setHazards(offTrackTime > 3 && (offTrackTime - 3) % 0.8 < 0.4, offTrackTime > 3);
    for (let i = 0; i < 4; i++) {
      wheelContacts[i] = vehicle.getWheelInfo(i).get_m_raycastInfo().get_m_isInContact();
    }
  }

  function step() {
    if (simulationWorld) throw new Error('Shared vehicles must be stepped through their world');
    beforeStep();
    sharedWorld.step(fixedStep);
    afterStep();
  }

  /**
   * Replays recorded motion through the live world: the chassis body is placed at `from` and given
   * the velocity that carries it to `to`, so cones and signs react as they did when it was driven.
   */
  function stepReplay(from: ChassisPose, to: ChassisPose, dt: number) {
    replayFrom.copy(centerOfMass).applyQuaternion(from.quaternion).add(from.position);
    replayTo.copy(centerOfMass).applyQuaternion(to.quaternion).add(to.position);
    vector.setValue(replayFrom.x, replayFrom.y, replayFrom.z);
    replayTransform.setOrigin(vector);
    replayRotation.setValue(
      from.quaternion.x,
      from.quaternion.y,
      from.quaternion.z,
      from.quaternion.w,
    );
    replayTransform.setRotation(replayRotation);
    body.setCenterOfMassTransform(replayTransform);
    body.getMotionState().setWorldTransform(replayTransform);
    replayTo.sub(replayFrom).divideScalar(dt);
    vector.setValue(replayTo.x, replayTo.y, replayTo.z);
    body.setLinearVelocity(vector);
    replaySpin.copy(from.quaternion).invert().premultiply(to.quaternion);
    if (replaySpin.w < 0)
      replaySpin.set(-replaySpin.x, -replaySpin.y, -replaySpin.z, -replaySpin.w);
    const halfSin = Math.hypot(replaySpin.x, replaySpin.y, replaySpin.z);
    const rate = halfSin > 1e-9 ? (2 * Math.atan2(halfSin, replaySpin.w)) / (halfSin * dt) : 0;
    vector.setValue(replaySpin.x * rate, replaySpin.y * rate, replaySpin.z * rate);
    body.setAngularVelocity(vector);
    body.clearForces();
    world.updateSingleAabb(body);
    for (const plugin of plugins) plugin.beforeStep?.(dt);
    world.stepSimulation(dt, 0);
    for (const plugin of plugins) plugin.afterStep?.(dt);
  }

  function captureReplayVisuals() {
    for (const plugin of plugins) plugin.captureVisuals?.(false);
  }

  function interpolateReplay(alpha: number) {
    for (const plugin of plugins) plugin.interpolate?.(alpha);
  }

  function interpolate(alpha: number) {
    car.setBraking(spawnBrakeHeld || (!reversing && controls.brake > 0));
    car.setReversing(reversing);
    visuals.interpolate(alpha);
    for (const plugin of plugins) plugin.interpolate?.(alpha);
    linearVelocity.lerpVectors(previousVelocity, currentVelocity, alpha);
    velocity.copy(linearVelocity).setY(0);
    return velocity;
  }

  function addPlugin<T extends PhysicsPlugin>(
    createPlugin: (context: PhysicsPluginContext) => T,
  ): T {
    if (disposed) throw new Error('Cannot add a plugin to disposed vehicle physics');
    const plugin = createPlugin({
      Ammo,
      world,
      dispatcher,
      vehicleBody: body,
      get laps() {
        return laps;
      },
      createRigidBody: rigidBody,
      setBodyEnabled(body, enabled) {
        if (disposed) throw new Error('Cannot toggle a body in disposed vehicle physics');
        if (!rigidBodies.has(body)) {
          throw new Error('Cannot toggle an unmanaged physics body');
        }
        if (enabled === enabledBodies.has(body)) return;
        if (enabled) {
          world.addRigidBody(body);
          enabledBodies.add(body);
        } else {
          world.removeRigidBody(body);
          enabledBodies.delete(body);
        }
      },
    });
    plugins.push(plugin);
    return plugin;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (enabled) world.removeAction(vehicle);
    Ammo.destroy(vehicle);
    Ammo.destroy(raycaster);
    for (const [body, motion] of rigidBodies) {
      if (enabledBodies.has(body)) world.removeRigidBody(body);
      Ammo.destroy(body);
      Ammo.destroy(motion);
    }
    rigidBodies.clear();
    enabledBodies.clear();
    for (const plugin of plugins) plugin.dispose?.();
    Ammo.destroy(chassisShape);
    Ammo.destroy(resetTransform);
    Ammo.destroy(replayTransform);
    Ammo.destroy(replayRotation);
    Ammo.destroy(forceOffset);
    Ammo.destroy(vector);
    if (!simulationWorld) sharedWorld.dispose();
  }

  return {
    step,
    beforeStep,
    afterStep,
    stepReplay,
    captureReplayVisuals,
    interpolateReplay,
    reset,
    setCourseDirection,
    addPlugin,
    dispose,
    captureVisuals,
    interpolate,
    fixedStep,
    wheelContacts,
    tireSounds,
    tireAngles: tireAngles as readonly number[],
    tireContacts,
    tireSpeeds: tireSpeeds as readonly number[],
    setEnabled(value: boolean) {
      if (disposed) throw new Error('Cannot toggle a disposed vehicle');
      if (value === enabled) return;
      enabled = value;
      if (value) {
        world.addRigidBody(body);
        enabledBodies.add(body);
        world.addAction(vehicle);
      } else {
        world.removeAction(vehicle);
        world.removeRigidBody(body);
        enabledBodies.delete(body);
      }
    },
    readState() {
      const transform = body.getWorldTransform();
      const origin = transform.getOrigin();
      const rotation = transform.getRotation();
      const linear = body.getLinearVelocity();
      const angular = body.getAngularVelocity();
      physicsRotation.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
      tireForward.set(0, 0, 1).applyQuaternion(physicsRotation);
      const along = linear.x() * tireForward.x + linear.z() * tireForward.z;
      const across = linear.x() * tireForward.z - linear.z() * tireForward.x;
      return {
        x: origin.x(),
        y: origin.y(),
        z: origin.z(),
        heading: Math.atan2(tireForward.x, tireForward.z),
        vx: linear.x(),
        vz: linear.z(),
        speed: Math.hypot(linear.x(), linear.z()),
        slipAngle: Math.atan2(across, Math.max(Math.abs(along), 0.5)),
        yawRate: angular.y(),
      };
    },
    get engine() {
      return drivetrain.state;
    },
    get burnout() {
      return burnout;
    },
    get steering() {
      return steering;
    },
    get reversing() {
      return reversing;
    },
    get spawnBrakeHeld() {
      return spawnBrakeHeld;
    },
    get linearVelocity() {
      return linearVelocity;
    },
    get simulationVelocity() {
      return currentVelocity;
    },
    get brakestand() {
      return brakestand;
    },
  };
}
