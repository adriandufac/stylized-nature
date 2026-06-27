import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import WorldComponent from "./WorldComponent.js";

import grassVertexShader from "../../shaders/grass/vertex.glsl";
import grassFragmentShader from "../../shaders/grass/fragment.glsl";

// Masque de courbure (base=0 -> pointe=1), constant quelle que soit la taille du brin.
const windBladePower = new Float32Array([
  0,
  0,
  0,
  0,
  0,
  0, // base    -> 0 (fixe)
  0.5,
  0.5,
  0.5,
  0.5,
  0.5,
  0.5, // milieu  -> 0.5
  1,
  1,
  1, // pointe  -> 1 (bouge le plus)
]);

export default class Grass extends WorldComponent {
  constructor(terrain, wind, environment, groundShadow) {
    super();

    this.terrain = terrain;
    this.wind = wind;
    this.environment = environment;
    this.groundShadow = groundShadow;

    this.params = {
      BLADE_W: 0.1,
      BLADE_H: 0.5,
      count: 80000,
    };

    this.maskParams = {
      enabled: true,
      url: "/textures/grass-mask.png",

      blackThreshold: 0.25,
      whiteThreshold: 0.75,
      // Comportement de la zone grise :
      grayDensity: 0.2, // proba de garder un brin tiré en zone grise (moins dense)
      grayHeightFactor: 0.5, // facteur appliqué à la hauteur (scale.y) en zone grise (plus court)

      // Orientation du masque (sans repeindre l'image) : flips + échange d'axes.
      // Les 8 combinaisons couvrent miroirs et rotations de 90°.
      flipU: false, // miroir gauche/droite
      flipV: false, // miroir haut/bas (true = image top-down classique)
      swapUV: false, // échange X<->Z (= rotation 90°)
    };

    this.maskData = null;
    this.maskW = 0;
    this.maskH = 0;

    // Objet "fantôme" qui sert à calculer une matrice de transformation par brin.
    this.dummy = new THREE.Object3D();
    this.samplePos = new THREE.Vector3();
    this.instancedMesh = null;

    this.bladeGeometry = this.buildBladeGeometry();
    this.setMaterial();
    this.build();
    this.loadMask();
    this.setSubscriptions();
    this.setDebug();
  }

