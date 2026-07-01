import * as THREE from "three";
import WorldComponent from "./WorldComponent.js";
import { LightningStorm } from "../../vendor/LightningStorm.js";

/**
 * LIGHTNING — éclairs de tempête.
 *
 * Enveloppe le LightningStorm officiel de three (vendorisé dans src/vendor/, retiré
 * des addons depuis three r15x). Le storm génère des éclairs ramifiés du ciel vers
 * le sol sur l'emprise du terrain ; on ne l'anime QUE en météo tempest.
 *
 * À chaque impact (callback onLightningDown), un flash plein écran est déclenché :
 * un quad blanc plaqué devant la caméra dont l'opacité pique puis décroît vite.
 */
export default class Lightning extends WorldComponent {
  constructor(weather, terrain) {
    super();
    this.weather = weather;
    this.terrain = terrain;
    this.active = false;

    this.params = {
      color: "#cddcff", // teinte bleu-blanc du trait
      maxLightnings: 2, // éclairs simultanés max
      minPeriod: 10, // s entre deux éclairs (min)
      maxPeriod: 15, // s entre deux éclairs (max)
      minDuration: 0.5, // durée de vie d'un éclair (min)
      maxDuration: 1.1,
      minHeight: 22, // altitude de départ (dans les nuages)
      maxHeight: 42,
      maxSlope: 0.35, // 0 = vertical ; plus haut = éclairs plus inclinés
      flashMaxOpacity: 1, // intensité max du flash plein écran
      flashDuration: 0.6, // s : durée de décroissance du flash
    };

    this.flashLevel = 0; // 0..1, piqué à 1 à l'impact puis décroît

    this.setStorm();
    this.setFlash();
    this.setDebug();

    // Actif uniquement en tempest (posé aussi à l'init via weather.set('sunny')).
    this.weather.on("change", () =>
      this.setActive(this.weather.current === "tempest"),
    );

    // Le flash suit la caméra : recadrer au redimensionnement.
    this.experience.sizes.on("resize", () => this.resizeFlash());
  }

  setStorm() {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.params.color),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // éclat lumineux qui s'ajoute au ciel
    });

    this.storm = new LightningStorm({
      size: this.terrain.params.size, // 32 -> impacts au sol dans ±16 (bornes du terrain)
      minHeight: this.params.minHeight,
      maxHeight: this.params.maxHeight,
      maxSlope: this.params.maxSlope,
      maxLightnings: this.params.maxLightnings,
      lightningMinPeriod: this.params.minPeriod,
      lightningMaxPeriod: this.params.maxPeriod,
      lightningMinDuration: this.params.minDuration,
      lightningMaxDuration: this.params.maxDuration,
      lightningMaterial: material,
      lightningParameters: {
        radius0: 0.4, // rayon à la source
        radius1: 0.08, // rayon à l'extrémité
        minRadius: 0.05,
        maxIterations: 7,
        timeScale: 0.7,
        propagationTimeFactor: 0.05,
        vanishingTimeFactor: 0.95,
        subrays: 3, // ramifications
        ramification: 5,
        recursionProbability: 0.6,
        roughness: 0.85,
        straightness: 0.65,
      },
      onLightningDown: () => this.triggerFlash(),
    });

    this.storm.visible = false;
    this.scene.add(this.storm);
  }

  setFlash() {
    this.flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false, // toujours dessiné, jamais occulté par le décor
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });
    this.flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.flashMaterial);
    this.flashMesh.renderOrder = 999; // au-dessus de tout le 3D (le HUD reste en DOM par-dessus)
    this.flashMesh.frustumCulled = false;

    // Enfant de la caméra -> couvre toujours le champ de vision (caméra dans la scène).
    this.experience.camera.instance.add(this.flashMesh);
    this.resizeFlash();
  }

  // Dimensionne/positionne le quad pour remplir le champ de vision, juste devant la caméra.
  resizeFlash() {
    const camera = this.experience.camera.instance;
    const dist = camera.near + 0.05;
    const height = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const width = height * camera.aspect;
    this.flashMesh.scale.set(width * 1.1, height * 1.1, 1); // marge pour couvrir les bords
    this.flashMesh.position.set(0, 0, -dist);
  }

  triggerFlash() {
    this.flashLevel = 1;
  }

  setActive(active) {
    this.active = active;
    this.storm.visible = active;
    if (!active) {
      this.flashLevel = 0;
      this.flashMaterial.opacity = 0;
    }
  }

  setDebug() {
    const folder = this.debug.ui.addFolder("Éclairs").close();
    folder.add(this.params, "minPeriod", 0.3, 10, 0.1).name("Période min (s)");
    folder.add(this.params, "maxPeriod", 0.3, 15, 0.1).name("Période max (s)");
    folder.add(this.params, "maxSlope", 0, 1.5, 0.05).name("Inclinaison");
    folder.add(this.params, "flashMaxOpacity", 0, 1, 0.01).name("Intensité flash");
    folder.add(this.params, "flashDuration", 0.05, 0.6, 0.01).name("Durée flash (s)");
    // Rejoue les paramètres de cadence sur le storm (les autres relancent le build via météo).
    const sync = () => {
      this.storm.stormParams.lightningMinPeriod = this.params.minPeriod;
      this.storm.stormParams.lightningMaxPeriod = this.params.maxPeriod;
      this.storm.stormParams.maxSlope = this.params.maxSlope;
    };
    folder.onChange(sync);
  }

  update() {
    // Flash : décroissance rapide vers 0 (indépendante du framerate).
    if (this.flashLevel > 0) {
      this.flashLevel = Math.max(
        0,
        this.flashLevel - this.time.delta / this.params.flashDuration,
      );
      this.flashMaterial.opacity = this.flashLevel * this.params.flashMaxOpacity;
    }

    // Éclairs uniquement en tempest. time.elapsed est monotone (requis par le storm).
    if (this.active) this.storm.update(this.time.elapsed);
  }
}
