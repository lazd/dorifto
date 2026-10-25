import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CoursePreviewColors } from './course-preview-3d';

export type PreviewModel = ReturnType<THREE.Object3D['toJSON']>;

/** Renders only when the camera or viewport changes, never in an idle animation loop. */
export class CourseBuilderPreview {
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: true,
  });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100000);
  private readonly controls: OrbitControls;
  private readonly observer: ResizeObserver;
  private readonly model: THREE.Object3D;
  private readonly center: THREE.Vector3;
  private readonly radius: number;
  private frame = 0;

  constructor(
    private readonly container: HTMLElement,
    model: PreviewModel,
    colors: CoursePreviewColors & { background: string },
    label: string,
  ) {
    this.model = new THREE.ObjectLoader().parse(model);
    this.scene.add(this.model);
    this.scene.background = new THREE.Color(colors.background);
    this.scene.add(new THREE.HemisphereLight(colors.light, colors.shade, 1.6));
    this.scene.add(new THREE.AmbientLight(colors.light, 1.2));
    const sun = new THREE.DirectionalLight(colors.light, 1.8);
    sun.position.set(-0.6, 1, 0.35);
    this.scene.add(sun);
    const sphere = new THREE.Box3().setFromObject(this.model).getBoundingSphere(new THREE.Sphere());
    this.center = sphere.center;
    this.radius = Math.max(1, sphere.radius);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.domElement.setAttribute('aria-label', label);
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.tabIndex = 0;
    container.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.minDistance = 2;
    this.controls.maxDistance = this.radius * 10;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.addEventListener('change', this.requestRender);
    this.controls.listenToKeyEvents(this.renderer.domElement);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.resize();
    this.reset();
  }

  private requestRender = () => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const distance = this.camera.position.distanceTo(this.center);
      this.camera.near = Math.max(0.1, distance - this.radius * 1.1);
      this.camera.far = Math.max(this.camera.near + 1, distance + this.radius * 1.1);
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
    });
  };

  private resize = () => {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.requestRender();
  };

  reset() {
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const distance = (this.radius / Math.sin(Math.min(vertical, horizontal))) * 1.1;
    // Game coordinates place east at -X and north at +Z.
    this.camera.position.set(-0.55, 1.1, -1).setLength(distance).add(this.center);
    this.controls.target.copy(this.center);
    this.controls.update();
    this.requestRender();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
