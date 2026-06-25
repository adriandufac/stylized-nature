import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import WorldComponent from "./WorldComponent.js";
import waterVertexShader from "../../shaders/water/vertex.glsl";
import waterFragmentShader from "../../shaders/water/fragment.glsl";

/**
 * EAU — lac, rivière et cascades (water.glb), chargés tels quels depuis Blender.
 * EAU — lac, rivière, cascade en meshes séparés (water.glb).
 * Chaque mesh reçoit un ShaderMaterial qui dessine un dégradé de profondeur + une écume de berge,
 * en lisant la depth texture produite par Renderer.depthCapture.
 */
export default class Water extends WorldComponent {
  constructor() {
    super();

    this.sizes = this.experience.sizes;
    this.camera = this.experience.camera;
    this.depthTexture = this.experience.renderer.depthCapture.depthTexture;

    this.meshes = []; // remplis après chargement (lus par DepthCapture)
    this.materials = []; // pour animer uTime / régler via GUI

    this.configs = {
      lake: {
        label: "Lac",
        shallowColor: "#5aa6d6",
        deepColor: "#1d5a8a",
        foamColor: "#ffffff",
        deepDistance: 3.55,
        foamDistance: 0.13,
        foamScrollSpeed: 0.05,
        waveAmplitude: 0.01,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, 1),
        flowSpeed: 0.0,
      },
      river: {
        label: "Rivière",
        shallowColor: "#5aa6d6",
        deepColor: "#1d5a8a",
        foamColor: "#ffffff",
        deepDistance: 1.0,
        foamDistance: 0.4,
        foamScrollSpeed: 0.05,
        waveAmplitude: 0.005,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, 1),
        flowSpeed: 0.4,
      },
      big_fall: {
        label: "Grande Cascade",
        shallowColor: "#5aa6d6",
        deepColor: "#1d5a8a",
        foamColor: "#ffffff",
        deepDistance: 0.6,
        foamDistance: 0.8,
        foamScrollSpeed: 0.05,
        waveAmplitude: 0.0,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, -1),
        flowSpeed: 1.2,
      },
      small_fall: {
        label: "Petite Cascade",
        shallowColor: "#5aa6d6",
        deepColor: "#1d5a8a",
        foamColor: "#ffffff",
        deepDistance: 0.6,
        foamDistance: 0.8,
        foamScrollSpeed: 0.05,
        waveAmplitude: 0.0,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, -1),
        flowSpeed: 1.2,
      },
    };

    this.load();
    this.sizes.on("resize", () => this.setResolution());
  }

  load() {
    const loader = new GLTFLoader();
    loader.load(
      "/models/water2.glb",
      (gltf) => {
        for (const name of Object.keys(this.configs)) {
          const mesh = gltf.scene.getObjectByName(name);
          if (!mesh) {
            console.warn(`Water : mesh "${name}" introuvable dans water.glb`);
            continue;
          }
          mesh.material = this.makeMaterial(this.configs[name]);
          mesh.renderOrder = 1; // l'eau se rend après le solide
          this.meshes.push(mesh);
          this.materials.push(mesh.material);
        }
        this.scene.add(gltf.scene);
        this.setResolution();
        this.setDebug();
      },
      undefined,
      (err) => console.error("Échec du chargement de /models/water.glb", err),
    );
  }

  makeMaterial(o) {
    const uniforms = {
      uTime: { value: 0 },
      tDepth: { value: this.depthTexture },
      uCameraNear: { value: this.camera.instance.near },
      uCameraFar: { value: this.camera.instance.far },
      uResolution: { value: new THREE.Vector2() }, // rempli par setResolution()
      uShallowColor: { value: new THREE.Color(o.shallowColor) },
      uDeepColor: { value: new THREE.Color(o.deepColor) },
      uFoamColor: { value: new THREE.Color(o.foamColor) },
      uDeepDistance: { value: o.deepDistance },
      uFoamDistance: { value: o.foamDistance },
      uFoamScrollSpeed: { value: o.foamScrollSpeed },
      uWaveAmplitude: { value: o.waveAmplitude },
      uWaveFrequency: { value: o.waveFrequency },
      uWaveSpeed: { value: o.waveSpeed },
      uFlowDirection: { value: o.flowDirection },
      uFlowSpeed: { value: o.flowSpeed },
    };

    return new THREE.ShaderMaterial({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
    });
  }

  setResolution() {
    const w = this.sizes.width * this.sizes.pixelRatio;
    const h = this.sizes.height * this.sizes.pixelRatio;
    for (const m of this.materials) m.uniforms.uResolution.value.set(w, h);
  }

  setDebug() {
    const root = this.debug.ui.addFolder("Eau").close();
    this.meshes.forEach((mesh, i) => {
      const o = this.configs[mesh.name];
      const u = this.materials[i].uniforms;
      const f = root.addFolder(o.label).close();
      f.add(u.uDeepDistance, "value", 0, 5, 0.05).name("Profondeur");
      f.add(u.uFoamDistance, "value", 0, 2, 0.01).name("Écume (largeur)");
      f.add(u.uWaveAmplitude, "value", 0, 0.3, 0.005).name("Vagues");
      f.add(u.uFlowSpeed, "value", 0, 3, 0.05).name("Courant");
      f.addColor({ c: `#${u.uShallowColor.value.getHexString()}` }, "c")
        .name("Couleur surface")
        .onChange((v) => u.uShallowColor.value.set(v));
      f.addColor({ c: `#${u.uDeepColor.value.getHexString()}` }, "c")
        .name("Couleur fond")
        .onChange((v) => u.uDeepColor.value.set(v));
    });
  }

  update() {
    for (const m of this.materials) m.uniforms.uTime.value = this.time.elapsed;
  }
}
