import * as THREE from "three";
import WorldComponent from "./WorldComponent.js";
import Interactable from "../Utils/Interactable.js";
import FoliageWind from "./FoliageWind.js";

import bushVertexShader from "../../shaders/bush/vertex.glsl";
import bushFragmentShader from "../../shaders/bush/fragment.glsl";

/**
 * BUSH — buissons placés À LA MAIN (pas de dispersion aléatoire comme l'herbe).
 * Chaque buisson = un amas de quads texturés (carte de feuillage), regroupés en
 * UN SEUL InstancedMesh.
 */
export default class Bush extends WorldComponent {
  constructor(terrain, wind, sun, groundShadow) {
    super();

    this.terrain = terrain;
    this.wind = wind;
    this.sun = sun;
    this.groundShadow = groundShadow;

    // Buissons placés à la main. Chaque buisson définit TOUS ses paramètres :
    //   x, z   : position monde (le y est calculé par raycast sur le terrain)
    //   quads  : nb de cartes de feuillage
    //   radius : rayon de l'amas autour du centre
    //   size   : taille d'une carte
    this.bushes = [
      { x: 14, z: 7.5, quads: 10, radius: 0.7, size: 1.3, color: "#7f5db1" },
      { x: 11.5, z: 6, quads: 50, radius: 1.0, size: 1.0, color: "#c98bb0" },
      { x: 12, z: 12, quads: 4, radius: 0.7, size: 1.9, color: "#88a8d4" },
      { x: 8.5, z: -13.5, quads: 10, radius: 0.7, size: 1.3, color: "#e0a3ab" },
      { x: 9, z: -6.5, quads: 14, radius: 0.7, size: 1.3, color: "#7fae9e" },
    ];

    // Outils réutilisés (évite d'allouer à chaque quad)
    this.dummy = new THREE.Object3D();
    this.dir = new THREE.Vector3();
    this._color = new THREE.Color(); // scratch pour convertir bush.color en rgb
    this.raycaster = new THREE.Raycaster();
    this.instancedMesh = null;

    // Interaction : un halo lumineux + une zone de survol par buisson.
    this.glowTexture = this.makeGlowTexture();
    this.hitboxGeometry = new THREE.SphereGeometry(1, 8, 6); // hitbox invisible partagée
    this.hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
    this.interactives = []; // { halo, haloMat, hitbox, interactable, hoverBoost }

    // Les cartes de feuillage : chaque quad en piochera UNE au hasard (voir build()).
    // Elles sont empilées dans une seule texture array (sampler2DArray) -> 1 seul draw call.
    // toutes doivent avoir la MÊME taille (idéalement carré, puissance de 2 : 1024x1024).
    this.leafUrls = [
      "/textures/leaftest.png",
      "/textures/leaftest2.png",
      "/textures/leaftest3.png",
      "/textures/leaftest4.png",
    ];
    this.textureArray = null; // rempli par loadTextures() (chargement asynchrone)

    this.bladeGeometry = new THREE.PlaneGeometry(1, 1); // UV déjà en [0,1]
    this.foliageWind = new FoliageWind(this.wind, 0.1); // sensibilité au vent des buissons (réglable dans le debug)
    this.setMaterial();
    this.loadTextures(); // charge le tableau de textures PUIS appelle build()
    this.setSubscriptions();
    this.setDebug();

    // Une ombre au sol par buisson (empreinte ≈ rayon de l'amas, hauteur ≈ taille des cartes).
    for (const b of this.bushes) {
      this.groundShadow?.addAnchor({
        x: b.x,
        z: b.z,
        radius: b.radius + b.size * 0.4,
        height: b.size,
      });
    }
  }

