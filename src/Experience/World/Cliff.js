import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import WorldComponent from "./WorldComponent.js";
import rockVertexShader from "../../shaders/rock/vertex.glsl";
import rockFragmentShader from "../../shaders/rock/fragment.glsl";

/**
 * CLIFF — une falaise modélisée sous Blender (.glb), chargée telle quelle.
 *
 * Pas de feuillage ni de raycast terrain : on la positionne manuellement via le GUI
 * (position, rotation Y, échelle). Le modèle est ajouté dans un groupe que l'on
 * transforme directement.
 */
export default class Cliff extends WorldComponent {
  constructor(sun) {
    super();
    this.sun = sun;
    // Transform de la falaise, piloté par le GUI.
    // NB : cliff2.glb contient déjà la position/rotation/échelle CUITES à l'export
    // (le cliff y est à -13.6/0.4/-12.3, rot 6°, scale 2.8, avec les rochers placés
    // autour en coordonnées monde). On part donc d'un transform neutre et le GUI
    // sert à nudger l'ensemble par-dessus.
    this.params = {
      x: 0,
      y: 0,
      z: 0,
      rotationY: 0, // en degrés
      scale: 1,
    };

    this.look = {
      lowColor: "#5e505a", // bas sombre violacé
      highColor: "#b09ba2", // haut verdâtre (mousse)
      tintColor: "#4a3d44", // taches
      noiseScale: 0.24,
      tintStrength: 0.5,
      gradientMin: -3.6, // hauteurs MONDE (le glb est cuit à y≈0.4..) -> à régler au GUI
      gradientMax: 6.1,
    };

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.setMaterial(); // crée this.material (+ this.uniforms)
    this.loadNoise(); // charge noiseTexture.png -> this.uniforms.uNoise.value
    this.load();
  }

  setMaterial() {
    this.uniforms = {
      uLowColor: { value: new THREE.Color(this.look.lowColor) },
      uHighColor: { value: new THREE.Color(this.look.highColor) },
      uTintColor: { value: new THREE.Color(this.look.tintColor) },
      uNoiseScale: { value: this.look.noiseScale },
      uTintStrength: { value: this.look.tintStrength },
      uGradientMin: { value: this.look.gradientMin },
      uGradientMax: { value: this.look.gradientMax },
      uNoise: { value: null }, // rempli par loadNoise()
      uSunDirection: { value: this.sun.sunDirection }, // réf partagée
      uAmbientLight: { value: this.sun.ambientIntensity },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: rockVertexShader,
      fragmentShader: rockFragmentShader,
      uniforms: this.uniforms,
      // side par défaut (FrontSide) : les rochers/falaise sont des volumes fermés.
    });
  }

  loadNoise() {
    new THREE.TextureLoader().load("/textures/noiseTexture.png", (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.NoColorSpace; // c'est un bruit, pas une couleur
      this.uniforms.uNoise.value = tex;
    });
  }

  load() {
    const loader = new GLTFLoader();
    loader.load(
      "/models/cliff2.glb",
      (gltf) => {
        const root = gltf.scene;
        root.traverse((child) => {
          if (child.isMesh) {
            child.material?.dispose(); // libère le matériau exporté de Blender
            child.material = this.material;
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.group.add(root);
        this.applyTransform();
        this.setDebug();
      },
      undefined,
      (err) => console.error("Échec du chargement de /models/cliff.glb", err),
    );
  }

  // Applique position / rotation / échelle du GUI au groupe.
  applyTransform() {
    this.group.position.set(this.params.x, this.params.y, this.params.z);
    this.group.rotation.y = THREE.MathUtils.degToRad(this.params.rotationY);
    this.group.scale.setScalar(this.params.scale);
  }

  setDebug() {
    const folder = this.debug.ui.addFolder("Falaise").close();
    const apply = () => this.applyTransform();
    folder
      .add(this.params, "x", -50, 50, 0.1)
      .name("Position X")
      .onChange(apply);
    folder
      .add(this.params, "y", -50, 50, 0.1)
      .name("Position Y")
      .onChange(apply);
    folder
      .add(this.params, "z", -50, 50, 0.1)
      .name("Position Z")
      .onChange(apply);
    folder
      .add(this.params, "rotationY", 0, 360, 1)
      .name("Rotation Y")
      .onChange(apply);
    folder
      .add(this.params, "scale", 0.05, 10, 0.05)
      .name("Échelle")
      .onChange(apply);

    const look = folder.addFolder("Aspect").close();
    look
      .addColor(this.look, "lowColor")
      .name("Couleur bas")
      .onChange((v) => this.uniforms.uLowColor.value.set(v));
    look
      .addColor(this.look, "highColor")
      .name("Couleur haut")
      .onChange((v) => this.uniforms.uHighColor.value.set(v));
    look
      .addColor(this.look, "tintColor")
      .name("Couleur taches")
      .onChange((v) => this.uniforms.uTintColor.value.set(v));
    look
      .add(this.look, "noiseScale", 0.01, 1, 0.01)
      .name("Échelle bruit")
      .onChange((v) => (this.uniforms.uNoiseScale.value = v));
    look
      .add(this.look, "tintStrength", 0, 1, 0.01)
      .name("Force taches")
      .onChange((v) => (this.uniforms.uTintStrength.value = v));
    look
      .add(this.look, "gradientMin", -5, 15, 0.1)
      .name("Dégradé bas (Y)")
      .onChange((v) => (this.uniforms.uGradientMin.value = v));
    look
      .add(this.look, "gradientMax", -5, 15, 0.1)
      .name("Dégradé haut (Y)")
      .onChange((v) => (this.uniforms.uGradientMax.value = v));
  }
}
