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
  constructor(environment, wind) {
    super();

    this.sizes = this.experience.sizes;
    this.environment = environment; // soleil + ambiance partagés (réf)
    this.wind = wind; // courant piloté par la force du vent

    this.meshes = [];
    this.materials = [];
    

    // Réglages par mesh (à compléter selon le contenu du .glb)
    this.configs = {
           big_fall: {
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
    this.perlinTexture = textureLoader.load('./perlin.png');
  }

  load() {
  
    const loader = new GLTFLoader();
    loader.load(
      "/models/water2.glb",
      (gltf) => {
        for (const name of Object.keys(this.configs)) {
          const mesh = gltf.scene.getObjectByName(name);
          if (!mesh) {
            console.warn(`Waterfall : mesh "${name}" introuvable dans water2.glb`);
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
      (err) => console.error("Échec du chargement de /models/waterfall.glb", err),
    );
  }

  makeMaterial(o) {
    const uniforms = {
      uTime: { value: 0 },
      // Lumière : sunDirection partagé par RÉFÉRENCE (muté par Environment.updateSun)
      uSunDirection: { value: this.environment.sunDirection },
      uAmbient: { value: this.environment.ambientIntensity },
      side: THREE.DoubleSide,
      uPerlinTexture: new THREE.Uniform(this.perlinTexture)
      // TODO : ajouter les uniforms propres à la cascade
    };

    return new THREE.ShaderMaterial({
       vertexShader: waterfallVertexShader,
       fragmentShader: waterfallFragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
    });
  }

  setDebug() {
    if (!this.debug.active) return;
    const root = this.debug.ui.addFolder("Cascade").close();
    // TODO : exposer les réglages par mesh
  }

  update() {
    for (const m of this.materials) m.uniforms.uTime.value = this.time.elapsed;
  }
}
