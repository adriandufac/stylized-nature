import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import WorldComponent from "./WorldComponent.js";
import FoliageWind from "./FoliageWind.js";

import bushVertexShader from "../../shaders/bush/vertex.glsl";
import bushFragmentShader from "../../shaders/bush/fragment.glsl";

import truncVertexShader from "../../shaders/trunc/vertex.glsl";
import truncFragmentShader from "../../shaders/trunc/fragment.glsl";

/**
 * TREE — gère un ou plusieurs arbres = un tronc modélisé sous Blender (.glb) + des
 * amas de feuillage (mêmes quads texturés que Bush) posés au bout des branches.
 *
 * Chaque tronc est chargé en asynchrone (GLTFLoader) et posé sur le relief via raycast
 * (comme Bush.groundHeightAt). Le feuillage est placé aux Empties nommés "tip_*"
 * exportés dans le .glb. À défaut d'Empty "tip_*", l'arbre n'a pas de feuillage.
 *
 * Le feuillage de CHAQUE arbre tient dans UN SEUL InstancedMesh (un draw call), en
 * réutilisant le ShaderMaterial des buissons. Chaque arbre a sa propre géométrie
 * (les attributs d'instance aSphericalNormal/aColor sont propres à l'InstancedMesh).
 */
export default class Tree extends WorldComponent {
  constructor(terrain, wind, environment, groundShadow) {
    super();

    this.terrain = terrain;
    this.wind = wind;
    this.environment = environment;
    this.groundShadow = groundShadow;

    // Les arbres à charger : un .glb (mesh = tronc, Empties "tip_*" = feuillage),
    // sa position monde (x/z ; y = raycast sur le terrain), son décalage vertical
    // et la couleur de son feuillage — propres à CHAQUE arbre.
    this.treeConfigs = [
      {
        modelPath: "/models/trunc1.glb",
        x: -10.9,
        z: 11.4,
        yOffset: 2.1,
        color: "#ce6436",
      },
      {
        modelPath: "/models/trunc_oak.glb",
        x: 13.1,
        z: -2.8,
        yOffset: 1.85,
        color: "#90187a",
      },
    ];

    // Paramètres communs du feuillage (partagés par tous les arbres).
    this.params = {
      scale: 0.1, // échelle globale du tronc importé
      quadsPerTip: 14, // nb de quads de feuillage par bout de branche
      foliageRadius: 1.85, // rayon de l'amas autour de chaque tip
      foliageSize: 2.3, // taille d'une carte de feuillage
    };

    this.style = {
      barkLow: "#a7adb4", // pied/creux sombre (voir palettes plus bas)
      barkHigh: "#d9dee2", // haut/crêtes clair
      grainColor: "#4e5660",
      grainHoriz: 0.37, // stries serrées (fréquence horizontale)
      grainVert: 0.06, // très allongées verticalement
      grainStrength: 0.74,
      creviceDepth: 0.84,
      gradientMin: -3.7, // Y OBJET : à régler sur la hauteur réelle du modèle (cf. note)
      gradientMax: 12.1,
      rimColor: "#eef4fa",
      rimStrength: 0.1,
    };

    this.setTrunkMaterial();
    this.loadTrunkNoise();

    // Outils réutilisés (pas d'alloc par quad)
    this.dummy = new THREE.Object3D();
    this.dir = new THREE.Vector3();
    this._color = new THREE.Color();
    this.raycaster = new THREE.Raycaster();

    this.group = new THREE.Group(); // contient tous les arbres
    this.trees = []; // { cfg, root, tips, subgroup, foliageMesh }

    this.texture = new THREE.TextureLoader().load("/textures/leaftest.png");
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.foliageWind = new FoliageWind(this.wind, 0.1); // sensibilité au vent du feuillage (réglable dans le debug)
    this.setFoliageMaterial();
    this.scene.add(this.group);

    this.loadAll();
    this.setSubscriptions();
  }

