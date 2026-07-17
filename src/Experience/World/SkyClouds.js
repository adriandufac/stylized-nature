import * as THREE from "three";
import CloudField from "./CloudField.js";

/**
 * SKYCLOUDS — nuages de ciel réactifs à la météo.
 *
 * Champ de puffs réparti sur la calotte supérieure d'un dôme (patron des étoiles
 * de Sky), suivant la caméra pour rester "dans le ciel" quand on orbite.
 *
 * La météo pilote trois valeurs lerpées en douceur (~1,5 s, pas de pop) :
 *   - coverage   : combien de puffs sont visibles (uCoverage, via aRank)
 *   - brightness : clair (blanc) -> sombre (uBrightness)
 *   - opacity    : opacité globale (uOpacity)
 *
 * Le mesh est construit une seule fois à maxCount (niveau tempest) : changer la
 * couverture ne recrée jamais l'InstancedMesh -> transition 100 % shader, fluide.
 */
export default class SkyClouds extends CloudField {
  constructor(sun, weather) {
    super(sun);

    // Source de vérité météo : détient la table de presets (tranche `clouds`).
    this.weather = weather;

    this.params = {
      maxCount: 220, // count réel du mesh (toujours construit à ce niveau)
      radius: 70, // distance des puffs (entre l'anneau ~26 et le dôme du ciel 90)
      yMinNorm: 0.15, // élévation normalisée min sur la calotte (évite l'horizon pile)
      yMaxNorm: 1.0, // élévation normalisée max (1.0 = jusqu'au zénith, pas de trou au-dessus)
      sizeMin: 12,
      sizeMax: 20,
      opacity: 0.9, // valeur de départ (sunny) ; pilotée ensuite par la météo
      driftSpeed: 0.01, // rad/s : rotation lente du champ
      transitionSpeed: 4.0, // ~1,5 s pour atteindre la cible
      dayColor: "#f4f1ea",
      nightColor: "#2a3358",
      sunTint: "#ffd9a0",
    };

    // État de transition lerpé chaque frame (patron += (target - current) * k).
    // La cible provient de la tranche `clouds` du preset météo actif.
    this.current = { ...this.weather.preset.clouds };
    this.target = { ...this.weather.preset.clouds };

    // La météo redéfinit la cible ; updateExtra lerpe en douceur (pas de pop).
    this.weather.on("change", () => {
      this.target = { ...this.weather.preset.clouds };
    });

    this.init();
  }

  getCount() {
    return this.params.maxCount;
  }

  // Position sur la calotte supérieure d'un dôme de rayon `radius` (patron Sky.setStars).
  placeInstance(i, dummy) {
    const theta = Math.random() * Math.PI * 2;
    const yNorm =
      this.params.yMinNorm +
      Math.random() * (this.params.yMaxNorm - this.params.yMinNorm);
    const rxz = Math.sqrt(1 - yNorm * yNorm);
    const r = this.params.radius;

    dummy.position.set(
      Math.cos(theta) * rxz * r,
      yNorm * r,
      Math.sin(theta) * rxz * r,
    );
  }

  updateExtra() {
    // Suit la caméra pour rester centré dans le ciel (comme le dôme / les étoiles).
    const camera = this.experience.camera.instance;
    if (this.instancedMesh) {
      this.instancedMesh.position.copy(camera.position);
    }

    // Transition douce vers la météo cible (indépendante du framerate).
    const k = Math.min(1, this.time.delta * this.params.transitionSpeed);
    for (const key of ["coverage", "brightness", "opacity", "sizeScale"]) {
      this.current[key] += (this.target[key] - this.current[key]) * k;
    }
    this.uniforms.uCoverage.value = this.current.coverage;
    this.uniforms.uBrightness.value = this.current.brightness;
    this.uniforms.uOpacity.value = this.current.opacity;
    this.uniforms.uSizeScale.value = this.current.sizeScale;
  }

  setDebug() {
    const folder = this.debug.ui.addFolder("Nuages météo").close();

    folder
      .add(this.params, "transitionSpeed", 0.2, 6, 0.1)
      .name("Vitesse transition");
    folder
      .add(this.params, "driftSpeed", 0, 0.1, 0.001)
      .name("Vitesse de dérive");
    folder
      .add(this.params, "radius", 30, 89, 1)
      .name("Distance")
      .onFinishChange(() => this.build());
    folder
      .add(this.params, "maxCount", 20, 600, 1)
      .name("Nombre max")
      .onFinishChange(() => this.build());
    folder
      .add(this.params, "sizeMin", 1, 30, 0.5)
      .name("Taille min")
      .onFinishChange(() => this.build());
    folder
      .add(this.params, "sizeMax", 1, 40, 0.5)
      .name("Taille max")
      .onFinishChange(() => this.build());

    // Réglage fin par météo (tranche `clouds` de la source de vérité Weather).
    // Si la météo éditée est l'active, on répercute en direct sur la cible lerpée.
    for (const key of ["sunny", "rainy", "tempest"]) {
      const clouds = this.weather.presets[key].clouds;
      const sub = folder.addFolder(key);
      const live = (prop) => () =>
        this.weather.current === key && (this.target[prop] = clouds[prop]);
      sub.add(clouds, "coverage", 0, 1, 0.01).name("Couverture").onChange(live("coverage"));
      sub.add(clouds, "brightness", 0, 1, 0.01).name("Luminosité").onChange(live("brightness"));
      sub.add(clouds, "opacity", 0, 1, 0.01).name("Opacité").onChange(live("opacity"));
      sub.add(clouds, "sizeScale", 0.5, 3, 0.05).name("Taille").onChange(live("sizeScale"));
    }

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
