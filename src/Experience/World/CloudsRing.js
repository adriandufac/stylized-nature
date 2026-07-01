import * as THREE from "three";
import WorldComponent from "./WorldComponent.js";
import cloudsVertexShader from "../../shaders/clouds/vertex.glsl";
import cloudsFragmentShader from "../../shaders/clouds/fragment.glsl";

/**
 * CLOUDS — anneau de nuages stylisés posé autour du terrain.
 *
 * Le terrain est un plan rectangulaire (32×32, bords à ±16) dont la jupe plate
 * est coupée net contre le ciel. On masque cette découpe avec une bande de puffs
 * billboardés (InstancedMesh) répartis en anneau juste au-delà des bords, descendant
 * un peu sous le sol pour occulter la coupure -> effet "île flottante / mer de nuages".
 *
 * Composant autonome : n'altère aucun shader existant. Teinté selon l'heure via
 * environment.sunDirection (même logique smoothstep que Sky).
 */
export default class Clouds extends WorldComponent {
  constructor(environment) {
    super();
    this.environment = environment;

    this.params = {
      count: 120,
      radiusInner: 17, // juste au-delà des bords du terrain (±16)
      radiusOuter: 26,
      yMin: -3, // descend sous la jupe du terrain pour l'occulter
      yMax: 2, // remonte un peu en bouffées
      sizeMin: 4,
      sizeMax: 10,
      opacity: 0.95,
      driftSpeed: 0.02, // rad/s : rotation lente de l'anneau
      dayColor: "#f4f1ea", // blanc cassé chaud
      nightColor: "#2a3358", // bleu sombre
      sunTint: "#ffd9a0", // pointe chaude au lever/coucher
    };

    // Objet "fantôme" pour composer la matrice de chaque instance (patron Grass).
    this.dummy = new THREE.Object3D();
    this.instancedMesh = null;

    this.buildGeometry();
    this.setMaterial();
    this.build();
    this.setDebug();
  }

  buildGeometry() {
    // Quad unitaire : le billboard et l'échelle se font dans le vertex shader via aScale.
    this.geometry = new THREE.PlaneGeometry(1, 1);
  }

  setMaterial() {
    this.uniforms = {
      uTime: { value: 0 },
      uSunDirection: { value: this.environment.sunDirection }, // réf partagée (mutée en place)
      uDayFactor: { value: 1 },
      uDayColor: { value: new THREE.Color(this.params.dayColor) },
      uNightColor: { value: new THREE.Color(this.params.nightColor) },
      uSunTint: { value: new THREE.Color(this.params.sunTint) },
      uOpacity: { value: this.params.opacity },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: cloudsVertexShader,
      fragmentShader: cloudsFragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false, // quads transparents qui se chevauchent : pas d'écriture de profondeur
      depthTest: true,
    });
  }

  // (Re)construit l'InstancedMesh des puffs répartis en anneau.
  // L'InstancedMesh ayant un count figé, on en recrée un à chaque changement.
  build() {
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
    }

    const count = this.params.count;
    this.instancedMesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      count,
    );

    const scales = new Float32Array(count);
    const phases = new Float32Array(count);
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Position en anneau autour du centre du terrain (origine).
      const angle = Math.random() * Math.PI * 2;
      const radius =
        this.params.radiusInner +
        Math.random() * (this.params.radiusOuter - this.params.radiusInner);
      const y = this.params.yMin + Math.random() * (this.params.yMax - this.params.yMin);

      this.dummy.position.set(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius,
      );
      this.dummy.rotation.set(0, 0, 0); // billboard géré dans le shader
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

      scales[i] =
        this.params.sizeMin +
        Math.random() * (this.params.sizeMax - this.params.sizeMin);
      phases[i] = Math.random() * Math.PI * 2;
      seeds[i] = Math.random();
    }

    this.geometry.setAttribute(
      "aScale",
      new THREE.InstancedBufferAttribute(scales, 1),
    );
    this.geometry.setAttribute(
      "aPhase",
      new THREE.InstancedBufferAttribute(phases, 1),
    );
    this.geometry.setAttribute(
      "aSeed",
      new THREE.InstancedBufferAttribute(seeds, 1),
    );

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    // Le décalage billboard sort des bornes d'instance -> évite un clipping disgracieux.
    this.instancedMesh.frustumCulled = false;
    this.scene.add(this.instancedMesh);
  }

  update() {
    this.uniforms.uTime.value = this.time.elapsed;

    // 0 la nuit -> 1 le jour (même seuil que Sky pour le soleil sous l'horizon).
    this.uniforms.uDayFactor.value = THREE.MathUtils.smoothstep(
      this.environment.sunDirection.y,
      -0.15,
      0.15,
    );

    // Dérive lente de l'anneau (mesh centré sur l'origine = centre du terrain).
    if (this.instancedMesh) {
      this.instancedMesh.rotation.y += this.params.driftSpeed * this.time.delta;
    }
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