  setTrunkMaterial() {
    this.trunkUniforms = {
      uBarkLow: { value: new THREE.Color(this.style.barkLow) },
      uBarkHigh: { value: new THREE.Color(this.style.barkHigh) },
      uGrainColor: { value: new THREE.Color(this.style.grainColor) },
      uGrainHoriz: { value: this.style.grainHoriz },
      uGrainVert: { value: this.style.grainVert },
      uGrainStrength: { value: this.style.grainStrength },
      uCreviceDepth: { value: this.style.creviceDepth },
      uGradientMin: { value: this.style.gradientMin },
      uGradientMax: { value: this.style.gradientMax },
      uNoise: { value: null },
      uSunDirection: { value: this.environment.sunDirection }, // réf partagée
      uAmbientLight: { value: this.environment.ambientIntensity },
      uRimColor: { value: new THREE.Color(this.style.rimColor) },
      uRimStrength: { value: this.style.rimStrength },
    };

    this.trunkMaterial = new THREE.ShaderMaterial({
      vertexShader: truncVertexShader,
      fragmentShader: truncFragmentShader,
      uniforms: this.trunkUniforms,
    });
  }

  setFoliageMaterial() {
    this.foliageMaterial = new THREE.ShaderMaterial({
      vertexShader: bushVertexShader,
      fragmentShader: bushFragmentShader,
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
      uniforms: {
        uSunDirection: { value: this.environment.sunDirection },
        uAmbientLight: { value: this.environment.ambientIntensity },
        uLeafTexture: { value: this.texture },
        ...this.foliageWind.uniforms, // uTime / uWindStrength / uWindDirection
      },
    });
  }

  loadTrunkNoise() {
    new THREE.TextureLoader().load("/textures/noiseTexture.png", (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.NoColorSpace;
      this.trunkUniforms.uNoise.value = tex;
    });
  }

