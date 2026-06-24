import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import Experience from "./Experience.js";

/**
 * EXPORTER — exporte une sélection d'objets de la scène en .glb (binaire).
 *
 * Outil annexe (pas un objet du monde) : sert à récupérer une référence
 * (terrain + falaise) pour la retravailler sous Blender. On lui passe la liste
 * d'objets à inclure, ce qui évite de coupler l'export aux composants du World.
 */
export default class Exporter {
  constructor(objects = []) {
    this.experience = new Experience();
    this.debug = this.experience.debug;

    this.objects = objects; // Object3D[] à inclure dans le .glb
    this.setDebug();
  }

  export(filename = "scene-ref.glb") {
    new GLTFExporter().parse(
      this.objects,
      (result) => {
        const blob = new Blob([result], { type: "model/gltf-binary" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      },
      (err) => console.error("Export échoué", err),
      { binary: true }, // .glb
    );
  }

  setDebug() {
    const folder = this.debug.ui.addFolder("Export");
    folder
      .add({ export: () => this.export() }, "export")
      .name("⬇️  Exporter terrain + falaise (.glb)");
  }
}
