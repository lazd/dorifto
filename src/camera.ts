import * as THREE from 'three';
import { courseRoute, type CourseDefinition } from './courses';
import { driveModes, type DriveMode } from './drive-modes';
import type { ConfigurationState } from './configuration-state';
import type { DrivingControls } from './controls';
import type { CourseTerrain } from './terrain';
import { carLightLayers, type loadCar } from './car';

export const cabinCameraMotion = {
  // Displacement in meters per g, along the car's local axes.
  lateralMovement: 0.02,
  longitudinalMovement: 0.035,
  verticalMovement: 0.025,
  maxGForce: 2.5,
  response: 14,
  tiltPerMeter: 0.8,
};

export const fpvCameraMotion = {
  distance: 5.5,
  // Extra trailing distance in meters per m/s, capped at maxSpeedDistance.
  speedDistance: 0.06,
  maxSpeedDistance: 3,
  height: 1.8,
  fov: 75,
  // Meters of course ahead of the car whose direction the drone lines up with, per m/s.
  courseLookahead: 0.35,
  minCourseLookahead: 3,
  maxCourseLookahead: 14,
  headingResponse: 2.5,
  positionResponse: 4,
  lookResponse: 8,
  // Bank radians per m/s² of the drone's own lateral acceleration.
  bankPerAcceleration: 0.025,
  maxBank: 0.5,
  bankResponse: 3,
  minTerrainClearance: 1.2,
};

const springDisplacement = new THREE.Vector3();
const springStep = new THREE.Vector3();

// Exact critically damped spring integration stays stable across frame rates and impact spikes.
function dampSpring(
  value: THREE.Vector3,
  velocity: THREE.Vector3,
  target: THREE.Vector3,
  response: number,
  dt: number,
) {
  const decay = Math.exp(-response * dt);
  springDisplacement.subVectors(value, target);
  springStep.copy(velocity).addScaledVector(springDisplacement, response).multiplyScalar(dt);
  value.copy(target).addScaledVector(springDisplacement, decay).addScaledVector(springStep, decay);
  velocity.addScaledVector(springStep, -response).multiplyScalar(decay);
}

