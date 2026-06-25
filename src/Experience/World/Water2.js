import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import WorldComponent from "./WorldComponent.js";
import waterVertexShader from "../../shaders/water/vert2.glsl";
import waterFragmentShader from "../../shaders/water/fragment2.glsl";

/**
 * EAU « façon tuto Codrops » (variante de Water.js).
 *
 * Contrairement à Water.js, cette version NE LIT PAS de depth texture :
 * elle reproduit la méthode du tutoriel Tympanus/Codrops, qui abandonne la
 * capture de profondeur (trop coûteuse) au profit :
 *   - d'un dégradé de couleur par VIGNETTE (centre vs bords du mesh),
 *   - d'un motif de surface en bruit de Perlin qui défile,
 *   - d'une écume "illusion" (crêtes de bruit + liseré aux berges via les UV).
 *
 * usesDepth = false : indique au Renderer de NE PAS faire la passe DepthCapture.
 */
export default class Water2 extends WorldComponent {
  constructor() {
    super();

    this.sizes = this.experience.sizes;
    this.usesDepth = false; // lu par Renderer.update() pour zapper DepthCapture

    this.meshes = [];
    this.materials = [];

    this.configs = {
      lake: {
        label: "Lac",
        colorNear: "#5aa6d6",
        colorFar: "#1d5a8a",
        foamColor: "#ffffff",
        vignette: 1.5,
        noiseScale: 12.0,
        noiseThreshold: 0.45,
        noiseSpeed: 0.05,
        foamWidth: 0.06,
        waveAmplitude: 0.03,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, 1),
        flowSpeed: 0.0,
      },
      river: {
        label: "Rivière",
        colorNear: "#5aa6d6",
        colorFar: "#1d5a8a",
        foamColor: "#ffffff",
        vignette: 1.2,
        noiseScale: 18.0,
        noiseThreshold: 0.5,
        noiseSpeed: 0.08,
        foamWidth: 0.12,
        waveAmplitude: 0.015,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, 1),
        flowSpeed: 0.4,
      },
      big_fall: {
        label: "Grande Cascade",
        colorNear: "#7fbfe0",
        colorFar: "#3a7faf",
        foamColor: "#ffffff",
        vignette: 1.0,
        noiseScale: 24.0,
        noiseThreshold: 0.4,
        noiseSpeed: 0.2,
        foamWidth: 0.2,
        waveAmplitude: 0.0,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, -1),
        flowSpeed: 1.2,
      },
      small_fall: {
        label: "Petite Cascade",
        colorNear: "#7fbfe0",
        colorFar: "#3a7faf",
        foamColor: "#ffffff",
        vignette: 1.0,
        noiseScale: 24.0,
        noiseThreshold: 0.4,
        noiseSpeed: 0.2,
        foamWidth: 0.2,
        waveAmplitude: 0.0,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, -1),
        flowSpeed: 1.2,
      },
    };

    this.load();
  }

  load() {
    const loader = new GLTFLoader();
    loader.load(
      "/models/water2.glb",
      (gltf) => {
        for (const name of Object.keys(this.configs)) {
          const mesh = gltf.scene.getObjectByName(name);
          if (!mesh) {
            console.warn(`Water2 : mesh "${name}" introuvable dans water2.glb`);
            continue;
          }
          mesh.material = this.makeMaterial(this.configs[name]);
          mesh.renderOrder = 1; // l'eau se rend après le solide
          this.meshes.push(mesh);
          this.materials.push(mesh.material);
        }
        this.scene.add(gltf.scene);
        this.setDebug();
      },
      undefined,
      (err) => console.error("Échec du chargement de /models/water2.glb", err),
    );
  }

  makeMaterial(o) {
    const uniforms = {
      uTime: { value: 0 },
      uColorNear: { value: new THREE.Color(o.colorNear) },
      uColorFar: { value: new THREE.Color(o.colorFar) },
      uFoamColor: { value: new THREE.Color(o.foamColor) },
      uVignette: { value: o.vignette },
      uNoiseScale: { value: o.noiseScale },
      uNoiseThreshold: { value: o.noiseThreshold },
      uNoiseSpeed: { value: o.noiseSpeed },
      uFoamWidth: { value: o.foamWidth },
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

  setDebug() {
    const root = this.debug.ui.addFolder("Eau (tuto)").close();
    this.meshes.forEach((mesh, i) => {
      const o = this.configs[mesh.name];
      const u = this.materials[i].uniforms;
      const f = root.addFolder(o.label).close();
      f.add(u.uVignette, "value", 0, 3, 0.05).name("Vignette");
      f.add(u.uNoiseScale, "value", 1, 40, 0.5).name("Densité motif");
      f.add(u.uNoiseThreshold, "value", 0, 1, 0.01).name("Seuil bandes");
      f.add(u.uNoiseSpeed, "value", 0, 0.5, 0.01).name("Vitesse motif");
      f.add(u.uFoamWidth, "value", 0, 0.5, 0.005).name("Écume berge");
      f.add(u.uWaveAmplitude, "value", 0, 0.3, 0.005).name("Houle");
      f.add(u.uFlowSpeed, "value", 0, 3, 0.05).name("Courant");
      f.addColor({ c: `#${u.uColorNear.value.getHexString()}` }, "c")
        .name("Couleur berge")
        .onChange((v) => u.uColorNear.value.set(v));
      f.addColor({ c: `#${u.uColorFar.value.getHexString()}` }, "c")
        .name("Couleur centre")
        .onChange((v) => u.uColorFar.value.set(v));
    });
  }

  update() {
    for (const m of this.materials) m.uniforms.uTime.value = this.time.elapsed;
  }
}
