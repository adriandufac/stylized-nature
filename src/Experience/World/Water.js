import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import WorldComponent from "./WorldComponent.js";

/**
 * EAU — lac, rivière et cascades (water.glb), chargés tels quels depuis Blender.
 *
 * Version simple : on remplace le matériau de chaque mesh par un matériau d'eau
 * stylisé (transparent, légèrement réfléchissant). Le shader de profondeur/écume
 * du PLAN-water.md viendra plus tard ; ici on veut juste voir l'eau en place.
 */
export default class Water extends WorldComponent {
  constructor() {
    super();

    this.params = {
      color: "#3d9bd6",
      opacity: 0.8,
      roughness: 0.15,
      metalness: 0.0,
    };

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.material = new THREE.MeshStandardMaterial({
      color: this.params.color,
      transparent: true,
      opacity: this.params.opacity,
      roughness: this.params.roughness,
      metalness: this.params.metalness,
      side: THREE.DoubleSide, // les cascades sont visibles des deux côtés
    });

    this.load();
  }

  load() {
    const loader = new GLTFLoader();
    loader.load(
      "/models/water.glb",
      (gltf) => {
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            child.material = this.material;
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });
        this.group.add(gltf.scene);
        this.setDebug();
      },
      undefined,
      (err) => console.error("Échec du chargement de /models/water.glb", err),
    );
  }

  setDebug() {
    const folder = this.debug.ui.addFolder("Eau").close();
    folder
      .addColor(this.params, "color")
      .name("Couleur")
      .onChange((v) => this.material.color.set(v));
    folder
      .add(this.params, "opacity", 0, 1, 0.01)
      .name("Opacité")
      .onChange((v) => (this.material.opacity = v));
    folder
      .add(this.params, "roughness", 0, 1, 0.01)
      .name("Rugosité")
      .onChange((v) => (this.material.roughness = v));
    folder
      .add(this.params, "metalness", 0, 1, 0.01)
      .name("Métal")
      .onChange((v) => (this.material.metalness = v));
  }
}
