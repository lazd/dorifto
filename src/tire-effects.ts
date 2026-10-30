import * as THREE from 'three';
import { TireSmoke } from './smoke';
import type { PhysicsCar } from './vehicle-physics';
import type { CourseTerrain } from './terrain';
import { createExhaustEffects } from './exhaust';
import type { DrivetrainState } from './drivetrain';

export function createTireEffects(
  scene: THREE.Scene,
  car: Pick<PhysicsCar, 'chassis' | 'wheels'> & { widths: number[] },
  terrain: CourseTerrain,
  isAsphalt: (position: THREE.Vector3) => boolean,
) {
  const maxMarks = 6000;
  const markPositions = new Float32Array(maxMarks * 18);
  const markColors = new Float32Array(maxMarks * 18);
  const markNormals = new Float32Array(maxMarks * 18);
  const markGeometry = new THREE.BufferGeometry();
  const markAttribute = new THREE.BufferAttribute(markPositions, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  markGeometry.setAttribute('position', markAttribute);
  const markColorAttribute = new THREE.BufferAttribute(markColors, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  markGeometry.setAttribute('color', markColorAttribute);
  const markNormalAttribute = new THREE.BufferAttribute(markNormals, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  markGeometry.setAttribute('normal', markNormalAttribute);
  markGeometry.setDrawRange(0, 0);
  const marks = new THREE.Mesh(
    markGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  marks.frustumCulled = false;
  scene.add(marks);
  const previousTires = [new THREE.Vector3(), new THREE.Vector3()];
  const previousLeft = [new THREE.Vector3(), new THREE.Vector3()];
  const previousRight = [new THREE.Vector3(), new THREE.Vector3()];
  const tireAcross = new THREE.Vector3();
  const tireLeft = new THREE.Vector3();
  const tireRight = new THREE.Vector3();
  const markTriangle = new THREE.Triangle();
  const markNormal = new THREE.Vector3();
  const marking = [false, false];
  const wheelAsphalt = [true, true, true, true];
  const previousAsphalt = [true, true];
  const asphaltMark = new THREE.Color(0x101214);
  const dirtMark = new THREE.Color(0x493827);
  let markCount = 0;

  const smoke = new TireSmoke(scene, car.chassis);
  scene.add(smoke.mesh);
  let exhaust: ReturnType<typeof createExhaustEffects> | undefined;

  function reset() {
    smoke.reset();
    exhaust?.reset();
    markCount = 0;
    markGeometry.setDrawRange(0, 0);
    marking.fill(false);
  }

  function update(
    dt: number,
    velocity: THREE.Vector3,
    camera: THREE.Camera,
    wheelContacts: boolean[],
    sliding: boolean,
    burningOut: boolean,
    engine?: Readonly<DrivetrainState>,
  ) {
    const leavingMarks = sliding || burningOut;
    for (let i = 2; i < 4; i++) wheelAsphalt[i] = isAsphalt(car.wheels[i].position);
    if (leavingMarks) {
      car.wheels.slice(2).forEach((wheel, i) => {
        const contact = wheelContacts[i + 2];
        tireAcross.set(1, 0, 0).applyQuaternion(wheel.quaternion);
        tireAcross.y = 0;
        tireAcross.normalize().multiplyScalar(car.widths[i + 2] / 2);
        const paved = wheelAsphalt[i + 2];
        tireLeft.copy(wheel.position).sub(tireAcross);
        tireRight.copy(wheel.position).add(tireAcross);
        tireLeft.y = terrain.heightAt(tireLeft.x, tireLeft.z) + 0.04;
        tireRight.y = terrain.heightAt(tireRight.x, tireRight.z) + 0.04;
        if (
          marking[i] &&
          contact &&
          paved === previousAsphalt[i] &&
          wheel.position.distanceToSquared(previousTires[i]) < 4
        ) {
          const offset = (markCount % maxMarks) * 18;
          markPositions.set(
            [
              ...previousLeft[i].toArray(),
              ...previousRight[i].toArray(),
              ...tireLeft.toArray(),
              ...previousRight[i].toArray(),
              ...tireRight.toArray(),
              ...tireLeft.toArray(),
            ],
            offset,
          );
          const color = paved ? asphaltMark : dirtMark;
          for (let vertex = 0; vertex < 6; vertex++) color.toArray(markColors, offset + vertex * 3);
          for (let triangle = 0; triangle < 2; triangle++) {
            const start = offset + triangle * 9;
            markTriangle.a.fromArray(markPositions, start);
            markTriangle.b.fromArray(markPositions, start + 3);
            markTriangle.c.fromArray(markPositions, start + 6);
            markTriangle.getNormal(markNormal);
            for (let vertex = 0; vertex < 3; vertex++)
              markNormal.toArray(markNormals, start + vertex * 3);
          }
          markCount++;
        }
        previousTires[i].copy(wheel.position);
        previousLeft[i].copy(tireLeft);
        previousRight[i].copy(tireRight);
        marking[i] = contact;
        previousAsphalt[i] = paved;
      });
      markAttribute.needsUpdate = true;
      markColorAttribute.needsUpdate = true;
      markNormalAttribute.needsUpdate = true;
      markGeometry.setDrawRange(0, Math.min(markCount, maxMarks) * 6);
    } else {
      marking.fill(false);
    }
    smoke.update(
      dt,
      car.wheels,
      wheelContacts,
      leavingMarks,
      velocity,
      camera,
      wheelAsphalt,
      (x, z) => terrain.heightAt(x, z),
    );
    if (!engine) {
      exhaust?.reset();
      return { backfire: 0, backfireBody: 0 };
    }
    exhaust ??= createExhaustEffects(scene, car.chassis);
    return exhaust.update(dt, engine, camera);
  }

  function setCourse(
    nextTerrain: CourseTerrain,
    nextIsAsphalt: (position: THREE.Vector3) => boolean,
  ) {
    terrain = nextTerrain;
    isAsphalt = nextIsAsphalt;
    reset();
  }

  return {
    get active() {
      return smoke.active;
    },
    reset,
    setCourse,
    update,
    prepareRender: smoke.prepareRender.bind(smoke),
    dispose() {
      marks.removeFromParent();
      markGeometry.dispose();
      marks.material.dispose();
      smoke.dispose();
      exhaust?.dispose();
    },
  };
}