  loadMask() {
    // chargemment  du masque de densité d'herbe
    new THREE.ImageLoader().load(
      this.maskParams.url,
      (img) => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        this.maskData = ctx.getImageData(0, 0, img.width, img.height).data;
        this.maskW = img.width;
        this.maskH = img.height;
        this.build(); // le masque est prêt : on replace l'herbe
      },
      undefined,
      () => {
        /* masque absent/échec : on laisse l'herbe partout (maskData reste null) */
      },
    );
  }

  sampleZone(pos) {
    // utiulise la pos et le mask pour déterminer si on peut placer un brin d'herbe à cet endroit
    if (!this.maskParams.enabled || !this.maskData) return "full"; // pas de masque => tout permis
    const size = this.terrain.params.size;
    let u = (pos.x + size / 2) / size; // 0..1
    let v = (pos.z + size / 2) / size; // 0..1

    // Réorientation du masque sans repeindre l'image.
    if (this.maskParams.swapUV) [u, v] = [v, u]; // rotation 90° (échange des axes)
    if (this.maskParams.flipU) u = 1 - u; // miroir horizontal
    if (this.maskParams.flipV) v = 1 - v; // miroir vertical (image top-down)

    const px = Math.min(
      this.maskW - 1,
      Math.max(0, Math.floor(u * this.maskW)),
    );
    const py = Math.min(
      this.maskH - 1,
      Math.max(0, Math.floor(v * this.maskH)),
    );
    const lum = this.maskData[(py * this.maskW + px) * 4] / 255; // canal R suffit (gris)

    if (lum < this.maskParams.blackThreshold) return "none";
    if (lum < this.maskParams.whiteThreshold) return "short";
    return "full";
  }

  // Construit la géométrie d'un brin à partir de params.BLADE_W / BLADE_H.
  buildBladeGeometry() {
    const w = this.params.BLADE_W;
    const h = this.params.BLADE_H;

    const geometry = new THREE.BufferGeometry();

    const vertices = new Float32Array([
      -w / 2,
      0,
      0, // 0 base gauche
      w / 2,
      0,
      0, // 1 base droite
      -w / 4,
      h / 2,
      0, // 2 milieu gauche
      w / 4,
      h / 2,
      0, // 3 milieu droit
      0,
      h,
      0, // 4 pointe
    ]);

    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    geometry.computeVertexNormals();
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(windBladePower, 3),
    );

    return geometry;
  }

  setMaterial() {
    this.uniforms = {
      uTime: { value: 0 },
      uWindStrength: { value: this.wind.params.strength },
      uWindDirection: { value: this.wind.direction }, // même objet que Wind.direction : maj live
      uBladeHeight: { value: this.params.BLADE_H }, // hauteur locale du brin : sert à calculer la pente du vent pour la normale
      uBaseColor: { value: new THREE.Color("#3f706a") }, // vert foncé à la base
      uTipColor: { value: new THREE.Color("#a6d6cc") }, // vert clair à la pointe
      uSunDirection: { value: this.environment.sunDirection }, // partagé (réf) : muté en place par updateSun
      uAmbientLight: { value: this.environment.ambientIntensity },

      // Ombres au sol : les brins dans une ellipse d'ombre sont assombris.
      // Tableaux partagés PAR RÉFÉRENCE avec GroundShadow (il les remplit, on les lit).
      uShadowDir: { value: this.groundShadow.shadowDir }, // direction horizontale (réf)
      uShadows: { value: this.groundShadow.ellipses }, // vec4[32] (réf) : (cx, cz, demi-l, demi-L)
      uShadowCount: { value: 0 }, // nb d'ellipses valides (mis à jour chaque frame)
      uShadowStrength: { value: 0 }, // 0 la nuit -> 1 le jour (= dayFactor)
      uShadowDarken: { value: 0.45 }, // luminosité d'un brin pleinement ombragé
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: grassVertexShader,
      fragmentShader: grassFragmentShader,
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
    });
  }

  // (Re)construit l'InstancedMesh d'herbe avec params.count brins.
  // L'InstancedMesh ayant un count figé, on en recrée un à chaque changement.
  build() {
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose(); // libère les buffers d'instances côté GPU
    }

    // Sampler reconstruit à chaque appel : il fige un instantané de la géométrie,
    // donc il doit refléter le terrain courant (taille/relief modifiés).
    const sampler = new MeshSurfaceSampler(this.terrain.mesh).build();

    this.instancedMesh = new THREE.InstancedMesh(
      this.bladeGeometry,
      this.material,
      this.params.count,
    );

    let placed = 0;
    let attempts = 0;
    const maxAttempts = this.params.count * 30; // limite pour éviter boucle infinie si masque trop restrictif

    while (placed < this.params.count && attempts < maxAttempts) {
      attempts++;
      sampler.sample(this.samplePos);

      const zone = this.sampleZone(this.samplePos);
      if (zone === "none") continue; // noir => rejet
      if (zone === "short" && Math.random() > this.maskParams.grayDensity)
        continue; // gris => moins dense

      this.dummy.position.copy(this.samplePos);
      this.dummy.rotation.y = Math.random() * Math.PI * 2;

      // Échelle de base (variété), puis raccourcissement en zone grise
      const s = 0.8 + Math.random() * 0.6;
      let sy = s + Math.random() * 0.4;
      if (zone === "short")
        sy *= this.maskParams.grayHeightFactor * (0.8 + Math.random() * 0.4); // zone grise : plus court
      this.dummy.scale.set(s, sy, s);

      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(placed, this.dummy.matrix);
      placed++;
    }

    this.instancedMesh.count = placed; // ne rend que les brins effectivement placés
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.instancedMesh);
  }

  // Reconstruit la géométrie du brin (largeur/hauteur) et la branche sur l'herbe
  // Utilisé dans le GUI pour modifier params.BLADE_W / params.BLADE_H en live.
  rebuildBlades() {
    const old = this.bladeGeometry;
    this.bladeGeometry = this.buildBladeGeometry();
    if (this.instancedMesh) this.instancedMesh.geometry = this.bladeGeometry;
    this.uniforms.uBladeHeight.value = this.params.BLADE_H; // la pente du vent dépend de la hauteur du brin
    old.dispose(); // libère l'ancienne géométrie côté GPU
  }

  setSubscriptions() {
    // Terrain reconstruit (taille/subdivisions) ou relief modifié (octaves/seed) : se replacer
    this.terrain.on("rebuilt", () => this.build());
    this.terrain.on("resampled", () => this.build());

    // Vent : la direction est partagée par référence, seule la force passe par l'uniform
    this.wind.on("change", () => {
      this.uniforms.uWindStrength.value = this.wind.params.strength;
    });
  }

  setDebug() {
    const folder = this.debug.ui.addFolder("Herbe");
    folder
      .add(this.params, "count", 1000, 300000, 1000)
      .name("Nombre de brins")
      .onFinishChange(() => this.build());
    folder
      .add(this.params, "BLADE_W", 0.01, 0.5, 0.01)
      .name("Largeur brin")
      .onChange(() => this.rebuildBlades());
    folder
      .add(this.params, "BLADE_H", 0.1, 3, 0.05)
      .name("Hauteur brin")
      .onChange(() => this.rebuildBlades());
    folder
      .addColor({ base: "#1f5c2e" }, "base")
      .name("Couleur base")
      .onChange((v) => this.uniforms.uBaseColor.value.set(v));
    folder
      .addColor({ tip: "#8fd152" }, "tip")
      .name("Couleur pointe")
      .onChange((v) => this.uniforms.uTipColor.value.set(v));
    folder
      .add(this.uniforms.uShadowDarken, "value", 0, 1, 0.01)
      .name("Ombre (1 = aucune)");
  }

  update() {
    // Anime le balancement du vent
    this.uniforms.uTime.value = this.time.elapsed;

    // mise a jour de l'ombre (le shader prend les uniforms en fonction du groundshadow)
    const gs = this.groundShadow;
    if (!gs) return;
    // primotive donc il faut recopié
    this.uniforms.uShadowCount.value = gs.count;
    this.uniforms.uShadowStrength.value = gs.dayFactor;
  }
}
