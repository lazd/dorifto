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
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly depthTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  private readonly depthMaterial = new THREE.MeshDepthMaterial();
  private readonly size = new THREE.Vector2();
  private readonly viewPosition = new THREE.Vector3();
  private next = 0;
  private readonly emission = [0, 0];
  private readonly material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      sceneDepth: { value: this.depthTarget.depthTexture },
      resolution: { value: this.size },
      nearPlane: { value: 0.1 },
      farPlane: { value: 1500 },
    },
    vertexShader: `
      attribute vec3 center;
      attribute float age;
      attribute float seed;
      attribute float dust;
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
        gl_Position = projectionMatrix * viewPosition;
        viewDepth = -viewPosition.z;
        puffUv = uv;
        variation = seed;
        dustAmount = dust;
        opacity = smoothstep(0.0, 0.05, life) * pow(1.0 - life, 1.2) * mix(0.32, 0.28, dust);
      }
    `,
    fragmentShader: `
      #include <packing>
      uniform sampler2D sceneDepth;
      uniform vec2 resolution;
      uniform float nearPlane;
      uniform float farPlane;
      varying vec2 puffUv;
      varying float opacity;
      varying float viewDepth;
      varying float variation;
      varying float dustAmount;
      void main() {
        vec2 p = puffUv * 2.0 - 1.0;
        float edge = length(p);
        float billow = 0.9 + 0.1 * sin(p.x * 11.0 + variation * 20.0)
          * sin(p.y * 9.0 - variation * 15.0);
        float density = pow(max(0.0, 1.0 - edge * edge), 2.0) * billow;
        float depth = texture2D(sceneDepth, gl_FragCoord.xy / resolution).x;
        float solidDepth = -perspectiveDepthToViewZ(depth, nearPlane, farPlane);
        float intersectionFade = smoothstep(0.0, 0.55, solidDepth - viewDepth);
        float cameraFade = smoothstep(0.3, 1.2, viewDepth);
        float alpha = density * opacity * intersectionFade * cameraFade;
        if (alpha < 0.001) discard;
        vec3 smokeColor = mix(vec3(0.58, 0.62, 0.65), vec3(0.82), puffUv.y);
        vec3 dustColor = mix(vec3(0.48, 0.32, 0.17), vec3(0.72, 0.57, 0.36), puffUv.y);
        gl_FragColor = vec4(mix(smokeColor, dustColor, dustAmount), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

  constructor() {
    const quad = new THREE.PlaneGeometry(2, 2);
    this.geometry.index = quad.index;
    this.geometry.attributes = quad.attributes;
    this.geometry.setAttribute('center', new THREE.InstancedBufferAttribute(this.centers, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('age', new THREE.InstancedBufferAttribute(this.ages, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(this.seeds, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('dust', new THREE.InstancedBufferAttribute(this.dust, 1).setUsage(THREE.DynamicDrawUsage));
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

  update(
    dt: number, wheels: THREE.Group[], contacts: boolean[], emitting: boolean,
    velocity: THREE.Vector3, camera: THREE.Camera, asphalt: readonly boolean[],
  ) {
    for (const particle of this.particles) {
      if (particle.age >= lifetime) continue;
      particle.age += dt;
      particle.position.addScaledVector(particle.velocity, dt);
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
        particle.position.y = 0.16;
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
      particle.depth = -this.viewPosition.copy(particle.position).applyMatrix4(camera.matrixWorldInverse).z;
    }
    const active = this.particles.filter((particle) => particle.age < lifetime)
      .sort((a, b) => b.depth - a.depth);
    active.forEach((particle, i) => {
      particle.position.toArray(this.centers, i * 3);
      this.ages[i] = particle.age;
      this.seeds[i] = particle.seed;
      this.dust[i] = Number(particle.dust);
    });
    this.geometry.instanceCount = active.length;
    for (const name of ['center', 'age', 'seed', 'dust']) this.geometry.getAttribute(name).needsUpdate = true;
  }

  captureDepth(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    if (!this.geometry.instanceCount) return;
    renderer.getDrawingBufferSize(this.size);
    if (this.depthTarget.width !== this.size.x || this.depthTarget.height !== this.size.y) {
      this.depthTarget.setSize(this.size.x, this.size.y);
    }
    this.material.uniforms.nearPlane.value = camera.near;
    this.material.uniforms.farPlane.value = camera.far;
    const hidden: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (!object.visible || !(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (object.type === 'Reflector' || materials.some((material) => material.transparent)) {
        hidden.push(object);
        object.visible = false;
      }
    });
    const target = renderer.getRenderTarget();
    const override = scene.overrideMaterial;
    const background = scene.background;
    const shadows = renderer.shadowMap.enabled;
    try {
      scene.overrideMaterial = this.depthMaterial;
      scene.background = null;
      renderer.shadowMap.enabled = false;
      renderer.setRenderTarget(this.depthTarget);
      renderer.clear();
      renderer.render(scene, camera);
    } finally {
      renderer.setRenderTarget(target);
      renderer.shadowMap.enabled = shadows;
      scene.overrideMaterial = override;
      scene.background = background;
      hidden.forEach((object) => { object.visible = true; });
    }
  }
}
