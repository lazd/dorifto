import * as THREE from 'three';
import AmmoFactory from 'ammojs-typed';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCar } from './car';
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

  const keys = new Set<string>();
  const controlKeys = new Set(['ArrowLeft', 'ArrowRight', 'KeyX', 'KeyZ', 'Space', 'KeyR']);
  let steering = 0;
  let accumulator = 0;
  let lastTime = 0;
  let burnout = 0;
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
    color: 0x11181b, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
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

  const smokeCount = 160;
  const smokePositions = new Float32Array(smokeCount * 3);
  const smokeLife = new Float32Array(smokeCount);
  const smokeGeometry = new THREE.BufferGeometry();
  const smokeAttribute = new THREE.BufferAttribute(smokePositions, 3).setUsage(THREE.DynamicDrawUsage);
  smokeGeometry.setAttribute('position', smokeAttribute);
  const smokeCanvas = document.createElement('canvas');
  smokeCanvas.width = smokeCanvas.height = 64;
  const smokeContext = smokeCanvas.getContext('2d');
  if (!smokeContext) throw new Error('Unable to create tire smoke texture.');
  const gradient = smokeContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(220,225,230,0.6)');
  gradient.addColorStop(1, 'rgba(220,225,230,0)');
  smokeContext.fillStyle = gradient;
  smokeContext.fillRect(0, 0, 64, 64);
  const smoke = new THREE.Points(smokeGeometry, new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(smokeCanvas), size: 1.5, transparent: true,
    opacity: 0.32, depthWrite: false,
  }));
  smoke.frustumCulled = false;
  scene.add(smoke);
  let smokeIndex = 0;
  let smokeEmission = 0;

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

  function reset() {
    keys.clear();
    steering = 0;
    accumulator = 0;
    burnout = 0;
    tireSpeeds.fill(0);
    tireAngles.fill(0);
    wheelContacts.fill(false);
    smokeLife.fill(0);
    smokePositions.fill(0);
    smokeAttribute.needsUpdate = true;
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
    syncVisuals();
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
    const input = Number(keys.has('ArrowLeft')) - Number(keys.has('ArrowRight'));
    const steeringLimit = THREE.MathUtils.lerp(0.5, 0.3, Math.min(speed / 140, 1));
    const counterSteering = input !== 0 && Math.sign(input) !== Math.sign(steering);
    steering = THREE.MathUtils.damp(steering, input * steeringLimit, counterSteering ? 12 : 8, fixedStep);
    const braking = keys.has('KeyZ');
    const handbrake = keys.has('Space');
    const throttle = keys.has('KeyX') && !braking;
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
      const capacity = load * 1.25;
      const lateralDemand = -(rear ? 42000 : 38000) * slipAngle;
      const engineTorque = rear && throttle && speed < 240
        ? 2200 * (1 - Math.min(Math.abs(tireSpeeds[i]) * car.radii[i] / 130, 0.75)) : 0;
      const brakeTorque = rear && handbrake ? 4500 : braking ? rear ? 1300 : 1900 : 0;
      let longitudinalForce = 0;
      let lateralForce = 0;
      // Substep wheel inertia so tire slip remains stable at low road speeds.
      const tireStep = fixedStep / 12;
      for (let j = 0; j < 12; j++) {
        const slipRatio = (tireSpeeds[i] * car.radii[i] - along) / Math.max(Math.abs(along), 4);
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
        burnout = Math.max(burnout, THREE.MathUtils.clamp(
          (tireSpeeds[i] * car.radii[i] - Math.abs(along)) / 8, 0, 1));
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
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : fixedStep;
    lastTime = time;
    accumulator += dt;
    while (accumulator >= fixedStep) {
      step();
      accumulator -= fixedStep;
    }
    syncVisuals();
    const linear = body.getLinearVelocity();
    velocity.set(linear.x(), 0, linear.z());
    const speed = velocity.length();
    forward.set(0, 0, 1).applyQuaternion(car.chassis.quaternion);
    forward.y = 0;
    forward.normalize();
    travel.copy(forward);
    if (speed > 2) travel.lerp(velocity.clone().normalize(), 0.85).normalize();
    cameraDirection.lerp(travel, 1 - Math.exp(-1.8 * dt)).normalize();
    desiredCamera.copy(car.chassis.position).addScaledVector(cameraDirection, -9 - Math.min(speed * 0.04, 2));
    desiredCamera.y = car.chassis.position.y + cameraHeight;
    camera.position.lerp(desiredCamera, 1 - Math.exp(-5 * dt));
    lookTarget.copy(car.chassis.position).addScaledVector(velocity, 0.18);
    lookTarget.y += 0.65;
    camera.lookAt(lookTarget);
    sun.position.copy(car.chassis.position).add(shadowOffset);
    sun.target.position.copy(car.chassis.position);

    const slip = speed > 3 ? 1 - Math.abs(forward.dot(velocity) / speed) : 0;
    const sliding = speed > 3 && (keys.has('Space') || slip > 0.045);
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
    smokeEmission += leavingMarks ? dt * 80 : 0;
    while (smokeEmission >= 1) {
      smokeEmission--;
      const wheel = 2 + smokeIndex % 2;
      if (wheelContacts[wheel]) {
        const i = smokeIndex % smokeCount;
        smokePositions.set([
          car.wheels[wheel].position.x + (Math.random() - 0.5) * 0.3,
          0.25,
          car.wheels[wheel].position.z + (Math.random() - 0.5) * 0.3,
        ], i * 3);
        smokeLife[i] = 1;
      }
      smokeIndex++;
    }
    for (let i = 0; i < smokeCount; i++) {
      smokeLife[i] = Math.max(0, smokeLife[i] - dt / 1.5);
      smokePositions[i * 3 + 1] = smokeLife[i] > 0 ? smokePositions[i * 3 + 1] + dt * 0.65 : -100;
      smokePositions[i * 3] += dt * 0.25;
    }
    smokeAttribute.needsUpdate = true;
    speedDisplay.textContent = String(Math.round(speed * 3.6));
    stateDisplay.textContent = keys.has('Space') ? 'HANDBRAKE' : keys.has('KeyZ') ? 'BRAKING' : burningOut ? 'BURNOUT' : sliding ? 'SLIDING' : 'REAR-WHEEL DRIVE';
    if (Math.abs(car.chassis.position.x) > 1800 || Math.abs(car.chassis.position.z) > 1800 || car.chassis.position.y < -5) reset();
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
