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
  const cabinDisplacement = new THREE.Vector3();
  const cabinStep = new THREE.Vector3();
  const cabinInverseRotation = new THREE.Quaternion();
  const cabinTilt = new THREE.Quaternion();
  const cabinTiltAngles = new THREE.Euler();
  let hasCabinVelocity = false;
  let previousCameraStyle: ConfigurationState['cameraStyle'] | null = null;
  const previousTravel = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const cornerTarget = new THREE.Vector3();
  const routeTangent = new THREE.Vector3();
  let slideCameraAmount = 0;
  let outsideOffset = 0;
  let cameraTurnRate = 0;
  const up = new THREE.Vector3(0, 1, 0);

  const cameraHeight = 2.3;
  const forward = new THREE.Vector3(0, 0, 1);
  const travel = new THREE.Vector3(0, 0, 1);
  const cameraDirection = new THREE.Vector3(0, 0, 1);
  const desiredCamera = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const desiredLookTarget = new THREE.Vector3();
  const travelVelocity = new THREE.Vector3();
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
    slideCameraAmount = outsideOffset = cameraTurnRate = 0;
    previousTravel.set(0, 0, 0);
    hasCabinVelocity = false;
    cabinOffset.set(0, 0, 0);
    cabinOffsetVelocity.set(0, 0, 0);
    cameraDirection.set(Math.sin(heading), 0, Math.cos(heading));
    previousCarPosition.copy(car.chassis.position);
    camera.position.copy(car.chassis.position).addScaledVector(cameraDirection, -9);
    camera.position.y += cameraHeight;
    lookTarget.copy(car.chassis.position).add(new THREE.Vector3(0, 0.65, 0));
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
      cabinInverseRotation.copy(car.chassis.quaternion).invert();
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
    // Exact critically damped spring integration stays stable across frame rates and impact spikes.
    const response = cabinCameraMotion.response;
    const decay = Math.exp(-response * dt);
    cabinDisplacement.subVectors(cabinOffset, cabinTargetOffset);
    cabinStep
      .copy(cabinOffsetVelocity)
      .addScaledVector(cabinDisplacement, response)
      .multiplyScalar(dt);
    cabinOffset
      .copy(cabinTargetOffset)
      .addScaledVector(cabinDisplacement, decay)
      .addScaledVector(cabinStep, decay);
    cabinOffsetVelocity.addScaledVector(cabinStep, -response).multiplyScalar(decay);
  }

  function update(
    dt: number,
    velocity: THREE.Vector3,
    driveMode: DriveMode,
    cameraStyle: ConfigurationState['cameraStyle'],
    reversing: boolean,
    cabinHeadMotion = true,
  ) {
    if (mapShown) {
      // Resume the driving camera from its saved pose, not from the map.
      camera.position.copy(chasePosition);
      camera.quaternion.copy(chaseQuaternion);
    }
    carDisplacement.subVectors(car.chassis.position, previousCarPosition);
    previousCarPosition.copy(car.chassis.position);
    if (cameraStyle !== 'cabin') {
      // Follow translation on the same sample as the car; damp only the camera's relative pose.
      camera.position.add(carDisplacement);
      lookTarget.add(carDisplacement);
    }
    const tune = driveModes[driveMode];
    updateCabinMotion(dt, velocity, cabinHeadMotion);
    const speed = Math.hypot(velocity.x, velocity.z);
    forward.set(0, 0, 1).applyQuaternion(car.chassis.quaternion);
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
      camera.fov = cabin ? 75 : 55;
      camera.updateProjectionMatrix();
    }
    const near = cabin ? 0.03 : 0.1;
    if (cabin) {
      camera.position
        .copy(cabinEye)
        .add(cabinOffset)
        .applyQuaternion(car.chassis.quaternion)
        .add(car.chassis.position);
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
        .applyQuaternion(car.chassis.quaternion);
      cabinUp.set(0, 1, 0).applyQuaternion(cabinTilt).applyQuaternion(car.chassis.quaternion);
      camera.up.copy(cabinUp);
      camera.lookAt(desiredLookTarget.copy(camera.position).add(cabinDirection));
      previousTravel.copy(travelVelocity);
    } else {
      camera.up.copy(up);
      cameraOrbit.copy(cameraDirection).applyAxisAngle(up, cameraYaw);
      desiredCamera
        .copy(car.chassis.position)
        .addScaledVector(cameraOrbit, -9 - Math.min(speed * 0.04, 2));
      desiredCamera.y = car.chassis.position.y + cameraHeight + cameraPitch;
      const motionTurn =
        speed > 3 && previousTravel.lengthSq() > 0
          ? Math.atan2(
              previousTravel.z * travelVelocity.x - previousTravel.x * travelVelocity.z,
              previousTravel.dot(travelVelocity),
            ) / Math.max(dt, 0.001)
          : 0;
      previousTravel.copy(travelVelocity);
      cameraTurnRate = THREE.MathUtils.damp(cameraTurnRate, motionTurn, 4, dt);
      const manualCamera =
        controls.lookBehind ||
        Math.abs(cameraYaw) > 0.1 ||
        Math.abs(cameraX) > 0 ||
        Math.abs(cameraY) > 0;
      const cornerCamera = cameraStyle === 'corner' && !manualCamera && !reversing;
      const slideAngle =
        speed > 3 ? Math.acos(THREE.MathUtils.clamp(forward.dot(travelVelocity), -1, 1)) : 0;
      const slideAmount = cornerCamera
        ? THREE.MathUtils.smoothstep(slideAngle, 0.12, 0.65) *
          THREE.MathUtils.smoothstep(speed, 3, 10)
        : 0;
      slideCameraAmount = THREE.MathUtils.damp(slideCameraAmount, slideAmount, 3, dt);
      outsideOffset = THREE.MathUtils.damp(
        outsideOffset,
        -THREE.MathUtils.clamp(cameraTurnRate / 0.35, -1, 1) * slideCameraAmount * 1.8,
        3,
        dt,
      );
      if (cameraStyle === 'corner') {
        cameraRight.set(cameraDirection.z, 0, -cameraDirection.x);
        desiredCamera
          .addScaledVector(cameraRight, outsideOffset)
          .addScaledVector(cameraOrbit, -slideCameraAmount);
        desiredCamera.y += slideCameraAmount * 0.7;
      }
      if (previousCameraStyle === 'cabin') camera.position.copy(desiredCamera);
      else camera.position.lerp(desiredCamera, 1 - Math.exp(-tune.cameraPositionResponse * dt));
      camera.position.y = Math.max(
        camera.position.y,
        terrain.heightAt(camera.position.x, camera.position.z) + 1,
      );
      desiredLookTarget.copy(car.chassis.position).addScaledVector(velocity, 0.18);
      desiredLookTarget.y = car.chassis.position.y + 0.65;
      if (cornerCamera) {
        let nearest = 0;
        let distance = Infinity;
        for (let i = 0; i < cameraRoutePoints.length; i++) {
          const point = cameraRoutePoints[i];
          const next = cameraRoutePoints[(i + 1) % cameraRoutePoints.length];
          const dx = next.x - point.x;
          const dz = next.z - point.z;
          const fraction = THREE.MathUtils.clamp(
            ((car.chassis.position.x - point.x) * dx + (car.chassis.position.z - point.z) * dz) /
              Math.max(dx * dx + dz * dz, 0.000001),
            0,
            1,
          );
          const squared =
            (point.x + dx * fraction - car.chassis.position.x) ** 2 +
            (point.z + dz * fraction - car.chassis.position.z) ** 2;
          if (squared < distance) {
            distance = squared;
            nearest = i + fraction;
          }
        }
        const t = nearest / cameraRoutePoints.length;
        cameraRoute.getTangentAt(t, routeTangent);
        const onCourse =
          1 -
          THREE.MathUtils.smoothstep(Math.sqrt(distance), cameraCourseWidth / 2, cameraCourseWidth);
        const alignment = THREE.MathUtils.smoothstep(travelVelocity.dot(routeTangent), 0.2, 0.8);
        const amount = onCourse * alignment * THREE.MathUtils.smoothstep(speed, 2, 8);
        cameraRoute.getPointAt(
          (t + THREE.MathUtils.clamp(speed * 0.8, 10, 28) / cameraRouteLength) % 1,
          cornerTarget,
        );
        cornerTarget.y = terrain.heightAt(cornerTarget.x, cornerTarget.z) + 0.65;
        desiredLookTarget.lerp(cornerTarget, amount * 0.4);
      }
      if (previousCameraStyle === 'cabin') lookTarget.copy(desiredLookTarget);
      else
        lookTarget.lerp(desiredLookTarget, 1 - Math.exp(-(cameraStyle === 'corner' ? 5 : 10) * dt));
      camera.lookAt(lookTarget);
    }
    previousCameraStyle = cameraStyle;
    mapShown = controls.mapView;
    if (mapShown) showMap(dt);
    else setClipping(near);
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
    mapZoom = THREE.MathUtils.clamp(mapZoom * Math.exp(controls.mapZoom * dt), 0.02, 4);
    const height =
      mapZoom *
      1.1 *
      Math.max(mapSize.z / 2 / halfHeight, mapSize.x / 2 / (halfHeight * camera.aspect));
    const panSpeed = height * halfHeight;
    // With +Z at the top of this view, screen-right points toward -X.
    mapOffset.x -= controls.cameraX * panSpeed * dt;
    mapOffset.z -= controls.cameraY * panSpeed * dt;
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
    getCabinEye(target: THREE.Vector3) {
      return target
        .copy(cabinEye)
        .applyQuaternion(car.chassis.quaternion)
        .add(car.chassis.position);
    },
  };
}
