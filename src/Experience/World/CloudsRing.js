import CloudField from "./CloudField.js";

/**
 * CLOUDSRING — anneau de nuages stylisés posé autour du terrain.
 *
 * Le terrain est un plan rectangulaire (32×32, bords à ±16) dont la jupe plate
 * est coupée net contre le ciel. On masque cette découpe avec une bande de puffs
 * billboardés (InstancedMesh) répartis en anneau juste au-delà des bords, descendant
 * un peu sous le sol pour occulter la coupure -> effet "île flottante / mer de nuages".
 *
 * N'a rien à voir avec la météo : uCoverage/uBrightness restent à 1 (hérités de
 * CloudField), donc tous les puffs sont toujours visibles et blancs.
 */
export default class CloudsRing extends CloudField {
  constructor(environment) {
    super(environment);

    this.params = {
      count: 120,
      radiusInner: 16, // juste au-delà des bords du terrain (±16)
      radiusOuter: 25,
      yMin: -3, // descend sous la jupe du terrain pour l'occulter
      yMax: 2, // remonte un peu en bouffées
      sizeMin: 8.5,
      sizeMax: 16,
      opacity: 0.95,
      driftSpeed: 0.02, // rad/s : rotation lente de l'anneau
      dayColor: "#f4f1ea", // blanc cassé chaud
      nightColor: "#2a3358", // bleu sombre
      sunTint: "#ffd9a0", // pointe chaude au lever/coucher
    };

    this.init();
  }

  getCount() {
    return this.params.count;
  }

  // Position en anneau autour du centre du terrain (origine).
  placeInstance(i, dummy) {
    const angle = Math.random() * Math.PI * 2;
    const radius =
      this.params.radiusInner +
      Math.random() * (this.params.radiusOuter - this.params.radiusInner);
    const y =
      this.params.yMin + Math.random() * (this.params.yMax - this.params.yMin);

    dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  }

  setDebug() {
    const folder = this.debug.ui.addFolder("Nuages").close();

    folder
      .add(this.params, "count", 0, 600, 1)
      .name("Nombre")
      .onFinishChange(() => this.build());
    folder
      .add(this.params, "radiusInner", 10, 40, 0.5)
      .name("Rayon intérieur")
      .onFinishChange(() => this.build());
    folder
      .add(this.params, "radiusOuter", 10, 60, 0.5)
      .name("Rayon extérieur")
      .onFinishChange(() => this.build());
    folder
      .add(this.params, "yMin", -10, 5, 0.1)
      .name("Hauteur min")
      .onFinishChange(() => this.build());
    folder
      .add(this.params, "yMax", -5, 15, 0.1)
      .name("Hauteur max")
      .onFinishChange(() => this.build());
    folder
      .add(this.params, "sizeMin", 1, 20, 0.5)
      .name("Taille min")
      .onFinishChange(() => this.build());
    folder
      .add(this.params, "sizeMax", 1, 30, 0.5)
      .name("Taille max")
      .onFinishChange(() => this.build());

    folder
      .add(this.params, "opacity", 0, 1, 0.01)
      .name("Opacité")
      .onChange((v) => (this.uniforms.uOpacity.value = v));
    folder
      .add(this.params, "driftSpeed", 0, 0.2, 0.001)
      .name("Vitesse de dérive");

    folder
      .addColor(this.params, "dayColor")
      .name("Couleur jour")
      .onChange((v) => this.uniforms.uDayColor.value.set(v));
    folder
      .addColor(this.params, "nightColor")
      .name("Couleur nuit")
      .onChange((v) => this.uniforms.uNightColor.value.set(v));
    folder
      .addColor(this.params, "sunTint")
      .name("Teinte soleil")
      .onChange((v) => this.uniforms.uSunTint.value.set(v));
  }
}