  setMaterial() {
    // alphaTest (discard) plutôt que transparence : le rendu reste OPAQUE,
    // donc pas de tri à gérer, le depth buffer fait le travail.
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, // requis pour sampler2DArray dans le fragment shader
      vertexShader: bushVertexShader,
      fragmentShader: bushFragmentShader,
      side: THREE.DoubleSide, // quads visibles des deux côtés
      transparent: false, // IMPORTANT : on utilise alphaTest (discard), PAS la transparence
      depthWrite: true, // du coup on garde le depth write (tri correct, pas de halo)
      uniforms: {
        uSunDirection: { value: this.sun.sunDirection },
        uAmbientLight: { value: this.sun.ambientIntensity },
        uLeafTexture: { value: null }, // tableau de cartes de feuillage (rempli par loadTextures)
        ...this.foliageWind.uniforms, // uTime / uWindStrength / uWindDirection
      },
    });
  }

  // Charge les N PNG, les empile dans UNE DataArrayTexture (sampler2DArray),
  // puis (re)construit le mesh. Chargement asynchrone -> build() appelé dans le callback.
  loadTextures() {
    const loader = new THREE.ImageLoader();
    const images = new Array(this.leafUrls.length);
    let loaded = 0;
    this.leafUrls.forEach((url, i) => {
      loader.load(url, (img) => {
        images[i] = img;
        if (++loaded === this.leafUrls.length) this.buildTextureArray(images);
      });
    });
  }

  buildTextureArray(images) {
    const w = images[0].width;
    const h = images[0].height;
    const depth = images.length;

    // On dessine chaque image dans un canvas pour récupérer ses pixels RGBA bruts.
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    const data = new Uint8Array(w * h * 4 * depth);
    for (let i = 0; i < depth; i++) {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(images[i], 0, 0, w, h); // force la même taille pour toutes
      const pixels = ctx.getImageData(0, 0, w, h).data;
      data.set(pixels, i * w * h * 4); // empile la couche i
    }

    const tex = new THREE.DataArrayTexture(data, w, h, depth);
    tex.format = THREE.RGBAFormat;
    tex.colorSpace = THREE.SRGBColorSpace; // utilisée comme couleur
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    this.textureArray = tex;
    this.material.uniforms.uLeafTexture.value = tex;
    this.build();
  }

  // Renvoie la hauteur du terrain (y) à la position (x, z) via un rayon vers le bas.
  groundHeightAt(x, z) {
    this.raycaster.set(
      new THREE.Vector3(x, 1000, z),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = this.raycaster.intersectObject(this.terrain.mesh)[0];
    return hit ? hit.point.y : 0;
  }

  // (Re)construit l'InstancedMesh de tous les quads de tous les buissons.
  build() {
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
    }
    this.destroyInteractives(); // repart de zéro (halos + hitboxes)

    // Total = somme des quads de chaque buisson.
    const total = this.bushes.reduce((sum, b) => sum + b.quads, 0);
    this.instancedMesh = new THREE.InstancedMesh(
      this.bladeGeometry,
      this.material,
      total,
    );

    this.sphericalNormals = new Float32Array(total * 3); // normales sphériques pour chaque quad
    this.instanceColors = new Float32Array(total * 3); // couleur par quad (héritée du buisson)
    this.textureIndices = new Float32Array(total); // index de la carte de feuillage (0..N-1) par quad
    this.windFactors = new Float32Array(total * 2);

    let i = 0;
    for (const bush of this.bushes) {
      const groundY = this.groundHeightAt(bush.x, bush.z);

      for (let q = 0; q < bush.quads; q++) {
        // Direction aléatoire dans une DEMI-sphère (y >= 0) : pas de quad sous terre.
        const angle = Math.random() * Math.PI * 2;
        const yv = Math.random(); // 0..1
        const ring = Math.sqrt(1 - yv * yv); // rayon du cercle à cette hauteur
        this.dir.set(
          Math.cos(angle) * ring * 1.2,
          yv * 0.8,
          Math.sin(angle) * ring * 1.2,
        );

        // Position du quad = centre au sol + offset dans l'amas, relevé pour poser la base.
        this.dummy.position
          .set(bush.x, groundY, bush.z)
          .addScaledVector(this.dir, bush.radius * (0.4 + 0.6 * Math.random()));
        this.dummy.position.y += bush.size * 0.5;

        this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0); // yaw aléatoire
        const s = bush.size * (0.7 + 0.5 * Math.random());
        this.dummy.scale.set(s, s, s);

        this.dummy.updateMatrix();
        // spericalNormals pour simuler une sphere et effet fluffy
        this.sphericalNormals[i * 3] = this.dir.x;
        this.sphericalNormals[i * 3 + 1] = this.dir.y;
        this.sphericalNormals[i * 3 + 2] = this.dir.z;
        // chaque quad pioche une carte de feuillage au hasard
        this.textureIndices[i] = Math.floor(
          Math.random() * this.leafUrls.length,
        );
        // vent : amplitude 0 en bas -> 1 en haut (base plantée), déphasage aléatoire par quad.
        this.windFactors[i * 2] = THREE.MathUtils.clamp(
          (this.dummy.position.y - groundY) / bush.size,
          0,
          1,
        );
        this.windFactors[i * 2 + 1] = Math.random() * Math.PI * 2;
        this.instancedMesh.setMatrixAt(i++, this.dummy.matrix);
      }

      // Halo + zone de survol centrés sur l'amas de ce buisson.
      this.addBushInteractive(bush, bush.x, groundY + bush.size * 0.5, bush.z);
    }

    this.fillInstanceColors();
    this.bladeGeometry.setAttribute(
      "aSphericalNormal",
      new THREE.InstancedBufferAttribute(this.sphericalNormals, 3),
    );
    this.bladeGeometry.setAttribute(
      "aColor",
      new THREE.InstancedBufferAttribute(this.instanceColors, 3),
    );
    this.bladeGeometry.setAttribute(
      "aTextureIndex",
      new THREE.InstancedBufferAttribute(this.textureIndices, 1),
    );
    this.bladeGeometry.setAttribute("aWind", new THREE.InstancedBufferAttribute(this.windFactors, 2))
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.instancedMesh);
  }

  fillInstanceColors() {
    let i = 0;
    for (const bush of this.bushes) {
      this._color.set(bush.color);
      const r = this._color.r,
        g = this._color.g,
        b = this._color.b;
      for (let q = 0; q < bush.quads; q++) {
        this.instanceColors[i * 3] = r;
        this.instanceColors[i * 3 + 1] = g;
        this.instanceColors[i * 3 + 2] = b;
        i++;
      }
    }
  }

  // Met à jour les couleurs SANS tout reconstruire : on réécrit juste l'attribut aColor.
  updateColors() {
    this.fillInstanceColors();
    this.bladeGeometry.getAttribute("aColor").needsUpdate = true;
  }

  setSubscriptions() {
    // Le terrain change de taille/relief -> les hauteurs au sol changent, on replace.
    this.terrain.on("rebuilt", () => this.build());
    this.terrain.on("resampled", () => this.build());
    // L'abonnement au vent (force) est géré par FoliageWind.
  }

  // Texture de lueur radiale (blanc -> transparent), teintée ensuite par la couleur
  // du buisson en AdditiveBlending -> glow sans post-processing.
  makeGlowTexture() {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2,
    );
    g.addColorStop(0.0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.4, "rgba(255,255,255,0.4)");
    g.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // Ajoute, pour un buisson, un halo (éteint au repos) + une hitbox invisible
  // servant de cible de raycast. Chaque buisson a SON Interactable : le survol
  // bascule ainsi correctement d'un buisson à l'autre.
  addBushInteractive(bush, cx, cy, cz) {
    const haloMat = new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: new THREE.Color(bush.color),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0, // allumé au survol (voir update)
      fog: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.position.set(cx, cy, cz);
    halo.scale.setScalar((bush.radius * 1.2 + bush.size) * 2.2);
    this.scene.add(halo);

    // Hitbox : sphère invisible englobant l'amas (non rendue, mais toujours
    // testée par le raycaster). Dimensionnée sur le rayon + la taille des cartes.
    const hitbox = new THREE.Mesh(this.hitboxGeometry, this.hitboxMaterial);
    hitbox.position.set(cx, cy, cz);
    hitbox.scale.setScalar(bush.radius * 1.2 + bush.size * 0.5);
    hitbox.visible = false;
    this.scene.add(hitbox);

    const interactable = new Interactable({
      object3D: hitbox,
      hoverable: true,
      clickable: false,
    });

    this.interactives.push({ halo, haloMat, hitbox, interactable, hoverBoost: 0 });
  }

  destroyInteractives() {
    for (const it of this.interactives) {
      it.interactable.destroy(); // désenregistre du gestionnaire de picking
      this.scene.remove(it.halo);
      this.scene.remove(it.hitbox);
      it.haloMat.dispose();
    }
    this.interactives.length = 0;
  }

  setDebug() {
    const folder = this.debug.ui.addFolder("Buissons");
    // Sensibilité au vent des buissons (indépendante de l'herbe et des arbres).
    folder
      .add(this.foliageWind.uniforms.uWindAmplitude, "value", 0, 6, 0.1)
      .name("Sensibilité vent");
    // Un sous-dossier par buisson : on règle chacun indépendamment.
    this.bushes.forEach((bush, i) => {
      const sub = folder.addFolder(`Buisson ${i + 1}`).close();
      sub
        .add(bush, "x", -16, 16, 0.5)
        .name("Position X")
        .onFinishChange(() => this.build());
      sub
        .add(bush, "z", -16, 16, 0.5)
        .name("Position Z")
        .onFinishChange(() => this.build());
      sub
        .add(bush, "quads", 1, 30, 1)
        .name("Quads")
        .onFinishChange(() => this.build());
      sub
        .add(bush, "radius", 0.1, 3, 0.05)
        .name("Rayon amas")
        .onFinishChange(() => this.build());
      sub
        .add(bush, "size", 0.3, 4, 0.05)
        .name("Taille carte")
        .onFinishChange(() => this.build());
      sub
        .addColor(bush, "color")
        .name("Couleur")
        .onChange(() => this.updateColors());
    });
  }
  update() {
    this.foliageWind.update(this.time.elapsed);

    // Halos : montée/descente douce de l'opacité selon l'état de survol.
    const delta = this.time.delta || 0.016;
    for (const it of this.interactives) {
      const target = it.interactable.hovered ? 1 : 0;
      it.hoverBoost += (target - it.hoverBoost) * Math.min(1, delta * 12);
      it.haloMat.opacity = it.hoverBoost * 0.9;
    }
  }

  destroy() {
    this.destroyInteractives();
    this.hitboxGeometry.dispose();
    this.hitboxMaterial.dispose();
    this.glowTexture.dispose();
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
    }
  }
}
