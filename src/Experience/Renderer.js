import * as THREE from "three";
import Experience from "./Experience.js";
import DepthCapture from "./Utils/DepthCapture.js";

export default class Renderer {
  constructor() {
    this.experience = new Experience();
    this.sizes = this.experience.sizes;
    this.scene = this.experience.scene;
    this.canvas = this.experience.canvas;
    this.camera = this.experience.camera;

    this.setInstance();

    // Capture de profondeur pour l'eau (lue par le fragment shader de Water)
    this.depthCapture = new DepthCapture(
      this.instance,
      this.camera.instance,
      this.scene,
    );
  }

  setInstance() {
    this.instance = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.instance.setSize(this.sizes.width, this.sizes.height);
    this.instance.setPixelRatio(this.sizes.pixelRatio);
  }

  resize() {
    this.instance.setSize(this.sizes.width, this.sizes.height);
    this.instance.setPixelRatio(this.sizes.pixelRatio);
    this.depthCapture.setSize(
      this.sizes.width,
      this.sizes.height,
      this.sizes.pixelRatio,
    );
  }

  update() {
    const water = this.experience.world?.water;
    // Water2 (méthode tuto) n'utilise pas la depth texture -> on saute la passe.
    if (water && water.meshes.length && water.usesDepth !== false) {
      this.depthCapture.capture(water.meshes);
    }
    this.instance.render(this.scene, this.camera.instance);
  }
}
