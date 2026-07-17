import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import WorldComponent from "./WorldComponent.js";

import waterfallVertexShader from "../../shaders/waterfall/vertex.glsl";
import waterfallFragmentShader from "../../shaders/waterfall/fragment.glsl";

/**
 * CASCADE
 *
 * Composant du World sur le même modèle que Water2.js :
 *   - charge un .glb,
 *   - applique un ShaderMaterial procédural à chaque mesh,
 *   - peut réagir au vent via l'événement 'change'.
 *
 * À compléter : shaders, uniforms de réglage, debug, logique de chute.
 */
export default class Waterfall extends WorldComponent {
  constructor(sun, wind) {
    super();

    this.sizes = this.experience.sizes;
    this.sun = sun; // soleil + ambiance partagés (réf)
    this.wind = wind; // courant piloté par la force du vent

    this.meshes = [];
    this.materials = [];

    // Réglages par mesh (à compléter selon le contenu du .glb)
    this.configs = {
      big_fall: {
        label: "Grande Cascade",
        colorNear: "#8dd0f2",
        colorFar: "#0c72bb",
        foamColor: "#ffffff",
        vignette: 1.0,
        noiseScale: 24.0,
        noiseThreshold: 0.4,
        foamWidth: 0.2,
        waveAmplitude: 0.0,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, 1), // vers le bas (chute)
        flowSpeed: 0.25,
      },
      small_fall: {
        label: "Petite Cascade",
        colorNear: "#8dd0f2",
        colorFar: "#0c72bb",
        foamColor: "#ffffff",
        vignette: 1.0,
        noiseScale: 24.0,
        noiseThreshold: 0.4,
        foamWidth: 0.2,
        waveAmplitude: 0.0,
        waveFrequency: 1.5,
        waveSpeed: 0.8,
        flowDirection: new THREE.Vector2(0, 1), // vers le bas (chute)
        flowSpeed: 0.25,
      },
    };

    this.loadTextures();
    this.load();

    if (this.wind) this.wind.on("change", () => this.applyWind());
  }

  applyWind() {
    // TODO : moduler les uniforms selon this.wind.params.strength (0..1)
  }
  loadTextures() {
    const textureLoader = new THREE.TextureLoader();
    this.perlinTexture = textureLoader.load("/textures/noiseTexture.png");
    this.perlinTexture.wrapS = THREE.RepeatWrapping;
    this.perlinTexture.wrapT = THREE.RepeatWrapping;
  }

  load() {
    const loader = new GLTFLoader();
    loader.load(
      "/models/water2.glb",
      (gltf) => {
        for (const name of Object.keys(this.configs)) {
          const mesh = gltf.scene.getObjectByName(name);
          if (!mesh) {
            console.warn(
              `Waterfall : mesh "${name}" introuvable dans water2.glb`,
            );
            continue;
          }
          mesh.material = this.makeMaterial(this.configs[name]);
          mesh.renderOrder = 1;
          this.meshes.push(mesh);
          this.materials.push(mesh.material);
          this.scene.attach(mesh);
        }

        this.applyWind();
        this.setDebug();
      },
      undefined,
      (err) =>
        console.error("Échec du chargement de /models/waterfall.glb", err),
    );
  }

  makeMaterial(o) {
    const uniforms = {
      uTime: new THREE.Uniform(0),
      uPerlinTexture: new THREE.Uniform(this.perlinTexture),
      uFlowSpeed: new THREE.Uniform(o.flowSpeed),

      // Couleur / écume (mêmes réglages que le lac/rivière)
      uColorNear: { value: new THREE.Color(o.colorNear) },
      uColorFar: { value: new THREE.Color(o.colorFar) },
      uFoamColor: { value: new THREE.Color(o.foamColor) },
      uNoiseThreshold: { value: o.noiseThreshold },

      // Lumière : sunDirection partagé par RÉFÉRENCE (muté par Sun.updateSun)
      uSunDirection: { value: this.sun.sunDirection },
      uSunColor: { value: new THREE.Color("#fff6e0") },
      uAmbient: { value: this.sun.ambientIntensity },
      uNormalStrength: { value: 0.4 },
      uSpecStrength: { value: 0.6 },
      uShininess: { value: 80.0 },
      uFresnelPower: { value: 3.0 },
    };

    return new THREE.ShaderMaterial({
      vertexShader: waterfallVertexShader,
      fragmentShader: waterfallFragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  setDebug() {
    const root = this.debug.ui.addFolder("Cascade").close();
    this.meshes.forEach((mesh, i) => {
      const o = this.configs[mesh.name];
      const u = this.materials[i].uniforms;
      const f = root.addFolder(o.label).close();

      f.add(u.uFlowSpeed, "value", 0, 3, 0.05).name("Vitesse chute");
      f.add(u.uNoiseThreshold, "value", 0, 1, 0.01).name("Seuil bandes");
      f.add(u.uNormalStrength, "value", 0, 2, 0.05).name("Rides (normale)");
      f.add(u.uSpecStrength, "value", 0, 2, 0.05).name("Éclats (force)");
      f.add(u.uShininess, "value", 8, 256, 1).name("Éclats (dureté)");
      f.add(u.uFresnelPower, "value", 0.5, 8, 0.1).name("Fresnel");

      f.addColor({ c: `#${u.uColorNear.value.getHexString()}` }, "c")
        .name("Couleur haut")
        .onChange((v) => u.uColorNear.value.set(v));
      f.addColor({ c: `#${u.uColorFar.value.getHexString()}` }, "c")
        .name("Couleur bas")
        .onChange((v) => u.uColorFar.value.set(v));
      f.addColor({ c: `#${u.uFoamColor.value.getHexString()}` }, "c")
        .name("Couleur écume")
        .onChange((v) => u.uFoamColor.value.set(v));
    });
  }

  update() {
    for (const m of this.materials) m.uniforms.uTime.value = this.time.elapsed;
  }
}
