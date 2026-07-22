import * as THREE from "three";
import WorldComponent from "./WorldComponent.js";
import cloudsVertexShader from "../../shaders/clouds/vertex.glsl";
import cloudsFragmentShader from "../../shaders/clouds/fragment.glsl";

/**
 * CLOUDFIELD — base commune des champs de puffs billboardés.
 *
 * Mutualise la géométrie (quad unitaire), le matériau/shader (billboard + forme
 * cotonneuse + teinte jour/nuit + fondu météo via uCoverage/uBrightness) et la
 * construction de l'InstancedMesh avec ses attributs par instance
 * (aScale, aPhase, aSeed, aRank).
 *
 * Les sous-classes définissent `this.params`, appellent `this.init()` puis
 * surchargent :
 *   - getCount()           : nombre d'instances de l'InstancedMesh
 *   - placeInstance(i, d)  : positionne le dummy `d` pour l'instance i
 *   - updateExtra()        : logique d'update spécifique (ex. météo, suivi caméra)
 *   - setDebug()           : panneau lil-gui
 *
 * Teinté selon l'heure via sun.sunDirection (réf partagée, mutée en place).
 */
export default class CloudField extends WorldComponent {
  constructor(sun) {
    super();
    this.sun = sun;

    // Objet "fantôme" pour composer la matrice de chaque instance (patron Grass).
    this.dummy = new THREE.Object3D();
    this.instancedMesh = null;
  }

  // À appeler par la sous-classe une fois `this.params` rempli.
  init() {
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
      uSunDirection: { value: this.sun.sunDirection }, // réf partagée (mutée en place)
      uDayFactor: { value: 1 },
      uDayColor: { value: new THREE.Color(this.params.dayColor) },
      uNightColor: { value: new THREE.Color(this.params.nightColor) },
      uSunTint: { value: new THREE.Color(this.params.sunTint) },
      uOpacity: { value: this.params.opacity },
      uCoverage: { value: 1 }, // anneau : reste à 1 (toujours visible)
      uBrightness: { value: 1 }, // anneau : reste à 1 (blanc)
      uSizeScale: { value: 1 }, // anneau : reste à 1 (taille non modulée)
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

  // (Re)construit l'InstancedMesh des puffs.
  // L'InstancedMesh ayant un count figé, on en recrée un à chaque changement.
  build() {
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
    }

    const count = this.getCount();
    this.instancedMesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      count,
    );

    const scales = new Float32Array(count);
    const phases = new Float32Array(count);
    const seeds = new Float32Array(count); // random pour le bruit de forme cotonneuse (perlin)
    const ranks = new Float32Array(count); // rang pour apparition ou non du nuage (uCoverage), 
                                           // on shuffle pour pas que les nuages apparaissent dans l'ordre

    for (let i = 0; i < count; i++) {
      // Placement (anneau, dôme...) délégué à la sous-classe.
      this.placeInstance(i, this.dummy);
      this.dummy.rotation.set(0, 0, 0); // billboard géré dans le shader
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

      scales[i] =
        this.params.sizeMin +
        Math.random() * (this.params.sizeMax - this.params.sizeMin);
      phases[i] = Math.random() * Math.PI * 2;
      seeds[i] = Math.random();
      // Rang réparti uniformément : la montée de uCoverage révèle les puffs dans l'ordre.
      ranks[i] = count > 1 ? i / (count - 1) : 0;
    }
    // Mélange des rangs -> uCoverage révèle des puffs dispersés (et non par paquets).
    this.shuffle(ranks);

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
    this.geometry.setAttribute(
      "aRank",
      new THREE.InstancedBufferAttribute(ranks, 1),
    );

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    // Le décalage billboard sort des bornes d'instance -> évite un clipping disgracieux.
    this.instancedMesh.frustumCulled = false;
    this.scene.add(this.instancedMesh);
  }

  // Mélange en place (Fisher-Yates).
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  update() {
    this.uniforms.uTime.value = this.time.elapsed;

    // 0 la nuit -> 1 le jour (même seuil que Sky pour le soleil sous l'horizon).
    this.uniforms.uDayFactor.value = THREE.MathUtils.smoothstep(
      this.sun.sunDirection.y,
      -0.15,
      0.15,
    );

    // Dérive lente du champ.
    if (this.instancedMesh) {
      this.instancedMesh.rotation.y += this.params.driftSpeed * this.time.delta;
    }

    this.updateExtra();
  }

  // --- Hooks à surcharger par les sous-classes -------------------------------
  getCount() {
    return this.params.count;
  }

  // Positionne `dummy.position` pour l'instance i (rotation/scale gérés par la base).
  placeInstance(/* i, dummy */) {}

  // Update spécifique (météo, suivi caméra...). No-op par défaut.
  updateExtra() {}

  // Panneau debug spécifique. No-op par défaut.
  setDebug() {}
}
