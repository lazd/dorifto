import * as THREE from 'three';
import type { DrivetrainState } from './drivetrain';

/** Shared event timing for audible pops and visible flames; independent of frame rate. */
export function createExhaustActivity(random = Math.random) {
  let cooldown = 0;
  let liftArmed = false;
  let overrun = 0;
  let previousMode = '';
  const interval = (antilag: boolean) =>
    (antilag ? 0.05 : 0.3) -
    Math.log(1 - Math.min(random(), 1 - Number.EPSILON)) * (antilag ? 0.1 : 0.75);
  return {
    reset() {
      cooldown = overrun = 0;
      liftArmed = false;
      previousMode = '';
    },
    update(dt: number, engine: Readonly<DrivetrainState>) {
      const antilag = engine.gear === 0 && engine.throttle > 0.1 && engine.rpm > 2500;
      if (engine.gear > 0 && engine.throttle > 0.2) liftArmed = true;
      if (liftArmed && engine.throttle < 0.1 && engine.gear > 0) {
        overrun = random() < 0.35 ? 1.4 : 0;
        liftArmed = false;
      } else overrun = Math.max(0, overrun - dt);
      if (engine.gear <= 0) liftArmed = false;
      const burbling = overrun > 0 && engine.throttle < 0.1 && engine.rpm > 3000;
      const mode = antilag ? 'antilag' : burbling ? 'overrun' : '';
      if (mode !== previousMode)
        cooldown = mode ? (antilag ? interval(true) : 0.08 + random() * 0.22) : 0;
      previousMode = mode;
      cooldown = Math.max(0, cooldown - dt);
      let backfire = 0;
      if ((antilag || burbling) && cooldown === 0) {
        backfire = antilag ? 0.65 + random() * 0.35 : 0.22 + random() * 0.16;
        cooldown = interval(antilag);
      }
      return { backfire, backfireBody: antilag ? 0 : 1, smoke: antilag };
    },
  };
}

export function exhaustOutlets(chassis: THREE.Object3D) {
  const inverse = new THREE.Matrix4();
  const bounds = new THREE.Box3();
  const vertices: THREE.Vector3[] = [];
  chassis.updateMatrixWorld(true);
  inverse.copy(chassis.matrixWorld).invert();
  chassis.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.name.endsWith('_Mufflers_0')) return;
    const geometry = object.geometry
      .clone()
      .applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    geometry.computeBoundingBox();
    if (geometry.boundingBox) bounds.union(geometry.boundingBox);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++)
      vertices.push(new THREE.Vector3().fromBufferAttribute(positions, i));
    geometry.dispose();
  });
  if (bounds.isEmpty()) throw new Error('Missing exhaust geometry.');
  // Only the rear lips, not the wider muffler bodies, define the four pipe openings.
  const lipDepth = 0.02;
  const lips = vertices
    .filter((point) => point.z < bounds.min.z + lipDepth)
    .sort((a, b) => a.x - b.x);
  const pipes: THREE.Box3[] = [];
  for (const point of lips) {
    const previous = pipes.at(-1);
    if (!previous || point.x - previous.max.x > lipDepth)
      pipes.push(new THREE.Box3().expandByPoint(point));
    else previous.expandByPoint(point);
  }
  if (pipes.length !== 4) throw new Error(`Expected four exhaust openings, found ${pipes.length}.`);
  return pipes.map((pipe) => {
    const center = pipe.getCenter(new THREE.Vector3());
    center.z = pipe.min.z - 0.01;
    return center;
  });
}

