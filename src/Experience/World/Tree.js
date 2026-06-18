import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import WorldComponent from "./WorldComponent.js";

import bushVertexShader from "../../shaders/bush/vertex.glsl";
import bushFragmentShader from "../../shaders/bush/fragment.glsl";

/**
 * TREE — un arbre = un tronc modélisé sous Blender (.glb) + des amas de feuillage
 * (mêmes quads texturés que Bush) posés au bout des branches.
 *
 * Le tronc est chargé en asynchrone (GLTFLoader). On le pose sur le relief via raycast
 * (comme Bush.groundHeightAt). Le feuillage est placé :
 *   - soit aux Empties nommés "tip_*" exportés dans le .glb (méthode recommandée),
 *   - soit, à défaut, en haut de la boîte englobante du tronc (fallback).
 *
 * Tout le feuillage de l'arbre tient dans UN SEUL InstancedMesh (un draw call),
 * en réutilisant le ShaderMaterial des buissons.
 */
export default class Tree extends WorldComponent {
  constructor(terrain, wind, environment) {
    super();

    this.terrain = terrain;
    this.wind = wind;
    this.environment = environment;

    // Paramètres de l'arbre. x/z = position monde (y = raycast sur le terrain).
    this.params = {
      x: -10,
      z: -8,
      yOffset: 2.1,
      scale: 0.1, // échelle globale du tronc importé
      quadsPerTip: 14, // nb de quads de feuillage par bout de branche
      foliageRadius: 1.85, // rayon de l'amas autour de chaque tip
      foliageSize: 2.3, // taille d'une carte de feuillage
      color: "#ce6436",
    };

    // Outils réutilisés (pas d'alloc par quad)
    this.dummy = new THREE.Object3D();
    this.dir = new THREE.Vector3();
    this._color = new THREE.Color();
    this.raycaster = new THREE.Raycaster();

    this.group = new THREE.Group(); // contient le tronc + le feuillage
    this.trunk = null;
    this.foliageMesh = null;
    this.tips = [];

    this.texture = new THREE.TextureLoader().load("/textures/leaftest.png");
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.bladeGeometry = new THREE.PlaneGeometry(1, 1);
    this.setFoliageMaterial();
    this.scene.add(this.group);

    this.load();
    this.setSubscriptions();
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
      },
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

  load() {
    const loader = new GLTFLoader();
    loader.load(
      "/models/trunc1.glb",
      (gltf) => {
        const root = gltf.scene;
        root.scale.setScalar(this.params.scale);

        // Collecte : les meshes = tronc ; les Empties "tip_*" = points de feuillage.
        this.tips = [];
        const tips = [];
        root.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          } else if (child.name.toLowerCase().startsWith("tip")) {
            tips.push(child);
          }
        });

        if (tips.length) {
          for (const t of tips) {
            this.tips.push(
              t.position.clone().multiplyScalar(this.params.scale),
            );
          }
        }

        this.trunk = root;
        this.group.add(this.trunk);
        this.place(); // pose l'arbre sur le terrain
        this.buildFoliage();
        this.setDebug();
      },
      undefined,
      (err) => console.error("Échec du chargement de /models/trunc1.glb", err),
    );
  }

  // Positionne le groupe entier (tronc + feuillage) au pied, sur le relief.
  place() {
    const y = this.groundHeightAt(this.params.x, this.params.z);
    this.group.position.set(
      this.params.x,
      y + this.params.yOffset,
      this.params.z,
    );
  }

  // Construit l'InstancedMesh du feuillage : quadsPerTip quads autour de chaque tip.
  buildFoliage() {
    if (this.foliageMesh) {
      this.group.remove(this.foliageMesh);
      this.foliageMesh.dispose();
    }
    if (!this.tips.length) return;

    const total = this.tips.length * this.params.quadsPerTip;
    this.foliageMesh = new THREE.InstancedMesh(
      this.bladeGeometry,
      this.foliageMaterial,
      total,
    );

    const sphericalNormals = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    this._color.set(this.params.color);
    const cr = this._color.r,
      cg = this._color.g,
      cb = this._color.b;

    let i = 0;
    for (const tip of this.tips) {
      for (let q = 0; q < this.params.quadsPerTip; q++) {
        // Direction aléatoire dans une SPHÈRE COMPLÈTE (y de -1 à 1) : l'amas est
        // CENTRÉ sur le bout de branche (contrairement à Bush, posé au sol, qui
        // n'utilise qu'une demi-sphère vers le haut).
        const angle = Math.random() * Math.PI * 2;
        const yv = Math.random() * 2 - 1; // -1 .. 1
        const ring = Math.sqrt(1 - yv * yv);
        this.dir.set(Math.cos(angle) * ring, yv, Math.sin(angle) * ring);

        // Position LOCALE (dans le groupe de l'arbre) = tip + offset dans l'amas.
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
        this.foliageMesh.setMatrixAt(i++, this.dummy.matrix);
      }
    }

    this.bladeGeometry.setAttribute(
      "aSphericalNormal",
      new THREE.InstancedBufferAttribute(sphericalNormals, 3),
    );
    this.bladeGeometry.setAttribute(
      "aColor",
      new THREE.InstancedBufferAttribute(colors, 3),
    );
    this.foliageMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.foliageMesh);
  }

  setSubscriptions() {
    // Le relief change -> on repose l'arbre (le feuillage suit, il est dans le groupe).
    this.terrain.on("rebuilt", () => this.trunk && this.place());
    this.terrain.on("resampled", () => this.trunk && this.place());
  }

  setDebug() {
    const folder = this.debug.ui.addFolder("Arbre").close();
    folder
      .add(this.params, "x", -16, 16, 0.5)
      .name("Position X")
      .onFinishChange(() => this.place());
    folder
      .add(this.params, "z", -16, 16, 0.5)
      .name("Position Z")
      .onFinishChange(() => this.place());
    folder
      .add(this.params, "yOffset", -5, 5, 0.05)
      .name("Décalage Y")
      .onChange(() => this.place());
    folder
      .add(this.params, "quadsPerTip", 1, 40, 1)
      .name("Quads / branche")
      .onFinishChange(() => this.buildFoliage());
    folder
      .add(this.params, "foliageRadius", 0.2, 4, 0.05)
      .name("Rayon feuillage")
      .onFinishChange(() => this.buildFoliage());
    folder
      .add(this.params, "foliageSize", 0.3, 4, 0.05)
      .name("Taille feuille")
      .onFinishChange(() => this.buildFoliage());
    folder
      .addColor(this.params, "color")
      .name("Couleur")
      .onFinishChange(() => this.buildFoliage());
  }
}
