import * as THREE from 'three';

const count = 600;
const lifetime = 3.6;

export class TireSmoke {
  private readonly particles = Array.from({ length: count }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    age: lifetime,
    seed: Math.random(),
    depth: 0,
    dust: false,
  }));
  private readonly centers = new Float32Array(count * 3);
  private readonly ages = new Float32Array(count);
  private readonly seeds = new Float32Array(count);
  private readonly dust = new Float32Array(count);
  private readonly lighting = new Float32Array(count * 3);
  private readonly localLights: {
    light: THREE.SpotLight;
    position: THREE.Vector3;
    direction: THREE.Vector3;
  }[] = [];
  private readonly daylight: (THREE.HemisphereLight | THREE.DirectionalLight)[] = [];
  private readonly ambient = new THREE.Color();
  private readonly illumination = new THREE.Color();
  private readonly lightOffset = new THREE.Vector3();
  private readonly particlePosition = new THREE.Vector3();
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly viewPosition = new THREE.Vector3();
  private readonly frustum = new THREE.Frustum();
  private readonly projectionView = new THREE.Matrix4();
  private readonly particleBounds = new THREE.Sphere(new THREE.Vector3(), 3.3);
  private next = 0;
  private readonly emission = [0, 0];
  private readonly material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      viewToCar: { value: new THREE.Matrix4() },
      bodyCenter: { value: new THREE.Vector3(0, 0, 0) },
      bodyHalfSize: { value: new THREE.Vector3(0.78, 0.28, 2) },
      cabinCenter: { value: new THREE.Vector3(0, 0.48, -0.25) },
      cabinHalfSize: { value: new THREE.Vector3(0.65, 0.32, 0.85) },
    },
    vertexShader: `
      attribute vec3 center;
      attribute float age;
      attribute float seed;
      attribute float dust;
      attribute vec3 lighting;
      uniform mat4 viewToCar;
      varying vec3 carPosition;
      varying vec3 illumination;
      varying float dustAmount;
      varying vec2 puffUv;
      varying float opacity;
      varying float viewDepth;
      varying float variation;
      void main() {
        float life = clamp(age / ${lifetime.toFixed(1)}, 0.0, 1.0);
        float radius = mix(0.3, 1.9, life) * mix(0.8, 1.2, seed);
        vec4 viewPosition = modelViewMatrix * vec4(center, 1.0);
        float angle = seed * 6.283 + life * 0.5;
        mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        viewPosition.xy += rotation * position.xy * radius;
        carPosition = (viewToCar * viewPosition).xyz;
        gl_Position = projectionMatrix * viewPosition;
        viewDepth = -viewPosition.z;
        puffUv = uv;
        variation = seed;
        dustAmount = dust;
        illumination = lighting;
        opacity = smoothstep(0.0, 0.05, life) * pow(1.0 - life, 1.2) * mix(0.32, 0.14, dust);
      }
    `,
    fragmentShader: `
      uniform vec3 bodyCenter;
      uniform vec3 bodyHalfSize;
      uniform vec3 cabinCenter;
      uniform vec3 cabinHalfSize;
      varying vec3 carPosition;
      varying vec3 illumination;
      varying vec2 puffUv;
      varying float opacity;
      varying float viewDepth;
      varying float variation;
      varying float dustAmount;
      float boxDistance(vec3 p, vec3 center, vec3 halfSize) {
        vec3 q = abs(p - center) - halfSize;
        return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
      }
      void main() {
        vec2 p = puffUv * 2.0 - 1.0;
        float edge = length(p);
        float billow = 0.9 + 0.1 * sin(p.x * 11.0 + variation * 20.0)
          * sin(p.y * 9.0 - variation * 15.0);
        float density = pow(max(0.0, 1.0 - edge * edge), 2.0) * billow;
        float cameraFade = smoothstep(0.3, 1.2, viewDepth);
        float carDistance = min(boxDistance(carPosition, bodyCenter, bodyHalfSize),
          boxDistance(carPosition, cabinCenter, cabinHalfSize));
        float carFade = smoothstep(0.0, 0.18, carDistance);
        float alpha = density * opacity * cameraFade * carFade;
        if (alpha < 0.001) discard;
        vec3 smokeColor = mix(vec3(0.58, 0.62, 0.65), vec3(0.82), puffUv.y);
        vec3 dustColor = mix(vec3(0.48, 0.32, 0.17), vec3(0.72, 0.57, 0.36), puffUv.y);
        gl_FragColor = vec4(mix(smokeColor, dustColor, dustAmount) * illumination, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

  constructor(
    scene: THREE.Scene,
    private readonly chassis: THREE.Object3D,
  ) {
    scene.traverse((object) => {
      if (object instanceof THREE.SpotLight) {
        this.localLights.push({
          light: object,
          position: new THREE.Vector3(),
          direction: new THREE.Vector3(),
        });
      } else if (
        object instanceof THREE.HemisphereLight ||
        object instanceof THREE.DirectionalLight
      ) {
        this.daylight.push(object);
      }
    });
    const quad = new THREE.PlaneGeometry(2, 2);
    this.geometry.index = quad.index;
    this.geometry.attributes = quad.attributes;
    this.geometry.setAttribute(
      'center',
      new THREE.InstancedBufferAttribute(this.centers, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      'age',
      new THREE.InstancedBufferAttribute(this.ages, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      'seed',
      new THREE.InstancedBufferAttribute(this.seeds, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      'dust',
      new THREE.InstancedBufferAttribute(this.dust, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      'lighting',
      new THREE.InstancedBufferAttribute(this.lighting, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.instanceCount = 0;
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    // Reflector cameras use layer 0. Their depth differs from the main view.
    this.mesh.layers.set(1);
    this.mesh.renderOrder = 10;
  }

  reset() {
    for (const particle of this.particles) particle.age = lifetime;
    this.emission.fill(0);
    this.geometry.instanceCount = 0;
  }

  get active() {
    return this.geometry.instanceCount > 0;
  }

  update(
    dt: number,
    wheels: THREE.Object3D[],
    contacts: boolean[],
    emitting: boolean,
    velocity: THREE.Vector3,
    camera: THREE.Camera,
    asphalt: readonly boolean[],
    groundHeight: (x: number, z: number) => number,
  ) {
    for (const particle of this.particles) {
      if (particle.age >= lifetime) continue;
      particle.age += dt;
      particle.position.addScaledVector(particle.velocity, dt);
      particle.position.y = Math.max(
        particle.position.y,
        groundHeight(particle.position.x, particle.position.z) + 0.12,
      );
      particle.velocity.multiplyScalar(Math.exp(-dt * 1.4));
      particle.velocity.y += dt * (particle.dust ? 0.2 : 0.45);
    }
    for (let i = 0; i < 2; i++) {
      const wheel = i + 2;
      if (!emitting || !contacts[wheel]) {
        this.emission[i] = 0;
        continue;
      }
      this.emission[i] += dt * (asphalt[wheel] ? 60 : 30);
      while (this.emission[i] >= 1) {
        this.emission[i]--;
        const particle = this.particles[this.next++ % count];
        particle.dust = !asphalt[wheel];
        particle.position.copy(wheels[wheel].position);
        particle.position.y = groundHeight(particle.position.x, particle.position.z) + 0.16;
        particle.velocity.set(
          velocity.x * 0.12 + (Math.random() - 0.5) * 0.6,
          (particle.dust ? 0.15 : 0.3) + Math.random() * 0.3,
          velocity.z * 0.12 + (Math.random() - 0.5) * 0.6,
        );
        particle.age = 0;
      }
    }
    camera.updateMatrixWorld();
    for (const particle of this.particles) {
      particle.depth = -this.viewPosition
        .copy(particle.position)
        .applyMatrix4(camera.matrixWorldInverse).z;
    }
    const active = this.particles
      .filter((particle) => particle.age < lifetime)
      .sort((a, b) => b.depth - a.depth);
    active.forEach((particle, i) => {
      particle.position.toArray(this.centers, i * 3);
      this.ages[i] = particle.age;
      this.seeds[i] = particle.seed;
      this.dust[i] = Number(particle.dust);
    });
    this.geometry.instanceCount = active.length;
    this.frustum.setFromProjectionMatrix(
      this.projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    // Include the largest rotated puff, not just its center, at the edge of the view.
    this.mesh.visible = active.some((particle) => {
      this.particleBounds.center.copy(particle.position);
      return this.frustum.intersectsSphere(this.particleBounds);
    });
    for (const name of ['center', 'age', 'seed', 'dust'])
      this.geometry.getAttribute(name).needsUpdate = true;
  }

  updateLighting(scene: THREE.Scene) {
    if (!this.geometry.instanceCount) return;
    this.ambient.setRGB(0, 0, 0);
    for (const light of this.daylight) {
      if (!light.visible) continue;
      const strength =
        (light.intensity *
          (light instanceof THREE.HemisphereLight ? 0.35 : 0.3) *
          scene.environmentIntensity) /
        0.65;
      this.ambient.r += light.color.r * strength;
      this.ambient.g += light.color.g * strength;
      this.ambient.b += light.color.b * strength;
    }
    for (const { light, position, direction } of this.localLights) {
      light.updateWorldMatrix(true, false);
      position.setFromMatrixPosition(light.matrixWorld);
      light.target.updateWorldMatrix(true, false);
      direction.setFromMatrixPosition(light.target.matrixWorld).sub(position).normalize();
    }
    for (let i = 0; i < this.geometry.instanceCount; i++) {
      this.particlePosition.fromArray(this.centers, i * 3);
      this.illumination.copy(this.ambient);
      if (!this.dust[i]) {
        // Keep rubber smoke white under colored daylight without lifting dark puffs.
        const luminance =
          this.ambient.r * 0.2126 + this.ambient.g * 0.7152 + this.ambient.b * 0.0722;
        this.illumination.r = THREE.MathUtils.lerp(luminance, this.ambient.r, 0.2);
        this.illumination.g = THREE.MathUtils.lerp(luminance, this.ambient.g, 0.2);
        this.illumination.b = THREE.MathUtils.lerp(luminance, this.ambient.b, 0.2);
      }
      for (const { light, position, direction } of this.localLights) {
        if (!light.visible || light.intensity <= 0) continue;
        this.lightOffset.copy(this.particlePosition).sub(position);
        const distance = this.lightOffset.length();
        if (light.distance > 0 && distance >= light.distance) continue;
        const angle = this.lightOffset.multiplyScalar(1 / Math.max(distance, 0.001)).dot(direction);
        const cone = THREE.MathUtils.smoothstep(
          angle,
          Math.cos(light.angle),
          Math.cos(light.angle * (1 - light.penumbra)),
        );
        const cutoff =
          light.distance > 0 ? Math.pow(1 - Math.pow(distance / light.distance, 4), 2) : 1;
        let strength =
          (0.08 * light.intensity * cone * cutoff) /
          Math.max(Math.pow(distance, light.decay), 0.01);
        strength = Math.min(strength, 3);
        this.illumination.r += light.color.r * strength;
        this.illumination.g += light.color.g * strength;
        this.illumination.b += light.color.b * strength;
      }
      this.illumination.toArray(this.lighting, i * 3);
    }
    this.geometry.getAttribute('lighting').needsUpdate = true;
  }

  prepareRender(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    if (!this.geometry.instanceCount || !this.mesh.visible) return;
    this.chassis.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    this.material.uniforms.viewToCar.value
      .copy(this.chassis.matrixWorld)
      .invert()
      .multiply(camera.matrixWorld);
    this.updateLighting(scene);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