export function createExhaustEffects(scene: THREE.Scene, chassis: THREE.Object3D) {
  const activity = createExhaustActivity();
  const origin = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const outlets = exhaustOutlets(chassis);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const particles = Array.from({ length: 120 }, () => ({
    position: new THREE.Vector3(),
    age: 1,
    velocity: new THREE.Vector3(),
  }));
  const shades = new THREE.InstancedBufferAttribute(new Float32Array(particles.length), 1).setUsage(
    THREE.DynamicDrawUsage,
  );
  const centers = new THREE.InstancedBufferAttribute(
    new Float32Array(particles.length * 3),
    3,
  ).setUsage(THREE.DynamicDrawUsage);
  const ages = new THREE.InstancedBufferAttribute(
    new Float32Array(particles.length).fill(1),
    1,
  ).setUsage(THREE.DynamicDrawUsage);
  const smokeGeometry = new THREE.InstancedBufferGeometry();
  smokeGeometry.index = geometry.index;
  smokeGeometry.attributes = { ...geometry.attributes };
  smokeGeometry.setAttribute('center', centers);
  smokeGeometry.setAttribute('age', ages);
  smokeGeometry.setAttribute('shade', shades);
  smokeGeometry.instanceCount = particles.length;
  const smokeMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec3 center;
      attribute float age;
      attribute float shade;
      varying vec2 puffUv;
      varying float opacity;
      varying float smokeShade;
      void main() {
        puffUv = uv;
        opacity = (1.0 - age) * 0.75;
        smokeShade = shade;
        vec4 viewPosition = viewMatrix * vec4(center, 1.0);
        viewPosition.xy += position.xy * (0.08 + age * 0.6);
        gl_Position = projectionMatrix * viewPosition;
      }`,
    fragmentShader: `
      varying float opacity;
      varying float smokeShade;
      varying vec2 puffUv;
      void main() {
        float r = length(puffUv * 2.0 - 1.0);
        float density = pow(max(0.0, 1.0 - r * r), 2.0);
        gl_FragColor = vec4(vec3(smokeShade), opacity * density);
        #include <colorspace_fragment>
      }`,
  });
  const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
  smoke.visible = false;
  ages.array.fill(1);
  ages.needsUpdate = true;
  smoke.frustumCulled = false;
  smoke.layers.set(1);
  smoke.renderOrder = 9;
  scene.add(smoke);
  const flameMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { strength: { value: 0 } },
    vertexShader: `
      varying vec2 puffUv;
      void main() {
        puffUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float strength;
      varying vec2 puffUv;
      void main() {
        vec2 p = puffUv * 2.0 - 1.0;
        float density = pow(max(0.0, 1.0 - dot(p, p)), 2.0);
        vec3 color = mix(vec3(1.0, 0.16, 0.015), vec3(0.45, 0.65, 1.0), density);
        gl_FragColor = vec4(color * 2.0, density * strength);
        #include <colorspace_fragment>
      }`,
  });
  const flames = outlets.map(() => {
    const mesh = new THREE.Mesh(geometry, flameMaterial);
    mesh.visible = false;
    mesh.layers.set(1);
    scene.add(mesh);
    return mesh;
  });
  let next = 0;
  let emission = 0;
  let flash = 0;
  let flashOutlet = -1;
  let previousOutlet = -1;
  function reset() {
    activity.reset();
    emission = flash = 0;
    flashOutlet = previousOutlet = -1;
    for (const particle of particles) {
      particle.age = 1;
    }
    smoke.visible = false;
    for (const flame of flames) flame.visible = false;
  }
  return {
    reset,
    update(dt: number, engine: Readonly<DrivetrainState>, camera: THREE.Camera) {
      const event = activity.update(dt, engine);
      if (event.backfire) {
        const choices = outlets.length - (previousOutlet < 0 ? 0 : 1);
        flashOutlet = Math.floor(Math.random() * choices);
        if (previousOutlet >= 0 && flashOutlet >= previousOutlet) flashOutlet++;
        previousOutlet = flashOutlet;
      }
      flash = event.backfire || Math.max(0, flash - dt * 12);
      chassis.updateWorldMatrix(true, false);
      for (let i = 0; i < flames.length; i++) {
        const flame = flames[i];
        flame.visible = flash > 0 && flashOutlet === i;
        flame.position.copy(outlets[i]);
        flame.position.z -= 0.08;
        flame.position.applyMatrix4(chassis.matrixWorld);
        flame.quaternion.copy(camera.quaternion);
        flame.scale.set(0.16, 0.24, 1).multiplyScalar(0.6 + flash);
      }
      flameMaterial.uniforms.strength.value = flash;
      emission = event.smoke ? emission + dt * 30 : 0;
      while (emission >= 1) {
        emission--;
        for (const outlet of outlets) {
          const index = next++ % particles.length;
          const particle = particles[index];
          shades.setX(index, Math.random() < 0.8 ? 0.025 : 0.85);
          particle.age = 0;
          origin.copy(outlet).applyMatrix4(chassis.matrixWorld);
          particle.position.copy(origin);
          velocity
            .set((Math.random() - 0.5) * 0.25, 0.015, -0.8)
            .transformDirection(chassis.matrixWorld)
            .multiplyScalar(7 + Math.random() * 4);
          particle.velocity.copy(velocity);
        }
      }
      let active = false;
      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];
        if (particle.age >= 1) continue;
        particle.age = Math.min(1, particle.age + dt / 0.85);
        active ||= particle.age < 1;
        particle.position.addScaledVector(particle.velocity, dt);
        particle.velocity.multiplyScalar(Math.exp(-dt * 2));
        particle.velocity.y += dt * 0.08;
        centers.setXYZ(i, particle.position.x, particle.position.y, particle.position.z);
        ages.setX(i, particle.age);
      }
      if (active || smoke.visible) {
        centers.needsUpdate = ages.needsUpdate = shades.needsUpdate = true;
      }
      smoke.visible = active;
      return { backfire: event.backfire, backfireBody: event.backfireBody };
    },
    dispose() {
      smoke.removeFromParent();
      smokeGeometry.dispose();
      for (const flame of flames) flame.removeFromParent();
      geometry.dispose();
      smokeMaterial.dispose();
      flameMaterial.dispose();
    },
  };
}