export function createDrivingCamera(
  camera: THREE.PerspectiveCamera,
  car: Awaited<ReturnType<typeof loadCar>>,
  controls: DrivingControls,
  definition: CourseDefinition,
  terrain: CourseTerrain,
) {
  camera.layers.enable(carLightLayers.headlights);
  const drivingFar = camera.far;
  const cameraRoute = courseRoute(definition);
  const cameraRouteLength = cameraRoute.getLength();
  const cameraCourseWidth = definition.width;
  const cameraRoutePoints = cameraRoute.getSpacedPoints(Math.ceil(cameraRouteLength / 2));
  cameraRoutePoints.pop();

  /** The body the camera chases; the car unless spectating a ghost. */
  let subject: THREE.Object3D = car.chassis;
  let cameraYaw = 0;
  let cameraPitch = 0;
  const cameraOrbit = new THREE.Vector3();
  const cabinEye = new THREE.Vector3();
  function setCabinEye(eye: THREE.Vector3) {
    cabinEye.copy(eye);
    car.aimMirrors(cabinEye);
  }
  setCabinEye(new THREE.Vector3(-0.38, 0.43, -0.25));
  const cabinDirection = new THREE.Vector3();
  const cabinUp = new THREE.Vector3();
  const previousCabinVelocity = new THREE.Vector3();
  const cabinOffset = new THREE.Vector3();
  const cabinOffsetVelocity = new THREE.Vector3();
  const cabinTargetOffset = new THREE.Vector3();
  const cabinInverseRotation = new THREE.Quaternion();
  const cabinTilt = new THREE.Quaternion();
  const cabinTiltAngles = new THREE.Euler();
  let hasCabinVelocity = false;
  let previousCameraStyle: ConfigurationState['cameraStyle'] | null = null;
  const cameraRight = new THREE.Vector3();
  const routeTangent = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const cameraHeight = 2.3;
  const forward = new THREE.Vector3(0, 0, 1);
  const travel = new THREE.Vector3(0, 0, 1);
  const cameraDirection = new THREE.Vector3(0, 0, 1);
  const desiredCamera = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const desiredLookTarget = new THREE.Vector3();
  const travelVelocity = new THREE.Vector3();
  const droneHeading = new THREE.Vector3(0, 0, 1);
  const previousDroneHeading = new THREE.Vector3();
  const droneHeadingTarget = new THREE.Vector3();
  const droneOffset = new THREE.Vector3();
  const droneOffsetVelocity = new THREE.Vector3();
  const droneTargetOffset = new THREE.Vector3();
  let droneBank = 0;
  const previousCarPosition = new THREE.Vector3();
  const carDisplacement = new THREE.Vector3();

  // Bird's-eye map: straight down over the whole course, with the course's +Z at the top.
  const mapBounds = new THREE.Box3()
    .setFromPoints(cameraRoutePoints)
    .expandByScalar(cameraCourseWidth);
  const mapCenter = mapBounds.getCenter(new THREE.Vector3());
  const mapSize = mapBounds.getSize(new THREE.Vector3());
  const mapPosition = new THREE.Vector3();
  const mapOffset = new THREE.Vector3();
  const mapTarget = new THREE.Vector3();
  let mapZoom = 1;
  const mapQuaternion = new THREE.Quaternion();
  const mapMatrix = new THREE.Matrix4();
  const mapUp = new THREE.Vector3(0, 0, 1);
  const chasePosition = new THREE.Vector3();
  const chaseQuaternion = new THREE.Quaternion();
  let mapShown = false;

  function reset(heading: number) {
    mapShown = false;
    mapOffset.set(0, 0, 0);
    mapZoom = 1;
    cameraYaw = cameraPitch = 0;
    hasCabinVelocity = false;
    cabinOffset.set(0, 0, 0);
    cabinOffsetVelocity.set(0, 0, 0);
    cameraDirection.set(Math.sin(heading), 0, Math.cos(heading));
    droneHeading.copy(cameraDirection);
    droneOffsetVelocity.set(0, 0, 0);
    droneBank = 0;
    previousCarPosition.copy(subject.position);
    camera.position.copy(subject.position).addScaledVector(cameraDirection, -9);
    camera.position.y += cameraHeight;
    lookTarget.copy(subject.position).add(new THREE.Vector3(0, 0.65, 0));
    camera.lookAt(lookTarget);
  }

  function updateCabinMotion(dt: number, velocity: THREE.Vector3, enabled: boolean) {
    if (!enabled) {
      hasCabinVelocity = false;
      cabinOffset.set(0, 0, 0);
      cabinOffsetVelocity.set(0, 0, 0);
      return;
    }
    if (dt <= 0) return;
    cabinTargetOffset.set(0, 0, 0);
    if (hasCabinVelocity) {
      cabinInverseRotation.copy(subject.quaternion).invert();
      cabinTargetOffset
        .subVectors(velocity, previousCabinVelocity)
        .multiplyScalar(1 / (dt * 9.81))
        .applyQuaternion(cabinInverseRotation)
        .clampScalar(-cabinCameraMotion.maxGForce, cabinCameraMotion.maxGForce);
      cabinTargetOffset.set(
        -cabinTargetOffset.x * cabinCameraMotion.lateralMovement,
        -cabinTargetOffset.y * cabinCameraMotion.verticalMovement,
        -cabinTargetOffset.z * cabinCameraMotion.longitudinalMovement,
      );
    }
    previousCabinVelocity.copy(velocity);
    hasCabinVelocity = true;
    dampSpring(cabinOffset, cabinOffsetVelocity, cabinTargetOffset, cabinCameraMotion.response, dt);
  }

  let routeDistance = 0;
  // Returns the route parameter nearest the car and stores its horizontal distance in routeDistance.
  function nearestRouteT() {
    let nearest = 0;
    let distance = Infinity;
    for (let i = 0; i < cameraRoutePoints.length; i++) {
      const point = cameraRoutePoints[i];
      const next = cameraRoutePoints[(i + 1) % cameraRoutePoints.length];
      const dx = next.x - point.x;
      const dz = next.z - point.z;
      const fraction = THREE.MathUtils.clamp(
        ((subject.position.x - point.x) * dx + (subject.position.z - point.z) * dz) /
          Math.max(dx * dx + dz * dz, 0.000001),
        0,
        1,
      );
      const squared =
        (point.x + dx * fraction - subject.position.x) ** 2 +
        (point.z + dz * fraction - subject.position.z) ** 2;
      if (squared < distance) {
        distance = squared;
        nearest = i + fraction;
      }
    }
    routeDistance = Math.sqrt(distance);
    return nearest / cameraRoutePoints.length;
  }

  function updateDrone(dt: number, speed: number, followCourse: boolean, snap: boolean) {
    const motion = fpvCameraMotion;
    droneHeadingTarget.copy(travel);
    if (followCourse) {
      const t = nearestRouteT();
      cameraRoute.getTangentAt(t, routeTangent);
      // Trust the course over the car's own motion only when on course, moving, and roughly along it.
      const amount =
        (1 - THREE.MathUtils.smoothstep(routeDistance, cameraCourseWidth / 2, cameraCourseWidth)) *
        THREE.MathUtils.smoothstep(travelVelocity.dot(routeTangent), 0.2, 0.8) *
        THREE.MathUtils.smoothstep(speed, 2, 8);
      const lookahead = THREE.MathUtils.clamp(
        speed * motion.courseLookahead,
        motion.minCourseLookahead,
        motion.maxCourseLookahead,
      );
      cameraRoute.getTangentAt((t + lookahead / cameraRouteLength) % 1, routeTangent);
      routeTangent.setY(0).normalize();
      droneHeadingTarget.lerp(routeTangent, amount).normalize();
    }
    previousDroneHeading.copy(droneHeading);
    if (snap) droneHeading.copy(droneHeadingTarget);
    else
      droneHeading.lerp(droneHeadingTarget, 1 - Math.exp(-motion.headingResponse * dt)).normalize();
    const droneYawRate =
      dt > 0 && !snap
        ? Math.atan2(
            previousDroneHeading.z * droneHeading.x - previousDroneHeading.x * droneHeading.z,
            previousDroneHeading.dot(droneHeading),
          ) / dt
        : 0;
    droneBank = snap
      ? 0
      : THREE.MathUtils.damp(
          droneBank,
          THREE.MathUtils.clamp(
            droneYawRate * speed * motion.bankPerAcceleration,
            -motion.maxBank,
            motion.maxBank,
          ),
          motion.bankResponse,
          dt,
        );
    cameraOrbit.copy(droneHeading).applyAxisAngle(up, cameraYaw);
    droneTargetOffset
      .copy(cameraOrbit)
      .multiplyScalar(
        -motion.distance - Math.min(speed * motion.speedDistance, motion.maxSpeedDistance),
      );
    droneTargetOffset.y = motion.height + cameraPitch;
    droneOffset.subVectors(camera.position, subject.position);
    if (snap) {
      droneOffset.copy(droneTargetOffset);
      droneOffsetVelocity.set(0, 0, 0);
    } else
      dampSpring(droneOffset, droneOffsetVelocity, droneTargetOffset, motion.positionResponse, dt);
    camera.position.copy(subject.position).add(droneOffset);
    // Bank toward the turn: the drone's left (+heading rotated a quarter turn) side drops.
    cameraRight.set(droneHeading.z, 0, -droneHeading.x);
    camera.up.copy(up).addScaledVector(cameraRight, Math.tan(droneBank)).normalize();
  }

  function update(
    dt: number,
    velocity: THREE.Vector3,
    driveMode: DriveMode,
    cameraStyle: ConfigurationState['cameraStyle'],
    reversing: boolean,
    cabinHeadMotion = true,
    treeDrawDistance = 0,
  ) {
    if (mapShown) {
      // Resume the driving camera from its saved pose, not from the map.
      camera.position.copy(chasePosition);
      camera.quaternion.copy(chaseQuaternion);
    }
    carDisplacement.subVectors(subject.position, previousCarPosition);
    previousCarPosition.copy(subject.position);
    if (cameraStyle !== 'cabin') {
      // Follow translation on the same sample as the car; damp only the camera's relative pose.
      camera.position.add(carDisplacement);
      lookTarget.add(carDisplacement);
    }
    const tune = driveModes[driveMode];
    updateCabinMotion(dt, velocity, cabinHeadMotion);
    const speed = Math.hypot(velocity.x, velocity.z);
    forward.set(0, 0, 1).applyQuaternion(subject.quaternion);
    forward.y = 0;
    forward.normalize();
    travel.copy(forward);
    travelVelocity.copy(velocity).setY(0).normalize();
    travel
      .lerp(travelVelocity, tune.cameraTravelBlend * THREE.MathUtils.smoothstep(speed, 0.5, 3))
      .normalize();
    cameraDirection.lerp(travel, 1 - Math.exp(-tune.cameraDirectionResponse * dt)).normalize();
    const cameraX = controls.mapView ? 0 : controls.cameraX;
    const cameraY = controls.mapView ? 0 : controls.cameraY;
    const yawResponse = !controls.lookBehind && cameraX === 0 ? tune.cameraRecenterResponse : 9;
    const pitchResponse = cameraY === 0 ? tune.cameraRecenterResponse : 9;
    cameraYaw = THREE.MathUtils.damp(
      cameraYaw,
      (controls.lookBehind ? Math.PI : 0) - cameraX * 0.45,
      yawResponse,
      dt,
    );
    cameraPitch = THREE.MathUtils.damp(cameraPitch, -cameraY * 0.8, pitchResponse, dt);
    const cabin = cameraStyle === 'cabin';
    if (cameraStyle !== previousCameraStyle) {
      if (cabin) camera.layers.enable(carLightLayers.interior);
      else camera.layers.disable(carLightLayers.interior);
      camera.fov = cabin ? 75 : cameraStyle === 'fpv' ? fpvCameraMotion.fov : 55;
      camera.updateProjectionMatrix();
    }
    const near = cabin ? 0.03 : 0.1;
    if (cabin) {
      camera.position
        .copy(cabinEye)
        .add(cabinOffset)
        .applyQuaternion(subject.quaternion)
        .add(subject.position);
      cabinTilt.setFromEuler(
        cabinTiltAngles.set(
          cabinOffset.z * cabinCameraMotion.tiltPerMeter,
          0,
          -cabinOffset.x * cabinCameraMotion.tiltPerMeter,
        ),
      );
      cabinDirection
        .set(0, 0, 1)
        .applyAxisAngle(up, cameraYaw)
        .applyAxisAngle(
          cameraRight.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw)),
          -cameraPitch * 0.6,
        )
        .applyQuaternion(cabinTilt)
        .applyQuaternion(subject.quaternion);
      cabinUp.set(0, 1, 0).applyQuaternion(cabinTilt).applyQuaternion(subject.quaternion);
      camera.up.copy(cabinUp);
      camera.lookAt(desiredLookTarget.copy(camera.position).add(cabinDirection));
    } else {
      const fpv = cameraStyle === 'fpv';
      if (fpv) {
        const manualCamera =
          controls.lookBehind ||
          Math.abs(cameraYaw) > 0.1 ||
          Math.abs(cameraX) > 0 ||
          Math.abs(cameraY) > 0;
        updateDrone(dt, speed, !manualCamera && !reversing, previousCameraStyle !== 'fpv');
      } else {
        camera.up.copy(up);
        cameraOrbit.copy(cameraDirection).applyAxisAngle(up, cameraYaw);
        desiredCamera
          .copy(subject.position)
          .addScaledVector(cameraOrbit, -9 - Math.min(speed * 0.04, 2));
        desiredCamera.y = subject.position.y + cameraHeight + cameraPitch;
        if (previousCameraStyle === 'cabin') camera.position.copy(desiredCamera);
        else camera.position.lerp(desiredCamera, 1 - Math.exp(-tune.cameraPositionResponse * dt));
      }
      camera.position.y = Math.max(
        camera.position.y,
        terrain.heightAt(camera.position.x, camera.position.z) +
          (fpv ? fpvCameraMotion.minTerrainClearance : 1),
      );
      desiredLookTarget.copy(subject.position).addScaledVector(velocity, fpv ? 0.12 : 0.18);
      desiredLookTarget.y = subject.position.y + 0.65;
      const lookResponse = fpv ? fpvCameraMotion.lookResponse : 10;
      if (previousCameraStyle === 'cabin') lookTarget.copy(desiredLookTarget);
      else lookTarget.lerp(desiredLookTarget, 1 - Math.exp(-lookResponse * dt));
      camera.lookAt(lookTarget);
    }
    previousCameraStyle = cameraStyle;
    mapShown = controls.mapView;
    if (mapShown) showMap(dt);
    else setClipping(near, Math.max(drivingFar, treeDrawDistance + 500));
  }

  function setClipping(near: number, far = drivingFar) {
    if (camera.near === near && camera.far === far) return;
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }

  function showMap(dt: number) {
    chasePosition.copy(camera.position);
    chaseQuaternion.copy(camera.quaternion);
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    mapZoom = THREE.MathUtils.clamp(
      mapZoom * Math.exp(controls.mapZoom * dt + controls.mapWheelZoom),
      0.02,
      4,
    );
    const height =
      mapZoom *
      1.1 *
      Math.max(mapSize.z / 2 / halfHeight, mapSize.x / 2 / (halfHeight * camera.aspect));
    const panSpeed = height * halfHeight;
    // With +Z at the top of this view, screen-right points toward -X.
    mapOffset.x -= controls.cameraX * panSpeed * dt;
    mapOffset.z -= controls.cameraY * panSpeed * dt;
    mapOffset.x += controls.mapDragX * 2 * panSpeed * camera.aspect;
    mapOffset.z += controls.mapDragY * 2 * panSpeed;
    controls.mapDragX = controls.mapDragY = controls.mapWheelZoom = 0;
    mapTarget.copy(mapCenter).add(mapOffset);
    mapPosition.set(mapTarget.x, mapBounds.max.y + height, mapTarget.z);
    mapMatrix.lookAt(mapPosition, mapTarget, mapUp);
    mapQuaternion.setFromRotationMatrix(mapMatrix);
    camera.position.copy(mapPosition);
    camera.quaternion.copy(mapQuaternion);
    // A cabin-close near plane leaves too little depth precision from this high up,
    // and the ground z-fights through the road.
    setClipping(height * 0.05, Math.max(drivingFar, height + mapSize.y + 100));
  }

  return {
    reset,
    update,
    setCabinEye,
    follow(next: THREE.Object3D) {
      subject = next;
    },
    getCabinEye(target: THREE.Vector3) {
      return target.copy(cabinEye).applyQuaternion(subject.quaternion).add(subject.position);
    },
  };
}
