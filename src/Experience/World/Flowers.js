import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import WorldComponent from "./WorldComponent.js";
import FoliageWind from "./FoliageWind.js";

// On RÉUTILISE le shader des buissons (billboard + alpha cutout + éclairage jour/nuit
// + vent), exactement comme Tree.js le fait pour son feuillage.
import bushVertexShader from "../../shaders/bush/vertex.glsl";
import bushFragmentShader from "../../shaders/bush/fragment.glsl";

/**
 * FLOWERS — fleurs DISPERSÉES dans l'herbe (comme l'herbe : MeshSurfaceSampler +
 * masque de densité), mais RENDUES comme les buissons : chaque fleur est UNE carte
 * texturée (quad billboard face caméra), découpée par alpha, dans un seul InstancedMesh.
 *
 * Hybride : dispersion de Grass.js + rendu de Bush.js.
 */
export default class Flowers extends WorldComponent {
  constructor(terrain, wind, environment) {
    super();

    this.terrain = terrain;
    this.wind = wind;
    this.environment = environment;

    // Densité FAIBLE (des fleurs ponctuelles dans l'herbe, pas un tapis).
    this.params = {
      count: 1000, // nombre de fleurs visées
      size: 0.1, // taille d'une carte de fleur
      heightOffset: 0.36, // remonte les fleurs au-dessus du sol (elles émergent de l'herbe)
    };

    // Palette de teintes : chaque fleur en pioche une (le shader buisson fait
    // vColor * tex.r, donc la texture est traitée comme masque/ombrage et la
    // couleur vient d'ici). Fournir des PNG clairs/blancs pour de vraies couleurs.
    this.colors = ["#f4d35e", "#ee6c9c", "#e0a3ab", "#c98bb0", "#f6f5f0"];

    // Masque de densité : mêmes réglages que l'herbe (les fleurs suivent l'herbe).
    this.maskParams = {
      enabled: true,
      url: "/textures/grass-mask.png",
      blackThreshold: 0.25,
      whiteThreshold: 0.75,
      grayDensity: 0.2, // proba de garder une fleur tirée en zone grise
      flipU: false,
      flipV: false,
      swapUV: false,
    };
    this.maskData = null;
    this.maskW = 0;
    this.maskH = 0;

    // Cartes de fleurs : chaque fleur en pioche UNE au hasard. Toutes doivent avoir
    // la MÊME taille. Empilées dans une DataArrayTexture (sampler2DArray) -> 1 draw call.
    // IMPORTANT : PNG avec VRAIE transparence (canal alpha), le shader découpe via alphaTest.
    // La texture est traitée en niveaux de gris (canal rouge) par le shader buisson :
    // la couleur vient de la palette `this.colors`, pas de la texture.
    this.flowerUrls = ["/textures/flower1.png"];
    this.textureArray = null;

    // Outils réutilisés (évite d'allouer à chaque fleur).
    this.dummy = new THREE.Object3D();
    this.samplePos = new THREE.Vector3();
    this._color = new THREE.Color();
    this.instancedMesh = null;

    this.bladeGeometry = new THREE.PlaneGeometry(1, 1); // UV déjà en [0,1]
    this.foliageWind = new FoliageWind(this.wind, 0.03); // sensibilité au vent des fleurs

    this.setMaterial();
    this.loadTextures(); // charge le tableau de textures PUIS appelle build()
    this.loadMask(); // charge le masque PUIS rappelle build()
    this.setSubscriptions();
    this.setDebug();
  }

