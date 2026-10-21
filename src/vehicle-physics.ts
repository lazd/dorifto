import * as THREE from 'three';
import type AmmoFactory from 'ammojs-typed';
import type { loadCar } from './car';
import { coneDimensions, type createCourse } from './course';
import type { courseSpawn } from './courses';
import type { DrivingControls } from './controls';
import type { VehicleAudio } from './audio';
import type { LapTimer } from './laps';
import type { GameState } from './game-state';
import type { Store } from './store';
import { wattsPerHorsepower } from './game-state';
import { driveModes } from './drive-modes';
import { Drivetrain, wheelInertia, type DrivetrainInput } from './drivetrain';
import { vehicleSettings } from './vehicle-settings';

interface VehiclePhysicsOptions {
  Ammo: typeof AmmoFactory;
  resources: ReturnType<typeof createPhysicsResources>;
  car: Awaited<ReturnType<typeof loadCar>>;
  course: ReturnType<typeof createCourse>;
  spawn: ReturnType<typeof courseSpawn>;
  controls: DrivingControls;
  gameState: Store<GameState>;
  laps: LapTimer;
  audio: VehicleAudio;
}

export function createPhysicsResources(Ammo: typeof AmmoFactory) {
  const buffers: { pointer: number; capacity: number; used: boolean }[] = [];
  // This Ammo build exposes neither _free nor a vehicle-tuning destructor.
  // Reuse tuning and power-of-two buffers instead of leaking one per course.
  return {
    vehicleTuning: new Ammo.btVehicleTuning(),
    acquireHeightfield(heights: Float32Array) {
      let buffer = buffers.find((buffer) => !buffer.used && buffer.capacity >= heights.byteLength);
      if (!buffer) {
        const capacity = 2 ** Math.ceil(Math.log2(heights.byteLength));
        const pointer = Ammo._malloc(capacity);
        if (!pointer) throw new Error('Unable to allocate course heightfield');
        buffer = { pointer, capacity, used: false };
        buffers.push(buffer);
      }
      buffer.used = true;
      Ammo.HEAPF32.set(heights, buffer.pointer / 4);
      const allocated = buffer;
      return { pointer: buffer.pointer, release() { allocated.used = false; } };
    },
  };
}