  // Hauteur du terrain (y) en (x, z) via un rayon vers le bas. Comme Bush.groundHeightAt.
  groundHeightAt(x, z) {
    this.raycaster.set(
      new THREE.Vector3(x, 1000, z),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = this.raycaster.intersectObject(this.terrain.mesh)[0];
    return hit ? hit.point.y : 0;
  }

  loadAll() {
    for (const cfg of this.treeConfigs) this.loadOne(cfg);
  }

  loadOne(cfg) {
    const loader = new GLTFLoader();
    loader.load(
      cfg.modelPath,
      (gltf) => {
        const root = gltf.scene;
        root.scale.setScalar(this.params.scale);

        // Collecte : les meshes = tronc ; les Empties "tip_*" = points de feuillage.
        const tips = [];
        root.traverse((child) => {
          if (child.isMesh) {
            child.material?.dispose(); // libère le matériau exporté de Blender
            child.material = this.trunkMaterial; // <-- partagé par tous les troncs
            child.castShadow = true;
            child.receiveShadow = true;
          } else if (child.name.toLowerCase().startsWith("tip")) {
            tips.push(child.position.clone().multiplyScalar(this.params.scale));
          }
        });

        // Sous-groupe propre à cet arbre (positionné indépendamment sur le relief).
        const subgroup = new THREE.Group();
        subgroup.add(root);
        this.group.add(subgroup);

        const tree = { cfg, root, tips, subgroup, foliageMesh: null };
        this.trees.push(tree);

        this.place(tree); // pose l'arbre sur le terrain
        this.buildFoliage(tree);
        this.setDebug(tree);

        // Ombre au sol au pied du tronc (hauteur ≈ celle du tronc importé).
        this.groundShadow?.addAnchor({
          x: cfg.x,
          z: cfg.z,
          radius: 1.2,
          height: 4,
        });
      },
      undefined,
      (err) => console.error("Échec du chargement de " + cfg.modelPath, err),
    );
  }

  // Positionne le sous-groupe d'un arbre (tronc + feuillage) au pied, sur le relief.
  place(tree) {
    const { x, z, yOffset } = tree.cfg;
    const y = this.groundHeightAt(x, z);
    tree.subgroup.position.set(x, y + yOffset, z);
  }

  // Construit l'InstancedMesh du feuillage d'un arbre : quadsPerTip quads par tip.
  buildFoliage(tree) {
    if (tree.foliageMesh) {
      tree.subgroup.remove(tree.foliageMesh);
      tree.foliageMesh.geometry.dispose();
      tree.foliageMesh = null;
    }
    if (!tree.tips.length) return;

    const total = tree.tips.length * this.params.quadsPerTip;
    // Géométrie propre à cet arbre : elle porte ses attributs d'instance.
    const geometry = new THREE.PlaneGeometry(1, 1);
    const foliageMesh = new THREE.InstancedMesh(
      geometry,
      this.foliageMaterial,
      total,
    );

    const sphericalNormals = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    const windFactors = new Float32Array(total * 2);
    this._color.set(tree.cfg.color);
    const cr = this._color.r,
      cg = this._color.g,
      cb = this._color.b;

    let i = 0;
    for (const tip of tree.tips) {
      for (let q = 0; q < this.params.quadsPerTip; q++) {
        // Direction aléatoire dans une SPHÈRE COMPLÈTE (y de -1 à 1) : l'amas est
        // CENTRÉ sur le bout de branche (contrairement à Bush, posé au sol, qui
        // n'utilise qu'une demi-sphère vers le haut).
        const angle = Math.random() * Math.PI * 2;
        const yv = Math.random() * 2 - 1; // -1 .. 1
        const ring = Math.sqrt(1 - yv * yv);
        this.dir.set(Math.cos(angle) * ring, yv, Math.sin(angle) * ring);

        // Position LOCALE (dans le sous-groupe de l'arbre) = tip + offset dans l'amas.
        // Pas de décalage vertical : la touffe est centrée sur l'ancre.
        this.dummy.position
          .copy(tip)
          .addScaledVector(
            this.dir,
            this.params.foliageRadius * (0.4 + 0.6 * Math.random()),
          );

        this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
        const s = this.params.foliageSize * (0.7 + 0.5 * Math.random());
        this.dummy.scale.set(s, s, s);
        this.dummy.updateMatrix();

        sphericalNormals[i * 3] = this.dir.x;
        sphericalNormals[i * 3 + 1] = this.dir.y;
        sphericalNormals[i * 3 + 2] = this.dir.z;
        colors[i * 3] = cr;
        colors[i * 3 + 1] = cg;
        colors[i * 3 + 2] = cb;
        // vent : le feuillage d'arbre oscille EN MASSE -> amplitude ~constante (léger aléa),
        // déphasage aléatoire par quad.
        windFactors[i * 2] = 0.85 + 0.15 * Math.random();
        windFactors[i * 2 + 1] = Math.random() * Math.PI * 2;
        foliageMesh.setMatrixAt(i++, this.dummy.matrix);
      }
    }

    geometry.setAttribute(
      "aSphericalNormal",
      new THREE.InstancedBufferAttribute(sphericalNormals, 3),
    );
    geometry.setAttribute(
      "aColor",
      new THREE.InstancedBufferAttribute(colors, 3),
    );
    geometry.setAttribute(
      "aWind",
      new THREE.InstancedBufferAttribute(windFactors, 2),
    );
    foliageMesh.instanceMatrix.needsUpdate = true;
    tree.subgroup.add(foliageMesh);
    tree.foliageMesh = foliageMesh;
  }

  setSubscriptions() {
    // Le relief change -> on repose chaque arbre (le feuillage suit, il est dans le sous-groupe).
    this.terrain.on("rebuilt", () => this.trees.forEach((t) => this.place(t)));
    this.terrain.on("resampled", () =>
      this.trees.forEach((t) => this.place(t)),
    );
    // L'abonnement au vent (force) est géré par FoliageWind.
  }

  update() {
    // Un seul matériau de feuillage partagé par tous les arbres -> une maj suffit.
    this.foliageWind.update(this.time.elapsed);
  }

  setDebug(tree) {
    // Dossier racine "Arbres" + contrôles communs, créés une seule fois.
    if (!this._debugFolder) {
      this._debugFolder = this.debug.ui.addFolder("Arbres").close();
      const rebuildAll = () => this.trees.forEach((t) => this.buildFoliage(t));
      // Sensibilité au vent du feuillage (indépendante de l'herbe et des buissons).
      this._debugFolder
        .add(this.foliageWind.uniforms.uWindAmplitude, "value", 0, 6, 0.1)
        .name("Sensibilité vent");
      this._debugFolder
        .add(this.params, "quadsPerTip", 1, 40, 1)
        .name("Quads / branche")
        .onFinishChange(rebuildAll);
      this._debugFolder
        .add(this.params, "foliageRadius", 0.2, 4, 0.05)
        .name("Rayon feuillage")
        .onFinishChange(rebuildAll);
      this._debugFolder
        .add(this.params, "foliageSize", 0.3, 4, 0.05)
        .name("Taille feuille")
        .onFinishChange(rebuildAll);
    }

    // Sous-dossier propre à cet arbre : position, décalage Y et couleur des feuilles.
    const label = tree.cfg.modelPath.split("/").pop();
    const sub = this._debugFolder.addFolder(label).close();
    sub
      .add(tree.cfg, "x", -16, 16, 0.1)
      .name("Position X")
      .onChange(() => this.place(tree));
    sub
      .add(tree.cfg, "z", -16, 16, 0.1)
      .name("Position Z")
      .onChange(() => this.place(tree));
    sub
      .add(tree.cfg, "yOffset", -5, 5, 0.05)
      .name("Décalage Y")
      .onChange(() => this.place(tree));
    sub
      .addColor(tree.cfg, "color")
      .name("Couleur")
      .onFinishChange(() => this.buildFoliage(tree));
    // Contrôles d'écorce : matériau partagé par tous les troncs -> créés UNE seule fois.
    if (!this._barkFolder) {
      const bark = this._debugFolder.addFolder("Écorce").close();
      this._barkFolder = bark;
      const u = this.trunkUniforms;
      bark
        .addColor(this.style, "barkLow")
        .name("Couleur pied")
        .onChange((v) => u.uBarkLow.value.set(v));
      bark
        .addColor(this.style, "barkHigh")
        .name("Couleur haut")
        .onChange((v) => u.uBarkHigh.value.set(v));
      bark
        .addColor(this.style, "grainColor")
        .name("Couleur stries")
        .onChange((v) => u.uGrainColor.value.set(v));
      bark
        .add(this.style, "grainHoriz", 0.05, 3, 0.01)
        .name("Stries (densité)")
        .onChange((v) => (u.uGrainHoriz.value = v));
      bark
        .add(this.style, "grainVert", 0.01, 0.5, 0.005)
        .name("Stries (étirement)")
        .onChange((v) => (u.uGrainVert.value = v));
      bark
        .add(this.style, "grainStrength", 0, 1, 0.01)
        .name("Force stries")
        .onChange((v) => (u.uGrainStrength.value = v));
      bark
        .add(this.style, "creviceDepth", 0, 1, 0.01)
        .name("Creux")
        .onChange((v) => (u.uCreviceDepth.value = v));
      bark
        .add(this.style, "gradientMin", -5, 30, 0.1)
        .name("Dégradé pied (Y obj)")
        .onChange((v) => (u.uGradientMin.value = v));
      bark
        .add(this.style, "gradientMax", -5, 40, 0.1)
        .name("Dégradé haut (Y obj)")
        .onChange((v) => (u.uGradientMax.value = v));
      bark
        .add(this.style, "rimStrength", 0, 1.5, 0.01)
        .name("Contour lumineux")
        .onChange((v) => (u.uRimStrength.value = v));
      bark
        .addColor(this.style, "rimColor")
        .name("Couleur contour")
        .onChange((v) => u.uRimColor.value.set(v));
    }
  }
}
