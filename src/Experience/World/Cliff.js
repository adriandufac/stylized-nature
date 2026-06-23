import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import WorldComponent from "./WorldComponent.js";

/**
 * CLIFF — une falaise modélisée sous Blender (.glb), chargée telle quelle.
 *
 * Pas de feuillage ni de raycast terrain : on la positionne manuellement via le GUI
 * (position, rotation Y, échelle). Le modèle est ajouté dans un groupe que l'on
 * transforme directement.
 */
export default class Cliff extends WorldComponent {
  constructor() {
    super();

    // Transform de la falaise, piloté par le GUI.
    this.params = {
      x: -13.6,
      y: 0.4,
      z: -12.3,
      rotationY: 6, // en degrés
      scale: 2.8,
    };

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.load();
  }

  load() {
    const loader = new GLTFLoader();
    loader.load(
      "/models/cliff.glb",
      (gltf) => {
        const root = gltf.scene;
        root.traverse((child) => {
          if (child.isMesh) {
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
  }
}