export function createVehiclePhysics({
  Ammo, resources, car, course, spawn, controls, gameState, laps, audio,
}: VehiclePhysicsOptions) {
  const { cones, terrain, isAsphalt } = course;
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
  const configuration = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher = new Ammo.btCollisionDispatcher(configuration);
  const broadphase = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();
  const world = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, configuration);
  const vector = new Ammo.btVector3(0, -9.81, 0);
  world.setGravity(vector);
  const rigidBodies: { body: AmmoFactory.btRigidBody; motion: AmmoFactory.btDefaultMotionState }[] = [];

  function rigidBody(mass: number, shape: AmmoFactory.btCollisionShape, position: THREE.Vector3) {
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
    rigidBodies.push({ body, motion });
    Ammo.destroy(info);
    Ammo.destroy(transform);
    return body;
  }

  const heightData = resources.acquireHeightfield(terrain.heights);
  const groundShape = new Ammo.btHeightfieldTerrainShape(
    terrain.columns, terrain.rows, heightData.pointer, 1, terrain.minHeight, terrain.maxHeight, 1, Ammo.PHY_FLOAT, false,
  );
  vector.setValue(terrain.spacing, 1, terrain.spacing);
  groundShape.setLocalScaling(vector);
  groundShape.setMargin(0.01);
  rigidBody(0, groundShape, new THREE.Vector3(
    terrain.minX + (terrain.columns - 1) * terrain.spacing / 2,
    (terrain.minHeight + terrain.maxHeight) / 2,
    terrain.minZ + (terrain.rows - 1) * terrain.spacing / 2,
  ));
  const coneStarts = cones.map((cone) => cone.position.clone());
  const coneRotations = cones.map((cone) => cone.quaternion.clone());
  const coneResetTransform = new Ammo.btTransform();
  coneResetTransform.setIdentity();
  const coneShape = new Ammo.btCompoundShape();
  const coneBodyShape = new Ammo.btConvexHullShape();
  const { height, bottomRadius, topRadius, baseWidth, baseHeight, centerOfMassHeight } = coneDimensions;
  for (const [y, radius] of [[baseHeight - centerOfMassHeight, bottomRadius], [height - centerOfMassHeight, topRadius]]) {
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      vector.setValue(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      coneBodyShape.addPoint(vector, true);
    }
  }
  coneBodyShape.setMargin(0.005);
  coneShape.addChildShape(coneResetTransform, coneBodyShape);
  vector.setValue(baseWidth / 2, baseHeight / 2, baseWidth / 2);
  const coneBaseShape = new Ammo.btBoxShape(vector);
  coneBaseShape.setMargin(0.005);
  vector.setValue(0, baseHeight / 2 - centerOfMassHeight, 0);
  coneResetTransform.setOrigin(vector);
  coneShape.addChildShape(coneResetTransform, coneBaseShape);
  const coneBodies = cones.map((mesh) => {
    const body = rigidBody(3, coneShape, mesh.position);
    const transform = body.getWorldTransform();
    const rotation = new Ammo.btQuaternion(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
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
  const chassisShape = new Ammo.btConvexHullShape();
  for (let i = 0; i < car.collisionVertices.length; i++) {
    const point = car.collisionVertices[i];
    vector.setValue(point.x - centerOfMass.x, point.y - centerOfMass.y, point.z - centerOfMass.z);
    chassisShape.addPoint(vector, i === car.collisionVertices.length - 1);
  }
  chassisShape.setMargin(settings.collisionMarginM);
  const body = rigidBody(settings.massKg, chassisShape,
    new THREE.Vector3(0, settings.spawnHeightM, 0).add(centerOfMass));
  // Vehicle-scale pitch/yaw/roll inertia, not the thin underbody box's inertia.
  vector.setValue(settings.inertiaKgM2.pitch, settings.inertiaKgM2.yaw, settings.inertiaKgM2.roll);
  body.setMassProps(settings.massKg, vector);
  body.updateInertiaTensor();
  const carPointer = Ammo.getPointer(body);
  const coneIds = new Map(coneBodies.map((cone, i) => [Ammo.getPointer(cone), i]));
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
    const wheel = vehicle.addWheel(vector, direction, axle, suspension.restLengthM, car.radii[i], tuning, i < 2);
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
  const coneSoundCooldowns = new Map<number, number>();

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
    throttle: 0, reversing: false, wheelSpeed: 0, roadWheelSpeed: 0, handbrake: false,
    speedLimited: false, peakTorque: 0, peakPower: 0,
  };
  const tireContacts = Array.from({ length: 4 }, () => ({
    forward: new THREE.Vector3(), lateral: new THREE.Vector3(), offset: new THREE.Vector3(),
    along: 0, across: 0, slipAngle: 0, load: 0, capacity: 0, lateralDemand: 0,
    brakeTorque: 0, longitudinalForce: 0, lateralForce: 0, paved: true,
  }));
  const fixedStep = 1 / 120;
  const velocity = new THREE.Vector3();
  const previousVelocity = new THREE.Vector3();
  const currentVelocity = new THREE.Vector3();
  const visualStates = [car.chassis, ...car.wheels, ...car.hubs, ...cones].map((object) => ({
    object,
    previousPosition: new THREE.Vector3(),
    position: new THREE.Vector3(),
    previousRotation: new THREE.Quaternion(),
    rotation: new THREE.Quaternion(),
  }));
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
  const spawnNormal = terrain.normalAt(spawn.position[0], spawn.position[1]);
  const spawnForward = new THREE.Vector3(Math.sin(spawn.heading), 0, Math.cos(spawn.heading))
    .projectOnPlane(spawnNormal).normalize();
  const spawnRight = new THREE.Vector3().crossVectors(spawnNormal, spawnForward).normalize();
  const spawnQuaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(spawnRight, spawnNormal, spawnForward),
  );
  centerOfMassOffset.copy(centerOfMass).applyQuaternion(spawnQuaternion);
  vector.setValue(
    spawn.position[0] + centerOfMassOffset.x,
    terrain.heightAt(spawn.position[0], spawn.position[1]) + settings.spawnHeightM + centerOfMassOffset.y,
    spawn.position[1] + centerOfMassOffset.z,
  );
  resetTransform.setOrigin(vector);
  const spawnRotation = new Ammo.btQuaternion(spawnQuaternion.x, spawnQuaternion.y, spawnQuaternion.z, spawnQuaternion.w);
  resetTransform.setRotation(spawnRotation);
  Ammo.destroy(spawnRotation);

  function syncVisuals() {
    cones.forEach((cone, i) => {
      const transform = coneBodies[i].getWorldTransform();
      const position = transform.getOrigin();
      const rotation = transform.getRotation();
      cone.position.set(position.x(), position.y(), position.z());
      cone.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    });
    const transform = body.getWorldTransform();
    const position = transform.getOrigin();
    const rotation = transform.getRotation();
    car.chassis.position.set(position.x(), position.y(), position.z());
    car.chassis.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    centerOfMassOffset.copy(centerOfMass).applyQuaternion(car.chassis.quaternion);
    car.chassis.position.sub(centerOfMassOffset);
    car.wheels.forEach((wheel, i) => {
      // Non-rotating hub pose first, for the calipers, then the spinning wheel pose.
      for (const [object, angle] of [[car.hubs[i], 0], [wheel, tireAngles[i]]] as const) {
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
    for (const state of visualStates) {
      state.previousPosition.copy(state.position);
      state.previousRotation.copy(state.rotation);
    }
    previousVelocity.copy(currentVelocity);
    syncVisuals();
    const linear = body.getLinearVelocity();
    currentVelocity.set(linear.x(), 0, linear.z());
    for (const state of visualStates) {
      state.position.copy(state.object.position);
      state.rotation.copy(state.object.quaternion);
      if (snap) {
        state.previousPosition.copy(state.position);
        state.previousRotation.copy(state.rotation);
      }
    }
    if (snap) previousVelocity.copy(currentVelocity);
  }

  function reset() {
    drivetrain.reset();
    for (const tire of tireSounds) tire.slip = tire.speed = tire.load = 0;
    coneSoundCooldowns.clear();
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
    coneBodies.forEach((cone, i) => {
      coneResetTransform.setIdentity();
      const start = coneStarts[i];
      const rotation = coneRotations[i];
      const coneRotation = new Ammo.btQuaternion(rotation.x, rotation.y, rotation.z, rotation.w);
      coneResetTransform.setRotation(coneRotation);
      Ammo.destroy(coneRotation);
      vector.setValue(start.x, start.y, start.z);
      coneResetTransform.setOrigin(vector);
      cone.setCenterOfMassTransform(coneResetTransform);
      cone.getMotionState().setWorldTransform(coneResetTransform);
      vector.setValue(0, 0, 0);
      cone.setLinearVelocity(vector);
      cone.setAngularVelocity(vector);
      cone.clearForces();
      // Placed props start asleep; collisions still wake them normally.
      cone.setActivationState(2);
      world.updateSingleAabb(cone);
    });
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

  function step() {
    const { driveMode, profiles } = gameState.getState();
    const tune = driveModes[driveMode];
    const tireTune = profiles[driveMode];
    const linear = body.getLinearVelocity();
    const angular = body.getAngularVelocity();
    const speed = Math.hypot(linear.x(), linear.z()) * 3.6;
    const rotation = body.getWorldTransform().getRotation();
    physicsRotation.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    tireForward.set(0, 0, 1).applyQuaternion(physicsRotation);
    const forwardSpeed = linear.x() * tireForward.x + linear.y() * tireForward.y + linear.z() * tireForward.z;
    if (controls.throttle > 0) spawnBrakeHeld = false;
    if (spawnBrakeHeld || controls.throttle > 0 || controls.reverse === 0) reversing = false;
    else if (Math.abs(forwardSpeed) < 0.5 && Math.abs(angular.y()) < 0.5 && speed < 4) reversing = true;
    const input = controls.steer;
    const steeringLimit = THREE.MathUtils.lerp(tune.steeringLow, tune.steeringHigh, Math.min(speed / 140, 1))
      * tireTune.steeringScale;
    const targetSteering = input * steeringLimit;
    const smoothedSteering = THREE.MathUtils.damp(steering, targetSteering, 10, fixedStep);
    const maxChange = tireTune.steeringRate * fixedStep;
    steering += THREE.MathUtils.clamp(smoothedSteering - steering, -maxChange, maxChange);
    const brakeAmount = spawnBrakeHeld ? 1 : reversing ? 0 : controls.brake;
    const braking = brakeAmount > 0;
    const handbrake = controls.handbrake;
    const throttle = reversing ? controls.reverse : controls.throttle;
    brakestand = throttle > 0 && braking && !reversing && speed < settings.brakes.brakestandMaxSpeedKmh;
    burnout = 0;
    for (const tire of tireSounds) tire.slip = tire.speed = tire.load = 0;
    for (const [cone, remaining] of coneSoundCooldowns) {
      if (remaining <= fixedStep) coneSoundCooldowns.delete(cone);
      else coneSoundCooldowns.set(cone, remaining - fixedStep);
    }
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
        (right.get_m_suspensionLength() - left.get_m_suspensionLength()) * suspension.antiRollStiffness, -limit, limit,
      );
      for (let side = 0; side < 2; side++) {
        antiRollOffset.copy(car.centers[axle + side]).sub(centerOfMass).applyQuaternion(physicsRotation);
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
      tireForward.set(Math.sin(rear ? 0 : steering), 0, Math.cos(rear ? 0 : steering))
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
      const staticGrip = braking && !rear ? 0.15 * brakeAmount * (1 - THREE.MathUtils.smoothstep(Math.abs(along), 0.2, 0.5)) : 0;
      const surfaceGrip = paved ? 1 : 0.65;
      const capacity = load * (tune.friction * (rear ? tireTune.rearGrip : tireTune.frontGrip) + staticGrip) * surfaceGrip;
      const lateralDemand = -(rear ? tireTune.rearStiffness : tireTune.frontStiffness) * slipAngle * surfaceGrip;
      const brakeTorque = rear && handbrake ? settings.brakes.handbrakeTorqueNm
        : brakeAmount * (rear ? brakestand ? 0 : settings.brakes.rearTorqueNm : settings.brakes.frontTorqueNm);
      const tire = tireContacts[i];
      tire.forward.copy(tireForward);
      tire.lateral.copy(tireLateral);
      tire.offset.copy(tireOffset);
      Object.assign(tire, {
        along, across, slipAngle, load, capacity, lateralDemand, brakeTorque, paved,
        longitudinalForce: 0, lateralForce: 0,
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
        -settings.differential.maxTorqueNm, settings.differential.maxTorqueNm,
      );
      for (let i = 0; i < 4; i++) {
        const rear = i >= 2;
        const tire = tireContacts[i];
        const { along, capacity, lateralDemand, brakeTorque } = tire;
        const slipRatio = (tireSpeeds[i] * car.radii[i] - along) / Math.max(Math.abs(along), braking ? 0.5 : 4);
        // Saturate both pure-slip demands before sharing the friction circle;
        // unbounded wheelspin demand would erase lateral force under throttle.
        const driveDemand = capacity * Math.tanh(slipRatio * 8);
        const lateral = capacity * Math.tanh(lateralDemand / Math.max(capacity, 1));
        const combined = Math.hypot(driveDemand, lateral);
        // Round the friction-circle boundary without a separate breakaway drop.
        const utilization = combined / Math.max(capacity, 1);
        const scale = 1 / (1 + utilization ** 8) ** (1 / 8);
        const fx = driveDemand * scale;
        const fy = lateral * scale;
        const torque = (rear ? engineTorque + (i === 2 ? differential : -differential) : 0) - fx * car.radii[i];
        const nextSpeed = tireSpeeds[i] + torque / wheelInertia * tireStep;
        tireSpeeds[i] = Math.sign(nextSpeed) * Math.max(0, Math.abs(nextSpeed) - brakeTorque / wheelInertia * tireStep);
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
          const lateralSlip = THREE.MathUtils.smoothstep(Math.abs(slipAngle), 0.08, 0.35)
            * THREE.MathUtils.smoothstep(Math.abs(across), 0.8, 4);
          const longitudinalSlip = THREE.MathUtils.smoothstep(slipRatio, 0.15, 0.65)
            * THREE.MathUtils.smoothstep(excessSpeed, 1, 5);
          tireSounds[i].slip = Math.max(lateralSlip, longitudinalSlip);
          tireSounds[i].speed = Math.hypot(across, excessSpeed);
          tireSounds[i].load = load / (settings.massKg * 9.81 / 4);
        }
        // Normal acceleration needs a small amount of slip, not tire smoke.
        if (rear) burnout = Math.max(burnout, THREE.MathUtils.smoothstep(slipRatio, 0.18, 0.65)
          * THREE.MathUtils.smoothstep(excessSpeed, 1, 4));
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
      const rollCenterOffset = -tireOffset.dot(suspensionUp) * suspension.lateralForceHeightFraction;
      forceOffset.setValue(
        tireOffset.x + suspensionUp.x * rollCenterOffset,
        tireOffset.y + suspensionUp.y * rollCenterOffset,
        tireOffset.z + suspensionUp.z * rollCenterOffset,
      );
      vector.setValue(tireLateral.x * lateralForce, tireLateral.y * lateralForce, tireLateral.z * lateralForce);
      body.applyForce(vector, forceOffset);
    }
    const drag = settings.drag.linearResistance
      + 0.5 * settings.drag.airDensityKgM3 * settings.drag.coefficient * settings.drag.frontalAreaM2
      * Math.hypot(linear.x(), linear.z());
    vector.setValue(-linear.x() * drag, 0, -linear.z() * drag);
    body.applyCentralForce(vector);
    world.stepSimulation(fixedStep, 0);
    for (let i = 0; i < dispatcher.getNumManifolds(); i++) {
      const manifold = dispatcher.getManifoldByIndexInternal(i);
      const first = Ammo.getPointer(manifold.getBody0());
      const second = Ammo.getPointer(manifold.getBody1());
      const cone = first === carPointer ? coneIds.get(second)
        : second === carPointer ? coneIds.get(first) : undefined;
      if (cone === undefined) continue;
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
        laps.hitCone(cone);
        if (impulse >= 0.5 && !coneSoundCooldowns.has(cone)) {
          audio.hitCone(impulse);
          coneSoundCooldowns.set(cone, 0.3);
        }
      }
    }
    const lapOrigin = body.getWorldTransform().getOrigin();
    lapPosition.set(lapOrigin.x(), lapOrigin.y(), lapOrigin.z());
    laps.update(lapPosition, fixedStep);
    offTrackTime = isAsphalt(lapPosition) ? 0 : offTrackTime + fixedStep;
    car.setHazards(offTrackTime > 3 && (offTrackTime - 3) % 0.8 < 0.4);
    for (let i = 0; i < 4; i++) {
      wheelContacts[i] = vehicle.getWheelInfo(i).get_m_raycastInfo().get_m_isInContact();
    }
  }


  function interpolate(alpha: number) {
    car.setBraking(spawnBrakeHeld || (!reversing && controls.brake > 0));
    car.setReversing(reversing);
    for (const state of visualStates) {
      state.object.position.lerpVectors(state.previousPosition, state.position, alpha);
      state.object.quaternion.slerpQuaternions(state.previousRotation, state.rotation, alpha);
    }
    velocity.lerpVectors(previousVelocity, currentVelocity, alpha);
    return velocity;
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    world.removeAction(vehicle);
    Ammo.destroy(vehicle);
    Ammo.destroy(raycaster);
    for (const { body, motion } of rigidBodies) {
      world.removeRigidBody(body);
      Ammo.destroy(body);
      Ammo.destroy(motion);
    }
    Ammo.destroy(coneShape);
    Ammo.destroy(coneBodyShape);
    Ammo.destroy(coneBaseShape);
    Ammo.destroy(chassisShape);
    Ammo.destroy(groundShape);
    heightData.release();
    Ammo.destroy(coneResetTransform);
    Ammo.destroy(resetTransform);
    Ammo.destroy(forceOffset);
    Ammo.destroy(vector);
    Ammo.destroy(world);
    Ammo.destroy(solver);
    Ammo.destroy(broadphase);
    Ammo.destroy(dispatcher);
    Ammo.destroy(configuration);
  }

  return {
    step, reset, dispose, captureVisuals, interpolate, fixedStep, wheelContacts, tireSounds,
    get engine() { return drivetrain.state; },
    get burnout() { return burnout; },
    get steering() { return steering; },
    get reversing() { return reversing; },
    get spawnBrakeHeld() { return spawnBrakeHeld; },
    get brakestand() { return brakestand; },
  };
}
