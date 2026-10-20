import * as THREE from 'three';
import AmmoFactory from 'ammojs-typed';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCar } from './car';
import { TireSmoke } from './smoke';
import { DrivingControls } from './controls';
import './style.css';

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing UI element: ${selector}`);
  return found;
}

const status = element('#status');
const speedDisplay = element('#speed');
const stateDisplay = element('#state');

async function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  element('#app').append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D driving playground');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb5c7cd);
  scene.fog = new THREE.Fog(0xb5c7cd, 100, 340);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1500);
  camera.layers.enable(1);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = new RoomEnvironment();
  scene.environment = pmrem.fromScene(environment, 0.04).texture;
  environment.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xd9edff, 0x656052, 2));
  const sun = new THREE.DirectionalLight(0xffefd4, 3);
  sun.position.set(-20, 35, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -24;
  sun.shadow.camera.right = sun.shadow.camera.top = 24;
  sun.shadow.camera.far = 100;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshStandardMaterial({ color: 0x414b50, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(4000, 800, 0x718583, 0x566368);
  grid.position.y = 0.012;
  scene.add(grid);

  const paint = new THREE.MeshBasicMaterial({ color: 0xb0b7a8, side: THREE.DoubleSide });
  for (const radius of [22, 24, 48, 50]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.13, 192), paint);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.018;
    scene.add(ring);
  }
  const coneGeometry = new THREE.ConeGeometry(0.23, 0.7, 16);
  const coneMaterial = new THREE.MeshStandardMaterial({ color: 0xef8753, roughness: 0.8 });
  const cones: THREE.Mesh[] = [];
  for (let i = 0; i < 40; i++) {
    const angle = i / 40 * Math.PI * 2;
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.set(Math.cos(angle) * 56, 0.35, Math.sin(angle) * 56);
    cone.castShadow = true;
    scene.add(cone);
    cones.push(cone);
  }

  // The upstream Emscripten factory writes to `this`; ESM calls have no receiver.
  const [Ammo, car] = await Promise.all([AmmoFactory.call({}), loadCar()]);
  scene.add(car.chassis, ...car.wheels);
  const configuration = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher = new Ammo.btCollisionDispatcher(configuration);
  const broadphase = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();
  const world = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, configuration);
  const vector = new Ammo.btVector3(0, -9.81, 0);
  world.setGravity(vector);

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
    Ammo.destroy(info);
    Ammo.destroy(transform);
    return body;
  }

  vector.setValue(0, 1, 0);
  rigidBody(0, new Ammo.btStaticPlaneShape(vector, 0), new THREE.Vector3());
  const coneBodies = cones.map((mesh) => {
    const body = rigidBody(3, new Ammo.btConeShape(0.23, 0.7), mesh.position);
    body.setFriction(0.7);
    body.setRestitution(0.15);
    body.setDamping(0.08, 0.12);
    body.setCcdMotionThreshold(0.1);
    body.setCcdSweptSphereRadius(0.12);
    return body;
  });
  vector.setValue(0.86, 0.23, 2.02);
  const body = rigidBody(1450, new Ammo.btBoxShape(vector), new THREE.Vector3(0, 0.8, 0));
  body.setActivationState(4);
  body.setDamping(0.02, 0.05);
  const tuning = new Ammo.btVehicleTuning();
  const raycaster = new Ammo.btDefaultVehicleRaycaster(world);
  const vehicle = new Ammo.btRaycastVehicle(tuning, body, raycaster);
  vehicle.setCoordinateSystem(0, 1, 2);
  world.addAction(vehicle);
  const direction = new Ammo.btVector3(0, -1, 0);
  const axle = new Ammo.btVector3(-1, 0, 0);
  car.centers.forEach((center, i) => {
    const pair = i < 2 ? car.centers.slice(0, 2) : car.centers.slice(2);
    const halfTrack = (Math.abs(pair[0].x) + Math.abs(pair[1].x)) / 2;
    vector.setValue(i % 2 === 0 ? -halfTrack : halfTrack, center.y + 0.28, (pair[0].z + pair[1].z) / 2);
    const wheel = vehicle.addWheel(vector, direction, axle, 0.28, car.radii[i], tuning, i < 2);
    wheel.set_m_suspensionStiffness(35);
    wheel.set_m_wheelsDampingRelaxation(2.8);
    wheel.set_m_wheelsDampingCompression(4.5);
    wheel.set_m_maxSuspensionForce(12000);
    // Ammo supplies suspension/contact; the combined-slip tire model below
    // supplies all road forces, so Bullet must not apply a second tire model.
    wheel.set_m_frictionSlip(0);
    wheel.set_m_rollInfluence(0.06);
  });
  Ammo.destroy(direction);
  Ammo.destroy(axle);

  const controls = new DrivingControls(element('#controller-status'));
  const keys = controls.keys;
  const controlKeys = new Set(['ArrowLeft', 'ArrowRight', 'KeyX', 'KeyZ', 'Space', 'KeyR']);
  let steering = 0;
  let accumulator = 0;
  let lastTime = 0;
  let burnout = 0;
  let reversing = false;
  let cameraYaw = 0;
  let cameraPitch = 0;
  const cameraOrbit = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tireSpeeds = [0, 0, 0, 0];
  const tireAngles = [0, 0, 0, 0];
  const cameraHeight = 2.3;
  const fixedStep = 1 / 120;
  const velocity = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, 1);
  const travel = new THREE.Vector3(0, 0, 1);
  const cameraDirection = new THREE.Vector3(0, 0, 1);
  const desiredCamera = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const desiredLookTarget = new THREE.Vector3();
  const travelVelocity = new THREE.Vector3();
  const previousVelocity = new THREE.Vector3();
  const currentVelocity = new THREE.Vector3();
  const visualStates = [car.chassis, ...car.wheels, ...cones].map((object) => ({
    object,
    previousPosition: new THREE.Vector3(),
    position: new THREE.Vector3(),
    previousRotation: new THREE.Quaternion(),
    rotation: new THREE.Quaternion(),
  }));
  const shadowOffset = new THREE.Vector3(-20, 35, -12);
  const wheelBasis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const wheelContacts = [false, false, false, false];
  const physicsRotation = new THREE.Quaternion();
  const tireOffset = new THREE.Vector3();
  const tireForward = new THREE.Vector3();
  const tireLateral = new THREE.Vector3();
  const forceOffset = new Ammo.btVector3(0, 0, 0);
  const resetTransform = new Ammo.btTransform();
  resetTransform.setIdentity();
  vector.setValue(0, 0.8, 0);
  resetTransform.setOrigin(vector);

  const maxMarks = 6000;
  const markPositions = new Float32Array(maxMarks * 18);
  const markGeometry = new THREE.BufferGeometry();
  const markAttribute = new THREE.BufferAttribute(markPositions, 3).setUsage(THREE.DynamicDrawUsage);
  markGeometry.setAttribute('position', markAttribute);
  markGeometry.setDrawRange(0, 0);
  const marks = new THREE.Mesh(markGeometry, new THREE.MeshBasicMaterial({
    color: 0x293237, side: THREE.DoubleSide,
  }));
  marks.frustumCulled = false;
  scene.add(marks);
  const previousTires = [new THREE.Vector3(), new THREE.Vector3()];
  const previousLeft = [new THREE.Vector3(), new THREE.Vector3()];
  const previousRight = [new THREE.Vector3(), new THREE.Vector3()];
  const tireAcross = new THREE.Vector3();
  const tireLeft = new THREE.Vector3();
  const tireRight = new THREE.Vector3();
  const marking = [false, false];
  let markCount = 0;

  const smoke = new TireSmoke();
  scene.add(smoke.mesh);

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
    car.wheels.forEach((wheel, i) => {
      vehicle.getWheelInfo(i).set_m_rotation(tireAngles[i]);
      vehicle.updateWheelTransform(i, true);
      const transform = vehicle.getWheelTransformWS(i);
      const position = transform.getOrigin();
      const rotation = transform.getRotation();
      wheel.position.set(position.x(), position.y(), position.z());
      wheel.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
      wheel.quaternion.multiply(wheelBasis);
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
    controls.clear();
    reversing = false;
    cameraYaw = cameraPitch = 0;
    steering = 0;
    accumulator = 0;
    burnout = 0;
    tireSpeeds.fill(0);
    tireAngles.fill(0);
    wheelContacts.fill(false);
    smoke.reset();
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
    velocity.set(0, 0, 0);
    cameraDirection.set(0, 0, 1);
    camera.position.copy(car.chassis.position).add(new THREE.Vector3(0, cameraHeight, -9));
    lookTarget.copy(car.chassis.position).add(new THREE.Vector3(0, 0.65, 0));
    camera.lookAt(lookTarget);
    marking.fill(false);
  }

  window.addEventListener('keydown', (event) => {
    if (!controlKeys.has(event.code)) return;
    if (event.target instanceof HTMLButtonElement && event.code === 'Space') return;
    event.preventDefault();
    if (event.code === 'KeyR') {
      if (!event.repeat) reset();
    } else keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    if (controlKeys.has(event.code)) {
      event.preventDefault();
      keys.delete(event.code);
    }
  });
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => {
    keys.clear();
    lastTime = 0;
    accumulator = 0;
    captureVisuals(true);
  });
  element('#reset').addEventListener('click', () => {
    reset();
    element<HTMLButtonElement>('#reset').blur();
  });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
  });
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    status.hidden = false;
    status.classList.add('error');
    status.textContent = 'Graphics context lost. Reload the page to restart.';
  });

  function step() {
    const linear = body.getLinearVelocity();
    const angular = body.getAngularVelocity();
    const speed = Math.hypot(linear.x(), linear.z()) * 3.6;
    const rotation = body.getWorldTransform().getRotation();
    physicsRotation.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    tireForward.set(0, 0, 1).applyQuaternion(physicsRotation);
    const forwardSpeed = linear.x() * tireForward.x + linear.z() * tireForward.z;
    if (controls.throttle > 0 || controls.reverse === 0) reversing = false;
    else if (Math.abs(forwardSpeed) < 0.5 && Math.abs(angular.y()) < 0.5 && speed < 4) reversing = true;
    const input = controls.steer;
    const steeringLimit = THREE.MathUtils.lerp(0.65, 0.5, Math.min(speed / 140, 1));
    const counterSteering = input !== 0 && Math.sign(input) !== Math.sign(steering);
    steering = THREE.MathUtils.damp(steering, input * steeringLimit, counterSteering ? 16 : 10, fixedStep);
    const brakeAmount = reversing ? Number(keys.has('KeyZ')) : controls.brake;
    const braking = brakeAmount > 0;
    const handbrake = controls.handbrake;
    const throttle = reversing ? controls.reverse : controls.throttle;
    const brakestand = throttle > 0 && braking && !reversing;
    burnout = 0;
    for (let i = 0; i < 4; i++) {
      const rear = i >= 2;
      vehicle.setSteeringValue(rear ? 0 : steering, i);
      const wheel = vehicle.getWheelInfo(i);
      const contact = wheel.get_m_raycastInfo();
      tireOffset.copy(car.centers[i]).applyQuaternion(physicsRotation);
      if (wheelContacts[i]) {
        const point = contact.get_m_contactPointWS();
        const origin = body.getWorldTransform().getOrigin();
        tireOffset.set(point.x() - origin.x(), point.y() - origin.y(), point.z() - origin.z());
      }
      tireForward.set(Math.sin(rear ? 0 : steering), 0, Math.cos(rear ? 0 : steering))
        .applyQuaternion(physicsRotation);
      tireForward.y = 0;
      tireForward.normalize();
      tireLateral.set(tireForward.z, 0, -tireForward.x);
      const vx = linear.x() + angular.y() * tireOffset.z - angular.z() * tireOffset.y;
      const vz = linear.z() + angular.x() * tireOffset.y - angular.y() * tireOffset.x;
      const along = vx * tireForward.x + vz * tireForward.z;
      const across = vx * tireLateral.x + vz * tireLateral.z;
      const slipAngle = Math.atan2(across, Math.max(Math.abs(along), 2));
      const load = wheelContacts[i] ? Math.max(0, wheel.get_m_wheelsSuspensionForce()) : 0;
      const staticGrip = braking && !rear ? 0.15 * brakeAmount * (1 - THREE.MathUtils.smoothstep(Math.abs(along), 0.2, 0.5)) : 0;
      const capacity = load * (1.25 + staticGrip);
      const lateralDemand = -(rear ? 42000 : 38000) * slipAngle;
      const brakeTorque = rear && handbrake ? 4500
        : brakeAmount * (rear ? brakestand ? 650 : 1300 : 1900);
      let longitudinalForce = 0;
      let lateralForce = 0;
      // Substep wheel inertia so tire slip remains stable at low road speeds.
      const tireStep = fixedStep / 12;
      for (let j = 0; j < 12; j++) {
        // Limit both launch torque and power (220 kW total at the rear wheels).
        // Excess wheelspin raises wheel speed and reduces available torque.
        const engineTorque = rear && speed < (reversing ? 35 : 240)
          ? throttle * (reversing ? -1 : 1) * Math.min(2200, 110000 / Math.max(Math.abs(tireSpeeds[i]), 1)) : 0;
        const slipRatio = (tireSpeeds[i] * car.radii[i] - along) / Math.max(Math.abs(along), braking ? 0.5 : 4);
        // Saturate the combined demand, not each axis independently: a tire
        // spinning far above road speed must lose lateral authority.
        const driveDemand = capacity * slipRatio * 8;
        const lateral = lateralDemand;
        const combined = Math.hypot(driveDemand, lateral);
        const scale = combined > 0 ? capacity * Math.tanh(combined / Math.max(capacity, 1)) / combined : 1;
        const fx = driveDemand * scale;
        const fy = lateral * scale;
        const differential = rear ? THREE.MathUtils.clamp((tireSpeeds[i === 2 ? 3 : 2] - tireSpeeds[i]) * 8, -250, 250) : 0;
        const torque = engineTorque + differential - fx * car.radii[i];
        const nextSpeed = tireSpeeds[i] + torque / 2 * tireStep;
        tireSpeeds[i] = Math.sign(nextSpeed) * Math.max(0, Math.abs(nextSpeed) - brakeTorque / 2 * tireStep);
        tireAngles[i] += tireSpeeds[i] * tireStep;
        longitudinalForce += fx / 12;
        lateralForce += fy / 12;
      }
      if (rear && wheelContacts[i]) {
        const excessSpeed = Math.abs(tireSpeeds[i] * car.radii[i] - along);
        const slipRatio = excessSpeed / Math.max(Math.abs(along), 4);
        // Normal acceleration needs a small amount of slip, not tire smoke.
        burnout = Math.max(burnout, THREE.MathUtils.smoothstep(slipRatio, 0.18, 0.65)
          * THREE.MathUtils.smoothstep(excessSpeed, 1, 4));
      }
      vector.setValue(
        tireForward.x * longitudinalForce + tireLateral.x * lateralForce, 0,
        tireForward.z * longitudinalForce + tireLateral.z * lateralForce,
      );
      forceOffset.setValue(tireOffset.x, tireOffset.y, tireOffset.z);
      body.applyForce(vector, forceOffset);
    }
    const drag = 8 + 0.45 * Math.hypot(linear.x(), linear.z());
    vector.setValue(-linear.x() * drag, 0, -linear.z() * drag);
    body.applyCentralForce(vector);
    world.stepSimulation(fixedStep, 0);
    for (let i = 0; i < 4; i++) {
      wheelContacts[i] = vehicle.getWheelInfo(i).get_m_raycastInfo().get_m_isInContact();
    }
  }

  function frame(time: number) {
    controls.poll();
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : fixedStep;
    lastTime = time;
    accumulator += dt;
    while (accumulator >= fixedStep) {
      step();
      captureVisuals();
      accumulator -= fixedStep;
    }
    const alpha = accumulator / fixedStep;
    for (const state of visualStates) {
      state.object.position.lerpVectors(state.previousPosition, state.position, alpha);
      state.object.quaternion.slerpQuaternions(state.previousRotation, state.rotation, alpha);
    }
    velocity.lerpVectors(previousVelocity, currentVelocity, alpha);
    const speed = velocity.length();
    forward.set(0, 0, 1).applyQuaternion(car.chassis.quaternion);
    forward.y = 0;
    forward.normalize();
    travel.copy(forward);
    travelVelocity.copy(velocity).normalize();
    travel.lerp(travelVelocity, 0.85 * THREE.MathUtils.smoothstep(speed, 0.5, 3)).normalize();
    cameraDirection.lerp(travel, 1 - Math.exp(-1.8 * dt)).normalize();
    cameraYaw = THREE.MathUtils.damp(cameraYaw, controls.lookBehind ? Math.PI : -controls.cameraX * 0.45, 9, dt);
    cameraPitch = THREE.MathUtils.damp(cameraPitch, -controls.cameraY * 0.8, 9, dt);
    cameraOrbit.copy(cameraDirection).applyAxisAngle(up, cameraYaw);
    desiredCamera.copy(car.chassis.position).addScaledVector(cameraOrbit, -9 - Math.min(speed * 0.04, 2));
    desiredCamera.y = car.chassis.position.y + cameraHeight + cameraPitch;
    camera.position.lerp(desiredCamera, 1 - Math.exp(-5 * dt));
    desiredLookTarget.copy(car.chassis.position).addScaledVector(velocity, 0.18);
    desiredLookTarget.y += 0.65;
    lookTarget.lerp(desiredLookTarget, 1 - Math.exp(-10 * dt));
    camera.lookAt(lookTarget);
    sun.position.copy(car.chassis.position).add(shadowOffset);
    sun.target.position.copy(car.chassis.position);

    const slip = speed > 3 ? 1 - Math.abs(forward.dot(velocity) / speed) : 0;
    const sliding = speed > 3 && (controls.handbrake || slip > 0.045);
    const burningOut = burnout > 0.1 && (wheelContacts[2] || wheelContacts[3]);
    const leavingMarks = sliding || burningOut;
    if (leavingMarks) {
      car.wheels.slice(2).forEach((wheel, i) => {
        const contact = wheelContacts[i + 2];
        tireAcross.set(1, 0, 0).applyQuaternion(wheel.quaternion);
        tireAcross.y = 0;
        tireAcross.normalize().multiplyScalar(car.widths[i + 2] / 2);
        tireLeft.copy(wheel.position).sub(tireAcross).setY(0.025);
        tireRight.copy(wheel.position).add(tireAcross).setY(0.025);
        if (marking[i] && contact && wheel.position.distanceToSquared(previousTires[i]) < 4) {
          const offset = (markCount % maxMarks) * 18;
          markPositions.set([
            previousLeft[i].x, 0.025, previousLeft[i].z,
            previousRight[i].x, 0.025, previousRight[i].z,
            tireLeft.x, 0.025, tireLeft.z,
            previousRight[i].x, 0.025, previousRight[i].z,
            tireRight.x, 0.025, tireRight.z,
            tireLeft.x, 0.025, tireLeft.z,
          ], offset);
          markCount++;
        }
        previousTires[i].copy(wheel.position);
        previousLeft[i].copy(tireLeft);
        previousRight[i].copy(tireRight);
        marking[i] = contact;
      });
      markAttribute.needsUpdate = true;
      markGeometry.setDrawRange(0, Math.min(markCount, maxMarks) * 6);
    } else {
      marking.fill(false);
    }
    smoke.update(dt, car.wheels, wheelContacts, leavingMarks, velocity, camera);
    speedDisplay.textContent = String(Math.round(speed * 3.6));
    stateDisplay.textContent = controls.handbrake ? 'HANDBRAKE'
      : controls.brake > 0 && controls.throttle > 0 ? 'BRAKESTAND'
      : reversing ? 'REVERSE' : controls.brake > 0 ? 'BRAKING'
      : burningOut ? 'BURNOUT' : sliding ? 'SLIDING' : 'REAR-WHEEL DRIVE';
    if (Math.abs(car.chassis.position.x) > 1800 || Math.abs(car.chassis.position.z) > 1800 || car.chassis.position.y < -5) reset();
    smoke.captureDepth(renderer, scene, camera);
    renderer.render(scene, camera);
  }

  reset();
  status.hidden = true;
  renderer.setAnimationLoop((time) => {
    try {
      frame(time);
    } catch (error) {
      renderer.setAnimationLoop(null);
      showError(error);
    }
  });
}

function showError(error: unknown) {
  console.error('Unable to run Dorifto:', error);
  status.hidden = false;
  status.classList.add('error');
  status.setAttribute('role', 'alert');
  status.textContent = `Unable to run the demo: ${error instanceof Error ? error.message : String(error)}. Check the console and reload to retry.`;
}

void start().catch(showError);