  setMaterial() {
    // Comme les buissons : alphaTest (discard) plutôt que transparence -> rendu OPAQUE.
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, // requis pour sampler2DArray
      vertexShader: bushVertexShader,
      fragmentShader: bushFragmentShader,
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
      uniforms: {
        uSunDirection: { value: this.environment.sunDirection },
        uAmbientLight: { value: this.environment.ambientIntensity },
        uLeafTexture: { value: null }, // cartes de fleurs (rempli par loadTextures)
        ...this.foliageWind.uniforms, // uTime / uWindStrength / uWindDirection / uWindAmplitude
      },
    });
  }

  // Charge les N PNG, les empile dans UNE DataArrayTexture, puis (re)construit le mesh.
  loadTextures() {
    const loader = new THREE.ImageLoader();
    const images = new Array(this.flowerUrls.length);
    let loaded = 0;
    this.flowerUrls.forEach((url, i) => {
      loader.load(url, (img) => {
        images[i] = img;
        if (++loaded === this.flowerUrls.length) this.buildTextureArray(images);
      });
    });
  }

  buildTextureArray(images) {
    const w = images[0].width;
    const h = images[0].height;
    const depth = images.length;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    const data = new Uint8Array(w * h * 4 * depth);
    for (let i = 0; i < depth; i++) {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(images[i], 0, 0, w, h); // force la même taille pour toutes
      const pixels = ctx.getImageData(0, 0, w, h).data;
      data.set(pixels, i * w * h * 4);
    }

    const tex = new THREE.DataArrayTexture(data, w, h, depth);
    tex.format = THREE.RGBAFormat;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    this.textureArray = tex;
    this.material.uniforms.uLeafTexture.value = tex;
    this.build();
  }

  // Chargement du masque de densité (identique à Grass.loadMask).
  loadMask() {
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
        this.build(); // le masque est prêt : on replace les fleurs
      },
      undefined,
      () => {
        /* masque absent : on laisse les fleurs partout (maskData reste null) */
      },
    );
  }

  // Renvoie "none" / "short" / "full" selon la luminance du masque (identique à Grass).
  sampleZone(pos) {
    if (!this.maskParams.enabled || !this.maskData) return "full";
    const size = this.terrain.params.size;
    let u = (pos.x + size / 2) / size;
    let v = (pos.z + size / 2) / size;

    if (this.maskParams.swapUV) [u, v] = [v, u];
    if (this.maskParams.flipU) u = 1 - u;
    if (this.maskParams.flipV) v = 1 - v;

    const px = Math.min(this.maskW - 1, Math.max(0, Math.floor(u * this.maskW)));
    const py = Math.min(this.maskH - 1, Math.max(0, Math.floor(v * this.maskH)));
    const lum = this.maskData[(py * this.maskW + px) * 4] / 255;

    if (lum < this.maskParams.blackThreshold) return "none";
    if (lum < this.maskParams.whiteThreshold) return "short";
    return "full";
  }

  // (Re)construit l'InstancedMesh des fleurs : dispersion façon herbe, rendu façon buisson.
  build() {
    // On attend que la texture soit prête (loadTextures appelle build après coup).
    if (!this.textureArray) return;

    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
    }

    const sampler = new MeshSurfaceSampler(this.terrain.mesh).build();
    const count = this.params.count;

    this.instancedMesh = new THREE.InstancedMesh(
      this.bladeGeometry,
      this.material,
      count,
    );

    const sphericalNormals = new Float32Array(count * 3);
    const instanceColors = new Float32Array(count * 3);
    const textureIndices = new Float32Array(count);
    const windFactors = new Float32Array(count * 2);

    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 30; // garde anti-boucle infinie si masque trop restrictif

    while (placed < count && attempts < maxAttempts) {
      attempts++;
      sampler.sample(this.samplePos);

      const zone = this.sampleZone(this.samplePos);
      // Fleurs UNIQUEMENT dans l'herbe pleine (zone "full") : pas de fleur en
      // zone "none" (noir) ni en herbe courte (gris).
      if (zone !== "full") continue;

      // Position sur le terrain, base relevée pour poser la carte au sol,
      // + un décalage pour que les fleurs émergent de l'herbe (pas collées au sol).
      const s = this.params.size * (0.7 + 0.5 * Math.random());
      this.dummy.position.copy(this.samplePos);
      this.dummy.position.y += s * 0.5 + this.params.heightOffset;
      this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0); // yaw aléatoire
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(placed, this.dummy.matrix);

      // Normale sphérique vers le haut : éclairage simple pour une carte unique.
      sphericalNormals[placed * 3] = 0;
      sphericalNormals[placed * 3 + 1] = 1;
      sphericalNormals[placed * 3 + 2] = 0;

      // Teinte piochée dans la palette.
      this._color.set(this.colors[(Math.random() * this.colors.length) | 0]);
      instanceColors[placed * 3] = this._color.r;
      instanceColors[placed * 3 + 1] = this._color.g;
      instanceColors[placed * 3 + 2] = this._color.b;

      // Carte de fleur aléatoire.
      textureIndices[placed] = (Math.random() * this.flowerUrls.length) | 0;

      // Vent : le haut de la carte oscille (amplitude 1), déphasage aléatoire.
      windFactors[placed * 2] = 1;
      windFactors[placed * 2 + 1] = Math.random() * Math.PI * 2;

      placed++;
    }

    this.bladeGeometry.setAttribute(
      "aSphericalNormal",
      new THREE.InstancedBufferAttribute(sphericalNormals, 3),
    );
    this.bladeGeometry.setAttribute(
      "aColor",
      new THREE.InstancedBufferAttribute(instanceColors, 3),
    );
    this.bladeGeometry.setAttribute(
      "aTextureIndex",
      new THREE.InstancedBufferAttribute(textureIndices, 1),
    );
    this.bladeGeometry.setAttribute(
      "aWind",
      new THREE.InstancedBufferAttribute(windFactors, 2),
    );

    this.instancedMesh.count = placed; // ne rend que les fleurs effectivement placées
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.instancedMesh);
  }

  setSubscriptions() {
    // Le terrain change de taille/relief -> on replace les fleurs.
    this.terrain.on("rebuilt", () => this.build());
    this.terrain.on("resampled", () => this.build());
    // L'abonnement au vent (force) est géré par FoliageWind.
  }

  setDebug() {
    const folder = this.debug.ui.addFolder("Fleurs").close();
    folder
      .add(this.params, "count", 0, 10000, 100)
      .name("Densité")
      .onFinishChange(() => this.build());
    folder
      .add(this.params, "size", 0.1, 1.5, 0.05)
      .name("Taille")
      .onFinishChange(() => this.build());
    folder
      .add(this.params, "heightOffset", 0, 1, 0.01)
      .name("Hauteur sol")
      .onFinishChange(() => this.build());
    folder
      .add(this.foliageWind.uniforms.uWindAmplitude, "value", 0, 6, 0.1)
      .name("Sensibilité vent");
  }

  update() {
    this.foliageWind.update(this.time.elapsed);
  }
}
