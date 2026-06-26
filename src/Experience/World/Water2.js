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
  constructor(environment, wind) {
    super();

    this.sizes = this.experience.sizes;
    this.environment = environment; // soleil + ambiance partagés (réf), comme l'herbe/buissons
    this.wind = wind; // courant du lac/rivière piloté par la force du vent
    this.usesDepth = false; // lu par Renderer.update() pour zapper DepthCapture

    // Plans d'eau "windScaled" : courant ET houle interpolés selon wind.params.strength (0..1)
    this.flowNoWind = 0.1; // pas de vent
    this.flowMaxWind = 0.8; // vent maxi
    this.waveNoWind = 0.005; // pas de vent
    this.waveMaxWind = 0.025; // vent maxi

    this.meshes = [];
    this.materials = [];

    this.configs = {
      lake: {
        label: "Lac",
        colorNear: "#5aa6d6",
        colorFar: "#1d5a8a",
        foamColor: "#ffffff",
        vignette: 1.5,
        noiseScale: 10.0,
        noiseThreshold: 0.45,
        foamWidth: 0.16,
        waveAmplitude: 0.004,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(-0.1736, -0.9848), // -100° : vers la petite cascade
        flowSpeed: 0.1, // initial ; recalculé selon le vent (windScaled)
        windScaled: true,
      },
      river: {
        label: "Rivière",
        colorNear: "#5aa6d6",
        colorFar: "#1d5a8a",
        foamColor: "#ffffff",
        vignette: 1.5,
        noiseScale: 10.0,
        noiseThreshold: 0.5,
        foamWidth: 0.28,
        waveAmplitude: 0.005,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, 1),
        flowSpeed: 0.1, // initial ; recalculé selon le vent (windScaled)
        windScaled: true,
      },
/*       big_fall: {
        label: "Grande Cascade",
        colorNear: "#7fbfe0",
        colorFar: "#3a7faf",
        foamColor: "#ffffff",
        vignette: 1.0,
        noiseScale: 24.0,
        noiseThreshold: 0.4,
        foamWidth: 0.2,
        waveAmplitude: 0.0,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, 1), // vers le bas (chute)
        flowSpeed: 1.4,
      },
      small_fall: {
        label: "Petite Cascade",
        colorNear: "#7fbfe0",
        colorFar: "#3a7faf",
        foamColor: "#ffffff",
        vignette: 1.0,
        noiseScale: 24.0,
        noiseThreshold: 0.4,
        foamWidth: 0.2,
        waveAmplitude: 0.0,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, 1), // vers le bas (chute)
        flowSpeed: 1.4,
      }, */
    };

    this.load();

    // Le vent prévient via 'change' (même mécanisme que l'herbe) : on resync le courant.
    if (this.wind) this.wind.on("change", () => this.applyWind());
  }

  // Plans d'eau windScaled : courant et houle = lerp(min, max, force du vent).
  applyWind() {
    const s = this.wind ? this.wind.params.strength : 0; // 0..1
    const flow = this.flowNoWind + (this.flowMaxWind - this.flowNoWind) * s;
    const wave = this.waveNoWind + (this.waveMaxWind - this.waveNoWind) * s;
    this.meshes.forEach((mesh, i) => {
      if (this.configs[mesh.name].windScaled) {
        this.materials[i].uniforms.uFlowSpeed.value = flow;
        this.materials[i].uniforms.uWaveAmplitude.value = wave;
      }
    });
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
          this.scene.attach(mesh);
        }
       /*  this.scene.add(gltf.scene); */
        this.applyWind(); // courant initial selon la force de vent courante
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
      uFoamWidth: { value: o.foamWidth },
      uWaveAmplitude: { value: o.waveAmplitude },
      uWaveFrequency: { value: o.waveFrequency },
      uWaveSpeed: { value: o.waveSpeed },
      uFlowDirection: { value: o.flowDirection },
      uFlowSpeed: { value: o.flowSpeed },
      // Lumière : sunDirection est partagé par RÉFÉRENCE (muté en place par Environment.updateSun)
      uSunDirection: { value: this.environment.sunDirection },
      uSunColor: { value: new THREE.Color("#fff6e0") },
      uAmbient: { value: this.environment.ambientIntensity },
      uNormalStrength: { value: 0.4 },
      uSpecStrength: { value: 0.6 },
      uShininess: { value: 80.0 },
      uFresnelPower: { value: 3.0 },
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
      f.add(u.uFoamWidth, "value", 0, 0.5, 0.005).name("Écume berge");
      // Lac/rivière : courant ET houle pilotés par le vent (pas de réglage manuel).
      if (!o.windScaled) {
        f.add(u.uWaveAmplitude, "value", 0, 0.3, 0.005).name("Houle");
        f.add(u.uFlowSpeed, "value", 0, 3, 0.05).name("Courant");
      }
      f.add(u.uNormalStrength, "value", 0, 2, 0.05).name("Rides (normale)");
      f.add(u.uSpecStrength, "value", 0, 2, 0.05).name("Éclats (force)");
      f.add(u.uShininess, "value", 8, 256, 1).name("Éclats (dureté)");
      f.add(u.uFresnelPower, "value", 0.5, 8, 0.1).name("Fresnel");
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
